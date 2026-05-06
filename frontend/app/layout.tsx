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

export const metadata: Metadata = {
    title: "Figaro Protocol — TCP/IP of Trade",
    description: "Bonded trade between strangers. A coordination protocol for parties who have never met — cooperation pays better than cheating. The deal resolves itself.",
    robots: {
        index: false,
        follow: false,
    },
    openGraph: {
        title: "Figaro Protocol — TCP/IP of Trade",
        description: "Bonded trade between strangers. A coordination protocol for parties who have never met — cooperation pays better than cheating. The deal resolves itself.",
        siteName: "Figaro Protocol",
        type: "website",
    },
    twitter: {
        card: "summary_large_image",
        title: "Figaro Protocol — TCP/IP of Trade",
        description: "Bonded trade between strangers. A coordination protocol for parties who have never met — cooperation pays better than cheating. The deal resolves itself.",
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
