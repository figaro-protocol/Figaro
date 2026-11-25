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
