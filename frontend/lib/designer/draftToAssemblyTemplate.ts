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
 * live-cache `liveSpecSource()` adapter, whose fold set holds only the
 * registrations whose stake is live (the drawer's surfacing rule), and by the
 * registered agreements the designer bound to agreements, read from
 * `AgreementRegistry` and verified against their keys (`getComposedAgreement`).
 * It VERIFIES scope placement, refuses an agreement that both binds and
 * composes, refuses a bound agreement lacking a live mandatory clause, and
 * throws on a cold spec cache or an unread bound agreement — loud failures
 * the callers surface, never silently swallowed here.
 */

import {
    buildAssemblyTemplate,
    serializeAssemblyTemplate,
    agreementClauses,
    type BuiltAssemblyTemplate,
    type ComposedAgreement,
    type Hex,
    type HydratedAssembly,
} from "@figaro-protocol/sdk";
import { getComposedAgreement } from "@/lib/protocol/useAgreementRegistry";
import { clauseDesignFills, clauseIsMandatory, getClauseSpec, liveSpecSource } from "@/lib/shared/clauseSpecSource";
import { isFilledValue } from "@/lib/checkout/checkoutDerivations";
import { deriveAssemblySlug, type AssemblyTemplate } from "@/lib/shared/assemblyTemplate";
import { extractErrorMessage } from "@/lib/shared/errors";
import { truncateHex } from "@/lib/shared/formatHex";
import type { DesignSnapshot } from "@/lib/designer/syntheticDesignStore";

/** The registered agreements a snapshot binds, read from this tab's verified
 *  documents. Throws for a bound key not read yet — the build never binds an
 *  agreement it cannot read. */
function boundAgreements(snapshot: DesignSnapshot): Record<string, ComposedAgreement> {
    const out: Record<string, ComposedAgreement> = {};
    for (const [orderId, agreementKey] of Object.entries(snapshot.registeredByOrderId ?? {})) {
        const doc = getComposedAgreement(agreementKey);
        if (!doc) {
            throw new Error(`the registered agreement ${agreementKey} bound to an agreement has not been read from the AgreementRegistry yet`);
        }
        out[orderId] = doc;
    }
    return out;
}

/** Project a design snapshot onto the canonical assembly template and the
 *  agreements newly composed for it (the ones publish registers before the
 *  assembly). Throws when the spec cache is cold (no mandatory clauses
 *  resolvable), a clause is composed at the wrong scope, an agreement both
 *  binds and composes, or a bound agreement is unread or lacks a live
 *  mandatory clause — the SDK's own refusals, and this file's one. */
export function snapshotToAssemblyTemplate(snapshot: DesignSnapshot): BuiltAssemblyTemplate {
    return buildAssemblyTemplate({
        name: snapshot.name.trim() || undefined,
        summary: snapshot.summary?.trim() || undefined,
        description: snapshot.description?.trim() || undefined,
        orders: snapshot.orders,
        clausesByOrderId: snapshot.clausesByOrderId ?? {},
        registeredByOrderId: boundAgreements(snapshot),
        assemblyClauses: snapshot.assemblyClauses,
        specs: liveSpecSource(),
    });
}

/** A built template beside every agreement its agreements bind — the newly
 *  composed ones and the registered ones the designer bound — keyed by
 *  lowercased key, as checkout reads a hydrated assembly. */
function builtToHydrated(built: BuiltAssemblyTemplate): HydratedAssembly {
    const agreements: Record<Hex, ComposedAgreement> = {};
    for (const [key, doc] of Object.entries(built.agreements)) agreements[key.toLowerCase() as Hex] = doc;
    for (const entry of built.template.agreements) {
        const key = entry.agreementKey.toLowerCase() as Hex;
        const doc = agreements[key] ?? getComposedAgreement(key);
        if (doc) agreements[key] = doc;
    }
    return { template: built.template, agreements };
}

/** The clauses an assembly states per AGREEMENT — the read side of the one
 *  walk, for every surface that must show a composition it is about to
 *  publish (review) or has already published (`/view`): each agreement's
 *  registered agreement with the agreement's own fills merged over it.
 *
 *  Keyed by the template's own agreement ids (`order-<i>`). The auto-folded
 *  MANDATORY clauses are left out here: they are not the designer's picks, and
 *  `templateFoldedClauses` lists them on their own, by key.
 *  Everything shown here comes from the pinned bytes, never from a second walk
 *  over the draft — that divergence is the defect this exists to make
 *  impossible. */
export function templateComposedByAgreement(
    hydrated: HydratedAssembly,
): Record<string, Record<string, Record<string, unknown>>> {
    return Object.fromEntries(
        hydrated.template.agreements.map((entry) => [
            entry.id,
            Object.fromEntries(
                Object.entries(agreementClauses(hydrated, entry)).filter(([clauseKey]) => !clauseIsMandatory(clauseKey)),
            ),
        ]),
    );
}

/** A clause the designer picked on one agreement: its key, labeled by its
 *  spec's own name and version when the spec is loaded. */
export interface ComposedClause {
    clauseKey: Hex;
    /** The spec's own `clauseId` and `version` — presentation; undefined while
     *  the spec is not loaded. */
    clauseId?: string;
    version?: number;
    /** The spec's title, or the key when the spec is not loaded. */
    title: string;
}

/** The label of one clause key from the loaded spec: its title, name and
 *  version, or the key itself while the spec is not loaded. */
function clauseLabel(clauseKey: Hex): { clauseId?: string; version?: number; title: string } {
    const spec = getClauseSpec(clauseKey);
    return spec ? { clauseId: spec.clauseId, version: spec.version, title: spec.title } : { title: clauseKey };
}

/** How a review names one clause: the spec's own name and version beside a
 *  short form of the key — two specs may share a name, never a key. */
export function composedClauseLabel(clause: Pick<ComposedClause, "clauseKey" | "clauseId" | "version">): string {
    const key = truncateHex(clause.clauseKey, { head: 10, tail: 4 });
    return clause.clauseId === undefined ? key : `${clause.clauseId} · v${clause.version} · ${key}`;
}

/** The designer's picks per agreement, by key — the listing face of
 *  `templateComposedByAgreement`, keyed the same way. Any spec is anyone's
 *  registration and two specs may share a name, so a review shows the
 *  spec's version beside its name, read from the spec the key names. */
export function templateComposedClauses(hydrated: HydratedAssembly): Record<string, ComposedClause[]> {
    const byAgreement = templateComposedByAgreement(hydrated);
    return Object.fromEntries(
        hydrated.template.agreements.map((agreement) => [
            agreement.id,
            (Object.keys(byAgreement[agreement.id] ?? {}) as Hex[]).map((clauseKey) => ({ clauseKey, ...clauseLabel(clauseKey) })),
        ]),
    );
}

/** A clause the template carries because its spec marks it mandatory, not
 *  because the designer picked it. */
export interface FoldedClause {
    clauseKey: Hex;
    /** The spec's own `clauseId` and `version` — presentation. */
    clauseId?: string;
    version?: number;
    /** The spec's title, or the key when the spec is not loaded. */
    title: string;
    /** The agreement ids carrying it, or `["assembly"]` for an
     *  assembly-scoped term. */
    carriedBy: string[];
}

/** Every clause the template carries as MANDATORY, by key — the
 *  complement of `templateComposedByAgreement`. "Mandatory" is the spec's
 *  `block.design.article`, written by whoever registered the clause and open
 *  to anyone's registration, so it confers no standing: a review lists every
 *  one of these for the designer to confirm before anchoring, never folds
 *  them out of sight. Read from the pinned bytes. */
export function templateFoldedClauses(hydrated: HydratedAssembly): FoldedClause[] {
    const { template } = hydrated;
    const folded = new Map<string, FoldedClause>();
    const note = (clauseKey: Hex, carrier: string) => {
        if (!clauseIsMandatory(clauseKey)) return;
        const entry = folded.get(clauseKey.toLowerCase()) ?? { clauseKey, ...clauseLabel(clauseKey), carriedBy: [] };
        entry.carriedBy.push(carrier);
        folded.set(clauseKey.toLowerCase(), entry);
    };
    for (const clauseKey of Object.keys(template.assemblyClauses ?? {}) as Hex[]) note(clauseKey, "assembly");
    for (const entry of template.agreements) {
        for (const clauseKey of Object.keys(agreementClauses(hydrated, entry)) as Hex[]) note(clauseKey, entry.id);
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
        /** The template beside every agreement its agreements bind. */
        hydrated: HydratedAssembly;
        /** The agreements newly composed for this assembly, by key — the
         *  ones publish registers (one stake each, a key already bound is
         *  skipped) before the assembly. */
        newAgreements: Record<Hex, ComposedAgreement>;
        /** Per agreement, in template order: the canvas order id, the
         *  agreement key it binds, and whether that agreement was bound as
         *  registered or composed here. */
        entries: { orderId: string; agreementKey: Hex; bound: boolean }[];
        compositionHash: `0x${string}`;
        slug: string;
        /** canvas order id → clause key → composed values (mandatory folds out). */
        composedByOrderId: Record<string, Record<string, Record<string, unknown>>>;
        /** canvas order id → the same picks with their labels, for the
         *  review's listing. */
        composedClausesByOrderId: Record<string, ComposedClause[]>;
        /** The assembly-scoped composition exactly as the template carries it. */
        assemblyClauses: Record<string, Record<string, unknown>>;
        /** The mandatory clauses the template carries, by key — what
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
        const built = snapshotToAssemblyTemplate(snapshot);
        const { template } = built;
        const hydrated = builtToHydrated(built);
        const { compositionHash } = serializeAssemblyTemplate(template);
        const byAgreement = templateComposedByAgreement(hydrated);
        const clausesByAgreement = templateComposedClauses(hydrated);
        const boundIds = new Set(Object.keys(snapshot.registeredByOrderId ?? {}));
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
            hydrated,
            newAgreements: built.agreements,
            entries: snapshot.orders.map((order, index) => ({
                orderId: order.orderHash,
                agreementKey: template.agreements[index].agreementKey,
                bound: boundIds.has(order.orderHash),
            })),
            compositionHash,
            slug: deriveAssemblySlug(compositionHash),
            composedByOrderId,
            composedClausesByOrderId,
            assemblyClauses: template.assemblyClauses ?? {},
            folded: templateFoldedClauses(hydrated),
        };
    } catch (cause) {
        return {
            ok: false,
            error: extractErrorMessage(cause, "Could not derive the composition identity."),
        };
    }
}

/** The composition's IDENTITY, derived from the draft exactly as publish
 *  derives it: `compositionHash` = the merkle root over the agreements (each
 *  agreement's agreement key and its own fills) and the assembly terms (the
 *  AssemblyRegistry key), and the slug that is a pure function of it. The
 *  editorial prose is excluded, so renaming never forks identity; any change
 *  to the composed clauses — a design fill's value included, which moves the
 *  agreement's agreement key — does.
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
    clauseKey: string;
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
 * `unfilledAssemblyTerms` names it until the designer fills it. Read from
 * the spec the key names — never another spec of the same name.
 */
export function assemblyClauseDefaults(clauseKey: string): Record<string, unknown> {
    const spec = getClauseSpec(clauseKey);
    if (!spec) return {};
    const fills = clauseDesignFills(clauseKey);
    const out: Record<string, unknown> = {};
    for (const field of spec.fields) {
        if (fills.includes(field.name) && field.default !== undefined) out[field.name] = field.default;
    }
    return out;
}

/**
 * One toggle of a registered clause row — one key — on the canvas's
 * composition of one scope: the assembly terms (`assemblyClauses`) or one
 * order's terms (`clausesByOrderId[id]`). Both scopes call this; the rule is
 * one.
 *
 * - Unchecking removes the key.
 * - A fresh pick starts from `freshFills` (an assembly term seeds its
 *   declared defaults; an order's pick starts empty). Another version of a
 *   clause is another key, so moving to it is a fresh pick: a value composed
 *   under one spec never rides on another spec's composition.
 * - Re-checking a key already composed leaves its fills untouched.
 */
export function toggleClauseByKey(
    values: Readonly<Record<string, Record<string, unknown>>>,
    clauseKey: string,
    next: boolean,
    freshFills: Record<string, unknown>,
): Record<string, Record<string, unknown>> {
    const out = { ...values };
    if (!next) {
        delete out[clauseKey];
        return out;
    }
    if (values[clauseKey] === undefined) out[clauseKey] = freshFills;
    return out;
}

export function unfilledAssemblyTerms(
    assemblyClauses: Readonly<Record<string, Record<string, unknown>>>,
): MissingAssemblyTerm[] {
    const missing: MissingAssemblyTerm[] = [];
    for (const [clauseKey, values] of Object.entries(assemblyClauses)) {
        const spec = getClauseSpec(clauseKey);
        if (!spec) continue;
        const fills = clauseDesignFills(clauseKey);
        for (const field of spec.fields) {
            if (!field.required || !fills.includes(field.name)) continue;
            if (isFilledValue(values?.[field.name])) continue;
            missing.push({ clauseKey, clauseTitle: spec.title ?? clauseKey, fieldLabel: field.label ?? field.name });
        }
    }
    return missing;
}
