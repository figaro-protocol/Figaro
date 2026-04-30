import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
    title: "Cryptoeconomics — Figaro Protocol",
    description:
        "Figaro's cryptoeconomics: two mechanisms producing a Nash equilibrium under bonded commitment, transaction-scoped institutions that form for one process and dissolve at settlement, and the contract-law mapping the protocol carries.",
};

export default function Cryptoeconomics() {
    return (
        <>
            <section className="container mx-auto px-6 pt-24 pb-12 max-w-3xl">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-4">
                    Cryptoeconomics
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
                    shape of the contract — it is that the parties&apos; bonds are the
                    enforcement.
                </p>
                <p className="text-sm text-gray-600">
                    Bonding ratio: buyer locks <code>2P</code>, seller locks{" "}
                    <code>2G</code>. Custody = <code>2P + 2G</code>. The 2× minimum
                    is proven sufficient (Paper A, Theorem 4.6). Below that ratio the
                    Nash equilibrium does not hold.
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
                    and bond — the structural fact of the bonded commitments is the
                    validation. Roles like &ldquo;merchant&rdquo;,
                    &ldquo;supplier&rdquo;, or &ldquo;courier&rdquo; are positions
                    within an assembly, not firms.
                </p>
                <p className="text-sm text-gray-600">
                    Worked example:{" "}
                    <Link href="/local-commerce" className="underline">
                        local commerce
                    </Link>{" "}
                    — three roles, one root commitment, two sub-orders, atomic
                    settlement.
                </p>
            </section>

            <section className="container mx-auto px-6 pb-12 max-w-3xl border-t border-gray-200 pt-12">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-3">
                    The token
                </p>
                <h2 className="text-3xl font-bold text-black mb-6 leading-tight">
                    FIG is a coordination signal, not a fee or a yield.
                </h2>
                <p className="text-base text-gray-700 leading-relaxed mb-4">
                    The FIG token does not accrue from kernel activity. It is not
                    required to participate in the protocol. It is a fixed-supply
                    coordination Schelling point: 1B max, 100M founder + 300M DAO at
                    genesis, 600M staged community airdrop unlocking at year 2 / 5 /
                    9. Settlement-anchored emission and yield-style designs were
                    deliberately rejected (Paper D).
                </p>
                <p className="text-sm text-gray-600">
                    Token-design treatment:{" "}
                    <Link href="/fig/design" className="underline">
                        /fig/design
                    </Link>
                    . FIG holdings:{" "}
                    <Link href="/fig" className="underline">
                        /fig
                    </Link>
                    .
                </p>
            </section>

            <section className="container mx-auto px-6 pb-12 max-w-3xl border-t border-gray-200 pt-12">
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
                    own vocabulary. The <Link href="/foundations" className="underline">foundations page</Link>{" "}
                    organizes Figaro&apos;s papers along that taxonomy.
                </p>
            </section>

            <section className="container mx-auto px-6 pb-32 max-w-3xl border-t border-gray-200 pt-12">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-3">
                    Build / contribute
                </p>
                <ul className="text-sm text-gray-700 space-y-2">
                    <li>
                        <Link href="/builders" className="underline">
                            Builders
                        </Link>{" "}
                        — assembly designer toolchain.
                    </li>
                    <li>
                        <Link href="/integrate" className="underline">
                            Integrate
                        </Link>{" "}
                        — SDK + Agent SDK.
                    </li>
                    <li>
                        <Link href="/schemas" className="underline">
                            Schemas
                        </Link>{" "}
                        — contract terms catalogued.
                    </li>
                    <li>
                        <Link href="/groups" className="underline">
                            Working groups
                        </Link>{" "}
                        — self-organize, contribute articles, request grants.
                    </li>
                </ul>
            </section>
        </>
    );
}
