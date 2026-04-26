"use client";

/**
 * QRChallengeDisplay — renders a nonce challenge as a QR code.
 *
 * This is the verifier side of the QR handoff flow. The verifier device
 * (restaurant kiosk, buyer phone, locker screen, drone bay) displays a
 * fresh nonce as a QR code. The fulfiller scans it → signs → submits
 * on-chain proof at ProximityBand 4 (Visual).
 *
 * Payload format (JSON stringified):
 *   { "nonce": "0x...", "orderId": "0x...", "step": "pickup" | "delivery" }
 *
 * Permissionless primitive — usable at any process-tree edge, not just
 * seller→driver or driver→buyer.
 */

import Image from "next/image";
import { useEffect, useState } from "react";
import type { HandoffStep } from "@/lib/dispute";

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface QRChallengeDisplayProps {
    /** Hex nonce (0x-prefixed, 32 bytes) to encode in the QR. */
    nonce: `0x${string}`;
    /** FigaroCore order hash this challenge is for. */
    orderId: string;
    /** Which custody-transfer edge. */
    handoffStep: HandoffStep;
    /** QR image size in pixels (default 200). */
    size?: number;
}

// ---------------------------------------------------------------------------
// Lazy import of qrcode (avoids SSR issues — canvas not available server-side)
// ---------------------------------------------------------------------------

async function generateQRDataURL(payload: string, size: number): Promise<string> {
    const QRCode = await import("qrcode");
    return QRCode.toDataURL(payload, {
        width: size,
        margin: 2,
        errorCorrectionLevel: "M",
        color: { dark: "#000000", light: "#ffffff" },
    });
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function QRChallengeDisplay({
    nonce,
    orderId,
    handoffStep,
    size = 200,
}: QRChallengeDisplayProps) {
    const [dataURL, setDataURL] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const payload = JSON.stringify({
        nonce,
        orderId,
        step: handoffStep,
    });

    useEffect(() => {
        let cancelled = false;
        setError(null);

        generateQRDataURL(payload, size)
            .then((url) => { if (!cancelled) setDataURL(url); })
            .catch((err) => { if (!cancelled) setError(err.message); });

        return () => { cancelled = true; };
    }, [payload, size]);

    if (error) {
        return (
            <div className="rounded border border-red-200 bg-red-50 p-3" data-testid="qr-display-error">
                <p className="text-xs text-red-600">Failed to generate QR: {error}</p>
            </div>
        );
    }

    if (!dataURL) {
        return (
            <div
                className="flex items-center justify-center rounded border border-neutral-200 bg-neutral-50"
                style={{ width: size, height: size }}
                data-testid="qr-display-loading"
            >
                <p className="text-xs text-neutral-500">Generating…</p>
            </div>
        );
    }

    return (
        <div className="space-y-2" data-testid="qr-challenge-display">
            <Image
                src={dataURL}
                alt={`QR challenge for ${handoffStep}`}
                width={size}
                height={size}
                className="rounded border border-neutral-200"
                data-testid="qr-code-image"
                unoptimized
            />
            <p className="text-xs font-mono text-neutral-500 break-all">
                Nonce: {nonce}
            </p>
        </div>
    );
}
