import type { Metadata } from "next";
import Link from "next/link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { ReadButton } from "@/components/shared/ReadButton";
import { BuildButton } from "@/components/shared/BuildButton";

export const metadata: Metadata = {
    title: "Figaro Protocol",
    description:
        "From guilds to banks to platforms, every economic system has fought over who enforces a deal and who keeps the profit. Figaro answers differently: deals rarely need an enforcer at all, the market's map is public, your details are yours, the people in each deal decide the split.",
};

// AUDITED 2026-08-05: home derives from the frame's synthesis, probe-refined
// across layman/techie/academic (the epoch-claim close cut — 3/3 flagged it;
// everything through "parts everyone shares" earns belief at all three
// altitudes). The section below it answers the ONE question all three blind
// probes named as their must-answer-or-leave: the unhappy path. Its copy
// follows remedy-before-resolve (never hostage framing), the five-layer
// stack (forums rule regardless of composition), and the deterrent-not-prize
// stake truth. ONE body link per target; no stage vocabulary; a beat that
// grows past its owner's summary is forking the owner and belongs there.
export default function Home() {
    return (
        <>
            <MarketingHero
                title="Figaro completes the contract."
                lead={
                    <>
                        From guilds to banks to platforms, every economic system has fought over the same two questions: who enforces a deal, and who keeps the profit.
                    </>
                }
            >
                <p className="text-base text-ink-body leading-relaxed mt-8 mb-5">
                    The apps we use today answer by standing in the middle &mdash; taking a cut of every sale and keeping everyone&apos;s data.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    Figaro answers differently: deals rarely need an enforcer at all &mdash; both sides stake tokens worth more than cheating could gain &mdash; the market&apos;s map is public, your details are yours to keep or to sell, the people in each deal decide the split, and the network pays whoever builds the parts everyone shares.
                </p>
            </MarketingHero>

            <section className="container mx-auto px-6 pb-16 max-w-3xl border-t border-default pt-xl">
                <h2 className="text-heading-h2 text-ink-heading mb-6">When a deal goes wrong</h2>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    <strong className="text-ink-heading">If it can be fixed, fixing it is what pays.</strong> Nobody in a deal is paid until the buyer confirms &mdash; so a wrong order, a missing half, a late delivery leaves every seller&apos;s stake locked beside yours, and the cheapest way out, for all of them, is to put it right: remade, resent, adjusted, whatever the terms say.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    <strong className="text-ink-heading">You are never gambling against a stranger&apos;s upside.</strong> A stake is a deterrent, not a prize &mdash; the other side can never win yours. A seller who won&apos;t make it right is never paid at all and loses double what the deal was worth &mdash; locked away for good, benefiting no one; a seller who makes it right is paid the moment you confirm. That is why putting it right, not standing off, is the winning move on both sides.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    <strong className="text-ink-heading">If you genuinely disagree,</strong> the deal has already written its own record &mdash; every step, timestamped, permanent. The terms can name an arbitrator in advance, which settles the venue before anything happens; and any ordinary court can rule from the same record if none was named. The record is the referee&apos;s evidence; the stakes are what make ignoring a ruling expensive.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    None of this un-ships a damaged package or makes a liar pleasant to deal with. It makes cheating unprofitable, fixing things profitable, and every step of the deal checkable &mdash; what that covers and what it doesn&apos;t, question by question, is on <Link href="/security" className="hover:underline">Security</Link>.
                </p>
            </section>

            <section className="container mx-auto px-6 pb-24 max-w-3xl border-t border-default pt-xl">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
                    <div className="text-center flex flex-col">
                        <h2 className="text-heading-h3 text-ink-heading">Protocol</h2>
                        <p className="text-sm text-ink-muted mt-2 mb-5 leading-relaxed">
                            The mathematics, derived step by step. Judge it for yourself.
                        </p>
                        <div className="mt-auto">
                            <ReadButton className="inline-flex min-w-[160px] justify-center" />
                        </div>
                    </div>
                    <div className="text-center flex flex-col">
                        <h2 className="text-heading-h3 text-ink-heading">Builders</h2>
                        <p className="text-sm text-ink-muted mt-2 mb-5 leading-relaxed">
                            Terms, deal-shapes, tokens, agents &mdash; build on the substrate, and settle one whole deal end to end.
                        </p>
                        <div className="mt-auto">
                            <BuildButton className="inline-flex min-w-[160px] justify-center" />
                        </div>
                    </div>
                    <div className="text-center flex flex-col">
                        <h2 className="text-heading-h3 text-ink-heading">Users</h2>
                        <p className="text-sm text-ink-muted mt-2 mb-5 leading-relaxed">
                            From nothing to your first deal: the wallet, the tokens, what it costs, what to back up.
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
