module art_tokenization::registry;

use std::string::String;
use sui::clock::Clock;
use sui::event;
use sui::table::{Self, Table};
use art_tokenization::admin::AdminCap;

#[error(code = 0)]
const EAlreadyActive: vector<u8> = b"address is already an active entry of this registry";
#[error(code = 1)]
const ENotRegistered: vector<u8> = b"address is not an entry of this registry";
#[error(code = 2)]
const EAlreadyRevoked: vector<u8> = b"entry is already revoked";
#[error(code = 3)]
const EEmptyName: vector<u8> = b"an entry needs a name";

public struct Gallery has drop {}
public struct Source has drop {}

public struct Registry<phantom T> has key {
    id: UID,
    entries: Table<address, Entry>,
    members: vector<address>,
    active_count: u64,
}

public struct Entry has store {
    name: String,
    kind: String,
    since: u64,
    active: bool,
    revoked_at: Option<u64>,
}

// Events

public struct Registered has copy, drop {
    registry: ID,
    who: address,
    name: String,
    kind: String,
    at: u64,
    by: address,
}

public struct Revoked has copy, drop {
    registry: ID,
    who: address,
    at: u64,
    by: address,
}

fun init(ctx: &mut TxContext) {
    transfer::share_object(new<Gallery>(ctx));
    transfer::share_object(new<Source>(ctx));
}

fun new<T>(ctx: &mut TxContext): Registry<T> {
    Registry { id: object::new(ctx), entries: table::new(ctx), members: vector[], active_count: 0 }
}

public fun register<T>(
    reg: &mut Registry<T>,
    _: &AdminCap,
    who: address,
    name: String,
    kind: String,
    clock: &Clock,
    ctx: &TxContext,
) {
    assert!(!name.is_empty(), EEmptyName);
    let at = clock.timestamp_ms();
    if (reg.entries.contains(who)) {
        let entry = &mut reg.entries[who];
        assert!(!entry.active, EAlreadyActive);
        entry.name = name;
        entry.kind = kind;
        entry.since = at;
        entry.active = true;
        entry.revoked_at = option::none();
    } else {
        reg.entries.add(who, Entry { name, kind, since: at, active: true, revoked_at: option::none() });
        reg.members.push_back(who);
    };
    reg.active_count = reg.active_count + 1;
    event::emit(Registered {
        registry: reg.id.to_inner(),
        who,
        name: reg.entries[who].name,
        kind: reg.entries[who].kind,
        at,
        by: ctx.sender(),
    });
}

public fun revoke<T>(reg: &mut Registry<T>, _: &AdminCap, who: address, clock: &Clock, ctx: &TxContext) {
    assert!(reg.entries.contains(who), ENotRegistered);
    let at = clock.timestamp_ms();
    let entry = &mut reg.entries[who];
    assert!(entry.active, EAlreadyRevoked);
    entry.active = false;
    entry.revoked_at = option::some(at);
    reg.active_count = reg.active_count - 1;
    event::emit(Revoked { registry: reg.id.to_inner(), who, at, by: ctx.sender() });
}

// Reads

public fun is_active<T>(reg: &Registry<T>, who: address): bool {
    reg.entries.contains(who) && reg.entries[who].active
}

public fun contains<T>(reg: &Registry<T>, who: address): bool {
    reg.entries.contains(who)
}

public fun name<T>(reg: &Registry<T>, who: address): String {
    assert!(reg.entries.contains(who), ENotRegistered);
    reg.entries[who].name
}

public fun kind<T>(reg: &Registry<T>, who: address): String {
    assert!(reg.entries.contains(who), ENotRegistered);
    reg.entries[who].kind
}

public fun since<T>(reg: &Registry<T>, who: address): u64 {
    assert!(reg.entries.contains(who), ENotRegistered);
    reg.entries[who].since
}

public fun revoked_at<T>(reg: &Registry<T>, who: address): Option<u64> {
    assert!(reg.entries.contains(who), ENotRegistered);
    reg.entries[who].revoked_at
}

public fun active_count<T>(reg: &Registry<T>): u64 {
    reg.active_count
}

public fun members<T>(reg: &Registry<T>): vector<address> {
    reg.members
}

#[test_only]
public fun init_for_testing(ctx: &mut TxContext) {
    init(ctx);
}
