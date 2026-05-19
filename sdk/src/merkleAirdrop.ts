/**
 * @figaro/core — Merkle Airdrop Builder
 *
 * Builds a Merkle tree compatible with `RpgfMinter.claim` (and any other
 * contract using OpenZeppelin's `MerkleProof.verify` with sorted-pair
 * hashing). Leaf encoding:
 *
 *   leaf = keccak256(abi.encodePacked(address, uint256))
 *
 * Internal nodes use OZ's _hashPair convention: the smaller hash is placed
 * first before hashing, so proof verification is position-independent.
 *
 * For `RpgfMinter`, a sequencer typically computes the per-tranche root
 * inside the SP1 program rather than via this helper (see
 * `prover/rpgf/src/merkle.rs`). This TypeScript builder is the reference
 * implementation for fixture generation, off-chain claim-proof
 * computation, and tests.
 *
 * Usage (per tranche):
 *   const tree = buildMerkleAirdrop(entries);
 *   const root = tree.root;                    // matches the SP1-proved root
 *   const proof = tree.getProof(userAddress);  // pass to RpgfMinter.claim()
 *   const amount = tree.getAmount(userAddress); // pass to RpgfMinter.claim()
 */

import { keccak256, encodePacked, getAddress } from "viem";
import type { Hex } from "viem";

export type AirdropEntry = {
    address: `0x${string}`;
    amount: bigint;
};

export type MerkleAirdropTree = {
    /** bytes32 root — set as AIRDROP_MERKLE_ROOT env var before deploying */
    root: `0x${string}`;
    /** Returns the Merkle proof for a given address. Throws if not in the tree. */
    getProof: (address: `0x${string}`) => `0x${string}`[];
    /** Returns the claimable amount for a given address. Throws if not in the tree. */
    getAmount: (address: `0x${string}`) => bigint;
    /** All entries, sorted by leaf hash (the canonical tree order). */
    entries: readonly AirdropEntry[];
};

/** Compute the leaf hash for a single airdrop entry. Matches the contract. */
export function computeAirdropLeaf(address: `0x${string}`, amount: bigint): `0x${string}` {
    return keccak256(encodePacked(["address", "uint256"], [getAddress(address), amount]));
}

/**
 * Hash a pair of nodes using OZ's _hashPair convention:
 * sort the two values lexicographically before hashing so proof
 * verification is independent of tree position.
 */
function hashPair(a: `0x${string}`, b: `0x${string}`): `0x${string}` {
    const [lo, hi] = a < b ? [a, b] : [b, a];
    return keccak256(encodePacked(["bytes32", "bytes32"], [lo as Hex, hi as Hex]));
}

/**
 * Build a Merkle tree from an airdrop list.
 *
 * - Leaves are sorted by leaf hash for a deterministic tree regardless of
 *   input order.
 * - Odd-length levels propagate the last node unchanged (no duplication).
 * - Tree depth is ceil(log2(n)) levels above the leaves.
 *
 * @param entries Array of { address, amount } records. Must be non-empty.
 *   Duplicate addresses are rejected.
 */
export function buildMerkleAirdrop(entries: AirdropEntry[]): MerkleAirdropTree {
    if (entries.length === 0) throw new Error("Airdrop entry list is empty");

    // Validate: no duplicate addresses
    const seen = new Set<string>();
    for (const e of entries) {
        const key = e.address.toLowerCase();
        if (seen.has(key)) throw new Error(`Duplicate address in airdrop: ${e.address}`);
        seen.add(key);
    }

    // Compute leaf hashes and sort by hash (deterministic, position-independent)
    const indexed = entries.map(e => ({
        address: e.address,
        amount: e.amount,
        leaf: computeAirdropLeaf(e.address, e.amount),
    }));
    indexed.sort((a, b) => (a.leaf < b.leaf ? -1 : a.leaf > b.leaf ? 1 : 0));

    // Build the tree bottom-up as an array of levels.
    // tree[0] = leaves (sorted), tree[last] = [root]
    const tree: `0x${string}`[][] = [indexed.map(i => i.leaf)];

    while (tree[tree.length - 1].length > 1) {
        const current = tree[tree.length - 1];
        const next: `0x${string}`[] = [];
        for (let i = 0; i < current.length; i += 2) {
            if (i + 1 < current.length) {
                next.push(hashPair(current[i], current[i + 1]));
            } else {
                // Odd leaf: propagate unchanged (no sibling at this level)
                next.push(current[i]);
            }
        }
        tree.push(next);
    }

    const root = tree[tree.length - 1][0];

    // Build a lookup from address (lowercase) to sorted index
    const addressToIndex = new Map<string, number>(
        indexed.map((e, i) => [e.address.toLowerCase(), i])
    );

    function resolve(address: `0x${string}`): number {
        const idx = addressToIndex.get(address.toLowerCase());
        if (idx === undefined) throw new Error(`Address not in airdrop: ${address}`);
        return idx;
    }

    function getProof(address: `0x${string}`): `0x${string}`[] {
        let idx = resolve(address);
        const proof: `0x${string}`[] = [];

        for (let level = 0; level < tree.length - 1; level++) {
            const row = tree[level];
            const siblingIdx = idx % 2 === 0 ? idx + 1 : idx - 1;
            if (siblingIdx < row.length) {
                proof.push(row[siblingIdx]);
            }
            // Odd leaf at this level has no sibling — no proof element added
            idx = Math.floor(idx / 2);
        }

        return proof;
    }

    function getAmount(address: `0x${string}`): bigint {
        return indexed[resolve(address)].amount;
    }

    return {
        root,
        getProof,
        getAmount,
        entries: indexed.map(({ address, amount }) => ({ address, amount })),
    };
}
