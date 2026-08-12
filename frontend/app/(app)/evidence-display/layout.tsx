import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";

// The page is a client component ("use client" — every parameter rides in the
// forum-composed query string, read client-side), so its metadata rides on
// this pass-through layout: the one static-export-compatible home for a
// client page's own og card.
export const metadata: Metadata = withOg({
    title: "Process evidence — Figaro Protocol",
    description:
        "A forum-agnostic reader of a Figaro process's on-chain evidence timeline — embeddable by any arbitration forum, standalone by URL.",
});

export default function EvidenceDisplayLayout({ children }: { children: React.ReactNode }) {
    return children;
}
