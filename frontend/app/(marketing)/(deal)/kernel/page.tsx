import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import Link from "next/link";
import { LockedFundsStateFigure } from "@/components/figures/LockedFundsStateFigure";
import { StackedBondChainFigure } from "@/components/figures/StackedBondChainFigure";

export const metadata: Metadata = withOg({
    title: "Kernel — Figaro Protocol",
    description:
        "How a Figaro deal works: both sides lock a stake larger than the deal, so cheating always loses; the buyer closes it out; every step is recorded permanently.",
});

// FigaroCore's mechanism design, and ONLY that (maintainer rule 2026-08-06:
// the kernel page never carries the stack — the stack figure lives on home).
// Compressed 2026-08-06 from ~950 words to ~420 + the state figure (moved
// here from /security, which owns tests and audit results) + the outcome
// table. Probe-refined sentences kept verbatim where they survive.
export default function Kernel() {
    return (
        <section className="container mx-auto px-6 pt-24 pb-16 max-w-2xl">
            <h1 className="text-heading-h1 text-ink-heading mb-3">
                How any two parties can transact directly, anywhere.
            </h1>
            <p className="text-body-lead text-ink-muted italic mb-8">
                Two stakes, each bigger than the deal. One rule for who opens the box. That is the entire machine.
            </p>
            <p className="text-base text-ink-body leading-relaxed mb-5">
                The short version is a lockbox: both sides put in a stake, more than the deal is worth, held by a small program that runs in the open, owned by no one, following one fixed rule. Say the deal is worth ten tokens, in any ERC20 the participants accept. The buyer locks twenty &mdash; the ten they owe, and ten more as a stake. The seller locks twenty too, all of it stake. Forty is held, and until the deal is done, neither side can reach any of it. Only the 2&times; ratio is ever fixed, never the number.
            </p>
            <p className="text-base text-ink-body leading-relaxed mb-4">
                Why twice the value, and not the payment plus a small margin? Because the size of the stake is the whole mechanism. At twice the value there is no amount that is clever to steal:
            </p>
            <div className="overflow-x-auto mb-5">
                <table className="w-full max-w-xl text-sm text-left">
                    <thead>
                        <tr className="border-b border-default text-ink-heading">
                            <th className="py-2 pr-4 font-semibold">If you&hellip;</th>
                            <th className="py-2 font-semibold">You end with&hellip;</th>
                        </tr>
                    </thead>
                    <tbody className="text-ink-body">
                        <tr className="border-b border-default"><td className="py-2 pr-4">honor the deal</td><td className="py-2">your stake back &mdash; and the seller is paid</td></tr>
                        <tr><td className="py-2 pr-4">walk away</td><td className="py-2">your double stake locked forever &mdash; and nobody else gets it</td></tr>
                    </tbody>
                </table>
            </div>
            <p className="text-base text-ink-body leading-relaxed mb-5">
                Nothing is seized and nobody judges: a forfeited stake is simply value that never comes home, locked in the box, benefiting no one. The math is exactly why walking away is rare &mdash; it always costs the one who walks more than finishing ever could. And the lock is mutual for as long as it lasts: until the buyer closes, neither side can reach anything, so a deal nobody closes strands both stakes in the box, not just the walker&apos;s. The deterrent works on both sides at once, with one difference &mdash; whoever walks gave up more than finishing would ever have paid them, while the other side can lose only what they locked, and never a token more.
            </p>
            <p className="text-base text-ink-body leading-relaxed mb-5">
                The stake is a new kind of thing. Value you part with has always had two modes: spent, or invested. The stake is a third &mdash; neither consumed nor put to work earning, a promise made expensive to break, and it comes home intact every honest time.
            </p>
            <p className="text-base text-ink-body leading-relaxed mb-5">
                One rule decides who opens the lockbox: the buyer, and only the buyer. That is not an advantage held over the seller &mdash; the buyer is locked at twice the value too, so stalling costs the buyer exactly as much as anyone. No arbitrator weighs the case; no timer releases what is locked. And because nothing settles until the buyer closes, whatever the two sides agreed to is met first &mdash; a remake, a redelivery, whatever the terms demand &mdash; then the deal closes.
            </p>
            <p className="text-base text-ink-body leading-relaxed mb-5">
                Two mechanisms, then, not one, and neither is the other&apos;s consequence. The stakes are what make cheating lose on any single pair of hands. The one-close rule is what makes many pairs of hands settle as one deal, all together or not at all. Stakes on their own would leave every pair separately secured and nothing tying them together &mdash; each would have to be released on its own terms; a closer with nothing locked would simply be an authority, which is the thing this design exists to do without. They compose in that order &mdash; the stakes secure each pair, the close settles the whole &mdash; and the composition is the machine.
            </p>
            <LockedFundsStateFigure className="my-8" />
            <p className="text-base text-ink-body leading-relaxed mb-5">
                Most real work is not two people. The same move repeats: every contributor posts their own stake, each staking against everything already added ahead of them, and the buyer&apos;s single all-or-nothing close holds the whole chain together &mdash; every stake comes home, or none do. So each contributor has a direct, stake-backed reason to want everyone else to deliver. A lead freelancer with two contributors, or six parties moving a container from shipper to consignee, is this one move repeated; the chains published as reusable shapes are listed on{" "}
                <Link href="/assemblies" className="text-ink-heading font-medium hover:underline">
                    Assemblies
                </Link>
                .
            </p>
            <StackedBondChainFigure
                className="my-8"
                idPrefix="kernel-stacked-stakes"
                legs={[
                    { name: "First contributor", role: "opens the deal", payment: 6 },
                    { name: "Second contributor", role: "commits next", payment: 3 },
                    { name: "Third contributor", role: "commits last", payment: 1 },
                ]}
                figureTitle="The same ten-token deal, shared by three contributors"
                figureDesc={
                    "A ten-token deal split across three contributors in the order they " +
                    "commit: the first is paid 6.00, the second 3.00, the third 1.00. " +
                    "Each stakes twice the value the deal has accumulated at its own " +
                    "link rather than twice its own payment, so the third contributor — " +
                    "paid least — stakes twice the whole 10.00. The buyer stakes twice " +
                    "each payment as that contributor commits, twenty in all. All three " +
                    "settle together, or none do."
                }
                caption={
                    <>
                        The same ten-token deal, now shared by three pairs of hands. The third
                        contributor is paid the least (1.00) and locks the most
                        (2 &times; 10.00 = 20.00): by the time it commits, the running total
                        already carries the other two. The buyer&apos;s twenty is the same
                        twenty as before &mdash; it just arrives one commitment at a time.
                    </>
                }
            />
            <p className="text-base text-ink-body leading-relaxed mb-5">
                Either way, the protocol writes down every step permanently as it happens, so an arbitrator or a court never has to reconstruct what took place.
            </p>
            <p className="text-base text-ink-body leading-relaxed">
                That is the whole of it: a stake large enough that cheating loses, and one clear rule for who opens the box. Everything else Figaro does is built on those two facts and changes neither.
            </p>
        </section>
    );
}
