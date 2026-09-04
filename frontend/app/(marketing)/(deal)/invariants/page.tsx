import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import Link from "next/link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingSection } from "@/components/marketing/MarketingSection";
import { MerkleTreeFigure } from "@/components/figures/MerkleTreeFigure";

export const metadata: Metadata = withOg({
    title: "Invariants — Figaro Protocol",
    description:
        "The six facts the Figaro core cannot violate — asymmetric bonding, cumulative bonding, buyer dominance, atomic resolution, immutable evidence, no escape hatches — each with what it means for you, and the four things that follow from them: what the chain holds, what couples to it, who may act, and where the meaning lives.",
});

// THE INVARIANTS PAGE — it states the six invariants named in CLAUDE.md
// § "What Figaro Is", in the general-public register, and nothing else is
// re-derived here: /kernel owns the mechanism derivation, /data owns the
// public/sealed boundary, /agents owns actor-neutrality, /working-groups routes to
// the formal case.
//
// CANONICAL, DO NOT RELOCATE: with /why, this page is the in-repo source of
// the four boundary readings — HOLDS ("What the chain holds"), COUPLES
// ("What couples to it"), ADMITS (the closing line of "The six." — it was once
// a three-sentence pointer wearing a section heading, and is not to become one
// again),
// EMERGES ("Where the meaning lives"). All four bind the KERNEL ONLY. They
// may be reorganized under the invariant list; they may not move to another
// page.
export default function Invariants() {
    return (
        <>
            <MarketingHero
                title="Invariants."
                lead="Figaro rests on six facts a contract cannot violate — not policies someone chose, not promises anyone keeps. Everything else the protocol does either follows from those six or is built on top of them by somebody else."
            />

            <MarketingSection title="The six.">
                <div className="space-y-4 text-base text-ink-body leading-relaxed max-w-prose">
                    <ol className="space-y-4 list-decimal pl-5">
                        <li>
                            <strong className="text-ink-heading">Asymmetric bonding.</strong> The buyer locks twice the payment; each seller locks twice the value the trade has accumulated at its own link. <em>What it means for you:</em> honoring the trade is each party&apos;s best strategy against the other&apos;s &mdash; a Nash equilibrium, not a promise. Once the work is delivered, resolving is strictly the buyer&apos;s best move whatever the seller is like; with that fixed, delivering is strictly each seller&apos;s best response.
                        </li>
                        <li>
                            <strong className="text-ink-heading">Cumulative bonding.</strong> A seller&apos;s bond covers everything already added ahead of it, not just its own line. <em>What it means for you:</em> a trade with six hands in it is secured the same way a trade with one is &mdash; no coordinator, and nothing new to trust as the chain gets longer.
                        </li>
                        <li>
                            <strong className="text-ink-heading">Buyer dominance.</strong> Only the buyer can close a trade. Nobody can close it for them, and nothing closes it on its own. <em>What it means for you:</em> whatever was agreed gets met first, because nothing resolves until the one paying says it is finished.
                        </li>
                        <li>
                            <strong className="text-ink-heading">Atomic resolution.</strong> When the buyer closes, every order in the trade resolves in one transaction, or none of them does. <em>What it means for you:</em> nobody is paid while somebody else is left hanging &mdash; so everyone bonded in has their own reason to help put a fault right before the close.
                        </li>
                        <li>
                            <strong className="text-ink-heading">Immutable evidence.</strong> Each step is written down as it happens and bound to the signed agreement by its fingerprint. <em>What it means for you:</em> nobody can swap anything in underneath the data. A forum or a court reads what happened. It does not have to reconstruct it.
                        </li>
                        <li>
                            <strong className="text-ink-heading">No escape hatches.</strong> Committing and closing are the only two moves the smart contract knows &mdash; no refund path, no timeout, no admin key, no third party who can reach in. <em>What it means for you:</em> nothing can be pulled out of a trade by anyone outside it &mdash; and inside it, only the buyer&apos;s close moves anything &mdash; which is also why whatever is wrong gets put right before the close rather than argued about after it.
                        </li>
                    </ol>
                    <p>
                        They are facts, not rules. Nothing in the smart contract can suspend one, because there is nothing in the smart contract that could. The mechanism they state &mdash; why twice the value, and what walking away costs &mdash; is derived, with the worked numbers, on{" "}
                        <Link href="/kernel" className="text-ink-heading font-medium hover:underline">
                            Kernel
                        </Link>
                        , and at length in the{" "}
                        <Link href="/working-groups" className="text-ink-heading font-medium hover:underline">
                            papers
                        </Link>
                        . What the contracts stating them are tested against &mdash; six independent benches, and the external-audit posture stated plainly &mdash; is on{" "}
                        <Link href="/security" className="text-ink-heading font-medium hover:underline">
                            Security
                        </Link>
                        .
                    </p>
                    <p>
                        Nobody admits you, either. A wallet to sign with and a bond to lock are all any actor needs &mdash; a person, a business, or a piece of software, on the same footing; the kernel reads a signature, never a species, and the full treatment is on{" "}
                        <Link href="/agents" className="text-ink-heading font-medium hover:underline">
                            Agents
                        </Link>
                        . What follows here is the other three things that fall out of the six.
                    </p>
                </div>
            </MarketingSection>

            <MarketingSection title="What the chain holds.">
                <div className="space-y-4 text-base text-ink-body leading-relaxed max-w-prose">
                    <p>
                        Almost nothing of its own. Every token inside is bonded to one open process, earmarked for that process&apos;s parties and reachable by nobody else &mdash; the smart contract keeps no balance it could spend. Resolution sends all of it back out; a process nobody ever resolves keeps its bonds locked where they are, permanently, which is the deterrent the whole design rests on rather than a gap in it. And because each commitment only ever looks at one handoff between two parties, the chain never needs the trade itself: it needs a <em>fingerprint</em> of the agreement and nothing more.
                    </p>
                    <figure className="my-6">
                        <MerkleTreeFigure
                            leaves={["the commerce terms", "the cargo", "the delivery terms", "the arbitration forum"]}
                            idPrefix="invariants-fingerprint"
                            accessibleTitle="How the fingerprint is built"
                            accessibleDesc="The agreement's parts as leaves, hashed pair by pair down to the single root the chain holds."
                        />
                        <figcaption className="text-sm text-ink-muted mt-2 max-w-prose">
                            Every clause section of the agreement is a leaf; pairs are hashed together, level by level, down to one root &mdash; the fingerprint. The chain holds only the root.
                        </figcaption>
                    </figure>
                    <p>
                        The agreement, the terms, the proof that something was delivered all live outside the chain, pinned where their owner chooses; the fingerprint cannot rebuild any of it and never tries, it just makes exactly one version of the outside detail acceptable &mdash; change anything out there by a hair and the math throws it out. What that leaves in your hands &mdash; what stays sealed, and what you can sell &mdash; is on{" "}
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
                        The agreement was the first thing to leave the chain, not the last. Everything a trade touches can stay where it already lives and couple to the core through the same small boundary &mdash; in its own medium, never handed to Figaro to be secured.
                    </p>
                    <ul className="space-y-3">
                        <li>
                            <strong className="text-ink-heading">Your data stays yours.</strong> The documents, the photos, the trail of what happened &mdash; they live in storage you control, not in a company&apos;s database. Nothing has to be handed over to be made trustworthy.
                        </li>
                        <li>
                            <strong className="text-ink-heading">Your identity stays yours.</strong> A wallet is enough to act. A name, a reputation, a web address can attach to it &mdash; or not. Figaro issues none of it and can revoke none of it.
                        </li>
                        <li>
                            <strong className="text-ink-heading">The work can be done by anyone &mdash; or anything.</strong> An ordinary web service, or an autonomous agent, takes a role in a trade on exactly the same terms a person does.
                        </li>
                        <li>
                            <strong className="text-ink-heading">The law that applies is named, not assumed.</strong> Which country&apos;s rules govern a trade is written into the agreement and decided in that forum, off-chain. The core takes no side; it just keeps the data a court can read.
                        </li>
                    </ul>
                    <p>
                        Anything already on-chain composes too &mdash; a token, an item held in a wallet, another smart contract that prices or matches or pays out. The core never had to be taught about any of it: if a wallet holds it, an assembly can compose it. That openness was never something Figaro had to build &mdash; it is what having a boundary instead of a platform means.
                    </p>
                </div>
            </MarketingSection>

            <MarketingSection title="Where the meaning lives." bottomPad="wide">
                <div className="space-y-4 text-base text-ink-body leading-relaxed max-w-prose">
                    <p>
                        A law this small barely says anything on its own. What it means shows up one level up: in the agreements people write on it, the roles they take, the multi-party processes they assemble. And that is what the network&apos;s token pays for &mdash; not the core, which runs itself, but the clauses and assemblies built on it, and the designers the protocol{" "}
                        <Link href="/rpgf" className="text-ink-heading font-medium hover:underline">
                            pays for the ones it comes to rely on
                        </Link>
                        .
                    </p>
                    <p className="text-ink-heading font-medium">
                        The core is a small law that holds. Everything that gives it meaning is built on top, which is why building on it isn&apos;t optional. It&apos;s the point.
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
