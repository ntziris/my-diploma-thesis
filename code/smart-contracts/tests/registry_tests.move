#[test_only]
module art_tokenization::registry_tests;

use sui::clock;
use sui::test_scenario as ts;
use art_tokenization::admin::{Self, AdminCap};
use art_tokenization::registry::{Self, Registry, Gallery, Source};

const AUTHORITY: address = @0xA;
const GALLERY_A: address = @0xB;
const GALLERY_B: address = @0xC;
const INSPECTOR: address = @0xD;

fun setup(): ts::Scenario {
    let mut s = ts::begin(AUTHORITY);
    admin::init_for_testing(s.ctx());
    registry::init_for_testing(s.ctx());
    s.next_tx(AUTHORITY);
    s
}

#[test]
fun registries_are_independent() {
    let mut s = setup();
    let cap = s.take_from_sender<AdminCap>();
    let mut galleries = s.take_shared<Registry<Gallery>>();
    let mut sources = s.take_shared<Registry<Source>>();
    let clock = clock::create_for_testing(s.ctx());

    galleries.register(&cap, GALLERY_A, b"Gallery A".to_string(), b"".to_string(), &clock, s.ctx());
    galleries.register(&cap, GALLERY_B, b"Gallery B".to_string(), b"".to_string(), &clock, s.ctx());
    sources.register(&cap, INSPECTOR, b"Inspector".to_string(), b"inspector".to_string(), &clock, s.ctx());

    assert!(galleries.active_count() == 2);
    assert!(sources.active_count() == 1);
    assert!(sources.kind(INSPECTOR) == b"inspector".to_string());
    // a gallery is not a source and vice versa
    assert!(!sources.is_active(GALLERY_A));
    assert!(!galleries.is_active(INSPECTOR));
    // enumeration in registration order, per registry
    assert!(galleries.members() == vector[GALLERY_A, GALLERY_B]);
    assert!(sources.members() == vector[INSPECTOR]);

    clock.destroy_for_testing();
    ts::return_shared(galleries);
    ts::return_shared(sources);
    s.return_to_sender(cap);
    s.end();
}

#[test, expected_failure(abort_code = registry::EAlreadyActive)]
fun register_twice_aborts() {
    let mut s = setup();
    let cap = s.take_from_sender<AdminCap>();
    let mut reg = s.take_shared<Registry<Gallery>>();
    let clock = clock::create_for_testing(s.ctx());
    reg.register(&cap, GALLERY_A, b"Gallery A".to_string(), b"".to_string(), &clock, s.ctx());
    reg.register(&cap, GALLERY_A, b"Gallery A".to_string(), b"".to_string(), &clock, s.ctx());
    abort
}

#[test, expected_failure(abort_code = registry::ENotRegistered)]
fun revoke_unknown_aborts() {
    let mut s = setup();
    let cap = s.take_from_sender<AdminCap>();
    let mut reg = s.take_shared<Registry<Gallery>>();
    let clock = clock::create_for_testing(s.ctx());
    reg.revoke(&cap, GALLERY_A, &clock, s.ctx());
    abort
}

#[test, expected_failure(abort_code = registry::EAlreadyRevoked)]
fun revoke_twice_aborts() {
    let mut s = setup();
    let cap = s.take_from_sender<AdminCap>();
    let mut reg = s.take_shared<Registry<Gallery>>();
    let clock = clock::create_for_testing(s.ctx());
    reg.register(&cap, GALLERY_A, b"Gallery A".to_string(), b"".to_string(), &clock, s.ctx());
    reg.revoke(&cap, GALLERY_A, &clock, s.ctx());
    reg.revoke(&cap, GALLERY_A, &clock, s.ctx());
    abort
}

#[test, expected_failure(abort_code = registry::EEmptyName)]
fun register_without_name_aborts() {
    let mut s = setup();
    let cap = s.take_from_sender<AdminCap>();
    let mut reg = s.take_shared<Registry<Gallery>>();
    let clock = clock::create_for_testing(s.ctx());
    reg.register(&cap, GALLERY_A, b"".to_string(), b"".to_string(), &clock, s.ctx());
    abort
}
