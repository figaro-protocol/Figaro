/// Sequencer tests — mempool pre-checks, state mirror, assembler,
/// and HTTP API integration.
use alloy_primitives::{address, Address, B256, U256, keccak256};
use k256::ecdsa::SigningKey;

use figaro_kernel::eip712::*;
use figaro_kernel::state::KernelState;
use figaro_kernel::types::*;

use figaro_sequencer::assembler;
use figaro_sequencer::mempool::Mempool;
use figaro_sequencer::state::StateMirror;

// ── Constants (match kernel parity tests) ─────────────────────────

const BUYER_KEY: u64 = 0xB0B;
const SELLER1_KEY: u64 = 0x5E11;

const BUYER: Address = address!("0376AAc07Ad725E01357B1725B5ceC61aE10473c");
const SELLER1: Address = address!("Ad29D7a8aD3639F97798c768202F27C1dE81DC55");

const TOKEN: Address = address!("5615dEB798BB3E4dFa0139dFa1b3D433Cc23b72f");
const CORE: Address = address!("2e234DAe75C793f67A35089C9d99245E1C58470b");
const CHAIN_ID: u64 = 31337;

// ── Signing helpers (same as kernel parity tests) ─────────────────

fn make_signing_key(secret: u64) -> SigningKey {
    let mut bytes = [0u8; 32];
    bytes[24..].copy_from_slice(&secret.to_be_bytes());
    SigningKey::from_bytes((&bytes).into()).unwrap()
}

fn sign_digest(key: &SigningKey, digest: &B256) -> Signature {
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

fn sign_commitment(c: &Commitment, domain: &B256, key: &SigningKey) -> Signature {
    let struct_hash = commitment_struct_hash(c);
    let digest = typed_data_hash(domain, &struct_hash);
    sign_digest(key, &digest)
}

fn root_commitment() -> Commitment {
    Commitment {
        process_id: B256::ZERO,
        buyer: BUYER,
        seller: SELLER1,
        currency: TOKEN,
        payment: U256::from(100_000_000_000_000_000_000u128),
        expected_cumulative_value: U256::from(100_000_000_000_000_000_000u128),
        agreement_hash: keccak256("test-agreement"),
        salt: U256::from(42u64),
        deadline: U256::from(2000u64),
    }
}

fn empty_snapshot() -> KernelStateSnapshot {
    KernelStateSnapshot {
        processes: vec![],
        order_status: vec![],
        order_process_id: vec![],
        schemas_registered: vec![],
        operators_registered: vec![],
    }
}

fn signed_commit_op() -> KernelOp {
    let domain = domain_separator(CHAIN_ID, CORE);
    let buyer_key = make_signing_key(BUYER_KEY);
    let seller_key = make_signing_key(SELLER1_KEY);
    let c = root_commitment();
    let buyer_sig = sign_commitment(&c, &domain, &buyer_key);
    let seller_sig = sign_commitment(&c, &domain, &seller_key);
    KernelOp::Commit {
        commitment: c,
        buyer_sig,
        seller_sig,
    }
}

// ══════════════════════════════════════════════════════════════════
// Mempool tests
// ══════════════════════════════════════════════════════════════════

#[tokio::test]
async fn mempool_accepts_valid_commit() {
    let pool = Mempool::new(CHAIN_ID, CORE);
    let op = signed_commit_op();
    let id = pool.submit(op).await.unwrap();
    assert_eq!(id, 1);
    assert_eq!(pool.len().await, 1);
}

#[tokio::test]
async fn mempool_rejects_bad_buyer_sig() {
    let pool = Mempool::new(CHAIN_ID, CORE);
    let domain = domain_separator(CHAIN_ID, CORE);
    let seller_key = make_signing_key(SELLER1_KEY);

    let c = root_commitment();
    // Sign buyer with seller's key — should fail pre-check
    let bad_buyer_sig = sign_commitment(&c, &domain, &seller_key);
    let seller_sig = sign_commitment(&c, &domain, &seller_key);

    let op = KernelOp::Commit {
        commitment: c,
        buyer_sig: bad_buyer_sig,
        seller_sig,
    };

    let result = pool.submit(op).await;
    assert!(result.is_err());
    assert!(result.unwrap_err().contains("buyer sig mismatch"));
    assert_eq!(pool.len().await, 0);
}

#[tokio::test]
async fn mempool_rejects_bad_seller_sig() {
    let pool = Mempool::new(CHAIN_ID, CORE);
    let domain = domain_separator(CHAIN_ID, CORE);
    let buyer_key = make_signing_key(BUYER_KEY);

    let c = root_commitment();
    let buyer_sig = sign_commitment(&c, &domain, &buyer_key);
    // Sign seller with buyer's key — should fail pre-check
    let bad_seller_sig = sign_commitment(&c, &domain, &buyer_key);

    let op = KernelOp::Commit {
        commitment: c,
        buyer_sig,
        seller_sig: bad_seller_sig,
    };

    let result = pool.submit(op).await;
    assert!(result.is_err());
    assert!(result.unwrap_err().contains("seller sig mismatch"));
}

#[tokio::test]
async fn mempool_rejects_wrong_chain_id() {
    // Create mempool expecting chain 1, submit signature for chain 31337
    let pool = Mempool::new(1, CORE);
    let op = signed_commit_op(); // signed for chain 31337

    let result = pool.submit(op).await;
    assert!(result.is_err());
    // Wrong domain → recovered address won't match
    assert!(result.unwrap_err().contains("mismatch"));
}

#[tokio::test]
async fn mempool_drain_returns_all_and_empties() {
    let pool = Mempool::new(CHAIN_ID, CORE);
    let op1 = signed_commit_op();
    let op2 = signed_commit_op();

    pool.submit(op1).await.unwrap();
    pool.submit(op2).await.unwrap();
    assert_eq!(pool.len().await, 2);

    let drained = pool.drain().await;
    assert_eq!(drained.len(), 2);
    assert_eq!(drained[0].id, 1);
    assert_eq!(drained[1].id, 2);
    assert_eq!(pool.len().await, 0);
}

#[tokio::test]
async fn mempool_sequential_ids() {
    let pool = Mempool::new(CHAIN_ID, CORE);
    let id1 = pool.submit(signed_commit_op()).await.unwrap();
    let id2 = pool.submit(signed_commit_op()).await.unwrap();
    let id3 = pool.submit(signed_commit_op()).await.unwrap();
    assert_eq!(id1, 1);
    assert_eq!(id2, 2);
    assert_eq!(id3, 3);
}

#[tokio::test]
async fn mempool_accepts_register_schema() {
    let pool = Mempool::new(CHAIN_ID, CORE);
    let domain = domain_separator(CHAIN_ID, CORE);
    let key = make_signing_key(BUYER_KEY);
    let schema_id = keccak256(b"test-schema-v1");
    let uri_hash = keccak256(b"ipfs://Qm...");

    let struct_hash = register_schema_struct_hash(&schema_id, 1, &uri_hash);
    let digest = typed_data_hash(&domain, &struct_hash);
    let sig = sign_digest(&key, &digest);

    let op = KernelOp::RegisterSchema {
        schema_id,
        version: 1,
        uri_hash,
        registrar_sig: sig,
    };

    let id = pool.submit(op).await.unwrap();
    assert_eq!(id, 1);
}

#[tokio::test]
async fn mempool_accepts_register_operator() {
    let pool = Mempool::new(CHAIN_ID, CORE);
    let domain = domain_separator(CHAIN_ID, CORE);
    let key = make_signing_key(SELLER1_KEY);

    let struct_hash = register_operator_struct_hash("ipfs://merchant-meta");
    let digest = typed_data_hash(&domain, &struct_hash);
    let sig = sign_digest(&key, &digest);

    let op = KernelOp::RegisterOperator {
        metadata_uri: "ipfs://merchant-meta".to_string(),
        operator_sig: sig,
    };

    let id = pool.submit(op).await.unwrap();
    assert_eq!(id, 1);
}

#[tokio::test]
async fn mempool_accepts_resolve() {
    let pool = Mempool::new(CHAIN_ID, CORE);
    let domain = domain_separator(CHAIN_ID, CORE);
    let buyer_key = make_signing_key(BUYER_KEY);
    let process_id = keccak256(b"some-process");

    let struct_hash = resolve_struct_hash(&process_id);
    let digest = typed_data_hash(&domain, &struct_hash);
    let sig = sign_digest(&buyer_key, &digest);

    let op = KernelOp::Resolve {
        process_id,
        commitments: vec![root_commitment()],
        buyer_sig: sig,
    };

    let id = pool.submit(op).await.unwrap();
    assert_eq!(id, 1);
}

// ──────────────────────────────────────────────────────────────────
// Layer B content-proof gate — mirrors the kernel's
// validate_attestation_content. Same accept + reject paths the
// kernel parity suite covers, exercised here at the mempool boundary
// so bad batches are dropped before reaching the prover.
// ──────────────────────────────────────────────────────────────────

/// Build a seller attestation op whose content_ref is the keccak of the
/// canonical per-schema encoding of `content_json`. The op's signature
/// covers the same content_ref so signature-pre-check passes and the
/// content gate is what determines accept/reject.
fn build_attest_seller_with_proof(
    schema_id_str: &str,
    content_json: serde_json::Value,
    override_content_ref: Option<B256>,
) -> KernelOp {
    let domain = domain_separator(CHAIN_ID, CORE);
    let seller_key = make_signing_key(SELLER1_KEY);
    let root = root_commitment();
    let schema_id = keccak256(schema_id_str.as_bytes());

    let canonical_bytes = figaro_schema::encode_content_for_schema(schema_id_str, &content_json)
        .expect("canonical encoder must succeed for this test fixture");
    let content_ref = override_content_ref.unwrap_or_else(|| keccak256(canonical_bytes.as_slice()));

    let order_hash = compute_order_hash(&B256::ZERO, &commitment_struct_hash(&root));
    let struct_hash = attest_seller_struct_hash(&order_hash, &schema_id, 0, &content_ref);
    let digest = typed_data_hash(&domain, &struct_hash);
    let seller_sig = sign_digest(&seller_key, &digest);

    KernelOp::AttestAsSeller {
        role_commitment: root,
        order_hash,
        schema_id,
        stage: 0,
        content_ref,
        seller_sig,
        content_proof: Some(AttestationContentProof {
            content_json: serde_json::to_string(&content_json).unwrap(),
        }),
    }
}

#[tokio::test]
async fn mempool_accepts_attest_with_valid_content_proof() {
    let pool = Mempool::new(CHAIN_ID, CORE);
    let op = build_attest_seller_with_proof(
        "figaro-ghg-protocol-v1",
        serde_json::json!({ "scope": 1 }),        None,
    );
    let id = pool.submit(op).await.unwrap();
    assert_eq!(id, 1);
    assert_eq!(pool.len().await, 1);
}

#[tokio::test]
async fn mempool_rejects_content_hash_mismatch() {
    let pool = Mempool::new(CHAIN_ID, CORE);
    // Override content_ref to a hash unrelated to the canonical encoding.
    let wrong_ref = keccak256(b"completely different bytes");
    let op = build_attest_seller_with_proof(
        "figaro-ghg-protocol-v1",
        serde_json::json!({ "scope": 1 }),        Some(wrong_ref),
    );
    let err = pool.submit(op).await.unwrap_err();
    assert!(
        err.contains("canonical-encoding hash does not match"),
        "expected hash-mismatch rejection, got: {err}",
    );
    assert_eq!(pool.len().await, 0);
}

#[tokio::test]
async fn mempool_rejects_invalid_content() {
    let pool = Mempool::new(CHAIN_ID, CORE);
    // scope=4 is out of the spec's 1..=3 range; the encoder still
    // produces bytes, so the test exercises the validate_content gate.
    let op = build_attest_seller_with_proof(
        "figaro-ghg-protocol-v1",
        serde_json::json!({ "scope": 4 }),        None,
    );
    let err = pool.submit(op).await.unwrap_err();
    assert!(
        err.contains("failed validation"),
        "expected validation rejection, got: {err}",
    );
    assert_eq!(pool.len().await, 0);
}

#[tokio::test]
async fn mempool_rejects_unsupported_schema_encoder() {
    let pool = Mempool::new(CHAIN_ID, CORE);
    let schema_id = keccak256(b"figaro-bogus-v99");

    // Hand-construct the op: schema_id is not a runtime-attestable
    // protocol schema, so the content gate has no embedded spec for it.
    let domain = domain_separator(CHAIN_ID, CORE);
    let seller_key = make_signing_key(SELLER1_KEY);
    let root = root_commitment();
    let placeholder_ref = keccak256(b"placeholder");
    let order_hash = compute_order_hash(&B256::ZERO, &commitment_struct_hash(&root));
    let struct_hash = attest_seller_struct_hash(&order_hash, &schema_id, 0, &placeholder_ref);
    let digest = typed_data_hash(&domain, &struct_hash);
    let seller_sig = sign_digest(&seller_key, &digest);
    let op = KernelOp::AttestAsSeller {
        role_commitment: root,
        order_hash,
        schema_id,
        stage: 0,
        content_ref: placeholder_ref,
        seller_sig,
        content_proof: Some(AttestationContentProof {
            content_json: serde_json::to_string(&serde_json::json!({ "x": "ok" })).unwrap(),
        }),
    };

    let err = pool.submit(op).await.unwrap_err();
    assert!(
        err.contains("not a runtime-attestable protocol schema"),
        "expected unknown-schema rejection, got: {err}",
    );
    assert_eq!(pool.len().await, 0);
}

#[tokio::test]
async fn mempool_rejects_missing_content_proof_for_protocol_schema() {
    let pool = Mempool::new(CHAIN_ID, CORE);

    // Seller attestation under figaro-ghg-protocol-v1 with a non-zero
    // content_ref but no content_proof — the content gate requires one.
    let domain = domain_separator(CHAIN_ID, CORE);
    let seller_key = make_signing_key(SELLER1_KEY);
    let root = root_commitment();
    let schema_id = keccak256(b"figaro-ghg-protocol-v1");
    let content_ref = keccak256(b"some-content");
    let order_hash = compute_order_hash(&B256::ZERO, &commitment_struct_hash(&root));
    let struct_hash = attest_seller_struct_hash(&order_hash, &schema_id, 0, &content_ref);
    let digest = typed_data_hash(&domain, &struct_hash);
    let seller_sig = sign_digest(&seller_key, &digest);
    let op = KernelOp::AttestAsSeller {
        role_commitment: root,
        order_hash,
        schema_id,
        stage: 0,
        content_ref,
        seller_sig,
        content_proof: None,
    };

    let err = pool.submit(op).await.unwrap_err();
    assert!(
        err.contains("requires a content_proof"),
        "expected missing-proof rejection, got: {err}",
    );
    assert_eq!(pool.len().await, 0);
}

// ══════════════════════════════════════════════════════════════════
// State mirror tests
// ══════════════════════════════════════════════════════════════════

#[tokio::test]
async fn state_mirror_genesis_root_is_deterministic() {
    let m1 = StateMirror::genesis();
    let m2 = StateMirror::genesis();
    assert_eq!(m1.state_root().await, m2.state_root().await);
}

#[tokio::test]
async fn state_mirror_genesis_root_is_nonzero() {
    let mirror = StateMirror::genesis();
    let root = mirror.state_root().await;
    assert_ne!(root, B256::ZERO);
}

#[tokio::test]
async fn state_mirror_snapshot_roundtrip() {
    let mirror = StateMirror::genesis();
    let snap = mirror.snapshot().await;
    let mirror2 = StateMirror::from_snapshot(snap);
    assert_eq!(mirror.state_root().await, mirror2.state_root().await);
}

#[tokio::test]
async fn state_mirror_advance_changes_root() {
    let mirror = StateMirror::genesis();
    let genesis_root = mirror.state_root().await;

    // Create a state with some data
    let mut state = KernelState::default();
    state.schemas_registered.insert(keccak256(b"test"), true);

    mirror.advance(state).await;
    let new_root = mirror.state_root().await;

    assert_ne!(genesis_root, new_root);
}

#[tokio::test]
async fn state_mirror_advance_snapshot_consistent() {
    let mirror = StateMirror::genesis();

    let mut state = KernelState::default();
    state.schemas_registered.insert(keccak256(b"schema-1"), true);
    state.schemas_registered.insert(keccak256(b"schema-2"), true);

    mirror.advance(state).await;
    let root_after_advance = mirror.state_root().await;

    // Snapshot → new mirror → same root
    let snap = mirror.snapshot().await;
    let mirror2 = StateMirror::from_snapshot(snap);
    assert_eq!(mirror2.state_root().await, root_after_advance);
}

// ══════════════════════════════════════════════════════════════════
// Assembler tests
// ══════════════════════════════════════════════════════════════════

#[test]
fn assembler_batch_preserves_fields() {
    let ops = vec![signed_commit_op(), signed_commit_op()];
    let snap = empty_snapshot();
    let batch = assembler::assemble_batch(CHAIN_ID, CORE, 1234, ops, snap);

    assert_eq!(batch.chain_id, CHAIN_ID);
    assert_eq!(batch.verifying_contract, CORE);
    assert_eq!(batch.block_timestamp, 1234);
    assert_eq!(batch.operations.len(), 2);
}

#[test]
fn assembler_config_defaults() {
    let cfg = assembler::AssemblerConfig::default();
    assert_eq!(cfg.max_ops, 100);
    assert_eq!(cfg.interval_secs, 10);
}

// ══════════════════════════════════════════════════════════════════
// API tests (HTTP layer)
// ══════════════════════════════════════════════════════════════════

mod api_tests {
    use super::*;
    use axum::body::Body;
    use axum::http::{Request, StatusCode};
    use figaro_sequencer::api::{self, AppState};
    use std::sync::Arc;
    use tokio::sync::RwLock;
    use tower::ServiceExt; // for oneshot

    fn test_app_state() -> AppState {
        AppState {
            mempool: Mempool::new(CHAIN_ID, CORE),
            state_mirror: StateMirror::genesis(),
            batch_count: Arc::new(RwLock::new(0)),
        }
    }

    #[tokio::test]
    async fn api_status_returns_json() {
        let state = test_app_state();
        let app = api::router(state);

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
    async fn api_submit_valid_op() {
        let state = test_app_state();
        let app = api::router(state.clone());

        let op = signed_commit_op();
        let body = serde_json::json!({ "operation": op });

        let req = Request::builder()
            .method("POST")
            .uri("/submit")
            .header("content-type", "application/json")
            .body(Body::from(serde_json::to_vec(&body).unwrap()))
            .unwrap();

        let response = app.oneshot(req).await.unwrap();
        assert_eq!(response.status(), StatusCode::OK);

        let body_bytes = axum::body::to_bytes(response.into_body(), 4096)
            .await
            .unwrap();
        let json: serde_json::Value = serde_json::from_slice(&body_bytes).unwrap();
        assert_eq!(json["id"], 1);

        // Confirm op is in the mempool
        assert_eq!(state.mempool.len().await, 1);
    }

    #[tokio::test]
    async fn api_submit_invalid_sig_returns_400() {
        let state = test_app_state();
        let app = api::router(state);

        // Create a commit with swapped buyer/seller signatures
        let domain = domain_separator(CHAIN_ID, CORE);
        let seller_key = make_signing_key(SELLER1_KEY);
        let c = root_commitment();
        let bad_buyer_sig = sign_commitment(&c, &domain, &seller_key);
        let seller_sig = sign_commitment(&c, &domain, &seller_key);

        let op = KernelOp::Commit {
            commitment: c,
            buyer_sig: bad_buyer_sig,
            seller_sig,
        };
        let body = serde_json::json!({ "operation": op });

        let req = Request::builder()
            .method("POST")
            .uri("/submit")
            .header("content-type", "application/json")
            .body(Body::from(serde_json::to_vec(&body).unwrap()))
            .unwrap();

        let response = app.oneshot(req).await.unwrap();
        assert_eq!(response.status(), StatusCode::BAD_REQUEST);

        let body_bytes = axum::body::to_bytes(response.into_body(), 4096)
            .await
            .unwrap();
        let json: serde_json::Value = serde_json::from_slice(&body_bytes).unwrap();
        assert!(json["error"].as_str().unwrap().contains("buyer sig mismatch"));
    }

    #[tokio::test]
    async fn api_status_reflects_pending_ops() {
        let state = test_app_state();

        // Submit two ops via mempool directly
        state.mempool.submit(signed_commit_op()).await.unwrap();
        state.mempool.submit(signed_commit_op()).await.unwrap();

        let app = api::router(state);

        let req = Request::builder()
            .uri("/status")
            .body(Body::empty())
            .unwrap();

        let response = app.oneshot(req).await.unwrap();
        let body = axum::body::to_bytes(response.into_body(), 4096)
            .await
            .unwrap();
        let json: serde_json::Value = serde_json::from_slice(&body).unwrap();

        assert_eq!(json["pending_ops"], 2);
    }
}

// ══════════════════════════════════════════════════════════════════
// End-to-end: mempool → assemble → kernel execution
// ══════════════════════════════════════════════════════════════════

#[tokio::test]
async fn e2e_mempool_to_kernel() {
    // Submit ops → drain → assemble → apply_batch_with_state
    let pool = Mempool::new(CHAIN_ID, CORE);
    let mirror = StateMirror::genesis();

    // Submit a valid commit
    pool.submit(signed_commit_op()).await.unwrap();
    assert_eq!(pool.len().await, 1);

    // Drain and assemble
    let pending = pool.drain().await;
    let ops: Vec<_> = pending.into_iter().map(|p| p.op).collect();
    let prev_state = mirror.snapshot().await;

    let batch = assembler::assemble_batch(
        CHAIN_ID, CORE, 1000, ops, prev_state,
    );

    // Execute through kernel
    let (pv, positions, _events, post_state) =
        figaro_kernel::kernel::apply_batch_with_state(&batch).unwrap();

    // State transition occurred
    assert_ne!(pv.prev_state_root, pv.new_state_root);
    assert_eq!(pv.chain_id, CHAIN_ID);
    assert_eq!(pv.verifying_contract, CORE);

    // Token positions are correct (1 commit: buyer deposits 200, seller deposits 200)
    let ether = U256::from(1_000_000_000_000_000_000u64);
    let buyer_pos = positions.iter().find(|p| p.user == BUYER).unwrap();
    let seller_pos = positions.iter().find(|p| p.user == SELLER1).unwrap();
    assert_eq!(buyer_pos.deposit, U256::from(200u64) * ether);
    assert_eq!(seller_pos.deposit, U256::from(200u64) * ether);

    // Advance state mirror
    let new_root = post_state.compute_root();
    assert_eq!(new_root, pv.new_state_root);
    mirror.advance(post_state).await;
    assert_eq!(mirror.state_root().await, pv.new_state_root);

    // Mempool is empty after drain
    assert_eq!(pool.len().await, 0);
}

#[tokio::test]
async fn e2e_two_sequential_batches() {
    // Verify the state mirror correctly chains across batches
    let pool = Mempool::new(CHAIN_ID, CORE);
    let mirror = StateMirror::genesis();
    let genesis_root = mirror.state_root().await;

    // Batch 1: commit
    pool.submit(signed_commit_op()).await.unwrap();
    let ops1: Vec<_> = pool.drain().await.into_iter().map(|p| p.op).collect();
    let batch1 = assembler::assemble_batch(
        CHAIN_ID, CORE, 1000, ops1, mirror.snapshot().await,
    );
    let (pv1, _, _, post_state1) =
        figaro_kernel::kernel::apply_batch_with_state(&batch1).unwrap();
    mirror.advance(post_state1).await;

    assert_ne!(genesis_root, mirror.state_root().await);
    assert_eq!(mirror.state_root().await, pv1.new_state_root);

    // Batch 2: register a schema (using the state from batch 1)
    let domain = domain_separator(CHAIN_ID, CORE);
    let key = make_signing_key(BUYER_KEY);
    let schema_id = keccak256(b"test-schema");
    let uri_hash = keccak256(b"ipfs://test");
    let struct_hash = register_schema_struct_hash(&schema_id, 1, &uri_hash);
    let digest = typed_data_hash(&domain, &struct_hash);
    let sig = sign_digest(&key, &digest);

    let schema_op = KernelOp::RegisterSchema {
        schema_id,
        version: 1,
        uri_hash,
        registrar_sig: sig,
    };
    pool.submit(schema_op).await.unwrap();
    let ops2: Vec<_> = pool.drain().await.into_iter().map(|p| p.op).collect();
    let batch2 = assembler::assemble_batch(
        CHAIN_ID, CORE, 2000, ops2, mirror.snapshot().await,
    );

    // Batch 2 prev_state_root must equal batch 1 new_state_root
    let (pv2, _, _, post_state2) =
        figaro_kernel::kernel::apply_batch_with_state(&batch2).unwrap();
    assert_eq!(pv2.prev_state_root, pv1.new_state_root);
    assert_ne!(pv2.prev_state_root, pv2.new_state_root);

    mirror.advance(post_state2).await;
    assert_eq!(mirror.state_root().await, pv2.new_state_root);
}
