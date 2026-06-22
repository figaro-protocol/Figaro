/**
 * components/shared/ContentImage.tsx
 *
 * Renders either an <img> (for IPFS/HTTP URIs) or an emoji <span>,
 * detecting the source format automatically. When an `<img>` fails to
 * load (network error, missing IPFS gateway, broken pin), an optional
 * `fallback` ReactNode is rendered in its place — typically an initials
 * block or a neutral placeholder.
 */
"use client";

import { useState } from "react";
import type { ReactNode } from "react";
import { resolveContentUri } from "@/lib/shared/ipfsService";

export function ContentImage({
    src,
    alt,
    className,
    fallback,
}: {
    src: string;
    alt: string;
    className?: string;
    fallback?: ReactNode;
}) {
    const [hasFailed, setHasFailed] = useState(false);
    const isURI =
        src.startsWith("ipfs://") ||
        src.startsWith("http://") ||
        src.startsWith("https://") ||
        src.startsWith("/ipfs/");

    if (isURI) {
        if (hasFailed && fallback !== undefined) {
            return <>{fallback}</>;
        }
        const resolved = resolveContentUri(src);
        if (!resolved) return fallback !== undefined ? <>{fallback}</> : null;
        // eslint-disable-next-line @next/next/no-img-element -- This renderer intentionally supports arbitrary IPFS/HTTP content URIs at runtime.
        return (
            <img
                src={resolved}
                alt={alt}
                className={className ?? "w-12 h-12 rounded object-cover"}
                loading="lazy"
                onError={() => setHasFailed(true)}
            />
        );
    }
    // No source ⇒ ABSENCE (the optional fallback, else nothing) — never a coined
    // emoji stand-in. A non-empty non-URI `src` is the seller's own chosen glyph.
    if (!src) return fallback !== undefined ? <>{fallback}</> : null;
    return (
        <span className={className ?? "text-3xl"} aria-hidden="true">
            {src}
        </span>
    );
}
