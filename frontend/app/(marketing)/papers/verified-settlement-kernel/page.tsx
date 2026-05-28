import type { Metadata } from "next";
import {
    PaperLayout,
    PaperSection,
    PaperSubsection,
    PaperRun,
    PaperRemark,
} from "@/components/papers/PaperLayout";
import { Math } from "@/components/papers/Math";

export const metadata: Metadata = {
    title: "A Verified Solidity Settlement Kernel — Figaro Protocol",
    description:
        "A reference Solidity implementation of the two-mechanism bonded commitment kernel — ownerless, fee-less, admin-less — with the four-method formal-verification stack (TLA⁺, Echidna, Halmos, Certora) used to audit it, the threat model, and the coordinator pattern for equilibrium-preserving extension.",
};

function FormalBlock({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="border-l-2 border-default pl-6 my-3 space-y-3">
            <p className="text-sm font-semibold text-ink-heading">{label}</p>
            {children}
        </div>
    );
}

export default function VerifiedSettlementKernelPaper() {
    return (
        <PaperLayout
            title="Asymmetric Bonding and Buyer Dominance"
            subtitle="A Verified Solidity Settlement Kernel"
            author="Alessandro Daliana"
            date="April 2026"
            watermark="Figaro Protocol · Preprint"
            keywords="smart contracts, formal verification, TLA⁺, Halmos, Certora, Echidna, EIP-712, settlement layer, coordinator pattern"
            abstract={
                <>
                    <p>
                        We describe a reference Solidity implementation of the two-mechanism bonded commitment settlement primitive &mdash; <em>asymmetric bonding</em> (each party locks <Math>{"2\\times"}</Math> collateral, with the seller bonding against cumulative upstream value) and <em>buyer dominance with atomic resolution</em> (only the root buyer may extend or resolve, and resolution settles every active order in the process simultaneously or not at all) &mdash; together with the formal-verification stack used to audit it. The kernel (<code>FigaroCore</code>) is <strong>ownerless, fee-less, and admin-less</strong>: two external functions, three storage mappings, no upgrade path, no escape hatch from the bonded state. Verification is layered: TLA⁺ model checking exhaustively explores 6,087,113 distinct states across seven kernel invariants; Echidna fuzzes seven property invariants under a 50,000-call campaign budget; Halmos symbolically proves seven kernel properties via the z3 SMT solver; Certora cloud proves twenty-two declared CVL rules (twenty-three sub-rules in the cloud report) across the kernel, the attestation surface, and a token-operations conservation surface that gates every ERC-20 call site in the source tree.
                    </p>
                    <p>
                        The implementation also realizes a <em>coordinator pattern</em>: an extension discipline under which external mechanisms (Dutch auction, schema-typed attestation coordinator, schema and operator registries) compose with the kernel without weakening the bonding equilibrium. We give the four sufficient conditions and three concrete instances. Finally, we describe the three-layer enforcement architecture &mdash; economic (bonding), coordinational (atomic resolution), evidentiary (immutable log) &mdash; and the threat model under which the layers compose.
                    </p>
                    <p>
                        This paper is a snapshot at commit-of-record 2026-04-23. Verification counts will grow as the test surface expands; the methodology is the stable artifact.
                    </p>
                </>
            }
            references={
                <>
                    <li>Bloemen, R., Logvinov, L., &amp; Evans, J. EIP-712: Typed Structured Data Hashing and Signing. Ethereum Improvement Proposal 712, 2017.</li>
                    <li>Certora. <em>The Certora Prover and the CVL Specification Language</em>. Certora Technology Documentation, 2024.</li>
                    <li>de Moura, L. &amp; Bj&oslash;rner, N. Z3: An Efficient SMT Solver. In <em>Tools and Algorithms for the Construction and Analysis of Systems (TACAS)</em>, pages 337&ndash;340, 2008.</li>
                    <li>Grieco, G., Song, W., Cygan, A., Feist, J., &amp; Groce, A. Echidna: Effective, Usable, and Fast Fuzzing for Smart Contracts. In <em>Proc. ACM SIGSOFT International Symposium on Software Testing and Analysis (ISSTA)</em>, pages 557&ndash;560, 2020.</li>
                    <li>Lamport, L. <em>Specifying Systems: The TLA⁺ Language and Tools for Hardware and Software Engineers</em>. Addison-Wesley, 2002.</li>
                    <li>OpenZeppelin. <em>OpenZeppelin Contracts: A Library for Secure Smart-Contract Development</em>, version 5.x. OpenZeppelin Documentation, 2024.</li>
                    <li>Paradigm. <em>The Foundry Book</em>. Foundry Documentation, 2024.</li>
                    <li>Park, D. and the Halmos contributors. <em>Halmos: A Symbolic Bounded Model Checker for EVM Smart Contracts</em>. a16z crypto, open-source project, 2024.</li>
                </>
            }
        >
            <PaperSection title="1. Introduction">
                <p>
                    The bonded commitment settlement primitive composes two mechanisms. <em>Asymmetric bonding</em>: for an order with payment <Math>{"P"}</Math> and cumulative upstream value <Math>{"G \\geq P"}</Math>, the buyer locks <Math>{"2P"}</Math> and the seller locks <Math>{"2G"}</Math>, so cooperation is the weakly dominant strategy at every position in an <Math>{"N"}</Math>-party process chain and the cooperative profile is the unique outcome surviving iterated elimination of weakly dominated strategies. <em>Buyer dominance with atomic resolution</em>: only the root buyer may extend or resolve a process, and resolution settles every active order in the process simultaneously or not at all, inducing a weakest-link subgame among co-sellers under which cooperation pressure propagates without explicit communication.
                </p>
                <p>
                    The mechanism is settlement-substrate-agnostic; it admits realisation on any state machine that maintains a monotonic cumulative-value accumulator and authenticates buyer signatures. This paper presents <em>one</em> such realisation &mdash; a Solidity smart contract <code>FigaroCore</code> on the EVM &mdash; and the verification methodology applied to it. The core property the verification is asked to deliver is precisely the gap between mechanism and code: the equilibrium analysis assumes the settlement layer enforces (i) the asymmetric bond formula <Math>{"C_b = 2P"}</Math>, <Math>{"C_s = 2G"}</Math> on <code>commit</code> with a monotonic accumulator, and (ii) buyer dominance with atomic resolution on <code>resolveProcess</code>. The code must <em>actually</em> enforce those, in every reachable path, against all reasonable adversaries.
                </p>
                <PaperRun title="What verification does and does not deliver.">
                    A distinction worth naming up front: the equilibrium argument is a property of rational play over a payoff structure &mdash; cooperation weakly dominates defection at every position in an <Math>{"N"}</Math>-party process chain, under specified rationality assumptions &mdash; and it is not a property of code. The four verification tools we apply do not verify the equilibrium itself; they verify the <em>structural preconditions</em> that the equilibrium assumes (asymmetric bond formula, monotonic accumulation, buyer dominance, atomic resolution, conservation of value). What we verify is that the code implements the payoff structure faithfully in every reachable path. Claims that some external mechanism &ldquo;preserves the kernel&rsquo;s bonding equilibrium&rdquo; invoke the equilibrium argument (which holds by rational play) and not the verification claim made here (which holds by code inspection). Keeping the two claims distinct matters for any reader who wants to know exactly which property is backed by which evidence.
                </PaperRun>
                <PaperRun title="Brief recap of the settlement primitive.">
                    The two mechanisms together yield: for each committed order, the buyer locks <Math>{"2P"}</Math> and the seller locks <Math>{"2G"}</Math>; only the root buyer can trigger resolution; on resolution the buyer recovers <Math>{"P"}</Math> and each seller recovers <Math>{"2G_i + P_i"}</Math>, with every order in the process settling simultaneously or none. This is the full state-machine surface that the kernel must enforce; the game-theoretic derivation is mechanism-design content and lies outside the scope of the present paper.
                </PaperRun>
            </PaperSection>

            <PaperSection title="2. Smart Contract Architecture">
                <p>
                    The kernel is a single Solidity 0.8.26 contract, <code>src/FigaroCore.sol</code>, inheriting OpenZeppelin&rsquo;s <code>EIP712</code> and <code>ReentrancyGuard</code>. It exposes two external functions: <code>commit</code> and <code>resolveProcess</code>. There is no constructor parameter, no owner, no admin, no upgrade path.
                </p>
                <PaperSubsection title="2.1 Storage Layout">
                    <p>Three mappings comprise the kernel state:</p>
                    <ul className="space-y-1 list-disc pl-6 text-sm">
                        <li><code>processes</code>: <code>bytes32 → ProcessState</code>, where <code>ProcessState</code> is a struct of <code>(address rootBuyer, IERC20 currency, uint256 cumulativeValue, uint256 activeOrderCount)</code>.</li>
                        <li><code>orderStatus</code>: <code>bytes32 → uint8</code> encoding <Math>{"\\{0:\\text{unknown},\\ 1:\\text{committed},\\ 2:\\text{resolved}\\}"}</Math>. The status function is monotonically non-decreasing; this is one of the verified invariants.</li>
                        <li><code>orderProcessId</code>: <code>bytes32 → bytes32</code> recording each order&rsquo;s process membership.</li>
                    </ul>
                    <p>
                        The kernel deliberately does not store a per-order struct. Order terms (payment, cumulative-value snapshot, parties, denomination) are reconstructed off-chain from the signed commitment and the emitted <code>OrderCommitted</code> event. Bond amounts (<Math>{"2P"}</Math> for the buyer, <Math>{"2G"}</Math> for the seller) are deterministic functions of those values rather than separate storage variables. Storage is therefore <Math>{"O(\\text{processes}) + O(\\text{orders})"}</Math> uint8 + <Math>{"O(\\text{orders})"}</Math> bytes32, with no order-payload duplication.
                    </p>
                </PaperSubsection>
                <PaperSubsection title="2.2 Commitment Protocol">
                    <p>
                        Both parties sign an EIP-712 typed commitment (Bloemen, Logvinov, &amp; Evans, 2017) off-chain. A single on-chain <code>commit</code> call verifies both signatures (via <code>ECDSA.recover</code> against the EIP-712 digest) and pulls both bonds atomically. Root commitments create a new process; sub-order commitments extend an existing one by carrying the inherited <code>processId</code> and the next expected cumulative value. This eliminates the accept-reject pattern of traditional escrow protocols (which front-run on acceptance) and makes the act of committing simultaneous from the chain&rsquo;s point of view.
                    </p>
                </PaperSubsection>
                <PaperSubsection title="2.3 Identifier Derivation">
                    <p>Process and order identifiers are content-addressed:</p>
                    <div className="my-3 overflow-x-auto">
                        <Math display>{"\\begin{aligned} \\text{processId} &= H_{\\text{EIP-712}}(\\text{root commitment}) \\\\ \\text{orderHash} &= \\mathrm{keccak256}(\\text{processId} \\,\\|\\, \\text{structHash}) \\end{aligned}"}</Math>
                    </div>
                    <p>
                        Here <Math>{"H_{\\text{EIP-712}}"}</Math> denotes the EIP-712 typed-data digest: <Math>{"\\mathrm{keccak256}(\\mathtt{0x1901} \\,\\|\\, \\text{domainSeparator} \\,\\|\\, \\text{structHash})"}</Math>, computed via OpenZeppelin&rsquo;s <code>_hashTypedDataV4</code>. The EIP-712 domain separator binds the root identifier to chain id and verifying contract, preventing replay across deployments. Sub-orders inherit <code>processId</code> from the signed commitment. No auto-incrementing counter exists; identifier collisions require SHA-3 collisions.
                    </p>
                </PaperSubsection>
                <PaperSubsection title="2.4 Fee-on-Transfer Protection">
                    <p>
                        The internal helper <code>_pullExact(IERC20 token, address from, uint256 amount)</code> reads the contract&rsquo;s pre-transfer balance, calls <code>safeTransferFrom</code>, and reverts with <code>FeeOnTransferDetected</code> if <Math>{"\\text{balanceAfter} - \\text{balanceBefore} \\neq \\text{amount}"}</Math>. This ensures the conservation law cannot be broken by tokens that apply a transfer tax &mdash; a class of issues that has silently corrupted accounting in several DeFi systems.
                    </p>
                </PaperSubsection>
                <PaperSubsection title="2.5 Events">
                    <p>Five events are emitted, supporting full off-chain state reconstruction without a subgraph dependency:</p>
                    <ul className="space-y-2 list-disc pl-6 text-sm">
                        <li><code>OrderCommitted</code> carries the canonical commitment payload &mdash; ten fields: <code>orderHash</code>, <code>processId</code>, <code>buyer</code>, <code>seller</code>, <code>currency</code>, <code>payment</code>, <code>cumulativeValue</code>, <code>agreementHash</code>, <code>salt</code>, <code>deadline</code>. The <code>salt</code> and <code>deadline</code> fields are what enable the SDK&rsquo;s <code>reconstruct()</code> primitive to derive the EIP-712 digest deterministically from event logs alone.</li>
                        <li><code>OrderSeller</code> and <code>OrderCurrency</code> are companion events that index the seller and currency respectively &mdash; needed because the EVM caps indexed event arguments at three.</li>
                        <li><code>OrderResolved</code> fires once per order at resolution.</li>
                        <li><code>ProcessResolved</code> fires once per process at resolution, with the order count.</li>
                    </ul>
                    <p>A reader who replays these event types into a state machine exactly reconstructs <code>processes</code>, <code>orderStatus</code>, and <code>orderProcessId</code> &mdash; this is the basis of the SDK&rsquo;s <code>reconstruct()</code> primitive used by agents and frontends.</p>
                </PaperSubsection>
            </PaperSection>

            <PaperSection title="3. Design Non-Decisions">
                <p>The following features are deliberately absent. Each absence preserves a mechanism-design property of the bonded commitment primitive (asymmetric bonding, buyer dominance, atomic resolution, or the no-escape-hatch security constraint).</p>
                <ol className="space-y-2 list-decimal pl-6 text-sm">
                    <li><strong>No owner, admin, or upgrade.</strong> There is no <code>pause()</code>, <code>upgrade()</code>, or <code>transferOwnership()</code>. The contract is ownerless from deployment. Adding any of these would introduce an unbonded actor (the owner) into the resolution path, which the escape-hatch impossibility theorem rules out.</li>
                    <li><strong>No protocol fee.</strong> Settlement distributes the full bond amount to the parties. A fee at <Math>{"k = 2"}</Math> would shift the buyer&rsquo;s net cooperation payoff above the defection payoff only by <Math>{"P - \\text{fee}"}</Math>, narrowing the dominance margin and &mdash; if the fee approaches <Math>{"P"}</Math> &mdash; collapsing the equilibrium.</li>
                    <li><strong>No timeout.</strong> An active order remains active indefinitely. Per the escape-hatch impossibility theorem, any timeout with recovery fraction <Math>{"\\alpha \\geq \\tfrac{1}{2}"}</Math> destroys weak dominance for the buyer.</li>
                    <li><strong>No partial resolution.</strong> The resolution function requires the full active order list and reverts otherwise. This enforces atomicity, on which the weakest-link coordination pressure depends.</li>
                    <li><strong>No internal ledger.</strong> Payouts are direct <code>safeTransfer</code> calls, not balance increments to be withdrawn later. This eliminates withdrawal-pattern reentrancy surface and removes a class of accounting drift bugs.</li>
                    <li><strong>No restriction on buyer&ndash;seller equality.</strong> The contract does not forbid <Math>{"B = S"}</Math>. If a single address signs both sides of a commitment, that address deposits both bonds and receives both payouts at resolution; the bond math is self-cancelling and no third party is exposed. The equilibrium analysis treats <Math>{"B \\neq S"}</Math> as the standard case but the contract permits the degenerate case rather than introducing a guard whose effect would be cosmetic.</li>
                </ol>
                <PaperSubsection title="3.1 Custom Errors as Specification">
                    <p>
                        The kernel defines sixteen custom errors, each named for the invariant it protects: <code>DeadlineExpired</code>, <code>InvalidBuyerSignature</code>, <code>InvalidSellerSignature</code>, <code>ZeroPayment</code>, <code>ProcessAlreadyExists</code>, <code>UnknownProcess</code>, <code>CumulativeValueMismatch</code>, <code>NotProcessBuyer</code>, <code>CurrencyMismatch</code>, <code>OrderNotCommitted</code>, <code>NoActiveOrders</code>, <code>IncompleteOrderList</code>, <code>DuplicateCommitment</code>, <code>FeeOnTransferDetected</code>, <code>InvalidRootCumulativeValue</code>, and <code>ProcessAlreadyResolved</code> (which rejects a sub-order against an already-resolved process). The error names function as a partial executable specification: each error is exercised by a Foundry revert-branch test and referenced by name in the verification-results section below. (A bare <code>{`"CumulativeValueOverflow"`}</code> string revert at resolution time, discussed in Section 6, is a string rather than a declared custom error.)
                    </p>
                </PaperSubsection>
            </PaperSection>

            <PaperSection title="4. Formal Verification Methodology">
                <p>We use four verification techniques, each chosen for what it covers that the others do not.</p>
                <PaperRun title="TLA⁺ model checking (TLC).">
                    Captures the full state machine as a single transition system. Invariants are propositional safety properties. TLC explores all reachable states under bounded parameters by breadth-first search, exhibiting either an invariant violation with a minimal trace or exhaustive coverage of the bounded space. Strength: high-level state-machine reasoning; abstracts cryptography and ERC-20 mechanics to expose accounting errors. Weakness: bounded by parameters; gives no guarantee for unbounded state.
                </PaperRun>
                <PaperRun title="Property-based fuzzing (Echidna).">
                    Runs randomized call sequences against the deployed bytecode under HEVM, with EIP-712 signing performed via cheatcodes. Strength: exercises real bytecode against concrete adversaries, including combinations of operations the model abstracts. Weakness: random sampling; finds bugs but does not prove their absence.
                </PaperRun>
                <PaperRun title="Symbolic execution (Halmos, z3-backed).">
                    Encodes call traces as SMT formulas and asks z3 whether any concrete input satisfies the negation of an invariant. Strength: when it returns <em>verified</em>, the property holds for <em>all</em> inputs in the modeled trace; complements Echidna&rsquo;s bounded random sampling with symbolic coverage of the commit/resolve state machine. Weakness: symbolic complexity blows up with control-flow depth; tractable on bounded path lengths.
                </PaperRun>
                <PaperRun title="Specification checking (Certora).">
                    SMT-based proving of CVL rules against the bytecode, run on Certora&rsquo;s cloud service. Strength: rules can quantify over methods (<code>method f</code>), allowing universal statements like &ldquo;no method modifies <Math>{"X"}</Math>&rdquo;. Weakness: paid service; rule encoding is non-trivial.
                </PaperRun>
                <PaperRun title="Foundry as the regression spine.">
                    A Foundry test suite serves as the continuous-integration spine. Foundry tests are not counted toward formal verification but provide the harness the other three techniques compile against.
                </PaperRun>
            </PaperSection>

            <PaperSection title="5. Verification Results">
                <p>All numbers in this section are reported against the snapshot at 2026-04-23, repository commit <code>970ee3a914b2</code>. Re-runs produce different fuzz-call counts; the configuration parameters (invariants, rule counts, model bounds) are the stable artifact.</p>
                <PaperSubsection title="5.1 TLA⁺ (formal/FigaroCore.tla)">
                    <p>
                        The contract is modeled in TLA⁺ with eight state variables (<code>processes</code>, <code>orderStatus</code>, <code>orderRecords</code>, <code>processOrders</code>, <code>contractBalance</code>, <code>wallets</code>, <code>nextProcId</code>, <code>nextOrdId</code>) and three actions: <code>CommitRoot</code>, <code>CommitSub</code>, <code>ResolveProcess</code>. The model abstracts EIP-712 signatures (assumed correct given valid commitments), ERC-20 mechanics (modeled as integer balances), and timing (deadlines are orthogonal to the bonding equilibrium and are exercised in Foundry instead).
                    </p>
                    <PaperRun title="Model bounds (formal/MC.cfg).">
                        2 buyers, 2 sellers, initial balance 30, maximum payment 3, 2 concurrent processes, 2 sub-orders per process. Two buyers (rather than one) enable cross-buyer invariant verification &mdash; a single-buyer model would not exercise <code>NotProcessBuyer</code> branches reachable by an attacker buyer.
                    </PaperRun>
                    <p>Seven safety invariants verified exhaustively:</p>
                    <ol className="space-y-1 list-decimal pl-6 text-sm">
                        <li><strong>TypeOK</strong>: type well-formedness of all state variables.</li>
                        <li><strong>TokenConservation</strong>: sum of wallet balances plus contract balance equals total supply.</li>
                        <li><strong>ContractSolvency</strong>: <code>contractBalance</code> <Math>{"\\geq 0"}</Math>.</li>
                        <li><strong>WalletNonNegative</strong>: all participant balances <Math>{"\\geq 0"}</Math>.</li>
                        <li><strong>CumulativeIntegrity</strong>: per-process, <Math>{"G"}</Math> equals the sum of all order payments.</li>
                        <li><strong>ActiveCountCorrect</strong>: stored active-order count matches the count of committed orders.</li>
                        <li><strong>ResolutionAlwaysPossible</strong>: for every active process, the contract holds sufficient funds to resolve all orders.</li>
                    </ol>
                    <p><em>Result.</em> 6,087,113 distinct states explored in 4 minutes 8 seconds; zero invariant violations. Reproduced via <code>./test-tla.sh</code>.</p>
                </PaperSubsection>
                <PaperSubsection title="5.2 Echidna (src/echidna/EchidnaFuzzer.sol)">
                    <p>Seven property invariants, each prefixed <code>echidna_</code>, checked after every call sequence:</p>
                    <ol className="space-y-1 list-decimal pl-6 text-sm">
                        <li><code>solvency</code>: token balance <Math>{"\\geq"}</Math> sum of outstanding bonds.</li>
                        <li><code>active_count_consistent</code>: stored count equals actual.</li>
                        <li><code>cumulative_accounting</code>: accumulator equals sum of payments.</li>
                        <li><code>state_monotonicity</code>: orders never transition backwards (0 → 1 → 2, never reverse).</li>
                        <li><code>token_conservation</code>: total supply constant under all commit/resolve sequences.</li>
                        <li><code>buyer_dominance</code>: non-buyer <code>resolveProcess</code> always reverts.</li>
                        <li><code>atomic_resolution</code>: incomplete order list always reverts.</li>
                    </ol>
                    <p><em>Configuration (echidna.yaml).</em> <code>testLimit: 50000</code> (campaign budget), <code>seqLen: 30</code>, <code>shrinkLimit: 5000</code>, three deployer/sender accounts, property mode, 300-second wall-clock timeout. The Echidna campaign budget is the reproducibility anchor; raw call counts vary between runs.</p>
                    <p><em>Result.</em> All seven properties held across the campaign; the most recent run exercised approximately 43,000 individual calls before the budget was exhausted, with no counterexample produced. Reproduced via <code>./test-echidna.sh</code>.</p>
                </PaperSubsection>
                <PaperSubsection title="5.3 Halmos (test/HalmosFigaroCore.t.sol)">
                    <p>Seven kernel properties, each implemented as a <code>check_</code> function and discharged by z3 under symbolic-input quantification:</p>
                    <ol className="space-y-1 list-decimal pl-6 text-sm">
                        <li><code>tokenConservation_afterCommit</code>.</li>
                        <li><code>contractSolvency_afterCommit</code>.</li>
                        <li><code>correctBondAmounts</code>: <Math>{"C_b = 2P"}</Math> and <Math>{"C_s = 2G"}</Math> for all symbolic <Math>{"P"}</Math>.</li>
                        <li><code>resolutionPayouts</code>: <Math>{"\\pi_s = 2G + P"}</Math> and <Math>{"\\pi_b = P"}</Math> for all symbolic <Math>{"P"}</Math>.</li>
                        <li><code>orderStatusTransition</code>: status moves only <Math>{"0 \\to 1 \\to 2"}</Math>.</li>
                        <li><code>buyerDominance_revert</code>: any non-buyer caller of <code>resolveProcess</code> reverts.</li>
                        <li><code>cumulativeValueMonotonic</code>: across two symbolic sub-order commitments, <Math>{"G"}</Math> never decreases.</li>
                    </ol>
                    <p><em>Result.</em> All seven discharged by z3. Reproduced via the Foundry profile <code>halmos</code> as documented in the repo.</p>
                </PaperSubsection>
                <PaperSubsection title="5.4 Certora (certora/)">
                    <p>The repository ships six specification files; we detail the three that bear on the kernel claim and summarize the rest.</p>
                    <PaperRun title="Kernel (FigaroCore.spec, 8 rules).">
                        <code>orderStatusNeverDecreases</code>, <code>orderStatusTransitionsAreValid</code>, <code>commitIncreasesActiveCount</code>, <code>onlyBuyerCanResolve</code>, <code>noDoubleCommit</code>, <code>cumulativeValueMonotonic</code>, <code>rootBuyerImmutable</code>, <code>currencyImmutable</code>.
                    </PaperRun>
                    <PaperRun title="Attestation surface (AttestationCoordinator.spec, 7 rules).">
                        Two role-gate rules: <code>nonBuyerCannotAttestAsBuyer</code>, <code>successfulBuyerAttestationImpliesBuyer</code>. Two parametric kernel-immutability rules (the attestation surface cannot change kernel state, quantified over every public function on the coordinator): <code>attestationCannotChangeOrderStatus</code>, <code>attestationCannotChangeProcessState</code>. One validator-gate rule plus two <code>setValidator</code> storage-isolation invariants: <code>noValidatorBlocksBuyerAttestation</code> (the gate); <code>setValidatorIsFirstWriteWins</code>, <code>setValidatorPreservesOtherBindings</code> (the invariants).
                    </PaperRun>
                    <PaperRun title="Token-operations conservation (TokenOpsVerification.spec, 7 declared rules).">
                        <code>commitBuyerExactDelta</code>, <code>commitSellerExactDelta</code>, <code>commitContractExactDelta</code>, <code>commitAllowanceDrainSafety</code>, <code>commitTokenConservation</code>, <code>resolveSingleOrderPayout</code>, <code>resolveSingleOrderConservation</code>. Certora&rsquo;s prover splits <code>resolveSingleOrderConservation</code> into two sub-cases, so the service report shows 8 sub-rules green for this spec. The token-ops surface is gated by a pre-run lint (<code>lint-token-ops.sh</code>) that asserts the spec&rsquo;s inventory file enumerates every ERC-20 <code>transfer</code>/<code>transferFrom</code>/<code>safeTransfer*</code> call site in <code>src/</code>; new transfer call sites without a matching inventory entry fail before any cloud dispatch.
                    </PaperRun>
                    <PaperRun title="Totals.">
                        <Math>{"8 + 7 + 7 = 22"}</Math> declared rules across the three kernel-relevant specs (kernel, attestation surface, token-operations conservation), shown as 23 sub-rules green in the cloud report once Certora splits the one parametric rule. The repository ships three further specs that do not bear on the kernel claim: <code>BatchVerifierTokenOps.spec</code> (4 rules, the optional batch-settlement path), <code>FigToken.spec</code> (6 rules, the FIG token registry), and <code>RpgfMinter.spec</code> (13 rules, the schema-author RPGF minter). The kernel-relevant total is 22 across three specs; the full six-spec repository total is larger and tracked in the verification-map inventory. A 3-rule spec for the predecessor staged-airdrop contract was retired when that contract was replaced.
                    </PaperRun>
                </PaperSubsection>
                <PaperSubsection title="5.5 Foundry Regression Spine">
                    <p>
                        The Foundry suite includes <code>FigaroCoreRevertBranchTest.t.sol</code>, which targets every custom error listed in Section 3; <code>ParityVectors.t.sol</code>, which asserts EIP-712-digest parity between the SDK&rsquo;s TypeScript hash function and the on-chain implementation; and <code>FigaroCoreEventEmissionTest.t.sol</code>, which asserts every event field encodes as the SDK expects. Counts of files and tests are deliberately not stated; they evolve with the test surface.
                    </p>
                </PaperSubsection>
                <PaperSubsection title="5.6 Scope of the Verification Claim">
                    <p>What this verification establishes: the Solidity source at the snapshot commit has been audited by four different methodological approaches, and each finds the source satisfies its named properties within the bounds it explores. What it does <em>not</em> establish:</p>
                    <ul className="space-y-2 list-disc pl-6 text-sm">
                        <li><strong>That the specification is the right specification.</strong> Verification checks code against a spec; it does not check whether the spec captures what the author meant or what users expect.</li>
                        <li><strong>That bytecode at a deployed address was compiled from this commit.</strong> The production deployment is a separate act, using a compiler under settings this paper does not pin. Relying parties should confirm the source-to-bytecode-to-address chain independently.</li>
                        <li><strong>That the denomination token behaves.</strong> The kernel takes an arbitrary <code>IERC20</code>. If the chosen token&rsquo;s issuer exercises blocklist, freeze, upgrade, or pause authority over a party&rsquo;s bonded balance, the &ldquo;no escape hatch&rdquo; property is vacuously violated &mdash; the bond is still locked from the kernel&rsquo;s perspective but unreachable from the world&rsquo;s. The choice of denomination token is a selection of whose escape hatches to accept, not an avoidance of escape hatches in aggregate.</li>
                        <li><strong>That chain liveness and key custody persist.</strong> If the host chain halts, censors, or reorgs past finality, and if either party loses or has compromised their signing key, the kernel has no recovery mechanism. These are operational-security dependencies above the verified surface.</li>
                    </ul>
                    <p>Verification reduces one class of risk (specification&ndash;implementation gap within the verified bounds) and displaces several others (specification correctness, deployment chain of custody, token-issuer authority, host-chain liveness, key custody) onto layers the paper does not itself verify. A practitioner or legal reader should treat these claims as input to due diligence, not as a substitute for it.</p>
                </PaperSubsection>
            </PaperSection>

            <PaperSection title="6. Security Analysis">
                <PaperSubsection title="6.1 Threat Model">
                    <p>We assume rational adversaries who maximize economic payoff. We consider several attack vectors.</p>
                    <PaperRun title="Griefing (buyer refuses to resolve).">
                        The attacker&rsquo;s cost is <Math>{"2P"}</Math> (locked bond) plus opportunity cost on that capital plus permanent on-chain reputation damage; the benefit is zero. For rational agents the attack is strictly dominated by cooperation. For irrational agents (spite exceeds economic loss), Layer 3 provides deterrence: the immutable on-chain record serves as evidence in off-chain legal proceedings.
                    </PaperRun>
                    <PaperRun title="Sybil (fake orders to manipulate state).">
                        Each order requires real bond deposits totaling <Math>{"2(G_i + P_i)"}</Math> per order. At scale, Sybil attacks are capital-intensive with no path to extracting the invested capital &mdash; no secondary market for locked bonds, no yield, no governance influence.
                    </PaperRun>
                    <PaperRun title="Front-running.">
                        Order identifiers are content-addressed from the dual-signed commitment. An attacker who observes a pending <code>commit</code> cannot create a conflicting order for the same process: producing a different signature changes the digest, which changes the order hash, so the front-runner&rsquo;s order would be a distinct order, not a conflicting one. No extractable MEV exists.
                    </PaperRun>
                    <PaperRun title="Cumulative value manipulation.">
                        Overstating cumulative value is strictly dominated under the bond formula <Math>{"C_s = 2G'"}</Math>: a seller who reports <Math>{"G' > G_{\\text{true}}"}</Math> posts a larger bond for the same payment recovery <Math>{"P"}</Math>, leaving expected utility strictly decreasing in the reported value (the mechanism&rsquo;s cumulative-value reporting honesty result). Understating is prevented by the monotonic accumulator check (<code>CumulativeValueMismatch</code> revert).
                    </PaperRun>
                    <PaperRun title="Reentrancy.">
                        The kernel inherits OpenZeppelin&rsquo;s <code>ReentrancyGuard</code>, and both external entry points carry the <code>nonReentrant</code> modifier. The guard is load-bearing because the resolution loop performs two <code>safeTransfer</code> calls per iteration before writing the order&rsquo;s resolved status: under a token whose transfer hooks call back into the caller (ERC-777, ERC-1363, or any future callback-bearing ERC-20), the callback could otherwise re-enter <code>resolveProcess</code> on the same process. The mutex blocks this by reverting the nested call before any half-resolved state can be observed.
                    </PaperRun>
                    <PaperRun title="ECDSA signature malleability.">
                        The kernel uses OpenZeppelin&rsquo;s <code>ECDSA.recover</code>, which from v5 onward rejects high-<Math>{"s"}</Math> signatures (the secp256k1 malleability class) and rejects <Math>{"v"}</Math> values outside <Math>{"\\{27, 28\\}"}</Math>. A duplicate commitment cannot be constructed by malleating a valid signature; combined with the <code>DuplicateCommitment</code> guard on <code>orderStatus</code>, the contract is immune to the malleability replay class.
                    </PaperRun>
                    <PaperRun title="Integer-overflow safety.">
                        Compiled under Solidity 0.8.26 (checked arithmetic by default), the contract additionally carries an explicit pre-multiplication check: inside <code>resolveProcess</code>, before computing <Math>{"2G + P"}</Math>, it reverts with <code>{`"CumulativeValueOverflow"`}</code> if any active commitment&rsquo;s <code>expectedCumulativeValue</code> exceeds <Math>{"\\mathrm{type(uint256).max}/3"}</Math>. The check is asserted at resolution rather than at commit, so an overflow-prone commitment can be admitted but cannot be settled &mdash; harmless because the buyer is the only party who can trigger settlement and bears the locked bond as the cost of any admitted commitment.
                    </PaperRun>
                    <PaperRun title="Resolution-loop gas bounding.">
                        The resolution function performs a fixed-cost block per order (struct hash, SLOAD, two ERC-20 transfers, SSTORE). Empirical measurement shows approximately 14,000 gas per order, giving a ceiling of roughly 2,145 orders resolvable in a single transaction at a 30,000,000-gas block limit. Liveness is conditional on <Math>{"\\text{activeOrderCount} \\times g_{\\text{per-order}} < g_{\\text{block}}"}</Math>; processes that exceed this must be composed via the multi-process pattern (a sub-order in process <Math>{"A"}</Math> rooting a separate process <Math>{"B"}</Math>) rather than packed into one resolvable process.
                    </PaperRun>
                    <PaperRun title="Signature replay across forks.">
                        The EIP-712 domain separator binds the digest to chain id and verifying contract. OpenZeppelin&rsquo;s <code>_hashTypedDataV4</code> recomputes the domain separator when <code>block.chainid</code> changes, so a chain split that updates chainId on one fork invalidates pre-fork signatures on that fork. A split that does <em>not</em> update chainId leaves both forks sharing the domain separator (a property of the chain identification scheme, addressed at the deployment layer).
                    </PaperRun>
                    <PaperRun title="Cross-contract reentrancy via the attestation surface.">
                        A malicious schema validator could attempt to call <code>commit</code> or <code>resolveProcess</code> during validation. Two guards apply: the <code>ISchemaValidator</code> interface specifies <code>validate</code> as <code>pure</code> (a validator performing external calls violates the interface contract), and the kernel&rsquo;s <code>nonReentrant</code> modifier blocks the nested call regardless. The attestation surface is therefore a denial-of-service vector at worst, not a state-corruption vector.
                    </PaperRun>
                </PaperSubsection>
                <PaperSubsection title="6.2 Liveness">
                    <FormalBlock label="Theorem 6.1 (Liveness Under Rationality).">
                        <p>Let <Math>{"B"}</Math> be a buyer with time-discounted utility <Math>{"U_B = \\sum_{t=0}^{\\infty} \\delta^t \\cdot u_t"}</Math> where <Math>{"\\delta \\in (0, 1)"}</Math> is the discount factor and <Math>{"u_t"}</Math> the per-period payoff. If all sellers have cooperated (the buyer has received the agreed goods), then the buyer resolves in finite time.</p>
                    </FormalBlock>
                    <PaperRun title="Proof.">
                        The buyer&rsquo;s payoff under <em>resolve at</em> <Math>{"t^*"}</Math> is <Math>{"\\delta^{t^*} \\sum_i P_i"}</Math>; under <em>never resolve</em> is <Math>{"0"}</Math>. Since <Math>{"\\delta \\in (0,1)"}</Math> and <Math>{"P_i > 0"}</Math>, every finite <Math>{"t^*"}</Math> strictly dominates non-resolution; the optimum is <Math>{"t^* = 0"}</Math>.
                    </PaperRun>
                    <PaperRemark title="Limitations.">
                        Theorem 6.1 assumes (i) the buyer received satisfactory performance, (ii) <Math>{"\\delta < 1"}</Math>, and (iii) no spite. Condition (iii) is the hardest to guarantee; when it fails, the residual case is addressed by Layer 3 (legal deterrence via immutable on-chain evidence). The theorem additionally assumes the resolve transaction can be admitted (no permanent censorship, no sequencer outage), that the resolution loop fits within the block-gas limit, that the buyer retains control of the signing key, and that the process denomination is itself live (transfers do not revert under blocklist or freeze).
                    </PaperRemark>
                </PaperSubsection>
                <PaperSubsection title="6.3 The Three-Layer Enforcement Architecture">
                    <div className="my-4 overflow-x-auto">
                        <table className="text-sm border-collapse w-full">
                            <thead>
                                <tr>
                                    <th className="border border-default px-3 py-1.5 text-left font-semibold text-ink-heading">Layer</th>
                                    <th className="border border-default px-3 py-1.5 text-left font-semibold text-ink-heading">Mechanism</th>
                                    <th className="border border-default px-3 py-1.5 text-left font-semibold text-ink-heading">Coverage</th>
                                    <th className="border border-default px-3 py-1.5 text-left font-semibold text-ink-heading">Failure Mode</th>
                                </tr>
                            </thead>
                            <tbody>
                                {[
                                    ["1. Bonding", "Asymmetric collateral", "Rational actors", "Irrational actors"],
                                    ["2. Coordination", "Atomic resolution", "Multi-seller failures", "Uncoordinated sellers"],
                                    ["3. Evidence", "Immutable on-chain log", "Adversarial actors", "Jurisdictional limits"],
                                ].map((r) => (
                                    <tr key={r[0]}>
                                        {r.map((c, i) => (
                                            <td key={i} className="border border-default px-3 py-1.5">{c}</td>
                                        ))}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                    <p>
                        <strong>Layer 1 (economic):</strong> the bonding equilibrium handles rational participants &mdash; cooperation strictly dominates defection at every node. <strong>Layer 2 (coordinational):</strong> atomic resolution induces the weakest-link subgame; honest sellers have direct economic interest of magnitude <Math>{"P_i + 2G_i"}</Math> in ensuring co-sellers cooperate, with no explicit communication required. <strong>Layer 3 (evidentiary):</strong> every commitment, bond deposit, and resolution (or its absence) is recorded with block timestamps. The kernel does not attempt on-chain dispute resolution; it provides the <em>evidence</em> that off-chain dispute systems already accept.
                    </p>
                </PaperSubsection>
                <PaperSubsection title="6.4 Scope and Limitations">
                    <p>
                        <em>Liveness under non-rational failure.</em> Catastrophic non-rational failure (lost keys, hardware failure, participant death) imposes losses on co-sellers via atomic resolution regardless of incentive alignment. The coordination-pressure result assumes payoffs depend on co-sellers&rsquo; <em>choices</em>; failure is not a choice. Operational reliability under such failure depends on participant-continuity practices (key management, multisig, delegated signing) that sit above the kernel.
                    </p>
                    <p>
                        <em>Capital opportunity cost.</em> At prevailing risk-free rate <Math>{"r"}</Math> over process duration <Math>{"t"}</Math>, the buyer and seller forgo <Math>{"rPt"}</Math> and <Math>{"2rGt"}</Math> respectively. Dominance is preserved at any <Math>{"rt > 0"}</Math>, but the operational margin narrows; the <Math>{"2\\times"}</Math> multiplier is sufficient as a matter of game-theoretic derivation, while practical applicability favors processes short relative to the prevailing risk-free horizon.
                    </p>
                </PaperSubsection>
            </PaperSection>

            <PaperSection title="7. Mechanism Composition: The Coordinator Pattern">
                <p>The kernel&rsquo;s bonding equilibrium is a fixed point. The natural next question &mdash; under what conditions does an external mechanism composed with the kernel preserve the equilibrium? &mdash; is answered, in this implementation, by the <em>coordinator pattern</em>.</p>
                <FormalBlock label="Proposition 7.1 (Coordinator Pattern — Sufficient Conditions).">
                    <p>An external mechanism <Math>{"M"}</Math> composed with <code>FigaroCore</code> preserves the kernel&rsquo;s bonding equilibrium if it satisfies:</p>
                    <ul className="space-y-1 list-none pl-0 text-sm">
                        <li>(i) <strong>Read-only kernel access</strong>: <Math>{"M"}</Math> interacts with kernel state via <code>staticcall</code> or event consumption only.</li>
                        <li>(ii) <strong>Role non-impersonation</strong>: <Math>{"M"}</Math> never calls <code>commit</code> or <code>resolveProcess</code> on behalf of a buyer or seller; signatures are originated by the parties themselves.</li>
                        <li>(iii) <strong>Bond non-modification</strong>: <Math>{"M"}</Math> holds no kernel bonds and does not interpose between the parties and the bond transfers.</li>
                        <li>(iv) <strong>No bypass and no off-kernel side-payment</strong>: <Math>{"M"}</Math> does not provide an alternative resolution path or escape from <code>Active</code>, and does not commit (on-chain or off-chain) to award value contingent on the kernel&rsquo;s bond outcome.</li>
                    </ul>
                </FormalBlock>
                <p>
                    The second clause of (iv) closes a counterexample worth naming: a mechanism <Math>{"M"}</Math> that custodies its own off-chain collateral and promises parties a side-payment indexed to the kernel&rsquo;s resolved state would satisfy (i)&ndash;(iii) and the first clause of (iv) &mdash; it touches no kernel bonds and never bypasses the kernel state machine &mdash; yet would reintroduce an unbonded actor (the side-payment custodian) into the parties&rsquo; decision calculus. The on-chain bond ratio would no longer be the marginal economic signal, and the equilibrium argument that licenses the proposition would degrade. Excluding off-kernel side-payments explicitly is therefore necessary for the proposition to bear on the equilibrium and not only on the kernel state machine.
                </p>
                <p>
                    Proposition 7.1 is sufficient, not necessary; mechanisms that violate one of (i)&ndash;(iv) may still preserve the equilibrium under additional per-mechanism argument. The four conditions are currently checked by inspection per extension contract rather than by a parametric Certora rule that quantifies over arbitrary <Math>{"M"}</Math> &mdash; a parametric rule of the form &ldquo;<Math>{"M"}</Math> does not call <code>commit</code>&rdquo; for arbitrary <Math>{"M"}</Math> has not yet been authored. The present coverage is by-construction review of each named extension below. We exhibit three instances.
                </p>
                <PaperRun title="Dutch auction (src/DutchAuction.sol).">
                    A descending-price coordination primitive that performs role allocation: who may become the seller for a given root commitment. The auction holds no tokens, custodies no bonds, and never calls <code>commit</code>. The winner subsequently signs an EIP-712 commitment off-chain and the parties execute <code>commit</code> themselves. Conditions (i)&ndash;(iv) hold by construction.
                </PaperRun>
                <PaperRun title="Attestation coordinator (src/AttestationCoordinator.sol).">
                    A unified zero-storage attestation surface, validator-gated per <code>schemaId</code>. Three modes: <code>attestAsSeller</code>, <code>attestAsBuyer</code>, <code>attestViaResolver</code>. Each call verifies role membership against the kernel&rsquo;s <code>ProcessState.rootBuyer</code> (or an <code>IRoleResolver</code> for the resolver path), runs <code>schemaValidator[schemaId].validate(...)</code> on the content, and emits an <code>Attestation</code> event whose <code>contentRef</code> is <Math>{"\\mathrm{keccak256}(\\text{content})"}</Math>. The coordinator never modifies kernel state &mdash; this is the headline Certora rule <code>attestationCannotChangeOrderStatus</code> and its sibling <code>attestationCannotChangeProcessState</code>, both verified exhaustively. The cleanest example of an event-only extension.
                </PaperRun>
                <PaperRun title="Schema and operator registries (src/SchemaRegistry.sol, src/OperatorRegistry.sol).">
                    Permissionless, append-only event-first registries. The schema registry anchors content schemas as <code>keccak256(name)</code> with a URI hash pointing at the off-chain JSON spec. The operator registry is on-chain operator self-registration with a reclaimable deposit. Both compose with the kernel by being visible to readers and not callable by <code>commit</code> or <code>resolveProcess</code>. Conditions (i)&ndash;(iv) hold; both are pure coordination surfaces with no kernel interaction. (The stateless atomic-bind helper <code>src/SchemaRegistrationHelper.sol</code>, which composes <code>registerSchema</code> with <code>setValidator</code> in one transaction, satisfies the proposition by the same construction.)
                </PaperRun>
                <PaperRun title="A note on liability allocation when conditions fail.">
                    The verification status of Proposition 7.1 matters for legal readers: the four conditions are presently checked by inspection per extension contract, not by a parametric Certora rule quantifying over arbitrary <Math>{"M"}</Math>. If an extension silently violates a condition and a downstream user is harmed when the kernel equilibrium breaks for that composition, the kernel verification in this paper does not extend to the resulting harm. The kernel claims it is correct; it does not claim that every extension built against it is correct, nor that the legal chain from kernel correctness to user remedy is closed.
                </PaperRun>
            </PaperSection>

            <PaperSection title="8. Conclusion">
                <p>
                    We have presented a verified Solidity implementation of the two-mechanism bonded commitment settlement primitive: an ownerless, fee-less kernel of two functions and three mappings, with a four-layer verification stack (TLA⁺, Echidna, Halmos, Certora) that exercises the same invariants from four methodological directions. The coordinator pattern provides a discipline for extending the kernel without weakening its equilibrium.
                </p>
                <PaperRun title="The deeper claim: defense in depth, not a probability bound.">
                    Beyond the headline numbers, the value of the verification stack is that four methodologically different proofs converge on the same seven properties (token conservation, solvency, bond correctness, status monotonicity, buyer dominance, cumulative monotonicity, atomic resolution). We present this as <em>defense in depth</em>: a bug that survives all four toolchains must be consistent with the bounded-exhaustive exploration of TLA⁺, the property-level random sampling of Echidna, the symbolic-input discharge of Halmos, and the method-quantified SMT rules of Certora. We do not attempt a formal probability bound on residual error: Halmos and Certora both lean on the z3 SMT solver, which breaks the independence assumption any probabilistic bound would require, and the prior distribution over kernel-invariant violations in this toolchain ecosystem is not characterized in the literature. The honest statement is that four methodologically distinct proofs agreeing provides substantially stronger assurance than any one alone, not that the residual probability is bounded above by any particular value. The stack reduces risk; it does not retire it.
                </PaperRun>
            </PaperSection>
        </PaperLayout>
    );
}
