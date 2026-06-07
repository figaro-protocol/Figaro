import { describe, expect, it, vi, beforeEach } from "vitest";
import { keccak256, stringToHex } from "viem";
import { createDeliveryCoordinatorSource } from "@/lib/mechanisms/deliveryCoordinatorEvents";

// ---------------------------------------------------------------------------
// Mock CONTRACTS.attestationCoordinator
// ---------------------------------------------------------------------------

const MOCK_COORDINATOR = "0x1234000000000000000000000000000000005678" as `0x${string}`;

vi.mock("@/lib/core/contracts", () => ({
    CONTRACTS: { attestationCoordinator: "0x1234000000000000000000000000000000005678" },
    ATTESTATION_COORDINATOR_ABI: [
        {
            type: "event",
            name: "Attestation",
            inputs: [
                { name: "processId", type: "bytes32", indexed: true },
                { name: "orderHash", type: "bytes32", indexed: true },
                { name: "clauseId", type: "bytes32", indexed: true },
                { name: "attester", type: "address" },
                { name: "stage", type: "uint8" },
                { name: "contentRef", type: "bytes32" },
            ],
        },
    ],
}));

// ---------------------------------------------------------------------------
// Test helpers
// ---------------------------------------------------------------------------

const MERCHANT_CLAUSE_ID = keccak256(stringToHex("figaro-merchant-process-v1"));
const COURIER_CLAUSE_ID = keccak256(stringToHex("figaro-courier-process-v1"));
const PROXIMITY_CLAUSE_ID = keccak256(stringToHex("figaro-proximity-proof-v1"));

function makeMockLog(
    eventName: string,
    args: Record<string, unknown>,
    blockNumber = 100n,
    txHash = "0xtx1",
) {
    return { args, blockNumber, transactionHash: txHash, eventName };
}

function createMockClient(
    eventLogs: Record<string, ReturnType<typeof makeMockLog>[]> = {},
    blockTimestamps: Record<string, number> = {},
) {
    return {
        getContractEvents: vi.fn(async ({ eventName }: { eventName: string }) => {
            return eventLogs[eventName] ?? [];
        }),
        getBlock: vi.fn(async ({ blockNumber }: { blockNumber: bigint }) => {
            return { timestamp: BigInt(blockTimestamps[blockNumber.toString()] ?? 1700000000) };
        }),
    };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("createDeliveryCoordinatorSource", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("returns a source with name and fetchEvents", () => {
        const source = createDeliveryCoordinatorSource();
        expect(source.name).toBe("DeliveryCoordinator");
        expect(typeof source.fetchEvents).toBe("function");
    });

    it("returns empty array when no events exist", async () => {
        const source = createDeliveryCoordinatorSource();
        const client = createMockClient();
        const events = await source.fetchEvents(client as any, "0xabc" as `0x${string}`);

        expect(events).toEqual([]);
        // Single Attestation event query (proximity is now a clause, not a separate event)
        expect(client.getContractEvents).toHaveBeenCalledTimes(1);
    });

    it("maps merchant-process events (stage 2 = handed-off, the clause enum)", async () => {
        const source = createDeliveryCoordinatorSource();
        const client = createMockClient(
            {
                Attestation: [
                    makeMockLog("Attestation", {
                        processId: "0xabc",
                        orderHash: "0xorder1",
                        clauseId: MERCHANT_CLAUSE_ID,
                        attester: "0xRestaurant",
                        stage: 2,
                        contentRef: "0xcontent",
                    }),
                ],
            },
            { "100": 1700000100 },
        );

        const events = await source.fetchEvents(client as any, "0xabc" as `0x${string}`);

        expect(events).toHaveLength(1);
        expect(events[0].label).toBe("handed-off");
        expect(events[0].eventName).toBe("Attestation");
        expect(events[0].orderHash).toBe("0xorder1");
        expect(events[0].timestamp).toBe(1700000100);
        expect(events[0].details.attester).toBe("0xRestaurant");
        expect(events[0].details.clause).toBe("merchant-process");
    });

    it("maps proximity clause attestation with band stage", async () => {
        const source = createDeliveryCoordinatorSource();
        const client = createMockClient({
            Attestation: [
                makeMockLog("Attestation", {
                    processId: "0xabc",
                    orderHash: "0xorder2",
                    clauseId: PROXIMITY_CLAUSE_ID,
                    attester: "0xDriver",
                    stage: 2, // Nearby (BLE ~10m)
                    contentRef: "0xproofhash",
                }),
            ],
        });

        const events = await source.fetchEvents(client as any, "0xabc" as `0x${string}`);

        expect(events).toHaveLength(1);
        expect(events[0].label).toContain("Proximity Proof");
        expect(events[0].label).toContain("Nearby (BLE ~10m)");
        expect(events[0].eventName).toBe("Attestation");
        expect(events[0].details.clause).toBe("proximity");
    });

    it("maps proximity clause attestation with NFC band", async () => {
        const source = createDeliveryCoordinatorSource();
        const client = createMockClient({
            Attestation: [
                makeMockLog("Attestation", {
                    processId: "0xabc",
                    orderHash: "0xorder3",
                    clauseId: PROXIMITY_CLAUSE_ID,
                    attester: "0xDriver",
                    stage: 3, // Contact (NFC ~4cm)
                    contentRef: "0xproofhash",
                }),
            ],
        });

        const events = await source.fetchEvents(client as any, "0xabc" as `0x${string}`);

        expect(events).toHaveLength(1);
        expect(events[0].label).toContain("Contact (NFC ~4cm)");
    });

    it("maps courier-process Attestation for completed (stage 4, the clause enum)", async () => {
        const source = createDeliveryCoordinatorSource();
        const client = createMockClient({
            Attestation: [
                makeMockLog("Attestation", {
                    processId: "0xabc",
                    orderHash: "0xorder4",
                    clauseId: COURIER_CLAUSE_ID,
                    attester: "0xDriver",
                    stage: 4, // completed (en-route-pickup=0 … completed=4, cancelled=5)
                    contentRef: "0x",
                }),
            ],
        });

        const events = await source.fetchEvents(client as any, "0xabc" as `0x${string}`);

        expect(events).toHaveLength(1);
        expect(events[0].label).toBe("completed");
        expect(events[0].eventName).toBe("Attestation");
        expect(events[0].details.clause).toBe("courier-process");
    });

    it("filters out events with non-process and non-proximity clauseId", async () => {
        const otherClause = keccak256(stringToHex("figaro-ghg-iso-14064-v1"));
        const source = createDeliveryCoordinatorSource();
        const client = createMockClient({
            Attestation: [
                makeMockLog("Attestation", {
                    processId: "0xabc",
                    orderHash: "0xorder5",
                    clauseId: otherClause,
                    attester: "0xSomeone",
                    stage: 0,
                    contentRef: "0x",
                }),
            ],
        });

        const events = await source.fetchEvents(client as any, "0xabc" as `0x${string}`);
        expect(events).toHaveLength(0);
    });

    it("collects events from merchant, courier, and proximity clauses", async () => {
        const source = createDeliveryCoordinatorSource();
        const client = createMockClient(
            {
                Attestation: [
                    makeMockLog("Attestation", {
                        processId: "0xabc",
                        orderHash: "0xo1",
                        clauseId: MERCHANT_CLAUSE_ID,
                        attester: "0xR",
                        stage: 2,
                        contentRef: "0x",
                    }, 10n, "0xtx1"),
                    makeMockLog("Attestation", {
                        processId: "0xabc",
                        orderHash: "0xo2",
                        clauseId: COURIER_CLAUSE_ID,
                        attester: "0xR",
                        stage: 2,
                        contentRef: "0x",
                    }, 20n, "0xtx2"),
                    makeMockLog("Attestation", {
                        processId: "0xabc",
                        orderHash: "0xo3",
                        clauseId: PROXIMITY_CLAUSE_ID,
                        attester: "0xD",
                        stage: 2, // Nearby
                        contentRef: "0xproofhash",
                    }, 30n, "0xtx3"),
                ],
            },
            { "10": 1700000010, "20": 1700000020, "30": 1700000030 },
        );

        const events = await source.fetchEvents(client as any, "0xabc" as `0x${string}`);

        expect(events).toHaveLength(3);
        expect(events.map((e) => e.label)).toEqual([
            "handed-off",   // merchant stage 2
            "in-transit",   // courier stage 2
            expect.stringContaining("Proximity Proof"),
        ]);
    });

    it("caches block timestamps (deduplicates getBlock calls)", async () => {
        const source = createDeliveryCoordinatorSource();
        const client = createMockClient({
            Attestation: [
                makeMockLog("Attestation", {
                    processId: "0xabc",
                    orderHash: "0xo1",
                    clauseId: MERCHANT_CLAUSE_ID,
                    attester: "0xR",
                    stage: 2,
                    contentRef: "0x",
                }, 100n, "0xtx1"),
                makeMockLog("Attestation", {
                    processId: "0xabc",
                    orderHash: "0xo2",
                    clauseId: MERCHANT_CLAUSE_ID,
                    attester: "0xR",
                    stage: 3,
                    contentRef: "0x",
                }, 100n, "0xtx2"),  // same block
            ],
        });

        await source.fetchEvents(client as any, "0xabc" as `0x${string}`);

        // Two events in the same block should produce only one getBlock call
        expect(client.getBlock).toHaveBeenCalledTimes(1);
    });
});
