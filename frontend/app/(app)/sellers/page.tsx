import type { Metadata } from "next";
import { SellerLanding } from "@/components/sellers/SellerLanding";

export const metadata: Metadata = {
    title: "Sellers — Figaro Protocol",
    description: "Register a wallet in SellerRegistry, or manage your existing registration. Unregistered wallets see the onboarding wizard; registered wallets see their profile view/edit dashboard with the wizard still one click away.",
};

export default function SellersPage() {
    return <SellerLanding />;
}
