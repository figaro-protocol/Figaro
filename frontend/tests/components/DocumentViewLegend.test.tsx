/**
 * DocumentView's legend — the financial statements' labels (Σ2P, Σ2G, the
 * refunds, the cash-flow kinds) explained on screen, from the legend the
 * projection carries. The renderer knows no genre: a document without a
 * legend draws none.
 */
import React from "react";
import { describe, expect, it } from "vitest";
import { render, screen, within } from "@testing-library/react";
import { DocumentView } from "@/app/(app)/audit/_components/DocumentView";
import { FINANCIAL_STATEMENT_LEGEND, projectFinancialStatements } from "@/lib/audit/documentProjection";
import { OrderState, type Order } from "@/lib/kernel/store";

const ORDER: Order = {
    orderHash: "0xA", processId: "0xPROC", buyer: "0xBUYER", seller: "0xSELLER", currency: "0xToKeN",
    cumulativeValue: 100n, payment: 100n, state: OrderState.Active,
    sellerBond: 200n, buyerBond: 200n, salt: 0n, deadline: 0n,
};

describe("DocumentView legend", () => {
    it("renders each label the statement emits beside its description", () => {
        const document = projectFinancialStatements([ORDER], "process", "0xPROC");
        render(<DocumentView document={document} />);
        const legend = screen.getByTestId("document-legend-financial-statements-process");
        expect(within(legend).getByText("Legend")).toBeTruthy();
        for (const { key, description } of document.legend!) {
            expect(within(legend).getByText(key).tagName).toBe("DT");
            expect(within(legend).getByText(description).tagName).toBe("DD");
        }
        expect(within(legend).getByText("Buyer bonds (Σ2P)")).toBeTruthy();
        expect(within(legend).getByText(FINANCIAL_STATEMENT_LEGEND["Seller bonds (Σ2G)"])).toBeTruthy();
        // An open order emits no resolve-side cash flow, so the legend omits it.
        expect(within(legend).queryByText("resolve-seller-payout")).toBeNull();
    });

    it("a document without a legend draws none", () => {
        render(<DocumentView document={{ genre: "packing-list", title: "Packing list", header: [] }} />);
        expect(screen.queryByTestId("document-legend-packing-list")).toBeNull();
        expect(screen.queryByText("Legend")).toBeNull();
    });
});
