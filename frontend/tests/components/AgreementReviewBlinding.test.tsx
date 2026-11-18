/**
 * AgreementReview — a private clause's blinding value is no term. The review a
 * party reads before signing says the clause carries one, in words, and the
 * exhaustive dump below still shows every committed key, the blinding value
 * among them, so nothing the signer binds is hidden.
 */
import React from "react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ZERO_BYTES32, type Agreement, type Commitment } from "@figaro-protocol/sdk";
import { loadClauseSpec, setClauseSpecFetcher } from "@/lib/shared/clauseSpecSource";
import { pinSpec } from "../lib/primeClauseSpecs";

vi.mock("@/hooks/useTokenDecimals", () => ({ default: () => ({ decimals: 6, ready: true, loading: false }) }));

import { AgreementReview } from "@/components/runtime/AgreementReview";

const SPEC = {
    clauseId: "test-private-grade",
    version: 1,
    title: "Private grade",
    description: "A private value of few possibilities.",
    fields: [
        { name: "grade", type: "enum", values: ["a", "b", "c"], required: true, disposition: "private" },
        { name: "seal", type: "string", format: "bytes32-hex", required: true, disposition: "private", blinding: true },
    ],
};
const PINNED = pinSpec(SPEC);
const SEAL = `0x${"3c".repeat(32)}`;

const commitment: Commitment = {
    processId: ZERO_BYTES32,
    buyer: "0x1111111111111111111111111111111111111111",
    seller: "0x2222222222222222222222222222222222222222",
    token: "0x3333333333333333333333333333333333333333",
    payment: 1n,
    runningTotal: 1n,
    checkoutHash: `0x${"ab".repeat(32)}`,
    salt: 1n,
    commitDeadline: 1_900_000_000n,
};
const agreement: Agreement = {
    version: "a1",
    buyer: commitment.buyer,
    seller: commitment.seller,
    clauses: [{ clause: PINNED.clauseKey, data: { grade: "b", seal: SEAL } }],
};

beforeAll(async () => {
    setClauseSpecFetcher(async () => PINNED.bytes);
    await loadClauseSpec(PINNED.clauseKey, "mem://private-grade");
});

afterEach(() => cleanup());

describe("AgreementReview and a private clause's blinding value", () => {
    it("says the clause carries a blinding value, and the note prints no value", () => {
        render(<AgreementReview commitment={commitment} agreement={agreement} />);
        const note = screen.getByTestId(`preview-clause-blinding-${PINNED.clauseKey}`);
        expect(note.textContent).toMatch(/blinding value/);
        expect(note.textContent).not.toContain("3c3c");
    });

    it("keeps every committed key in the exhaustive dump", () => {
        render(<AgreementReview commitment={commitment} agreement={agreement} />);
        expect(screen.getByTestId("preview-clauses").textContent).toContain(SEAL);
    });
});
