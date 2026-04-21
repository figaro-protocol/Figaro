import type { Metadata } from "next";
import { Footer } from "@/components/shared/Footer";
import { Header } from "@/components/shared/Header";

export const metadata: Metadata = {
    title: "Build on Figaro — Trade Infrastructure",
    description: "Design a trade workflow from protocol components. The protocol handles enforcement. Three levels of composition — no new contract risk required at Level 1.",
    openGraph: {
        title: "Build on Figaro Protocol",
        description: "Design a trade workflow from protocol components. The protocol handles enforcement.",
        type: "website",
    },
    twitter: {
        card: "summary_large_image",
        title: "Build on Figaro Protocol",
        description: "Design a trade workflow from protocol components. The protocol handles enforcement.",
    },
};

export default function BuildersLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return (
        <main className="min-h-screen bg-white">
            <Header />
            {children}
            <Footer />
        </main>
    );
}
