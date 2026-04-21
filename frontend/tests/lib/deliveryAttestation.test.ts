import { describe, expect, it, vi, beforeEach } from "vitest";

import {
    AttestationMode,
    pinAttestation,
    type PhotoGPSAttestation,
    type GeohashMatchAttestation,
} from "@/lib/dispute/deliveryAttestation";

// ---------------------------------------------------------------------------
// Mock IPFS pinning
// ---------------------------------------------------------------------------

vi.mock("@/lib/shared/ipfsService", () => ({
    DEFAULT_IPFS_SERVICE: {
        pinJSON: vi.fn().mockResolvedValue("QmFakePhotoGPSCID123"),
        buildPath: (cid: string) => `/ipfs/${cid}`,
    },
}));

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const photoGPSAttestation: PhotoGPSAttestation = {
    mode: AttestationMode.PhotoGPS,
    handoffStep: "delivery",
    fulfiller: "0xDriverAddress",
    deliveryOrderId: "42",
    processId: "0xabc123",
    latitude: 37.7749,
    longitude: -122.4194,
    accuracyMeters: 12.5,
    geohash: "9q8yyk9",
    capturedAt: 1700000000000,
    photoCID: "QmPhotoCID",
    notes: "left at front door",
};

const geohashMatchAttestation: GeohashMatchAttestation = {
    mode: AttestationMode.GeohashMatch,
    handoffStep: "delivery",
    fulfiller: "0xDriverAddress",
    deliveryOrderId: "42",
    processId: "0xabc123",
    fulfillerGeohash: "9q8yyk",
    orderDropoffGeohash: "9q8yyk",
    precision: 6,
    matches: true,
    distanceKm: 0.05,
    latitude: 37.7749,
    longitude: -122.4194,
    accuracyMeters: 8.0,
    checkedAt: 1700000000000,
};

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("AttestationMode enum", () => {
    it("has the four expected modes", () => {
        expect(AttestationMode.DeviceProximity).toBe("device-proximity");
        expect(AttestationMode.QRChallenge).toBe("qr-challenge");
        expect(AttestationMode.PhotoGPS).toBe("photo-gps");
        expect(AttestationMode.GeohashMatch).toBe("geohash-match");
    });
});

describe("HandoffStep type", () => {
    it("photo GPS attestation accepts pickup step", () => {
        const pickup: PhotoGPSAttestation = {
            ...photoGPSAttestation,
            handoffStep: "pickup",
        };
        expect(pickup.handoffStep).toBe("pickup");
    });

    it("geohash attestation accepts pickup step", () => {
        const pickup: GeohashMatchAttestation = {
            ...geohashMatchAttestation,
            handoffStep: "pickup",
        };
        expect(pickup.handoffStep).toBe("pickup");
    });

    it("both attestation types default to delivery in fixtures", () => {
        expect(photoGPSAttestation.handoffStep).toBe("delivery");
        expect(geohashMatchAttestation.handoffStep).toBe("delivery");
    });
});

describe("pinAttestation — Photo+GPS", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("uses an injected evidence transport service when provided", async () => {
        const evidenceTransport = {
            pinJSON: vi.fn().mockResolvedValue("QmInjectedCID456"),
            buildPath: vi.fn().mockReturnValue("/ipfs/QmInjectedCID456"),
        };

        const result = await pinAttestation(photoGPSAttestation, evidenceTransport as never);

        expect(evidenceTransport.pinJSON).toHaveBeenCalledWith(photoGPSAttestation);
        expect(evidenceTransport.buildPath).toHaveBeenCalledWith("QmInjectedCID456");
        expect(result.attestationCID).toBe("QmInjectedCID456");
        expect(result.attestationURI).toBe("/ipfs/QmInjectedCID456");
    });

    it("returns attestation CID, URI, and Kleros evidence envelope", async () => {
        const result = await pinAttestation(photoGPSAttestation);

        expect(result.attestationCID).toBe("QmFakePhotoGPSCID123");
        expect(result.attestationURI).toBe("/ipfs/QmFakePhotoGPSCID123");
        expect(result.klerosEvidence.name).toContain("Photo+GPS");
        expect(result.klerosEvidence.name).toContain("42");
        expect(result.klerosEvidence.fileURI).toBe("/ipfs/QmFakePhotoGPSCID123");
        expect(result.klerosEvidence.fileHash).toBe("QmFakePhotoGPSCID123");
        expect(result.klerosEvidence.fileTypeExtension).toBe("json");
    });

    it("includes driver notes in evidence description", async () => {
        const result = await pinAttestation(photoGPSAttestation);

        expect(result.klerosEvidence.description).toContain("left at front door");
    });

    it("includes GPS coordinates in description", async () => {
        const result = await pinAttestation(photoGPSAttestation);

        expect(result.klerosEvidence.description).toContain("37.774900");
        expect(result.klerosEvidence.description).toContain("-122.419400");
    });

    it("includes photo CID in description", async () => {
        const result = await pinAttestation(photoGPSAttestation);

        expect(result.klerosEvidence.description).toContain("QmPhotoCID");
    });

    it("omits notes when absent", async () => {
        const noNotes = { ...photoGPSAttestation, notes: undefined };
        const result = await pinAttestation(noNotes);

        expect(result.klerosEvidence.description).not.toContain("Driver notes");
    });
});

describe("pinAttestation — Geohash match", () => {
    beforeEach(() => {
        vi.clearAllMocks();
    });

    it("returns attestation CID and Kleros evidence envelope", async () => {
        const result = await pinAttestation(geohashMatchAttestation);

        expect(result.attestationCID).toBe("QmFakePhotoGPSCID123");
        expect(result.klerosEvidence.name).toContain("Geohash Proximity Check");
        expect(result.klerosEvidence.name).toContain("42");
    });

    it("labels matching geohash as MATCH", async () => {
        const result = await pinAttestation(geohashMatchAttestation);

        expect(result.klerosEvidence.description).toContain("MATCH");
        expect(result.klerosEvidence.description).not.toContain("NO MATCH");
    });

    it("labels non-matching geohash as NO MATCH", async () => {
        const noMatch = {
            ...geohashMatchAttestation,
            matches: false,
            fulfillerGeohash: "9q8yym",
            distanceKm: 1.2,
        };
        const result = await pinAttestation(noMatch);

        expect(result.klerosEvidence.description).toContain("NO MATCH");
    });

    it("includes distance in km in description", async () => {
        const result = await pinAttestation(geohashMatchAttestation);

        expect(result.klerosEvidence.description).toContain("0.05 km");
    });

    it("includes both geohashes in description", async () => {
        const result = await pinAttestation(geohashMatchAttestation);

        expect(result.klerosEvidence.description).toContain("9q8yyk");
    });
});
