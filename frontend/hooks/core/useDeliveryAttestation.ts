"use client";

/**
 * useDeliveryAttestation — capture and pin delivery attestations.
 *
 * Provides three attestation capture functions matching the three modes:
 *
 *   1. capturePhotoGPS   — photo file + GPS → IPFS pin → Kleros evidence
 *   2. captureGeohash    — GPS geohash vs order dropoff → IPFS pin → Kleros evidence
 *   3. (device proximity is on-chain via coordinator — no hook needed, already
 *       handled by the lifecycle signal with ProximityTypes.Proof)
 *
 * All captures return an AttestationEvidence ready to submit to Kleros via
 * submitEvidence() or to store locally for later submission.
 */

import { useState, useCallback } from "react";
import { useAccount } from "wagmi";
import { encodeGeohash, geohashDistance } from "@/lib/handoff";
import type { IpfsService } from "@/lib/shared/ipfsService";
import { useRuntimeServices } from "@/lib/shared/runtimeServicesContext";
import { extractErrorMessage } from "@/lib/shared/errors";
import {
    AttestationMode,
    pinAttestation,
    type PhotoGPSAttestation,
    type GeohashMatchAttestation,
    type AttestationEvidence,
    type HandoffStep,
} from "@/lib/dispute/deliveryAttestation";

// ---------------------------------------------------------------------------
// GPS helper
// ---------------------------------------------------------------------------

interface GPSReading {
    latitude: number;
    longitude: number;
    accuracyMeters: number;
}

function getCurrentPosition(): Promise<GPSReading> {
    return new Promise((resolve, reject) => {
        if (!navigator.geolocation) {
            reject(new Error("Geolocation not available"));
            return;
        }
        navigator.geolocation.getCurrentPosition(
            (pos) =>
                resolve({
                    latitude: pos.coords.latitude,
                    longitude: pos.coords.longitude,
                    accuracyMeters: pos.coords.accuracy,
                }),
            (err) => reject(new Error(`GPS error: ${err.message}`)),
            { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 },
        );
    });
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

export interface DeliveryAttestationHook {
    /** True while a capture is in progress. */
    loading: boolean;
    /** Error from last capture attempt. */
    error: string | null;

    /**
     * Capture a photo + GPS attestation.
     * @param photoFile  The photo file (from camera input or file picker).
     * @param processId  The Figaro process ID.
     * @param deliveryOrderId  The delivery order ID.
     * @param notes  Optional fulfiller notes ("left at front door").
     * @param handoffStep  Which custody-transfer step (default: "delivery").
     */
    capturePhotoGPS: (
        photoFile: File,
        processId: string,
        deliveryOrderId: string,
        notes?: string,
        handoffStep?: HandoffStep,
    ) => Promise<AttestationEvidence | null>;

    /**
     * Capture a geohash match attestation.
     * @param processId  The Figaro process ID.
     * @param deliveryOrderId  The delivery order ID.
     * @param orderDropoffGeohash  The pickup/dropoff geohash from the order manifest.
     * @param precision  Geohash precision for comparison (default: 6).
     * @param handoffStep  Which custody-transfer step (default: "delivery").
     */
    captureGeohash: (
        processId: string,
        deliveryOrderId: string,
        orderDropoffGeohash: string,
        precision?: number,
        handoffStep?: HandoffStep,
    ) => Promise<AttestationEvidence | null>;
}

export interface UseDeliveryAttestationOptions {
    evidenceTransport?: IpfsService;
}

export function useDeliveryAttestation(
    options: UseDeliveryAttestationOptions = {},
): DeliveryAttestationHook {
    const { address } = useAccount();
    const { evidenceTransport: runtimeEvidenceTransport } = useRuntimeServices();
    const evidenceTransport = options.evidenceTransport ?? runtimeEvidenceTransport;
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    // ── Photo + GPS ─────────────────────────────────────────────────

    const capturePhotoGPS = useCallback(
        async (
            photoFile: File,
            processId: string,
            deliveryOrderId: string,
            notes?: string,
            handoffStep: HandoffStep = "delivery",
        ): Promise<AttestationEvidence | null> => {
            if (!address) {
                setError("Wallet not connected");
                return null;
            }
            setLoading(true);
            setError(null);

            try {
                let gps: GPSReading;
                try {
                    gps = await getCurrentPosition();
                } catch (gpsErr: unknown) {
                    throw new Error(`GPS failed: ${extractErrorMessage(gpsErr, "unknown")}`);
                }

                let photoCID: string;
                try {
                    const upload = await evidenceTransport.uploadFile(photoFile);
                    photoCID = upload.cid;
                } catch (pinErr: unknown) {
                    throw new Error(`Photo pin failed: ${extractErrorMessage(pinErr, "unknown")}`);
                }

                const geohash = encodeGeohash(gps.latitude, gps.longitude, 7);

                const attestation: PhotoGPSAttestation = {
                    mode: AttestationMode.PhotoGPS,
                    handoffStep,
                    fulfiller: address,
                    deliveryOrderId,
                    processId,
                    latitude: gps.latitude,
                    longitude: gps.longitude,
                    accuracyMeters: gps.accuracyMeters,
                    geohash,
                    capturedAt: Date.now(),
                    photoCID,
                    ...(notes ? { notes } : {}),
                };

                return await pinAttestation(attestation, evidenceTransport);
            } catch (e: unknown) {
                setError(extractErrorMessage(e, "Photo+GPS capture failed"));
                return null;
            } finally {
                setLoading(false);
            }
        },
        [address, evidenceTransport],
    );

    // ── Geohash match ───────────────────────────────────────────────

    const captureGeohash = useCallback(
        async (
            processId: string,
            deliveryOrderId: string,
            orderDropoffGeohash: string,
            precision: number = 6,
            handoffStep: HandoffStep = "delivery",
        ): Promise<AttestationEvidence | null> => {
            if (!address) {
                setError("Wallet not connected");
                return null;
            }
            setLoading(true);
            setError(null);

            try {
                let gps: GPSReading;
                try {
                    gps = await getCurrentPosition();
                } catch (gpsErr: unknown) {
                    throw new Error(`GPS failed: ${extractErrorMessage(gpsErr, "unknown")}`);
                }

                const fulfillerGeohash = encodeGeohash(
                    gps.latitude,
                    gps.longitude,
                    precision,
                );

                const matches =
                    fulfillerGeohash.slice(0, precision) ===
                    orderDropoffGeohash.slice(0, precision);

                let distanceKm: number;
                try {
                    distanceKm = geohashDistance(fulfillerGeohash, orderDropoffGeohash);
                } catch (distErr: unknown) {
                    throw new Error(`Distance calculation failed: ${extractErrorMessage(distErr, "unknown")}`);
                }

                const attestation: GeohashMatchAttestation = {
                    mode: AttestationMode.GeohashMatch,
                    handoffStep,
                    fulfiller: address,
                    deliveryOrderId,
                    processId,
                    fulfillerGeohash,
                    orderDropoffGeohash,
                    precision,
                    matches,
                    distanceKm,
                    latitude: gps.latitude,
                    longitude: gps.longitude,
                    accuracyMeters: gps.accuracyMeters,
                    checkedAt: Date.now(),
                };

                return await pinAttestation(attestation, evidenceTransport);
            } catch (e: unknown) {
                setError(extractErrorMessage(e, "Geohash check failed"));
                return null;
            } finally {
                setLoading(false);
            }
        },
        [address, evidenceTransport],
    );

    return { loading, error, capturePhotoGPS, captureGeohash };
}
