import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import Link from "next/link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingSection } from "@/components/marketing/MarketingSection";

// This page owns THE TOKEN — what exists, who holds it, why — beside Rewards
// for designers, which owns THE PROGRAM (how usage becomes a reward), and The
// DAO, which owns THE BOOTSTRAP (what the treasury is for, how it earns, how
// it ends). Three concepts, three pages, the same split the docs hold. Do NOT
// re-derive the reward rule here: the formula, the three-seller floor and the
// live-stake condition belong to the program page, pointed at
// once. Every figure traces to src/florin/FlorinToken.sol (cap, minter
// registry, renounce, market-stance natspec), script/DeployMainnet.s.sol (the
// 70/30/300/600M allocation and the nine period budgets 45·2 / 60·3 / 82.5·4)
// and the minter under `src/rpgf/`.
//
// The florin paragraph in "Four kinds of token" stays SEPARATE from the
// community- and designer-token paragraphs beside it — the same separation the
// home page keeps: the florin is a pure Schelling point, not
// one more community token, and merging them collapses that.
export const metadata: Metadata = withOg({
    title: "Tokenomics — Figaro Protocol",
    description:
        "The florin: one billion, minted once, closed by a one-way latch. Who holds what and on what terms — 70 million founders, 30 million supporters, 300 million the DAO treasury, 600 million reserved for the designers whose clauses and assemblies get used — and where the florin sits among the units a trade can be denominated in.",
});

export default function Tokenomics() {
    return (
        <>
            <MarketingHero
                title="One billion florins, and where every one of them sits."
                lead={
                    <>
                        The florin is the protocol&apos;s own token: a unit two strangers can converge on when they share no other. One billion is the cap, written into the token contract itself, and the ability to add a minter was given up in the same run that used it &mdash; nothing more will ever be created. Nine tenths point at the people who extend the network: 600 million reserved for whoever writes the clauses and composes the assemblies real trade reaches for, 300 million held by the DAO. The remaining tenth is held openly &mdash; 70 million founders, 30 million supporters &mdash; and stated here rather than left to be found. Nothing on this page is sold, priced, or promised: no florin earns yield, no florin is taken from anyone, and no florin votes on anyone&apos;s trade.
                    </>
                }
            />

            <MarketingSection title="The supply is closed by a one-way latch.">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    A florin can only come into existence through a registered minter, and every minter carries a cap of its own. Registration checks the sum of all caps against the billion before a single florin is minted, so the plan cannot be over-committed even in principle; each mint then checks the minter&apos;s own cap and the billion again.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Two minters are ever registered. The rewards contract, at exactly 600 million. And the deploying wallet, once, for the 400 million genesis distribution &mdash; after which renouncing is permanent: no further minter can be registered, and the deploying wallet can never mint again. Its own allowance is spent to the last florin in the same run. What remains is arithmetic anyone can redo from the chain: 400 million minted and closed, 600 million reachable only through the rewards contract&apos;s per-period claims, and no path to a billion-and-one.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    The residual worth stating: the cap and the latch are enforced by code, and there is no admin, no pause, and no upgrade anywhere in the florin&apos;s contracts &mdash; a wrong contract is replaced by a new one the community moves to, never patched in place. The market stance below is a different kind of thing: a commitment, enforced by nothing.
                </p>
            </MarketingSection>

            <MarketingSection title="Who holds what, on what terms.">
                <div className="overflow-x-auto mb-5">
                    <table className="w-full text-sm text-left">
                        <thead>
                            <tr className="border-b border-default text-ink-heading">
                                <th scope="col" className="py-2 pr-4 font-semibold">Held by</th>
                                <th scope="col" className="py-2 pr-4 font-semibold">Share</th>
                                <th scope="col" className="py-2 pr-4 font-semibold">Florins</th>
                                <th scope="col" className="py-2 font-semibold">Terms</th>
                            </tr>
                        </thead>
                        <tbody className="text-ink-body">
                            <tr className="border-b border-default">
                                <td className="py-2 pr-4">Founders</td>
                                <td className="py-2 pr-4">7%</td>
                                <td className="py-2 pr-4">70,000,000</td>
                                <td className="py-2">Genesis mint. No vesting, no lockup.</td>
                            </tr>
                            <tr className="border-b border-default">
                                <td className="py-2 pr-4">Supporters</td>
                                <td className="py-2 pr-4">3%</td>
                                <td className="py-2 pr-4">30,000,000</td>
                                <td className="py-2">Friends, family, early supporters &mdash; carved out of the founders&apos; share, not the DAO&apos;s. Genesis mint. No vesting, no lockup.</td>
                            </tr>
                            <tr className="border-b border-default">
                                <td className="py-2 pr-4">DAO</td>
                                <td className="py-2 pr-4">30%</td>
                                <td className="py-2 pr-4">300,000,000</td>
                                <td className="py-2">The treasury, spent by human judgment. Genesis mint, operational from the first block.</td>
                            </tr>
                            <tr>
                                <td className="py-2 pr-4">Clause and assembly designers</td>
                                <td className="py-2 pr-4">60%</td>
                                <td className="py-2 pr-4">600,000,000</td>
                                <td className="py-2">A reserve, not a holding: minted only against counted use of the work, over nine annual periods.</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Nothing here was sold. There was no sale, no round, and no offer of any kind &mdash; the genesis holdings simply sit in their wallets, which is also why there is no vesting to describe. A vesting cliff exists to protect investors from founders walking away, and there are no investors; adding one would be theater, and it would recruit holders whose reason for holding is a schedule rather than agreement with what is being built.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    In place of a schedule there is a standing position, written permanently into the token&apos;s own text: neither the DAO treasury nor the founder will ever sell, buy, or provide liquidity for the florin on any market. The first price is a stranger&apos;s to name.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    Two residuals, stated rather than dressed. That stance is a commitment enforced by nothing on chain &mdash; its whole force is that a breach would be permanently legible beside the words. And it covers the founders&apos; 70 million and the treasury&apos;s 300 million only: the supporters&apos; 30 million carries no such stance and is exposed as any holding is. What a florin is worth is a market question, answered by whoever trades one; this project makes no claim about it, and this page is not the place a claim about it will ever appear.
                </p>
            </MarketingSection>

            <MarketingSection title="The reserve grows as the network does.">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    The 600 million is not held by anyone waiting to be handed out. It is minted only when a designer claims a closed period&apos;s share against use the chain already holds &mdash; nine annual periods, each paying from its own budget, grouped into three rising steps:
                </p>
                <div className="overflow-x-auto mb-5">
                    <table className="w-full max-w-md text-sm text-left">
                        <thead>
                            <tr className="border-b border-default text-ink-heading">
                                <th scope="col" className="py-2 pr-4 font-semibold">Years</th>
                                <th scope="col" className="py-2 pr-4 font-semibold">Share of the reserve</th>
                                <th scope="col" className="py-2 font-semibold">Per year</th>
                            </tr>
                        </thead>
                        <tbody className="text-ink-body">
                            <tr className="border-b border-default"><td className="py-2 pr-4">1&ndash;2</td><td className="py-2 pr-4">15% &mdash; 90M</td><td className="py-2">45,000,000</td></tr>
                            <tr className="border-b border-default"><td className="py-2 pr-4">3&ndash;5</td><td className="py-2 pr-4">30% &mdash; 180M</td><td className="py-2">60,000,000</td></tr>
                            <tr><td className="py-2 pr-4">6&ndash;9</td><td className="py-2 pr-4">55% &mdash; 330M</td><td className="py-2">82,500,000</td></tr>
                        </tbody>
                    </table>
                </div>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    The shape is deliberate: the largest budgets pay on the most evidence, and the thinnest years &mdash; when there is least to measure &mdash; carry the smallest. Funding the network before there is evidence to measure is the treasury&apos;s job, not the meter&apos;s. How a share is worked out from a period&apos;s usage &mdash; the same rule for every clause and every assembly, no weights, no categories, no per-wallet cap, and nothing taken from anyone to fund it &mdash; is set out on <Link href="/rpgf" className="text-ink-heading hover:underline">Rewards for designers</Link>, which owns that mechanism; it is not restated here.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    Two limits belong beside the schedule. The pool is fixed, so a wallet manufacturing usage dilutes everyone&apos;s share and inflates nothing &mdash; it can never mint a florin that was not already reserved. And the budgets end: after the ninth period nothing renews them &mdash; by design.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    That end is the shape of a bootstrap, not the lifespan of the commons. The reserve exists to get the shared graphs built while they are still too thin to pay for themselves; by the late tranches, a designer&apos;s real income is the market their work carries &mdash; the assemblies adopted, the data sold, the trade resolved through their terms. What continues past year nine continues on its own legs: the DAO&apos;s treasury has no clock and spends by judgment for as long as it lasts, donations arrive whenever anyone cares to make one, and nothing stops anyone &mdash; the DAO included &mdash; from standing up a successor rewards program of their own design, funded however they choose. What the treasury is for, how it earns, and how it ends is <Link href="/dao" className="text-ink-heading font-medium hover:underline">The DAO</Link>. The protocol is open, and this program holds no franchise on rewarding the work built above it.
                </p>
            </MarketingSection>

            <MarketingSection title="Four kinds of token meet in one trade.">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    A trade is denominated in a single unit, fixed at the first signature and binding on every later link, so the parties have to agree on one. The ordinary answer is a unit recognised widely enough to make agreeing cheap &mdash; a stablecoin, or the network&apos;s own asset. Nothing about the mechanism prefers any of them: the arithmetic compares a stake against a value, and any standard token quotes both.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    A designer who publishes an <Link href="/glossary#assembly" className="text-ink-heading hover:underline">assembly</Link> may pin the unit every trade running it is denominated in &mdash; including a token of their own. Then demand for that token tracks their assembly&apos;s adoption: a moat they build, and whose risk they carry. A buyer who would rather not hold it picks an assembly denominated in something they already do; the exit is one click, which is what keeps the moat honest.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    A community&apos;s own token works on mutual recognition rather than on a reserve: it is worth something because its members treat it as worth something. Someone living far from that community can transact in it where they now are, and the demand accrues at home &mdash; with no remittance corridor, no correspondent bank, and no fiat pipeline, because the conversion into the trade&apos;s unit is an ordinary swap the participant performs for their own account before anything is bonded. What a regulator asks about is on the chain rather than asserted; how any particular jurisdiction then treats it is that jurisdiction&apos;s question, and not one the protocol answers.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    The fourth thing is not a token at all. Which unit a party was willing to accept is public, so a seller who took a community&apos;s token where a stablecoin was on the table has done something legible &mdash; support you can check against the chain, not a claim in a brochure.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    The florin is the first kind and only the first kind: the pure case of a unit chosen because everyone expects everyone else to accept it. It is not a community&apos;s token and not a designer&apos;s moat. It carries no issuer, no redemption claim, no yield, and no path by which anyone is charged for it, and it is never required and never favoured &mdash; no operation of the protocol denominates in it, and nothing anywhere is cheaper, faster, or better secured for choosing it. Strip all of that away and one use is left, which is the one it was built for: two strangers who share no other unit can still agree on this one, and choosing it says so out loud.
                </p>
            </MarketingSection>

            <MarketingSection title="Nobody pays for any of this." bottomPad="wide">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Nothing is taken anywhere in the kernel &mdash; no skim on a payment, no charge for a registration, nothing minted when a trade resolves. The reserve is not paid for by a levy on trade; it was set aside at genesis, and no volume of trade adds a florin to it or brings one forward.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    What designing and selling do require is a live stake: ETH held against your registration, on the designer&apos;s side and the seller&apos;s side both, and use counts only while both stay live. The stake is returnable &mdash; withdraw it and your entry stops being surfaced and stops scoring at once, and the stake itself follows: a designer&apos;s right away, a seller&apos;s after a 28-day cooldown, so a fresh seller identity always costs a month of parked stake before the last one&apos;s returns. That is the whole loop, and it runs the right way round: what you carry is exposure to the growth your own work produces, never a rent taken out of someone else&apos;s trade.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    The earn path starts with one <Link href="/clauses" className="text-ink-heading font-medium hover:underline">clause</Link> &mdash; what one is, what its hash covers, and how to register it.
                </p>
            </MarketingSection>
        </>
    );
}
