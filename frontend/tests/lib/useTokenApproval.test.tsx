/**
 * useTokenApproval — the ERC-20 approval every bond and funding surface sends:
 * the allowance it reads is the owner's for the spender on the token, the
 * write it sends is `approve(spender, amount)` on that token, and only a
 * receipt whose status is "success" is the approval's success — a reverted
 * receipt, a refused send or an unreadable receipt is its error.
 *
 * Like every other write (`contractWriteSites.test.tsx`), the approve is
 * simulated before it is sent, and a simulation that reverts sends nothing and
 * is the approval's error; the send names the page's chain (`chainId`); the
 * outcome of a sent approve is read from the mutation and receipt states below.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { ERC20_ABI } from "@/lib/kernel/contracts";
import { activeChain } from "@/lib/shared/chains";

// The wagmi surface the hook reads, driven per test: the allowance read, the
// approve mutation, and the approve's receipt query; each call's config is
// recorded so a test sees what was read and written.
const wagmiState = vi.hoisted(() => ({
    allowance: { data: undefined as bigint | undefined, isFetched: false, isRefetching: false, refetch: (() => {}) as () => void },
    write: { data: undefined as `0x${string}` | undefined, isPending: false, isError: false },
    receipt: { data: undefined as { status: "success" | "reverted" } | undefined, isLoading: false, isSuccess: false, isError: false },
    writeContract: (() => {}) as (args: unknown) => void,
    simulateContract: (async (_config: unknown) => ({})) as (config: unknown) => Promise<unknown>,
    readConfigs: [] as unknown[],
    receiptConfigs: [] as unknown[],
}));
vi.mock("wagmi", () => ({
    useReadContract: (config: unknown) => { wagmiState.readConfigs.push(config); return wagmiState.allowance; },
    useWriteContract: () => ({ writeContract: wagmiState.writeContract, ...wagmiState.write }),
    useWaitForTransactionReceipt: (config: unknown) => { wagmiState.receiptConfigs.push(config); return wagmiState.receipt; },
    usePublicClient: () => ({ simulateContract: (config: unknown) => wagmiState.simulateContract(config) }),
}));

import useTokenApproval from "@/hooks/useTokenApproval";

const TOKEN = `0x${"7e".repeat(20)}` as `0x${string}`;
const OWNER = `0x${"0a".repeat(20)}` as `0x${string}`;
const SPENDER = `0x${"5b".repeat(20)}` as `0x${string}`;
const APPROVE_TX = `0x${"77".repeat(32)}` as `0x${string}`;

beforeEach(() => {
    wagmiState.allowance = { data: undefined, isFetched: false, isRefetching: false, refetch: vi.fn() };
    wagmiState.write = { data: undefined, isPending: false, isError: false };
    wagmiState.receipt = { data: undefined, isLoading: false, isSuccess: false, isError: false };
    wagmiState.writeContract = vi.fn();
    wagmiState.simulateContract = vi.fn(async () => ({}));
    wagmiState.readConfigs = [];
    wagmiState.receiptConfigs = [];
});

describe("useTokenApproval — what it reads and writes", () => {
    it("reads the owner's allowance for the spender on the token", () => {
        renderHook(() => useTokenApproval({ tokenAddress: TOKEN, owner: OWNER, spender: SPENDER }));
        expect(wagmiState.readConfigs.at(-1)).toMatchObject({
            address: TOKEN, abi: ERC20_ABI, functionName: "allowance", args: [OWNER, SPENDER], query: { enabled: true },
        });
    });

    it("reads nothing until the owner and the token are known", () => {
        renderHook(() => useTokenApproval({ tokenAddress: TOKEN, owner: undefined, spender: SPENDER }));
        expect(wagmiState.readConfigs.at(-1)).toMatchObject({ query: { enabled: false } });
    });

    it("simulates approve(spender, amount) on the token, then sends it on the page's chain", async () => {
        const { result } = renderHook(() => useTokenApproval({ tokenAddress: TOKEN, owner: OWNER, spender: SPENDER }));
        await act(async () => { await result.current.approve(1234n); });
        const call = { address: TOKEN, abi: ERC20_ABI, functionName: "approve", args: [SPENDER, 1234n] };
        expect(wagmiState.simulateContract).toHaveBeenCalledTimes(1);
        // The simulation runs as the owner, the account the approve will be sent from.
        expect(wagmiState.simulateContract).toHaveBeenCalledWith(expect.objectContaining({ ...call, account: OWNER }));
        expect(wagmiState.writeContract).toHaveBeenCalledTimes(1);
        // The send names the page's chain, so a mismatch is refused in the page, before the wallet prompt.
        expect(wagmiState.writeContract).toHaveBeenCalledWith({ ...call, chainId: activeChain.id });
        const simulateOrder = (wagmiState.simulateContract as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0];
        const writeOrder = (wagmiState.writeContract as ReturnType<typeof vi.fn>).mock.invocationCallOrder[0];
        expect(simulateOrder).toBeLessThan(writeOrder);
        expect(result.current.isApproveError).toBe(false);
    });

    it("a simulation that reverts sends nothing and is the approval's error", async () => {
        wagmiState.simulateContract = vi.fn(async () => { throw new Error("execution reverted"); });
        const { result } = renderHook(() => useTokenApproval({ tokenAddress: TOKEN, owner: OWNER, spender: SPENDER }));
        await act(async () => { await result.current.approve(1234n); });
        expect(wagmiState.writeContract).not.toHaveBeenCalled();
        expect(result.current.isApproveError).toBe(true);
    });

    it("sends nothing with no token", async () => {
        const { result } = renderHook(() => useTokenApproval({ tokenAddress: undefined, owner: OWNER, spender: SPENDER }));
        await expect(result.current.approve(1234n)).resolves.toBeUndefined();
        expect(wagmiState.simulateContract).not.toHaveBeenCalled();
        expect(wagmiState.writeContract).not.toHaveBeenCalled();
    });

    it("waits for the receipt of the approve it sent", () => {
        wagmiState.write = { data: APPROVE_TX, isPending: false, isError: false };
        renderHook(() => useTokenApproval({ tokenAddress: TOKEN, owner: OWNER, spender: SPENDER }));
        expect(wagmiState.receiptConfigs.at(-1)).toEqual({ hash: APPROVE_TX });
    });
});

describe("useTokenApproval — the approval's outcome is the receipt's status", () => {
    it("a success receipt is the success, and the allowance is read again", () => {
        wagmiState.receipt = { data: { status: "success" }, isLoading: false, isSuccess: true, isError: false };
        const { result } = renderHook(() => useTokenApproval({ tokenAddress: TOKEN, owner: OWNER, spender: SPENDER }));
        expect(result.current.isApproveSuccess).toBe(true);
        expect(result.current.isApproveError).toBe(false);
        expect(wagmiState.allowance.refetch).toHaveBeenCalled();
    });

    it("a reverted receipt is the error, never the success, and reads nothing again", () => {
        wagmiState.receipt = { data: { status: "reverted" }, isLoading: false, isSuccess: true, isError: false };
        const { result } = renderHook(() => useTokenApproval({ tokenAddress: TOKEN, owner: OWNER, spender: SPENDER }));
        expect(result.current.isApproveSuccess).toBe(false);
        expect(result.current.isApproveError).toBe(true);
        expect(wagmiState.allowance.refetch).not.toHaveBeenCalled();
    });

    it("a refused send and an unreadable receipt are each the error", () => {
        wagmiState.write = { data: undefined, isPending: false, isError: true };
        expect(renderHook(() => useTokenApproval({ tokenAddress: TOKEN, owner: OWNER, spender: SPENDER })).result.current.isApproveError).toBe(true);
        wagmiState.write = { data: APPROVE_TX, isPending: false, isError: false };
        wagmiState.receipt = { data: undefined, isLoading: false, isSuccess: false, isError: true };
        expect(renderHook(() => useTokenApproval({ tokenAddress: TOKEN, owner: OWNER, spender: SPENDER })).result.current.isApproveError).toBe(true);
    });

    it("needs an approval while the allowance is unknown or short, not once it covers the amount", () => {
        const { result, rerender } = renderHook(() => useTokenApproval({ tokenAddress: TOKEN, owner: OWNER, spender: SPENDER }));
        expect(result.current.needsApproval(10n)).toBe(true);
        wagmiState.allowance = { ...wagmiState.allowance, data: 9n, isFetched: true };
        rerender();
        expect(result.current.needsApproval(10n)).toBe(true);
        wagmiState.allowance = { ...wagmiState.allowance, data: 10n, isFetched: true };
        rerender();
        expect(result.current.needsApproval(10n)).toBe(false);
    });
});
