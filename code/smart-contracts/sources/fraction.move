module art_tokenization::fraction;

use std::string::String;
use sui::clock::Clock;
use sui::event;
use art_tokenization::artwork::{Self, Artwork, Catalog};
use art_tokenization::certificate;
use art_tokenization::custody;
use art_tokenization::stats::Stats;

#[error(code = 0)]
const ENoCustody: vector<u8> = b"the artwork is not in a gallery's custody";
#[error(code = 1)]
const ENoCertificate: vector<u8> = b"the artwork carries no certificate";
#[error(code = 2)]
const ERedemptionPending: vector<u8> = b"a redemption request is pending; withdraw it first";
#[error(code = 3)]
const EAlreadyFractionalised: vector<u8> = b"the artwork is already fractionalised";
#[error(code = 4)]
const EZeroSupply: vector<u8> = b"the total supply must be positive";
#[error(code = 5)]
const EWrongVault: vector<u8> = b"the fraction belongs to another vault";
#[error(code = 6)]
const ENotFullSupply: vector<u8> = b"consolidation needs the full supply in one fraction";
#[error(code = 7)]
const EInvalidSplit: vector<u8> = b"a split must leave a positive amount on both sides";
#[error(code = 8)]
const EWrongArtwork: vector<u8> = b"the vault or fraction belongs to another artwork";
#[error(code = 9)]
const EArtworkNotLost: vector<u8> = b"only the fractions of a lost artwork can be burned";

public struct FractionVault has key {
    id: UID,
    artwork: ID,
    total_supply: u64,
}

// key only: the package's own functions are the only transfer path
public struct Fraction has key {
    id: UID,
    vault_id: ID,
    artwork_id: ID,
    amount: u64,
    title: String,
    image_blob_id: String,
}

// A fraction's balance without its object: what a listing holds in escrow
public struct Shares has store {
    vault_id: ID,
    artwork_id: ID,
    amount: u64,
    title: String,
    image_blob_id: String,
}

// Events

public struct Fractionalised has copy, drop {
    artwork: ID,
    vault: ID,
    total_supply: u64,
    by: address,
    at: u64,
}

public struct Consolidated has copy, drop {
    artwork: ID,
    vault: ID,
    by: address,
    at: u64,
}

public struct FractionBurned has copy, drop {
    artwork: ID,
    vault: ID,
    by: address,
    amount: u64,
}

#[allow(lint(self_transfer))]
public fun fractionalize(
    artwork: &mut Artwork,
    total_supply: u64,
    catalog: &mut Catalog,
    stats: &mut Stats,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    let by = ctx.sender();
    artwork.assert_not_terminal();
    assert!(!artwork.is_fractionalised(), EAlreadyFractionalised);
    artwork.assert_owner(by);
    assert!(custody::is_open(artwork), ENoCustody);
    assert!(certificate::exists(artwork), ENoCertificate);
    assert!(!custody::redemption_pending(artwork), ERedemptionPending);
    assert!(total_supply > 0, EZeroSupply);
    let at = clock.timestamp_ms();

    let artwork_id = object::id(artwork);
    catalog.owner_remove(by, artwork_id);
    let vault = FractionVault { id: object::new(ctx), artwork: artwork_id, total_supply };
    let vault_id = object::id(&vault);
    let fraction = Fraction {
        id: object::new(ctx), vault_id, artwork_id, amount: total_supply,
        title: artwork.title(), image_blob_id: artwork.image_blob_id(),
    };

    artwork.set_owner(option::none(), option::some(vault_id));
    artwork.set_fractionalised();
    artwork.set_supply(total_supply);
    stats.vault_opened(total_supply);
    catalog.sync(artwork, custody::custodian(artwork), at);
    artwork.log(artwork::hist_fractionalised(), at, by, total_supply, 0, option::some(vault_id));
    event::emit(Fractionalised { artwork: artwork_id, vault: vault_id, total_supply, by, at });
    transfer::share_object(vault);
    transfer::transfer(fraction, by);
}

public fun split(f: &mut Fraction, amount: u64, ctx: &mut TxContext): Fraction {
    assert!(amount > 0 && amount < f.amount, EInvalidSplit);
    f.amount = f.amount - amount;
    Fraction {
        id: object::new(ctx), vault_id: f.vault_id, artwork_id: f.artwork_id, amount,
        title: f.title, image_blob_id: f.image_blob_id,
    }
}

public fun merge(f: &mut Fraction, other: Fraction) {
    let Fraction { id, vault_id, artwork_id: _, amount, title: _, image_blob_id: _ } = other;
    assert!(vault_id == f.vault_id, EWrongVault);
    f.amount = f.amount + amount;
    id.delete();
}

public fun consolidate(
    artwork: &mut Artwork,
    vault: FractionVault,
    fraction: Fraction,
    catalog: &mut Catalog,
    stats: &mut Stats,
    clock: &Clock,
    ctx: &TxContext,
) {
    let by = ctx.sender();
    artwork.assert_not_terminal();
    let at = clock.timestamp_ms();
    let FractionVault { id: vault_uid, artwork: vault_artwork, total_supply } = vault;
    let vault_id = vault_uid.to_inner();
    assert!(vault_artwork == object::id(artwork), EWrongArtwork);
    let Fraction {
        id: fraction_uid, vault_id: fraction_vault, artwork_id: _, amount, title: _, image_blob_id: _,
    } = fraction;
    assert!(fraction_vault == vault_id, EWrongVault);
    assert!(amount == total_supply, ENotFullSupply);

    fraction_uid.delete();
    vault_uid.delete();
    artwork.set_owner(option::some(by), option::none());
    catalog.owner_add(by, object::id(artwork));
    artwork.set_certified();
    artwork.set_supply(0);
    stats.vault_closed(total_supply);
    catalog.sync(artwork, custody::custodian(artwork), at);
    artwork.log(artwork::hist_consolidated(), at, by, total_supply, 0, option::some(vault_id));
    event::emit(Consolidated { artwork: object::id(artwork), vault: vault_id, by, at });
}

// Holders clear the worthless fractions of a lost artwork from their wallets
public fun burn(f: Fraction, artwork: &Artwork, ctx: &TxContext) {
    assert!(artwork.is_lost(), EArtworkNotLost);
    let Fraction { id, vault_id, artwork_id, amount, title: _, image_blob_id: _ } = f;
    assert!(artwork_id == object::id(artwork), EWrongArtwork);
    id.delete();
    event::emit(FractionBurned { artwork: artwork_id, vault: vault_id, by: ctx.sender(), amount });
}

// Escrow (package only)

public(package) fun deliver(f: Fraction, to: address) {
    transfer::transfer(f, to);
}

public(package) fun into_shares(f: Fraction): Shares {
    let Fraction { id, vault_id, artwork_id, amount, title, image_blob_id } = f;
    id.delete();
    Shares { vault_id, artwork_id, amount, title, image_blob_id }
}

public(package) fun from_shares(s: Shares, ctx: &mut TxContext): Fraction {
    let Shares { vault_id, artwork_id, amount, title, image_blob_id } = s;
    Fraction { id: object::new(ctx), vault_id, artwork_id, amount, title, image_blob_id }
}

public(package) fun split_shares(s: &mut Shares, amount: u64): Shares {
    assert!(amount > 0 && amount < s.amount, EInvalidSplit);
    s.amount = s.amount - amount;
    Shares {
        vault_id: s.vault_id, artwork_id: s.artwork_id, amount,
        title: s.title, image_blob_id: s.image_blob_id,
    }
}

public fun shares_value(s: &Shares): u64 { s.amount }

#[test_only]
public fun transfer_for_testing(f: Fraction, to: address) {
    transfer::transfer(f, to);
}

#[test_only]
public fun burned_for_testing(artwork: ID, vault: ID, by: address, amount: u64): FractionBurned {
    FractionBurned { artwork, vault, by, amount }
}

// Reads

public fun value(f: &Fraction): u64 { f.amount }
public fun vault_id(f: &Fraction): ID { f.vault_id }
public fun artwork_id(f: &Fraction): ID { f.artwork_id }
public fun title(f: &Fraction): String { f.title }

public fun total_supply(v: &FractionVault): u64 { v.total_supply }
public fun vault_artwork(v: &FractionVault): ID { v.artwork }

public fun assert_vault(f: &Fraction, v: &FractionVault) {
    assert!(f.vault_id == object::id(v), EWrongVault);
}

public(package) fun vault_uid_mut(v: &mut FractionVault): &mut UID { &mut v.id }
public(package) fun vault_uid(v: &FractionVault): &UID { &v.id }
