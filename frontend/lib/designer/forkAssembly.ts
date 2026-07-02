/**
 * forkPublishedAssembly — shared "fork this published assembly as a
 * new local draft" handler. Used by both `PublishedList` (fork from
 * the assemblies index) and `ViewAssemblyClient` (fork from the
 * inspect page).
 *
 * What the helper owns:
 *   - The slug prompt (default = `${sourceSlug}-fork`).
 *   - Uniqueness handling (collisions get `-2`, `-3`, …).
 *   - Template → draft hydration via `assemblyTemplateToDraft`.
 *   - Persisting the new draft to localStorage.
 *
 * What the helper does NOT own (caller's responsibility):
 *   - Fetching the assemblyTemplate (callers may already have it — e.g. the
 *     view page already loaded the assemblyTemplate to render the canvas).
 *   - Loading-state UI (the two callers shape their `forking` state
 *     differently — slug-keyed vs boolean).
 *   - Router navigation (router lives in component scope).
 *   - Error handling around the assemblyTemplate fetch.
 *
 * Returns the final slug on success (caller navigates to
 * `/builders/designer/edit/${finalSlug}`), or `null` if the user
 * cancelled the prompt.
 */

import {
    saveNamedDraft,
    uniqueDraftSlug,
} from "./syntheticDesignStore";
import { assemblyTemplateToDraft } from "./assemblyTemplateToDraft";
import type { AssemblyTemplate } from "@/lib/shared/assemblyTemplate";

export function forkPublishedAssembly(
    sourceSlug: string,
    template: AssemblyTemplate,
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
    const draft = assemblyTemplateToDraft(template, { slug: finalSlug });
    saveNamedDraft(draft);
    return { finalSlug };
}
