/// Parity tests: verify the Rust mirror produces identical outputs
/// to FigaroCore for the same inputs.
///
/// The expected values are extracted from Foundry's EIP-712 parity test
/// (test/kernel/Eip712ParityTest.t.sol) run with --via-ir -vvvv. FigaroCore
/// is frozen, so these vectors never move.
use alloy_primitives::{address, b256, Address, B256, U256, keccak256};
use k256::ecdsa::SigningKey;

use figaro_kernel::eip712::*;
use figaro_kernel::kernel::{apply_batch, compute_spec_bindings_hash};
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
    let raw = std::fs::read_to_string(&p).unwrap_or_else(|e| panic!("read {}: {e}", p.display()));
    // The pinned bytes: the SDK's `canonicalize` — keys sorted at every
    // depth (serde_json's default map is sorted), compact. The specs loaded
    // here carry no array-index keys, which `JSON.stringify` would order
    // first; `sdk_clause_key` pins the result to the SDK's key.
    let value: serde_json::Value = serde_json::from_str(&raw).expect("spec JSON");
    let canonical = serde_json::to_string(&value).expect("serialize");
    assert_eq!(
        keccak256(canonical.as_bytes()),
        sdk_clause_key(clause_id_str),
        "{clause_id_str}: the loaded bytes are the pinned bytes"
    );
    canonical
}

/// The SDK's key for a clause in `clauses/`, from the harvested
/// `test/fixtures/clause-keys.json`.
fn sdk_clause_key(clause_id_str: &str) -> B256 {
    let mut p = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"));
    p.pop(); // prover/
    p.pop(); // repo root
    p.push("test/fixtures/clause-keys.json");
    let text = std::fs::read_to_string(&p).unwrap_or_else(|e| panic!("read {}: {e}", p.display()));
    let keys: serde_json::Value = serde_json::from_str(&text).expect("fixture JSON");
    keys[clause_id_str]
        .as_str()
        .unwrap_or_else(|| panic!("{clause_id_str} is not in the fixture"))
        .parse()
        .expect("bytes32")
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

/// The agreement Merkle leaf for a clause:
/// `keccak256(keccak256(clauseId ++ keccak256(clauseData)))` — double-hashed
/// for leaf/node domain separation.
fn clause_leaf(clause_key: &B256, clause_data: &str) -> B256 {
    let mut preimage = [0u8; 64];
    preimage[..32].copy_from_slice(clause_key.as_slice());
    preimage[32..].copy_from_slice(keccak256(clause_data.as_bytes()).as_slice());
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
const ROOT_STRUCT_HASH: B256 = b256!("f61125bef0f1916de4d1fd36fe243e3b513e6489b2b8827a4e62deb87e340da9");
const ROOT_DIGEST: B256 = b256!("a809fe3f6ab3509a130c6cd20bf910767b4ccafce5d46f8ad99d0e62f367c83b");
const PROCESS_ID: B256 = b256!("a809fe3f6ab3509a130c6cd20bf910767b4ccafce5d46f8ad99d0e62f367c83b");
const ROOT_ORDER_HASH: B256 = b256!("b9a9afa9c257441ff216d7f9abea2edbab8db358f55896bf4be58f9d9a76f8ea");
const SUB_STRUCT_HASH: B256 = b256!("d9a5cb004387bfb22c64bf61d3d263df2689df6b51144cd3ad18f684af1c3231");
const SUB_DIGEST: B256 = b256!("1536806c68219bb71421f3f57af5806054f8e5c21c207923234a45a103248845");
const SUB_ORDER_HASH: B256 = b256!("da9af386b03e8c5787b58f31ae5a4f5556f1142f40e2a2508af62d3ba2637e59");

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

// ── FigaroCore parity (frozen vectors) ────────────────────────────────

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
        provenance_leaf: B256::ZERO,
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

    // Sign resolve authorization over the process as it stands after both
    // commits: 100 + 50 ether.
    let resolved_value = sub.expected_cumulative_value;
    let resolve_hash = resolve_struct_hash(&PROCESS_ID, &resolved_value);
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
                cumulative_value: resolved_value,
                commitments: vec![root, sub],
                buyer_sig: resolve_sig,
            },
        ],
        prev_state: empty_snapshot(),
        usage_claims: vec![],
        usage_period: 0,
        provenance_leaf: B256::ZERO,
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
        checkout_hash: keccak256("test-agreement"),
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
        checkout_hash: keccak256("sub-agreement"),
        salt: U256::from(43u64),
        deadline: U256::from(2000u64),
    }
}

fn empty_snapshot() -> KernelStateSnapshot {
    KernelStateSnapshot {
        processes: vec![],
        order_status: vec![],
        order_process_id: vec![],
    }
}

// ── Attestation fixtures ──────────────────────────────────────────
//
// A single-clause agreement whose one leaf commits the
// figaro-modalities clause `{"modality":"delivery"}` — so
// checkoutHash == leaf and the inclusion proof is empty, exactly the
// shape the coordinator verifies on the direct path.

const CLAUSE_DATA: &str = r#"{"modality":"delivery"}"#;

struct AttestFixture {
    spec_json: String,
    clause_key: B256,
    root: Commitment,
    process_id: B256,
    root_order_hash: B256,
}

fn attest_fixture() -> AttestFixture {
    let spec_json = load_spec_json("figaro-modalities");
    // The clause key is keccak256 of the spec bytes the witness carries.
    let clause_key = keccak256(spec_json.as_bytes());
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

    AttestFixture { spec_json, clause_key, root, process_id, root_order_hash }
}

/// A RuntimeWitness content proof for the fixture's clause at stage 0.
fn runtime_witness_proof(f: &AttestFixture) -> (AttestationContentProof, B256) {
    let content: serde_json::Value = serde_json::from_str(CLAUSE_DATA).unwrap();
    let content_ref = keccak256(encode_content(&f.spec_json, &content, 0).as_slice());
    (
        AttestationContentProof {
            spec_json: f.spec_json.clone(),
            content_json: CLAUSE_DATA.to_string(),
            clause_data: CLAUSE_DATA.to_string(),
            inclusion_proof: vec![],
            content_kind: ContentKind::RuntimeWitness,
        },
        content_ref,
    )
}

/// A ReAssert content proof: the content IS the committed clauseData.
fn re_assert_proof(f: &AttestFixture) -> (AttestationContentProof, B256) {
    let content_ref = keccak256(CLAUSE_DATA.as_bytes());
    (
        AttestationContentProof {
            spec_json: f.spec_json.clone(),
            content_json: CLAUSE_DATA.to_string(),
            clause_data: CLAUSE_DATA.to_string(),
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
        provenance_leaf: B256::ZERO,
    };
    apply_batch(&input)
}

fn seller_attest_op(
    f: &AttestFixture,
    proof: AttestationContentProof,
    content_ref: B256,
    signer: &SigningKey,
) -> KernelOp {
    seller_attest_op_with(f, AttestationWitness::Plaintext(proof), content_ref, signer)
}

/// A seller attestation on the fixture's root order carrying `witness`
/// in whichever form the test picks.
fn seller_attest_op_with(
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

    // The spec binding is committed for on-chain verification: both
    // fields are the clause key, which the verifier checks is
    // ClauseRegistry.registered.
    assert_eq!(events.spec_bindings.len(), 1);
    assert_eq!(events.spec_bindings[0].clause_id, f.clause_key);
    assert_eq!(
        events.spec_bindings[0].spec_hash,
        keccak256(f.spec_json.as_bytes())
    );
    assert_eq!(
        events.spec_bindings[0].spec_hash, events.spec_bindings[0].clause_id,
        "the clause key is the spec hash"
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
        proof: AttestationWitness::Plaintext(proof),
    };

    let (_pv, _positions, events) = run_attest_batch(&f, op).unwrap();
    assert_eq!(events.attestations.len(), 1);
    assert_eq!(events.attestations[0].attester, BUYER);
    assert_eq!(events.attestations[0].content_ref, keccak256(CLAUSE_DATA.as_bytes()));
}

#[test]
fn attest_as_seller_wrong_signer_fails() {
    let f = attest_fixture();
    let (proof, content_ref) = runtime_witness_proof(&f);
    // SELLER2 signs, but target.seller is SELLER1.
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
        proof: AttestationWitness::Plaintext(proof),
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
        clause_data: CLAUSE_DATA.to_string(),
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
fn attest_lookalike_spec_under_the_same_name_fails() {
    // A spec carrying the same clauseId and version as the registered one,
    // one byte apart, is another clause: its bytes hash to another key.
    let f = attest_fixture();
    let (mut proof, content_ref) = runtime_witness_proof(&f);
    proof.spec_json.push('\n');
    let lookalike = parse_spec(&proof.spec_json);
    let original = parse_spec(&f.spec_json);
    assert_eq!(lookalike.clause_id, original.clause_id);
    assert_eq!(lookalike.version, original.version);
    let seller1_key = make_signing_key(SELLER1_KEY);
    let op = seller_attest_op(&f, proof, content_ref, &seller1_key);

    match run_attest_batch(&f, op) {
        Err(KernelError::SpecIdentityMismatch(_)) => {}
        other => panic!("expected SpecIdentityMismatch, got {other:?}"),
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
                target: stranger.clone(),
                clause_id: f.clause_key,
                stage: 0,
                content_ref,
                seller_sig: sign_digest(&seller1_key, &att_digest),
                proof: AttestationWitness::Plaintext(proof),
            },
        ],
        prev_state: empty_snapshot(),
        usage_claims: vec![],
        usage_period: 0,
        provenance_leaf: B256::ZERO,
    };

    match apply_batch(&input) {
        Err(KernelError::InvalidInclusionProof) => {}
        other => panic!("expected InvalidInclusionProof, got {other:?}"),
    }
}

// ── The hash-only form: the coordinator's arguments alone ─────────

/// The fixture's clause as the coordinator takes it: the committed
/// clauseData's hash and the inclusion proof (empty for the fixture's
/// single-clause agreement).
fn hash_only(clause_data_hash: B256, inclusion_proof: Vec<B256>) -> AttestationWitness {
    AttestationWitness::HashOnly { clause_data_hash, inclusion_proof }
}

/// A hash-only seller attestation is accepted on gate I alone: the event
/// carries the content reference as signed, and no spec binding is
/// committed, so the spec-bindings hash is the hash of none.
#[test]
fn a_hash_only_seller_attestation_is_accepted_and_commits_no_spec_binding() {
    let f = attest_fixture();
    let content_ref = keccak256("evidence the seller keeps");
    let seller1_key = make_signing_key(SELLER1_KEY);
    let witness = hash_only(keccak256(CLAUSE_DATA.as_bytes()), vec![]);
    let op = seller_attest_op_with(&f, witness, content_ref, &seller1_key);

    let (pv, _positions, events) = run_attest_batch(&f, op).unwrap();

    assert_eq!(events.attestations.len(), 1);
    let e = &events.attestations[0];
    assert_eq!(e.order_hash, f.root_order_hash);
    assert_eq!(e.process_id, f.process_id);
    assert_eq!(e.attester, SELLER1);
    assert_eq!(e.clause_id, f.clause_key);
    assert_eq!(e.stage, 0);
    assert_eq!(e.content_ref, content_ref);
    assert!(events.spec_bindings.is_empty(), "the hash-only form commits no spec binding");
    assert_eq!(pv.spec_bindings_hash, compute_spec_bindings_hash(&[]));
}

/// The buyer's hash-only attestation, likewise.
#[test]
fn a_hash_only_buyer_attestation_is_accepted() {
    let f = attest_fixture();
    let content_ref = keccak256("evidence the buyer keeps");
    let buyer_key = make_signing_key(BUYER_KEY);
    let domain = domain_separator(CHAIN_ID, CORE);
    let struct_hash =
        attest_buyer_struct_hash(&f.process_id, &f.root_order_hash, &f.clause_key, 0, &content_ref);
    let op = KernelOp::AttestAsBuyer {
        target: f.root.clone(),
        clause_id: f.clause_key,
        stage: 0,
        content_ref,
        buyer_sig: sign_digest(&buyer_key, &typed_data_hash(&domain, &struct_hash)),
        proof: hash_only(keccak256(CLAUSE_DATA.as_bytes()), vec![]),
    };

    let (_pv, _positions, events) = run_attest_batch(&f, op).unwrap();
    assert_eq!(events.attestations.len(), 1);
    assert_eq!(events.attestations[0].attester, BUYER);
    assert_eq!(events.attestations[0].content_ref, content_ref);
    assert!(events.spec_bindings.is_empty());
}

/// A clauseData hash the agreement never committed opens no leaf.
#[test]
fn a_hash_only_attestation_with_a_wrong_clause_data_hash_is_refused() {
    let f = attest_fixture();
    let seller1_key = make_signing_key(SELLER1_KEY);
    let witness = hash_only(keccak256(r#"{"modality":"pickup"}"#.as_bytes()), vec![]);
    let op = seller_attest_op_with(&f, witness, keccak256("evidence"), &seller1_key);

    match run_attest_batch(&f, op) {
        Err(KernelError::InvalidInclusionProof) => {}
        other => panic!("expected InvalidInclusionProof, got {other:?}"),
    }
}

/// A proof that does not open the committed leaf against the signed
/// checkoutHash is refused.
#[test]
fn a_hash_only_attestation_with_a_wrong_inclusion_proof_is_refused() {
    let f = attest_fixture();
    let seller1_key = make_signing_key(SELLER1_KEY);
    let witness = hash_only(keccak256(CLAUSE_DATA.as_bytes()), vec![keccak256("a sibling nobody committed")]);
    let op = seller_attest_op_with(&f, witness, keccak256("evidence"), &seller1_key);

    match run_attest_batch(&f, op) {
        Err(KernelError::InvalidInclusionProof) => {}
        other => panic!("expected InvalidInclusionProof, got {other:?}"),
    }
}

/// The hash-only form changes nothing about who may attest.
#[test]
fn a_hash_only_attestation_signed_by_another_wallet_is_refused() {
    let f = attest_fixture();
    let seller2_key = make_signing_key(SELLER2_KEY);
    let witness = hash_only(keccak256(CLAUSE_DATA.as_bytes()), vec![]);
    let op = seller_attest_op_with(&f, witness, keccak256("evidence"), &seller2_key);

    match run_attest_batch(&f, op) {
        Err(KernelError::NotAuthorized) => {}
        other => panic!("expected NotAuthorized, got {other:?}"),
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

    let resolve_hash = resolve_struct_hash(&f.process_id, &f.root.payment);
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
                cumulative_value: f.root.payment,
                commitments: vec![f.root.clone()],
                buyer_sig: resolve_sig,
            },
            KernelOp::AttestAsSeller {
                target: f.root.clone(),
                clause_id: f.clause_key,
                stage: 0,
                content_ref,
                seller_sig: att_sig,
                proof: AttestationWitness::Plaintext(proof),
            },
        ],
        prev_state: empty_snapshot(),
        usage_claims: vec![],
        usage_period: 0,
        provenance_leaf: B256::ZERO,
    };

    match apply_batch(&input) {
        Err(KernelError::OrderResolved) => {}
        other => panic!("expected OrderResolved, got {other:?}"),
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
        currency: TOKEN,
        payment: U256::from(50_000_000_000_000_000_000u128),
        expected_cumulative_value: U256::from(150_000_000_000_000_000_000u128),
        checkout_hash: keccak256("sub-agreement"),
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
                target: f.root.clone(),
                clause_id: f.clause_key,
                stage: 0,
                content_ref,
                seller_sig: att_sig,
                proof: AttestationWitness::Plaintext(proof),
            },
        ],
        prev_state: empty_snapshot(),
        usage_claims: vec![],
        usage_period: 0,
        provenance_leaf: B256::ZERO,
    };

    match apply_batch(&input) {
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
        provenance_leaf: B256::ZERO,
    };
    apply_batch(&input)
}

#[test]
fn a_commitment_lives_through_its_deadline_and_not_one_second_past() {
    // FigaroCore: `if (c.deadline < block.timestamp) revert DeadlineExpired()`.
    let deadline: u64 = root_commitment().deadline.try_into().unwrap();
    assert!(commit_at(deadline - 1).is_ok(), "before the deadline");
    assert!(commit_at(deadline).is_ok(), "AT the deadline the commitment is live");
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
    let (proof, content_ref) = runtime_witness_proof(&f);
    let op = seller_attest_op(&f, proof, content_ref, &make_signing_key(SELLER1_KEY));
    let input = BatchInput {
        chain_id: CHAIN_ID,
        verifying_contract: CORE,
        block_timestamp: 1000,
        operations: vec![op],
        prev_state: empty_snapshot(),
        usage_claims: vec![],
        usage_period: 0,
        provenance_leaf: B256::ZERO,
    };
    match apply_batch(&input) {
        Err(KernelError::UnknownOrder) => {}
        other => panic!("expected UnknownOrder, got {other:?}"),
    }
}

#[test]
fn the_state_root_binds_every_map_it_covers() {
    use figaro_kernel::state::KernelState;
    // The verifier chains batches by this root: a map the root does not
    // bind is state a prover may rewrite between batches.
    let base = {
        let mut s = empty_snapshot();
        s.processes = vec![(
            PROCESS_ID,
            ProcessState {
                root_buyer: BUYER,
                currency: TOKEN,
                cumulative_value: U256::from(100u64),
                active_order_count: 1,
            },
        )];
        s.order_status = vec![(ROOT_ORDER_HASH, 1)];
        s.order_process_id = vec![(ROOT_ORDER_HASH, PROCESS_ID)];
        s
    };
    let root_of = |s: &KernelStateSnapshot| KernelState::from_snapshot(s).compute_root();
    let base_root = root_of(&base);
    assert_ne!(base_root, root_of(&empty_snapshot()), "a populated state is not the empty one");

    let mut cases: Vec<(&str, KernelStateSnapshot)> = Vec::new();
    let mut s = base.clone();
    s.processes[0].1.cumulative_value = U256::from(101u64);
    cases.push(("a process's cumulative value", s));
    let mut s = base.clone();
    s.processes[0].1.active_order_count = 0;
    cases.push(("a process's active count", s));
    let mut s = base.clone();
    s.processes[0].1.root_buyer = SELLER1;
    cases.push(("a process's buyer", s));
    let mut s = base.clone();
    s.processes[0].1.currency = CORE;
    cases.push(("a process's currency", s));
    let mut s = base.clone();
    s.processes[0].0 = SUB_DIGEST;
    cases.push(("a process's id", s));
    let mut s = base.clone();
    s.order_status[0].1 = 2;
    cases.push(("an order's status", s));
    let mut s = base.clone();
    s.order_status[0].0 = SUB_ORDER_HASH;
    cases.push(("which order carries the status", s));
    let mut s = base.clone();
    s.order_process_id[0].1 = SUB_DIGEST;
    cases.push(("an order's process", s));
    let mut s = base.clone();
    s.order_process_id[0].0 = SUB_ORDER_HASH;
    cases.push(("which order belongs to the process", s));

    let mut roots = std::collections::BTreeSet::new();
    roots.insert(base_root);
    for (what, snapshot) in &cases {
        let root = root_of(snapshot);
        assert_ne!(root, base_root, "the root binds {what}");
        assert!(roots.insert(root), "changing {what} yields a root of its own");
    }

    // Insertion order is not state: the maps are ordered by key.
    let mut two = base.clone();
    two.order_status.push((SUB_ORDER_HASH, 1));
    let mut two_reversed = two.clone();
    two_reversed.order_status.reverse();
    assert_eq!(root_of(&two), root_of(&two_reversed), "the root ignores insertion order");
}

// ── Determinism ───────────────────────────────────────────────────

#[test]
fn test_empty_state_root_is_deterministic() {
    use figaro_kernel::state::KernelState;
    let a = KernelState::new().compute_root();
    let b = KernelState::from_snapshot(&empty_snapshot()).compute_root();
    assert_eq!(a, b, "genesis root must be deterministic");
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
        currency: TOKEN,
        payment: huge,
        expected_cumulative_value: huge,
        checkout_hash: keccak256("overflow"),
        salt: U256::from(1u64),
        deadline: U256::from(1_000_000u64),
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
        provenance_leaf: B256::ZERO,
    };
    let result = apply_batch(&input);
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
        currency: TOKEN,
        payment: U256::from(100u64),
        expected_cumulative_value: U256::from(100u64),
        checkout_hash,
        salt: U256::from(salt),
        deadline: U256::from(2000u64),
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
            cumulative_value: order.payment,
            commitments: vec![order.clone()],
            buyer_sig: sign_digest(&buyer_key, &typed_data_hash(&domain, &resolve_struct_hash(&process_id, &order.payment))),
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
        provenance_leaf: keccak256(b"figaro-agreement-provenance"),
    }
}

fn kind2(order: &Commitment, entry: &serde_json::Value) -> UsageClaim {
    UsageClaim {
        order: order.clone(),
        clause_or_assembly: hex32(&entry["agreementHash"]),
        kind: UsageClaimKind::Agreement {
            assembly_hash: hex32(&entry["provenance"]["assemblyHash"]),
        },
        inclusion_proof: vec![],
    }
}

fn kind1(order: &Commitment, composition: B256, agreement_hash: B256, slot_content_hash: B256, proof: Vec<B256>) -> UsageClaim {
    UsageClaim {
        order: order.clone(),
        clause_or_assembly: composition,
        kind: UsageClaimKind::Assembly {
            agreement_hash,
            slot_content_hash,
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
        let composition = hex32(&assembly["assemblyHash"]);
        for entry in assembly["agreements"].as_array().unwrap() {
            salt += 1;
            let (order, ops) = resolved_order_under(hex32(&entry["provenance"]["leaf"]), salt);
            let claims = vec![
                kind2(&order, entry),
                kind1(
                    &order,
                    composition,
                    hex32(&entry["agreementHash"]),
                    hex32(&entry["slotContentHash"]),
                    proof_list(&entry["membershipProof"]),
                ),
            ];
            let (_, _, events) = apply_batch(&claims_batch(ops, claims))
                .unwrap_or_else(|e| panic!("{} {}: {e}", assembly["label"], entry["id"]));
            let mut got: Vec<(B256, u8)> =
                events.uses.iter().map(|u| (u.clause_or_assembly, u.kind)).collect();
            got.sort();
            let mut want = vec![
                (hex32(&entry["agreementHash"]), USAGE_KIND_AGREEMENT),
                (composition, USAGE_KIND_ASSEMBLY),
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
    assert_eq!(entry["agreementHash"], one["agreements"][0]["agreementHash"]);
    let (order, ops) = resolved_order_under(hex32(&entry["provenance"]["leaf"]), 1);
    let claim = kind1(
        &order,
        hex32(&two["assemblyHash"]),
        hex32(&entry["agreementHash"]),
        hex32(&one["agreements"][0]["slotContentHash"]),
        proof_list(&one["agreements"][0]["membershipProof"]),
    );
    match apply_batch(&claims_batch(ops, vec![claim])).map(|_| ()) {
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
    claim.clause_or_assembly = hex32(&fx["assemblies"][2]["agreements"][0]["agreementHash"]);
    match apply_batch(&claims_batch(ops, vec![claim])).map(|_| ()) {
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
    let composition = hex32(&assembly["assemblyHash"]);
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
    let claim = kind1(&order, composition, terms_key, hex32(&terms["clauseDataHash"]), proof);
    match apply_batch(&claims_batch(ops, vec![claim])).map(|_| ()) {
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
        &typed_data_hash(&domain, &resolve_struct_hash(&PROCESS_ID, &signed_value)),
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
                process_id: PROCESS_ID,
                cumulative_value: signed_value,
                commitments: vec![root, sub],
                buyer_sig: resolve_sig,
            },
        ],
        prev_state: empty_snapshot(),
        usage_claims: vec![],
        usage_period: 0,
        provenance_leaf: B256::ZERO,
    }
}

/// The buyer signs a resolve while the process holds the root order alone
/// (cumulative value 100 ether); a second order the buyer co-signs commits
/// after (150 ether); applying the earlier authorization is refused, so the
/// second seller is never paid from an acceptance the buyer gave for the
/// root order alone.
#[test]
fn a_resolve_signed_before_a_later_commit_is_refused() {
    let signed = root_commitment().expected_cumulative_value;
    let current = sub_commitment().expected_cumulative_value;
    match apply_batch(&two_commits_then_resolve(signed)) {
        Err(KernelError::StaleResolveAuthorization { signed: s, current: c }) => {
            assert_eq!(s, signed, "the value the buyer signed");
            assert_eq!(c, current, "the value the process holds at application");
        }
        other => panic!("expected StaleResolveAuthorization, got {other:?}"),
    }
}

/// A resolve signed over the process's cumulative value at application
/// resolves both orders.
#[test]
fn a_resolve_signed_over_the_current_cumulative_value_resolves() {
    let current = sub_commitment().expected_cumulative_value;
    let (_pv, positions, _events) =
        apply_batch(&two_commits_then_resolve(current)).expect("resolves");
    let s2 = positions.iter().find(|p| p.user == SELLER2).unwrap();
    let ether = U256::from(1_000_000_000_000_000_000u64);
    assert_eq!(s2.payout, U256::from(350u64) * ether, "the second seller is paid");
}

/// A relay that rewrites the signed value to the process's current one
/// presents a value the buyer never signed: the signature recovers another
/// signer and the resolve is refused.
#[test]
fn a_resolve_whose_signed_value_was_rewritten_is_refused() {
    let mut input = two_commits_then_resolve(root_commitment().expected_cumulative_value);
    if let KernelOp::Resolve { cumulative_value, .. } = &mut input.operations[2] {
        *cumulative_value = sub_commitment().expected_cumulative_value;
    }
    match apply_batch(&input) {
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
    let KernelOp::Resolve { process_id, cumulative_value, commitments, .. } = input.operations.pop().unwrap() else {
        unreachable!("the fixture's third operation is the resolve")
    };
    input.operations.push(KernelOp::ResolveByWalletCode {
        process_id,
        cumulative_value,
        commitments,
        authorization: alloy_primitives::Bytes::copy_from_slice(authorization),
    });
    input
}

/// The guest cannot run the wallet's code, so it accepts a wallet-code
/// resolve on the process, the value and the order list alone, pays it out
/// as the first form, and publishes the authorization bytes in the
/// operation stream (public value 9), where `FigaroBatchVerifier` checks
/// them against the buyer's code at resolution.
#[test]
fn a_wallet_code_resolve_is_accepted_and_published_in_the_operation_stream() {
    let current = sub_commitment().expected_cumulative_value;
    let authorization = b"guardian-approval".to_vec();
    let input = two_commits_then_wallet_code_resolve(current, &authorization);
    let (pv, positions, _events) = apply_batch(&input).expect("a wallet-code resolve applies");
    let s2 = positions.iter().find(|p| p.user == SELLER2).unwrap();
    let ether = U256::from(1_000_000_000_000_000_000u64);
    assert_eq!(s2.payout, U256::from(350u64) * ether, "the second seller is paid");
    let stream = figaro_kernel::operation_stream::encode_operation_stream(&input.operations, &[]);
    assert_eq!(pv.operations_hash, keccak256(&stream), "the stream the guest commits carries the entry");
    let (ops, _) = figaro_kernel::operation_stream::decode_operation_stream(&stream).expect("decodes");
    match &ops[2] {
        KernelOp::ResolveByWalletCode { process_id, cumulative_value, authorization: a, .. } => {
            assert_eq!(*process_id, PROCESS_ID);
            assert_eq!(*cumulative_value, current);
            assert_eq!(a.as_ref(), authorization.as_slice(), "the bytes the verifier hands the buyer's code");
        }
        other => panic!("expected the wallet-code resolve, got {other:?}"),
    }
}

/// The wallet-code form binds the state as the first form does: bytes given
/// for the root order's value, applied after a second order commits, are
/// refused before any payout.
#[test]
fn a_wallet_code_resolve_for_a_passed_value_is_refused() {
    let signed = root_commitment().expected_cumulative_value;
    match apply_batch(&two_commits_then_wallet_code_resolve(signed, b"guardian-approval")) {
        Err(KernelError::StaleResolveAuthorization { signed: s, .. }) => assert_eq!(s, signed),
        other => panic!("expected StaleResolveAuthorization, got {other:?}"),
    }
}
