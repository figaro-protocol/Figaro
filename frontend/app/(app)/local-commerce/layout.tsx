import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Figaro Local Commerce — Reference Implementation | Figaro Protocol",
    description: "A local-commerce workflow built on Figaro Protocol end to end. Generic across food, retail, and services. Both parties lock stakes before work begins. Breaking the agreement always costs more than keeping it. No intermediary needed.",
    openGraph: {
        title: "Figaro Local Commerce — Reference Implementation",
        description: "A local-commerce workflow built on Figaro Protocol end to end. A working example of the full trade coordination stack across food, retail, and services.",
        type: "website",
    },
    twitter: {
        card: "summary_large_image",
        title: "Figaro Local Commerce — Reference Implementation",
        description: "A local-commerce workflow built on Figaro Protocol end to end. Both parties lock stakes. No intermediary needed.",
    },
};

export default function LocalCommerceLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <>{children}</>;
}
