/// The order list a batched resolve carries, held to `FigaroCore.resolveProcess`:
/// a list names every open order of its process once, or the batch is refused.
///
/// `FigaroCore` checks the list's length against the process's open-order count,
/// then, for each listed order in turn, that its status is committed (1), pays it
/// and sets its status to resolved (2) inside the loop: an order listed twice is
/// read the second time as not committed. `apply_resolve` (`src/kernel.rs`) does
/// the same. These tests hold each refusal: a repeated order at the true length
/// and longer, a dropped order, an order of another process, an empty list, a
/// resolve signed by a wallet that is not the root buyer, and a resolve of a
/// process already resolved. The sequence of a correct list is free on both paths.
use alloy_primitives::{address, keccak256, Address, B256, U256};
use k256::ecdsa::SigningKey;

use figaro_kernel::eip712::*;
use figaro_kernel::kernel::apply_batch;
use figaro_kernel::types::*;

const BUYER_KEY: u64 = 0xB0B;
const SELLER1_KEY: u64 = 0x5E11;
const SELLER2_KEY: u64 = 0x5E12;
const SELLER3_KEY: u64 = 0x5E13;

const BUYER: Address = address!("0376AAc07Ad725E01357B1725B5ceC61aE10473c");
const TOKEN: Address = address!("5615dEB798BB3E4dFa0139dFa1b3D433Cc23b72f");
const CORE: Address = address!("2e234DAe75C793f67A35089C9d99245E1C58470b");
const CHAIN_ID: u64 = 31337;

fn key(secret: u64) -> SigningKey {
    let mut bytes = [0u8; 32];
    bytes[24..].copy_from_slice(&secret.to_be_bytes());
    SigningKey::from_bytes((&bytes).into()).unwrap()
}

fn address_of(secret: u64) -> Address {
    let pubkey = key(secret).verifying_key().to_encoded_point(false);
    let hash = keccak256(&pubkey.as_bytes()[1..]);
    Address::from_slice(&hash[12..])
}

fn sign(secret: u64, digest: &B256) -> Signature {
    use k256::ecdsa::{signature::hazmat::PrehashSigner, RecoveryId};
    let (sig, recid): (k256::ecdsa::Signature, RecoveryId) =
        key(secret).sign_prehash(digest.as_slice()).unwrap();
    let bytes = sig.to_bytes();
    Signature {
        v: recid.to_byte() + 27,
        r: B256::from_slice(&bytes[..32]),
        s: B256::from_slice(&bytes[32..]),
    }
}

fn domain() -> B256 {
    domain_separator(CHAIN_ID, CORE)
}

fn ether(n: u64) -> U256 {
    U256::from(n) * U256::from(1_000_000_000_000_000_000u64)
}

fn commit_op(c: &Commitment, seller_key: u64) -> KernelOp {
    let digest = typed_data_hash(&domain(), &commitment_struct_hash(c));
    KernelOp::Commit {
        commitment: c.clone(),
        buyer_sig: sign(BUYER_KEY, &digest),
        seller_sig: sign(seller_key, &digest),
    }
}

fn resolve_op(process_id: B256, value: U256, list: Vec<Commitment>, signer: u64) -> KernelOp {
    let digest = typed_data_hash(&domain(), &resolve_struct_hash(&process_id, &value));
    KernelOp::Resolve {
        process_id,
        cumulative_value: value,
        commitments: list,
        buyer_sig: sign(signer, &digest),
    }
}

fn order_hash(process_id: &B256, c: &Commitment) -> B256 {
    compute_order_hash(process_id, &commitment_struct_hash(c))
}

/// One process of `n` orders (n is 2 or 3): a root of 100 ether to the first
/// seller, then 50 ether to the second and 30 ether to the third, each signed
/// over the running total. Returns the process id, the orders in the sequence
/// they were committed, and the commit operations with their seller keys.
struct Process {
    id: B256,
    orders: Vec<Commitment>,
    commits: Vec<KernelOp>,
}

fn process(n: usize, salt: u64) -> Process {
    let sellers = [SELLER1_KEY, SELLER2_KEY, SELLER3_KEY];
    let payments = [100u64, 50, 30];
    let root = Commitment {
        process_id: B256::ZERO,
        buyer: BUYER,
        seller: address_of(SELLER1_KEY),
        currency: TOKEN,
        payment: ether(100),
        expected_cumulative_value: ether(100),
        checkout_hash: keccak256(format!("resolve-lists-root-{salt}")),
        salt: U256::from(salt),
        deadline: U256::from(2000u64),
    };
    let id = typed_data_hash(&domain(), &commitment_struct_hash(&root));
    let mut orders = vec![root];
    let mut total = 100u64;
    for i in 1..n {
        total += payments[i];
        orders.push(Commitment {
            process_id: id,
            buyer: BUYER,
            seller: address_of(sellers[i]),
            currency: TOKEN,
            payment: ether(payments[i]),
            expected_cumulative_value: ether(total),
            checkout_hash: keccak256(format!("resolve-lists-sub-{salt}-{i}")),
            salt: U256::from(salt * 100 + i as u64),
            deadline: U256::from(2000u64),
        });
    }
    let commits = orders
        .iter()
        .enumerate()
        .map(|(i, c)| commit_op(c, sellers[i]))
        .collect();
    Process {
        id,
        orders,
        commits,
    }
}

impl Process {
    fn value(&self) -> U256 {
        self.orders.last().unwrap().expected_cumulative_value
    }
    fn pick(&self, at: &[usize]) -> Vec<Commitment> {
        at.iter().map(|&i| self.orders[i].clone()).collect()
    }
}

fn batch(operations: Vec<KernelOp>) -> BatchInput {
    BatchInput {
        chain_id: CHAIN_ID,
        verifying_contract: CORE,
        block_timestamp: 1000,
        operations,
        prev_state: KernelStateSnapshot {
            processes: vec![],
            order_status: vec![],
        },
        usage_claims: vec![],
        usage_period: 0,
    }
}

/// The process's commits, then a resolve by the buyer over `list`.
fn resolve_list(p: &Process, list: Vec<Commitment>) -> Result<Vec<NetPosition>, KernelError> {
    let mut ops = p.commits.clone();
    ops.push(resolve_op(p.id, p.value(), list, BUYER_KEY));
    apply_batch(&batch(ops)).map(|(_, positions, _)| positions)
}

fn expect_not_committed(p: &Process, at: &[usize], repeated: usize) {
    match resolve_list(p, p.pick(at)) {
        Err(KernelError::OrderNotCommitted(h)) => {
            assert_eq!(
                h,
                order_hash(&p.id, &p.orders[repeated]),
                "list {at:?}: the repeated order"
            )
        }
        other => panic!("list {at:?}: expected OrderNotCommitted, got {other:?}"),
    }
}

fn expect_incomplete(p: &Process, list: Vec<Commitment>, what: &str) {
    let provided = list.len() as u64;
    match resolve_list(p, list) {
        Err(KernelError::IncompleteOrderList {
            required,
            provided: given,
        }) => {
            assert_eq!(required, p.orders.len() as u64, "{what}: required");
            assert_eq!(given, provided, "{what}: provided");
        }
        other => panic!("{what}: expected IncompleteOrderList, got {other:?}"),
    }
}

// ── An order listed twice ─────────────────────────────────────────

#[test]
fn a_resolve_list_repeating_an_order_of_a_two_order_process_is_refused() {
    let p = process(2, 1);
    // At the true length: the loop pays the first listing and refuses the second.
    expect_not_committed(&p, &[0, 0], 0);
    expect_not_committed(&p, &[1, 1], 1);
    // Longer than the open orders: the length check refuses it first.
    expect_incomplete(&p, p.pick(&[0, 1, 0]), "first repeated, longer");
    expect_incomplete(&p, p.pick(&[0, 1, 1]), "last repeated, longer");
    // The true list resolves.
    assert!(
        resolve_list(&p, p.pick(&[0, 1])).is_ok(),
        "the true list resolves"
    );
}

#[test]
fn a_resolve_list_repeating_an_order_of_a_three_order_process_is_refused() {
    let p = process(3, 2);
    expect_not_committed(&p, &[0, 0, 2], 0); // the first, in place of the middle
    expect_not_committed(&p, &[0, 1, 1], 1); // the middle, in place of the last
    expect_not_committed(&p, &[2, 1, 2], 2); // the last, in place of the first
    expect_incomplete(&p, p.pick(&[0, 1, 2, 0]), "first repeated, longer");
    expect_incomplete(&p, p.pick(&[0, 1, 2, 1]), "middle repeated, longer");
    expect_incomplete(&p, p.pick(&[0, 1, 2, 2]), "last repeated, longer");
    assert!(
        resolve_list(&p, p.pick(&[0, 1, 2])).is_ok(),
        "the true list resolves"
    );
}

// ── A list that does not name every open order ────────────────────

#[test]
fn a_resolve_list_missing_an_order_or_empty_is_refused() {
    let p = process(3, 3);
    expect_incomplete(&p, p.pick(&[1, 2]), "first dropped");
    expect_incomplete(&p, p.pick(&[0, 2]), "middle dropped");
    expect_incomplete(&p, p.pick(&[0, 1]), "last dropped");
    expect_incomplete(&p, vec![], "empty");
}

#[test]
fn a_resolve_list_naming_an_order_of_another_process_is_refused() {
    let p = process(3, 4);
    let other = process(2, 5);
    for (place, foreign) in [(0usize, 0usize), (1, 1), (2, 0)] {
        let mut list = p.orders.clone();
        list[place] = other.orders[foreign].clone();
        let mut ops = p.commits.clone();
        ops.extend(other.commits.clone());
        ops.push(resolve_op(p.id, p.value(), list, BUYER_KEY));
        match apply_batch(&batch(ops)) {
            // The order hash binds the process: the other process's order,
            // hashed under this one, names no committed order.
            Err(KernelError::OrderNotCommitted(h)) => {
                assert_eq!(
                    h,
                    order_hash(&p.id, &other.orders[foreign]),
                    "place {place}"
                )
            }
            other => panic!("place {place}: expected OrderNotCommitted, got {other:?}"),
        }
    }
}

/// The code fixes no sequence: each listed order is checked and paid on its
/// own, and the authorization signs the process and its value, not the list.
/// A correct set in another sequence resolves with the same positions.
#[test]
fn a_correct_resolve_list_in_another_sequence_resolves_alike() {
    let p = process(3, 6);
    let mut in_order = resolve_list(&p, p.pick(&[0, 1, 2])).expect("committed sequence");
    let mut reversed = resolve_list(&p, p.pick(&[2, 0, 1])).expect("another sequence");
    in_order.sort_by_key(|n| n.user);
    reversed.sort_by_key(|n| n.user);
    assert_eq!(in_order.len(), reversed.len());
    for (a, b) in in_order.iter().zip(reversed.iter()) {
        assert_eq!((a.user, a.deposit, a.payout), (b.user, b.deposit, b.payout));
    }
}

// ── Who resolves, and when ────────────────────────────────────────

#[test]
fn a_resolve_signed_by_a_wallet_that_is_not_the_root_buyer_is_refused() {
    let p = process(2, 7);
    for signer in [SELLER1_KEY, SELLER2_KEY, 0xBAD] {
        let mut ops = p.commits.clone();
        ops.push(resolve_op(p.id, p.value(), p.orders.clone(), signer));
        match apply_batch(&batch(ops)) {
            Err(KernelError::NotProcessBuyer) => {}
            other => panic!("signer {signer:#x}: expected NotProcessBuyer, got {other:?}"),
        }
    }
}

#[test]
fn a_resolve_of_a_resolved_process_is_refused() {
    let p = process(2, 8);
    let mut ops = p.commits.clone();
    ops.push(resolve_op(p.id, p.value(), p.orders.clone(), BUYER_KEY));
    ops.push(resolve_op(p.id, p.value(), p.orders.clone(), BUYER_KEY));
    match apply_batch(&batch(ops)) {
        Err(KernelError::NoActiveOrders) => {}
        other => panic!("expected NoActiveOrders, got {other:?}"),
    }
}
