import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import Link from "next/link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingSection } from "@/components/marketing/MarketingSection";
import { LayeredDefenseFigure } from "@/components/figures/LayeredDefenseFigure";
import { RegistryLifecycleFigure } from "@/components/figures/RegistryLifecycleFigure";
import { LabelledListRow } from "@/components/shared/LabelledListRow";

export const metadata: Metadata = withOg({
    title: "FAQ — Figaro Protocol",
    description:
        "Plain-language answers to the questions people ask before sending tokens through Figaro — custody, why this is not escrow, non-delivery, disputes, lost keys, privacy, ownership — with the residual risk stated beside each answer.",
});

/** The page's sixteen questions, split into two labeled groups by what each
 *  question is actually about — plus one leading entry that is NOT a question:
 *  the pre-deal checklist (a curated digest of thirteen answers; the index
 *  POINTS at it, ruled 2026-08-25 — the map stays the complete map, the digest
 *  stays a digest, never merged). The DOM sections below run in exactly this
 *  order — index and document order are one sequence, never two (they drifted
 *  apart once: `keys` rendered fifth while indexed under "Deeper", `ownership`
 *  the mirror image). Titles are copied verbatim from each `MarketingSection`;
 *  keep the three in lockstep if a heading changes. */
const BEFORE_YOU_TRADE: { id: string; title: string }[] = [
    { id: "before-you-send", title: "Before your first real deal." },
    { id: "custody", title: "Who holds the tokens?" },
    { id: "escrow", title: "Is this escrow?" },
    { id: "counterparty", title: "What if the counterparty doesn't deliver?" },
    { id: "disputes", title: "What if you genuinely disagree?" },
    { id: "layers", title: "What stands behind a deal?" },
    { id: "privacy", title: "What does the network learn about you?" },
    { id: "ownership", title: "Who owns Figaro?" },
];

const DEEPER_QUESTIONS: { id: string; title: string }[] = [
    { id: "keys", title: "What if you lose your keys?" },
    { id: "agents", title: "Can software run a wallet here?" },
    { id: "verification", title: "Has the code been audited?" },
    { id: "signing", title: "Can this website lie about what you're signing?" },
    { id: "shutdown", title: "Who can shut this down or freeze your funds?" },
    { id: "multi-party", title: "What if one participant in a multi-party process fails?" },
    { id: "builders-registries", title: "Can someone hijack your registration or clause?" },
    { id: "demonstrating", title: "What can you show a regulator or an auditor?" },
    { id: "compatibility", title: "Gas, tokens, and tax." },
];

export default function Faq() {
    return (
        <>
            <MarketingHero
                title="FAQ."
                lead={
                    <>
                        Plain-language answers to the questions you should ask before sending tokens through a protocol you didn&apos;t write. Each answer names a concern, states what the protocol can and cannot do about it, and states the residual risk beside it &mdash; never in a footnote.
                    </>
                }
            />

            <MarketingSection bottomPad="default">
                <nav aria-label="Jump to a question" data-testid="faq-jump-index">
                    <div className="mb-8">
                        <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-muted mb-3">
                            Before you trade
                        </h2>
                        <ul className="[&>li]:border-b [&>li]:border-default text-base">
                            {BEFORE_YOU_TRADE.map((item) => (
                                <li key={item.id}>
                                    <Link href={`#${item.id}`} className="flex items-baseline justify-between gap-4 py-2.5 text-ink-heading hover:underline">
                                        <span>{item.title}</span>
                                        <span aria-hidden="true" className="text-ink-muted">&darr;</span>
                                    </Link>
                                </li>
                            ))}
                        </ul>
                    </div>
                    <div>
                        <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-muted mb-3">
                            Deeper questions
                        </h2>
                        <ul className="[&>li]:border-b [&>li]:border-default text-base">
                            {DEEPER_QUESTIONS.map((item) => (
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

            {/* Named in the jump index above as its leading entry (ruled
             *  2026-08-25): the index is the complete map and POINTS here; this
             *  section stays a curated DIGEST — the short form of thirteen
             *  answers already below, kept at the top where a first-time reader
             *  lands. Never merge the two (the index exhaustive, this selective —
             *  collapsing them degrades both jobs), and never grow this list
             *  toward exhaustiveness to cover the index's deeper questions.
             *  Every line here is one sentence and links to the section or page
             *  that owns the full treatment; nothing is derived here that is not
             *  derived there. */}
            <MarketingSection title="Before your first real deal." sectionId="before-you-send">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Thirteen things worth settling before a first commitment, each answered in one line. Every line is the short form; the answer that owns it in full &mdash; with its residual risk &mdash; is one link away. The unfavourable answers are on it too, in the same list as the rest.
                </p>
                <ul className="space-y-3 text-base text-ink-body mb-5 ml-6">
                    <li>&mdash; <strong className="text-ink-heading font-medium">Has the code been audited?</strong> Not yet by an external auditor; what exists instead is six independent verification benches and a frozen surface waiting for one (<Link href="#verification" className="text-ink-heading font-medium hover:underline">the full answer</Link>).</li>
                    <li>&mdash; <strong className="text-ink-heading font-medium">Is anyone selling near me?</strong> Whatever the <Link href="/discover" className="text-ink-heading font-medium hover:underline">member directory</Link> shows where you are looking is the whole answer, including nothing &mdash; it reads the chain live and is never a curated list.</li>
                    <li>&mdash; <strong className="text-ink-heading font-medium">Who holds the payment while the deal runs?</strong> No one &mdash; the payment and both stakes sit in a contract with no owner and no path out but the close the buyer signs (<Link href="#custody" className="text-ink-heading font-medium hover:underline">who holds the tokens</Link>).</li>
                    <li>&mdash; <strong className="text-ink-heading font-medium">What do I have to put up?</strong> As a buyer, twice the payment leaves your wallet at commit &mdash; the payment itself and an equal stake that returns to you when you sign the close &mdash; plus ETH for the gas each step costs, cents to a few dollars at typical network prices (<Link href="#compatibility" className="text-ink-heading font-medium hover:underline">gas, tokens, and tax</Link>).</li>
                    <li>&mdash; <strong className="text-ink-heading font-medium">Can I get a refund?</strong> There is no refund button and no reversal path, by design &mdash; nobody is paid until the buyer signs the close, so a shortfall is put right <em>before</em> that signature rather than undone after it (<Link href="#escrow" className="text-ink-heading font-medium hover:underline">why this is not escrow</Link>).</li>
                    <li>&mdash; <strong className="text-ink-heading font-medium">What happens the moment I sign the close?</strong> It is terminal acceptance: the process settles, and nothing inside the protocol reopens it &mdash; so look at the work before signing, not after.</li>
                    <li>&mdash; <strong className="text-ink-heading font-medium">What do I lose if it goes wrong?</strong> Your stake is your own deterrent, never a pot the other side can win &mdash; the way to lose it is to leave a process open forever, which leaves every stake locked, yours included (<Link href="#escrow" className="text-ink-heading font-medium hover:underline">the residual, stated in full</Link>).</li>
                    <li>&mdash; <strong className="text-ink-heading font-medium">What if we genuinely disagree?</strong> There is no on-chain verdict and there will not be one &mdash; three inner layers absorb most of it, and any outside forum rules on the record, to which the protocol contributes evidence, never a ruling (<Link href="#layers" className="text-ink-heading font-medium hover:underline">the five layers</Link>).</li>
                    <li>&mdash; <strong className="text-ink-heading font-medium">What if I lose my key?</strong> The kernel has no recovery path of any kind &mdash; a buyer who set up an account-level recovery beforehand can still close active processes; a buyer who did not leaves the stakes locked, permanently (<Link href="#keys" className="text-ink-heading font-medium hover:underline">plan this before you commit</Link>).</li>
                    <li>&mdash; <strong className="text-ink-heading font-medium">Can anyone freeze my funds or shut this down?</strong> There is no admin, owner, pause function, or upgrade key to hold; the exposure that remains is Ethereum itself (<Link href="#shutdown" className="text-ink-heading font-medium hover:underline">what has no privileged role</Link>).</li>
                    <li>&mdash; <strong className="text-ink-heading font-medium">Can this website lie about what I am signing?</strong> Not about a deal already committed &mdash; the gap is the moment just before you sign, and closing it means running one of two checks yourself, with developer tools (<Link href="#signing" className="text-ink-heading font-medium hover:underline">both checks, step by step</Link>).</li>
                    <li>&mdash; <strong className="text-ink-heading font-medium">What becomes public about me?</strong> Your wallet address and its on-chain activity, linkable by anyone &mdash; this is pseudonymity, not anonymity; the personal detail stays off-chain, encrypted, and erasable by you (<Link href="#privacy" className="text-ink-heading font-medium hover:underline">what the network learns</Link>).</li>
                    <li>&mdash; <strong className="text-ink-heading font-medium">Does this change my tax or legal position?</strong> No &mdash; a trade here carries the same obligations as any direct trade in your jurisdiction, and nothing on this site is legal, tax, or financial advice (<Link href="#compatibility" className="text-ink-heading font-medium hover:underline">tax and law</Link>).</li>
                </ul>
                <p className="text-base text-ink-body leading-relaxed">
                    None of these ask you to take this site&apos;s word for anything: each line names something readable on the chain, runnable on your own machine, or a thing the kernel plainly has no code for.
                </p>
            </MarketingSection>

            <MarketingSection title="Who holds the tokens?" sectionId="custody">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    No one. When a buyer and seller commit to a process, the payment and both bonds move into <em>FigaroCore</em> &mdash; the kernel contract &mdash; and stay there until the buyer signs the atomic resolution that releases them. There is no custodian, no escrow account, no platform balance sheet, no off-chain ledger reconciling who is owed what.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    FigaroCore has no owner. No address can withdraw funds it does not have a signed commitment against. The only paths out are the resolution the buyer signs and the bond release the seller earns by performing &mdash; both encoded in the contract, both auditable on-chain. Contracts are code, and code can have bugs. What has been done about that is on <Link href="/security" className="text-ink-heading font-medium hover:underline">Security</Link>.
                </p>
            </MarketingSection>

            <MarketingSection title="Is this escrow?" sectionId="escrow">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    No, and the difference is who decides. An escrow agent is a third party that holds the value and then rules on whether the condition was met &mdash; you are trusting its judgment, its solvency, and its willingness to answer the phone. Nothing occupies that seat here. FigaroCore holds the payment and both stakes by fixed rule and has no opinion about the deal: it cannot inspect the work, cannot take a side, and cannot release anything except along the paths the two parties signed for. Each side&apos;s stake is its own deterrent, not a pot the other side can win &mdash; twice the payment for the buyer, twice the value at their link for each seller, and all of it comes home at settlement.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    What follows from that is worth reading before you commit rather than after. There is no refund button and no payment-network reversal path, by design: either one would be a third party able to undo a settled commitment, which is precisely the seat this design leaves empty. The lever is the close itself. Nobody is paid until the buyer resolves, so a shortfall is put right <em>before</em> resolution &mdash; while every party still has its own stake riding on the outcome, which is what makes putting it right the seller&apos;s cheapest move, and the co-sellers&apos; too (<Link href="#layers" className="text-ink-heading font-medium hover:underline">the five layers</Link> behind that). Resolution is terminal acceptance: once the buyer signs it, the process is settled and nothing inside the protocol reopens it.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    The residual is what this asks of the buyer that an escrow agent asks of nobody. You have to look at the work and decide, and do it while your own stake is locked. Resolve without checking and you have accepted what arrived. Never resolve at all and every stake stays locked, your own included &mdash; the property that stops anyone reaching into a deal from outside is the same property that offers no way out of one.
                </p>
            </MarketingSection>

            <MarketingSection title="What if the counterparty doesn't deliver?" sectionId="counterparty">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Each party has more locked than they could gain by walking away &mdash; the mechanism, worked through with the numbers, is on <Link href="/kernel" className="text-ink-heading font-medium hover:underline">Kernel</Link>. What matters for this question: whatever the other side does, honoring the deal leaves them better off than cheating, and a shortfall is put right <em>before</em> settlement &mdash; there is no refund path; the buyer&apos;s lever is to withhold the close until the work is set right. You can also look before you commit: a seller&apos;s settled processes and the stake it currently holds live are both readable from the chain by anyone, so what you are reading is a declaration you check for yourself &mdash; never a score this protocol issues, ranks, or could take away.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    The equilibrium bounds losses; it does not eliminate them. A counterparty willing to burn their bond can still grief you. The defense is arithmetic: they lose twice what you lose, every time. For the formal derivation see the <Link href="/working-groups" className="text-ink-heading font-medium hover:underline">papers</Link>.
                </p>
            </MarketingSection>

            <MarketingSection title="What if you genuinely disagree?" sectionId="disputes">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Then five layers stand behind the deal, and the next answer walks all five with the figure. What this answer owns is the honest caveat underneath them:
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    But start with how rarely the question should arise: the deal&apos;s own arithmetic is built so that performing and resolving beat every alternative while the stakes are locked &mdash; so the ordinary ending of a disagreement is a remedy the parties settle between themselves, before resolution, with both deterrents still in force. A dispute is the exception the deterrent failed to dissolve. That is why dispute resolution lives at the edge of the design rather than at its center: not because disagreement is ignored, but because the mechanism is built to starve it.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    There is no on-chain verdict, and there will not be one. The protocol does not adjudicate. Disagreements that exhaust the first three layers go to whatever off-chain forum the parties chose &mdash; Figaro contributes evidence, not a ruling. The dispute layer is provider-agnostic by design; the kernel takes no position on which forum a community uses. A Kleros clause is published, so composing that forum into an assembly is a design-time choice an author makes &mdash; and any other forum composes the same way. The full external-composition catalogue &mdash; forums, and everything else the kernel deliberately leaves outside itself &mdash; is on <Link href="/composition" className="text-ink-heading font-medium hover:underline">Composition</Link>.
                </p>
            </MarketingSection>

            <MarketingSection title="What stands behind a deal?" sectionId="layers">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Five things, each a reason the deal goes right, stacked from the inside out. The bonds behind them are deterrents &mdash; not a fund anyone draws on, and not property anyone seizes &mdash; and the innermost layers do almost all the work. The outer layers exist only for the residue the inner ones cannot reach.
                </p>
                <LayeredDefenseFigure className="mb-6" />
                <ul className="space-y-3 text-base text-ink-body mb-5 ml-6">
                    <li>&mdash; <strong className="text-ink-heading font-medium">The chain.</strong> The deal runs on Ethereum. Once its record is written, no one can rewrite it &mdash; not a counterparty, not Figaro, not the party who wrote it.</li>
                    <li>&mdash; <strong className="text-ink-heading font-medium">The lockbox and its record.</strong> FigaroCore holds both sides&apos; doubled stakes by fixed rule, and writes an unforgeable, timestamped record of every step as it happens &mdash; always, not on request. Nothing leaves the lockbox until the buyer signs the close.</li>
                    <li>&mdash; <strong className="text-ink-heading font-medium">The other sellers.</strong> Settlement is all-or-nothing: no one is paid until the buyer confirms the whole deal. So everyone bonded into it has their own stake-backed reason to help set right whatever went wrong, before there is anything to dispute.</li>
                    <li>&mdash; <strong className="text-ink-heading font-medium">Arbitration.</strong> A forum the parties chose &mdash; Kleros is one, an online arbitration service that juries disputes using the record &mdash; weighs that record from outside the deal. Not the old middleman in new clothes: a venue you and your counterparty picked rather than one imposed on you, ruling on a record it cannot alter, able neither to reach into the lockbox nor to close the deal &mdash; which is exactly the authority a platform had and a forum does not.</li>
                    <li>&mdash; <strong className="text-ink-heading font-medium">Ordinary courts.</strong> Always available, whether or not the agreement names a forum. The record is evidence any legal system can read. Naming a forum in the agreement is a matter of clarity, never a limit on recourse.</li>
                </ul>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    The outer two layers act on the record from outside the deal; neither can reach into the lockbox. That is the point of the no-escape-hatch design &mdash; the same wall that keeps anyone from prying the stakes out also keeps every step legible to whoever reads the record later.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    A court judgment does not need to reach into the lockbox to work. It is enforced the way any money judgment is &mdash; against the losing party&apos;s <em>other</em> assets, through the court&apos;s own powers of seizure, garnishment, or contempt &mdash; while the lockbox stays sealed the whole time. What the on-chain record buys is speed: a timestamped, tamper-proof account of exactly what was agreed and what was or was not delivered is the kind of evidence that gets a judgment quickly, rather than a slow trial over whose word to believe.
                </p>
            </MarketingSection>

            <MarketingSection title="What does the network learn about you?" sectionId="privacy">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Almost nothing. The kernel stores fingerprints, never content &mdash; the hashes of the agreements, and the keccak256 of each attestation&apos;s content. Everything a person might recognise as personal data stays off-chain, encrypted, held where the parties can erase it. The European Data Protection Board&apos;s Guidelines 02/2025 lay out what that looks like for a blockchain: keep personal data off the ledger, store it off-chain under crypto-shredding, make pinned content erasable, and minimise any location data that is published. Figaro implements that pattern, and does not call itself &ldquo;compliant&rdquo; &mdash; compliance is a property of a deployment and the party running it, not of the code.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Each deal also chooses, term by term, what it publishes to the open commons and what it seals behind the fingerprint &mdash; the full story of that choice is on <Link href="/data" className="text-ink-heading font-medium hover:underline">Data</Link>.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Concretely, on this build today:
                </p>
                <ul className="space-y-3 text-base text-ink-body mb-5 ml-6">
                    <li>&mdash; <strong className="text-ink-heading font-medium">Delivery addresses are encrypted end-to-end.</strong> A name, street, and door number travel encrypted per order between exactly the two parties to that order &mdash; per-order ephemeral ECDH key exchange, AES-256-GCM. The chain anchors only a 32-byte hash of the encrypted blob; the ciphertext never reaches calldata. The keys live in your browser session and are purged when the tab closes and when the order or process resolves. After that purge no one &mdash; including the two parties &mdash; can recover the plaintext. That is crypto-shredding, not access control.</li>
                    <li>&mdash; <strong className="text-ink-heading font-medium">Public location is capped at neighborhood precision.</strong> Geohashes on published profiles and agreements carry at most six characters &mdash; roughly a 1.2 km cell. Door-level precision exists only inside the encrypted per-order envelope, never in anything published.</li>
                    <li>&mdash; <strong className="text-ink-heading font-medium">What you publish, you can erase.</strong> Profiles, catalogues, and evidence bundles are pinned to IPFS; every supersede or withdraw unpins the prior content, and the audit-evidence PDF carries an explicit unpin control.</li>
                    <li>&mdash; <strong className="text-ink-heading font-medium">The infrastructure is yours.</strong> RPC and IPFS endpoints are yours to set when you join, and to change from Manage membership. What you publish is pinned on your node, paid for by you, and erasable by you; the build-baked defaults are only defaults.</li>
                    <li>&mdash; <strong className="text-ink-heading font-medium">Device location stays on the device.</strong> Your location is encoded to a geohash locally in the browser. A typed address goes straight from your browser to OpenStreetMap&apos;s Nominatim geocoder &mdash; a third party &mdash; only when you take an explicit action, and that is disclosed at the input. No server of this frontend&apos;s sits in between; it has none.</li>
                </ul>
                <p className="text-sm text-ink-muted leading-relaxed mb-2">
                    The same picture, split by what the chain sees versus what stays off it:
                </p>
                <div className="overflow-x-auto -mx-6 px-6 mb-5">
                    <table className="w-full text-sm">
                        <thead>
                            <tr className="border-b border-default text-left font-semibold text-ink-heading">
                                <th scope="col" className="py-2 pr-4">Public on-chain</th>
                                <th scope="col" className="py-2">Private / off-chain</th>
                            </tr>
                        </thead>
                        <tbody className="[&>tr]:border-b [&>tr]:border-default align-top">
                            <tr>
                                <td className="py-2 pr-4 text-ink-body">Wallet addresses and on-chain activity &mdash; pseudonymous, linkable by anyone</td>
                                <td className="py-2 text-ink-body">&mdash;</td>
                            </tr>
                            <tr>
                                <td className="py-2 pr-4 text-ink-body">A keccak256 fingerprint of the agreement</td>
                                <td className="py-2 text-ink-body">The agreement&apos;s own terms &mdash; public-disposition ones published in the open (a shared commons), private-disposition ones published only behind the fingerprint, encrypted</td>
                            </tr>
                            <tr>
                                <td className="py-2 pr-4 text-ink-body">A keccak256 fingerprint of each attestation&apos;s content</td>
                                <td className="py-2 text-ink-body">The attestation&apos;s actual evidence content</td>
                            </tr>
                            <tr>
                                <td className="py-2 pr-4 text-ink-body">The 32-byte hash of the encrypted delivery blob</td>
                                <td className="py-2 text-ink-body">The delivery address itself (name, street, door number) &mdash; encrypted end-to-end per order, purged when the tab closes or the order/process resolves</td>
                            </tr>
                            <tr>
                                <td className="py-2 pr-4 text-ink-body">&mdash;</td>
                                <td className="py-2 text-ink-body">Geohashes on published profiles/agreements, capped at six characters (roughly 1.2 km); door-level precision only inside the encrypted per-order envelope</td>
                            </tr>
                        </tbody>
                    </table>
                </div>
                <p className="text-base text-ink-body leading-relaxed">
                    The honest limits. Wallet addresses and on-chain activity are public and linkable by anyone &mdash; this is pseudonymity, not anonymity, and the graph of which addresses transacted, and when, is visible to everyone. Unpinning stops your node from serving content and lets the network garbage-collect it, but anything another node copied before you unpinned it is beyond your recall &mdash; unpin is not a network-wide delete. And there is no privacy policy or terms of service here, by design rather than omission: those are the documents of a service with an operator in the middle, and this frontend is a reader of network state with no accounts and no operator-side services &mdash; there is no counterparty to contract with. Where a trade itself needs consent terms, that is an agreement concern: an assembly composes a consent clause and affixes its document to the deal.
                </p>
            </MarketingSection>

            <MarketingSection title="Who owns Figaro?" sectionId="ownership">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    No one owns the protocol, though a few things around it are held. The code is released under the MIT license &mdash; anyone can copy all of it, run it, and change it, including running a different rewards program or none at all. Nothing about the protocol depends on this site continuing to exist.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    This site&apos;s app is one interface, not the protocol. The seam between the protocol and its presentation is deliberate: the registries live on-chain, and any developer can build their own interface against the same ones. Because there is no fee anywhere in the kernel, an interface captures no value from the deals that flow through it &mdash; the value lives in the use of the shared registries. And because participants hold their own data, the usual platform business model &mdash; monetizing the people who use it &mdash; is structurally unavailable here; there is no user data to sell.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    What is actually held comes down to two things. A trademark on the name, so it points at one protocol rather than being borrowed to mislead. And a token allocation &mdash; a share of the florins. What a florin is worth is a market question, settled by whoever trades one; this project makes no claim about it. Neither holding is a lever over anyone&apos;s deal: no holding controls settlement, and nothing about either can reach into a lockbox.
                </p>
            </MarketingSection>

            <MarketingSection title="What if you lose your keys?" sectionId="keys">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Key loss is a wallet concern, not a protocol concern &mdash; with one sharp qualifier. The kernel verifies every commitment signature by ECDSA recovery, so a buyer or seller is always an externally-owned account: a Safe or other contract wallet cannot hold the role directly. The durable posture is decided before you commit: keep the key in hardware-grade custody, and set up a recovery path on the account in advance. On Ethereum today that path is a feature called EIP-7702 &mdash; it lets you authorise, ahead of time, a backup way to act for your account, so that if the key is lost you can still close out your active deals from the same address. Figaro inherits whatever your account provides; it adds no recovery surface and removes none.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    The kernel has no recovery path of any kind. New commitments always require a fresh signature from the party&apos;s key &mdash; lose the key and no one can produce one, not Figaro, not a court order, not a software update. Resolution differs in exactly one way: it is authorized by the buyer&apos;s <em>address</em>, not a fresh signature. A buyer who pre-installed an EIP-7702 delegation before losing the key can still trigger resolution from that address and settle every active process; a buyer who didn&apos;t leaves the bonds locked, permanently. This is the explicit accepted risk of the no-escape-hatch posture: the same property that prevents anyone from stealing funds also prevents anyone from recovering them. Plan key custody before you commit tokens to an active process.
                </p>
            </MarketingSection>

            <MarketingSection title="Can software run a wallet here?" sectionId="agents">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Yes, and nothing about the mechanism changes because of it. FigaroCore checks a valid ECDSA signature from an externally-owned account, and the check has no field for what produced it &mdash; so a program that signs for itself is a party here on exactly the terms a person is. What that leaves to be named is what the wallet stands for and who is holding its key on that thing&apos;s behalf: three layers &mdash; asset, wallet, operator &mdash; set out on <Link href="/agents" className="text-ink-heading font-medium hover:underline">Agents</Link>.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    The caveat is the one that applies to any wallet: the mechanism verifies a signature, not an identity. It cannot tell you whether the operator behind an address is what its profile claims, human or software &mdash; that assurance, where it exists, comes from the credentials a clause binds and checks against their issuing authority, not from the kernel. And the word carries two senses, only one of which exists here. The operator <em>of a wallet</em> is whoever holds that one wallet&apos;s signing key &mdash; a person or a program, one participant among equals, and that is the sense used here and on Agents. The operator <em>of a platform</em> is the company that runs the venue two strangers meet in and takes a cut for standing between them &mdash; the sense Figaro has none of, since there is no venue in the middle to run.
                </p>
            </MarketingSection>

            <MarketingSection title="Has the code been audited?" sectionId="verification">
                <p className="text-base text-ink-body leading-relaxed">
                    Not yet by an external auditor &mdash; and the full answer lives on its own page: the verification stack (six independent benches), the external-audit posture, and how to verify any deal yourself are on <Link href="/security" className="text-ink-heading font-medium hover:underline">Security</Link>. Results will be published there when they exist.
                </p>
            </MarketingSection>

            <MarketingSection title="Can this website lie about what you're signing?" sectionId="signing">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Not about a deal that already exists. FigaroCore checks both parties&apos; signatures itself, on-chain, against a record that carries the whole agreement as a single fingerprint &mdash; one hash over every section of it. Once a commitment is on-chain, nothing in the settlement path ever asks a website what the deal said, so no site &mdash; this one included &mdash; can restate it afterwards.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    The gap is the moment just before. Your wallet shows you 32 bytes; the readable deal &mdash; the price, the terms, who does what &mdash; sits on a page. A page that has been tampered with can display one document and ask your wallet to bind the fingerprint of a different one, and nothing downstream catches it: from the chain&apos;s point of view you agreed to exactly what you signed. The check has to come from somewhere the page cannot reach, and today that means developer tools: a cloned repository, a built SDK, Node on your machine, not something a buyer or seller has installed by default. If nobody runs one of the two checks below, the screen is being trusted, full stop.
                </p>
                <ul className="space-y-3 text-base text-ink-body mb-5 ml-6">
                    <li>&mdash; <strong className="text-ink-heading font-medium">Before you sign &mdash; recompute the fingerprint on your own machine.</strong> <code>scripts/verify-signed-agreement.mjs</code> takes two files: the document the page showed you, and the payload your wallet showed you. It prints what each section&apos;s hash covers, recomputes the fingerprint from the SDK&apos;s own primitives, and returns MATCH or MISMATCH &mdash; plus, if you hand it the signatures, whether each address really signed. Inflate the payment tenfold in the displayed document and it returns MISMATCH and <em>&ldquo;Do not sign.&rdquo;</em> Nothing of ours is in the loop: it reads your two files and calls the library. The recipe, with the four primitives it calls, is in the <a href="https://github.com/figaro-protocol/Figaro/blob/main/sdk/README.md" target="_blank" rel="noopener noreferrer" className="text-ink-heading font-medium hover:underline">SDK README</a>.</li>
                    <li>&mdash; <strong className="text-ink-heading font-medium">Afterwards &mdash; check the signatures against the chain.</strong> The process audit page reports, order by order, whether the buyer&apos;s and the seller&apos;s signature really recovers to the address that order names. It reads them out of the commit transaction&apos;s own calldata, where the signature bytes actually live &mdash; the public event carries the deal but not the signatures. No wallet and no permission: anyone holding a process ID can look, including at someone else&apos;s deal. <Link href="/audit" className="text-ink-heading font-medium hover:underline">Verify any deal yourself</Link>.</li>
                </ul>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    These are detectors you run, not protection that runs for you. Neither one stops a doctored prompt; they let you catch one &mdash; the first before you sign, the second afterwards and by anybody.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    The definitive answer &mdash; a verifiable build, where no single origin&apos;s word is required &mdash; is the Security page&apos;s subject.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    And what is not fixed: the hash in your wallet, rather than the deal in words. That is the kernel&apos;s doing and it is staying. The signed record binds the agreement by fingerprint, and the kernel has no upgrade key &mdash; a friendlier prompt would cost a kernel someone can change, and every other property described on this page depends on there being no such person. That same fingerprint-binding is what lets both checks above run outside our reach.
                </p>
            </MarketingSection>

            <MarketingSection title="Who can shut this down or freeze your funds?" sectionId="shutdown">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    No one. FigaroCore has no admin, no owner, no pause function, no upgrade key, no governance with discretionary power over funds. The kernel does not contain code that any address can call to halt settlement, blacklist a participant, or move tokens it does not have a signed commitment against. There is nothing to capture because there is no privileged role to hold.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    The exposure that remains is the underlying chain. If Ethereum itself halts, settlement halts &mdash; that risk is external to Figaro and shared with every other Ethereum protocol. Inside Figaro, no party can halt the kernel; the property is called <em>no escape hatches</em>, and the protocol&apos;s security argument depends on it. Removing it would mean a different protocol with different guarantees.
                </p>
            </MarketingSection>

            <MarketingSection title="What if one participant in a multi-party process fails?" sectionId="multi-party">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Multi-party processes resolve atomically &mdash; either every commitment in the process settles together or none of them does. Each seller is bonded against the cumulative value flowing through them, so a participant who fails to perform has their own bond at risk. Those two facts &mdash; a bond at risk at every link, and nobody paid until the buyer closes &mdash; are what is proved, and what they give every co-seller is a live, bonded interest in seeing one seller&apos;s fault put right: a reason, not a guarantee. Whether anyone acts on it is theirs to decide; the protocol neither compels it nor predicts it. That pressure &mdash; arising from the bond architecture rather than from any platform&apos;s enforcement &mdash; is what the protocol calls its social mechanism, and it resembles the joint liability of a community-bound lending circle without a shared community, repeated interaction, or an outside punisher to supply it.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    If the process genuinely cannot complete &mdash; an upstream contributor disappears, no co-seller can take their place, the work is impossible &mdash; the buyer still holds the resolution key. Bonds stay locked until the buyer signs &mdash; why resolution is assigned that way, and what stalling costs the buyer, is derived on <Link href="/kernel" className="text-ink-heading font-medium hover:underline">Kernel</Link>.
                </p>
            </MarketingSection>

            <MarketingSection title="Can someone hijack your registration or clause?" sectionId="builders-registries">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Clause, seller, and assembly anchoring is permissionless and first-write-wins. Once an identifier is bound to a registry &mdash; a clauseId, a member profile, an assembly&apos;s composition hash &mdash; the binding is immutable: no admin can rebind it, no later registrant can displace it. On the direct attestation path the chain validates no content shape &mdash; it merkle-binds each attestation to its signed agreement and content-hash-binds the evidence. The batched, proof-based settlement path adds a content check: a generic SP1 proof engine re-validates each clause against the exact spec the <code>ClauseRegistry</code> anchors, so a permissive substitute cannot settle. Either way there are no per-clause validator contracts &mdash; any registered clause is attestable and settleable with zero on-chain code changes.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    All three registries &mdash; <code>ClauseRegistry</code>, <code>AssemblyRegistry</code>, and <code>MembersRegistry</code> &mdash; are anchored by the same anti-spam mechanism: a reclaimable ETH deposit &mdash; staked intent, not a fee. No admin can seize it; withdrawing reclaims the exact amount and de-surfaces the registration (readers hide what no longer carries a live stake), so polluting a registry costs deposit &times; the time it stayed surfaced. The amount is set per deployment &mdash; read it with <code>registrationDeposit()</code> on the registry you are registering against, never from a remembered constant.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    What a withdrawal leaves behind differs by family. A clause&apos;s or an assembly&apos;s binding is permanent &mdash; agreements already committed against it must keep resolving forever &mdash; so only the stake and the surfacing move, in a single call with no waiting. A participant registration is keyed to a wallet instead, and leaving clears it: a clause or an assembly is a permanent published record; a participant is a live identity.
                </p>
                <RegistryLifecycleFigure className="my-8" />
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    The participant case is why there is a cooldown. De-listing is immediate, but the ETH releases only after a delay fixed at deployment and published on-chain before anyone pays it &mdash; without the delay, a single deposit could be walked through one identity after another, and a stake you can reclaim the instant you have used it prices nothing. Coming back costs a second deposit; a released deposit is claimable by its owner alone, with nobody&apos;s permission.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    For authors, the cost is permanence: a registered clauseId cannot be mutated. The remediation path for a flawed clause is to register a corrected one &mdash; a different clause, with its own id and its own hash. Nothing links the two: the flawed clause stays registered and keeps doing whatever it does, designers point their assemblies at the corrected one deliberately, and agreements already committed against the old one keep resolving. The discipline this asks of authors is the same as the discipline of publishing a kernel: ship the result you can defend, not the result you can patch.
                </p>
            </MarketingSection>

            <MarketingSection title="What can you show a regulator or an auditor?" sectionId="demonstrating">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    The record &mdash; which is usually the thing being asked for. Using a protocol changes none of your obligations; what it changes is the cost of demonstrating you met them. Three cases the shipped <Link href="/clauses" className="text-ink-heading font-medium hover:underline">clauses</Link> already cover:
                </p>
                <ul className="space-y-3 text-base text-ink-body mb-5 ml-6">
                    <li>&mdash; <strong className="text-ink-heading font-medium">Consent, for the GDPR.</strong> A consent clause affixes each document &mdash; terms, a privacy notice, a data-processing agreement &mdash; at design time by its keccak256 hash, its version, and its title; the parties&apos; signatures over the agreement root that includes it <em>are</em> the acceptance, so there is no separate ceremony to reconstruct afterwards. Who accepted which version of which document, and when, is recoverable from the commitment itself &mdash; the record a controller has to be able to produce. The residual: that is evidence of acceptance, not a lawful basis. Purpose limitation, data minimisation, and handling a withdrawal stay yours to run; the clause is append-only, so a withdrawal is an off-chain process, never a content edit.</li>
                    <li>&mdash; <strong className="text-ink-heading font-medium">Emissions, for ESG reporting.</strong> An emissions clause names the accounting methodology the seller reports under &mdash; the GHG Protocol, ISO 14064, PAS 2050, EN 16258, or one you write &mdash; and the measured figure is filed against that order as an attestation, with a correction filed as a later attestation readers weigh for themselves &mdash; per-order data under a named methodology, which is what an emissions report consumes. The residual: the protocol validates no standard and takes no closed list of them, stores no scope 1/2/3 classification (scope is relative to a reporting boundary, so a reader derives it from its own position in the chain), and does not check whether the figure is true. Offset retirement is outside the protocol entirely.</li>
                    <li>&mdash; <strong className="text-ink-heading font-medium">Deal facts, for e-invoicing.</strong> The European standard for electronic invoicing (EN 16931) wants a structured set of facts: who supplied whom, what was delivered, in what amounts, in which currency, on what date, against which agreement. A settled process carries all of them on the public record, line by line, each line&apos;s own agreement bound by fingerprint. The residual: the protocol emits no invoice in that format and files nothing for you. Mapping the record into whatever form your jurisdiction requires is your own step &mdash; the point is that it is a mapping rather than a reconstruction.</li>
                </ul>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    The pattern is the same in all three: the obligation stays with the party who has it, and what the record removes is the part where you have to be believed. Nothing here makes a deployment compliant &mdash; compliance is a property of you and how you run it &mdash; and nothing on this site is legal or tax advice.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    One boundary sits underneath all three, and it is the thinnest joint in the whole arrangement. Everything the record says about the physical world &mdash; a hand-off, an arrival, a temperature reading, a measured figure &mdash; enters it as a claim signed by a party, never as the world itself. No fingerprint checks a fact. What stands behind such a claim is economic and social rather than cryptographic: the party signing it has twice the value at its own link staked for as long as the process is open, and nobody is paid until the buyer closes, so a co-seller who spots a fault has their own reason to see it put right first. Where a harder check than that is wanted, it is composed in at design time &mdash; an independent inspection taking its own bonded leg of the deal, a credential register named in the clause &mdash; rather than supplied by the protocol.
                </p>
            </MarketingSection>

            <MarketingSection title="Gas, tokens, and tax." sectionId="compatibility">
                <p className="text-base text-ink-body leading-relaxed mb-6">
                    Five operational facts worth knowing before you commit. What you need in hand before a first deal is short: a wallet, some ETH for the gas each step costs, and enough of the token the deal settles in to cover your own side of it &mdash; payment plus stake as a buyer, twice the value at your link as a seller &mdash; and if what you hold is a different token, a swap composes as the on-ramp, in the same transaction as the commit.
                </p>
                <ul className="space-y-6">
                    <LabelledListRow label="Tax and law" labelWidth="wide" uppercase>
                        <strong className="text-ink-heading font-medium">A trade here is still an ordinary trade.</strong> The same income, sales-tax/VAT, and consumer-law treatment as any direct trade in your jurisdiction. The runtime carries the fiscal limb that helps you meet them: after settlement a paid seller splits its own receipts onward in one transaction, and the fiscal trail falls out of the chain record as a byproduct (<Link href="/composition" className="text-ink-heading font-medium hover:underline">how that composes</Link>). Nothing on this site is legal or tax advice.
                    </LabelledListRow>
                    <LabelledListRow label="Gas ceilings" labelWidth="wide" uppercase>
                        <strong className="text-ink-heading font-medium">Two separate gas constraints govern a process.</strong> <em>Resolution</em> settles every order in one transaction, so it caps process size. On Ethereum that cap is about 1,240 orders &mdash; ~23k gas each against the 30M block limit. <em>Commit</em> is per-transaction (~144k gas for a sub-order, ~235k for the process root), so a block lands about 200 commits and a 1,200-order process needs roughly 6 blocks to assemble. A single commit or resolution costs cents to a few dollars at typical network prices &mdash; the figure moves with the network&apos;s gas price, not with anything Figaro sets or charges. Keep the two currencies apart: gas is the network&apos;s own charge for running the step and is paid in ETH, while the deal itself &mdash; payment and both stakes &mdash; settles in whichever ERC-20 the parties chose, and nothing is taken out of either. Both numbers are chain-specific and rise with a chain&apos;s block gas limit. Large coordinations compose across processes rather than pushing one process toward either ceiling.
                    </LabelledListRow>
                    <LabelledListRow label="Fee-on-transfer" labelWidth="wide" uppercase>
                        <strong className="text-ink-heading font-medium">Fee-on-transfer tokens are rejected.</strong> If the ERC-20 you pay with takes a percentage on transfer, FigaroCore refuses the commit &mdash; the bond arithmetic depends on the kernel receiving exactly what was committed. Pay in a non-rebasing, non-fee-on-transfer token.
                    </LabelledListRow>
                    <LabelledListRow label="One currency" labelWidth="wide" uppercase>
                        <strong className="text-ink-heading font-medium">Single settlement currency per process.</strong> A process cannot mix ERC-20s &mdash; the 2:1 bond ratio is a same-unit comparison, and an oracle or DEX dependency would reintroduce a trusted actor. Multi-token behavior composes as parallel processes in different currencies, never within one.
                    </LabelledListRow>
                    <LabelledListRow label="Token volatility" labelWidth="wide" uppercase>
                        <strong className="text-ink-heading font-medium">The parties pick the settlement token, and its behaviour comes with it.</strong> A volatile ERC-20 moves the payment and both stakes together &mdash; the 2:1 ratio between them is fixed by the kernel, but what any of them is worth measured in anything else is not, and a deal that stays open for days carries that movement for its whole duration. A stablecoin narrows the exposure to whatever that stablecoin&apos;s own peg is worth. Nothing in the protocol quotes, hedges, or converts; nothing on this site is financial advice.
                    </LabelledListRow>
                </ul>
            </MarketingSection>

        </>
    );
}
