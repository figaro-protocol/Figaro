"use client";

/**
 * Watermark — beta-session artifact-custody mark.
 *
 * Renders the participant's access code as a small, semi-transparent QR in
 * the bottom-right corner of every (app) page. The watermark exists to
 * deter unattributed sharing of beta screenshots: the code is the binding
 * link between a beta tester and the runtime (test wallet addresses are
 * regenerable; the access code is not).
 *
 * Source of truth for the access code:
 *   1. URL query param `?code=...` on first arrival (beta invitation links
 *      carry the code) → persisted to localStorage.
 *   2. localStorage `figaro-beta-access-code` thereafter.
 *
 * NOTE: This is a development front-door. The Cloudflare Worker that
 * handles code redemption / session establishment has not been built yet.
 * When that lands, the Worker will populate the same localStorage key (or
 * an HttpOnly cookie + a public mirror) and this component will read from
 * the same key without any change. The query-param ingest path stays as
 * the local-dev mechanism.
 *
 * Reuses the `qrcode` npm dependency already loaded by
 * `components/shared/QRChallengeDisplay.tsx` — same lazy-import pattern,
 * no extra runtime cost.
 */

import { useEffect, useState } from "react";
import Image from "next/image";
import { truncateHex } from "@/lib/shared/formatHex";

const STORAGE_KEY = "figaro-beta-access-code";
const QUERY_PARAM = "code";

async function generateQRDataURL(payload: string, size: number): Promise<string> {
    const QRCode = await import("qrcode");
    return QRCode.toDataURL(payload, {
        width: size,
        margin: 1,
        errorCorrectionLevel: "M",
        color: { dark: "#000000", light: "#ffffff" },
    });
}

/**
 * Compact display form for the access code: first 6 + last 4 with an
 * ellipsis. Keeps the human-readable label small without leaking the
 * full code to a screen-shoulder observer.
 */
function shortCode(code: string): string {
    return truncateHex(code);
}

/**
 * Reads the access code from URL query first (one-shot, persists to
 * localStorage on first arrival), then falls back to localStorage. Returns
 * `null` until the effect runs to avoid SSR / hydration mismatch.
 */
function useAccessCode(): string | null {
    const [code, setCode] = useState<string | null>(null);

    useEffect(() => {
        if (typeof window === "undefined") return;

        try {
            const url = new URL(window.location.href);
            const fromQuery = url.searchParams.get(QUERY_PARAM);
            if (fromQuery && fromQuery.length > 0) {
                window.localStorage.setItem(STORAGE_KEY, fromQuery);
                // Clean the query param so reloads don't re-trigger ingest.
                url.searchParams.delete(QUERY_PARAM);
                window.history.replaceState({}, "", url.toString());
                setCode(fromQuery);
                return;
            }

            const fromStorage = window.localStorage.getItem(STORAGE_KEY);
            if (fromStorage && fromStorage.length > 0) {
                setCode(fromStorage);
            }
        } catch {
            // localStorage unavailable / SSR — render no watermark.
        }
    }, []);

    return code;
}

export interface WatermarkProps {
    /** QR pixel size. Default 56 — small enough to not interfere, large enough to scan. */
    size?: number;
}

/**
 * Bottom-right page watermark. Renders nothing until the access code is
 * resolved (no flash on first paint). Visible in screenshots; obvious if
 * cropped (the empty bottom-right corner reads as deliberate removal).
 */
export function Watermark({ size = 56 }: WatermarkProps) {
    const code = useAccessCode();
    const [dataURL, setDataURL] = useState<string | null>(null);

    useEffect(() => {
        if (!code) {
            setDataURL(null);
            return;
        }
        let cancelled = false;
        generateQRDataURL(code, size)
            .then((url) => { if (!cancelled) setDataURL(url); })
            .catch(() => { /* leave null — render nothing */ });
        return () => { cancelled = true; };
    }, [code, size]);

    if (!code) {
        return (
            <div
                className="pointer-events-none fixed bottom-3 right-3 z-50 select-none"
                data-testid="watermark-missing"
                aria-hidden="true"
            >
                <span className="text-[10px] font-mono text-neutral-400 opacity-60">
                    no code
                </span>
            </div>
        );
    }

    return (
        <div
            className="pointer-events-none fixed bottom-3 right-3 z-50 flex items-center gap-2 select-none opacity-50"
            data-testid="watermark"
            aria-hidden="true"
        >
            <span className="text-[10px] font-mono text-neutral-700">
                {shortCode(code)}
            </span>
            {dataURL && (
                <Image
                    src={dataURL}
                    alt=""
                    width={size}
                    height={size}
                    className="rounded-sm border border-neutral-300 bg-white"
                    unoptimized
                />
            )}
        </div>
    );
}

/**
 * Programmatic accessor for non-Watermark callers (e.g. the consent PDF
 * needs the raw access code to embed in the receipt). Returns `null` when
 * unavailable.
 */
export function readAccessCode(): string | null {
    if (typeof window === "undefined") return null;
    try {
        const fromStorage = window.localStorage.getItem(STORAGE_KEY);
        return fromStorage && fromStorage.length > 0 ? fromStorage : null;
    } catch {
        return null;
    }
}
