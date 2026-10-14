module art_tokenization::admin;

use sui::clock::Clock;
use sui::event;
use sui::package;

const BPS_DENOMINATOR: u64 = 10_000;

#[error(code = 0)]
const EInvalidBps: vector<u8> = b"royalty must be between 0 and 10000 basis points";

public struct ADMIN has drop {}

public struct AdminCap has key, store {
    id: UID,
}

public struct Params has key {
    id: UID,
    royalty_bps: u64,
}

public struct RoyaltyChanged has copy, drop {
    old_bps: u64,
    new_bps: u64,
    by: address,
    at: u64,
}

fun init(otw: ADMIN, ctx: &mut TxContext) {
    let publisher = package::claim(otw, ctx);
    let cap = AdminCap { id: object::new(ctx) };
    let params = Params { id: object::new(ctx), royalty_bps: 0 };
    transfer::public_transfer(publisher, ctx.sender());
    transfer::transfer(cap, ctx.sender());
    transfer::share_object(params);
}

public fun set_royalty_bps(params: &mut Params, _: &AdminCap, new_bps: u64, clock: &Clock, ctx: &TxContext) {
    assert!(new_bps <= BPS_DENOMINATOR, EInvalidBps);
    let old_bps = params.royalty_bps;
    params.royalty_bps = new_bps;
    event::emit(RoyaltyChanged { old_bps, new_bps, by: ctx.sender(), at: clock.timestamp_ms() });
}

public fun royalty_bps(params: &Params): u64 {
    params.royalty_bps
}

public fun bps_denominator(): u64 {
    BPS_DENOMINATOR
}

#[test_only]
public fun init_for_testing(ctx: &mut TxContext) {
    init(ADMIN {}, ctx);
}
