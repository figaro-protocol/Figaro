import type { Metadata } from "next";
import Link from "next/link";
import { StackedBondChainFigure } from "@/components/figures/StackedBondChainFigure";

// No `openGraph`/`twitter` here (unlike its page siblings): this route's
// layout (`local-commerce/layout.tsx`) already carries a curated `openGraph`
// — Next.js metadata merging REPLACES a parent's `openGraph` object wholesale
// with a child's, so adding one here would silently blank out that copy
// rather than extend it.
export const metadata: Metadata = {
    title: "Local Commerce — Figaro Protocol",
    description: "One meal, three strangers, no platform: a delivered meal ordered, cooked, carried, settled in one stroke — and what the settled deal leaves behind. Generic across food, retail, and services.",
};

// One worked example, told as a lived deal — never the site's default telling
// (the local-commerce model is demoted: one vertical among many). Protocol
// vocabulary and contract identifiers stay OFF this page — the exact
// contracts, clauses, and event flow live at /spec.
//
// The narrated deal must match the published `Local commerce` assembly, which
// is TWO orders: a merchant root order and one co-equal courier sub-order. Do
// not reintroduce a third tier (a farm, a supplier) into the narrated deal or
// into its figure; no published assembly carries one, and the numbers in the
// prose — like the `legs` passed to `StackedBondChainFigure` — are the
// checkout values of those two legs. The deeper-chains paragraph in "Under the
// hood" is the one place deeper chains are named, and it names them only as
// shapes OTHER assemblies could compose: a stated possibility, never a third
// leg of tonight's deal.
//
// "The morning after" is the page's third rung (a deal → an economy → the
// world) and is POST-SETTLEMENT NARRATIVE ONLY — never a third order, tier, or
// leg. Its four leftovers are the ruled ones, and each has a hard constraint:
// the record is shown to a venue that still rules, on evidence, and forums stay
// provider-agnostic; the receipts split is the fiscal multisender — a wallet
// spending its OWN tokens after the deal ended, so no sentence may imply the
// deal routed a fiscal share or that any clause computed one (ruled
// 2026-08-21); the currency hop is one ordinary swap on an open exchange, never
// a fiat pipeline; the detail stays with its owners while only the thin public
// half joins the map. The register for institutions is the homepage's: they
// move to the edges, venues you consult, not hosts you must pass through.
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
                    You &mdash; the one paying &mdash; are the only person who can close the deal, and closing it settles everyone at once. That is not a privilege: your own doubled stake is locked until you do. The deal ends when you say it ended, and the moment you do, it is as if the little institution that formed around your dinner had never existed. It did its work and dissolved.
                </p>
            </section>

            <section className="container mx-auto px-6 pb-12 max-w-3xl border-t border-default pt-12">
                <h2 className="text-heading-h2 text-ink-heading mb-6">
                    What you saw before you paid
                </h2>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    That dissolving institution left something behind that an ordinary evening never does: you saw where your payment was going before you committed to any of it. Order from an ordinary restaurant chain and it lands as one lump sum; where it goes after that &mdash; the cooks, the courier, the landlord, the owner&apos;s cut &mdash; is decided inside the company, privately, after the fact. Order this way and you saw the split at checkout: 8.40 to the kitchen, 2.10 to the courier, 10.50 in all &mdash; the complete P&amp;L of your dinner, line by line, before you paid a cent.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    Each line was its own stake, and both had to settle together or not at all &mdash; that is the same rule that let the kitchen and the courier trust each other without a dispatcher. The figure sets the two legs side by side: what each was paid, what each had to lock up to take the work, and what came back when you confirmed. Two paid lines on one receipt is the ordinary shape here; a bookshop order or a single tailor&apos;s bill is simply the shortest version, a P&amp;L with one line.
                </p>
                <StackedBondChainFigure
                    className="mt-8"
                    idPrefix="local-commerce-stacked-stakes"
                    legs={[
                        { name: "Kitchen", role: "root order", payment: 8.4 },
                        { name: "Courier", role: "sub-order", payment: 2.1 },
                    ]}
                    figureTitle="The two legs of the dinner: what each was paid, what each staked"
                    figureDesc={
                        "A two-order deal. The kitchen takes the root order: paid 8.40, " +
                        "staking twice the value on the deal at its link — 16.80. The " +
                        "courier commits afterwards, once the food's 8.40 is already on the " +
                        "deal, so it stakes twice the 10.50 running total — 21.00 — to earn " +
                        "2.10. The buyer stakes twice each payment as that order commits, " +
                        "21.00 in all. Both orders settle together, or neither does."
                    }
                    caption={
                        <>
                            Each contributor stakes against everything the deal has accumulated
                            through its own link. So the courier takes the smaller share (2.10 to
                            the kitchen&apos;s 8.40) and locks up the larger stake
                            (2 &times; 10.50 = 21.00, against the kitchen&apos;s 16.80): by the
                            time the courier commits, the running total carries the food as well
                            as the ride.
                        </>
                    }
                />
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
                    In the real world things go wrong, and most people are ready to put them right. What the deal adds is a reason that isn&apos;t goodwill: the kitchen and the courier each staked more than they stand to make, and none of it comes back until you are satisfied. Fixing your problem is their winning move &mdash; not a favour, just where the arithmetic points. And the remedy rarely rests on one pair of shoulders: nobody is paid until you confirm, so when the courier fails, the kitchen wants it fixed too. The willingness people usually have to set things right is the same willingness the deal turns into the paying strategy.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    And the hardest case, the one no button softens: the kitchen simply vanishes. Nothing gets remade, nothing gets resent, there is no one left to put it right &mdash; so the deal never closes, your stake stays locked, and you eat that loss. We can say it out loud, because the math is what makes it rare: whoever vanished walked away from double what you lost, forfeited forever. Walking away is never the profitable move, so it is never the rational one &mdash; what is left is the irrational residue every system carries, and the record marks the address that did it, permanently. No refund button appears here, and that is the design: the property that stops anyone reaching into a deal from outside is the same property that leaves this loss standing.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    The mirror of that case turns it on the kitchen: a buyer who eats the meal and then, out of pure spite, never confirms. This too is a real loss, said out loud &mdash; the kitchen cooked and the courier carried, the payment sits frozen in the box, and the kitchen is out the food it made and the stake it locked. But spite here has a price paid in advance. To freeze the kitchen&apos;s stake, the buyer has to abandon their own, locked in the very same box &mdash; twice what the dinner was worth, gone for good, in exchange for a single meal. There are no anonymous free shots: the same doubled stake that lets you close a deal is the stake you forfeit by refusing to, so griefing costs the griefer their whole stake up front &mdash; and the kitchen carries a clean, timestamped account into whatever outside forum it turns to.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    Some things a dinner can&apos;t settle by itself &mdash; a real dispute, a loss that runs past the meal, a question only a court or an insurer can answer. The deal doesn&apos;t pretend to absorb those, and no court reaches into the lockbox to settle them; what stands behind a deal, layer by layer, is on <Link href="/faq#layers" className="text-ink-heading font-medium hover:underline">the FAQ</Link>. What the evening leaves instead is a clean record: every step it wrote down, timestamped and unforgeable, is there for whatever outside forum the parties turn to. Ordinary agreements open by asking both sides for good faith. This one asks each side to back its word with a stake &mdash; and then there is nothing left to take on trust.
                </p>
            </section>

            <section className="container mx-auto px-6 pb-12 max-w-3xl border-t border-default pt-12">
                <h2 className="text-heading-h2 text-ink-heading mb-6">
                    Who is at the table
                </h2>
                <p className="text-base text-ink-body leading-relaxed mb-6">
                    Each participant is a wallet, and each wallet stands for something real &mdash; the asset stays off-chain on its owner&apos;s books; the wallet is its on-chain handle, and whoever holds that wallet&apos;s signing key &mdash; its operator &mdash; signs on the asset&apos;s behalf. The kitchen&apos;s wallet stands for a kitchen or a shop; the courier&apos;s wallet for a bicycle, a car, or a pair of legs. A public authority &mdash; a municipal food-safety inspection, a road authority charging per mile &mdash; can sit at the same table on the same footing: one more wallet whose committed payment costs the buyer exactly the way any other does.
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
                    Everything above has an exact, inspectable form: the kernel contract that holds the stakes, the registries the participants enrolled in, the clauses their agreement composed, and the event flow the evening left behind. The full catalogue is on <Link href="/spec" className="text-ink-heading font-medium hover:underline">the spec page</Link>; the mechanism itself is told in ten minutes on <Link href="/kernel" className="text-ink-heading font-medium hover:underline">Kernel</Link>.
                </p>
                <p className="text-base text-ink-body leading-relaxed mt-5">
                    The evening above is not a sketch: this deal-shape &mdash; a merchant order with one courier leg hanging off it &mdash; is composed as the <em>Local commerce</em> assembly, and it sits among the registered shapes listed on <Link href="/assemblies" className="text-ink-heading font-medium hover:underline">Assemblies</Link>. Open it there to read its clauses, or fork it in the <Link href="/assemblies/designer" className="text-ink-heading font-medium hover:underline">designer</Link> and change what your own trade needs changed.
                </p>
                <p className="text-base text-ink-body leading-relaxed mt-5">
                    And a shape can be drawn deeper than the evening you just read. Two legs is what this one carries; another can carry the whole supply chain standing behind them &mdash; the mill behind the kitchen, the workshop that keeps the courier&apos;s bicycle on the road &mdash; each its own line with its own stake, all of them paid by the same buyer. Deeper shapes are already published: <em>Containerised import chain</em>, on that same list, moves a reefer container from shipper to consignee through pre-shipment inspection, freight forwarding, ocean carriage, customs, and drayage &mdash; six bonded parties, one importer of record closing every leg at once. A deal, in other words, can be decomposed into its component parts and every part settled in one stroke: one checkout signing the whole chain, one confirmation closing every order together or none at all. The only limits are the network&apos;s gas and how much of that detail a buyer finds material &mdash; and that second limit is exercised by choosing: whoever wants the mill named picks a seller offering the shape that names it, and whoever just wants dinner picks the one you saw. Anyone can publish the deeper shape; nobody is obliged to trade through it.
                </p>
            </section>

            <section className="container mx-auto px-6 pb-24 max-w-3xl border-t border-default pt-12">
                <h2 className="text-heading-h2 text-ink-heading mb-6">
                    The morning after
                </h2>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    The dinner is settled and the little institution that formed around it is gone &mdash; but the evening left four things behind, and each of them now belongs to somebody. The first is the record. Every step the deal wrote down &mdash; which wallets committed to what, for how much, in what order, at what hour, and an unforgeable fingerprint of the agreement they signed &mdash; sits on a public chain that nobody can go back and tidy. Come the tax return, come a food-safety inspection, come a claim filed months later, the kitchen does not have to be believed: it demonstrates from the record instead of asking anyone to take its word. The venue still rules &mdash; a tax authority, a regulator, a court, whichever forum the parties turn to &mdash; and it rules on evidence. Institutions like those do not vanish here. They move to the edges: venues you consult when you need one, not hosts every dinner has to pass through.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    The second is the payment, which is now simply the kitchen&apos;s own. The deal ended the moment you confirmed, and nothing in it knows or cares what happens next. What happens next is that the kitchen pays its evening out &mdash; the tax drawer, the supplier, the savings jar &mdash; in one stroke, to addresses it chose long before you ordered. The dinner had no say in any of it, and the receipts write their own paper trail. The courier does the same with their 2.10, or doesn&apos;t &mdash; nobody supervises either wallet but its own owner.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    The third is what the payment is denominated in. A deal here settles in one token, the one the shape was filled in with, and it need not be the one the kitchen keeps its books in. One hop on an open exchange carries the value across &mdash; an ordinary swap, same chain, same wallet, no permission to ask, no pipeline into or out of the banking system. It is a short last step, not an escape route: from the token the dinner used to the currency the parties already use. A courier whose family spends something different at home takes the same single step in their own direction.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    The fourth is the detail, and it is the one thing that does not travel. What the chain kept is deliberately thin &mdash; wallets, amounts, a token, a fingerprint &mdash; so the bare shape of the evening joins the public map of the market. What the chain never held is the rest: what you ordered, where you live, the photograph at the door, the notes each side kept. That stays sealed with whoever produced it, shown or licensed only on their own terms &mdash; the opposite of how a delivery platform splits the same record. The whole arrangement is on <Link href="/data" className="text-ink-heading font-medium hover:underline">the data layer</Link>.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    None of that is a special power, and none of it is special to dinner. Using a protocol changes nobody&apos;s obligations &mdash; the same income tax, the same sales tax, the same consumer law that covers any direct trade in your jurisdiction covers this one; what changes is how cheaply the kitchen can show it met them, and nothing here is legal or tax advice (<Link href="/faq#compatibility" className="text-ink-heading font-medium hover:underline">the FAQ</Link> says so at more length). Whatever the trade &mdash; a meal, an alteration, a container of cargo &mdash; a settled deal leaves the same four things: a record that can be shown, receipts a wallet splits on its own, value one hop from the currency in use, and detail that stays with the people who made it. Where those pieces meet the rest of the chain &mdash; forums, swaps, payout routing &mdash; is on <Link href="/composition" className="text-ink-heading font-medium hover:underline">Composition</Link>.
                </p>
            </section>

        </>
    );
}
