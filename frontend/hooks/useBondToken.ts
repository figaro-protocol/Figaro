"use client";

import useTokenApproval from "@/hooks/useTokenApproval";
import useTokenDecimals from "@/hooks/useTokenDecimals";
import useTokenBalance from "@/hooks/useTokenBalance";

/**
 * useBondToken — what a wallet about to lock a bond reads of the bond's
 * token: its `decimals()` (`useTokenDecimals`), the owner's balance
 * (`useTokenBalance`, undefined until the chain answers) and the allowance
 * the spender holds, with the approval that raises it (`useTokenApproval`).
 * `spender` is the contract that pulls the bond: the contract of the
 * order's path, undefined until the path is known.
 */
export default function useBondToken(
    token: `0x${string}` | undefined,
    owner: `0x${string}` | undefined,
    spender: `0x${string}` | undefined,
) {
    const { decimals } = useTokenDecimals(token);
    const { read } = useTokenBalance(token, owner);
    const approval = useTokenApproval({ tokenAddress: token, owner, spender });
    return { decimals, balance: read.status === "present" ? read.value : undefined, ...approval };
}
