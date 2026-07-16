//! OpenZeppelin-style sorted-pair Merkle inclusion verification.
//!
//! Mirrors `MerkleProof.verify` / `_hashPair` from OpenZeppelin's
//! `MerkleProof.sol` — the same tree the off-chain agreement
//! builds (`frontend/lib/core/agreement.ts`, `sdk/src/agreement.ts`)
//! and `AttestationCoordinator._validateContent` verifies on the direct
//! path. Sorted-pair hashing means the proof carries no direction bits.

use alloy_primitives::{keccak256, B256};

/// Verify that `leaf` is a member of the tree rooted at `root`, given the
/// sorted-pair Merkle `proof` path. An empty proof verifies a single-leaf
/// tree (`leaf == root`).
pub fn verify_inclusion(proof: &[B256], root: B256, leaf: B256) -> bool {
    let mut computed = leaf;
    for sibling in proof {
        computed = hash_pair_sorted(computed, *sibling);
    }
    computed == root
}

/// `keccak256` of the two 32-byte operands concatenated, smaller first —
/// the OpenZeppelin `_hashPair` convention.
fn hash_pair_sorted(a: B256, b: B256) -> B256 {
    let (lo, hi) = if a <= b { (a, b) } else { (b, a) };
    let mut bytes = [0u8; 64];
    bytes[..32].copy_from_slice(lo.as_slice());
    bytes[32..].copy_from_slice(hi.as_slice());
    keccak256(bytes)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn h(byte: u8) -> B256 {
        B256::repeat_byte(byte)
    }

    #[test]
    fn single_leaf_tree_verifies_with_empty_proof() {
        let leaf = h(0xaa);
        assert!(verify_inclusion(&[], leaf, leaf));
    }

    #[test]
    fn single_leaf_rejects_wrong_root() {
        assert!(!verify_inclusion(&[], h(0xbb), h(0xaa)));
    }

    #[test]
    fn two_leaf_tree_verifies_both_leaves() {
        let a = h(0x11);
        let b = h(0x22);
        let root = hash_pair_sorted(a, b);
        assert!(verify_inclusion(&[b], root, a));
        assert!(verify_inclusion(&[a], root, b));
    }

    #[test]
    fn four_leaf_tree_verifies_a_leaf() {
        let (a, b, c, d) = (h(0x01), h(0x02), h(0x03), h(0x04));
        let ab = hash_pair_sorted(a, b);
        let cd = hash_pair_sorted(c, d);
        let root = hash_pair_sorted(ab, cd);
        // Proof for leaf `a`: sibling b, then sibling cd.
        assert!(verify_inclusion(&[b, cd], root, a));
        // Proof for leaf `d`: sibling c, then sibling ab.
        assert!(verify_inclusion(&[c, ab], root, d));
    }

    #[test]
    fn wrong_sibling_rejects() {
        let a = h(0x11);
        let b = h(0x22);
        let root = hash_pair_sorted(a, b);
        assert!(!verify_inclusion(&[h(0x33)], root, a));
    }

    #[test]
    fn hash_pair_is_order_independent() {
        let a = h(0x11);
        let b = h(0x22);
        assert_eq!(hash_pair_sorted(a, b), hash_pair_sorted(b, a));
    }
}
