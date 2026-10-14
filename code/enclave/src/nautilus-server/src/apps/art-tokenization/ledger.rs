use super::reading::Reading;
use super::{address_hex, err, ReportPayload};
use crate::EnclaveError;
use serde::{Deserialize, Serialize};
use std::collections::{HashMap, VecDeque};
use std::sync::{LazyLock, Mutex, MutexGuard};
use tracing::info;

pub const WINDOW_MS: u64 = 60_000;
pub(super) const ACTIVE_CACHE_MS: u64 = 60_000;
const ACTIVE_CACHE_MAX: usize = 1_024;
const MAX_READINGS_PER_WINDOW: usize = 1_000;
const MAX_WINDOWS_PER_SOURCE: usize = 64;
const RECENT_KEPT: usize = 20;

pub(super) type WindowKey = ([u8; 32], [u8; 32]);

pub(super) static LEDGER: LazyLock<Ledger> = LazyLock::new(Ledger::default);

#[derive(Debug, Serialize, Deserialize)]
pub struct Accepted {
    pub source: String,
    pub artwork: String,
    pub opened_at: u64,
    pub closes_at: u64,
    pub readings: usize,
}

#[derive(Debug, Clone, Serialize)]
pub struct Pending {
    pub payload: ReportPayload,
    pub attested_at: u64,
    pub signature: String,
    pub attempts: u32,
    pub last_error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct Closed {
    pub source: String,
    pub artwork: String,
    pub condition: u8,
    pub opened_at: u64,
    pub attested_at: u64,
    pub readings: usize,
    pub digest: Option<String>,
}

#[derive(Debug)]
struct Window {
    opened_at: u64,
    closes_at: u64,
    readings: Vec<Reading>,
}

impl Window {
    fn is_due(&self, now: u64) -> bool {
        now >= self.closes_at || self.readings.len() >= MAX_READINGS_PER_WINDOW
    }

    fn accepted(&self, (source, artwork): &WindowKey) -> Accepted {
        Accepted {
            source: address_hex(source),
            artwork: address_hex(artwork),
            opened_at: self.opened_at,
            closes_at: self.closes_at,
            readings: self.readings.len(),
        }
    }
}

#[derive(Default)]
pub(super) struct Inner {
    // Ανοιχτά παράθυρα και προστασία replay
    windows: HashMap<WindowKey, Window>,
    last_nonce: HashMap<[u8; 32], u64>,
    // Cache μητρώου, κρατείται για ACTIVE_CACHE_MS
    active_cache: HashMap<[u8; 32], (bool, u64)>,
    // Υπογεγραμμένες αναφορές εκτός αλυσίδας και πρόσφατα κλειστά παράθυρα
    pub(super) pending: Vec<Pending>,
    pub(super) recent: VecDeque<Closed>,
    // Εγγραφή και πολιτική, όπως φαίνονται στην αλυσίδα
    pub(super) enclave_object: Option<[u8; 32]>,
    pub(super) registered_by: Option<String>,
    pub(super) accepted_enclave: Option<[u8; 32]>,
    window_ms: Option<u64>,
    window_checked_at: Option<u64>,
    // Ενεργοποιείται σε κάθε ανάγνωση πολιτικής, καθαρίζει στο prune
    prune_check: bool,
    pub(super) pruned: Option<usize>,
}

impl Inner {
    pub(super) fn window(&self) -> u64 {
        self.window_ms.unwrap_or(WINDOW_MS)
    }

    pub(super) fn open_windows(&self) -> Vec<Accepted> {
        self.windows.iter().map(|(k, w)| w.accepted(k)).collect()
    }
}

#[derive(Default)]
pub struct Ledger(Mutex<Inner>);

impl Ledger {
    pub(super) fn lock(&self) -> Result<MutexGuard<'_, Inner>, EnclaveError> {
        self.0.lock().map_err(|e| err(format!("ledger lock poisoned: {e}")))
    }

    pub(super) fn accept(&self, source: [u8; 32], artwork: [u8; 32], reading: Reading) -> Result<Accepted, EnclaveError> {
        let mut inner = self.lock()?;
        if let Some(last) = inner.last_nonce.get(&source) {
            if reading.nonce <= *last {
                return Err(err(format!("nonce {} is not above the last accepted nonce {last} for this source", reading.nonce)));
            }
        }
        let key = (source, artwork);
        if !inner.windows.contains_key(&key)
            && inner.windows.keys().filter(|(s, _)| *s == source).count() >= MAX_WINDOWS_PER_SOURCE
        {
            return Err(err(format!("this source already holds {MAX_WINDOWS_PER_SOURCE} open windows")));
        }
        let now = reading.received_at;
        let window_ms = inner.window();
        let window = inner
            .windows
            .entry(key)
            .or_insert_with(|| Window { opened_at: now, closes_at: now + window_ms, readings: Vec::new() });
        if window.readings.len() >= MAX_READINGS_PER_WINDOW {
            return Err(err(format!("the window holds {MAX_READINGS_PER_WINDOW} readings already; close it first")));
        }
        let nonce = reading.nonce;
        window.readings.push(reading);
        let accepted = window.accepted(&key);
        inner.last_nonce.insert(source, nonce);
        Ok(accepted)
    }

    pub(super) fn close(&self, key: WindowKey, now: u64) -> Result<(u64, Vec<Reading>), EnclaveError> {
        let mut inner = self.lock()?;
        let Some(window) = inner.windows.get(&key) else {
            return Err(err("no open window for this source and artwork"));
        };
        if !window.is_due(now) {
            return Err(err(format!("the window closes at {}, it is {now} now", window.closes_at)));
        }
        let window = inner.windows.remove(&key).expect("checked above");
        Ok((window.opened_at, window.readings))
    }

    pub(super) fn expired(&self, now: u64) -> Result<Vec<WindowKey>, EnclaveError> {
        Ok(self.lock()?.windows.iter().filter(|(_, w)| w.is_due(now)).map(|(k, _)| *k).collect())
    }

    pub(super) fn window_is_stale(&self, now: u64) -> Result<bool, EnclaveError> {
        Ok(self.lock()?.window_checked_at.is_none_or(|t| now >= t + ACTIVE_CACHE_MS))
    }

    pub(super) fn set_window_ms(&self, ms: u64, now: u64) -> Result<(), EnclaveError> {
        let mut inner = self.lock()?;
        if inner.window_ms != Some(ms) {
            info!("aggregation window is now {ms} ms (was {} ms)", inner.window());
        }
        inner.window_ms = Some(ms);
        inner.window_checked_at = Some(now);
        Ok(())
    }

    pub(super) fn set_accepted(&self, accepted: Option<[u8; 32]>) -> Result<(), EnclaveError> {
        let mut inner = self.lock()?;
        if inner.accepted_enclave != accepted {
            info!("accepted enclave is now {}", accepted.map(|a| address_hex(&a)).unwrap_or_else(|| "none".into()));
        }
        inner.accepted_enclave = accepted;
        inner.prune_check = true;
        Ok(())
    }

    pub(super) fn take_prune_check(&self, me: [u8; 32]) -> Result<bool, EnclaveError> {
        let mut inner = self.lock()?;
        let due = inner.prune_check && inner.pruned.is_none() && inner.accepted_enclave == Some(me);
        inner.prune_check = false;
        Ok(due)
    }

    pub(super) fn mark_pruned(&self, count: usize) -> Result<(), EnclaveError> {
        self.lock()?.pruned = Some(count);
        Ok(())
    }

    pub(super) fn cached_active(&self, source: [u8; 32], now: u64) -> Result<Option<bool>, EnclaveError> {
        Ok(self
            .lock()?
            .active_cache
            .get(&source)
            .filter(|(_, at)| now < at + ACTIVE_CACHE_MS)
            .map(|(active, _)| *active))
    }

    pub(super) fn remember_active(&self, source: [u8; 32], active: bool, now: u64) -> Result<(), EnclaveError> {
        let mut inner = self.lock()?;
        if inner.active_cache.len() >= ACTIVE_CACHE_MAX {
            inner.active_cache.retain(|_, (_, at)| now < *at + ACTIVE_CACHE_MS);
            if inner.active_cache.len() >= ACTIVE_CACHE_MAX {
                inner.active_cache.clear();
            }
        }
        inner.active_cache.insert(source, (active, now));
        Ok(())
    }

    pub(super) fn remember_closed(&self, closed: Closed) -> Result<(), EnclaveError> {
        let mut inner = self.lock()?;
        inner.recent.push_front(closed);
        inner.recent.truncate(RECENT_KEPT);
        Ok(())
    }

    pub(super) fn enqueue(&self, pending: Pending) -> Result<(), EnclaveError> {
        self.lock()?.pending.push(pending);
        Ok(())
    }

    pub(super) fn take_pending(&self) -> Result<Vec<Pending>, EnclaveError> {
        Ok(std::mem::take(&mut self.lock()?.pending))
    }

    pub(super) fn requeue(&self, mut items: Vec<Pending>) -> Result<(), EnclaveError> {
        self.lock()?.pending.append(&mut items);
        Ok(())
    }

    pub(super) fn mark_submitted(&self, report: &Pending, digest: &str) -> Result<(), EnclaveError> {
        let source = address_hex(&report.payload.source);
        let mut inner = self.lock()?;
        if let Some(c) = inner.recent.iter_mut().find(|c| c.attested_at == report.attested_at && c.source == source) {
            c.digest = Some(digest.to_string());
        }
        Ok(())
    }
}
