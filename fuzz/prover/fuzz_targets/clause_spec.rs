//! The clause-spec engine over arbitrary witness bytes, through the gate the
//! proof program runs.
//!
//! A plaintext attestation witness (`AttestationContentProof`) carries the
//! spec JSON, the content JSON and the committed clause data as strings the
//! attesting party writes. Registering a clause is permissionless, so the
//! spec is as untrusted as the content: whoever writes it can register its
//! hash. The target sets the clause id to `keccak256(spec_json)` so the bytes
//! pass the identity check and reach the parser, the validator and the
//! encoder (`kernel::validate_attestation_content`, gates S and C), then
//! gate I. It holds one thing: no input panics.
//!
//! Input layout: byte 0 picks the content kind (low bit) and the stage (the
//! rest); the remaining bytes, read as lossy UTF-8, split at the first two
//! NUL characters into spec JSON, content JSON and clause data.
#![no_main]

use alloy_primitives::{keccak256, B256};
use figaro_kernel::kernel::validate_attestation_content;
use figaro_kernel::types::{AttestationContentProof, ContentKind};
use libfuzzer_sys::fuzz_target;

fuzz_target!(|data: &[u8]| {
    let Some((&head, rest)) = data.split_first() else {
        return;
    };
    let text = String::from_utf8_lossy(rest);
    let mut parts = text.splitn(3, '\0');
    let spec_json = parts.next().unwrap_or("").to_string();
    let content_json = parts.next().unwrap_or("").to_string();
    let clause_data = parts.next().unwrap_or("").to_string();

    let content_kind = if head & 1 == 0 {
        ContentKind::RuntimeWitness
    } else {
        ContentKind::ReAssert
    };
    let stage = head >> 1;
    let clause_id = keccak256(spec_json.as_bytes());
    let content_ref = match content_kind {
        ContentKind::ReAssert => keccak256(clause_data.as_bytes()),
        ContentKind::RuntimeWitness => B256::ZERO,
    };
    let proof = AttestationContentProof {
        spec_json,
        content_json,
        clause_data,
        inclusion_proof: Vec::new(),
        content_kind,
    };
    let _ = validate_attestation_content(&proof, &content_ref, &clause_id, stage, &B256::ZERO);
});
