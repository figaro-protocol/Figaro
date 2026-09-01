import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import Link from "next/link";
import { LockedFundsStateFigure } from "@/components/figures/LockedFundsStateFigure";
import { StackedBondChainFigure } from "@/components/figures/StackedBondChainFigure";

export const metadata: Metadata = withOg({
    title: "Kernel — Figaro Protocol",
    description:
        "How a Figaro trade works: both sides lock a bond larger than the payment, so cheating always loses; the buyer closes it out; every step is written down permanently.",
});

// FigaroCore's mechanism design, and ONLY that: the kernel page never carries
// the stack — the stack figure lives on home. Short by intent, ~420 words plus
// the state figure (which lives here, not on /security, which owns tests and
// audit results) and the outcome table. Probe-refined sentences are kept
// verbatim where they survive; do not re-grow this page.
export default function Kernel() {
    return (
        <section className="container mx-auto px-6 pt-24 pb-16 max-w-2xl">
            <h1 className="text-heading-h1 text-ink-heading mb-3">
                How any two parties can transact directly, anywhere.
            </h1>
            <p className="text-body-lead text-ink-muted italic mb-8">
                Two bonds, each bigger than the trade. One rule for who opens the box. That is the entire machine.
            </p>
            <p className="text-base text-ink-body leading-relaxed mb-5">
                The short version is a lockbox. Both sides put in a bond worth more than the payment. A small program holds it &mdash; running in the open, owned by no one, following one fixed rule. Say the trade is worth ten tokens, in any ERC20 the participants accept. The buyer locks twenty &mdash; the ten they owe, and ten more as a bond. The seller locks twenty too, all of it bond. Forty is held, and until the trade is done, neither side can reach any of it. Only the 2&times; ratio is ever fixed, never the number.
            </p>
            <p className="text-base text-ink-body leading-relaxed mb-4">
                Why twice the value, and not the payment plus a small margin? Because the size of the bond is the whole mechanism. At twice the value there is no amount that is clever to steal:
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
                        <tr className="border-b border-default"><td className="py-2 pr-4">honor the trade</td><td className="py-2">your bond back &mdash; and the seller is paid</td></tr>
                        <tr><td className="py-2 pr-4">walk away</td><td className="py-2">your double bond locked forever &mdash; and nobody else gets it</td></tr>
                    </tbody>
                </table>
            </div>
            <p className="text-base text-ink-body leading-relaxed mb-5">
A forfeited bond is simply value that is never refunded, locked in the box, benefiting no one &mdash; nothing is seized, and nobody judges. The math is exactly why walking away is rare: it always costs the one who walks more than finishing ever could. And the lock is mutual for as long as it lasts &mdash; until the buyer closes, neither side can reach anything, so a trade nobody closes strands both bonds in the box. The deterrent works on both sides at once, with one difference: whoever walks gave up more than finishing would ever have paid them, while the other side can lose only what they locked.
            </p>
            <p className="text-base text-ink-body leading-relaxed mb-5">
                Value you part with has always had two modes: spent, or invested. A bond is a third. It is not consumed and it is not earning &mdash; and the not-earning is the honest price: for the trade&apos;s duration that capital stands idle, a cost that weighs heaviest on whoever has the least to spare. It is a promise made expensive to break, and it is refunded intact every honest time.
            </p>
            <h2 className="text-heading-h2 text-ink-heading mt-10 mb-5">
                Who opens the box.
            </h2>
            <p className="text-base text-ink-body leading-relaxed mb-5">
                One rule decides who opens the lockbox: the buyer, and only the buyer. That is not an advantage held over the seller &mdash; the buyer is locked at twice the value too, so stalling costs the buyer exactly as much as anyone. No arbitrator weighs the case; no timer releases what is locked. And because nothing resolves until the buyer closes, whatever the two sides agreed to is met first &mdash; a remake, a redelivery, whatever the terms demand &mdash; then the trade closes.
            </p>
            <h2 className="text-heading-h2 text-ink-heading mt-10 mb-5">
                Two mechanisms, not one.
            </h2>
            <p className="text-base text-ink-body leading-relaxed mb-5">
                Neither mechanism is the other&apos;s consequence. The bonds are what make cheating lose on any single pair of hands. The one-close rule is what makes many pairs of hands resolve as one trade, all together or not at all. Bonds on their own would leave every pair separately secured and nothing tying them together &mdash; each would have to be released on its own terms; a closer with nothing locked would simply be an authority, which is the thing this design exists to do without. They compose in that order &mdash; the bonds secure each pair, the close resolves the whole &mdash; and the composition is the machine.
            </p>
            <LockedFundsStateFigure className="my-8" />
            <h2 className="text-heading-h2 text-ink-heading mt-10 mb-5">
                More than two pairs of hands.
            </h2>
            <p className="text-base text-ink-body leading-relaxed mb-5">
                Most real work is not two people. The same move repeats: every contributor posts their own bond, each bonding against everything already added ahead of them, and the buyer&apos;s single all-or-nothing close holds the whole chain together &mdash; every bond is refunded, or none is. So each contributor has a direct, bond-backed reason to want everyone else to deliver. Nothing new arrives as the chain lengthens &mdash; no coordinator, no second mechanism, nothing further to trust: it is the same two-party arithmetic run once per link, so how many hands are in a trade is a property of the trade somebody composed, never of the machine that secures it. A lead freelancer with two contributors, or six parties moving a container from shipper to consignee, is this one move repeated; the chains published as reusable shapes are listed on{" "}
                <Link href="/assemblies" className="text-ink-heading font-medium hover:underline">
                    Assemblies
                </Link>
                .
            </p>
            <StackedBondChainFigure
                className="my-8"
                idPrefix="kernel-stacked-stakes"
                legs={[
                    { name: "First contributor", role: "opens the trade", payment: 6 },
                    { name: "Second contributor", role: "commits next", payment: 3 },
                    { name: "Third contributor", role: "commits last", payment: 1 },
                ]}
                figureTitle="The same ten-token trade, shared by three contributors"
                figureDesc={
                    "A ten-token trade split across three contributors in the order they " +
                    "commit: the first is paid 6.00, the second 3.00, the third 1.00. " +
                    "Each bonds twice the value the trade has accumulated at its own " +
                    "link rather than twice its own payment, so the third contributor — " +
                    "paid least — bonds twice the whole 10.00. The buyer bonds twice " +
                    "each payment as that contributor commits, twenty in all. All three " +
                    "resolve together, or none do."
                }
                caption={
                    <>
                        The same ten-token trade, now shared by three pairs of hands. The third
                        contributor is paid the least (1.00) and locks the most
                        (2 &times; 10.00 = 20.00): by the time it commits, the running total
                        already carries the other two. The buyer&apos;s twenty is the same
                        twenty as before &mdash; it just arrives one commitment at a time.
                    </>
                }
            />
            <h2 className="text-heading-h2 text-ink-heading mt-10 mb-5">
                The data, and the proof.
            </h2>
            <p className="text-base text-ink-body leading-relaxed mb-5">
                Resolved or left to sit, the protocol writes down every step permanently as it happens, so an arbitrator or a court never has to reconstruct what took place.
            </p>
            <p className="text-base text-ink-body leading-relaxed">
                That is the whole of it: a bond large enough that cheating loses, and one clear rule for who opens the box. The claim is proved, not promised — the derivation is in <Link href="/papers/asymmetric-bonding" className="text-ink-heading font-medium hover:underline">Asymmetric Bonding and Buyer Dominance</Link>, and the contract itself is catalogued on <Link href="/spec#FigaroCore" className="text-ink-heading font-medium hover:underline">Specifications</Link>. Those two facts are what survived the peeling: deliberately too small to say anything about a trade on their own. What they license is everything a trade actually needs, rebuilt one level up by whoever wants to build it — and nobody holding anything in the middle.
            </p>
        </section>
    );
}
