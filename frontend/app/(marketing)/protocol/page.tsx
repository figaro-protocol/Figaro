import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
    title: "Protocol — Figaro",
    description:
        "Figaro's protocol-level properties: two mechanisms producing a Nash equilibrium under bonded commitment, transaction-scoped institutions that form for one process and dissolve at settlement, and the contract-law mapping the protocol carries.",
};

export default function Protocol() {
    return (
        <>
            <section className="container mx-auto px-6 pt-24 pb-12 max-w-3xl">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-4">
                    Protocol
                </p>
                <h1 className="text-5xl sm:text-6xl font-bold text-black leading-tight tracking-tight mb-6">
                    Two mechanisms, one bonded commitment.
                </h1>
                <p className="text-xl text-gray-600 leading-relaxed max-w-2xl">
                    The kernel runs two mechanisms doing distinct work. Asymmetric
                    bonding produces the bilateral Nash equilibrium and scales the
                    primitive from two parties to N-party trees through progressive
                    collateralization. Buyer dominance with atomic resolution
                    operates on the scaled mesh and induces a weakest-link subgame
                    among sellers. They compose; neither substitutes for the other.
                </p>
            </section>

            <section className="container mx-auto px-6 pb-12 max-w-3xl border-t border-gray-200 pt-12">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-3">
                    The bonded commitment
                </p>
                <h2 className="text-3xl font-bold text-black mb-6 leading-tight">
                    A signed contract at the protocol level.
                </h2>
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
                <p className="text-sm text-gray-600">
                    Bonding ratio: buyer locks <code>2P</code>, seller locks{" "}
                    <code>2G</code>. Custody = <code>2P + 2G</code>. The 2&times; minimum
                    is proven sufficient (Paper A, Theorem 4.6); below that ratio
                    weak dominance fails (Theorem 4.7).
                </p>
            </section>

            <section className="container mx-auto px-6 pb-12 max-w-3xl border-t border-gray-200 pt-12">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-3">
                    The institution form
                </p>
                <h2 className="text-3xl font-bold text-black mb-6 leading-tight">
                    Each trade is a transaction-scoped institution.
                </h2>
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
            </section>

            <section className="container mx-auto px-6 pb-32 max-w-3xl border-t border-gray-200 pt-12">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-3">
                    Read deeper
                </p>
                <h2 className="text-3xl font-bold text-black mb-6 leading-tight">
                    Eight disciplines read this from eight angles.
                </h2>
                <p className="text-base text-gray-700 leading-relaxed mb-4">
                    Cryptoeconomic systems are multi-disciplinary by construction.
                    Voshmgir &amp; Zargham, <em>Foundations of Cryptoeconomic
                    Systems</em> (2024), name eight disciplines that converge on
                    the substrate &mdash; each asks it a different question in its
                    own vocabulary. The <Link href="/cryptoeconomics" className="underline">cryptoeconomics page</Link>{" "}
                    organizes Figaro&apos;s papers along that taxonomy.
                </p>
            </section>
        </>
    );
}
