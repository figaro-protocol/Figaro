import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import Link from "next/link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingSection } from "@/components/marketing/MarketingSection";
import { MerkleForestFigure } from "@/components/figures/MerkleForestFigure";
import {
    READING_PATH_RUNGS,
    READING_PATH_STEPS,
} from "@/components/marketing/readingPathSteps";

export const metadata: Metadata = withOg({
    title: "Figaro Protocol — My word is my bond",
    description:
        "Write a process: clauses write the agreement between a buyer and a seller, and, composed into an assembly, many sellers run one process a whole market can reuse. It holds because one contract makes keeping your word the winning move — and the record it leaves answers taxation, consent, emissions, or a courtroom alike.",
});

// Copy constraints the code can't show: "process" always means the economic
// object, "the blockchain" the substrate, "record" what a process leaves —
// never blur the referents. The cost claim is GAS with its basis stated
// ("cents to a few dollars … at typical network prices" — the FAQ's honest
// range); never re-inflate to "pennies", never conflate with the
// coordination-friction savings the sections enumerate.
// The unhappy path lives on
// /faq (the FAQ owns it); home points, never carries it.
// The reading-path section is the ruled spine — see
// `components/marketing/readingPathSteps.ts`.
//
// SECTION ORDER is the safe→build reorientation (maintainer, 2026-08-24, on
// the 2026-08-22 USP ratification): what anyone can BUILD leads, and the
// enforcement mechanism follows as the warrant a reader has just acquired a
// reason to ask for. Do not restore enforcement to first position.
//
// COMPOSITION ORDER, wherever composition is named here or elsewhere on the
// site (maintainer, 2026-08-24, B.5): value mobility first (value captured in
// one market moves to the next through an ordinary swap), then the game
// theory framed as "disputes become the exception", then legacy integration
// — taxation, regulation, a forum. Never lead a composition list with
// arbitration.
//
// The florin paragraph is deliberately SEPARATE from the community- and
// designer-token examples beside it: the florin is a pure Schelling point, not
// one more community token, and merging the paragraphs collapses that.
export default function Home() {
    return (
        <>
            <MarketingHero
                title="My word is my bond"
                lead={
                    <>
                        <strong className="text-ink-heading">Write a process.</strong> Clauses write the agreement between a buyer and a seller; composed into an assembly, many sellers run one process &mdash; and a whole market can run the same one. Value captured in one market moves to the next through an ordinary token swap. Software agents trade, author, and operate on the same footing as people, and the data a process throws off stays yours: the aggregate map is public, the detail sealed and sellable only on your terms.
                    </>
                }
            >
                <p className="text-body-lead text-ink-muted max-w-2xl mt-5">
                    It holds because one contract makes keeping your word the winning move &mdash; disputes become the exception, not the norm &mdash; and when taxation, consent, emissions, or a courtroom still asks, the same verifiable record answers. What we built is the start, not the boundary: the protocol is designed to outlive its builders, with nine tenths of its tokens reserved for the community that extends it &mdash; paid to whoever writes the clauses and assemblies the world ends up using. All of it transparent; all of it verifiable.
                </p>
                {/* The promoted thesis + audience router (ruled 2026-08-25 on the
                    run-13 evidence: the plain pitch and the newcomer's door belong
                    in the first screen). The copy is the ruled closing-section
                    copy MOVED, not re-authored — one canonical home, up here. */}
                <p className="text-body-lead text-ink-muted max-w-2xl mt-5">
                    If you keep one sentence, keep this one: one thin, ownerless layer that makes any deal between strangers safe &mdash; and above it, any value-added process anyone cares to build, in whatever currency that market&apos;s author chose, a stablecoin or a community&apos;s own token, the mechanism identical either way, with everything the process produces left in the hands that produced it. Start where you are:
                    new to all of this, begin with{" "}
                    <Link href="/local-commerce" className="text-ink-heading hover:underline">one deal, lived end to end</Link>;
                    building on it, start at{" "}
                    <Link href="/spec" className="text-ink-heading hover:underline">Specifications</Link>;
                    checking the claims, the{" "}
                    <Link href="/working-groups" className="text-ink-heading hover:underline">papers</Link>{" "}
                    carry the proofs.
                </p>
            </MarketingHero>

            <MarketingSection title="Anyone can write the terms of a market">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    <Link href="/glossary#clause" className="text-ink-heading hover:underline">Clauses</Link> and <Link href="/glossary#assembly" className="text-ink-heading hover:underline">assemblies</Link> are public building blocks, not paperwork filed away. Anyone can write a clause and publish it for reuse. Anyone can compose clauses into an assembly &mdash; a whole deal-shape &mdash; and publish that. A deal is an assembly put to work: the shape filled in with real hands, amounts, and signatures. Markets need no operator either: a buyer&apos;s request races to whichever sellers want it, or goes out for quotes &mdash; offers form on their own, from the network.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    The commons pays for its own growth: <Link href="/tokenomics" className="text-ink-heading hover:underline">the florin</Link>, the protocol&apos;s own token, has a supply fixed at a billion, and 600 million of it are set aside for authors whose clauses and assemblies get used, paid pro-rata by real use, after the fact. Where the other 400 million sits is itemized on{" "}
                    <Link href="/rpgf" className="text-ink-heading hover:underline">Rewards for designers</Link>. The whole split is readable on the chain.
                </p>
            </MarketingSection>

            <MarketingSection title="Many deals make an economy">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    When many deals share a token, that is not a feature &mdash; it is an economy. A neighborhood&apos;s own token, spent by its diaspora in Los Angeles or Lima, holds value at home. A designer pins their token to their assembly, and a micro-economy grows around their work. Each is a working economy on the same kernel.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    The florin is never required: it is the neutral case, useful precisely because anyone, anywhere can agree on it.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-8">
                    Every economy leaves a record, and Figaro splits it the opposite way a platform does: the aggregate map of the market is public, the same for everyone who reads it. The detail is yours. Your data is an asset you own: seal it, show it to whom you choose, or sell it on your own terms. The blockchain holds nothing but a fingerprint of each agreement: the agreement becomes a merkle tree, the clauses its leaves, the root the fingerprint the chain keeps. The detail itself lives on storage you control &mdash; which is why that ownership is real.
                </p>
                <MerkleForestFigure />
            </MarketingSection>

            <MarketingSection title="One deal that enforces itself">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Every trade is a contract. Between strangers, one part of it always fails: promising is easy, delivering is not, and nothing about the promise makes the delivery credible. Arithmetic does. The buyer bonds twice the payment. Each seller bonds twice the value the trade has accumulated at their link. Keeping your word becomes everyone&apos;s best move &mdash; a theorem, not a policy. There is no amount that is clever to steal. When the buyer accepts, the whole trade resolves at once on Ethereum: everyone is paid, every bond returns, and securing it all costs cents to a few dollars of fixed gas at typical network prices, batched at scale.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    The grower, the roaster, the caf&eacute;. The writer, the editor, the printer. A trade is rarely two people; it is a chain of hands, each adding value &mdash; and the chain resolves as one. When a trade goes wrong, remedies are negotiated while every bond is still locked; the FAQ has the long version. Anyone who can sign can take part: a person, a business, a software agent, an asset with its own wallet &mdash; the protocol has no gatekeeper to admit you or turn you away.
                </p>
            </MarketingSection>

            <MarketingSection title="Every deal spins up a company — and dissolves it at settlement">
                <p className="text-base text-ink-body leading-relaxed">
                    A company is a bundle of functions held together long enough to make trades happen; a Figaro trade spins each one up for the length of a single trade, then winds it up. The legal department is clauses: the terms of the trade, written by anyone, published for reuse. The org chart is an assembly: who adds value in what order. The books, the audit, and compliance are the data the trade leaves behind. The treasury and the boss are the same thing &mdash; the kernel, the small resolution engine every trade runs on. It holds both sides&apos; bonds and does the manager&apos;s work by arithmetic. Nothing is incorporated and nothing is deployed. When the buyer resolves, the company that never existed winds up.
                </p>
            </MarketingSection>

            <MarketingSection title="How it meets the world">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    These economies open outward, and they are neither silos nor an exit from the world. One swap carries value between them and out to the currency you already use &mdash; a single hop on an open exchange, not a banking pipeline. Deals compose with everything else on the chain: that same swap, a fiscal multisender through which a wallet splits its own receipts, leaving a fiscal trail as a byproduct, and &mdash; for the exception rather than the norm &mdash; an arbitration forum&apos;s ruling (<Link href="/composition" className="text-ink-heading hover:underline">Composition</Link>).
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    The record doubles as your paperwork: to a regulator, a tax authority, a court, you demonstrate rather than ask to be believed.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    Through all of it, you hold your own keys: your wallet, your tokens, your signatures. Nobody holds them for you. No account anyone can freeze or close. The kernel holds only live trades&apos; bonds, and only until each resolves.
                </p>
            </MarketingSection>

            <MarketingSection title="Read the whole story" sectionId="reading-path" bottomPad="wide">
                <p className="text-base text-ink-body leading-relaxed mb-3">
                    Read in order; each page teaches one thing.
                </p>
                <div className="space-y-8">
                    {READING_PATH_RUNGS.map((rung) => (
                        <div key={rung}>
                            <h3 className="text-heading-h3 text-ink-heading mb-3">{rung}</h3>
                            <ol className="space-y-2">
                                {READING_PATH_STEPS.filter((step) => step.rung === rung).map((step) => (
                                    <li key={step.href} className="text-base text-ink-body leading-relaxed">
                                        <Link href={step.href} className="text-ink-heading hover:underline">
                                            {step.label}
                                        </Link>
                                        {" — "}
                                        {step.description}
                                    </li>
                                ))}
                            </ol>
                        </div>
                    ))}
                </div>
            </MarketingSection>
        </>
    );
}
