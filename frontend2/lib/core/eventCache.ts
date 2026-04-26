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

import type { Hex, PublicClient } from "viem";

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
        const latestBlock = await client.getBlockNumber();
        if (latestBlock < entry.cursor) {
            entry = null;
            mem.delete(key);
        }
    }

    // 4. Determine start block
    const startBlock = entry ? entry.cursor + 1n : deploymentBlock();

    // 5. Fetch incremental logs
    const fresh = await client.getLogs({
        address: params.address,
        event: params.event as PublicGetLogsParams["event"],
        fromBlock: startBlock,
        toBlock: "latest",
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
        newCursor = await client.getBlockNumber();
    } else {
        newCursor = await client.getBlockNumber();
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

/**
 * Invalidate cache for a chain (or all chains). Call on chain switch or
 * when contract addresses change.
 */
export function invalidateCache(chainId?: number): void {
    if (chainId !== undefined) {
        const prefix = `${chainId}:`;
        for (const k of mem.keys()) {
            if (k.startsWith(prefix)) mem.delete(k);
        }
    } else {
        mem.clear();
    }
    // IDB invalidation is best-effort; stale entries are harmless because
    // the cursor will cause a re-fetch from the right block.
}
