import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";

// The page is a client component ("use client" — the draft slug rides in a
// query param read client-side), so its metadata rides on this pass-through
// layout: the one static-export-compatible home for a client page's own og
// card.
export const metadata: Metadata = withOg({
    title: "Edit assembly — Figaro Protocol",
    description:
        "Topology canvas for editing a saved assembly draft. Drafts persist in local storage.",
});

export default function EditAssemblyLayout({ children }: { children: React.ReactNode }) {
    return children;
}
