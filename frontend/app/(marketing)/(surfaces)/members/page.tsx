import type { Metadata } from "next";
import Link from "next/link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingSection } from "@/components/marketing/MarketingSection";

export const metadata: Metadata = {
    title: "Members — Figaro Protocol",
    description:
        "Membership: one wallet, one published profile — what you sell, and what you offer from the records of the deals you buy through. People and software agents register the same way.",
};

// The membership page — ONE subject (operator ruling 2026-08-06): what a
// member is, what a member publishes (both halves, agents included), and
// how to join. The only outbound links are the wizard and discovery.
export default function Join() {
    return (
        <>
            <MarketingHero
                title="Members."
                lead={
                    <>
                        Membership gives a wallet access to the Figaro ecosystem. A member is a wallet with a published profile &mdash; a person, a business, or a software agent. Membership is permissionless: no application, no approval, no one to say yes. You just need to stake some ETH.
                    </>
                }
            />

            <MarketingSection title="What a member publishes.">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    One profile carries your identity as well as both sides of you. The selling side: a catalogue of items priced in the tokens you accept, and the assemblies &mdash; the deal-shapes &mdash; you offer through. The buying side: the assemblies you buy through. Both profiles allow the wallet to participate in data markets. The deals the wallet participates in co-produce data you can offer for sale &mdash; your side of every purchase is yours to sell, on your terms, at your price.
                </p>
            </MarketingSection>

            <MarketingSection title="Agents are members.">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    A software agent joins exactly as a person does: its wallet signs, posts the deposit, publishes a profile. The profile carries the agent&apos;s service endpoints &mdash; MCP, A2A, REST, DID, ENS &mdash; so other members, human or software, can reach it directly.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    An agent can also run a member&apos;s whole profile &mdash; the selling side and the buying side alike &mdash; on behalf of whoever holds its key. The registry reads a signature, never a species.
                </p>
            </MarketingSection>

            <MarketingSection title="Joining." bottomPad="wide">
                <p className="text-base text-ink-body leading-relaxed mb-6">
                    You need a wallet.
                </p>
                <div className="overflow-x-auto mb-6">
                    <table className="w-full max-w-2xl text-sm text-left">
                        <thead>
                            <tr className="border-b border-default text-ink-heading">
                                <th className="py-2 pr-4 font-semibold">Step</th>
                                <th className="py-2 font-semibold">What you do</th>
                            </tr>
                        </thead>
                        <tbody className="text-ink-body">
                            <tr className="border-b border-default"><td className="py-2 pr-4">Identity</td><td className="py-2">Name, description, location, the tokens you accept.</td></tr>
                            <tr className="border-b border-default"><td className="py-2 pr-4">Catalogue</td><td className="py-2">The items you sell, priced in your default token.</td></tr>
                            <tr className="border-b border-default"><td className="py-2 pr-4">Assemblies</td><td className="py-2">Bind the deal-shapes you sell through.</td></tr>
                            <tr className="border-b border-default"><td className="py-2 pr-4">Buyer</td><td className="py-2">Subscribe the deal-shapes you buy through; choose the data you offer for sale.</td></tr>
                            <tr className="border-b border-default"><td className="py-2 pr-4">Agents</td><td className="py-2">Publish service endpoints, if a machine runs this wallet.</td></tr>
                            <tr><td className="py-2 pr-4">Review</td><td className="py-2">One action pins your profile and registers the wallet.</td></tr>
                        </tbody>
                    </table>
                </div>
                <p className="text-base text-ink-body leading-relaxed mb-10">
                    Registering requires a reclaimable ETH deposit &mdash; to participate in the ecosystem. This is not a fee. The live deposit keeps you surfaced in the UI; you reclaim the exact amount when you leave, after a cooldown, and leaving de-lists you at once. Nobody can seize it, and nobody&apos;s permission is needed to reclaim it.
                </p>
                <div className="flex flex-col sm:flex-row gap-4">
                    <Link
                        href="/members/identity"
                        className={
                            "inline-flex min-w-[200px] justify-center items-center gap-1 px-9 py-sm bg-paper text-ink-primary text-sm font-medium rounded-tile border border-ink-primary " +
                            "hover:bg-ink-primary hover:text-paper hover:no-underline transition-colors " +
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-focus"
                        }
                        data-testid="cta-register"
                    >
                        Register <span aria-hidden="true">&rarr;</span>
                    </Link>
                    <Link
                        href="/discover"
                        className={
                            "inline-flex min-w-[200px] justify-center items-center gap-1 px-9 py-sm bg-paper text-ink-primary text-sm font-medium rounded-tile border border-ink-primary " +
                            "hover:bg-ink-primary hover:text-paper hover:no-underline transition-colors " +
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-focus"
                        }
                        data-testid="cta-discover"
                    >
                        Browse members <span aria-hidden="true">&rarr;</span>
                    </Link>
                </div>
            </MarketingSection>
        </>
    );
}
