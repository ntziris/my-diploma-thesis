#[test_only]
module art_tokenization::admin_tests;

use sui::clock;
use sui::package::Publisher;
use sui::test_scenario as ts;
use art_tokenization::admin::{Self, AdminCap, Params};

const AUTHORITY: address = @0xA;

#[test, expected_failure(abort_code = admin::EInvalidBps)]
fun set_royalty_rejects_more_than_whole() {
    let mut s = ts::begin(AUTHORITY);
    admin::init_for_testing(s.ctx());

    s.next_tx(AUTHORITY);
    let cap = s.take_from_sender<AdminCap>();
    let mut params = s.take_shared<Params>();
    let c = clock::create_for_testing(s.ctx());
    params.set_royalty_bps(&cap, 10_001, &c, s.ctx());
    abort
}
