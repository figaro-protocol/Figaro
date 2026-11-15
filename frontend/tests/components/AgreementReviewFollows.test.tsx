/**
 * AgreementReview shows the orders this order follows — the topology leaf
 * the parties sign (`Agreement.follows`), beside the provenance:
 *
 *   - each order hash, in full, when the order follows others;
 *   - that it follows none when the list is empty (a root order);
 *   - nothing at all when the leaf is absent: an absent leaf is not an
 *     empty list, and the review never stands one in for the other.
 */
import React from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ZERO_BYTES32, type Agreement, type Commitment, type Hex } from "@figaro-protocol/sdk";

vi.mock("@/hooks/useTokenDecimals", () => ({
    default: () => ({ decimals: undefined, ready: false, loading: true }),
}));

import { AgreementReview } from "@/components/runtime/AgreementReview";

const commitment: Commitment = {
    processId: ZERO_BYTES32,
    buyer: "0x1111111111111111111111111111111111111111",
    seller: "0x2222222222222222222222222222222222222222",
    currency: "0x3333333333333333333333333333333333333333",
    payment: 1n,
    expectedCumulativeValue: 1n,
    checkoutHash: `0x${"ab".repeat(32)}`,
    salt: 1n,
    deadline: 1_900_000_000n,
};

const base: Agreement = {
    version: "a1",
    buyer: commitment.buyer,
    seller: commitment.seller,
    clauses: [],
};

afterEach(cleanup);

describe("AgreementReview shows the orders this order follows", () => {
    it("lists every order hash the order follows, in full", () => {
        const first = `0x${"e1".repeat(32)}` as Hex;
        const second = `0x${"e2".repeat(32)}` as Hex;
        render(<AgreementReview commitment={commitment} agreement={{ ...base, follows: [first, second] }} />);
        const edges = screen.getAllByTestId("preview-follows-edge").map((el) => el.textContent);
        expect(edges).toEqual([first, second]);
        expect(screen.queryByTestId("preview-follows-none")).toBeNull();
    });

    it("says the order follows none when the list is empty", () => {
        render(<AgreementReview commitment={commitment} agreement={{ ...base, follows: [] }} />);
        expect(screen.getByTestId("preview-follows-none").textContent).toMatch(/follows no other order/);
        expect(screen.queryAllByTestId("preview-follows-edge")).toHaveLength(0);
    });

    it("renders nothing for the leaf when the agreement carries none", () => {
        render(<AgreementReview commitment={commitment} agreement={base} />);
        expect(screen.queryByTestId("preview-follows")).toBeNull();
    });
});
