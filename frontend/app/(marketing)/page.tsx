import type { Metadata } from "next";
import type { ReactNode } from "react";
import { withOg } from "@/lib/shared/pageMetadata";
import Link from "@/components/shared/Link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { CtaLink } from "@/components/marketing/CtaLink";
import { WholeStripFrame } from "@/components/figures/WholeStripFigure";
import { KERNEL_EQUILIBRIUM } from "@figaro-protocol/sdk";

export const metadata: Metadata = withOg({
    title: "Figaro Protocol",
    description:
        "On Figaro, a decentralized, permissionless protocol, anyone can buy and sell goods, work or data with anyone, anywhere, and every party puts a bond behind its word.",
});

// THE HOME PAGE, in simplex.chat's shape and nothing more: the headline is the
// one phrase a reader arrives already believing; the lead under it says what a
// visitor can do and states the bond rule, because a costly signal the reader
// cannot see persuades nobody; one line renders the two-party example from the
// equilibrium owner, and /kernel's subtitle links to the page that owns the
// mechanism. Then the THREE DOORS the header carries — Participate, Build,
// Research — each one sentence and one button to its landing; then the ONE
// PICTURE — the whole of Figaro as six frames in the trade strip's own language
// (`WholeStripFigure`), each frame with the claim it carries as its heading and
// one fact under it that the lead does not already state; the two "Composes
// with" strips, each on-chain mark with a few words of what it does; two plain
// lines at the foot, the code and the interfaces. The page states each thing
// once, in the positive, and stays generic: no named trade and no named
// industry, because the activity the protocol carries is unbounded. The six
// frames are the five parts and the loop, in time order: wallets, terms, a
// process signed and bonded, every seller's payment at once, the evidence, and
// the count of use that the designers' reward follows.
// Every number on this page is rendered from sdk/src/equilibrium.json, never
// typed here (scripts/lint-equilibrium-owner.sh).
const EX = KERNEL_EQUILIBRIUM.example;

const DOORS: { label: string; line: string; href: string }[] = [
    {
        label: "Participate",
        line: "Buy from a member, or publish what you sell so buyers can find you.",
        href: "/participate",
    },
    {
        label: "Build",
        line: "Write and publish the terms trades are made on, and be rewarded in proportion to their use.",
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
        line: "You choose where you belong.",
        fact: "A community can have its own token. The tokens your wallet holds and the terms it trades on show which communities you are part of, and you choose both.",
    },
    {
        line: "Terms are written once and published.",
        fact: "A term of trade, such as how goods are carried, which law applies or how data may be used, is written once and registered on-chain. Each trade's agreement is composed from such terms, and both sides sign the same agreement.",
    },
    {
        line: "You know what it pays before you start.",
        fact: "Before any work begins, the buyer and each seller sign the terms of their order, the payment included.",
    },
    {
        line: "Everyone is paid at once when the buyer confirms.",
        fact: "Confirming is one transaction, and only the buyer can send it. Nothing expires while the process is open: a buyer who never confirms leaves every bond locked, their own included.",
    },
    {
        line: "The evidence is yours.",
        fact: "Every trade leaves signed evidence of what was agreed, what each side attested and what was paid, for a regulator, a court, and your books and taxes. Which wallets traded, and for how much, is public on-chain; the detail is yours, to keep sealed or to sell.",
    },
    {
        line: "Use is counted, and rewarded.",
        fact: "Once a trade is confirmed, it counts toward every term and design it used. Whoever designed them is rewarded in proportion to that use, by a published formula.",
    },
];

// What the protocol composes with — other protocols and contracts, never the
// network it is deployed on (a network is a deployment fact, and belongs to
// the deployments table) — each mark from the project's own brand assets,
// unaltered, linking to the project. One strip below the sections, above the
// code line.
const COMPOSES_WITH: { name: string; href: string; src: string; note: string }[] = [
    { name: "IPFS", href: "https://ipfs.tech", src: "/built-with/ipfs.svg", note: "Holds clause specs and profiles; the chain keeps their fingerprint." },
    { name: "Uniswap", href: "https://uniswap.org", src: "/built-with/uniswap.svg", note: "Swaps another token into the process's denomination for a bond, in the same transaction as the commit." },
    { name: "XMTP", href: "https://xmtp.org", src: "/built-with/xmtp.svg", note: "One channel a buyer and each seller coordinate on." },
    { name: "Disperse", href: "https://disperse.app", src: "/built-with/disperse.png", note: "Lets a wallet split what it was paid, after resolution." },
    { name: "Kleros", href: "https://kleros.io", src: "/built-with/kleros.svg", note: "One arbitration forum: it rules on a process's evidence, and the buyer resolves." },
    { name: "Succinct", href: "https://succinct.xyz", src: "/built-with/succinct.svg", note: "SP1 validity proofs, so one transaction resolves a batch of processes." },
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
                lead="You can buy and sell goods, work or data with anyone, anywhere. The buyer bonds twice the payment. Each seller bonds twice the cumulative value through its order. When the buyer confirms, every seller is paid and every bond is refunded, the buyer's less the payments, at once."
            >
                <p className="mt-4 text-base text-ink-body leading-relaxed max-w-2xl" data-testid="home-example">
                    For a payment of {EX.payment} tokens, the buyer locks {EX.buyer_locks}, the payment carried inside it, and the seller locks {EX.seller_locks}: {EX.held} held until the buyer confirms.{" "}
                    <Link href="/kernel" className="text-ink-heading font-medium italic hover:underline">
                        Why each side&apos;s best move is to keep its word.
                    </Link>
                </p>
                <div className="mt-8 grid grid-cols-1 md:grid-cols-3 gap-x-6 gap-y-8" data-testid="home-doors">
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
                {FRAMES.map((c, i) => (
                    <div
                        key={c.line}
                        className={`border-t border-default pt-10 ${i > 0 ? "mt-12" : ""} grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-6 items-center`}
                    >
                        <div className={`flex flex-col ${i % 2 === 1 ? "md:order-2" : ""}`}>
                            <h2 className="text-heading-h3 text-ink-heading mb-2">{c.line}</h2>
                            <p className="text-base text-ink-body leading-relaxed">{c.fact}</p>
                        </div>
                        <div className={i % 2 === 1 ? "md:order-1" : ""}>
                            <WholeStripFrame n={i + 1} />
                        </div>
                    </div>
                ))}

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
                        The smart contracts are decentralized and permissionless, the code is open, and seven independent benches check it and the equilibrium it enforces. What each covers:{" "}
                        <Link href="/security" className="text-ink-heading font-medium hover:underline">
                            Security
                        </Link>
                        .
                    </p>
                    <p className="mt-4 text-sm text-ink-muted leading-relaxed max-w-2xl">
                        This website is one interface among any number; the registries are optional, and FigaroCore runs with neither:{" "}
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
