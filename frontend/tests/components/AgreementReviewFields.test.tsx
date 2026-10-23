/**
 * AgreementReview — the one shared confirm gate shows EVERY field of the
 * signed struct, and shows a token figure only once the token's `decimals()`
 * is read.
 *
 *   - the process (a new process for a root order, the process id for a
 *     sub-order), the cumulative value, this order's buyer bond (twice the
 *     payment) and seller bond (twice the cumulative value), and the salt sit
 *     beside the parties, the payment and the deadline the modal already
 *     showed — the /sign page and the /orders card showed the bond and the
 *     process; the gate every path shares shows them too;
 *   - while the decimals read is pending the raw integer stands alone, never
 *     a magnitude formatted on an 18 default: for a 6-decimal token that
 *     default would show the signed payment a trillion times too small.
 */
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { calculateBonds, ZERO_BYTES32, type Commitment } from "@figaro-protocol/sdk";

const decimalsState = vi.hoisted(() => ({ decimals: 18, ready: false, loading: true }));
vi.mock("@/hooks/useTokenDecimals", () => ({
    default: () => decimalsState,
}));

import { AgreementReview } from "@/components/runtime/AgreementReview";

const PAYMENT = 1_500_000n; // 1.5 of a 6-decimal token
const commitment: Commitment = {
    processId: ZERO_BYTES32,
    buyer: "0x1111111111111111111111111111111111111111",
    seller: "0x2222222222222222222222222222222222222222",
    currency: "0x3333333333333333333333333333333333333333",
    payment: PAYMENT,
    expectedCumulativeValue: PAYMENT,
    checkoutHash: `0x${"ab".repeat(32)}`,
    salt: 42n,
    deadline: 1_900_000_000n,
};

afterEach(() => {
    cleanup();
    decimalsState.decimals = 18;
    decimalsState.ready = false;
    decimalsState.loading = true;
});

describe("AgreementReview shows every signed field", () => {
    it("names a root order's new process, the cumulative value, both bonds and the salt", () => {
        render(<AgreementReview commitment={commitment} agreement={null} />);
        expect(screen.getByTestId("preview-process").textContent).toMatch(/new process/);
        const bonds = calculateBonds(commitment.expectedCumulativeValue, commitment.payment);
        expect(screen.getByTestId("preview-cumulative").textContent).toContain(`raw: ${PAYMENT.toString()}`);
        expect(screen.getByTestId("preview-buyer-bond").textContent).toContain(`raw: ${bonds.buyerBond.toString()}`);
        expect(screen.getByTestId("preview-seller-bond").textContent).toContain(`raw: ${bonds.sellerBond.toString()}`);
        expect(screen.getByTestId("agreement-review").textContent).toContain("42");
    });

    it("names a sub-order's process by its id", () => {
        const sub = { ...commitment, processId: `0x${"cd".repeat(32)}` as const, expectedCumulativeValue: 4_000_000n };
        render(<AgreementReview commitment={sub} agreement={null} />);
        expect(screen.getByTestId("preview-process").textContent).toContain(`0x${"cd".repeat(32)}`);
        expect(screen.getByTestId("preview-seller-bond").textContent).toContain(`raw: ${(8_000_000n).toString()}`);
    });
});

describe("AgreementReview shows a token figure only once the decimals are read", () => {
    it("shows the raw integer alone while the read is pending — no magnitude on an 18 default", () => {
        render(<AgreementReview commitment={commitment} agreement={null} />);
        const payment = screen.getByTestId("preview-payment").textContent ?? "";
        expect(payment).toContain("token decimals loading");
        expect(payment).toContain(`raw: ${PAYMENT.toString()}`);
        // The 18-default rendering of a 6-decimal amount never appears.
        expect(payment).not.toMatch(/0\.0000000000015/);
    });

    it("formats with the token's own decimals once read", () => {
        decimalsState.decimals = 6;
        decimalsState.ready = true;
        decimalsState.loading = false;
        render(<AgreementReview commitment={commitment} agreement={null} />);
        const payment = screen.getByTestId("preview-payment").textContent ?? "";
        expect(payment).toMatch(/1\.5/);
        expect(payment).not.toContain("token decimals loading");
    });
});
