import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
    title: "Treasuries — Figaro Protocol",
    description: "Composition patterns for treasury disbursement on Figaro. Multisig and governance-executor buyers, streaming composition, bookkeeping integration.",
};

export default function Treasuries() {
    return (
        <>
            <section className="container mx-auto px-6 pt-24 pb-12 max-w-3xl">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-4">
                    Treasuries
                </p>
                <h1 className="text-5xl font-bold text-black leading-tight tracking-tight mb-6">
                    Composition patterns.
                </h1>
                <p className="text-xl text-gray-600 leading-relaxed max-w-2xl">
                    Figaro is a settlement primitive; any wallet that can sign an EIP-712 commitment can be a buyer. On-chain treasuries compose with the kernel without any treasury-specific protocol surface. This page catalogues the patterns.
                </p>
            </section>

            <section className="container mx-auto px-6 pb-12 max-w-3xl border-t border-gray-200 pt-12">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-6">
                    Ledger-period structure
                </h2>
                <p className="text-base text-gray-700 leading-relaxed mb-4">
                    A Figaro process opens at commit, accumulates state through its attestations, and closes at <code>resolveProcess</code> — at which point balances are final, transfers execute, and the record is sealed. There is no &ldquo;period-end close&rdquo; as a separate activity; closing <em>is</em> the settlement call. Each process is a self-closing ledger period.
                </p>
                <p className="text-sm text-gray-600">
                    Paper G treatment of the accounting substrate: <a href="/papers/figaro-accounting.pdf" className="underline">Paper G (PDF)</a>.
                </p>
            </section>

            <section className="container mx-auto px-6 pb-12 max-w-3xl border-t border-gray-200 pt-12">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-6">
                    Composition surfaces
                </h2>
                <dl className="space-y-4 text-sm">
                    <div>
                        <dt className="text-base font-semibold text-black">Multisig as buyer</dt>
                        <dd className="text-gray-700 leading-relaxed mt-1">A Safe or any multisig commits as the buyer. The signer set approves the commitment the same way it approves any transaction. EIP-1271 enables smart-contract wallet signature verification.</dd>
                    </div>
                    <div>
                        <dt className="text-base font-semibold text-black">Governance executor as buyer</dt>
                        <dd className="text-gray-700 leading-relaxed mt-1">A DAO governance vote authorizes a commitment; the executor contract calls <code>commit</code>. The protocol sees a signed commitment from the wallet, irrespective of which wallet or how its signature was produced.</dd>
                    </div>
                    <div>
                        <dt className="text-base font-semibold text-black">Streaming upstream of commit</dt>
                        <dd className="text-gray-700 leading-relaxed mt-1">A streaming contract drips payment to an intermediary wallet that commits processes as work comes in. Figaro does not replace streaming; it sits upstream of the disbursement point.</dd>
                    </div>
                    <div>
                        <dt className="text-base font-semibold text-black">Bookkeeping from chain state</dt>
                        <dd className="text-gray-700 leading-relaxed mt-1">Accounting tooling reads chain state directly. Every <code>OrderCommitted</code> + <code>OrderResolved</code> pair is a completed disbursement with full context. See <Link href="/integrate" className="underline">/integrate</Link> for the SDK surface.</dd>
                    </div>
                </dl>
            </section>

            <section className="container mx-auto px-6 pb-24 max-w-3xl border-t border-gray-200 pt-12">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-6">
                    Constraints
                </h2>
                <ul className="space-y-3 text-sm text-gray-700 leading-relaxed list-disc pl-6">
                    <li><strong>Counterparty bond required.</strong> The seller posts <code>2× cumulative value</code>. Counterparties without in-hand capital cannot enter without external financing (<Link href="/integrate" className="underline">lending composition</Link>).</li>
                    <li><strong>No clawback after resolution.</strong> Settlement is terminal; it cannot be reversed by any party. Milestone-gated disbursement is achieved through process-tree composition, not kernel-level reversal.</li>
                    <li><strong>No kernel-level arbitration.</strong> The protocol produces evidence; the agreement specifies the forum. See <Link href="/about#enforcement" className="underline">enforcement</Link> and <a href="/papers/figaro-legal.pdf" className="underline">Paper E (legal)</a>.</li>
                    <li><strong>Public visibility.</strong> Commitment events are on a public ledger; content is hashed (only <code>agreementHash</code> is public), but participation is visible. Confidential disbursement is outside the protocol&apos;s guarantees.</li>
                </ul>
            </section>
        </>
    );
}
