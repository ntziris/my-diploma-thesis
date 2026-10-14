#[test_only]
module art_tokenization::fixtures;

use std::string::String;
use sui::clock::{Self, Clock};
use sui::test_scenario::{Self as ts, Scenario};
use art_tokenization::admin::{Self, AdminCap};
use art_tokenization::artwork::{Self, Artwork, Catalog};
use art_tokenization::certificate;
use art_tokenization::custody;
use art_tokenization::registry::{Self, Registry, Gallery, Source};
use art_tokenization::report;
use art_tokenization::stats::{Self, Stats};

public fun authority(): address { @0xA }
public fun gallery_a(): address { @0xB }
public fun gallery_b(): address { @0xC }
public fun artist(): address { @0xD }
public fun stranger(): address { @0xE }
public fun source(): address { @0xF }

public fun keywords(): vector<String> {
    vector[b"sunset".to_string(), b"ii".to_string(), b"maria".to_string(), b"2025".to_string(), b"oil".to_string()]
}

public fun setup(): Scenario {
    let mut s = ts::begin(authority());
    admin::init_for_testing(s.ctx());
    registry::init_for_testing(s.ctx());
    artwork::init_for_testing(s.ctx());
    stats::init_for_testing(s.ctx());
    report::init_for_testing(s.ctx());
    s.next_tx(authority());
    {
        let cap = s.take_from_sender<AdminCap>();
        let mut reg = s.take_shared<Registry<Gallery>>();
        let c = clock::create_for_testing(s.ctx());
        reg.register(&cap, gallery_a(), b"Gallery A".to_string(), b"".to_string(), &c, s.ctx());
        reg.register(&cap, gallery_b(), b"Gallery B".to_string(), b"".to_string(), &c, s.ctx());
        c.destroy_for_testing();
        ts::return_shared(reg);
        s.return_to_sender(cap);
    };
    s.next_tx(artist());
    {
        let mut catalog = s.take_shared<Catalog>();
        let reg = s.take_shared<Registry<Gallery>>();
        let c = clock::create_for_testing(s.ctx());
        artwork::mint(
            &mut catalog, &reg,
            b"Sunset II".to_string(), b"Maria K.".to_string(), b"2025".to_string(),
            b"oil on canvas".to_string(), b"80 x 60 cm".to_string(), b"".to_string(),
            b"blob-preview".to_string(), b"blob-hires".to_string(), b"salt-sunset",
            gallery_a(), keywords(), &c, s.ctx(),
        );
        c.destroy_for_testing();
        ts::return_shared(catalog);
        ts::return_shared(reg);
    };
    s
}

public fun clock_at(s: &mut Scenario, ms: u64): Clock {
    let mut c = clock::create_for_testing(s.ctx());
    c.set_for_testing(ms);
    c
}

public fun mint_other(s: &mut Scenario, by: address, title: vector<u8>, image: vector<u8>, words: vector<String>, at: u64) {
    s.next_tx(by);
    let mut catalog = s.take_shared<Catalog>();
    let reg = s.take_shared<Registry<Gallery>>();
    let c = clock_at(s, at);
    artwork::mint(
        &mut catalog, &reg,
        title.to_string(), b"Someone".to_string(), b"2024".to_string(), b"acrylic".to_string(),
        b"".to_string(), b"".to_string(), image.to_string(), b"".to_string(), title,
        gallery_a(), words, &c, s.ctx(),
    );
    c.destroy_for_testing();
    ts::return_shared(catalog);
    ts::return_shared(reg);
}

public fun mint_salted(
    s: &mut Scenario,
    by: address,
    title: vector<u8>,
    image: vector<u8>,
    salt: vector<u8>,
    at: u64,
) {
    s.next_tx(by);
    let mut catalog = s.take_shared<Catalog>();
    let reg = s.take_shared<Registry<Gallery>>();
    let c = clock_at(s, at);
    artwork::mint(
        &mut catalog, &reg,
        title.to_string(), b"Someone".to_string(), b"2024".to_string(), b"acrylic".to_string(),
        b"".to_string(), b"".to_string(), image.to_string(), b"".to_string(), salt,
        gallery_a(), vector[], &c, s.ctx(),
    );
    c.destroy_for_testing();
    ts::return_shared(catalog);
    ts::return_shared(reg);
}

public fun revoke(s: &mut Scenario, who: address) {
    s.next_tx(authority());
    let cap = s.take_from_sender<AdminCap>();
    let mut reg = s.take_shared<Registry<Gallery>>();
    let c = clock::create_for_testing(s.ctx());
    reg.revoke(&cap, who, &c, s.ctx());
    c.destroy_for_testing();
    ts::return_shared(reg);
    s.return_to_sender(cap);
}

public fun intake(s: &mut Scenario, by: address, at: u64) {
    s.next_tx(by);
    let mut a = s.take_shared<Artwork>();
    let reg = s.take_shared<Registry<Gallery>>();
    let mut catalog = s.take_shared<Catalog>();
    let c = clock_at(s, at);
    custody::record_custody(&mut a, &reg, &mut catalog, &c, s.ctx());
    c.destroy_for_testing();
    ts::return_shared(a);
    ts::return_shared(reg);
    ts::return_shared(catalog);
}

public fun reassign(s: &mut Scenario, to: address, at: u64) {
    s.next_tx(authority());
    let cap = s.take_from_sender<AdminCap>();
    let mut a = s.take_shared<Artwork>();
    let reg = s.take_shared<Registry<Gallery>>();
    let mut catalog = s.take_shared<Catalog>();
    let c = clock_at(s, at);
    custody::reassign(&mut a, &cap, &reg, &mut catalog, to, &c, s.ctx());
    c.destroy_for_testing();
    ts::return_shared(a);
    ts::return_shared(reg);
    ts::return_shared(catalog);
    s.return_to_sender(cap);
}

public fun certify(s: &mut Scenario, by: address, at: u64) {
    s.next_tx(by);
    let mut a = s.take_shared<Artwork>();
    let reg = s.take_shared<Registry<Gallery>>();
    let mut catalog = s.take_shared<Catalog>();
    let c = clock_at(s, at);
    certificate::issue(&mut a, &reg, &mut catalog, b"Original work, oil on canvas".to_string(), b"blob-cert-doc".to_string(), &c, s.ctx());
    c.destroy_for_testing();
    ts::return_shared(a);
    ts::return_shared(reg);
    ts::return_shared(catalog);
}

public fun report_loss(s: &mut Scenario, by: address, at: u64) {
    s.next_tx(by);
    let mut a = s.take_shared<Artwork>();
    let reg = s.take_shared<Registry<Gallery>>();
    let mut catalog = s.take_shared<Catalog>();
    let mut stats = s.take_shared<Stats>();
    let c = clock_at(s, at);
    custody::report_loss(&mut a, &reg, &mut catalog, &mut stats, option::none(), b"fire".to_string(), &c, s.ctx());
    c.destroy_for_testing();
    ts::return_shared(a);
    ts::return_shared(reg);
    ts::return_shared(catalog);
    ts::return_shared(stats);
}

public fun fractionalize(s: &mut Scenario, by: address, supply: u64, at: u64) {
    s.next_tx(by);
    let mut a = s.take_shared<Artwork>();
    let mut catalog = s.take_shared<Catalog>();
    let mut stats = s.take_shared<Stats>();
    let c = clock_at(s, at);
    art_tokenization::fraction::fractionalize(&mut a, supply, &mut catalog, &mut stats, &c, s.ctx());
    c.destroy_for_testing();
    ts::return_shared(a);
    ts::return_shared(catalog);
    ts::return_shared(stats);
}

public fun setup_fractionalised(supply: u64): Scenario {
    let mut s = setup();
    intake(&mut s, gallery_a(), 1_000);
    certify(&mut s, gallery_a(), 2_000);
    fractionalize(&mut s, artist(), supply, 3_000);
    s.next_tx(artist());
    s
}

public fun set_royalty(s: &mut Scenario, bps: u64) {
    s.next_tx(authority());
    let cap = s.take_from_sender<AdminCap>();
    let mut params = s.take_shared<admin::Params>();
    let c = clock_at(s, 0);
    params.set_royalty_bps(&cap, bps, &c, s.ctx());
    c.destroy_for_testing();
    ts::return_shared(params);
    s.return_to_sender(cap);
}

public fun register_source(s: &mut Scenario, who: address) {
    s.next_tx(authority());
    let cap = s.take_from_sender<AdminCap>();
    let mut reg = s.take_shared<Registry<Source>>();
    let c = clock::create_for_testing(s.ctx());
    reg.register(&cap, who, b"Conservation Lab".to_string(), b"inspector".to_string(), &c, s.ctx());
    c.destroy_for_testing();
    ts::return_shared(reg);
    s.return_to_sender(cap);
}

public fun revoke_source(s: &mut Scenario, who: address) {
    s.next_tx(authority());
    let cap = s.take_from_sender<AdminCap>();
    let mut reg = s.take_shared<Registry<Source>>();
    let c = clock::create_for_testing(s.ctx());
    reg.revoke(&cap, who, &c, s.ctx());
    c.destroy_for_testing();
    ts::return_shared(reg);
    s.return_to_sender(cap);
}
