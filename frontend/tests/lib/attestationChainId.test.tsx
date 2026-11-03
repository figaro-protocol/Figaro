/**
 * useAttestationCoordinatorActions — a signed commitment is restored under
 * the connected chain's id, the domain it was signed in. With no connected
 * chain there is no domain to restore under: no order read, no restore, no
 * write — never a devnet id standing in.
 */
import { describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";

const w = vi.hoisted(() => ({
    address: "0x70997970c51812dc3a010c7d01b50e0d17dc79c8" as `0x${string}`,
    client: undefined as Record<string, unknown> | undefined,
    write: vi.fn(),
    orderReads: [] as number[],
    restores: [] as number[],
}));

vi.mock("wagmi", () => ({
    useAccount: () => ({ address: w.address, isConnected: true }),
    usePublicClient: () => w.client,
    useWriteContract: () => ({ writeContractAsync: w.write, data: undefined, isPending: false }),
    useWaitForTransactionReceipt: () => ({ isLoading: false, isSuccess: false }),
}));
vi.mock("@/lib/composition/contracts", () => ({
    getAttestationCoordinator: () => "0x00000000000000000000000000000000000a7701",
}));
vi.mock("@/lib/kernel/indexer", () => ({
    getAllOrderCommitted: async (_client: unknown, chainId: number) => {
        w.orderReads.push(chainId);
        return [{ args: { orderHash: `0x${"0d".repeat(32)}`, checkoutHash: `0x${"cc".repeat(32)}` } }];
    },
    getStringArg: (log: { args: Record<string, unknown> }, key: string) => String(log.args[key]),
}));
vi.mock("@/lib/kernel/signedCommitment", () => ({
    restoreSignedProcessId: (c: unknown, chainId: number) => { w.restores.push(chainId); return c; },
}));

import { useAttestationCoordinatorActions } from "@/lib/composition/useAttestationCoordinatorActions";

async function attestCaught(): Promise<unknown> {
    const { result } = renderHook(() => useAttestationCoordinatorActions());
    let caught: unknown;
    await act(async () => {
        try {
            await result.current.submitAttestation("buyer", { orderHash: `0x${"0d".repeat(32)}`, clauseId: `0x${"ab".repeat(32)}`, stage: 0 });
        } catch (e) {
            caught = e;
        }
    });
    return caught;
}

describe("useAttestationCoordinatorActions — the chain id is the connected chain's", () => {
    it("a client with no chain: nothing is read, restored or written", async () => {
        w.client = { readContract: vi.fn(), simulateContract: vi.fn() };
        w.orderReads = [];
        w.restores = [];
        const caught = await attestCaught();
        expect(caught).toBeInstanceOf(Error);
        expect((caught as Error).message).toMatch(/chain/i);
        expect(w.orderReads).toEqual([]);
        expect(w.restores).toEqual([]);
        expect(w.write).not.toHaveBeenCalled();
    });

    it("a connected chain: the restore runs under its id", async () => {
        w.client = { chain: { id: 11155111 }, readContract: vi.fn(), simulateContract: vi.fn() };
        w.orderReads = [];
        w.restores = [];
        await attestCaught();
        expect(w.orderReads).toEqual([11155111]);
        expect(w.restores).toEqual([11155111]);
    });
});
