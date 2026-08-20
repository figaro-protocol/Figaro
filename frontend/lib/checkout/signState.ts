/**
 * signState — the pure derivation behind the counter-sign surface: what the
 * payload's SIGNATURE ABSENCE means (a race draft, an RFQ quote request),
 * which seat the connected wallet fills, and the bond that seat locks.
 * Everything here is derived from (payload, address) alone — never stored,
 * never React — so the sign page renders it and a test drives it directly.
 */
import type { CommitmentPayload, QuoteRequestTerms } from "@figaro-protocol/sdk/agent";
import { calculateBonds } from "@figaro-protocol/sdk";
import { hexEqual, ZERO_PROCESS_ID } from "@/lib/shared/evm";

export interface SignState {
    isRoot: boolean;
    hasBuyerSig: boolean;
    hasSellerSig: boolean;
    /** No signatures at all = a race draft: counter-sign RETURNS to the
     *  buyer instead of broadcasting (derived from signature absence,
     *  never stored). */
    isDraft: boolean;
    /** A draft carrying quote-request terms is the RFQ leg — this wallet
     *  names its price under the buyer's ceiling instead of countersigning
     *  as-is. */
    quoteTerms: QuoteRequestTerms | undefined;
    isQuoteRequest: boolean;
    isBuyer: boolean;
    isSeller: boolean;
    needsMySignature: boolean;
    myBondLabel: string;
    /** The 2× bond THIS seat locks — zero for a spectator. */
    myBondAmount: bigint;
}

export function deriveSignState(
    parsed: CommitmentPayload | null,
    address: string | undefined,
): SignState {
    const commitment = parsed?.commitment;
    const isRoot = commitment?.processId === ZERO_PROCESS_ID;
    const hasBuyerSig = !!parsed?.buyerSig;
    const hasSellerSig = !!parsed?.sellerSig;
    const isDraft = !!parsed && !hasBuyerSig && !hasSellerSig;
    const quoteTerms = isDraft ? parsed?.quoteRequest : undefined;
    const isQuoteRequest = !!quoteTerms && quoteTerms.pricedFields.length > 0;

    const isBuyer = hexEqual(address, commitment?.buyer);
    const isSeller = hexEqual(address, commitment?.seller);
    const needsMySignature = (isBuyer && !hasBuyerSig) || (isSeller && !hasSellerSig);
    const myBondLabel = isBuyer ? "Your Buyer Bond (2x)" : isSeller ? "Your Seller Bond (2x)" : "Your Bond (2x)";

    const myBondAmount = (() => {
        if (!commitment) return 0n;
        if (isSeller) return calculateBonds(commitment.expectedCumulativeValue, commitment.payment).sellerBond;
        if (isBuyer) return calculateBonds(commitment.expectedCumulativeValue, commitment.payment).buyerBond;
        return 0n;
    })();

    return {
        isRoot, hasBuyerSig, hasSellerSig, isDraft, quoteTerms, isQuoteRequest,
        isBuyer, isSeller, needsMySignature, myBondLabel, myBondAmount,
    };
}
