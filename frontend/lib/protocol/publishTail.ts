"use client";

/**
 * publishTail — the shared tail every registry publish flow converges on
 * after its own pin + hash + deposit-read steps (their own comments said
 * "Mirrors X" — this is the X): simulate the write to surface a typed
 * revert BEFORE opening the wallet, submit via `writeContractAsync`, then
 * wait for the receipt and verify it landed `success`.
 *
 * Shared by `usePublishAssembly` (lib/designer/publishAssembly.ts),
 * `useRegisterClause` (lib/protocol/useClauseRegistry.ts), and
 * `usePublishMemberProfile` (lib/member/usePublishMemberProfile.ts). Each
 * flow keeps its own pinning steps and its own revert-message table; only
 * the simulate → write → verify sequence lives here once. Lives in
 * `lib/protocol/` (the precedent set by `createUseWithdrawStake` in
 * `useWithdrawStake.ts`, a cross-registry write helper at the same layer):
 * `lib/designer/` and `lib/member/` both already import from `lib/protocol/`,
 * and nothing in `lib/protocol/` imports from either, so this direction
 * introduces no cycle.
 */

import type { Abi } from "viem";
import { verifyTxSuccess } from "@/lib/shared/verifyTxSuccess";

interface ReceiptClient {
    waitForTransactionReceipt(args: { hash: `0x${string}` }): Promise<{ status: string }>;
}

interface SimulateClient extends ReceiptClient {
    simulateContract(config: {
        address: `0x${string}`;
        abi: Abi;
        functionName: string;
        args: readonly unknown[];
        value?: bigint;
        account: `0x${string}`;
    }): Promise<unknown>;
}

export interface PublishTailConfig {
    client: SimulateClient;
    writeContractAsync: (config: {
        address: `0x${string}`;
        abi: Abi;
        functionName: string;
        args: readonly unknown[];
        value?: bigint;
    }) => Promise<`0x${string}`>;
    address: `0x${string}`;
    abi: Abi;
    functionName: string;
    args: readonly unknown[];
    /** The ETH deposit accompanying the call; omit for a non-payable function. */
    value?: bigint;
    account: `0x${string}`;
    /** Maps a simulate-time revert to a user-facing Error — called only when
     *  `simulateContract` throws. */
    translateRevert: (err: unknown) => Error;
    /** Consequence text for a mined-but-reverted transaction. */
    failureMessage: string;
}

/** Simulate → write → verify. Returns the confirmed transaction hash; throws
 *  `translateRevert(err)` on a simulate-time revert, or the generic
 *  `verifyTxSuccess` error on a mined-but-reverted transaction. */
export async function publishTail(config: PublishTailConfig): Promise<`0x${string}`> {
    const { client, writeContractAsync, address, abi, functionName, args, value, account, translateRevert, failureMessage } = config;

    try {
        await client.simulateContract({ address, abi, functionName, args, value, account });
    } catch (err) {
        throw translateRevert(err);
    }

    const txHash = await writeContractAsync({ address, abi, functionName, args, value });
    await verifyTxSuccess(client, txHash, failureMessage);
    return txHash;
}
