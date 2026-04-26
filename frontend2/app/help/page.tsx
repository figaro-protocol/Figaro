
export default function Help() {
    return (
        <>

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
                        <h2 className="text-base font-semibold text-black mb-2">Why &ldquo;Figaro&rdquo;? Why &ldquo;FIG&rdquo;?</h2>
                        <p className="text-sm text-gray-700 leading-relaxed mb-3">
                            <strong>Figaro</strong> is the factotum of the city. In Rossini&apos;s <em>Il Barbiere di Siviglia</em> (1816, drawn from Beaumarchais&apos;s <em>Le Barbier de Séville</em>, 1775), the character declares himself the city&apos;s factotum in the famous &ldquo;Largo al factotum&rdquo; aria &mdash; running errands, brokering favors, mediating between parties without owning any of it. The kernel is named for what it does: the factotum of the network, the coordinator of everything without being the owner of anything. It holds collateral, executes commitments, discharges resolution. The metaphor is the thesis, not decoration.
                        </p>
                        <p className="text-sm text-gray-700 leading-relaxed">
                            <strong>FIG</strong> is the name by which the token gets invoked in transactions and conversations &mdash; the same way ETH, BTC, USDC, and USD do. &ldquo;Send me 10 FIG&rdquo; is as natural in speech as &ldquo;send me 10 ETH.&rdquo; Short, pronounceable, internally consistent with Figaro. A token ticker is a speech-act, not a consumer brand.
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
                        <h2 className="text-base font-semibold text-black mb-2">Can the buyer pay in one token and the seller receive another?</h2>
                        <p className="text-sm text-gray-700 leading-relaxed">
                            Yes, but not inside a single process. Each process is bound to one currency so that the 2&times;payment and 2&times;cumulative bond amounts are directly comparable on-chain — no oracle, no DEX dependency, no pre-agreed exchange rate. Multi-token flows are handled at the wallet or runtime layer in three ways: (1) use a process tree with one monotoken process per vendor-currency pair, (2) let the wallet swap to the target token before calling commit (Rabby, MetaMask Swap, Rainbow all do this natively), or (3) write a Level-3 mechanism contract that bundles multiple monotoken commits atomically. The perceived limitation is a misframing — the single-currency invariant is what keeps the protocol trust-minimized.
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
                            Kleros is an optional decentralized arbitration forum. The protocol includes a ready-made integration &mdash; ERC-1497 evidence formatting, IPFS pinning for attestations, and an ArbitrableProxy contract wrapper. A builder can enable it in their assembly or use any other dispute forum (traditional courts, arbitration providers, community mediation). The evidence layer is forum-agnostic; most trades resolve through economic incentives alone and never reach arbitration. The structural argument for off-chain over on-chain adjudication is at <a href="/legal" className="underline hover:text-gray-500">/legal</a>.
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
                            Not yet by an independent third-party audit firm. An independent line-by-line security audit has not been completed. Builders should factor this into their risk assessment before deploying on mainnet.
                        </p>
                        <p className="text-sm text-gray-700 leading-relaxed">
                            The protocol has been subject to substantial automated verification: Foundry unit tests, 7 Echidna property invariants under a 50,000-call campaign budget, 7 TLA&#8314; invariants exhaustively model-checked across 6,087,113 distinct states, 7 Halmos symbolic proofs (z3-discharged), and 25 Certora CVL rules across kernel, attestation, and token-operations specs. Formal verification and fuzzing are not substitutes for a line-by-line security audit by an independent firm. Full methodology and current numbers at <a href="/verification" className="underline hover:text-gray-500">/verification</a>.
                        </p>
                    </div>
                    <div>
                        <h2 className="text-base font-semibold text-black mb-2">What does formal verification actually prove?</h2>
                        <p className="text-sm text-gray-700 leading-relaxed">
                            Each tool covers what the others don&apos;t. TLA&#8314; explores the full state machine; Halmos symbolically proves invariants for all inputs at the Solidity level; Echidna fuzzes against deployed bytecode; Certora discharges SMT rules over methods. What none of them covers: implementation bugs outside the verified properties, interactions with third-party contracts, front-end vulnerabilities, or economic attacks outside the model&apos;s scope. The four-tool methodology is documented at <a href="/verification" className="underline hover:text-gray-500">/verification</a>.
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

            {/* Schema validation */}
            <section id="schema-validation" className="container mx-auto px-6 pb-16 max-w-3xl border-t border-gray-100 pt-12">
                <p className="text-xs font-semibold uppercase tracking-widest text-gray-600 mb-8">Schema validation</p>
                <div className="space-y-8">
                    <div>
                        <h2 className="text-base font-semibold text-black mb-2">Are my agreements validated on-chain?</h2>
                        <p className="text-sm text-gray-700 leading-relaxed">
                            Yes — for every schema with a registered validator contract. The <code className="font-mono text-xs">AttestationCoordinator</code> requires a deployed <code className="font-mono text-xs">ISchemaValidator</code> for each schemaId before any attestation under that schema can fire. The validator runs on every call and reverts the transaction if the content does not conform. The on-chain event records <code className="font-mono text-xs">keccak256(content)</code>, so the recorded hash is cryptographically bound to whatever the validator accepted.
                        </p>
                    </div>
                    <div>
                        <h2 className="text-base font-semibold text-black mb-2">What does a schema validator guarantee?</h2>
                        <p className="text-sm text-gray-700 leading-relaxed">
                            That every attestation recorded under a given schemaId conforms to the field types, ranges, and structural rules declared in the schema spec. Validators are pure / view contracts with no admin and no mutable state. They are registered first-write-wins — once bound to a schemaId, the validator address cannot be changed, preventing a permissive-validator swap after attestations are in flight.
                        </p>
                    </div>
                    <div>
                        <h2 className="text-base font-semibold text-black mb-2">What happens if a schema does not have a validator?</h2>
                        <p className="text-sm text-gray-700 leading-relaxed">
                            Attestations under that schemaId revert with <code className="font-mono text-xs">ValidatorNotSet</code>. There is no escape hatch. Anyone can deploy and register a validator (it is permissionless), so a missing validator is a deployment-step gap, not a protocol restriction.
                        </p>
                    </div>
                    <div>
                        <h2 className="text-base font-semibold text-black mb-2">Where can I see which validators are in force?</h2>
                        <p className="text-sm text-gray-700 leading-relaxed">
                            See the &ldquo;Schema validators in force&rdquo; section on the <a href="/builders" className="underline hover:text-gray-500">Builders</a> page. Each entry lists the schemaId, the validator contract, and a one-line summary of what the validator enforces.
                        </p>
                    </div>
                    <div>
                        <h2 className="text-base font-semibold text-black mb-2">What does the attestation&apos;s stage parameter mean?</h2>
                        <p className="text-sm text-gray-700 leading-relaxed">
                            The <code className="font-mono text-xs">stage</code> field in the <code className="font-mono text-xs">Attestation</code> event is an attestation-time envelope (e.g., commitment / inventory / restatement / verification for GHG; or pickup / en-route / delivered for delivery lifecycle), supplied by the attester at runtime. It is <em>not</em> the same as a stage committed inside the signed agreement. The merkle inclusion proof binds the attestation&apos;s clause (schemaId + sectionData) to <code className="font-mono text-xs">agreementHash</code>, but the stage parameter rides outside the proof. Indexers reading event streams should treat <code className="font-mono text-xs">stage</code> as runtime metadata; the canonical &ldquo;what was committed at signing time&rdquo; lives in the off-chain agreement manifest. Per-schema validators bound-check the stage against their enum; stage cannot be a value the schema doesn&apos;t define.
                        </p>
                    </div>
                    <div>
                        <h2 className="text-base font-semibold text-black mb-2">Do the proximity validators verify the device signature?</h2>
                        <p className="text-sm text-gray-700 leading-relaxed">
                            No. Proximity is split into sister schemas: <code className="font-mono text-xs">FigaroProximityPolicyV1Validator</code> (Category-2) byte-equality-enforces the required <code className="font-mono text-xs">band</code> committed at agreement signing, and <code className="font-mono text-xs">FigaroProximityProofV1Validator</code> (Category-1) is a syntactic runtime gate that checks the band enum, rejects a zero nonce, and bounds the device-signature length (65–512 bytes). Neither verifies that the signature is cryptographically valid for the claimed device. Cryptographic verification is the consumer&apos;s responsibility: a downstream system that trusts a proximity attestation as evidence of physical presence MUST recover the signer from the signature bytes and compare to the expected device address, and additionally check that <code className="font-mono text-xs">proof.band == policy.band</code>. A passing on-chain attestation tells you the band was committed at signing time and the runtime payload has the expected shape. It does not tell you the signature itself is valid.
                        </p>
                    </div>
                    <div>
                        <h2 className="text-base font-semibold text-black mb-2">Are GHG measurement values bounded on-chain?</h2>
                        <p className="text-sm text-gray-700 leading-relaxed">
                            No. <code className="font-mono text-xs">FigaroGHGMeasurementV1Validator</code> accepts any <code className="font-mono text-xs">uint256</code> grams CO2e — there is no on-chain upper bound. This is intentional: the validator is a syntactic gate (Category-1: runtime-only, no committed cross-check), and semantic plausibility (&ldquo;is 10<sup>30</sup> grams a reasonable measurement?&rdquo;) is a domain-application concern, not a protocol invariant. Frontends and indexers that aggregate grams across attestations MUST apply application-domain bounds before summing — a single attacker-attested <code className="font-mono text-xs">type(uint256).max</code> grams can corrupt aggregate displays if not bounds-checked client-side.
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
                            Seven kernel invariants exercised by all four verification toolchains: solvency, token conservation, forward-only state transitions (no escape hatches), buyer dominance, atomic resolution, accumulator correctness, and active-order-count integrity. These hold unconditionally for any assembly. Methodology and current numbers at <a href="/verification" className="underline hover:text-gray-500">/verification</a>.
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
                    <a href="/research" className="flex items-center justify-between px-6 py-4 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors group">
                        <div>
                            <div className="text-sm font-semibold text-black">Research papers</div>
                            <div className="text-xs text-gray-500 mt-1">Six papers covering the mechanism, implementation, cryptoeconomics, institutional economics, political economy, and on-chain evidence law. One audience each.</div>
                        </div>
                        <span className="text-gray-400 group-hover:text-black transition-colors ml-4">&rarr;</span>
                    </a>
                </div>
            </section>

        </>
    );
}
