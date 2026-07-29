/**
 * checkoutPlan.ts — the buyer-side checkout planning vocabulary: the
 * fill-where-composed section writers, the sub-order seller plan (the
 * per-clause binding cursor), live contributor pricing, and the open
 * rate-quantity-source registry.
 *
 * Everything here shapes COMMITTED bytes (the agreement sections the merkle
 * root hashes) or the payment figures the commitments sign, so a second
 * frontend must reproduce it exactly. No clause is ever named: sections are
 * found by their DECLARED FIELDS (`lineItems`, `parentOrderHashes`,
 * `massGrams`, `billedMassGrams`) or their spec hints (`catalogueFills`)
 * through the caller's `SpecSource` — ANY registered clause carrying the
 * field participates, including clauses this code has never seen. A fill
 * whose clause isn't composed is a no-op, so the same call serves the root
 * and every sub-order.
 */

import { parseUnits } from "viem";
import { geohashCentroidDistanceKm } from "./derive/geo.js";
import { specDeclaresField, specCatalogueFills, specProfileFills, type SpecSource } from "./projection.js";
import { templateParentOrderHashes, type AssemblyTemplate, type TemplateAgreement } from "./assembly.js";
import { topologicalOrder } from "./topology.js";
import type { CounterpartyBinding } from "./sellerProfile.js";
import type { CatalogueItemMetadata } from "./sellerCatalogue.js";

/** An order's clause fields — the same map the agreement commits. */
type ClauseFields = Record<string, Record<string, unknown>>;

export interface AssemblyCheckoutLineItem {
    itemId: string;
    name: string;
    quantity: number;
    /** Decimal string, smallest unit (matches the commerce clause's bigint field). */
    unitPrice: string;
    /** Physical attributes from the catalogue item — folded onto THIS order's
     *  cargo leaf at checkout (mass/volume sum × quantity; packaged dimensions
     *  only when the order is a single parcel — dims don't sum). Optional:
     *  services / un-annotated items omit them. */
    massGrams?: number;
    volumeMl?: number;
    lengthMm?: number;
    widthMm?: number;
    heightMm?: number;
    /** Catalogue-sourced clause values (freight class / hazmat / cold-chain, …)
     *  folded onto their leaves. Keyed by clauseId → field values. */
    clauseValues?: Record<string, Record<string, unknown>>;
}

/** The declared-field lookup the fills run: the first composed clause whose
 *  loaded spec declares `fieldName`. Undefined while the spec is unloaded —
 *  the fill degrades to a no-op, exactly as the registry-reading frontend
 *  does before its cache warms. */
function composedClauseDeclaring(
    clauses: ClauseFields,
    fieldName: string,
    specs: SpecSource,
): string | undefined {
    return Object.keys(clauses).find((clauseId) => {
        const spec = specs.get(clauseId);
        return spec ? specDeclaresField(spec, fieldName) : false;
    });
}

/**
 * The RFQ's priced fields, DERIVED from an agreement by declared field — the
 * section that carries the commercial terms (declared `lineItems`) prices at
 * `payment` and each committed line's `unitPrice`. Spec-routed like every
 * fill, naming no clause; empty when no commercial section is composed
 * (nothing to quote) or the spec cache is cold. The returned paths are the
 * SAME fields `fillCommerceSection` writes, so a quote's substitution and the
 * checkout walk at the quoted price produce identical agreements.
 */
export function derivePricedFields(
    sections: readonly { clause: string; data?: Record<string, unknown> }[],
    specs: SpecSource,
): { clause: string; path: string }[] {
    // Commercial terms are PUBLIC (never a content-withheld section), so a
    // section carrying only a fingerprint contributes no priced field.
    const clauses = Object.fromEntries(sections.map((s) => [s.clause, s.data ?? {}])) as ClauseFields;
    const commerce = composedClauseDeclaring(clauses, "lineItems", specs);
    if (!commerce) return [];
    const lineItems = clauses[commerce]?.lineItems;
    const count = Array.isArray(lineItems) ? lineItems.length : 0;
    return [
        { clause: commerce, path: "payment" },
        ...Array.from({ length: count }, (_, i) => ({ clause: commerce, path: `lineItems.${i}.unitPrice` })),
    ];
}

/**
 * Write the order's commercial terms into the commerce section, found by its
 * declared `lineItems` field (never by clause id; gracefully skipped when the
 * assembly composes no commerce clause). `payment` is stored as the clause
 * spec wants it (decimal string); `lineItems` is supplied only for the root
 * (the buyer's cart) and stripped to the commerce section's closed shape —
 * the cart's physical attributes belong to the cargo collapse, not here.
 * The settlement CURRENCY is not commerce content: it is signed in the
 * kernel commitment itself, and pinned assemblies commit it through the
 * root's denomination section (`readDenominationPin`).
 */
export function fillCommerceSection(
    clauses: ClauseFields,
    payment: bigint,
    specs: SpecSource,
    lineItems?: AssemblyCheckoutLineItem[],
): ClauseFields {
    const commerceClauseId = composedClauseDeclaring(clauses, "lineItems", specs);
    if (!commerceClauseId) return clauses;
    return {
        ...clauses,
        [commerceClauseId]: {
            ...clauses[commerceClauseId],
            payment: payment.toString(),
            ...(lineItems
                ? {
                    lineItems: lineItems.map(({ itemId, name, quantity, unitPrice }) =>
                        ({ itemId, name, quantity, unitPrice })),
                }
                : {}),
        },
    };
}

/**
 * The designer's denomination pin, read from a template agreement's composed
 * clauses — the first composed clause declaring a `currency` field (never a
 * clause id; commerce no longer declares one), with a non-empty designer
 * value. The pin is designer-fills content (block.design.fills): it survives the value-free build
 * and is part of the compositionHash — the assembly's one-token tailoring.
 * Undefined = unpinned (the buyer's payment-token pick, else the seller's
 * default, denominates) or spec cache cold.
 */
export function readDenominationPin(
    clauses: ClauseFields,
    specs: SpecSource,
): `0x${string}` | undefined {
    const clauseId = composedClauseDeclaring(clauses, "currency", specs);
    const value = clauseId ? clauses[clauseId]?.currency : undefined;
    return typeof value === "string" && /^0x[0-9a-fA-F]{40}$/.test(value)
        ? (value as `0x${string}`)
        : undefined;
}

/**
 * Write the template's own composition identity into the provenance section,
 * found by its declared `compositionHash` field (never by clause id; a no-op
 * when the assembly composes no provenance clause). MECHANICAL, not authored:
 * the value is derived from the loaded template itself
 * (`templateCompositionHash`), so it cannot be a designer value — the hash
 * cannot appear inside the composition it hashes. Committed under
 * agreementHash, a buyer attestation of this section becomes the on-chain
 * event linking the process to its registered assembly.
 */
export function fillProvenanceSection(
    clauses: ClauseFields,
    compositionHash: `0x${string}`,
    specs: SpecSource,
): ClauseFields {
    const provenanceClauseId = composedClauseDeclaring(clauses, "compositionHash", specs);
    if (!provenanceClauseId) return clauses;
    return {
        ...clauses,
        [provenanceClauseId]: {
            ...clauses[provenanceClauseId],
            compositionHash,
        },
    };
}

/** The field names this module's fills write MECHANICALLY — derived or
 *  rewritten by the checkout walk regardless of any buyer input: the
 *  commercial terms (`fillCommerceSection`), the provenance anchor
 *  (`fillProvenanceSection`), the topology rewrite (`writeTopologySection`),
 *  and the dimweight derivation (`fillDimweightSection`). ONE list, owned
 *  beside the fills it describes. */
const MECHANICAL_FILL_FIELDS = ["payment", "lineItems", "compositionHash", "parentOrderHashes", "billedMassGrams"] as const;

/**
 * The field names the checkout walk fills mechanically for THIS composed
 * clause set — the subset of `MECHANICAL_FILL_FIELDS` some composed clause
 * actually declares (declared-field discovery, never a clause id). A
 * fillable surface subtracts these: rendering a buyer input the walk will
 * overwrite is a false affordance, not a fill.
 */
export function mechanicallyFilledFieldNames(
    clauses: ClauseFields,
    specs: SpecSource,
): Set<string> {
    return new Set(
        MECHANICAL_FILL_FIELDS.filter((field) => composedClauseDeclaring(clauses, field, specs) !== undefined),
    );
}

/**
 * Write the REAL parent-order hashes into the topology section, found by its
 * declared `parentOrderHashes` field (never by clause id). The template's
 * topology data carries template-LOCAL order ids ("order-0"); the committed
 * agreement must carry the actual EIP-712 order hashes — they are the DAG
 * edges every off-chain reader (audit, derive) reconstructs from, and the
 * bytes32 shape Layer A validates.
 */
export function writeTopologySection(
    clauses: ClauseFields,
    parentOrderHashes: `0x${string}`[],
    specs: SpecSource,
): ClauseFields {
    const topologyClauseId = composedClauseDeclaring(clauses, "parentOrderHashes", specs);
    if (!topologyClauseId) return clauses;
    return {
        ...clauses,
        [topologyClauseId]: {
            ...clauses[topologyClauseId],
            parentOrderHashes,
        },
    };
}

/**
 * Fold the order's physical measure onto its cargo leaf, found by its declared
 * `massGrams` field (never by clause id; skipped when no cargo clause is
 * composed — services have no cargo, G7). Mass and volume SUM across the order's
 * lines (× quantity — both additive). Packaged dimensions do NOT sum (packing),
 * so they are written only when the order is a single parcel (one line, quantity
 * 1) — a multi-line order's packaged dimension is a per-order input this fold
 * does not fabricate; dimensional weight then falls back to actual mass.
 */
export function fillCargoSection(
    clauses: ClauseFields,
    lines: AssemblyCheckoutLineItem[],
    specs: SpecSource,
): ClauseFields {
    const cargoId = composedClauseDeclaring(clauses, "massGrams", specs);
    if (!cargoId) return clauses;
    const massGrams = lines.reduce((s, li) => s + (li.massGrams ?? 0) * li.quantity, 0);
    const volumeMl = lines.reduce((s, li) => s + (li.volumeMl ?? 0) * li.quantity, 0);
    const single = lines.length === 1 && lines[0].quantity === 1 ? lines[0] : undefined;
    const dims = single && single.lengthMm && single.widthMm && single.heightMm
        ? { lengthMm: single.lengthMm, widthMm: single.widthMm, heightMm: single.heightMm }
        : {};
    return {
        ...clauses,
        [cargoId]: {
            ...clauses[cargoId],
            ...(massGrams > 0 ? { massGrams } : {}),
            ...(volumeMl > 0 ? { volumeMl } : {}),
            ...dims,
        },
    };
}

/**
 * Fold the catalogue-authored class values onto their leaves. For each
 * clause the order composes with catalogue-authored fields (freight-class /
 * hazmat / cold-chain, …, discovered by `block.checkout.catalogueFills`, never
 * by name), write the first line's authored values — a homogeneous-order
 * assumption (mixed classes are a multi-ORDER concern per the aggregate
 * model). Absent when no line carries values for that clause.
 */
export function fillClassSections(
    clauses: ClauseFields,
    lines: AssemblyCheckoutLineItem[],
    specs: SpecSource,
): ClauseFields {
    let out = clauses;
    for (const clauseId of Object.keys(clauses)) {
        const spec = specs.get(clauseId);
        if (!spec || specCatalogueFills(spec).length === 0) continue;
        const line = lines.find(
            (li) => li.clauseValues?.[clauseId] && Object.keys(li.clauseValues[clauseId]).length > 0,
        );
        if (!line) continue;
        out = { ...out, [clauseId]: mergeUnderTemplate(out[clauseId], line.clauseValues![clauseId]) };
    }
    return out;
}

/** Merge authored master data UNDER the template's committed values: a field
 *  the template already carries (a designer's `design.fills` pin) is a term and
 *  WINS; authored values fill the gaps. Empty-string/undefined template
 *  entries do not count as pins — they cannot shadow authored data. */
function mergeUnderTemplate(
    template: Record<string, unknown> | undefined,
    authored: Record<string, unknown>,
): Record<string, unknown> {
    const pins = Object.fromEntries(
        Object.entries(template ?? {}).filter(([, v]) => v !== undefined && v !== ""),
    );
    return { ...authored, ...pins };
}

/**
 * Fold the seller's PROFILE-authored clause values onto their leaves. For each
 * clause the order composes with profile-authored fields (dimweight's divisor,
 * a declared credential id, …, discovered by `block.checkout.profileFills`,
 * never by name), write the seller's stored values — restricted to the spec's
 * DECLARED profile-authored subset (`specProfileFills`), with the template's
 * committed terms winning over authored data. Absent when the seller stores no
 * values for that clause. The seller-level sibling of `fillClassSections`
 * (catalogue = what is sold, profile = who sells).
 */
export function fillProfileSections(
    clauses: ClauseFields,
    profileValues: Readonly<Record<string, Record<string, unknown>>> | undefined,
    specs: SpecSource,
): ClauseFields {
    if (!profileValues) return clauses;
    let out = clauses;
    for (const clauseId of Object.keys(clauses)) {
        const spec = specs.get(clauseId);
        if (!spec) continue;
        const declared = specProfileFills(spec);
        if (declared.length === 0) continue;
        const stored = profileValues[clauseId];
        if (!stored || Object.keys(stored).length === 0) continue;
        const authored = Object.fromEntries(
            Object.entries(stored).filter(([k, v]) => declared.includes(k) && v !== undefined && v !== ""),
        );
        if (Object.keys(authored).length === 0) continue;
        out = { ...out, [clauseId]: mergeUnderTemplate(out[clauseId], authored) };
    }
    return out;
}

/**
 * Compute the dimensional (billed) weight onto the dimweight leaf, found by its
 * declared `billedMassGrams` field. DERIVED, not authored: billed = max(gross
 * mass, volumetric), volumetric = packaged volume ÷ divisor with each packaged
 * dimension rounded up to the next whole centimetre first (carriers round per
 * dimension). Reads the cargo leaf just filled and the divisor the PROFILE fold
 * just wrote onto this same leaf (the seller's shipping convention, a
 * profile-sourced value); skipped when the order composes no dimweight clause,
 * has no packaged dimensions, or the seller declares no divisor — dimensional
 * weight then simply does not apply.
 */
export function fillDimweightSection(
    clauses: ClauseFields,
    specs: SpecSource,
): ClauseFields {
    const dimId = composedClauseDeclaring(clauses, "billedMassGrams", specs);
    if (!dimId) return clauses;
    const divisor = Number(clauses[dimId]?.divisor ?? 0);
    if (!(divisor > 0)) return clauses;
    const cargoId = composedClauseDeclaring(clauses, "massGrams", specs);
    const cargo = cargoId ? clauses[cargoId] : undefined;
    const l = Number(cargo?.lengthMm ?? 0), w = Number(cargo?.widthMm ?? 0), h = Number(cargo?.heightMm ?? 0);
    if (!(l > 0 && w > 0 && h > 0)) return clauses;
    const gross = Number(cargo?.massGrams ?? 0);
    const roundCm = (mm: number) => Math.ceil(mm / 10) * 10;
    const volMm3 = roundCm(l) * roundCm(w) * roundCm(h);
    const volumetric = Math.ceil(volMm3 / divisor);
    return { ...clauses, [dimId]: { ...clauses[dimId], billedMassGrams: Math.max(gross, volumetric), divisor } };
}

/**
 * Fill every derivable LOGISTICS section on an order, wherever composed — cargo
 * (physical measure), the class leaves (catalogue-sourced), the profile leaves
 * (seller master data), then the derived dimweight (reads the cargo and the
 * profile-folded divisor it just wrote). Each fill is a no-op when its clause
 * isn't composed, so the same call serves the root and every sub-order.
 */
export function fillDerivedSections(
    clauses: ClauseFields,
    lines: AssemblyCheckoutLineItem[],
    specs: SpecSource,
    profileValues?: Readonly<Record<string, Record<string, unknown>>>,
): ClauseFields {
    return fillDimweightSection(
        fillProfileSections(fillClassSections(fillCargoSection(clauses, lines, specs), lines, specs), profileValues, specs),
        specs,
    );
}

// ── Contributor pricing context ─────────────────────────────────────────────

/** The pricing slice of a seller's catalogue projection — the structural
 *  subset the checkout planning reads (any richer catalogue projection passes
 *  structurally). */
export interface PricingCatalogue {
    address: string;
    items: CatalogueItemMetadata[];
    /** The seller's PROFILE-authored clause values (seller master data:
     *  dimweight's divisor, a declared credential id), keyed clauseId →
     *  field → value. Folded onto composed profile-sourced leaves at
     *  checkout by `fillProfileSections`. */
    profileClauseValues?: Readonly<Record<string, Record<string, unknown>>>;
}

/** The seller's profile-authored clause values, looked up by the order's
 *  seller address from the checkout's catalogue projections. Undefined when
 *  the seller stores none — profile-sourced leaves then stay unfilled. */
export function profileValuesFor(
    seller: `0x${string}`,
    catalogues: readonly PricingCatalogue[],
): Readonly<Record<string, Record<string, unknown>>> | undefined {
    return catalogues.find((c) => c.address.toLowerCase() === seller.toLowerCase())?.profileClauseValues;
}

// ── Sub-order seller plan (the per-clause binding cursor) ──────────────────

/** The binding slice of a bound assembly — the template plus the adopting
 *  seller's counterparty bindings (any richer projection passes structurally). */
export interface BoundAssemblyPlanInput {
    assemblyTemplate: AssemblyTemplate;
    counterpartyBindings: readonly CounterpartyBinding[];
}

/**
 * Topologically order an assembly's non-root orders and resolve each one's
 * seller from the seller's counterparty bindings. A clause shared by sibling
 * orders draws distinct wallets by commit order (the per-clause cursor), so the
 * ordering is significant and must match the checkout's commit order. `seller`
 * is `null` when the assembly binds no counterparty for that order's clause.
 *
 * Throws when the topology has a cycle (a sub-order's parents are
 * unresolvable) — the same guard the checkout relies on.
 */
export function planSubOrderSellers(
    assembly: BoundAssemblyPlanInput,
): Array<{ node: TemplateAgreement; seller: `0x${string}` | null }> {
    const { assemblyTemplate } = assembly;
    const byId = new Map(assemblyTemplate.agreements.map((o) => [o.id, o]));
    const rootId =
        assemblyTemplate.agreements.find((o) => templateParentOrderHashes(o).length === 0)?.id ??
        assemblyTemplate.agreements[0]?.id;
    // Topological order (throws on a cyclic topology — the guard the checkout relies on),
    // then the sub-orders are everything but the root, in commit order.
    const ordered: TemplateAgreement[] = topologicalOrder(
        assemblyTemplate.agreements.map((o) => o.id),
        (id) => templateParentOrderHashes(byId.get(id) as TemplateAgreement),
        "throw",
    )
        .filter((id) => id !== rootId)
        .map((id) => byId.get(id) as TemplateAgreement);
    const cursor = new Map<string, number>();
    return ordered.map((node) => {
        const nodeClauses = Object.keys(node.clauses);
        const binding = assembly.counterpartyBindings.find((cb) => nodeClauses.includes(cb.clauseId));
        if (!binding || binding.addresses.length === 0) return { node, seller: null };
        const c = cursor.get(binding.clauseId) ?? 0;
        cursor.set(binding.clauseId, c + 1);
        return { node, seller: binding.addresses[Math.min(c, binding.addresses.length - 1)] as `0x${string}` };
    });
}

// ── Live contributor pricing ────────────────────────────────────────────────

/** A sub-order's full pricing statement — the ONE figure set both the cart
 *  breakdown (display) and the checkout walk (commit) read, so they cannot
 *  drift. `billedQuantity × unitPrice = payment` always holds, making the
 *  committed line item replay the payment with no reference back to the
 *  (mutable) catalogue. */
export interface SubOrderPricing {
    /** The catalogue item priced — the contributor's first available item;
     *  null when the contributor publishes none. */
    item: CatalogueItemMetadata | null;
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
    /** Why the pricing is 0n, when it is. */
    issue?: "no-item" | "unresolvable-quantity";
}

/**
 * Price a sub-order from its contributor's OWN catalogue — the lead included.
 * The template carries no payment (it's a runtime value), so the figure is
 * resolved LIVE from the pricing seller's catalogue — the same path the
 * delivery leg uses, minus the picker. The item rule is the contributor's
 * first available item (open refinement, kit-assembly: an itemId on the
 * binding — catalogue categories are seller-authored free-form values, never
 * a closed set this code may branch on).
 *
 * A `pricingPolicy: "rate"` item prices as rate × quantity, the quantity
 * resolved through the rate-quantity-source registry from the order's OWN
 * clause fields (e.g. committed geolocation endpoints) or the buyer's
 * checkout-entered units — billed per started unit. An unresolvable quantity
 * yields payment 0n + `issue`, and the surface refuses to commit (the
 * commerce clause's `payment ≥ 1` would reject it at Layer A regardless).
 */
export function resolveSubOrderPricing(args: {
    node: TemplateAgreement;
    seller: `0x${string}`;
    sellerCatalogues: readonly PricingCatalogue[];
    tokenDecimals: number;
    specs: SpecSource;
    /** The buyer's entered units for this node (the "checkout-quantity"
     *  source's input), when the surface collected one. */
    checkoutQuantity?: number;
}): SubOrderPricing {
    const catalogue = args.sellerCatalogues.find(
        (c) => c.address.toLowerCase() === args.seller.toLowerCase(),
    );
    const item = catalogue?.items.find((i) => i.available !== false) ?? null;
    if (!item) {
        return { item: null, payment: 0n, billedQuantity: 1, unitPrice: 0n, resolvedUnits: null, issue: "no-item" };
    }
    if (item.pricingPolicy !== "rate") {
        const payment = parseUnits(item.price, args.tokenDecimals);
        return { item, payment, billedQuantity: 1, unitPrice: payment, resolvedUnits: null };
    }
    const resolver = getRateQuantityResolver(item.rateQuantitySource);
    const units = resolver?.({
        clauses: args.node.clauses,
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
// A rate-priced catalogue item declares WHERE its billed quantity comes from
// (`rateQuantitySource`) — an OPEN axis, the same discipline as the field
// `format` registry: the KEY is a semantic the item declares, never a sector,
// a clause id, or a component name. The pricing site consults it wherever a
// rate item prices; a source with no entry resolves to null and the surface
// refuses to price the item (resolved-empty = absence, never a fallback).
//
// Tenants:
//  - "checkout-quantity": the buyer enters the units at checkout (hours,
//    seats, GB — the unit is the seller's editorial `rateUnit` label).
//  - "order-geodistance": derived from the order's OWN committed geolocation
//    endpoints — great-circle distance in km between the two geohash cell
//    centroids, found by their declared fields (`origin` +
//    `destination`), never by clause id. ANY order that composes both
//    endpoints has a derivable distance; no sector is named.
//  - "booking-window": derived from the order's OWN committed time window —
//    hours between the two ISO date-times, found by their declared fields
//    (`windowStart` + `windowEnd`), never by clause id. ANY order that commits
//    a window (an appointment, a timeslot, a rental period alike) has derivable
//    hours; no sector is named. This is the time dual of geodistance: both
//    derive a quantity from committed data alone.
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
    /** The order's clause fields (template values + checkout fills), keyed by
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

function resolveOrderGeodistance(ctx: RateQuantityContext): number | null {
    // Found by declared fields, never by clause id: any clause carrying a
    // geocodeStandard with origin/destination participates. Distance is
    // derivable only for standards this resolver knows — geohash today
    // (2026-07-28: the geolocation clause is standards-agnostic; the
    // standard is committed content, so the gate reads the SECTION, not the
    // spec). An unknown standard is unresolvable, never junk-priced.
    const geoClauseId = Object.keys(ctx.clauses).find((clauseId) => {
        const spec = ctx.specs.get(clauseId);
        return spec
            ? specDeclaresField(spec, "geocodeStandard")
                && specDeclaresField(spec, "origin") && specDeclaresField(spec, "destination")
            : false;
    });
    if (!geoClauseId) return null;
    const section = ctx.clauses[geoClauseId];
    const standard = section?.geocodeStandard;
    if (typeof standard === "string" && standard !== "" && standard !== "geohash") return null;
    const origin = section?.origin;
    const destination = section?.destination;
    if (typeof origin !== "string" || typeof destination !== "string" || !origin || !destination) {
        return null;
    }
    try {
        return geohashCentroidDistanceKm(origin, destination);
    } catch {
        // Malformed committed code — unresolvable, never junk-priced.
        return null;
    }
}

function resolveBookingWindowHours(ctx: RateQuantityContext): number | null {
    const scheduleClauseId = Object.keys(ctx.clauses).find((clauseId) => {
        const spec = ctx.specs.get(clauseId);
        return spec
            ? specDeclaresField(spec, "windowStart") && specDeclaresField(spec, "windowEnd")
            : false;
    });
    if (!scheduleClauseId) return null;
    const section = ctx.clauses[scheduleClauseId];
    const start = section?.windowStart;
    const end = section?.windowEnd;
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
 *  the registry's extension point: a booking-window derivation or a routed-
 *  distance composition registers here without touching checkout code. An
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
