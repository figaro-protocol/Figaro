/**
 * manifestToDraft — hydrates a `DesignSnapshot` from an IPFS-pinned
 * `AssemblyManifest`. Powers the "Fork" button on `PublishedList`:
 * a published assembly's manifest is fetched, this helper turns it
 * into a localStorage draft under a new slug, and the canvas opens
 * at /builders/designer/edit/<new-slug>.
 *
 * The new manifest format is self-contained — it carries the full
 * topology (orders array) and inlines every order's agreement body.
 * Hydration is therefore mostly a straight copy: assign a new slug,
 * deserialize bigint fields, re-save the inlined agreements into the
 * local agreement store so the canvas can load them by hash.
 */

import { saveAgreement } from "@/lib/core/agreementStore";
import type { AssemblyManifest } from "@/lib/mechanisms/useAssemblyRegistry";
import type { DesignSnapshot } from "./syntheticDesignStore";
import type { Order } from "@/lib/core/store";

/** Order's bigint fields are persisted on IPFS as decimal strings (per
 *  `canonicalize` in useAssemblyRegistry). Convert them back to bigint
 *  for in-memory use. */
function rehydrateOrder(raw: Order): Order {
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

export function manifestToDraft(
    manifest: AssemblyManifest,
    options: { slug: string; name?: string },
): DesignSnapshot {
    // Re-save every inlined agreement into the local agreement store
    // so the canvas's `loadAgreement(hash)` calls resolve to the same
    // bodies the manifest carried.
    for (const agreement of Object.values(manifest.agreements)) {
        saveAgreement(agreement);
    }

    return {
        slug: options.slug,
        name: options.name ?? `Fork of ${manifest.name}`,
        processId: manifest.processId,
        nextOrderIndex: manifest.nextOrderIndex,
        nextSellerIndex: manifest.nextSellerIndex,
        orders: manifest.orders.map(rehydrateOrder),
        createdAt: Date.now(),
        updatedAt: Date.now(),
    };
}
