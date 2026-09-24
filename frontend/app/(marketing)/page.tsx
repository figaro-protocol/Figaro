import type { Metadata } from "next";
import type { ReactNode } from "react";
import { withOg } from "@/lib/shared/pageMetadata";
import Link from "@/components/shared/Link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { CtaLink } from "@/components/marketing/CtaLink";
import { SignedTermsFigure } from "@/components/figures/SignedTermsFigure";
import { ProcessStarFigure } from "@/components/figures/ProcessStarFigure";
import { BelongingFigure } from "@/components/figures/BelongingFigure";

export const metadata: Metadata = withOg({
    title: "Figaro Protocol",
    description:
        "My word is my bond. Figaro game theory provides your trades with the certainty existing institutions cannot: keeping your word is each party's best move. You know what it pays before you start, everyone is paid at once when the buyer closes, and you choose where you belong.",
});

// THE HOME PAGE, in simplex.chat's shape and nothing more: the headline is the
// one phrase a reader arrives already believing; the two lines under it are
// the maintainer's, word for word, and make the phrase a fact; ONE button, the
// real way in (a wallet and a stake: Join); three sections, each a figure with
// the claim as its heading and one fact under it; the marks; one plain line
// about the code at the foot. Wayfinding is the header's job, so the page has
// no doors and states each thing once. Nothing above the foot explains how
// anything works: certainty is stated as the parties' BEHAVIOUR, never as the
// bond arithmetic, and every line is in the positive. A comprehension gap
// found by any probe is closed on the owner page, never by adding prose here.
//
// The three claims come from blind writers outside the repo on a brief the
// maintainer corrected; the voicing is the lexicon's (a bond is refunded; the
// data is evidence; a term's publisher is a designer).
const CLAIMS: { line: string; fact: string; figure: ReactNode }[] = [
    {
        line: "You know what it pays before you start.",
        fact: "Both sides sign what is expected and what it pays before any work begins.",
        figure: <SignedTermsFigure />,
    },
    {
        line: "Everyone is paid at once when the buyer closes.",
        fact: "The moment the buyer closes the trade, everyone who added value is paid in full and every bond is refunded.",
        figure: <ProcessStarFigure />,
    },
    {
        line: "You choose where you belong.",
        fact: "The tokens you hold are the communities you belong to: a utility token, a meme, a stablecoin, a shared value, and kinds not yet invented. You are where they meet.",
        figure: <BelongingFigure />,
    },
];

// What the protocol composes with, each mark from the project's own brand
// assets, unaltered, linking to the project. One strip below the sections,
// above the code line.
const COMPOSES_WITH: { name: string; href: string; src: string }[] = [
    { name: "Ethereum", href: "https://ethereum.org", src: "/built-with/ethereum.svg" },
    { name: "IPFS", href: "https://ipfs.tech", src: "/built-with/ipfs.svg" },
    { name: "Uniswap", href: "https://uniswap.org", src: "/built-with/uniswap.svg" },
    { name: "XMTP", href: "https://xmtp.org", src: "/built-with/xmtp.svg" },
    { name: "Disperse", href: "https://disperse.app", src: "/built-with/disperse.png" },
    { name: "Kleros", href: "https://kleros.io", src: "/built-with/kleros.svg" },
    { name: "Succinct", href: "https://succinct.xyz", src: "/built-with/succinct.svg" },
];

export default function Home() {
    return (
        <>
            <MarketingHero
                title="My word is my bond"
                lead={
                    <>
                        Figaro game theory provides your trades with the certainty existing institutions cannot.
                        Keeping your word is each party&apos;s best move.
                    </>
                }
            >
                <div className="mt-6 flex flex-wrap gap-4">
                    <CtaLink href="/members">Join</CtaLink>
                </div>
            </MarketingHero>

            <section className="container mx-auto px-6 pb-20 max-w-3xl">
                {CLAIMS.map((c, i) => (
                    <div
                        key={c.line}
                        className={`border-t border-default pt-10 ${i > 0 ? "mt-12" : ""} grid grid-cols-1 md:grid-cols-2 gap-x-10 gap-y-6 items-center`}
                    >
                        <div className={`flex flex-col ${i % 2 === 1 ? "md:order-2" : ""}`}>
                            <h2 className="text-heading-h3 text-ink-heading mb-2">{c.line}</h2>
                            <p className="text-base text-ink-body leading-relaxed">{c.fact}</p>
                        </div>
                        <div className={i % 2 === 1 ? "md:order-1" : ""}>{c.figure}</div>
                    </div>
                ))}

                <div className="mt-12 border-t border-default pt-8 flex flex-wrap gap-4 items-center">
                    <p className="text-base text-ink-body">One trade, start to finish, as pictures:</p>
                    <CtaLink href="/local-commerce">See a trade</CtaLink>
                </div>

                <div className="mt-12 border-t border-default pt-8" data-testid="built-with">
                    <p className="text-sm text-ink-muted mb-4">Composes with</p>
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

                <div className="mt-12 border-t border-default pt-8">
                    <p className="text-sm text-ink-muted leading-relaxed max-w-2xl">
                        The code is open and checked seven independent ways on every change. It is not yet audited by an outside firm. What each check covers:{" "}
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
