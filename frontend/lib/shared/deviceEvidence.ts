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
 * TWO artifacts per capture — the public/confidential boundary rule
 * (`docs/ARCHITECTURE.md` § "The other boundary") applied to evidence:
 *   - The RAW capture (`DeviceEvidence`) is the device's full-fidelity truth
 *     — coordinates, tag serials, device names. It NEVER leaves the device:
 *     retained in localStorage for dispute-time revelation, purgeable.
 *   - The PUBLIC artifact (`PublicDeviceEvidence`) is what gets pinned and
 *     becomes the evidence URI: the mechanism grain only (the geohash CELL,
 *     keccak-hashed identifiers) plus `rawCaptureHash` — keccak256 of the
 *     raw JSON — so a party can later reveal the raw capture verifiably.
 * Sufficiency of witnessing stays derived at read time against the
 * committed bands (the clause's own rule), never enforced here.
 */

import { keccak256, toHex } from "viem";
import { getDeviceLocation } from "@/lib/shared/deviceLocation";
import { encodeGeohash } from "@figaro-protocol/sdk/derive";
import { PUBLIC_GEOHASH_MAX_PRECISION } from "@/lib/shared/geohash";

export type DeviceEvidenceKind = "geolocation-cross-check" | "nfc-tap" | "ble-sighting";

/** The RAW capture — the device's full-fidelity truth. Device-held only;
 *  never pinned, never committed. */
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

/** The PUBLIC artifact — pinned, so committed at mechanism grain only:
 *  the neighborhood cell, hashed identifiers, and the raw capture's hash. */
export interface PublicDeviceEvidence {
    kind: DeviceEvidenceKind;
    capturedAt: string;
    /** Geolocation cross-check: the CELL (≤6 chars), never coordinates. */
    geohash?: string;
    accuracyM?: number;
    /** NFC tap: keccak256 of the tag serial — counterparty-consistency
     *  checkable by re-hashing, never linkable. */
    tagSerialHash?: string;
    /** Record TYPES only (e.g. "text", "url") — contents stay raw-side. */
    recordTypes?: string[];
    /** BLE sighting: keccak256 of the chooser's device id. */
    deviceIdHash?: string;
    /** keccak256 of the raw capture JSON, retained device-side — the
     *  dispute-time revelation binds to this. */
    rawCaptureHash: string;
}

/** Derive the pinnable public artifact from a raw capture. */
export function toPublicEvidence(raw: DeviceEvidence): PublicDeviceEvidence {
    const rawCaptureHash = keccak256(toHex(JSON.stringify(raw)));
    return {
        kind: raw.kind,
        capturedAt: raw.capturedAt,
        ...(raw.geohash ? { geohash: raw.geohash } : {}),
        ...(raw.accuracyM !== undefined ? { accuracyM: raw.accuracyM } : {}),
        ...(raw.tagSerialNumber ? { tagSerialHash: keccak256(toHex(raw.tagSerialNumber)) } : {}),
        ...(raw.tagRecords ? { recordTypes: raw.tagRecords.map((r) => r.recordType) } : {}),
        ...(raw.deviceId ? { deviceIdHash: keccak256(toHex(raw.deviceId)) } : {}),
        rawCaptureHash,
    };
}

// ── Raw-capture retention — the device-held half of the layered pattern ──
// localStorage (NOT sessionStorage): evidence must outlive the tab and
// survive until a dispute would need it; only the party purges it.

const RAW_CAPTURE_STORE_KEY = "figaro-evidence-raw-captures";

/** A retained raw capture, keyed by the pinned public artifact's URI. */
export interface RetainedRawCapture {
    uri: string;
    cid: string;
    rawCaptureHash: string;
    raw: DeviceEvidence;
}

function readRetained(): RetainedRawCapture[] {
    if (typeof window === "undefined") return [];
    try {
        const parsed = JSON.parse(window.localStorage.getItem(RAW_CAPTURE_STORE_KEY) ?? "[]");
        return Array.isArray(parsed) ? (parsed as RetainedRawCapture[]) : [];
    } catch {
        return [];
    }
}

function writeRetained(entries: RetainedRawCapture[]): void {
    if (typeof window === "undefined") return;
    try {
        window.localStorage.setItem(RAW_CAPTURE_STORE_KEY, JSON.stringify(entries));
    } catch {
        // Storage can fail in restricted contexts; the capture still works —
        // the party just holds no revealable raw.
    }
}

/** Retain a raw capture against its pinned public artifact. */
export function retainRawCapture(entry: RetainedRawCapture): void {
    writeRetained([...readRetained().filter((e) => e.uri !== entry.uri), entry]);
}

/** The retained raw capture behind a pinned URI, if this device made it. */
export function findRetainedRawCapture(uri: string): RetainedRawCapture | null {
    return readRetained().find((e) => e.uri === uri) ?? null;
}

/** Forget a retained raw capture (the purge path's local half — the caller
 *  unpins the public artifact via the IPFS service). */
export function forgetRetainedRawCapture(uri: string): void {
    writeRetained(readRetained().filter((e) => e.uri !== uri));
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
