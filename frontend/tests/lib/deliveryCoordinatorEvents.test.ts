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
                { name: "schemaId", type: "bytes32", indexed: true },
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

const DELIVERY_SCHEMA_ID = keccak256(stringToHex("figaro-delivery-lifecycle-v1"));
const PROXIMITY_SCHEMA_ID = keccak256(stringToHex("figaro-proximity-v1"));

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
        // Single Attestation event query (proximity is now a schema, not a separate event)
        expect(client.getContractEvents).toHaveBeenCalledTimes(1);
    });

    it("maps Attestation events (stage 0 = Preparation Started)", async () => {
        const source = createDeliveryCoordinatorSource();
        const client = createMockClient(
            {
                Attestation: [
                    makeMockLog("Attestation", {
                        processId: "0xabc",
                        orderHash: "0xorder1",
                        schemaId: DELIVERY_SCHEMA_ID,
                        attester: "0xRestaurant",
                        stage: 0,
                        contentRef: "0xcontent",
                    }),
                ],
            },
            { "100": 1700000100 },
        );

        const events = await source.fetchEvents(client as any, "0xabc" as `0x${string}`);

        expect(events).toHaveLength(1);
        expect(events[0].label).toBe("Preparation Started");
        expect(events[0].eventName).toBe("Attestation");
        expect(events[0].orderHash).toBe("0xorder1");
        expect(events[0].timestamp).toBe(1700000100);
        expect(events[0].details.attester).toBe("0xRestaurant");
    });

    it("maps proximity schema attestation with band stage", async () => {
        const source = createDeliveryCoordinatorSource();
        const client = createMockClient({
            Attestation: [
                makeMockLog("Attestation", {
                    processId: "0xabc",
                    orderHash: "0xorder2",
                    schemaId: PROXIMITY_SCHEMA_ID,
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
        expect(events[0].details.schema).toBe("proximity");
    });

    it("maps proximity schema attestation with NFC band", async () => {
        const source = createDeliveryCoordinatorSource();
        const client = createMockClient({
            Attestation: [
                makeMockLog("Attestation", {
                    processId: "0xabc",
                    orderHash: "0xorder3",
                    schemaId: PROXIMITY_SCHEMA_ID,
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

    it("maps plain Attestation for delivery stage 4", async () => {
        const source = createDeliveryCoordinatorSource();
        const client = createMockClient({
            Attestation: [
                makeMockLog("Attestation", {
                    processId: "0xabc",
                    orderHash: "0xorder4",
                    schemaId: DELIVERY_SCHEMA_ID,
                    attester: "0xDriver",
                    stage: 4, // Order Delivered
                    contentRef: "0x",
                }),
            ],
        });

        const events = await source.fetchEvents(client as any, "0xabc" as `0x${string}`);

        expect(events).toHaveLength(1);
        expect(events[0].label).toBe("Order Delivered");
        expect(events[0].eventName).toBe("Attestation");
    });

    it("filters out events with non-delivery and non-proximity schemaId", async () => {
        const otherSchema = keccak256(stringToHex("figaro-ghg-disclosure-v1"));
        const source = createDeliveryCoordinatorSource();
        const client = createMockClient({
            Attestation: [
                makeMockLog("Attestation", {
                    processId: "0xabc",
                    orderHash: "0xorder5",
                    schemaId: otherSchema,
                    attester: "0xSomeone",
                    stage: 0,
                    contentRef: "0x",
                }),
            ],
        });

        const events = await source.fetchEvents(client as any, "0xabc" as `0x${string}`);
        expect(events).toHaveLength(0);
    });

    it("collects events from both delivery and proximity schemas", async () => {
        const source = createDeliveryCoordinatorSource();
        const client = createMockClient(
            {
                Attestation: [
                    makeMockLog("Attestation", {
                        processId: "0xabc",
                        orderHash: "0xo1",
                        schemaId: DELIVERY_SCHEMA_ID,
                        attester: "0xR",
                        stage: 0,
                        contentRef: "0x",
                    }, 10n, "0xtx1"),
                    makeMockLog("Attestation", {
                        processId: "0xabc",
                        orderHash: "0xo2",
                        schemaId: DELIVERY_SCHEMA_ID,
                        attester: "0xR",
                        stage: 1,
                        contentRef: "0x",
                    }, 20n, "0xtx2"),
                    makeMockLog("Attestation", {
                        processId: "0xabc",
                        orderHash: "0xo3",
                        schemaId: PROXIMITY_SCHEMA_ID,
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
        // All events come through Attestation — two delivery + one proximity
        expect(events.map((e) => e.label)).toEqual([
            "Preparation Started",
            "Ready for Pickup",
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
                    schemaId: DELIVERY_SCHEMA_ID,
                    attester: "0xR",
                    stage: 0,
                    contentRef: "0x",
                }, 100n, "0xtx1"),
                makeMockLog("Attestation", {
                    processId: "0xabc",
                    orderHash: "0xo2",
                    schemaId: DELIVERY_SCHEMA_ID,
                    attester: "0xR",
                    stage: 1,
                    contentRef: "0x",
                }, 100n, "0xtx2"),  // same block
            ],
        });

        await source.fetchEvents(client as any, "0xabc" as `0x${string}`);

        // Two events in the same block should produce only one getBlock call
        expect(client.getBlock).toHaveBeenCalledTimes(1);
    });
});
