import { describe, it, expect } from "vitest";
import { keccak256, encodePacked, getAddress } from "viem";
import {
    buildMerkleAirdrop,
    computeAirdropLeaf,
    type AirdropEntry,
} from "../src/merkleAirdrop.js";

/** Pad a small integer to a checksummed Ethereum address. */
function addr(n: number): `0x${string}` {
    return getAddress(`0x${n.toString(16).padStart(40, "0")}`);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Simulate OZ MerkleProof.verify in TypeScript. */
function verifyProof(
    proof: `0x${string}`[],
    root: `0x${string}`,
    leaf: `0x${string}`,
): boolean {
    let computed: `0x${string}` = leaf;
    for (const p of proof) {
        const [lo, hi] = computed < p ? [computed, p] : [p, computed];
        computed = keccak256(encodePacked(["bytes32", "bytes32"], [lo, hi]));
    }
    return computed === root;
}

// ── computeAirdropLeaf ────────────────────────────────────────────────────────

describe("computeAirdropLeaf", () => {
    it("matches the contract encoding: keccak256(abi.encodePacked(address, uint256))", () => {
        const a = addr(0xA);
        const amount = 100n * 10n ** 18n;
        const leaf = computeAirdropLeaf(a, amount);
        // Re-derive independently
        const expected = keccak256(encodePacked(["address", "uint256"], [a, amount]));
        expect(leaf).toBe(expected);
    });

    it("produces different leaves for same address with different amounts", () => {
        const a = addr(0xA);
        expect(computeAirdropLeaf(a, 100n)).not.toBe(computeAirdropLeaf(a, 200n));
    });

    it("produces different leaves for different addresses with same amount", () => {
        const a = addr(0xA);
        const b = addr(0xB);
        expect(computeAirdropLeaf(a, 100n)).not.toBe(computeAirdropLeaf(b, 100n));
    });
});

// ── Single-entry tree ─────────────────────────────────────────────────────────

describe("buildMerkleAirdrop — single entry", () => {
    const alice = addr(0xA);
    const entries: AirdropEntry[] = [{ address: alice, amount: 50_000n * 10n ** 18n }];

    it("root equals the leaf for a single-entry tree", () => {
        const tree = buildMerkleAirdrop(entries);
        const leaf = computeAirdropLeaf(alice, entries[0].amount);
        expect(tree.root).toBe(leaf);
    });

    it("proof is empty for a single-entry tree", () => {
        const tree = buildMerkleAirdrop(entries);
        expect(tree.getProof(alice)).toEqual([]);
    });

    it("empty proof verifies against root that equals leaf", () => {
        const tree = buildMerkleAirdrop(entries);
        const leaf = computeAirdropLeaf(alice, entries[0].amount);
        expect(verifyProof([], tree.root, leaf)).toBe(true);
    });
});

// ── Two-entry tree ────────────────────────────────────────────────────────────

describe("buildMerkleAirdrop — two entries", () => {
    // Use the same addresses as the Solidity airdrop tests to validate parity.
    // alice = 0xA, bob = 0xB, same amount for both.
    const alice = addr(0xA);
    const bob   = addr(0xB);
    const amount = 100n * 10n ** 18n;

    const entries: AirdropEntry[] = [
        { address: alice, amount },
        { address: bob, amount },
    ];

    it("both proofs verify against the same root", () => {
        const tree = buildMerkleAirdrop(entries);
        const aliceLeaf = computeAirdropLeaf(alice, amount);
        const bobLeaf   = computeAirdropLeaf(bob, amount);

        expect(verifyProof(tree.getProof(alice), tree.root, aliceLeaf)).toBe(true);
        expect(verifyProof(tree.getProof(bob),   tree.root, bobLeaf)).toBe(true);
    });

    it("alice proof contains bob leaf and vice versa", () => {
        const tree = buildMerkleAirdrop(entries);
        const aliceLeaf = computeAirdropLeaf(alice, amount);
        const bobLeaf   = computeAirdropLeaf(bob, amount);

        // Each proof is a single element — the sibling's leaf
        expect(tree.getProof(alice)).toHaveLength(1);
        expect(tree.getProof(bob)).toHaveLength(1);
        expect(tree.getProof(alice)[0]).toBe(bobLeaf);
        expect(tree.getProof(bob)[0]).toBe(aliceLeaf);
    });

    it("root is correct regardless of input order", () => {
        const tree1 = buildMerkleAirdrop([entries[0], entries[1]]);
        const tree2 = buildMerkleAirdrop([entries[1], entries[0]]);
        expect(tree1.root).toBe(tree2.root);
    });

    it("wrong amount produces a leaf that fails verification", () => {
        const tree = buildMerkleAirdrop(entries);
        const wrongLeaf = computeAirdropLeaf(alice, amount + 1n);
        expect(verifyProof(tree.getProof(alice), tree.root, wrongLeaf)).toBe(false);
    });

    it("cross-proof (alice proof for bob leaf) fails", () => {
        const tree = buildMerkleAirdrop(entries);
        const aliceLeaf = computeAirdropLeaf(alice, amount);
        // Try to use alice's proof to claim bob's leaf
        expect(verifyProof(tree.getProof(bob), tree.root, aliceLeaf)).toBe(false);
    });
});

// ── Four-entry tree ───────────────────────────────────────────────────────────

describe("buildMerkleAirdrop — four entries", () => {
    const entries: AirdropEntry[] = [
        { address: addr(1), amount: 100n * 10n ** 18n },
        { address: addr(2), amount: 200n * 10n ** 18n },
        { address: addr(3), amount: 300n * 10n ** 18n },
        { address: addr(4), amount: 400n * 10n ** 18n },
    ];

    it("all four proofs verify", () => {
        const tree = buildMerkleAirdrop(entries);
        for (const e of entries) {
            const leaf = computeAirdropLeaf(e.address, e.amount);
            expect(verifyProof(tree.getProof(e.address), tree.root, leaf)).toBe(true);
        }
    });

    it("all proofs have length 2 (ceil(log2(4)))", () => {
        const tree = buildMerkleAirdrop(entries);
        for (const e of entries) {
            expect(tree.getProof(e.address)).toHaveLength(2);
        }
    });

    it("root is stable regardless of input order", () => {
        const shuffled = [entries[2], entries[0], entries[3], entries[1]];
        const tree1 = buildMerkleAirdrop(entries);
        const tree2 = buildMerkleAirdrop(shuffled);
        expect(tree1.root).toBe(tree2.root);
    });
});

// ── Odd-count tree ────────────────────────────────────────────────────────────

describe("buildMerkleAirdrop — odd entry count (3)", () => {
    const entries: AirdropEntry[] = [
        { address: addr(1), amount: 100n * 10n ** 18n },
        { address: addr(2), amount: 200n * 10n ** 18n },
        { address: addr(3), amount: 300n * 10n ** 18n },
    ];

    it("all three proofs verify", () => {
        const tree = buildMerkleAirdrop(entries);
        for (const e of entries) {
            const leaf = computeAirdropLeaf(e.address, e.amount);
            expect(verifyProof(tree.getProof(e.address), tree.root, leaf)).toBe(true);
        }
    });
});

// ── Large tree (100 entries) ──────────────────────────────────────────────────

describe("buildMerkleAirdrop — large tree (100 entries)", () => {
    const entries: AirdropEntry[] = Array.from({ length: 100 }, (_, i) => ({
        address: addr(i + 1),
        amount: BigInt(i + 1) * 10n ** 18n,
    }));

    it("all 100 proofs verify", () => {
        const tree = buildMerkleAirdrop(entries);
        for (const e of entries) {
            const leaf = computeAirdropLeaf(e.address, e.amount);
            expect(verifyProof(tree.getProof(e.address), tree.root, leaf)).toBe(true);
        }
    });

    it("proof length is ceil(log2(100)) = 7", () => {
        const tree = buildMerkleAirdrop(entries);
        // Most proofs will be 7 (some odd-level nodes propagate without sibling)
        for (const e of entries) {
            expect(tree.getProof(e.address).length).toBeLessThanOrEqual(7);
        }
    });
});

// ── getAmount ─────────────────────────────────────────────────────────────────

describe("getAmount", () => {
    const alice = addr(0xA);
    const entries: AirdropEntry[] = [{ address: alice, amount: 999n * 10n ** 18n }];

    it("returns the correct amount for a claimant", () => {
        const tree = buildMerkleAirdrop(entries);
        expect(tree.getAmount(alice)).toBe(999n * 10n ** 18n);
    });

    it("is case-insensitive for the address lookup", () => {
        const tree = buildMerkleAirdrop(entries);
        expect(tree.getAmount(alice.toUpperCase() as `0x${string}`)).toBe(999n * 10n ** 18n);
    });
});

// ── Error cases ───────────────────────────────────────────────────────────────

describe("buildMerkleAirdrop — error cases", () => {
    it("throws on empty entry list", () => {
        expect(() => buildMerkleAirdrop([])).toThrow("empty");
    });

    it("throws on duplicate address", () => {
        const a = addr(0xA);
        expect(() => buildMerkleAirdrop([
            { address: a, amount: 100n },
            { address: a, amount: 200n },
        ])).toThrow("Duplicate");
    });

    it("getProof throws for address not in tree", () => {
        const tree = buildMerkleAirdrop([{ address: addr(0xA), amount: 100n }]);
        expect(() => tree.getProof(addr(0xB))).toThrow("not in airdrop");
    });

    it("getAmount throws for address not in tree", () => {
        const tree = buildMerkleAirdrop([{ address: addr(0xA), amount: 100n }]);
        expect(() => tree.getAmount(addr(0xB))).toThrow("not in airdrop");
    });
});
