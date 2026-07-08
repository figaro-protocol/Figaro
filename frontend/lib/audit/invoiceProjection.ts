/**
 * EN 16931 core-invoice projection — a trade document DERIVED from committed
 * record, never separately authored.
 *
 * An invoice is PER SELLER, exactly as in traditional business and exactly as
 * EN 16931 mandates (BG-4 SELLER is one supplier per invoice). A Figaro process
 * is one buyer paying MANY sellers, so it yields ONE invoice PER seller — each a
 * proper single-supplier document — with the buyer's cross-seller *consolidated*
 * view living in `financialsProjection` (individual line items + aggregates),
 * the same individual-plus-consolidated split traditional finance draws.
 *
 * Grounded in the self-closing-ledger-periods paper §7: a Figaro process is a
 * self-closing ledger period, and the "byproduct" (intrinsic) class of the
 * European e-invoice norm falls straight out of the settlement record + the
 * committed commerce leaves:
 *
 *   BT-1  invoice number       → the seller's committed order hash
 *   BT-2  issue date           → the resolution block timestamp (undefined until settled)
 *   BT-3  invoice type code     → 380 (commercial invoice), a projection constant
 *   BT-5  invoice currency     → the single process currency (kernel single-denomination)
 *   BG-4/BT-27  seller         → the one supplier this invoice is from
 *   BG-7/BT-44  buyer          → the root buyer
 *   BG-25 invoice lines        → this seller's order(s), each carrying its payment
 *                                P_i and the description its committed commerce leaf holds
 *   BG-22/BT-106 net total     → Σ P_i across this seller's orders
 *
 * The conditional ("interpretive") VAT class (BT-31, BG-23, …) is NOT derivable
 * from the record — it is supplied by the jurisdiction/assembly graph, and the
 * norm itself only applies to a stablecoin-denominated EU transaction — so it is
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

/** One EN 16931 invoice line (BG-25) — one per order the seller settled. @public */
export interface InvoiceLine {
    /** The order this line settles. */
    orderId: string;
    /** BT-131 line net amount — the order's payment P_i, in the currency's smallest unit. */
    lineNetAmount: bigint;
    /** BT-153 item description — the names its committed commerce leaf carries;
     *  empty when the order committed no itemized commerce (a bare payment). */
    description: string;
}

/** EN 16931 core invoice from ONE seller to the buyer, the intrinsic class only. @public */
export interface InvoiceModel {
    /** BT-1 — the seller's committed order hash (unique + traces on-chain). */
    invoiceNumber: string;
    /** BT-2 issue date, unix seconds — the resolution block timestamp; undefined
     *  until the process resolves (an unsettled process has no issue date). */
    issueDate?: number;
    /** BT-3 — commercial invoice, a projection constant. */
    typeCode: "380";
    /** BT-5 — the single process currency (lowercased address). */
    currency: string;
    /** BG-4 / BT-27 — the one supplier this invoice is from. */
    seller: string;
    /** BG-7 / BT-44 — the root buyer. */
    buyer: string;
    /** BG-25 — one line per order this seller settled. */
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
 * Project one seller's EN 16931 invoice. `orders` are that seller's orders
 * within the process (all sharing one buyer + currency by kernel invariant);
 * `agreements` maps agreementHash → the committed agreement (the source of each
 * line's description). @public
 */
export function projectInvoice(
    orders: readonly Order[],
    agreements: ReadonlyMap<string, Agreement>,
    seller: string,
): InvoiceModel {
    const buyer = orders[0]?.buyer ?? ZERO_ADDRESS;
    const currency = (orders[0]?.currency ?? ZERO_ADDRESS).toLowerCase();
    // Atomic resolution settles every order together, so any resolved order's
    // timestamp is the issue date; undefined until the process settles.
    const issueDate = orders.find((o) => o.state === OrderState.Resolved && o.resolvedAt !== undefined)?.resolvedAt;

    const lines: InvoiceLine[] = orders.map((o) => ({
        orderId: o.id,
        lineNetAmount: o.payment,
        description: commerceDescription(o.agreementHash ? agreements.get(o.agreementHash) : undefined),
    }));
    const netTotal = lines.reduce((sum, l) => sum + l.lineNetAmount, 0n);

    return {
        invoiceNumber: orders[0]?.id ?? "",
        ...(issueDate !== undefined && { issueDate }),
        typeCode: "380",
        currency,
        seller,
        buyer,
        lines,
        netTotal,
    };
}

/**
 * Project one invoice PER SELLER for a process — group its orders by seller and
 * emit a single-supplier invoice for each. The buyer's consolidated view is the
 * financials projection, not a multi-seller invoice. @public
 */
export function projectSellerInvoices(
    orders: readonly Order[],
    agreements: ReadonlyMap<string, Agreement>,
): readonly InvoiceModel[] {
    const bySeller = new Map<string, Order[]>();
    for (const o of orders) {
        const group = bySeller.get(o.seller);
        if (group) group.push(o);
        else bySeller.set(o.seller, [o]);
    }
    return Array.from(bySeller, ([seller, sellerOrders]) => projectInvoice(sellerOrders, agreements, seller));
}
