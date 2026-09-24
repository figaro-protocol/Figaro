import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import Link from "@/components/shared/Link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingSection } from "@/components/marketing/MarketingSection";
import { LayeredDefenseFigure } from "@/components/figures/LayeredDefenseFigure";

export const metadata: Metadata = withOg({
    title: "Core FAQ — Figaro Protocol",
    description:
        "Answers about the kernel and what stands beside it: what is frozen, the only two calls, where it is deployed, what has been verified and what has not, and what batch resolution changes.",
});

const QUESTIONS: { id: string; title: string }[] = [
    { id: "verification", title: "Has the code been audited?" },
    { id: "shutdown", title: "Who can shut this down or freeze your funds?" },
    { id: "layers", title: "What stands behind a trade?" },
    { id: "demonstrating", title: "What can you show a regulator or an auditor?" },
    { id: "frozen", title: "What exactly is frozen?" },
    { id: "two-calls", title: "What are the only two calls?" },
    { id: "deployments", title: "Where is it deployed?" },
    { id: "verified", title: "What has been verified, and what has not?" },
    { id: "batch", title: "What does batch resolution change?" },
];

export default function Faq() {
    return (
        <>
            <MarketingHero
                title="Core FAQ."
                lead={
                    <>
                        Answers about the kernel. Each states a fact of the contracts and points at the page that owns it.
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

            <MarketingSection title="Has the code been audited?" sectionId="verification">
                <p className="text-base text-ink-body leading-relaxed">
                    Not yet by an external auditor &mdash; and the full answer lives on its own page: the verification stack (seven independent benches) and the external-audit posture are on <Link href="/security" className="text-ink-heading font-medium hover:underline">Security</Link>; how to verify any trade yourself is the two checks under <Link href="#signing" className="text-ink-heading font-medium hover:underline">signing</Link>, below. Results will be published there when they exist.
                </p>
            </MarketingSection>

            <MarketingSection title="Who can shut this down or freeze your funds?" sectionId="shutdown">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    No one. FigaroCore is decentralized and permissionless, with no governance holding discretionary power over tokens. The kernel does not contain code that any address can call to halt resolution, blacklist a participant, or move tokens it does not have a signed commitment against. There is nothing to capture because there is no privileged role to hold.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    The exposure that remains is the underlying chain. If the chain itself halts, resolution halts &mdash; that risk is external to Figaro and shared with every other protocol on that chain. Inside Figaro, no party can halt the kernel; the property is called <em>no escape hatches</em>, and the protocol&apos;s security argument depends on it. Removing it would mean a different protocol with different guarantees.
                </p>
            </MarketingSection>

            <MarketingSection title="What stands behind a trade?" sectionId="layers">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Five things, each a reason the trade goes right, stacked from the inside out. The bonds behind them are deterrents &mdash; not a fund anyone draws on, and not property anyone seizes &mdash; and the innermost layers are built to do the work. The outer layers exist for the residue the inner ones cannot reach.
                </p>
                <LayeredDefenseFigure className="mb-6" />
                <ul className="space-y-3 text-base text-ink-body mb-5 ml-6">
                    <li>&mdash; <strong className="text-ink-heading font-medium">The chain.</strong> The trade runs on an EVM-compatible chain. Once its data is written, no one can rewrite it &mdash; not a counterparty, not Figaro, not the party who wrote it.</li>
                    <li>&mdash; <strong className="text-ink-heading font-medium">The smart contract and its data.</strong> FigaroCore holds both sides&apos; doubled bonds by fixed rule, and writes an unforgeable, timestamped entry for every step as it happens &mdash; always, not on request. Nothing leaves the smart contract until the buyer signs the resolution.</li>
                    <li>&mdash; <strong className="text-ink-heading font-medium">The other sellers.</strong> Resolution is all-or-nothing: no one is paid until the buyer confirms the whole trade. So everyone bonded into it has their own bond-backed reason to help set right whatever went wrong, before there is anything to dispute.</li>
                    <li>&mdash; <strong className="text-ink-heading font-medium">Arbitration.</strong> A forum the parties chose &mdash; Kleros is one, an online arbitration service that juries disputes using the data &mdash; weighs that data from outside the trade. Not the old platform in new clothes: a venue you and your counterparty picked rather than one imposed on you, ruling on data it cannot alter, able neither to reach into the smart contract nor to close the trade &mdash; which is exactly the authority a platform had and a forum does not.</li>
                    <li>&mdash; <strong className="text-ink-heading font-medium">Ordinary courts.</strong> Always available, whether or not the agreement names a forum. The data is evidence any legal system can read. Naming a forum in the agreement is a matter of clarity, never a limit on recourse.</li>
                </ul>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    The outer two layers act on the data from outside the trade; neither can reach into the smart contract. That is the point of the no-escape-hatch design &mdash; the same wall that keeps anyone from prying the bonds out also keeps every step legible to whoever reads the data later.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    A court judgment does not need to reach into the smart contract to work. It is enforced the way any ordinary judgment is &mdash; against the losing party&apos;s <em>other</em> assets, through the court&apos;s own powers of seizure, garnishment, or contempt &mdash; while the smart contract stays sealed the whole time. What the on-chain data buys is speed: a timestamped, tamper-proof account of exactly what was agreed and what was or was not delivered is the kind of evidence that gets a judgment quickly, rather than a slow trial over whose word to believe.
                </p>
            </MarketingSection>

            <MarketingSection title="What can you show a regulator or an auditor?" sectionId="demonstrating">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    The data &mdash; which is usually the thing being asked for. Using a protocol changes none of your obligations; what it changes is the cost of demonstrating you met them. Three cases the shipped <Link href="/clauses" className="text-ink-heading font-medium hover:underline">clauses</Link> already cover:
                </p>
                <ul className="space-y-3 text-base text-ink-body mb-5 ml-6">
                    <li>&mdash; <strong className="text-ink-heading font-medium">Consent, for the GDPR.</strong> A consent clause affixes each document &mdash; terms, a privacy notice, a data-processing agreement &mdash; at design time by its keccak256 hash, its version, and its title; the parties&apos; signatures over the agreement root that includes it <em>are</em> the acceptance, so there is no separate ceremony to reconstruct afterwards. Who accepted which version of which document, and when, is recoverable from the commitment itself &mdash; the data a controller has to be able to produce. The residual: that is evidence of acceptance, not a lawful basis. Purpose limitation, data minimization, and handling a withdrawal stay yours to run; the clause is append-only, so a withdrawal is an off-chain process, never a content edit.</li>
                    <li>&mdash; <strong className="text-ink-heading font-medium">Emissions, for ESG reporting.</strong> An emissions clause names the accounting methodology the seller reports under &mdash; the GHG Protocol, ISO 14064, PAS 2050, EN 16258, or one you write &mdash; and the measured figure is filed against that order as an attestation, with a correction filed as a later attestation readers weigh for themselves &mdash; per-order data under a named methodology, which is what an emissions report consumes. The residual: the protocol validates no standard and takes no closed list of them, stores no scope 1/2/3 classification (scope is relative to a reporting boundary, so a reader derives it from its own position in the chain), and does not check whether the figure is true. Offset retirement is outside the protocol entirely.</li>
                    <li>&mdash; <strong className="text-ink-heading font-medium">Trade facts, for e-invoicing.</strong> The European standard for electronic invoicing (EN 16931) wants a structured set of facts: who supplied whom, what was delivered, in what amounts, in which currency, on what date, against which agreement. A resolved process carries all of them in the public data, line by line, each line&apos;s own agreement bound by fingerprint. The residual: the protocol emits no invoice in that format and files nothing for you. Mapping the data into whatever form your jurisdiction requires is your own step &mdash; the point is that it is a mapping rather than a reconstruction.</li>
                </ul>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    The pattern is the same in all three: the obligation stays with the party who has it, and what the data removes is the part where you have to be believed. Nothing here makes a deployment compliant &mdash; compliance is a property of you and how you run it &mdash; and nothing on this site is legal or tax advice.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    One boundary sits underneath all three, and it is the thinnest joint in the whole arrangement. Everything the data says about the physical world &mdash; a handoff, an arrival, a temperature reading, a measured figure &mdash; enters it as a claim signed by a party, never as the world itself. No fingerprint checks a fact. What stands behind such a claim is economic and social rather than cryptographic: the party signing it has twice the value at its own link bonded for as long as the process is open, and nobody is paid until the buyer resolves, so a co-seller who spots a fault has their own reason to see it put right first. Where a harder check than that is wanted, it is composed in at design time &mdash; an independent inspection taking its own bonded leg of the trade, a credential register named in the clause &mdash; rather than supplied by the protocol. The data layer names four boundaries for what stands behind a row: protocol-enforced, what the kernel itself enforced; institution-declared, what a party declared and the protocol never validated; protocol-derived, what is anchored on chain with the content behind the fingerprint held off it; and composition-derived, what a composed venue&apos;s own events carry. A third party reading the books &mdash; a lender, an insurer, a court &mdash; reads the boundary of each row with it, because parties acting together can emit perfectly formed books for a service never rendered.
                </p>
            </MarketingSection>

            <MarketingSection title="What exactly is frozen?" sectionId="frozen">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Two contracts: FigaroCore and its commitment types. No admin, no upgrade path, no pause.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    Everything beside them is a separate contract. A change to the attestation coordinator, the batch verifier, or a registry is a new contract at a new address, deployed beside the old one. The kernel itself is never redeployed.
                </p>
            </MarketingSection>

            <MarketingSection title="What are the only two calls?" sectionId="two-calls">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Commit and resolve. Nothing else changes the kernel&apos;s state.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Commit refuses a signed order past its deadline, a missing or wrong signature from either party, a zero payment, a cumulative value that does not match, a token that takes a fee on transfer, and a second currency in one process.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    Resolve refuses anyone but the buyer, an incomplete order list, and a process already resolved. The full surface is on <Link href="/spec#FigaroCore" className="text-ink-heading font-medium hover:underline">Specifications</Link>.
                </p>
            </MarketingSection>

            <MarketingSection title="Where is it deployed?" sectionId="deployments">
                <p className="text-base text-ink-body leading-relaxed">
                    The address of every contract, per network, is in the deployment record in the repository and on <Link href="/spec" className="text-ink-heading font-medium hover:underline">Specifications</Link>. Read addresses from there, never from a remembered constant.
                </p>
            </MarketingSection>

            <MarketingSection title="What has been verified, and what has not?" sectionId="verified">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Unit and fuzz tests, symbolic execution, formal specification checking, and a machine-checked proof of the equilibrium, on every commit. Each bench and what it reaches is on <Link href="/security" className="text-ink-heading font-medium hover:underline">Security</Link>.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    Not yet an external audit. That is the honest answer, and it stays on the page until it changes.
                </p>
            </MarketingSection>

            <MarketingSection title="What does batch resolution change?" sectionId="batch">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    A separate contract resolves many orders under one proof. It shares no state with the kernel and never calls it.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    The kernel&apos;s rules do not change. A process resolved on the batch path has its record in the verifier, and the proof re-checks every clause against the spec the registry anchors.
                </p>
            </MarketingSection>
        </>
    );
}
