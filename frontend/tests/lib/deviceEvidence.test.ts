/**
 * deviceEvidence — the public artifact a device capture pins.
 *
 * Proves: each identifier the public artifact carries (a tag's serial, a
 * Bluetooth device id) is a fingerprint over the capture's own blinding
 * value. The same serial captured for two orders gives two fingerprints, so
 * an outsider links no two orders by it. The holder of the raw capture, the
 * blinding value inside it, recomputes each fingerprint and the raw
 * capture's hash, as a forum does when the holder discloses it. An outsider
 * who holds the serial and the public artifact matches neither.
 */
import { describe, expect, it, vi } from "vitest";
import { keccak256, toHex, type Hex } from "viem";
import { canonicalContentHash } from "@figaro-protocol/sdk";

vi.mock("@/lib/shared/deviceLocation", () => ({
    getDeviceLocation: async () => ({ lat: 52.3702, lon: 4.8952, accuracyM: 12 }),
}));

import {
    blindedIdentifierFingerprint,
    captureEvidence,
    toPublicEvidence,
    type DeviceEvidence,
} from "@/lib/shared/deviceEvidence";

const SERIAL = "04:a2:2b:1a:6f:5d:80";
const DEVICE_ID = "Xq3vK0mB2c1yLx9w+Q==";
const CAPTURED_AT = "2025-01-01T10:00:00.000Z";

/** One tag read, as a capture for one order holds it. */
function nfcCapture(blinding: Hex): DeviceEvidence {
    return {
        kind: "nfc-tap",
        capturedAt: CAPTURED_AT,
        tagSerialNumber: SERIAL,
        tagRecords: [{ recordType: "text", text: "locker 12" }],
        blinding,
    };
}

/** The blinding value each order's capture drew (`captureEvidence` draws
 *  one through `freshBlindingHex`; fixed here so the test is repeatable). */
const VALUE_FOR_ORDER_ONE =`0x${"a1".repeat(32)}` as Hex;
const VALUE_FOR_ORDER_TWO = `0x${"b2".repeat(32)}` as Hex;

describe("the public artifact of a device capture", () => {
    it("one serial captured for two orders gives two different public fingerprints", () => {
        const one = toPublicEvidence(nfcCapture(VALUE_FOR_ORDER_ONE));
        const two = toPublicEvidence(nfcCapture(VALUE_FOR_ORDER_TWO));
        expect(one.tagSerialHash).toMatch(/^0x[0-9a-f]{64}$/);
        expect(one.tagSerialHash).not.toBe(two.tagSerialHash);
        expect(one.rawCaptureHash).not.toBe(two.rawCaptureHash);
    });

    it("the holder of the raw capture recomputes each fingerprint from it, blinding value included", () => {
        for (const raw of [nfcCapture(VALUE_FOR_ORDER_ONE), nfcCapture(VALUE_FOR_ORDER_TWO)]) {
            const pinned = toPublicEvidence(raw);
            expect(blindedIdentifierFingerprint(raw.blinding, raw.tagSerialNumber!)).toBe(pinned.tagSerialHash);
            expect(canonicalContentHash(raw)).toBe(pinned.rawCaptureHash);
        }
    });

    it("an outsider with the serial and the pinned artifact matches neither fingerprint", () => {
        const pinned = toPublicEvidence(nfcCapture(VALUE_FOR_ORDER_ONE));
        const guess = keccak256(toHex(SERIAL));
        expect(pinned.tagSerialHash).not.toBe(guess);
        // Rebuilding the raw capture from the public fields and the guessed
        // serial, without the blinding value, misses the raw capture's hash.
        const { blinding: _withheld, ...unblinded } = nfcCapture(VALUE_FOR_ORDER_ONE);
        expect(canonicalContentHash(unblinded)).not.toBe(pinned.rawCaptureHash);
        // The pinned artifact carries neither the serial nor the value.
        const published = JSON.stringify(pinned);
        expect(published).not.toContain(SERIAL);
        expect(published).not.toContain(VALUE_FOR_ORDER_ONE.slice(2));
    });

    // A revelation is checked against the pinned hash. Two captures equal as
    // data hash alike whatever order their keys were written in, since the
    // hash is over the canonical form; a changed value hashes otherwise.
    it("the raw capture's hash is canonical: key order does not change it, a value does", () => {
        const raw = nfcCapture(VALUE_FOR_ORDER_ONE);
        const reordered: DeviceEvidence = {
            blinding: raw.blinding,
            tagRecords: [{ text: "locker 12", recordType: "text" }],
            tagSerialNumber: raw.tagSerialNumber,
            capturedAt: raw.capturedAt,
            kind: raw.kind,
        };
        expect(JSON.stringify(reordered)).not.toBe(JSON.stringify(raw));
        expect(toPublicEvidence(reordered).rawCaptureHash).toBe(toPublicEvidence(raw).rawCaptureHash);
        const changed: DeviceEvidence = { ...raw, tagRecords: [{ recordType: "text", text: "locker 13" }] };
        expect(toPublicEvidence(changed).rawCaptureHash).not.toBe(toPublicEvidence(raw).rawCaptureHash);
    });

    it("a Bluetooth device id is held to the same rule", () => {
        const sighting = (blinding: Hex): DeviceEvidence => ({ kind: "ble-sighting", capturedAt: CAPTURED_AT, deviceName: "lock", deviceId: DEVICE_ID, blinding });
        const one = toPublicEvidence(sighting(VALUE_FOR_ORDER_ONE));
        const two = toPublicEvidence(sighting(VALUE_FOR_ORDER_TWO));
        expect(one.deviceIdHash).not.toBe(two.deviceIdHash);
        expect(one.deviceIdHash).toBe(blindedIdentifierFingerprint(VALUE_FOR_ORDER_ONE, DEVICE_ID));
        expect(one.deviceIdHash).not.toBe(keccak256(toHex(DEVICE_ID)));
    });

    it("each capture draws its own blinding value", async () => {
        const first = await captureEvidence("geolocation-cross-check");
        const second = await captureEvidence("geolocation-cross-check");
        expect(first.blinding).toMatch(/^0x[0-9a-f]{64}$/);
        expect(first.blinding).not.toBe(second.blinding);
        expect(toPublicEvidence(first).rawCaptureHash).not.toBe(toPublicEvidence(second).rawCaptureHash);
    });

    it("refuses a capture whose blinding value is missing or zero", () => {
        expect(() => toPublicEvidence(nfcCapture(`0x${"00".repeat(32)}`))).toThrow(/blinding/);
        expect(() => toPublicEvidence({ ...nfcCapture(VALUE_FOR_ORDER_ONE), blinding: undefined as unknown as Hex })).toThrow(/blinding/);
    });
});
