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
import { decodeFunctionData, getAbiItem, type Hex, type Log, type PublicClient } from "viem";
import { cachedGetLogs } from "@/lib/kernel/eventCache";
import {
    cachedGetLogsMulti,
    getStringArg,
    getOrderCommittedBySeller,
    getOrderCommittedByBuyer,
    getAllOrderResolved,
    type IndexedLog,
} from "@/lib/kernel/indexer";
import { getAllMemberRegistered } from "@/lib/protocol/membersRegistryIndexer";
import { hexEqual, isEmptyHex } from "@/lib/shared/evm";
import { ATTESTATION_COORDINATOR_ABI, BATCH_VERIFIER_ABI, EV_ATTESTATION, parseAttestationLogs } from "@figaro/sdk";
import { getAttestationCoordinator, getBatchVerifier } from "@/lib/composition/contracts";

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
    const coordinator = getAttestationCoordinator();
    if (!coordinator) return [];
    return cachedGetLogsMulti(
        client,
        chainId,
        [coordinator],
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
 *  Decoding is the SDK's (`parseAttestationLogs`); this wraps it per-log.
 *  Returns null when the log doesn't decode as an `Attestation` (garbage or
 *  still-pending log) — callers filter. */
export function parseAttestationLog(log: IndexedAttestationLog): AttestationRecord | null {
    const [row] = parseAttestationLogs([log as unknown as Log]);
    return row ?? null;
}


/** Attestation logs filtered by orderHash (hex case never matters). */
export async function getAttestationsByOrder(client: PublicClient, chainId: number, orderHash: string) {
    const all = await getAllAttestations(client, chainId);
    const wanted = orderHash.toLowerCase();
    return all.filter((log) => getStringArg(log, "orderHash")?.toLowerCase() === wanted);
}

// ── FigaroBatchVerifier — the SECOND settlement universe ─────────────────────
//
// These reads are deliberately NOT merged into `getAllAttestations` above. The
// `Attestation` topic hash is shared by the coordinator and the verifier
// (FigaroBatchVerifier.sol:154 warns of exactly this), so the EMITTING ADDRESS
// is the only thing that says which universe a row came from — and that
// distinction is the whole evidentiary difference between "re-verifiable from
// calldata" and "proved once inside a batch". Merging the two streams would
// erase it. Callers that only want a timeline use the coordinator read; callers
// that must attribute evidence use these.

/** `Attestation` logs re-emitted BY THE BATCH VERIFIER (never the coordinator's).
 *  Empty when no verifier address is configured — absence, not "not settled". */
async function getAllBatchAttestations(client: PublicClient, chainId: number): Promise<IndexedLog[]> {
    const verifier = getBatchVerifier();
    if (!verifier) return [];
    return cachedGetLogs(client, chainId, {
        address: verifier,
        event: EV_ATTESTATION,
        eventName: "Attestation",
    });
}

/** Verifier-re-emitted `Attestation` logs for one order (hex case never matters). */
export async function getBatchAttestationsByOrder(
    client: PublicClient,
    chainId: number,
    orderHash: string,
): Promise<IndexedLog[]> {
    const all = await getAllBatchAttestations(client, chainId);
    const wanted = orderHash.toLowerCase();
    return all.filter((log) => getStringArg(log, "orderHash")?.toLowerCase() === wanted);
}

/** `BatchSettled` logs from the verifier. The event item comes off the SDK's
 *  `BATCH_VERIFIER_ABI` rather than a new `EV_*` constant — the same pattern
 *  /integrate documents for outside integrators. */
export async function getAllBatchSettled(client: PublicClient, chainId: number): Promise<IndexedLog[]> {
    const verifier = getBatchVerifier();
    if (!verifier) return [];
    return cachedGetLogs(client, chainId, {
        address: verifier,
        event: getAbiItem({ abi: BATCH_VERIFIER_ABI, name: "BatchSettled" }),
        eventName: "BatchSettled",
    });
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
export interface MemberTrackRecord {
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
): Promise<MemberTrackRecord> {
    const [sellerOrders, buyerOrders, resolved, registrations, attestations] =
        await Promise.all([
            getOrderCommittedBySeller(client, chainId, seller),
            getOrderCommittedByBuyer(client, chainId, seller),
            getAllOrderResolved(client, chainId),
            getAllMemberRegistered(client, chainId),
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
