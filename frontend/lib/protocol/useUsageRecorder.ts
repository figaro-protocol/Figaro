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
 * revert (AlreadyCounted) is bookkeeping, not failure —
 * callers catch and move on, and anyone can redo a missed record.
 */

import { useAccount, useWriteContract } from "wagmi";
import { USAGE_COUNTER_ABI, type Commitment } from "@figaro/sdk";
import { getUsageCounter } from "@/lib/kernel/contracts";
import { activeChain } from "@/lib/shared/chains";

export function useUsageRecorder() {
    const { writeContractAsync } = useWriteContract();
    const { address: account } = useAccount();
    const chainConfig = activeChain;

    const recordClauseUsage = async (
        order: Commitment,
        clauseOrAssembly: `0x${string}`,
        sectionHash: `0x${string}`,
        proof: readonly `0x${string}`[],
    ): Promise<`0x${string}`> => {
        const usageCounter = getUsageCounter();
        // Fail loudly here — never let a malformed NEXT_PUBLIC_USAGE_COUNTER
        // reach writeContractAsync with a garbage address.
        if (!usageCounter) throw new Error("UsageCounter address not configured (NEXT_PUBLIC_USAGE_COUNTER).");
        return writeContractAsync({
            address: usageCounter,
            abi: USAGE_COUNTER_ABI,
            functionName: "recordClauseUsage",
            args: [order, clauseOrAssembly, sectionHash, [...proof]],
            account,
            chain: chainConfig,
        });
    };

    const recordAssemblyUsage = async (
        order: Commitment,
        compositionHash: `0x${string}`,
        proof: readonly `0x${string}`[],
    ): Promise<`0x${string}`> => {
        const usageCounter = getUsageCounter();
        if (!usageCounter) throw new Error("UsageCounter address not configured (NEXT_PUBLIC_USAGE_COUNTER).");
        return writeContractAsync({
            address: usageCounter,
            abi: USAGE_COUNTER_ABI,
            functionName: "recordAssemblyUsage",
            args: [order, compositionHash, [...proof]],
            account,
            chain: chainConfig,
        });
    };

    return { recordClauseUsage, recordAssemblyUsage };
}
