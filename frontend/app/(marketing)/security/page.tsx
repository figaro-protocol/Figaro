import type { Metadata } from "next";
import Link from "next/link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingSection } from "@/components/marketing/MarketingSection";

export const metadata: Metadata = {
    title: "Security — Figaro Protocol",
    description:
        "Plain-language answers to the security questions you should ask before sending tokens through Figaro. What the protocol guarantees, what it does not, and how the guarantees are verified.",
};

export default function Security() {
    return (
        <>
            <MarketingHero
                title="Security."
                lead={
                    <>
                        Plain-language answers to the security questions you should ask before sending tokens through a protocol you didn&apos;t write. Each section names a concern, states what the protocol guarantees, and names the residual risk honestly &mdash; if the answer has a caveat, the caveat is in the same paragraph as the guarantee.
                    </>
                }
            />

            <MarketingSection title="Who holds the tokens?" sectionId="custody">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    No one. When a buyer and seller commit to a process, the payment and both bonds move into <em>FigaroCore</em> &mdash; the kernel contract &mdash; and stay there until the buyer signs the atomic resolution that releases them. There is no custodian, no escrow account, no platform balance sheet, no off-chain ledger reconciling who is owed what.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    FigaroCore has no owner. No address can withdraw funds it does not have a signed commitment against. The only paths out are the resolution the buyer signs and the bond release the seller earns by performing &mdash; both encoded in the contract, both auditable on-chain. The caveat is that contracts are code, and code can have bugs. What has been done about that is in <Link href="#verification" className="text-ink-heading font-medium hover:underline">§6</Link>.
                </p>
            </MarketingSection>

            <MarketingSection title="What if the counterparty doesn't deliver?" sectionId="counterparty">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    The bond architecture answers this before it becomes a recourse problem. Each party posts more than they could gain by defecting. The buyer locks twice the payment; the seller locks twice the cumulative value flowing through them. The arithmetic makes cooperation the strategy that weakly dominates defection for both parties &mdash; a result called the bonding equilibrium. Cooperation is the unique strategy profile surviving iterated elimination of weakly dominated strategies, derivable from the 2:1 ratio alone, with no reliance on reputation, repeated interaction, or external enforcement.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    In practice this means shortfalls are put right <em>before</em> settlement, not compensated after it. Nothing resolves until the buyer resolves, and the buyer resolves only once the agreed terms are met &mdash; so a missed or defective delivery is normally remade, resent, or otherwise remedied first. There is no refund path and no unilateral unwind; the buyer&apos;s sole lever is to withhold the close, which keeps every stake locked until the work is set right.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    The equilibrium is about losses, not zero-loss. A counterparty willing to burn their bond can still grief you. The defense is the magnitude: they will lose twice what you lose, every time. For the formal derivation see <Link href="/cryptoeconomics" className="text-ink-heading font-medium hover:underline">cryptoeconomics</Link>.
                </p>
            </MarketingSection>

            <MarketingSection title="What if you genuinely disagree?" sectionId="disputes">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Three layers, in order. First, the bond architecture &mdash; the 2:1 ratio pushes most disagreements toward cooperative resolution before they become disputes, because the cost of defection is visible to both sides. Second, in multi-party processes, atomic resolution means the buyer holds a single resolution key for the entire process; co-sellers have material reason to coordinate rather than let the resolution fail. Third, every commitment, attestation, and resolution event is timestamped on-chain. The on-chain record is tamper-proof evidence, available for courts, arbitration providers, or any institution the parties had agreed to default to.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    The caveat is honest: there is no on-chain verdict. The protocol does not adjudicate. Disagreements that exhaust the first two layers go to whatever off-chain forum the parties chose &mdash; Figaro contributes evidence, not a ruling. The dispute layer is provider-agnostic by design; the kernel takes no position on which forum a community uses. Kleros is wired today; the full external-composition catalogue &mdash; forums, and everything else the kernel deliberately leaves outside itself &mdash; is on <Link href="/composes" className="text-ink-heading font-medium hover:underline">Composes</Link>.
                </p>
            </MarketingSection>

            <MarketingSection title="What stands behind a deal?" sectionId="layers">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Five things, each a reason the deal goes right, stacked from the inside out. The bonds behind them are not a fund anyone draws on and not property anyone seizes &mdash; they are deterrents, and the innermost layers do almost all the work. The outer layers exist only for the residue the inner ones cannot reach.
                </p>
                <ul className="space-y-3 text-base text-ink-body mb-5 ml-6">
                    <li>&mdash; <strong className="text-ink-heading font-medium">The chain.</strong> The deal runs on Ethereum. Once its record is written, no one can rewrite it &mdash; not a counterparty, not Figaro, not the party who wrote it.</li>
                    <li>&mdash; <strong className="text-ink-heading font-medium">The lockbox and its record.</strong> FigaroCore holds both sides&apos; doubled stakes by fixed rule, and writes an unforgeable, timestamped record of every step as it happens &mdash; always, not on request. Nothing leaves the lockbox until the buyer signs the close.</li>
                    <li>&mdash; <strong className="text-ink-heading font-medium">The other sellers.</strong> Settlement is all-or-nothing: no one is paid until the buyer confirms the whole deal. So everyone bonded into it has their own stake-backed reason to help set right whatever went wrong, before there is anything to dispute.</li>
                    <li>&mdash; <strong className="text-ink-heading font-medium">Arbitration.</strong> A forum the parties chose &mdash; Kleros is one, an online arbitration service that juries disputes using the record &mdash; can weigh the record from outside the deal.</li>
                    <li>&mdash; <strong className="text-ink-heading font-medium">Ordinary courts.</strong> Always available, whether or not the agreement names a forum. The record is evidence any legal system can read. Naming a forum in the agreement is a matter of clarity, never a limit on recourse.</li>
                </ul>
                <p className="text-base text-ink-body leading-relaxed">
                    The outer two layers act on the record from outside the deal; neither can reach into the lockbox. That is the point of the no-escape-hatch design &mdash; the same wall that keeps anyone from prying the stakes out also keeps every step legible to whoever reads the record later.
                </p>
            </MarketingSection>

            <MarketingSection title="What if you lose your keys?" sectionId="keys">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Key loss is a wallet concern, not a protocol concern &mdash; with one sharp qualifier. The kernel verifies every commitment signature by ECDSA recovery, so a buyer or seller is always an externally-owned account: a Safe or other contract wallet cannot hold the role directly. The durable posture is decided before you commit: keep the key in hardware-grade custody, and set up a recovery path on the account in advance. On Ethereum today that path is a feature called EIP-7702 &mdash; it lets you authorise, ahead of time, a backup way to act for your account, so that if the key is lost you can still close out your active deals from the same address. Figaro inherits whatever your account provides; it adds no recovery surface and removes none.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    The caveat is sharp. The kernel has no recovery path of any kind. New commitments always require a fresh signature from the party&apos;s key &mdash; lose the key and no one can produce one, not Figaro, not a court order, not a software update. Resolution differs in exactly one way: it is authorized by the buyer&apos;s <em>address</em>, not a fresh signature. A buyer who pre-installed an EIP-7702 delegation before losing the key can still trigger resolution from that address and settle every active process; a buyer who didn&apos;t leaves the bonds locked, permanently. This is the explicit accepted risk of the no-escape-hatch posture: the same property that prevents anyone from stealing funds also prevents anyone from recovering them. Plan key custody before you commit tokens to an active process.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    In plain terms: before your first deal, set up your wallet&apos;s recovery. That means two things done while nothing is at stake. Store the key the way you would store the deed to a house &mdash; offline, backed up, shared with no one. And turn on the recovery path described above (EIP-7702), so that a backup you control can still close out your active deals from the same address if the key is ever lost. That one step is the difference between a lost key that locks out only the key, and a lost key that leaves your bonds locked for good. Figaro cannot add it for you afterward, and neither can anyone else &mdash; which is why it belongs before the first deal, not after a problem.
                </p>
            </MarketingSection>

            <MarketingSection title="What does the network learn about you?" sectionId="privacy">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Almost nothing. The kernel stores fingerprints, not content &mdash; the hashes of the agreements, and the keccak256 of each attestation&apos;s content, never the content itself. Everything a person might recognise as personal data stays off-chain, encrypted, held where the parties can erase it. This is the pattern the European Data Protection Board recommends for blockchains in its Guidelines 02/2025 &mdash; keep personal data off the ledger, store it off-chain under crypto-shredding, make pinned content erasable, and minimise any location data that is published. Figaro implements that pattern. It does not call itself &ldquo;compliant&rdquo;: compliance is a property of a deployment and the party running it, not of the code.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Underneath the concrete measures is a choice the protocol hands to every deal. Because the chain records only a fingerprint of a deal&apos;s terms &mdash; a keccak256 hash &mdash; and never the terms themselves, each term can be shared or held back without changing what the ledger keeps. Terms meant to coordinate &mdash; a locality, a standard, a unit of account, the kind of thing that lets a network be navigated at all &mdash; are published in the open, a shared commons anyone can read and build on. Terms that are sensitive &mdash; a price, a name, a specification worth keeping &mdash; are published only behind the fingerprint: encrypted, or carried in a form that proves the term was agreed to without revealing what it says. Either way the chain sees only the hash, and a private term&apos;s readable text never lands on the public, permanent ledger. The encrypted delivery address below is one application of the same spirit &mdash; you show only what you choose, and the network holds the rest as a fingerprint no one can read backward.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Concretely, on this build today:
                </p>
                <ul className="space-y-3 text-base text-ink-body mb-5 ml-6">
                    <li>&mdash; <strong className="text-ink-heading font-medium">Delivery addresses are encrypted end-to-end.</strong> A name, street, and door number travel encrypted per order between exactly the two parties to that order &mdash; per-order ephemeral ECDH key exchange, AES-256-GCM. The chain anchors only a 32-byte hash of the encrypted blob; the ciphertext never reaches calldata. The keys live in your browser session and are purged when the tab closes and when the order or process resolves. After that purge no one &mdash; including the two parties &mdash; can recover the plaintext. That is crypto-shredding, not access control.</li>
                    <li>&mdash; <strong className="text-ink-heading font-medium">Public location is capped at neighborhood precision.</strong> Geohashes on published profiles and agreements carry at most six characters &mdash; roughly a 1.2 km cell. Door-level precision exists only inside the encrypted per-order envelope, never in anything published.</li>
                    <li>&mdash; <strong className="text-ink-heading font-medium">What you publish, you can erase.</strong> Profiles, catalogues, and evidence bundles are pinned to IPFS; every supersede or withdraw unpins the prior content, and the audit-evidence PDF carries an explicit unpin control.</li>
                    <li>&mdash; <strong className="text-ink-heading font-medium">The infrastructure is yours.</strong> RPC and IPFS endpoints are runtime settings you control, under Endpoints. What you publish is pinned on your node, paid for by you, and erasable by you; the build-baked defaults are only defaults.</li>
                    <li>&mdash; <strong className="text-ink-heading font-medium">Device location stays on the device.</strong> Your location is encoded to a geohash locally in the browser. A typed address goes straight from your browser to OpenStreetMap&apos;s Nominatim geocoder &mdash; a third party, and configurable under Endpoints &mdash; only when you take an explicit action, and that is disclosed at the input. No server of this frontend&apos;s sits in between; it has none.</li>
                </ul>
                <p className="text-base text-ink-body leading-relaxed">
                    The honest limits. Wallet addresses and on-chain activity are public and linkable by anyone &mdash; this is pseudonymity, not anonymity; the fingerprints reveal no content, but the graph of which addresses transacted, and when, is visible to everyone. Unpinning stops your node from serving content and lets the network garbage-collect it, but anything another node copied before you unpinned it is beyond your recall &mdash; unpin is not a network-wide delete. And there is no privacy policy or terms of service here, by design rather than omission: those are the documents of a service with an operator in the middle, and this frontend is a reader of network state with no accounts and no operator-side services &mdash; there is no counterparty to contract with. Where a trade itself needs consent terms, that is an agreement concern: an assembly composes a consent clause and affixes its document to the deal.
                </p>
            </MarketingSection>

            <MarketingSection title="Has the code been audited?" sectionId="verification">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Not yet by an external auditor. That is the honest answer, and the protocol does not call itself release-ready until that audit lands. The Solidity surface was frozen for external audit on 20 April 2026 (with subsequent amendments scoped to the freeze); external audit decision and scheduling is one of two named release blockers.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    What is in place is a verification stack &mdash; six independent tools targeting the same kernel from different angles:
                </p>
                <ul className="space-y-2 text-base text-ink-body mb-5 ml-6">
                    <li>&mdash; <strong className="text-ink-heading font-medium">Foundry</strong>: unit + integration suite, 0 failed.</li>
                    <li>&mdash; <strong className="text-ink-heading font-medium">Halmos</strong>: symbolic execution proves 7 properties of the kernel exhaustively.</li>
                    <li>&mdash; <strong className="text-ink-heading font-medium">Certora</strong>: formal verification of CVL specs covering bond conservation, atomic resolution, and authorization.</li>
                    <li>&mdash; <strong className="text-ink-heading font-medium">TLA+</strong>: model-checking of the kernel and florin-token state machines.</li>
                    <li>&mdash; <strong className="text-ink-heading font-medium">Echidna</strong>: property-based fuzzing of the kernel and the florin token.</li>
                    <li>&mdash; <strong className="text-ink-heading font-medium">Mythril</strong>: symbolic execution for common vulnerability classes.</li>
                </ul>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Verification is not a substitute for external audit. It is a precondition. The protocol&apos;s position is that an audit should examine a surface that has already been pushed against from this many directions &mdash; not a surface arriving to it raw. The current contract inventory and verification map are at <Link href="/spec" className="text-ink-heading font-medium hover:underline">spec</Link>.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    The same legibility extends to every live deal. A process&apos;s full record &mdash; its timeline, financials, clause evidence, and the hashes that bind them to the signed agreements &mdash; is readable by anyone who holds the process ID, connected wallet or none. What that record can and cannot tell you about the <em>moment you signed</em> is a separate question, answered <Link href="#signing" className="text-ink-heading font-medium hover:underline">directly below</Link>.
                </p>
            </MarketingSection>

            <MarketingSection title="Can this website lie about what you're signing?" sectionId="signing">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Not about a deal that already exists. FigaroCore checks both parties&apos; signatures itself, on-chain, against a record that carries the whole agreement as a single fingerprint &mdash; one hash over every section of it. Once a commitment is on-chain, what was agreed is fixed by arithmetic: nothing in the settlement path ever asks a website what the deal said, so no site &mdash; this one included &mdash; can restate it afterwards.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    The gap is the moment just before. Your wallet shows you 32 bytes; the readable deal &mdash; the price, the terms, who does what &mdash; sits on a page. A page that has been tampered with can display one document and ask your wallet to bind the fingerprint of a different one, and nothing downstream catches it: from the chain&apos;s point of view you agreed to exactly what you signed. The answer is not to trust the page harder. It is to check it from somewhere the page cannot reach. Two checks do that, and both are yours to run:
                </p>
                <ul className="space-y-3 text-base text-ink-body mb-5 ml-6">
                    <li>&mdash; <strong className="text-ink-heading font-medium">Before you sign &mdash; recompute the fingerprint on your own machine.</strong> <code>scripts/verify-signed-agreement.mjs</code> takes two files: the document the page showed you, and the payload your wallet showed you. It prints what each section&apos;s hash covers, recomputes the fingerprint from the SDK&apos;s own primitives, and returns MATCH or MISMATCH &mdash; plus, if you hand it the signatures, whether each address really signed. On a genuine order it reports MATCH; on the same order with the payment inflated tenfold in the displayed document, MISMATCH and <em>&ldquo;Do not sign.&rdquo;</em> Nothing of ours is in the loop &mdash; it reads your two files and calls the library. It costs a repository clone, a built SDK, and Node on your machine; the recipe, with the four primitives it calls, is on <Link href="/integrate" className="text-ink-heading font-medium hover:underline">integrate</Link>.</li>
                    <li>&mdash; <strong className="text-ink-heading font-medium">Afterwards &mdash; check the signatures against the chain.</strong> The process audit page reports, order by order, whether the buyer&apos;s and the seller&apos;s signature really recovers to the address that order names. It reads them out of the commit transaction&apos;s own calldata, where the signature bytes actually live &mdash; the public event carries the deal but not the signatures. No wallet and no permission: anyone holding a process ID can look, including at someone else&apos;s deal. <Link href="/audit" className="text-ink-heading font-medium hover:underline">Verify any deal yourself</Link>.</li>
                </ul>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Be exact about what these are: detectors you run, not protection that runs for you. Neither one stops a doctored prompt; they let you catch one &mdash; the first before you sign, the second afterwards and by anybody. If nobody runs them, the screen is being trusted.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    And what is not fixed: your wallet still shows a hash, not the deal in words. That is the kernel&apos;s doing and it is staying. The signed record binds the agreement by fingerprint, and the kernel has no upgrade key &mdash; a friendlier prompt would cost a kernel someone can change, and every other property described on this page depends on there being no such person. It is also precisely that fingerprint-binding which lets both checks above run outside our reach: a hash anyone can recompute without us is worth more than a prettier prompt you have to take our word for.
                </p>
            </MarketingSection>

            <MarketingSection title="Who can shut this down or freeze your funds?" sectionId="shutdown">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    No one. FigaroCore has no admin, no owner, no pause function, no upgrade key, no governance with discretionary power over funds. The kernel does not contain code that any address can call to halt settlement, blacklist a participant, or move tokens it does not have a signed commitment against. There is nothing to capture because there is no privileged role to hold.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    The caveat is the underlying chain. If Ethereum itself halts, settlement halts &mdash; that risk is external to Figaro and shared with every other Ethereum protocol. Inside Figaro, no party can halt the kernel; the property is called <em>no escape hatches</em>, and the protocol&apos;s security argument depends on it. Removing it would mean a different protocol with different guarantees.
                </p>
            </MarketingSection>

            <MarketingSection title="Who owns Figaro?" sectionId="ownership">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    No one owns the protocol; a few things around it are held, and it is worth being exact about which. The code is released under the MIT license &mdash; anyone can copy all of it, run it, and change it, including running a different rewards program or none at all. Nothing about the protocol depends on this site continuing to exist.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    This site&apos;s app is one interface, not the protocol. The seam between the protocol and its presentation is deliberate: the registries live on-chain, and any developer can build their own interface against the same ones. Because there is no fee anywhere in the kernel, an interface captures no value from the deals that flow through it &mdash; the value lives in the use of the shared registries, not in any single window onto them. And because participants hold their own data, the usual platform business model &mdash; monetizing the people who use it &mdash; is structurally unavailable here; there is no user data to sell.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    What is actually held comes down to two things. A trademark on the name, so it points at one protocol rather than being borrowed to mislead. And a token allocation &mdash; a share of the florins &mdash; whose worth depends entirely on whether the network is used, and on nothing else. Neither is a lever over anyone&apos;s deal: no holding controls settlement, and nothing about either can reach into a lockbox.
                </p>
            </MarketingSection>

            <MarketingSection title="What if one participant in a multi-party process fails?" sectionId="multi-party">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Multi-party processes resolve atomically &mdash; either every commitment in the process settles together or none of them does. Each seller is bonded against the cumulative value flowing through them, so a participant who fails to perform has their own bond at risk, and the participants downstream have material reason to coordinate before resolution. The phenomenon &mdash; peer pressure across co-sellers, emerging from bond architecture rather than from any platform&apos;s enforcement &mdash; is described as the protocol&apos;s social mechanism. It reproduces the joint-liability behavior of community-bound lending circles without requiring a shared community, repeated interaction, or exogenous punishment.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    The caveat: if the process genuinely cannot complete &mdash; an upstream contributor disappears, no co-seller can take their place, the work is impossible &mdash; the buyer still holds the resolution key. Bonds stay locked until the buyer signs. The asymmetry is intentional: the party who initiated the process and is paying for it is the party who decides when it is finished.
                </p>
            </MarketingSection>

            <MarketingSection title="Can someone hijack a clause or seller slot?" sectionId="builders-registries">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Clause, seller, and assembly anchoring is permissionless and first-write-wins. Once an identifier is bound to a registry &mdash; a clauseId, a member profile, an assembly slug &mdash; the binding is immutable: no admin can rebind it, no later registrant can displace it. On the direct attestation path the chain validates no content shape &mdash; it merkle-binds each attestation to its signed agreement and content-hash-binds the evidence. The batched, proof-based settlement path adds a content check: a generic SP1 proof engine re-validates each clause against the exact spec the <code>ClauseRegistry</code> anchors, so a permissive substitute cannot settle. Either way there are no per-clause validator contracts &mdash; any registered clause is attestable and settleable with zero on-chain code changes.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    All three artifact families are anchored by the same anti-spam mechanism: a reclaimable ETH deposit &mdash; staked intent, not a fee. No admin can seize it; the registrant reclaims the exact amount by withdrawing, which de-surfaces the artifact (readers hide what no longer carries a live stake), so polluting a registry costs deposit &times; the time it stayed surfaced. The deposit amount is set per deployment &mdash; the protocol fixes the mechanism, not the number. Two asymmetries follow from what a withdrawal leaves behind. A clause&apos;s clauseId binding and an assembly&apos;s composition binding are permanent &mdash; never cleared on withdraw &mdash; because agreements already committed against them must keep resolving forever; only the stake and the discovery surfacing move, in a single call with no waiting. A participant registration is keyed to a wallet instead, and leaving clears it, freeing that address to register again straight away: a clause or an assembly is a permanent published artifact, a participant is a live, wallet-keyed identity. That second case is the one that needs a cooldown. Leaving the participant registry takes effect at once &mdash; you are de-listed, and you may come back the same minute &mdash; but the ETH is released only after a set delay. Without it, a single deposit could be walked through one identity after another, and a stake you can reclaim the instant you have used it prices nothing. Coming back costs a second deposit. The delay is fixed at deployment, published on-chain before anyone pays it, and afterwards the deposit is claimable by its owner alone, with nobody&apos;s permission.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    The caveat for authors: a registered clauseId is permanent &mdash; its spec cannot be mutated. The remediation path for a flawed clause is to register v2 under a new clauseId; the v1 keeps doing whatever it does, and anyone already using it stays on it until they migrate. The discipline this asks of authors is the same as the discipline of publishing a kernel: ship the result you can defend, not the result you can patch.
                </p>
            </MarketingSection>

            <MarketingSection title="What else you should know." sectionId="compatibility">
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    Three operational facts that aren&apos;t vulnerabilities but are worth knowing before you commit to the protocol.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    <strong className="text-ink-heading font-medium">Gas ceilings per process.</strong> Two separate gas constraints govern a process. <em>Resolution</em> settles every order in a single transaction, so its per-call gas cost gates the per-process size: at Ethereum mainnet&apos;s 30M block gas limit, roughly 1,240 orders (~23k gas per order, measured all-in on transaction receipts). <em>Commit</em> is the other constraint &mdash; each commit is its own transaction (~144k gas for a sub-order, ~235k for the process root), so a single block can land about 200 commits and a 1,200-order process needs roughly 6 blocks to assemble before it can resolve. Both numbers are chain-specific; a chain with a higher block gas limit raises both proportionally. Large coordinations should compose across processes &mdash; the kernel supports this structurally &mdash; rather than push a single process toward either ceiling.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-5">
                    <strong className="text-ink-heading font-medium">Fee-on-transfer tokens are rejected.</strong> If the ERC-20 you intend to pay with &mdash; the common standard for tokens on Ethereum &mdash; takes a percentage on transfer, FigaroCore refuses the commit. This is intentional: the bond arithmetic depends on the kernel receiving exactly what was committed. Pay in a non-rebasing, non-fee-on-transfer token.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    <strong className="text-ink-heading font-medium">Single settlement currency per process.</strong> A process cannot mix ERC-20s &mdash; the 2:1 bond ratio is a same-unit comparison, and an oracle or DEX dependency would reintroduce a trusted actor. Multi-token behavior is achievable through composition (parallel processes in different currencies), not within one process.
                </p>
            </MarketingSection>

            <MarketingSection title="More on the protocol" bottomPad="wide">
                <ul className="space-y-3 text-base">
                    <li>
                        <Link href="/protocol" className="text-ink-heading font-medium hover:underline">
                            Protocol
                        </Link>
                        <span className="text-ink-body"> &mdash; how the mechanism works: bonded commitments, buyer dominance, twice-the-deal collateral, atomic settlement.</span>
                    </li>
                    <li>
                        <Link href="/cryptoeconomics" className="text-ink-heading font-medium hover:underline">
                            Cryptoeconomics
                        </Link>
                        <span className="text-ink-body"> &mdash; the bonding equilibrium, the weakest-link subgame, the social mechanism &mdash; with the formal derivations and the eight-discipline reading.</span>
                    </li>
                    <li>
                        <Link href="/spec" className="text-ink-heading font-medium hover:underline">
                            Specifications
                        </Link>
                        <span className="text-ink-body"> &mdash; the on-chain contract surface, with source links and verification status.</span>
                    </li>
                    <li>
                        <Link href="/why" className="text-ink-heading font-medium hover:underline">
                            Why
                        </Link>
                        <span className="text-ink-body"> &mdash; the rule-making lineage Figaro sits in: coercion, cognition, crypto.</span>
                    </li>
                </ul>
            </MarketingSection>
        </>
    );
}
