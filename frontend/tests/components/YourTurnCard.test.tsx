/**
 * YourTurnCard — the `/orders` card for a relayed order awaiting this wallet's
 * counter-signature. Accepting opens the accept flow, whose first act is the
 * terms confirm; the seller's bond allowance is approved only after that
 * confirm, inside the flow, so a seller who reads the terms and declines has
 * sent no transaction and left no allowance behind. The card hands the flow
 * the approval step (`beforeBroadcast`); clicking Accept approves nothing.
 * ReadyToSubmitCard — a fully signed order relayed back for this wallet's
 * broadcast — hands the commit flow the same step, run after the commit
 * confirm; clicking Submit approves nothing.
 */
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { calculateBonds } from "@figaro-protocol/sdk";
import type { CommitmentPayload } from "@figaro-protocol/sdk/agent";

const SELLER = "0x00000000000000000000000000000000000000a1";

const approval = vi.hoisted(() => ({
    covered: false,
    approve: (() => {}) as (amount: bigint) => void,
}));

vi.mock("wagmi", async (importOriginal) => {
    const actual = await importOriginal<typeof import("wagmi")>();
    return { ...actual, useAccount: () => ({ address: SELLER }) };
});
vi.mock("@/hooks/useTokenDecimals", () => ({
    default: () => ({ decimals: 6, ready: true, loading: false }),
}));
vi.mock("@/hooks/useTokenApproval", () => ({
    default: () => ({
        needsApproval: () => !approval.covered,
        approve: (amount: bigint) => approval.approve(amount),
        isApprovePending: false,
        isApproveConfirming: false,
        isApproveSuccess: false,
        isApproveError: false,
    }),
}));

import { ReadyToSubmitCard, YourTurnCard } from "@/app/(app)/orders/_components/OrdersList";

const PAYMENT = 25_000_000n;
const CUMULATIVE = 40_000_000n; // a sub-order: the seller bond is 2 × cumulative, not 2 × payment

const PAYLOAD = {
    commitment: {
        processId: `0x${"11".repeat(32)}`,
        buyer: "0x00000000000000000000000000000000000000b1",
        seller: SELLER,
        currency: "0x00000000000000000000000000000000000000c1",
        payment: PAYMENT,
        expectedCumulativeValue: CUMULATIVE,
        checkoutHash: `0x${"22".repeat(32)}`,
        salt: 7n,
        deadline: 1_893_456_000n,
    },
    agreement: { clauses: [] },
    buyerSig: "0xabcdef",
} as unknown as CommitmentPayload;

function renderCard(onAccept = vi.fn()) {
    render(<YourTurnCard payload={PAYLOAD} onAccept={onAccept} onDismiss={() => {}} isAccepting={false} listings={[]} />);
    return onAccept;
}

describe("YourTurnCard — the seller's bond is approved after the terms confirm", () => {
    beforeEach(() => {
        approval.covered = false;
        approval.approve = vi.fn();
    });

    it("clicking Accept opens the accept flow and approves nothing", () => {
        const onAccept = renderCard();
        fireEvent.click(screen.getByTestId("btn-accept-order"));
        expect(approval.approve).not.toHaveBeenCalled();
        expect(onAccept).toHaveBeenCalledTimes(1);
        expect(typeof onAccept.mock.calls[0][0]).toBe("function");
    });

    it("the step handed to the flow approves the seller bond, 2 × cumulative value, with the 10× buffer", () => {
        const onAccept = renderCard();
        fireEvent.click(screen.getByTestId("btn-accept-order"));
        const beforeBroadcast = onAccept.mock.calls[0][0] as () => Promise<void>;
        void beforeBroadcast();
        const { sellerBond } = calculateBonds(CUMULATIVE, PAYMENT);
        expect(approval.approve).toHaveBeenCalledWith(sellerBond * 10n);
    });

    it("an allowance that already covers the bond sends no approval, and the step resolves", async () => {
        approval.covered = true;
        const onAccept = renderCard();
        fireEvent.click(screen.getByTestId("btn-accept-order"));
        const beforeBroadcast = onAccept.mock.calls[0][0] as () => Promise<void>;
        await expect(beforeBroadcast()).resolves.toBeUndefined();
        expect(approval.approve).not.toHaveBeenCalled();
    });
});

describe("ReadyToSubmitCard — the seller's bond is approved after the commit confirm", () => {
    const SIGNED = { ...PAYLOAD, sellerSig: "0x123456" } as unknown as CommitmentPayload;
    function renderReady(onSubmit = vi.fn()) {
        render(<ReadyToSubmitCard payload={SIGNED} onSubmit={onSubmit} onDismiss={() => {}} isSubmitting={false} listings={[]} />);
        return onSubmit;
    }
    beforeEach(() => {
        approval.covered = false;
        approval.approve = vi.fn();
    });

    it("clicking Submit opens the commit flow and approves nothing", () => {
        const onSubmit = renderReady();
        fireEvent.click(screen.getByTestId("btn-submit-ready-order"));
        expect(approval.approve).not.toHaveBeenCalled();
        expect(onSubmit).toHaveBeenCalledTimes(1);
        expect(typeof onSubmit.mock.calls[0][0]).toBe("function");
    });

    it("the step handed to the flow approves the seller bond, 2 × cumulative value, with the 10× buffer", () => {
        const onSubmit = renderReady();
        fireEvent.click(screen.getByTestId("btn-submit-ready-order"));
        const beforeBroadcast = onSubmit.mock.calls[0][0] as () => Promise<void>;
        void beforeBroadcast();
        const { sellerBond } = calculateBonds(CUMULATIVE, PAYMENT);
        expect(approval.approve).toHaveBeenCalledWith(sellerBond * 10n);
    });

    it("an allowance that already covers the bond sends no approval, and the step resolves", async () => {
        approval.covered = true;
        const onSubmit = renderReady();
        fireEvent.click(screen.getByTestId("btn-submit-ready-order"));
        const beforeBroadcast = onSubmit.mock.calls[0][0] as () => Promise<void>;
        await expect(beforeBroadcast()).resolves.toBeUndefined();
        expect(approval.approve).not.toHaveBeenCalled();
    });
});
