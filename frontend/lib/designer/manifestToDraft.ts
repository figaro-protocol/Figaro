/**
 * manifestToDraft — hydrates a `DesignSnapshot` from an IPFS-pinned
 * `DirectSaleManifest`. Powers the "Fork" button on `PublishedList`:
 * a published assembly's manifest is fetched, this helper turns it
 * into a localStorage draft under a new slug, and the canvas opens
 * at /builders/designer/edit/<new-slug>.
 *
 * Today the only published class is `direct-sale-v1` (one-node
 * structurally), so a forked draft has exactly one root order with
 * the manifest's kleros + fulfilment fields seeded into its
 * agreement. When future multi-node assembly classes ship, this
 * helper grows to walk their topology and emit the full set of
 * orders; the public signature shouldn't need to change.
 */

import type { DirectSaleManifest } from "@/lib/mechanisms/useAssemblyRegistry";
import {
    createSyntheticRootOrder,
    startSyntheticSession,
} from "./syntheticProcess";
import type { DesignSnapshot } from "./syntheticDesignStore";

/**
 * Inverse of `useAssemblyRegistry.KLEROS_COURT_MAP`. The manifest's
 * uint8 court id needs to come back to the string key the drawer +
 * agreement encoder use. Any unrecognized id falls back to "general"
 * so the draft still opens cleanly — the user can re-set the court
 * in the drawer.
 */
const KLEROS_COURT_LABEL: Record<number, string> = {
    1: "general",
    2: "blockchain-nontechnical",
    3: "blockchain-technical",
    4: "english-language",
};

export function manifestToDraft(
    manifest: DirectSaleManifest,
    options: { slug: string; name?: string },
): DesignSnapshot {
    const session = startSyntheticSession();
    const klerosCourtKey = KLEROS_COURT_LABEL[manifest.klerosCourt] ?? "general";

    const root = createSyntheticRootOrder(session, {
        klerosCourt: klerosCourtKey,
        klerosMinJurors: String(manifest.klerosMinJurors),
        fulfilmentModalities: manifest.fulfilmentModalities,
    });

    return {
        slug: options.slug,
        name: options.name ?? `Fork of ${manifest.name}`,
        processId: session.processId,
        nextOrderIndex: session.nextOrderIndex,
        nextSellerIndex: session.nextSellerIndex,
        orders: [root.order],
        createdAt: Date.now(),
        updatedAt: Date.now(),
        description: manifest.description,
        narrativeSummary: manifest.narrativeSummary,
        builderNotes: manifest.builderNotes,
    };
}
