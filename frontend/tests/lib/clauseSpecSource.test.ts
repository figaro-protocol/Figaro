import { afterEach, describe, expect, it } from "vitest";
import { anchorClauseSpec, canonicalContentHash, type Anchored } from "@figaro-protocol/sdk";
import {
    getClauseSpec,
    getClauseSpecLoadError,
    listKnownClauseIds,
    listKnownClauses,
    loadClauseSpec,
    setClauseSpecFetcher,
    clauseIsProcessLog,
    clauseCatalogFills,
    listCatalogSourcedClauses,
    clauseLadderField,
    labelEnumValue,
    specSource,
    _resetClauseSpecCache_TESTING_ONLY,
} from "@/lib/shared/clauseSpecSource";
import { primeClauseSpecs } from "./primeClauseSpecs";

/** Serve `document` from every URI and load it under its own content hash —
 *  what the registry anchors for a correctly published spec. */
function serve(document: unknown): `0x${string}` {
    setClauseSpecFetcher(async () => document);
    return canonicalContentHash(document);
}

afterEach(() => {
    _resetClauseSpecCache_TESTING_ONLY();
});

describe("clauseSpecSource — chain-only cache", () => {
    it("starts empty — no bundled specs, nothing resolves before a load", () => {
        expect(listKnownClauseIds()).toEqual([]);
        expect(getClauseSpec("figaro-topology")).toBeUndefined();
    });

    it("resolves a canonical off-chain spec synchronously after an explicit load", async () => {
        await primeClauseSpecs(["figaro-topology"]);
        expect(listKnownClauseIds()).toContain("figaro-topology");
        expect(getClauseSpec("figaro-topology")?.clauseId).toBe("figaro-topology");
    });

    it("returns undefined for an unknown clauseId without throwing", () => {
        expect(getClauseSpec("does-not-exist-v1")).toBeUndefined();
        expect(getClauseSpecLoadError("does-not-exist-v1")).toBeUndefined();
    });
});

describe("clauseSpecSource — catalog-authored fills (derive, not hardcode)", () => {
    it("reads block.checkout.catalogueFills; the set is derived from the registry", async () => {
        await primeClauseSpecs();
        // The three product-property clauses declare catalog-authored fields.
        expect(clauseCatalogFills("figaro-freight-class").length).toBeGreaterThan(0);
        expect(clauseCatalogFills("figaro-hazmat").length).toBeGreaterThan(0);
        expect(clauseCatalogFills("figaro-cold-chain")).toContain("tempClass");
        // A commerce / coordination clause does not.
        expect(clauseCatalogFills("figaro-commerce")).toEqual([]);
        expect(clauseCatalogFills("figaro-geolocation")).toEqual([]);
        expect(listCatalogSourcedClauses().map((c) => c.clauseId).sort()).toEqual([
            "figaro-cold-chain",
            "figaro-data-license",
            "figaro-freight-class",
            "figaro-hazmat",
        ]);
    });

    it("an unloaded clause has no catalog fills; the empty cache derives an empty set", () => {
        expect(clauseCatalogFills("figaro-never-seen")).toEqual([]);
        expect(listCatalogSourcedClauses()).toEqual([]);
    });
});

describe("clauseSpecSource — async loadClauseSpec via fetcher", () => {
    it("fetches, parses, and caches a remote spec", async () => {
        const hash = serve({
            clauseId: "test-remote-v1",
            version: 1,
            title: "Test Remote",
            description: "Remote spec for unit test.",
            fields: [
                { name: "x", type: "string", required: true },
            ],
        });
        const spec = await loadClauseSpec("test-remote-v1", 1, "ipfs://fake", hash);
        expect(spec.clauseId).toBe("test-remote-v1");
        // Subsequent sync lookup should resolve to the cached entry
        expect(getClauseSpec("test-remote-v1")?.clauseId).toBe("test-remote-v1");
    });

    it("the SpecSource adapter carries EVERY hash-load-bearing hint — designFills included (a dropped hint silently strips designer values at publish)", async () => {
        const hash = serve({
            clauseId: "test-designer-fills",
            version: 1,
            title: "Test Designer Fills",
            description: "Designer-fills spec for the hint-passthrough regression.",
            fields: [{ name: "x", type: "string", required: true }],
            block: {
                design: { article: "resolution", nestsUnder: null, fills: ["x"], composes: null },
                checkout: { catalogueFills: ["x"], profileFills: [] },
                runtime: { interaction: null, fields: [] },
            },
        });
        await loadClauseSpec("test-designer-fills", 1, "ipfs://fake-fills", hash);
        const view = specSource().get("test-designer-fills");
        expect(view?.hints?.article).toBe("resolution");
        expect(view?.hints?.designFills).toEqual(["x"]);
        expect(view?.hints?.catalogueFills).toEqual(["x"]);
    });

    it("rejects when the spec's clauseId does not match the requested ID", async () => {
        const hash = serve({
            clauseId: "wrong-id-v1",
            version: 1,
            title: "Wrong",
            description: "Mismatched.",
            fields: [],
        });
        await expect(loadClauseSpec("expected-id-v1", 1, "ipfs://fake", hash)).rejects.toThrow(/declares clauseId/);
    });

    it("rejects when the spec fails to parse", async () => {
        const hash = serve({ not: "a spec" });
        await expect(loadClauseSpec("malformed-v1", 1, "ipfs://fake", hash)).rejects.toThrow(/failed to parse/);
    });

    it("rejects a document that does not hash to its anchor, and never caches it", async () => {
        const spec = { clauseId: "test-anchor", version: 1, title: "Anchored", description: "d", fields: [{ name: "x", type: "string", required: true }] };
        const anchor = canonicalContentHash(spec);
        serve({ ...spec, title: "Served by a gateway that changed it" });
        await expect(loadClauseSpec("test-anchor", 1, "ipfs://fake", anchor)).rejects.toThrow(/integrity failure/);
        expect(getClauseSpec("test-anchor")).toBeUndefined();
        expect(getClauseSpecLoadError("test-anchor")).toMatch(/integrity failure/);
    });
});

describe("clauseSpecSource — valueLabels humanize runtime enum codes (audit workstream B)", () => {
    it("clauseLadderField carries the spec's valueLabels (so the capability deriver can humanize)", async () => {
        await primeClauseSpecs(["figaro-merchant-process"]);
        const ladder = clauseLadderField("figaro-merchant-process");
        expect(ladder?.name).toBe("eventType");
        expect(ladder?.valueLabels?.["prep-started"]).toBe("Preparation started");
        expect(ladder?.valueLabels?.["handed-off"]).toBe("Handed off");
    });

    it("labelEnumValue humanizes a raw code via valueLabels, and falls back to the raw token when unlabelled", async () => {
        await primeClauseSpecs(["figaro-modalities"]);
        const ladder = clauseLadderField("figaro-modalities");
        expect(labelEnumValue(ladder, "consume-onsite")).toBe("Consume on-site");
        expect(labelEnumValue(ladder, "virtual")).toBe("Virtual");
        // Fallback: an unlabelled value renders as its raw token (never blank).
        expect(labelEnumValue(ladder, "unlabelled-code")).toBe("unlabelled-code");
    });
});

describe("clauseIsProcessLog — classified by the attestations article, never by field shape", () => {
    it("a process-log clause (attestations article) IS a lifecycle", async () => {
        await primeClauseSpecs(["figaro-merchant-process", "figaro-courier-process"]);
        expect(clauseIsProcessLog("figaro-merchant-process")).toBe(true);
        expect(clauseIsProcessLog("figaro-courier-process")).toBe(true);
    });

    it("a committed-choice enum clause (coordination article) is NOT a lifecycle", async () => {
        // Regression: "non-mandatory + has enum" misread modalities as a
        // process-log — fabricated seller capabilities and skipped off-chain
        // validation at both sign points.
        await primeClauseSpecs(["figaro-modalities"]);
        expect(clauseLadderField("figaro-modalities")).not.toBeNull(); // it HAS an enum…
        expect(clauseIsProcessLog("figaro-modalities")).toBe(false);   // …but declares coordination
    });

    it("a mandatory clause with an enum is NOT a lifecycle (the earlier collision)", async () => {
        await primeClauseSpecs(["figaro-topology"]);
        expect(clauseIsProcessLog("figaro-topology")).toBe(false);
    });

    it("an unknown clause is not a lifecycle (false while uncached)", () => {
        expect(clauseIsProcessLog("never-seen-clause")).toBe(false);
    });
});

describe("version coexistence — a clause is a clause", () => {
    it("two live versions of one name coexist as co-equal cache entries", async () => {
        const v1 = { clauseId: "multi-v", version: 1, title: "Multi v1", description: "d", fields: [{ name: "x", type: "string", required: true }] };
        const v2 = { ...v1, version: 2, title: "Multi v2" };
        setClauseSpecFetcher(async (uri) => (uri.includes("v2") ? v2 : v1));
        await loadClauseSpec("multi-v", 1, "ipfs://fake-v1", canonicalContentHash(v1));
        await loadClauseSpec("multi-v", 2, "ipfs://fake-v2", canonicalContentHash(v2));
        expect(getClauseSpec("multi-v", 1)?.title).toBe("Multi v1");
        expect(getClauseSpec("multi-v", 2)?.title).toBe("Multi v2");
        // Name-only resolves to the highest loaded — a display convenience.
        expect(getClauseSpec("multi-v")?.version).toBe(2);
        // The identity list carries both; the name list dedupes.
        expect(listKnownClauses().filter((c) => c.clauseId === "multi-v")).toHaveLength(2);
        expect(listKnownClauseIds().filter((id) => id === "multi-v")).toHaveLength(1);
    });

    it("rejects a spec whose declared version differs from the registered one", async () => {
        const hash = serve({ clauseId: "multi-v", version: 1, title: "Multi v1", description: "d", fields: [{ name: "x", type: "string", required: true }] });
        await expect(loadClauseSpec("multi-v", 3, "ipfs://fake", hash)).rejects.toThrow(/declares version 1, expected 3/);
    });
});

describe("Anchored — a document is anchored only when an anchor function returned it", () => {
    it("a fetched document does not type as anchored; the anchor function's result does", () => {
        const fetched = { clauseId: "test-type", version: 1 };
        // @ts-expect-error a fetched document is not anchored until an anchor function verifies it
        const unverified: Anchored<typeof fetched> = fetched;
        const verified: Anchored<unknown> | null = anchorClauseSpec(fetched, canonicalContentHash(fetched));
        expect(unverified).toBe(fetched);
        expect(verified).toBe(fetched);
    });
});
