/**
 * AwaitingAcceptanceRow — the `/orders` row for a commitment this wallet
 * signed and relayed, awaiting the counterparty's signature. What the row owes
 * the wallet that signed it: nothing has moved (bonds lock in the Core only at
 * commit, and there is no commit before the counter-signature), and the
 * commitment's own deadline — rendered from the commitment's field, in chain
 * time (unix seconds), never the device clock.
 */
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { CommitmentPayload } from "@figaro-protocol/sdk/agent";
import { formatBlockTimestamp } from "@/lib/shared/formatTimestamp";
import type { Listing } from "@/lib/member/memberListing";

vi.mock("@/hooks/useTokenDecimals", () => ({
    default: () => ({ decimals: 6, ready: true, loading: false }),
}));

import { AwaitingAcceptanceRow } from "@/app/(app)/orders/_components/OrdersList";

const DEADLINE = 1_893_456_000n; // unix seconds

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
        deadline: DEADLINE,
    },
    agreement: { sections: [] },
    buyerSig: "0xabcdef",
} as unknown as CommitmentPayload;

const LISTINGS = [
    { address: PAYLOAD.commitment.buyer, name: "Buyer B1" },
    { address: PAYLOAD.commitment.seller, name: "Seller A1" },
] as unknown as ReadonlyArray<Listing>;

describe("AwaitingAcceptanceRow", () => {
    it("says nothing has moved: no bond is locked until the order is committed", () => {
        render(<AwaitingAcceptanceRow payload={PAYLOAD} address={PAYLOAD.commitment.buyer} listings={[]} onDismiss={() => {}} />);
        const line = screen.getByTestId("order-pending-no-bond").textContent ?? "";
        expect(line).toContain("Nothing has moved");
        expect(line).toContain("no bond is locked until the order is committed.");
    });

    it("renders the commitment's deadline from its field, as chain time", () => {
        render(<AwaitingAcceptanceRow payload={PAYLOAD} address={PAYLOAD.commitment.buyer} listings={[]} onDismiss={() => {}} />);
        const line = screen.getByTestId("order-pending-deadline").textContent ?? "";
        expect(line).toBe(`After its deadline, ${formatBlockTimestamp(DEADLINE)}, it can no longer be committed.`);
        expect(line).toContain(new Date(Number(DEADLINE) * 1000).toLocaleString());
    });

    it("names the seller when the connected wallet is the buyer", () => {
        render(<AwaitingAcceptanceRow payload={PAYLOAD} address={PAYLOAD.commitment.buyer} listings={LISTINGS} onDismiss={() => {}} />);
        const line = screen.getByTestId("order-pending-no-bond").textContent ?? "";
        expect(line).toContain("Waiting for Seller A1 to counter-sign.");
        expect(screen.queryByText(/Buyer B1/)).toBeNull();
    });

    it("names the buyer when the connected wallet is the seller that signed first", () => {
        const sellerFirst = { ...PAYLOAD, buyerSig: undefined, sellerSig: "0xabcdef" } as unknown as CommitmentPayload;
        // the connected address may carry a checksum case the commitment does not
        render(<AwaitingAcceptanceRow payload={sellerFirst} address={PAYLOAD.commitment.seller.toUpperCase().replace("0X", "0x")} listings={LISTINGS} onDismiss={() => {}} />);
        const line = screen.getByTestId("order-pending-no-bond").textContent ?? "";
        expect(line).toContain("Waiting for Buyer B1 to counter-sign.");
        expect(screen.queryByText(/Seller A1/)).toBeNull();
    });
});
