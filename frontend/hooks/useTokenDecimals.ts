"use client";

import { useReadContract } from "wagmi";
import { ERC20_ABI } from "@/lib/kernel/contracts";

/**
 * The token's on-chain `decimals()`. The read runs on the CONNECTED chain — it
 * must NOT be pinned to a chainId (a hardcoded `hardhat.id` silently had no
 * transport on a public-testnet deploy, so every non-18-decimal token fell back
 * to 18 and its bond/payment came out 10^decimals-delta wrong; it only worked
 * locally because localAnvil and hardhat share id 31337).
 *
 * `decimals` is undefined until the chain has answered: a caller waits for it and
 * never computes or renders an amount against a stand-in. `ready` says the same
 * as `decimals !== undefined`.
 */
export default function useTokenDecimals(tokenAddress?: `0x${string}`) {
    const { data, isLoading } = useReadContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: "decimals",
        query: { enabled: !!tokenAddress },
    });

    const ready = data !== undefined && data !== null;
    const decimals = ready ? Number(data as number) : undefined;
    return { decimals, ready, loading: isLoading } as const;
}

