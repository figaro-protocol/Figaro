import { describe, expect, it, vi } from "vitest";

import type { CommitmentPayload } from "@/lib/core/useCommitmentFlow";
import { broadcastSharedCommitment } from "@/lib/core/commitmentBroadcast";

const payload: CommitmentPayload = {
    commitment: {
        processId: `0x${"00".repeat(32)}`,
        buyer: "0x1234567890123456789012345678901234567890",
        seller: "0x9999999999999999999999999999999999999999",
        currency: "0x2222222222222222222222222222222222222222",
        payment: 10n,
        expectedCumulativeValue: 10n,
        agreementHash: `0x${"11".repeat(32)}`,
        salt: 1n,
        deadline: 2n,
    },
    buyerSig: `0x${"aa".repeat(65)}`,
    sellerSig: `0x${"bb".repeat(65)}`,
};

describe("broadcastSharedCommitment", () => {
    it("broadcasts without waiting for a receipt by default", async () => {
        const broadcast = vi.fn(async () => "0xabc" as const);
        const publicClient = {
            waitForTransactionReceipt: vi.fn(async () => undefined),
        };

        const result = await broadcastSharedCommitment({
            payload,
            broadcast,
            publicClient,
        });

        expect(broadcast).toHaveBeenCalledWith(payload);
        expect(publicClient.waitForTransactionReceipt).not.toHaveBeenCalled();
        expect(result).toBe("0xabc");
    });

    it("waits for the receipt when requested", async () => {
        const broadcast = vi.fn(async () => "0xdef" as const);
        const publicClient = {
            waitForTransactionReceipt: vi.fn(async () => undefined),
        };

        const result = await broadcastSharedCommitment({
            payload,
            broadcast,
            publicClient,
            waitForReceipt: true,
        });

        expect(publicClient.waitForTransactionReceipt).toHaveBeenCalledWith({ hash: "0xdef" });
        expect(result).toBe("0xdef");
    });
});