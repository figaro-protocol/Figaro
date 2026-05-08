import { describe, it, expect, beforeEach, vi } from "vitest";
import {
    SettlementRouter,
    resetSettlementRouter,
    getSettlementRouter,
} from "@/lib/core/settlementRouter";
import { ZERO_BYTES32 } from "@/lib/shared/evm";
import type { Commitment } from "@figaro/core";

// ── Fixtures ────────────────────────────────────────────────────────────────

const DUMMY_SIG = ("0x" + "ab".repeat(32) + "cd".repeat(32) + "1b") as `0x${string}`;

const testCommitment: Commitment = {
    processId: ZERO_BYTES32,
    buyer: "0x0000000000000000000000000000000000000001",
    seller: "0x0000000000000000000000000000000000000002",
    currency: "0x0000000000000000000000000000000000000003",
    payment: 100n,
    expectedCumulativeValue: 100n,
    agreementHash: ZERO_BYTES32,
    salt: 42n,
    deadline: 9999n,
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe("SettlementRouter", () => {
    beforeEach(() => {
        resetSettlementRouter();
    });

    it("resolveMode returns 'direct' when no sequencer URL is configured", async () => {
        const router = new SettlementRouter();
        expect(await router.resolveMode()).toBe("direct");
    });

    it("resolveMode returns 'direct' when preferDirect is true", async () => {
        const router = new SettlementRouter({
            sequencerUrl: "http://localhost:3001",
            preferDirect: true,
        });
        expect(await router.resolveMode()).toBe("direct");
    });

    it("resolveMode returns 'direct' when sequencer is unreachable", async () => {
        // No actual sequencer running — isAvailable will fail
        const router = new SettlementRouter({
            sequencerUrl: "http://127.0.0.1:19999",
        });
        expect(await router.resolveMode()).toBe("direct");
    });

    it("routeCommit returns direct mode when no sequencer configured", async () => {
        const router = new SettlementRouter();
        const result = await router.routeCommit(testCommitment, DUMMY_SIG, DUMMY_SIG);
        expect(result.mode).toBe("direct");
        expect(result.operationId).toBeUndefined();
    });

    it("routeCommit falls back to direct and fires callback on sequencer error", async () => {
        const onFallback = vi.fn();
        const router = new SettlementRouter({
            sequencerUrl: "http://127.0.0.1:19999",
            onFallback,
        });

        const result = await router.routeCommit(testCommitment, DUMMY_SIG, DUMMY_SIG);
        expect(result.mode).toBe("direct");
        expect(onFallback).toHaveBeenCalledTimes(1);
        expect(onFallback.mock.calls[0][0]).toContain("falling back to direct");
    });

    it("routeResolve returns direct mode when preferDirect is true", async () => {
        const router = new SettlementRouter({
            sequencerUrl: "http://localhost:3001",
            preferDirect: true,
        });
        const result = await router.routeResolve(ZERO_BYTES32, [testCommitment], DUMMY_SIG);
        expect(result.mode).toBe("direct");
    });

    it("getSequencerClient returns null when no URL configured", () => {
        const router = new SettlementRouter();
        expect(router.getSequencerClient()).toBeNull();
    });

    it("getSequencerClient returns a client when URL is configured", () => {
        const router = new SettlementRouter({ sequencerUrl: "http://localhost:3001" });
        expect(router.getSequencerClient()).not.toBeNull();
    });

    it("getSettlementRouter returns a singleton", () => {
        const r1 = getSettlementRouter({ sequencerUrl: "http://localhost:3001" });
        const r2 = getSettlementRouter();
        expect(r1).toBe(r2);
    });

    it("resetSettlementRouter clears the singleton", () => {
        const r1 = getSettlementRouter({ sequencerUrl: "http://localhost:3001" });
        resetSettlementRouter();
        const r2 = getSettlementRouter({ sequencerUrl: "http://localhost:3002" });
        expect(r1).not.toBe(r2);
    });
});
