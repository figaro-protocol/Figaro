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
//
// The page carries the WHOLE frame at layman altitude, in this order:
// mechanism (the thirty/sixty derivation) → what happens when it goes wrong
// (withheld close, co-seller stake) → disagreement (the record, forums and
// courts) → what you need and what it costs → which token settles it →
// public terms + permissionless admission (people and software) → the data
// seam → ownerless + verifiable → commons that pays its authors. Retelling
// budget is ONE derivation (here) + ONE lived example (/local-commerce):
// add no second worked example with numbers. No jargon reaches this page —
// no equilibria, no EIP-712, no Schelling point, no merkle, no token supply
// figures (a blind layman probe stumbled on every one of them).
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
                    The network is pre-launch &mdash; no launch date is promised, the external audit gate decides readiness. There are no live sellers on it yet &mdash; what follows describes how a deal works, not a marketplace you can order from tonight. If your honest answer to that is <em>come back when it is live</em>, <Link href="/status" className="hover:underline">Status</Link> is the page to watch: it names the two release blockers that decide readiness, and gathers the site&apos;s pre-launch statements in one place &mdash; this paragraph among them. Below is the mechanism, worked through once with real numbers, so you can judge it for yourself.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Say dinner costs thirty tokens. To buy it, you lock sixty &mdash; the thirty you owe, plus thirty of your own as a stake. The kitchen locks sixty too, all of it stake. Confirm the meal arrived, and both stakes come home while your thirty settles as payment. Walk away instead, and your own locked stake never comes home &mdash; it stays in the box for good, benefiting no one.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    That doubling is the whole mechanism, not a fee or a favor &mdash; the full derivation is on <Link href="/protocol" className="hover:underline">Protocol</Link>.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    So what happens if dinner never arrives &mdash; or arrives wrong, or half of it missing? Nothing does. Nothing closes, nobody is paid, and the kitchen&apos;s stake stays locked beside yours until the order is put right &mdash; remade, resent, whatever the two of you agreed. Most orders involve more than one person, and nothing about that changes: someone cooks, someone carries, each locks a stake of their own, and none of them sees a token until you confirm the whole thing arrived. So everyone in the chain has their own stake riding on everyone else, and reason to fix a problem before it ever reaches you.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    And if you and the seller genuinely disagree, the deal has already written itself down &mdash; every step, permanently, as it happened. An arbitrator or an ordinary court can read that record and rule on it, whether or not the agreement named a forum in advance; naming one settles the venue ahead of time, nothing more. What that record can and cannot do for you is answered question by question on <Link href="/security" className="hover:underline">Security</Link>.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    It runs on Ethereum: you take part with a wallet app and digital tokens you buy once, up front &mdash; card or bank transfer, inside most wallet apps, or on any exchange that lists them. That purchase is ordinary money changing hands before Figaro is involved at all: there is nothing to sign up for with Figaro, which never sees your bank or your card, only the wallet that signs. The key to that wallet is yours alone, so back it up before your first deal &mdash; no one, Figaro included, can restore a lost key or the stakes it leaves locked. Figaro charges no fee, having no company to collect one, so the only thing that leaves your hands for good is the network&apos;s own per-step charge, paid to the network itself: at typical Ethereum prices, cents to a few dollars a step, moving with how busy the network is that day and with nothing Figaro sets.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    A deal settles in whichever token both sides accept &mdash; usually one that tracks the dollar, but just as easily one a community issued for itself, so that trade far from home still runs through the community&apos;s own unit. Every settlement is public, so picking that token is support anyone can check, rather than a claim anyone has to take on faith.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    The fine print is not a company&apos;s either. What counts as delivered, who does what in what order, what happens to your records &mdash; the terms a deal is built from are public building blocks: anyone can read them, reuse them in a deal of their own, or write new ones. And nobody admits you. There is no application and no approval; if you can sign, you can buy, sell, or put a deal-shape together yourself &mdash; and software acting for you does all three on exactly the same footing as a person.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Your own records stay yours. The chain keeps a fingerprint of your agreement, never its contents: what you ordered, from whom, where it went, the evidence behind it, all of that stays with you. What is public is the shape of the trade &mdash; who paid whom, roughly where, and whether it settled. That is the map a platform normally keeps for itself; here it belongs to everyone, while the detail underneath is <Link href="/data" className="hover:underline">yours to keep, or to sell on your own terms</Link>.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    Nobody runs it. There is no company behind it and no account that can be closed &mdash; shared infrastructure, the way the internet is. The TCP/IP of trade: like email, anyone can build an app on it, and no one can shut it down. And nothing here asks to be taken on trust: the code is open, every deal&apos;s record is open, and the reasoning behind the mechanism is published in full.
                </p>
                <p className="text-base text-ink-body leading-relaxed mt-5">
                    It is built to grow. The deal-shapes, the terms, the ready-made compositions are a public commons: anyone can extend them without asking permission, and the network pays back the people whose work it comes to rely on. Figaro is a seed that compounds, not a finished product.
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
                            Buy something, or offer something &mdash; the only two positions there are. From no crypto at all to a first order or a first sale: the wallet, how you buy the tokens, what it costs, what to back up first.
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
