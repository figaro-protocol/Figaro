/**
 * @figaro-protocol/sdk — Cross-endpoint log agreement
 *
 * Load-balanced public RPC endpoints can return DIVERGENT event sets over the
 * same pinned block range (observed 2026-08-26: one provider's rotation
 * answered the same query with 2 vs 0 orders, 0 vs 16 clause registrations) —
 * a reader on one endpoint silently under-reports and never learns it. This
 * module makes that divergence a checkable fact: given what N endpoints each
 * returned for one pinned `[fromBlock, toBlock]` range, it reports
 * per-endpoint counts, the union/intersection delta, and a verdict the caller
 * renders.
 *
 * Pure by design: `checkEndpointLogAgreement` fetches nothing — the caller
 * supplies each endpoint's event set and the identity key to compare by. No
 * endpoint list is bundled; an endpoint label is the caller's own string,
 * opaque here. The thin `fetchEndpointLogAgreement` convenience runs the same
 * pinned fetch over CALLER-SUPPLIED clients and hands the sets to the pure
 * check.
 *
 * Fewer than two endpoints is `"unchecked"`, never a warning: corroboration
 * needs a second witness, and its absence is absence.
 */

import type { PublicClient, Log } from "viem";
import type { Address } from "./types.js";
import { fetchLogsChunked } from "./events.js";

// ── The pure check ──────────────────────────────────────────────────────────

/** One endpoint's answer for the pinned range: the caller's label plus the
 *  events (of any shape) that endpoint returned. */
export interface EndpointLogSet<T> {
    /** The caller's own name for the endpoint (a URL, an index) — opaque here. */
    endpoint: string;
    events: T[];
}

/** One endpoint's row in the report. */
export interface EndpointLogCount {
    endpoint: string;
    /** Distinct events this endpoint returned (by the caller's key). */
    count: number;
    /** Union keys this endpoint did NOT return — its under-report. */
    missing: string[];
}

/** `"unchecked"` below two endpoints; `"agree"` iff every endpoint returned
 *  the same set; `"diverge"` otherwise. */
export type EndpointLogAgreementVerdict = "agree" | "diverge" | "unchecked";

export interface EndpointLogAgreementReport {
    fromBlock: bigint;
    toBlock: bigint;
    endpoints: EndpointLogCount[];
    /** Distinct events across every endpoint — the most any single reader
     *  could have seen. */
    unionCount: number;
    /** Distinct events EVERY endpoint returned — what all witnesses agree on. */
    intersectionCount: number;
    /** The delta: union keys at least one endpoint lacks, sorted. Empty iff
     *  the endpoints agree. */
    disputedKeys: string[];
    verdict: EndpointLogAgreementVerdict;
}

/**
 * Report agreement between the event sets N endpoints returned for ONE pinned
 * `[fromBlock, toBlock]` range. The caller fetched the sets (same query, same
 * range, per endpoint) and supplies `keyOf` — the event's identity for
 * comparison (for raw logs, block number + transaction hash + log index).
 *
 * Duplicate keys within one endpoint's set collapse to one: the question is
 * WHICH events each endpoint saw, not how many times.
 */
export function checkEndpointLogAgreement<T>(
    range: { fromBlock: bigint; toBlock: bigint },
    sets: EndpointLogSet<T>[],
    keyOf: (event: T) => string,
): EndpointLogAgreementReport {
    const keySets = sets.map(({ endpoint, events }) => ({
        endpoint,
        keys: new Set(events.map(keyOf)),
    }));

    const union = new Set<string>();
    for (const { keys } of keySets) for (const k of keys) union.add(k);

    const intersection = new Set<string>();
    for (const k of union) {
        if (keySets.every(({ keys }) => keys.has(k))) intersection.add(k);
    }

    const disputedKeys = [...union].filter((k) => !intersection.has(k)).sort();
    const endpoints: EndpointLogCount[] = keySets.map(({ endpoint, keys }) => ({
        endpoint,
        count: keys.size,
        missing: [...union].filter((k) => !keys.has(k)).sort(),
    }));

    return {
        fromBlock: range.fromBlock,
        toBlock: range.toBlock,
        endpoints,
        unionCount: union.size,
        intersectionCount: intersection.size,
        disputedKeys,
        verdict: sets.length < 2 ? "unchecked" : disputedKeys.length === 0 ? "agree" : "diverge",
    };
}

// ── The thin fetch convenience ──────────────────────────────────────────────

/** A caller-supplied client paired with the caller's label for it. */
export interface EndpointClient {
    endpoint: string;
    client: PublicClient;
}

/**
 * Fetch one contract's logs over one PINNED `[fromBlock, toBlock]` range from
 * each caller-supplied client (chunked, like every bulk fetcher here), then
 * run the pure check. `toBlock` is a block number by type: a moving `"latest"`
 * resolves differently per endpoint and would report divergence that is only
 * lag. Raw logs are keyed by block number + transaction hash + log index.
 *
 * A client that throws propagates — an endpoint that cannot answer is a
 * different fact from one that answers short, and the caller decides what to
 * do with it.
 */
export async function fetchEndpointLogAgreement(
    clients: EndpointClient[],
    params: { address: Address; fromBlock: bigint; toBlock: bigint; chunkSize?: bigint },
): Promise<EndpointLogAgreementReport> {
    const sets = await Promise.all(
        clients.map(async ({ endpoint, client }) => ({
            endpoint,
            events: await fetchLogsChunked(client, {
                address: params.address,
                fromBlock: params.fromBlock,
                toBlock: params.toBlock,
                chunkSize: params.chunkSize,
            }),
        })),
    );
    return checkEndpointLogAgreement(
        { fromBlock: params.fromBlock, toBlock: params.toBlock },
        sets,
        (log: Log) => `${log.blockNumber ?? ""}:${log.transactionHash ?? ""}:${log.logIndex ?? ""}`,
    );
}
