/**
 * Cached event log indexer — the single query layer for all historical
 * on-chain event reads.
 *
 * Every hook that needs historical logs should call functions from this
 * module instead of publicClient.getLogs() directly. Under the hood,
 * cachedGetLogs (from eventCache.ts) caches all events per
 * (chainId, contract, eventName) in IndexedDB. Subsequent calls only
 * fetch incremental blocks.
 *
 * Transition path:
 *   Level 0A (now)  — IndexedDB + in-memory cache over getLogs
 *   Level 0B         — Self-hosted indexer: swap implementations below
 *   Level 1          — Hosted indexer (Sequence, Envio): swap again
 *
 * The hooks never touch getLogs directly, so a backend migration is a
 * single-file change. The order consumers read the parsed history through
 * `getCoreEvents` and live updates through `useWatchOrderEvents`
 * (`@/lib/core/useWatchOrderEvents`), both over every order emitter. This
 * file imports nothing from `wagmi`, so a page with no wallet provider reads
 * through it; the live watcher is a wagmi hook and lives apart.
 */

import type { PublicClient } from "viem";
import { cachedGetLogs, cachedGetReceiptLogs } from "./eventCache";
import { hexEqual } from "@/lib/shared/evm";
import { CONTRACTS } from "./contracts";
import {
    EV_ORDER_COMMITTED,
    EV_ORDER_SELLER,
    EV_ORDER_RESOLVED,
    EV_PROCESS_RESOLVED,
    parseOrderCommittedLogs,
    parseOrderResolvedLogs,
    parseProcessResolvedLogs,
    type Address,
    type CoreEvents,
    type Order,
    type ResolutionUniverse,
} from "@figaro-protocol/sdk";
import { projectProcessGraph, walletRecord } from "@figaro-protocol/sdk/derive";

/** Every contract that emits the Core's order and process events. */
export const ORDER_EMITTERS = (): string[] => [CONTRACTS.core, CONTRACTS.batchVerifier];

/** The two order emitters, each with the path it is. The two emit one set of
 *  topics, so the address of a log is what says which path a row is on. */
const EMITTER_PATHS = (): ReadonlyArray<readonly [ResolutionUniverse, string]> => [
    ["direct", CONTRACTS.core],
    ["batch", CONTRACTS.batchVerifier],
];

/** Each path's share of a mixed set of order-emitter logs, parsed: the logs a
 *  path's own contract emitted, read by their address at read time. A path
 *  whose contract is not configured, or emitted none of the logs, is absent. */
export function parseCoreLogsByPath(logs: {
    committed: readonly unknown[];
    resolved: readonly unknown[];
    processResolved: readonly unknown[];
}): Array<{ path: ResolutionUniverse; events: CoreEvents }> {
    const out: Array<{ path: ResolutionUniverse; events: CoreEvents }> = [];
    for (const [path, emitter] of EMITTER_PATHS()) {
        if (!emitter) continue;
        const mine = (rows: readonly unknown[]) =>
            rows.filter((log) => hexEqual((log as { address?: string }).address, emitter));
        const own = { committed: mine(logs.committed), resolved: mine(logs.resolved), processResolved: mine(logs.processResolved) };
        if (own.committed.length + own.resolved.length + own.processResolved.length === 0) continue;
        out.push({ path, events: parseCoreLogs(own) });
    }
    return out;
}

export type IndexedLog = Awaited<ReturnType<typeof cachedGetLogs>>[number];
type IndexedLogWithArgs = IndexedLog & { args?: Record<string, unknown> };

// ── Dual-source merge helper ─────────────────────────────────────────────────

/**
 * Fetch the same event type from one or more contract addresses and merge
 * results by block number (ascending). The order and process events have two
 * emitters: FigaroCore on the direct path and FigaroBatchVerifier on the batch
 * path, which emits the same events for every batched order.
 */
export async function cachedGetLogsMulti(
    client: PublicClient,
    chainId: number,
    addresses: string[],
    opts: { event: Parameters<typeof cachedGetLogs>[2]["event"]; eventName: string },
): Promise<IndexedLog[]> {
    const validAddrs = addresses.filter((a) => !!a);
    if (validAddrs.length === 0) return [];
    const results = await Promise.all(
        validAddrs.map((addr) =>
            cachedGetLogs(client, chainId, {
                address: addr as `0x${string}`,
                event: opts.event,
                eventName: opts.eventName,
            }),
        ),
    );
    if (results.length === 1) return results[0];
    // Merge and sort by block, then by position in the block.
    const merged = results.flat();
    merged.sort(
        (a, b) =>
            Number(a.blockNumber ?? 0) - Number(b.blockNumber ?? 0) ||
            Number(a.logIndex ?? 0) - Number(b.logIndex ?? 0),
    );
    return merged;
}

function getLogArgs(log: IndexedLog): Record<string, unknown> {
    return (log as IndexedLogWithArgs).args ?? {};
}

export function getStringArg(log: IndexedLog, key: string): string | null {
    const value = getLogArgs(log)[key];
    return typeof value === "string" ? value : null;
}

// ---------------------------------------------------------------------------
// Low-level: cached full-event-type fetchers
// ---------------------------------------------------------------------------

export async function getAllOrderCommitted(client: PublicClient, chainId: number) {
    return cachedGetLogsMulti(client, chainId, ORDER_EMITTERS(), {
        event: EV_ORDER_COMMITTED,
        eventName: "OrderCommitted",
    });
}

export async function getAllOrderResolved(client: PublicClient, chainId: number) {
    return cachedGetLogsMulti(client, chainId, ORDER_EMITTERS(), {
        event: EV_ORDER_RESOLVED,
        eventName: "OrderResolved",
    });
}

/** `ProcessResolved` — the process-level resolution event. The per-order
 *  readers above answer "what happened to this order"; this one is the third
 *  leg of the SDK's `CoreEvents` triple (`getCoreEvents`), which the graph
 *  projections (`@figaro-protocol/sdk/derive`) fold to know a process closed. */
async function getAllProcessResolved(client: PublicClient, chainId: number) {
    return cachedGetLogsMulti(client, chainId, ORDER_EMITTERS(), {
        event: EV_PROCESS_RESOLVED,
        eventName: "ProcessResolved",
    });
}

// ---------------------------------------------------------------------------
// Parsed: the SDK's `CoreEvents` triple (live: `useWatchOrderEvents`)
// ---------------------------------------------------------------------------

/** The raw-log shape the SDK parsers take — cached rows and watcher logs both
 *  carry data/topics, so the one decoder runs over either. */
type SdkLogs = Parameters<typeof parseOrderCommittedLogs>[0];

/** Decode raw order-emitter logs into the SDK's `CoreEvents` triple; each
 *  parser keeps only its own event, so a mixed batch decodes in one pass. */
function parseCoreLogs(logs: {
    committed: readonly unknown[];
    resolved: readonly unknown[];
    processResolved: readonly unknown[];
}): CoreEvents {
    return {
        orderCommitted: parseOrderCommittedLogs(logs.committed as unknown as SdkLogs),
        orderResolved: parseOrderResolvedLogs(logs.resolved as unknown as SdkLogs),
        processResolved: parseProcessResolvedLogs(logs.processResolved as unknown as SdkLogs),
    };
}

/** The Core's order and process history across every order emitter, parsed
 *  — the one read every order consumer starts from. `committedLogs` are the
 *  raw `OrderCommitted` rows, kept for a reader that follows a commit to its
 *  transaction's receipt (`getReceiptLogsOf`). `byPath` is the same history
 *  split by the path whose contract emitted each row, for a reader that marks
 *  each order with its path (`Topology.applyEvents(events, path)`). */
export async function getCoreEvents(
    client: PublicClient,
    chainId: number,
): Promise<{
    events: CoreEvents;
    committedLogs: IndexedLog[];
    byPath: Array<{ path: ResolutionUniverse; events: CoreEvents }>;
}> {
    const [committed, resolved, processResolved] = await Promise.all([
        getAllOrderCommitted(client, chainId),
        getAllOrderResolved(client, chainId),
        getAllProcessResolved(client, chainId),
    ]);
    return {
        events: parseCoreLogs({ committed, resolved, processResolved }),
        committedLogs: committed,
        byPath: parseCoreLogsByPath({ committed, resolved, processResolved }),
    };
}

/** Every order `wallet` is a party to (buyer or seller), once each — an order
 *  where the wallet is both parties appears once — ordered by block. The fold
 *  is the SDK's (`projectProcessGraph` + `walletRecord`), the same one
 *  `/data/explore` answers wallet history with. */
export function walletOrders(events: CoreEvents, wallet: string): Order[] {
    const record = walletRecord(projectProcessGraph(events), wallet as Address);
    const seen = new Set<string>();
    const orders: Order[] = [];
    for (const o of [...record.ordersAsBuyer, ...record.ordersAsSeller]) {
        if (seen.has(o.orderHash)) continue;
        seen.add(o.orderHash);
        orders.push(o);
    }
    return orders.sort((a, b) => a.blockNumber - b.blockNumber);
}

// ---------------------------------------------------------------------------
// Higher-level: filtered queries (client-side filter on cached data)
// ---------------------------------------------------------------------------

/** OrderCommitted logs where the indexed buyer matches. */
export async function getOrderCommittedByBuyer(client: PublicClient, chainId: number, buyer: string) {
    const all = await getAllOrderCommitted(client, chainId);
    return all.filter((log) => hexEqual(getStringArg(log, "buyer"), buyer));
}

/** Every OrderSeller log from both order emitters (`FigaroCore` and
 *  `FigaroBatchVerifier`), through the event cache. It passes no topic, so the
 *  indexed seller is not used in the read: the caller filters by seller on the
 *  client. */
async function getAllOrderSeller(client: PublicClient, chainId: number) {
    return cachedGetLogsMulti(client, chainId, ORDER_EMITTERS(), {
        event: EV_ORDER_SELLER,
        eventName: "OrderSeller",
    });
}

/**
 * OrderCommitted logs where the seller matches.
 * Uses the OrderSeller companion event, its seller matched on the client, to find orderHashes,
 * then pulls the full OrderCommitted log for each matching order.
 */
export async function getOrderCommittedBySeller(client: PublicClient, chainId: number, seller: string) {
    const sellerLogs = await getAllOrderSeller(client, chainId);
    const matchHashes = new Set(
        sellerLogs
            .filter((log) => hexEqual(getStringArg(log, "seller"), seller))
            .map((log) => getStringArg(log, "orderHash"))
            .filter((orderHash): orderHash is string => typeof orderHash === "string"),
    );
    if (matchHashes.size === 0) return [];
    const all = await getAllOrderCommitted(client, chainId);
    return all.filter((log) => {
        const orderHash = getStringArg(log, "orderHash");
        return orderHash ? matchHashes.has(orderHash) : false;
    });
}

/** The logs of the transaction that emitted `log` — read once per
 *  transaction hash and cached beside the event logs. A commit transaction's
 *  receipt carries any funding legs (`readFundingLegs`,
 *  `@figaro-protocol/sdk/derive`). */
export async function getReceiptLogsOf(client: PublicClient, chainId: number, log: IndexedLog) {
    const transactionHash = log.transactionHash as `0x${string}` | null | undefined;
    if (!transactionHash) return null;
    return cachedGetReceiptLogs(client, chainId, {
        transactionHash,
        blockHash: (log.blockHash as `0x${string}` | null | undefined) ?? null,
    });
}

// The attestation readers (AttestationCoordinator, and the verifier's
// re-emissions) are lib/core/attestationIndexer.ts.
