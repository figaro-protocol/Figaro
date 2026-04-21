import { Header } from "@/components/shared/Header";
import { Footer } from "@/components/shared/Footer";

export default function Help() {
    return (
        <main className="min-h-screen bg-white">
            <Header />

            <section className="container mx-auto px-6 pt-24 pb-16 max-w-3xl">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-4">
                    Help & FAQ
                </p>
                <h1 className="text-5xl font-bold text-black leading-tight tracking-tight mb-6">
                    Common questions.
                </h1>
                <p className="text-xl text-gray-600 leading-relaxed max-w-2xl">
                    Questions about the protocol, building on it, and how enforcement works.
                </p>
            </section>

            {/* Protocol basics */}
            <section className="container mx-auto px-6 pb-16 max-w-3xl border-t border-gray-100 pt-12">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-8">The protocol</p>
                <div className="space-y-8">
                    <div>
                        <h2 className="text-base font-semibold text-black mb-2">What is Figaro?</h2>
                        <p className="text-sm text-gray-700 leading-relaxed">
                            Figaro is a protocol primitive for trade between strangers. Both parties lock stakes before work begins. Breaking the agreement always costs more than keeping it. No intermediary needed to enforce anything. It is to commerce what TCP/IP is to the internet — a base layer others build on.
                        </p>
                    </div>
                    <div>
                        <h2 className="text-base font-semibold text-black mb-2">How do stakes work?</h2>
                        <p className="text-sm text-gray-700 leading-relaxed">
                            The buyer locks 2× the payment value. The seller locks 2× the cumulative value of their process commitments. If the buyer triggers settlement, both parties recover their stakes plus or minus the payment. If either party defects, the defector's stake is forfeited. The math is sized so that defection always produces a worse outcome than cooperation — regardless of the payment amount.
                        </p>
                    </div>
                    <div>
                        <h2 className="text-base font-semibold text-black mb-2">What is a process tree?</h2>
                        <p className="text-sm text-gray-700 leading-relaxed">
                            A trade commitment can branch into sub-processes — preparation, handoff, delivery, verification, any steps the workflow requires. The root commitment holds the buyer and seller stakes. Sub-processes nest beneath it, each with their own parties and attestations. Settlement resolves the entire tree atomically — all orders in the process settle in one transaction or none do.
                        </p>
                    </div>
                    <div>
                        <h2 className="text-base font-semibold text-black mb-2">Who controls the protocol?</h2>
                        <p className="text-sm text-gray-700 leading-relaxed">
                            Nobody. The core contract has no admin key, no upgrade path, and no fee switch. It cannot be captured after deployment. This is a design property, not a policy — there is no governance mechanism that could introduce one.
                        </p>
                    </div>
                </div>
            </section>

            {/* Enforcement detail */}
            <section id="enforcement" className="container mx-auto px-6 pb-16 max-w-3xl border-t border-gray-100 pt-12">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-8">How enforcement works</p>
                <div className="space-y-8">
                    <div>
                        <h2 className="text-base font-semibold text-black mb-2">What happens if a party defects?</h2>
                        <p className="text-sm text-gray-700 leading-relaxed">
                            If the seller fails to deliver, the buyer withholds settlement. The seller's locked stake — 2× the cumulative value of their commitments — remains in the contract and is not returned. The buyer recovers their stake minus the payment. Defection is structurally more expensive than cooperation for both parties at all times. This is the primary enforcement layer and it operates automatically.
                        </p>
                    </div>
                    <div>
                        <h2 className="text-base font-semibold text-black mb-2">How does social enforcement work in larger workflows?</h2>
                        <p className="text-sm text-gray-700 leading-relaxed">
                            In a multi-party process tree, the seller on the root commitment becomes the buyer on sub-commitments. Every contributor downstream is bonded to the contributor above them. If any node in the tree fails to deliver, the failure propagates upward — the contributor above cannot settle their own commitment and forfeits their stake. Contributors police each other because their own stake depends on everyone below them delivering. This is the same dynamic as Grameen Bank micro-lending circles, where group members enforce repayment because their own credit depends on it. The effect grows stronger as the workflow grows larger.
                        </p>
                    </div>
                    <div>
                        <h2 className="text-base font-semibold text-black mb-2">What evidence does the protocol produce automatically?</h2>
                        <p className="text-sm text-gray-700 leading-relaxed">
                            Every lifecycle event in a process tree is recorded on-chain via the attestation coordinator — role-gated, block-timestamped, and tamper-proof. Who attested what, when, in what role, in what order. This record is produced as a side effect of normal operation. No additional steps required. It is usable as evidence in any dispute forum — decentralized arbitration, traditional courts, or community mediation.
                        </p>
                    </div>
                    <div>
                        <h2 className="text-base font-semibold text-black mb-2">What is the Kleros integration and do I need it?</h2>
                        <p className="text-sm text-gray-700 leading-relaxed">
                            Kleros is an optional decentralized arbitration forum. The protocol includes a ready-made integration — ERC-1497 evidence formatting, IPFS pinning for attestations, and an ArbitrableProxy contract wrapper. A builder can enable it in their assembly or use any other dispute forum. The evidence layer is forum-agnostic. Most trades resolve through economic incentives alone and never reach arbitration. Kleros is for the remainder. Whether to enable it is a design decision for the assembly builder, not a protocol requirement.
                        </p>
                    </div>
                </div>
            </section>

            {/* Audit */}
            <section id="audit" className="container mx-auto px-6 pb-16 max-w-3xl border-t border-gray-100 pt-12">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-8">Audit and verification</p>
                <div className="space-y-8">
                    <div>
                        <h2 className="text-base font-semibold text-black mb-2">Has the protocol been audited?</h2>
                        <p className="text-sm text-gray-700 leading-relaxed mb-3">
                            Not yet. An independent security audit has not been completed. Builders should factor this into their risk assessment before deploying on mainnet.
                        </p>
                        <p className="text-sm text-gray-700 leading-relaxed">
                            The protocol has been subject to significant automated verification: 227 Foundry unit tests, 7 Echidna property invariants tested across 50,000+ call sequences, 7 TLA+ invariants verified against 2M+ states, and 7 Halmos symbolic proofs — which prove properties hold for all possible inputs, not just concrete test vectors. This provides meaningful confidence in the core mechanics, but formal verification and fuzzing are not substitutes for a line-by-line security audit by an independent firm.
                        </p>
                    </div>
                    <div>
                        <h2 className="text-base font-semibold text-black mb-2">What does formal verification actually prove?</h2>
                        <p className="text-sm text-gray-700 leading-relaxed mb-3">
                            TLA+ model checking exhaustively verifies that the protocol's state machine satisfies its seven invariants — solvency, token conservation, forward-only state transitions, buyer dominance, atomic resolution, accumulator correctness, and order count integrity — across all reachable states in the model.
                        </p>
                        <p className="text-sm text-gray-700 leading-relaxed">
                            Halmos symbolic execution proves the same properties hold for all possible inputs at the Solidity level, not just the abstract model. What it does not cover: implementation bugs outside the verified properties, interactions with third-party contracts, front-end vulnerabilities, or economic attacks outside the model's scope.
                        </p>
                    </div>
                    <div>
                        <h2 className="text-base font-semibold text-black mb-2">What should a builder do given the audit status?</h2>
                        <p className="text-sm text-gray-700 leading-relaxed">
                            For testnet deployments and prototypes, the current verification coverage is substantial. For mainnet deployments with real economic value at stake, builders should wait for an independent audit, conduct their own review, or size their initial deployments to a risk level they are comfortable with given the current state. The protocol's open-source codebase and formal specifications are available for independent review.
                        </p>
                    </div>
                </div>
            </section>

            {/* Builder questions */}
            <section className="container mx-auto px-6 pb-16 max-w-3xl border-t border-gray-100 pt-12">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-8">Building on Figaro</p>
                <div className="space-y-8">
                    <div>
                        <h2 className="text-base font-semibold text-black mb-2">What does building on Figaro mean?</h2>
                        <p className="text-sm text-gray-700 leading-relaxed">
                            You design a workflow assembly — the parties, the process steps, the mechanisms at each step, and the attestation requirements. The protocol enforces whatever structure you define. You do not rebuild bonding, settlement, or dispute evidence from scratch. See the <a href="/builders" className="underline hover:text-gray-500">Builders</a> page for the three levels of composition.
                        </p>
                    </div>
                    <div>
                        <h2 className="text-base font-semibold text-black mb-2">What does the protocol guarantee for my assembly?</h2>
                        <p className="text-sm text-gray-700 leading-relaxed">
                            Seven invariants verified by TLA+ model checking and Echidna fuzzing: solvency (the protocol is always solvent), token conservation (value is never created or destroyed), forward-only state transitions (no escape hatches), buyer dominance (only the buyer can trigger settlement), atomic resolution (no cherry-picking), accumulator correctness (bond accounting cannot be underfunded), and active order count integrity. These hold unconditionally for any assembly.
                        </p>
                    </div>
                    <div>
                        <h2 className="text-base font-semibold text-black mb-2">What is the builder responsible for?</h2>
                        <p className="text-sm text-gray-700 leading-relaxed">
                            The correctness of the assembly configuration, any new contracts introduced at Level 3, the attestation schemas defined at Level 2, operator identity and onboarding, and the claims made in the assembly's UI. The protocol cannot verify that a workflow is correctly structured — a misconfigured assembly is the builder's risk. Do not imply protocol-level guarantees for properties your assembly does not actually enforce.
                        </p>
                    </div>
                    <div>
                        <h2 className="text-base font-semibold text-black mb-2">Do I need to write a smart contract to build on Figaro?</h2>
                        <p className="text-sm text-gray-700 leading-relaxed">
                            No. At Level 1, you compose an assembly from existing protocol contracts and mechanism modules — no new on-chain code. At Level 2, you register custom attestation schemas but still write no contracts. Only Level 3 requires writing and deploying a new smart contract, and only when your workflow needs an economic mechanism that does not yet exist in the ecosystem.
                        </p>
                    </div>
                </div>
            </section>

            {/* Getting started */}
            <section className="container mx-auto px-6 pb-32 max-w-3xl border-t border-gray-100 pt-12">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-8">Getting started</p>
                <div className="space-y-3">
                    <a href="/figaro-eats" className="flex items-center justify-between px-6 py-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors group">
                        <div>
                            <div className="text-sm font-semibold text-black">Try the protocol — Figaro Eats</div>
                            <div className="text-xs text-gray-500 mt-1">A reference implementation of the full coordination stack.</div>
                        </div>
                        <span className="text-gray-400 group-hover:text-black transition-colors ml-4">&rarr;</span>
                    </a>
                    <a href="/builders" className="flex items-center justify-between px-6 py-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors group">
                        <div>
                            <div className="text-sm font-semibold text-black">Build on Figaro</div>
                            <div className="text-xs text-gray-500 mt-1">Three levels of composition, security boundary, tooling overview.</div>
                        </div>
                        <span className="text-gray-400 group-hover:text-black transition-colors ml-4">&rarr;</span>
                    </a>
                    <a href="https://github.com/figaro-protocol/Figaro-Prototype2/blob/main/docs/archive/paper/figaro3.pdf" target="_blank" rel="noopener noreferrer" className="flex items-center justify-between px-6 py-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors group">
                        <div>
                            <div className="text-sm font-semibold text-black">White paper</div>
                            <div className="text-xs text-gray-500 mt-1">The bonding mechanism, composability model, and protocol invariants in full.</div>
                        </div>
                        <span className="text-gray-400 group-hover:text-black transition-colors ml-4">&rarr;</span>
                    </a>
                </div>
            </section>

            <Footer />
        </main>
    );
}
