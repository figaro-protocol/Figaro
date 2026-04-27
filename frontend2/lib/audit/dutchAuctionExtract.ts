/**
 * Dutch auction extractor — surfaces the price-discovery trail for orders
 * that came through `src/DutchAuction.sol`.
 *
 * The auction lifecycle is upstream of the bonded commitment: a
 * descending-price auction yields a clearing price + provider, then the
 * provider + buyer sign a Figaro `commit` with `payment = clearingPrice`.
 * The audit bundle's other extractors see only the resulting committed
 * order — they don't show the auction parameters that produced the price.
 *
 * This extractor closes that gap. For an order priced via Dutch auction,
 * the bundle's reviewer sees:
 *
 *   - maxPrice + floorBps configuration → starting price + decay floor
 *   - startTime → when the auction opened
 *   - clearingPrice → the price the provider claimed at
 *   - claimedAtBlock − startBlock → latency from open to claim (the
 *     auction's price-discovery footprint)
 *
 * Pure function. Caller fetches `AuctionCreated` + `AuctionClaimed` events
 * from chain (filtered to the relevant `auctionId`) and passes them in.
 */

import type { Order } from "@/lib/core/store";
import type { ExtractedDocument } from "./types";

export interface DutchAuctionCreatedEvent {
    auctionId: string;
    creator: string;
    maxPrice: bigint;
    processId: string;
    currency: string;
    blockNumber?: number;
    transactionHash?: string;
}

export interface DutchAuctionClaimedEvent {
    auctionId: string;
    /** Address that called claim() — the provider in the renamed v5 ABI. */
    provider: string;
    clearingPrice: bigint;
    blockNumber?: number;
    transactionHash?: string;
}

export interface DutchAuctionDocument extends ExtractedDocument {
    /** True when the order's fulfilment method indicates Dutch-auction
     *  pricing AND the matching auction events were located. */
    auctionApplicable: boolean;
    /** The auctionId that priced this order, if known. */
    auctionId?: string;
    /** Auction parameters at creation. */
    creator?: string;
    maxPrice?: bigint;
    startBlock?: number;
    startTransactionHash?: string;
    /** Resolution. */
    clearingPrice?: bigint;
    provider?: string;
    claimedAtBlock?: number;
    claimedTransactionHash?: string;
    /** Latency in blocks from auction creation to provider claim. The
     *  auction's price-discovery footprint. */
    blocksToClaim?: number;
}

/**
 * @param order            The committed order.
 * @param fulfilmentMethod Canonical fulfilment-method string (from
 *                         `figaro-fulfilment-v1`); if it isn't
 *                         "deliver:dutch-auction" this extractor reports
 *                         auctionApplicable=false and does no further work.
 * @param createdEvents    `AuctionCreated` events filtered to auctions whose
 *                         `processId === order.processId`. Caller fetches
 *                         these from the DutchAuction contract via
 *                         indexed-topic query.
 * @param claimedEvents    `AuctionClaimed` events for the same set of
 *                         auctionIds.
 */
export function extractDutchAuction(
    order: Order,
    fulfilmentMethod: string | undefined,
    createdEvents: readonly DutchAuctionCreatedEvent[],
    claimedEvents: readonly DutchAuctionClaimedEvent[],
): DutchAuctionDocument {
    const base = {
        title: "Dutch auction trail",
        orderHash: order.id,
        processId: order.processId,
        agreementHash: order.agreementHash ?? "0x",
        buyer: order.buyer,
        seller: order.seller,
    };

    if (fulfilmentMethod !== "deliver:dutch-auction") {
        return { ...base, auctionApplicable: false };
    }

    // Find the AuctionClaimed where provider === order.seller AND
    // clearingPrice === order.payment. That's the unique link from
    // a committed order back to its auction.
    const sellerLc = order.seller.toLowerCase();
    const matchingClaim = claimedEvents.find(
        (e) => e.provider.toLowerCase() === sellerLc && e.clearingPrice === order.payment,
    );

    if (!matchingClaim) {
        // The fulfilment method says auction, but we can't locate the
        // matching claim event. Still flag auctionApplicable=true so the
        // PDF page renders a "claim event not located — investigate" notice
        // rather than silently omitting.
        return { ...base, auctionApplicable: true };
    }

    const matchingCreated = createdEvents.find((e) => e.auctionId === matchingClaim.auctionId);
    if (!matchingCreated) {
        return {
            ...base,
            auctionApplicable: true,
            auctionId: matchingClaim.auctionId,
            clearingPrice: matchingClaim.clearingPrice,
            provider: matchingClaim.provider,
            claimedAtBlock: matchingClaim.blockNumber,
            claimedTransactionHash: matchingClaim.transactionHash,
        };
    }

    const blocksToClaim =
        matchingClaim.blockNumber !== undefined && matchingCreated.blockNumber !== undefined
            ? matchingClaim.blockNumber - matchingCreated.blockNumber
            : undefined;

    return {
        ...base,
        auctionApplicable: true,
        auctionId: matchingClaim.auctionId,
        creator: matchingCreated.creator,
        maxPrice: matchingCreated.maxPrice,
        startBlock: matchingCreated.blockNumber,
        startTransactionHash: matchingCreated.transactionHash,
        clearingPrice: matchingClaim.clearingPrice,
        provider: matchingClaim.provider,
        claimedAtBlock: matchingClaim.blockNumber,
        claimedTransactionHash: matchingClaim.transactionHash,
        blocksToClaim,
    };
}
