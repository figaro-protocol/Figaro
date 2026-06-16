/**
 * components/modules/SellerBrandingModule.tsx
 *
 * Scoped branding for seller-themed UI regions.
 *
 * Two responsibilities:
 * 1. Set the --seller-accent CSS custom property from the seller's accentColor
 * 2. Apply the seller's themeClass to the container
 *
 * Usage:
 *   <SellerBrandingModule sellerAddress={address}>
 *     {children}
 *   </SellerBrandingModule>
 */
"use client";

import { useEffect, useState, type ReactNode } from "react";
import { useSellerBranding } from "@/lib/seller/useSellerBranding";
import type { ResolvedSellerBranding } from "@/lib/seller/sellerBranding";

interface SellerBrandingModuleProps {
    sellerAddress: `0x${string}` | undefined;
    children: ReactNode;
    /** Optional CSS class added to the wrapper div */
    className?: string;
    brandingOverride?: ResolvedSellerBranding | null;
}

export function SellerBrandingModule({
    sellerAddress,
    children,
    className,
    brandingOverride,
}: SellerBrandingModuleProps) {
    // Accent/theme branding was driven by spec fields that no producer ever
    // wrote (accentColor/themeClass); with those gone this is a plain scoped
    // wrapper. `sellerAddress`/`brandingOverride` are retained on the props for
    // call-site compatibility and the still-live SellerLogo path below.
    void sellerAddress;
    void brandingOverride;

    return (
        <div className={className || undefined}>
            {children}
        </div>
    );
}

/**
 * SellerLogo — renders the seller's logo from IPFS/HTTP, with two
 * possible fallbacks: an initials block (when `fallbackName` is supplied)
 * coloured by the seller's accent, or a plain emoji (backward-compatible
 * default for consumers that don't pass a name).
 */
interface SellerLogoProps {
    sellerAddress: `0x${string}` | undefined;
    /**
     * Emoji to render when no logo loads AND no `fallbackName` is supplied.
     * Backward-compatibility default; `fallbackName` is the preferred
     * fallback path because it produces a per-seller-distinct affordance.
     */
    fallbackEmoji?: string;
    /**
     * Seller's display name. When provided, the fallback path renders a
     * 2-letter initials block tinted with the seller's accentColor (or
     * neutral gray if no accent). Mirrors the discover-card InitialsAvatar.
     */
    fallbackName?: string;
    className?: string;
    size?: number;
    brandingOverride?: ResolvedSellerBranding | null;
}

export function SellerLogo({
    sellerAddress,
    fallbackEmoji = "🍽️",
    fallbackName,
    className,
    size = 48,
    brandingOverride,
}: SellerLogoProps) {
    const { branding: resolvedBranding, isLoading } = useSellerBranding(brandingOverride ? undefined : sellerAddress);
    const branding = brandingOverride ?? resolvedBranding;
    const logoURL = branding?.logoURL;
    const [imageFailed, setImageFailed] = useState(false);

    useEffect(() => {
        setImageFailed(false);
    }, [logoURL]);

    if (!brandingOverride && isLoading) {
        return (
            <div
                className={className}
                style={{ width: size, height: size }}
                aria-hidden="true"
            >
                <div className="w-full h-full bg-neutral-100 rounded animate-pulse" />
            </div>
        );
    }

    if (logoURL && !imageFailed) {
        return (
            // eslint-disable-next-line @next/next/no-img-element -- Seller branding uses arbitrary IPFS/HTTP assets with runtime fallback handling.
            <img
                src={logoURL}
                alt="Seller logo"
                width={size}
                height={size}
                className={className}
                style={{ objectFit: "cover" }}
                onError={() => setImageFailed(true)}
            />
        );
    }

    // Initials fallback — preferred when a name is supplied. Matches the
    // discover-card InitialsAvatar pattern.
    if (fallbackName) {
        const initials = fallbackName.slice(0, 2).toUpperCase();
        const accent = "#6b7280";
        return (
            <span
                className={className}
                style={{
                    backgroundColor: accent,
                    color: "#ffffff",
                    fontWeight: 600,
                    fontSize: `${Math.max(10, Math.floor(size * 0.32))}px`,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: size,
                    height: size,
                    borderRadius: 6,
                }}
                aria-hidden="true"
            >
                {initials}
            </span>
        );
    }

    // Emoji fallback — backward-compatible default.
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
