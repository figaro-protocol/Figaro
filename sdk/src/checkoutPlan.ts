/**
 * checkoutPlan.ts — the buyer-side checkout planning vocabulary: the
 * fill-where-composed clause writers, the sub-order seller plan (the
 * per-clause binding cursor), live contributor pricing, and the open
 * rate-quantity-source registry.
 *
 * Everything here shapes COMMITTED bytes (the agreement clauses the merkle
 * root hashes) or the payment figures the commitments sign, so a second
 * frontend must reproduce it exactly. No clause and no field is ever named:
 * clauses are found by what their specs declare in `block.checkout`
 * (`pricedLines`, `derives`, `catalogueFills`, `profileFills`,
 * `catalogueMeasures`) and `block.design` (the denomination pin), through the
 * caller's `SpecSource` — ANY registered clause declaring them participates,
 * including clauses this code has never seen. A fill whose clause isn't
 * composed is a no-op, so the same call serves the root and every sub-order.
 */

import { parseUnits } from "viem";
import { geohashCentroidDistanceKm } from "./derive/geo.js";
import { GEOHASH_FORMAT } from "./clauses/index.js";
import { ownValue } from "./clauses/spec.js";
import {
    specCatalogFills,
    specCatalogueMeasures,
    specCheckoutDerivations,
    specDenominationPinField,
    specPricedLines,
    specProfileFills,
    withSpecDefaults,
    type CatalogueMeasure,
    type PricedLinesMark,
    type ProjectionSpecView,
    type SpecSource,
} from "./projection.js";
import { agreementClauses, processDesignFollows, type HydratedProcessDesign, type ProcessDesignAgreement } from "./assembly.js";
import { planProcessOrders, type PlannedProcessOrder } from "./reconstructOrders.js";
import { isAddressHex, type Hex } from "./types.js";
import type { CoSellerBinding } from "./memberProfile.js";
import type { CatalogItemMetadata } from "./memberCatalog.js";

/** An order's clause fields — the same map the agreement commits. */
type ClauseFields = Record<string, Record<string, unknown>>;

export interface ProcessCheckoutLineItem {
    itemId: string;
    name: string;
    quantity: number;
    /** Decimal string, smallest unit (a priced-lines mark's `unitPrice` is a
     *  `bigint` field). */
    unitPrice: string;
    /** The catalog item this line sells, as the seller lists it. A composed
     *  clause's declared catalog measures (`block.checkout.catalogueMeasures`)
     *  read their `from` fields here (`fillCatalogueMeasures`). Absent for a
     *  line with no catalog item behind it: every measure is then missing. */
    catalogItem?: Readonly<Partial<CatalogItemMetadata>>;
    /** Catalog-sourced clause values (freight class / hazmat / cold-chain, …)
     *  folded onto their leaves. Keyed by clause key → field values. */
    clauseValues?: Record<string, Record<string, unknown>>;
}

/** The first composed clause whose LOADED spec satisfies `predicate` — each
 *  composed key reads its own spec (`specs.get(clauseKey)`). Undefined while
 *  the spec is unloaded — the fill degrades to a no-op, exactly as the
 *  registry-reading frontend does before its cache warms. The ONE lookup
 *  every spec-routed fill of this module runs. */
function composedClauseWhere(
    clauses: ClauseFields,
    specs: SpecSource,
    predicate: (spec: ProjectionSpecView) => boolean,
): Hex | undefined {
    return (Object.keys(clauses) as Hex[]).find((clauseKey) => {
        const spec = specs.get(clauseKey);
        return spec ? predicate(spec) : false;
    });
}

/** The first composed clause whose spec marks its priced lines
 *  (`specPricedLines`), with the mark. */
function composedPricedLines(
    clauses: ClauseFields,
    specs: SpecSource,
): { clauseKey: Hex; mark: PricedLinesMark } | undefined {
    const clauseKey = composedClauseWhere(clauses, specs, (spec) => specPricedLines(spec) !== undefined);
    const mark = clauseKey ? specPricedLines(specs.get(clauseKey)!) : undefined;
    return clauseKey && mark ? { clauseKey, mark } : undefined;
}

/**
 * The RFQ's priced fields inside the clauses, DERIVED from an agreement by
 * the spec's mark — the unit price of each committed line of every carried
 * clause whose spec marks its priced lines (`block.checkout.pricedLines`,
 * read through `specPricedLines`). The quoted figure itself is the
 * commitment's payment, which the quote always moves; these are only the
 * copies of it a clause carries. Empty when no carried clause marks priced
 * lines or the spec cache is cold, and an empty list still quotes (the
 * commitment's payment alone moves).
 */
export function derivePricedFields(
    clauseEntries: readonly { clause: Hex; data?: Record<string, unknown> }[],
    specs: SpecSource,
): { clause: Hex; path: string }[] {
    // Commercial terms are PUBLIC (never a content-withheld clause), so a
    // clause carrying only a fingerprint contributes no priced field.
    return clauseEntries.flatMap(({ clause, data }) => {
        const spec = specs.get(clause);
        const mark = spec ? specPricedLines(spec) : undefined;
        const lines = mark ? data?.[mark.field] : undefined;
        if (!mark || !Array.isArray(lines)) return [];
        return lines.map((_, i) => ({ clause, path: `${mark.field}.${i}.${mark.unitPrice}` }));
    });
}

/**
 * Write the order's lines into the first composed clause whose spec marks
 * its priced lines (`block.checkout.pricedLines`), each line written in the
 * item shape the spec declares: the mark's `quantity` and `unitPrice`
 * fields, and its `item` and `name` fields when the mark names them — no
 * other key. Writes nothing when no composed clause marks priced lines, or
 * when no lines are given. The payment and the token are the commitment's
 * own fields and never enter a clause, and nothing holds the lines' sum
 * equal to the payment (`pricedLinesSum` reads it for a review).
 */
export function fillPricedLines(
    clauses: ClauseFields,
    specs: SpecSource,
    lineItems?: ProcessCheckoutLineItem[],
): ClauseFields {
    const target = composedPricedLines(clauses, specs);
    if (!target || !lineItems) return clauses;
    const { clauseKey, mark } = target;
    return {
        ...clauses,
        [clauseKey]: {
            ...clauses[clauseKey],
            [mark.field]: lineItems.map(({ itemId, name, quantity, unitPrice }) => ({
                ...(mark.item !== undefined && { [mark.item]: itemId }),
                ...(mark.name !== undefined && { [mark.name]: name }),
                [mark.quantity]: quantity,
                [mark.unitPrice]: unitPrice,
            })),
        },
    };
}

/** One committed priced line, read through its clause's mark. A role the
 *  mark does not name, or a value of the wrong shape, is undefined. */
export interface PricedLine {
    itemId?: string;
    name?: string;
    quantity?: bigint;
    unitPrice?: bigint;
}

/** An integer value as a bigint: a safe integer number, or a decimal string. */
function integerOf(value: unknown): bigint | undefined {
    if (typeof value === "number" && Number.isSafeInteger(value)) return BigInt(value);
    if (typeof value === "string" && /^-?\d+$/.test(value)) return BigInt(value);
    return undefined;
}

/**
 * The priced lines an agreement commits, read from every clause whose spec
 * marks them (`block.checkout.pricedLines`), never by a field name: one entry
 * per such clause carrying content, its lines in committed order. A clause
 * whose spec is not loaded, or whose content is withheld, yields none.
 */
export function readPricedLines(
    clauseEntries: readonly { clause: Hex; data?: Record<string, unknown> }[],
    specs: SpecSource,
): { clause: Hex; lines: PricedLine[] }[] {
    return clauseEntries.flatMap(({ clause, data }) => {
        const spec = specs.get(clause);
        const mark = spec ? specPricedLines(spec) : undefined;
        const raw = mark ? data?.[mark.field] : undefined;
        if (!mark || !Array.isArray(raw)) return [];
        const lines = raw.map((entry): PricedLine => {
            const line = entry && typeof entry === "object" ? entry as Record<string, unknown> : {};
            const text = (role: string | undefined) => role !== undefined && typeof line[role] === "string" ? line[role] as string : undefined;
            return {
                itemId: text(mark.item),
                name: text(mark.name),
                quantity: integerOf(line[mark.quantity]),
                unitPrice: integerOf(line[mark.unitPrice]),
            };
        });
        return [{ clause, lines }];
    });
}

/** The sum of the lines' quantity × unit price, in the token's smallest
 *  unit; undefined when any line's quantity or unit price cannot be read. A
 *  figure for a review to show beside the payment: no check holds the two
 *  equal, and the payment the commitment carries is what moves. */
export function pricedLinesSum(lines: readonly PricedLine[]): bigint | undefined {
    let sum = 0n;
    for (const line of lines) {
        if (line.quantity === undefined || line.unitPrice === undefined) return undefined;
        sum += line.quantity * line.unitPrice;
    }
    return sum;
}

/**
 * The designer's utility-token pin, read from an assembly's composed clauses:
 * the value of the first composed clause whose spec declares a denomination
 * pin (`specDenominationPinField`: assembly-scoped, of the denomination
 * article, with exactly one designer-filled `address-hex` field), when it is
 * a well-formed address. The spec's shape is the whole routing rule: ANY
 * clause declaring it pins, under any field name, including one this code
 * has never seen. The pin survives the value-free assembly build and is part
 * of the processDesignHash: the assembly's one-token tailoring.
 *
 * Undefined = unpinned (the buyer's payment-token pick, else the seller's
 * default, denominates) or spec cache cold.
 */
export function readUtilityTokenPin(
    clauses: ClauseFields,
    specs: SpecSource,
): `0x${string}` | undefined {
    const clauseKey = composedClauseWhere(clauses, specs, (spec) => specDenominationPinField(spec) !== undefined);
    const field = clauseKey ? specDenominationPinField(specs.get(clauseKey)!) : undefined;
    const value = clauseKey && field ? clauses[clauseKey]?.[field] : undefined;
    return isAddressHex(value) ? value : undefined;
}

/**
 * The fields of one clause the checkout walk fills MECHANICALLY, whatever
 * the buyer enters, read from the clause's spec: the field its priced-lines
 * mark names (`fillPricedLines`) and every field it derives
 * (`block.checkout.derives`, `fillCheckoutDerivations`). A fillable surface
 * subtracts these: rendering a buyer input the walk will overwrite is a
 * false affordance, not a fill. Empty for an unloaded spec. The instantiated
 * assembly's hash and the orders an order follows are no field here: they
 * are the agreement format's provenance and topology leaves
 * (`Agreement.provenance`, `Agreement.follows`), which the assembly walk
 * writes, never a clause.
 */
export function mechanicallyFilledFieldNames(spec: ProjectionSpecView | undefined): Set<string> {
    if (!spec) return new Set();
    const priced = specPricedLines(spec);
    return new Set([
        ...(priced ? [priced.field] : []),
        ...Object.keys(specCheckoutDerivations(spec)),
    ]);
}

/** One catalog measure as a number: the line's catalog-item field, when it
 *  is a finite, non-negative number. Anything else is a missing measure. */
function lineMeasure(line: ProcessCheckoutLineItem, from: string): number | undefined {
    const value = (line.catalogItem as Record<string, unknown> | undefined)?.[from];
    return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : undefined;
}

/** The value a declared measure takes over the order's lines, or undefined
 *  when it is missing. `"sum"`: Σ item value × quantity, missing when any line
 *  lacks the item value (a partial sum would understate the order).
 *  `"single-unit"`: the item's value when the order is one unit (one line,
 *  quantity 1), missing otherwise. No line, no value: nothing is invented. */
function combineMeasure(lines: readonly ProcessCheckoutLineItem[], measure: CatalogueMeasure): number | undefined {
    if (lines.length === 0) return undefined;
    if (measure.combine === "single-unit") {
        return lines.length === 1 && lines[0].quantity === 1 ? lineMeasure(lines[0], measure.from) : undefined;
    }
    let sum = 0;
    for (const line of lines) {
        const value = lineMeasure(line, measure.from);
        if (value === undefined) return undefined;
        sum += value * line.quantity;
    }
    return sum;
}

/**
 * Fold the order's catalog measures onto every composed clause that
 * declares them (`block.checkout.catalogueMeasures`, read from the spec each
 * composed key names, never a clause id or a field name). Each declared
 * clause field is read from its declared catalog-item field (`from`) on each
 * line's `catalogItem` and combined as declared (`CatalogueMeasure`). A
 * measure the lines cannot supply stays MISSING: the field is not written,
 * and nothing invents a number for it — a required one is then named by
 * `missingCatalogueMeasures`, and the checkout refuses the order. A no-op for
 * a clause declaring no measure, so the same call serves the root and every
 * sub-order.
 */
export function fillCatalogueMeasures(
    clauses: ClauseFields,
    lines: readonly ProcessCheckoutLineItem[],
    specs: SpecSource,
): ClauseFields {
    let out = clauses;
    for (const clauseKey of Object.keys(clauses) as Hex[]) {
        const spec = specs.get(clauseKey);
        if (!spec) continue;
        const written: Record<string, number> = {};
        for (const [field, measure] of Object.entries(specCatalogueMeasures(spec))) {
            const value = combineMeasure(lines, measure);
            if (value !== undefined) written[field] = value;
        }
        if (Object.keys(written).length === 0) continue;
        out = { ...out, [clauseKey]: { ...out[clauseKey], ...written } };
    }
    return out;
}

/** A required catalog measure the order's lines could not supply: the
 *  clause, its field, and the catalog-item field it is read from. */
export interface MissingCatalogueMeasure {
    clauseKey: Hex;
    field: string;
    from: string;
}

/**
 * Every REQUIRED field a composed clause declares as a catalog measure that
 * is still empty after the fill — a measure no item supplied. The checkout
 * walk refuses an order with any, naming the measure instead of a spec path,
 * as it refuses a rate item whose quantity does not resolve (the sign gate's
 * validator would refuse the required field anyway). An optional measure is
 * never named: its absence is a valid committed state.
 */
export function missingCatalogueMeasures(
    clauses: ClauseFields,
    specs: SpecSource,
): MissingCatalogueMeasure[] {
    const missing: MissingCatalogueMeasure[] = [];
    for (const clauseKey of Object.keys(clauses) as Hex[]) {
        const spec = specs.get(clauseKey);
        if (!spec) continue;
        for (const [field, measure] of Object.entries(specCatalogueMeasures(spec))) {
            const declared = spec.fields.find((f) => f.name === field);
            const value = clauses[clauseKey]?.[field];
            if (declared?.required && (value === undefined || value === null || value === "")) {
                missing.push({ clauseKey, field, from: measure.from });
            }
        }
    }
    return missing;
}

/**
 * Fold the catalog-authored class values onto their leaves. For each
 * clause the order composes with catalog-authored fields (freight-class /
 * hazmat / cold-chain, …, discovered by `block.checkout.catalogueFills`, never
 * by name), write the first line's authored values — restricted to the spec's
 * DECLARED catalog-authored subset (`specCatalogFills`), the same
 * discipline as the profile fold — a homogeneous-order assumption (mixed
 * classes are a multi-ORDER concern per the aggregate model). Absent when no
 * line carries declared values for that clause. The declared subset is the
 * composed clause's own (its spec, read by its key).
 */
export function fillClassClauses(
    clauses: ClauseFields,
    lines: ProcessCheckoutLineItem[],
    specs: SpecSource,
): ClauseFields {
    let out = clauses;
    for (const clauseKey of Object.keys(clauses) as Hex[]) {
        const spec = specs.get(clauseKey);
        if (!spec || specCatalogFills(spec).length === 0) continue;
        const line = lines.find(
            (li) => li.clauseValues?.[clauseKey] && Object.keys(li.clauseValues[clauseKey]).length > 0,
        );
        if (!line) continue;
        const declared = specCatalogFills(spec);
        const authored = Object.fromEntries(
            Object.entries(line.clauseValues![clauseKey]).filter(([k, v]) => declared.includes(k) && v !== undefined && v !== ""),
        );
        if (Object.keys(authored).length === 0) continue;
        out = { ...out, [clauseKey]: mergeUnderAssembly(out[clauseKey], authored) };
    }
    return out;
}

/** Merge authored master data UNDER the assembly's committed values: a field
 *  the assembly already carries (a designer's `design.fills` pin) is a term and
 *  WINS; authored values fill the gaps. Empty-string/undefined assembly
 *  entries do not count as pins — they cannot shadow authored data. */
function mergeUnderAssembly(
    assembly: Record<string, unknown> | undefined,
    authored: Record<string, unknown>,
): Record<string, unknown> {
    const pins = Object.fromEntries(
        Object.entries(assembly ?? {}).filter(([, v]) => v !== undefined && v !== ""),
    );
    return { ...authored, ...pins };
}

/**
 * Fold the seller's PROFILE-authored clause values onto their leaves. For each
 * clause the order composes with profile-authored fields (dimweight's divisor,
 * a declared credential id, …, discovered by `block.checkout.profileFills`,
 * never by name), write the seller's stored values — restricted to the spec's
 * DECLARED profile-authored subset (`specProfileFills`), with the assembly's
 * committed terms winning over authored data. Absent when the seller stores no
 * values for that clause. The seller-level sibling of `fillClassClauses`
 * (catalog = what is sold, profile = who sells). The declared subset is the
 * composed clause's own (its spec, read by its key).
 */
export function fillProfileClauses(
    clauses: ClauseFields,
    profileValues: Readonly<Record<string, Record<string, unknown>>> | undefined,
    specs: SpecSource,
): ClauseFields {
    if (!profileValues) return clauses;
    let out = clauses;
    for (const clauseKey of Object.keys(clauses) as Hex[]) {
        const spec = specs.get(clauseKey);
        if (!spec) continue;
        const declared = specProfileFills(spec);
        if (declared.length === 0) continue;
        const stored = profileValues[clauseKey];
        if (!stored || Object.keys(stored).length === 0) continue;
        const authored = Object.fromEntries(
            Object.entries(stored).filter(([k, v]) => declared.includes(k) && v !== undefined && v !== ""),
        );
        if (Object.keys(authored).length === 0) continue;
        out = { ...out, [clauseKey]: mergeUnderAssembly(out[clauseKey], authored) };
    }
    return out;
}

// ── Checkout derivations: the open rule registry ───────────────────────────
//
// A clause declares the content fields the checkout COMPUTES in
// `block.checkout.derives`: for each field, the rule (`rule`, a name in the
// registry below) and the rule's inputs by the rule's own input names, each
// read from a field of the same clause (`{ field }`, after the catalog and
// profile folds) or from the order's catalog items (`{ from, combine }`, as a
// catalog measure combines). The KEY is a rule the spec names, never a sector,
// a clause id or a field name, the same open axis as the rate-quantity
// sources. A rule with no entry derives nothing: the field stays as it was.
//
// Tenants:
//  - "dimensional-weight": billed = max(gross mass, volumetric), volumetric =
//    packaged volume ÷ divisor, each packaged dimension rounded up to the next
//    whole centimeter first (carriers round per dimension). Inputs `mass`
//    (grams), `length`, `width`, `height` (millimeters) and `divisor`. Missing
//    when any input is missing or not positive: the greater of two weights is
//    unknown while one is, and with no divisor dimensional weight does not
//    apply.

/** The inputs a derivation rule reads, each a finite number or undefined
 *  when its declared source holds none. */
export type CheckoutDerivationInputs = Readonly<Record<string, number | undefined>>;

/** A derivation rule: the field's value from its inputs, or undefined when
 *  it cannot be derived (the field is then left as it was). */
export type CheckoutDerivationRule = (inputs: CheckoutDerivationInputs) => number | undefined;

function deriveDimensionalWeight(inputs: CheckoutDerivationInputs): number | undefined {
    const { mass, length, width, height, divisor } = inputs;
    if (![mass, length, width, height, divisor].every((v) => v !== undefined && v > 0)) return undefined;
    const roundCm = (mm: number) => Math.ceil(mm / 10) * 10;
    const volumeMm3 = roundCm(length!) * roundCm(width!) * roundCm(height!);
    return Math.max(mass!, Math.ceil(volumeMm3 / divisor!));
}

const DERIVATIONS = new Map<string, CheckoutDerivationRule>([
    ["dimensional-weight", deriveDimensionalWeight],
]);

/** Register a derivation rule under the name a spec's `block.checkout.derives`
 *  entry gives it. Last write wins — the registry's extension point: a rule
 *  a stranger's clause names lands here without touching checkout code.
 *  @public */
export function registerCheckoutDerivation(rule: string, derive: CheckoutDerivationRule): void {
    DERIVATIONS.set(rule, derive);
}

/** A number read from a committed value: a finite number or a decimal string. */
function finiteOf(value: unknown): number | undefined {
    const n = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
    return Number.isFinite(n) ? n : undefined;
}

/**
 * Compute every field a composed clause derives (`block.checkout.derives`,
 * read through `specCheckoutDerivations`), each by its declared rule over its
 * declared inputs: a field of the same clause, read from the values in hand,
 * or a catalog measure combined over the order's lines (`combineMeasure`). A
 * rule the registry does not hold, or one that cannot derive from the inputs,
 * leaves the field as it was. Reads no clause id and no field name, so a
 * stranger's clause deriving under other names derives as the reference one
 * does. A no-op for a clause that derives nothing.
 */
export function fillCheckoutDerivations(
    clauses: ClauseFields,
    lines: readonly ProcessCheckoutLineItem[],
    specs: SpecSource,
): ClauseFields {
    let out = clauses;
    for (const clauseKey of Object.keys(clauses) as Hex[]) {
        const spec = specs.get(clauseKey);
        if (!spec) continue;
        const written: Record<string, number> = {};
        for (const [field, derivation] of Object.entries(specCheckoutDerivations(spec))) {
            const rule = DERIVATIONS.get(derivation.rule);
            if (!rule) continue;
            const values = out[clauseKey] ?? {};
            const inputs = Object.fromEntries(Object.entries(derivation.inputs).map(([name, input]) =>
                [name, "field" in input ? finiteOf(values[input.field]) : combineMeasure(lines, input)]));
            const value = rule(inputs);
            if (value !== undefined && Number.isFinite(value)) written[field] = value;
        }
        if (Object.keys(written).length === 0) continue;
        out = { ...out, [clauseKey]: { ...out[clauseKey], ...written } };
    }
    return out;
}

/**
 * Fill every value the checkout folds onto an order's clauses, wherever
 * composed — the catalog measures each spec declares, the class leaves
 * (catalog-sourced), the profile leaves (seller master data), then the
 * derived fields (`fillCheckoutDerivations`, which read the values the folds
 * just wrote). Each fill is a no-op when its clause isn't composed, so the
 * same call serves the root and every sub-order.
 */
export function fillDerivedClauses(
    clauses: ClauseFields,
    lines: ProcessCheckoutLineItem[],
    specs: SpecSource,
    profileValues?: Readonly<Record<string, Record<string, unknown>>>,
): ClauseFields {
    return fillCheckoutDerivations(
        fillProfileClauses(
            fillClassClauses(
                fillCatalogueMeasures(clauses, lines, specs),
                lines,
                specs,
            ),
            profileValues,
            specs,
        ),
        lines,
        specs,
    );
}

// ── Contributor pricing context ─────────────────────────────────────────────

/** The pricing slice of a seller's catalog projection — the structural
 *  subset the checkout planning reads (any richer catalog projection passes
 *  structurally). */
export interface PricingCatalog {
    address: string;
    items: CatalogItemMetadata[];
    /** The seller's PROFILE-authored clause values (seller master data:
     *  dimweight's divisor, a declared credential id), keyed clause key →
     *  field → value. Folded onto composed profile-sourced leaves at
     *  checkout by `fillProfileClauses`. */
    profileClauseValues?: Readonly<Record<string, Record<string, unknown>>>;
}

/** The seller's profile-authored clause values, looked up by the order's
 *  seller address from the checkout's catalog projections. Undefined when
 *  the seller stores none — profile-sourced leaves then stay unfilled. */
export function profileValuesFor(
    seller: `0x${string}`,
    catalogs: readonly PricingCatalog[],
): Readonly<Record<string, Record<string, unknown>>> | undefined {
    return catalogs.find((c) => c.address.toLowerCase() === seller.toLowerCase())?.profileClauseValues;
}

// ── Sub-order seller plan (the per-clause binding cursor) ──────────────────

/** The binding slice of a bound assembly — the hydrated assembly (assembly
 *  plus each agreement's registered agreement) and the adopting seller's
 *  co-seller bindings (any richer projection passes structurally). */
export interface BoundProcessPlanInput {
    hydratedAssembly: HydratedProcessDesign;
    coSellerBindings: readonly CoSellerBinding[];
}

/**
 * Topologically order an assembly's non-root orders and resolve each one's
 * seller from the seller's co-seller bindings. A clause shared by sibling
 * orders draws distinct wallets by commit order (the per-clause cursor), so the
 * ordering is significant and must match the checkout's commit order. `seller`
 * is `null` when the assembly binds no co-seller for that order's clause.
 * `itemId` is the item the binding names for that seller in the seller's own
 * catalog (`CoSellerBinding.itemIds`), or `null` when it names none.
 *
 * Throws when the topology has a cycle (a sub-order's parents are
 * unresolvable) — the same guard the checkout relies on.
 */
export function planSubOrderSellers(
    bound: BoundProcessPlanInput,
): Array<{ node: PlannedProcessOrder; seller: `0x${string}` | null; itemId: string | null }> {
    const { assembly } = bound.hydratedAssembly;
    const rootId =
        assembly.agreements.find((o) => processDesignFollows(o).length === 0)?.id ??
        assembly.agreements[0]?.id;
    // Commit order (throws on a cyclic topology — the guard the checkout
    // relies on), then the sub-orders are everything but the root.
    const ordered = planProcessOrders(bound.hydratedAssembly).filter((node) => node.nodeId !== rootId);
    const byId = new Map(assembly.agreements.map((entry) => [entry.id, entry]));
    const cursor = new Map<string, number>();
    return ordered.map((node) => {
        // The agreement's own clauses — its registered agreement's — never
        // the assembly-scoped terms every order carries.
        const entry = byId.get(node.nodeId) as ProcessDesignAgreement;
        const nodeClauses = Object.keys(agreementClauses(bound.hydratedAssembly, entry)).map((k) => k.toLowerCase());
        const binding = bound.coSellerBindings.find((cb) => nodeClauses.includes(cb.clauseKey.toLowerCase()));
        if (!binding || binding.addresses.length === 0) return { node, seller: null, itemId: null };
        const bindingKey = binding.clauseKey.toLowerCase();
        const c = cursor.get(bindingKey) ?? 0;
        cursor.set(bindingKey, c + 1);
        const seller = binding.addresses[Math.min(c, binding.addresses.length - 1)] as `0x${string}`;
        return { node, seller, itemId: binding.itemIds?.[seller.toLowerCase()] ?? null };
    });
}

// ── Live contributor pricing ────────────────────────────────────────────────

/** A sub-order's full pricing statement — the ONE figure set both the cart
 *  breakdown (display) and the checkout walk (commit) read, so they cannot
 *  drift. `billedQuantity × unitPrice = payment` always holds, making the
 *  committed line item replay the payment with no reference back to the
 *  (mutable) catalog. */
export interface SubOrderPricing {
    /** The catalog item priced — the item the binding names for the
     *  contributor, else the contributor's first available item; null when
     *  there is none to price from. */
    item: CatalogItemMetadata | null;
    /** The payment the buyer signs, in the currency's smallest unit. 0n when
     *  unpriceable (no item, or a rate quantity that doesn't resolve). */
    payment: bigint;
    /** The committed line-item quantity: 1 for fixed items; for rate items
     *  the billed count — per STARTED unit, max(1, ceil(resolvedUnits)). */
    billedQuantity: number;
    /** The committed line-item unitPrice: the full payment for fixed items;
     *  the per-unit rate for rate items. */
    unitPrice: bigint;
    /** The raw resolved units before per-started-unit rounding (e.g. 4.2 km)
     *  — display only; null for fixed items or when unresolvable. */
    resolvedUnits: number | null;
    /** Why the pricing is 0n, when it is. `named-item-not-offered`: the
     *  binding names an item the contributor's catalog no longer offers
     *  (deleted, re-added under a new id, or marked unavailable) — the
     *  surface refuses the order, never prices another item in its place. */
    issue?: "no-item" | "unresolvable-quantity" | "named-item-not-offered";
}

/**
 * Price a sub-order from its contributor's OWN catalog — the lead included.
 * The assembly carries no payment (it's a runtime value), so the figure is
 * resolved LIVE from the pricing seller's catalog — the same path the
 * delivery leg uses, minus the picker. The item is the one the binding
 * names for this contributor (`itemId`, from `planSubOrderSellers`), looked
 * up by id in the contributor's own catalog; with none named, the
 * contributor's first available item (catalog categories are seller-authored
 * free-form values, never a closed set this code may branch on).
 *
 * A `pricingPolicy: "rate"` item prices as rate × quantity, the quantity
 * resolved through the rate-quantity-source registry from the order's OWN
 * clause fields (e.g. committed geolocation endpoints) or the buyer's
 * checkout-entered units — billed per started unit. An unresolvable quantity
 * yields payment 0n + `issue`, and the surface refuses to commit (FigaroCore
 * refuses a payment of zero at commit regardless).
 */
export function resolveSubOrderPricing(args: {
    node: Pick<PlannedProcessOrder, "clauses">;
    seller: `0x${string}`;
    sellerCatalogs: readonly PricingCatalog[];
    tokenDecimals: number;
    specs: SpecSource;
    /** The buyer's entered units for this node (the "checkout-quantity"
     *  source's input), when the surface collected one. */
    checkoutQuantity?: number;
    /** The item the binding names for this seller in its own catalog. */
    itemId?: string;
}): SubOrderPricing {
    const catalog = args.sellerCatalogs.find(
        (c) => c.address.toLowerCase() === args.seller.toLowerCase(),
    );
    const item = catalog?.items.find((i) =>
        i.available !== false && (args.itemId === undefined || i.id === args.itemId)) ?? null;
    // A named item the catalog that was read no longer offers is a refusal,
    // never the first available item in its place.
    if (!item && catalog && args.itemId !== undefined) {
        return { item: null, payment: 0n, billedQuantity: 1, unitPrice: 0n, resolvedUnits: null, issue: "named-item-not-offered" };
    }
    if (!item) {
        return { item: null, payment: 0n, billedQuantity: 1, unitPrice: 0n, resolvedUnits: null, issue: "no-item" };
    }
    if (item.pricingPolicy !== "rate") {
        const payment = parseUnits(item.price, args.tokenDecimals);
        return { item, payment, billedQuantity: 1, unitPrice: payment, resolvedUnits: null };
    }
    const resolver = getRateQuantityResolver(item.rateQuantitySource);
    // The quantity is read from the values the agreement commits: the
    // order's fields with each spec's declared defaults filled
    // (`buildOrderAgreement`), so a field the buyer left at its default
    // prices as it is signed.
    const committed = Object.fromEntries(
        Object.entries(args.node.clauses).map(([clauseKey, data]) =>
            [clauseKey, withSpecDefaults(args.specs, clauseKey as Hex, data)]),
    );
    const units = resolver?.({
        clauses: committed,
        checkoutQuantity: args.checkoutQuantity,
        specs: args.specs,
    }) ?? null;
    if (units === null) {
        return { item, payment: 0n, billedQuantity: 1, unitPrice: 0n, resolvedUnits: null, issue: "unresolvable-quantity" };
    }
    const billedQuantity = Math.max(1, Math.ceil(units));
    const unitPrice = parseUnits(item.price, args.tokenDecimals);
    return {
        item,
        payment: unitPrice * BigInt(billedQuantity),
        billedQuantity,
        unitPrice,
        resolvedUnits: units,
    };
}

// ── The rate-quantity-source → resolver registry ────────────────────────────
//
// A rate-priced catalog item declares WHERE its billed quantity comes from
// (`rateQuantitySource`) — an OPEN axis, the same discipline as the field
// `format` registry: the KEY is a semantic the item declares, never a sector,
// a clause id, or a component name. The pricing site consults it wherever a
// rate item prices; a source with no entry resolves to null and the surface
// refuses to price the item (resolved-empty = absence, never a fallback).
//
// Tenants:
//  - "checkout-quantity": the buyer enters the units at checkout (hours,
//    seats, GB — the unit is the seller's editorial `rateUnit` label).
//  - "order-geodistance": derived from the order's OWN committed endpoints —
//    great-circle distance in km between the two geohash cell centroids. An
//    endpoint is a string field whose spec names a sibling in
//    `formatFromField` and whose sibling's committed value is geohash
//    (`geohashEndpointFields`), never a clause id or a field name. ANY order
//    that composes exactly one clause with exactly two such fields has a
//    derivable distance; no sector is named.
//  - "booking-window": derived from the order's OWN committed time window —
//    hours between two ISO date-times. A window is a pair of string fields
//    whose spec declares `format: "iso-datetime"`, the first declared being
//    the start (`isoDatetimeFields`), never a clause id or a field name. ANY
//    order that composes exactly one clause with exactly two such fields (an
//    appointment, a timeslot, a rental period alike) has derivable hours; no
//    sector is named. This is the time dual of geodistance: both derive a
//    quantity from committed data alone.
//
// Crow-flies distance and window-hours are the derivations available from
// committed data alone; a ROUTED distance (a maps API) is an external source —
// a future composition tenant that fills where composed, registered via
// `registerRateQuantitySource` without touching this file.

/** @public pending consumer: an out-of-file resolver tenant (a routed-distance
 *  composition against a maps API) types its context with this; remove the tag
 *  when the first such tenant lands. The in-file derivations (checkout-quantity,
 *  order-geodistance, booking-window) already consume it. */
export interface RateQuantityContext {
    /** The order's clause fields (assembly values + checkout fills), keyed by
     *  clause id — the same map the agreement commits. */
    clauses: ClauseFields;
    /** The buyer's entered units for this order, when the surface collected
     *  one (the "checkout-quantity" source's input). */
    checkoutQuantity?: number;
    /** The consumer's loaded-spec window — how a resolver finds fields by
     *  declaration, never by clause id. */
    specs: SpecSource;
}

/** Resolve the item's raw quantity in the rate's unit — possibly fractional
 *  (billing rounds per started unit at the ONE pricing site). Null when the
 *  quantity cannot be resolved from this order. */
export type RateQuantityResolver = (ctx: RateQuantityContext) => number | null;

function resolveCheckoutQuantity(ctx: RateQuantityContext): number | null {
    const q = ctx.checkoutQuantity;
    return typeof q === "number" && Number.isFinite(q) && q > 0 ? q : null;
}

/** The fields of one clause whose format the order's own content declares to
 *  be geohash: each string field whose spec names a declared sibling in
 *  `formatFromField`, where that sibling's committed value is geohash. Read
 *  from the spec and the committed values alone, in the spec's declaration
 *  order; no field name and no clause id is known here. The sibling's value
 *  is read as committed, never through a default `resolveInputFormat` would
 *  fall back to: the caller passes the values the agreement signs, with the
 *  spec's defaults already filled (`withSpecDefaults`), so a standard the
 *  buyer left at its declared default arrives here as that default, and a
 *  standard committed empty or absent declares no format. */
function geohashEndpointFields(
    spec: ProjectionSpecView,
    values: Record<string, unknown> | undefined,
): string[] {
    const declared = new Set(spec.fields.map((f) => f.name));
    return spec.fields
        .filter((f) => f.type === "string"
            && typeof f.formatFromField === "string"
            && declared.has(f.formatFromField)
            && ownValue(values, f.formatFromField) === GEOHASH_FORMAT)
        .map((f) => f.name);
}

function resolveOrderGeodistance(ctx: RateQuantityContext): number | null {
    // The endpoint pair is derived from each composed clause's loaded spec
    // and the order's committed values (`geohashEndpointFields`). A clause
    // with exactly two such fields carries the pair; a clause with fewer or
    // more carries none, since its spec does not say which two are the
    // endpoints. Exactly one clause of the order may carry a pair: with none,
    // or with two or more, the spec does not say which distance the order
    // means, and the quantity is unresolvable, never junk-priced. A
    // standard other than geohash declares no geohash fields, so its codes
    // are never read as geohash.
    const pairs: { from: unknown; to: unknown }[] = [];
    for (const [clauseKey, values] of Object.entries(ctx.clauses)) {
        const spec = ctx.specs.get(clauseKey as Hex);
        if (!spec) continue;
        const fields = geohashEndpointFields(spec, values);
        if (fields.length === 2) pairs.push({ from: values[fields[0]!], to: values[fields[1]!] });
    }
    if (pairs.length !== 1) return null;
    const { from, to } = pairs[0]!;
    if (typeof from !== "string" || typeof to !== "string" || !from || !to) {
        return null;
    }
    try {
        return geohashCentroidDistanceKm(from, to);
    } catch {
        // Malformed committed code — unresolvable, never junk-priced.
        return null;
    }
}

/** The format a string field declares for an ISO 8601 date-time, the one the
 *  content validator enforces (`validate.ts`). */
const ISO_DATETIME_FORMAT = "iso-datetime";

/** The fields of one clause that declare the date-time format statically
 *  (`format: "iso-datetime"`), in the spec's declaration order. The validator
 *  enforces that format on a static declaration only, so these are the fields
 *  whose signed values are date-times; no field name and no clause id is
 *  known here. */
function isoDatetimeFields(spec: ProjectionSpecView): string[] {
    return spec.fields
        .filter((f) => f.type === "string" && f.format === ISO_DATETIME_FORMAT)
        .map((f) => f.name);
}

function resolveBookingWindowHours(ctx: RateQuantityContext): number | null {
    // The window is derived from each composed clause's loaded spec
    // (`isoDatetimeFields`). A clause with exactly two date-time fields
    // carries a window, and the field it declares first is the start; a
    // clause with fewer or more carries none, since its spec does not say
    // which two bound the window. Exactly one clause of the order may carry a
    // window: with none, or with two or more, the spec does not say which
    // window the order means, and the quantity is unresolvable, never
    // junk-priced.
    const windows: { start: unknown; end: unknown }[] = [];
    for (const [clauseKey, values] of Object.entries(ctx.clauses)) {
        const spec = ctx.specs.get(clauseKey as Hex);
        if (!spec) continue;
        const fields = isoDatetimeFields(spec);
        if (fields.length === 2) windows.push({ start: values[fields[0]!], end: values[fields[1]!] });
    }
    if (windows.length !== 1) return null;
    const { start, end } = windows[0]!;
    if (typeof start !== "string" || typeof end !== "string" || !start || !end) {
        return null;
    }
    const startMs = Date.parse(start);
    const endMs = Date.parse(end);
    // Malformed date-time or a non-positive window is unresolvable — the pricing
    // site refuses to price rather than junk-price (resolved-empty = absence).
    if (Number.isNaN(startMs) || Number.isNaN(endMs) || endMs <= startMs) {
        return null;
    }
    return (endMs - startMs) / 3_600_000; // ms → hours (fractional; billing rounds per started hour)
}

const REGISTRY = new Map<string, RateQuantityResolver>([
    ["checkout-quantity", resolveCheckoutQuantity],
    ["order-geodistance", resolveOrderGeodistance],
    ["booking-window", resolveBookingWindowHours],
]);

/** Human labels for registered sources — REGISTRY DATA like a clause spec's
 *  title, not frontend copy: an authoring surface enumerating the sources
 *  (the wizard's rate-source picker) renders these, falling back to the
 *  source id for an unlabeled tenant. */
const LABELS = new Map<string, string>([
    ["checkout-quantity", "Entered at checkout"],
    ["order-geodistance", "Distance between the order's committed endpoints (km)"],
    ["booking-window", "Hours from the order's committed schedule window"],
]);

/** Register a resolver for a declared quantity source. Last write wins —
 *  the registry's extension point: a routed-distance composition registers
 *  here without touching checkout code. An
 *  optional human label surfaces the tenant on authoring pickers.
 *  @public */
export function registerRateQuantitySource(
    source: string,
    resolver: RateQuantityResolver,
    options: { label?: string } = {},
): void {
    REGISTRY.set(source, resolver);
    if (options.label) LABELS.set(source, options.label);
}

/** Enumerate the registered quantity sources — the authoring picker's data
 *  source, so a permissionlessly registered tenant surfaces with zero
 *  picker-code changes. Label falls back to the source id. */
export function listRateQuantitySources(): { source: string; label: string }[] {
    return Array.from(REGISTRY.keys()).map((source) => ({
        source,
        label: LABELS.get(source) ?? source,
    }));
}

/** The resolver for a declared quantity source, or null — the pricing site
 *  treats a missing tenant as unresolvable. */
export function getRateQuantityResolver(
    source: string | undefined,
): RateQuantityResolver | null {
    if (!source) return null;
    return REGISTRY.get(source) ?? null;
}
