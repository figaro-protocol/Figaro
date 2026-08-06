import type { Metadata } from "next";
import Link from "next/link";
import { LockedFundsStateFigure } from "@/components/figures/LockedFundsStateFigure";

export const metadata: Metadata = {
    title: "How it works — Figaro Protocol",
    description:
        "How a Figaro deal works: both sides lock a stake larger than the deal, so cheating always loses; the buyer closes it out; every step is recorded permanently.",
};

// FigaroCore's mechanism design, and ONLY that (operator rule 2026-08-06:
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
            <LockedFundsStateFigure className="my-8" />
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
                Nothing is seized and nobody judges: a forfeited stake is simply value that never comes home, locked in the box, benefiting no one. The math is exactly why walking away is rare &mdash; it always costs the one who walks more than finishing ever could.
            </p>
            <p className="text-base text-ink-body leading-relaxed mb-5">
                The stake is a new kind of thing. Value you part with has always had two modes: spent, or invested. The stake is a third &mdash; neither consumed nor put to work earning, a promise made expensive to break, and it comes home intact every honest time.
            </p>
            <p className="text-base text-ink-body leading-relaxed mb-5">
                One rule decides who opens the lockbox: the buyer, and only the buyer. That is not an advantage held over the seller &mdash; the buyer is locked at twice the value too, so stalling costs the buyer exactly as much as anyone. No arbitrator weighs the case; no timer releases what is locked. And because nothing settles until the buyer closes, whatever the two sides agreed to is met first &mdash; a remake, a redelivery, whatever the terms demand &mdash; then the deal closes.
            </p>
            <p className="text-base text-ink-body leading-relaxed mb-5">
                Most real work is not two people. The same move repeats: every contributor posts their own stake, each staking against everything already added ahead of them, and the buyer&apos;s single all-or-nothing close holds the whole chain together &mdash; every stake comes home, or none do. So each contributor has a direct, stake-backed reason to want everyone else to deliver. The worked three-seller chain, with exact numbers, is in the dinner story at{" "}
                <Link href="/local-commerce" className="text-ink-heading font-medium hover:underline">
                    Local commerce
                </Link>
                .
            </p>
            <p className="text-base text-ink-body leading-relaxed mb-5">
                Either way, the protocol writes down every step permanently as it happens, so an arbitrator or a court never has to reconstruct what took place.
            </p>
            <p className="text-base text-ink-body leading-relaxed">
                That is the whole of it: a stake large enough that cheating loses, and one clear rule for who opens the box. Everything else Figaro does is built on those two facts and changes neither.
            </p>
        </section>
    );
}
