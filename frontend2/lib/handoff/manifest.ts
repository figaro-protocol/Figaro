/**
 * Figaro Handoff Manifest Utilities
 *
 * Generic manifest encoding/decoding for physical-handoff coordination.
 * Used by any institution archetype involving pickup/dropoff logistics
 * (delivery, ride-hail, repair dispatch, couriered retail, etc.).
 *
 * Manifest formats (pipe-separated, UTF-8 → hex bytes):
 *   v1|{pickup_gh}|{dropoff_gh}|{cos}|{mass_g}|{vol_ml}|{b64addr}|{b64notes}
 *   v2|{pickup_gh}|{dropoff_gh}|{cos}|{mass_g}|{vol_ml}|enc:{addr}|enc:{notes}
 *   v3|{pickup_gh}|{dropoff_gh}|{cos}|{mass_g}|{vol_ml}|epk:{buyer_pubkey}|enc:{addr}|enc:{notes}
 *   v4|{pickup_gh}|{dropoff_gh}|{cos}|{mass_g}|{vol_ml}|enc:{addr}|enc:{notes}|items:{b64json}
 *   v5|{pickup_gh}|{dropoff_gh}|{cos}|{mass_g}|{vol_ml}|epk:{buyer_pubkey}|enc:{addr}|enc:{notes}|items:{b64json}
 *
 * v1 — cleartext address (base64url-encoded)
 * v2 — AES-256-GCM sealed address, shared-key decryption
 * v3 — AES-256-GCM sealed + buyer's ephemeral secp256k1 public key for ECDH
 *
 * Fields:
 *   pickup_gh    – 6-char geohash of origin / pickup point
 *   dropoff_gh   – 6-char geohash of destination / handoff point
 *   cos          – class of service: S=Standard, E=Express, F=Fragile, C=ColdChain
 *   mass_g       – package mass in grams (integer, 0 if unknown)
 *   vol_ml       – package volume in ml    (integer, 0 if unknown)
 *   buyer_pubkey – compressed secp256k1 public key hex (v3 only)
 *   b64addr      – base64-url destination address (v1 only)
 *   b64notes     – base64-url handoff notes (v1 only)
 *   enc:{...}    – AES-256-GCM encrypted field (v2/v3)
 *
 * The manifest is stored on-chain as raw bytes. Pre-claim, the fulfiller sees
 * only geohashes + logistics metadata. Post-claim, the UI also renders the
 * decoded address and notes.
 */

// ---------------------------------------------------------------------------
// Geohash encoding (self-contained, no external dependency)
// ---------------------------------------------------------------------------
const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";

export function encodeGeohash(lat: number, lon: number, precision = 6): string {
    let idx = 0;
    let bit = 0;
    let evenBit = true;
    let hash = "";
    let minLat = -90,
        maxLat = 90,
        minLon = -180,
        maxLon = 180;

    while (hash.length < precision) {
        if (evenBit) {
            const midLon = (minLon + maxLon) / 2;
            if (lon >= midLon) {
                idx = (idx << 1) | 1;
                minLon = midLon;
            } else {
                idx = idx << 1;
                maxLon = midLon;
            }
        } else {
            const midLat = (minLat + maxLat) / 2;
            if (lat >= midLat) {
                idx = (idx << 1) | 1;
                minLat = midLat;
            } else {
                idx = idx << 1;
                maxLat = midLat;
            }
        }
        evenBit = !evenBit;
        if (++bit === 5) {
            hash += BASE32[idx];
            bit = 0;
            idx = 0;
        }
    }
    return hash;
}

/** Returns [minLat, maxLat, minLon, maxLon] bounding box for a geohash. */
export function geohashBounds(hash: string): [number, number, number, number] {
    let evenBit = true;
    let minLat = -90,
        maxLat = 90,
        minLon = -180,
        maxLon = 180;
    for (const c of hash) {
        const chr = BASE32.indexOf(c);
        if (chr < 0) break;
        for (let i = 4; i >= 0; i--) {
            const bit = (chr >> i) & 1;
            if (evenBit) {
                const midLon = (minLon + maxLon) / 2;
                if (bit) minLon = midLon;
                else maxLon = midLon;
            } else {
                const midLat = (minLat + maxLat) / 2;
                if (bit) minLat = midLat;
                else maxLat = midLat;
            }
            evenBit = !evenBit;
        }
    }
    return [minLat, maxLat, minLon, maxLon];
}

/** Centre point of a geohash cell. */
export function geohashCenter(hash: string): { lat: number; lon: number } {
    const [minLat, maxLat, minLon, maxLon] = geohashBounds(hash);
    return { lat: (minLat + maxLat) / 2, lon: (minLon + maxLon) / 2 };
}

// ---------------------------------------------------------------------------
// Approximate distance (km) between two geohash centres (Haversine)
// ---------------------------------------------------------------------------
export function geohashDistance(a: string, b: string): number {
    const ca = geohashCenter(a);
    const cb = geohashCenter(b);
    const R = 6371;
    const φ1 = (ca.lat * Math.PI) / 180;
    const φ2 = (cb.lat * Math.PI) / 180;
    const dφ = ((cb.lat - ca.lat) * Math.PI) / 180;
    const dλ = ((cb.lon - ca.lon) * Math.PI) / 180;
    const x =
        Math.sin(dφ / 2) * Math.sin(dφ / 2) +
        Math.cos(φ1) * Math.cos(φ2) * Math.sin(dλ / 2) * Math.sin(dλ / 2);
    return R * 2 * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

// ---------------------------------------------------------------------------
// Class of service
// ---------------------------------------------------------------------------
export const COS_OPTIONS = [
    { value: "S", label: "Standard", description: "Room temperature, not fragile" },
    { value: "E", label: "Express", description: "Priority – 30 min window" },
    { value: "F", label: "Fragile", description: "Handle with care" },
    { value: "C", label: "Cold Chain", description: "Refrigerated transport required" },
] as const;
export type CoS = "S" | "E" | "F" | "C";

export function cosLabel(cos: string): string {
    return COS_OPTIONS.find((o) => o.value === cos)?.label ?? cos;
}

// ---------------------------------------------------------------------------
// Manifest type
// ---------------------------------------------------------------------------

/**
 * Well-known schema IDs. These are keccak256 of the schema key string,
 * matching what ManifestSchemaRegistry stores on-chain.
 *
 * The schema ID identifies the manifest encoding format. The protocol core
 * treats manifest bytes as opaque — the schema tells the UI how to decode.
 */
export const MANIFEST_SCHEMAS = {
    /** Handoff manifest: geohash-6 + CoS + mass/vol + AES-sealed address. */
    HANDOFF_V1: "figaro-handoff-v1",
    /** Commerce manifest: handoff fields + itemized line items. */
    COMMERCE_V1: "figaro-commerce-v1",
} as const;

/** A single itemized line in a commerce manifest (packing list). */
export interface LineItem {
    name: string;
    quantity: number;
}

export interface HandoffManifest {
    version: "v1";
    pickupGeohash: string;   // 6-char, origin/pickup
    dropoffGeohash: string;  // 6-char, destination/handoff point
    cos: CoS;
    massGrams: number;       // 0 = unknown
    volumeMl: number;        // 0 = unknown
    destinationAddress: string; // human-readable full address
    notes: string;           // fulfiller notes
    /** Buyer's compressed ephemeral secp256k1 public key (v3/v5 only). */
    ephemeralPublicKey?: string;
    /** Itemized order contents (v4/v5 only). Cleartext — not sensitive. */
    lineItems?: LineItem[];
}

// ---------------------------------------------------------------------------
// Encode / decode
// ---------------------------------------------------------------------------

function b64Encode(s: string): string {
    if (typeof window === "undefined") return Buffer.from(s).toString("base64url");
    return btoa(unescape(encodeURIComponent(s)))
        .replace(/\+/g, "-")
        .replace(/\//g, "_")
        .replace(/=/g, "");
}

function b64Decode(s: string): string {
    if (!s) return "";
    const padded = s.replace(/-/g, "+").replace(/_/g, "/");
    const pad = (padded.length % 4 === 0) ? 0 : 4 - (padded.length % 4);
    try {
        if (typeof window === "undefined") return Buffer.from(padded + "=".repeat(pad), "base64").toString("utf8");
        return decodeURIComponent(escape(atob(padded + "=".repeat(pad))));
    } catch {
        return "";
    }
}

// ---------------------------------------------------------------------------
// Line-item encoding (cleartext, base64url JSON)
// ---------------------------------------------------------------------------

/** Encode line items as a compact base64url JSON field. */
export function encodeLineItems(items: LineItem[]): string {
    if (!items.length) return "";
    const compact = items.map((i) => ({ n: i.name, q: i.quantity }));
    return "items:" + b64Encode(JSON.stringify(compact));
}

/** Decode a `items:{b64json}` field back to LineItem[]. */
export function decodeLineItems(field: string): LineItem[] {
    if (!field.startsWith("items:")) return [];
    try {
        const json = b64Decode(field.slice(6));
        const arr = JSON.parse(json);
        if (!Array.isArray(arr)) return [];
        return arr.map((e: { n: string; q: number }) => ({
            name: e.n ?? "",
            quantity: e.q ?? 1,
        }));
    } catch {
        return [];
    }
}

/** Encode a HandoffManifest → on-chain hex bytes string (0x-prefixed). */
export function encodeManifest(m: HandoffManifest): `0x${string}` {
    const parts = [
        "v1",
        m.pickupGeohash || "------",
        m.dropoffGeohash || "------",
        m.cos || "S",
        String(Math.round(m.massGrams || 0)),
        String(Math.round(m.volumeMl || 0)),
        b64Encode(m.destinationAddress || ""),
        b64Encode(m.notes || ""),
    ];
    if (m.lineItems?.length) {
        parts.push(encodeLineItems(m.lineItems));
    }
    const raw = parts.join("|");

    const bytes = new TextEncoder().encode(raw);
    const hex = Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    return `0x${hex}`;
}

/** Decode hex bytes → HandoffManifest (returns null on invalid input).
 *  Handles v1 (cleartext address) and v2 (AES-GCM sealed address).
 *  For v2, `destinationAddress` is returned as a sealed sentinel — use
 *  `openManifest(hex, keyB64)` to decrypt when the key is available.
 */
export function decodeManifest(hex: string): HandoffManifest | null {
    if (!hex || !hex.startsWith("0x") || hex.length < 4) return null;
    try {
        const bytes: number[] = [];
        for (let i = 2; i < hex.length; i += 2) {
            bytes.push(parseInt(hex.slice(i, i + 2), 16));
        }
        const raw = new TextDecoder().decode(new Uint8Array(bytes)).replace(/\0/g, "");
        const parts = raw.split("|");

        // Helper: extract line items from trailing fields
        const extractLineItems = (allParts: string[]): LineItem[] => {
            const itemsField = allParts.find((p) => p.startsWith("items:"));
            return itemsField ? decodeLineItems(itemsField) : [];
        };

        // v3/v5: 9+ fields — includes ephemeral public key before encrypted fields
        if ((parts[0] === "v3" || parts[0] === "v5") && parts.length >= 9) {
            const [, pickupGeohash, dropoffGeohash, cos, massGrams, volumeMl, epkField] = parts;
            const ephemeralPublicKey = epkField.startsWith("epk:") ? epkField.slice(4) : undefined;
            return {
                version: "v1" as const,
                pickupGeohash: pickupGeohash || "------",
                dropoffGeohash: dropoffGeohash || "------",
                cos: (cos as CoS) || "S",
                massGrams: parseInt(massGrams) || 0,
                volumeMl: parseInt(volumeMl) || 0,
                destinationAddress: "\u{1F512} Destination address sealed",
                notes: "",
                ephemeralPublicKey,
                lineItems: extractLineItems(parts),
            };
        }

        // v1/v2/v4: 8+ fields
        if (!["v1", "v2", "v4"].includes(parts[0]) || parts.length < 8) return null;
        const [version, pickupGeohash, dropoffGeohash, cos, massGrams, volumeMl, addrField, notesField] = parts;
        const isSealed = version === "v2" || version === "v4";
        return {
            version: "v1" as const,
            pickupGeohash: pickupGeohash || "------",
            dropoffGeohash: dropoffGeohash || "------",
            cos: (cos as CoS) || "S",
            massGrams: parseInt(massGrams) || 0,
            volumeMl: parseInt(volumeMl) || 0,
            destinationAddress: isSealed ? "\u{1F512} Destination address sealed" : b64Decode(addrField),
            notes: isSealed ? "" : b64Decode(notesField),
            lineItems: extractLineItems(parts),
        };
    } catch {
        return null;
    }
}

/** A default manifest (no location data) for backwards compat / fallback. */
export const LEGACY_MANIFEST = "0x01" as const;

// ---------------------------------------------------------------------------
// AES-256-GCM address encryption (Web Crypto API — browser only)
//
// Manifest v2 stores destinationAddress and notes as AES-GCM ciphertext.
// The field format is: `enc:{base64url(12-byte IV || ciphertext)}`
//
// Key lifecycle:
//   1. Buyer calls sealManifest() → gets { hex, keyB64 }
//   2. keyB64 is stored by the caller (e.g. localStorage) for later sharing
//   3. Winning fulfiller receives keyB64 out-of-band (buyer shares via UI)
//   4. Fulfiller calls openManifest(hex, keyB64) to decrypt
// ---------------------------------------------------------------------------

function bytesToB64Url(bytes: Uint8Array): string {
    if (typeof window === "undefined") {
        return Buffer.from(bytes).toString("base64url");
    }
    let binary = "";
    bytes.forEach((b) => (binary += String.fromCharCode(b)));
    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function b64UrlToBytes(b64: string): Uint8Array {
    if (typeof window === "undefined") {
        return Uint8Array.from(Buffer.from(b64, "base64url"));
    }
    const padded = b64.replace(/-/g, "+").replace(/_/g, "/");
    const pad = padded.length % 4 === 0 ? 0 : 4 - (padded.length % 4);
    const binary = atob(padded + "=".repeat(pad));
    return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

async function importAesKey(keyB64: string): Promise<CryptoKey> {
    return crypto.subtle.importKey(
        "raw",
        b64UrlToBytes(keyB64).buffer as ArrayBuffer,
        { name: "AES-GCM" },
        false,
        ["encrypt", "decrypt"]
    );
}

async function aesGcmEncrypt(plaintext: string, keyB64: string): Promise<string> {
    const key = await importAesKey(keyB64);
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt(
        { name: "AES-GCM", iv },
        key,
        new TextEncoder().encode(plaintext)
    );
    const combined = new Uint8Array(iv.byteLength + ct.byteLength);
    combined.set(iv, 0);
    combined.set(new Uint8Array(ct), 12);
    return bytesToB64Url(combined);
}

async function aesGcmDecrypt(sealed: string, keyB64: string): Promise<string> {
    if (!sealed) return "";
    const key = await importAesKey(keyB64);
    const combined = b64UrlToBytes(sealed);
    const iv = combined.slice(0, 12);
    const ct = combined.slice(12);
    const plain = await crypto.subtle.decrypt({ name: "AES-GCM", iv }, key, ct);
    return new TextDecoder().decode(plain);
}

/** Generate a fresh random AES-256-GCM key, exported as base64url. */
export async function generateHandoffKey(): Promise<string> {
    const key = await crypto.subtle.generateKey(
        { name: "AES-GCM", length: 256 },
        true,
        ["encrypt", "decrypt"]
    );
    const raw = await crypto.subtle.exportKey("raw", key);
    return bytesToB64Url(new Uint8Array(raw));
}

/**
 * Encode a HandoffManifest with AES-256-GCM-encrypted address and notes.
 *
 * Always generates a fresh random per-order AES-256-GCM key. If an
 * ephemeral public key is provided, produces a v3 manifest that embeds
 * the buyer's ephemeral compressed public key (preparation for Phase 3
 * ECDH key exchange). Otherwise produces a legacy v2 manifest.
 *
 * Returns the on-chain hex string and the per-order handoff key (base64url).
 */
export async function sealManifest(
    m: HandoffManifest,
    ephemeralPublicKeyHex?: string
): Promise<{ hex: `0x${string}`; keyB64: string }> {
    const k = await generateHandoffKey();
    const encAddr = "enc:" + (await aesGcmEncrypt(m.destinationAddress || "", k));
    const encNotes = "enc:" + (await aesGcmEncrypt(m.notes || "", k));

    const hasItems = !!m.lineItems?.length;

    // v4/v5 carry line items; v2/v3 are the legacy formats without items.
    const parts: string[] = ephemeralPublicKeyHex
        ? [
            hasItems ? "v5" : "v3",
            m.pickupGeohash || "------",
            m.dropoffGeohash || "------",
            m.cos || "S",
            String(Math.round(m.massGrams || 0)),
            String(Math.round(m.volumeMl || 0)),
            "epk:" + ephemeralPublicKeyHex,
            encAddr,
            encNotes,
        ]
        : [
            hasItems ? "v4" : "v2",
            m.pickupGeohash || "------",
            m.dropoffGeohash || "------",
            m.cos || "S",
            String(Math.round(m.massGrams || 0)),
            String(Math.round(m.volumeMl || 0)),
            encAddr,
            encNotes,
        ];

    if (hasItems) {
        parts.push(encodeLineItems(m.lineItems!));
    }

    const raw = parts.join("|");
    const bytes = new TextEncoder().encode(raw);
    const hex = Array.from(bytes)
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
    return { hex: `0x${hex}`, keyB64: k };
}

/**
 * Decode a v2/v3/v4/v5 manifest hex string.
 * - If keyB64 is provided: decrypts address and notes.
 * - If keyB64 is null: address and notes are replaced with sentinel strings
 *   so callers can detect the encrypted state.
 * Falls back to synchronous decodeManifest for legacy v1 manifests.
 */
export async function openManifest(
    hex: string,
    keyB64: string | null
): Promise<HandoffManifest | null> {
    if (!hex || !hex.startsWith("0x") || hex.length < 4) return null;
    try {
        const bytes: number[] = [];
        for (let i = 2; i < hex.length; i += 2) {
            bytes.push(parseInt(hex.slice(i, i + 2), 16));
        }
        const raw = new TextDecoder().decode(new Uint8Array(bytes)).replace(/\0/g, "");
        const parts = raw.split("|");

        const decryptField = async (field: string): Promise<string | null> => {
            if (!field.startsWith("enc:")) return field;
            if (!keyB64) return null;
            try {
                return await aesGcmDecrypt(field.slice(4), keyB64);
            } catch {
                return null;
            }
        };

        // Helper: extract line items from trailing fields
        const extractLineItems = (allParts: string[]): LineItem[] => {
            const itemsField = allParts.find((p) => p.startsWith("items:"));
            return itemsField ? decodeLineItems(itemsField) : [];
        };

        // v3/v5: 9+ fields — ephemeral public key at index 6
        if ((parts[0] === "v3" || parts[0] === "v5") && parts.length >= 9) {
            const [, pickupGeohash, dropoffGeohash, cos, massGrams, volumeMl, epkField, encAddr, encNotes] = parts;
            const ephemeralPublicKey = epkField.startsWith("epk:") ? epkField.slice(4) : undefined;
            const address = await decryptField(encAddr);
            const notes = await decryptField(encNotes);
            return {
                version: "v1" as const,
                pickupGeohash: pickupGeohash || "------",
                dropoffGeohash: dropoffGeohash || "------",
                cos: (cos as CoS) || "S",
                massGrams: parseInt(massGrams) || 0,
                volumeMl: parseInt(volumeMl) || 0,
                destinationAddress: address ?? "\u{1F512} Destination address sealed",
                notes: notes ?? "",
                ephemeralPublicKey,
                lineItems: extractLineItems(parts),
            };
        }

        // v2/v4: 8+ fields
        if (!["v2", "v4"].includes(parts[0]) || parts.length < 8) {
            return decodeManifest(hex);
        }

        const [, pickupGeohash, dropoffGeohash, cos, massGrams, volumeMl, encAddr, encNotes] = parts;
        const address = await decryptField(encAddr);
        const notes = await decryptField(encNotes);

        return {
            version: "v1" as const,
            pickupGeohash: pickupGeohash || "------",
            dropoffGeohash: dropoffGeohash || "------",
            cos: (cos as CoS) || "S",
            massGrams: parseInt(massGrams) || 0,
            volumeMl: parseInt(volumeMl) || 0,
            destinationAddress: address ?? "\u{1F512} Destination address sealed",
            notes: notes ?? "",
            lineItems: extractLineItems(parts),
        };
    } catch {
        return null;
    }
}
