"use client";

/**
 * QrChallengePanel — the surface for the `qr-challenge-v1` interaction
 * standard: order identity over the VISUAL channel at a physical hand-off.
 *
 * One party presents the QR (this order's identity — processId + orderHash,
 * nothing secret: both are public chain data); the counterparty scans it to
 * find or confirm the matching order on their own device. Verification is a
 * local comparison — paste/scan a presented payload and the panel either
 * confirms it identifies THIS order or links to the order it does identify
 * (the search-by-QR affordance).
 *
 * Mounted by the interactionSurfaces registry for any clause declaring
 * `block.interaction.interface = "qr-challenge-v1"` — this component knows
 * no clause; `clauseId` is display attribution only.
 */
import { useEffect, useState } from "react";
import Link from "next/link";
import { getClauseSpec } from "@/lib/shared/clauseSpecSource";
import { truncateHex } from "@/lib/shared/formatHex";
import type { InteractionSurfaceProps } from "@/components/core/interactionSurfaces";

interface QrOrderIdentity {
    processId: string;
    orderHash: string;
}

function encodeIdentity(identity: QrOrderIdentity): string {
    return JSON.stringify(identity);
}

function tryDecodeIdentity(raw: string): QrOrderIdentity | null {
    try {
        const parsed = JSON.parse(raw) as Partial<QrOrderIdentity>;
        if (typeof parsed.processId !== "string" || typeof parsed.orderHash !== "string") return null;
        return { processId: parsed.processId, orderHash: parsed.orderHash };
    } catch {
        return null;
    }
}

async function generateQRDataURL(payload: string): Promise<string> {
    const QRCode = await import("qrcode");
    return QRCode.toDataURL(payload, {
        width: 180,
        margin: 2,
        errorCorrectionLevel: "L",
        color: { dark: "#000000", light: "#ffffff" },
    });
}

export function QrChallengePanel({ processId, orderHash, clauseId }: InteractionSurfaceProps) {
    const identity = encodeIdentity({ processId, orderHash });
    const [qrDataUrl, setQrDataUrl] = useState<string | null>(null);
    const [scanned, setScanned] = useState("");

    useEffect(() => {
        let cancelled = false;
        void generateQRDataURL(identity).then((url) => {
            if (!cancelled) setQrDataUrl(url);
        });
        return () => {
            cancelled = true;
        };
    }, [identity]);

    const decoded = scanned.trim() ? tryDecodeIdentity(scanned.trim()) : null;
    const matches = decoded !== null
        && decoded.processId.toLowerCase() === processId.toLowerCase()
        && decoded.orderHash.toLowerCase() === orderHash.toLowerCase();
    const clauseTitle = getClauseSpec(clauseId)?.title ?? clauseId;

    return (
        <section
            className="rounded border border-neutral-200 bg-white p-4 space-y-3"
            data-testid="interaction-qr-panel"
        >
            <div className="flex items-baseline justify-between gap-2">
                <p className="text-xs font-semibold text-neutral-500">Hand-off QR</p>
                <p className="text-[11px] text-neutral-400">{clauseTitle}</p>
            </div>
            <p className="text-xs text-neutral-600">
                Present this code at the hand-off — the counterparty scans it to pull
                up the matching order on their device. It carries only the order&apos;s
                public identity.
            </p>
            <div className="flex items-start gap-4">
                {qrDataUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                        src={qrDataUrl}
                        alt={`QR identity for order ${truncateHex(orderHash)}`}
                        width={180}
                        height={180}
                        data-testid="interaction-qr-image"
                        className="shrink-0 rounded border border-neutral-200"
                    />
                ) : (
                    <div className="h-[180px] w-[180px] shrink-0 rounded border border-neutral-200 bg-neutral-50" />
                )}
                <div className="flex-1 min-w-0 space-y-2">
                    <p className="text-[11px] text-neutral-500 font-mono break-all" data-testid="interaction-qr-payload">
                        {identity}
                    </p>
                    <label className="block text-xs font-semibold text-neutral-700">
                        Scanned a code? Verify it here
                        <textarea
                            value={scanned}
                            onChange={(e) => setScanned(e.target.value)}
                            rows={2}
                            placeholder='{"processId":"0x…","orderHash":"0x…"}'
                            data-testid="interaction-qr-scan-input"
                            className="mt-1 w-full font-mono text-[11px] px-2 py-1.5 border border-neutral-300 rounded"
                        />
                    </label>
                    {scanned.trim() && decoded === null && (
                        <p className="text-[11px] text-red-600" data-testid="interaction-qr-invalid">
                            Not a Figaro order QR payload.
                        </p>
                    )}
                    {matches && (
                        <p className="text-xs font-semibold text-green-700" data-testid="interaction-qr-match">
                            ✓ Matches this order
                        </p>
                    )}
                    {decoded !== null && !matches && (
                        <p className="text-xs text-neutral-700" data-testid="interaction-qr-other">
                            Identifies a different order —{" "}
                            <Link
                                href={`/orders/${decoded.processId}`}
                                className="underline text-black hover:text-neutral-600"
                                data-testid="interaction-qr-goto"
                            >
                                open {truncateHex(decoded.orderHash)}
                            </Link>
                        </p>
                    )}
                </div>
            </div>
        </section>
    );
}
