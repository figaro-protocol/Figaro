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
                    Two deposits, each bigger than the deal. One rule for who opens the box. That is the entire machine. Both sides put a stake into a lockbox &mdash; a small program that runs in the open, owned by no one. Cheat, and you forfeit a stake worth more than anything you could have taken. Honor the deal, and the box opens: the seller is paid and both stakes come home. Nobody has to trust anybody. The arithmetic does it.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Most real work is more than two people. A delivered meal is a cook, whoever supplied the ingredients, and a courier &mdash; each posts their own stake, all linked into one deal that settles in one stroke. If any one of them fails, every stake is on the line, so each has a direct, money-backed reason to want the others to deliver. No platform assigns the work. The shape of the deal does.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    Nobody runs it. There is no company behind it and no account that can be closed &mdash; shared infrastructure, the way the internet is. The TCP/IP of trade: like email, anyone can build an app on it, and no one can shut it down.
                </p>
                <p className="text-sm text-ink-muted italic mt-6">
                    <Link href="/protocol" className="hover:underline">
                        The whole machine, in ten minutes &rarr;
                    </Link>
                </p>
            </MarketingHero>

            {/* Reading path — a curriculum, not a funnel. Five reads in order;
                each step names what the page answers. */}
            <section className="container mx-auto px-6 pb-16 max-w-3xl border-t border-default pt-xl">
                <h2 className="text-heading-h3 text-ink-heading mb-6">Read it in order</h2>
                <ol className="space-y-3 text-base" data-testid="reading-path">
                    <li className="flex gap-4">
                        <span className="text-ink-muted font-mono text-sm mt-0.5">1</span>
                        <p className="text-ink-body">
                            <Link href="/protocol" className="text-ink-heading font-medium hover:underline">Protocol</Link>
                            <span> &mdash; how a deal works: the lockbox, the stakes, the one rule.</span>
                        </p>
                    </li>
                    <li className="flex gap-4">
                        <span className="text-ink-muted font-mono text-sm mt-0.5">2</span>
                        <p className="text-ink-body">
                            <Link href="/why" className="text-ink-heading font-medium hover:underline">Why</Link>
                            <span> &mdash; why it exists: three eras of rule-making, and what the third changes.</span>
                        </p>
                    </li>
                    <li className="flex gap-4">
                        <span className="text-ink-muted font-mono text-sm mt-0.5">3</span>
                        <p className="text-ink-body">
                            <Link href="/local-commerce" className="text-ink-heading font-medium hover:underline">Local commerce</Link>
                            <span> &mdash; one deal, lived: a meal ordered, cooked, carried, and settled.</span>
                        </p>
                    </li>
                    <li className="flex gap-4">
                        <span className="text-ink-muted font-mono text-sm mt-0.5">4</span>
                        <p className="text-ink-body">
                            <Link href="/security" className="text-ink-heading font-medium hover:underline">Security</Link>
                            <span> &mdash; what can go wrong, answered plainly &mdash; and how to verify any deal yourself.</span>
                        </p>
                    </li>
                    <li className="flex gap-4">
                        <span className="text-ink-muted font-mono text-sm mt-0.5">5</span>
                        <p className="text-ink-body">
                            <Link href="/users" className="text-ink-heading font-medium hover:underline">Users</Link>
                            <span> &mdash; take part: buy something, or offer something.</span>
                        </p>
                    </li>
                </ol>
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
