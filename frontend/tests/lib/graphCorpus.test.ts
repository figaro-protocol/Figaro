/**
 * The corpus reads each designer's utility-token pin off the loaded templates
 * at the version the template composed for the clause (`templateClauseVersion`
 * over the template's own sparse `clauseVersions` — absent = 1), never at
 * version 1 regardless: a v2 composition's pin lives in the v2 spec's fields.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { canonicalContentHash } from "@figaro-protocol/sdk";
import { readTemplateUtilityTokenPins } from "@/lib/data/graphCorpus";
import {
    _resetClauseSpecCache_TESTING_ONLY,
    loadClauseSpec,
    setClauseSpecFetcher,
    specSource,
} from "@/lib/shared/clauseSpecSource";

const UTILITY_TOKEN = "figaro-utility-token";
const TOKEN = "0x2222222222222222222222222222222222222222" as const;
const canonical = JSON.parse(readFileSync(path.resolve(process.cwd(), `../clauses/${UTILITY_TOKEN}.json`), "utf8"));
// v1 declares `currency` as plain content (no design fill), so it is never a
// pin; v2 declares it as the designer fill, so it is one.
const v1 = { ...canonical, version: 1, block: { ...canonical.block, design: { ...canonical.block.design, fills: [] } } };
const v2 = { ...canonical, version: 2 };

type Templates = Parameters<typeof readTemplateUtilityTokenPins>[0];
const template = (clauseVersions?: Record<string, number>): Templates[number] => ({
    compositionHash: `0x${"ab".repeat(32)}`,
    name: "pinned",
    clauseSets: [{ clauses: { [UTILITY_TOKEN]: { currency: TOKEN } }, ...(clauseVersions && { clauseVersions }) }],
});

describe("readTemplateUtilityTokenPins — the pin read at the composed version", () => {
    beforeAll(async () => {
        _resetClauseSpecCache_TESTING_ONLY();
        const docs: Record<string, unknown> = { "v1.json": v1, "v2.json": v2 };
        setClauseSpecFetcher(async (uri) => docs[uri]);
        await loadClauseSpec(UTILITY_TOKEN, 1, "v1.json", canonicalContentHash(v1));
        await loadClauseSpec(UTILITY_TOKEN, 2, "v2.json", canonicalContentHash(v2));
    });
    afterAll(() => _resetClauseSpecCache_TESTING_ONLY());

    it("yields the v2 pin when the template's clauseVersions names v2 for the utility-token clause", () => {
        expect(readTemplateUtilityTokenPins([template({ [UTILITY_TOKEN]: 2 })], specSource())).toEqual([TOKEN]);
    });

    it("reads the clause at v1 when the template's clauseVersions omits it, and v1 declares no pin", () => {
        expect(readTemplateUtilityTokenPins([template()], specSource())).toEqual([]);
    });
});
