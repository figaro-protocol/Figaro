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
                    Making trade work.
                </h1>
                <p className="text-xl text-gray-800 leading-relaxed max-w-2xl mb-4">
                    Self-enforcing agreements between strangers.
                </p>
                <p className="text-base text-gray-700 leading-relaxed max-w-2xl mb-4">
                    Two people who have never met can make a deal, and both will keep it — not because they trust each other, not because a judge is watching, but because breaking the deal costs more than keeping it. Automatically.
                </p>
                <p className="text-base text-gray-700 leading-relaxed max-w-2xl">
                    Figaro is a coordination protocol. Not DeFi. Not TradFi. It is a primitive for enforcing bilateral agreements — closer to TCP/IP than to a bank or a DEX. Permissionless, ownerless, and chain-agnostic. It deploys on any EVM network.
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
                        <span className="text-black font-semibold">UI · Runtime</span>
                        <span className="text-xs text-gray-500 font-mono">assemblies · modules · skins</span>
                    </li>
                    <li className="border-b border-gray-100 px-5 py-3 bg-gray-200/70 flex items-baseline justify-between gap-3 flex-wrap">
                        <span className="text-black font-semibold">Services</span>
                        <span className="text-xs text-gray-500 font-mono">messaging · storage · identity</span>
                    </li>
                    <li className="border-b border-gray-100 px-5 py-3 bg-gray-300/70 flex items-baseline justify-between gap-3 flex-wrap">
                        <span className="text-black font-semibold">Schemas</span>
                        <span className="text-xs text-gray-600 font-mono">typed content · 3-layer validation</span>
                    </li>
                    <li className="border-b border-gray-100 px-5 py-3 bg-gray-500/40 flex items-baseline justify-between gap-3 flex-wrap">
                        <span className="text-black font-semibold">Protocol contracts</span>
                        <span className="text-xs text-gray-700 font-mono">attestation · auction · registries</span>
                    </li>
                    <li className="border-b border-gray-800 px-5 py-3 bg-black text-white flex items-baseline justify-between gap-3 flex-wrap">
                        <span className="font-semibold">Kernel</span>
                        <span className="text-xs text-gray-300 font-mono">FigaroCore — the bonded primitive</span>
                    </li>
                    <li className="px-5 py-3 bg-white flex items-baseline justify-between gap-3 flex-wrap">
                        <span className="text-black font-semibold">Network</span>
                        <span className="text-xs text-gray-500 font-mono">any EVM chain</span>
                    </li>
                </ol>

                <div className="border border-dashed border-gray-300 rounded-lg px-5 py-3 mt-4 flex items-baseline justify-between gap-3 flex-wrap">
                    <span className="text-xs font-semibold uppercase tracking-widest text-gray-500">Edge</span>
                    <span className="text-xs text-gray-500 font-mono">Kleros · courts (Layer-3 residual)</span>
                </div>

                <p className="text-xs text-gray-500 mt-3 leading-relaxed">
                    Adjacent dimension &mdash; <Link href="/fig/design" className="underline hover:text-black">FIG</Link>, <Link href="/groups" className="underline hover:text-black">Groups</Link>, <Link href="/foundations" className="underline hover:text-black">Foundations</Link> fund the work that produces the layers above.
                </p>

                <p className="text-base text-gray-700 leading-relaxed mt-8">
                    The kernel&apos;s deliberate narrowness is what enables universality above it. <code>FigaroCore</code> runs two mechanisms doing distinct work: <strong>asymmetric bonding</strong> (the bilateral Nash equilibrium that scales from two parties to N-party process trees through progressive collateralization) and <strong>buyer dominance with atomic resolution</strong> (the weakest-link subgame that propagates cooperation pressure through the scaled mesh). Together they make trade self-enforcing without an arbitrator. The kernel takes no position on currency, jurisdiction, identity, arbitration, role structure, or contribution metric, so any economic system can be expressed on top. A market-liberal graph, a cooperative graph, an Islamic-finance graph, a mutual-aid graph, a diaspora-network graph — all use the same kernel. The kernel is ideologically agnostic; the graph is the politics.
                </p>

                <p className="text-sm text-gray-600 leading-relaxed mt-6">
                    Composition is external-first. Any internal exit path weakens the Nash equilibrium, so extensions live outside the kernel; external composition preserves the bonding equilibrium under a coordinator pattern.
                </p>
            </section>
        </>
    );
}
