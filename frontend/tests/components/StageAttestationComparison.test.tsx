/**
 * Attestations compared — whether the parties' filings under one stage of an
 * assembly-scoped clause agree, derived at read time.
 *
 * The clause here is made up: an assembly-scoped spec with a declared witness
 * stage, loaded into the spec cache as `useClauseSpecs` loads a registered
 * one. The reader names no clause, so a spec it has never seen flows through
 * it: two parties filing the same values agree (array order carries no
 * meaning, hex case none where the spec declares hex), two parting on a field
 * differ on that field, a party filing differently on two orders differs from
 * itself, a free string is compared as written, a lone filing is one party only, content that does not resolve compares
 * nothing, and an agreement-scoped clause's stage is not compared at all.
 */
import React from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, within } from "@testing-library/react";
import { encodeContentFromSpec } from "@figaro-protocol/sdk/clauses";
import { keccak256, type Hex } from "viem";

const published = new Map<string, Hex>();
vi.mock("@/lib/composition/witnessContent", () => ({
    fetchWitnessContent: async (ref: string) => published.get(ref.toLowerCase()) ?? null,
}));
vi.mock("@/lib/protocol/useClauseSpecs", () => ({ useClauseSpecs: () => ({ version: 0, loaded: true, errors: [] }) }));

import { StageAttestationComparison } from "@/components/runtime/StageAttestationComparison";
import type { RuntimeAttestation } from "@/lib/composition/indexer";
import { getClauseSpec, loadClauseSpec, setClauseSpecFetcher } from "@/lib/shared/clauseSpecSource";
import { pinSpec } from "../lib/primeClauseSpecs";

const BUYER = "0x1111111111111111111111111111111111111111";
const SELLER = "0x2222222222222222222222222222222222222222";
const COURIER = "0x3333333333333333333333333333333333333333";
const DOC = `0x${"ab".repeat(32)}`;
const OTHER_DOC = `0x${"cd".repeat(32)}`;
const ORDER_A = `0x${"0a".repeat(32)}`;
const ORDER_B = `0x${"0b".repeat(32)}`;

const stageFields = [
    { name: "note", type: "string", required: true, minLength: 1, maxLength: 140, label: "Note" },
    { name: "docHash", type: "string", format: "bytes32-hex", required: true, label: "Document fingerprint" },
    {
        name: "moves",
        type: "array",
        required: true,
        minItems: 0,
        label: "Moves",
        items: {
            type: "object",
            fields: [
                { name: "from", type: "string", format: "address-hex", required: true },
                { name: "to", type: "string", format: "address-hex", required: true },
                { name: "amount", type: "bigint", required: true, min: "1" },
            ],
        },
    },
    { name: "locator", type: "string", format: "uri", required: false, minLength: 0, maxLength: 512, label: "Locator" },
];

const blockOf = (scope: "assembly" | "agreement") => ({
    design: { article: "test-article", scope, nestsUnder: null, fills: ["designNote"], composes: null },
    checkout: { catalogueFills: [], profileFills: [] },
    runtime: { interaction: null, fields: [] },
});

const specOf = (clauseId: string, scope: "assembly" | "agreement") => ({
    clauseId,
    version: 1,
    title: scope === "assembly" ? "Shared variation" : "Per-order variation",
    description: "A made-up clause for this test.",
    fields: [{ name: "designNote", type: "string", required: true, minLength: 1, maxLength: 140, label: "Design note" }],
    stages: { "1": stageFields },
    block: blockOf(scope),
});

const sharedPin = pinSpec(specOf("figaro-test-shared-variation", "assembly"));
const perOrderPin = pinSpec(specOf("figaro-test-per-order-variation", "agreement"));
const SHARED = sharedPin.clauseKey;
const PER_ORDER = perOrderPin.clauseKey;

beforeAll(async () => {
    const bytes = new Map([["mem://shared", sharedPin.bytes], ["mem://per-order", perOrderPin.bytes]]);
    setClauseSpecFetcher(async (uri) => bytes.get(uri) ?? "");
    await loadClauseSpec(SHARED, "mem://shared");
    await loadClauseSpec(PER_ORDER, "mem://per-order");
});

let block = 10;
/** Publish one filing's content and return its attestation, fingerprinted as the chain carries it. */
function filing(clauseKey: Hex, attester: string, values: Record<string, unknown> | null, orderHash: string = ORDER_A): RuntimeAttestation {
    const spec = getClauseSpec(clauseKey);
    if (!spec) throw new Error("spec not loaded");
    const content = encodeContentFromSpec(spec, values ?? {
        note: "unpublished", docHash: DOC, moves: [],
    }, { stage: 1 });
    const contentRef = keccak256(content);
    if (values) published.set(contentRef.toLowerCase(), content);
    block += 1;
    return { clauseId: clauseKey, orderHash, stage: 1, attester, contentRef, blockNumber: block };
}

const variation = {
    note: "Consignment resold mid-voyage",
    docHash: DOC,
    moves: [
        { from: BUYER, to: SELLER, amount: "500" },
        { from: SELLER, to: COURIER, amount: "120" },
    ],
    locator: "ipfs://doc",
};

async function verdict(clauseKey: Hex): Promise<HTMLElement> {
    const card = await screen.findByTestId(`stage-comparison-${clauseKey.toLowerCase()}-1`);
    const el = within(card).getByTestId("stage-comparison-verdict");
    await waitFor(() => expect(el.getAttribute("data-verdict")).not.toBe("loading"));
    return el;
}

describe("StageAttestationComparison — the parties' filings under one assembly-scoped stage", () => {
    it("two parties filing the same values agree, whatever the order of their array items and the case of their hex", async () => {
        const reordered = {
            ...variation,
            docHash: DOC.toUpperCase().replace("0X", "0x"),
            moves: [...variation.moves].reverse().map((m) => ({ ...m, from: m.from.toUpperCase().replace("0X", "0x") })),
        };
        render(<StageAttestationComparison attestations={[filing(SHARED, BUYER, variation), filing(SHARED, SELLER, reordered)]} />);
        const el = await verdict(SHARED);
        expect(el.textContent).toBe("agree");
        // Each party's wallet and what it filed, hashes shortened.
        const card = screen.getByTestId(`stage-comparison-${SHARED.toLowerCase()}-1`);
        const buyerFiling = within(card).getByTestId(`stage-filing-${BUYER}-${ORDER_A}`);
        expect(buyerFiling.textContent).toContain("Consignment resold mid-voyage");
        expect(buyerFiling.textContent).not.toContain(DOC);
        expect(within(card).getByTestId(`stage-filing-${SELLER}-${ORDER_A}`)).toBeTruthy();
    });

    it("two parties parting on fields differ on exactly those fields, by their labels", async () => {
        const other = { ...variation, docHash: OTHER_DOC, moves: [variation.moves[0]] };
        render(<StageAttestationComparison attestations={[filing(SHARED, BUYER, variation), filing(SHARED, COURIER, other)]} />);
        const el = await verdict(SHARED);
        expect(el.getAttribute("data-verdict")).toBe("differ");
        expect(el.textContent).toBe("differ on: Document fingerprint, Moves");
    });

    it("a party's later filing is its word: an earlier differing filing is superseded", async () => {
        const early = filing(SHARED, SELLER, { ...variation, note: "First draft" });
        render(<StageAttestationComparison attestations={[early, filing(SHARED, BUYER, variation), filing(SHARED, SELLER, variation)]} />);
        expect((await verdict(SHARED)).textContent).toBe("agree");
    });

    it("a party that filed differently on two orders makes the stage differ, and both of its filings show", async () => {
        const onB = { ...variation, docHash: OTHER_DOC };
        render(<StageAttestationComparison attestations={[
            filing(SHARED, BUYER, variation, ORDER_A),
            filing(SHARED, BUYER, onB, ORDER_B),
            filing(SHARED, SELLER, variation, ORDER_A),
        ]} />);
        const el = await verdict(SHARED);
        expect(el.textContent).toBe("differ on: Document fingerprint");
        const card = screen.getByTestId(`stage-comparison-${SHARED.toLowerCase()}-1`);
        expect(within(card).getByTestId(`stage-filing-${BUYER}-${ORDER_A}`)).toBeTruthy();
        expect(within(card).getByTestId(`stage-filing-${BUYER}-${ORDER_B}`)).toBeTruthy();
        expect(within(card).getByTestId(`stage-filing-${SELLER}-${ORDER_A}`)).toBeTruthy();
    });

    it("a free string that looks like hex is compared as written", async () => {
        render(<StageAttestationComparison attestations={[
            filing(SHARED, BUYER, { ...variation, note: "0xABCD" }),
            filing(SHARED, SELLER, { ...variation, note: "0xabcd" }),
        ]} />);
        expect((await verdict(SHARED)).textContent).toBe("differ on: Note");
    });

    it("a lone filing is one party only", async () => {
        render(<StageAttestationComparison attestations={[filing(SHARED, BUYER, variation)]} />);
        expect((await verdict(SHARED)).textContent).toBe("one party only");
    });

    it("an optional field neither party filled agrees", async () => {
        const { locator: _omit, ...withoutLocator } = variation;
        void _omit;
        render(<StageAttestationComparison attestations={[filing(SHARED, BUYER, withoutLocator), filing(SHARED, SELLER, withoutLocator)]} />);
        expect((await verdict(SHARED)).textContent).toBe("agree");
    });

    it("content that does not resolve compares nothing", async () => {
        render(<StageAttestationComparison attestations={[filing(SHARED, BUYER, variation), filing(SHARED, SELLER, null)]} />);
        const el = await verdict(SHARED);
        expect(el.textContent).toBe("content not available");
        const card = screen.getByTestId(`stage-comparison-${SHARED.toLowerCase()}-1`);
        expect(within(card).getByTestId(`stage-filing-${SELLER}-${ORDER_A}`).textContent).toContain("content not available");
    });

    it("an agreement-scoped clause's stage, and a clause with no spec, are not compared", () => {
        const unknown = { ...filing(SHARED, BUYER, variation), clauseId: `0x${"99".repeat(32)}` };
        const { container } = render(
            <StageAttestationComparison attestations={[filing(PER_ORDER, BUYER, variation), filing(PER_ORDER, SELLER, variation), unknown]} />,
        );
        expect(container.innerHTML).toBe("");
    });
});
