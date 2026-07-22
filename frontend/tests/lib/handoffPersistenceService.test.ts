import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const decodeEventLogMock = vi.fn();
const removeOrderEcdhKeypairMock = vi.fn();

vi.mock("viem", async (importOriginal) => {
    const actual = await importOriginal<typeof import("viem")>();
    return {
        ...actual,
        decodeEventLog: (...args: unknown[]) => decodeEventLogMock(...args),
    };
});

vi.mock("@/lib/handoff/ecdh", () => ({
    removeOrderEcdhKeypair: (...args: unknown[]) => removeOrderEcdhKeypairMock(...args),
}));

import {
    DEFAULT_HANDOFF_PERSISTENCE_SERVICE,
    HANDOFF_KEY_STORAGE_KEY,
    HANDOFF_PURGE_QUEUE_KEY,
    PENDING_HANDOFF_INTENT_STORAGE_KEY,
} from "@/lib/handoff/handoffPersistenceService";

describe("handoffPersistenceService", () => {
    const originalDateNow = Date.now;

    beforeEach(() => {
        sessionStorage.clear();
        localStorage.clear();
        decodeEventLogMock.mockReset();
        removeOrderEcdhKeypairMock.mockReset();
        vi.restoreAllMocks();
    });

    afterEach(() => {
        Date.now = originalDateNow;
    });

    it("stores and retrieves handoff keys plus pending intents", () => {
        DEFAULT_HANDOFF_PERSISTENCE_SERVICE.saveHandoffKey("0xABC", {
            keyB64: "key-123",
            txHash: "0xhash",
            processId: "process-1",
            orderId: "order-1",
            createdAt: 123,
        });
        DEFAULT_HANDOFF_PERSISTENCE_SERVICE.savePendingHandoffIntent("0xABC", {
            processId: "process-1",
            originOrderId: "order-1",
            pickupGeohash: "dr5reg",
            dropoffGeohash: "dr5reh",
            maxSellerPrice: "0.5",
            createdAt: 456,
        });

        expect(
            DEFAULT_HANDOFF_PERSISTENCE_SERVICE.getHandoffKey("0xabc", "process-1", "order-1"),
        ).toEqual(expect.objectContaining({ keyB64: "key-123" }));
        expect(
            DEFAULT_HANDOFF_PERSISTENCE_SERVICE.getPendingHandoffIntent("0xabc", "process-1", "order-1"),
        ).toEqual(expect.objectContaining({ dropoffGeohash: "dr5reh" }));

        DEFAULT_HANDOFF_PERSISTENCE_SERVICE.removeHandoffKey("0xabc", "process-1", "order-1");
        DEFAULT_HANDOFF_PERSISTENCE_SERVICE.removePendingHandoffIntent("0xabc", "process-1", "order-1");

        expect(
            DEFAULT_HANDOFF_PERSISTENCE_SERVICE.getHandoffKey("0xabc", "process-1", "order-1"),
        ).toBeNull();
        expect(
            DEFAULT_HANDOFF_PERSISTENCE_SERVICE.getPendingHandoffIntent("0xabc", "process-1", "order-1"),
        ).toBeNull();
        expect(sessionStorage.getItem(HANDOFF_KEY_STORAGE_KEY)).toBeTruthy();
        expect(localStorage.getItem(PENDING_HANDOFF_INTENT_STORAGE_KEY)).toBeTruthy();
    });

    it("sweeps stale abandoned-order key records by age, keeping fresh ones (item 2)", () => {
        const NOW = 10_000_000;
        const MAX_AGE = 24 * 60 * 60 * 1000;
        // A stale record (older than maxAge) and a fresh one.
        DEFAULT_HANDOFF_PERSISTENCE_SERVICE.saveHandoffKey("0xABC", {
            keyB64: "stale", txHash: "0x1", processId: "p-stale", orderId: "o-stale",
            createdAt: NOW - MAX_AGE - 1,
        });
        DEFAULT_HANDOFF_PERSISTENCE_SERVICE.saveHandoffKey("0xABC", {
            keyB64: "fresh", txHash: "0x2", processId: "p-fresh", orderId: "o-fresh",
            createdAt: NOW - 1000,
        });

        DEFAULT_HANDOFF_PERSISTENCE_SERVICE.sweepStaleKeys("0xABC", MAX_AGE, NOW);

        expect(DEFAULT_HANDOFF_PERSISTENCE_SERVICE.getHandoffKey("0xabc", "p-stale", "o-stale")).toBeNull();
        expect(DEFAULT_HANDOFF_PERSISTENCE_SERVICE.getHandoffKey("0xabc", "p-fresh", "o-fresh"))
            .toEqual(expect.objectContaining({ keyB64: "fresh" }));
        // The stale order's ECDH keypair is purged too (via purgeHandoffArtifacts).
        expect(removeOrderEcdhKeypairMock).toHaveBeenCalledWith("0xABC", "o-stale");
    });

    it("does not sweep a record that predates the createdAt field", () => {
        const store = { "0xabc:p-old:o-old": { keyB64: "old", txHash: "0x0", processId: "p-old", orderId: "o-old" } };
        sessionStorage.setItem(HANDOFF_KEY_STORAGE_KEY, JSON.stringify(store));
        DEFAULT_HANDOFF_PERSISTENCE_SERVICE.sweepStaleKeys("0xABC", 1, 9_999_999_999);
        expect(DEFAULT_HANDOFF_PERSISTENCE_SERVICE.getHandoffKey("0xabc", "p-old", "o-old"))
            .toEqual(expect.objectContaining({ keyB64: "old" }));
    });

    it("persists handoff artifacts from an OrderCommitted receipt", async () => {
        const publicClient = {
            waitForTransactionReceipt: vi.fn().mockResolvedValue({
                logs: [
                    { data: "0x01", topics: [] },
                    { data: "0x02", topics: [] },
                ],
            }),
        };

        decodeEventLogMock
            .mockImplementationOnce(() => {
                throw new Error("unrelated log");
            })
            .mockReturnValueOnce({
                eventName: "OrderCommitted",
                args: { processId: "process-2", orderHash: 42n },
            });

        const result = await DEFAULT_HANDOFF_PERSISTENCE_SERVICE.persistHandoffArtifactsForOrder({
            publicClient: publicClient as never,
            buyerAddress: "0x1234",
            orderTxHash: "0xfeed" as `0x${string}`,
            keyB64: "key-abc",
            pickupGeohash: "dr5reg",
            dropoffGeohash: "dr5reh",
            maxSellerPrice: "0.6",
            ephemeralPublicKeyHex: "pub-1",
            ephemeralPrivateKeyHex: "priv-1",
        });

        expect(publicClient.waitForTransactionReceipt).toHaveBeenCalledWith({ hash: "0xfeed" });
        expect(result).toEqual({
            processId: "process-2",
            orderId: "42",
            txHash: "0xfeed",
        });
        expect(
            DEFAULT_HANDOFF_PERSISTENCE_SERVICE.getHandoffKey("0x1234", "process-2", "42"),
        ).toEqual(expect.objectContaining({
            keyB64: "key-abc",
            ephemeralPublicKeyHex: "pub-1",
            ephemeralPrivateKeyHex: "priv-1",
        }));
        expect(
            DEFAULT_HANDOFF_PERSISTENCE_SERVICE.getPendingHandoffIntent("0x1234", "process-2", "42"),
        ).toEqual(expect.objectContaining({ maxSellerPrice: "0.6" }));
    });

    it("purges all records for a resolved process instead of looking up a fake all-order id", () => {
        DEFAULT_HANDOFF_PERSISTENCE_SERVICE.saveHandoffKey("0xabc", {
            keyB64: "key-a",
            txHash: "0x1",
            processId: "process-3",
            orderId: "order-a",
            createdAt: 1,
        });
        DEFAULT_HANDOFF_PERSISTENCE_SERVICE.saveHandoffKey("0xabc", {
            keyB64: "key-b",
            txHash: "0x2",
            processId: "process-3",
            orderId: "order-b",
            createdAt: 2,
        });
        DEFAULT_HANDOFF_PERSISTENCE_SERVICE.saveHandoffKey("0xabc", {
            keyB64: "key-c",
            txHash: "0x3",
            processId: "process-keep",
            orderId: "order-c",
            createdAt: 3,
        });
        DEFAULT_HANDOFF_PERSISTENCE_SERVICE.savePendingHandoffIntent("0xabc", {
            processId: "process-3",
            originOrderId: "order-a",
            pickupGeohash: "dr5reg",
            dropoffGeohash: "dr5reh",
            maxSellerPrice: "0.1",
            createdAt: 4,
        });
        DEFAULT_HANDOFF_PERSISTENCE_SERVICE.savePendingHandoffIntent("0xabc", {
            processId: "process-keep",
            originOrderId: "order-c",
            pickupGeohash: "9q8yyk",
            dropoffGeohash: "9q8yym",
            maxSellerPrice: "0.2",
            createdAt: 5,
        });

        DEFAULT_HANDOFF_PERSISTENCE_SERVICE.purgeHandoffArtifacts("0xabc", "process-3", "all");

        expect(
            DEFAULT_HANDOFF_PERSISTENCE_SERVICE.getHandoffKey("0xabc", "process-3", "order-a"),
        ).toBeNull();
        expect(
            DEFAULT_HANDOFF_PERSISTENCE_SERVICE.getHandoffKey("0xabc", "process-3", "order-b"),
        ).toBeNull();
        expect(
            DEFAULT_HANDOFF_PERSISTENCE_SERVICE.getPendingHandoffIntent("0xabc", "process-3", "order-a"),
        ).toBeNull();
        expect(
            DEFAULT_HANDOFF_PERSISTENCE_SERVICE.getHandoffKey("0xabc", "process-keep", "order-c"),
        ).toEqual(expect.objectContaining({ keyB64: "key-c" }));
        expect(removeOrderEcdhKeypairMock).toHaveBeenCalledWith("0xabc", "order-a");
        expect(removeOrderEcdhKeypairMock).toHaveBeenCalledWith("0xabc", "order-b");
    });

    it("queues deferred purges and sweeps them when due", () => {
        vi.spyOn(Date, "now").mockReturnValue(1000);

        DEFAULT_HANDOFF_PERSISTENCE_SERVICE.saveHandoffKey("0xabc", {
            keyB64: "key-queued",
            txHash: "0x9",
            processId: "process-4",
            orderId: "order-queued",
            createdAt: 9,
        });

        DEFAULT_HANDOFF_PERSISTENCE_SERVICE.schedulePurge("0xabc", "process-4", "order-queued", 25);

        expect(
            JSON.parse(localStorage.getItem(HANDOFF_PURGE_QUEUE_KEY) ?? "[]"),
        ).toEqual([
            expect.objectContaining({ processId: "process-4", orderId: "order-queued", purgeAfter: 1025 }),
        ]);
        expect(
            DEFAULT_HANDOFF_PERSISTENCE_SERVICE.getHandoffKey("0xabc", "process-4", "order-queued"),
        ).not.toBeNull();

        DEFAULT_HANDOFF_PERSISTENCE_SERVICE.sweepDuePurges("0xabc", 1024);
        expect(
            DEFAULT_HANDOFF_PERSISTENCE_SERVICE.getHandoffKey("0xabc", "process-4", "order-queued"),
        ).not.toBeNull();

        DEFAULT_HANDOFF_PERSISTENCE_SERVICE.sweepDuePurges("0xabc", 1025);
        expect(
            DEFAULT_HANDOFF_PERSISTENCE_SERVICE.getHandoffKey("0xabc", "process-4", "order-queued"),
        ).toBeNull();
    });

    it("counts only orders whose handoff keys are still present", async () => {
        DEFAULT_HANDOFF_PERSISTENCE_SERVICE.saveHandoffKey("0xabc", {
            keyB64: "key-present",
            txHash: "0x1",
            processId: "process-5",
            orderId: "order-present",
            createdAt: 1,
        });

        const recovered = await DEFAULT_HANDOFF_PERSISTENCE_SERVICE.recoverHandoffKeys(
            null,
            "0xabc" as `0x${string}`,
            [
                { processId: "process-5", orderId: "order-present" },
                { processId: "process-5", orderId: "order-missing" },
            ],
        );

        expect(recovered).toBe(1);
    });
});