"use client";

/**
 * useTokenSymbol — the ONE ERC-20 `symbol()` read hook. Any surface naming
 * a token (checkout totals, settlement proceeds, the wizard's token input,
 * seller detail) reads through here; an invalid address disables the query
 * rather than firing a doomed call.
 */
import { useReadContract } from "wagmi";
import { isValidAddress } from "@/lib/shared/evm";
import { ERC20_ABI } from "@/lib/kernel/contracts";

export function useTokenSymbol(address: string) {
    const addr = isValidAddress(address) ? (address as `0x${string}`) : undefined;
    return useReadContract({
        address: addr,
        abi: ERC20_ABI,
        functionName: "symbol",
        query: { enabled: !!addr },
    });
}
