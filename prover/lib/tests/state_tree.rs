//! The batch path's state tree (`figaro_kernel::state_tree`): the root of a
//! set of leaves, the witness that proves a batch's touched leaves against the
//! previous root, and the one descent that checks it and computes the new root.
//! The tree's definition and every check below are in
//! `work/incremental-root/DESIGN.md`.

use alloy_primitives::{keccak256, B256};
use figaro_kernel::state_tree::{
    leaf_hash, node_hash, prove, root, verify_and_update, ProofItem, TreeError, WitnessedLeaf,
};
use std::collections::BTreeMap;

fn path(first: u8, last: u8) -> B256 {
    let mut b = [0u8; 32];
    b[0] = first;
    b[31] = last;
    B256::from(b)
}

fn vh(n: u8) -> B256 {
    keccak256([n])
}

// ── The root of a set ───────────────────────────────────────────────────

#[test]
fn the_empty_set_has_the_zero_root() {
    assert_eq!(root(&BTreeMap::new()), B256::ZERO);
}

#[test]
fn a_lone_leaf_is_the_root() {
    let p = path(0x5a, 1);
    let leaves = BTreeMap::from([(p, vh(1))]);
    let expected = keccak256([&[0x00u8][..], p.as_slice(), vh(1).as_slice()].concat());
    assert_eq!(leaf_hash(&p, &vh(1)), expected);
    assert_eq!(root(&leaves), expected);
}

#[test]
fn two_leaves_apart_at_the_first_bit_are_one_node() {
    let (a, b) = (path(0x00, 1), path(0x80, 2));
    let leaves = BTreeMap::from([(a, vh(1)), (b, vh(2))]);
    let expected = keccak256(
        [&[0x01u8][..], leaf_hash(&a, &vh(1)).as_slice(), leaf_hash(&b, &vh(2)).as_slice()].concat(),
    );
    assert_eq!(node_hash(&leaf_hash(&a, &vh(1)), &leaf_hash(&b, &vh(2))), expected);
    assert_eq!(root(&leaves), expected);
}

#[test]
fn two_leaves_sharing_two_bits_hang_two_nodes_below_the_root() {
    // 0b0000_0000… and 0b0010_0000…: equal at bits 0 and 1, apart at bit 2.
    let (a, b) = (path(0x00, 1), path(0x20, 2));
    let leaves = BTreeMap::from([(a, vh(1)), (b, vh(2))]);
    let split = node_hash(&leaf_hash(&a, &vh(1)), &leaf_hash(&b, &vh(2)));
    let depth1 = node_hash(&split, &B256::ZERO);
    let expected = node_hash(&depth1, &B256::ZERO);
    assert_eq!(root(&leaves), expected);
}

#[test]
fn a_third_leaf_beside_a_pair_leaves_the_pair_below_and_rises_alone() {
    // a, b share bit 0 = 0; c has bit 0 = 1.
    let (a, b, c) = (path(0x00, 1), path(0x40, 2), path(0x80, 3));
    let leaves = BTreeMap::from([(a, vh(1)), (b, vh(2)), (c, vh(3))]);
    let left = node_hash(&leaf_hash(&a, &vh(1)), &leaf_hash(&b, &vh(2)));
    let expected = node_hash(&left, &leaf_hash(&c, &vh(3)));
    assert_eq!(root(&leaves), expected);
}

// ── The witness and the one descent ─────────────────────────────────────

/// Run a batch's touched leaves through the witness: build it from the full
/// previous set, check it, and return the new root.
fn step(prev: &BTreeMap<B256, B256>, writes: &BTreeMap<B256, Option<B256>>) -> Result<B256, TreeError> {
    let paths: Vec<B256> = writes.keys().copied().collect();
    let proof = prove(prev, &paths);
    let leaves: Vec<WitnessedLeaf> = writes
        .iter()
        .map(|(p, after)| WitnessedLeaf { path: *p, before: prev.get(p).copied(), after: after.or(prev.get(p).copied()) })
        .collect();
    verify_and_update(root(prev), &leaves, &proof)
}

#[test]
fn an_insert_into_the_empty_tree() {
    let p = path(0x33, 1);
    let new = step(&BTreeMap::new(), &BTreeMap::from([(p, Some(vh(1)))])).unwrap();
    assert_eq!(new, root(&BTreeMap::from([(p, vh(1))])));
}

#[test]
fn an_insert_beside_a_lone_leaf_pushes_both_down() {
    let (a, b) = (path(0x00, 1), path(0x20, 2));
    let prev = BTreeMap::from([(a, vh(1))]);
    let new = step(&prev, &BTreeMap::from([(b, Some(vh(2)))])).unwrap();
    assert_eq!(new, root(&BTreeMap::from([(a, vh(1)), (b, vh(2))])));
}

#[test]
fn an_update_in_place_and_a_read_of_an_absent_leaf() {
    let (a, b, c) = (path(0x00, 1), path(0x40, 2), path(0xc0, 3));
    let prev = BTreeMap::from([(a, vh(1)), (b, vh(2))]);
    // a updated, c read and left absent.
    let new = step(&prev, &BTreeMap::from([(a, Some(vh(9))), (c, None)])).unwrap();
    assert_eq!(new, root(&BTreeMap::from([(a, vh(9)), (b, vh(2))])));
}

#[test]
fn two_inserts_into_one_empty_position() {
    let (a, b, c) = (path(0x80, 1), path(0x00, 2), path(0x01, 3));
    let prev = BTreeMap::from([(a, vh(1))]);
    let new = step(&prev, &BTreeMap::from([(b, Some(vh(2))), (c, Some(vh(3)))])).unwrap();
    assert_eq!(new, root(&BTreeMap::from([(a, vh(1)), (b, vh(2)), (c, vh(3))])));
}

#[test]
fn an_insert_beside_a_witnessed_leaf() {
    let (a, b) = (path(0x00, 1), path(0x20, 2));
    let prev = BTreeMap::from([(a, vh(1))]);
    let new = step(&prev, &BTreeMap::from([(a, Some(vh(7))), (b, Some(vh(2)))])).unwrap();
    assert_eq!(new, root(&BTreeMap::from([(a, vh(7)), (b, vh(2))])));
}

/// A small fixed-seed generator: the property test needs no random crate.
struct XorShift(u64);
impl XorShift {
    fn next(&mut self) -> u64 {
        self.0 ^= self.0 << 13;
        self.0 ^= self.0 >> 7;
        self.0 ^= self.0 << 17;
        self.0
    }
    fn path(&mut self) -> B256 {
        // Few distinct high bytes, so paths share long prefixes often.
        let mut b = [0u8; 32];
        b[0] = (self.next() % 6) as u8 * 0x11;
        b[1] = (self.next() % 3) as u8;
        b[31] = (self.next() % 40) as u8;
        B256::from(b)
    }
}

#[test]
fn the_descent_reaches_the_root_of_the_true_post_state_on_random_histories() {
    for seed in 1..=40u64 {
        let mut rng = XorShift(seed.wrapping_mul(0x9E37_79B9_7F4A_7C15));
        let mut state: BTreeMap<B256, B256> = BTreeMap::new();
        for _ in 0..30 {
            let mut writes: BTreeMap<B256, Option<B256>> = BTreeMap::new();
            for _ in 0..(1 + rng.next() % 6) {
                let p = if !state.is_empty() && rng.next() % 2 == 0 {
                    *state.keys().nth((rng.next() as usize) % state.len()).unwrap()
                } else {
                    rng.path()
                };
                let write = if rng.next() % 4 == 0 { None } else { Some(vh((rng.next() % 250) as u8)) };
                writes.insert(p, write);
            }
            let new = step(&state, &writes).expect("an honest witness is accepted");
            for (p, w) in &writes {
                if let Some(v) = w {
                    state.insert(*p, *v);
                }
            }
            assert_eq!(new, root(&state), "seed {seed}");
        }
    }
}

// ── Refusals: each check the root alone does not give ───────────────────

fn honest(prev: &BTreeMap<B256, B256>, paths: &[B256]) -> (Vec<WitnessedLeaf>, Vec<ProofItem>) {
    let leaves = paths
        .iter()
        .map(|p| WitnessedLeaf { path: *p, before: prev.get(p).copied(), after: prev.get(p).copied() })
        .collect();
    (leaves, prove(prev, paths))
}

#[test]
fn a_present_leaf_read_as_absent_is_refused() {
    // The critical case: the proof shows the leaf itself, the entry claims None.
    let a = path(0x00, 1);
    let prev = BTreeMap::from([(a, vh(1)), (path(0x80, 2), vh(2))]);
    let (mut leaves, proof) = honest(&prev, &[a]);
    leaves[0].before = None;
    leaves[0].after = Some(vh(5));
    assert_eq!(verify_and_update(root(&prev), &leaves, &proof), Err(TreeError::PresentLeafClaimedAbsent));
}

#[test]
fn a_wrong_previous_value_is_refused() {
    let a = path(0x00, 1);
    let prev = BTreeMap::from([(a, vh(1))]);
    let (mut leaves, proof) = honest(&prev, &[a]);
    leaves[0].before = Some(vh(2));
    assert_eq!(verify_and_update(root(&prev), &leaves, &proof), Err(TreeError::ValueMismatch));
}

#[test]
fn unsorted_and_duplicate_entries_are_refused() {
    let (a, b) = (path(0x00, 1), path(0x80, 2));
    let prev = BTreeMap::from([(a, vh(1)), (b, vh(2))]);
    let (leaves, proof) = honest(&prev, &[a, b]);
    let reversed = vec![leaves[1].clone(), leaves[0].clone()];
    assert_eq!(verify_and_update(root(&prev), &reversed, &proof), Err(TreeError::EntriesNotStrictlyIncreasing));
    let doubled = vec![leaves[0].clone(), leaves[0].clone()];
    assert_eq!(verify_and_update(root(&prev), &doubled, &proof), Err(TreeError::EntriesNotStrictlyIncreasing));
}

#[test]
fn another_leaf_off_the_position_is_refused() {
    // A witnessed absent path (bit 0 = 0) whose position at depth 1 the proof
    // says holds a leaf with bit 0 = 1: not on that position's prefix.
    let p = path(0x01, 5);
    let x = path(0x80, 9);
    let leaves = vec![WitnessedLeaf { path: p, before: None, after: None }];
    let proof = vec![ProofItem::Descend, ProofItem::Leaf { path: x, value_hash: vh(9) }, ProofItem::Empty];
    assert_eq!(verify_and_update(B256::ZERO, &leaves, &proof), Err(TreeError::LeafOffPosition));
}

#[test]
fn a_present_entry_beside_another_leaf_is_refused() {
    let (a, b) = (path(0x00, 1), path(0x20, 2));
    let prev = BTreeMap::from([(a, vh(1))]);
    let proof = prove(&prev, &[b]);
    let leaves = vec![WitnessedLeaf { path: b, before: Some(vh(2)), after: Some(vh(2)) }];
    assert_eq!(verify_and_update(root(&prev), &leaves, &proof), Err(TreeError::AbsenceProofForPresentEntry));
}

#[test]
fn an_empty_position_for_a_present_entry_is_refused() {
    let b = path(0x80, 2);
    let prev = BTreeMap::new();
    let proof = prove(&prev, &[b]);
    let leaves = vec![WitnessedLeaf { path: b, before: Some(vh(2)), after: Some(vh(2)) }];
    assert_eq!(verify_and_update(root(&prev), &leaves, &proof), Err(TreeError::AbsenceProofForPresentEntry));
}

#[test]
fn a_surplus_or_a_short_proof_is_refused() {
    let (a, b) = (path(0x00, 1), path(0x80, 2));
    let prev = BTreeMap::from([(a, vh(1)), (b, vh(2))]);
    let (leaves, mut proof) = honest(&prev, &[a]);
    proof.push(ProofItem::Empty);
    assert_eq!(verify_and_update(root(&prev), &leaves, &proof), Err(TreeError::ProofNotConsumed));
    let (leaves, mut proof) = honest(&prev, &[a]);
    proof.pop();
    assert_eq!(verify_and_update(root(&prev), &leaves, &proof), Err(TreeError::ProofTooShort));
}

#[test]
fn a_node_at_a_witnessed_position_is_refused() {
    let a = path(0x00, 1);
    let prev = BTreeMap::from([(a, vh(1)), (path(0x40, 2), vh(2))]);
    let leaves = vec![WitnessedLeaf { path: a, before: Some(vh(1)), after: Some(vh(1)) }];
    let proof = vec![ProofItem::Node(root(&prev))];
    assert_eq!(verify_and_update(root(&prev), &leaves, &proof), Err(TreeError::NodeAtWitnessedPosition));
}

#[test]
fn a_misstated_shape_fails_the_previous_root() {
    // A lone leaf beside the witnessed side given as a node: the previous
    // hash is not the previous root.
    let (a, b) = (path(0x00, 1), path(0x80, 2));
    let prev = BTreeMap::from([(b, vh(2))]);
    let leaves = vec![WitnessedLeaf { path: a, before: None, after: Some(vh(1)) }];
    let proof = vec![ProofItem::Descend, ProofItem::Empty, ProofItem::Node(leaf_hash(&b, &vh(2)))];
    assert_eq!(verify_and_update(root(&prev), &leaves, &proof), Err(TreeError::PreviousRootMismatch));
}

#[test]
fn a_leaf_removed_is_refused() {
    let a = path(0x00, 1);
    let prev = BTreeMap::from([(a, vh(1))]);
    let (mut leaves, proof) = honest(&prev, &[a]);
    leaves[0].after = None;
    assert_eq!(verify_and_update(root(&prev), &leaves, &proof), Err(TreeError::LeafRemoved));
}

// ── The relocation attack: every leaf is checked against its position ───

#[test]
fn a_lone_leaf_moved_off_its_path_beside_split_witnesses_is_refused() {
    // x is alone in the tree. The batch witnesses two absent paths p and q
    // with bit 0 = 0, so the descent splits; the prover places x on the
    // unwitnessed side of a split below, off x's own path (x has bit 0 = 1).
    let x = path(0x80, 1);
    let prev = BTreeMap::from([(x, vh(1))]);
    let (p, q) = (path(0x00, 2), path(0x40, 3));
    let leaves = vec![
        WitnessedLeaf { path: p, before: None, after: None },
        WitnessedLeaf { path: q, before: None, after: None },
    ];
    // depth 0 split: left {p, q}, right {}. Left depth 1 split: p left, q right.
    // Honest: [Empty (p), Empty (q), Leaf x (right of root)].
    // Attack: x placed on p's side at depth 2, the root's right side empty.
    let proof = vec![
        ProofItem::Descend,
        ProofItem::Empty,
        ProofItem::Leaf { path: x, value_hash: vh(1) },
        ProofItem::Empty,
        ProofItem::Empty,
    ];
    assert_eq!(verify_and_update(root(&prev), &leaves, &proof), Err(TreeError::LeafOffPosition));
}

#[test]
fn a_descend_over_a_lone_leaf_that_moves_it_aside_is_refused() {
    // One witnessed absent path p (bit 0 = 0); the tree holds only x, also
    // with bit 0 = 0. The prover descends and puts x on the side that is not
    // p's (bit 0 = 1), where x does not belong.
    let x = path(0x01, 1);
    let p = path(0x00, 2);
    let prev = BTreeMap::from([(x, vh(1))]);
    let leaves = vec![WitnessedLeaf { path: p, before: None, after: Some(vh(2)) }];
    let proof = vec![ProofItem::Descend, ProofItem::Empty, ProofItem::Leaf { path: x, value_hash: vh(1) }];
    assert_eq!(verify_and_update(root(&prev), &leaves, &proof), Err(TreeError::LeafOffPosition));
}

#[test]
fn a_descend_past_the_last_bit_is_refused() {
    // The all-zero path: every split sends it left, so a run of `Descend`
    // follows it to the last bit.
    let p = B256::ZERO;
    let leaves = vec![WitnessedLeaf { path: p, before: None, after: None }];
    let proof = vec![ProofItem::Descend; 300];
    assert_eq!(verify_and_update(B256::ZERO, &leaves, &proof), Err(TreeError::DescendPastLastBit));
}

/// Mutate an honest proof: whatever the descent accepts must reach the root
/// of the true post-state.
#[test]
fn a_mutated_proof_is_refused_or_reaches_the_true_root() {
    for seed in 1..=60u64 {
        let mut rng = XorShift(seed.wrapping_mul(0xA24B_AED4_963E_E407));
        let mut state: BTreeMap<B256, B256> = BTreeMap::new();
        for _ in 0..(rng.next() % 12) {
            state.insert(rng.path(), vh((rng.next() % 250) as u8));
        }
        let mut writes: BTreeMap<B256, Option<B256>> = BTreeMap::new();
        for _ in 0..(1 + rng.next() % 4) {
            let p = if !state.is_empty() && rng.next() % 2 == 0 {
                *state.keys().nth((rng.next() as usize) % state.len()).unwrap()
            } else {
                rng.path()
            };
            writes.insert(p, if rng.next() % 3 == 0 { None } else { Some(vh((rng.next() % 250) as u8)) });
        }
        let paths: Vec<B256> = writes.keys().copied().collect();
        let leaves: Vec<WitnessedLeaf> = writes
            .iter()
            .map(|(p, w)| WitnessedLeaf { path: *p, before: state.get(p).copied(), after: w.or(state.get(p).copied()) })
            .collect();
        let mut post = state.clone();
        for (p, w) in &writes {
            if let Some(v) = w {
                post.insert(*p, *v);
            }
        }
        let honest = prove(&state, &paths);
        let leaf_pool: Vec<ProofItem> = state
            .iter()
            .map(|(p, v)| ProofItem::Leaf { path: *p, value_hash: *v })
            .collect();
        for _ in 0..200 {
            let mut proof = honest.clone();
            match rng.next() % 6 {
                0 if proof.len() > 1 => {
                    let (i, j) = ((rng.next() as usize) % proof.len(), (rng.next() as usize) % proof.len());
                    proof.swap(i, j);
                }
                1 => {
                    let i = (rng.next() as usize) % (proof.len() + 1);
                    proof.insert(i, ProofItem::Descend);
                }
                2 if !proof.is_empty() => {
                    let i = (rng.next() as usize) % proof.len();
                    proof.remove(i);
                }
                3 if !leaf_pool.is_empty() => {
                    let i = (rng.next() as usize) % (proof.len() + 1);
                    proof.insert(i, leaf_pool[(rng.next() as usize) % leaf_pool.len()].clone());
                    proof.insert(i, ProofItem::Empty);
                }
                4 if !proof.is_empty() => {
                    let i = (rng.next() as usize) % proof.len();
                    proof[i] = match rng.next() % 3 {
                        0 => ProofItem::Empty,
                        1 => ProofItem::Node(root(&state)),
                        _ => ProofItem::Descend,
                    };
                }
                _ => {
                    let i = (rng.next() as usize) % (proof.len() + 1);
                    proof.insert(i, ProofItem::Empty);
                }
            }
            if let Ok(new) = verify_and_update(root(&state), &leaves, &proof) {
                assert_eq!(new, root(&post), "seed {seed}: an accepted proof must reach the true root");
            }
        }
    }
}

#[test]
fn a_descend_where_no_path_is_witnessed_is_refused() {
    let (a, b) = (path(0x00, 1), path(0x80, 2));
    let prev = BTreeMap::from([(b, vh(2))]);
    // a's side is split by the witnessed path; b's side holds nothing
    // witnessed, and the proof says to descend there.
    let leaves = vec![WitnessedLeaf { path: a, before: None, after: None }];
    let proof = vec![ProofItem::Descend, ProofItem::Empty, ProofItem::Descend];
    assert_eq!(verify_and_update(root(&prev), &leaves, &proof), Err(TreeError::DescendWithoutWitnessedPath));
}
