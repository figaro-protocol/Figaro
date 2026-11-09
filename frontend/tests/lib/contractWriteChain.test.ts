/**
 * `simulateWriteVerify` sends every write with `chainId: activeChain.id`.
 * wagmi's `writeContract` reads the chain only from `chainId`: it sets viem's
 * `chain` itself (overwriting any `chain` the caller passed), and only when
 * `chainId` is given does it set `assertChainId: true`, so viem reads the
 * wallet's chain and throws `ChainMismatchError` on a mismatch. The write
 * refuses a mismatch in the page, before the wallet prompt opens.
 */
import { describe, expect, it, vi } from "vitest";
import { ChainMismatchError, type Abi } from "viem";
import { activeChain } from "@/lib/shared/chains";
import { simulateWriteVerify } from "@/lib/shared/contractWrite";

const TX = `0x${"11".repeat(32)}` as `0x${string}`;
const ADDRESS = `0x${"c0".repeat(20)}` as `0x${string}`;
const ACCOUNT = `0x${"0a".repeat(20)}` as `0x${string}`;

function client() {
    return {
        simulateContract: vi.fn(async () => ({})),
        waitForTransactionReceipt: vi.fn(async () => ({ status: "success" })),
    };
}

const CALL = {
    address: ADDRESS,
    abi: [] as Abi,
    functionName: "f",
    args: [],
    account: ACCOUNT,
    failureMessage: "not written",
};

describe("simulateWriteVerify — the chain a write names", () => {
    it("sends the write with the build's chainId", async () => {
        const writeContractAsync = vi.fn(async (_config: unknown) => TX);
        await simulateWriteVerify({ ...CALL, client: client(), writeContractAsync });
        expect(writeContractAsync).toHaveBeenCalledTimes(1);
        expect(writeContractAsync.mock.calls[0][0]).toMatchObject({ chainId: activeChain.id });
    });

    it("reports a wallet on another chain as the send's failure and waits for no receipt", async () => {
        const c = client();
        const mismatch = new ChainMismatchError({ chain: activeChain, currentChainId: 1 });
        const writeContractAsync = vi.fn(async (_config: unknown): Promise<`0x${string}`> => { throw mismatch; });
        await expect(simulateWriteVerify({ ...CALL, client: c, writeContractAsync })).rejects.toThrow(/does not match the target chain/);
        expect(c.waitForTransactionReceipt).not.toHaveBeenCalled();
    });
});
