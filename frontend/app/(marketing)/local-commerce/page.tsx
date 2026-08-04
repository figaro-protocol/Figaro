import type { Metadata } from "next";
import Link from "next/link";
import { StackedBondChainFigure } from "@/components/figures/StackedBondChainFigure";

export const metadata: Metadata = {
    title: "Local Commerce — Figaro Protocol",
    description: "One meal, three strangers, no platform: a delivered meal ordered, cooked, carried, and settled in one stroke. Generic across food, retail, and services.",
};

// The scene page: the canonical story (lockbox + delivered meal) told as a
// lived deal. Protocol vocabulary and contract identifiers stay OFF this
// page — the exact contracts, clauses, and event flow live at /spec.
export default function LocalCommercePage() {
    return (
        <>
            <section className="container mx-auto px-6 pt-24 pb-12 max-w-3xl">
                <h1 className="text-heading-h1 text-ink-heading mb-6">
                    One meal, three strangers, no platform.
                </h1>
                <p className="text-body-lead text-ink-body max-w-2xl">
                    It is seven in the evening and you order dinner. A kitchen you have never dealt with accepts. A courier you have never met carries it. Twenty minutes later you confirm it arrived &mdash; and in that single stroke the kitchen is paid, the courier is paid, and every stake goes home. No company sat in the middle. Nothing held the deal together but the deal itself.
                </p>
            </section>

            <section className="container mx-auto px-6 pb-12 max-w-3xl border-t border-default pt-12">
                <h2 className="text-heading-h2 text-ink-heading mb-6">
                    How the evening actually went
                </h2>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    When you placed the order, the kitchen locked a stake to accept it. When the courier took the delivery leg, they staked against the whole running value of the deal &mdash; food and delivery both &mdash; because by then they were carrying everyone&apos;s work, not just their own.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    That is the whole trick, repeated once per participant: every stake is bigger than anything its owner could gain by walking away. The kitchen wants the courier to succeed &mdash; its own stake rides on the delivery. The courier wants the kitchen to have cooked what you ordered &mdash; their stake rides on your confirmation. Nobody supervises anybody, and everybody is invested in everybody. A platform does this with dispatchers, ratings, and support tickets. Here the shape of the deal does it.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    You &mdash; the one paying &mdash; are the only person who can close the deal, and closing it settles everyone at once. That is not a privilege; your own doubled stake is locked until you do, so stalling costs you most of all. The deal ends when you say it ended, and the moment you do, it is as if the little institution that formed around your dinner had never existed. It did its work and dissolved.
                </p>
            </section>

            <section className="container mx-auto px-6 pb-12 max-w-3xl border-t border-default pt-12">
                <h2 className="text-heading-h2 text-ink-heading mb-6">
                    What you saw before you paid
                </h2>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    That dissolving institution left something behind that an ordinary evening never does: you saw where your payment was going before you committed to any of it. Order from an ordinary restaurant chain and it lands as one lump sum; where it goes after that &mdash; the cooks, the courier, the farm that grew the tomatoes, the landlord, the owner&apos;s cut &mdash; is decided inside the company, privately, after the fact. Order this way and you saw the split at checkout: 8.40 to the kitchen, 2.10 to the courier, 0.30 to the farm &mdash; the complete P&amp;L of your dinner, line by line, before you paid a cent. These figures differ from the other worked examples on this site; the 2&times; rule under all of them is the same.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    Every line was its own stake, and they all had to settle together or not at all &mdash; that is the same rule that let the kitchen and the courier trust each other without a dispatcher. The figure below lays out each leg&apos;s stake and payout side by side. Three parties on one receipt is the ordinary shape here; a bookshop order or a single tailor&apos;s bill is simply the shortest version, a P&amp;L with one line.
                </p>
                <StackedBondChainFigure className="mt-8" />
            </section>

            <section className="container mx-auto px-6 pb-12 max-w-3xl border-t border-default pt-12">
                <h2 className="text-heading-h2 text-ink-heading mb-6">
                    When the evening goes wrong
                </h2>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Sometimes it doesn&apos;t arrive. The kitchen runs out; the courier takes a wrong turn; the food shows up cold, or on the floor. In an ordinary evening this is where you start arguing with a support line. Here one fact settles it before it starts: nothing closes until you say it closed. You have the final say.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    The deal is not finished when the food is cooked, or when it reaches your door. It is finished when you confirm &mdash; and whatever the two of you agreed to has to be met before you do. If the meal is wrong, it gets remade. If it never came, it gets sent again, or the delivery is put right. Whatever the agreement called for is what happens first. There is no button that simply hands your payment back, no timer that quietly releases it, no arbitrator who rules on the night. None of those exist here, on purpose &mdash; and their absence is exactly what leaves the call with you.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    In the real world things go wrong, and most people are ready to put them right. What the deal adds is a reason that isn&apos;t goodwill: the kitchen and the courier each staked more than they stand to make, and none of it comes back until you are satisfied. Fixing your problem is their winning move &mdash; not a favour, just where the arithmetic points. And the remedy rarely rests on one pair of shoulders: settlement is all-or-nothing, nobody is paid until you confirm, so when the courier fails the kitchen has its own stake-backed reason to help make it right. The willingness people usually have to set things right is the same willingness the deal turns into the paying strategy.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    And the hardest case, the one no button softens: the kitchen simply vanishes. Nothing gets remade, nothing gets resent, there is no one left to put it right &mdash; so the deal never closes, your stake stays locked, and you eat that loss. We can say it out loud, because the math is what makes it rare: whoever vanished walked away from double what you lost, forfeited forever. Walking away is never the profitable move, so it is never the rational one &mdash; what is left is the irrational residue every system carries, and the record marks the address that did it, permanently. No refund button appears here, and that is the design: the same wall that keeps anyone from prying the stakes out is the wall that leaves this loss standing.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    The mirror of that case turns it on the kitchen: a buyer who eats the meal and then, out of pure spite, never confirms. This too is a real loss, said out loud &mdash; the kitchen cooked and the courier carried, the payment sits frozen in the box, and the kitchen is out the food it made and the stake it locked. But spite here has a price paid in advance. To freeze the kitchen&apos;s stake, the buyer has to abandon their own, locked in the very same box &mdash; twice what the dinner was worth, gone for good, in exchange for a single meal. There are no anonymous free shots: the same doubled stake that lets you close a deal is the stake you forfeit by refusing to, so griefing costs the griefer their whole stake up front. And the record marks the address that did it, permanently &mdash; so the kitchen carries a clean, timestamped account into whatever outside forum it turns to.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    Some things a dinner can&apos;t settle by itself &mdash; a real dispute, a loss that runs past the meal, a question only a court or an insurer can answer. A court doesn&apos;t reach into the lockbox either: a judgment collects from the loser&apos;s other assets the ordinary way, and this record just makes that case faster to win &mdash; the full layering is at <Link href="/security" className="text-ink-heading font-medium hover:underline">security</Link>. The deal doesn&apos;t pretend to absorb those disputes itself. What it leaves instead is a clean record: every step it wrote down, timestamped and unforgeable, is there for whatever outside forum the parties turn to. Ordinary agreements open by asking both sides for good faith. This one asks each side to back its word with a stake &mdash; and then there is nothing left to take on trust.
                </p>
            </section>

            <section className="container mx-auto px-6 pb-12 max-w-3xl border-t border-default pt-12">
                <h2 className="text-heading-h2 text-ink-heading mb-6">
                    Who is at the table
                </h2>
                <p className="text-base text-ink-body leading-relaxed mb-6">
                    Each participant is a wallet, and each wallet stands for something real &mdash; the asset stays off-chain on its owner&apos;s books; the wallet is its on-chain handle, and a seller controls the signing key on the asset&apos;s behalf. The kitchen&apos;s wallet stands for a kitchen or a shop; the courier&apos;s wallet for a bicycle, a car, or a pair of legs. A public authority &mdash; a municipal food-safety inspection, a road authority charging per mile &mdash; can sit at the same table on the same footing: one more wallet whose committed payment costs the buyer exactly the way any other does.
                </p>
                <dl className="space-y-4 text-sm">
                    <div>
                        <dt className="text-base font-semibold text-ink-heading">You, the buyer</dt>
                        <dd className="text-ink-body leading-relaxed mt-1">You start the deal, you stake double on every leg of it, and you alone close it. Everyone else&apos;s payday waits on your confirmation &mdash; which is exactly why the whole chain works to earn it.</dd>
                    </div>
                    <div>
                        <dt className="text-base font-semibold text-ink-heading">The merchant</dt>
                        <dd className="text-ink-body leading-relaxed mt-1">Accepts your order and stakes double the goods value to do so. In food it is a restaurant; in retail, a shop; in services, whoever does the work. The label changes by vertical &mdash; the position in the deal does not.</dd>
                    </div>
                    <div>
                        <dt className="text-base font-semibold text-ink-heading">The courier</dt>
                        <dd className="text-ink-body leading-relaxed mt-1">Takes the delivery leg at their own listed rate and stakes against the running value of the whole deal &mdash; goods plus delivery &mdash; because from pickup to hand-off they carry everyone&apos;s outcome. On a bicycle, in a car, on foot, or by drone; the deal does not care how the distance gets covered.</dd>
                    </div>
                </dl>
            </section>

            <section className="container mx-auto px-6 pb-12 max-w-3xl border-t border-default pt-12">
                <h2 className="text-heading-h2 text-ink-heading mb-6">
                    What you never had to worry about
                </h2>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Your address was sealed so that only the courier could read it, and the key was thrown away when the deal settled &mdash; no standing middleman keeps a file of where you live. The record of how the evening went &mdash; accepted, handed off, arrived &mdash; is the same permanent one described above: already there if a deal ever does go wrong, and anyone can check it.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    The scene is dinner, but nothing in it is about food. The same three-sided shape carries a bookshop order, a tailor&apos;s alteration, a plumber&apos;s house call &mdash; any local deal where something is made, carried, and confirmed.
                </p>
            </section>

            <section className="container mx-auto px-6 pb-12 max-w-3xl border-t border-default pt-12">
                <h2 className="text-heading-h2 text-ink-heading mb-6">
                    Under the hood
                </h2>
                <p className="text-base text-ink-body leading-relaxed">
                    Everything above has an exact, inspectable form: the kernel contract that holds the stakes, the registries the participants enrolled in, the clauses their agreement composed, and the event flow the evening left behind. The full catalogue is on <Link href="/spec" className="text-ink-heading font-medium hover:underline">the spec page</Link>; the mechanism itself is told in ten minutes on <Link href="/protocol" className="text-ink-heading font-medium hover:underline">Protocol</Link>.
                </p>
            </section>

            <section className="container mx-auto px-6 pb-24 max-w-3xl border-t border-default pt-12">
                <h2 className="text-heading-h2 text-ink-heading mb-6">
                    Where to go from here
                </h2>
                <ul className="space-y-3 text-base">
                    <li>
                        <Link href="/discover" data-testid="reference-runtime-link" className="text-ink-heading font-medium hover:underline">
                            Look at the registry
                        </Link>
                        <span className="text-ink-body"> &mdash; before launch it opens as an empty room. Browse who has enrolled so far and place a bonded order &mdash; or be the first name in it.</span>
                    </li>
                    <li>
                        <Link href="/builders" className="text-ink-heading font-medium hover:underline">Builders</Link>
                        <span className="text-ink-body"> &mdash; compose your own deal shapes: clauses, assemblies, tokens, agents.</span>
                    </li>
                    <li>
                        <Link href="/clauses" className="text-ink-heading font-medium hover:underline">Clauses</Link>
                        <span className="text-ink-body"> &mdash; what a clause is, the live registry inventory, and the public-vs-private data seam; the spec format and checklist live beside the registration form.</span>
                    </li>
                    <li>
                        <a href="https://github.com/figaro-protocol/Figaro" target="_blank" rel="noopener noreferrer" className="text-ink-heading font-medium hover:underline">
                            Source
                        </a>
                        <span className="text-ink-body"> &mdash; the protocol is open; read the code the deal ran on.</span>
                    </li>
                </ul>
            </section>
        </>
    );
}
