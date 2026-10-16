"use client";

/**
 * useUsageRecorder — the usage-recording writes (protocol layer; the
 * UsageCounter is a protocol contract, not core, so its ABI stays out of
 * lib/kernel by the layer rule).
 *
 * The three calls — a clause, a registered agreement, an assembly — are
 * PERMISSIONLESS by design: UsageCounter re-verifies every fact from state
 * the chain already holds (order RESOLVED + merkle proof against the signed
 * agreementHash; for an assembly, the agreement's membership under its
 * composition root too), so nothing about the caller is trusted.
 * The resolve capability plans these before the buyer resolves
 * (`planUsageRecords`, from the counter's own facts read by
 * `fetchClaimContext`) and sends them right after — count usage when it
 * happens.
 *
 * A write can meet the counter's reverts — `AlreadyCounted` (the key was
 * counted for this process already) and `SellerNotStaked` (the live-stake
 * gate) among them. The plan repeats no key; each planned write is then
 * SIMULATED here first and sent only if the simulation passes, so no revert
 * is ever sent — the wallet signs only writes the counter accepts. Anyone can
 * redo a missed one.
 */

import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import type { PublicClient } from "viem";
import { USAGE_COUNTER_ABI, fetchUsageClaimContext, type Commitment, type UsageClaimContext } from "@figaro-protocol/sdk";
import { getUsageCounter } from "@/lib/kernel/contracts";
import { activeChain } from "@/lib/shared/chains";

type Hex = `0x${string}`;

/** One usage write, by the family it credits — the counter's three entry
 *  points. `proof` is the provenance leaf's (agreement, assembly) or the
 *  clause leaf's (clause) sorted-pair proof under the order's agreementHash. */
export type UsageWrite =
    | {
          kind: "clause";
          order: Commitment;
          /** The clause key the clause carries. */
          key: Hex;
          /** The clause FINGERPRINT — only it reaches calldata, never the
           *  plaintext, so a private clause stays off-chain. */
          clauseDataHash: Hex;
          proof: readonly Hex[];
      }
    | {
          kind: "agreement";
          order: Commitment;
          /** The registered agreement's key (`AgreementRegistry`). */
          key: Hex;
          /** The composition root the provenance leaf names beside it. */
          compositionHash: Hex;
          proof: readonly Hex[];
      }
    | {
          kind: "assembly";
          order: Commitment;
          /** The assembly's compositionHash. */
          key: Hex;
          /** The agreement's agreement key and the hash of its entry bytes. */
          agreementKey: Hex;
          slotContentHash: Hex;
          proof: readonly Hex[];
          /** The agreement leaf's proof under `key`. */
          membershipProof: readonly Hex[];
      };

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

    /** The counter's facts — its provenance and assembly-terms leaf keys —
     *  read once from the deployment being called; they serve every order of
     *  the process. */
    const fetchClaimContext = (): Promise<UsageClaimContext> =>
        fetchUsageClaimContext(requireClient() as unknown as PublicClient, requireCounter());

    const usageCall = (write: UsageWrite) => {
        const base = { address: requireCounter(), abi: USAGE_COUNTER_ABI, account } as const;
        switch (write.kind) {
            case "clause":
                return { ...base, functionName: "recordClauseUsage" as const, args: [write.order, write.key, write.clauseDataHash, [...write.proof]] as const };
            case "agreement":
                return { ...base, functionName: "recordAgreementUsage" as const, args: [write.order, write.key, write.compositionHash, [...write.proof]] as const };
            case "assembly":
                return {
                    ...base,
                    functionName: "recordAssemblyUsage" as const,
                    args: [write.order, write.key, write.agreementKey, write.slotContentHash, [...write.proof], [...write.membershipProof]] as const,
                };
        }
    };

    // The three calls are one union; viem types each call by its function
    // name, so the union is handed over as the call it is.
    /** Throws the counter's revert when the write would not land. */
    const simulateUsage = async (write: UsageWrite): Promise<void> => {
        await requireClient().simulateContract(usageCall(write) as never);
    };

    const recordUsage = async (write: UsageWrite): Promise<Hex> =>
        writeContractAsync({ ...usageCall(write), chain: chainConfig } as never);

    return { fetchClaimContext, simulateUsage, recordUsage };
}
