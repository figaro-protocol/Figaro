"use client";

import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { activeChain } from "@/lib/shared/chains";
import { formatToken } from "@/lib/shared/utils";
import { useState } from "react";
import {
    FIG_TOKEN_ABI,
    STAGED_MERKLE_AIRDROP_ABI,
    getFigToken,
    getStagedAirdrop,
} from "@/lib/mechanisms/contracts";
import { extractErrorMessage } from "@/lib/shared/errors";

// ── Token metrics (read-only, global) ────────────────────────────────────────

export function useFigTokenMetrics() {
    const fig = getFigToken();

    const { data: totalSupply } = useReadContract({
        address: fig ?? undefined,
        abi: FIG_TOKEN_ABI,
        functionName: "totalSupply",
        query: { enabled: !!fig },
    });

    const { data: deployerMintRenounced } = useReadContract({
        address: fig ?? undefined,
        abi: FIG_TOKEN_ABI,
        functionName: "deployerMintRenounced",
        query: { enabled: !!fig },
    });

    return {
        totalSupply: (totalSupply as bigint | undefined) ?? 0n,
        deployerMintRenounced: (deployerMintRenounced as boolean | undefined) ?? false,
        available: !!fig,
    };
}

// ── Staged airdrop: per-stage claim action ──────────────────────────────────

/** Claim the allocation for a specific airdrop stage (0=yr2, 1=yr5, 2=yr9). */
export function useStagedAirdropClaim(stageIndex: number) {
    const airdrop = getStagedAirdrop();
    const { address } = useAccount();
    const chain = activeChain;
    const [error, setError] = useState("");

    const { writeContractAsync, data: hash, isPending } = useWriteContract();
    const { isLoading: isConfirming, isSuccess } = useWaitForTransactionReceipt({ hash });

    const claim = async (amount: bigint, proof: `0x${string}`[]) => {
        if (!airdrop) return;
        setError("");
        try {
            return await writeContractAsync({
                address: airdrop,
                abi: STAGED_MERKLE_AIRDROP_ABI,
                functionName: "claim",
                args: [stageIndex, amount, proof],
                account: address,
                chain,
            });
        } catch (e: unknown) {
            setError(extractErrorMessage(e, "Airdrop claim failed"));
        }
    };

    return { claim, error, isPending, isConfirming, isSuccess, available: !!airdrop };
}

// ── Staged airdrop: per-stage claim status ─────────────────────────────────

/** Returns true if `account` has already claimed stage `stageIndex`. */
export function useStagedAirdropClaimed(
    stageIndex: number,
    account: `0x${string}` | undefined,
) {
    const airdrop = getStagedAirdrop();

    const { data: claimed } = useReadContract({
        address: airdrop ?? undefined,
        abi: STAGED_MERKLE_AIRDROP_ABI,
        functionName: "claimed",
        args: account ? [stageIndex, account] : undefined,
        query: { enabled: !!airdrop && !!account },
    });

    return (claimed as boolean | undefined) ?? false;
}

// ── Staged airdrop: per-stage root and unlock time ─────────────────────────

/** Read the root and unlockTime for a given stage. */
export function useStagedAirdropStage(stageIndex: number) {
    const airdrop = getStagedAirdrop();

    const { data } = useReadContract({
        address: airdrop ?? undefined,
        abi: STAGED_MERKLE_AIRDROP_ABI,
        functionName: "stages",
        args: [stageIndex],
        query: { enabled: !!airdrop },
    });

    // wagmi returns a tuple for struct/multi-return views
    const tuple = data as [`0x${string}`, bigint] | undefined;
    const root = tuple?.[0];
    const unlockTime = tuple?.[1];

    const now = BigInt(Math.floor(Date.now() / 1000));
    const isUnlocked =
        unlockTime !== undefined && unlockTime > 0n && now >= unlockTime;

    return {
        root: root ?? null,
        unlockTime: unlockTime ?? 0n,
        isUnlocked,
        available: !!airdrop,
    };
}

// ── User FIG balance ─────────────────────────────────────────────────────────

export function useFigBalance() {
    const { address } = useAccount();
    const fig = getFigToken();

    const { data: balance, refetch } = useReadContract({
        address: fig ?? undefined,
        abi: FIG_TOKEN_ABI,
        functionName: "balanceOf",
        args: address ? [address] : undefined,
        query: { enabled: !!fig && !!address },
    });

    return {
        balance: (balance as bigint | undefined) ?? 0n,
        refetch,
    };
}

// ── Format helper ────────────────────────────────────────────────────────────

export function formatFig(value: bigint): string {
    const s = formatToken(value);
    const n = parseFloat(s);
    if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
    if (n >= 1_000) return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
    return s.slice(0, 12);
}
