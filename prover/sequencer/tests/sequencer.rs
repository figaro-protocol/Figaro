//! Sequencer unit + integration tests: mempool pre-checks (signatures +
//! the kernel's witness gates), state mirror, assembler filtering, HTTP
//! API, and the mempool→assemble→kernel→advance pipeline.
//!
//! Fixtures come from `figaro-prove-test`'s canonical batch — the same
//! witness-based ops the guest program executes — so mempool acceptance
//! is tested against exactly the shapes the proof enforces.

use alloy_primitives::{keccak256, Address, B256};
use axum::body::Body;
use axum::http::{Request, StatusCode};
use tower::util::ServiceExt;

use figaro_kernel::eip712::*;
use figaro_kernel::kernel::apply_batch_with_state;
use figaro_kernel::state::KernelState;
use figaro_kernel::types::*;
use figaro_prove_test::{
    build_canonical_batch_input, load_spec_json, make_signing_key, sign_digest, BUYER_KEY,
    CHAIN_ID, CORE, SELLER1_KEY,
};
use figaro_sequencer::api::{self, AppState};
use figaro_sequencer::assembler::{self, AssemblerConfig, UsageContext};
use figaro_sequencer::mempool::{Mempool, PendingOp};
use figaro_sequencer::state::StateMirror;

fn mempool() -> Mempool {
    Mempool::new(CHAIN_ID, CORE)
}

/// The canonical ops: [Commit, AttestAsSeller, AttestAsBuyer, Resolve].
fn canonical_ops() -> Vec<KernelOp> {
    build_canonical_batch_input().operations
}

fn empty_snapshot() -> KernelStateSnapshot {
    KernelStateSnapshot {
        processes: vec![],
        order_status: vec![],
        order_process_id: vec![],
        usage_counted: vec![],
        usage_seller_seen: vec![],
        usage_accrual: vec![],
    }
}

// ── Mempool: signature pre-checks ─────────────────────────────────

#[tokio::test]
async fn mempool_accepts_valid_commit() {
    let ops = canonical_ops();
    assert!(mempool().submit(ops[0].clone()).await.is_ok());
}

#[tokio::test]
async fn mempool_rejects_bad_buyer_sig() {
    let mut ops = canonical_ops();
    if let KernelOp::Commit { buyer_sig, .. } = &mut ops[0] {
        buyer_sig.r = B256::repeat_byte(0x99);
    }
    let err = mempool().submit(ops[0].clone()).await.unwrap_err();
    assert!(err.contains("buyer"), "{err}");
}

#[tokio::test]
async fn mempool_rejects_bad_seller_sig() {
    let mut ops = canonical_ops();
    if let KernelOp::Commit { seller_sig, .. } = &mut ops[0] {
        seller_sig.s = B256::repeat_byte(0x77);
    }
    let err = mempool().submit(ops[0].clone()).await.unwrap_err();
    assert!(err.contains("seller"), "{err}");
}

#[tokio::test]
async fn mempool_rejects_wrong_chain_id() {
    // A mempool bound to a different chain derives a different domain
    // separator — every signature fails to recover its declared party.
    let wrong_chain = Mempool::new(999, CORE);
    let ops = canonical_ops();
    assert!(wrong_chain.submit(ops[0].clone()).await.is_err());
}

#[tokio::test]
async fn mempool_accepts_resolve() {
    let ops = canonical_ops();
    assert!(mempool().submit(ops[3].clone()).await.is_ok());
}

#[tokio::test]
async fn mempool_drain_returns_all_and_empties() {
    let mp = mempool();
    let ops = canonical_ops();
    mp.submit(ops[0].clone()).await.unwrap();
    mp.submit(ops[3].clone()).await.unwrap();
    let drained = mp.drain().await;
    assert_eq!(drained.len(), 2);
    assert_eq!(mp.len().await, 0);
}

#[tokio::test]
async fn mempool_sequential_ids() {
    let mp = mempool();
    let ops = canonical_ops();
    let a = mp.submit(ops[0].clone()).await.unwrap();
    let b = mp.submit(ops[3].clone()).await.unwrap();
    assert_eq!(b, a + 1);
}

#[tokio::test]
async fn mempool_requeue_preserves_order() {
    let mp = mempool();
    let ops = canonical_ops();
    mp.submit(ops[0].clone()).await.unwrap();
    let drained = mp.drain().await;
    mp.requeue(drained).await;
    assert_eq!(mp.len().await, 1);
}

// ── Mempool: the kernel's witness gates run at the door ───────────

#[tokio::test]
async fn mempool_accepts_attest_with_valid_witness() {
    let ops = canonical_ops();
    assert!(mempool().submit(ops[1].clone()).await.is_ok(), "seller attest");
    assert!(mempool().submit(ops[2].clone()).await.is_ok(), "buyer attest");
}

#[tokio::test]
async fn mempool_rejects_substituted_witness_spec() {
    // Gate S at the door: the spec is not under the signature, so this
    // mutation leaves the signature valid — the identity gate must catch it.
    let mut ops = canonical_ops();
    if let KernelOp::AttestAsSeller { proof, .. } = &mut ops[1] {
        proof.spec_json = load_spec_json("figaro-handoff");
    }
    let err = mempool().submit(ops[1].clone()).await.unwrap_err();
    assert!(err.contains("SpecIdentityMismatch"), "{err}");
}

#[tokio::test]
async fn mempool_rejects_content_hash_mismatch() {
    // Re-sign over a content_ref the content does not hash to — the
    // signature gate passes, Gate C must reject.
    let ops = canonical_ops();
    let (role, target, clause_id, stage, proof) = match &ops[1] {
        KernelOp::AttestAsSeller { role, target, clause_id, stage, proof, .. } => {
            (role.clone(), target.clone(), *clause_id, *stage, proof.clone())
        }
        other => panic!("expected AttestAsSeller, got {other:?}"),
    };
    let bogus_ref = keccak256("not the content");
    let domain = domain_separator(CHAIN_ID, CORE);
    let (target_order_hash, _) =
        figaro_kernel::kernel::derive_commitment_ids(&domain, &target);
    let struct_hash = attest_seller_struct_hash(&target_order_hash, &clause_id, stage, &bogus_ref);
    let sig = sign_digest(&make_signing_key(SELLER1_KEY), &typed_data_hash(&domain, &struct_hash));

    let err = mempool()
        .submit(KernelOp::AttestAsSeller {
            role,
            target,
            clause_id,
            stage,
            content_ref: bogus_ref,
            seller_sig: sig,
            proof,
        })
        .await
        .unwrap_err();
    assert!(err.contains("ContentHashMismatch"), "{err}");
}

#[tokio::test]
async fn mempool_rejects_corrupt_section_data() {
    // section_data is not under the signature either; corrupting it
    // breaks the agreement-inclusion leaf (Gate I).
    let mut ops = canonical_ops();
    if let KernelOp::AttestAsSeller { proof, .. } = &mut ops[1] {
        proof.section_data = r#"{"modality":"pickup"}"#.to_string();
    }
    let err = mempool().submit(ops[1].clone()).await.unwrap_err();
    assert!(err.contains("InvalidInclusionProof"), "{err}");
}

#[tokio::test]
async fn mempool_rejects_attest_signed_by_stranger() {
    // The buyer signs a seller attestation — recovery succeeds but the
    // recovered address is not role.seller.
    let ops = canonical_ops();
    let (role, target, clause_id, stage, content_ref, proof) = match &ops[1] {
        KernelOp::AttestAsSeller { role, target, clause_id, stage, content_ref, proof, .. } => (
            role.clone(), target.clone(), *clause_id, *stage, *content_ref, proof.clone(),
        ),
        other => panic!("expected AttestAsSeller, got {other:?}"),
    };
    let domain = domain_separator(CHAIN_ID, CORE);
    let (target_order_hash, _) =
        figaro_kernel::kernel::derive_commitment_ids(&domain, &target);
    let struct_hash =
        attest_seller_struct_hash(&target_order_hash, &clause_id, stage, &content_ref);
    let stranger_sig =
        sign_digest(&make_signing_key(BUYER_KEY), &typed_data_hash(&domain, &struct_hash));

    let err = mempool()
        .submit(KernelOp::AttestAsSeller {
            role,
            target,
            clause_id,
            stage,
            content_ref,
            seller_sig: stranger_sig,
            proof,
        })
        .await
        .unwrap_err();
    assert!(err.contains("role.seller"), "{err}");
}

// ── State mirror ──────────────────────────────────────────────────

#[tokio::test]
async fn state_mirror_genesis_root_is_deterministic_and_nonzero() {
    let a = StateMirror::genesis().state_root().await;
    let b = StateMirror::genesis().state_root().await;
    assert_eq!(a, b);
    assert_ne!(a, B256::ZERO);
    assert_eq!(a, KernelState::new().compute_root());
}

#[tokio::test]
async fn state_mirror_snapshot_roundtrip() {
    let mirror = StateMirror::genesis();
    let snap = mirror.snapshot().await;
    let rebuilt = StateMirror::from_snapshot(snap);
    assert_eq!(mirror.state_root().await, rebuilt.state_root().await);
}

#[tokio::test]
async fn state_mirror_advance_changes_root() {
    let mirror = StateMirror::genesis();
    let genesis_root = mirror.state_root().await;

    let input = build_canonical_batch_input();
    let (_pv, _pos, _events, post) = apply_batch_with_state(&input).unwrap();
    mirror.advance(post).await;

    assert_ne!(mirror.state_root().await, genesis_root);
}

// ── Assembler ─────────────────────────────────────────────────────

#[test]
fn assembler_batch_preserves_fields() {
    let ops = canonical_ops();
    let batch = assembler::assemble_batch(CHAIN_ID, CORE, 1234, ops.clone(), empty_snapshot(), UsageContext::default());
    assert_eq!(batch.chain_id, CHAIN_ID);
    assert_eq!(batch.verifying_contract, CORE);
    assert_eq!(batch.block_timestamp, 1234);
    assert_eq!(batch.operations.len(), ops.len());
}

#[test]
fn assembler_config_defaults() {
    let c = AssemblerConfig::default();
    assert_eq!(c.max_ops, 100);
    assert_eq!(c.interval_secs, 10);
}

fn pend(ops: Vec<KernelOp>) -> Vec<PendingOp> {
    ops.into_iter()
        .enumerate()
        .map(|(i, op)| PendingOp { id: i as u64 + 1, op })
        .collect()
}

#[test]
fn filter_keeps_all_valid_ops() {
    let ops = canonical_ops();
    let (valid, poison) =
        assembler::filter_applicable_ops(CHAIN_ID, CORE, 1000, &empty_snapshot(), pend(ops));
    assert_eq!(valid.len(), 4);
    assert!(poison.is_empty());
}

#[test]
fn filter_quarantines_a_poison_op() {
    let mut ops = canonical_ops();
    // Without the commit, nothing downstream can ever apply.
    ops.remove(0);
    let (valid, poison) =
        assembler::filter_applicable_ops(CHAIN_ID, CORE, 1000, &empty_snapshot(), pend(ops));
    assert!(valid.is_empty());
    assert_eq!(poison.len(), 3);
}

#[test]
fn filter_reorders_to_satisfy_dependencies() {
    // Submit the attest BEFORE the commit it depends on — the fixpoint
    // filter must find the working order (commit first, then attest).
    let ops = canonical_ops();
    let shuffled = vec![ops[1].clone(), ops[0].clone()];
    let (valid, poison) =
        assembler::filter_applicable_ops(CHAIN_ID, CORE, 1000, &empty_snapshot(), pend(shuffled));
    assert_eq!(valid.len(), 2, "poison: {poison:?}");
    assert!(poison.is_empty());
    assert!(matches!(valid[0].op, KernelOp::Commit { .. }));
    assert!(matches!(valid[1].op, KernelOp::AttestAsSeller { .. }));
}

#[test]
fn filter_resolve_closes_the_evidence_window_for_late_attests() {
    // A same-drain resolve is applied as soon as its commit lands; any
    // attestation still waiting is then poisoned by OrderResolved. This
    // mirrors protocol semantics — buyer dominance closes the evidence
    // window at resolution — so the greedy fixpoint's behavior is the
    // correct one, and the dropped attests are dead-lettered, never
    // silently batched after the fact.
    let mut ops = canonical_ops();
    ops.reverse(); // [Resolve, AttestAsBuyer, AttestAsSeller, Commit]
    let (valid, poison) =
        assembler::filter_applicable_ops(CHAIN_ID, CORE, 1000, &empty_snapshot(), pend(ops));
    assert_eq!(valid.len(), 2, "commit + resolve settle");
    assert_eq!(poison.len(), 2, "both attests are dead-lettered");
    assert!(poison.iter().all(|(_, reason)| reason.contains("OrderResolved")), "{poison:?}");
}

// ── HTTP API ──────────────────────────────────────────────────────

fn test_app_state() -> AppState {
    AppState {
        mempool: mempool(),
        state_mirror: StateMirror::genesis(),
        batch_count: std::sync::Arc::new(tokio::sync::RwLock::new(0)),
    }
}

#[tokio::test]
async fn api_status_returns_json() {
    let app = api::router(test_app_state());
    let req = Request::builder().uri("/status").body(Body::empty()).unwrap();
    let response = app.oneshot(req).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let body = axum::body::to_bytes(response.into_body(), 4096).await.unwrap();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert!(json["state_root"].is_string());
    assert_eq!(json["pending_ops"], 0);
    assert_eq!(json["batches_settled"], 0);
}

#[tokio::test]
async fn api_submit_valid_op_and_status_reflects_it() {
    let state = test_app_state();
    let app = api::router(state.clone());

    let op = &canonical_ops()[0];
    let body = serde_json::json!({ "operation": op });
    let req = Request::builder()
        .method("POST")
        .uri("/submit")
        .header("content-type", "application/json")
        .body(Body::from(serde_json::to_vec(&body).unwrap()))
        .unwrap();
    let response = app.clone().oneshot(req).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);

    let req = Request::builder().uri("/status").body(Body::empty()).unwrap();
    let response = app.oneshot(req).await.unwrap();
    let body = axum::body::to_bytes(response.into_body(), 4096).await.unwrap();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(json["pending_ops"], 1);
}

#[tokio::test]
async fn api_submit_invalid_sig_returns_400() {
    let app = api::router(test_app_state());
    let mut ops = canonical_ops();
    if let KernelOp::Commit { buyer_sig, .. } = &mut ops[0] {
        buyer_sig.r = B256::ZERO;
    }
    let body = serde_json::json!({ "operation": ops[0] });
    let req = Request::builder()
        .method("POST")
        .uri("/submit")
        .header("content-type", "application/json")
        .body(Body::from(serde_json::to_vec(&body).unwrap()))
        .unwrap();
    let response = app.oneshot(req).await.unwrap();
    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
}

// ── End-to-end: mempool → assemble → kernel → advance ─────────────

#[tokio::test]
async fn e2e_mempool_to_kernel() {
    let mp = mempool();
    for op in canonical_ops() {
        mp.submit(op).await.unwrap();
    }
    let pending = mp.drain().await;
    let mirror = StateMirror::genesis();
    let prev = mirror.snapshot().await;

    let (valid, poison) =
        assembler::filter_applicable_ops(CHAIN_ID, CORE, 1000, &prev, pending);
    assert!(poison.is_empty());

    let ops: Vec<_> = valid.iter().map(|p| p.op.clone()).collect();
    let batch = assembler::assemble_batch(CHAIN_ID, CORE, 1000, ops, prev, UsageContext::default());
    let (pv, positions, events, post) = apply_batch_with_state(&batch).unwrap();

    assert_ne!(pv.prev_state_root, pv.new_state_root);
    assert_eq!(events.attestations.len(), 2);
    assert_eq!(events.spec_bindings.len(), 1);
    assert!(!positions.is_empty());

    mirror.advance(post).await;
    assert_eq!(mirror.state_root().await, pv.new_state_root);
}

#[tokio::test]
async fn e2e_two_sequential_batches_chain_roots() {
    // Batch 1: commit + attests. Batch 2: the resolve. The second batch's
    // prev root must equal the first's new root.
    let ops = canonical_ops();
    let mirror = StateMirror::genesis();

    let batch1 = assembler::assemble_batch(
        CHAIN_ID,
        CORE,
        1000,
        ops[..3].to_vec(),
        mirror.snapshot().await,
        UsageContext::default(),
    );
    let (pv1, _, _, post1) = apply_batch_with_state(&batch1).unwrap();
    mirror.advance(post1).await;

    let batch2 = assembler::assemble_batch(
        CHAIN_ID,
        CORE,
        1001,
        ops[3..].to_vec(),
        mirror.snapshot().await,
        UsageContext::default(),
    );
    let (pv2, positions2, _, post2) = apply_batch_with_state(&batch2).unwrap();
    mirror.advance(post2).await;

    assert_eq!(pv2.prev_state_root, pv1.new_state_root, "roots must chain");
    assert_eq!(mirror.state_root().await, pv2.new_state_root);
    // The resolve pays out: seller gets 2*ecv + payment = 300 ether.
    let seller_payout = positions2
        .iter()
        .find(|p| p.payout > alloy_primitives::U256::ZERO && p.user != Address::ZERO)
        .expect("a payout leg");
    assert!(seller_payout.payout > alloy_primitives::U256::ZERO);
}

// ── RPGF usage claims through the sequencer ───────────────────────

#[tokio::test]
async fn mempool_queues_usage_claims_separately_from_ops() {
    let input = build_canonical_batch_input();
    let mp = mempool();

    assert_eq!(mp.usage_len().await, 0);
    let pending = mp
        .submit_usage_claim(input.usage_claims[0].clone())
        .await
        .expect("a well-formed claim is accepted");
    assert_eq!(pending, 1);

    // Its own queue: a claim is not a kernel operation and must not be
    // counted as one.
    assert_eq!(mp.len().await, 0, "claims do not enter the op queue");
    assert_eq!(mp.usage_len().await, 1);

    assert_eq!(mp.drain_usage().await.len(), 1);
    assert_eq!(mp.usage_len().await, 0, "draining empties the queue");
}

#[tokio::test]
async fn mempool_rejects_a_claim_with_no_artifact() {
    let input = build_canonical_batch_input();
    let mut claim = input.usage_claims[0].clone();
    claim.artifact = B256::ZERO;
    let err = mempool().submit_usage_claim(claim).await.unwrap_err();
    assert!(err.contains("artifact"), "{err}");
}

/// A batch carrying ONLY usage claims is a real state transition — the usage
/// state rides the state root, so crediting an already-settled process moves
/// the root without any kernel operation. The sequencer must be able to form
/// such a batch, or a claim submitted after the last trade of a period would
/// sit in the mempool forever waiting for an op that never comes.
#[tokio::test]
async fn a_claims_only_batch_is_a_valid_state_transition() {
    let input = build_canonical_batch_input();

    // Settle the process first, WITHOUT crediting it.
    let ops_only = assembler::assemble_batch(
        CHAIN_ID,
        CORE,
        1000,
        input.operations.clone(),
        empty_snapshot(),
        UsageContext::default(),
    );
    let (_, _, events_before, post) =
        apply_batch_with_state(&ops_only).expect("ops-only batch applies");
    assert!(events_before.usage_accruals.is_empty(), "nothing credited yet");

    // Now a batch with NO operations, carrying only the claim.
    let claims_only = assembler::assemble_batch(
        CHAIN_ID,
        CORE,
        1001,
        vec![],
        post.to_snapshot(),
        UsageContext {
            claims: input.usage_claims.clone(),
            period: input.usage_period,
            provenance_clause: input.provenance_clause,
        },
    );
    let (pv, positions, events, _) =
        apply_batch_with_state(&claims_only).expect("claims-only batch applies");

    assert!(positions.is_empty(), "no money moves — nothing was traded");
    assert_eq!(events.usage_accruals.len(), 1, "the artifact is credited");
    assert_ne!(
        pv.prev_state_root, pv.new_state_root,
        "and the root advances, because usage state is under it"
    );
}
