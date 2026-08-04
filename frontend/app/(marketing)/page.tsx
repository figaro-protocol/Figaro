import type { Metadata } from "next";
import Link from "next/link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { ReadButton } from "@/components/shared/ReadButton";
import { BuildButton } from "@/components/shared/BuildButton";

export const metadata: Metadata = {
    title: "Figaro Protocol",
    description:
        "The TCP/IP of trade. Any two parties can transact directly, anywhere, without trusting each other and without an arbitrator, platform, bank, or court in between.",
};

// The canonical story — the same telling as /protocol, compressed. Every
// general-audience page repeats THIS story (lockbox + delivered meal), never
// its own variant. Full version: /protocol. Evidence for why this is the
// front door: the 2026-07 marketing audit.
export default function Home() {
    return (
        <>
            <MarketingHero
                title="Any two parties can transact directly, anywhere."
                lead={
                    <>
                        Without trusting each other. Without an arbitrator, platform, bank, or court in between.
                    </>
                }
            >
                <p className="text-base text-ink-body leading-relaxed mt-8 mb-5">
                    The network is <Link href="/status" className="hover:underline">pre-launch</Link>. There are no live sellers on it yet &mdash; what follows describes how a deal works, not a marketplace you can order from tonight. Below is the mechanism, worked through once with real numbers, so you can judge it for yourself.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Say dinner costs thirty tokens. To buy it, you lock sixty &mdash; the thirty you owe, plus thirty of your own as a stake. The kitchen locks sixty too, all of it stake. Confirm the meal arrived, and both stakes come home while your thirty settles as payment. Walk away instead, and your own locked stake never comes home &mdash; it stays in the box for good, benefiting no one.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Two stakes, each bigger than the deal. One rule for who opens the box. That is the entire machine. Both sides put a stake into a lockbox &mdash; a small program that runs in the open, owned by no one. Cheat, and you forfeit a stake worth more than anything you could have taken. Honor the deal, and the box opens: the seller is paid and both stakes come home. Nobody has to trust anybody. The arithmetic does it.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    It runs on Ethereum: you take part with a wallet app and digital tokens, nothing to sign up for with Figaro.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    Nobody runs it. There is no company behind it and no account that can be closed &mdash; shared infrastructure, the way the internet is. The TCP/IP of trade: like email, anyone can build an app on it, and no one can shut it down.
                </p>
                <p className="text-base text-ink-body leading-relaxed mt-5">
                    It is built to grow. The deal-shapes, the terms, the ready-made compositions are a public commons: anyone can extend them without asking permission, and the network pays back the people whose work it comes to rely on. Figaro is a seed that compounds, not a finished product.
                </p>
                <p className="text-sm text-ink-muted italic mt-6">
                    <Link href="/protocol" className="hover:underline">
                        The whole machine, in ten minutes &rarr;
                    </Link>
                </p>
            </MarketingHero>

            {/* The full curriculum lives in `ReadingPathStrip`, mounted once in
                `app/(marketing)/layout.tsx` on every marketing page. The
                homepage demotes to a single pointer so the three audience
                tiles below stay the page's sole primary router. */}
            <section className="container mx-auto px-6 pb-16 max-w-3xl border-t border-default pt-xl">
                <p className="text-base text-ink-body" data-testid="reading-path">
                    New here?{" "}
                    <Link href="/protocol" className="text-ink-heading font-medium hover:underline">
                        Read the protocol in four steps &rarr;
                    </Link>
                </p>
            </section>

            <section className="container mx-auto px-6 pb-24 max-w-3xl border-t border-default pt-xl">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    <div className="text-center flex flex-col">
                        <h2 className="text-heading-h3 text-ink-heading">Protocol</h2>
                        <p className="text-sm text-ink-muted mt-2 mb-5 leading-relaxed">
                            The substrate &mdash; the kernel, the math, the specification.
                        </p>
                        <div className="mt-auto">
                            <ReadButton className="inline-flex min-w-[160px] justify-center" />
                        </div>
                    </div>
                    <div className="text-center flex flex-col">
                        <h2 className="text-heading-h3 text-ink-heading">Builders</h2>
                        <p className="text-sm text-ink-muted mt-2 mb-5 leading-relaxed">
                            Clauses, assemblies, tokens, agents &mdash; what you can build on the substrate.
                        </p>
                        <div className="mt-auto">
                            <BuildButton className="inline-flex min-w-[160px] justify-center" />
                        </div>
                    </div>
                    <div className="text-center flex flex-col">
                        <h2 className="text-heading-h3 text-ink-heading">Users</h2>
                        <p className="text-sm text-ink-muted mt-2 mb-5 leading-relaxed">
                            Buyers and sellers &mdash; the only two roles the kernel knows. How to take part.
                        </p>
                        <div className="mt-auto">
                            <Link
                                href="/users"
                                className={
                                    "inline-flex min-w-[160px] justify-center items-center gap-1 px-9 py-sm bg-paper text-ink-primary text-sm font-medium rounded-tile border border-ink-primary " +
                                    "hover:bg-ink-primary hover:text-paper hover:no-underline transition-colors " +
                                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-focus"
                                }
                                data-testid="participate-button"
                            >
                                Participate <span aria-hidden="true">&rarr;</span>
                            </Link>
                        </div>
                    </div>
                </div>
            </section>
        </>
    );
}
