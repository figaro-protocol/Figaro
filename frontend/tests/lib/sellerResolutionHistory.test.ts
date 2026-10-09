/**
 * getSellerResolutionHistory — a party attests for itself, so the member's
 * attestation tally counts the attestations the member filed: never its
 * buyer's, never a co-seller's.
 */
import { describe, expect, it, vi } from "vitest";

const MEMBER = "0x00000000000000000000000000000000000000a1";
const BUYER = "0x00000000000000000000000000000000000000b1";
const CO_SELLER = "0x00000000000000000000000000000000000000c1";
const PROCESS = `0x${"01".repeat(32)}`;
const ORDER_SOLD = `0x${"0a".repeat(32)}`;
const CLAUSE = `0x${"cc".repeat(32)}`;

const sold = {
    args: { orderHash: ORDER_SOLD, processId: PROCESS, buyer: BUYER, seller: MEMBER, currency: `0x${"77".repeat(20)}`, payment: 1n },
    blockNumber: 1n,
};
const attestation = (attester: string) => ({
    args: { orderHash: ORDER_SOLD, processId: PROCESS, attester, clauseId: CLAUSE, stage: 0, contentRef: `0x${"00".repeat(32)}` },
    blockNumber: 2n,
});

vi.mock("@/lib/kernel/indexer", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/kernel/indexer")>();
    return {
        ...actual,
        getOrderCommittedBySeller: async () => [sold],
        getOrderCommittedByBuyer: async () => [],
        getAllOrderResolved: async () => [],
        cachedGetLogsMulti: async () => [
            attestation(MEMBER),    // the member's own
            attestation(BUYER),     // the buyer's
            attestation(CO_SELLER), // a co-seller's
        ],
    };
});
vi.mock("@/lib/kernel/eventCache", () => ({ cachedGetLogs: async () => [] }));
vi.mock("@/lib/protocol/membersRegistryIndexer", () => ({ getAllMemberRegistered: async () => [] }));
vi.mock("@/lib/composition/contracts", () => ({
    getAttestationCoordinator: () => "0x00000000000000000000000000000000000000f1",
    getBatchVerifier: () => undefined,
}));

import { getSellerResolutionHistory } from "@/lib/composition/indexer";

describe("getSellerResolutionHistory attestation tally", () => {
    it("counts the member's own attestation, never the buyer's or a co-seller's", async () => {
        const history = await getSellerResolutionHistory({} as never, 31337, MEMBER);
        expect(history.attestationsEmitted).toBe(1);
        expect(history.attestationsByClause).toEqual([{ clauseId: CLAUSE, count: 1 }]);
    });
});
