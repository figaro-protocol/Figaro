import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import Link from "@/components/shared/Link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingSection } from "@/components/marketing/MarketingSection";
import { RegistryLifecycleFigure } from "@/components/figures/RegistryLifecycleFigure";
import { KERNEL_EQUILIBRIUM } from "@figaro-protocol/sdk";

// The chain example — the kernel page's trade shared by three sellers — has one
// owner, sdk/src/equilibrium.json; the guard fails a commit that retypes it.
const CH = KERNEL_EQUILIBRIUM.example.chain;

export const metadata: Metadata = withOg({
    title: "Builders' FAQ — Figaro Protocol",
    description:
        "Answers for the people who publish clauses and assemblies: registration and its stake, how the designer reward is computed and paid, forking, what a clause cannot do, and what composing a forum means.",
});

const QUESTIONS: { id: string; title: string }[] = [
    { id: "builders-registries", title: "Can someone hijack your registration or clause?" },
    { id: "cumulative-bond", title: "Why does a seller's bond grow along the chain?" },
    { id: "agents", title: "Can software run a wallet here?" },
    { id: "publish", title: "How do I publish a clause, and what does it cost?" },
    { id: "rewards-how", title: "How are designer rewards computed and paid, and when do they end?" },
    { id: "fork", title: "Can I fork an assembly?" },
    { id: "clause-limits", title: "What can a clause not do?" },
    { id: "forum", title: "What does composing a forum into an assembly mean?" },
];

export default function Faq() {
    return (
        <>
            <MarketingHero
                title="Builders' FAQ."
                lead={
                    <>
                        Answers for the people who publish on Figaro. Each names what the protocol does, what it refuses, and where the full treatment is.
                    </>
                }
            />

            <MarketingSection bottomPad="default">
                <nav aria-label="Jump to a question" data-testid="faq-jump-index">
                    <div>
                        <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-muted mb-3">
                            Questions
                        </h2>
                        <ul className="[&>li]:border-b [&>li]:border-default text-base">
                            {QUESTIONS.map((item) => (
                                <li key={item.id}>
                                    <Link href={`#${item.id}`} className="flex items-baseline justify-between gap-4 py-2.5 text-ink-heading hover:underline">
                                        <span>{item.title}</span>
                                        <span aria-hidden="true" className="text-ink-muted">&darr;</span>
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </div>
                </nav>
            </MarketingSection>

            <MarketingSection title="Can someone hijack your registration or clause?" sectionId="builders-registries">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Clause, seller, and assembly anchoring is permissionless and first-write-wins. Once an identifier is bound to a registry &mdash; a clauseId or an assembly&apos;s composition hash &mdash; the binding is immutable: nothing can rebind it, and no later registrant can displace it. On the direct attestation path the chain validates no content shape &mdash; it merkle-binds each attestation to its signed agreement and content-hash-binds the evidence. The batch path adds a content check: a generic SP1 proof engine re-validates each clause against the exact spec the <code>ClauseRegistry</code> anchors, so a permissive substitute cannot land. Either way there are no per-clause validator contracts &mdash; any registered clause is attestable and resolvable with zero on-chain code changes.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    All three registries &mdash; <code>ClauseRegistry</code>, <code>AssemblyRegistry</code>, and <code>MembersRegistry</code> &mdash; are anchored by the same anti-spam mechanism: a reclaimable stake &mdash; not the trade bond described above &mdash; staked intent, priced to deter spam, not a party&apos;s deterrent against its own defection. Nothing can seize it; withdrawing de-surfaces the registration and reclaims the stake &mdash; each family&apos;s own way, below (readers hide what carries no live stake), so polluting a registry costs the stake &times; the time it stayed surfaced. The amount is set per deployment &mdash; read it with <code>registrationDeposit()</code> on the registry you are registering against, never from a remembered constant.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    What a withdrawal leaves behind differs by family. A clause&apos;s or an assembly&apos;s binding is permanent &mdash; agreements already committed against it must keep resolving forever &mdash; so only the stake and the surfacing move, in a single call with no waiting &mdash; though the protocol surface refuses the call while processes composed from the work are still in flight; the smart contract cannot count that, so the SDK and this site are what enforce it. A participant registration is keyed to a wallet instead, and leaving clears it: a clause or an assembly is a permanent publication; a participant is a live identity.
                </p>
                <RegistryLifecycleFigure className="my-8" />
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    The participant case is why there is a cooldown. De-listing is immediate, but the ETH releases only after a delay fixed at deployment and published on-chain before anyone pays it &mdash; without the delay, a single stake could be walked through one identity after another, and a stake you can reclaim the instant you have used it prices nothing. Requesting again before claiming pools the pending amount and restarts the cooldown on all of it, and coming back costs a second stake; a released stake is claimable by its owner alone, with nobody&apos;s permission.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    For designers, the cost is permanence: a registered clauseId cannot be mutated. The remediation path for a flawed clause is to register a corrected one &mdash; a different clause, with its own id and its own hash. Nothing links the two: the flawed clause stays registered and keeps doing whatever it does, designers point their assemblies at the corrected one deliberately, and agreements already committed against the old one keep resolving. The discipline this asks of designers is the same as the discipline of publishing a kernel: ship the result you can defend, not the result you can patch.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    Adoption carries the other risk, and it is a tail rather than a flaw: one assembly carrying a large share of the trade makes a defect in it a correlated stranding across every process bound to it. Anyone may publish a rival assembly, a seller&apos;s binding switches for a signature, and designer rewards are uniform in real use &mdash; mitigations that narrow that tail without removing it.
                </p>
            </MarketingSection>

            <MarketingSection title="Why does a seller's bond grow along the chain?" sectionId="cumulative-bond">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Because a bond is measured against the value the trade has accumulated at the link it secures, not against the trade as a whole. Each seller bonds twice the cumulative value through its own order &mdash; everything committed before it, its own payment counted in &mdash; which is the rule Definition 1 of <Link href="/papers/asymmetric-bonding" className="text-ink-heading font-medium hover:underline">Asymmetric Bonding and Buyer Dominance</Link> states. The buyer bonds twice each payment, as that order joins.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    What the rule buys is an early link that is not bonded against work nobody has committed yet. Take the {CH.trade}-token trade the kernel page splits three ways, in the order the sellers commit: {CH.legs[0].payment} to the first, {CH.legs[1].payment} to the second, {CH.legs[2].payment} to the third. The running total at each link is {CH.cumulative[0]}, then {CH.cumulative[1]}, then {CH.cumulative[2]}, so the three bonds are {CH.seller_bonds[0]}, {CH.seller_bonds[1]} and {CH.seller_bonds[2]} &mdash; {CH.seller_bonds_total} locked by the sellers together. The buyer bonds twice each payment as each order joins: {CH.buyer_bonds[0]} + {CH.buyer_bonds[1]} + {CH.buyer_bonds[2]} = {CH.buyer_total}. Bond every seller against the whole trade instead and each of the three locks {CH.if_every_seller_bonded_the_whole_trade.each}, {CH.if_every_seller_bonded_the_whole_trade.total} in all, with the seller adding {CH.legs[0].payment} at the start standing behind two contributions that were not yet in the process when it signed.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    The weight lands at the other end instead. Whoever commits last carries everything already added and bonds against all of it, so the seller paid least locks the most. That is the design rather than an artefact of the ordering: the last link is the one with every earlier link&apos;s work behind it, and the bond says so. <Link href="/worked-example" className="text-ink-heading font-medium hover:underline">The numbers, worked</Link>
                </p>
            </MarketingSection>

            <MarketingSection title="Can software run a wallet here?" sectionId="agents">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Yes, and nothing about the mechanism changes because of it. FigaroCore checks a valid ECDSA signature from an externally-owned account, and the check has no field for what produced it &mdash; so a program that signs for itself is a party here on exactly the terms a person is. What that leaves to be named is what the wallet stands for and who is holding its key on that thing&apos;s behalf: three layers &mdash; asset, wallet, operator &mdash; set out on <Link href="/agents/how" className="text-ink-heading font-medium hover:underline">How agents work</Link>.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    The caveat is the one that applies to any wallet: the mechanism verifies a signature, not an identity. It cannot tell you whether the operator behind an address is what its profile claims, human or software &mdash; that assurance, where it exists, comes from the credentials a clause binds and checks against their issuing authority, not from the kernel. And the word carries two senses, only one of which exists here. The operator <em>of a wallet</em> is whoever holds that one wallet&apos;s signing key &mdash; a person or a program, one participant among equals, and that is the sense used here and on Agents. The operator <em>of a platform</em> is the company that runs the venue two strangers meet in and takes a cut for standing between them &mdash; the sense Figaro has none of, since there is no venue in the middle to run.
                </p>
            </MarketingSection>

            <MarketingSection title="How do I publish a clause, and what does it cost?" sectionId="publish">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Write the spec. Validate it off-chain on <Link href="/clauses/register" className="text-ink-heading font-medium hover:underline">Register a clause</Link>. Register it on the ClauseRegistry with the registration stake.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    The stake is read from the registry itself, with <code>registrationDeposit()</code>. It is yours to reclaim later. Reclaiming takes the clause off the surface; the registration itself is permanent.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    First write wins. A clause id, once bound, is bound forever. The traps that bite after registration are on <Link href="/pitfalls" className="text-ink-heading font-medium hover:underline">Sharp edges</Link>.
                </p>
            </MarketingSection>

            <MarketingSection title="How are designer rewards computed and paid, and when do they end?" sectionId="rewards-how">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    A fixed reserve of florins pays designers in proportion to real use, and nothing else. No category, no weight, no vote.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    A clause&apos;s or assembly&apos;s score in a period counts the processes that used it and the distinct staked sellers who carried it. The formula and its floor are on <Link href="/rpgf" className="text-ink-heading font-medium hover:underline">Designer Rewards</Link>.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    Accrual runs in annual periods, nine in all. A closed period pays once, pro rata, when you claim it on <Link href="/rewards" className="text-ink-heading font-medium hover:underline">Rewards</Link>. After the ninth period the reserve is spent and the reward ends.
                </p>
            </MarketingSection>

            <MarketingSection title="Can I fork an assembly?" sectionId="fork">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Yes. Any published assembly opens in the designer as a draft you can change.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    A fork is a new composition with its own hash. The original is untouched, and each earns on its own use.
                </p>
            </MarketingSection>

            <MarketingSection title="What can a clause not do?" sectionId="clause-limits">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    A clause is a term and the shape of its data. It is one leaf in the agreement both parties sign.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    It cannot move tokens, call a contract, or change a bond. No contract validates its content on the direct path. The SDK validates it against the spec before anyone signs, and the batch path re-checks it in the proof.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    Any registered clause is attestable and resolvable with no on-chain code of its own. That is by design, and permanent.
                </p>
            </MarketingSection>

            <MarketingSection title="What does composing a forum into an assembly mean?" sectionId="forum">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    A clause names the forum. The agreement both parties sign carries that name.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    The forum rules on the open process, using the data both sides hold. It cannot resolve the process and no ruling reaches the bonds. The parties carry its ruling into a remedy before the buyer resolves.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    Kleros is one forum. Any other composes the same way. The catalogue of what composes is on <Link href="/composition" className="text-ink-heading font-medium hover:underline">Composition</Link>.
                </p>
            </MarketingSection>
        </>
    );
}
