"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { SellerDetailView } from "./_components/SellerDetailView";

/**
 * /s/view?seller=<address> — browse a seller's catalogue and place a bonded
 * order.
 *
 * The seller address is an open-world id (any wallet), so it rides in a query
 * param read client-side; the page prerenders to a static shell and hydrates
 * against chain + IPFS. See `docs/FRONTEND.md` § "Static export".
 */
function SellerViewContent() {
    const searchParams = useSearchParams();
    const seller = searchParams.get("seller");

    if (!seller) {
        return (
            <div className="container mx-auto px-6 py-12">
                <p className="text-sm text-ink-muted">No seller address in URL.</p>
            </div>
        );
    }

    return <SellerDetailView sellerAddress={seller} />;
}

export default function SellerPage() {
    return (
        <Suspense
            fallback={
                <div className="container mx-auto px-6 py-12">
                    <p className="text-sm text-ink-muted">Loading seller…</p>
                </div>
            }
        >
            <SellerViewContent />
        </Suspense>
    );
}
