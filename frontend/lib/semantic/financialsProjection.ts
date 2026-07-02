/**
 * Cash-basis financial-statement projection for Figaro orders.
 *
 * Pure function: given a set of `Order` records (which mirror the kernel's
 * commit + resolve events), produce a balance-sheet snapshot, income
 * statement, and cash-flow log. Per-currency aggregation throughout — no
 * oracle, no synthesis, no off-chain estimates.
 *
 * The mapping is grounded in Paper G §5 (Figaro process is a self-closing
 * ledger period) and the asymmetric-bonding math from Paper A §1.4 /
 * Theorem 4.6:
 *
 *   - Buyer deposits 2P at commit (NOT 2P + P; see project_bonding_formula.md
 *     in memory)
 *   - Seller deposits 2G at commit
 *   - Total custody pre-resolve = 2P + 2G
 *   - At resolve (cooperate path): seller receives 2G + P, buyer receives P
 *   - Identity holds at every block: assets = liabilities + retained earnings
 *
 * Cash-basis (not GAAP/IFRS):
 *   - Sales recognized when buyer's deposit arrives at commit
 *   - Cost recognized when payment transfers to seller at resolve
 *   - No accruals, no estimates, no fair-value adjustments
 *   - Every line traces to one or more on-chain events by orderHash
 *
 * Pre-resolve order contribution to the contract's books:
 *   Asset:          buyer custody (2P) + seller custody (2G)
 *   Liability:      refund-to-buyer (P) + refund-to-seller (2G)
 *   Retained earnings: payment (P) — the part that flows to seller at resolve
 *   Identity:       2P + 2G = (P + 2G) + P  ✓
 *
 * Post-resolve order contribution:
 *   Custody, liability, retained earnings → 0 (all flowed out)
 *   Income statement records: sales (P), cost (P), net income (0)
 */

import { OrderState, type Order } from "@/lib/kernel/store";
import { ZERO_ADDRESS } from "@/lib/shared/evm";

/**
 * Currency address normalised to lowercase. Multi-currency arithmetic is
 * unsafe, so every aggregate is keyed per-currency.
 */
type CurrencyKey = string;

export interface BalanceSheetEntry {
    /** Sum of 2P across active (committed-but-not-resolved) orders. */
    buyerCustody: bigint;
    /** Sum of 2G across active orders. */
    sellerCustody: bigint;
    /** Sum of P across active orders. Refund obligation back to each buyer on cooperate. */
    refundOwedToBuyer: bigint;
    /** Sum of 2G across active orders. Bond returns to each seller on cooperate. */
    refundOwedToSeller: bigint;
    /** Sum of P across active orders. Becomes seller revenue at resolve. */
    retainedEarnings: bigint;
}

interface IncomeStatementEntry {
    /** Sum of P across all orders in scope (committed at any time). */
    sales: bigint;
    /** Sum of P across resolved orders in scope. */
    cost: bigint;
    /** sales - cost. Always 0 for resolved orders; equals sales for active orders. */
    netIncome: bigint;
}

type CashFlowKind =
    | "commit-buyer-deposit"   // 2P pulled from buyer at commit
    | "commit-seller-deposit"  // 2G pulled from seller at commit
    | "resolve-buyer-refund"   // P returned to buyer at resolve
    | "resolve-seller-payout"; // 2G + P transferred to seller at resolve

interface CashFlowEntry {
    kind: CashFlowKind;
    orderId: string;
    currency: string;
    amount: bigint;
    /** Counterparty address (buyer for buyer-deposit/refund; seller for seller-deposit/payout). */
    party: string;
}

/**
 * Per-order line item — the invoice-style row for the consolidated view.
 *
 * A Figaro process is structurally an invoice: one buyer paying multiple
 * sellers across a topology, with each sub-order = one line. Aggregated totals
 * hide which seller got how much; line items expose it. Auditors and
 * reviewers want both registers visible.
 *
 * Each field is the order's individual contribution to the corresponding
 * aggregate. Summing line-items[*].salesContribution across one currency
 * equals incomeStatement[currency].sales, and so on for every other line.
 */
export interface OrderLineItem {
    orderId: string;
    processId: string;
    buyer: string;
    seller: string;
    currency: CurrencyKey;
    /** Payment P (the trade value). */
    payment: bigint;
    /** Cumulative value G at commit (Σ payments from this order rolling up the topology). */
    cumulativeValue: bigint;
    state: OrderState;
    /** agreementHash — anchors the line item to its off-chain contract document.
     *  Optional because the store's Order makes it optional; in practice a
     *  committed order always carries one. */
    agreementHash: string | undefined;

    // ── Balance-sheet contribution (zero if state === "Resolved") ──────────
    /** 2P contributed to buyer custody if active, else 0. */
    buyerCustodyContribution: bigint;
    /** 2G contributed to seller custody if active, else 0. */
    sellerCustodyContribution: bigint;
    /** P contributed to refund-owed-to-buyer if active, else 0. */
    refundOwedToBuyerContribution: bigint;
    /** 2G contributed to refund-owed-to-seller if active, else 0. */
    refundOwedToSellerContribution: bigint;
    /** P contributed to retained earnings if active, else 0 (transferred out at resolve). */
    retainedEarningsContribution: bigint;

    // ── Income-statement contribution ──────────────────────────────────────
    /** Sales recognized at commit — always = P. */
    salesContribution: bigint;
    /** Cost recognized at resolve — P if resolved, else 0. */
    costContribution: bigint;
    /** Per-order net income — 0 if resolved, P if active. */
    netIncomeContribution: bigint;
}

export interface FinancialsModel {
    scope: "order" | "process";
    scopeId: string;
    /** Distinct currencies seen in scope; lowercase. Iteration order = first-seen order. */
    currencies: readonly CurrencyKey[];
    balanceSheet: Record<CurrencyKey, BalanceSheetEntry>;
    incomeStatement: Record<CurrencyKey, IncomeStatementEntry>;
    cashFlow: readonly CashFlowEntry[];
    /**
     * Per-order line items — invoice-style detail. One entry per order in scope,
     * preserving input order (caller controls; typically commit-block order).
     * Sum of `lineItems[*].<field>Contribution` per currency equals the
     * corresponding aggregate in `balanceSheet` / `incomeStatement`.
     */
    lineItems: readonly OrderLineItem[];
    /** Order ids contributing to this projection. */
    orderIds: readonly string[];
}

function emptyBalanceSheet(): BalanceSheetEntry {
    return {
        buyerCustody: 0n,
        sellerCustody: 0n,
        refundOwedToBuyer: 0n,
        refundOwedToSeller: 0n,
        retainedEarnings: 0n,
    };
}

function emptyIncomeStatement(): IncomeStatementEntry {
    return { sales: 0n, cost: 0n, netIncome: 0n };
}

function bondTwo(value: bigint): bigint {
    // Single arithmetic site so the multiplier is grep-able. The kernel uses
    // `* 2` in src/FigaroCore.sol:206-207 and 283 — see project_bonding_formula.md.
    return value * 2n;
}

/**
 * Build the per-order line item — the invoice-style row capturing this
 * order's individual contribution to every aggregate. Pure; no side effects.
 */
function buildLineItem(order: Order): OrderLineItem {
    const P = order.payment;
    const G = order.cumulativeValue;
    const isActive = order.state === OrderState.Active;
    /** Currency falls back to the zero address as a sentinel — financial
     *  projection then segments any orders that arrived without a currency
     *  under "0x000…0", visible as a flag rather than silently aggregating
     *  with real currencies. */
    const currency = (order.currency ?? ZERO_ADDRESS).toLowerCase();
    return {
        orderId: order.id,
        processId: order.processId,
        buyer: order.buyer,
        seller: order.seller,
        currency,
        payment: P,
        cumulativeValue: G,
        state: order.state,
        agreementHash: order.agreementHash,

        buyerCustodyContribution: isActive ? bondTwo(P) : 0n,
        sellerCustodyContribution: isActive ? bondTwo(G) : 0n,
        refundOwedToBuyerContribution: isActive ? P : 0n,
        refundOwedToSellerContribution: isActive ? bondTwo(G) : 0n,
        retainedEarningsContribution: isActive ? P : 0n,

        salesContribution: P,
        costContribution: isActive ? 0n : P,
        netIncomeContribution: isActive ? P : 0n,
    };
}

/**
 * Project a single order's contribution into the running aggregates. Called
 * from `projectFinancials` once per order in scope.
 */
function projectOrder(
    order: Order,
    lineItem: OrderLineItem,
    balanceSheet: Record<CurrencyKey, BalanceSheetEntry>,
    incomeStatement: Record<CurrencyKey, IncomeStatementEntry>,
    cashFlow: CashFlowEntry[],
    seenCurrencies: Set<CurrencyKey>,
    currenciesInOrder: CurrencyKey[],
): void {
    const currency = lineItem.currency;
    if (!seenCurrencies.has(currency)) {
        seenCurrencies.add(currency);
        currenciesInOrder.push(currency);
        balanceSheet[currency] = emptyBalanceSheet();
        incomeStatement[currency] = emptyIncomeStatement();
    }

    const bs = balanceSheet[currency];
    const ist = incomeStatement[currency];

    bs.buyerCustody += lineItem.buyerCustodyContribution;
    bs.sellerCustody += lineItem.sellerCustodyContribution;
    bs.refundOwedToBuyer += lineItem.refundOwedToBuyerContribution;
    bs.refundOwedToSeller += lineItem.refundOwedToSellerContribution;
    bs.retainedEarnings += lineItem.retainedEarningsContribution;

    ist.sales += lineItem.salesContribution;
    ist.cost += lineItem.costContribution;

    // Cash flow: commit-time pulls (always, since the order has committed).
    cashFlow.push({
        kind: "commit-buyer-deposit",
        orderId: order.id,
        currency,
        amount: bondTwo(order.payment),
        party: order.buyer,
    });
    cashFlow.push({
        kind: "commit-seller-deposit",
        orderId: order.id,
        currency,
        amount: bondTwo(order.cumulativeValue),
        party: order.seller,
    });

    if (order.state === OrderState.Resolved) {
        cashFlow.push({
            kind: "resolve-buyer-refund",
            orderId: order.id,
            currency,
            amount: order.payment,
            party: order.buyer,
        });
        cashFlow.push({
            kind: "resolve-seller-payout",
            orderId: order.id,
            currency,
            amount: bondTwo(order.cumulativeValue) + order.payment,
            party: order.seller,
        });
    }
}

/**
 * Project a financial-statement view from a set of orders.
 *
 * @param orders   The order set to project. Caller controls scope by filtering
 *                 (e.g. all orders sharing a `processId`, a single `orderHash`,
 *                 or all orders for an assembly).
 * @param scope    Display label — "order" for a single-order view,
 *                 "process" for a multi-order consolidation.
 * @param scopeId  The id this projection is keyed by (orderHash or processId).
 */
export function projectFinancials(
    orders: readonly Order[],
    scope: "order" | "process",
    scopeId: string,
): FinancialsModel {
    const balanceSheet: Record<CurrencyKey, BalanceSheetEntry> = {};
    const incomeStatement: Record<CurrencyKey, IncomeStatementEntry> = {};
    const cashFlow: CashFlowEntry[] = [];
    const seenCurrencies = new Set<CurrencyKey>();
    const currencies: CurrencyKey[] = [];
    const orderIds: string[] = [];
    const lineItems: OrderLineItem[] = [];

    for (const order of orders) {
        const lineItem = buildLineItem(order);
        lineItems.push(lineItem);
        projectOrder(order, lineItem, balanceSheet, incomeStatement, cashFlow, seenCurrencies, currencies);
        orderIds.push(order.id);
    }

    // Compute net income per currency. Active orders contribute sales without
    // cost (the net is the retained-earnings figure pending resolution); resolved
    // orders contribute equal sales + cost (net = 0). Across a process the total
    // net = sum of retained-earnings on active orders.
    for (const currency of currencies) {
        const ist = incomeStatement[currency];
        ist.netIncome = ist.sales - ist.cost;
    }

    return {
        scope,
        scopeId,
        currencies,
        balanceSheet,
        incomeStatement,
        cashFlow,
        lineItems,
        orderIds,
    };
}

/**
 * Verify the bookkeeping identity for one currency segment:
 *
 *   buyerCustody + sellerCustody === refundOwedToBuyer + refundOwedToSeller + retainedEarnings
 *
 * Returns true if the identity holds. Used in tests and as a runtime sanity
 * check on derived projections — if it ever fails, either an upstream order
 * has been mutated incorrectly or the projection itself drifted from the
 * kernel math.
 */
export function checkBalanceSheetIdentity(entry: BalanceSheetEntry): boolean {
    const assets = entry.buyerCustody + entry.sellerCustody;
    const liabPlusEquity = entry.refundOwedToBuyer + entry.refundOwedToSeller + entry.retainedEarnings;
    return assets === liabPlusEquity;
}
