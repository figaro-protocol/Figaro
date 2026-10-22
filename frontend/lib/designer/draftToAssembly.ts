/**
 * lib/designer/draftToAssembly.ts — the AUTHORING direction of the
 * draft ↔ assembly bridge; the mirror of `assemblyToDraft.ts`.
 *
 * ONE walk from a `DesignSnapshot` (what the canvas holds) to the canonical
 * `Assembly` (what gets pinned + anchored). Publish, the composition
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
 * The walk itself is `buildAssembly` (`@figaro-protocol/sdk`), fed by the
 * live-cache `specSource()` adapter, by the DAO's mandatory clauses the
 * registry states (`mandatoryClausesForCanvas`) and by the registered
 * agreements the designer bound to agreements, read from `AgreementRegistry`
 * and verified against their keys (`getRegisteredAgreement`). It VERIFIES
 * scope placement, refuses an agreement that both binds and composes,
 * refuses an agreement lacking a clause of commerce's or topology's shape,
 * and throws on a cold spec cache or an unread bound agreement — loud
 * failures the callers
 * surface, never silently swallowed here.
 */

import {
    buildAssembly,
    serializeAssembly,
    agreementClauses,
    type BuiltAssembly,
    type RegisteredAgreement,
    type Hex,
    type HydratedAssembly,
} from "@figaro-protocol/sdk";
import { getRegisteredAgreement } from "@/lib/protocol/useAgreementRegistry";
import { clauseDesignFills, clauseIsMandatory, getClauseSpec, mandatoryClausesForCanvas, specSource } from "@/lib/shared/clauseSpecSource";
import { isFilledValue } from "@/lib/checkout/checkoutDerivations";
import { deriveAssemblySlug, type Assembly } from "@/lib/shared/assembly";
import { extractErrorMessage } from "@/lib/shared/errors";
import { truncateHex } from "@/lib/shared/formatHex";
import type { DesignSnapshot } from "@/lib/designer/syntheticDesignStore";

/** The registered agreements an order map names (the ones a snapshot
 *  binds), read from this tab's verified documents. Throws for a key not read
 *  yet — the build never uses an agreement it cannot read. */
function readAgreements(byOrderId: Record<string, `0x${string}`> | undefined, use: string): Record<string, RegisteredAgreement> {
    const out: Record<string, RegisteredAgreement> = {};
    for (const [orderId, agreementHash] of Object.entries(byOrderId ?? {})) {
        const doc = getRegisteredAgreement(agreementHash);
        if (!doc) {
            throw new Error(`the registered agreement ${agreementHash} ${use} has not been read from the AgreementRegistry yet`);
        }
        out[orderId] = doc;
    }
    return out;
}

/** Project a design snapshot onto the canonical assembly and the
 *  agreements newly composed for it (the ones publish registers before the
 *  assembly). The mandatory clauses are the DAO's live commerce and topology
 *  (`mandatoryClausesForCanvas`), written into every agreement it composes
 *  before the designer's selection. Throws when a clause's spec is not loaded
 *  or is composed at the wrong scope, an agreement both binds and composes, a
 *  bound agreement is unread, or an agreement lacks a clause of commerce's or
 *  topology's shape — the SDK's own refusals, and this file's one. */
export function snapshotToAssembly(snapshot: DesignSnapshot): BuiltAssembly {
    return buildAssembly({
        name: snapshot.name.trim() || undefined,
        summary: snapshot.summary?.trim() || undefined,
        description: snapshot.description?.trim() || undefined,
        orders: snapshot.orders,
        clausesByOrderId: snapshot.clausesByOrderId ?? {},
        registeredByOrderId: readAgreements(snapshot.registeredByOrderId, "bound to an agreement"),
        assemblyClauses: snapshot.assemblyClauses,
        mandatory: mandatoryClausesForCanvas(),
        specs: specSource(),
    });
}

/** A built assembly beside every agreement its agreements bind — the newly
 *  composed ones and the registered ones the designer bound — keyed by
 *  lowercased key, as checkout reads a hydrated assembly. */
function builtToHydrated(built: BuiltAssembly): HydratedAssembly {
    const agreements: Record<Hex, RegisteredAgreement> = {};
    for (const [key, doc] of Object.entries(built.agreements)) agreements[key.toLowerCase() as Hex] = doc;
    for (const entry of built.assembly.agreements) {
        const key = entry.agreementHash.toLowerCase() as Hex;
        const doc = agreements[key] ?? getRegisteredAgreement(key);
        if (doc) agreements[key] = doc;
    }
    return { assembly: built.assembly, agreements };
}

/** The clauses an assembly states per AGREEMENT — the read side of the one
 *  walk, for every surface that must show a composition it is about to
 *  publish (review) or has already published (`/view`): each agreement's
 *  registered agreement with the agreement's own fills merged over it.
 *
 *  Keyed by the assembly's own agreement ids (`order-<i>`). The MANDATORY
 *  clauses are left out here: they come from the registered agreement picked
 *  in the mandatory article, and `assemblyMandatoryClauses` lists them on
 *  their own, by key.
 *  Everything shown here comes from the pinned bytes, never from a second walk
 *  over the draft — that divergence is the defect this exists to make
 *  impossible. */
export function assemblyComposedByAgreement(
    hydrated: HydratedAssembly,
): Record<string, Record<string, Record<string, unknown>>> {
    return Object.fromEntries(
        hydrated.assembly.agreements.map((entry) => [
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
 *  `assemblyComposedByAgreement`, keyed the same way. Any spec is anyone's
 *  registration and two specs may share a name, so a review shows the
 *  spec's version beside its name, read from the spec the key names. */
export function assemblyComposedClauses(hydrated: HydratedAssembly): Record<string, ComposedClause[]> {
    const byAgreement = assemblyComposedByAgreement(hydrated);
    return Object.fromEntries(
        hydrated.assembly.agreements.map((agreement) => [
            agreement.id,
            (Object.keys(byAgreement[agreement.id] ?? {}) as Hex[]).map((clauseKey) => ({ clauseKey, ...clauseLabel(clauseKey) })),
        ]),
    );
}

/** A clause the assembly carries whose spec marks it mandatory — the DAO's,
 *  written in by the canvas, or carried by a bound agreement. */
export interface MandatoryClause {
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

/** Every clause the assembly carries as MANDATORY, by key — the
 *  complement of `assemblyComposedByAgreement`. "Mandatory" is the spec's
 *  `block.design.article`, written by whoever registered the clause and open
 *  to anyone's registration, so it confers no standing: a review lists every
 *  one of these for the designer to confirm before anchoring, never hides
 *  them. Read from the pinned bytes. */
export function assemblyMandatoryClauses(hydrated: HydratedAssembly): MandatoryClause[] {
    const { assembly } = hydrated;
    const mandatory = new Map<string, MandatoryClause>();
    const note = (clauseKey: Hex, carrier: string) => {
        if (!clauseIsMandatory(clauseKey)) return;
        const entry = mandatory.get(clauseKey.toLowerCase()) ?? { clauseKey, ...clauseLabel(clauseKey), carriedBy: [] };
        entry.carriedBy.push(carrier);
        mandatory.set(clauseKey.toLowerCase(), entry);
    };
    for (const clauseKey of Object.keys(assembly.assemblyClauses ?? {}) as Hex[]) note(clauseKey, "assembly");
    for (const entry of assembly.agreements) {
        for (const clauseKey of Object.keys(agreementClauses(hydrated, entry)) as Hex[]) note(clauseKey, entry.id);
    }
    return Array.from(mandatory.values());
}

/** A draft projected onto the bytes that publish anchors, plus the readout
 *  those bytes produce — the ONE object a review screen renders and the
 *  publish call sends. `composedByOrderId` is re-keyed from the assembly's
 *  local agreement ids back onto the canvas's own order ids (the build labels
 *  agreements `order-<i>` in the snapshot's own order, so the mapping is
 *  positional), so a node on the review canvas reads its own composition out
 *  of the published assembly rather than out of the draft a second time. */
export type SnapshotReview =
    | {
        ok: true;
        assembly: Assembly;
        /** The assembly beside every agreement its agreements bind. */
        hydrated: HydratedAssembly;
        /** The agreements newly composed for this assembly, by key — the
         *  ones publish registers (one stake each, a key already bound is
         *  skipped) before the assembly. */
        newAgreements: Record<Hex, RegisteredAgreement>;
        /** Per agreement, in assembly order: the canvas order id, the
         *  agreement hash it binds, and whether that agreement was bound as
         *  registered or composed here. */
        entries: { orderId: string; agreementHash: Hex; bound: boolean }[];
        assemblyHash: `0x${string}`;
        slug: string;
        /** canvas order id → clause key → composed values (the mandatory clauses listed apart). */
        composedByOrderId: Record<string, Record<string, Record<string, unknown>>>;
        /** canvas order id → the same picks with their labels, for the
         *  review's listing. */
        composedClausesByOrderId: Record<string, ComposedClause[]>;
        /** The assembly-scoped composition exactly as the assembly carries it. */
        assemblyClauses: Record<string, Record<string, unknown>>;
        /** The mandatory clauses the assembly carries, by key — what
         *  the designer confirms before publish. */
        mandatory: MandatoryClause[];
    }
    | { ok: false; error: string };

/** Project a draft for review. Never throws: a cold spec cache or a
 *  mis-scoped clause comes back as `{ ok: false, error }` — a review screen
 *  that cannot build the assembly must say so and refuse to publish, never
 *  render an empty composition. */
export function projectSnapshotForReview(snapshot: DesignSnapshot): SnapshotReview {
    try {
        const built = snapshotToAssembly(snapshot);
        const { assembly } = built;
        const hydrated = builtToHydrated(built);
        const { assemblyHash } = serializeAssembly(assembly);
        const byAgreement = assemblyComposedByAgreement(hydrated);
        const clausesByAgreement = assemblyComposedClauses(hydrated);
        const boundIds = new Set(Object.keys(snapshot.registeredByOrderId ?? {}));
        const composedByOrderId: Record<string, Record<string, Record<string, unknown>>> = {};
        const composedClausesByOrderId: Record<string, ComposedClause[]> = {};
        snapshot.orders.forEach((order, index) => {
            const agreementId = assembly.agreements[index]?.id;
            if (agreementId === undefined) return;
            composedByOrderId[order.orderHash] = byAgreement[agreementId] ?? {};
            composedClausesByOrderId[order.orderHash] = clausesByAgreement[agreementId] ?? [];
        });
        return {
            ok: true,
            assembly,
            hydrated,
            newAgreements: built.agreements,
            entries: snapshot.orders.map((order, index) => ({
                orderId: order.orderHash,
                agreementHash: assembly.agreements[index].agreementHash,
                bound: boundIds.has(order.orderHash),
            })),
            assemblyHash,
            slug: deriveAssemblySlug(assemblyHash),
            composedByOrderId,
            composedClausesByOrderId,
            assemblyClauses: assembly.assemblyClauses ?? {},
            mandatory: assemblyMandatoryClauses(hydrated),
        };
    } catch (cause) {
        return {
            ok: false,
            error: extractErrorMessage(cause, "Could not derive the composition identity."),
        };
    }
}

/** The composition's IDENTITY, derived from the draft exactly as publish
 *  derives it: `assemblyHash` = the merkle root over the agreements (each
 *  agreement's agreement hash and its own fills) and the assembly terms (the
 *  AssemblyRegistry key), and the slug that is a pure function of it. The
 *  editorial prose is excluded, so renaming never forks identity; any change
 *  to the composed clauses — a design fill's value included, which moves the
 *  agreement's agreement hash — does.
 *
 *  The identity face of `projectSnapshotForReview`, so the canvas readout and
 *  the review screen can never disagree about which assembly this is.
 *  Never throws: a cold spec cache or a mis-scoped clause comes back as
 *  `{ error }` for the caller to render. */
export function snapshotAssemblyIdentity(
    snapshot: DesignSnapshot,
): { assemblyHash: `0x${string}`; slug: string; error: null }
    | { assemblyHash: null; slug: null; error: string } {
    const review = projectSnapshotForReview(snapshot);
    return review.ok
        ? { assemblyHash: review.assemblyHash, slug: review.slug, error: null }
        : { assemblyHash: null, slug: null, error: review.error };
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
 * from the first moment and the anchored assembly carries it explicitly.
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
