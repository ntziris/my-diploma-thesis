use crate::common::{to_signed_response, IntentMessage, ProcessDataRequest, ProcessedDataResponse};
use crate::{AppState, EnclaveError};
use axum::extract::State;
use axum::Json;
use fastcrypto::ed25519::Ed25519PublicKey;
use fastcrypto::encoding::{Encoding, Hex};
use fastcrypto::hash::{Blake2b256, HashFunction};
use fastcrypto::traits::{KeyPair, ToFromBytes};
use serde::{Deserialize, Serialize};
use serde_repr::{Deserialize_repr, Serialize_repr};
use std::sync::Arc;

#[path = "chain.rs"]
mod chain;
#[path = "ledger.rs"]
mod ledger;
#[path = "reading.rs"]
mod reading;
#[path = "scheduler.rs"]
mod scheduler;

pub use chain::{Chain, ChainConfig, Policy};
pub use ledger::{Accepted, Closed, Ledger, Pending, WINDOW_MS};
pub use reading::{Reading, ReportRequest};
pub use scheduler::spawn_scheduler;
use ledger::{WindowKey, LEDGER};
use reading::{authenticate, prevailing_condition};
use scheduler::chain;

// Μια διεύθυνση SUI είναι blake2b256(flag || public key)
const ED25519_FLAG: u8 = 0x00;

#[derive(Serialize_repr, Deserialize_repr, Debug)]
#[repr(u8)]
pub enum IntentScope {
    StatusReport = 0,
}

// Η σειρά των πεδίων είναι η διάταξη BCS και πρέπει να ταιριάζει με το report::ReportPayload
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ReportPayload {
    pub artwork: [u8; 32],
    pub source: [u8; 32],
    pub condition: u8,
    pub readings: u64,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct CloseRequest {
    pub source: String,
    pub artwork: String,
}

#[derive(Serialize, Deserialize)]
pub struct Verdict {
    pub report: ProcessedDataResponse<IntentMessage<ReportPayload>>,
}

#[derive(Debug, Serialize)]
pub struct Status {
    pub address: String,
    pub payer: String,
    pub enclave_address: String,
    pub public_key: String,
    pub chain: Option<String>,
    pub enclave_object: Option<String>,
    pub registered_by: Option<String>,
    pub accepted_enclave: Option<String>,
    pub pruned_registrations: Option<usize>,
    pub window_ms: u64,
    pub open_windows: Vec<Accepted>,
    pub pending: Vec<Pending>,
    pub recent: Vec<Closed>,
}

// Βοηθητικές συναρτήσεις που μοιράζονται τα υποσυστήματα

pub(crate) fn err(msg: impl std::fmt::Display) -> EnclaveError {
    EnclaveError::GenericError(msg.to_string())
}

fn address_hex(bytes: &[u8; 32]) -> String {
    format!("0x{}", Hex::encode(bytes))
}

fn sui_address(public_key: &Ed25519PublicKey) -> [u8; 32] {
    let mut flagged = vec![ED25519_FLAG];
    flagged.extend_from_slice(public_key.as_bytes());
    Blake2b256::digest(&flagged).digest
}

fn parse_hex(field: &str, value: &str, len: usize) -> Result<Vec<u8>, EnclaveError> {
    let bytes = Hex::decode(value.strip_prefix("0x").unwrap_or(value))
        .map_err(|e| err(format!("{field} is not valid hex: {e}")))?;
    if bytes.len() != len {
        return Err(err(format!("{field} must be {len} bytes, got {}", bytes.len())));
    }
    Ok(bytes)
}

// Οι μικρές διευθύνσεις γεμίζουν με μηδενικά στα αριστερά
fn parse_address(field: &str, value: &str) -> Result<[u8; 32], EnclaveError> {
    let hex = value.strip_prefix("0x").unwrap_or(value);
    if hex.is_empty() || hex.len() > 64 {
        return Err(err(format!("{field} is not a 32 byte hex address: {value}")));
    }
    Ok(parse_hex(field, &format!("{hex:0>64}"), 32)?.try_into().expect("32 bytes"))
}

fn now_ms() -> Result<u64, EnclaveError> {
    Ok(std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map_err(|e| err(format!("Failed to read the clock: {e}")))?
        .as_millis() as u64)
}

// Χειριστές αιτημάτων

pub async fn process_data(
    State(_state): State<Arc<AppState>>,
    Json(request): Json<ProcessDataRequest<ReportRequest>>,
) -> Result<Json<Accepted>, EnclaveError> {
    let now = now_ms()?;
    let (source, artwork, reading) = authenticate(request.payload, now)?;
    if !source_is_active(source, now).await? {
        return Err(err(format!("source {} is not active in the source registry", address_hex(&source))));
    }
    Ok(Json(LEDGER.accept(source, artwork, reading)?))
}

async fn source_is_active(source: [u8; 32], now: u64) -> Result<bool, EnclaveError> {
    let Some(chain) = chain() else { return Ok(true) };
    if let Some(cached) = LEDGER.cached_active(source, now)? {
        return Ok(cached);
    }
    let active = chain.is_active(source).await?;
    LEDGER.remember_active(source, active, now)?;
    Ok(active)
}

pub async fn close_window_handler(
    State(state): State<Arc<AppState>>,
    Json(request): Json<ProcessDataRequest<CloseRequest>>,
) -> Result<Json<Verdict>, EnclaveError> {
    let key = (parse_address("source", &request.payload.source)?, parse_address("artwork", &request.payload.artwork)?);
    Ok(Json(close_window(&state, &LEDGER, key, now_ms()?)?))
}

// Οι αναφορές γίνονται υπογεγραμμένη αναφορά και μπαίνουν στην ουρά
fn close_window(state: &AppState, ledger: &Ledger, key: WindowKey, now: u64) -> Result<Verdict, EnclaveError> {
    let (source, artwork) = key;
    let (opened_at, readings) = ledger.close(key, now)?;
    let payload = ReportPayload { artwork, source, condition: prevailing_condition(&readings), readings: readings.len() as u64 };
    let report = to_signed_response(&state.eph_kp, payload.clone(), now, IntentScope::StatusReport as u8);
    ledger.remember_closed(Closed {
        source: address_hex(&source),
        artwork: address_hex(&artwork),
        condition: payload.condition,
        opened_at,
        attested_at: now,
        readings: readings.len(),
        digest: None,
    })?;
    if chain().is_some() {
        ledger.enqueue(Pending { payload, attested_at: now, signature: report.signature.clone(), attempts: 0, last_error: None })?;
    }
    Ok(Verdict { report })
}

pub async fn status(State(state): State<Arc<AppState>>) -> Result<Json<Status>, EnclaveError> {
    let pk = state.eph_kp.public();
    let enclave_address = sui_address(pk);
    let chain = chain();
    let (address, payer) = match &chain {
        Some(c) => (c.address.to_string(), c.payer()),
        None => (address_hex(&enclave_address), "ephemeral key"),
    };
    let inner = LEDGER.lock()?;
    Ok(Json(Status {
        address,
        payer: payer.to_string(),
        enclave_address: address_hex(&enclave_address),
        public_key: Hex::encode(pk.as_bytes()),
        chain: chain.map(|c| c.config.graphql_url.clone()),
        enclave_object: inner.enclave_object.map(|e| address_hex(&e)),
        registered_by: inner.registered_by.clone(),
        accepted_enclave: inner.accepted_enclave.map(|e| address_hex(&e)),
        pruned_registrations: inner.pruned,
        window_ms: inner.window(),
        open_windows: inner.open_windows(),
        pending: inner.pending.clone(),
        recent: inner.recent.iter().cloned().collect(),
    }))
}

#[cfg(test)]
mod test {
    use super::ledger::ACTIVE_CACHE_MS;
    use super::reading::{DeviceReading, CLOCK_SKEW_MS, DEVICE_READING_DOMAIN, READING_MAX_AGE_MS};
    use super::*;
    use fastcrypto::ed25519::Ed25519KeyPair;
    use fastcrypto::traits::Signer;

    const ARTWORK: &str = "0x01c5e4703d8ab941c77c53ac590c7764b9e6f197cd1bb6692613a1d3df9a2564";
    const SOURCE: &str = "0xf";

    const DEVICE_SEED: [u8; 32] = [0x2A; 32];
    const DEVICE_PUBKEY: &str = "197f6b23e16c8532c6abc838facd5ea789be0c76b2920334039bfa8b3d368d61";
    const DEVICE_ADDRESS: &str = "0x13054fec7a780ab44ad5b2207b67f6d7dcc8ffc334f7443037972ab7d3ecd510";
    const READING_BCS: &str = "0101c5e4703d8ab941c77c53ac590c7764b9e6f197cd1bb6692613a1d3df9a2564\
        0107000000000000000068e5cf8b010000";
    const READING_SIG: &str = "1f30c03f5409235e52a31cd928069a7707e0b24d275d938b8039a41c841524b5\
        1eaaf8ca976e9b2e4fc8071f905e8378232703f4db1b0b8e77d109bdecb2d90f";

    const T0: u64 = 1_700_000_000_000;

    fn state() -> AppState {
        AppState { eph_kp: Ed25519KeyPair::generate(&mut rand::thread_rng()), api_key: String::new() }
    }

    fn device() -> Ed25519KeyPair {
        Ed25519KeyPair::from_bytes(&DEVICE_SEED).unwrap()
    }

    fn reading(device: &Ed25519KeyPair, artwork: &str, condition: u8, nonce: u64) -> ReportRequest {
        reading_at(device, artwork, condition, nonce, T0)
    }

    fn reading_at(device: &Ed25519KeyPair, artwork: &str, condition: u8, nonce: u64, observed_at: u64) -> ReportRequest {
        let message = bcs::to_bytes(&DeviceReading {
            domain: DEVICE_READING_DOMAIN,
            artwork: parse_address("artwork", artwork).unwrap(),
            condition,
            nonce,
            observed_at,
        })
        .unwrap();
        ReportRequest {
            public_key: Hex::encode(device.public().as_bytes()),
            artwork: artwork.to_string(),
            condition,
            nonce,
            observed_at,
            signature: Hex::encode(device.sign(&message)),
        }
    }

    fn accept_reading(ledger: &Ledger, request: ReportRequest, now: u64) -> Result<Accepted, EnclaveError> {
        let (source, artwork, reading) = authenticate(request, now)?;
        ledger.accept(source, artwork, reading)
    }

    fn key(source: &str, artwork: &str) -> WindowKey {
        (parse_address("source", source).unwrap(), parse_address("artwork", artwork).unwrap())
    }

    fn strip(s: &str) -> String {
        s.replace(char::is_whitespace, "")
    }

    #[test]
    fn report_bytes_match_the_move_payload() {
        let payload = ReportPayload {
            artwork: parse_address("artwork", ARTWORK).unwrap(),
            source: parse_address("source", SOURCE).unwrap(),
            condition: 1,
            readings: 3,
        };
        let intent_msg = IntentMessage::new(payload, 4000, IntentScope::StatusReport as u8);
        let signing_payload = bcs::to_bytes(&intent_msg).expect("should not fail");
        assert_eq!(
            Hex::encode(&signing_payload),
            strip(
                "00a00f00000000000001c5e4703d8ab941c77c53ac590c7764b9e6f197cd1bb6692613a1d3df9a2564\
                 000000000000000000000000000000000000000000000000000000000000000f010300000000000000"
            )
        );
    }

    #[test]
    fn device_message_matches_device_py() {
        let device = device();
        assert_eq!(Hex::encode(device.public().as_bytes()), DEVICE_PUBKEY);

        let request = reading(&device, ARTWORK, 1, 7);
        let message = bcs::to_bytes(&DeviceReading {
            domain: DEVICE_READING_DOMAIN,
            artwork: parse_address("artwork", ARTWORK).unwrap(),
            condition: 1,
            nonce: 7,
            observed_at: T0,
        })
        .unwrap();
        assert_eq!(Hex::encode(&message), strip(READING_BCS));
        assert_eq!(request.signature, strip(READING_SIG), "Ed25519 is deterministic, so the signatures must coincide");

        let python_signed = ReportRequest { signature: strip(READING_SIG), ..request };
        let (source, _, filed) = authenticate(python_signed, T0).unwrap();
        assert_eq!(address_hex(&source), DEVICE_ADDRESS);
        assert_eq!(filed.condition, 1);
    }

    #[test]
    fn a_claimed_address_cannot_be_expressed() {
        let honest = serde_json::to_value(reading(&device(), ARTWORK, 1, 1)).unwrap();
        assert!(serde_json::from_value::<ReportRequest>(honest.clone()).is_ok());

        let mut claimed = honest;
        claimed["source"] = serde_json::Value::String(SOURCE.to_string());
        assert!(serde_json::from_value::<ReportRequest>(claimed).is_err());
    }

    #[test]
    fn a_forged_signature_is_refused() {
        let mut request = reading(&device(), ARTWORK, 1, 1);
        request.signature = Hex::encode([0u8; 64]);
        assert!(authenticate(request, T0).is_err());

        let other = Ed25519KeyPair::generate(&mut rand::thread_rng());
        let mut request = reading(&other, ARTWORK, 1, 1);
        request.public_key = DEVICE_PUBKEY.to_string();
        assert!(authenticate(request, T0).is_err());
    }

    #[test]
    fn a_tampered_reading_is_refused() {
        let base = || reading(&device(), ARTWORK, 2, 1);

        let mut r = base();
        r.artwork = "0x2".to_string();
        assert!(authenticate(r, T0).is_err());

        let mut r = base();
        r.condition = 0;
        assert!(authenticate(r, T0).is_err());

        let mut r = base();
        r.nonce = 2;
        assert!(authenticate(r, T0).is_err());

        let mut r = base();
        r.observed_at += 1;
        assert!(authenticate(r, T0).is_err());

        assert!(authenticate(base(), T0).is_ok());
    }

    #[test]
    fn a_stale_or_future_reading_is_refused() {
        let device = device();
        let at = |observed_at: u64| reading_at(&device, ARTWORK, 1, 1, observed_at);

        assert!(authenticate(at(T0 - READING_MAX_AGE_MS - 1), T0).is_err(), "too old");
        assert!(authenticate(at(T0 - READING_MAX_AGE_MS), T0).is_ok(), "oldest accepted");
        assert!(authenticate(at(T0 + CLOCK_SKEW_MS + 1), T0).is_err(), "too far ahead");
        assert!(authenticate(at(T0 + CLOCK_SKEW_MS), T0).is_ok(), "largest skew accepted");

        let ledger = Ledger::default();
        assert!(accept_reading(&ledger, at(T0 - READING_MAX_AGE_MS - 1), T0).is_err());
    }

    #[test]
    fn a_replayed_or_reordered_nonce_is_refused() {
        let ledger = Ledger::default();
        let device = device();

        assert!(accept_reading(&ledger, reading(&device, ARTWORK, 1, 7), T0).is_ok());
        assert!(accept_reading(&ledger, reading(&device, ARTWORK, 1, 7), T0).is_err(), "replay");
        assert!(accept_reading(&ledger, reading(&device, ARTWORK, 1, 5), T0).is_err(), "reordering");
        assert!(accept_reading(&ledger, reading(&device, ARTWORK, 1, 8), T0).is_ok());

        let other = Ed25519KeyPair::generate(&mut rand::thread_rng());
        assert!(accept_reading(&ledger, reading(&other, ARTWORK, 1, 1), T0).is_ok());
    }

    #[test]
    fn an_unknown_condition_is_refused() {
        assert!(authenticate(reading(&device(), ARTWORK, 9, 1), T0).is_err());
    }

    #[test]
    fn malformed_keys_and_signatures_are_refused() {
        let mut r = reading(&device(), ARTWORK, 0, 1);
        r.public_key = "abcd".to_string();
        assert!(authenticate(r, T0).is_err());

        let mut r = reading(&device(), ARTWORK, 0, 1);
        r.signature = "zz".to_string();
        assert!(authenticate(r, T0).is_err());
    }

    #[test]
    fn a_window_closes_into_one_signed_report() {
        let ledger = Ledger::default();
        let state = state();
        let device = device();

        let a = accept_reading(&ledger, reading(&device, ARTWORK, 1, 1), T0).unwrap();
        assert_eq!(a.source, DEVICE_ADDRESS);
        assert_eq!((a.opened_at, a.closes_at, a.readings), (T0, T0 + WINDOW_MS, 1));
        accept_reading(&ledger, reading(&device, ARTWORK, 2, 2), T0 + 1_000).unwrap();
        let a = accept_reading(&ledger, reading(&device, ARTWORK, 1, 3), T0 + 2_000).unwrap();
        assert_eq!((a.opened_at, a.readings), (T0, 3), "the window opened with the first reading");

        assert!(close_window(&state, &ledger, key(DEVICE_ADDRESS, ARTWORK), T0 + WINDOW_MS - 1).is_err());

        let verdict = close_window(&state, &ledger, key(DEVICE_ADDRESS, ARTWORK), T0 + WINDOW_MS).unwrap();
        let report = &verdict.report.response;
        assert_eq!(report.intent, IntentScope::StatusReport as u8);
        assert_eq!(report.timestamp_ms, T0 + WINDOW_MS);
        assert_eq!(report.data.source, parse_address("source", DEVICE_ADDRESS).unwrap());
        assert_eq!(report.data.artwork, parse_address("artwork", ARTWORK).unwrap());
        assert_eq!(report.data.condition, 1, "two of three readings said damaged");
        assert_eq!(report.data.readings, 3, "the report stands for the whole window");

        assert!(close_window(&state, &ledger, key(DEVICE_ADDRESS, ARTWORK), T0 + WINDOW_MS).is_err());
        let a = accept_reading(&ledger, reading(&device, ARTWORK, 0, 4), T0 + WINDOW_MS + 5).unwrap();
        assert_eq!((a.opened_at, a.readings), (T0 + WINDOW_MS + 5, 1));
    }

    #[test]
    fn ties_go_to_the_worse_condition_and_glitches_are_outvoted() {
        let mk = |conds: &[u8]| -> Vec<Reading> {
            conds.iter().map(|&c| Reading { condition: c, nonce: 0, observed_at: 0, received_at: 0 }).collect()
        };
        assert_eq!(prevailing_condition(&mk(&[1, 2])), 2, "tie");
        assert_eq!(prevailing_condition(&mk(&[0, 0, 3, 0])), 0, "one glitch");
        assert_eq!(prevailing_condition(&mk(&[3])), 3);
        assert_eq!(prevailing_condition(&mk(&[0, 3, 0, 3])), 3, "tie");
    }

    #[test]
    fn windows_are_per_source_and_per_artwork() {
        let ledger = Ledger::default();
        let state = state();
        let device = device();
        let other = Ed25519KeyPair::generate(&mut rand::thread_rng());

        accept_reading(&ledger, reading(&device, ARTWORK, 3, 1), T0).unwrap();
        accept_reading(&ledger, reading(&device, "0x2", 0, 2), T0).unwrap();
        accept_reading(&ledger, reading(&other, ARTWORK, 0, 1), T0).unwrap();

        let v = close_window(&state, &ledger, key(DEVICE_ADDRESS, ARTWORK), T0 + WINDOW_MS).unwrap();
        assert_eq!(v.report.response.data.condition, 3);
        assert_eq!(v.report.response.data.readings, 1, "the other artwork and the other source are separate windows");

        let v = close_window(&state, &ledger, key(DEVICE_ADDRESS, "0x2"), T0 + WINDOW_MS).unwrap();
        assert_eq!(v.report.response.data.condition, 0);
        let v = close_window(&state, &ledger, key(&address_hex(&sui_address(other.public())), ARTWORK), T0 + WINDOW_MS).unwrap();
        assert_eq!(v.report.response.data.source, sui_address(other.public()));
    }

    #[test]
    fn the_window_follows_the_policy_and_is_fixed_at_opening() {
        let state = state();
        let ledger = Ledger::default();
        let device = device();

        ledger.set_window_ms(1_000, T0).unwrap();
        let a = accept_reading(&ledger, reading(&device, ARTWORK, 1, 1), T0).unwrap();
        assert_eq!(a.closes_at, T0 + 1_000);
        assert!(close_window(&state, &ledger, key(DEVICE_ADDRESS, ARTWORK), T0 + 999).is_err());

        ledger.set_window_ms(30_000, T0 + 500).unwrap();
        assert!(ledger.expired(T0 + 1_000).unwrap().len() == 1);
        assert!(close_window(&state, &ledger, key(DEVICE_ADDRESS, ARTWORK), T0 + 1_000).is_ok());

        let a = accept_reading(&ledger, reading(&device, ARTWORK, 1, 2), T0 + 2_000).unwrap();
        assert_eq!(a.closes_at, T0 + 2_000 + 30_000);
        assert!(!ledger.window_is_stale(T0 + 500 + ACTIVE_CACHE_MS - 1).unwrap());
        assert!(ledger.window_is_stale(T0 + 500 + ACTIVE_CACHE_MS).unwrap());
    }

    #[test]
    fn closing_a_window_that_does_not_exist_is_refused() {
        let ledger = Ledger::default();
        assert!(close_window(&state(), &ledger, key(DEVICE_ADDRESS, ARTWORK), T0 + WINDOW_MS).is_err());
        assert!(parse_address("source", "0xzz").is_err());
    }
}
