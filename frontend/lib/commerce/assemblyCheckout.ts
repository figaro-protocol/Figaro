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
import { shareCommitmentPayload } from "@/lib/core/commitmentShare";
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
    },
    deps: AssemblyCheckoutDeps,
): Promise<void> {
    const {
        buyer, leadSellerAddress, currency, payment, lineItems,
        assembly, sellerCatalogues, tokenDecimals,
    } = params;
    const {
        chainId, signCommitment, initiateAsParty,
        walletClient, coordinationMessaging, evidenceTransport,
    } = deps;

    // The root node carries the design-time clause choices, spread verbatim.
    const root = assembly.assemblyDoc.orders.find((o) => templateParentOrderIds(o).length === 0)
        ?? assembly.assemblyDoc.orders[0];
    if (!root) throw new Error("This assembly has no root order.");
    const isMultiOrder = assembly.assemblyDoc.orders.length > 1;

    const prepared = await prepareOrderCommitment({
        buyer,
        seller: leadSellerAddress,
        currency,
        payment,
        lineItems,
        clauseFields: { ...root.clauses },
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
        if (!boundSeller) {
            throw new Error("This assembly has a sub-order with no designated counterparty — the seller must bind one.");
        }
        const parentOrderHashes = templateParentOrderIds(node)
            .map((pid) => realOrderHash.get(pid))
            .filter((h): h is `0x${string}` => !!h);
        const subPayment = resolveSubOrderPayment({
            node, seller: boundSeller, leadAddress: leadSellerAddress,
            sellerCatalogues, tokenDecimals,
        });
        cumulativeValue += subPayment;
        const subPrepared = await prepareOrderCommitment({
            buyer,
            seller: boundSeller,
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
            recipientAddress: boundSeller,
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
