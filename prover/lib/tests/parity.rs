/// Parity tests: verify the Rust kernel produces identical outputs
/// to the Solidity kernel for the same inputs.
///
/// The expected values are extracted from Foundry's ParityVectors test
/// (test/ParityVectors.t.sol) run with --via-ir -vvvv. The kernel is
/// frozen, so these vectors never move.
use alloy_primitives::{address, b256, Address, B256, U256, keccak256};
use k256::ecdsa::SigningKey;

use figaro_kernel::eip712::*;
use figaro_kernel::kernel::{apply_batch, clause_id_hash, compute_spec_bindings_hash};
use figaro_kernel::types::*;

// ── Witness-spec helpers ──────────────────────────────────────────
//
// Specs are witness inputs loaded from `clauses/` (the ClauseRegistry
// seed source) — nothing is embedded in the engine.

fn load_spec_json(clause_id_str: &str) -> String {
    let mut p = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    p.pop(); // prover/
    p.pop(); // repo root
    p.push("clauses");
    p.push(format!("{clause_id_str}.json"));
    std::fs::read_to_string(&p).unwrap_or_else(|e| panic!("read {}: {e}", p.display()))
}

fn parse_spec(spec_json: &str) -> figaro_clause::ClauseSpec {
    let value: serde_json::Value = serde_json::from_str(spec_json).expect("spec JSON");
    match figaro_clause::parse_clause_spec(&value) {
        figaro_clause::ParseClauseSpecResult::Ok(s) => s,
        figaro_clause::ParseClauseSpecResult::Err(errors) => panic!("spec parse: {errors:?}"),
    }
}

/// Canonical ABI encoding of `content` under the witness spec.
fn encode_content(spec_json: &str, content: &serde_json::Value, stage: u8) -> Vec<u8> {
    figaro_clause::encode_content_from_spec(
        &parse_spec(spec_json),
        content,
        figaro_clause::EncodeOptions { stage: Some(stage) },
    )
    .expect("canonical encoder must succeed")
}

/// The agreement Merkle leaf for a clause section:
/// `keccak256(keccak256(clauseId ++ keccak256(sectionData)))` — double-hashed
/// for leaf/node domain separation.
fn section_leaf(clause_key: &B256, section_data: &str) -> B256 {
    let mut preimage = [0u8; 64];
    preimage[..32].copy_from_slice(clause_key.as_slice());
    preimage[32..].copy_from_slice(keccak256(section_data.as_bytes()).as_slice());
    keccak256(keccak256(preimage))
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

// ── Signing helpers ───────────────────────────────────────────────

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

// ── Kernel parity (frozen vectors) ────────────────────────────────

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
fn test_clause_id_hash_matches_registry() {
    // keccak256(abi.encode("figaro-modalities", uint64(1))) — computed
    // with Solidity abi.encode semantics; the identity key every event
    // and the registry share.
    let expected = {
        // Hand-check the layout: [0x40][1][17]["figaro-modalities" padded]
        let mut data = Vec::new();
        data.extend_from_slice(&U256::from(0x40u64).to_be_bytes::<32>());
        data.extend_from_slice(&U256::from(1u64).to_be_bytes::<32>());
        data.extend_from_slice(&U256::from(17u64).to_be_bytes::<32>());
        let mut name = b"figaro-modalities".to_vec();
        name.resize(32, 0);
        data.extend_from_slice(&name);
        keccak256(&data)
    };
    assert_eq!(clause_id_hash("figaro-modalities", 1), expected);
}

// ── Full-batch kernel flows ───────────────────────────────────────

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
        provenance_clause: B256::ZERO,
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
        prev_state: empty_snapshot(),
        usage_claims: vec![],
        usage_period: 0,
        provenance_clause: B256::ZERO,
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
        usage_counted: vec![],
        usage_seller_seen: vec![],
        usage_accrual: vec![],
    }
}

// ── Attestation fixtures ──────────────────────────────────────────
//
// A single-section agreement whose one leaf commits the
// figaro-modalities section `{"modality":"delivery"}` — so
// agreementHash == leaf and the inclusion proof is empty, exactly the
// shape the coordinator verifies on the direct path.

const SECTION_DATA: &str = r#"{"modality":"delivery"}"#;

struct AttestFixture {
    spec_json: String,
    clause_key: B256,
    root: Commitment,
    process_id: B256,
    root_order_hash: B256,
}

fn attest_fixture() -> AttestFixture {
    let spec_json = load_spec_json("figaro-modalities");
    let spec = parse_spec(&spec_json);
    let clause_key = clause_id_hash(&spec.clause_id, spec.version);
    let leaf = section_leaf(&clause_key, SECTION_DATA);

    let root = Commitment {
        agreement_hash: leaf,
        salt: U256::from(4242u64),
        ..root_commitment()
    };
    let domain = domain_separator(CHAIN_ID, CORE);
    let struct_hash = commitment_struct_hash(&root);
    let process_id = typed_data_hash(&domain, &struct_hash);
    let root_order_hash = compute_order_hash(&process_id, &struct_hash);

    AttestFixture { spec_json, clause_key, root, process_id, root_order_hash }
}

/// A RuntimeWitness content proof for the fixture's section at stage 0.
fn runtime_witness_proof(f: &AttestFixture) -> (AttestationContentProof, B256) {
    let content: serde_json::Value = serde_json::from_str(SECTION_DATA).unwrap();
    let content_ref = keccak256(encode_content(&f.spec_json, &content, 0).as_slice());
    (
        AttestationContentProof {
            spec_json: f.spec_json.clone(),
            content_json: SECTION_DATA.to_string(),
            section_data: SECTION_DATA.to_string(),
            inclusion_proof: vec![],
            content_kind: ContentKind::RuntimeWitness,
        },
        content_ref,
    )
}

/// A ReAssert content proof: the content IS the committed sectionData.
fn re_assert_proof(f: &AttestFixture) -> (AttestationContentProof, B256) {
    let content_ref = keccak256(SECTION_DATA.as_bytes());
    (
        AttestationContentProof {
            spec_json: f.spec_json.clone(),
            content_json: SECTION_DATA.to_string(),
            section_data: SECTION_DATA.to_string(),
            inclusion_proof: vec![],
            content_kind: ContentKind::ReAssert,
        },
        content_ref,
    )
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
        provenance_clause: B256::ZERO,
    };
    apply_batch(&input)
}

fn seller_attest_op(
    f: &AttestFixture,
    proof: AttestationContentProof,
    content_ref: B256,
    signer: &SigningKey,
) -> KernelOp {
    let domain = domain_separator(CHAIN_ID, CORE);
    let struct_hash = attest_seller_struct_hash(&f.root_order_hash, &f.clause_key, 0, &content_ref);
    let digest = typed_data_hash(&domain, &struct_hash);
    KernelOp::AttestAsSeller {
        role: f.root.clone(),
        target: f.root.clone(),
        clause_id: f.clause_key,
        stage: 0,
        content_ref,
        seller_sig: sign_digest(signer, &digest),
        proof,
    }
}

// ── Attestation tests (current coordinator semantics) ─────────────

#[test]
fn attest_as_seller_runtime_witness_passes_all_gates() {
    let f = attest_fixture();
    let (proof, content_ref) = runtime_witness_proof(&f);
    let seller1_key = make_signing_key(SELLER1_KEY);
    let op = seller_attest_op(&f, proof, content_ref, &seller1_key);

    let (pv, _positions, events) = run_attest_batch(&f, op).unwrap();

    assert_eq!(events.attestations.len(), 1);
    let e = &events.attestations[0];
    assert_eq!(e.order_hash, f.root_order_hash);
    assert_eq!(e.process_id, f.process_id);
    assert_eq!(e.attester, SELLER1);
    assert_eq!(e.clause_id, f.clause_key);
    assert_eq!(e.content_ref, content_ref);

    // The spec binding is committed for on-chain verification against
    // ClauseRegistry.contentHashOf.
    assert_eq!(events.spec_bindings.len(), 1);
    assert_eq!(events.spec_bindings[0].clause_id, f.clause_key);
    assert_eq!(
        events.spec_bindings[0].spec_hash,
        keccak256(f.spec_json.as_bytes())
    );
    assert_eq!(
        pv.spec_bindings_hash,
        compute_spec_bindings_hash(&events.spec_bindings)
    );
}

#[test]
fn attest_as_buyer_re_assert_passes() {
    let f = attest_fixture();
    let (proof, content_ref) = re_assert_proof(&f);
    let buyer_key = make_signing_key(BUYER_KEY);

    let domain = domain_separator(CHAIN_ID, CORE);
    let struct_hash = attest_buyer_struct_hash(
        &f.process_id,
        &f.root_order_hash,
        &f.clause_key,
        0,
        &content_ref,
    );
    let digest = typed_data_hash(&domain, &struct_hash);
    let op = KernelOp::AttestAsBuyer {
        target: f.root.clone(),
        clause_id: f.clause_key,
        stage: 0,
        content_ref,
        buyer_sig: sign_digest(&buyer_key, &digest),
        proof,
    };

    let (_pv, _positions, events) = run_attest_batch(&f, op).unwrap();
    assert_eq!(events.attestations.len(), 1);
    assert_eq!(events.attestations[0].attester, BUYER);
    assert_eq!(events.attestations[0].content_ref, keccak256(SECTION_DATA.as_bytes()));
}

#[test]
fn attest_as_seller_wrong_signer_fails() {
    let f = attest_fixture();
    let (proof, content_ref) = runtime_witness_proof(&f);
    // SELLER2 signs, but role.seller is SELLER1.
    let seller2_key = make_signing_key(SELLER2_KEY);
    let op = seller_attest_op(&f, proof, content_ref, &seller2_key);

    match run_attest_batch(&f, op) {
        Err(KernelError::NotAuthorized) => {}
        other => panic!("expected NotAuthorized, got {other:?}"),
    }
}

#[test]
fn attest_as_buyer_wrong_signer_fails() {
    let f = attest_fixture();
    let (proof, content_ref) = re_assert_proof(&f);
    let seller1_key = make_signing_key(SELLER1_KEY); // not the buyer

    let domain = domain_separator(CHAIN_ID, CORE);
    let struct_hash = attest_buyer_struct_hash(
        &f.process_id,
        &f.root_order_hash,
        &f.clause_key,
        0,
        &content_ref,
    );
    let digest = typed_data_hash(&domain, &struct_hash);
    let op = KernelOp::AttestAsBuyer {
        target: f.root.clone(),
        clause_id: f.clause_key,
        stage: 0,
        content_ref,
        buyer_sig: sign_digest(&seller1_key, &digest),
        proof,
    };

    match run_attest_batch(&f, op) {
        Err(KernelError::NotAuthorized) => {}
        other => panic!("expected NotAuthorized, got {other:?}"),
    }
}

#[test]
fn attest_content_hash_mismatch_fails() {
    let f = attest_fixture();
    let (proof, _content_ref) = runtime_witness_proof(&f);
    let bogus_ref = keccak256("not the content");
    let seller1_key = make_signing_key(SELLER1_KEY);
    let op = seller_attest_op(&f, proof, bogus_ref, &seller1_key);

    match run_attest_batch(&f, op) {
        Err(KernelError::ContentHashMismatch) => {}
        other => panic!("expected ContentHashMismatch, got {other:?}"),
    }
}

#[test]
fn attest_invalid_content_fails() {
    let f = attest_fixture();
    let bad_content = r#"{"modality":"teleportation"}"#;
    let proof = AttestationContentProof {
        spec_json: f.spec_json.clone(),
        content_json: bad_content.to_string(),
        section_data: SECTION_DATA.to_string(),
        inclusion_proof: vec![],
        content_kind: ContentKind::RuntimeWitness,
    };
    let content_ref = keccak256("whatever");
    let seller1_key = make_signing_key(SELLER1_KEY);
    let op = seller_attest_op(&f, proof, content_ref, &seller1_key);

    match run_attest_batch(&f, op) {
        Err(KernelError::ClauseContentInvalid(_)) => {}
        other => panic!("expected ClauseContentInvalid, got {other:?}"),
    }
}

#[test]
fn attest_spec_identity_mismatch_fails() {
    let f = attest_fixture();
    // Supply the figaro-handoff spec under the figaro-modalities key —
    // a permissive-spec substitution the identity gate must reject.
    let wrong_spec = load_spec_json("figaro-handoff");
    let (mut proof, content_ref) = runtime_witness_proof(&f);
    proof.spec_json = wrong_spec;
    let seller1_key = make_signing_key(SELLER1_KEY);
    let op = seller_attest_op(&f, proof, content_ref, &seller1_key);

    match run_attest_batch(&f, op) {
        Err(KernelError::SpecIdentityMismatch(_)) => {}
        other => panic!("expected SpecIdentityMismatch, got {other:?}"),
    }
}

#[test]
fn attest_wrong_inclusion_proof_fails() {
    // Commit an order whose agreementHash does NOT contain the clause
    // leaf — the mandatory inclusion gate must reject.
    let f = attest_fixture();
    let mut stranger = f.root.clone();
    stranger.agreement_hash = keccak256("some other agreement");
    stranger.salt = U256::from(777u64);

    let domain = domain_separator(CHAIN_ID, CORE);
    let struct_hash = commitment_struct_hash(&stranger);
    let process_id = typed_data_hash(&domain, &struct_hash);
    let order_hash = compute_order_hash(&process_id, &struct_hash);

    let (proof, content_ref) = runtime_witness_proof(&f);
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
                role: stranger.clone(),
                target: stranger.clone(),
                clause_id: f.clause_key,
                stage: 0,
                content_ref,
                seller_sig: sign_digest(&seller1_key, &att_digest),
                proof,
            },
        ],
        prev_state: empty_snapshot(),
        usage_claims: vec![],
        usage_period: 0,
        provenance_clause: B256::ZERO,
    };

    match apply_batch(&input) {
        Err(KernelError::InvalidInclusionProof) => {}
        other => panic!("expected InvalidInclusionProof, got {other:?}"),
    }
}

#[test]
fn attest_on_resolved_order_fails() {
    // The evidence window closes at resolution — the coordinator's
    // OrderResolved gate, mirrored in the batch.
    let f = attest_fixture();
    let buyer_key = make_signing_key(BUYER_KEY);
    let seller1_key = make_signing_key(SELLER1_KEY);
    let domain = domain_separator(CHAIN_ID, CORE);

    let resolve_hash = resolve_struct_hash(&f.process_id);
    let resolve_sig = sign_digest(&buyer_key, &typed_data_hash(&domain, &resolve_hash));

    let (proof, content_ref) = runtime_witness_proof(&f);
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
                commitments: vec![f.root.clone()],
                buyer_sig: resolve_sig,
            },
            KernelOp::AttestAsSeller {
                role: f.root.clone(),
                target: f.root.clone(),
                clause_id: f.clause_key,
                stage: 0,
                content_ref,
                seller_sig: att_sig,
                proof,
            },
        ],
        prev_state: empty_snapshot(),
        usage_claims: vec![],
        usage_period: 0,
        provenance_clause: B256::ZERO,
    };

    match apply_batch(&input) {
        Err(KernelError::OrderResolved) => {}
        other => panic!("expected OrderResolved, got {other:?}"),
    }
}

#[test]
fn attest_cross_order_same_process_passes() {
    // role = the seller's own sub-order; target = the root order. The
    // inclusion proof opens against the TARGET's agreementHash.
    let f = attest_fixture();
    let buyer_key = make_signing_key(BUYER_KEY);
    let seller1_key = make_signing_key(SELLER1_KEY);
    let seller2_key = make_signing_key(SELLER2_KEY);
    let domain = domain_separator(CHAIN_ID, CORE);

    let sub = Commitment {
        process_id: f.process_id,
        buyer: BUYER,
        seller: SELLER2,
        currency: TOKEN,
        payment: U256::from(50_000_000_000_000_000_000u128),
        expected_cumulative_value: U256::from(150_000_000_000_000_000_000u128),
        agreement_hash: keccak256("sub-agreement"),
        salt: U256::from(43u64),
        deadline: U256::from(2000u64),
    };

    let (proof, content_ref) = runtime_witness_proof(&f);
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
                role: sub,
                target: f.root.clone(),
                clause_id: f.clause_key,
                stage: 0,
                content_ref,
                seller_sig: att_sig,
                proof,
            },
        ],
        prev_state: empty_snapshot(),
        usage_claims: vec![],
        usage_period: 0,
        provenance_clause: B256::ZERO,
    };

    let (_pv, _positions, events) = apply_batch(&input).unwrap();
    assert_eq!(events.attestations.len(), 1);
    assert_eq!(events.attestations[0].attester, SELLER2);
    assert_eq!(events.attestations[0].order_hash, f.root_order_hash);
}

// ── Determinism ───────────────────────────────────────────────────

#[test]
fn test_empty_state_root_is_deterministic() {
    use figaro_kernel::state::KernelState;
    let a = KernelState::new().compute_root();
    let b = KernelState::from_snapshot(&empty_snapshot()).compute_root();
    assert_eq!(a, b, "genesis root must be deterministic");
}
