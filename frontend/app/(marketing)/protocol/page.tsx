import type { Metadata } from "next";
import Link from "next/link";
import { MarketingHero } from "@/components/shared/MarketingHero";
import { MarketingSection } from "@/components/shared/MarketingSection";

export const metadata: Metadata = {
    title: "Protocol — Figaro",
    description:
        "Figaro's protocol-level properties: two mechanisms producing a Nash equilibrium under bonded commitment, transaction-scoped institutions that form for one process and dissolve at settlement, the contract-law mapping the protocol carries, and the three layers of enforcement.",
};

export default function Protocol() {
    return (
        <>
            <MarketingHero
                eyebrow="Protocol"
                title="Two mechanisms, one bonded commitment."
                lead={
                    <>
                        The kernel runs two mechanisms doing distinct work. Asymmetric
                        bonding produces the bilateral Nash equilibrium and scales the
                        primitive from two parties to N-party trees through progressive
                        collateralization. Buyer dominance with atomic resolution
                        operates on the scaled mesh and induces a weakest-link subgame
                        among sellers. They compose; neither substitutes for the other.
                    </>
                }
            />

            <MarketingSection eyebrow="The bonded commitment" title="A signed contract at the protocol level.">
                <p className="text-base text-gray-700 leading-relaxed mb-4">
                    Every commitment carries the structural shape of a contract. The
                    payment is consideration; the schemas in the agreement are the
                    terms; the <code>agreementHash</code> binds the document; both
                    EIP-712 signatures are formation; the buyer is the acceptor;{" "}
                    <code>resolveProcess</code> is discharge. The familiar legal
                    vocabulary carries over directly. What is different is not the
                    shape of the contract &mdash; it is that the parties&apos; bonds are the
                    enforcement.
                </p>
                <p className="text-base text-gray-700 leading-relaxed mb-4">
                    An N-party process tree is a chain of linked bilateral
                    contracts, each with its own buyer-seller pair, composed
                    through progressive collateralization. The kitchen-operator
                    role contracts with the courier role; the kitchen operator
                    becomes the buyer of the delivery sub-contract.
                </p>
                <p className="text-sm text-gray-600">
                    Bonding ratio: buyer locks <code>2P</code>, seller locks{" "}
                    <code>2G</code>. Custody = <code>2P + 2G</code>. The 2&times; minimum
                    is proven sufficient (Paper A, Theorem 4.6); below that ratio
                    weak dominance fails (Theorem 4.7).
                </p>
            </MarketingSection>

            <MarketingSection eyebrow="The institution form" title="Each trade is a transaction-scoped institution.">
                <p className="text-base text-gray-700 leading-relaxed mb-4">
                    A multi-party process is an assembly of independent value-adders
                    that forms for one trade and dissolves at settlement. The
                    institution is commercially viable because the parties commit
                    and bond &mdash; the structural fact of the bonded commitments is the
                    validation. Roles like &ldquo;merchant&rdquo;,
                    &ldquo;supplier&rdquo;, or &ldquo;courier&rdquo; are positions
                    within an assembly, not firms.
                </p>
                <p className="text-sm text-gray-600">
                    Worked example:{" "}
                    <Link href="/local-commerce" className="underline">
                        local commerce
                    </Link>{" "}
                    &mdash; three roles, one root commitment, two sub-orders, atomic
                    settlement.
                </p>
            </MarketingSection>

            <MarketingSection
                eyebrow="Enforcement"
                title="Three layers, ordered by how often each fires."
                sectionId="enforcement"
            >
                <p className="text-base text-gray-700 leading-relaxed mb-6">
                    Self-enforcing agreements do not rely on a single defense.
                </p>
                <dl className="space-y-6 text-sm">
                    <div>
                        <dt className="flex items-baseline gap-3 flex-wrap mb-2">
                            <span className="font-mono text-xs text-gray-500">Layer 1</span>
                            <span className="text-xs text-gray-500 uppercase tracking-widest">Economic</span>
                        </dt>
                        <dd className="text-gray-700 leading-relaxed">
                            <strong className="text-black">Asymmetric bonding makes cheating irrational.</strong>{" "}
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
                            <span className="font-mono text-xs text-gray-500">Layer 2</span>
                            <span className="text-xs text-gray-500 uppercase tracking-widest">Social</span>
                        </dt>
                        <dd className="text-gray-700 leading-relaxed">
                            <strong className="text-black">Multi-party processes bind contributors together.</strong>{" "}
                            Each contributor&apos;s failure costs everyone. A courier
                            who fails to deliver doesn&apos;t just lose their own bond
                            &mdash; they cost the kitchen operator and every upstream
                            contributor their bond too, because the buyer cannot
                            approve a half-complete process. Figaro reproduces the
                            Grameen joint-liability peer-enforcement outcome under
                            strictly weaker assumptions: no repeated interaction,
                            no local information, no social sanction (Theorem 6.1).
                        </dd>
                    </div>
                    <div>
                        <dt className="flex items-baseline gap-3 flex-wrap mb-2">
                            <span className="font-mono text-xs text-gray-500">Layer 3</span>
                            <span className="text-xs text-gray-500 uppercase tracking-widest">Legal</span>
                        </dt>
                        <dd className="text-gray-700 leading-relaxed">
                            <strong className="text-black">On-chain evidence for off-chain adjudication.</strong>{" "}
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
                eyebrow="Read deeper"
                title="Two branches diverge here."
                bottomPad="extra"
            >
                <p className="text-base text-gray-700 leading-relaxed mb-4">
                    <strong>The academic branch.</strong> Cryptoeconomic systems are multi-disciplinary by construction. Voshmgir &amp; Zargham, <em>Foundations of Cryptoeconomic Systems</em> (2024), name eight disciplines that converge on the substrate &mdash; each asks it a different question in its own vocabulary. The <Link href="/cryptoeconomics" className="underline">cryptoeconomics page</Link> organizes Figaro&apos;s papers along that taxonomy.
                </p>
                <p className="text-base text-gray-700 leading-relaxed">
                    <strong>The compositional branch.</strong> The kernel&apos;s narrowness produces composability as a derived property. Extensions live outside the kernel and preserve the equilibrium under the coordinator pattern. The <Link href="/composability" className="underline">composability page</Link> states the property, the three sufficient conditions, and the three tiers of extension.
                </p>
            </MarketingSection>
        </>
    );
}
