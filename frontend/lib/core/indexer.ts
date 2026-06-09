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
    EV_ATTESTATION,
    EV_AUCTION_CREATED,
    EV_AUCTION_CLAIMED,
} from "@figaro/core";

// ── SellerRegistry events ──────────────────────────────────────────────────

/** Event signature for RpgfMinter.Claimed (same shape as the legacy
 *  StagedMerkleAirdrop.Claimed it replaced). */
const EV_RPGF_MINTER_CLAIMED = parseAbiItem(
    "event Claimed(uint8 indexed stageIndex, address indexed account, uint256 amount)",
);

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

type IndexedLog = Awaited<ReturnType<typeof cachedGetLogs>>[number];
type IndexedLogWithArgs = IndexedLog & { args?: Record<string, unknown> };

/**
 * Typed view of an `AttestationRecorded` log row as returned by
 * `getAttestationsByOrder` / `getAttestationsByProcessAndClause`. The
 * `blockNumber` and `transactionHash` may be `null` for pending logs;
 * downstream consumers should guard accordingly.
 */
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

// ── Dual-source merge helper ─────────────────────────────────────────────────

/**
 * Fetch the same event type from multiple contract addresses and merge
 * results by block number (ascending). Used to unify events emitted by
 * both the individual contracts and the FigaroBatchVerifier.
 */
async function cachedGetLogsMulti(
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

function getStringArg(log: IndexedLog, key: string): string | null {
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

export async function getAllAuctionCreated(client: PublicClient, chainId: number) {
    if (!CONTRACTS.dutchAuction) return [];
    return cachedGetLogs(client, chainId, {
        address: CONTRACTS.dutchAuction as `0x${string}`,
        event: EV_AUCTION_CREATED,
        eventName: "AuctionCreated",
    });
}

export async function getAllAuctionClaimed(client: PublicClient, chainId: number) {
    if (!CONTRACTS.dutchAuction) return [];
    return cachedGetLogs(client, chainId, {
        address: CONTRACTS.dutchAuction as `0x${string}`,
        event: EV_AUCTION_CLAIMED,
        eventName: "AuctionClaimed",
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

// ---------------------------------------------------------------------------
// AttestationCoordinator queries
// ---------------------------------------------------------------------------

async function getAllAttestations(client: PublicClient, chainId: number) {
    if (!CONTRACTS.attestationCoordinator && !CONTRACTS.batchVerifier) return [];
    return cachedGetLogsMulti(client, chainId,
        [CONTRACTS.attestationCoordinator, CONTRACTS.batchVerifier],
        { event: EV_ATTESTATION, eventName: "Attestation" },
    );
}

/** Attestation logs filtered by orderHash. */
export async function getAttestationsByOrder(client: PublicClient, chainId: number, orderHash: string) {
    const all = await getAllAttestations(client, chainId);
    return all.filter((log) => getStringArg(log, "orderHash") === orderHash);
}

/** Attestation logs filtered by processId AND clauseId. */
export async function getAttestationsByProcessAndClause(
    client: PublicClient,
    chainId: number,
    processId: string,
    clauseId: string,
) {
    const all = await getAllAttestations(client, chainId);
    return all.filter(
        (log) => getStringArg(log, "processId") === processId && getStringArg(log, "clauseId") === clauseId,
    );
}

/** A process attestation flattened to the fields the runtime model needs:
 *  which clause, which order, which stage, who attested. The clauseId is
 *  DATA off the event — no caller hardcodes it. */
export interface RuntimeAttestation {
    clauseId: string;
    orderHash: string;
    stage: number;
    attester: string;
    blockNumber: number;
}

/** All attestations on a process, clause-agnostic. The single read the
 *  semantic builder buckets by clause to gate capabilities, and the order
 *  page renders as a generic timeline (clause + stage straight from data). */
export async function getAttestationsByProcess(
    client: PublicClient,
    chainId: number,
    processId: string,
): Promise<RuntimeAttestation[]> {
    const all = await getAllAttestations(client, chainId);
    return all
        .filter((log) => getStringArg(log, "processId") === processId)
        .map((log) => {
            const args = (log as { args?: Record<string, unknown> }).args ?? {};
            return {
                clauseId: getStringArg(log, "clauseId") ?? "",
                orderHash: getStringArg(log, "orderHash") ?? "",
                stage: Number(args.stage ?? 0),
                attester: getStringArg(log, "attester") ?? "",
                blockNumber: Number((log as { blockNumber?: unknown }).blockNumber ?? 0),
            };
        })
        .sort((a, b) => a.blockNumber - b.blockNumber);
}

// ---------------------------------------------------------------------------
// SellerRegistry event fetchers
// ---------------------------------------------------------------------------

export async function getAllSellerRegistered(client: PublicClient, chainId: number) {
    if (!CONTRACTS.sellerRegistry && !CONTRACTS.batchVerifier) return [];
    return cachedGetLogsMulti(client, chainId,
        [CONTRACTS.sellerRegistry, CONTRACTS.batchVerifier],
        { event: EV_SELLER_REGISTERED, eventName: "SellerRegistered" },
    );
}

async function getAllSellerProfileUpdated(client: PublicClient, chainId: number) {
    if (!CONTRACTS.sellerRegistry && !CONTRACTS.batchVerifier) return [];
    return cachedGetLogsMulti(client, chainId,
        [CONTRACTS.sellerRegistry, CONTRACTS.batchVerifier],
        { event: EV_SELLER_PROFILE_UPDATED, eventName: "SellerProfileUpdated" },
    );
}

async function getAllSellerWithdrawn(client: PublicClient, chainId: number) {
    if (!CONTRACTS.sellerRegistry && !CONTRACTS.batchVerifier) return [];
    return cachedGetLogsMulti(client, chainId,
        [CONTRACTS.sellerRegistry, CONTRACTS.batchVerifier],
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

// ---------------------------------------------------------------------------
// RpgfMinter queries
// ---------------------------------------------------------------------------

/**
 * Check whether `account` has claimed the RpgfMinter allocation for
 * `stageIndex` (0 = yr 2, 1 = yr 5, 2 = yr 9). Returns true if a Claimed event
 * exists for that (stage, account), false otherwise.
 */
export async function getRpgfMinterClaimStatus(
    client: PublicClient,
    chainId: number,
    stageIndex: number,
    account: string,
): Promise<boolean> {
    const addr = CONTRACTS.rpgfMinter;
    if (!addr) return false;
    const logs = await cachedGetLogs(client, chainId, {
        address: addr,
        event: EV_RPGF_MINTER_CLAIMED,
        eventName: "Claimed",
    });
    const lc = account.toLowerCase();
    return logs.some((log) => {
        const args = getLogArgs(log);
        const stageMatches = Number(args.stageIndex ?? -1) === stageIndex;
        const accountVal = typeof args.account === "string" ? args.account.toLowerCase() : null;
        return stageMatches && accountVal === lc;
    });
}

// ---------------------------------------------------------------------------
// Seller track record — public-graph-derived activity
// ---------------------------------------------------------------------------

/** Value an seller transacted as a seller, summed per currency. */
interface TrackRecordValue {
    currency: string;
    total: bigint;
}

/** Attestations an seller emitted, grouped by clauseId. */
interface TrackRecordAttestations {
    clauseId: string;
    count: number;
}

/**
 * An seller's public-graph track record — every indicator reconstructed
 * from on-chain events, recomputable by anyone. This is NOT a stored or
 * soulbound score; it is the raw settlement/coordination history the public
 * graph exposes (PUBLIC_GRAPH_MODEL.md §"Reputation derivation").
 */
export interface SellerTrackRecord {
    /** Block of the seller's first SellerRegistered; null if never registered. */
    operatingSinceBlock: bigint | null;
    /** Unix-seconds timestamp of that block; null if unavailable. */
    operatingSinceTimestamp: bigint | null;
    /** Processes the seller participated in that have resolved. */
    completedProcesses: number;
    /** Processes the seller participated in still open. */
    activeProcesses: number;
    /** Orders committed with the seller as seller (merchant or courier). */
    ordersSold: number;
    /** Orders committed with the seller as buyer. */
    ordersBought: number;
    /** Value transacted as seller — summed payment, per currency. */
    valueTransacted: TrackRecordValue[];
    /** Distinct buyers the seller has sold to. */
    buyersServed: number;
    /** Distinct sellers the seller has bought from. */
    sellersUsed: number;
    /** Dutch-auction jobs the seller claimed (a courier signal). */
    auctionJobsWon: number;
    /** Total attestations the seller has emitted. */
    attestationsEmitted: number;
    /** Attestations emitted, grouped by clauseId, most-frequent first. */
    attestationsByClause: TrackRecordAttestations[];
}

function getBigIntArg(log: IndexedLog, key: string): bigint {
    const value = getLogArgs(log)[key];
    return typeof value === "bigint" ? value : 0n;
}

/**
 * Reconstruct an seller's full public-graph track record. Combines the
 * OrderCommitted / OrderResolved process graph, the DutchAuction capital
 * graph, and the AttestationCoordinator disclosure graph — all keyed to one
 * address. Every figure is recomputed from events; nothing is stored, so the
 * result is verifiable by anyone with chain access.
 */
export async function getSellerTrackRecord(
    client: PublicClient,
    chainId: number,
    seller: string,
): Promise<SellerTrackRecord> {
    const [sellerOrders, buyerOrders, resolved, registrations, auctions, attestations] =
        await Promise.all([
            getOrderCommittedBySeller(client, chainId, seller),
            getOrderCommittedByBuyer(client, chainId, seller),
            getAllOrderResolved(client, chainId),
            getAllSellerRegistered(client, chainId),
            getAllAuctionClaimed(client, chainId),
            getAllAttestations(client, chainId),
        ]);

    // Resolved processes — a process whose orders carry an OrderResolved.
    const resolvedProcessIds = new Set(
        resolved.map((log) => getStringArg(log, "processId")).filter((p): p is string => !!p),
    );

    // The seller's processes — distinct processIds across all its orders.
    const sellerProcessIds = new Set<string>();
    for (const log of [...sellerOrders, ...buyerOrders]) {
        const pid = getStringArg(log, "processId");
        if (pid) sellerProcessIds.add(pid);
    }
    let completedProcesses = 0;
    for (const pid of sellerProcessIds) {
        if (resolvedProcessIds.has(pid)) completedProcesses++;
    }

    // Value transacted as seller — summed payment per currency.
    const valueByCurrency = new Map<string, bigint>();
    for (const log of sellerOrders) {
        const currency = getStringArg(log, "currency")?.toLowerCase();
        if (!currency) continue;
        valueByCurrency.set(currency, (valueByCurrency.get(currency) ?? 0n) + getBigIntArg(log, "payment"));
    }

    // Distinct counterparties.
    const buyersServed = new Set(
        sellerOrders.map((log) => getStringArg(log, "buyer")?.toLowerCase()).filter((b): b is string => !!b),
    );
    const sellersUsed = new Set(
        buyerOrders.map((log) => getStringArg(log, "seller")?.toLowerCase()).filter((s): s is string => !!s),
    );

    // Operating since — earliest SellerRegistered for this address.
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

    // Auction jobs won — AuctionClaimed where the seller is the provider.
    const auctionJobsWon = auctions.filter(
        (log) => hexEqual(getStringArg(log, "provider"), seller),
    ).length;

    // Attestations emitted — grouped by clauseId.
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
        auctionJobsWon,
        attestationsEmitted,
        attestationsByClause: [...attestationsByClauseMap.entries()]
            .map(([clauseId, count]) => ({ clauseId, count }))
            .sort((a, b) => b.count - a.count),
    };
}
