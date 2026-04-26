import type { Metadata } from "next";
import Link from "next/link";
import { GROUPS_REGISTRY } from "@/lib/shared/groupsRegistry";

export const metadata: Metadata = {
    title: "Groups — Figaro Protocol",
    description: "Eight working groups organized by the disciplinary taxonomy of cryptoeconomic systems.",
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
                    Cryptoeconomic systems are multi-disciplinary by construction. Eight disciplines converge on the question of resource allocation under bonded commitment — each asks the substrate a different question in its own vocabulary.
                </p>
                <p className="text-base text-gray-700 leading-relaxed max-w-2xl">
                    The taxonomy is fixed; the conversation is not. Each group assembles contributors who read the substrate from inside that discipline and publishes a reading path through the papers and specifications that speak to it.
                </p>
            </section>

            <section className="container mx-auto px-6 pb-12 max-w-3xl border-t border-gray-200 pt-12">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-6">
                    Groups
                </h2>
                <ul className="space-y-6">
                    {GROUPS_REGISTRY.map((g) => (
                        <li key={g.slug} className="border-b border-gray-100 pb-6">
                            <div className="flex items-baseline gap-3 mb-1 flex-wrap">
                                <Link href={`/groups/${g.slug}`} className="text-2xl font-bold text-black hover:underline">
                                    {g.name}
                                </Link>
                            </div>
                            <p className="text-xs text-gray-500 mb-2">{g.discipline}</p>
                            <p className="text-sm text-gray-700 leading-relaxed">
                                {g.charter}
                            </p>
                            <Link
                                href={`/groups/${g.slug}`}
                                className="inline-block mt-3 text-sm text-gray-700 hover:text-black hover:underline"
                            >
                                Open group &rarr;
                            </Link>
                        </li>
                    ))}
                </ul>
            </section>

            <section className="container mx-auto px-6 pb-24 max-w-3xl border-t border-gray-200 pt-12">
                <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-6">
                    Contributing
                </h2>
                <p className="text-base text-gray-700 leading-relaxed mb-4">
                    Each group page is authored by its contributors. To add a reading-path entry, update current work, or publish a grant received, open a pull request against <code>lib/shared/groupsRegistry.ts</code>. The site renders what the entry supplies without review or edit.
                </p>
                <p className="text-sm text-gray-600 leading-relaxed">
                    The disciplinary list itself tracks Voshmgir &amp; Zargham, <em>Foundations of Cryptoeconomic Systems</em>. If the literature converges on a different taxonomy, this registry will follow.
                </p>
            </section>
        </>
    );
}
