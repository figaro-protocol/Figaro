import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";

// The page is a client component ("use client" — the slug rides in a query
// param read client-side), so its metadata rides on this pass-through layout:
// the one static-export-compatible home for a client page's own og card.
export const metadata: Metadata = withOg({
    title: "Assembly — Figaro Protocol",
    description:
        "Read-only inspection of an assembly — a local draft or one published on-chain.",
});

export default function ViewAssemblyLayout({ children }: { children: React.ReactNode }) {
    return children;
}
