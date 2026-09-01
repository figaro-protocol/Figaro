import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import Link from "next/link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingSection } from "@/components/marketing/MarketingSection";

// This page holds FOUR things and nothing else: what an attestation IS, in
// plain words (a signed fact filed mid-process, not a term signed at commit);
// the two invariants that make it evidence rather than a floating claim —
// merkle-bound to the signed order, and only while that order is open; one
// worked example in a non-food vertical (freight emissions reporting) that
// shows a measured attestation and its correction; and the boundary with
// adjudication — the kernel never reads the content, a forum may rule on it,
// no forum can call resolve. No registry count, no hash table, no CTA: an
// attestation is not something you register or design, it is a runtime
// signature a party files inside a process already running. Companion page
// to /clauses and /assemblies; same register, narrower concept.
export const metadata: Metadata = withOg({
    title: "Attestations — Figaro Protocol",
    description:
        "A signed statement a party makes about a process while it is open, bound by merkle proof to the order it concerns — the evidence a process's data holds, never a verdict itself.",
});

export default function Attestations() {
    return (
        <>
            <MarketingHero
                title="A signed word, filed while the order is still open."
                lead={
                    <>
                        An attestation is a signed statement one party makes about a process
                        while it is still running &mdash; a courier confirming a pickup, a
                        seller marking a stage complete, a carrier reporting a measured
                        figure. It is bound by a merkle proof to the very order it concerns,
                        so nobody can attest against a clause they never signed. And it can
                        only be filed while that order is open: once its buyer resolves the
                        process, the window for evidence closes with it. Attestations are the
                        evidence a process&apos;s data holds &mdash; never a verdict on their
                        own.
                    </>
                }
            />

            <MarketingSection title="In plain words.">
                <p className="text-sm text-ink-body leading-relaxed">
                    A <Link href="/clauses" className="underline">clause</Link> is a term
                    signed at commit; an attestation is a fact filed while the order runs.
                    Whoever has standing on that order can file one &mdash; the seller
                    performing it, the buyer receiving it, or an agent the seller has
                    authorized to act on its behalf. Filing one moves no bond and ends
                    nothing: it only adds one more signed fact to what a reader, or an
                    outside forum, can later weigh.
                </p>
            </MarketingSection>

            <MarketingSection title="Bound to the order, not floating evidence.">
                <p className="text-sm text-ink-body leading-relaxed mb-4">
                    An attestation cannot claim just anything. Every filing carries a
                    merkle inclusion proof showing that the clause it attests to is a
                    leaf of the very agreement the parties signed at commit &mdash; a
                    seller who signed an emissions clause naming one accounting
                    methodology cannot later file a reading under a different one; the
                    proof simply will not open. The chain itself keeps only a
                    fingerprint of what was filed: a keccak256 of the content, and a
                    keccak256 of the clause section it opens against. The content
                    itself &mdash; the plaintext of a reading, a photo, a signed note
                    &mdash; lives off-chain, public or sealed at the filer&apos;s own
                    choice, verified against that fingerprint by whoever reads it.
                </p>
                <p className="text-sm text-ink-body leading-relaxed">
                    The second bound is time, not content: an attestation is only
                    accepted while its order is still open. The moment its process
                    resolves, filing against it stops &mdash; a post-resolution
                    attestation would dilute the very finality resolution is built to
                    produce.
                </p>
            </MarketingSection>

            <MarketingSection title="Worked example: a measured figure, filed mid-transit.">
                <p className="text-sm text-ink-body leading-relaxed">
                    A freight carrier moving one container has signed an emissions
                    clause at commit, naming the accounting methodology it will report
                    under. While the order is open &mdash; the container still mid-transit
                    &mdash; the carrier files an attestation carrying the measured grams
                    of CO2-equivalent and a pointer to its measurement evidence. If the
                    buyer later disputes the number, the carrier cannot rewrite what it
                    already signed: a correction is simply a second, later attestation
                    at the same stage, and a reader weighs both. Neither attestation
                    moves a bond or ends the trade &mdash; only the buyer&apos;s own
                    resolve does that, and only once, for every order in the process at
                    once.
                </p>
            </MarketingSection>

            <MarketingSection title="Evidence, not adjudication." bottomPad="wide">
                <p className="text-sm text-ink-body leading-relaxed mb-4">
                    The kernel never reads what an attestation says. A separate,
                    zero-storage coordinator checks the signature, checks the inclusion
                    proof, and checks that the order is still open &mdash; it does not
                    decode or judge the content itself. What that evidence <em>means</em>{" "}
                    is left to whoever reads it afterward: the other sellers bonded into
                    the same process, an arbitration forum a designer composed in ahead
                    of time, or an ordinary court. A forum rules on the process&apos;s
                    open data; it cannot call resolve. The one signature that ends a
                    trade belongs to its buyer alone.
                </p>
                <p className="text-sm text-ink-body leading-relaxed">
                    That boundary is why dispute recourse sits at the edge of the
                    design rather than at its center &mdash; the full stack, from the
                    chain up through an outside forum to ordinary courts, is on{" "}
                    <Link href="/faq#layers" className="underline">
                        the FAQ&apos;s &ldquo;What stands behind a trade?&rdquo;
                    </Link>
                    .
                </p>
            </MarketingSection>
        </>
    );
}
