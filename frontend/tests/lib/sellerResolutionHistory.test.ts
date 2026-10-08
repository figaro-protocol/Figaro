/**
 * getSellerResolutionHistory — attestation tallies count what stands for the
 * member, by the capability model's own rule (`attestationStandsFor`): the
 * member's own attestations, and on an order the member sold, an attester that
 * is neither its buyer nor a seller of another order of the process (it
 * reached the order through `attestViaResolver`, which the member authorized).
 */
import { describe, expect, it, vi } from "vitest";

const MEMBER = "0x00000000000000000000000000000000000000a1";
const BUYER = "0x00000000000000000000000000000000000000b1";
const CO_SELLER = "0x00000000000000000000000000000000000000c1";
const RESOLVER = "0x00000000000000000000000000000000000000d1";
const STRANGER = "0x00000000000000000000000000000000000000e1";
const PROCESS = `0x${"01".repeat(32)}`;
const OTHER_PROCESS = `0x${"02".repeat(32)}`;
const ORDER_SOLD = `0x${"0a".repeat(32)}`;
const ORDER_CO = `0x${"0c".repeat(32)}`;
const ORDER_ELSEWHERE = `0x${"0e".repeat(32)}`;
const CLAUSE = `0x${"cc".repeat(32)}`;

const committed = (orderHash: string, processId: string, buyer: string, seller: string) => ({
    args: { orderHash, processId, buyer, seller, currency: `0x${"77".repeat(20)}`, payment: 1n },
    blockNumber: 1n,
});
const attestation = (orderHash: string, processId: string, attester: string) => ({
    args: { orderHash, processId, attester, clauseId: CLAUSE, stage: 0, contentRef: `0x${"00".repeat(32)}` },
    blockNumber: 2n,
});

const sold = committed(ORDER_SOLD, PROCESS, BUYER, MEMBER);
const coOrder = committed(ORDER_CO, PROCESS, BUYER, CO_SELLER);
const elsewhere = committed(ORDER_ELSEWHERE, OTHER_PROCESS, BUYER, STRANGER);

vi.mock("@/lib/kernel/indexer", async (importOriginal) => {
    const actual = await importOriginal<typeof import("@/lib/kernel/indexer")>();
    return {
        ...actual,
        getOrderCommittedBySeller: async () => [sold],
        getOrderCommittedByBuyer: async () => [],
        getAllOrderCommitted: async () => [sold, coOrder, elsewhere],
        getAllOrderResolved: async () => [],
        cachedGetLogsMulti: async () => [
            attestation(ORDER_SOLD, PROCESS, MEMBER),       // the member's own
            attestation(ORDER_SOLD, PROCESS, RESOLVER),     // an authorized resolver on the member's order
            attestation(ORDER_SOLD, PROCESS, BUYER),        // the buyer stands for the buyer
            attestation(ORDER_SOLD, PROCESS, CO_SELLER),    // a co-seller stands for its own order
            attestation(ORDER_ELSEWHERE, OTHER_PROCESS, RESOLVER), // another seller's resolver
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
    it("counts the member's own and an authorized resolver's, never the buyer's or a co-seller's", async () => {
        const history = await getSellerResolutionHistory({} as never, 31337, MEMBER);
        expect(history.attestationsEmitted).toBe(2);
        expect(history.attestationsByClause).toEqual([{ clauseId: CLAUSE, count: 2 }]);
    });
});
