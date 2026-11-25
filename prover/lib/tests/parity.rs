//! Parity tests: the Rust mirror produces FigaroCore's outputs for the same
//! inputs, through both entries of the rules (`common::run_both`: the
//! relay's native run and the proof program's `apply_guest`).
//!
//! The two commitments the flows run on are the SDK's frozen vectors
//! (`test/fixtures/eip712-vectors.json`, written by
//! `sdk/tests/eip712Parity.test.ts`): the root as frozen, and the sub-order
//! re-pointed at the root's process. Their hashes are held to the fixture by
//! `eip712_vectors.rs`, and FigaroCore's by `Eip712ParityTest`.
use alloy_primitives::{keccak256, B256, U256};
use k256::ecdsa::SigningKey;

use figaro_kernel::eip712::*;
use figaro_kernel::kernel::derive_commitment_ids;
use figaro_kernel::types::*;

mod common;
use common::{
    addr, b256, commitment_json, empty_snapshot, fixture, make_signing_key, run_both,
    sign_commitment, sign_digest, BUYER, BUYER_KEY, CHAIN_ID, CORE, SELLER1, SELLER1_KEY, SELLER2,
    SELLER2_KEY, TOKEN,
};

// ── Clause-key helpers ────────────────────────────────────────────
//
// The fixture's clause key is derived from its spec in `clauses/`, and
// pinned to the SDK's key; the guest reads no spec.

/// The SDK's `canonicalize`, the one canonical form of the Rust tests
/// (`prover/script/src/canonical.rs`).
#[path = "../../script/src/canonical.rs"]
mod canonical;
use canonical::canonicalize;

/// The spec file as pinned: the SDK's `canonicalize` of the whole document,
/// `block` included.
fn load_pinned_spec_json(clause_id_str: &str) -> String {
    let p = common::repo_root()
        .join("clauses")
        .join(format!("{clause_id_str}.json"));
    let raw = std::fs::read_to_string(&p).unwrap_or_else(|e| panic!("read {}: {e}", p.display()));
    let value: serde_json::Value = serde_json::from_str(&raw).expect("spec JSON");
    canonicalize(&value)
}

/// The canonical form of the spec without its top-level `block` — the
/// bytes the clause key hashes. `sdk_clause_key` pins the
/// result to the SDK's key.
fn load_spec_json(clause_id_str: &str) -> String {
    let mut value: serde_json::Value =
        serde_json::from_str(&load_pinned_spec_json(clause_id_str)).expect("spec JSON");
    value.as_object_mut().expect("spec object").remove("block");
    let canonical = canonicalize(&value);
    assert_eq!(
        keccak256(canonical.as_bytes()),
        sdk_clause_key(clause_id_str),
        "{clause_id_str}: the witness bytes hash to the clause key"
    );
    canonical
}

/// The SDK's key for a clause in `clauses/`, from the harvested
/// `test/fixtures/clause-keys.json`.
fn sdk_clause_key(clause_id_str: &str) -> B256 {
    fixture("clause-keys.json")[clause_id_str]
        .as_str()
        .unwrap_or_else(|| panic!("{clause_id_str} is not in the fixture"))
        .parse()
        .expect("bytes32")
}

/// The agreement Merkle leaf for a clause:
/// `keccak256(keccak256(clauseId ++ keccak256(clauseData)))` — double-hashed
/// for leaf/node domain separation.
fn clause_leaf(clause_key: &B256, clause_data: &str) -> B256 {
    let mut preimage = [0u8; 64];
    preimage[..32].copy_from_slice(clause_key.as_slice());
    preimage[32..].copy_from_slice(keccak256(clause_data.as_bytes()).as_slice());
    keccak256(keccak256(preimage))
}

// ── The frozen commitments ────────────────────────────────────────

/// The SDK's frozen commitment vector `label` of `eip712-vectors.json`.
fn vector_commitment(label: &str) -> Commitment {
    let fx = fixture("eip712-vectors.json");
    assert_eq!(fx["chainId"].as_u64(), Some(CHAIN_ID), "the vectors' chain");
    assert_eq!(addr(&fx["verifyingContract"]), CORE, "the vectors' Core");
    let v = fx["vectors"]
        .as_array()
        .expect("vectors")
        .iter()
        .find(|v| v["label"] == label)
        .unwrap_or_else(|| panic!("no vector {label}"));
    let c = commitment_json(&v["commitment"], "processId");
    assert_eq!(
        commitment_struct_hash(&c),
        b256(&v["structHash"]),
        "{label}: read as frozen"
    );
    c
}

/// The root order: the SDK's frozen root vector.
fn root_commitment() -> Commitment {
    vector_commitment("root")
}

/// The root order's process, derived as the Core derives it.
fn root_process_id() -> B256 {
    derive_commitment_ids(&domain_separator(CHAIN_ID, CORE), &root_commitment()).1
}

/// The second order: the SDK's frozen sub-order vector, under the root's
/// process (the vector names a process of its own).
fn sub_commitment() -> Commitment {
    Commitment {
        process_id: root_process_id(),
        ..vector_commitment("sub")
    }
}

// ── The rules crate's signer recovery ──────────────────────────────────

/// Each parity key signs for the wallet Foundry's `vm.addr` derives from it,
/// as the rules crate's `recover_signer` reads it.
#[test]
fn a_parity_key_recovers_its_pinned_address() {
    let digest = keccak256("any digest");
    for (secret, wallet) in [
        (BUYER_KEY, BUYER),
        (SELLER1_KEY, SELLER1),
        (SELLER2_KEY, SELLER2),
    ] {
        let sig = sign_digest(&make_signing_key(secret), &digest);
        assert_eq!(
            recover_signer(&digest, &sig).unwrap(),
            wallet,
            "key {secret:#x}"
        );
    }
}

// ── Full-batch mirror flows ───────────────────────────────────────

#[test]
fn test_full_batch_commit_and_state() {
    let buyer_key = make_signing_key(BUYER_KEY);
    let seller1_key = make_signing_key(SELLER1_KEY);
    let seller2_key = make_signing_key(SELLER2_KEY);
    let domain = domain_separator(CHAIN_ID, CORE);

    let root = root_commitment();
    let root_buyer_sig = sign_commitment(&root, &domain, &buyer_key);
    let root_seller_sig = sign_commitment(&root, &domain, &seller1_key);

    let sub = sub_commitment();
    let sub_buyer_sig = sign_commitment(&sub, &domain, &buyer_key);
    let sub_seller_sig = sign_commitment(&sub, &domain, &seller2_key);

    let input = BatchInput {
        chain_id: CHAIN_ID,
        verifying_contract: CORE,
        block_timestamp: 1000,
        operations: vec![
            KernelOp::Commit {
                commitment: root,
                buyer_sig: root_buyer_sig,
                seller_sig: root_seller_sig,
            },
            KernelOp::Commit {
                commitment: sub.clone(),
                buyer_sig: sub_buyer_sig,
                seller_sig: sub_seller_sig,
            },
        ],
        prev_state: empty_snapshot(),
        usage_claims: vec![],
        usage_period: 0,
    };

    let (pv, positions, _events) = run_both(&input).unwrap();

    // Verify state root changed.
    assert_ne!(pv.prev_state_root, pv.new_state_root);
    assert_eq!(pv.chain_id, CHAIN_ID);
    assert_eq!(pv.verifying_contract, CORE);

    // Verify token flows match Solidity.
    // Root commit: buyer deposits 100*2=200, seller1 deposits 100*2=200.
    // Sub commit: buyer deposits 50*2=100, seller2 deposits 150*2=300.
    // Total buyer deposits: 300 ether. Seller1: 200. Seller2: 300.
    let buyer_pos: Vec<_> = positions.iter().filter(|p| p.user == BUYER).collect();
    let s1_pos: Vec<_> = positions.iter().filter(|p| p.user == SELLER1).collect();
    let s2_pos: Vec<_> = positions.iter().filter(|p| p.user == SELLER2).collect();

    let ether = U256::from(1_000_000_000_000_000_000u64);
    assert_eq!(
        buyer_pos[0].deposit,
        U256::from(300u64) * ether,
        "buyer total deposit"
    );
    assert_eq!(
        s1_pos[0].deposit,
        U256::from(200u64) * ether,
        "seller1 deposit"
    );
    assert_eq!(
        s2_pos[0].deposit,
        U256::from(300u64) * ether,
        "seller2 deposit"
    );
}

#[test]
fn test_full_batch_commit_resolve_payouts() {
    let buyer_key = make_signing_key(BUYER_KEY);
    let seller1_key = make_signing_key(SELLER1_KEY);
    let seller2_key = make_signing_key(SELLER2_KEY);
    let domain = domain_separator(CHAIN_ID, CORE);

    let root = root_commitment();
    let sub = sub_commitment();

    let root_buyer_sig = sign_commitment(&root, &domain, &buyer_key);
    let root_seller_sig = sign_commitment(&root, &domain, &seller1_key);
    let sub_buyer_sig = sign_commitment(&sub, &domain, &buyer_key);
    let sub_seller_sig = sign_commitment(&sub, &domain, &seller2_key);

    // Sign resolve authorization over the process as it stands after both
    // commits: 100 + 50 ether.
    let resolved_value = sub.running_total;
    let resolve_hash = resolve_struct_hash(&root_process_id(), &resolved_value);
    let resolve_digest = typed_data_hash(&domain, &resolve_hash);
    let resolve_sig = sign_digest(&buyer_key, &resolve_digest);

    let input = BatchInput {
        chain_id: CHAIN_ID,
        verifying_contract: CORE,
        block_timestamp: 1000,
        operations: vec![
            KernelOp::Commit {
                commitment: root.clone(),
                buyer_sig: root_buyer_sig,
                seller_sig: root_seller_sig,
            },
            KernelOp::Commit {
                commitment: sub.clone(),
                buyer_sig: sub_buyer_sig,
                seller_sig: sub_seller_sig,
            },
            KernelOp::Resolve {
                process_id: root_process_id(),
                running_total: resolved_value,
                commitments: vec![root, sub],
                buyer_sig: resolve_sig,
            },
        ],
        prev_state: empty_snapshot(),
        usage_claims: vec![],
        usage_period: 0,
    };

    let (_pv, positions, _events) = run_both(&input).unwrap();

    let ether = U256::from(1_000_000_000_000_000_000u64);

    // Payouts must match Solidity exactly.
    // Seller1: runningTotal*2 + payment = 100*2 + 100 = 300 ether
    // Seller2: runningTotal*2 + payment = 150*2 + 50 = 350 ether
    // Buyer: payment per order = 100 + 50 = 150 ether
    let s1 = positions.iter().find(|p| p.user == SELLER1).unwrap();
    let s2 = positions.iter().find(|p| p.user == SELLER2).unwrap();
    let b = positions.iter().find(|p| p.user == BUYER).unwrap();

    assert_eq!(
        s1.payout,
        U256::from(300u64) * ether,
        "seller1 payout mismatch"
    );
    assert_eq!(
        s2.payout,
        U256::from(350u64) * ether,
        "seller2 payout mismatch"
    );
    assert_eq!(
        b.payout,
        U256::from(150u64) * ether,
        "buyer payout mismatch"
    );

    // Deposits too.
    assert_eq!(s1.deposit, U256::from(200u64) * ether, "seller1 deposit");
    assert_eq!(s2.deposit, U256::from(300u64) * ether, "seller2 deposit");
    assert_eq!(b.deposit, U256::from(300u64) * ether, "buyer deposit");
}

// ── Attestation fixtures ──────────────────────────────────────────
//
// A single-clause agreement whose one leaf commits the
// figaro-modalities clause `{"modality":"delivery"}` — so
// checkoutHash == leaf and the inclusion proof is empty, exactly the
// shape the coordinator verifies on the direct path.

const CLAUSE_DATA: &str = r#"{"modality":"delivery"}"#;

struct AttestFixture {
    clause_key: B256,
    root: Commitment,
    process_id: B256,
    root_order_hash: B256,
}

/// The single-clause agreement over the figaro-modalities clause and
/// `CLAUSE_DATA`: the order commits the one leaf, so `checkoutHash` is that
/// leaf.
fn attest_fixture() -> AttestFixture {
    // The clause key: keccak256 of the canonical spec without its `block`.
    let clause_key = keccak256(load_spec_json("figaro-modalities").as_bytes());
    let leaf = clause_leaf(&clause_key, CLAUSE_DATA);

    let root = Commitment {
        checkout_hash: leaf,
        salt: U256::from(4242u64),
        ..root_commitment()
    };
    let domain = domain_separator(CHAIN_ID, CORE);
    let struct_hash = commitment_struct_hash(&root);
    let process_id = typed_data_hash(&domain, &struct_hash);
    let root_order_hash = compute_order_hash(&process_id, &struct_hash);

    AttestFixture {
        clause_key,
        root,
        process_id,
        root_order_hash,
    }
}

/// The fixture's clause as the coordinator takes it: the committed
/// clauseData's hash and the inclusion proof (empty for the fixture's
/// single-clause agreement).
fn witness(clause_data_hash: B256, inclusion_proof: Vec<B256>) -> AttestationWitness {
    AttestationWitness {
        clause_data_hash,
        inclusion_proof,
    }
}

/// The witness of the fixture's one committed leaf.
fn committed_witness() -> AttestationWitness {
    witness(keccak256(CLAUSE_DATA.as_bytes()), vec![])
}

/// Commit the fixture's root order, then run one seller attestation op
/// built by `make_op` and return the batch result.
fn run_attest_batch(
    f: &AttestFixture,
    op: KernelOp,
) -> Result<(PublicValues, Vec<NetPosition>, BatchEvents), KernelError> {
    let buyer_key = make_signing_key(BUYER_KEY);
    let seller1_key = make_signing_key(SELLER1_KEY);
    let domain = domain_separator(CHAIN_ID, CORE);

    let buyer_sig = sign_commitment(&f.root, &domain, &buyer_key);
    let seller_sig = sign_commitment(&f.root, &domain, &seller1_key);

    let input = BatchInput {
        chain_id: CHAIN_ID,
        verifying_contract: CORE,
        block_timestamp: 1000,
        operations: vec![
            KernelOp::Commit {
                commitment: f.root.clone(),
                buyer_sig,
                seller_sig,
            },
            op,
        ],
        prev_state: empty_snapshot(),
        usage_claims: vec![],
        usage_period: 0,
    };
    run_both(&input)
}

/// A seller attestation at stage 0 on the fixture's root order carrying
/// `witness`.
fn seller_attest_op(
    f: &AttestFixture,
    witness: AttestationWitness,
    content_ref: B256,
    signer: &SigningKey,
) -> KernelOp {
    let domain = domain_separator(CHAIN_ID, CORE);
    let struct_hash = attest_seller_struct_hash(&f.root_order_hash, &f.clause_key, 0, &content_ref);
    let digest = typed_data_hash(&domain, &struct_hash);
    KernelOp::AttestAsSeller {
        target: f.root.clone(),
        clause_id: f.clause_key,
        stage: 0,
        content_ref,
        seller_sig: sign_digest(signer, &digest),
        proof: witness,
    }
}

// ── Attestation tests (current coordinator semantics) ─────────────

/// A seller attestation is accepted on the leaf's inclusion: the event
/// carries the order, the process, the attester, the clause, the stage and
/// the content reference as signed.
#[test]
fn a_seller_attestation_is_accepted_on_the_leaf_s_inclusion() {
    let f = attest_fixture();
    let content_ref = keccak256("evidence the seller keeps");
    let seller1_key = make_signing_key(SELLER1_KEY);
    let op = seller_attest_op(&f, committed_witness(), content_ref, &seller1_key);

    let (_pv, _positions, events) = run_attest_batch(&f, op).unwrap();

    assert_eq!(events.attestations.len(), 1);
    let e = &events.attestations[0];
    assert_eq!(e.order_hash, f.root_order_hash);
    assert_eq!(e.process_id, f.process_id);
    assert_eq!(e.attester, SELLER1);
    assert_eq!(e.clause_id, f.clause_key);
    assert_eq!(e.stage, 0);
    assert_eq!(e.content_ref, content_ref);
}

/// A buyer attestation on the fixture's root order carrying `witness`,
/// signed by `signer`.
fn buyer_attest_op(
    f: &AttestFixture,
    witness: AttestationWitness,
    content_ref: B256,
    signer: &SigningKey,
) -> KernelOp {
    let domain = domain_separator(CHAIN_ID, CORE);
    let struct_hash = attest_buyer_struct_hash(
        &f.process_id,
        &f.root_order_hash,
        &f.clause_key,
        0,
        &content_ref,
    );
    KernelOp::AttestAsBuyer {
        target: f.root.clone(),
        clause_id: f.clause_key,
        stage: 0,
        content_ref,
        buyer_sig: sign_digest(signer, &typed_data_hash(&domain, &struct_hash)),
        proof: witness,
    }
}

/// The buyer's attestation, likewise.
#[test]
fn a_buyer_attestation_is_accepted_on_the_leaf_s_inclusion() {
    let f = attest_fixture();
    let content_ref = keccak256("evidence the buyer keeps");
    let op = buyer_attest_op(
        &f,
        committed_witness(),
        content_ref,
        &make_signing_key(BUYER_KEY),
    );

    let (_pv, _positions, events) = run_attest_batch(&f, op).unwrap();
    assert_eq!(events.attestations.len(), 1);
    assert_eq!(events.attestations[0].attester, BUYER);
    assert_eq!(events.attestations[0].content_ref, content_ref);
}

#[test]
fn attest_as_seller_wrong_signer_fails() {
    let f = attest_fixture();
    // SELLER2 signs, but target.seller is SELLER1.
    let seller2_key = make_signing_key(SELLER2_KEY);
    let op = seller_attest_op(&f, committed_witness(), keccak256("evidence"), &seller2_key);

    match run_attest_batch(&f, op) {
        Err(KernelError::NotAuthorized) => {}
        other => panic!("expected NotAuthorized, got {other:?}"),
    }
}

#[test]
fn attest_as_buyer_wrong_signer_fails() {
    let f = attest_fixture();
    let seller1_key = make_signing_key(SELLER1_KEY); // not the buyer
    let op = buyer_attest_op(&f, committed_witness(), keccak256("evidence"), &seller1_key);

    match run_attest_batch(&f, op) {
        Err(KernelError::NotAuthorized) => {}
        other => panic!("expected NotAuthorized, got {other:?}"),
    }
}

#[test]
fn attest_wrong_inclusion_proof_fails() {
    // Commit an order whose checkoutHash does NOT contain the clause
    // leaf — the mandatory inclusion gate must reject.
    let f = attest_fixture();
    let mut stranger = f.root.clone();
    stranger.checkout_hash = keccak256("some other agreement");
    stranger.salt = U256::from(777u64);

    let domain = domain_separator(CHAIN_ID, CORE);
    let struct_hash = commitment_struct_hash(&stranger);
    let process_id = typed_data_hash(&domain, &struct_hash);
    let order_hash = compute_order_hash(&process_id, &struct_hash);

    let content_ref = keccak256("evidence");
    let seller1_key = make_signing_key(SELLER1_KEY);
    let att_struct = attest_seller_struct_hash(&order_hash, &f.clause_key, 0, &content_ref);
    let att_digest = typed_data_hash(&domain, &att_struct);

    let buyer_key = make_signing_key(BUYER_KEY);
    let input = BatchInput {
        chain_id: CHAIN_ID,
        verifying_contract: CORE,
        block_timestamp: 1000,
        operations: vec![
            KernelOp::Commit {
                commitment: stranger.clone(),
                buyer_sig: sign_commitment(&stranger, &domain, &buyer_key),
                seller_sig: sign_commitment(&stranger, &domain, &seller1_key),
            },
            KernelOp::AttestAsSeller {
                target: stranger.clone(),
                clause_id: f.clause_key,
                stage: 0,
                content_ref,
                seller_sig: sign_digest(&seller1_key, &att_digest),
                proof: committed_witness(),
            },
        ],
        prev_state: empty_snapshot(),
        usage_claims: vec![],
        usage_period: 0,
    };

    match run_both(&input) {
        Err(KernelError::InvalidInclusionProof) => {}
        other => panic!("expected InvalidInclusionProof, got {other:?}"),
    }
}

/// A clauseData hash the agreement never committed opens no leaf.
#[test]
fn an_attestation_with_a_wrong_clause_data_hash_is_refused() {
    let f = attest_fixture();
    let seller1_key = make_signing_key(SELLER1_KEY);
    let witness = witness(keccak256(r#"{"modality":"pickup"}"#.as_bytes()), vec![]);
    let op = seller_attest_op(&f, witness, keccak256("evidence"), &seller1_key);

    match run_attest_batch(&f, op) {
        Err(KernelError::InvalidInclusionProof) => {}
        other => panic!("expected InvalidInclusionProof, got {other:?}"),
    }
}

/// A proof that does not open the committed leaf against the signed
/// checkoutHash is refused.
#[test]
fn an_attestation_with_a_wrong_inclusion_proof_is_refused() {
    let f = attest_fixture();
    let seller1_key = make_signing_key(SELLER1_KEY);
    let witness = witness(
        keccak256(CLAUSE_DATA.as_bytes()),
        vec![keccak256("a sibling nobody committed")],
    );
    let op = seller_attest_op(&f, witness, keccak256("evidence"), &seller1_key);

    match run_attest_batch(&f, op) {
        Err(KernelError::InvalidInclusionProof) => {}
        other => panic!("expected InvalidInclusionProof, got {other:?}"),
    }
}

#[test]
fn attest_on_resolved_order_fails() {
    // The evidence window closes at resolution — the coordinator's
    // OrderAlreadyResolved gate, mirrored in the batch.
    let f = attest_fixture();
    let buyer_key = make_signing_key(BUYER_KEY);
    let seller1_key = make_signing_key(SELLER1_KEY);
    let domain = domain_separator(CHAIN_ID, CORE);

    let resolve_hash = resolve_struct_hash(&f.process_id, &f.root.payment);
    let resolve_sig = sign_digest(&buyer_key, &typed_data_hash(&domain, &resolve_hash));

    let content_ref = keccak256("evidence");
    let att_struct = attest_seller_struct_hash(&f.root_order_hash, &f.clause_key, 0, &content_ref);
    let att_sig = sign_digest(&seller1_key, &typed_data_hash(&domain, &att_struct));

    let input = BatchInput {
        chain_id: CHAIN_ID,
        verifying_contract: CORE,
        block_timestamp: 1000,
        operations: vec![
            KernelOp::Commit {
                commitment: f.root.clone(),
                buyer_sig: sign_commitment(&f.root, &domain, &buyer_key),
                seller_sig: sign_commitment(&f.root, &domain, &seller1_key),
            },
            KernelOp::Resolve {
                process_id: f.process_id,
                running_total: f.root.payment,
                commitments: vec![f.root.clone()],
                buyer_sig: resolve_sig,
            },
            KernelOp::AttestAsSeller {
                target: f.root.clone(),
                clause_id: f.clause_key,
                stage: 0,
                content_ref,
                seller_sig: att_sig,
                proof: committed_witness(),
            },
        ],
        prev_state: empty_snapshot(),
        usage_claims: vec![],
        usage_period: 0,
    };

    match run_both(&input) {
        Err(KernelError::OrderAlreadyResolved) => {}
        other => panic!("expected OrderAlreadyResolved, got {other:?}"),
    }
}

#[test]
fn attest_as_seller_against_another_sellers_order_fails() {
    // SELLER2 holds a committed sub-order in the process and signs a
    // seller attestation against the ROOT order, whose seller is SELLER1.
    // A seller attests only about its own order: NotAuthorized.
    let f = attest_fixture();
    let buyer_key = make_signing_key(BUYER_KEY);
    let seller1_key = make_signing_key(SELLER1_KEY);
    let seller2_key = make_signing_key(SELLER2_KEY);
    let domain = domain_separator(CHAIN_ID, CORE);

    let sub = Commitment {
        process_id: f.process_id,
        buyer: BUYER,
        seller: SELLER2,
        token: TOKEN,
        payment: U256::from(50_000_000_000_000_000_000u128),
        running_total: U256::from(150_000_000_000_000_000_000u128),
        checkout_hash: keccak256("sub-agreement"),
        salt: U256::from(43u64),
        commit_deadline: U256::from(2000u64),
    };

    let content_ref = keccak256("evidence");
    let att_struct = attest_seller_struct_hash(&f.root_order_hash, &f.clause_key, 0, &content_ref);
    let att_sig = sign_digest(&seller2_key, &typed_data_hash(&domain, &att_struct));

    let input = BatchInput {
        chain_id: CHAIN_ID,
        verifying_contract: CORE,
        block_timestamp: 1000,
        operations: vec![
            KernelOp::Commit {
                commitment: f.root.clone(),
                buyer_sig: sign_commitment(&f.root, &domain, &buyer_key),
                seller_sig: sign_commitment(&f.root, &domain, &seller1_key),
            },
            KernelOp::Commit {
                commitment: sub.clone(),
                buyer_sig: sign_commitment(&sub, &domain, &buyer_key),
                seller_sig: sign_commitment(&sub, &domain, &seller2_key),
            },
            KernelOp::AttestAsSeller {
                target: f.root.clone(),
                clause_id: f.clause_key,
                stage: 0,
                content_ref,
                seller_sig: att_sig,
                proof: committed_witness(),
            },
        ],
        prev_state: empty_snapshot(),
        usage_claims: vec![],
        usage_period: 0,
    };

    match run_both(&input) {
        Err(KernelError::NotAuthorized) => {}
        other => panic!("expected NotAuthorized, got {other:?}"),
    }
}

// ── The boundaries a mutant crosses unseen ────────────────────────

fn commit_at(timestamp: u64) -> Result<(PublicValues, Vec<NetPosition>, BatchEvents), KernelError> {
    let domain = domain_separator(CHAIN_ID, CORE);
    let root = root_commitment();
    let input = BatchInput {
        chain_id: CHAIN_ID,
        verifying_contract: CORE,
        block_timestamp: timestamp,
        operations: vec![KernelOp::Commit {
            buyer_sig: sign_commitment(&root, &domain, &make_signing_key(BUYER_KEY)),
            seller_sig: sign_commitment(&root, &domain, &make_signing_key(SELLER1_KEY)),
            commitment: root,
        }],
        prev_state: empty_snapshot(),
        usage_claims: vec![],
        usage_period: 0,
    };
    run_both(&input)
}

#[test]
fn a_commitment_lives_through_its_deadline_and_not_one_second_past() {
    // FigaroCore: `if (c.commitDeadline < block.timestamp) revert DeadlineExpired()`.
    let deadline: u64 = root_commitment().commit_deadline.try_into().unwrap();
    assert!(commit_at(deadline - 1).is_ok(), "before the deadline");
    assert!(
        commit_at(deadline).is_ok(),
        "AT the deadline the commitment is live"
    );
    match commit_at(deadline + 1) {
        Err(KernelError::DeadlineExpired) => {}
        other => panic!("expected DeadlineExpired one second past, got {other:?}"),
    }
}

#[test]
fn an_attestation_on_an_order_nobody_committed_is_an_unknown_order() {
    // The coordinator's `_requireKnownCommitment`: status 0 is no order at
    // all, and must not read as a resolved one.
    let f = attest_fixture();
    let op = seller_attest_op(
        &f,
        committed_witness(),
        keccak256("evidence"),
        &make_signing_key(SELLER1_KEY),
    );
    let input = BatchInput {
        chain_id: CHAIN_ID,
        verifying_contract: CORE,
        block_timestamp: 1000,
        operations: vec![op],
        prev_state: empty_snapshot(),
        usage_claims: vec![],
        usage_period: 0,
    };
    match run_both(&input) {
        Err(KernelError::UnknownOrder) => {}
        other => panic!("expected UnknownOrder, got {other:?}"),
    }
}

#[test]
fn the_state_root_binds_every_map_it_covers() {
    use figaro_kernel::state::KernelState;
    // The verifier chains batches by this root: a map the root does not
    // bind is state a prover may rewrite between batches.
    let domain = domain_separator(CHAIN_ID, CORE);
    let (root_order_hash, _) = derive_commitment_ids(&domain, &root_commitment());
    let (sub_order_hash, _) = derive_commitment_ids(&domain, &sub_commitment());
    let base = {
        let mut s = empty_snapshot();
        s.processes = vec![(
            root_process_id(),
            ProcessState {
                root_buyer: BUYER,
                token: TOKEN,
                running_total: U256::from(100u64),
                active_order_count: 1,
            },
        )];
        s.order_status = vec![(root_order_hash, 1)];
        s
    };
    let root_of = |s: &KernelStateSnapshot| KernelState::from_snapshot(s).compute_root();
    let base_root = root_of(&base);
    assert_ne!(
        base_root,
        root_of(&empty_snapshot()),
        "a populated state is not the empty one"
    );

    let mut cases: Vec<(&str, KernelStateSnapshot)> = Vec::new();
    let mut s = base.clone();
    s.processes[0].1.running_total = U256::from(101u64);
    cases.push(("a process's cumulative value", s));
    let mut s = base.clone();
    s.processes[0].1.active_order_count = 0;
    cases.push(("a process's active count", s));
    let mut s = base.clone();
    s.processes[0].1.root_buyer = SELLER1;
    cases.push(("a process's buyer", s));
    let mut s = base.clone();
    s.processes[0].1.token = CORE;
    cases.push(("a process's token", s));
    let mut s = base.clone();
    s.processes[0].0 = keccak256("another process");
    cases.push(("a process's id", s));
    let mut s = base.clone();
    s.order_status[0].1 = 2;
    cases.push(("an order's status", s));
    let mut s = base.clone();
    s.order_status[0].0 = sub_order_hash;
    cases.push(("which order carries the status", s));

    let mut roots = std::collections::BTreeSet::new();
    roots.insert(base_root);
    for (what, snapshot) in &cases {
        let root = root_of(snapshot);
        assert_ne!(root, base_root, "the root binds {what}");
        assert!(
            roots.insert(root),
            "changing {what} yields a root of its own"
        );
    }

    // Insertion order is not state: the maps are ordered by key.
    let mut two = base.clone();
    two.order_status.push((sub_order_hash, 1));
    let mut two_reversed = two.clone();
    two_reversed.order_status.reverse();
    assert_eq!(
        root_of(&two),
        root_of(&two_reversed),
        "the root ignores insertion order"
    );
}

// ── Determinism ───────────────────────────────────────────────────

/// The empty state's root is the one `FigaroBatchVerifier.genesisRoot()`
/// returns, `bytes32(0)`: a verifier starts on the root the guest's first
/// batch names as its previous root.
#[test]
fn the_empty_state_s_root_is_the_verifier_s_genesis_root() {
    use figaro_kernel::state::KernelState;
    assert_eq!(KernelState::new().compute_root(), B256::ZERO);
    assert_eq!(
        KernelState::from_snapshot(&empty_snapshot()).compute_root(),
        B256::ZERO
    );
}

#[test]
fn a_bond_accumulation_overflow_is_rejected_not_a_panic() {
    // A self-dealing commit (buyer == seller) with a huge payment: each bond
    // fits U256 (2 * 2^254 = 2^255) but both accumulate under the same
    // (token, user) to 2^256. Before the fix the TokenTracker `.expect()`
    // PANICKED here, crashing the sequencer's batch loop for free; now it is a
    // clean KernelError::Overflow that the batch rejects.
    let key = make_signing_key(BUYER_KEY);
    let domain = domain_separator(CHAIN_ID, CORE);
    let huge = U256::from(1u8) << 254;
    let c = Commitment {
        process_id: B256::ZERO,
        buyer: BUYER,
        seller: BUYER,
        token: TOKEN,
        payment: huge,
        running_total: huge,
        checkout_hash: keccak256("overflow"),
        salt: U256::from(1u64),
        commit_deadline: U256::from(1_000_000u64),
    };
    let sig = sign_commitment(&c, &domain, &key);
    let input = BatchInput {
        chain_id: CHAIN_ID,
        verifying_contract: CORE,
        block_timestamp: 1000,
        operations: vec![KernelOp::Commit {
            commitment: c,
            buyer_sig: sig.clone(),
            seller_sig: sig,
        }],
        prev_state: empty_snapshot(),
        usage_claims: vec![],
        usage_period: 0,
    };
    let result = run_both(&input);
    assert!(
        matches!(result, Err(KernelError::Overflow)),
        "expected a clean Overflow error, got {result:?}",
    );
}

// ── Agreement and assembly claims against the SDK's vectors ───────
//
// Each agreement of `test/fixtures/assembly-vectors.json` is
// instantiated as one order whose agreement carries the agreement's
// provenance leaf (as the lone leaf, so the inclusion proof is empty), then
// committed, resolved and claimed for its agreement (kind 2) and its
// assembly (kind 1) with the SDK's frozen membership proof.

fn assembly_vectors() -> serde_json::Value {
    let mut p = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    p.pop();
    p.pop();
    p.push("test/fixtures/assembly-vectors.json");
    let text = std::fs::read_to_string(&p).unwrap_or_else(|e| panic!("read {}: {e}", p.display()));
    serde_json::from_str(&text).expect("fixture JSON")
}

fn hex32(v: &serde_json::Value) -> B256 {
    v.as_str().expect("hex").parse().expect("bytes32")
}

/// A resolved order under `checkout_hash`, and the batch's operations.
fn resolved_order_under(checkout_hash: B256, salt: u64) -> (Commitment, Vec<KernelOp>) {
    let buyer_key = make_signing_key(BUYER_KEY);
    let seller_key = make_signing_key(SELLER1_KEY);
    let domain = domain_separator(CHAIN_ID, CORE);
    let order = Commitment {
        process_id: B256::ZERO,
        buyer: BUYER,
        seller: SELLER1,
        token: TOKEN,
        payment: U256::from(100u64),
        running_total: U256::from(100u64),
        checkout_hash,
        salt: U256::from(salt),
        commit_deadline: U256::from(2000u64),
    };
    let process_id = typed_data_hash(&domain, &commitment_struct_hash(&order));
    let ops = vec![
        KernelOp::Commit {
            commitment: order.clone(),
            buyer_sig: sign_commitment(&order, &domain, &buyer_key),
            seller_sig: sign_commitment(&order, &domain, &seller_key),
        },
        KernelOp::Resolve {
            process_id,
            running_total: order.payment,
            commitments: vec![order.clone()],
            buyer_sig: sign_digest(
                &buyer_key,
                &typed_data_hash(&domain, &resolve_struct_hash(&process_id, &order.payment)),
            ),
        },
    ];
    (order, ops)
}

fn claims_batch(ops: Vec<KernelOp>, claims: Vec<UsageClaim>) -> BatchInput {
    BatchInput {
        chain_id: CHAIN_ID,
        verifying_contract: CORE,
        block_timestamp: 1000,
        operations: ops,
        prev_state: empty_snapshot(),
        usage_claims: claims,
        usage_period: 0,
    }
}

fn kind2(order: &Commitment, entry: &serde_json::Value) -> UsageClaim {
    UsageClaim {
        order: order.clone(),
        clause_or_process: hex32(&entry["agreementHash"]),
        kind: UsageClaimKind::Agreement {
            process_design_hash: hex32(&entry["provenance"]["processDesignHash"]),
        },
        inclusion_proof: vec![],
    }
}

fn kind1(
    order: &Commitment,
    composition: B256,
    agreement_hash: B256,
    agreement_content_hash: B256,
    proof: Vec<B256>,
) -> UsageClaim {
    UsageClaim {
        order: order.clone(),
        clause_or_process: composition,
        kind: UsageClaimKind::Process {
            agreement_hash,
            agreement_content_hash,
            membership_proof: proof,
        },
        inclusion_proof: vec![],
    }
}

fn proof_list(v: &serde_json::Value) -> Vec<B256> {
    v.as_array().expect("proof").iter().map(hex32).collect()
}

#[test]
fn every_vector_agreement_credits_its_agreement_and_its_assembly() {
    let fx = assembly_vectors();
    let mut salt = 1000u64;
    for assembly in fx["assemblies"].as_array().unwrap() {
        let composition = hex32(&assembly["processDesignHash"]);
        for entry in assembly["agreements"].as_array().unwrap() {
            salt += 1;
            let (order, ops) = resolved_order_under(hex32(&entry["provenance"]["leaf"]), salt);
            let claims = vec![
                kind2(&order, entry),
                kind1(
                    &order,
                    composition,
                    hex32(&entry["agreementHash"]),
                    hex32(&entry["agreementContentHash"]),
                    proof_list(&entry["membershipProof"]),
                ),
            ];
            let (_, _, events) = run_both(&claims_batch(ops, claims))
                .unwrap_or_else(|e| panic!("{} {}: {e}", assembly["label"], entry["id"]));
            let mut got: Vec<(B256, u8)> = events
                .uses
                .iter()
                .map(|u| (u.clause_or_process, u.kind))
                .collect();
            got.sort();
            let mut want = vec![
                (hex32(&entry["agreementHash"]), USAGE_KIND_AGREEMENT),
                (composition, USAGE_KIND_PROCESS),
            ];
            want.sort();
            assert_eq!(got, want);
        }
    }
}

/// An agreement's membership proof taken from another assembly that holds
/// the same agreement opens nothing under the claimed root.
#[test]
fn a_vector_membership_proof_from_another_assembly_is_refused() {
    let fx = assembly_vectors();
    let assemblies = fx["assemblies"].as_array().unwrap();
    // `two-entries` agreement-1 and `one-entry` agreement-0 both bind the one-clause agreement.
    let two = &assemblies[1];
    let one = &assemblies[0];
    let entry = &two["agreements"][1];
    assert_eq!(
        entry["agreementHash"],
        one["agreements"][0]["agreementHash"]
    );
    let (order, ops) = resolved_order_under(hex32(&entry["provenance"]["leaf"]), 1);
    let claim = kind1(
        &order,
        hex32(&two["processDesignHash"]),
        hex32(&entry["agreementHash"]),
        hex32(&one["agreements"][0]["agreementContentHash"]),
        proof_list(&one["agreements"][0]["membershipProof"]),
    );
    match run_both(&claims_batch(ops, vec![claim])).map(|_| ()) {
        Err(KernelError::UsageInvalidInclusionProof) => {}
        other => panic!("expected UsageInvalidInclusionProof, got {other:?}"),
    }
}

/// A kind-2 claim naming the wrong agreementHash against a vector's
/// provenance leaf derives other bytes and opens nothing.
#[test]
fn a_vector_agreement_claim_with_the_wrong_agreement_hash_is_refused() {
    let fx = assembly_vectors();
    let entry = &fx["assemblies"][2]["agreements"][2];
    let (order, ops) = resolved_order_under(hex32(&entry["provenance"]["leaf"]), 1);
    let mut claim = kind2(&order, entry);
    claim.clause_or_process = hex32(&fx["assemblies"][2]["agreements"][0]["agreementHash"]);
    match run_both(&claims_batch(ops, vec![claim])).map(|_| ()) {
        Err(KernelError::UsageInvalidInclusionProof) => {}
        other => panic!("expected UsageInvalidInclusionProof, got {other:?}"),
    }
}

/// The vector's terms leaf IS a leaf of its assembly root — its sorted-pair
/// proof opens — yet an assembly claim passing it as an agreement (the
/// terms key as agreementHash, the terms bytes' hash as the order-entry content) is
/// refused by its key: the terms leaf is not an agreement.
#[test]
fn the_vector_terms_leaf_never_passes_as_an_agreement() {
    let fx = assembly_vectors();
    let assembly = &fx["assemblies"][2];
    let composition = hex32(&assembly["processDesignHash"]);
    let terms = &assembly["terms"];
    let terms_leaf = hex32(&terms["leaf"]);

    // The terms leaf's proof: its sibling is the agreement whose proof
    // begins with the terms leaf; the rest of that agreement's path follows.
    let sibling = assembly["agreements"]
        .as_array()
        .unwrap()
        .iter()
        .find(|s| hex32(&s["membershipProof"][0]) == terms_leaf)
        .expect("an agreement pairs with the terms leaf");
    let mut proof = vec![hex32(&sibling["leaf"])];
    proof.extend(proof_list(&sibling["membershipProof"]).into_iter().skip(1));
    assert!(
        figaro_kernel::merkle::verify_inclusion(&proof, composition, terms_leaf),
        "the terms leaf is a leaf of the root"
    );

    let terms_key = hex32(&terms["leafKey"]);
    let bytes = figaro_kernel::kernel::provenance_leaf_bytes(&terms_key, &composition);
    let mut preimage = [0u8; 64];
    preimage[..32].copy_from_slice(keccak256(b"figaro-agreement-provenance").as_slice());
    preimage[32..].copy_from_slice(keccak256(&bytes).as_slice());
    let (order, ops) = resolved_order_under(keccak256(keccak256(preimage)), 1);
    let claim = kind1(
        &order,
        composition,
        terms_key,
        hex32(&terms["clauseDataHash"]),
        proof,
    );
    match run_both(&claims_batch(ops, vec![claim])).map(|_| ()) {
        Err(KernelError::ReservedKeyIsNotARegistration(k)) => assert_eq!(k, terms_key),
        other => panic!("expected ReservedKeyIsNotARegistration, got {other:?}"),
    }
}

// ── The resolve authorization binds the state it was given for ────

/// The two commits and a resolve of the process they form, the resolve
/// signed over `signed_value` and carrying it.
fn two_commits_then_resolve(signed_value: U256) -> BatchInput {
    let buyer_key = make_signing_key(BUYER_KEY);
    let seller1_key = make_signing_key(SELLER1_KEY);
    let seller2_key = make_signing_key(SELLER2_KEY);
    let domain = domain_separator(CHAIN_ID, CORE);
    let root = root_commitment();
    let sub = sub_commitment();
    let resolve_sig = sign_digest(
        &buyer_key,
        &typed_data_hash(
            &domain,
            &resolve_struct_hash(&root_process_id(), &signed_value),
        ),
    );
    BatchInput {
        chain_id: CHAIN_ID,
        verifying_contract: CORE,
        block_timestamp: 1000,
        operations: vec![
            KernelOp::Commit {
                commitment: root.clone(),
                buyer_sig: sign_commitment(&root, &domain, &buyer_key),
                seller_sig: sign_commitment(&root, &domain, &seller1_key),
            },
            KernelOp::Commit {
                commitment: sub.clone(),
                buyer_sig: sign_commitment(&sub, &domain, &buyer_key),
                seller_sig: sign_commitment(&sub, &domain, &seller2_key),
            },
            KernelOp::Resolve {
                process_id: root_process_id(),
                running_total: signed_value,
                commitments: vec![root, sub],
                buyer_sig: resolve_sig,
            },
        ],
        prev_state: empty_snapshot(),
        usage_claims: vec![],
        usage_period: 0,
    }
}

/// The buyer signs a resolve while the process holds the root order alone
/// (cumulative value 100 ether); a second order the buyer co-signs commits
/// after (150 ether); applying the earlier authorization is refused, so the
/// second seller is never paid from an acceptance the buyer gave for the
/// root order alone.
#[test]
fn a_resolve_signed_before_a_later_commit_is_refused() {
    let signed = root_commitment().running_total;
    let current = sub_commitment().running_total;
    match run_both(&two_commits_then_resolve(signed)) {
        Err(KernelError::StaleResolveAuthorization {
            signed: s,
            current: c,
        }) => {
            assert_eq!(s, signed, "the value the buyer signed");
            assert_eq!(c, current, "the value the process holds at application");
        }
        other => panic!("expected StaleResolveAuthorization, got {other:?}"),
    }
}

/// A resolve signed over the process's running total at application
/// resolves both orders.
#[test]
fn a_resolve_signed_over_the_current_running_total_resolves() {
    let current = sub_commitment().running_total;
    let (_pv, positions, _events) = run_both(&two_commits_then_resolve(current)).expect("resolves");
    let s2 = positions.iter().find(|p| p.user == SELLER2).unwrap();
    let ether = U256::from(1_000_000_000_000_000_000u64);
    assert_eq!(
        s2.payout,
        U256::from(350u64) * ether,
        "the second seller is paid"
    );
}

/// A relay that rewrites the signed value to the process's current one
/// presents a value the buyer never signed: the signature recovers another
/// signer and the resolve is refused.
#[test]
fn a_resolve_whose_signed_value_was_rewritten_is_refused() {
    let mut input = two_commits_then_resolve(root_commitment().running_total);
    if let KernelOp::Resolve { running_total, .. } = &mut input.operations[2] {
        *running_total = sub_commitment().running_total;
    }
    match run_both(&input) {
        Err(KernelError::NotProcessBuyer) | Err(KernelError::InvalidSignature) => {}
        other => panic!("expected the signer check to refuse, got {other:?}"),
    }
}

// ── The second form: an authorization the buyer's wallet code validates ──

/// The two commits and a resolve of the process they form, authorized by
/// bytes the buyer's own account code validates (ERC-1271) rather than by
/// the buyer's ECDSA signature: the form a wallet whose key is lost resolves
/// with through code it installed while it held the key.
fn two_commits_then_wallet_code_resolve(value: U256, authorization: &[u8]) -> BatchInput {
    let mut input = two_commits_then_resolve(value);
    let KernelOp::Resolve {
        process_id,
        running_total,
        commitments,
        ..
    } = input.operations.pop().unwrap()
    else {
        unreachable!("the fixture's third operation is the resolve")
    };
    input.operations.push(KernelOp::ResolveByWalletCode {
        process_id,
        running_total,
        commitments,
        authorization: alloy_primitives::Bytes::copy_from_slice(authorization),
    });
    input
}

/// The guest cannot run the wallet's code, so it accepts a wallet-code
/// resolve on the process, the value and the order list alone, pays it out
/// as the first form, and publishes the authorization bytes in the
/// operation stream (public value 8), where `FigaroBatchVerifier` checks
/// them against the buyer's code at resolution.
#[test]
fn a_wallet_code_resolve_is_accepted_and_published_in_the_operation_stream() {
    let current = sub_commitment().running_total;
    let authorization = b"guardian-approval".to_vec();
    let input = two_commits_then_wallet_code_resolve(current, &authorization);
    let (pv, positions, _events) = run_both(&input).expect("a wallet-code resolve applies");
    let s2 = positions.iter().find(|p| p.user == SELLER2).unwrap();
    let ether = U256::from(1_000_000_000_000_000_000u64);
    assert_eq!(
        s2.payout,
        U256::from(350u64) * ether,
        "the second seller is paid"
    );
    let stream = figaro_kernel::operation_stream::encode_operation_stream(&input.operations, &[]);
    assert_eq!(
        pv.operations_hash,
        keccak256(&stream),
        "the stream the guest commits carries the entry"
    );
    let (ops, _, _) =
        figaro_kernel::operation_stream::decode_operation_stream(&stream).expect("decodes");
    match &ops[2] {
        KernelOp::ResolveByWalletCode {
            process_id,
            running_total,
            authorization: a,
            ..
        } => {
            assert_eq!(*process_id, root_process_id());
            assert_eq!(*running_total, current);
            assert_eq!(
                a.as_ref(),
                authorization.as_slice(),
                "the bytes the verifier hands the buyer's code"
            );
        }
        other => panic!("expected the wallet-code resolve, got {other:?}"),
    }
}

/// The wallet-code form binds the state as the first form does: bytes given
/// for the root order's value, applied after a second order commits, are
/// refused before any payout.
#[test]
fn a_wallet_code_resolve_for_a_passed_value_is_refused() {
    let signed = root_commitment().running_total;
    match run_both(&two_commits_then_wallet_code_resolve(
        signed,
        b"guardian-approval",
    )) {
        Err(KernelError::StaleResolveAuthorization { signed: s, .. }) => assert_eq!(s, signed),
        other => panic!("expected StaleResolveAuthorization, got {other:?}"),
    }
}

// ── The wallet-code attestation: bytes the party's own code validates ──
//
// On the direct path an attestation is `msg.sender == target.seller` (or
// `target.buyer`), so code the party's wallet installed while it held its key
// attests after the key is lost. The batch path's wallet-code form carries
// bytes the party's code validates for the signed form's digest: the guest
// runs every check of the signed form but the recovery, keeps the attestation
// out of the attestation events, and publishes one `0x05` entry the verifier
// asks the party's code about.

fn wallet_code_attest_op(
    f: &AttestFixture,
    role: AttesterRole,
    authorization: &[u8],
) -> (KernelOp, B256) {
    let content_ref = keccak256("evidence the party's code attests");
    (
        KernelOp::AttestByWalletCode {
            role,
            target: f.root.clone(),
            clause_id: f.clause_key,
            stage: 0,
            content_ref,
            authorization: alloy_primitives::Bytes::copy_from_slice(authorization),
            proof: committed_witness(),
        },
        content_ref,
    )
}

/// Each `0x05` entry the guest publishes is one wallet-code attestation, and
/// the party its role byte names is the role's party of the target order:
/// the seller for the seller's form, the buyer for the buyer's.
#[test]
fn each_wallet_code_attestation_is_one_0x05_entry_naming_the_role_s_party() {
    let f = attest_fixture();
    for (role, party) in [
        (AttesterRole::Seller, SELLER1),
        (AttesterRole::Buyer, BUYER),
    ] {
        let authorization = b"guardian-approval".to_vec();
        let (op, content_ref) = wallet_code_attest_op(&f, role, &authorization);
        let ops = vec![
            KernelOp::Commit {
                commitment: f.root.clone(),
                buyer_sig: sign_commitment(
                    &f.root,
                    &domain_separator(CHAIN_ID, CORE),
                    &make_signing_key(BUYER_KEY),
                ),
                seller_sig: sign_commitment(
                    &f.root,
                    &domain_separator(CHAIN_ID, CORE),
                    &make_signing_key(SELLER1_KEY),
                ),
            },
            op,
        ];
        let (pv, _positions, events) =
            run_attest_batch(&f, ops[1].clone()).expect("the wallet-code form applies");
        assert!(
            events.attestations.is_empty(),
            "public value 5 carries the signed attestations only"
        );

        let stream = figaro_kernel::operation_stream::encode_operation_stream(&ops, &[]);
        assert_eq!(
            pv.operations_hash,
            keccak256(&stream),
            "public value 8 binds the entry"
        );
        let (decoded_ops, entries, claims) =
            figaro_kernel::operation_stream::decode_operation_stream(&stream).expect("decodes");
        assert_eq!(decoded_ops.len(), 1, "the commit");
        assert!(claims.is_empty());
        assert_eq!(
            entries.len(),
            1,
            "one 0x05 entry for one wallet-code attestation"
        );
        let e = &entries[0];
        assert_eq!(e.role, role);
        assert_eq!(
            e.role.party(&e.target),
            party,
            "the role's party is the attester"
        );
        assert_eq!(
            commitment_struct_hash(&e.target),
            commitment_struct_hash(&f.root)
        );
        assert_eq!(
            (e.clause_id, e.stage, e.content_ref),
            (f.clause_key, 0, content_ref)
        );
        assert_eq!(
            e.authorization.as_ref(),
            authorization.as_slice(),
            "the bytes the verifier hands the code"
        );
        assert_eq!(
            figaro_kernel::operation_stream::encode_stream_parts(&decoded_ops, &entries, &claims),
            stream,
            "decoding and re-encoding gives back the same bytes"
        );
    }
}

/// The wallet-code form runs every gate of the signed form but the
/// recovery: an order nobody committed, and a leaf the signed agreement
/// does not hold, are refused as they are under a signature.
#[test]
fn a_wallet_code_attestation_runs_the_signed_form_s_gates() {
    let f = attest_fixture();
    let (op, _) = wallet_code_attest_op(&f, AttesterRole::Seller, b"guardian-approval");
    let input = BatchInput {
        chain_id: CHAIN_ID,
        verifying_contract: CORE,
        block_timestamp: 1000,
        operations: vec![op],
        prev_state: empty_snapshot(),
        usage_claims: vec![],
        usage_period: 0,
    };
    match run_both(&input) {
        Err(KernelError::UnknownOrder) => {}
        other => panic!(
            "an attestation on an order nobody committed: expected UnknownOrder, got {other:?}"
        ),
    }

    let (mut op, _) = wallet_code_attest_op(&f, AttesterRole::Buyer, b"guardian-approval");
    if let KernelOp::AttestByWalletCode { proof, .. } = &mut op {
        *proof = witness(keccak256(b"a clause the agreement does not hold"), vec![]);
    }
    match run_attest_batch(&f, op) {
        Err(KernelError::InvalidInclusionProof) => {}
        other => panic!(
            "a leaf the agreement does not hold: expected InvalidInclusionProof, got {other:?}"
        ),
    }
}
