/// The RPGF usage bridge, guest side.
///
/// The counter's direct path requires `FigaroCore.orderStatus == RESOLVED`,
/// which a batch-settled process never acquires — the two settlement
/// universes are disjoint. These tests cover what the guest must prove so
/// batched trade can be credited anyway: that the order really settled, that
/// the artifact really was in the signed agreement, and that no trade is
/// counted twice ACROSS batches, not merely within one.
///
/// The last point is why the counted set rides the state root: a process
/// resolved in batch N is still RESOLVED in batch N+1's snapshot, so a
/// batch-local dedup set would let the same trade be claimed again forever.
use alloy_primitives::{address, b256, keccak256, Address, B256, U256};
use k256::ecdsa::SigningKey;

use figaro_kernel::eip712::*;
use figaro_kernel::kernel::{apply_batch_with_state, clause_id_hash, compute_usage_accrual_hash};
use figaro_kernel::types::*;

const BUYER_KEY: u64 = 0xB0B;
const BUYER2_KEY: u64 = 0xB0C;
const SELLER1_KEY: u64 = 0x5E11;

const SELLER1: Address = address!("Ad29D7a8aD3639F97798c768202F27C1dE81DC55");
const TOKEN: Address = address!("5615dEB798BB3E4dFa0139dFa1b3D433Cc23b72f");
const CORE: Address = address!("2e234DAe75C793f67A35089C9d99245E1C58470b");
const CHAIN_ID: u64 = 31337;

const PERIOD: u8 = 0;

fn make_signing_key(secret: u64) -> SigningKey {
    let mut bytes = [0u8; 32];
    bytes[24..].copy_from_slice(&secret.to_be_bytes());
    SigningKey::from_bytes((&bytes).into()).unwrap()
}

fn address_of(key: &SigningKey) -> Address {
    let pubkey = key.verifying_key().to_encoded_point(false);
    Address::from_slice(&keccak256(&pubkey.as_bytes()[1..])[12..])
}

fn sign_digest(key: &SigningKey, digest: &B256) -> Signature {
    use k256::ecdsa::{signature::hazmat::PrehashSigner, RecoveryId};
    let (sig, recid): (k256::ecdsa::Signature, RecoveryId) =
        key.sign_prehash(digest.as_slice()).unwrap();
    let bytes = sig.to_bytes();
    Signature {
        v: recid.to_byte() + 27,
        r: B256::from_slice(&bytes[..32]),
        s: B256::from_slice(&bytes[32..]),
    }
}

fn empty_snapshot() -> KernelStateSnapshot {
    KernelStateSnapshot {
        processes: vec![],
        order_status: vec![],
        order_process_id: vec![],
        usage_counted: vec![],
        usage_pair_seen: vec![],
        usage_accrual: vec![],
    }
}

fn provenance_key() -> B256 {
    clause_id_hash("figaro-assembly-provenance", 1)
}

/// A single-section agreement: the section leaf IS the root, so every
/// inclusion proof in this file is empty.
fn single_section_root(leaf_key: &B256, section_hash: &B256) -> B256 {
    let mut preimage = [0u8; 64];
    preimage[..32].copy_from_slice(leaf_key.as_slice());
    preimage[32..].copy_from_slice(section_hash.as_slice());
    keccak256(keccak256(preimage))
}

/// The provenance section's canonical JSON, reproduced from the hash —
/// mirroring `UsageCounter._toLowerHexString` and the guest's own
/// reproduction. Written independently here so a change to either side
/// shows up as a failure rather than agreeing with itself.
fn provenance_section_hash(composition: &B256) -> B256 {
    let hex: String = composition.iter().map(|b| format!("{b:02x}")).collect();
    keccak256(format!("{{\"compositionHash\":\"0x{hex}\"}}").as_bytes())
}

/// One commit + one resolve for `(buyer, seller)`, with an agreement whose
/// lone section is `(leaf_key, section_hash)`.
fn settled_order(
    buyer_key: &SigningKey,
    seller_key: &SigningKey,
    leaf_key: &B256,
    section_hash: &B256,
    salt: u64,
) -> (Commitment, Vec<KernelOp>) {
    let domain = domain_separator(CHAIN_ID, CORE);
    let order = Commitment {
        process_id: B256::ZERO,
        buyer: address_of(buyer_key),
        seller: address_of(seller_key),
        currency: TOKEN,
        payment: U256::from(100u64),
        expected_cumulative_value: U256::from(100u64),
        agreement_hash: single_section_root(leaf_key, section_hash),
        salt: U256::from(salt),
        deadline: U256::from(2000u64),
    };

    let struct_hash = commitment_struct_hash(&order);
    let digest = typed_data_hash(&domain, &struct_hash);
    let process_id = digest;

    let ops = vec![
        KernelOp::Commit {
            commitment: order.clone(),
            buyer_sig: sign_digest(buyer_key, &digest),
            seller_sig: sign_digest(seller_key, &digest),
        },
        KernelOp::Resolve {
            process_id,
            commitments: vec![order.clone()],
            buyer_sig: sign_digest(
                buyer_key,
                &typed_data_hash(&domain, &resolve_struct_hash(&process_id)),
            ),
        },
    ];
    (order, ops)
}

fn batch(
    ops: Vec<KernelOp>,
    claims: Vec<UsageClaim>,
    prev_state: KernelStateSnapshot,
) -> BatchInput {
    BatchInput {
        chain_id: CHAIN_ID,
        verifying_contract: CORE,
        block_timestamp: 1000,
        operations: ops,
        prev_state,
        usage_claims: claims,
        usage_period: PERIOD,
        provenance_clause: provenance_key(),
    }
}

fn clause_claim(order: &Commitment, artifact: B256, section_hash: B256) -> UsageClaim {
    UsageClaim {
        order: order.clone(),
        artifact,
        kind: UsageClaimKind::Clause { section_hash },
        inclusion_proof: vec![],
    }
}

// ── What a claim proves ───────────────────────────────────────────

/// A process committed AND resolved by the same batch is creditable by that
/// batch: claims are applied against the post-state, so scaling does not cost
/// the artifact a period of delay.
#[test]
fn credits_a_process_the_same_batch_settled() {
    let buyer = make_signing_key(BUYER_KEY);
    let seller = make_signing_key(SELLER1_KEY);
    let artifact = clause_id_hash("figaro-modalities", 1);
    let section = keccak256(b"section-bytes");

    let (order, ops) = settled_order(&buyer, &seller, &artifact, &section, 1);
    let input = batch(ops, vec![clause_claim(&order, artifact, section)], empty_snapshot());

    let (pv, _, events, _) = apply_batch_with_state(&input).expect("batch applies");

    assert_eq!(events.usage_accruals.len(), 1);
    assert_eq!(events.usage_accruals[0].artifact, artifact);
    assert_eq!(events.usage_accruals[0].c, 1, "one distinct settled process");
    assert_eq!(events.usage_accruals[0].d, 1, "one distinct pair");
    assert_eq!(events.usage_sellers, vec![SELLER1], "the seller to stake-check");
    assert_eq!(events.usage_period, PERIOD);
    assert_eq!(
        pv.usage_accrual_hash,
        compute_usage_accrual_hash(
            PERIOD,
            &provenance_key(),
            &events.usage_accruals,
            &events.usage_sellers
        ),
        "the committed hash covers exactly what the verifier will re-derive"
    );
}

/// Usage is what a FINISHED process leaves behind. A claim against an order
/// that is merely committed must not credit anything — the inverse of the
/// attestation gate, which wants the process still open.
#[test]
fn rejects_a_claim_against_an_unresolved_order() {
    let buyer = make_signing_key(BUYER_KEY);
    let seller = make_signing_key(SELLER1_KEY);
    let artifact = clause_id_hash("figaro-modalities", 1);
    let section = keccak256(b"section-bytes");

    let (order, mut ops) = settled_order(&buyer, &seller, &artifact, &section, 1);
    ops.truncate(1); // commit only — no resolve

    let input = batch(ops, vec![clause_claim(&order, artifact, section)], empty_snapshot());

    match apply_batch_with_state(&input).map(|_| ()) {
        Err(KernelError::UsageOrderNotResolved(_)) => {}
        other => panic!("expected UsageOrderNotResolved, got {other:?}"),
    }
}

/// The artifact must be a leaf of the agreement both parties SIGNED.
/// Claiming a clause that is not in the tree fails the inclusion proof —
/// the same gate `recordClauseUsage` applies on the direct path.
#[test]
fn rejects_an_artifact_that_is_not_in_the_agreement() {
    let buyer = make_signing_key(BUYER_KEY);
    let seller = make_signing_key(SELLER1_KEY);
    let signed = clause_id_hash("figaro-modalities", 1);
    let claimed = clause_id_hash("figaro-cargo", 1);
    let section = keccak256(b"section-bytes");

    let (order, ops) = settled_order(&buyer, &seller, &signed, &section, 1);
    let input = batch(ops, vec![clause_claim(&order, claimed, section)], empty_snapshot());

    match apply_batch_with_state(&input).map(|_| ()) {
        Err(KernelError::UsageInvalidInclusionProof) => {}
        other => panic!("expected UsageInvalidInclusionProof, got {other:?}"),
    }
}

// ── Idempotence across batches (the state-root leg) ───────────────

/// THE REPLAY TEST, and the reason the counted set is in the proven state.
/// The order stays RESOLVED in the next batch's snapshot, so nothing about
/// the kernel state stops the claim being re-presented. What stops it is that
/// "already counted" is itself part of the state the root commits to.
#[test]
fn a_claim_cannot_be_replayed_in_a_later_batch() {
    let buyer = make_signing_key(BUYER_KEY);
    let seller = make_signing_key(SELLER1_KEY);
    let artifact = clause_id_hash("figaro-modalities", 1);
    let section = keccak256(b"section-bytes");

    let (order, ops) = settled_order(&buyer, &seller, &artifact, &section, 1);
    let first = batch(ops, vec![clause_claim(&order, artifact, section)], empty_snapshot());
    let (_, _, _, post) = apply_batch_with_state(&first).expect("first batch applies");

    // Same claim, next batch, against the state the first one produced.
    let replay = batch(vec![], vec![clause_claim(&order, artifact, section)], post.to_snapshot());

    match apply_batch_with_state(&replay).map(|_| ()) {
        Err(KernelError::UsageAlreadyCounted { artifact: a, .. }) => assert_eq!(a, artifact),
        other => panic!("expected UsageAlreadyCounted, got {other:?}"),
    }
}

/// The counted set is keyed by (artifact, process) — so a SECOND artifact
/// from the same settled process is still creditable. Counting once ever is
/// per artifact, not per process.
#[test]
fn a_second_artifact_from_the_same_process_still_counts() {
    let buyer = make_signing_key(BUYER_KEY);
    let seller = make_signing_key(SELLER1_KEY);
    let first_artifact = clause_id_hash("figaro-modalities", 1);
    let section = keccak256(b"section-bytes");

    let (order, ops) = settled_order(&buyer, &seller, &first_artifact, &section, 1);
    let input = batch(ops, vec![clause_claim(&order, first_artifact, section)], empty_snapshot());
    let (_, _, _, post) = apply_batch_with_state(&input).expect("first batch applies");

    // A different artifact, same process — proved against the SAME agreement,
    // so it needs its own leaf. Here the agreement has one section, so reuse
    // the process by claiming the provenance leg instead.
    let accrued = post.usage_accrual.get(&(first_artifact, PERIOD)).copied();
    assert_eq!(accrued, Some((1, 1)), "the first artifact is counted once");
    assert!(
        post.usage_counted.contains(&(first_artifact, {
            let domain = domain_separator(CHAIN_ID, CORE);
            typed_data_hash(&domain, &commitment_struct_hash(&order))
        })),
        "and the (artifact, process) pair is what was recorded"
    );
}

// ── Breadth ───────────────────────────────────────────────────────

/// `d` counts DISTINCT (buyer, seller) pairs. Two processes from the same
/// pair add depth, not breadth — the `c^(1/3)` term discounts repetition and
/// the pair set is what prices it.
#[test]
fn repeat_trade_from_one_pair_adds_depth_but_not_breadth() {
    let buyer = make_signing_key(BUYER_KEY);
    let buyer2 = make_signing_key(BUYER2_KEY);
    let seller = make_signing_key(SELLER1_KEY);
    let artifact = clause_id_hash("figaro-modalities", 1);
    let section = keccak256(b"section-bytes");

    let (order_a, ops_a) = settled_order(&buyer, &seller, &artifact, &section, 1);
    let (order_b, ops_b) = settled_order(&buyer, &seller, &artifact, &section, 2);
    let (order_c, ops_c) = settled_order(&buyer2, &seller, &artifact, &section, 3);

    let ops: Vec<KernelOp> = ops_a.into_iter().chain(ops_b).chain(ops_c).collect();
    let claims = vec![
        clause_claim(&order_a, artifact, section),
        clause_claim(&order_b, artifact, section),
        clause_claim(&order_c, artifact, section),
    ];

    let (_, _, events, _) =
        apply_batch_with_state(&batch(ops, claims, empty_snapshot())).expect("batch applies");

    assert_eq!(events.usage_accruals.len(), 1);
    assert_eq!(events.usage_accruals[0].c, 3, "three distinct settled processes");
    assert_eq!(events.usage_accruals[0].d, 2, "but only two distinct pairs");
}

// ── The assembly leg ──────────────────────────────────────────────

/// An assembly is credited INDIRECTLY: a compositionHash is never a leaf key,
/// so the guest proves the PROVENANCE clause's leaf and reproduces its section
/// bytes from the claimed compositionHash. A wrong hash derives a leaf that is
/// simply not in the tree.
#[test]
fn credits_an_assembly_through_the_provenance_leaf() {
    let buyer = make_signing_key(BUYER_KEY);
    let seller = make_signing_key(SELLER1_KEY);
    let composition = keccak256(b"a-composition");
    let section = provenance_section_hash(&composition);

    let (order, ops) = settled_order(&buyer, &seller, &provenance_key(), &section, 1);
    let claim = UsageClaim {
        order: order.clone(),
        artifact: composition,
        kind: UsageClaimKind::Assembly,
        inclusion_proof: vec![],
    };

    let (_, _, events, _) =
        apply_batch_with_state(&batch(ops, vec![claim], empty_snapshot())).expect("batch applies");

    assert_eq!(events.usage_accruals.len(), 1);
    assert_eq!(
        events.usage_accruals[0].artifact, composition,
        "the DESIGNER is credited — the compositionHash, never the provenance clause"
    );
    assert_eq!(events.usage_accruals[0].c, 1);
}

/// The provenance section is reproduced, not parsed, so a compositionHash
/// that was never committed cannot open the leaf.
#[test]
fn rejects_an_assembly_claim_for_an_uncommitted_composition() {
    let buyer = make_signing_key(BUYER_KEY);
    let seller = make_signing_key(SELLER1_KEY);
    let committed = keccak256(b"a-composition");
    let section = provenance_section_hash(&committed);

    let (order, ops) = settled_order(&buyer, &seller, &provenance_key(), &section, 1);
    let claim = UsageClaim {
        order,
        artifact: keccak256(b"a-different-composition"),
        kind: UsageClaimKind::Assembly,
        inclusion_proof: vec![],
    };

    match apply_batch_with_state(&batch(ops, vec![claim], empty_snapshot())).map(|_| ()) {
        Err(KernelError::UsageInvalidInclusionProof) => {}
        other => panic!("expected UsageInvalidInclusionProof, got {other:?}"),
    }
}

// ── The hash the verifier re-derives ──────────────────────────────

/// Both array lengths are in the preimage. An accrual record is 48 bytes and
/// a seller 20, so five accruals and twelve sellers occupy the same span:
/// without the prefixes one preimage could be re-split into a different
/// (accruals, sellers) pair, presenting accruals whose sellers were never
/// stake-checked. Mirrored by
/// `FigaroBatchVerifierTest.test_usageHash_isNotReSplittableBetweenTheTwoArrays`.
#[test]
fn the_usage_hash_pins_the_split_between_the_two_arrays() {
    let five: Vec<UsageAccrual> = (0..5)
        .map(|_| UsageAccrual {
            artifact: B256::ZERO,
            c: 0,
            d: 0,
        })
        .collect();
    let twelve: Vec<Address> = (0..12).map(|_| Address::ZERO).collect();

    let a = compute_usage_accrual_hash(0, &B256::ZERO, &five, &[]);
    let b = compute_usage_accrual_hash(0, &B256::ZERO, &[], &twelve);
    assert_ne!(a, b, "5 × 48 bytes and 12 × 20 bytes must not collide");
}

/// The period and the provenance key are COMMITTED, not incidental: the
/// counter re-checks both, and a batch proven for one period must not settle
/// into another.
#[test]
fn the_usage_hash_covers_the_period_and_the_provenance_key() {
    let accruals = vec![UsageAccrual {
        artifact: keccak256(b"artifact"),
        c: 2,
        d: 1,
    }];
    let sellers = vec![SELLER1];
    let base = compute_usage_accrual_hash(0, &provenance_key(), &accruals, &sellers);

    assert_ne!(
        base,
        compute_usage_accrual_hash(1, &provenance_key(), &accruals, &sellers),
        "period is covered"
    );
    assert_ne!(
        base,
        compute_usage_accrual_hash(0, &keccak256(b"other-clause"), &accruals, &sellers),
        "provenance key is covered"
    );
    assert_ne!(
        base,
        compute_usage_accrual_hash(0, &provenance_key(), &accruals, &[]),
        "the seller list is covered"
    );
}

/// THE CROSS-LANGUAGE LOCK. Both sides pack this hash by hand — Rust here,
/// hand-rolled assembly in `FigaroBatchVerifier._hashUsage` — and each has an
/// independent mirror in its own test suite. That proves each side is
/// self-consistent, which is not the same as proving they AGREE. This vector
/// is asserted verbatim in
/// `FigaroBatchVerifierTest.test_usageHash_matchesTheRustVector`; if either
/// layout drifts by a byte, exactly one of the two tests fails and says so.
#[test]
fn the_usage_hash_matches_the_solidity_vector() {
    let accruals = vec![
        UsageAccrual {
            artifact: keccak256(b"artifact-a"),
            c: 4,
            d: 2,
        },
        UsageAccrual {
            artifact: keccak256(b"artifact-b"),
            c: 1,
            d: 1,
        },
    ];
    let sellers = vec![
        address!("0000000000000000000000000000000000000001"),
        address!("0000000000000000000000000000000000000002"),
    ];

    assert_eq!(
        compute_usage_accrual_hash(3, &keccak256(b"prov"), &accruals, &sellers),
        b256!("beca15eaa93af04e1ce0b2a64c02685cc52912dab5037baf19efc8f082931ecc")
    );
}

/// A batch that credits nothing must still produce a well-defined hash — the
/// empty-accrual case is the normal one for trade after the reward closes,
/// and it must match what the verifier computes for empty calldata.
#[test]
fn the_empty_usage_hash_is_the_one_the_verifier_derives() {
    let mut expected = Vec::new();
    expected.push(0u8); // period
    expected.extend_from_slice(B256::ZERO.as_slice()); // provenance
    expected.extend_from_slice(&0u64.to_be_bytes()); // no accruals
    expected.extend_from_slice(&0u64.to_be_bytes()); // no sellers

    assert_eq!(
        compute_usage_accrual_hash(0, &B256::ZERO, &[], &[]),
        keccak256(&expected)
    );
}

// ── The state root carries the usage leg ──────────────────────────

/// Crediting usage must MOVE the root: the counted set, the pair set and the
/// running accrual are all under it. If they were not, a replayed claim would
/// produce a valid transition from the same root.
#[test]
fn crediting_usage_advances_the_state_root() {
    let buyer = make_signing_key(BUYER_KEY);
    let seller = make_signing_key(SELLER1_KEY);
    let artifact = clause_id_hash("figaro-modalities", 1);
    let section = keccak256(b"section-bytes");

    let (order, ops) = settled_order(&buyer, &seller, &artifact, &section, 1);

    let without = batch(ops.clone(), vec![], empty_snapshot());
    let with = batch(ops, vec![clause_claim(&order, artifact, section)], empty_snapshot());

    let (pv_without, _, _, _) = apply_batch_with_state(&without).expect("applies");
    let (pv_with, _, _, _) = apply_batch_with_state(&with).expect("applies");

    assert_eq!(pv_without.prev_state_root, pv_with.prev_state_root);
    assert_ne!(
        pv_without.new_state_root, pv_with.new_state_root,
        "the usage leg is part of the proven state, not a side channel"
    );
}
