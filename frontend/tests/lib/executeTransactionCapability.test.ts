import { describe, expect, it, vi } from "vitest";
import { executeTransactionCapabilityAction } from "@/lib/core/executeTransactionCapability";

describe("executeTransactionCapabilityAction", () => {
    it("dispatches disclosure commitments with descriptor defaults", async () => {
        const submitDisclosureCommitment = vi.fn(async () => undefined);

        await executeTransactionCapabilityAction(
            {
                executionType: "transaction",
                kind: "submit-disclosure-commitment",
                orderHash: "root-order",
                disclosureRole: "merchant",
            },
            { submitDisclosureCommitment },
        );

        expect(submitDisclosureCommitment).toHaveBeenCalledWith("root-order", "merchant");
    });

    it("dispatches airdrop claims with amount and proof from action and waits for confirmation", async () => {
        const txHash = `0x${"12".repeat(32)}` as const;
        const claimAirdrop = vi.fn(async () => txHash);
        const waitForTransactionConfirmation = vi.fn(async () => undefined);

        await executeTransactionCapabilityAction(
            {
                executionType: "transaction",
                kind: "claim-airdrop",
                amount: 100n,
                proof: ["0xabc123" as `0x${string}`],
            },
            { claimAirdrop, waitForTransactionConfirmation },
        );

        expect(claimAirdrop).toHaveBeenCalledWith(100n, ["0xabc123"]);
        expect(waitForTransactionConfirmation).toHaveBeenCalledWith(txHash);
    });

    it("dispatches vesting claims by variant", async () => {
        const claimVesting = vi.fn(async () => undefined);

        await executeTransactionCapabilityAction(
            {
                executionType: "transaction",
                kind: "claim-vesting",
                variant: "founder",
            },
            { claimVesting },
        );

        expect(claimVesting).toHaveBeenCalledWith("founder");
    });

    it("dispatches courier-process proof submissions with proof input", async () => {
        const submitCourierProcessSignalWithProof = vi.fn(async () => undefined);

        await executeTransactionCapabilityAction(
            {
                executionType: "transaction",
                kind: "submit-courier-process-signal-with-proof",
                orderHash: "delivery-order",
                eventType: "completed",
                roleOrderHash: "driver-order",
            },
            { submitCourierProcessSignalWithProof },
            {
                kind: "submit-courier-process-signal-with-proof",
                proof: {
                    band: 4,
                    nonce: "0xdeadbeef",
                    deviceSig: "0xcafebabe",
                },
            },
        );

        expect(submitCourierProcessSignalWithProof).toHaveBeenCalledWith(
            "delivery-order",
            "completed",
            {
                band: 4,
                nonce: "0xdeadbeef",
                deviceSig: "0xcafebabe",
            },
            "driver-order",
        );
    });

    it("rejects courier-process proof execution without proof input", async () => {
        await expect(executeTransactionCapabilityAction(
            {
                executionType: "transaction",
                kind: "submit-courier-process-signal-with-proof",
                orderHash: "delivery-order",
                eventType: "arrived-pickup",
            },
            {
                submitCourierProcessSignalWithProof: vi.fn(async () => undefined),
            },
        )).rejects.toThrow("Courier-process proof input is required.");
    });
});