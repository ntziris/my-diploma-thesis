#[test_only]
module art_tokenization::market_tests;

use sui::clock;
use sui::coin::{Self, Coin};
use sui::sui::SUI;
use sui::test_scenario as ts;
use art_tokenization::admin::Params;
use art_tokenization::artwork::{Self, Artwork};
use art_tokenization::fixtures::{setup_fractionalised, set_royalty, report_loss, gallery_a, artist};
use art_tokenization::fraction::{Fraction, FractionVault};
use art_tokenization::market::{Self, Listing};
use art_tokenization::stats::Stats;

const INVESTOR_1: address = @0x11;
const INVESTOR_2: address = @0x12;
const MIST: u64 = 1_000_000;

// Helpers

fun list(s: &mut ts::Scenario, by: address, quantity: u64, price: u64) {
    s.next_tx(by);
    let mut a = s.take_shared<Artwork>();
    let mut v = s.take_shared<FractionVault>();
    let f = s.take_from_sender<Fraction>();
    let mut stats = s.take_shared<Stats>();
    let c = clock::create_for_testing(s.ctx());
    market::list(&mut a, &mut v, f, quantity, price, &mut stats, &c, s.ctx());
    c.destroy_for_testing();
    ts::return_shared(a);
    ts::return_shared(v);
    ts::return_shared(stats);
}

fun buy(s: &mut ts::Scenario, by: address, quantity: u64, pay: u64) {
    s.next_tx(by);
    let mut l = s.take_shared<Listing>();
    let mut a = s.take_shared<Artwork>();
    let mut v = s.take_shared<FractionVault>();
    let p = s.take_shared<Params>();
    let mut stats = s.take_shared<Stats>();
    let c = clock::create_for_testing(s.ctx());
    let payment = coin::mint_for_testing<SUI>(pay, s.ctx());
    market::buy(&mut l, &mut a, &mut v, &p, &mut stats, quantity, payment, &c, s.ctx());
    c.destroy_for_testing();
    ts::return_shared(l);
    ts::return_shared(a);
    ts::return_shared(v);
    ts::return_shared(p);
    ts::return_shared(stats);
}

fun cancel(s: &mut ts::Scenario, by: address) {
    s.next_tx(by);
    let mut l = s.take_shared<Listing>();
    let mut a = s.take_shared<Artwork>();
    let mut v = s.take_shared<FractionVault>();
    let mut stats = s.take_shared<Stats>();
    let c = clock::create_for_testing(s.ctx());
    market::cancel(&mut l, &mut a, &mut v, &mut stats, &c, s.ctx());
    c.destroy_for_testing();
    ts::return_shared(l);
    ts::return_shared(a);
    ts::return_shared(v);
    ts::return_shared(stats);
}

fun sui_balance(s: &mut ts::Scenario, who: address): u64 {
    s.next_tx(who);
    let ids = s.ids_for_sender<Coin<SUI>>();
    let mut total = 0;
    let mut i = 0;
    while (i < ids.length()) {
        let c = s.take_from_sender_by_id<Coin<SUI>>(ids[i]);
        total = total + c.value();
        s.return_to_sender(c);
        i = i + 1;
    };
    total
}

fun fraction_balance(s: &mut ts::Scenario, who: address): u64 {
    s.next_tx(who);
    let ids = s.ids_for_sender<Fraction>();
    let mut total = 0;
    let mut i = 0;
    while (i < ids.length()) {
        let f = s.take_from_sender_by_id<Fraction>(ids[i]);
        total = total + f.value();
        s.return_to_sender(f);
        i = i + 1;
    };
    total
}

// Listing

#[test, expected_failure(abort_code = market::EZeroPrice)]
fun list_at_zero_price_aborts() {
    let mut s = setup_fractionalised(100);
    list(&mut s, artist(), 10, 0);
    abort
}

#[test, expected_failure(abort_code = market::ENotSeller)]
fun cancel_by_non_seller_aborts() {
    let mut s = setup_fractionalised(100);
    list(&mut s, artist(), 10, MIST);
    cancel(&mut s, INVESTOR_1);
    abort
}

// Buying

#[test]
fun resale_pays_royalty_to_artist_and_rest_to_seller() {
    let mut s = setup_fractionalised(1_000);
    set_royalty(&mut s, 500); // 5%
    list(&mut s, artist(), 300, MIST);
    buy(&mut s, INVESTOR_1, 300, 300 * MIST);
    let artist_before = sui_balance(&mut s, artist());

    list(&mut s, INVESTOR_1, 100, 2 * MIST);
    buy(&mut s, INVESTOR_2, 100, 200 * MIST);

    let royalty = 200 * MIST * 500 / 10_000; // 10 SUI-ish in MIST units
    assert!(sui_balance(&mut s, artist()) == artist_before + royalty);
    assert!(sui_balance(&mut s, INVESTOR_1) == 200 * MIST - royalty);
    // conservation: artist share + seller share = price
    assert!(royalty + (200 * MIST - royalty) == 200 * MIST);
    assert!(fraction_balance(&mut s, INVESTOR_2) == 100);
    assert!(fraction_balance(&mut s, INVESTOR_1) == 200);
    // the counters: two sales, the royalty of the resale only, per artist
    s.next_tx(artist());
    let stats = s.take_shared<Stats>();
    assert!(stats.sales() == 2);
    assert!(stats.volume_mist() == 500 * MIST);
    assert!(stats.royalties_mist() == royalty);
    assert!(stats.royalties_of(artist()) == royalty);
    assert!(stats.royalties_of(INVESTOR_1) == 0);
    ts::return_shared(stats);
    let a = s.take_shared<Artwork>();
    assert!(a.trades() == 2);
    assert!(a.last_price() == 2 * MIST);
    assert!(a.open_listings() == 0);
    ts::return_shared(a);
    // both listings filled: the sellers' indexes are empty again
    s.next_tx(artist());
    let stats = s.take_shared<Stats>();
    assert!(stats.open_listings() == 0);
    assert!(stats.open_listings_of(artist()).is_empty() && stats.open_listings_of(INVESTOR_1).is_empty());
    ts::return_shared(stats);
    s.end();
}

#[test]
fun royalty_rounds_down_and_remainder_goes_to_seller() {
    let mut s = setup_fractionalised(1_000);
    set_royalty(&mut s, 250); // 2.5%
    list(&mut s, artist(), 1_000, 1);
    buy(&mut s, INVESTOR_1, 1_000, 1_000);
    list(&mut s, INVESTOR_1, 111, 3);
    buy(&mut s, INVESTOR_2, 111, 333);
    assert!(market::royalty_of(333, 250) == 8);
    assert!(sui_balance(&mut s, artist()) == 1_000 + 8);
    assert!(sui_balance(&mut s, INVESTOR_1) == 333 - 8);
    s.end();
}

#[test, expected_failure(abort_code = market::ESelfPurchase)]
fun buying_own_listing_aborts() {
    let mut s = setup_fractionalised(100);
    list(&mut s, artist(), 10, MIST);
    buy(&mut s, artist(), 10, 10 * MIST);
    abort
}

#[test, expected_failure(abort_code = market::EWrongPayment)]
fun underpaying_aborts() {
    let mut s = setup_fractionalised(100);
    list(&mut s, artist(), 10, MIST);
    buy(&mut s, INVESTOR_1, 10, 10 * MIST - 1);
    abort
}

#[test, expected_failure(abort_code = market::EWrongPayment)]
fun overpaying_aborts() {
    let mut s = setup_fractionalised(100);
    list(&mut s, artist(), 10, MIST);
    buy(&mut s, INVESTOR_1, 10, 10 * MIST + 1);
    abort
}

#[test, expected_failure(abort_code = market::EInsufficientQuantity)]
fun buying_more_than_listed_aborts() {
    let mut s = setup_fractionalised(100);
    list(&mut s, artist(), 10, MIST);
    buy(&mut s, INVESTOR_1, 11, 11 * MIST);
    abort
}

#[test, expected_failure(abort_code = market::EListingClosed)]
fun buying_from_closed_listing_aborts() {
    let mut s = setup_fractionalised(100);
    list(&mut s, artist(), 10, MIST);
    buy(&mut s, INVESTOR_1, 10, 10 * MIST);
    buy(&mut s, INVESTOR_2, 1, MIST);
    abort
}

// Terminal artwork

#[test, expected_failure(abort_code = artwork::ETerminal)]
fun buying_on_lost_artwork_aborts() {
    let mut s = setup_fractionalised(100);
    list(&mut s, artist(), 10, MIST);
    report_loss(&mut s, gallery_a(), 5_000);
    buy(&mut s, INVESTOR_1, 10, 10 * MIST);
    abort
}

#[test]
fun cancel_on_lost_artwork_still_returns_fractions() {
    let mut s = setup_fractionalised(100);
    list(&mut s, artist(), 40, MIST);
    report_loss(&mut s, gallery_a(), 5_000);
    cancel(&mut s, artist());
    assert!(fraction_balance(&mut s, artist()) == 100);
    s.next_tx(artist());
    let a = s.take_shared<Artwork>();
    assert!(a.open_listings() == 0);
    ts::return_shared(a);
    s.end();
}
