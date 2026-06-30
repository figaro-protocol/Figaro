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
 * single-file change.
 */

import type { PublicClient } from "viem";
import { parseAbiItem } from "viem";
import { cachedGetLogs } from "./eventCache";
import { hexEqual } from "@/lib/shared/evm";
import { CONTRACTS } from "./contracts";
import {
    EV_ORDER_COMMITTED,
    EV_ORDER_SELLER,
    EV_ORDER_RESOLVED,
} from "@figaro/core";

// ── SellerRegistry events ──────────────────────────────────────────────────

// Three seller-registry events survive: registration, profile update, and
// withdrawal. Lifecycle flags (deactivate/reactivate) and on-chain role
// tracking remain stripped — seller availability is signal-by-availability,
// and there is no categorization field at any layer (no archetype, no role,
// no serviceType). What an address does is reconstructed from the events
// it has emitted (registrations, clause attestations, signed commitments).
const EV_SELLER_REGISTERED = parseAbiItem(
    "event SellerRegistered(address indexed seller, string metadataURI)",
);
const EV_SELLER_PROFILE_UPDATED = parseAbiItem(
    "event SellerProfileUpdated(address indexed seller, string metadataURI)",
);
const EV_SELLER_WITHDRAWN = parseAbiItem(
    "event SellerWithdrawn(address indexed seller, uint256 deposit)",
);

export type IndexedLog = Awaited<ReturnType<typeof cachedGetLogs>>[number];
type IndexedLogWithArgs = IndexedLog & { args?: Record<string, unknown> };

// ── Dual-source merge helper ─────────────────────────────────────────────────

/**
 * Fetch the same event type from one or more contract addresses and merge
 * results by block number (ascending). A generic multi-source reader — each
 * protocol event today has a single emitting contract.
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
    // Merge and sort by block number (ascending)
    const merged = results.flat();
    merged.sort((a, b) => Number(a.blockNumber ?? 0) - Number(b.blockNumber ?? 0));
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
    return cachedGetLogs(client, chainId, {
        address: CONTRACTS.core as `0x${string}`,
        event: EV_ORDER_COMMITTED,
        eventName: "OrderCommitted",
    });
}

export async function getAllOrderResolved(client: PublicClient, chainId: number) {
    return cachedGetLogs(client, chainId, {
        address: CONTRACTS.core as `0x${string}`,
        event: EV_ORDER_RESOLVED,
        eventName: "OrderResolved",
    });
}

// ---------------------------------------------------------------------------
// Higher-level: filtered queries (client-side filter on cached data)
// ---------------------------------------------------------------------------

/** OrderCommitted logs where the indexed buyer matches. */
export async function getOrderCommittedByBuyer(client: PublicClient, chainId: number, buyer: string) {
    const all = await getAllOrderCommitted(client, chainId);
    return all.filter((log) => hexEqual(getStringArg(log, "buyer"), buyer));
}

/** OrderSeller logs — indexed seller lookup, no full-table scan. */
async function getAllOrderSeller(client: PublicClient, chainId: number) {
    return cachedGetLogs(client, chainId, {
        address: CONTRACTS.core as `0x${string}`,
        event: EV_ORDER_SELLER,
        eventName: "OrderSeller",
    });
}

/**
 * OrderCommitted logs where the seller matches.
 * Uses the OrderSeller companion event (indexed seller) to find orderHashes,
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

// AttestationCoordinator + DutchAuction event readers are NON-CORE — they live
// in lib/composition/indexer.ts (core must not reference composition contracts).

// ---------------------------------------------------------------------------
// SellerRegistry event fetchers
// ---------------------------------------------------------------------------

export async function getAllSellerRegistered(client: PublicClient, chainId: number) {
    if (!CONTRACTS.sellerRegistry) return [];
    return cachedGetLogsMulti(client, chainId,
        [CONTRACTS.sellerRegistry],
        { event: EV_SELLER_REGISTERED, eventName: "SellerRegistered" },
    );
}

async function getAllSellerProfileUpdated(client: PublicClient, chainId: number) {
    if (!CONTRACTS.sellerRegistry) return [];
    return cachedGetLogsMulti(client, chainId,
        [CONTRACTS.sellerRegistry],
        { event: EV_SELLER_PROFILE_UPDATED, eventName: "SellerProfileUpdated" },
    );
}

async function getAllSellerWithdrawn(client: PublicClient, chainId: number) {
    if (!CONTRACTS.sellerRegistry) return [];
    return cachedGetLogsMulti(client, chainId,
        [CONTRACTS.sellerRegistry],
        { event: EV_SELLER_WITHDRAWN, eventName: "SellerWithdrawn" },
    );
}

/**
 * Derive the current seller roster: latest metadataURI per address,
 * filtered to only those currently registered (Registered minus Withdrawn).
 *
 * "Current metadataURI" is the most recent SellerRegistered or
 * SellerProfileUpdated event for an address, provided no Withdrawn
 * event sits at or after the registration block (withdraw clears the
 * dedup guard, voiding any subsequent profile updates from a stale
 * registration).
 */
export async function getActiveSellers(client: PublicClient, chainId: number) {
    const [registered, profileUpdated, withdrawn] = await Promise.all([
        getAllSellerRegistered(client, chainId),
        getAllSellerProfileUpdated(client, chainId),
        getAllSellerWithdrawn(client, chainId),
    ]);

    function toBlockBigInt(log: IndexedLog): bigint {
        const bn = log.blockNumber;
        if (typeof bn === "bigint") return bn;
        if (typeof bn === "number") return BigInt(bn);
        return 0n;
    }

    // Latest withdraw block per address (re-registration after withdraw is allowed)
    const latestWithdraw = new Map<string, bigint>();
    for (const log of withdrawn) {
        const addr = getStringArg(log, "seller")?.toLowerCase();
        if (!addr) continue;
        const block = toBlockBigInt(log);
        const prev = latestWithdraw.get(addr) ?? 0n;
        if (block > prev) latestWithdraw.set(addr, block);
    }

    // Latest Registered event per address that survives Withdrawn.
    const sellers = new Map<string, { metadataURI: string; registeredBlock: bigint; latestBlock: bigint }>();
    for (const log of registered) {
        const addr = getStringArg(log, "seller")?.toLowerCase();
        if (!addr) continue;
        const block = toBlockBigInt(log);
        const withdrawnAfter = (latestWithdraw.get(addr) ?? 0n) >= block;
        if (withdrawnAfter) continue;
        const prev = sellers.get(addr);
        if (!prev || block > prev.registeredBlock) {
            sellers.set(addr, {
                metadataURI: getStringArg(log, "metadataURI") ?? "",
                registeredBlock: block,
                latestBlock: block,
            });
        }
    }

    // Apply ProfileUpdated events that post-date the surviving Registered event.
    for (const log of profileUpdated) {
        const addr = getStringArg(log, "seller")?.toLowerCase();
        if (!addr) continue;
        const entry = sellers.get(addr);
        if (!entry) continue;
        const block = toBlockBigInt(log);
        if (block < entry.registeredBlock) continue;
        if (block > entry.latestBlock) {
            entry.metadataURI = getStringArg(log, "metadataURI") ?? entry.metadataURI;
            entry.latestBlock = block;
        }
    }

    return Array.from(sellers.entries()).map(([address, op]) => ({
        address,
        metadataURI: op.metadataURI,
    }));
}

/**
 * Get the latest metadataURI for a specific seller address.
 * Returns null if not currently registered (never registered, or withdrawn
 * after most recent registration).
 */
export async function getSellerMetadataURI(client: PublicClient, chainId: number, seller: string) {
    const active = await getActiveSellers(client, chainId);
    const lc = seller.toLowerCase();
    const match = active.find((op) => op.address === lc);
    return match?.metadataURI ?? null;
}

/**
 * Full state for a single seller, derived from events.
 * Returns null if the seller has never registered or has withdrawn after
 * the most recent registration. `registeredBlock` backs the deposit lock-
 * expiry computation; `metadataURI` is the most recent value carried by
 * either the surviving Registered event or any subsequent ProfileUpdated.
 */
export async function getSellerState(
    client: PublicClient,
    chainId: number,
    seller: string,
): Promise<{ metadataURI: string; registeredBlock: bigint | null } | null> {

    const [registered, profileUpdated, withdrawn] = await Promise.all([
        getAllSellerRegistered(client, chainId),
        getAllSellerProfileUpdated(client, chainId),
        getAllSellerWithdrawn(client, chainId),
    ]);

    function toBlockBigInt(log: IndexedLog): bigint {
        const bn = log.blockNumber;
        if (typeof bn === "bigint") return bn;
        if (typeof bn === "number") return BigInt(bn);
        return 0n;
    }

    // Most recent Registered for this address. Track the latest by block;
    // tolerate null/0 blockNumbers by always preferring a candidate over no
    // candidate (test indexers occasionally return blockNumber=null for the
    // very latest tx — picking it is still the right answer).
    let regLog: IndexedLog | undefined;
    let regBlock = 0n;
    for (const log of registered) {
        if (!hexEqual(getStringArg(log, "seller"), seller)) continue;
        const b = toBlockBigInt(log);
        if (!regLog || b > regBlock) {
            regBlock = b;
            regLog = log;
        }
    }
    if (!regLog) return null;

    // If a Withdrawn event exists at or after the most recent Registered,
    // the seller has cleared the dedup guard and is no longer current.
    // Only enforce the comparison when at least one withdraw exists for this
    // seller — otherwise a registration with blockNumber=null (regBlock=0n)
    // would spuriously look "withdrawn" against a default lastWithdrawBlock.
    const sellerWithdraws = withdrawn
        .filter((log) => hexEqual(getStringArg(log, "seller"), seller));
    if (sellerWithdraws.length > 0) {
        const lastWithdrawBlock = sellerWithdraws
            .map(toBlockBigInt)
            .reduce((max, b) => (b > max ? b : max), 0n);
        if (lastWithdrawBlock >= regBlock) return null;
    }

    // Apply the most recent ProfileUpdated that post-dates the surviving
    // registration, if any.
    let metadataURI = getStringArg(regLog, "metadataURI") ?? "";
    let metadataBlock = regBlock;
    for (const log of profileUpdated) {
        if (!hexEqual(getStringArg(log, "seller"), seller)) continue;
        const b = toBlockBigInt(log);
        if (b < regBlock) continue;
        if (b > metadataBlock) {
            metadataURI = getStringArg(log, "metadataURI") ?? metadataURI;
            metadataBlock = b;
        }
    }

    return {
        metadataURI,
        registeredBlock: regBlock > 0n ? regBlock : null,
    };
}

