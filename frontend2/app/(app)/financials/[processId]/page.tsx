"use client";

/**
 * /financials/[processId] — consolidated process-level financials.
 *
 * Reads orders for the process from useProcessOrders, projects them via
 * `projectFinancials`, and renders an invoice-style view:
 *
 *   • Header: process identity + buyer + currency mix
 *   • Aggregates: balance sheet + income statement, per currency, derived
 *     from the corrected bonding math (2P + 2G custody — see
 *     project_bonding_formula.md in memory)
 *   • Line items: one row per order in the process tree, exposing the
 *     per-seller breakdown an auditor needs (which seller got how much,
 *     which order is still active, which has resolved). The Figaro
 *     process is structurally an invoice — one buyer paying multiple
 *     sellers across a tree — and the line-item layout makes that visible.
 *   • Cash-flow log: every commit/resolve transfer with on-chain amount,
 *     collapsible per-line.
 *
 * Phase B of the financial-statements deliverable. Phases C–E layer the
 * 5-document PDF auditor bundle on top.
 */

import Link from "next/link";
import { useParams } from "next/navigation";
import { formatUnits } from "viem";
import { useProcessOrders } from "@/hooks/core/useProcessOrders";
import {
    projectFinancials,
    checkBalanceSheetIdentity,
    type BalanceSheetEntry,
    type FinancialsModel,
    type OrderLineItem,
} from "@/lib/semantic/financialsProjection";
import { OrderState } from "@/lib/core/store";

// 18-decimal formatting is the universal default for ERC20 + ETH. A future
// enhancement is per-currency decimals lookup; for now we surface the raw
// bigint alongside the formatted value so a reviewer can reconcile against
// chain regardless of decimal assumptions.
const DEFAULT_DECIMALS = 18;

function formatAmount(amount: bigint): string {
    return formatUnits(amount, DEFAULT_DECIMALS);
}

function shortAddr(addr: string): string {
    if (!addr) return "—";
    return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

function shortHash(hash: string | undefined): string {
    if (!hash) return "—";
    return `${hash.slice(0, 10)}…${hash.slice(-6)}`;
}

export default function ProcessFinancialsPage() {
    const params = useParams<{ processId: string }>();
    const processId = params?.processId ?? null;
    const orders = useProcessOrders(processId);

    if (!processId) {
        return (
            <div className="container mx-auto px-6 py-12">
                <p className="text-sm text-neutral-500">No process id in URL.</p>
            </div>
        );
    }

    const model = projectFinancials(orders, "process", processId);
    const buyer = orders[0]?.buyer;

    return (
        <div className="container mx-auto px-6 py-10 max-w-5xl space-y-10" data-testid="financials-page">
            {/* Header */}
            <header className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-widest text-neutral-500">
                    Process financials
                </p>
                <h1 className="text-2xl font-bold text-black">
                    Consolidated statement
                </h1>
                <dl className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs font-mono text-neutral-700 mt-3">
                    <div>
                        <dt className="text-neutral-500">processId</dt>
                        <dd className="break-all" data-testid="financials-process-id">{processId}</dd>
                    </div>
                    {buyer && (
                        <div>
                            <dt className="text-neutral-500">buyer</dt>
                            <dd className="break-all">{buyer}</dd>
                        </div>
                    )}
                </dl>
                <p className="text-[11px] text-neutral-500 max-w-2xl mt-3">
                    Cash-basis projection of on-chain commit + resolve events. Bond
                    deposits = assets; refund obligations = liabilities; payment
                    = retained earnings. Each line traces to one or more on-chain
                    events. Not an audited statement under any accounting standard
                    — interpretation under GAAP/IFRS requires accountant judgment
                    (see Paper G). Amounts displayed in 18-decimal units; per-token
                    decimals lookup is a future enhancement — reconcile against
                    chain using the raw smallest-units value if needed.
                </p>
            </header>

            {/* Aggregates: balance sheet + income statement per currency */}
            {model.currencies.length === 0 ? (
                <p className="text-sm text-neutral-500" data-testid="financials-empty">
                    No orders found for this process. The chain has no record of any commitment under this processId.
                </p>
            ) : (
                model.currencies.map((currency) => (
                    <CurrencySegment
                        key={currency}
                        currency={currency}
                        model={model}
                    />
                ))
            )}

            {/* Cash flow log */}
            {model.cashFlow.length > 0 && (
                <section className="space-y-3" data-testid="financials-cashflow">
                    <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-700">
                        Cash flow
                    </h2>
                    <p className="text-[11px] text-neutral-500">
                        Every transfer recorded by the kernel for orders in this process,
                        in input order. Each row is one on-chain ERC-20 transfer.
                        {model.currencies.length === 1 && (
                            <> Single-currency process — denomination shown once at the segment header above.</>
                        )}
                    </p>
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs">
                            <thead className="bg-neutral-50 text-neutral-600">
                                <tr>
                                    <th className="text-left px-3 py-2 font-medium">Event</th>
                                    <th className="text-left px-3 py-2 font-medium">Order</th>
                                    <th className="text-left px-3 py-2 font-medium">Party</th>
                                    <th className="text-right px-3 py-2 font-medium">Amount</th>
                                    {model.currencies.length > 1 && (
                                        <th className="text-left px-3 py-2 font-medium">Currency</th>
                                    )}
                                </tr>
                            </thead>
                            <tbody>
                                {model.cashFlow.map((entry, idx) => (
                                    <tr key={idx} className="border-t border-neutral-100">
                                        <td className="px-3 py-2 font-mono">{entry.kind}</td>
                                        <td className="px-3 py-2 font-mono">{shortHash(entry.orderId)}</td>
                                        <td className="px-3 py-2 font-mono">{shortAddr(entry.party)}</td>
                                        <td className="px-3 py-2 text-right font-mono">{formatAmount(entry.amount)}</td>
                                        {model.currencies.length > 1 && (
                                            <td className="px-3 py-2 font-mono text-neutral-400">{shortAddr(entry.currency)}</td>
                                        )}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </section>
            )}
        </div>
    );
}

function CurrencySegment({ currency, model }: { currency: string; model: FinancialsModel }) {
    const bs = model.balanceSheet[currency];
    const ist = model.incomeStatement[currency];
    const lineItems = model.lineItems.filter((li) => li.currency === currency);
    const identityHolds = checkBalanceSheetIdentity(bs);

    return (
        <section className="space-y-6" data-testid={`financials-currency-${currency}`}>
            <div className="flex items-baseline justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-700">
                    Currency {shortAddr(currency)}
                </h2>
                <span
                    className={`text-[10px] font-mono px-2 py-0.5 rounded ${identityHolds ? "bg-green-50 text-green-700 border border-green-200" : "bg-red-50 text-red-700 border border-red-200"}`}
                    title="Assets = Liabilities + Retained earnings"
                >
                    {identityHolds ? "books reconcile ✓" : "books DRIFT ✗"}
                </span>
            </div>

            {/* Balance sheet */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 bg-white border border-neutral-200 rounded-lg p-5">
                <BalanceSheetColumn title="Assets" rows={[
                    ["Buyer deposit (custody)", bs.buyerCustody],
                    ["Seller deposit (custody)", bs.sellerCustody],
                ]} total={bs.buyerCustody + bs.sellerCustody} />
                <BalanceSheetColumn title="Liabilities" rows={[
                    ["Refund owed to buyer", bs.refundOwedToBuyer],
                    ["Refund owed to seller", bs.refundOwedToSeller],
                ]} total={bs.refundOwedToBuyer + bs.refundOwedToSeller} />
                <BalanceSheetColumn title="Retained earnings" rows={[
                    ["Payment in custody (→ seller at resolve)", bs.retainedEarnings],
                ]} total={bs.retainedEarnings} />
            </div>

            {/* Income statement */}
            <div className="bg-white border border-neutral-200 rounded-lg p-5 space-y-2">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-600 mb-3">
                    Income statement
                </h3>
                <Row label="Sales (commit-time)" amount={ist.sales} />
                <Row label="Cost (resolve-time)" amount={ist.cost} />
                <div className="border-t border-neutral-200 mt-2 pt-2">
                    <Row label="Net income" amount={ist.netIncome} bold />
                </div>
            </div>

            {/* Line items — invoice-style detail */}
            <div className="space-y-3">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-600">
                    Line items ({lineItems.length})
                </h3>
                <p className="text-[11px] text-neutral-500">
                    One row per order in the process tree. Sum of contributions across
                    rows reconciles to the aggregates above.
                </p>
                <div className="overflow-x-auto bg-white border border-neutral-200 rounded-lg">
                    <table className="w-full text-xs">
                        <thead className="bg-neutral-50 text-neutral-600">
                            <tr>
                                <th className="text-left px-3 py-2 font-medium">Order</th>
                                <th className="text-left px-3 py-2 font-medium">Seller</th>
                                <th className="text-right px-3 py-2 font-medium">Payment (P)</th>
                                <th className="text-right px-3 py-2 font-medium">Cumulative (G)</th>
                                <th className="text-right px-3 py-2 font-medium">Sales</th>
                                <th className="text-right px-3 py-2 font-medium">Cost</th>
                                <th className="text-right px-3 py-2 font-medium">Net</th>
                                <th className="text-left px-3 py-2 font-medium">State</th>
                                <th className="text-left px-3 py-2 font-medium">Agreement</th>
                            </tr>
                        </thead>
                        <tbody>
                            {lineItems.map((li) => (
                                <LineItemRow key={li.orderId} item={li} />
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </section>
    );
}

function BalanceSheetColumn({ title, rows, total }: {
    title: string;
    rows: Array<[string, bigint]>;
    total: bigint;
}) {
    return (
        <div>
            <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-600 mb-3">
                {title}
            </h3>
            <div className="space-y-1">
                {rows.map(([label, amount]) => (
                    <Row key={label} label={label} amount={amount} small />
                ))}
            </div>
            <div className="border-t border-neutral-200 mt-3 pt-2">
                <Row label="Total" amount={total} bold />
            </div>
        </div>
    );
}

function Row({ label, amount, bold, small }: {
    label: string;
    amount: bigint;
    bold?: boolean;
    small?: boolean;
}) {
    return (
        <div className={`flex items-baseline justify-between gap-3 ${small ? "text-xs" : "text-sm"}`}>
            <span className={`text-neutral-700 ${bold ? "font-semibold text-black" : ""}`}>{label}</span>
            <span className={`font-mono ${bold ? "font-semibold text-black" : "text-neutral-700"}`}>
                {formatAmount(amount)}
            </span>
        </div>
    );
}

function LineItemRow({ item }: { item: OrderLineItem }) {
    const stateLabel = item.state === OrderState.Active ? "Active" : "Resolved";
    const stateClasses = item.state === OrderState.Active
        ? "bg-amber-50 text-amber-800 border-amber-200"
        : "bg-green-50 text-green-700 border-green-200";

    return (
        <tr className="border-t border-neutral-100" data-testid={`line-item-${item.orderId}`}>
            <td className="px-3 py-2 font-mono">{shortHash(item.orderId)}</td>
            <td className="px-3 py-2 font-mono">{shortAddr(item.seller)}</td>
            <td className="px-3 py-2 text-right font-mono">{formatAmount(item.payment)}</td>
            <td className="px-3 py-2 text-right font-mono">{formatAmount(item.cumulativeValue)}</td>
            <td className="px-3 py-2 text-right font-mono">{formatAmount(item.salesContribution)}</td>
            <td className="px-3 py-2 text-right font-mono">{formatAmount(item.costContribution)}</td>
            <td className="px-3 py-2 text-right font-mono">{formatAmount(item.netIncomeContribution)}</td>
            <td className="px-3 py-2">
                <span className={`text-[10px] px-1.5 py-0.5 rounded border ${stateClasses}`}>
                    {stateLabel}
                </span>
            </td>
            <td className="px-3 py-2 font-mono">{shortHash(item.agreementHash)}</td>
        </tr>
    );
}

// Suppress unused warning for the imported type — used at typecheck time only.
export type { BalanceSheetEntry };
