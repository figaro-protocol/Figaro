/**
 * assemblyCheckout — the buyer-side commit sequencing for a bound assembly.
 *
 * The protocol algorithm lives in `@figaro-protocol/sdk`: `reconstructOrdersFromProcessDesign`
 * is the ONE assembly→orders walk (real parent hashes, running cumulative
 * value, root-derived processId), and the checkout planning vocabulary
 * (fill-where-composed clause writers, the sub-order seller plan, live
 * contributor pricing) is `checkoutPlan`. This module is the thin frontend
 * wrapper that drives the walk with THIS surface's inputs and UX sequencing:
 *
 *   - the resolve-ceiling refusal before any signature,
 *   - per-node fills from the cart / the contributor's own catalog,
 *   - buyer-assigned selections per node,
 *   - off-chain validation through the SAME confirm gate the seller's accept
 *     uses (no checkout-only bypass),
 *   - sub-orders signed + relayed as the walk realizes them; the ROOT signed
 *     LAST and surfaced to the share panel (the walk emits it first — its
 *     preview is stashed and signed after the subs), so the sellers' accepts
 *     self-serialize root-first.
 *
 * The UI surface (`CheckoutView`) keeps only wallet/cart guards and error
 * display. Throws Error with a user-facing message on any failure — the
 * caller renders it.
 */

import {
    readUtilityTokenPin,
    assertAgreementSignable,
    hashCommitmentStruct,
    profileValuesFor,
    fillPricedLines,
    fillDerivedClauses,
    generateSalt,
    missingCatalogueMeasures,
    planProcessOrders as planAssemblyNodes,
    planSubOrderSellers,
    reconstructOrdersFromProcessDesign,
    resolveSubOrderPricing,
    agreementClauses,
    processDesignFollows,
    publicForm,
    type Agreement,
    type ProcessCheckoutLineItem,
    type HydratedProcessDesign,
    type PlannedProcessOrder,
    type ReconstructNodeSpec,
    type ReconstructedOrder,
    type ResolutionUniverse,
    type SpecSource,
} from "@figaro-protocol/sdk";
import type { CommitmentPayload } from "@figaro-protocol/sdk/agent";
import { chainDeadline, type OrderPreview } from "@/lib/checkout/orderPreview";
import { CONTRACTS } from "@/lib/core/contracts";
import { pathContract } from "@/lib/core/signedCommitment";
import type { ClauseFields } from "@/lib/shared/clauseFields";
import { specSource } from "@/lib/shared/clauseSpecSource";
import { parseToken } from "@/lib/shared/utils";
import { hexEqual } from "@/lib/shared/evm";
import type { BoundAssembly } from "@/lib/registries/useMemberBoundAssemblies";
import type { MemberCatalog } from "@/lib/registries/types";

/** The signing capabilities the algorithm drives — provided by `useCheckout`,
 *  which backs them with the order* commitment flow. */
export interface AssemblyCheckoutDeps {
    chainId: number;
    /** Read the chain's per-process resolve ceiling (`maxOrdersResolvablePerProcess`).
     *  Checkout refuses a assembly that couldn't resolve in one atomic
     *  `resolveProcess` — the same ceiling the designer canvas and
     *  `publishAssembly` enforce. This copy covers foreign hand-anchored
     *  assemblies the permissionless registry admits. */
    readResolveCap: () => Promise<number>;
    /** Sign the root and surface its payload to the share panel (no auto-relay). */
    signRoot: (preview: OrderPreview) => Promise<CommitmentPayload>;
    /** Sign + relay a sub-order to its bound seller in one step. A race-formed
     *  node passes the winner's countersignature so the relayed payload
     *  carries BOTH signatures — commit-ready on arrival. */
    signAndShare: (preview: OrderPreview, opts?: { sellerSig?: `0x${string}` }) => Promise<CommitmentPayload>;
    /** Runs once every order of the checkout is built and checked, before
     *  the first signature, with every order (the sub-orders in walk order,
     *  the root last). The buyer's swap legs are quoted here
     *  (`quoteBuyerFunding`), so a leg the allowance cannot cover refuses the
     *  checkout before anything is signed. */
    prepareSignatures?: (previews: OrderPreview[]) => Promise<void>;
}

/** Off-chain validation, early: surface an invalid agreement BEFORE the wallet opens. The
 *  sign step itself (`signAs`) runs the same gate — this call is the UX
 *  courtesy, not the enforcement. */
function assertValidToSign(preview: OrderPreview, design: HydratedProcessDesign, label: string): void {
    assertAgreementSignable(preview.agreement, preview.checkoutHash, specSource(), preview.commitment, design, label);
}

/** The entries the fills actually CHANGED — passed to the walk as overrides so
 *  the untouched clauses stay the walk's to complete. */
function changedClauses(filled: ClauseFields, original: ClauseFields): ClauseFields {
    const out: ClauseFields = {};
    for (const [clauseId, data] of Object.entries(filled)) {
        if (data !== original[clauseId]) out[clauseId] = data;
    }
    return out;
}

/** Refuse an order whose catalog items do not supply a REQUIRED measure a
 *  composed clause reads from them (`block.checkout.catalogueMeasures`): the
 *  measure stays missing, nothing invents it, and the buyer reads which
 *  measure is missing — the same refusal as a rate quantity that does not
 *  resolve, before any signature. Named from the clause's own spec. With a
 *  `report` sink (the page's read before the click, `checkoutMeasureRefusals`)
 *  the sentence goes to the sink and the walk resolves on. */
function refuseMissingMeasures(filled: ClauseFields, specs: SpecSource, report?: (refusal: string) => void): void {
    const [missing] = missingCatalogueMeasures(filled, specs);
    if (!missing) return;
    const spec = specs.get(missing.clauseKey);
    const field = spec?.fields.find((f) => f.name === missing.field);
    const refusal = `This order's "${spec?.title ?? missing.clauseKey}" term needs "${field?.label ?? missing.field}", `
        + `which it reads from each catalog item's "${missing.from}" — and the items on this order don't supply it. `
        + `The seller's catalog must state it before this order can be placed.`;
    if (report) report(refusal);
    else throw new Error(refusal);
}

/**
 * The walk's missing-measure refusals, read before the click: the SAME
 * per-node resolution as `executeAssemblyCheckout` (`checkoutNodes`), run
 * over the assembly's planned orders with no signature, collecting each
 * order's sentence instead of throwing. A node the walk cannot resolve for
 * another reason contributes nothing here: its refusal is the breakdown
 * row's (`deriveKitBreakdown`) or the co-seller pick the button already
 * waits for. Empty when every required measure is supplied.
 */
export function checkoutMeasureRefusals(params: Omit<AssemblyCheckoutParams, "buyer">): string[] {
    const hydrated = params.assembly.hydratedAssembly;
    const assembly = hydrated.assembly;
    const rootId =
        assembly.agreements.find((o) => processDesignFollows(o).length === 0)?.id ??
        assembly.agreements[0]?.id;
    if (rootId === undefined) return [];
    let planned: PlannedProcessOrder[];
    let boundSellerByNode: Map<string, { seller: `0x${string}` | null; itemId: string | null }>;
    try {
        planned = planAssemblyNodes(hydrated);
        boundSellerByNode = new Map(
            planSubOrderSellers(params.assembly).map(({ node, seller, itemId }) => [node.nodeId, { seller, itemId }]),
        );
    } catch {
        // An assembly the walk cannot plan is refused by the walk itself.
        return [];
    }
    const refusals: string[] = [];
    const nodes = checkoutNodes(params, {
        rootId, boundSellerByNode, specs: specSource(),
        onMissingMeasure: (refusal) => refusals.push(refusal),
    });
    for (const order of planned) {
        try { nodes(order); } catch { /* another refusal, shown where it is owned */ }
    }
    return refusals;
}

/** The buyer-side checkout inputs — ONE shape shared by the effectful walk
 *  (`executeAssemblyCheckout`) and the dry planner (`planProcessOrders`), so
 *  a race draft and its realized order are built from identical inputs. */
export interface AssemblyCheckoutParams {
    buyer: `0x${string}`;
    leadSellerAddress: `0x${string}`;
    currency: `0x${string}`;
    /** The lead order's payment — the cart total. */
    payment: bigint;
    lineItems: ProcessCheckoutLineItem[];
    assembly: BoundAssembly;
    /** Contributor pricing context (each sub-order is priced LIVE from its
     *  own seller's catalog). */
    sellerCatalogs: MemberCatalog[];
    tokenDecimals: number;
    /** The buyer's checkout-time co-seller choices, keyed by assembly
     *  node id — fills sub-orders the adopting seller's profile leaves
     *  unbound (buyer-assigned coordination). The price is the picker's
     *  resolved figure and `item` the picked catalog item (it becomes
     *  the sub-order's priced line). Checkout-phase data, like the
     *  cart — never design-time clause activation. */
    subOrderSelections?: Record<string, {
        seller: `0x${string}`;
        price: string;
        item: { id: string; name: string };
    }>;
    /** The buyer's checkout-entered units per assembly node id — the
     *  "checkout-quantity" rate source's input (hours, seats, …). Only
     *  read for a node whose contributor prices by such a rate. */
    subOrderQuantities?: Record<string, number>;
    /** The buyer's amount per unit, in the process denomination, for a bound
     *  sub-order whose seller lists its catalog item in another token, keyed
     *  by assembly node id: it replaces the listed unit price, the billed
     *  quantity stands, and the payment is their product. */
    subOrderUnitPrices?: Record<string, bigint>;
    /** The buyer's checkout-time GENERAL-clause field fills, keyed by
     *  assembly node id → clause key → field values. Design time is
     *  structural: a general clause arrives from the
     *  assembly as `{}` and its transaction particulars are filled
     *  HERE. Specific-T&C values (consent's affix) come from the assembly
     *  and are never overridden by this map. Spec-routed — no clause is
     *  named. */
    clauseFills?: Record<string, Record<string, Record<string, unknown>>>;
    /** Per-node salt override. The dispatch race fixes EVERY node's salt so
     *  the final walk reproduces the exact structs its drafts carried — a
     *  node's struct depends on its parents' order hashes, which depend on
     *  their salts, so reproduction needs the whole map, never just the
     *  raced node's. Omit for the normal fresh-salt walk. Checkout-time
     *  state, never stored. */
    salt?: (nodeId: string) => bigint;
    /** Walk-wide deadline override — fixed at draft time by the race for the
     *  same reproduction reason. Omit to take a fresh chain deadline. */
    deadline?: bigint;
    /** The dispatch race's collected artifacts, keyed by assembly node id:
     *  the drafted struct's hash and the winning candidate's
     *  countersignature. At realization the walk asserts the rebuilt struct
     *  hashes to EXACTLY the drafted one — a silent mismatch would discard
     *  the winner's signature — then relays the sub-order carrying both
     *  signatures, so it arrives commit-ready. */
    subOrderRace?: Record<string, { structHash: `0x${string}`; sellerSig: `0x${string}` }>;
    /** The path the buyer picked (`offeredPaths`); absent, the direct path.
     *  Every order of the process is built and signed under its contract's
     *  domain, so every order id and the process id are that path's. A
     *  dispatch race drafts on the direct path alone. */
    path?: ResolutionUniverse;
}

export async function executeAssemblyCheckout(
    params: AssemblyCheckoutParams,
    deps: AssemblyCheckoutDeps,
): Promise<void> {
    const { buyer, currency, assembly: bound } = params;
    const { signRoot, signAndShare } = deps;
    const specs = specSource();
    const hydrated = bound.hydratedAssembly;
    const assembly = hydrated.assembly;

    // UTILITY-TOKEN PIN VERIFICATION: when the assembly pins
    // its denomination (an assembly-scoped term, part of the
    // processDesignHash), the commitment currency MUST be that token — refuse
    // before any signature rather than let the signed struct contradict the
    // signed term.
    const pin = readUtilityTokenPin(assembly.assemblyClauses ?? {}, specs);
    if (pin && !hexEqual(pin, currency)) {
        throw new Error(
            `this assembly is denominated by design (${pin}); the commitment currency ${currency} contradicts the pinned term`,
        );
    }

    if (!CONTRACTS.core) {
        throw new Error("Core contract address is not configured, so orders cannot be built.");
    }
    const path = params.path ?? "direct";
    if (path === "batch" && params.subOrderRace && Object.keys(params.subOrderRace).length > 0) {
        throw new Error("A dispatch race drafts its orders on the direct path, so its winner cannot be committed on the batch path. Pick the direct path, or skip the race.");
    }
    const core = pathContract(path);

    // Resolve-ceiling refusal BEFORE any signature: a process grown past the
    // chain's atomic-resolve cap can never resolve, so the buyer must not bond
    // into one. Publish-side already refuses over-cap assemblies composed here;
    // this catches assemblies anchored by other clients (the registry is
    // permissionless).
    const orderCount = assembly.agreements.length;
    const resolveCap = await deps.readResolveCap();
    if (orderCount > resolveCap) {
        throw new Error(
            `This assembly composes ${orderCount} orders; ${resolveCap} is the most the SDK ` +
                `plans to fit in one atomic resolveProcess on this chain (its own estimate from ` +
                `the block's gas limit, not a limit the chain enforces). The designer must ` +
                `compose multiple processes instead.`,
        );
    }

    const rootId =
        assembly.agreements.find((o) => processDesignFollows(o).length === 0)?.id ??
        assembly.agreements[0]?.id;
    if (rootId === undefined) throw new Error("This assembly has no root order.");

    // A profile binding designates each sub-order's co-seller (the
    // per-clause cursor); a node the profile leaves unbound takes the buyer's
    // checkout-time choice.
    const boundSellerByNode = new Map(
        planSubOrderSellers(bound).map(({ node, seller, itemId }) => [node.nodeId, { seller, itemId }]),
    );

    // Per-node state the realization callbacks share: the sub's line items are
    // decided at pricing time (nodes) and folded/committed at realization
    // (the walk's agreement build).
    const deadline = params.deadline ?? await chainDeadline();
    let rootPreview: OrderPreview | null = null;
    // The sub-orders in walk order, signed and relayed once every order is
    // built; a race-formed one carries the winner's countersignature.
    const subOrders: { preview: OrderPreview; sellerSig?: `0x${string}` }[] = [];

    // Each order's agreement in its public form, by order hash (lowercased):
    // a sub-order's preview carries those of the orders it follows, so its
    // seller can check its edges against the design (`followedOrderIssues`).
    // The walk realizes parents before children, so each is here in time.
    const publicByOrderHash = new Map<string, Agreement>();
    const previewOf = (order: ReconstructedOrder): OrderPreview => {
        publicByOrderHash.set(order.orderHash.toLowerCase(), publicForm(order.agreement, specs));
        const followed = (order.agreement.follows ?? [])
            .map((edge) => publicByOrderHash.get(edge.toLowerCase()))
            .filter((a): a is Agreement => a !== undefined);
        return {
            agreement: order.agreement,
            checkoutHash: order.checkoutHash,
            commitment: order.commitment,
            ...(followed.length > 0 && { followed }),
            ...(path === "batch" && { path }),
        };
    };

    await reconstructOrdersFromProcessDesign(hydrated, {
        buyer,
        currency,
        chainId: deps.chainId,
        core,
        specs,
        salt: params.salt ?? (() => generateSalt()),
        deadline,
        nodes: checkoutNodes(params, { rootId, boundSellerByNode, specs }),
        onOrder: async (order) => {
            const preview = previewOf(order);
            if (order.nodeId === rootId) {
                // Root: validate now (before any sub signs), sign LAST — the
                // share panel shows the root for the buyer to relay to the
                // lead. The lead accepts → root commits → the already-shared
                // sub-orders unlock for their sellers to accept.
                assertValidToSign(preview, hydrated, "This order");
                rootPreview = preview;
                return;
            }
            assertValidToSign(preview, hydrated, "A sub-order");
            // A race-formed node: the winner already countersigned the drafted
            // struct, so the rebuilt struct must hash to EXACTLY the drafted
            // one — a mismatch means the walk inputs drifted from draft time,
            // and relaying would silently discard the winner's signature.
            const race = params.subOrderRace?.[order.nodeId];
            if (race && hashCommitmentStruct(order.commitment) !== race.structHash) {
                throw new Error(
                    "The rebuilt sub-order does not match the struct the race winner countersigned — refusing to relay. The checkout inputs must reproduce the drafted struct exactly (same salts, deadline, selections, and fills).",
                );
            }
            subOrders.push({ preview, sellerSig: race?.sellerSig });
        },
    });

    if (!rootPreview) throw new Error("This assembly has no root order.");
    // Every order is built and checked before the first signature, so a
    // refusal of any of them — its swap leg's included — signs nothing.
    await deps.prepareSignatures?.([...subOrders.map((s) => s.preview), rootPreview]);
    for (const { preview, sellerSig } of subOrders) {
        await signAndShare(preview, sellerSig ? { sellerSig } : undefined);
    }
    await signRoot(rootPreview);
}

/**
 * The per-node seller/payment/overrides resolution — ONE resolution shared by
 * the effectful walk above and the dry planner below, so a race draft and its
 * realized order are the same struct by construction.
 */
function checkoutNodes(
    params: Omit<AssemblyCheckoutParams, "buyer">,
    ctx: {
        rootId: string;
        /** Each sub-order's bound co-seller and the item the binding names
         *  for it in that co-seller's own catalog (null when none). */
        boundSellerByNode: Map<string, { seller: `0x${string}` | null; itemId: string | null }>;
        specs: SpecSource;
        /** Collects a missing-measure refusal instead of throwing it
         *  (`checkoutMeasureRefusals`); absent on every signing walk. */
        onMissingMeasure?: (refusal: string) => void;
    },
): (planned: PlannedProcessOrder) => ReconstructNodeSpec {
    const { rootId, boundSellerByNode, specs, onMissingMeasure } = ctx;
    const { leadSellerAddress, payment, lineItems, sellerCatalogs, tokenDecimals, subOrderSelections } = params;
    const hydrated = params.assembly.hydratedAssembly;
    return (planned) => {
        // The agreement's own clauses — its registered agreement's, with the
        // agreement's fills merged over them — never the assembly-scoped
        // terms the walk folds into every order.
        const entry = hydrated.assembly.agreements.find((a) => a.id === planned.nodeId)!;
        const node = { clauses: agreementClauses(hydrated, entry) };
        if (planned.nodeId === rootId) {
            // The root's clause map: the derived LOGISTICS clauses (cargo /
            // class leaves / dimweight) filled from the cart — wherever
            // composed, by declared field, never by clause name — then the
            // cart's line items, where a clause declaring them is composed.
            // The payment (the cart total) and the token go into the
            // commitment only.
            const filled = fillPricedLines(
                fillDerivedClauses(
                    { ...node.clauses, ...(params.clauseFills?.[planned.nodeId] ?? {}) },
                    lineItems, specs,
                    profileValuesFor(leadSellerAddress, sellerCatalogs),
                ),
                specs, lineItems,
            );
            refuseMissingMeasures(filled, specs, onMissingMeasure);
            return {
                seller: leadSellerAddress,
                payment,
                overrides: changedClauses(filled, node.clauses),
            };
        }

        const bound = boundSellerByNode.get(planned.nodeId);
        const boundSeller = bound?.seller ?? null;
        const selection = boundSeller ? undefined : subOrderSelections?.[planned.nodeId];
        const subSeller = boundSeller ?? selection?.seller ?? null;
        if (!subSeller) {
            throw new Error("This assembly has a sub-order with no co-seller — the seller's profile must designate one, or the buyer chooses one at checkout.");
        }
        // The buyer's checkout fills join the node's clauses BEFORE pricing:
        // a rate quantity source (e.g. order-geodistance) derives from the
        // clause content, and the assembly arrives value-free by
        // construction — the fills ARE the content.
        const nodeClauses = { ...node.clauses, ...(params.clauseFills?.[planned.nodeId] ?? {}) };
        const pricing = selection
            ? null
            : resolveSubOrderPricing({
                node: { clauses: nodeClauses },
                seller: subSeller, sellerCatalogs, tokenDecimals, specs,
                checkoutQuantity: params.subOrderQuantities?.[planned.nodeId],
                itemId: bound?.itemId ?? undefined,
            });
        // The item the binding names is gone from the co-seller's catalog
        // (deleted, re-added under a new id, or marked unavailable): refuse,
        // never price another item in its place nor commit a payment of zero.
        if (pricing?.issue === "named-item-not-offered") {
            throw new Error(
                `The seller named the item "${bound?.itemId}" from ${subSeller} for this order, and that catalog no longer offers it.`,
            );
        }
        if (pricing?.issue === "unresolvable-quantity") {
            throw new Error(
                `"${pricing.item?.name}" prices by rate but its quantity can't be resolved on this order — the quantity source ("${pricing.item?.rateQuantitySource}") found no value.`,
            );
        }
        // No item to price the order from: the co-seller's catalog was not
        // read, or it offers no available item. Refuse here, never commit a
        // payment of zero for the sign gate to catch.
        if (pricing?.issue === "no-item") {
            throw new Error(
                `The co-seller ${subSeller} offers no available catalog item to price this order, or its catalog could not be read.`,
            );
        }
        const translatedUnit = pricing?.item && !pricing.issue ? params.subOrderUnitPrices?.[planned.nodeId] : undefined;
        const unitPrice = translatedUnit ?? pricing?.unitPrice ?? 0n;
        const subPayment = selection
            ? parseToken(selection.price, tokenDecimals)
            : translatedUnit !== undefined
                ? translatedUnit * BigInt(pricing!.billedQuantity)
                : pricing!.payment;
        // Where a clause marking priced lines (`block.checkout.pricedLines`) is composed, the sub-order
        // commits WHAT the payment buys: the contributor's resolved catalog
        // item (the same item the payment was priced from), or the buyer's
        // picked item on the unbound path. Rate items commit their
        // derivation: quantity = billed units (per started unit), unitPrice =
        // the rate — so quantity × unitPrice replays the payment from the
        // committed leaf alone. That replay holds only where such a clause is
        // composed: an agreement without one commits the payment in the
        // commitment and no line from which to replay it.
        const subLineItems: ProcessCheckoutLineItem[] | undefined = selection
            ? [{ itemId: selection.item.id, name: selection.item.name, quantity: 1, unitPrice: subPayment.toString() }]
            : pricing!.item
                ? [{
                    itemId: pricing!.item.id,
                    name: pricing!.item.name,
                    quantity: pricing!.billedQuantity,
                    unitPrice: unitPrice.toString(),
                    catalogItem: pricing!.item,
                    clauseValues: pricing!.item.clauseValues,
                }]
                : undefined;
        // Same fill-where-composed as the root: this sub-order's own
        // logistics leaves (cargo / class / dimweight) from its own
        // catalog item + its own seller's profile values. A no-op for orders
        // composing none (e.g. a service leg) → G7 absence. The topology
        // is the agreement format's leaf, which the WALK writes
        // (assembly-local parent ids → real order hashes), never a clause.
        const filled = fillPricedLines(
            fillDerivedClauses(
                { ...nodeClauses },
                subLineItems ?? [], specs,
                profileValuesFor(subSeller, sellerCatalogs),
            ),
            specs, subLineItems,
        );
        refuseMissingMeasures(filled, specs, onMissingMeasure);
        return {
            seller: subSeller,
            payment: subPayment,
            overrides: changedClauses(filled, node.clauses),
        };
    };
}

/**
 * The DRY walk — the same per-node resolution as `executeAssemblyCheckout`,
 * with no signatures, no relays, and no resolve-cap check (nothing binds
 * here; the effectful walk still enforces the ceiling before any signature).
 * The dispatch race drafts with it: one call per candidate, that candidate as
 * the raced node's selection, fixed salts + deadline — and the raced node's
 * `ReconstructedOrder` is the unsigned draft the candidate countersigns.
 */
export async function planProcessOrders(
    params: AssemblyCheckoutParams & { salt: (nodeId: string) => bigint; deadline: bigint },
    opts: { chainId: number },
): Promise<ReconstructedOrder[]> {
    if (!CONTRACTS.core) {
        throw new Error("Core contract address is not configured, so orders cannot be built.");
    }
    const hydrated = params.assembly.hydratedAssembly;
    const assembly = hydrated.assembly;
    const rootId =
        assembly.agreements.find((o) => processDesignFollows(o).length === 0)?.id ??
        assembly.agreements[0]?.id;
    if (rootId === undefined) throw new Error("This assembly has no root order.");
    const boundSellerByNode = new Map(
        planSubOrderSellers(params.assembly).map(({ node, seller, itemId }) => [node.nodeId, { seller, itemId }]),
    );
    const specs = specSource();
    return reconstructOrdersFromProcessDesign(hydrated, {
        buyer: params.buyer,
        currency: params.currency,
        chainId: opts.chainId,
        core: CONTRACTS.core as `0x${string}`,
        specs,
        salt: params.salt,
        deadline: params.deadline,
        nodes: checkoutNodes(params, { rootId, boundSellerByNode, specs }),
    });
}
