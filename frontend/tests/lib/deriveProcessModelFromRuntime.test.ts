import { describe, it, expect } from "vitest";
import type { Agreement } from "@figaro-protocol/sdk";
import { computeClauseKey } from "@figaro-protocol/sdk";
import { deriveProcessModelFromRuntime } from "@/lib/semantic/deriveProcessModelFromRuntime";
import { OrderState, type Order } from "@/lib/kernel/store";
import type { ProcessSummary } from "@/lib/kernel/walletProcessQueries";
import type { RuntimeAttestation } from "@/lib/composition/indexer";
import type { CapabilityModel } from "@/lib/semantic/models";

// One re-assert card per party per order. The sections are built from the
// derivation's own input types — clause ids no spec source has loaded, so
// nothing here names a clause: a never-seen section is re-assertable.
const BUYER = "0x1111111111111111111111111111111111111111";
const SELLER = "0x2222222222222222222222222222222222222222";
const PROCESS = `0x${"ab".repeat(32)}`;
const ORDER_HASH = `0x${"cd".repeat(32)}`;
const AGREEMENT_HASH = `0x${"ef".repeat(32)}`;
const K = 3;

const sections = Array.from({ length: K }, (_v, i) => ({
    clause: `never-seen-section-${i}`,
    version: 1,
    data: { note: `committed ${i}` },
}));

const agreement: Agreement = {
    version: "a1",
    buyer: BUYER,
    seller: SELLER,
    sections,
};

const order: Order = {
    orderHash: ORDER_HASH,
    processId: PROCESS,
    buyer: BUYER,
    seller: SELLER,
    currency: `0x${"33".repeat(20)}`,
    cumulativeValue: 3n,
    payment: 3n,
    state: OrderState.Active,
    sellerBond: 6n,
    buyerBond: 6n,
    salt: 1n,
    deadline: 0n,
    agreementHash: AGREEMENT_HASH,
};

const summary: ProcessSummary = {
    processId: PROCESS,
    orderCount: 1,
    hasActive: true,
    createdAt: 0,
    orders: [],
};

const reasserted = (sectionIndex: number, attester: string): RuntimeAttestation => ({
    clauseId: computeClauseKey(sections[sectionIndex].clause, sections[sectionIndex].version),
    orderHash: ORDER_HASH,
    stage: 0,
    attester,
    blockNumber: 1,
});

const reassertCards = (address: string, attestations: RuntimeAttestation[] = []): CapabilityModel[] => {
    const model = deriveProcessModelFromRuntime(
        summary,
        [order],
        new Map([[AGREEMENT_HASH, agreement]]),
        address,
        undefined,
        attestations,
    );
    return model.orders.flatMap((o) => o.capabilities).filter((c) => c.actionKind === "reassert-committed-sections");
};

const choicesOf = (card: CapabilityModel): CapabilityModel[] => {
    if (card.action.executionType !== "choice") throw new Error("not a choice card");
    return card.action.choices;
};

const choiceClauseIds = (card: CapabilityModel): string[] =>
    choicesOf(card).map((c) => (c.action.executionType === "transaction" && c.action.kind === "submit-clause-attestation" ? c.action.clauseId : ""));

describe("re-assert committed sections — one card per party per order", () => {
    for (const [party, address] of [["seller", SELLER], ["buyer", BUYER]] as const) {
        it(`${party}: K committed sections, none re-asserted → one card, N = K, K choices`, () => {
            const cards = reassertCards(address);
            expect(cards).toHaveLength(1);
            expect(cards[0].label).toBe(`Re-assert committed sections (${K})`);
            expect(choicesOf(cards[0])).toHaveLength(K);
            expect(choiceClauseIds(cards[0])).toEqual(sections.map((s) => s.clause));
            for (const choice of choicesOf(cards[0])) {
                // Each choice is exactly the single-section re-assert action.
                expect(choice.actionKind).toBe("reassert-committed-section");
                expect(choice.action).toMatchObject({
                    executionType: "transaction",
                    kind: "submit-clause-attestation",
                    orderHash: ORDER_HASH,
                    stage: 0,
                    party,
                    reasserts: true,
                });
            }
        });

        it(`${party}: one section re-asserted → N = K-1 and that section absent`, () => {
            const cards = reassertCards(address, [reasserted(1, address)]);
            expect(cards).toHaveLength(1);
            expect(cards[0].label).toBe(`Re-assert committed sections (${K - 1})`);
            expect(choiceClauseIds(cards[0])).toEqual([sections[0].clause, sections[2].clause]);
        });

        it(`${party}: every section re-asserted → no card`, () => {
            const cards = reassertCards(address, sections.map((_s, i) => reasserted(i, address)));
            expect(cards).toHaveLength(0);
        });
    }

    it("the other party's re-assertion leaves this party's count whole", () => {
        const cards = reassertCards(BUYER, sections.map((_s, i) => reasserted(i, SELLER)));
        expect(cards).toHaveLength(1);
        expect(choicesOf(cards[0])).toHaveLength(K);
    });

    it("a wallet that is neither party gets no card", () => {
        expect(reassertCards("0x3333333333333333333333333333333333333333")).toHaveLength(0);
    });
});
