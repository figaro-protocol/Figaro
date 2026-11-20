//! The shape gate of an attestation on the reserved provenance leaf.
//!
//! `kernel::validate_provenance_attestation` refuses clause data whose
//! length is not the leaf's one length OR whose bytes do not open with
//! `{"agreementHash":"0x`, before it reads the two 64-digit words at fixed
//! offsets. Each arm is pinned here on its own: a leaf with the right
//! opening but too short (the length arm alone refuses it; without that
//! arm the fixed-offset read runs past the end of the bytes), and a leaf of
//! the right length with a wrong opening (the opening arm alone refuses
//! it). A canonical leaf under a wrong `content_ref` passes the shape gate
//! and stops at the content hash, so the two refusals above come from the
//! shape gate and from nothing else.

use alloy_primitives::{keccak256, B256};

use figaro_kernel::kernel::{
    provenance_leaf_bytes, validate_attestation_content, PROVENANCE_LEAF_KEY,
};
use figaro_kernel::types::*;

fn proof_over(clause_data: &[u8]) -> AttestationContentProof {
    AttestationContentProof {
        spec_json: String::new(),
        content_json: String::new(),
        clause_data: String::from_utf8(clause_data.to_vec()).expect("ASCII leaf"),
        inclusion_proof: Vec::new(),
        content_kind: ContentKind::ReAssert,
    }
}

fn verdict(clause_data: &[u8], content_ref: &B256) -> Result<(), KernelError> {
    let checkout_hash = B256::repeat_byte(0x77);
    validate_attestation_content(
        &proof_over(clause_data),
        content_ref,
        &PROVENANCE_LEAF_KEY,
        0,
        &checkout_hash,
    )
    .map(|binding| assert!(binding.is_none(), "the provenance leaf has no spec binding"))
}

fn canonical() -> Vec<u8> {
    provenance_leaf_bytes(&B256::repeat_byte(0xab), &B256::repeat_byte(0xcd))
}

#[test]
fn a_canonical_leaf_passes_the_shape_gate() {
    let bytes = canonical();
    let wrong_ref = B256::repeat_byte(0x01);
    assert!(matches!(
        verdict(&bytes, &wrong_ref),
        Err(KernelError::ContentHashMismatch)
    ));
}

#[test]
fn a_leaf_with_the_right_opening_but_too_short_is_refused() {
    // The opening and the agreementHash's 64 digits, nothing after them:
    // the processDesignHash's digits would be read past the end.
    let full = canonical();
    let opening = b"{\"agreementHash\":\"0x".len();
    let bytes = &full[..opening + 64];
    assert!(bytes.starts_with(b"{\"agreementHash\":\"0x"));
    assert!(matches!(
        verdict(bytes, &keccak256(bytes)),
        Err(KernelError::ProvenanceLeafNotCanonical)
    ));
}

#[test]
fn a_leaf_of_the_right_length_with_a_wrong_opening_is_refused() {
    let mut bytes = canonical();
    bytes[2] = b'A'; // `{"AgreementHash"…`: same length, wrong opening.
    assert_eq!(bytes.len(), canonical().len());
    assert!(matches!(
        verdict(&bytes, &keccak256(&bytes)),
        Err(KernelError::ProvenanceLeafNotCanonical)
    ));
}
