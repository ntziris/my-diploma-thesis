#[test_only]
module art_tokenization::custody_tests;

use sui::address;
use sui::event;
use sui::test_scenario::{Self as ts, Scenario};
use art_tokenization::artwork::{Self, Artwork, Catalog, StorageAttached};
use art_tokenization::custody::{Self, Redeemed, RedemptionWithdrawn};
use art_tokenization::fixtures::{setup, setup_fractionalised, clock_at, intake, reassign, revoke, report_loss};
use art_tokenization::registry::{Registry, Gallery};
use art_tokenization::stats::Stats;

const GALLERY_A: address = @0xB;
const GALLERY_B: address = @0xC;
const ARTIST: address = @0xD;
const STRANGER: address = @0xE;

#[error(code = 0)]
const EWrongState: vector<u8> = b"unexpected artwork state";
#[error(code = 1)]
const EWrongCounter: vector<u8> = b"unexpected counter";
#[error(code = 2)]
const EWrongEvent: vector<u8> = b"unexpected event content";

// Helpers

fun redeem_request(s: &mut Scenario, by: address, at: u64) {
    s.next_tx(by);
    let mut a = s.take_shared<Artwork>();
    let c = clock_at(s, at);
    custody::redeem_request(&mut a, b"collecting it".to_string(), &c, s.ctx());
    c.destroy_for_testing();
    ts::return_shared(a);
}

fun redeem_withdraw(s: &mut Scenario, by: address, at: u64) {
    s.next_tx(by);
    let mut a = s.take_shared<Artwork>();
    let c = clock_at(s, at);
    custody::redeem_withdraw(&mut a, &c, s.ctx());
    c.destroy_for_testing();
    ts::return_shared(a);
}

fun redeem_confirm(s: &mut Scenario, by: address, at: u64) {
    s.next_tx(by);
    let mut a = s.take_shared<Artwork>();
    let reg = s.take_shared<Registry<Gallery>>();
    let mut catalog = s.take_shared<Catalog>();
    let c = clock_at(s, at);
    custody::redeem_confirm(&mut a, &reg, &mut catalog, &c, s.ctx());
    c.destroy_for_testing();
    ts::return_shared(a);
    ts::return_shared(reg);
    ts::return_shared(catalog);
}

fun blob(n: u8): ID { object::id_from_address(address::from_u256(0x50 + (n as u256))) }

fun attach_storage(s: &mut Scenario, by: address, ids: vector<ID>) {
    s.next_tx(by);
    let mut a = s.take_shared<Artwork>();
    let reg = s.take_shared<Registry<Gallery>>();
    custody::attach_storage(&mut a, &reg, ids, s.ctx());
    ts::return_shared(a);
    ts::return_shared(reg);
}

// Storage references

#[test]
fun the_owner_attaches_the_storage() {
    let mut s = setup();
    s.next_tx(ARTIST);
    let mut a = s.take_shared<Artwork>();
    let reg = s.take_shared<Registry<Gallery>>();
    assert!(a.storage().is_empty(), EWrongState);
    custody::attach_storage(&mut a, &reg, vector[blob(1), blob(2)], s.ctx());
    assert!(a.storage() == vector[blob(1), blob(2)], EWrongState);
    let events = event::events_by_type<StorageAttached>();
    assert!(events.length() == 1, EWrongEvent);
    assert!(events[0] == artwork::storage_attached_for_testing(object::id(&a), vector[blob(1), blob(2)]), EWrongEvent);
    ts::return_shared(a);
    ts::return_shared(reg);
    s.end();
}

#[test]
fun the_custodian_appends_without_duplicates() {
    let mut s = setup();
    intake(&mut s, GALLERY_A, 1);
    attach_storage(&mut s, ARTIST, vector[blob(1), blob(2)]);

    s.next_tx(GALLERY_A);
    let mut a = s.take_shared<Artwork>();
    let reg = s.take_shared<Registry<Gallery>>();
    custody::attach_storage(&mut a, &reg, vector[blob(3), blob(2)], s.ctx());
    assert!(a.storage() == vector[blob(1), blob(2), blob(3)], EWrongState);
    let events = event::events_by_type<StorageAttached>();
    assert!(events.length() == 1, EWrongEvent);
    assert!(events[0] == artwork::storage_attached_for_testing(object::id(&a), vector[blob(3)]), EWrongEvent);
    ts::return_shared(a);
    ts::return_shared(reg);
    s.end();
}

#[test, expected_failure(abort_code = artwork::EEmptyStorage)]
fun attaching_no_storage_aborts() {
    let mut s = setup();
    attach_storage(&mut s, ARTIST, vector[]);
    abort
}

#[test, expected_failure(abort_code = custody::ENotOwnerNorCustodian)]
fun attaching_storage_by_a_third_party_aborts() {
    let mut s = setup();
    intake(&mut s, GALLERY_A, 1);
    attach_storage(&mut s, STRANGER, vector[blob(1)]);
    abort
}

#[test, expected_failure(abort_code = custody::ENotOwnerNorCustodian)]
fun attaching_storage_by_a_revoked_custodian_aborts() {
    let mut s = setup();
    intake(&mut s, GALLERY_A, 1);
    revoke(&mut s, GALLERY_A);
    attach_storage(&mut s, GALLERY_A, vector[blob(1)]);
    abort
}

// Intake

#[test, expected_failure(abort_code = custody::ENotDesignated)]
fun intake_by_other_registered_gallery_aborts() {
    let mut s = setup();
    intake(&mut s, GALLERY_B, 1);
    abort
}

#[test, expected_failure(abort_code = custody::ENotActive)]
fun intake_by_unregistered_address_aborts() {
    let mut s = setup();
    intake(&mut s, STRANGER, 1);
    abort
}

#[test, expected_failure(abort_code = custody::ENotDesignated)]
fun second_intake_while_held_aborts() {
    let mut s = setup();
    intake(&mut s, GALLERY_A, 1);
    intake(&mut s, GALLERY_A, 2);
    abort
}

// Reassignment after revocation

#[test, expected_failure(abort_code = custody::ECustodianActive)]
fun reassign_while_custodian_active_aborts() {
    let mut s = setup();
    intake(&mut s, GALLERY_A, 1);
    reassign(&mut s, GALLERY_B, 2);
    abort
}

#[test, expected_failure(abort_code = custody::EGalleryNotActive)]
fun reassign_to_revoked_gallery_aborts() {
    let mut s = setup();
    intake(&mut s, GALLERY_A, 1);
    revoke(&mut s, GALLERY_A);
    revoke(&mut s, GALLERY_B);
    reassign(&mut s, GALLERY_B, 2);
    abort
}

#[test, expected_failure(abort_code = custody::ENoCustody)]
fun reassign_before_any_intake_aborts() {
    let mut s = setup();
    reassign(&mut s, GALLERY_B, 1);
    abort
}

// Redemption

#[test]
fun a_request_confirmed_by_the_custodian_redeems_the_artwork() {
    let mut s = setup();
    intake(&mut s, GALLERY_A, 1);
    redeem_request(&mut s, ARTIST, 2);

    s.next_tx(ARTIST);
    let a = s.take_shared<Artwork>();
    assert!(custody::redemption_pending(&a), EWrongState);
    assert!(custody::redemption(&a).destroy_some().requested_by() == ARTIST, EWrongState);
    ts::return_shared(a);

    s.next_tx(GALLERY_A);
    let mut a = s.take_shared<Artwork>();
    let reg = s.take_shared<Registry<Gallery>>();
    let mut catalog = s.take_shared<Catalog>();
    let c = clock_at(&mut s, 3);
    custody::redeem_confirm(&mut a, &reg, &mut catalog, &c, s.ctx());
    assert!(event::events_by_type<Redeemed>().length() == 1, EWrongCounter);
    c.destroy_for_testing();
    ts::return_shared(reg);
    assert!(a.is_terminal() && !a.is_lost(), EWrongState);
    assert!(a.is_owner(ARTIST), EWrongState);
    assert!(!custody::is_open(&a) && custody::until(&a) == option::some(3), EWrongState);
    assert!(!custody::redemption_pending(&a), EWrongState);
    assert!(catalog.works_in_custody_of(GALLERY_A).is_empty(), EWrongState);
    assert!(catalog.catalog_live() == 0, EWrongCounter);
    let last = a.history_entry(a.history_len() - 1);
    assert!(last.history_kind() == artwork::hist_redeemed() && last.history_actor() == GALLERY_A, EWrongState);
    ts::return_shared(a);
    ts::return_shared(catalog);
    s.end();
}

#[test]
fun the_requester_can_withdraw_the_request() {
    let mut s = setup();
    intake(&mut s, GALLERY_A, 1);
    redeem_request(&mut s, ARTIST, 2);

    s.next_tx(ARTIST);
    let mut a = s.take_shared<Artwork>();
    let c = clock_at(&mut s, 3);
    custody::redeem_withdraw(&mut a, &c, s.ctx());
    assert!(event::events_by_type<RedemptionWithdrawn>().length() == 1, EWrongCounter);
    c.destroy_for_testing();
    assert!(!custody::redemption_pending(&a) && custody::is_open(&a), EWrongState);
    assert!(!a.is_terminal(), EWrongState);
    let last = a.history_entry(a.history_len() - 1);
    assert!(last.history_kind() == artwork::hist_redeem_withdrawn(), EWrongState);
    ts::return_shared(a);
    s.end();
}

#[test, expected_failure(abort_code = custody::ENotRequester)]
fun withdrawal_by_someone_else_aborts() {
    let mut s = setup();
    intake(&mut s, GALLERY_A, 1);
    redeem_request(&mut s, ARTIST, 2);
    redeem_withdraw(&mut s, STRANGER, 3);
    abort
}

#[test, expected_failure(abort_code = custody::ENoRequest)]
fun withdrawal_without_a_request_aborts() {
    let mut s = setup();
    intake(&mut s, GALLERY_A, 1);
    redeem_withdraw(&mut s, ARTIST, 2);
    abort
}

#[test, expected_failure(abort_code = custody::ENoRequest)]
fun confirmation_without_a_request_aborts() {
    let mut s = setup();
    intake(&mut s, GALLERY_A, 1);
    redeem_confirm(&mut s, GALLERY_A, 2);
    abort
}

#[test, expected_failure(abort_code = custody::ENoRequest)]
fun confirmation_on_a_fractionalised_artwork_aborts() {
    let mut s = setup_fractionalised(100);
    redeem_confirm(&mut s, GALLERY_A, 4);
    abort
}

#[test, expected_failure(abort_code = custody::ERequestPending)]
fun a_second_request_aborts() {
    let mut s = setup();
    intake(&mut s, GALLERY_A, 1);
    redeem_request(&mut s, ARTIST, 2);
    redeem_request(&mut s, ARTIST, 3);
    abort
}

// Loss

#[test]
fun loss_of_a_fractionalised_artwork_zeroes_the_supply() {
    let mut s = setup_fractionalised(100);
    report_loss(&mut s, GALLERY_A, 4);

    s.next_tx(ARTIST);
    let a = s.take_shared<Artwork>();
    let stats = s.take_shared<Stats>();
    assert!(a.is_lost(), EWrongState);
    assert!(a.supply() == 0, EWrongCounter);
    assert!(a.vault().is_some() && a.owner().is_none(), EWrongState);
    assert!(stats.vaults_open() == 0 && stats.fractions_outstanding() == 0, EWrongCounter);
    ts::return_shared(a);
    ts::return_shared(stats);
    s.end();
}

#[test, expected_failure(abort_code = custody::ENotActive)]
fun loss_by_revoked_custodian_aborts() {
    let mut s = setup();
    intake(&mut s, GALLERY_A, 1);
    revoke(&mut s, GALLERY_A);
    report_loss(&mut s, GALLERY_A, 2);
    abort
}

