/**
 * usePublishMemberProfile — a registry revert is reported by the contract's
 * error name: `AlreadyRegistered()` (a wallet registered between the read of
 * `registered` and the send) reads as already registered, and
 * `NotRegistered()` (a wallet that left between the read and an update)
 * reads as not registered.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, renderHook } from "@testing-library/react";
import { ContractFunctionRevertedError, encodeErrorResult, type Abi } from "viem";

const w = vi.hoisted(() => {
    process.env.NEXT_PUBLIC_MEMBERS_REGISTRY = "0x00000000000000000000000000000000000e3b01";
    return {
        wallet: "0x70997970c51812dc3a010c7d01b50e0d17dc79c8" as `0x${string}`,
        registered: false,
        client: {} as Record<string, unknown>,
        write: undefined as unknown as ReturnType<typeof vi.fn>,
    };
});

vi.mock("wagmi", () => ({
    useAccount: () => ({ address: w.wallet, isConnected: true }),
    usePublicClient: () => w.client,
    useWriteContract: () => ({ writeContractAsync: w.write, data: undefined, isPending: false, error: null }),
    useWaitForTransactionReceipt: () => ({ isLoading: false, isSuccess: false, data: undefined }),
}));
vi.mock("@/lib/member/catalogPublisher", () => ({
    publishMemberCatalog: async () => ({ uri: "ipfs://bafycatalog" }),
}));
vi.mock("@/lib/member/memberProfileMetadata", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/member/memberProfileMetadata")>()),
    parseMemberProfileDocument: (doc: unknown) => doc,
}));
vi.mock("@/lib/shared/ipfsService", async (importOriginal) => ({
    ...(await importOriginal<typeof import("@/lib/shared/ipfsService")>()),
    DEFAULT_IPFS_SERVICE: { publishJSON: async () => ({ uri: "ipfs://bafyprofile" }) },
}));

import { usePublishMemberProfile } from "@/lib/member/usePublishMemberProfile";

function revert(errorName: string): ContractFunctionRevertedError {
    const abi = [{ type: "error", name: errorName, inputs: [] }] as const satisfies Abi;
    const data = encodeErrorResult({ abi, errorName } as never);
    return new ContractFunctionRevertedError({ abi, data, functionName: "register" });
}

async function publishCaught(): Promise<unknown> {
    const { result } = renderHook(() => usePublishMemberProfile());
    let caught: unknown;
    await act(async () => {
        try {
            await result.current.publish({
                profileMetadata: { name: "Seller" } as never,
                items: [{ name: "item" } as never],
                wallet: w.wallet,
            });
        } catch (e) {
            caught = e;
        }
    });
    return caught;
}

beforeEach(() => {
    w.client = {
        readContract: vi.fn(async ({ functionName }: { functionName: string }) =>
            functionName === "registered" ? w.registered : 10n ** 16n),
        simulateContract: vi.fn(async () => ({ request: {} })),
        waitForTransactionReceipt: vi.fn(async () => ({ status: "success" })),
    };
    w.write = vi.fn(async () => `0x${"77".repeat(32)}`);
});

describe("usePublishMemberProfile — reverts by error name", () => {
    it("reports AlreadyRegistered() as already registered, and sends nothing", async () => {
        w.registered = false;
        (w.client.simulateContract as ReturnType<typeof vi.fn>).mockRejectedValue(revert("AlreadyRegistered"));
        const caught = await publishCaught();
        expect(caught).toBeInstanceOf(Error);
        expect((caught as Error).message).toMatch(/already registered/i);
        expect((caught as Error).message).not.toMatch(/reverted with the following/i);
        expect(w.write).not.toHaveBeenCalled();
    });

    it("reports NotRegistered() as not registered, and sends nothing", async () => {
        w.registered = true;
        (w.client.simulateContract as ReturnType<typeof vi.fn>).mockRejectedValue(revert("NotRegistered"));
        const caught = await publishCaught();
        expect(caught).toBeInstanceOf(Error);
        expect((caught as Error).message).toMatch(/not registered/i);
        expect((caught as Error).message).not.toMatch(/reverted with the following/i);
        expect(w.write).not.toHaveBeenCalled();
    });
});
