import type { Metadata } from "next";
import { OperatorDiscovery } from "@/components/core/discover/OperatorDiscovery";

export const metadata: Metadata = {
    title: "Discover operators — Figaro Protocol",
    description:
        "Browse bonded operators across the Figaro ecosystem. Filter by your location, search by name, pick an assembly. Click an operator to open their assembly's runtime and start a bonded commitment.",
};

export default function DiscoverPage() {
    return (
        <section className="container mx-auto px-6 pt-16 pb-24 max-w-5xl">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-3">
                Discover
            </p>
            <h1 className="text-4xl sm:text-5xl font-bold text-black leading-tight tracking-tight mb-3">
                Bonded operators on this network.
            </h1>
            <p className="text-base text-gray-600 leading-relaxed max-w-2xl mb-10">
                Each operator is a wallet that has registered itself in the
                <code className="mx-1">OperatorRegistry</code> with a role, a
                metadata URI, and one or more assembly bindings. Click an
                operator to open their assembly&apos;s runtime; you can then
                connect a wallet and commit a bonded order.
            </p>
            <OperatorDiscovery />
        </section>
    );
}
