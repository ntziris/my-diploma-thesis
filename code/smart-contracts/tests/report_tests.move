#[test_only]
module art_tokenization::report_tests;

use sui::clock;
use sui::event;
use sui::test_scenario::{Self as ts, Scenario};
use enclave::enclave::{Self, Cap, Enclave, EnclaveConfig};
use art_tokenization::artwork::{Artwork, Catalog};
use art_tokenization::custody::{Self, ReportLog};
use art_tokenization::fixtures::{Self, artist, gallery_a, source, stranger};
use art_tokenization::registry::{Registry, Source, Gallery};
use art_tokenization::report::{Self, StatusReport, ReportChannel, ChannelPolicy, ChannelStats, WindowChanged};
use art_tokenization::admin::AdminCap;
use art_tokenization::stats::Stats;

#[error(code = 0)]
const EWrongState: vector<u8> = b"unexpected artwork state";
#[error(code = 3)]
const EWrongReport: vector<u8> = b"unexpected report content";
#[error(code = 4)]
const EWrongCounter: vector<u8> = b"unexpected counter";

const FIXTURE_ARTWORK: address = @0x01c5e4703d8ab941c77c53ac590c7764b9e6f197cd1bb6692613a1d3df9a2564;

const PK: vector<u8> = x"197f6b23e16c8532c6abc838facd5ea789be0c76b2920334039bfa8b3d368d61";

// condition = damaged, 3 readings, attested at 4000
const ATTESTED_DAMAGED: u64 = 4_000;
const READINGS_DAMAGED: u64 = 3;
const SIG_DAMAGED: vector<u8> = x"fcb1b286c02d68e0f572727f1886c52c94ccbbb759410f7e29a168f1348761d854bf645b650ae3bb7ab1ae55b35edcb56c0ed08f91c278013373690333096b04";

// condition = destroyed, 1 reading, attested at 5000

// condition = ok, 5 readings, stamped far ahead of the tests' clock
const ATTESTED_AHEAD: u64 = 1_000_000_000;
const READINGS_AHEAD: u64 = 5;
const SIG_AHEAD: vector<u8> = x"e00500b3cf7b4c6cb442087c7300ca036cf9035ef9073ee2284eaabc9d1fea26a5c963e9c864232c8a11cfa1738adadeb32efe81542a982ffedc7931a1b77c0b";

const PCR: vector<u8> = x"010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101010101";
const PCR_NEXT: vector<u8> = x"020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202020202";

// Helpers

// The source is registered after the mint: an earlier transaction would move the fixture artwork id
fun setup_with_source(): Scenario {
    let mut s = fixtures::setup();
    fixtures::intake(&mut s, gallery_a(), 1_000);
    fixtures::register_source(&mut s, source());
    s.next_tx(fixtures::authority());
    let cap = s.take_from_sender<AdminCap>();
    let mut policy = s.take_shared<ChannelPolicy>();
    report::create_config(&mut policy, &cap, PCR, PCR, PCR, s.ctx());
    ts::return_shared(policy);
    s.return_to_sender(cap);
    s
}

fun accepted_enclave(s: &mut Scenario): Enclave<ReportChannel> {
    s.next_tx(fixtures::authority());
    let e = enclave::new_enclave_for_testing<ReportChannel>(PK, s.ctx());
    accept(s, &e);
    e
}

fun accept(s: &mut Scenario, e: &Enclave<ReportChannel>) {
    s.next_tx(fixtures::authority());
    let mut policy = s.take_shared<ChannelPolicy>();
    let config = s.take_shared<EnclaveConfig<ReportChannel>>();
    let cap = s.take_from_sender<AdminCap>();
    let c = clock::create_for_testing(s.ctx());
    policy.accept_enclave(&cap, e, &config, &c, s.ctx());
    c.destroy_for_testing();
    s.return_to_sender(cap);
    ts::return_shared(policy);
    ts::return_shared(config);
}

fun submit(
    s: &mut Scenario,
    e: &Enclave<ReportChannel>,
    by: address,
    source: address,
    condition: u8,
    readings: u64,
    attested_at: u64,
    signature: vector<u8>,
    at: u64,
) {
    s.next_tx(by);
    let a = s.take_shared<Artwork>();
    let mut log = s.take_shared_by_id<ReportLog>(custody::report_log_id(&a));
    let mut channel = s.take_shared<ChannelStats>();
    let sources = s.take_shared<Registry<Source>>();
    let policy = s.take_shared<ChannelPolicy>();
    let config = s.take_shared<EnclaveConfig<ReportChannel>>();
    let c = fixtures::clock_at(s, at);
    report::record_report(
        &a, &mut log, &mut channel, &sources, &policy, &config, e,
        source, condition, readings, attested_at, signature,
        &c, s.ctx(),
    );
    c.destroy_for_testing();
    ts::return_shared(a);
    ts::return_shared(log);
    ts::return_shared(channel);
    ts::return_shared(sources);
    ts::return_shared(policy);
    ts::return_shared(config);
}

fun fixture_artwork(s: &Scenario): Artwork {
    s.take_shared_by_id<Artwork>(object::id_from_address(FIXTURE_ARTWORK))
}

// Recording

#[test, expected_failure(abort_code = report::EInvalidSignature)]
fun a_tampered_condition_aborts() {
    let mut s = setup_with_source();
    let e = accepted_enclave(&mut s);
    // The signature covers `damaged`; the source submits `ok` instead
    submit(&mut s, &e, source(), source(), report::condition_ok(), READINGS_DAMAGED, ATTESTED_DAMAGED, SIG_DAMAGED, 4_500);
    e.destroy();
    s.end();
}

#[test]
fun anyone_may_submit_and_the_report_names_the_signing_source() {
    let mut s = setup_with_source();
    let e = accepted_enclave(&mut s);

    submit(&mut s, &e, stranger(), source(), report::condition_damaged(), READINGS_DAMAGED, ATTESTED_DAMAGED, SIG_DAMAGED, 4_500);

    s.next_tx(stranger());
    let a = s.take_shared<Artwork>();
    let r = s.take_immutable<StatusReport>();
    assert!(r.source() == source(), EWrongReport);
    assert!(r.source() != stranger(), EWrongReport);
    let log = s.take_shared_by_id<ReportLog>(custody::report_log_id(&a));
    assert!(log.last_report() == option::some(object::id(&r)), EWrongReport);
    let channel = s.take_shared<ChannelStats>();
    assert!(channel.reports_of(source()) == 1 && channel.reports_of(stranger()) == 0, EWrongCounter);
    ts::return_shared(channel);
    ts::return_shared(log);
    ts::return_immutable(r);
    ts::return_shared(a);

    e.destroy();
    s.end();
}

#[test, expected_failure(abort_code = report::EInvalidSignature)]
fun a_report_moved_onto_another_source_aborts() {
    let mut s = setup_with_source();
    fixtures::register_source(&mut s, stranger());
    let e = accepted_enclave(&mut s);
    // stranger() is an active source too, but the bytes name source()
    submit(&mut s, &e, stranger(), stranger(), report::condition_damaged(), READINGS_DAMAGED, ATTESTED_DAMAGED, SIG_DAMAGED, 4_500);
    e.destroy();
    s.end();
}

#[test, expected_failure(abort_code = report::ENotActiveSource)]
fun a_revoked_source_aborts() {
    let mut s = setup_with_source();
    fixtures::revoke_source(&mut s, source());
    let e = accepted_enclave(&mut s);
    submit(&mut s, &e, source(), source(), report::condition_damaged(), READINGS_DAMAGED, ATTESTED_DAMAGED, SIG_DAMAGED, 4_500);
    e.destroy();
    s.end();
}

#[test, expected_failure(abort_code = report::ENotActiveSource)]
fun an_unregistered_source_aborts() {
    let mut s = setup_with_source();
    let e = accepted_enclave(&mut s);
    submit(&mut s, &e, source(), stranger(), report::condition_damaged(), READINGS_DAMAGED, ATTESTED_DAMAGED, SIG_DAMAGED, 4_500);
    e.destroy();
    s.end();
}

#[test, expected_failure(abort_code = report::EUnknownCondition)]
fun an_unknown_condition_aborts() {
    let mut s = setup_with_source();
    let e = accepted_enclave(&mut s);
    submit(&mut s, &e, source(), source(), 9, READINGS_DAMAGED, ATTESTED_DAMAGED, SIG_DAMAGED, 4_500);
    e.destroy();
    s.end();
}

#[test, expected_failure(abort_code = report::EStaleReport)]
fun a_report_submitted_after_the_window_aborts() {
    let mut s = setup_with_source();
    let e = accepted_enclave(&mut s);
    let too_late = ATTESTED_DAMAGED + report::freshness_window_ms() + 1;
    submit(&mut s, &e, source(), source(), report::condition_damaged(), READINGS_DAMAGED, ATTESTED_DAMAGED, SIG_DAMAGED, too_late);
    e.destroy();
    s.end();
}

#[test]
fun a_report_at_the_edge_of_the_window_is_recorded() {
    let mut s = setup_with_source();
    let e = accepted_enclave(&mut s);
    let last_moment = ATTESTED_DAMAGED + report::freshness_window_ms();
    submit(&mut s, &e, source(), source(), report::condition_damaged(), READINGS_DAMAGED, ATTESTED_DAMAGED, SIG_DAMAGED, last_moment);

    s.next_tx(source());
    let r = s.take_immutable<StatusReport>();
    assert!(r.recorded_at() == last_moment, EWrongReport);
    ts::return_immutable(r);

    e.destroy();
    s.end();
}

#[test, expected_failure(abort_code = report::EWrongLog)]
fun a_report_into_another_artworks_log_aborts() {
    let mut s = setup_with_source();
    fixtures::mint_other(&mut s, artist(), b"Other", b"blob-other", vector[], 2_000);
    fixtures::intake(&mut s, gallery_a(), 2_500); // the most recent artwork: the other one
    let e = accepted_enclave(&mut s);
    s.next_tx(source());
    let a = fixture_artwork(&s);
    let mut other_log = s.take_shared<ReportLog>(); // most recent: the other artwork's
    assert!(other_log.log_artwork() != object::id(&a), EWrongState);
    let mut channel = s.take_shared<ChannelStats>();
    let sources = s.take_shared<Registry<Source>>();
    let c = fixtures::clock_at(&mut s, 4_500);
    let policy = s.take_shared<ChannelPolicy>();
    let config = s.take_shared<EnclaveConfig<ReportChannel>>();
    report::record_report(
        &a, &mut other_log, &mut channel, &sources, &policy, &config, &e,
        source(), report::condition_damaged(), READINGS_DAMAGED, ATTESTED_DAMAGED, SIG_DAMAGED,
        &c, s.ctx(),
    );
    abort
}

// Channel policy: the aggregation window

#[test]
fun the_authority_changes_the_window() {
    let mut s = fixtures::setup();
    s.next_tx(fixtures::authority());
    let cap = s.take_from_sender<AdminCap>();
    let mut policy = s.take_shared<ChannelPolicy>();
    let c = fixtures::clock_at(&mut s, 7);
    policy.set_window_ms(&cap, 5_000, &c, s.ctx());
    assert!(policy.window_ms() == 5_000, EWrongState);
    let events = event::events_by_type<WindowChanged>();
    assert!(events.length() == 1, EWrongCounter);
    let expected = report::window_changed_for_testing(report::default_window_ms(), 5_000, fixtures::authority(), 7);
    assert!(events[0] == expected, EWrongCounter);
    c.destroy_for_testing();
    ts::return_shared(policy);
    s.return_to_sender(cap);
    s.end();
}

#[test, expected_failure(abort_code = report::EInvalidWindow)]
fun a_window_above_one_day_is_refused() {
    let mut s = fixtures::setup();
    s.next_tx(fixtures::authority());
    let cap = s.take_from_sender<AdminCap>();
    let mut policy = s.take_shared<ChannelPolicy>();
    let c = clock::create_for_testing(s.ctx());
    policy.set_window_ms(&cap, report::max_window_ms() + 1, &c, s.ctx());
    abort
}

#[test, expected_failure(abort_code = report::EInvalidWindow)]
fun a_window_below_one_second_is_refused() {
    let mut s = fixtures::setup();
    s.next_tx(fixtures::authority());
    let cap = s.take_from_sender<AdminCap>();
    let mut policy = s.take_shared<ChannelPolicy>();
    let c = clock::create_for_testing(s.ctx());
    policy.set_window_ms(&cap, 999, &c, s.ctx());
    abort
}

// The enclave the authority accepts

#[test, expected_failure(abort_code = report::EWrongEnclave)]
fun an_enclave_the_authority_has_not_accepted_aborts() {
    let mut s = setup_with_source();
    s.next_tx(source());
    let e = enclave::new_enclave_for_testing<ReportChannel>(PK, s.ctx());
    submit(&mut s, &e, source(), source(), report::condition_damaged(), READINGS_DAMAGED, ATTESTED_DAMAGED, SIG_DAMAGED, 4_500);
    e.destroy();
    s.end();
}

#[test, expected_failure(abort_code = report::EStaleEnclave)]
fun an_enclave_of_retired_measurements_aborts() {
    let mut s = setup_with_source();
    let e = accepted_enclave(&mut s);

    s.next_tx(fixtures::authority());
    let cap = s.take_from_sender<Cap<ReportChannel>>();
    let mut config = s.take_shared<EnclaveConfig<ReportChannel>>();
    enclave::update_pcrs(&mut config, &cap, PCR_NEXT, PCR_NEXT, PCR_NEXT);
    s.return_to_sender(cap);
    ts::return_shared(config);

    submit(&mut s, &e, source(), source(), report::condition_damaged(), READINGS_DAMAGED, ATTESTED_DAMAGED, SIG_DAMAGED, 4_500);
    e.destroy();
    s.end();
}

// One report per window

#[test, expected_failure(abort_code = report::EReplayedReport)]
fun the_same_report_cannot_be_recorded_twice() {
    let mut s = setup_with_source();
    let e = accepted_enclave(&mut s);
    submit(&mut s, &e, source(), source(), report::condition_damaged(), READINGS_DAMAGED, ATTESTED_DAMAGED, SIG_DAMAGED, 4_500);
    submit(&mut s, &e, stranger(), source(), report::condition_damaged(), READINGS_DAMAGED, ATTESTED_DAMAGED, SIG_DAMAGED, 4_600);
    e.destroy();
    s.end();
}

#[test, expected_failure(abort_code = report::EFutureReport)]
fun a_report_stamped_ahead_of_the_chain_aborts() {
    let mut s = setup_with_source();
    let e = accepted_enclave(&mut s);
    let just_too_early = ATTESTED_AHEAD - report::clock_skew_ms() - 1;
    submit(&mut s, &e, source(), source(), report::condition_ok(), READINGS_AHEAD, ATTESTED_AHEAD, SIG_AHEAD, just_too_early);
    e.destroy();
    s.end();
}

#[test]
fun a_report_within_the_tolerated_skew_is_recorded() {
    let mut s = setup_with_source();
    let e = accepted_enclave(&mut s);
    let earliest = ATTESTED_AHEAD - report::clock_skew_ms();
    submit(&mut s, &e, source(), source(), report::condition_ok(), READINGS_AHEAD, ATTESTED_AHEAD, SIG_AHEAD, earliest);

    s.next_tx(source());
    let r = s.take_immutable<StatusReport>();
    assert!(r.is_ok() && r.readings() == READINGS_AHEAD, EWrongReport);
    ts::return_immutable(r);

    e.destroy();
    s.end();
}

#[test, expected_failure(abort_code = report::EEmptyReport)]
fun a_report_of_no_readings_aborts() {
    let mut s = setup_with_source();
    let e = accepted_enclave(&mut s);
    submit(&mut s, &e, source(), source(), report::condition_damaged(), 0, ATTESTED_DAMAGED, SIG_DAMAGED, 4_500);
    e.destroy();
    s.end();
}

// One enclave config per channel

#[test, expected_failure(abort_code = report::EConfigExists)]
fun a_second_config_aborts() {
    let mut s = setup_with_source();
    s.next_tx(fixtures::authority());
    let cap = s.take_from_sender<AdminCap>();
    let mut policy = s.take_shared<ChannelPolicy>();
    report::create_config(&mut policy, &cap, PCR, PCR, PCR, s.ctx());
    abort
}

// A config made with the Cap directly is not the one the policy binds on the first accept
fun second_config(s: &mut Scenario) {
    s.next_tx(fixtures::authority());
    let cap = s.take_from_sender<Cap<ReportChannel>>();
    cap.create_enclave_config(b"another".to_string(), PCR, PCR, PCR, s.ctx());
    s.return_to_sender(cap);
}

#[test, expected_failure(abort_code = report::EWrongConfig)]
fun accepting_against_another_config_aborts() {
    let mut s = setup_with_source();
    let e = accepted_enclave(&mut s);
    second_config(&mut s);
    accept(&mut s, &e);
    abort
}

#[test, expected_failure(abort_code = report::EWrongConfig)]
fun a_report_against_another_config_aborts() {
    let mut s = setup_with_source();
    let e = accepted_enclave(&mut s);
    second_config(&mut s);
    submit(&mut s, &e, source(), source(), report::condition_damaged(), READINGS_DAMAGED, ATTESTED_DAMAGED, SIG_DAMAGED, 4_500);
    abort
}

#[test]
fun the_policy_binds_the_config_on_the_first_accept() {
    let mut s = setup_with_source();
    s.next_tx(fixtures::authority());
    let policy = s.take_shared<ChannelPolicy>();
    let config = s.take_shared<EnclaveConfig<ReportChannel>>();
    assert!(policy.cap().is_some() && policy.config().is_none(), EWrongState);
    ts::return_shared(policy);
    ts::return_shared(config);

    let e = accepted_enclave(&mut s);
    s.next_tx(fixtures::authority());
    let policy = s.take_shared<ChannelPolicy>();
    let config = s.take_shared<EnclaveConfig<ReportChannel>>();
    assert!(policy.config() == option::some(object::id(&config)), EWrongState);
    ts::return_shared(policy);
    ts::return_shared(config);
    e.destroy();
    s.end();
}

