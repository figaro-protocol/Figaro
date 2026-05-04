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
                    A protocol for trade between strangers. No platform in the middle. No arbitrator behind it. No escape if either party cheats.
                </p>
                <p className="text-base text-gray-700 leading-relaxed max-w-2xl mb-4">
                    Both parties stake more than the deal is worth. Cooperation is the only winning move. The deal settles itself.
                </p>
                <p className="text-base text-gray-700 leading-relaxed max-w-2xl mb-6 font-medium">
                    Use it and be free. Verifiable terms. Composes like Lego.
                </p>
                <p className="text-base text-gray-700 leading-relaxed max-w-2xl mb-4">
                    Two people who have never met can make a deal, and both will keep it &mdash; not because they trust each other, not because a judge is watching, but because breaking the deal costs more than keeping it. By construction. Figaro is a coordination protocol &mdash; not DeFi, not TradFi &mdash; a primitive for enforcing bilateral agreements, closer to TCP/IP than to a bank or a DEX. Permissionless, ownerless, EVM-portable.
                </p>
                <p className="text-sm text-gray-500 leading-relaxed max-w-2xl">
                    What this is and is not &mdash; see <Link href="/about" className="underline hover:text-black">About</Link>.
                </p>
            </section>

            {/* Reading-path signpost */}
            <section className="container mx-auto px-6 pb-24 max-w-3xl border-t border-gray-200 pt-12">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-4">
                    Read next
                </p>
                <ol className="space-y-2 text-base text-gray-700">
                    <li>
                        1. <Link href="/protocol" className="underline hover:text-black font-semibold">Protocol</Link>
                        <span className="text-sm text-gray-500"> &mdash; the two mechanisms in plain language.</span>
                    </li>
                    <li>
                        2. <Link href="/cryptoeconomics" className="underline hover:text-black font-semibold">Cryptoeconomics</Link>
                        <span className="text-sm text-gray-500"> &mdash; the eight-discipline taxonomy and the paper portfolio.</span>
                    </li>
                    <li>
                        3. <Link href="/composability" className="underline hover:text-black font-semibold">Composability</Link>
                        <span className="text-sm text-gray-500"> &mdash; what the kernel&apos;s narrowness produces, and the coordinator pattern that preserves it.</span>
                    </li>
                </ol>
            </section>
        </>
    );
}
