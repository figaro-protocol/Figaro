import Link from "next/link";

export default function Home() {
    return (
        <>
            {/* Mission — property line from docs/v5/ONE_PAGER.md */}
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
                    <li className="border-b border-gray-100 px-5 py-4 bg-gray-50">
                        <div className="flex items-baseline justify-between gap-3 flex-wrap">
                            <span className="text-black font-semibold">Trade</span>
                            <span className="text-xs text-gray-500 font-mono">people and agents transacting</span>
                        </div>
                    </li>
                    <li className="border-b border-gray-100 px-5 py-4 bg-gray-200/60">
                        <div className="flex items-baseline justify-between gap-3 flex-wrap">
                            <span className="text-black font-semibold">Off-chain composition</span>
                            <span className="text-xs text-gray-500 font-mono">any service</span>
                        </div>
                        <p className="text-xs text-gray-700 mt-1">UI, messaging (XMTP), geohashing (H3), maps, storage (IPFS, Arweave), indexers, agent clients. Centralized or decentralized, web2 or web3 — the kernel is indifferent.</p>
                    </li>
                    <li className="border-b border-gray-100 px-5 py-4 bg-gray-400/40">
                        <div className="flex items-baseline justify-between gap-3 flex-wrap">
                            <span className="text-black font-semibold">On-chain composition</span>
                            <span className="text-xs text-gray-500 font-mono">any contract</span>
                        </div>
                        <p className="text-xs text-gray-700 mt-1">Attestation coordinator, schema registry, per-schema validators, <code>DutchAuction</code>, <code>OperatorRegistry</code>, batch verifier, assembly manifests. External protocols plug in identically — Kleros, oracles, offset markets, lending pools.</p>
                    </li>
                    <li className="border-b border-gray-700 px-5 py-4 bg-black text-white">
                        <div className="flex items-baseline justify-between gap-3 flex-wrap">
                            <span className="font-semibold">Kernel</span>
                            <span className="text-xs text-gray-300 font-mono">FigaroCore</span>
                        </div>
                        <p className="text-xs text-gray-200 mt-1">Asymmetric bonding (buyer 2P, seller 2V) → Nash equilibrium, scaling to N parties via progressive collateralization. Buyer dominance and atomic resolution compose with the scaled mesh. No owner, no admin, no escape hatches.</p>
                    </li>
                    <li className="px-5 py-4 bg-white">
                        <div className="flex items-baseline justify-between gap-3 flex-wrap">
                            <span className="text-black font-semibold">Network</span>
                            <span className="text-xs text-gray-500 font-mono">any EVM chain</span>
                        </div>
                        <p className="text-xs text-gray-700 mt-1">Consensus, tamper-evident history, finality. Everything above inherits from this floor.</p>
                    </li>
                </ol>

                <div className="border border-dashed border-gray-300 rounded-lg px-5 py-4 mt-4">
                    <div className="flex items-baseline justify-between gap-3 flex-wrap">
                        <span className="text-xs font-semibold uppercase tracking-widest text-gray-500">Edge</span>
                        <span className="text-xs text-gray-500 font-mono">Kleros · courts</span>
                    </div>
                    <p className="text-xs text-gray-700 mt-2">
                        Theoretical residual in the Grameen regime (~2%). Evidence bundle exports to off-chain forums. <Link href="/about#enforcement" className="underline">Enforcement</Link>.
                    </p>
                </div>

                <p className="text-base text-gray-700 leading-relaxed mt-8">
                    The kernel&apos;s deliberate narrowness is what enables universality above it. <code>FigaroCore</code> runs one mechanism — asymmetric bonding — which scales itself from two parties to N-party process trees, plus two rules (buyer dominance, atomic resolution) that compose with the scaled mesh. It takes no position on currency, jurisdiction, identity, arbitration, role structure, or contribution metric, so any economic system can be expressed on top. A market-liberal graph, a cooperative graph, an Islamic-finance graph, a mutual-aid graph, a diaspora-network graph — all use the same kernel. The kernel is ideologically agnostic; the graph is the politics.
                </p>

                <p className="text-sm text-gray-600 leading-relaxed mt-6">
                    Composition is external-first. Any internal exit path weakens the Nash equilibrium, so extensions live outside the kernel; external composition preserves the bonding equilibrium under a coordinator pattern.
                </p>
            </section>
        </>
    );
}
