import type { Metadata } from "next";
import Link from "next/link";
import { MarketingHero } from "@/components/marketing/MarketingHero";
import { MarketingSection } from "@/components/marketing/MarketingSection";

export const metadata: Metadata = {
    title: "Protocol mechanisms — Figaro Protocol",
    description:
        "Figaro's protocol-level properties: two mechanisms producing a Nash equilibrium under bonded commitment, transaction-scoped institutions that form for one process and dissolve at settlement, the contract-law mapping the protocol carries, and the three layers of enforcement.",
};

export default function Protocol() {
    return (
        <>
            <MarketingHero
                title="Two mechanisms, one bonded commitment."
                lead={
                    <>
                        The kernel runs two mechanisms doing distinct work. Asymmetric
                        bonding produces the bilateral Nash equilibrium and scales the
                        primitive from two parties to N-party process chains through progressive
                        collateralization. Buyer dominance with atomic resolution
                        operates on the scaled mesh and induces a weakest-link subgame
                        among sellers. They compose; neither substitutes for the other.
                    </>
                }
            />

            <MarketingSection title="A small kernel; the layers above compose freely.">
                <ol className="space-y-0 text-sm border border-default rounded-lg overflow-hidden mb-4">
                    <li className="border-b border-default px-5 py-3 bg-canvas flex items-baseline justify-between gap-3 flex-wrap">
                        <span className="text-ink-heading font-semibold">Trade</span>
                        <span className="text-xs text-ink-muted font-mono">humans + agents</span>
                    </li>
                    <li className="border-b border-default px-5 py-3 bg-subtle flex items-baseline justify-between gap-3 flex-wrap">
                        <span className="text-ink-heading font-semibold">UI &middot; Runtime</span>
                        <span className="text-xs text-ink-muted font-mono">assemblies &middot; modules &middot; views</span>
                    </li>
                    <li className="border-b border-default px-5 py-3 bg-subtle-hover flex items-baseline justify-between gap-3 flex-wrap">
                        <span className="text-ink-heading font-semibold">Services</span>
                        <span className="text-xs text-ink-muted font-mono">messaging &middot; storage &middot; identity</span>
                    </li>
                    <li className="border-b border-default px-5 py-3 bg-default flex items-baseline justify-between gap-3 flex-wrap">
                        <Link href="/schemas" className="text-ink-heading font-semibold hover:underline">Schemas</Link>
                        <span className="text-xs text-ink-body font-mono">typed content &middot; 3-layer validation</span>
                    </li>
                    <li className="border-b border-default px-5 py-3 bg-default-strong flex items-baseline justify-between gap-3 flex-wrap">
                        <Link href="/spec" className="text-ink-heading font-semibold hover:underline">Protocol contracts</Link>
                        <span className="text-xs text-ink-primary font-mono">attestation &middot; auction &middot; registries</span>
                    </li>
                    <li className="border-b border-default px-5 py-3 bg-ink-heading text-paper flex items-baseline justify-between gap-3 flex-wrap">
                        <span className="font-semibold">Kernel</span>
                        <span className="text-xs text-paper/70 font-mono">FigaroCore &mdash; asymmetric bonding + atomic resolution</span>
                    </li>
                    <li className="px-5 py-3 bg-canvas flex items-baseline justify-between gap-3 flex-wrap">
                        <span className="text-ink-heading font-semibold">Network</span>
                        <span className="text-xs text-ink-muted font-mono">any EVM-compatible chain</span>
                    </li>
                </ol>

                <div className="border border-dashed border-default rounded-lg px-5 py-3 flex items-baseline justify-between gap-3 flex-wrap">
                    <span className="text-ink-heading font-semibold">Edge</span>
                    <span className="text-xs text-ink-muted font-mono">Kleros &middot; courts (evidentiary fallback)</span>
                </div>

                <p className="text-xs text-ink-muted mt-3 leading-relaxed">
                    Adjacent dimension &mdash; <Link href="/fig/design" className="underline">FIG</Link> coordinates funding; <Link href="/cryptoeconomics" className="underline">Cryptoeconomics</Link> organizes the paper portfolio and working-group activity for work above the kernel.
                </p>

                <p className="text-base text-ink-body leading-relaxed mt-8">
                    The kernel takes no position on currency, jurisdiction, identity, arbitration, role structure, or contribution metric. A market-liberal assembly, a cooperative assembly, and a mutual-aid assembly all use the same kernel. The kernel is ideologically agnostic; the graph is the politics.
                </p>

                <p className="text-sm text-ink-muted leading-relaxed mt-6">
                    Any internal exit path weakens the Nash equilibrium (Theorem 4.7). Extensions live outside the kernel and compose via the coordinator pattern &mdash; full treatment on <Link href="/composability" className="underline">Composability</Link>.
                </p>
            </MarketingSection>

            <MarketingSection title="A signed contract at the protocol level.">
                <p className="text-base text-ink-body leading-relaxed mb-4">
                    Every commitment carries the structural shape of a contract. The
                    payment is consideration; the schemas in the agreement are the
                    terms; the <code>agreementHash</code> binds the document; both
                    EIP-712 signatures are formation; the buyer is the acceptor;{" "}
                    <code>resolveProcess</code> is discharge. The familiar legal
                    vocabulary carries over directly. What is different is not the
                    shape of the contract &mdash; it is that the parties&apos; bonds are the
                    enforcement.
                </p>
                <p className="text-base text-ink-body leading-relaxed mb-4">
                    A multi-party process is a set of bilateral commits sharing
                    one root buyer. The kernel enforces <code>buyer == rootBuyer</code>{" "}
                    in every order &mdash; in a local-commerce process the eater
                    commits directly to the kitchen-operator and to the courier
                    as parallel sellers, not in a chain. The kernel&apos;s
                    cumulative-value accumulator <code>G</code> grows monotonically
                    as each commit lands; each seller bonds against <code>G</code>{" "}
                    at the moment of their commit, which is progressive
                    collateralization in operation. Multi-process composition
                    handles depth: a seller in one process can be the root
                    buyer of a separate process they coordinate, settling
                    independently.
                </p>
                <p className="text-sm text-ink-muted">
                    Bonding ratio: buyer locks <code>2P</code>, seller locks{" "}
                    <code>2G</code>. Custody = <code>2P + 2G</code>. The 2&times; minimum
                    is proven sufficient (Paper A, Theorem 4.6); below that ratio
                    weak dominance fails (Theorem 4.7).
                </p>
            </MarketingSection>

            <MarketingSection title="Each trade is a transaction-scoped institution.">
                <p className="text-base text-ink-body leading-relaxed mb-4">
                    A multi-party process is an assembly of independent value-adders
                    that forms for one trade and dissolves at settlement. The
                    institution is commercially viable because the parties commit
                    and bond &mdash; the structural fact of the bonded commitments is the
                    validation. Roles like &ldquo;merchant&rdquo;,
                    &ldquo;supplier&rdquo;, or &ldquo;courier&rdquo; are positions
                    within an assembly, not firms.
                </p>
                <p className="text-sm text-ink-muted">
                    Worked example:{" "}
                    <Link href="/local-commerce" className="underline">
                        local commerce
                    </Link>{" "}
                    &mdash; three roles, one root commitment, one sub-order, atomic
                    settlement.
                </p>
            </MarketingSection>

            <MarketingSection
                title="Three layers, ordered by how often each fires."
                sectionId="enforcement"
            >
                <p className="text-base text-ink-body leading-relaxed mb-6">
                    Self-enforcing agreements do not rely on a single defense.
                </p>
                <dl className="space-y-6 text-sm">
                    <div>
                        <dt className="flex items-baseline gap-3 flex-wrap mb-2">
                            <span className="font-mono text-xs text-ink-muted">Layer 1</span>
                            <span className="text-xs font-semibold text-ink-muted">Economic</span>
                        </dt>
                        <dd className="text-ink-body leading-relaxed">
                            <strong className="text-ink-heading">Asymmetric bonding makes cheating irrational.</strong>{" "}
                            Both parties bond before any work begins. Cooperation
                            weakly dominates defection (Paper A, Theorem 4.3); the
                            bonded-commit profile is the unique strategy surviving
                            iterated elimination of weakly dominated strategies.
                            This covers the overwhelming majority of transactions;
                            when the mechanism works as designed, no dispute ever
                            arises.
                        </dd>
                    </div>
                    <div>
                        <dt className="flex items-baseline gap-3 flex-wrap mb-2">
                            <span className="font-mono text-xs text-ink-muted">Layer 2</span>
                            <span className="text-xs font-semibold text-ink-muted">Social</span>
                        </dt>
                        <dd className="text-ink-body leading-relaxed">
                            <strong className="text-ink-heading">Multi-party processes bind contributors together.</strong>{" "}
                            Each contributor&apos;s failure costs everyone. A courier
                            who fails to deliver doesn&apos;t just lose their own bond
                            &mdash; they cost the kitchen operator and every upstream
                            contributor their bond too, because the buyer cannot
                            approve a half-complete process. Figaro reproduces the
                            Grameen joint-liability peer-enforcement outcome under
                            strictly weaker assumptions: no repeated interaction,
                            no local information, no social sanction (Proposition 6.1).
                        </dd>
                    </div>
                    <div>
                        <dt className="flex items-baseline gap-3 flex-wrap mb-2">
                            <span className="font-mono text-xs text-ink-muted">Layer 3</span>
                            <span className="text-xs font-semibold text-ink-muted">Legal</span>
                        </dt>
                        <dd className="text-ink-body leading-relaxed">
                            <strong className="text-ink-heading">On-chain evidence for off-chain adjudication.</strong>{" "}
                            For the residual fraction involving irrational or
                            adversarial actors, the chain provides immutable,
                            timestamped, role-gated evidence. Every lifecycle
                            event is bound to the signed agreement via a merkle
                            inclusion proof. Compatible with cryptographic-evidence
                            frameworks under eIDAS, UCC, and UNCITRAL model law;
                            admissibility is forum-specific. Adjudication happens
                            in real courts with real procedure &mdash; not in on-chain
                            juries. The protocol does not adjudicate; it produces
                            tamper-evident, schema-validated evidence. Details:{" "}
                            <a href="/papers/figaro-legal.pdf" className="underline">
                                Paper E (legal)
                            </a>.
                        </dd>
                    </div>
                </dl>
            </MarketingSection>

            <MarketingSection
                title="Two branches diverge here."
                bottomPad="extra"
            >
                <p className="text-base text-ink-body leading-relaxed mb-4">
                    <strong>The academic branch.</strong> Cryptoeconomic systems are multi-disciplinary by construction. Voshmgir &amp; Zargham, <em>Foundations of Cryptoeconomic Systems</em> (2024), name eight disciplines that converge on the substrate &mdash; each asks it a different question in its own vocabulary. The <Link href="/cryptoeconomics" className="underline">cryptoeconomics page</Link> organizes Figaro&apos;s papers along that taxonomy.
                </p>
                <p className="text-base text-ink-body leading-relaxed">
                    <strong>The compositional branch.</strong> The kernel&apos;s narrowness produces composability as a derived property. Extensions live outside the kernel and preserve the equilibrium under the coordinator pattern. The <Link href="/composability" className="underline">composability page</Link> states the property, the three sufficient conditions, and the three tiers of extension.
                </p>
            </MarketingSection>
        </>
    );
}
