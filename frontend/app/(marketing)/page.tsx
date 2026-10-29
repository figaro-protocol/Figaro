import type { Metadata } from "next";
import type { ReactNode } from "react";
import { withOg } from "@/lib/shared/pageMetadata";
import Link from "@/components/shared/Link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { CtaLink } from "@/components/marketing/CtaLink";
import { WholeStripFrame } from "@/components/figures/WholeStripFigure";

export const metadata: Metadata = withOg({
    title: "Figaro Protocol",
    description:
        "When strangers trade, an institution in the middle has made a promise good after the fact. On Figaro, a decentralized, permissionless protocol, everyone in the trade puts up a bond first, so the promise is good before the trade.",
});

// THE HOME PAGE, told top-down: the problem, what Figaro does, what changes for
// the reader, the invitation. The first screen carries the arc and ends in the
// three doors: the headline is the one phrase a reader arrives already
// believing; the lead states the problem, an authorized institution in the
// middle that makes a stranger's promise good after the fact; under it, what
// Figaro does, in the maintainer's telling's plain words (everyone bonds first,
// told by what the bond makes each party do and what the other can count on,
// then the amounts as that behavior's consequence: the buyer twice the payment
// and each seller twice the value through its order, into a decentralized,
// permissionless smart contract that holds every bond until the buyer closes —
// the holder named, because a bond
// with an implied holder reads as held by a third party; only the buyer closes,
// and nothing sits between the parties with the power to decide — the
// who-decides axis, stated positively, since the FAQ's line on it is what moves
// readers off the third-party prior; every seller paid and every bond refunded at once; and what
// happens if the buyer never closes, above the fold), with no worked example:
// the bond arithmetic and its example live on /kernel, which the last line
// links; then the invitation and the THREE DOORS the header carries —
// Participate, Build, Research — each one sentence and one button to its
// landing. Below the fold, "What it removes" pairs each part of the problem with
// what the bond does about it (the two costs the online marketplaces failed on:
// disputes, and buyers, who come from the members' listing, the communities'
// own members and a designer's token as the way in to a resource; the reason a
// firm needs a boss), states what the chain computes beside what a party
// decides, and the cost, gas plus the time value of the locked tokens. "What changes for you" is the ONE PICTURE: the whole of
// Figaro as six frames in the trade strip's own language (`WholeStripFigure`),
// in time order — wallets, terms, a process signed and bonded, every seller's
// payment at once, the evidence, and the count of use the designers' reward
// follows — each frame headed by what it changes for the reader. Then the two
// "Composes with" strips and two plain lines at the foot, the code and the
// interfaces. The category word ("an ex-ante institution for exchange") stands
// in the body only, never in the headline, the lead or the metadata. Platforms
// are named by function, their costs stated once as facts. The page stays
// generic: no named trade and no named industry, because the activity the
// protocol carries is unbounded.

const DOORS: { label: string; line: string; href: string }[] = [
    {
        label: "Participate",
        line: "Buy from a member, or publish what you sell so buyers can find you.",
        href: "/participate",
    },
    {
        label: "Build",
        line: "Write and publish the terms trades are made on, and be rewarded by a published formula of their use.",
        href: "/terms",
    },
    {
        label: "Research",
        line: "Check the papers, the proofs and what the data a trade leaves is for.",
        href: "/research",
    },
];

const FRAMES: { line: string; fact: string }[] = [
    {
        line: "You trade with anyone, anywhere, in any token, and choose the communities you belong to.",
        fact: "A person, a business, a machine or a software agent takes part through its own wallet. A community can have its own token: the tokens your wallet holds show which communities you belong to, and you choose them.",
    },
    {
        line: "Anyone can write the terms trades run on.",
        fact: "A term, such as how goods are carried, which law applies or how data may be used, is written once and registered on-chain, and anyone can reuse it. Terms compose into whole processes, each with the economics its designer chose: a market, a cooperative and a mutual-aid group run on the same smart contracts.",
    },
    {
        line: "You know what it pays before you start.",
        fact: "Before a seller's work begins, the buyer and that seller sign the terms of their order, the payment included.",
    },
    {
        line: "You keep what you earn.",
        fact: "Once the work is done, closing the trade is the buyer's better move, since closing refunds the rest of the buyer's own bond. In that one transaction each seller receives its whole payment, and every bond is refunded.",
    },
    {
        line: "Your data is yours, to keep or to sell.",
        fact: "Every trade leaves signed evidence of what was agreed, what each side attested and what was paid. Which wallets traded, and for how much, is public on-chain; of the detail the chain holds only a fingerprint, and the detail itself stays with you, private unless the terms you trade on make it public, yours to keep, to disclose or to sell. The same evidence is there for your books and taxes, and for a regulator or a court to read.",
    },
    {
        line: "Use is counted, and rewarded.",
        fact: "Once a trade closes, each term and each design it used counts once toward its designer, under published conditions. Whoever designed them is rewarded in florins by a published formula that weighs how many trades used them and how many distinct sellers carried them.",
    },
];

// What the protocol composes with — other protocols and contracts, never the
// network it is deployed on (a network is a deployment fact, and belongs to
// the deployments table) — each mark from the project's own brand assets,
// unaltered, linking to the project. One strip below the sections, above the
// code line.
const COMPOSES_WITH: { name: string; href: string; src: string; note: string }[] = [
    { name: "IPFS", href: "https://ipfs.tech", src: "/built-with/ipfs.svg", note: "Holds the designs of clauses, agreements and assemblies, and members' profiles; the chain keeps their fingerprints." },
    { name: "Uniswap", href: "https://uniswap.org", src: "/built-with/uniswap.svg", note: "Swaps another token into the process's denomination for a bond, in the same transaction as the commit." },
    { name: "XMTP", href: "https://xmtp.org", src: "/built-with/xmtp.svg", note: "One channel a buyer and each seller coordinate on." },
    { name: "Disperse", href: "https://disperse.app", src: "/built-with/disperse.png", note: "Lets a wallet split what it was paid, after resolution." },
    { name: "Kleros", href: "https://kleros.io", src: "/built-with/kleros.svg", note: "One arbitration forum: it rules on a process's evidence, and the buyer resolves." },
    { name: "Succinct", href: "https://succinct.xyz", src: "/built-with/succinct.svg", note: "Proves many trades at once, so their buyers' resolutions go through in one transaction." },
];

// Off-chain, a process composes with the legal and regulatory norms a trade
// meets in the world — the data it leaves satisfies them. Named as facts, not
// products, so they carry no mark; an open category, not a fixed roster.
const COMPOSES_WITH_OFF_CHAIN: string[] = [
    "EU electronic invoice",
    "ESG reporting",
    "GDPR",
    "taxation",
];

export default function Home() {
    return (
        <>
            <MarketingHero
                title="My word is my bond"
                lead="When strangers trade, someone has to stand in the middle. For thousands of years an authorized institution has made a stranger's promise good after the fact: a firm, a court, a bank, and now a platform."
            >
                <p className="mt-6 text-base text-ink-body leading-relaxed max-w-2xl">
                    Figaro makes the promise good before the trade. It is an ex-ante institution for exchange: it acts before the trade, not after.
                </p>
                <p className="mt-4 text-base text-ink-body leading-relaxed max-w-2xl">
                    Everyone in the trade puts up a bond first, and the bond makes keeping your word your better move. Once the work is delivered, closing is the buyer&rsquo;s better move, since closing refunds the buyer&rsquo;s bond less the payment, and every seller can count on that. Since the buyer closes once the work is delivered and not before, delivering is each seller&rsquo;s better move while the other sellers deliver: it is paid, against a bond that stays locked and is more than the most it could keep by walking away. So the buyer bonds twice the payment and each seller twice the value through its order, into a decentralized, permissionless smart contract that holds every bond until the buyer closes.
                </p>
                <p className="mt-4 text-base text-ink-body leading-relaxed max-w-2xl">
                    Only the buyer can close the trade (resolve it, in the contract&rsquo;s word), and nothing sits between the parties with the power to decide for them. When the buyer closes, every seller is paid and every bond refunded at once. Nobody is paid until everyone is, so the sellers help each other finish, with no boss in charge. If the buyer never closes, every bond stays locked, the buyer&rsquo;s own included, and an arbitration forum or a court can rule on the trade&rsquo;s data while it stays open.{" "}
                    <Link href="/kernel" className="text-ink-heading font-medium italic hover:underline">
                        Why, once the work is delivered, closing is the buyer&apos;s better move and delivering each seller&apos;s.
                    </Link>
                </p>
                <p className="mt-8 text-body-lead text-ink-heading font-medium max-w-2xl">
                    Any value-adding process runs this way, in any ERC-20 token, and the data it leaves stays with the parties.
                </p>
                <div className="mt-6 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-8" data-testid="home-doors">
                    {DOORS.map((d) => (
                        <div key={d.href} className="flex flex-col">
                            <p className="text-base text-ink-body leading-relaxed grow mb-4">{d.line}</p>
                            <div>
                                <CtaLink href={d.href}>{d.label}</CtaLink>
                            </div>
                        </div>
                    ))}
                </div>
            </MarketingHero>

            <section className="container mx-auto px-6 pb-20 max-w-3xl">
                <div className="border-t border-default pt-10">
                    <h2 className="text-heading-h2 text-ink-heading mb-5">What it removes</h2>
                    <p className="text-base text-ink-body leading-relaxed">
                        An online marketplace that connects buyers and sellers directly carries two costs: attracting buyers, and handling disputes between them. The data a marketplace captures does not pay for both, and the ones that grew became platforms, which take a share of each sale, set the rules, and keep the customers and the data.
                    </p>
                    <p className="mt-4 text-base text-ink-body leading-relaxed">
                        The bond carries the second cost. From the start, each party&rsquo;s bond makes keeping its promise its better move while the others keep theirs, so less is left in dispute, and when a dispute does arise, the trade&apos;s data is there for an arbitration forum or a court to rule on before the buyer closes. The first is carried by the members&rsquo; listing, by the communities that build on Figaro, and by a designer&rsquo;s token.
                    </p>
                    <p className="mt-4 text-base text-ink-body leading-relaxed">
                        The protocol is decentralized and permissionless. Any ERC-20 token can carry a trade: a stablecoin, a community&apos;s own token, or a designer&apos;s token. A designer can make its token the way in to a resource: every trade under its assembly is paid and bonded in that token, so a buyer reaches the resource by holding it, and holding it grants that access and no claim on anyone&apos;s revenue. A wallet is all a buyer needs, with no account, identity check or sign-up; a seller that wants to be found registers as a member with a stake and is listed where buyers look, and the communities that build on Figaro bring their own members. Whoever designs what the network uses is rewarded in florins, the protocol&apos;s own token, from a reserve set aside for designers and never sold, by a published formula of that use.
                    </p>
                    <p className="mt-4 text-base text-ink-body leading-relaxed">
                        A firm exists because coordinating many people through the market costs too much, so someone has to be the boss. Flat companies and self-managed teams tried to work without one, and still needed a central operator. Figaro removes the reason for the boss. No seller is paid until every seller is, so each has reason to help the others finish, and the sellers coordinate as equals.
                    </p>
                    <p className="mt-4 text-base text-ink-body leading-relaxed">
                        The smart contracts run on any EVM-compatible blockchain and take nothing from a trade. The chain computes the bonds, the payments and the refunds; what the terms are, whom to trade with and when to close are each a party&rsquo;s decision. The cost is gas, plus the time value of the tokens locked while the trade is open.
                    </p>
                </div>

                <h2 className="mt-16 text-heading-h2 text-ink-heading mb-8">What changes for you</h2>
                {FRAMES.map((c, i) => (
                    <div
                        key={c.line}
                        className={`border-t border-default pt-10 ${i > 0 ? "mt-12" : ""} grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-6 items-center`}
                    >
                        <div className={`flex flex-col ${i % 2 === 1 ? "md:order-2" : ""}`}>
                            <h3 className="text-heading-h3 text-ink-heading mb-2">{c.line}</h3>
                            <p className="text-base text-ink-body leading-relaxed">{c.fact}</p>
                        </div>
                        <div className={i % 2 === 1 ? "md:order-1" : ""}>
                            <WholeStripFrame n={i + 1} />
                        </div>
                    </div>
                ))}
                <p className="mt-12 text-base text-ink-body leading-relaxed">
                    Courts, firms and platforms remain. Figaro displaces them without completely substituting for them, and the data a trade leaves is there for their filing and reporting.
                </p>

                <div className="mt-12 border-t border-default pt-8" data-testid="built-with">
                    <p className="text-sm text-ink-muted mb-4">Composes with on-chain</p>
                    <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-5">
                        {COMPOSES_WITH.map((b) => (
                            <li key={b.name}>
                                <a href={b.href} target="_blank" rel="noopener noreferrer" title={b.name} className="flex items-center gap-2 text-sm text-ink-body hover:text-ink-heading">
                                    {/* eslint-disable-next-line @next/next/no-img-element -- a static export; the marks are local files */}
                                    <img src={b.src} alt={b.name} width={24} height={24} className="h-6 w-6 object-contain" />
                                    <span>{b.name}</span>
                                </a>
                                <p className="mt-1 text-sm text-ink-muted leading-relaxed">{b.note}</p>
                            </li>
                        ))}
                    </ul>
                </div>

                <div className="mt-12 border-t border-default pt-8" data-testid="composes-with-off-chain">
                    <p className="text-sm text-ink-muted mb-4">Composes with off-chain</p>
                    <ul className="flex flex-wrap items-center gap-x-8 gap-y-4">
                        {COMPOSES_WITH_OFF_CHAIN.map((n) => (
                            <li key={n} className="text-sm text-ink-body">{n}</li>
                        ))}
                    </ul>
                </div>

                <div className="mt-12 border-t border-default pt-8">
                    <p className="text-sm text-ink-muted leading-relaxed max-w-2xl">
                        The smart contracts are decentralized and permissionless, and the code is open. Seven benches, each a different method, check it and the equilibrium it enforces. What each covers:{" "}
                        <Link href="/security" className="text-ink-heading font-medium hover:underline">
                            Security
                        </Link>
                        .
                    </p>
                    <p className="mt-4 text-sm text-ink-muted leading-relaxed max-w-2xl">
                        This website is one interface among any number, and FigaroCore runs without it or the registries:{" "}
                        <Link href="/about#what-to-check" className="text-ink-heading font-medium hover:underline">
                            About
                        </Link>
                        .
                    </p>
                </div>
            </section>
        </>
    );
}
