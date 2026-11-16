/**
 * projection.ts — from composed clauses to the canonical Agreement, and from
 * a design's orders to the assembly. The deterministic projection
 * rules BOTH parties (and any second frontend) must reproduce byte-exactly,
 * because their outputs are hashed: `checkoutHash` (the merkle root the
 * commitment signs) and `assemblyHash` (assembly identity).
 *
 * The SDK holds NO clause-spec cache. Every function takes a `SpecSource` —
 * the consumer's window onto the live ClauseRegistry→IPFS spec set. A spec
 * that is not (yet) loaded returns `undefined` from `get`, and the
 * projection degrades exactly as the registry-reading frontend does: no
 * defaults injected, validation skipped for that clause, field lookups
 * fall back to data-key presence. Consumers that need strictness gate on
 * their cache being warm before projecting.
 *
 * Six `block` attributes are the reference tooling's rules for collecting
 * the data a party signs: `design.article` (`"attestations"`: a process-log
 * clause stays an empty anchor at commit; `"denomination"`: the deploy-time
 * currency fill),
 * `design.scope` (`"assembly"`: composed once for the whole design and folded
 * into every agreement at checkout), `design.fills` (the fields whose values
 * the DESIGNER composes into the assembly; every other clause's assembly
 * values are `{}` and its fields fill at checkout), and the `checkout` fills
 * (`catalogueFills` / `profileFills` / `catalogueMeasures` — which fields the
 * catalog and member-profile folds write). `parseProjectionHints` extracts
 * exactly those from a raw spec document; everything else in `block` is
 * presentation the SDK never reads. No fingerprint function reads `block`:
 * `computeClauseKey` leaves it out, and `agreementHashOf`, `assemblyHashOf`
 * and `computeCheckoutHash` read clause keys and data only. Another frontend
 * may collect the data differently; both parties sign one `checkoutHash` over
 * one agreement, which either recomputes from the agreement alone. (A
 * field's `default` lives in the protocol half, outside `block`:
 * `withSpecDefaults` fills omitted fields from the spec, so the default lands
 * in the signed clause.)
 */

import {
    canonicalize,
    computeCheckoutHash,
    topologyLeafBytes,
    withholdClauseContent,
    type Agreement,
    type AgreementClause,
} from "./agreement.js";
import {
    agreementHashOf,
    assertNotReservedKey,
    resolveAuthoredClauseKeys,
    assemblyHashOf,
    agreementClauses,
    deriveAssemblySlug,
    type Assembly,
    type RegisteredAgreement,
    type AssemblyAgreement,
    type HydratedAssembly,
} from "./assembly.js";
import { validateContent, type ClauseSpec } from "./clauses/index.js";
import { isAddressHex, isBytes32Hex, type Address, type Commitment, type Hex } from "./types.js";

// ── The spec seam ───────────────────────────────────────────────────────────

/** The slice of a clause spec's `block` the reference tooling collects the
 *  data by — the six phase-section attributes that steer which values it
 *  writes into the assembly and the checkout folds, lifted out of the
 *  sectioned block. Another frontend may collect the data differently; no
 *  fingerprint function reads these. */
export interface ProjectionHints {
    /** The spec's `block.design.article` (e.g. `"attestations"`, `"denomination"`). */
    article?: string;
    /** The spec's `block.design.scope` — `"assembly"` marks a clause composed
     *  ONCE for the whole design (a term of the composition: a denomination
     *  pin, a dispute forum) and folded into EVERY agreement at checkout so
     *  every party signs it. Absent/`"agreement"` = the default: composed
     *  per-order, a term of one relationship. */
    scope?: string;
    /** The spec's `block.design.fills` — the content fields (by name) the
     *  DESIGNER authors into the assembly (the tailoring: a pinned consent
     *  document, a pinned denomination); their values survive into the
     *  published assembly. Absent/empty = the designer only selects the
     *  clause. */
    designFills?: readonly string[];
    /** The spec's `block.checkout.catalogueFills` — the content fields (by
     *  name) authored per-item on the member's CATALOG and folded onto the
     *  matching leaf at checkout. */
    catalogueFills?: readonly string[];
    /** The spec's `block.checkout.profileFills` — the content fields (by
     *  name) authored once on the member's PROFILE (the member's master data: a
     *  divisor, a declared credential id), folded onto the matching leaf at
     *  checkout. The profile sibling of `catalogueFills` (item master data). */
    profileFills?: readonly string[];
    /** The spec's `block.checkout.catalogueMeasures` — for each content field
     *  (by name) it lists, the catalog-item field it is read from and how the
     *  order's lines combine it (`CatalogueMeasure`). */
    catalogueMeasures?: Readonly<Record<string, CatalogueMeasure>>;
}

/** One declared catalog measure: the catalog-item field (`from`, a field
 *  of the item a seller lists, e.g. its mass) and how an order's lines
 *  combine it into the clause field. `"sum"`: the item's value × the line's
 *  quantity, added over every line. `"single-unit"`: the item's value, only
 *  when the order is one unit (one line, quantity 1) — a measure that does
 *  not add across units, such as a packaged dimension. */
export interface CatalogueMeasure {
    from: string;
    combine: "sum" | "single-unit";
}

/** A clause spec as the projection sees it: the off-chain spec plus the
 *  hints the reference tooling collects the data by. */
export type ProjectionSpecView = ClauseSpec & { clauseKey: Hex; hints?: ProjectionHints };

/**
 * The consumer's window onto its loaded clause specs (ClauseRegistry → IPFS).
 * A clause's identity is its KEY, `keccak256` of the canonical spec without
 * its `block` (`computeClauseKey`), so `get` reads one registration by key and nothing
 * reads a clause by name; `list` returns every spec the source surfaces, each
 * carrying its key. A spec's `clauseId` and `version` are presentation.
 */
export interface SpecSource {
    get(clauseKey: Hex): ProjectionSpecView | undefined;
    list(): readonly ProjectionSpecView[];
}

/** Extract the reference tooling's collection hints from a raw spec document's `block`
 *  slice (`JSON.parse`d clause JSON, sectioned by phase: design / checkout /
 *  runtime). Everything else in `block` is presentation and deliberately not
 *  surfaced here. */
export function parseProjectionHints(rawSpec: unknown): ProjectionHints {
    const block = (rawSpec as { block?: Record<string, unknown> } | null)?.block;
    if (!block || typeof block !== "object") return {};
    const hints: ProjectionHints = {};
    const design = block.design;
    if (design && typeof design === "object" && !Array.isArray(design)) {
        const d = design as Record<string, unknown>;
        if (typeof d.article === "string") hints.article = d.article;
        if (typeof d.scope === "string") hints.scope = d.scope;
        const fills = parseFillList(d.fills);
        if (fills) hints.designFills = fills;
    }
    const checkout = block.checkout;
    if (checkout && typeof checkout === "object" && !Array.isArray(checkout)) {
        const c = checkout as Record<string, unknown>;
        const catalog = parseFillList(c.catalogueFills);
        if (catalog) hints.catalogueFills = catalog;
        const profile = parseFillList(c.profileFills);
        if (profile) hints.profileFills = profile;
        const measures = parseCatalogueMeasures(c.catalogueMeasures);
        if (measures) hints.catalogueMeasures = measures;
    }
    return hints;
}

/** The well-formed entries of a `catalogueMeasures` map, or undefined when
 *  none is. An entry with an unknown `combine` is skipped, as an absent
 *  attribute is: the schema is open, so a later combinator never breaks an
 *  older reader. */
function parseCatalogueMeasures(raw: unknown): Readonly<Record<string, CatalogueMeasure>> | undefined {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
    const out: Record<string, CatalogueMeasure> = {};
    for (const [field, entry] of Object.entries(raw as Record<string, unknown>)) {
        if (field.length === 0 || !entry || typeof entry !== "object" || Array.isArray(entry)) continue;
        const { from, combine } = entry as Record<string, unknown>;
        if (typeof from !== "string" || from.length === 0) continue;
        if (combine !== "sum" && combine !== "single-unit") continue;
        out[field] = { from, combine };
    }
    return Object.keys(out).length > 0 ? out : undefined;
}

/** A non-empty array of non-empty field names, or undefined. */
function parseFillList(raw: unknown): readonly string[] | undefined {
    if (Array.isArray(raw) && raw.length > 0 && raw.every((f) => typeof f === "string" && f.length > 0)) {
        return raw as string[];
    }
    return undefined;
}

/** Whether a spec declares a top-level field named `fieldName`. Field names —
 *  not clause ids — are the binding vocabulary generic surfaces look things
 *  up by: ANY registered clause carrying the field participates. */
export function specDeclaresField(spec: ProjectionSpecView, fieldName: string): boolean {
    return spec.fields.some((f) => f.name === fieldName);
}

/** Whether a spec declares `fieldName` as PLAIN CONTENT — declared, and NOT a
 *  designer fill (`block.design.fills`). The disambiguating half of
 *  `specDeclaresField` for a field name two clauses legitimately share: an
 *  field may be plain content on one clause (written at checkout, one term
 *  of one order) and a DESIGNER FILL on another (authored into the assembly,
 *  a term of the composition, as a denomination pin's `currency` is). Same
 *  field name, two different terms — so surfaces that mean one of them route
 *  on the declaration, never on a clause id. */
export function specDeclaresContentField(spec: ProjectionSpecView, fieldName: string): boolean {
    return specDeclaresField(spec, fieldName) && !specDesignFills(spec).includes(fieldName);
}

/** Whether a spec declares `fieldName` as a DESIGNER FILL — the pin half of
 *  the pair above (`block.design.fills` carries the field). ANY clause
 *  declaring a `currency` design fill is a denomination pin, including one
 *  this code has never seen. */
export function specDeclaresDesignFill(spec: ProjectionSpecView, fieldName: string): boolean {
    return specDesignFills(spec).includes(fieldName);
}

/** Whether a clause spec declares ANY field as `private`-disposition. A clause
 *  committing such a clause carries paid-edge plaintext that must never reach a
 *  public surface. Because the merkle leaf model withholds a WHOLE clause (never
 *  one field), a clause is treated as private if ANY of its fields is — the
 *  conservative direction (protect the private value; over-redact co-located
 *  public fields). Off-chain validation refuses to register a clause that mixes
 *  dispositions, so in practice this only ever fires on a fully-private clause. */
export function specHasPrivateField(spec: ProjectionSpecView): boolean {
    return spec.fields.some((f) => f.disposition === "private");
}

/** The PUBLIC-pin form of an agreement: every clause whose clause declares a
 *  `private`-disposition field is content-WITHHELD (its plaintext `data` replaced
 *  by the `dataHash` fingerprint), so a paid-edge value never lands on public
 *  IPFS or in a shareable audit bundle. The withheld clause contributes the
 *  IDENTICAL merkle leaf, so `checkoutHash` is unchanged and any reader still
 *  verifies the root and every public clause. Clauses whose clause is entirely
 *  public pass through as plaintext — that is the free coordination commons.
 *
 *  Withholding is FAIL-CLOSED on the spec: a clause is kept as plaintext ONLY
 *  when its spec is loaded AND declares no private field; a clause whose spec is
 *  NOT loaded is withheld. This is the safe direction — an unknown clause could be
 *  a permissionlessly-registered PRIVATE one, and positive-knowledge withholding
 *  (keep-unless-known-private) leaks its plaintext whenever the async spec cache
 *  is cold at pin time. That cold window is real on the RECEIVER re-pin leg: a
 *  seller re-pins an agreement it never composed (so never loaded the clause's
 *  spec through a disposition-aware input), and an offline-delivered payload fires
 *  the re-pin at app boot when the background spec loader has not completed. So the
 *  CALLER must WARM the specs for the agreement's clauses before projecting (see
 *  `warmAgreementSpecs` in `agreementFetch.publishAgreement`); with the cache warm
 *  this fail-closed form is EXACT — private clauses withheld, public clauses
 *  kept — and the over-redaction that fail-closed would otherwise cause for cold
 *  public clauses (commerce) does not occur. If warming fails, the
 *  fail-closed default over-redacts (a public reader sees fingerprints) rather
 *  than leaking — the correct priority. The signed and counterparty-relayed forms
 *  keep full plaintext regardless — only the standalone public pin takes this form. */
export function publicForm(agreement: Agreement, specs: SpecSource): Agreement {
    return {
        ...agreement,
        clauses: agreement.clauses.map((clauseEntry) => {
            if (clauseEntry.data === undefined) return clauseEntry; // already withheld
            const spec = specs.get(clauseEntry.clause);
            const isPrivate = spec ? specHasPrivateField(spec) : true;
            return isPrivate ? withholdClauseContent(clauseEntry) : clauseEntry;
        }),
    };
}

/** The DESIGNER-authored field names of a clause (`block.design.fills`) —
 *  the tailoring that adapts a generic clause to a specific application
 *  (a pinned consent document, a pinned denomination). The assembly
 *  keeps the designer's values for a clause declaring fills; every other
 *  clause's fields are transaction particulars, filled at checkout — the
 *  assembly carries `{}` for it. Empty for clauses the designer only
 *  selects. */
export function specDesignFills(spec: ProjectionSpecView): readonly string[] {
    return spec.hints?.designFills ?? [];
}

/** True for process-log clauses (`block.design.article: "attestations"`) —
 *  empty anchors at commit whose content is attested later. */
export function specIsProcessLog(spec: ProjectionSpecView): boolean {
    return spec.hints?.article === "attestations";
}

/** True for ASSEMBLY-SCOPED clauses (`block.design.scope: "assembly"`) —
 *  terms of the composition itself (a denomination pin, a dispute forum),
 *  composed ONCE for the whole design and folded into EVERY agreement at
 *  checkout so every party signs them. Every other clause is agreement-scoped:
 *  a term of one relationship, composed per-order. */
export function specIsAssemblyScoped(spec: ProjectionSpecView): boolean {
    return spec.hints?.scope === "assembly";
}

/** The CATALOG-authored field names of a clause
 *  (`block.checkout.catalogueFills`) — content authored per-item on the
 *  member's catalog and folded onto the matching leaf at checkout. Empty
 *  for clauses with no catalog-authored fields. */
export function specCatalogFills(spec: ProjectionSpecView): readonly string[] {
    return spec.hints?.catalogueFills ?? [];
}

/** The PROFILE-authored field names of a clause
 *  (`block.checkout.profileFills`) — the member's master data, authored once on the
 *  member's profile (the sibling of the catalog's per-item data) and folded
 *  onto the matching leaf at checkout. Editors render exactly these fields;
 *  the fold folds only these values. Empty for clauses with no
 *  profile-authored fields. */
export function specProfileFills(spec: ProjectionSpecView): readonly string[] {
    return spec.hints?.profileFills ?? [];
}

/** The CATALOG MEASURES of a clause (`block.checkout.catalogueMeasures`) —
 *  each content field read from a catalog-item field and combined over the
 *  order's lines (`CatalogueMeasure`). Empty for clauses that declare none. */
export function specCatalogueMeasures(spec: ProjectionSpecView): Readonly<Record<string, CatalogueMeasure>> {
    return spec.hints?.catalogueMeasures ?? {};
}

/** An off-chain validation WARNING (never an error — the permissionless extension axiom:
 *  a third-party clause may declare ANY article) for the one construction
 *  that never makes sense under `article: "attestations"`: pinning content
 *  at DESIGN or CHECKOUT time (`design.fills` / `checkout.catalogueFills` /
 *  `checkout.profileFills` / `checkout.catalogueMeasures`) on a clause the article marks a process-log
 *  (`specIsProcessLog`).
 *
 *  Process-log clauses are runtime event ladders — content arrives via
 *  LATER attestation submissions, never the initial agreement — so
 *  `validateCommitmentAgreement` SKIPS content validation for every clause
 *  of such a clause (its `specIsProcessLog` short-circuit) and
 *  `withSpecDefaults` never fills its omitted fields. A fill declared on
 *  such a clause is therefore content the author believes is pinned and
 *  checked, that in fact commits unchecked — the "reserved article silently
 *  commits an empty (unvalidated) anchor" trap. This is scoped precisely to
 *  that combination: `attestations` alone is not warned (it is meaningful
 *  and correct for a real process-log clause — neither shipped one,
 *  `figaro-merchant-process` nor `figaro-courier-process`, declares any
 *  fill list, which is the signal a genuine process-log clause never
 *  trips), and a fill list alone on any other article is the normal,
 *  intended pattern (`figaro-utility-token`, `figaro-dimweight`, …). */
export function warnProcessLogFillsTrap(spec: ProjectionSpecView): readonly string[] {
    if (!specIsProcessLog(spec)) return [];
    const warnings: string[] = [];
    if (specDesignFills(spec).length > 0) {
        warnings.push(
            `${spec.clauseId}: block.design.article is "attestations" (a process-log clause — ` +
            `content arrives via later runtime attestations, never the initial agreement) but the ` +
            `spec also declares block.design.fills. The pinned fields will never be validated — ` +
            `validateCommitmentAgreement skips content validation entirely for process-log clauseEntries. ` +
            `If this clause's content should be committed and checked at design time, use a ` +
            `different article; "attestations" is reserved for runtime event ladders.`,
        );
    }
    if (specCatalogFills(spec).length > 0 || specProfileFills(spec).length > 0
        || Object.keys(specCatalogueMeasures(spec)).length > 0) {
        warnings.push(
            `${spec.clauseId}: block.design.article is "attestations" (a process-log clause — ` +
            `content arrives via later runtime attestations, never the initial agreement) but the ` +
            `spec also declares block.checkout.catalogueFills, profileFills or catalogueMeasures. That checkout-authored ` +
            `content will never be validated — validateCommitmentAgreement skips content validation ` +
            `entirely for process-log clauseEntries. "attestations" is reserved for runtime event ladders ` +
            `whose content arrives later, not checkout-time fills.`,
        );
    }
    return warnings;
}

// ── Agreement projection ────────────────────────────────────────────────────

export interface OrderAgreement {
    agreement: Agreement;
    checkoutHash: `0x${string}`;
}

/** Fill fields the composing input omitted with the clause spec's OWN declared
 *  defaults (registry-sourced, never code-sourced). A process-log clause is an
 *  empty anchor at commit and stays untouched. The agreement is built from
 *  these values, and checkout pricing reads them, so a price is derived from
 *  what is signed. */
export function withSpecDefaults(
    specs: SpecSource,
    clauseKey: Hex,
    data: Record<string, unknown>,
): Record<string, unknown> {
    const spec = specs.get(clauseKey);
    if (!spec || specIsProcessLog(spec)) return data;
    let out = data;
    for (const field of spec.fields ?? []) {
        if (field.default !== undefined && out[field.name] === undefined) {
            if (out === data) out = { ...data };
            out[field.name] = field.default;
        }
    }
    return out;
}

/**
 * Build the order's agreement and merkle tree from its complete clause map.
 * `clauses` is `{ [clauseKey]: fieldValues }` — the pinned assembly's clauses,
 * valued for this order. Clauses are sorted by clause key so the pinned JSON
 * is deterministic; the merkle root sorts its own leaves, so order never
 * affects the hash.
 *
 * It names no clause, special-cases nothing, and re-implements no hashing.
 * The ONE spec-driven step: each clause spec's own declared field defaults
 * fill fields the composing input omitted — the SPEC speaks, the code
 * injects nothing of its own.
 */
export function buildOrderAgreement(
    buyer: `0x${string}`,
    seller: `0x${string}`,
    clauses: Readonly<Record<Hex, Record<string, unknown>>>,
    specs: SpecSource,
): OrderAgreement {
    const clauseEntries: AgreementClause[] = (Object.keys(clauses) as Hex[])
        .map((clause) => ({ clause, data: withSpecDefaults(specs, clause, clauses[clause] ?? {}) }))
        .sort((a, b) => (a.clause < b.clause ? -1 : a.clause > b.clause ? 1 : 0));

    const agreement: Agreement = { version: "a1", buyer, seller, clauses: clauseEntries };
    return { agreement, checkoutHash: computeCheckoutHash(agreement) };
}

/** A single off-chain validation issue found before signing: which clause (its key, or
 *  "(merkle)"), which field path, and what's wrong. */
export interface CommitmentAgreementIssue {
    clause: string;
    path: string;
    message: string;
}

/** A clause's human label — the loaded spec's own `clauseId`, else the key. */
function clauseIdOrKey(clause: string, specs: SpecSource): string {
    return /^0x[0-9a-fA-F]{64}$/.test(clause) ? (specs.get(clause as Hex)?.clauseId ?? clause) : clause;
}

/** An address-valued leaf, or undefined when the clause carries none (a
 *  withheld clause, an unloaded spec, a malformed value — each already an
 *  off-chain validation failure of its own where the field is required). */
function addressLeaf(clauseEntry: AgreementClause | undefined, field: string): `0x${string}` | undefined {
    const value = clauseEntry?.data?.[field];
    return isAddressHex(value) ? value : undefined;
}

/** The clause carrying the COMPOSITION's denomination pin: the composed
 *  clause declaring `currency` as a designer fill. */
function currencyPinClause(
    agreement: Agreement,
    specs: SpecSource,
): AgreementClause | undefined {
    return agreement.clauses.find((s) => {
        const spec = specs.get(s.clause);
        return !!spec && specDeclaresDesignFill(spec, "currency");
    });
}

/** One order the design gives a registered agreement: its clause bag, and
 *  the clause keys (lowercased) an order instantiating it must carry. */
interface DesignOrderBag {
    clauses: Record<string, Record<string, unknown>>;
    required: string[];
}

/** The clause bags a design gives the order an agreement instantiates: one
 *  per assembly agreement binding the registered agreement the provenance
 *  names — the assembly-scoped clauses with that agreement's clauses (its
 *  registered agreement's, its own fills over them) beside them, as the
 *  assembly walk builds every order's bag (`planAssemblyOrders`). */
function designClauseBags(
    design: HydratedAssembly,
    agreementHash: Hex,
): DesignOrderBag[] {
    const assemblyClauses = design.assembly.assemblyClauses ?? {};
    return design.assembly.agreements
        .filter((entry) => entry.agreementHash.toLowerCase() === agreementHash.toLowerCase())
        .map((entry) => {
            const composed = agreementClauses(design, entry);
            const clauses: Record<string, Record<string, unknown>> = {};
            for (const [key, values] of Object.entries({ ...assemblyClauses, ...composed })) {
                clauses[key.toLowerCase()] = values;
            }
            // Every clause the order carries: its registered agreement's, and
            // the assembly-scoped clauses the walk folds into every order.
            const required = new Set(Object.keys(composed).map((key) => key.toLowerCase()));
            for (const key of Object.keys(assemblyClauses)) required.add(key.toLowerCase());
            return { clauses, required: [...required] };
        });
}

/** Every designer value the agreement's clauses do not carry as the design
 *  gives it, against one clause bag of the design: for each clause whose spec
 *  declares `block.design.fills`, each such field the design SETS must arrive
 *  unchanged. A field the design leaves unset is a party's to fill. A clause
 *  whose content is withheld (`dataHash`) cannot show its designer values, so
 *  it fails whenever the design sets one. */
function designerValueIssues(
    agreement: Agreement,
    bag: Record<string, Record<string, unknown>>,
    specs: SpecSource,
): CommitmentAgreementIssue[] {
    const issues: CommitmentAgreementIssue[] = [];
    for (const clauseEntry of agreement.clauses) {
        const spec = specs.get(clauseEntry.clause);
        if (!spec) continue;
        const designed = bag[clauseEntry.clause.toLowerCase()];
        for (const field of specDesignFills(spec)) {
            const value = designed?.[field];
            if (value === undefined) continue;
            if (clauseEntry.data === undefined) {
                issues.push({
                    clause: clauseEntry.clause,
                    path: field,
                    message: `the clause's content is withheld, so the designer's value cannot be shown unchanged`,
                });
                continue;
            }
            if (canonicalize(clauseEntry.data[field] ?? null) !== canonicalize(value)) {
                issues.push({
                    clause: clauseEntry.clause,
                    path: field,
                    message: `the agreement carries ${canonicalize(clauseEntry.data[field] ?? null)}; the designer's value is ${canonicalize(value)}, and a buyer or a seller never changes it`,
                });
            }
        }
    }
    return issues;
}

/** The design check: the agreement names, in its provenance leaf, the
 *  registered agreement and the assembly it instantiates; `design` is that
 *  assembly, hydrated (each registered agreement read and verified against
 *  its key). The design must be the one the provenance names, and every
 *  designer value must arrive unchanged in one of the orders the design
 *  gives that registered agreement. `null` is "no design in hand": an
 *  agreement naming a design then fails, because its designer values cannot
 *  be checked. */
function designIssues(
    agreement: Agreement,
    specs: SpecSource,
    design: HydratedAssembly | null,
): CommitmentAgreementIssue[] {
    const provenance = agreement.provenance;
    // A provenance that is not two 32-byte keys does not encode: the merkle
    // check reports it.
    if (provenance !== undefined && !(isBytes32Hex(provenance.agreementHash) && isBytes32Hex(provenance.assemblyHash))) return [];
    if (design == null) {
        return provenance === undefined ? [] : [{
            clause: "(provenance)",
            path: "assemblyHash",
            message: `the agreement instantiates assembly ${provenance.assemblyHash}, which was not read, so its designer values cannot be checked`,
        }];
    }
    if (provenance === undefined) {
        return [{ clause: "(provenance)", path: "assemblyHash", message: `the agreement names no design, so its designer values cannot be checked` }];
    }
    let assemblyHash: Hex;
    try {
        assemblyHash = assemblyHashOf(design.assembly);
    } catch (cause) {
        return [{ clause: "(provenance)", path: "assemblyHash", message: `the design does not hash: ${cause instanceof Error ? cause.message : String(cause)}` }];
    }
    if (assemblyHash.toLowerCase() !== provenance.assemblyHash.toLowerCase()) {
        return [{
            clause: "(provenance)",
            path: "assemblyHash",
            message: `the agreement instantiates assembly ${provenance.assemblyHash}; the design read is ${assemblyHash}`,
        }];
    }
    let bags: DesignOrderBag[];
    try {
        bags = designClauseBags(design, provenance.agreementHash);
    } catch (cause) {
        return [{ clause: "(provenance)", path: "agreementHash", message: `the design cannot be read: ${cause instanceof Error ? cause.message : String(cause)}` }];
    }
    if (bags.length === 0) {
        return [{
            clause: "(provenance)",
            path: "agreementHash",
            message: `assembly ${provenance.assemblyHash} binds no registered agreement ${provenance.agreementHash}`,
        }];
    }
    // The order matches one of the design's orders for that registered
    // agreement — every clause carried, no clause beyond them, every designer
    // value unchanged; report against the first when it matches none.
    // Carried is a check on KEYS alone: a withheld clause (`dataHash`), a
    // clause whose spec is not loaded and a value-free clause (a process-log
    // clause's empty anchor) each count, so an order never names a design it
    // does not carry. The converse is a check on keys too: a clause the
    // design does not compose — under any key, registered or not, with
    // content or withheld — is a term the signer never selected, so it is
    // refused whatever it carries.
    const carried = new Set(agreement.clauses.map((s) => s.clause.toLowerCase()));
    const named = `assembly ${deriveAssemblySlug(provenance.assemblyHash)} (${provenance.assemblyHash})`;
    let first: CommitmentAgreementIssue[] | undefined;
    for (const bag of bags) {
        const found: CommitmentAgreementIssue[] = bag.required
            .filter((clause) => !carried.has(clause))
            .map((clause) => ({
                clause,
                path: "clause",
                message: `the order does not carry this clause, which ${named} composes for registered agreement ${provenance.agreementHash}`,
            }));
        const composed = new Set(Object.keys(bag.clauses));
        for (const clause of carried) {
            if (composed.has(clause)) continue;
            found.push({
                clause,
                path: "clause",
                message: `the order carries this clause, which ${named} does not compose for registered agreement ${provenance.agreementHash}`,
            });
        }
        found.push(...designerValueIssues(agreement, bag.clauses, specs));
        if (found.length === 0) return [];
        first ??= found;
    }
    return first ?? [];
}

/** The topology check: an agreement built from a design (it names one in its
 *  provenance leaf) carries its topology leaf, an empty list for a root, and
 *  any topology an agreement carries is well formed — a list of 32-byte
 *  order hashes, none named twice (`topologyLeafBytes`). Whether the edges
 *  are the ones the design gives is not checked here. */
function topologyIssues(agreement: Agreement): CommitmentAgreementIssue[] {
    if (agreement.follows === undefined) {
        return agreement.provenance === undefined ? [] : [{
            clause: "(topology)",
            path: "follows",
            message: "the agreement instantiates a design but carries no topology leaf — write the orders it follows, [] for the root",
        }];
    }
    try {
        topologyLeafBytes(agreement.follows);
        return [];
    } catch (cause) {
        return [{ clause: "(topology)", path: "follows", message: cause instanceof Error ? cause.message : String(cause) }];
    }
}

/**
 * The off-chain layer of the verification stack, run on BOTH sides of the bilateral commit
 * (buyer before initiating, seller before counter-signing) so neither party
 * signs an invalid agreement. Four checks: every present clause conforms to
 * its clause spec (validateContent; process-log clauses are presence-markers,
 * skipped); where a denomination pin is composed, the pin equals the token of
 * the commitment about to be signed; the order carries every clause of the
 * design its provenance names (the registered agreement's and the
 * assembly-scoped ones) and every designer value (`block.design.fills`) the
 * design sets arrives unchanged — `design` is the hydrated assembly the
 * agreement's provenance names, `null` when none was read, and an agreement
 * naming a design then fails (a buyer or a seller never drops a designed
 * clause or changes a designer's value); and the `checkoutHash` about to be
 * signed equals the merkle root recomputed from the clauses. The agreement's
 * topology leaf is well formed, and present wherever a design is named
 * (`topologyIssues`). Catches a
 * malformed agreement before a chain round-trip.
 *
 * `commitment` is the commitment being signed. It alone carries the payment
 * and the token: no clause restates either, so there is no copy across the
 * two to compare.
 */
export function validateCommitmentAgreement(
    agreement: Agreement,
    expectedHash: `0x${string}`,
    specs: SpecSource,
    commitment: Commitment,
    design: HydratedAssembly | null,
): { ok: boolean; issues: CommitmentAgreementIssue[] } {
    const issues: CommitmentAgreementIssue[] = [];

    for (const clauseEntry of agreement.clauses) {
        // Structural, before any spec lookup (an attacker can withhold the spec
        // by naming an unregistered clause id): a clause carries EITHER
        // plaintext `data` OR a content-withheld `dataHash`, never both. The
        // signed merkle leaf uses `dataHash` verbatim while the review renders
        // `data`, so a clause carrying both signs one thing and shows another.
        if (clauseEntry.data !== undefined && clauseEntry.dataHash !== undefined) {
            issues.push({
                clause: clauseEntry.clause,
                path: "dataHash",
                message: `clauseEntry carries both plaintext data and a dataHash fingerprint — exactly one is allowed (the signed leaf uses dataHash while the review shows data)`,
            });
            continue;
        }
        // The sign gate refuses what it cannot read (the maintainer's ruling):
        // a content-withheld clause is a leaf the signer binds unread — the
        // public form withholds AFTER the signatures (`publicForm`, at the
        // pin), never before — and a clause whose spec is not in the
        // signer's SpecSource is a term no check can run on. Neither is
        // skipped: "not loaded" never reads as "nothing to check". A display
        // surface keeps resolved-empty as absence; a signature does not.
        if (clauseEntry.data === undefined) {
            issues.push({
                clause: clauseEntry.clause,
                path: "dataHash",
                message: "the clause's content is withheld — a signer binds no leaf it cannot read; sign the agreement with every clause's content, and withhold at the pin",
            });
            continue;
        }
        const spec = specs.get(clauseEntry.clause);
        if (!spec) {
            issues.push({
                clause: clauseEntry.clause,
                path: "clause",
                message: "the clause's spec is not loaded, so its terms cannot be checked — resolve the key through ClauseRegistry before signing; a key no registry holds is not signed",
            });
            continue;
        }
        // A runtime-lifecycle clause is an empty anchor at commit — its content
        // is attested later, so there is nothing to validate here.
        if (specIsProcessLog(spec)) continue;
        const result = validateContent(clauseEntry.data, spec);
        if (!result.ok) {
            for (const e of result.errors) {
                issues.push({ clause: clauseEntry.clause, path: e.path, message: e.message });
            }
        }
    }

    // The denomination pin (when composed) == the commitment's token. A
    // missing or malformed pin is already reported above (the field is
    // required by its spec), so only a pin that IS present is compared.
    const pinClause = currencyPinClause(agreement, specs);
    const pin = addressLeaf(pinClause, "currency");
    if (pinClause && pin && pin.toLowerCase() !== commitment.currency.toLowerCase()) {
        issues.push({
            clause: pinClause.clause,
            path: "currency",
            message: `this assembly is denominated by design (${pin}); the commitment currency ${commitment.currency} contradicts the pinned term`,
        });
    }

    issues.push(...designIssues(agreement, specs, design));
    issues.push(...topologyIssues(agreement));

    if (issues.length === 0) {
        let computed: `0x${string}` | null = null;
        try {
            computed = computeCheckoutHash(agreement);
        } catch (cause) {
            issues.push({
                clause: "(merkle)",
                path: "checkoutHash",
                message: `agreement content failed to encode: ${cause instanceof Error ? cause.message : String(cause)}`,
            });
        }
        if (computed && computed.toLowerCase() !== expectedHash.toLowerCase()) {
            issues.push({
                clause: "(merkle)",
                path: "checkoutHash",
                message: `signed hash ${expectedHash} does not match the agreement's computed root ${computed}`,
            });
        }
    }

    return { ok: issues.length === 0, issues };
}

/**
 * The ONE off-chain validation thrower every signature routes through — buyer sign, seller
 * counter-sign, and the checkout's early pre-wallet check all call this, so no
 * path signs an agreement whose clauses violate their clause specs, whose
 * denomination pin differs from the commitment's token, whose designer values
 * differ from the design it names, or whose hash doesn't match its recomputed
 * merkle root.
 *
 * `commitment` is the commitment being signed. `design` is the hydrated
 * assembly the agreement's provenance names, or `null` when the caller read
 * none — which refuses any agreement naming a design.
 */
export function assertAgreementSignable(
    agreement: Agreement,
    expectedHash: `0x${string}`,
    specs: SpecSource,
    commitment: Commitment,
    design: HydratedAssembly | null,
    label = "This order",
): void {
    const check = validateCommitmentAgreement(agreement, expectedHash, specs, commitment, design);
    if (!check.ok) {
        throw new Error(
            `${label} isn't valid to sign yet: ${check.issues
                .map((i) => `${clauseIdOrKey(i.clause, specs)} ${i.path}: ${i.message}`)
                .join("; ")}`,
        );
    }
}

// ── Reading clauses BY FIELD NAME, never by clause id ─────────────────────

/** Every clause whose registered spec declares a top-level field named
 *  `fieldName`. Falls back to data-key presence only when the spec isn't
 *  loaded (a clause registered but not yet hydrated) — still keyed on the
 *  field, never on the clause id. */
export function clausesByField(
    agreement: Agreement,
    fieldName: string,
    specs: SpecSource,
): AgreementClause[] {
    return agreement.clauses.filter((s) => {
        const spec = specs.get(s.clause);
        return spec
            ? specDeclaresField(spec, fieldName)
            : Object.prototype.hasOwnProperty.call(s.data ?? {}, fieldName);
    });
}

/** The first clause declaring `fieldName`, or undefined. */
export function clauseByField(
    agreement: Agreement,
    fieldName: string,
    specs: SpecSource,
): AgreementClause | undefined {
    return clausesByField(agreement, fieldName, specs)[0];
}

// ── Assembly building (design-time projection) ─────────────────────────────

/** The DAG slice of a design-time order the assembly build reads:
 *  its (synthetic) hash and its parent edges. */
export interface AssemblyOrderNode {
    orderHash: string;
    follows?: readonly string[];
}

/** An agreement is a composition of at least one clause: an empty one's
 *  root is bytes32(0), which `AgreementRegistry.registerAgreement` refuses
 *  (`ZeroAgreementHash`). Throws, naming `label`. No clause of any shape is
 *  required: the commitment carries the payment and the token, and the
 *  agreement format carries the topology (`Agreement.follows`). */
function assertComposesAClause(clauses: Readonly<Record<Hex, Record<string, unknown>>>, label: string): void {
    if (Object.keys(clauses).length === 0) {
        throw new Error(`${label}: composes no clause — its key would be bytes32(0), which the agreement registry refuses`);
    }
}

/** Only the values a clause's `design.fills` declares survive into a assembly
 *  — FIELD-granular, so a stray non-fill value on a fills-declaring clause
 *  strips like any other transaction particular instead of riding its
 *  neighbor's declaration (the pasted-assembly corner: the UI editors gate
 *  per-field, but a assembly arriving whole must strip here too). */
function designFillValues(
    spec: ProjectionSpecView | undefined,
    values: Record<string, unknown>,
): Record<string, unknown> {
    const fills = spec ? specDesignFills(spec) : [];
    if (fills.length === 0) return {};
    return Object.fromEntries(Object.entries(values).filter(([field]) => fills.includes(field)));
}

/** A clause's label for a build error: the spec's own `clauseId` beside its
 *  key when the spec is loaded, the key alone otherwise. */
function clauseLabel(clauseKey: string, spec: ProjectionSpecView | undefined): string {
    return spec ? `${spec.clauseId} (${clauseKey})` : clauseKey;
}

/** What a design-time build produces: the assembly (one agreement per
 *  canvas order, each binding a registered agreement by key) and the
 *  agreements newly composed for it, keyed by `agreementHashOf` — the ones to
 *  pin and register on `AgreementRegistry` (one stake each; a key already
 *  registered is skipped) before the assembly is registered. */
export interface BuiltAssembly {
    assembly: Assembly;
    agreements: Record<Hex, RegisteredAgreement>;
}

/** Compose ONE agreement's registered agreement from the clauses a designer
 *  selected: the scope check (an assembly-scoped clause never composes on an
 *  order; a composed key's spec must be loaded), the value-free rule (only
 *  `block.design.fills` values survive), and the floor (at least one clause,
 *  `assertComposesAClause`).
 *  The result is the registered agreement's
 *  document and its key — what `AgreementRegistry` takes, whether the
 *  designer registers it on its own or an assembly's publish registers it
 *  for an agreement. `buildAssembly` composes every new agreement through
 *  this one function.
 *
 *  The agreement carries exactly the clauses the designer selected: nothing
 *  is written in. No topology is composed: who follows whom is the assembly
 *  entry's `follows`. */
export function composeOrderAgreement(args: {
    /** clauseKey → the designer's composed values for this order. */
    clauses: Readonly<Record<Hex, Record<string, unknown>>>;
    specs: SpecSource;
}): { composed: RegisteredAgreement; agreementHash: Hex } {
    const { clauses: composedClauses, specs } = args;
    for (const clauseKey of Object.keys(composedClauses) as Hex[]) {
        const spec = specs.get(clauseKey);
        if (!spec) {
            throw new Error(`clause ${clauseKey} is composed on an order but its spec is not loaded`);
        }
        if (specIsAssemblyScoped(spec)) {
            throw new Error(
                `${clauseLabel(clauseKey, spec)} declares design.scope "assembly" — compose it once at the assembly level, not on an order`,
            );
        }
    }
    // Design time is STRUCTURAL: the agreement keeps the designer's clause
    // SELECTION, but a clause's field values are transaction particulars —
    // filled at checkout, never composed. Only clauses declaring designer
    // fills (block.design.fills — the designer's tailoring, consent's
    // affixed documents) keep their composed values; everything else
    // strips to `{}` here, so agreements are value-free by construction.
    const clauses: Record<Hex, Record<string, unknown>> = {};
    for (const [clauseKey, values] of Object.entries(composedClauses) as [Hex, Record<string, unknown>][]) {
        clauses[clauseKey] = designFillValues(specs.get(clauseKey), values);
    }
    assertComposesAClause(clauses, "the agreement");
    const composed: RegisteredAgreement = { clauses };
    return { composed, agreementHash: agreementHashOf(composed) };
}

/** Build the assembly from the design's orders. Each canvas order
 *  becomes one agreement binding a registered agreement: EITHER a
 *  registered agreement bound as is (`registeredByOrderId`), OR the clauses
 *  the designer composed for it (`clausesByOrderId`), which become a new
 *  agreement — value-free, carrying exactly the clauses composed for it
 *  (composition time is the only place; checkout adds no clause). Each entry carries its own topology as `follows`, the local
 *  labels of the entries whose orders it follows (`[]` on the root); a
 *  registered agreement names none. */
export function buildAssembly(args: {
    name?: string;
    summary?: string;
    description?: string;
    orders: readonly AssemblyOrderNode[];
    /** orderId → clauseKey → the designer's composed values. */
    clausesByOrderId: Readonly<Record<string, Readonly<Record<Hex, Record<string, unknown>>>>>;
    /** orderId → the registered agreement (hydrated and verified against
     *  its key) the agreement binds as is. An order named here composes no
     *  clauses of its own. */
    registeredByOrderId?: Readonly<Record<string, RegisteredAgreement>>;
    /** ASSEMBLY-SCOPED composition — clauses declaring
     *  `block.design.scope: "assembly"`, composed ONCE for the whole design
     *  (clauseKey → the designer's values). Optional; absent = none. */
    assemblyClauses?: Readonly<Record<Hex, Record<string, unknown>>>;
    specs: SpecSource;
}): BuiltAssembly {
    const { name, summary, description, orders, clausesByOrderId, registeredByOrderId, assemblyClauses, specs } = args;
    // SCOPE VERIFICATION: a clause binds where its spec
    // declares — an assembly-scoped clause composed on an order (or an
    // agreement-scoped clause composed at assembly level) is a build error,
    // never a silent no-op. Duplicates across levels are impossible once both
    // directions are refused. A composed key whose spec is not loaded is a
    // build error too: the build never composes a clause it cannot read.
    const composedSpec = (clauseKey: Hex, level: string): ProjectionSpecView => {
        const spec = specs.get(clauseKey);
        if (!spec) {
            throw new Error(`clause ${clauseKey} is composed ${level} but its spec is not loaded`);
        }
        return spec;
    };
    for (const clauseMap of Object.values(clausesByOrderId)) {
        for (const clauseKey of Object.keys(clauseMap) as Hex[]) {
            const spec = composedSpec(clauseKey, "on an order");
            if (specIsAssemblyScoped(spec)) {
                throw new Error(
                    `${clauseLabel(clauseKey, spec)} declares design.scope "assembly" — compose it once at the assembly level, not on an order`,
                );
            }
        }
    }
    for (const clauseKey of Object.keys(assemblyClauses ?? {}) as Hex[]) {
        const spec = composedSpec(clauseKey, "at the assembly level");
        if (!specIsAssemblyScoped(spec)) {
            throw new Error(
                `${clauseLabel(clauseKey, spec)} does not declare design.scope "assembly" — compose it on an order, not at the assembly level`,
            );
        }
    }
    // Re-label each design-time (synthetic) order id to a clean local label
    // naming the future agreement. The assembly carries no chain ids and no
    // party addresses.
    const idToLocal = new Map(orders.map((o, i) => [o.orderHash, `agreement-${i}`]));
    // Assembly-scoped clauses keep the same value-free rule as agreements:
    // only design.fills values survive into the assembly.
    const assemblySelection: Record<Hex, Record<string, unknown>> = {};
    for (const [clauseKey, values] of Object.entries(assemblyClauses ?? {}) as [Hex, Record<string, unknown>][]) {
        assemblySelection[clauseKey] = designFillValues(specs.get(clauseKey), values);
    }
    const agreements: Record<Hex, RegisteredAgreement> = {};
    const entries: AssemblyAgreement[] = orders.map((order, i) => {
        const id = `agreement-${i}`;
        const parents = (order.follows ?? []).map((p) => idToLocal.get(p) ?? p);
        const bound = registeredByOrderId?.[order.orderHash];
        if (bound) {
            if (Object.keys(clausesByOrderId[order.orderHash] ?? {}).length > 0) {
                throw new Error(`${id} binds a registered agreement and also composes clauses — choose one`);
            }
            const agreementHash = agreementHashOf(bound);
            assertNotReservedKey(agreementHash, `${id} agreementHash`);
            return { id, agreementHash, clauses: {}, follows: parents };
        }
        // The one composition rule (`composeOrderAgreement`): the designer's
        // clause SELECTION, value-free but for design fills.
        const { composed: registeredAgreement, agreementHash } = composeOrderAgreement({
            clauses: clausesByOrderId[order.orderHash] ?? {},
            specs,
        });
        agreements[agreementHash] = registeredAgreement;
        return { id, agreementHash, clauses: {}, follows: parents };
    });
    return {
        assembly: {
            ...(name ? { name } : {}),
            ...(summary ? { summary } : {}),
            ...(description ? { description } : {}),
            ...(Object.keys(assemblySelection).length > 0 ? { assemblyClauses: assemblySelection } : {}),
            agreements: entries,
        },
        agreements,
    };
}

/**
 * An authored agreement (`agreements/<name>.json`): the clauses a
 * designer composes into it, written by clause NAME with the
 * designer's fills, beside the designer's own words. Seed time only.
 */
export interface AuthoredAgreement {
    name?: string;
    summary?: string;
    description?: string;
    clauses: Record<string, Record<string, unknown>>;
}

/**
 * Compose an AUTHORED agreement (`agreements/*.json`, clause names) into the
 * registered agreement it names: the names resolved to keys
 * (`resolveAuthoredClauseKeys`), then the one composition rule
 * (`composeOrderAgreement`: the scope check, the value-free rule, at least
 * one clause). Returns the document the
 * seeding pins — the designer's words beside the composed clauses — and its
 * key. Seed time only.
 */
export function composeAuthoredAgreement(
    authored: object,
    specs: SpecSource,
): { document: RegisteredAgreement; agreementHash: Hex } {
    const doc = resolveAuthoredClauseKeys(authored, specs) as Partial<AuthoredAgreement> & {
        clauses?: Record<Hex, Record<string, unknown>>;
    };
    if (!doc.clauses || typeof doc.clauses !== "object" || Array.isArray(doc.clauses)) {
        throw new Error("the authored agreement has no clauses");
    }
    for (const [clauseKey, fills] of Object.entries(doc.clauses)) {
        if (fills === null || typeof fills !== "object" || Array.isArray(fills)) {
            throw new Error(`clause ${clauseKey}: the designer's fills are not an object — write {} for a clause only selected`);
        }
    }
    const { composed, agreementHash } = composeOrderAgreement({ clauses: doc.clauses, specs });
    const document: RegisteredAgreement = {
        ...(doc.name !== undefined ? { name: doc.name } : {}),
        ...(doc.summary !== undefined ? { summary: doc.summary } : {}),
        ...(doc.description !== undefined ? { description: doc.description } : {}),
        clauses: composed.clauses,
    };
    return { document, agreementHash };
}

/**
 * Compose a SET of authored agreements, by name (`agreements/*.json`, each
 * file's basename), each through `composeAuthoredAgreement`. Returns each
 * one's document and key, by name. Seed time only.
 */
export function composeAuthoredAgreements(
    authoredByName: Readonly<Record<string, object>>,
    specs: SpecSource,
): Record<string, { document: RegisteredAgreement; agreementHash: Hex }> {
    return Object.fromEntries(Object.entries(authoredByName).map(([name, doc]) => [name, composeAuthoredAgreement(doc, specs)]));
}

/**
 * Build an AUTHORED assembly (`assemblies/*.json`) over authored agreements:
 * each agreement names the agreement it binds (`agreements[].agreement`,
 * the authored agreement's name) and carries its own topology as
 * `follows` (`agreement-<j>` labels); `assemblyClauses` are written by
 * clause name. The entry binds the named agreement's hash — the same key
 * whether a designer registers that agreement on its own or this seeding
 * registers it — and carries the written `follows` (`[]` when absent). Returns the assembly and each DISTINCT agreement once, keyed.
 * Seed time only.
 */
export function assembleAuthored(
    authored: object,
    agreementsByName: Readonly<Record<string, RegisteredAgreement>>,
    specs: SpecSource,
): BuiltAssembly {
    const doc = resolveAuthoredClauseKeys(authored, specs) as {
        name?: string;
        summary?: string;
        description?: string;
        faq?: Assembly["faq"];
        assemblyClauses?: Record<Hex, Record<string, unknown>>;
        agreements?: { id?: string; agreement?: string; follows?: string[]; clauses?: unknown }[];
    };
    if (!Array.isArray(doc.agreements) || doc.agreements.length === 0) {
        throw new Error("the authored assembly has no agreements");
    }
    const agreements: Record<Hex, RegisteredAgreement> = {};
    const entries: AssemblyAgreement[] = doc.agreements.map((entry, i) => {
        const id = entry.id ?? `agreement-${i}`;
        if (typeof entry.agreement !== "string" || entry.agreement.length === 0) {
            throw new Error(`${id} names no agreement — write the authored agreement's name as "agreement"`);
        }
        if (entry.clauses !== undefined) {
            throw new Error(`${id} writes clauses inline — compose them as an authored agreement and name it`);
        }
        const bound = agreementsByName[entry.agreement];
        if (!bound) throw new Error(`${id} names agreement "${entry.agreement}", which is not among the authored agreements`);
        const agreementHash = agreementHashOf(bound);
        assertNotReservedKey(agreementHash, `${id} agreementHash`);
        const parents = Array.isArray(entry.follows) ? [...entry.follows] : [];
        agreements[agreementHash] = { clauses: bound.clauses };
        return { id, agreementHash, clauses: {}, follows: parents };
    });
    return {
        assembly: {
            ...(doc.name !== undefined ? { name: doc.name } : {}),
            ...(doc.summary !== undefined ? { summary: doc.summary } : {}),
            ...(doc.description !== undefined ? { description: doc.description } : {}),
            ...(doc.faq !== undefined ? { faq: doc.faq } : {}),
            ...(doc.assemblyClauses !== undefined ? { assemblyClauses: doc.assemblyClauses } : {}),
            agreements: entries,
        },
        agreements,
    };
}

/**
 * Fill the deployment's denomination into a built assembly. A reference
 * assembly is written once and anchored on every chain, but the token it is
 * denominated in exists only on a deployed chain (the devnet's deployment,
 * Sepolia's ruled token), so the written file leaves the pin unfilled and the
 * seeding fills it before anchoring: the anchored `assemblyHash` is over the
 * filled assembly, never the written one. Unfilled, the pin is what the format
 * reads it as, a required field missing, so the written file signs nothing as
 * it stands. Read by the spec's shape, never by a clause or field name: every
 * ASSEMBLY-SCOPED clause of the denomination article (`block.design.article:
 * "denomination"`) has each designer-filled `address-hex` field the file left
 * unfilled set to `tokenAddress`. A field already filled is never overwritten;
 * an assembly with no such field is returned as it was. Seed time only.
 */
export function fillDeployTimeCurrency<T extends { assemblyClauses?: Record<string, Record<string, unknown>> }>(
    assembly: T,
    tokenAddress: Address,
    specs: SpecSource,
): T {
    if (!isAddressHex(tokenAddress) || /^0x0{40}$/.test(tokenAddress)) {
        throw new Error(`the deployment's token is not an address: ${String(tokenAddress)}`);
    }
    const entries = assembly.assemblyClauses ?? {};
    let filledAny = false;
    const filled = Object.fromEntries(Object.entries(entries).map(([clauseKey, values]) => {
        const spec = specs.get(clauseKey as Hex);
        if (!spec || !specIsAssemblyScoped(spec) || spec.hints?.article !== "denomination") return [clauseKey, values];
        const next: Record<string, unknown> = { ...(values ?? {}) };
        for (const field of spec.fields) {
            if (field.type !== "string" || field.format !== "address-hex") continue;
            if (!specDeclaresDesignFill(spec, field.name)) continue;
            const current = next[field.name];
            if (current !== undefined && current !== null && current !== "") continue;
            next[field.name] = tokenAddress;
            filledAny = true;
        }
        return [clauseKey, next];
    }));
    return filledAny ? { ...assembly, assemblyClauses: filled } : assembly;
}

export function serializeAssembly(assembly: Assembly): {
    json: string;
    assemblyHash: `0x${string}`;
} {
    // The pinned document carries everything — INCLUDING the editorial
    // name/summary/description. But the assembly hash (→ slug + on-chain
    // anchor) derives from the COMPOSITION ONLY, so editorial edits never
    // fork identity: identical compositions collapse to one binding regardless
    // of their prose.
    const json = canonicalize(assembly);
    const assemblyHash = assemblyHashOf(assembly);
    return { json, assemblyHash };
}
