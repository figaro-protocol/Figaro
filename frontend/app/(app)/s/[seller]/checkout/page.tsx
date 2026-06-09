import type { Metadata } from "next";
import { CheckoutView } from "./_components/CheckoutView";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
    title: "Checkout — Figaro",
    description: "Review your cart and place a bonded order with a seller.",
};

interface Props {
    params: { seller: string };
}

export default function CheckoutPage({ params }: Props) {
    return <CheckoutView sellerAddress={params.seller} />;
}
