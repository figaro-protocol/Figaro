import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import Link from "next/link";
import { MemberDiscovery } from "./_components/MemberDiscovery";

export const metadata: Metadata = withOg({
    title: "Discover members — Figaro Protocol",
    description:
        "Browse members — buyers and sellers — across the Figaro ecosystem. Filter by your location, search by name, pick an assembly. Click a member to open their assembly's runtime and start a bonded commitment.",
});

export default function DiscoverPage() {
    return (
        <section className="container mx-auto px-6 pt-16 pb-24 max-w-5xl">
            <h1 className="text-4xl sm:text-5xl font-bold text-black leading-tight tracking-tight mb-3">
                Members on this network.
            </h1>
            <p className="text-sm text-gray-500 mb-4">
                Buyers and sellers alike publish a profile here &mdash; to appear yourself, register on{" "}
                <Link href="/members" className="underline hover:text-black">/members</Link>.
            </p>
            <p className="text-base text-gray-600 leading-relaxed max-w-2xl mb-10">
                Everyone here is someone you can order from directly &mdash; a
                kitchen, a tailor, a courier, a service &mdash; each running its
                own wallet, with no company in between. Nothing near you?
                The registry fills as members join, and this page is where
                they appear &mdash; it reads the chain live, never a curated
                list. You filter by what is close to you, pick one, and place a bonded
                order &mdash; a single commit, signed by both of you, locks
                both stakes at once.
            </p>
            <p className="text-sm text-gray-500 mb-10">
                New to this? <Link href="/members" className="underline hover:text-black">See what membership is</Link>, or read{" "}
                <Link href="/local-commerce" className="underline hover:text-black">one deal, lived</Link> end to end.
            </p>
            <MemberDiscovery />
        </section>
    );
}
