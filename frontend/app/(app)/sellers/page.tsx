import type { Metadata } from "next";
import { SellerLanding } from "@/components/sellers/SellerLanding";

export const metadata: Metadata = {
    title: "Sellers — Figaro Protocol",
    description: "Register a wallet in SellerRegistry, or manage your existing registration. Wallets without a registration see the wizard; registered wallets see the dashboard.",
};

export default function SellersPage() {
    return <SellerLanding />;
}
