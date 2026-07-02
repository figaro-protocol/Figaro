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
