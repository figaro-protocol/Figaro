import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";

// The page is a client component ("use client" — the processId rides in a
// query param read client-side), so its metadata rides on this pass-through
// layout: the one static-export-compatible home for a client page's own og
// card.
export const metadata: Metadata = withOg({
    title: "Order status — Figaro Protocol",
    description:
        "Live status of one bonded process: the lifecycle timeline read from chain and IPFS.",
});

export default function OrderViewLayout({ children }: { children: React.ReactNode }) {
    return children;
}
