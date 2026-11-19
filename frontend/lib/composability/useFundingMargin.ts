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
import { capWithSlippage, formatSlippagePercent, parseSlippagePercent, type SwapVenueKind } from "@/lib/composability/swapVenue";
import { quoteFundingInput, resolveSwapFundingContracts } from "@/lib/composability/swapFunding";

export interface FundingMarginState {
    /** What the margin field shows: the party's text, else the venue's margin. */
    text: string;
    /** The margin in basis points; null while refused or the venue is unread. */
    bps: number | null;
    /** The venue's input quote for the bond now, summed over the legs; null
     *  while unread. */
    quotedInput: bigint | null;
    /** The cap the margin yields: each leg's quote with the margin, rounded
     *  up as `quoteFundingLeg` rounds it, summed over the legs, since each
     *  swap pulls its own cap from the one allowance; null while either is
     *  unknown. */
    maxInput: bigint | null;
    /** Why the margin is refused: outside [0, 10%], or beyond the balance. */
    refusal: "range" | "balance" | null;
}

/** The margin's state from what the party typed (`text`, null untouched), the
 *  venue's own margin, the quote — one per swap leg, or a single figure for
 *  one leg — and the party's balance (null while unread: an unread figure
 *  refuses nothing). */
export function fundingMargin({
    text,
    defaultBps,
    quotedInput,
    balance,
}: {
    text: string | null;
    defaultBps: number | null;
    quotedInput: bigint | readonly bigint[] | null;
    balance: bigint | null;
}): FundingMarginState {
    const legs = quotedInput === null ? null : typeof quotedInput === "bigint" ? [quotedInput] : quotedInput;
    const quoted = legs === null ? null : legs.reduce((sum, q) => sum + q, 0n);
    const shown = text ?? (defaultBps === null ? "" : formatSlippagePercent(defaultBps));
    if (text === null && defaultBps === null) {
        return { text: shown, bps: null, quotedInput: quoted, maxInput: null, refusal: null };
    }
    const bps = parseSlippagePercent(shown);
    if (bps === null) return { text: shown, bps: null, quotedInput: quoted, maxInput: null, refusal: "range" };
    const maxInput = legs === null ? null : legs.reduce((sum, q) => sum + capWithSlippage(q, bps), 0n);
    const short = maxInput !== null && balance !== null && balance < maxInput;
    return { text: shown, bps, quotedInput: quoted, maxInput, refusal: short ? "balance" : null };
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

/** The bonds `marginFor` was asked about, each a swap leg: one figure, a list
 *  (one per order of a checkout), or null while unknown. A bond of zero
 *  takes no swap. */
type AskedBonds = bigint | readonly bigint[] | null;

function legBonds(asked: AskedBonds): bigint[] | null {
    if (asked === null) return null;
    const legs = (typeof asked === "bigint" ? [asked] : [...asked]).filter((b) => b > 0n);
    return legs.length > 0 ? legs : null;
}

/** The margin's hook. Like `useSwapFunding().authorizationFor(bond)`, the
 *  bond is given per render through `marginFor(bonds)`, because the checkout
 *  page knows it only below its early returns, where no hook may run. The
 *  venue quotes each leg's bond on its own, as the sign step does
 *  (`quoteFundingLeg`), and the cap is the sum of each leg's cap. */
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
}): { marginFor: (bonds: AskedBonds) => FundingMarginField } {
    const publicClient = usePublicClient();
    const router = resolveSwapFundingContracts()?.router;
    const [text, setText] = useState<string | null>(null);
    // The legs' bonds the last render asked about, as a key — the exact
    // outputs the venue quotes for.
    const keyOf = (asked: AskedBonds) => {
        const legs = legBonds(asked);
        return fundingToken && currency && legs ? `${fundingToken}:${currency}:${legs.join(",")}` : null;
    };
    const [askedLegs, setAskedLegs] = useState<{ key: string | null; legs: bigint[] | null }>({ key: null, legs: null });
    const { key, legs } = askedLegs;
    const [quote, setQuote] = useState<{ key: string; venue: SwapVenueKind; slippageBps: number; quotedInputs: bigint[] } | null>(null);

    useEffect(() => {
        if (!key || !legs || !publicClient || !router || !fundingToken || !currency) return;
        let canceled = false;
        Promise.all(legs.map((bondAmount) => quoteFundingInput(publicClient, router, { inputToken: fundingToken, currency, bondAmount })))
            .then((qs) => {
                if (!canceled) setQuote({ key, venue: qs[0].venue, slippageBps: qs[0].slippageBps, quotedInputs: qs.map((q) => q.quotedInput) });
            })
            // A venue that cannot quote shows no cap; the sign step quotes
            // again and names its own failure.
            .catch(() => { if (!canceled) setQuote(null); });
        return () => { canceled = true; };
        // `legs` changes only with `key`, which names them.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [key, publicClient, router, fundingToken, currency]);

    const { decimals } = useTokenDecimals(fundingToken ?? undefined);
    const { read: balance } = useTokenBalance(fundingToken ?? undefined, party);

    const marginFor = (asked: AskedBonds): FundingMarginField => {
        // Adjusting state from a value known only at render: React re-renders
        // this component at once with the new bonds, and the effect quotes them.
        const askedKey = keyOf(asked);
        if (askedKey !== key) setAskedLegs({ key: askedKey, legs: legBonds(asked) });
        const current = quote && askedKey && quote.key === askedKey ? quote : null;
        const state = fundingMargin({
            text,
            defaultBps: current?.slippageBps ?? null,
            quotedInput: current?.quotedInputs ?? null,
            balance: balance.status === "present" ? balance.value : null,
        });
        return { ...state, venue: current?.venue ?? null, decimals, symbol: fundingSymbol, onChange: setText };
    };
    return { marginFor };
}
