import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";


// The three faces are self-hosted from app/fonts (the latin variable slices,
// each beside its OFL text), so a build fetches nothing: a Google-served font
// is fetched at build time, one file per unicode-range slice, and one timeout
// among those requests fails the export.
const inter = localFont({
    src: [{ path: "./fonts/Inter-latin.woff2", weight: "100 900", style: "normal" }],
    variable: "--font-inter",
    display: "swap",
});

const notoSansJP = localFont({
    src: [{ path: "./fonts/NotoSansJP-latin.woff2", weight: "100 900", style: "normal" }],
    variable: "--font-noto-sans-jp",
    display: "swap",
});

const jetbrainsMono = localFont({
    src: [
        { path: "./fonts/JetBrainsMono-latin.woff2", weight: "100 800", style: "normal" },
        { path: "./fonts/JetBrainsMono-latin-italic.woff2", weight: "100 800", style: "italic" },
    ],
    variable: "--font-jetbrains-mono",
    display: "swap",
});

export const viewport: Viewport = {
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",
};

// The link-preview (Open Graph/Twitter) copy derives VERBATIM from home's
// audited hero + metadata (the frame's synthesis) — when home's copy moves,
// this block moves with it. metadataBase reuses NEXT_PUBLIC_SITE_URL exactly
// as `app/sitemap.ts` does (same var, same placeholder fallback): the
// deploying host names itself; unset builds resolve preview URLs against the
// stable placeholder instead of a localhost default.
export const metadata: Metadata = {
    metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") || "https://figaro.example"),
    title: "Figaro Protocol — The Figaro Ecosystem",
    description: "Every trade runs as a value-added process that enforces itself: each party locks a bond worth more than cheating could gain, the data it leaves is public in aggregate and the parties' own in detail, and the profit stays with the hands that made it.",
    robots: {
        index: false,
        follow: false,
    },
    openGraph: {
        title: "The Figaro Ecosystem",
        description: "Every trade runs as a value-added process that enforces itself: each party locks a bond worth more than cheating could gain, the data it leaves is public in aggregate and the parties' own in detail, and the profit stays with the hands that made it.",
        siteName: "Figaro Protocol",
        type: "website",
    },
    twitter: {
        card: "summary_large_image",
        title: "The Figaro Ecosystem",
        description: "Every trade runs as a value-added process that enforces itself: each party locks a bond worth more than cheating could gain, the data it leaves is public in aggregate and the parties' own in detail, and the profit stays with the hands that made it.",
    },
};

/**
 * Root layout — bare HTML shell only. Per-tier chrome (Header, Footer,
 * Providers) lives in `app/(marketing)/layout.tsx` and `app/(app)/layout.tsx`.
 * Marketing routes don't mount the wallet provider; reference + transactional
 * routes do. See CLAUDE.md "Wallet-provider scope per route".
 */
export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html
            lang="en"
            className={`${inter.variable} ${notoSansJP.variable} ${jetbrainsMono.variable}`}
        >
            <body>
                <a
                    href="#main-content"
                    className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:bg-ink-primary focus:text-paper focus:px-4 focus:py-2 focus:rounded"
                >
                    Skip to content
                </a>

                <ErrorBoundary>{children}</ErrorBoundary>
            </body>
        </html>
    );
}
