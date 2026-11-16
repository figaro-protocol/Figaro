/**
 * The readers of a spec's fields and the blinding field of a private set.
 *
 * A blinding field (`blinding: true`) carries a random value tooling draws so
 * that a private set's fingerprint cannot be confirmed by guessing. It is no
 * term: no party's form offers it, a comparison of two parties' filings reads
 * past it (each party draws its own), and a description says the clause
 * carries one without printing it as a term. The spec here is made up; every
 * reader keys on the attribute, never on a clause id or a field name.
 */
import { beforeAll, describe, expect, it } from "vitest";
import { compareStageContent } from "@/lib/composition/stageAttestationComparison";
import { buyerAuthoredFields } from "@/lib/checkout/checkoutDerivations";
import {
    _resetClauseSpecCache_TESTING_ONLY,
    describeClause,
    describeWitness,
    getClauseSpec,
    loadClauseSpec,
    setClauseSpecFetcher,
} from "@/lib/shared/clauseSpecSource";
import { pinSpec } from "./primeClauseSpecs";

const SEAL = { name: "seal", type: "string", format: "bytes32-hex", required: true, disposition: "private", blinding: true };
const PRIVATE_SPEC = {
    clauseId: "test-private-reading",
    version: 1,
    title: "Private reading",
    description: "A private committed grade, and a private witness reading.",
    fields: [{ name: "grade", type: "enum", values: ["a", "b", "c"], required: true, disposition: "private", label: "Grade" }, SEAL],
    stages: { "1": [{ name: "reading", type: "integer", required: true, disposition: "private", label: "Reading" }, SEAL] },
};
const PUBLIC_SPEC = {
    clauseId: "test-public-note",
    version: 1,
    title: "Public note",
    description: "A public note.",
    fields: [{ name: "note", type: "string", required: true }],
};
const PRIVATE = pinSpec(PRIVATE_SPEC);
const PUBLIC = pinSpec(PUBLIC_SPEC);
const value = (byte: string) => `0x${byte.repeat(32)}`;

beforeAll(async () => {
    _resetClauseSpecCache_TESTING_ONLY();
    const byUri = new Map([[`mem://private`, PRIVATE.bytes], [`mem://public`, PUBLIC.bytes]]);
    setClauseSpecFetcher(async (uri) => byUri.get(uri) ?? "");
    await loadClauseSpec(PRIVATE.clauseKey, "mem://private");
    await loadClauseSpec(PUBLIC.clauseKey, "mem://public");
});

describe("compareStageContent reads past a blinding field", () => {
    const stageFields = () => getClauseSpec(PRIVATE.clauseKey)!.stages![1];

    it("two parties filing one reading agree, each with its own blinding value", () => {
        const comparison = compareStageContent(stageFields(), [
            { attester: "0x1111111111111111111111111111111111111111", content: { reading: 7, seal: value("1a") } },
            { attester: "0x2222222222222222222222222222222222222222", content: { reading: 7, seal: value("2b") } },
        ]);
        expect(comparison).toEqual({ kind: "agree" });
    });

    it("two parties filing two readings differ on the reading alone", () => {
        const comparison = compareStageContent(stageFields(), [
            { attester: "0x1111111111111111111111111111111111111111", content: { reading: 7, seal: value("1a") } },
            { attester: "0x2222222222222222222222222222222222222222", content: { reading: 8, seal: value("2b") } },
        ]);
        expect(comparison).toEqual({ kind: "differ", fields: ["reading"] });
    });
});

describe("the descriptions say a clause carries a blinding value, and print it as no term", () => {
    it("describeClause lists the private terms and marks the clause blinded", () => {
        const desc = describeClause(PRIVATE.clauseKey, { grade: "b", seal: value("3c") });
        expect(desc.fields.map((f) => f.name)).toEqual(["grade"]);
        expect(desc.blinded).toBe(true);
        expect(JSON.stringify(desc.fields)).not.toContain("3c3c");
    });

    it("describeWitness does the same over a stage's fields", () => {
        const desc = describeWitness(PRIVATE.clauseKey, 1, { reading: 7, seal: value("3c") });
        expect(desc.fields.map((f) => f.name)).toEqual(["reading"]);
        expect(desc.blinded).toBe(true);
    });

    it("a public clause is not blinded", () => {
        expect(describeClause(PUBLIC.clauseKey, { note: "x" }).blinded).toBe(false);
    });
});

describe("buyerAuthoredFields leaves the blinding field to no one's form", () => {
    it("the buyer fills the private terms and never the blinding value, which tooling draws", () => {
        expect(buyerAuthoredFields(PRIVATE.clauseKey).map((f) => f.name)).toEqual(["grade"]);
    });
});
