import { readFileSync } from "node:fs";
import path from "node:path";
import React from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { ZERO_BYTES32, type Agreement, type Commitment } from "@figaro-protocol/sdk";

vi.mock("@/hooks/useTokenDecimals", () => ({ default: () => ({ decimals: undefined, ready: false, loading: true }) }));

import { AgreementReview, fullDumpClauses, pricedLineItems, withheldLeafNotice } from "@/components/runtime/AgreementReview";
import { _resetClauseSpecCache_TESTING_ONLY, loadClauseSpec, setClauseSpecFetcher } from "@/lib/shared/clauseSpecSource";
import { pinSpec } from "../lib/primeClauseSpecs";

/**
 * Regression for the signing-integrity finding (frontend security audit,
 * finding 1): the whole `clauseEntry.data` is merkle-committed into
 * `checkoutHash`, so the review surface must render EVERY clause's data in
 * full. The pre-fix classifier rendered only the FIRST clause carrying line
 * items (name/qty/unitPrice) and EXCLUDED every such clause from the raw
 * dump — letting an author hide committed terms behind the lines while the
 * victim still signs them ("sign what you didn't see").
 *
 * The line items are read through each spec's priced-lines mark
 * (`block.checkout.pricedLines`), never by a field name: the second clause is
 * a stranger's, with its own field names.
 */
const raw = (name: string) => JSON.parse(readFileSync(path.resolve(process.cwd(), `../clauses/${name}.json`), "utf8"));
const commerceRaw = raw("figaro-commerce");
/** The reference commerce clause with the mark its spec declares. */
const COMMERCE = pinSpec({
    ...commerceRaw,
    block: {
        ...commerceRaw.block,
        checkout: { ...commerceRaw.block.checkout, pricedLines: { field: "lineItems", item: "itemId", name: "name", quantity: "quantity", unitPrice: "unitPrice" } },
    },
});
/** A stranger's clause: lines under `rows`, each `label`, `count` × `each`. */
const STRANGER = pinSpec({
    clauseId: "a-strangers-bill",
    version: 1,
    title: "A stranger's bill",
    description: "Rows of a bill.",
    fields: [{
        name: "rows", type: "array", required: true, minItems: 0,
        items: { name: "row", type: "object", required: true, fields: [
            { name: "label", type: "string", required: true },
            { name: "count", type: "integer", required: true, min: 1 },
            { name: "each", type: "bigint", required: true, min: "0" },
        ] },
    }],
    stages: {},
    block: { design: { article: "billing" }, checkout: { pricedLines: { field: "rows", name: "label", quantity: "count", unitPrice: "each" } } },
});
/** The commerce clause with no mark: its field named `lineItems` carries no
 *  meaning. */
const { pricedLines: _mark, ...unmarkedCheckout } = commerceRaw.block.checkout;
const UNMARKED = pinSpec({ ...commerceRaw, title: `${commerceRaw.title} (unmarked)`, block: { ...commerceRaw.block, checkout: unmarkedCheckout } });

beforeAll(async () => {
    _resetClauseSpecCache_TESTING_ONLY();
    const pins = [COMMERCE, STRANGER, UNMARKED];
    const byUri = new Map(pins.map((p) => [`mem://${p.clauseKey}`, p.bytes]));
    setClauseSpecFetcher(async (uri) => byUri.get(uri) ?? "");
    for (const p of pins) await loadClauseSpec(p.clauseKey, `mem://${p.clauseKey}`);
});

describe("AgreementReview renders every committed clauseEntry (finding 1)", () => {
    const agreement: Agreement = {
        clauses: [
            {
                clause: COMMERCE.clauseKey,
                // A commerce clause carrying an ADVERSE extra key beyond the
                // fields the pretty table renders, plus normal line items.
                data: {
                    lineItems: [{ itemId: "w", name: "Widget", quantity: 2, unitPrice: "10" }],
                    hiddenPenalty: "buyer forfeits 5x on late pickup",
                },
            },
            {
                // A SECOND clause marking priced lines — the pre-fix `.find`
                // never reached it, and the dump filtered it out entirely.
                clause: STRANGER.clauseKey,
                data: { rows: [{ label: "Surcharge", count: 1, each: "999" }] },
            },
            {
                // A field named lineItems on a clause with no mark: no line.
                clause: UNMARKED.clauseKey,
                data: { lineItems: [{ itemId: "x", name: "Unmarked", quantity: 1, unitPrice: "5" }] },
            },
        ],
    } as unknown as Agreement;

    it("dumps EVERY clause in full, hiding no committed key", () => {
        const dumped = fullDumpClauses(agreement);
        // Every clause is present — nothing is filtered by shape.
        expect(dumped.length).toBe(agreement.clauses.length);
        const serialized = JSON.stringify(dumped);
        // The adverse extra key is visible.
        expect(serialized).toContain("hiddenPenalty");
        expect(serialized).toContain("buyer forfeits 5x on late pickup");
        // The second clause's content is visible.
        expect(serialized).toContain("Surcharge");
        expect(serialized).toContain("999");
    });

    it("flattens the priced lines of ALL marked clauses, read through each mark, and sums them", () => {
        const { lines, sum } = pricedLineItems(agreement);
        expect(lines).toEqual([
            { itemId: "w", name: "Widget", quantity: "2", unitPrice: "10" },
            { itemId: undefined, name: "Surcharge", quantity: "1", unitPrice: "999" },
        ]);
        expect(sum).toBe(1019n);
    });

    it("gives no sum when a line cannot be read", () => {
        const broken = { clauses: [{ clause: STRANGER.clauseKey, data: { rows: [{ label: "Odd", count: "many", each: "1" }] } }] } as unknown as Agreement;
        expect(pricedLineItems(broken)).toEqual({ lines: [{ itemId: undefined, name: "Odd", quantity: "?", unitPrice: "1" }], sum: null });
    });

    it("shows the lines' sum beside the payment, and says nothing holds the two equal", () => {
        const commitment: Commitment = {
            processId: ZERO_BYTES32,
            buyer: "0x1111111111111111111111111111111111111111",
            seller: "0x2222222222222222222222222222222222222222",
            token: "0x3333333333333333333333333333333333333333",
            payment: 1000n,
            runningTotal: 1000n,
            checkoutHash: `0x${"ab".repeat(32)}`,
            salt: 1n,
            commitDeadline: 1_900_000_000n,
        };
        render(<AgreementReview commitment={commitment} agreement={agreement} />);
        expect(screen.getByTestId("preview-line-items-sum").textContent).toContain("raw: 1019");
        expect(screen.getByTestId("preview-line-items-not-held-equal").textContent).toMatch(/Nothing holds the line items equal to the amount.*Here the two differ\./);
        cleanup();
        render(<AgreementReview commitment={commitment} agreement={{ clauses: [] } as unknown as Agreement} />);
        expect(screen.queryByTestId("preview-line-items-sum")).toBeNull();
        cleanup();
    });

    it("returns empty for a null agreement", () => {
        expect(fullDumpClauses(null)).toEqual([]);
        expect(pricedLineItems(null)).toEqual({ lines: [], sum: null });
    });

    it("a content-withheld leaf is said in words beside its fingerprint, never dumped as an empty box", () => {
        const withheld = { clause: `0x${"ab".repeat(32)}`, dataHash: `0x${"cd".repeat(32)}` } as unknown as Agreement["clauses"][number];
        const notice = withheldLeafNotice(withheld);
        expect(notice).toMatch(/withheld/);
        expect(notice).toContain(`0x${"cd".repeat(32)}`);
        expect(notice).toMatch(/without reading/);
        expect(withheldLeafNotice(agreement.clauses[0])).toBeNull();
    });
});
