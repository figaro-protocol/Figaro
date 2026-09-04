/**
 * lib/designer/draftToAssemblyTemplate.ts — the AUTHORING direction of the
 * draft ↔ template bridge; the mirror of `assemblyTemplateToDraft.ts`.
 *
 * ONE walk from a `DesignSnapshot` (what the canvas holds) to the canonical
 * `AssemblyTemplate` (what gets pinned + anchored). Publish, the composition
 * hand-off panel, the canvas's identity readout, and the REVIEW screen all go
 * through it, so the hash a designer SEES while composing is by construction
 * the hash publish anchors — a readout derived by a second, near-identical
 * walk could disagree with the assembly, which is worse than showing nothing.
 *
 * The review screen reads its whole composition out of this walk's output
 * (`projectSnapshotForReview`): the terms a designer is shown before an
 * irreversible anchor are the terms in the bytes, not a parallel reading of
 * the draft that can silently fall out of step with them.
 *
 * The walk itself is `buildAssemblyTemplate` (`@figaro-protocol/sdk`), fed by the
 * live-cache `specSource()` adapter. It VERIFIES scope placement and throws on
 * a cold spec cache — both are loud failures the callers surface, never
 * silently swallowed here.
 */

import { buildAssemblyTemplate, serializeAssemblyTemplate } from "@figaro-protocol/sdk";
import { clauseIsMandatory, specSource } from "@/lib/shared/clauseSpecSource";
import {
    deriveAssemblySlug,
    templateClauseVersion,
    type AssemblyTemplate,
} from "@/lib/shared/assemblyTemplate";
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

/** The clauses a template states per AGREEMENT — the read side of the one
 *  walk, for every surface that must show a composition it is about to
 *  publish (review) or has already published (`/view`).
 *
 *  Keyed by the template's own agreement ids (`order-<i>`). The auto-folded
 *  MANDATORY clauses are left out: they are not the designer's picks, so a
 *  review that listed them would read as terms nobody composed. Everything
 *  shown here comes from the pinned bytes, never from a second walk over the
 *  draft — that divergence is the defect this exists to make impossible. */
export function templateComposedByAgreement(
    template: AssemblyTemplate,
): Record<string, Record<string, Record<string, unknown>>> {
    return Object.fromEntries(
        template.agreements.map((agreement) => [
            agreement.id,
            Object.fromEntries(
                Object.entries(agreement.clauses).filter(
                    ([clauseId]) =>
                        !clauseIsMandatory(clauseId, templateClauseVersion(agreement, clauseId)),
                ),
            ),
        ]),
    );
}

/** A draft projected onto the bytes that publish anchors, plus the readout
 *  those bytes produce — the ONE object a review screen renders and the
 *  publish call sends. `composedByOrderId` is re-keyed from the template's
 *  local agreement ids back onto the canvas's own order ids (the build labels
 *  agreements `order-<i>` in the snapshot's own order, so the mapping is
 *  positional), so a node on the review canvas reads its own composition out
 *  of the published template rather than out of the draft a second time. */
export type SnapshotReview =
    | {
        ok: true;
        template: AssemblyTemplate;
        compositionHash: `0x${string}`;
        slug: string;
        /** canvas order id → clauseId → composed values (mandatory folds out). */
        composedByOrderId: Record<string, Record<string, Record<string, unknown>>>;
        /** The assembly-scoped composition exactly as the template carries it. */
        assemblyClauses: Record<string, Record<string, unknown>>;
    }
    | { ok: false; error: string };

/** Project a draft for review. Never throws: a cold spec cache or a
 *  mis-scoped clause comes back as `{ ok: false, error }` — a review screen
 *  that cannot build the template must say so and refuse to publish, never
 *  render an empty composition. */
export function projectSnapshotForReview(snapshot: DesignSnapshot): SnapshotReview {
    try {
        const template = snapshotToAssemblyTemplate(snapshot);
        const { compositionHash } = serializeAssemblyTemplate(template);
        const byAgreement = templateComposedByAgreement(template);
        const composedByOrderId: Record<string, Record<string, Record<string, unknown>>> = {};
        snapshot.orders.forEach((order, index) => {
            const agreementId = template.agreements[index]?.id;
            if (agreementId === undefined) return;
            composedByOrderId[order.orderHash] = byAgreement[agreementId] ?? {};
        });
        return {
            ok: true,
            template,
            compositionHash,
            slug: deriveAssemblySlug(compositionHash),
            composedByOrderId,
            assemblyClauses: template.assemblyClauses ?? {},
        };
    } catch (cause) {
        return {
            ok: false,
            error: extractErrorMessage(cause, "Could not derive the composition identity."),
        };
    }
}

/** The composition's IDENTITY, derived from the draft exactly as publish
 *  derives it: `compositionHash` = keccak256 of the template's canonical
 *  composition subset (the AssemblyRegistry key), and the slug that is a pure
 *  function of it. The editorial prose is excluded from the subset, so
 *  renaming never forks identity; any change to the composed clauses — a
 *  design fill's value included — does.
 *
 *  The identity face of `projectSnapshotForReview`, so the canvas readout and
 *  the review screen can never disagree about which assembly this is.
 *  Never throws: a cold spec cache or a mis-scoped clause comes back as
 *  `{ error }` for the caller to render. */
export function snapshotCompositionIdentity(
    snapshot: DesignSnapshot,
): { compositionHash: `0x${string}`; slug: string; error: null }
    | { compositionHash: null; slug: null; error: string } {
    const review = projectSnapshotForReview(snapshot);
    return review.ok
        ? { compositionHash: review.compositionHash, slug: review.slug, error: null }
        : { compositionHash: null, slug: null, error: review.error };
}
