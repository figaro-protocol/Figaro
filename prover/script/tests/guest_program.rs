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
use figaro_kernel::kernel::apply_batch;
use figaro_kernel::state::KernelState;
use figaro_kernel::types::{KernelOp, PublicValues};
use figaro_prove_test::{build_canonical_batch_input, load_spec_json, CHAIN_ID, CORE};
use sp1_sdk::{Prover, ProverClient, SP1Stdin};

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
async fn guest_program_executes_canonical_batch() {
    let input = build_canonical_batch_input();
    let mut pv_bytes = execute_guest(&input).await;
    let pv: PublicValues = pv_bytes.read();

    assert_eq!(pv.chain_id, CHAIN_ID);
    assert_eq!(pv.verifying_contract, CORE);
    // The genesis root is whatever the empty kernel state hashes to —
    // recomputed on the host, never a stored constant. The deploy wiring
    // pins the same value when the verifier lands on-chain.
    assert_eq!(
        pv.prev_state_root,
        KernelState::new().compute_root(),
        "prev root must be the empty-state genesis root",
    );
    assert_ne!(pv.prev_state_root, pv.new_state_root, "state must advance");
    assert_ne!(pv.attestation_events_hash, B256::ZERO, "attestation events must be hashed");
    assert_ne!(pv.spec_bindings_hash, B256::ZERO, "spec bindings must be committed");
}

#[tokio::test]
async fn guest_output_matches_host_apply_batch_exactly() {
    // The strongest drift gate: the guest's committed PublicValues must
    // equal the host-side apply_batch on the identical input, field for
    // field — one kernel, two execution environments.
    let input = build_canonical_batch_input();
    let (host_pv, _positions, host_events) = apply_batch(&input).expect("host apply_batch");

    let mut pv_bytes = execute_guest(&input).await;
    let guest_pv: PublicValues = pv_bytes.read();

    assert_eq!(guest_pv.prev_state_root, host_pv.prev_state_root);
    assert_eq!(guest_pv.new_state_root, host_pv.new_state_root);
    assert_eq!(guest_pv.token_ops_hash, host_pv.token_ops_hash);
    assert_eq!(guest_pv.attestation_events_hash, host_pv.attestation_events_hash);
    assert_eq!(guest_pv.spec_bindings_hash, host_pv.spec_bindings_hash);

    // The batch carried one clause across both attestations → exactly one
    // deduplicated spec binding.
    assert_eq!(host_events.spec_bindings.len(), 1);
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
    let mut input = build_canonical_batch_input();
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

#[tokio::test]
async fn guest_program_rejects_substituted_witness_spec() {
    // Gate S inside the VM: swapping the witness spec for a different
    // clause's spec (a permissive-spec substitution) must kill the batch —
    // the spec's (clauseId, version) no longer hash to the op's clause key.
    let mut input = build_canonical_batch_input();
    let wrong_spec = load_spec_json("figaro-handoff");
    match &mut input.operations[1] {
        KernelOp::AttestAsSeller { proof, .. } => proof.spec_json = wrong_spec,
        other => panic!("expected op[1] to be AttestAsSeller, got {other:?}"),
    }

    let elf = sp1_sdk::include_elf!("figaro-prover");
    let client = ProverClient::builder().mock().build().await;
    let mut stdin = SP1Stdin::new();
    stdin.write(&input);
    let (public_values, _report) =
        client.execute(elf, stdin).await.expect("mock executor must finish");

    assert!(
        public_values.as_slice().is_empty(),
        "spec substitution must abort the guest before any commitment",
    );
}
