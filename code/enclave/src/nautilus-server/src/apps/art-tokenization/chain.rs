use super::ledger::Pending;
use super::{err, sui_address};
use crate::EnclaveError;
use fastcrypto::ed25519::Ed25519KeyPair;
use fastcrypto::encoding::{Base64, Encoding, Hex};
use fastcrypto::traits::{KeyPair, ToFromBytes};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::{Mutex, MutexGuard};
use std::time::Duration;
use sui_crypto::ed25519::Ed25519PrivateKey;
use sui_crypto::SuiSigner;
use sui_sdk_types::{
    Address, Argument, Command, Digest, GasPayment, Identifier, Input, MoveCall, ObjectReference,
    ProgrammableTransaction, StructTag, Transaction, TransactionExpiration, TransactionKind, TypeTag,
};

const REPORT_GAS_BUDGET: u64 = 50_000_000;
const REGISTER_GAS_BUDGET: u64 = 200_000_000;
const SIMULATION_GAS_BUDGET: u64 = 10_000_000;
const PRUNE_GAS_BUDGET: u64 = 50_000_000;
// Διαγραφή αντικειμένων enclave ανά συναλλαγή
const PRUNE_BATCH: usize = 50;

const CLOCK: &str = "0x6";
const CLOCK_INITIAL_VERSION: u64 = 1;

const SUI_COIN_TYPE: &str = "0x2::coin::Coin<0x2::sui::SUI>";

#[derive(Debug, Clone)]
pub struct ChainConfig {
    pub graphql_url: String,
    // Ο χρήστης πληρώνει gas αλλιώς πληρώνει το εφήμερο κλειδί
    pub payer_seed: Option<[u8; 32]>,
    // Η πιο πρόσφατη έκδοση του πακέτου
    pub package_id: Address,
    // Διεύθυνση της πρώτης έκδοσης του πακέτου
    pub original_package_id: Address,
    pub source_registry: Address,
    pub enclave_config: Address,
    pub channel_policy: Address,
    pub channel_stats: Address,
}

impl ChainConfig {
    pub fn from_env() -> Result<Option<Self>, EnclaveError> {
        let get = |k: &str| std::env::var(k).ok().filter(|v| !v.trim().is_empty());
        let Some(graphql_url) = get("GRAPHQL_URL") else { return Ok(None) };
        let addr = |k: &str| -> Result<Address, EnclaveError> {
            let v = get(k).ok_or_else(|| err(format!("{k} is not set")))?;
            Address::from_hex(v.trim()).map_err(|e| err(format!("{k} is not an address: {e}")))
        };
        let payer_seed = match get("PAYER_KEY_SEED_HEX") {
            None => None,
            Some(hex) => {
                let bytes = Hex::decode(hex.trim())
                    .map_err(|e| err(format!("PAYER_KEY_SEED_HEX is not hex: {e}")))?;
                Some(bytes.try_into().map_err(|_| err("PAYER_KEY_SEED_HEX must be 32 bytes"))?)
            }
        };
        Ok(Some(Self {
            graphql_url,
            payer_seed,
            package_id: addr("PACKAGE_ID")?,
            original_package_id: addr("ORIGINAL_PACKAGE_ID")?,
            source_registry: addr("SOURCE_REGISTRY")?,
            enclave_config: addr("ENCLAVE_CONFIG")?,
            channel_policy: addr("CHANNEL_POLICY")?,
            channel_stats: addr("CHANNEL_STATS")?,
        }))
    }
}

#[derive(Default)]
struct Cache {
    initial_shared_version: HashMap<Address, u64>,
    report_log: HashMap<Address, Address>,
}

pub struct Chain {
    pub config: ChainConfig,
    client: reqwest::Client,
    signer: Ed25519PrivateKey,
    pub address: Address,
    cache: Mutex<Cache>,
}

impl Chain {
    // Το δανεικό πορτοφόλι πληρώνει αλλιώς το εφήμερο
    pub fn new(config: ChainConfig, eph_kp: &Ed25519KeyPair) -> Result<Self, EnclaveError> {
        let (seed, address) = match config.payer_seed {
            Some(seed) => {
                let kp = Ed25519KeyPair::from_bytes(&seed).map_err(|e| err(format!("bad payer seed: {e}")))?;
                (seed, sui_address(kp.public()))
            }
            None => {
                let seed = eph_kp.as_ref().try_into().map_err(|_| err("the enclave key is not 32 bytes"))?;
                (seed, sui_address(eph_kp.public()))
            }
        };
        let signer = Ed25519PrivateKey::new(seed);
        let client = reqwest::Client::builder()
            .timeout(Duration::from_secs(30))
            .build()
            .map_err(|e| err(format!("could not build the HTTP client: {e}")))?;
        Ok(Self {
            config,
            client,
            signer,
            address: Address::new(address),
            cache: Mutex::default(),
        })
    }

    pub fn payer(&self) -> &'static str {
        if self.config.payer_seed.is_some() { "lent wallet" } else { "ephemeral key" }
    }

    fn cache(&self) -> Result<MutexGuard<'_, Cache>, EnclaveError> {
        self.cache.lock().map_err(|e| err(format!("chain cache lock poisoned: {e}")))
    }

    async fn gql(&self, query: &str, variables: Value) -> Result<Value, EnclaveError> {
        let response = self
            .client
            .post(&self.config.graphql_url)
            .json(&json!({"query": query, "variables": variables}))
            .send()
            .await
            .map_err(|e| err(format!("GraphQL request failed: {e}")))?;
        let value: Value = response
            .json()
            .await
            .map_err(|e| err(format!("GraphQL response is not JSON: {e}")))?;
        if let Some(errors) = value.get("errors").and_then(Value::as_array).filter(|e| !e.is_empty()) {
            let messages: Vec<String> = errors
                .iter()
                .map(|e| e.get("message").and_then(Value::as_str).unwrap_or("?").to_string())
                .collect();
            return Err(err(format!("GraphQL: {}", messages.join("; "))));
        }
        value.get("data").cloned().ok_or_else(|| err("GraphQL response has no data"))
    }

    async fn initial_shared_version(&self, id: Address) -> Result<u64, EnclaveError> {
        if let Some(v) = self.cache()?.initial_shared_version.get(&id) {
            return Ok(*v);
        }
        let data = self
            .gql(
                "query($id: SuiAddress!) { object(address: $id) { owner { __typename ... on Shared { initialSharedVersion } } } }",
                json!({"id": id.to_string()}),
            )
            .await?;
        let version = parse_initial_shared_version(&data).ok_or_else(|| err(format!("{id} is not a shared object")))?;
        self.cache()?.initial_shared_version.insert(id, version);
        Ok(version)
    }

    async fn shared(&self, id: Address, mutable: bool) -> Result<Input, EnclaveError> {
        Ok(Input::Shared {
            object_id: id,
            initial_shared_version: self.initial_shared_version(id).await?,
            mutable,
        })
    }

    fn clock() -> Input {
        Input::Shared {
            object_id: Address::from_hex(CLOCK).expect("constant"),
            initial_shared_version: CLOCK_INITIAL_VERSION,
            mutable: false,
        }
    }

    async fn reference_gas_price(&self) -> Result<u64, EnclaveError> {
        let data = self.gql("{ epoch { referenceGasPrice } }", json!({})).await?;
        data.pointer("/epoch/referenceGasPrice")
            .and_then(as_u64)
            .ok_or_else(|| err("reference gas price is not a number"))
    }

    async fn gas_coin(&self) -> Result<ObjectReference, EnclaveError> {
        let data = self
            .gql(
                "query($owner: SuiAddress!, $type: String!) { address(address: $owner) { objects(first: 50, filter: {type: $type}) { nodes { address version digest contents { json } } } } }",
                json!({"owner": self.address.to_string(), "type": SUI_COIN_TYPE}),
            )
            .await?;
        parse_richest_coin(&data)?
            .ok_or_else(|| err(format!("the enclave address {} holds no SUI; fund it to let it submit", self.address)))
    }

    fn ident(s: &str) -> Identifier {
        Identifier::new(s).expect("valid identifier")
    }

    fn type_tag(&self, package: Address, module: &str, name: &str) -> TypeTag {
        TypeTag::Struct(Box::new(StructTag::new(package, Self::ident(module), Self::ident(name), vec![])))
    }

    async fn transaction(&self, ptb: ProgrammableTransaction, budget: u64) -> Result<Transaction, EnclaveError> {
        Ok(Transaction {
            kind: TransactionKind::ProgrammableTransaction(ptb),
            sender: self.address,
            gas_payment: GasPayment {
                objects: vec![self.gas_coin().await?],
                owner: self.address,
                price: self.reference_gas_price().await?,
                budget,
            },
            expiration: TransactionExpiration::None,
        })
    }

    fn unfunded(&self, ptb: ProgrammableTransaction) -> Transaction {
        Transaction {
            kind: TransactionKind::ProgrammableTransaction(ptb),
            sender: self.address,
            gas_payment: GasPayment {
                objects: vec![],
                owner: self.address,
                price: 1000,
                budget: SIMULATION_GAS_BUDGET,
            },
            expiration: TransactionExpiration::None,
        }
    }

    async fn execute(&self, tx: Transaction) -> Result<(String, Vec<(Address, String)>), EnclaveError> {
        let bytes = bcs::to_bytes(&tx).map_err(|e| err(format!("could not serialise the transaction: {e}")))?;
        let signature = self
            .signer
            .sign_transaction(&tx)
            .map_err(|e| err(format!("could not sign the transaction: {e}")))?;
        let data = self
            .gql(
                "mutation($tx: Base64!, $sigs: [Base64!]!) { executeTransaction(transactionDataBcs: $tx, signatures: $sigs) { effects { digest status executionError { message } objectChanges(first: 50) { nodes { address idCreated outputState { asMoveObject { contents { type { repr } } } } } } } } }",
                json!({"tx": Base64::encode(&bytes), "sigs": [signature.to_base64()]}),
            )
            .await?;
        parse_execution(&data)
    }

    pub async fn is_active(&self, source: [u8; 32]) -> Result<bool, EnclaveError> {
        let registry = self.shared(self.config.source_registry, false).await?;
        let ptb = ProgrammableTransaction {
            inputs: vec![registry, Input::Pure { value: source.to_vec() }],
            commands: vec![Command::MoveCall(MoveCall {
                package: self.config.package_id,
                module: Self::ident("registry"),
                function: Self::ident("is_active"),
                type_arguments: vec![self.type_tag(self.config.original_package_id, "registry", "Source")],
                arguments: vec![Argument::Input(0), Argument::Input(1)],
            })],
        };
        let bytes = bcs::to_bytes(&self.unfunded(ptb)).map_err(err)?;
        let data = self
            .gql(
                "query($tx: JSON!) { simulateTransaction(transaction: $tx, checksEnabled: false, doGasSelection: true) { effects { status executionError { message } } outputs { returnValues { value { json } } } } }",
                json!({"tx": {"bcs": {"value": Base64::encode(&bytes)}}}),
            )
            .await?;
        parse_bool_return(&data)
    }

    pub async fn policy(&self) -> Result<Policy, EnclaveError> {
        let policy = self.config.channel_policy;
        let data = self
            .gql(
                "query($id: SuiAddress!) { object(address: $id) { asMoveObject { contents { json } } } }",
                json!({"id": policy.to_string()}),
            )
            .await?;
        let window_ms = parse_window_ms(&data).ok_or_else(|| err(format!("{policy} has no window_ms field")))?;
        Ok(Policy { window_ms, accepted_enclave: parse_accepted_enclave(&data) })
    }

    // Αντικείμενα enclave που έχει εγγράψει αυτή η διεύθυνση
    pub async fn own_registrations(&self) -> Result<Vec<Address>, EnclaveError> {
        let enclave_type = format!(
            "{}::enclave::Enclave<{}::report::ReportChannel>",
            self.config.original_package_id, self.config.original_package_id
        );
        let mut out = Vec::new();
        let mut cursor: Option<String> = None;
        loop {
            let data = self
                .gql(
                    "query($type: String!, $after: String) { objects(first: 50, after: $after, filter: {type: $type}) { pageInfo { hasNextPage endCursor } nodes { address contents { json } } } }",
                    json!({"type": enclave_type, "after": cursor}),
                )
                .await?;
            let (mut page, next) = parse_owned_enclaves(&data, self.address);
            out.append(&mut page);
            match next {
                Some(c) => cursor = Some(c),
                None => break,
            }
        }
        Ok(out)
    }

    pub async fn destroy_registrations(&self, ids: &[Address]) -> Result<Vec<String>, EnclaveError> {
        let mut digests = Vec::new();
        for batch in ids.chunks(PRUNE_BATCH) {
            let mut inputs = Vec::with_capacity(batch.len());
            for id in batch {
                inputs.push(self.shared(*id, true).await?);
            }
            let commands = (0..batch.len() as u16)
                .map(|i| {
                    Command::MoveCall(MoveCall {
                        package: self.config.package_id,
                        module: Self::ident("enclave"),
                        function: Self::ident("deploy_old_enclave_by_owner"),
                        type_arguments: vec![self.type_tag(self.config.original_package_id, "report", "ReportChannel")],
                        arguments: vec![Argument::Input(i)],
                    })
                })
                .collect();
            let tx = self.transaction(ProgrammableTransaction { inputs, commands }, PRUNE_GAS_BUDGET).await?;
            let (digest, _) = self.execute(tx).await?;
            digests.push(digest);
        }
        Ok(digests)
    }

    pub async fn register(&self, attestation: &[u8]) -> Result<(String, Address), EnclaveError> {
        let config = self.shared(self.config.enclave_config, false).await?;
        let ptb = ProgrammableTransaction {
            inputs: vec![
                Input::Pure { value: bcs::to_bytes(attestation).map_err(err)? },
                Self::clock(),
                config,
            ],
            commands: vec![
                Command::MoveCall(MoveCall {
                    package: Address::from_hex("0x2").expect("constant"),
                    module: Self::ident("nitro_attestation"),
                    function: Self::ident("load_nitro_attestation"),
                    type_arguments: vec![],
                    arguments: vec![Argument::Input(0), Argument::Input(1)],
                }),
                Command::MoveCall(MoveCall {
                    package: self.config.package_id,
                    module: Self::ident("enclave"),
                    function: Self::ident("register_enclave"),
                    type_arguments: vec![self.type_tag(self.config.original_package_id, "report", "ReportChannel")],
                    arguments: vec![Argument::Input(2), Argument::Result(0)],
                }),
            ],
        };
        let tx = self.transaction(ptb, REGISTER_GAS_BUDGET).await?;
        let (digest, created) = self.execute(tx).await?;
        let enclave = created
            .into_iter()
            .find(|(_, t)| t.contains("::enclave::Enclave<"))
            .map(|(id, _)| id)
            .ok_or_else(|| err("registration succeeded but no Enclave object was created"))?;
        Ok((digest, enclave))
    }

    pub async fn report_log(&self, artwork: Address) -> Result<Address, EnclaveError> {
        if let Some(log) = self.cache()?.report_log.get(&artwork) {
            return Ok(*log);
        }
        let key_type = format!("{}::custody::CustodyKey", self.config.original_package_id);
        let data = self
            .gql(
                "query($id: SuiAddress!, $type: String!) { object(address: $id) { dynamicObjectField(name: {type: $type, bcs: \"AA==\"}) { value { ... on MoveObject { contents { json } } } } } }",
                json!({"id": artwork.to_string(), "type": key_type}),
            )
            .await?;
        let log = parse_report_log(&data)
            .ok_or_else(|| err(format!("{artwork} has no custody record, so no report log: was it ever taken into custody?")))?;
        self.cache()?.report_log.insert(artwork, log);
        Ok(log)
    }

    pub async fn record_report(&self, enclave_object: Address, report: &Pending) -> Result<String, EnclaveError> {
        let Pending { payload, attested_at, signature, .. } = report;
        let signature = Hex::decode(signature).map_err(|e| err(format!("bad signature hex: {e}")))?;
        let artwork_id = Address::new(payload.artwork);
        let log = self.report_log(artwork_id).await?;
        let inputs = vec![
            self.shared(artwork_id, false).await?,
            self.shared(log, true).await?,
            self.shared(self.config.channel_stats, true).await?,
            self.shared(self.config.source_registry, false).await?,
            self.shared(self.config.channel_policy, false).await?,
            self.shared(self.config.enclave_config, false).await?,
            self.shared(enclave_object, false).await?,
            Input::Pure { value: payload.source.to_vec() },
            Input::Pure { value: vec![payload.condition] },
            Input::Pure { value: bcs::to_bytes(&payload.readings).map_err(err)? },
            Input::Pure { value: bcs::to_bytes(attested_at).map_err(err)? },
            Input::Pure { value: bcs::to_bytes(&signature).map_err(err)? },
            Self::clock(),
        ];
        let ptb = ProgrammableTransaction {
            inputs,
            commands: vec![Command::MoveCall(MoveCall {
                package: self.config.package_id,
                module: Self::ident("report"),
                function: Self::ident("record_report"),
                type_arguments: vec![],
                arguments: (0..13u16).map(Argument::Input).collect(),
            })],
        };
        let tx = self.transaction(ptb, REPORT_GAS_BUDGET).await?;
        let (digest, _) = self.execute(tx).await?;
        Ok(digest)
    }
}

// Το GraphQL επιστρέφει τα u64 ως string
fn as_u64(v: &Value) -> Option<u64> {
    v.as_u64().or_else(|| v.as_str()?.parse().ok())
}

fn parse_report_log(data: &Value) -> Option<Address> {
    let id = data.pointer("/object/dynamicObjectField/value/contents/json/report_log")?.as_str()?;
    Address::from_hex(id).ok()
}

#[derive(Debug, Clone)]
pub struct Policy {
    pub window_ms: u64,
    pub accepted_enclave: Option<Address>,
}

fn parse_accepted_enclave(data: &Value) -> Option<Address> {
    let v = data.pointer("/object/asMoveObject/contents/json/accepted_enclave")?;
    Address::from_hex(v.as_str()?).ok()
}

fn parse_owned_enclaves(data: &Value, owner: Address) -> (Vec<Address>, Option<String>) {
    let owner = owner.to_string().to_lowercase();
    let nodes = data.pointer("/objects/nodes").and_then(Value::as_array).cloned().unwrap_or_default();
    let ids = nodes
        .iter()
        .filter(|n| {
            n.pointer("/contents/json/owner")
                .and_then(Value::as_str)
                .map(|o| o.to_lowercase() == owner)
                .unwrap_or(false)
        })
        .filter_map(|n| Address::from_hex(n.get("address")?.as_str()?).ok())
        .collect();
    let next = data
        .pointer("/objects/pageInfo")
        .filter(|p| p.get("hasNextPage").and_then(Value::as_bool) == Some(true))
        .and_then(|p| p.get("endCursor")?.as_str().map(str::to_string));
    (ids, next)
}

fn parse_window_ms(data: &Value) -> Option<u64> {
    as_u64(data.pointer("/object/asMoveObject/contents/json/window_ms")?)
}

fn parse_initial_shared_version(data: &Value) -> Option<u64> {
    let owner = data.pointer("/object/owner")?;
    if owner.get("__typename")?.as_str()? != "Shared" {
        return None;
    }
    as_u64(owner.get("initialSharedVersion")?)
}

fn parse_richest_coin(data: &Value) -> Result<Option<ObjectReference>, EnclaveError> {
    let nodes = data
        .pointer("/address/objects/nodes")
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let balance = |c: &Value| c.pointer("/contents/json/balance").and_then(as_u64).unwrap_or(0);
    let Some(best) = nodes.iter().filter(|c| balance(c) > 0).max_by_key(|c| balance(c)) else {
        return Ok(None);
    };
    let id = Address::from_hex(best["address"].as_str().unwrap_or_default()).map_err(err)?;
    let version = as_u64(&best["version"]).ok_or_else(|| err("coin has no version"))?;
    let digest = Digest::from_base58(best["digest"].as_str().unwrap_or_default()).map_err(err)?;
    Ok(Some(ObjectReference::new(id, version, digest)))
}

fn parse_execution(data: &Value) -> Result<(String, Vec<(Address, String)>), EnclaveError> {
    let effects = data
        .pointer("/executeTransaction/effects")
        .ok_or_else(|| err("execution returned no effects"))?;
    let status = effects.get("status").and_then(Value::as_str).unwrap_or("unknown");
    if status != "SUCCESS" {
        let error = effects
            .pointer("/executionError/message")
            .and_then(Value::as_str)
            .unwrap_or("no error text");
        return Err(err(format!("transaction failed on chain: {error}")));
    }
    let digest = effects.get("digest").and_then(Value::as_str).unwrap_or_default().to_string();
    let created = effects
        .pointer("/objectChanges/nodes")
        .and_then(Value::as_array)
        .map(|nodes| {
            nodes
                .iter()
                .filter(|n| n.get("idCreated").and_then(Value::as_bool) == Some(true))
                .filter_map(|n| {
                    let id = Address::from_hex(n.get("address")?.as_str()?).ok()?;
                    let t = n.pointer("/outputState/asMoveObject/contents/type/repr")?.as_str()?.to_string();
                    Some((id, t))
                })
                .collect()
        })
        .unwrap_or_default();
    Ok((digest, created))
}

fn parse_bool_return(data: &Value) -> Result<bool, EnclaveError> {
    let sim = data.get("simulateTransaction").ok_or_else(|| err("simulation returned nothing"))?;
    if sim.pointer("/effects/status").and_then(Value::as_str) != Some("SUCCESS") {
        let error = sim
            .pointer("/effects/executionError/message")
            .and_then(Value::as_str)
            .unwrap_or("no error text");
        return Err(err(format!("simulation failed: {error}")));
    }
    sim.pointer("/outputs/0/returnValues/0/value/json")
        .and_then(Value::as_bool)
        .ok_or_else(|| err("simulation returned no bool"))
}
