import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import Link from "@/components/shared/Link";
import { LockedFundsStateFigure } from "@/components/figures/LockedFundsStateFigure";
import { StackedBondChainFigure } from "@/components/figures/StackedBondChainFigure";
import { KERNEL_EQUILIBRIUM } from "@figaro-protocol/sdk";

// Every number and every outcome on this page is rendered from the kernel's
// equilibrium module (sdk/src/equilibrium.json), the one owner of those
// figures; the theorem itself is the asymmetric-bonding paper's. The guard
// scripts/lint-equilibrium-owner.sh fails a commit that retypes them here.
const EQ = KERNEL_EQUILIBRIUM;
const EX = EQ.example;
const CH = EQ.example.chain; // the same trade shared by three sellers — legs and their arithmetic, one owner

export const metadata: Metadata = withOg({
    title: "Kernel — Figaro Protocol",
    description:
        "How a Figaro trade works: both sides lock a bond larger than the payment, so cooperation is the equilibrium; the buyer resolves it; every step is written down permanently.",
});

// FigaroCore's mechanism design, and ONLY that: the kernel page never carries
// the stack — the stack figure lives on home. Short by intent, ~490 words plus
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
                Two bonds, each bigger than the trade. One rule for who resolves. That is the entire machine.
            </p>
            <h2 id="refusals" className="text-heading-h2 text-ink-heading mb-5">
                Three refusals.
            </h2>
            <ul className="text-base text-ink-body leading-relaxed mb-6 space-y-3">
                <li>
                    <strong className="text-ink-heading">Deterrence, never recovery.</strong> One event refunds a locked bond: the buyer&apos;s resolution, which refunds every bond in the process at once. Any other exit is the attack surface &mdash; whoever could trigger a refund gains a reason to walk away.
                </li>
                <li>
                    <strong className="text-ink-heading">No clock runs on an open process.</strong> Once the bonds are locked nothing expires and nothing times out: the process stays open until the buyer resolves. The one timestamp sits earlier &mdash; a signed order carries a deadline, past which that offer can no longer be committed. So waiting alone never turns a standoff in anyone&apos;s favour.
                </li>
                <li>
                    <strong className="text-ink-heading">The 2&times; is the mechanism, not a setting.</strong> Both bonds are twice a figure the parties signed &mdash; no multiplier to tune, no discount for a familiar counterparty, no per-party weight.
                </li>
            </ul>
            <p className="text-base text-ink-body leading-relaxed mb-5">
                The rest is arithmetic, held by a smart contract running in the open, permissionless and decentralized. Say the trade is worth {EX.payment} tokens, in the ERC-20 the participants chose. The buyer locks {EX.buyer_locks} &mdash; one bond of twice the payment, the {EX.payment} they owe carried inside it. The seller locks {EX.seller_locks} too, all of it bond: {EX.held} held, and out of reach until the buyer resolves. Only the 2&times; ratio is ever fixed, never the number.
            </p>
            <p className="text-base text-ink-body leading-relaxed mb-4">
                Why twice the value, and not the payment plus a small margin? Because at twice the value there is no amount that is clever to steal &mdash; the theorem and its proof are in <Link href="/papers/asymmetric-bonding" className="text-ink-heading font-medium hover:underline">Asymmetric Bonding and Buyer Dominance</Link>. What it comes to, for either side:
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
                        <tr className="border-b border-default"><td className="py-2 pr-4">honor the trade</td><td className="py-2">{EX.outcomes_plain.honor}</td></tr>
                        <tr><td className="py-2 pr-4">walk away</td><td className="py-2">{EX.outcomes_plain.walk_away}</td></tr>
                    </tbody>
                </table>
            </div>
            <p className="text-base text-ink-body leading-relaxed mb-5">
A forfeited bond is simply value that is never refunded, locked in the smart contract, reaching no one &mdash; nothing is seized, and nobody judges. The math is what turns walking away into the losing move: whoever walks stands worse off than finishing would have left them &mdash; counting everything they kept &mdash; so long as the rest of the chain performs. And the lock is mutual for as long as it lasts &mdash; until the buyer resolves, neither side can reach anything, so a trade nobody resolves strands both bonds in the box. The deterrent works on both sides at once, with one difference: whoever walks gave up more than finishing would ever have paid them, while the other side can lose only what they locked. In numbers: a buyer that never resolves after delivery keeps what was delivered and leaves its whole bond locked, so it is out of pocket by {EX.outcomes_plain.buyer_out_of_pocket_after_delivery}; a seller that holds out forfeits {EX.outcomes_plain.seller_forfeits_on_holdout}.
            </p>
            <p className="text-base text-ink-body leading-relaxed mb-5">
                For the trade&apos;s duration the bonded tokens stand idle. That is the honest price, and it weighs heaviest on whoever has the least to spare. It is a promise made expensive to break, and it is refunded intact every honest time.
            </p>
            <h2 className="text-heading-h2 text-ink-heading mt-10 mb-5">
                Who resolves.
            </h2>
            <p className="text-base text-ink-body leading-relaxed mb-5">
                One rule decides who unlocks the smart contract: the buyer, and only the buyer. That is not an advantage held over the seller &mdash; the buyer&apos;s own bond is locked in the same smart contract. The buyer&apos;s signature is the only thing that releases what is locked. And because nothing resolves until the buyer signs, whatever the two sides agreed to is met first &mdash; a remake, a redelivery, whatever the terms demand &mdash; then the trade resolves.
            </p>
            <h2 className="text-heading-h2 text-ink-heading mt-10 mb-5">
                Two mechanisms, not one.
            </h2>
            <p className="text-base text-ink-body leading-relaxed mb-5">
                Neither mechanism is the other&apos;s consequence. The bonds are what make cheating lose on any single pair of hands. The one-resolver rule is what makes many pairs of hands resolve as one trade, all together or not at all. Bonds on their own would leave every pair separately secured and nothing tying them together &mdash; each would have to be released on its own terms; a resolver with nothing locked would simply be an authority. They compose in that order &mdash; the bonds secure each pair, the resolution carries the whole &mdash; and the composition is the machine.
            </p>
            <LockedFundsStateFigure className="my-8" />
            <h2 className="text-heading-h2 text-ink-heading mt-10 mb-5">
                More than two pairs of hands.
            </h2>
            <p className="text-base text-ink-body leading-relaxed mb-5">
                Most real work is not two people. The same move repeats: every contributor posts their own bond, each bonding against everything already added ahead of them, and the buyer&apos;s single all-or-nothing resolution holds the whole chain together &mdash; every bond is refunded, or none is. So each contributor has a direct, bond-backed reason to want everyone else to deliver. Nothing new arrives as the chain lengthens &mdash; no coordinator, no second mechanism, nothing further to trust: it is the same two-party arithmetic run once per link, so how many hands are in a trade is a property of the trade somebody composed, never of the machine that secures it. A lead freelancer with two contributors, or six parties moving a container from shipper to consignee, is this one move repeated; the chains published as reusable shapes are listed on{" "}
                <Link href="/assemblies" className="text-ink-heading font-medium hover:underline">
                    Assemblies
                </Link>
                .
            </p>
            <StackedBondChainFigure
                className="my-8"
                idPrefix="kernel-stacked-stakes"
                legs={CH.legs}
                figureTitle={`The same ${CH.trade}-token trade, shared by ${CH.legs.length} contributors`}
                figureDesc={
                    `A ${CH.trade}-token trade split across ${CH.legs.length} contributors in the order they ` +
                    `commit: the first is paid ${CH.legs[0].payment}, the second ${CH.legs[1].payment}, the third ${CH.legs[2].payment}. ` +
                    "Each bonds twice the value the trade has accumulated at its own " +
                    "link rather than twice its own payment, so the third contributor — " +
                    `paid least — bonds twice the whole ${CH.trade}. The buyer bonds twice ` +
                    `each payment as that contributor commits, ${CH.buyer_total} in all. All three ` +
                    "resolve together, or none do."
                }
                caption={
                    <>
                        The same {CH.trade}-token trade, now shared by {CH.legs.length} pairs of hands. The third
                        contributor is paid the least ({CH.legs[2].payment}) and locks the most
                        (2 &times; {CH.trade} = {CH.seller_bonds[2]}): by the time it commits, the running total
                        already carries the other two. The buyer&apos;s {CH.buyer_total} is the same
                        {EX.buyer_locks} as before &mdash; it just arrives one commitment at a time.
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
                That is the whole of it. The claim is proved, not promised — the derivation is in <Link href="/papers/asymmetric-bonding" className="text-ink-heading font-medium hover:underline">Asymmetric Bonding and Buyer Dominance</Link>, and the smart contract itself is catalogued on <Link href="/spec#FigaroCore" className="text-ink-heading font-medium hover:underline">Specifications</Link>. The bonds and the one-resolver rule are what survived the peeling: deliberately too small to say anything about a trade on their own. What they license is everything a trade actually needs, rebuilt one level up by whoever wants to build it — and nobody holding anything in the middle.
            </p>
        </section>
    );
}
