#[test_only]
module art_tokenization::certificate_tests;

use sui::test_scenario as ts;
use art_tokenization::artwork::{Self, Artwork};
use art_tokenization::certificate;
use art_tokenization::custody;
use art_tokenization::fixtures::{setup, intake, certify, revoke, report_loss, gallery_a, gallery_b};

#[test, expected_failure(abort_code = custody::ENoCustody)]
fun issue_before_intake_aborts() {
    let mut s = setup();
    certify(&mut s, gallery_a(), 1);
    abort
}

#[test, expected_failure(abort_code = custody::ENotCustodian)]
fun issue_by_registered_non_holder_aborts() {
    let mut s = setup();
    intake(&mut s, gallery_a(), 1);
    certify(&mut s, gallery_b(), 2);
    abort
}

#[test, expected_failure(abort_code = certificate::ENotActive)]
fun issue_by_revoked_holder_aborts() {
    let mut s = setup();
    intake(&mut s, gallery_a(), 1);
    revoke(&mut s, gallery_a());
    certify(&mut s, gallery_a(), 2);
    abort
}

#[test, expected_failure(abort_code = certificate::EAlreadyCertified)]
fun issue_twice_aborts() {
    let mut s = setup();
    intake(&mut s, gallery_a(), 1);
    certify(&mut s, gallery_a(), 2);
    certify(&mut s, gallery_a(), 3);
    abort
}

#[test, expected_failure(abort_code = artwork::ETerminal)]
fun issue_after_loss_aborts() {
    let mut s = setup();
    intake(&mut s, gallery_a(), 1);
    report_loss(&mut s, gallery_a(), 2);
    certify(&mut s, gallery_a(), 3);
    abort
}
