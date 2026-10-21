import { describe, it, expect } from "vitest";
import { agreementHashOf, canonicalContentHash, canonicalize, computeClauseKey, assemblyCompositionHash } from "@figaro-protocol/sdk";
import { keccak256, stringToBytes } from "viem";
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
            .toEqual(["Terms", "Registries", "Clauses", "mandatory"]);
        expect(explorerBreadcrumb(parseExplorerQuery({ family: "members" })).map((b) => b.label))
            .toEqual(["Terms", "Registries", "Members"]);
    });
});

describe("the document as stored — the reader re-derives the anchor themselves", () => {
    // A clause's key is the hash of its exact pinned bytes (the canonical
    // form the designer pins); an assembly's anchor covers its composition
    // slice alone. Both fixtures are hashed with the SAME
    // functions the loaders use, so the test cannot drift from the chain's
    // arithmetic by restating it.
    const SPEC = {
        clauseId: "figaro-applicable-law",
        version: 1,
        title: "Applicable law",
        fields: [{ name: "jurisdiction", type: "string" }],
    };
    const COMMERCE = `0x${"c1".repeat(32)}` as const;
    const AGREEMENT = { name: "Equipment hire · order-0", clauses: { [COMMERCE]: {} } };
    const AGREEMENT_HASH = agreementHashOf(AGREEMENT);
    const ASSEMBLY = {
        name: "Equipment hire",
        summary: "The designer's own words — deliberately outside the anchor.",
        agreements: [{ id: "order-0", agreementHash: AGREEMENT_HASH, clauses: {} }],
    };

    it("names the anchor each family carries, and none for members", () => {
        expect(anchorForFamily("clauses")).toBe("content-hash");
        expect(anchorForFamily("agreements")).toBe("agreement-hash");
        expect(anchorForFamily("assemblies")).toBe("composition-hash");
        expect(anchorForFamily("members")).toBeNull();
    });

    it("every anchor has the one-line note that says what it covers", () => {
        expect(STORED_DOCUMENT_NOTE["content-hash"]).toMatch(/keccak256/);
        expect(STORED_DOCUMENT_NOTE["content-hash"]).toMatch(/exactly these bytes/i);
        expect(STORED_DOCUMENT_NOTE["agreement-hash"]).toMatch(/keccak256/);
        expect(STORED_DOCUMENT_NOTE["composition-hash"]).toMatch(/merkle root/);
    });

    it("a clause's served canonical bytes reproduce its clause key", () => {
        const anchored = computeClauseKey(SPEC);
        const v = storedDocument(canonicalize(SPEC), anchored, "content-hash");
        expect(v.matches).toBe(true);
        expect(v.recomputed).toBe(anchored);
        expect(v.anchor).toBe("content-hash");
        // Bytes or their exact text — one verdict.
        expect(storedDocument(stringToBytes(canonicalize(SPEC)), anchored, "content-hash").matches).toBe(true);
    });

    it("the check is on the EXACT bytes: the same document reformatted is not the clause", () => {
        const anchored = computeClauseKey(SPEC);
        const reordered = JSON.stringify(
            { version: 1, title: "Applicable law", fields: SPEC.fields, clauseId: SPEC.clauseId },
            null,
            4,
        );
        const v = storedDocument(reordered, anchored, "content-hash");
        expect(v.matches).toBe(false);
        expect(v.recomputed).toBe(keccak256(stringToBytes(reordered)));
    });

    it("a drifted pin does NOT match, and says what it hashed to", () => {
        const anchored = computeClauseKey(SPEC);
        const drifted = canonicalize({ ...SPEC, title: "Applicable law (edited)" });
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
        const anchored = assemblyCompositionHash(ASSEMBLY as Parameters<typeof assemblyCompositionHash>[0]);
        const v = storedDocument(JSON.stringify(ASSEMBLY), anchored, "composition-hash");
        expect(v.matches).toBe(true);
        expect(v.anchor).toBe("composition-hash");
    });

    it("an assembly's editorial wording is OUTSIDE its anchor — reword it and the hash holds", () => {
        const anchored = assemblyCompositionHash(ASSEMBLY as Parameters<typeof assemblyCompositionHash>[0]);
        const reworded = JSON.stringify({ ...ASSEMBLY, name: "Kit hire", summary: "Different words entirely." });
        expect(storedDocument(reworded, anchored, "composition-hash").matches).toBe(true);
        // Changing the COMPOSITION does break it — the anchor is the terms.
        const retermed = JSON.stringify({ ...ASSEMBLY, agreements: [{ id: "order-0", agreementHash: `0x${"a2".repeat(32)}`, clauses: {} }] });
        expect(storedDocument(retermed, anchored, "composition-hash").matches).toBe(false);
    });

    it("an agreement's served document reproduces its key; its name is outside the key", () => {
        const v = storedDocument(JSON.stringify(AGREEMENT, null, 2), AGREEMENT_HASH, "agreement-hash");
        expect(v.matches).toBe(true);
        expect(v.anchor).toBe("agreement-hash");
        const renamed = JSON.stringify({ ...AGREEMENT, name: "Kit hire" });
        expect(storedDocument(renamed, AGREEMENT_HASH, "agreement-hash").matches).toBe(true);
        const reclaused = JSON.stringify({ ...AGREEMENT, clauses: { [COMMERCE]: { x: 1 } } });
        expect(storedDocument(reclaused, AGREEMENT_HASH, "agreement-hash").matches).toBe(false);
    });

    it("an honest document reads the same as what was hashed — no differences", () => {
        const v = storedDocument(JSON.stringify(SPEC, null, 2), canonicalContentHash(SPEC), "content-hash");
        expect(v.differences).toEqual([]);
        expect(v.parsedCanonical).toBe(canonicalize(SPEC));
    });

    it("a REPEATED key is named: the text's first occurrence is not what was hashed", () => {
        // A reader of the text meets "Applicable law"; the parse, and so the
        // hash, keeps "Something else".
        const text = JSON.stringify(SPEC).replace(
            '"title":"Applicable law"',
            '"title":"Applicable law","title":"Something else"',
        );
        const hashed = { ...SPEC, title: "Something else" };
        const v = storedDocument(text, keccak256(stringToBytes(text)), "content-hash");
        expect(v.matches).toBe(true);
        expect(v.differences).toEqual(["repeated-key"]);
        expect(v.parsedCanonical).toBe(canonicalize(hashed));
        expect(v.parsedCanonical).not.toContain("Applicable law");
    });

    it("a repeated key in DIFFERENT objects, or inside a string, is not a repetition", () => {
        const text = JSON.stringify({ a: { name: "x" }, b: { name: "y" }, c: '"name":"z","name"' });
        expect(storedDocument(text, "0x00", "content-hash").differences).toEqual([]);
    });

    it("a key the parse DROPS is named, and the hashed value carries none of it", () => {
        const text = JSON.stringify(SPEC).replace("{", '{"__proto__":{"admin":true},');
        const v = storedDocument(text, keccak256(stringToBytes(text)), "content-hash");
        expect(v.matches).toBe(true);
        expect(v.differences).toEqual(["dropped-key"]);
        expect(v.parsedCanonical).not.toContain("admin");
    });

    it("bytes that will not parse carry no parsed value", () => {
        const v = storedDocument("not json at all", canonicalContentHash(SPEC), "content-hash");
        expect(v.parsedCanonical).toBeNull();
        expect(v.differences).toEqual([]);
    });

    it("compares hashes case-insensitively — hex casing is not a mismatch", () => {
        const anchored = computeClauseKey(SPEC);
        expect(storedDocument(canonicalize(SPEC), anchored.toUpperCase(), "content-hash").matches).toBe(true);
    });
});
