"use client";

import { useReadContract } from "wagmi";
import { hardhat } from "wagmi/chains";
import { parseAbi } from "viem";

const DECIMALS_ABI = parseAbi(["function decimals() view returns (uint8)"]);

export default function useTokenDecimals(tokenAddress?: `0x${string}`) {
    const { data, isLoading } = useReadContract({
        address: tokenAddress,
        abi: DECIMALS_ABI,
        functionName: "decimals",
        chainId: hardhat.id,
        query: { enabled: !!tokenAddress },
    });

    const decimals = data !== undefined && data !== null ? Number(data as number) : 18;
    return { decimals, loading: isLoading } as const;
}

