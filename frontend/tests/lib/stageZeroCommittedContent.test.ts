/**
 * Committed content and evidence (CLAUDE.md § "The clause's seams", 4;
 * docs/CLAUSES.md § "Witness stages"). The content the parties sign at
 * commit is validated over the spec's top-level `fields` alone, even when the
 * spec declares a `stages["0"]` set. Each attestation, at stage 0 or later, is
 * encoded over `stages[N]` where the spec declares it, else over `fields`: a
 * declared stage is the shape of the evidence attested while the process is
 * open, never the shape of what was signed.
 *
 * The clause is a stranger's registration this codebase has never seen, read
 * through the live cache (`clauseSpecSource`) and the SDK's sign gate, the
 * two readers the reference frontend uses.
 */
import { beforeAll, describe, expect, it } from "vitest";
import {
    buildOrderAgreement,
    validateCommitmentAgreement,
    type Commitment,
} from "@figaro-protocol/sdk";
import {
    attestationContentFields,
    attestationIsWitness,
    loadClauseSpec,
    setClauseSpecFetcher,
    specSource,
} from "@/lib/shared/clauseSpecSource";
import { pinSpec } from "./primeClauseSpecs";

const BUYER = "0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266" as const;
const SELLER = "0x2546BcD3c84621e976D8185a91A922aE77ECEc30" as const;
const COMMITMENT: Commitment = {
    processId: `0x${"00".repeat(32)}`,
    buyer: BUYER,
    seller: SELLER,
    token: "0x0000000000000000000000000000000000000001",
    payment: 1n,
    runningTotal: 1n,
    checkoutHash: `0x${"00".repeat(32)}`,
    salt: 0n,
    commitDeadline: 0n,
};

/** A stranger's clause: signed terms in `fields`, a stage-0 reading and a stage-2 report as evidence. */
const SPEC = {
    clauseId: "stranger-cold-chain",
    version: 1,
    title: "A stranger's cold chain",
    description: "A temperature ceiling agreed at commit, readings attested while the process is open.",
    fields: [{ name: "ceilingCelsius", type: "integer", required: true }],
    stages: {
        "0": [{ name: "readingCelsius", type: "integer", required: true }],
        "2": [{ name: "report", type: "string", required: true, minLength: 1, maxLength: 64 }],
    },
    block: { design: { article: "terms" } },
};

const { clauseKey, bytes } = pinSpec(SPEC);

beforeAll(async () => {
    setClauseSpecFetcher(async () => bytes);
    await loadClauseSpec(clauseKey, "mem://stranger-cold-chain");
});

const gate = (content: Record<string, unknown>) => {
    const { agreement, checkoutHash } = buildOrderAgreement(BUYER, SELLER, { [clauseKey]: content }, specSource());
    return validateCommitmentAgreement(agreement, checkoutHash, specSource(), COMMITMENT, null);
};

describe("stage 0 is the committed content; later stages are the shape of an attestation", () => {
    it("the sign gate validates the committed content over the top-level fields", () => {
        expect(gate({ ceilingCelsius: 8 }).issues).toEqual([]);
    });

    it("the sign gate refuses committed content shaped as the declared stage-0 set", () => {
        const check = gate({ readingCelsius: 5 });
        expect(check.ok).toBe(false);
        expect(check.issues.map((i) => i.path)).toContain("$.ceilingCelsius");
    });

    it("an attestation at a declared stage is encoded over that stage's set, stage 0 included", () => {
        expect(attestationContentFields(clauseKey, 0)?.map((f) => f.name)).toEqual(["readingCelsius"]);
        expect(attestationContentFields(clauseKey, 2)?.map((f) => f.name)).toEqual(["report"]);
        expect(attestationIsWitness(clauseKey, 0)).toBe(true);
        expect(attestationIsWitness(clauseKey, 2)).toBe(true);
    });

    it("an attestation at a stage the spec does not declare is read over the top-level fields", () => {
        expect(attestationContentFields(clauseKey, 1)?.map((f) => f.name)).toEqual(["ceilingCelsius"]);
        expect(attestationIsWitness(clauseKey, 1)).toBe(false);
    });
});
