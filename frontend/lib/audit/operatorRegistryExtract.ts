/**
 * Operator-registry extractor — surfaces the seller's
 * `OperatorRegistry.OperatorRegistered(operator, role, metadataURI)` event
 * (if any) so the audit bundle includes the seller's claimed off-chain
 * identity at registration time.
 *
 * Note on kernel design: `src/FigaroCore.sol` does NOT enforce that
 * sellers be registered in the OperatorRegistry — the kernel "does not
 * gate any operation on operator state" (CLAUDE.md). Registration is an
 * off-chain discovery convention, not a settlement precondition.
 *
 * For audit purposes, however, every legitimate seller is expected to be
 * registered — this is a runtime-tier protocol convention. An unregistered
 * seller is itself an audit-significant flag (the bundle will surface
 * `registered: false` rather than silently omit).
 *
 * Pure function. Caller fetches `OperatorRegistered` events from the
 * OperatorRegistry contract (filtered by indexed `operator` topic ===
 * `order.seller`) and passes them in.
 */

import type { Order } from "@/lib/core/store";
import type { ExtractedDocument } from "./types";

/**
 * `OperatorRole` enum mirror — kept as numeric constants so this module
 * has no import dependency on the on-chain ABI.
 *
 *   0 = None        (invalid; should never appear in events)
 *   1 = Merchant
 *   2 = Courier     (renamed from Driver in 2026-04-26 role-rename)
 *   3 = Both
 */
export type OperatorRoleNumeric = 0 | 1 | 2 | 3;

export const OPERATOR_ROLE_LABEL: Record<OperatorRoleNumeric, string> = {
    0: "None",
    1: "Merchant",
    2: "Courier",
    3: "Both (Merchant + Courier)",
};

export interface OperatorRegisteredEvent {
    operator: string;
    role: OperatorRoleNumeric;
    metadataURI: string;
    blockNumber?: number;
    transactionHash?: string;
}

export interface OperatorRegistryDocument extends ExtractedDocument {
    /** Whether the seller has an `OperatorRegistered` event on chain. */
    registered: boolean;
    /** Numeric role from the registration event, if registered. */
    role?: OperatorRoleNumeric;
    /** Human-readable role label. */
    roleLabel?: string;
    /** IPFS / HTTPS URI pointing to the operator's metadata JSON, if registered. */
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
 * @param events       `OperatorRegistered` events filtered to events whose
 *                     `operator === order.seller`. Caller fetches via
 *                     indexed-topic query against OperatorRegistry. Pass
 *                     an empty array if the seller has no registration.
 *                     If multiple events are passed (e.g. seller
 *                     re-registered after withdrawing the deposit), the
 *                     most recent block wins.
 */
export function extractOperatorRegistry(
    order: Order,
    events: readonly OperatorRegisteredEvent[],
): OperatorRegistryDocument {
    const base = {
        title: "Operator registry record",
        orderHash: order.id,
        processId: order.processId,
        agreementHash: order.agreementHash ?? "0x",
        buyer: order.buyer,
        seller: order.seller,
    };

    const sellerLc = order.seller.toLowerCase();
    const sellerEvents = events.filter((e) => e.operator.toLowerCase() === sellerLc);
    if (sellerEvents.length === 0) {
        return {
            ...base,
            registered: false,
            notice:
                "Seller is NOT registered in OperatorRegistry. The kernel does not require registration, " +
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
        role: latest.role,
        roleLabel: OPERATOR_ROLE_LABEL[latest.role],
        metadataURI: latest.metadataURI,
        registeredAtBlock: latest.blockNumber,
        registrationTransactionHash: latest.transactionHash,
        notice: "",
    };
}
