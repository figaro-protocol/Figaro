/**
 * The clause-spec reader's default fetcher holds the bytes it reads to two
 * anchors: the CID the registered URI names, and the clause key. Bytes that
 * do not hash to the CID are refused before the spec is read, and bytes
 * whose spec, without its `block`, does not hash to the key are refused
 * after. Either way the cache holds nothing, so every place that reads the
 * spec stays empty, and the load error says which anchor failed.
 *
 * The CID here is the base16 CIDv1 raw sha2-256 form
 * (`f01551220` + the digest), the form `checkContentAddress` recomputes for a
 * one-block pin.
 */
import { createHash } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
    _resetClauseSpecCache_TESTING_ONLY,
    defaultClauseSpecFetcher,
    getClauseSpec,
    getClauseSpecLoadError,
    loadClauseSpec,
    setClauseSpecFetcher,
} from "@/lib/shared/clauseSpecSource";
import { pinSpec } from "./primeClauseSpecs";

const SPEC = {
    clauseId: "stranger-anchor", version: 1, title: "Anchored", description: "A clause of the test's own.",
    fields: [{ name: "x", type: "string", required: true }],
    stages: {},
    block: { design: { article: "terms" } },
};

/** The URI a registrant records for `bytes`: their raw CIDv1 in base16. */
function uriOf(bytes: string): string {
    return `ipfs://f01551220${createHash("sha256").update(bytes).digest("hex")}`;
}

/** Every gateway answers with `bytes`, whatever it was asked for. */
function gatewayServes(bytes: string): void {
    vi.stubGlobal("fetch", vi.fn(async () => new Response(bytes, { status: 200 })));
}

afterEach(() => {
    vi.unstubAllGlobals();
    _resetClauseSpecCache_TESTING_ONLY();
});

describe("the clause-spec reader refuses bytes that are not what the registration names", () => {
    it("loads the bytes the URI's CID names when their spec hashes to the key", async () => {
        const { clauseKey, bytes } = pinSpec(SPEC);
        setClauseSpecFetcher(defaultClauseSpecFetcher);
        gatewayServes(bytes);
        expect((await loadClauseSpec(clauseKey, uriOf(bytes))).title).toBe("Anchored");
        expect(getClauseSpecLoadError(clauseKey)).toBeUndefined();
    });

    it("refuses bytes that do not hash to the CID, even when their spec hashes to the key, and leaves the place empty", async () => {
        const { clauseKey, bytes } = pinSpec(SPEC);
        // Only the block differs: the key, which leaves the block out, still
        // matches; the CID, which covers every byte, does not.
        const restyled = pinSpec({ ...SPEC, block: { design: { article: "resolution" } } });
        expect(restyled.clauseKey).toBe(clauseKey);
        setClauseSpecFetcher(defaultClauseSpecFetcher);
        gatewayServes(restyled.bytes);
        await expect(loadClauseSpec(clauseKey, uriOf(bytes))).rejects.toThrow(/do not hash to its CID/);
        expect(getClauseSpec(clauseKey)).toBeUndefined();
        expect(getClauseSpecLoadError(clauseKey)).toMatch(/content-address failure/);
    });

    it("refuses bytes that hash to their CID but not to the clause key, and leaves the place empty", async () => {
        const { clauseKey } = pinSpec(SPEC);
        const other = pinSpec({ ...SPEC, title: "Another clause" });
        setClauseSpecFetcher(defaultClauseSpecFetcher);
        gatewayServes(other.bytes);
        await expect(loadClauseSpec(clauseKey, uriOf(other.bytes))).rejects.toThrow(/integrity failure/);
        expect(getClauseSpec(clauseKey)).toBeUndefined();
        expect(getClauseSpecLoadError(clauseKey)).toMatch(/integrity failure/);
    });
});
