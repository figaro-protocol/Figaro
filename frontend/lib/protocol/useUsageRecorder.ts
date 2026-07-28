"use client";

/**
 * useUsageRecorder — the RPGF recording writes (protocol layer; the
 * UsageCounter is a protocol contract, not core, so its ABI stays out of
 * lib/kernel by the layer rule).
 *
 * Both calls are PERMISSIONLESS by design: UsageCounter re-verifies every
 * fact from state the chain already holds (order RESOLVED + merkle proof
 * against the signed agreementHash), so nothing about the caller is trusted.
 * The resolve capability fires these right after settlement — count usage
 * when it happens (ruled 2026-07-28). Best-effort by contract design: a
 * revert (AlreadyCounted, PairCapReached) is bookkeeping, not failure —
 * callers catch and move on, and anyone can redo a missed record.
 */

import { useAccount, useWriteContract } from "wagmi";
import { USAGE_COUNTER_ABI, type Commitment } from "@figaro/sdk";
import { CONTRACTS } from "@/lib/kernel/contracts";
import { activeChain } from "@/lib/shared/chains";

export function useUsageRecorder() {
    const { writeContractAsync } = useWriteContract();
    const { address: account } = useAccount();
    const chainConfig = activeChain;

    const recordUsage = async (
        order: Commitment,
        artifact: `0x${string}`,
        sectionData: `0x${string}`,
        proof: readonly `0x${string}`[],
    ): Promise<`0x${string}`> =>
        writeContractAsync({
            address: CONTRACTS.usageCounter as `0x${string}`,
            abi: USAGE_COUNTER_ABI,
            functionName: "recordUsage",
            args: [order, artifact, sectionData, [...proof]],
            account,
            chain: chainConfig,
        });

    const recordAssemblyUsage = async (
        order: Commitment,
        compositionHash: `0x${string}`,
        sectionData: `0x${string}`,
        proof: readonly `0x${string}`[],
    ): Promise<`0x${string}`> =>
        writeContractAsync({
            address: CONTRACTS.usageCounter as `0x${string}`,
            abi: USAGE_COUNTER_ABI,
            functionName: "recordAssemblyUsage",
            args: [order, compositionHash, sectionData, [...proof]],
            account,
            chain: chainConfig,
        });

    return { recordUsage, recordAssemblyUsage };
}
