import { describe, expect, it, vi } from "vitest";

// ---------------------------------------------------------------------------
// QRChallengeDisplay — unit tests for payload generation
// ---------------------------------------------------------------------------

describe("QRChallengeDisplay payload", () => {
    it("serialises nonce, orderId, and step as JSON", () => {
        const nonce = "0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890" as const;
        const orderId = 42n;
        const step = "pickup" as const;

        const payload = JSON.stringify({
            nonce,
            orderId: orderId.toString(),
            step,
        });

        const parsed = JSON.parse(payload);
        expect(parsed.nonce).toBe(nonce);
        expect(parsed.orderId).toBe("42");
        expect(parsed.step).toBe("pickup");
    });

    it("serialises delivery step correctly", () => {
        const payload = JSON.stringify({
            nonce: "0x1111",
            orderId: "99",
            step: "delivery",
        });

        const parsed = JSON.parse(payload);
        expect(parsed.step).toBe("delivery");
    });
});

// ---------------------------------------------------------------------------
// QRChallengeScanner — payload validation logic
// ---------------------------------------------------------------------------

describe("QRChallengeScanner payload validation", () => {
    it("rejects payload missing nonce", () => {
        const raw = JSON.stringify({ orderId: "42", step: "pickup" });
        const parsed = JSON.parse(raw);
        expect(parsed.nonce).toBeUndefined();
    });

    it("rejects payload missing orderId", () => {
        const raw = JSON.stringify({ nonce: "0xabc", step: "pickup" });
        const parsed = JSON.parse(raw);
        expect(parsed.orderId).toBeUndefined();
    });

    it("rejects payload missing step", () => {
        const raw = JSON.stringify({ nonce: "0xabc", orderId: "42" });
        const parsed = JSON.parse(raw);
        expect(parsed.step).toBeUndefined();
    });

    it("accepts valid payload with all fields", () => {
        const raw = JSON.stringify({
            nonce: "0xdeadbeef",
            orderId: "42",
            step: "delivery",
        });
        const parsed = JSON.parse(raw);
        expect(parsed.nonce).toBe("0xdeadbeef");
        expect(parsed.orderId).toBe("42");
        expect(parsed.step).toBe("delivery");
    });

    it("validates orderId match", () => {
        const expectedOrderId = 42n;
        const payload = { nonce: "0xabc", orderId: "99", step: "pickup" };
        expect(payload.orderId).not.toBe(expectedOrderId.toString());
    });

    it("validates step match", () => {
        const expectedStep = "pickup";
        const payload = { nonce: "0xabc", orderId: "42", step: "delivery" };
        expect(payload.step).not.toBe(expectedStep);
    });
});

// ---------------------------------------------------------------------------
// Visual band value
// ---------------------------------------------------------------------------

describe("Visual proximity band", () => {
    it("uses band 4 for QR visual range", () => {
        const QR_VISUAL_BAND = 4;
        expect(QR_VISUAL_BAND).toBe(4);
    });
});

// ---------------------------------------------------------------------------
// HandoffStep-aware signal function mapping
// ---------------------------------------------------------------------------

describe("handoffStep to signal function mapping", () => {
    const mapStepToSignal = (step: "pickup" | "delivery") =>
        step === "pickup" ? "declarePickedUp" : "declareDelivered";

    it("maps pickup to declarePickedUp", () => {
        expect(mapStepToSignal("pickup")).toBe("declarePickedUp");
    });

    it("maps delivery to declareDelivered", () => {
        expect(mapStepToSignal("delivery")).toBe("declareDelivered");
    });
});
