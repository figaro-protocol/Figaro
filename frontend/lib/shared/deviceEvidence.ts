"use client";

/**
 * deviceEvidence — browser-side device-layer evidence capture for hand-off
 * witnessing (the proximity clause's stage-1 `evidenceUri`, and any other
 * field that declares `format: "evidence-capture"`).
 *
 * SCOPE (browser AND mobile, one surface):
 * browsers expose NO Wi-Fi BSSID and no UWB; Web Bluetooth is Chromium-only
 * and Web NFC is Android-Chrome-only. Browser v1 is therefore exactly what
 * exists, detected at runtime per device:
 *   - geolocation cross-check — universal (desktop + mobile): position +
 *     accuracy at the moment of witnessing, cross-checkable against the
 *     order's committed geohash endpoints at read time.
 *   - NFC tap read — Android Chrome (mobile): the tag's serial + its
 *     decoded NDEF records, the `contact-nfc` band's artifact.
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
 *     blinded fingerprints of the identifiers) plus `rawCaptureHash` —
 *     keccak256 of the raw JSON — so a party can later reveal the raw
 *     capture verifiably.
 * Each capture draws its own blinding value (`freshBlindingHex`, the SDK's
 * one entropy source, as a private clause set draws one). It stays in the
 * raw capture, so it enters `rawCaptureHash` and each identifier's
 * fingerprint (`blindedIdentifierFingerprint`). One tag or device seen in
 * two orders then gives two unrelated fingerprints: an outsider links no
 * two orders by them, and cannot confirm a guessed serial or id by hashing
 * candidates. The holder discloses the raw capture, blinding value
 * included, to a forum, which recomputes every fingerprint from it.
 * What stays public and linkable by design: the kind, the capture time,
 * the neighborhood cell and its accuracy, and the NDEF record types.
 * Sufficiency of witnessing stays derived at read time against the
 * committed bands (the clause's own rule), never enforced here.
 */

import { concat, keccak256, toHex, type Hex } from "viem";
import { freshBlindingHex } from "@figaro-protocol/sdk";
import { getDeviceLocation } from "@/lib/shared/deviceLocation";
import { hexEqual, isBytes32Hex, ZERO_BYTES32 } from "@/lib/shared/evm";
import { encodeGeohash } from "@figaro-protocol/sdk/derive";
import { PUBLIC_GEOHASH_MAX_PRECISION } from "@figaro-protocol/sdk/clauses";
import { readJsonStorage, writeJsonStorage } from "@/lib/shared/storage";

export type DeviceEvidenceKind = "geolocation-cross-check" | "nfc-tap" | "ble-sighting";

/** What one device read returns, before its capture draws a blinding value. */
interface DeviceRead {
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

/** The RAW capture — the device's full-fidelity truth: one device read and
 *  the blinding value drawn for it. Device-held only; never pinned, never
 *  committed. */
export interface DeviceEvidence extends DeviceRead {
    /** 32 random bytes drawn for this capture alone; device-held with the
     *  rest of the raw capture and disclosed with it. */
    blinding: Hex;
}

/** The PUBLIC artifact — pinned, so committed at mechanism grain only:
 *  the neighborhood cell, blinded identifier fingerprints, and the raw
 *  capture's hash. */
export interface PublicDeviceEvidence {
    kind: DeviceEvidenceKind;
    capturedAt: string;
    /** Geolocation cross-check: the CELL (≤6 chars), never coordinates. */
    geohash?: string;
    accuracyM?: number;
    /** NFC tap: the tag serial's blinded fingerprint
     *  (`blindedIdentifierFingerprint`). Only a holder of the capture's
     *  blinding value recomputes it; no two captures share it. */
    tagSerialHash?: string;
    /** NDEF record TYPES only (e.g. "text", "url") — contents stay raw-side. */
    recordTypes?: string[];
    /** BLE sighting: the chooser's device id's blinded fingerprint, held to
     *  the same rule as `tagSerialHash`. */
    deviceIdHash?: string;
    /** keccak256 of the raw capture JSON, retained device-side — the
     *  dispute-time revelation binds to this. */
    rawCaptureHash: string;
}

/** The public fingerprint of one device identifier: keccak256 over the
 *  capture's 32-byte blinding value followed by the identifier's UTF-8
 *  bytes. The value has a fixed length, so the two parts never run into
 *  each other.
 *  @public Waits for the reader that checks a disclosed raw capture against
 *  its pinned artifact; `toPublicEvidence` is its one caller in the app. */
export function blindedIdentifierFingerprint(blinding: Hex, identifier: string): Hex {
    return keccak256(concat([blinding, toHex(identifier)]));
}

/** Derive the pinnable public artifact from a raw capture. Refuses a
 *  capture without a usable blinding value, since its identifiers would
 *  then be published as fingerprints anyone could recompute. */
export function toPublicEvidence(raw: DeviceEvidence): PublicDeviceEvidence {
    if (!isBytes32Hex(raw.blinding) || hexEqual(raw.blinding, ZERO_BYTES32)) {
        throw new Error("A device capture carries a fresh 32-byte blinding value before its public artifact is derived.");
    }
    const rawCaptureHash = keccak256(toHex(JSON.stringify(raw)));
    return {
        kind: raw.kind,
        capturedAt: raw.capturedAt,
        ...(raw.geohash ? { geohash: raw.geohash } : {}),
        ...(raw.accuracyM !== undefined ? { accuracyM: raw.accuracyM } : {}),
        ...(raw.tagSerialNumber ? { tagSerialHash: blindedIdentifierFingerprint(raw.blinding, raw.tagSerialNumber) } : {}),
        ...(raw.tagRecords ? { recordTypes: raw.tagRecords.map((r) => r.recordType) } : {}),
        ...(raw.deviceId ? { deviceIdHash: blindedIdentifierFingerprint(raw.blinding, raw.deviceId) } : {}),
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
    const parsed = readJsonStorage<unknown>(RAW_CAPTURE_STORE_KEY, []);
    return Array.isArray(parsed) ? (parsed as RetainedRawCapture[]) : [];
}

function writeRetained(entries: RetainedRawCapture[]): void {
    // Storage can fail in restricted contexts; the capture still works —
    // the party just holds no revealable raw.
    writeJsonStorage(RAW_CAPTURE_STORE_KEY, entries);
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
async function captureGeolocationCrossCheck(): Promise<DeviceRead> {
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

/** One NFC tap: scan until the first reading (bounded), capture serial +
 *  decoded text NDEF records. Android Chrome only — callers gate on
 *  `availableCaptures()`. */
async function captureNfcTap(timeoutMs = 20_000): Promise<DeviceRead> {
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
        return await new Promise<DeviceRead>((resolve, reject) => {
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
async function captureBleSighting(): Promise<DeviceRead> {
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

/** One capture of the kind asked for, with its own blinding value drawn
 *  once, here, after the device read succeeds. */
export async function captureEvidence(kind: DeviceEvidenceKind): Promise<DeviceEvidence> {
    const read = await readDevice(kind);
    return { ...read, blinding: freshBlindingHex() };
}

function readDevice(kind: DeviceEvidenceKind): Promise<DeviceRead> {
    switch (kind) {
        case "geolocation-cross-check": return captureGeolocationCrossCheck();
        case "nfc-tap": return captureNfcTap();
        case "ble-sighting": return captureBleSighting();
    }
}
