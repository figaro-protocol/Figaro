import type { PublicClient } from "viem";
import type { CommitmentPayloadMeta } from "@/lib/core/useCommitmentFlow";
import type { Commitment } from "@figaro/core";
import { submitPermitTransaction, type SignedPermitPayload } from "@/lib/core/permitExecution";

export interface PreparedCommitmentArtifact {
    commitment: Commitment;
    commitmentMeta?: CommitmentPayloadMeta;
}

export interface SubmitPreparedCommitmentArgs {
    prepared: PreparedCommitmentArtifact;
    proposerRole: "buyer" | "seller";
    buyerAddress: `0x${string}`;
    sellerAddress: `0x${string}`;
    immediateCommitEnabled: boolean;
    isE2EMock: boolean;
    permit?: SignedPermitPayload | null;
    sendTransaction?: (request: { to: `0x${string}`; data: `0x${string}` }) => Promise<`0x${string}`>;
    publicClient?: Pick<PublicClient, "waitForTransactionReceipt"> | null;
    waitForCommitReceipt?: boolean;
    initiateAsParty: (
        commitment: Commitment,
        role: "buyer" | "seller",
        meta?: CommitmentPayloadMeta,
    ) => Promise<unknown>;
    signAndBroadcastCommitment: (
        commitment: Commitment,
        meta?: CommitmentPayloadMeta,
        initiatorRole?: "buyer" | "seller",
    ) => Promise<`0x${string}` | undefined>;
}

export type SubmitPreparedCommitmentResult =
    | { mode: "shared" }
    | { mode: "broadcast"; hash?: `0x${string}` };

export async function submitPreparedCommitment({
    prepared,
    proposerRole,
    buyerAddress,
    sellerAddress,
    immediateCommitEnabled,
    isE2EMock,
    permit,
    sendTransaction,
    publicClient,
    waitForCommitReceipt = false,
    initiateAsParty,
    signAndBroadcastCommitment,
}: SubmitPreparedCommitmentArgs): Promise<SubmitPreparedCommitmentResult> {
    if (!isE2EMock && permit && sendTransaction) {
        await submitPermitTransaction({
            permit,
            sendTransaction,
            publicClient,
        });
    }

    if (immediateCommitEnabled || buyerAddress.toLowerCase() === sellerAddress.toLowerCase()) {
        const hash = await signAndBroadcastCommitment(
            prepared.commitment,
            prepared.commitmentMeta,
            proposerRole,
        );

        if (!isE2EMock && waitForCommitReceipt && hash && publicClient) {
            await publicClient.waitForTransactionReceipt({ hash });
        }

        return { mode: "broadcast", hash };
    }

    await initiateAsParty(prepared.commitment, proposerRole, prepared.commitmentMeta);
    return { mode: "shared" };
}