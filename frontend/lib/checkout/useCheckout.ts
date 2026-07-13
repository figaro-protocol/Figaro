"use client";

import { useCallback, useState } from "react";
import { useReadContract } from "wagmi";
import { useCommerce } from "./CommerceProvider";
import { useOrderCommitmentFlow } from "@/lib/checkout/orderCommitmentFlow";
import type { OrderPreview } from "@/lib/checkout/orderPreview";
import type { CommitmentPayload } from "@figaro/sdk/agent";
import useTokenApproval from "@/hooks/useTokenApproval";
import useTokenDecimals from "@/hooks/useTokenDecimals";
import { ERC20_ABI, CONTRACTS } from "@/lib/kernel/contracts";
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
    token: `0x${string}` | undefined,
    spender: `0x${string}` = CONTRACTS.core,
): CheckoutHandle {
    const { address } = useCommerce();

    // ── Token metadata ──────────────────────────────────────────
    // `decimalsReady` distinguishes the real on-chain value from the 18-default
    // fallback — checkout must not price an order against the fallback before
    // the token's true decimals land (a non-18-decimal token would misprice).
    const { decimals, ready: decimalsReady } = useTokenDecimals(token);

    // ── Balance ─────────────────────────────────────────────────
    const { data: rawBalance } = useReadContract({
        address: token,
        abi: ERC20_ABI,
        functionName: "balanceOf",
        args: [(address ?? ZERO_ADDRESS) as `0x${string}`],
        query: { enabled: !!address && !!token },
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

    // ── Order signing (the order* path) ─────────────────────────
    // The root order's signed payload is held here so the share panel can
    // render it; sub-orders sign + relay through the flow directly and never
    // touch this state.
    const {
        signCommitment,
        signAndShare,
        step: commitStep,
        error: commitError,
        reset,
    } = useOrderCommitmentFlow();
    const [payload, setPayload] = useState<CommitmentPayload | null>(null);

    // Sign the ROOT and surface its payload to the share panel — the buyer
    // relays it from there. No auto-relay (that is `signAndShare`, for subs).
    const signRoot = useCallback(async (preview: OrderPreview): Promise<CommitmentPayload> => {
        const p = await signCommitment(preview);
        setPayload(p);
        return p;
    }, [signCommitment]);

    const resetOrder = useCallback(() => {
        reset();
        setPayload(null);
    }, [reset]);

    return {
        // Token state
        balance,
        decimals,
        decimalsReady,

        // Authorization
        needsAuthorization: needsApproval,
        authorize: approve,
        authorization: {
            isPending: isApprovePending,
            isConfirming: isApproveConfirming,
            isSuccess: isApproveSuccess,
        },

        // Order flow
        signRoot,
        signAndShare,
        order: {
            step: commitStep,
            error: commitError,
            payload,
        },
        resetOrder,
    };
}
