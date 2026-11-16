import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import Link from "@/components/shared/Link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingSection } from "@/components/marketing/MarketingSection";

// The third page of the (rewards) group, and the third of three concepts the
// docs hold apart: Designer Rewards owns THE PROGRAM (how usage becomes a
// reward), Tokenomics owns THE TOKEN (supply, who holds what), and this page
// owns THE BOOTSTRAP (what the treasury is for, how it earns, how it ends). Do
// NOT re-derive the counter here — the formula, the floor and the live-stake
// condition belong to the program page, pointed at once. Source of truth:
// docs/DAO.md.
//
// What holds the treasury — the operator account, its delegation, the caveat
// enforcers, the addresses — stays OUT of this page by the maintainer's
// decision and lives in docs/DAO.md, where a builder or an auditor reads it.
export const metadata: Metadata = withOg({
    title: "The DAO — Figaro",
    description:
        "Three hundred million florins, granted once and spent by human judgment: what the treasury is for, the three ways it can spend, how it can earn on the same counter as everyone else, and why it is allowed to run out.",
});

export default function Dao() {
    return (
        <>
            <MarketingHero
                title="Someone has to pay for what the network cannot pay for yet."
                lead={
                    <>
                        The DAO holds three hundred million florins &mdash; three tenths of every florin there will ever be &mdash; granted once at genesis and spent by human judgment. It exists to bootstrap: to pay for the work a young network needs before enough trade runs through it to pay for that work itself. It is the deliberate opposite of the reward counter beside it, which judges nothing and rewards purely by use. And it is bounded twice over: it governs its own treasury and reaches nothing else, and when the treasury is spent it ends &mdash; unless a job remains and donations sustain it.
                    </>
                }
            />

            <MarketingSection title="A grant, not an income.">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    The three hundred million is the treasury&apos;s from genesis &mdash; whole, no vesting, no unlock &mdash; and it is never minted again. It is not a share of anything and not a stream; whatever it earns afterwards is earned the way any designer&apos;s reward is, below. Once spent, it is spent.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    There are three ways to spend it, and nothing gates which. It can stand up a public-goods program &mdash; a grant, a bounty, a commons initiative &mdash; by ordinary transfer, decided and paid without a crowd, a round, or a matching formula anywhere in the loop. It can pay a third party for work done: design, an audit, anything an organization buys, an ordinary transfer on trust like any invoice. Or it can buy through the protocol as an ordinary bonded buyer &mdash; the treasury supplies an operator wallet that signs, since the Core accepts only a key&apos;s own signature &mdash; when the payment should be secured by the mechanism rather than trusted. All three are acts of judgment, case by case; the counter that rewards by measured activity lives at the designer-rewards tier, never here.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    That discretion is the entire point of having a human layer. The reserve that rewards <Link href="/rpgf" className="text-ink-heading font-medium hover:underline">designers</Link> refuses on principle to judge which contributions matter more than their use; a young network still needs someone willing to make exactly that judgment, and to be answerable for it.
                </p>
            </MarketingSection>

            <MarketingSection title="It governs its treasury, and nothing else.">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    A vote here decides what the treasury pays for, and the voters are the treasury&apos;s own signers &mdash; the wallet is a multisig, and its signer set changes only by the signers&apos; own act. A florin carries no vote. The vote decides nothing about anyone&apos;s trade. The Core has no governance and never will &mdash; no ballot that reaches a bonded commitment. Nothing moves one but its buyer.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    The two are worth keeping apart because they are so often the same thing elsewhere. A body that governs a protocol can change the terms under you; a body that governs a wallet can only decide what that wallet buys. This one is the second kind, and no amount of agreement inside it converts into the first.
                </p>
            </MarketingSection>

            <MarketingSection title="What it earns afterwards, it earns as any designer does.">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    The registration plan of each network names the treasury as the designer of record of <code>figaro-commerce</code>, the clause that commits an order&apos;s line items; it is the designer of record of every clause it registers. Their use is counted on exactly the counter every other designer&apos;s is, on the orders whose agreements a designer composed with them; no clause rides on every order. Whether a count becomes a reward depends on the same conditions for every designer of record.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Nothing about that is privileged. A trade&apos;s payment moves whole from the buyer to the seller, and the reward comes from the reserve set aside at genesis; no weight tilts the counter. The treasury&apos;s clauses are scored beside every other designer&apos;s, and the format fixes no designer&apos;s share. No parameter sizes that share, and there is nobody to lobby about it.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    The provenance leaf, which says which registered agreement and which assembly a process ran and so credits both their designers, earns nothing. It is a reserved leaf of the agreement format, written at checkout: not a clause and not a registration, so there is no designer for it to reward. It counts; it never earns.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    The alignment is in where any income comes from, not in a rule about how it goes out. The treasury can be rewarded only when its clauses are used, so its interest is simply that the network is used. And the arrangement is not exclusive: anyone may out-design it on the same open registries, under their own wallet, on the same terms.
                </p>
            </MarketingSection>

            <MarketingSection title="It is allowed to run out." bottomPad="wide">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    The DAO&apos;s life is its treasury: the 300 million granted once at genesis, prolonged by whatever its clauses earn on the same counter as every other designer. Both end &mdash; the grant is spent and the counter closes after the ninth period &mdash; and when the florins run out, the DAO ends with them, unless a job remains and donations sustain it, the way any not-for-profit is sustained.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    That is the honest shape of a bootstrap. The reserve that rewards designers ends after nine years by the same logic, and neither ending is a failure: both exist to carry the commons through the years when it cannot yet carry itself. Anything that continues past them continues on its own legs &mdash; including a successor program, which anyone may stand up and fund however they choose. The protocol is open, and nothing here holds a franchise on paying for the work built above it.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    Where the three hundred million sits among the rest of the supply is on <Link href="/tokenomics" className="text-ink-heading font-medium hover:underline">Tokenomics</Link>; the counter it earns on, and the two conditions any wallet must hold to be rewarded by it, are on <Link href="/rpgf" className="text-ink-heading font-medium hover:underline">Designer Rewards</Link>.
                </p>
            </MarketingSection>
        </>
    );
}
