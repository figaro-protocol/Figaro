/**
 * YourTurnCard — the `/orders` card for a relayed order whose next act is
 * this wallet's. `act="accept"`: an order awaiting this wallet's
 * counter-signature, as the seller of a buyer's order or as the buyer of a
 * seller-initiated one. Accepting opens the accept flow, whose first act is
 * the terms confirm; the acting party's OWN bond allowance is approved only
 * after that confirm, inside the flow, so a party who reads the terms and
 * declines has sent no transaction and left no allowance behind. The card
 * hands the flow the approval step (`beforeBroadcast`); clicking Accept
 * approves nothing. The bond is the party's: a seller locks 2 × cumulative
 * value, a buyer 2 × payment. `act="submit"`: a fully signed order relayed
 * back for the seller's broadcast — the same step, run after the commit
 * confirm; clicking Submit approves nothing.
 */
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { calculateBonds } from "@figaro-protocol/sdk";
import type { CommitmentPayload } from "@figaro-protocol/sdk/agent";

const SELLER = "0x00000000000000000000000000000000000000a1";
const BUYER = "0x00000000000000000000000000000000000000b1";

const approval = vi.hoisted(() => ({
    covered: false,
    approve: (() => {}) as (amount: bigint) => void,
}));
const wallet = vi.hoisted(() => ({ address: "0x00000000000000000000000000000000000000a1" }));

vi.mock("wagmi", async (importOriginal) => {
    const actual = await importOriginal<typeof import("wagmi")>();
    return { ...actual, useAccount: () => ({ address: wallet.address }) };
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

import { YourTurnCard } from "@/app/(app)/orders/_components/OrdersList";

const PAYMENT = 25_000_000n;
const CUMULATIVE = 40_000_000n; // a sub-order: the seller bond is 2 × cumulative, the buyer bond 2 × payment

const PAYLOAD = {
    commitment: {
        processId: `0x${"11".repeat(32)}`,
        buyer: BUYER,
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

function renderCard(onAccept = vi.fn(), payload: CommitmentPayload = PAYLOAD) {
    render(<YourTurnCard act="accept" payload={payload} onAct={onAccept} onDismiss={() => {}} isActing={false} listings={[]} />);
    return onAccept;
}

describe("YourTurnCard accept — the seller's bond is approved after the terms confirm", () => {
    beforeEach(() => {
        wallet.address = SELLER;
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
        expect(screen.getByText("Your seller bond:")).toBeTruthy();
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

describe("YourTurnCard accept as the buyer — a seller-initiated order pulls the buyer's own bond", () => {
    // The seller originated and signed; the buyer counter-signs. The Core
    // pulls 2 × payment from the buyer, never 2 × cumulative value.
    const SELLER_INITIATED = { ...PAYLOAD, buyerSig: undefined, sellerSig: "0x123456" } as unknown as CommitmentPayload;
    beforeEach(() => {
        wallet.address = BUYER;
        approval.covered = false;
        approval.approve = vi.fn();
    });

    it("names the bond as the buyer's and approves 2 × payment with the 10× buffer", () => {
        const onAccept = renderCard(vi.fn(), SELLER_INITIATED);
        expect(screen.getByText("Your buyer bond:")).toBeTruthy();
        expect(screen.queryByText("Your seller bond:")).toBeNull();
        fireEvent.click(screen.getByTestId("btn-accept-order"));
        const beforeBroadcast = onAccept.mock.calls[0][0] as () => Promise<void>;
        void beforeBroadcast();
        const { buyerBond, sellerBond } = calculateBonds(CUMULATIVE, PAYMENT);
        expect(buyerBond).not.toBe(sellerBond);
        expect(approval.approve).toHaveBeenCalledWith(buyerBond * 10n);
    });
});

describe("YourTurnCard submit — the seller's bond is approved after the commit confirm", () => {
    const SIGNED = { ...PAYLOAD, sellerSig: "0x123456" } as unknown as CommitmentPayload;
    function renderReady(onSubmit = vi.fn()) {
        render(<YourTurnCard act="submit" payload={SIGNED} onAct={onSubmit} onDismiss={() => {}} isActing={false} listings={[]} />);
        return onSubmit;
    }
    beforeEach(() => {
        wallet.address = SELLER;
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
