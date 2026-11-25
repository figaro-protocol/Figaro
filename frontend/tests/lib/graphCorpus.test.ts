/**
 * The corpus reads each designer's utility-token pin off the loaded assemblies
 * from the spec each composed key names: two specs of one name are two keys,
 * and a assembly composed under the spec whose `currency` is a design fill
 * carries a pin, while one composed under the spec that leaves it plain
 * content carries none.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { corpusInputsLoaded, readAssemblyUtilityTokenPins } from "@/lib/data/graphCorpus";
import {
    _resetClauseSpecCache_TESTING_ONLY,
    loadClauseSpec,
    setClauseSpecFetcher,
    specSource,
} from "@/lib/shared/clauseSpecSource";
import { pinSpec } from "./primeClauseSpecs";

const TOKEN = "0x2222222222222222222222222222222222222222" as const;
const canonical = JSON.parse(readFileSync(path.resolve(process.cwd(), "../clauses/figaro-utility-token.json"), "utf8"));
// v1 declares `currency` as plain content (no design fill), so it is never a
// pin; v2 declares it as the designer fill, so it is one.
const V1 = pinSpec({ ...canonical, version: 1, block: { ...canonical.block, design: { ...canonical.block.design, fills: [] } } });
const V2 = pinSpec({ ...canonical, version: 2 });

type Assemblies = Parameters<typeof readAssemblyUtilityTokenPins>[0];
const assembly = (clauseKey: string): Assemblies[number] => ({
    processDesignHash: `0x${"ab".repeat(32)}`,
    agreementHashes: [],
    name: "pinned",
    entries: [],
    clauseSets: [{ clauses: { [clauseKey]: { currency: TOKEN } } }],
});

describe("readAssemblyUtilityTokenPins — the pin read from the composed key's spec", () => {
    beforeAll(async () => {
        _resetClauseSpecCache_TESTING_ONLY();
        const docs: Record<string, string> = { "v1.json": V1.bytes, "v2.json": V2.bytes };
        setClauseSpecFetcher(async (uri) => docs[uri]);
        await loadClauseSpec(V1.clauseKey, "v1.json");
        await loadClauseSpec(V2.clauseKey, "v2.json");
    });
    afterAll(() => _resetClauseSpecCache_TESTING_ONLY());

    it("yields the pin when the assembly composes the key of the spec that fills currency", () => {
        expect(readAssemblyUtilityTokenPins([assembly(V2.clauseKey)], specSource())).toEqual([TOKEN]);
    });

    it("yields none when the assembly composes the key of the spec that leaves currency plain", () => {
        expect(readAssemblyUtilityTokenPins([assembly(V1.clauseKey)], specSource())).toEqual([]);
    });
});

describe("corpusInputsLoaded — the read waits for both off-chain inputs to finish loading", () => {
    const loaded = { state: "loaded" as const };
    const loading = { state: "loading" as const };
    const error = { state: "error" as const };

    it("is not loaded while the clause-spec load pass is still running", () => {
        expect(corpusInputsLoaded([loaded], false, false)).toBe(false);
    });

    it("is not loaded while the process registry read is in flight", () => {
        expect(corpusInputsLoaded(null, false, true)).toBe(false);
    });

    it("is not loaded while any assembly's assembly or agreements are still hydrating", () => {
        expect(corpusInputsLoaded([loaded, loading], false, true)).toBe(false);
    });

    it("is loaded once every assembly is loaded or in error, and on an empty registry", () => {
        expect(corpusInputsLoaded([loaded, error], false, true)).toBe(true);
        expect(corpusInputsLoaded([], false, true)).toBe(true);
    });

    it("an absent assembly-registry read counts as loaded — attribution is absent, the corpus still reads", () => {
        expect(corpusInputsLoaded(null, true, true)).toBe(true);
    });
});
