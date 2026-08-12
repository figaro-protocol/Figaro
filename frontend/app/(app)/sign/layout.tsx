import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";

// The page is a client component ("use client" — it reads the shared payload
// client-side), so its metadata rides on this pass-through layout: the one
// static-export-compatible home for a client page's own og card.
export const metadata: Metadata = withOg({
    title: "Counter-sign — Figaro Protocol",
    description:
        "Paste a shared commitment payload, review its terms, counter-sign with your wallet, and broadcast the fully-signed commitment.",
});

export default function SignLayout({ children }: { children: React.ReactNode }) {
    return children;
}
