/**
 * components/modules/SellerBrandingModule.tsx
 *
 * Scoped CSS and branding injection for seller-themed UI regions.
 *
 * Three responsibilities:
 * 1. Set CSS custom properties from the seller's accentColor
 * 2. Inject external CSS from the seller's assets.cssURI, wrapped in
 *    @layer seller {} so it cannot override protocol-critical styles
 * 3. Apply the seller's themeClass to the container
 *
 * Usage:
 *   <SellerBrandingModule sellerAddress={address}>
 *     <RestaurantCard ... />
 *   </SellerBrandingModule>
 */
"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useSellerBranding } from "@/lib/mechanisms/useSellerBranding";
import type { ResolvedSellerBranding } from "@/lib/shared/sellerBranding";

interface SellerBrandingModuleProps {
    sellerAddress: `0x${string}` | undefined;
    children: ReactNode;
    /** Optional CSS class added to the wrapper div */
    className?: string;
    brandingOverride?: ResolvedSellerBranding | null;
    dataSkinId?: string;
}

export function SellerBrandingModule({
    sellerAddress,
    children,
    className,
    brandingOverride,
    dataSkinId,
}: SellerBrandingModuleProps) {
    const { branding: resolvedBranding } = useSellerBranding(brandingOverride ? undefined : sellerAddress);
    const branding = brandingOverride ?? resolvedBranding;
    const containerRef = useRef<HTMLDivElement>(null);
    const styleElementRef = useRef<HTMLStyleElement | null>(null);

    // Set CSS custom properties from accentColor
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        if (branding?.branding.accentColor) {
            el.style.setProperty("--seller-accent", branding.branding.accentColor);
        } else {
            el.style.removeProperty("--seller-accent");
        }
    }, [branding?.branding.accentColor]);

    // Inject external CSS wrapped in @layer seller {}
    useEffect(() => {
        if (!branding?.cssURL) {
            // Clean up previous style element
            if (styleElementRef.current) {
                styleElementRef.current.remove();
                styleElementRef.current = null;
            }
            return;
        }

        let cancelled = false;
        const url = branding.cssURL;

        fetch(url)
            .then((res) => {
                if (!res.ok) throw new Error(`CSS fetch failed: ${res.status}`);
                return res.text();
            })
            .then((cssText) => {
                if (cancelled) return;

                // RA-1: Sanitise seller CSS to prevent data exfiltration and injection.
                // Strip url(), @import, expression(), -moz-binding — these can load
                // external resources or execute code.  The @layer wrapper only
                // controls cascade priority, not what the CSS can do.
                const sanitized = cssText
                    .replace(/@import\b[^;]*;/gi, "/* @import removed */")
                    .replace(/expression\s*\(/gi, "/* expression removed */")
                    .replace(/-moz-binding\s*:/gi, "/* -moz-binding removed */")
                    .replace(/url\s*\(/gi, "/* url( removed */");

                // Wrap in cascade layer so seller CSS cannot override protocol styles
                const wrapped = `@layer seller {\n${sanitized}\n}`;

                // Reuse or create style element
                if (styleElementRef.current) {
                    styleElementRef.current.setAttribute(
                        "data-seller-branding",
                        dataSkinId ?? sellerAddress ?? "unknown",
                    );
                    styleElementRef.current.textContent = wrapped;
                } else {
                    const style = document.createElement("style");
                    style.setAttribute("data-seller-branding", dataSkinId ?? sellerAddress ?? "unknown");
                    style.textContent = wrapped;
                    document.head.appendChild(style);
                    styleElementRef.current = style;
                }
            })
            .catch(() => {
                // Silently fail — seller CSS is cosmetic, not critical
            });

        return () => {
            cancelled = true;
        };
    }, [branding?.cssURL, dataSkinId, sellerAddress]);

    // Clean up style element on unmount
    useEffect(() => {
        return () => {
            if (styleElementRef.current) {
                styleElementRef.current.remove();
                styleElementRef.current = null;
            }
        };
    }, []);

    const themeClass = branding?.branding.themeClass ?? "";
    const classes = [className, themeClass].filter(Boolean).join(" ");

    return (
        <div ref={containerRef} className={classes || undefined} data-skin={dataSkinId || undefined}>
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
        const accent = branding?.branding.accentColor ?? "#6b7280";
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
