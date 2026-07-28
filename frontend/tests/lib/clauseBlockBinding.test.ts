import { describe, expect, it } from "vitest";
import type { SpecParseError } from "@figaro/sdk/clauses";
import { parseBlockBinding, type ClauseBlockBinding } from "@/lib/shared/clauseBlockBinding";

/**
 * Block-binding parse tests — the `block` slice of a clause spec is the UI half
 * of the clause document (frontend-owned; the SDK `ClauseSpec` is content-only),
 * organized into PHASE SECTIONS by reader: `design` (canvas/drawer), `checkout`
 * (the fold), `runtime` (the capability rail).
 *
 * `design.article` is the ONE required declaration (the drawer grouping
 * heading). Everything else degrades on absence to its empty value
 * (resolved-empty = absence — a sparser third-party spec still surfaces) and
 * errors on malformation. The repo's own specs express every attribute
 * explicitly; that standard is enforced by the SDK's JSON-Schema conformance suite,
 * not by this parser.
 */

/** Parse a block object; returns the binding (or null) — errors collected internally. */
function parse(raw: unknown): { block: ClauseBlockBinding | null; errors: SpecParseError[] } {
    const errors: SpecParseError[] = [];
    const block = parseBlockBinding(raw, "$.block", errors);
    return { block, errors };
}

describe("parseBlockBinding — clause block-binding (sectioned UI half)", () => {
    it("rejects a non-object input", () => {
        const { block, errors } = parse("nope");
        expect(block).toBeNull();
        expect(errors[0]?.path).toBe("$.block");
    });

    it("rejects a block missing the design section", () => {
        const { block, errors } = parse({});
        expect(block).toBeNull();
        expect(errors.some((e) => e.path === "$.block.design")).toBe(true);
    });

    it("rejects a design section missing article (the one required declaration)", () => {
        const { block, errors } = parse({ design: {} });
        expect(block).toBeNull();
        expect(errors.some((e) => e.path === "$.block.design.article")).toBe(true);
    });

    it("parses a minimal binding (design.article only) — absent attributes degrade to empty", () => {
        const { block } = parse({ design: { article: "coordination" } });
        expect(block).not.toBeNull();
        expect(block?.design.article).toBe("coordination");
        expect(block?.design.nestsUnder).toBeNull();
        expect(block?.design.fills).toEqual([]);
        expect(block?.design.composes).toBeNull();
        expect(block?.checkout.catalogueFills).toEqual([]);
        expect(block?.checkout.profileFills).toEqual([]);
        expect(block?.runtime.interaction).toBeNull();
        expect(block?.runtime.fields).toEqual([]);
    });

    it("parses explicit empty values identically to absence (expressed-not-absent standard)", () => {
        const { block, errors } = parse({
            design: { article: "logistics", nestsUnder: null, fills: [], composes: null },
            checkout: { catalogueFills: [], profileFills: [] },
            runtime: { interaction: null, fields: [] },
        });
        expect(errors).toEqual([]);
        expect(block?.design.nestsUnder).toBeNull();
        expect(block?.runtime.interaction).toBeNull();
    });

    it("preserves design.fills (the designer's tailoring field names)", () => {
        const { block } = parse({ design: { article: "consent", fills: ["documents"] } });
        expect(block?.design.fills).toEqual(["documents"]);
    });

    it("rejects a design.fills carrying an empty field name", () => {
        const { block, errors } = parse({ design: { article: "consent", fills: [""] } });
        expect(block).toBeNull();
        expect(errors.some((e) => e.path === "$.block.design.fills")).toBe(true);
    });

    it("preserves checkout.catalogueFills and checkout.profileFills", () => {
        const { block } = parse({
            design: { article: "logistics" },
            checkout: { catalogueFills: ["nmfcClass"], profileFills: ["divisor"] },
        });
        expect(block?.checkout.catalogueFills).toEqual(["nmfcClass"]);
        expect(block?.checkout.profileFills).toEqual(["divisor"]);
    });

    it("rejects a non-array catalogueFills", () => {
        const { block, errors } = parse({
            design: { article: "logistics" },
            checkout: { catalogueFills: true },
        });
        expect(block).toBeNull();
        expect(errors.some((e) => e.path === "$.block.checkout.catalogueFills")).toBe(true);
    });

    // The drawer's cross-clause nesting (e.g. a proximity policy under the hand-off
    // clause's `handoff` field) is read from design.nestsUnder — it MUST round-trip.
    it("preserves design.nestsUnder", () => {
        const { block } = parse({ design: { article: "coordination", nestsUnder: "handoff" } });
        expect(block?.design.nestsUnder).toBe("handoff");
    });

    it("rejects an empty-string design.nestsUnder", () => {
        const { block } = parse({ design: { article: "coordination", nestsUnder: "" } });
        expect(block).toBeNull();
    });

    it("preserves runtime.interaction", () => {
        const { block } = parse({
            design: { article: "logistics" },
            runtime: { interaction: { interface: "qr-challenge" } },
        });
        expect(block?.runtime.interaction?.interface).toBe("qr-challenge");
    });

    it("parses runtime.fields through the SDK field parser (one parser for both halves)", () => {
        const { block, errors } = parse({
            design: { article: "dispute-resolution" },
            runtime: { fields: [{ name: "openingClaim", type: "string", required: true }] },
        });
        expect(errors).toEqual([]);
        expect(block?.runtime.fields[0]?.name).toBe("openingClaim");
    });

    it("rejects a malformed runtime field spec", () => {
        const { block, errors } = parse({
            design: { article: "dispute-resolution" },
            runtime: { fields: [{ name: "x", type: "enum", required: true }] },
        });
        expect(block).toBeNull();
        expect(errors.some((e) => e.path.startsWith("$.block.runtime.fields[0]"))).toBe(true);
    });

    // composes.forumUrl is rendered as a link — only https: is accepted. A
    // non-https scheme must degrade the same way any other malformed block
    // field does: null + a pushed SpecParseError, never a thrown exception.
    describe("design.composes.forumUrl — https-only scheme gate", () => {
        const withUrl = (forumUrl: string) => ({
            design: { article: "dispute-resolution", composes: { interface: "kleros-v1", forumUrl } },
        });

        it("parses a valid https forumUrl", () => {
            const { block, errors } = parse(withUrl("https://forum.example.com/case/1"));
            expect(errors).toEqual([]);
            expect(block?.design.composes?.forumUrl).toBe("https://forum.example.com/case/1");
        });

        it("rejects a javascript: forumUrl", () => {
            const { block, errors } = parse(withUrl("javascript:alert(1)"));
            expect(block).toBeNull();
            expect(errors.some((e) => e.path === "$.block.design.composes.forumUrl")).toBe(true);
        });

        it("rejects a data: forumUrl", () => {
            const { block, errors } = parse(withUrl("data:text/html,<script>alert(1)</script>"));
            expect(block).toBeNull();
            expect(errors.some((e) => e.path === "$.block.design.composes.forumUrl")).toBe(true);
        });

        it("rejects a plain http: forumUrl (no downgrade)", () => {
            const { block, errors } = parse(withUrl("http://forum.example.com/case/1"));
            expect(block).toBeNull();
            expect(errors.some((e) => e.path === "$.block.design.composes.forumUrl")).toBe(true);
        });

        it("rejects a protocol-relative // forumUrl", () => {
            const { block, errors } = parse(withUrl("//forum.example.com/case/1"));
            expect(block).toBeNull();
            expect(errors.some((e) => e.path === "$.block.design.composes.forumUrl")).toBe(true);
        });

        it("rejects a whitespace-obfuscated scheme", () => {
            const { block, errors } = parse(withUrl(" \tjavascript:alert(1)"));
            expect(block).toBeNull();
            expect(errors.some((e) => e.path === "$.block.design.composes.forumUrl")).toBe(true);
        });
    });
});
