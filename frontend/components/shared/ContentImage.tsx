/**
 * components/shared/ContentImage.tsx
 *
 * Renders either an <img> (for IPFS/HTTP URIs) or an emoji <span>,
 * detecting the source format automatically.
 */
"use client";

import { resolveContentURI } from "@/lib/shared/merchantBranding";

export function ContentImage({ src, alt, className }: { src: string; alt: string; className?: string }) {
    const isURI = src.startsWith("ipfs://") || src.startsWith("http://") || src.startsWith("https://") || src.startsWith("/ipfs/");
    if (isURI) {
        const resolved = resolveContentURI(src);
        // eslint-disable-next-line @next/next/no-img-element -- This renderer intentionally supports arbitrary IPFS/HTTP content URIs at runtime.
        return <img src={resolved} alt={alt} className={className ?? "w-12 h-12 rounded object-cover"} loading="lazy" />;
    }
    return <span className={className ?? "text-3xl"} aria-hidden="true">{src || "🍽️"}</span>;
}
