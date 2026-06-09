"use client";

import { useReadContract } from "wagmi";
import { useCommerce } from "./CommerceProvider";
import { useCommitmentFlow } from "@/lib/core/useCommitmentFlow";
import useTokenApproval from "@/hooks/core/useTokenApproval";
import useTokenDecimals from "@/hooks/core/useTokenDecimals";
import { ERC20_ABI, CONTRACTS } from "@/lib/core/contracts";
import { ZERO_ADDRESS } from "@/lib/shared/evm";
import type { CheckoutHandle } from "./types";

/**
 * Composite checkout hook — encapsulates every wagmi interaction needed to
 * go from "I know my token + amount" to "order placed."
 *
 * Replaces the pattern of importing 4-5 hooks + wagmi directly.
 *
 * @param token   The ERC-20 address used for payment
 * @param spender The contract that will pull funds (defaults to FigaroCore)
 */
export function useCheckout(
    token: `0x${string}`,
    spender: `0x${string}` = CONTRACTS.core,
): CheckoutHandle {
    const { address } = useCommerce();

    // ── Token metadata ──────────────────────────────────────────
    const { decimals } = useTokenDecimals(token);

    // ── Balance ─────────────────────────────────────────────────
    const { data: rawBalance } = useReadContract({
        address: token,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [(address ?? ZERO_ADDRESS) as `0x${string}`],
        query: { enabled: !!address },
    });
    const balance = (rawBalance as bigint | undefined) ?? undefined;

    // ── ERC-20 authorization ────────────────────────────────────
    const {
        needsApproval,
        approve,
        isApprovePending,
        isApproveConfirming,
        isApproveSuccess,
    } = useTokenApproval({
        tokenAddress: token,
        owner: address,
        spender,
    });

    // ── Order signing + broadcast ───────────────────────────────
    const {
        signCommitment,
        initiateAsParty,
        broadcast,
        payload,
        step: commitStep,
        error: commitError,
        reset,
    } = useCommitmentFlow();

    return {
        // Token state
        balance,
        decimals,

        // Authorization
        needsAuthorization: needsApproval,
        authorize: approve,
        authorization: {
            isPending: isApprovePending,
            isConfirming: isApproveConfirming,
            isSuccess: isApproveSuccess,
        },

        // Order flow
        signCommitment,
        initiateAsParty,
        broadcast,
        order: {
            step: commitStep,
            error: commitError,
            payload,
        },
        resetOrder: reset,
    };
}
