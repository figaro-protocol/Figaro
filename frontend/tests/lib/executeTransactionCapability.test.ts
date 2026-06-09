import { describe, expect, it, vi } from "vitest";
import { executeTransactionCapabilityAction } from "@/lib/semantic/executeTransactionCapability";

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

    it("dispatches a generic clause attestation, passing the whole action through", async () => {
        const submitClauseAttestation = vi.fn(async () => undefined);
        const action = {
            executionType: "transaction" as const,
            kind: "submit-clause-attestation" as const,
            orderHash: "merchant-order",
            clauseId: "figaro-merchant-process-v1",
            stage: 2,
            eventCode: "handed-off",
            ladderField: "eventType",
            party: "seller" as const,
        };

        await executeTransactionCapabilityAction(action, { submitClauseAttestation });

        // The descriptor is the single source — the executor encodes content from
        // the clause spec and routes to seller/buyer by `party`.
        expect(submitClauseAttestation).toHaveBeenCalledWith(action);
    });
});