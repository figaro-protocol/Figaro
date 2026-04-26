/**
 * components/modules/MerchantBrandingModule.tsx
 *
 * Scoped CSS and branding injection for merchant-themed UI regions.
 *
 * Three responsibilities:
 * 1. Set CSS custom properties from the merchant's accentColor
 * 2. Inject external CSS from the merchant's assets.cssURI, wrapped in
 *    @layer merchant {} so it cannot override protocol-critical styles
 * 3. Apply the merchant's themeClass to the container
 *
 * Usage:
 *   <MerchantBrandingModule sellerAddress={address}>
 *     <RestaurantCard ... />
 *   </MerchantBrandingModule>
 */
"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useMerchantBranding } from "@/lib/mechanisms/useMerchantBranding";
import type { ResolvedMerchantBranding } from "@/lib/shared/merchantBranding";

interface MerchantBrandingModuleProps {
    sellerAddress: `0x${string}` | undefined;
    children: ReactNode;
    /** Optional CSS class added to the wrapper div */
    className?: string;
    brandingOverride?: ResolvedMerchantBranding | null;
    dataSkinId?: string;
}

export function MerchantBrandingModule({
    sellerAddress,
    children,
    className,
    brandingOverride,
    dataSkinId,
}: MerchantBrandingModuleProps) {
    const { branding: resolvedBranding } = useMerchantBranding(brandingOverride ? undefined : sellerAddress);
    const branding = brandingOverride ?? resolvedBranding;
    const containerRef = useRef<HTMLDivElement>(null);
    const styleElementRef = useRef<HTMLStyleElement | null>(null);

    // Set CSS custom properties from accentColor
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;

        if (branding?.branding.accentColor) {
            el.style.setProperty("--merchant-accent", branding.branding.accentColor);
        } else {
            el.style.removeProperty("--merchant-accent");
        }
    }, [branding?.branding.accentColor]);

    // Inject external CSS wrapped in @layer merchant {}
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

                // RA-1: Sanitise merchant CSS to prevent data exfiltration and injection.
                // Strip url(), @import, expression(), -moz-binding — these can load
                // external resources or execute code.  The @layer wrapper only
                // controls cascade priority, not what the CSS can do.
                const sanitized = cssText
                    .replace(/@import\b[^;]*;/gi, "/* @import removed */")
                    .replace(/expression\s*\(/gi, "/* expression removed */")
                    .replace(/-moz-binding\s*:/gi, "/* -moz-binding removed */")
                    .replace(/url\s*\(/gi, "/* url( removed */");

                // Wrap in cascade layer so merchant CSS cannot override protocol styles
                const wrapped = `@layer merchant {\n${sanitized}\n}`;

                // Reuse or create style element
                if (styleElementRef.current) {
                    styleElementRef.current.setAttribute(
                        "data-merchant-branding",
                        dataSkinId ?? sellerAddress ?? "unknown",
                    );
                    styleElementRef.current.textContent = wrapped;
                } else {
                    const style = document.createElement("style");
                    style.setAttribute("data-merchant-branding", dataSkinId ?? sellerAddress ?? "unknown");
                    style.textContent = wrapped;
                    document.head.appendChild(style);
                    styleElementRef.current = style;
                }
            })
            .catch(() => {
                // Silently fail — merchant CSS is cosmetic, not critical
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
 * MerchantLogo — renders the merchant's logo from IPFS/HTTP,
 * with an emoji fallback.
 */
interface MerchantLogoProps {
    sellerAddress: `0x${string}` | undefined;
    fallbackEmoji?: string;
    className?: string;
    size?: number;
    brandingOverride?: ResolvedMerchantBranding | null;
}

export function MerchantLogo({
    sellerAddress,
    fallbackEmoji = "🍽️",
    className,
    size = 48,
    brandingOverride,
}: MerchantLogoProps) {
    const { branding: resolvedBranding, isLoading } = useMerchantBranding(brandingOverride ? undefined : sellerAddress);
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
            // eslint-disable-next-line @next/next/no-img-element -- Merchant branding uses arbitrary IPFS/HTTP assets with runtime fallback handling.
            <img
                src={logoURL}
                alt="Merchant logo"
                width={size}
                height={size}
                className={className}
                style={{ objectFit: "cover" }}
                onError={() => setImageFailed(true)}
            />
        );
    }

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
