import type { Metadata } from "next";
import { OG_IMAGE } from "@/lib/shared/pageMetadata";

export const metadata: Metadata = {
    title: "Local Commerce — Figaro Protocol",
    description: "One trade on Figaro Protocol, lived end to end — a delivered meal among unbounded kinds of trade, with the same shape across retail and services. Both parties lock stakes before work begins, and breaking the agreement always costs more than keeping it. No company sits in the middle, because the deal secures itself.",
    openGraph: {
        title: "Figaro Local Commerce",
        description: "One deal on Figaro Protocol, lived end to end — a delivered meal among unbounded kinds of trade, with the same shape across retail and services.",
        type: "website",
        siteName: "Figaro Protocol",
        images: [OG_IMAGE],
    },
    twitter: {
        card: "summary_large_image",
        title: "Figaro Local Commerce",
        description: "One trade on Figaro Protocol, lived end to end. Both parties lock stakes before work begins; no company sits in the middle, because the trade secures itself.",
        images: [OG_IMAGE.url],
    },
};

export default function LocalCommerceLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <>{children}</>;
}
