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

import {
    computeCommitmentProcessId,
    computeOrderHash,
} from "@figaro/core";
import { buildOrderPreview, type OrderPreview } from "@/lib/core/orderPreview";
import { validateCommitmentAgreement } from "@/lib/core/orderAgreement";
import type { DraftOrder } from "@/lib/core/draftOrders";
import type { CommitmentPayload } from "@/lib/core/orderSignedAndShared";
import type { ClauseFields } from "@/lib/core/encoding";
import { planSubOrderSellers, resolveSubOrderPayment } from "@/lib/commerce/assemblySubOrderPlan";
import { templateParentOrderHashes } from "@/lib/designer/assemblyTemplate";
import { clauseDeclaresField } from "@/lib/shared/clauseSpecSource";
import { sellerAuctionId, stashSellerDraft } from "@/lib/seller/sellerAuction";
import { parseToken } from "@/lib/shared/utils";
import { CONTRACTS } from "@/lib/core/contracts";
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
     *  receipt wait (useCompositionActions). Returns whether the composition
     *  defers the order's counterparty (auction) or runs alongside a normal
     *  commit. */
    compose?: (args: {
        interface: string;
        abiCID?: string;
        fieldValues: Record<string, unknown>;
        processId: `0x${string}`;
        currency: `0x${string}`;
        tokenDecimals: number;
    }) => Promise<{ deferred: boolean }>;
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
         *  resolved figure (catalogue or buyer-set). Checkout-phase data,
         *  like the cart — never design-time clause activation. */
        subOrderSelections?: Record<string, { seller: `0x${string}`; price: string }>;
        /** On-network compositions (the fifth noun) keyed by template node id:
         *  the composing clause's `interface` (from `block.composes`) plus the
         *  buyer's `block.fields` values collected at checkout. For a deferring
         *  composition (a descending auction) the unbound sub-order is stashed on
         *  this device and the composed contract opens; the claiming seller
         *  commits the order post-claim (the SellerAuctionPanel on the order
         *  page), counter-signed by the buyer, and the process commits with the
         *  root only. Interface-agnostic — the walk names no clause. */
        subOrderCompositions?: Record<string, { interface: string; abiCID?: string; fieldValues: Record<string, unknown> }>;
    },
    deps: AssemblyCheckoutDeps,
): Promise<void> {
    const {
        buyer, leadSellerAddress, currency, payment, lineItems,
        assembly, sellerCatalogues, tokenDecimals, subOrderSelections,
    } = params;
    const { chainId, signRoot, signAndShare } = deps;

    // The root node carries the design-time clause choices, spread verbatim.
    const root = assembly.assemblyTemplate.orders.find((o) => templateParentOrderHashes(o).length === 0)
        ?? assembly.assemblyTemplate.orders[0];
    if (!root) throw new Error("This assembly has no root order.");
    const isMultiOrder = assembly.assemblyTemplate.orders.length > 1;

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

    const rootDraft: DraftOrder = { buyer, seller: leadSellerAddress, currency, payment, clauses: rootClauses };
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
    const processId = computeCommitmentProcessId(rootPreview.commitment, chainId, CONTRACTS.core);
    const realOrderHash = new Map<string, `0x${string}`>([
        [root.id, computeOrderHash(rootPreview.commitment, chainId, CONTRACTS.core)],
    ]);
    let cumulativeValue = payment;

    for (const { node, seller: boundSeller } of planSubOrderSellers(assembly)) {
        // On-network composition (fifth noun): an unbound sub-order whose clause
        // declares `block.composes` gets its counterparty from the composed
        // contract, not a buyer pick. The interface is routed to its handler by
        // the surface (`deps.compose`) — the walk names no clause. A DEFERRING
        // composition (a descending auction) stashes the order's build
        // parameters here and skips it; it joins the process when a provider
        // claims (committed post-claim from the draft, its cumulative-value
        // check read fresh at that point).
        const composition = boundSeller ? undefined : params.subOrderCompositions?.[node.id];
        if (composition) {
            if (!deps.compose) {
                throw new Error("This assembly composes an on-network contract for a sub-order, but no composition mechanism is available.");
            }
            const parentHashes = templateParentOrderHashes(node)
                .map((pid) => realOrderHash.get(pid))
                .filter((h): h is `0x${string}` => !!h);
            stashSellerDraft(processId, {
                buyer,
                currency,
                processId,
                parentOrderHashes: parentHashes,
                clauseFields: { ...node.clauses },
            });
            const { deferred } = await deps.compose({
                interface: composition.interface,
                abiCID: composition.abiCID,
                fieldValues: composition.fieldValues,
                processId,
                currency,
                tokenDecimals,
            });
            // A deferring composition skips the commit now (the provider commits
            // post-claim from the stash); a non-deferring one falls through to
            // the normal sub-order commit below (it still needs a counterparty).
            if (deferred) continue;
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
        const subPayment = selection
            ? parseToken(selection.price, tokenDecimals)
            : resolveSubOrderPayment({
                node, seller: subSeller, sellerCatalogues, tokenDecimals,
            });
        cumulativeValue += subPayment;
        const subClauses = fillCommerceSection({ ...node.clauses }, currency, subPayment);
        const subDraft: DraftOrder = {
            buyer, seller: subSeller, currency, payment: subPayment,
            clauses: subClauses, parentOrderHashes,
        };
        const subPreview = await buildOrderPreview(subDraft, {
            processId,
            expectedCumulativeValue: cumulativeValue,
        });
        assertValidToSign(subPreview, "A sub-order");
        await signAndShare(subPreview);
        realOrderHash.set(
            node.id,
            computeOrderHash(subPreview.commitment, chainId, CONTRACTS.core),
        );
    }

    // Root last → the share panel shows the root for the buyer to relay to the
    // lead. The lead accepts → root commits → the already-shared sub-orders
    // unlock for their sellers to accept.
    await signRoot(rootPreview);
}
