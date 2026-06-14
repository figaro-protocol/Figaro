import { describe, expect, it } from "vitest";
import {
    awaitsMyCounterSign,
    awaitsCounterpartySignature,
} from "@/hooks/core/usePendingCommitments";
import type { CommitmentPayload } from "@/lib/core/useCommitmentFlow";

const BUYER = "0x1111111111111111111111111111111111111111";
const SELLER = "0x2222222222222222222222222222222222222222";
const OTHER = "0x3333333333333333333333333333333333333333";
const SIG = "0xabc" as `0x${string}`;

/** Minimal payload — the predicates read only party addresses + sig presence. */
function payload(parts: { buyerSig?: boolean; sellerSig?: boolean }): CommitmentPayload {
    return {
        commitment: { buyer: BUYER, seller: SELLER },
        buyerSig: parts.buyerSig ? SIG : undefined,
        sellerSig: parts.sellerSig ? SIG : undefined,
    } as unknown as CommitmentPayload;
}

describe("awaitsMyCounterSign — the OTHER party signed, I have not", () => {
    it("true: seller viewing a buyer-signed order (must counter-sign)", () => {
        expect(awaitsMyCounterSign(payload({ buyerSig: true }), SELLER)).toBe(true);
    });
    it("true: buyer viewing a seller-initiated order (must counter-sign)", () => {
        expect(awaitsMyCounterSign(payload({ sellerSig: true }), BUYER)).toBe(true);
    });
    it("false: I already signed (awaiting the counterparty, not me)", () => {
        expect(awaitsMyCounterSign(payload({ buyerSig: true }), BUYER)).toBe(false);
    });
    it("false: both signed", () => {
        expect(awaitsMyCounterSign(payload({ buyerSig: true, sellerSig: true }), SELLER)).toBe(false);
    });
    it("false: neither signed", () => {
        expect(awaitsMyCounterSign(payload({}), SELLER)).toBe(false);
    });
    it("false: I am not a party", () => {
        expect(awaitsMyCounterSign(payload({ buyerSig: true }), OTHER)).toBe(false);
    });
});

describe("awaitsCounterpartySignature — I signed, awaiting the other party", () => {
    it("true: buyer placed an order, awaiting the seller (the /orders outbox case)", () => {
        expect(awaitsCounterpartySignature(payload({ buyerSig: true }), BUYER)).toBe(true);
    });
    it("true: seller initiated an order, awaiting the buyer", () => {
        expect(awaitsCounterpartySignature(payload({ sellerSig: true }), SELLER)).toBe(true);
    });
    it("false: I am the buyer but I have not signed (it awaits me, not them)", () => {
        expect(awaitsCounterpartySignature(payload({ sellerSig: true }), BUYER)).toBe(false);
    });
    it("false: both signed", () => {
        expect(awaitsCounterpartySignature(payload({ buyerSig: true, sellerSig: true }), BUYER)).toBe(false);
    });
    it("false: neither signed", () => {
        expect(awaitsCounterpartySignature(payload({}), BUYER)).toBe(false);
    });
    it("false: I am not a party", () => {
        expect(awaitsCounterpartySignature(payload({ buyerSig: true }), OTHER)).toBe(false);
    });
});

describe("the two predicates are duals (no payload satisfies both for one wallet)", () => {
    const cases: Array<{ buyerSig?: boolean; sellerSig?: boolean }> = [
        { buyerSig: true },
        { sellerSig: true },
        { buyerSig: true, sellerSig: true },
        {},
    ];
    for (const wallet of [BUYER, SELLER, OTHER]) {
        for (const parts of cases) {
            it(`wallet ${wallet.slice(0, 6)} / sigs ${JSON.stringify(parts)}`, () => {
                const p = payload(parts);
                expect(awaitsMyCounterSign(p, wallet) && awaitsCounterpartySignature(p, wallet)).toBe(false);
            });
        }
    }
});

describe("address comparison is case-insensitive", () => {
    it("matches a checksummed/upper-cased wallet against the stored address", () => {
        expect(awaitsCounterpartySignature(payload({ buyerSig: true }), BUYER.toUpperCase())).toBe(true);
    });
});
