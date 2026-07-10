"use client";

import { useReadContract } from "wagmi";
import { hardhat } from "wagmi/chains";
import { ERC20_ABI } from "@/lib/kernel/contracts";

export default function useTokenDecimals(tokenAddress?: `0x${string}`) {
    const { data, isLoading } = useReadContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: "decimals",
        chainId: hardhat.id,
        query: { enabled: !!tokenAddress },
    });

    const decimals = data !== undefined && data !== null ? Number(data as number) : 18;
    return { decimals, loading: isLoading } as const;
}

