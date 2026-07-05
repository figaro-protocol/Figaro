/**
 * assemblyCheckout — the buyer-side commit algorithm for a bound assembly.
 *
 * One function owns the whole sequencing the checkout surface runs: build the
 * root order from the assembly's root node, Layer-A validate, then either the
 * single-order relay (the buyer signs the one order, then relays it from the
 * share panel) or the multi-order walk — the buyer funds EVERY order up front:
 * the root's processId is its EIP-712 digest (deterministic, computable from
 * the unsigned commitment), so each sub-order is built, validated, signed, and
 * relayed onto the coordination channel to its bound seller BEFORE any commit;
 * the root is signed LAST and surfaced to the share panel. Each seller
 * counter-signs its own order — the kernel enforces commit order (root creates
 * the process, subs extend it), so the sellers' accepts self-serialize
 * root-first. Every order's clauses come verbatim from the assembly template;
 * no clause is named — the commerce + cargo sections are found by their declared
 * fields. The buyer signs each order through the SAME confirm gate the seller's
 * accept uses; there is no checkout-only bypass.
 *
 * The UI surface (`CheckoutView`) keeps only wallet/cart guards and error
 * display; this module is the protocol algorithm. Throws Error with a
 * user-facing message on any failure — the caller renders it.
 */


import { buildOrderPreview, type OrderPreview } from "@/lib/checkout/orderPreview";
import { validateCommitmentAgreement } from "@/lib/kernel/orderAgreement";
import type { DraftOrder } from "@/lib/checkout/draftOrders";
import { commitmentOrderHash, commitmentProcessId, type CommitmentPayload } from "@/lib/kernel/signedCommitment";
import type { ClauseFields } from "@/lib/shared/clauseFields";
import { planSubOrderSellers, resolveSubOrderPricing } from "@/lib/checkout/assemblySubOrderPlan";
import { templateClauseVersionMap, templateParentOrderHashes } from "@/lib/shared/assemblyTemplate";
import { clauseDeclaresField } from "@/lib/shared/clauseSpecSource";
import { parseToken } from "@/lib/shared/utils";
import type { BoundAssembly } from "@/lib/seller/useSellerBoundAssemblies";
import type { SellerCatalogue } from "@/lib/seller/types";

export interface AssemblyCheckoutLineItem {
    itemId: string;
    name: string;
    quantity: number;
    /** Decimal string, smallest unit (matches the commerce clause's bigint field). */
    unitPrice: string;
    /** Physical attributes from the cart — collapsed into the root order's
     *  cargo section at checkout (mass/volume sums × quantity). */
    massGrams?: number;
    volumeMl?: number;
}

/** The signing capabilities the algorithm drives — provided by `useCheckout`,
 *  which backs them with the order* commitment flow. */
export interface AssemblyCheckoutDeps {
    chainId: number;
    /** Sign the root and surface its payload to the share panel (no auto-relay). */
    signRoot: (preview: OrderPreview) => Promise<CommitmentPayload>;
    /** Sign + relay a sub-order to its bound seller in one step. */
    signAndShare: (preview: OrderPreview) => Promise<CommitmentPayload>;
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

/**
 * Write the order's settlement terms into the commerce section, found by its
 * declared `lineItems` field (never by clause id; gracefully skipped when the
 * assembly composes no commerce clause). currency + payment are stored as the
 * clause spec wants them (address-hex string, decimal string); `lineItems` is
 * supplied only for the root (the buyer's cart) and stripped to the commerce
 * section's closed shape — the cart's physical attributes belong to the cargo
 * collapse, not here.
 */
function fillCommerceSection(
    clauses: ClauseFields,
    currency: `0x${string}`,
    payment: bigint,
    lineItems?: AssemblyCheckoutLineItem[],
): ClauseFields {
    const commerceClauseId = Object.keys(clauses).find(
        (clauseId) => clauseDeclaresField(clauseId, "lineItems"),
    );
    if (!commerceClauseId) return clauses;
    return {
        ...clauses,
        [commerceClauseId]: {
            ...clauses[commerceClauseId],
            currency,
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
 * Write the REAL parent-order hashes into the topology section, found by its
 * declared `parentOrderHashes` field (never by clause id). The template's
 * topology data carries template-LOCAL order ids ("order-0"); the committed
 * agreement must carry the actual EIP-712 order hashes — they are the DAG
 * edges every off-chain reader (audit, derive) reconstructs from, and the
 * bytes32 shape Layer A validates.
 */
function writeTopologySection(
    clauses: ClauseFields,
    parentOrderHashes: `0x${string}`[],
): ClauseFields {
    const topologyClauseId = Object.keys(clauses).find(
        (clauseId) => clauseDeclaresField(clauseId, "parentOrderHashes"),
    );
    if (!topologyClauseId) return clauses;
    return {
        ...clauses,
        [topologyClauseId]: {
            ...clauses[topologyClauseId],
            parentOrderHashes,
        },
    };
}

/** Layer A — the buyer does not sign an invalid agreement. */
function assertValidToSign(preview: OrderPreview, label: string): void {
    const check = validateCommitmentAgreement(preview.agreement, preview.agreementHash);
    if (!check.ok) {
        throw new Error(
            `${label} isn't valid to sign yet: ${check.issues
                .map((i) => `${i.clause} ${i.path}: ${i.message}`)
                .join("; ")}`,
        );
    }
}

export async function executeAssemblyCheckout(
    params: {
        buyer: `0x${string}`;
        leadSellerAddress: `0x${string}`;
        currency: `0x${string}`;
        /** The lead order's payment — the cart total. */
        payment: bigint;
        lineItems: AssemblyCheckoutLineItem[];
        assembly: BoundAssembly;
        /** Contributor pricing context (each sub-order is priced LIVE from its
         *  own seller's catalogue). */
        sellerCatalogues: SellerCatalogue[];
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
         *  the composing clause's `interface` (from `block.composes`) plus the
         *  buyer's `block.fields` values collected at checkout. The composition
         *  runs alongside the order's normal commit. Interface-agnostic — the
         *  walk names no clause. */
        subOrderCompositions?: Record<string, { interface: string; fieldValues: Record<string, unknown> }>;
        /** The buyer's checkout-entered units per template node id — the
         *  "checkout-quantity" rate source's input (hours, seats, …). Only
         *  read for a node whose contributor prices by such a rate. */
        subOrderQuantities?: Record<string, number>;
    },
    deps: AssemblyCheckoutDeps,
): Promise<void> {
    const {
        buyer, leadSellerAddress, currency, payment, lineItems,
        assembly, sellerCatalogues, tokenDecimals, subOrderSelections,
    } = params;
    const { chainId, signRoot, signAndShare } = deps;

    // The root node carries the design-time clause choices, spread verbatim.
    const root = assembly.assemblyTemplate.agreements.find((o) => templateParentOrderHashes(o).length === 0)
        ?? assembly.assemblyTemplate.agreements[0];
    if (!root) throw new Error("This assembly has no root order.");
    const isMultiOrder = assembly.assemblyTemplate.agreements.length > 1;

    // The root's clause map: template clauses, the cart's PHYSICAL attributes
    // collapsed into the cargo entry (found by its declared fields, never by
    // clause name; mass/volume sum across items × quantity), then the
    // settlement terms written into the commerce section.
    let rootClauses: ClauseFields = { ...root.clauses };
    const cargoClauseId = Object.keys(rootClauses).find(
        (clauseId) => clauseDeclaresField(clauseId, "massGrams"),
    );
    if (cargoClauseId) {
        const massGrams = lineItems.reduce(
            (sum, li) => sum + (li.massGrams ?? 0) * li.quantity, 0);
        const volumeMl = lineItems.reduce(
            (sum, li) => sum + (li.volumeMl ?? 0) * li.quantity, 0);
        rootClauses[cargoClauseId] = {
            ...rootClauses[cargoClauseId],
            ...(massGrams > 0 ? { massGrams } : {}),
            ...(volumeMl > 0 ? { volumeMl } : {}),
        };
    }
    rootClauses = fillCommerceSection(rootClauses, currency, payment, lineItems);

    const rootDraft: DraftOrder = {
        buyer, seller: leadSellerAddress, currency, payment, clauses: rootClauses,
        clauseVersions: templateClauseVersionMap(root),
    };
    const rootPreview = await buildOrderPreview(rootDraft);
    assertValidToSign(rootPreview, "This order");

    // Single order (distinct parties OR self-commit) → the buyer signs the one
    // order; the share panel relays it to the seller, who counter-signs.
    if (!isMultiOrder) {
        await signRoot(rootPreview);
        return;
    }

    // The root's process id is its EIP-712 digest — computable from the unsigned
    // commitment, so the sub-orders can name it before the root commits.
    const processId = commitmentProcessId(rootPreview.commitment, chainId);
    const realOrderHash = new Map<string, `0x${string}`>([
        [root.id, commitmentOrderHash(rootPreview.commitment, chainId)],
    ]);
    let cumulativeValue = payment;

    for (const { node, seller: boundSeller } of planSubOrderSellers(assembly)) {
        // On-network composition (fifth noun): a sub-order whose clause declares
        // `block.composes` invokes the composed contract ALONGSIDE its normal
        // commit — the interface is routed to its handler by the surface
        // (`deps.compose`); the walk names no clause. (Counterparty-deferring
        // compositions were retired with the dutch auction 2026-07-02: a
        // mid-chain order whose price or party is unknown at signing is
        // structurally incompatible with the kernel's exact-match cumulative
        // accumulator.)
        const composition = boundSeller ? undefined : params.subOrderCompositions?.[node.id];
        if (composition) {
            if (!deps.compose) {
                throw new Error("This assembly composes an on-network contract for a sub-order, but no composition mechanism is available.");
            }
            await deps.compose({
                interface: composition.interface,
                fieldValues: composition.fieldValues,
                processId,
                currency,
                tokenDecimals,
            });
        }
        // A profile binding designates the counterparty; a node the profile
        // leaves unbound takes the buyer's checkout-time choice.
        const selection = boundSeller ? undefined : subOrderSelections?.[node.id];
        const subSeller = boundSeller ?? selection?.seller ?? null;
        if (!subSeller) {
            throw new Error("This assembly has a sub-order with no counterparty — the seller's profile must designate one, or the buyer chooses one at checkout.");
        }
        const parentOrderHashes = templateParentOrderHashes(node)
            .map((pid) => realOrderHash.get(pid))
            .filter((h): h is `0x${string}` => !!h);
        const pricing = selection
            ? null
            : resolveSubOrderPricing({
                node, seller: subSeller, sellerCatalogues, tokenDecimals,
                checkoutQuantity: params.subOrderQuantities?.[node.id],
            });
        if (pricing?.issue === "unresolvable-quantity") {
            throw new Error(
                `"${pricing.item?.name}" prices by rate but its quantity can't be resolved on this order — the quantity source ("${pricing.item?.rateQuantitySource}") found no value.`,
            );
        }
        const subPayment = selection
            ? parseToken(selection.price, tokenDecimals)
            : pricing!.payment;
        cumulativeValue += subPayment;
        // The sub-order's commerce section states WHAT the payment buys: the
        // contributor's resolved catalogue item (the same item the payment was
        // priced from), or the buyer's picked item on the unbound path. The
        // commerce clause requires lineItems on EVERY order, subs included.
        // Rate items commit their derivation: quantity = billed units (per
        // started unit), unitPrice = the rate — quantity × unitPrice replays
        // the payment from the committed leaf alone.
        const subLineItems: AssemblyCheckoutLineItem[] | undefined = selection
            ? [{ itemId: selection.item.id, name: selection.item.name, quantity: 1, unitPrice: subPayment.toString() }]
            : pricing!.item
                ? [{
                    itemId: pricing!.item.id,
                    name: pricing!.item.name,
                    quantity: pricing!.billedQuantity,
                    unitPrice: pricing!.unitPrice.toString(),
                }]
                : undefined;
        const subClauses = fillCommerceSection(
            writeTopologySection({ ...node.clauses }, parentOrderHashes),
            currency, subPayment, subLineItems,
        );
        const subDraft: DraftOrder = {
            buyer, seller: subSeller, currency, payment: subPayment,
            clauses: subClauses, parentOrderHashes,
            clauseVersions: templateClauseVersionMap(node),
        };
        const subPreview = await buildOrderPreview(subDraft, {
            processId,
            expectedCumulativeValue: cumulativeValue,
        });
        assertValidToSign(subPreview, "A sub-order");
        await signAndShare(subPreview);
        realOrderHash.set(
            node.id,
            commitmentOrderHash(subPreview.commitment, chainId),
        );
    }

    // Root last → the share panel shows the root for the buyer to relay to the
    // lead. The lead accepts → root commits → the already-shared sub-orders
    // unlock for their sellers to accept.
    await signRoot(rootPreview);
}
