/**
 * The checkout's agreement review names, for each agreement, the seller the
 * walk will commit it against. A process design may hold two entries that
 * follow nothing: the SDK's `rootAgreementOf` takes the first as the root,
 * and `planSubOrderSellers` plans the second as a sub-order with its own
 * bound co-seller. The review must name the lead seller on the root alone,
 * and the planned co-seller on the second, as the walk commits them.
 */
import { readFileSync } from "node:fs";
import path from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { planSubOrderSellers, rootAgreementOf } from "@figaro-protocol/sdk";
import { deriveAgreementGroups } from "@/lib/checkout/checkoutDerivations";
import { requiredCoSellerClauses } from "@/lib/registries/assemblyChoices";
import {
    _resetClauseSpecCache_TESTING_ONLY,
    loadClauseSpec,
    setClauseSpecFetcher,
} from "@/lib/shared/clauseSpecSource";
import { hydrateAuthored, pinSpec } from "./primeClauseSpecs";

const LEAD = "0x1111111111111111111111111111111111111111" as const;
const CO = "0x2222222222222222222222222222222222222222" as const;
// Two process-log clauses (article `attestations`), one per entry, so each
// entry is one a co-seller could be asked to bind.
const base = JSON.parse(readFileSync(path.resolve(process.cwd(), "../clauses/figaro-consent.json"), "utf8"));
const logSpec = (version: number) =>
    pinSpec({ ...base, version, block: { ...base.block, design: { ...base.block.design, article: "attestations" } } });
const SPEC_A = logSpec(101);
const SPEC_B = logSpec(102);
const CLAUSE_A = SPEC_A.clauseKey;
const CLAUSE_B = SPEC_B.clauseKey;

const hydrated = hydrateAuthored({
    agreements: [
        { id: "first", clauses: { [CLAUSE_A]: {} } },
        { id: "second", clauses: { [CLAUSE_B]: {} } },
    ],
}, { compose: false });
const pickedAssembly = {
    hydratedAssembly: hydrated,
    coSellerBindings: [{ clauseKey: CLAUSE_B, addresses: [CO] }],
};
const catalogs = [
    { address: LEAD, name: "Lead seller" },
    { address: CO, name: "Co-seller" },
] as never;

describe("deriveAgreementGroups — two entries that follow nothing", () => {
    beforeAll(async () => {
        _resetClauseSpecCache_TESTING_ONLY();
        const byUri = new Map([SPEC_A, SPEC_B].map((p) => [`mem://${p.clauseKey}`, p.bytes]));
        setClauseSpecFetcher(async (uri) => byUri.get(uri) ?? "");
        for (const p of [SPEC_A, SPEC_B]) await loadClauseSpec(p.clauseKey, `mem://${p.clauseKey}`);
    });
    afterAll(() => _resetClauseSpecCache_TESTING_ONLY());

    it("the SDK takes the first as root and plans the second against its bound co-seller", () => {
        expect(rootAgreementOf(hydrated.assembly).id).toBe("first");
        expect(planSubOrderSellers(pickedAssembly).map(({ node, seller }) => [node.nodeId, seller]))
            .toEqual([["second", CO]]);
    });

    it("names the lead seller on the root and the planned co-seller on the second", () => {
        const groups = deriveAgreementGroups({ pickedAssembly, leadAddress: LEAD, sellerCatalogs: catalogs });
        expect(groups.map((g) => [g.key, g.label])).toEqual([
            ["first", "Lead seller"],
            ["second", "Co-seller"],
        ]);
    });

    it("leaves the second to be assigned when the seller binds it no co-seller", () => {
        const groups = deriveAgreementGroups({
            pickedAssembly: { hydratedAssembly: hydrated, coSellerBindings: [] },
            leadAddress: LEAD,
            sellerCatalogs: catalogs,
        });
        expect(groups.map((g) => [g.key, g.label])).toEqual([
            ["first", "Lead seller"],
            ["second", "(to be assigned)"],
        ]);
    });

    it("asks a co-seller for the second entry's process clauses, never for the root's", () => {
        expect(requiredCoSellerClauses(hydrated)).toEqual([CLAUSE_B]);
    });
});
