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
        "My word is my bond. Figaro cryptoeconomics provides your commercial trades with the certainty existing institutions cannot: keeping your word is every party's best move. You know what it pays before you start, everyone is paid at once when the buyer confirms, and you choose where you belong.",
});

// THE HOME PAGE, in simplex.chat's shape and nothing more: the headline is the
// one phrase a reader arrives already believing; the two lines under it are
// the maintainer's, word for word, and make the phrase a fact; ONE button, the
// real way in (a wallet and a stake: Join); then the ONE PICTURE — the whole of
// Figaro as six frames in the trade strip's own language (`WholeStripFigure`),
// each frame with the claim it carries as its heading and one fact under it;
// the marks; one plain line about the code at the foot. Wayfinding is the
// header's job, so the page has no doors and states each thing once. Nothing
// above the foot explains how anything works: certainty is stated as the
// parties' BEHAVIOUR, never as the bond arithmetic, and every line is in the
// positive. The six frames are the five parts and the loop: wallets, terms, a
// process signed and bonded, paid at once, the evidence, the count that
// rewards. The three claims sit on the frames they belong to.
const FRAMES: { line: string; fact: string }[] = [
    {
        line: "You choose where you belong.",
        fact: "The tokens you hold and the processes you take part in are the communities you belong to. Identity is derived from where tokens and processes meet.",
    },
    {
        line: "Terms are written once and published.",
        fact: "Whoever writes a term publishes it on a public shelf, and any wallet trades on it.",
    },
    {
        line: "You know what it pays before you start.",
        fact: "Every side signs what they expect and are paid before any work begins.",
    },
    {
        line: "Everyone is paid at once when the buyer confirms.",
        fact: "The moment the buyer confirms, everyone who added value to the process is paid in full and every bond is refunded. A buyer who never confirms leaves their own bond locked.",
    },
    {
        line: "The evidence is yours.",
        fact: "The signed evidence stays with each party: what a court reads if there is a dispute, what your books and taxes need, and what a market for data buys.",
    },
    {
        line: "Use is counted, and rewarded.",
        fact: "Every resolved process is counted, and the count rewards the designer whose terms it ran on. More terms follow, and more trades.",
    },
];

// What the protocol composes with — other protocols and contracts, never the
// network it is deployed on (a network is a deployment fact, and belongs to
// the deployments table) — each mark from the project's own brand assets,
// unaltered, linking to the project. One strip below the sections, above the
// code line.
const COMPOSES_WITH: { name: string; href: string; src: string }[] = [
    { name: "IPFS", href: "https://ipfs.tech", src: "/built-with/ipfs.svg" },
    { name: "Uniswap", href: "https://uniswap.org", src: "/built-with/uniswap.svg" },
    { name: "XMTP", href: "https://xmtp.org", src: "/built-with/xmtp.svg" },
    { name: "Disperse", href: "https://disperse.app", src: "/built-with/disperse.png" },
    { name: "Kleros", href: "https://kleros.io", src: "/built-with/kleros.svg" },
    { name: "Succinct", href: "https://succinct.xyz", src: "/built-with/succinct.svg" },
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
                lead={
                    <>
                        Figaro cryptoeconomics provides your commercial trades with the certainty existing institutions cannot.
                        Keeping your word is every party&apos;s best move.
                    </>
                }
            >
                <div className="mt-6 flex flex-wrap gap-4">
                    <CtaLink href="/members">Join</CtaLink>
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
                    <ul className="flex flex-wrap items-center gap-x-8 gap-y-4">
                        {COMPOSES_WITH.map((b) => (
                            <li key={b.name}>
                                <a href={b.href} target="_blank" rel="noopener noreferrer" title={b.name} className="flex items-center gap-2 text-sm text-ink-body hover:text-ink-heading">
                                    {/* eslint-disable-next-line @next/next/no-img-element -- a static export; the marks are local files */}
                                    <img src={b.src} alt={b.name} width={24} height={24} className="h-6 w-6 object-contain" />
                                    <span>{b.name}</span>
                                </a>
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
                        The code is open and checked seven independent ways on every change. What each check covers:{" "}
                        <Link href="/security" className="text-ink-heading font-medium hover:underline">
                            Security
                        </Link>
                        .
                    </p>
                </div>
            </section>
        </>
    );
}
