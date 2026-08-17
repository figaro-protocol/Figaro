/**
 * IndexedDB-backed event log cache with incremental sync.
 *
 * On first call for a given (chainId, contract, eventName), fetches ALL
 * historical logs from block 0 (or NEXT_PUBLIC_DEPLOYMENT_BLOCK) and caches
 * them. Subsequent calls only fetch from lastSyncedBlock + 1.
 *
 * The cache is transparent to consumers — it returns the same viem Log
 * objects that publicClient.getLogs() would return. BigInt values survive
 * the IndexedDB round-trip via a tagged JSON encoding.
 *
 * This is the Level 0A indexer strategy: zero infrastructure, pure browser
 * storage, ~10–50× speedup over scanning from block 0 on every render.
 * Designed as a swap-point: replace cachedGetLogs() with a backend call
 * (Sequence, Envio, etc.) when the time comes.
 */

import { getAbiItem, type Abi, type Hex, type PublicClient } from "viem";

type PublicGetLogsParams = NonNullable<Parameters<PublicClient["getLogs"]>[0]>;

type CachedLog = {
    blockNumber?: number | bigint | null;
    transactionHash?: Hex | null;
    logIndex?: number | bigint | null;
    args?: Record<string, unknown>;
} & Record<string, unknown>;

// ---------------------------------------------------------------------------
// In-memory first layer (avoids IDB reads on re-renders within the same
// page session)
// ---------------------------------------------------------------------------

interface CacheEntry {
    logs: CachedLog[];
    cursor: bigint; // last synced block number
}

const mem = new Map<string, CacheEntry>();

// Dedup in-flight fetches: if two hooks call cachedGetLogs for the same key
// concurrently, we coalesce into a single RPC round-trip.
const inflight = new Map<string, Promise<CachedLog[]>>();

// ---------------------------------------------------------------------------
// Key helpers
// ---------------------------------------------------------------------------

function cacheKey(chainId: number, contract: string, eventName: string): string {
    return `${chainId}:${contract.toLowerCase()}:${eventName}`;
}

const deploymentBlock = (): bigint => {
    if (typeof process !== "undefined" && process.env?.NEXT_PUBLIC_DEPLOYMENT_BLOCK) {
        return BigInt(process.env.NEXT_PUBLIC_DEPLOYMENT_BLOCK);
    }
    return 0n;
};

// ---------------------------------------------------------------------------
// BigInt-safe JSON encoding
// ---------------------------------------------------------------------------

const BI_TAG = "\x00bi:";

function replacer(_k: string, v: unknown): unknown {
    return typeof v === "bigint" ? `${BI_TAG}${v.toString()}` : v;
}

function reviver(_k: string, v: unknown): unknown {
    return typeof v === "string" && v.startsWith(BI_TAG) ? BigInt(v.slice(BI_TAG.length)) : v;
}

// ---------------------------------------------------------------------------
// IndexedDB persistence (best-effort — failures are silent)
// ---------------------------------------------------------------------------

const DB_NAME = "figaro-events";
const DB_VERSION = 1;
const STORE = "logs";

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
    if (typeof indexedDB === "undefined") return Promise.reject(new Error("no indexedDB"));
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(STORE)) {
                db.createObjectStore(STORE);
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => {
            dbPromise = null;
            reject(req.error);
        };
    });
    return dbPromise;
}

async function idbRead(key: string): Promise<CacheEntry | null> {
    try {
        const db = await openDB();
        return new Promise((resolve) => {
            const tx = db.transaction(STORE, "readonly");
            const req = tx.objectStore(STORE).get(key);
            req.onsuccess = () => {
                const val = req.result;
                if (!val) {
                    resolve(null);
                    return;
                }
                try {
                    resolve({
                        logs: JSON.parse(val.logs, reviver),
                        cursor: BigInt(val.cursor),
                    });
                } catch {
                    resolve(null);
                }
            };
            req.onerror = () => resolve(null);
        });
    } catch {
        return null;
    }
}

async function idbWrite(key: string, logs: CachedLog[], cursor: bigint): Promise<void> {
    try {
        const db = await openDB();
        await new Promise<void>((resolve) => {
            const tx = db.transaction(STORE, "readwrite");
            tx.objectStore(STORE).put(
                { logs: JSON.stringify(logs, replacer), cursor: cursor.toString() },
                key,
            );
            tx.oncomplete = () => resolve();
            tx.onerror = () => resolve();
        });
    } catch {
        // silent — cache miss is fine
    }
}

// ---------------------------------------------------------------------------
// Adaptive range scan
// ---------------------------------------------------------------------------

/** The smallest sub-range worth asking for; below it the provider's cap is
 *  not a range cap and the error is real. */
const MIN_LOG_CHUNK = 500n;

/** A provider refusing a range for its size, in the wording each gateway
 *  uses today (thirdweb: "Maximum allowed number of requested blocks";
 *  drpc: "ranges over N blocks are not supported"; publicnode: "exceed
 *  maximum block range"; 1rpc: "limited to 0 - 50 blocks range"; Alchemy /
 *  Infura: "block range" / "query returned more than"). Matched on the full
 *  error text so viem's wrapping never hides it. */
export function isLogRangeCapError(err: unknown): boolean {
    const text = err instanceof Error
        ? `${err.message} ${(err as { details?: string }).details ?? ""} ${(err as { shortMessage?: string }).shortMessage ?? ""}`
        : String(err);
    return /block range|requested blocks|blocks range|ranges? over \d+ blocks|range too large|response size exceeded|query returned more than|too many results|exceed maximum/i.test(text);
}

/**
 * `client.getLogs` over `[fromBlock, latest]`, in ONE call when the provider
 * allows it and in sequential sub-ranges when it does not: on a range-cap
 * error the current window halves (down to `MIN_LOG_CHUNK`) and the scan
 * continues from where it stopped; every other error propagates. `latest`
 * is resolved once so the sub-ranges chunk against one snapshot. Exported
 * for the cache and its test — the cache is the ONE place logs are read.
 */
/** The two calls the scan needs — structural, so a viem `PublicClient` and
 *  a test double both fit. */
export type LogScanClient = {
    getBlockNumber(args?: { cacheTime?: number }): Promise<bigint>;
    getLogs(params: {
        address: `0x${string}`;
        event: PublicGetLogsParams["event"];
        fromBlock: bigint;
        toBlock: bigint;
    }): Promise<readonly unknown[]>;
};

export async function getLogsAdaptive(
    client: LogScanClient,
    params: { address: `0x${string}`; event: PublicGetLogsParams["event"]; fromBlock: bigint },
): Promise<CachedLog[]> {
    // Uncached: viem memoises getBlockNumber for `cacheTime` (4 s default);
    // a read fired right after a receipt would otherwise bound the range
    // BELOW the block that just landed and miss its events.
    const toBlock = await client.getBlockNumber({ cacheTime: 0 });
    if (params.fromBlock > toBlock) return [];
    const logs: CachedLog[] = [];
    let from = params.fromBlock;
    let window = toBlock - from + 1n;
    while (from <= toBlock) {
        const to = from + window - 1n < toBlock ? from + window - 1n : toBlock;
        try {
            const chunk = await client.getLogs({
                address: params.address,
                event: params.event,
                fromBlock: from,
                toBlock: to,
            });
            logs.push(...(chunk as CachedLog[]));
            from = to + 1n;
        } catch (err) {
            if (!isLogRangeCapError(err) || window <= MIN_LOG_CHUNK) throw err;
            window = window / 2n < MIN_LOG_CHUNK ? MIN_LOG_CHUNK : window / 2n;
        }
    }
    return logs;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Drop-in cached wrapper for publicClient.getLogs().
 *
 * Fetches ALL logs for the given (contract, event) — no arg-based filtering
 * at the RPC level. Callers filter client-side on the returned array. This
 * ensures a single cache per event type that serves all query shapes.
 */
export async function cachedGetLogs(
    client: PublicClient,
    chainId: number,
    params: {
        address: `0x${string}`;
        event: unknown;
        eventName: string;
    },
): Promise<CachedLog[]> {
    const key = cacheKey(chainId, params.address, params.eventName);

    // Coalesce concurrent requests for the same key
    const existing = inflight.get(key);
    if (existing) return existing;

    const promise = _fetchAndCache(client, chainId, key, params);
    inflight.set(key, promise);
    try {
        return await promise;
    } finally {
        inflight.delete(key);
    }
}

/**
 * `publicClient.getContractEvents` shaped over the cache: resolves the event
 * from the ABI and returns EVERY log of that event for the contract, from
 * the deployment block, adaptively chunked and cached. Callers that used to
 * pass RPC-side `args` filters filter the returned array instead — one cache
 * per (contract, event) serves every query shape (see `cachedGetLogs`).
 */
export async function cachedGetContractEvents(
    client: PublicClient,
    chainId: number,
    params: { address: `0x${string}`; abi: Abi | readonly unknown[]; eventName: string },
): Promise<CachedLog[]> {
    const event = getAbiItem({ abi: params.abi as Abi, name: params.eventName });
    if (!event) throw new Error(`cachedGetContractEvents: ${params.eventName} is not in the given ABI`);
    return cachedGetLogs(client, chainId, { address: params.address, event, eventName: params.eventName });
}

async function _fetchAndCache(
    client: PublicClient,
    _chainId: number,
    key: string,
    params: { address: `0x${string}`; event: unknown; eventName: string },
): Promise<CachedLog[]> {
    // 1. Check memory
    let entry = mem.get(key) ?? null;

    // 2. Fall back to IDB
    if (!entry) {
        entry = await idbRead(key);
        if (entry) mem.set(key, entry);
    }

    // 3. Chain-reset detection: if the chain's latest block is behind the
    //    cached cursor, the node was likely restarted (e.g. Anvil). Discard
    //    the stale cache and re-scan from the deployment block.
    if (entry) {
        const latestBlock = await client.getBlockNumber({ cacheTime: 0 });
        if (latestBlock < entry.cursor) {
            entry = null;
            mem.delete(key);
        }
    }

    // 4. Determine start block
    const startBlock = entry ? entry.cursor + 1n : deploymentBlock();

    // 5. Fetch incremental logs — adaptively chunked: public providers cap
    //    an eth_getLogs block range (1 000 / 10 000 / 50 000 blocks depending
    //    on the gateway) and refuse the whole-range read a devnet answers in
    //    one call; the first visit to a public network otherwise never loads.
    const fresh = await getLogsAdaptive(client as unknown as LogScanClient, {
        address: params.address,
        event: params.event as PublicGetLogsParams["event"],
        fromBlock: startBlock,
    });

    // 6. Current block for cursor (use the max blockNumber from fresh logs
    //    if available, otherwise query the chain)
    let newCursor: bigint;
    if (fresh.length > 0) {
        newCursor = fresh.reduce(
            (max, l) => {
                const bn = typeof l.blockNumber === "bigint" ? l.blockNumber : 0n;
                return bn > max ? bn : max;
            },
            0n,
        );
    } else if (entry) {
        // No new logs — keep cursor but advance to latest so we don't re-query
        // the same empty range next time.
        newCursor = await client.getBlockNumber({ cacheTime: 0 });
    } else {
        newCursor = await client.getBlockNumber({ cacheTime: 0 });
    }

    // 7. Merge with dedup — use (blockNumber, txHash, logIndex) as fingerprint
    const existing = entry?.logs ?? [];
    let merged: CachedLog[];
    if (existing.length > 0 && fresh.length > 0) {
        const seen = new Set<string>(
            existing.map((l) => `${l.blockNumber}:${l.transactionHash}:${l.logIndex}`),
        );
        const uniqueFresh = fresh.filter(
            (l) => !seen.has(`${l.blockNumber}:${l.transactionHash}:${l.logIndex}`),
        );
        merged = [...existing, ...uniqueFresh];
    } else {
        merged = [...existing, ...fresh];
    }
    const updated: CacheEntry = { logs: merged, cursor: newCursor };
    mem.set(key, updated);

    // 8. Persist (non-blocking)
    idbWrite(key, merged, newCursor).catch(() => { });

    return merged;
}

