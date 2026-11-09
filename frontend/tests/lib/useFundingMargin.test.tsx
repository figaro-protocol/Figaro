/**
 * useFundingMargin — the chooser's margin hook. `marginFor(bond)` takes the
 * bond per render (the checkout page knows it only below its early returns);
 * the hook quotes the venue for exactly that bond in the chosen funding token,
 * starts at the venue's own margin, and the cap follows what the party types.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";

const h = vi.hoisted(() => ({
    quotes: [] as unknown[],
    balance: { status: "present", value: 10_000n } as { status: "present"; value: bigint } | { status: "pending" },
    // wagmi hands back the same client across renders.
    client: { tag: "client" },
}));
vi.mock("wagmi", () => ({ usePublicClient: () => h.client }));
vi.mock("@/hooks/useTokenBalance", () => ({ default: () => ({ read: h.balance, refetch: () => {} }) }));
vi.mock("@/hooks/useTokenDecimals", () => ({ default: () => ({ decimals: 6, ready: true, loading: false }) }));
vi.mock("@/lib/composition/swapFunding", () => ({
    resolveSwapFundingContracts: () => ({ coordinator: "0xc0", permit2: "0xa2", router: "0xd0" }),
    quoteFundingInput: async (...args: unknown[]) => {
        h.quotes.push(args);
        return { venue: "uniswap-v3", slippageBps: 100, quotedInput: 1_000n };
    },
}));

import { useFundingMargin } from "@/lib/composition/useFundingMargin";

const TOKEN = `0x${"1a".repeat(20)}` as `0x${string}`;
const CURRENCY = `0x${"cc".repeat(20)}` as `0x${string}`;
const PARTY = `0x${"0a".repeat(20)}` as `0x${string}`;

beforeEach(() => { h.quotes = []; h.balance = { status: "present", value: 10_000n }; });

describe("useFundingMargin", () => {
    it("quotes the venue for the bond, shows the venue's margin, and the cap follows the party's edit", async () => {
        const { result } = renderHook(() =>
            useFundingMargin({ party: PARTY, currency: CURRENCY, fundingToken: TOKEN, fundingSymbol: "AAA" }).marginFor(2_000n),
        );
        await waitFor(() => expect(result.current.maxInput).toBe(1_010n));
        expect(h.quotes).toEqual([[{ tag: "client" }, "0xd0", { inputToken: TOKEN, currency: CURRENCY, bondAmount: 2_000n }]]);
        expect(result.current).toMatchObject({ text: "1", bps: 100, venue: "uniswap-v3", decimals: 6, symbol: "AAA", refusal: null });
        act(() => result.current.onChange("3"));
        expect(result.current).toMatchObject({ text: "3", bps: 300, maxInput: 1_030n, refusal: null });
        act(() => result.current.onChange("-1"));
        expect(result.current).toMatchObject({ bps: null, maxInput: null, refusal: "range" });
    });

    it("refuses a margin whose cap the balance cannot cover", async () => {
        h.balance = { status: "present", value: 1_020n };
        const { result } = renderHook(() =>
            useFundingMargin({ party: PARTY, currency: CURRENCY, fundingToken: TOKEN, fundingSymbol: "AAA" }).marginFor(2_000n),
        );
        await waitFor(() => expect(result.current.maxInput).toBe(1_010n));
        act(() => result.current.onChange("5"));
        expect(result.current).toMatchObject({ maxInput: 1_050n, refusal: "balance" });
    });

    it("quotes nothing while no funding token is chosen or the bond is unknown", async () => {
        renderHook(() => useFundingMargin({ party: PARTY, currency: CURRENCY, fundingToken: null, fundingSymbol: "" }).marginFor(2_000n));
        renderHook(() => useFundingMargin({ party: PARTY, currency: CURRENCY, fundingToken: TOKEN, fundingSymbol: "AAA" }).marginFor(null));
        await new Promise((r) => setTimeout(r, 0));
        expect(h.quotes).toEqual([]);
    });
});
