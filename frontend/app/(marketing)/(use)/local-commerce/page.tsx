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
    description: "One meal, three strangers, no platform: a delivered meal ordered, cooked, carried, resolved in one stroke — and what the finished trade leaves behind. Generic across food, retail, and services.",
};

// One worked example, told as a lived trade — never the site's default telling
// (the local-commerce model is demoted: one vertical among many). Protocol
// vocabulary and contract identifiers stay OFF this page — the exact
// contracts, clauses, and event flow live at /spec.
//
// The narrated trade must match the published `Local commerce` assembly, which
// is TWO orders: a merchant root order and one co-equal courier sub-order. Do
// not reintroduce a third tier (a farm, a supplier) into the narrated trade or
// into its figure; no published assembly carries one, and the numbers in the
// prose — like the `legs` passed to `StackedBondChainFigure` — are the
// checkout values of those two legs.
//
// The page closes on the scene ("What you never had to worry about") plus ONE
// routing paragraph. It used to end twice: an "Under the hood" section and a
// "The morning after" section re-told /composition, /data and the swap after
// the natural close (~1,100 words). Those are cut. Every fact they carried is
// owned by another page — the spec catalogue (/spec), the mechanism (/kernel),
// the published shape and deeper chains (/assemblies), the receipts split and
// the currency hop (/composition), the sealed detail (/data), tax and consumer
// law (/faq#compatibility). Route to those owners; never re-narrate them here.
// The one hard constraint that survives the cut: no sentence may imply the trade
// routed a fiscal share or that any clause computed one — a resolved wallet
// splits its OWN tokens on its own initiative, afterwards.
export default function LocalCommercePage() {
    return (
        <>
            <section className="container mx-auto px-6 pt-24 pb-12 max-w-3xl">
                <h1 className="text-heading-h1 text-ink-heading mb-6">
                    One meal, three strangers, no platform.
                </h1>
                <p className="text-body-lead text-ink-body max-w-2xl">
                    It is seven in the evening and you order dinner. A kitchen you have never dealt with accepts. A courier you have never met carries it. Twenty minutes later you confirm it arrived &mdash; and in that single stroke the kitchen is paid, the courier is paid, and every bond goes home. No company sat in the middle. Nothing held the evening together but the trade itself.
                </p>
                <p className="text-base text-ink-body leading-relaxed max-w-2xl mt-6">
                    What follows is one published assembly, run once. The same clauses and the same kernel carry a freight leg, a data sale, a certified repair, a survey flight, <Link href="/worked-example" className="text-ink-heading font-medium hover:underline">two software agents splitting a commissioned deliverable</Link> &mdash; a meal is only the version everyone has already lived.
                </p>
            </section>

            <section className="container mx-auto px-6 pb-12 max-w-3xl border-t border-default pt-12">
                <h2 className="text-heading-h2 text-ink-heading mb-6">
                    How the evening actually went
                </h2>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    When you placed the order, the kitchen locked a bond to accept it. When the courier took the delivery leg, they bonded against the whole running value of the trade &mdash; food and delivery both &mdash; because by then they were carrying everyone&apos;s work, not just their own.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    That is the whole trick, repeated once per participant: every bond is bigger than anything its owner could gain by walking away. The kitchen wants the courier to succeed &mdash; its own bond rides on the delivery. The courier wants the kitchen to have cooked what you ordered &mdash; their bond rides on your confirmation. Nobody supervises anybody, and everybody is invested in everybody. A platform does this with dispatchers, ratings, and support tickets. Here the shape of the trade does it &mdash; and the shape has a price of its own that the platform&apos;s cut never had: everyone at the table must have the bond to post, and while the trade runs those bonded tokens sit idle, hardest on the thinnest pocket.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    You &mdash; the one paying &mdash; are the only person who can close the order, and closing it resolves everyone at once. Your own doubled bond is locked until you do. The trade ends when you say it ended, and the moment you do, it is as if the little institution that formed around your dinner had never existed. It did its work and dissolved.
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
                    Each line was its own bond, and both had to resolve together or not at all &mdash; that is the same rule that let the kitchen and the courier trust each other without a dispatcher. The figure sets the two legs side by side: what each was paid, what each had to lock up to take the work, and what was refunded when you confirmed. Two paid lines on one receipt is the ordinary shape here; a bookshop order or a single tailor&apos;s bill is simply the shortest version, a P&amp;L with one line.
                </p>
                <StackedBondChainFigure
                    className="mt-8"
                    idPrefix="local-commerce-stacked-stakes"
                    legs={[
                        { name: "Kitchen", role: "root order", payment: 8.4 },
                        { name: "Courier", role: "sub-order", payment: 2.1 },
                    ]}
                    figureTitle="The two legs of the dinner: what each was paid, what each bonded"
                    figureDesc={
                        "A two-order trade. The kitchen takes the root order: paid 8.40, " +
                        "bonding twice the value at its link — 16.80. The " +
                        "courier commits afterwards, once the food's 8.40 is already on the " +
                        "trade, so it bonds twice the 10.50 running total — 21.00 — to earn " +
                        "2.10. The buyer bonds twice each payment as that order commits, " +
                        "21.00 in all. Both orders resolve together, or neither does."
                    }
                    caption={
                        <>
                            The kitchen accepts first and locks 16.80 against the 8.40 of food.
                            The courier arrives to a dinner that already has the food&apos;s
                            value on it, so a 2.10 ride locks 21.00 &mdash; the smallest earning
                            of the evening behind the largest lock, because from the pickup
                            onwards the courier is carrying your whole order, not just the ride.
                        </>
                    }
                />
            </section>

            <section className="container mx-auto px-6 pb-12 max-w-3xl border-t border-default pt-12">
                <h2 className="text-heading-h2 text-ink-heading mb-6">
                    When the evening goes wrong
                </h2>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    This is the branch the arithmetic is built to starve, and you have just read how: each hand at the table does better finishing the evening than abandoning it, so long as the others finish too. Sometimes it doesn&apos;t arrive. The kitchen runs out; the courier takes a wrong turn; the food shows up cold, or on the floor. Here one fact decides it before it starts: nothing closes until you say it closed. The trade is not finished when the food is cooked, or when it reaches your door &mdash; it is finished when you confirm, and whatever the two of you agreed to has to be met before you do. If the meal is wrong, it gets remade. If it never came, it gets sent again, or the delivery is put right. There is no button that simply hands your payment back, no timer that quietly releases it, no arbitrator who rules on the night. Their absence is on purpose, and it is exactly what leaves the call with you.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    In the real world things go wrong, and most people are ready to put them right. This trade adds a reason that isn&apos;t goodwill. The kitchen and the courier each bonded more than they stand to make, and none of it is refunded until you are satisfied. Fixing your problem is their winning move &mdash; and the remedy rarely rests on one pair of shoulders, because nobody is paid until you confirm, so when the courier fails the kitchen wants it fixed too. Two hard cases no button softens, said out loud. If the kitchen simply vanishes, nothing gets remade, the trade never closes, your bond stays locked, and you eat that loss &mdash; while whoever vanished abandoned a bond larger than everything they stood to earn, and the process they left open stays readable on the chain forever. The mirror case turns it on the kitchen: a buyer who eats the meal and then, out of pure spite, never confirms, leaving the kitchen out the food it made and the bond it locked &mdash; but to freeze that bond the buyer abandons their own in the very same box, twice what the dinner was worth, gone for good, in exchange for a single meal. Walking away loses to finishing whenever the other side holds up its end, so what is left is the irrational residue every system carries, and no refund button appears for it, because the property that stops anyone reaching into a trade from outside is the same property that leaves the loss standing. What remains for either hard case is the dispute path &mdash; a forum ruling on the record, a court reaching the other side&apos;s other assets &mdash; and the FAQ&apos;s five layers walk it in order.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    Some things a dinner can&apos;t sort out by itself &mdash; a real dispute, a loss that runs past the meal, a question only a court or an insurer can answer. The trade doesn&apos;t pretend to absorb those, and no court reaches into the smart contract to decide them; what stands behind a trade, layer by layer, is on <Link href="/faq#layers" className="text-ink-heading font-medium hover:underline">the FAQ</Link>. What the evening leaves instead is clean data: every step it wrote down, timestamped and unforgeable, is there for whatever outside forum the parties turn to. Ordinary agreements open by asking both sides for good faith. This one asks each side to back its word with a bond &mdash; and then there is nothing left to take on trust.
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
                        <dd className="text-ink-body leading-relaxed mt-1">You start the trade, you bond double on every leg of it, and you alone close it. Everyone else&apos;s payday waits on your confirmation &mdash; which is exactly why the whole chain works to earn it.</dd>
                    </div>
                    <div>
                        <dt className="text-base font-semibold text-ink-heading">The merchant</dt>
                        <dd className="text-ink-body leading-relaxed mt-1">Accepts your order and bonds double the goods value to do so. In food it is a restaurant; in retail, a shop; in services, whoever does the work. The label changes by vertical &mdash; the position in the trade does not.</dd>
                    </div>
                    <div>
                        <dt className="text-base font-semibold text-ink-heading">The courier</dt>
                        <dd className="text-ink-body leading-relaxed mt-1">Takes the delivery leg at their own listed rate, and bonds against the running value of the whole trade. On a bicycle, in a car, on foot, or by drone; the trade does not care how the distance gets covered.</dd>
                    </div>
                </dl>
            </section>

            <section className="container mx-auto px-6 pb-12 max-w-3xl border-t border-default pt-12">
                <h2 className="text-heading-h2 text-ink-heading mb-6">
                    What you never had to worry about
                </h2>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Your address was sealed so that only the courier could read it, and the key was thrown away when the trade resolved &mdash; no company keeps a standing file of where you live. The data of how the evening went &mdash; accepted, handed off, arrived &mdash; is the same permanent one described above: already there if a trade ever does go wrong, and anyone can check it.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    The scene is dinner, but nothing in it is about food. The same three-sided shape carries a bookshop order, a tailor&apos;s alteration, a plumber&apos;s house call &mdash; any local trade where something is made, carried, and confirmed.
                </p>
            </section>

            <section className="container mx-auto px-6 pb-24 max-w-3xl border-t border-default pt-12">
                <h2 className="text-heading-h2 text-ink-heading mb-6">
                    Where the rest of it lives
                </h2>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    What the evening asked of you was three things and no more: a wallet to sign with, a little ETH for the gas each step costs, and enough of the token the trade is denominated in to cover your own side &mdash; no account, no application, nobody&apos;s approval. And who is actually selling where you are is not a claim this page makes: it is readable live off the network, in <Link href="/registries" className="text-ink-heading font-medium hover:underline">the registries</Link>.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    Everything above has an exact, inspectable form elsewhere: the contracts, registries, clauses and events behind the evening are catalogued on <Link href="/spec" className="text-ink-heading font-medium hover:underline">the spec page</Link>, and the mechanism itself is told in ten minutes on <Link href="/kernel" className="text-ink-heading font-medium hover:underline">Kernel</Link>. The evening is not a sketch either &mdash; a merchant order with one courier leg hanging off it is composed as the <em>Local commerce</em> assembly, readable among the registered shapes on <Link href="/assemblies" className="text-ink-heading font-medium hover:underline">Assemblies</Link>, where deeper chains sit beside it and any of them can be forked in the <Link href="/assemblies/designer" className="text-ink-heading font-medium hover:underline">designer</Link>. What the finished trade leaves behind belongs to whoever produced it: the receipts a paid wallet splits onward on its own initiative afterwards, and the single exchange hop from the trade&apos;s token to the currency a wallet actually keeps its books in, are on <Link href="/composition" className="text-ink-heading font-medium hover:underline">Composition</Link>, while the detail the chain never held &mdash; what you ordered, where you live, the photograph at the door &mdash; stays sealed with its owners, on <Link href="/data" className="text-ink-heading font-medium hover:underline">the data layer</Link>. And using a protocol changes nobody&apos;s obligations: the same income tax, sales tax and consumer law that covers any direct trade in your jurisdiction covers this one &mdash; at more length on <Link href="/faq#compatibility" className="text-ink-heading font-medium hover:underline">the FAQ</Link>, which sets out the gas, the tokens and the tax together, and nothing here is legal or tax advice.
                </p>
            </section>

        </>
    );
}
