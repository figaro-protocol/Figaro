/**
 * SellerRegistry event reader — the protocol-layer half of the cached indexer.
 *
 * Reads the three surviving SellerRegistry events (registration, profile
 * update, withdrawal) and derives current seller state from them. Kernel
 * order events (OrderCommitted/OrderResolved) live in the kernel indexer;
 * this module reads a REGISTRY, which is protocol tier, not kernel tier.
 *
 * Fetching goes through the cached indexer (`cachedGetLogsMulti`); DECODING is
 * the SDK's (`parseSellerRegistryLogs` — the one parse per family). The
 * liveness fold below stays here: it is this reader's own derived view.
 *
 * Lifecycle flags (deactivate/reactivate) and on-chain role tracking remain
 * stripped — seller availability is signal-by-availability, and there is no
 * categorization field at any layer (no archetype, no role, no serviceType).
 * What an address does is reconstructed from the events it has emitted
 * (registrations, clause attestations, signed commitments).
 */

import type { Log, PublicClient } from "viem";
import { getAbiItem } from "viem";
import { parseSellerRegistryLogs, type SellerRegisteredEvent, type SellerWithdrawnEvent } from "@figaro/core";
import { hexEqual } from "@/lib/shared/evm";
import { CONTRACTS, SELLER_REGISTRY_ABI } from "@/lib/kernel/contracts";
import { cachedGetLogsMulti } from "@/lib/kernel/indexer";

// Event defs come from the canonical SDK ABI, like the clause/assembly readers.
const EV_SELLER_REGISTERED = getAbiItem({ abi: SELLER_REGISTRY_ABI, name: "SellerRegistered" });
const EV_SELLER_PROFILE_UPDATED = getAbiItem({ abi: SELLER_REGISTRY_ABI, name: "SellerProfileUpdated" });
const EV_SELLER_WITHDRAWN = getAbiItem({ abi: SELLER_REGISTRY_ABI, name: "SellerWithdrawn" });

/** Fetch one event stream through the cache and decode it with the SDK parser.
 *  The cache stores the full log objects (data/topics survive the IDB
 *  round-trip), so the SDK's raw-log decoder runs directly over cached rows. */
async function fetchSellerEvents(
    client: PublicClient,
    chainId: number,
    event: Parameters<typeof cachedGetLogsMulti>[3]["event"],
    eventName: string,
) {
    if (!CONTRACTS.sellerRegistry) return { registered: [], withdrawn: [] };
    const logs = await cachedGetLogsMulti(client, chainId, [CONTRACTS.sellerRegistry], { event, eventName });
    return parseSellerRegistryLogs(logs as unknown as Log[]);
}

/** All `SellerRegistered` rows (SDK-decoded; `updated === false`). */
export async function getAllSellerRegistered(client: PublicClient, chainId: number): Promise<SellerRegisteredEvent[]> {
    return (await fetchSellerEvents(client, chainId, EV_SELLER_REGISTERED, "SellerRegistered")).registered;
}

async function getAllSellerProfileUpdated(client: PublicClient, chainId: number): Promise<SellerRegisteredEvent[]> {
    return (await fetchSellerEvents(client, chainId, EV_SELLER_PROFILE_UPDATED, "SellerProfileUpdated")).registered;
}

async function getAllSellerWithdrawn(client: PublicClient, chainId: number): Promise<SellerWithdrawnEvent[]> {
    return (await fetchSellerEvents(client, chainId, EV_SELLER_WITHDRAWN, "SellerWithdrawn")).withdrawn;
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

    // Latest withdraw block per address (re-registration after withdraw is allowed)
    const latestWithdraw = new Map<string, number>();
    for (const row of withdrawn) {
        const addr = row.seller.toLowerCase();
        const prev = latestWithdraw.get(addr) ?? 0;
        if (row.blockNumber > prev) latestWithdraw.set(addr, row.blockNumber);
    }

    // Latest Registered event per address that survives Withdrawn.
    const sellers = new Map<string, { metadataURI: string; registeredBlock: number; latestBlock: number }>();
    for (const row of registered) {
        const addr = row.seller.toLowerCase();
        const withdrawnAfter = (latestWithdraw.get(addr) ?? 0) >= row.blockNumber;
        if (withdrawnAfter) continue;
        const prev = sellers.get(addr);
        if (!prev || row.blockNumber > prev.registeredBlock) {
            sellers.set(addr, {
                metadataURI: row.metadataURI,
                registeredBlock: row.blockNumber,
                latestBlock: row.blockNumber,
            });
        }
    }

    // Apply ProfileUpdated events that post-date the surviving Registered event.
    for (const row of profileUpdated) {
        const entry = sellers.get(row.seller.toLowerCase());
        if (!entry) continue;
        if (row.blockNumber < entry.registeredBlock) continue;
        if (row.blockNumber > entry.latestBlock) {
            entry.metadataURI = row.metadataURI || entry.metadataURI;
            entry.latestBlock = row.blockNumber;
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

    // Most recent Registered for this address. Track the latest by block;
    // tolerate null/0 blockNumbers by always preferring a candidate over no
    // candidate (test indexers occasionally return blockNumber=null for the
    // very latest tx — the SDK parser coerces those to 0; picking it is still
    // the right answer).
    let regRow: SellerRegisteredEvent | undefined;
    let regBlock = 0;
    for (const row of registered) {
        if (!hexEqual(row.seller, seller)) continue;
        if (!regRow || row.blockNumber > regBlock) {
            regBlock = row.blockNumber;
            regRow = row;
        }
    }
    if (!regRow) return null;

    // If a Withdrawn event exists at or after the most recent Registered,
    // the seller has cleared the dedup guard and is no longer current.
    // Only enforce the comparison when at least one withdraw exists for this
    // seller — otherwise a registration with blockNumber=null (regBlock=0)
    // would spuriously look "withdrawn" against a default lastWithdrawBlock.
    const sellerWithdraws = withdrawn.filter((row) => hexEqual(row.seller, seller));
    if (sellerWithdraws.length > 0) {
        const lastWithdrawBlock = sellerWithdraws
            .map((row) => row.blockNumber)
            .reduce((max, b) => (b > max ? b : max), 0);
        if (lastWithdrawBlock >= regBlock) return null;
    }

    // Apply the most recent ProfileUpdated that post-dates the surviving
    // registration, if any.
    let metadataURI = regRow.metadataURI;
    let metadataBlock = regBlock;
    for (const row of profileUpdated) {
        if (!hexEqual(row.seller, seller)) continue;
        if (row.blockNumber < regBlock) continue;
        if (row.blockNumber > metadataBlock) {
            metadataURI = row.metadataURI || metadataURI;
            metadataBlock = row.blockNumber;
        }
    }

    return {
        metadataURI,
        registeredBlock: regBlock > 0 ? BigInt(regBlock) : null,
    };
}
