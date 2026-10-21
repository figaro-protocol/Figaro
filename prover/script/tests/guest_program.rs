//! Host-side integration tests for the figaro-prover SP1 guest program.
//!
//! Runs the guest in SP1's mock executor against canonical fixtures from
//! `figaro_prove_test::build_canonical_batch_input` and asserts the
//! committed PublicValues. Catches guest-program drift (the mirror rejecting
//! a previously-valid batch, public-values layout changes, etc.) without
//! the cost of a real SP1 proof — Stage 2 of the manual exerciser is the
//! cryptographic check; this is the correctness check.
//!
//! Mock execution emulates the RISC-V ELF in software: fast enough for
//! the regular `cargo test` loop, no proving keys involved.

use alloy_primitives::{keccak256, B256, U256};
use figaro_kernel::eip712::{commitment_struct_hash, domain_separator, resolve_struct_hash, typed_data_hash};
use figaro_kernel::kernel::{apply_batch, provenance_leaf_bytes};
use figaro_kernel::state::KernelState;
use figaro_kernel::types::{
    BatchInput, Commitment, KernelOp, KernelStateSnapshot, PublicValues, UsageClaim, UsageClaimKind,
    USAGE_KIND_AGREEMENT, USAGE_KIND_ASSEMBLY,
};
use figaro_prove_test::{
    build_canonical_batch_input, load_spec_json, make_signing_key, sign_commitment, sign_digest, BUYER,
    BUYER_KEY, CHAIN_ID, CORE, SELLER1, SELLER1_KEY, TOKEN,
};
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
    let pv_bytes = execute_guest(&input).await;
    let pv = PublicValues::abi_decode(pv_bytes.as_slice()).expect("decode public values");

    assert_eq!(pv.chain_id, CHAIN_ID);
    assert_eq!(pv.verifying_contract, CORE);
    // The genesis root is whatever the empty mirror state hashes to —
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
    // field — one mirror, two execution environments.
    let input = build_canonical_batch_input();
    let (host_pv, _positions, host_events) = apply_batch(&input).expect("host apply_batch");

    let pv_bytes = execute_guest(&input).await;
    // Byte equality against the host encoding first — these are the exact
    // bytes the on-chain verifier hashes against the proof's digest.
    assert_eq!(pv_bytes.as_slice(), host_pv.abi_encode().as_slice());
    let guest_pv = PublicValues::abi_decode(pv_bytes.as_slice()).expect("decode public values");

    assert_eq!(guest_pv.prev_state_root, host_pv.prev_state_root);
    assert_eq!(guest_pv.new_state_root, host_pv.new_state_root);
    assert_eq!(guest_pv.token_ops_hash, host_pv.token_ops_hash);
    assert_eq!(guest_pv.attestation_events_hash, host_pv.attestation_events_hash);
    assert_eq!(guest_pv.spec_bindings_hash, host_pv.spec_bindings_hash);
    assert_eq!(guest_pv.usage_accrual_hash, host_pv.usage_accrual_hash);

    // The batch carried one clause across both attestations → exactly one
    // deduplicated spec binding.
    assert_eq!(host_events.spec_bindings.len(), 1);

    // And it credited the clause for the process it resolved — asserted here
    // because "field for field" above is only as strong as the batch it runs
    // on: an empty accrual would make `usage_accrual_hash` agree trivially.
    assert_eq!(host_events.usage_accruals.len(), 1, "the canonical batch credits one clause");
    assert_eq!(host_events.usage_accruals[0].c, 1);
    assert_eq!(host_events.usage_accruals[0].d, 1);
    assert_eq!(host_events.usage_sellers.len(), 1, "one seller to stake-check");
}

#[tokio::test]
async fn guest_program_rejects_corrupt_buyer_signature_on_commit() {
    // The guest's `apply_batch(&input).expect("invalid batch")` panics
    // when the mirror rejects an op (here: ECDSA recovery on a zeroed
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
    // the spec's bytes no longer hash to the op's clause key.
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

// ── The agreement and assembly claims inside the VM ──────────────────

/// A leaf of the agreement format, `keccak256(keccak256(key ‖ content))`.
fn format_leaf(key: &B256, content: &B256) -> B256 {
    let mut preimage = [0u8; 64];
    preimage[..32].copy_from_slice(key.as_slice());
    preimage[32..].copy_from_slice(content.as_slice());
    keccak256(keccak256(preimage))
}

fn sorted_pair(a: B256, b: B256) -> B256 {
    let (lo, hi) = if a <= b { (a, b) } else { (b, a) };
    let mut pair = [0u8; 64];
    pair[..32].copy_from_slice(lo.as_slice());
    pair[32..].copy_from_slice(hi.as_slice());
    keccak256(pair)
}

/// One order whose agreement's lone leaf is the provenance leaf naming
/// agreement 0 of a two-agreement assembly; committed and resolved in the
/// batch, then claimed for the agreement (kind 2) and the assembly (kind 1).
/// With `membership_root_is_the_claimed_one` false, the assembly claim's
/// membership proof opens agreement 0 under another assembly's root.
fn provenance_batch(membership_root_is_the_claimed_one: bool) -> BatchInput {
    let buyer_key = make_signing_key(BUYER_KEY);
    let seller_key = make_signing_key(SELLER1_KEY);
    let domain = domain_separator(CHAIN_ID, CORE);
    let provenance_key = keccak256(b"figaro-agreement-provenance");

    let agreement = keccak256(b"an-agreement");
    let slot0 = keccak256(br#"{"clauses":{},"slot":0}"#);
    let slot1_leaf = format_leaf(
        &keccak256(b"the-following-agreement"),
        &keccak256(br#"{"clauses":{"0x01":{"parentOrderHashes":["order-0"]}},"slot":1}"#),
    );
    let composition = sorted_pair(format_leaf(&agreement, &slot0), slot1_leaf);
    let membership = if membership_root_is_the_claimed_one {
        vec![slot1_leaf]
    } else {
        vec![format_leaf(&keccak256(b"some-other-agreement"), &slot0)]
    };

    let clause_data_hash = keccak256(provenance_leaf_bytes(&agreement, &composition));
    let order = Commitment {
        process_id: B256::ZERO,
        buyer: BUYER,
        seller: SELLER1,
        currency: TOKEN,
        payment: U256::from(100u64),
        expected_cumulative_value: U256::from(100u64),
        checkout_hash: format_leaf(&provenance_key, &clause_data_hash),
        salt: U256::from(77u64),
        deadline: U256::from(2000u64),
    };
    let process_id = typed_data_hash(&domain, &commitment_struct_hash(&order));
    let resolve_sig = sign_digest(&buyer_key, &typed_data_hash(&domain, &resolve_struct_hash(&process_id)));

    BatchInput {
        chain_id: CHAIN_ID,
        verifying_contract: CORE,
        block_timestamp: 1000,
        operations: vec![
            KernelOp::Commit {
                commitment: order.clone(),
                buyer_sig: sign_commitment(&order, &domain, &buyer_key),
                seller_sig: sign_commitment(&order, &domain, &seller_key),
            },
            KernelOp::Resolve {
                process_id,
                commitments: vec![order.clone()],
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
        usage_claims: vec![
            UsageClaim {
                order: order.clone(),
                clause_or_assembly: agreement,
                kind: UsageClaimKind::Agreement { composition_hash: composition },
                inclusion_proof: vec![],
            },
            UsageClaim {
                order,
                clause_or_assembly: composition,
                kind: UsageClaimKind::Assembly {
                    agreement_hash: agreement,
                    slot_content_hash: slot0,
                    membership_proof: membership,
                },
                inclusion_proof: vec![],
            },
        ],
        usage_period: 0,
        provenance_leaf: provenance_key,
    }
}

#[tokio::test]
async fn guest_credits_an_agreement_and_an_assembly_as_the_host_does() {
    let input = provenance_batch(true);
    let (host_pv, _positions, host_events) = apply_batch(&input).expect("host apply_batch");
    let mut kinds: Vec<u8> = host_events.usage_accruals.iter().map(|a| a.kind).collect();
    kinds.sort();
    assert_eq!(kinds, vec![USAGE_KIND_ASSEMBLY, USAGE_KIND_AGREEMENT]);

    let pv_bytes = execute_guest(&input).await;
    assert_eq!(
        pv_bytes.as_slice(),
        host_pv.abi_encode().as_slice(),
        "the guest commits the host's public values, accrual hash included"
    );
}

#[tokio::test]
async fn guest_refuses_an_assembly_claim_whose_membership_proof_is_under_another_root() {
    let input = provenance_batch(false);
    assert!(apply_batch(&input).is_err(), "the host refuses it");
    let pv_bytes = execute_guest(&input).await;
    assert!(
        pv_bytes.as_slice().is_empty(),
        "a failed membership proof aborts the guest before any commitment"
    );
}
