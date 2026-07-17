import type { Metadata } from "next";
import Link from "next/link";

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
                    It is seven in the evening and you order dinner. A kitchen you have never dealt with accepts. A courier you have never met carries it. Twenty minutes later you confirm it arrived &mdash; and in that single stroke the kitchen is paid, the courier is paid, and every deposit goes home. No company sat in the middle. Nothing held the deal together but the deal itself.
                </p>
            </section>

            <section className="container mx-auto px-6 pb-12 max-w-3xl border-t border-default pt-12">
                <h2 className="text-heading-h2 text-ink-heading mb-6">
                    How the evening actually went
                </h2>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    When you placed the order, you locked a deposit worth twice what you were paying &mdash; the payment itself, plus a stake of your own. The kitchen locked a matching stake to accept. When the courier took the delivery leg, they staked against the whole running value of the deal &mdash; food and delivery both &mdash; because by then they were carrying everyone&apos;s work, not just their own.
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
                    Your address was sealed so that only the courier could read it, and the key was thrown away when the deal settled &mdash; no standing middleman keeps a file of where you live. And the whole way through, the protocol quietly wrote down every step &mdash; when the kitchen accepted, when the food changed hands, when it arrived &mdash; each recorded the moment it happened, permanently, where no one can edit it afterward. If a deal ever does go wrong, the account of what happened is already there, and anyone can check it.
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
                            Try it
                        </Link>
                        <span className="text-ink-body"> &mdash; browse the sellers on the registry and place a bonded order.</span>
                    </li>
                    <li>
                        <Link href="/builders" className="text-ink-heading font-medium hover:underline">Builders</Link>
                        <span className="text-ink-body"> &mdash; compose your own deal shapes: clauses, assemblies, tokens, agents.</span>
                    </li>
                    <li>
                        <Link href="/clauses" className="text-ink-heading font-medium hover:underline">Clauses</Link>
                        <span className="text-ink-body"> &mdash; the validation architecture, the reference clauses, and the authoring checklist.</span>
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
