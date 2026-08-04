import type { Metadata } from "next";
import Link from "next/link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingSection } from "@/components/marketing/MarketingSection";

export const metadata: Metadata = {
    title: "Status — Figaro Protocol",
    description:
        "Where the network stands: what is built and verified today, what Solidity surface is frozen, and what still blocks release — every fact quoted from the page that states it.",
};

const JUMP_LINKS: { href: string; label: string }[] = [
    { href: "#live", label: "What is live today" },
    { href: "#frozen", label: "What is frozen" },
    { href: "#blockers", label: "What blocks release" },
];

/**
 * A single page collecting the network's own pre-launch status claims. Every
 * sentence here is quoted verbatim from the page that owns it — this page
 * states nothing new, it only assembles. When one of the owning pages
 * changes its wording, update the quote here in the same pass (documentation
 * discipline, CLAUDE.md).
 */
export default function Status() {
    return (
        <>
            <MarketingHero
                title="Where things stand."
                lead={
                    <>
                        The network is pre-launch. This page collects that fact and its
                        neighbors &mdash; what is built and verified today, what Solidity
                        surface is frozen, and what still blocks release &mdash; quoted from
                        the pages that state them, with a link back to each.
                    </>
                }
            />

            <MarketingSection sectionId="jump-index">
                <nav aria-label="Sections on this page">
                    <ol className="space-y-2 text-sm text-ink-body leading-relaxed list-decimal pl-5">
                        {JUMP_LINKS.map((l) => (
                            <li key={l.href}>
                                <Link href={l.href} className="hover:underline">
                                    {l.label}
                                </Link>
                            </li>
                        ))}
                    </ol>
                </nav>
            </MarketingSection>

            <MarketingSection title="What is live today" sectionId="live">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    A verification stack already runs against the kernel, and two
                    reference assemblies are proved end to end on the developer network
                    the reference suite runs against.
                </p>
                <div className="border-l-2 border-default pl-6 my-3 space-y-1">
                    <p className="text-sm text-ink-body leading-relaxed">
                        &ldquo;What is in place is a verification stack &mdash; six
                        independent tools targeting the same kernel from different
                        angles: Foundry (unit + integration suite, 0 failed), Halmos
                        (symbolic execution proves 7 properties of the kernel
                        exhaustively), Certora (formal verification of CVL specs
                        covering bond conservation, atomic resolution, and
                        authorization), TLA+ (model-checking of the kernel and
                        florin-token state machines), Echidna (property-based fuzzing
                        of the kernel and the florin token), Mythril (symbolic execution
                        for common vulnerability classes).&rdquo;
                    </p>
                    <p className="text-xs text-ink-faint">
                        &mdash; stated at <Link href="/security#verification" className="hover:underline">/security</Link>
                    </p>
                </div>
                <div className="border-l-2 border-default pl-6 my-3 space-y-1">
                    <p className="text-sm text-ink-body leading-relaxed">
                        &ldquo;The corpus analyzes a system that is built and formally
                        verified but pre-launch: no public deployment exists yet, so
                        every paper below states a mechanism, never a live-market
                        result.&rdquo;
                    </p>
                    <p className="text-xs text-ink-faint">
                        &mdash; stated at <Link href="/papers" className="hover:underline">/papers</Link>
                    </p>
                </div>
                <div className="border-l-2 border-default pl-6 my-3 space-y-1">
                    <p className="text-sm text-ink-body leading-relaxed">
                        &ldquo;The mechanism analyzed here is built and machine-checked
                        but pre-launch: no public deployment exists, so no play has been
                        observed on it, and no laboratory replication of the bonded game
                        has been run.&rdquo;
                    </p>
                    <p className="text-xs text-ink-faint">
                        &mdash; stated at{" "}
                        <Link href="/papers/behavioral-game-theory" className="hover:underline">
                            /papers/behavioral-game-theory
                        </Link>
                    </p>
                </div>
                <div className="border-l-2 border-default pl-6 my-3 space-y-1">
                    <p className="text-sm text-ink-body leading-relaxed">
                        &ldquo;Like the rest of the network, this is pre-launch: what you
                        can check right now is those same assemblies, proved end to end
                        on the developer network the reference suite runs
                        against.&rdquo;
                    </p>
                    <p className="text-xs text-ink-faint">
                        &mdash; stated at <Link href="/data" className="hover:underline">/data</Link>
                    </p>
                </div>
            </MarketingSection>

            <MarketingSection title="What is frozen" sectionId="frozen">
                <div className="border-l-2 border-default pl-6 my-3 space-y-1">
                    <p className="text-sm text-ink-body leading-relaxed">
                        &ldquo;The Solidity surface was frozen for external audit on 20
                        April 2026 (with subsequent amendments scoped to the
                        freeze).&rdquo;
                    </p>
                    <p className="text-xs text-ink-faint">
                        &mdash; stated at <Link href="/security#verification" className="hover:underline">/security</Link>
                    </p>
                </div>
                <div className="border-l-2 border-default pl-6 my-3 space-y-1">
                    <p className="text-sm text-ink-body leading-relaxed">
                        &ldquo;30% of supply, minted to the DAO wallet at genesis with no
                        vesting (the DAO is not yet instantiated).&rdquo;
                    </p>
                    <p className="text-xs text-ink-faint">
                        &mdash; stated at{" "}
                        <Link href="/artifact-rewards" className="hover:underline">
                            /artifact-rewards
                        </Link>
                    </p>
                </div>
            </MarketingSection>

            <MarketingSection title="What blocks release" sectionId="blockers" bottomPad="wide">
                <div className="border-l-2 border-default pl-6 my-3 space-y-1">
                    <p className="text-sm text-ink-body leading-relaxed">
                        &ldquo;Not yet by an external auditor. That is the honest answer,
                        and the protocol does not call itself release-ready until that
                        audit lands. &hellip; external audit decision and scheduling is
                        one of two named release blockers.&rdquo;
                    </p>
                    <p className="text-xs text-ink-faint">
                        &mdash; stated at <Link href="/security#verification" className="hover:underline">/security</Link>
                    </p>
                </div>
                <div className="border-l-2 border-default pl-6 my-3 space-y-1">
                    <p className="text-sm text-ink-body leading-relaxed">
                        &ldquo;A straight fact before anything else: the network is
                        pre-launch. There are no live sellers on it yet &mdash; what
                        follows describes how a deal works, not a marketplace you can
                        order from tonight.&rdquo;
                    </p>
                    <p className="text-xs text-ink-faint">
                        &mdash; stated at <Link href="/" className="hover:underline">/</Link>
                    </p>
                </div>
                <div className="border-l-2 border-default pl-6 my-3 space-y-1">
                    <p className="text-sm text-ink-body leading-relaxed">
                        &ldquo;One note before the mechanism: the network is pre-launch,
                        so what follows describes how a deal works, not a marketplace
                        running today.&rdquo;
                    </p>
                    <p className="text-xs text-ink-faint">
                        &mdash; stated at <Link href="/protocol" className="hover:underline">/protocol</Link>
                    </p>
                </div>
                <div className="border-l-2 border-default pl-6 my-3 space-y-1">
                    <p className="text-sm text-ink-body leading-relaxed">
                        &ldquo;The network is early &mdash; pre-launch &mdash; and the
                        registry fills as sellers join. What follows is how each side
                        works once you are on it.&rdquo;
                    </p>
                    <p className="text-xs text-ink-faint">
                        &mdash; stated at <Link href="/users" className="hover:underline">/users</Link>
                    </p>
                </div>
            </MarketingSection>
        </>
    );
}
