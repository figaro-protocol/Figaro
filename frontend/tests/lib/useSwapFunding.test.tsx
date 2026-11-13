/**
 * useSwapFunding — a party's swap-funded bond leg, shared by the buyer at
 * checkout and the seller at /sign. Its candidates are the party's accepted
 * tokens minus the process denomination, and none where the swap composition
 * is unconfigured or the party or the denomination is unknown; `authorize`
 * sends `approve(permit2, cap)` on the chosen token, the cap being the signed
 * maximum input of this swap in the FUNDING token's units and never more;
 * `authorizationFor(cap)` says where the chosen token stands with Permit2
 * against that cap (not against the bond, which is in the process's token),
 * from the allowance the owner gave Permit2 on that token; `authorizeFailed`
 * is the approval's error.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { maxUint256 } from "viem";
import { ERC20_ABI } from "@/lib/kernel/contracts";
import { activeChain } from "@/lib/shared/chains";
import type { AcceptedTokenMetadata } from "@/lib/member/acceptedTokenMetadata";

// The wagmi surface `useTokenApproval` reads (the shape
// `useTokenApproval.test.tsx` drives), per test.
const wagmiState = vi.hoisted(() => ({
    allowance: { data: undefined as bigint | undefined, isFetched: false, isRefetching: false, refetch: (() => {}) as () => void },
    write: { data: undefined as `0x${string}` | undefined, isPending: false, isError: false },
    receipt: { data: undefined as { status: "success" | "reverted" } | undefined, isLoading: false, isSuccess: false, isError: false },
    writeContract: (() => {}) as (args: unknown) => void,
    readConfigs: [] as unknown[],
    contracts: null as null | { coordinator: `0x${string}`; permit2: `0x${string}`; router: `0x${string}` },
}));
vi.mock("wagmi", () => ({
    useReadContract: (config: unknown) => { wagmiState.readConfigs.push(config); return wagmiState.allowance; },
    useWriteContract: () => ({ writeContract: wagmiState.writeContract, ...wagmiState.write }),
    useWaitForTransactionReceipt: () => wagmiState.receipt,
    usePublicClient: () => ({ simulateContract: async () => ({}) }),
}));
vi.mock("@/lib/composition/swapFunding", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/composition/swapFunding")>()),
    resolveSwapFundingContracts: () => wagmiState.contracts,
}));

import { useSwapFunding } from "@/lib/composition/useSwapFunding";

const PARTY = `0x${"0a".repeat(20)}` as `0x${string}`;
const CURRENCY = `0x${"cc".repeat(20)}` as `0x${string}`;
const PERMIT2 = `0x${"a2".repeat(20)}` as `0x${string}`;
const TOKEN_A = `0x${"1a".repeat(20)}` as `0x${string}`;
const TOKEN_B = `0x${"1b".repeat(20)}` as `0x${string}`;
const ACCEPTED: AcceptedTokenMetadata[] = [
    { address: TOKEN_A, symbol: "AAA" },
    // The denomination itself, in another case: never a funding candidate.
    { address: CURRENCY.toUpperCase().replace("0X", "0x") as `0x${string}`, symbol: "CUR" },
    { address: TOKEN_B, symbol: "BBB" },
];

beforeEach(() => {
    wagmiState.allowance = { data: undefined, isFetched: false, isRefetching: false, refetch: vi.fn() };
    wagmiState.write = { data: undefined, isPending: false, isError: false };
    wagmiState.receipt = { data: undefined, isLoading: false, isSuccess: false, isError: false };
    wagmiState.writeContract = vi.fn();
    wagmiState.readConfigs = [];
    wagmiState.contracts = { coordinator: `0x${"c0".repeat(20)}`, permit2: PERMIT2, router: `0x${"d0".repeat(20)}` };
});

const render = (args: Partial<Parameters<typeof useSwapFunding>[0]> = {}) =>
    renderHook(() => useSwapFunding({ party: PARTY, currency: CURRENCY, acceptedTokens: ACCEPTED, ...args }));

describe("useSwapFunding — the candidates", () => {
    it("are the party's accepted tokens minus the denomination", () => {
        const { result } = render();
        expect(result.current.candidates.map((t) => t.address)).toEqual([TOKEN_A, TOKEN_B]);
        expect(result.current.contracts?.permit2).toBe(PERMIT2);
    });

    it("are none where the swap composition is unconfigured, or the party or the denomination is unknown", () => {
        expect(render({ party: undefined }).result.current.candidates).toEqual([]);
        expect(render({ currency: undefined }).result.current.candidates).toEqual([]);
        wagmiState.contracts = null;
        const { result } = render();
        expect(result.current.candidates).toEqual([]);
        expect(result.current.contracts).toBeNull();
    });
});

describe("useSwapFunding — the Permit2 authorization of the chosen token", () => {
    it("reads the party's allowance for Permit2 on the chosen token", () => {
        const { result } = render();
        act(() => result.current.setFundingToken(TOKEN_A));
        expect(wagmiState.readConfigs.at(-1)).toMatchObject({
            address: TOKEN_A, abi: ERC20_ABI, functionName: "allowance", args: [PARTY, PERMIT2], query: { enabled: true },
        });
    });

    it("authorize sends approve(permit2, cap) on the chosen token, on the page's chain, for exactly the cap", async () => {
        const { result } = render();
        act(() => result.current.setFundingToken(TOKEN_B));
        const cap = 1_010_000n; // the signed maximum input, in the funding token's units
        await act(async () => { await result.current.authorize(cap); });
        expect(wagmiState.writeContract).toHaveBeenCalledTimes(1);
        expect(wagmiState.writeContract).toHaveBeenCalledWith({
            address: TOKEN_B, abi: ERC20_ABI, functionName: "approve", args: [PERMIT2, cap], chainId: activeChain.id,
        });
        const [{ args }] = (wagmiState.writeContract as ReturnType<typeof vi.fn>).mock.calls[0] as [{ args: [string, bigint] }];
        expect(args[1]).toBeLessThanOrEqual(cap);
        expect(args[1]).not.toBe(maxUint256);
    });

    it("authorize sends nothing for a cap that is unknown or zero", async () => {
        const { result } = render();
        act(() => result.current.setFundingToken(TOKEN_B));
        await act(async () => { await result.current.authorize(null); });
        await act(async () => { await result.current.authorize(0n); });
        expect(wagmiState.writeContract).not.toHaveBeenCalled();
    });

    it("authorize sends nothing before a token is chosen", async () => {
        const { result } = render();
        await act(async () => { await result.current.authorize(1_000n); });
        expect(wagmiState.writeContract).not.toHaveBeenCalled();
    });

    it("stands against the cap in the funding token's units, whatever the bond is in the process token", () => {
        const { result, rerender } = render();
        act(() => result.current.setFundingToken(TOKEN_A));
        wagmiState.allowance = { ...wagmiState.allowance, data: 1_000n, isFetched: true };
        rerender();
        expect(result.current.authorizationFor(1_001n)).toBe("needed");
        expect(result.current.authorizationFor(1_000n)).toBe("ready");
        expect(result.current.authorizationFor(1n)).toBe("ready");
    });

    it("stands reading, never ready, while the cap itself is not yet known", () => {
        const { result, rerender } = render();
        act(() => result.current.setFundingToken(TOKEN_A));
        wagmiState.allowance = { ...wagmiState.allowance, data: maxUint256, isFetched: true };
        rerender();
        expect(result.current.authorizationFor(10n)).toBe("ready");
        expect(result.current.authorizationFor(null)).toBe("reading");
    });

    it("stands none with no token, reading until the allowance is read, needed when short, ready when it covers the bond", () => {
        const { result, rerender } = render();
        expect(result.current.authorizationFor(10n)).toBe("none");
        act(() => result.current.setFundingToken(TOKEN_A));
        expect(result.current.authorizationFor(10n)).toBe("reading");
        wagmiState.allowance = { ...wagmiState.allowance, data: 9n, isFetched: true };
        rerender();
        expect(result.current.authorizationFor(10n)).toBe("needed");
        wagmiState.allowance = { ...wagmiState.allowance, data: 10n, isFetched: true };
        rerender();
        expect(result.current.authorizationFor(10n)).toBe("ready");
    });

    it("stands reading while a known allowance is read again, and authorizing while the approval is in flight", () => {
        const { result, rerender } = render();
        act(() => result.current.setFundingToken(TOKEN_A));
        wagmiState.allowance = { ...wagmiState.allowance, data: 10n, isFetched: true, isRefetching: true };
        rerender();
        expect(result.current.authorizationFor(10n)).toBe("reading");
        wagmiState.write = { data: undefined, isPending: true, isError: false };
        rerender();
        expect(result.current.authorizationFor(10n)).toBe("authorizing");
    });

    it("reports a reverted approval as failed", () => {
        wagmiState.write = { data: `0x${"77".repeat(32)}`, isPending: false, isError: false };
        wagmiState.receipt = { data: { status: "reverted" }, isLoading: false, isSuccess: true, isError: false };
        expect(render().result.current.authorizeFailed).toBe(true);
    });
});
