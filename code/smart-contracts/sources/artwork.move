module art_tokenization::artwork;

use std::string::String;
use sui::clock::Clock;
use sui::dynamic_field as df;
use sui::event;
use sui::table::{Self, Table};
use art_tokenization::registry::{Registry, Gallery};

// Lifecycle states

const STATE_MINTED: u8 = 0;
const STATE_IN_CUSTODY: u8 = 1;
const STATE_CERTIFIED: u8 = 2;
const STATE_FRACTIONALISED: u8 = 3;
const STATE_REDEEMED: u8 = 4;
const STATE_LOST: u8 = 5;
const STATE_CANCELLED: u8 = 6;

// Provenance journal kinds

const HIST_MINTED: u8 = 0;
const HIST_CANCELLED: u8 = 1;
const HIST_CUSTODY: u8 = 2;
const HIST_REASSIGNED: u8 = 3;
const HIST_CERTIFIED: u8 = 4;
const HIST_FRACTIONALISED: u8 = 5;
const HIST_CONSOLIDATED: u8 = 6;
const HIST_LISTED: u8 = 7;
const HIST_LISTING_CANCELLED: u8 = 8;
const HIST_SALE: u8 = 9;
const HIST_REDEEM_REQUESTED: u8 = 10;
const HIST_REDEEM_WITHDRAWN: u8 = 11;
const HIST_REDEEMED: u8 = 12;
const HIST_LOST: u8 = 13;

const CHUNK: u64 = 100;
const MAX_KEYWORDS: u64 = 12;
const MAX_KEYWORD_BYTES: u64 = 32;

#[error(code = 0)]
const EGalleryNotActive: vector<u8> = b"the receiving gallery is not active in the gallery registry";
#[error(code = 1)]
const EEmptyTitle: vector<u8> = b"an artwork needs a title";
#[error(code = 2)]
const EEmptyImage: vector<u8> = b"an artwork needs a public image blob";
#[error(code = 3)]
const ENotMinted: vector<u8> = b"the artwork has already been taken into custody or is void";
#[error(code = 4)]
const ETerminal: vector<u8> = b"the artwork is in a terminal state";
#[error(code = 5)]
const ENotOwner: vector<u8> = b"the sender does not own this artwork";
#[error(code = 6)]
const ETooManyKeywords: vector<u8> = b"at most twelve keywords per artwork";
#[error(code = 7)]
const EKeywordTooLong: vector<u8> = b"a keyword is at most thirty-two bytes";
#[error(code = 8)]
const EEmptyKeyword: vector<u8> = b"a keyword cannot be empty";
#[error(code = 9)]
const ENotInCatalog: vector<u8> = b"the artwork is not in the catalog";
#[error(code = 10)]
const EIdentityAlreadyBound: vector<u8> = b"another artwork already carries this Seal identity";
#[error(code = 11)]
const EEmptySalt: vector<u8> = b"the Seal salt cannot be empty";
#[error(code = 12)]
const EEmptyStorage: vector<u8> = b"at least one storage reference is needed";

// The artwork

public struct MarketStats has store, copy, drop {
    supply: u64,
    open_listings: u64,
    trades: u64,
    volume_mist: u64,
    last_price: u64,
}

public struct HistoryEntry has store, copy, drop {
    kind: u8,
    at: u64,
    actor: address,
    quantity: u64,
    amount: u64,
    reference: Option<ID>,
}

public struct HistoryKey has copy, drop, store { index: u64 }

public struct Artwork has key {
    id: UID,
    title: String,
    artist_name: String,
    year: String,
    medium: String,
    dimensions: String,
    description: String,
    artist: address,
    image_blob_id: String,
    hires_blob_id: String,
    seal_salt: vector<u8>,
    storage: vector<ID>,
    minted_at: u64,
    owner: Option<address>,
    vault: Option<ID>,
    intended_gallery: Option<address>,
    intended_by_authority: bool,
    state: u8,
    market: MarketStats,
    history_len: u64,
}

// The catalogue

public struct CatalogEntry has store, copy, drop {
    artwork: ID,
    title: String,
    artist_name: String,
    artist: address,
    year: String,
    medium: String,
    image_blob_id: String,
    minted_at: u64,
    state: u8,
    custodian: Option<address>,
    last_activity_at: u64,
}

public struct WordBucket has store {
    count: u64,
    ids: Table<u64, ID>,
}

public struct Catalog has key {
    id: UID,
    count: u64,
    live: u64,
    chunks: Table<u64, vector<CatalogEntry>>,
    positions: Table<ID, u64>,
    by_artist: Table<address, vector<ID>>,
    by_owner: Table<address, vector<ID>>,
    by_custodian: Table<address, vector<ID>>,
    by_intended: Table<address, vector<ID>>,
    words: Table<String, WordBucket>,
}

// Seal identity, image bytes followed by the salt, to artwork
public struct IdentityKey has copy, drop, store {
    id: vector<u8>,
}

// Events

public struct ArtworkMinted has copy, drop {
    artwork: ID,
    artist: address,
    title: String,
    intended_gallery: address,
    at: u64,
}

public struct MintCancelled has copy, drop {
    artwork: ID,
    by: address,
    at: u64,
}

public struct StorageAttached has copy, drop {
    artwork: ID,
    storage: vector<ID>,
}

fun init(ctx: &mut TxContext) {
    transfer::share_object(Catalog {
        id: object::new(ctx),
        count: 0,
        live: 0,
        chunks: table::new(ctx),
        positions: table::new(ctx),
        by_artist: table::new(ctx),
        by_owner: table::new(ctx),
        by_custodian: table::new(ctx),
        by_intended: table::new(ctx),
        words: table::new(ctx),
    });
}

public fun mint(
    catalog: &mut Catalog,
    galleries: &Registry<Gallery>,
    title: String,
    artist_name: String,
    year: String,
    medium: String,
    dimensions: String,
    description: String,
    image_blob_id: String,
    hires_blob_id: String,
    seal_salt: vector<u8>,
    intended_gallery: address,
    keywords: vector<String>,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    assert!(!title.is_empty(), EEmptyTitle);
    assert!(!image_blob_id.is_empty(), EEmptyImage);
    assert!(!seal_salt.is_empty(), EEmptySalt);
    assert!(galleries.is_active(intended_gallery), EGalleryNotActive);
    assert!(keywords.length() <= MAX_KEYWORDS, ETooManyKeywords);
    let key = IdentityKey { id: identity_bytes(&image_blob_id, &seal_salt) };
    assert!(!df::exists(&catalog.id, key), EIdentityAlreadyBound);
    let at = clock.timestamp_ms();
    let artist = ctx.sender();
    // The artwork must be the first object created: the report test vectors sign its id
    let mut artwork = Artwork {
        id: object::new(ctx),
        title,
        artist_name,
        year,
        medium,
        dimensions,
        description,
        artist,
        image_blob_id,
        hires_blob_id,
        seal_salt,
        storage: vector[],
        minted_at: at,
        owner: option::some(artist),
        vault: option::none(),
        intended_gallery: option::some(intended_gallery),
        intended_by_authority: false,
        state: STATE_MINTED,
        market: MarketStats { supply: 0, open_listings: 0, trades: 0, volume_mist: 0, last_price: 0 },
        history_len: 0,
    };
    let id = artwork.id.to_inner();

    let position = catalog.count;
    let entry = CatalogEntry {
        artwork: id,
        title: artwork.title,
        artist_name: artwork.artist_name,
        artist,
        year: artwork.year,
        medium: artwork.medium,
        image_blob_id: artwork.image_blob_id,
        minted_at: at,
        state: STATE_MINTED,
        custodian: option::none(),
        last_activity_at: at,
    };
    let chunk = position / CHUNK;
    if (position % CHUNK == 0) {
        catalog.chunks.add(chunk, vector[entry]);
    } else {
        catalog.chunks[chunk].push_back(entry);
    };
    catalog.positions.add(id, position);
    catalog.count = position + 1;
    catalog.live = catalog.live + 1;
    df::add(&mut catalog.id, key, id);

    push_id(&mut catalog.by_artist, artist, id);
    push_id(&mut catalog.by_owner, artist, id);
    push_id(&mut catalog.by_intended, intended_gallery, id);
    index_keywords(catalog, keywords, id, ctx);

    log(&mut artwork, HIST_MINTED, at, artist, 0, 0, option::none());
    event::emit(ArtworkMinted { artwork: id, artist, title: artwork.title, intended_gallery, at });
    transfer::share_object(artwork);
}

public fun cancel_mint(artwork: &mut Artwork, catalog: &mut Catalog, clock: &Clock, ctx: &TxContext) {
    artwork.assert_owner(ctx.sender());
    assert!(artwork.state == STATE_MINTED, ENotMinted);
    let at = clock.timestamp_ms();
    let id = artwork.id.to_inner();
    let gallery = artwork.intended_gallery.extract();
    artwork.intended_by_authority = false;
    artwork.state = STATE_CANCELLED;
    remove_id(&mut catalog.by_intended, gallery, id);
    sync(catalog, artwork, option::none(), at);
    log(artwork, HIST_CANCELLED, at, ctx.sender(), 0, 0, option::none());
    event::emit(MintCancelled { artwork: id, by: ctx.sender(), at });
}

// Reads

public fun title(a: &Artwork): String { a.title }
public fun artist_name(a: &Artwork): String { a.artist_name }
public fun year(a: &Artwork): String { a.year }
public fun medium(a: &Artwork): String { a.medium }
public fun dimensions(a: &Artwork): String { a.dimensions }
public fun description(a: &Artwork): String { a.description }
public fun artist(a: &Artwork): address { a.artist }
public fun image_blob_id(a: &Artwork): String { a.image_blob_id }
public fun hires_blob_id(a: &Artwork): String { a.hires_blob_id }
public fun storage(a: &Artwork): vector<ID> { a.storage }
public fun minted_at(a: &Artwork): u64 { a.minted_at }
public fun owner(a: &Artwork): Option<address> { a.owner }
public fun vault(a: &Artwork): Option<ID> { a.vault }
public fun is_owner(a: &Artwork, who: address): bool { a.owner == option::some(who) }
public fun intended_gallery(a: &Artwork): Option<address> { a.intended_gallery }
public fun intended_by_authority(a: &Artwork): bool { a.intended_by_authority }
public fun state(a: &Artwork): u8 { a.state }

public fun is_minted(a: &Artwork): bool { a.state == STATE_MINTED }
public fun is_in_custody(a: &Artwork): bool { a.state == STATE_IN_CUSTODY }
public fun is_certified(a: &Artwork): bool { a.state == STATE_CERTIFIED }
public fun is_fractionalised(a: &Artwork): bool { a.state == STATE_FRACTIONALISED }
public fun is_lost(a: &Artwork): bool { a.state == STATE_LOST }
public fun is_terminal(a: &Artwork): bool { is_terminal_state(a.state) }

fun is_terminal_state(state: u8): bool {
    state == STATE_REDEEMED || state == STATE_LOST || state == STATE_CANCELLED
}

public fun assert_not_terminal(a: &Artwork) {
    assert!(!a.is_terminal(), ETerminal);
}

public fun assert_owner(a: &Artwork, who: address) {
    assert!(a.is_owner(who), ENotOwner);
}

public fun supply(a: &Artwork): u64 { a.market.supply }
public fun open_listings(a: &Artwork): u64 { a.market.open_listings }
public fun trades(a: &Artwork): u64 { a.market.trades }
public fun volume_mist(a: &Artwork): u64 { a.market.volume_mist }
public fun last_price(a: &Artwork): u64 { a.market.last_price }

public fun history_len(a: &Artwork): u64 { a.history_len }
public fun history_entry(a: &Artwork, index: u64): HistoryEntry {
    *df::borrow<HistoryKey, HistoryEntry>(&a.id, HistoryKey { index })
}
public fun history_kind(h: &HistoryEntry): u8 { h.kind }
public fun history_at(h: &HistoryEntry): u64 { h.at }
public fun history_actor(h: &HistoryEntry): address { h.actor }
public fun history_quantity(h: &HistoryEntry): u64 { h.quantity }
public fun history_amount(h: &HistoryEntry): u64 { h.amount }
public fun history_reference(h: &HistoryEntry): Option<ID> { h.reference }

public fun hist_minted(): u8 { HIST_MINTED }
public fun hist_cancelled(): u8 { HIST_CANCELLED }
public fun hist_custody(): u8 { HIST_CUSTODY }
public fun hist_reassigned(): u8 { HIST_REASSIGNED }
public fun hist_certified(): u8 { HIST_CERTIFIED }
public fun hist_fractionalised(): u8 { HIST_FRACTIONALISED }
public fun hist_consolidated(): u8 { HIST_CONSOLIDATED }
public fun hist_listed(): u8 { HIST_LISTED }
public fun hist_listing_cancelled(): u8 { HIST_LISTING_CANCELLED }
public fun hist_sale(): u8 { HIST_SALE }
public fun hist_redeem_requested(): u8 { HIST_REDEEM_REQUESTED }
public fun hist_redeem_withdrawn(): u8 { HIST_REDEEM_WITHDRAWN }
public fun hist_redeemed(): u8 { HIST_REDEEMED }
public fun hist_lost(): u8 { HIST_LOST }

// Reads

public fun catalog_count(c: &Catalog): u64 { c.count }
public fun catalog_live(c: &Catalog): u64 { c.live }
public fun chunk_size(): u64 { CHUNK }

public fun catalog_entry(c: &Catalog, index: u64): ID { c.summary(index).artwork }

public fun summary(c: &Catalog, index: u64): CatalogEntry {
    c.chunks[index / CHUNK][index % CHUNK]
}

public fun chunk_len(c: &Catalog, k: u64): u64 { c.chunks[k].length() }

public fun position_of(c: &Catalog, artwork: ID): Option<u64> {
    if (c.positions.contains(artwork)) option::some(c.positions[artwork]) else option::none()
}

public fun works_of_artist(c: &Catalog, artist: address): vector<ID> { ids_of(&c.by_artist, artist) }
public fun works_owned_by(c: &Catalog, owner: address): vector<ID> { ids_of(&c.by_owner, owner) }
public fun works_in_custody_of(c: &Catalog, gallery: address): vector<ID> { ids_of(&c.by_custodian, gallery) }
public fun works_intended_for(c: &Catalog, gallery: address): vector<ID> { ids_of(&c.by_intended, gallery) }

public fun word_count(c: &Catalog, word: String): u64 {
    if (c.words.contains(word)) c.words[word].count else 0
}

public fun word_entry(c: &Catalog, word: String, index: u64): ID {
    c.words[word].ids[index]
}

public fun bound_identity(c: &Catalog, id: vector<u8>): Option<ID> {
    let key = IdentityKey { id };
    if (df::exists(&c.id, key)) option::some(*df::borrow<IdentityKey, ID>(&c.id, key)) else option::none()
}

public fun is_bound(c: &Catalog, a: &Artwork): bool {
    c.bound_identity(a.seal_identity()) == option::some(a.id.to_inner())
}

public fun seal_salt(a: &Artwork): vector<u8> { a.seal_salt }

public fun seal_identity(a: &Artwork): vector<u8> {
    identity_bytes(&a.image_blob_id, &a.seal_salt)
}

fun identity_bytes(image_blob_id: &String, salt: &vector<u8>): vector<u8> {
    let mut out = *image_blob_id.as_bytes();
    out.append(*salt);
    out
}

public fun entry_artwork(e: &CatalogEntry): ID { e.artwork }
public fun entry_title(e: &CatalogEntry): String { e.title }
public fun entry_artist_name(e: &CatalogEntry): String { e.artist_name }
public fun entry_artist(e: &CatalogEntry): address { e.artist }
public fun entry_year(e: &CatalogEntry): String { e.year }
public fun entry_medium(e: &CatalogEntry): String { e.medium }
public fun entry_image_blob_id(e: &CatalogEntry): String { e.image_blob_id }
public fun entry_minted_at(e: &CatalogEntry): u64 { e.minted_at }
public fun entry_state(e: &CatalogEntry): u8 { e.state }
public fun entry_custodian(e: &CatalogEntry): Option<address> { e.custodian }
public fun entry_last_activity_at(e: &CatalogEntry): u64 { e.last_activity_at }

// Package-internal transitions

public(package) fun uid(a: &Artwork): &UID { &a.id }
public(package) fun uid_mut(a: &mut Artwork): &mut UID { &mut a.id }

public(package) fun set_in_custody(a: &mut Artwork) { a.state = STATE_IN_CUSTODY; }
public(package) fun set_certified(a: &mut Artwork) { a.state = STATE_CERTIFIED; }
public(package) fun set_fractionalised(a: &mut Artwork) { a.state = STATE_FRACTIONALISED; }
public(package) fun set_redeemed(a: &mut Artwork) { a.state = STATE_REDEEMED; }
public(package) fun set_lost(a: &mut Artwork) { a.state = STATE_LOST; }

public(package) fun set_intended_gallery(a: &mut Artwork, gallery: Option<address>, by_authority: bool) {
    a.intended_gallery = gallery;
    a.intended_by_authority = by_authority;
}

public(package) fun set_owner(a: &mut Artwork, owner: Option<address>, vault: Option<ID>) {
    a.owner = owner;
    a.vault = vault;
}

// Walrus SharedBlob objects behind the image, the hi-res file and the certificate documentation
public(package) fun push_storage(a: &mut Artwork, ids: vector<ID>) {
    assert!(!ids.is_empty(), EEmptyStorage);
    let mut added = vector[];
    let mut i = 0;
    while (i < ids.length()) {
        let id = ids[i];
        i = i + 1;
        if (a.storage.contains(&id)) continue;
        a.storage.push_back(id);
        added.push_back(id);
    };
    event::emit(StorageAttached { artwork: a.id.to_inner(), storage: added });
}

public(package) fun set_supply(a: &mut Artwork, supply: u64) { a.market.supply = supply; }
public(package) fun listing_opened(a: &mut Artwork) { a.market.open_listings = a.market.open_listings + 1; }
public(package) fun listing_closed(a: &mut Artwork) { a.market.open_listings = a.market.open_listings - 1; }
public(package) fun sale(a: &mut Artwork, quantity: u64, price_per_fraction: u64) {
    a.market.trades = a.market.trades + 1;
    a.market.volume_mist = a.market.volume_mist + quantity * price_per_fraction;
    a.market.last_price = price_per_fraction;
}

// Provenance journal: entry i is a dynamic field keyed by i
public(package) fun log(
    a: &mut Artwork,
    kind: u8,
    at: u64,
    actor: address,
    quantity: u64,
    amount: u64,
    reference: Option<ID>,
) {
    df::add(&mut a.id, HistoryKey { index: a.history_len }, HistoryEntry { kind, at, actor, quantity, amount, reference });
    a.history_len = a.history_len + 1;
}

public(package) fun sync(c: &mut Catalog, a: &Artwork, custodian: Option<address>, at: u64) {
    let id = a.id.to_inner();
    assert!(c.positions.contains(id), ENotInCatalog);
    let position = c.positions[id];
    let entry = &mut c.chunks[position / CHUNK][position % CHUNK];
    let was_live = !is_terminal_state(entry.state);
    let is_live = !is_terminal_state(a.state);
    if (was_live && !is_live) c.live = c.live - 1;
    if (!was_live && is_live) c.live = c.live + 1;
    entry.state = a.state;
    entry.custodian = custodian;
    entry.last_activity_at = at;
}

public(package) fun intended_add(c: &mut Catalog, gallery: address, artwork: ID) { push_id(&mut c.by_intended, gallery, artwork); }
public(package) fun intended_remove(c: &mut Catalog, gallery: address, artwork: ID) { remove_id(&mut c.by_intended, gallery, artwork); }
public(package) fun owner_add(c: &mut Catalog, owner: address, artwork: ID) { push_id(&mut c.by_owner, owner, artwork); }
public(package) fun owner_remove(c: &mut Catalog, owner: address, artwork: ID) { remove_id(&mut c.by_owner, owner, artwork); }
public(package) fun custodian_add(c: &mut Catalog, gallery: address, artwork: ID) { push_id(&mut c.by_custodian, gallery, artwork); }
public(package) fun custodian_remove(c: &mut Catalog, gallery: address, artwork: ID) { remove_id(&mut c.by_custodian, gallery, artwork); }

// Helpers

fun push_id(lists: &mut Table<address, vector<ID>>, key: address, id: ID) {
    if (lists.contains(key)) {
        lists[key].push_back(id);
    } else {
        lists.add(key, vector[id]);
    };
}

fun remove_id(lists: &mut Table<address, vector<ID>>, key: address, id: ID) {
    if (!lists.contains(key)) return;
    let list = &mut lists[key];
    let (found, index) = list.index_of(&id);
    if (found) {
        list.swap_remove(index);
    };
}

fun ids_of(lists: &Table<address, vector<ID>>, key: address): vector<ID> {
    if (lists.contains(key)) lists[key] else vector[]
}

fun index_keywords(c: &mut Catalog, keywords: vector<String>, id: ID, ctx: &mut TxContext) {
    let mut seen: vector<String> = vector[];
    let mut i = 0;
    while (i < keywords.length()) {
        let word = keywords[i];
        i = i + 1;
        assert!(!word.is_empty(), EEmptyKeyword);
        assert!(word.length() <= MAX_KEYWORD_BYTES, EKeywordTooLong);
        if (seen.contains(&word)) continue;
        seen.push_back(word);
        if (!c.words.contains(word)) {
            c.words.add(word, WordBucket { count: 0, ids: table::new(ctx) });
        };
        let bucket = &mut c.words[word];
        bucket.ids.add(bucket.count, id);
        bucket.count = bucket.count + 1;
    };
}

#[test_only]
public fun init_for_testing(ctx: &mut TxContext) { init(ctx); }

#[test_only]
public fun storage_attached_for_testing(artwork: ID, storage: vector<ID>): StorageAttached {
    StorageAttached { artwork, storage }
}
