/**
 * The signing modal's swap section: it SHOWS the leg the party is about to
 * witness-sign — the max input, the slippage margin that built it, and the
 * party's balance of the input token against it — and lets nothing be edited
 * there. The margin is set in the funding-token chooser before the quote, so
 * the figures shown are exactly the ones signed. The coordinator pulls the
 * whole max input from the party (`WitnessSwapAndCommitCoordinator.sol`,
 * `_fund`), so a balance below it is named.
 */
import React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import type { NetworkRead } from "@/lib/shared/networkRead";

vi.mock("wagmi", () => ({ useConnection: () => ({ chainId: 31337 }), useChainId: () => 31337 }));
vi.mock("@/components/runtime/AgreementReview", () => ({ AgreementReview: () => <div data-testid="review-stub" /> }));
vi.mock("@/components/ui/ModalChrome", () => ({
    ModalChrome: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
const balance = vi.hoisted(() => ({ read: { status: "pending" } as NetworkRead<bigint>, args: [] as unknown[] }));
vi.mock("@/hooks/useTokenBalance", () => ({
    default: (...args: unknown[]) => { balance.args = args; return { read: balance.read, refetch: () => {} }; },
}));

import { AgreementPreviewModal } from "@/components/runtime/AgreementPreviewModal";

const PARTY = `0x${"0a".repeat(20)}` as const;
const INPUT = `0x${"11".repeat(20)}` as const;
const SWAP = { inputToken: INPUT, currency: `0x${"22".repeat(20)}`, maxInput: 1_025n, slippageBps: 250, party: PARTY };
const modal = (swap: typeof SWAP | null = SWAP) => (
    <AgreementPreviewModal commitment={{} as never} agreement={null} intent="sign" swap={swap} onConfirm={() => {}} onCancel={() => {}} />
);

describe("AgreementPreviewModal — the swap-funded leg, shown read-only", () => {
    beforeEach(() => { balance.read = { status: "present", value: 5_000n }; balance.args = []; });

    it("shows the max input and the margin that built it, with no field to change either", () => {
        render(modal());
        expect(screen.getByTestId("preview-swap-max-input")).toHaveTextContent("1025");
        expect(screen.getByTestId("preview-swap-margin")).toHaveTextContent("2.5%");
        expect(screen.queryByRole("spinbutton")).toBeNull();
        expect(screen.queryByRole("textbox")).toBeNull();
    });

    it("reads the signing party's balance of the input token and shows it beside the max input", () => {
        render(modal());
        expect(balance.args).toEqual([INPUT, PARTY]);
        expect(screen.getByTestId("preview-swap-balance")).toHaveTextContent("5000");
        expect(screen.queryByTestId("preview-swap-balance-short")).toBeNull();
    });

    it("names a balance below the max input", () => {
        balance.read = { status: "present", value: 1_024n };
        render(modal());
        expect(screen.getByTestId("preview-swap-balance-short")).toHaveTextContent(
            "Your balance is below the max input, so this commit will fail.",
        );
    });

    it("shows no balance row while the read is in flight or failed", () => {
        balance.read = { status: "pending" };
        const { unmount } = render(modal());
        expect(screen.queryByTestId("preview-swap-balance")).toBeNull();
        unmount();
        balance.read = { status: "absent" };
        render(modal());
        expect(screen.queryByTestId("preview-swap-balance")).toBeNull();
    });

    it("renders no swap section when the bond is not swap-funded", () => {
        render(modal(null));
        expect(screen.queryByTestId("preview-swap")).toBeNull();
    });
});
