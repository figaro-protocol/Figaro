import type { Metadata } from "next";
import Link from "next/link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingSection } from "@/components/marketing/MarketingSection";

export const metadata: Metadata = {
    title: "Physics — Figaro Protocol",
    description:
        "The Figaro core is a small contract that obeys a few physical facts — nothing is kept, the deal only moves forward, the rule is local. Those facts are why its state can leave the chain, why anything can compose against it, and why trust moves from the platform in the middle to the boundary at the edge.",
};

export default function Physics() {
    return (
        <>
            <MarketingHero
                title="Physics."
                lead="Figaro started as a contract for buying safely from a stranger. It worked — and it could not scale, because it tried to hold the whole agreement itself. The fix was not more code. It was noticing that the core only has to obey a few physical facts, and everything else can leave. What is left is a primitive, not a platform — the thin, fixed layer trade is built on, the way the network is built on TCP/IP."
            />

            <MarketingSection title="Three facts, not three rules.">
                <div className="space-y-4 text-base text-ink-body leading-relaxed max-w-prose">
                    <p>
                        People meet Figaro through three plain promises &mdash; skin in the game, one-way progress,{" "}
                        <Link href="/protocol" className="text-ink-heading font-medium hover:underline">
                            sovereign settlement
                        </Link>
                        . Underneath, those aren&apos;t policies someone chose. They are what three physical facts of the contract feel like from the outside.
                    </p>
                    <ul className="space-y-3">
                        <li>
                            <strong className="text-ink-heading">Nothing is kept.</strong> Every token that goes in comes back out to one of the two parties. The contract never holds a balance of its own &mdash; no leak, no pool, no house. It is a closed system.
                        </li>
                        <li>
                            <strong className="text-ink-heading">The deal only moves forward.</strong> Value adds up; it never runs backward. A deal settles completely or not at all. There is no rewind.
                        </li>
                        <li>
                            <strong className="text-ink-heading">The rule is local.</strong> The contract only ever looks at one handoff, between two parties, at a time. It never needs a map of the whole network to do its job.
                        </li>
                    </ul>
                    <p>
                        A contract built on physics instead of policy can&apos;t be argued with, paused, or quietly changed &mdash; because there is no one in the middle to do it. The three promises are the readable form of these three facts; the facts are the readable form of six on-chain invariants underneath.
                    </p>
                </div>
            </MarketingSection>

            <MarketingSection title="Why the state can leave.">
                <div className="space-y-4 text-base text-ink-body leading-relaxed max-w-prose">
                    <p>
                        Because the rule is local and nothing is kept, the chain doesn&apos;t need to hold your agreement &mdash; it only needs a <em>fingerprint</em> of it. The agreement itself, the terms, the proof that something was delivered &mdash; all of it lives outside the chain. The fingerprint does the securing. Change anything outside by a hair and the fingerprint stops matching, and the math throws it out.
                    </p>
                    <p>
                        The fingerprint can&apos;t rebuild the agreement from itself, and it never tries to. It only <em>pins it down</em> &mdash; it makes exactly one version of the outside detail acceptable, so nothing can be swapped underneath it. That is enough. A contract that once had to carry everything became one that carries almost nothing &mdash; and gave up none of its security doing it. A small, fixed boundary holds an unbounded world honest. The longer version is in the{" "}
                        <Link href="/papers" className="text-ink-heading font-medium hover:underline">
                            papers
                        </Link>
                        .
                    </p>
                </div>
            </MarketingSection>

            <MarketingSection title="The same move, for everything.">
                <div className="space-y-4 text-base text-ink-body leading-relaxed max-w-prose">
                    <p>
                        The chain only needs a fingerprint &mdash; and the agreement was just the first thing to leave it, not the last. Everything a deal touches can stay where it already lives and couple to the core through the same small boundary &mdash; in its own medium, never handed to Figaro to be secured.
                    </p>
                    <ul className="space-y-3">
                        <li>
                            <strong className="text-ink-heading">Your data stays yours.</strong> The documents, the photos, the records of what happened &mdash; they live in storage you control, not in a company&apos;s database. The chain holds only a fingerprint. Nothing has to be handed over to be made trustworthy.
                        </li>
                        <li>
                            <strong className="text-ink-heading">Your identity stays yours.</strong> A wallet is enough to act. A name, a reputation, a web address can attach to it &mdash; or not. Figaro issues none of it and can revoke none of it.
                        </li>
                        <li>
                            <strong className="text-ink-heading">The work can be anyone &mdash; or anything.</strong> The core can&apos;t tell a person from a program. A signature is a signature, and it is the only thing the core reads. An ordinary web service, or an autonomous agent, takes a role in a deal on exactly the same terms a human does.
                        </li>
                        <li>
                            <strong className="text-ink-heading">The law that applies is named, not assumed.</strong> Which country&apos;s rules govern a deal is written into the agreement and settled in that forum, off-chain. The core takes no side; it just keeps the record a court can read.
                        </li>
                    </ul>
                    <p>
                        Anything already on-chain composes too &mdash; a token, an item held in a wallet, another contract that prices or matches or settles. The core never had to be taught about any of it: if a wallet holds it, an assembly can compose it. The core exposes one honest boundary, and the world composes against it. That openness was never something Figaro had to build &mdash; it is what having a boundary instead of a platform means.
                    </p>
                </div>
            </MarketingSection>

            <MarketingSection title="Why there is more than the core.">
                <div className="space-y-4 text-base text-ink-body leading-relaxed max-w-prose">
                    <p>
                        A law this small barely says anything on its own. You can&apos;t read a market off a single rule any more than you can read the weather off a single molecule &mdash; the behavior worth having only appears when many of them interact. The meaning of Figaro&apos;s core lives one level up: in the agreements people write on it, the roles they take, the multi-party processes they assemble.
                    </p>
                    <p>
                        That is why the rest of Figaro exists. Not as decoration on the core &mdash; as the only level at which the core <em>means</em> anything. The core is complete and, by itself, silent. You hear it in what gets built on it.
                    </p>
                    <p>
                        And that is what the network&apos;s token is for. It doesn&apos;t pay to run the core; the core runs itself. It{" "}
                        <Link href="/rpgf" className="text-ink-heading font-medium hover:underline">
                            rewards the people who build the layer
                        </Link>{" "}
                        that makes the core legible and usable &mdash; the clauses, the agreements, the assemblies. The protocol pays for its own emergence.
                    </p>
                    <p className="text-ink-heading font-medium">
                        The core is a small law that holds. The network is what emerges when people build on it. Building on it isn&apos;t optional &mdash; it&apos;s the point.
                    </p>
                </div>
            </MarketingSection>

            <MarketingSection title="Who gets to act.">
                <div className="space-y-4 text-base text-ink-body leading-relaxed max-w-prose">
                    <p>
                        Start with who <em>governs</em> &mdash; and the answer is no one. The rules are math; no party sets them, and no party can quietly change them. That settles a different question than who is allowed to <em>act</em>, and the answer there is the surprising one: anyone, or anything. The core can&apos;t tell a person from a program. The one thing it reads is a signature, and a signature carries no clue to what made it. So a piece of software can be a full participant in a deal: it can take a role, lock a bond, deliver, and settle, on exactly the terms a human does &mdash; and it can open the deal in the first place, standing as the buyer that starts a whole chain of work with no person in it.
                    </p>
                    <p>
                        On the internet we have, an automated actor has to be let in. A platform grants it a key to an interface. An authority issues it an identity. A custodian agrees to hold its money. Every one of those is a permission, handed down by someone in the middle &mdash; and a permission can always be withdrawn.
                    </p>
                    <p>
                        Here there is no one to ask. An agent needs only a wallet to sign with, a bond to put at stake, and the public record to read &mdash; and all three it can get for itself. Nothing is granted to it; nothing can be revoked from it. The same boundary that lets two strangers deal without a middleman is what lets software deal without a keeper. None of this was built for agents. It is the same boundary the whole protocol rests on &mdash; and agents are the first actors who could never have existed without it. There is more on how they{" "}
                        <Link href="/agents" className="text-ink-heading font-medium hover:underline">
                            participate
                        </Link>
                        .
                    </p>
                </div>
            </MarketingSection>

            <MarketingSection title="A different place to put your trust." bottomPad="wide">
                <div className="space-y-4 text-base text-ink-body leading-relaxed max-w-prose">
                    <p>
                        Step back and the whole shape is one idea. The internet we have asks you to trust the platform in the middle &mdash; the one that holds your data, your identity, your money, and promises to behave. You trust the keeper of the pile.
                    </p>
                    <p>
                        This is the other arrangement. Trust sits in the boundary &mdash; a stake large enough that cheating loses, and a fingerprint nothing can be swapped underneath. The pile never moves; it stays with whoever owns it. Keeping your own data isn&apos;t a feature added on top &mdash; it falls out for free, because the chain only ever held a fingerprint of it in the first place.
                    </p>
                    <p>
                        What is left is a thin, fixed layer that everything composes against and no one owns &mdash; the way the network runs on TCP/IP. Not a new internet bolted over the old one. The same internet, with trust moved from the keeper in the middle to the boundary at the edge.
                    </p>
                    <p>
                        This is the structural reading. There is also a historical one: this is the third era of rule-making &mdash; after force, after belief &mdash; and{" "}
                        <Link href="/why" className="text-ink-heading font-medium hover:underline">
                            why it arrives now
                        </Link>{" "}
                        is its own story.
                    </p>
                </div>
            </MarketingSection>
        </>
    );
}
