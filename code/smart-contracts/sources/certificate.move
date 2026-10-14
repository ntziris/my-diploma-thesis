module art_tokenization::certificate;

use std::string::String;
use sui::clock::Clock;
use sui::dynamic_object_field as dof;
use sui::event;
use art_tokenization::artwork::{Self, Artwork, Catalog};
use art_tokenization::custody;
use art_tokenization::registry::{Registry, Gallery};

#[error(code = 0)]
const ENotActive: vector<u8> = b"the sender is not an active gallery";
#[error(code = 1)]
const EAlreadyCertified: vector<u8> = b"the artwork already carries a certificate";
#[error(code = 2)]
const EEmptyStatement: vector<u8> = b"a certificate needs a statement";
#[error(code = 3)]
const ENoCertificate: vector<u8> = b"the artwork carries no certificate";

public struct CertificateKey has copy, drop, store {}

public struct Certificate has key, store {
    id: UID,
    issuer: address,
    issued_at: u64,
    statement: String,
    documentation_blob_id: String,
}

public struct CertificateIssued has copy, drop {
    artwork: ID,
    certificate: ID,
    issuer: address,
    at: u64,
}

public fun issue(
    artwork: &mut Artwork,
    galleries: &Registry<Gallery>,
    catalog: &mut Catalog,
    statement: String,
    documentation_blob_id: String,
    clock: &Clock,
    ctx: &mut TxContext,
) {
    let issuer = ctx.sender();
    assert!(galleries.is_active(issuer), ENotActive);
    artwork.assert_not_terminal();
    custody::assert_custodian(artwork, issuer);
    assert!(!exists(artwork), EAlreadyCertified);
    assert!(!statement.is_empty(), EEmptyStatement);
    let at = clock.timestamp_ms();
    let cert = Certificate { id: object::new(ctx), issuer, issued_at: at, statement, documentation_blob_id };
    let certificate = object::id(&cert);
    dof::add(artwork.uid_mut(), CertificateKey {}, cert);
    artwork.set_certified();
    catalog.sync(artwork, option::some(issuer), at);
    artwork.log(artwork::hist_certified(), at, issuer, 0, 0, option::some(certificate));
    event::emit(CertificateIssued { artwork: object::id(artwork), certificate, issuer, at });
}

// Reads

public fun exists(artwork: &Artwork): bool {
    dof::exists(artwork.uid(), CertificateKey {})
}

public fun issuer(artwork: &Artwork): address { cert(artwork).issuer }
public fun issued_at(artwork: &Artwork): u64 { cert(artwork).issued_at }
public fun statement(artwork: &Artwork): String { cert(artwork).statement }
public fun documentation_blob_id(artwork: &Artwork): String { cert(artwork).documentation_blob_id }

fun cert(artwork: &Artwork): &Certificate {
    assert!(exists(artwork), ENoCertificate);
    dof::borrow(artwork.uid(), CertificateKey {})
}
