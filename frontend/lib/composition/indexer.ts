/**
 * lib/composition/indexer.ts — event readers for the contracts the frontend
 * COMPOSES with (attestation coordinator, dutch auction).
 *
 * These read non-core contracts, so they live OUTSIDE `lib/kernel/indexer.ts`
 * (core must not reference composition addresses). They reuse the core
 * event-cache primitives (`lib/composition/` may import `lib/kernel/`; never the
 * reverse). Reads are clause-agnostic — clauseId is DATA off the event, never
 * hardcoded.
 */
import type { PublicClient } from "viem";
import { cachedGetLogs } from "@/lib/kernel/eventCache";
import {
    cachedGetLogsMulti,
    getStringArg,
    getOrderCommittedBySeller,
    getOrderCommittedByBuyer,
    getAllOrderResolved,
    type IndexedLog,
} from "@/lib/kernel/indexer";
import { getAllSellerRegistered } from "@/lib/protocol/sellerRegistryIndexer";
import { hexEqual } from "@/lib/shared/evm";
import { EV_ATTESTATION, EV_AUCTION_CREATED, EV_AUCTION_CLAIMED } from "@/lib/composition/abis";
import { COMPOSITION_CONTRACTS } from "@/lib/composition/contracts";

// ── DutchAuction ─────────────────────────────────────────────────────────────

export async function getAllAuctionCreated(client: PublicClient, chainId: number) {
    if (!COMPOSITION_CONTRACTS.dutchAuction) return [];
    return cachedGetLogs(client, chainId, {
        address: COMPOSITION_CONTRACTS.dutchAuction,
        event: EV_AUCTION_CREATED,
        eventName: "AuctionCreated",
    });
}

export async function getAllAuctionClaimed(client: PublicClient, chainId: number) {
    if (!COMPOSITION_CONTRACTS.dutchAuction) return [];
    return cachedGetLogs(client, chainId, {
        address: COMPOSITION_CONTRACTS.dutchAuction,
        event: EV_AUCTION_CLAIMED,
        eventName: "AuctionClaimed",
    });
}

// ── AttestationCoordinator ────────────────────────────────────────────────────

/** Typed view of an `Attestation` log row. `blockNumber`/`transactionHash` may
 *  be null for pending logs; guard downstream. */
export type IndexedAttestationLog = {
    args?: Record<string, unknown> & {
        orderHash?: string;
        processId?: string;
        attester?: string;
        clauseId?: string;
        stage?: number | bigint;
        contentRef?: string;
    };
    blockNumber?: number | bigint | null;
    transactionHash?: `0x${string}` | null;
};

async function getAllAttestations(client: PublicClient, chainId: number): Promise<IndexedLog[]> {
    if (!COMPOSITION_CONTRACTS.attestationCoordinator) return [];
    return cachedGetLogsMulti(
        client,
        chainId,
        [COMPOSITION_CONTRACTS.attestationCoordinator],
        { event: EV_ATTESTATION, eventName: "Attestation" },
    );
}

/** Attestation logs filtered by orderHash. */
export async function getAttestationsByOrder(client: PublicClient, chainId: number, orderHash: string) {
    const all = await getAllAttestations(client, chainId);
    return all.filter((log) => getStringArg(log, "orderHash") === orderHash);
}

/** Attestation logs filtered by processId AND clauseId. */
export async function getAttestationsByProcessAndClause(
    client: PublicClient,
    chainId: number,
    processId: string,
    clauseId: string,
) {
    const all = await getAllAttestations(client, chainId);
    return all.filter(
        (log) => getStringArg(log, "processId") === processId && getStringArg(log, "clauseId") === clauseId,
    );
}

/** A process attestation flattened to the fields the runtime model needs:
 *  which clause, which order, which stage, who attested. clauseId is DATA off
 *  the event — no caller hardcodes it. */
export interface RuntimeAttestation {
    clauseId: string;
    orderHash: string;
    stage: number;
    attester: string;
    blockNumber: number;
}

/** All attestations on a process, clause-agnostic. The semantic builder buckets
 *  these by clause to gate capabilities; the order page renders them as a
 *  generic timeline (clause + stage straight from data). */
export async function getAttestationsByProcess(
    client: PublicClient,
    chainId: number,
    processId: string,
): Promise<RuntimeAttestation[]> {
    const all = await getAllAttestations(client, chainId);
    return all
        .filter((log) => getStringArg(log, "processId") === processId)
        .map((log) => {
            const args = (log as { args?: Record<string, unknown> }).args ?? {};
            return {
                clauseId: getStringArg(log, "clauseId") ?? "",
                orderHash: getStringArg(log, "orderHash") ?? "",
                stage: Number(args.stage ?? 0),
                attester: getStringArg(log, "attester") ?? "",
                blockNumber: Number((log as { blockNumber?: unknown }).blockNumber ?? 0),
            };
        })
        .sort((a, b) => a.blockNumber - b.blockNumber);
}

// ── Seller track record — public-graph-derived activity ──────────────────────
//
// Composes core reads (orders, registrations) WITH non-core reads (auction,
// attestation) into one address-keyed record — which is why it lives here, not
// in lib/kernel/indexer.ts. Every figure is recomputed from events; nothing is
// stored, so the result is verifiable by anyone with chain access.

/** Value a seller transacted as a seller, summed per currency. */
interface TrackRecordValue {
    currency: string;
    total: bigint;
}

/** Attestations a seller emitted, grouped by clauseId. */
interface TrackRecordAttestations {
    clauseId: string;
    count: number;
}

/**
 * A seller's public-graph track record — every indicator reconstructed from
 * on-chain events, recomputable by anyone. NOT a stored or soulbound score;
 * it is the raw settlement/coordination history the public graph exposes
 * (PUBLIC_GRAPH_MODEL.md §"Reputation derivation").
 */
export interface SellerTrackRecord {
    operatingSinceBlock: bigint | null;
    operatingSinceTimestamp: bigint | null;
    completedProcesses: number;
    activeProcesses: number;
    ordersSold: number;
    ordersBought: number;
    valueTransacted: TrackRecordValue[];
    buyersServed: number;
    sellersUsed: number;
    auctionJobsWon: number;
    attestationsEmitted: number;
    attestationsByClause: TrackRecordAttestations[];
}

function getBigIntArg(log: IndexedLog, key: string): bigint {
    const value = ((log as { args?: Record<string, unknown> }).args ?? {})[key];
    return typeof value === "bigint" ? value : 0n;
}

/**
 * Reconstruct a seller's full public-graph track record from the OrderCommitted
 * / OrderResolved process graph, the DutchAuction capital graph, and the
 * AttestationCoordinator disclosure graph — all keyed to one address.
 */
export async function getSellerTrackRecord(
    client: PublicClient,
    chainId: number,
    seller: string,
): Promise<SellerTrackRecord> {
    const [sellerOrders, buyerOrders, resolved, registrations, auctions, attestations] =
        await Promise.all([
            getOrderCommittedBySeller(client, chainId, seller),
            getOrderCommittedByBuyer(client, chainId, seller),
            getAllOrderResolved(client, chainId),
            getAllSellerRegistered(client, chainId),
            getAllAuctionClaimed(client, chainId),
            getAllAttestations(client, chainId),
        ]);

    const resolvedProcessIds = new Set(
        resolved.map((log) => getStringArg(log, "processId")).filter((p): p is string => !!p),
    );

    const sellerProcessIds = new Set<string>();
    for (const log of [...sellerOrders, ...buyerOrders]) {
        const pid = getStringArg(log, "processId");
        if (pid) sellerProcessIds.add(pid);
    }
    let completedProcesses = 0;
    for (const pid of sellerProcessIds) {
        if (resolvedProcessIds.has(pid)) completedProcesses++;
    }

    const valueByCurrency = new Map<string, bigint>();
    for (const log of sellerOrders) {
        const currency = getStringArg(log, "currency")?.toLowerCase();
        if (!currency) continue;
        valueByCurrency.set(currency, (valueByCurrency.get(currency) ?? 0n) + getBigIntArg(log, "payment"));
    }

    const buyersServed = new Set(
        sellerOrders.map((log) => getStringArg(log, "buyer")?.toLowerCase()).filter((b): b is string => !!b),
    );
    const sellersUsed = new Set(
        buyerOrders.map((log) => getStringArg(log, "seller")?.toLowerCase()).filter((s): s is string => !!s),
    );

    const ownRegistrations = registrations
        .filter((log) => hexEqual(getStringArg(log, "seller"), seller))
        .sort((a, b) => Number(a.blockNumber ?? 0n) - Number(b.blockNumber ?? 0n));
    const firstBlock = ownRegistrations[0]?.blockNumber;
    const operatingSinceBlock: bigint | null = firstBlock != null ? BigInt(firstBlock) : null;
    let operatingSinceTimestamp: bigint | null = null;
    if (operatingSinceBlock != null) {
        try {
            operatingSinceTimestamp = (await client.getBlock({ blockNumber: operatingSinceBlock })).timestamp;
        } catch {
            operatingSinceTimestamp = null;
        }
    }

    const auctionJobsWon = auctions.filter(
        (log) => hexEqual(getStringArg(log, "provider"), seller),
    ).length;

    const attestationsByClauseMap = new Map<string, number>();
    for (const log of attestations) {
        if (!hexEqual(getStringArg(log, "attester"), seller)) continue;
        const clauseId = getStringArg(log, "clauseId") ?? "unknown";
        attestationsByClauseMap.set(clauseId, (attestationsByClauseMap.get(clauseId) ?? 0) + 1);
    }
    let attestationsEmitted = 0;
    for (const count of attestationsByClauseMap.values()) attestationsEmitted += count;

    return {
        operatingSinceBlock,
        operatingSinceTimestamp,
        completedProcesses,
        activeProcesses: sellerProcessIds.size - completedProcesses,
        ordersSold: sellerOrders.length,
        ordersBought: buyerOrders.length,
        valueTransacted: [...valueByCurrency.entries()].map(([currency, total]) => ({ currency, total })),
        buyersServed: buyersServed.size,
        sellersUsed: sellersUsed.size,
        auctionJobsWon,
        attestationsEmitted,
        attestationsByClause: [...attestationsByClauseMap.entries()]
            .map(([clauseId, count]) => ({ clauseId, count }))
            .sort((a, b) => b.count - a.count),
    };
}
