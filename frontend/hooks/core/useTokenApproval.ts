"use client";

import { useCallback, useEffect } from "react";
import { useReadContract, useWriteContract, useWaitForTransactionReceipt, useSignTypedData, useChainId } from "wagmi";
import { encodeFunctionData, parseSignature } from "viem";
import { ERC20_ABI } from "@/lib/core/contracts";

export interface PermitSignature {
    /** Token contract address — passed as `permitTarget` to `*WithPermit` functions. */
    target: `0x${string}`;
    /** ABI-encoded `permit(owner, spender, value, deadline, v, r, s)` calldata. */
    data: `0x${string}`;
}

function useTokenApproval({ tokenAddress, owner, spender }: { tokenAddress?: `0x${string}` | undefined; owner?: `0x${string}` | undefined; spender: `0x${string}` }) {
    const chainId = useChainId();

    const { data: allowance, refetch: refetchAllowance } = useReadContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: "allowance",
        args: [owner as `0x${string}`, spender],
        query: { enabled: !!owner && !!tokenAddress },
    });

    const { data: tokenNonce } = useReadContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: "nonces",
        args: [owner as `0x${string}`],
        query: { enabled: !!owner && !!tokenAddress },
    });

    const { data: tokenName } = useReadContract({
        address: tokenAddress,
        abi: ERC20_ABI,
        functionName: "name",
        query: { enabled: !!owner && !!tokenAddress },
    });

    const { writeContract: writeApprove, data: approveHash, isPending: isApprovePending } = useWriteContract();

    const { writeContract: writePermit, data: permitHash, isPending: isPermitPending } = useWriteContract();

    const { isLoading: isApproveConfirming, isSuccess: isApproveSuccess } = useWaitForTransactionReceipt({ hash: approveHash });
    const { isLoading: isPermitConfirming, isSuccess: isPermitSuccess } = useWaitForTransactionReceipt({ hash: permitHash });

    // Re-read the allowance once an approve or permit tx has been confirmed so
    // `needsApproval` reflects the updated on-chain state immediately.
    useEffect(() => {
        if (isApproveSuccess || isPermitSuccess) {
            refetchAllowance();
        }
    }, [isApproveSuccess, isPermitSuccess, refetchAllowance]);

    const { signTypedDataAsync } = useSignTypedData();

    const needsApproval = useCallback((amount?: bigint) => {
        if (!allowance) return true;
        if (!amount) return false;
        try {
            return (allowance as bigint) < amount;
        } catch (e) {
            return true;
        }
    }, [allowance]);

    const approve = useCallback((amount: bigint) => {
        if (!tokenAddress) return;
        return writeApprove({
            address: tokenAddress,
            abi: ERC20_ABI,
            functionName: "approve",
            args: [spender, amount],
        });
    }, [tokenAddress, spender, writeApprove]);

    // ── Shared EIP-2612 permit signing ─────────────────────────────
    const buildPermitTypedData = useCallback((amount: bigint) => {
        if (!owner) throw new Error("owner required for permit");
        const nonce = tokenNonce ? (tokenNonce as bigint) : 0n;
        const deadline = BigInt(Math.floor(Date.now() / 1000) + 60 * 60 * 24);

        const domain = {
            name: (tokenName as string) || "",
            version: "1",
            chainId,
            verifyingContract: tokenAddress,
        } as const;

        const types = {
            Permit: [
                { name: "owner", type: "address" },
                { name: "spender", type: "address" },
                { name: "value", type: "uint256" },
                { name: "nonce", type: "uint256" },
                { name: "deadline", type: "uint256" },
            ],
        } as const;

        const message = {
            owner: owner as `0x${string}`,
            spender,
            value: amount,
            nonce,
            deadline,
        };

        return { domain, types, message, deadline };
    }, [owner, tokenNonce, tokenName, chainId, tokenAddress, spender]);

    const signPermitRaw = useCallback(async (amount: bigint) => {
        const { domain, types, message, deadline } = buildPermitTypedData(amount);
        const sig = await signTypedDataAsync({ domain, types, primaryType: "Permit" as const, message });
        const { v, r, s } = parseSignature(sig);
        return { v: Number(v), r, s, deadline, owner: message.owner, amount };
    }, [buildPermitTypedData, signTypedDataAsync]);

    const permit = useCallback(async (amount: bigint) => {
        if (!tokenAddress) return;
        const { v, r, s, deadline, owner: ownerAddr } = await signPermitRaw(amount);
        return writePermit({
            address: tokenAddress,
            abi: ERC20_ABI,
            functionName: "permit",
            args: [ownerAddr, spender, amount, deadline, v, r, s],
        });
    }, [tokenAddress, spender, writePermit, signPermitRaw]);

    /**
     * Signs an EIP-2612 permit OFF-CHAIN (no gas, one MetaMask signature prompt)
     * and returns the encoded calldata ready to pass to `firstOrderWithPermit`,
     * `subOrderWithPermit`, or `acceptOfferWithPermit` as (permitTarget, permitData).
     *
     * If the user rejects the signature or the token does not support EIP-2612,
     * this will throw — callers should catch and fall back to `approve()`.
     */
    const signPermitForTx = useCallback(async (amount: bigint): Promise<PermitSignature> => {
        const { v, r, s, deadline, owner: ownerAddr } = await signPermitRaw(amount);

        const data = encodeFunctionData({
            abi: ERC20_ABI,
            functionName: "permit",
            args: [ownerAddr, spender, amount, deadline, v, r, s],
        }) as `0x${string}`;

        return { target: tokenAddress as `0x${string}`, data };
    }, [tokenAddress, spender, signPermitRaw]);

    /**
     * Signs an EIP-2612 permit OFF-CHAIN and returns raw PermitParams
        * suitable for passing directly to the live kernel's commit flow.
     */
    const signPermitParams = useCallback(async (amount: bigint): Promise<{
        value: bigint;
        deadline: bigint;
        v: number;
        r: `0x${string}`;
        s: `0x${string}`;
    }> => {
        const { v, r, s, deadline } = await signPermitRaw(amount);
        return { value: amount, deadline, v, r, s };
    }, [signPermitRaw]);

    /** True when the token has a `nonces()` function, indicating EIP-2612 support. */
    const supportsPermit = tokenNonce !== undefined;

    return {
        allowance,
        tokenNonce,
        tokenName,
        supportsPermit,
        needsApproval,
        approve,
        permit,
        signPermitForTx,
        signPermitParams,
        isApprovePending,
        isApproveConfirming,
        isApproveSuccess,
        isPermitPending,
        isPermitConfirming,
        isPermitSuccess,
        refetchAllowance,
    } as const;
}

export default useTokenApproval;
