module art_tokenization::report;

use std::string::String;
use sui::clock::Clock;
use sui::event;
use sui::table::{Self, Table};
use enclave::enclave::{Self, Enclave, EnclaveConfig, Cap};
use art_tokenization::admin::AdminCap;
use art_tokenization::artwork::Artwork;
use art_tokenization::custody::{Self, ReportLog};
use art_tokenization::registry::{Registry, Source};

const REPORT_INTENT: u8 = 0;

const CONDITION_OK: u8 = 0;
const CONDITION_DAMAGED: u8 = 1;
const CONDITION_DESTROYED: u8 = 2;
const CONDITION_MISSING: u8 = 3;

const FRESHNESS_WINDOW_MS: u64 = 300_000;

// Mirrors CLOCK_SKEW_MS in the enclave
const CLOCK_SKEW_MS: u64 = 60_000;

const MAX_ENDPOINT_LEN: u64 = 256;

const DEFAULT_WINDOW_MS: u64 = 60_000;
const MIN_WINDOW_MS: u64 = 1_000;
const MAX_WINDOW_MS: u64 = 86_400_000;

#[error(code = 0)]
const ENotActiveSource: vector<u8> = b"the report names a source that is not active in the source registry";
#[error(code = 1)]
const EInvalidSignature: vector<u8> = b"the report is not signed by the registered enclave";
#[error(code = 2)]
const EUnknownCondition: vector<u8> = b"the condition is not one of ok, damaged, destroyed, missing";
#[error(code = 3)]
const EWrongLog: vector<u8> = b"the report log belongs to another artwork";
#[error(code = 4)]
const EStaleReport: vector<u8> = b"the report was signed too long ago to be recorded now";
#[error(code = 5)]
const EInvalidWindow: vector<u8> = b"the aggregation window must be between one second and one day";
#[error(code = 6)]
const EWrongEnclave: vector<u8> = b"the report was signed by an enclave the authority has not accepted";
#[error(code = 7)]
const EStaleEnclave: vector<u8> = b"the enclave registered against measurements that are no longer declared";
#[error(code = 8)]
const EReplayedReport: vector<u8> = b"this source has already reported at or after this attestation time";
#[error(code = 9)]
const EFutureReport: vector<u8> = b"the report is stamped further ahead than the clock allows";
#[error(code = 10)]
const EEmptyReport: vector<u8> = b"a report stands for at least one reading";
#[error(code = 11)]
const EEndpointTooLong: vector<u8> = b"the channel endpoint is too long";
#[error(code = 12)]
const ECustodyClosed: vector<u8> = b"the artwork is not in a gallery's custody";
#[error(code = 13)]
const EConfigExists: vector<u8> = b"the channel already has its enclave config";
#[error(code = 14)]
const EWrongConfig: vector<u8> = b"this is not the enclave config bound to the channel";

// Not a one-time witness on purpose: the config is created later, with the AdminCap
public struct ReportChannel has drop {}

// Field order is the BCS layout and must match the Rust struct
public struct ReportPayload has copy, drop {
    artwork: ID,
    source: address,
    condition: u8,
    readings: u64,
}

public struct StatusReport has key {
    id: UID,
    artwork: ID,
    source: address,
    condition: u8,
    readings: u64,
    attested_at: u64,
    at: u64,
}

public struct ChannelPolicy has key {
    id: UID,
    window_ms: u64,
    accepted_enclave: Option<ID>,
    endpoint: String,
    cap: Option<ID>,
    config: Option<ID>,
}

public struct ChannelStats has key {
    id: UID,
    reports: u64,
    by_source: Table<address, SourceActivity>,
}

public struct SourceActivity has store, copy, drop {
    reports: u64,
    last_at: u64,
}

// Events

public struct WindowChanged has copy, drop {
    old_ms: u64,
    new_ms: u64,
    by: address,
    at: u64,
}

public struct ReportRecorded has copy, drop {
    report: ID,
    artwork: ID,
    source: address,
    condition: u8,
    readings: u64,
    attested_at: u64,
    at: u64,
}

public struct EnclaveAccepted has copy, drop {
    enclave: ID,
    config_version: u64,
    previous: Option<ID>,
    by: address,
    at: u64,
}

public struct EnclaveCleared has copy, drop {
    previous: Option<ID>,
    by: address,
    at: u64,
}

public struct EndpointChanged has copy, drop {
    old_url: String,
    new_url: String,
    by: address,
    at: u64,
}

// Setup

fun init(ctx: &mut TxContext) {
    transfer::share_object(ChannelPolicy {
        id: object::new(ctx),
        window_ms: DEFAULT_WINDOW_MS,
        accepted_enclave: option::none(),
        endpoint: b"".to_string(),
        cap: option::none(),
        config: option::none(),
    });
    transfer::share_object(ChannelStats { id: object::new(ctx), reports: 0, by_source: table::new(ctx) });
}

// The enclave package shares the config without returning its id, so the policy remembers the
// Cap here and binds the config on the first accept_enclave
public fun create_config(
    policy: &mut ChannelPolicy,
    _: &AdminCap,
    pcr0: vector<u8>,
    pcr1: vector<u8>,
    pcr2: vector<u8>,
    ctx: &mut TxContext,
) {
    assert!(policy.cap.is_none(), EConfigExists);
    let cap = enclave::new_cap(ReportChannel {}, ctx);
    policy.cap = option::some(object::id(&cap));
    cap.create_enclave_config(
        b"art tokenization status report enclave".to_string(),
        pcr0,
        pcr1,
        pcr2,
        ctx,
    );
    transfer::public_transfer(cap, ctx.sender());
}

public fun accept_enclave(
    policy: &mut ChannelPolicy,
    _: &AdminCap,
    enclave: &Enclave<ReportChannel>,
    config: &EnclaveConfig<ReportChannel>,
    clock: &Clock,
    ctx: &TxContext,
) {
    let config_id = object::id(config);
    if (policy.config.is_none()) {
        policy.config = option::some(config_id);
    };
    assert!(policy.config == option::some(config_id), EWrongConfig);
    assert!(enclave.config_version() == config.version(), EStaleEnclave);
    let id = object::id(enclave);
    let previous = policy.accepted_enclave;
    policy.accepted_enclave = option::some(id);
    event::emit(EnclaveAccepted {
        enclave: id,
        config_version: config.version(),
        previous,
        by: ctx.sender(),
        at: clock.timestamp_ms(),
    });
}

public fun clear_enclave(
    policy: &mut ChannelPolicy,
    _: &AdminCap,
    clock: &Clock,
    ctx: &TxContext,
) {
    let previous = policy.accepted_enclave;
    policy.accepted_enclave = option::none();
    event::emit(EnclaveCleared { previous, by: ctx.sender(), at: clock.timestamp_ms() });
}

public fun set_endpoint(
    policy: &mut ChannelPolicy,
    _: &AdminCap,
    url: String,
    clock: &Clock,
    ctx: &TxContext,
) {
    assert!(url.length() <= MAX_ENDPOINT_LEN, EEndpointTooLong);
    let old_url = policy.endpoint;
    policy.endpoint = url;
    event::emit(EndpointChanged {
        old_url,
        new_url: url,
        by: ctx.sender(),
        at: clock.timestamp_ms(),
    });
}

public fun set_window_ms(
    policy: &mut ChannelPolicy,
    _: &AdminCap,
    new_ms: u64,
    clock: &Clock,
    ctx: &TxContext,
) {
    assert!(new_ms >= MIN_WINDOW_MS && new_ms <= MAX_WINDOW_MS, EInvalidWindow);
    let old_ms = policy.window_ms;
    policy.window_ms = new_ms;
    event::emit(WindowChanged { old_ms, new_ms, by: ctx.sender(), at: clock.timestamp_ms() });
}

public fun window_ms(policy: &ChannelPolicy): u64 { policy.window_ms }
public fun accepted_enclave(policy: &ChannelPolicy): Option<ID> { policy.accepted_enclave }
public fun endpoint(policy: &ChannelPolicy): String { policy.endpoint }
public fun cap(policy: &ChannelPolicy): Option<ID> { policy.cap }
public fun config(policy: &ChannelPolicy): Option<ID> { policy.config }
public fun default_window_ms(): u64 { DEFAULT_WINDOW_MS }
public fun min_window_ms(): u64 { MIN_WINDOW_MS }
public fun max_window_ms(): u64 { MAX_WINDOW_MS }

// Recording

public fun record_report(
    artwork: &Artwork,
    log: &mut ReportLog,
    channel: &mut ChannelStats,
    sources: &Registry<Source>,
    policy: &ChannelPolicy,
    config: &EnclaveConfig<ReportChannel>,
    enclave: &Enclave<ReportChannel>,
    source: address,
    condition: u8,
    readings: u64,
    attested_at: u64,
    signature: vector<u8>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(sources.is_active(source), ENotActiveSource);
    assert!(condition <= CONDITION_MISSING, EUnknownCondition);
    assert!(readings > 0, EEmptyReport);
    let artwork_id = object::id(artwork);
    assert!(log.log_artwork() == artwork_id, EWrongLog);
    assert!(custody::is_open(artwork), ECustodyClosed);
    assert!(policy.accepted_enclave.contains(&object::id(enclave)), EWrongEnclave);
    assert!(policy.config == option::some(object::id(config)), EWrongConfig);
    assert!(enclave.config_version() == config.version(), EStaleEnclave);

    let at = clock.timestamp_ms();
    assert!(at <= attested_at + FRESHNESS_WINDOW_MS, EStaleReport);
    assert!(attested_at <= at + CLOCK_SKEW_MS, EFutureReport);
    // One report per closed window, in order: no replay, no late overwrite
    assert!(attested_at > log.last_attested_of(source), EReplayedReport);

    let payload = ReportPayload { artwork: artwork_id, source, condition, readings };
    assert!(
        enclave.verify_signature(REPORT_INTENT, attested_at, payload, &signature),
        EInvalidSignature,
    );

    let report = StatusReport {
        id: object::new(ctx),
        artwork: artwork_id,
        source,
        condition,
        readings,
        attested_at,
        at,
    };
    let report_id = object::id(&report);

    custody::append_report(log, report_id, source, condition, at, attested_at);
    channel.reports = channel.reports + 1;
    if (channel.by_source.contains(source)) {
        let activity = &mut channel.by_source[source];
        activity.reports = activity.reports + 1;
        activity.last_at = at;
    } else {
        channel.by_source.add(source, SourceActivity { reports: 1, last_at: at });
    };
    event::emit(ReportRecorded {
        report: report_id,
        artwork: artwork_id,
        source,
        condition,
        readings,
        attested_at,
        at,
    });
    transfer::freeze_object(report);
}

// Reads

public fun artwork(r: &StatusReport): ID { r.artwork }
public fun source(r: &StatusReport): address { r.source }
public fun condition(r: &StatusReport): u8 { r.condition }
public fun readings(r: &StatusReport): u64 { r.readings }
public fun attested_at(r: &StatusReport): u64 { r.attested_at }
public fun recorded_at(r: &StatusReport): u64 { r.at }

public fun is_ok(r: &StatusReport): bool { r.condition == CONDITION_OK }
public fun is_damaged(r: &StatusReport): bool { r.condition == CONDITION_DAMAGED }
public fun is_destroyed(r: &StatusReport): bool { r.condition == CONDITION_DESTROYED }
public fun is_missing(r: &StatusReport): bool { r.condition == CONDITION_MISSING }

public fun condition_ok(): u8 { CONDITION_OK }
public fun condition_damaged(): u8 { CONDITION_DAMAGED }
public fun condition_destroyed(): u8 { CONDITION_DESTROYED }
public fun condition_missing(): u8 { CONDITION_MISSING }
public fun report_intent(): u8 { REPORT_INTENT }
public fun freshness_window_ms(): u64 { FRESHNESS_WINDOW_MS }
public fun clock_skew_ms(): u64 { CLOCK_SKEW_MS }

public fun total_reports(c: &ChannelStats): u64 { c.reports }
public fun reports_of(c: &ChannelStats, source: address): u64 {
    if (c.by_source.contains(source)) c.by_source[source].reports else 0
}
public fun last_report_of(c: &ChannelStats, source: address): Option<u64> {
    if (c.by_source.contains(source)) option::some(c.by_source[source].last_at) else option::none()
}

// Test helpers

#[test_only]
public fun init_for_testing(ctx: &mut TxContext) { init(ctx); }

#[test_only]
public fun window_changed_for_testing(old_ms: u64, new_ms: u64, by: address, at: u64): WindowChanged {
    WindowChanged { old_ms, new_ms, by, at }
}

#[test_only]
public fun payload_for_testing(
    artwork: ID,
    source: address,
    condition: u8,
    readings: u64,
): ReportPayload {
    ReportPayload { artwork, source, condition, readings }
}
