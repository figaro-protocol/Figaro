import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";

// The page is a client component ("use client" — the seller address rides in
// a query param read client-side), so its metadata rides on this pass-through
// layout: the one static-export-compatible home for a client page's own og
// card.
export const metadata: Metadata = withOg({
    title: "Member catalogue — Figaro Protocol",
    description:
        "Browse a member's published catalogue and place a bonded order.",
});

export default function MemberViewLayout({ children }: { children: React.ReactNode }) {
    return children;
}
