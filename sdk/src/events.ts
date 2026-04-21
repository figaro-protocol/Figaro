/**
 * @figaro/core — Event Parser
 *
 * Decodes raw EVM logs into typed Figaro event objects.
 * Stateless — takes logs in, returns structured data out.
 *
 * Usage:
 *   const logs = await client.getLogs({ address: coreAddr, ... });
 *   const events = parseOrderCommittedLogs(logs);
 */

import { type PublicClient, type Log, decodeEventLog } from "viem";
import { CORE_ABI, ATTESTATION_COORDINATOR_ABI, DUTCH_AUCTION_ABI } from "./abis.js";
import {
    EV_ORDER_COMMITTED,
    EV_ORDER_RESOLVED,
    EV_PROCESS_RESOLVED,
    EV_ORDER_SELLER,
    EV_ATTESTATION,
    EV_AUCTION_CREATED,
    EV_AUCTION_CLAIMED,
} from "./abis.js";
import type {
    Hex,
    Address,
    OrderCommittedEvent,
    OrderResolvedEvent,
    ProcessResolvedEvent,
    AttestationEvent,
    AuctionCreatedEvent,
    AuctionClaimedEvent,
    FigaroAddresses,
} from "./types.js";

// ── Log decoders ────────────────────────────────────────────────────────────

export function parseOrderCommittedLogs(logs: Log[]): OrderCommittedEvent[] {
    const results: OrderCommittedEvent[] = [];
    for (const log of logs) {
        try {
            const decoded = decodeEventLog({ abi: CORE_ABI, data: log.data, topics: log.topics });
            if (decoded.eventName !== "OrderCommitted") continue;
            const a = decoded.args as Record<string, unknown>;
            results.push({
                orderHash: a.orderHash as Hex,
                processId: a.processId as Hex,
                buyer: a.buyer as Address,
                seller: a.seller as Address,
                currency: a.currency as Address,
                payment: a.payment as bigint,
                cumulativeValue: a.cumulativeValue as bigint,
                agreementHash: a.agreementHash as Hex,
                salt: a.salt as bigint,
                deadline: a.deadline as bigint,
                blockNumber: Number(log.blockNumber ?? 0),
            });
        } catch {
            // Skip non-matching logs
        }
    }
    return results;
}

export function parseOrderResolvedLogs(logs: Log[]): OrderResolvedEvent[] {
    const results: OrderResolvedEvent[] = [];
    for (const log of logs) {
        try {
            const decoded = decodeEventLog({ abi: CORE_ABI, data: log.data, topics: log.topics });
            if (decoded.eventName !== "OrderResolved") continue;
            const a = decoded.args as Record<string, unknown>;
            results.push({
                orderHash: a.orderHash as Hex,
                processId: a.processId as Hex,
                sellerPayout: a.sellerPayout as bigint,
                buyerPayout: a.buyerPayout as bigint,
                blockNumber: Number(log.blockNumber ?? 0),
            });
        } catch {
            // Skip non-matching logs
        }
    }
    return results;
}

export function parseProcessResolvedLogs(logs: Log[]): ProcessResolvedEvent[] {
    const results: ProcessResolvedEvent[] = [];
    for (const log of logs) {
        try {
            const decoded = decodeEventLog({ abi: CORE_ABI, data: log.data, topics: log.topics });
            if (decoded.eventName !== "ProcessResolved") continue;
            const a = decoded.args as Record<string, unknown>;
            results.push({
                processId: a.processId as Hex,
                buyer: a.buyer as Address,
                orderCount: a.orderCount as bigint,
                blockNumber: Number(log.blockNumber ?? 0),
            });
        } catch {
            // Skip non-matching logs
        }
    }
    return results;
}

export function parseAttestationLogs(logs: Log[]): AttestationEvent[] {
    const results: AttestationEvent[] = [];
    for (const log of logs) {
        try {
            const decoded = decodeEventLog({
                abi: ATTESTATION_COORDINATOR_ABI,
                data: log.data,
                topics: log.topics,
            });
            if (decoded.eventName !== "Attestation") continue;
            const a = decoded.args as Record<string, unknown>;
            results.push({
                orderHash: a.orderHash as Hex,
                processId: a.processId as Hex,
                attester: a.attester as Address,
                schemaId: a.schemaId as Hex,
                stage: Number(a.stage),
                contentRef: a.contentRef as Hex,
                blockNumber: Number(log.blockNumber ?? 0),
            });
        } catch {
            // Skip non-matching logs
        }
    }
    return results;
}

export function parseAuctionCreatedLogs(logs: Log[]): AuctionCreatedEvent[] {
    const results: AuctionCreatedEvent[] = [];
    for (const log of logs) {
        try {
            const decoded = decodeEventLog({
                abi: DUTCH_AUCTION_ABI,
                data: log.data,
                topics: log.topics,
            });
            if (decoded.eventName !== "AuctionCreated") continue;
            const a = decoded.args as Record<string, unknown>;
            results.push({
                auctionId: a.auctionId as Hex,
                creator: a.creator as Address,
                maxPrice: a.maxPrice as bigint,
                processId: a.processId as Hex,
                currency: a.currency as Address,
                blockNumber: Number(log.blockNumber ?? 0),
            });
        } catch {
            // Skip non-matching logs
        }
    }
    return results;
}

export function parseAuctionClaimedLogs(logs: Log[]): AuctionClaimedEvent[] {
    const results: AuctionClaimedEvent[] = [];
    for (const log of logs) {
        try {
            const decoded = decodeEventLog({
                abi: DUTCH_AUCTION_ABI,
                data: log.data,
                topics: log.topics,
            });
            if (decoded.eventName !== "AuctionClaimed") continue;
            const a = decoded.args as Record<string, unknown>;
            results.push({
                auctionId: a.auctionId as Hex,
                driver: a.driver as Address,
                clearingPrice: a.clearingPrice as bigint,
                blockNumber: Number(log.blockNumber ?? 0),
            });
        } catch {
            // Skip non-matching logs
        }
    }
    return results;
}

// ── Bulk fetch helpers ──────────────────────────────────────────────────────

/**
 * Fetch all core events from the given block range and return parsed typed objects.
 * This is the primary entry point for agents bootstrapping state.
 */
export async function fetchCoreEvents(
    client: PublicClient,
    addresses: FigaroAddresses,
    fromBlock: bigint = 0n,
    toBlock: bigint | "latest" = "latest",
) {
    const logs = await client.getLogs({
        address: addresses.core,
        fromBlock,
        toBlock,
    });

    return {
        orderCommitted: parseOrderCommittedLogs(logs),
        orderResolved: parseOrderResolvedLogs(logs),
        processResolved: parseProcessResolvedLogs(logs),
    };
}
