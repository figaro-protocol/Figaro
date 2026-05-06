/// Parity tests: verify the Rust kernel produces identical outputs
/// to the Solidity kernel for the same inputs.
///
/// The expected values are extracted from Foundry's ParityVectors test
/// (test/ParityVectors.t.sol) run with --via-ir -vvvv.
use alloy_primitives::{address, b256, Address, B256, U256, keccak256};
use k256::ecdsa::SigningKey;

use figaro_kernel::eip712::*;
use figaro_kernel::kernel::apply_batch;
use figaro_kernel::types::*;

// ── Test keys (match Foundry's constants) ─────────────────────────

const BUYER_KEY: u64 = 0xB0B;
const SELLER1_KEY: u64 = 0x5E11;
const SELLER2_KEY: u64 = 0x5E12;

// Addresses derived by Foundry's vm.addr():
const BUYER: Address = address!("0376AAc07Ad725E01357B1725B5ceC61aE10473c");
const SELLER1: Address = address!("Ad29D7a8aD3639F97798c768202F27C1dE81DC55");
const SELLER2: Address = address!("C22667C5926d1C9af6C0fa8Cedc4ea3e489F6F70");

// Foundry deterministic deployer addresses:
const TOKEN: Address = address!("5615dEB798BB3E4dFa0139dFa1b3D433Cc23b72f");
const CORE: Address = address!("2e234DAe75C793f67A35089C9d99245E1C58470b");
const CHAIN_ID: u64 = 31337;

// ── Expected values from Foundry ──────────────────────────────────

const DOMAIN_SEP: B256 = b256!("6325a49af8b05e724de86f3ff9397854cd7733afbdaf519b96ee7b6816891bc4");
const ROOT_STRUCT_HASH: B256 = b256!("20b9c54e9ae96ab9aa9f559c0f5ddda02c2245b76ef7b8c6997c68ae5fae2b54");
const ROOT_DIGEST: B256 = b256!("83118784bdf5c22406e4bd1877f8a6cc53da421295721b5fdc99cd7a5dc4f3c4");
const PROCESS_ID: B256 = b256!("83118784bdf5c22406e4bd1877f8a6cc53da421295721b5fdc99cd7a5dc4f3c4");
const ROOT_ORDER_HASH: B256 = b256!("a7b65d509f68373b4351ee7ca65b967723cc8ba5d69db1ece31f4b5f403410ca");
const SUB_STRUCT_HASH: B256 = b256!("79c2f3be4fcecb869aacb3fca5baf99d1ea2b9757a8243e8ab5d97696b0bb84c");
const SUB_DIGEST: B256 = b256!("41c4dfb44eaadd4254dfce1ccf7caaf32df06a587cdf761380adaf2fa04a586f");
const SUB_ORDER_HASH: B256 = b256!("4ab8b13d6589e595e04b7858c75ee32c0293b49f92b38d8f4a25480e75e5e5ea");

// ── Signing helper ────────────────────────────────────────────────

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
        v: recid.to_byte() + 27, // Ethereum convention
        r: B256::from_slice(&sig_bytes[..32]),
        s: B256::from_slice(&sig_bytes[32..]),
    }
}

fn sign_commitment(c: &Commitment, domain: &B256, key: &SigningKey) -> Signature {
    let struct_hash = commitment_struct_hash(c);
    let digest = typed_data_hash(domain, &struct_hash);
    sign_digest(key, &digest)
}

fn verify_address(key: &SigningKey, expected: &Address) {
    let pubkey = key.verifying_key().to_encoded_point(false);
    let hash = keccak256(&pubkey.as_bytes()[1..]);
    let addr = Address::from_slice(&hash[12..]);
    assert_eq!(&addr, expected, "derived address mismatch");
}

// ── Tests ─────────────────────────────────────────────────────────

#[test]
fn test_address_derivation() {
    let buyer_key = make_signing_key(BUYER_KEY);
    let seller1_key = make_signing_key(SELLER1_KEY);
    let seller2_key = make_signing_key(SELLER2_KEY);
    verify_address(&buyer_key, &BUYER);
    verify_address(&seller1_key, &SELLER1);
    verify_address(&seller2_key, &SELLER2);
}

#[test]
fn test_domain_separator() {
    let ds = domain_separator(CHAIN_ID, CORE);
    assert_eq!(ds, DOMAIN_SEP, "domain separator mismatch");
}

#[test]
fn test_root_struct_hash() {
    let root = root_commitment();
    let sh = commitment_struct_hash(&root);
    assert_eq!(sh, ROOT_STRUCT_HASH, "root struct hash mismatch");
}

#[test]
fn test_root_digest() {
    let root = root_commitment();
    let sh = commitment_struct_hash(&root);
    let digest = typed_data_hash(&DOMAIN_SEP, &sh);
    assert_eq!(digest, ROOT_DIGEST, "root digest mismatch");
}

#[test]
fn test_root_order_hash() {
    let root = root_commitment();
    let sh = commitment_struct_hash(&root);
    let oh = compute_order_hash(&PROCESS_ID, &sh);
    assert_eq!(oh, ROOT_ORDER_HASH, "root order hash mismatch");
}

#[test]
fn test_sub_struct_hash() {
    let sub = sub_commitment();
    let sh = commitment_struct_hash(&sub);
    assert_eq!(sh, SUB_STRUCT_HASH, "sub struct hash mismatch");
}

#[test]
fn test_sub_digest() {
    let sub = sub_commitment();
    let sh = commitment_struct_hash(&sub);
    let digest = typed_data_hash(&DOMAIN_SEP, &sh);
    assert_eq!(digest, SUB_DIGEST, "sub digest mismatch");
}

#[test]
fn test_sub_order_hash() {
    let sub = sub_commitment();
    let sh = commitment_struct_hash(&sub);
    let oh = compute_order_hash(&PROCESS_ID, &sh);
    assert_eq!(oh, SUB_ORDER_HASH, "sub order hash mismatch");
}

#[test]
fn test_ecdsa_recovery() {
    let buyer_key = make_signing_key(BUYER_KEY);
    let root = root_commitment();
    let domain = domain_separator(CHAIN_ID, CORE);
    let sig = sign_commitment(&root, &domain, &buyer_key);
    let struct_hash = commitment_struct_hash(&root);
    let digest = typed_data_hash(&domain, &struct_hash);
    let recovered = recover_signer(&digest, &sig).unwrap();
    assert_eq!(recovered, BUYER, "ECDSA recovery failed for buyer");
}

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
        prev_state: KernelStateSnapshot {
            processes: vec![],
            order_status: vec![],
            order_process_id: vec![],
            schemas_registered: vec![],
            operators_registered: vec![],
            emission_settlement_count: 0,
            emission_total_emitted: U256::ZERO,
        },
        fig_token: Address::ZERO,
    };

    let (pv, positions, _events) = apply_batch(&input).unwrap();

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
    assert_eq!(buyer_pos[0].deposit, U256::from(300u64) * ether, "buyer total deposit");
    assert_eq!(s1_pos[0].deposit, U256::from(200u64) * ether, "seller1 deposit");
    assert_eq!(s2_pos[0].deposit, U256::from(300u64) * ether, "seller2 deposit");
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

    // Sign resolve authorization.
    let resolve_hash = resolve_struct_hash(&PROCESS_ID);
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
                process_id: PROCESS_ID,
                commitments: vec![root, sub],
                buyer_sig: resolve_sig,
            },
        ],
        prev_state: KernelStateSnapshot {
            processes: vec![],
            order_status: vec![],
            order_process_id: vec![],
            schemas_registered: vec![],
            operators_registered: vec![],
            emission_settlement_count: 0,
            emission_total_emitted: U256::ZERO,
        },
        fig_token: Address::ZERO,
    };

    let (_pv, positions, _events) = apply_batch(&input).unwrap();

    let ether = U256::from(1_000_000_000_000_000_000u64);

    // Payouts must match Solidity exactly.
    // Seller1: expectedCumulativeValue*2 + payment = 100*2 + 100 = 300 ether
    // Seller2: expectedCumulativeValue*2 + payment = 150*2 + 50 = 350 ether
    // Buyer: payment per order = 100 + 50 = 150 ether
    let s1 = positions.iter().find(|p| p.user == SELLER1).unwrap();
    let s2 = positions.iter().find(|p| p.user == SELLER2).unwrap();
    let b = positions.iter().find(|p| p.user == BUYER).unwrap();

    assert_eq!(s1.payout, U256::from(300u64) * ether, "seller1 payout mismatch");
    assert_eq!(s2.payout, U256::from(350u64) * ether, "seller2 payout mismatch");
    assert_eq!(b.payout, U256::from(150u64) * ether, "buyer payout mismatch");

    // Deposits too.
    assert_eq!(s1.deposit, U256::from(200u64) * ether, "seller1 deposit");
    assert_eq!(s2.deposit, U256::from(300u64) * ether, "seller2 deposit");
    assert_eq!(b.deposit, U256::from(300u64) * ether, "buyer deposit");
}

// ── Test commitment constructors ──────────────────────────────────

fn root_commitment() -> Commitment {
    Commitment {
        process_id: B256::ZERO,
        buyer: BUYER,
        seller: SELLER1,
        currency: TOKEN,
        payment: U256::from(100_000_000_000_000_000_000u128),   // 100 ether
        expected_cumulative_value: U256::from(100_000_000_000_000_000_000u128),
        agreement_hash: keccak256("test-agreement"),
        salt: U256::from(42u64),
        deadline: U256::from(2000u64),
    }
}

fn sub_commitment() -> Commitment {
    Commitment {
        process_id: PROCESS_ID,
        buyer: BUYER,
        seller: SELLER2,
        currency: TOKEN,
        payment: U256::from(50_000_000_000_000_000_000u128),    // 50 ether
        expected_cumulative_value: U256::from(150_000_000_000_000_000_000u128), // 150 ether
        agreement_hash: keccak256("sub-agreement"),
        salt: U256::from(43u64),
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
        emission_settlement_count: 0,
        emission_total_emitted: U256::ZERO,
    }
}

// ── Schema Registry tests ─────────────────────────────────────────

#[test]
fn test_register_schema() {
    let registrar_key = make_signing_key(BUYER_KEY); // any key works
    let domain = domain_separator(CHAIN_ID, CORE);
    let schema_id = keccak256(b"figaro-delivery-lifecycle-v1");
    let uri_hash = keccak256(b"ipfs://Qm...");

    let struct_hash = register_schema_struct_hash(&schema_id, 1, &uri_hash);
    let digest = typed_data_hash(&domain, &struct_hash);
    let sig = sign_digest(&registrar_key, &digest);

    let input = BatchInput {
        chain_id: CHAIN_ID,
        verifying_contract: CORE,
        block_timestamp: 1000,
        operations: vec![KernelOp::RegisterSchema {
            schema_id,
            version: 1,
            uri_hash,
            registrar_sig: sig,
        }],
        prev_state: empty_snapshot(),
        fig_token: Address::ZERO,
    };

    let (pv, _positions, events) = apply_batch(&input).unwrap();
    assert_ne!(pv.prev_state_root, pv.new_state_root);
    assert_eq!(events.schemas.len(), 1);
    assert_eq!(events.schemas[0].schema_id, schema_id);
    assert_eq!(events.schemas[0].version, 1);
    assert_eq!(events.schemas[0].registrar, BUYER);
}

#[test]
fn test_register_schema_duplicate_fails() {
    let registrar_key = make_signing_key(BUYER_KEY);
    let domain = domain_separator(CHAIN_ID, CORE);
    let schema_id = keccak256(b"figaro-test-v1");
    let uri_hash = keccak256(b"ipfs://test");

    let struct_hash = register_schema_struct_hash(&schema_id, 1, &uri_hash);
    let digest = typed_data_hash(&domain, &struct_hash);
    let sig = sign_digest(&registrar_key, &digest);

    let input = BatchInput {
        chain_id: CHAIN_ID,
        verifying_contract: CORE,
        block_timestamp: 1000,
        operations: vec![
            KernelOp::RegisterSchema {
                schema_id,
                version: 1,
                uri_hash,
                registrar_sig: sig.clone(),
            },
            KernelOp::RegisterSchema {
                schema_id,
                version: 2,
                uri_hash,
                registrar_sig: sig,
            },
        ],
        prev_state: empty_snapshot(),
        fig_token: Address::ZERO,
    };

    let err = apply_batch(&input).unwrap_err();
    assert!(matches!(err, KernelError::SchemaAlreadyRegistered(_)));
}

#[test]
fn test_set_mechanism_schema() {
    let registrar_key = make_signing_key(BUYER_KEY);
    let mechanism_key = make_signing_key(SELLER1_KEY);
    let domain = domain_separator(CHAIN_ID, CORE);
    let schema_id = keccak256(b"figaro-ghg-v1");
    let uri_hash = keccak256(b"ipfs://ghg");

    // First register the schema
    let reg_struct = register_schema_struct_hash(&schema_id, 1, &uri_hash);
    let reg_digest = typed_data_hash(&domain, &reg_struct);
    let reg_sig = sign_digest(&registrar_key, &reg_digest);

    // Then declare mechanism binding
    let mech_struct = set_mechanism_schema_struct_hash(&schema_id);
    let mech_digest = typed_data_hash(&domain, &mech_struct);
    let mech_sig = sign_digest(&mechanism_key, &mech_digest);

    let input = BatchInput {
        chain_id: CHAIN_ID,
        verifying_contract: CORE,
        block_timestamp: 1000,
        operations: vec![
            KernelOp::RegisterSchema {
                schema_id,
                version: 1,
                uri_hash,
                registrar_sig: reg_sig,
            },
            KernelOp::SetMechanismSchema {
                schema_id,
                mechanism_sig: mech_sig,
            },
        ],
        prev_state: empty_snapshot(),
        fig_token: Address::ZERO,
    };

    let (_pv, _positions, events) = apply_batch(&input).unwrap();
    assert_eq!(events.mechanism_schemas.len(), 1);
    assert_eq!(events.mechanism_schemas[0].mechanism, SELLER1);
    assert_eq!(events.mechanism_schemas[0].schema_id, schema_id);
}

#[test]
fn test_set_mechanism_schema_unregistered_fails() {
    let mechanism_key = make_signing_key(SELLER1_KEY);
    let domain = domain_separator(CHAIN_ID, CORE);
    let schema_id = keccak256(b"figaro-nonexistent-v1");

    let mech_struct = set_mechanism_schema_struct_hash(&schema_id);
    let mech_digest = typed_data_hash(&domain, &mech_struct);
    let mech_sig = sign_digest(&mechanism_key, &mech_digest);

    let input = BatchInput {
        chain_id: CHAIN_ID,
        verifying_contract: CORE,
        block_timestamp: 1000,
        operations: vec![KernelOp::SetMechanismSchema {
            schema_id,
            mechanism_sig: mech_sig,
        }],
        prev_state: empty_snapshot(),
        fig_token: Address::ZERO,
    };

    let err = apply_batch(&input).unwrap_err();
    assert!(matches!(err, KernelError::SchemaNotRegistered(_)));
}

// ── Operator Registry tests ───────────────────────────────────────

#[test]
fn test_register_operator() {
    let operator_key = make_signing_key(SELLER1_KEY);
    let domain = domain_separator(CHAIN_ID, CORE);
    let metadata = "ipfs://QmOperator1";

    let struct_hash = register_operator_struct_hash(metadata);
    let digest = typed_data_hash(&domain, &struct_hash);
    let sig = sign_digest(&operator_key, &digest);

    let input = BatchInput {
        chain_id: CHAIN_ID,
        verifying_contract: CORE,
        block_timestamp: 1000,
        operations: vec![KernelOp::RegisterOperator {
            metadata_uri: metadata.to_string(),
            operator_sig: sig,
        }],
        prev_state: empty_snapshot(),
        fig_token: Address::ZERO,
    };

    let (pv, _positions, events) = apply_batch(&input).unwrap();
    assert_ne!(pv.prev_state_root, pv.new_state_root);
    assert_eq!(events.operators.len(), 1);
    let OperatorEventData::Registered { operator, metadata_uri } = &events.operators[0]
    else {
        panic!("expected Registered, got {:?}", &events.operators[0]);
    };
    assert_eq!(*operator, SELLER1);
    assert_eq!(metadata_uri, metadata);
}

#[test]
fn test_register_operator_duplicate_fails() {
    let operator_key = make_signing_key(SELLER1_KEY);
    let domain = domain_separator(CHAIN_ID, CORE);

    let make_sig = |uri: &str| {
        let struct_hash = register_operator_struct_hash(uri);
        let digest = typed_data_hash(&domain, &struct_hash);
        sign_digest(&operator_key, &digest)
    };

    let input = BatchInput {
        chain_id: CHAIN_ID,
        verifying_contract: CORE,
        block_timestamp: 1000,
        operations: vec![
            KernelOp::RegisterOperator {
                metadata_uri: "ipfs://first".to_string(),
                operator_sig: make_sig("ipfs://first"),
            },
            KernelOp::RegisterOperator {
                metadata_uri: "ipfs://second".to_string(),
                operator_sig: make_sig("ipfs://second"),
            },
        ],
        prev_state: empty_snapshot(),
        fig_token: Address::ZERO,
    };

    let err = apply_batch(&input).unwrap_err();
    assert!(matches!(err, KernelError::OperatorAlreadyRegistered));
}

#[test]
fn test_update_profile_emits_profile_updated_event() {
    let operator_key = make_signing_key(SELLER1_KEY);
    let domain = domain_separator(CHAIN_ID, CORE);

    let reg_struct = register_operator_struct_hash("ipfs://v1");
    let reg_digest = typed_data_hash(&domain, &reg_struct);
    let reg_sig = sign_digest(&operator_key, &reg_digest);

    let upd_struct = update_profile_struct_hash("ipfs://v2");
    let upd_digest = typed_data_hash(&domain, &upd_struct);
    let upd_sig = sign_digest(&operator_key, &upd_digest);

    let input = BatchInput {
        chain_id: CHAIN_ID,
        verifying_contract: CORE,
        block_timestamp: 1000,
        operations: vec![
            KernelOp::RegisterOperator {
                metadata_uri: "ipfs://v1".to_string(),
                operator_sig: reg_sig,
            },
            KernelOp::UpdateProfile {
                metadata_uri: "ipfs://v2".to_string(),
                operator_sig: upd_sig,
            },
        ],
        prev_state: empty_snapshot(),
        fig_token: Address::ZERO,
    };

    let (_pv, _positions, events) = apply_batch(&input).unwrap();
    assert_eq!(events.operators.len(), 2);
    assert!(matches!(
        &events.operators[0],
        OperatorEventData::Registered { .. }
    ));
    let OperatorEventData::ProfileUpdated { operator, metadata_uri } = &events.operators[1]
    else {
        panic!("expected ProfileUpdated, got {:?}", &events.operators[1]);
    };
    assert_eq!(*operator, SELLER1);
    assert_eq!(metadata_uri, "ipfs://v2");
}

#[test]
fn test_update_profile_unregistered_fails() {
    let operator_key = make_signing_key(SELLER1_KEY);
    let domain = domain_separator(CHAIN_ID, CORE);

    let upd_struct = update_profile_struct_hash("ipfs://orphan");
    let upd_digest = typed_data_hash(&domain, &upd_struct);
    let upd_sig = sign_digest(&operator_key, &upd_digest);

    let input = BatchInput {
        chain_id: CHAIN_ID,
        verifying_contract: CORE,
        block_timestamp: 1000,
        operations: vec![KernelOp::UpdateProfile {
            metadata_uri: "ipfs://orphan".to_string(),
            operator_sig: upd_sig,
        }],
        prev_state: empty_snapshot(),
        fig_token: Address::ZERO,
    };

    let err = apply_batch(&input).unwrap_err();
    assert!(matches!(err, KernelError::OperatorNotRegistered));
}

// ── Attestation tests ─────────────────────────────────────────────

#[test]
fn test_attest_as_seller() {
    let buyer_key = make_signing_key(BUYER_KEY);
    let seller1_key = make_signing_key(SELLER1_KEY);
    let domain = domain_separator(CHAIN_ID, CORE);

    let root = root_commitment();
    let root_buyer_sig = sign_commitment(&root, &domain, &buyer_key);
    let root_seller_sig = sign_commitment(&root, &domain, &seller1_key);

    let schema_id = keccak256(b"figaro-delivery-lifecycle-v1");
    let content_ref = keccak256(b"evidence-data");

    // Build attestation signature
    let root_struct = commitment_struct_hash(&root);
    let order_hash = compute_order_hash(&PROCESS_ID, &root_struct);
    let attest_struct = attest_seller_struct_hash(&order_hash, &schema_id, 1, &content_ref);
    let attest_digest = typed_data_hash(&domain, &attest_struct);
    let attest_sig = sign_digest(&seller1_key, &attest_digest);

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
            KernelOp::AttestAsSeller {
                role_commitment: root,
                order_hash,
                schema_id,
                stage: 1,
                content_ref,
                seller_sig: attest_sig,
            },
        ],
        prev_state: empty_snapshot(),
        fig_token: Address::ZERO,
    };

    let (_pv, _positions, events) = apply_batch(&input).unwrap();
    assert_eq!(events.attestations.len(), 1);
    assert_eq!(events.attestations[0].order_hash, order_hash);
    assert_eq!(events.attestations[0].process_id, PROCESS_ID);
    assert_eq!(events.attestations[0].attester, SELLER1);
    assert_eq!(events.attestations[0].schema_id, schema_id);
    assert_eq!(events.attestations[0].stage, 1);
    assert_eq!(events.attestations[0].content_ref, content_ref);
}

#[test]
fn test_attest_as_buyer() {
    let buyer_key = make_signing_key(BUYER_KEY);
    let seller1_key = make_signing_key(SELLER1_KEY);
    let domain = domain_separator(CHAIN_ID, CORE);

    let root = root_commitment();
    let root_buyer_sig = sign_commitment(&root, &domain, &buyer_key);
    let root_seller_sig = sign_commitment(&root, &domain, &seller1_key);

    let schema_id = keccak256(b"figaro-quality-v1");
    let content_ref = keccak256(b"buyer-evidence");

    let root_struct = commitment_struct_hash(&root);
    let order_hash = compute_order_hash(&PROCESS_ID, &root_struct);

    let attest_struct =
        attest_buyer_struct_hash(&PROCESS_ID, &order_hash, &schema_id, 0, &content_ref);
    let attest_digest = typed_data_hash(&domain, &attest_struct);
    let attest_sig = sign_digest(&buyer_key, &attest_digest);

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
            KernelOp::AttestAsBuyer {
                process_id: PROCESS_ID,
                order_hash,
                schema_id,
                stage: 0,
                content_ref,
                buyer_sig: attest_sig,
            },
        ],
        prev_state: empty_snapshot(),
        fig_token: Address::ZERO,
    };

    let (_pv, _positions, events) = apply_batch(&input).unwrap();
    assert_eq!(events.attestations.len(), 1);
    assert_eq!(events.attestations[0].attester, BUYER);
    assert_eq!(events.attestations[0].schema_id, schema_id);
}

#[test]
fn test_attest_as_seller_wrong_signer_fails() {
    let buyer_key = make_signing_key(BUYER_KEY);
    let seller1_key = make_signing_key(SELLER1_KEY);
    let seller2_key = make_signing_key(SELLER2_KEY);
    let domain = domain_separator(CHAIN_ID, CORE);

    let root = root_commitment();
    let root_buyer_sig = sign_commitment(&root, &domain, &buyer_key);
    let root_seller_sig = sign_commitment(&root, &domain, &seller1_key);

    let schema_id = keccak256(b"figaro-test-v1");
    let content_ref = B256::ZERO;

    let root_struct = commitment_struct_hash(&root);
    let order_hash = compute_order_hash(&PROCESS_ID, &root_struct);

    // Sign with seller2 but root's seller is seller1
    let attest_struct = attest_seller_struct_hash(&order_hash, &schema_id, 0, &content_ref);
    let attest_digest = typed_data_hash(&domain, &attest_struct);
    let attest_sig = sign_digest(&seller2_key, &attest_digest);

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
            KernelOp::AttestAsSeller {
                role_commitment: root,
                order_hash,
                schema_id,
                stage: 0,
                content_ref,
                seller_sig: attest_sig,
            },
        ],
        prev_state: empty_snapshot(),
        fig_token: Address::ZERO,
    };

    let err = apply_batch(&input).unwrap_err();
    assert!(matches!(err, KernelError::NotAuthorized));
}

#[test]
fn test_attest_as_buyer_wrong_signer_fails() {
    let buyer_key = make_signing_key(BUYER_KEY);
    let seller1_key = make_signing_key(SELLER1_KEY);
    let domain = domain_separator(CHAIN_ID, CORE);

    let root = root_commitment();
    let root_buyer_sig = sign_commitment(&root, &domain, &buyer_key);
    let root_seller_sig = sign_commitment(&root, &domain, &seller1_key);

    let root_struct = commitment_struct_hash(&root);
    let order_hash = compute_order_hash(&PROCESS_ID, &root_struct);

    // Sign with seller1 (not the buyer)
    let attest_struct =
        attest_buyer_struct_hash(&PROCESS_ID, &order_hash, &keccak256(b"s"), 0, &B256::ZERO);
    let attest_digest = typed_data_hash(&domain, &attest_struct);
    let attest_sig = sign_digest(&seller1_key, &attest_digest);

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
            KernelOp::AttestAsBuyer {
                process_id: PROCESS_ID,
                order_hash,
                schema_id: keccak256(b"s"),
                stage: 0,
                content_ref: B256::ZERO,
                buyer_sig: attest_sig,
            },
        ],
        prev_state: empty_snapshot(),
        fig_token: Address::ZERO,
    };

    let err = apply_batch(&input).unwrap_err();
    assert!(matches!(err, KernelError::NotAuthorized));
}

// ── Mixed batch test ──────────────────────────────────────────────

#[test]
fn test_mixed_batch_all_operations() {
    let buyer_key = make_signing_key(BUYER_KEY);
    let seller1_key = make_signing_key(SELLER1_KEY);
    let domain = domain_separator(CHAIN_ID, CORE);

    let root = root_commitment();
    let root_buyer_sig = sign_commitment(&root, &domain, &buyer_key);
    let root_seller_sig = sign_commitment(&root, &domain, &seller1_key);

    let root_struct = commitment_struct_hash(&root);
    let order_hash = compute_order_hash(&PROCESS_ID, &root_struct);

    // Schema registration
    let schema_id = keccak256(b"figaro-mixed-test-v1");
    let uri_hash = keccak256(b"ipfs://mixed");
    let schema_struct = register_schema_struct_hash(&schema_id, 1, &uri_hash);
    let schema_sig = sign_digest(&buyer_key, &typed_data_hash(&domain, &schema_struct));

    // Operator registration
    let op_struct = register_operator_struct_hash("ipfs://op");
    let op_sig = sign_digest(&seller1_key, &typed_data_hash(&domain, &op_struct));

    // Seller attestation
    let attest_struct = attest_seller_struct_hash(&order_hash, &schema_id, 0, &B256::ZERO);
    let attest_sig = sign_digest(&seller1_key, &typed_data_hash(&domain, &attest_struct));

    // Resolve
    let resolve_hash = resolve_struct_hash(&PROCESS_ID);
    let resolve_sig = sign_digest(&buyer_key, &typed_data_hash(&domain, &resolve_hash));

    let input = BatchInput {
        chain_id: CHAIN_ID,
        verifying_contract: CORE,
        block_timestamp: 1000,
        operations: vec![
            // 1. Commit
            KernelOp::Commit {
                commitment: root.clone(),
                buyer_sig: root_buyer_sig,
                seller_sig: root_seller_sig,
            },
            // 2. Register schema
            KernelOp::RegisterSchema {
                schema_id,
                version: 1,
                uri_hash,
                registrar_sig: schema_sig,
            },
            // 3. Register operator
            KernelOp::RegisterOperator {
                metadata_uri: "ipfs://op".to_string(),
                operator_sig: op_sig,
            },
            // 4. Attest as seller
            KernelOp::AttestAsSeller {
                role_commitment: root.clone(),
                order_hash,
                schema_id,
                stage: 0,
                content_ref: B256::ZERO,
                seller_sig: attest_sig,
            },
            // 5. Resolve
            KernelOp::Resolve {
                process_id: PROCESS_ID,
                commitments: vec![root],
                buyer_sig: resolve_sig,
            },
        ],
        prev_state: empty_snapshot(),
        fig_token: Address::ZERO,
    };

    let (pv, positions, events) = apply_batch(&input).unwrap();

    // State changed (commit + resolve + schema + operator)
    assert_ne!(pv.prev_state_root, pv.new_state_root);
    // Event hashes are non-zero (events were emitted)
    assert_ne!(pv.attestation_events_hash, B256::ZERO);
    assert_ne!(pv.schema_events_hash, B256::ZERO);
    assert_ne!(pv.operator_events_hash, B256::ZERO);
    // Events collected
    assert_eq!(events.attestations.len(), 1);
    assert_eq!(events.schemas.len(), 1);
    assert_eq!(events.operators.len(), 1);
    // Token flows exist (from commit + resolve)
    assert!(!positions.is_empty());
}

// ── FIG emission tests ────────────────────────────────────────────

const FIG_TOKEN: Address = address!("1111111111111111111111111111111111111111");

#[test]
fn test_emission_on_resolve_mints_fig() {
    let domain = domain_separator(CHAIN_ID, CORE);
    let buyer_key = make_signing_key(BUYER_KEY);
    let seller1_key = make_signing_key(SELLER1_KEY);
    let seller2_key = make_signing_key(SELLER2_KEY);

    let root = root_commitment();
    let root_buyer_sig = sign_commitment(&root, &domain, &buyer_key);
    let root_seller_sig = sign_commitment(&root, &domain, &seller1_key);

    let sub = sub_commitment();
    let sub_buyer_sig = sign_commitment(&sub, &domain, &buyer_key);
    let sub_seller_sig = sign_commitment(&sub, &domain, &seller2_key);

    let resolve_hash = resolve_struct_hash(&PROCESS_ID);
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
                process_id: PROCESS_ID,
                commitments: vec![root, sub],
                buyer_sig: resolve_sig,
            },
        ],
        prev_state: empty_snapshot(),
        fig_token: FIG_TOKEN,
    };

    let (pv, positions, _events) = apply_batch(&input).unwrap();
    assert_ne!(pv.prev_state_root, pv.new_state_root);

    let ether = U256::from(1_000_000_000_000_000_000u64);

    // Euler emission at genesis peak: r(0) = 100 * 1.0 * (1 + 0.5*cos(0)) = 150 FIG
    let emission_first_order = U256::from(150u64) * ether;

    // Find FIG positions — sellers should have FIG payouts, no deposits
    let seller1_fig = positions
        .iter()
        .find(|p| p.token == FIG_TOKEN && p.user == SELLER1);
    let seller2_fig = positions
        .iter()
        .find(|p| p.token == FIG_TOKEN && p.user == SELLER2);

    assert!(seller1_fig.is_some(), "seller1 should receive FIG emission");
    assert!(seller2_fig.is_some(), "seller2 should receive FIG emission");

    let s1 = seller1_fig.unwrap();
    assert_eq!(s1.deposit, U256::ZERO, "FIG has no deposit (minted)");
    assert_eq!(s1.payout, emission_first_order, "seller1 gets ~150 FIG (Euler peak)");

    let s2 = seller2_fig.unwrap();
    assert_eq!(s2.deposit, U256::ZERO);
    // Second order at count=1: rate is ~150 FIG minus negligible decay+phase shift
    assert!(s2.payout > U256::from(149u64) * ether, "seller2 gets ~150 FIG");
    assert!(s2.payout < emission_first_order, "second order rate is slightly lower");

    // Buyer should NOT receive FIG (seller-only emission)
    let buyer_fig = positions
        .iter()
        .find(|p| p.token == FIG_TOKEN && p.user == BUYER);
    assert!(buyer_fig.is_none(), "buyer should not receive FIG");
}

#[test]
fn test_emission_disabled_when_fig_token_zero() {
    let domain = domain_separator(CHAIN_ID, CORE);
    let buyer_key = make_signing_key(BUYER_KEY);
    let seller1_key = make_signing_key(SELLER1_KEY);

    let root = root_commitment();
    let root_buyer_sig = sign_commitment(&root, &domain, &buyer_key);
    let root_seller_sig = sign_commitment(&root, &domain, &seller1_key);

    let resolve_hash = resolve_struct_hash(&PROCESS_ID);
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
            KernelOp::Resolve {
                process_id: PROCESS_ID,
                commitments: vec![root],
                buyer_sig: resolve_sig,
            },
        ],
        prev_state: empty_snapshot(),
        fig_token: Address::ZERO,
    };

    let (_pv, positions, _events) = apply_batch(&input).unwrap();

    // Only the settlement token should appear — no FIG positions
    for p in &positions {
        assert_eq!(p.token, TOKEN, "only settlement token should appear");
    }
}

#[test]
fn test_emission_state_persists_across_batches() {
    let domain = domain_separator(CHAIN_ID, CORE);
    let buyer_key = make_signing_key(BUYER_KEY);
    let seller1_key = make_signing_key(SELLER1_KEY);

    let ether = U256::from(1_000_000_000_000_000_000u64);
    // Euler emission at n=0: 100 * (1 + 0.5*cos(0)) = 150 FIG
    let emission_first_order = U256::from(150u64) * ether;

    // Batch 1: commit + resolve
    let root = root_commitment();
    let root_buyer_sig = sign_commitment(&root, &domain, &buyer_key);
    let root_seller_sig = sign_commitment(&root, &domain, &seller1_key);

    let resolve_hash = resolve_struct_hash(&PROCESS_ID);
    let resolve_digest = typed_data_hash(&domain, &resolve_hash);
    let resolve_sig = sign_digest(&buyer_key, &resolve_digest);

    let input1 = BatchInput {
        chain_id: CHAIN_ID,
        verifying_contract: CORE,
        block_timestamp: 1000,
        operations: vec![
            KernelOp::Commit {
                commitment: root.clone(),
                buyer_sig: root_buyer_sig,
                seller_sig: root_seller_sig,
            },
            KernelOp::Resolve {
                process_id: PROCESS_ID,
                commitments: vec![root],
                buyer_sig: resolve_sig,
            },
        ],
        prev_state: empty_snapshot(),
        fig_token: FIG_TOKEN,
    };

    let (_pv1, _positions1, _events1, post_state) =
        figaro_kernel::kernel::apply_batch_with_state(&input1).unwrap();

    // Verify emission state was persisted
    assert_eq!(post_state.emission_settlement_count, 1);
    assert_eq!(post_state.emission_total_emitted, emission_first_order);

    // Batch 2: new commit + resolve on fresh process
    let root2 = Commitment {
        process_id: B256::ZERO,
        buyer: BUYER,
        seller: SELLER1,
        currency: TOKEN,
        payment: U256::from(200u64) * ether,
        expected_cumulative_value: U256::from(200u64) * ether,
        agreement_hash: keccak256(b"agreement-2"),
        salt: U256::from(999u64),
        deadline: U256::from(9999u64),
    };
    let root2_buyer_sig = sign_commitment(&root2, &domain, &buyer_key);
    let root2_seller_sig = sign_commitment(&root2, &domain, &seller1_key);

    let root2_struct = commitment_struct_hash(&root2);
    let root2_digest = typed_data_hash(&domain, &root2_struct);
    let process_id_2 = root2_digest;

    let resolve_hash2 = resolve_struct_hash(&process_id_2);
    let resolve_digest2 = typed_data_hash(&domain, &resolve_hash2);
    let resolve_sig2 = sign_digest(&buyer_key, &resolve_digest2);

    let input2 = BatchInput {
        chain_id: CHAIN_ID,
        verifying_contract: CORE,
        block_timestamp: 2000,
        operations: vec![
            KernelOp::Commit {
                commitment: root2.clone(),
                buyer_sig: root2_buyer_sig,
                seller_sig: root2_seller_sig,
            },
            KernelOp::Resolve {
                process_id: process_id_2,
                commitments: vec![root2],
                buyer_sig: resolve_sig2,
            },
        ],
        prev_state: post_state.to_snapshot(),
        fig_token: FIG_TOKEN,
    };

    let (_pv2, _positions2, _events2, post_state2) =
        figaro_kernel::kernel::apply_batch_with_state(&input2).unwrap();

    // Counter incremented to 2; second settlement at count=1 has
    // a slightly different Euler rate than count=0, so use range check.
    assert_eq!(post_state2.emission_settlement_count, 2);
    assert!(post_state2.emission_total_emitted > emission_first_order,
            "total should exceed first order emission");
    // Second order rate at n=1 is ~150 FIG (tiny decay+phase shift)
    let two_orders_approx = emission_first_order * U256::from(2u64);
    assert!(post_state2.emission_total_emitted <= two_orders_approx,
            "total should not exceed 2x first order rate");
    // More precisely: should be ~300 FIG (150 + ~150)
    let min_expected = U256::from(299u64) * ether;
    assert!(post_state2.emission_total_emitted > min_expected,
            "total for 2 orders should be ~300 FIG");
}

#[test]
fn test_genesis_root_print() {
    let state = figaro_kernel::state::KernelState::new();
    let root = state.compute_root();
    let root_hex = format!("0x{}", alloy_primitives::hex::encode(root.as_slice()));
    eprintln!("GENESIS ROOT: {}", root_hex);
    // Web2-strip (2026-04-26): genesis root changed when operator_roles +
    // operator_active state fields were collapsed into operators_registered.
    // This breaks any pre-existing batch proofs — devnet only, no mainnet
    // impact. The new constant is the source of truth going forward.
    assert_eq!(
        root_hex,
        "0xb34b2328216876a2c527c2ebb375154610b36152deea0efb43bf73d4689e662e"
    );
}
