import { describe, expect, it } from "vitest";
import type { SpecParseError } from "@figaro-protocol/sdk/clauses";
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

    it("rejects a design clause missing article (the one required declaration)", () => {
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
        expect(block?.checkout.compositionFields).toEqual([]);
        expect(block?.runtime.interaction).toBeNull();
    });

    it("parses explicit empty values identically to absence (expressed-not-absent standard)", () => {
        const { block, errors } = parse({
            design: { article: "logistics", nestsUnder: null, fills: [], composes: null },
            checkout: { catalogueFills: [], profileFills: [], compositionFields: [] },
            runtime: { interaction: null },
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

    it("preserves checkout.catalogueMeasures, and reads its absence as {}", () => {
        const measures = {
            massGrams: { from: "massGrams", combine: "sum" },
            lengthMm: { from: "lengthMm", combine: "single-unit" },
        };
        const { block } = parse({ design: { article: "logistics" }, checkout: { catalogueMeasures: measures } });
        expect(block?.checkout.catalogueMeasures).toEqual(measures);
        expect(parse({ design: { article: "logistics" } }).block?.checkout.catalogueMeasures).toEqual({});
    });

    it("preserves checkout.heldValues, reads its absence as {}, and rejects a bad chain id, address or value list", () => {
        const heldValues = {
            tier: {
                reader: "some-standard",
                contracts: { "10": { registry: `0x${"ab".repeat(20)}` } },
                values: { gold: ["Gold"], silver: ["Metals", "Silver"] },
            },
        };
        const { block } = parse({ design: { article: "terms" }, checkout: { heldValues } });
        expect(block?.checkout.heldValues).toEqual(heldValues);
        expect(parse({ design: { article: "terms" } }).block?.checkout.heldValues).toEqual({});
        const bad = (tier: unknown) => parse({ design: { article: "terms" }, checkout: { heldValues: { tier } } });
        expect(bad({ ...heldValues.tier, reader: "" }).errors.some((e) => e.path === "$.block.checkout.heldValues.tier.reader")).toBe(true);
        expect(bad({ ...heldValues.tier, contracts: { mainnet: { registry: `0x${"ab".repeat(20)}` } } }).block).toBeNull();
        expect(bad({ ...heldValues.tier, contracts: { "10": { registry: "0x1234" } } }).block).toBeNull();
        expect(bad({ ...heldValues.tier, values: { gold: [] } }).errors.some((e) => e.path === "$.block.checkout.heldValues.tier.values.gold")).toBe(true);
    });

    it("rejects a catalogueMeasures entry with no source field or an unknown combinator", () => {
        const noFrom = parse({ design: { article: "logistics" }, checkout: { catalogueMeasures: { massGrams: { combine: "sum" } } } });
        expect(noFrom.block).toBeNull();
        expect(noFrom.errors.some((e) => e.path === "$.block.checkout.catalogueMeasures.massGrams")).toBe(true);
        const badCombine = parse({ design: { article: "logistics" }, checkout: { catalogueMeasures: { massGrams: { from: "massGrams", combine: "average" } } } });
        expect(badCombine.block).toBeNull();
        expect(badCombine.errors.some((e) => e.path === "$.block.checkout.catalogueMeasures.massGrams.combine")).toBe(true);
    });

    it("preserves checkout.pricedLines and checkout.derives, and reads their absence as none", () => {
        const pricedLines = { field: "rows", quantity: "count", unitPrice: "each" };
        const derives = { chargeable: { rule: "dimensional-weight", inputs: { mass: { from: "grossGrams", combine: "sum" }, divisor: { field: "factor" } } } };
        const { block } = parse({ design: { article: "billing" }, checkout: { pricedLines, derives } });
        expect(block?.checkout.pricedLines).toEqual(pricedLines);
        expect(block?.checkout.derives).toEqual(derives);
        const bare = parse({ design: { article: "billing" } }).block;
        expect(bare?.checkout.pricedLines).toBeNull();
        expect(bare?.checkout.derives).toEqual({});
    });

    it("rejects a pricedLines mark missing a role, and a derives entry with a malformed input", () => {
        const noPrice = parse({ design: { article: "billing" }, checkout: { pricedLines: { field: "rows", quantity: "count" } } });
        expect(noPrice.block).toBeNull();
        expect(noPrice.errors.some((e) => e.path === "$.block.checkout.pricedLines")).toBe(true);
        const badInput = parse({ design: { article: "billing" }, checkout: { derives: { chargeable: { rule: "r", inputs: { mass: { from: "g", combine: "average" } } } } } });
        expect(badInput.block).toBeNull();
        expect(badInput.errors.some((e) => e.path === "$.block.checkout.derives")).toBe(true);
    });

    it("preserves checkout.timeWindow and checkout.endpoints under the spec's own field names, and reads their absence as none", () => {
        const timeWindow = { start: "pickUpAt", end: "returnBy" };
        const endpoints = { from: "pickupCell", to: "dropoffCell" };
        const { block } = parse({ design: { article: "billing" }, checkout: { timeWindow, endpoints } });
        expect(block?.checkout.timeWindow).toEqual(timeWindow);
        expect(block?.checkout.endpoints).toEqual(endpoints);
        const bare = parse({ design: { article: "billing" }, checkout: { timeWindow: null } }).block;
        expect(bare?.checkout.timeWindow).toBeNull();
        expect(bare?.checkout.endpoints).toBeNull();
    });

    it("rejects a timeWindow mark without its end, and an endpoints mark with an empty destination", () => {
        const noEnd = parse({ design: { article: "billing" }, checkout: { timeWindow: { start: "pickUpAt" } } });
        expect(noEnd.block).toBeNull();
        expect(noEnd.errors.some((e) => e.path === "$.block.checkout.timeWindow")).toBe(true);
        const emptyTo = parse({ design: { article: "billing" }, checkout: { endpoints: { from: "pickupCell", to: "" } } });
        expect(emptyTo.block).toBeNull();
        expect(emptyTo.errors.some((e) => e.path === "$.block.checkout.endpoints")).toBe(true);
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

    it("parses checkout.compositionFields through the SDK field parser (one parser for both halves)", () => {
        const { block, errors } = parse({
            design: { article: "dispute-resolution" },
            checkout: { compositionFields: [{ name: "openingClaim", type: "string", required: true }] },
        });
        expect(errors).toEqual([]);
        expect(block?.checkout.compositionFields[0]?.name).toBe("openingClaim");
    });

    it("rejects a malformed composition field spec", () => {
        const { block, errors } = parse({
            design: { article: "dispute-resolution" },
            checkout: { compositionFields: [{ name: "x", type: "enum", required: true }] },
        });
        expect(block).toBeNull();
        expect(errors.some((e) => e.path.startsWith("$.block.checkout.compositionFields[0]"))).toBe(true);
    });

    it("rejects composition fields that are not an array", () => {
        const { block, errors } = parse({ design: { article: "dispute-resolution" }, checkout: { compositionFields: {} } });
        expect(block).toBeNull();
        expect(errors.some((e) => e.path === "$.block.checkout.compositionFields")).toBe(true);
    });

    it("reads no field list under runtime: the runtime part carries the interaction and its marks only", () => {
        const { block, errors } = parse({
            design: { article: "dispute-resolution" },
            runtime: { interaction: null, fields: [{ name: "openingClaim", type: "string", required: true }] },
        });
        expect(errors).toEqual([]);
        expect(block?.runtime).toEqual({ interaction: null, modality: null, jurisdiction: null, documentPart: null, ladder: null, contentDigest: null });
        expect(block?.checkout.compositionFields).toEqual([]);
    });

    it("preserves checkout.registerLink, checkout.dataSources and the runtime marks under the spec's own field names, and reads their absence as none", () => {
        const registerLink = { uri: "lookupUrl", id: "badgeNo" };
        const jurisdiction = { law: "governedBy", forum: "seat" };
        const contentDigest = { stage: 3, field: "fileDigest" };
        const { block, errors } = parse({
            design: { article: "terms" },
            checkout: { registerLink, dataSources: "upstreamRuns" },
            runtime: { modality: "servedAs", jurisdiction, documentPart: "cargo", ladder: "milestone", contentDigest },
        });
        expect(errors).toEqual([]);
        expect(block?.checkout.registerLink).toEqual(registerLink);
        expect(block?.checkout.dataSources).toBe("upstreamRuns");
        expect(block?.runtime).toEqual({ interaction: null, modality: "servedAs", jurisdiction, documentPart: "cargo", ladder: "milestone", contentDigest });
        const bare = parse({ design: { article: "terms" }, runtime: { modality: null } }).block;
        expect(bare?.checkout.registerLink).toBeNull();
        expect(bare?.checkout.dataSources).toBeNull();
        expect(bare?.runtime).toEqual({ interaction: null, modality: null, jurisdiction: null, documentPart: null, ladder: null, contentDigest: null });
    });

    it.each([
        ["checkout.registerLink", { checkout: { registerLink: { uri: "lookupUrl" } } }],
        ["runtime.modality", { runtime: { modality: "" } }],
        ["runtime.jurisdiction", { runtime: { jurisdiction: { forum: "seat" } } }],
        ["runtime.jurisdiction", { runtime: { jurisdiction: { law: "governedBy", language: "" } } }],
        ["checkout.dataSources", { checkout: { dataSources: "" } }],
        ["runtime.documentPart", { runtime: { documentPart: 7 } }],
        ["runtime.ladder", { runtime: { ladder: ["milestone"] } }],
        ["runtime.contentDigest", { runtime: { contentDigest: { stage: 256, field: "fileDigest" } } }],
        ["runtime.contentDigest", { runtime: { contentDigest: { stage: 1 } } }],
    ])("rejects a malformed %s mark", (at, parts) => {
        const { block, errors } = parse({ design: { article: "terms" }, ...parts });
        expect(block).toBeNull();
        expect(errors.some((e) => e.path === `$.block.${at}`)).toBe(true);
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
