/**
 * forkPublishedAssembly — shared "fork this published assembly as a
 * new local draft" handler. Used by both `PublishedList` (fork from
 * the assemblies index) and `ViewAssemblyClient` (fork from the
 * inspect page).
 *
 * What the helper owns:
 *   - The slug prompt (default = `${sourceSlug}-fork`).
 *   - Uniqueness handling (collisions get `-2`, `-3`, …).
 *   - Manifest → draft hydration via `manifestToDraft`.
 *   - Persisting the new draft to localStorage.
 *
 * What the helper does NOT own (caller's responsibility):
 *   - Fetching the manifest (callers may already have it — e.g. the
 *     view page already loaded the manifest to render the canvas).
 *   - Loading-state UI (the two callers shape their `forking` state
 *     differently — slug-keyed vs boolean).
 *   - Router navigation (router lives in component scope).
 *   - Error handling around the manifest fetch.
 *
 * Returns the final slug on success (caller navigates to
 * `/builders/designer/edit/${finalSlug}`), or `null` if the user
 * cancelled the prompt.
 */

import {
    saveNamedDraft,
    uniqueDraftSlug,
} from "./syntheticDesignStore";
import { manifestToDraft } from "./manifestToDraft";
import type { AssemblyDocument } from "@/lib/mechanisms/useAssemblyRegistry";

export function forkPublishedAssembly(
    sourceSlug: string,
    manifest: AssemblyDocument,
): { finalSlug: string } | null {
    const defaultSlug = uniqueDraftSlug(`${sourceSlug}-fork`);
    const proposed =
        typeof window === "undefined"
            ? defaultSlug
            : window.prompt(
                `Fork "${sourceSlug}" as a new local draft. Slug:`,
                defaultSlug,
            );
    if (!proposed) return null;
    const trimmed = proposed.trim();
    if (!trimmed) return null;
    const finalSlug = uniqueDraftSlug(trimmed);
    const draft = manifestToDraft(manifest, { slug: finalSlug });
    saveNamedDraft(draft);
    return { finalSlug };
}
