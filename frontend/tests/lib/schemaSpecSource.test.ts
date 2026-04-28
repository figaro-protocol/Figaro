import { afterEach, describe, expect, it } from "vitest";
import {
    getSchemaSpec,
    getSchemaSpecLoadError,
    listKnownSchemaIds,
    loadSchemaSpec,
    setSchemaSpecFetcher,
    _resetSchemaSpecCache_TESTING_ONLY,
} from "@/lib/shared/schemaSpecSource";

afterEach(() => {
    _resetSchemaSpecCache_TESTING_ONLY();
});

describe("schemaSpecSource — built-in specs", () => {
    it("preloads figaro-topology-v1 and figaro-handoff-v1", () => {
        const ids = listKnownSchemaIds();
        expect(ids).toContain("figaro-topology-v1");
        expect(ids).toContain("figaro-handoff-v1");
    });

    it("getSchemaSpec resolves a built-in synchronously", () => {
        const spec = getSchemaSpec("figaro-handoff-v1");
        expect(spec).toBeDefined();
        expect(spec?.schemaId).toBe("figaro-handoff-v1");
    });

    it("returns undefined for an unknown schemaId without throwing", () => {
        expect(getSchemaSpec("does-not-exist-v1")).toBeUndefined();
        expect(getSchemaSpecLoadError("does-not-exist-v1")).toBeUndefined();
    });
});

describe("schemaSpecSource — async loadSchemaSpec via fetcher", () => {
    it("fetches, parses, and caches a remote spec", async () => {
        setSchemaSpecFetcher(async () => ({
            schemaId: "test-remote-v1",
            version: 1,
            title: "Test Remote",
            description: "Remote spec for unit test.",
            fields: [
                { name: "x", type: "string", required: true },
            ],
        }));
        const spec = await loadSchemaSpec("test-remote-v1", "ipfs://fake");
        expect(spec.schemaId).toBe("test-remote-v1");
        // Subsequent sync lookup should resolve to the cached entry
        expect(getSchemaSpec("test-remote-v1")?.schemaId).toBe("test-remote-v1");
    });

    it("rejects when the spec's schemaId does not match the requested ID", async () => {
        setSchemaSpecFetcher(async () => ({
            schemaId: "wrong-id-v1",
            version: 1,
            title: "Wrong",
            description: "Mismatched.",
            fields: [],
        }));
        await expect(loadSchemaSpec("expected-id-v1", "ipfs://fake")).rejects.toThrow(/declares schemaId/);
    });

    it("rejects when the spec fails to parse", async () => {
        setSchemaSpecFetcher(async () => ({ not: "a spec" }));
        await expect(loadSchemaSpec("malformed-v1", "ipfs://fake")).rejects.toThrow(/failed to parse/);
    });
});
