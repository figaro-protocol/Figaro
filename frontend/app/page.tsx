import { Header } from "@/components/shared/Header";
import { Footer } from "@/components/shared/Footer";

export default function Home() {
    return (
        <main className="min-h-screen bg-white">
            <Header />

            {/* Hero */}
            <section className="container mx-auto px-6 pt-24 pb-16 max-w-3xl">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-4">
                    Trade Infrastructure
                </p>
                <h1 className="text-5xl sm:text-6xl font-bold text-black leading-tight tracking-tight mb-6">
                    The infrastructure layer for trade between strangers.
                </h1>
                <p className="text-xl text-gray-600 leading-relaxed max-w-2xl">
                    Figaro is to commerce what TCP/IP is to the internet — a base layer others build on. Both parties in a trade lock stakes into the protocol before any work begins. The stakes are sized so that breaking the agreement always costs more than keeping it. No third party needed to enforce anything.
                </p>
            </section>

            {/* Process tree diagram */}
            <section className="container mx-auto px-6 pb-20 max-w-3xl">
                <div className="border border-gray-200 rounded-lg p-8 bg-gray-50">
                    <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-2 text-center">
                        How a trade commitment works
                    </p>
                    <p className="text-xs text-gray-500 text-center mb-8">
                        Example: food delivery. Any trade workflow can be structured this way.
                    </p>

                    <div className="flex justify-center">
                        <svg
                            width="520"
                            height="280"
                            viewBox="0 0 520 280"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                            className="w-full max-w-lg"
                            aria-label="Process tree diagram showing a root commitment branching into sub-processes that resolve atomically"
                        >
                            {/* Root node */}
                            <rect x="160" y="0" width="200" height="52" rx="6" fill="white" stroke="#111" strokeWidth="1.5" />
                            <text x="260" y="20" textAnchor="middle" fontSize="11" fontWeight="600" fill="#111">Root Commitment</text>
                            <text x="260" y="36" textAnchor="middle" fontSize="10" fill="#555">Buyer 2× · Seller 2× · Stakes locked</text>

                            {/* Root → branch */}
                            <line x1="260" y1="52" x2="260" y2="80" stroke="#bbb" strokeWidth="1.5" />
                            <line x1="90" y1="80" x2="430" y2="80" stroke="#bbb" strokeWidth="1.5" />
                            <line x1="90" y1="80" x2="90" y2="108" stroke="#bbb" strokeWidth="1.5" />
                            <line x1="260" y1="80" x2="260" y2="108" stroke="#bbb" strokeWidth="1.5" />
                            <line x1="430" y1="80" x2="430" y2="108" stroke="#bbb" strokeWidth="1.5" />

                            {/* Sub-process: Step A */}
                            <rect x="20" y="108" width="140" height="44" rx="5" fill="white" stroke="#999" strokeWidth="1" />
                            <text x="90" y="126" textAnchor="middle" fontSize="10" fontWeight="600" fill="#333">Step A</text>
                            <text x="90" y="141" textAnchor="middle" fontSize="9" fill="#777">Seller prepares order</text>

                            {/* Sub-process: Step B */}
                            <rect x="190" y="108" width="140" height="44" rx="5" fill="white" stroke="#999" strokeWidth="1" />
                            <text x="260" y="126" textAnchor="middle" fontSize="10" fontWeight="600" fill="#333">Step B</text>
                            <text x="260" y="141" textAnchor="middle" fontSize="9" fill="#777">Third party delivers</text>

                            {/* Sub-process: Step C */}
                            <rect x="360" y="108" width="140" height="44" rx="5" fill="white" stroke="#999" strokeWidth="1" />
                            <text x="430" y="126" textAnchor="middle" fontSize="10" fontWeight="600" fill="#333">Step C</text>
                            <text x="430" y="141" textAnchor="middle" fontSize="9" fill="#777">Buyer confirms receipt</text>

                            {/* Converge */}
                            <line x1="90" y1="152" x2="90" y2="200" stroke="#bbb" strokeWidth="1.5" />
                            <line x1="260" y1="152" x2="260" y2="200" stroke="#bbb" strokeWidth="1.5" />
                            <line x1="430" y1="152" x2="430" y2="200" stroke="#bbb" strokeWidth="1.5" />
                            <line x1="90" y1="200" x2="430" y2="200" stroke="#bbb" strokeWidth="1.5" />
                            <line x1="260" y1="200" x2="260" y2="224" stroke="#111" strokeWidth="1.5" />

                            {/* Settlement node */}
                            <rect x="160" y="224" width="200" height="52" rx="6" fill="#111" stroke="#111" strokeWidth="1.5" />
                            <text x="260" y="244" textAnchor="middle" fontSize="11" fontWeight="600" fill="white">Atomic Settlement</text>
                            <text x="260" y="260" textAnchor="middle" fontSize="10" fill="#aaa">Entire tree resolves — all or nothing</text>
                        </svg>
                    </div>
                </div>
            </section>

            {/* Intermediaries */}
            <section className="container mx-auto px-6 pb-20 max-w-3xl border-t border-gray-100 pt-12">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-5">
                    To enforce a trade agreement between strangers, you need none of these.
                </p>
                <p className="text-lg leading-relaxed">
                    <span className="text-black font-medium">No lawyers.</span>{" "}
                    <span className="text-black font-medium">No bankers.</span>{" "}
                    <span className="text-black font-medium">No accountants.</span>{" "}
                    <span className="text-black font-medium">No management.</span>{" "}
                    <span className="text-black font-medium">No platforms.</span>{" "}
                    <span className="text-black font-medium">No arbiters.</span>{" "}
                    <span className="text-black font-medium">No custodians.</span>{" "}
                    <span className="text-black font-medium">No payment rails.</span>{" "}
                    <span className="text-black font-medium">No auditors.</span>{" "}
                    <span className="text-black font-medium">No brokers.</span>
                </p>
            </section>

            {/* Three properties */}
            <section className="container mx-auto px-6 pb-20 max-w-3xl border-t border-gray-100 pt-12">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-8">
                    <div>
                        <div className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-2">Self-enforcing</div>
                        <p className="text-sm text-gray-700 leading-relaxed">
                            Both parties lock stakes before work begins. The stakes are sized so breaking the agreement always costs more than keeping it. No external enforcement needed.
                        </p>
                    </div>
                    <div>
                        <div className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-2">Composable</div>
                        <p className="text-sm text-gray-700 leading-relaxed">
                            A trade commitment branches into sub-processes — any steps the workflow requires. Every step is recorded on-chain. Settlement resolves the entire tree at once, atomically.
                        </p>
                    </div>
                    <div>
                        <div className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-2">Ownerless</div>
                        <p className="text-sm text-gray-700 leading-relaxed">
                            No admin key. No fee switch. No capture. The protocol enforces the rules through the economics of the commitment. It cannot be owned and cannot extract rent.
                        </p>
                    </div>
                </div>
            </section>

            {/* CTAs */}
            <section className="container mx-auto px-6 pb-32 max-w-3xl border-t border-gray-100 pt-12">
                <p className="text-sm text-gray-500 mb-6">
                    Figaro Eats is a reference implementation — a food delivery workflow built on the protocol end to end. The Builders page is for deploying your own.
                </p>
                <div className="flex flex-col sm:flex-row gap-4">
                    <a
                        href="/figaro-eats"
                        className="flex-[2] text-center px-8 py-4 bg-black text-white font-semibold rounded-lg hover:bg-gray-900 transition-colors"
                    >
                        Try it &rarr; Figaro Eats
                    </a>
                    <a
                        href="/builders"
                        className="flex-1 text-center px-8 py-4 bg-white text-black font-semibold rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors text-sm"
                    >
                        Build on Figaro
                    </a>
                </div>
            </section>

            <Footer />
        </main>
    );
}
