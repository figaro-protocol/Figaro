import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
    title: "About — Figaro Protocol",
    description: "Figaro is a permissionless, ownerless coordination protocol for self-enforcing agreements between strangers. Chain-agnostic; deployable on any EVM network.",
};

export default function About() {
    return (
        <>
            <section className="container mx-auto px-6 pt-24 pb-12 max-w-3xl">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-4">
                    About
                </p>
                <h1 className="text-5xl font-bold text-black leading-tight tracking-tight mb-6">
                    The factotum of the network.
                </h1>
                <p className="text-xl text-gray-600 leading-relaxed max-w-2xl">
                    Figaro is a coordination protocol. Not DeFi. Not TradFi. It is a primitive for enforcing bilateral agreements — closer to TCP/IP than to a bank or a DEX.
                </p>
            </section>

            <section className="container mx-auto px-6 pb-12 max-w-3xl border-t border-gray-200 pt-12">
                <h2 className="text-2xl font-bold text-black mb-4">The name</h2>
                <p className="text-base text-gray-700 leading-relaxed mb-4">
                    Figaro is the factotum of the city. In Rossini&apos;s <em>Il Barbiere di Siviglia</em> (1816, libretto by Sterbini, drawn from Beaumarchais&apos;s <em>Le Barbier de Séville</em>, 1775), the character declares himself the city&apos;s factotum in the &ldquo;Largo al factotum&rdquo; aria &mdash; running errands, brokering favors, mediating between parties of incommensurable standing, making commerce of the whole household work without owning any of it.
                </p>
                <p className="text-base text-gray-700 leading-relaxed mb-4">
                    The kernel is named for what it does: the factotum of the network, the coordinator of everything without being the owner of anything. <code>FigaroCore</code> holds collateral, executes commitments, and discharges resolution — exactly the coordination function the character performs, at protocol scale.
                </p>
                <p className="text-base text-gray-700 leading-relaxed">
                    The naming dates to Figaro-Original (Genovese &amp; Daliana, March 2022). <strong>FIG</strong> is a speech-act identifier, the way ETH, BTC, USDC, and USD are — the name participants converge on when invoking the token in transactions and conversation. See{" "}
                    <a href="https://github.com/figaro-protocol/Figaro-Prototype2/blob/main/docs/v5/VISION.md#appendix-project-lineage" target="_blank" rel="noopener noreferrer" className="underline">VISION.md &quot;Appendix: Project Lineage&quot;</a>{" "}
                    for the lineage.
                </p>
            </section>

            <section className="container mx-auto px-6 pb-12 max-w-3xl border-t border-gray-200 pt-12">
                <h2 className="text-2xl font-bold text-black mb-4">Three tiers</h2>
                <dl className="space-y-4 text-sm">
                    <div>
                        <dt className="text-base font-semibold text-black">Kernel</dt>
                        <dd className="text-gray-700 leading-relaxed mt-1"><code>FigaroCore</code>. The irreducible settlement primitive — two external functions, three mappings, zero owners. EIP-712 dual-signed commitments; asymmetric bonding; direct transfer at resolution.</dd>
                    </div>
                    <div>
                        <dt className="text-base font-semibold text-black">Protocol</dt>
                        <dd className="text-gray-700 leading-relaxed mt-1">Kernel + extension doctrine + public graphs. The permissionless surface everyone shares: attestation coordinator, schema registry, canonical validators, token, batch verifier.</dd>
                    </div>
                    <div>
                        <dt className="text-base font-semibold text-black">Runtime</dt>
                        <dd className="text-gray-700 leading-relaxed mt-1">Protocol + semantic layer + builder surfaces + UI. The runtime is not a product. It is the composable layer in which assemblies are rendered, roles are filled, and processes play out.</dd>
                    </div>
                </dl>
                <p className="text-sm text-gray-600 mt-4">
                    Full treatment:{" "}
                    <a href="https://github.com/figaro-protocol/Figaro-Prototype2/blob/main/docs/v5/RUNTIME.md" target="_blank" rel="noopener noreferrer" className="underline">RUNTIME.md</a>,{" "}
                    <a href="https://github.com/figaro-protocol/Figaro-Prototype2/blob/main/docs/v5/PROTOCOL_EXTENSION_DOCTRINE.md" target="_blank" rel="noopener noreferrer" className="underline">PROTOCOL_EXTENSION_DOCTRINE.md</a>.
                </p>
            </section>

            <section className="container mx-auto px-6 pb-12 max-w-3xl border-t border-gray-200 pt-12">
                <h2 className="text-2xl font-bold text-black mb-4">An order is a signed contract</h2>
                <p className="text-base text-gray-700 leading-relaxed mb-4">
                    A Figaro commitment is, at the protocol level, a signed contract between two parties. The familiar contract-law vocabulary carries over directly:
                </p>
                <dl className="space-y-3 text-base text-gray-700 leading-relaxed">
                    <div>
                        <dt className="font-semibold text-black inline">Consideration:</dt>
                        <dd className="inline ml-2">the payment, P.</dd>
                    </div>
                    <div>
                        <dt className="font-semibold text-black inline">Terms and conditions:</dt>
                        <dd className="inline ml-2">the schemas declared in the agreement manifest — typed, versioned, validator-enforced sections for commerce, handoff, fulfilment, disclosure, lifecycle, and any domain-specific clauses the parties agree on. Machine-verifiable.</dd>
                    </div>
                    <div>
                        <dt className="font-semibold text-black inline">Contract document:</dt>
                        <dd className="inline ml-2">the off-chain text (specification, order details, annexes) whose hash the <code>agreementHash</code> field of the commitment binds both parties to. The signed commitment is the contract&apos;s on-chain instance; the document is the contract&apos;s human-readable text.</dd>
                    </div>
                    <div>
                        <dt className="font-semibold text-black inline">Formation:</dt>
                        <dd className="inline ml-2">both parties sign the EIP-712 commitment; the kernel records formation and pulls the bonds.</dd>
                    </div>
                    <div>
                        <dt className="font-semibold text-black inline">Acceptor:</dt>
                        <dd className="inline ml-2">the buyer. Buyer dominance in contract-law terms is the buyer-as-acceptor role — the party receiving the deliverable determines whether it was delivered per spec. The seller must fulfill to the buyer&apos;s satisfaction.</dd>
                    </div>
                    <div>
                        <dt className="font-semibold text-black inline">Discharge:</dt>
                        <dd className="inline ml-2">resolution. Payment flows, bonds return, the contract is discharged, records persist on chain.</dd>
                    </div>
                </dl>
                <p className="text-base text-gray-700 leading-relaxed mt-4">
                    An N-party process tree is a chain of linked bilateral contracts, each with its own buyer-seller pair, composed through progressive collateralization. The restaurant who contracts with a driver becomes the buyer of the delivery sub-contract; the driver is its seller.
                </p>
            </section>

            <section className="container mx-auto px-6 pb-12 max-w-3xl border-t border-gray-200 pt-12">
                <h2 className="text-2xl font-bold text-black mb-4">The kernel is narrow so the graph can be anything</h2>
                <p className="text-base text-gray-700 leading-relaxed mb-4">
                    FigaroCore takes no position on currency, jurisdiction, identity, arbitration, role structure, price-discovery, or contribution metric. Its core mechanism is asymmetric bonding — which produces the Nash equilibrium at every edge and scales the mechanism from two parties to N-party process trees by bonding each seller against cumulative upstream value. Two rules compose with the scaled mesh: buyer dominance (one signature resolves the whole tree) and atomic resolution (whole tree or nothing, inducing a weakest-link subgame among sellers). Every other question lives above.
                </p>
                <p className="text-base text-gray-700 leading-relaxed mb-4">
                    Because the kernel is narrow, any economic system can be expressed above it:
                </p>
                <ul className="space-y-2 text-base text-gray-700 leading-relaxed list-disc pl-6">
                    <li>A market-liberal graph where every role is priced at auction.</li>
                    <li>A cooperative graph where surplus routes back to contributors via programmatic shares.</li>
                    <li>An Islamic-finance graph that forbids riba and structures returns through bonded profit-sharing.</li>
                    <li>A mutual-aid graph where bonds are reciprocal rather than monetary, denominated in a community currency.</li>
                    <li>A diaspora-network graph where jurisdictional identity is replaced by a cryptographic key and a social-graph attestation.</li>
                </ul>
                <p className="text-base text-gray-700 leading-relaxed mt-4">
                    Same kernel underneath all of them. The ideological commitments live in the assembly — in which roles it defines, which mechanisms it invokes, which clauses it requires. The kernel is ideologically agnostic; the graph is the politics.
                </p>
            </section>

            <section className="container mx-auto px-6 pb-12 max-w-3xl border-t border-gray-200 pt-12">
                <h2 className="text-2xl font-bold text-black mb-4">Chain-agnostic</h2>
                <p className="text-base text-gray-700 leading-relaxed mb-4">
                    The kernel is a Solidity 0.8.26 contract. It compiles and deploys for any EVM network. Canonical deployments are listed in the <Link href="/spec" className="underline">Specifications</Link> index.
                </p>
                <p className="text-base text-gray-700 leading-relaxed mb-4">
                    The chain itself is the kernel&apos;s substrate. <code>FigaroCore</code> does not establish trust; it inherits it from the network underneath — from the network&apos;s consensus, its tamper-evident history, its deterministic execution, and its finality guarantees. Everything the kernel passes upward to assemblies and runtimes is downstream of whichever EVM the protocol is deployed on. Different chain, different security assumptions; same kernel, same invariants once those assumptions hold.
                </p>
                <p className="text-base text-gray-700 leading-relaxed">
                    Figaro works with any ERC-20 token. Participants bond in whatever currency their assembly commits to &mdash; stablecoins, ETH wrappings, community currencies. Within a single process, the bond currency is monotoken by design (this is what makes the 2× ratio Nash-stable without an oracle). Cross-currency coordination is achieved through composition of independent processes, not through protocol-level currency conversion.
                </p>
            </section>

            <section id="enforcement" className="container mx-auto px-6 pb-12 max-w-3xl border-t border-gray-200 pt-12">
                <h2 className="text-2xl font-bold text-black mb-4">Three layers of enforcement</h2>
                <p className="text-base text-gray-700 leading-relaxed mb-6">
                    Self-enforcing agreements do not rely on a single defense. Three layers, ordered by how often each fires.
                </p>
                <dl className="space-y-6 text-sm">
                    <div>
                        <dt className="flex items-baseline gap-3 flex-wrap mb-2">
                            <span className="font-mono text-xs text-gray-500">Layer 1</span>
                            <span className="text-xs text-gray-500 uppercase tracking-widest">Economic</span>
                        </dt>
                        <dd className="text-base font-semibold text-black mb-1">Asymmetric bonding makes cheating irrational.</dd>
                        <dd className="text-gray-700 leading-relaxed">
                            Both parties bond before any work begins. The only Nash-rational move is cooperation. Rational actors never defect because defection always costs more than completion. This covers the overwhelming majority of transactions; when the mechanism works as designed, no dispute ever arises. Full derivation on the <Link href="/mechanism" className="underline">mechanism</Link> page.
                        </dd>
                    </div>
                    <div>
                        <dt className="flex items-baseline gap-3 flex-wrap mb-2">
                            <span className="font-mono text-xs text-gray-500">Layer 2</span>
                            <span className="text-xs text-gray-500 uppercase tracking-widest">Social</span>
                        </dt>
                        <dd className="text-base font-semibold text-black mb-1">Multi-party processes bind contributors together.</dd>
                        <dd className="text-gray-700 leading-relaxed">
                            Each contributor&apos;s failure costs everyone. A courier who fails to deliver doesn&apos;t just lose their own bond — they cost the cook, the kitchen operator, and every upstream contributor their bond too, because the buyer cannot approve a half-complete process. This is the mechanism analog of Grameen-style joint-liability group lending, reproduced without repeated interaction, local information, or social sanction — the settlement layer replaces the social substrate. Grameen circles historically drop default rates from roughly 20% to roughly 2%; Figaro&apos;s peer-enforced mesh inherits that regime as the theoretical upper bound on disputes escaping to Layer 3.
                        </dd>
                    </div>
                    <div>
                        <dt className="flex items-baseline gap-3 flex-wrap mb-2">
                            <span className="font-mono text-xs text-gray-500">Layer 3</span>
                            <span className="text-xs text-gray-500 uppercase tracking-widest">Legal</span>
                        </dt>
                        <dd className="text-base font-semibold text-black mb-1">On-chain evidence for off-chain adjudication.</dd>
                        <dd className="text-gray-700 leading-relaxed">
                            For the residual fraction involving irrational or adversarial actors, the chain provides immutable, timestamped, role-gated evidence. Every lifecycle event is bound to the signed agreement via a merkle inclusion proof. Under eIDAS (EU), the UCC (US), and UNCITRAL model law, cryptographic evidence with tamper-proof timestamps is admissible. Adjudication happens in real courts with real procedure — not in on-chain juries. The protocol takes no position on outcomes; it only guarantees the evidence is honest. Details: <Link href="/legal" className="underline">Paper E — Evidence &amp; law</Link>.
                        </dd>
                    </div>
                </dl>
            </section>

            <section className="container mx-auto px-6 pb-12 max-w-3xl border-t border-gray-200 pt-12">
                <h2 className="text-2xl font-bold text-black mb-4">Posture</h2>
                <ul className="space-y-3 text-base text-gray-700 leading-relaxed list-disc pl-6">
                    <li>No owner, no admin, no pause function.</li>
                    <li>No protocol fee. No rent extraction at the kernel.</li>
                    <li>FIG is not a governance token. It is a coordination Schelling point.</li>
                    <li>No arbitrator. No timeout. Buyer dominance + asymmetric bonding carry resolution.</li>
                    <li>The kernel is ideologically agnostic. The graph is the politics. A market-liberal graph, a cooperative graph, an Islamic-finance graph, and a mutual-aid graph all use the same kernel.</li>
                </ul>
            </section>

            <section className="container mx-auto px-6 pb-24 max-w-3xl border-t border-gray-200 pt-12">
                <h2 className="text-2xl font-bold text-black mb-4">License</h2>
                <p className="text-base text-gray-700 leading-relaxed">
                    <a href="https://github.com/figaro-protocol/Figaro-Prototype2/blob/main/LICENSE" target="_blank" rel="noopener noreferrer" className="underline">MIT</a>. Source:{" "}
                    <a href="https://github.com/figaro-protocol/Figaro-Prototype2" target="_blank" rel="noopener noreferrer" className="underline">github.com/figaro-protocol/Figaro-Prototype2</a>.
                </p>
            </section>
        </>
    );
}
