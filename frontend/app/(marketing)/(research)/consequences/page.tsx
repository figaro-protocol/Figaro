import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import Link from "next/link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingSection } from "@/components/marketing/MarketingSection";

export const metadata: Metadata = withOg({
    title: "Consequences — Figaro Protocol",
    description:
        "The question asked before release: assuming the whole thing is adopted — kernel, clauses, assemblies, the data layer, dispute composition, fiscal and regulatory reporting — what does the world look like in two hundred years, in what order does the old apparatus unwind, what does it cost, and where does power go instead.",
});

const JUMP_LINKS: { href: string; label: string }[] = [
    { href: "#constant", label: "The one constant that changed" },
    { href: "#first-order", label: "First order — the record stops being manufactured" },
    { href: "#second-order", label: "Second order — the firm boundary moves" },
    { href: "#third-order", label: "Third order — the state's modality inverts" },
    { href: "#fourth-order", label: "Fourth order — the economy stops being human-paced" },
    { href: "#power", label: "Where power goes" },
    { href: "#counterweights", label: "The standing counterweights" },
    { href: "#released-knowing", label: "Released knowing" },
];

export default function Consequences() {
    return (
        <>
            <MarketingHero
                title="Consequences."
                lead={
                    <>
                        One constant changed. Between two strangers with no institution between them, a promise to deliver can be made credible for the cost of temporarily locked capital and pennies of fixed gas, with no percentage taken by anyone in the middle. Civilization built a great deal to substitute for that missing property: intermediaries, books kept in order to be believed, the firm itself as a container for enforceable cooperation. All of it becomes optional. What follows is a two-hundred-year projection of that substitution stack unwinding, in order of how much weight each part carries, with what the unwinding costs stated beside it &mdash; every line derived from the mechanism, not observed in a deployment, and the{" "}
                        <Link href="#counterweights" className="text-ink-heading font-medium hover:underline">standing counterweights</Link>{" "}
                        below say what would make it wrong. It is not a forecast. It is the question asked before the code was released, and written down first so that no one &mdash; the author included &mdash; could later say it had not been asked.
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

            <MarketingSection title="The one constant that changed." sectionId="constant">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Every trade is a contract, and the element that fails between strangers is consideration: promising value is easy, and nothing about the promise makes delivering it credible. The mechanism answers that with capital rather than authority &mdash; doubled stakes on every side, and one party who can close &mdash; and the whole derivation, with the worked numbers, is on <Link href="/kernel" className="text-ink-heading font-medium hover:underline">Kernel</Link>. Start there if you landed here cold; everything below rests on it. Nothing in it can be overridden and no one takes a cut, which is the frozen surface stated on <Link href="/invariants" className="text-ink-heading font-medium hover:underline">Invariants</Link>. The consequence is not that trade becomes cheaper. It is that the one element which previously required an institution to underwrite it no longer does.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    <Link href="/why" className="text-ink-heading font-medium hover:underline">Why</Link> looks back: three eras of rule-making, and what a rule enforced by mathematics rather than force or belief frees. This page looks forward, at the other half of the same question &mdash; what that freedom costs, and what follows from it. One is the continuity of the other.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    The ordering principle below is load-bearing-ness. What unwinds first is whatever exists only to substitute for the missing property &mdash; the apparatus of making a stranger&apos;s word believable. What unwinds later is what was built on top of that apparatus and outlived its reason. What does not unwind at all is everything that was never about enforcement: physical force, care, tacit skill, and the human wish to belong to something that lasts longer than a transaction.
                </p>
            </MarketingSection>

            <MarketingSection title="First order: the record stops being manufactured." sectionId="first-order">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    The first stratum to thin is the one whose product is belief in records. Bookkeeping kept so that someone else will accept it, external audit, escrow, reconciliation between two organizations&apos; separately maintained books, compliance reporting, customs brokerage: these are not inefficiencies, they are the price of a world in which a record is an assertion by an interested party. That price falls when the record is a byproduct of settlement rather than a separate construction. A settled process closes its own ledger period, and the buyer&apos;s checkout lines, the audit trail, and the financial presentation are three views of one itemized decomposition, not three separate constructions to be reconciled with each other &mdash; the argument is <Link href="/papers/self-closing-ledger-periods" className="text-ink-heading font-medium hover:underline">Self-Closing Ledger Periods</Link>.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    These professions do not disappear because they are automated. They thin because the question they answer stops being asked. Their successors move upstream, to design time: authoring the clause that routes a fiscal share, verifying that a published spec says what the people binding to it believe it says, designing an assembly whose record satisfies a given regulator by construction rather than by later assembly. That work is paid for the same way the rest of the commons is &mdash; retroactively, from what actually gets used (<Link href="/clauses" className="text-ink-heading font-medium hover:underline">Clauses</Link>, <Link href="/rpgf" className="text-ink-heading font-medium hover:underline">Rewards</Link>).
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    The honest scale of this is decades, not years. Demand for reassurance is sticky, statutory obligations name specific professions by name, and the people whose training was the old apparatus do not retrain on the schedule a mechanism suggests. The first order is the least dramatic and the most certain part of this projection.
                </p>
            </MarketingSection>

            <MarketingSection title="Second order: the firm boundary moves." sectionId="second-order">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Coase put the firm where internal coordination costs less than coordinating through the market. The primitive prices one side of that comparison directly: the opportunity cost of a stake locked for the process&apos;s own duration and returned at settlement, rather than a rent extracted from every transaction forever. Where that cost is below the standing overhead of coordinating the same work inside an organization, the rational choice is the market. That is a comparative-statics claim bounded to a class of transactions, not a prediction that everything migrates; it is derived, with its bounds stated, in <Link href="/papers/transaction-scoped-institutions" className="text-ink-heading font-medium hover:underline">From Firms to Transaction-Scoped Institutions</Link>.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Inside the class where it holds, the value-added chain coordinates itself. Each seller is bonded against the cumulative value at its own link, and nobody is paid until the buyer resolves &mdash; so when one seller&apos;s work is faulty, every co-seller&apos;s cheapest move is to help put it right before resolution, because that is the only path to being paid at all. A weakest-link subgame does what middle management was hired to do, without a manager and without anyone holding authority over anyone else.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Hierarchy survives this. Reputation, standards, house method, the pull of a well-run group: none of that is dissolved by a settlement rule. What hierarchy loses is its enforcement monopoly, and with it the assumption that adoption once won stays won. Exit costs a signature: fork the assembly, compose a different clause, bind to another one tomorrow (<Link href="/assemblies" className="text-ink-heading font-medium hover:underline">Assemblies</Link>). Authority that has to be re-earned every process behaves differently from authority that owns the exit.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    What commerce gains here is what software gained a generation ago. Clauses are libraries; assemblies are packages; the registries are the index; and retroactive public-goods funding is the funding model open source never had, paying the authors of clauses and assemblies pro rata from usage recorded on chain rather than from a fee anyone pays. Deal-shapes then evolve at the speed of authorship rather than the speed of incorporation: a better way of structuring a freight movement, a clinical referral, a film crew, or a grid-balancing contract is published once and reused by anyone, anywhere, without asking.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    The cost belongs in the same breath as the gain. The firm was never only a coordination device. It was an identity, a stability, and a social container: &ldquo;I work at X&rdquo; is load-bearing for how many people understand themselves, and steady employment carried narrative continuity, colleagues, and a long arc that transaction-scoped work does not supply. Work assembled per process and dissolved at settlement is thinner than belonging. Recurring participation with compatible counterparties, craft identity in a specialization, membership in a token community: these fill part of the gap and are visibly less cohesive than what they replace. The mechanism enables this and cannot remedy it, and the generation living through the change is the one that pays.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    The precise claim is narrower than &ldquo;the firm ends,&rdquo; and the narrowness matters. What becomes structurally unnecessary is the coordination function: internal management of a bounded pool of labor and assets, whose whole justification was that enforcing agreements between non-subordinated strangers used to be expensive. The other functions the firm bundled with it are untouched by a settlement rule &mdash; owning durable assets, pooling risk across unrelated ventures, accumulating tacit operating knowledge, carrying legal personhood for contracting and liability. Those reconstitute in whatever wrapper a recurring group of wallets adopts: a treasury with a membership and a token, participating repeatedly in compatible processes, resembling a firm at that layer while the coordination it once sold is done by the mechanism.
                </p>
            </MarketingSection>

            <MarketingSection title="Third order: the state's modality inverts." sectionId="third-order">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    This is not the end of the state. It is a change of modality: from compelling reports to reading a record, from an authority that must be believed to one that publishes rules others compose with.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    <strong className="text-ink-heading font-medium">Fiscal routing becomes a default of settlement.</strong> A settled seller splits its own receipts onward in one transaction, through a public multisender it does not own (<Link href="/composition" className="text-ink-heading font-medium hover:underline">how that composes</Link>). A tax authority, a pension pool, a welfare fund, a maintenance reserve is then a recipient address that is already in the routing, not a remittance someone has to remember to make later. And the kernel draws no line between a tax and a fee for service: a screening checkpoint, a customs authority, a road authority is a wallet representing a real service whose continued operation requires receipts that cover its costs, committing and being paid exactly as any commercial participant does (<Link href="/papers/self-closing-ledger-periods" className="text-ink-heading font-medium hover:underline">Self-Closing Ledger Periods</Link>, &sect;7).
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    <strong className="text-ink-heading font-medium">Compliance inverts from attestation to demonstration.</strong> Today an entity asserts and an examiner checks the assertion. If the projection holds, the record already exists as a byproduct and the question is answered from it &mdash; timestamped, role-gated, produced in the ordinary course rather than at the moment of inquiry (<Link href="/papers/on-chain-evidence" className="text-ink-heading font-medium hover:underline">On-Chain Evidence</Link>). The regulator&apos;s successor publishes clauses instead of statutes and reads a live map instead of compelling filings: a rule that composes into the deal binds at the moment of the deal rather than being audited a year afterwards.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    <strong className="text-ink-heading font-medium">Disputes stratify.</strong> They stratify across five layers, none of them removable, and the inner ones absorb almost everything (<Link href="/faq#layers" className="text-ink-heading font-medium hover:underline">the stack, layer by layer, is on the FAQ</Link>). Composing a forum in fixes the venue in advance; where none was composed, the parties choose it after the fact. Courts recede to the residue &mdash; and receive better evidence when they get it.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    <strong className="text-ink-heading font-medium">Economic membership decouples from territory.</strong> The precondition for participating is a key and a stake, not a recognized civil-legal subjecthood &mdash; which matters most for the people who occupy the negative space of those frames. The claim is bounded and should stay bounded: it grants a capacity to have commerce where the capacity to have rights is denied, which is not the same thing and is not a substitute for it, and it offers nothing at all to those whose displacement has also stripped away any stake to bond (<Link href="/papers/wallet-without-polity" className="text-ink-heading font-medium hover:underline">The Wallet Without a Polity</Link>). At the scale of trade routes, a settlement layer nobody operates can be common ground beneath rival corridor projects, without touching who owns the ports and cables (<Link href="/papers/corridors-without-a-hegemon" className="text-ink-heading font-medium hover:underline">Corridors Without a Hegemon</Link>).
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    <strong className="text-ink-heading font-medium">Denomination pluralizes.</strong> Each process is denominated in one token the parties chose, and the choice carries meaning the payment itself does not: a stablecoin expresses a legal-regime preference, a community&apos;s own token expresses where the value is meant to land. A displaced community&apos;s token, spent in Los Angeles or Lima, can sustain value at home without a fiat pipeline. The protocol&apos;s own token is deliberately the least interesting object in this picture: a named Schelling point with no fee, no yield, and no claim on resolution &mdash; designed by refusal, as <Link href="/papers/florin-schelling-point-token" className="text-ink-heading font-medium hover:underline">the florin paper</Link> sets out.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    The cost here is the least resolved line in this projection, and it should be read as unresolved rather than answered. Compulsion is how civilization funds the goods voluntarism under-provides: pandemic preparedness, defense, century-scale environmental response, long-horizon research. Free-riding is individually rational and the payoff horizon exceeds any single process&apos;s duration, so voluntary inclusion in templates cannot substitute for compulsory taxation at the scale those goods require. Fiscal compulsion eroding before its substitutes mature is the way this projection does real damage, and nothing in the mechanism prevents it.
                </p>
            </MarketingSection>

            <MarketingSection title="Fourth order: the economy stops being human-paced." sectionId="fourth-order">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    The protocol reads a signature, never a species. A wallet driven by software commits, bonds, and is paid on exactly the same footing as one driven by a person (<Link href="/agents" className="text-ink-heading font-medium hover:underline">Agents</Link>). Two properties compound with that. Coordination costs a signature and fixed gas rather than a negotiation, and commit and resolve require no synchrony between the parties. Together they expand the set of coordination worth doing to include everything previously too small, too fast, or too far away to be worth a contract at all.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    On a two-hundred-year horizon, most processes are then machine-to-machine, at frequencies no human observes, with human-meaningful surfaces sitting on top of them the way a dashboard sits on top of a network. Assets hold their own wallets: the aircraft, the kiln, the water-treatment plant earning what its own maintenance costs, with the operator a policy running on the asset&apos;s behalf rather than an owner-manager watching a queue. This is not tokenized ownership of the asset and never becomes it &mdash; the asset stays on its owner&apos;s books at carrying value; the wallet is its signing apparatus and its earnings pocket, and it stays in the market only as long as its receipts cover its real-world operating costs, exactly as a node stays online only while its fees cover its electricity.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Institutions become transaction-scoped by default: assembled for one process out of the parties actually doing the work, dissolved at settlement, with the standing institution becoming the exception that has to justify why it stands. And the data allocation of the platform century inverts: the aggregate map public, the detail sealed with whoever produced it and sold, when it is sold, on its owner&apos;s terms (<Link href="/data" className="text-ink-heading font-medium hover:underline">Your Records, Your Terms</Link>). What that newly makes possible is a live and verifiable picture of an economy &mdash; enough to reopen, with evidence, the calculation debates that could previously only be argued in the abstract. A second economy runs on trade&apos;s exhaust, and the people who produced the exhaust are the ones holding it.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    One line about distance. Because commitment and resolution need no synchrony between the parties &mdash; nothing in the mechanism requires the two sides to be within seconds of each other &mdash; the same contract form keeps its properties across light-lag. Every enforcement apparatus we have ever built assumed a shared jurisdiction and a reachable counterparty. This one assumes neither.
                </p>
            </MarketingSection>

            <MarketingSection title="Where power goes." sectionId="power">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Power is not eliminated by any of this. It is re-priced and relocated, and the honest version of the projection names where it lands. What the intermediary used to meter redistributes to the hands in the chain, because every value-adder is paid its own line directly rather than a residual after the platform&apos;s cut. Four concentrations survive, and one of them gets stronger.
                </p>
                <ul className="space-y-5 text-base text-ink-body mb-5 ml-6">
                    <li>
                        <strong className="text-ink-heading font-medium">Capital.</strong> Bonding capacity gates participation. The doubled stake converts a behavioral question into a solvency one, and solvency is unevenly distributed. Lending contracts can route bond capital to a creditworthy participant &mdash; the deterrent survives borrowing, since the borrower loses the collateral on defection regardless of whose capital it was &mdash; but a participant with no access to bondable capital, borrowed or owned, is simply outside. That is a credit problem the mechanism does not solve and should not be described as solving.
                    </li>
                    <li>
                        <strong className="text-ink-heading font-medium">Design.</strong> Whoever authors the clauses and assemblies that everyone reuses shapes the defaults everyone accepts, and defaults are the quietest form of power there is. Permissionless authorship mitigates it &mdash; anyone may publish a competing clause, and the reward for authorship is uniform, counting real usage and nothing else &mdash; but mitigation is not elimination, and a widely adopted default is a position worth holding.
                    </li>
                    <li>
                        <strong className="text-ink-heading font-medium">Standards communities.</strong> A community that sets terms others adopt can be forked by anyone who disagrees. Network effects make forking cheap in principle and expensive in practice; the exit is real and it is not free.
                    </li>
                    <li>
                        <strong className="text-ink-heading font-medium">Physical force.</strong> Untouched. The state&apos;s monopoly on violence is not contested by a settlement rule, and nothing on this page should be read as claiming otherwise.
                    </li>
                </ul>
                <p className="text-base text-ink-body leading-relaxed">
                    And the registries have no morality. A cartel composes as cheaply as a cooperative; a supply chain that treats people badly settles as reliably as one that does not. The mechanism makes coordination cheap and legible &mdash; not good. The one thing legibility changes is that unkindness has to happen in the open, on a record it cannot revise afterwards, and at its own expense.
                </p>
            </MarketingSection>

            <MarketingSection title="The standing counterweights." sectionId="counterweights">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    <strong className="text-ink-heading font-medium">None of this has been observed.</strong> Every line above is a cascade derived from a mechanism, not evidence drawn from a deployment. The modal outcome for a technology of this kind is not transformation but the niche: durable use in a few coordination-heavy corners, no visible effect anywhere else, and a literature that overstated it. This projection is the strongest case that can be argued from the mechanism, and it should be read as that rather than as the expected one.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    <strong className="text-ink-heading font-medium">The transition window is where the harm is.</strong> Call it twenty to forty years, in which the protections bundled with employment erode faster than composable replacements are authored, and in which the non-economic loss &mdash; identity, colleagues, narrative continuity, the sense of belonging to something with a longer arc than a process &mdash; falls on the same people at the same time as the economic one. This is not an argument against release. It is an argument for urgency in building the replacements, and against pretending that all transition costs are economic.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    <strong className="text-ink-heading font-medium">Immutability is a wager.</strong> The kernel cannot be upgraded or paused, so its assumptions are load-bearing forever. The heaviest of them is rationality, and the boundary belongs stated wherever the protocol is presented: the mechanism makes cooperation the cheapest option for a rational participant, and claims nothing beyond that. It does not hold for someone transacting under duress, where another party controls the wallet or the decision; it makes ideologically motivated harm expensive rather than impossible; and it does nothing for someone who commits without understanding what a doubled lockup means.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    The wager&apos;s only instrument is layering. Adaptation happens beside the frozen kernel, never inside it: the batch settlement path (<code>FigaroBatchVerifier</code>) is a separate contract that shares no state with the kernel and never calls into it, and that is the shape every future adaptation has to take. An independent verification stack &mdash; Foundry, Halmos, Certora, TLA+, and Echidna, each attacking the same invariants from a different angle (<Link href="/security#verification" className="text-ink-heading font-medium hover:underline">Security</Link>) &mdash; narrows how a subtle flaw could survive undetected. It does not remove the wager. The frozen surface itself is on <Link href="/kernel" className="text-ink-heading font-medium hover:underline">Kernel</Link>, and the properties it is wagering on are on <Link href="/invariants" className="text-ink-heading font-medium hover:underline">Invariants</Link>.
                </p>
            </MarketingSection>

            <MarketingSection title="Released knowing." sectionId="released-knowing" bottomPad="wide">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    The mechanism is deterministic, not intelligent. It does not decide, reason, or pursue anything; it enforces a bonding equilibrium that two parties explicitly agreed to, and it has no view about what they agreed to. Its power is in enabling coordination, not in directing it.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Withholding it would not have prevented it. The mathematics is published, and the extension from two parties to a chain of them is derivable by any mechanism designer who wants it. The live question was never whether this primitive exists but what properties the first serious implementation has &mdash; and the dangerous version is not this one. An admin key, governance over resolution, or yield on locked bonds would each be a capture vector that breaks the very equilibrium the thing is built to provide. The safest version is the most constrained version: no owner, no fee, no escape hatches, nothing that votes on a settlement. That is what was built, and the question on this page was asked and answered before it was released rather than after.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Three responsibilities follow, and none of them is the kernel&apos;s:
                </p>
                <ol className="space-y-3 text-base text-ink-body leading-relaxed list-decimal pl-5 mb-5">
                    <li><strong className="text-ink-heading font-medium">Build the composable protections.</strong> Insurance as a bonded process, fiscal shares as a routing default, community redistribution, floor terms, standards a community can hold each other to &mdash; these are patterns someone has to author above the kernel, not features it will ever grow. They should be as accessible, as documented, and as reusable as the primitive itself.</li>
                    <li><strong className="text-ink-heading font-medium">Acknowledge what the mechanism does not do.</strong> It does not make people honest; it makes honesty the cheapest option. It does not ensure fairness; it ensures settlement. It does not protect against irrationality; it assumes rationality. Those boundaries belong wherever the protocol is presented, including here.</li>
                    <li><strong className="text-ink-heading font-medium">Revisit this analysis.</strong> Everything above is a claim about the world, and claims about the world are testable as the protocol operates. Where evidence contradicts one, it should be revised in public. Where an assumption in the kernel itself turns out to need correcting, the answer is a different kernel deployed beside this one and adopted by whoever finds it better &mdash; not an edit to this one, which is not possible and is not meant to be.</li>
                </ol>
                <p className="text-base text-ink-body leading-relaxed">
                    A narrower question &mdash; can I, personally, be robbed by this mechanism &mdash; is answered plainly on <Link href="/faq" className="text-ink-heading font-medium hover:underline">the FAQ</Link>. This page answered the larger one, in the order the consequences arrive.
                </p>
            </MarketingSection>
        </>
    );
}
