/**
 * components/modules/MemberBrandingModule.tsx — MemberLogo, the seller's
 * logo rendered from IPFS/HTTP with initials/emoji/neutral fallbacks.
 */
"use client";

import { useEffect, useState } from "react";
import { InitialsAvatar } from "@/components/shared/InitialsAvatar";
import { useMemberBranding } from "@/lib/member/useMemberBranding";
import { resolveImageUri } from "@/lib/shared/ipfsService";

/**
 * MemberLogo — renders the seller's logo from IPFS/HTTP, with two
 * possible fallbacks: an initials block (when `fallbackName` is supplied)
 * coloured by the seller's accent, or a plain emoji (backward-compatible
 * default for consumers that don't pass a name).
 */
interface MemberLogoProps {
    sellerAddress: `0x${string}` | undefined;
    /** The seller's OWN glyph, when they set one. Absent ⇒ a neutral placeholder
     *  (never a coined default). */
    fallbackEmoji?: string;
    /**
     * Seller's display name. When provided, the fallback path renders a
     * 2-letter initials block tinted with the seller's accentColor (or
     * neutral gray if no accent). Mirrors the discover-card InitialsAvatar.
     */
    fallbackName?: string;
    className?: string;
    size?: number;
}

export function MemberLogo({
    sellerAddress,
    fallbackEmoji,
    fallbackName,
    className,
    size = 48,
}: MemberLogoProps) {
    const { branding, isLoading } = useMemberBranding(sellerAddress);
    // IPFS-only: a raw http(s) branding locator is attacker-authorable and
    // hotlinking it deanonymizes the viewer (finding 3). Non-IPFS logos resolve
    // to null and fall through to the initials / neutral placeholder below.
    const logoSrc = branding?.logoURI ? resolveImageUri(branding.logoURI) : null;
    const [imageFailed, setImageFailed] = useState(false);

    useEffect(() => {
        setImageFailed(false);
    }, [logoSrc]);

    if (isLoading) {
        return (
            <div
                className={className}
                style={{ width: size, height: size }}
                aria-hidden="true"
            >
                <div className="w-full h-full bg-subtle rounded animate-pulse" />
            </div>
        );
    }

    if (logoSrc && !imageFailed) {
        return (
            // eslint-disable-next-line @next/next/no-img-element -- Seller branding uses arbitrary IPFS assets with runtime fallback handling.
            <img
                src={logoSrc}
                alt="Seller logo"
                width={size}
                height={size}
                className={className}
                style={{ objectFit: "cover" }}
                onError={() => setImageFailed(true)}
            />
        );
    }

    // Initials fallback — preferred when a name is supplied. Shares
    // components/shared/InitialsAvatar with the discover-card listing.
    if (fallbackName) {
        return (
            <InitialsAvatar
                name={fallbackName}
                size={size}
                radius={6}
                fontSize={Math.max(10, Math.floor(size * 0.32))}
                className={className}
                aria-hidden
            />
        );
    }

    // The seller's OWN glyph when they set one; otherwise a NEUTRAL placeholder —
    // never a coined stand-in (resolved-empty = absence).
    if (fallbackEmoji) {
        return (
            <span
                className={className}
                style={{
                    fontSize: `${size * 0.6}px`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: size,
                    height: size,
                }}
                aria-hidden="true"
            >
                {fallbackEmoji}
            </span>
        );
    }
    return (
        <span
            className={className}
            style={{ width: size, height: size, display: "block" }}
            aria-hidden="true"
        >
            <span className="block w-full h-full bg-subtle rounded" />
        </span>
    );
}
