module art_tokenization::market;

use sui::clock::Clock;
use sui::coin::{Self, Coin};
use sui::dynamic_field as df;
use sui::event;
use sui::sui::SUI;
use art_tokenization::admin::{Self, Params};
use art_tokenization::artwork::{Self, Artwork};
use art_tokenization::fraction::{Self, Fraction, FractionVault, Shares};
use art_tokenization::stats::Stats;

#[error(code = 0)]
const EZeroPrice: vector<u8> = b"the price per fraction must be positive";
#[error(code = 1)]
const EWrongVault: vector<u8> = b"the listing, vault and artwork do not match";
#[error(code = 2)]
const EListingClosed: vector<u8> = b"the listing is closed";
#[error(code = 3)]
const ENotSeller: vector<u8> = b"only the seller can cancel a listing";
#[error(code = 4)]
const ESelfPurchase: vector<u8> = b"a seller cannot buy their own listing";
#[error(code = 5)]
const EInsufficientQuantity: vector<u8> = b"the quantity is zero or exceeds what is available";
#[error(code = 6)]
const EWrongPayment: vector<u8> = b"the payment must equal quantity times price";

public struct Listing has key {
    id: UID,
    artwork_id: ID,
    vault_id: ID,
    seller: address,
    price_per_fraction: u64,
    escrow: Option<Shares>,
    active: bool,
}

// Events

public struct ListingCreated has copy, drop {
    listing: ID,
    artwork: ID,
    vault: ID,
    seller: address,
    quantity: u64,
    price_per_fraction: u64,
    at: u64,
}

public struct ListingCancelled has copy, drop {
    listing: ID,
    artwork: ID,
    seller: address,
    quantity: u64,
    at: u64,
}

public struct Sale has copy, drop {
    listing: ID,
    artwork: ID,
    vault: ID,
    seller: address,
    buyer: address,
    quantity: u64,
    price_per_fraction: u64,
    seller_amount: u64,
    royalty_amount: u64,
    at: u64,
}

public fun list(
    artwork: &mut Artwork,
    vault: &mut FractionVault,
    fraction: Fraction,
    quantity: u64,
    price_per_fraction: u64,
    stats: &mut Stats,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    artwork.assert_not_terminal();
    assert!(vault.vault_artwork() == object::id(artwork), EWrongVault);
    assert!(artwork.vault() == option::some(object::id(vault)), EWrongVault);
    fraction.assert_vault(vault);
    assert!(price_per_fraction > 0, EZeroPrice);
    let at = clock.timestamp_ms();
    let seller = ctx.sender();
    let mut shares = fraction::into_shares(fraction);
    let available = shares.shares_value();
    assert!(quantity > 0 && quantity <= available, EInsufficientQuantity);
    let escrow = if (quantity == available) {
        shares
    } else {
        let listed = shares.split_shares(quantity);
        fraction::deliver(fraction::from_shares(shares, ctx), seller);
        listed
    };
    let listing = Listing {
        id: object::new(ctx),
        artwork_id: object::id(artwork),
        vault_id: object::id(vault),
        seller,
        price_per_fraction,
        escrow: option::some(escrow),
        active: true,
    };
    let id = object::id(&listing);
    df::add(vault.vault_uid_mut(), id, true);
    artwork.listing_opened();
    stats.listing_opened(seller, id);
    artwork.log(artwork::hist_listed(), at, seller, quantity, quantity * price_per_fraction, option::some(id));
    event::emit(ListingCreated {
        listing: id, artwork: object::id(artwork), vault: object::id(vault),
        seller, quantity, price_per_fraction, at,
    });
    transfer::share_object(listing);
}

public fun cancel(
    listing: &mut Listing,
    artwork: &mut Artwork,
    vault: &mut FractionVault,
    stats: &mut Stats,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(listing.active, EListingClosed);
    assert!(listing.seller == ctx.sender(), ENotSeller);
    assert!(listing.artwork_id == object::id(artwork) && listing.vault_id == object::id(vault), EWrongVault);
    let at = clock.timestamp_ms();
    let shares = close(listing, vault);
    let quantity = shares.shares_value();
    artwork.listing_closed();
    stats.listing_closed(listing.seller, object::id(listing));
    artwork.log(artwork::hist_listing_cancelled(), at, listing.seller, quantity, 0, option::some(object::id(listing)));
    event::emit(ListingCancelled {
        listing: object::id(listing), artwork: listing.artwork_id, seller: listing.seller, quantity, at,
    });
    fraction::deliver(fraction::from_shares(shares, ctx), listing.seller);
}

public fun buy(
    listing: &mut Listing,
    artwork: &mut Artwork,
    vault: &mut FractionVault,
    params: &Params,
    stats: &mut Stats,
    quantity: u64,
    mut payment: Coin<SUI>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    let buyer = ctx.sender();
    assert!(listing.active, EListingClosed);
    assert!(listing.artwork_id == object::id(artwork) && listing.vault_id == object::id(vault), EWrongVault);
    artwork.assert_not_terminal();
    assert!(buyer != listing.seller, ESelfPurchase);
    let available = listing.escrow.borrow().shares_value();
    assert!(quantity > 0 && quantity <= available, EInsufficientQuantity);
    let total = quantity * listing.price_per_fraction;
    assert!(payment.value() == total, EWrongPayment);
    let at = clock.timestamp_ms();

    let artist = artwork.artist();
    let royalty_amount = if (listing.seller == artist) 0 else royalty_of(total, params.royalty_bps());
    let seller_amount = total - royalty_amount;
    if (royalty_amount > 0) {
        transfer::public_transfer(payment.split(royalty_amount, ctx), artist);
    };
    // A royalty of 100% leaves the seller nothing
    if (payment.value() > 0) {
        transfer::public_transfer(payment, listing.seller);
    } else {
        payment.destroy_zero();
    };

    let bought = if (quantity == available) {
        artwork.listing_closed();
        stats.listing_closed(listing.seller, object::id(listing));
        close(listing, vault)
    } else {
        listing.escrow.borrow_mut().split_shares(quantity)
    };
    artwork.sale(quantity, listing.price_per_fraction);
    stats.sale(artist, total, royalty_amount);
    artwork.log(artwork::hist_sale(), at, buyer, quantity, total, option::some(object::id(listing)));
    event::emit(Sale {
        listing: object::id(listing), artwork: listing.artwork_id, vault: listing.vault_id,
        seller: listing.seller, buyer, quantity, price_per_fraction: listing.price_per_fraction,
        seller_amount, royalty_amount, at,
    });
    fraction::deliver(fraction::from_shares(bought, ctx), buyer);
}

// The interface performs the identical computation
public fun royalty_of(total: u64, bps: u64): u64 {
    (((total as u128) * (bps as u128)) / (admin::bps_denominator() as u128)) as u64
}

fun close(listing: &mut Listing, vault: &mut FractionVault): Shares {
    listing.active = false;
    df::remove<ID, bool>(vault.vault_uid_mut(), object::id(listing));
    listing.escrow.extract()
}

// Reads

public fun is_active(l: &Listing): bool { l.active }
public fun seller(l: &Listing): address { l.seller }
public fun price_per_fraction(l: &Listing): u64 { l.price_per_fraction }
public fun artwork_id(l: &Listing): ID { l.artwork_id }
public fun vault_id(l: &Listing): ID { l.vault_id }
public fun quantity(l: &Listing): u64 {
    if (l.escrow.is_some()) l.escrow.borrow().shares_value() else 0
}
public fun is_listed(vault: &FractionVault, listing: ID): bool {
    df::exists(vault.vault_uid(), listing)
}
