import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import Link from "@/components/shared/Link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingSection } from "@/components/marketing/MarketingSection";
import { MerkleForestFigure } from "@/components/figures/MerkleForestFigure";

export const metadata: Metadata = withOg({
    title: "Your data — Figaro Protocol",
    description:
        "Opening your own books to a buyer is an ordinary bonded sale, on your terms. What arrives is provable. The protocol never holds your private trade data, only a fingerprint.",
});

export default function Data() {
    return (
        <>
            <MarketingHero
                title="Your data. Your terms."
                lead={
                    <>
                        Opening your own books to a buyer is an ordinary bonded sale, on your terms. Letting someone else in on your trade data is itself a trade. You sell access to it the same bonded way you sell anything else. None of it needed a new smart contract: this whole market is two ordinary clauses composed onto a bonded sale. Each trade you resolve leaves a fingerprint on the chain and its detail with you, pinned where you choose and disclosed only when you choose (<Link href="/data" className="text-ink-heading font-medium hover:underline">the two traces</Link>).
                    </>
                }
            />

            <MarketingSection title="Two clauses, and no new smart contract.">
                <p className="text-base text-ink-body leading-relaxed">
                    The data market runs on two ordinary clauses, composed onto a bonded sale like any other term of trade. One sets the disclosure regime for a process&apos;s own data. The other sets the terms of a specific sale. Two reference assemblies show the whole round trip. One is a credentialed survey whose flight data is licensed onward. The other is a standing subscription to another member&apos;s growing data. Both are proved end to end on the developer network the reference suite runs against. Browse the <Link href="/clauses" className="text-ink-heading font-medium hover:underline">clauses</Link> and <Link href="/assemblies" className="text-ink-heading font-medium hover:underline">assemblies</Link> for the exact terms, and publish your own beside them. The reference set is a starting point, not the catalog.
                </p>
            </MarketingSection>

            <MarketingSection title="What the chain keeps.">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    A trade commits its fingerprint on-chain, and resolution closes it. The fingerprint is a hash of the agreement, timestamped and permanent, never the agreement itself. The agreement becomes a merkle tree: the clauses are its leaves, and the root is the fingerprint the chain keeps. The detail itself lives on storage you control, which is why the ownership is real. What the fingerprint buys is narrow, and worth being exact about. It proves that a specific piece of data matches a specific resolved trade. It proves nothing about what that data says. Why a boundary this thin can hold an unbounded world honest is on <Link href="/invariants" className="text-ink-heading font-medium hover:underline">Invariants</Link>.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-8">
                    The arrangement is easiest to see as a direction of travel. Value converges. Every payment and every bond is pulled into one resolution. It radiates back out the moment the buyer resolves, payouts and bonds together, in a single transaction. The data does the opposite. Only a fingerprint crosses onto the chain. The detail disperses to the people who produced it. What travels outward is the aggregate public map, to everyone at once. A platform ran both the other way.
                </p>
                <MerkleForestFigure />
            </MarketingSection>

            <MarketingSection title="Opening your books is a trade too.">
                <p className="text-base text-ink-body leading-relaxed">
                    The detail stays with whoever co-produced it, buyer or seller alike. It is the agreement&apos;s actual content, the evidence behind the fingerprint, and the running history each side keeps of its own trades. It sits in storage they hold and is disclosed only by their own choice. Letting a buyer in on that data is an ordinary bonded sale, not a feature bolted onto the protocol. It is agreed and resolved the same way any other value passes between two wallets. A designer sets the disclosure regime once, up front: closed to the two parties, each side free to share its own copy, or open to either. A buyer commits their own half of that choice at checkout. The data&apos;s owner writes the terms of any specific sale once, on the catalog item that offers it, the way any posted price is set. The terms say what is licensed, for what purpose, as a one-time snapshot or a continuing stream, and whether it can be passed on again. A buyer reads them and signs. Nothing is negotiated at the counter, because the terms travel with the item.
                </p>
            </MarketingSection>

            <MarketingSection title="What arrives is provable, not promised.">
                <p className="text-base text-ink-body leading-relaxed">
                    Licensed data does not arrive on the seller&apos;s word. A delivery that names its source trades carries a proof tying it back to the exact resolved trades that produced it. The proof is checked against those trades&apos; own on-chain fingerprints. So a buyer can confirm the data is genuine without trusting the seller selling it. That is what makes selling access to it practical in the first place. The same doubled bond that secures every other trade here replaces the usual need to inspect the goods before agreeing to pay for them.
                </p>
            </MarketingSection>

            <MarketingSection title="Erasure, honestly." bottomPad="wide">
                <p className="text-base text-ink-body leading-relaxed">
                    What you publish you can erase by unpinning it. Unpinning cannot reach two things: the on-chain fingerprint, permanent by design, and any copy another node took before you unpinned. Both are stated in full on <Link href="/core/faq#privacy" className="text-ink-heading font-medium hover:underline">the FAQ</Link>.
                </p>
            </MarketingSection>
        </>
    );
}
