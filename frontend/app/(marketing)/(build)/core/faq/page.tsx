import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import Link from "@/components/shared/Link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingSection } from "@/components/marketing/MarketingSection";
import { LayeredDefenseFigure } from "@/components/figures/LayeredDefenseFigure";
import { LabelledListRow } from "@/components/shared/LabelledListRow";
import { KERNEL_EQUILIBRIUM } from "@figaro-protocol/sdk";

// The equilibrium's figures have one owner (sdk/src/equilibrium.json); this page
// renders any it states from the module, never retypes them, and links /kernel
// for the mechanism itself (scripts/lint-equilibrium-owner.sh).
const EQ = KERNEL_EQUILIBRIUM;

export const metadata: Metadata = withOg({
    title: "Core FAQ — Figaro Protocol",
    description:
        "Answers about the Core and what stands beside it: what is frozen, the only two calls, where it is deployed, what has been verified and what has not, and what batch resolution changes.",
});

const QUESTIONS: { id: string; title: string }[] = [
    { id: "verification", title: "Has the code been audited?" },
    { id: "shutdown", title: "Who can shut this down or freeze your funds?" },
    { id: "layers", title: "What stands behind a trade?" },
    { id: "custody", title: "Who holds the tokens?" },
    { id: "escrow", title: "Is this escrow?" },
    { id: "counterparty", title: "What if the counterparty doesn't deliver?" },
    { id: "unresolved", title: "What if the buyer never resolves?" },
    { id: "disputes", title: "What if you genuinely disagree?" },
    { id: "multi-party", title: "What if one participant in a multi-party process fails?" },
    { id: "privacy", title: "What does the network learn about you?" },
    { id: "keys", title: "What if you lose your keys?" },
    { id: "signing", title: "Can this website lie about what you're signing?" },
    { id: "demonstrating", title: "What can you show a regulator or an auditor?" },
    { id: "frozen", title: "What exactly is frozen?" },
    { id: "two-calls", title: "What are the only two calls?" },
    { id: "deployments", title: "Where is it deployed?" },
    { id: "verified", title: "What has been verified, and what has not?" },
    { id: "batch", title: "What does batch resolution change?" },
    { id: "compatibility", title: "Gas, tokens, and tax." },
];

export default function Faq() {
    return (
        <>
            <MarketingHero
                title="Core FAQ."
                lead={
                    <>
                        Answers about the Core. Each states a fact of the contracts and points at the page that owns it.
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
                    Audit in progress. The full answer lives on its own page: the verification stack (seven independent benches) and the external-audit posture are on <Link href="/security" className="text-ink-heading font-medium hover:underline">Security</Link>. How to verify any trade yourself is the two checks under <Link href="#signing" className="text-ink-heading font-medium hover:underline">signing</Link>, below. The audit&apos;s results will be published on Security when they exist.
                </p>
            </MarketingSection>

            <MarketingSection title="Who can shut this down or freeze your funds?" sectionId="shutdown">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    No one. FigaroCore is decentralized and permissionless, with no governance holding discretionary power over tokens. The Core does not contain code that any address can call to halt resolution, blacklist a participant, or move tokens it does not have a signed commitment against. There is nothing to capture because there is no privileged role to hold. A token is a different object from the Core. A token whose own contract lets its issuer freeze addresses stays freezable by that issuer, inside a process or outside one. That is a property of the token the parties chose, never of the Core.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    The exposure that remains is the underlying chain. If the chain itself halts, resolution halts &mdash; that risk is external to Figaro and shared with every other protocol on that chain. Inside Figaro, no party can halt the Core; the property is called <em>no escape hatches</em>, and the protocol&apos;s security argument depends on it. Removing it would mean a different protocol with different guarantees.
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
                    <li>&mdash; <strong className="text-ink-heading font-medium">Arbitration.</strong> A forum the parties chose &mdash; Kleros is one, an online arbitration service that juries disputes using the data &mdash; weighs that data from outside the trade. It is not the old platform in new clothes: it is a venue you and your counterparty picked, rather than one imposed on you. It rules on data it cannot alter. It can neither reach into the smart contract nor close the trade, and that is exactly the authority a platform had and a forum does not.</li>
                    <li>&mdash; <strong className="text-ink-heading font-medium">Ordinary courts.</strong> Always available, whether or not the agreement names a forum. The data is evidence any legal system can read. Naming a forum in the agreement is a matter of clarity, never a limit on recourse.</li>
                </ul>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    The outer two layers act on the data from outside the trade; neither can reach into the smart contract. That is the point of the no-escape-hatch design. The same wall that keeps anyone from prying the bonds out also keeps every step legible to whoever reads the data later.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    A court judgment does not need to reach into the smart contract to work. It is enforced the way any ordinary judgment is: against the losing party&apos;s <em>other</em> assets, through the court&apos;s own powers of seizure, garnishment, or contempt. The smart contract stays sealed the whole time. What the on-chain data buys is speed. A timestamped, tamper-proof account of exactly what was agreed, and of what was or was not delivered, is the kind of evidence that gets a judgment quickly. Without it, the case is a slow trial over whose word to believe.
                </p>
            </MarketingSection>

            <MarketingSection title="Who holds the tokens?" sectionId="custody">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    No one. When a buyer and seller commit to a process, both bonds move into <em>FigaroCore</em>, the Core contract. The buyer&apos;s bond carries the payment inside it. Both stay there until the buyer signs the atomic resolution that releases them. The tokens sit in one smart contract, and the only thing that moves them is the resolution the buyer signs.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    FigaroCore is decentralized and permissionless. No address can withdraw tokens it does not have a signed commitment against. The only path out is the resolution the buyer signs &mdash; one call that pays every seller and refunds every bond, encoded in the smart contract and auditable on-chain. Smart contracts are code, and code can have bugs. What has been done about that is set out under <Link href="#verified" className="text-ink-heading font-medium hover:underline">verification</Link>, below.
                </p>
            </MarketingSection>

            <MarketingSection title="Is this escrow?" sectionId="escrow">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    No. The difference is who decides. In the arrangement you have in mind, a third party holds the value and rules on whether the condition was met. You are trusting its judgment, its solvency, and its willingness to answer the phone. Nothing occupies that seat here. FigaroCore holds both bonds by fixed rule, the payment carried inside the buyer&apos;s. It has no opinion about the trade. It cannot inspect the work, cannot take a side, and cannot release anything except along the paths the two parties signed for. Each side&apos;s bond is its own deterrent, never a pot the other side can win; how each is sized, and why walking away never pays, is on <Link href="/kernel" className="text-ink-heading font-medium hover:underline">Mechanism</Link>. Every decision in a trade is a person&apos;s: made before both of you sign &mdash; what, with whom, on which terms &mdash; or made after by the one key that closes it. The smart contract decides nothing; it only counts.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    What follows from that is worth reading before you commit rather than after. There is no payment-network reversal path, by design: either one would be a third party able to undo a resolved commitment, which is precisely the seat this design leaves empty. The lever is the resolution itself. Nobody is paid until the buyer resolves, so a shortfall is put right <em>before</em> resolution. At that point every party still has its own bond riding on the outcome. That is what makes putting it right the seller&apos;s cheapest move, and the co-sellers&apos; too (<Link href="#layers" className="text-ink-heading font-medium hover:underline">the five layers</Link> behind that). Resolution is terminal acceptance: once the buyer signs it, the process is resolved and nothing inside the protocol reopens it.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    The residual is what this asks of the buyer that a third party in the middle asks of nobody. You have to look at the work and decide, and do it while your own bond is locked. Resolve without checking and you have accepted what arrived. Never resolve at all and every bond stays locked, your own included. The property that stops anyone reaching into a trade from outside is the same property that offers no way out of one.
                </p>
            </MarketingSection>

            <MarketingSection title="What if the counterparty doesn't deliver?" sectionId="counterparty">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Each party has more locked than it could gain by walking away. Once the work is delivered, resolving is the buyer&apos;s best move whatever the seller is like; with that fixed, delivering is the seller&apos;s. That is a Nash equilibrium, not a promise; <Link href="/kernel" className="text-ink-heading font-medium hover:underline">Mechanism</Link> works it through with the numbers. A shortfall is put right <em>before</em> resolution, because the payment does not come back on its own. It is talked out wherever the two of you talk; each order carries its own encrypted channel. The buyer&apos;s lever is to withhold the resolution until the work is set right. You can also look before you commit. A seller&apos;s resolved processes and the bond it currently holds live are both readable from the chain by anyone. What you are reading is a declaration you check for yourself, never a score this protocol issues, ranks, or could take away.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    The equilibrium bounds losses; it does not eliminate them. A counterparty willing to burn their bond can still grief you. The defense is arithmetic: whoever walks away is out of pocket even after counting everything they kept, and nothing either side abandoned ever reaches the other. For the formal derivation see the <Link href="/working-groups" className="text-ink-heading font-medium hover:underline">papers</Link>. What a bond secures is performance of the trade, never what follows from it. A delivery that later causes harm beyond its price is weighed by the outer layers behind a trade, an arbitration forum or the ordinary courts, as it was before.
                </p>
            </MarketingSection>

            <MarketingSection title="What if the buyer never resolves?" sectionId="unresolved">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Nothing moves until the buyer resolves: no payment transfers, no bond is refunded &mdash; the buyer&apos;s included. The payments it withholds sit inside its own bond, beyond everyone&apos;s reach, and once the work is delivered leaving the process open costs the buyer more than closing it (<Link href="/kernel#refusals" className="text-ink-heading font-medium hover:underline">Mechanism</Link>).
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Your move comes before that signature. Put right any shortfall. Attest what you delivered, under a clause the agreement carries, so it is evidence, not a later claim. Take it to the forum the agreement names: it rules on the data you both hold, and its ruling is enforced against what the buyer holds outside the process. Your co-sellers&apos; bonds ride on that same resolution; they want it closed too.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    What a process nobody ever resolves strands is everything committed to it. That is the buyer&apos;s bond, twice the payment with the payment carried inside it, and each seller&apos;s bond, twice the cumulative value through its own order. All of it is in the one token the process is denominated in, reaching no one, permanently. Nothing was spent ahead of the ending, because payment moves only at resolution. What stays locked is what each party posted as its own deterrent. The Core has no operation that reaches any of it.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    The residual: a buyer willing to leave its whole bond, twice the payment, locked for good can deny you yours. Keeping what you delivered, it is out of pocket by {EQ.example.outcomes_plain.buyer_out_of_pocket_after_delivery}. Nothing on chain reaches in. That is the price of no escape hatch, and why a remedy comes before resolution, not after. The full treatment is in <Link href="/papers/external-events" className="text-ink-heading font-medium hover:underline">External events</Link>.
                </p>
            </MarketingSection>

            <MarketingSection title="What if you genuinely disagree?" sectionId="disputes">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Then five layers stand behind the trade, and the answer under <Link href="#layers" className="text-ink-heading font-medium hover:underline">what stands behind a trade</Link>, above, walks all five with the figure. What this answer owns is the honest caveat underneath them.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    But start with what the arithmetic is built to do to the question. While the bonds are locked, performing, then resolving, is each side&apos;s best answer to the other (<Link href="#counterparty" className="text-ink-heading font-medium hover:underline">the counterparty answer</Link> links the mechanism). So the ordinary ending of a disagreement is a remedy the parties agree between themselves, before resolution, with both deterrents still in force. A dispute is the exception the deterrent failed to dissolve. That is why dispute resolution lives at the edge of the design rather than at its center: not because disagreement is ignored, but because the mechanism is built to starve it. The Core itself forgives nothing. Anything with the power to release a party from what it committed to is a seat worth capturing. So forgiveness lives in three places: with the parties before resolution, in a forum&apos;s ruling they carry into a remedy there, and in the protections someone composes above the Core.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    There is no on-chain verdict, and there will not be one. The protocol does not adjudicate. Disagreements that exhaust the first three layers go to whatever off-chain forum the parties chose &mdash; Figaro contributes evidence, not a ruling. The dispute layer is provider-agnostic by design; the Core takes no position on which forum a community uses. A Kleros clause is published, so composing that forum into an assembly is a design-time choice a designer makes &mdash; and any other forum composes the same way. The full external-composition catalog &mdash; forums, and everything else the Core deliberately leaves outside itself &mdash; is on <Link href="/composition" className="text-ink-heading font-medium hover:underline">Composition</Link>.
                </p>
            </MarketingSection>

            <MarketingSection title="What if one participant in a multi-party process fails?" sectionId="multi-party">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Multi-party processes resolve atomically &mdash; either every commitment in the process resolves together or none of them does. Each seller is bonded against the cumulative value flowing through them, so a participant who fails to perform has their own bond at risk. Those two facts are what is proved: a bond at risk at every link, and nobody paid until the buyer resolves. What they give every co-seller is a live, bonded interest in seeing one seller&apos;s fault put right. It is a reason, not a guarantee. Whether anyone acts on it is theirs to decide; the protocol neither compels it nor predicts it. That pressure arises from the bond architecture, not from any platform&apos;s enforcement, and the protocol calls it its social mechanism. It resembles the joint liability of a community-bound lending circle. It does so without a shared community, repeated interaction, or an outside punisher to supply it.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    The same two facts are why there is one resolution at the end rather than a payment at each handoff as the work passes along. A handoff paid on the spot ends that seller&apos;s interest in what happens afterwards, and that interest is the whole of the social mechanism. Nobody is paid until the buyer resolves, so every co-seller keeps a live, bonded reason to see a fault put right while the process is still open. Paying locally would also break one trade into separate processes, each with its own data, and no forum, auditor, or court reading them later could tell that they were one trade.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    If the process genuinely cannot complete &mdash; an upstream contributor disappears, no co-seller can take their place, the work is impossible &mdash; the buyer still holds the resolution key. Bonds stay locked until the buyer signs. Why resolution is assigned that way, and what stalling costs the buyer, is derived on <Link href="/kernel#refusals" className="text-ink-heading font-medium hover:underline">Mechanism</Link>.
                </p>
            </MarketingSection>

            <MarketingSection title="What does the network learn about you?" sectionId="privacy">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Almost nothing. The Core stores fingerprints, never content &mdash; the hashes of the agreements, and the keccak256 of each attestation&apos;s content. Everything a person might recognize as personal data stays off-chain, encrypted, held where the parties can erase it. The European Data Protection Board&apos;s Guidelines 02/2025 lay out what that looks like for a blockchain. Their pattern is to keep personal data off the ledger, store it off-chain under crypto-shredding, make pinned content erasable, and minimize any location data that is published. Figaro implements that pattern, and does not call itself &ldquo;compliant&rdquo; &mdash; compliance is a property of a deployment and the party running it, not of the code.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Each trade also chooses, term by term, what it publishes to the open commons and what it seals behind the fingerprint &mdash; the full story of that choice is on <Link href="/data" className="text-ink-heading font-medium hover:underline">Data</Link>.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Concretely, on this build today:
                </p>
                <ul className="space-y-3 text-base text-ink-body mb-5 ml-6">
                    <li>&mdash; <strong className="text-ink-heading font-medium">Delivery addresses are encrypted end-to-end.</strong> A name, street, and door number travel encrypted per order between exactly the two parties to that order &mdash; per-order ephemeral ECDH key exchange, AES-256-GCM. The chain anchors only a 32-byte hash of the encrypted blob; the ciphertext never reaches calldata. The keys live in your browser session and are purged when the tab closes and when the order or process resolves. After that purge no one &mdash; including the two parties &mdash; can recover the plaintext. That is crypto-shredding, not access control.</li>
                    <li>&mdash; <strong className="text-ink-heading font-medium">Public location is capped at neighborhood precision.</strong> Geohashes on published profiles and agreements carry at most six characters &mdash; roughly a 1.2 km cell. Door-level precision exists only inside the encrypted per-order envelope, never in anything published.</li>
                    <li>&mdash; <strong className="text-ink-heading font-medium">What you publish, you can erase.</strong> Profiles, catalogs, and evidence bundles are pinned to IPFS; every supersede or withdraw unpins the prior content, and the audit-evidence PDF carries an explicit unpin control.</li>
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
                    The honest limits. Wallet addresses and on-chain activity are public and linkable by anyone. This is pseudonymity, not anonymity. The graph of which addresses transacted, and when, is visible to everyone. Unpinning stops your node from serving content and lets the network garbage-collect it. Anything another node copied before you unpinned it is beyond your recall: unpin is not a network-wide delete. And there is no privacy policy or terms of service here, by design rather than omission. Those are the documents of a service with an operator in the middle. This frontend is a reader of network state, with no accounts and no operator-side services, so there is no counterparty to contract with. Where a trade itself needs consent terms, that is an agreement concern: an assembly composes a consent clause and affixes its document to the trade.
                </p>
            </MarketingSection>

            <MarketingSection title="What if you lose your keys?" sectionId="keys">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Key loss is a wallet concern, not a protocol concern &mdash; with one sharp qualifier. The Core verifies every commitment signature by ECDSA recovery, so a buyer or seller is always an externally-owned account: a Safe or other contract wallet cannot hold the role directly. The durable posture is decided before you commit: keep the key in hardware-grade keeping, and set up a recovery path on the account in advance. On a chain that has adopted EIP-7702, that path is a delegation. It lets you authorize, ahead of time, a backup way to act for your account. If the key is lost, you can still close out your active trades from the same address. Figaro inherits whatever your account provides; it adds no recovery surface and removes none.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    The Core has no recovery path of any kind. New commitments always require a fresh signature from the party&apos;s key. Lose the key and no one can produce one: not Figaro, not a court order, not a software update. Resolution differs in exactly one way: it is authorized by the buyer&apos;s <em>address</em>, not a fresh signature. A buyer who pre-installed an EIP-7702 delegation before losing the key can still trigger resolution from that address and resolve every active process. A buyer who didn&apos;t leaves the bonds locked, permanently. This is the explicit accepted risk of the no-escape-hatch posture: the same property that prevents anyone from stealing tokens also prevents anyone from recovering them. Plan for key loss before you commit tokens to an active process.
                </p>
                <p className="text-base text-ink-body leading-relaxed mt-5 mb-3">How to set it up, before your first order:</p>
                <ol className="list-decimal pl-6 space-y-2 text-base text-ink-body leading-relaxed">
                    <li>Use a wallet that can install an EIP-7702 delegation on your address and lets you name a recovery authorization for it. That authorization can be a second key, a guardian set, or a hardware device you hold separately. The wallet&apos;s own documentation is the authority on its steps; Figaro reads only the address.</li>
                    <li>Install the delegation while you still hold the key. It cannot be added after the key is lost, and no commitment you sign afterwards depends on it &mdash; only resolution does.</li>
                    <li>Keep the signing key itself in hardware-grade keeping, and keep the recovery authorization somewhere the same accident cannot reach.</li>
                    <li>Rehearse it once with a small order: sign, commit, then resolve through the recovery path instead of the key. If that works, an active process can always be closed from your address.</li>
                </ol>
            </MarketingSection>

            <MarketingSection title="Can this website lie about what you're signing?" sectionId="signing">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Not about a trade that already exists. FigaroCore checks both parties&apos; signatures itself, on-chain, against chain data that carries the whole agreement as a single fingerprint &mdash; one hash over every section of it. Once a commitment is on-chain, nothing in the resolution path ever asks a website what the trade said, so no site &mdash; this one included &mdash; can restate it afterwards.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    The gap is the moment just before. Your wallet shows you 32 bytes; the readable trade &mdash; the price, the terms, who does what &mdash; sits on a page. A page that has been tampered with can display one document and ask your wallet to bind the fingerprint of a different one. Nothing downstream catches it: from the chain&apos;s point of view, you agreed to exactly what you signed. The check has to come from somewhere the page cannot reach. Today that means developer tools: a cloned repository, a built SDK, Node on your machine. A buyer or seller does not have these installed by default. If nobody runs one of the two checks below, the screen is being trusted, full stop.
                </p>
                <ul className="space-y-3 text-base text-ink-body mb-5 ml-6">
                    <li>&mdash; <strong className="text-ink-heading font-medium">Before you sign &mdash; recompute the fingerprint on your own machine.</strong> <code>scripts/verify-signed-agreement.mjs</code> takes two files: the document the page showed you, and the payload your wallet showed you. It prints what each section&apos;s hash covers, recomputes the fingerprint from the SDK&apos;s own primitives, and returns MATCH or MISMATCH. If you hand it the signatures, it also reports whether each address really signed. Inflate the payment tenfold in the displayed document and it returns MISMATCH and <em>&ldquo;Do not sign.&rdquo;</em> Nothing of this project&apos;s is in the loop: it reads your two files and calls the library. The recipe, with the four primitives it calls, is in the <a href="https://github.com/figaro-protocol/Figaro/blob/main/sdk/README.md" target="_blank" rel="noopener noreferrer" className="text-ink-heading font-medium hover:underline">SDK README</a>.</li>
                    <li>&mdash; <strong className="text-ink-heading font-medium">Afterwards &mdash; check the signatures against the chain.</strong> The process audit page reports, order by order, whether the buyer&apos;s and the seller&apos;s signature really recovers to the address that order names. It reads them out of the commit transaction&apos;s own calldata, where the signature bytes actually live &mdash; the public event carries the trade but not the signatures. No wallet and no permission: anyone holding a process ID can look, including at someone else&apos;s trade. <Link href="/audit" className="text-ink-heading font-medium hover:underline">Verify any trade yourself</Link>.</li>
                </ul>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    These are detectors you run, not protection that runs for you. Neither one stops a doctored prompt; they let you catch one &mdash; the first before you sign, the second afterwards and by anybody.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    And what is not fixed: the hash in your wallet, rather than the trade in words. That is the Core&apos;s doing and it is staying. The signed commitment binds the agreement by fingerprint, and the Core has no upgrade key. A friendlier prompt would cost a Core someone can change. Every other property described on this page depends on there being no such person. That same fingerprint-binding is what lets both checks above run outside this project&apos;s reach.
                </p>
            </MarketingSection>

            <MarketingSection title="What can you show a regulator or an auditor?" sectionId="demonstrating">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    The data &mdash; which is usually the thing being asked for. Using a protocol changes none of your obligations; what it changes is the cost of demonstrating you met them. Three cases the shipped <Link href="/clauses" className="text-ink-heading font-medium hover:underline">clauses</Link> already cover:
                </p>
                <ul className="space-y-3 text-base text-ink-body mb-5 ml-6">
                    <li>&mdash; <strong className="text-ink-heading font-medium">Consent, for the GDPR.</strong> A consent clause affixes each document at design time by its keccak256 hash, its version, and its title. The document can be terms, a privacy notice, or a data-processing agreement. The parties&apos; signatures over the agreement root that includes it <em>are</em> the acceptance, so there is no separate ceremony to reconstruct afterwards. Who accepted which version of which document, and when, is recoverable from the commitment itself &mdash; the data a controller has to be able to produce. The residual: that is evidence of acceptance, not a lawful basis. Purpose limitation, data minimization, and handling a withdrawal stay yours to run; the clause is append-only, so a withdrawal is an off-chain process, never a content edit.</li>
                    <li>&mdash; <strong className="text-ink-heading font-medium">Emissions, for ESG reporting.</strong> An emissions clause names the accounting methodology the seller reports under: the GHG Protocol, ISO 14064, PAS 2050, EN 16258, or one you write. The measured figure is filed against that order as an attestation. A correction is filed as a later attestation, which readers weigh for themselves. The result is per-order data under a named methodology, which is what an emissions report consumes. The residual: the protocol validates no standard and takes no closed list of them. It stores no scope 1/2/3 classification, because scope is relative to a reporting boundary; a reader derives it from its own position in the chain. It does not check whether the figure is true. Offset retirement is outside the protocol entirely.</li>
                    <li>&mdash; <strong className="text-ink-heading font-medium">Trade facts, for e-invoicing.</strong> The European standard for electronic invoicing (EN 16931) wants a structured set of facts: who supplied whom, what was delivered, in what amounts, in which currency, on what date, against which agreement. A resolved process carries all of them in the public data, line by line, each line&apos;s own agreement bound by fingerprint. The residual: the protocol emits no invoice in that format and files nothing for you. Mapping the data into whatever form your jurisdiction requires is your own step &mdash; the point is that it is a mapping rather than a reconstruction.</li>
                </ul>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    The pattern is the same in all three: the obligation stays with the party who has it, and what the data removes is the part where you have to be believed. Nothing here makes a deployment compliant &mdash; compliance is a property of you and how you run it.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    One boundary sits underneath all three, and it is the thinnest joint in the whole arrangement. Everything the data says about the physical world &mdash; a handoff, an arrival, a temperature reading, a measured figure &mdash; enters it as a claim signed by a party, never as the world itself. No fingerprint checks a fact. What stands behind such a claim is economic and social rather than cryptographic. The party signing it has twice the value at its own link bonded for as long as the process is open. Nobody is paid until the buyer resolves, so a co-seller who spots a fault has their own reason to see it put right first. Where a harder check than that is wanted, it is composed in at design time rather than supplied by the protocol. An independent inspection can take its own bonded leg of the trade, or the clause can name a credential register. The data layer names four boundaries for what stands behind a row. Protocol-enforced is what the Core itself enforced. Institution-declared is what a party declared and the protocol never validated. Protocol-derived is what is anchored on chain, with the content behind the fingerprint held off it. Composition-derived is what a composed venue&apos;s own events carry. A third party reading the books, such as a lender, an insurer, or a court, reads the boundary of each row with it. Parties acting together can emit perfectly formed books for a service never rendered.
                </p>
            </MarketingSection>

            <MarketingSection title="What exactly is frozen?" sectionId="frozen">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    While the audit stands, every contract the audit reviews: the four Core contracts, the registries, the usage counter, the reward minter, the florin token, the swap coordinator, and the batch path&apos;s Rust. Only comments change until the auditors&apos; findings are closed.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    Once deployed, a contract is what it is: no admin, no upgrade path, no pause. A change is a new contract at a new address, deployed beside the old one.
                </p>
            </MarketingSection>

            <MarketingSection title="What are the only two calls?" sectionId="two-calls">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Commit and resolve. Nothing else changes FigaroCore&apos;s state.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Commit refuses a signed order past its deadline, and a missing or wrong signature from either party. It also refuses a zero payment, a cumulative value that does not match, a fee-on-transfer token, and a second currency in one process.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    Resolve refuses anyone but the buyer, an incomplete order list, and a process already resolved. The full surface is in the <a href="/docs/protocol/contracts/" className="text-ink-heading font-medium hover:underline">builder documentation</a>.
                </p>
            </MarketingSection>

            <MarketingSection title="Where is it deployed?" sectionId="deployments">
                <p className="text-base text-ink-body leading-relaxed">
                    The address of every contract, per network, is in the deployment record in the repository and in the <a href="/docs/protocol/contracts/" className="text-ink-heading font-medium hover:underline">builder documentation</a>. Read addresses from there, never from a remembered constant.
                </p>
            </MarketingSection>

            <MarketingSection title="What has been verified, and what has not?" sectionId="verified">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Unit and fuzz tests, symbolic execution, formal specification checking, and a machine-checked proof of the equilibrium. Each bench and what it reaches is on <Link href="/security" className="text-ink-heading font-medium hover:underline">Security</Link>.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    The external audit is in progress; the results will be published there when they exist.
                </p>
            </MarketingSection>

            <MarketingSection title="What does batch resolution change?" sectionId="batch">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    A separate contract resolves many orders under one proof. It shares no state with FigaroCore and never calls it.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    FigaroCore&apos;s rules do not change. A process resolved on the batch path has its record in the verifier, and the proof re-checks every clause against the spec the registry anchors.
                </p>
            </MarketingSection>

            <MarketingSection title="Gas, tokens, and tax." sectionId="compatibility">
                <p className="text-base text-ink-body leading-relaxed mb-6">
                    Five operational facts worth knowing before you commit. What you need in hand before a first trade is short. It is a wallet, some ETH for the gas each step costs, and enough of the token the trade resolves in to cover your own side of it. Your side is twice the payment as a buyer, and twice the value at your link as a seller. If what you hold is a different token, a swap composes as the on-ramp, in the same transaction as the commit.
                </p>
                <ul className="space-y-6">
                    <LabelledListRow label="Tax and law" labelWidth="wide" uppercase>
                        <strong className="text-ink-heading font-medium">A trade here is still an ordinary trade.</strong> The same income, sales-tax/VAT, and consumer-law treatment as any direct trade in your jurisdiction. The runtime carries the fiscal limb that helps you meet them. After resolution, a paid seller splits its own receipts onward in one transaction. The fiscal trail falls out of the chain data as a byproduct (<Link href="/composition" className="text-ink-heading font-medium hover:underline">how that composes</Link>).
                    </LabelledListRow>
                    <LabelledListRow label="Gas ceilings" labelWidth="wide" uppercase>
                        <strong className="text-ink-heading font-medium">Two separate gas constraints govern a process.</strong> <em>Resolution</em> pays every order in one transaction, so it caps process size. Under a 30M-gas block that cap is about 950 orders. That is ~30k gas per order plus a fixed ~73k overhead, held to 95% of the 30M block limit, measured on live post-fork receipts. <em>Commit</em> is per-transaction (~382k gas for a sub-order, ~794k for the process root), so a block lands about 74 commits and a 900-order process needs roughly 13 blocks to assemble. A single commit or resolution costs cents to a few dollars at typical network prices. The figure moves with the network&apos;s gas price, not with anything Figaro sets or charges. Keep the two currencies apart. Gas is the network&apos;s own charge for running the step, and is paid in ETH. The trade itself, both bonds with the payment carried inside the buyer&apos;s, resolves in whichever ERC-20 the parties chose. Nothing is taken out of either. Both numbers are chain-specific and rise with a chain&apos;s block gas limit. The SDK reads the live limit, never a stored constant, so the same arithmetic under a 200M-gas block resolves about 6,330 orders in one call. Large coordinations compose across processes rather than pushing one process toward either ceiling.
                    </LabelledListRow>
                    <LabelledListRow label="Fee-on-transfer" labelWidth="wide" uppercase>
                        <strong className="text-ink-heading font-medium">Fee-on-transfer tokens are rejected.</strong> If the ERC-20 you pay with takes a percentage on transfer, FigaroCore refuses the commit &mdash; the bond arithmetic depends on the Core receiving exactly what was committed. Pay in a non-rebasing, non-fee-on-transfer token.
                    </LabelledListRow>
                    <LabelledListRow label="One currency" labelWidth="wide" uppercase>
                        <strong className="text-ink-heading font-medium">One denomination per process.</strong> A process cannot mix ERC-20s &mdash; the 2:1 bond ratio is a same-unit comparison, and an oracle or DEX dependency would reintroduce a trusted actor. Multi-token behavior composes as parallel processes in different currencies, never within one.
                    </LabelledListRow>
                    <LabelledListRow label="Token volatility" labelWidth="wide" uppercase>
                        <strong className="text-ink-heading font-medium">The parties pick the denomination, and its behavior comes with it.</strong> A volatile ERC-20 moves both bonds together, the payment carried inside the buyer&apos;s. The 2:1 ratio between them is fixed by the Core. What any of them is worth measured in anything else is not. A trade that stays open for days carries that movement for its whole duration. A stablecoin narrows the exposure to whatever that stablecoin&apos;s own peg is worth. Nothing in the protocol quotes, hedges, or converts; nothing on this site is financial advice.
                    </LabelledListRow>
                </ul>
            </MarketingSection>
        </>
    );
}
