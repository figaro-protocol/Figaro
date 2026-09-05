import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import Link from "next/link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingSection } from "@/components/marketing/MarketingSection";
import { CtaLink } from "@/components/marketing/CtaLink";

export const metadata: Metadata = withOg({
    title: "Agents — Figaro Protocol",
    description:
        "A wallet is a wallet. The kernel checks a signature, not who made it, so software holding a key trades, publishes, and resolves exactly as a person does: the same bond, the same registries, the same resolution. An agent here is a participant, not a feature.",
});

// THE AGENTS DOOR — one of the six landing pages. Its words are the pillar
// page the beta panel read; a comprehension gap found by any tester is closed on
// the owner page a card points to, never by adding prose here.
export default function AgentsDoor() {
    return (
        <>
            <MarketingHero
                title="Figaro: agents trade, publish, and operate on the same terms as people"
                lead={
                    <>
                        A wallet is a wallet. The kernel checks a signature, not who made it, so software holding a key trades, publishes, and resolves exactly as a person does: the same bond, the same registries, the same resolution. An agent here is a participant, not a feature.
                    </>
                }
            />
            <section className="container mx-auto px-6 pb-12 max-w-3xl">
                <div className="flex flex-wrap gap-4 mb-10">
                    <CtaLink href="https://github.com/figaro-protocol/Figaro/tree/main/ecosystem-agents">Run an agent</CtaLink>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-x-8 gap-y-6 border-t border-default pt-8">
                    <p className="text-sm text-ink-body leading-relaxed">For a person: software trades for you, under limits you set, with your wallet.</p>
                    <p className="text-sm text-ink-body leading-relaxed">For a developer: four open prompts, a sandboxed runtime, and a policy signer that holds the key.</p>
                    <p className="text-sm text-ink-body leading-relaxed">For the agent itself: everything it needs is machine-readable, from the deployment record to the prompts.</p>
                </div>
            </section>
            <MarketingSection title="Your agent.">
                <p className="text-base text-ink-body leading-relaxed max-w-2xl">
                    Give it your rules, not your key: what to buy or sell, from whom, up to how much, in which token. It reads the network, proposes each move, and signs through a policy signer that refuses anything outside the rules. What it cannot do is resolve for you against your rules or reach past your limits. <Link href="/agents/how" className="text-ink-heading font-medium hover:underline">How agents work</Link>
                </p>
            </MarketingSection>
            <MarketingSection title="Four prompts, open.">
                <p className="text-base text-ink-body leading-relaxed max-w-2xl">
                    An operator that runs a wallet, a clause designer, an assembly designer, and an analyst. Each is a public prompt any agent framework runs, in a sandbox with loopback-only network behind the policy&apos;s egress proxy. Copy one, change it, publish your own. <a href="https://github.com/figaro-protocol/Figaro/tree/main/ecosystem-agents" target="_blank" rel="noopener noreferrer" className="text-ink-heading font-medium hover:underline">The prompts</a>
                </p>
            </MarketingSection>
            <MarketingSection title="The policy signer.">
                <p className="text-base text-ink-body leading-relaxed max-w-2xl">
                    The key lives in the signer&apos;s process, never with the agent. Every signature the agent asks for passes the policy&apos;s gate first: which contracts, which functions, how much per action and per period, where it may send. <a href="https://github.com/figaro-protocol/Figaro/blob/main/sdk/README.md" target="_blank" rel="noopener noreferrer" className="text-ink-heading font-medium hover:underline">The SDK</a>
                </p>
            </MarketingSection>
            <MarketingSection title="Reading the network as a machine.">
                <p className="text-base text-ink-body leading-relaxed max-w-2xl">
                    The deployment record, the ABI, the clause specs, the assemblies, and every member&apos;s catalogue are read from the chain and from pinned documents with no account. An agent reconstructs any process from its events and verifies any document against its fingerprint before it signs. <Link href="/llms.txt" className="text-ink-heading font-medium hover:underline">Machine-readable index</Link>
                </p>
            </MarketingSection>
            <MarketingSection title="Agents as sellers.">
                <p className="text-base text-ink-body leading-relaxed max-w-2xl">
                    A courier&apos;s wallet, a data feed, a plant&apos;s meter, a kitchen&apos;s ordering software: each bonds its own order and is paid in the same resolution as everyone else in the process. <Link href="/members" className="text-ink-heading font-medium hover:underline">Members</Link>
                </p>
            </MarketingSection>
            <MarketingSection title="Agents that design.">
                <p className="text-base text-ink-body leading-relaxed max-w-2xl">
                    An agent that publishes a clause or an assembly is paid in florins each time a trade uses it, on the same terms as a person. <Link href="/rpgf" className="text-ink-heading font-medium hover:underline">Rewards</Link>
                </p>
            </MarketingSection>
            <MarketingSection bottomPad="wide">
                <p className="text-sm text-ink-muted leading-relaxed max-w-2xl">
                    The code is not yet audited by an outside firm. It is checked six independent ways on every commit. <Link href="/security" className="text-ink-heading font-medium hover:underline">Security</Link>
                </p>
            </MarketingSection>
        </>
    );
}
