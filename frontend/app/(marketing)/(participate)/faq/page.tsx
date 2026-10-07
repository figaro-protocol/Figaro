import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import Link from "@/components/shared/Link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingSection } from "@/components/marketing/MarketingSection";
import { AssemblyFaqs } from "@/components/assemblies/AssemblyFaqs";

export const metadata: Metadata = withOg({
    title: "FAQ — Figaro Protocol",
    description:
        "A pre-trade checklist for traders and workers, and the practical answers — what you need in hand, how and when you are paid, where orders come from, whether it works on a phone. The deeper protocol questions are answered on the Core FAQ.",
});

const BEFORE_YOU_TRADE: { id: string; title: string }[] = [
    { id: "before-you-send", title: "Before your first real trade." },
];

const GETTING_STARTED: { id: string; title: string }[] = [
    { id: "wallet", title: "Do I need crypto already?" },
    { id: "paid", title: "How and when am I paid?" },
    { id: "orders", title: "Where do my orders come from?" },
    { id: "deactivated", title: "Can I be deactivated?" },
    { id: "phone", title: "Does it work on a phone?" },
];

export default function Faq() {
    return (
        <>
            <MarketingHero
                title="FAQ."
                lead={
                    <>
                        Plain-language answers to the questions you should ask before sending tokens through a protocol you didn&apos;t write. The pre-trade checklist below names each concern. It links the answer that owns it in full, with the residual risk stated plainly, never in a footnote. The deeper protocol answers live on the <Link href="/core/faq" className="text-ink-heading font-medium hover:underline">Core FAQ</Link>. Questions about the trade you are in &mdash; where orders come from, what you need in hand &mdash; are answered by each published assembly, under Questions about a trade.
                    </>
                }
            />

            <MarketingSection bottomPad="default">
                <nav aria-label="Jump to a question" data-testid="faq-jump-index">
                    <div className="mb-8">
                        <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-muted mb-3">
                            Before you trade
                        </h2>
                        <ul className="[&>li]:border-b [&>li]:border-default text-base">
                            {BEFORE_YOU_TRADE.map((item) => (
                                <li key={item.id}>
                                    <Link href={`#${item.id}`} className="flex items-baseline justify-between gap-4 py-2.5 text-ink-heading hover:underline">
                                        <span>{item.title}</span>
                                        <span aria-hidden="true" className="text-ink-muted">&darr;</span>
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </div>
                    <div>
                        <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-muted mb-3">
                            Getting started
                        </h2>
                        <ul className="[&>li]:border-b [&>li]:border-default text-base">
                            {GETTING_STARTED.map((item) => (
                                <li key={item.id}>
                                    <Link href={`#${item.id}`} className="flex items-baseline justify-between gap-4 py-2.5 text-ink-heading hover:underline">
                                        <span>{item.title}</span>
                                        <span aria-hidden="true" className="text-ink-muted">&darr;</span>
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </div>
                </nav>
            </MarketingSection>

            {/* Named in the jump index above as its leading entry: the index is the complete map and POINTS here; this
             *  section stays a curated DIGEST — the short form of the
             *  answers, the deeper protocol ones now owned by the Core FAQ,
             *  kept at the top where a first-time reader
             *  lands. Never merge the two (the index exhaustive, this selective —
             *  collapsing them degrades both jobs), and never grow this list
             *  toward exhaustiveness to cover the index's deeper questions.
             *  Every line here is the short form and links to the section or page
             *  that owns the full treatment; nothing is derived here that is not
             *  derived there. */}
            <MarketingSection title="Before your first real trade." sectionId="before-you-send">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Sixteen things worth having answered before a first commitment. Every line is the short form; the answer that owns it in full &mdash; with its residual risk &mdash; is one link away. The unfavorable answers are on it too, in the same list as the rest.
                </p>
                <ul className="space-y-3 text-base text-ink-body mb-5 ml-6">
                    <li>&mdash; <strong className="text-ink-heading font-medium">Has the code been audited?</strong> Audit in progress; alongside it, seven independent verification benches and a frozen surface (<Link href="/security" className="text-ink-heading font-medium hover:underline">the full answer</Link>).</li>
                    <li>&mdash; <strong className="text-ink-heading font-medium">Is anyone selling near me?</strong> Whatever the <Link href="/discover" className="text-ink-heading font-medium hover:underline">member directory</Link> shows where you are looking is the whole answer, including nothing. It reads the chain live and is never a curated list.</li>
                    <li>&mdash; <strong className="text-ink-heading font-medium">Who holds the payment while the trade runs?</strong> No one. Both bonds, the payment carried inside the buyer&apos;s, sit in a decentralized, permissionless contract. It has no path out but the resolution the buyer signs (<Link href="/core/faq#custody" className="text-ink-heading font-medium hover:underline">who holds the tokens</Link>).</li>
                    <li>&mdash; <strong className="text-ink-heading font-medium">Is this escrow?</strong> No. Escrow gives a third party the power to decide. Here nothing occupies that seat, and only the buyer&apos;s signature resolves a trade (<Link href="/core/faq#escrow" className="text-ink-heading font-medium hover:underline">the difference, in full</Link>).</li>
                    <li>&mdash; <strong className="text-ink-heading font-medium">What do I have to put up?</strong> As a buyer, twice the payment leaves your wallet at commit. It is one bond with the payment carried inside it, refunded less that payment when you sign the resolution. You also need ETH for the gas each step costs, cents to a few dollars at typical network prices.</li>
                    <li>&mdash; <strong className="text-ink-heading font-medium">Can I get a refund?</strong> There is no reversal path, by design. Nobody is paid until the buyer signs the resolution, so a shortfall is put right <em>before</em> that signature rather than undone after it.</li>
                    <li>&mdash; <strong className="text-ink-heading font-medium">What if I change my mind?</strong> Before the trade commits, nothing has moved. A signed order that is never committed simply lapses at its deadline. After commit there is no unwind operation, and none is needed. The seller sends the payment amount back as an ordinary transfer, and you sign the resolution. Its refunds leave both of you exactly where you started: every bond home, the seller made whole by the resolution itself. Signing is your assent; committing is when the bonds move. And if the seller keeps the payment instead, you are in the vanished-seller case. Nothing is ever paid, and both bonds stay locked. Their refusal has already cost them more than the sale was worth. The dispute layers stand behind it (<Link href="/core/faq#disputes" className="text-ink-heading font-medium hover:underline">what if you genuinely disagree?</Link>).</li>
                    <li>&mdash; <strong className="text-ink-heading font-medium">What does the Core refuse to have?</strong> Three things, and each absence is load-bearing. There is no recovery path. A branch that could refund a bond without the buyer&apos;s resolution would be the surface an attacker aims at. What protects a trade is the deterrent each side posts, never a way back out of it. There is no clock on an open process. Nothing expires or times out once the bonds are committed. Only a signed order that has not been committed yet carries a deadline. And there is no dial: the 2&times; ratio is the mechanism itself, not a setting anyone tunes (<Link href="/kernel#refusals" className="text-ink-heading font-medium hover:underline">the three refusals</Link>).</li>
                    <li>&mdash; <strong className="text-ink-heading font-medium">What happens the moment I sign the resolution?</strong> It is terminal acceptance: the process resolves, and nothing inside the protocol reopens it. So look at the work before signing, not after.</li>
                    <li>&mdash; <strong className="text-ink-heading font-medium">What do I lose if it goes wrong?</strong> Your bond is your own deterrent, never a pot the other side can win. The way to lose it is to leave a process open forever, which leaves every bond locked, yours included (<Link href="/core/faq#escrow" className="text-ink-heading font-medium hover:underline">the residual, stated in full</Link>).</li>
                    <li>&mdash; <strong className="text-ink-heading font-medium">What if we genuinely disagree?</strong> There is no on-chain verdict and there will not be one. Three inner layers stand before the disagreement, built to absorb it. Any outside forum rules on the data, to which the protocol contributes evidence, never a ruling (<Link href="/core/faq#layers" className="text-ink-heading font-medium hover:underline">the five layers</Link>).</li>
                    <li>&mdash; <strong className="text-ink-heading font-medium">What if I lose my key?</strong> The Core has no recovery path of any kind. A buyer who set up an account-level recovery beforehand can still close active processes. A buyer who did not leaves the bonds locked, permanently (<Link href="/core/faq#keys" className="text-ink-heading font-medium hover:underline">how to set it up, before you commit</Link>).</li>
                    <li>&mdash; <strong className="text-ink-heading font-medium">Can anyone freeze my funds or shut this down?</strong> The contracts are decentralized and permissionless, with no key to hold. The exposure that remains is the chain itself (<Link href="/core/faq#shutdown" className="text-ink-heading font-medium hover:underline">what has no privileged role</Link>).</li>
                    <li>&mdash; <strong className="text-ink-heading font-medium">Can this website lie about what I am signing?</strong> Not about a trade already committed. The gap is the moment just before you sign. Closing it means running one of two checks yourself, with developer tools (<Link href="/core/faq#signing" className="text-ink-heading font-medium hover:underline">both checks, step by step</Link>).</li>
                    <li>&mdash; <strong className="text-ink-heading font-medium">What becomes public about me?</strong> Your wallet address and its on-chain activity, linkable by anyone. This is pseudonymity, not anonymity. The personal detail stays off-chain, encrypted, and erasable by you (<Link href="/core/faq#privacy" className="text-ink-heading font-medium hover:underline">what the network learns</Link>).</li>
                    <li>&mdash; <strong className="text-ink-heading font-medium">Does this change my tax or legal position?</strong> No. A trade here carries the same obligations as any direct trade in your jurisdiction. Nothing on this site is legal, tax, or financial advice (<Link href="/core/faq#compatibility" className="text-ink-heading font-medium hover:underline">tax and law</Link>).</li>
                </ul>
                <p className="text-base text-ink-body leading-relaxed">
                    None of these ask you to take this site&apos;s word for anything. Each line names something readable on the chain, runnable on your own machine, or a thing the Core plainly has no code for.
                </p>
            </MarketingSection>

            <MarketingSection title="Do I need crypto already?" sectionId="wallet">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    You need three things. A wallet app, a little ETH for gas, and the token the trade is priced in.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    A wallet is free. Install one on your phone or in your browser and it gives you an address. That address is you here.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    Gas is what the network charges for each transaction. It is cents to a few dollars, and you pay it in ETH. If you hold a different token than the trade uses, checkout can swap it in the same step. The details are in <Link href="/core/faq#compatibility" className="text-ink-heading font-medium hover:underline">Gas, tokens, and tax</Link>.
                </p>
            </MarketingSection>

            <MarketingSection title="How and when am I paid?" sectionId="paid">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    At resolution. The buyer signs once. In that one transaction every seller is paid and every bond is refunded, straight to each wallet.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    Nobody holds the tokens in between. Until the buyer resolves, nothing moves, yours or theirs. What happens if the buyer never resolves is <Link href="/core/faq#unresolved" className="text-ink-heading font-medium hover:underline">answered on the Core FAQ</Link>.
                </p>
            </MarketingSection>

            <MarketingSection title="Where do my orders come from?" sectionId="orders">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    No platform routes orders to you. A buyer finds you in the members catalog on <Link href="/discover" className="text-ink-heading font-medium hover:underline">Discover</Link>, or through a link you share. The customers you already have can order from you directly.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    What a buyer can order from you is set by the assemblies you bind to. Each published assembly answers its own questions below, under Questions about a trade.
                </p>
            </MarketingSection>

            <MarketingSection title="Can I be deactivated?" sectionId="deactivated">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    No. Nobody can remove your wallet, your registration, or your history. There is no operator to do it.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    Only you can withdraw your own registration stake, and withdrawing takes you off the catalog. A forum or a court can act on you outside a trade, as it always could. It cannot reach into the protocol.
                </p>
            </MarketingSection>

            <MarketingSection title="Does it work on a phone?" sectionId="phone">
                <p className="text-base text-ink-body leading-relaxed">
                    Yes. Every page is built for a phone screen. Connect with a wallet app on the same phone and trade from the browser.
                </p>
            </MarketingSection>

            <AssemblyFaqs />
        </>
    );
}
