/**
 * Generic document engine — recognizable trade documents (invoice, bill of
 * lading, packing list, …) as DECLARED templates over committed leaves, produced
 * by ONE generic projector and rendered by ONE generic renderer.
 *
 * This is the open-world answer to "we need documents": a document is not a
 * hand-rolled genre (a `projectInvoice` + a bespoke PDF page) but a COMPOSITION —
 * a declared template that says which committed leaves/kernel facts to present
 * and how. A new genre is a new `DocumentTemplate` (data), zero engine or renderer
 * code. Every reference resolves by DECLARED FIELD, never by clause id, so a
 * template projects identically over an assembly this codebase has never seen.
 *
 * The templates are a hardcoded array in `documentTemplates.ts`. Per maintainer
 * decision they stay there — NO on-chain document registry at this
 * time. The engine only knows templates + committed data, so this is open-world
 * regardless: no template carries clause-specific knowledge.
 */

import { calculateResolution } from "@figaro-protocol/sdk";
import type { Agreement } from "@figaro-protocol/sdk";
import type { Order } from "@/lib/kernel/store";
import { OrderState } from "@/lib/kernel/store";
import { clauseDeclaresField, clauseIsProcessLog } from "@/lib/shared/clauseSpecSource";
import { ZERO_ADDRESS } from "@/lib/shared/evm";
import type { PartyRole } from "@/lib/kernel/walletProcessQueries";

// ── Template DSL (declared data) ───────────────────────────────────────────────

/** A value drawn from the committed record — resolved by the engine, never
 *  naming a clause (leaves are found by their DECLARED FIELD). @public — the
 *  template DSL vocabulary a document-template author writes against. */
export type ValueRef =
    | { const: string }
    | { orderHash: true }
    | { party: PartyRole }
    | { payment: true }                                   // smallest-unit amount (exact + verifiable)
    | { resolvedDate: true }                              // ISO date of resolution, or "—"
    | { leafField: { byField: string; field: string } }  // leaf declaring `byField` → its `field`
    | { lineItemNames: true }                             // commerce lineItems → names joined
    | { sumPayments: true };                              // Σ payment over the unit's orders

/** When a document applies — a declarative predicate over the committed record. @public */
export type Predicate =
    | { always: true }
    | { hasLeafField: string }   // some committed leaf declares this field
    | { isCarriageLeg: true };   // committed topology declares parents + a process-log leaf

/** @public — a header/line row: label → value reference. */
export interface DocumentRow { label: string; ref: ValueRef }

export interface DocumentTemplate {
    /** Genre id, e.g. "commercial-invoice", "bill-of-lading". */
    genre: string;
    /** Human title, e.g. "Commercial invoice (EN 16931 core)". */
    title: string;
    /** One document per order, or one per seller (the process's orders grouped by seller). */
    scope: "order" | "seller";
    /** When this document is emitted. */
    appliesWhen: Predicate;
    /** Header rows: label → value reference (resolved against the unit's primary order). */
    header: readonly DocumentRow[];
    /** Optional repeating lines — one row per order in the unit — with an optional total. */
    lines?: { fields: readonly DocumentRow[]; total?: DocumentRow };
    /** Optional whole-leaf sections, each rendered generically (every field of the leaf
     *  declaring `byField`). This is how a BoL surfaces cargo / freight-class / mode. */
    leafSections?: readonly { label: string; byField: string }[];
    /** Optional footer note (constant). */
    note?: string;
}

// ── Rendered output (what the generic renderer consumes) ───────────────────────

export interface RenderedDocument {
    genre: string;
    title: string;
    header: { label: string; value: string }[];
    lines?: { columns: string[]; rows: string[][]; total?: { label: string; value: string } };
    leafSections?: { label: string; entries: { key: string; value: string }[] }[];
    /** Optional legend: what each label the document emits means. */
    legend?: { key: string; description: string }[];
    note?: string;
}

// ── Resolution ─────────────────────────────────────────────────────────────────

/** A committed section's data, found by a declared field — never by clause id. */
function leafByField(agreement: Agreement | undefined, fieldName: string): Record<string, unknown> | undefined {
    const section = agreement?.sections.find((s) => clauseDeclaresField(s.clause, fieldName));
    return section?.data as Record<string, unknown> | undefined;
}

/** A "unit" a document is scoped to: its primary order/agreement (for header +
 *  leaf sections) and the full order list (for lines + totals). */
interface Unit { primary: Order; agreement: Agreement | undefined; orders: readonly Order[]; agreements: ReadonlyMap<string, Agreement>; }

function agreementOf(order: Order, agreements: ReadonlyMap<string, Agreement>): Agreement | undefined {
    return order.agreementHash ? agreements.get(order.agreementHash) : undefined;
}

function resolve(ref: ValueRef, order: Order, unit: Unit): string {
    if ("const" in ref) return ref.const;
    if ("orderHash" in ref) return order.orderHash;
    if ("party" in ref) return ref.party === "seller" ? order.seller : order.buyer;
    if ("payment" in ref) return order.payment.toString();
    if ("resolvedDate" in ref) {
        return order.state === OrderState.Resolved && order.resolvedAt !== undefined
            ? new Date(order.resolvedAt * 1000).toISOString().slice(0, 10)
            : "—";
    }
    if ("leafField" in ref) {
        const v = leafByField(agreementOf(order, unit.agreements), ref.leafField.byField)?.[ref.leafField.field];
        return v === undefined || v === null ? "" : String(v);
    }
    if ("lineItemNames" in ref) {
        const items = leafByField(agreementOf(order, unit.agreements), "lineItems")?.lineItems as { name?: string; quantity?: number }[] | undefined;
        return (items ?? [])
            .map((li) => (li.quantity && li.quantity > 1 ? `${li.name} ×${li.quantity}` : li.name))
            .filter(Boolean)
            .join(", ");
    }
    if ("sumPayments" in ref) return unit.orders.reduce((s, o) => s + o.payment, 0n).toString();
    return "";
}

function appliesTo(pred: Predicate, agreement: Agreement | undefined): boolean {
    if (!agreement) return false;
    if ("always" in pred) return true;
    if ("hasLeafField" in pred) return agreement.sections.some((s) => clauseDeclaresField(s.clause, pred.hasLeafField));
    // isCarriageLeg: topology declares parents AND a process-log ladder is composed.
    const parents = leafByField(agreement, "parentOrderHashes")?.parentOrderHashes;
    const hasParents = Array.isArray(parents) && parents.length > 0;
    return hasParents && agreement.sections.some((s) => clauseIsProcessLog(s.clause));
}

function render(template: DocumentTemplate, unit: Unit): RenderedDocument {
    const header = template.header.map((r) => ({ label: r.label, value: resolve(r.ref, unit.primary, unit) }));
    const doc: RenderedDocument = { genre: template.genre, title: template.title, header };
    if (template.lines) {
        const columns = template.lines.fields.map((f) => f.label);
        const rows = unit.orders.map((o) => template.lines!.fields.map((f) => resolve(f.ref, o, unit)));
        const total = template.lines.total
            ? { label: template.lines.total.label, value: resolve(template.lines.total.ref, unit.primary, unit) }
            : undefined;
        doc.lines = { columns, rows, ...(total && { total }) };
    }
    if (template.leafSections) {
        doc.leafSections = template.leafSections
            .map((s) => ({ label: s.label, data: leafByField(unit.agreement, s.byField) }))
            .filter((s): s is { label: string; data: Record<string, unknown> } => s.data !== undefined)
            .map((s) => ({ label: s.label, entries: Object.entries(s.data).map(([key, v]) => ({ key, value: String(v) })) }));
    }
    if (template.note) doc.note = template.note;
    return doc;
}

/**
 * Project every applicable document for a process from its committed record.
 * `orders` are the process's orders; `agreements` maps agreementHash → agreement.
 * Order-scoped templates emit one document per matching order; seller-scoped emit
 * one per seller (orders grouped by seller). Templates are applied in catalog
 * order; genres are added by adding a template, never engine code.
 */
export function projectDocuments(
    templates: readonly DocumentTemplate[],
    orders: readonly Order[],
    agreements: ReadonlyMap<string, Agreement>,
): RenderedDocument[] {
    const out: RenderedDocument[] = [];
    for (const template of templates) {
        if (template.scope === "order") {
            for (const order of orders) {
                const agreement = agreementOf(order, agreements);
                if (appliesTo(template.appliesWhen, agreement)) {
                    out.push(render(template, { primary: order, agreement, orders: [order], agreements }));
                }
            }
        } else {
            const bySeller = new Map<string, Order[]>();
            for (const o of orders) {
                const g = bySeller.get(o.seller);
                if (g) g.push(o); else bySeller.set(o.seller, [o]);
            }
            for (const group of bySeller.values()) {
                const primary = group[0];
                const agreement = agreementOf(primary, agreements);
                if (appliesTo(template.appliesWhen, agreement)) {
                    out.push(render(template, { primary, agreement, orders: group, agreements }));
                }
            }
        }
    }
    return out;
}

// ── Financial statements as DOCUMENTS ──────────────────────────────────────────
// The balance sheet, income statement, and cash flow — derived purely from commit
// + resolve — are documents too, so they emit the SAME RenderedDocument shape the
// invoice/BoL use and the ONE generic renderer draws them. There is no separate
// per-order "invoice-style" line-item projection for financials — that would
// duplicate the invoice document. Per-currency throughout (multi-currency
// arithmetic is unsafe). FigaroCore math is never re-implemented:
// bonds are READ from the order, resolution from the SDK's calculateResolution.

/**
 * What every label the financial statements emit means — the balance-sheet and
 * income-statement row keys and the cash-flow kinds. The projection writes its
 * labels FROM this map's keys (`FinancialStatementLabel`), so a label without a
 * legend entry does not type-check. P is an order's payment, G its cumulative
 * value; Σ sums over the orders in scope. @public
 */
export const FINANCIAL_STATEMENT_LEGEND = {
    "Buyer bonds (Σ2P)": "The buyer's bonds the Core holds for open orders: twice each payment, summed.",
    "Seller bonds (Σ2G)": "The sellers' bonds the Core holds for open orders: twice each order's cumulative value, summed.",
    "Refund owed to buyer (ΣP)": "What resolution refunds the buyer on open orders: its bond less the payment it carries, P per order.",
    "Refund owed to seller (Σ2G)": "What resolution refunds the sellers on open orders: each seller's bond whole, 2G per order.",
    "Retained earnings (ΣP)": "The payments the buyer's bonds carry on open orders: P per order, transferred to the sellers at resolution.",
    "Sales (ΣP)": "Every order's payment, counted at commit.",
    "Cost (ΣP resolved)": "The payments of resolved orders, counted at resolution.",
    "Net income": "Sales less cost: the payments of orders still open.",
    "commit-buyer-deposit": "Cash flow: the buyer's bond moving into the Core at commit (2P).",
    "commit-seller-deposit": "Cash flow: the seller's bond moving into the Core at commit (2G).",
    "resolve-buyer-refund": "Cash flow: the buyer's bond refunded at resolution, less the payment (2P − P).",
    "resolve-seller-payout": "Cash flow: the seller's bond refunded whole at resolution, plus the payment (2G + P).",
} as const satisfies Record<string, string>;

/** A label the financial statements emit — a key of `FINANCIAL_STATEMENT_LEGEND`. */
type FinancialStatementLabel = keyof typeof FINANCIAL_STATEMENT_LEGEND;

const statementRow = (key: FinancialStatementLabel, value: bigint) => ({ key, value: value.toString() });

interface CurrencyAgg {
    buyerBonds: bigint; sellerBonds: bigint;
    refundOwedToBuyer: bigint; refundOwedToSeller: bigint; retainedEarnings: bigint;
    sales: bigint; cost: bigint;
}

/**
 * The balance sheet + income statement + cash flow for a set of orders, as ONE
 * "Financial statements" document (RenderedDocument). Pure. `scope` = "seller"
 * for one seller's individual statement, "process" for the assembly consolidation.
 * @public
 */
export function projectFinancialStatements(
    orders: readonly Order[],
    scope: "seller" | "process",
    scopeId: string,
): RenderedDocument {
    const byCurrency = new Map<string, CurrencyAgg>();
    const cashFlow: [FinancialStatementLabel, string, string, string][] = [];
    const agg = (c: string): CurrencyAgg => {
        let a = byCurrency.get(c);
        if (!a) {
            a = { buyerBonds: 0n, sellerBonds: 0n, refundOwedToBuyer: 0n, refundOwedToSeller: 0n, retainedEarnings: 0n, sales: 0n, cost: 0n };
            byCurrency.set(c, a);
        }
        return a;
    };
    for (const o of orders) {
        const c = (o.currency ?? ZERO_ADDRESS).toLowerCase();
        const a = agg(c);
        const active = o.state === OrderState.Active;
        if (active) {
            a.buyerBonds += o.buyerBond;           // 2P
            a.sellerBonds += o.sellerBond;         // 2G
            a.refundOwedToBuyer += o.payment;      // P
            a.refundOwedToSeller += o.sellerBond;  // 2G
            a.retainedEarnings += o.payment;       // P
        }
        a.sales += o.payment;                      // recognized at commit
        if (!active) a.cost += o.payment;          // recognized at resolve
        cashFlow.push(["commit-buyer-deposit", o.orderHash, o.buyer, o.buyerBond.toString()]);
        cashFlow.push(["commit-seller-deposit", o.orderHash, o.seller, o.sellerBond.toString()]);
        if (o.state === OrderState.Resolved) {
            const s = calculateResolution(o.payment, o.sellerBond, o.buyerBond);
            cashFlow.push(["resolve-buyer-refund", o.orderHash, o.buyer, s.buyerPayout.toString()]);
            cashFlow.push(["resolve-seller-payout", o.orderHash, o.seller, s.sellerPayout.toString()]);
        }
    }
    const leafSections: { label: string; entries: { key: string; value: string }[] }[] = [];
    for (const [c, a] of byCurrency) {
        leafSections.push({ label: `Balance sheet · ${c}`, entries: [
            statementRow("Buyer bonds (Σ2P)", a.buyerBonds),
            statementRow("Seller bonds (Σ2G)", a.sellerBonds),
            statementRow("Refund owed to buyer (ΣP)", a.refundOwedToBuyer),
            statementRow("Refund owed to seller (Σ2G)", a.refundOwedToSeller),
            statementRow("Retained earnings (ΣP)", a.retainedEarnings),
        ] });
        leafSections.push({ label: `Income statement · ${c}`, entries: [
            statementRow("Sales (ΣP)", a.sales),
            statementRow("Cost (ΣP resolved)", a.cost),
            statementRow("Net income", a.sales - a.cost),
        ] });
    }
    // The legend explains exactly the labels this document emits, in the map's order.
    const emitted = new Set<string>([
        ...leafSections.flatMap((s) => s.entries.map((e) => e.key)),
        ...cashFlow.map((row) => row[0]),
    ]);
    const legend = (Object.keys(FINANCIAL_STATEMENT_LEGEND) as FinancialStatementLabel[])
        .filter((key) => emitted.has(key))
        .map((key) => ({ key, description: FINANCIAL_STATEMENT_LEGEND[key] }));
    return {
        genre: `financial-statements-${scope}`,
        title: scope === "seller" ? "Financial statements · individual" : "Financial statements · consolidated",
        header: [
            { label: "Scope", value: scope === "seller" ? "seller" : "process (consolidated)" },
            { label: scope === "seller" ? "Seller" : "Process", value: scopeId },
        ],
        ...(cashFlow.length > 0 && { lines: { columns: ["kind", "order", "party", "amount"], rows: cashFlow } }),
        leafSections,
        ...(legend.length > 0 && { legend }),
        note: "Cash-basis projection of on-chain commit + resolve. Assets (bonds) = liabilities (refunds) + retained earnings at every block, by construction. Amounts in the currency's smallest unit.",
    };
}

/**
 * One financial-statements document PER SELLER (individual) plus one consolidated
 * (assembly) — the individual + consolidated register, exactly as finance draws it.
 * @public
 */
export function projectAllFinancialStatements(orders: readonly Order[], processId: string): RenderedDocument[] {
    const bySeller = new Map<string, Order[]>();
    for (const o of orders) {
        const g = bySeller.get(o.seller);
        if (g) g.push(o); else bySeller.set(o.seller, [o]);
    }
    const perSeller = Array.from(bySeller, ([seller, sellerOrders]) => projectFinancialStatements(sellerOrders, "seller", seller));
    return [...perSeller, projectFinancialStatements(orders, "process", processId)];
}
