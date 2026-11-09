"use client";

/**
 * useFundingMargin — the slippage margin a party sets for its swap-funded bond
 * leg, in the funding-token chooser (`SwapFundingPanel`), BEFORE the quote its
 * signature binds. The buyer sets it at checkout, the seller at /sign.
 *
 * The margin decides the cap the party authorizes (`maxInput` = the venue's
 * quote plus the margin, `capWithSlippage`), and the route (`swapData`) is
 * built from that cap; both reach the witness the party signs at the sign
 * step (`quoteFundingLeg`). The signing modal shows the margin and the cap
 * read-only, so what the party reviews is what it signs.
 *
 * It starts at the venue's own margin (`SwapVenue.slippageBps`: 1% on Uniswap
 * v3, 0 on the devnet venue) and is refused, never clamped, outside [0, 10%]
 * (`parseSlippagePercent`) or when the party's balance of the funding token
 * cannot cover the cap: the coordinator pulls the whole cap from the party
 * through Permit2 (`WitnessSwapAndCommitCoordinator._fund`), so a short
 * balance reverts the commit.
 */
import { useEffect, useState } from "react";
import { usePublicClient } from "wagmi";
import useTokenBalance from "@/hooks/useTokenBalance";
import useTokenDecimals from "@/hooks/useTokenDecimals";
import { capWithSlippage, formatSlippagePercent, parseSlippagePercent, type SwapVenueKind } from "@/lib/composition/swapVenue";
import { quoteFundingInput, resolveSwapFundingContracts } from "@/lib/composition/swapFunding";

export interface FundingMarginState {
    /** What the margin field shows: the party's text, else the venue's margin. */
    text: string;
    /** The margin in basis points; null while refused or the venue is unread. */
    bps: number | null;
    /** The venue's input quote for the bond now; null while unread. */
    quotedInput: bigint | null;
    /** The cap the margin yields over the quote; null while either is unknown. */
    maxInput: bigint | null;
    /** Why the margin is refused: outside [0, 10%], or beyond the balance. */
    refusal: "range" | "balance" | null;
}

/** The margin's state from what the party typed (`text`, null untouched), the
 *  venue's own margin, the quote and the party's balance (null while unread:
 *  an unread figure refuses nothing). */
export function fundingMargin({
    text,
    defaultBps,
    quotedInput,
    balance,
}: {
    text: string | null;
    defaultBps: number | null;
    quotedInput: bigint | null;
    balance: bigint | null;
}): FundingMarginState {
    const shown = text ?? (defaultBps === null ? "" : formatSlippagePercent(defaultBps));
    if (text === null && defaultBps === null) {
        return { text: shown, bps: null, quotedInput, maxInput: null, refusal: null };
    }
    const bps = parseSlippagePercent(shown);
    if (bps === null) return { text: shown, bps: null, quotedInput, maxInput: null, refusal: "range" };
    const maxInput = quotedInput === null ? null : capWithSlippage(quotedInput, bps);
    const short = maxInput !== null && balance !== null && balance < maxInput;
    return { text: shown, bps, quotedInput, maxInput, refusal: short ? "balance" : null };
}

/** Whether the act beside the chooser (place order, counter-sign) waits. */
export function marginBlocksTheAct(margin: FundingMarginState): boolean {
    return margin.refusal !== null;
}

/** The margin field's state for the panel: the state, the venue, the funding
 *  token's units, and the edit handler. */
export interface FundingMarginField extends FundingMarginState {
    venue: SwapVenueKind | null;
    decimals: number | undefined;
    symbol: string;
    onChange: (text: string) => void;
}

/** The margin's hook. Like `useSwapFunding().authorizationFor(bond)`, the
 *  bond is given per render through `marginFor(bond)`, because the checkout
 *  page knows it only below its early returns, where no hook may run. */
export function useFundingMargin({
    party,
    currency,
    fundingToken,
    fundingSymbol,
}: {
    /** The wallet funding its bond. */
    party: `0x${string}` | undefined;
    /** The process denomination the swap must yield. */
    currency: `0x${string}` | undefined;
    /** The chosen funding token; null while none is chosen. */
    fundingToken: `0x${string}` | null;
    fundingSymbol: string;
}): { marginFor: (bond: bigint | null) => FundingMarginField } {
    const publicClient = usePublicClient();
    const router = resolveSwapFundingContracts()?.router;
    const [text, setText] = useState<string | null>(null);
    // The bond the last render asked about — the exact output the venue quotes for.
    const [bond, setBond] = useState<bigint | null>(null);
    const [quote, setQuote] = useState<{ key: string; venue: SwapVenueKind; slippageBps: number; quotedInput: bigint } | null>(null);
    const keyOf = (b: bigint | null) => (fundingToken && currency && b !== null && b > 0n ? `${fundingToken}:${currency}:${b}` : null);
    const key = keyOf(bond);

    useEffect(() => {
        if (!key || !publicClient || !router || !fundingToken || !currency || bond === null) return;
        let canceled = false;
        quoteFundingInput(publicClient, router, { inputToken: fundingToken, currency, bondAmount: bond })
            .then((q) => { if (!canceled) setQuote({ key, ...q }); })
            // A venue that cannot quote shows no cap; the sign step quotes
            // again and names its own failure.
            .catch(() => { if (!canceled) setQuote(null); });
        return () => { canceled = true; };
    }, [key, publicClient, router, fundingToken, currency, bond]);

    const { decimals } = useTokenDecimals(fundingToken ?? undefined);
    const { read: balance } = useTokenBalance(fundingToken ?? undefined, party);

    const marginFor = (asked: bigint | null): FundingMarginField => {
        // Adjusting state from a value known only at render: React re-renders
        // this component at once with the new bond, and the effect quotes it.
        if (asked !== bond) setBond(asked);
        const askedKey = keyOf(asked);
        const current = quote && askedKey && quote.key === askedKey ? quote : null;
        const state = fundingMargin({
            text,
            defaultBps: current?.slippageBps ?? null,
            quotedInput: current?.quotedInput ?? null,
            balance: balance.status === "present" ? balance.value : null,
        });
        return { ...state, venue: current?.venue ?? null, decimals, symbol: fundingSymbol, onChange: setText };
    };
    return { marginFor };
}
