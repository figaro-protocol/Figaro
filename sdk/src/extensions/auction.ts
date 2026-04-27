/**
 * @figaro/core/extensions — Dutch Auction
 *
 * Pure functions for Dutch auction price curves, state derivation,
 * and claim evaluation. No chain access needed for price math.
 *
 * The Figaro Dutch auction is a descending-price mechanism:
 * price decays linearly from maxPrice to floor over `duration` seconds.
 * First caller to `claim()` wins at the current price.
 */

import type { PublicClient } from "viem";
import { DUTCH_AUCTION_ABI } from "../abis.js";
import type { Hex, Address, AuctionCreatedEvent, AuctionClaimedEvent } from "../types.js";

// ── Auction state ───────────────────────────────────────────────────────────

export type AuctionStatus = "active" | "claimed" | "cancelled" | "expired" | "unknown";

export interface AuctionState {
    auctionId: Hex;
    creator: Address;
    startTime: number;
    maxPrice: bigint;
    provider: Address;
    clearingPrice: bigint;
    status: AuctionStatus;
}

export interface AuctionConfig {
    /** Duration in seconds (immutable at deploy). */
    duration: number;
    /** Floor basis points (0–10000). Floor = maxPrice × floorBps / 10000. */
    floorBps: number;
}

// ── Pure price curve ────────────────────────────────────────────────────────

/**
 * Compute the current Dutch auction price (pure — no chain access).
 *
 * Linear decay: maxPrice → floor over `duration` seconds.
 * After duration expires, returns floor.
 *
 * @param maxPrice   Starting price.
 * @param floorBps   Floor as basis points of maxPrice (0–10000).
 * @param duration   Auction duration in seconds.
 * @param startTime  Unix timestamp when auction started.
 * @param now        Current unix timestamp.
 */
export function computeCurrentPrice(
    maxPrice: bigint,
    floorBps: number,
    duration: number,
    startTime: number,
    now: number,
): bigint {
    const floor = (maxPrice * BigInt(floorBps)) / 10000n;

    const elapsed = now - startTime;
    if (elapsed >= duration) return floor;
    if (elapsed <= 0) return maxPrice;

    const drop = ((maxPrice - floor) * BigInt(elapsed)) / BigInt(duration);
    return maxPrice - drop;
}

/**
 * Compute the floor price.
 */
export function computeFloorPrice(maxPrice: bigint, floorBps: number): bigint {
    return (maxPrice * BigInt(floorBps)) / 10000n;
}

/**
 * Time remaining until auction hits the floor price.
 * Returns 0 if already at or past floor.
 */
export function timeToFloor(
    duration: number,
    startTime: number,
    now: number,
): number {
    const remaining = (startTime + duration) - now;
    return remaining > 0 ? remaining : 0;
}

/**
 * Time elapsed since auction start.
 */
export function elapsed(startTime: number, now: number): number {
    return Math.max(0, now - startTime);
}

/**
 * Is the auction expired (past duration, unclaimed)?
 */
export function isExpired(
    duration: number,
    startTime: number,
    now: number,
): boolean {
    return now >= startTime + duration;
}

// ── Claim evaluation (for agents) ───────────────────────────────────────────

export interface ClaimEvaluation {
    /** Current price if claimed now. */
    currentPrice: bigint;
    /** Floor price (minimum possible). */
    floorPrice: bigint;
    /** Savings vs max price. */
    savingsVsMax: bigint;
    /** Percentage discount from max (0–100). */
    discountPct: number;
    /** Seconds remaining until floor. */
    secondsToFloor: number;
    /** Whether the auction is still claimable. */
    claimable: boolean;
}

/**
 * Evaluate whether to claim an auction now.
 * Returns structured data for agent decision-making.
 */
export function evaluateClaim(
    maxPrice: bigint,
    floorBps: number,
    duration: number,
    startTime: number,
    now: number,
    claimed: boolean,
): ClaimEvaluation {
    const currentPrice = computeCurrentPrice(maxPrice, floorBps, duration, startTime, now);
    const floorPrice = computeFloorPrice(maxPrice, floorBps);
    const savingsVsMax = maxPrice - currentPrice;
    const discountPct = maxPrice > 0n
        ? Number((savingsVsMax * 10000n) / maxPrice) / 100
        : 0;

    return {
        currentPrice,
        floorPrice,
        savingsVsMax,
        discountPct,
        secondsToFloor: timeToFloor(duration, startTime, now),
        claimable: !claimed && !isExpired(duration, startTime, now),
    };
}

// ── Chain reads ─────────────────────────────────────────────────────────────

/**
 * Read auction config (duration + floorBps) from contract.
 * These are immutable — cache after first read.
 */
export async function fetchAuctionConfig(
    client: PublicClient,
    auctionAddress: Address,
): Promise<AuctionConfig> {
    const [duration, floorBps] = await Promise.all([
        client.readContract({
            address: auctionAddress,
            abi: DUTCH_AUCTION_ABI,
            functionName: "duration",
        }),
        client.readContract({
            address: auctionAddress,
            abi: DUTCH_AUCTION_ABI,
            functionName: "floorBps",
        }),
    ]);

    return {
        duration: Number(duration),
        floorBps: Number(floorBps),
    };
}

/**
 * Read full auction state from contract.
 */
export async function fetchAuctionState(
    client: PublicClient,
    auctionAddress: Address,
    auctionId: Hex,
): Promise<AuctionState> {
    const result = await client.readContract({
        address: auctionAddress,
        abi: DUTCH_AUCTION_ABI,
        functionName: "auctions",
        args: [auctionId],
    });

    const [creator, startTime, maxPrice, provider, clearingPrice] =
        result as readonly [Address, bigint, bigint, Address, bigint];

    const zeroAddr = "0x0000000000000000000000000000000000000000" as Address;

    let status: AuctionStatus;
    if (creator === zeroAddr) {
        status = "unknown";
    } else if (provider !== zeroAddr) {
        status = "claimed";
    } else {
        status = "active";
    }

    return {
        auctionId,
        creator,
        startTime: Number(startTime),
        maxPrice,
        provider,
        clearingPrice,
        status,
    };
}

// ── Event-based state reconstruction ────────────────────────────────────────

/**
 * Derive auction states from parsed events.
 * Returns a map of auctionId → AuctionState.
 */
export function deriveAuctionStates(
    created: AuctionCreatedEvent[],
    claimed: AuctionClaimedEvent[],
): Map<Hex, { auctionId: Hex; creator: Address; maxPrice: bigint; processId: Hex; currency: Address; claimed: boolean; provider?: Address; clearingPrice?: bigint }> {
    const map = new Map<Hex, { auctionId: Hex; creator: Address; maxPrice: bigint; processId: Hex; currency: Address; claimed: boolean; provider?: Address; clearingPrice?: bigint }>();

    for (const e of created) {
        map.set(e.auctionId, {
            auctionId: e.auctionId,
            creator: e.creator,
            maxPrice: e.maxPrice,
            processId: e.processId,
            currency: e.currency,
            claimed: false,
        });
    }

    for (const e of claimed) {
        const auction = map.get(e.auctionId);
        if (auction) {
            auction.claimed = true;
            auction.provider = e.provider;
            auction.clearingPrice = e.clearingPrice;
        }
    }

    return map;
}
