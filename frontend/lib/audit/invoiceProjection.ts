/**
 * EN 16931 core-invoice projection — a trade document DERIVED from a process's
 * committed record, never separately authored.
 *
 * Grounded in the self-closing-ledger-periods paper §7: a Figaro process is a
 * self-closing ledger period, and the "byproduct" (intrinsic) class of the
 * European e-invoice norm falls straight out of the settlement record + the
 * committed commerce leaves. This projects exactly that class:
 *
 *   BT-1  invoice number      → the process id (the ledger period's identity)
 *   BT-2  issue date          → the resolution block timestamp (undefined until settled)
 *   BT-3  invoice type code    → 380 (commercial invoice), a projection constant
 *   BT-5  invoice currency    → the single process currency (kernel single-denomination)
 *   BG-7/BT-44  buyer         → the root buyer paying the whole process
 *   BG-25 invoice lines       → the process's ORDERS — one line each, carrying
 *                               its payment P_i and the description its bound
 *                               commerce leaf committed (BG-4/BT-27 seller, BT-131 amount)
 *   BG-22/BT-106 net total    → Σ P_i across the orders
 *
 * The conditional ("interpretive") VAT class (BT-31, BG-23, …) is NOT derivable
 * from the record — it is supplied by the jurisdiction/assembly graph — so it is
 * absent here: this is the norm's core, not a national profile.
 *
 * Pure: reads `Order` state (kernel commit/resolve) + the committed commerce
 * leaf; synthesizes nothing. Names no clause — the commerce leaf is found by its
 * declared `lineItems` field, the same open-world binding the checkout fold uses.
 */

import type { Agreement } from "@figaro/core";
import type { Order } from "@/lib/kernel/store";
import { OrderState } from "@/lib/kernel/store";
import { clauseDeclaresField } from "@/lib/shared/clauseSpecSource";
import { ZERO_ADDRESS } from "@/lib/shared/evm";

/** One EN 16931 invoice line (BG-25) — one per order in the process. @public */
export interface InvoiceLine {
    /** The order this line settles. */
    orderId: string;
    /** BG-4 / BT-27 — the seller this line pays. */
    seller: string;
    /** BT-131 line net amount — the order's payment P_i, in the currency's smallest unit. */
    lineNetAmount: bigint;
    /** BT-153 item description — the names its committed commerce leaf carries;
     *  empty when the order committed no itemized commerce (a bare payment). */
    description: string;
}

/** EN 16931 core invoice, the intrinsic class only. @public */
export interface InvoiceModel {
    /** BT-1 — the process id (the self-closing ledger period). */
    invoiceNumber: string;
    /** BT-2 issue date, unix seconds — the resolution block timestamp; undefined
     *  until the process resolves (an unsettled process has no issue date). */
    issueDate?: number;
    /** BT-3 — commercial invoice, a projection constant. */
    typeCode: "380";
    /** BT-5 — the single process currency (lowercased address). */
    currency: string;
    /** BG-7 / BT-44 — the root buyer paying the whole process. */
    buyer: string;
    /** BG-25 — one line per order. */
    lines: readonly InvoiceLine[];
    /** BG-22 / BT-106 — Σ line net amounts. */
    netTotal: bigint;
}

/** The names an order's committed commerce leaf carries — found by declared
 *  field, never by clause id. Empty when the order has no itemized commerce. */
function commerceDescription(agreement: Agreement | undefined): string {
    if (!agreement) return "";
    const section = agreement.sections.find((s) => clauseDeclaresField(s.clause, "lineItems"));
    const lineItems = (section?.data as { lineItems?: { name?: string; quantity?: number }[] } | undefined)?.lineItems;
    if (!lineItems?.length) return "";
    return lineItems
        .map((li) => (li.quantity && li.quantity > 1 ? `${li.name} ×${li.quantity}` : li.name))
        .filter(Boolean)
        .join(", ");
}

/**
 * Project the EN 16931 core invoice for a process. `orders` are the process's
 * orders (all sharing one buyer + currency by kernel invariant); `agreements`
 * maps agreementHash → the committed agreement, the source of each line's
 * description. Lines preserve the given order order (typically commit order).
 * @public
 */
export function projectInvoice(
    orders: readonly Order[],
    agreements: ReadonlyMap<string, Agreement>,
    processId: string,
): InvoiceModel {
    const buyer = orders[0]?.buyer ?? ZERO_ADDRESS;
    const currency = (orders[0]?.currency ?? ZERO_ADDRESS).toLowerCase();
    // Atomic resolution settles every order together, so any resolved order's
    // timestamp is the process issue date; undefined until the process settles.
    const issueDate = orders.find((o) => o.state === OrderState.Resolved && o.resolvedAt !== undefined)?.resolvedAt;

    const lines: InvoiceLine[] = orders.map((o) => ({
        orderId: o.id,
        seller: o.seller,
        lineNetAmount: o.payment,
        description: commerceDescription(o.agreementHash ? agreements.get(o.agreementHash) : undefined),
    }));
    const netTotal = lines.reduce((sum, l) => sum + l.lineNetAmount, 0n);

    return {
        invoiceNumber: processId,
        ...(issueDate !== undefined && { issueDate }),
        typeCode: "380",
        currency,
        buyer,
        lines,
        netTotal,
    };
}
