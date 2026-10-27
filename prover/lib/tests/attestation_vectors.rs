//! The attestation lock: a hash-only batched attestation re-emits the
//! coordinator's event, byte for byte.
//!
//! `test/core/attestation/AttestationVectorsTest.t.sol` runs three direct
//! attestations on `AttestationCoordinator` over one order of a three-leaf
//! agreement (a seller's on a clause, the buyer's on another at stage 1, the
//! buyer's on the reserved provenance leaf) and writes each call's arguments
//! and the log it emitted to `test/fixtures/attestation-vectors.json`. This
//! file commits the same order through the mirror, submits the same
//! arguments as `AttestationWitness::HashOnly` attestations — the
//! `clauseDataHash`, the inclusion proof and the `contentRef`, nothing
//! else — and asserts that each event the guest commits encodes to the
//! coordinator's topics and data, and that no spec binding is committed.
use std::str::FromStr;

use alloy_primitives::{keccak256, Address, B256, U256};
use k256::ecdsa::SigningKey;

use figaro_kernel::eip712::*;
use figaro_kernel::kernel::{apply_batch, compute_spec_bindings_hash};
use figaro_kernel::types::*;

const BUYER_KEY: u64 = 0xB0B;
const SELLER1_KEY: u64 = 0x5E11;

fn fixture() -> serde_json::Value {
    let mut p = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    p.pop(); // prover/
    p.pop(); // repo root
    p.push("test/fixtures/attestation-vectors.json");
    let text = std::fs::read_to_string(&p).unwrap_or_else(|e| panic!("read {}: {e}", p.display()));
    serde_json::from_str(&text).expect("fixture JSON")
}

fn s(v: &serde_json::Value) -> &str {
    v.as_str().expect("string field")
}
fn b256(v: &serde_json::Value) -> B256 {
    B256::from_str(s(v)).expect("bytes32")
}
fn addr(v: &serde_json::Value) -> Address {
    Address::from_str(s(v)).expect("address")
}
fn u256(v: &serde_json::Value) -> U256 {
    U256::from_str_radix(s(v), 10).expect("decimal uint")
}
fn words(v: &serde_json::Value) -> Vec<B256> {
    v.as_array().expect("array").iter().map(b256).collect()
}
fn hex_bytes(v: &serde_json::Value) -> Vec<u8> {
    let hex = s(v).trim_start_matches("0x");
    (0..hex.len()).step_by(2).map(|i| u8::from_str_radix(&hex[i..i + 2], 16).expect("hex")).collect()
}

fn make_signing_key(secret: u64) -> SigningKey {
    let mut bytes = [0u8; 32];
    bytes[24..].copy_from_slice(&secret.to_be_bytes());
    SigningKey::from_bytes((&bytes).into()).unwrap()
}

fn sign_digest(key: &SigningKey, digest: &B256) -> Signature {
    use k256::ecdsa::{signature::hazmat::PrehashSigner, RecoveryId};
    let (sig, recid): (k256::ecdsa::Signature, RecoveryId) = key.sign_prehash(digest.as_slice()).unwrap();
    let bytes = sig.to_bytes();
    Signature { v: recid.to_byte() + 27, r: B256::from_slice(&bytes[..32]), s: B256::from_slice(&bytes[32..]) }
}

/// The `Attestation` event as the EVM logs it: the signature and the three
/// indexed words as topics, the three unindexed words as data.
fn encode_log(e: &AttestationEventData) -> (Vec<B256>, Vec<u8>) {
    let signature = keccak256(b"Attestation(bytes32,bytes32,address,bytes32,uint8,bytes32)");
    let mut attester = [0u8; 32];
    attester[12..].copy_from_slice(e.attester.as_slice());
    let topics = vec![signature, e.order_hash, e.process_id, B256::from(attester)];
    let mut data = Vec::with_capacity(96);
    data.extend_from_slice(e.clause_id.as_slice());
    let mut stage = [0u8; 32];
    stage[31] = e.stage;
    data.extend_from_slice(&stage);
    data.extend_from_slice(e.content_ref.as_slice());
    (topics, data)
}

#[test]
fn a_hash_only_batched_attestation_emits_the_coordinator_s_event_bytes() {
    let fx = fixture();
    let chain_id: u64 = s(&fx["chainId"]).parse().unwrap();
    let core = addr(&fx["verifyingContract"]);
    let domain = domain_separator(chain_id, core);
    let buyer_key = make_signing_key(BUYER_KEY);
    let seller_key = make_signing_key(SELLER1_KEY);

    let order = Commitment {
        process_id: B256::ZERO,
        buyer: addr(&fx["buyer"]),
        seller: addr(&fx["seller"]),
        currency: addr(&fx["currency"]),
        payment: u256(&fx["payment"]),
        expected_cumulative_value: u256(&fx["payment"]),
        checkout_hash: b256(&fx["checkoutHash"]),
        salt: u256(&fx["salt"]),
        deadline: u256(&fx["deadline"]),
    };
    let struct_hash = commitment_struct_hash(&order);
    let process_id = typed_data_hash(&domain, &struct_hash);
    let order_hash = compute_order_hash(&process_id, &struct_hash);
    let commit_digest = typed_data_hash(&domain, &struct_hash);

    let count: usize = s(&fx["vectorCount"]).parse().unwrap();
    let mut operations = vec![KernelOp::Commit {
        commitment: order.clone(),
        buyer_sig: sign_digest(&buyer_key, &commit_digest),
        seller_sig: sign_digest(&seller_key, &commit_digest),
    }];
    for k in 0..count {
        let v = &fx[format!("v{k}")];
        let clause_id = b256(&v["clauseId"]);
        let stage: u8 = s(&v["stage"]).parse().unwrap();
        let content_ref = b256(&v["contentRef"]);
        let proof = AttestationWitness::HashOnly {
            clause_data_hash: b256(&v["clauseDataHash"]),
            inclusion_proof: words(&v["inclusionProof"]),
        };
        operations.push(match s(&v["role"]) {
            "seller" => {
                let h = attest_seller_struct_hash(&order_hash, &clause_id, stage, &content_ref);
                KernelOp::AttestAsSeller {
                    target: order.clone(),
                    clause_id,
                    stage,
                    content_ref,
                    seller_sig: sign_digest(&seller_key, &typed_data_hash(&domain, &h)),
                    proof,
                }
            }
            "buyer" => {
                let h = attest_buyer_struct_hash(&process_id, &order_hash, &clause_id, stage, &content_ref);
                KernelOp::AttestAsBuyer {
                    target: order.clone(),
                    clause_id,
                    stage,
                    content_ref,
                    buyer_sig: sign_digest(&buyer_key, &typed_data_hash(&domain, &h)),
                    proof,
                }
            }
            other => panic!("unknown role {other}"),
        });
    }

    let input = BatchInput {
        chain_id,
        verifying_contract: core,
        block_timestamp: 1000,
        operations,
        prev_state: KernelStateSnapshot {
            processes: vec![],
            order_status: vec![],
            order_process_id: vec![],
            usage_counted: vec![],
            usage_seller_seen: vec![],
            usage_accrual: vec![],
        },
        usage_claims: vec![],
        usage_period: 0,
        provenance_leaf: B256::ZERO,
    };
    let (pv, _positions, events) = apply_batch(&input).expect("the hash-only attestations apply");

    assert_eq!(events.attestations.len(), count);
    for (k, e) in events.attestations.iter().enumerate() {
        let v = &fx[format!("v{k}")];
        let (topics, data) = encode_log(e);
        assert_eq!(topics, words(&v["topics"]), "vector {k}: the topics are the coordinator's");
        assert_eq!(data, hex_bytes(&v["data"]), "vector {k}: the data is the coordinator's");
    }
    assert!(events.spec_bindings.is_empty(), "the hash-only form commits no spec binding");
    assert_eq!(pv.spec_bindings_hash, compute_spec_bindings_hash(&[]));
}
