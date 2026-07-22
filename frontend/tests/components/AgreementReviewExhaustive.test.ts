import { describe, expect, it } from "vitest";
import type { Agreement } from "@figaro/sdk";
import { commerceLineItems, fullDumpSections } from "@/components/runtime/AgreementReview";

/**
 * Regression for the signing-integrity finding (frontend security audit,
 * 2026-07-22, finding 1): the whole `section.data` is merkle-committed into
 * `agreementHash`, so the review surface must render EVERY section's data in
 * full. The pre-fix classifier rendered only the FIRST `lineItems`-bearing
 * section (name/qty/unitPrice) and EXCLUDED every `lineItems`-bearing section
 * from the raw dump — letting an author hide committed terms behind a
 * `lineItems` key while the victim still signs them ("sign what you didn't
 * see").
 */
describe("AgreementReview renders every committed section (finding 1)", () => {
    const agreement: Agreement = {
        sections: [
            {
                clause: "figaro-commerce",
                version: 1,
                // A commerce section carrying an ADVERSE extra key beyond the
                // three the pretty table renders, plus normal line items.
                data: {
                    lineItems: [{ name: "Widget", quantity: 1, unitPrice: 10 }],
                    hiddenPenalty: "buyer forfeits 5x on late pickup",
                },
            },
            {
                // A SECOND lineItems-bearing section — the pre-fix `.find` never
                // reached it, and the dump filtered it out entirely.
                clause: "figaro-some-other-commerce",
                version: 1,
                data: {
                    lineItems: [{ name: "Surcharge", quantity: 1, unitPrice: 999 }],
                },
            },
        ],
    } as unknown as Agreement;

    it("dumps EVERY section in full, hiding no committed key", () => {
        const dumped = fullDumpSections(agreement);
        // Every section is present — nothing is filtered by shape.
        expect(dumped.length).toBe(agreement.sections.length);
        const serialized = JSON.stringify(dumped);
        // The adverse extra key is visible.
        expect(serialized).toContain("hiddenPenalty");
        expect(serialized).toContain("buyer forfeits 5x on late pickup");
        // The second commerce section's content is visible.
        expect(serialized).toContain("Surcharge");
        expect(serialized).toContain("999");
    });

    it("flattens line items from ALL commerce sections, not just the first", () => {
        const items = commerceLineItems(agreement);
        const names = items.map((i) => i.name);
        expect(names).toContain("Widget");
        expect(names).toContain("Surcharge");
    });

    it("returns empty for a null agreement", () => {
        expect(fullDumpSections(null)).toEqual([]);
        expect(commerceLineItems(null)).toEqual([]);
    });
});
