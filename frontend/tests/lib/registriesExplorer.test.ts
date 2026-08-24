import { describe, it, expect } from "vitest";
import {
    parseExplorerQuery, serializeExplorerQuery, selectRows, facetValues, explorerBreadcrumb,
    type ExplorerRow,
} from "@/lib/registries/explorer";

const row = (over: Partial<ExplorerRow>): ExplorerRow => ({
    family: "clauses", key: "k", name: "n", id: "i", article: "", registeredBy: "0xA",
    blockNumber: 1n, stakeWithdrawn: false, clauses: [], content: "resolved", text: "", ...over,
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
