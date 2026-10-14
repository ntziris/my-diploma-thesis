#[test_only]
module art_tokenization::policy_tests;

use sui::test_scenario as ts;
use art_tokenization::artwork::{Self, Artwork, Catalog};
use art_tokenization::fixtures::{setup, setup_fractionalised, mint_other, mint_salted, artist, stranger};
use art_tokenization::fraction::{Self, Fraction};
use art_tokenization::policy;

const INVESTOR: address = @0x11;

fun identity_of(a: &Artwork): vector<u8> { a.seal_identity() }

// Policy 1: full resolution

#[test]
fun owner_may_decrypt_full_res() {
    let mut s = setup();
    s.next_tx(artist());
    let a = s.take_shared<Artwork>();
    let catalog = s.take_shared<Catalog>();
    policy::seal_approve_full_res(identity_of(&a), &a, &catalog, s.ctx());
    ts::return_shared(catalog);
    ts::return_shared(a);
    s.end();
}

#[test, expected_failure(abort_code = policy::EWrongIdentity)]
fun identity_with_suffix_is_rejected() {
    let mut s = setup();
    s.next_tx(artist());
    let a = s.take_shared<Artwork>();
    let catalog = s.take_shared<Catalog>();
    let mut id = identity_of(&a);
    id.push_back(7);
    policy::seal_approve_full_res(id, &a, &catalog, s.ctx());
    abort
}

#[test, expected_failure(abort_code = policy::ENoAccess)]
fun stranger_may_not_decrypt_full_res() {
    let mut s = setup();
    s.next_tx(stranger());
    let a = s.take_shared<Artwork>();
    let catalog = s.take_shared<Catalog>();
    policy::seal_approve_full_res(identity_of(&a), &a, &catalog, s.ctx());
    abort
}

#[test, expected_failure(abort_code = policy::ENoAccess)]
fun artist_loses_owner_access_once_fractionalised() {
    let mut s = setup_fractionalised(100);
    let a = s.take_shared<Artwork>();
    let catalog = s.take_shared<Catalog>();
    policy::seal_approve_full_res(identity_of(&a), &a, &catalog, s.ctx());
    abort
}

#[test]
fun fraction_holder_may_decrypt_full_res() {
    let mut s = setup_fractionalised(100);
    {
        let mut f = s.take_from_sender<Fraction>();
        let part = f.split(10, s.ctx());
        fraction::transfer_for_testing(part, INVESTOR);
        s.return_to_sender(f);
    };
    s.next_tx(INVESTOR);
    let a = s.take_shared<Artwork>();
    let catalog = s.take_shared<Catalog>();
    let f = s.take_from_sender<Fraction>();
    policy::seal_approve_full_res_holder(identity_of(&a), &a, &catalog, &f, s.ctx());
    s.return_to_sender(f);
    ts::return_shared(catalog);
    ts::return_shared(a);
    s.end();
}

#[test, expected_failure(abort_code = policy::ENoAccess)]
fun fraction_of_another_vault_is_rejected() {
    let mut s = setup_fractionalised(100);
    mint_other(&mut s, artist(), b"Other", b"blob-other", vector[], 5);
    s.next_tx(artist());
    let catalog = s.take_shared<Catalog>();
    let other = s.take_shared_by_id<Artwork>(catalog.catalog_entry(1));
    let f = s.take_from_sender<Fraction>();
    policy::seal_approve_full_res_holder(identity_of(&other), &other, &catalog, &f, s.ctx());
    abort
}

#[test, expected_failure(abort_code = policy::EWrongIdentity)]
fun identity_of_another_artwork_is_rejected() {
    let mut s = setup();
    s.next_tx(artist());
    let a = s.take_shared<Artwork>();
    let catalog = s.take_shared<Catalog>();
    let other = b"someOtherBlobIdOfTheSameLength__________xyz";
    policy::seal_approve_full_res(other, &a, &catalog, s.ctx());
    abort
}

// The salted identity

#[test]
fun the_same_image_can_be_issued_twice_under_two_salts() {
    let mut s = setup();
    mint_salted(&mut s, artist(), b"First", b"blob-shared", b"salt-one", 5);
    mint_salted(&mut s, artist(), b"Second", b"blob-shared", b"salt-two", 6);
    s.next_tx(artist());
    let catalog = s.take_shared<Catalog>();
    let first = s.take_shared_by_id<Artwork>(catalog.catalog_entry(1));
    let second = s.take_shared_by_id<Artwork>(catalog.catalog_entry(2));
    assert!(first.image_blob_id() == second.image_blob_id());
    assert!(first.seal_identity() != second.seal_identity());
    assert!(catalog.is_bound(&first));
    assert!(catalog.is_bound(&second));
    ts::return_shared(first);
    ts::return_shared(second);
    ts::return_shared(catalog);
    s.end();
}

#[test, expected_failure(abort_code = artwork::EIdentityAlreadyBound)]
fun copying_the_image_and_the_salt_cannot_be_minted() {
    let mut s = setup();
    mint_salted(&mut s, artist(), b"First", b"blob-shared", b"salt-one", 5);
    mint_salted(&mut s, stranger(), b"Decoy", b"blob-shared", b"salt-one", 6);
    abort
}

#[test, expected_failure(abort_code = policy::EWrongIdentity)]
fun a_decoy_with_its_own_salt_cannot_unlock_the_original() {
    let mut s = setup();
    mint_salted(&mut s, artist(), b"First", b"blob-shared", b"salt-one", 5);
    s.next_tx(artist());
    let catalog = s.take_shared<Catalog>();
    let original = s.take_shared_by_id<Artwork>(catalog.catalog_entry(1));
    let target = original.seal_identity();
    ts::return_shared(original);
    ts::return_shared(catalog);
    mint_salted(&mut s, stranger(), b"Decoy", b"blob-shared", b"salt-two", 6);
    s.next_tx(stranger());
    let catalog = s.take_shared<Catalog>();
    let decoy = s.take_shared_by_id<Artwork>(catalog.catalog_entry(2));
    policy::seal_approve_full_res(target, &decoy, &catalog, s.ctx());
    abort
}

