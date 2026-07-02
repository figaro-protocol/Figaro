/**
 * syntheticAgreementStore.ts — the designer's authoring agreement persistence.
 *
 * While a designer is building an assembly, its synthetic orders carry agreements
 * that are NOT yet on the network. Like the buyer's draftOrders, these live in
 * localStorage so an in-progress design survives reloads and surfaces on the
 * assemblies pages — until the assembly is published, at which point the bodies
 * are pinned to IPFS (publishAgreement) and removed from here.
 *
 * This is authoring state, NOT a runtime cache: committed agreements are fetched
 * from the network via `lib/kernel/agreementFetch`, never read from here.
 */
import { computeAgreementHash, type Agreement } from "@figaro/core";
import type { Order } from "@/lib/kernel/store";
import { safeJsonParse } from "@/lib/shared/safeJson";

const PREFIX = "figaro:agreement:";
const key = (h: string) => PREFIX + h;
const canUseStorage = () => typeof window !== "undefined";

/** Persist a synthetic agreement; returns its hash (the order's anchor). */
export function saveAgreement(agreement: Agreement): `0x${string}` {
    const hash = computeAgreementHash(agreement);
    if (!canUseStorage()) return hash;
    try {
        localStorage.setItem(key(hash), JSON.stringify(agreement));
    } catch { /* localStorage failure is non-fatal during authoring */ }
    return hash;
}

// Internal: read one synthetic agreement back by hash — used by
// buildAgreementsFromCache below to assemble the topology deriver's Map.
function loadAgreement(agreementHash: string | undefined | null): Agreement | null {
    if (!canUseStorage() || !agreementHash) return null;
    try {
        return safeJsonParse<Agreement>(localStorage.getItem(key(agreementHash)));
    } catch {
        return null;
    }
}

/** Build the agreements Map the topology deriver needs from the authoring store,
 *  for designer sessions that are hot-cache by construction (the author just
 *  wrote them this tick). Runtime/cross-wallet consumers use useProcessAgreements. */
export function buildAgreementsFromCache(orders: Order[]): Map<string, Agreement> {
    const map = new Map<string, Agreement>();
    for (const order of orders) {
        if (!order.agreementHash) continue;
        const agreement = loadAgreement(order.agreementHash);
        if (agreement) map.set(order.agreementHash, agreement);
    }
    return map;
}
