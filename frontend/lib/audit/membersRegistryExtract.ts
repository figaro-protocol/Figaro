/**
 * Members-registry extractor — surfaces the member's
 * `MembersRegistry.MemberRegistered(seller, metadataURI)` event (if any)
 * so the audit bundle includes the seller's claimed off-chain identity at
 * registration time.
 *
 * Note on kernel design: `src/kernel/FigaroCore.sol` does NOT enforce that
 * sellers be registered in the MembersRegistry — the kernel "does not
 * gate any operation on seller state" (CLAUDE.md). Registration is an
 * off-chain discovery convention, not a settlement precondition.
 *
 * For audit purposes, however, every legitimate seller is expected to be
 * registered — this is a runtime-tier protocol convention. An unregistered
 * seller is itself an audit-significant flag (the bundle will surface
 * `registered: false` rather than silently omit).
 *
 * Pure function. Caller fetches `MemberRegistered` events from the
 * MembersRegistry contract (filtered by indexed `seller` topic ===
 * `order.seller`) and passes them in.
 */

import type { Order } from "@/lib/kernel/store";
import type { ExtractedDocument } from "./types";
import { hexEqual } from "@/lib/shared/evm";

export interface MemberRegisteredEvent {
    seller: string;
    metadataURI: string;
    blockNumber?: number;
    transactionHash?: string;
}

export interface MembersRegistryDocument extends ExtractedDocument {
    /** Whether the seller has an `MemberRegistered` event on chain. */
    registered: boolean;
    /** IPFS / HTTPS URI pointing to the seller's metadata JSON, if registered. */
    metadataURI?: string;
    /** Block at which the seller registered. */
    registeredAtBlock?: number;
    /** Transaction hash of the registration. */
    registrationTransactionHash?: string;
    /** Audit notice. Empty string when registered; populated explanation
     *  when not registered (so the PDF page surfaces the gap clearly
     *  instead of looking like a missing field). */
    notice: string;
}

/**
 * @param order        The committed order whose seller's registration we
 *                     want to surface.
 * @param events       `MemberRegistered` events filtered to events whose
 *                     `seller === order.seller`. Caller fetches via
 *                     indexed-topic query against MembersRegistry. Pass
 *                     an empty array if the seller has no registration.
 *                     If multiple events are passed (e.g. seller
 *                     re-registered after withdrawing the deposit), the
 *                     most recent block wins.
 */
export function extractMembersRegistry(
    order: Order,
    events: readonly MemberRegisteredEvent[],
): MembersRegistryDocument {
    const base = {
        title: "Members registry record",
        orderHash: order.orderHash,
        processId: order.processId,
        agreementHash: order.agreementHash ?? "0x",
        buyer: order.buyer,
        seller: order.seller,
    };

    const sellerEvents = events.filter((e) => hexEqual(e.seller, order.seller));
    if (sellerEvents.length === 0) {
        return {
            ...base,
            registered: false,
            notice:
                "Seller is NOT registered in MembersRegistry. The kernel does not require registration, " +
                "but every legitimate seller is expected to register (runtime convention). Audit-significant: " +
                "investigate the seller's claimed identity through other channels.",
        };
    }

    // Most recent registration wins (handles withdraw + re-register).
    const sorted = [...sellerEvents].sort((a, b) => (b.blockNumber ?? 0) - (a.blockNumber ?? 0));
    const latest = sorted[0];

    return {
        ...base,
        registered: true,
        metadataURI: latest.metadataURI,
        registeredAtBlock: latest.blockNumber,
        registrationTransactionHash: latest.transactionHash,
        notice: "",
    };
}
