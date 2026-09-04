import { describe, it, expect } from "vitest";
import { canonicalContentHash, templateCompositionHash } from "@figaro-protocol/sdk";
import {
    parseExplorerQuery, serializeExplorerQuery, selectRows, facetValues, explorerBreadcrumb,
    anchorForFamily, storedDocument, STORED_DOCUMENT_NOTE,
    type ExplorerRow,
} from "@/lib/registries/explorer";

const row = (over: Partial<ExplorerRow>): ExplorerRow => ({
    family: "clauses", key: "k", name: "n", id: "i", article: "", registeredBy: "0xA",
    blockNumber: 1n, stakeWithdrawn: false, clauses: [], content: "resolved",
    contentURI: "", anchoredHash: "", text: "", ...over,
});

const ROWS: ExplorerRow[] = [
    row({ key: "c1", id: "figaro-commerce", name: "Commerce", article: "mandatory", registeredBy: "0xDAO", blockNumber: 10n, text: "figaro-commerce Commerce mandatory 0xDAO" }),
    row({ key: "c2", id: "figaro-schedule", name: "Schedule", article: "coordination", registeredBy: "0xFounder", blockNumber: 30n, text: "figaro-schedule Schedule coordination 0xFounder" }),
    row({ key: "c3", id: "figaro-old", name: "Old", article: "coordination", registeredBy: "0xFounder", blockNumber: 5n, stakeWithdrawn: true, text: "figaro-old Old coordination" }),
    row({ family: "assemblies", key: "a1", id: "asm-1", name: "Equipment hire", registeredBy: "0xFounder", blockNumber: 40n, clauses: ["figaro-commerce", "figaro-utility-token"], text: "asm-1 Equipment hire figaro-commerce figaro-utility-token" }),
    row({ family: "assemblies", key: "a2", id: "asm-2", name: "Point of sale", registeredBy: "0xDAO", blockNumber: 20n, clauses: ["figaro-commerce", "figaro-geolocation"], text: "asm-2 Point of sale figaro-commerce figaro-geolocation" }),
    row({ family: "members", key: "m1", id: "0xfounder", name: "Figaro founder", registeredBy: "0xFounder", blockNumber: 50n, text: "0xfounder Figaro founder" }),
];

describe("parseExplorerQuery / serializeExplorerQuery", () => {
    it("defaults to live clauses sorted by article, and tolerates junk", () => {
        const s = parseExplorerQuery(new URLSearchParams("family=bogus&sort=popularity&stake=nope"));
        expect(s).toEqual({ family: "clauses", q: "", sort: "article", article: "", registeredBy: "", stake: "live", clause: "" });
    });
    it("round-trips a facet state and omits defaults", () => {
        const s = parseExplorerQuery(new URLSearchParams("family=assemblies&clause=figaro-commerce&sort=name"));
        expect(s.family).toBe("assemblies");
        expect(s.clause).toBe("figaro-commerce");
        expect(serializeExplorerQuery(s)).toBe("family=assemblies&sort=name&clause=figaro-commerce");
        expect(serializeExplorerQuery(parseExplorerQuery({}))).toBe("family=clauses");
    });
});

describe("selectRows", () => {
    it("filters by family and hides withdrawn stakes by default (K4 de-surfacing)", () => {
        const out = selectRows(ROWS, parseExplorerQuery({ family: "clauses" }));
        expect(out.map((r) => r.id)).toEqual(["figaro-schedule", "figaro-commerce"]); // article asc: coordination, mandatory
    });
    it("shows withdrawn only when asked", () => {
        expect(selectRows(ROWS, parseExplorerQuery({ family: "clauses", stake: "withdrawn" })).map((r) => r.id)).toEqual(["figaro-old"]);
        expect(selectRows(ROWS, parseExplorerQuery({ family: "clauses", stake: "all" })).length).toBe(3);
    });
    it("facets: article, registeredBy (case-insensitive), composing clause, and free text", () => {
        expect(selectRows(ROWS, parseExplorerQuery({ family: "clauses", article: "mandatory" })).map((r) => r.id)).toEqual(["figaro-commerce"]);
        expect(selectRows(ROWS, parseExplorerQuery({ family: "assemblies", registeredBy: "0xfounder" })).map((r) => r.id)).toEqual(["asm-1"]);
        expect(selectRows(ROWS, parseExplorerQuery({ family: "assemblies", clause: "figaro-geolocation" })).map((r) => r.id)).toEqual(["asm-2"]);
        expect(selectRows(ROWS, parseExplorerQuery({ family: "assemblies", q: "SALE" })).map((r) => r.id)).toEqual(["asm-2"]);
    });
    it("sorts: block most-recent first, name, registeredBy", () => {
        expect(selectRows(ROWS, parseExplorerQuery({ family: "assemblies" })).map((r) => r.id)).toEqual(["asm-1", "asm-2"]);
        expect(selectRows(ROWS, parseExplorerQuery({ family: "assemblies", sort: "name" })).map((r) => r.id)).toEqual(["asm-1", "asm-2"]);
        expect(selectRows(ROWS, parseExplorerQuery({ family: "clauses", sort: "registeredBy", stake: "all" })).map((r) => r.registeredBy)).toEqual(["0xDAO", "0xFounder", "0xFounder"]);
    });
    it("lists every registered member — no seller-only gate", () => {
        expect(selectRows(ROWS, parseExplorerQuery({ family: "members" })).map((r) => r.name)).toEqual(["Figaro founder"]);
    });
});

describe("facetValues + explorerBreadcrumb", () => {
    it("derives facet values from the rows, never a fixed list", () => {
        expect(facetValues(ROWS, "clauses", "article")).toEqual(["coordination", "mandatory"]);
        expect(facetValues(ROWS, "assemblies", "registeredBy")).toEqual(["0xdao", "0xfounder"]);
    });
    it("builds the deep-link trail from the active facet", () => {
        expect(explorerBreadcrumb(parseExplorerQuery({ family: "clauses", article: "mandatory" })).map((b) => b.label))
            .toEqual(["Build", "Registries", "Clauses", "mandatory"]);
        expect(explorerBreadcrumb(parseExplorerQuery({ family: "members" })).map((b) => b.label))
            .toEqual(["Build", "Registries", "Members"]);
    });
});

describe("the document as stored — the reader re-derives the anchor themselves", () => {
    // A clause spec's anchor covers the WHOLE document; an assembly's covers
    // its composition slice alone. Both fixtures are hashed with the SAME
    // functions the loaders use, so the test cannot drift from the chain's
    // arithmetic by restating it.
    const SPEC = {
        clauseId: "figaro-applicable-law",
        version: 1,
        title: "Applicable law",
        fields: [{ name: "jurisdiction", type: "string" }],
    };
    const TEMPLATE = {
        name: "Equipment hire",
        summary: "The designer's own words — deliberately outside the anchor.",
        agreements: [{ id: "order-0", clauses: { "figaro-commerce": { payment: "1" } } }],
    };

    it("names the anchor each family carries, and none for members", () => {
        expect(anchorForFamily("clauses")).toBe("content-hash");
        expect(anchorForFamily("assemblies")).toBe("composition-hash");
        expect(anchorForFamily("members")).toBeNull();
    });

    it("every anchor has the one-line note that says what it covers", () => {
        expect(STORED_DOCUMENT_NOTE["content-hash"]).toMatch(/keccak256/);
        expect(STORED_DOCUMENT_NOTE["content-hash"]).toMatch(/canonical/i);
        expect(STORED_DOCUMENT_NOTE["composition-hash"]).toMatch(/keccak256/);
    });

    it("a clause's served bytes reproduce ClauseRegistry's contentHash", () => {
        const anchored = canonicalContentHash(SPEC);
        const v = storedDocument(JSON.stringify(SPEC), anchored, "content-hash");
        expect(v.matches).toBe(true);
        expect(v.recomputed).toBe(anchored);
        expect(v.anchor).toBe("content-hash");
    });

    it("the check is on the CANONICAL form, so pinned whitespace and key order do not matter", () => {
        const anchored = canonicalContentHash(SPEC);
        const reordered = JSON.stringify(
            { version: 1, title: "Applicable law", fields: SPEC.fields, clauseId: SPEC.clauseId },
            null,
            4,
        );
        expect(storedDocument(reordered, anchored, "content-hash").matches).toBe(true);
    });

    it("a drifted pin does NOT match, and says what it hashed to", () => {
        const anchored = canonicalContentHash(SPEC);
        const drifted = JSON.stringify({ ...SPEC, title: "Applicable law (edited)" });
        const v = storedDocument(drifted, anchored, "content-hash");
        expect(v.matches).toBe(false);
        expect(v.recomputed).not.toBeNull();
        expect(v.recomputed).not.toBe(anchored);
    });

    it("bytes that will not parse recompute NOTHING — absence, never a false verdict", () => {
        const v = storedDocument("not json at all", canonicalContentHash(SPEC), "content-hash");
        expect(v.recomputed).toBeNull();
        expect(v.matches).toBe(false);
    });

    it("an assembly's served bytes reproduce the registry's compositionHash", () => {
        const anchored = templateCompositionHash(TEMPLATE as Parameters<typeof templateCompositionHash>[0]);
        const v = storedDocument(JSON.stringify(TEMPLATE), anchored, "composition-hash");
        expect(v.matches).toBe(true);
        expect(v.anchor).toBe("composition-hash");
    });

    it("an assembly's editorial wording is OUTSIDE its anchor — reword it and the hash holds", () => {
        const anchored = templateCompositionHash(TEMPLATE as Parameters<typeof templateCompositionHash>[0]);
        const reworded = JSON.stringify({ ...TEMPLATE, name: "Kit hire", summary: "Different words entirely." });
        expect(storedDocument(reworded, anchored, "composition-hash").matches).toBe(true);
        // Changing the COMPOSITION does break it — the anchor is the terms.
        const retermed = JSON.stringify({ ...TEMPLATE, agreements: [{ id: "order-0", clauses: { "figaro-commerce": { payment: "2" } } }] });
        expect(storedDocument(retermed, anchored, "composition-hash").matches).toBe(false);
    });

    it("compares hashes case-insensitively — hex casing is not a mismatch", () => {
        const anchored = canonicalContentHash(SPEC);
        expect(storedDocument(JSON.stringify(SPEC), anchored.toUpperCase(), "content-hash").matches).toBe(true);
    });
});
