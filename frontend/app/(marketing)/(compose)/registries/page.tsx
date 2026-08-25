import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { withOg } from "@/lib/shared/pageMetadata";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { RegistryExplorer } from "@/components/registries/RegistryExplorer";

// The registry explorer — the ONE reads-only search surface over the three
// protocol registries (maintainer ruling 2026-08-17). The concept pages
// (/clauses, /assemblies, /members) keep the pitch plus a live count and a
// link here; this page carries the inventories, searchable and faceted.
// The nav label derives from this title ("Registries"); the h1 is the
// ruled page name ("Registry explorer").
export const metadata: Metadata = withOg({
    title: "Registries — Figaro Protocol",
    description:
        "Search what is registered on the network: every clause, assembly, and member, read live from the three registries' event streams and IPFS — faceted by article, registeredBy, composed clause, and live stake. Nothing bundled, nothing ranked.",
});

export default function Registries() {
    return (
        <>
            <MarketingHero
                title="Registry explorer."
                lead={
                    <>
                        Every clause, assembly, and member registered on the network this site
                        reads &mdash; each row an on-chain registration with a live stake, its
                        content fetched from IPFS. Search, facet, sort; nothing here is a
                        bundled roster, and nothing is ranked by use. This lists every
                        registration, including wallets offering nothing; ordering happens on{" "}
                        <Link href="/discover" className="underline">Discover</Link>.
                    </>
                }
            />
            <section className="container mx-auto px-6 pb-24 max-w-3xl">
                <Suspense fallback={<p className="text-sm text-ink-muted">Reading the registry&hellip;</p>}>
                    <RegistryExplorer />
                </Suspense>
            </section>
        </>
    );
}
