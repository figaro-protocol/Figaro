/**
 * What the party sees in the checkout's signing modal before the wallet opens:
 * the token, the payment and the bond, from the real AgreementReview inside the
 * real modal. The seller's bond is twice the running total; the buyer's is
 * twice the payment.
 */
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ZERO_BYTES32, type Commitment } from "@figaro-protocol/sdk";

vi.mock("wagmi", () => ({ useConnection: () => ({ chainId: 31337 }), useChainId: () => 31337 }));
vi.mock("@/components/ui/ModalChrome", () => ({
    ModalChrome: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("@/hooks/useTokenDecimals", () => ({ default: () => ({ decimals: 6, ready: true, loading: false }) }));

import { AgreementPreviewModal } from "@/components/runtime/AgreementPreviewModal";

const commitment: Commitment = {
    processId: `0x${"cd".repeat(32)}`,
    buyer: "0x1111111111111111111111111111111111111111",
    seller: "0x2222222222222222222222222222222222222222",
    currency: "0x3333333333333333333333333333333333333333",
    payment: 1_000_000n,
    expectedCumulativeValue: 4_000_000n, // earlier orders added 3 before this one
    checkoutHash: `0x${"ab".repeat(32)}`,
    salt: 7n,
    deadline: 1_900_000_000n,
};

describe("the signing modal shows the token, the payment and the bonds", () => {
    it("shows each before the wallet opens", () => {
        expect(commitment.processId).not.toBe(ZERO_BYTES32);
        render(<AgreementPreviewModal commitment={commitment} agreement={null} intent="sign" onConfirm={() => {}} onCancel={() => {}} />);
        expect(screen.getByTestId("preview-token").textContent).toBe(commitment.currency);
        expect(screen.getByTestId("preview-payment").textContent).toContain("1");
        expect(screen.getByTestId("preview-payment").textContent).toContain("raw: 1000000");
        // buyer bond: twice the payment; seller bond: twice the running total
        expect(screen.getByTestId("preview-buyer-bond").textContent).toMatch(/^2 .*raw: 2000000/);
        expect(screen.getByTestId("preview-seller-bond").textContent).toMatch(/^8 .*raw: 8000000/);
    });
});
