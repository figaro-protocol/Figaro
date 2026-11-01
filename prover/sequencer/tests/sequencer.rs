//! Sequencer unit + integration tests: mempool pre-checks (signatures +
//! the mirror's witness gates), state mirror, assembler filtering, HTTP
//! API, and the mempool→assemble→mirror→advance pipeline.
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
    build_canonical_batch_input, load_spec_json, make_signing_key, sign_commitment, sign_digest,
    BUYER_KEY, CHAIN_ID, CORE, SELLER1_KEY,
};
use figaro_sequencer::api::{self, record_dropped, ApiConfig, AppState, FailureLog};
use figaro_sequencer::assembler::{self, AssemblerConfig, UsageContext};
use figaro_sequencer::gas::{self, SettleItems};
use figaro_sequencer::submitter::settle_calldata;
use figaro_sequencer::mempool::{Mempool, PendingOp, Refiltered, SubmitError};
use figaro_sequencer::state::{
    fetch_served_state, fetch_served_state_within, held_state_for, take_over_from_served, takeover, Held,
    NextState, StateMirror, StateStore, Takeover, TakeoverRefused,
};

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

// ── Mempool: the mirror's witness gates run at the door ───────────

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
    if let KernelOp::AttestAsSeller { proof: AttestationWitness::Plaintext(proof), .. } = &mut ops[1] {
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
    let (target, clause_id, stage, proof) = match &ops[1] {
        KernelOp::AttestAsSeller {
            target,
            clause_id,
            stage,
            proof,
            ..
        } => (
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
async fn mempool_rejects_corrupt_clause_data() {
    // clause_data is not under the signature either; corrupting it
    // breaks the agreement-inclusion leaf (Gate I).
    let mut ops = canonical_ops();
    if let KernelOp::AttestAsSeller { proof: AttestationWitness::Plaintext(proof), .. } = &mut ops[1] {
        proof.clause_data = r#"{"modality":"pickup"}"#.to_string();
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
    // recovered address is not target.seller.
    let ops = canonical_ops();
    let (target, clause_id, stage, content_ref, proof) = match &ops[1] {
        KernelOp::AttestAsSeller {
            target,
            clause_id,
            stage,
            content_ref,
            proof,
            ..
        } => (
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
    assert!(err.contains("target.seller"), "{err}");
}

#[tokio::test]
async fn mempool_refuses_a_seller_attestation_not_signed_by_the_targets_seller() {
    // A wallet other than the target's seller signs a seller attestation
    // against the canonical order, whose seller is SELLER1. Admission is
    // stateless: it reads no other order, and refuses any signer but
    // `target.seller` at the door.
    let ops = canonical_ops();
    let (target, clause_id, stage, content_ref, proof) = match &ops[1] {
        KernelOp::AttestAsSeller {
            target,
            clause_id,
            stage,
            content_ref,
            proof,
            ..
        } => (target.clone(), *clause_id, *stage, *content_ref, proof.clone()),
        other => panic!("expected AttestAsSeller, got {other:?}"),
    };
    let co_seller_key = make_signing_key(0x5E12);
    let domain = domain_separator(CHAIN_ID, CORE);
    let (target_order_hash, _) = figaro_kernel::kernel::derive_commitment_ids(&domain, &target);
    let struct_hash =
        attest_seller_struct_hash(&target_order_hash, &clause_id, stage, &content_ref);
    let co_seller_sig = sign_digest(&co_seller_key, &typed_data_hash(&domain, &struct_hash));

    let err = mempool()
        .submit(KernelOp::AttestAsSeller {
            target,
            clause_id,
            stage,
            content_ref,
            seller_sig: co_seller_sig,
            proof,
        })
        .await
        .unwrap_err()
        .to_string();
    assert!(err.contains("target.seller"), "{err}");
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
            deferred_since: None,
            behind: Vec::new(),
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
    assert_eq!(valid.len(), 2, "commit + resolve are both valid");
    assert_eq!(poison.len(), 2, "both attests are dead-lettered");
    assert!(
        poison
            .iter()
            .all(|(_, reason)| reason.contains("OrderResolved")),
        "{poison:?}"
    );
}

// ── Assembler: the three crafted streams an auditor would try ─────
//
// A relay is transport; the mirror of FigaroCore inside the filter is the
// authority. Each stream below aims at a bond or a payout and is
// dead-lettered by the mirror's own gate, with the reason named, so the
// batch it would have poisoned still forms from the honest ops.

/// The canonical root commitment, and a second order on the same process
/// (same buyer, same seller, cumulative value carried forward), with the
/// buyer's resolve signature over the process holding both (the second
/// order's expected cumulative value) — the two-order fixture the
/// omitted-payout stream needs.
fn two_order_process() -> (KernelOp, KernelOp, Commitment, Commitment, B256, Signature) {
    let ops = canonical_ops();
    let root_op = ops[0].clone();
    let root = match &root_op {
        KernelOp::Commit { commitment, .. } => commitment.clone(),
        other => panic!("canonical ops[0] is the commit, got {other:?}"),
    };
    let domain = domain_separator(CHAIN_ID, CORE);
    let (_, process_id) = derive_commitment_ids(&domain, &root);

    let buyer_key = make_signing_key(BUYER_KEY);
    let seller_key = make_signing_key(SELLER1_KEY);
    let payment = alloy_primitives::U256::from(7u64);
    let sub = Commitment {
        process_id,
        buyer: root.buyer,
        seller: root.seller,
        currency: root.currency,
        payment,
        expected_cumulative_value: root.payment + payment,
        checkout_hash: root.checkout_hash,
        salt: root.salt + alloy_primitives::U256::from(1u64),
        deadline: root.deadline,
    };
    let sub_op = KernelOp::Commit {
        commitment: sub.clone(),
        buyer_sig: sign_commitment(&sub, &domain, &buyer_key),
        seller_sig: sign_commitment(&sub, &domain, &seller_key),
    };
    let resolve_digest =
        typed_data_hash(&domain, &resolve_struct_hash(&process_id, &sub.expected_cumulative_value));
    let resolve_sig = sign_digest(&buyer_key, &resolve_digest);
    (root_op, sub_op, root, sub, process_id, resolve_sig)
}

#[test]
fn filter_dead_letters_a_second_commit_of_the_same_bond() {
    // The same root commitment twice in one batch, under two pending keys
    // (the mempool's dedup is by key; the assembler must not rely on it).
    // A root's process id IS its digest, so the mirror refuses the second
    // as a process that already exists — one bond, deposited once.
    let ops = canonical_ops();
    let twice = vec![ops[0].clone(), ops[0].clone()];
    let (valid, poison) =
        assembler::filter_applicable_ops(CHAIN_ID, CORE, 1000, &empty_snapshot(), pend(twice));
    assert_eq!(valid.len(), 1, "one commit forms the batch");
    assert_eq!(poison.len(), 1, "the second is dead-lettered");
    assert!(poison[0].1.contains("ProcessAlreadyExists"), "{}", poison[0].1);
}

#[tokio::test]
async fn filter_dead_letters_a_bond_already_committed_in_an_earlier_batch() {
    // Batch 1 lands the commit; the same commit offered again against the
    // advanced state root is refused by the same gate — no second deposit
    // across batches either.
    let ops = canonical_ops();
    let mirror = StateMirror::genesis();
    let batch1 = assembler::assemble_batch(
        CHAIN_ID,
        CORE,
        1000,
        vec![ops[0].clone()],
        mirror.snapshot().await,
        UsageContext::default(),
    );
    let (_, _, _, post1) = apply_batch_with_state(&batch1).unwrap();
    mirror.advance(post1).await;

    let (valid, poison) = assembler::filter_applicable_ops(
        CHAIN_ID,
        CORE,
        1001,
        &mirror.snapshot().await,
        pend(vec![ops[0].clone()]),
    );
    assert!(valid.is_empty(), "nothing to batch");
    assert_eq!(poison.len(), 1);
    assert!(poison[0].1.contains("ProcessAlreadyExists"), "{}", poison[0].1);
}

#[test]
fn filter_dead_letters_a_resolve_that_omits_an_order() {
    // Two orders on the process; a resolve listing only the root would pay
    // one seller and leave the other's bond locked. The mirror counts the
    // list against activeOrderCount — IncompleteOrderList — and the full
    // list resolves.
    let (root_op, sub_op, root, sub, process_id, resolve_sig) = two_order_process();

    let short = KernelOp::Resolve {
        process_id,
        cumulative_value: sub.expected_cumulative_value,
        commitments: vec![root.clone()],
        buyer_sig: resolve_sig.clone(),
    };
    let (valid, poison) = assembler::filter_applicable_ops(
        CHAIN_ID,
        CORE,
        1000,
        &empty_snapshot(),
        pend(vec![root_op.clone(), sub_op.clone(), short]),
    );
    assert_eq!(valid.len(), 2, "both commits form the batch: {poison:?}");
    assert_eq!(poison.len(), 1, "the short resolve is dead-lettered");
    assert!(poison[0].1.contains("IncompleteOrderList"), "{}", poison[0].1);

    let full = KernelOp::Resolve {
        process_id,
        cumulative_value: sub.expected_cumulative_value,
        commitments: vec![root.clone(), sub.clone()],
        buyer_sig: resolve_sig,
    };
    let (valid, poison) = assembler::filter_applicable_ops(
        CHAIN_ID,
        CORE,
        1000,
        &empty_snapshot(),
        pend(vec![root_op, sub_op, full]),
    );
    assert!(poison.is_empty(), "{poison:?}");
    assert_eq!(valid.len(), 3);

    // And the resolved batch pays both orders: 2×cumulative + payment each.
    let ops: Vec<_> = valid.iter().map(|p| p.op.clone()).collect();
    let batch =
        assembler::assemble_batch(CHAIN_ID, CORE, 1000, ops, empty_snapshot(), UsageContext::default());
    let (_, positions, _, _) = apply_batch_with_state(&batch).unwrap();
    let seller = positions.iter().find(|p| p.user == root.seller).expect("seller leg");
    let (root_pay, _) = resolution_payouts(&root).unwrap();
    let (sub_pay, _) = resolution_payouts(&sub).unwrap();
    assert_eq!(seller.payout, root_pay + sub_pay, "every order paid");
}

#[tokio::test]
async fn filter_dead_letters_a_resolve_of_an_already_resolved_process() {
    // A resolve replayed inside the batch that resolved it, and again in a
    // later batch against the advanced root: the process has no active
    // orders, so the mirror refuses — a bond is paid out once.
    let ops = canonical_ops();
    let resolve = ops[3].clone();
    assert!(matches!(resolve, KernelOp::Resolve { .. }));

    let mut replayed = ops.clone();
    replayed.push(resolve.clone());
    let (valid, poison) =
        assembler::filter_applicable_ops(CHAIN_ID, CORE, 1000, &empty_snapshot(), pend(replayed));
    assert_eq!(valid.len(), 4, "the canonical four form the batch: {poison:?}");
    assert_eq!(poison.len(), 1);
    assert!(poison[0].1.contains("NoActiveOrders"), "{}", poison[0].1);

    let mirror = StateMirror::genesis();
    let batch1 = assembler::assemble_batch(
        CHAIN_ID,
        CORE,
        1000,
        ops,
        mirror.snapshot().await,
        UsageContext::default(),
    );
    let (_, _, _, post1) = apply_batch_with_state(&batch1).unwrap();
    mirror.advance(post1).await;

    let (valid, poison) = assembler::filter_applicable_ops(
        CHAIN_ID,
        CORE,
        1001,
        &mirror.snapshot().await,
        pend(vec![resolve]),
    );
    assert!(valid.is_empty());
    assert_eq!(poison.len(), 1);
    assert!(poison[0].1.contains("NoActiveOrders"), "{}", poison[0].1);
}

#[test]
fn claim_filter_quarantines_a_poison_claim_without_dropping_the_valid_one() {
    // The batch resolves the order (canonical ops) and carries a valid claim
    // for it. A crafted poison claim — same clause-or-assembly + seller (so it
    // clears the registry pre-filter) but a garbage inclusion proof — would
    // abort the WHOLE
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
        input.provenance_leaf,
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
    // The guest gives each (kind, key, process) one use per batch, so a second
    // claim of one the batch already carries would add stream bytes and no
    // use. The filter drops it individually.
    let input = build_canonical_batch_input();
    let claim = input.usage_claims[0].clone();
    let (kept, dropped) = assembler::filter_applicable_claims(
        CHAIN_ID,
        CORE,
        1000,
        &empty_snapshot(),
        &input.operations,
        input.provenance_leaf,
        vec![claim.clone(), claim],
    );
    assert_eq!(kept.len(), 1, "the process is carried once: {dropped:?}");
    assert_eq!(dropped.len(), 1);
    assert!(
        dropped[0].1.contains("already carries"),
        "duplicate reason: {}",
        dropped[0].1
    );
}

// ── HTTP API ──────────────────────────────────────────────────────

fn test_app_state() -> AppState {
    AppState {
        mempool: mempool(),
        state_mirror: StateMirror::genesis(),
        batch_count: std::sync::Arc::new(tokio::sync::RwLock::new(0)),
        failures: figaro_sequencer::api::FailureLog::default(),
        funding: None,
    }
}

/// A request stamped with a client address, as the server's connect info
/// would stamp it.
fn from_ip(mut req: Request<Body>, ip: [u8; 4]) -> Request<Body> {
    req.extensions_mut().insert(axum::extract::ConnectInfo(
        std::net::SocketAddr::from((ip, 40000)),
    ));
    req
}

fn submit_request(op: &KernelOp) -> Request<Body> {
    let body = serde_json::json!({ "operation": op });
    Request::builder()
        .method("POST")
        .uri("/submit")
        .header("content-type", "application/json")
        .body(Body::from(serde_json::to_vec(&body).unwrap()))
        .unwrap()
}

#[tokio::test]
async fn api_submit_rate_limits_per_client_address() {
    // Two submissions a minute per address: the third from one address is
    // refused with a structured 429 while another address is still served.
    let app = api::router(
        test_app_state(),
        ApiConfig {
            submits_per_minute_per_ip: 2,
            ..ApiConfig::default()
        },
    );
    let ops = canonical_ops();
    for _ in 0..2 {
        let res = app
            .clone()
            .oneshot(from_ip(submit_request(&ops[0]), [10, 0, 0, 1]))
            .await
            .unwrap();
        assert_eq!(res.status(), StatusCode::OK);
    }
    let res = app
        .clone()
        .oneshot(from_ip(submit_request(&ops[0]), [10, 0, 0, 1]))
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::TOO_MANY_REQUESTS);
    let body = axum::body::to_bytes(res.into_body(), 4096).await.unwrap();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert!(json["error"].as_str().unwrap().contains("rate limit"), "{json}");

    let res = app
        .oneshot(from_ip(submit_request(&ops[3]), [10, 0, 0, 2]))
        .await
        .unwrap();
    assert_eq!(res.status(), StatusCode::OK, "another address is served");
}

#[tokio::test]
async fn api_submissions_drain_in_arrival_order_across_clients() {
    // Batch order is arrival order: two clients interleave and the mempool
    // drains exactly in the order the submissions landed, ids sequential —
    // no client can move ahead of another by anything but arriving first.
    let state = test_app_state();
    let app = api::router(state.clone(), ApiConfig::default());
    let ops = canonical_ops();
    let arrivals = [(&ops[0], [10, 0, 0, 1]), (&ops[3], [10, 0, 0, 2]), (&ops[1], [10, 0, 0, 1]), (&ops[2], [10, 0, 0, 2])];
    let mut ids = Vec::new();
    for (op, ip) in arrivals {
        let res = app.clone().oneshot(from_ip(submit_request(op), ip)).await.unwrap();
        assert_eq!(res.status(), StatusCode::OK);
        let body = axum::body::to_bytes(res.into_body(), 4096).await.unwrap();
        let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
        ids.push(json["id"].as_u64().unwrap());
    }
    assert_eq!(ids, vec![1, 2, 3, 4], "ids are arrival order");
    let drained = state.mempool.drain().await;
    let drained_ids: Vec<u64> = drained.iter().map(|p| p.id).collect();
    assert_eq!(drained_ids, ids, "the batch takes them in arrival order");
    assert!(matches!(drained[1].op, KernelOp::Resolve { .. }), "the second arrival was the other client's resolve");
}

#[tokio::test]
async fn a_requeued_operation_that_drains_and_is_not_requeued_leaves_no_count() {
    // An op re-queued once, drained again, and not re-queued (its batch
    // is on chain, or the relay refused it): the next drain holds no count for it.
    let mp = mempool();
    let ops = canonical_ops();
    mp.submit(ops[0].clone()).await.unwrap();
    let drained = mp.drain().await;
    assert!(mp.requeue(drained).await.is_empty());
    assert_eq!(mp.requeue_counts_held().await, 1);
    assert_eq!(mp.drain().await.len(), 1, "drained again; its batch lands");
    mp.submit(ops[1].clone()).await.unwrap();
    assert_eq!(mp.drain().await.len(), 1, "the next tick drains another op");
    assert_eq!(mp.requeue_counts_held().await, 0, "the landed op's count is gone");
}

#[tokio::test]
async fn mempool_requeue_dead_letters_after_the_cap() {
    // A transiently failed op is re-queued, up to the cap; past it the op is
    // returned for dead-lettering with a reason, and a fresh admission of
    // the same key starts the count over.
    let mp = Mempool::new(CHAIN_ID, CORE).with_max_requeues(2);
    let ops = canonical_ops();
    mp.submit(ops[0].clone()).await.unwrap();

    let drained = mp.drain().await;
    assert!(mp.requeue(drained).await.is_empty(), "first re-queue");
    let drained = mp.drain().await;
    assert!(mp.requeue(drained).await.is_empty(), "second re-queue");
    let drained = mp.drain().await;
    let dropped = mp.requeue(drained).await;
    assert_eq!(dropped.len(), 1, "the third is dead-lettered");
    assert!(dropped[0].1.contains("re-queued 2 times"), "{}", dropped[0].1);
    assert_eq!(mp.len().await, 0, "and not queued");

    mp.submit(ops[0].clone()).await.unwrap();
    let drained = mp.drain().await;
    assert!(mp.requeue(drained).await.is_empty(), "a fresh admission starts the count over");
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

// ── End-to-end: mempool → assemble → mirror → advance ─────────────

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

    // Its own queue: a claim is not a FigaroCore operation and must not be
    // counted as one.
    assert_eq!(mp.len().await, 0, "claims do not enter the op queue");
    assert_eq!(mp.usage_len().await, 1);

    assert_eq!(mp.drain_usage().await.len(), 1);
    assert_eq!(mp.usage_len().await, 0, "draining empties the queue");
}

#[tokio::test]
async fn mempool_rejects_a_claim_with_no_clause_or_assembly() {
    let input = build_canonical_batch_input();
    let mut claim = input.usage_claims[0].clone();
    claim.clause_or_assembly = B256::ZERO;
    let err = mempool()
        .submit_usage_claim(claim)
        .await
        .unwrap_err()
        .to_string();
    assert!(err.contains("clause-or-assembly"), "{err}");
}

/// A batch carrying ONLY usage claims is a valid batch — its uses ride the
/// public values to the counter, though it moves no state. The sequencer must
/// be able to form such a batch, or a claim submitted after the last trade of
/// a period would sit in the mempool forever waiting for an op that never
/// comes.
#[tokio::test]
async fn a_claims_only_batch_is_a_valid_state_transition() {
    let input = build_canonical_batch_input();

    // Resolve the process first, WITHOUT crediting it.
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
    assert!(events_before.uses.is_empty(), "nothing credited yet");

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
            provenance_leaf: input.provenance_leaf,
        },
    );
    let (pv, positions, events, _) =
        apply_batch_with_state(&claims_only).expect("claims-only batch applies");

    assert!(positions.is_empty(), "no value moves — nothing was traded");
    assert_eq!(events.uses.len(), 1, "the clause or assembly is credited");
    assert_eq!(
        pv.prev_state_root, pv.new_state_root,
        "and the root stays: a claim moves no state, its use rides the public values"
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
    other.clause_or_assembly = B256::repeat_byte(0x42);
    let err = mp.submit_usage_claim(other).await.unwrap_err();
    assert_eq!(err, SubmitError::Full);
}

#[tokio::test]
async fn mempool_requeue_is_cap_exempt_and_restores_dedup() {
    // Acknowledged ops re-queued after a transient resolution failure must
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
            ..ApiConfig::default()
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
/// the mirror applies it and the committed order exists in the post-state.
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

// ── The canonical fixture's ids ─────────────────────────────────

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


// ── Mempool: a dedup slot belongs to the op the proof will accept ─────

/// The canonical resolve, taken apart.
fn canonical_resolve() -> (B256, alloy_primitives::U256, Vec<Commitment>, Signature) {
    match &canonical_ops()[3] {
        KernelOp::Resolve {
            process_id,
            cumulative_value,
            commitments,
            buyer_sig,
        } => (*process_id, *cumulative_value, commitments.clone(), buyer_sig.clone()),
        other => panic!("canonical ops[3] is the resolve, got {other:?}"),
    }
}

#[tokio::test]
async fn mempool_resolve_signed_by_a_stranger_does_not_take_the_buyers_slot() {
    // Anyone can sign a resolve for any process id; `Mempool::submit` does not
    // check the root buyer (the door's `refuse_unknown` does). A stranger's
    // resolve must not make the buyer's a duplicate.
    let (process_id, cumulative_value, commitments, buyer_sig) = canonical_resolve();
    let domain = domain_separator(CHAIN_ID, CORE);
    let digest = typed_data_hash(&domain, &resolve_struct_hash(&process_id, &cumulative_value));
    let stranger_sig = sign_digest(&make_signing_key(SELLER1_KEY), &digest);

    let mp = mempool();
    mp.submit(canonical_ops()[0].clone()).await.unwrap();
    let squat = mp
        .submit(KernelOp::Resolve {
            process_id,
            cumulative_value,
            commitments: commitments.clone(),
            buyer_sig: stranger_sig,
        })
        .await
        .unwrap();
    let real = mp
        .submit(KernelOp::Resolve {
            process_id,
            cumulative_value,
            commitments,
            buyer_sig,
        })
        .await
        .unwrap();
    assert!(!real.duplicate, "the buyer's resolve is its own submission");
    assert_ne!(real.id, squat.id);
    assert_eq!(mp.len().await, 3);

    // At batch formation the stranger's is dropped and the buyer's resolves.
    let (valid, poison) = assembler::filter_applicable_ops(
        CHAIN_ID,
        CORE,
        1000,
        &empty_snapshot(),
        mp.drain().await,
    );
    assert_eq!(poison.len(), 1);
    assert_eq!(poison[0].0.id, squat.id);
    assert!(valid.iter().any(|p| p.id == real.id), "the buyer's resolve is in the batch");
}

#[tokio::test]
async fn mempool_resolve_with_another_order_list_does_not_take_the_slot() {
    // The buyer signs the process id and its cumulative value; the order
    // list rides unsigned. The buyer's signature replayed over a list the
    // proof refuses must not make the complete resolve a duplicate.
    let (process_id, cumulative_value, commitments, buyer_sig) = canonical_resolve();
    let mp = mempool();
    let squat = mp
        .submit(KernelOp::Resolve {
            process_id,
            cumulative_value,
            commitments: vec![],
            buyer_sig: buyer_sig.clone(),
        })
        .await
        .unwrap();
    let real = mp
        .submit(KernelOp::Resolve {
            process_id,
            cumulative_value,
            commitments,
            buyer_sig,
        })
        .await
        .unwrap();
    assert!(!real.duplicate);
    assert_ne!(real.id, squat.id);
}

#[tokio::test]
async fn mempool_duplicate_resolve_is_idempotent() {
    let mp = mempool();
    let resolve = canonical_ops()[3].clone();
    let first = mp.submit(resolve.clone()).await.unwrap();
    let second = mp.submit(resolve).await.unwrap();
    assert_eq!(second.id, first.id);
    assert!(second.duplicate);
    assert_eq!(mp.len().await, 1);
}

// ── The state on disk: the verifier's root has a preimage on this host ──

fn temp_state(tag: &str) -> std::path::PathBuf {
    let nanos = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .unwrap()
        .as_nanos();
    std::env::temp_dir().join(format!("figaro-state-{tag}-{nanos}.json"))
}

/// The canonical batch applied to genesis: the state it produces, held the
/// way the batch loop holds it before sending.
fn canonical_next() -> NextState {
    let batch = assembler::assemble_batch(
        CHAIN_ID,
        CORE,
        1000,
        canonical_ops(),
        empty_snapshot(),
        UsageContext::default(),
    );
    let (pv, _, _, post) = apply_batch_with_state(&batch).expect("the canonical batch applies");
    NextState {
        root: pv.new_state_root,
        state: post.to_snapshot(),
        prev_root: pv.prev_state_root,
    }
}

/// A held state with the given roots; its state content is not what the
/// test is about.
fn next_between(prev: B256, root: B256) -> NextState {
    let mut next = canonical_next();
    next.root = root;
    next.prev_root = prev;
    next
}

#[tokio::test]
async fn state_store_kept_state_survives_a_restart() {
    let path = temp_state("kept");
    let next = canonical_next();
    assert_ne!(next.root, StateMirror::genesis().state_root().await);

    let (store, kept) = StateStore::open(Some(path.clone())).await.unwrap();
    assert!(kept.is_none(), "a first run holds no kept state");
    store.hold_next(next.clone()).await.unwrap();
    store.keep(next.root, &next.state).await.unwrap();
    drop(store);

    // A restart: the mirror starts on the kept state, and its root — through
    // the file and back — is the one the batch committed.
    let (store, kept) = StateStore::open(Some(path.clone())).await.unwrap();
    let mirror = StateMirror::from_snapshot(kept.expect("the kept state is on disk"));
    assert_eq!(mirror.state_root().await, next.root);
    assert!(store.next_roots().await.is_empty(), "the journal holds no entry for the landed batch");
    assert!(matches!(
        held_state_for(&mirror, &store, next.root).await,
        Some(Held::Current)
    ));
}

#[tokio::test]
async fn state_store_holds_the_next_state_across_a_crash_before_the_receipt() {
    // Held, sent, and the relay dies before it reads the receipt or keeps
    // anything. The batch landed. A restart finds the verifier's root among
    // the held next states.
    let path = temp_state("crash");
    let next = canonical_next();

    let (store, _) = StateStore::open(Some(path.clone())).await.unwrap();
    store.hold_next(next.clone()).await.unwrap();
    drop(store);

    let (store, kept) = StateStore::open(Some(path.clone())).await.unwrap();
    assert!(kept.is_none());
    let mirror = StateMirror::genesis();
    match held_state_for(&mirror, &store, next.root).await {
        Some(Held::Next(found)) => {
            assert_eq!(found.root, next.root);
            assert_eq!(found.prev_root, mirror.state_root().await);
            let rebuilt = StateMirror::from_snapshot(found.state);
            assert_eq!(rebuilt.state_root().await, next.root);
        }
        other => panic!("the landed batch's state is held, got {other:?}"),
    }
    // The batch did not land: the verifier still holds genesis, and the
    // mirror's own state is the one.
    let genesis_root = mirror.state_root().await;
    assert!(matches!(
        held_state_for(&mirror, &store, genesis_root).await,
        Some(Held::Current)
    ));
}

#[tokio::test]
async fn held_state_for_is_none_when_the_verifiers_root_is_not_held() {
    // Another submitter's batch, or a lost state file: nothing here has the
    // verifier's root, and the relay must build on nothing.
    let next = canonical_next();
    let (store, _) = StateStore::open(Some(temp_state("unheld"))).await.unwrap();
    let mirror = StateMirror::genesis();
    let foreign = B256::repeat_byte(0xee);
    assert!(held_state_for(&mirror, &store, foreign).await.is_none());
    store.hold_next(next).await.unwrap();
    assert!(held_state_for(&mirror, &store, foreign).await.is_none());
}

#[tokio::test]
async fn state_store_holds_a_state_for_as_long_as_its_batch_can_land() {
    // A batch the chain refused can be sent again by anyone while the
    // verifier's root is the batch's previous root: its proof is public.
    // So a held state goes only when the kept root moves off that previous
    // root — never because a transaction failed, and not when a batch that
    // leaves the root where it is (attestations alone) lands.
    let path = temp_state("landable");
    let (p, r1, r2, r3) = (
        B256::repeat_byte(0x0a),
        B256::repeat_byte(0x01),
        B256::repeat_byte(0x02),
        B256::repeat_byte(0x03),
    );
    let (store, _) = StateStore::open(Some(path.clone())).await.unwrap();
    store.hold_next(next_between(p, r1)).await.unwrap();
    store.hold_next(next_between(p, r2)).await.unwrap();
    store.hold_next(next_between(r1, r3)).await.unwrap();
    let state = canonical_next().state;

    // A batch lands that leaves the root at P: everything built on P stays.
    store.keep(p, &state).await.unwrap();
    assert_eq!(store.next_roots().await, vec![r1, r2]);

    // The P→R1 batch lands: the other batch built on P can no longer land;
    // nothing built on R1 is held any more, and R1's own entry is the kept
    // state now.
    store.hold_next(next_between(r1, r3)).await.unwrap();
    store.keep(r1, &state).await.unwrap();
    assert_eq!(store.next_roots().await, vec![r3]);

    // And the journal on disk says the same.
    drop(store);
    let (store, _) = StateStore::open(Some(path)).await.unwrap();
    assert_eq!(store.next_roots().await, vec![r3]);
}

#[tokio::test]
async fn state_store_does_not_replace_a_held_root() {
    // The same ops proved on a later tick produce the same root: the root
    // binds the state, and the entry already on disk stands.
    let (store, _) = StateStore::open(Some(temp_state("held"))).await.unwrap();
    let first = canonical_next();
    let mut second = canonical_next();
    // A different entry under the same root, told apart by its content.
    second.state.order_status.push((B256::repeat_byte(0xEE), 1));
    store.hold_next(first.clone()).await.unwrap();
    store.hold_next(second).await.unwrap();
    assert_eq!(store.next_roots().await, vec![first.root]);
    let held = store.next_for(first.root).await.unwrap();
    assert_eq!(held.state.order_status.len(), first.state.order_status.len());
}

#[tokio::test]
async fn state_store_refuses_a_kept_file_that_does_not_parse() {
    // A damaged state file is an error at start, never a silent genesis.
    let path = temp_state("damaged");
    tokio::fs::write(&path, b"{ not a state").await.unwrap();
    let err = StateStore::open(Some(path)).await.err().expect("a damaged file is refused");
    assert!(err.contains("does not parse"), "{err}");
}

#[tokio::test]
async fn state_store_refuses_a_journal_that_does_not_parse() {
    // The journal is written whole, so a record that does not parse is
    // damage — and the damaged record may be the verifier's next root.
    let path = temp_state("journal");
    let (store, _) = StateStore::open(Some(path.clone())).await.unwrap();
    store.hold_next(canonical_next()).await.unwrap();
    drop(store);
    let mut journal = path.clone().into_os_string();
    journal.push(".next.jsonl");
    let mut contents = tokio::fs::read(&journal).await.unwrap();
    contents.extend_from_slice(b"{\"root\":\"0x12");
    tokio::fs::write(&journal, contents).await.unwrap();

    let err = StateStore::open(Some(path)).await.err().expect("a damaged journal is refused");
    assert!(err.contains("next-state journal"), "{err}");
}

#[tokio::test]
async fn state_store_without_a_path_holds_for_the_process_only() {
    let next = canonical_next();
    let (store, kept) = StateStore::open(None).await.unwrap();
    assert!(kept.is_none());
    store.hold_next(next.clone()).await.unwrap();
    assert!(store.next_for(next.root).await.is_some());
    store.keep(next.root, &next.state).await.unwrap();
    assert!(store.next_roots().await.is_empty());
}

// ── Mempool: an attestation's witness spec is part of its identity ────

#[tokio::test]
async fn mempool_attest_with_other_spec_bytes_does_not_take_the_slot() {
    // The clause key is the hash of the spec's bytes, and admission runs the
    // guest's Gate S: a copy of a plaintext attestation whose spec bytes
    // differ (here: trailing whitespace) is refused at the door and never
    // makes the real one a duplicate. (ops[1] is the canonical batch's
    // plaintext attestation.)
    {
        let index = 1usize;
        let real_op = canonical_ops()[index].clone();
        let mut copy = real_op.clone();
        match &mut copy {
            KernelOp::AttestAsSeller { proof: AttestationWitness::Plaintext(proof), .. }
            | KernelOp::AttestAsBuyer { proof: AttestationWitness::Plaintext(proof), .. } => {
                proof.spec_json.push('\n');
            }
            other => panic!("canonical ops[{index}] is a plaintext attestation, got {other:?}"),
        }
        let mp = mempool();
        let squat = mp.submit(copy).await;
        let err = format!(
            "{:?}",
            squat.expect_err("a spec that does not hash to the key is refused")
        );
        assert!(err.contains("SpecIdentityMismatch"), "ops[{index}]: {err}");
        let real = mp.submit(real_op).await.unwrap();
        assert!(!real.duplicate, "ops[{index}]");
    }
}

// ── A batch is bounded ────────────────────────────────────────────────

#[tokio::test]
async fn mempool_drains_at_most_the_batch_cap_and_keeps_the_rest_queued() {
    let mp = mempool();
    let ops = canonical_ops();
    let mut ids = Vec::new();
    for op in &ops {
        ids.push(mp.submit(op.clone()).await.unwrap().id);
    }
    let first = mp.drain_up_to(3).await;
    assert_eq!(first.iter().map(|p| p.id).collect::<Vec<_>>(), ids[..3]);
    assert_eq!(mp.len().await, 1, "the fourth op waits for the next batch");
    // The one still queued is still deduplicated; the drained ones are not.
    assert!(mp.submit(ops[3].clone()).await.unwrap().duplicate);
    assert!(!mp.submit(ops[0].clone()).await.unwrap().duplicate);
    assert_eq!(mp.drain_up_to(10).await.len(), 2);
}

// ── Funding is one balance per wallet, however many commits draw on it ──

fn commit_from(base: &Commitment, salt: u64, payment: u64) -> PendingOp {
    let c = Commitment {
        salt: alloy_primitives::U256::from(salt),
        payment: alloy_primitives::U256::from(payment),
        expected_cumulative_value: alloy_primitives::U256::from(payment),
        ..base.clone()
    };
    PendingOp {
        id: salt,
        key: B256::with_last_byte(salt as u8),
        op: KernelOp::Commit {
            commitment: c,
            buyer_sig: Signature { r: B256::ZERO, s: B256::ZERO, v: 27 },
            seller_sig: Signature { r: B256::ZERO, s: B256::ZERO, v: 27 },
        },
        deferred_since: None,
        behind: Vec::new(),
    }
}

#[test]
fn funding_is_allocated_across_a_wallets_commits_in_order() {
    use figaro_sequencer::submitter::allocate_funding;
    use std::collections::HashMap;
    let base = match &canonical_ops()[0] {
        KernelOp::Commit { commitment, .. } => commitment.clone(),
        other => panic!("canonical ops[0] is the commit, got {other:?}"),
    };
    // Bonds are 2 × payment on each side. The buyer holds enough for two
    // commits of 10, not three; the seller is rich.
    let rich = (alloy_primitives::U256::from(1_000u64), alloy_primitives::U256::from(1_000u64));
    let mut funds = HashMap::new();
    funds.insert((base.currency, base.buyer), (alloy_primitives::U256::from(40u64), alloy_primitives::U256::from(1_000u64)));
    funds.insert((base.currency, base.seller), rich);
    let ops = vec![commit_from(&base, 1, 10), commit_from(&base, 2, 10), commit_from(&base, 3, 10)];
    // Each commit alone is funded: the old per-commit check passed all three,
    // and the batch reverted when the verifier pulled the sum.
    let (valid, dropped) = allocate_funding(ops, &funds);
    assert_eq!(valid.iter().map(|p| p.id).collect::<Vec<_>>(), vec![1, 2]);
    assert_eq!(dropped.len(), 1);
    assert_eq!(dropped[0].0.id, 3);
    assert!(dropped[0].1.contains("already draws 40"), "{}", dropped[0].1);
    assert_eq!(dropped[0].2, base.buyer, "the drop names the party that fails funding — the revoker a refusal dead-letters");

    // The allowance binds the same way as the balance.
    let mut low_allowance = funds.clone();
    low_allowance.insert((base.currency, base.buyer), (alloy_primitives::U256::from(1_000u64), alloy_primitives::U256::from(25u64)));
    let (valid, _) = allocate_funding(vec![commit_from(&base, 1, 10), commit_from(&base, 2, 10)], &low_allowance);
    assert_eq!(valid.len(), 1);

    // A wallet whose funds could not be read is dropped conservatively.
    let (valid, dropped) = allocate_funding(vec![commit_from(&base, 1, 10)], &HashMap::new());
    assert!(valid.is_empty());
    assert!(dropped[0].1.contains("unverifiable"));

    // Buyer and seller one wallet: both bonds draw on its one balance.
    let mut same = base.clone();
    same.seller = same.buyer;
    let mut one = HashMap::new();
    one.insert((base.currency, base.buyer), (alloy_primitives::U256::from(30u64), alloy_primitives::U256::from(1_000u64)));
    let (valid, dropped) = allocate_funding(vec![commit_from(&same, 1, 10)], &one);
    assert!(valid.is_empty(), "40 of bonds from a wallet holding 30");
    assert_eq!(dropped.len(), 1);
}

// ── An attestation's spec is checked against its key before proving ──

#[test]
fn the_spec_an_attestation_carries_is_what_the_registry_check_reads() {
    use figaro_sequencer::submitter::attestation_spec;
    let ops = canonical_ops();
    {
        let index = 1usize;
        let (clause, spec_hash) = attestation_spec(&ops[index]).expect("a plaintext attestation");
        let (expected_clause, spec_json) = match &ops[index] {
            KernelOp::AttestAsSeller { clause_id, proof: AttestationWitness::Plaintext(proof), .. }
            | KernelOp::AttestAsBuyer { clause_id, proof: AttestationWitness::Plaintext(proof), .. } => {
                (*clause_id, proof.spec_json.clone())
            }
            _ => unreachable!(),
        };
        assert_eq!(clause, expected_clause);
        // keccak256 of the exact bytes, which the clause key must be.
        assert_eq!(spec_hash, keccak256(spec_json.as_bytes()));
        assert_eq!(clause, spec_hash, "the clause key is the spec's hash");
        let mut copy = ops[index].clone();
        if let KernelOp::AttestAsSeller { proof: AttestationWitness::Plaintext(proof), .. }
        | KernelOp::AttestAsBuyer { proof: AttestationWitness::Plaintext(proof), .. } = &mut copy
        {
            proof.spec_json.push(' ');
        }
        assert_ne!(attestation_spec(&copy).unwrap().1, spec_hash, "one byte moves the hash");
    }
    // ops[2] is hash-only: no spec, so nothing for the registry check to
    // read, as the verifier reads no registry for it.
    assert!(matches!(&ops[2], KernelOp::AttestAsBuyer { proof: AttestationWitness::HashOnly { .. }, .. }));
    assert!(attestation_spec(&ops[2]).is_none());
    assert!(attestation_spec(&ops[0]).is_none());
    assert!(attestation_spec(&ops[3]).is_none());
}

// ── The state is published, so another relay can start on it ───────────

#[tokio::test]
async fn api_state_route_serves_the_state_another_relay_starts_on() {
    let mut state = test_app_state();
    let next = canonical_next();
    state.state_mirror = StateMirror::from_snapshot(next.state.clone());
    let app = api::router(state, ApiConfig::default());
    let response = app
        .oneshot(Request::builder().uri("/state").body(Body::empty()).unwrap())
        .await
        .unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    let header = response.headers()["x-figaro-state-root"].to_str().unwrap().to_string();
    assert_eq!(header, format!("{:?}", next.root));
    let body = axum::body::to_bytes(response.into_body(), 1 << 20).await.unwrap();

    // The body is the kept-state file's format: written as STATE_PATH, it is
    // the state a second relay opens and starts on, with the same root.
    let path = temp_state("fetched");
    tokio::fs::write(&path, &body).await.unwrap();
    let (_, kept) = StateStore::open(Some(path)).await.unwrap();
    let mirror = StateMirror::from_snapshot(kept.expect("the fetched state parses as a kept state"));
    assert_eq!(mirror.state_root().await, next.root);
}

// ── A relay started on another relay's `GET /state` ────────────────────
//
// `formal/RelayState.tla`, `Takeover`: a stopped relay adopts a served
// state only when its root is the verifier's (`TakeoverChecksRoot`), and
// never when it already holds the state behind that root — the served
// state of a stale relay would replace what may be the only copy, and an
// adoption over a landed batch of this relay's own would drop its record.

#[test]
fn takeover_adopts_the_served_state_behind_the_verifiers_root() {
    let verifier = B256::repeat_byte(1);
    assert_eq!(takeover(false, Some(verifier), verifier, verifier), Takeover::Adopt);
    // No header: the body's own root decides.
    assert_eq!(takeover(false, None, verifier, verifier), Takeover::Adopt);
}

#[test]
fn takeover_never_writes_over_the_verifiers_state_this_relay_holds() {
    let verifier = B256::repeat_byte(1);
    let stale = B256::repeat_byte(3);
    assert_eq!(takeover(true, Some(stale), stale, verifier), Takeover::KeptStands);
    assert_eq!(takeover(true, Some(verifier), verifier, verifier), Takeover::KeptStands);
    // A lying header changes nothing held.
    assert_eq!(takeover(true, Some(verifier), stale, verifier), Takeover::KeptStands);
}

#[test]
fn takeover_refuses_a_served_state_whose_root_is_not_the_verifiers() {
    let verifier = B256::repeat_byte(1);
    let stale = B256::repeat_byte(3);
    assert_eq!(takeover(false, Some(stale), stale, verifier), Takeover::Refused { served: stale, verifier });
    assert_eq!(takeover(false, None, stale, verifier), Takeover::Refused { served: stale, verifier });
}

#[test]
fn takeover_refuses_a_served_state_whose_header_is_not_its_root() {
    // The header claims the verifier's root; the body computes to another.
    let verifier = B256::repeat_byte(1);
    let computed = B256::repeat_byte(4);
    assert_eq!(
        takeover(false, Some(verifier), computed, verifier),
        Takeover::HeaderDisagrees { header: verifier, computed }
    );
    // A header that disagrees with its body is refused as such, before the
    // root is read against the verifier's.
    let other = B256::repeat_byte(5);
    assert_eq!(
        takeover(false, Some(other), computed, verifier),
        Takeover::HeaderDisagrees { header: other, computed }
    );
}

#[tokio::test]
async fn takeover_leaves_a_landed_batch_this_relay_built_in_its_journal() {
    // R built a batch on genesis, sent it, and crashed before it kept the
    // result; the batch landed, so the verifier's root is the batch's and R
    // holds the state behind it in its journal. Started with STATE_FROM on
    // a relay serving that same state, R writes nothing and runs on what it
    // held: `step_to` then finds the held state and publishes the batch's
    // record, which an adoption would have pruned from the journal.
    let path = temp_state("own-landed");
    let next = canonical_next();
    let (store, kept) = StateStore::open(Some(path.clone())).await.unwrap();
    assert!(kept.is_none());
    store.hold_next(next.clone()).await.unwrap();
    let mirror = StateMirror::genesis();
    let (running, decision) =
        take_over_from_served(&store, &mirror, next.root, next.state.clone(), Some(next.root)).await.unwrap();
    assert_eq!(decision, Takeover::KeptStands);
    assert_eq!(running.state_root().await, mirror.state_root().await, "the relay runs on what it held");
    assert!(!path.exists(), "no kept file was written");
    assert_eq!(store.next_roots().await, vec![next.root], "the journal still holds the batch");
}

#[tokio::test]
async fn adopting_a_served_state_keeps_only_the_journal_entries_built_on_it() {
    // R holds two next states: one built on the served root (a batch of R's
    // that can still land on it) and one built on another root (a batch the
    // verifier can no longer accept). Adopting the served state keeps the
    // first and drops the second.
    let path = temp_state("adopt-journal");
    let served = canonical_next();
    let on_served = next_between(served.root, B256::repeat_byte(7));
    let on_other = next_between(B256::repeat_byte(8), B256::repeat_byte(9));
    let (store, _) = StateStore::open(Some(path.clone())).await.unwrap();
    store.hold_next(on_served.clone()).await.unwrap();
    store.hold_next(on_other.clone()).await.unwrap();
    let (running, decision) =
        take_over_from_served(&store, &StateMirror::genesis(), served.root, served.state.clone(), Some(served.root))
            .await
            .unwrap();
    assert_eq!(decision, Takeover::Adopt);
    assert_eq!(running.state_root().await, served.root, "the relay runs on the adopted state");
    drop(store);

    let (store, kept) = StateStore::open(Some(path)).await.unwrap();
    let mirror = StateMirror::from_snapshot(kept.expect("the adopted state is on disk"));
    assert_eq!(mirror.state_root().await, served.root);
    assert_eq!(store.next_roots().await, vec![on_served.root], "only the batch built on the adopted root can still land");
}

#[tokio::test]
async fn a_relay_takes_over_from_another_relays_state_route_through_its_own_fetch() {
    // Relay S serves the state behind the verifier's root over HTTP.
    let mut served = test_app_state();
    let next = canonical_next();
    served.state_mirror = StateMirror::from_snapshot(next.state.clone());
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base_url = format!("http://{}", listener.local_addr().unwrap());
    let app = api::router(served, ApiConfig::default());
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });

    // Relay R, stopped, holding no state file (its mirror is genesis),
    // fetches S's state itself and recomputes its root: the header is a
    // claim, the body is the state.
    let (snapshot, header) = fetch_served_state(&base_url).await.unwrap();
    assert_eq!(header, Some(next.root));
    assert_eq!(StateMirror::from_snapshot(snapshot.clone()).state_root().await, next.root);

    let path = temp_state("takeover");
    let (store, kept) = StateStore::open(Some(path.clone())).await.unwrap();
    assert!(kept.is_none());
    let (running, decision) =
        take_over_from_served(&store, &StateMirror::genesis(), next.root, snapshot.clone(), header).await.unwrap();
    assert_eq!(decision, Takeover::Adopt);
    assert_eq!(running.state_root().await, next.root);
    drop(store);

    // A restart opens the adopted state, and its root is the verifier's.
    let (store, kept) = StateStore::open(Some(path.clone())).await.unwrap();
    let mirror = StateMirror::from_snapshot(kept.expect("the adopted state is on disk"));
    assert_eq!(mirror.state_root().await, next.root);
    let kept_bytes = tokio::fs::read(&path).await.unwrap();

    // R holds the verifier's root: whatever S serves, R's file stands and is
    // byte-identical after.
    let (running, decision) =
        take_over_from_served(&store, &mirror, next.root, snapshot.clone(), header).await.unwrap();
    assert_eq!(decision, Takeover::KeptStands);
    assert_eq!(running.state_root().await, next.root);
    assert_eq!(tokio::fs::read(&path).await.unwrap(), kept_bytes, "a kept state that stands is not rewritten");

    // The verifier moved on to a root R does not hold. The same served
    // state is refused, and R's kept file is byte-identical after.
    let moved = B256::repeat_byte(9);
    match take_over_from_served(&store, &mirror, moved, snapshot.clone(), header).await {
        Err(TakeoverRefused::Decided(decision)) => {
            assert_eq!(decision, Takeover::Refused { served: next.root, verifier: moved });
        }
        Ok((_, decision)) => panic!("a served state behind another root is refused, got {decision:?}"),
        Err(other) => panic!("a served state behind another root is refused, got {other:?}"),
    }
    assert_eq!(tokio::fs::read(&path).await.unwrap(), kept_bytes, "a refusal writes nothing");

    // A header that names a root other than the body's is refused as such,
    // and writes nothing.
    match take_over_from_served(&store, &mirror, moved, snapshot, Some(moved)).await {
        Err(TakeoverRefused::Decided(Takeover::HeaderDisagrees { header, computed })) => {
            assert_eq!((header, computed), (moved, next.root));
        }
        Ok((_, decision)) => panic!("a header that disagrees with its body is refused, got {decision:?}"),
        Err(other) => panic!("a header that disagrees with its body is refused, got {other:?}"),
    }
    assert_eq!(tokio::fs::read(&path).await.unwrap(), kept_bytes, "a refusal writes nothing");
}

#[tokio::test]
async fn fetching_a_served_state_refuses_every_malformed_peer() {
    use axum::routing::get;
    // One router, four faults: a header that is not a root, a body that is
    // not a state, a status that is not success, and a body over the limit.
    let good = canonical_next();
    let good_body = serde_json::to_string(&good.state).unwrap();
    let app = axum::Router::new()
        .route("/bad-header/state", get(|| async { ([("x-figaro-state-root", "not-a-root")], "{}") }))
        .route("/bad-body/state", get(|| async { ([("x-figaro-state-root", format!("{:?}", B256::ZERO))], "not json") }))
        .route("/failing/state", get(|| async { (StatusCode::INTERNAL_SERVER_ERROR, "down") }))
        .route("/big/state", get(move || async move { ([("x-figaro-state-root", format!("{:?}", good.root))], good_body) }));
    let listener = tokio::net::TcpListener::bind("127.0.0.1:0").await.unwrap();
    let base = format!("http://{}", listener.local_addr().unwrap());
    tokio::spawn(async move { axum::serve(listener, app).await.unwrap() });

    let err = fetch_served_state(&format!("{base}/bad-header")).await.unwrap_err();
    assert!(err.contains("x-figaro-state-root header does not parse"), "{err}");
    let err = fetch_served_state(&format!("{base}/bad-body")).await.unwrap_err();
    assert!(err.contains("the served state does not parse"), "{err}");
    let err = fetch_served_state(&format!("{base}/failing")).await.unwrap_err();
    assert!(err.contains("HTTP 500"), "{err}");
    let err = fetch_served_state_within(&format!("{base}/big"), 16).await.unwrap_err();
    assert!(err.contains("16-byte limit"), "{err}");
    // Under a limit the state fits, the same route serves it.
    let (snapshot, header) = fetch_served_state(&format!("{base}/big")).await.unwrap();
    assert_eq!(header, Some(canonical_next().root));
    assert_eq!(StateMirror::from_snapshot(snapshot).state_root().await, canonical_next().root);
    // A peer that is not there.
    let err = fetch_served_state("http://127.0.0.1:9").await.unwrap_err();
    assert!(err.starts_with("GET http://127.0.0.1:9/state"), "{err}");
}

// ── The batch's cost on chain bounds it ───────────────────────────────
//
// What a batch costs the chain is what it publishes, planned from its own
// execution against the latest block's gas limit under the chain's cap on
// one transaction (`gas.rs`); the operations after the kept prefix go back
// to the mempool untried when the settle would not fit, an operation that
// fits no batch is set aside, and the claims are cut the same way.

fn ops_bytes(ops: &[KernelOp]) -> Vec<u8> {
    serde_json::to_vec(ops).unwrap()
}

#[test]
fn trim_ops_to_budget_keeps_the_longest_fitting_prefix_and_gives_the_rest_back() {
    let input = build_canonical_batch_input();
    assert_eq!(input.operations.len(), 4);
    let claims_were = input.usage_claims.clone();
    // A planned cost of ten per operation: three fit a budget of thirty.
    let planned = gas::trim_ops_to_budget(input.clone(), 1_000, 30, 30, |b| Ok(b.operations.len() as u64 * 10)).unwrap();
    assert_eq!(ops_bytes(&planned.batch.operations), ops_bytes(&input.operations[..3]), "the first three are kept");
    assert_eq!(ops_bytes(&planned.given_back), ops_bytes(&input.operations[3..]), "the last goes back, in order");
    assert!(planned.unfit.is_none());
    assert_eq!(serde_json::to_vec(&planned.batch.usage_claims).unwrap(), serde_json::to_vec(&claims_were).unwrap(), "the claims are left for the caller");
    // Everything fits: one execution, nothing goes back.
    let mut probes = 0;
    let planned = gas::trim_ops_to_budget(input.clone(), 1_000, 40, 40, |b| { probes += 1; Ok(b.operations.len() as u64 * 10) }).unwrap();
    assert_eq!(planned.batch.operations.len(), 4);
    assert!(planned.given_back.is_empty());
    assert_eq!(probes, 2, "the first alone, then the whole");
    // The estimate's failure is the caller's.
    assert!(gas::trim_ops_to_budget(input, 1_000, 30, 30, |_| Err("no".to_string())).is_err());
}

#[test]
fn an_operation_that_fits_no_batch_is_returned_unfit_and_nothing_is_planned_behind_it() {
    let input = build_canonical_batch_input();
    // The first operation alone costs more than the budget. Without this,
    // it would stand at the front of the queue and empty every batch after
    // it; the rest go back for the caller to filter without it, since the
    // order they were filtered into may have built on it.
    let first = ops_bytes(&input.operations[..1]);
    let mut probes = 0;
    let planned = gas::trim_ops_to_budget(input.clone(), 25, 25, 25, |b| {
        probes += 1;
        Ok(1_000 * b.operations.len() as u64)
    })
    .unwrap();
    let (unfit, planned_gas) = planned.unfit.expect("the first is unfit");
    assert_eq!(planned_gas, 1_000, "with the gas it was planned at");
    assert_eq!(ops_bytes(std::slice::from_ref(&unfit)), first);
    assert!(planned.batch.operations.is_empty(), "nothing is planned behind it");
    assert_eq!(ops_bytes(&planned.given_back), ops_bytes(&input.operations[1..]), "the rest, in order");
    assert_eq!(probes, 1, "one probe: the first alone");
    // The same operation under a cap it fits but a tick's budget it does
    // not: it is not unfit, nothing is kept, and everything waits.
    let planned = gas::trim_ops_to_budget(input.clone(), 5_000, 25, 25, |b| Ok(1_000 * b.operations.len() as u64)).unwrap();
    assert!(planned.unfit.is_none());
    assert!(planned.batch.operations.is_empty());
    assert_eq!(planned.given_back.len(), 4);
    // On a tick that owes the claims their turn, the operations' share is
    // half the budget: an operation that fits the whole budget but not the
    // share is kept alone rather than holding the queue.
    let planned = gas::trim_ops_to_budget(input, 5_000, 1_500, 750, |b| Ok(1_000 * b.operations.len() as u64)).unwrap();
    assert!(planned.unfit.is_none());
    assert_eq!(planned.batch.operations.len(), 1, "the first alone, under the whole budget");
    assert_eq!(planned.given_back.len(), 3);
}

#[test]
fn a_commit_that_would_grow_a_process_past_one_settle_is_dropped_at_formation() {
    // The mirror holds a process of two orders; three commits grow it, a
    // resolve closes it, and a commit after the resolve starts it over.
    // The commits are sub-orders, under the root order's derived process.
    let base = build_canonical_batch_input();
    let KernelOp::Commit { commitment: c, .. } = &base.operations[0] else { panic!("the first op is a commit") };
    let process = derive_commitment_ids(&domain(), c).1;
    let mut prev = empty_snapshot();
    prev.processes.push((process, ProcessState { root_buyer: c.buyer, currency: c.currency, cumulative_value: c.payment, active_order_count: 2 }));
    let sub = Commitment { process_id: process, ..c.clone() };
    let commit = |salt: u64| commit_from(&sub, salt, 1);
    let resolve = PendingOp {
        id: 99,
        key: B256::with_last_byte(99),
        op: KernelOp::Resolve { process_id: process, cumulative_value: alloy_primitives::U256::ZERO, commitments: vec![], buyer_sig: Signature { r: B256::ZERO, s: B256::ZERO, v: 27 } },
        deferred_since: None,
        behind: Vec::new(),
    };
    let ops = vec![commit(1), commit(2), commit(3), resolve, commit(4)];
    let (kept, dropped) = assembler::filter_commits_within_resolve_capacity(CHAIN_ID, CORE, &prev, ops, 4);
    // Two held plus the first two commits reach four, the cap; the third
    // would make five and is dropped; the resolve closes the process; the
    // commit after it is the first of a new count.
    assert_eq!(kept.iter().map(|p| p.id).collect::<Vec<_>>(), vec![1, 2, 99, 4]);
    assert_eq!(dropped.len(), 1);
    assert_eq!(dropped[0].0.id, 3);
    assert!(dropped[0].1.contains("would grow the process to 5 orders, past the 4"), "{}", dropped[0].1);
    // A cap of zero keeps no commit at all; the resolve still passes.
    let (kept, dropped) = assembler::filter_commits_within_resolve_capacity(CHAIN_ID, CORE, &prev, vec![commit(1), ], 0);
    assert!(kept.is_empty());
    assert_eq!(dropped.len(), 1);
}

#[test]
fn trim_claims_to_budget_cuts_the_claims_and_leaves_the_operations() {
    let mut input = build_canonical_batch_input();
    let claim = input.usage_claims[0].clone();
    input.usage_claims = vec![claim.clone(), claim.clone(), claim];
    // Ten per claim over a fixed fifty for the operations: one claim fits sixty-five.
    let (batch, given_back) =
        gas::trim_claims_to_budget(input.clone(), 65, |b| Ok(50 + b.usage_claims.len() as u64 * 10)).unwrap();
    assert_eq!(batch.operations.len(), 4, "the operations are not touched");
    assert_eq!(batch.usage_claims.len(), 1);
    assert_eq!(given_back.len(), 2);
    // Nothing fits beyond the operations: every claim goes back.
    let (batch, given_back) =
        gas::trim_claims_to_budget(input, 55, |b| Ok(50 + b.usage_claims.len() as u64 * 10)).unwrap();
    assert!(batch.usage_claims.is_empty());
    assert_eq!(given_back.len(), 3);
}

#[test]
fn the_published_stream_rebuilds_the_root_the_batch_committed() {
    // The property the operation stream exists for: a stranger holding the
    // previous state, the batch transaction's calldata (the stream, the usage period and
    // the provenance leaf) and the public values replays the batch and lands
    // on the root the proof committed.
    use figaro_kernel::kernel::{apply_claims, apply_operations};
    use figaro_kernel::operation_stream::{decode_operation_stream, encode_operation_stream};
    let input = build_canonical_batch_input();
    let (pv, _, _, _) = apply_batch_with_state(&input).unwrap();
    let stream = encode_operation_stream(&input.operations, &input.usage_claims);
    assert_eq!(pv.operations_hash, keccak256(&stream), "word nine is the stream's hash");
    let (operations, claims) = decode_operation_stream(&stream).expect("the published stream decodes");
    assert!(operations.len() < input.operations.len(), "the attestations are not in the stream");
    let mut state = KernelState::from_snapshot(&input.prev_state);
    assert_eq!(state.compute_root(), pv.prev_state_root);
    apply_operations(&mut state, input.chain_id, input.verifying_contract, input.block_timestamp, &operations)
        .expect("the stream's operations apply from the previous state");
    apply_claims(&state, input.chain_id, input.verifying_contract, &claims, &input.provenance_leaf)
        .expect("the stream's claims prove against the post-state");
    assert_eq!(state.compute_root(), pv.new_state_root, "the replay lands on the committed root");
}

#[test]
fn a_two_order_resolve_replays_from_its_stream_to_the_same_root() {
    // The stream's resolve entry carries no word for the signed cumulative
    // value: the decoder derives it as the sum of the listed payments. With
    // two orders that sum is neither order's payment, so only that
    // derivation recovers the buyer and lands on the committed root.
    use figaro_kernel::kernel::apply_operations;
    use figaro_kernel::operation_stream::{decode_operation_stream, encode_operation_stream};
    let (root_op, sub_op, root, sub, process_id, resolve_sig) = two_order_process();
    let input = BatchInput {
        chain_id: CHAIN_ID,
        verifying_contract: CORE,
        block_timestamp: 1000,
        operations: vec![
            root_op,
            sub_op,
            KernelOp::Resolve {
                process_id,
                cumulative_value: sub.expected_cumulative_value,
                commitments: vec![root.clone(), sub.clone()],
                buyer_sig: resolve_sig,
            },
        ],
        prev_state: empty_snapshot(),
        usage_claims: vec![],
        usage_period: 0,
        provenance_leaf: B256::ZERO,
    };
    let (pv, _, _, _) = apply_batch_with_state(&input).expect("the two-order batch resolves");
    let stream = encode_operation_stream(&input.operations, &input.usage_claims);
    assert_eq!(pv.operations_hash, keccak256(&stream), "word nine is the stream's hash");
    let (operations, _) = decode_operation_stream(&stream).expect("the stream decodes");
    match &operations[2] {
        KernelOp::Resolve { cumulative_value, .. } => {
            assert_eq!(*cumulative_value, root.payment + sub.payment, "the sum of the listed payments");
            assert_ne!(*cumulative_value, sub.payment, "not the last order's payment");
        }
        other => panic!("expected the resolve, got {other:?}"),
    }
    let mut state = KernelState::from_snapshot(&input.prev_state);
    apply_operations(&mut state, input.chain_id, input.verifying_contract, input.block_timestamp, &operations)
        .expect("the replayed resolve recovers the buyer and applies");
    assert_eq!(state.compute_root(), pv.new_state_root, "the replay lands on the committed root");
}

#[test]
fn the_canonical_batch_is_planned_from_its_own_execution_and_fits_a_block() {
    let input = build_canonical_batch_input();
    let (pv, positions, events, _) = apply_batch_with_state(&input).unwrap();
    let items = SettleItems::of(&positions, &events);
    assert!(items.positions >= 2, "a commit and a resolve net at least two positions");
    assert_eq!(items.attestations, 2, "the two attestations are re-emitted");
    assert_eq!(items.uses, input.usage_claims.len(), "a claim is a use");
    let operations = figaro_kernel::operation_stream::encode_operation_stream(&input.operations, &input.usage_claims);
    let calldata = settle_calldata(&positions, &events, input.provenance_leaf, &pv.abi_encode(), 356, &operations);
    // The calldata is the settle call: its selector, the proof placeholder
    // and the public values, then the items.
    assert!(calldata.len() > 4 + 356 + pv.abi_encode().len());
    let planned = gas::settle_gas_estimate(&calldata, items);
    assert!(planned > gas::SETTLE_PROOF_VERIFY_GAS + gas::SETTLE_FIXED_EXEC_GAS + gas::calldata_gas(&calldata));
    assert!(planned < gas::settle_gas_budget(30_000_000, gas::DEFAULT_SETTLE_GAS_CAP), "the canonical batch fits one transaction under the cap");
    // The same batch with the proof's bytes absent (the mock verifier) plans
    // for fewer calldata bytes and nothing else.
    let without_proof = settle_calldata(&positions, &events, input.provenance_leaf, &pv.abi_encode(), 0, &operations);
    assert_eq!(
        planned - gas::settle_gas_estimate(&without_proof, items),
        gas::calldata_gas(&calldata) - gas::calldata_gas(&without_proof)
    );
}

#[tokio::test]
async fn mempool_gives_back_operations_at_the_front_untried() {
    let mp = mempool();
    let ops = canonical_ops();
    let mut ids = Vec::new();
    for op in &ops {
        ids.push(mp.submit(op.clone()).await.unwrap().id);
    }
    let drained = mp.drain_up_to(4).await;
    assert_eq!(drained.len(), 4);
    // The batch was cut to two: the last two go back, untried.
    let mut drained = drained;
    let given_back = drained.split_off(2);
    mp.give_back(given_back).await;
    assert_eq!(mp.len().await, 2);
    // Given back, they are deduplicated again and come out in their order
    // ahead of anything submitted since.
    assert!(mp.submit(ops[2].clone()).await.unwrap().duplicate);
    assert!(!mp.submit(ops[0].clone()).await.unwrap().duplicate);
    let next = mp.drain_up_to(10).await;
    assert_eq!(next.iter().map(|p| p.id).collect::<Vec<_>>(), vec![ids[2], ids[3], next[2].id]);
}

#[tokio::test]
async fn mempool_gives_back_no_copy_of_an_operation_resubmitted_meanwhile() {
    let mp = mempool();
    let ops = canonical_ops();
    for op in &ops {
        mp.submit(op.clone()).await.unwrap();
    }
    let drained = mp.drain_up_to(4).await;
    // While the batch was planned, the third operation was submitted again
    // under a new id: the drain had freed its key.
    let resubmitted = mp.submit(ops[2].clone()).await.unwrap();
    assert!(!resubmitted.duplicate);
    let mut drained = drained;
    let given_back = drained.split_off(2);
    let (third_id, fourth_id) = (given_back[0].id, given_back[1].id);
    mp.give_back(given_back).await;
    // One copy of it is queued: the one given back, at the front in the
    // order the fourth was filtered into behind it; the resubmitted copy is
    // gone, and its key is held by the one that stands.
    let next = mp.drain_up_to(10).await;
    assert_eq!(next.iter().map(|p| p.id).collect::<Vec<_>>(), vec![third_id, fourth_id]);
    assert_ne!(resubmitted.id, third_id);
}

// ── An operation dropped at batch formation is a recorded failure ─────
//
// Every drop in the batch loop counts on `/status`'s failure surface with
// its reason; the formation filter's poison list — an operation that would
// abort the batch in any order — is no exception.

#[tokio::test]
async fn an_operation_dropped_at_batch_formation_is_recorded_with_its_reason() {
    let failures = FailureLog::default();
    let ops = canonical_ops();
    let dropped = vec![
        (PendingOp { id: 7, key: B256::with_last_byte(7), op: ops[0].clone(), deferred_since: None, behind: Vec::new() }, "OrderAlreadyExists".to_string()),
        (PendingOp { id: 8, key: B256::with_last_byte(8), op: ops[1].clone(), deferred_since: None, behind: Vec::new() }, "UnknownOrder".to_string()),
    ];
    let recorded = record_dropped(&failures, &dropped, "batch formation").await;
    assert_eq!(recorded, 2);
    let (count, last) = failures.snapshot().await;
    assert_eq!(count, 2, "each dropped operation counts once");
    assert_eq!(last.as_deref(), Some("dropped at batch formation: UnknownOrder"), "the last drop's reason stands");
    // Nothing dropped records nothing.
    assert_eq!(record_dropped(&failures, &[], "batch formation").await, 0);
    assert_eq!(failures.snapshot().await.0, 2);
}

// ── An operation dropped at formation is deferred, bounded in time ────
//
// `formal/RelayState.tla`, `DeferSpec`: an operation that applies against
// no order of its drain, or a commit whose funding could not be read, waits
// apart from the queue; it is drained again only into the room the queue
// leaves empty, its group whole; it is dead-lettered once the window has
// passed since it was first deferred, however often it was retried; its
// time rides on the operation and spends nothing of the re-queue's count.

const WINDOW: std::time::Duration = std::time::Duration::from_secs(60);

fn secs(n: u64) -> std::time::Duration {
    std::time::Duration::from_secs(n)
}

#[tokio::test]
async fn a_deferred_operation_is_drained_only_into_slots_the_queue_leaves_empty() {
    let mp = mempool().with_defer_window(WINDOW);
    let ops = canonical_ops();
    let mut ids = Vec::new();
    for op in &ops {
        ids.push(mp.submit(op.clone()).await.unwrap().id);
    }
    let t0 = std::time::Instant::now();
    let first = mp.drain_up_to(1).await;
    assert!(mp.defer(first, t0).await.is_empty(), "deferred, not expired");
    assert_eq!(mp.len().await, 4, "a deferred operation still waits");
    // A full drain takes the queue alone: the deferred one displaces nothing.
    let second = mp.drain_up_to(2).await;
    assert_eq!(second.iter().map(|p| p.id).collect::<Vec<_>>(), ids[1..3]);
    // The queue leaves room for one: the deferred one rides in it.
    let third = mp.drain_up_to(2).await;
    assert_eq!(third.iter().map(|p| p.id).collect::<Vec<_>>(), vec![ids[3], ids[0]]);
    assert_eq!(mp.len().await, 0);
}

#[tokio::test]
async fn a_deferred_group_is_retried_whole() {
    let mp = mempool().with_defer_window(WINDOW);
    let ops = canonical_ops();
    for op in &ops {
        mp.submit(op.clone()).await.unwrap();
    }
    let t0 = std::time::Instant::now();
    // The commit and what was filtered into its order, deferred together.
    let group = mp.drain_up_to(2).await;
    let group_ids: Vec<u64> = group.iter().map(|p| p.id).collect();
    assert!(mp.defer(group, t0).await.is_empty());
    // Room for one is left after the queue's two operations: the group of two
    // does not split into it.
    let next = mp.drain_up_to(3).await;
    assert_eq!(next.len(), 2, "the queued operations alone: {next:?}");
    // Room for two: the queue is empty, and the group comes back whole.
    let next = mp.drain_up_to(2).await;
    assert_eq!(next.iter().map(|p| p.id).collect::<Vec<_>>(), group_ids);
}

#[tokio::test]
async fn a_deferral_is_bounded_in_time_from_first_deferral_not_in_attempts() {
    let mp = mempool().with_defer_window(WINDOW);
    let ops = canonical_ops();
    mp.submit(ops[3].clone()).await.unwrap();
    let t0 = std::time::Instant::now();
    // Retried at every tick inside the window: never expired, however many
    // attempts it took.
    let mut drained = mp.drain_up_to(10).await;
    for k in 0..30u64 {
        assert!(mp.defer(drained, t0 + secs(k)).await.is_empty(), "attempt {k} is inside the window");
        drained = mp.drain_up_to(10).await;
        assert_eq!(drained.len(), 1);
    }
    // At the window, counted from the FIRST deferral, it is dead-lettered.
    let expired = mp.defer(drained, t0 + WINDOW).await;
    assert_eq!(expired.len(), 1);
    assert!(expired[0].1.contains("60s"), "{}", expired[0].1);
    assert_eq!(mp.len().await, 0, "and not deferred");

    // Never retried (the queue never leaves room), it expires on time all
    // the same.
    mp.submit(ops[2].clone()).await.unwrap();
    let parked = mp.drain_up_to(1).await;
    assert!(mp.defer(parked, t0).await.is_empty());
    assert!(mp.expire_deferred(t0 + WINDOW - secs(1)).await.is_empty());
    let expired = mp.expire_deferred(t0 + WINDOW).await;
    assert_eq!(expired.len(), 1);
    assert_eq!(mp.len().await, 0);
    // Expired, its key is free: a resubmission is a fresh admission with a
    // fresh clock.
    assert!(!mp.submit(ops[2].clone()).await.unwrap().duplicate);
    let fresh = mp.drain_up_to(1).await;
    assert!(mp.defer(fresh, t0 + WINDOW + secs(1)).await.is_empty());
}

#[tokio::test]
async fn a_deferral_spends_nothing_of_the_requeue_count() {
    let mp = mempool().with_defer_window(WINDOW).with_max_requeues(1);
    let ops = canonical_ops();
    mp.submit(ops[0].clone()).await.unwrap();
    let t0 = std::time::Instant::now();
    let mut drained = mp.drain_up_to(1).await;
    for k in 0..3u64 {
        assert!(mp.defer(drained, t0 + secs(k)).await.is_empty());
        drained = mp.drain_up_to(1).await;
    }
    // Deferred three times, it still has its one transient re-queue.
    assert!(mp.requeue(drained).await.is_empty(), "the deferrals spent no re-queue");
    // And the re-queue leaves its deferral clock where it was: first deferred
    // at t0, it expires at t0 + the window.
    let drained = mp.drain_up_to(1).await;
    assert_eq!(mp.defer(drained, t0 + WINDOW).await.len(), 1);
}

#[tokio::test]
async fn deferring_drops_a_copy_resubmitted_meanwhile_and_holds_the_key() {
    let mp = mempool().with_defer_window(WINDOW);
    let ops = canonical_ops();
    let first = mp.submit(ops[3].clone()).await.unwrap();
    let drained = mp.drain_up_to(1).await;
    // While the tick ran, the same operation was submitted again under a
    // new id: the drain had freed its key.
    let copy = mp.submit(ops[3].clone()).await.unwrap();
    assert!(!copy.duplicate);
    assert!(mp.defer(drained, std::time::Instant::now()).await.is_empty());
    assert_eq!(mp.len().await, 1, "one copy waits: the deferred one");
    // Deferred, its key is held: a resubmission is a duplicate of it.
    let again = mp.submit(ops[3].clone()).await.unwrap();
    assert!(again.duplicate);
    assert_eq!(again.id, first.id);
    let next = mp.drain_up_to(10).await;
    assert_eq!(next.iter().map(|p| p.id).collect::<Vec<_>>(), vec![first.id]);
}

#[tokio::test]
async fn requeue_drops_a_copy_resubmitted_meanwhile() {
    let mp = mempool();
    let ops = canonical_ops();
    let first = mp.submit(ops[0].clone()).await.unwrap();
    let drained = mp.drain_up_to(1).await;
    assert!(!mp.submit(ops[0].clone()).await.unwrap().duplicate);
    assert!(mp.requeue(drained).await.is_empty());
    let next = mp.drain_up_to(10).await;
    assert_eq!(next.iter().map(|p| p.id).collect::<Vec<_>>(), vec![first.id]);
}

#[test]
fn what_was_built_on_a_deferred_operation_moves_with_it() {
    let ops = pend(canonical_ops());
    let (commit, rest) = (ops[0].clone(), ops[1..].to_vec());
    // The commit's funding could not be read: it is deferred, and what was
    // filtered into its order no longer applies without it — but applies
    // with it, so it moves with it.
    let (kept, follow, dropped) = assembler::refilter_after_drops(
        CHAIN_ID,
        CORE,
        1000,
        &empty_snapshot(),
        rest.clone(),
        std::slice::from_ref(&commit),
    );
    assert!(kept.is_empty());
    assert_eq!(follow.iter().map(|p| p.id).collect::<Vec<_>>(), vec![2, 3, 4]);
    assert!(dropped.is_empty());
    // The commit is refused for good (a verified shortfall): what is built
    // on it is dead-lettered, with the Core's reason.
    let (kept, follow, dropped) =
        assembler::refilter_after_drops(CHAIN_ID, CORE, 1000, &empty_snapshot(), rest, &[]);
    assert!(kept.is_empty());
    assert!(follow.is_empty());
    assert_eq!(dropped.len(), 3);
}

// ── A dropped usage claim counts on /status, apart from operations ─────

#[tokio::test]
async fn a_dropped_usage_claim_is_counted_apart_from_operations() {
    let failures = FailureLog::default();
    let batch = build_canonical_batch_input();
    let claim = UsageClaim {
        clause_or_assembly: B256::with_last_byte(9),
        ..batch.usage_claims.first().cloned().unwrap_or_else(|| panic!("the canonical batch carries a claim"))
    };
    let dropped = vec![(claim.clone(), "not registered".to_string()), (claim, "unstaked seller".to_string())];
    assert_eq!(api::record_dropped_claims(&failures, &dropped, "batch formation").await, 2);
    failures.record_claims(1, "no usage counter".to_string()).await;
    assert_eq!(failures.snapshot().await.0, 0, "no operation is dead-lettered");
    let (claims, last) = failures.claims_snapshot().await;
    assert_eq!(claims, 3);
    assert_eq!(last.as_deref(), Some("no usage counter"));

    let state = test_app_state();
    state.failures.record_claims(2, "would abort the batch proof".to_string()).await;
    let app = api::router(state, ApiConfig::default());
    let req = Request::builder().uri("/status").body(Body::empty()).unwrap();
    let response = app.oneshot(req).await.unwrap();
    let body = axum::body::to_bytes(response.into_body(), 4096).await.unwrap();
    let json: serde_json::Value = serde_json::from_slice(&body).unwrap();
    assert_eq!(json["dropped_usage_claims"], 2);
    assert_eq!(json["last_dropped_claim_error"], "would abort the batch proof");
    assert_eq!(json["dead_lettered_ops"], 0);
    assert!(json["last_settle_error"].is_null());
}

// ── A permanent Core refusal is dead-lettered at once ───────────────
//
// The deferral is for an operation that may yet apply. Against the landed
// state alone — never the drain's own unlanded operations — a refusal the
// state can only keep (a process or order that exists, is resolved, a
// deadline past, a signature or a witness that fails) is final: dead-lettered
// at once with the Core's reason. One that names a missing dependency
// (an unknown process or order, a list or accumulator a later order may
// complete) is deferred.

#[tokio::test]
async fn a_permanent_kernel_refusal_is_dead_lettered_at_once_and_a_missing_dependency_deferred() {
    let ops = canonical_ops();
    // Landed: the canonical batch committed, attested and resolved.
    let mirror = StateMirror::genesis();
    let batch1 = assembler::assemble_batch(CHAIN_ID, CORE, 1000, ops.clone(), mirror.snapshot().await, UsageContext::default());
    let (_, _, _, post1) = apply_batch_with_state(&batch1).unwrap();
    mirror.advance(post1).await;
    let landed = mirror.snapshot().await;

    let (valid, poison) = assembler::filter_applicable_ops(CHAIN_ID, CORE, 1001, &landed, pend(ops.clone()));
    assert!(valid.is_empty());
    let (deferrable, refused, _) = assembler::split_permanent_refusals(CHAIN_ID, CORE, 1001, &landed, poison);
    assert!(deferrable.is_empty(), "{deferrable:?}");
    let reasons: Vec<&str> = refused.iter().map(|(_, r)| r.as_str()).collect();
    assert_eq!(refused.len(), 4);
    assert!(reasons[0].contains("ProcessAlreadyExists"), "{reasons:?}");
    assert!(reasons[1].contains("OrderResolved") && reasons[2].contains("OrderResolved"), "{reasons:?}");
    assert!(reasons[3].contains("NoActiveOrders"), "{reasons:?}");

    // Nothing landed: what follows the commit names a missing dependency
    // and is deferred.
    let (_, poison) = assembler::filter_applicable_ops(CHAIN_ID, CORE, 1000, &empty_snapshot(), pend(ops[1..].to_vec()));
    let (deferrable, refused, _) = assembler::split_permanent_refusals(CHAIN_ID, CORE, 1000, &empty_snapshot(), poison);
    assert!(refused.is_empty(), "{refused:?}");
    assert_eq!(deferrable.len(), 3);

    // A replay refused only against the drain's own unlanded resolve is
    // judged against the landed state, where it names a missing process:
    // deferred, never refused on what has not landed.
    let mut replayed = ops.clone();
    replayed.push(ops[3].clone());
    let (_, poison) = assembler::filter_applicable_ops(CHAIN_ID, CORE, 1000, &empty_snapshot(), pend(replayed));
    assert!(poison[0].1.contains("NoActiveOrders"), "{poison:?}");
    let (deferrable, refused, _) = assembler::split_permanent_refusals(CHAIN_ID, CORE, 1000, &empty_snapshot(), poison);
    assert!(refused.is_empty(), "{refused:?}");
    assert_eq!(deferrable.len(), 1);

    // A deadline the chain's clock has passed never returns.
    let (_, poison) = assembler::filter_applicable_ops(CHAIN_ID, CORE, 3000, &empty_snapshot(), pend(vec![ops[0].clone()]));
    let (deferrable, refused, _) = assembler::split_permanent_refusals(CHAIN_ID, CORE, 3000, &empty_snapshot(), poison);
    assert!(deferrable.is_empty());
    assert!(refused[0].1.contains("DeadlineExpired"), "{}", refused[0].1);
}

fn signed_commit(c: &Commitment) -> KernelOp {
    let domain = domain_separator(CHAIN_ID, CORE);
    KernelOp::Commit {
        commitment: c.clone(),
        buyer_sig: sign_commitment(c, &domain, &make_signing_key(BUYER_KEY)),
        seller_sig: sign_commitment(c, &domain, &make_signing_key(SELLER1_KEY)),
    }
}

fn landed_after(ops: Vec<KernelOp>) -> KernelStateSnapshot {
    let batch = assembler::assemble_batch(CHAIN_ID, CORE, 1000, ops, empty_snapshot(), UsageContext::default());
    let (_, _, _, post) = apply_batch_with_state(&batch).unwrap();
    post.to_snapshot()
}

fn split_alone(ts: u64, prev: &KernelStateSnapshot, ops: Vec<KernelOp>) -> (Vec<String>, Vec<String>, Vec<String>) {
    let (_, poison) = assembler::filter_applicable_ops(CHAIN_ID, CORE, ts, prev, pend(ops));
    let (deferrable, refused, built_on) = assembler::split_permanent_refusals(CHAIN_ID, CORE, ts, prev, poison);
    let reasons = |v: Vec<(PendingOp, String)>| v.into_iter().map(|(_, r)| r).collect::<Vec<_>>();
    (reasons(deferrable), reasons(refused), reasons(built_on))
}

#[test]
fn a_refusal_is_classified_on_the_fields_it_carries() {
    let (root_op, sub_op, root, sub, process_id, resolve_sig) = two_order_process();
    let both = landed_after(vec![root_op.clone(), sub_op.clone()]);
    // An order list shorter than the active orders only grows shorter.
    let short = KernelOp::Resolve { process_id, cumulative_value: sub.expected_cumulative_value, commitments: vec![root.clone()], buyer_sig: resolve_sig.clone() };
    let (d, r, _) = split_alone(1001, &both, vec![short]);
    assert!(d.is_empty(), "{d:?}");
    assert!(r[0].contains("IncompleteOrderList(required=2, provided=1)"), "{r:?}");
    // A cumulative value the process has already passed never returns.
    let (d, r, _) = split_alone(1001, &both, vec![sub_op.clone()]);
    assert!(d.is_empty(), "{d:?}");
    assert!(r[0].contains("CumulativeValueMismatch"), "{r:?}");

    // A resolve authorization signed over a cumulative value the process has
    // already passed never returns.
    let domain = domain_separator(CHAIN_ID, CORE);
    let root_sig = sign_digest(
        &make_signing_key(BUYER_KEY),
        &typed_data_hash(&domain, &resolve_struct_hash(&process_id, &root.payment)),
    );
    let stale = KernelOp::Resolve { process_id, cumulative_value: root.payment, commitments: vec![root.clone(), sub.clone()], buyer_sig: root_sig.clone() };
    let (d, r, _) = split_alone(1001, &both, vec![stale]);
    assert!(d.is_empty(), "{d:?}");
    assert!(r[0].contains("StaleResolveAuthorization"), "{r:?}");

    let root_only = landed_after(vec![root_op.clone()]);
    // A resolve authorization signed over a cumulative value not yet
    // reached waits for the order that may bring it.
    let ahead = KernelOp::Resolve { process_id, cumulative_value: sub.expected_cumulative_value, commitments: vec![root.clone(), sub.clone()], buyer_sig: resolve_sig.clone() };
    let (d, r, _) = split_alone(1001, &root_only, vec![ahead]);
    assert!(r.is_empty(), "{r:?}");
    assert!(d[0].contains("StaleResolveAuthorization"), "{d:?}");
    // A list longer than the active orders, and a cumulative value not yet
    // reached, wait for the orders that may complete them.
    let long = KernelOp::Resolve { process_id, cumulative_value: root.payment, commitments: vec![root.clone(), sub.clone()], buyer_sig: root_sig.clone() };
    let fifth = alloy_primitives::U256::from(5u64);
    let later = Commitment {
        payment: fifth,
        expected_cumulative_value: sub.expected_cumulative_value + fifth,
        salt: sub.salt + alloy_primitives::U256::from(1u64),
        ..sub.clone()
    };
    let (d, r, _) = split_alone(1001, &root_only, vec![long, signed_commit(&later)]);
    assert!(r.is_empty(), "{r:?}");
    assert!(d[0].contains("IncompleteOrderList(required=1, provided=2)") && d[1].contains("CumulativeValueMismatch"), "{d:?}");

    // A resolve listing an order of another process names an order that can
    // never be under its own: refused. One listing an order of its own
    // process not yet committed waits.
    let elsewhere = Commitment { salt: root.salt + alloy_primitives::U256::from(10u64), ..root.clone() };
    let foreign = KernelOp::Resolve { process_id, cumulative_value: root.payment, commitments: vec![elsewhere], buyer_sig: root_sig.clone() };
    let own = KernelOp::Resolve { process_id, cumulative_value: root.payment, commitments: vec![sub.clone()], buyer_sig: root_sig };
    let (d, r, _) = split_alone(1001, &root_only, vec![foreign, own]);
    assert_eq!(r.len(), 1, "{r:?}");
    assert!(r[0].contains("OrderNotCommitted"), "{r:?}");
    assert_eq!(d.len(), 1, "{d:?}");
    assert!(d[0].contains("OrderNotCommitted"), "{d:?}");

    // A resolve signed over a value beyond a resolved process's frozen one
    // is refused for good, never deferred as a value still to come.
    let full = KernelOp::Resolve { process_id, cumulative_value: sub.expected_cumulative_value, commitments: vec![root.clone(), sub.clone()], buyer_sig: resolve_sig.clone() };
    let resolved = landed_after(vec![root_op.clone(), sub_op.clone(), full]);
    let beyond_value = sub.expected_cumulative_value + fifth;
    let beyond_sig = sign_digest(
        &make_signing_key(BUYER_KEY),
        &typed_data_hash(&domain, &resolve_struct_hash(&process_id, &beyond_value)),
    );
    let beyond = KernelOp::Resolve { process_id, cumulative_value: beyond_value, commitments: vec![root.clone(), sub.clone()], buyer_sig: beyond_sig };
    let (d, r, _) = split_alone(1001, &resolved, vec![beyond]);
    assert!(d.is_empty(), "{d:?}");
    assert!(r[0].contains("NoActiveOrders"), "{r:?}");
}

#[test]
fn what_was_built_on_a_permanently_refused_operation_is_dead_lettered_at_once() {
    let (_, _, root, sub, _, _) = two_order_process();
    let domain = domain_separator(CHAIN_ID, CORE);
    // A root whose deadline the chain has passed, and a sub-order of its
    // process whose own deadline has not.
    let expired_root = Commitment { deadline: alloy_primitives::U256::from(1200u64), ..root.clone() };
    let (_, expired_process) = derive_commitment_ids(&domain, &expired_root);
    let behind = Commitment { process_id: expired_process, deadline: alloy_primitives::U256::from(5000u64), ..sub.clone() };
    // An unrelated operation waiting on an order of its own.
    let waiting = canonical_ops()[1].clone();
    let (d, r, b) = split_alone(1500, &empty_snapshot(), vec![signed_commit(&expired_root), signed_commit(&behind), waiting]);
    assert!(r.len() == 1 && r[0].contains("DeadlineExpired"), "{r:?}");
    assert_eq!(b.len(), 1, "the sub-order goes with the root: {b:?}");
    assert!(b[0].contains("DeadlineExpired"), "{b:?}");
    assert_eq!(d.len(), 1, "the unrelated one still waits: {d:?}");
    assert!(d[0].contains("UnknownOrder"), "{d:?}");
}

// ── A deferred group is drained together; each operation keeps its window ──
//
// Each tick's deferrals are grouped by the process they touch: each
// operation touches one process, so a group is one process's operations.
// An operation that never applies, which anyone may
// submit free, on other processes never makes an honest group larger, and
// an honest group needs no more room than its own process's operations. The
// groups decide what is drained together and nothing else: each operation
// is dead-lettered on its own first deferral's window, a dependent moved
// with the operation it was filtered behind goes with that operation, and
// what is left of a group is grouped again (`formal/RelayState.tla`,
// `DeferSpec`: `HonestWindowKept`, `DependentLeavesWithItsDependency`,
// `DrainGroupIsAClass`).

/// A commit on a process of its own, with a pending key and id of `n`.
fn commit_on_its_own_process(n: u8) -> PendingOp {
    let root = match &canonical_ops()[0] {
        KernelOp::Commit { commitment, .. } => commitment.clone(),
        other => panic!("canonical ops[0] is the commit, got {other:?}"),
    };
    PendingOp { id: 100 + n as u64, key: B256::with_last_byte(100 + n), ..commit_from(&root, 1000 + n as u64, 1) }
}

#[tokio::test]
async fn deferred_operations_are_grouped_by_the_process_they_touch() {
    let mp = mempool().with_defer_window(WINDOW);
    let honest = pend(canonical_ops());
    let honest_ids: Vec<u64> = honest.iter().map(|p| p.id).collect();
    // One tick defers the process's four operations interleaved with two
    // commits on processes of their own.
    let tick = vec![
        honest[0].clone(),
        commit_on_its_own_process(1),
        honest[1].clone(),
        commit_on_its_own_process(2),
        honest[2].clone(),
        honest[3].clone(),
    ];
    assert!(mp.defer(tick, std::time::Instant::now()).await.is_empty());
    assert_eq!(mp.len().await, 6);
    // Room for four: the process's group comes back whole and alone; the
    // commits on their own processes wait in groups of their own.
    let next = mp.drain_up_to(4).await;
    assert_eq!(next.iter().map(|p| p.id).collect::<Vec<_>>(), honest_ids);
    let rest = mp.drain_up_to(1).await;
    assert_eq!(rest.iter().map(|p| p.id).collect::<Vec<_>>(), vec![101], "a group of one fits a room of one");
    assert_eq!(mp.len().await, 1);
}

#[tokio::test]
async fn a_dependent_deferred_with_its_parent_is_dead_lettered_with_it() {
    let ops = pend(canonical_ops());
    let commit = ops[0].clone();
    let t0 = std::time::Instant::now();
    // The commit's funding could not be read: the attestation, filtered into
    // its order, follows it and rides behind it.
    let Refiltered { kept, follow, dropped, .. } =
        mempool().refilter_behind_deferred(1000, &empty_snapshot(), vec![ops[1].clone()], std::slice::from_ref(&commit));
    assert!(kept.is_empty() && dropped.is_empty());
    let attest = follow[0].clone();
    assert_eq!(attest.behind, vec![commit.key]);

    // At deferral: the commit's window ends as it is deferred again with
    // what was filtered behind it; both are dead-lettered, neither waits.
    let mp = mempool().with_defer_window(WINDOW);
    assert!(mp.defer(vec![commit.clone()], t0).await.is_empty());
    let parent = mp.drain_up_to(10).await;
    let expired = mp.defer(vec![parent[0].clone(), attest.clone()], t0 + WINDOW).await;
    assert_eq!(expired.iter().map(|(p, _)| p.id).collect::<Vec<_>>(), vec![commit.id, attest.id]);
    assert_eq!(mp.len().await, 0, "the dependent does not wait on a fresh window");

    // At a tick's expiry: the commit's window ends while the two wait.
    let mp = mempool().with_defer_window(WINDOW);
    assert!(mp.defer(vec![commit.clone()], t0).await.is_empty());
    let parent = mp.drain_up_to(10).await;
    assert!(mp.defer(vec![parent[0].clone(), attest.clone()], t0 + WINDOW - secs(1)).await.is_empty());
    let expired = mp.expire_deferred(t0 + WINDOW).await;
    assert_eq!(expired.iter().map(|(p, _)| p.id).collect::<Vec<_>>(), vec![commit.id, attest.id]);
    assert_eq!(mp.len().await, 0);
}

// ── A resolve listing an order twice never applies ─────────────────────
//
// The Core resolves each listed order once and reads the second listing of
// it as not committed (`OrderNotCommitted`), whatever the state; the list
// rides unsigned, so anyone can replay a buyer's signature over one.
// Admission refuses it: it never waits, and never holds a deferral.

#[tokio::test]
async fn mempool_refuses_a_resolve_listing_an_order_twice() {
    let (_, _, root, sub, process_id, resolve_sig) = two_order_process();
    let mp = mempool();
    let refused = mp
        .submit(KernelOp::Resolve {
            process_id,
            cumulative_value: sub.expected_cumulative_value,
            commitments: vec![root.clone(), root],
            buyer_sig: resolve_sig,
        })
        .await;
    match refused {
        Err(SubmitError::Invalid(why)) => assert!(why.contains("twice"), "{why}"),
        other => panic!("a resolve listing an order twice is refused at admission, got {other:?}"),
    }
    assert_eq!(mp.len().await, 0);
}

// ── The read routes answer a page on another origin ────────────────────
//
// A browser page (the site's `/audit`) reads the relay cross-origin. The
// read routes carry `Access-Control-Allow-Origin: *` for GET and answer a
// preflight; `/state` exposes its root header to the page. The submission
// routes carry none: a JSON submission from a page needs a preflight, so
// without it no page can have its visitors' browsers submit for it, each
// from an address of its own past the per-address limit.

fn with_origin(req: Request<Body>) -> Request<Body> {
    let (mut parts, body) = req.into_parts();
    parts.headers.insert("origin", "https://reader.example".parse().unwrap());
    Request::from_parts(parts, body)
}

#[tokio::test]
async fn the_read_routes_answer_a_cross_origin_page_and_the_submit_routes_do_not() {
    let hash = format!("{:?}", B256::repeat_byte(7));
    for uri in [
        "/health".to_string(),
        "/status".to_string(),
        "/state".to_string(),
        "/batches".to_string(),
        format!("/orders/{hash}"),
        format!("/processes/{hash}"),
    ] {
        let app = api::router(test_app_state(), ApiConfig::default());
        let req = with_origin(Request::builder().uri(&uri).body(Body::empty()).unwrap());
        let response = app.oneshot(req).await.unwrap();
        assert_eq!(
            response.headers().get("access-control-allow-origin").map(|v| v.to_str().unwrap()),
            Some("*"),
            "GET {uri} answers any origin"
        );
        if uri == "/state" {
            let exposed = response.headers()["access-control-expose-headers"].to_str().unwrap().to_ascii_lowercase();
            assert!(exposed.contains("x-figaro-state-root"), "{exposed}");
        }
        // The preflight a page's GET may send.
        let app = api::router(test_app_state(), ApiConfig::default());
        let preflight = with_origin(
            Request::builder()
                .method("OPTIONS")
                .uri(&uri)
                .header("access-control-request-method", "GET")
                .body(Body::empty())
                .unwrap(),
        );
        let response = app.oneshot(preflight).await.unwrap();
        assert!(response.status().is_success(), "OPTIONS {uri}: {}", response.status());
        assert_eq!(response.headers()["access-control-allow-origin"], "*");
        let methods = response.headers()["access-control-allow-methods"].to_str().unwrap().to_string();
        assert!(methods.contains("GET") && !methods.contains("POST"), "{methods}");
    }

    let ops = canonical_ops();
    let app = api::router(test_app_state(), ApiConfig::default());
    let response = app.oneshot(from_ip(with_origin(submit_request(&ops[0])), [10, 0, 0, 9])).await.unwrap();
    assert_eq!(response.status(), StatusCode::OK);
    assert!(response.headers().get("access-control-allow-origin").is_none(), "/submit answers no origin");
    for uri in ["/submit", "/submit-usage"] {
        let app = api::router(test_app_state(), ApiConfig::default());
        let preflight = from_ip(
            with_origin(
                Request::builder()
                    .method("OPTIONS")
                    .uri(uri)
                    .header("access-control-request-method", "POST")
                    .body(Body::empty())
                    .unwrap(),
            ),
            [10, 0, 0, 9],
        );
        let response = app.oneshot(preflight).await.unwrap();
        assert!(response.headers().get("access-control-allow-origin").is_none(), "OPTIONS {uri} answers no origin");
    }
}

// ── A cross-origin page cannot submit ──────────────────────────────────
//
// A `text/plain` POST is a CORS simple request: a browser sends it with no
// preflight. The submission routes read their body only as JSON, so such a
// POST is answered `415` and admits nothing.

#[tokio::test]
async fn a_cross_origin_text_plain_submission_is_refused_and_admits_nothing() {
    let state = test_app_state();
    let mp = state.mempool.clone();
    let op = serde_json::json!({ "operation": canonical_ops()[0] });
    let claim = serde_json::json!({ "claim": build_canonical_batch_input().usage_claims[0] });
    for (uri, body) in [("/submit", op), ("/submit-usage", claim)] {
        let app = api::router(state.clone(), ApiConfig::default());
        let req = from_ip(
            with_origin(
                Request::builder()
                    .method("POST")
                    .uri(uri)
                    .header("content-type", "text/plain")
                    .body(Body::from(serde_json::to_vec(&body).unwrap()))
                    .unwrap(),
            ),
            [10, 0, 0, 11],
        );
        let response = app.oneshot(req).await.unwrap();
        assert_eq!(response.status(), StatusCode::UNSUPPORTED_MEDIA_TYPE, "POST {uri}");
        assert!(response.headers().get("access-control-allow-origin").is_none(), "POST {uri}");
    }
    assert_eq!(mp.len().await, 0);
    assert_eq!(mp.usage_len().await, 0);
}

// ── A read the relay's limits answer still reaches the page ────────────
//
// The cross-origin header sits outside the read routes' timeout and
// in-flight cap, so a `408` carries it; and the in-flight cap is one count
// across every route.

#[tokio::test]
async fn a_timed_out_read_still_answers_a_cross_origin_page() {
    let state = test_app_state();
    // `/health` reads the batch count; held, the read waits past the timeout.
    let held = state.batch_count.write().await;
    let config = ApiConfig { request_timeout: std::time::Duration::from_millis(50), ..ApiConfig::default() };
    let app = api::router(state.clone(), config);
    let req = with_origin(Request::builder().uri("/health").body(Body::empty()).unwrap());
    let response = app.oneshot(req).await.unwrap();
    assert_eq!(response.status(), StatusCode::REQUEST_TIMEOUT);
    assert_eq!(response.headers().get("access-control-allow-origin").map(|v| v.to_str().unwrap()), Some("*"));
    drop(held);
}

#[tokio::test]
async fn the_in_flight_cap_is_one_count_across_every_route() {
    let state = test_app_state();
    let held = state.batch_count.write().await;
    let config = ApiConfig {
        max_in_flight: 1,
        request_timeout: std::time::Duration::from_secs(30),
        ..ApiConfig::default()
    };
    let app = api::router(state.clone(), config);
    // One read in flight, waiting on the held count.
    let first = tokio::spawn(app.clone().oneshot(Request::builder().uri("/health").body(Body::empty()).unwrap()));
    tokio::time::sleep(std::time::Duration::from_millis(50)).await;
    // A read of another route waits for the one place.
    let second = tokio::time::timeout(
        std::time::Duration::from_millis(200),
        app.clone().oneshot(Request::builder().uri("/batches").body(Body::empty()).unwrap()),
    )
    .await;
    assert!(second.is_err(), "the second route shares the one slot");
    drop(held);
    assert_eq!(first.await.unwrap().unwrap().status(), StatusCode::OK);
}

// ── A recorded failure names no URL ────────────────────────────────────
//
// `/status` serves the last failure's text to any client. An HTTP client's
// error names the URL it requested, and a keyed RPC URL carries its key, so
// the failure log keeps the text with every URL taken out.

#[tokio::test]
async fn a_recorded_failure_carries_no_url() {
    use alloy::transports::http::reqwest;
    let e = reqwest::Client::new()
        .get("http://127.0.0.1:1/v3/SECRETKEY")
        .send()
        .await
        .expect_err("nothing listens on port 1");
    let text = e.to_string();
    assert!(text.contains("SECRETKEY"), "the client's error names its URL: {text}");
    let log = FailureLog::default();
    log.record(1, format!("on-chain submission failed (transient): {text}")).await;
    log.record_claims(1, format!("prove failed: {text}; see HTTPS://rpc.example/key/ABC")).await;
    let (_, last) = log.snapshot().await;
    let (_, claim) = log.claims_snapshot().await;
    for recorded in [last.unwrap(), claim.unwrap()] {
        for secret in ["SECRETKEY", "127.0.0.1", "http://", "HTTPS://", "ABC", "rpc.example"] {
            assert!(!recorded.contains(secret), "{secret} in {recorded}");
        }
        assert!(recorded.contains("failed"), "the reason stays: {recorded}");
    }
}

/// A resolve of `process_id` listing nothing, signed by no one: it never
/// applies, and anyone may submit one free.
fn never_applying_resolve(process_id: B256, n: u8) -> PendingOp {
    PendingOp {
        id: 200 + n as u64,
        key: B256::with_last_byte(200 + n),
        op: KernelOp::Resolve {
            process_id,
            cumulative_value: alloy_primitives::U256::ZERO,
            commitments: vec![],
            buyer_sig: Signature { r: B256::ZERO, s: B256::ZERO, v: 27 },
        },
        deferred_since: None,
        behind: Vec::new(),
    }
}

#[tokio::test]
async fn an_operation_that_never_applies_does_not_cut_an_honest_window_short() {
    // The model's adversary trace: f, naming P, deferred one tick before
    // the honest a on P; drained and deferred again together, they share a
    // group. At f's window a stays, until its own window ends.
    let (_, process_id) = canonical_ids();
    let honest = pend(canonical_ops())[2].clone();
    let t0 = std::time::Instant::now();

    let mp = mempool().with_defer_window(WINDOW);
    assert!(mp.defer(vec![never_applying_resolve(process_id, 1)], t0).await.is_empty());
    let f = mp.drain_up_to(10).await;
    assert!(mp.defer(vec![f[0].clone(), honest.clone()], t0 + secs(1)).await.is_empty());
    let expired = mp.expire_deferred(t0 + WINDOW).await;
    assert_eq!(expired.iter().map(|(p, _)| p.id).collect::<Vec<_>>(), vec![201]);
    assert_eq!(mp.len().await, 1, "the honest operation keeps its window");
    let expired = mp.expire_deferred(t0 + secs(1) + WINDOW).await;
    assert_eq!(expired.iter().map(|(p, _)| p.id).collect::<Vec<_>>(), vec![honest.id]);

    // At deferral: f's window ends as the two are deferred again together.
    let mp = mempool().with_defer_window(WINDOW);
    assert!(mp.defer(vec![never_applying_resolve(process_id, 1)], t0).await.is_empty());
    let f = mp.drain_up_to(10).await;
    assert!(mp.defer(vec![f[0].clone(), honest.clone()], t0 + secs(1)).await.is_empty());
    let both = mp.drain_up_to(10).await;
    let expired = mp.defer(both, t0 + WINDOW).await;
    assert_eq!(expired.iter().map(|(p, _)| p.id).collect::<Vec<_>>(), vec![201]);
    assert_eq!(mp.len().await, 1);
}

// ── A sub-order filtered behind an earlier sub-order rides behind it ───
//
// The root landed; a second order's funding could not be read, so it is
// deferred; a third order of the same process carries a cumulative value
// that counts the second's payment, so it applies only after it and follows
// it — though it names only the process, never the second's order. It is
// dead-lettered with the second; an order of the same process that does not
// need the second keeps its own window.

#[tokio::test]
async fn a_sub_order_filtered_behind_a_deferred_sub_order_is_dead_lettered_with_it() {
    let (root_op, sub_op, root, sub, process_id, _) = two_order_process();
    let landed = landed_after(vec![root_op]);
    let domain = domain_separator(CHAIN_ID, CORE);
    let buyer_key = make_signing_key(BUYER_KEY);
    let seller_key = make_signing_key(SELLER1_KEY);
    let order = |c: &Commitment| KernelOp::Commit {
        commitment: c.clone(),
        buyer_sig: sign_commitment(c, &domain, &buyer_key),
        seller_sig: sign_commitment(c, &domain, &seller_key),
    };
    let payment = alloy_primitives::U256::from(5u64);
    // The third order, after the second.
    let third = Commitment {
        process_id,
        payment,
        expected_cumulative_value: sub.expected_cumulative_value + payment,
        salt: sub.salt + alloy_primitives::U256::from(1u64),
        ..sub.clone()
    };
    // An order of the same process that extends the root directly: it does
    // not need the second.
    let beside = Commitment {
        process_id,
        payment,
        expected_cumulative_value: root.payment + payment,
        salt: sub.salt + alloy_primitives::U256::from(2u64),
        ..sub.clone()
    };
    let ops = pend(vec![sub_op, order(&third), order(&beside)]);
    let (second, third_op, beside_op) = (ops[0].clone(), ops[1].clone(), ops[2].clone());

    let t0 = std::time::Instant::now();
    let mp = mempool().with_defer_window(WINDOW);
    // Tick one: the second's funding could not be read; it is deferred.
    assert!(mp.defer(vec![second.clone()], t0).await.is_empty());
    let second = mp.drain_up_to(10).await.remove(0);
    // Tick two: still unread; the third arrives and follows it, as the
    // relay's formation wires it.
    let Refiltered { kept, follow, dropped, .. } = mp.refilter_behind_deferred(
        1000,
        &landed,
        vec![third_op.clone()],
        std::slice::from_ref(&second),
    );
    assert!(kept.is_empty(), "{kept:?}");
    assert!(dropped.is_empty(), "{dropped:?}");
    assert_eq!(follow.iter().map(|p| p.id).collect::<Vec<_>>(), vec![third_op.id]);
    assert_eq!(follow[0].behind, vec![second.key], "the third rides behind the second");
    // The order beside applies without the second: it is kept, behind nothing.
    let Refiltered { kept, follow: follow_beside, .. } = mp.refilter_behind_deferred(
        1000,
        &landed,
        vec![beside_op.clone()],
        std::slice::from_ref(&second),
    );
    assert_eq!(kept.iter().map(|p| p.id).collect::<Vec<_>>(), vec![beside_op.id]);
    assert!(follow_beside.is_empty());
    assert!(kept[0].behind.is_empty(), "an independent order is marked behind nothing");

    let mut tick = vec![second.clone()];
    tick.extend(follow);
    assert!(mp.defer(tick, t0 + secs(1)).await.is_empty());
    // At the second's window, the third goes with it.
    let expired = mp.expire_deferred(t0 + WINDOW).await;
    assert_eq!(expired.iter().map(|(p, _)| p.id).collect::<Vec<_>>(), vec![second.id, third_op.id]);
    assert_eq!(mp.len().await, 0);
}

// ── Marking what follows a deferred commit is bounded per tick ─────────
//
// A deferred commit can carry a drain's worth of operations behind it, and
// anyone can renew that every tick. Only a commit is a candidate (only a
// commit creates a process, an order or a cumulative step); the re-runs of
// the filter are capped (`MAX_DEPENDENCY_RERUNS`), a group past the cap
// marked conservatively; each re-run reads the group's slice of the landed
// state, never the whole of it. What is timed is what the marking adds to
// `refilter_after_drops` on the same inputs.

/// `landed` with `n` processes and orders of other processes beside it.
fn padded(mut landed: KernelStateSnapshot, n: u32) -> KernelStateSnapshot {
    for i in 0..n {
        let process = keccak256(i.to_be_bytes());
        let order = keccak256((i as u64 + (1u64 << 40)).to_be_bytes());
        landed.processes.push((
            process,
            ProcessState {
                root_buyer: Address::repeat_byte(1),
                currency: Address::repeat_byte(2),
                cumulative_value: alloy_primitives::U256::from(1u64),
                active_order_count: 1,
            },
        ));
        landed.order_status.push((order, 1));
        landed.order_process_id.push((order, process));
    }
    landed
}

/// How long marking a 100-operation group may add to the refilter on a
/// debug build.
const MARKING_CEILING: std::time::Duration = std::time::Duration::from_secs(60);

/// The time `refilter_behind_deferred` adds to `refilter_after_drops` on the
/// same inputs, and its result.
fn marking_cost(
    landed: &KernelStateSnapshot,
    valid: Vec<PendingOp>,
    deferred: &PendingOp,
) -> (std::time::Duration, Refiltered) {
    let started = std::time::Instant::now();
    let _ = assembler::refilter_after_drops(CHAIN_ID, CORE, 1000, landed, valid.clone(), std::slice::from_ref(deferred));
    let bare = started.elapsed();
    let started = std::time::Instant::now();
    let r = mempool().refilter_behind_deferred(1000, landed, valid, std::slice::from_ref(deferred));
    (started.elapsed().saturating_sub(bare), r)
}

#[test]
fn an_unread_root_with_99_attestations_behind_it_is_marked_in_one_run() {
    let ops = canonical_ops();
    let root = pend(vec![ops[0].clone()]).remove(0);
    let attests: Vec<PendingOp> = (0..99u8)
        .map(|i| PendingOp {
            id: 1000 + i as u64,
            key: keccak256([7, i]),
            op: ops[2].clone(),
            deferred_since: None,
            behind: Vec::new(),
        })
        .collect();
    let landed = padded(empty_snapshot(), 500);
    let (took, r) = marking_cost(&landed, attests, &root);
    assert_eq!(r.follow.len(), 99, "{:?}", r.dropped);
    assert!(r.follow.iter().all(|p| p.behind == vec![root.key]));
    assert_eq!(r.reruns, 1, "only the commit is a candidate");
    assert!(took < MARKING_CEILING, "{took:?}");
}

#[test]
fn a_chain_of_99_sub_orders_behind_an_unread_one_is_marked_within_the_cap() {
    let (root_op, sub_op, _, sub, _, _) = two_order_process();
    let domain = domain_separator(CHAIN_ID, CORE);
    let buyer_key = make_signing_key(BUYER_KEY);
    let seller_key = make_signing_key(SELLER1_KEY);
    let payment = alloy_primitives::U256::from(1u64);
    let mut chain = Vec::new();
    let mut prev = sub.clone();
    for i in 0..98u64 {
        let next = Commitment {
            payment,
            expected_cumulative_value: prev.expected_cumulative_value + payment,
            salt: sub.salt + alloy_primitives::U256::from(10 + i),
            ..sub.clone()
        };
        chain.push(KernelOp::Commit {
            commitment: next.clone(),
            buyer_sig: sign_commitment(&next, &domain, &buyer_key),
            seller_sig: sign_commitment(&next, &domain, &seller_key),
        });
        prev = next;
    }
    let second = pend(vec![sub_op]).remove(0);
    let follow: Vec<PendingOp> = chain
        .into_iter()
        .enumerate()
        .map(|(i, op)| PendingOp {
            id: 2000 + i as u64,
            key: keccak256([8, i as u8]),
            op,
            deferred_since: None,
            behind: Vec::new(),
        })
        .collect();
    let landed = padded(landed_after(vec![root_op]), 500);
    let (took, r) = marking_cost(&landed, follow, &second);
    assert_eq!(r.follow.len(), 98, "{:?}", r.dropped);
    assert!(r.reruns <= figaro_sequencer::mempool::MAX_DEPENDENCY_RERUNS, "{} re-runs", r.reruns);
    // Every one of the chain rides behind the unread second order.
    assert!(r.follow.iter().all(|p| p.behind.contains(&second.key)));
    // 99 candidates pass the cap: the group is marked conservatively, with no
    // re-run, each link behind the unread second and every earlier link.
    assert_eq!(r.reruns, 0, "the fallback runs no filter");
    let tenth = r.follow.iter().find(|p| p.key == keccak256([8, 10u8])).expect("the tenth link follows");
    let marked: std::collections::HashSet<B256> = tenth.behind.iter().copied().collect();
    let expected: std::collections::HashSet<B256> =
        std::iter::once(second.key).chain((0..10u8).map(|j| keccak256([8, j]))).collect();
    assert_eq!(marked, expected);
    assert_eq!(tenth.behind.len(), expected.len(), "no key twice");
    assert!(took < MARKING_CEILING, "{took:?}");
}

// ── The two attestation forms at the relay ────────────────────────

/// The canonical batch's buyer attestation is hash-only: it is admitted on
/// the coordinator's arguments alone, and a clauseData hash the agreement
/// never committed is refused at the door.
#[tokio::test]
async fn mempool_admits_a_hash_only_attestation_and_refuses_a_wrong_hash() {
    let ops = canonical_ops();
    assert!(matches!(&ops[2], KernelOp::AttestAsBuyer { proof: AttestationWitness::HashOnly { .. }, .. }));
    assert!(mempool().submit(ops[2].clone()).await.is_ok(), "hash-only buyer attest");

    let mut wrong = ops[2].clone();
    if let KernelOp::AttestAsBuyer { proof: AttestationWitness::HashOnly { clause_data_hash, .. }, .. } = &mut wrong {
        *clause_data_hash = keccak256(r#"{"modality":"pickup"}"#);
    }
    let err = mempool().submit(wrong).await.unwrap_err().to_string();
    assert!(err.contains("InvalidInclusionProof"), "{err}");
}

/// A buffer the test's tracing subscriber writes every log line into.
#[derive(Clone, Default)]
struct LogSink(std::sync::Arc<std::sync::Mutex<Vec<u8>>>);

impl std::io::Write for LogSink {
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        self.0.lock().unwrap().extend_from_slice(buf);
        Ok(buf.len())
    }
    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}

impl<'a> tracing_subscriber::fmt::MakeWriter<'a> for LogSink {
    type Writer = LogSink;
    fn make_writer(&'a self) -> Self::Writer {
        self.clone()
    }
}

/// An order whose one-clause agreement commits `clause_data` under a spec
/// nobody registered (a clause key is its spec's hash), and the buyer's
/// plaintext re-assert of that clause.
fn plaintext_attestation_of(spec_json: &str, clause_data: &str, salt: u64) -> (KernelOp, KernelOp) {
    let domain = domain_separator(CHAIN_ID, CORE);
    let buyer_key = make_signing_key(BUYER_KEY);
    let seller_key = make_signing_key(SELLER1_KEY);
    let clause_key = keccak256(spec_json.as_bytes());
    let data_hash = keccak256(clause_data.as_bytes());
    let mut preimage = [0u8; 64];
    preimage[..32].copy_from_slice(clause_key.as_slice());
    preimage[32..].copy_from_slice(data_hash.as_slice());
    let mut order = match &canonical_ops()[0] {
        KernelOp::Commit { commitment, .. } => commitment.clone(),
        other => panic!("canonical ops[0] is a commit, got {other:?}"),
    };
    order.checkout_hash = keccak256(keccak256(preimage));
    order.salt = alloy_primitives::U256::from(salt);
    let commit = KernelOp::Commit {
        commitment: order.clone(),
        buyer_sig: sign_commitment(&order, &domain, &buyer_key),
        seller_sig: sign_commitment(&order, &domain, &seller_key),
    };
    let (order_hash, process_id) = derive_commitment_ids(&domain, &order);
    let struct_hash = attest_buyer_struct_hash(&process_id, &order_hash, &clause_key, 0, &data_hash);
    let attest = KernelOp::AttestAsBuyer {
        target: order,
        clause_id: clause_key,
        stage: 0,
        content_ref: data_hash,
        buyer_sig: sign_digest(&buyer_key, &typed_data_hash(&domain, &struct_hash)),
        proof: AttestationWitness::Plaintext(AttestationContentProof {
            spec_json: spec_json.to_string(),
            content_json: clause_data.to_string(),
            clause_data: clause_data.to_string(),
            inclusion_proof: vec![],
            content_kind: ContentKind::ReAssert,
        }),
    };
    (commit, attest)
}

/// The relay never writes an attestation's content anywhere it keeps or
/// serves: not its logs, not the kept state file or the next-state journal,
/// not `/state` or `/status`. A party that sends the plaintext form gives
/// its content to the relay for the proof alone. Two plaintext submissions
/// carry a marker: one admitted, one refused with an error that quotes the
/// marker back to the submitter (the refusal's body is the sender's own).
#[tokio::test]
async fn the_relay_writes_no_attestation_content_to_its_logs_state_or_routes() {
    const MARKER: &str = "attpriv-the-parties-own-data";
    let sink = LogSink::default();
    let subscriber = tracing_subscriber::fmt()
        .with_writer(sink.clone())
        .with_max_level(tracing::Level::TRACE)
        .with_ansi(false)
        .finish();
    let _guard = tracing::subscriber::set_default(subscriber);

    let note_spec = r#"{"clauseId":"attpriv-note","version":1,"title":"Note","description":"A free note.","fields":[{"name":"note","type":"string","required":true}],"stages":{}}"#;
    let choice_spec = r#"{"clauseId":"attpriv-choice","version":1,"title":"Choice","description":"One of two.","fields":[{"name":"choice","type":"enum","required":true,"values":["a","b"]}],"stages":{}}"#;
    let (commit, admitted) = plaintext_attestation_of(note_spec, &format!(r#"{{"note":"{MARKER}"}}"#), 9001);
    let (_, refused) = plaintext_attestation_of(choice_spec, &format!(r#"{{"choice":"{MARKER}"}}"#), 9002);

    let state = test_app_state();
    let app = api::router(state.clone(), ApiConfig::default());
    for (op, expect) in [(&commit, StatusCode::OK), (&admitted, StatusCode::OK), (&refused, StatusCode::BAD_REQUEST)] {
        let response = app.clone().oneshot(from_ip(submit_request(op), [10, 0, 0, 9])).await.unwrap();
        let status = response.status();
        let body = axum::body::to_bytes(response.into_body(), 1 << 16).await.unwrap();
        assert_eq!(status, expect, "{}", String::from_utf8_lossy(&body));
        if expect == StatusCode::BAD_REQUEST {
            assert!(
                String::from_utf8_lossy(&body).contains(MARKER),
                "the refusal names the failing value to its sender: {}",
                String::from_utf8_lossy(&body)
            );
        }
    }

    // The batch loop's path: drain, filter, apply, hold the next state,
    // keep it, advance the served state.
    let pending = state.mempool.drain().await;
    let prev = state.state_mirror.snapshot().await;
    let (valid, poison) = assembler::filter_applicable_ops(CHAIN_ID, CORE, 1000, &prev, pending);
    assert!(poison.is_empty(), "{poison:?}");
    let ops: Vec<_> = valid.iter().map(|p| p.op.clone()).collect();
    assert_eq!(ops.len(), 2);
    let batch = assembler::assemble_batch(CHAIN_ID, CORE, 1000, ops, prev, UsageContext::default());
    let (pv, _, events, post) = apply_batch_with_state(&batch).expect("the batch applies");
    assert_eq!(events.attestations.len(), 1);
    let path = temp_state("attpriv");
    let (store, _) = StateStore::open(Some(path.clone())).await.unwrap();
    let next = NextState { root: pv.new_state_root, state: post.to_snapshot(), prev_root: pv.prev_state_root };
    store.hold_next(next.clone()).await.unwrap();
    let mut journal = path.clone().into_os_string();
    journal.push(".next.jsonl");
    let journal_text = std::fs::read_to_string(&journal).expect("the journal is written while the batch is held");
    store.keep(next.root, &next.state).await.unwrap();
    let kept_text = std::fs::read_to_string(&path).expect("the kept state is written");
    state.state_mirror.advance(post).await;

    let mut served = String::new();
    for route in ["/state", "/status"] {
        let response = app
            .clone()
            .oneshot(Request::builder().uri(route).body(Body::empty()).unwrap())
            .await
            .unwrap();
        assert_eq!(response.status(), StatusCode::OK, "{route}");
        let body = axum::body::to_bytes(response.into_body(), 1 << 20).await.unwrap();
        served.push_str(&String::from_utf8_lossy(&body));
    }
    let logs = String::from_utf8(sink.0.lock().unwrap().clone()).unwrap();
    assert!(logs.contains("operation admitted"), "the subscriber captured the relay's logs: {logs}");

    for (surface, text) in [
        ("the logs", &logs),
        ("the next-state journal", &journal_text),
        ("the kept state file", &kept_text),
        ("/state and /status", &served),
    ] {
        assert!(!text.contains(MARKER), "{surface} carry attestation content: {text}");
        assert!(!text.contains("attpriv-note") && !text.contains("attpriv-choice"), "{surface} carry a spec");
    }
    let _ = std::fs::remove_file(&path);
    let _ = std::fs::remove_file(&journal);
}

/// A body the relay cannot read as an operation is refused with serde's
/// reason, which quotes the mistyped value: the reason goes to the sender,
/// and the log carries the status alone, so a plaintext attestation with a
/// mistyped scalar never writes that value to the relay's logs.
#[tokio::test]
async fn a_malformed_plaintext_body_is_refused_without_logging_its_values() {
    const MARKER: &str = "attpriv-mistyped-scalar";
    let sink = LogSink::default();
    let subscriber = tracing_subscriber::fmt()
        .with_writer(sink.clone())
        .with_max_level(tracing::Level::TRACE)
        .with_ansi(false)
        .finish();
    let _guard = tracing::subscriber::set_default(subscriber);

    let note_spec = r#"{"clauseId":"attpriv-note","version":1,"title":"Note","description":"A free note.","fields":[{"name":"note","type":"string","required":true}],"stages":{}}"#;
    let (_, attest) = plaintext_attestation_of(note_spec, r#"{"note":"x"}"#, 9003);
    let mut body = serde_json::json!({ "operation": attest });
    body["operation"]["AttestAsBuyer"]["proof"]["Plaintext"]["content_kind"] = serde_json::json!(MARKER);
    let req = Request::builder()
        .method("POST")
        .uri("/submit")
        .header("content-type", "application/json")
        .body(Body::from(serde_json::to_vec(&body).unwrap()))
        .unwrap();
    let app = api::router(test_app_state(), ApiConfig::default());
    let response = app.oneshot(from_ip(req, [10, 0, 0, 10])).await.unwrap();
    let status = response.status();
    let text = String::from_utf8_lossy(&axum::body::to_bytes(response.into_body(), 1 << 16).await.unwrap()).to_string();
    assert_eq!(status, StatusCode::UNPROCESSABLE_ENTITY, "{text}");
    assert!(text.contains(MARKER), "the sender is told which value failed: {text}");

    let logs = String::from_utf8(sink.0.lock().unwrap().clone()).unwrap();
    assert!(logs.contains("payload rejected"), "the refusal is logged: {logs}");
    assert!(!logs.contains(MARKER), "the log quotes a value from the body: {logs}");
}

// ── A resolve authorized by the buyer's wallet code ───────────────

/// The SDK's wire for the second form (`SequencerClient.submitResolveByWalletCode`):
/// the authorization rides as a hex string.
fn wallet_code_resolve_from_the_wire(process_id: B256, value: alloy_primitives::U256, commitments: &[Commitment]) -> KernelOp {
    serde_json::from_value(serde_json::json!({
        "ResolveByWalletCode": {
            "process_id": process_id,
            "cumulative_value": value,
            "commitments": commitments,
            "authorization": "0x677561726469616e2d617070726f76616c",
        }
    }))
    .expect("the wire form deserializes")
}

#[tokio::test]
async fn a_wallet_code_resolve_is_admitted_from_the_wire_and_replays_to_the_same_root() {
    use figaro_kernel::kernel::apply_operations;
    use figaro_kernel::operation_stream::{decode_operation_stream, encode_operation_stream};
    let (root_op, sub_op, root, sub, process_id, _resolve_sig) = two_order_process();
    let resolve = wallet_code_resolve_from_the_wire(process_id, sub.expected_cumulative_value, &[root.clone(), sub.clone()]);
    let KernelOp::ResolveByWalletCode { authorization, .. } = &resolve else { panic!("the wallet-code form") };
    assert_eq!(authorization.as_ref(), b"guardian-approval");
    assert!(mempool().submit(resolve.clone()).await.is_ok(), "admitted: the bytes are the buyer's code's to judge");
    let input = BatchInput {
        chain_id: CHAIN_ID,
        verifying_contract: CORE,
        block_timestamp: 1000,
        operations: vec![root_op, sub_op, resolve],
        prev_state: empty_snapshot(),
        usage_claims: vec![],
        usage_period: 0,
        provenance_leaf: B256::ZERO,
    };
    let (pv, positions, events, _) = apply_batch_with_state(&input).expect("the wallet-code resolve applies");
    let stream = encode_operation_stream(&input.operations, &[]);
    assert_eq!(pv.operations_hash, keccak256(&stream));
    let (operations, _) = decode_operation_stream(&stream).expect("decodes");
    let mut state = KernelState::from_snapshot(&input.prev_state);
    apply_operations(&mut state, input.chain_id, input.verifying_contract, input.block_timestamp, &operations)
        .expect("the replay applies");
    assert_eq!(state.compute_root(), pv.new_state_root, "the replay lands on the committed root");
    // The plan counts the check of the buyer's code with the wallet's execution.
    let items = SettleItems::of(&positions, &events).with_stream(stream.len(), &input.operations, 0);
    assert_eq!(items.stream_wallet_code_checks, 1);
    assert_eq!(items.stream_resolutions, 1);
}

#[tokio::test]
async fn mempool_refuses_a_wallet_code_authorization_longer_than_the_relay_plans() {
    let (_, _, root, _, process_id, _) = two_order_process();
    let op = KernelOp::ResolveByWalletCode {
        process_id,
        cumulative_value: root.payment,
        commitments: vec![root],
        authorization: alloy_primitives::Bytes::from(vec![1u8; gas::MAX_WALLET_AUTHORIZATION_BYTES + 1]),
    };
    match mempool().submit(op).await {
        Err(SubmitError::Invalid(why)) => assert!(why.contains("longer than"), "{why}"),
        other => panic!("expected a refusal, got {other:?}"),
    }
}

#[test]
fn the_relay_asks_the_buyers_code_the_verifiers_question() {
    use figaro_sequencer::submitter::wallet_code_question;
    let (_, _, root, sub, process_id, _) = two_order_process();
    let op = wallet_code_resolve_from_the_wire(process_id, sub.expected_cumulative_value, &[root.clone(), sub.clone()]);
    let verifier = Address::repeat_byte(0x77);
    let (buyer, digest, bytes) = wallet_code_question(CHAIN_ID, verifier, &op).expect("a wallet-code resolve");
    assert_eq!(buyer, root.buyer, "the listed orders' buyer");
    let expected = typed_data_hash(
        &domain_separator(CHAIN_ID, verifier),
        &resolve_struct_hash(&process_id, &(root.payment + sub.payment)),
    );
    assert_eq!(digest, expected, "ResolveProcess over the listed payments, under the verifier's domain");
    assert_eq!(bytes.as_ref(), b"guardian-approval");
    assert!(wallet_code_question(CHAIN_ID, verifier, &build_canonical_batch_input().operations[0]).is_none());
}

/// A wallet's code can answer yes to the relay's eth_call and no in the
/// transaction (branching on `tx.origin`, `gasleft()` or a block field), so
/// the re-ask names nobody. The batch's wallet-code resolves are then
/// dead-lettered alone, their buyers counted by the adversarial signal, and
/// every other party's operation re-queued.
#[test]
fn an_unnamed_refusal_dead_letters_the_wallet_code_resolves_alone() {
    use figaro_sequencer::submitter::classify_deterministic_revert;
    let (_, _, root, sub, process_id, _) = two_order_process();
    let resolve = PendingOp {
        id: 90,
        key: B256::with_last_byte(90),
        op: wallet_code_resolve_from_the_wire(process_id, sub.expected_cumulative_value, &[root.clone(), sub.clone()]),
        deferred_since: None,
        behind: Vec::new(),
    };
    let other_partys_commit = commit_from(&root, 91, 10);
    // The re-reads name no revoker, and the re-ask (an eth_call) answers yes.
    let verdict = classify_deterministic_revert(vec![other_partys_commit, resolve], vec![], vec![], vec![]);
    assert!(!verdict.whole, "a batch carrying a wallet-code resolve is never dead-lettered whole on an unnamed refusal");
    assert_eq!(verdict.requeue.iter().map(|p| p.id).collect::<Vec<_>>(), vec![91], "the other party's commit is re-queued");
    assert_eq!(verdict.dead.len(), 1);
    assert_eq!(verdict.dead[0].0.id, 90, "the wallet-code resolve alone is dead-lettered");
    assert_eq!(verdict.dead[0].2, Some(root.buyer), "its buyer is counted by the adversarial signal");

    // A batch with no wallet-code resolve still dead-letters whole.
    let verdict = classify_deterministic_revert(vec![commit_from(&root, 92, 10)], vec![], vec![], vec![]);
    assert!(verdict.whole);
}

// ── The capacity filter counts each process under its derived id ──────

/// A sub-order of `root`'s process, under its derived id, with an id of `salt`.
fn sub_order_of(root: &PendingOp, salt: u64) -> PendingOp {
    let KernelOp::Commit { commitment: root, .. } = &root.op else { panic!("a root commit") };
    let process = derive_commitment_ids(&domain(), root).1;
    let mut sub = commit_from(root, salt, 1);
    if let KernelOp::Commit { commitment, .. } = &mut sub.op {
        commitment.process_id = process;
    }
    sub
}

#[test]
fn the_capacity_filter_counts_two_root_orders_and_their_sub_orders_each_under_its_own_process() {
    // Two root orders and a sub-order of each, in one batch. Each root order
    // opens a process of its own (its id derived from its struct, never the
    // zero the struct carries), and each sub-order is its process's second.
    let base = match &canonical_ops()[0] {
        KernelOp::Commit { commitment, .. } => commitment.clone(),
        other => panic!("canonical ops[0] is the commit, got {other:?}"),
    };
    let root_a = commit_from(&base, 1, 1);
    let root_b = commit_from(&base, 2, 1);
    let sub_a = sub_order_of(&root_a, 11);
    let sub_b = sub_order_of(&root_b, 12);
    let ops = vec![root_a, root_b, sub_a, sub_b];
    let ids = |v: &[PendingOp]| v.iter().map(|p| p.id).collect::<Vec<_>>();

    // One order a process: both roots fit, both sub-orders would be a second.
    let (kept, dropped) = assembler::filter_commits_within_resolve_capacity(CHAIN_ID, CORE, &empty_snapshot(), ops.clone(), 1);
    assert_eq!(ids(&kept), vec![1, 2], "each root order is the first of its own process");
    assert_eq!(dropped.iter().map(|(p, _)| p.id).collect::<Vec<_>>(), vec![11, 12], "each sub-order is its process's second");
    for (_, reason) in &dropped {
        assert!(reason.contains("would grow the process to 2 orders, past the 1"), "{reason}");
    }

    // Two orders a process: all four fit.
    let (kept, dropped) = assembler::filter_commits_within_resolve_capacity(CHAIN_ID, CORE, &empty_snapshot(), ops, 2);
    assert_eq!(ids(&kept), vec![1, 2, 11, 12]);
    assert!(dropped.is_empty(), "{dropped:?}");
}

// ── The EIP-712 verifying contract is the batch verifier ──────────────

#[test]
fn the_relay_refuses_a_verifying_contract_that_is_not_the_batch_verifier() {
    use figaro_sequencer::submitter::verifying_contract_for;
    let verifier = Address::repeat_byte(0xbb);
    let core = Address::repeat_byte(0xcc);
    assert_eq!(verifying_contract_for(verifier, verifier), Ok(verifier), "the verifier's own domain");
    let refused = verifying_contract_for(verifier, core).unwrap_err();
    assert!(refused.contains("FIGARO_CORE_ADDRESS") && refused.contains("BATCH_VERIFIER_ADDRESS"), "{refused}");
    assert!(verifying_contract_for(verifier, Address::ZERO).is_err(), "unset beside a verifier is a refusal too");
    // The prove-only dry run has no verifier: the domain is whatever is set.
    assert_eq!(verifying_contract_for(Address::ZERO, core), Ok(core));
}

// ── Admission refuses what it cannot verify ───────────────────────────

async fn submit_status(app: &axum::Router, op: &KernelOp) -> (StatusCode, serde_json::Value) {
    let res = app.clone().oneshot(submit_request(op)).await.unwrap();
    let status = res.status();
    let body = axum::body::to_bytes(res.into_body(), 1 << 20).await.unwrap();
    (status, serde_json::from_slice(&body).unwrap_or(serde_json::Value::Null))
}

#[tokio::test]
async fn admission_refuses_an_operation_on_a_process_or_order_the_relay_neither_holds_nor_has_queued() {
    // Each of these names a process or an order nobody committed: admitted,
    // it would wait out the deferral window in the queue, for free.
    let state = test_app_state();
    let app = api::router(state.clone(), ApiConfig::default());
    let ops = canonical_ops();
    let root = match &ops[0] {
        KernelOp::Commit { commitment, .. } => commitment.clone(),
        other => panic!("canonical ops[0] is the commit, got {other:?}"),
    };
    let process = derive_commitment_ids(&domain(), &root).1;
    let sub = Commitment {
        process_id: process,
        salt: alloy_primitives::U256::from(77u64),
        expected_cumulative_value: root.payment + root.payment,
        ..root.clone()
    };
    for (op, what) in [
        (ops[3].clone(), "resolve"),
        (ops[1].clone(), "seller attestation"),
        (ops[2].clone(), "buyer attestation"),
        (signed_commit(&sub), "sub-order"),
    ] {
        let (status, json) = submit_status(&app, &op).await;
        assert_eq!(status, StatusCode::BAD_REQUEST, "a {what} on an unknown process: {json}");
        assert!(json["error"].as_str().unwrap().contains("neither holds nor has queued"), "{json}");
    }
    assert_eq!(state.mempool.len().await, 0, "nothing was queued");

    // The root commit queued, each is admitted.
    for op in [&ops[0], &ops[1], &ops[2], &ops[3]] {
        let (status, json) = submit_status(&app, op).await;
        assert_eq!(status, StatusCode::OK, "{json}");
    }
    let (status, json) = submit_status(&app, &signed_commit(&sub)).await;
    assert_eq!(status, StatusCode::OK, "{json}");
}

#[tokio::test]
async fn admission_refuses_a_resolve_not_signed_by_the_root_buyer() {
    let state = test_app_state();
    let app = api::router(state.clone(), ApiConfig::default());
    let ops = canonical_ops();
    assert_eq!(submit_status(&app, &ops[0]).await.0, StatusCode::OK);
    let (process_id, cumulative_value, commitments, _) = canonical_resolve();
    let digest = typed_data_hash(&domain(), &resolve_struct_hash(&process_id, &cumulative_value));
    let stranger = KernelOp::Resolve {
        process_id,
        cumulative_value,
        commitments,
        buyer_sig: sign_digest(&make_signing_key(SELLER1_KEY), &digest),
    };
    let (status, json) = submit_status(&app, &stranger).await;
    assert_eq!(status, StatusCode::BAD_REQUEST, "{json}");
    assert!(json["error"].as_str().unwrap().contains("not the process's root buyer"), "{json}");
    assert_eq!(state.mempool.len().await, 1, "the commit alone");
}

#[tokio::test]
async fn admission_knows_a_process_in_flight_and_one_the_relay_holds() {
    let ops = canonical_ops();
    // In flight: the root commit drained into a batch not yet landed.
    let state = test_app_state();
    let app = api::router(state.clone(), ApiConfig::default());
    assert_eq!(submit_status(&app, &ops[0]).await.0, StatusCode::OK);
    assert_eq!(state.mempool.drain().await.len(), 1);
    let (status, json) = submit_status(&app, &ops[1]).await;
    assert_eq!(status, StatusCode::OK, "an attestation on an order in flight: {json}");
    // Held: the process behind the verifier's root, nothing queued.
    let state = AppState { state_mirror: StateMirror::from_snapshot(landed_after(vec![ops[0].clone()])), ..test_app_state() };
    let app = api::router(state, ApiConfig::default());
    let (status, json) = submit_status(&app, &ops[3]).await;
    assert_eq!(status, StatusCode::OK, "a resolve on a held process: {json}");
}

#[tokio::test]
async fn admission_refuses_a_commit_whose_bonds_it_cannot_read() {
    // The chain cannot be asked: the bonds are unverified, so the commit is
    // refused (retry), never queued, and the answer carries no URL.
    let state = AppState {
        funding: Some(figaro_sequencer::submitter::FundingGate {
            rpc_url: "http://127.0.0.1:1/v2/secret-key".to_string(),
            verifier: CORE,
        }),
        ..test_app_state()
    };
    let app = api::router(state.clone(), ApiConfig::default());
    let (status, json) = submit_status(&app, &canonical_ops()[0]).await;
    assert_eq!(status, StatusCode::SERVICE_UNAVAILABLE, "{json}");
    let error = json["error"].as_str().unwrap();
    assert!(error.contains("bonds could not be read"), "{error}");
    assert!(!error.contains("secret-key") && !error.contains("127.0.0.1"), "{error}");
    assert_eq!(state.mempool.len().await, 0);
}
