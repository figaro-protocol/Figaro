/**
 * assemblyDocumentToDraft — hydrates a `DesignSnapshot` from an IPFS-pinned
 * `AssemblyDocument`. Powers the "Fork" button on `PublishedList`:
 * a published assembly's assemblyDoc is fetched, this helper turns it
 * into a localStorage draft under a new slug, and the canvas opens
 * at /builders/designer/edit/<new-slug>.
 *
 * The new assemblyDoc format is self-contained — it carries the full
 * topology (orders array) and inlines every order's agreement body.
 * Hydration is therefore mostly a straight copy: assign a new slug,
 * deserialize bigint fields, re-save the inlined agreements into the
 * local agreement store so the canvas can load them by hash.
 */

import { saveAgreement } from "@/lib/core/agreementStore";
import type { AssemblyDocument } from "@/lib/mechanisms/useAssemblyRegistry";
import type { DesignSnapshot } from "./syntheticDesignStore";
import type { Order } from "@/lib/core/store";

/** Order's bigint fields are persisted on IPFS as decimal strings (per
 *  `canonicalize` in useAssemblyRegistry). Convert them back to bigint
 *  for in-memory use. Exported so the on-chain resolver in `ViewAssembly`
 *  uses the same deserialization as the fork path. */
export function rehydrateOrder(raw: Order): Order {
    return {
        ...raw,
        cumulativeValue: BigInt(raw.cumulativeValue as unknown as string),
        payment: BigInt(raw.payment as unknown as string),
        sellerBond: BigInt(raw.sellerBond as unknown as string),
        buyerBond: BigInt(raw.buyerBond as unknown as string),
        salt: BigInt(raw.salt as unknown as string),
        deadline: BigInt(raw.deadline as unknown as string),
    };
}

/** Re-save every inlined agreement into the local agreement store so
 *  downstream `loadAgreement(hash)` calls resolve to the bodies the
 *  assemblyDoc carried. Used by `assemblyDocumentToDraft` (fork path) and by the
 *  `/view` on-chain resolver (read-only inspect / publish review). */
export function seedAssemblyDocumentAgreementsToStore(assemblyDoc: AssemblyDocument): void {
    for (const agreement of Object.values(assemblyDoc.agreements)) {
        saveAgreement(agreement);
    }
}

export function assemblyDocumentToDraft(
    assemblyDoc: AssemblyDocument,
    options: { slug: string; name?: string },
): DesignSnapshot {
    seedAssemblyDocumentAgreementsToStore(assemblyDoc);
    return {
        slug: options.slug,
        name: options.name ?? `Fork of ${assemblyDoc.name}`,
        processId: assemblyDoc.processId,
        nextOrderIndex: assemblyDoc.nextOrderIndex,
        nextSellerIndex: assemblyDoc.nextSellerIndex,
        orders: assemblyDoc.orders.map(rehydrateOrder),
        createdAt: Date.now(),
        updatedAt: Date.now(),
    };
}
