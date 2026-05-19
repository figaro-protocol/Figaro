"use client";

import { useAccount, useReadContract, useWriteContract, useWaitForTransactionReceipt } from "wagmi";
import { activeChain } from "@/lib/shared/chains";
import { formatToken } from "@/lib/shared/utils";
import { useState } from "react";
import {
    FIG_TOKEN_ABI,
    RPGF_MINTER_ABI,
    getFigToken,
    getRpgfMinter,
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

// ── RPGF minter: per-stage claim status ────────────────────────────────────

/** Returns true if `account` has already claimed stage `stageIndex`. */
export function useRpgfMinterClaimed(
    stageIndex: number,
    account: `0x${string}` | undefined,
) {
    const airdrop = getRpgfMinter();

    const { data: claimed } = useReadContract({
        address: airdrop ?? undefined,
        abi: RPGF_MINTER_ABI,
        functionName: "claimed",
        args: account ? [stageIndex, account] : undefined,
        query: { enabled: !!airdrop && !!account },
    });

    return (claimed as boolean | undefined) ?? false;
}

// ── RPGF minter: per-stage root and unlock time ────────────────────────────

/** Read the root, unlockTime, and totalAllocated for a given stage. */
export function useRpgfMinterStage(stageIndex: number) {
    const airdrop = getRpgfMinter();

    const { data } = useReadContract({
        address: airdrop ?? undefined,
        abi: RPGF_MINTER_ABI,
        functionName: "stages",
        args: [stageIndex],
        query: { enabled: !!airdrop },
    });

    // wagmi returns a tuple for struct/multi-return views.
    // RpgfMinter.stages returns (bytes32 root, uint64 unlockTime, uint256 totalAllocated).
    const tuple = data as [`0x${string}`, bigint, bigint] | undefined;
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
