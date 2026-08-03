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
use figaro_kernel::kernel::{apply_batch_with_state, derive_commitment_ids, resolution_payouts};
use figaro_kernel::state::KernelState;
use figaro_kernel::types::*;
use figaro_prove_test::{
    build_canonical_batch_input, load_spec_json, make_signing_key, sign_digest, BUYER_KEY,
    CHAIN_ID, CORE, SELLER1_KEY,
};
use figaro_sequencer::api::{self, ApiConfig, AppState};
use figaro_sequencer::archive::{self, Archive, ArchiveConfig, BatchRecord};
use figaro_sequencer::assembler::{self, AssemblerConfig, UsageContext};
use figaro_sequencer::mempool::{Mempool, PendingOp, SubmitError};
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
    let err = mempool()
        .submit(ops[0].clone())
        .await
        .unwrap_err()
        .to_string();
    assert!(err.contains("buyer"), "{err}");
}

#[tokio::test]
async fn mempool_rejects_bad_seller_sig() {
    let mut ops = canonical_ops();
    if let KernelOp::Commit { seller_sig, .. } = &mut ops[0] {
        seller_sig.s = B256::repeat_byte(0x77);
    }
    let err = mempool()
        .submit(ops[0].clone())
        .await
        .unwrap_err()
        .to_string();
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
    assert_eq!(b.id, a.id + 1);
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
    assert!(
        mempool().submit(ops[1].clone()).await.is_ok(),
        "seller attest"
    );
    assert!(
        mempool().submit(ops[2].clone()).await.is_ok(),
        "buyer attest"
    );
}

#[tokio::test]
async fn mempool_rejects_substituted_witness_spec() {
    // Gate S at the door: the spec is not under the signature, so this
    // mutation leaves the signature valid — the identity gate must catch it.
    let mut ops = canonical_ops();
    if let KernelOp::AttestAsSeller { proof, .. } = &mut ops[1] {
        proof.spec_json = load_spec_json("figaro-handoff");
    }
    let err = mempool()
        .submit(ops[1].clone())
        .await
        .unwrap_err()
        .to_string();
    assert!(err.contains("SpecIdentityMismatch"), "{err}");
}

#[tokio::test]
async fn mempool_rejects_content_hash_mismatch() {
    // Re-sign over a content_ref the content does not hash to — the
    // signature gate passes, Gate C must reject.
    let ops = canonical_ops();
    let (role, target, clause_id, stage, proof) = match &ops[1] {
        KernelOp::AttestAsSeller {
            role,
            target,
            clause_id,
            stage,
            proof,
            ..
        } => (
            role.clone(),
            target.clone(),
            *clause_id,
            *stage,
            proof.clone(),
        ),
        other => panic!("expected AttestAsSeller, got {other:?}"),
    };
    let bogus_ref = keccak256("not the content");
    let domain = domain_separator(CHAIN_ID, CORE);
    let (target_order_hash, _) = figaro_kernel::kernel::derive_commitment_ids(&domain, &target);
    let struct_hash = attest_seller_struct_hash(&target_order_hash, &clause_id, stage, &bogus_ref);
    let sig = sign_digest(
        &make_signing_key(SELLER1_KEY),
        &typed_data_hash(&domain, &struct_hash),
    );

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
        .unwrap_err()
        .to_string();
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
    let err = mempool()
        .submit(ops[1].clone())
        .await
        .unwrap_err()
        .to_string();
    assert!(err.contains("InvalidInclusionProof"), "{err}");
}

#[tokio::test]
async fn mempool_rejects_attest_signed_by_stranger() {
    // The buyer signs a seller attestation — recovery succeeds but the
    // recovered address is not role.seller.
    let ops = canonical_ops();
    let (role, target, clause_id, stage, content_ref, proof) = match &ops[1] {
        KernelOp::AttestAsSeller {
            role,
            target,
            clause_id,
            stage,
            content_ref,
            proof,
            ..
        } => (
            role.clone(),
            target.clone(),
            *clause_id,
            *stage,
            *content_ref,
            proof.clone(),
        ),
        other => panic!("expected AttestAsSeller, got {other:?}"),
    };
    let domain = domain_separator(CHAIN_ID, CORE);
    let (target_order_hash, _) = figaro_kernel::kernel::derive_commitment_ids(&domain, &target);
    let struct_hash =
        attest_seller_struct_hash(&target_order_hash, &clause_id, stage, &content_ref);
    let stranger_sig = sign_digest(
        &make_signing_key(BUYER_KEY),
        &typed_data_hash(&domain, &struct_hash),
    );

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
        .unwrap_err()
        .to_string();
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
    let batch = assembler::assemble_batch(
        CHAIN_ID,
        CORE,
        1234,
        ops.clone(),
        empty_snapshot(),
        UsageContext::default(),
    );
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
        .map(|(i, op)| PendingOp {
            id: i as u64 + 1,
            key: B256::with_last_byte(i as u8 + 1),
            op,
        })
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
    assert!(
        poison
            .iter()
            .all(|(_, reason)| reason.contains("OrderResolved")),
        "{poison:?}"
    );
}

#[test]
fn claim_filter_quarantines_a_poison_claim_without_dropping_the_valid_one() {
    // The batch resolves the order (canonical ops) and carries a valid claim
    // for it. A crafted poison claim — same artifact + seller (so it clears the
    // registry pre-filter) but a garbage inclusion proof — would abort the WHOLE
    // guest proof and dead-letter the batch, discarding the valid claim and every
    // co-batched trade. The claim filter must isolate it: keep the valid claim,
    // drop only the poison.
    let input = build_canonical_batch_input();
    let valid = input.usage_claims[0].clone();
    let mut poison = valid.clone();
    poison.inclusion_proof = vec![B256::repeat_byte(0xab)]; // fails the merkle check

    let (kept, dropped) = assembler::filter_applicable_claims(
        CHAIN_ID,
        CORE,
        1000,
        &empty_snapshot(),
        &input.operations,
        input.usage_period,
        input.provenance_clause,
        vec![valid, poison],
    );
    assert_eq!(kept.len(), 1, "the valid claim survives: {dropped:?}");
    assert_eq!(dropped.len(), 1, "the poison claim is quarantined");
    assert!(
        dropped[0].1.contains("UsageInvalidInclusionProof"),
        "poison reason: {}",
        dropped[0].1
    );
}

#[test]
fn claim_filter_drops_an_intra_batch_duplicate() {
    // The guest counts a process ONCE ever (the counted set rides the state
    // root). Two valid claims for the same resolved process in one batch would
    // hit `UsageAlreadyCounted` on the second and abort the proof. The threaded
    // trial-apply reproduces the guest's counted set across claims and drops the
    // duplicate individually.
    let input = build_canonical_batch_input();
    let claim = input.usage_claims[0].clone();
    let (kept, dropped) = assembler::filter_applicable_claims(
        CHAIN_ID,
        CORE,
        1000,
        &empty_snapshot(),
        &input.operations,
        input.usage_period,
        input.provenance_clause,
        vec![claim.clone(), claim],
    );
    assert_eq!(kept.len(), 1, "the process is counted once: {dropped:?}");
    assert_eq!(dropped.len(), 1);
    assert!(
        dropped[0].1.contains("UsageAlreadyCounted"),
        "duplicate reason: {}",
        dropped[0].1
    );
}

// ── HTTP API ──────────────────────────────────────────────────────

fn test_app_state() -> AppState {
    AppState {
        mempool: mempool(),
        state_mirror: StateMirror::genesis(),
        archive: Archive::in_memory(archive::DEFAULT_MAX_BATCHES),
        batch_count: std::sync::Arc::new(tokio::sync::RwLock::new(0)),
    }
}

#[tokio::test]
async fn api_status_returns_json() {
    let app = api::router(test_app_state(), ApiConfig::default());
    let req = Request::builder()
        .uri("/status")
        .body(Body::empty())
        .unwrap();
    let response = app.oneshot(req).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let body = axum::body::to_bytes(response.into_body(), 4096)
        .await
        .unwrap();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert!(json["state_root"].is_string());
    assert_eq!(json["pending_ops"], 0);
    assert_eq!(json["batches_settled"], 0);
}

#[tokio::test]
async fn api_submit_valid_op_and_status_reflects_it() {
    let state = test_app_state();
    let app = api::router(state.clone(), ApiConfig::default());

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

    let req = Request::builder()
        .uri("/status")
        .body(Body::empty())
        .unwrap();
    let response = app.oneshot(req).await.unwrap();
    let body = axum::body::to_bytes(response.into_body(), 4096)
        .await
        .unwrap();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(json["pending_ops"], 1);
}

#[tokio::test]
async fn api_submit_invalid_sig_returns_400() {
    let app = api::router(test_app_state(), ApiConfig::default());
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

    let (valid, poison) = assembler::filter_applicable_ops(CHAIN_ID, CORE, 1000, &prev, pending);
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
    let err = mempool()
        .submit_usage_claim(claim)
        .await
        .unwrap_err()
        .to_string();
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
    assert!(
        events_before.usage_accruals.is_empty(),
        "nothing credited yet"
    );

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

    assert!(positions.is_empty(), "no value moves — nothing was traded");
    assert_eq!(events.usage_accruals.len(), 1, "the artifact is credited");
    assert_ne!(
        pv.prev_state_root, pv.new_state_root,
        "and the root advances, because usage state is under it"
    );
}

// ── Public-endpoint bounds: idempotency, caps, body limit ─────────

#[tokio::test]
async fn mempool_duplicate_commit_is_idempotent() {
    // Same commitment re-submitted → the ORIGINAL acknowledgment, and the
    // queue holds one copy.
    let mp = mempool();
    let ops = canonical_ops();
    let first = mp.submit(ops[0].clone()).await.unwrap();
    assert!(!first.duplicate);
    let second = mp.submit(ops[0].clone()).await.unwrap();
    assert_eq!(second.id, first.id, "same acknowledgment");
    assert!(second.duplicate);
    assert_eq!(mp.len().await, 1, "no duplicate enqueued");
}

#[tokio::test]
async fn mempool_duplicate_usage_claim_is_idempotent() {
    let input = build_canonical_batch_input();
    let mp = mempool();
    let claim = input.usage_claims[0].clone();
    assert_eq!(mp.submit_usage_claim(claim.clone()).await.unwrap(), 1);
    assert_eq!(
        mp.submit_usage_claim(claim).await.unwrap(),
        1,
        "still one pending"
    );
    assert_eq!(mp.usage_len().await, 1);
}

#[tokio::test]
async fn mempool_at_cap_evicts_the_newcomer() {
    // Deterministic eviction policy: at capacity the ARRIVING op is
    // refused; acknowledged ops are never silently dropped.
    let mp = Mempool::with_caps(CHAIN_ID, CORE, 1, 1);
    let ops = canonical_ops();
    assert!(mp.submit(ops[0].clone()).await.is_ok());
    let err = mp.submit(ops[3].clone()).await.unwrap_err();
    assert_eq!(err, SubmitError::Full);
    assert_eq!(mp.len().await, 1, "the acknowledged op is untouched");

    let input = build_canonical_batch_input();
    let mut other = input.usage_claims[0].clone();
    assert!(mp
        .submit_usage_claim(input.usage_claims[0].clone())
        .await
        .is_ok());
    other.artifact = B256::repeat_byte(0x42);
    let err = mp.submit_usage_claim(other).await.unwrap_err();
    assert_eq!(err, SubmitError::Full);
}

#[tokio::test]
async fn mempool_requeue_is_cap_exempt_and_restores_dedup() {
    // Acknowledged ops re-queued after a transient settlement failure must
    // come back even at cap — and stay deduplicated against resubmission.
    let mp = Mempool::with_caps(CHAIN_ID, CORE, 1, 1);
    let ops = canonical_ops();
    let first = mp.submit(ops[0].clone()).await.unwrap();
    let drained = mp.drain().await;
    mp.requeue(drained).await;
    assert_eq!(mp.len().await, 1);
    let again = mp.submit(ops[0].clone()).await.unwrap();
    assert_eq!(again.id, first.id, "requeue restores the dedup index");
    assert!(again.duplicate);
}

#[tokio::test]
async fn api_submit_full_mempool_returns_503_structured() {
    let state = AppState {
        mempool: Mempool::with_caps(CHAIN_ID, CORE, 1, 1),
        ..test_app_state()
    };
    let app = api::router(state.clone(), ApiConfig::default());
    let ops = canonical_ops();
    state.mempool.submit(ops[0].clone()).await.unwrap();

    let body = serde_json::json!({ "operation": ops[3] });
    let req = Request::builder()
        .method("POST")
        .uri("/submit")
        .header("content-type", "application/json")
        .body(Body::from(serde_json::to_vec(&body).unwrap()))
        .unwrap();
    let response = app.oneshot(req).await.unwrap();
    assert_eq!(response.status(), StatusCode::SERVICE_UNAVAILABLE);
    let body = axum::body::to_bytes(response.into_body(), 4096)
        .await
        .unwrap();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert!(
        json["error"].as_str().unwrap().contains("mempool full"),
        "{json}"
    );
}

#[tokio::test]
async fn api_submit_oversized_body_returns_413_structured() {
    let app = api::router(
        test_app_state(),
        ApiConfig {
            max_body_bytes: 256,
        },
    );
    let body = serde_json::json!({ "operation": &canonical_ops()[0] });
    let bytes = serde_json::to_vec(&body).unwrap();
    assert!(bytes.len() > 256, "fixture must exceed the test limit");
    let req = Request::builder()
        .method("POST")
        .uri("/submit")
        .header("content-type", "application/json")
        .body(Body::from(bytes))
        .unwrap();
    let response = app.oneshot(req).await.unwrap();
    assert_eq!(response.status(), StatusCode::PAYLOAD_TOO_LARGE);
    let body = axum::body::to_bytes(response.into_body(), 4096)
        .await
        .unwrap();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert!(json["error"].is_string(), "structured error body: {json}");
}

#[tokio::test]
async fn api_submit_malformed_json_returns_400_structured() {
    let app = api::router(test_app_state(), ApiConfig::default());
    let req = Request::builder()
        .method("POST")
        .uri("/submit")
        .header("content-type", "application/json")
        .body(Body::from("{ not json"))
        .unwrap();
    let response = app.oneshot(req).await.unwrap();
    assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    let body = axum::body::to_bytes(response.into_body(), 4096)
        .await
        .unwrap();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert!(json["error"].is_string(), "structured error body: {json}");
}

#[tokio::test]
async fn api_submit_duplicate_returns_same_id() {
    let state = test_app_state();
    let app = api::router(state.clone(), ApiConfig::default());
    let op = &canonical_ops()[0];
    let body = serde_json::to_vec(&serde_json::json!({ "operation": op })).unwrap();

    let mut ids = Vec::new();
    for _ in 0..2 {
        let req = Request::builder()
            .method("POST")
            .uri("/submit")
            .header("content-type", "application/json")
            .body(Body::from(body.clone()))
            .unwrap();
        let response = app.clone().oneshot(req).await.unwrap();
        assert_eq!(response.status(), StatusCode::OK);
        let bytes = axum::body::to_bytes(response.into_body(), 4096)
            .await
            .unwrap();
        let json: serde_json::Value = serde_json::from_slice(&bytes).unwrap();
        ids.push(json["id"].as_u64().unwrap());
    }
    assert_eq!(ids[0], ids[1], "same acknowledgment for a re-submission");
    assert_eq!(state.mempool.len().await, 1);
}

#[tokio::test]
async fn api_health_returns_liveness_and_counts() {
    let state = test_app_state();
    let app = api::router(state.clone(), ApiConfig::default());
    state
        .mempool
        .submit(canonical_ops()[0].clone())
        .await
        .unwrap();

    let req = Request::builder()
        .uri("/health")
        .body(Body::empty())
        .unwrap();
    let response = app.oneshot(req).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let body = axum::body::to_bytes(response.into_body(), 4096)
        .await
        .unwrap();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(json["status"], "ok");
    assert_eq!(json["pending_ops"], 1);
    assert_eq!(json["pending_usage_claims"], 0);
    assert_eq!(json["batches_settled"], 0);
}

// ── Integration: HTTP submission → formed batch ───────────────────

/// A commitment POSTed to the public endpoint flows into a formed batch:
/// HTTP admission → mempool → stateful filter → assembled batch → the
/// kernel applies it and the committed order exists in the post-state.
#[tokio::test]
async fn e2e_http_submission_flows_into_formed_batch() {
    let state = test_app_state();
    let app = api::router(state.clone(), ApiConfig::default());

    let op = &canonical_ops()[0];
    let body = serde_json::json!({ "operation": op });
    let req = Request::builder()
        .method("POST")
        .uri("/submit")
        .header("content-type", "application/json")
        .body(Body::from(serde_json::to_vec(&body).unwrap()))
        .unwrap();
    let response = app.oneshot(req).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);

    // The batch loop's exact pipeline: drain → filter → assemble → apply.
    let pending = state.mempool.drain().await;
    assert_eq!(pending.len(), 1);
    let prev = state.state_mirror.snapshot().await;
    let (valid, poison) = assembler::filter_applicable_ops(CHAIN_ID, CORE, 1000, &prev, pending);
    assert!(poison.is_empty(), "{poison:?}");

    let ops: Vec<_> = valid.iter().map(|p| p.op.clone()).collect();
    let batch = assembler::assemble_batch(CHAIN_ID, CORE, 1000, ops, prev, UsageContext::default());
    assert_eq!(
        batch.operations.len(),
        1,
        "the submitted commit rides the batch"
    );

    let (pv, _, _, post) = apply_batch_with_state(&batch).unwrap();
    assert_ne!(pv.prev_state_root, pv.new_state_root);
    let snap = post.to_snapshot();
    assert_eq!(
        snap.order_status.len(),
        1,
        "the committed order exists in post-state"
    );

    state.state_mirror.advance(post).await;
    assert_eq!(state.state_mirror.state_root().await, pv.new_state_root);
}

// ── Publication archive: retention ────────────────────────────────
//
// The kernel PUBLISHES what it settles; the batch verifier does not (its
// public values carry no order hashes, its storage is a root and a count).
// These tests hold the relay to the kernel's publication role: what a
// batch settled must still be readable after the mempool that carried it
// has been cleared, must be bounded, and must survive a restart.

fn domain() -> B256 {
    domain_separator(CHAIN_ID, CORE)
}

/// The canonical fixture's committed order and its process.
fn canonical_ids() -> (B256, B256) {
    let ops = canonical_ops();
    let KernelOp::Commit { commitment, .. } = &ops[0] else {
        panic!("ops[0] is the commit");
    };
    derive_commitment_ids(&domain(), commitment)
}

/// Settle a batch the way the batch loop does — assemble, apply — and
/// build the publication record for what it settled.
fn settle_and_publish(number: u64, ops: Vec<KernelOp>, tx: Option<B256>) -> BatchRecord {
    let batch = assembler::assemble_batch(
        CHAIN_ID,
        CORE,
        1000,
        ops,
        empty_snapshot(),
        UsageContext::default(),
    );
    let (pv, _, _, _) = apply_batch_with_state(&batch).expect("the canonical batch applies");
    let (commits, resolutions) =
        archive::publication_from_ops(batch.chain_id, batch.verifying_contract, &batch.operations);
    BatchRecord {
        batch: number,
        chain_id: batch.chain_id,
        verifying_contract: batch.verifying_contract,
        prev_state_root: pv.prev_state_root,
        new_state_root: pv.new_state_root,
        settlement_tx: tx,
        block_timestamp: batch.block_timestamp,
        commits,
        resolutions,
    }
}

/// A settled batch that carried no trade — used to push the window along.
fn filler_record(number: u64) -> BatchRecord {
    BatchRecord {
        batch: number,
        chain_id: CHAIN_ID,
        verifying_contract: CORE,
        prev_state_root: B256::ZERO,
        new_state_root: B256::repeat_byte(number as u8),
        settlement_tx: None,
        block_timestamp: 1000 + number,
        commits: vec![],
        resolutions: vec![],
    }
}

fn temp_journal(tag: &str) -> std::path::PathBuf {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    std::env::temp_dir().join(format!("figaro-archive-{tag}-{nanos}.jsonl"))
}

#[tokio::test]
async fn archive_retains_what_batch_assembly_clears() {
    // `Mempool::drain` clears the queue AND its dedup index at assembly —
    // nothing about a settled order survives there. The archive is what
    // makes the batch universe readable afterwards.
    let mp = mempool();
    for op in canonical_ops() {
        mp.submit(op).await.unwrap();
    }
    let pending = mp.drain().await;
    assert_eq!(
        mp.len().await,
        0,
        "the mempool keeps nothing after assembly"
    );

    let ops: Vec<_> = pending.iter().map(|p| p.op.clone()).collect();
    let archive = Archive::in_memory(archive::DEFAULT_MAX_BATCHES);
    archive
        .record(settle_and_publish(1, ops, Some(B256::repeat_byte(0xab))))
        .await;

    let (order_hash, process_id) = canonical_ids();
    let view = archive
        .order(order_hash)
        .await
        .expect("the order is published");
    assert!(view.commit.is_some(), "the commitment struct + signatures");
    assert!(view.resolution.is_some(), "and the resolution facts");
    assert_eq!(view.process_id, process_id);
    assert!(archive.process(process_id).await.is_some());
}

#[tokio::test]
async fn archive_is_bounded_and_the_evicted_batch_stops_answering() {
    let archive = Archive::in_memory(1);
    archive
        .record(settle_and_publish(1, canonical_ops(), None))
        .await;
    let (order_hash, process_id) = canonical_ids();
    assert!(
        archive.order(order_hash).await.is_some(),
        "published while retained"
    );

    archive.record(filler_record(2)).await;
    assert_eq!(archive.len().await, 1, "the window is bounded");
    assert!(
        archive.order(order_hash).await.is_none(),
        "an evicted batch leaves no dangling index entry"
    );
    assert!(archive.process(process_id).await.is_none());

    let window = archive.window().await;
    assert_eq!(window.first_batch, Some(2));
    assert_eq!(window.last_batch, Some(2));
    assert_eq!(window.max_batches, 1);
}

#[tokio::test]
async fn archive_misses_an_unknown_hash() {
    let archive = Archive::in_memory(4);
    archive
        .record(settle_and_publish(1, canonical_ops(), None))
        .await;
    assert!(archive.order(B256::repeat_byte(0x11)).await.is_none());
    assert!(archive.process(B256::repeat_byte(0x22)).await.is_none());
}

#[tokio::test]
async fn archive_journal_survives_a_restart() {
    let path = temp_journal("restart");
    let tx = B256::repeat_byte(0x07);
    {
        let archive = Archive::open(ArchiveConfig {
            path: Some(path.clone()),
            max_batches: 8,
        })
        .await;
        archive
            .record(settle_and_publish(1, canonical_ops(), Some(tx)))
            .await;
    }

    let reopened = Archive::open(ArchiveConfig {
        path: Some(path.clone()),
        max_batches: 8,
    })
    .await;
    let (order_hash, _) = canonical_ids();
    let view = reopened
        .order(order_hash)
        .await
        .expect("published across the restart");
    assert_eq!(
        view.commit.expect("commit leg").batch.settlement_tx,
        Some(tx),
        "including which transaction settled it"
    );
    assert_eq!(
        reopened.last_batch().await,
        Some(1),
        "and the relay resumes its batch numbering instead of colliding"
    );
    std::fs::remove_file(&path).ok();
}

#[tokio::test]
async fn archive_journal_rotates_and_stays_bounded_on_disk() {
    let path = temp_journal("rotate");
    let archive = Archive::open(ArchiveConfig {
        path: Some(path.clone()),
        max_batches: 2,
    })
    .await;
    for n in 1..=8 {
        archive.record(filler_record(n)).await;
    }
    assert_eq!(archive.len().await, 2, "memory window bounded");
    let lines = std::fs::read_to_string(&path).unwrap().lines().count();
    assert!(
        lines <= 4,
        "journal rotates instead of growing: {lines} lines"
    );

    let reopened = Archive::open(ArchiveConfig {
        path: Some(path.clone()),
        max_batches: 2,
    })
    .await;
    assert_eq!(reopened.len().await, 2);
    assert_eq!(
        reopened.window().await.last_batch,
        Some(8),
        "the newest survive"
    );
    std::fs::remove_file(&path).ok();
    std::fs::remove_file(path.with_extension("jsonl.tmp")).ok();
}

// ── Publication reads: the kernel's events over HTTP ──────────────

fn published_app_state(archive: Archive) -> AppState {
    AppState {
        archive,
        ..test_app_state()
    }
}

async fn get_json(app: axum::Router, uri: &str) -> (StatusCode, serde_json::Value) {
    let req = Request::builder().uri(uri).body(Body::empty()).unwrap();
    let response = app.oneshot(req).await.unwrap();
    let status = response.status();
    let body = axum::body::to_bytes(response.into_body(), 4 * 1024 * 1024)
        .await
        .unwrap();
    (status, serde_json::from_slice(&body).unwrap())
}

async fn app_with_canonical_batch() -> axum::Router {
    let archive = Archive::in_memory(archive::DEFAULT_MAX_BATCHES);
    archive
        .record(settle_and_publish(
            1,
            canonical_ops(),
            Some(B256::repeat_byte(0xab)),
        ))
        .await;
    api::router(published_app_state(archive), ApiConfig::default())
}

#[tokio::test]
async fn api_order_route_publishes_the_signed_struct_and_both_signatures() {
    let (order_hash, process_id) = canonical_ids();
    let (status, json) = get_json(
        app_with_canonical_batch().await,
        &format!("/orders/{order_hash}"),
    )
    .await;
    assert_eq!(status, StatusCode::OK);

    let ops = canonical_ops();
    let KernelOp::Commit {
        commitment,
        buyer_sig,
        seller_sig,
    } = &ops[0]
    else {
        panic!("ops[0] is the commit");
    };
    assert_eq!(
        json["order_hash"],
        serde_json::to_value(order_hash).unwrap()
    );
    assert_eq!(
        json["process_id"],
        serde_json::to_value(process_id).unwrap()
    );
    // The whole commitment struct — the same information OrderCommitted +
    // OrderSeller + OrderCurrency carry, in the wire format /submit takes.
    assert_eq!(
        json["commit"]["commitment"],
        serde_json::to_value(commitment).unwrap()
    );
    // And the signatures, which the kernel leaves in commit calldata.
    assert_eq!(
        json["commit"]["buyer_signature"],
        serde_json::to_value(buyer_sig).unwrap()
    );
    assert_eq!(
        json["commit"]["seller_signature"],
        serde_json::to_value(seller_sig).unwrap()
    );
    assert_eq!(
        json["commit"]["batch"]["settlement_tx"],
        serde_json::to_value(B256::repeat_byte(0xab)).unwrap(),
        "and where to anchor it on chain"
    );
}

#[tokio::test]
async fn api_order_route_publishes_the_resolution_payouts() {
    let (order_hash, _) = canonical_ids();
    let (status, json) = get_json(
        app_with_canonical_batch().await,
        &format!("/orders/{order_hash}"),
    )
    .await;
    assert_eq!(status, StatusCode::OK);

    let ops = canonical_ops();
    let KernelOp::Commit { commitment, .. } = &ops[0] else {
        panic!("ops[0] is the commit");
    };
    let (seller_payout, buyer_payout) = resolution_payouts(commitment).unwrap();
    assert_eq!(
        json["resolution"]["seller_payout"],
        serde_json::to_value(seller_payout).unwrap(),
        "OrderResolved.sellerPayout — 2×cumulativeValue + payment"
    );
    assert_eq!(
        json["resolution"]["buyer_payout"],
        serde_json::to_value(buyer_payout).unwrap()
    );
    assert_eq!(
        json["resolution"]["seller"],
        serde_json::to_value(commitment.seller).unwrap()
    );
}

#[tokio::test]
async fn published_order_is_verifiable_by_the_reader() {
    // The trust story, asserted: nothing here is taken on the relay's
    // word. The published struct must hash to the published order hash
    // under the VERIFIER's EIP-712 domain, both signatures must recover to
    // the parties named INSIDE that struct, and the payout figures must be
    // the kernel's own function of it.
    let (order_hash, _) = canonical_ids();
    let (_, json) = get_json(
        app_with_canonical_batch().await,
        &format!("/orders/{order_hash}"),
    )
    .await;

    let commitment: Commitment =
        serde_json::from_value(json["commit"]["commitment"].clone()).expect("wire round-trip");
    let buyer_sig: Signature =
        serde_json::from_value(json["commit"]["buyer_signature"].clone()).unwrap();
    let seller_sig: Signature =
        serde_json::from_value(json["commit"]["seller_signature"].clone()).unwrap();

    let (derived_order_hash, derived_process_id) = derive_commitment_ids(&domain(), &commitment);
    assert_eq!(
        serde_json::to_value(derived_order_hash).unwrap(),
        json["order_hash"],
        "the struct hashes to the published order hash"
    );
    assert_eq!(
        serde_json::to_value(derived_process_id).unwrap(),
        json["process_id"]
    );

    let digest = typed_data_hash(&domain(), &commitment_struct_hash(&commitment));
    assert_eq!(
        recover_signer(&digest, &buyer_sig).unwrap(),
        commitment.buyer,
        "the buyer signature recovers to the buyer in the struct"
    );
    assert_eq!(
        recover_signer(&digest, &seller_sig).unwrap(),
        commitment.seller
    );

    let (seller_payout, _) = resolution_payouts(&commitment).unwrap();
    assert_eq!(
        json["resolution"]["seller_payout"],
        serde_json::to_value(seller_payout).unwrap(),
        "the payout is derivable from the signed struct alone"
    );
}

#[tokio::test]
async fn api_process_route_publishes_its_orders_and_resolution_facts() {
    let (order_hash, process_id) = canonical_ids();
    let (status, json) = get_json(
        app_with_canonical_batch().await,
        &format!("/processes/{process_id}"),
    )
    .await;
    assert_eq!(status, StatusCode::OK);

    assert_eq!(
        json["process_id"],
        serde_json::to_value(process_id).unwrap()
    );
    let orders = json["orders"].as_array().expect("orders array");
    assert_eq!(orders.len(), 1);
    assert_eq!(
        orders[0]["order_hash"],
        serde_json::to_value(order_hash).unwrap()
    );
    assert!(
        orders[0]["commit"].is_object(),
        "each order carries its commit leg"
    );

    // ProcessResolved(processId, buyer, orderCount) + the authorizing sig.
    let ops = canonical_ops();
    let KernelOp::Resolve { buyer_sig, .. } = &ops[3] else {
        panic!("ops[3] is the resolve");
    };
    assert_eq!(json["resolution"]["order_count"], 1);
    assert_eq!(
        json["resolution"]["buyer_signature"],
        serde_json::to_value(buyer_sig).unwrap()
    );
    let KernelOp::Commit { commitment, .. } = &ops[0] else {
        panic!("ops[0] is the commit");
    };
    assert_eq!(
        json["resolution"]["buyer"],
        serde_json::to_value(commitment.buyer).unwrap()
    );
}

#[tokio::test]
async fn api_batches_route_pages_with_a_cursor() {
    let archive = Archive::in_memory(100);
    for n in 1..=3 {
        archive.record(filler_record(n)).await;
    }
    let app = api::router(published_app_state(archive), ApiConfig::default());

    let (status, json) = get_json(app.clone(), "/batches?limit=2").await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(json["batches"].as_array().unwrap().len(), 2);
    assert_eq!(json["next_cursor"], 3);
    assert_eq!(json["retained"]["first_batch"], 1);
    assert_eq!(json["retained"]["last_batch"], 3);

    let (_, json) = get_json(app, "/batches?from=3&limit=2").await;
    assert_eq!(json["batches"].as_array().unwrap().len(), 1);
    assert!(json["next_cursor"].is_null(), "the replay has caught up");
}

#[tokio::test]
async fn api_batches_route_clamps_the_page_size() {
    let archive = Archive::in_memory(200);
    for n in 1..=60 {
        archive.record(filler_record(n)).await;
    }
    let app = api::router(published_app_state(archive), ApiConfig::default());
    let (status, json) = get_json(app, "/batches?limit=999").await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(
        json["batches"].as_array().unwrap().len(),
        archive::MAX_PAGE_LIMIT,
        "a public read surface is bounded whatever the caller asks for"
    );
}

#[tokio::test]
async fn api_read_routes_reject_absence_and_garbage_structurally() {
    let app = app_with_canonical_batch().await;

    let (status, json) =
        get_json(app.clone(), &format!("/orders/{}", B256::repeat_byte(0x11))).await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    assert!(
        json["error"].as_str().unwrap().contains("another relay"),
        "absence must never read as 'it did not happen': {json}"
    );

    let (status, json) = get_json(
        app.clone(),
        &format!("/processes/{}", B256::repeat_byte(0x22)),
    )
    .await;
    assert_eq!(status, StatusCode::NOT_FOUND);
    assert!(json["error"].is_string());

    let (status, json) = get_json(app.clone(), "/orders/not-a-hash").await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert!(
        json["error"].as_str().unwrap().contains("32-byte hash"),
        "{json}"
    );

    let (status, json) = get_json(app, "/batches?from=abc").await;
    assert_eq!(status, StatusCode::BAD_REQUEST);
    assert!(json["error"].is_string(), "{json}");
}

#[tokio::test]
async fn api_status_reports_the_publication_window() {
    let archive = Archive::in_memory(64);
    archive.record(filler_record(7)).await;
    let app = api::router(published_app_state(archive), ApiConfig::default());
    let (status, json) = get_json(app, "/status").await;
    assert_eq!(status, StatusCode::OK);
    assert_eq!(json["archive"]["first_batch"], 7);
    assert_eq!(json["archive"]["last_batch"], 7);
    assert_eq!(json["archive"]["retained_batches"], 1);
    assert_eq!(json["archive"]["max_batches"], 64);
}
