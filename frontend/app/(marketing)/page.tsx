import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import Link from "next/link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MerkleForestFigure } from "@/components/figures/MerkleForestFigure";

export const metadata: Metadata = withOg({
    title: "Figaro Protocol — My word is my bond",
    description:
        "Every deal runs as a value-added process that enforces itself: both sides stake tokens worth more than cheating could gain, the record it leaves is public in aggregate and private in detail, and the profit stays with the hands that made it.",
});

// Copy constraints the code can't show: "process" always means the economic
// object, "the blockchain" the substrate, "record" what a process leaves —
// never blur the referents. The cents claim is COORDINATION friction
// (lawyer/accountant/platform), not gas alone. The unhappy path lives on
// /faq (the FAQ owns it); home points, never carries it.
export default function Home() {
    return (
        <>
            <MarketingHero
                title="The Figaro Ecosystem"
                tagline="My word is my bond"
                lead={
                    <>
                        From guilds to banks to platforms, every economic system has fought over the same two questions: who enforces a deal, and who keeps the profit. Figaro&apos;s answer: both sides stake tokens worth more than cheating could gain &mdash; so no one needs to stand in the middle.
                    </>
                }
            />

            <section className="container mx-auto px-6 pb-12 max-w-3xl">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Every deal on Figaro runs as a value-added process: each hand adds value on its way from first supplier to final buyer &mdash; a single meal, or a freight route across an ocean &mdash; and the whole process settles as one.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    What it leaves behind is a record, and the record, like the data inside it, is public and private at once. In aggregate it joins a public map of the market &mdash; the same for everyone who reads it. Its detail stays in your hands, under your control: sealed, shown when you choose, sold only if you choose. The blockchain holds nothing but a fingerprint of each agreement &mdash; the detail was never on the chain, which is why that control is real.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    That record doubles as your paperwork: to a legal, regulatory, or fiscal demand &mdash; a regulator, a tax authority, a court &mdash; you demonstrate from the record instead of asking anyone to take your word. The venue still rules; it just rules on evidence.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    And Figaro is never a finished catalogue: the terms of a deal are open parts anyone can write, improve, and be paid for as others use them &mdash; so new kinds of deals appear without waiting for anyone&apos;s approval. Your keys, your signatures, your data, the same rules in math for everyone: what a platform asks you to believe, Figaro lets you check.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    The two questions every system fought over finally have answers: the deal enforces itself, and the profit stays with the hands that made it. The coordination that once needed institutions &mdash; a lawyer for the terms, an accountant for the books, a platform for the trust &mdash; is carried by a blockchain instead: securing a whole deal on Ethereum costs a few cents, and batched settlement cuts that to a sixth.
                </p>
            </section>

            <section className="container mx-auto px-6 pb-16 max-w-3xl border-t border-default pt-xl">
                <h2 className="text-heading-h2 text-ink-heading mb-6">How a deal holds together</h2>
                <p className="text-base text-ink-body leading-relaxed mb-8">
                    Beneath the words the machinery is small. Each agreement in a deal becomes a merkle tree: the clauses are its leaves, the root is the fingerprint the blockchain keeps. Anyone reading the record sees only the clauses the owner chooses to reveal.
                </p>
                <MerkleForestFigure />
                <p className="text-base text-ink-body leading-relaxed mt-8">
                    The same machinery serves a single meal and a freight route across an ocean: the terms and the data stay where you control them, and one fingerprint sits where nobody can rewrite it.
                </p>
                <div className="flex flex-col sm:flex-row justify-center gap-4 mt-10">
                    <Link
                        href="/kernel"
                        className={
                            "inline-flex min-w-[200px] justify-center items-center gap-1 px-9 py-sm bg-paper text-ink-primary text-sm font-medium rounded-tile border border-ink-primary " +
                            "hover:bg-ink-primary hover:text-paper hover:no-underline transition-colors " +
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-focus"
                        }
                        data-testid="cta-kernel"
                    >
                        How it works <span aria-hidden="true">&rarr;</span>
                    </Link>
                    <Link
                        href="/why"
                        className={
                            "inline-flex min-w-[200px] justify-center items-center gap-1 px-9 py-sm bg-paper text-ink-primary text-sm font-medium rounded-tile border border-ink-primary " +
                            "hover:bg-ink-primary hover:text-paper hover:no-underline transition-colors " +
                            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-focus"
                        }
                        data-testid="cta-why"
                    >
                        Why this exists <span aria-hidden="true">&rarr;</span>
                    </Link>
                </div>
            </section>
        </>
    );
}
