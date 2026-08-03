import type { Metadata } from "next";
import Link from "next/link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingSection } from "@/components/marketing/MarketingSection";

export const metadata: Metadata = {
    title: "Consequences — Figaro Protocol",
    description:
        "The project's own pre-release ethical analysis: what the mechanism assumes, the risks that survive scrutiny, one analyst's scenario weights, what the protocol cannot control, and why the release decision holds anyway.",
};

const JUMP_LINKS: { href: string; label: string }[] = [
    { href: "#dilemma", label: "The dilemma" },
    { href: "#assumptions", label: "What the mechanism assumes" },
    { href: "#risk-immutability", label: "Risk — immutability is a wager" },
    { href: "#risk-justice", label: "Risk — cooperation, not justice" },
    { href: "#scenarios", label: "The scenario space" },
    { href: "#transition", label: "The transition risk" },
    { href: "#cannot-control", label: "What the protocol cannot control" },
    { href: "#why-yes", label: "Why the answer is yes" },
    { href: "#responsibility", label: "The responsibility that remains" },
];

export default function Consequences() {
    return (
        <>
            <MarketingHero
                title="Consequences."
                lead={
                    <>
                        This page is the project&apos;s own pre-release ethical analysis, written before any decision to put the kernel on a public network, and reaffirmed since. It is not written to reassure. If the mechanism works as designed, its long-run effect is to make a specific organizational form &mdash; the coordination firm &mdash; structurally unnecessary across the sectors where it applies. That is a large claim, and this page states what was considered before standing behind it, including the parts that do not resolve cleanly.
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

            <MarketingSection title="The dilemma." sectionId="dilemma">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    FigaroCore is an immutable, ownerless coordination primitive. Once deployed to a public network it cannot be patched, paused, governed, or recalled. The question this page answers is not &ldquo;does the code have bugs&rdquo; &mdash; that is a verification question, treated on <Link href="/security" className="text-ink-heading font-medium hover:underline">Security</Link>. The question here is: is it responsible to release infrastructure that, if it works, reorganizes economic life at a scale no one who releases it can later walk back?
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    What it does, mechanically: two strangers lock collateral &mdash; the buyer twice the payment, the seller twice the cumulative value flowing through them. Cooperation weakly dominates defection for both, from the arithmetic alone. The buyer resolves; bonds return; payment flows. No owner, no fee, no admin, no escape hatch. The derivation is on <Link href="/protocol" className="text-ink-heading font-medium hover:underline">Protocol</Link>; the formal proofs are in the <Link href="/papers" className="text-ink-heading font-medium hover:underline">papers</Link>. This page assumes both and asks what follows from them.
                </p>
            </MarketingSection>

            <MarketingSection title="What the mechanism assumes." sectionId="assumptions">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    These are hardcoded into the kernel. They cannot be changed after deployment without deploying a different kernel.
                </p>
                <ul className="space-y-5 text-base text-ink-body mb-5 ml-6">
                    <li>
                        <strong className="text-ink-heading font-medium">Rationality.</strong> The mechanism assumes participants respond to economic incentives &mdash; defection costs more than cooperation, so a rational actor cooperates. This holds for the large majority of trades. It does not hold for a coerced actor (someone transacting under duress, where another party controls the wallet or the decision); an ideologically motivated actor (someone willing to accept economic loss to cause harm &mdash; the mechanism makes this expensive, not impossible); or an actor who does not understand the mechanism (someone who commits without understanding what a 2&times; lockup means). The mechanism does not claim to protect against irrationality. It claims to make cooperation the cheapest option for a rational participant. That boundary should be stated wherever the protocol is presented, not discovered later.
                    </li>
                    <li>
                        <strong className="text-ink-heading font-medium">Solvency.</strong> Participation requires capital to bond. The 2&times; requirement converts a behavioral problem (&ldquo;will they cooperate?&rdquo;) into a solvency problem (&ldquo;can they deposit?&rdquo;). This is not by itself an exclusion mechanism &mdash; on-chain lending contracts can route bond capital to any creditworthy participant, and skin in the game survives borrowing, because the borrower loses the collateral on defection regardless of where the capital came from. But it is real: a participant with no access to bondable capital, borrowed or owned, cannot bond, and the mechanism has nothing to say to them.
                    </li>
                    <li>
                        <strong className="text-ink-heading font-medium">Buyer dominance.</strong> Only the buyer can trigger resolution. This is a resolution assignment, not a power asymmetry in cost &mdash; a buyer who refuses to resolve loses their own bond, the same magnitude of loss the seller faces. Buyer dominance exists so that no seller, or subset of sellers, can unilaterally force a resolution, which is what makes a multi-party value-added chain coordinable at all.
                    </li>
                    <li>
                        <strong className="text-ink-heading font-medium">All-or-nothing resolution.</strong> Atomic resolution means every order in a process settles together or none of them does. This is what produces the joint-liability effect: every seller in the chain is accountable for every other seller in it. One bad actor can cause losses for every participant in the process &mdash; and that is the point. The coordination pressure to prevent that outcome is what makes the mechanism work without a manager.
                    </li>
                </ul>
            </MarketingSection>

            <MarketingSection title="Risk: immutability is a wager on these assumptions." sectionId="risk-immutability">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    The 2&times; ratio, buyer dominance, atomic resolution, and single-currency-per-process are hardcoded. If any of them is subtly wrong at a scale or in a context that decades of operation eventually reveal, the deployed kernel cannot be fixed in place.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    The assumptions are not heuristic &mdash; they are derived from the payoff matrix, and the 2&times; ratio is proven to be the minimum sufficient deterrent (the theorem catalogue is on <Link href="/papers/asymmetric-bonding" className="text-ink-heading font-medium hover:underline">Asymmetric Bonding</Link>). Migration is possible in principle: a new kernel deployed alongside the old one, with protocol-layer tooling bridging between them. In practice, civilizational-scale migration is hard &mdash; IPv4&rarr;IPv6 has been underway for 25 years and remains incomplete, and TCP/IP&apos;s own evolution has been as much a story of layering and patching as of clean versioning. Immutability is a 200-year wager on the correctness and adequacy of the current assumptions. The wager is defensible. It is still a wager.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    Two things are better instrumented today than when this analysis was first written. First, the frozen kernel now sits under an independent verification stack &mdash; Foundry, Halmos, Certora, TLA+, Echidna, and Mythril, each targeting the same invariants from a different angle (the inventory is on <Link href="/security#verification" className="text-ink-heading font-medium hover:underline">Security</Link>) &mdash; which narrows how a subtle flaw could survive undetected, without removing the wager itself. Second, the &ldquo;layering, not clean versioning&rdquo; mitigation this section predicted has already happened once: the batch settlement path (<code>FigaroBatchVerifier</code>) is a new contract added <em>beside</em> the frozen kernel &mdash; it shares no state with it and never calls into it &mdash; not an edit to it. It is exactly the kind of protocol-layer adaptation this section argued would have to carry the weight a frozen kernel cannot. See <Link href="/spec" className="text-ink-heading font-medium hover:underline">Specifications</Link> for the two-settlement-universe design.
                </p>
            </MarketingSection>

            <MarketingSection title="Risk: the protocol enforces cooperation, not justice." sectionId="risk-justice">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    FigaroCore enforces that the seller receives what was agreed. It does not enforce that what was agreed was fair. A value-added chain where a contributor accepts a low price is valid the moment both parties sign the commitment. Price discovery for an unbound sub-order runs today as a dispatch race, not an auction: the order broadcasts to every priceable seller the catalogue can discover, replies race back &mdash; countersignatures, or quotes under the buyer&apos;s own price ceiling &mdash; and the cheapest valid reply wins, with the buyer free to override toward a different one entirely. The mechanism is competition among simultaneous replies, not a descending clock. The point survives the correction: in a market with surplus supply, the price that competition converges on can still be low.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Why this is a design choice and not an oversight: fairness is a social construction, not a mechanism property. The protocol provides tools to implement fairness &mdash; minimum-price clauses, community-mandated floor terms as template constraints, exclusion from token communities that enforce standards &mdash; but it does not impose fairness on a trade neither party is asking to escape.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    The firm bundled worker protections with subordination. That bundling was contingent, not necessary &mdash; the argument that subordination was always a historically specific response to enforcement cost, not a structural requirement of coordination itself, is developed at length in <Link href="/papers/transaction-scoped-institutions" className="text-ink-heading font-medium hover:underline">From Firms to Transaction-Scoped Institutions</Link>. Insurance is a bonded process. Taxation is a treasury node in a composed assembly. Welfare is community redistribution. Collective bargaining is coordinated template selection. And the record any of these leaves &mdash; who paid whom, against what agreement, when &mdash; is itself protocol byproduct rather than a bookkeeping service someone has to separately build, as <Link href="/papers/self-closing-ledger-periods" className="text-ink-heading font-medium hover:underline">Self-Closing Ledger Periods</Link> argues for the settlement record generally. The protections are not dissolved &mdash; they are unbundled and reconstructed as independent, voluntary, transparent, bonded processes.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    The protocol chooses sovereignty over paternalism. That choice has real consequences for participants who are vulnerable in markets. Building the composable protections alongside the primitive is a responsibility of the ecosystem, not a feature of the kernel &mdash; see <Link href="#responsibility" className="text-ink-heading font-medium hover:underline">below</Link>.
                </p>
            </MarketingSection>

            <MarketingSection title="The scenario space." sectionId="scenarios">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    What follows is one scenario among several, not a forecast. Its value is as considered consequence &mdash; the set of outcomes thought through before deployment &mdash; not as prediction. The weights below are <strong className="text-ink-heading font-medium">one analyst&apos;s subjective estimates at the time of writing (mid-2026)</strong>, never empirical predictions or a consensus forecast. They exist so the elaboration that follows the table is not mistaken for the one path this is expected to take.
                </p>
                <div className="overflow-x-auto -mx-6 px-6 mb-5">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-default text-left font-semibold text-ink-heading">
                                <th scope="col" className="py-2 pr-4">Scenario</th>
                                <th scope="col" className="py-2 pr-4">Weight</th>
                                <th scope="col" className="py-2">Character</th>
                            </tr>
                        </thead>
                        <tbody className="[&>tr]:border-b [&>tr]:border-default align-top">
                            <tr>
                                <td className="py-2 pr-4">Partial durable adoption in coordination-heavy niches</td>
                                <td className="py-2 pr-4 text-ink-body">~30%</td>
                                <td className="py-2 text-ink-body">Cross-border trade, gig work, agent commerce, and DAO operations transform; capital-intensive production stays firm-structured.</td>
                            </tr>
                            <tr>
                                <td className="py-2 pr-4">AI-accelerated substantial transformation (30&ndash;50 yr)</td>
                                <td className="py-2 pr-4 text-ink-body">~25%</td>
                                <td className="py-2 text-ink-body">AI agents as the dominant throughput users compress the timeline; coordination-heavy sectors restructure fundamentally; real political stress.</td>
                            </tr>
                            <tr>
                                <td className="py-2 pr-4">Regulatory capture / CBDC substitution</td>
                                <td className="py-2 pr-4 text-ink-body">~20%</td>
                                <td className="py-2 text-ink-body">States force wallet-level KYC or promote CBDCs with programmable routing to treasury nodes; the pure kernel survives on the margins.</td>
                            </tr>
                            <tr>
                                <td className="py-2 pr-4">Full dissolution of the coordination firm</td>
                                <td className="py-2 pr-4 text-ink-body">~15%</td>
                                <td className="py-2 text-ink-body">The most far-reaching path, elaborated in the paragraphs below, roughly on the timeline they describe.</td>
                            </tr>
                            <tr>
                                <td className="py-2 pr-4">Transition-pain political backlash</td>
                                <td className="py-2 pr-4 text-ink-body">~8%</td>
                                <td className="py-2 text-ink-body">Erosion of employment-bundled protections outpaces composable replacements; political movements force restrictions.</td>
                            </tr>
                            <tr>
                                <td className="py-2 pr-4">Supersession by a better primitive</td>
                                <td className="py-2 pr-4 text-ink-body">~2%</td>
                                <td className="py-2 text-ink-body">Zero-knowledge coordination, AI-mediated trust, or some other innovation makes asymmetric bonding obsolete.</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    The paragraphs below elaborate the fourth scenario because it is the one that requires the most argument, not because it is the most likely. The release argument in this document does not depend on which scenario obtains; the ecosystem&apos;s obligations (<Link href="#responsibility" className="text-ink-heading font-medium hover:underline">below</Link>) apply under all of them.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    Read the fourth scenario narrowly. The firm historically bundles five distinct functions: coordinating production, aggregating capital across projects, accumulating tacit organizational knowledge, pooling risk across uncorrelated ventures, and providing legal personhood for contracting and liability. Asymmetric bonding addresses the first cleanly; it does not address the other four. Where persistent capital aggregation, tacit operating knowledge, risk pooling, or legal personhood matter, a structure that resembles a firm at the meta layer &mdash; a token-denominated treasury community that recurrently participates in compatible processes &mdash; is where those functions likely reconstitute. The precise claim is narrower than &ldquo;the firm dies&rdquo;: the <em>coordination firm</em>, whose value is internal management of a bounded labor pool, becomes structurally unnecessary where the primitive applies; the <em>capital firm</em>, whose value is durable asset ownership and risk-bearing, persists in revised wrappers. The fuller extrapolation &mdash; what a two-century horizon does to banking, securities, trade law, and the state&apos;s revenue base &mdash; is developed on <Link href="/why" className="text-ink-heading font-medium hover:underline">Why</Link> and in the <Link href="/papers" className="text-ink-heading font-medium hover:underline">papers</Link>; it is not repeated here.
                </p>
            </MarketingSection>

            <MarketingSection title="The transition risk." sectionId="transition">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    The period during which firms are declining but composable protections are not yet mature is the most dangerous window &mdash; perhaps 20&ndash;40 years. The old safety nets (employer-provided health insurance, corporate pensions, employment-based social security) erode; the new ones (insurance as a bonded process, taxation as a treasury node, welfare as community redistribution) are not yet built. This window is where human suffering is most likely.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Economic protections are not the only thing firms bundle with employment. The firm is also an identity container, a stability container, and a social-network container. &ldquo;I work at X&rdquo; is load-bearing for many people&apos;s self-concept in ways easy to under-weight. Work coordinated through a bonded process is transactional; it does not by itself provide the narrative continuity, the social scaffolding, or the long-arc sense of belonging that stable employment has historically provided for those who had it. Token communities can partially fill the gap &mdash; settlement history, template specialization as craft identity, recurring participation with compatible counterparties &mdash; but they are thinner and less cohesive than employer-based identity has been. The psychological and social cost of making transactional work the default is a real cost the mechanism enables and cannot remedy. It is distinct from the economic protection gap and will be felt by the same population during the same window.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    This is not an argument against deployment. It is an argument for urgency in building the composable protections alongside the kernel, and for recognizing that not all transition costs are economic. The kernel enables the new world. The templates, clauses, community patterns, and identity structures that form around it determine whether that world is livable.
                </p>
            </MarketingSection>

            <MarketingSection title="What the protocol cannot control." sectionId="cannot-control">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Even with the fullest possible ecosystem development, the protocol is a primitive. It enables coordination. What coordinates &mdash; and whether that coordination is wise, kind, sustainable, or just &mdash; is determined by the communities that build on it. The protocol cannot prevent:
                </p>
                <ul className="space-y-4 text-base text-ink-body mb-5 ml-6">
                    <li>
                        <strong className="text-ink-heading font-medium">Race-to-bottom pricing</strong> in fungible markets with surplus supply. Template floor-price constraints and community norms mitigate this; the kernel does not.
                    </li>
                    <li>
                        <strong className="text-ink-heading font-medium">Concentrations of token power.</strong> If one wallet accumulates a dominant position in the florin&apos;s circulating supply, it can influence graph economics that reference it &mdash; the same dynamic any concentrated holding creates in any market. The florin&apos;s own design narrows this without eliminating it: it is a pure Schelling-point token with no protocol-level value accrual to concentrate &mdash; no fee, no yield, no governance claim (<Link href="/papers/florin-schelling-point-token" className="text-ink-heading font-medium hover:underline">the florin paper</Link>) &mdash; and the one pool a concentrated holder might try to capture, the 600M RPGF allocation, is fixed: a farmer only ever dilutes their own share of it, and the reward&apos;s dominant term counts distinct live-ETH-staked sellers rather than raw holdings, so capturing a share of it costs a linear number of live deposits, not one large position (the rent-dissipation bound ratified 2026-07-31 &mdash; see <Link href="/artifact-rewards" className="text-ink-heading font-medium hover:underline">Artifact Rewards</Link> and <code>docs/PUBLIC_GRAPH_MODEL.md</code> &sect; &ldquo;What the stake does and does not do&rdquo;). None of this deters a determined actor with enough capital; it aligns the honest majority and bounds what concentration buys &mdash; a narrower and more honest claim than asserting the dynamic away.
                    </li>
                    <li>
                        <strong className="text-ink-heading font-medium">Community fracture.</strong> Token communities that diverge on values can fork. This is the Tiebout exit mechanism working correctly, but it can produce fragmentation, insularity, and echo chambers. The semantic graphs are interoperable across communities &mdash; whether communities choose to interoperate is a social question, not a technical one.
                    </li>
                    <li>
                        <strong className="text-ink-heading font-medium">Long-horizon and tail-risk coordination.</strong> Pandemic preparedness, defense, long-horizon environmental response, and existential-risk coordination are goods that require compulsion &mdash; free-riding is rational for individuals, and the payoff horizon exceeds any individual process&apos;s duration. Voluntary coordination through token communities under-provides these goods; template inclusion cannot substitute for compulsory taxation at the scale these goods require. To the extent state fiscal capacity is eroded, civilizational resilience to tail risk degrades. The protocol does not enable or prevent these goods; it erodes the compulsory mechanism that has historically funded them, and the voluntary mechanisms that might replace them are not yet built.
                    </li>
                </ul>
            </MarketingSection>

            <MarketingSection title="Why the answer is yes." sectionId="why-yes">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Across the scenarios above &mdash; partial adoption, AI-accelerated transformation, regulatory capture, full dissolution, transition backlash, supersession &mdash; the release decision holds. Not because all scenarios are equally good, but because the five arguments below hold under each of them.
                </p>
                <ol className="space-y-4 text-base text-ink-body leading-relaxed list-decimal pl-5">
                    <li>
                        <strong className="text-ink-heading font-medium">The mechanism is deterministic, not intelligent.</strong> FigaroCore does not make decisions. It does not reason. It does not pursue goals. It enforces a bonding equilibrium that two parties explicitly agreed to. The power is in enabling coordination, not in directing it.
                    </li>
                    <li>
                        <strong className="text-ink-heading font-medium">Withholding does not prevent.</strong> The game theory is published. The N-party scaling is a natural extension any mechanism designer can derive. If this primitive is going to exist &mdash; and the math says it will &mdash; the live question is whether the first implementation has the right properties. This one does: no owner, no fee, no escape hatches, no governance over resolution, formally verified invariants, transparent operation. A worse version &mdash; an admin key, a governance DAO over disputes, yield on bonds &mdash; would be genuinely dangerous, because each of those features is a capture vector that breaks the equilibrium. The safest version is the most constrained version. This is it.
                    </li>
                    <li>
                        <strong className="text-ink-heading font-medium">Composability resolves the protection gap.</strong> Every protection firms bundled with subordination can be reconstructed through composable clauses: insurance as a bonded process, taxation as a treasury node, welfare as community redistribution, collective bargaining as coordinated template selection. The reconstruction is better because it is permissionless, transparent, voluntary, and individually chosen &mdash; not because it is automatic; see <Link href="#responsibility" className="text-ink-heading font-medium hover:underline">the responsibility that remains</Link>.
                    </li>
                    <li>
                        <strong className="text-ink-heading font-medium">Transparency is the safeguard.</strong> Every process, bond, attestation, and settlement is permanently public &mdash; and, as built today, the public/private split behind that claim is mechanized, not asserted. Each clause declares which of its fields are public and which are private; the chain anchors only a fingerprint of the whole agreement; and the SDK&apos;s own projection logic withholds a private or unrecognized field fail-closed whenever it produces anything meant to be shared, never the reverse (<code>docs/VERIFICATION_MAP.md</code> &sect; E-8). Selling access to what stays private is itself an ordinary bonded sale on the owner&apos;s own terms &mdash; see <Link href="/data" className="text-ink-heading font-medium hover:underline">Your Records, Your Terms</Link>. Law enforcement does not need warrants for what is public. Regulators can monitor in real time. Communities can analyze patterns. This is the opposite of opacity. And when the system works well enough that people get the value they create, the incentive for illicit use decreases structurally.
                    </li>
                    <li>
                        <strong className="text-ink-heading font-medium">The alternative is not the status quo.</strong> The alternative to releasing a constrained, formally verified, ownerless primitive is not &ldquo;no permissionless coordination.&rdquo; It is someone else building a version with an admin key, a governance token, and escape hatches. Every one of those features weakens the equilibrium and creates a capture vector. Withholding this implementation does not prevent the category &mdash; it cedes the design space to worse implementations.
                    </li>
                </ol>
            </MarketingSection>

            <MarketingSection title="The responsibility that remains." sectionId="responsibility" bottomPad="wide">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Releasing the kernel is the beginning, not the end. The kernel enforces cooperation. Whether that cooperation is just depends on what is built on top. Three responsibilities fall to the ecosystem, not the kernel:
                </p>
                <ol className="space-y-3 text-base text-ink-body leading-relaxed list-decimal pl-5 mb-5">
                    <li><strong className="text-ink-heading font-medium">Build the composable protections.</strong> Insurance, taxation, welfare, minimum-price clauses, community standards &mdash; these are patterns composed above the kernel, not kernel features. They must be built, documented, and made as accessible as the kernel itself.</li>
                    <li><strong className="text-ink-heading font-medium">Acknowledge what the mechanism does not do.</strong> The mechanism does not make people honest &mdash; it makes honesty the cheapest option. It does not ensure fairness &mdash; it ensures settlement. It does not protect against irrationality &mdash; it assumes rationality. These boundaries should be stated clearly wherever the protocol is presented, including here.</li>
                    <li><strong className="text-ink-heading font-medium">Revisit this analysis.</strong> The original version of this document is dated April 2026; the operator reaffirmed its conclusions on 2026-08-03, ahead of any public-network deployment, while rebuilding the details that had drifted from the shipped system. The assumptions it records should keep being tested against reality as the protocol operates, and revised &mdash; with a successor kernel if the assumptions themselves turn out to need correcting &mdash; if evidence contradicts them.</li>
                </ol>
                <p className="text-base text-ink-body leading-relaxed mb-8">
                    A companion question &mdash; can I, personally, be robbed by this mechanism &mdash; is answered plainly on <Link href="/security" className="text-ink-heading font-medium hover:underline">Security</Link>. This page answers the larger one: what does it do to the world, if it works.
                </p>
                <ul className="space-y-3 text-base">
                    <li>
                        <Link href="/protocol" className="text-ink-heading font-medium hover:underline">Protocol</Link>
                        <span className="text-ink-body"> &mdash; the mechanism itself: bonded commitments, buyer dominance, twice-the-deal collateral, atomic settlement.</span>
                    </li>
                    <li>
                        <Link href="/papers" className="text-ink-heading font-medium hover:underline">Papers</Link>
                        <span className="text-ink-body"> &mdash; the formal derivations, and the eight-discipline reading of the papers this page draws on.</span>
                    </li>
                    <li>
                        <Link href="/why" className="text-ink-heading font-medium hover:underline">Why</Link>
                        <span className="text-ink-body"> &mdash; the rule-making lineage Figaro sits in: coercion, cognition, crypto.</span>
                    </li>
                    <li>
                        <Link href="/security" className="text-ink-heading font-medium hover:underline">Security</Link>
                        <span className="text-ink-body"> &mdash; can this mechanism rob you? Plain-language answers, caveats included.</span>
                    </li>
                </ul>
            </MarketingSection>
        </>
    );
}
