"use client";

import { useReadContract } from "wagmi";
import { ERC20_ABI } from "@/lib/core/contracts";
import { queryRead, type NetworkRead } from "@/lib/shared/networkRead";

/**
 * useTokenBalance — the ONE ERC-20 `balanceOf(owner)` read. Every surface that
 * shows or gates on a wallet's token balance (checkout, the bond
 * authorization, the funding-token options, the counter-signer's
 * denomination, the florin balance) reads through here, on the CONNECTED
 * chain.
 *
 * The read is a `NetworkRead<bigint>`: `pending` while in flight or while
 * the token or owner is not known yet, `absent` when the read failed (a
 * surface renders nothing for it), `present` with the balance the chain
 * returned. `refetch` reads it again (after an act that moved the balance).
 */
export default function useTokenBalance(
    tokenAddress: `0x${string}` | undefined,
    owner: `0x${string}` | undefined,
): { read: NetworkRead<bigint>; refetch: () => void } {
    const query = useReadContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: owner ? [owner] : undefined,
        query: { enabled: !!tokenAddress && !!owner },
    });
    return {
        read: queryRead({ status: query.status, data: query.data as bigint | undefined }),
        refetch: () => void query.refetch(),
    };
}
