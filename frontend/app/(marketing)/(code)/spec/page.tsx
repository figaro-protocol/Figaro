import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingSection } from "@/components/marketing/MarketingSection";

// One-screen marketing door: the hero states what the surface is; the full
// catalogue (every contract with its ABI and install, the clause and agreement
// model, the per-chain deployment records with the tamper-check recipe, and
// every named revert) lives once in the builder documentation at
// /docs/protocol/contracts. Point to it, never fork it.
export const metadata: Metadata = withOg({
    title: "Specifications — Figaro Protocol",
    description:
        "The canonical protocol surface — every contract, its install, the per-chain deployments, and every named revert — in the builder documentation.",
});

export default function Spec() {
    return (
        <>
            <MarketingHero
                title="The canonical surface."
                lead={
                    <>
                        Every contract is a permissionless primitive. No contract belongs to a dapp. Solidity 0.8.26. MIT, at{" "}
                        <a href="https://github.com/figaro-protocol/Figaro" target="_blank" rel="noopener noreferrer" className="underline">figaro-protocol/Figaro</a>.
                    </>
                }
            />

            <MarketingSection title="The contract catalogue.">
                <p className="text-sm text-ink-body leading-relaxed">
                    Every contract with its ABI and install, the clause and agreement model, the per-chain deployment records, and every named revert an integrator can hit are in the <a href="/docs/protocol/contracts/" className="text-ink-heading font-medium hover:underline">builder documentation</a>.
                </p>
            </MarketingSection>
        </>
    );
}
