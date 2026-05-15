"use client";

/**
 * DeliveryAttestationPanel — handoff attestation capture UI.
 *
 * Works at both custody-transfer edges of a delivery:
 *   - **pickup** — restaurant → driver (calls declarePickedUp)
 *   - **delivery** — driver → buyer (calls declareDelivered)
 *
 * Four attestation modes, selectable per-handoff:
 *   1. Device co-signature — triggers coordinator proof overload (on-chain)
 *   2. QR challenge — visual-range QR scan produces on-chain proof (band 4)
 *   3. Photo + GPS — captures photo + GPS, pins to IPFS (off-chain evidence)
 *   4. Geohash match — GPS geohash vs order target (off-chain evidence)
 *
 * Each mode produces evidence that feeds into the Kleros dispute pipeline.
 * Mount this alongside CoordinatorActionModule for delivery orders.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { useDeliveryAttestation } from "@/hooks/core/useDeliveryAttestation";
import { useCourierProcessActions, type ProximityProof } from "@/lib/mechanisms/useCourierProcess";
import { AttestationMode, type AttestationEvidence, type HandoffStep } from "@/lib/dispute";
import { QRChallengeDisplay } from "@/components/modules/QRChallengeDisplay";
import { QRChallengeScanner } from "@/components/modules/QRChallengeScanner";
import type { CapabilityExecutionInput, CapabilityModel } from "@/lib/semantic/models";
import type { ModuleProps } from "@/lib/shared/moduleRegistry";
import type { ResolvedAssemblySkinBundle } from "@/lib/shared/runtimeResolution";
import { extractErrorMessage } from "@/lib/shared/errors";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

interface DeliveryAttestationPanelProps {
    processId: `0x${string}`;
    deliveryOrderHash: string;
    /** Which custody-transfer step: "pickup" (seller→driver) or "delivery" (driver→buyer). Defaults to "delivery". */
    handoffStep?: HandoffStep;
    /** Target geohash from the order manifest (pickup or dropoff, depending on step). */
    targetGeohash?: string;
    /** @deprecated Use targetGeohash instead. */
    dropoffGeohash?: string;
    /** Callback when an off-chain attestation is successfully pinned. */
    onAttestationPinned?: (evidence: AttestationEvidence) => void;
    /** Callback when a QR nonce is scanned, producing a proximity proof. */
    onQRProofCaptured?: (proof: ProximityProof) => void;
    /** Callback when an attestation capture or on-chain submission fails. */
    onError?: (error: string) => void;
    /** Optional shared-runtime proof capability for module-owned execution. */
    proofCapability?: CapabilityModel;
    /** Optional shared-runtime capability executor for module-owned execution. */
    onExecuteCapability?: (
        capability: CapabilityModel,
        input?: CapabilityExecutionInput,
    ) => void | Promise<void>;
    /** Active capability id from the shared runtime executor. */
    executingCapabilityId?: string | null;
    skin?: ResolvedAssemblySkinBundle;
}

// ---------------------------------------------------------------------------
// Step-aware labels
// ---------------------------------------------------------------------------

const STEP_LABELS: Record<HandoffStep, { title: string; verb: string; photoHint: string; geohashHint: string }> = {
    pickup: {
        title: "Pickup Confirmation",
        verb: "pickup",
        photoHint: "Take a photo at the pickup location. GPS coordinates and timestamp are captured automatically.",
        geohashHint: "Compares your current GPS location against the order pickup location.",
    },
    delivery: {
        title: "Delivery Confirmation",
        verb: "delivery",
        photoHint: "Take a photo at the delivery location. GPS coordinates and timestamp are captured automatically.",
        geohashHint: "Compares your current GPS location against the order dropoff location.",
    },
};

function generateQRChallengeNonce(): `0x${string}` {
    const cryptoObject = globalThis.crypto;
    if (!cryptoObject?.getRandomValues) {
        throw new Error("Secure random source unavailable");
    }

    const bytes = new Uint8Array(32);
    cryptoObject.getRandomValues(bytes);
    const hex = Array.from(bytes, (value) => value.toString(16).padStart(2, "0")).join("");
    return `0x${hex}`;
}

type CoordinatorMechanismMetadata = Record<string, unknown> & {
    pickupGeohash?: string;
    dropoffGeohash?: string;
    deliveryStage?: number;
    lifecycleStage?: number;
};

function resolveModuleHandoffStep(coordinator: CoordinatorMechanismMetadata | undefined): HandoffStep {
    const lifecycleStage = Number(coordinator?.deliveryStage ?? coordinator?.lifecycleStage ?? 0);
    return lifecycleStage >= 3 ? "delivery" : "pickup";
}

function buildDeliveryProofCapability(
    processId: string,
    orderHash: string,
    handoffStep: HandoffStep,
    mechanismId: string,
): CapabilityModel {
    const eventType: "arrived-pickup" | "completed" =
        handoffStep === "pickup" ? "arrived-pickup" : "completed";

    return {
        id: `${processId}:${orderHash}:submit-courier-process-signal-with-proof:${eventType}`,
        label: handoffStep === "pickup" ? "Submit Pickup Proof" : "Submit Delivery Proof",
        actionKind: "submit-courier-process-signal-with-proof",
        action: {
            executionType: "transaction",
            kind: "submit-courier-process-signal-with-proof",
            orderHash,
            eventType,
        },
        mechanismId,
        scopeType: "order",
        scopeId: orderHash,
        preconditions: ["driver-of-selected-order"],
        riskLabel: "standard",
        writeTarget: "AttestationCoordinator.attestAsSeller",
        uiPriority: 66,
        source: {
            truthClass: "protocol-derived",
            sourceLabel: "delivery attestation module may submit proximity proof for the selected handoff stage",
            referenceId: `${processId}:${orderHash}:submit-courier-process-signal-with-proof:${eventType}`,
        },
    };
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DeliveryAttestationPanel({
    processId,
    deliveryOrderHash,
    handoffStep = "delivery",
    targetGeohash,
    dropoffGeohash,
    onAttestationPinned,
    onQRProofCaptured,
    onError,
    proofCapability,
    onExecuteCapability,
    executingCapabilityId,
    skin,
}: DeliveryAttestationPanelProps) {
    const [selectedMode, setSelectedMode] = useState<AttestationMode | null>(null);
    const [notes, setNotes] = useState("");
    const [lastResult, setLastResult] = useState<AttestationEvidence | null>(null);
    const [photoPreview, setPhotoPreview] = useState<string | null>(null);
    const [qrDisplayNonce, setQRDisplayNonce] = useState<`0x${string}` | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const attestation = useDeliveryAttestation();
    const courier = useCourierProcessActions();
    const usesSharedProofExecution = !!proofCapability && !!onExecuteCapability;
    const proofSubmissionPending = usesSharedProofExecution
        ? executingCapabilityId === proofCapability?.id
        : courier.isPending;
    const proofSubmissionError = usesSharedProofExecution ? null : courier.error;

    // Resolve the geohash prop (support legacy dropoffGeohash)
    const resolvedGeohash = targetGeohash ?? dropoffGeohash;
    const accentTone = skin?.branding.branding.accentColor;
    const cardStyle = accentTone ? { borderTopColor: accentTone, borderTopWidth: "2px" } : undefined;
    const labelStyle = accentTone ? { color: accentTone } : undefined;

    // Step-aware courier event mapping. arrived-pickup = courier received the
    // goods at pickup; completed = courier delivered the goods at dropoff.
    const courierEventType: "arrived-pickup" | "completed" =
        handoffStep === "pickup" ? "arrived-pickup" : "completed";
    const labels = STEP_LABELS[handoffStep];

    // Revoke object URL on cleanup to avoid memory leaks
    useEffect(() => {
        return () => { if (photoPreview) URL.revokeObjectURL(photoPreview); };
    }, [photoPreview]);

    // ── Device co-sig requires external proof data (from BLE/NFC flow) ──
    const [proofNonce, setProofNonce] = useState("");
    const [proofDeviceSig, setProofDeviceSig] = useState("");
    const [proofBand, setProofBand] = useState<number>(1); // default Zone

    // ── Handlers ─────────────────────────────────────────────────────

    const handlePhotoGPS = useCallback(async () => {
        const file = fileInputRef.current?.files?.[0];
        if (!file) return;

        const result = await attestation.capturePhotoGPS(
            file,
            processId,
            deliveryOrderHash,
            notes || undefined,
            handoffStep,
        );
        if (result) {
            setLastResult(result);
            onAttestationPinned?.(result);
        } else if (attestation.error) {
            onError?.(attestation.error);
        }
    }, [attestation, processId, deliveryOrderHash, notes, handoffStep, onAttestationPinned, onError]);

    const handleGeohashMatch = useCallback(async () => {
        if (!resolvedGeohash) return;

        const result = await attestation.captureGeohash(
            processId,
            deliveryOrderHash,
            resolvedGeohash,
            6,
            handoffStep,
        );
        if (result) {
            setLastResult(result);
            onAttestationPinned?.(result);
        } else if (attestation.error) {
            onError?.(attestation.error);
        }
    }, [attestation, processId, deliveryOrderHash, resolvedGeohash, handoffStep, onAttestationPinned, onError]);

    const handleDeviceProof = useCallback(async () => {
        if (!proofNonce || !proofDeviceSig) return;

        const proof: ProximityProof = {
            band: proofBand,
            nonce: proofNonce as `0x${string}`,
            deviceSig: proofDeviceSig as `0x${string}`,
        };

        if (usesSharedProofExecution && proofCapability && onExecuteCapability) {
            try {
                await onExecuteCapability(proofCapability, {
                    kind: "submit-courier-process-signal-with-proof",
                    proof,
                });
            } catch (error) {
                onError?.(extractErrorMessage(error, "Delivery proof submission failed"));
            }
            return;
        }

        try {
            await courier.signalWithProof({
                orderHash: deliveryOrderHash,
                eventType: courierEventType,
                proof,
            });
            onQRProofCaptured?.(proof);
        } catch (proofError) {
            onError?.(extractErrorMessage(proofError, "Delivery proof submission failed"));
        }
    }, [
        courier,
        courierEventType,
        deliveryOrderHash,
        onError,
        onExecuteCapability,
        onQRProofCaptured,
        proofBand,
        proofCapability,
        proofDeviceSig,
        proofNonce,
        usesSharedProofExecution,
    ]);

    const handleQRProof = useCallback(async (proof: ProximityProof) => {
        if (usesSharedProofExecution && proofCapability && onExecuteCapability) {
            try {
                await onExecuteCapability(proofCapability, {
                    kind: "submit-courier-process-signal-with-proof",
                    proof,
                });
            } catch (error) {
                onError?.(extractErrorMessage(error, "Delivery proof submission failed"));
            }
            return;
        }

        try {
            await courier.signalWithProof({
                orderHash: deliveryOrderHash,
                eventType: courierEventType,
                proof,
            });
            onQRProofCaptured?.(proof);
        } catch (proofError) {
            onError?.(extractErrorMessage(proofError, "Delivery proof submission failed"));
        }
    }, [
        courier,
        courierEventType,
        deliveryOrderHash,
        onError,
        onExecuteCapability,
        onQRProofCaptured,
        proofCapability,
        usesSharedProofExecution,
    ]);

    const handleGenerateQRChallenge = useCallback(() => {
        try {
            setQRDisplayNonce(generateQRChallengeNonce());
        } catch (error) {
            onError?.(extractErrorMessage(error, "Failed to generate QR challenge"));
        }
    }, [onError]);

    // ── Render ───────────────────────────────────────────────────────

    return (
        <div
            className="rounded-lg border border-neutral-200 bg-white p-4 space-y-4"
            data-testid="delivery-attestation-panel"
            data-skin={skin?.skinId}
            style={cardStyle}
        >
            <h3 className="text-sm font-semibold text-neutral-700" style={labelStyle}>
                {labels.title}
            </h3>
            <p className="text-xs text-neutral-500">
                Capture proof of {labels.verb} for dispute evidence. Choose the
                attestation mode available at your {labels.verb} location.
            </p>

            {/* ── Mode selector ─────────────────────────────────── */}
            <div className="flex flex-wrap gap-2">
                <ModeButton
                    mode={AttestationMode.DeviceProximity}
                    label="Device Co-Sig"
                    sublabel="WiFi / BLE / NFC"
                    selected={selectedMode}
                    onSelect={setSelectedMode}
                    accentTone={accentTone}
                />
                <ModeButton
                    mode={AttestationMode.QRChallenge}
                    label="QR Challenge"
                    sublabel="Visual ~1-3m"
                    selected={selectedMode}
                    onSelect={setSelectedMode}
                    accentTone={accentTone}
                />
                <ModeButton
                    mode={AttestationMode.PhotoGPS}
                    label="Photo + GPS"
                    sublabel="Unattended"
                    selected={selectedMode}
                    onSelect={setSelectedMode}
                    accentTone={accentTone}
                />
                <ModeButton
                    mode={AttestationMode.GeohashMatch}
                    label="Geohash Match"
                    sublabel="Location check"
                    selected={selectedMode}
                    onSelect={setSelectedMode}
                    disabled={!resolvedGeohash}
                    accentTone={accentTone}
                />
            </div>

            {/* ── Device co-signature form ───────────────────────── */}
            {selectedMode === AttestationMode.DeviceProximity && (
                <div className="space-y-2" data-testid="attestation-device-form">
                    <p className="text-xs text-neutral-500">
                        Requires a verifier device (buyer phone, BLE beacon, NFC tag)
                        to co-sign the {labels.verb} challenge.
                    </p>
                    <div className="grid grid-cols-3 gap-2">
                        {([
                            [1, "Zone (WiFi)"],
                            [2, "Nearby (BLE)"],
                            [3, "Contact (NFC)"],
                        ] as const).map(([val, label]) => (
                            <button
                                key={val}
                                type="button"
                                onClick={() => setProofBand(val)}
                                className={`rounded border px-2 py-1 text-xs font-medium transition-colors ${proofBand === val
                                    ? "border-black bg-black text-white"
                                    : "border-neutral-300 text-neutral-600 hover:bg-neutral-50"
                                    }`}
                            >
                                {label}
                            </button>
                        ))}
                    </div>
                    <input
                        type="text"
                        placeholder="Nonce (0x...)"
                        value={proofNonce}
                        onChange={(e) => setProofNonce(e.target.value)}
                        className="w-full rounded border border-neutral-300 px-2 py-1 text-xs font-mono"
                        data-testid="input-proof-nonce"
                    />
                    <input
                        type="text"
                        placeholder="Device signature (0x...)"
                        value={proofDeviceSig}
                        onChange={(e) => setProofDeviceSig(e.target.value)}
                        className="w-full rounded border border-neutral-300 px-2 py-1 text-xs font-mono"
                        data-testid="input-proof-device-sig"
                    />
                    <button
                        type="button"
                        onClick={handleDeviceProof}
                        disabled={proofSubmissionPending || !proofNonce || !proofDeviceSig}
                        className="w-full rounded bg-black px-3 py-2 text-xs font-semibold text-white hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed"
                        style={accentTone ? { backgroundColor: accentTone } : undefined}
                        data-testid="btn-submit-device-proof"
                    >
                        {proofSubmissionPending ? "Submitting…" : "Submit On-Chain Proof"}
                    </button>
                    {proofSubmissionError && (
                        <p className="text-xs text-red-600">{proofSubmissionError}</p>
                    )}
                </div>
            )}

            {/* ── Photo + GPS form ──────────────────────────────── */}
            {selectedMode === AttestationMode.PhotoGPS && (
                <div className="space-y-2" data-testid="attestation-photo-form">
                    <p className="text-xs text-neutral-500">
                        {labels.photoHint}
                    </p>
                    <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        capture="environment"
                        className="w-full text-xs file:mr-2 file:rounded file:border file:border-neutral-300 file:bg-white file:px-2 file:py-1 file:text-xs file:font-medium"
                        data-testid="input-photo-file"
                        onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (photoPreview) URL.revokeObjectURL(photoPreview);
                            setPhotoPreview(file ? URL.createObjectURL(file) : null);
                        }}
                    />
                    {photoPreview && (
                        // eslint-disable-next-line @next/next/no-img-element -- Local object-URL previews are not compatible with Next image optimization.
                        <img
                            src={photoPreview}
                            alt={`Selected ${labels.verb} photo`}
                            className="w-full max-h-40 object-contain rounded border border-neutral-200"
                            data-testid="photo-preview"
                        />
                    )}
                    <input
                        type="text"
                        placeholder="Notes (e.g. 'left at front door')"
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        className="w-full rounded border border-neutral-300 px-2 py-1 text-xs"
                        data-testid="input-attestation-notes"
                    />
                    <button
                        type="button"
                        onClick={handlePhotoGPS}
                        disabled={attestation.loading}
                        className="w-full rounded bg-black px-3 py-2 text-xs font-semibold text-white hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed"
                        style={accentTone ? { backgroundColor: accentTone } : undefined}
                        data-testid="btn-capture-photo-gps"
                    >
                        {attestation.loading ? "Capturing…" : "Capture Photo + GPS"}
                    </button>
                </div>
            )}

            {/* ── Geohash match form ────────────────────────────── */}
            {selectedMode === AttestationMode.GeohashMatch && (
                <div className="space-y-2" data-testid="attestation-geohash-form">
                    <p className="text-xs text-neutral-500">
                        {labels.geohashHint}
                    </p>
                    {resolvedGeohash && (
                        <div className="flex items-center gap-2 text-xs">
                            <span className="text-neutral-500">Target geohash:</span>
                            <span className="font-mono font-medium text-neutral-700">{resolvedGeohash}</span>
                        </div>
                    )}
                    <button
                        type="button"
                        onClick={handleGeohashMatch}
                        disabled={attestation.loading || !resolvedGeohash}
                        className="w-full rounded bg-black px-3 py-2 text-xs font-semibold text-white hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed"
                        style={accentTone ? { backgroundColor: accentTone } : undefined}
                        data-testid="btn-capture-geohash"
                    >
                        {attestation.loading ? "Checking…" : "Check Geohash Match"}
                    </button>
                </div>
            )}

            {/* ── QR Challenge form ────────────────────────────── */}
            {selectedMode === AttestationMode.QRChallenge && (
                <div className="space-y-2" data-testid="attestation-qr-form">
                    <p className="text-xs text-neutral-500">
                        QR challenge is the visual-range handoff path. One device displays a fresh nonce,
                        the counterparty scans it, then submits band 4 proof with the verifier signature.
                    </p>
                    <div className="grid gap-3 lg:grid-cols-2">
                        <div className="rounded border border-neutral-200 bg-neutral-50 p-3 space-y-3">
                            <div className="flex items-start justify-between gap-3">
                                <div>
                                    <p className="text-xs font-semibold text-neutral-700">
                                        Verifier Device
                                    </p>
                                    <p className="text-xs text-neutral-500">
                                        Generate and display a fresh QR nonce for this {labels.verb} handoff.
                                    </p>
                                </div>
                                <button
                                    type="button"
                                    onClick={handleGenerateQRChallenge}
                                    className="rounded border border-neutral-300 bg-white px-2 py-1 text-xs font-semibold text-neutral-700 hover:bg-neutral-100"
                                    style={accentTone ? { borderColor: accentTone, color: accentTone } : undefined}
                                    data-testid="btn-generate-qr-challenge"
                                >
                                    {qrDisplayNonce ? "Regenerate" : "Generate"}
                                </button>
                            </div>
                            {qrDisplayNonce ? (
                                <>
                                    <QRChallengeDisplay
                                        nonce={qrDisplayNonce}
                                        orderId={deliveryOrderHash}
                                        handoffStep={handoffStep}
                                        size={176}
                                    />
                                    <button
                                        type="button"
                                        onClick={() => setProofNonce(qrDisplayNonce)}
                                        className="w-full rounded border border-neutral-300 bg-white px-3 py-2 text-xs font-medium text-neutral-700 hover:bg-neutral-100"
                                        style={accentTone ? { borderColor: accentTone, color: accentTone } : undefined}
                                        data-testid="btn-use-generated-qr-nonce"
                                    >
                                        Use Generated Nonce In This Session
                                    </button>
                                </>
                            ) : (
                                <p className="text-xs text-neutral-500">
                                    No challenge generated yet.
                                </p>
                            )}
                        </div>

                        <div className="rounded border border-neutral-200 bg-neutral-50 p-3 space-y-3">
                            <div>
                                <p className="text-xs font-semibold text-neutral-700">
                                    Fulfiller Device
                                </p>
                                <p className="text-xs text-neutral-500">
                                    Scan the QR challenge or fall back to manual nonce entry.
                                </p>
                            </div>
                            <QRChallengeScanner
                                orderId={deliveryOrderHash}
                                handoffStep={handoffStep}
                                onPayloadScanned={(payload) => setProofNonce(payload.nonce)}
                                onError={(error) => onError?.(error)}
                            />
                        </div>
                    </div>
                    <input
                        type="text"
                        placeholder="Scanned or manual nonce (0x...)"
                        value={proofNonce}
                        onChange={(e) => setProofNonce(e.target.value)}
                        className="w-full rounded border border-neutral-300 px-2 py-1 text-xs font-mono"
                        data-testid="input-qr-nonce"
                    />
                    <input
                        type="text"
                        placeholder="Verifier device signature (0x...)"
                        value={proofDeviceSig}
                        onChange={(e) => setProofDeviceSig(e.target.value)}
                        className="w-full rounded border border-neutral-300 px-2 py-1 text-xs font-mono"
                        data-testid="input-qr-device-sig"
                    />
                    <p className="text-xs text-neutral-500">
                        Scanner capture fills the nonce. The verifier signature remains explicit because the proof still models verifier-signed proximity evidence.
                    </p>
                    <button
                        type="button"
                        onClick={() => {
                            if (!proofNonce || !proofDeviceSig) return;
                            handleQRProof({
                                band: 4, // Visual (QR)
                                nonce: proofNonce as `0x${string}`,
                                deviceSig: proofDeviceSig as `0x${string}`,
                            });
                        }}
                        disabled={proofSubmissionPending || !proofNonce || !proofDeviceSig}
                        className="w-full rounded bg-black px-3 py-2 text-xs font-semibold text-white hover:bg-neutral-800 disabled:opacity-50 disabled:cursor-not-allowed"
                        style={accentTone ? { backgroundColor: accentTone } : undefined}
                        data-testid="btn-submit-qr-proof"
                    >
                        {proofSubmissionPending ? "Submitting…" : "Submit QR Proof On-Chain"}
                    </button>
                    {proofSubmissionError && (
                        <p className="text-xs text-red-600">{proofSubmissionError}</p>
                    )}
                </div>
            )}

            {/* ── Error ─────────────────────────────────────────── */}
            {attestation.error && (
                <p className="text-xs text-red-600" data-testid="attestation-error">
                    {attestation.error}
                </p>
            )}

            {/* ── Result ────────────────────────────────────────── */}
            {lastResult && (
                <div
                    className="rounded bg-green-50 border border-green-200 p-2 space-y-1"
                    data-testid="attestation-result"
                >
                    <p className="text-xs font-medium text-green-800">
                        Attestation pinned to IPFS
                    </p>
                    {photoPreview && (
                        // eslint-disable-next-line @next/next/no-img-element -- Local object-URL previews are not compatible with Next image optimization.
                        <img
                            src={photoPreview}
                            alt={`Pinned ${labels.verb} photo`}
                            className="w-full max-h-32 object-contain rounded border border-green-200"
                            data-testid="pinned-photo-preview"
                        />
                    )}
                    <p className="text-xs font-mono text-green-700 break-all">
                        CID: {lastResult.attestationCID}
                    </p>
                    <p className="text-xs text-green-600">
                        Submit this as evidence if a dispute is raised.
                    </p>
                </div>
            )}
        </div>
    );
}

export function DeliveryAttestationModule({ context }: ModuleProps) {
    if (!context.processModel || !context.selectedOrder) {
        return null;
    }

    const coordinator = context.mechanisms.find(
        (mechanism) => mechanism.kind === "coordinator",
    ) as CoordinatorMechanismMetadata | undefined;
    const handoffStep = resolveModuleHandoffStep(coordinator);
    const targetGeohash = handoffStep === "pickup"
        ? coordinator?.pickupGeohash
        : coordinator?.dropoffGeohash;
    const attestationMechanismId = context.mechanisms.find(
        (mechanism) => mechanism.kind === "attestation",
    )?.id ?? "delivery-attestation";
    const proofCapability = buildDeliveryProofCapability(
        context.processModel.processId,
        context.selectedOrder.orderId,
        handoffStep,
        attestationMechanismId,
    );

    return (
        <DeliveryAttestationPanel
            processId={context.processModel.processId as `0x${string}`}
            deliveryOrderHash={context.selectedOrder.orderId}
            handoffStep={handoffStep}
            targetGeohash={targetGeohash}
            proofCapability={proofCapability}
            onExecuteCapability={context.onExecuteCapability}
            executingCapabilityId={context.executingCapabilityId}
            skin={context.skinBundle}
        />
    );
}

// ---------------------------------------------------------------------------
// Mode selection button
// ---------------------------------------------------------------------------

function ModeButton({
    mode,
    label,
    sublabel,
    selected,
    onSelect,
    disabled,
    accentTone,
}: {
    mode: AttestationMode;
    label: string;
    sublabel: string;
    selected: AttestationMode | null;
    onSelect: (m: AttestationMode) => void;
    disabled?: boolean;
    accentTone?: string;
}) {
    const isSelected = selected === mode;
    return (
        <button
            type="button"
            onClick={() => onSelect(mode)}
            disabled={disabled}
            data-testid={`btn-mode-${mode}`}
            className={`flex-1 min-w-[100px] rounded border px-3 py-2 text-left transition-colors ${isSelected
                ? "border-black bg-black text-white"
                : disabled
                    ? "border-neutral-200 bg-neutral-50 text-neutral-300 cursor-not-allowed"
                    : "border-neutral-300 text-neutral-700 hover:bg-neutral-50"
                }`}
            style={isSelected && accentTone
                ? { backgroundColor: accentTone, borderColor: accentTone }
                : undefined}
        >
            <span className="block text-xs font-semibold">{label}</span>
            <span className={`block text-xs ${isSelected ? "text-neutral-300" : "text-neutral-500"}`}>
                {sublabel}
            </span>
        </button>
    );
}
