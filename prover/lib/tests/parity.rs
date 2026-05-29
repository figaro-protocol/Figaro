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

/// Encode `content` under the canonical Layer B encoder for the given
/// schema key. Post-Keystone there is no per-schema dispatch — every
/// caller looks up the embedded spec, parses it, and runs
/// `encode_content_from_spec`. This three-step pattern lives here so
/// the test bodies stay one-liners.
fn encode_for_schema_key(schema_id_str: &str, content: &serde_json::Value) -> Vec<u8> {
    let json = figaro_schema::embedded_spec_json_by_key(schema_id_str)
        .unwrap_or_else(|| panic!("no embedded spec for {schema_id_str}"));
    let parsed: serde_json::Value = serde_json::from_str(json)
        .unwrap_or_else(|e| panic!("embedded spec for {schema_id_str} is not valid JSON: {e}"));
    let spec = match figaro_schema::parse_schema_spec(&parsed) {
        figaro_schema::ParseSchemaSpecResult::Ok(s) => s,
        figaro_schema::ParseSchemaSpecResult::Err(errors) => {
            panic!("embedded spec for {schema_id_str} failed to parse: {errors:?}")
        }
    };
    figaro_schema::encode_content_from_spec(&spec, content)
        .unwrap_or_else(|e| panic!("canonical encoder must succeed for {schema_id_str}: {e}"))
}

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
            sellers_registered: vec![],
        },
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
            sellers_registered: vec![],
        },
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
        sellers_registered: vec![],    }
}

// ── Schema Registry tests ─────────────────────────────────────────

#[test]
fn test_register_schema() {
    let registrar_key = make_signing_key(BUYER_KEY); // any key works
    let domain = domain_separator(CHAIN_ID, CORE);
    let schema_id = keccak256(b"figaro-courier-process-v1");
    let uri_hash = keccak256(b"ipfs://Qm...");
    let family = keccak256(b"seller-process");

    let struct_hash = register_schema_struct_hash(&schema_id, 1, &uri_hash, &family);
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
            family,
            registrar_sig: sig,
        }],
        prev_state: empty_snapshot(),
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
    let family = keccak256(b"test-family");

    let struct_hash = register_schema_struct_hash(&schema_id, 1, &uri_hash, &family);
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
                family,
                registrar_sig: sig.clone(),
            },
            KernelOp::RegisterSchema {
                schema_id,
                version: 2,
                uri_hash,
                family,
                registrar_sig: sig,
            },
        ],
        prev_state: empty_snapshot(),
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
    let family = keccak256(b"emissions");

    // First register the schema
    let reg_struct = register_schema_struct_hash(&schema_id, 1, &uri_hash, &family);
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
                family,
                registrar_sig: reg_sig,
            },
            KernelOp::SetMechanismSchema {
                schema_id,
                mechanism_sig: mech_sig,
            },
        ],
        prev_state: empty_snapshot(),
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
    };

    let err = apply_batch(&input).unwrap_err();
    assert!(matches!(err, KernelError::SchemaNotRegistered(_)));
}

// ── Seller Registry tests ───────────────────────────────────────

#[test]
fn test_register_seller() {
    let seller_key = make_signing_key(SELLER1_KEY);
    let domain = domain_separator(CHAIN_ID, CORE);
    let metadata = "ipfs://QmSeller1";

    let struct_hash = register_seller_struct_hash(metadata);
    let digest = typed_data_hash(&domain, &struct_hash);
    let sig = sign_digest(&seller_key, &digest);

    let input = BatchInput {
        chain_id: CHAIN_ID,
        verifying_contract: CORE,
        block_timestamp: 1000,
        operations: vec![KernelOp::RegisterSeller {
            metadata_uri: metadata.to_string(),
            seller_sig: sig,
        }],
        prev_state: empty_snapshot(),
    };

    let (pv, _positions, events) = apply_batch(&input).unwrap();
    assert_ne!(pv.prev_state_root, pv.new_state_root);
    assert_eq!(events.sellers.len(), 1);
    let SellerEventData::Registered { seller, metadata_uri } = &events.sellers[0]
    else {
        panic!("expected Registered, got {:?}", &events.sellers[0]);
    };
    assert_eq!(*seller, SELLER1);
    assert_eq!(metadata_uri, metadata);
}

#[test]
fn test_register_seller_duplicate_fails() {
    let seller_key = make_signing_key(SELLER1_KEY);
    let domain = domain_separator(CHAIN_ID, CORE);

    let make_sig = |uri: &str| {
        let struct_hash = register_seller_struct_hash(uri);
        let digest = typed_data_hash(&domain, &struct_hash);
        sign_digest(&seller_key, &digest)
    };

    let input = BatchInput {
        chain_id: CHAIN_ID,
        verifying_contract: CORE,
        block_timestamp: 1000,
        operations: vec![
            KernelOp::RegisterSeller {
                metadata_uri: "ipfs://first".to_string(),
                seller_sig: make_sig("ipfs://first"),
            },
            KernelOp::RegisterSeller {
                metadata_uri: "ipfs://second".to_string(),
                seller_sig: make_sig("ipfs://second"),
            },
        ],
        prev_state: empty_snapshot(),
    };

    let err = apply_batch(&input).unwrap_err();
    assert!(matches!(err, KernelError::SellerAlreadyRegistered));
}

#[test]
fn test_update_profile_emits_profile_updated_event() {
    let seller_key = make_signing_key(SELLER1_KEY);
    let domain = domain_separator(CHAIN_ID, CORE);

    let reg_struct = register_seller_struct_hash("ipfs://v1");
    let reg_digest = typed_data_hash(&domain, &reg_struct);
    let reg_sig = sign_digest(&seller_key, &reg_digest);

    let upd_struct = update_profile_struct_hash("ipfs://v2");
    let upd_digest = typed_data_hash(&domain, &upd_struct);
    let upd_sig = sign_digest(&seller_key, &upd_digest);

    let input = BatchInput {
        chain_id: CHAIN_ID,
        verifying_contract: CORE,
        block_timestamp: 1000,
        operations: vec![
            KernelOp::RegisterSeller {
                metadata_uri: "ipfs://v1".to_string(),
                seller_sig: reg_sig,
            },
            KernelOp::UpdateProfile {
                metadata_uri: "ipfs://v2".to_string(),
                seller_sig: upd_sig,
            },
        ],
        prev_state: empty_snapshot(),
    };

    let (_pv, _positions, events) = apply_batch(&input).unwrap();
    assert_eq!(events.sellers.len(), 2);
    assert!(matches!(
        &events.sellers[0],
        SellerEventData::Registered { .. }
    ));
    let SellerEventData::ProfileUpdated { seller, metadata_uri } = &events.sellers[1]
    else {
        panic!("expected ProfileUpdated, got {:?}", &events.sellers[1]);
    };
    assert_eq!(*seller, SELLER1);
    assert_eq!(metadata_uri, "ipfs://v2");
}

#[test]
fn test_update_profile_unregistered_fails() {
    let seller_key = make_signing_key(SELLER1_KEY);
    let domain = domain_separator(CHAIN_ID, CORE);

    let upd_struct = update_profile_struct_hash("ipfs://orphan");
    let upd_digest = typed_data_hash(&domain, &upd_struct);
    let upd_sig = sign_digest(&seller_key, &upd_digest);

    let input = BatchInput {
        chain_id: CHAIN_ID,
        verifying_contract: CORE,
        block_timestamp: 1000,
        operations: vec![KernelOp::UpdateProfile {
            metadata_uri: "ipfs://orphan".to_string(),
            seller_sig: upd_sig,
        }],
        prev_state: empty_snapshot(),
    };

    let err = apply_batch(&input).unwrap_err();
    assert!(matches!(err, KernelError::SellerNotRegistered));
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

    // A non-protocol schemaId — the attestation is content-opaque, so no
    // content_proof is required even with a non-zero content_ref.
    let schema_id = keccak256(b"figaro-test-v1");
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
                content_proof: None,
            },
        ],
        prev_state: empty_snapshot(),
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
                content_proof: None,
            },
        ],
        prev_state: empty_snapshot(),
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
                content_proof: None,
            },
        ],
        prev_state: empty_snapshot(),
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
                content_proof: None,
            },
        ],
        prev_state: empty_snapshot(),
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
    let family = keccak256(b"test-family");
    let schema_struct = register_schema_struct_hash(&schema_id, 1, &uri_hash, &family);
    let schema_sig = sign_digest(&buyer_key, &typed_data_hash(&domain, &schema_struct));

    // Seller registration
    let op_struct = register_seller_struct_hash("ipfs://op");
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
                family,
                registrar_sig: schema_sig,
            },
            // 3. Register seller
            KernelOp::RegisterSeller {
                metadata_uri: "ipfs://op".to_string(),
                seller_sig: op_sig,
            },
            // 4. Attest as seller
            KernelOp::AttestAsSeller {
                role_commitment: root.clone(),
                order_hash,
                schema_id,
                stage: 0,
                content_ref: B256::ZERO,
                seller_sig: attest_sig,
                content_proof: None,
            },
            // 5. Resolve
            KernelOp::Resolve {
                process_id: PROCESS_ID,
                commitments: vec![root],
                buyer_sig: resolve_sig,
            },
        ],
        prev_state: empty_snapshot(),
    };

    let (pv, positions, events) = apply_batch(&input).unwrap();

    // State changed (commit + resolve + schema + seller)
    assert_ne!(pv.prev_state_root, pv.new_state_root);
    // Event hashes are non-zero (events were emitted)
    assert_ne!(pv.attestation_events_hash, B256::ZERO);
    assert_ne!(pv.schema_events_hash, B256::ZERO);
    assert_ne!(pv.seller_events_hash, B256::ZERO);
    // Events collected
    assert_eq!(events.attestations.len(), 1);
    assert_eq!(events.schemas.len(), 1);
    assert_eq!(events.sellers.len(), 1);
    // Token flows exist (from commit + resolve)
    assert!(!positions.is_empty());
}

// ── Layer B content-proof gate tests ──────────────────────────────
//
// These tests cover the AttestationContentProof gate in apply_batch:
// when a seller attestation carries a content_proof, the kernel looks
// up the canonical embedded spec for the op's schemaId and runs the
// gates (content validates, canonical bytes derived, derived bytes hash
// to content_ref) — emitting the event only if every gate passes.

/// Build `[Commit, AttestAsSeller]` for a seller attestation carrying a
/// Layer B content_proof under a cross-checking schema.
///
/// The committed role commitment's `agreement_hash` is the single-section
/// agreement tree whose lone clause is this schema, so Gate 5 (agreement
/// inclusion) verifies with an empty proof — `agreement_hash` IS the leaf.
/// `content_ref` is `keccak256(encode_for_schema_key(...))`, so Gates
/// 3–4 also pass for valid content. The caller must commit the returned
/// pair together: `agreement_hash` is part of the commitment struct hash,
/// so the Commit and the AttestAsSeller must reference the same commitment.
fn build_commit_and_canonical_attest(
    domain: &B256,
    buyer_key: &SigningKey,
    seller_key: &SigningKey,
    schema_id_str: &str,
    content_json: serde_json::Value,
) -> Vec<KernelOp> {
    let schema_id = keccak256(schema_id_str.as_bytes());
    let canonical_bytes = encode_for_schema_key(schema_id_str, &content_json);
    let content_ref = keccak256(canonical_bytes.as_slice());

    // Single-section agreement: the lone section leaf IS the agreement_hash.
    // Cross-checking schema → leaf = keccak256(schemaId ++ content_ref).
    let mut leaf_preimage = [0u8; 64];
    leaf_preimage[..32].copy_from_slice(schema_id.as_slice());
    leaf_preimage[32..].copy_from_slice(content_ref.as_slice());
    let agreement_hash = keccak256(leaf_preimage);

    let mut role = root_commitment();
    role.agreement_hash = agreement_hash;

    let buyer_sig = sign_commitment(&role, domain, buyer_key);
    let seller_sig = sign_commitment(&role, domain, seller_key);

    // Root order: processId is the EIP-712 digest of the commitment.
    let role_struct = commitment_struct_hash(&role);
    let process_id = typed_data_hash(domain, &role_struct);
    let order_hash = compute_order_hash(&process_id, &role_struct);
    let attest_struct = attest_seller_struct_hash(&order_hash, &schema_id, 0, &content_ref);
    let attest_sig = sign_digest(seller_key, &typed_data_hash(domain, &attest_struct));

    vec![
        KernelOp::Commit {
            commitment: role.clone(),
            buyer_sig,
            seller_sig,
        },
        KernelOp::AttestAsSeller {
            role_commitment: role,
            order_hash,
            schema_id,
            stage: 0,
            content_ref,
            seller_sig: attest_sig,
            content_proof: Some(AttestationContentProof {
                content_json: serde_json::to_string(&content_json).unwrap(),
                inclusion_proof: vec![],
                section_data: None,
            }),
        },
    ]
}

#[test]
fn attest_as_seller_with_valid_content_proof_passes() {
    let buyer_key = make_signing_key(BUYER_KEY);
    let seller1_key = make_signing_key(SELLER1_KEY);
    let domain = domain_separator(CHAIN_ID, CORE);

    let input = BatchInput {
        chain_id: CHAIN_ID,
        verifying_contract: CORE,
        block_timestamp: 1000,
        operations: build_commit_and_canonical_attest(
            &domain,
            &buyer_key,
            &seller1_key,
            "figaro-ghg-protocol-v1",
            serde_json::json!({ "scope": 1 }),
        ),
        prev_state: empty_snapshot(),
    };

    let (_pv, _positions, events) = apply_batch(&input).unwrap();
    assert_eq!(events.attestations.len(), 1);
    assert_eq!(events.attestations[0].schema_id, keccak256(b"figaro-ghg-protocol-v1"));
    assert_eq!(events.attestations[0].stage, 0);
}

#[test]
fn attest_as_seller_with_content_hash_mismatch_fails() {
    let buyer_key = make_signing_key(BUYER_KEY);
    let seller1_key = make_signing_key(SELLER1_KEY);
    let domain = domain_separator(CHAIN_ID, CORE);

    let root = root_commitment();
    let root_buyer_sig = sign_commitment(&root, &domain, &buyer_key);
    let root_seller_sig = sign_commitment(&root, &domain, &seller1_key);

    let schema_id = keccak256(b"figaro-ghg-protocol-v1");
    let content_json = serde_json::json!({ "scope": 1 });

    let root_struct = commitment_struct_hash(&root);
    let order_hash = compute_order_hash(&PROCESS_ID, &root_struct);
    // content_ref is a garbage hash unrelated to the canonical encoding
    // of any content_json. The attestation signature is computed over
    // this hash to isolate the failure to Gate 4 (keccak mismatch).
    let wrong_content_ref = keccak256(b"completely different bytes");
    let attest_struct = attest_seller_struct_hash(&order_hash, &schema_id, 0, &wrong_content_ref);
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
                stage: 0,
                content_ref: wrong_content_ref,
                seller_sig: attest_sig,
                content_proof: Some(figaro_kernel::types::AttestationContentProof {
                    content_json: serde_json::to_string(&content_json).unwrap(),
                    // Gate 1 / Gate 4 reject before Gate 5 — these are unused.
                    inclusion_proof: vec![],
                    section_data: None,
                }),
            },
        ],
        prev_state: empty_snapshot(),
    };

    let err = apply_batch(&input).unwrap_err();
    assert!(
        matches!(err, KernelError::ContentHashMismatch),
        "expected ContentHashMismatch, got {err:?}",
    );
}

#[test]
fn attest_as_seller_with_invalid_content_fails() {
    let buyer_key = make_signing_key(BUYER_KEY);
    let seller1_key = make_signing_key(SELLER1_KEY);
    let domain = domain_separator(CHAIN_ID, CORE);

    // scope=4 is out of range (1..=3) — must fail validate_content (Gate 2),
    // before Gate 5 ever runs.
    let input = BatchInput {
        chain_id: CHAIN_ID,
        verifying_contract: CORE,
        block_timestamp: 1000,
        operations: build_commit_and_canonical_attest(
            &domain,
            &buyer_key,
            &seller1_key,
            "figaro-ghg-protocol-v1",
            serde_json::json!({ "scope": 4 }),
        ),
        prev_state: empty_snapshot(),
    };

    let err = apply_batch(&input).unwrap_err();
    assert!(
        matches!(err, KernelError::SchemaContentInvalid(_)),
        "expected SchemaContentInvalid, got {err:?}",
    );
}

#[test]
fn attest_as_seller_with_unsupported_schema_encoder_fails() {
    // Attest under a schemaId that is not one of the runtime-attestable
    // protocol schemas — the kernel has no embedded spec for it, so the
    // content gate rejects at the spec-lookup step.
    let buyer_key = make_signing_key(BUYER_KEY);
    let seller1_key = make_signing_key(SELLER1_KEY);
    let domain = domain_separator(CHAIN_ID, CORE);

    let root = root_commitment();
    let root_buyer_sig = sign_commitment(&root, &domain, &buyer_key);
    let root_seller_sig = sign_commitment(&root, &domain, &seller1_key);

    let unknown_schema_id_str = "figaro-bogus-v99";
    let schema_id = keccak256(unknown_schema_id_str.as_bytes());
    let content_json = serde_json::json!({ "x": "ok" });

    // content_ref is arbitrary — the kernel rejects at the embedded-spec
    // lookup before it reaches the keccak check, so the value is moot.
    let root_struct = commitment_struct_hash(&root);
    let order_hash = compute_order_hash(&PROCESS_ID, &root_struct);
    let placeholder_ref = keccak256(b"placeholder");
    let attest_struct = attest_seller_struct_hash(&order_hash, &schema_id, 0, &placeholder_ref);
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
                stage: 0,
                content_ref: placeholder_ref,
                seller_sig: attest_sig,
                content_proof: Some(figaro_kernel::types::AttestationContentProof {
                    content_json: serde_json::to_string(&content_json).unwrap(),
                    // Gate 1 / Gate 4 reject before Gate 5 — these are unused.
                    inclusion_proof: vec![],
                    section_data: None,
                }),
            },
        ],
        prev_state: empty_snapshot(),
    };

    let err = apply_batch(&input).unwrap_err();
    assert!(
        matches!(err, KernelError::SchemaEncoderMissing(_)),
        "expected SchemaEncoderMissing, got {err:?}",
    );
}

#[test]
fn attest_as_seller_under_protocol_schema_requires_content_proof() {
    // A seller attestation under a content-bearing protocol schema with a
    // non-zero content_ref but no content_proof must be rejected — the
    // batched path will not record content it cannot validate.
    let buyer_key = make_signing_key(BUYER_KEY);
    let seller1_key = make_signing_key(SELLER1_KEY);
    let domain = domain_separator(CHAIN_ID, CORE);

    let root = root_commitment();
    let root_buyer_sig = sign_commitment(&root, &domain, &buyer_key);
    let root_seller_sig = sign_commitment(&root, &domain, &seller1_key);

    let schema_id = keccak256(b"figaro-ghg-protocol-v1");
    let content_ref = keccak256(b"some-content");
    let root_struct = commitment_struct_hash(&root);
    let order_hash = compute_order_hash(&PROCESS_ID, &root_struct);
    let attest_struct = attest_seller_struct_hash(&order_hash, &schema_id, 0, &content_ref);
    let attest_sig = sign_digest(&seller1_key, &typed_data_hash(&domain, &attest_struct));

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
                content_proof: None,
            },
        ],
        prev_state: empty_snapshot(),
    };

    let err = apply_batch(&input).unwrap_err();
    assert!(
        matches!(err, KernelError::ContentProofRequired),
        "expected ContentProofRequired, got {err:?}",
    );
}

#[test]
fn attest_as_seller_with_wrong_inclusion_proof_fails() {
    // The content validates and hashes correctly (Gates 0–4 pass), but the
    // Merkle inclusion_proof does not verify against the order's
    // agreement_hash — Gate 5 must reject. Here the agreement is a single
    // section (agreement_hash IS the leaf), so any non-empty proof fails:
    // hash_pair(leaf, sibling) != leaf.
    let buyer_key = make_signing_key(BUYER_KEY);
    let seller1_key = make_signing_key(SELLER1_KEY);
    let domain = domain_separator(CHAIN_ID, CORE);

    let schema_id_str = "figaro-ghg-protocol-v1";
    let schema_id = keccak256(schema_id_str.as_bytes());
    let content_json = serde_json::json!({ "scope": 1 });
    let canonical_bytes =
        encode_for_schema_key(schema_id_str, &content_json);
    let content_ref = keccak256(canonical_bytes.as_slice());

    // Single-section agreement: agreement_hash IS the lone section leaf.
    let mut leaf_preimage = [0u8; 64];
    leaf_preimage[..32].copy_from_slice(schema_id.as_slice());
    leaf_preimage[32..].copy_from_slice(content_ref.as_slice());
    let agreement_hash = keccak256(leaf_preimage);

    let mut role = root_commitment();
    role.agreement_hash = agreement_hash;
    let buyer_sig = sign_commitment(&role, &domain, &buyer_key);
    let seller_sig = sign_commitment(&role, &domain, &seller1_key);

    let role_struct = commitment_struct_hash(&role);
    let process_id = typed_data_hash(&domain, &role_struct);
    let order_hash = compute_order_hash(&process_id, &role_struct);
    let attest_struct = attest_seller_struct_hash(&order_hash, &schema_id, 0, &content_ref);
    let attest_sig = sign_digest(&seller1_key, &typed_data_hash(&domain, &attest_struct));

    let input = BatchInput {
        chain_id: CHAIN_ID,
        verifying_contract: CORE,
        block_timestamp: 1000,
        operations: vec![
            KernelOp::Commit {
                commitment: role.clone(),
                buyer_sig,
                seller_sig,
            },
            KernelOp::AttestAsSeller {
                role_commitment: role,
                order_hash,
                schema_id,
                stage: 0,
                content_ref,
                seller_sig: attest_sig,
                content_proof: Some(AttestationContentProof {
                    content_json: serde_json::to_string(&content_json).unwrap(),
                    // Bogus sibling against a single-leaf agreement.
                    inclusion_proof: vec![keccak256(b"bogus sibling")],
                    section_data: None,
                }),
            },
        ],
        prev_state: empty_snapshot(),
    };

    let err = apply_batch(&input).unwrap_err();
    assert!(
        matches!(err, KernelError::InvalidInclusionProof),
        "expected InvalidInclusionProof, got {err:?}",
    );
}

#[test]
fn attest_as_seller_non_cross_checking_schema_requires_section_data() {
    // figaro-ghg-measurement-v1 is Category-1 (non-cross-checking): its
    // committed sectionData is canonical JSON, not the ABI content form, so
    // the agreement Merkle leaf cannot be derived from content_ref alone. A
    // content_proof that omits section_data must fail Gate 5.
    let buyer_key = make_signing_key(BUYER_KEY);
    let seller1_key = make_signing_key(SELLER1_KEY);
    let domain = domain_separator(CHAIN_ID, CORE);

    let root = root_commitment();
    let root_buyer_sig = sign_commitment(&root, &domain, &buyer_key);
    let root_seller_sig = sign_commitment(&root, &domain, &seller1_key);

    let schema_id_str = "figaro-ghg-measurement-v1";
    let schema_id = keccak256(schema_id_str.as_bytes());
    let content_json = serde_json::json!({ "grams": "1000" });
    let canonical_bytes =
        encode_for_schema_key(schema_id_str, &content_json);
    let content_ref = keccak256(canonical_bytes.as_slice());

    let root_struct = commitment_struct_hash(&root);
    let order_hash = compute_order_hash(&PROCESS_ID, &root_struct);
    let attest_struct = attest_seller_struct_hash(&order_hash, &schema_id, 1, &content_ref);
    let attest_sig = sign_digest(&seller1_key, &typed_data_hash(&domain, &attest_struct));

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
                content_proof: Some(AttestationContentProof {
                    content_json: serde_json::to_string(&content_json).unwrap(),
                    inclusion_proof: vec![],
                    // Omitted — Gate 5 cannot derive the leaf without it.
                    section_data: None,
                }),
            },
        ],
        prev_state: empty_snapshot(),
    };

    let err = apply_batch(&input).unwrap_err();
    assert!(
        matches!(err, KernelError::MissingSectionData),
        "expected MissingSectionData, got {err:?}",
    );
}

#[test]
fn test_genesis_root_print() {
    let state = figaro_kernel::state::KernelState::new();
    let root = state.compute_root();
    let root_hex = format!("0x{}", alloy_primitives::hex::encode(root.as_slice()));
    eprintln!("GENESIS ROOT: {}", root_hex);
    // Genesis root = keccak256 of 5 concatenated keccak256("") sub-hashes
    // (empty processes, order_status, order_process_id, schemas, sellers
    // maps). Changed when settlement-anchored FIG emission was removed from
    // the kernel — devnet only, no mainnet impact. Source of truth going
    // forward; deploy scripts must use this value.
    assert_eq!(
        root_hex,
        "0x826c6f22e4362b1b34f080cc37deab3358df5d98592fd19534c28c1fb713fd8c"
    );
}
