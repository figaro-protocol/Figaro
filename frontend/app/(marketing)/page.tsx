import Link from "next/link";

export default function Home() {
    return (
        <>
            {/* Mission — property line from docs/v5/VISION.md */}
            <section className="container mx-auto px-6 pt-24 pb-12 max-w-3xl">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-4">
                    Figaro Protocol
                </p>
                <h1 className="text-5xl sm:text-6xl font-bold text-black leading-tight tracking-tight mb-6">
                    Bonded trade between strangers.
                </h1>
                <p className="text-xl text-gray-800 leading-relaxed max-w-2xl mb-4">
                    Self-enforcing agreements between strangers.
                </p>
                <p className="text-base text-gray-700 leading-relaxed max-w-2xl mb-4">
                    Two people who have never met can make a deal, and both will keep it &mdash; not because they trust each other, not because a judge is watching, but because breaking the deal costs more than keeping it. By construction. Figaro is a coordination protocol &mdash; not DeFi, not TradFi &mdash; a primitive for enforcing bilateral agreements, closer to TCP/IP than to a bank or a DEX. Permissionless, ownerless, EVM-portable.
                </p>
                <p className="text-sm text-gray-500 leading-relaxed max-w-2xl">
                    What this is and is not &mdash; see <Link href="/about" className="underline hover:text-black">About</Link>.
                </p>
            </section>

            {/* The stack — substrate and what composes above it */}
            <section className="container mx-auto px-6 pb-16 max-w-3xl border-t border-gray-200 pt-12">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-6">
                    Stack
                </p>

                <ol className="space-y-0 text-sm border border-gray-200 rounded-lg overflow-hidden">
                    <li className="border-b border-gray-100 px-5 py-3 bg-gray-50 flex items-baseline justify-between gap-3 flex-wrap">
                        <span className="text-black font-semibold">Trade</span>
                        <span className="text-xs text-gray-500 font-mono">humans + agents</span>
                    </li>
                    <li className="border-b border-gray-100 px-5 py-3 bg-gray-100 flex items-baseline justify-between gap-3 flex-wrap">
                        <span className="text-black font-semibold">UI &middot; Runtime</span>
                        <span className="text-xs text-gray-500 font-mono">assemblies &middot; modules &middot; views</span>
                    </li>
                    <li className="border-b border-gray-100 px-5 py-3 bg-gray-200 flex items-baseline justify-between gap-3 flex-wrap">
                        <span className="text-black font-semibold">Services</span>
                        <span className="text-xs text-gray-600 font-mono">messaging &middot; storage &middot; identity</span>
                    </li>
                    <li className="border-b border-gray-100 px-5 py-3 bg-gray-300 flex items-baseline justify-between gap-3 flex-wrap">
                        <Link href="/schemas" className="text-black font-semibold hover:underline">Schemas</Link>
                        <span className="text-xs text-gray-700 font-mono">typed content &middot; 3-layer validation</span>
                    </li>
                    <li className="border-b border-gray-100 px-5 py-3 bg-gray-400 flex items-baseline justify-between gap-3 flex-wrap">
                        <Link href="/spec" className="text-black font-semibold hover:underline">Protocol contracts</Link>
                        <span className="text-xs text-gray-800 font-mono">attestation &middot; auction &middot; registries</span>
                    </li>
                    <li className="border-b border-gray-800 px-5 py-3 bg-black text-white flex items-baseline justify-between gap-3 flex-wrap">
                        <span className="font-semibold">Kernel</span>
                        <span className="text-xs text-gray-300 font-mono">FigaroCore &mdash; the bonded primitive</span>
                    </li>
                    <li className="px-5 py-3 bg-gray-50 flex items-baseline justify-between gap-3 flex-wrap">
                        <span className="text-black font-semibold">Network</span>
                        <span className="text-xs text-gray-500 font-mono">any EVM-compatible chain</span>
                    </li>
                </ol>

                <div className="border border-dashed border-gray-300 rounded-lg px-5 py-3 mt-4 flex items-baseline justify-between gap-3 flex-wrap">
                    <span className="text-black font-semibold">Edge</span>
                    <span className="text-xs text-gray-500 font-mono">Kleros &middot; courts (evidentiary fallback)</span>
                </div>

                <p className="text-xs text-gray-500 mt-3 leading-relaxed">
                    Adjacent dimension &mdash; <Link href="/fig/design" className="underline hover:text-black">FIG</Link>, <Link href="/groups" className="underline hover:text-black">Groups</Link>, and <Link href="/foundations" className="underline hover:text-black">Foundations</Link> coordinate funding and governance for work above the kernel.
                </p>

                <p className="text-base text-gray-700 leading-relaxed mt-8">
                    The kernel&apos;s deliberate narrowness is what enables universality above it. <code>FigaroCore</code> runs <Link href="/cryptoeconomics" className="underline hover:text-black">two mechanisms doing distinct work</Link>: <strong>asymmetric bonding</strong> (the bilateral Nash equilibrium that scales from two parties to N-party process trees through progressive collateralization) and <strong>buyer dominance with atomic resolution</strong> (the weakest-link subgame that propagates cooperation pressure through the scaled mesh). Together they make trade self-enforcing without an arbitrator. The kernel takes no position on currency, jurisdiction, identity, arbitration, role structure, or contribution metric, so a wide range of economic arrangements can be expressed on top. A market-liberal graph, a cooperative graph, a mutual-aid graph &mdash; all use the same kernel. The kernel is ideologically agnostic; the graph is the politics.
                </p>

                <p className="text-sm text-gray-600 leading-relaxed mt-6">
                    Any internal exit path weakens the Nash equilibrium (Theorem 4.7). Extensions live outside the kernel and compose via the coordinator pattern.
                </p>
            </section>

            {/* Reading-path signpost */}
            <section className="container mx-auto px-6 pb-24 max-w-3xl border-t border-gray-200 pt-12">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-4">
                    Read next
                </p>
                <ol className="space-y-2 text-base text-gray-700">
                    <li>
                        1. <Link href="/cryptoeconomics" className="underline hover:text-black font-semibold">Cryptoeconomics</Link>
                        <span className="text-sm text-gray-500"> &mdash; the two mechanisms in plain language.</span>
                    </li>
                    <li>
                        2. <Link href="/foundations" className="underline hover:text-black font-semibold">Foundations</Link>
                        <span className="text-sm text-gray-500"> &mdash; the eight-discipline taxonomy and the paper portfolio.</span>
                    </li>
                </ol>
            </section>
        </>
    );
}
