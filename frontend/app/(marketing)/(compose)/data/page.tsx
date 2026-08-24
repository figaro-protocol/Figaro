import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import Link from "next/link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingSection } from "@/components/marketing/MarketingSection";

export const metadata: Metadata = withOg({
    title: "Data — Figaro Protocol",
    description:
        "The protocol never holds your private trade records — only a fingerprint. The public half of every trade is a shared map anyone can read. And opening your own books to a buyer is an ordinary bonded sale, on your terms, arriving provable.",
});

export default function Data() {
    return (
        <>
            <MarketingHero
                title="Your records. Your terms."
                lead={
                    <>
                        Every trade you settle leaves two kinds of trace: a fingerprint on the chain, and the record of what actually happened &mdash; the agreement, the evidence, the books you kept. The protocol only ever holds the first. The second stays with you, pinned where you choose, disclosed only when you choose &mdash; and because letting someone else in on it is itself a trade, you can sell access to it the same bonded way you sell anything else.
                    </>
                }
            />

            <MarketingSection title="What the chain keeps.">
                <p className="text-base text-ink-body leading-relaxed">
                    Settling a trade produces a fingerprint on-chain &mdash; a hash of the agreement, timestamped and permanent &mdash; never the agreement itself. What that buys is narrow, and worth being exact about: it proves that a specific record matches a specific settled trade, and proves nothing about what the record says. Why a boundary this thin can hold an unbounded world honest is on <Link href="/invariants" className="text-ink-heading font-medium hover:underline">Invariants</Link>.
                </p>
            </MarketingSection>

            <MarketingSection title="The half that's shared.">
                <p className="text-base text-ink-body leading-relaxed">
                    One part of every trade is meant to be public: who moved what, to whom, roughly where, and whether it settled &mdash; a neighborhood&apos;s demand, a seller&apos;s settlement record, a route&apos;s reliability, all readable straight from the chain, by anyone, without asking permission. This is the map a delivery platform used to keep to itself so it alone could match supply to demand. Figaro puts it in the open by construction instead, and the network&apos;s own token pays whoever keeps drawing it &mdash; see <Link href="/rpgf" className="text-ink-heading font-medium hover:underline">how that works</Link>.
                </p>
            </MarketingSection>

            <MarketingSection title="Opening your books is a trade too.">
                <p className="text-base text-ink-body leading-relaxed">
                    The other half &mdash; the agreement&apos;s actual content, the evidence behind the fingerprint, the running record each side keeps of its own trades &mdash; stays with whoever co-produced it, buyer or seller alike, in storage they hold, disclosed only by their own choice. Letting a buyer in on that record is not a feature bolted onto the protocol. It is an ordinary bonded sale, agreed and settled the same way any other value passes between two wallets. A designer sets the disclosure regime once, up front: closed to the two parties, each side free to share its own copy, or open to either. A buyer commits their own half of that choice at checkout. The terms of any specific sale &mdash; what is licensed, to whom, for what purpose, as a one-time snapshot or a continuing stream, and whether it can be passed on again &mdash; are written once by the record&apos;s owner, on the catalogue item that offers it, the way any posted price is set. A buyer reads them and signs; nothing is negotiated at the counter, because the terms travel with the item.
                </p>
            </MarketingSection>

            <MarketingSection title="What arrives is provable, not promised.">
                <p className="text-base text-ink-body leading-relaxed">
                    A licensed record does not arrive on the seller&apos;s word. Each one carries a proof tying it back to the exact settled trade that produced it, checked against that trade&apos;s own on-chain fingerprint &mdash; so a buyer can confirm a record is genuine without trusting the seller selling it. That is what makes selling access to a record practical in the first place: the same doubled stake that secures every other trade here replaces the usual need to inspect the goods before agreeing to pay for them.
                </p>
            </MarketingSection>

            <MarketingSection title="See it built.">
                <p className="text-base text-ink-body leading-relaxed">
                    None of this needed a new contract. The data market runs on two ordinary clauses, composed onto a bonded sale like any other term of trade: one sets the disclosure regime for a process&apos;s own records, the other sets the terms of a specific sale. Two reference assemblies show the whole round trip &mdash; a credentialed survey whose flight record is licensed onward, and a standing subscription to another member&apos;s growing record. What you can check right now is those same assemblies, proved end to end on the developer network the reference suite runs against. Browse the <Link href="/clauses" className="text-ink-heading font-medium hover:underline">clauses</Link> and <Link href="/assemblies" className="text-ink-heading font-medium hover:underline">assemblies</Link> for the exact terms.
                </p>
            </MarketingSection>

            <MarketingSection title="Erasure, honestly." bottomPad="wide">
                <p className="text-base text-ink-body leading-relaxed">
                    What you publish, you can erase: unpinning stops your node serving it and lets the network garbage-collect it. Two things it cannot reach &mdash; a fingerprint on-chain, which is permanent by design, since the whole point is that nothing can be swapped in underneath it; and a copy another node already took before you unpinned. The honest limits are stated in full on <Link href="/faq#privacy" className="text-ink-heading font-medium hover:underline">the FAQ</Link>.
                </p>
            </MarketingSection>
        </>
    );
}
