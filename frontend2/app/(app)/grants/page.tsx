import type { Metadata } from "next";
import Link from "next/link";

export const metadata: Metadata = {
    title: "Grants — Figaro Protocol",
    description: "Permissionless funding channels for work on the Figaro substrate. DAO allocation + Gitcoin rounds + funded-work ledger.",
};

export default function Grants() {
    return (
        <>
            <section className="container mx-auto px-6 pt-24 pb-12 max-w-3xl">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-4">
                    Grants
                </p>
                <h1 className="text-5xl font-bold text-black leading-tight tracking-tight mb-6">
                    Funding the substrate.
                </h1>
                <p className="text-xl text-gray-600 leading-relaxed max-w-2xl mb-4">
                    Work on the Figaro substrate — research, review, verification, assembly design, documentation — is funded through permissionless channels. No application committee. No curated budget.
                </p>
                <p className="text-base text-gray-700 leading-relaxed max-w-2xl">
                    <Link href="/groups" className="underline">Groups</Link> self-organize, propose work, and receive grants through the channels below. The DAO holds a fixed allocation at genesis; Gitcoin rounds route retroactive and milestone-based funding through open quadratic matching.
                </p>
            </section>

            <section className="container mx-auto px-6 pb-12 max-w-3xl border-t border-gray-200 pt-12">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-6">
                    Capital sources
                </h2>
                <dl className="space-y-6 text-sm">
                    <div className="border-l-2 border-black pl-6">
                        <dt className="text-base font-semibold text-black mb-1">DAO allocation</dt>
                        <dd className="text-gray-700 leading-relaxed">300M FIG (30% of total supply) minted to the DAO wallet at genesis. No vesting. Allocation and disbursement decisions are made by the DAO&apos;s governance process once instantiated; the kernel itself is ownerless and does not read DAO state.</dd>
                    </div>
                    <div className="border-l-2 border-gray-500 pl-6">
                        <dt className="text-base font-semibold text-black mb-1">Gitcoin rounds</dt>
                        <dd className="text-gray-700 leading-relaxed">Quadratic funding rounds for Figaro-adjacent work. Any project can apply; any wallet can donate. Matching pool funded by the DAO allocation and/or external contributors.</dd>
                    </div>
                    <div className="border-l-2 border-gray-300 pl-6">
                        <dt className="text-base font-semibold text-black mb-1">Direct contributions</dt>
                        <dd className="text-gray-700 leading-relaxed">Any wallet can send assets to a group&apos;s address (if published) or to the DAO wallet. On-chain visibility preserves the auditability of the funding graph.</dd>
                    </div>
                </dl>
            </section>

            <section className="container mx-auto px-6 pb-12 max-w-3xl border-t border-gray-200 pt-12">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-6">
                    Active channels
                </h2>
                <ul className="space-y-4">
                    <li className="border-b border-gray-100 pb-3">
                        <span className="text-black font-medium">DAO proposal process</span>
                        <p className="text-sm text-gray-600 mt-0.5">In formation. The genesis mint places 300M FIG in the DAO wallet; the governance framework selecting among proposals is being drafted alongside the groups-and-grants substrate. Status posted here as it firms up.</p>
                    </li>
                    <li className="border-b border-gray-100 pb-3">
                        <a
                            href="https://www.gitcoin.co/"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-black font-medium hover:underline"
                        >
                            Gitcoin rounds
                        </a>
                        <p className="text-sm text-gray-600 mt-0.5">No Figaro round is live yet. When a round opens, it will be linked here with dates, matching pool, and applicant path. Until then, groups can apply to general ecosystem rounds where they fit the theme.</p>
                    </li>
                </ul>
            </section>

            <section className="container mx-auto px-6 pb-12 max-w-3xl border-t border-gray-200 pt-12">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-6">
                    Funded work
                </h2>
                <p className="text-sm text-gray-700 leading-relaxed">
                    Ledger of disbursed grants will appear here as they are made — group, amount, round or proposal reference, on-chain tx. Until then, the list is empty by accurate observation, not by omission.
                </p>
            </section>

            <section className="container mx-auto px-6 pb-24 max-w-3xl border-t border-gray-200 pt-12">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-6">
                    What is already settled
                </h2>
                <ul className="space-y-3 text-sm text-gray-700 leading-relaxed list-disc pl-6">
                    <li><strong>On-chain visibility.</strong> Grants are visible on the ledger; the funding graph is auditable. This is a property of the chain, not a policy.</li>
                    <li><strong>No kernel surface.</strong> FigaroCore does not read or enforce anything about DAO grants. Capital flow happens in wallets, not in the kernel.</li>
                    <li><strong>Gitcoin matching is quadratic.</strong> When a Figaro round goes live, matching follows Gitcoin&apos;s quadratic formula — no discretionary reviewer weight.</li>
                </ul>
                <p className="text-sm text-gray-600 mt-6">
                    DAO-specific norms (gating, review, retroactivity) will be set by the DAO process once instantiated and published here — not by the protocol or the initial authors.
                </p>
            </section>
        </>
    );
}
