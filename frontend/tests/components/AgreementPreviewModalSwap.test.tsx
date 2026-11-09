/**
 * The signing modal's swap section: it SHOWS the leg the party is about to
 * witness-sign — the max input, the slippage margin that built it, and the
 * party's balance of the input token against it — and lets nothing be edited
 * there. The margin is set in the funding-token chooser before the quote, so
 * the figures shown are exactly the ones signed. The coordinator pulls the
 * whole max input from the party (`WitnessSwapAndCommitCoordinator.sol`,
 * `_fund`), so a balance below it is named. The max input and the balance are
 * shown in the FUNDING token's units, its own `decimals()` and `symbol()` read
 * from the chain, never the process token's and never as a raw integer.
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
// The chain's answers per token: the funding token has 6 decimals, the process
// token (`currency`) 18. Read with 18, 1_025_000_000 would show as 0.000000001025.
const token = vi.hoisted(() => ({
    decimals: {} as Record<string, number | undefined>,
    symbols: {} as Record<string, string | undefined>,
    decimalsArgs: [] as unknown[],
    symbolArgs: [] as unknown[],
}));
vi.mock("@/hooks/useTokenDecimals", () => ({
    default: (address?: string) => {
        token.decimalsArgs.push(address);
        const decimals = address ? token.decimals[address] : undefined;
        return { decimals, ready: decimals !== undefined, loading: false };
    },
}));
vi.mock("@/hooks/useTokenSymbol", () => ({
    useTokenSymbol: (address: string) => { token.symbolArgs.push(address); return { data: token.symbols[address] }; },
}));

import { AgreementPreviewModal } from "@/components/runtime/AgreementPreviewModal";

const PARTY = `0x${"0a".repeat(20)}` as const;
const INPUT = `0x${"11".repeat(20)}` as const;
const CURRENCY = `0x${"22".repeat(20)}` as const;
const SWAP = { inputToken: INPUT, currency: CURRENCY, maxInput: 1_025_000_000n, slippageBps: 250, party: PARTY };
const modal = (swap: typeof SWAP | null = SWAP) => (
    <AgreementPreviewModal commitment={{} as never} agreement={null} intent="sign" swap={swap} onConfirm={() => {}} onCancel={() => {}} />
);

describe("AgreementPreviewModal — the swap-funded leg, shown read-only", () => {
    beforeEach(() => {
        balance.read = { status: "present", value: 5_000_000_000n };
        balance.args = [];
        token.decimals = { [INPUT]: 6, [CURRENCY]: 18 };
        token.symbols = { [INPUT]: "USDC", [CURRENCY]: "DAI" };
        token.decimalsArgs = [];
        token.symbolArgs = [];
    });

    it("shows the max input in the funding token's units and symbol, and the margin that built it, with no field to change either", () => {
        render(modal());
        expect(screen.getByTestId("preview-swap-max-input")).toHaveTextContent(/^1025 USDC$/);
        expect(screen.getByTestId("preview-swap-margin")).toHaveTextContent("2.5%");
        expect(screen.queryByRole("spinbutton")).toBeNull();
        expect(screen.queryByRole("textbox")).toBeNull();
    });

    it("reads the units from the funding token, never the process token", () => {
        render(modal());
        expect(token.decimalsArgs.every((a) => a === INPUT)).toBe(true);
        expect(token.symbolArgs.every((a) => a === INPUT)).toBe(true);
        expect(token.decimalsArgs.length).toBeGreaterThan(0);
    });

    it("shows a fractional figure in the funding token's units", () => {
        render(modal({ ...SWAP, maxInput: 1_025_500_000n }));
        expect(screen.getByTestId("preview-swap-max-input")).toHaveTextContent(/^1025.5 USDC$/);
    });

    it("reads the signing party's balance of the input token and shows it beside the max input", () => {
        render(modal());
        expect(balance.args).toEqual([INPUT, PARTY]);
        expect(screen.getByTestId("preview-swap-balance")).toHaveTextContent(/^5000 USDC$/);
        expect(screen.queryByTestId("preview-swap-balance-short")).toBeNull();
    });

    it("names a balance below the max input", () => {
        balance.read = { status: "present", value: 1_024_999_999n };
        render(modal());
        expect(screen.getByTestId("preview-swap-balance-short")).toHaveTextContent(
            "Your balance is below the max input, so this commit will fail.",
        );
    });

    it("shows no max input or balance figure while the funding token's decimals are unread, never a raw integer", () => {
        token.decimals = { [CURRENCY]: 18 };
        render(modal());
        expect(screen.queryByTestId("preview-swap-max-input")).toBeNull();
        expect(screen.queryByTestId("preview-swap-balance")).toBeNull();
        expect(screen.getByTestId("preview-swap").textContent).not.toMatch(/1025000000|5000000000/);
        expect(screen.getByTestId("preview-swap-margin")).toHaveTextContent("2.5%");
    });

    it("shows the figure without a symbol while the symbol is unread", () => {
        token.symbols = {};
        render(modal());
        expect(screen.getByTestId("preview-swap-max-input")).toHaveTextContent(/^1025$/);
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
