import { describe, it, expect, vi } from "vitest";
import { commitSignedOrder } from "@/lib/kernel/orderCommitted";
import type { CommitmentPayload } from "@/lib/kernel/signedCommitment";
import type { Commitment } from "@figaro/sdk";
import { ZERO_PROCESS_ID } from "@/lib/shared/evm";

const PROCESS_ID = `0x${"ab".repeat(32)}` as `0x${string}`;
const SIG = `0x${"cd".repeat(65)}` as `0x${string}`;
const TX_HASH = `0x${"ee".repeat(32)}` as `0x${string}`;

function payloadFor(processId: `0x${string}`): CommitmentPayload {
    return {
        commitment: {
            processId,
            buyer: `0x${"11".repeat(20)}`,
            seller: `0x${"22".repeat(20)}`,
            currency: `0x${"33".repeat(20)}`,
            payment: 100n,
            expectedCumulativeValue: 100n,
            agreementHash: `0x${"44".repeat(32)}`,
            salt: 1n,
            deadline: 2n ** 40n,
        } as Commitment,
        agreement: { sections: [] } as never,
        buyerSig: SIG,
        sellerSig: SIG,
    };
}

/** Full client stub: receipt + the resolve-cap reads (30M chain, N active orders). */
function capableClient(activeOrderCount: bigint) {
    return {
        waitForTransactionReceipt: vi.fn(async () => ({ status: "success" })),
        getBlock: vi.fn(async () => ({ gasLimit: 30_000_000n })),
        readContract: vi.fn(async () => [
            `0x${"11".repeat(20)}`, `0x${"33".repeat(20)}`, 500n, activeOrderCount,
        ]),
    };
}

describe("commitSignedOrder — resolve-cap guard", () => {
    it("requires both signatures", async () => {
        const payload = { ...payloadFor(PROCESS_ID), sellerSig: undefined };
        await expect(
            commitSignedOrder({ payload, commit: vi.fn() }),
        ).rejects.toThrow(/Both signatures/);
    });

    it("broadcasts a root commitment without reading process state", async () => {
        const client = capableClient(0n);
        const commit = vi.fn(async () => TX_HASH);
        await expect(
            commitSignedOrder({ payload: payloadFor(ZERO_PROCESS_ID), commit, publicClient: client }),
        ).resolves.toBe(TX_HASH);
        expect(client.readContract).not.toHaveBeenCalled();
        expect(commit).toHaveBeenCalledOnce();
    });

    it("broadcasts a sub-order into a process below the ceiling", async () => {
        const client = capableClient(10n);
        const commit = vi.fn(async () => TX_HASH);
        await expect(
            commitSignedOrder({ payload: payloadFor(PROCESS_ID), commit, publicClient: client }),
        ).resolves.toBe(TX_HASH);
        expect(client.readContract).toHaveBeenCalledOnce();
    });

    it("refuses the commit that would make the process unresolvable — before broadcasting", async () => {
        const client = capableClient(1237n); // 30M chain cap = 1237
        const commit = vi.fn(async () => TX_HASH);
        await expect(
            commitSignedOrder({ payload: payloadFor(PROCESS_ID), commit, publicClient: client }),
        ).rejects.toThrow(/permanently unresolvable/);
        expect(commit).not.toHaveBeenCalled();
    });

    it("skips the guard for a receipt-only client (test stubs) but still broadcasts", async () => {
        const receiptOnly = { waitForTransactionReceipt: vi.fn(async () => ({ status: "success" })) };
        const commit = vi.fn(async () => TX_HASH);
        await expect(
            commitSignedOrder({ payload: payloadFor(PROCESS_ID), commit, publicClient: receiptOnly }),
        ).resolves.toBe(TX_HASH);
        expect(commit).toHaveBeenCalledOnce();
    });
});
