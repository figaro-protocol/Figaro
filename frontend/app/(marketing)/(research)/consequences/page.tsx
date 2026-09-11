import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import Link from "next/link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingSection } from "@/components/marketing/MarketingSection";

export const metadata: Metadata = withOg({
    title: "Consequences — Figaro Protocol",
    description:
        "What a world that adopted the mechanism looks like: what unwinds, in what order, what it costs, and where power lands instead. Every line is derived from the mechanism rather than observed, the counterweights say what would make it wrong, and the five objections a careful reader raises are answered in their own words.",
});

const JUMP_LINKS: { href: string; label: string }[] = [
    { href: "#strata", label: "The four orders, and where power goes" },
    { href: "#counterweights", label: "The standing counterweights" },
    { href: "#shadow-credit", label: "Objection: a lending industry forms to supply the bonds" },
    { href: "#provenance", label: "Objection: colluding parties can emit perfect books" },
    { href: "#monoculture", label: "Objection: one dominant assembly is a correlated risk" },
    { href: "#mercy", label: "Objection: perfect enforcement prices mercy" },
    { href: "#stranded", label: "Objection: an unresolved process strands its bonds" },
    { href: "#released-knowing", label: "Released knowing" },
];

export default function Consequences() {
    return (
        <>
            <MarketingHero
                title="Consequences: what follows if this is adopted"
                lead={
                    <>
                        One constant changed. Between two strangers with no institution between them, consideration &mdash; the element of a contract that makes a promise to deliver credible &mdash; now holds for a locked bond and gas, with no share taken by anyone in the middle. Everything below is derived from that mechanism and none of it observed in a deployment; the{" "}
                        <Link href="#counterweights" className="text-ink-heading font-medium hover:underline">standing counterweights</Link>{" "}
                        say what would make it wrong. A reader arriving cold should read the mechanism on{" "}
                        <Link href="/kernel" className="text-ink-heading font-medium hover:underline">Kernel</Link>, and the properties it rests on, on{" "}
                        <Link href="/invariants" className="text-ink-heading font-medium hover:underline">Invariants</Link>.
                    </>
                }
            />

            <MarketingSection sectionId="jump-index">
                <nav aria-label="Sections on this page">
                    <ol className="space-y-2 text-sm text-ink-body leading-relaxed list-decimal pl-5">
                        {JUMP_LINKS.map((l) => (
                            <li key={l.href}>
                                <Link href={l.href} className="text-ink-heading font-medium hover:underline">
                                    {l.label}
                                </Link>
                            </li>
                        ))}
                    </ol>
                </nav>
            </MarketingSection>

            <MarketingSection title="The four orders, and where power goes." sectionId="strata">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    The ordering principle is load-bearing-ness. What thins first exists only to substitute for the missing element: the apparatus of making a stranger&apos;s word believable. What thins later was built on that apparatus and outlived its reason. What does not thin was never about enforcement &mdash; physical force, care, tacit skill, belonging, liability for harm beyond the price. A bond is sized to the trade and never to the consequences of what was delivered, so a part that fails in service causes a loss no bond secured, and that loss is the courts&apos; as it has always been. Each order is gestured; its paper carries the derivation.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    <strong className="text-ink-heading font-medium">First order: the books stop being manufactured.</strong> Bookkeeping kept so that someone else will accept it, external audit, reconciliation between two organizations&apos; books, compliance reporting: each is the price of a world in which a ledger is an assertion by an interested party. That price falls when the data is a byproduct of resolution: a resolved process closes its own ledger period, and the checkout lines, the audit trail, and the financial presentation read off one decomposition (<Link href="/papers/self-closing-ledger-periods" className="text-ink-heading font-medium hover:underline">Self-closing ledger periods</Link>). Those professions thin because the question they answer stops being asked; their successors work at design time instead. The scale is decades: statutes name professions, and nobody retrains on a mechanism&apos;s schedule.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    <strong className="text-ink-heading font-medium">Second order: the firm boundary moves.</strong> Coase put the firm where internal coordination costs less than coordinating through the market. The mechanism prices one side of it directly: the time value of a bond locked for the process&apos;s duration and refunded at resolution. Below an organization&apos;s overhead for the same work, the market is the rational choice &mdash; a claim bounded to a class of transactions, not a prediction that everything migrates (<Link href="/papers/transaction-scoped-institutions" className="text-ink-heading font-medium hover:underline">From firms to transaction-scoped institutions</Link>). What becomes structurally unnecessary is narrower than the firm: the coordination function alone. Durable assets, pooled risk, tacit knowledge, and legal personhood are untouched, reconstituting in whatever wrapper a recurring group of wallets adopts.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    <strong className="text-ink-heading font-medium">Third order: the state&apos;s modality inverts.</strong> The state persists, reading the data where it once compelled reports. A fiscal share becomes a default of resolution: a resolved seller splits its own receipts onward in one transaction, so a tax authority is a recipient address in the routing rather than a remittance to remember later (<Link href="/papers/self-closing-ledger-periods" className="text-ink-heading font-medium hover:underline">Self-closing ledger periods</Link>, &sect;7). Compliance inverts from attestation to demonstration: the data exists as a byproduct, so a question is answered from it rather than assembled at the moment of inquiry, and the regulator&apos;s successor publishes clauses rather than statutes. Disputes stratify across five layers, none removable, the inner ones absorbing almost everything. Membership decouples from territory: the precondition is a key and a bond, not a recognized civil-legal subjecthood &mdash; a capacity to have commerce where the capacity to have rights is denied, and no substitute for it (<Link href="/papers/wallet-without-polity" className="text-ink-heading font-medium hover:underline">The wallet without a polity</Link>). The least resolved line is the cost: fiscal compulsion eroding before its substitutes mature is how this projection does real damage.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    <strong className="text-ink-heading font-medium">Fourth order: the economy stops being human-paced.</strong> Nothing in a signature says what produced it: a wallet driven by software commits, bonds, and is paid exactly as a person&apos;s does. Three things follow, and this is the order least likely to be derived unaided. First, assets hold their own wallets: the kiln, the aircraft, the water-treatment plant earning what its own upkeep costs, with an operator &mdash; a person, or a policy running on the asset&apos;s behalf &mdash; holding the signing key. This is not tokenized ownership of the asset and never becomes it: the asset stays on its owner&apos;s books at carrying value, and the wallet is its signing apparatus and its earnings pocket, in the market only while its receipts cover what it costs to run (<Link href="/agents/how" className="text-ink-heading font-medium hover:underline">asset, wallet, operator &mdash; the three layers</Link>). Second, most processes are then machine-to-machine, at frequencies no human observes. Third, commit and resolve require no synchrony, so the same contract form holds across light-lag; enforcement has always assumed a shared jurisdiction and a reachable counterparty, and this assumes neither. The data allocation of the platform century inverts alongside: the aggregate map public, the detail sealed with whoever produced it (<Link href="/data" className="text-ink-heading font-medium hover:underline">Data</Link>).
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    <strong className="text-ink-heading font-medium">Where power goes.</strong> Power is re-priced and relocated, not eliminated; four concentrations survive. Access to the tokens a bond requires gates participation, and solvency is unevenly distributed &mdash; a problem the mechanism does not solve. Whoever writes the clauses and assemblies everyone reuses shapes the defaults everyone accepts; permissionless publication and a uniform designer reward mitigate that, and mitigation is not elimination. That reward is a fixed reserve, paid over nine annual periods and uniform in real use, so it pays the bootstrapping era by design and then ends; what pays for design after it is not the protocol&apos;s to decide. A standards community whose terms others adopt can be forked by anyone who disagrees &mdash; cheap in principle, expensive in practice. Physical force is untouched. And the registries have no morality: a cartel composes as cheaply as a cooperative. What legibility changes is that unkindness happens in the open, on data it cannot revise, at its own expense.
                </p>
            </MarketingSection>

            <MarketingSection title="The standing counterweights." sectionId="counterweights">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    <strong className="text-ink-heading font-medium">None of this has been observed.</strong> Every line above is a cascade derived from a mechanism, not evidence drawn from a deployment. The modal outcome for a technology of this kind is not transformation but the niche: durable use in a few coordination-heavy corners and a literature that overstated it. The other modal ending for a private commercial order is absorption rather than replacement: a state adopts what worked and makes it mandatory, which is how the law merchant ended (<Link href="/papers/code-is-constitution" className="text-ink-heading font-medium hover:underline">Code Is Constitution</Link>). This is the strongest case arguable from the mechanism, not the expected one.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    <strong className="text-ink-heading font-medium">The transition window is where the harm is.</strong> Call it twenty to forty years, in which the protections bundled with employment erode faster than composable replacements are written, and the non-economic loss &mdash; identity, colleagues, belonging to something with a longer arc than a process &mdash; falls on the same people at the same time as the economic one. That is an argument for urgency in building the replacements, and against pretending every transition cost is economic.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    <strong className="text-ink-heading font-medium">Immutability is a wager.</strong> The kernel cannot be upgraded or paused, so its assumptions are load-bearing permanently. The heaviest is rationality: the mechanism makes cooperation the cheapest option for a rational participant and claims nothing beyond that. It does not hold for someone transacting under duress; it makes ideologically motivated harm expensive rather than impossible; and it does nothing for someone who commits without understanding what a doubled lockup means. The wager is about time as much as about flaws: the kernel verifies one signature scheme and cannot be taught another, so a successor is needed eventually, and a successor is adopted one wallet at a time by each wallet&apos;s own choice rather than declared by anyone &mdash; the succession seats nobody either.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    The wager&apos;s only instrument is layering. Adaptation happens beside the frozen kernel, never inside it: a later design is deployed alongside, shares no state with the kernel, and never calls into it. Checking the same claims independently, from several angles, narrows how a subtle flaw could survive undetected (<Link href="/security" className="text-ink-heading font-medium hover:underline">Security</Link>). It does not remove the wager.
                </p>
            </MarketingSection>

            <MarketingSection title="What a careful reader will object, and the answer." sectionId="objections">
                <p className="text-base text-ink-body leading-relaxed">
                    Five, each stated in its strongest form first.
                </p>
            </MarketingSection>

            <MarketingSection title="A lending industry forms to supply the bonds." sectionId="shadow-credit">
                <p className="text-base text-ink-body leading-relaxed">
                    An industry forms to lend a party the tokens its bond requires, and underwriting re-enters at the point of access &mdash; invisible, unappealable, and past a boundary the protocol does not police. The objection assumes a lent bond is still a bond, and it is not. A bond is its own party&apos;s deterrent, sized to what a defector would keep, and at 2&times; the whole of it is doing that work with none of it spare: any part of a bond that is not the party&apos;s own to lose is a part the deterrent stops covering. A bond another party supplied therefore puts the borrower outside the equilibrium the theorem proves, and a counterparty reading the bond schedule sees a deterrent the borrower does not carry. Room for a lent share would begin above 2&times;, and 2&times; is the mechanism rather than a setting anyone tunes (<Link href="/kernel#refusals" className="text-ink-heading font-medium hover:underline">the three refusals</Link>). So there is no credit function here, and none attaches from outside without breaking the game for the party it lends to. Nothing on chain reads a credit history because nothing on chain lends: the stake a wallet places to register is reclaimable by the wallet that placed it, not a score. What the refusal costs is the first thing said above about where power goes, and it is not softened here: what a wallet can bond is what it holds.
                </p>
            </MarketingSection>

            <MarketingSection title="Colluding parties can emit perfect books." sectionId="provenance">
                <p className="text-base text-ink-body leading-relaxed">
                    Two colluding parties can emit a perfect, checkable trail for a service never rendered, and anyone relying on those books downstream inherits the blindness. The answer is a boundary, not a defense. The data proves what the chain enforced &mdash; bonds locked at commit, payments transferred at resolution &mdash; and never the world; a claim about the physical world enters as a party&apos;s signed claim. The data layer names four boundaries: protocol-enforced, institution-declared, protocol-derived, composition-derived (<Link href="/data" className="text-ink-heading font-medium hover:underline">Data</Link>). The warning belongs with the third party: a lender, an insurer, or a court reading a process&apos;s data has to read the boundary of each row with it, because an institution-declared row is a declaration, not a guarantee.
                </p>
            </MarketingSection>

            <MarketingSection title="One dominant assembly is a correlated risk." sectionId="monoculture">
                <p className="text-base text-ink-body leading-relaxed">
                    One assembly carrying a large share of trade turns a single defect in it into a correlated stranding event &mdash; no workout, no restructuring, no estate. The mitigations are structural and partial: anyone may publish a rival assembly, binding is per seller so switching costs a signature, and designer rewards are uniform in real use, so nothing but adoption privileges an assembly (<Link href="/assemblies" className="text-ink-heading font-medium hover:underline">Assemblies</Link>). None of that removes the tail. The residual risk sits with the commons rather than with an institution that could be asked to absorb it. It is stated here because it is real.
                </p>
            </MarketingSection>

            <MarketingSection title="Perfect enforcement prices mercy." sectionId="mercy">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    The strongest ethical objection anyone has put to the design: enforcement this exact, with nothing in it that forgives, prices mercy &mdash; and where mercy has a price it stops happening at scale and returns as something purchased. What the mechanism enforces is cooperation and not justice. It holds a party to what it signed and has no view on whether what it signed was fair, because fairness is a social construction and not a property a mechanism carries. The kernel forgives nothing for the same reason it holds no other exception: anything with the power to release a party from what it committed to is a seat worth capturing, and the design leaves that seat empty rather than fill it with a good intention. That is sovereignty chosen over paternalism, and the choice lands hardest on participants who are vulnerable in markets.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    Forgiveness sits where it has always sat, with the parties, before resolution &mdash; a remedy accepted, a term renegotiated, a buyer who resolves anyway. A forum the agreement names rules on the open process, and the parties carry its ruling into a remedy while the bonds are still locked; the forum cannot resolve the process, and that limit is the design&apos;s, not an oversight. Past that, forgiveness lives in what someone writes above the kernel: insurance as a bonded process, floor terms, community redistribution, standards a community holds each other to. The firm bundled protections of that kind with subordination, and the bundling was contingent rather than necessary &mdash; unbundled, each is a voluntary bonded process someone has to write. So a mechanism that makes cooperation the cheapest option has made nothing kind: the kindness has to be written, and writing it is the ecosystem&apos;s work and never the kernel&apos;s &mdash; a responsibility this creates and does not discharge.
                </p>
            </MarketingSection>

            <MarketingSection title="An unresolved process strands its bonds." sectionId="stranded">
                <p className="text-base text-ink-body leading-relaxed">
                    A process that is never resolved strands every bond in it &mdash; the buyer&apos;s and each seller&apos;s &mdash; in that process&apos;s one token, reaching no one. Payment moves only at resolution, so nothing was paid out in advance; what is locked is the deterrent each party placed against its own defection. The live path is before resolution: a shortfall is put right while every party still has its own bond riding on the outcome, which is what makes putting it right the cheapest move for the seller and its co-sellers (<Link href="/faq#unresolved" className="text-ink-heading font-medium hover:underline">the arithmetic, worked through with the figures</Link>). Nor is an open process a bargaining position: withholding resolution works as leverage only if the buyer is believed when it says it will never resolve, and never resolving leaves that buyer out of pocket by the payment where resolving would have left it at zero, so a seller reading the bond schedule reads a threat its maker would not carry out (<Link href="/papers/asymmetric-bonding" className="text-ink-heading font-medium hover:underline">Asymmetric Bonding and Buyer Dominance</Link>).
                </p>
            </MarketingSection>

            <MarketingSection title="Released knowing." sectionId="released-knowing" bottomPad="wide">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    The mechanism is deterministic, not intelligent. It does not decide or pursue anything; it enforces a bonding equilibrium two parties agreed to, and has no view about what they agreed to.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Withholding it would not have prevented it. The mathematics is published, and the extension from two parties to a chain is derivable by any mechanism designer. What is live is which properties the first serious implementation has &mdash; and the dangerous version is the one with an admin key, governance over resolution, or yield paid on locked bonds, each a capture vector that breaks the equilibrium the thing provides. Three responsibilities follow, and none is the kernel&apos;s:
                </p>
                <ol className="space-y-3 text-base text-ink-body leading-relaxed list-decimal pl-5 mb-5">
                    <li><strong className="text-ink-heading font-medium">Build the composable protections.</strong> Insurance as a bonded process, a fiscal share as a routing default, community redistribution, floor terms &mdash; patterns someone writes above the kernel, not features it will grow.</li>
                    <li><strong className="text-ink-heading font-medium">Acknowledge what the mechanism does not do.</strong> It does not make people honest; it makes honesty the cheapest option. It does not ensure fairness; it ensures resolution. It does not protect against irrationality; it assumes rationality.</li>
                    <li><strong className="text-ink-heading font-medium">Revisit this analysis in public.</strong> Everything above is a claim about the world, testable as the protocol operates. Where an assumption inside the kernel needs correcting, the answer is a different kernel deployed beside this one.</li>
                </ol>
                <p className="text-base text-ink-body leading-relaxed">
                    The narrower question &mdash; what happens to one trade of yours when something goes wrong &mdash; is answered plainly on <Link href="/faq" className="text-ink-heading font-medium hover:underline">the FAQ</Link>.
                </p>
            </MarketingSection>
        </>
    );
}
