use super::chain::{Chain, ChainConfig};
use super::ledger::{Ledger, LEDGER};
use super::{address_hex, close_window, err, now_ms};
use crate::{AppState, EnclaveError};
use fastcrypto::traits::{KeyPair, ToFromBytes};
use std::sync::{Arc, OnceLock};
use std::time::Duration;
use sui_sdk_types::Address;
use tracing::{info, warn};

const TICK: Duration = Duration::from_secs(5);

// Αντίστοιχο του FRESHNESS_WINDOW_MS στο report.move
const FRESHNESS_WINDOW_MS: u64 = 300_000;

static CHAIN: OnceLock<Option<Arc<Chain>>> = OnceLock::new();

pub(super) fn chain() -> Option<Arc<Chain>> {
    CHAIN.get().and_then(Clone::clone)
}

pub async fn spawn_scheduler(state: Arc<AppState>) -> Result<(), EnclaveError> {
    let chain = match ChainConfig::from_env()? {
        Some(config) => {
            let chain = Chain::new(config, &state.eph_kp)?;
            info!("chain configured at {}, paying from {} ({})", chain.config.graphql_url, chain.address, chain.payer());
            Some(Arc::new(chain))
        }
        None => {
            info!("no GRAPHQL_URL: running without a chain, an external relayer submits");
            None
        }
    };
    CHAIN.set(chain).map_err(|_| err("scheduler started twice"))?;
    tokio::spawn(async move {
        loop {
            if let Err(e) = tick(&state, &LEDGER).await {
                warn!("scheduler tick failed: {e}");
            }
            tokio::time::sleep(TICK).await;
        }
    });
    Ok(())
}

// Ένα πέρασμα: ανανέωση πολιτικής, κλείσιμο παραθύρων, εγγραφή, prune, υποβολή
async fn tick(state: &AppState, ledger: &Ledger) -> Result<(), EnclaveError> {
    let now = now_ms()?;
    let chain = chain();

    if let Some(chain) = &chain {
        if ledger.window_is_stale(now)? {
            match chain.policy().await {
                Ok(p) => {
                    ledger.set_window_ms(p.window_ms, now)?;
                    ledger.set_accepted(p.accepted_enclave.map(|a| a.into_inner()))?;
                }
                Err(e) => warn!("could not read the channel policy, keeping {} ms: {e}", ledger.lock()?.window()),
            }
        }
    }

    for key in ledger.expired(now)? {
        match close_window(state, ledger, key, now) {
            Ok(v) => {
                let r = &v.report.response.data;
                info!("closed window {} / {}: {} readings, condition {}", address_hex(&key.0), address_hex(&key.1), r.readings, r.condition)
            }
            Err(e) => warn!("could not close an expired window: {e}"),
        }
    }

    let Some(chain) = chain else { return Ok(()) };
    let Some(enclave_object) = ensure_registered(&chain, ledger, state.eph_kp.public().as_bytes()).await? else {
        return Ok(());
    };

    if ledger.take_prune_check(enclave_object)? {
        match prune(&chain, ledger, enclave_object).await {
            Ok(0) => info!("no older registrations to delete"),
            Ok(n) => info!("deleted {n} older registrations of this wallet"),
            Err(e) => warn!("could not delete older registrations: {e}"),
        }
    }

    submit_pending(&chain, ledger, enclave_object, now).await
}

async fn ensure_registered(chain: &Chain, ledger: &Ledger, public_key: &[u8]) -> Result<Option<[u8; 32]>, EnclaveError> {
    if let Some(e) = ledger.lock()?.enclave_object {
        return Ok(Some(e));
    }
    let attestation = attestation_document(public_key)?;
    match chain.register(&attestation).await {
        Ok((digest, object)) => {
            let bytes = object.into_inner();
            let mut inner = ledger.lock()?;
            inner.enclave_object = Some(bytes);
            inner.registered_by = Some(digest.clone());
            info!("registered as Enclave object {} in {digest}", address_hex(&bytes));
            Ok(Some(bytes))
        }
        Err(e) => {
            if !ledger.lock()?.pending.is_empty() {
                warn!("not registered yet, reports wait: {e}");
            }
            Ok(None)
        }
    }
}

// Παλαιότερες εγγραφές που πληρώθηκαν από αυτό το πορτοφόλι αποτελούν περιττό βάρος
async fn prune(chain: &Chain, ledger: &Ledger, me: [u8; 32]) -> Result<usize, EnclaveError> {
    let targets: Vec<Address> = chain.own_registrations().await?.into_iter().filter(|id| id.into_inner() != me).collect();
    for digest in chain.destroy_registrations(&targets).await? {
        info!("deleted older registrations in {digest}");
    }
    ledger.mark_pruned(targets.len())?;
    Ok(targets.len())
}

async fn submit_pending(chain: &Chain, ledger: &Ledger, enclave_object: [u8; 32], now: u64) -> Result<(), EnclaveError> {
    let mut failed = Vec::new();
    for mut p in ledger.take_pending()? {
        match chain.record_report(Address::new(enclave_object), &p).await {
            Ok(digest) => {
                info!("recorded report for {} in {digest}", address_hex(&p.payload.source));
                ledger.mark_submitted(&p, &digest)?;
            }
            Err(e) => {
                p.attempts += 1;
                p.last_error = Some(e.to_string());
                if now > p.attested_at + FRESHNESS_WINDOW_MS {
                    warn!("dropping a report the chain would refuse as stale: {e}");
                } else {
                    warn!("report submission failed (attempt {}): {e}", p.attempts);
                    failed.push(p);
                }
            }
        }
    }
    ledger.requeue(failed)
}

fn attestation_document(public_key: &[u8]) -> Result<Vec<u8>, EnclaveError> {
    use nsm_api::api::{Request as NsmRequest, Response as NsmResponse};
    use nsm_api::driver;
    let fd = driver::nsm_init();
    if fd < 0 {
        return Err(err("no NSM device: not inside a Nitro enclave"));
    }
    let request = NsmRequest::Attestation {
        user_data: None,
        nonce: None,
        public_key: Some(serde_bytes::ByteBuf::from(public_key)),
    };
    let response = driver::nsm_process_request(fd, request);
    driver::nsm_exit(fd);
    match response {
        NsmResponse::Attestation { document } => Ok(document),
        other => Err(err(format!("NSM returned {other:?}"))),
    }
}
