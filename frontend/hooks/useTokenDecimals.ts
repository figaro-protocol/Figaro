"use client";

import { useReadContract } from "wagmi";
import { ERC20_ABI } from "@/lib/kernel/contracts";

/**
 * The token's on-chain `decimals()`. The read runs on the CONNECTED chain — it
 * must NOT be pinned to a chainId (a hardcoded `hardhat.id` silently had no
 * transport on the Base-Sepolia deploy, so every non-18-decimal token fell back
 * to 18 and its bond/payment came out 10^decimals-delta wrong; it only worked
 * locally because localAnvil and hardhat share id 31337).
 *
 * `ready` distinguishes "resolved to 18" from "not yet resolved" — callers that
 * compute money amounts should gate on it rather than compute against the
 * fallback before the real value lands.
 */
export default function useTokenDecimals(tokenAddress?: `0x${string}`) {
    const { data, isLoading } = useReadContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: "decimals",
        query: { enabled: !!tokenAddress },
    });

    const ready = data !== undefined && data !== null;
    const decimals = ready ? Number(data as number) : 18;
    return { decimals, ready, loading: isLoading } as const;
}

