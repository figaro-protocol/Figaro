import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";

// The page is a client component ("use client" — the seller address rides in
// a query param read client-side), so its metadata rides on this pass-through
// layout: the one static-export-compatible home for a client page's own og
// card.
export const metadata: Metadata = withOg({
    title: "Checkout — Figaro Protocol",
    description:
        "Review the cart, sign the commitment, and bond the order.",
});

export default function CheckoutLayout({ children }: { children: React.ReactNode }) {
    return children;
}
