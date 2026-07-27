import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
    title: "How the first florins reach strangers — Figaro Protocol",
    description:
        "Between the network opening and the first retroactive reward, the florin has to reach ordinary hands. Match rounds do it permissionlessly: the DAO pays for work it wants done, and a crowd of donors decides who earned it — by arithmetic the round keeps as the donations land, no committee, no application.",
};

export default function MatchRounds() {
    return (
        <section className="container mx-auto px-6 pt-24 pb-16 max-w-2xl">
            <h1 className="text-heading-h1 text-ink-heading mb-3">
                A crowd decides who gets paid.
            </h1>
            <p className="text-body-lead text-ink-muted italic mb-8">
                Between the day the network opens and the first retroactive reward years later, the florin has to reach ordinary hands. A match round does it the most permissionless way there is: the DAO pays for work it wants done, and a crowd of strangers decides who earned the match.
            </p>
            <p className="text-base text-ink-body leading-relaxed mb-5">
                A new money has a first-mile problem. The retroactive reward for clause and assembly authors only pays for adoption that is already on the record &mdash; and that record takes years to accumulate. So there is a gap: the network is open, real work is being done, and none of the florins reserved for that work have reached anyone yet. A match round is how they first do &mdash; broadly, into strangers&apos; hands, for contributions strangers valued.
            </p>
            <p className="text-base text-ink-body leading-relaxed mb-5">
                The shape is deliberate. The people who issue the florin &mdash; the DAO, the founder &mdash; never touch a market: they run no trading pool, seed no price, hold no position to sell into. The first price of a florin is a stranger&apos;s to name, and its worth arises from use, not from anyone talking it up. What the DAO does instead is ordinary: it pays, in its own money, for work it wants done. What is new is <em>who chooses the recipients</em> &mdash; not a panel, but everyone who shows up to donate.
            </p>
            <p className="text-base text-ink-body leading-relaxed mb-5">
                A round is one contract, and it is its own donation rail. A donor sends tokens straight through to a recipient &mdash; any address at all, because there is no recipient list to be on; the set of recipients is simply whoever received a donation. The round never holds a donation on anyone&apos;s behalf. What it does hold is the match: a pool funded separately, in a different currency from the one donors give, that splits across those same recipients by a rule rewarding <em>breadth</em> of support. Many small independent donations outweigh one large cheque, and a recipient who received a single donation is matched nothing at all. A donation floor makes each one real capital rather than a free vote, donating to yourself is refused outright, and no recipient can take more than fifteen percent of the whole match. The crowd&apos;s consensus, not its wallets, is what the pool pays.
            </p>
            <p className="text-base text-ink-body leading-relaxed mb-5">
                No committee settles it, no one applies, and nobody has to be trusted to work out the answer. Every donation updates the recipient&apos;s weight and the round&apos;s running total in the same transaction that moves the money, so by the time the window closes the split is already there: anyone can close the round, and a claim is one division against numbers the chain has been keeping all along. Nothing is submitted for approval, nothing is staked against a challenge, and no referee is ever needed &mdash; there is no claim about what happened to argue over, because the round counted it as it happened. There is no panel to lobby and no ballot to win.
            </p>
            <p className="text-base text-ink-body leading-relaxed">
                It is left open on purpose. At genesis there is no membership list to gate a round on, and drawing one would be exactly the gatekeeping the protocol exists to remove &mdash; so anyone can be a recipient and the crowd does the steering. That is the division of labor: the author reward is <em>retroactive</em>, paying for adoption already recorded; a match round is <em>prospective and open</em>, funding work going forward with a donating crowd choosing who. Both count what happens as it happens, both settle in the open, and neither has a committee or a vote.
            </p>

            <h2 className="text-base font-semibold text-ink-heading mt-16 mb-4">
                More for builders
            </h2>
            <ul className="space-y-3 text-base">
                <li>
                    <Link href="/rounds" className="text-ink-heading font-medium hover:underline">
                        Rounds
                    </Link>
                    <span className="text-ink-body"> &mdash; the live surface: a round, once open, lives at /rounds?pool=&lt;address&gt; &mdash; donate, watch the weights move, close the round when the window ends, claim.</span>
                </li>
                <li>
                    <Link href="/clause-rewards" className="text-ink-heading font-medium hover:underline">
                        Clause rewards
                    </Link>
                    <span className="text-ink-body"> &mdash; the other half: the retroactive reward that pays clause and assembly authors for adoption already on the record.</span>
                </li>
                <li>
                    <Link href="/cryptoeconomics" className="text-ink-heading font-medium hover:underline">
                        Cryptoeconomics
                    </Link>
                    <span className="text-ink-body"> &mdash; how the incentives fit together: the bonding equilibrium, the token, and the reward mechanisms around them.</span>
                </li>
                <li>
                    <Link href="/papers/florin-schelling-point-token" className="text-ink-heading font-medium hover:underline">
                        The florin as a focal point
                    </Link>
                    <span className="text-ink-body"> &mdash; why the florin is a Schelling point no one prices: money that works because people ask for it by name, not because an issuer backs it.</span>
                </li>
            </ul>
        </section>
    );
}
