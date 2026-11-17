/**
 * The bond and payout figures of `/audit/view` and of the evidence file (the
 * PDF) are the SDK's arithmetic: `calculateBonds` for the bonds the Core
 * locks, `calculateResolution` for what resolution pays and refunds.
 *
 * The process has two orders. The root order's running total equals its
 * payment; the sub-order's running total (5) is not its payment (2), so its
 * seller's bond is twice the running total (10), never twice the payment (4).
 * A formula that doubles the payment for the seller fails here.
 *
 * The orders enter through `orderFromSdk` (lib/core/store.ts), the one mapping
 * every order read shares, from the SDK's order shape the event fold builds.
 * `/audit/view` draws the statements through its real `ProcessFinancialsView`
 * and `DocumentView`; the evidence file's documents come from the real
 * `buildAuditBundleData`.
 */
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render, within } from "@testing-library/react";
import { calculateBonds, calculateResolution, OrderState, type Order as SdkOrder } from "@figaro-protocol/sdk";

const m = vi.hoisted(() => ({ orders: [] as unknown[] }));
vi.mock("@/hooks/useProcessOrders", () => ({ useProcessOrders: () => ({ status: "present", value: m.orders }) }));
vi.mock("@/components/runtime/DownloadAuditBundleButton", () => ({ DownloadAuditBundleButton: () => null }));

import { orderFromSdk, type Order } from "@/lib/core/store";
import { ProcessFinancialsView } from "@/app/(app)/audit/_components/ProcessFinancialsView";
import { buildAuditBundleData } from "@/lib/audit/auditBundlePdf";
import { DocumentView } from "@/app/(app)/audit/_components/DocumentView";
import type { RenderedDocument } from "@/lib/audit/documentProjection";

const PROCESS = `0x${"ab".repeat(32)}` as const;
const BUYER = "0x00000000000000000000000000000000000000b1" as const;
const ROOT_SELLER = "0x00000000000000000000000000000000000000a1" as const;
const SUB_SELLER = "0x00000000000000000000000000000000000000a2" as const;
const TOKEN = "0x00000000000000000000000000000000000000c1" as const;

/** The two orders of one process, as the event fold builds them. */
function orders(state: OrderState): Order[] {
    const at = (orderHash: string, seller: string, payment: bigint, cumulativeValue: bigint, blockNumber: number) => orderFromSdk({
        orderHash, processId: PROCESS, buyer: BUYER, seller, currency: TOKEN, payment, cumulativeValue,
        checkoutHash: `0x${"cd".repeat(32)}`, salt: 1n, deadline: 2_000_000_000n, state, blockNumber,
    } as unknown as SdkOrder);
    return [
        at(`0x${"01".repeat(32)}`, ROOT_SELLER, 3n, 3n, 4),
        at(`0x${"02".repeat(32)}`, SUB_SELLER, 2n, 5n, 5),
    ];
}

/** The SDK's figures for the same two orders. */
const ROOT = calculateBonds(3n, 3n);
const SUB = calculateBonds(5n, 2n);
const ROOT_RESOLUTION = calculateResolution(3n, ROOT.sellerBond, ROOT.buyerBond);
const SUB_RESOLUTION = calculateResolution(2n, SUB.sellerBond, SUB.buyerBond);

it("the fixture's sub-order separates the running total from the payment", () => {
    expect(SUB.sellerBond).toBe(10n);
    expect(SUB.sellerBond).not.toBe(2n * 2n);
});

/** The figure a statement shows beside `label`, read from the page. */
function shownEntry(statement: HTMLElement, label: string): string | undefined {
    const row = within(statement).getAllByText(label, { exact: true })[0]?.parentElement;
    return row?.querySelectorAll("span")[1]?.textContent ?? undefined;
}

/** The cash-flow row of `kind` for one order, read from the page's table. */
function shownLine(statement: HTMLElement, kind: string, orderHash: string): string | undefined {
    const row = Array.from(statement.querySelectorAll("tbody tr")).find((tr) => {
        const cells = tr.querySelectorAll("td");
        return cells[0]?.textContent === kind && cells[1]?.textContent === orderHash;
    });
    return row?.querySelectorAll("td")[3]?.textContent ?? undefined;
}

describe("/audit/view — the financial statements show the SDK's bonds and payouts", () => {
    it("open orders: each bond, summed, and what resolution will refund, as the SDK computes them", () => {
        m.orders = orders(OrderState.Active);
        const { getByTestId } = render(<ProcessFinancialsView processId={PROCESS} />);
        const consolidated = getByTestId("document-financial-statements-process");
        expect(shownEntry(consolidated, "Seller bonds (Σ2G)")).toBe((ROOT.sellerBond + SUB.sellerBond).toString());
        expect(shownEntry(consolidated, "Buyer bonds (Σ2P)")).toBe((ROOT.buyerBond + SUB.buyerBond).toString());
        expect(shownEntry(consolidated, "Refund owed to buyer (ΣP)")).toBe((ROOT_RESOLUTION.buyerPayout + SUB_RESOLUTION.buyerPayout).toString());
        expect(shownEntry(consolidated, "Refund owed to seller (Σ2G)")).toBe((ROOT.sellerBond + SUB.sellerBond).toString());
        const subOrder = m.orders[1] as Order;
        expect(shownLine(consolidated, "commit-seller-deposit", subOrder.orderHash)).toBe(SUB.sellerBond.toString());
        expect(shownLine(consolidated, "commit-buyer-deposit", subOrder.orderHash)).toBe(SUB.buyerBond.toString());
    });

    it("resolved orders: the sub-order's seller payout and buyer refund, as the SDK computes them", () => {
        m.orders = orders(OrderState.Resolved);
        const { getByTestId } = render(<ProcessFinancialsView processId={PROCESS} />);
        const consolidated = getByTestId("document-financial-statements-process");
        const subOrder = m.orders[1] as Order;
        expect(shownLine(consolidated, "resolve-seller-payout", subOrder.orderHash)).toBe(SUB_RESOLUTION.sellerPayout.toString());
        expect(shownLine(consolidated, "resolve-buyer-refund", subOrder.orderHash)).toBe(SUB_RESOLUTION.buyerPayout.toString());
    });
});

/** The evidence file's documents are the data `buildAuditBundleData` hands the
 *  PDF; each is drawn here through the audit page's `DocumentView`, which shows
 *  every entry and line of a document as it holds it, so the figures read are
 *  the ones the PDF is given. */
describe("the evidence file — its financial statements carry the SDK's bonds and payouts", () => {
    async function statement(state: OrderState, which: (d: RenderedDocument) => boolean): Promise<HTMLElement> {
        const data = await buildAuditBundleData(PROCESS, orders(state), undefined, 31337, new Map(), { includeTimeline: false });
        const doc = data.documents.find(which);
        expect(doc).toBeDefined();
        return render(<DocumentView document={doc!} />).container;
    }
    const consolidated = (d: RenderedDocument) => d.genre === "financial-statements-process";

    it("open orders: the sub-order's seller statement and the consolidated one", async () => {
        expect(shownEntry(await statement(OrderState.Active, consolidated), "Seller bonds (Σ2G)")).toBe((ROOT.sellerBond + SUB.sellerBond).toString());
        const subSeller = await statement(OrderState.Active, (d) => d.genre === "financial-statements-seller" && d.header.some((h) => h.value === SUB_SELLER));
        expect(shownEntry(subSeller, "Seller bonds (Σ2G)")).toBe(SUB.sellerBond.toString());
        expect(shownEntry(subSeller, "Buyer bonds (Σ2P)")).toBe(SUB.buyerBond.toString());
    });

    it("resolved orders: the payout and the refund of each order", async () => {
        const shown = await statement(OrderState.Resolved, consolidated);
        const [root, sub] = orders(OrderState.Resolved);
        expect(shownLine(shown, "resolve-seller-payout", root.orderHash)).toBe(ROOT_RESOLUTION.sellerPayout.toString());
        expect(shownLine(shown, "resolve-seller-payout", sub.orderHash)).toBe(SUB_RESOLUTION.sellerPayout.toString());
        expect(shownLine(shown, "resolve-buyer-refund", sub.orderHash)).toBe(SUB_RESOLUTION.buyerPayout.toString());
    });
});
