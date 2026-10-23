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
 * Five `block` hints are HASH-LOAD-BEARING and therefore projection
 * vocabulary, not presentation: `design.article: "mandatory"` (the DAO's
 * live commerce and topology the canvas writes into each agreement →
 * agreementHash),
 * `design.article: "attestations"` (process-log clauses stay empty anchors at
 * commit → checkoutHash), `design.scope: "assembly"` (composed once for the
 * whole design, folded into EVERY agreement at checkout → assemblyHash +
 * checkoutHash), `design.fills` (the fields whose values the
 * DESIGNER composes into the assembly — the tailoring; every other clause's
 * assembly values are `{}` and the fields fill at checkout →
 * assemblyHash), and the `checkout` fills (`catalogueFills` /
 * `profileFills` — which clauses the catalog and member-profile folds
 * write → checkoutHash). `parseProjectionHints` extracts exactly those from
 * a raw spec document; everything else in `block` remains presentation the
 * SDK never reads. (A field's `default` is the sixth thing that reaches a
 * hash without living in `block`: `withSpecDefaults` fills omitted fields
 * from the spec, so the default lands in the signed clause → checkoutHash.)
 */

import {
    canonicalize,
    computeCheckoutHash,
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
import { isAddressHex, isBytes32Hex, type Address, type Hex } from "./types.js";

// ── The spec seam ───────────────────────────────────────────────────────────

/** The hash-load-bearing slice of a clause spec's `block` — the few
 *  phase-section attributes whose values decide what ends up committed
 *  (assembly values, checkout folds), lifted out of the sectioned block. */
export interface ProjectionHints {
    /** The spec's `block.design.article` (e.g. `"mandatory"`, `"attestations"`). */
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
}

/** A clause spec as the projection sees it: the off-chain spec plus the
 *  hash-load-bearing hints. */
export type ProjectionSpecView = ClauseSpec & { clauseKey: Hex; hints?: ProjectionHints };

/**
 * The consumer's window onto its loaded clause specs (ClauseRegistry → IPFS).
 * A clause's identity is its KEY, `keccak256` of the spec's pinned bytes
 * (`computeClauseKey`), so `get` reads one registration by key and nothing
 * reads a clause by name; `list` returns every spec the source surfaces, each
 * carrying its key. A spec's `clauseId` and `version` are presentation.
 */
export interface SpecSource {
    get(clauseKey: Hex): ProjectionSpecView | undefined;
    list(): readonly ProjectionSpecView[];
}

/** Extract the hash-load-bearing hints from a raw spec document's `block`
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
    }
    return hints;
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
 *  order's denomination `currency` is plain content on the commerce clause
 *  (written at checkout, one term of one order), and a DESIGNER FILL on a
 *  denomination-pin clause (authored into the assembly, a term of the
 *  composition). Same field name, two different terms — so surfaces that mean
 *  one of them route on the declaration, never on a clause id. */
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
 *  public clauses (topology, commerce) does not occur. If warming fails, the
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

/** True for the MANDATORY clauses (`block.design.article: "mandatory"` —
 *  commerce, topology). An agreement is not an agreement without them, so a
 *  designer never selects one: the canvas writes the DAO's live mandatory
 *  clauses into every agreement it registers (`mandatoryClauses`), and the
 *  designer composes the rest. Never name this article "structural" — that
 *  word collides with the design/DAG sense.
 *
 *  The article is read from the spec's `block`, which whoever registered the
 *  clause wrote: it confers no protocol standing. A surface that shows a
 *  composition before it is anchored or signed lists every clause this
 *  marks (by key, labeled with the spec's own `clauseId`), never leaves
 *  them out. */
export function specIsMandatory(spec: ProjectionSpecView): boolean {
    return spec.hints?.article === "mandatory";
}

/** The SHAPE of commerce: a clause declaring `payment`, `currency` and
 *  `lineItems` as content — the fields checkout fills and the sign gate holds
 *  equal to the signed struct. Mandatory is a shape, never a name: any
 *  well-formed clause of this shape is commerce to every reader, and an
 *  agreement carries exactly one. */
export function specIsCommerceShape(spec: ProjectionSpecView): boolean {
    return ["payment", "currency", "lineItems"].every((f) => specDeclaresContentField(spec, f));
}

/** The SHAPE of topology: a clause declaring `follows` as content —
 *  the orders this order follows, the process's DAG. An agreement carries
 *  exactly one. */
export function specIsTopologyShape(spec: ProjectionSpecView): boolean {
    return specDeclaresContentField(spec, "follows");
}

/** The shape a mandatory-article spec has: commerce's, topology's, or (for a
 *  mandatory clause of another shape) the sorted names of the content fields
 *  it declares. Two mandatory specs of one shape are two versions of one
 *  clause to the canvas, whatever their names. */
function mandatoryShape(spec: ProjectionSpecView): string {
    if (specIsCommerceShape(spec)) return "commerce";
    if (specIsTopologyShape(spec)) return "topology";
    return spec.fields.map((f) => f.name).filter((f) => specDeclaresContentField(spec, f)).sort().join(",");
}

/** One `ClauseRegistered` row as the registry reports it: the key, the wallet
 *  that registered it, the block of the registration, and whether its stake
 *  was withdrawn since. */
export interface ClauseRegistrationRow {
    clauseKey: Hex;
    registeredBy: Hex;
    blockNumber: bigint | number;
    /** The event's index in its block: two registrations of one shape in one
     *  block are ordered by it, the later winning. */
    logIndex?: number;
    stakeWithdrawn: boolean;
}

/** The MANDATORY clauses this canvas writes into every agreement it
 *  registers: the clauses `registrant` (the DAO's wallet, a fact of the
 *  chain's deployment record) registered whose stake is live and whose spec
 *  declares the mandatory article at agreement scope — all of them, one per
 *  shape, the later registration winning where the DAO holds two live
 *  clauses of one shape (its own transition; never the version word). An
 *  agreement is not an agreement without commerce and topology, so the DAO
 *  develops them and earns wherever they are used; a mandatory-article
 *  registration by any other wallet is an ordinary clause and enters no
 *  agreement by this route. Empty when the registrant holds no live
 *  mandatory clause: the canvas then publishes nothing. */
export function mandatoryClauses(
    rows: readonly ClauseRegistrationRow[],
    specs: SpecSource,
    registrant: Hex,
): Record<Hex, Record<string, unknown>> {
    const byShape = new Map<string, { clauseKey: Hex; blockNumber: bigint; logIndex: number }>();
    for (const row of rows) {
        if (row.registeredBy.toLowerCase() !== registrant.toLowerCase() || row.stakeWithdrawn) continue;
        const spec = specs.get(row.clauseKey);
        if (!spec || !specIsMandatory(spec) || specIsAssemblyScoped(spec)) continue;
        const shape = mandatoryShape(spec);
        const block = BigInt(row.blockNumber);
        const logIndex = row.logIndex ?? 0;
        const prev = byShape.get(shape);
        // Later wins: by block, then by the event's index within the block —
        // the chain's own order, never the order the rows were read in.
        const later = !prev || block > prev.blockNumber || (block === prev.blockNumber && logIndex > prev.logIndex);
        if (later) byShape.set(shape, { clauseKey: row.clauseKey, blockNumber: block, logIndex });
    }
    const out: Record<Hex, Record<string, unknown>> = {};
    for (const { clauseKey } of byShape.values()) out[clauseKey] = {};
    return out;
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

/** An off-chain validation WARNING (never an error — the permissionless extension axiom:
 *  a third-party clause may declare ANY article) for the one construction
 *  that never makes sense under `article: "attestations"`: pinning content
 *  at DESIGN or CHECKOUT time (`design.fills` / `checkout.catalogueFills` /
 *  `checkout.profileFills`) on a clause the article marks a process-log
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
    if (specCatalogFills(spec).length > 0 || specProfileFills(spec).length > 0) {
        warnings.push(
            `${spec.clauseId}: block.design.article is "attestations" (a process-log clause — ` +
            `content arrives via later runtime attestations, never the initial agreement) but the ` +
            `spec also declares block.checkout.catalogueFills or profileFills. That checkout-authored ` +
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
 *  empty anchor at commit and stays untouched. */
function withSpecDefaults(
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

/** A bigint-valued leaf (stored as its canonical decimal string), or undefined
 *  when the clause carries none or the value is malformed — the malformed
 *  case is already an off-chain validation failure of its own. */
function bigintLeaf(clauseEntry: AgreementClause | undefined, field: string): bigint | undefined {
    const value = clauseEntry?.data?.[field];
    return typeof value === "string" && /^\d+$/.test(value) ? BigInt(value) : undefined;
}

/** The clause carrying the ORDER's denomination: the composed clause
 *  declaring `payment` and declaring `currency` as plain content. Spec-routed,
 *  naming no clause — a second commerce clause anyone registers participates
 *  identically, and a denomination pin (whose `currency` is a designer fill)
 *  is excluded by construction. */
function commerceCurrencyClause(
    agreement: Agreement,
    specs: SpecSource,
): AgreementClause | undefined {
    return agreement.clauses.find((s) => {
        const spec = specs.get(s.clause);
        return !!spec && specDeclaresField(spec, "payment") && specDeclaresContentField(spec, "currency");
    });
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

/**
 * The off-chain layer of the verification stack, run on BOTH sides of the bilateral commit
 * (buyer before initiating, seller before counter-signing) so neither party
 * signs an invalid agreement. Four checks: every present clause conforms to
 * its clause spec (validateContent; process-log clauses are presence-markers,
 * skipped); the denomination AND payment the parties are about to sign
 * as TERMS equal the ones they are about to sign as EXECUTION data
 * (leaf == struct for both mirrored fields, and where a denomination pin is
 * composed, pin == leaf); the order carries every clause of the design its
 * provenance names (the registered agreement's and the assembly-scoped ones)
 * and every designer value (`block.design.fills`) the design sets arrives
 * unchanged — `design` is the hydrated assembly the agreement's provenance
 * names, `null` when none was read, and an agreement naming a design then
 * fails (a buyer or a seller never drops a designed clause or changes a
 * designer's value); and the `checkoutHash` about to be signed equals
 * the merkle root recomputed from the clauses. Catches a malformed agreement
 * before a chain round-trip.
 *
 * `struct` is the commitment's mirrored pair — the struct side of the
 * leaf==struct assertion (a full `Commitment` satisfies it). Evidence and
 * execution are different layers, so the copy across them is the binding, and
 * asserting it is this gate's job (docs/CLAUSES.md § "Every clause is a
 * merkle leaf"). Object-shaped on purpose: a stale caller still passing the
 * bare currency string fails at compile, not silently.
 */
export interface CommitmentMirror {
    /** The commitment's `currency` field. */
    currency: `0x${string}`;
    /** The commitment's `payment` field. */
    payment: bigint;
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
    // agreement — every clause carried, every designer value unchanged;
    // report against the first when it matches none. Carried is a check on
    // KEYS alone: a withheld clause (`dataHash`), a clause whose spec is not
    // loaded and a value-free clause (a process-log clause's empty anchor)
    // each count, so an order never names a design it does not carry.
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
        found.push(...designerValueIssues(agreement, bag.clauses, specs));
        if (found.length === 0) return [];
        first ??= found;
    }
    return first ?? [];
}

export function validateCommitmentAgreement(
    agreement: Agreement,
    expectedHash: `0x${string}`,
    specs: SpecSource,
    struct: CommitmentMirror,
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
        const spec = specs.get(clauseEntry.clause);
        if (!spec) continue;
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

    // The denomination chain: pin (when composed) == commerce leaf ==
    // commitment struct. A missing or malformed leaf on a composed commerce
    // clause is already reported above (the field is required by its spec), so
    // there is nothing extra to say here — this compares the values that ARE
    // present, and each comparison is skipped when its clause isn't composed.
    const leafClause = commerceCurrencyClause(agreement, specs);
    const leaf = addressLeaf(leafClause, "currency");
    if (leafClause && leaf && leaf.toLowerCase() !== struct.currency.toLowerCase()) {
        issues.push({
            clause: leafClause.clause,
            path: "currency",
            message: `the signed term names ${leaf} as the denomination; the commitment currency ${struct.currency} contradicts it`,
        });
    }
    // The payment mirror, from the SAME clauseEntry: the commerce clause's
    // `payment` leaf is the term the commitment struct's `payment` mirrors
    // (both homes, by the same ruling as currency). Same posture — compare the
    // value that IS present; a missing/malformed leaf already failed its spec.
    const leafPayment = bigintLeaf(leafClause, "payment");
    if (leafClause && leafPayment !== undefined && leafPayment !== struct.payment) {
        issues.push({
            clause: leafClause.clause,
            path: "payment",
            message: `the signed term names ${leafPayment} as the payment; the commitment payment ${struct.payment} contradicts it`,
        });
    }
    const pinClause = currencyPinClause(agreement, specs);
    const pin = addressLeaf(pinClause, "currency");
    if (pinClause && pin) {
        // Against the leaf when a commerce clause is composed, else against
        // the struct directly — the chain is transitive, so the pin is
        // asserted either way.
        const against = leaf ?? struct.currency;
        const againstLabel = leaf ? "the order's committed currency" : "the commitment currency";
        if (pin.toLowerCase() !== against.toLowerCase()) {
            issues.push({
                clause: pinClause.clause,
                path: "currency",
                message: `this assembly is denominated by design (${pin}); ${againstLabel} ${against} contradicts the pinned term`,
            });
        }
    }

    issues.push(...designIssues(agreement, specs, design));

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
 * denomination or payment differs between the signed term and the
 * signed struct, whose designer values differ from the design it names, or
 * whose hash doesn't match its recomputed merkle root.
 *
 * `struct` is the mirrored pair of the commitment being signed (a full
 * `Commitment` satisfies it). `design` is the hydrated assembly the
 * agreement's provenance names, or `null` when the caller read none — which
 * refuses any agreement naming a design.
 */
export function assertAgreementSignable(
    agreement: Agreement,
    expectedHash: `0x${string}`,
    specs: SpecSource,
    struct: CommitmentMirror,
    design: HydratedAssembly | null,
    label = "This order",
): void {
    const check = validateCommitmentAgreement(agreement, expectedHash, specs, struct, design);
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

/** The agreement's own fills for a composed clause map — the design-time
 *  values the ASSEMBLY'S AGREEMENT carries rather than the registered agreement: each
 *  composed clause whose loaded spec declares `follows` (the
 *  topology, matched by declared field, never by clause id) gets
 *  `{ follows: parents }` (root = []). The registered agreement
 *  composes those clauses with `{}`, so one agreement sits in any agreement
 *  of any assembly. */
function agreementTopologyFills(
    clauses: Readonly<Record<Hex, Record<string, unknown>>>,
    parents: string[],
    specs: SpecSource,
): Record<Hex, Record<string, unknown>> {
    const out: Record<Hex, Record<string, unknown>> = {};
    for (const clauseKey of Object.keys(clauses) as Hex[]) {
        const spec = specs.get(clauseKey);
        if (spec && specDeclaresField(spec, "follows")) out[clauseKey] = { follows: [...parents] };
    }
    return out;
}

/** An agreement is not an agreement without commerce and topology: the
 *  composed clauses carry exactly one clause of commerce's shape and one of
 *  topology's, whatever their keys. Throws, naming `label`, on none or two of
 *  either. */
function assertMandatoryShapes(clauses: Readonly<Record<Hex, Record<string, unknown>>>, specs: SpecSource, label: string): void {
    const keys = Object.keys(clauses) as Hex[];
    for (const [shape, has] of [["commerce", specIsCommerceShape], ["topology", specIsTopologyShape]] as const) {
        const found = keys.filter((k) => { const spec = specs.get(k); return spec !== undefined && has(spec); });
        if (found.length === 0) {
            throw new Error(
                `${label}: no clause of ${shape}'s shape — an agreement is not an agreement without ${
                    shape === "commerce" ? "the payment, the token and what is bought" : "the orders it follows"
                }; the canvas writes the DAO's live ${shape} into every agreement`,
            );
        }
        if (found.length > 1) {
            throw new Error(
                `${label}: two clauses of ${shape}'s shape (${found.map((k) => clauseLabel(k, specs.get(k))).join(", ")}) — one per agreement`,
            );
        }
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

/** Compose ONE agreement's agreement from the mandatory clauses the canvas
 *  writes in and the clauses a designer selected: the scope check (an
 *  assembly-scoped clause never composes on an order; a composed key's spec
 *  must be loaded), the value-free rule (only `block.design.fills` values
 *  survive), and the shape rule (exactly one clause of commerce's shape and
 *  one of topology's; a clause both carry keeps the designer's composition).
 *  The result is the registered agreement's
 *  document and its key — what `AgreementRegistry` takes, whether the
 *  designer registers it on its own or an assembly's publish registers it
 *  for an agreement. `buildAssembly` composes every new agreement through
 *  this one function.
 *
 *  The mandatory clauses (`mandatory`, the DAO's live commerce and topology
 *  the canvas reads from the registry — `mandatoryClauses`) are written in
 *  first and the designer's selection over them; the result carries exactly
 *  one clause of commerce's shape and one of topology's, or it is refused
 *  (`assertMandatoryShapes`). An authored agreement names the two clauses
 *  itself and passes none. */
export function composeOrderAgreement(args: {
    /** clauseKey → the designer's composed values for this order. */
    clauses: Readonly<Record<Hex, Record<string, unknown>>>;
    /** The mandatory clauses the canvas writes into every agreement
     *  (`mandatoryClauses`): clauseKey → `{}`. Optional for an authored
     *  agreement that names them itself. */
    mandatory?: Readonly<Record<Hex, Record<string, unknown>>>;
    specs: SpecSource;
}): { composed: RegisteredAgreement; agreementHash: Hex } {
    const { clauses: composedClauses, mandatory, specs } = args;
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
    const selection: Record<Hex, Record<string, unknown>> = {};
    for (const [clauseKey, values] of Object.entries(composedClauses) as [Hex, Record<string, unknown>][]) {
        selection[clauseKey] = designFillValues(specs.get(clauseKey), values);
    }
    const defaults: Record<Hex, Record<string, unknown>> = {};
    for (const [clauseKey, values] of Object.entries(mandatory ?? {}) as [Hex, Record<string, unknown>][]) {
        const spec = specs.get(clauseKey);
        if (!spec) throw new Error(`mandatory clause ${clauseKey} is not loaded`);
        defaults[clauseKey] = designFillValues(spec, values);
    }
    const clauses: Record<Hex, Record<string, unknown>> = { ...defaults, ...selection };
    assertMandatoryShapes(clauses, specs, "the agreement");
    const composed: RegisteredAgreement = { clauses };
    return { composed, agreementHash: agreementHashOf(composed) };
}

/** Build the assembly from the design's orders. Each canvas order
 *  becomes one agreement binding a registered agreement: EITHER a
 *  registered agreement bound as is (`registeredByOrderId`), OR the clauses
 *  the designer composed for it (`clausesByOrderId`), which become a new
 *  agreement — value-free, with the mandatory clauses (`mandatory`, the
 *  DAO's live commerce and topology the canvas reads from the registry)
 *  written in first (composition time is the only place; checkout adds no
 *  clause). Every agreement carries one clause of commerce's shape and one
 *  of topology's, or the build is refused: an agreement is not an agreement
 *  without them. A bound registered agreement must carry both shapes
 *  itself, whatever their keys. The topology's parents are the agreement's
 *  own fill. */
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
    /** The mandatory clauses the canvas writes into every agreement it
     *  composes (`mandatoryClauses`): clauseKey → `{}`. */
    mandatory?: Readonly<Record<Hex, Record<string, unknown>>>;
    specs: SpecSource;
}): BuiltAssembly {
    const { name, summary, description, orders, clausesByOrderId, registeredByOrderId, assemblyClauses, mandatory, specs } = args;
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
            assertMandatoryShapes(bound.clauses, specs, `${id}: registered agreement ${agreementHash}`);
            return { id, agreementHash, clauses: agreementTopologyFills(bound.clauses, parents, specs) };
        }
        // The one composition rule (`composeOrderAgreement`): the mandatory
        // clauses written in first, the designer's clause SELECTION over them,
        // value-free but for design fills.
        const { composed: registeredAgreement, agreementHash } = composeOrderAgreement({
            clauses: clausesByOrderId[order.orderHash] ?? {},
            mandatory,
            specs,
        });
        const { clauses } = registeredAgreement;
        agreements[agreementHash] = registeredAgreement;
        return { id, agreementHash, clauses: agreementTopologyFills(clauses, parents, specs) };
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
 * designer selected for one agreement, written by clause NAME with the
 * designer's fills, beside the designer's own words. The two mandatory
 * clauses are named like any other: an authored agreement states what the
 * canvas would write in. Seed time only.
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
 * (`composeOrderAgreement`: the scope check, the value-free rule, one clause
 * of commerce's shape and one of topology's). Returns the document the
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
 * registers it — and its fill is the topology clause's parents
 * (`agreementTopologyFills`). A bound agreement must carry one clause of
 * commerce's shape and one of topology's (`assertMandatoryShapes`), or it is
 * refused. Returns the assembly and each DISTINCT agreement once, keyed.
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
        assertMandatoryShapes(bound.clauses, specs, `${id}: agreement "${entry.agreement}"`);
        const parents = Array.isArray(entry.follows) ? [...entry.follows] : [];
        agreements[agreementHash] = { clauses: bound.clauses };
        return { id, agreementHash, clauses: agreementTopologyFills(bound.clauses, parents, specs) };
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
