/**
 * attestationAnchorMatches with a whole place — the check every hand-off
 * ceremony's receiver makes (the private filings for each entry, the content
 * delivery and the address detail for their one payload): an Attestation on the order at
 * that content reference, under that clause and stage, attested by the
 * sender. A row at the same reference that differs in attester, clause or
 * stage is refused; a row from either emitter (the coordinator's direct
 * path, the batch verifier's) is accepted alike.
 */
import { describe, expect, it, vi } from "vitest";
import type { PublicClient } from "viem";

const ORDER = `0x${"0a".repeat(32)}`;
const CLAUSE = `0x${"c1".repeat(32)}`;
const OTHER_CLAUSE = `0x${"c2".repeat(32)}`;
const REF = `0x${"ef".repeat(32)}` as const;
const SELLER = "0x2222222222222222222222222222222222222222";
const THIRD = "0x3333333333333333333333333333333333333333";

let rows: Array<Record<string, unknown>> = [];
vi.mock("@/lib/composition/indexer", () => ({
    getAttestationsByOrder: async (_c: unknown, _id: number, orderHash: string) =>
        rows.filter((r) => String(r.orderHash).toLowerCase() === orderHash.toLowerCase()),
}));

import { attestationAnchorMatches } from "@/lib/handoff/handoffAnchorState";

const client = {} as PublicClient;
const place = { contentRef: REF, clauseId: CLAUSE, stage: 1, attester: SELLER };
const row = (over: Record<string, unknown>) => ({
    orderHash: ORDER, processId: `0x${"ab".repeat(32)}`, clauseId: CLAUSE, stage: 1, attester: SELLER,
    contentRef: REF, blockNumber: 7, transactionHash: null, universe: "direct", ...over,
});

describe("the anchor of a received private filing is its whole place", () => {
    it("an Attestation by the sender at that clause, stage and reference matches", async () => {
        rows = [row({})];
        expect(await attestationAnchorMatches(client, 31337, ORDER, place)).toBe(true);
    });

    it("one from the batch path (FigaroBatchVerifier's re-emission) matches alike", async () => {
        rows = [row({ universe: "batch" })];
        expect(await attestationAnchorMatches(client, 31337, ORDER, place)).toBe(true);
    });

    it("the same reference attested by another wallet is refused", async () => {
        rows = [row({ attester: THIRD })];
        expect(await attestationAnchorMatches(client, 31337, ORDER, place)).toBe(false);
    });

    it("the same reference under another clause or another stage is refused", async () => {
        rows = [row({ clauseId: OTHER_CLAUSE }), row({ stage: 2 })];
        expect(await attestationAnchorMatches(client, 31337, ORDER, place)).toBe(false);
    });

    it("the same place on another order is refused", async () => {
        rows = [row({ orderHash: `0x${"0b".repeat(32)}` })];
        expect(await attestationAnchorMatches(client, 31337, ORDER, place)).toBe(false);
    });

    it("a row carrying the reference alone, by another wallet under another clause and stage, is no anchor", async () => {
        rows = [row({ attester: THIRD, clauseId: OTHER_CLAUSE, stage: 2 })];
        expect(await attestationAnchorMatches(client, 31337, ORDER, place)).toBe(false);
    });
});
