import { describe, expect, it, vi } from "vitest";
import type { Commitment } from "@figaro/core";

const submitPermitTransactionMock = vi.fn(async (_args?: unknown) => "0xpermit");

vi.mock("@/lib/core/permitExecution", () => ({
    submitPermitTransaction: (args: unknown) => submitPermitTransactionMock(args),
}));

import { submitPreparedCommitment } from "@/lib/core/commitmentSubmission";

const commitment: Commitment = {
    processId: `0x${"00".repeat(32)}`,
    buyer: "0x1234567890123456789012345678901234567890",
    seller: "0x9999999999999999999999999999999999999999",
    currency: "0x2222222222222222222222222222222222222222",
    payment: 10n,
    expectedCumulativeValue: 10n,
    agreementHash: `0x${"11".repeat(32)}`,
    salt: 1n,
    deadline: 2n,
};

describe("submitPreparedCommitment", () => {
    it("broadcasts immediately and submits a permit when configured", async () => {
        const signAndBroadcastCommitment = vi.fn(async () => "0xabc");
        const initiateAsParty = vi.fn();
        const waitForTransactionReceipt = vi.fn(async () => undefined);

        const result = await submitPreparedCommitment({
            prepared: {
                commitment,
                commitmentMeta: { agreementUri: "ipfs://agreement" },
            },
            proposerRole: "buyer",
            buyerAddress: commitment.buyer,
            sellerAddress: commitment.seller,
            immediateCommitEnabled: true,
            isE2EMock: false,
            permit: {
                target: commitment.currency,
                data: "0x1234",
            },
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            sendTransaction: vi.fn(async () => "0xpermit") as any,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            publicClient: { waitForTransactionReceipt } as any,
            waitForCommitReceipt: true,
            initiateAsParty,
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            signAndBroadcastCommitment: signAndBroadcastCommitment as any,
        });

        expect(submitPermitTransactionMock).toHaveBeenCalledTimes(1);
        expect(signAndBroadcastCommitment).toHaveBeenCalledWith(
            commitment,
            { agreementUri: "ipfs://agreement" },
            "buyer",
        );
        expect(waitForTransactionReceipt).toHaveBeenCalledWith({ hash: "0xabc" });
        expect(initiateAsParty).not.toHaveBeenCalled();
        expect(result).toEqual({ mode: "broadcast", hash: "0xabc" });
    });

    it("falls back to shared commitment flow when immediate commit is disabled", async () => {
        const signAndBroadcastCommitment = vi.fn();
        const initiateAsParty = vi.fn(async () => undefined);

        const result = await submitPreparedCommitment({
            prepared: { commitment },
            proposerRole: "buyer",
            buyerAddress: commitment.buyer,
            sellerAddress: commitment.seller,
            immediateCommitEnabled: false,
            isE2EMock: false,
            initiateAsParty,
            signAndBroadcastCommitment,
        });

        expect(initiateAsParty).toHaveBeenCalledWith(commitment, "buyer", undefined);
        expect(signAndBroadcastCommitment).not.toHaveBeenCalled();
        expect(result).toEqual({ mode: "shared" });
    });
});