//! The batch path's state tree: a compact sparse binary merkle tree over
//! 256-bit leaf paths, keccak256.
//!
//! The root of a set S of leaves with distinct paths is `T(S, 0)`:
//! - `T(∅, d) = 0`;
//! - `T({x}, d) = leaf_hash(x)` — a subtree holding one leaf is that leaf;
//! - otherwise `T(S, d) = node_hash(T(S₀, d+1), T(S₁, d+1))`, `S₀` and `S₁`
//!   splitting S by bit `d` of the path, bit 0 the most significant.
//!
//! The root is a function of the set alone. A leaf's preimage is
//! `0x00 ‖ path ‖ value hash` and a node's `0x01 ‖ left ‖ right`, both 65
//! bytes, so neither can stand for the other without a keccak collision.
//!
//! A batch proves the leaves it touches against the previous root with a
//! witness (`prove`), and one descent over those leaves (`verify_and_update`)
//! checks the witness against the previous root and computes the new root.
//! Leaves are inserted or updated, never removed: the Core never deletes an
//! entry.

use alloy_primitives::{keccak256, B256};
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;

/// A leaf's hash: `keccak256(0x00 ‖ path ‖ value_hash)`.
pub fn leaf_hash(path: &B256, value_hash: &B256) -> B256 {
    let mut data = [0u8; 65];
    data[1..33].copy_from_slice(path.as_slice());
    data[33..65].copy_from_slice(value_hash.as_slice());
    keccak256(data)
}

/// An internal node's hash: `keccak256(0x01 ‖ left ‖ right)`.
pub fn node_hash(left: &B256, right: &B256) -> B256 {
    let mut data = [0u8; 65];
    data[0] = 0x01;
    data[1..33].copy_from_slice(left.as_slice());
    data[33..65].copy_from_slice(right.as_slice());
    keccak256(data)
}

/// Bit `d` of a path, bit 0 the most significant.
fn bit(path: &B256, d: usize) -> bool {
    (path.as_slice()[d / 8] >> (7 - d % 8)) & 1 == 1
}

/// Whether two paths agree on bits `0..d`.
fn same_prefix(a: &B256, b: &B256, d: usize) -> bool {
    (0..d).all(|i| bit(a, i) == bit(b, i))
}

/// A subtree as the root sees it: empty, one leaf (which rises to the
/// first position its path shares with no other leaf), or a node.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
enum Summary {
    Empty,
    One(B256),
    Node(B256),
}

impl Summary {
    fn hash(self) -> B256 {
        match self {
            Summary::Empty => B256::ZERO,
            Summary::One(h) | Summary::Node(h) => h,
        }
    }

    /// Two sibling subtrees as their parent, as `T` combines them.
    fn combine(left: Summary, right: Summary) -> Summary {
        match (left, right) {
            (Summary::Empty, Summary::Empty) => Summary::Empty,
            (Summary::Empty, Summary::One(h)) | (Summary::One(h), Summary::Empty) => Summary::One(h),
            (l, r) => Summary::Node(node_hash(&l.hash(), &r.hash())),
        }
    }
}

/// `T` over leaves sorted by path (a sorted slice splits by a bit at one
/// index), as a summary.
fn summarize(leaves: &[(B256, B256)], d: usize) -> Summary {
    match leaves {
        [] => Summary::Empty,
        [(p, v)] => Summary::One(leaf_hash(p, v)),
        _ => {
            let split = leaves.partition_point(|(p, _)| !bit(p, d));
            Summary::combine(summarize(&leaves[..split], d + 1), summarize(&leaves[split..], d + 1))
        }
    }
}

/// The root of a set of leaves (path → value hash).
pub fn root(leaves: &BTreeMap<B256, B256>) -> B256 {
    let sorted: Vec<(B256, B256)> = leaves.iter().map(|(p, v)| (*p, *v)).collect();
    summarize(&sorted, 0).hash()
}

/// One item of a witness's proof, consumed in descent order.
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub enum ProofItem {
    /// The subtree at this position holds no leaf.
    Empty,
    /// It holds exactly one leaf.
    Leaf { path: B256, value_hash: B256 },
    /// It holds two or more leaves, none witnessed, and this is its hash.
    Node(B256),
    /// It holds two or more leaves, one path witnessed: the descent continues.
    Descend,
}

/// A leaf the batch touches: its path, and its value hash before and after
/// the batch (`None` for absent).
#[derive(Clone, Debug, PartialEq, Eq, Serialize, Deserialize)]
pub struct WitnessedLeaf {
    pub path: B256,
    pub before: Option<B256>,
    pub after: Option<B256>,
}

/// Why a witness is refused.
#[derive(Clone, Debug, PartialEq, Eq)]
pub enum TreeError {
    /// The witnessed paths are not strictly increasing (unsorted or doubled).
    EntriesNotStrictlyIncreasing,
    /// A leaf present before the batch is absent after it.
    LeafRemoved,
    /// The proof shows the witnessed leaf itself, and the entry says absent.
    PresentLeafClaimedAbsent,
    /// The proof shows an empty position or another leaf, and the entry says present.
    AbsenceProofForPresentEntry,
    /// The proof's leaf for this position does not share its prefix.
    LeafOffPosition,
    /// The proof's value hash for a witnessed leaf is not the entry's.
    ValueMismatch,
    /// A `Node` where a witnessed path lies, or a `Descend` where none does.
    NodeAtWitnessedPosition,
    DescendWithoutWitnessedPath,
    /// A `Descend` at the last bit of the path, where no split is left.
    DescendPastLastBit,
    /// The proof ran out before the descent ended.
    ProofTooShort,
    /// The descent ended with proof items left.
    ProofNotConsumed,
    /// The witness does not hash to the previous root.
    PreviousRootMismatch,
}

struct Descent<'a> {
    proof: &'a [ProofItem],
    next: usize,
}

impl<'a> Descent<'a> {
    fn take(&mut self) -> Result<&'a ProofItem, TreeError> {
        let item = self.proof.get(self.next).ok_or(TreeError::ProofTooShort)?;
        self.next += 1;
        Ok(item)
    }

    /// The (before, after) summaries of the subtree at depth `d`, at the
    /// position whose first `d` bits are `prefix`'s, whose witnessed leaves
    /// are `w` (sorted, all on this position). Every leaf the proof names is
    /// checked against the position: a lone leaf rises through empty
    /// siblings, so the previous hash alone cannot tell where it sat.
    fn walk(&mut self, w: &[WitnessedLeaf], d: usize, prefix: &B256) -> Result<(Summary, Summary), TreeError> {
        match w {
            [] => match self.take()? {
                ProofItem::Empty => Ok((Summary::Empty, Summary::Empty)),
                ProofItem::Leaf { path, value_hash } => {
                    if !same_prefix(path, prefix, d) {
                        return Err(TreeError::LeafOffPosition);
                    }
                    let s = Summary::One(leaf_hash(path, value_hash));
                    Ok((s, s))
                }
                ProofItem::Node(h) => Ok((Summary::Node(*h), Summary::Node(*h))),
                ProofItem::Descend => Err(TreeError::DescendWithoutWitnessedPath),
            },
            [x] => match self.take()? {
                ProofItem::Empty => {
                    if x.before.is_some() {
                        return Err(TreeError::AbsenceProofForPresentEntry);
                    }
                    let after = x.after.map_or(Summary::Empty, |v| Summary::One(leaf_hash(&x.path, &v)));
                    Ok((Summary::Empty, after))
                }
                ProofItem::Leaf { path, value_hash } if *path == x.path => {
                    // The position holds the witnessed leaf itself.
                    let before = x.before.ok_or(TreeError::PresentLeafClaimedAbsent)?;
                    if before != *value_hash {
                        return Err(TreeError::ValueMismatch);
                    }
                    let after = x.after.ok_or(TreeError::LeafRemoved)?;
                    Ok((Summary::One(leaf_hash(&x.path, &before)), Summary::One(leaf_hash(&x.path, &after))))
                }
                ProofItem::Leaf { path, value_hash } => {
                    // Another leaf holds the position: the witnessed one is absent.
                    if !same_prefix(path, prefix, d) {
                        return Err(TreeError::LeafOffPosition);
                    }
                    if x.before.is_some() {
                        return Err(TreeError::AbsenceProofForPresentEntry);
                    }
                    let before = Summary::One(leaf_hash(path, value_hash));
                    let after = match x.after {
                        None => before,
                        Some(v) => {
                            let mut pair = [(*path, *value_hash), (x.path, v)];
                            pair.sort_by(|a, b| a.0.cmp(&b.0));
                            summarize(&pair, d)
                        }
                    };
                    Ok((before, after))
                }
                ProofItem::Descend if d >= 256 => Err(TreeError::DescendPastLastBit),
                ProofItem::Descend => self.split(w, d, prefix),
                ProofItem::Node(_) => Err(TreeError::NodeAtWitnessedPosition),
            },
            _ => self.split(w, d, prefix),
        }
    }

    /// Split the witnessed leaves by bit `d` — the direction from the
    /// paths, never from the proof — and combine the two halves.
    fn split(&mut self, w: &[WitnessedLeaf], d: usize, prefix: &B256) -> Result<(Summary, Summary), TreeError> {
        let at = w.partition_point(|x| !bit(&x.path, d));
        let mut right = *prefix;
        right.0[d / 8] |= 1 << (7 - d % 8);
        let (lb, la) = self.walk(&w[..at], d + 1, prefix)?;
        let (rb, ra) = self.walk(&w[at..], d + 1, &right)?;
        Ok((Summary::combine(lb, rb), Summary::combine(la, ra)))
    }
}

/// Check a batch's witness and return its (previous, new) roots: the guest
/// commits the previous root as a public value, and the chain holds it to
/// the root it keeps. `leaves` are the batch's touched leaves, strictly
/// increasing by path; `proof` the previous tree's items for them, in
/// descent order.
pub fn roots(leaves: &[WitnessedLeaf], proof: &[ProofItem]) -> Result<(B256, B256), TreeError> {
    if leaves.windows(2).any(|pair| pair[0].path >= pair[1].path) {
        return Err(TreeError::EntriesNotStrictlyIncreasing);
    }
    if leaves.iter().any(|x| x.before.is_some() && x.after.is_none()) {
        return Err(TreeError::LeafRemoved);
    }
    let mut descent = Descent { proof, next: 0 };
    let (before, after) = descent.walk(leaves, 0, &B256::ZERO)?;
    if descent.next != proof.len() {
        return Err(TreeError::ProofNotConsumed);
    }
    Ok((before.hash(), after.hash()))
}

/// `roots`, held to a given previous root: the new root.
pub fn verify_and_update(
    prev_root: B256,
    leaves: &[WitnessedLeaf],
    proof: &[ProofItem],
) -> Result<B256, TreeError> {
    let (before, after) = roots(leaves, proof)?;
    if before != prev_root {
        return Err(TreeError::PreviousRootMismatch);
    }
    Ok(after)
}

/// The proof for `paths` (strictly increasing) against the full set of
/// leaves: the items `verify_and_update` consumes, in descent order.
pub fn prove(leaves: &BTreeMap<B256, B256>, paths: &[B256]) -> Vec<ProofItem> {
    let sorted: Vec<(B256, B256)> = leaves.iter().map(|(p, v)| (*p, *v)).collect();
    let mut out = Vec::new();
    prove_at(&sorted, paths, 0, &mut out);
    out
}

fn prove_at(leaves: &[(B256, B256)], paths: &[B256], d: usize, out: &mut Vec<ProofItem>) {
    match paths {
        [] => out.push(match leaves {
            [] => ProofItem::Empty,
            [(p, v)] => ProofItem::Leaf { path: *p, value_hash: *v },
            _ => ProofItem::Node(summarize(leaves, d).hash()),
        }),
        [_] if leaves.len() <= 1 => out.push(match leaves {
            [] => ProofItem::Empty,
            [(p, v)] => ProofItem::Leaf { path: *p, value_hash: *v },
            _ => unreachable!(),
        }),
        _ => {
            if paths.len() == 1 {
                out.push(ProofItem::Descend);
            }
            let ls = leaves.partition_point(|(p, _)| !bit(p, d));
            let ps = paths.partition_point(|p| !bit(p, d));
            prove_at(&leaves[..ls], &paths[..ps], d + 1, out);
            prove_at(&leaves[ls..], &paths[ps..], d + 1, out);
        }
    }
}
