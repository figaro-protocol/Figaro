import type { Metadata } from "next";
import Link from "next/link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingSection } from "@/components/marketing/MarketingSection";

export const metadata: Metadata = {
    title: "Why — Figaro Protocol",
    description:
        "Three eras of rule-making — coercion, cognition, crypto — and what changes when a rule set is common knowledge by construction, enforced by mathematics rather than force or belief. The full argument is the Code Is Constitution paper.",
};

export default function Why() {
    return (
        <>
            <MarketingHero
                title="Three eras of rule-making."
                lead={
                    <>
                        You already know the feeling of paying a stranger and hoping some institution &mdash; a bank, a platform, a court &mdash; will make it good if the deal goes wrong. Coercion. Cognition. Crypto. Each is a way humans give rules legitimacy. The first two are ancient, sophisticated, and persistent. The third is new &mdash; and brings something the first two could not: clarity, anchored in mathematics and deterministic computing. This is Figaro read as history: how it arrives, not what it is.
                    </>
                }
            >
                <div className="border-l-2 border-default pl-6 mt-6">
                    <p className="text-sm text-ink-body leading-relaxed">
                        <strong>Reading this page.</strong> The mechanism &mdash; bonded stakes, buyer-only resolution, no platform in the middle &mdash; is shown on{" "}
                        <Link href="/protocol" className="hover:underline">/protocol</Link>{" "}
                        and lived through on{" "}
                        <Link href="/local-commerce" className="hover:underline">/local-commerce</Link>. This page steps back and asks why that counts as a legitimate way to make a rule at all, and what era of rule-making it belongs to &mdash; the historical and philosophical case, not the mechanics. If you came for the mechanics, not the history, start there instead, or see{" "}
                        <Link href="/security" className="hover:underline">/security</Link>{" "}
                        for what the design protects against, and what it does not.
                    </p>
                </div>
            </MarketingHero>

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
                    Figaro is none of these. It is cryptoeconomics applied to value-added processes &mdash; trade. As a primitive it takes no position on where value flows or under what conditions; the participants in each process decide. If you would rather see the mechanism walked through as one evening&apos;s dinner, that lived version is at <Link href="/local-commerce" className="text-ink-heading font-medium hover:underline">local commerce</Link>.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    The full argument for what kind of rule this is &mdash; why an immutable, ownerless kernel sits closer to a constitution&apos;s entrenched layer than to an enacted law, and what a federal court has already recognized about artifacts like it &mdash; is developed at length in the paper <Link href="/papers/code-is-constitution" className="text-ink-heading font-medium hover:underline">Code Is Constitution</Link>. Read it as a paper, not a page.
                </p>
            </MarketingSection>

            <MarketingSection title="The second promise.">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    In March 2026 the Ethereum Foundation published its <a href="https://blog.ethereum.org/2026/03/13/ef-mandate" target="_blank" rel="noopener noreferrer" className="text-ink-heading font-medium hover:underline">Mandate</a> &mdash; part constitution, part guide, recorded on the chain it describes. It names two promises. The first: to enable self-sovereignty by being &ldquo;humanity&apos;s common computational substrate that anyone can interact with trustlessly, permissionlessly, and persistently.&rdquo; The second, built on the first: &ldquo;allowing the infrastructures of self-sovereign coordination to arise and thrive in any form imaginable and expressible &mdash; unmolested, unimpeded, and undisturbed &mdash; without violating any individual&apos;s freedom.&rdquo; The Foundation measures its own success by how much &ldquo;sovereignty-preserving coordination at scale&rdquo; Ethereum resiliently enables &mdash; with or without the Foundation.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    Figaro is an infrastructure of self-sovereign coordination &mdash; the second promise, applied to trade. Coordination without an enforcing institution: cooperation is the equilibrium the bonds construct, so no platform, administrator, or arbitrator sits inside the mechanism with final authority over settlement. The Mandate requires work &ldquo;architected to be maximally unstoppable and to function without incorporating centralized intermediaries or kill switches&rdquo;; the kernel has no admin, no owner, no pause &mdash; it passes the Mandate&apos;s walkaway test by construction. And where the Mandate refuses &ldquo;private capture or uncompetitive user extraction,&rdquo; Figaro makes the extracting intermediary structurally unnecessary: between buyer and seller there is no seat from which rent could be metered.
                </p>
            </MarketingSection>

            <MarketingSection title="The current moment.">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Since 2001 the Edelman Trust Barometer has tracked steady decline in the trust the public places in its institutions. The decline is not bounded to any one country or sector; it is structural. The institutions that carry the cognitive apparatus &mdash; media, government, business, civil society &mdash; show diminishing capacity to sustain the belief the apparatus needs.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    The same period has seen social engineering deployed at scale.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    Figaro is one contribution to a substrate that captures less well: economic rules that are common knowledge, enforced by mathematics, owned by no one. Clarity is a partial defense. It is the defense the third era makes available.
                </p>
            </MarketingSection>

            <MarketingSection title="Read next" bottomPad="wide">
                <ul className="space-y-3 text-base">
                    <li>
                        <Link href="/protocol" className="text-ink-heading font-medium hover:underline">
                            Protocol
                        </Link>
                        <span className="text-ink-body"> &mdash; the mechanism: bonded stakes, buyer-only resolution, atomic settlement.</span>
                    </li>
                    <li>
                        <Link href="/physics" className="text-ink-heading font-medium hover:underline">
                            Physics
                        </Link>
                        <span className="text-ink-body"> &mdash; the structural read: the few facts the core obeys, and why trust moves to the boundary.</span>
                    </li>
                    <li>
                        <Link href="/local-commerce" className="text-ink-heading font-medium hover:underline">
                            Local commerce
                        </Link>
                        <span className="text-ink-body"> &mdash; one deal, lived: a delivered meal, three strangers, no platform.</span>
                    </li>
                    <li>
                        <Link href="/consequences" className="text-ink-heading font-medium hover:underline">
                            Consequences
                        </Link>
                        <span className="text-ink-body"> &mdash; what this does to the world, if it works.</span>
                    </li>
                    <li>
                        <Link href="/data" className="text-ink-heading font-medium hover:underline">
                            Data
                        </Link>
                        <span className="text-ink-body"> &mdash; your records, your terms.</span>
                    </li>
                </ul>
            </MarketingSection>
        </>
    );
}
