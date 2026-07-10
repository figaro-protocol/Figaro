import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
    requestSignConfirmation,
    confirmPendingSign,
    cancelPendingSign,
    subscribeToPendingSign,
    _resetSignPreviewStore_TESTING_ONLY,
    _setSignPreviewMode_TESTING_ONLY,
} from "@/lib/checkout/orderPreview";
import type { Commitment, Agreement } from "@figaro/sdk";

const COMMITMENT: Commitment = {
    processId: "0x" + "00".repeat(32) as `0x${string}`,
    buyer: "0x70997970C51812dc3A010C7d01b50e0d17dc79C8" as `0x${string}`,
    seller: "0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC" as `0x${string}`,
    currency: "0x" + "ab".repeat(20) as `0x${string}`,
    payment: 1000000000000000000n,
    expectedCumulativeValue: 1000000000000000000n,
    agreementHash: "0x" + "cd".repeat(32) as `0x${string}`,
    salt: 1n,
    deadline: 9999999999n,
};

const AGREEMENT: Agreement = {
    version: "a1",
    buyer: COMMITMENT.buyer,
    seller: COMMITMENT.seller,
    sections: [
        { clause: "figaro-commerce", version: 1, data: { currency: COMMITMENT.currency, payment: "1000000000000000000", lineItems: [] } },
    ],
};

beforeEach(() => {
    // The global tests/setup.ts enables auto-approve so other tests don't
    // deadlock on the modal gate. These tests exercise the modal flow
    // directly, so disable auto-mode and run the real promise.
    _setSignPreviewMode_TESTING_ONLY(null);
});

afterEach(() => {
    _resetSignPreviewStore_TESTING_ONLY();
});

describe("orderPreview confirm gate", () => {
    it("requestSignConfirmation resolves true when confirmPendingSign is called", async () => {
        const promise = requestSignConfirmation(COMMITMENT, AGREEMENT);
        confirmPendingSign();
        await expect(promise).resolves.toBe(true);
    });

    it("requestSignConfirmation resolves false when cancelPendingSign is called", async () => {
        const promise = requestSignConfirmation(COMMITMENT, AGREEMENT);
        cancelPendingSign();
        await expect(promise).resolves.toBe(false);
    });

    it("subscribeToPendingSign fires immediately with current state, then on changes", async () => {
        const subscriber = vi.fn();
        const unsubscribe = subscribeToPendingSign(subscriber);
        // Initial: no pending preview
        expect(subscriber).toHaveBeenCalledWith(null);

        const promise = requestSignConfirmation(COMMITMENT, AGREEMENT);
        // Subscriber receives the pending preview
        expect(subscriber).toHaveBeenCalledTimes(2);
        expect(subscriber.mock.calls[1][0]).toMatchObject({
            commitment: COMMITMENT,
            agreement: AGREEMENT,
        });

        confirmPendingSign();
        await promise;
        // Subscriber receives null again after resolution
        expect(subscriber).toHaveBeenCalledTimes(3);
        expect(subscriber.mock.calls[2][0]).toBeNull();

        unsubscribe();
    });

    it("rejects concurrent requests with false (no queueing)", async () => {
        const first = requestSignConfirmation(COMMITMENT, AGREEMENT);
        const second = await requestSignConfirmation(COMMITMENT, AGREEMENT);
        expect(second).toBe(false);

        // First is still pending until resolved
        confirmPendingSign();
        await expect(first).resolves.toBe(true);
    });

    it("handles a null agreement (when not recoverable from store)", async () => {
        const subscriber = vi.fn();
        subscribeToPendingSign(subscriber);
        subscriber.mockClear();

        const promise = requestSignConfirmation(COMMITMENT, null);
        expect(subscriber).toHaveBeenCalledWith(
            expect.objectContaining({ commitment: COMMITMENT, agreement: null }),
        );
        cancelPendingSign();
        await expect(promise).resolves.toBe(false);
    });

    it("unsubscribe stops further notifications", async () => {
        const subscriber = vi.fn();
        const unsubscribe = subscribeToPendingSign(subscriber);
        subscriber.mockClear();
        unsubscribe();

        const promise = requestSignConfirmation(COMMITMENT, AGREEMENT);
        confirmPendingSign();
        await promise;

        expect(subscriber).not.toHaveBeenCalled();
    });
});
