/**
 * Delivery attestation types and IPFS evidence formatter.
 *
 * Three attestation modes, composable per-delivery:
 *
 *   1. **Device co-signature** (proximity schema attestation)
 *      Radio-range proof between fulfiller device and verifier device.
 *      Bands: WiFi (~30m), BLE (~10m), NFC (~4cm).
 *      Submitted as a standard attestation under figaro-proximity-proof-v1
 *      schema (Category-1 runtime witness), with proof data (band, nonce,
 *      deviceSig) in the off-chain contentRef. Off-chain consumers verify
 *      proof.band == policy.band against the committed figaro-proximity-policy-v1
 *      section in the agreement.
 *
 *   2. **Photo + GPS** (IPFS-pinned evidence)
 *      Fulfiller captures timestamped photo at delivery location with GPS coordinates.
 *      Self-attested but tamper-evident: IPFS CID commits the content, block
 *      timestamp anchors when it was submitted.
 *
 *   3. **Geohash match** (IPFS-pinned evidence)
 *      Fulfiller's GPS-derived geohash compared against the order's dropoff geohash.
 *      Precision-aware match rendered in the evidence display for jurors.
 *
 * All three feed into the Kleros evidence pipeline. Device co-sigs produce
 * on-chain events (already in evidence timeline). Photo+GPS and geohash
 * attestations are pinned to IPFS and submitted as Kleros evidence.
 *
 * This module is a permissionless primitive — any coordinator or institution
 * can use these attestation types. Not scoped to Eats.
 */

import { DEFAULT_IPFS_SERVICE, type IpfsService } from "@/lib/shared/ipfsService";

// ---------------------------------------------------------------------------
// Handoff step — which edge of the process tree this attestation covers
// ---------------------------------------------------------------------------

/** Which custody-transfer step this attestation proves. */
export type HandoffStep = "pickup" | "delivery";

// ---------------------------------------------------------------------------
// Attestation Mode enum
// ---------------------------------------------------------------------------

export enum AttestationMode {
    /** Radio-range challenge-response (WiFi/BLE/NFC). On-chain via coordinator. */
    DeviceProximity = "device-proximity",
    /** Visual-range challenge via QR code (~1-3m). On-chain via coordinator. */
    QRChallenge = "qr-challenge",
    /** Timestamped photo + GPS at handoff site. IPFS-pinned. */
    PhotoGPS = "photo-gps",
    /** GPS geohash match against order pickup/dropoff geohash. IPFS-pinned. */
    GeohashMatch = "geohash-match",
}

// ---------------------------------------------------------------------------
// Photo + GPS attestation
// ---------------------------------------------------------------------------

export interface PhotoGPSAttestation {
    mode: AttestationMode.PhotoGPS;
    /** Which custody-transfer step this proves. */
    handoffStep: HandoffStep;
    /** Fulfiller wallet address. */
    fulfiller: string;
    /** Delivery order ID (FigaroCore). */
    deliveryOrderId: string;
    /** Process ID. */
    processId: string;
    /** GPS latitude at capture time. */
    latitude: number;
    /** GPS longitude at capture time. */
    longitude: number;
    /** GPS accuracy in meters (from navigator.geolocation). */
    accuracyMeters: number;
    /** Geohash derived from GPS at the specified precision. */
    geohash: string;
    /** Unix timestamp (ms) when the photo was taken (client-side). */
    capturedAt: number;
    /** IPFS CID of the photo file (pinned separately). */
    photoCID: string;
    /** Optional notes from the fulfiller ("left at front door"). */
    notes?: string;
}

// ---------------------------------------------------------------------------
// Geohash match attestation
// ---------------------------------------------------------------------------

export interface GeohashMatchAttestation {
    mode: AttestationMode.GeohashMatch;
    /** Which custody-transfer step this proves. */
    handoffStep: HandoffStep;
    /** Fulfiller wallet address. */
    fulfiller: string;
    /** Delivery order ID (FigaroCore). */
    deliveryOrderId: string;
    /** Process ID. */
    processId: string;
    /** Fulfiller's GPS-derived geohash (precision 6–8). */
    fulfillerGeohash: string;
    /** Order's dropoff geohash from the manifest. */
    orderDropoffGeohash: string;
    /** Geohash precision used for comparison. */
    precision: number;
    /** Whether the geohashes match at the given precision. */
    matches: boolean;
    /** Approximate distance in km between geohash centers (Haversine). */
    distanceKm: number;
    /** GPS latitude at check time. */
    latitude: number;
    /** GPS longitude at check time. */
    longitude: number;
    /** GPS accuracy in meters. */
    accuracyMeters: number;
    /** Unix timestamp (ms) of the check. */
    checkedAt: number;
}

// ---------------------------------------------------------------------------
// Union type
// ---------------------------------------------------------------------------

export type DeliveryAttestation = PhotoGPSAttestation | GeohashMatchAttestation;

// ---------------------------------------------------------------------------
// IPFS pinning + Kleros evidence formatting
// ---------------------------------------------------------------------------

export interface AttestationEvidence {
    /** IPFS CID of the pinned attestation JSON. */
    attestationCID: string;
    /** IPFS URI (for Kleros evidence fileURI). */
    attestationURI: string;
    /** Kleros Evidence envelope (ready to pin and submit). */
    klerosEvidence: {
        name: string;
        description: string;
        fileURI: string;
        fileHash: string;
        fileTypeExtension: string;
    };
}

/**
 * Pin a delivery attestation to IPFS and produce a Kleros Evidence envelope.
 */
export async function pinAttestation(
    attestation: DeliveryAttestation,
    evidenceTransport: IpfsService = DEFAULT_IPFS_SERVICE,
): Promise<AttestationEvidence> {
    const cid = await evidenceTransport.pinJSON(attestation);
    const uri = evidenceTransport.buildPath(cid);

    const envelope = attestation.mode === AttestationMode.PhotoGPS
        ? formatPhotoGPSEvidence(attestation, cid)
        : formatGeohashMatchEvidence(attestation, cid);

    return { attestationCID: cid, attestationURI: uri, klerosEvidence: envelope };
}

function formatPhotoGPSEvidence(
    a: PhotoGPSAttestation,
    cid: string,
): AttestationEvidence["klerosEvidence"] {
    const time = new Date(a.capturedAt).toISOString();
    return {
        name: `Delivery Photo+GPS — Order ${a.deliveryOrderId}`,
        description:
            `Photo and GPS attestation submitted by fulfiller ${a.fulfiller}. ` +
            `Location: ${a.latitude.toFixed(6)}, ${a.longitude.toFixed(6)} ` +
            `(accuracy: ${a.accuracyMeters.toFixed(0)}m, geohash: ${a.geohash}). ` +
            `Captured at ${time}. ` +
            `Photo pinned to IPFS: ${a.photoCID}. ` +
            (a.notes ? `Driver notes: "${a.notes}". ` : "") +
            `Full attestation at the attached IPFS link.`,
        fileURI: `/ipfs/${cid}`,
        fileHash: cid,
        fileTypeExtension: "json",
    };
}

function formatGeohashMatchEvidence(
    a: GeohashMatchAttestation,
    cid: string,
): AttestationEvidence["klerosEvidence"] {
    const time = new Date(a.checkedAt).toISOString();
    const matchLabel = a.matches ? "MATCH" : "NO MATCH";
    return {
        name: `Geohash Proximity Check — Order ${a.deliveryOrderId}`,
        description:
            `Geohash proximity attestation submitted by fulfiller ${a.fulfiller}. ` +
            `Fulfiller geohash: ${a.fulfillerGeohash}, order dropoff: ${a.orderDropoffGeohash}. ` +
            `Precision ${a.precision}: ${matchLabel}. ` +
            `Distance: ${a.distanceKm.toFixed(2)} km. ` +
            `GPS: ${a.latitude.toFixed(6)}, ${a.longitude.toFixed(6)} ` +
            `(accuracy: ${a.accuracyMeters.toFixed(0)}m). ` +
            `Checked at ${time}. ` +
            `Full attestation at the attached IPFS link.`,
        fileURI: `/ipfs/${cid}`,
        fileHash: cid,
        fileTypeExtension: "json",
    };
}
