import type { Metadata, Viewport } from "next";
import { Inter, Noto_Sans_JP, JetBrains_Mono } from "next/font/google";
import "./globals.css";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";


const inter = Inter({
    subsets: ["latin"],
    variable: "--font-inter",
    display: "swap",
});

const notoSansJP = Noto_Sans_JP({
    subsets: ["latin"],
    variable: "--font-noto-sans-jp",
    display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
    subsets: ["latin"],
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
    title: "Figaro Protocol — Figaro completes the contract.",
    description: "From guilds to banks to platforms, every economic system has fought over who enforces a deal and who keeps the profit. Figaro answers differently: deals rarely need an enforcer at all, the market's map is public, your details are yours, the people in each deal decide the split.",
    robots: {
        index: false,
        follow: false,
    },
    openGraph: {
        title: "Figaro completes the contract.",
        description: "From guilds to banks to platforms, every economic system has fought over who enforces a deal and who keeps the profit. Figaro answers differently: deals rarely need an enforcer at all, the market's map is public, your details are yours, the people in each deal decide the split.",
        siteName: "Figaro Protocol",
        type: "website",
    },
    twitter: {
        card: "summary_large_image",
        title: "Figaro completes the contract.",
        description: "From guilds to banks to platforms, every economic system has fought over who enforces a deal and who keeps the profit. Figaro answers differently: deals rarely need an enforcer at all, the market's map is public, your details are yours, the people in each deal decide the split.",
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
                    className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:bg-black focus:text-white focus:px-4 focus:py-2 focus:rounded"
                >
                    Skip to content
                </a>

                <ErrorBoundary>{children}</ErrorBoundary>
            </body>
        </html>
    );
}
