"use client";

/**
 * usePayoutRoutingActions — broadcast a settled wallet's payout batch
 * through the composed public multisender (`payoutRouting.ts` owns the ABI
 * and leg vocabulary; `getMultisender` resolves the deployment).
 *
 * Same shape as `useSwapAndCommitActions` (simulate → write), with the one
 * extra step the aggregate token path needs: `disperseToken` pulls the batch
 * total via transferFrom, so an allowance below the total is topped up first
 * (approve → receipt → disperse). Each step waits its receipt and checks
 * status — a mined-but-reverted approve must surface, not flow on (the
 * publish-flow rule).
 */
import { useState } from "react";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import type { Hex } from "viem";
import { verifyTxSuccess } from "@/lib/shared/verifyTxSuccess";
import { ERC20_ABI } from "@/lib/kernel/contracts";
import { activeChain } from "@/lib/shared/chains";
import { getMultisender } from "@/lib/composition/contracts";
import { DISPERSE_ABI, payoutTotal, validatePayoutLegs, type PayoutLeg } from "@/lib/composition/payoutRouting";

export function usePayoutRoutingActions() {
    const { writeContractAsync } = useWriteContract();
    const { address: account } = useAccount();
    const publicClient = usePublicClient();
    const [isRouting, setIsRouting] = useState(false);

    const waitForSuccess = async (hash: Hex, label: string) => {
        if (!publicClient) return;
        await verifyTxSuccess(publicClient, hash, `${label} reverted on-chain.`);
    };

    /** Route `legs` of `token` through the multisender in one atomic batch.
     *  Returns the disperse transaction hash. */
    const routeTokenPayout = async (token: `0x${string}`, legs: readonly PayoutLeg[]): Promise<Hex> => {
        const multisender = getMultisender();
        if (!multisender) throw new Error("Multisender address is unconfigured — payout routing is unavailable.");
        const problem = validatePayoutLegs(legs);
        if (problem) throw new Error(problem);
        if (!publicClient || !account) throw new Error("Wallet not connected.");

        const total = payoutTotal(legs);
        setIsRouting(true);
        try {
            const allowance = await publicClient.readContract({
                address: token,
                abi: ERC20_ABI,
                functionName: "allowance",
                args: [account, multisender],
            }) as bigint;
            if (allowance < total) {
                const approveTx = await writeContractAsync({
                    address: token,
                    abi: ERC20_ABI,
                    functionName: "approve",
                    args: [multisender, total],
                    account,
                    chain: activeChain,
                });
                await waitForSuccess(approveTx, "Token approval");
            }

            const args = [token, legs.map((l) => l.recipient), legs.map((l) => l.amount)] as const;
            // Pre-flight dry-run: an over-balance batch or a reverting leg
            // surfaces BEFORE the wallet prompt opens.
            await publicClient.simulateContract({
                address: multisender,
                abi: DISPERSE_ABI,
                functionName: "disperseToken",
                args,
                account,
            });
            const tx = await writeContractAsync({
                address: multisender,
                abi: DISPERSE_ABI,
                functionName: "disperseToken",
                args,
                account,
                chain: activeChain,
            });
            await waitForSuccess(tx, "Payout routing");
            return tx;
        } finally {
            setIsRouting(false);
        }
    };

    return { routeTokenPayout, isRouting, isAvailable: !!getMultisender() && !!account };
}
