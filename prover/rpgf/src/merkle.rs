use alloy_primitives::{Address, B256, U256};
use sha3::{Digest, Keccak256};

/// Leaf hash matching StagedMerkleAirdrop's expectation:
///   `keccak256(abi.encodePacked(recipient, amount))`
/// where recipient is 20 bytes and amount is 32 bytes big-endian.
pub fn leaf_hash(recipient: &Address, amount: &U256) -> B256 {
    let mut bytes = Vec::with_capacity(20 + 32);
    bytes.extend_from_slice(recipient.as_slice());
    bytes.extend_from_slice(&amount.to_be_bytes::<32>());
    B256::from_slice(&Keccak256::digest(&bytes))
}

/// Build a Merkle root using the OpenZeppelin sorted-pair convention,
/// which is what `MerkleProof.verify` in OZ Solidity uses by default
/// and what StagedMerkleAirdrop relies on.
///
/// Sorted-pair: at each level, hash(min(l, r) || max(l, r)) rather
/// than positional pairing. Drops the need to know leaf ordering at
/// proof time.
pub fn build_merkle_root(leaves: &[(Address, U256)]) -> B256 {
    if leaves.is_empty() {
        return B256::ZERO;
    }
    let mut hashes: Vec<B256> = leaves.iter().map(|(r, a)| leaf_hash(r, a)).collect();
    while hashes.len() > 1 {
        let mut next = Vec::with_capacity((hashes.len() + 1) / 2);
        let mut i = 0;
        while i < hashes.len() {
            if i + 1 < hashes.len() {
                next.push(hash_pair_sorted(hashes[i], hashes[i + 1]));
                i += 2;
            } else {
                // Odd leaf at this level — promote unchanged. Matches
                // OZ's standard tree behavior when the layer is odd.
                next.push(hashes[i]);
                i += 1;
            }
        }
        hashes = next;
    }
    hashes[0]
}

fn hash_pair_sorted(a: B256, b: B256) -> B256 {
    let (lo, hi) = if a.as_slice() <= b.as_slice() { (a, b) } else { (b, a) };
    let mut bytes = [0u8; 64];
    bytes[..32].copy_from_slice(lo.as_slice());
    bytes[32..].copy_from_slice(hi.as_slice());
    B256::from_slice(&Keccak256::digest(&bytes))
}
