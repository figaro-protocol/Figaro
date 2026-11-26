/**
 * memberResolutionHistory — a member's public-graph resolution history:
 * the Core's order and attestation reads (`lib/core/indexer.ts`,
 * `lib/core/attestationIndexer.ts`) composed with the MembersRegistry's
 * registrations into one address-keyed history. Every figure is recomputed
 * from events; nothing is stored, so the result is verifiable by anyone with
 * chain access.
 */
import type { PublicClient } from "viem";
import {
    getStringArg,
    getOrderCommittedBySeller,
    getOrderCommittedByBuyer,
    getAllOrderResolved,
    type IndexedLog,
} from "@/lib/core/indexer";
import { getAllAttestations, getAllBatchAttestations } from "@/lib/core/attestationIndexer";
import { getAllMemberRegistered } from "@/lib/registries/membersRegistryIndexer";
import { hexEqual } from "@/lib/shared/evm";


/** Value a seller transacted as a seller, summed per currency. */
interface ResolutionHistoryValue {
    currency: string;
    total: bigint;
}

/** Attestations the member filed, grouped by clauseId. */
interface ResolutionHistoryAttestations {
    clauseId: string;
    count: number;
}

/**
 * A seller's public-graph resolution history — every indicator reconstructed from
 * on-chain events, recomputable by anyone. NOT a stored or soulbound score;
 * it is the raw resolution/coordination history the public graph exposes
 * (DATA_LAYER.md §"Reputation derivation").
 */
export interface MemberResolutionIndicators {
    operatingSinceBlock: bigint | null;
    operatingSinceTimestamp: bigint | null;
    completedProcesses: number;
    activeProcesses: number;
    ordersSold: number;
    ordersBought: number;
    valueTransacted: ResolutionHistoryValue[];
    buyersServed: number;
    sellersUsed: number;
    attestationsEmitted: number;
    attestationsByClause: ResolutionHistoryAttestations[];
}

function getBigIntArg(log: IndexedLog, key: string): bigint {
    const value = ((log as { args?: Record<string, unknown> }).args ?? {})[key];
    return typeof value === "bigint" ? value : 0n;
}

/**
 * Reconstruct a seller's full public-graph resolution history from the OrderCommitted
 * / OrderResolved process graph and the disclosure graph — all keyed to one
 * address. Every figure folds BOTH resolution paths: the order and process
 * readers (`lib/core/indexer`) read FigaroCore and FigaroBatchVerifier, which
 * emits the same `OrderCommitted` / `OrderResolved` events for every batched
 * order, each stream address-filtered; the attestation tallies read the
 * coordinator and the verifier's re-emissions the same way (SCALING_STRATEGY.md
 * § "A reader must fold BOTH"). No status or process passes from one path to
 * the other; the fold is the reader's.
 */
export async function getSellerResolutionHistory(
    client: PublicClient,
    chainId: number,
    seller: string,
): Promise<MemberResolutionIndicators> {
    const [sellerOrders, buyerOrders, resolved, registrations, attestations, batchAttestations] =
        await Promise.all([
            getOrderCommittedBySeller(client, chainId, seller),
            getOrderCommittedByBuyer(client, chainId, seller),
            getAllOrderResolved(client, chainId),
            getAllMemberRegistered(client, chainId),
            getAllAttestations(client, chainId),
            getAllBatchAttestations(client, chainId),
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
        const currency = getStringArg(log, "token")?.toLowerCase();
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
        .filter((row) => hexEqual(row.member, seller))
        .sort((a, b) => a.blockNumber - b.blockNumber);
    const firstBlock = ownRegistrations[0]?.blockNumber;
    // The SDK parser coerces a pending log's null blockNumber to 0 — treat
    // block 0 as unknown (no real registration lands in the genesis block).
    const operatingSinceBlock: bigint | null = firstBlock ? BigInt(firstBlock) : null;
    let operatingSinceTimestamp: bigint | null = null;
    if (operatingSinceBlock != null) {
        try {
            operatingSinceTimestamp = (await client.getBlock({ blockNumber: operatingSinceBlock })).timestamp;
        } catch {
            operatingSinceTimestamp = null;
        }
    }

    // A party attests for itself: the member's attestations are the ones it
    // filed, on either path (coordinator or verifier re-emission).
    const attestationsByClauseMap = new Map<string, number>();
    for (const log of [...attestations, ...batchAttestations]) {
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
        attestationsEmitted,
        attestationsByClause: [...attestationsByClauseMap.entries()]
            .map(([clauseId, count]) => ({ clauseId, count }))
            .sort((a, b) => b.count - a.count),
    };
}
