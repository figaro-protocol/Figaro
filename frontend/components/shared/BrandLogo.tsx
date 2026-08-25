import Link from "next/link";

interface BrandLogoProps {
    /** Variant: "compact" for nav (no "Protocol" word), "full" with "Protocol" suffix. */
    variant?: "full" | "compact";
    /** Color hint for the text — defaults to black. */
    tone?: "black" | "white";
    /** Whether the logo links to `/`. Defaults to true. */
    asLink?: boolean;
}

/**
 * Canonical Figaro lockup: `Figaro` + ® superscript + (optional) `Protocol`.
 * Used in both Header.tsx and MarketingHeader.tsx (and inside MobileNav).
 * The ® reflects the registered trademark status of "Figaro."
 */
export function BrandLogo({ variant = "full", tone = "black", asLink = true }: BrandLogoProps) {
    const colorClass = tone === "white" ? "text-paper" : "text-ink-heading";

    const inner = (
        <span className={`text-xl md:text-2xl font-bold ${colorClass}`}>
            Figaro
            <span className="align-super text-xs ml-1" aria-label="registered trademark">
                ®
            </span>
            {variant === "full" && " Protocol"}
        </span>
    );

    if (!asLink) return inner;
    return (
        <Link href="/" className="flex items-center gap-2 hover:no-underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-focus rounded">
            {inner}
        </Link>
    );
}
