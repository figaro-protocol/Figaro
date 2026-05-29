//! Reusable test-fixture builders for the figaro-prover guest program.
//!
//! `build_canonical_batch_input` produces a comprehensive end-to-end batch
//! (commit + clause register + seller register + seller attest with
//! Layer B content_proof + buyer attest + resolve) that the SP1 mock or
//! real prover can execute against the guest program in `../program`.
//!
//! Used by:
//! - `src/main.rs` — the manual prove-test exerciser (`cargo run -p
//!   figaro-prove-test --release`), which runs the batch through mock
//!   then optionally real CPU proving.
//! - `tests/guest_program.rs` — `cargo test -p figaro-prove-test`,
//!   which runs the same batch through mock execution as part of the
//!   normal Rust test suite. Catches guest-program drift without
//!   requiring the full real-proof CPU budget.

use alloy_primitives::{address, keccak256, Address, B256, U256};
use k256::ecdsa::SigningKey;

use figaro_kernel::eip712::*;
use figaro_kernel::types::*;

// ── Canonical test fixtures (mirror parity tests) ────────────────────

pub const BUYER_KEY: u64 = 0xB0B;
pub const SELLER1_KEY: u64 = 0x5E11;

pub const BUYER: Address = address!("0376AAc07Ad725E01357B1725B5ceC61aE10473c");
pub const SELLER1: Address = address!("Ad29D7a8aD3639F97798c768202F27C1dE81DC55");
pub const TOKEN: Address = address!("5615dEB798BB3E4dFa0139dFa1b3D433Cc23b72f");
pub const CORE: Address = address!("2e234DAe75C793f67A35089C9d99245E1C58470b");
pub const CHAIN_ID: u64 = 31337;

// ── Signing helpers ──────────────────────────────────────────────────

pub fn make_signing_key(secret: u64) -> SigningKey {
    let mut bytes = [0u8; 32];
    bytes[24..].copy_from_slice(&secret.to_be_bytes());
    SigningKey::from_bytes((&bytes).into()).unwrap()
}

pub fn sign_digest(key: &SigningKey, digest: &B256) -> Signature {
    use k256::ecdsa::{signature::hazmat::PrehashSigner, RecoveryId};
    let (sig, recid): (k256::ecdsa::Signature, RecoveryId) =
        key.sign_prehash(digest.as_slice()).unwrap();
    let sig_bytes = sig.to_bytes();
    Signature {
        v: recid.to_byte() + 27,
        r: B256::from_slice(&sig_bytes[..32]),
        s: B256::from_slice(&sig_bytes[32..]),
    }
}

pub fn sign_commitment(c: &Commitment, domain: &B256, key: &SigningKey) -> Signature {
    let struct_hash = commitment_struct_hash(c);
    let digest = typed_data_hash(domain, &struct_hash);
    sign_digest(key, &digest)
}

// ── Canonical batch builder ──────────────────────────────────────────

/// Construct the canonical end-to-end batch the guest program exercises:
/// commit → register clause → register seller → seller attest →
/// buyer attest → resolve.
///
/// `with_content_proof = true` attaches a Layer B `AttestationContentProof`
/// to the seller attestation, exercising the in-zkVM content gate
/// (embedded-spec lookup → validate → encode → keccak match → agreement
/// inclusion). `false` drops the proof (and zeroes `content_ref`),
/// matching the kernel's content-opaque attestation path — useful for
/// memory-tight machines where the content gate's ~109K extra cycles
/// matter.
pub fn build_canonical_batch_input(with_content_proof: bool) -> BatchInput {
    let buyer_key = make_signing_key(BUYER_KEY);
    let seller1_key = make_signing_key(SELLER1_KEY);
    let domain = domain_separator(CHAIN_ID, CORE);

    // Seller-attestation clause + content (computed up front for use in
    // both the agreement leaf and the AttestationContentProof).
    // figaro-ghg-protocol-v1 is the simplest cross-checking clause (one
    // optional uint8 field). Family `keccak256("emissions")` mirrors
    // script/Deploy.s.sol's family assignment for the GHG clauses.
    let clause_id_str = "figaro-ghg-protocol-v1";
    let clause_id = keccak256(clause_id_str.as_bytes());
    let family = keccak256(b"emissions");
    let content_json = serde_json::json!({ "scope": 1 });
    // Look up the embedded spec, parse, encode through the generic encoder.
    // Post-Keystone there is no per-clause dispatch; every caller of the
    // canonical encoder does this three-step lookup explicitly.
    let spec_json = figaro_clause::embedded_spec_json_by_key(clause_id_str)
        .expect("no embedded spec for clause");
    let spec_value: serde_json::Value = serde_json::from_str(spec_json)
        .expect("embedded spec is not valid JSON");
    let parsed_spec = match figaro_clause::parse_clause_spec(&spec_value) {
        figaro_clause::ParseClauseSpecResult::Ok(s) => s,
        figaro_clause::ParseClauseSpecResult::Err(errors) => {
            panic!("embedded spec failed to parse: {:?}", errors)
        }
    };
    let canonical_bytes = figaro_clause::encode_content_from_spec(&parsed_spec, &content_json)
        .expect("script-time encoding must succeed");
    let full_content_ref = keccak256(canonical_bytes.as_slice());
    // Single-section agreement: agreement_hash IS the lone section leaf, so
    // the kernel's Gate 5 (agreement inclusion) verifies with an empty proof.
    let mut leaf_preimage = [0u8; 64];
    leaf_preimage[..32].copy_from_slice(clause_id.as_slice());
    leaf_preimage[32..].copy_from_slice(full_content_ref.as_slice());
    let agreement_leaf = keccak256(leaf_preimage);

    let root = Commitment {
        process_id: B256::ZERO,
        buyer: BUYER,
        seller: SELLER1,
        currency: TOKEN,
        payment: U256::from(100_000_000_000_000_000_000u128),
        expected_cumulative_value: U256::from(100_000_000_000_000_000_000u128),
        agreement_hash: agreement_leaf,
        salt: U256::from(42u64),
        deadline: U256::from(2000u64),
    };

    let root_buyer_sig = sign_commitment(&root, &domain, &buyer_key);
    let root_seller_sig = sign_commitment(&root, &domain, &seller1_key);

    let root_struct_hash = commitment_struct_hash(&root);
    let process_id = typed_data_hash(&domain, &root_struct_hash);

    let resolve_hash = resolve_struct_hash(&process_id);
    let resolve_digest = typed_data_hash(&domain, &resolve_hash);
    let resolve_sig = sign_digest(&buyer_key, &resolve_digest);

    let uri_hash = keccak256("ipfs://QmClause");
    let clause_struct = register_clause_struct_hash(&clause_id, 1, &uri_hash, &family);
    let clause_sig = sign_digest(&buyer_key, &typed_data_hash(&domain, &clause_struct));

    let op_struct = register_seller_struct_hash("ipfs://QmOp");
    let op_sig = sign_digest(&seller1_key, &typed_data_hash(&domain, &op_struct));

    let content_ref = if with_content_proof {
        full_content_ref
    } else {
        B256::ZERO
    };

    let order_hash = compute_order_hash(&process_id, &root_struct_hash);
    let attest_struct = attest_seller_struct_hash(&order_hash, &clause_id, 1, &content_ref);
    let attest_sig = sign_digest(&seller1_key, &typed_data_hash(&domain, &attest_struct));

    let buyer_attest_struct =
        attest_buyer_struct_hash(&process_id, &order_hash, &clause_id, 0, &B256::ZERO);
    let buyer_attest_sig =
        sign_digest(&buyer_key, &typed_data_hash(&domain, &buyer_attest_struct));

    BatchInput {
        chain_id: CHAIN_ID,
        verifying_contract: CORE,
        block_timestamp: 1000,
        operations: vec![
            KernelOp::Commit {
                commitment: root.clone(),
                buyer_sig: root_buyer_sig,
                seller_sig: root_seller_sig,
            },
            KernelOp::RegisterClause {
                clause_id,
                version: 1,
                uri_hash,
                family,
                registrar_sig: clause_sig,
            },
            KernelOp::RegisterSeller {
                metadata_uri: "ipfs://QmOp".to_string(),
                seller_sig: op_sig,
            },
            KernelOp::AttestAsSeller {
                role_commitment: root.clone(),
                order_hash,
                clause_id,
                stage: 1,
                content_ref,
                seller_sig: attest_sig,
                content_proof: if with_content_proof {
                    Some(AttestationContentProof {
                        content_json: serde_json::to_string(&content_json).unwrap(),
                        inclusion_proof: vec![],
                        section_data: None,
                    })
                } else {
                    None
                },
            },
            KernelOp::AttestAsBuyer {
                process_id,
                order_hash,
                clause_id,
                stage: 0,
                content_ref: B256::ZERO,
                buyer_sig: buyer_attest_sig,
                content_proof: None,
            },
            KernelOp::Resolve {
                process_id,
                commitments: vec![root],
                buyer_sig: resolve_sig,
            },
        ],
        prev_state: KernelStateSnapshot {
            processes: vec![],
            order_status: vec![],
            order_process_id: vec![],
            clauses_registered: vec![],
            sellers_registered: vec![],
        },
    }
}
