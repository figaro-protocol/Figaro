import { describe, it, expect } from "vitest";
import type { Agreement } from "@figaro-protocol/sdk";
import { computeClauseKey } from "@figaro-protocol/sdk";
import { deriveProcessModelFromRuntime } from "@/lib/semantic/deriveProcessModelFromRuntime";
import { OrderState, type Order } from "@/lib/kernel/store";
import type { ProcessSummary } from "@/lib/kernel/walletProcessQueries";
import type { RuntimeAttestation } from "@/lib/composition/indexer";
import type { CapabilityModel } from "@/lib/semantic/models";
import { truncateHex } from "@/lib/shared/formatHex";

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

    // AttestationCoordinator emits msg.sender as the attester: an attester the
    // seller authorizes (attestViaResolver) is neither party's address, and
    // the only path that lets it attest on this order is the seller's own.
    it("a seller-authorized attester's re-assertion counts for the seller, not the buyer", () => {
        const AUTHORIZED = "0x4444444444444444444444444444444444444444";
        const sellerCards = reassertCards(SELLER, [reasserted(1, AUTHORIZED)]);
        expect(sellerCards).toHaveLength(1);
        expect(choiceClauseIds(sellerCards[0])).toEqual([sections[0].clause, sections[2].clause]);
        const buyerCards = reassertCards(BUYER, [reasserted(1, AUTHORIZED)]);
        expect(buyerCards).toHaveLength(1);
        expect(choicesOf(buyerCards[0])).toHaveLength(K);
    });

    it("a one-order process names its order on the card", () => {
        const [card] = reassertCards(BUYER);
        expect(card.orderLabel).toBe(`Order 1 of 1 · seller ${truncateHex(SELLER)}`);
    });
});

// A buyer is a party to every order of its process, so it holds one card per
// order; each card names its order (position on the chain, seller).
describe("re-assert committed sections — several orders in one process", () => {
    const SELLER_B = "0x5555555555555555555555555555555555555555" as const;
    const ORDER_B = `0x${"0b".repeat(32)}`;
    const AGREEMENT_B = `0x${"0e".repeat(32)}`;
    // Committed second: the Core accepts it at the running cumulative value
    // plus its payment, so its cumulative value is the larger.
    const orderB: Order = {
        ...order,
        orderHash: ORDER_B,
        seller: SELLER_B,
        cumulativeValue: 5n,
        payment: 2n,
        sellerBond: 10n,
        buyerBond: 4n,
        agreementHash: AGREEMENT_B,
    };
    const agreements = new Map<string, Agreement>([
        [AGREEMENT_HASH, agreement],
        [AGREEMENT_B, { ...agreement, seller: SELLER_B }],
    ]);
    const cardsFor = (address: string, attestations: RuntimeAttestation[] = []): CapabilityModel[] =>
        // orderB first in the input: the position comes from the chain, not the array.
        deriveProcessModelFromRuntime(summary, [orderB, order], agreements, address, undefined, attestations)
            .orders.flatMap((o) => o.capabilities)
            .filter((c) => c.actionKind === "reassert-committed-sections");

    it("two orders → two buyer cards whose sub-lines differ and name each order's seller", () => {
        const cards = cardsFor(BUYER);
        expect(cards).toHaveLength(2);
        const byOrder = new Map(cards.map((c) => [c.scopeId, c.orderLabel]));
        expect(byOrder.get(ORDER_HASH)).toBe(`Order 1 of 2 · seller ${truncateHex(SELLER)}`);
        expect(byOrder.get(ORDER_B)).toBe(`Order 2 of 2 · seller ${truncateHex(SELLER_B)}`);
    });

    it("a co-seller's cross-order attestation stands for its own order, not this order's seller", () => {
        // attestAsSeller lets SELLER_B attest on order A (same process).
        const crossOrder = reasserted(1, SELLER_B);
        const [sellerCard] = cardsFor(SELLER, [crossOrder]);
        expect(choicesOf(sellerCard)).toHaveLength(K);
    });
});
