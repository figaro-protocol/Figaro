"use client";

/**
 * deviceEvidence — browser-side device-layer evidence capture for hand-off
 * witnessing (the proximity clause's stage-1 `evidenceUri`, and any other
 * field that declares `format: "evidence-capture"`).
 *
 * SCOPE (the recorded 2026-07-20 ruling — browser AND mobile, one surface):
 * browsers expose NO Wi-Fi BSSID and no UWB; Web Bluetooth is Chromium-only
 * and Web NFC is Android-Chrome-only. Browser v1 is therefore exactly what
 * exists, detected at runtime per device:
 *   - geolocation cross-check — universal (desktop + mobile): position +
 *     accuracy at the moment of witnessing, cross-checkable against the
 *     order's committed geohash endpoints at read time.
 *   - NFC tap read — Android Chrome (mobile): the tag's serial + decoded
 *     records, the `contact-nfc` band's artifact.
 *   - BLE sighting — Chromium (desktop + Android): the chosen device's
 *     name/id from the browser chooser, the `nearby-ble` band's artifact.
 * Richer ranging (UWB, BSSID, continuous BLE RSSI) arrives via the
 * agent/operator seam (a device daemon feeding the SDK), never the page.
 *
 * The captured artifact is a small JSON document; the caller pins it and the
 * resulting URI is the evidence value. Capture DESCRIBES what the device saw
 * — sufficiency of witnessing stays derived at read time against the
 * committed bands (the clause's own rule), never enforced here.
 */

import { getDeviceLocation } from "@/lib/shared/deviceLocation";
import { encodeGeohash } from "@figaro/sdk/derive";
import { PUBLIC_GEOHASH_MAX_PRECISION } from "@/lib/shared/geohash";

export type DeviceEvidenceKind = "geolocation-cross-check" | "nfc-tap" | "ble-sighting";

/** The pinned artifact's shape — kind + capture time + what the device saw. */
export interface DeviceEvidence {
    kind: DeviceEvidenceKind;
    capturedAt: string;
    /** Geolocation cross-check. */
    lat?: number;
    lon?: number;
    accuracyM?: number;
    geohash?: string;
    /** NFC tap. */
    tagSerialNumber?: string;
    tagRecords?: Array<{ recordType: string; text?: string }>;
    /** BLE sighting. */
    deviceName?: string;
    deviceId?: string;
}

/** The capture kinds THIS device supports right now — detected, never
 *  assumed. Geolocation is near-universal; NFC and BLE are progressive
 *  enhancement (mobile Android Chrome / Chromium respectively). */
export function availableCaptures(): DeviceEvidenceKind[] {
    if (typeof window === "undefined") return [];
    const kinds: DeviceEvidenceKind[] = [];
    if (typeof navigator !== "undefined" && navigator.geolocation) kinds.push("geolocation-cross-check");
    if ("NDEFReader" in window) kinds.push("nfc-tap");
    if (typeof navigator !== "undefined" && "bluetooth" in navigator) kinds.push("ble-sighting");
    return kinds;
}

/** Position + accuracy at the moment of witnessing. Throws on denial/failure
 *  — the caller surfaces it; there is no silent empty evidence. */
async function captureGeolocationCrossCheck(): Promise<DeviceEvidence> {
    const location = await getDeviceLocation();
    if (!location) throw new Error("Device location unavailable — allow location access to capture the cross-check.");
    return {
        kind: "geolocation-cross-check",
        capturedAt: new Date().toISOString(),
        lat: location.lat,
        lon: location.lon,
        accuracyM: location.accuracyM,
        geohash: encodeGeohash(location.lat, location.lon, PUBLIC_GEOHASH_MAX_PRECISION),
    };
}

/** One NFC tap: scan until the first reading (bounded), record serial +
 *  decoded text records. Android Chrome only — callers gate on
 *  `availableCaptures()`. */
async function captureNfcTap(timeoutMs = 20_000): Promise<DeviceEvidence> {
    type NdefRecordLike = { recordType: string; data?: DataView; encoding?: string };
    type NdefReadingEvent = { serialNumber?: string; message: { records: NdefRecordLike[] } };
    type NdefReaderLike = {
        scan(opts?: { signal?: AbortSignal }): Promise<void>;
        addEventListener(type: "reading", cb: (e: NdefReadingEvent) => void): void;
    };
    const Reader = (window as unknown as { NDEFReader?: new () => NdefReaderLike }).NDEFReader;
    if (!Reader) throw new Error("Web NFC is not available on this device.");
    const reader = new Reader();
    const abort = new AbortController();
    try {
        return await new Promise<DeviceEvidence>((resolve, reject) => {
            const timer = setTimeout(() => reject(new Error("No NFC tag read within the capture window.")), timeoutMs);
            reader.addEventListener("reading", (e) => {
                clearTimeout(timer);
                const records = e.message.records.map((r) => ({
                    recordType: r.recordType,
                    ...(r.data && (r.recordType === "text" || r.recordType === "url")
                        ? { text: new TextDecoder(r.encoding ?? "utf-8").decode(r.data) }
                        : {}),
                }));
                resolve({
                    kind: "nfc-tap",
                    capturedAt: new Date().toISOString(),
                    tagSerialNumber: e.serialNumber,
                    tagRecords: records,
                });
            });
            reader.scan({ signal: abort.signal }).catch((err: unknown) => {
                clearTimeout(timer);
                reject(err instanceof Error ? err : new Error("NFC scan failed."));
            });
        });
    } finally {
        abort.abort();
    }
}

/** One BLE sighting: the browser chooser IS the detection (a user gesture is
 *  required by the API) — the chosen device's advertised name/id is the
 *  artifact. Chromium only — callers gate on `availableCaptures()`. */
async function captureBleSighting(): Promise<DeviceEvidence> {
    type BleDeviceLike = { id?: string; name?: string };
    type BluetoothLike = { requestDevice(opts: { acceptAllDevices: boolean }): Promise<BleDeviceLike> };
    const bluetooth = (navigator as unknown as { bluetooth?: BluetoothLike }).bluetooth;
    if (!bluetooth) throw new Error("Web Bluetooth is not available on this device.");
    const device = await bluetooth.requestDevice({ acceptAllDevices: true });
    return {
        kind: "ble-sighting",
        capturedAt: new Date().toISOString(),
        deviceName: device.name,
        deviceId: device.id,
    };
}

export const CAPTURE_LABELS: Record<DeviceEvidenceKind, string> = {
    "geolocation-cross-check": "Capture location",
    "nfc-tap": "Read NFC tag",
    "ble-sighting": "Sight BLE device",
};

export function captureEvidence(kind: DeviceEvidenceKind): Promise<DeviceEvidence> {
    switch (kind) {
        case "geolocation-cross-check": return captureGeolocationCrossCheck();
        case "nfc-tap": return captureNfcTap();
        case "ble-sighting": return captureBleSighting();
    }
}
