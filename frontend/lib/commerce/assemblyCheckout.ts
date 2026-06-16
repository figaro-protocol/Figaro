/**
 * assemblyCheckout — the buyer-side commit algorithm for a bound assembly.
 *
 * One function owns the whole sequencing the checkout surface runs:
 * prepare the root order from the assembly's root node, Layer-A validate,
 * then either the single-order bilateral relay (the buyer signs + shares via
 * the buyer-share-panel) or the multi-order walk — the buyer funds EVERY
 * order up front: the root's processId is its EIP-712 digest
 * (deterministic), so each sub-order is prepared, validated, signed, and
 * relayed onto the coordination channel to its bound seller BEFORE any
 * commit; the root goes through the buyer-share-panel last. Each seller
 * counter-signs its own order in their inbox — the kernel enforces commit
 * order (root creates the process, subs extend it), so the sellers accept
 * root-first. Every order's clauses come verbatim from the assembly
 * template; no clause is named.
 *
 * The UI surface (`CheckoutView`) keeps only wallet/cart guards and error
 * display; this module is the protocol algorithm. Throws Error with a
 * user-facing message on any failure — the caller renders it.
 */

import { computeCommitmentProcessId, computeOrderHash } from "@/lib/core/commitmentStore";
import { prepareOrderCommitment } from "@/lib/core/orderCommitmentPreparation";
import { validateCommitmentAgreement } from "@/lib/core/orderAgreement";
import { planSubOrderSellers, resolveSubOrderPayment } from "@/lib/commerce/assemblySubOrderPlan";
import { templateParentOrderIds } from "@/lib/designer/assemblyTemplate";
import { clauseDeclaresField } from "@/lib/shared/clauseSpecSource";
import { shareCommitmentPayload } from "@/lib/core/commitmentShare";
import { sellerAuctionId, stashSellerDraft } from "@/lib/seller/sellerAuction";
import { parseToken } from "@/lib/shared/utils";
import { CONTRACTS } from "@/lib/core/contracts";
import type { Commitment } from "@/lib/core/useFigaroActions";
import type { CommitmentPayloadMeta } from "@/lib/core/useCommitmentFlow";
import type { BoundAssembly } from "@/lib/mechanisms/useAssemblyRegistry";
import type { SellerCatalogue } from "@/lib/seller/types";
import type { CoordinationMessagingService } from "@/lib/handoff/coordinationMessagingService";
import type { IpfsService } from "@/lib/shared/ipfsService";

export interface AssemblyCheckoutLineItem {
    itemId: string;
    name: string;
    quantity: number;
    unitPrice: string;
    /** Physical attributes from the cart — collapsed into the root order's
     *  geo section at checkout (mass/volume sums × quantity; the
     *  highest-priority class of service). */
    massGrams?: number;
    volumeMl?: number;
}

/** The signing + transport capabilities the algorithm drives — provided by
 *  `useCheckout` / `useRuntimeServices` at the surface. */
export interface AssemblyCheckoutDeps {
    chainId: number;
    signCommitment: (
        commitment: Commitment,
        opts?: { skipPreview?: boolean },
    ) => Promise<`0x${string}`>;
    initiateAsParty: (
        commitment: Commitment,
        role: "buyer",
        meta?: CommitmentPayloadMeta,
        opts?: { skipPreview?: boolean },
    ) => Promise<unknown>;
    walletClient?: { signMessage(params: { message: string }): Promise<`0x${string}`> } | null;
    coordinationMessaging: CoordinationMessagingService;
    evidenceTransport: Pick<IpfsService, "pinBlob">;
    /** Opens the descending-price seller auction for a deferred sub-order —
     *  the surface owns the tx + receipt wait (useDutchAuctionActions). */
    openSellerAuction?: (args: {
        auctionId: string;
        startPrice: bigint;
        processId: `0x${string}`;
        currency: `0x${string}`;
    }) => Promise<void>;
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
        /** Dutch-auction coordination, keyed by template node id: the unbound
         *  sub-order is DEFERRED — its build parameters are stashed on this
         *  device and a descending-price auction opens at the buyer's start
         *  price; the claiming seller commits the order post-claim (the
         *  SellerAuctionPanel on the order page), counter-signed by the buyer
         *  in their inbox. The process commits with the root only. */
        subOrderAuctions?: Record<string, { startPrice: string }>;
    },
    deps: AssemblyCheckoutDeps,
): Promise<void> {
    const {
        buyer, leadSellerAddress, currency, payment, lineItems,
        assembly, sellerCatalogues, tokenDecimals, subOrderSelections,
    } = params;
    const {
        chainId, signCommitment, initiateAsParty,
        walletClient, coordinationMessaging, evidenceTransport,
    } = deps;

    // The root node carries the design-time clause choices, spread verbatim —
    // then the cart's PHYSICAL attributes collapse into the geo entry (found
    // by its declared fields, never by clause name): mass/volume sum across
    // items × quantity; class of service takes the highest-priority class.
    const root = assembly.assemblyTemplate.orders.find((o) => templateParentOrderIds(o).length === 0)
        ?? assembly.assemblyTemplate.orders[0];
    if (!root) throw new Error("This assembly has no root order.");
    const isMultiOrder = assembly.assemblyTemplate.orders.length > 1;

    const clauseFields = { ...root.clauses };
    // Aggregate cart mass/volume into the geo clause (found by FIELD name, never
    // clause id). Class of service is its own elective clause now — composed at
    // design time, never derived from cart items.
    const geoClauseId = Object.keys(clauseFields).find(
        (clauseId) => clauseDeclaresField(clauseId, "massGrams"),
    );
    if (geoClauseId) {
        const massGrams = lineItems.reduce(
            (sum, li) => sum + (li.massGrams ?? 0) * li.quantity, 0);
        const volumeMl = lineItems.reduce(
            (sum, li) => sum + (li.volumeMl ?? 0) * li.quantity, 0);
        clauseFields[geoClauseId] = {
            ...clauseFields[geoClauseId],
            ...(massGrams > 0 ? { massGrams } : {}),
            ...(volumeMl > 0 ? { volumeMl } : {}),
        };
    }

    const prepared = await prepareOrderCommitment({
        buyer,
        seller: leadSellerAddress,
        currency,
        payment,
        // The commerce clause's lineItems are CLOSED objects — the physical
        // attributes exist on AssemblyCheckoutLineItem solely for the geo
        // collapse above and must not reach the commerce section (Layer-A
        // rejects undeclared fields).
        lineItems: lineItems.map(({ itemId, name, quantity, unitPrice }) =>
            ({ itemId, name, quantity, unitPrice })),
        clauseFields,
    });
    // Layer A — the buyer does not sign an invalid agreement.
    const buyerCheck = validateCommitmentAgreement(prepared.agreement, prepared.agreementHash);
    if (!buyerCheck.ok) {
        throw new Error(
            `This order isn't valid to sign yet: ${buyerCheck.issues
                .map((i) => `${i.clause} ${i.path}: ${i.message}`)
                .join("; ")}`,
        );
    }
    // Single order (distinct parties OR self-commit) → the bilateral relay:
    // the buyer signs + shares via the buyer-share-panel; the seller
    // counter-signs the one order in their inbox.
    if (!isMultiOrder) {
        await initiateAsParty(prepared.commitment, "buyer", prepared.commitmentMeta, { skipPreview: true });
        return;
    }

    const processId = computeCommitmentProcessId(prepared.commitment, chainId, CONTRACTS.core);
    const realOrderHash = new Map<string, `0x${string}`>([
        [root.id, computeOrderHash(prepared.commitment, chainId, CONTRACTS.core)],
    ]);
    let cumulativeValue = payment;

    for (const { node, seller: boundSeller } of planSubOrderSellers(assembly)) {
        // Dutch-auction coordination: the unbound sub-order is DEFERRED — stash
        // its build parameters, open the auction, and skip it; it joins the
        // process when a seller claims (committed post-claim from the draft,
        // its cumulative-value check read fresh at that point).
        const auctionEntry = boundSeller ? undefined : params.subOrderAuctions?.[node.id];
        if (auctionEntry) {
            if (!deps.openSellerAuction) {
                throw new Error("This assembly defers a sub-order to an auction, but no auction mechanism is available.");
            }
            const parentHashes = templateParentOrderIds(node)
                .map((pid) => realOrderHash.get(pid))
                .filter((h): h is `0x${string}` => !!h);
            stashSellerDraft(processId, {
                buyer,
                currency,
                processId,
                parentOrderHashes: parentHashes,
                clauseFields: { ...node.clauses },
            });
            await deps.openSellerAuction({
                auctionId: sellerAuctionId(processId),
                startPrice: parseToken(auctionEntry.startPrice, tokenDecimals),
                processId,
                currency,
            });
            continue;
        }
        // A profile binding designates the counterparty; a node the profile
        // leaves unbound takes the buyer's checkout-time choice.
        const selection = boundSeller ? undefined : subOrderSelections?.[node.id];
        const subSeller = boundSeller ?? selection?.seller ?? null;
        if (!subSeller) {
            throw new Error("This assembly has a sub-order with no counterparty — the seller's profile must designate one, or the buyer chooses one at checkout.");
        }
        const parentOrderHashes = templateParentOrderIds(node)
            .map((pid) => realOrderHash.get(pid))
            .filter((h): h is `0x${string}` => !!h);
        const subPayment = selection
            ? parseToken(selection.price, tokenDecimals)
            : resolveSubOrderPayment({
                node, seller: subSeller, leadAddress: leadSellerAddress,
                sellerCatalogues, tokenDecimals,
            });
        cumulativeValue += subPayment;
        const subPrepared = await prepareOrderCommitment({
            buyer,
            seller: subSeller,
            currency,
            payment: subPayment,
            processId,
            parentOrderHashes,
            expectedCumulativeValue: cumulativeValue,
            clauseFields: { ...node.clauses },
        });
        // Layer A — the buyer does not sign an invalid sub-order either.
        const subCheck = validateCommitmentAgreement(subPrepared.agreement, subPrepared.agreementHash);
        if (!subCheck.ok) {
            throw new Error(
                `A sub-order isn't valid to sign yet: ${subCheck.issues
                    .map((i) => `${i.clause} ${i.path}: ${i.message}`)
                    .join("; ")}`,
            );
        }
        const subSig = await signCommitment(subPrepared.commitment, { skipPreview: true });
        await shareCommitmentPayload({
            payload: {
                commitment: subPrepared.commitment,
                buyerSig: subSig,
                agreement: subPrepared.commitmentMeta.agreement,
                agreementUri: subPrepared.commitmentMeta.agreementUri,
            },
            recipientAddress: subSeller,
            senderAddress: buyer,
            walletClient,
            chainId,
            coordinationMessaging,
            evidenceTransport,
        });
        realOrderHash.set(
            node.id,
            computeOrderHash(subPrepared.commitment, chainId, CONTRACTS.core),
        );
    }

    // Root last → the buyer-share-panel shows the root for the buyer to relay
    // to the lead. The lead accepts → root commits → the already shared
    // sub-orders unlock for their sellers to accept.
    await initiateAsParty(prepared.commitment, "buyer", prepared.commitmentMeta, { skipPreview: true });
}
