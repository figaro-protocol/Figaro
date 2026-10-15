import { afterEach, describe, expect, it } from "vitest";
import { PROVENANCE_LEAF_KEY, anchorClauseSpec, canonicalize, type Anchored } from "@figaro-protocol/sdk";
import {
    getClauseSpec,
    getClauseSpecLoadError,
    listKnownClauses,
    loadClauseSpec,
    setClauseSpecFetcher,
    clauseIsProcessLog,
    clauseCatalogFills,
    listCatalogSourcedClauses,
    clauseLadderField,
    labelEnumValue,
    specSource,
    liveSpecSource,
    noteClauseStakes,
    isLiveRegistration,
    clauseIsMandatory,
    describeAttestation,
    groupClausesByArticle,
    _resetClauseSpecCache_TESTING_ONLY,
} from "@/lib/shared/clauseSpecSource";
import { keyOf, pinSpec, primeClauseSpecs } from "./primeClauseSpecs";

/** Serve `document`'s canonical bytes from every URI and return its key —
 *  what the registry holds for a correctly published spec. */
function serve(document: unknown): `0x${string}` {
    const { clauseKey, bytes } = pinSpec(document);
    setClauseSpecFetcher(async () => bytes);
    return clauseKey;
}

const UNKNOWN_KEY = `0x${"ab".repeat(32)}` as const;

afterEach(() => {
    _resetClauseSpecCache_TESTING_ONLY();
});

describe("clauseSpecSource — chain-only cache", () => {
    it("starts empty — no bundled specs, nothing resolves before a load", () => {
        expect(listKnownClauses()).toEqual([]);
        expect(getClauseSpec(UNKNOWN_KEY)).toBeUndefined();
    });

    it("resolves a canonical off-chain spec synchronously by its key after an explicit load", async () => {
        await primeClauseSpecs(["figaro-topology"]);
        const key = keyOf("figaro-topology");
        expect(listKnownClauses()).toContainEqual({ clauseKey: key, clauseId: "figaro-topology", version: 1 });
        expect(getClauseSpec(key)?.clauseId).toBe("figaro-topology");
        expect(getClauseSpec(key)?.clauseKey).toBe(key);
        // The key is case-insensitive at the read.
        expect(getClauseSpec(key.toUpperCase().replace("0X", "0x"))?.clauseId).toBe("figaro-topology");
    });

    it("returns undefined for an unknown key without throwing", () => {
        expect(getClauseSpec(UNKNOWN_KEY)).toBeUndefined();
        expect(getClauseSpecLoadError(UNKNOWN_KEY)).toBeUndefined();
    });
});

describe("clauseSpecSource — catalog-authored fills (derive, not hardcode)", () => {
    it("reads block.checkout.catalogueFills; the set is derived from the registry", async () => {
        await primeClauseSpecs();
        // The three product-property clauses declare catalog-authored fields.
        expect(clauseCatalogFills(keyOf("figaro-freight-class")).length).toBeGreaterThan(0);
        expect(clauseCatalogFills(keyOf("figaro-hazmat")).length).toBeGreaterThan(0);
        expect(clauseCatalogFills(keyOf("figaro-cold-chain"))).toContain("tempClass");
        // A commerce / coordination clause does not.
        expect(clauseCatalogFills(keyOf("figaro-commerce"))).toEqual([]);
        expect(clauseCatalogFills(keyOf("figaro-geolocation"))).toEqual([]);
        expect(listCatalogSourcedClauses().map((c) => c.clauseId).sort()).toEqual([
            "figaro-cold-chain",
            "figaro-data-license",
            "figaro-freight-class",
            "figaro-hazmat",
        ]);
    });

    it("an unloaded clause has no catalog fills; the empty cache derives an empty set", () => {
        expect(clauseCatalogFills(UNKNOWN_KEY)).toEqual([]);
        expect(listCatalogSourcedClauses()).toEqual([]);
    });
});

describe("clauseSpecSource — async loadClauseSpec via fetcher", () => {
    it("fetches the pinned bytes, verifies them against the key, parses, and caches", async () => {
        const key = serve({
            clauseId: "test-remote-v1",
            version: 1,
            title: "Test Remote",
            description: "Remote spec for unit test.",
            fields: [
                { name: "x", type: "string", required: true },
            ],
        });
        const spec = await loadClauseSpec(key, "ipfs://fake");
        expect(spec.clauseId).toBe("test-remote-v1");
        expect(spec.clauseKey).toBe(key);
        // Subsequent sync lookup should resolve to the cached entry
        expect(getClauseSpec(key)?.clauseId).toBe("test-remote-v1");
    });

    it("accepts the bytes as a Uint8Array as well as their exact text", async () => {
        const { clauseKey, bytes } = pinSpec({ clauseId: "test-bytes", version: 1, title: "Bytes", description: "d", fields: [{ name: "x", type: "string", required: true }] });
        setClauseSpecFetcher(async () => new TextEncoder().encode(bytes));
        expect((await loadClauseSpec(clauseKey, "ipfs://fake")).clauseId).toBe("test-bytes");
    });

    it("the SpecSource adapter carries the key and EVERY hash-load-bearing hint — designFills included (a dropped hint silently strips designer values at publish)", async () => {
        const key = serve({
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
        await loadClauseSpec(key, "ipfs://fake-fills");
        const view = specSource().get(key);
        expect(view?.clauseKey).toBe(key);
        expect(view?.hints?.article).toBe("resolution");
        expect(view?.hints?.designFills).toEqual(["x"]);
        expect(view?.hints?.catalogueFills).toEqual(["x"]);
    });

    it("rejects when the bytes fail to parse as a spec", async () => {
        const key = serve({ not: "a spec" });
        await expect(loadClauseSpec(key, "ipfs://fake")).rejects.toThrow(/failed to parse/);
        expect(getClauseSpecLoadError(key)).toMatch(/failed to parse/);
    });

    it("rejects bytes that do not hash to the key, and never caches them", async () => {
        const spec = { clauseId: "test-anchor", version: 1, title: "Anchored", description: "d", fields: [{ name: "x", type: "string", required: true }] };
        const { clauseKey } = pinSpec(spec);
        serve({ ...spec, title: "Served by a gateway that changed it" });
        await expect(loadClauseSpec(clauseKey, "ipfs://fake")).rejects.toThrow(/integrity failure/);
        expect(getClauseSpec(clauseKey)).toBeUndefined();
        expect(getClauseSpecLoadError(clauseKey)).toMatch(/integrity failure/);
    });

    it("checks the bytes fetched and re-canonicalizes nothing: the same document in another byte form is not the clause", async () => {
        const spec = { clauseId: "test-bytes-form", version: 1, title: "Form", description: "d", fields: [{ name: "x", type: "string", required: true }] };
        const { clauseKey } = pinSpec(spec);
        setClauseSpecFetcher(async () => JSON.stringify(spec, null, 2));
        await expect(loadClauseSpec(clauseKey, "ipfs://fake")).rejects.toThrow(/integrity failure/);
    });
});

describe("clauseSpecSource — valueLabels humanize runtime enum codes (audit workstream B)", () => {
    it("clauseLadderField carries the spec's valueLabels (so the capability deriver can humanize)", async () => {
        await primeClauseSpecs(["figaro-merchant-process"]);
        const ladder = clauseLadderField(keyOf("figaro-merchant-process"));
        expect(ladder?.name).toBe("eventType");
        expect(ladder?.valueLabels?.["prep-started"]).toBe("Preparation started");
        expect(ladder?.valueLabels?.["handed-off"]).toBe("Handed off");
    });

    it("labelEnumValue humanizes a raw code via valueLabels, and falls back to the raw token when unlabeled", async () => {
        await primeClauseSpecs(["figaro-modalities"]);
        const ladder = clauseLadderField(keyOf("figaro-modalities"));
        expect(labelEnumValue(ladder, "consume-onsite")).toBe("Consume on-site");
        expect(labelEnumValue(ladder, "virtual")).toBe("Virtual");
        // Fallback: an unlabeled value renders as its raw token (never blank).
        expect(labelEnumValue(ladder, "unlabeled-code")).toBe("unlabeled-code");
    });
});

describe("clauseIsProcessLog — classified by the attestations article, never by field shape", () => {
    it("a process-log clause (attestations article) IS a lifecycle", async () => {
        await primeClauseSpecs(["figaro-merchant-process", "figaro-courier-process"]);
        expect(clauseIsProcessLog(keyOf("figaro-merchant-process"))).toBe(true);
        expect(clauseIsProcessLog(keyOf("figaro-courier-process"))).toBe(true);
    });

    it("a committed-choice enum clause (coordination article) is NOT a lifecycle", async () => {
        // Regression: "non-mandatory + has enum" misread modalities as a
        // process-log — fabricated seller capabilities and skipped off-chain
        // validation at both sign points.
        await primeClauseSpecs(["figaro-modalities"]);
        expect(clauseLadderField(keyOf("figaro-modalities"))).not.toBeNull(); // it HAS an enum…
        expect(clauseIsProcessLog(keyOf("figaro-modalities"))).toBe(false);   // …but declares coordination
    });

    it("a mandatory clause with an enum is NOT a lifecycle (the earlier collision)", async () => {
        await primeClauseSpecs(["figaro-topology"]);
        expect(clauseIsProcessLog(keyOf("figaro-topology"))).toBe(false);
    });

    it("an unknown clause is not a lifecycle (false while uncached)", () => {
        expect(clauseIsProcessLog(UNKNOWN_KEY)).toBe(false);
    });
});

describe("a clause is its spec — two specs that share a name are two clauses", () => {
    const base = { clauseId: "multi-v", version: 1, title: "Multi v1", description: "d", fields: [{ name: "x", type: "string", required: true }] };

    it("two specs of one name coexist as co-equal cache entries, each read by its own key", async () => {
        const v2 = { ...base, version: 2, title: "Multi v2" };
        const a = pinSpec(base);
        const b = pinSpec(v2);
        setClauseSpecFetcher(async (uri) => (uri.includes("v2") ? b.bytes : a.bytes));
        await loadClauseSpec(a.clauseKey, "ipfs://fake-v1");
        await loadClauseSpec(b.clauseKey, "ipfs://fake-v2");
        expect(getClauseSpec(a.clauseKey)?.title).toBe("Multi v1");
        expect(getClauseSpec(b.clauseKey)?.title).toBe("Multi v2");
        expect(listKnownClauses().filter((c) => c.clauseId === "multi-v")).toHaveLength(2);
        expect(() => keyOf("multi-v")).toThrow(/2 loaded specs match/);
        expect(keyOf("multi-v", 2)).toBe(b.clauseKey);
    });

    it("a lookalike — same name, same version, different bytes — is a different key and shares nothing", async () => {
        const lookalike = { ...base, description: "a lookalike" };
        const a = pinSpec(base);
        const b = pinSpec(lookalike);
        expect(b.clauseKey).not.toBe(a.clauseKey);
        setClauseSpecFetcher(async (uri) => (uri.includes("look") ? b.bytes : a.bytes));
        await loadClauseSpec(b.clauseKey, "ipfs://lookalike");
        expect(getClauseSpec(b.clauseKey)?.description).toBe("a lookalike");
        expect(getClauseSpec(a.clauseKey)).toBeUndefined();
    });

    it("a load error belongs to the key that failed, not to the name", async () => {
        const good = pinSpec(base);
        const other = { ...base, version: 2 };
        const otherKey = pinSpec(other).clauseKey;
        serve({ ...other, title: "Changed by a gateway" });
        await expect(loadClauseSpec(otherKey, "ipfs://fake")).rejects.toThrow(/integrity failure/);
        expect(getClauseSpecLoadError(otherKey)).toMatch(/integrity failure/);
        expect(getClauseSpecLoadError(good.clauseKey)).toBeUndefined();
    });

    it("the drawer's grouping lists one row per key, labeled by the spec's own name and version", async () => {
        const a = pinSpec(base);
        const b = pinSpec({ ...base, version: 2, title: "Multi v2" });
        setClauseSpecFetcher(async (uri) => (uri.includes("v2") ? b.bytes : a.bytes));
        await loadClauseSpec(a.clauseKey, "ipfs://fake-v1");
        await loadClauseSpec(b.clauseKey, "ipfs://fake-v2");
        const rows = groupClausesByArticle().flatMap((g) => g.clauses);
        expect(rows.map((r) => r.clauseKey)).toEqual([a.clauseKey, b.clauseKey]);
        expect(rows.map((r) => `${r.clauseId}@${r.version}`)).toEqual(["multi-v@1", "multi-v@2"]);
    });
});

describe("Anchored — a document is anchored only when an anchor function returned it", () => {
    it("a fetched document does not type as anchored; the anchor function's result does", () => {
        const fetched = { clauseId: "test-type", version: 1 };
        // @ts-expect-error a fetched document is not anchored until an anchor function verifies it
        const unverified: Anchored<typeof fetched> = fetched;
        const bytes = canonicalize(fetched);
        const verified: Anchored<unknown> | null = anchorClauseSpec(bytes, pinSpec(fetched).clauseKey);
        expect(unverified).toBe(fetched);
        expect(verified).toEqual(fetched);
    });
});

describe("the live stake — one rule for the offer and the mandatory fold", () => {
    it("isLiveRegistration is the stake not withdrawn", () => {
        expect(isLiveRegistration({ stakeWithdrawn: false })).toBe(true);
        expect(isLiveRegistration({ stakeWithdrawn: true })).toBe(false);
    });

    it("liveSpecSource lists only the clauses noted with a live stake; get reads every loaded spec", async () => {
        await primeClauseSpecs(["figaro-commerce", "figaro-topology"]);
        const commerce = keyOf("figaro-commerce");
        const topology = keyOf("figaro-topology");
        noteClauseStakes([
            { clauseKey: commerce, stakeWithdrawn: true },
            { clauseKey: topology, stakeWithdrawn: false },
        ]);
        expect(liveSpecSource().list().map((s) => s.clauseKey)).toEqual([topology]);
        expect(liveSpecSource().get(commerce)?.clauseId).toBe("figaro-commerce");
    });

    it("a loaded spec with no noted registration is not live", async () => {
        await primeClauseSpecs(["figaro-topology"]);
        noteClauseStakes([]);
        expect(liveSpecSource().list()).toEqual([]);
    });
});

describe("clauseIsMandatory — the SDK predicate on the clause the key names", () => {
    it("reads the spec at the key, never another spec of the name", async () => {
        const v1 = { clauseId: "mand-v", version: 1, title: "v1", description: "d", fields: [{ name: "x", type: "string", required: true }] };
        const v2 = { ...v1, version: 2, title: "v2", block: { design: { article: "mandatory", nestsUnder: null, fills: [], composes: null }, checkout: { catalogueFills: [], profileFills: [] }, runtime: { interaction: null, fields: [] } } };
        const a = pinSpec(v1);
        const b = pinSpec(v2);
        setClauseSpecFetcher(async (uri) => (uri.includes("v2") ? b.bytes : a.bytes));
        await loadClauseSpec(a.clauseKey, "ipfs://fake-v1");
        await loadClauseSpec(b.clauseKey, "ipfs://fake-v2");
        expect(clauseIsMandatory(a.clauseKey)).toBe(false);
        expect(clauseIsMandatory(b.clauseKey)).toBe(true);
    });
});

describe("the agreement format's provenance leaf — the reserved key, never a clause", () => {
    it("resolves to no spec", () => {
        expect(getClauseSpec(PROVENANCE_LEAF_KEY)).toBeUndefined();
    });

    it("is described as the agreement's provenance leaf, by the format constant", () => {
        expect(describeAttestation(PROVENANCE_LEAF_KEY, 0)).toEqual({
            clauseTitle: "Assembly provenance",
            eventLabel: "provenance attested",
            eventCode: "provenance-leaf",
        });
        expect(describeAttestation(PROVENANCE_LEAF_KEY.toUpperCase().replace("0X", "0x"), 0).eventCode).toBe("provenance-leaf");
    });
});
