import { act, renderHook } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { useMockTokenMint } from "@/hooks/core/useMockTokenMint";

const writeContractAsyncMock = vi.fn(async () => `0x${"12".repeat(32)}`);

vi.mock("wagmi", () => ({
    useAccount: () => ({
        address: "0x1234567890123456789012345678901234567890",
    }),
    useChainId: () => 31337,
    useWriteContract: () => ({
        writeContractAsync: writeContractAsyncMock,
        data: `0x${"12".repeat(32)}`,
        isPending: false,
    }),
    useWaitForTransactionReceipt: () => ({
        isLoading: false,
        isSuccess: true,
    }),
}));

vi.mock("@/hooks/core/useTokenDecimals", () => ({
    default: () => ({ decimals: 6 }),
}));

vi.mock("@/lib/shared/wagmi", () => ({
    localAnvil: { id: 31337 },
}));

vi.mock("@/lib/shared/chains", () => ({
    activeChain: { id: 31337, name: "Anvil" },
}));

vi.mock("@/lib/core/contracts", () => ({
    CONTRACTS: {
        mockToken: "0x2222222222222222222222222222222222222222",
    },
    MOCK_MINT_ABI: [],
}));

describe("useMockTokenMint", () => {
    it("mints against the configured mock token using token decimals", async () => {
        const { result } = renderHook(() => useMockTokenMint());

        await act(async () => {
            await result.current.mint("100");
        });

        expect(result.current.available).toBe(true);
        expect(result.current.isPending).toBe(false);
        expect(result.current.isConfirming).toBe(false);
        expect(result.current.isSuccess).toBe(true);
        expect(writeContractAsyncMock).toHaveBeenCalledWith(expect.objectContaining({
            functionName: "mint",
            args: [
                "0x1234567890123456789012345678901234567890",
                100000000n,
            ],
        }));
    });
});