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
import { clauseDesignFills, clauseIsMandatory, getClauseSpec, specSource } from "@/lib/shared/clauseSpecSource";
import { isFilledValue } from "@/lib/checkout/checkoutDerivations";
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
 *  MANDATORY clauses are left out here: they are not the designer's picks, and
 *  `templateFoldedClauses` lists them on their own, by id and version.
 *  Everything shown here comes from the pinned bytes, never from a second walk
 *  over the draft — that divergence is the defect this exists to make
 *  impossible. */
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

/** A clause the designer picked on one agreement, by id and version. */
export interface ComposedClause {
    clauseId: string;
    version: number;
    /** The spec's title, or the id when the spec is not loaded. */
    title: string;
}

/** The designer's picks per agreement, by id AND version — the listing face
 *  of `templateComposedByAgreement`, keyed the same way. A clause's identity
 *  is (id, version) and any version is anyone's registration, so a review
 *  names the version beside the id, read version-exact from the pinned bytes
 *  (absent = 1, the template's sparse rule). */
export function templateComposedClauses(template: AssemblyTemplate): Record<string, ComposedClause[]> {
    const byAgreement = templateComposedByAgreement(template);
    return Object.fromEntries(
        template.agreements.map((agreement) => [
            agreement.id,
            Object.keys(byAgreement[agreement.id] ?? {}).map((clauseId) => {
                const version = templateClauseVersion(agreement, clauseId);
                return { clauseId, version, title: getClauseSpec(clauseId, version)?.title ?? clauseId };
            }),
        ]),
    );
}

/** A clause the template carries because its spec marks it mandatory, not
 *  because the designer picked it. */
export interface FoldedClause {
    clauseId: string;
    version: number;
    /** The spec's title, or the id when the spec is not loaded. */
    title: string;
    /** The template agreement ids carrying it, or `["assembly"]` for an
     *  assembly-scoped term. */
    carriedBy: string[];
}

/** Every clause the template carries as MANDATORY, by id AND version — the
 *  complement of `templateComposedByAgreement`. "Mandatory" is the spec's
 *  `block.design.article`, written by whoever registered the clause and open
 *  to anyone's registration, so it confers no standing: a review lists every
 *  one of these for the designer to confirm before anchoring, never folds
 *  them out of sight. Read from the pinned bytes, version-exact. */
export function templateFoldedClauses(template: AssemblyTemplate): FoldedClause[] {
    const folded = new Map<string, FoldedClause>();
    const note = (clauseId: string, version: number, carrier: string) => {
        if (!clauseIsMandatory(clauseId, version)) return;
        const key = `${clauseId}#${version}`;
        const entry = folded.get(key)
            ?? { clauseId, version, title: getClauseSpec(clauseId, version)?.title ?? clauseId, carriedBy: [] };
        entry.carriedBy.push(carrier);
        folded.set(key, entry);
    };
    for (const clauseId of Object.keys(template.assemblyClauses ?? {})) {
        note(clauseId, template.assemblyClauseVersions?.[clauseId] ?? 1, "assembly");
    }
    for (const agreement of template.agreements) {
        for (const clauseId of Object.keys(agreement.clauses)) {
            note(clauseId, templateClauseVersion(agreement, clauseId), agreement.id);
        }
    }
    return Array.from(folded.values());
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
        /** canvas order id → the same picks by id and version, for the
         *  review's listing. */
        composedClausesByOrderId: Record<string, ComposedClause[]>;
        /** The assembly-scoped composition exactly as the template carries it. */
        assemblyClauses: Record<string, Record<string, unknown>>;
        /** The mandatory clauses the template carries, by id and version — what
         *  the designer confirms before publish. */
        folded: FoldedClause[];
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
        const clausesByAgreement = templateComposedClauses(template);
        const composedByOrderId: Record<string, Record<string, Record<string, unknown>>> = {};
        const composedClausesByOrderId: Record<string, ComposedClause[]> = {};
        snapshot.orders.forEach((order, index) => {
            const agreementId = template.agreements[index]?.id;
            if (agreementId === undefined) return;
            composedByOrderId[order.orderHash] = byAgreement[agreementId] ?? {};
            composedClausesByOrderId[order.orderHash] = clausesByAgreement[agreementId] ?? [];
        });
        return {
            ok: true,
            template,
            compositionHash,
            slug: deriveAssemblySlug(compositionHash),
            composedByOrderId,
            composedClausesByOrderId,
            assemblyClauses: template.assemblyClauses ?? {},
            folded: templateFoldedClauses(template),
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

/** A required assembly term the designer has not filled: the clause and the
 *  field, named as the panel labels them. */
export interface MissingAssemblyTerm {
    clauseId: string;
    clauseTitle: string;
    fieldLabel: string;
}

/** The required design fills still empty among the assembly-scoped terms a
 *  composition carries. A term the designer selected declares, in its spec,
 *  which fields the designer fills (`block.design.fills`); a required one
 *  left empty would anchor an assembly whose every agreement is missing a
 *  term it promises (beta r5: a utility-token pin published with no
 *  currency). The review refuses to publish while this is non-empty. */
/**
 * The design fills a clause declares defaults for, as the values a fresh
 * selection starts from: toggling an assembly term on seeds them, so a
 * required fill with a declared default (a forum's subcourt) is filled
 * from the first moment and the anchored template carries it explicitly.
 * A fill with no default (a utility token's currency) stays empty, and
 * `unfilledAssemblyTerms` names it until the designer fills it. Read at the
 * selected version, absent = 1 (the template's sparse rule) — never the
 * highest version of the id the registry read loaded.
 */
export function assemblyClauseDefaults(clauseId: string, version = 1): Record<string, unknown> {
    const spec = getClauseSpec(clauseId, version);
    if (!spec) return {};
    const fills = clauseDesignFills(clauseId, version);
    const out: Record<string, unknown> = {};
    for (const field of spec.fields) {
        if (fills.includes(field.name) && field.default !== undefined) out[field.name] = field.default;
    }
    return out;
}

export function unfilledAssemblyTerms(
    assemblyClauses: Readonly<Record<string, Record<string, unknown>>>,
    versions?: Readonly<Record<string, number>>,
): MissingAssemblyTerm[] {
    const missing: MissingAssemblyTerm[] = [];
    for (const [clauseId, values] of Object.entries(assemblyClauses)) {
        // The version map is sparse: absent = 1, exactly as the template reads.
        const version = versions?.[clauseId] ?? 1;
        const spec = getClauseSpec(clauseId, version);
        if (!spec) continue;
        const fills = clauseDesignFills(clauseId, version);
        for (const field of spec.fields) {
            if (!field.required || !fills.includes(field.name)) continue;
            if (isFilledValue(values?.[field.name])) continue;
            missing.push({ clauseId, clauseTitle: spec.title ?? clauseId, fieldLabel: field.label ?? field.name });
        }
    }
    return missing;
}
