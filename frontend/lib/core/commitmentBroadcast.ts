import type { CommitmentPayload } from "@/lib/core/useCommitmentFlow";

interface CommitmentBroadcaster {
    (payload: CommitmentPayload): Promise<`0x${string}` | undefined>;
}

interface CommitmentReceiptClient {
    waitForTransactionReceipt(args: { hash: `0x${string}` }): Promise<unknown>;
}

interface BroadcastSharedCommitmentOptions {
    payload: CommitmentPayload;
    broadcast: CommitmentBroadcaster;
    publicClient?: CommitmentReceiptClient | null;
    waitForReceipt?: boolean;
}

export async function broadcastSharedCommitment({
    payload,
    broadcast,
    publicClient,
    waitForReceipt = false,
}: BroadcastSharedCommitmentOptions): Promise<`0x${string}` | undefined> {
    const commitHash = await broadcast(payload);

    if (waitForReceipt && publicClient && commitHash) {
        await publicClient.waitForTransactionReceipt({ hash: commitHash });
    }

    return commitHash;
}