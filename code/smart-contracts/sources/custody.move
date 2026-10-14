module art_tokenization::custody;

use std::string::String;
use sui::clock::Clock;
use sui::dynamic_object_field as dof;
use sui::event;
use sui::table::{Self, Table};
use art_tokenization::admin::AdminCap;
use art_tokenization::artwork::{Self, Artwork, Catalog};
use art_tokenization::registry::{Registry, Gallery};
use art_tokenization::stats::Stats;

#[error(code = 0)]
const ENotActive: vector<u8> = b"the sender is not an active gallery";
#[error(code = 1)]
const ENotDesignated: vector<u8> = b"the sender is not the gallery designated to receive this artwork";
#[error(code = 2)]
const EAlreadyInCustody: vector<u8> = b"an active gallery already holds this artwork";
#[error(code = 3)]
const ENoCustody: vector<u8> = b"no custody record is open for this artwork";
#[error(code = 4)]
const ECustodianActive: vector<u8> = b"the current custodian is still active; reassignment needs a revocation";
#[error(code = 5)]
const EGalleryNotActive: vector<u8> = b"the designated gallery is not active";
#[error(code = 6)]
const ENotCustodian: vector<u8> = b"the sender is not the gallery holding this artwork";
#[error(code = 7)]
const EFractionalised: vector<u8> = b"a fractionalised artwork cannot be redeemed";
#[error(code = 8)]
const ERequestPending: vector<u8> = b"a redemption request is already pending";
#[error(code = 9)]
const ENoRequest: vector<u8> = b"no redemption request is pending";
#[error(code = 10)]
const ENotRequester: vector<u8> = b"only the requester can withdraw the request";
#[error(code = 11)]
const ENotOwnerNorCustodian: vector<u8> = b"only the owner or the custodian gallery may attach storage";

const CONDITION_OK: u8 = 0;

public struct CustodyKey has copy, drop, store {}

public struct CustodyRecord has key, store {
    id: UID,
    gallery: address,
    since: u64,
    until: Option<u64>,
    redemption: Option<RedemptionRequest>,
    report_log: ID,
}

public struct RedemptionRequest has store, copy, drop {
    requested_by: address,
    at: u64,
    note: String,
}

public struct ReportLog has key {
    id: UID,
    artwork: ID,
    count: u64,
    entries: Table<u64, ID>,
    last: Option<ID>,
    last_condition: u8,
    last_at: u64,
    not_ok: u64,
    // Latest attested_at per source; record_report refuses anything not newer
    last_attested: Table<address, u64>,
}

// Events

public struct CustodyRecorded has copy, drop {
    artwork: ID,
    gallery: address,
    after_reassignment: bool,
    at: u64,
}

public struct CustodyReassigned has copy, drop {
    artwork: ID,
    from: address,
    to: address,
    at: u64,
    by: address,
}

public struct RedemptionRequested has copy, drop { artwork: ID, by: address, note: String, at: u64 }
public struct RedemptionWithdrawn has copy, drop { artwork: ID, by: address, at: u64 }
public struct Redeemed has copy, drop { artwork: ID, gallery: address, owner: address, at: u64 }

public struct LossDeclared has copy, drop {
    artwork: ID,
    gallery: address,
    report: Option<ID>,
    reason: String,
    at: u64,
}

// Intake

public fun record_custody(
    artwork: &mut Artwork,
    galleries: &Registry<Gallery>,
    catalog: &mut Catalog,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    let gallery = ctx.sender();
    assert!(galleries.is_active(gallery), ENotActive);
    artwork.assert_not_terminal();
    assert!(artwork.intended_gallery() == option::some(gallery), ENotDesignated);
    let at = clock.timestamp_ms();
    let id = object::id(artwork);

    if (has_record(artwork)) {
        let rec: &mut CustodyRecord = dof::borrow_mut(artwork.uid_mut(), CustodyKey {});
        assert!(rec.until.is_none(), ENoCustody);
        assert!(!galleries.is_active(rec.gallery), EAlreadyInCustody);
        let previous = rec.gallery;
        rec.gallery = gallery;
        rec.since = at;
        catalog.custodian_remove(previous, id);
        event::emit(CustodyRecorded { artwork: id, gallery, after_reassignment: true, at });
    } else {
        let log = ReportLog {
            id: object::new(ctx),
            artwork: id,
            count: 0,
            entries: table::new(ctx),
            last: option::none(),
            last_condition: CONDITION_OK,
            last_at: 0,
            not_ok: 0,
            last_attested: table::new(ctx),
        };
        let rec = CustodyRecord {
            id: object::new(ctx),
            gallery,
            since: at,
            until: option::none(),
            redemption: option::none(),
            report_log: object::id(&log),
        };
        transfer::share_object(log);
        dof::add(artwork.uid_mut(), CustodyKey {}, rec);
        artwork.set_in_custody();
        event::emit(CustodyRecorded { artwork: id, gallery, after_reassignment: false, at });
    };
    artwork.set_intended_gallery(option::none(), false);
    catalog.intended_remove(gallery, id);
    catalog.custodian_add(gallery, id);
    catalog.sync(artwork, option::some(gallery), at);
    artwork.log(artwork::hist_custody(), at, gallery, 0, 0, option::none());
}

public fun reassign(
    artwork: &mut Artwork,
    _: &AdminCap,
    galleries: &Registry<Gallery>,
    catalog: &mut Catalog,
    to: address,
    clock: &Clock,
    ctx: &TxContext,
) {
    artwork.assert_not_terminal();
    assert!(is_open(artwork), ENoCustody);
    let from = record(artwork).gallery;
    assert!(!galleries.is_active(from), ECustodianActive);
    assert!(galleries.is_active(to), EGalleryNotActive);
    let at = clock.timestamp_ms();
    let id = object::id(artwork);
    let previous = artwork.intended_gallery();
    if (previous.is_some()) {
        catalog.intended_remove(previous.destroy_some(), id);
    };
    artwork.set_intended_gallery(option::some(to), true);
    catalog.intended_add(to, id);
    catalog.sync(artwork, option::some(from), at);
    artwork.log(artwork::hist_reassigned(), at, ctx.sender(), 0, 0, option::none());
    event::emit(CustodyReassigned { artwork: id, from, to, at, by: ctx.sender() });
}

// Redemption

public fun redeem_request(artwork: &mut Artwork, note: String, clock: &Clock, ctx: &TxContext) {
    let owner = ctx.sender();
    artwork.assert_not_terminal();
    assert!(!artwork.is_fractionalised(), EFractionalised);
    artwork.assert_owner(owner);
    assert!(is_open(artwork), ENoCustody);
    let at = clock.timestamp_ms();
    let id = object::id(artwork);
    let rec = record_mut(artwork);
    assert!(rec.redemption.is_none(), ERequestPending);
    rec.redemption = option::some(RedemptionRequest { requested_by: owner, at, note });
    let note = rec.redemption.borrow().note;
    artwork.log(artwork::hist_redeem_requested(), at, owner, 0, 0, option::none());
    event::emit(RedemptionRequested { artwork: id, by: owner, note, at });
}

public fun redeem_withdraw(artwork: &mut Artwork, clock: &Clock, ctx: &TxContext) {
    assert!(is_open(artwork), ENoCustody);
    let at = clock.timestamp_ms();
    let id = object::id(artwork);
    let rec = record_mut(artwork);
    assert!(rec.redemption.is_some(), ENoRequest);
    assert!(rec.redemption.borrow().requested_by == ctx.sender(), ENotRequester);
    rec.redemption = option::none();
    artwork.log(artwork::hist_redeem_withdrawn(), at, ctx.sender(), 0, 0, option::none());
    event::emit(RedemptionWithdrawn { artwork: id, by: ctx.sender(), at });
}

public fun redeem_confirm(
    artwork: &mut Artwork,
    galleries: &Registry<Gallery>,
    catalog: &mut Catalog,
    clock: &Clock,
    ctx: &TxContext,
) {
    let gallery = ctx.sender();
    assert!(galleries.is_active(gallery), ENotActive);
    artwork.assert_not_terminal();
    assert!(is_open(artwork), ENoCustody);
    let at = clock.timestamp_ms();
    let id = object::id(artwork);
    let rec = record_mut(artwork);
    assert!(rec.gallery == gallery, ENotCustodian);
    assert!(rec.redemption.is_some(), ENoRequest);
    rec.redemption = option::none();
    rec.until = option::some(at);
    let owner = artwork.owner().destroy_some();
    artwork.set_redeemed();
    catalog.custodian_remove(gallery, id);
    catalog.sync(artwork, option::none(), at);
    artwork.log(artwork::hist_redeemed(), at, gallery, 0, 0, option::none());
    event::emit(Redeemed { artwork: id, gallery, owner, at });
}

// Loss

public fun report_loss(
    artwork: &mut Artwork,
    galleries: &Registry<Gallery>,
    catalog: &mut Catalog,
    stats: &mut Stats,
    report: Option<ID>,
    reason: String,
    clock: &Clock,
    ctx: &TxContext,
) {
    let gallery = ctx.sender();
    assert!(galleries.is_active(gallery), ENotActive);
    artwork.assert_not_terminal();
    assert!(is_open(artwork), ENoCustody);
    let at = clock.timestamp_ms();
    let id = object::id(artwork);
    let rec = record_mut(artwork);
    assert!(rec.gallery == gallery, ENotCustodian);
    rec.until = option::some(at);
    rec.redemption = option::none();
    // The fractions stay in wallets and the FractionVault stays orphaned, burn clears them one by one
    if (artwork.vault().is_some()) {
        stats.vault_closed(artwork.supply());
        artwork.set_supply(0);
    };
    artwork.set_lost();
    catalog.custodian_remove(gallery, id);
    catalog.sync(artwork, option::none(), at);
    artwork.log(artwork::hist_lost(), at, gallery, 0, 0, report);
    event::emit(LossDeclared { artwork: id, gallery, report, reason, at });
}

// Storage

public fun attach_storage(artwork: &mut Artwork, galleries: &Registry<Gallery>, ids: vector<ID>, ctx: &TxContext) {
    let sender = ctx.sender();
    let is_owner = artwork.owner() == option::some(sender);
    let is_custodian = custodian(artwork) == option::some(sender) && galleries.is_active(sender);
    assert!(is_owner || is_custodian, ENotOwnerNorCustodian);
    artwork.push_storage(ids);
}

// Reads

public fun has_record(artwork: &Artwork): bool {
    dof::exists(artwork.uid(), CustodyKey {})
}

public fun is_open(artwork: &Artwork): bool {
    has_record(artwork) && record(artwork).until.is_none()
}

public fun custodian(artwork: &Artwork): Option<address> {
    if (is_open(artwork)) option::some(record(artwork).gallery) else option::none()
}

public fun gallery(artwork: &Artwork): address { record(artwork).gallery }
public fun since(artwork: &Artwork): u64 { record(artwork).since }
public fun until(artwork: &Artwork): Option<u64> { record(artwork).until }
public fun report_log_id(artwork: &Artwork): ID { record(artwork).report_log }

public fun redemption_pending(artwork: &Artwork): bool {
    has_record(artwork) && record(artwork).redemption.is_some()
}
public fun redemption(artwork: &Artwork): Option<RedemptionRequest> { record(artwork).redemption }
public fun requested_by(r: &RedemptionRequest): address { r.requested_by }
public fun requested_at(r: &RedemptionRequest): u64 { r.at }
public fun note(r: &RedemptionRequest): String { r.note }

public fun assert_custodian(artwork: &Artwork, who: address) {
    assert!(is_open(artwork), ENoCustody);
    assert!(record(artwork).gallery == who, ENotCustodian);
}

public fun log_artwork(log: &ReportLog): ID { log.artwork }
public fun last_attested_of(log: &ReportLog, source: address): u64 {
    if (log.last_attested.contains(source)) log.last_attested[source] else 0
}
public fun report_count(log: &ReportLog): u64 { log.count }
public fun report_at(log: &ReportLog, index: u64): ID { log.entries[index] }
public fun last_report(log: &ReportLog): Option<ID> { log.last }
public fun last_condition(log: &ReportLog): u8 { log.last_condition }
public fun last_report_at(log: &ReportLog): u64 { log.last_at }
public fun reports_not_ok(log: &ReportLog): u64 { log.not_ok }

// Package-internal

public(package) fun append_report(
    log: &mut ReportLog,
    report: ID,
    source: address,
    condition: u8,
    at: u64,
    attested_at: u64,
) {
    log.entries.add(log.count, report);
    log.count = log.count + 1;
    log.last = option::some(report);
    log.last_condition = condition;
    log.last_at = at;
    if (condition != CONDITION_OK) {
        log.not_ok = log.not_ok + 1;
    };
    if (log.last_attested.contains(source)) {
        let slot = &mut log.last_attested[source];
        *slot = attested_at;
    } else {
        log.last_attested.add(source, attested_at);
    };
}

fun record(artwork: &Artwork): &CustodyRecord {
    assert!(has_record(artwork), ENoCustody);
    dof::borrow(artwork.uid(), CustodyKey {})
}

fun record_mut(artwork: &mut Artwork): &mut CustodyRecord {
    assert!(has_record(artwork), ENoCustody);
    dof::borrow_mut(artwork.uid_mut(), CustodyKey {})
}
