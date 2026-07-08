import type { Metadata } from "next";
import { SellerDiscovery } from "./_components/SellerDiscovery";

export const metadata: Metadata = {
    title: "Discover sellers — Figaro Protocol",
    description:
        "Browse bonded sellers across the Figaro ecosystem. Filter by your location, search by name, pick an assembly. Click a seller to open their assembly's runtime and start a bonded commitment.",
};

export default function DiscoverPage() {
    return (
        <section className="container mx-auto px-6 pt-16 pb-24 max-w-5xl">
            <h1 className="text-4xl sm:text-5xl font-bold text-black leading-tight tracking-tight mb-3">
                Bonded sellers on this network.
            </h1>
            <p className="text-base text-gray-600 leading-relaxed max-w-2xl mb-10">
                A seller is the agent &mdash; a person or a service &mdash;
                that registers and controls a wallet on its asset&apos;s behalf.
                The wallet is the on-chain representation: an entry in
                <code className="mx-1">SellerRegistry</code> carrying a metadata
                URI and one or more assembly bindings. Click a seller to open
                their assembly&apos;s runtime; you can then connect a wallet and
                commit a bonded order.
            </p>
            <SellerDiscovery />
        </section>
    );
}
