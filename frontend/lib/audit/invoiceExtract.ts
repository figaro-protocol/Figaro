/**
 * Invoice extractor — pure projection of a Figaro order's commerce clause
 * into a traditional invoice document.
 *
 * The commerce section (`figaro-commerce-v1`) carries currency + payment +
 * line items in its `data` field. This extractor projects those fields
 * into the structured invoice shape an auditor or tax preparer expects.
 *
 * The line items array is the merchant's catalogue projection at agreement
 * time — what was ordered, at what unit price, in what quantity. It was
 * signed by both parties, so the invoice IS the contract excerpt for the
 * commercial terms.
 */

import {
    type Agreement,
    type AgreementLineItem,
    type AgreementSection,
    type AnyAgreementSection,
    type RedactableAgreement,
    COMMERCE_SCHEMA_KEY,
    isRedactedSection,
} from "@/lib/core/agreementManifest";
import type { Order } from "@/lib/core/store";
import type { ExtractedDocument } from "./types";

function findAnySection(
    agreement: Agreement | RedactableAgreement,
    schemaKey: string,
): AnyAgreementSection | undefined {
    return agreement.sections.find((s) => s.schema === schemaKey);
}

export interface InvoiceLineItem {
    itemId: string;
    name: string;
    quantity: number;
    /** Unit price as a decimal string (avoids float precision; keep as authored). */
    unitPrice: string;
}

export interface InvoiceDocument extends ExtractedDocument {
    /** Invoice number — orderHash, the content-addressed kernel id. */
    invoiceNumber: string;
    /** Block number when the order was committed (if known). */
    issuedAtBlock?: number;
    /** Bill-from = seller of the order (the party providing goods/services). */
    billFrom: string;
    /** Bill-to = buyer of the order (the party paying). */
    billTo: string;
    /** Currency address (ERC-20). */
    currency: string;
    lineItems: InvoiceLineItem[];
    /** True when the commerce section was redacted in the input agreement —
     *  line items + currency cleartext are absent and the receiver should
     *  render a "🔒 Sealed" placeholder. The leaf hash is preserved in the
     *  contract document's clauses array for selective-reveal verification. */
    lineItemsSealed?: boolean;
    /** Total in token smallest units — equals the order's payment (P). */
    total: bigint;
}

/** True when the value is a syntactically-valid line-item record. Used to
 *  filter unknown / malformed entries silently in the invoice projection
 *  rather than throw — the upstream agreement may be authored by a
 *  third-party seller catalogue with looser shape than the canonical type. */
function isLineItem(v: unknown): v is AgreementLineItem {
    if (!v || typeof v !== "object") return false;
    const obj = v as Record<string, unknown>;
    return (
        typeof obj.itemId === "string"
        && typeof obj.name === "string"
        && typeof obj.quantity === "number"
        && typeof obj.unitPrice === "string"
    );
}

export function extractInvoice(
    order: Order,
    agreement: Agreement | RedactableAgreement,
): InvoiceDocument {
    const commerce = findAnySection(agreement, COMMERCE_SCHEMA_KEY);
    const sealed = commerce !== undefined && isRedactedSection(commerce);
    const commerceData = commerce !== undefined && !isRedactedSection(commerce)
        ? (commerce.data as { currency?: string; lineItems?: unknown[] })
        : undefined;

    const lineItems: InvoiceLineItem[] = Array.isArray(commerceData?.lineItems)
        ? (commerceData.lineItems.filter(isLineItem) as AgreementLineItem[]).map((li) => ({
              itemId: li.itemId,
              name: li.name,
              quantity: li.quantity,
              unitPrice: li.unitPrice,
          }))
        : [];

    return {
        title: "Invoice",
        orderHash: order.id,
        processId: order.processId,
        agreementHash: order.agreementHash ?? "0x",
        buyer: order.buyer,
        seller: order.seller,
        invoiceNumber: order.id,
        issuedAtBlock: order.blockNumber,
        billFrom: order.seller,
        billTo: order.buyer,
        // When commerce is sealed, the agreement-side currency is not
        // readable. Fall back to `order.currency` from the on-chain Commit
        // event — the kernel records currency on the commitment, so this
        // is always available regardless of redaction.
        currency: commerceData?.currency ?? order.currency ?? "0x0000000000000000000000000000000000000000",
        lineItems,
        ...(sealed ? { lineItemsSealed: true } : {}),
        // Total comes from `order.payment`, recorded on-chain at commit.
        // It is NOT redacted by sealing the commerce section.
        total: order.payment,
    };
}
