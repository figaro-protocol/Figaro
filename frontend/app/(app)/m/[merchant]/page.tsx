import type { Metadata } from "next";
import { MerchantDetailView } from "@/components/core/m/MerchantDetailView";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
    title: "Merchant — Figaro",
    description: "Browse a merchant's catalogue and place a bonded order.",
};

interface Props {
    params: { merchant: string };
}

export default function MerchantPage({ params }: Props) {
    return <MerchantDetailView merchantAddress={params.merchant} />;
}
