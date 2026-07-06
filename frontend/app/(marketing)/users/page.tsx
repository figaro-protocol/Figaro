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

            <MarketingSection title="Two paths.">
                <div className="space-y-10">
                    <div>
                        <h3 className="text-heading-h3 text-ink-heading">Discover</h3>
                        <p className="text-base text-ink-body leading-relaxed mt-2 mb-4">
                            Browse the sellers currently on the registry, pick a counterparty, place a bonded order. You hold the buyer role; the seller is whoever you transact with.
                        </p>
                        <Link href="/discover" className="text-ink-heading font-medium hover:underline">
                            Open the registry &rarr;
                        </Link>
                    </div>
                    <div>
                        <h3 className="text-heading-h3 text-ink-heading">Join as a seller</h3>
                        <p className="text-base text-ink-body leading-relaxed mt-2 mb-4">
                            Register an identity, declare a catalogue, set accepted tokens. As a seller you run a wallet that represents your real-world asset or service &mdash; a kitchen, a vehicle, your labour. Buyers find you through the registry; the wallet takes the seller role on every deal that comes through.
                        </p>
                        <Link href="/sellers" className="text-ink-heading font-medium hover:underline">
                            Seller onboarding &rarr;
                        </Link>
                    </div>
                </div>
            </MarketingSection>

            <MarketingSection title="Before you commit.">
                <p className="text-base text-ink-body leading-relaxed">
                    Two questions sit under both paths: who holds the money while a deal is open, and what happens if the other party defects? The short answers are <em>no one</em> and <em>the defector loses more than the honest party, every time</em> &mdash; bonded against the kernel directly, no custodian, no escrow account. The longer answers, with every honest caveat, are at <Link href="/security" className="text-ink-heading font-medium hover:underline">security</Link>.
                </p>
            </MarketingSection>

            <MarketingSection title="Or run an agent." bottomPad="wide">
                <p className="text-base text-ink-body leading-relaxed mb-4">
                    Either path can be driven by software instead of a person. A buyer wallet or a seller wallet can be a script, an LLM, or a long-running service &mdash; the kernel does not distinguish. Same signatures, same bonds, same resolution.
                </p>
                <Link href="/agents" className="text-ink-heading font-medium hover:underline">
                    Agents &rarr;
                </Link>
            </MarketingSection>
        </>
    );
}
