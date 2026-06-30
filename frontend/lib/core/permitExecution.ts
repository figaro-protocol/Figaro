import type { PublicClient } from "viem";

interface SignedPermitPayload {
    target: `0x${string}`;
    data: `0x${string}`;
}

interface SubmitPermitTransactionArgs {
    permit: SignedPermitPayload;
    sendTransaction: (request: { to: `0x${string}`; data: `0x${string}` }) => Promise<`0x${string}`>;
    publicClient?: Pick<PublicClient, "waitForTransactionReceipt"> | null;
}

export async function submitPermitTransaction({
    permit,
    sendTransaction,
    publicClient,
}: SubmitPermitTransactionArgs): Promise<`0x${string}`> {
    const hash = await sendTransaction({
        to: permit.target,
        data: permit.data,
    });

    if (publicClient) {
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success") {
            throw new Error(`Permit transaction reverted on-chain (tx ${hash}).`);
        }
    }

    return hash;
}