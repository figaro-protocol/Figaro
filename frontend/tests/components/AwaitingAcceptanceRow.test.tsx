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

describe("AwaitingAcceptanceRow", () => {
    it("says nothing has moved: no bond is locked until the order is committed", () => {
        render(<AwaitingAcceptanceRow payload={PAYLOAD} listings={[]} onDismiss={() => {}} />);
        const line = screen.getByTestId("order-pending-no-bond").textContent ?? "";
        expect(line).toContain("Nothing has moved");
        expect(line).toContain("no bond is locked until the order is committed.");
    });

    it("renders the commitment's deadline from its field, as chain time", () => {
        render(<AwaitingAcceptanceRow payload={PAYLOAD} listings={[]} onDismiss={() => {}} />);
        const line = screen.getByTestId("order-pending-deadline").textContent ?? "";
        expect(line).toBe(`After its deadline, ${formatBlockTimestamp(DEADLINE)}, it can no longer be committed.`);
        expect(line).toContain(new Date(Number(DEADLINE) * 1000).toLocaleString());
    });
});
