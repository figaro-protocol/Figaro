export default function BuildersPage() {
    return (
        <div>

            {/* Hero */}
            <section className="container mx-auto px-6 pt-24 pb-16 max-w-3xl">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-4">
                    Build on Figaro
                </p>
                <h1 className="text-5xl sm:text-6xl font-bold text-black leading-tight tracking-tight mb-6">
                    Design the workflow.<br />The protocol handles enforcement.
                </h1>
                <p className="text-xl text-gray-600 leading-relaxed max-w-2xl mb-6">
                    Building on Figaro means composing a trade workflow from protocol components. The protocol enforces whatever structure you define. You do not rebuild settlement, bonding, or dispute evidence from scratch.
                </p>
                <ul className="space-y-1 text-sm text-gray-500">
                    <li>— Bonding mechanics</li>
                    <li>— Attestation schemas</li>
                    <li>— Handoff conditions</li>
                    <li>— Allocation mechanisms</li>
                </ul>
            </section>

            {/* Two roles */}
            <section className="container mx-auto px-6 pb-20 max-w-3xl border-t border-gray-100 pt-12">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-8">
                    Two distinct roles in a Figaro build
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                    <div className="border border-gray-200 rounded-lg p-6">
                        <div className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">Designer</div>
                        <p className="text-sm text-gray-700 leading-relaxed mb-3">
                            Composes a workflow assembly from protocol components. Defines the parties, the process steps, the mechanisms at each step, and the attestation requirements. Publishes the assembly for operators to join.
                        </p>
                        <p className="text-xs text-gray-400">Example: designing a delivery workflow where driver allocation uses a Dutch auction and each handoff requires a proximity attestation.</p>
                    </div>
                    <div className="border border-gray-200 rounded-lg p-6">
                        <div className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">Operator</div>
                        <p className="text-sm text-gray-700 leading-relaxed mb-3">
                            Joins an existing assembly and signals their capabilities. A restaurant signals it offers on-site dining, pickup, and delivery. A driver signals availability and accepted allocation mechanisms. Buyers at checkout see what operators have signaled.
                        </p>
                        <p className="text-xs text-gray-400 mb-4">Example: a restaurant configuring participation in Figaro Eats — which services it offers and which delivery mechanisms it accepts.</p>
                        <a href="/operators" className="text-xs font-semibold text-black underline hover:text-gray-600 transition-colors">Register as an operator &rarr;</a>
                    </div>
                </div>
            </section>

            {/* Security boundary — moved up */}
            <section className="container mx-auto px-6 pb-20 max-w-3xl border-t border-gray-100 pt-12">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-3">
                    Security boundary
                </p>
                <p className="text-sm text-gray-500 mb-8">
                    The protocol guarantees certain properties unconditionally. Everything outside that boundary is the builder's responsibility. Understanding where the line is matters before you build.
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                    <div>
                        <div className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1">What you inherit</div>
                        <p className="text-xs text-gray-400 mb-1">227 Foundry unit tests &middot; 7 Echidna property invariants &middot; 7 TLA+ invariants (2M+ states)</p>
                        <p className="text-xs text-gray-400 mb-4">7 Halmos symbolic proofs — properties proven to hold for all possible inputs, not just concrete test vectors.</p>
                        <ul className="space-y-3 text-sm text-gray-700">
                            <li className="flex gap-3">
                                <span className="font-mono text-xs text-gray-400 mt-0.5 w-10 shrink-0">SOLV</span>
                                <span>Core token balance is always greater than or equal to the sum of all outstanding bonds. The protocol is always solvent.</span>
                            </li>
                            <li className="flex gap-3">
                                <span className="font-mono text-xs text-gray-400 mt-0.5 w-10 shrink-0">CONS</span>
                                <span>Token conservation. Total supply is constant — the protocol cannot create or destroy value.</span>
                            </li>
                            <li className="flex gap-3">
                                <span className="font-mono text-xs text-gray-400 mt-0.5 w-10 shrink-0">MONO</span>
                                <span>Order status only moves forward — Pending → Active → Resolved. No backward transitions. No escape hatches.</span>
                            </li>
                            <li className="flex gap-3">
                                <span className="font-mono text-xs text-gray-400 mt-0.5 w-10 shrink-0">BUYER</span>
                                <span>Only the buyer of a process can trigger settlement. Seller dominance is structurally impossible.</span>
                            </li>
                            <li className="flex gap-3">
                                <span className="font-mono text-xs text-gray-400 mt-0.5 w-10 shrink-0">ATOM</span>
                                <span>An incomplete order list cannot resolve a process. Settlement is all-or-nothing — cherry-picking is blocked on-chain.</span>
                            </li>
                            <li className="flex gap-3">
                                <span className="font-mono text-xs text-gray-400 mt-0.5 w-10 shrink-0">CUM</span>
                                <span>The process accumulator always equals the sum of all order payments. Bond accounting cannot be underfunded.</span>
                            </li>
                            <li className="flex gap-3">
                                <span className="font-mono text-xs text-gray-400 mt-0.5 w-10 shrink-0">COUNT</span>
                                <span>Active order count matches the actual committed order count on-chain at all times.</span>
                            </li>
                        </ul>
                    </div>
                    <div>
                        <div className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1">What you own</div>
                        <p className="text-xs text-gray-400 mb-4">Five responsibilities that belong to the builder, not the protocol.</p>
                        <ul className="space-y-3 text-sm text-gray-700">
                            <li className="flex gap-3">
                                <span className="text-black mt-0.5">—</span>
                                <span>Your assembly configuration. The protocol cannot verify that your workflow is correctly structured. A misconfigured assembly is your risk, not the protocol's.</span>
                            </li>
                            <li className="flex gap-3">
                                <span className="text-black mt-0.5">—</span>
                                <span>Any Level 3 contracts you introduce. New mechanisms bring new failure modes. The protocol does not extend its guarantees to code it did not deploy.</span>
                            </li>
                            <li className="flex gap-3">
                                <span className="text-black mt-0.5">—</span>
                                <span>Custom attestation schemas. The protocol records what you define — it does not validate whether your schema reflects reality.</span>
                            </li>
                            <li className="flex gap-3">
                                <span className="text-black mt-0.5">—</span>
                                <span>Operator identity and onboarding. The protocol has no KYC. Who you let into your assembly, and how you verify them, is your design decision.</span>
                            </li>
                            <li className="flex gap-3">
                                <span className="text-black mt-0.5">—</span>
                                <span>Claims you make in your UI. Do not imply protocol-level guarantees for properties your assembly does not actually enforce.</span>
                            </li>
                        </ul>
                    </div>
                </div>
                <div className="mt-8 pt-6 border-t border-gray-100">
                    <p className="text-xs text-gray-500 leading-relaxed">
                        <span className="font-semibold text-gray-700">Audit status:</span> The protocol has not yet had an independent security audit. Formal verification and fuzzing reduce but do not eliminate risk. <a href="/help#audit" className="underline hover:text-gray-700">What does this mean for builders? →</a>
                    </p>
                </div>
            </section>

            {/* Three levels */}
            <section className="container mx-auto px-6 pb-20 max-w-3xl border-t border-gray-100 pt-12">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-8">
                    Three levels of composition — start at the lowest viable level
                </p>
                <div className="space-y-4">
                    <div className="border-l-2 border-gray-300 pl-6 py-2">
                        <div className="flex items-baseline justify-between mb-3">
                            <div className="text-sm font-bold text-black">Level 1 — Existing contracts only</div>
                            <div className="text-xs text-gray-400">~1 day &middot; No new contract risk</div>
                        </div>
                        <p className="text-sm text-gray-700 leading-relaxed">
                            Compose an assembly using the existing protocol contracts, mechanism modules, and attestation schemas. Define the roles, steps, and handoff conditions. No new on-chain code. The entire value comes from the workflow configuration.
                        </p>
                    </div>
                    <div id="sdk" className="border-l-2 border-gray-500 pl-6 py-2">
                        <div className="flex items-baseline justify-between mb-3">
                            <div className="text-sm font-bold text-black">Level 2 — Add custom schemas</div>
                            <div className="text-xs text-gray-400">~2–5 days &middot; Low risk</div>
                        </div>
                        <p className="text-sm text-gray-700 leading-relaxed">
                            Do everything in Level 1, then register custom attestation schemas for workflow-specific data — domain-specific lifecycle events, compliance fields, industry reporting requirements. The settlement substrate does not change.
                        </p>
                    </div>
                    <div id="contracts" className="border-l-2 border-black pl-6 py-2">
                        <div className="flex items-baseline justify-between mb-3">
                            <div className="text-sm font-bold text-black">Level 3 — New mechanism contract</div>
                            <div className="text-xs text-gray-400">~1–3 weeks &middot; Requires audit</div>
                        </div>
                        <p className="text-sm text-gray-700 leading-relaxed">
                            Write and deploy a new smart contract — a new allocation mechanism, a new pricing model, a new coordination primitive — and integrate it into the ecosystem. Then compose your assembly using Levels 1 and 2. This is protocol extension, not configuration. Audit before deployment.
                        </p>
                    </div>
                </div>
            </section>

            {/* Three enforcement layers */}
            <section className="container mx-auto px-6 pb-20 max-w-3xl border-t border-gray-100 pt-12">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-3">
                    How enforcement works
                </p>
                <p className="text-sm text-gray-500 mb-8">
                    Three layers operate in sequence. The primary layer is economic — no external party needed.
                </p>
                <div className="space-y-6">
                    <div className="flex gap-6 items-start">
                        <span className="text-xs font-bold uppercase tracking-widest text-gray-400 w-6 shrink-0 pt-1">L1</span>
                        <div>
                            <div className="text-sm font-semibold text-black mb-1">Mechanism design</div>
                            <p className="text-sm text-gray-700">Both parties lock 2× stakes before work begins. Defection always costs more than cooperation. No external party needed. Your assembly inherits this unconditionally.</p>
                        </div>
                    </div>
                    <div className="flex gap-6 items-start">
                        <span className="text-xs font-bold uppercase tracking-widest text-gray-400 w-6 shrink-0 pt-1">L2</span>
                        <div>
                            <div className="text-sm font-semibold text-black mb-1">Social enforcement</div>
                            <p className="text-sm text-gray-700">In a multi-party process tree, every contributor's failure to deliver affects all others. Contributors police each other — the same dynamic as Grameen Bank micro-lending circles. This layer grows stronger as your workflow grows larger. Design for it.</p>
                        </div>
                    </div>
                    <div className="flex gap-6 items-start">
                        <span className="text-xs font-bold uppercase tracking-widest text-gray-400 w-6 shrink-0 pt-1">L3</span>
                        <div>
                            <div className="text-sm font-semibold text-black mb-1">Evidence and arbitration</div>
                            <p className="text-sm text-gray-700">For what remains, the protocol automatically produces court-grade evidence — role-gated, block-timestamped on-chain attestations. Kleros decentralized arbitration is an optional integration. Any dispute forum works. Your assembly chooses whether to enable it.</p>
                        </div>
                    </div>
                </div>
                <p className="mt-6 text-xs text-gray-400">
                    <a href="/help#enforcement" className="underline hover:text-gray-600">How does enforcement work in detail? →</a>
                </p>
            </section>

            {/* Coming next */}
            <section className="container mx-auto px-6 pb-20 max-w-3xl border-t border-gray-100 pt-12">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-8">
                    Coming next
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-8">
                    <div className="border border-dashed border-gray-300 rounded-lg p-6">
                        <div className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">Designer tool</div>
                        <p className="text-sm text-gray-700 leading-relaxed">
                            A visual workflow composer. Drag protocol components — contracts, attestation schemas, handoff conditions, allocation mechanisms — onto a canvas and wire them into a process tree. Publish the resulting assembly for operators to join.
                        </p>
                    </div>
                    <a href="/operators" className="block border border-gray-200 rounded-lg p-6 hover:bg-gray-50 transition-colors group">
                        <div className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">Operator configuration</div>
                        <p className="text-sm text-gray-700 leading-relaxed mb-4">
                            A form-based onboarding flow for businesses joining an existing assembly. Signal your capabilities, accepted mechanisms, and participation terms. Your configuration is readable by buyers at checkout when batching a workflow.
                        </p>
                        <span className="text-xs font-semibold text-black group-hover:text-gray-600 transition-colors">Register and build your catalogue &rarr;</span>
                    </a>
                </div>
            </section>

            {/* Start here */}
            <section className="container mx-auto px-6 pb-32 max-w-3xl border-t border-gray-100 pt-12">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-8">
                    Start here
                </p>
                <div className="space-y-3">
                    <a
                        href="/figaro-eats"
                        className="flex items-center justify-between px-6 py-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors group"
                    >
                        <div>
                            <div className="text-sm font-semibold text-black">Figaro Eats — reference assembly</div>
                            <div className="text-xs text-gray-500 mt-1">A complete Level 1 + 2 + 3 assembly. Food delivery with Dutch auction driver allocation and proximity attestations.</div>
                        </div>
                        <span className="text-gray-400 group-hover:text-black transition-colors ml-4">&rarr;</span>
                    </a>
                    <a
                        href="https://github.com/figaro-protocol/Figaro-Prototype2"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between px-6 py-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors group"
                    >
                        <div>
                            <div className="text-sm font-semibold text-black">SDK and protocol source</div>
                            <div className="text-xs text-gray-500 mt-1">@figaro/core — TypeScript SDK for reading, analyzing, and proposing Figaro transactions. Assembly schemas and contract ABIs.</div>
                        </div>
                        <span className="text-gray-400 group-hover:text-black transition-colors ml-4">&rarr;</span>
                    </a>
                    <a
                        href="https://github.com/figaro-protocol/Figaro-Prototype2/blob/main/docs/archive/paper/figaro3.pdf"
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center justify-between px-6 py-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors group"
                    >
                        <div>
                            <div className="text-sm font-semibold text-black">White paper</div>
                            <div className="text-xs text-gray-500 mt-1">The bonding mechanism, composability model, and protocol invariants in full.</div>
                        </div>
                        <span className="text-gray-400 group-hover:text-black transition-colors ml-4">&rarr;</span>
                    </a>
                    <a
                        href="/builders/assemblies"
                        className="flex items-center justify-between px-6 py-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors group"
                    >
                        <div>
                            <div className="text-sm font-semibold text-black">Browse Reference Assemblies</div>
                            <div className="text-xs text-gray-500 mt-1">Existing assembly definitions — equipment rental, procurement, freelance, disclosure review.</div>
                        </div>
                        <span className="text-gray-400 group-hover:text-black transition-colors ml-4">&rarr;</span>
                    </a>
                    <a
                        href="/help"
                        className="flex items-center justify-between px-6 py-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors group"
                    >
                        <div>
                            <div className="text-sm font-semibold text-black">FAQ</div>
                            <div className="text-xs text-gray-500 mt-1">Common questions about building, enforcement, and the security boundary.</div>
                        </div>
                        <span className="text-gray-400 group-hover:text-black transition-colors ml-4">&rarr;</span>
                    </a>
                </div>
            </section>

        </div>
    );
}
