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
        "Every network collects rent from the people who depend on it. Figaro is a decentralized, permissionless protocol: nobody owns it, so nobody collects rent. One buyer and one or more sellers each lock a bond in any ERC-20 token, only the buyer closes the trade, and everyone is paid at once.",
});

// THE HOME PAGE, told top-down in two speeds. The first screen is what sticks, four
// moves a stranger can repeat: the problem (every network collects rent from the people
// who depend on it), the fix with every assumption stated in order (any ERC-20 token; one
// buyer and one or more sellers each lock a bond; keeping your word is the better move;
// only the buyer closes and everyone is paid at once; the cost is gas), the builder's
// paragraph, the proof sentence, and the three doors with Build first. The scroll below
// carries the telling whole: the problem (power, institutions, the line from left to
// right, the infrastructures people depend on, the platforms and the AI build-out, with
// "the way we read it" marking the reading), a fix, what changes for the reader as six
// frames (`WholeStripFigure`), the two "Composes with" strips, the code and interface
// lines, and the invitation as the page's last words. The category word stands in the
// body only, never in the headline, the lead or the metadata. Platforms are named by
// function; no named trade and no named industry, because the activity the protocol
// carries is unbounded.

const DOORS: { label: string; line: string; href: string }[] = [
    {
        label: "Build",
        line: "Write the terms trades run on, compose them into processes, pick the token, and be rewarded by how much they are used.",
        href: "/terms",
    },
    {
        label: "Participate",
        line: "Buy from a member, or publish what you sell so buyers can find you.",
        href: "/participate",
    },
    {
        label: "Research",
        line: "The papers place Figaro in its lineage and start the discussion; the proofs and the data a trade leaves are there to check.",
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
        fact: "Nobody takes a cut. When the buyer closes the trade, each seller receives its whole payment in that one transaction, and every bond is refunded.",
    },
    {
        line: "Your data is yours, to keep or to sell.",
        fact: "Every trade leaves signed evidence of what was agreed, what each side attested and what was paid. Which wallets traded, and for how much, is public on-chain; of the detail the chain holds only a fingerprint, and the detail itself stays with you, private unless the terms you trade on make it public, yours to keep, to disclose or to sell. The same evidence is there for your books and taxes, and for a regulator or a court to read.",
    },
    {
        line: "Use is counted, and rewarded.",
        fact: "Once a trade closes, each term and each design it used counts once toward its designer. Whoever designed them is rewarded in florins, the protocol's own token, by how much they are used.",
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
                lead="Every network collects rent from the people who depend on it: the railroads and the highways, the power grid, the airlines, the exchanges and the asset managers, ride hailing, subscriptions, and now the cloud. Rent is where the money is. Since the Arab Spring, people have organized against it on those same networks, and the protests have reached the West."
            >
                <p className="mt-6 text-base text-ink-body leading-relaxed max-w-2xl">
                    Figaro is a decentralized, permissionless protocol: nobody owns it, so nobody collects rent. A trade runs in any ERC-20 token. One buyer and one or more sellers each lock a bond in that token in a smart contract on a public blockchain, so keeping your word is the better move. Only the buyer closes the trade; when it does, every seller is paid and every bond is refunded at once, so the sellers finish together with no one directing them. The cost is gas.
                </p>
                <p className="mt-4 text-base text-ink-body leading-relaxed max-w-2xl">
                    Build on it. Write the terms a trade runs on, compose them into processes, pick the token, and publish without asking anyone. Sellers bind your processes, buyers select them, and you are rewarded by how much they are used. Whoever trades on them keeps what they earn and the data they produce.
                </p>
                <p className="mt-8 text-body-lead text-ink-heading font-medium max-w-2xl">
                    It is safe because it is proved.
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
                    <h2 className="text-heading-h2 text-ink-heading mb-5">The problem</h2>
                    <p className="text-base text-ink-body leading-relaxed">
                        Power is the ability to influence outcomes, and it is exercised through institutions. Fewer people trust them each year, and the protests that social media organized in the Arab Spring now fill the streets from Indonesia to France. We know few ways to organize a society, and they lie on one line from left to right; at either end someone stands in the middle, the state&rsquo;s institution or the market&rsquo;s. Many want an alternative and do not agree on what it is. Some will not accept anyone in the middle. Some will not accept a market in data, in dispute resolution, in infrastructure.
                    </p>
                    <p className="mt-4 text-base text-ink-body leading-relaxed">
                        The way we read it, the world is a network of infrastructures people depend on to live, and the party that runs one holds power over everyone on it. The platform companies run more of them each year: they take a cut, set the rules, keep the customers and the data, and the largest have grown too big to fail. The AI build-out concentrates it further: five companies spending beyond what they earn, where energy is abundant and people are few, on machines that replace brains as earlier machines replaced muscle. A product becomes a dependency.
                    </p>
                </div>

                <div className="mt-16 border-t border-default pt-10">
                    <h2 className="text-heading-h2 text-ink-heading mb-5">A fix</h2>
                    <p className="text-base text-ink-body leading-relaxed">
                        Figaro is a fix, not the fix. It is transparent, verifiable, permissionless infrastructure running on a decentralized blockchain, and it secures the two assets the networks have always taken: what you earn, and the data you produce. It does this by making a promise good before the trade.
                    </p>
                    <p className="mt-4 text-base text-ink-body leading-relaxed">
                        Everyone in the trade puts up a bond first, so keeping your word is the better move. Only the buyer closes the trade (resolves it, in the contract&rsquo;s word); when it does, every seller is paid and every bond is refunded at once. Nobody is paid until everyone is, so the sellers finish together with no boss in charge, and the reason a firm needed one goes with it. If the buyer never closes, every bond stays locked, the buyer&rsquo;s own included, and an arbitration forum or a court can rule on the trade&rsquo;s data while it stays open.{" "}
                        <Link href="/kernel" className="text-ink-heading font-medium italic hover:underline">
                            Why, once the work is delivered, closing is the buyer&apos;s better move and delivering each seller&apos;s.
                        </Link>
                    </p>
                    <p className="mt-4 text-base text-ink-body leading-relaxed">
                        No one in the middle holds power over the outcome. The smart contracts run on any EVM-compatible blockchain and take nothing from a trade: the chain computes the bonds, the payments and the refunds, and what the terms are, whom to trade with and when to close are each a party&rsquo;s decision. It brings the cost of the party in the middle down to the cost of gas, plus the time value of the tokens locked while the trade is open.
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
                        It is safe because we can prove it. The smart contracts are decentralized and permissionless, the code is open, and seven benches, each a different method, check it and the equilibrium it enforces. What each covers:{" "}
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

                <div className="mt-12 border-t border-default pt-10" data-testid="home-invitation">
                    <p className="text-body-lead text-ink-heading font-medium leading-relaxed max-w-2xl">
                        Build on the substrate we developed for you. Use it to secure whatever economic system you want: define the processes, the data rules and the token they run in. Use the processes. Contribute in your own local working groups, without asking anyone&rsquo;s permission. The papers are there to start the discussion. It is safe because we can prove it, and since we can prove it, who we are does not matter. Only the proof does. My word is my bond.
                    </p>
                    <div className="mt-6">
                        <CtaLink href="/terms">Build</CtaLink>
                    </div>
                </div>
            </section>
        </>
    );
}
