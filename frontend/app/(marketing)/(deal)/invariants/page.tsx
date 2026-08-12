import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import Link from "next/link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingSection } from "@/components/marketing/MarketingSection";

export const metadata: Metadata = withOg({
    title: "Invariants — Figaro Protocol",
    description:
        "The six facts the Figaro core cannot violate — asymmetric bonding, cumulative bonding, buyer dominance, atomic resolution, immutable evidence, no escape hatches — each with what it means for you, and the four things that follow from them: what the chain holds, what couples to it, who may act, and where the meaning lives.",
});

// THE INVARIANTS PAGE — it states the six invariants named in CLAUDE.md
// § "What Figaro Is", in the general-public register, and nothing else is
// re-derived here: /kernel owns the mechanism derivation, /data owns the
// records boundary, /agents owns actor-neutrality, /working-groups routes to
// the formal case.
//
// CANONICAL, DO NOT RELOCATE: with /why, this page is the in-repo source of
// the four boundary readings — HOLDS ("What the chain holds"), COUPLES
// ("What couples to it"), ADMITS ("Who may act"), EMERGES ("Where the
// meaning lives"). All four bind the KERNEL ONLY. They may be reorganized
// under the invariant list; they may not move to another page.
export default function Invariants() {
    return (
        <>
            <MarketingHero
                title="Invariants."
                lead="An invariant is a fact a contract cannot violate — not a policy someone chose, and not a promise anyone keeps. Figaro rests on six of them, and they are the whole of it: everything else the protocol does either follows from these six or is built on top of them by somebody else. This is Figaro read as structure — the shape of the thing itself, before any history."
            />

            <MarketingSection title="The six.">
                <div className="space-y-4 text-base text-ink-body leading-relaxed max-w-prose">
                    <ol className="space-y-4 list-decimal pl-5">
                        <li>
                            <strong className="text-ink-heading">Asymmetric bonding.</strong> The buyer locks twice the payment; each seller locks twice the value the deal has accumulated at its own link. <em>What it means for you:</em> whatever the other side is thinking, honoring the deal leaves them better off than walking away from it.
                        </li>
                        <li>
                            <strong className="text-ink-heading">Cumulative bonding.</strong> A seller&apos;s stake covers everything already added ahead of it, not just its own line. <em>What it means for you:</em> a deal with six hands in it is secured the same way a deal with one is &mdash; no coordinator, and nothing new to trust as the chain gets longer.
                        </li>
                        <li>
                            <strong className="text-ink-heading">Buyer dominance.</strong> Only the buyer can close a deal. Nobody can close it for them, and nothing closes it on its own. <em>What it means for you:</em> whatever was agreed gets met first, because nothing settles until the one paying says it is finished.
                        </li>
                        <li>
                            <strong className="text-ink-heading">Atomic resolution.</strong> When the buyer closes, every order in the deal settles in one transaction, or none of them does. <em>What it means for you:</em> nobody is paid while somebody else is left hanging &mdash; so everyone bonded in has their own reason to help put a fault right before the close.
                        </li>
                        <li>
                            <strong className="text-ink-heading">Immutable evidence.</strong> Each step is written down as it happens and bound to the signed agreement by its fingerprint. <em>What it means for you:</em> nothing can be swapped underneath the record afterwards, so a forum or a court reads what happened rather than reconstructing it.
                        </li>
                        <li>
                            <strong className="text-ink-heading">No escape hatches.</strong> Committing and closing are the only two moves the contract knows &mdash; no refund path, no timeout, no admin key, no third party who can reach in. <em>What it means for you:</em> nothing can be pulled out of a deal by anyone but the two parties to it, which is also why whatever is wrong gets put right before the close rather than argued about after it.
                        </li>
                    </ol>
                    <p>
                        They are facts, not rules: nothing in the contract can suspend one, because there is nothing in the contract that could. The mechanism they state &mdash; why twice the value, and what walking away costs &mdash; is derived in ten minutes on{" "}
                        <Link href="/kernel" className="text-ink-heading font-medium hover:underline">
                            Kernel
                        </Link>
                        , and at length in the{" "}
                        <Link href="/working-groups" className="text-ink-heading font-medium hover:underline">
                            papers
                        </Link>
                        . What follows here is the four things that fall out of the six.
                    </p>
                </div>
            </MarketingSection>

            <MarketingSection title="What the chain holds.">
                <div className="space-y-4 text-base text-ink-body leading-relaxed max-w-prose">
                    <p>
                        Almost nothing. Every token that goes in comes back out to one of the parties &mdash; the contract never holds a balance of its own, so there is no leak, no pool, and no house. And because each commitment only ever looks at one handoff between two parties, the chain never needs a map of the whole deal, or the deal itself. It needs a <em>fingerprint</em> of the agreement and nothing more.
                    </p>
                    <p>
                        The agreement, the terms, the proof that something was delivered &mdash; all of it lives outside the chain, pinned where its owner chooses. The fingerprint does the securing: it can&apos;t rebuild the agreement and never tries to, it just makes exactly one version of the outside detail acceptable. Change anything out there by a hair and it stops matching, and the math throws it out. A contract that once had to carry everything came to carry almost nothing, and gave up none of its security doing it. What that leaves in your hands &mdash; what stays sealed, and what you can sell &mdash; is on{" "}
                        <Link href="/data" className="text-ink-heading font-medium hover:underline">
                            Data
                        </Link>
                        .
                    </p>
                </div>
            </MarketingSection>

            <MarketingSection title="What couples to it.">
                <div className="space-y-4 text-base text-ink-body leading-relaxed max-w-prose">
                    <p>
                        The agreement was the first thing to leave the chain, not the last. Everything a deal touches can stay where it already lives and couple to the core through the same small boundary &mdash; in its own medium, never handed to Figaro to be secured.
                    </p>
                    <ul className="space-y-3">
                        <li>
                            <strong className="text-ink-heading">Your data stays yours.</strong> The documents, the photos, the records of what happened &mdash; they live in storage you control, not in a company&apos;s database. Nothing has to be handed over to be made trustworthy.
                        </li>
                        <li>
                            <strong className="text-ink-heading">Your identity stays yours.</strong> A wallet is enough to act. A name, a reputation, a web address can attach to it &mdash; or not. Figaro issues none of it and can revoke none of it.
                        </li>
                        <li>
                            <strong className="text-ink-heading">The work can be done by anyone &mdash; or anything.</strong> An ordinary web service, or an autonomous agent, takes a role in a deal on exactly the same terms a person does.
                        </li>
                        <li>
                            <strong className="text-ink-heading">The law that applies is named, not assumed.</strong> Which country&apos;s rules govern a deal is written into the agreement and settled in that forum, off-chain. The core takes no side; it just keeps the record a court can read.
                        </li>
                    </ul>
                    <p>
                        Anything already on-chain composes too &mdash; a token, an item held in a wallet, another contract that prices or matches or settles. The core never had to be taught about any of it: if a wallet holds it, an assembly can compose it. That openness was never something Figaro had to build &mdash; it is what having a boundary instead of a platform means.
                    </p>
                </div>
            </MarketingSection>

            <MarketingSection title="Who may act.">
                <p className="text-base text-ink-body leading-relaxed max-w-prose">
                    Nobody admits you. A wallet to sign with and a stake to lock are all any actor needs &mdash; a person, a business, or a piece of software, on the same footing, because the core reads a signature and never asks what produced it. Full treatment: <Link href="/agents" className="text-ink-heading font-medium hover:underline">Agents</Link>.
                </p>
            </MarketingSection>

            <MarketingSection title="Where the meaning lives.">
                <div className="space-y-4 text-base text-ink-body leading-relaxed max-w-prose">
                    <p>
                        A law this small barely says anything on its own. What it means shows up one level up: in the agreements people write on it, the roles they take, the multi-party processes they assemble. That is why the rest of Figaro exists &mdash; not as decoration on the core, but as the only level at which the core <em>means</em> anything. The core is complete and, by itself, silent. You hear it in what gets built on it.
                    </p>
                    <p>
                        And that is what the network&apos;s token funds &mdash; not the core, which runs itself, but the clauses and assemblies built on it, and the authors the protocol{" "}
                        <Link href="/rpgf" className="text-ink-heading font-medium hover:underline">
                            pays for the ones it comes to rely on
                        </Link>
                        .
                    </p>
                    <p className="text-ink-heading font-medium">
                        The core is a small law that holds. The network is what emerges when people build on it. Building on it isn&apos;t optional &mdash; it&apos;s the point.
                    </p>
                </div>
            </MarketingSection>

            <MarketingSection title="A different place to put your trust." bottomPad="wide">
                <div className="space-y-4 text-base text-ink-body leading-relaxed max-w-prose">
                    <p>
                        Step back and the six are one idea. The internet we have asks you to trust the platform in the middle &mdash; the one that holds your data, your identity, your value, and promises to behave. You trust the keeper of the pile.
                    </p>
                    <p>
                        This is the other arrangement. Trust sits in the boundary: a stake large enough that cheating loses, and a fingerprint nothing can be swapped underneath. The pile never moves; it stays with whoever owns it. What is left is a thin, fixed layer that everything composes against and no one owns &mdash; the way the network runs on TCP/IP. Not a new internet bolted over the old one. The same internet, with trust moved from the keeper in the middle to the boundary at the edge.
                    </p>
                    <p>
                        That is the structural reading. The historical one &mdash; why a rule like this arrives now, after force and after belief &mdash; is on{" "}
                        <Link href="/why" className="text-ink-heading font-medium hover:underline">
                            Why
                        </Link>
                        .
                    </p>
                </div>
            </MarketingSection>
        </>
    );
}
