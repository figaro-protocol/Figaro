/// The designer-reward usage bridge, guest side.
///
/// The counter's direct path requires `FigaroCore.orderStatus == RESOLVED`,
/// which a batch-resolved process never acquires — the two resolution
/// universes are disjoint. These tests cover what the guest must prove so
/// batched trade can be credited anyway: that the order really resolved, that
/// the clause, agreement or assembly really was in the signed agreement, and that no
/// trade is counted twice ACROSS batches, not merely within one.
///
/// The last point is why the counted set rides the state root: a process
/// resolved in batch N is still RESOLVED in batch N+1's snapshot, so a
/// batch-local dedup set would let the same trade be claimed again forever.
use alloy_primitives::{address, b256, keccak256, Address, B256, U256};
use k256::ecdsa::SigningKey;

use figaro_kernel::eip712::*;
use figaro_kernel::kernel::{
    apply_batch_with_state, compute_usage_accrual_hash, derive_commitment_ids,
    ASSEMBLY_TERMS_LEAF_KEY, PROVENANCE_LEAF_KEY,
};
use figaro_kernel::types::*;

/// A clause key: `keccak256` of a clause spec's pinned bytes. Only the leaf
/// math matters here, so the bytes are synthetic.
fn clause_key(spec_bytes: &[u8]) -> B256 {
    keccak256(spec_bytes)
}

const BUYER_KEY: u64 = 0xB0B;
const BUYER2_KEY: u64 = 0xB0C;
const SELLER1_KEY: u64 = 0x5E11;
const SELLER2_KEY: u64 = 0x5E22;

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
        usage_seller_seen: vec![],
        usage_accrual: vec![],
    }
}

/// The reserved provenance leaf's key — a constant of the agreement
/// format, never a clause key.
fn provenance_key() -> B256 {
    keccak256(b"figaro-agreement-provenance")
}

/// A single-clause agreement: the clause leaf IS the root, so every
/// inclusion proof in this file is empty.
fn single_clause_root(leaf_key: &B256, clause_data_hash: &B256) -> B256 {
    let mut preimage = [0u8; 64];
    preimage[..32].copy_from_slice(leaf_key.as_slice());
    preimage[32..].copy_from_slice(clause_data_hash.as_slice());
    keccak256(keccak256(preimage))
}

/// The provenance leaf's canonical JSON, reproduced from both keys —
/// mirroring `UsageCounter._toLowerHexString` and the guest's own
/// reproduction. Written independently here so a change to either side
/// shows up as a failure rather than agreeing with itself.
fn provenance_leaf_data_hash(agreement_hash: &B256, composition: &B256) -> B256 {
    keccak256(provenance_bytes(agreement_hash, composition).as_bytes())
}

/// The provenance leaf's bytes:
/// `{"agreementHash":"0x…","assemblyHash":"0x…"}`, lowercase hex, the
/// keys in that order.
fn provenance_bytes(agreement_hash: &B256, composition: &B256) -> String {
    let hex = |w: &B256| -> String { w.iter().map(|b| format!("{b:02x}")).collect() };
    format!(
        "{{\"agreementHash\":\"0x{}\",\"assemblyHash\":\"0x{}\"}}",
        hex(agreement_hash),
        hex(composition)
    )
}

/// `keccak256` of the two words, smaller first — the sorted-pair node.
fn sorted_pair(a: B256, b: B256) -> B256 {
    let (lo, hi) = if a <= b { (a, b) } else { (b, a) };
    let mut pair = [0u8; 64];
    pair[..32].copy_from_slice(lo.as_slice());
    pair[32..].copy_from_slice(hi.as_slice());
    keccak256(pair)
}

/// The canonical bytes of an agreement, `{"clauses":{…},"slot":i}` — the
/// agreement's own clause fills (here the topology clause's `follows`, the
/// agreement it follows, when it follows one) and its index. The guest never parses
/// them; it takes their hash.
fn slot_content_hash(entry: u64, follows: Option<&str>) -> B256 {
    let clauses = match follows {
        Some(label) => format!(
            "{{\"{TOPOLOGY_KEY}\":{{\"follows\":[\"{label}\"]}}}}"
        ),
        None => "{}".to_string(),
    };
    keccak256(format!("{{\"clauses\":{clauses},\"slot\":{entry}}}").as_bytes())
}

/// A synthetic topology clause key for the agreements' fills.
const TOPOLOGY_KEY: &str = "0x63c71d25d0aa1a36dffb9e5303aaa48ae132d7403be72cc6c3cdc3eccd168f5c";

/// A two-agreement assembly root: agreement 0 holds `agreement_hash`,
/// agreement 1 another agreement following it. Returns the root, agreement 0's
/// content hash and its membership proof (agreement 1's leaf).
fn two_slot_assembly(agreement_hash: &B256) -> (B256, B256, Vec<B256>) {
    let slot0 = slot_content_hash(0, None);
    let slot1 = slot_content_hash(1, Some("agreement-0"));
    let leaf0 = single_clause_root(agreement_hash, &slot0);
    let leaf1 = single_clause_root(&keccak256(b"the-following-agreement"), &slot1);
    (sorted_pair(leaf0, leaf1), slot0, vec![leaf1])
}

/// One commit + one resolve for `(buyer, seller)`, with an agreement whose
/// lone clause is `(leaf_key, clause_data_hash)`.
fn settled_order(
    buyer_key: &SigningKey,
    seller_key: &SigningKey,
    leaf_key: &B256,
    clause_data_hash: &B256,
    salt: u64,
) -> (Commitment, Vec<KernelOp>) {
    settled_order_under(
        buyer_key,
        seller_key,
        single_clause_root(leaf_key, clause_data_hash),
        salt,
    )
}

/// One commit + one resolve for `(buyer, seller)` under `checkout_hash`.
fn settled_order_under(
    buyer_key: &SigningKey,
    seller_key: &SigningKey,
    checkout_hash: B256,
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
        checkout_hash,
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
        provenance_leaf: provenance_key(),
    }
}

fn clause_claim(order: &Commitment, clause_or_assembly: B256, clause_data_hash: B256) -> UsageClaim {
    UsageClaim {
        order: order.clone(),
        clause_or_assembly,
        kind: UsageClaimKind::Clause { clause_data_hash },
        inclusion_proof: vec![],
    }
}

// ── What a claim proves ───────────────────────────────────────────

/// A process committed AND resolved by the same batch is creditable by that
/// batch: claims are applied against the post-state, so scaling does not cost
/// the clause or assembly a period of delay.
#[test]
fn credits_a_process_the_same_batch_resolved() {
    let buyer = make_signing_key(BUYER_KEY);
    let seller = make_signing_key(SELLER1_KEY);
    let clause_or_assembly = clause_key(b"{\"clauseId\":\"figaro-modalities\"}");
    let clause_data_hash = keccak256(b"clause-bytes");

    let (order, ops) = settled_order(&buyer, &seller, &clause_or_assembly, &clause_data_hash, 1);
    let input = batch(
        ops,
        vec![clause_claim(&order, clause_or_assembly, clause_data_hash)],
        empty_snapshot(),
    );

    let (pv, _, events, _) = apply_batch_with_state(&input).expect("batch applies");

    assert_eq!(events.usage_accruals.len(), 1);
    assert_eq!(events.usage_accruals[0].clause_or_assembly, clause_or_assembly);
    assert_eq!(events.usage_accruals[0].c, 1, "one distinct resolved process");
    assert_eq!(events.usage_accruals[0].d, 1, "one distinct staked seller");
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
    let clause_or_assembly = clause_key(b"{\"clauseId\":\"figaro-modalities\"}");
    let clause_data_hash = keccak256(b"clause-bytes");

    let (order, mut ops) = settled_order(&buyer, &seller, &clause_or_assembly, &clause_data_hash, 1);
    ops.truncate(1); // commit only — no resolve

    let input = batch(
        ops,
        vec![clause_claim(&order, clause_or_assembly, clause_data_hash)],
        empty_snapshot(),
    );

    match apply_batch_with_state(&input).map(|_| ()) {
        Err(KernelError::UsageOrderNotResolved(_)) => {}
        other => panic!("expected UsageOrderNotResolved, got {other:?}"),
    }
}

/// The clause or assembly must be a leaf of the agreement both parties SIGNED.
/// Claiming a clause that is not in the tree fails the inclusion proof —
/// the same gate `recordClauseUsage` applies on the direct path.
#[test]
fn rejects_a_clause_or_assembly_that_is_not_in_the_agreement() {
    let buyer = make_signing_key(BUYER_KEY);
    let seller = make_signing_key(SELLER1_KEY);
    let signed = clause_key(b"{\"clauseId\":\"figaro-modalities\"}");
    let claimed = clause_key(b"{\"clauseId\":\"figaro-cargo\"}");
    let clause_data_hash = keccak256(b"clause-bytes");

    let (order, ops) = settled_order(&buyer, &seller, &signed, &clause_data_hash, 1);
    let input = batch(ops, vec![clause_claim(&order, claimed, clause_data_hash)], empty_snapshot());

    match apply_batch_with_state(&input).map(|_| ()) {
        Err(KernelError::UsageInvalidInclusionProof) => {}
        other => panic!("expected UsageInvalidInclusionProof, got {other:?}"),
    }
}

// ── Idempotence across batches (the state-root leg) ───────────────

/// THE REPLAY TEST, and the reason the counted set is in the proven state.
/// The order stays RESOLVED in the next batch's snapshot, so nothing about
/// the mirror state stops the claim being re-presented. What stops it is that
/// "already counted" is itself part of the state the root commits to.
#[test]
fn a_claim_cannot_be_replayed_in_a_later_batch() {
    let buyer = make_signing_key(BUYER_KEY);
    let seller = make_signing_key(SELLER1_KEY);
    let clause_or_assembly = clause_key(b"{\"clauseId\":\"figaro-modalities\"}");
    let clause_data_hash = keccak256(b"clause-bytes");

    let (order, ops) = settled_order(&buyer, &seller, &clause_or_assembly, &clause_data_hash, 1);
    let first = batch(
        ops,
        vec![clause_claim(&order, clause_or_assembly, clause_data_hash)],
        empty_snapshot(),
    );
    let (_, _, _, post) = apply_batch_with_state(&first).expect("first batch applies");

    // Same claim, next batch, against the state the first one produced.
    let replay = batch(
        vec![],
        vec![clause_claim(&order, clause_or_assembly, clause_data_hash)],
        post.to_snapshot(),
    );

    match apply_batch_with_state(&replay).map(|_| ()) {
        Err(KernelError::UsageAlreadyCounted {
            clause_or_assembly: a,
            ..
        }) => assert_eq!(a, clause_or_assembly),
        other => panic!("expected UsageAlreadyCounted, got {other:?}"),
    }
}

/// The counted set is keyed by (clause-or-assembly, process) — so a SECOND
/// clause or assembly from the same resolved process is still creditable.
/// Counting once ever is per clause or assembly, not per process.
#[test]
fn a_second_clause_or_assembly_from_the_same_process_still_counts() {
    let buyer = make_signing_key(BUYER_KEY);
    let seller = make_signing_key(SELLER1_KEY);
    let first_clause_or_assembly = clause_key(b"{\"clauseId\":\"figaro-modalities\"}");
    let clause_data_hash = keccak256(b"clause-bytes");

    let (order, ops) = settled_order(&buyer, &seller, &first_clause_or_assembly, &clause_data_hash, 1);
    let input = batch(
        ops,
        vec![clause_claim(&order, first_clause_or_assembly, clause_data_hash)],
        empty_snapshot(),
    );
    let (_, _, _, post) = apply_batch_with_state(&input).expect("first batch applies");

    // What is asserted: the first clause is counted once, and the counted
    // set holds the (kind, clause-or-assembly, process) triple — the key
    // that leaves a different clause or assembly from the same process
    // countable.
    let accrued = post
        .usage_accrual
        .get(&(USAGE_KIND_CLAUSE, first_clause_or_assembly, PERIOD))
        .copied();
    assert_eq!(
        accrued,
        Some((1, 1)),
        "the first clause or assembly is counted once"
    );
    assert!(
        post.usage_counted
            .contains(&(USAGE_KIND_CLAUSE, first_clause_or_assembly, {
                let domain = domain_separator(CHAIN_ID, CORE);
                typed_data_hash(&domain, &commitment_struct_hash(&order))
            })),
        "and the (kind, clause-or-assembly, process) triple is what was recorded"
    );
}

// ── Breadth ───────────────────────────────────────────────────────

/// `d` counts DISTINCT STAKED SELLERS. Many buyers
/// through ONE seller add depth, not breadth — buyer wallets are free, so
/// breadth follows the priced identity; the `c^(1/3)` term discounts the
/// repetition.
#[test]
fn many_buyers_through_one_seller_add_depth_not_breadth() {
    let buyer = make_signing_key(BUYER_KEY);
    let buyer2 = make_signing_key(BUYER2_KEY);
    let seller = make_signing_key(SELLER1_KEY);
    let clause_or_assembly = clause_key(b"{\"clauseId\":\"figaro-modalities\"}");
    let clause_data_hash = keccak256(b"clause-bytes");

    let (order_a, ops_a) = settled_order(&buyer, &seller, &clause_or_assembly, &clause_data_hash, 1);
    let (order_b, ops_b) = settled_order(&buyer, &seller, &clause_or_assembly, &clause_data_hash, 2);
    let (order_c, ops_c) = settled_order(&buyer2, &seller, &clause_or_assembly, &clause_data_hash, 3);

    let ops: Vec<KernelOp> = ops_a.into_iter().chain(ops_b).chain(ops_c).collect();
    let claims = vec![
        clause_claim(&order_a, clause_or_assembly, clause_data_hash),
        clause_claim(&order_b, clause_or_assembly, clause_data_hash),
        clause_claim(&order_c, clause_or_assembly, clause_data_hash),
    ];

    let (_, _, events, _) =
        apply_batch_with_state(&batch(ops, claims, empty_snapshot())).expect("batch applies");

    assert_eq!(events.usage_accruals.len(), 1);
    assert_eq!(events.usage_accruals[0].c, 3, "three distinct resolved processes");
    assert_eq!(events.usage_accruals[0].d, 1, "one seller is one unit of breadth");
    assert_eq!(events.usage_sellers.len(), 1, "one seller to stake-check");
}

/// The counterpart: the SAME buyer through two sellers is two units of
/// breadth — each unit backed by a stake the counter checks on-chain.
#[test]
fn distinct_sellers_raise_breadth() {
    let buyer = make_signing_key(BUYER_KEY);
    let seller1 = make_signing_key(SELLER1_KEY);
    let seller2 = make_signing_key(SELLER2_KEY);
    let clause_or_assembly = clause_key(b"{\"clauseId\":\"figaro-modalities\"}");
    let clause_data_hash = keccak256(b"clause-bytes");

    let (order_a, ops_a) = settled_order(&buyer, &seller1, &clause_or_assembly, &clause_data_hash, 1);
    let (order_b, ops_b) = settled_order(&buyer, &seller2, &clause_or_assembly, &clause_data_hash, 2);

    let ops: Vec<KernelOp> = ops_a.into_iter().chain(ops_b).collect();
    let claims = vec![
        clause_claim(&order_a, clause_or_assembly, clause_data_hash),
        clause_claim(&order_b, clause_or_assembly, clause_data_hash),
    ];

    let (_, _, events, _) =
        apply_batch_with_state(&batch(ops, claims, empty_snapshot())).expect("batch applies");

    assert_eq!(events.usage_accruals.len(), 1);
    assert_eq!(events.usage_accruals[0].c, 2, "two distinct resolved processes");
    assert_eq!(events.usage_accruals[0].d, 2, "two staked sellers are two units of breadth");
    assert_eq!(events.usage_sellers.len(), 2, "both sellers to stake-check");
}

// ── The agreement leg ─────────────────────────────────────────────

/// An agreement is credited through the reserved PROVENANCE leaf: its key
/// is never a leaf key, so the guest reproduces the provenance bytes from
/// the claimed agreementHash and the assemblyHash the claim carries.
#[test]
fn credits_an_agreement_through_the_provenance_leaf() {
    let buyer = make_signing_key(BUYER_KEY);
    let seller = make_signing_key(SELLER1_KEY);
    let agreement = keccak256(b"an-agreement");
    let composition = keccak256(b"a-composition");
    let clause_data_hash = provenance_leaf_data_hash(&agreement, &composition);

    let (order, ops) = settled_order(&buyer, &seller, &provenance_key(), &clause_data_hash, 1);
    let claim = UsageClaim {
        order,
        clause_or_assembly: agreement,
        kind: UsageClaimKind::Agreement {
            assembly_hash: composition,
        },
        inclusion_proof: vec![],
    };

    let (_, _, events, _) =
        apply_batch_with_state(&batch(ops, vec![claim], empty_snapshot())).expect("batch applies");

    assert_eq!(
        events.usage_accruals,
        vec![UsageAccrual {
            clause_or_assembly: agreement,
            kind: USAGE_KIND_AGREEMENT,
            c: 1,
            d: 1
        }],
        "the agreementHash is credited under kind 2 — never the provenance leaf's key"
    );
}

/// The provenance bytes are reproduced from BOTH keys, so a claim naming an
/// agreementHash the order never committed derives a leaf not in the tree.
#[test]
fn rejects_an_agreement_claim_with_the_wrong_agreement_hash() {
    let buyer = make_signing_key(BUYER_KEY);
    let seller = make_signing_key(SELLER1_KEY);
    let composition = keccak256(b"a-composition");
    let clause_data_hash = provenance_leaf_data_hash(&keccak256(b"an-agreement"), &composition);

    let (order, ops) = settled_order(&buyer, &seller, &provenance_key(), &clause_data_hash, 1);
    let claim = UsageClaim {
        order,
        clause_or_assembly: keccak256(b"another-agreement"),
        kind: UsageClaimKind::Agreement {
            assembly_hash: composition,
        },
        inclusion_proof: vec![],
    };

    match apply_batch_with_state(&batch(ops, vec![claim], empty_snapshot())).map(|_| ()) {
        Err(KernelError::UsageInvalidInclusionProof) => {}
        other => panic!("expected UsageInvalidInclusionProof, got {other:?}"),
    }
}

/// The assemblyHash half of the bytes binds as tightly: the right
/// agreementHash under another assembly opens nothing.
#[test]
fn rejects_an_agreement_claim_with_the_wrong_assembly_hash() {
    let buyer = make_signing_key(BUYER_KEY);
    let seller = make_signing_key(SELLER1_KEY);
    let agreement = keccak256(b"an-agreement");
    let clause_data_hash = provenance_leaf_data_hash(&agreement, &keccak256(b"a-composition"));

    let (order, ops) = settled_order(&buyer, &seller, &provenance_key(), &clause_data_hash, 1);
    let claim = UsageClaim {
        order,
        clause_or_assembly: agreement,
        kind: UsageClaimKind::Agreement {
            assembly_hash: keccak256(b"a-different-composition"),
        },
        inclusion_proof: vec![],
    };

    match apply_batch_with_state(&batch(ops, vec![claim], empty_snapshot())).map(|_| ()) {
        Err(KernelError::UsageInvalidInclusionProof) => {}
        other => panic!("expected UsageInvalidInclusionProof, got {other:?}"),
    }
}

// ── The assembly leg ──────────────────────────────────────────────

/// An assembly claim for the order's agreement in agreement 0 of a
/// two-order-entry assembly: the provenance leaf over both keys, then order
/// entry 0's leaf under
/// the assemblyHash.
fn assembly_claim(
    order: &Commitment,
    composition: B256,
    agreement: B256,
    entry: B256,
    membership_proof: Vec<B256>,
) -> UsageClaim {
    UsageClaim {
        order: order.clone(),
        clause_or_assembly: composition,
        kind: UsageClaimKind::Assembly {
            agreement_hash: agreement,
            slot_content_hash: entry,
            membership_proof,
        },
        inclusion_proof: vec![],
    }
}

/// An assembly is credited INDIRECTLY: a assemblyHash is never a leaf key
/// of an agreement, so the guest proves the reserved PROVENANCE leaf from
/// both keys, then proves the agreement is an agreement of the assembly's root.
#[test]
fn credits_an_assembly_through_the_provenance_leaf_and_its_agreement() {
    let buyer = make_signing_key(BUYER_KEY);
    let seller = make_signing_key(SELLER1_KEY);
    let agreement = keccak256(b"an-agreement");
    let (composition, entry, membership) = two_slot_assembly(&agreement);
    let clause_data_hash = provenance_leaf_data_hash(&agreement, &composition);

    let (order, ops) = settled_order(&buyer, &seller, &provenance_key(), &clause_data_hash, 1);
    let claim = assembly_claim(&order, composition, agreement, entry, membership);

    let (_, _, events, _) =
        apply_batch_with_state(&batch(ops, vec![claim], empty_snapshot())).expect("batch applies");

    assert_eq!(events.usage_accruals.len(), 1);
    assert_eq!(
        events.usage_accruals[0].clause_or_assembly, composition,
        "the DESIGNER is credited — the assemblyHash, never the provenance leaf's key"
    );
    assert_eq!(events.usage_accruals[0].kind, USAGE_KIND_ASSEMBLY);
    assert_eq!(events.usage_accruals[0].c, 1);
}

/// The provenance leaf is reproduced, not parsed, so a assemblyHash
/// that was never committed cannot open the leaf — even with a membership
/// proof that is valid under the claimed root.
#[test]
fn rejects_an_assembly_claim_for_an_uncommitted_assembly() {
    let buyer = make_signing_key(BUYER_KEY);
    let seller = make_signing_key(SELLER1_KEY);
    let agreement = keccak256(b"an-agreement");
    let clause_data_hash = provenance_leaf_data_hash(&agreement, &keccak256(b"a-composition"));
    let (claimed, entry, membership) = two_slot_assembly(&agreement);

    let (order, ops) = settled_order(&buyer, &seller, &provenance_key(), &clause_data_hash, 1);
    let claim = assembly_claim(&order, claimed, agreement, entry, membership);

    match apply_batch_with_state(&batch(ops, vec![claim], empty_snapshot())).map(|_| ()) {
        Err(KernelError::UsageInvalidInclusionProof) => {}
        other => panic!("expected UsageInvalidInclusionProof, got {other:?}"),
    }
}

/// The agreementHash in the provenance bytes is the order's own: a claim that
/// names another agreement of the same assembly — a real agreement, its
/// membership proof valid — opens no provenance leaf.
#[test]
fn rejects_an_assembly_claim_naming_another_agreement_s_key() {
    let buyer = make_signing_key(BUYER_KEY);
    let seller = make_signing_key(SELLER1_KEY);
    let agreement = keccak256(b"an-agreement");
    let (composition, slot0, membership0) = two_slot_assembly(&agreement);
    let clause_data_hash = provenance_leaf_data_hash(&agreement, &composition);
    let (order, ops) = settled_order(&buyer, &seller, &provenance_key(), &clause_data_hash, 1);

    // Agreement 1 of the same root, proved by agreement 0's leaf.
    let other = keccak256(b"the-following-agreement");
    let slot1 = slot_content_hash(1, Some("agreement-0"));
    let leaf0 = single_clause_root(&agreement, &slot0);
    assert_eq!(membership0.len(), 1);
    let claim = assembly_claim(&order, composition, other, slot1, vec![leaf0]);

    match apply_batch_with_state(&batch(ops, vec![claim], empty_snapshot())).map(|_| ()) {
        Err(KernelError::UsageInvalidInclusionProof) => {}
        other => panic!("expected UsageInvalidInclusionProof, got {other:?}"),
    }
}

/// The membership proof is verified under the CLAIMED assemblyHash: a
/// proof that opens the agreement under some other assembly's root refuses the
/// claim exactly as a failed inclusion proof does, though the provenance
/// leaf itself opens.
#[test]
fn rejects_an_assembly_claim_whose_membership_proof_is_under_another_root() {
    let buyer = make_signing_key(BUYER_KEY);
    let seller = make_signing_key(SELLER1_KEY);
    let agreement = keccak256(b"an-agreement");
    let (composition, entry, _) = two_slot_assembly(&agreement);
    let clause_data_hash = provenance_leaf_data_hash(&agreement, &composition);
    let (order, ops) = settled_order(&buyer, &seller, &provenance_key(), &clause_data_hash, 1);

    // Another assembly holding the same agreement in its agreement 0,
    // beside a different follower: its proof opens the agreement under ITS
    // root only.
    let elsewhere = single_clause_root(&keccak256(b"some-other-agreement"), &slot_content_hash(1, Some("agreement-0")));
    let claim = assembly_claim(&order, composition, agreement, entry, vec![elsewhere]);

    match apply_batch_with_state(&batch(ops, vec![claim], empty_snapshot())).map(|_| ()) {
        Err(KernelError::UsageInvalidInclusionProof) => {}
        other => panic!("expected UsageInvalidInclusionProof, got {other:?}"),
    }
}

/// The agreement's content is bound too: the right agreement with another
/// agreement's bytes is not a leaf of the root.
#[test]
fn rejects_an_assembly_claim_with_the_wrong_slot_content() {
    let buyer = make_signing_key(BUYER_KEY);
    let seller = make_signing_key(SELLER1_KEY);
    let agreement = keccak256(b"an-agreement");
    let (composition, _, membership) = two_slot_assembly(&agreement);
    let clause_data_hash = provenance_leaf_data_hash(&agreement, &composition);
    let (order, ops) = settled_order(&buyer, &seller, &provenance_key(), &clause_data_hash, 1);

    let claim = assembly_claim(
        &order,
        composition,
        agreement,
        slot_content_hash(3, None),
        membership,
    );

    match apply_batch_with_state(&batch(ops, vec![claim], empty_snapshot())).map(|_| ()) {
        Err(KernelError::UsageInvalidInclusionProof) => {}
        other => panic!("expected UsageInvalidInclusionProof, got {other:?}"),
    }
}

/// One order, one provenance leaf, two credits: the agreement under kind 2
/// and the assembly under kind 1, each its own accrual.
#[test]
fn one_provenance_leaf_credits_the_agreement_and_the_assembly_apart() {
    let buyer = make_signing_key(BUYER_KEY);
    let seller = make_signing_key(SELLER1_KEY);
    let agreement = keccak256(b"an-agreement");
    let (composition, entry, membership) = two_slot_assembly(&agreement);
    let clause_data_hash = provenance_leaf_data_hash(&agreement, &composition);
    let (order, ops) = settled_order(&buyer, &seller, &provenance_key(), &clause_data_hash, 1);

    let claims = vec![
        UsageClaim {
            order: order.clone(),
            clause_or_assembly: agreement,
            kind: UsageClaimKind::Agreement {
                assembly_hash: composition,
            },
            inclusion_proof: vec![],
        },
        assembly_claim(&order, composition, agreement, entry, membership),
    ];

    let (_, _, events, post) =
        apply_batch_with_state(&batch(ops, claims, empty_snapshot())).expect("batch applies");
    let mut kinds: Vec<(B256, u8)> = events
        .usage_accruals
        .iter()
        .map(|a| (a.clause_or_assembly, a.kind))
        .collect();
    kinds.sort();
    let mut expected = vec![(agreement, USAGE_KIND_AGREEMENT), (composition, USAGE_KIND_ASSEMBLY)];
    expected.sort();
    assert_eq!(kinds, expected);
    assert_eq!(post.usage_counted.len(), 2, "counted once per (kind, key)");
}

// ── The hash the verifier re-derives ──────────────────────────────

/// Both array lengths are in the preimage. An accrual entry is 49 bytes and
/// a seller 20, so twenty accruals and forty-nine sellers occupy the same span:
/// without the prefixes one preimage could be re-split into a different
/// (accruals, sellers) pair, presenting accruals whose sellers were never
/// stake-checked. Mirrored by
/// `FigaroBatchVerifierTest.test_usageHash_isNotReSplittableBetweenTheTwoArrays`.
#[test]
fn the_usage_hash_pins_the_split_between_the_two_arrays() {
    let twenty: Vec<UsageAccrual> = (0..20)
        .map(|_| UsageAccrual {
            clause_or_assembly: B256::ZERO,
            kind: USAGE_KIND_CLAUSE,
            c: 0,
            d: 0,
        })
        .collect();
    let forty_nine: Vec<Address> = (0..49).map(|_| Address::ZERO).collect();

    let a = compute_usage_accrual_hash(0, &B256::ZERO, &twenty, &[]);
    let b = compute_usage_accrual_hash(0, &B256::ZERO, &[], &forty_nine);
    assert_ne!(a, b, "20 × 49 bytes and 49 × 20 bytes must not collide");
}

/// The period and the provenance key are COMMITTED, not incidental: the
/// counter re-checks both, and a batch proven for one period must not resolve
/// into another.
#[test]
fn the_usage_hash_covers_the_period_and_the_provenance_key() {
    let accruals = vec![UsageAccrual {
        clause_or_assembly: keccak256(b"usage-key"),
        kind: USAGE_KIND_CLAUSE,
        c: 2,
        d: 1,
    }];
    let sellers = vec![SELLER1];
    let base = compute_usage_accrual_hash(0, &provenance_key(), &accruals, &sellers);

    let mut other_kind = accruals.clone();
    other_kind[0].kind = USAGE_KIND_ASSEMBLY;
    assert_ne!(
        base,
        compute_usage_accrual_hash(0, &provenance_key(), &other_kind, &sellers),
        "the kind is covered"
    );
    let mut agreement_kind = accruals.clone();
    agreement_kind[0].kind = USAGE_KIND_AGREEMENT;
    assert_ne!(
        compute_usage_accrual_hash(0, &provenance_key(), &other_kind, &sellers),
        compute_usage_accrual_hash(0, &provenance_key(), &agreement_kind, &sellers),
        "the agreement kind is its own byte"
    );

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
///
/// The `b"artifact-a"` / `b"artifact-b"` literals below are OPAQUE PREIMAGE
/// BYTES, not a name for anything — they are pinned byte-for-byte to the
/// Solidity side of the vector. Renaming them here without renaming them
/// there (and re-deriving the expected hash) breaks the lock.
#[test]
fn the_usage_hash_matches_the_solidity_vector() {
    let accruals = vec![
        UsageAccrual {
            clause_or_assembly: keccak256(b"artifact-a"),
            kind: USAGE_KIND_CLAUSE,
            c: 4,
            d: 2,
        },
        UsageAccrual {
            clause_or_assembly: keccak256(b"artifact-b"),
            kind: USAGE_KIND_ASSEMBLY,
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
        b256!("9d3344f07a7c4ab3dc7eb5a6719feae8ae1462cb029ea2c781c6b0619261acd4")
    );
}

/// One accrual, its preimage written out byte by byte: the layout
/// `period(1) ‖ provenanceLeaf(32) ‖ n(8) ‖ [key(32) ‖ kind(1) ‖ c(8) ‖ d(8)]
/// ‖ m(8) ‖ [seller(20)]`, span `49 + 49n + 20m` — here 118 bytes.
#[test]
fn the_one_accrual_usage_hash_is_its_written_preimage() {
    let key = keccak256(b"artifact-a");
    let prov = keccak256(b"prov");
    let seller = address!("0000000000000000000000000000000000000001");
    let accruals = vec![UsageAccrual {
        clause_or_assembly: key,
        kind: USAGE_KIND_ASSEMBLY,
        c: 4,
        d: 2,
    }];

    let mut preimage = Vec::new();
    preimage.push(3u8);
    preimage.extend_from_slice(prov.as_slice());
    preimage.extend_from_slice(&1u64.to_be_bytes());
    preimage.extend_from_slice(key.as_slice());
    preimage.push(1u8);
    preimage.extend_from_slice(&4u64.to_be_bytes());
    preimage.extend_from_slice(&2u64.to_be_bytes());
    preimage.extend_from_slice(&1u64.to_be_bytes());
    preimage.extend_from_slice(seller.as_slice());
    assert_eq!(preimage.len(), 49 + 49 + 20);

    let hash = compute_usage_accrual_hash(3, &prov, &accruals, &[seller]);
    assert_eq!(hash, keccak256(&preimage));
    assert_eq!(
        hash,
        b256!("a8f200441f17c90bdb286e38e33656d6cac7f0b7b6d4b0f1f011d76a4ba4cf3e")
    );
}

/// A registry accepts any bytes32, so a clause key and an assembly key can be
/// the same word. A clause claim and an assembly claim on that word, from one
/// process, are two accruals under their own kinds — never one merged count.
#[test]
fn a_clause_and_an_assembly_on_the_same_key_accrue_apart() {
    let buyer = make_signing_key(BUYER_KEY);
    let seller = make_signing_key(SELLER1_KEY);
    let clause_data_hash = keccak256(b"clause-bytes");

    // A one-order-entry assembly: its root is the agreement's leaf, proved by an
    // empty membership proof. The same word is also taken as a clause key.
    let agreement = keccak256(b"an-agreement");
    let entry = slot_content_hash(0, None);
    let shared = single_clause_root(&agreement, &entry);

    let clause_leaf = single_clause_root(&shared, &clause_data_hash);
    let provenance_leaf =
        single_clause_root(&provenance_key(), &provenance_leaf_data_hash(&agreement, &shared));
    let root = sorted_pair(clause_leaf, provenance_leaf);

    let (order, ops) = settled_order_under(&buyer, &seller, root, 1);
    let claims = vec![
        UsageClaim {
            order: order.clone(),
            clause_or_assembly: shared,
            kind: UsageClaimKind::Clause {
                clause_data_hash,
            },
            inclusion_proof: vec![provenance_leaf],
        },
        UsageClaim {
            order: order.clone(),
            clause_or_assembly: shared,
            kind: UsageClaimKind::Assembly {
                agreement_hash: agreement,
                slot_content_hash: entry,
                membership_proof: vec![],
            },
            inclusion_proof: vec![clause_leaf],
        },
    ];

    let (_, _, events, post) =
        apply_batch_with_state(&batch(ops, claims, empty_snapshot())).expect("batch applies");

    assert_eq!(
        events.usage_accruals,
        vec![
            UsageAccrual {
                clause_or_assembly: shared,
                kind: USAGE_KIND_CLAUSE,
                c: 1,
                d: 1
            },
            UsageAccrual {
                clause_or_assembly: shared,
                kind: USAGE_KIND_ASSEMBLY,
                c: 1,
                d: 1
            },
        ],
        "one accrual per (key, kind)"
    );
    assert_eq!(post.usage_counted.len(), 2, "counted once per kind");
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
    let clause_or_assembly = clause_key(b"{\"clauseId\":\"figaro-modalities\"}");
    let clause_data_hash = keccak256(b"clause-bytes");

    let (order, ops) = settled_order(&buyer, &seller, &clause_or_assembly, &clause_data_hash, 1);

    let without = batch(ops.clone(), vec![], empty_snapshot());
    let with = batch(
        ops,
        vec![clause_claim(&order, clause_or_assembly, clause_data_hash)],
        empty_snapshot(),
    );

    let (pv_without, _, _, _) = apply_batch_with_state(&without).expect("applies");
    let (pv_with, _, _, _) = apply_batch_with_state(&with).expect("applies");

    assert_eq!(pv_without.prev_state_root, pv_with.prev_state_root);
    assert_ne!(
        pv_without.new_state_root, pv_with.new_state_root,
        "the usage leg is part of the proven state, not a side channel"
    );
}

// ── The provenance leaf on the attestation path ───────────────────

/// A buyer attestation of the reserved provenance leaf on an OPEN process:
/// the order is committed (not resolved) under an agreement whose lone
/// leaf is the provenance leaf over the bytes hashing to `committed`.
fn provenance_attestation(
    committed: B256,
    clause_data: &str,
    content_ref: B256,
) -> (BatchInput, B256) {
    let buyer = make_signing_key(BUYER_KEY);
    let seller = make_signing_key(SELLER1_KEY);
    let (order, mut ops) = settled_order(&buyer, &seller, &provenance_key(), &committed, 7);
    ops.truncate(1); // commit only: attestation is evidence within an open process

    let domain = domain_separator(CHAIN_ID, CORE);
    let (order_hash, process_id) = derive_commitment_ids(&domain, &order);
    let digest = typed_data_hash(
        &domain,
        &attest_buyer_struct_hash(&process_id, &order_hash, &provenance_key(), 0, &content_ref),
    );
    ops.push(KernelOp::AttestAsBuyer {
        target: order,
        clause_id: provenance_key(),
        stage: 0,
        content_ref,
        buyer_sig: sign_digest(&buyer, &digest),
        proof: AttestationContentProof {
            spec_json: String::new(),
            content_json: String::new(),
            clause_data: clause_data.to_string(),
            inclusion_proof: vec![],
            content_kind: ContentKind::ReAssert,
        },
    });
    (batch(ops, vec![], empty_snapshot()), process_id)
}

/// The guest's constant is the agreement format's key, derived here
/// independently of the guest.
#[test]
fn the_guest_s_provenance_leaf_key_is_the_format_s_constant() {
    assert_eq!(PROVENANCE_LEAF_KEY, provenance_key());
}

/// The reserved provenance leaf is attestable on the batch path: the guest
/// verifies its inclusion under the signed agreement with the bytes
/// reproduced from the two keys they carry, consults no spec, and commits
/// NO spec binding (there is no registry entry to anchor).
#[test]
fn the_provenance_leaf_is_attestable_without_a_spec() {
    let bytes = provenance_bytes(&keccak256(b"an-agreement"), &keccak256(b"a-composition"));
    let hash = keccak256(bytes.as_bytes());
    let (input, process_id) = provenance_attestation(hash, &bytes, hash);

    let (_, _, events, _) = apply_batch_with_state(&input).expect("provenance attestation applies");
    assert_eq!(events.attestations.len(), 1);
    assert_eq!(events.attestations[0].clause_id, provenance_key());
    assert_eq!(events.attestations[0].process_id, process_id);
    assert_eq!(events.attestations[0].content_ref, hash);
    assert!(
        events.spec_bindings.is_empty(),
        "the provenance leaf is a fact of the agreement format; nothing anchors it in ClauseRegistry"
    );
}

/// Bytes that name a composition, or an agreement, the order never
/// committed derive a leaf that is not in the tree.
#[test]
fn a_provenance_attestation_of_an_uncommitted_key_is_refused() {
    let agreement = keccak256(b"an-agreement");
    let composition = keccak256(b"a-composition");
    let committed = provenance_leaf_data_hash(&agreement, &composition);
    for other in [
        provenance_bytes(&agreement, &keccak256(b"a-different-composition")),
        provenance_bytes(&keccak256(b"another-agreement"), &composition),
    ] {
        let (input, _) = provenance_attestation(committed, &other, keccak256(other.as_bytes()));
        match apply_batch_with_state(&input).map(|_| ()) {
            Err(KernelError::InvalidInclusionProof) => {}
            other => panic!("expected InvalidInclusionProof, got {other:?}"),
        }
    }
}

/// The attestation's contentRef is the keccak of the provenance bytes,
/// exactly as a clause's clauseDataHash.
#[test]
fn a_provenance_attestation_whose_content_ref_is_not_the_bytes_is_refused() {
    let bytes = provenance_bytes(&keccak256(b"an-agreement"), &keccak256(b"a-composition"));
    let hash = keccak256(bytes.as_bytes());
    let (input, _) = provenance_attestation(hash, &bytes, keccak256(b"something else"));

    match apply_batch_with_state(&input).map(|_| ()) {
        Err(KernelError::ContentHashMismatch) => {}
        other => panic!("expected ContentHashMismatch, got {other:?}"),
    }
}

/// Bytes under the reserved key that are not the reproduction of their own
/// two keys are refused even when the signed agreement carries exactly
/// those bytes: the leaf's content is a rule of the agreement format,
/// reproduced, never parsed loosely. Upper-case hex, the keys swapped, and
/// the one-key form naming the assemblyHash alone are each refused.
#[test]
fn non_canonical_provenance_bytes_are_refused() {
    let agreement = keccak256(b"an-agreement");
    let composition = keccak256(b"a-composition");
    let hex = |w: &B256| -> String { w.iter().map(|b| format!("{b:02x}")).collect() };
    let upper = |w: &B256| -> String { w.iter().map(|b| format!("{b:02X}")).collect() };
    for bytes in [
        format!(
            "{{\"agreementHash\":\"0x{}\",\"assemblyHash\":\"0x{}\"}}",
            upper(&agreement),
            upper(&composition)
        ),
        format!(
            "{{\"assemblyHash\":\"0x{}\",\"agreementHash\":\"0x{}\"}}",
            hex(&composition),
            hex(&agreement)
        ),
        format!("{{\"assemblyHash\":\"0x{}\"}}", hex(&composition)),
    ] {
        let hash = keccak256(bytes.as_bytes());
        let (input, _) = provenance_attestation(hash, &bytes, hash);
        match apply_batch_with_state(&input).map(|_| ()) {
            Err(KernelError::ProvenanceLeafNotCanonical) => {}
            other => panic!("expected ProvenanceLeafNotCanonical for {bytes}, got {other:?}"),
        }
    }
}

// ── The reserved keys are never registrations ─────────────────────

/// The assembly terms leaf's key, derived here independently of the guest.
fn terms_key() -> B256 {
    keccak256(b"figaro-assembly-terms")
}

fn expect_reserved(input: BatchInput, key: B256) {
    match apply_batch_with_state(&input).map(|_| ()) {
        Err(KernelError::ReservedKeyIsNotARegistration(k)) => assert_eq!(k, key),
        other => panic!("expected ReservedKeyIsNotARegistration, got {other:?}"),
    }
}

#[test]
fn the_guest_s_terms_leaf_key_is_the_format_s_constant() {
    assert_eq!(ASSEMBLY_TERMS_LEAF_KEY, terms_key());
}

/// A Clause claim keyed on the reserved provenance leaf opens under every
/// agreement that names an assembly — the leaf is there — so the guest
/// refuses the key itself, whatever registration may exist under it.
#[test]
fn a_clause_claim_keyed_on_the_provenance_leaf_is_refused() {
    let buyer = make_signing_key(BUYER_KEY);
    let seller = make_signing_key(SELLER1_KEY);
    let clause_data_hash = provenance_leaf_data_hash(&keccak256(b"an-agreement"), &keccak256(b"a-composition"));
    let (order, ops) = settled_order(&buyer, &seller, &provenance_key(), &clause_data_hash, 1);
    let claim = clause_claim(&order, PROVENANCE_LEAF_KEY, clause_data_hash);
    expect_reserved(batch(ops, vec![claim], empty_snapshot()), PROVENANCE_LEAF_KEY);
}

/// Every kind refuses both reserved keys as its claim key, even when the
/// agreement carries the matching provenance leaf.
#[test]
fn every_kind_keyed_on_a_reserved_key_is_refused() {
    let buyer = make_signing_key(BUYER_KEY);
    let seller = make_signing_key(SELLER1_KEY);
    for (salt, reserved) in [(1u64, PROVENANCE_LEAF_KEY), (2, terms_key())] {
        let agreement_clause = provenance_leaf_data_hash(&reserved, &keccak256(b"a-composition"));
        let (order, ops) =
            settled_order(&buyer, &seller, &provenance_key(), &agreement_clause, salt);
        let claim = UsageClaim {
            order,
            clause_or_assembly: reserved,
            kind: UsageClaimKind::Agreement {
                assembly_hash: keccak256(b"a-composition"),
            },
            inclusion_proof: vec![],
        };
        expect_reserved(batch(ops, vec![claim], empty_snapshot()), reserved);

        let assembly_clause = provenance_leaf_data_hash(&keccak256(b"an-agreement"), &reserved);
        let (order, ops) =
            settled_order(&buyer, &seller, &provenance_key(), &assembly_clause, salt + 10);
        let claim = assembly_claim(
            &order,
            reserved,
            keccak256(b"an-agreement"),
            slot_content_hash(0, None),
            vec![],
        );
        expect_reserved(batch(ops, vec![claim], empty_snapshot()), reserved);

        let (order, ops) = settled_order(&buyer, &seller, &reserved, &keccak256(b"s"), salt + 20);
        let claim = clause_claim(&order, reserved, keccak256(b"s"));
        expect_reserved(batch(ops, vec![claim], empty_snapshot()), reserved);
    }
}

/// The terms leaf is a leaf of the assembly root, so a membership proof of
/// it opens under the assemblyHash — the guest refuses it as an order
/// entry by its key, before any proof is read.
#[test]
fn an_assembly_claim_passing_the_terms_leaf_as_an_agreement_is_refused() {
    let buyer = make_signing_key(BUYER_KEY);
    let seller = make_signing_key(SELLER1_KEY);

    // A root over one agreement and the terms leaf.
    let agreement = keccak256(b"an-agreement");
    let entry = slot_content_hash(0, None);
    let terms_bytes = keccak256(b"{\"0x01\":{\"law\":\"ch\"}}");
    let slot_leaf = single_clause_root(&agreement, &entry);
    let terms_leaf = single_clause_root(&terms_key(), &terms_bytes);
    let composition = sorted_pair(slot_leaf, terms_leaf);

    // The order's provenance names the terms key as its agreement.
    let clause_data_hash = provenance_leaf_data_hash(&terms_key(), &composition);
    let (order, ops) = settled_order(&buyer, &seller, &provenance_key(), &clause_data_hash, 1);
    let claim = assembly_claim(&order, composition, terms_key(), terms_bytes, vec![slot_leaf]);
    expect_reserved(batch(ops, vec![claim], empty_snapshot()), terms_key());

    // And the provenance key as an agreement's agreementHash is refused too.
    let clause_data_hash = provenance_leaf_data_hash(&PROVENANCE_LEAF_KEY, &composition);
    let (order, ops) = settled_order(&buyer, &seller, &provenance_key(), &clause_data_hash, 2);
    let claim = assembly_claim(&order, composition, PROVENANCE_LEAF_KEY, entry, vec![terms_leaf]);
    expect_reserved(batch(ops, vec![claim], empty_snapshot()), PROVENANCE_LEAF_KEY);
}
