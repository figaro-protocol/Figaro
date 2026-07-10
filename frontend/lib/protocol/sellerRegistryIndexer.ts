/**
 * SellerRegistry event reader — the protocol-layer half of the cached indexer.
 *
 * Reads the three surviving SellerRegistry events (registration, profile
 * update, withdrawal) and derives current seller state from them. Kernel
 * order events (OrderCommitted/OrderResolved) live in the kernel indexer;
 * this module reads a REGISTRY, which is protocol tier, not kernel tier.
 *
 * Lifecycle flags (deactivate/reactivate) and on-chain role tracking remain
 * stripped — seller availability is signal-by-availability, and there is no
 * categorization field at any layer (no archetype, no role, no serviceType).
 * What an address does is reconstructed from the events it has emitted
 * (registrations, clause attestations, signed commitments).
 */

import type { PublicClient } from "viem";
import { getAbiItem } from "viem";
import { hexEqual } from "@/lib/shared/evm";
import { CONTRACTS, SELLER_REGISTRY_ABI } from "@/lib/kernel/contracts";
import { cachedGetLogsMulti, getStringArg, type IndexedLog } from "@/lib/kernel/indexer";

// Event defs come from the canonical SDK ABI, like the clause/assembly readers.
const EV_SELLER_REGISTERED = getAbiItem({ abi: SELLER_REGISTRY_ABI, name: "SellerRegistered" });
const EV_SELLER_PROFILE_UPDATED = getAbiItem({ abi: SELLER_REGISTRY_ABI, name: "SellerProfileUpdated" });
const EV_SELLER_WITHDRAWN = getAbiItem({ abi: SELLER_REGISTRY_ABI, name: "SellerWithdrawn" });

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
