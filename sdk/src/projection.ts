/**
 * projection.ts — from composed clauses to the canonical Agreement, and from
 * a design's orders to the assembly. The deterministic projection
 * rules BOTH parties (and any second frontend) must reproduce byte-exactly,
 * because their outputs are hashed: `checkoutHash` (the merkle root the
 * commitment signs) and `processDesignHash` (assembly identity).
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
 * the data a party signs: `design.article` (`"denomination"`: the deploy-time
 * currency fill),
 * `design.scope` (`"assembly"`: composed once for the whole design and folded
 * into every agreement at checkout), `design.fills` (the fields whose values
 * the DESIGNER composes into the assembly; every other clause's assembly
 * values are `{}` and its fields fill at checkout), and the `checkout` fills
 * (`catalogueFills` / `profileFills` / `catalogueMeasures` — which fields the
 * catalog and member-profile folds write). `parseProjectionHints` extracts
 * exactly those from a raw spec document; everything else in `block` is
 * presentation the SDK never reads. Whether a clause signs the empty anchor
 * `{}` is protocol, declared at the spec's top level (`emptyAnchor`), never
 * read from its article. No fingerprint function reads `block`:
 * `computeClauseKey` leaves it out, and `agreementHashOf`, `processDesignHashOf`
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
    processDesignHashOf,
    agreementClauses,
    processDesignFollows,
    deriveProcessDesignSlug,
    type ProcessDesign,
    type RegisteredAgreement,
    type ProcessDesignAgreement,
    type HydratedProcessDesign,
} from "./assembly.js";
import { fieldCarriesPrivate, fieldSetRuleErrors, validateSignedContent, type ClauseSpec, type FieldSpec } from "./clauses/index.js";
import { generateSalt } from "./commitments.js";
import { isAddressHex, isBytes32Hex, type Address, type Commitment, type Hex } from "./types.js";

// ── The spec seam ───────────────────────────────────────────────────────────

/** The slice of a clause spec's `block` the reference tooling collects the
 *  data by — the phase-section attributes that steer which values it
 *  writes into the assembly and the checkout folds, and which fields its
 *  quantity sources read, lifted out of the sectioned block. Another frontend may collect the data differently; no
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
    /** The spec's `block.checkout.pricedLines` — the field that carries the
     *  order's priced lines and the role of each of its items' fields
     *  (`PricedLinesMark`). */
    pricedLines?: PricedLinesMark;
    /** The spec's `block.checkout.derives` — for each content field (by
     *  name) it lists, the rule the checkout computes it by and that rule's
     *  inputs (`CheckoutDerivation`). */
    derives?: Readonly<Record<string, CheckoutDerivation>>;
    /** The spec's `block.checkout.timeWindow` — which content field is the
     *  start of the clause's time window and which is its end
     *  (`TimeWindowMark`). */
    timeWindow?: TimeWindowMark;
    /** The spec's `block.checkout.endpoints` — which content field is the
     *  route's origin and which is its destination (`EndpointsMark`). */
    endpoints?: EndpointsMark;
    /** The spec's `block.checkout.dataSources` — the content field that
     *  names the processes whose data the clause grants access to
     *  (`specDataSources`). */
    dataSources?: string;
}

/** The mark a spec puts on its TIME WINDOW (`block.checkout.timeWindow`):
 *  the content field that holds the window's start and the one that holds
 *  its end, by the spec's own field names. A quantity source that bills by
 *  the window reads this mark, never the format or the order of the fields. */
export interface TimeWindowMark {
    start: string;
    end: string;
}

/** The mark a spec puts on its ROUTE's two endpoints
 *  (`block.checkout.endpoints`): the content field that holds the origin and
 *  the one that holds the destination, by the spec's own field names. A
 *  quantity source that bills by distance reads this mark, never the format
 *  or the order of the fields. */
export interface EndpointsMark {
    from: string;
    to: string;
}

/** The mark a spec puts on its PRICED LINES (`block.checkout.pricedLines`):
 *  the top-level array field that holds the order's lines, and which field
 *  of each line item plays each role. `quantity` (an `integer` field) and
 *  `unitPrice` (a `bigint` field, in the token's smallest unit) are
 *  required; `item` (the catalog item's id) and `name` (its name, both
 *  `string` fields) are optional, and a line carries only the roles the mark
 *  names. The field names are the spec's own: code reads the mark, never a
 *  field name (`specPricedLines`). */
export interface PricedLinesMark {
    field: string;
    quantity: string;
    unitPrice: string;
    item?: string;
    name?: string;
}

/** One input of a checkout derivation: a content field of the same clause,
 *  read after the catalog and profile folds (`{ field }`), or a measure read
 *  from the order's catalog items (`CatalogueMeasure`). */
export type DerivationInput = { field: string } | CatalogueMeasure;

/** A content field the checkout computes (`block.checkout.derives`): the
 *  rule, by its name in the open derivation registry
 *  (`registerCheckoutDerivation`), and the rule's inputs by the rule's own
 *  input names. */
export interface CheckoutDerivation {
    rule: string;
    inputs: Readonly<Record<string, DerivationInput>>;
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
        const priced = parsePricedLinesMark(c.pricedLines);
        if (priced) hints.pricedLines = priced;
        const derives = parseCheckoutDerivations(c.derives);
        if (derives) hints.derives = derives;
        const timeWindow = parseTimeWindowMark(c.timeWindow);
        if (timeWindow) hints.timeWindow = timeWindow;
        const endpoints = parseEndpointsMark(c.endpoints);
        if (endpoints) hints.endpoints = endpoints;
        const dataSources = nonEmptyString(c.dataSources);
        if (dataSources) hints.dataSources = dataSources;
    }
    return hints;
}

/** A `block.checkout.timeWindow` mark, or undefined when it is absent or
 *  malformed: `start` and `end` are non-empty strings. Whether the named
 *  fields exist, with the format the window needs, is the quantity source's
 *  check against the spec's own fields. */
export function parseTimeWindowMark(raw: unknown): TimeWindowMark | undefined {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
    const start = nonEmptyString((raw as Record<string, unknown>).start);
    const end = nonEmptyString((raw as Record<string, unknown>).end);
    return start && end ? { start, end } : undefined;
}

/** A `block.checkout.endpoints` mark, or undefined when it is absent or
 *  malformed: `from` and `to` are non-empty strings. Whether the named
 *  fields exist, with the format a distance needs, is the quantity source's
 *  check against the spec's own fields. */
export function parseEndpointsMark(raw: unknown): EndpointsMark | undefined {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
    const from = nonEmptyString((raw as Record<string, unknown>).from);
    const to = nonEmptyString((raw as Record<string, unknown>).to);
    return from && to ? { from, to } : undefined;
}

/** A non-empty string, or undefined. */
function nonEmptyString(raw: unknown): string | undefined {
    return typeof raw === "string" && raw.length > 0 ? raw : undefined;
}

/** A `block.checkout.pricedLines` mark, or undefined when it is absent or
 *  malformed: `field`, `quantity` and `unitPrice` are non-empty strings, and
 *  `item` and `name`, when present, are too. Whether the named fields exist,
 *  with the types their roles need, is `specPricedLines`'s check against the
 *  spec's own fields. */
export function parsePricedLinesMark(raw: unknown): PricedLinesMark | undefined {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
    const r = raw as Record<string, unknown>;
    const field = nonEmptyString(r.field);
    const quantity = nonEmptyString(r.quantity);
    const unitPrice = nonEmptyString(r.unitPrice);
    if (!field || !quantity || !unitPrice) return undefined;
    if (r.item !== undefined && !nonEmptyString(r.item)) return undefined;
    if (r.name !== undefined && !nonEmptyString(r.name)) return undefined;
    return {
        field, quantity, unitPrice,
        ...(r.item !== undefined && { item: r.item as string }),
        ...(r.name !== undefined && { name: r.name as string }),
    };
}

/** The well-formed entries of a `block.checkout.derives` map, or undefined
 *  when none is. An entry names its `rule` and an `inputs` map whose every
 *  input is `{ field }` or a catalog measure (`{ from, combine }`); an entry
 *  with any malformed input is skipped whole, as an absent attribute is. */
export function parseCheckoutDerivations(raw: unknown): Readonly<Record<string, CheckoutDerivation>> | undefined {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
    const out: Record<string, CheckoutDerivation> = {};
    for (const [field, entry] of Object.entries(raw as Record<string, unknown>)) {
        if (field.length === 0 || !entry || typeof entry !== "object" || Array.isArray(entry)) continue;
        const { rule, inputs } = entry as Record<string, unknown>;
        if (!nonEmptyString(rule) || !inputs || typeof inputs !== "object" || Array.isArray(inputs)) continue;
        const parsed: Record<string, DerivationInput> = {};
        let ok = true;
        for (const [name, input] of Object.entries(inputs as Record<string, unknown>)) {
            const one = parseDerivationInput(input);
            if (name.length === 0 || !one) { ok = false; break; }
            parsed[name] = one;
        }
        if (ok) out[field] = { rule: rule as string, inputs: parsed };
    }
    return Object.keys(out).length > 0 ? out : undefined;
}

/** One derivation input: `{ field }` alone, or a well-formed catalog measure. */
function parseDerivationInput(raw: unknown): DerivationInput | undefined {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
    const r = raw as Record<string, unknown>;
    if (r.field !== undefined) {
        const field = nonEmptyString(r.field);
        return field && r.from === undefined && r.combine === undefined ? { field } : undefined;
    }
    const from = nonEmptyString(r.from);
    if (!from || (r.combine !== "sum" && r.combine !== "single-unit")) return undefined;
    return { from, combine: r.combine };
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

/** Whether the spec lists `fieldName` in `block.design.fills`: the designer
 *  authors its value into the assembly. The list says who fills the field
 *  and nothing of what it means; a reader that needs a role reads the mark
 *  for that role (the denomination pin reads the article and the scope
 *  beside the list, `specDenominationPinField`). */
export function specDeclaresDesignFill(spec: ProjectionSpecView, fieldName: string): boolean {
    return specDesignFills(spec).includes(fieldName);
}

/** Whether a clause spec declares ANY field as `private`-disposition, at any
 *  depth (`fieldCarriesPrivate`: a private field nested in an object or an
 *  array counts). A clause
 *  committing such a clause carries paid-edge plaintext that must never reach a
 *  public surface. Because the merkle leaf model withholds a WHOLE clause (never
 *  one field), a clause is treated as private if ANY of its fields is — the
 *  conservative direction (protect the private value; over-redact co-located
 *  public fields). Off-chain validation refuses to register a clause that mixes
 *  dispositions, so in practice this only ever fires on a fully-private clause. */
export function specHasPrivateField(spec: ProjectionSpecView): boolean {
    return spec.fields.some(fieldCarriesPrivate);
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

/** True for process-log clauses (`block.design.article: "attestations"`):
 *  the runtime ladders a reference interface presents as a lifecycle. The
 *  article is presentation; what such a clause signs is read from its
 *  top-level `emptyAnchor`, never from this. */
export function specIsProcessLog(spec: ProjectionSpecView): boolean {
    return spec.hints?.article === "attestations";
}

/** True for ASSEMBLY-SCOPED clauses (`block.design.scope: "assembly"`) —
 *  terms of the composition itself (a denomination pin, a dispute forum),
 *  composed ONCE for the whole design and folded into EVERY agreement at
 *  checkout so every party signs them. Every other clause is agreement-scoped:
 *  a term of one relationship, composed per-order. */
export function specIsProcessScoped(spec: ProjectionSpecView): boolean {
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

/** The PRICED-LINES mark of a clause (`block.checkout.pricedLines`), when
 *  the spec's own fields bear it out: the marked field is a top-level array
 *  whose items are objects declaring the role fields, `quantity` as an
 *  `integer`, `unitPrice` as a `bigint`, and `item` and `name`, when marked,
 *  as `string` fields. A mark the fields contradict marks nothing, so no
 *  reader writes or reads lines the spec does not declare. Undefined for a
 *  clause with no mark. */
export function specPricedLines(spec: ProjectionSpecView): PricedLinesMark | undefined {
    const mark = spec.hints?.pricedLines;
    if (!mark) return undefined;
    const list = spec.fields.find((f) => f.name === mark.field);
    if (!list || list.type !== "array" || list.items.type !== "object") return undefined;
    const itemFields = list.items.fields;
    const has = (name: string | undefined, type: FieldSpec["type"]) =>
        name === undefined || itemFields.some((f) => f.name === name && f.type === type);
    if (!has(mark.quantity, "integer") || !has(mark.unitPrice, "bigint")) return undefined;
    if (!has(mark.item, "string") || !has(mark.name, "string")) return undefined;
    return mark;
}

/** The top-level fields a mark names, in the mark's order, when the spec
 *  declares each of them and no name appears twice; undefined when the
 *  spec's own fields contradict the mark. Each mark's reader then checks the
 *  types its role needs. It reads no field name of its own. */
export function specMarkedFields(spec: { readonly fields: readonly FieldSpec[] }, names: readonly string[]): FieldSpec[] | undefined {
    if (new Set(names).size !== names.length) return undefined;
    const found: FieldSpec[] = [];
    for (const name of names) {
        const field = spec.fields.find((f) => f.name === name);
        if (!field) return undefined;
        found.push(field);
    }
    return found;
}

/** The ROUTE mark of a clause (`block.checkout.endpoints`), when the spec's
 *  own fields bear it out: the origin and the destination are two distinct
 *  declared `string` fields. Undefined for a clause with no mark, or one
 *  its fields contradict. A reader that needs a standard for the values
 *  (the distance source's geohash) checks it over the committed values. */
export function specEndpoints(spec: ProjectionSpecView): EndpointsMark | undefined {
    const mark = spec.hints?.endpoints;
    if (!mark) return undefined;
    const fields = specMarkedFields(spec, [mark.from, mark.to]);
    return fields?.every((f) => f.type === "string") ? mark : undefined;
}

/** The DATA-SOURCES mark of a clause (`block.checkout.dataSources`): the
 *  content field that names the processes whose data the clause grants
 *  access to, when the spec declares it as an array of `bytes32-hex`
 *  strings (process ids). Undefined for a clause with no mark, or one its
 *  fields contradict. A buyer reads each named process's resolution before
 *  it signs, and a reader proves each disclosed leaf against those
 *  processes' `checkoutHash` (`readDataSources`). */
export function specDataSources(spec: ProjectionSpecView): string | undefined {
    const mark = spec.hints?.dataSources;
    if (!mark) return undefined;
    const [field] = specMarkedFields(spec, [mark]) ?? [];
    return field?.type === "array" && field.items.type === "string" && field.items.format === "bytes32-hex"
        ? mark
        : undefined;
}

/** The process ids each clause names through its data-sources mark
 *  (`specDataSources`), one entry per clause that carries the mark. A clause
 *  whose spec is not loaded, carries no mark, or whose marked value is not
 *  an array contributes nothing; a value that is not a `bytes32` hex string
 *  is skipped, never read as an id. */
export function readDataSources(
    clauseEntries: readonly { clause: Hex; data?: Record<string, unknown> }[],
    specs: SpecSource,
): { clause: Hex; sources: Hex[] }[] {
    return clauseEntries.flatMap(({ clause, data }) => {
        const spec = specs.get(clause);
        const field = spec ? specDataSources(spec) : undefined;
        const raw = field ? data?.[field] : undefined;
        if (!Array.isArray(raw)) return [];
        return [{ clause, sources: raw.filter((v): v is Hex => typeof v === "string" && isBytes32Hex(v)) }];
    });
}

/** The DERIVED fields of a clause (`block.checkout.derives`): each declared
 *  content field the checkout computes, with its rule and inputs. A key the
 *  spec does not declare as a field is left out, and so is an entry whose
 *  input `{ field }` names no declared field. Empty for clauses that declare
 *  none. */
export function specCheckoutDerivations(spec: ProjectionSpecView): Readonly<Record<string, CheckoutDerivation>> {
    const declared = new Set(spec.fields.map((f) => f.name));
    return Object.fromEntries(
        Object.entries(spec.hints?.derives ?? {}).filter(([field, derivation]) =>
            declared.has(field)
            && Object.values(derivation.inputs).every((input) => !("field" in input) || declared.has(input.field))),
    );
}

/** The field of a clause that pins the COMPOSITION's denomination, or
 *  undefined. It reads three of the spec's hints (`spec.hints`, lifted from
 *  the `block` by `parseProjectionHints`): the scope is `"assembly"`
 *  (`block.design.scope`), the article is `"denomination"`
 *  (`block.design.article`), and exactly one of the fields listed in
 *  `block.design.fills` is a top-level `string` field of format
 *  `address-hex`. That field is the pin. It reads no field name and no clause
 *  id, so a stranger's clause filed under the denomination article pins
 *  under any field name.
 *
 *  The `block` is presentation and outside the clause key, so whoever serves
 *  the `block` decides whether a clause pins: a view with no hints, or one
 *  filed under another article, pins nothing. The sign gate's token check
 *  (`validateCommitmentAgreement`) and the reference seeding
 *  (`fillDeployTimeCurrency`) are the reference tooling's own, steered by it;
 *  the chain holds a process to the one token its commitments sign. */
export function specDenominationPinField(spec: ProjectionSpecView): string | undefined {
    if (!specIsProcessScoped(spec) || spec.hints?.article !== "denomination") return undefined;
    const pins = spec.fields.filter((f) =>
        f.type === "string" && f.format === "address-hex" && specDeclaresDesignFill(spec, f.name));
    return pins.length === 1 ? pins[0]!.name : undefined;
}

/** An off-chain validation WARNING (never an error: the parser reads no
 *  `block`, and another frontend collects the data its own way) for the one
 *  construction that contradicts itself: a clause that signs the empty
 *  anchor (`emptyAnchor`) and also asks the reference tooling to pin content
 *  at DESIGN or CHECKOUT time (`design.fills` / `checkout.catalogueFills` /
 *  `checkout.profileFills` / `checkout.catalogueMeasures` /
 *  `checkout.derives`).
 *
 *  Such a clause's content arrives in LATER attestations, never in the
 *  agreement: the parties sign `{}`, and `validateCommitmentAgreement`
 *  refuses any other content for it. A fill declared on it turns that anchor
 *  into content, so the order is refused at the sign gate. The article plays
 *  no part: `emptyAnchor` alone is not warned (it is what a process-log
 *  clause declares, `figaro-merchant-process` and `figaro-courier-process`
 *  among them, with no fill list), and a fill list on a clause that signs
 *  content is the normal pattern (`figaro-utility-token`,
 *  `figaro-dimweight`, …). */
export function warnProcessLogFillsTrap(spec: ProjectionSpecView): readonly string[] {
    if (spec.emptyAnchor !== true) return [];
    const warnings: string[] = [];
    if (specDesignFills(spec).length > 0) {
        warnings.push(
            `${spec.clauseId}: the spec signs the empty anchor (emptyAnchor: its content arrives in later ` +
            `attestations, never in the agreement) but also declares block.design.fills. The pinned fields turn ` +
            `the signed {} into content, which validateCommitmentAgreement refuses for this clause. If this ` +
            `clause's content should be signed, drop emptyAnchor; otherwise drop the fill list.`,
        );
    }
    if (specCatalogFills(spec).length > 0 || specProfileFills(spec).length > 0
        || Object.keys(specCatalogueMeasures(spec)).length > 0
        || Object.keys(specCheckoutDerivations(spec)).length > 0) {
        warnings.push(
            `${spec.clauseId}: the spec signs the empty anchor (emptyAnchor: its content arrives in later ` +
            `attestations, never in the agreement) but also declares block.checkout.catalogueFills, profileFills, ` +
            `catalogueMeasures or derives. That checkout-filled content turns the signed {} into content, which ` +
            `validateCommitmentAgreement refuses for this clause. If this clause's content should be signed, drop ` +
            `emptyAnchor; otherwise drop the checkout fills.`,
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
 *  defaults (registry-sourced, never code-sourced). A clause that signs the
 *  empty anchor (`emptyAnchor`) stays untouched. The agreement is built from
 *  these values, and checkout pricing reads them, so a price is derived from
 *  what is signed. */
export function withSpecDefaults(
    specs: SpecSource,
    clauseKey: Hex,
    data: Record<string, unknown>,
): Record<string, unknown> {
    const spec = specs.get(clauseKey);
    if (!spec || spec.emptyAnchor === true) return data;
    let out = data;
    for (const field of spec.fields ?? []) {
        if (field.default !== undefined && out[field.name] === undefined) {
            if (out === data) out = { ...data };
            out[field.name] = field.default;
        }
    }
    return out;
}

/** A fresh blinding value: 32 bytes from Web Crypto, as `bytes32-hex`.
 *  `generateSalt` is the one entropy source underneath, and it throws where
 *  Web Crypto is absent, so a guessable value is never returned. */
export function freshBlindingHex(): Hex {
    return `0x${generateSalt().toString(16).padStart(64, "0")}`;
}

/** Fill the blinding field of one set of fields (a clause's top-level
 *  `fields`, or one `stages[N]`) with a fresh value (`freshBlindingHex`),
 *  kept apart by where a value came from, never by the value itself.
 *
 *  Without `own`, every value of `values` is the filling party's own (a
 *  witness it collects, a set it builds from nothing): a value present is
 *  kept, and an absent one is drawn.
 *
 *  With `own`, `values` was folded from other sources too (a design's clause
 *  data, a catalog, a profile), and `own` is the filling party's own data for
 *  this set: the value `own` carries is kept, and any other is replaced by a
 *  fresh draw, so a value a design, a catalog or a profile published never
 *  stands in for the party's draw.
 *
 *  A set that declares no blinding field gains nothing. The code that
 *  collects a party's data calls it once, before the data is hashed; a
 *  builder and a hash function never do, so every rebuild of the same data
 *  reproduces the same fingerprint. */
export function withFreshBlinding(
    fields: readonly FieldSpec[],
    values: Record<string, unknown>,
    own?: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
    let out = values;
    for (const field of fields) {
        if (field.blinding !== true) continue;
        const kept = own === undefined ? out[field.name] : own[field.name];
        if (kept !== undefined && out[field.name] === kept) continue;
        if (out === values) out = { ...values };
        out[field.name] = kept ?? freshBlindingHex();
    }
    return out;
}

/** `withFreshBlinding` over one clause's committed set, read from the
 *  clause's spec by its key, as `withSpecDefaults` reads it. `own` is the
 *  filling party's own data for the clause, as `withFreshBlinding` reads it.
 *  A clause whose spec is not loaded is left as it is (the sign gate refuses
 *  it), and so is a clause that signs the empty anchor (`emptyAnchor`): its
 *  `{}` stays empty, and the sign gate refuses any other content for it. */
export function withClauseBlinding(
    specs: SpecSource,
    clauseKey: Hex,
    data: Record<string, unknown>,
    own?: Readonly<Record<string, unknown>>,
): Record<string, unknown> {
    const spec = specs.get(clauseKey);
    if (!spec || spec.emptyAnchor === true) return data;
    return withFreshBlinding(spec.fields, data, own);
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

/** The clause carrying the COMPOSITION's denomination pin, and its pin
 *  field: the first carried clause whose spec declares one
 *  (`specDenominationPinField`). */
function denominationPin(
    agreement: Agreement,
    specs: SpecSource,
): { clauseEntry: AgreementClause; field: string } | undefined {
    for (const clauseEntry of agreement.clauses) {
        const spec = specs.get(clauseEntry.clause);
        const field = spec ? specDenominationPinField(spec) : undefined;
        if (field) return { clauseEntry, field };
    }
    return undefined;
}

/** One order the design gives a registered agreement: its clause bag, and
 *  the clause keys (lowercased) an order instantiating it must carry. */
interface DesignOrderBag {
    clauses: Record<string, Record<string, unknown>>;
    required: string[];
    /** The number of entries the design's entry follows: the number of
     *  orders its order's topology leaf names, one order hash for each. */
    edges: number;
}

/** The clause bags a design gives the order an agreement instantiates: one
 *  per assembly agreement binding the registered agreement the provenance
 *  names — the assembly-scoped clauses with that agreement's clauses (its
 *  registered agreement's, its own fills over them) beside them, as the
 *  assembly walk builds every order's bag (`planProcessOrders`), and the
 *  number of entries that entry follows. */
function designClauseBags(
    design: HydratedProcessDesign,
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
            return { clauses, required: [...required], edges: processDesignFollows(entry).length };
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
    design: HydratedProcessDesign | null,
): CommitmentAgreementIssue[] {
    const provenance = agreement.provenance;
    // A provenance that is not two 32-byte keys does not encode: the merkle
    // check reports it.
    if (provenance !== undefined && !(isBytes32Hex(provenance.agreementHash) && isBytes32Hex(provenance.processDesignHash))) return [];
    if (design == null) {
        return provenance === undefined ? [] : [{
            clause: "(provenance)",
            path: "processDesignHash",
            message: `the agreement instantiates assembly ${provenance.processDesignHash}, which was not read, so its designer values cannot be checked`,
        }];
    }
    if (provenance === undefined) {
        return [{ clause: "(provenance)", path: "processDesignHash", message: `the agreement names no design, so its designer values cannot be checked` }];
    }
    let processDesignHash: Hex;
    try {
        processDesignHash = processDesignHashOf(design.assembly);
    } catch (cause) {
        return [{ clause: "(provenance)", path: "processDesignHash", message: `the design does not hash: ${cause instanceof Error ? cause.message : String(cause)}` }];
    }
    if (processDesignHash.toLowerCase() !== provenance.processDesignHash.toLowerCase()) {
        return [{
            clause: "(provenance)",
            path: "processDesignHash",
            message: `the agreement instantiates assembly ${provenance.processDesignHash}; the design read is ${processDesignHash}`,
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
            message: `assembly ${provenance.processDesignHash} binds no registered agreement ${provenance.agreementHash}`,
        }];
    }
    // The order matches one of the design's orders for that registered
    // agreement — every clause carried, no clause beyond them, every designer
    // value unchanged, and as many orders followed as that entry follows
    // entries; report against the first when it matches none. The edges are
    // held by number only: an order hash depends on its order's parties,
    // payment and salt, which no design carries, so which orders the edges
    // name is the signer's own reading of the process.
    // Carried is a check on KEYS alone: a withheld clause (`dataHash`), a
    // clause whose spec is not loaded and a value-free clause (a process-log
    // clause's empty anchor) each count, so an order never names a design it
    // does not carry. The converse is a check on keys too: a clause the
    // design does not compose — under any key, registered or not, with
    // content or withheld — is a term the signer never selected, so it is
    // refused whatever it carries.
    const carried = new Set(agreement.clauses.map((s) => s.clause.toLowerCase()));
    const named = `assembly ${deriveProcessDesignSlug(provenance.processDesignHash)} (${provenance.processDesignHash})`;
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
        // An absent or malformed topology leaf is the topology check's to
        // report (`topologyIssues`).
        if (Array.isArray(agreement.follows) && agreement.follows.length !== bag.edges) {
            found.push({
                clause: "(topology)",
                path: "follows",
                message: `the order follows ${agreement.follows.length} order(s); the design gives this entry of ${named} ${bag.edges}`,
            });
        }
        if (found.length === 0) return [];
        first ??= found;
    }
    return first ?? [];
}

/** Every blinding value a design's clause data carries, by clause key
 *  (lowercased) and field: the assembly's own clause data, each entry's
 *  fills and each registered agreement's clauses. A design is public and the
 *  same in every order, so any such value blinds nothing. A clause whose spec
 *  is not loaded is passed over (the agreement's own check refuses it). */
function designBlindingValues(design: HydratedProcessDesign, specs: SpecSource): Map<string, Map<string, unknown>> {
    const found = new Map<string, Map<string, unknown>>();
    const scan = (bag: Readonly<Record<string, Record<string, unknown>>> | undefined) => {
        for (const [clauseKey, data] of Object.entries(bag ?? {})) {
            const spec = specs.get(clauseKey as Hex);
            if (!spec || data === null || typeof data !== "object") continue;
            for (const field of spec.fields) {
                if (field.blinding !== true || data[field.name] === undefined) continue;
                const key = clauseKey.toLowerCase();
                if (!found.has(key)) found.set(key, new Map());
                found.get(key)!.set(field.name, data[field.name]);
            }
        }
    };
    scan(design.assembly.assemblyClauses);
    for (const entry of design.assembly.agreements) scan(entry.clauses);
    for (const registered of Object.values(design.agreements ?? {})) scan(registered?.clauses);
    return found;
}

/** The design's blinding values, refused: one issue per value the design's
 *  clause data carries for a blinding field, and one more where the
 *  agreement carries that very value. A design published by anyone could
 *  carry one, and the party's own draw must stand there instead. */
function designBlindingIssues(
    agreement: Agreement,
    specs: SpecSource,
    design: HydratedProcessDesign,
): CommitmentAgreementIssue[] {
    const issues: CommitmentAgreementIssue[] = [];
    const designed = designBlindingValues(design, specs);
    for (const [clause, fields] of designed) {
        for (const [field, value] of fields) {
            issues.push({
                clause,
                path: field,
                message: `the design's clause data carries a value for the blinding field (${canonicalize(value ?? null)}); a design is public and the same in every order, so the value blinds nothing — do not sign under a design that carries one`,
            });
            const entry = agreement.clauses.find((c) => c.clause.toLowerCase() === clause);
            if (entry?.data === undefined || canonicalize(entry.data[field] ?? null) !== canonicalize(value ?? null)) continue;
            issues.push({
                clause,
                path: field,
                message: "the agreement's blinding value equals the value the design carries, which is public; the party that fills the private set draws its own (withFreshBlinding)",
            });
        }
    }
    return issues;
}

/** The topology check: an agreement built from a design (it names one in its
 *  provenance leaf) carries its topology leaf, an empty list for a root, and
 *  any topology an agreement carries is well formed — a list of 32-byte
 *  order hashes, none named twice (`topologyLeafBytes`). A commitment that
 *  opens a process (`processId` zero) follows no order: the orders a leaf
 *  names are orders of the process the order joins, and an order that opens
 *  one has none before it. The number of edges against the design's entry
 *  is the design check's (`designIssues`); which orders the edges name is the
 *  counter-signer's own read (`followedOrderIssues`). */
function topologyIssues(agreement: Agreement, commitment: Commitment): CommitmentAgreementIssue[] {
    if (agreement.follows === undefined) {
        return agreement.provenance === undefined ? [] : [{
            clause: "(topology)",
            path: "follows",
            message: "the agreement instantiates a design but carries no topology leaf — write the orders it follows, [] for the root",
        }];
    }
    try {
        topologyLeafBytes(agreement.follows);
    } catch (cause) {
        return [{ clause: "(topology)", path: "follows", message: cause instanceof Error ? cause.message : String(cause) }];
    }
    if (isZeroProcessId(commitment.processId) && agreement.follows.length > 0) {
        return [{
            clause: "(topology)",
            path: "follows",
            message: `the commitment opens a process (processId zero), and an order that opens a process follows no order; this one names ${agreement.follows.length}`,
        }];
    }
    return [];
}

/** Whether a commitment's `processId` is zero: the commitment opens a process. */
function isZeroProcessId(processId: Hex): boolean {
    return /^0x0{64}$/i.test(processId);
}

/** The counter-signer's own read of one order an agreement's topology leaf
 *  names: the process the chain records it in (`OrderCommitted.processId`),
 *  and its agreement, checked by the reader against the order's committed
 *  `checkoutHash` (null when the reader could not read or check it). An
 *  order the chain does not record is no read at all: the caller leaves it
 *  out. */
export interface FollowedOrderRead {
    orderHash: Hex;
    processId: Hex;
    agreement: Agreement | null;
}

/**
 * The counter-signer's check of the orders an agreement follows against the
 * process design it names, over the counter-signer's own reads (`followed`).
 * The pure sign gate holds the topology leaf's form and its number of edges
 * (`validateCommitmentAgreement`); this check needs the chain, so it sits
 * with the party that reads it, before that party signs: the seller at
 * accept, once the orders before its own are committed.
 *
 * An order instantiates a design entry of the registered agreement its
 * provenance names that follows as many entries as its leaf names orders.
 * For that entry, each order the leaf names, in the entry's order: is
 * recorded on the chain (a read in `followed`), in the process the
 * commitment joins (`processId`), and its agreement, read and checked, names
 * the same assembly and the registered agreement of the entry the design
 * entry follows at that place. The first entry every edge matches passes;
 * when none does, the first entry's issues are returned. An agreement with
 * no provenance or no topology leaf, a design not in hand, and an agreement
 * no entry matches by count are the sign gate's to refuse, and return no
 * issue here.
 */
export function followedOrderIssues(
    agreement: Agreement,
    commitment: Commitment,
    design: HydratedProcessDesign | null,
    followed: readonly FollowedOrderRead[],
): CommitmentAgreementIssue[] {
    const provenance = agreement.provenance;
    const follows = agreement.follows;
    if (!provenance || !Array.isArray(follows) || design == null) return [];
    const entries = design.assembly.agreements;
    const byId = new Map(entries.map((entry) => [entry.id, entry]));
    const candidates = entries.filter((entry) =>
        entry.agreementHash.toLowerCase() === provenance.agreementHash.toLowerCase()
        && processDesignFollows(entry).length === follows.length);
    let first: CommitmentAgreementIssue[] | undefined;
    for (const entry of candidates) {
        const found: CommitmentAgreementIssue[] = [];
        processDesignFollows(entry).forEach((parentId, i) => {
            const edge = follows[i]!;
            const issue = (message: string) => found.push({ clause: "(topology)", path: `follows.${i}`, message });
            const read = followed.find((r) => r.orderHash.toLowerCase() === edge.toLowerCase());
            if (!read) return issue(`the order follows ${edge}, which the chain records as no committed order`);
            if (read.processId.toLowerCase() !== commitment.processId.toLowerCase()) {
                return issue(`the order follows ${edge}, committed in process ${read.processId}; this commitment joins process ${commitment.processId}`);
            }
            const parentAgreement = read.agreement;
            if (!parentAgreement?.provenance) {
                return issue(`the order follows ${edge}, whose agreement was not read, so its place in the design cannot be checked`);
            }
            if (parentAgreement.provenance.processDesignHash.toLowerCase() !== provenance.processDesignHash.toLowerCase()) {
                return issue(`the order follows ${edge}, which instantiates assembly ${parentAgreement.provenance.processDesignHash}; this order instantiates ${provenance.processDesignHash}`);
            }
            const parentEntry = byId.get(parentId);
            if (!parentEntry || parentEntry.agreementHash.toLowerCase() !== parentAgreement.provenance.agreementHash.toLowerCase()) {
                return issue(`the order follows ${edge}, which instantiates registered agreement ${parentAgreement.provenance.agreementHash}; the design's entry follows ${parentId} at this place, which binds ${parentEntry?.agreementHash ?? "no registered agreement"}`);
            }
        });
        if (found.length === 0) return [];
        first ??= found;
    }
    return first ?? [];
}

/** The private set's rules (`fieldSetRuleErrors`, the parser's own),
 *  re-checked over the spec view in hand, its committed set and each stage:
 *  a view built without `parseClauseSpec` may hold a private set with no
 *  blinding field, which nothing would then draw. One issue per broken rule. */
function setRuleIssues(clause: string, spec: ProjectionSpecView): CommitmentAgreementIssue[] {
    const errors = [
        ...fieldSetRuleErrors(spec.fields, "$.fields"),
        ...Object.entries(spec.stages ?? {}).flatMap(([stage, fields]) => fieldSetRuleErrors(fields, `$.stages.${stage}`)),
    ];
    return errors.map((e) => ({
        clause,
        path: e.path,
        message: `the clause's spec breaks the private set's rules: ${e.message}; do not sign this clause — use a spec that parses (parseClauseSpec)`,
    }));
}

/** The blinding fields of a clause's committed set that its `block` names in a
 *  list another actor fills: a designer's, catalog's or profile's value is
 *  public and the same in every order, so it blinds nothing. One issue per
 *  field and list. */
function namedBlindingIssues(clause: string, spec: ProjectionSpecView): CommitmentAgreementIssue[] {
    const lists: [string, readonly string[]][] = [
        ["block.design.fills", specDesignFills(spec)],
        ["block.checkout.catalogueFills", specCatalogFills(spec)],
        ["block.checkout.profileFills", specProfileFills(spec)],
        ["block.checkout.catalogueMeasures", Object.keys(specCatalogueMeasures(spec))],
        ["block.checkout.derives", Object.keys(specCheckoutDerivations(spec))],
    ];
    const issues: CommitmentAgreementIssue[] = [];
    for (const field of spec.fields) {
        if (field.blinding !== true) continue;
        for (const [list, names] of lists) {
            if (!names.includes(field.name)) continue;
            issues.push({
                clause,
                path: field.name,
                message: `the clause's spec names its blinding field in ${list}, so the value is public and the same in every order; do not sign this clause — use a spec whose blinding field the party that fills the private set draws`,
            });
        }
    }
    return issues;
}

/** Whether a `bytes32-hex` blinding value is zero, which blinds nothing. */
export function isZeroBlindingValue(value: string): boolean {
    return /^0x0{64}$/i.test(value);
}

/** The blinding values of a clause's committed data that blind nothing: a
 *  zero value, and a value another clause of the same agreement carries (one
 *  guess would then confirm both). `seen` collects the values met so far in
 *  the agreement. A value that is not 32 bytes of hex is `validateContent`'s
 *  to report. */
function blindingValueIssues(
    clause: string,
    data: Record<string, unknown>,
    spec: ProjectionSpecView,
    seen: Map<string, string>,
): CommitmentAgreementIssue[] {
    const issues: CommitmentAgreementIssue[] = [];
    for (const field of spec.fields) {
        if (field.blinding !== true) continue;
        const value = data[field.name];
        if (!isBytes32Hex(value)) continue;
        const key = value.toLowerCase();
        if (isZeroBlindingValue(key)) {
            issues.push({
                clause,
                path: field.name,
                message: "the blinding value is zero, which blinds nothing; draw a fresh 32-byte value (withFreshBlinding) before signing",
            });
            continue;
        }
        const other = seen.get(key);
        if (other !== undefined) {
            issues.push({
                clause,
                path: field.name,
                message: `the clause carries the same blinding value as clause ${other} of this agreement; draw a fresh value for each clause (withFreshBlinding) before signing`,
            });
            continue;
        }
        seen.set(key, clause);
    }
    return issues;
}

/**
 * The off-chain layer of the verification stack, run on BOTH sides of the bilateral commit
 * (buyer before initiating, seller before counter-signing) so neither party
 * signs an invalid agreement. Four checks: every present clause conforms to
 * its clause spec (validateSignedContent: a clause whose spec declares
 * `emptyAnchor` signs the empty anchor `{}` and nothing else, and every other
 * clause's content, `{}` included, is validated over its fields); where a denomination pin is composed, the pin equals the token of
 * the commitment about to be signed; the order carries every clause of the
 * design its provenance names (the registered agreement's and the
 * assembly-scoped ones) and every designer value (`block.design.fills`) the
 * design sets arrives unchanged — `design` is the hydrated assembly the
 * agreement's provenance names, `null` when none was read, and an agreement
 * naming a design then fails (a buyer or a seller never drops a designed
 * clause or changes a designer's value); and the `checkoutHash` about to be
 * signed equals the merkle root recomputed from the clauses. The agreement's
 * topology leaf is well formed, and present wherever a design is named
 * (`topologyIssues`), it names no order when the commitment opens a process
 * (`processId` zero), and it names as many orders as the matching design
 * entry follows entries (`designIssues`); which orders it names needs the
 * chain, so it is the counter-signer's own check (`followedOrderIssues`),
 * never this gate's. Each clause's spec keeps the private set's rules
 * (`fieldSetRuleErrors`, re-checked on the view in hand). A private clause's
 * blinding value blinds: no design the agreement names carries one, its spec
 * names the blinding field in no list another actor fills
 * (`block.design.fills`, `block.checkout.catalogueFills`, `profileFills`,
 * `catalogueMeasures`), the value is not zero, and no two clauses of the
 * agreement share one. Catches a
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
    design: HydratedProcessDesign | null,
): { ok: boolean; issues: CommitmentAgreementIssue[] } {
    const issues: CommitmentAgreementIssue[] = [];
    // Each blinding value met so far in this agreement, lowercased → its clause.
    const blindingSeen = new Map<string, string>();

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
        issues.push(...setRuleIssues(clauseEntry.clause, spec));
        issues.push(...namedBlindingIssues(clauseEntry.clause, spec));
        // The signed content: `{}` and nothing else for a clause whose spec
        // declares `emptyAnchor` (its content is attested later), and content
        // valid over `fields` for every other clause, `{}` included
        // (`validateSignedContent`). The rule reads the spec's top level,
        // never its article: `block` is presentation.
        const result = validateSignedContent(clauseEntry.data, spec);
        if (!result.ok) {
            for (const e of result.errors) {
                issues.push({ clause: clauseEntry.clause, path: e.path, message: e.message });
            }
        }
        // The empty anchor carries no blinding value to check.
        if (spec.emptyAnchor === true) continue;
        issues.push(...blindingValueIssues(clauseEntry.clause, clauseEntry.data, spec, blindingSeen));
    }

    // The denomination pin (when composed) == the commitment's token. A
    // missing or malformed pin is already reported above (the field is
    // required by its spec), so only a pin that IS present is compared.
    const pinned = denominationPin(agreement, specs);
    const pin = pinned ? addressLeaf(pinned.clauseEntry, pinned.field) : undefined;
    if (pinned && pin && pin.toLowerCase() !== commitment.token.toLowerCase()) {
        issues.push({
            clause: pinned.clauseEntry.clause,
            path: pinned.field,
            message: `this assembly is denominated by design (${pin}); the commitment currency ${commitment.token} contradicts the pinned term`,
        });
    }

    issues.push(...designIssues(agreement, specs, design));
    if (design != null) issues.push(...designBlindingIssues(agreement, specs, design));
    issues.push(...topologyIssues(agreement, commitment));

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
    design: HydratedProcessDesign | null,
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

// ── Assembly building (design-time projection) ─────────────────────────────

/** The DAG slice of a design-time order the assembly build reads:
 *  its (synthetic) hash and its parent edges. */
export interface ProcessOrderNode {
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

/** Only the values a clause's `design.fills` declares survive into a assembly,
 *  and never a blinding value
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
    // A blinding value is never a design's: it is public there and the same
    // in every order, so it is dropped even where a spec names it a fill.
    const blinding = new Set(spec!.fields.filter((f) => f.blinding === true).map((f) => f.name));
    return Object.fromEntries(Object.entries(values).filter(([field]) => fills.includes(field) && !blinding.has(field)));
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
export interface BuiltProcessDesign {
    assembly: ProcessDesign;
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
 *  for an agreement. `buildProcessDesign` composes every new agreement through
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
        if (specIsProcessScoped(spec)) {
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
export function buildProcessDesign(args: {
    name?: string;
    summary?: string;
    description?: string;
    orders: readonly ProcessOrderNode[];
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
}): BuiltProcessDesign {
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
            if (specIsProcessScoped(spec)) {
                throw new Error(
                    `${clauseLabel(clauseKey, spec)} declares design.scope "assembly" — compose it once at the assembly level, not on an order`,
                );
            }
        }
    }
    for (const clauseKey of Object.keys(assemblyClauses ?? {}) as Hex[]) {
        const spec = composedSpec(clauseKey, "at the assembly level");
        if (!specIsProcessScoped(spec)) {
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
    const entries: ProcessDesignAgreement[] = orders.map((order, i) => {
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
export function composeAuthoredProcessDesign(
    authored: object,
    agreementsByName: Readonly<Record<string, RegisteredAgreement>>,
    specs: SpecSource,
): BuiltProcessDesign {
    const doc = resolveAuthoredClauseKeys(authored, specs) as {
        name?: string;
        summary?: string;
        description?: string;
        faq?: ProcessDesign["faq"];
        assemblyClauses?: Record<Hex, Record<string, unknown>>;
        agreements?: { id?: string; agreement?: string; follows?: string[]; clauses?: unknown }[];
    };
    if (!Array.isArray(doc.agreements) || doc.agreements.length === 0) {
        throw new Error("the authored assembly has no agreements");
    }
    const agreements: Record<Hex, RegisteredAgreement> = {};
    const entries: ProcessDesignAgreement[] = doc.agreements.map((entry, i) => {
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
 * seeding fills it before anchoring: the anchored `processDesignHash` is over the
 * filled assembly, never the written one. Unfilled, the pin is what the format
 * reads it as, a required field missing, so the written file signs nothing as
 * it stands. Read by the spec's shape, never by a clause or field name: every
 * clause whose spec declares a denomination pin (`specDenominationPinField`:
 * assembly-scoped, of the denomination article, with exactly one
 * designer-filled `address-hex` field) has that field, when the file left it
 * unfilled, set to `tokenAddress`. A field already filled is never overwritten;
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
        const field = spec ? specDenominationPinField(spec) : undefined;
        if (!field) return [clauseKey, values];
        const current = values?.[field];
        if (current !== undefined && current !== null && current !== "") return [clauseKey, values];
        filledAny = true;
        return [clauseKey, { ...(values ?? {}), [field]: tokenAddress }];
    }));
    return filledAny ? { ...assembly, assemblyClauses: filled } : assembly;
}

/**
 * The token a WRITTEN reference assembly's unfilled denomination pin is filled
 * with at seeding (`fillDeployTimeCurrency`). A written file may name, beside
 * the pin, the deployment's own address the designer pins:
 * `"deployTimeCurrency": { "deployment": "florinToken" }` pins the
 * deployment's `FlorinToken`, read from `deployment`, the deployment's
 * addresses keyed as `deployments/<chainId>.json` keys them. A file that names
 * none takes `deploymentToken`, the deployment's token for every other pinned
 * reference. Read from the written file, never the built assembly:
 * `composeAuthoredProcessDesign` drops the key, so the name enters no hash;
 * only the address it resolves to does, through the pin. Throws when the named
 * address is not an address of the deployment, or when the file names none
 * and no deployment token was given. Seed time only.
 */
export function deployTimeCurrencyOf(
    written: object,
    deployment: Readonly<Record<string, unknown>>,
    deploymentToken: Address | undefined,
): Address {
    const named = (written as { deployTimeCurrency?: { deployment?: unknown } }).deployTimeCurrency;
    if (named !== undefined) {
        const entry = named?.deployment;
        if (typeof entry !== "string" || entry.length === 0) {
            throw new Error(`deployTimeCurrency names no address of the deployment: ${JSON.stringify(named)}`);
        }
        const address = deployment[entry];
        if (typeof address !== "string" || !isAddressHex(address) || /^0x0{40}$/.test(address)) {
            throw new Error(`the deployment's "${entry}", which deployTimeCurrency names, is not an address: ${String(address)}`);
        }
        return address as Address;
    }
    if (deploymentToken === undefined || deploymentToken === null || deploymentToken === ("" as Address)) {
        throw new Error("not decided — no deployment token is named, and the file names no address of the deployment for its pin");
    }
    return deploymentToken;
}

export function serializeProcessDesign(assembly: ProcessDesign): {
    json: string;
    processDesignHash: `0x${string}`;
} {
    // The pinned document carries everything — INCLUDING the editorial
    // name/summary/description. But the assembly hash (→ slug + on-chain
    // anchor) derives from the COMPOSITION ONLY, so editorial edits never
    // fork identity: identical compositions collapse to one binding regardless
    // of their prose.
    const json = canonicalize(assembly);
    const processDesignHash = processDesignHashOf(assembly);
    return { json, processDesignHash };
}
