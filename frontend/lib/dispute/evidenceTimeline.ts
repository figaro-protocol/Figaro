/**
 * Evidence timeline renderer.
 *
 * Given a processId, queries all FigaroCore lifecycle events and reconstructs
 * a chronological, human-readable timeline suitable for dispute evidence.
 *
 * Pure read — no contract writes, no on-chain storage.
 * The output can be serialized to JSON for Kleros ERC-1497 evidence
 * submission or rendered in a UI.
 */

import type { PublicClient } from "viem";
import { CORE_ABI, CONTRACTS } from "@/lib/core/contracts";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface TimelineEvent {
    /** Human-readable label: "Order Created", "Order Accepted", etc. */
    label: string;
    /** Block number the event was emitted in. */
    blockNumber: bigint;
    /** Block timestamp (seconds since epoch). */
    timestamp: number;
    /** ISO-8601 formatted timestamp for human-readable display. */
    iso: string;
    /** Transaction hash for verification. */
    txHash: string;
    /** Content-addressed order hash. */
    orderHash: string;
    /** Source contract event name (e.g. "OrderCreated"). */
    eventName: string;
    /** Key fields from the event, stringified for display. */
    details: Record<string, string>;
}

export interface ProcessTimeline {
    /** The process ID being queried. */
    processId: string;
    /** Chain ID the process lives on. */
    chainId: number;
    /** FigaroCore contract address. */
    coreAddress: string;
    /** When the timeline was generated (ISO-8601). */
    generatedAt: string;
    /** Chronological list of events. */
    events: TimelineEvent[];
    /** Participating addresses (buyers + sellers) discovered from events. */
    participants: string[];
    /** Summary statistics. */
    summary: {
        orderCount: number;
        resolvedCount: number;
        cancelledCount: number;
        totalPayment: string;
        totalSellerPayout: string;
        totalBuyerPayout: string;
    };
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function bigintStr(v: unknown): string {
    if (v === undefined || v === null) return "";
    if (typeof v === "bigint") return v.toString();
    return String(v);
}

function weiToDecimal(v: unknown): string {
    if (v === undefined || v === null) return "0";
    const n = typeof v === "bigint" ? v : BigInt(String(v));
    const whole = n / 10n ** 18n;
    const frac = n % 10n ** 18n;
    if (frac === 0n) return whole.toString();
    const fracStr = frac.toString().padStart(18, "0").replace(/0+$/, "");
    return `${whole}.${fracStr}`;
}

async function getBlockTimestamp(
    client: PublicClient,
    blockNumber: bigint,
    cache: Map<string, number>,
): Promise<number> {
    const key = blockNumber.toString();
    if (cache.has(key)) return cache.get(key)!;
    const block = await client.getBlock({ blockNumber });
    const ts = Number(block.timestamp);
    cache.set(key, ts);
    return ts;
}

// ---------------------------------------------------------------------------
// Core: fetch all FigaroCore events for a process
// ---------------------------------------------------------------------------

export async function buildProcessTimeline(
    client: PublicClient,
    processId: `0x${string}`,
    coreAddressOverride?: string,
): Promise<ProcessTimeline> {
    const coreAddress = (coreAddressOverride ?? CONTRACTS.core) as `0x${string}`;
    if (!coreAddress) throw new Error("Core contract address is not configured");

    const chainId = await client.getChainId();
    const blockCache = new Map<string, number>();
    const events: TimelineEvent[] = [];
    const participantSet = new Set<string>();

    // Summary accumulators
    let orderCount = 0;
    let resolvedCount = 0;
    let cancelledCount = 0;
    let totalPayment = 0n;
    let totalSellerPayout = 0n;
    let totalBuyerPayout = 0n;

    // ── OrderCommitted ─────────────────────────────────────────────
    const committedLogs = await client.getContractEvents({
        address: coreAddress,
        abi: CORE_ABI,
        eventName: "OrderCommitted",
        args: { processId },
        fromBlock: 0n,
        toBlock: "latest",
    });

    for (const log of committedLogs) {
        const a = log.args as Partial<{
            buyer: string;
            seller: string;
            currency: string;
            payment: bigint;
            orderHash: string;
        }>;
        const ts = await getBlockTimestamp(client, log.blockNumber!, blockCache);
        orderCount++;
        totalPayment += BigInt(a.payment ?? 0);
        if (a.buyer) participantSet.add(a.buyer.toLowerCase());

        events.push({
            label: "Order Committed",
            blockNumber: log.blockNumber!,
            timestamp: ts,
            iso: new Date(ts * 1000).toISOString(),
            txHash: log.transactionHash!,
            orderHash: a.orderHash ?? "",
            eventName: "OrderCommitted",
            details: {
                buyer: a.buyer ?? "",
                seller: a.seller ?? "",
                currency: a.currency ?? "",
                payment: weiToDecimal(a.payment),
                orderHash: a.orderHash ?? "",
            },
        });
    }

    // Live kernel: no OrderAccepted event — orders are active on commit.

    // Live kernel: no OrderCancelled event — orders resolve or stay active.

    // ── OrderResolved ───────────────────────────────────────────────
    const resolvedLogs = await client.getContractEvents({
        address: coreAddress,
        abi: CORE_ABI,
        eventName: "OrderResolved",
        args: { processId },
        fromBlock: 0n,
        toBlock: "latest",
    });

    for (const log of resolvedLogs) {
        const a = log.args as Partial<{
            sellerPayout: bigint;
            buyerPayout: bigint;
            orderHash: string;
        }>;
        const ts = await getBlockTimestamp(client, log.blockNumber!, blockCache);
        resolvedCount++;
        totalSellerPayout += BigInt(a.sellerPayout ?? 0);
        totalBuyerPayout += BigInt(a.buyerPayout ?? 0);

        events.push({
            label: "Order Resolved",
            blockNumber: log.blockNumber!,
            timestamp: ts,
            iso: new Date(ts * 1000).toISOString(),
            txHash: log.transactionHash!,
            orderHash: a.orderHash ?? "",
            eventName: "OrderResolved",
            details: {
                sellerPayout: weiToDecimal(a.sellerPayout),
                buyerPayout: weiToDecimal(a.buyerPayout),
                orderHash: a.orderHash ?? "",
            },
        });
    }
    events.sort((a, b) => {
        const bn = Number(a.blockNumber - b.blockNumber);
        if (bn !== 0) return bn;
        return a.timestamp - b.timestamp;
    });

    return {
        processId,
        chainId,
        coreAddress,
        generatedAt: new Date().toISOString(),
        events,
        participants: Array.from(participantSet),
        summary: {
            orderCount,
            resolvedCount,
            cancelledCount,
            totalPayment: weiToDecimal(totalPayment),
            totalSellerPayout: weiToDecimal(totalSellerPayout),
            totalBuyerPayout: weiToDecimal(totalBuyerPayout),
        },
    };
}
// Extension point: coordinator events
//
// Downstream archetypes (e.g. Figaro-eats) can extend the timeline by
// providing additional event sources. This keeps the core module
// archetype-agnostic while allowing rich evidence for specific workflows.
// ---------------------------------------------------------------------------

export interface CoordinatorEventSource {
    /** Display name for the coordinator (e.g. "AttestationCoordinator"). */
    name: string;
    /** Fetch additional timeline events for the given processId. */
    fetchEvents: (
        client: PublicClient,
        processId: `0x${string}`,
    ) => Promise<TimelineEvent[]>;
}

/**
 * Build an extended timeline that includes coordinator-specific events.
 * Core events always come first; coordinator events are merged chronologically.
 */
export async function buildExtendedTimeline(
    client: PublicClient,
    processId: `0x${string}`,
    coordinatorSources: CoordinatorEventSource[],
): Promise<ProcessTimeline> {
    const base = await buildProcessTimeline(client, processId);

    const extraEvents: TimelineEvent[] = [];
    for (const source of coordinatorSources) {
        const events = await source.fetchEvents(client, processId);
        extraEvents.push(...events);
    }

    base.events = [...base.events, ...extraEvents].sort((a, b) => {
        const bn = Number(a.blockNumber - b.blockNumber);
        if (bn !== 0) return bn;
        return a.timestamp - b.timestamp;
    });

    return base;
}
