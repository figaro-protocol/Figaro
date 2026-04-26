import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Figaro Eats — Reference Implementation | Figaro Protocol",
    description: "A food delivery workflow built on Figaro Protocol end to end. Both parties lock stakes before work begins. Breaking the agreement always costs more than keeping it. No intermediary needed.",
    openGraph: {
        title: "Figaro Eats — Reference Implementation",
        description: "A food delivery workflow built on Figaro Protocol end to end. A working example of the full trade coordination stack.",
        type: "website",
    },
    twitter: {
        card: "summary_large_image",
        title: "Figaro Eats — Reference Implementation",
        description: "A food delivery workflow built on Figaro Protocol end to end. Both parties lock stakes. No intermediary needed.",
    },
};

export default function FigaroEatsLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <>{children}</>;
}
