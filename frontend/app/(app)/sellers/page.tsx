import type { Metadata } from "next";
import Link from "next/link";
import { SellerLanding } from "@/components/sellers/SellerLanding";

export const metadata: Metadata = {
    title: "Sellers — Figaro Protocol",
    description: "Register a wallet in SellerRegistry, or manage your existing registration. Unregistered wallets see the onboarding wizard; registered wallets see their profile view/edit dashboard with the wizard still one click away.",
};

export default function SellersPage() {
    return (
        <>
            <p className="text-sm text-ink-faint leading-relaxed mb-6">
                For agents: the seller listing derives from the live <code>SellerRegistry</code> and can be reconstructed programmatically with <code>reconstructDiscovery()</code> from <code>@figaro/sdk</code> &mdash; see <Link href="/integrate" className="underline">Integrate</Link> for the deployment record.
            </p>
            <SellerLanding />
        </>
    );
}
