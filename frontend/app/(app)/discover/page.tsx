import type { Metadata } from "next";
import Link from "next/link";
import { MemberDiscovery } from "./_components/MemberDiscovery";

export const metadata: Metadata = {
    title: "Discover members — Figaro Protocol",
    description:
        "Browse bonded sellers across the Figaro ecosystem. Filter by your location, search by name, pick an assembly. Click a seller to open their assembly's runtime and start a bonded commitment.",
};

export default function DiscoverPage() {
    return (
        <section className="container mx-auto px-6 pt-16 pb-24 max-w-5xl">
            <h1 className="text-4xl sm:text-5xl font-bold text-black leading-tight tracking-tight mb-3">
                Bonded sellers on this network.
            </h1>
            <p className="text-sm text-gray-500 mb-4">
                Browsing as a buyer &mdash; to offer something instead, register on{" "}
                <Link href="/members" className="underline hover:text-black">/sellers</Link>.
            </p>
            <p className="text-base text-gray-600 leading-relaxed max-w-2xl mb-10">
                Everyone here is someone you can order from directly &mdash; a
                kitchen, a tailor, a courier, a service &mdash; each running its
                own wallet, with no company in between. Nothing near you yet?
                That is expected this early: the registry fills as sellers join,
                and this page is where they appear. Once it has sellers, you
                filter by what is close to you, pick one, and place a bonded
                order &mdash; locking your stake against the deal while the seller
                locks theirs to accept.
            </p>
            <p className="text-sm text-gray-500 mb-10">
                New to this? <Link href="/members" className="underline hover:text-black">See what membership is</Link>, or read{" "}
                <Link href="/local-commerce" className="underline hover:text-black">one deal, lived</Link> end to end.
            </p>
            <MemberDiscovery />
        </section>
    );
}
