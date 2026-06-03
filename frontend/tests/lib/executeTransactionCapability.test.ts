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
            },
            { submitDisclosureCommitment },
        );

        expect(submitDisclosureCommitment).toHaveBeenCalledWith("root-order");
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

    it("dispatches courier-process proof submissions with the committed band", async () => {
        const submitCourierProcessSignalWithProof = vi.fn(async () => undefined);

        await executeTransactionCapabilityAction(
            {
                executionType: "transaction",
                kind: "submit-courier-process-signal-with-proof",
                orderHash: "delivery-order",
                eventType: "arrived-dropoff",
                band: 1,
                roleOrderHash: "driver-order",
            },
            { submitCourierProcessSignalWithProof },
        );

        // The proof is minted at the integration seam from the band the builder
        // read off the agreement — the action carries the band, no proof input.
        expect(submitCourierProcessSignalWithProof).toHaveBeenCalledWith(
            "delivery-order",
            "arrived-dropoff",
            1,
            "driver-order",
        );
    });

    it("dispatches buyer proximity-proof submissions with the committed band", async () => {
        const submitBuyerProximityProof = vi.fn(async () => undefined);

        await executeTransactionCapabilityAction(
            {
                executionType: "transaction",
                kind: "submit-buyer-proximity-proof",
                orderHash: "root-order",
                band: 2,
            },
            { submitBuyerProximityProof },
        );

        expect(submitBuyerProximityProof).toHaveBeenCalledWith("root-order", 2);
    });
});