import type { Metadata } from "next";
import Link from "next/link";
import { GROUPS_REGISTRY } from "@/lib/shared/groupsRegistry";

export const metadata: Metadata = {
    title: "Groups — Figaro Protocol",
    description:
        "Eight working groups organized by the Voshmgir & Zargham disciplinary taxonomy. Self-organize locally and internationally; request grants through DAO allocation, Gitcoin rounds, or direct contributions.",
};

export default function GroupsIndex() {
    return (
        <>
            <section className="container mx-auto px-6 pt-24 pb-12 max-w-3xl">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-4">
                    Groups
                </p>
                <h1 className="text-5xl font-bold text-black leading-tight tracking-tight mb-6">
                    Working groups.
                </h1>
                <p className="text-xl text-gray-600 leading-relaxed max-w-2xl mb-4">
                    Eight disciplines, one substrate. Each group assembles
                    contributors who read the substrate from inside their
                    discipline and publishes a reading path through the papers and
                    specifications that speak to it.
                </p>
                <p className="text-base text-gray-700 leading-relaxed max-w-2xl">
                    Working groups self-organize across jurisdictions &mdash; local
                    meetups, international correspondences, async pull requests.
                    The taxonomy is fixed; the geography and cadence are whatever
                    contributors decide.
                </p>
            </section>

            <section className="container mx-auto px-6 pb-12 max-w-3xl border-t border-gray-200 pt-12">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-6">
                    Groups
                </h2>
                <ul className="space-y-6">
                    {GROUPS_REGISTRY.map((g) => (
                        <li key={g.slug} className="border-b border-gray-100 pb-6">
                            <h3 className="text-2xl font-bold text-black">
                                {g.name}
                            </h3>
                            <p className="text-xs text-gray-500 mb-2">{g.discipline}</p>
                            <p className="text-sm text-gray-700 leading-relaxed">
                                {g.charter}
                            </p>
                        </li>
                    ))}
                </ul>
            </section>

            <section className="container mx-auto px-6 pb-12 max-w-3xl border-t border-gray-200 pt-12">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-6">
                    Grants &amp; capital sources
                </h2>
                <p className="text-base text-gray-700 leading-relaxed mb-4">
                    Work on the Figaro substrate &mdash; research, review,
                    verification, assembly design, documentation &mdash; is funded
                    through permissionless channels. No application committee. No
                    curated budget.
                </p>
                <dl className="space-y-4 text-sm">
                    <div className="border-l-2 border-gray-200 pl-4">
                        <dt className="text-base font-semibold text-black">DAO allocation</dt>
                        <dd className="text-gray-700 leading-relaxed mt-1">
                            300M FIG (30% of supply) minted to the DAO wallet at
                            genesis with no vesting. Allocation decisions are made
                            by the DAO&apos;s governance process once instantiated;
                            the kernel is ownerless and does not read DAO state.
                        </dd>
                    </div>
                    <div className="border-l-2 border-gray-200 pl-4">
                        <dt className="text-base font-semibold text-black">Gitcoin rounds</dt>
                        <dd className="text-gray-700 leading-relaxed mt-1">
                            Quadratic funding for Figaro-adjacent work. No Figaro
                            round is live yet; until then, groups can apply to
                            general ecosystem rounds where they fit the theme.
                        </dd>
                    </div>
                    <div className="border-l-2 border-gray-200 pl-4">
                        <dt className="text-base font-semibold text-black">Direct contributions</dt>
                        <dd className="text-gray-700 leading-relaxed mt-1">
                            Any wallet can send assets to a group&apos;s published
                            address or to the DAO wallet. On-chain visibility
                            preserves the funding graph.
                        </dd>
                    </div>
                </dl>
            </section>

            <section className="container mx-auto px-6 pb-24 max-w-3xl border-t border-gray-200 pt-12">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-6">
                    Contributing
                </h2>
                <p className="text-base text-gray-700 leading-relaxed mb-4">
                    To add a reading-path entry, update current work, or publish a
                    received grant, open a pull request against{" "}
                    <code>lib/shared/groupsRegistry.ts</code>. To contribute an
                    article inside a discipline, open a pull request adding it
                    under the relevant group. The site renders what the entry
                    supplies without review or edit.
                </p>
                <p className="text-sm text-gray-600 leading-relaxed">
                    The disciplinary list itself tracks Voshmgir &amp; Zargham,{" "}
                    <em>Foundations of Cryptoeconomic Systems</em>. If the
                    literature converges on a different taxonomy, this registry
                    will follow.
                </p>
            </section>
        </>
    );
}
