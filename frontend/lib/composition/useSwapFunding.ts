"use client";

/**
 * useSwapFunding — a party's swap-funded bond leg, the wiring both funding
 * surfaces share: the buyer at checkout (candidates = the seller's accepted
 * tokens) and the seller at /sign (candidates = its own accepted tokens).
 *
 * It holds the funding-token choice, the candidate set (the party's
 * `acceptedTokens` minus the process denomination, empty where the swap
 * composition — coordinator + Permit2 + venue — is unconfigured or no party
 * is known), the Permit2 authorization of the chosen token for exactly the
 * swap's signed maximum input (the cap, in the funding token's units, never
 * the bond, which is in the process's token), and where that authorization
 * stands against a cap (`authorizationFor`). The
 * panel (`SwapFundingPanel`) renders it; the witness-signed leg itself is
 * built at sign / accept (`lib/checkout/orderCommitmentFlow`).
 */
import { useMemo, useState } from "react";
import useTokenApproval from "@/hooks/useTokenApproval";
import { hexEqual, ZERO_ADDRESS } from "@/lib/shared/evm";
import { resolveSwapFundingContracts } from "@/lib/composition/swapFunding";
import type { AcceptedTokenMetadata } from "@/lib/member/acceptedTokenMetadata";

/**
 * Where a chosen funding token stands with Permit2 — derived once, read by the
 * panel and by the action beside it (place order, counter-sign):
 *
 *   none        no funding token is chosen
 *   reading     the allowance has not been read yet, or is being read again
 *               (after an approval's receipt the value in hand is stale)
 *   needed      the allowance is known and short of the cap
 *   authorizing the approval is pending or confirming
 *   ready       the allowance is known and covers the cap
 *
 * A commit with a funding leg pulls the token through Permit2, so anything but
 * `none` or `ready` would broadcast a commit that reverts.
 */
export type FundingAuthorization = "none" | "reading" | "needed" | "authorizing" | "ready";

export function fundingAuthorization({
    fundingToken,
    allowanceKnown,
    needsApproval,
    isAuthorizing,
}: {
    fundingToken: `0x${string}` | null;
    /** The allowance in hand is current: read, and not being read again. */
    allowanceKnown: boolean;
    /** The allowance last read is short of the cap. */
    needsApproval: boolean;
    /** The approval transaction is pending or confirming. */
    isAuthorizing: boolean;
}): FundingAuthorization {
    if (!fundingToken) return "none";
    if (isAuthorizing) return "authorizing";
    if (!allowanceKnown) return "reading";
    return needsApproval ? "needed" : "ready";
}

/** Whether the action beside the panel must wait: a chosen funding token that
 *  is not yet authorized. */
export function fundingBlocksTheAct(authorization: FundingAuthorization): boolean {
    return authorization !== "none" && authorization !== "ready";
}

export function useSwapFunding({
    party,
    currency,
    acceptedTokens,
}: {
    /** The wallet funding its bond; undefined while unknown (no candidates). */
    party: `0x${string}` | undefined;
    /** The process denomination the swap must yield. */
    currency: `0x${string}` | undefined;
    /** The accepted tokens the candidates are drawn from. */
    acceptedTokens: readonly AcceptedTokenMetadata[] | undefined;
}) {
    const contracts = resolveSwapFundingContracts();
    const configured = !!contracts;
    const candidates = useMemo(
        () => (configured && currency && party
            ? (acceptedTokens ?? []).filter((t) => !hexEqual(t.address, currency))
            : []),
        [configured, currency, party, acceptedTokens],
    );
    const [fundingToken, setFundingToken] = useState<`0x${string}` | null>(null);
    const permit2 = useTokenApproval({
        tokenAddress: fundingToken ?? undefined,
        owner: party,
        spender: (contracts?.permit2 ?? ZERO_ADDRESS) as `0x${string}`,
    });
    /** Where the chosen token stands with Permit2 against `cap` (the swap's
     *  maximum input, in the funding token's units); a cap not yet known is
     *  never covered. */
    const authorizationFor = (cap: bigint | null): FundingAuthorization => fundingAuthorization({
        fundingToken,
        // Until the cap is known there is nothing to cover it against, so the
        // authorization reads as still being read, never as ready.
        allowanceKnown: cap !== null && permit2.allowanceKnown && !permit2.isAllowanceRefetching,
        needsApproval: cap !== null && permit2.needsApproval(cap),
        isAuthorizing: permit2.isApprovePending || permit2.isApproveConfirming,
    });
    return {
        /** The swap composition's addresses, or null where it is unconfigured. */
        contracts,
        candidates,
        fundingToken,
        setFundingToken,
        authorizationFor,
        /** The allowance the party gave Permit2 on the chosen token, in that token's units. */
        allowance: permit2.allowance as bigint | undefined,
        /** Send the chosen token's Permit2 approval for exactly `cap`, the
         *  signed maximum input of this swap; nothing for a cap not yet known. */
        authorize: (cap: bigint | null) => (cap ? permit2.approve(cap) : undefined),
        /** The approval was refused by the wallet or reverted. */
        authorizeFailed: permit2.isApproveError,
    };
}
