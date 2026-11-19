/**
 * topologyLeaf.test.ts — the agreement format's topology leaf. An order
 * names the orders it follows (`Agreement.follows`, their order hashes) in
 * one leaf the format itself carries, in a shape of its own: its inner
 * preimage is the topology domain, the number of edges as a 32-byte word and
 * the data hash, 96 bytes, where a clause leaf's is a clause key and a data
 * hash, 64 bytes. No clause key reproduces it, so no attestation and no
 * usage claim can open it.
 */
import { concat, keccak256, numberToHex, toHex, type Hex } from "viem";
import { describe, expect, it } from "vitest";
import {
    TOPOLOGY_LEAF_DOMAIN,
    TOPOLOGY_LEAF_LABEL,
    agreementLeaves,
    buildLeafInclusionProof,
    buildSignedClauseInclusionProof,
    computeCheckoutHash,
    computeClauseLeaf,
    computeTopologyLeaf,
    topologyLeafBytes,
    topologyContentRef,
    verifyInclusionProof,
    type Agreement,
} from "../src/agreement.js";
import { anchorAgreement } from "../src/anchored.js";

const K = (label: string): Hex => keccak256(toHex(label));
const P1 = `0x${"a1".repeat(32)}` as Hex;
const P2 = `0x${"b2".repeat(32)}` as Hex;
const bare: Agreement = {
    version: "a1",
    buyer: "0x0000000000000000000000000000000000000001",
    seller: "0x0000000000000000000000000000000000000002",
    clauses: [{ clause: K("a clause"), data: { modality: "pickup" } }],
};

describe("the topology leaf's shape", () => {
    it("takes its domain from a label no spec serializes to", () => {
        expect(TOPOLOGY_LEAF_LABEL).toBe("figaro-agreement-topology");
        expect(TOPOLOGY_LEAF_DOMAIN).toBe(keccak256(toHex(TOPOLOGY_LEAF_LABEL)));
    });

    it("commits the edges as canonical JSON, lowercase hex, in the order given", () => {
        const upper = P1.toUpperCase().replace("0X", "0x") as Hex;
        expect(topologyLeafBytes([upper, P2])).toBe(
            toHex(new TextEncoder().encode(`{"follows":["${P1}","${P2}"]}`)),
        );
        expect(topologyLeafBytes([])).toBe(toHex(new TextEncoder().encode(`{"follows":[]}`)));
        expect(topologyContentRef([P1])).toBe(keccak256(topologyLeafBytes([P1])));
    });

    it("double-hashes a 96-byte inner preimage: the domain, the edge count, the data hash", () => {
        for (const follows of [[], [P1], [P1, P2]] as Hex[][]) {
            const inner = concat([TOPOLOGY_LEAF_DOMAIN, numberToHex(follows.length, { size: 32 }), topologyContentRef(follows)]);
            expect((inner.length - 2) / 2).toBe(96);
            expect(computeTopologyLeaf(follows)).toBe(keccak256(keccak256(inner)));
        }
    });

    it("is reproduced by no pair of a 32-byte clause key and a 32-byte data hash", () => {
        // The clause leaf's inner preimage is 64 bytes, the topology leaf's 96:
        // keccak256 over two lengths never meets but by a collision.
        const clauseInner = concat([K("any key"), K("any data")]);
        expect((clauseInner.length - 2) / 2).toBe(64);
        for (const follows of [[], [P1], [P1, P2]] as Hex[][]) {
            const leaf = computeTopologyLeaf(follows);
            const dataHash = topologyContentRef(follows);
            const candidates: Hex[] = [TOPOLOGY_LEAF_DOMAIN, K("figaro-agreement-provenance"), dataHash, numberToHex(follows.length, { size: 32 }), K("a registered clause key")];
            for (const clause of candidates) {
                for (const hash of [dataHash, ...candidates]) {
                    expect(computeClauseLeaf({ clause, dataHash: hash })).not.toBe(leaf);
                }
            }
        }
    });

    it("is reproduced by no withheld entry, because a data hash of another length is refused", () => {
        // The 64-byte `uint256(n) ‖ dataHash` under the topology domain would
        // be the topology leaf's 96-byte inner preimage byte for byte.
        for (const follows of [[], [P1], [P1, P2]] as Hex[][]) {
            const forged = concat([numberToHex(follows.length, { size: 32 }), topologyContentRef(follows)]);
            expect(() => computeClauseLeaf({ clause: TOPOLOGY_LEAF_DOMAIN, dataHash: forged })).toThrow(/32-byte/);
            expect(() => computeClauseLeaf({ clause: K("any key"), dataHash: forged })).toThrow(/32-byte/);
        }
        for (const hash of ["0x", "0x1234", `0x${"ab".repeat(31)}`, `0x${"ab".repeat(33)}`, `0x${"zz".repeat(32)}`]) {
            expect(() => computeClauseLeaf({ clause: K("any key"), dataHash: hash as Hex })).toThrow(/32-byte/);
        }
    });

    it("refuses an edge that is not a 32-byte hash, and an edge named twice", () => {
        expect(() => topologyLeafBytes(["0x1234" as Hex])).toThrow(/32-byte/);
        expect(() => topologyLeafBytes([P1, P1.toUpperCase().replace("0X", "0x") as Hex])).toThrow(/twice/);
        expect(() => topologyLeafBytes("nope" as unknown as Hex[])).toThrow(/list/);
    });
});

describe("the topology leaf in the agreement root", () => {
    it("moves the checkoutHash when the edges change", () => {
        const root = computeCheckoutHash({ ...bare, follows: [P1] });
        expect(computeCheckoutHash({ ...bare, follows: [P2] })).not.toBe(root);
        expect(computeCheckoutHash({ ...bare, follows: [P1, P2] })).not.toBe(root);
        expect(computeCheckoutHash({ ...bare, follows: [P2, P1] })).not.toBe(computeCheckoutHash({ ...bare, follows: [P1, P2] }));
    });

    it("tells an empty list from an absent leaf", () => {
        expect(computeCheckoutHash({ ...bare, follows: [] })).not.toBe(computeCheckoutHash(bare));
        expect(agreementLeaves({ ...bare, follows: [] })).toHaveLength(2);
        expect(agreementLeaves(bare)).toHaveLength(1);
        expect(agreementLeaves({ ...bare, follows: [] })).toContain(computeTopologyLeaf([]));
    });

    it("anchors an agreement carrying it, and refuses one whose edges do not encode", () => {
        const signed: Agreement = { ...bare, follows: [P1] };
        expect(anchorAgreement(signed, computeCheckoutHash(signed))).not.toBeNull();
        expect(anchorAgreement({ ...signed, follows: [P2] }, computeCheckoutHash(signed))).toBeNull();
        expect(anchorAgreement({ ...signed, follows: ["0x12"] }, computeCheckoutHash(signed))).toBeNull();
    });
});

describe("no clause proof opens the topology leaf", () => {
    const signed: Agreement = { ...bare, follows: [P1] };
    const root = computeCheckoutHash(signed);

    it("has no clause key to build a clause inclusion proof for", () => {
        expect(() => buildSignedClauseInclusionProof(signed, TOPOLOGY_LEAF_DOMAIN)).toThrow(/Clause not found/);
    });

    it("does not open under the leaf shape the coordinator and the counter rebuild", () => {
        const { leaf, proof } = buildLeafInclusionProof(agreementLeaves(signed), computeTopologyLeaf([P1]));
        expect(verifyInclusionProof(root, leaf, proof)).toBe(true);
        // `AttestationCoordinator` and `UsageCounter` rebuild a leaf as
        // keccak256(keccak256(clauseId ‖ clauseDataHash)): no clauseId given
        // the leaf's own fingerprint reaches the leaf the root holds.
        for (const clauseId of [TOPOLOGY_LEAF_DOMAIN, K("a registered clause key")]) {
            const rebuilt = keccak256(keccak256(concat([clauseId, topologyContentRef([P1])])));
            expect(verifyInclusionProof(root, rebuilt, proof)).toBe(false);
        }
    });
});
