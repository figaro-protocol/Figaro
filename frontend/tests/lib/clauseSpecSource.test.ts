import { afterEach, describe, expect, it } from "vitest";
import {
    getClauseSpec,
    getClauseSpecLoadError,
    listKnownClauseIds,
    loadClauseSpec,
    setClauseSpecFetcher,
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
        const spec = await loadClauseSpec("test-remote-v1", "ipfs://fake");
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
        await expect(loadClauseSpec("expected-id-v1", "ipfs://fake")).rejects.toThrow(/declares clauseId/);
    });

    it("rejects when the spec fails to parse", async () => {
        setClauseSpecFetcher(async () => ({ not: "a spec" }));
        await expect(loadClauseSpec("malformed-v1", "ipfs://fake")).rejects.toThrow(/failed to parse/);
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
