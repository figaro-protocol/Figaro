/**
 * @figaro-protocol/sdk — Event Parser
 *
 * Decodes raw EVM logs into typed Figaro event objects.
 * Stateless — takes logs in, returns structured data out.
 *
 * Usage:
 *   const logs = await client.getLogs({ address: coreAddr, ... });
 *   const events = parseOrderCommittedLogs(logs);
 */

import { type PublicClient, type Log, decodeEventLog } from "viem";
import { CORE_ABI, ATTESTATION_COORDINATOR_ABI } from "./abis.js";
import type {
    Hex,
    Address,
    OrderCommittedEvent,
    OrderResolvedEvent,
    ProcessResolvedEvent,
    AttestationEvent,
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

/** The two settlement universes an attestation anchor can come from:
 *  "direct" = the coordinator's own emission, re-verifiable from calldata;
 *  "batch" = the batch verifier's re-emission, proved once inside a batch. */
export type SettlementUniverse = "direct" | "batch";

/** An attestation record with its SETTLEMENT UNIVERSE named. The two emitters
 *  share one topic hash (`FigaroBatchVerifier.Attestation` deliberately
 *  mirrors the coordinator's), so the EMITTING ADDRESS is the only thing that
 *  says which universe a row came from — direct = re-verifiable from
 *  calldata, batch = proved once inside a batch. The tag preserves that
 *  evidentiary difference through the fold. */
export type UniverseAttestationEvent = AttestationEvent & { universe: SettlementUniverse };

/**
 * The pure fold under `fetchAttestationRecords`: tag each already-fetched
 * stream with its universe and merge in (blockNumber) order. The emitters
 * share one topic hash, so the caller's ADDRESS-FILTERED fetch is what
 * separates the streams — this fold only preserves that separation.
 */
export function tagAttestationUniverses(directLogs: Log[], batchLogs: Log[]): UniverseAttestationEvent[] {
    const out: UniverseAttestationEvent[] = [];
    for (const ev of parseAttestationLogs(directLogs)) out.push({ ...ev, universe: "direct" });
    for (const ev of parseAttestationLogs(batchLogs)) out.push({ ...ev, universe: "batch" });
    return out.sort((a, b) => a.blockNumber - b.blockNumber);
}

/**
 * Fetch attestations from BOTH settlement universes — the coordinator (direct
 * path) and, when a batch verifier is configured, its re-emissions — each
 * stream fetched ADDRESS-FILTERED and tagged, never merged blind
 * (docs/SCALING_STRATEGY.md § "A reader must fold BOTH": a reader that
 * watches only the coordinator under-reports everything that scaled).
 * Returned in (blockNumber) order across both streams. Note the boundary:
 * only ATTESTATIONS cross into log-space from the batch universe — core order
 * events have no batch counterpart (a batch settles token positions; no
 * status, no process record re-emits), so `fetchCoreEvents` is direct-path by
 * construction, not by omission.
 */
export async function fetchAttestationRecords(
    client: PublicClient,
    addresses: FigaroAddresses,
    fromBlock: bigint = 0n,
    toBlock: bigint | "latest" = "latest",
    chunkSize?: bigint,
): Promise<UniverseAttestationEvent[]> {
    const fetchFrom = async (address: Address | undefined): Promise<Log[]> =>
        address ? fetchLogsChunked(client, { address, fromBlock, toBlock, chunkSize }) : [];
    const directLogs = await fetchFrom(addresses.attestationCoordinator);
    const batchLogs = await fetchFrom(addresses.batchVerifier);
    return tagAttestationUniverses(directLogs, batchLogs);
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
                clauseId: a.clauseId as Hex,
                stage: Number(a.stage),
                contentRef: a.contentRef as Hex,
                blockNumber: Number(log.blockNumber ?? 0),
                transactionHash: (log.transactionHash ?? null) as Hex | null,
            });
        } catch {
            // Skip non-matching logs
        }
    }
    return results;
}



// ── Chunked log fetch ────────────────────────────────────────────────────────

/**
 * Default chunk size for `fetchLogsChunked` — comfortably under the 10k-block
 * range cap common on public RPC providers (some cap by result count
 * instead; `chunkSize` is a per-call override for those).
 */
export const DEFAULT_LOG_CHUNK_SIZE = 9_500n;

/**
 * `client.getLogs` in sequential sub-ranges of at most `chunkSize` blocks,
 * concatenated in block order.
 *
 * Every bulk fetcher in this SDK (`fetchCoreEvents`, `fetchDiscoveryEvents`,
 * the RPGF mirror's `fetchUsageRecords`/`fetchBatchUsageRecords`) used to
 * issue ONE unchunked `getLogs` over the full range — fine on a local devnet,
 * but public RPC providers commonly cap a single call's block range (10k
 * blocks, or a result-count limit), so an integrator's first wide-range read
 * against a real deployment simply fails. This is chunking only — no
 * retry/backoff beyond what `client.getLogs` already does.
 *
 * `toBlock: "latest"` is resolved once via `getBlockNumber` so every
 * sub-range chunks against the same snapshot instead of a moving target.
 */
export async function fetchLogsChunked(
    client: PublicClient,
    params: {
        address: Address;
        fromBlock: bigint;
        toBlock: bigint | "latest";
        chunkSize?: bigint;
    },
): Promise<Log[]> {
    const chunkSize = params.chunkSize ?? DEFAULT_LOG_CHUNK_SIZE;
    if (chunkSize <= 0n) throw new Error("fetchLogsChunked: chunkSize must be positive");

    const resolvedToBlock = params.toBlock === "latest" ? await client.getBlockNumber() : params.toBlock;

    const logs: Log[] = [];
    let from = params.fromBlock;
    while (from <= resolvedToBlock) {
        const to = from + chunkSize - 1n < resolvedToBlock ? from + chunkSize - 1n : resolvedToBlock;
        const chunk = await client.getLogs({ address: params.address, fromBlock: from, toBlock: to });
        logs.push(...chunk);
        from = to + 1n;
    }
    return logs;
}

// ── Bulk fetch helpers ──────────────────────────────────────────────────────

/**
 * Fetch all core events from the given block range and return parsed typed objects.
 * This is the primary entry point for agents bootstrapping state.
 *
 * `chunkSize` overrides `DEFAULT_LOG_CHUNK_SIZE` for providers with a
 * different (or no) block-range cap — see `fetchLogsChunked`.
 */
export async function fetchCoreEvents(
    client: PublicClient,
    addresses: FigaroAddresses,
    fromBlock: bigint = 0n,
    toBlock: bigint | "latest" = "latest",
    chunkSize?: bigint,
) {
    const logs = await fetchLogsChunked(client, {
        address: addresses.core,
        fromBlock,
        toBlock,
        chunkSize,
    });

    return {
        orderCommitted: parseOrderCommittedLogs(logs),
        orderResolved: parseOrderResolvedLogs(logs),
        processResolved: parseProcessResolvedLogs(logs),
    };
}
