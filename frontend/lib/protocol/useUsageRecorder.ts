"use client";

/**
 * useUsageRecorder — the usage-recording writes (protocol layer; the
 * UsageCounter is a protocol contract, not core, so its ABI stays out of
 * lib/kernel by the layer rule).
 *
 * Both calls are PERMISSIONLESS by design: UsageCounter re-verifies every
 * fact from state the chain already holds (order RESOLVED + merkle proof
 * against the signed agreementHash), so nothing about the caller is trusted.
 * The resolve capability plans these before the buyer resolves
 * (`planUsageRecords`, from the counter's own facts read by
 * `fetchClaimContext`) and sends them right after — count usage when it
 * happens.
 *
 * A write can meet three reverts: `AlreadyCounted` (the key was counted for
 * this process already), `ClauseOrAssemblyExcluded` (the counter's excluded
 * set) and `SellerNotStaked` (the live-stake gate). The plan leaves out the
 * excluded keys and repeats no key; each planned write is then SIMULATED here
 * first and sent only if the simulation passes, so none of the three is ever
 * sent — the wallet signs only writes the counter accepts. Anyone can redo a
 * missed one.
 */

import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import type { PublicClient } from "viem";
import { USAGE_COUNTER_ABI, fetchUsageClaimContext, type Agreement, type Commitment, type UsageClaimContext } from "@figaro-protocol/sdk";
import { getUsageCounter } from "@/lib/kernel/contracts";
import { activeChain } from "@/lib/shared/chains";

type Hex = `0x${string}`;

export function useUsageRecorder() {
    const { writeContractAsync } = useWriteContract();
    const publicClient = usePublicClient();
    const { address: account } = useAccount();
    const chainConfig = activeChain;

    // Fail loudly here — never let a malformed NEXT_PUBLIC_USAGE_COUNTER
    // reach a read or a write with a garbage address.
    const requireCounter = () => {
        const usageCounter = getUsageCounter();
        if (!usageCounter) throw new Error("UsageCounter address not configured (NEXT_PUBLIC_USAGE_COUNTER).");
        return usageCounter;
    };
    const requireClient = () => {
        if (!publicClient) throw new Error("No public client available to read the UsageCounter.");
        return publicClient;
    };

    /** The counter's facts about one agreement — its excluded keys and its
     *  provenance clause — read from the deployment being called. */
    const fetchClaimContext = (agreement: Agreement): Promise<UsageClaimContext> =>
        fetchUsageClaimContext(requireClient() as unknown as PublicClient, requireCounter(), agreement);

    const clauseUsageCall = (order: Commitment, clauseOrAssembly: Hex, sectionHash: Hex, proof: readonly Hex[]) => ({
        address: requireCounter(),
        abi: USAGE_COUNTER_ABI,
        functionName: "recordClauseUsage" as const,
        args: [order, clauseOrAssembly, sectionHash, [...proof]] as const,
        account,
    });
    const assemblyUsageCall = (order: Commitment, compositionHash: Hex, proof: readonly Hex[]) => ({
        address: requireCounter(),
        abi: USAGE_COUNTER_ABI,
        functionName: "recordAssemblyUsage" as const,
        args: [order, compositionHash, [...proof]] as const,
        account,
    });

    /** Throws the counter's revert when the write would not land. */
    const simulateClauseUsage = async (order: Commitment, clauseOrAssembly: Hex, sectionHash: Hex, proof: readonly Hex[]): Promise<void> => {
        await requireClient().simulateContract(clauseUsageCall(order, clauseOrAssembly, sectionHash, proof));
    };
    const simulateAssemblyUsage = async (order: Commitment, compositionHash: Hex, proof: readonly Hex[]): Promise<void> => {
        await requireClient().simulateContract(assemblyUsageCall(order, compositionHash, proof));
    };

    const recordClauseUsage = async (order: Commitment, clauseOrAssembly: Hex, sectionHash: Hex, proof: readonly Hex[]): Promise<Hex> =>
        writeContractAsync({ ...clauseUsageCall(order, clauseOrAssembly, sectionHash, proof), chain: chainConfig });

    const recordAssemblyUsage = async (order: Commitment, compositionHash: Hex, proof: readonly Hex[]): Promise<Hex> =>
        writeContractAsync({ ...assemblyUsageCall(order, compositionHash, proof), chain: chainConfig });

    return { fetchClaimContext, simulateClauseUsage, simulateAssemblyUsage, recordClauseUsage, recordAssemblyUsage };
}
