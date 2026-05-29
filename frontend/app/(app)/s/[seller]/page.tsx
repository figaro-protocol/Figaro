import type { Metadata } from "next";
import { SellerDetailView } from "./_components/SellerDetailView";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
    title: "Seller — Figaro",
    description: "Browse a seller's catalogue and place a bonded order.",
};

interface Props {
    params: { seller: string };
}

export default function SellerPage({ params }: Props) {
    return <SellerDetailView sellerAddress={params.seller} />;
}
