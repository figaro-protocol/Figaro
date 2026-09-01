import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import Link from "next/link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingSection } from "@/components/marketing/MarketingSection";

// The third page of the (rewards) group, and the third of three concepts the
// docs hold apart: Rewards for designers owns THE PROGRAM (how usage becomes a
// reward), Tokenomics owns THE TOKEN (supply, who holds what), and this page
// owns THE BOOTSTRAP (what the treasury is for, how it earns, how it ends). Do
// NOT re-derive the meter here — the formula, the floor and the live-stake
// condition belong to the program page, pointed at once. Source of truth:
// docs/DAO.md.
//
// What holds the treasury — the operator account, its delegation, the caveat
// enforcers, the addresses — stays OUT of this page by the maintainer's
// decision and lives in docs/DAO.md, where a builder or an auditor reads it.
export const metadata: Metadata = withOg({
    title: "The DAO — Figaro Protocol",
    description:
        "Three hundred million florins, granted once and spent by human judgment: what the treasury is for, the three ways it can spend, how it earns its living on the same meter as everyone else, and why it is allowed to run out.",
});

export default function Dao() {
    return (
        <>
            <MarketingHero
                title="Someone has to pay for what the network cannot pay for yet."
                lead={
                    <>
                        The DAO holds three hundred million florins &mdash; three tenths of every florin there will ever be &mdash; granted once at genesis and spent by human judgment. It exists to bootstrap: to pay for the work a young network needs before enough trade runs through it to pay for that work itself. It is the deliberate opposite of the reward meter beside it, which judges nothing and pays purely by use. And it is bounded twice over: it governs its own treasury and reaches nothing else, and when the treasury is spent it ends.
                    </>
                }
            />

            <MarketingSection title="A grant, not an income.">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    The three hundred million is the treasury&apos;s from genesis &mdash; whole, no vesting, no unlock &mdash; and it is never minted again. It is not a share of anything and not a stream; what does flow to the treasury is earned, not allocated &mdash; the designer rewards its two mandatory clauses draw, below. Once spent, it is spent.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    There are three ways to spend it, and nothing gates which. It can stand up a public-goods programme &mdash; a grant, a bounty, a commons initiative &mdash; by ordinary transfer, decided and paid without a crowd, a round, or a matching formula anywhere in the loop. It can pay a third party for work done: design, an audit, anything an organisation buys, an ordinary transfer on trust like any invoice. Or it can buy through the protocol as an ordinary bonded buyer &mdash; the treasury funds an operator wallet that signs, since the kernel accepts only a key&apos;s own signature &mdash; when the payment should be secured by the mechanism rather than trusted. All three are acts of judgment, case by case; the meter that pays by measured activity lives at the designer-rewards tier, never here.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    That discretion is the entire point of having a human layer. The reserve that pays <Link href="/rpgf" className="text-ink-heading font-medium hover:underline">designers</Link> refuses on principle to judge which contributions matter more than their use; a young network still needs someone willing to make exactly that judgment, and to be answerable for it.
                </p>
            </MarketingSection>

            <MarketingSection title="It governs its treasury, and nothing else.">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    A vote here decides what the treasury pays for. It decides nothing about anyone&apos;s trade. The kernel has no governance and never will &mdash; no admin, no owner, no pause, and no ballot that reaches a bonded commitment. Nothing moves one but its buyer.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    The two are worth keeping apart because they are so often the same thing elsewhere. A body that governs a protocol can change the terms under you; a body that governs a wallet can only decide what that wallet buys. This one is the second kind, and no amount of agreement inside it converts into the first.
                </p>
            </MarketingSection>

            <MarketingSection title="What it lives on afterwards, it earns.">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Two clauses ride on every order: commerce terms, which fix who pays whom and in what unit, and topology, which fixes who follows whom in the chain. The treasury is the registered designer of both, so their use accrues to it on exactly the meter everyone else is paid by &mdash; the commons drawing its living from the one thing every trade unavoidably uses.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Nothing about that is privileged. The protocol takes nothing from a trade, no weight tilts the meter, and &ldquo;mandatory&rdquo; describes a convention about what a runtime composes, not anything the chain enforces. The treasury&apos;s share is diluted by every other designer&apos;s work exactly as anyone&apos;s is &mdash; which makes the income countercyclical without a parameter to set. Where others are designing well, the treasury&apos;s share shrinks and the commons needs it least; where little else has emerged, its share is large and the commons needs it most. Nobody sizes that, and there is nobody to lobby about it.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    One clause is excluded by name from earning anything: assembly provenance, the leaf that says which assembly a process ran and so credits its designer. It is the reward system&apos;s own attribution plumbing, and paying it would be the meter charging for reading itself. It meters; it never earns.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    The alignment is in where the income comes from, not in a rule about how it goes out. The treasury is paid only when the network is used, so its interest is simply that the network is used. And the arrangement is not exclusive: anyone may out-design it on the same open registries, under their own wallet, on the same terms. A stranger who would rather donate a clause than keep it can register it under the treasury instead &mdash; that is what donating means here, and it is as permissionless and as permanent as any other registration.
                </p>
            </MarketingSection>

            <MarketingSection title="It is allowed to run out." bottomPad="wide">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    The DAO&apos;s life is its treasury. When that runs dry, governance passes to whoever still wants the thing: donations sustain it if the community cares to sustain it, and otherwise it ends. There is no self-perpetuation right anywhere in the design &mdash; no switch to flip, no levy it can raise, no lever a vote can reach into the protocol, and no seat it can grant itself.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    That is the honest shape of a bootstrap. The reserve that pays designers ends after nine years by the same logic, and neither ending is a failure: both exist to carry the commons through the years when it cannot yet carry itself. Anything that continues past them continues on its own legs &mdash; including a successor programme, which anyone may stand up and fund however they choose. The protocol is open, and nothing here holds a franchise on paying for the work built above it.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    Where the three hundred million sits among the rest of the supply is on <Link href="/tokenomics" className="text-ink-heading font-medium hover:underline">Tokenomics</Link>; the meter it earns on, and the two conditions any wallet must hold to be paid by it, are on <Link href="/rpgf" className="text-ink-heading font-medium hover:underline">Rewards for designers</Link>.
                </p>
            </MarketingSection>
        </>
    );
}
