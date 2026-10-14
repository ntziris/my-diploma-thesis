module art_tokenization::policy;

use art_tokenization::artwork::{Artwork, Catalog};
use art_tokenization::fraction::Fraction;

#[error(code = 0)]
const ENoAccess: vector<u8> = b"the sender is not allowed to decrypt this data";
#[error(code = 1)]
const EWrongIdentity: vector<u8> = b"the identity does not belong to this artwork";

entry fun seal_approve_full_res(id: vector<u8>, artwork: &Artwork, catalog: &Catalog, ctx: &TxContext) {
    assert!(is_for(id, artwork, catalog), EWrongIdentity);
    assert!(artwork.is_owner(ctx.sender()), ENoAccess);
}

entry fun seal_approve_full_res_holder(
    id: vector<u8>,
    artwork: &Artwork,
    catalog: &Catalog,
    fraction: &Fraction,
    _ctx: &TxContext,
) {
    assert!(is_for(id, artwork, catalog), EWrongIdentity);
    assert!(artwork.vault() == option::some(fraction.vault_id()), ENoAccess);
}

fun is_for(id: vector<u8>, artwork: &Artwork, catalog: &Catalog): bool {
    id == artwork.seal_identity() && catalog.is_bound(artwork)
}
