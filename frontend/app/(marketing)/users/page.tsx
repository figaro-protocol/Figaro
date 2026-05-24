import type { Metadata } from "next";
import Link from "next/link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingSection } from "@/components/marketing/MarketingSection";

export const metadata: Metadata = {
    title: "Users — Figaro Protocol",
    description:
        "Two paths into the protocol: buy something, or offer something. The kernel knows exactly two roles — buyer and seller — and the participation surface mirrors that.",
};

export default function Users() {
    return (
        <>
            <MarketingHero
                title="Trade directly with anyone."
                lead={
                    <>
                        Two paths into the protocol: buy something, or offer something. The kernel knows exactly two roles &mdash; buyer and seller &mdash; and the participation surface mirrors that.
                    </>
                }
            />

            <MarketingSection title="Two paths." bottomPad="wide">
                <div className="space-y-10">
                    <div>
                        <h3 className="text-heading-h3 text-ink-heading">Discover</h3>
                        <p className="text-base text-ink-body leading-relaxed mt-2 mb-4">
                            Browse the operators currently on the registry, pick a counterparty, place a bonded order. You hold the buyer role; the seller is whoever you transact with.
                        </p>
                        <Link href="/discover" className="text-ink-heading font-medium hover:underline">
                            Open the registry &rarr;
                        </Link>
                    </div>
                    <div>
                        <h3 className="text-heading-h3 text-ink-heading">Join as an operator</h3>
                        <p className="text-base text-ink-body leading-relaxed mt-2 mb-4">
                            Register an identity, declare a catalogue, set accepted tokens. Buyers find you through the registry; you hold the seller role on every deal that comes through.
                        </p>
                        <Link href="/operators" className="text-ink-heading font-medium hover:underline">
                            Operator onboarding &rarr;
                        </Link>
                    </div>
                </div>
            </MarketingSection>
        </>
    );
}
