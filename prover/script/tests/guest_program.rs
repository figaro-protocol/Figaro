//! Host-side integration tests for the figaro-prover SP1 guest program.
//!
//! Runs the guest in SP1's mock executor against canonical fixtures from
//! `figaro_prove_test::build_canonical_batch_input` and asserts the
//! committed PublicValues. Catches guest-program drift (kernel rejecting
//! a previously-valid batch, public-values layout changes, etc.) without
//! the cost of a real SP1 proof — Stage 2 of the manual exerciser is the
//! cryptographic check; this is the correctness check.
//!
//! Mock execution emulates the RISC-V ELF in software: fast enough for
//! the regular `cargo test` loop, no proving keys involved.

use alloy_primitives::B256;
use figaro_kernel::types::{KernelOp, PublicValues};
use figaro_prove_test::{build_canonical_batch_input, CHAIN_ID, CORE};
use sp1_sdk::{Prover, ProverClient, SP1Stdin};

/// Genesis state root committed by `KernelState::default().compute_root()`.
/// Must match `script/Deploy.s.sol` and `KernelStateSnapshot::compute_root`
/// for an empty initial state; any drift here is a state-root regression.
const GENESIS_STATE_ROOT: [u8; 32] = [
    0x82, 0x6c, 0x6f, 0x22, 0xe4, 0x36, 0x2b, 0x1b, 0x34, 0xf0, 0x80, 0xcc, 0x37, 0xde, 0xab, 0x33,
    0x58, 0xdf, 0x5d, 0x98, 0x59, 0x2f, 0xd1, 0x95, 0x34, 0xc2, 0x8c, 0x1f, 0xb7, 0x13, 0xfd, 0x8c,
];

async fn execute_guest(input: &figaro_kernel::types::BatchInput) -> sp1_sdk::SP1PublicValues {
    let elf = sp1_sdk::include_elf!("figaro-prover");
    let client = ProverClient::builder().mock().build().await;
    let mut stdin = SP1Stdin::new();
    stdin.write(input);
    let (public_values, _report) = client
        .execute(elf, stdin)
        .await
        .expect("guest execution failed");
    public_values
}

#[tokio::test]
async fn guest_program_executes_full_batch_with_content_proof() {
    let input = build_canonical_batch_input(true);
    let mut pv_bytes = execute_guest(&input).await;
    let pv: PublicValues = pv_bytes.read();

    assert_eq!(pv.chain_id, CHAIN_ID);
    assert_eq!(pv.verifying_contract, CORE);
    assert_eq!(pv.prev_state_root.0, GENESIS_STATE_ROOT, "prev root must be genesis");
    assert_ne!(pv.prev_state_root, pv.new_state_root, "state must advance");
    assert_ne!(pv.attestation_events_hash, B256::ZERO, "attestation events must be hashed");
    assert_ne!(pv.clause_events_hash, B256::ZERO, "clause events must be hashed");
    assert_ne!(pv.seller_events_hash, B256::ZERO, "seller events must be hashed");
}

#[tokio::test]
async fn guest_program_executes_minimal_batch_without_content_proof() {
    let input = build_canonical_batch_input(false);
    let mut pv_bytes = execute_guest(&input).await;
    let pv: PublicValues = pv_bytes.read();

    // Minimal batch advances the same state, runs the same ops — just
    // with a content-opaque seller attestation.
    assert_eq!(pv.chain_id, CHAIN_ID);
    assert_eq!(pv.verifying_contract, CORE);
    assert_ne!(pv.prev_state_root, pv.new_state_root);
    assert_ne!(pv.attestation_events_hash, B256::ZERO);
}

#[tokio::test]
async fn guest_program_full_and_minimal_diverge_on_attestation_hash() {
    // The full batch's seller attestation carries `content_ref =
    // keccak256(canonical_bytes)`; the minimal batch's carries
    // `B256::ZERO`. attestation_events_hash hashes the content_ref into
    // its input, so the two batches MUST produce different hashes —
    // proving the content gate's input is actually reaching the public
    // commitment, not getting silently dropped.
    let full = build_canonical_batch_input(true);
    let minimal = build_canonical_batch_input(false);
    let mut full_pv = execute_guest(&full).await;
    let mut minimal_pv = execute_guest(&minimal).await;
    let full: PublicValues = full_pv.read();
    let minimal: PublicValues = minimal_pv.read();

    assert_ne!(
        full.attestation_events_hash, minimal.attestation_events_hash,
        "content_ref divergence must surface in attestation_events_hash",
    );
    // State root + non-attestation hashes are identical across the two
    // — only the seller attestation's content_ref changes between modes.
    assert_eq!(full.new_state_root, minimal.new_state_root);
    assert_eq!(full.clause_events_hash, minimal.clause_events_hash);
    assert_eq!(full.seller_events_hash, minimal.seller_events_hash);
}

#[tokio::test]
async fn guest_program_rejects_corrupt_buyer_signature_on_commit() {
    // The guest's `apply_batch(&input).expect("invalid batch")` panics
    // when the kernel rejects an op (here: ECDSA recovery on a zeroed
    // `r`). SP1's mock executor catches the guest panic — `execute()`
    // returns Ok with the report from before the panic, but
    // `public_values` contains nothing (the panic preceded the
    // `commit()` call). A corrupt batch therefore surfaces as empty
    // public-values bytes; this assertion is the host-side regression
    // gate at the guest layer.
    let mut input = build_canonical_batch_input(true);
    if let KernelOp::Commit { buyer_sig, .. } = &mut input.operations[0] {
        buyer_sig.r = B256::ZERO;
    } else {
        panic!("expected first op to be Commit");
    }

    let elf = sp1_sdk::include_elf!("figaro-prover");
    let client = ProverClient::builder().mock().build().await;
    let mut stdin = SP1Stdin::new();
    stdin.write(&input);
    let (public_values, _report) =
        client.execute(elf, stdin).await.expect("mock executor must finish");

    assert!(
        public_values.as_slice().is_empty(),
        "panicked guest must commit no public values; got {} bytes",
        public_values.as_slice().len(),
    );
}
