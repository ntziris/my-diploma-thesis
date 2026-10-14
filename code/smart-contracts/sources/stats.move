module art_tokenization::stats;

use sui::table::{Self, Table};

public struct Stats has key {
    id: UID,
    fractions_outstanding: u64,
    vaults_open: u64,
    sales: u64,
    volume_mist: u64,
    royalties_mist: u64,
    royalties_by_artist: Table<address, u64>,
    open_listings: u64,
    open_listings_by_seller: Table<address, vector<ID>>,
}

fun init(ctx: &mut TxContext) {
    transfer::share_object(Stats {
        id: object::new(ctx),
        fractions_outstanding: 0,
        vaults_open: 0,
        sales: 0,
        volume_mist: 0,
        royalties_mist: 0,
        royalties_by_artist: table::new(ctx),
        open_listings: 0,
        open_listings_by_seller: table::new(ctx),
    });
}

// Writers (package only)

public(package) fun vault_opened(s: &mut Stats, supply: u64) {
    s.fractions_outstanding = s.fractions_outstanding + supply;
    s.vaults_open = s.vaults_open + 1;
}

public(package) fun vault_closed(s: &mut Stats, supply: u64) {
    s.fractions_outstanding = s.fractions_outstanding - supply;
    s.vaults_open = s.vaults_open - 1;
}

public(package) fun sale(s: &mut Stats, artist: address, volume: u64, royalty: u64) {
    s.sales = s.sales + 1;
    s.volume_mist = s.volume_mist + volume;
    s.royalties_mist = s.royalties_mist + royalty;
    if (royalty > 0) {
        if (s.royalties_by_artist.contains(artist)) {
            let total = &mut s.royalties_by_artist[artist];
            *total = *total + royalty;
        } else {
            s.royalties_by_artist.add(artist, royalty);
        };
    };
}

public(package) fun listing_opened(s: &mut Stats, seller: address, listing: ID) {
    s.open_listings = s.open_listings + 1;
    if (s.open_listings_by_seller.contains(seller)) {
        s.open_listings_by_seller[seller].push_back(listing);
    } else {
        s.open_listings_by_seller.add(seller, vector[listing]);
    };
}

public(package) fun listing_closed(s: &mut Stats, seller: address, listing: ID) {
    s.open_listings = s.open_listings - 1;
    let list = &mut s.open_listings_by_seller[seller];
    let (found, index) = list.index_of(&listing);
    if (found) {
        list.swap_remove(index);
    };
}

// Reads

public fun fractions_outstanding(s: &Stats): u64 { s.fractions_outstanding }
public fun vaults_open(s: &Stats): u64 { s.vaults_open }
public fun sales(s: &Stats): u64 { s.sales }
public fun volume_mist(s: &Stats): u64 { s.volume_mist }
public fun royalties_mist(s: &Stats): u64 { s.royalties_mist }

public fun open_listings(s: &Stats): u64 { s.open_listings }

public fun open_listings_of(s: &Stats, seller: address): vector<ID> {
    if (s.open_listings_by_seller.contains(seller)) s.open_listings_by_seller[seller] else vector[]
}

public fun royalties_of(s: &Stats, artist: address): u64 {
    if (s.royalties_by_artist.contains(artist)) s.royalties_by_artist[artist] else 0
}

#[test_only]
public fun init_for_testing(ctx: &mut TxContext) { init(ctx); }
