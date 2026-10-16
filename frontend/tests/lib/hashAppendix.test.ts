/**
 * hashAppendix.test.ts — the appendix lists every leaf under the agreement
 * root, so a reader rebuilds the root from the listed leaves alone: the
 * clauses and, when the agreement names its provenance (its
 * registered agreement and its assembly's composition root), the agreement
 * format's provenance leaf.
 */
import { describe, expect, it } from "vitest";
import { agreementLeaves, computeAgreementHash, computeProvenanceLeaf, type Agreement } from "@figaro-protocol/sdk";
import { buildHashAppendix } from "@/lib/audit/hashAppendix";
import { OrderState, type Order } from "@/lib/kernel/store";

const BUYER = "0x1111111111111111111111111111111111111111";
const SELLER = "0x2222222222222222222222222222222222222222";
const COMPOSITION = `0x${"9a".repeat(32)}` as `0x${string}`;
const AGREEMENT_KEY = `0x${"8b".repeat(32)}` as `0x${string}`;

function orderFor(agreement: Agreement): Order {
    return {
        orderHash: `0x${"cd".repeat(32)}`, processId: `0x${"ab".repeat(32)}`,
        buyer: BUYER, seller: SELLER, currency: `0x${"33".repeat(20)}`,
        cumulativeValue: 1n, payment: 1n, state: OrderState.Active,
        sellerBond: 2n, buyerBond: 2n, salt: 1n, deadline: 0n,
        agreementHash: computeAgreementHash(agreement),
    };
}

const base: Agreement = {
    version: "a1", buyer: BUYER, seller: SELLER,
    sections: [
        { clause: `0x${"0a".repeat(32)}`, data: { note: "a" } },
        { clause: `0x${"0b".repeat(32)}`, data: { note: "b" } },
    ],
};

const leavesOf = (agreement: Agreement) =>
    buildHashAppendix(orderFor(agreement), agreement, []).anchors
        .filter((a) => a.kind === "agreement-clause-leaf" || a.kind === "agreement-provenance-leaf");

describe("buildHashAppendix — every leaf under the root", () => {
    it("lists the provenance leaf beside the clauses — the listed leaves are the tree's leaves", () => {
        const agreement: Agreement = { ...base, provenance: { agreementKey: AGREEMENT_KEY, compositionHash: COMPOSITION } };
        const leaves = leavesOf(agreement);
        expect(leaves.filter((a) => a.kind === "agreement-provenance-leaf").map((a) => a.hash))
            .toEqual([computeProvenanceLeaf(AGREEMENT_KEY, COMPOSITION)]);
        const sorted = leaves.map((a) => a.hash.toLowerCase()).sort();
        expect(sorted).toEqual(agreementLeaves(agreement).map((l) => l.toLowerCase()).sort());
    });

    it("lists no provenance leaf for an agreement that names no assembly", () => {
        expect(leavesOf(base).some((a) => a.kind === "agreement-provenance-leaf")).toBe(false);
    });
});
