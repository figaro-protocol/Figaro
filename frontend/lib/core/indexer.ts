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
import { CONTRACTS } from "./contracts";
import { MECHANISM_CONTRACTS } from "@/lib/mechanisms/contracts";
import {
    EV_ORDER_COMMITTED,
    EV_ORDER_SELLER,
    EV_ORDER_CURRENCY,
    EV_ORDER_RESOLVED,
    EV_PROCESS_RESOLVED,
    EV_ATTESTATION,
    EV_AUCTION_CREATED,
    EV_AUCTION_CLAIMED,
    EV_BATCH_SETTLED,
} from "@figaro/core";

// Re-export SDK event ABIs so existing consumers keep working
export {
    EV_ORDER_COMMITTED,
    EV_ORDER_SELLER,
    EV_ORDER_CURRENCY,
    EV_ORDER_RESOLVED,
    EV_PROCESS_RESOLVED,
    EV_ATTESTATION,
    EV_AUCTION_CREATED,
    EV_AUCTION_CLAIMED,
    EV_BATCH_SETTLED,
};

// ── OperatorRegistry events ──────────────────────────────────────────────────

/** Event signature for StagedMerkleAirdrop.Claimed. */
export const EV_STAGED_AIRDROP_CLAIMED = parseAbiItem(
    "event Claimed(uint8 indexed stageIndex, address indexed account, uint256 amount)",
);

export const EV_OPERATOR_REGISTERED = parseAbiItem(
    "event OperatorRegistered(address indexed operator, uint8 role, string metadataURI)",
);
export const EV_OPERATOR_UPDATED = parseAbiItem(
    "event OperatorUpdated(address indexed operator, uint8 role, string metadataURI)",
);
export const EV_OPERATOR_DEACTIVATED = parseAbiItem(
    "event OperatorDeactivated(address indexed operator)",
);
export const EV_OPERATOR_REACTIVATED = parseAbiItem(
    "event OperatorReactivated(address indexed operator)",
);
export const EV_OPERATOR_WITHDRAWN = parseAbiItem(
    "event OperatorWithdrawn(address indexed operator, uint256 deposit)",
);

type IndexedLog = Awaited<ReturnType<typeof cachedGetLogs>>[number];
type IndexedLogWithArgs = IndexedLog & { args?: Record<string, unknown> };

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

export async function getAllProcessResolved(client: PublicClient, chainId: number) {
    return cachedGetLogs(client, chainId, {
        address: CONTRACTS.core as `0x${string}`,
        event: EV_PROCESS_RESOLVED,
        eventName: "ProcessResolved",
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
    const lc = buyer.toLowerCase();
    return all.filter((log) => getStringArg(log, "buyer")?.toLowerCase() === lc);
}

/** OrderSeller logs — indexed seller lookup, no full-table scan. */
export async function getAllOrderSeller(client: PublicClient, chainId: number) {
    return cachedGetLogs(client, chainId, {
        address: CONTRACTS.core as `0x${string}`,
        event: EV_ORDER_SELLER,
        eventName: "OrderSeller",
    });
}

/** OrderCurrency logs — indexed currency lookup, no full-table scan. */
export async function getAllOrderCurrency(client: PublicClient, chainId: number) {
    return cachedGetLogs(client, chainId, {
        address: CONTRACTS.core as `0x${string}`,
        event: EV_ORDER_CURRENCY,
        eventName: "OrderCurrency",
    });
}

/**
 * OrderCommitted logs where the seller matches.
 * Uses the OrderSeller companion event (indexed seller) to find orderHashes,
 * then pulls the full OrderCommitted log for each matching order.
 */
export async function getOrderCommittedBySeller(client: PublicClient, chainId: number, seller: string) {
    const sellerLogs = await getAllOrderSeller(client, chainId);
    const lc = seller.toLowerCase();
    const matchHashes = new Set(
        sellerLogs
            .filter((log) => getStringArg(log, "seller")?.toLowerCase() === lc)
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

/** OrderCommitted logs for a specific processId. */
export async function getOrderCommittedByProcess(client: PublicClient, chainId: number, processId: string) {
    const all = await getAllOrderCommitted(client, chainId);
    return all.filter((log) => getStringArg(log, "processId") === processId);
}

/**
 * State map for the live kernel: orders are Active at commit, Resolved after resolution.
 * Returns a Map<orderHash → "Resolved"> for resolved orders.
 * (All committed orders not in this map are Active.)
 */
export async function getOrderStateMap(
    client: PublicClient,
    chainId: number,
    processIds: string[],
): Promise<Map<string, "Resolved">> {
    const pidSet = new Set(processIds);
    const resolved = await getAllOrderResolved(client, chainId);

    const stateMap = new Map<string, "Resolved">();
    for (const log of resolved) {
        const resolvedProcessId = getStringArg(log, "processId");
        const orderHash = getStringArg(log, "orderHash");
        if (resolvedProcessId && orderHash && pidSet.has(resolvedProcessId)) {
            stateMap.set(orderHash, "Resolved");
        }
    }
    return stateMap;
}

/** AuctionClaimed logs for a specific driver address. */
export async function getAuctionClaimedByDriver(client: PublicClient, chainId: number, driver: string) {
    const all = await getAllAuctionClaimed(client, chainId);
    const lc = driver.toLowerCase();
    return all.filter((log) => getStringArg(log, "driver")?.toLowerCase() === lc);
}

// ---------------------------------------------------------------------------
// AttestationCoordinator queries
// ---------------------------------------------------------------------------

export async function getAllAttestations(client: PublicClient, chainId: number) {
    if (!CONTRACTS.attestationCoordinator && !CONTRACTS.batchVerifier) return [];
    return cachedGetLogsMulti(client, chainId,
        [CONTRACTS.attestationCoordinator, CONTRACTS.batchVerifier],
        { event: EV_ATTESTATION, eventName: "Attestation" },
    );
}

/** Attestation logs filtered by processId. */
export async function getAttestationsByProcess(client: PublicClient, chainId: number, processId: string) {
    const all = await getAllAttestations(client, chainId);
    return all.filter((log) => getStringArg(log, "processId") === processId);
}

/** Attestation logs filtered by orderHash. */
export async function getAttestationsByOrder(client: PublicClient, chainId: number, orderHash: string) {
    const all = await getAllAttestations(client, chainId);
    return all.filter((log) => getStringArg(log, "orderHash") === orderHash);
}

/** Attestation logs filtered by processId AND schemaId. */
export async function getAttestationsByProcessAndSchema(
    client: PublicClient,
    chainId: number,
    processId: string,
    schemaId: string,
) {
    const all = await getAllAttestations(client, chainId);
    return all.filter(
        (log) => getStringArg(log, "processId") === processId && getStringArg(log, "schemaId") === schemaId,
    );
}

// ---------------------------------------------------------------------------
// OperatorRegistry event fetchers
// ---------------------------------------------------------------------------

export async function getAllOperatorRegistered(client: PublicClient, chainId: number) {
    if (!MECHANISM_CONTRACTS.operatorRegistry && !CONTRACTS.batchVerifier) return [];
    return cachedGetLogsMulti(client, chainId,
        [MECHANISM_CONTRACTS.operatorRegistry, CONTRACTS.batchVerifier],
        { event: EV_OPERATOR_REGISTERED, eventName: "OperatorRegistered" },
    );
}

export async function getAllOperatorUpdated(client: PublicClient, chainId: number) {
    if (!MECHANISM_CONTRACTS.operatorRegistry && !CONTRACTS.batchVerifier) return [];
    return cachedGetLogsMulti(client, chainId,
        [MECHANISM_CONTRACTS.operatorRegistry, CONTRACTS.batchVerifier],
        { event: EV_OPERATOR_UPDATED, eventName: "OperatorUpdated" },
    );
}

export async function getAllOperatorDeactivated(client: PublicClient, chainId: number) {
    if (!MECHANISM_CONTRACTS.operatorRegistry && !CONTRACTS.batchVerifier) return [];
    return cachedGetLogsMulti(client, chainId,
        [MECHANISM_CONTRACTS.operatorRegistry, CONTRACTS.batchVerifier],
        { event: EV_OPERATOR_DEACTIVATED, eventName: "OperatorDeactivated" },
    );
}

export async function getAllOperatorReactivated(client: PublicClient, chainId: number) {
    if (!MECHANISM_CONTRACTS.operatorRegistry && !CONTRACTS.batchVerifier) return [];
    return cachedGetLogsMulti(client, chainId,
        [MECHANISM_CONTRACTS.operatorRegistry, CONTRACTS.batchVerifier],
        { event: EV_OPERATOR_REACTIVATED, eventName: "OperatorReactivated" },
    );
}

export async function getAllOperatorWithdrawn(client: PublicClient, chainId: number) {
    if (!MECHANISM_CONTRACTS.operatorRegistry && !CONTRACTS.batchVerifier) return [];
    return cachedGetLogsMulti(client, chainId,
        [MECHANISM_CONTRACTS.operatorRegistry, CONTRACTS.batchVerifier],
        { event: EV_OPERATOR_WITHDRAWN, eventName: "OperatorWithdrawn" },
    );
}

/**
 * Derive the current operator roster: latest metadataURI + role per address,
 * filtered by active status (deactivated and withdrawn operators excluded).
 */
export async function getActiveOperators(client: PublicClient, chainId: number) {
    const [registered, updated, deactivated, reactivated, withdrawn] = await Promise.all([
        getAllOperatorRegistered(client, chainId),
        getAllOperatorUpdated(client, chainId),
        getAllOperatorDeactivated(client, chainId),
        getAllOperatorReactivated(client, chainId),
        getAllOperatorWithdrawn(client, chainId),
    ]);

    // Build latest state per operator address
    const operators = new Map<string, { role: number; metadataURI: string; active: boolean }>();

    for (const log of registered) {
        const operator = getStringArg(log, "operator");
        const addr = operator?.toLowerCase();
        if (addr) {
            operators.set(addr, {
                role: Number(getLogArgs(log).role ?? 0),
                metadataURI: getStringArg(log, "metadataURI") ?? "",
                active: true,
            });
        }
    }
    for (const log of updated) {
        const operator = getStringArg(log, "operator");
        const addr = operator?.toLowerCase();
        if (addr) {
            const existing = operators.get(addr);
            if (existing) {
                existing.role = Number(getLogArgs(log).role ?? 0);
                existing.metadataURI = getStringArg(log, "metadataURI") ?? "";
            }
        }
    }
    for (const log of deactivated) {
        const operator = getStringArg(log, "operator");
        const addr = operator?.toLowerCase();
        if (addr) {
            const existing = operators.get(addr);
            if (existing) existing.active = false;
        }
    }
    for (const log of reactivated) {
        const operator = getStringArg(log, "operator");
        const addr = operator?.toLowerCase();
        if (addr) {
            const existing = operators.get(addr);
            if (existing) existing.active = true;
        }
    }
    for (const log of withdrawn) {
        const operator = getStringArg(log, "operator");
        const addr = operator?.toLowerCase();
        if (addr) {
            operators.delete(addr);
        }
    }

    // Return only active operators
    return Array.from(operators.entries())
        .filter(([, op]) => op.active)
        .map(([address, op]) => ({ address, role: op.role, metadataURI: op.metadataURI }));
}

/**
 * Get the latest metadataURI for a specific operator address.
 * Returns null if not registered or deactivated.
 */
export async function getOperatorMetadataURI(client: PublicClient, chainId: number, operator: string) {
    const active = await getActiveOperators(client, chainId);
    const lc = operator.toLowerCase();
    const match = active.find((op) => op.address === lc);
    return match?.metadataURI ?? null;
}

/**
 * Full state for a single operator, derived from events.
 * Returns null if the operator has never registered or has withdrawn.
 * Includes active/inactive status and the block number of registration
 * (needed to compute deposit lock expiry).
 */
export async function getOperatorState(
    client: PublicClient,
    chainId: number,
    operator: string,
): Promise<{ role: number; active: boolean; metadataURI: string; registeredBlock: bigint | null } | null> {
    const lc = operator.toLowerCase();

    const [registered, updated, deactivated, reactivated, withdrawn] = await Promise.all([
        getAllOperatorRegistered(client, chainId),
        getAllOperatorUpdated(client, chainId),
        getAllOperatorDeactivated(client, chainId),
        getAllOperatorReactivated(client, chainId),
        getAllOperatorWithdrawn(client, chainId),
    ]);

    const regLog = registered.find((log) => getStringArg(log, "operator")?.toLowerCase() === lc);
    if (!regLog) return null;

    const hasWithdrawn = withdrawn.some((log) => getStringArg(log, "operator")?.toLowerCase() === lc);
    if (hasWithdrawn) return null;

    const updateLogs = updated.filter((log) => getStringArg(log, "operator")?.toLowerCase() === lc);
    const latestMetadataURI = updateLogs.length > 0
        ? (getStringArg(updateLogs[updateLogs.length - 1], "metadataURI") ?? "")
        : (getStringArg(regLog, "metadataURI") ?? "");

    function toBlockBigInt(log: IndexedLog): bigint {
        const bn = log.blockNumber;
        if (typeof bn === "bigint") return bn;
        if (typeof bn === "number") return BigInt(bn);
        return 0n;
    }

    const lastDeactivateBlock = deactivated
        .filter((log) => getStringArg(log, "operator")?.toLowerCase() === lc)
        .map(toBlockBigInt)
        .reduce((max, b) => b > max ? b : max, 0n);
    const lastReactivateBlock = reactivated
        .filter((log) => getStringArg(log, "operator")?.toLowerCase() === lc)
        .map(toBlockBigInt)
        .reduce((max, b) => b > max ? b : max, 0n);

    const regBlock = toBlockBigInt(regLog);

    return {
        role: Number(getLogArgs(regLog).role ?? 0),
        active: lastDeactivateBlock <= lastReactivateBlock,
        metadataURI: latestMetadataURI,
        registeredBlock: regBlock > 0n ? regBlock : null,
    };
}

// ---------------------------------------------------------------------------
// BatchVerifier queries
// ---------------------------------------------------------------------------

export async function getAllBatchSettled(client: PublicClient, chainId: number) {
    if (!CONTRACTS.batchVerifier) return [];
    return cachedGetLogs(client, chainId, {
        address: CONTRACTS.batchVerifier as `0x${string}`,
        event: EV_BATCH_SETTLED,
        eventName: "BatchSettled",
    });
}

// ---------------------------------------------------------------------------
// StagedMerkleAirdrop queries
// ---------------------------------------------------------------------------

/**
 * Check whether `account` has claimed the StagedMerkleAirdrop allocation for
 * `stageIndex` (0 = yr 2, 1 = yr 5, 2 = yr 9). Returns true if a Claimed event
 * exists for that (stage, account), false otherwise.
 */
export async function getStagedAirdropClaimStatus(
    client: PublicClient,
    chainId: number,
    stageIndex: number,
    account: string,
): Promise<boolean> {
    const addr = MECHANISM_CONTRACTS.stagedAirdrop;
    if (!addr) return false;
    const logs = await cachedGetLogs(client, chainId, {
        address: addr,
        event: EV_STAGED_AIRDROP_CLAIMED,
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
