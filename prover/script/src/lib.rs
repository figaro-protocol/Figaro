//! Reusable test-fixture builders for the figaro-prover guest program.
//!
//! `build_canonical_batch_input` produces a comprehensive end-to-end batch
//! (commit → seller attest with the full witness gates → buyer attest →
//! resolve) that the SP1 mock or real prover can execute against the
//! guest program in `../program`.
//!
//! Used by:
//! - `src/main.rs` — the manual prove-test exerciser (`cargo run -p
//!   figaro-prove-test --release`), which runs the batch through mock
//!   then optionally real CPU proving.
//! - `tests/guest_program.rs` — `cargo test -p figaro-prove-test`,
//!   which runs the same batch through mock execution as part of the
//!   normal Rust test suite. Catches guest-program drift without
//!   requiring the full real-proof CPU budget.
//!
//! The clause spec is a WITNESS INPUT: the builder loads the canonical
//! JSON from `clauses/` (the ClauseRegistry seed source) on the host and
//! ships its exact bytes inside the `AttestationContentProof`. Nothing is
//! embedded in the guest — the batch commits the (clause key → spec hash)
//! binding, and on-chain the verifier checks it against
//! `ClauseRegistry.contentHashOf`.

use alloy_primitives::{address, keccak256, Address, B256, U256};
use k256::ecdsa::SigningKey;

use figaro_kernel::eip712::*;
use figaro_kernel::kernel::clause_id_hash;
use figaro_kernel::types::*;

// ── Canonical test fixtures (mirror parity tests) ────────────────────

pub const BUYER_KEY: u64 = 0xB0B;
pub const SELLER1_KEY: u64 = 0x5E11;

pub const BUYER: Address = address!("0376AAc07Ad725E01357B1725B5ceC61aE10473c");
pub const SELLER1: Address = address!("Ad29D7a8aD3639F97798c768202F27C1dE81DC55");
pub const TOKEN: Address = address!("5615dEB798BB3E4dFa0139dFa1b3D433Cc23b72f");
pub const CORE: Address = address!("2e234DAe75C793f67A35089C9d99245E1C58470b");
pub const CHAIN_ID: u64 = 31337;

/// The committed agreement section this batch attests against — the
/// canonical-JSON sectionData for the figaro-modalities clause.
pub const SECTION_DATA: &str = r#"{"modality":"delivery"}"#;

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

// ── Witness-spec loading (host-side; the guest sees only the bytes) ──

/// Load a clause's canonical spec JSON from `clauses/` at the repo root —
/// the exact bytes `ClauseRegistry.contentHashOf` anchors.
pub fn load_spec_json(clause_id_str: &str) -> String {
    let mut p = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    p.pop(); // prover/
    p.pop(); // repo root
    p.push("clauses");
    p.push(format!("{clause_id_str}.json"));
    std::fs::read_to_string(&p).unwrap_or_else(|e| panic!("read {}: {e}", p.display()))
}

fn parse_spec(spec_json: &str) -> figaro_clause::ClauseSpec {
    let value: serde_json::Value = serde_json::from_str(spec_json).expect("spec JSON");
    match figaro_clause::parse_clause_spec(&value) {
        figaro_clause::ParseClauseSpecResult::Ok(s) => s,
        figaro_clause::ParseClauseSpecResult::Err(errors) => panic!("spec parse: {errors:?}"),
    }
}

// ── Canonical batch builder ──────────────────────────────────────────

/// Construct the canonical end-to-end batch the guest program exercises:
/// commit → seller attest (RuntimeWitness: validate + generic-encode +
/// keccak binding + agreement inclusion, all in-VM) → buyer attest
/// (ReAssert: the committed sectionData re-anchored) → resolve.
///
/// Attestations precede the resolve because the evidence window closes at
/// resolution (the kernel's OrderResolved gate). The single-section
/// agreement makes `agreement_hash` the lone section leaf, so both
/// inclusion proofs are empty.
pub fn build_canonical_batch_input() -> BatchInput {
    let buyer_key = make_signing_key(BUYER_KEY);
    let seller1_key = make_signing_key(SELLER1_KEY);
    let domain = domain_separator(CHAIN_ID, CORE);

    // The witness spec + the clause's on-chain identity key.
    let spec_json = load_spec_json("figaro-modalities");
    let spec = parse_spec(&spec_json);
    let clause_key = clause_id_hash(&spec.clause_id, spec.version);

    // RuntimeWitness content_ref = keccak256 of the canonical ABI
    // encoding of the content under the spec at stage 0.
    let content: serde_json::Value = serde_json::from_str(SECTION_DATA).unwrap();
    let canonical_bytes = figaro_clause::encode_content_from_spec(
        &spec,
        &content,
        figaro_clause::EncodeOptions { stage: Some(0) },
    )
    .expect("script-time encoding must succeed");
    let witness_content_ref = keccak256(canonical_bytes.as_slice());

    // ReAssert content_ref = keccak256 of the committed sectionData bytes.
    let re_assert_content_ref = keccak256(SECTION_DATA.as_bytes());

    // Single-section agreement: agreement_hash IS the lone section leaf
    // keccak256(keccak256(clauseKey ++ keccak256(sectionData))) — double-
    // hashed for leaf/node domain separation.
    let mut leaf_preimage = [0u8; 64];
    leaf_preimage[..32].copy_from_slice(clause_key.as_slice());
    leaf_preimage[32..].copy_from_slice(re_assert_content_ref.as_slice());
    let agreement_leaf = keccak256(keccak256(leaf_preimage));

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
    let order_hash = compute_order_hash(&process_id, &root_struct_hash);

    let resolve_hash = resolve_struct_hash(&process_id);
    let resolve_sig = sign_digest(&buyer_key, &typed_data_hash(&domain, &resolve_hash));

    let attest_struct = attest_seller_struct_hash(&order_hash, &clause_key, 0, &witness_content_ref);
    let attest_sig = sign_digest(&seller1_key, &typed_data_hash(&domain, &attest_struct));

    let buyer_attest_struct =
        attest_buyer_struct_hash(&process_id, &order_hash, &clause_key, 0, &re_assert_content_ref);
    let buyer_attest_sig = sign_digest(&buyer_key, &typed_data_hash(&domain, &buyer_attest_struct));

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
            KernelOp::AttestAsSeller {
                role: root.clone(),
                target: root.clone(),
                clause_id: clause_key,
                stage: 0,
                content_ref: witness_content_ref,
                seller_sig: attest_sig,
                proof: AttestationContentProof {
                    spec_json: spec_json.clone(),
                    content_json: SECTION_DATA.to_string(),
                    section_data: SECTION_DATA.to_string(),
                    inclusion_proof: vec![],
                    content_kind: ContentKind::RuntimeWitness,
                },
            },
            KernelOp::AttestAsBuyer {
                target: root.clone(),
                clause_id: clause_key,
                stage: 0,
                content_ref: re_assert_content_ref,
                buyer_sig: buyer_attest_sig,
                proof: AttestationContentProof {
                    spec_json,
                    content_json: SECTION_DATA.to_string(),
                    section_data: SECTION_DATA.to_string(),
                    inclusion_proof: vec![],
                    content_kind: ContentKind::ReAssert,
                },
            },
            KernelOp::Resolve {
                process_id,
                commitments: vec![root.clone()],
                buyer_sig: resolve_sig,
            },
        ],
        prev_state: KernelStateSnapshot {
            processes: vec![],
            order_status: vec![],
            order_process_id: vec![],
            usage_counted: vec![],
            usage_seller_seen: vec![],
            usage_accrual: vec![],
        },
        // RPGF: credit the clause for the process this batch just settled.
        // The claim is proved against the POST-state, which is why an order
        // committed and resolved inside one batch can still be counted by it.
        // Single-section agreement, so the section leaf IS the agreement hash
        // and the inclusion proof is empty.
        usage_claims: vec![UsageClaim {
            order: root,
            artifact: clause_key,
            kind: UsageClaimKind::Clause {
                section_hash: re_assert_content_ref,
            },
            inclusion_proof: vec![],
        }],
        usage_period: 0,
        provenance_clause: clause_id_hash("figaro-assembly-provenance", 1),
    }
}
