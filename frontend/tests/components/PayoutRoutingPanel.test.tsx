import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";

/**
 * The payout panel parses no amount until the token's own decimals are read:
 * the decimals hook falls back to 18 while the read is in flight, and an amount
 * parsed at 18 on a 6-decimal token is 10^12× what the seller typed — the
 * exact-total approve would mine before the simulate refuses the batch.
 */

const decimalsState = { decimals: 18, ready: false };
const routeTokenPayout = vi.fn(async () => `0x${"ab".repeat(32)}` as `0x${string}`);

vi.mock("@/hooks/useTokenDecimals", () => ({ default: () => ({ ...decimalsState, loading: !decimalsState.ready }) }));
vi.mock("@/hooks/useTokenSymbol", () => ({ useTokenSymbol: () => ({ data: "USDC" }) }));
vi.mock("@/lib/composition/usePayoutRoutingActions", () => ({
    usePayoutRoutingActions: () => ({ routeTokenPayout, isRouting: false, isAvailable: true }),
}));

import { PayoutRoutingPanel } from "@/components/runtime/PayoutRoutingPanel";

const TOKEN = "0x00000000000000000000000000000000000007ed" as const;
const RECIPIENT = "0x0000000000000000000000000000000000005e11";

function fillOneLeg(amount: string) {
    fireEvent.change(screen.getByTestId("payout-routing-recipient-0"), { target: { value: RECIPIENT } });
    fireEvent.change(screen.getByTestId("payout-routing-amount-0"), { target: { value: amount } });
}

describe("PayoutRoutingPanel", () => {
    beforeEach(() => {
        routeTokenPayout.mockClear();
    });

    it("waits while the token's decimals are unread — a complete leg cannot route", () => {
        Object.assign(decimalsState, { decimals: 18, ready: false });
        render(<PayoutRoutingPanel currency={TOKEN} />);
        fillOneLeg("1.5");
        const execute = screen.getByTestId("payout-routing-execute");
        expect(execute).toBeDisabled();
        fireEvent.click(execute);
        expect(routeTokenPayout).not.toHaveBeenCalled();
    });

    it("parses at the token's own decimals once read", async () => {
        Object.assign(decimalsState, { decimals: 6, ready: true });
        render(<PayoutRoutingPanel currency={TOKEN} />);
        fillOneLeg("1.5");
        const execute = screen.getByTestId("payout-routing-execute");
        expect(execute).toBeEnabled();
        fireEvent.click(execute);
        expect(await screen.findByTestId("payout-routing-success")).toBeInTheDocument();
        expect(routeTokenPayout).toHaveBeenCalledExactlyOnceWith(TOKEN, [{ recipient: RECIPIENT, amount: 1_500_000n }]);
    });

    it("an unparseable amount stays incomplete, never a crash", () => {
        Object.assign(decimalsState, { decimals: 6, ready: true });
        render(<PayoutRoutingPanel currency={TOKEN} />);
        fillOneLeg("1.2.3");
        expect(screen.getByTestId("payout-routing-execute")).toBeDisabled();
    });
});
