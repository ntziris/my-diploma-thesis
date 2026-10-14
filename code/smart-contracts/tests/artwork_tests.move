#[test_only]
module art_tokenization::artwork_tests;

use std::string::String;

use sui::clock;
use sui::test_scenario as ts;
use art_tokenization::admin::{Self, AdminCap};
use art_tokenization::artwork::{Self, Artwork, Catalog};
use art_tokenization::registry::{Self, Registry, Gallery};

const AUTHORITY: address = @0xA;
const GALLERY_A: address = @0xB;
const GALLERY_C: address = @0xC;
const ARTIST: address = @0xD;
const STRANGER: address = @0xE;

#[error(code = 0)]
const EWrongState: vector<u8> = b"unexpected artwork state";
#[error(code = 1)]
const EWrongEvent: vector<u8> = b"unexpected event content";

fun setup(): ts::Scenario {
    let mut s = ts::begin(AUTHORITY);
    admin::init_for_testing(s.ctx());
    registry::init_for_testing(s.ctx());
    artwork::init_for_testing(s.ctx());

    s.next_tx(AUTHORITY);
    {
        let cap = s.take_from_sender<AdminCap>();
        let mut reg = s.take_shared<Registry<Gallery>>();
        let clock = clock::create_for_testing(s.ctx());
        reg.register(&cap, GALLERY_A, b"Gallery A".to_string(), b"".to_string(), &clock, s.ctx());
        reg.register(&cap, GALLERY_C, b"Gallery C".to_string(), b"".to_string(), &clock, s.ctx());
        reg.revoke(&cap, GALLERY_C, &clock, s.ctx());
        clock.destroy_for_testing();
        ts::return_shared(reg);
        s.return_to_sender(cap);
    };
    s.next_tx(ARTIST);
    s
}

fun image_of(title: vector<u8>): String {
    let mut id = b"blob-";
    id.append(title);
    id.to_string()
}

fun words(list: vector<vector<u8>>): vector<String> {
    let mut out = vector[];
    let mut i = 0u64;
    while (i < list.length()) {
        out.push_back(list[i].to_string());
        i = i + 1;
    };
    out
}

fun mint_with(s: &mut ts::Scenario, title: vector<u8>, gallery: address, keywords: vector<String>, at: u64) {
    let mut catalog = s.take_shared<Catalog>();
    let reg = s.take_shared<Registry<Gallery>>();
    let mut clock = clock::create_for_testing(s.ctx());
    clock.set_for_testing(at);
    artwork::mint(
        &mut catalog,
        &reg,
        title.to_string(),
        b"Maria K.".to_string(),
        b"2025".to_string(),
        b"oil on canvas".to_string(),
        b"80 x 60 cm".to_string(),
        b"".to_string(),
        image_of(title),
        b"blob-hires".to_string(),
        title,
        gallery,
        keywords,
        &clock,
        s.ctx(),
    );
    clock.destroy_for_testing();
    ts::return_shared(catalog);
    ts::return_shared(reg);
}

fun mint(s: &mut ts::Scenario, title: vector<u8>, gallery: address, at: u64) {
    mint_with(s, title, gallery, words(vector[b"sunset", b"maria"]), at);
}

// Mint

#[test, expected_failure(abort_code = artwork::EGalleryNotActive)]
fun mint_naming_unregistered_gallery_aborts() {
    let mut s = setup();
    mint(&mut s, b"Sunset II", @0xEE, 1);
    abort
}

#[test, expected_failure(abort_code = artwork::EGalleryNotActive)]
fun mint_naming_revoked_gallery_aborts() {
    let mut s = setup();
    mint(&mut s, b"Sunset II", GALLERY_C, 1);
    abort
}

#[test, expected_failure(abort_code = artwork::EEmptyTitle)]
fun mint_without_title_aborts() {
    let mut s = setup();
    mint(&mut s, b"", GALLERY_A, 1);
    abort
}

// The keyword index

// Cancel

