#[test_only]
module art_tokenization::fraction_tests;

use sui::event;
use sui::test_scenario::{Self as ts, Scenario};
use art_tokenization::artwork::{Self, Artwork, Catalog};
use art_tokenization::fixtures::{setup, setup_fractionalised, clock_at, mint_other, intake, certify, fractionalize, report_loss, gallery_a, artist, stranger};
use art_tokenization::fraction::{Self, Fraction, FractionVault, FractionBurned};
use art_tokenization::stats::Stats;

const INVESTOR_1: address = @0x11;
const INVESTOR_2: address = @0x12;

#[error(code = 0)]
const EWrongState: vector<u8> = b"unexpected artwork state";
#[error(code = 1)]
const EWrongCounter: vector<u8> = b"unexpected counter";
#[error(code = 2)]
const EWrongEvent: vector<u8> = b"unexpected event content";

// Helpers

fun consolidate(s: &mut Scenario, by: address, at: u64) {
    s.next_tx(by);
    let mut a = s.take_shared<Artwork>();
    let v = s.take_shared<FractionVault>();
    let f = s.take_from_sender<Fraction>();
    let mut catalog = s.take_shared<Catalog>();
    let mut stats = s.take_shared<Stats>();
    let c = clock_at(s, at);
    fraction::consolidate(&mut a, v, f, &mut catalog, &mut stats, &c, s.ctx());
    c.destroy_for_testing();
    ts::return_shared(a);
    ts::return_shared(catalog);
    ts::return_shared(stats);
}

fun burn(s: &mut Scenario, by: address) {
    s.next_tx(by);
    let a = s.take_shared<Artwork>();
    let f = s.take_from_sender<Fraction>();
    fraction::burn(f, &a, s.ctx());
    ts::return_shared(a);
}

// Fractionalise

#[test, expected_failure(abort_code = fraction::ENoCustody)]
fun fractionalize_without_custody_aborts() {
    let mut s = setup();
    fractionalize(&mut s, artist(), 100, 1);
    abort
}

#[test, expected_failure(abort_code = fraction::ENoCertificate)]
fun fractionalize_without_certificate_aborts() {
    let mut s = setup();
    intake(&mut s, gallery_a(), 1);
    fractionalize(&mut s, artist(), 100, 2);
    abort
}

#[test, expected_failure(abort_code = artwork::ENotOwner)]
fun fractionalize_by_non_owner_aborts() {
    let mut s = setup();
    intake(&mut s, gallery_a(), 1);
    certify(&mut s, gallery_a(), 2);
    fractionalize(&mut s, stranger(), 100, 3);
    abort
}

#[test, expected_failure(abort_code = fraction::EZeroSupply)]
fun fractionalize_with_zero_supply_aborts() {
    let mut s = setup();
    intake(&mut s, gallery_a(), 1);
    certify(&mut s, gallery_a(), 2);
    fractionalize(&mut s, artist(), 0, 3);
    abort
}

#[test, expected_failure(abort_code = fraction::EAlreadyFractionalised)]
fun fractionalize_twice_aborts() {
    let mut s = setup_fractionalised(100);
    fractionalize(&mut s, artist(), 100, 4);
    abort
}

// Split / merge

#[test, expected_failure(abort_code = fraction::EInvalidSplit)]
fun split_zero_aborts() {
    let mut s = setup_fractionalised(100);
    let mut f = s.take_from_sender<Fraction>();
    let _part = f.split(0, s.ctx());
    abort
}

#[test, expected_failure(abort_code = fraction::EWrongVault)]
fun merge_across_vaults_aborts() {
    // two artworks, two vaults, both held by the artist
    let mut s = setup_fractionalised(100);
    mint_other(&mut s, artist(), b"Second", b"blob", vector[], 9);
    // the helpers take the most recent shared Artwork, i.e. the second one
    intake(&mut s, gallery_a(), 10);
    certify(&mut s, gallery_a(), 11);
    fractionalize(&mut s, artist(), 50, 12);
    s.next_tx(artist());
    let ids = s.ids_for_sender<Fraction>();
    let mut a = s.take_from_sender_by_id<Fraction>(ids[0]);
    let b = s.take_from_sender_by_id<Fraction>(ids[1]);
    a.merge(b);
    abort
}

// Consolidate

#[test]
fun the_full_supply_in_one_fraction_restores_the_owner() {
    let mut s = setup_fractionalised(100);
    s.next_tx(artist());
    let mut f = s.take_from_sender<Fraction>();
    let part = f.split(40, s.ctx());
    fraction::transfer_for_testing(part, INVESTOR_1);
    s.return_to_sender(f);

    s.next_tx(INVESTOR_1);
    let part = s.take_from_sender<Fraction>();
    fraction::transfer_for_testing(part, artist());

    s.next_tx(artist());
    let mut f = s.take_from_sender<Fraction>();
    let ids = s.ids_for_sender<Fraction>();
    let other = if (ids[0] == object::id(&f)) ids[1] else ids[0];
    f.merge(s.take_from_sender_by_id<Fraction>(other));
    s.return_to_sender(f);

    consolidate(&mut s, artist(), 4);

    s.next_tx(artist());
    let a = s.take_shared<Artwork>();
    let catalog = s.take_shared<Catalog>();
    let stats = s.take_shared<Stats>();
    assert!(a.is_certified() && a.is_owner(artist()), EWrongState);
    assert!(a.vault().is_none() && a.supply() == 0, EWrongState);
    assert!(catalog.works_owned_by(artist()).contains(&object::id(&a)), EWrongState);
    assert!(stats.vaults_open() == 0 && stats.fractions_outstanding() == 0, EWrongCounter);
    assert!(s.ids_for_sender<Fraction>().is_empty(), EWrongState);
    let last = a.history_entry(a.history_len() - 1);
    assert!(last.history_kind() == artwork::hist_consolidated() && last.history_quantity() == 100, EWrongState);
    ts::return_shared(a);
    ts::return_shared(catalog);
    ts::return_shared(stats);
    s.end();
}

#[test, expected_failure(abort_code = fraction::ENotFullSupply)]
fun consolidating_a_partial_supply_aborts() {
    let mut s = setup_fractionalised(100);
    s.next_tx(artist());
    let mut f = s.take_from_sender<Fraction>();
    let part = f.split(40, s.ctx());
    fraction::transfer_for_testing(part, INVESTOR_1);
    s.return_to_sender(f);
    consolidate(&mut s, artist(), 4);
    abort
}

// Burn after loss

#[test]
fun a_fraction_of_a_lost_artwork_can_be_burned() {
    let mut s = setup_fractionalised(100);
    report_loss(&mut s, gallery_a(), 4);

    s.next_tx(artist());
    let a = s.take_shared<Artwork>();
    let v = s.take_shared<FractionVault>();
    let f = s.take_from_sender<Fraction>();
    fraction::burn(f, &a, s.ctx());
    let events = event::events_by_type<FractionBurned>();
    assert!(events.length() == 1, EWrongCounter);
    let expected = fraction::burned_for_testing(object::id(&a), object::id(&v), artist(), 100);
    assert!(events[0] == expected, EWrongEvent);
    ts::return_shared(a);
    ts::return_shared(v);

    s.next_tx(artist());
    assert!(s.ids_for_sender<Fraction>().is_empty(), EWrongState);
    s.end();
}

#[test, expected_failure(abort_code = fraction::EArtworkNotLost)]
fun burning_a_fraction_of_a_live_artwork_aborts() {
    let mut s = setup_fractionalised(100);
    burn(&mut s, artist());
    abort
}

#[test]
fun supply_is_conserved_across_many_operations() {
    let mut s = setup_fractionalised(1_000);
    let holders = vector[artist(), INVESTOR_1, INVESTOR_2];
    let mut i = 0;
    while (i < 30) {
        let from = holders[i % 3];
        let to = holders[(i + 1) % 3];
        s.next_tx(from);
        let ids = s.ids_for_sender<Fraction>();
        if (ids.length() > 0) {
            let mut f = s.take_from_sender_by_id<Fraction>(ids[0]);
            let amount = (i * 37 + 11) % 200 + 1;
            if (amount < f.value()) {
                let part = f.split(amount, s.ctx());
                fraction::transfer_for_testing(part, to);
            } else {
                fraction::transfer_for_testing(f, to);
                i = i + 1;
                continue
            };
            s.return_to_sender(f);
        };
        i = i + 1;
    };
    // everybody merges and the totals add up to the supply
    let mut total = 0;
    let mut h = 0;
    while (h < 3) {
        s.next_tx(holders[h]);
        let ids = s.ids_for_sender<Fraction>();
        let mut j = 0;
        while (j < ids.length()) {
            let f = s.take_from_sender_by_id<Fraction>(ids[j]);
            total = total + f.value();
            s.return_to_sender(f);
            j = j + 1;
        };
        h = h + 1;
    };
    assert!(total == 1_000);
    s.end();
}
