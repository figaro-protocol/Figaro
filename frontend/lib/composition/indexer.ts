/**
 * lib/composition/indexer.ts — event readers for the contracts the frontend
 * COMPOSES with (the attestation coordinator).
 *
 * These read non-core contracts, so they live OUTSIDE `lib/kernel/indexer.ts`
 * (core must not reference composition addresses). They reuse the core
 * event-cache primitives (`lib/composition/` may import `lib/kernel/`; never the
 * reverse). Reads are clause-agnostic — clauseId is DATA off the event, never
 * hardcoded.
 */
import { decodeFunctionData, type Hex, type PublicClient } from "viem";
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
import { hexEqual, isEmptyHex, ZERO_BYTES32 } from "@/lib/shared/evm";
import { ATTESTATION_COORDINATOR_ABI, EV_ATTESTATION } from "@/lib/composition/abis";
import { COMPOSITION_CONTRACTS } from "@/lib/composition/contracts";

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

/** One `Attestation` event flattened to its full record — the shape shared by
 *  the audit/evidence bundle and (via the narrower `RuntimeAttestation` view)
 *  the semantic model. clauseId is DATA off the event, never hardcoded. */
export type AttestationRecord = {
    orderHash: string;
    processId: string;
    attester: string;
    clauseId: string;
    stage: number;
    contentRef: string;
    transactionHash: string | null;
    blockNumber: number;
};

/** THE Attestation-log → record reducer — the one parse every consumer shares
 *  (semantic model, evidence/audit bundle; the juror path stays React-free).
 *  Returns null when the log lacks its identity args (garbage or
 *  still-pending log) — callers filter. */
export function parseAttestationLog(log: IndexedAttestationLog): AttestationRecord | null {
    const args = log.args;
    if (!args?.orderHash || !args.processId || !args.attester || !args.clauseId) return null;
    return {
        orderHash: args.orderHash,
        processId: args.processId,
        attester: args.attester,
        clauseId: args.clauseId,
        stage: args.stage === undefined ? 0 : Number(args.stage),
        contentRef: args.contentRef ?? ZERO_BYTES32,
        transactionHash: log.transactionHash ?? null,
        blockNumber: log.blockNumber === undefined || log.blockNumber === null ? 0 : Number(log.blockNumber),
    };
}

/**
 * Fetch the `bytes content` argument the seller/buyer attestation was called
 * with. The on-chain `Attestation` event records `keccak256(content)`, not the
 * content itself, so any value-recovery (grams, addresses, structured data)
 * has to read transaction calldata.
 *
 * Returns `null` on missing tx, missing input, or a non-attestation function
 * call. Errors during fetch/decode swallow to `null` — callers that need
 * provenance should compare `keccak256(content)` against the event's contentRef.
 *
 * @public — pending consumer: the measured-grams channel (attestation content
 * against the committed ghg section) recovers grams through this.
 */
export async function getAttestationContent(
    client: PublicClient,
    txHash: Hex,
): Promise<Hex | null> {
    try {
        const tx = await client.getTransaction({ hash: txHash });
        if (isEmptyHex(tx?.input)) return null;
        const decoded = decodeFunctionData({
            abi: ATTESTATION_COORDINATOR_ABI,
            data: tx.input,
        });
        if (
            decoded.functionName !== "attestAsSeller"
            && decoded.functionName !== "attestAsBuyer"
        ) {
            return null;
        }
        const args = decoded.args ?? [];
        const content = args[args.length - 1];
        return typeof content === "string" && content.startsWith("0x")
            ? (content as Hex)
            : null;
    } catch {
        return null;
    }
}

/** Attestation logs filtered by orderHash. */
export async function getAttestationsByOrder(client: PublicClient, chainId: number, orderHash: string) {
    const all = await getAllAttestations(client, chainId);
    return all.filter((log) => getStringArg(log, "orderHash") === orderHash);
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
        .map((log) => parseAttestationLog(log as IndexedAttestationLog))
        .filter((r): r is AttestationRecord => r !== null)
        .map(({ clauseId, orderHash, stage, attester, blockNumber }) => ({
            clauseId, orderHash, stage, attester, blockNumber,
        }))
        .sort((a, b) => a.blockNumber - b.blockNumber);
}

// ── Seller track record — public-graph-derived activity ──────────────────────
//
// Composes core reads (orders, registrations) WITH non-core reads
// (attestations) into one address-keyed record — which is why it lives here, not
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
    attestationsEmitted: number;
    attestationsByClause: TrackRecordAttestations[];
}

function getBigIntArg(log: IndexedLog, key: string): bigint {
    const value = ((log as { args?: Record<string, unknown> }).args ?? {})[key];
    return typeof value === "bigint" ? value : 0n;
}

/**
 * Reconstruct a seller's full public-graph track record from the OrderCommitted
 * / OrderResolved process graph and the AttestationCoordinator disclosure
 * graph — all keyed to one address.
 */
export async function getSellerTrackRecord(
    client: PublicClient,
    chainId: number,
    seller: string,
): Promise<SellerTrackRecord> {
    const [sellerOrders, buyerOrders, resolved, registrations, attestations] =
        await Promise.all([
            getOrderCommittedBySeller(client, chainId, seller),
            getOrderCommittedByBuyer(client, chainId, seller),
            getAllOrderResolved(client, chainId),
            getAllSellerRegistered(client, chainId),
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
        attestationsEmitted,
        attestationsByClause: [...attestationsByClauseMap.entries()]
            .map(([clauseId, count]) => ({ clauseId, count }))
            .sort((a, b) => b.count - a.count),
    };
}
