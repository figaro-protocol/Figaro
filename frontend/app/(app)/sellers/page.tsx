import type { Metadata } from "next";
import Link from "next/link";
import { SellerLanding } from "@/components/sellers/SellerLanding";

export const metadata: Metadata = {
    title: "Sellers — Figaro Protocol",
    description: "Register a wallet in MembersRegistry, or manage your existing registration. Unregistered wallets see the onboarding wizard; registered wallets see their profile view/edit dashboard with the wizard still one click away.",
};

export default function SellersPage() {
    return (
        <>
            <p className="text-sm text-ink-faint mb-4">
                Registering as a seller &mdash; to browse and order instead, visit{" "}
                <Link href="/discover" className="underline">/discover</Link>.
            </p>
            <p className="text-base text-ink-body leading-relaxed mb-6">
                Register a wallet here and it becomes a seller on the network &mdash; a kitchen, a tailor, a courier, anyone with something to offer &mdash; discoverable by any buyer, with no application and no one to say yes. The network is early, pre-launch: registering now sets up your listing so it is ready the moment buyers can order.
            </p>
            <p className="text-sm text-ink-faint leading-relaxed mb-6">
                For agents: the seller listing derives from the live <code>MembersRegistry</code> and can be reconstructed programmatically with <code>reconstructDiscovery()</code> from <code>@figaro/sdk</code> &mdash; see <Link href="/integrate" className="underline">Integrate</Link> for the deployment record.
            </p>
            <SellerLanding />
        </>
    );
}
