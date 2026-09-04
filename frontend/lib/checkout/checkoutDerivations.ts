/**
 * checkoutDerivations — the checkout review's pure derivations, lifted out
 * of the view's render path (they were recompute-every-render IIFEs): the
 * multi-order price breakdown and the per-order agreement review rows.
 * Everything here is a pure function of its inputs — the SAME sdk fills and
 * plans the commit walk runs, so what the buyer reviews equals what
 * commits; the view memoizes the calls.
 */
import {
    fillProfileSections,
    mechanicallyFilledFieldNames,
    planSubOrderSellers,
    profileValuesFor,
    resolveSubOrderPricing,
    type SubOrderPricing,
} from "@figaro-protocol/sdk";
import { displayNameForAddress } from "@/lib/member/memberListing";
import { templateParentOrderHashes } from "@/lib/shared/assemblyTemplate";
import {
    clauseCatalogueFills,
    clauseDesignFills,
    clauseIsMandatory,
    clauseIsProcessLog,
    clauseProfileFills,
    getClauseSpec,
    specSource,
} from "@/lib/shared/clauseSpecSource";
import { parseToken } from "@/lib/shared/utils";
import type { FieldSpec } from "@figaro-protocol/sdk/clauses";

type PlanAssembly = Parameters<typeof planSubOrderSellers>[0];
type PricingCatalogues = Parameters<typeof resolveSubOrderPricing>[0]["sellerCatalogues"];
type ListingCatalogues = Parameters<typeof displayNameForAddress>[0];

/** A candidate pick (the buyer's manual choice or a race winner's) — the
 *  structural shape both surfaces share; no component type crosses into lib. */
export interface CandidatePick {
    seller: `0x${string}`;
    price: string;
}

/** Compact, spec-agnostic value summary of a clause's composed fields — the
 *  leaf scalar/enum values the buyer actually chose ("delivery",
 *  "zone-wifi"), joined for inline display. Empty objects (runtime anchors
 *  like a proof clause) and booleans summarize to "" — title-only rows. */
function clauseValueSummary(fields: unknown): string {
    const leaves: string[] = [];
    const walk = (value: unknown): void => {
        if (value === null || value === undefined || value === "") return;
        if (Array.isArray(value)) { value.forEach(walk); return; }
        if (typeof value === "object") { Object.values(value as Record<string, unknown>).forEach(walk); return; }
        if (typeof value === "boolean") return;
        leaves.push(String(value));
    };
    walk(fields);
    return leaves.join(" · ");
}

export interface KitBreakdown {
    rows: Array<{ name: string; payment: bigint; nodeId?: string; pricing?: SubOrderPricing }>;
    total: bigint;
}

/**
 * Multi-order price transparency: the buyer pays the lead's cut plus every
 * contributor's cut, each priced LIVE from that contributor's own catalogue.
 * Built from the SAME planSubOrderSellers + resolveSubOrderPricing the
 * commit walks (same checkout-entered quantities included), so the shown
 * figures — rate derivations and all — equal what commits. Null for a
 * single-order assembly (no breakdown to show).
 */
export function deriveKitBreakdown(args: {
    pickedAssembly: (PlanAssembly & { assemblyTemplate: { agreements: readonly unknown[] } }) | undefined;
    leadAddress: `0x${string}`;
    sellerCatalogues: ListingCatalogues;
    pricedCatalogues: PricingCatalogues;
    cartTotal: bigint;
    clauseFills: Record<string, Record<string, Record<string, unknown>>>;
    subOrderQuantities: Record<string, Parameters<typeof resolveSubOrderPricing>[0]["checkoutQuantity"]>;
    tokenDecimals: number;
    /** A race winner's overlay for its node — its price is already in the
     *  process denomination. */
    raceOutcome: { nodeId: string; selection: CandidatePick } | null;
    /** The buyer's manual pick for an unbound node. */
    sellerSelection: CandidatePick | null;
    /** Venue conversion into the process denomination for manual picks. */
    toCurrency: (amount: bigint) => bigint;
}): KitBreakdown | null {
    const assembly = args.pickedAssembly;
    if (!assembly || assembly.assemblyTemplate.agreements.length <= 1) return null;
    const nameOf = (addr: `0x${string}`) => displayNameForAddress(args.sellerCatalogues, addr);
    let plan: ReturnType<typeof planSubOrderSellers>;
    try {
        plan = planSubOrderSellers(assembly);
    } catch {
        return null;
    }
    const rows = [
        { name: nameOf(args.leadAddress), payment: args.cartTotal },
        ...plan.map(({ node, seller }) => {
            if (seller) {
                // The buyer's checkout fills join the node BEFORE pricing —
                // a rate source (order-geodistance) derives from clause
                // content, and templates arrive value-free by construction.
                // Same merge the commit walk performs, so shown = committed.
                const pricing = resolveSubOrderPricing({
                    node: { ...node, clauses: { ...node.clauses, ...args.clauseFills[node.id] } },
                    seller, sellerCatalogues: args.pricedCatalogues, tokenDecimals: args.tokenDecimals,
                    specs: specSource(),
                    checkoutQuantity: args.subOrderQuantities[node.id],
                });
                return { name: nameOf(seller), payment: pricing.payment, nodeId: node.id, pricing };
            }
            // Unbound node: the buyer's checkout-time choice fills it — the
            // shown figure is the SAME selection the commit will use. A
            // race winner overlays the manual pick for its node (matching
            // the commit mapping's overlay order); its price is already in
            // the process denomination.
            if (args.raceOutcome && args.raceOutcome.nodeId === node.id) {
                return { name: nameOf(args.raceOutcome.selection.seller), payment: parseToken(args.raceOutcome.selection.price, args.tokenDecimals) };
            }
            return args.sellerSelection
                ? { name: nameOf(args.sellerSelection.seller), payment: args.toCurrency(parseToken(args.sellerSelection.price, args.tokenDecimals)) }
                : { name: "(choose below)", payment: 0n };
        }),
    ];
    return { rows, total: rows.reduce((s, r) => s + r.payment, 0n) };
}

export interface AgreementGroup {
    key: string;
    label: string;
    clauses: Array<{ clauseId: string; values: string; data: Record<string, unknown>; fillable: boolean }>;
}

/**
 * The per-order agreement review rows: every order in the assembly — root +
 * sub-orders — surfaced for review, each clause rendering its COMPOSED
 * values, spec-driven. Mandatory clauses are protocol-composed and stay out
 * of the review; the profile fold and the mechanical-fill subtraction are
 * the SAME ones the order build applies, so the buyer reviews what will
 * actually commit.
 */
export function deriveAgreementGroups(args: {
    pickedAssembly: (PlanAssembly & {
        assemblyTemplate: { agreements: Array<{ id?: string | number; clauses: Record<string, Record<string, unknown>> }> };
    }) | undefined;
    leadAddress: `0x${string}`;
    sellerCatalogues: ListingCatalogues & Parameters<typeof profileValuesFor>[1];
}): AgreementGroup[] {
    const { pickedAssembly, leadAddress, sellerCatalogues } = args;
    if (!pickedAssembly) return [];
    const orders = pickedAssembly.assemblyTemplate.agreements;
    const nameOf = (addr: `0x${string}`) => displayNameForAddress(sellerCatalogues, addr);
    let plan: ReturnType<typeof planSubOrderSellers> = [];
    if (orders.length > 1) {
        try { plan = planSubOrderSellers(pickedAssembly); } catch { plan = []; }
    }
    const sellerOf = new Map(plan.map(({ node, seller }) => [node.id, seller]));
    // ASSEMBLY TERMS first — the template's assembly-scoped sections (a
    // denomination pin, a dispute forum), reviewed and buyer-filled ONCE;
    // the checkout walk folds them into every agreement, so every party
    // signs them. Same fillable rules as per-order clauses; keyed by the
    // reserved group key "assembly" (never a template order id).
    const assemblySections = (pickedAssembly.assemblyTemplate as {
        assemblyClauses?: Record<string, Record<string, unknown>>;
    }).assemblyClauses ?? {};
    const assemblyGroup: AgreementGroup[] = Object.keys(assemblySections).length === 0 ? [] : [{
        key: "assembly",
        label: "Assembly terms (every agreement)",
        clauses: Object.entries(assemblySections)
            .filter(([clauseId]) => !clauseIsMandatory(clauseId))
            .map(([clauseId, fields]) => {
            const specFields = getClauseSpec(clauseId)?.fields ?? [];
            return {
                clauseId,
                values: clauseValueSummary(fields),
                data: fields as Record<string, unknown>,
                // Design fills are FIELD-level, not clause-level: a clause the
                // designer tailored (a pinned geocoder, a consent document) can
                // still carry transaction particulars the buyer authors here —
                // it is fillable iff at least one field is NOT designer-owned.
                fillable: specFields.some((f) => !clauseDesignFills(clauseId).includes(f.name))
                    && !clauseIsProcessLog(clauseId)
                    && clauseCatalogueFills(clauseId).length === 0
                    && clauseProfileFills(clauseId).length === 0,
            };
        }),
    }];
    return [...assemblyGroup, ...orders.map((order, i) => {
        const isRoot = templateParentOrderHashes(order).length === 0;
        const assigned = isRoot ? leadAddress : sellerOf.get(String(order.id));
        // Fold the assigned seller's PROFILE master data (dimweight's
        // divisor, a declared credential id) onto the preview leaves —
        // the same fold the order build applies, so the buyer reviews
        // what will actually commit (and can Verify a declared
        // credential before placing the order).
        const previewClauses = fillProfileSections(
            Object.fromEntries(Object.entries(order.clauses).filter(([clauseId]) => !clauseIsMandatory(clauseId))),
            assigned ? profileValuesFor(assigned, sellerCatalogues) : undefined,
            specSource(),
        );
        // Fields the checkout walk fills MECHANICALLY (the provenance
        // anchor, the topology rewrite, …) — a buyer input the walk
        // would overwrite is a false affordance, so a clause whose
        // declared fields are ALL mechanical is not fillable. Derived
        // from the planner's own fill set, never a clause id.
        const mechanicalFields = mechanicallyFilledFieldNames(previewClauses, specSource());
        return {
            key: String(order.id ?? i),
            label: assigned ? nameOf(assigned) : "(to be assigned)",
            clauses: Object.entries(previewClauses)
                .map(([clauseId, fields]) => {
                    const specFields = getClauseSpec(clauseId)?.fields ?? [];
                    return {
                        clauseId,
                        values: clauseValueSummary(fields),
                        data: fields as Record<string, unknown>,
                        // A GENERAL clause's fields are transaction particulars
                        // the buyer authors here. Not fillable: designer-fills
                        // values (the designer's tailoring, from the template),
                        // process-log anchors (attested at runtime, empty at
                        // commit), catalogue-sourced sections (the seller's
                        // items fill them), profile-sourced sections (the
                        // seller's standing declarations fill them), and
                        // sections whose every field the walk fills
                        // mechanically. A COMPOSING clause's content fields
                        // ARE fillable — the composition surface collects
                        // only its block.runtime.fields runtime params, never its
                        // content.
                        fillable: specFields.some((f) =>
                            !clauseDesignFills(clauseId).includes(f.name) && !mechanicalFields.has(f.name))
                            && !clauseIsProcessLog(clauseId)
                            && clauseCatalogueFills(clauseId).length === 0
                            && clauseProfileFills(clauseId).length === 0,
                    };
                }),
        };
    })];
}

/**
 * The fields of a fillable clause the checkout OFFERS the buyer: the spec's own
 * fields minus the designer's tailoring (`block.design.fills`, already valued on
 * the template). ONE list — the form renders it and the place-order gate below
 * checks it, so the sign gate can never demand a term the form never offered.
 */
export function buyerAuthoredFields(clauseId: string): readonly FieldSpec[] {
    const designFills = clauseDesignFills(clauseId);
    return (getClauseSpec(clauseId)?.fields ?? []).filter((f) => !designFills.includes(f.name));
}

/** A value counts as filled when it is present and non-empty — the same
 *  emptiness the off-chain validator treats as "missing". */
export function isFilledValue(value: unknown): boolean {
    if (value === undefined || value === null || value === "") return false;
    if (Array.isArray(value)) return value.length > 0;
    if (typeof value === "object") return Object.keys(value as Record<string, unknown>).length > 0;
    return true;
}

/** Whether the buyer must author this field before the order can be signed:
 *  REQUIRED, with no spec `default` (the agreement build applies declared
 *  defaults), and of a type the form renders a control for — a `bigint` defers
 *  to its producing surface at design time, so it is never demanded here. */
function isDemandedOfBuyer(field: FieldSpec): boolean {
    if (!field.required || field.default !== undefined) return false;
    return field.type !== "bigint";
}

/** One required buyer fill still empty, named the way the buyer reads it. */
export interface MissingFill {
    groupKey: string;
    groupLabel: string;
    clauseId: string;
    clauseTitle: string;
    fieldName: string;
    fieldLabel: string;
}

/**
 * Every REQUIRED buyer-authored fill still empty across the reviewed orders —
 * the check the off-chain validator makes at the sign gate, made HERE, before
 * the wallet opens, in the buyer's own words. Without it an unfilled term
 * reaches the gate and comes back as a spec-path dump ("$.acceptanceBasis:
 * required field is missing"), which is a developer's sentence, not a buyer's.
 *
 * Spec-routed and clause-agnostic: a value already composed on the template (or
 * folded from the seller's profile) counts as filled, and a field carrying a
 * spec `default` is never demanded — the agreement build applies it.
 */
export function unfilledRequiredFills(
    groups: readonly AgreementGroup[],
    fills: Record<string, Record<string, Record<string, unknown>>>,
): MissingFill[] {
    const missing: MissingFill[] = [];
    for (const group of groups) {
        for (const clause of group.clauses) {
            if (!clause.fillable) continue;
            const values = { ...clause.data, ...(fills[group.key]?.[clause.clauseId] ?? {}) };
            for (const field of buyerAuthoredFields(clause.clauseId)) {
                if (!isDemandedOfBuyer(field)) continue;
                if (isFilledValue(values[field.name])) continue;
                missing.push({
                    groupKey: group.key,
                    groupLabel: group.label,
                    clauseId: clause.clauseId,
                    clauseTitle: getClauseSpec(clause.clauseId)?.title ?? clause.clauseId,
                    fieldName: field.name,
                    fieldLabel: field.label ?? field.name,
                });
            }
        }
    }
    return missing;
}
