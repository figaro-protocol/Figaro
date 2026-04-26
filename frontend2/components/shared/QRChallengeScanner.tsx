"use client";

/**
 * QRChallengeScanner — camera-based QR scanner for handoff verification.
 *
 * This is the fulfiller side of the QR handoff flow. The driver (or bot,
 * kiosk, drone) scans the QR code displayed by the verifier device.
 *
 * On successful scan:
 *   1. Parses the JSON payload { nonce, orderId, step }
 *   2. Validates that it matches the expected order + step
 *   3. Hands the payload back to the caller to attach verifier signature and submit
 *
 * Falls back to manual nonce entry when camera is unavailable (desktop,
 * denied permissions, headless bots).
 *
 * Permissionless primitive — usable at any process-tree edge.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { HandoffStep } from "@/lib/dispute";

interface DetectedBarcode {
    rawValue: string;
}

interface BarcodeDetectorLike {
    detect(source: HTMLCanvasElement): Promise<DetectedBarcode[]>;
}

interface BarcodeDetectorConstructor {
    new (options: { formats: string[] }): BarcodeDetectorLike;
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface QRProofPayload {
    nonce: `0x${string}`;
    orderId: string;
    step: HandoffStep;
}

export interface QRChallengeScannerProps {
    /** Expected order ID — scanner rejects QRs for a different order. */
    orderId: string;
    /** Expected handoff step — scanner rejects QRs for a different step. */
    handoffStep: HandoffStep;
    /** Called when a valid QR payload is scanned. Caller is responsible for signing + submitting. */
    onPayloadScanned: (payload: QRProofPayload) => void;
    /** Called on scan error. */
    onError?: (error: string) => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function QRChallengeScanner({
    orderId,
    handoffStep,
    onPayloadScanned,
    onError,
}: QRChallengeScannerProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const streamRef = useRef<MediaStream | null>(null);
    const scanIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

    const [cameraActive, setCameraActive] = useState(false);
    const [cameraError, setCameraError] = useState<string | null>(null);
    const [manualNonce, setManualNonce] = useState("");
    const [scannedPayload, setScannedPayload] = useState<QRProofPayload | null>(null);

    // ── Validate & dispatch scanned payload ──────────────────────
    const processPayload = useCallback(
        (raw: string) => {
            try {
                const parsed = JSON.parse(raw);
                if (!parsed.nonce || !parsed.orderId || !parsed.step) {
                    onError?.("Invalid QR payload: missing fields");
                    return;
                }
                if (parsed.orderId !== orderId) {
                    onError?.(`QR is for order ${parsed.orderId}, expected ${orderId}`);
                    return;
                }
                if (parsed.step !== handoffStep) {
                    onError?.(`QR is for ${parsed.step} step, expected ${handoffStep}`);
                    return;
                }
                const payload: QRProofPayload = {
                    nonce: parsed.nonce as `0x${string}`,
                    orderId: parsed.orderId,
                    step: parsed.step,
                };
                setScannedPayload(payload);
                onPayloadScanned(payload);
            } catch {
                onError?.("Failed to parse QR payload");
            }
        },
        [orderId, handoffStep, onPayloadScanned, onError],
    );

    // ── Camera lifecycle ─────────────────────────────────────────
    const startCamera = useCallback(async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({
                video: { facingMode: "environment" },
            });
            streamRef.current = stream;
            if (videoRef.current) {
                videoRef.current.srcObject = stream;
                await videoRef.current.play();
            }
            setCameraActive(true);
            setCameraError(null);
        } catch (error: unknown) {
            setCameraError(error instanceof Error ? error.message : "Camera access denied");
            setCameraActive(false);
        }
    }, []);

    const stopCamera = useCallback(() => {
        if (scanIntervalRef.current) {
            clearInterval(scanIntervalRef.current);
            scanIntervalRef.current = null;
        }
        if (streamRef.current) {
            streamRef.current.getTracks().forEach((t) => t.stop());
            streamRef.current = null;
        }
        setCameraActive(false);
    }, []);

    // Cleanup on unmount
    useEffect(() => {
        return () => { stopCamera(); };
    }, [stopCamera]);

    // ── Frame scanning loop (uses BarcodeDetector when available) ─
    useEffect(() => {
        if (!cameraActive || !videoRef.current || !canvasRef.current) return;

        const video = videoRef.current;
        const canvas = canvasRef.current;
        const ctx = canvas.getContext("2d");
        if (!ctx) return;

        // Prefer native BarcodeDetector if available (Chrome, Edge)
        const barcodeDetectorCtor = (globalThis as { BarcodeDetector?: BarcodeDetectorConstructor }).BarcodeDetector;
        let detector: BarcodeDetectorLike | null = null;
        if (barcodeDetectorCtor) {
            detector = new barcodeDetectorCtor({ formats: ["qr_code"] });
        }

        scanIntervalRef.current = setInterval(async () => {
            if (video.readyState < video.HAVE_ENOUGH_DATA) return;

            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            ctx.drawImage(video, 0, 0);

            if (detector) {
                try {
                    const barcodes = await detector.detect(canvas);
                    if (barcodes.length > 0) {
                        processPayload(barcodes[0].rawValue);
                        stopCamera();
                    }
                } catch {
                    // Ignore frame-level detection errors
                }
            }
            // If no BarcodeDetector, camera is open but user must fall back to manual entry.
            // A jsQR integration can be added here without changing the component interface.
        }, 300);

        return () => {
            if (scanIntervalRef.current) {
                clearInterval(scanIntervalRef.current);
                scanIntervalRef.current = null;
            }
        };
    }, [cameraActive, processPayload, stopCamera]);

    // ── Manual entry handler ─────────────────────────────────────
    const handleManualSubmit = useCallback(() => {
        if (!manualNonce) return;
        const payload = JSON.stringify({
            nonce: manualNonce,
            orderId,
            step: handoffStep,
        });
        processPayload(payload);
    }, [manualNonce, orderId, handoffStep, processPayload]);

    // ── Render ───────────────────────────────────────────────────

    if (scannedPayload) {
        return (
            <div className="rounded bg-green-50 border border-green-200 p-3 space-y-1" data-testid="qr-scan-success">
                <p className="text-xs font-medium text-green-800">
                    QR scanned successfully
                </p>
                <p className="text-xs font-mono text-green-700 break-all">
                    Nonce: {scannedPayload.nonce}
                </p>
            </div>
        );
    }

    return (
        <div className="space-y-3" data-testid="qr-challenge-scanner">
            {/* Camera area */}
            <div className="relative rounded border border-neutral-200 overflow-hidden bg-neutral-900"
                style={{ minHeight: 200 }}
            >
                <video
                    ref={videoRef}
                    className="w-full h-auto"
                    playsInline
                    muted
                    data-testid="qr-scanner-video"
                />
                <canvas ref={canvasRef} className="hidden" />

                {!cameraActive && !cameraError && (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <button
                            type="button"
                            onClick={startCamera}
                            className="rounded bg-white px-4 py-2 text-xs font-semibold text-black shadow hover:bg-neutral-50"
                            data-testid="btn-start-camera"
                        >
                            Start Camera
                        </button>
                    </div>
                )}

                {cameraActive && (
                    <div className="absolute top-2 right-2">
                        <button
                            type="button"
                            onClick={stopCamera}
                            className="rounded bg-black/50 px-2 py-1 text-xs text-white hover:bg-black/70"
                            data-testid="btn-stop-camera"
                        >
                            Stop
                        </button>
                    </div>
                )}
            </div>

            {cameraError && (
                <p className="text-xs text-red-600" data-testid="camera-error">
                    Camera: {cameraError}
                </p>
            )}

            {/* Manual fallback */}
            <div className="space-y-2">
                <p className="text-xs text-neutral-500">
                    Or enter the nonce manually:
                </p>
                <div className="flex gap-2">
                    <input
                        type="text"
                        placeholder="0x..."
                        value={manualNonce}
                        onChange={(e) => setManualNonce(e.target.value)}
                        className="flex-1 rounded border border-neutral-300 px-2 py-1 text-xs font-mono"
                        data-testid="input-manual-qr-nonce"
                    />
                    <button
                        type="button"
                        onClick={handleManualSubmit}
                        disabled={!manualNonce}
                        className="rounded bg-black px-3 py-1 text-xs font-semibold text-white hover:bg-neutral-800 disabled:opacity-50"
                        data-testid="btn-manual-qr-submit"
                    >
                        Use
                    </button>
                </div>
            </div>
        </div>
    );
}
