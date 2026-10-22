/**
 * forkPublishedAssembly — shared "fork this published assembly as a
 * new local draft" handler. Used by both `PublishedList` (fork from
 * the assemblies index) and `ViewAssemblyClient` (fork from the
 * inspect page).
 *
 * What the helper owns:
 *   - The fork's slug: `${sourceSlug}-fork`, made unique (collisions get
 *     `-2`, `-3`, …). No prompt: a native dialog is auto-dismissed by any
 *     automated browser and reads as a dead button to whoever drives one
 *     (beta r4, the founder), and a local draft's slug is a working name,
 *     not its identity — the assembly hash is.
 *   - Assembly → draft hydration via `assemblyToDraft`.
 *   - Persisting the new draft to localStorage.
 *
 * What the helper does NOT own (caller's responsibility):
 *   - Reading the hydrated assembly (callers already have it — e.g. the
 *     view page already read it to render the canvas).
 *   - Loading-state UI (the two callers shape their `forking` state
 *     differently — slug-keyed vs boolean).
 *   - Router navigation (router lives in component scope).
 *   - Error handling around the hydrated read.
 *
 * Returns the final slug (caller navigates to
 * `/assemblies/designer/edit?slug=${finalSlug}`).
 */

import {
    saveNamedDraft,
    uniqueDraftSlug,
} from "./syntheticDesignStore";
import { assemblyToDraft } from "./assemblyToDraft";
import type { HydratedAssembly } from "@figaro-protocol/sdk";

export function forkPublishedAssembly(
    sourceSlug: string,
    hydrated: HydratedAssembly,
): { finalSlug: string } {
    const finalSlug = uniqueDraftSlug(`${sourceSlug}-fork`);
    const draft = assemblyToDraft(hydrated, { slug: finalSlug });
    saveNamedDraft(draft);
    return { finalSlug };
}
