/**
 * @figaro/core/extensions — Geo & Handoff
 *
 * Geohash matching, Haversine distance, attestation mode types,
 * and Kleros evidence envelope formatting for delivery handoff.
 *
 * No IPFS pinning (infrastructure-dependent). This module produces
 * the data structures; the caller pins them however they choose.
 */

import type { Hex, Address } from "../types.js";

// ── Attestation modes ───────────────────────────────────────────────────────

export enum AttestationMode {
    /** WiFi / BLE / NFC device-to-device proximity proof. */
    DeviceProximity = "device-proximity",
    /** Visual QR challenge scan (~1–3m range). */
    QRChallenge = "qr-challenge",
    /** Photo with GPS coordinates, pinned to IPFS. */
    PhotoGPS = "photo-gps",
    /** GPS geohash comparison between parties. */
    GeohashMatch = "geohash-match",
}

export type HandoffStep = "pickup" | "delivery";

// ── Proximity bands (match V3 ProximityTypes.sol enum) ──────────────────────

export enum ProximityBand {
    None = 0,
    /** WiFi range (~30m). */
    Zone = 1,
    /** BLE range (~10m). */
    Nearby = 2,
    /** NFC range (~4cm). */
    Contact = 3,
}

// ── Photo GPS attestation ───────────────────────────────────────────────────

export interface PhotoGPSAttestation {
    fulfiller: Address;
    deliveryOrderId: Hex;
    processId: Hex;
    latitude: number;
    longitude: number;
    accuracyMeters: number;
    geohash: string;
    capturedAt: number;
    photoCID: string;
    notes?: string;
}

// ── Geohash match attestation ───────────────────────────────────────────────

export interface GeohashMatchAttestation {
    fulfiller: Address;
    deliveryOrderId: Hex;
    processId: Hex;
    fulfillerGeohash: string;
    orderDropoffGeohash: string;
    precision: number;
    matches: boolean;
    distanceKm: number;
    latitude: number;
    longitude: number;
    accuracyMeters: number;
    checkedAt: number;
}

// ── Geohash matching ────────────────────────────────────────────────────────

/**
 * Compare two geohashes at a given precision.
 * Returns true if the prefixes match at the specified length.
 *
 * Default precision: 6 characters (~1.2km × 0.6km).
 * See GEOHASH_PRECISION.md for rationale.
 */
export function geohashesMatch(
    geohash1: string,
    geohash2: string,
    precision: number = 6,
): boolean {
    if (!geohash1 || !geohash2) return false;
    return geohash1.substring(0, precision) === geohash2.substring(0, precision);
}

/**
 * Get the common prefix length of two geohashes.
 * Longer prefix = closer locations.
 */
export function geohashCommonPrefix(geohash1: string, geohash2: string): number {
    const len = Math.min(geohash1.length, geohash2.length);
    for (let i = 0; i < len; i++) {
        if (geohash1[i] !== geohash2[i]) return i;
    }
    return len;
}

// ── Haversine distance ──────────────────────────────────────────────────────

const EARTH_RADIUS_KM = 6371;

/**
 * Compute Haversine distance between two lat/lng points in kilometers.
 */
export function haversineDistance(
    lat1: number,
    lng1: number,
    lat2: number,
    lng2: number,
): number {
    const toRad = (deg: number) => (deg * Math.PI) / 180;

    const dLat = toRad(lat2 - lat1);
    const dLng = toRad(lng2 - lng1);

    const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;

    return EARTH_RADIUS_KM * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ── Kleros evidence envelope ────────────────────────────────────────────────

/**
 * Standard Kleros evidence JSON envelope.
 * See: https://github.com/kleros/kleros-interaction/blob/master/docs/ERC-1497.md
 */
export interface KlerosEvidence {
    name: string;
    description: string;
    fileURI: string;
    fileHash: string;
    fileTypeExtension: string;
}

/**
 * Format a Photo GPS attestation as a Kleros evidence envelope.
 * The caller is responsible for pinning to IPFS and providing the CID.
 */
export function formatPhotoGPSEvidence(
    attestation: PhotoGPSAttestation,
    attestationCID: string,
): KlerosEvidence {
    return {
        name: `Delivery photo attestation — Order ${attestation.deliveryOrderId.slice(0, 10)}`,
        description:
            `Photo GPS attestation by ${attestation.fulfiller}. ` +
            `Location: (${attestation.latitude.toFixed(6)}, ${attestation.longitude.toFixed(6)}), ` +
            `accuracy: ${attestation.accuracyMeters}m, geohash: ${attestation.geohash}. ` +
            `Captured at ${new Date(attestation.capturedAt * 1000).toISOString()}.`,
        fileURI: `/ipfs/${attestationCID}`,
        fileHash: attestationCID,
        fileTypeExtension: "json",
    };
}

/**
 * Format a geohash match attestation as a Kleros evidence envelope.
 */
export function formatGeohashMatchEvidence(
    attestation: GeohashMatchAttestation,
    attestationCID: string,
): KlerosEvidence {
    return {
        name: `Geohash match attestation — Order ${attestation.deliveryOrderId.slice(0, 10)}`,
        description:
            `Geohash match by ${attestation.fulfiller}. ` +
            `Fulfiller: ${attestation.fulfillerGeohash}, dropoff: ${attestation.orderDropoffGeohash}, ` +
            `precision: ${attestation.precision}, matches: ${attestation.matches}, ` +
            `distance: ${attestation.distanceKm.toFixed(2)} km. ` +
            `Checked at ${new Date(attestation.checkedAt * 1000).toISOString()}.`,
        fileURI: `/ipfs/${attestationCID}`,
        fileHash: attestationCID,
        fileTypeExtension: "json",
    };
}
