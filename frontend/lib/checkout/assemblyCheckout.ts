/**
 * assemblyCheckout — the buyer-side commit sequencing for a bound assembly.
 *
 * The protocol algorithm lives in `@figaro/sdk`: `reconstructOrdersFromTemplate`
 * is the ONE template→orders walk (real parent hashes, running cumulative
 * value, root-derived processId), and the checkout planning vocabulary
 * (fill-where-composed section writers, the sub-order seller plan, live
 * contributor pricing) is `checkoutPlan`. This module is the thin frontend
 * wrapper that drives the walk with THIS surface's inputs and UX sequencing:
 *
 *   - the resolve-ceiling refusal before any signature,
 *   - per-node fills from the cart / the contributor's own catalogue,
 *   - buyer-assigned selections + on-network compositions per node,
 *   - Layer-A validation through the SAME confirm gate the seller's accept
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
    readDenominationPin,
    assertAgreementSignable,
    hashCommitmentStruct,
    profileValuesFor,
    fillCommerceSection,
    fillDerivedSections,
    fillProvenanceSection,
    generateSalt,
    planSubOrderSellers,
    reconstructOrdersFromTemplate,
    resolveSubOrderPricing,
    templateCompositionHash,
    templateParentOrderHashes,
    type AssemblyCheckoutLineItem,
    type PlannedTemplateOrder,
    type ReconstructNodeSpec,
    type ReconstructedOrder,
    type SpecSource,
} from "@figaro/sdk";
import type { CommitmentPayload } from "@figaro/sdk/agent";
import { chainDeadline, type OrderPreview } from "@/lib/checkout/orderPreview";
import { CONTRACTS } from "@/lib/kernel/contracts";
import type { ClauseFields } from "@/lib/shared/clauseFields";
import { specSource } from "@/lib/shared/clauseSpecSource";
import { parseToken } from "@/lib/shared/utils";
import { hexEqual } from "@/lib/shared/evm";
import type { BoundAssembly } from "@/lib/member/useMemberBoundAssemblies";
import type { MemberCatalogue } from "@/lib/member/types";

/** The signing capabilities the algorithm drives — provided by `useCheckout`,
 *  which backs them with the order* commitment flow. */
export interface AssemblyCheckoutDeps {
    chainId: number;
    /** Read the chain's per-process resolve ceiling (`maxOrdersResolvablePerProcess`).
     *  Checkout refuses a template that couldn't settle in one atomic
     *  `resolveProcess` — the same ceiling the designer canvas and
     *  `publishAssembly` enforce. This copy covers foreign hand-anchored
     *  templates the permissionless registry admits. */
    readResolveCap: () => Promise<number>;
    /** Sign the root and surface its payload to the share panel (no auto-relay). */
    signRoot: (preview: OrderPreview) => Promise<CommitmentPayload>;
    /** Sign + relay a sub-order to its bound seller in one step. A race-formed
     *  node passes the winner's countersignature so the relayed payload
     *  carries BOTH signatures — commit-ready on arrival. */
    signAndShare: (preview: OrderPreview, opts?: { sellerSig?: `0x${string}` }) => Promise<CommitmentPayload>;
    /** Invokes a sub-order's on-network composition (the fifth noun) — the
     *  surface routes the standard `interface` to its handler and owns the tx +
     *  receipt wait (useCompositionActions). The composition runs alongside the
     *  order's normal commit. */
    compose?: (args: {
        interface: string;
        fieldValues: Record<string, unknown>;
        processId: `0x${string}`;
        currency: `0x${string}`;
        tokenDecimals: number;
    }) => Promise<void>;
}

/** Layer A, early: surface an invalid agreement BEFORE the wallet opens. The
 *  sign step itself (`signAs`) runs the same gate — this call is the UX
 *  courtesy, not the enforcement. */
function assertValidToSign(preview: OrderPreview, label: string): void {
    assertAgreementSignable(preview.agreement, preview.agreementHash, specSource(), label);
}

/** The entries the fills actually CHANGED — passed to the walk as overrides so
 *  the untouched clauses (topology above all, whose template-local parent ids
 *  the walk itself rewrites to real hashes) stay the walk's to complete. */
function changedClauses(filled: ClauseFields, original: ClauseFields): ClauseFields {
    const out: ClauseFields = {};
    for (const [clauseId, data] of Object.entries(filled)) {
        if (data !== original[clauseId]) out[clauseId] = data;
    }
    return out;
}

/** The buyer-side checkout inputs — ONE shape shared by the effectful walk
 *  (`executeAssemblyCheckout`) and the dry planner (`planAssemblyOrders`), so
 *  a race draft and its realized order are built from identical inputs. */
export interface AssemblyCheckoutParams {
    buyer: `0x${string}`;
    leadSellerAddress: `0x${string}`;
    currency: `0x${string}`;
    /** The lead order's payment — the cart total. */
    payment: bigint;
    lineItems: AssemblyCheckoutLineItem[];
    assembly: BoundAssembly;
    /** Contributor pricing context (each sub-order is priced LIVE from its
     *  own seller's catalogue). */
    sellerCatalogues: MemberCatalogue[];
    tokenDecimals: number;
    /** The buyer's checkout-time counterparty choices, keyed by template
     *  node id — fills sub-orders the adopting seller's profile leaves
     *  unbound (buyer-assigned coordination). The price is the picker's
     *  resolved figure and `item` the picked catalogue item (it becomes
     *  the sub-order's commerce line item). Checkout-phase data, like the
     *  cart — never design-time clause activation. */
    subOrderSelections?: Record<string, {
        seller: `0x${string}`;
        price: string;
        item: { id: string; name: string };
    }>;
    /** On-network compositions (the fifth noun) keyed by template node id:
     *  the composing clause's `interface` (from `block.design.composes`) plus the
     *  buyer's `block.runtime.fields` values collected at checkout. The composition
     *  runs alongside the order's normal commit. Interface-agnostic — the
     *  walk names no clause. */
    subOrderCompositions?: Record<string, { interface: string; fieldValues: Record<string, unknown> }>;
    /** The buyer's checkout-entered units per template node id — the
     *  "checkout-quantity" rate source's input (hours, seats, …). Only
     *  read for a node whose contributor prices by such a rate. */
    subOrderQuantities?: Record<string, number>;
    /** The buyer's checkout-time GENERAL-clause field fills, keyed by
     *  template node id → clauseId → field values. Design time is
     *  structural (ruled 2026-07-14): a general clause arrives from the
     *  template as `{}` and its transaction particulars are authored
     *  HERE. Specific-T&C values (consent's affix) come from the template
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
    /** The dispatch race's collected artifacts, keyed by template node id:
     *  the drafted struct's hash and the winning candidate's
     *  countersignature. At realization the walk asserts the rebuilt struct
     *  hashes to EXACTLY the drafted one — a silent mismatch would discard
     *  the winner's signature — then relays the sub-order carrying both
     *  signatures, so it arrives commit-ready. */
    subOrderRace?: Record<string, { structHash: `0x${string}`; sellerSig: `0x${string}` }>;
}

export async function executeAssemblyCheckout(
    params: AssemblyCheckoutParams,
    deps: AssemblyCheckoutDeps,
): Promise<void> {
    const { buyer, currency, assembly } = params;
    const { signRoot, signAndShare } = deps;
    const specs = specSource();
    const template = assembly.assemblyTemplate;

    // DENOMINATION VERIFICATION (ruled 2026-07-28): when the assembly pins
    // its settlement token (an assembly-scoped term, part of the
    // compositionHash), the commitment currency MUST be that token — refuse
    // before any signature rather than let the signed struct contradict the
    // signed term.
    const pin = readDenominationPin(template.assemblyClauses ?? {}, specs);
    if (pin && !hexEqual(pin, currency)) {
        throw new Error(
            `this assembly is denominated by design (${pin}); the commitment currency ${currency} contradicts the pinned term`,
        );
    }

    if (!CONTRACTS.core) {
        throw new Error("Core contract address is not configured, so orders cannot be built.");
    }
    const core = CONTRACTS.core as `0x${string}`;

    // Resolve-ceiling refusal BEFORE any signature: a process grown past the
    // chain's atomic-resolve cap can never settle, so the buyer must not bond
    // into one. Publish-side already refuses over-cap templates authored here;
    // this catches templates anchored by other clients (the registry is
    // permissionless).
    const orderCount = template.agreements.length;
    const resolveCap = await deps.readResolveCap();
    if (orderCount > resolveCap) {
        throw new Error(
            `This assembly composes ${orderCount} orders; this chain settles at most ` +
                `${resolveCap} in one atomic resolveProcess. It can never settle as one ` +
                `process — the designer must compose multiple processes instead.`,
        );
    }

    const rootId =
        template.agreements.find((o) => templateParentOrderHashes(o).length === 0)?.id ??
        template.agreements[0]?.id;
    if (rootId === undefined) throw new Error("This assembly has no root order.");

    // A profile binding designates each sub-order's counterparty (the
    // per-clause cursor); a node the profile leaves unbound takes the buyer's
    // checkout-time choice.
    const boundSellerByNode = new Map(
        planSubOrderSellers(assembly).map(({ node, seller }) => [node.id, seller]),
    );

    // Per-node state the realization callbacks share: the sub's line items are
    // decided at pricing time (nodes) and folded/committed at realization
    // (the walk's agreement build).
    const compositionByNode = new Map<string, { interface: string; fieldValues: Record<string, unknown> }>();
    const deadline = params.deadline ?? await chainDeadline();
    let rootPreview: OrderPreview | null = null;

    const previewOf = (order: ReconstructedOrder): OrderPreview => ({
        agreement: order.agreement,
        agreementHash: order.agreementHash,
        commitment: order.commitment,
    });

    await reconstructOrdersFromTemplate(template, {
        buyer,
        currency,
        chainId: deps.chainId,
        core,
        specs,
        salt: params.salt ?? (() => generateSalt()),
        deadline,
        nodes: checkoutNodes(params, { rootId, boundSellerByNode, compositionByNode, specs }),
        onOrder: async (order) => {
            const preview = previewOf(order);
            if (order.nodeId === rootId) {
                // Root: validate now (before any sub signs), sign LAST — the
                // share panel shows the root for the buyer to relay to the
                // lead. The lead accepts → root commits → the already-shared
                // sub-orders unlock for their sellers to accept.
                assertValidToSign(preview, "This order");
                rootPreview = preview;
                return;
            }
            // On-network composition (fifth noun): a sub-order whose clause
            // declares `block.design.composes` invokes the composed contract ALONGSIDE
            // its normal commit — the interface is routed to its handler by the
            // surface (`deps.compose`); the walk names no clause.
            const composition = compositionByNode.get(order.nodeId);
            if (composition) {
                if (!deps.compose) {
                    throw new Error("This assembly composes an on-network contract for a sub-order, but no composition mechanism is available.");
                }
                await deps.compose({
                    interface: composition.interface,
                    fieldValues: composition.fieldValues,
                    processId: order.processId,
                    currency,
                    tokenDecimals: params.tokenDecimals,
                });
            }
            assertValidToSign(preview, "A sub-order");
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
            await signAndShare(preview, race ? { sellerSig: race.sellerSig } : undefined);
        },
    });

    if (!rootPreview) throw new Error("This assembly has no root order.");
    await signRoot(rootPreview);
}

/**
 * The per-node seller/payment/overrides resolution — ONE resolution shared by
 * the effectful walk above and the dry planner below, so a race draft and its
 * realized order are the same struct by construction.
 */
function checkoutNodes(
    params: AssemblyCheckoutParams,
    ctx: {
        rootId: string;
        boundSellerByNode: Map<string, `0x${string}` | null>;
        compositionByNode: Map<string, { interface: string; fieldValues: Record<string, unknown> }>;
        specs: SpecSource;
    },
): (planned: PlannedTemplateOrder) => ReconstructNodeSpec {
    const { rootId, boundSellerByNode, compositionByNode, specs } = ctx;
    const { leadSellerAddress, payment, lineItems, sellerCatalogues, tokenDecimals, subOrderSelections } = params;
    const template = params.assembly.assemblyTemplate;
    return (planned) => {
        const node = template.agreements.find((a) => a.id === planned.nodeId)!;
        if (planned.nodeId === rootId) {
            // The root's clause map: the derived LOGISTICS sections (cargo /
            // class leaves / dimweight) filled from the cart — wherever
            // composed, by declared field, never by clause name — then the
            // settlement terms. `currency` is the ONE process currency (the
            // kernel enforces single-denomination, FigaroCore
            // CurrencyMismatch), never a per-order input.
            const filled = fillProvenanceSection(
                fillCommerceSection(
                    fillDerivedSections(
                        { ...node.clauses, ...(params.clauseFills?.[planned.nodeId] ?? {}) },
                        lineItems, specs,
                        profileValuesFor(leadSellerAddress, sellerCatalogues),
                    ),
                    payment, specs, lineItems,
                ),
                templateCompositionHash(template), specs,
            );
            return {
                seller: leadSellerAddress,
                payment,
                overrides: changedClauses(filled, node.clauses),
            };
        }

        const boundSeller = boundSellerByNode.get(planned.nodeId) ?? null;
        const composition = boundSeller ? undefined : params.subOrderCompositions?.[planned.nodeId];
        if (composition) compositionByNode.set(planned.nodeId, composition);
        const selection = boundSeller ? undefined : subOrderSelections?.[planned.nodeId];
        const subSeller = boundSeller ?? selection?.seller ?? null;
        if (!subSeller) {
            throw new Error("This assembly has a sub-order with no counterparty — the seller's profile must designate one, or the buyer chooses one at checkout.");
        }
        // The buyer's checkout fills join the node's clauses BEFORE pricing:
        // a rate quantity source (e.g. order-geodistance) derives from the
        // clause content, and the template arrives value-free by
        // construction — the fills ARE the content.
        const nodeClauses = { ...node.clauses, ...(params.clauseFills?.[planned.nodeId] ?? {}) };
        const pricing = selection
            ? null
            : resolveSubOrderPricing({
                node: { ...node, clauses: nodeClauses },
                seller: subSeller, sellerCatalogues, tokenDecimals, specs,
                checkoutQuantity: params.subOrderQuantities?.[planned.nodeId],
            });
        if (pricing?.issue === "unresolvable-quantity") {
            throw new Error(
                `"${pricing.item?.name}" prices by rate but its quantity can't be resolved on this order — the quantity source ("${pricing.item?.rateQuantitySource}") found no value.`,
            );
        }
        const subPayment = selection
            ? parseToken(selection.price, tokenDecimals)
            : pricing!.payment;
        // The sub-order's commerce section states WHAT the payment buys: the
        // contributor's resolved catalogue item (the same item the payment
        // was priced from), or the buyer's picked item on the unbound path.
        // The commerce clause requires lineItems on EVERY order, subs
        // included. Rate items commit their derivation: quantity = billed
        // units (per started unit), unitPrice = the rate — quantity ×
        // unitPrice replays the payment from the committed leaf alone.
        const subLineItems: AssemblyCheckoutLineItem[] | undefined = selection
            ? [{ itemId: selection.item.id, name: selection.item.name, quantity: 1, unitPrice: subPayment.toString() }]
            : pricing!.item
                ? [{
                    itemId: pricing!.item.id,
                    name: pricing!.item.name,
                    quantity: pricing!.billedQuantity,
                    unitPrice: pricing!.unitPrice.toString(),
                    massGrams: pricing!.item.massGrams,
                    volumeMl: pricing!.item.volumeMl,
                    lengthMm: pricing!.item.lengthMm,
                    widthMm: pricing!.item.widthMm,
                    heightMm: pricing!.item.heightMm,
                    clauseValues: pricing!.item.clauseValues,
                }]
                : undefined;
        // Same fill-where-composed as the root: this sub-order's own
        // logistics leaves (cargo / class / dimweight) from its own
        // catalogue item + its own seller's profile values. A no-op for orders
        // composing none (e.g. a service leg) → G7 absence. The topology
        // section is the WALK's to complete (template-local parent ids →
        // real order hashes), so it is never in the overrides.
        const filled = fillProvenanceSection(
            fillCommerceSection(
                fillDerivedSections(
                    { ...nodeClauses },
                    subLineItems ?? [], specs,
                    profileValuesFor(subSeller, sellerCatalogues),
                ),
                subPayment, specs, subLineItems,
            ),
            templateCompositionHash(template), specs,
        );
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
export async function planAssemblyOrders(
    params: AssemblyCheckoutParams & { salt: (nodeId: string) => bigint; deadline: bigint },
    opts: { chainId: number },
): Promise<ReconstructedOrder[]> {
    if (!CONTRACTS.core) {
        throw new Error("Core contract address is not configured, so orders cannot be built.");
    }
    const template = params.assembly.assemblyTemplate;
    const rootId =
        template.agreements.find((o) => templateParentOrderHashes(o).length === 0)?.id ??
        template.agreements[0]?.id;
    if (rootId === undefined) throw new Error("This assembly has no root order.");
    const boundSellerByNode = new Map(
        planSubOrderSellers(params.assembly).map(({ node, seller }) => [node.id, seller]),
    );
    const specs = specSource();
    return reconstructOrdersFromTemplate(template, {
        buyer: params.buyer,
        currency: params.currency,
        chainId: opts.chainId,
        core: CONTRACTS.core as `0x${string}`,
        specs,
        salt: params.salt,
        deadline: params.deadline,
        nodes: checkoutNodes(params, { rootId, boundSellerByNode, compositionByNode: new Map(), specs }),
    });
}
