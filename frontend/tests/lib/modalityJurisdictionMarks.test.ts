/**
 * The order's modality and its jurisdiction are read through the marks a
 * clause's spec declares in `block.runtime` (`modality`, `jurisdiction`),
 * never through a field's name (CLAUDE.md § "The clause's seams", 5;
 * docs/CLAUSES.md § "Clause-spec format"). Two readers show them: the
 * audit's contract document (`extractContract`) and the process model
 * (`deriveProcessModelFromRuntime`, `rootModality`).
 *
 * For each mark: a stranger's clause, with an id and field names no
 * reference spec has, that declares the mark is read; the reference clause
 * with its mark is read; a clause with a field of the reference's name and
 * no mark is not; and a mark the spec's own fields contradict marks nothing.
 */
import { afterEach, describe, expect, it } from "vitest";
import type { Agreement } from "@figaro-protocol/sdk";
import { extractContract } from "@/lib/data/audit/contractExtract";
import { deriveProcessModelFromRuntime } from "@/lib/semantic/deriveProcessModelFromRuntime";
import { OrderState, type Order } from "@/lib/core/store";
import { _resetClauseSpecCache_TESTING_ONLY, loadClauseSpec, setClauseSpecFetcher } from "@/lib/shared/clauseSpecSource";
import { keyOf, pinSpec, primeClauseSpecs } from "./primeClauseSpecs";

afterEach(() => {
    _resetClauseSpecCache_TESTING_ONLY();
});

const BUYER = "0x1111111111111111111111111111111111111111";
const SELLER = "0x2222222222222222222222222222222222222222";
const PROCESS = `0x${"02".repeat(32)}`;
const CHECKOUT = `0x${"e0".repeat(32)}`;

const ROOT: Order = {
    orderHash: `0x${"01".repeat(32)}`, processId: PROCESS, buyer: BUYER, seller: SELLER,
    payment: 100n, runningTotal: 100n, state: OrderState.Active, sellerBond: 200n, buyerBond: 200n,
    salt: 1n, commitDeadline: 1n, checkoutHash: CHECKOUT,
} as Order;

/** Serve one spec of the test's own to the spec cache, as the registry read does. */
async function serveSpec(spec: Record<string, unknown>): Promise<string> {
    const pinned = pinSpec(spec);
    setClauseSpecFetcher(async () => pinned.bytes);
    await loadClauseSpec(pinned.clauseKey, `mem://${String(spec.clauseId)}`);
    return pinned.clauseKey;
}

const spec = (clauseId: string, fields: string[], runtime: Record<string, unknown> = {}) => ({
    clauseId, version: 1, title: clauseId, description: "A clause of the test's own.",
    fields: fields.map((name) => ({ name, type: "string", required: true })),
    stages: {},
    block: { design: { article: "terms" }, runtime },
});

const agreementWith = (clause: string, data: Record<string, unknown>): Agreement =>
    ({ buyer: BUYER, seller: SELLER, clauses: [{ clause, data }], follows: [] } as unknown as Agreement);

const contractOf = (a: Agreement) => extractContract(ROOT, a);
const rootModalityOf = (a: Agreement) => deriveProcessModelFromRuntime(
    { processId: PROCESS, orderCount: 1, hasActive: true, createdAt: 0, orders: [] },
    [ROOT],
    new Map([[CHECKOUT, a]]),
    BUYER,
).rootModality;

describe("the modality is the field a spec marks (block.runtime.modality)", () => {
    it("a stranger's clause that marks its own field is read by the contract and the process model", async () => {
        const key = await serveSpec(spec("stranger-service", ["servedAs"], { modality: "servedAs" }));
        const a = agreementWith(key, { servedAs: "kerbside" });
        expect(contractOf(a).method).toBe("kerbside");
        expect(rootModalityOf(a)).toBe("kerbside");
    });

    it("the reference clause, with its mark, is read", async () => {
        await primeClauseSpecs(["figaro-modalities"]);
        const a = agreementWith(keyOf("figaro-modalities"), { modality: "pickup" });
        expect(contractOf(a).method).toBe("pickup");
        expect(rootModalityOf(a)).toBe("pickup");
    });

    it("a clause with a field named modality and no mark has no modality", async () => {
        const key = await serveSpec(spec("unmarked-service", ["modality"]));
        const a = agreementWith(key, { modality: "pickup" });
        expect(contractOf(a).method).toBeUndefined();
        expect(rootModalityOf(a)).toBeNull();
    });

    it("a mark the spec's own fields contradict marks nothing", async () => {
        const key = await serveSpec(spec("contradicted-service", ["servedAs"], { modality: "howServed" }));
        expect(contractOf(agreementWith(key, { servedAs: "kerbside", howServed: "kerbside" })).method).toBeUndefined();
    });
});

describe("the jurisdiction is the fields a spec marks (block.runtime.jurisdiction)", () => {
    it("a stranger's clause that marks its own law, forum and language is read", async () => {
        const key = await serveSpec(spec("stranger-venue", ["governedBy", "seat", "tongue"], {
            jurisdiction: { law: "governedBy", forum: "seat", language: "tongue" },
        }));
        expect(contractOf(agreementWith(key, { governedBy: "CH", seat: "Geneva arbitration", tongue: "fr" })).jurisdiction)
            .toEqual({ law: "CH", forum: "Geneva arbitration", language: "fr" });
    });

    it("a mark that names the law alone reads the law alone", async () => {
        const key = await serveSpec(spec("stranger-law", ["governedBy", "seat"], { jurisdiction: { law: "governedBy" } }));
        expect(contractOf(agreementWith(key, { governedBy: "CH", seat: "Geneva" })).jurisdiction).toEqual({ law: "CH" });
    });

    it("the reference clause, with its mark, is read", async () => {
        await primeClauseSpecs(["figaro-applicable-law"]);
        const a = agreementWith(keyOf("figaro-applicable-law"), { applicableLaw: "US-NY", forum: "us-federal-court", language: "en" });
        expect(contractOf(a).jurisdiction).toEqual({ law: "US-NY", forum: "us-federal-court", language: "en" });
    });

    it("a clause with a field named applicableLaw and no mark has no jurisdiction", async () => {
        const key = await serveSpec(spec("unmarked-law", ["applicableLaw", "forum", "language"]));
        expect(contractOf(agreementWith(key, { applicableLaw: "US-NY", forum: "court", language: "en" })).jurisdiction).toBeUndefined();
    });

    it("a mark the spec's own fields contradict marks nothing", async () => {
        const key = await serveSpec(spec("contradicted-law", ["governedBy"], { jurisdiction: { law: "governedBy", forum: "seat" } }));
        expect(contractOf(agreementWith(key, { governedBy: "CH", seat: "Geneva" })).jurisdiction).toBeUndefined();
    });
});
