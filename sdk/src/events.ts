/**
 * @figaro-protocol/sdk — Event Parser
 *
 * Decodes raw EVM logs into typed Figaro event objects.
 * Stateless — takes logs in, returns structured data out.
 *
 * The order and process events have two emitters, one per resolution path:
 * `FigaroCore` (direct) and `FigaroBatchVerifier` (batched), with the same
 * event shapes and topics, so a reader filters by address and folds both —
 * `fetchCoreEvents` for orders and processes, `fetchAttestationRecords` for
 * attestations (docs/SCALING_STRATEGY.md § "A reader must fold BOTH").
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
                checkoutHash: a.checkoutHash as Hex,
                salt: a.salt as bigint,
                deadline: a.deadline as bigint,
                blockNumber: Number(log.blockNumber ?? 0),
                transactionHash: (log.transactionHash ?? null) as Hex | null,
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

/** The two resolution universes an attestation anchor can come from:
 *  "direct" = the coordinator's own emission, re-verifiable from calldata;
 *  "batch" = the batch verifier's re-emission, proved once inside a batch. */
export type ResolutionUniverse = "direct" | "batch";

/** An attestation record with its RESOLUTION UNIVERSE named. The two emitters
 *  share one topic hash (`FigaroBatchVerifier.Attestation` deliberately
 *  mirrors the coordinator's), so the EMITTING ADDRESS is the only thing that
 *  says which universe a row came from — direct = re-verifiable from
 *  calldata, batch = proved once inside a batch. The tag preserves that
 *  evidentiary difference through the fold. */
export type UniverseAttestationEvent = AttestationEvent & { universe: ResolutionUniverse };

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
 * Fetch attestations from BOTH resolution universes — the coordinator (direct
 * path) and, when a batch verifier is configured, its re-emissions — each
 * stream fetched ADDRESS-FILTERED and tagged, never merged blind
 * (docs/SCALING_STRATEGY.md § "A reader must fold BOTH": a reader that
 * watches only the coordinator under-reports everything that scaled).
 * Returned in (blockNumber) order across both streams. Its sibling
 * `fetchCoreEvents` folds the same two paths for the order and process
 * events, which the verifier emits under the Core's own shapes.
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
 * the RPGF mirror's `fetchUsageRecords`) used to
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
        // The query names one contract. A log from any other is the node's
        // error, never data: the parsers decode by topic and would read
        // another contract's event as this one's.
        const wanted = params.address.toLowerCase();
        for (const log of chunk) {
            if (log.address.toLowerCase() !== wanted) {
                throw new Error(`fetchLogsChunked: the node answered a log query for ${params.address} with a log from ${log.address} (block ${log.blockNumber}) — refusing its answer`);
            }
        }
        logs.push(...chunk);
        from = to + 1n;
    }
    return logs;
}

// ── Bulk fetch helpers ──────────────────────────────────────────────────────

/**
 * Chain order across several contracts' logs: block number, then log index.
 * Each `fetchLogsChunked` stream is already in this order; merging two of
 * them needs the log index to keep two contracts' logs in one block apart.
 */
function compareChainOrder(a: Log, b: Log): number {
    const ab = a.blockNumber ?? 0n;
    const bb = b.blockNumber ?? 0n;
    if (ab !== bb) return ab < bb ? -1 : 1;
    return (a.logIndex ?? 0) - (b.logIndex ?? 0);
}

/**
 * Fetch the order and process events of BOTH resolution paths from the given
 * block range and return them parsed and typed: `FigaroCore`'s (the direct
 * path) and, when `addresses.batchVerifier` is set, `FigaroBatchVerifier`'s
 * (the batched path), which emits the Core's own `OrderCommitted`,
 * `OrderResolved` and `ProcessResolved` — same fields, same topics — for
 * every commit and resolution a batch carries. Each address is fetched
 * address-filtered and chunked, and the two streams are merged in chain order
 * (block number, then log index) before parsing, so every returned list is in
 * chain order across both paths. A batched order's id is derived under the
 * verifier's EIP-712 domain, so the two paths' ids never coincide.
 * This is the primary entry point for agents bootstrapping state.
 *
 * `chunkSize` overrides `DEFAULT_LOG_CHUNK_SIZE` for providers with a
 * different (or no) block-range cap — see `fetchLogsChunked`. `toBlock:
 * "latest"` is resolved once, so both addresses are read over one range.
 */
export async function fetchCoreEvents(
    client: PublicClient,
    addresses: FigaroAddresses,
    fromBlock: bigint = 0n,
    toBlock: bigint | "latest" = "latest",
    chunkSize?: bigint,
) {
    const resolvedToBlock = toBlock === "latest" ? await client.getBlockNumber() : toBlock;
    const fetchFrom = async (address: Address | undefined): Promise<Log[]> =>
        address ? fetchLogsChunked(client, { address, fromBlock, toBlock: resolvedToBlock, chunkSize }) : [];
    const coreLogs = await fetchFrom(addresses.core);
    const batchLogs = await fetchFrom(addresses.batchVerifier);
    const logs = batchLogs.length === 0 ? coreLogs : [...coreLogs, ...batchLogs].sort(compareChainOrder);

    return {
        orderCommitted: parseOrderCommittedLogs(logs),
        orderResolved: parseOrderResolvedLogs(logs),
        processResolved: parseProcessResolvedLogs(logs),
    };
}

/** Whether one process has resolved, read from chain state. */
export interface ProcessResolvedState {
    processId: Hex;
    /** True once the buyer's resolution of the process is on chain. */
    resolved: boolean;
    /** Block of the process's `ProcessResolved` event, or null when it is
     *  not resolved or its event lies outside the scanned range. */
    resolvedBlock: number | null;
}

/**
 * For each process id, whether the process has resolved, on either path.
 *
 * The direct path is read from `FigaroCore.processes(id)`: a process the Core
 * knows (`rootBuyer` non-zero) has resolved exactly when its
 * `activeOrderCount` is zero, since commit opens a process with one active
 * order and only `resolveProcess` sets the count to zero. The getter is the
 * authority there: a log claiming the resolution of a process the getter
 * shows open is ignored. The batch path keeps no per-process getter (its
 * state is a root), so a process the Core does not know is resolved exactly
 * when `addresses.batchVerifier` emitted its `ProcessResolved` in the range;
 * without a configured verifier such a process reads as not resolved.
 *
 * `resolvedBlock` comes from the `ProcessResolved` event of the path that
 * holds the process, each emitter read address-filtered over
 * `[fromBlock, toBlock]` — pass the deployment record's `deploymentBlock`.
 * It lets a reader compare the resolution with another commit's block. A
 * process the getter shows resolved whose event lies before `fromBlock`
 * returns `resolved: true, resolvedBlock: null`.
 */
export async function fetchProcessesResolved(
    client: PublicClient,
    addresses: FigaroAddresses,
    processIds: readonly Hex[],
    fromBlock: bigint = 0n,
    toBlock: bigint | "latest" = "latest",
    chunkSize?: bigint,
): Promise<ProcessResolvedState[]> {
    const states = await Promise.all(processIds.map((processId) =>
        client.readContract({
            address: addresses.core,
            abi: CORE_ABI,
            functionName: "processes",
            args: [processId],
        }) as Promise<readonly [Address, Address, bigint, bigint]>,
    ));
    const onCore = states.map(([rootBuyer]) => BigInt(rootBuyer) !== 0n);

    const resolvedToBlock = toBlock === "latest" ? await client.getBlockNumber() : toBlock;
    const resolvedBlocks = async (address: Address | undefined): Promise<Map<string, number>> => {
        const out = new Map<string, number>();
        if (!address) return out;
        const logs = await fetchLogsChunked(client, { address, fromBlock, toBlock: resolvedToBlock, chunkSize });
        for (const e of parseProcessResolvedLogs(logs)) out.set(e.processId.toLowerCase(), e.blockNumber);
        return out;
    };
    const coreBlocks = await resolvedBlocks(addresses.core);
    const batchBlocks = onCore.every(Boolean) ? new Map<string, number>() : await resolvedBlocks(addresses.batchVerifier);

    return processIds.map((processId, i) => {
        const key = processId.toLowerCase();
        if (onCore[i]) {
            const resolved = states[i][3] === 0n;
            return { processId, resolved, resolvedBlock: resolved ? coreBlocks.get(key) ?? null : null };
        }
        const block = batchBlocks.get(key);
        return { processId, resolved: block !== undefined, resolvedBlock: block ?? null };
    });
}
