import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import Link from "next/link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingSection } from "@/components/marketing/MarketingSection";

export const metadata: Metadata = withOg({
    title: "Why this exists — Figaro Protocol",
    description:
        "Three eras of rule-making — coercion, cognition, crypto — and what changes when a rule set is common knowledge by construction, enforced by mathematics rather than force or belief. The full argument is the Code Is Constitution paper.",
});

export default function Why() {
    return (
        <>
            <MarketingHero
                title="Three eras of rule-making."
                lead={
                    <>
                        You already know the feeling of paying a stranger and hoping some institution &mdash; a bank, a platform, a court &mdash; will make it good if the deal goes wrong. Coercion. Cognition. Crypto. Three ways humans have made rules legitimate. The first two are ancient and still working. The third is new, and it brings what neither could: clarity, anchored in mathematics. This is Figaro read as history: how it arrives, not what it is.
                    </>
                }
            />

            <MarketingSection title="Coercion, cognition, crypto.">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    The oldest answer to who governs is force &mdash; <em>might makes right</em>. Force can compel an action, but it cannot by itself make the rule legitimate in the mind of the person it binds. Force without legitimacy is unstable; the ruled have always found ways to refuse it.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    So societies built a second apparatus to carry legitimacy instead &mdash; shared belief, sustained by institutions trusted to carry it: myth, custom, written law, contracts, treaties, regulatory regimes, all one mechanism antiquity started. Both coercion and cognition remain with us. Both can be captured by interests, and sophisticated institutions carry sophisticated capture.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    Bitcoin introduced a third way: encode the rules in a deterministic program, publish what cannot be encoded, and attach a token denominated in the value of the resource the program secures &mdash; common knowledge by construction, enforced by mathematics, not by any institution. Crypto does not replace coercion or cognition; they persist. What it adds is <em>clarity</em>: rules that cannot be quietly captured because they cannot be quietly changed.
                </p>
            </MarketingSection>

            <MarketingSection title="Figaro is cryptoeconomics for trade.">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Most of what runs on crypto today is one of three things: traditional financial products ported to a new venue, grifters exploiting the same social engineering that underlies adoption, or the cognitive era&apos;s institutional apparatus lifted onto a new substrate &mdash; on-chain governance recreating corporate voting, legal-engineering toolchains porting written contracts onto chain.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Figaro is none of these. It is cryptoeconomics applied to value-added processes &mdash; trade. As a primitive it takes no position on where value flows or under what conditions; the participants in each process decide.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    The full argument for what kind of rule this is &mdash; why an immutable, ownerless kernel sits closer to a constitution&apos;s entrenched layer than to an enacted law, and what a federal court has already recognized about immutable, ownerless code like it &mdash; is developed at length in the paper <Link href="/papers/code-is-constitution" className="text-ink-heading font-medium hover:underline">Code Is Constitution</Link>. Read it as a paper, not a page.
                </p>
            </MarketingSection>

            <MarketingSection title="What this descends from.">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    The third era did not begin with Bitcoin. In 1982 David Chaum showed that a payment could clear without the intermediary learning who was paying &mdash; privacy as a property of the transaction itself rather than a policy someone promises to keep. In 1993 Eric Hughes wrote the sentence the movement was organized around: <em>privacy is the power to selectively reveal oneself to the world</em>. He drew the operational conclusion in the same document &mdash; cypherpunks write code, because someone has to write the software that defends privacy and nobody is going to be persuaded into providing it. In 1996 John Perry Barlow declared the independence of cyberspace from the governments of the industrial world, on the ground that identities there have no bodies and so cannot be ordered by physical coercion.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Here those are shipped surfaces, not slogans. Selective revelation is the data layer: each clause declares which of its sections are private, the chain holds only a fingerprint of the whole agreement, and the projection that produces anything public withholds a private &mdash; or merely unrecognized &mdash; section fail-closed rather than risk leaking it. What stays sealed is the owner&apos;s to disclose, or to sell as an ordinary bonded trade, on <Link href="/data" className="text-ink-heading font-medium hover:underline">their own terms</Link>. Identity without a body is the actor-neutral wallet: the protocol never asks what is behind a signature, so a person, a piece of software, and an asset holding its own key participate on exactly the same footing (<Link href="/agents" className="text-ink-heading font-medium hover:underline">agents and humans, the same primitive</Link>).
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Two corrections to the inheritance, stated plainly. The first is what the tradition never solved. It won sovereign identity, sovereign currency, and sovereign privacy &mdash; and left untouched the element that fails between sovereign strangers: consideration, the part of a contract that makes a promise to deliver credible. Sovereignty without consideration is why cyberspace was colonized by the platform intermediaries the movement had declared obsolete. Somebody still had to make the stranger&apos;s promise good, and the only answer on offer was an institution in the middle holding the payment and taking a cut for the service. Figaro completes that missing element with bonded stakes rather than an institution &mdash; the mechanism is on <Link href="/kernel" className="text-ink-heading font-medium hover:underline">/kernel</Link>. Once consideration holds on its own, the rest of the contract rebuilds above that floor without the institution that used to carry it: the terms as clauses anyone may write and publish, offer and acceptance as assemblies and the checkout that fills one in, capacity as admission nobody grants, mutual assent as the two parties&apos; own signatures, legality as the forum the agreement names and the court that reads its record either way. Each limb has a page of its own here; none of them puts a party back in the middle.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    The second correction is about law, and it cuts in both directions. This is not Barlow&apos;s secession, and it is not Szabo&apos;s code-is-law either: the DAO fork settled that question empirically, showing that the deepest layer of such a system is the social one that decides which code runs. The claim made here is narrower and evidentiary &mdash; the mechanism settles, and produces a record any forum or court can read from outside it, whether or not the parties named one in advance. Law composes in; it is not seceded from. The argument, and what a federal appellate court has already recognized about immutable, ownerless code, is in <Link href="/papers/code-is-constitution" className="text-ink-heading font-medium hover:underline">Code Is Constitution</Link>. This page looks back at where the rule comes from; the future it continues into is on <Link href="/consequences" className="text-ink-heading font-medium hover:underline">Consequences</Link>.
                </p>
            </MarketingSection>

            <MarketingSection title="The second promise.">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    In March 2026 the Ethereum Foundation published its <a href="https://blog.ethereum.org/2026/03/13/ef-mandate" target="_blank" rel="noopener noreferrer" className="text-ink-heading font-medium hover:underline">Mandate</a> (<a href="https://ethereum.foundation/ef-mandate.pdf" target="_blank" rel="noopener noreferrer" className="text-ink-heading font-medium hover:underline">the full document</a>) &mdash; part constitution, part guide, <a href="https://etherscan.io/tx/0x5dd574df963a1df1f064791e0f6ff41ec972cdbba12293b7e1ece582052ba855" target="_blank" rel="noopener noreferrer" className="text-ink-heading font-medium hover:underline">recorded on the chain it describes</a>. It names two promises. The first: to enable self-sovereignty by being &ldquo;humanity&apos;s common computational substrate that anyone can interact with trustlessly, permissionlessly, and persistently.&rdquo; The second, built on the first: &ldquo;allowing the infrastructures of self-sovereign coordination to arise and thrive in any form imaginable and expressible &mdash; unmolested, unimpeded, and undisturbed &mdash; without violating any individual&apos;s freedom.&rdquo; The Foundation measures its own success by how much &ldquo;sovereignty-preserving coordination at scale&rdquo; Ethereum resiliently enables &mdash; with or without the Foundation.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    Figaro is an infrastructure of self-sovereign coordination &mdash; the second promise, applied to trade. Coordination without an enforcing institution: cooperation is the equilibrium the bonds construct, so no platform, administrator, or arbitrator sits inside the mechanism with final authority over settlement. The Mandate requires work &ldquo;architected to be maximally unstoppable and to function without incorporating centralized intermediaries or kill switches&rdquo;; the kernel contains no such switch, and no one who could throw one &mdash; it passes the Mandate&apos;s walkaway test by construction. And where the Mandate refuses &ldquo;private capture or uncompetitive user extraction,&rdquo; Figaro makes the extracting intermediary structurally unnecessary: between buyer and seller there is no seat from which rent could be metered.
                </p>
            </MarketingSection>

            <MarketingSection title="The current moment." bottomPad="wide">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Since 2001 the Edelman Trust Barometer has tracked decline in the trust the public places in its institutions. What it reports is not confined to one country or one sector: the four institutions it surveys &mdash; media, government, business, non-governmental organizations &mdash; show the same direction across the markets it covers. Whatever its cause, that is thinner ground than the cognitive era&apos;s apparatus &mdash; belief carried by institutions trusted to carry it &mdash; asks for.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-8">
                    Figaro is one contribution to a substrate that captures less well: economic rules that are common knowledge, enforced by mathematics, owned by no one. Clarity is a partial defense. It is the defense the third era makes available.
                </p>
                <p className="text-sm text-ink-muted leading-relaxed">
                    Came for the mechanics rather than the history? They are derived on <Link href="/kernel" className="text-ink-heading hover:underline">Kernel</Link> and lived through on <Link href="/local-commerce" className="text-ink-heading hover:underline">Local Commerce</Link>; what the design does and does not protect against is on <Link href="/faq" className="text-ink-heading hover:underline">the FAQ</Link>.
                </p>
            </MarketingSection>
        </>
    );
}
