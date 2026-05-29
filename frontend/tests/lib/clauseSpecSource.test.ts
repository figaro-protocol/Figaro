import { afterEach, describe, expect, it } from "vitest";
import {
    getClauseSpec,
    getClauseSpecLoadError,
    listKnownClauseIds,
    loadClauseSpec,
    setClauseSpecFetcher,
    _resetClauseSpecCache_TESTING_ONLY,
} from "@/lib/shared/clauseSpecSource";

afterEach(() => {
    _resetClauseSpecCache_TESTING_ONLY();
});

describe("clauseSpecSource — built-in specs", () => {
    it("preloads figaro-topology-v1 and figaro-fulfilment-v2", () => {
        const ids = listKnownClauseIds();
        expect(ids).toContain("figaro-topology-v1");
        expect(ids).toContain("figaro-fulfilment-v2");
    });

    it("getClauseSpec resolves a built-in synchronously", () => {
        const spec = getClauseSpec("figaro-fulfilment-v2");
        expect(spec).toBeDefined();
        expect(spec?.clauseId).toBe("figaro-fulfilment-v2");
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
