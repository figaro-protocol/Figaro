/**
 * handoffPersistenceService — the resolution-path purge choreography.
 *
 * The service's whole surface after the GDPR ruling (2026-07-22): purge an
 * order's ECDH ephemeral keypair from the live sessionStorage store —
 * crypto-shredding on resolution — immediately or after a grace period via
 * the localStorage purge queue. The deleted durable data side (saved handoff
 * keys, pending intents with geohashes, wallet-signature recovery) has no
 * tests because it has no code. Real ecdh store, no mocks.
 */
import { beforeEach, describe, expect, it } from "vitest";
import {
    DEFAULT_HANDOFF_PERSISTENCE_SERVICE,
    HANDOFF_PURGE_QUEUE_KEY,
} from "@/lib/handoff/handoffPersistenceService";
import { getOrCreateOrderEcdhKeypair, getOrderEcdhKeypair } from "@/lib/handoff/ecdh";

const ADDR = "0xAbC0000000000000000000000000000000000001";

beforeEach(() => {
    window.sessionStorage.clear();
    window.localStorage.clear();
});

describe("the resolution-path purge", () => {
    it("purgeHandoffArtifacts crypto-shreds the order's ECDH keypair, others untouched", () => {
        getOrCreateOrderEcdhKeypair(ADDR, "order-1");
        getOrCreateOrderEcdhKeypair(ADDR, "order-2");
        expect(getOrderEcdhKeypair(ADDR, "order-1")).not.toBeNull();

        DEFAULT_HANDOFF_PERSISTENCE_SERVICE.purgeHandoffArtifacts(ADDR, "process-1", "order-1");

        expect(getOrderEcdhKeypair(ADDR, "order-1")).toBeNull();
        expect(getOrderEcdhKeypair(ADDR, "order-2")).not.toBeNull();
    });

    it("schedulePurge with no grace purges immediately and queues nothing", () => {
        getOrCreateOrderEcdhKeypair(ADDR, "order-now");

        DEFAULT_HANDOFF_PERSISTENCE_SERVICE.schedulePurge(ADDR, "process-1", "order-now", 0);

        expect(getOrderEcdhKeypair(ADDR, "order-now")).toBeNull();
        expect(window.localStorage.getItem(HANDOFF_PURGE_QUEUE_KEY)).toBeNull();
    });

    it("schedulePurge with a grace period defers: queued once, key intact until due", () => {
        getOrCreateOrderEcdhKeypair(ADDR, "order-queued");

        DEFAULT_HANDOFF_PERSISTENCE_SERVICE.schedulePurge(ADDR, "process-2", "order-queued", 60_000);
        // Re-scheduling the same order does not duplicate the entry.
        DEFAULT_HANDOFF_PERSISTENCE_SERVICE.schedulePurge(ADDR, "process-2", "order-queued", 60_000);

        expect(getOrderEcdhKeypair(ADDR, "order-queued")).not.toBeNull();
        const queue = JSON.parse(window.localStorage.getItem(HANDOFF_PURGE_QUEUE_KEY) ?? "[]") as unknown[];
        expect(queue).toHaveLength(1);
    });

    it("sweepDuePurges executes due entries and keeps the rest queued", () => {
        getOrCreateOrderEcdhKeypair(ADDR, "order-due");
        getOrCreateOrderEcdhKeypair(ADDR, "order-later");
        DEFAULT_HANDOFF_PERSISTENCE_SERVICE.schedulePurge(ADDR, "process-3", "order-due", 1);
        DEFAULT_HANDOFF_PERSISTENCE_SERVICE.schedulePurge(ADDR, "process-3", "order-later", 10_000_000);

        DEFAULT_HANDOFF_PERSISTENCE_SERVICE.sweepDuePurges(ADDR, Date.now() + 1_000);

        expect(getOrderEcdhKeypair(ADDR, "order-due")).toBeNull();
        expect(getOrderEcdhKeypair(ADDR, "order-later")).not.toBeNull();
        const queue = JSON.parse(window.localStorage.getItem(HANDOFF_PURGE_QUEUE_KEY) ?? "[]") as Array<{ orderId: string }>;
        expect(queue.map((e) => e.orderId)).toEqual(["order-later"]);
    });

    it("the purge queue carries only pseudonymous refs + timestamps — never key material", () => {
        getOrCreateOrderEcdhKeypair(ADDR, "order-audit");
        DEFAULT_HANDOFF_PERSISTENCE_SERVICE.schedulePurge(ADDR, "process-4", "order-audit", 60_000);

        const raw = window.localStorage.getItem(HANDOFF_PURGE_QUEUE_KEY) ?? "";
        const kp = getOrderEcdhKeypair(ADDR, "order-audit");
        expect(kp).not.toBeNull();
        expect(raw).not.toContain(kp!.privateKeyHex);
        expect(raw).not.toContain(kp!.publicKeyHex);
        expect(JSON.parse(raw)[0]).toEqual({
            processId: "process-4",
            orderId: "order-audit",
            purgeAfter: expect.any(Number),
        });
    });
});
