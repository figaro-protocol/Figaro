import type { Metadata } from "next";
import { Suspense } from "react";
import { withOg } from "@/lib/shared/pageMetadata";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { AssembliesShowcase } from "./_components/AssembliesShowcase";

// The users' side of the assemblies: served at /assemblies on the app host
// (the builders' host serves the registry page there). Everything below the
// hero is read from the registries as the page opens — see AssembliesShowcase.
export const metadata: Metadata = withOg({
    title: "Assemblies — Figaro Protocol",
    description:
        "What you can trade on Figaro: every assembly a designer has published, what each is for, who offers it, and the questions its designer answers — read from the registry as the page opens.",
});

export default function AssembliesForUsers() {
    return (
        <>
            <MarketingHero
                title="What you can trade."
                lead={
                    <>
                        An assembly is a design for one kind of trade: who does what, in what order, under which terms. Designers publish them; sellers bind to them; you pick one and order. Every published assembly is below, read from the registry as this page opens.
                    </>
                }
            />
            <Suspense fallback={null}>
                <AssembliesShowcase />
            </Suspense>
        </>
    );
}
