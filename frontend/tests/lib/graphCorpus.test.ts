/**
 * The corpus reads each designer's utility-token pin off the loaded templates
 * from the spec each composed key names: two specs of one name are two keys,
 * and a template composed under the spec whose `currency` is a design fill
 * carries a pin, while one composed under the spec that leaves it plain
 * content carries none.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { PROVENANCE_LEAF_KEY, provenanceContentRef } from "@figaro-protocol/sdk";
import type { OverlayGraph } from "@figaro-protocol/sdk/derive";
import { attributionFromOverlays, readTemplateUtilityTokenPins } from "@/lib/data/graphCorpus";
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

type Templates = Parameters<typeof readTemplateUtilityTokenPins>[0];
const template = (clauseKey: string): Templates[number] => ({
    compositionHash: `0x${"ab".repeat(32)}`,
    name: "pinned",
    clauseSets: [{ clauses: { [clauseKey]: { currency: TOKEN } } }],
});

describe("readTemplateUtilityTokenPins — the pin read from the composed key's spec", () => {
    beforeAll(async () => {
        _resetClauseSpecCache_TESTING_ONLY();
        const docs: Record<string, string> = { "v1.json": V1.bytes, "v2.json": V2.bytes };
        setClauseSpecFetcher(async (uri) => docs[uri]);
        await loadClauseSpec(V1.clauseKey, "v1.json");
        await loadClauseSpec(V2.clauseKey, "v2.json");
    });
    afterAll(() => _resetClauseSpecCache_TESTING_ONLY());

    it("yields the pin when the template composes the key of the spec that fills currency", () => {
        expect(readTemplateUtilityTokenPins([template(V2.clauseKey)], specSource())).toEqual([TOKEN]);
    });

    it("yields none when the template composes the key of the spec that leaves currency plain", () => {
        expect(readTemplateUtilityTokenPins([template(V1.clauseKey)], specSource())).toEqual([]);
    });
});

// Attribution rides the agreement FORMAT's provenance leaf: the graph is told
// by `provenanceLeaf` (the reserved key), its entries decode to
// `{ compositionHash }` with no spec, and an entry whose payload did not
// recover still attributes when its fingerprint is a loaded assembly's
// `provenanceContentRef`.
describe("attributionFromOverlays — the provenance leaf", () => {
    const COMPOSITION = `0x${"9a".repeat(32)}` as `0x${string}`;
    const OTHER = `0x${"7b".repeat(32)}` as `0x${string}`;
    const PROCESS_A = `0x${"01".repeat(32)}` as `0x${string}`;
    const PROCESS_B = `0x${"02".repeat(32)}` as `0x${string}`;
    const entry = (processId: `0x${string}`, contentRef: `0x${string}`, decoded: Record<string, unknown> | null) => ({
        orderHash: `0x${"11".repeat(32)}` as `0x${string}`,
        processId,
        attester: "0x3333333333333333333333333333333333333333" as `0x${string}`,
        stage: 0,
        universe: "direct" as const,
        blockNumber: 1,
        contentRef,
        decoded,
    });
    const leafGraph = (entries: OverlayGraph["entries"]): OverlayGraph => ({
        boundary: "protocol-derived",
        clauseKey: PROVENANCE_LEAF_KEY,
        spec: null,
        provenanceLeaf: true,
        entries,
    });

    it("attributes a decoded leaf entry to its composition hash", () => {
        const graph = leafGraph([entry(PROCESS_A, provenanceContentRef(COMPOSITION), { compositionHash: COMPOSITION })]);
        expect(attributionFromOverlays([graph], []).get(PROCESS_A)).toBe(COMPOSITION);
    });

    it("attributes an unrecovered leaf entry by matching a loaded assembly's content reference", () => {
        const graph = leafGraph([
            entry(PROCESS_A, provenanceContentRef(COMPOSITION), null),
            entry(PROCESS_B, provenanceContentRef(`0x${"55".repeat(32)}`), null),
        ]);
        const byProcess = attributionFromOverlays([graph], [COMPOSITION, OTHER]);
        expect(byProcess.get(PROCESS_A)).toBe(COMPOSITION);
        expect(byProcess.has(PROCESS_B)).toBe(false);
    });

    it("never attributes from a clause family, whatever field its spec declares", () => {
        const clauseGraph: OverlayGraph = {
            boundary: "protocol-derived",
            clauseKey: `0x${"44".repeat(32)}`,
            spec: { clauseId: "some-clause", version: 1, title: "t", fields: [{ name: "compositionHash", type: "string" }] } as unknown as NonNullable<OverlayGraph["spec"]>,
            provenanceLeaf: false,
            entries: [entry(PROCESS_A, `0x${"66".repeat(32)}`, { compositionHash: COMPOSITION })],
        };
        expect(attributionFromOverlays([clauseGraph], [COMPOSITION]).size).toBe(0);
    });
});
