import type { Metadata } from "next";
import type { ReactNode } from "react";
import { withOg } from "@/lib/shared/pageMetadata";
import Link from "@/components/shared/Link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { CtaLink } from "@/components/marketing/CtaLink";
import { WholeStripFrame } from "@/components/figures/WholeStripFigure";

export const metadata: Metadata = withOg({
    title: "Figaro",
    description:
        "Every network collects rent from the people who depend on it. Figaro is a decentralized, permissionless protocol: nobody owns it, so nobody collects rent. One buyer and one or more sellers each lock a bond in any ERC-20 token, only the buyer closes the trade, and everyone is paid at once.",
});

// THE HOME PAGE, told top-down, with the three doors after each stage so a reader can leave
// or read on. The first screen is what sticks, four moves a stranger can repeat: the problem
// (every network collects rent from the people who depend on it, and the protests on those
// same networks), the fix with every assumption stated in order (any ERC-20 token; one buyer
// and one or more sellers each lock a bond; keeping your word is the better move; only the
// buyer closes and everyone is paid at once; the cost is gas), the builder's paragraph and
// the proof sentence; then the doors. Next, the problem whole (power, trust and the
// protests, the line from left to right and the alternative people disagree on, the
// infrastructures people depend on, the platforms and the AI build-out, with "the way we
// read it" marking the reading) and a fix; then the doors again. Then what changes for the
// reader as six frames (`WholeStripFigure`), one section for what a process composes with
// (other protocols, and legal and regulatory norms), one for why it is safe (the proof, the
// benches and the bounty's terms, this website as one interface, who is behind it), and the
// doors a third time, with "My word is my bond." as the page's last words. The problem is told as what the reader lives through, never as
// declarations about the world. One DOORS list renders all three times; the Build door's
// line is the invitation's. The category word stands in the body only, never in the
// headline, the lead or the metadata. Platforms are named by function; no named trade and no
// named industry, because the activity the protocol carries is unbounded.

const DOORS: { label: string; line: string; href: string }[] = [
    {
        label: "Build",
        line: "Build on the substrate we developed for you. Use it to secure whatever economic system you want: define the processes, the data rules and, if you choose, the token they run in.",
        href: "/terms",
    },
    {
        label: "Participate",
        line: "Use the processes: buy from a member, or publish what you sell so buyers can find you.",
        href: "/participate",
    },
    {
        label: "Research",
        line: "Contribute in your own local working groups, without asking anyone’s permission. The papers are there to start the discussion and place Figaro in its lineage; the proofs and the data a trade leaves are there to check.",
        href: "/research",
    },
];

// The three doors, rendered after the hero, after "A fix" and at the page's end: one list,
// one render, a distinct test id at each place.
function Doors({ testId, className }: { testId: string; className: string }) {
    return (
        <div className={`${className} grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-8`} data-testid={testId}>
            {DOORS.map((d) => (
                <div key={d.href} className="flex flex-col">
                    <p className="text-base text-ink-body leading-relaxed grow mb-4">{d.line}</p>
                    <div>
                        <CtaLink href={d.href}>{d.label}</CtaLink>
                    </div>
                </div>
            ))}
        </div>
    );
}

const FRAMES: { line: string; fact: string }[] = [
    {
        line: "You trade with anyone, anywhere, in any token, and nobody stands between you: no intermediary, no boss, no administrator with a key.",
        fact: "A person, a business, a machine or a software agent takes part through its own wallet. A community can have its own token: the tokens your wallet holds show which communities you belong to, and you choose them.",
    },
    {
        line: "Anyone writes the terms trades run on, and no firm and no shareholders stand behind them; a market, a cooperative and a mutual-aid group run on the same contracts.",
        fact: "A term, such as how goods are carried, which law applies or how data may be used, is written once and registered on-chain, and anyone can reuse it. Terms compose into whole processes, each with the economics its designer chose: a market, a cooperative and a mutual-aid group run on the same smart contracts.",
    },
    {
        line: "The costs of collaborating, cooperating, coordinating and communicating are gone; what is left is gas, pennies on the busiest network and fractions of a penny or nothing on others.",
        fact: "Before a seller's work begins, the buyer and that seller sign the terms of their order, the payment included.",
    },
    {
        line: "You keep what you earn. Nobody takes a cut, and no shareholder holds a claim on what you make.",
        fact: "Nobody takes a cut. When the buyer closes the trade, each seller receives its whole payment in that one transaction, and every bond is refunded.",
    },
    {
        line: "Your data, your filings, your evidence and their sale are byproducts of the trade, transparent and verifiable by anyone you show them to; less is left in dispute, and the forums that rule on what is are many.",
        fact: "Every trade leaves signed evidence of what was agreed, what each side attested and what was paid. Which wallets traded, and for how much, is public on-chain; of the detail the chain holds only a fingerprint, and the detail itself stays with you, private unless the terms you trade on make it public, yours to keep, to disclose or to sell. The same evidence is there for your books and taxes, and for a regulator or a court to read.",
    },
    {
        line: "The reward: whoever wrote the terms and designs a trade used is rewarded by how much they are used.",
        fact: "Once a trade closes, each term and each design it used counts once toward its designer. Whoever designed them is rewarded in florins, the protocol's own token, by how much they are used.",
    },
];

// What the protocol composes with — other protocols and contracts, never the
// network it is deployed on (a network is a deployment fact, and belongs to
// the deployments table) — each mark from the project's own brand assets,
// unaltered, linking to the project. The "Other protocols" half of "What it
// composes with".
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
                lead="Every network collects rent from the people who depend on it, and you depend on many: the railroads and the highways, the power grid, the airlines, the exchanges and the asset managers, ride hailing, subscriptions, and now the cloud. Rent is where the money is. From the Arab Spring to the streets of the West, people have organized against it on those same networks."
            >
                <p className="mt-6 text-base text-ink-body leading-relaxed max-w-2xl">
                    Figaro is a decentralized, permissionless protocol: nobody owns it, so nobody collects rent. A trade runs in any ERC-20 token. One buyer and one or more sellers each lock a bond, twice what is at stake, in that token in a smart contract on a public blockchain, so keeping your word is the better move. Only the buyer closes the trade; when it does, every seller is paid and every bond is refunded at once, so the sellers finish together with no one directing them. The cost is gas.
                </p>
                <p className="mt-4 text-base text-ink-body leading-relaxed max-w-2xl">
                    Build on it. Write the terms a trade runs on, compose them into processes, pick the token, and publish without asking anyone. Sellers bind your processes, buyers select them, and you are rewarded by how much they are used. Whoever trades on them keeps what they earn and the data they produce.
                </p>
                <p className="mt-8 text-body-lead text-ink-heading font-medium max-w-2xl">
                    It is safe because it is proved.
                </p>
                <Doors testId="home-doors" className="mt-6" />
            </MarketingHero>

            <section className="container mx-auto px-6 pb-20 max-w-3xl">
                <div className="border-t border-default pt-10">
                    <h2 className="text-heading-h2 text-ink-heading mb-5">The problem</h2>
                    <p className="text-base text-ink-body leading-relaxed">
                        Whoever runs the institutions you depend on holds the power to influence outcomes in your life. Fewer people trust them each year, and the protests that social media organized in the Arab Spring now fill the streets from Indonesia to France. Whether you want the state&rsquo;s institution in the middle or the market&rsquo;s, you have had to pick a side on one line from left to right. Many want an alternative and do not agree on what it is: some will not accept anyone in the middle, and some will not accept a market in data, in dispute resolution, in infrastructure. On Figaro, that choice is written into the terms of each trade, and you make it every time you trade.
                    </p>
                    <p className="mt-4 text-base text-ink-body leading-relaxed">
                        The way we read it, your life runs on a network of infrastructures, and whoever runs one holds power over everyone on it. The platform companies run more of them each year: they take a cut of what you earn, set the rules, keep the customers and the data you produce, and the largest have grown too big to fail. The AI build-out concentrates it further: a handful of companies are building the machines that do the work of brains, as earlier machines did the work of muscle, and the product you use becomes the one you depend on.
                    </p>
                </div>

                <div className="mt-16 border-t border-default pt-10">
                    <h2 className="text-heading-h2 text-ink-heading mb-5">A fix</h2>
                    <p className="text-base text-ink-body leading-relaxed">
                        Figaro is a fix, not the fix. It is transparent, verifiable, permissionless infrastructure running on a decentralized blockchain, and it secures the two assets the networks have always taken from you: what you earn, and the data you produce. It does this by making a promise good before the trade.
                    </p>
                    <p className="mt-4 text-base text-ink-body leading-relaxed">
                        Everyone in the trade puts up a bond first, the buyer twice the payment and each seller twice the value through its order, so keeping your word is the better move. Only the buyer closes the trade (resolves it, in the contract&rsquo;s word); when it does, every seller is paid and every bond is refunded at once. Nobody is paid until everyone is, so the sellers finish together with no boss in charge, and the reason a firm needed one goes with it. If the buyer never closes, every bond stays locked, the buyer&rsquo;s own included, and an arbitration forum or a court can rule on the trade&rsquo;s data while it stays open. A stall is what the second mechanism is for: a seller that stalls holds up every other seller&rsquo;s payment and its own bond, and the buyer&rsquo;s bond stays locked until the buyer closes, so the other sellers press the one that stalls, the buyer wants the trade closed, and the stall is put right before the close. That pressure, from every side at once, is why no clock is needed.{" "}
                        <Link href="/kernel" className="text-ink-heading font-medium italic hover:underline">
                            Why, once the work is delivered, closing is the buyer&apos;s better move and delivering each seller&apos;s.
                        </Link>
                    </p>
                    <p className="mt-4 text-base text-ink-body leading-relaxed">
                        No one in the middle holds power over the outcome. The smart contracts run on any EVM-compatible blockchain and take nothing from a trade: the chain computes the bonds, the payments and the refunds, and what the terms are, whom to trade with and when to close are each a party&rsquo;s decision. It brings the cost of the party in the middle down to the cost of gas, plus the time value of the tokens locked while the trade is open.
                    </p>
                    <p className="mt-4 text-base text-ink-body leading-relaxed">
                        Buyers and sellers find each other in the{" "}
                        <Link href="/discover" className="text-ink-heading font-medium hover:underline">
                            public registry of members
                        </Link>
                        , each listed with a live stake, and in the communities that build on Figaro; no marketplace stands between them.
                    </p>
                </div>

                <Doors testId="home-doors-after-fix" className="mt-12 border-t border-default pt-10" />

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

                <div className="mt-16 border-t border-default pt-10">
                    <h2 className="text-heading-h2 text-ink-heading mb-8">What it composes with</h2>
                    <div data-testid="built-with">
                        <p className="text-sm text-ink-muted mb-4">Other protocols</p>
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
                    <div className="mt-10" data-testid="composes-with-off-chain">
                        <p className="text-sm text-ink-muted mb-4">Legal and regulatory norms</p>
                        <ul className="flex flex-wrap items-center gap-x-8 gap-y-4">
                            {COMPOSES_WITH_OFF_CHAIN.map((n) => (
                                <li key={n} className="text-sm text-ink-body">{n}</li>
                            ))}
                        </ul>
                    </div>
                </div>

                <div className="mt-16 border-t border-default pt-10">
                    <h2 className="text-heading-h2 text-ink-heading mb-5">Why it is safe</h2>
                    <p className="text-body-lead text-ink-heading font-medium leading-relaxed max-w-2xl">
                        It is safe because we can prove it, and since we can prove it, who we are does not matter. Only the proof does.
                    </p>
                    <p className="mt-4 text-base text-ink-body leading-relaxed max-w-2xl">
                        The proof is mathematics: the equilibrium&rsquo;s best replies are proof-checked in Lean 4, and the smart contracts are verified by Certora and Halmos and modeled in TLA+, beside Foundry&rsquo;s tests, Echidna&rsquo;s fuzzing and the differential fuzz of the Rust against the Solidity. The contracts are decentralized and permissionless, the code is open, and a bounty is published, with its terms, in{" "}
                        <a href="https://github.com/figaro-protocol/Figaro/blob/main/SECURITY.md#bug-bounty" className="text-ink-heading font-medium hover:underline">
                            SECURITY.md
                        </a>
                        . What each bench covers:{" "}
                        <Link href="/security" className="text-ink-heading font-medium hover:underline">
                            Security
                        </Link>
                        .
                    </p>
                    <p className="mt-4 text-base text-ink-body leading-relaxed max-w-2xl">
                        This website is one interface among any number, and FigaroCore runs without it or the registries.{" "}
                        <Link href="/about" className="text-ink-heading font-medium hover:underline">
                            Who is behind this
                        </Link>
                        .
                    </p>
                </div>

                <Doors testId="home-doors-close" className="mt-16 border-t border-default pt-10" />

                <p className="mt-12 text-body-lead text-ink-heading font-medium">My word is my bond.</p>
            </section>
        </>
    );
}
