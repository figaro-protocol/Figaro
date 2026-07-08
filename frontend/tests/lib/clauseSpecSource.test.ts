import { afterEach, describe, expect, it } from "vitest";
import {
    getClauseSpec,
    getClauseSpecLoadError,
    listKnownClauseIds,
    listKnownClauses,
    loadClauseSpec,
    setClauseSpecFetcher,
    clauseIsProcessLog,
    clauseIsCatalogueSourced,
    listCatalogueSourcedClauses,
    clauseLadderField,
    labelEnumValue,
    _resetClauseSpecCache_TESTING_ONLY,
} from "@/lib/shared/clauseSpecSource";
import { primeClauseSpecs } from "./primeClauseSpecs";

afterEach(() => {
    _resetClauseSpecCache_TESTING_ONLY();
});

describe("clauseSpecSource — chain-only cache", () => {
    it("starts empty — no bundled specs, nothing resolves before a load", () => {
        expect(listKnownClauseIds()).toEqual([]);
        expect(getClauseSpec("figaro-topology")).toBeUndefined();
    });

    it("resolves a canonical Layer-A spec synchronously after an explicit load", async () => {
        await primeClauseSpecs(["figaro-topology"]);
        expect(listKnownClauseIds()).toContain("figaro-topology");
        expect(getClauseSpec("figaro-topology")?.clauseId).toBe("figaro-topology");
    });

    it("returns undefined for an unknown clauseId without throwing", () => {
        expect(getClauseSpec("does-not-exist-v1")).toBeUndefined();
        expect(getClauseSpecLoadError("does-not-exist-v1")).toBeUndefined();
    });
});

describe("clauseSpecSource — catalogue-sourced clauses (derive, not hardcode)", () => {
    it("reads block.catalogueSourced; the set is derived from the registry", async () => {
        await primeClauseSpecs();
        // The three product-property clauses declare the marker.
        expect(clauseIsCatalogueSourced("figaro-freight-class")).toBe(true);
        expect(clauseIsCatalogueSourced("figaro-hazmat")).toBe(true);
        expect(clauseIsCatalogueSourced("figaro-cold-chain")).toBe(true);
        // A commerce / coordination clause does not.
        expect(clauseIsCatalogueSourced("figaro-commerce")).toBe(false);
        expect(clauseIsCatalogueSourced("figaro-geolocation")).toBe(false);
        expect(listCatalogueSourcedClauses().map((c) => c.clauseId).sort()).toEqual([
            "figaro-cold-chain",
            "figaro-freight-class",
            "figaro-hazmat",
        ]);
    });

    it("an unloaded clause is not catalogue-sourced; the empty cache derives an empty set", () => {
        expect(clauseIsCatalogueSourced("figaro-never-seen")).toBe(false);
        expect(listCatalogueSourcedClauses()).toEqual([]);
    });
});

describe("clauseSpecSource — async loadClauseSpec via fetcher", () => {
    it("fetches, parses, and caches a remote spec", async () => {
        setClauseSpecFetcher(async () => ({
            clauseId: "test-remote-v1",
            version: 1,
            title: "Test Remote",
            description: "Remote spec for unit test.",
            fields: [
                { name: "x", type: "string", required: true },
            ],
        }));
        const spec = await loadClauseSpec("test-remote-v1", 1, "ipfs://fake");
        expect(spec.clauseId).toBe("test-remote-v1");
        // Subsequent sync lookup should resolve to the cached entry
        expect(getClauseSpec("test-remote-v1")?.clauseId).toBe("test-remote-v1");
    });

    it("rejects when the spec's clauseId does not match the requested ID", async () => {
        setClauseSpecFetcher(async () => ({
            clauseId: "wrong-id-v1",
            version: 1,
            title: "Wrong",
            description: "Mismatched.",
            fields: [],
        }));
        await expect(loadClauseSpec("expected-id-v1", 1, "ipfs://fake")).rejects.toThrow(/declares clauseId/);
    });

    it("rejects when the spec fails to parse", async () => {
        setClauseSpecFetcher(async () => ({ not: "a spec" }));
        await expect(loadClauseSpec("malformed-v1", 1, "ipfs://fake")).rejects.toThrow(/failed to parse/);
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
        // Regression: "non-structural + has enum" misread modalities as a
        // process-log — fabricated seller capabilities and skipped Layer-A
        // validation at both sign points.
        await primeClauseSpecs(["figaro-modalities"]);
        expect(clauseLadderField("figaro-modalities")).not.toBeNull(); // it HAS an enum…
        expect(clauseIsProcessLog("figaro-modalities")).toBe(false);   // …but declares coordination
    });

    it("a structural clause with an enum is NOT a lifecycle (the earlier collision)", async () => {
        await primeClauseSpecs(["figaro-topology"]);
        expect(clauseIsProcessLog("figaro-topology")).toBe(false);
    });

    it("an unknown clause is not a lifecycle (false while uncached)", () => {
        expect(clauseIsProcessLog("never-seen-clause")).toBe(false);
    });
});

describe("version coexistence — a clause is a clause", () => {
    it("two live versions of one name coexist as co-equal cache entries", async () => {
        setClauseSpecFetcher(async (uri) => (uri.includes("v2") ? { clauseId: "multi-v", version: 2, title: "Multi v2", description: "d", fields: [{ name: "x", type: "string", required: true }] } : { clauseId: "multi-v", version: 1, title: "Multi v1", description: "d", fields: [{ name: "x", type: "string", required: true }] }));
        await loadClauseSpec("multi-v", 1, "ipfs://fake-v1");
        await loadClauseSpec("multi-v", 2, "ipfs://fake-v2");
        expect(getClauseSpec("multi-v", 1)?.title).toBe("Multi v1");
        expect(getClauseSpec("multi-v", 2)?.title).toBe("Multi v2");
        // Name-only resolves to the highest loaded — a display convenience.
        expect(getClauseSpec("multi-v")?.version).toBe(2);
        // The identity list carries both; the name list dedupes.
        expect(listKnownClauses().filter((c) => c.clauseId === "multi-v")).toHaveLength(2);
        expect(listKnownClauseIds().filter((id) => id === "multi-v")).toHaveLength(1);
    });

    it("rejects a spec whose declared version differs from the registered one", async () => {
        setClauseSpecFetcher(async () => ({ clauseId: "multi-v", version: 1, title: "Multi v1", description: "d", fields: [{ name: "x", type: "string", required: true }] }));
        await expect(loadClauseSpec("multi-v", 3, "ipfs://fake")).rejects.toThrow(/declares version 1, expected 3/);
    });
});
