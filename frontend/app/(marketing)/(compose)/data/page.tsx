import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import Link from "next/link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingSection } from "@/components/marketing/MarketingSection";
import { CtaLink } from "@/components/marketing/CtaLink";
import { MerkleForestFigure } from "@/components/figures/MerkleForestFigure";

export const metadata: Metadata = withOg({
    title: "Data — Figaro Protocol",
    description:
        "The protocol never holds your private trade data — only a fingerprint. The public half of every trade is a shared map anyone can read. And opening your own books to a buyer is an ordinary bonded sale, on your terms, arriving provable.",
});

export default function Data() {
    return (
        <>
            <MarketingHero
                title="Your data. Your terms."
                lead={
                    <>
                        Every trade you resolve leaves two kinds of trace: a fingerprint on the chain, and the trail of what actually happened &mdash; the agreement, the evidence, the books you kept. The protocol only ever holds the first. The second stays with you, pinned where you choose, disclosed only when you choose &mdash; and because letting someone else in on it is itself a trade, you can sell access to it the same bonded way you sell anything else. None of it needed a new contract: this whole market is two ordinary clauses composed onto a bonded sale.
                    </>
                }
            />

            <MarketingSection title="Two clauses, and no new contract.">
                <p className="text-base text-ink-body leading-relaxed">
                    The data market runs on two ordinary clauses, composed onto a bonded sale like any other term of trade: one sets the disclosure regime for a process&apos;s own data, the other sets the terms of a specific sale. Two reference assemblies show the whole round trip &mdash; a credentialed survey whose flight data is licensed onward, and a standing subscription to another member&apos;s growing data, both proved end to end on the developer network the reference suite runs against. Browse the <Link href="/clauses" className="text-ink-heading font-medium hover:underline">clauses</Link> and <Link href="/assemblies" className="text-ink-heading font-medium hover:underline">assemblies</Link> for the exact terms &mdash; and publish your own beside them; the reference set is a starting point, not the catalogue.
                </p>
            </MarketingSection>

            <MarketingSection title="What the chain keeps.">
                <p className="text-base text-ink-body leading-relaxed mb-8">
                    A trade commits its fingerprint on-chain &mdash; a hash of the agreement, timestamped and permanent, never the agreement itself &mdash; and resolution closes it. The agreement becomes a merkle tree, the clauses its leaves, the root the fingerprint the chain keeps; the detail itself lives on storage you control, which is why the ownership is real. What the fingerprint buys is narrow, and worth being exact about: it proves that a specific piece of data matches a specific resolved trade, and proves nothing about what that data says. Why a boundary this thin can hold an unbounded world honest is on <Link href="/invariants" className="text-ink-heading font-medium hover:underline">Invariants</Link>.
                </p>
                <MerkleForestFigure />
            </MarketingSection>

            <MarketingSection title="The half that's shared.">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    One part of every trade is meant to be public: who moved what, to whom, and whether it resolved &mdash; a neighborhood&apos;s demand, a seller&apos;s resolution history, a route&apos;s reliability, all readable straight from the chain, by anyone, without asking permission. This is the map a delivery platform used to keep to itself so it alone could match supply to demand. Figaro puts it in the open by construction instead, and the network&apos;s own token pays the designers whose clauses and assemblies the mapped trades keep using &mdash; see <Link href="/rpgf" className="text-ink-heading font-medium hover:underline">how that works</Link>.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    That inversion is the whole arrangement, and it is easiest to see as a direction of travel. Value converges: every payment and every bond is pulled into one resolution, and radiates back out &mdash; payouts and bonds together, in a single transaction &mdash; the moment the buyer closes. The data does the opposite. Only a fingerprint crosses onto the chain; the detail disperses to the people who produced it; and what travels outward is the aggregate map, to everyone at once. A platform ran both the other way.
                </p>
                <p className="text-base text-ink-body leading-relaxed mt-5">
                    Public is not the same as checked, and the map is explicit about the difference. A bond that was locked and a payment that transferred are <em>protocol-enforced</em> &mdash; the protocol moved that value itself. A service area a seller published is <em>institution-declared</em>: it is on the map because someone put it there and nothing on chain verified it, and what argues for its accuracy is the demand and the bond that seller has riding on being found where it says it is. A disclosure is <em>protocol-derived</em> &mdash; the chain holds its fingerprint and the moment it was committed, which fixes which document was agreed and nothing about whether that document is accurate &mdash; and a swap routed through another contract is <em>composition-derived</em>, true by that contract&apos;s own rules rather than this protocol&apos;s. So nobody has to infer which of the four they are reading: the explorer names these boundaries beside the layers of the map that carry one.
                </p>
                <p className="text-sm text-ink-muted leading-relaxed mt-5">
                    This page explains the map. The reading happens in the data explorer &mdash; public by construction, so no wallet and no account.
                </p>
                <CtaLink href="/data/explore" className="mt-4" data-testid="cta-open-data-explorer">
                    Open the data explorer
                </CtaLink>
            </MarketingSection>

            <MarketingSection title="Opening your books is a trade too.">
                <p className="text-base text-ink-body leading-relaxed">
                    The other half &mdash; the agreement&apos;s actual content, the evidence behind the fingerprint, the running history each side keeps of its own trades &mdash; stays with whoever co-produced it, buyer or seller alike, in storage they hold, disclosed only by their own choice. Letting a buyer in on that data is an ordinary bonded sale, agreed and resolved the same way any other value passes between two wallets &mdash; not a feature bolted onto the protocol. A designer sets the disclosure regime once, up front: closed to the two parties, each side free to share its own copy, or open to either. A buyer commits their own half of that choice at checkout. The terms of any specific sale &mdash; what is licensed, for what purpose, as a one-time snapshot or a continuing stream, and whether it can be passed on again &mdash; are written once by the data&apos;s owner, on the catalogue item that offers it, the way any posted price is set. A buyer reads them and signs; nothing is negotiated at the counter, because the terms travel with the item.
                </p>
            </MarketingSection>

            <MarketingSection title="What arrives is provable, not promised.">
                <p className="text-base text-ink-body leading-relaxed">
                    Licensed data does not arrive on the seller&apos;s word. A delivery that names its source trades carries a proof tying it back to the exact resolved trades that produced it, checked against their own on-chain fingerprints &mdash; so a buyer can confirm the data is genuine without trusting the seller selling it. That is what makes selling access to it practical in the first place: the same doubled bond that secures every other trade here replaces the usual need to inspect the goods before agreeing to pay for them.
                </p>
            </MarketingSection>

            <MarketingSection title="Erasure, honestly." bottomPad="wide">
                <p className="text-base text-ink-body leading-relaxed">
                    What you publish you can erase by unpinning it, with two things unpinning cannot reach &mdash; the on-chain fingerprint, permanent by design, and any copy another node took before you unpinned &mdash; both stated in full on <Link href="/faq#privacy" className="text-ink-heading font-medium hover:underline">the FAQ</Link>.
                </p>
            </MarketingSection>
        </>
    );
}
