/**
 * The audit bundle PDF's hash appendix page tells each attestation's
 * contentRef as what the chain holds: keccak256(content), the hash alone,
 * the content held off chain by the parties — never content sitting in the
 * transaction calldata, which the coordinator never receives.
 *
 * `@react-pdf/renderer`'s primitives are rendered as DOM elements so the
 * page's text can be read.
 */
import React from "react";
import { describe, expect, it, vi } from "vitest";
import { render } from "@testing-library/react";
import { computeCheckoutHash, type Agreement } from "@figaro-protocol/sdk";
import { OrderState, type Order } from "@/lib/kernel/store";

vi.mock("@react-pdf/renderer", () => {
    const passthrough = ({ children }: { children?: React.ReactNode }) => React.createElement("div", null, children);
    return { Document: passthrough, Page: passthrough, View: passthrough, Text: passthrough, StyleSheet: { create: <T,>(s: T) => s } };
});

import { AuditBundlePdf } from "@/lib/audit/pdfBundle";
import { buildAuditBundle } from "@/lib/audit/auditBundle";

const BUYER = "0x1111111111111111111111111111111111111111";
const SELLER = "0x2222222222222222222222222222222222222222";
const AGREEMENT: Agreement = { version: "a1", buyer: BUYER, seller: SELLER, clauses: [{ clause: `0x${"0a".repeat(32)}`, data: { note: "a" } }] };
const ORDER: Order = {
    orderHash: `0x${"cd".repeat(32)}`, processId: `0x${"ab".repeat(32)}`,
    buyer: BUYER, seller: SELLER, currency: `0x${"33".repeat(20)}`,
    cumulativeValue: 1n, payment: 1n, state: OrderState.Active,
    sellerBond: 2n, buyerBond: 2n, salt: 1n, deadline: 0n,
    checkoutHash: computeCheckoutHash(AGREEMENT),
};

describe("AuditBundlePdf — the hash appendix page", () => {
    it("says the chain holds only the contentRef hash and the parties hold the content, never calldata", () => {
        const { container } = render(
            <AuditBundlePdf data={{
                processId: ORDER.processId, buyer: BUYER, missing: [], generatedAt: new Date(0),
                perOrderBundles: [buildAuditBundle(ORDER, AGREEMENT, [])], documents: [],
            } as unknown as Parameters<typeof AuditBundlePdf>[0]["data"]} />,
        );
        const text = container.textContent ?? "";
        expect(text).toContain(
            "Each attestation contentRef = keccak256(content); the chain holds only this hash, and the content is held off chain by the parties.",
        );
        expect(text).not.toMatch(/calldata/i);
    });

    it("draws the page \"What this evidence file does not contain\" with each missing part and its reason", () => {
        const { container } = render(
            <AuditBundlePdf data={{
                processId: ORDER.processId, buyer: BUYER, generatedAt: new Date(0),
                missing: [{ part: "Process timeline", reason: "the read of the chain's events failed" }],
                perOrderBundles: [buildAuditBundle(ORDER, AGREEMENT, [])], documents: [],
            } as unknown as Parameters<typeof AuditBundlePdf>[0]["data"]} />,
        );
        const text = container.textContent ?? "";
        expect(text).toContain("What this evidence file does not contain");
        expect(text).toContain("Process timeline");
        expect(text).toContain("the read of the chain's events failed");
    });
});
