/**
 * SignedUnsentRow — the `/orders` row for a commitment this wallet signed but
 * has not relayed. Either party may sign first, so the row names the other
 * party on the commitment, read from the connected wallet's side.
 */
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { CommitmentPayload } from "@figaro-protocol/sdk/agent";
import type { Listing } from "@/lib/member/memberListing";
import type { SignedUnsentOrder } from "@/lib/checkout/signedUnsentOrders";

vi.mock("@/hooks/useTokenDecimals", () => ({
    default: () => ({ decimals: 6, ready: true, loading: false }),
}));

import { SignedUnsentRow } from "@/app/(app)/orders/_components/OrdersList";

const PAYLOAD = {
    commitment: {
        processId: `0x${"11".repeat(32)}`,
        buyer: "0x00000000000000000000000000000000000000b1",
        seller: "0x00000000000000000000000000000000000000a1",
        currency: "0x00000000000000000000000000000000000000c1",
        payment: 25_000_000n,
        expectedCumulativeValue: 25_000_000n,
        agreementHash: `0x${"22".repeat(32)}`,
        salt: 7n,
        deadline: 1_893_456_000n,
    },
    agreement: { sections: [] },
    buyerSig: "0xabcdef",
} as unknown as CommitmentPayload;

const LISTINGS = [
    { address: PAYLOAD.commitment.buyer, name: "Buyer B1" },
    { address: PAYLOAD.commitment.seller, name: "Seller A1" },
] as unknown as ReadonlyArray<Listing>;

function renderRow(entry: SignedUnsentOrder, address: string | undefined) {
    render(
        <SignedUnsentRow
            entry={entry}
            address={address}
            listings={LISTINGS}
            onSend={() => {}}
            onDiscard={() => {}}
            sending={false}
            error={null}
        />,
    );
}

describe("SignedUnsentRow", () => {
    it("names the seller when the connected wallet is the buyer", () => {
        renderRow({ orderId: "o1", payload: PAYLOAD }, PAYLOAD.commitment.buyer);
        const row = screen.getByTestId("order-unsent-row").textContent ?? "";
        expect(row).toContain("You signed this order; Seller A1 has not received it.");
        expect(row).not.toContain("Buyer B1");
    });

    it("names the buyer when the connected wallet is the seller that signed first", () => {
        const sellerFirst = { ...PAYLOAD, buyerSig: undefined, sellerSig: "0xabcdef" } as unknown as CommitmentPayload;
        renderRow({ orderId: "o2", payload: sellerFirst }, PAYLOAD.commitment.seller.toUpperCase().replace("0X", "0x"));
        const row = screen.getByTestId("order-unsent-row").textContent ?? "";
        expect(row).toContain("You signed this order; Buyer B1 has not received it.");
        expect(row).not.toContain("Seller A1");
    });
});
