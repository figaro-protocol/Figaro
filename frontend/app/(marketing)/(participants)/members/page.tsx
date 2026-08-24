import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import Link from "next/link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingSection } from "@/components/marketing/MarketingSection";
import { RegistryCountLink } from "@/components/registries/RegistryCountLink";

export const metadata: Metadata = withOg({
    title: "Members — Figaro Protocol",
    description:
        "Membership: one wallet, one published profile — what you sell, and what you offer from the records of the deals you buy through. People and software agents register the same way.",
});

// The membership page — ONE subject (maintainer ruling 2026-08-06): what a
// member is, what a member publishes (both halves, agents included), and
// how to join. The only outbound links are the wizard and discovery.
export default function Join() {
    return (
        <>
            <MarketingHero
                title="Members."
                lead={
                    <>
                        A member is a wallet with a published profile &mdash; a person, a business, or a software agent. Publishing one is what makes you findable: it does not grant access, because nothing here gates access. No application, no approval, no one to say yes. You post a reclaimable ETH deposit and you are listed. Buyer and seller are the same kind of member: buying needs only a wallet &mdash; no registration, no deposit &mdash; and registering is how either side becomes findable.
                    </>
                }
            />

            <MarketingSection title="What a member publishes.">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    One profile carries your identity as well as both sides of you. The selling side: a catalogue of items priced in the tokens you accept, and the assemblies &mdash; the deal-shapes &mdash; you offer through. The buying side: the assemblies you buy through, and which of the data your own deals produce you offer for sale. Either side puts the wallet in the data market, because every deal it takes part in co-produces data &mdash; your side of it is yours to sell, on your terms, at your price.
                </p>
            </MarketingSection>

            <MarketingSection title="Agents are members.">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    A software agent joins exactly as a person does: its wallet signs, posts the deposit, publishes a profile. The profile carries the agent&apos;s service endpoints &mdash; MCP, A2A, REST, DID, ENS &mdash; so other members, human or software, can reach it directly.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    An agent can also run a member&apos;s whole profile &mdash; the selling side and the buying side alike &mdash; on behalf of whoever holds its key. The registry never asks what runs the wallet.
                </p>
            </MarketingSection>

            <MarketingSection title="Joining." bottomPad="wide">
                <p className="text-base text-ink-body leading-relaxed mb-6">
                    You need a wallet. A <Link href="/glossary#wallet" className="text-ink-heading hover:underline">wallet</Link> is an app that holds your tokens and signs for you &mdash; like a banking app, except no bank runs it and you alone hold the key; any standard Ethereum wallet works, and there is no Figaro-specific one to install.
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
                    Registration is permissionless and posts a reclaimable ETH deposit, on the terms every registry here shares (<Link href="/faq#builders-registries" className="text-ink-heading hover:underline">what the deposit does, and what withdrawing it leaves behind</Link>). What is specific to a participant registration: it is keyed to your wallet, so leaving de-lists you at once and clears the profile, and the ETH releases only after a cooldown &mdash; coming back later costs a second deposit. The review step shows the live amount before you sign.
                </p>
                <p className="text-sm text-ink-muted mb-4">
                    Already registered? <Link href="/members/manage" className="text-ink-heading hover:underline">Manage your membership</Link> &mdash; edit the profile, leave the registry, claim a released deposit.
                </p>
                <div className="mb-8">
                    <RegistryCountLink family="members" />
                </div>
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
