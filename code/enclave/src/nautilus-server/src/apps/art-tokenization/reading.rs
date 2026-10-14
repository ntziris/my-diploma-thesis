use super::{err, parse_address, parse_hex, sui_address};
use crate::EnclaveError;
use fastcrypto::ed25519::{Ed25519PublicKey, Ed25519Signature};
use fastcrypto::traits::{ToFromBytes, VerifyingKey};
use serde::{Deserialize, Serialize};

// Αντίστοιχο του CLOCK_SKEW_MS στο report.move
pub(super) const CLOCK_SKEW_MS: u64 = 60_000;

// Όριο για replay attacks μετά από επανεκκίνηση
pub(super) const READING_MAX_AGE_MS: u64 = 600_000;

// Διαχωριστικό πεδίο (domain separator) για την αναφορά κατάστασης
pub(super) const DEVICE_READING_DOMAIN: u8 = 1;

pub(super) const CONDITION_MISSING: u8 = 3;

#[derive(Debug, Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
pub struct ReportRequest {
    pub public_key: String,
    pub artwork: String,
    pub condition: u8,
    pub nonce: u64,
    pub observed_at: u64,
    pub signature: String,
}

// Τα δεδομένα που υπογράφει η συσκευή, πρέπει να ταιριάζουν με τη reading_bytes
#[derive(Debug, Serialize)]
pub(super) struct DeviceReading {
    pub(super) domain: u8,
    pub(super) artwork: [u8; 32],
    pub(super) condition: u8,
    pub(super) nonce: u64,
    pub(super) observed_at: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct Reading {
    pub condition: u8,
    pub nonce: u64,
    pub observed_at: u64,
    pub received_at: u64,
}

// Οι φθηνοί έλεγχοι προηγούνται, η πηγή εξάγεται από το κλειδί
pub(super) fn authenticate(request: ReportRequest, now: u64) -> Result<([u8; 32], [u8; 32], Reading), EnclaveError> {
    let ReportRequest { public_key, artwork, condition, nonce, observed_at, signature } = request;

    if condition > CONDITION_MISSING {
        return Err(err(format!("condition {condition} is not one of 0 ok, 1 damaged, 2 destroyed, 3 missing")));
    }
    if observed_at > now + CLOCK_SKEW_MS {
        return Err(err(format!("observed_at {observed_at} is ahead of the enclave clock {now} by more than {CLOCK_SKEW_MS} ms")));
    }
    if observed_at + READING_MAX_AGE_MS < now {
        return Err(err(format!("observed_at {observed_at} is older than {READING_MAX_AGE_MS} ms at enclave time {now}")));
    }
    let artwork = parse_address("artwork", &artwork)?;
    let public_key = Ed25519PublicKey::from_bytes(&parse_hex("public_key", &public_key, 32)?)
        .map_err(|e| err(format!("public_key is not an Ed25519 key: {e}")))?;
    let signature = Ed25519Signature::from_bytes(&parse_hex("signature", &signature, 64)?)
        .map_err(|e| err(format!("signature is malformed: {e}")))?;

    let message = bcs::to_bytes(&DeviceReading { domain: DEVICE_READING_DOMAIN, artwork, condition, nonce, observed_at })
        .map_err(|e| err(format!("could not serialise the reading: {e}")))?;
    public_key
        .verify(&message, &signature)
        .map_err(|_| err("the reading is not signed by public_key"))?;

    Ok((sui_address(&public_key), artwork, Reading { condition, nonce, observed_at, received_at: now }))
}

// Πλειοψηφική ψηφοφορία (στην ισοπαλία επικρατεί η χειρότερη κατάσταση)
pub(super) fn prevailing_condition(readings: &[Reading]) -> u8 {
    let mut counts = [0usize; CONDITION_MISSING as usize + 1];
    for r in readings {
        counts[r.condition as usize] += 1;
    }
    (0..=CONDITION_MISSING)
        .filter(|&c| counts[c as usize] > 0)
        .max_by_key(|&c| counts[c as usize])
        .unwrap_or(0)
}
