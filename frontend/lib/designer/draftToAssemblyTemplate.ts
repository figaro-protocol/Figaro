/**
 * lib/designer/draftToAssemblyTemplate.ts — the AUTHORING direction of the
 * draft ↔ template bridge; the mirror of `assemblyTemplateToDraft.ts`.
 *
 * ONE walk from a `DesignSnapshot` (what the canvas holds) to the canonical
 * `AssemblyTemplate` (what gets pinned + anchored). Publish, the composition
 * hand-off panel, and the canvas's identity readout all go through it, so the
 * hash a designer SEES while composing is by construction the hash publish
 * anchors — a readout derived by a second, near-identical walk could disagree
 * with the artifact, which is worse than showing nothing.
 *
 * The walk itself is `buildAssemblyTemplate` (`@figaro/sdk`), fed by the
 * live-cache `specSource()` adapter. It VERIFIES scope placement and throws on
 * a cold spec cache — both are loud failures the callers surface, never
 * silently swallowed here.
 */

import { buildAssemblyTemplate, serializeAssemblyTemplate } from "@figaro/sdk";
import { specSource } from "@/lib/shared/clauseSpecSource";
import { deriveAssemblySlug, type AssemblyTemplate } from "@/lib/shared/assemblyTemplate";
import { extractErrorMessage } from "@/lib/shared/errors";
import type { DesignSnapshot } from "@/lib/designer/syntheticDesignStore";

/** Project a design snapshot onto the canonical assembly template. Throws when
 *  the spec cache is cold (no mandatory clauses resolvable) or a clause is
 *  composed at the wrong scope — both are the SDK's own refusals. */
export function snapshotToAssemblyTemplate(snapshot: DesignSnapshot): AssemblyTemplate {
    return buildAssemblyTemplate({
        name: snapshot.name.trim() || undefined,
        summary: snapshot.summary?.trim() || undefined,
        description: snapshot.description?.trim() || undefined,
        orders: snapshot.orders,
        clausesByOrderId: snapshot.clausesByOrderId ?? {},
        clauseVersionsByOrderId: snapshot.clauseVersionsByOrderId,
        assemblyClauses: snapshot.assemblyClauses,
        assemblyClauseVersions: snapshot.assemblyClauseVersions,
        specs: specSource(),
    });
}

/** The composition's IDENTITY, derived from the draft exactly as publish
 *  derives it: `compositionHash` = keccak256 of the template's canonical
 *  composition subset (the AssemblyRegistry key), and the slug that is a pure
 *  function of it. The editorial prose is excluded from the subset, so
 *  renaming never forks identity; any change to the composed clauses — a
 *  design fill's value included — does.
 *
 *  Never throws: a cold spec cache or a mis-scoped clause comes back as
 *  `{ error }` for the caller to render. */
export function snapshotCompositionIdentity(
    snapshot: DesignSnapshot,
): { compositionHash: `0x${string}`; slug: string; error: null }
    | { compositionHash: null; slug: null; error: string } {
    try {
        const { compositionHash } = serializeAssemblyTemplate(snapshotToAssemblyTemplate(snapshot));
        return { compositionHash, slug: deriveAssemblySlug(compositionHash), error: null };
    } catch (cause) {
        return {
            compositionHash: null,
            slug: null,
            error: extractErrorMessage(cause, "Could not derive the composition identity."),
        };
    }
}
