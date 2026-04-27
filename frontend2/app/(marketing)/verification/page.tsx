import Link from "next/link";

export default function Verification() {
    return (
        <>

            {/* Hero */}
            <section className="container mx-auto px-6 pt-24 pb-12 max-w-3xl">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-4">
                    Implementation &amp; verification
                </p>
                <h1 className="text-5xl sm:text-6xl font-bold text-black leading-tight tracking-tight mb-6">
                    Four toolchains. The same seven properties. From four directions.
                </h1>
                <p className="text-xl text-gray-600 leading-relaxed max-w-2xl">
                    The kernel is two functions and three mappings &mdash; ownerless, fee-less, admin-less. The verification stack exercises the same invariants from TLA⁺, Echidna, Halmos, and Certora, each catching what the others would miss.
                </p>
            </section>

            {/* Why four */}
            <section className="container mx-auto px-6 pb-16 max-w-3xl border-t border-gray-100 pt-12">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-3">
                    Why four
                </p>
                <h2 className="text-3xl font-bold text-black mb-6 leading-tight">
                    Each tool covers what the others can&apos;t.
                </h2>
                <div className="space-y-6 text-sm text-gray-700 leading-relaxed">
                    <div>
                        <div className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">TLA⁺ (TLC model checking)</div>
                        <p>Captures the full state machine; explores all reachable states under bounded parameters by breadth-first search. Strength: high-level state-machine reasoning, abstracts cryptography and ERC-20 mechanics to expose accounting errors. Weakness: bounded by parameters; gives no guarantee for unbounded state.</p>
                    </div>
                    <div>
                        <div className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">Echidna (property-based fuzzing)</div>
                        <p>Runs randomized call sequences against deployed bytecode under HEVM, with EIP-712 signing via cheatcodes. Strength: exercises real bytecode against concrete adversaries. Weakness: random sampling; finds bugs but doesn&apos;t prove their absence.</p>
                    </div>
                    <div>
                        <div className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">Halmos (z3 symbolic execution)</div>
                        <p>Encodes call traces as SMT formulas and asks z3 whether any concrete input satisfies the negation of an invariant. When it returns verified, the property holds for all inputs in the modeled trace.</p>
                    </div>
                    <div>
                        <div className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">Certora (CVL specification checking)</div>
                        <p>SMT-based proving of CVL rules against bytecode on the Certora cloud. Rules can quantify over methods (&ldquo;no method modifies X&rdquo;), allowing universal statements that the other tools cannot express directly.</p>
                    </div>
                </div>
            </section>

            {/* Headline numbers */}
            <section className="container mx-auto px-6 pb-16 max-w-3xl border-t border-gray-100 pt-12">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-3">
                    Snapshot &mdash; 2026-04-23
                </p>
                <h2 className="text-3xl font-bold text-black mb-6 leading-tight">
                    Verification surface.
                </h2>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="border border-gray-200 rounded-lg p-5">
                        <div className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">TLA⁺</div>
                        <div className="text-3xl font-bold text-black mb-1">7</div>
                        <p className="text-xs text-gray-500 leading-relaxed">
                            Kernel invariants exhaustively model-checked across <strong>6,087,113 distinct states</strong> in 4m 8s. Two buyers, two sellers, payments 1&ndash;3, two concurrent processes, two sub-orders each.
                        </p>
                    </div>
                    <div className="border border-gray-200 rounded-lg p-5">
                        <div className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">Echidna</div>
                        <div className="text-3xl font-bold text-black mb-1">7</div>
                        <p className="text-xs text-gray-500 leading-relaxed">
                            Property invariants under a 50,000-call campaign budget, sequence length 30, three deployer/sender accounts. Most recent run exercised ~43k individual calls without counterexample.
                        </p>
                    </div>
                    <div className="border border-gray-200 rounded-lg p-5">
                        <div className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">Halmos</div>
                        <div className="text-3xl font-bold text-black mb-1">7</div>
                        <p className="text-xs text-gray-500 leading-relaxed">
                            Symbolic-execution proofs discharged by z3: token conservation, contract solvency, bond amount correctness, resolution payouts, status transitions, buyer dominance, cumulative monotonicity.
                        </p>
                    </div>
                    <div className="border border-gray-200 rounded-lg p-5">
                        <div className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-2">Certora</div>
                        <div className="text-3xl font-bold text-black mb-1">25</div>
                        <p className="text-xs text-gray-500 leading-relaxed">
                            CVL rules across three specs &mdash; kernel (8), attestation surface (9; 6 role-gate + 3 validator-gate), token-operations conservation (8). All discharged on Certora cloud.
                        </p>
                    </div>
                </div>
                <p className="mt-6 text-xs text-gray-500 leading-relaxed">
                    Counts will grow as the surface expands. The methodology is the stable artifact; numbers are re-issued per release.
                </p>
            </section>

            {/* Reproducibility */}
            <section className="container mx-auto px-6 pb-16 max-w-3xl border-t border-gray-100 pt-12">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-3">
                    Reproduce
                </p>
                <h2 className="text-3xl font-bold text-black mb-6 leading-tight">
                    Run the suite yourself.
                </h2>
                <div className="space-y-3 text-sm text-gray-700 leading-relaxed">
                    <p className="font-mono text-xs bg-gray-50 border border-gray-200 rounded px-3 py-2">forge test --via-ir</p>
                    <p className="font-mono text-xs bg-gray-50 border border-gray-200 rounded px-3 py-2">./test-tla.sh</p>
                    <p className="font-mono text-xs bg-gray-50 border border-gray-200 rounded px-3 py-2">./test-echidna.sh</p>
                    <p className="font-mono text-xs bg-gray-50 border border-gray-200 rounded px-3 py-2">./test-halmos.sh</p>
                    <p className="font-mono text-xs bg-gray-50 border border-gray-200 rounded px-3 py-2">./test-certora.sh</p>
                </div>
                <p className="mt-4 text-xs text-gray-500 leading-relaxed">
                    Prereqs: Foundry (<code>--via-ir</code> required), Java 11+ for TLC, <code>brew install z3 echidna</code>, Certora CLI with <code>CERTORAKEY</code>. The Certora prelude runs <code>lint-token-ops.sh</code> to gate the inventory against new ERC-20 transfer call sites in <code>src/</code>.
                </p>
            </section>

            {/* The coordinator pattern */}
            <section className="container mx-auto px-6 pb-16 max-w-3xl border-t border-gray-100 pt-12">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-3">
                    Composition
                </p>
                <h2 className="text-3xl font-bold text-black mb-6 leading-tight">
                    Extending the kernel without breaking it.
                </h2>
                <p className="text-sm text-gray-700 leading-relaxed mb-6">
                    An external mechanism preserves the bonding equilibrium if it satisfies four sufficient conditions:
                </p>
                <ol className="space-y-3 text-sm text-gray-700 leading-relaxed list-decimal pl-5 mb-6">
                    <li><strong>Read-only kernel access</strong> &mdash; <code>staticcall</code> or event consumption only.</li>
                    <li><strong>Role non-impersonation</strong> &mdash; the mechanism never calls <code>commit</code> or <code>resolveProcess</code> on behalf of a buyer or seller.</li>
                    <li><strong>Bond non-modification</strong> &mdash; the mechanism holds no kernel bonds and does not interpose between parties and bond transfers.</li>
                    <li><strong>No bypass</strong> &mdash; no alternative resolution path or escape from Active.</li>
                </ol>
                <p className="text-sm text-gray-700 leading-relaxed">
                    Three reference instances ship: a Dutch auction (price discovery and role allocation, zero token custody), the attestation coordinator (schema-typed lifecycle and disclosure events, validator-gated, never touches kernel state), and the schema and operator registries (event-only coordination layers).
                </p>
            </section>

            {/* Read more */}
            <section className="container mx-auto px-6 pb-32 max-w-3xl border-t border-gray-100 pt-12">
                <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-6">
                    <div className="max-w-xl">
                        <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-3">
                            Read the paper
                        </p>
                        <p className="text-sm text-gray-700 leading-relaxed">
                            The full implementation paper covers the smart-contract architecture, design non-decisions (and the property each absence preserves), the four-tool methodology, the verification results, the threat model, and the coordinator pattern.
                        </p>
                    </div>
                    <a
                        href="/papers/figaro-verification.pdf"
                        className="shrink-0 inline-flex items-center justify-center px-6 py-3 bg-black text-white text-sm font-semibold rounded-lg hover:bg-gray-900 transition-colors"
                    >
                        Download paper (C) &rarr;
                    </a>
                </div>
                <div className="mt-8 text-sm text-gray-500">
                    <p>
                        For builders:&nbsp;
                        <Link href="/builders" className="underline hover:text-black transition-colors">
                            the builder docs
                        </Link>
                        &nbsp;cover composition above the kernel. For the mechanism itself:&nbsp;
                        <Link href="/research" className="underline hover:text-black transition-colors">
                            research index
                        </Link>.
                    </p>
                </div>
            </section>

        </>
    );
}
