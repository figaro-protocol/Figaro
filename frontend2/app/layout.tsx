import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { Providers } from "./providers";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { Header } from "@/components/shared/Header";
import { Footer } from "@/components/shared/Footer";


const inter = Inter({ subsets: ["latin"] });

export const viewport: Viewport = {
    width: "device-width",
    initialScale: 1,
    viewportFit: "cover",
};

export const metadata: Metadata = {
    title: "Figaro Protocol — Trade Infrastructure",
    description: "Figaro is a protocol primitive for trade between strangers. Both parties lock stakes before work begins. Breaking the agreement always costs more than keeping it. No intermediary needed.",
    robots: {
        index: false,
        follow: false,
    },
    openGraph: {
        title: "Figaro Protocol — Trade Infrastructure",
        description: "Figaro is a protocol primitive for trade between strangers. Both parties lock stakes before work begins. Breaking the agreement always costs more than keeping it. No intermediary needed.",
        siteName: "Figaro Protocol",
        type: "website",
    },
    twitter: {
        card: "summary_large_image",
        title: "Figaro Protocol — Trade Infrastructure",
        description: "Figaro is a protocol primitive for trade between strangers. Both parties lock stakes before work begins. Breaking the agreement always costs more than keeping it. No intermediary needed.",
    },
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html lang="en">
            <body className={inter.className}>
                <a
                    href="#main-content"
                    className="sr-only focus:not-sr-only focus:fixed focus:top-2 focus:left-2 focus:z-[100] focus:bg-black focus:text-white focus:px-4 focus:py-2 focus:rounded"
                >
                    Skip to content
                </a>

                <ErrorBoundary>
                    <Providers>
                        <div className="min-h-screen flex flex-col bg-white text-black">
                            <Header />
                            <main id="main-content" className="flex-1">{children}</main>
                            <Footer />
                        </div>
                    </Providers>
                </ErrorBoundary>
            </body>
        </html>
    );
}
