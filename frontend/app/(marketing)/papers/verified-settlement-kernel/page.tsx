import type { Metadata } from "next";
import Link from "next/link";
import {
    PaperLayout,
    PaperSection,
    PaperSubsection,
    PaperRun,
} from "@/components/papers/PaperLayout";
import { Math } from "@/components/papers/Math";

export const metadata: Metadata = {
    title: "A Verified Settlement Kernel — Figaro Protocol",
    description:
        "A reference implementation of the two-mechanism bonded commitment kernel — ownerless, fee-less, admin-less — with the machine-checked formal-verification methodology applied to it, the threat model, and the coordinator pattern for invariant-preserving composition.",
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
        <PaperLayout slug="verified-settlement-kernel"
            title="A Verified Settlement Kernel"
            subtitle="Formal Verification, Threat Model, and the Coordinator Pattern"
            author="Figaro"
            date="April 2026"
            watermark="Figaro Protocol · Preprint"
            keywords="smart contracts, formal verification, model checking, symbolic execution, property-based fuzzing, EIP-712, settlement layer, coordinator pattern"
            abstract={
                <>
                    <p>
                        We describe a reference implementation of the two-mechanism bonded commitment settlement primitive &mdash; <em>asymmetric bonding</em> (each party locks a <Math>{"2\\times"}</Math> bond, with the seller bonding against cumulative upstream value) and <em>buyer dominance with atomic resolution</em> (only the root buyer may extend or resolve, and resolution settles every active order in the process simultaneously or not at all) &mdash; together with the formal-verification methodology applied to it (machine checks by the authoring project; no external audit has been performed). The kernel is <strong>ownerless, fee-less, and admin-less</strong>: two external entry points, a minimal storage footprint, no upgrade path, no escape hatch from the bonded state.
                    </p>
                    <p>
                        Verification is layered: exhaustive model checking explores the full reachable state space under bounded parameters; property-based fuzzing exercises the compiled bytecode against randomized adversarial call sequences; symbolic execution discharges the kernel safety properties over all inputs in the modeled traces; and SMT-based specification checking proves method-quantified rules across the kernel, the attestation surface, and a token-operations conservation surface covering every value-transfer call site. The properties established are token conservation, contract solvency, the asymmetric-bonding amounts, monotonic cumulative value, buyer-dominant atomic resolution, and the no-state-change guarantee on the attestation surface.
                    </p>
                    <p>
                        The implementation also realizes a <em>coordinator pattern</em>: a composition discipline under which external mechanisms (a clause-typed attestation coordinator, a swap-funded commitment coordinator, and clause and participant registries) compose with the kernel without weakening the bonding equilibrium. We give the five sufficient conditions and three concrete instances. Finally, we describe the five-layer enforcement architecture &mdash; the chain&rsquo;s consensus security as foundation, the bonding equilibrium with its co-resident immutable record, atomic resolution&rsquo;s co-seller remedy, and the arbitration and legal forums that read the record &mdash; and the threat model under which the layers compose.
                    </p>
                </>
            }
            references={
                <>
                    <li>Bloemen, R., Logvinov, L., &amp; Evans, J. EIP-712: Typed Structured Data Hashing and Signing. Ethereum Improvement Proposal 712, 2017.</li>
                    <li>de Moura, L. &amp; Bj&oslash;rner, N. Z3: An Efficient SMT Solver. In <em>Tools and Algorithms for the Construction and Analysis of Systems (TACAS)</em>, pages 337&ndash;340, 2008.</li>
                    <li>Lamport, L. <em>Specifying Systems: The TLA⁺ Language and Tools for Hardware and Software Engineers</em>. Addison-Wesley, 2002.</li>
                </>
            }
        >
            <PaperSection title="1. Introduction">
                <p>
                    The bonded commitment settlement primitive composes two mechanisms. <em>Asymmetric bonding</em>: for an order with payment <Math>{"P"}</Math> and cumulative upstream value <Math>{"G \\geq P"}</Math>, the buyer locks <Math>{"2P"}</Math> and the seller locks <Math>{"2G"}</Math>, so cooperation is the weakly dominant strategy at every position in an <Math>{"N"}</Math>-party process chain and cooperation is the unique surviving strategy profile. <em>Buyer dominance with atomic resolution</em>: only the root buyer may extend or resolve a process, and resolution settles every active order in the process simultaneously or not at all, inducing a weakest-link subgame among co-sellers under which cooperation pressure propagates without explicit communication. These equilibrium claims are derived in <Link href="/papers/asymmetric-bonding" className="text-ink-heading hover:underline">Asymmetric Bonding and Buyer Dominance</Link>, which proves the two-party theorem and its <Math>{"N"}</Math>-party extension, and they hold under perfect monitoring, an assumption <em>Asymmetric Bonding and Buyer Dominance</em> states explicitly; what the mechanism prices is settlement discipline, not the adjudication of disputed performance, which the forums composed above the kernel resolve.
                </p>
                <p>
                    The mechanism is settlement-substrate-agnostic; it admits realisation on any state machine that maintains a monotonic cumulative-value accumulator and authenticates buyer signatures. This paper presents <em>one</em> such realisation &mdash; the Figaro kernel, a smart contract on a general-purpose blockchain &mdash; and the verification methodology applied to it. The core property the verification is asked to deliver is precisely the gap between mechanism and code: the equilibrium analysis assumes the settlement layer enforces (i) the asymmetric bond formula <Math>{"C_b = 2P"}</Math>, <Math>{"C_s = 2G"}</Math> on commitment with a monotonic accumulator, and (ii) buyer dominance with atomic resolution on process resolution. The code must <em>actually</em> enforce those, in every reachable path, against all reasonable adversaries.
                </p>
                <PaperRun title="What verification does and does not deliver.">
                    A distinction worth naming up front: the equilibrium argument is a property of rational play over a payoff structure, not a property of code. The four verification tools we apply do not verify the equilibrium itself; they verify the <em>structural preconditions</em> that the equilibrium assumes (asymmetric bond formula, monotonic accumulation, buyer dominance, atomic resolution, conservation of value) &mdash; that the code implements the payoff structure faithfully in every reachable path. Claims that some external mechanism &ldquo;preserves the kernel&rsquo;s bonding equilibrium&rdquo; invoke the equilibrium argument (which holds by rational play) and not the verification claim made here (which holds by code inspection).
                </PaperRun>
                <PaperRun title="Brief recap of the settlement primitive.">
                    The two mechanisms together yield: for each committed order, the buyer locks <Math>{"2P"}</Math> and the seller locks <Math>{"2G"}</Math>; only the root buyer can trigger resolution; on resolution the buyer recovers <Math>{"P"}</Math> and each seller recovers <Math>{"2G_i + P_i"}</Math>, with every order in the process settling simultaneously or none. This is the full state-machine surface that the kernel must enforce; the game-theoretic derivation is mechanism-design content and lies outside the scope of the present paper.
                </PaperRun>
            </PaperSection>

            <PaperSection title="2. Kernel Architecture">
                <p>
                    The kernel is a single smart contract that reuses an audited typed-signing facility and a standard reentrancy mutex. It exposes two external entry points &mdash; <em>commit</em> and <em>resolve</em>. There is no deployment-time parameter, no owner, no admin, no upgrade path.
                </p>
                <PaperSubsection title="2.1 Storage Layout">
                    <p>Three pieces of state comprise the kernel:</p>
                    <ul className="space-y-1 list-disc pl-6 text-sm">
                        <li>A <strong>process record</strong>, keyed by process identifier, holding the root buyer, the process denomination, the cumulative upstream value, and the active-order count.</li>
                        <li>An <strong>order status</strong>, keyed by order identifier, taking values in <Math>{"\\{0:\\text{unknown},\\ 1:\\text{committed},\\ 2:\\text{resolved}\\}"}</Math>. The status function is monotonically non-decreasing; this is one of the verified invariants.</li>
                        <li>An <strong>order-to-process binding</strong>, recording each order&rsquo;s process membership.</li>
                    </ul>
                    <p>
                        The kernel deliberately does not store a per-order record. Order terms (payment, cumulative-value snapshot, parties, denomination) are reconstructed off-chain from the signed commitment and the emitted commitment event. Bond amounts (<Math>{"2P"}</Math> for the buyer, <Math>{"2G"}</Math> for the seller) are deterministic functions of those values rather than separate stored variables. Storage is therefore linear in the number of processes and orders, with no order-payload duplication.
                    </p>
                </PaperSubsection>
                <PaperSubsection title="2.2 Commitment Protocol">
                    <p>
                        Both parties sign an EIP-712 typed commitment (Bloemen, Logvinov, &amp; Evans, 2017) off-chain. A single on-chain commit call verifies both signatures against the typed-data digest and pulls both bonds atomically. Root commitments create a new process; sub-order commitments extend an existing one by carrying the inherited process identifier and the next expected cumulative value. This eliminates the accept-reject pattern of traditional escrow protocols (which front-run on acceptance) and makes the act of committing simultaneous from the chain&rsquo;s point of view.
                    </p>
                    <PaperRun title="Parties sign with their own keys.">
                        Both signatures are checked by ECDSA public-key recovery against the claimed buyer and seller addresses: the commit call recovers a signer from each signature and reverts unless it equals the corresponding party. Each party is therefore an address whose own private key produced the signature; a contract wallet that authenticates by returning a validity answer for a third party&rsquo;s signature cannot hold a party role, because no such signature recovers to the wallet&rsquo;s address. A DAO, multisig, or other contract authorizes a key-holding signer upstream, and the kernel sees only that account&rsquo;s signature.
                    </PaperRun>
                    <PaperRun title="Key loss, and what the two entry points do differently under it.">
                        Key custody sits above the verified surface, with no timeout and no recovery path, and the two entry points are exposed to its failure differently &mdash; a distinction worth stating because the pessimistic reading (&ldquo;a lost buyer key strands the bonds&rdquo;) is true of only one of them. <em>Commitment</em> needs a fresh signature from the lost key, so no new order can be entered after the loss; that is unrescuable and permanent. <em>Resolution</em> needs no signature at all: it authorizes on the calling address, and the root buyer is an address rather than a key. A buyer who installs an account-delegation on that address <em>before</em> committing &mdash; carrying whatever guardian or threshold authorization the buyer&rsquo;s own operational security calls for &mdash; therefore keeps every already-active process settleable after key loss, since the delegated code originates the resolve call from the same address the kernel is checking. The delegation must be in place while the key is still held; it cannot be added afterwards, which makes pre-installation, not recovery, the operative discipline.
                    </PaperRun>
                </PaperSubsection>
                <PaperSubsection title="2.3 Identifier Derivation">
                    <p>Process and order identifiers are content-addressed:</p>
                    <div className="my-3 overflow-x-auto">
                        <Math display>{"\\begin{aligned} \\text{processId} &= H_{\\text{EIP-712}}(\\text{root commitment}) \\\\ \\text{orderId} &= H(\\text{processId} \\,\\|\\, \\text{structHash}) \\end{aligned}"}</Math>
                    </div>
                    <p>
                        Here <Math>{"H_{\\text{EIP-712}}"}</Math> denotes the EIP-712 typed-data digest, which binds the structured data to a domain separator, and <Math>{"H"}</Math> is the chain&rsquo;s collision-resistant hash. The domain separator binds the root identifier to chain id and verifying contract, preventing replay across deployments. Sub-orders inherit the process identifier from the signed commitment. No auto-incrementing counter exists; identifier collisions require hash collisions.
                    </p>
                </PaperSubsection>
                <PaperSubsection title="2.4 Fee-on-Transfer Protection">
                    <p>
                        Every bond pull reads the contract&rsquo;s pre-transfer balance, performs the transfer, and reverts if the realized balance change does not equal the requested amount. This ensures the conservation law cannot be broken by tokens that apply a transfer tax &mdash; a class of issues that has silently corrupted accounting in several DeFi systems.
                    </p>
                </PaperSubsection>
                <PaperSubsection title="2.5 Events">
                    <p>Five event types are emitted, supporting full off-chain state reconstruction without an indexing-service dependency:</p>
                    <ul className="space-y-2 list-disc pl-6 text-sm">
                        <li>A <strong>commitment event</strong> carries the canonical commitment payload &mdash; the order and process identifiers, buyer, seller, denomination, payment, cumulative value, the agreement hash, and the salt and deadline. The salt and deadline are what enable a reader to derive the typed-data digest deterministically from event logs alone.</li>
                        <li>Two <strong>companion events</strong> index the seller and the denomination respectively &mdash; needed because the host chain caps indexed event arguments at three.</li>
                        <li>An <strong>order-resolution event</strong> fires once per order at resolution.</li>
                        <li>A <strong>process-resolution event</strong> fires once per process at resolution, with the order count.</li>
                    </ul>
                    <p>A reader who replays these event types into a state machine exactly reconstructs the kernel&rsquo;s three pieces of state &mdash; this is the basis of the deterministic reconstruction primitive used by agents and frontends.</p>
                </PaperSubsection>
            </PaperSection>

            <PaperSection title="3. Deliberate Omissions">
                <p>The following features are deliberately absent. Each absence preserves a mechanism-design property of the bonded commitment primitive (asymmetric bonding, buyer dominance, atomic resolution, or the no-escape-hatch security constraint).</p>
                <ol className="space-y-2 list-decimal pl-6 text-sm">
                    <li><strong>No owner, admin, or upgrade.</strong> There is no pause, upgrade, or ownership-transfer authority. The kernel is ownerless from deployment. Adding any of these would introduce an unbonded actor (the owner) into the resolution path; the escape-hatch weakness result shows that any such actor degrades the bonded equilibrium.</li>
                    <li><strong>No protocol fee.</strong> Settlement distributes the full bond amount to the parties; the absence preserves the buyer&rsquo;s full dominance margin (established by the bonding-equilibrium result).</li>
                    <li><strong>No timeout.</strong> An active order remains active indefinitely; the absence preserves weak dominance for the buyer (established by the escape-hatch result).</li>
                    <li><strong>No partial resolution.</strong> Resolution requires the full active order list and reverts otherwise. This enforces atomicity, on which the weakest-link coordination pressure depends.</li>
                    <li><strong>No internal ledger.</strong> Payouts are direct transfers, not balance increments to be withdrawn later. This eliminates withdrawal-pattern reentrancy surface and removes a class of accounting drift bugs.</li>
                    <li><strong>No restriction on buyer&ndash;seller equality.</strong> The kernel does not forbid <Math>{"B = S"}</Math>. If a single address signs both sides of a commitment, that address deposits both bonds and receives both payouts at resolution; the bond math is self-cancelling and no third party is exposed. The equilibrium analysis treats <Math>{"B \\neq S"}</Math> as the standard case but the kernel permits the degenerate case rather than introducing a guard whose effect would be cosmetic.</li>
                </ol>
                <PaperSubsection title="3.1 Named Reverts as Specification">
                    <p>
                        The kernel defines a closed set of named revert conditions, each named for the invariant it protects: an expired deadline, an invalid buyer or seller signature, a zero payment, a process that already exists or is unknown, a cumulative-value mismatch, a non-buyer caller of resolution, a denomination mismatch, an order that is not committed, an empty active-order list, an incomplete order list, a duplicate commitment, a detected transfer fee, an invalid root cumulative value, and a sub-order against an already-resolved process. The revert names function as a partial executable specification: each is exercised by a revert-branch test and referenced by name in the verification-results section below. A single overflow guard at resolution time is raised as a bare string rather than a declared named revert.
                    </p>
                </PaperSubsection>
            </PaperSection>

            <PaperSection title="4. Formal Verification Methodology">
                <p>We use four verification techniques, each chosen for what it covers that the others do not. The tools are named because a verification claim a reader cannot reproduce is not a verification claim: model checking is TLA&#8314; with the TLC explicit-state checker, fuzzing is Echidna, symbolic execution is Halmos, specification checking is Certora, and the regression spine is Foundry.</p>
                <PaperRun title="Exhaustive model checking (TLA⁺ / TLC).">
                    Captures the full state machine as a single transition system whose invariants are propositional safety properties (Lamport, 2002). A model checker explores all reachable states under bounded parameters, exhibiting either an invariant violation with a minimal trace or exhaustive coverage of the bounded space. Strength: high-level state-machine reasoning; abstracts cryptography and token mechanics to expose accounting errors. Weakness: bounded by parameters; gives no guarantee for unbounded state.
                </PaperRun>
                <PaperRun title="Property-based fuzzing (Echidna).">
                    Runs randomized call sequences against the compiled bytecode, with EIP-712 signing performed in the test harness. Strength: exercises real bytecode against concrete adversaries, including combinations of operations the model abstracts. Weakness: random sampling; finds bugs but does not prove their absence.
                </PaperRun>
                <PaperRun title="Symbolic execution (Halmos).">
                    Encodes call traces as SMT formulas and asks the solver (de Moura &amp; Bj&oslash;rner, 2008) whether any concrete input satisfies the negation of an invariant. Strength: when it returns <em>verified</em>, the property holds for <em>all</em> inputs in the modeled trace, complementing the bounded random sampling of fuzzing with symbolic coverage of the commit/resolve state machine. Weakness: symbolic complexity blows up with control-flow depth; tractable on bounded path lengths.
                </PaperRun>
                <PaperRun title="SMT-based specification checking (Certora).">
                    SMT-based proving of declarative rules against the bytecode. Strength: rules can quantify over methods, allowing universal statements like &ldquo;no method modifies <Math>{"X"}</Math>&rdquo;. Weakness: rule encoding is non-trivial.
                </PaperRun>
                <PaperRun title="Regression testing as the spine (Foundry).">
                    A unit-test suite serves as the continuous-integration spine. These tests are not counted toward formal verification but provide the harness the other three techniques compile against.
                </PaperRun>
                <PaperRun title="Supplementary tooling (Mythril).">
                    One further tool is run out of loop and belongs in none of the four categories above: Mythril, a symbolic-execution scanner for common vulnerability classes (reentrancy, unchecked calls, arithmetic and access-control patterns) rather than for this kernel&rsquo;s named invariants. It is invoked by hand on individual contracts, is not wired into continuous integration, and none of the results in Section 5 depend on it. It is named here because a stack described as complete should not quietly omit a tool that was in fact run.
                </PaperRun>
            </PaperSection>

            <PaperSection title="5. Verification Results">
                <p>The four techniques converge on the same body of kernel safety properties, each within the bounds it explores: model checking establishes a property exhaustively over the bounded reachable state space with no violation; fuzzing checks it after every randomized call sequence on the deployed bytecode with no counterexample produced; symbolic execution discharges it for all inputs in the modeled trace; specification checking proves it as a method-quantified rule against the bytecode. The configuration parameters (invariants, model bounds, property set) are the stable artifact, while incidental run-time figures are not.</p>
                <PaperSubsection title="5.1 Properties Established">
                    <ol className="space-y-2 list-decimal pl-6 text-sm">
                        <li><strong>Token conservation</strong>: the sum of wallet balances plus the contract balance equals the total supply under all commit/resolve sequences &mdash; exhaustive within the model bounds; on bytecode under fuzzing; symbolically after commitment; and as exact per-call-site conservation rules under specification checking.</li>
                        <li><strong>Contract solvency</strong>: the contract balance is non-negative, at least the sum of outstanding bonds, and sufficient to resolve every active process in full &mdash; exhaustive within the model bounds (including the resolution-always-possible form); on bytecode under fuzzing; symbolically after commitment.</li>
                        <li><strong>Bond correctness</strong>: <Math>{"C_b = 2P"}</Math> and <Math>{"C_s = 2G"}</Math> &mdash; symbolically for all <Math>{"P"}</Math>; under specification checking, each commitment moves exactly the buyer&rsquo;s, the seller&rsquo;s, and the contract&rsquo;s balance by the expected delta, with no allowance over-draw.</li>
                        <li><strong>Payout correctness</strong>: <Math>{"\\pi_s = 2G + P"}</Math> and <Math>{"\\pi_b = P"}</Math> at resolution &mdash; symbolically for all <Math>{"P"}</Math>; under specification checking, each single-order resolution pays out exactly and conserves value.</li>
                        <li><strong>Order-status monotonicity</strong>: status moves only <Math>{"0 \\to 1 \\to 2"}</Math>, never backwards &mdash; fuzzing, symbolic execution, and specification checking.</li>
                        <li><strong>Cumulative-value integrity and monotonicity</strong>: per process, <Math>{"G"}</Math> equals the sum of all order payments and never decreases &mdash; all four techniques (integrity within the model bounds and under fuzzing; monotonicity symbolically across sub-order commitments and as a specification rule).</li>
                        <li><strong>Buyer dominance</strong>: any non-buyer caller of resolution reverts &mdash; fuzzing, symbolic execution, and specification checking; the model configuration includes a second buyer so the guard is exercised by an attacker.</li>
                        <li><strong>Atomic resolution</strong>: an incomplete active-order list always reverts &mdash; fuzzing; the model resolves processes only in full.</li>
                        <li><strong>Commitment integrity</strong>: no double commitment is admitted; commitment increments the active-order count and the stored count matches the actual count; the root buyer and the process denomination are immutable once set &mdash; specification checking, with count correctness also within the model bounds and under fuzzing.</li>
                    </ol>
                </PaperSubsection>
                <PaperSubsection title="5.2 Model Configuration">
                    <p>
                        The kernel is modeled as a transition system whose state comprises the process records, order statuses, order records, process-to-order membership, the contract balance, and participant wallet balances, with three actions: root commitment, sub-order commitment, and process resolution. The model abstracts signatures (assumed correct given valid commitments), token mechanics (modeled as integer balances), and timing (deadlines are orthogonal to the bonding equilibrium and are exercised by regression testing instead). The bounded configuration uses two buyers and two sellers, several concurrent processes, and several sub-orders per process. Type well-formedness of all state variables and wallet non-negativity are additionally verified within the same bounds.
                    </p>
                </PaperSubsection>
                <PaperSubsection title="5.3 Composition Surfaces">
                    <p>
                        Two verified surfaces sit beyond the kernel entry points, both under specification checking. On the <strong>attestation surface</strong>, a non-buyer cannot attest as the buyer, and a successful buyer attestation implies the caller is the buyer; quantified over every public entry point on the coordinator, the attestation surface <em>cannot change kernel state</em> &mdash; neither order status nor process state &mdash; which is the headline guarantee for the coordinator. The clause-section bindings established at registration are first-write-wins and isolated from one another. On the <strong>token-operations surface</strong>, the conservation rules are gated so that every value-transfer call site in the kernel is covered by a rule before any check is dispatched; a new transfer call site without a matching rule fails the gate.
                    </p>
                </PaperSubsection>
                <PaperSubsection title="5.4 Regression Spine">
                    <p>
                        The regression suite targets every named revert listed in Section 3; asserts typed-data-digest parity between the off-chain hash derivation and the on-chain implementation; and asserts that every event field encodes as readers expect. Counts of files and tests are deliberately not stated; they evolve with the test surface.
                    </p>
                </PaperSubsection>
                <PaperSubsection title="5.5 Scope of the Verification Claim">
                    <p>
                        Two framing statements before the list. First on status: the results above are machine checks run by the authoring project, not an external audit. The Solidity surface was frozen for external audit in April 2026 and no external audit has been performed on it; completion of one is a named release blocker, and nothing in this paper should be read as reporting an auditor&rsquo;s opinion. Second on coverage: every property in Section 5.1 is a property of the <em>direct</em> settlement path &mdash; the kernel&rsquo;s own commit and resolve entry points and the state they maintain &mdash; together with the two composition surfaces of Section 5.3. The system as built carries a second settlement path as well, treated separately below.
                    </p>
                    <p>What this verification establishes: the Solidity source at the snapshot commit has been checked by four methodologically distinct approaches, and each finds the source satisfies its named properties within the bounds it explores. What it does <em>not</em> establish:</p>
                    <ul className="space-y-2 list-disc pl-6 text-sm">
                        <li><strong>That the specification is the right specification.</strong> Verification checks code against a spec; it does not check whether the spec captures what the author meant or what users expect.</li>
                        <li><strong>That bytecode at a deployed address was compiled from this commit.</strong> The production deployment is a separate act, using a compiler under settings this paper does not pin. Relying parties should confirm the source-to-bytecode-to-address chain independently.</li>
                        <li><strong>That the denomination token behaves.</strong> The kernel takes an arbitrary fungible token. If the chosen token&rsquo;s issuer exercises blocklist, freeze, upgrade, or pause authority over a party&rsquo;s bonded balance, the &ldquo;no escape hatch&rdquo; property is vacuously violated &mdash; the bond is still locked from the kernel&rsquo;s perspective but unreachable from the world&rsquo;s. The choice of denomination token is a selection of whose escape hatches to accept, not an avoidance of escape hatches in aggregate.</li>
                        <li><strong>That chain liveness and key custody persist.</strong> If the host chain halts, censors, or reorgs past finality, and if either party loses or has compromised their signing key, the kernel has no recovery mechanism. These are operational-security dependencies above the verified surface.</li>
                    </ul>
                    <p>A practitioner or legal reader should treat these claims as input to due diligence, not as a substitute for it.</p>
                    <PaperRun title="Reproducibility.">
                        Pinned tool versions are meaningful to a reader only once there is a published artifact to pin them against, so what follows is what is true now. The suites reported above were last re-run in full on 4 August 2026: six specification-checking specs carrying thirty-seven declared rules, all verified; thirty-two symbolic-execution properties across five harnesses, all proved; and four model-checking models carrying forty-six invariants in total &mdash; the kernel model, the token model, the swap-funded-composer model, and the twenty-one-invariant composed-settlement model of the two paths &mdash; each exhausting its bounded state space without a violation, exhaustive within the bounds stated in Section 5.2 for the kernel model and within each other model&rsquo;s own configuration for the token, swap-funded-composer, and composed-settlement models, and nowhere beyond them. The repository publishes the runner script and the tool configuration for every one of these suites, so a reader with the same tools can re-run them rather than take the counts on trust; the models&rsquo; invariant lists and bounds are in the configurations themselves. What is not yet published is a commit-anchored artifact bundle &mdash; the source snapshot, the tool versions, and the run outputs fixed together at one commit &mdash; and producing it is a named pre-release task, gated on the same freeze as the external audit.
                    </PaperRun>
                    <PaperRun title="The second settlement path.">
                        Beside the direct path the system carries a proof-batched one: a batch verifier that admits a validity proof of off-chain execution by a guest mirror of the kernel&rsquo;s state machine, reconciles net token positions per participant and denomination, re-emits the attestations, and advances its own state root. The two paths share no state and never call one another. An order settled through the batch verifier never acquires a kernel order status at all, which means the kernel-state properties of Section 5.1 are silent about it &mdash; not satisfied and not violated, simply not about that path. Exactly one quantity crosses between them: a usage accrual, carried as proved numbers into the counter that scores clause and assembly usage. This is the honest statement of what the Section 5 claims cover, and it is why the coverage sentence above is stated at all.
                    </PaperRun>
                    <PaperRun title="What is checked about the composition of the two paths.">
                        The cross-path composition is not left to inspection. A machine-checked model of the composed system &mdash; the kernel, the batch verifier, the usage counter, and the off-chain guest kernel, interleaved arbitrarily &mdash; carries twenty-one invariants, among them that no value is paid out twice across the two paths, that the two paths&rsquo; order identities are disjoint, that token conservation and exact per-pool escrow hold on both sides at once, that the kernel&rsquo;s status gates stay blind to batch-settled orders, and that the usage score composes as the sum of the two paths&rsquo; contributions with the bridged write replacing rather than adding. What the model establishes is safety under arbitrary interleaving, given two named assumptions, and neither the model nor this paper claims more. The first assumption &mdash; that one signed commitment can never acquire the same identity in both paths &mdash; is contract-enforced rather than promised, since each path binds its own verifying-contract address into the typed-data domain from which a root identifier is derived, so the two identifier spaces are disjoint by construction. The second &mdash; that no accrual-period boundary falls between a batch being proved and its settling &mdash; is <em>not</em> enforced; when it fails, the usage accrual for the affected processes is dropped rather than double-counted, so the failure mode is a conservative under-count and the model separates which invariants rest on which assumption. Proof validity itself, signature recovery, and hash collision-resistance are abstracted by the model, as they are by the kernel model of Section 5.2.
                    </PaperRun>
                </PaperSubsection>
            </PaperSection>

            <PaperSection title="6. Security Analysis">
                <PaperSubsection title="6.1 Threat Model">
                    <p>We assume rational adversaries who maximize economic payoff. We consider several attack vectors.</p>
                    <PaperRun title="Griefing (buyer refuses to resolve).">
                        The attacker&rsquo;s cost is <Math>{"2P"}</Math> (the forfeited bond) plus the permanent public record of the refusal, which every future counterparty reads before dealing with the attacker; the benefit is zero. For rational agents the attack is strictly dominated by cooperation. For irrational agents (spite exceeds economic loss), the outer layers provide deterrence: the immutable on-chain record, produced at Layer 1 by construction, is admissible as evidence in the arbitration and legal forums (Layers 3&ndash;4).
                    </PaperRun>
                    <PaperRun title="Sybil (fake orders to manipulate state).">
                        Each order requires real bond deposits totaling <Math>{"2(G_i + P_i)"}</Math> per order. At scale, Sybil attacks are capital-intensive with no path to extracting the invested capital &mdash; no secondary market for locked bonds, no yield, no governance influence.
                    </PaperRun>
                    <PaperRun title="Front-running.">
                        Order identifiers are content-addressed from the dual-signed commitment. An attacker who observes a pending commitment cannot create a conflicting order for the same process: producing a different signature changes the digest, which changes the order identifier, so the front-runner&rsquo;s order would be a distinct order, not a conflicting one. No extractable MEV exists.
                    </PaperRun>
                    <PaperRun title="Cumulative value manipulation.">
                        Overstating cumulative value is strictly dominated under the bond formula <Math>{"C_s = 2G'"}</Math>: a seller who reports <Math>{"G' > G_{\\text{true}}"}</Math> posts a larger bond for the same payment recovery <Math>{"P"}</Math>, leaving expected utility strictly decreasing in the reported value (the mechanism&rsquo;s cumulative-value reporting honesty result). Understating is prevented by the monotonic accumulator check, which reverts on a cumulative-value mismatch.
                    </PaperRun>
                    <PaperRun title="Reentrancy.">
                        The kernel carries a reentrancy mutex on both external entry points. The guard is load-bearing because the resolution loop performs two transfers per iteration before writing the order&rsquo;s resolved status: under a token whose transfer hooks call back into the caller (a callback-bearing token standard), the callback could otherwise re-enter resolution on the same process. The mutex blocks this by reverting the nested call before any half-resolved state can be observed. The attestation surface adds no further vector: it invokes no external per-clause code &mdash; it verifies a merkle inclusion proof of the attested clause section against the signed agreement hash and content-hashes the evidence, calling nothing it does not control &mdash; so no untrusted callee exists that could attempt to re-enter the kernel during attestation, and the mutex would block any nested call into the settlement entry points regardless.
                    </PaperRun>
                    <PaperRun title="ECDSA signature malleability.">
                        The kernel uses a signature-recovery facility that rejects high-<Math>{"s"}</Math> signatures (the secp256k1 malleability class) and rejects <Math>{"v"}</Math> values outside <Math>{"\\{27, 28\\}"}</Math>. A duplicate commitment cannot be constructed by malleating a valid signature; combined with the duplicate-commitment guard on order status, the kernel is immune to the malleability replay class.
                    </PaperRun>
                    <PaperRun title="Integer-overflow safety.">
                        Compiled under checked-arithmetic semantics, the kernel additionally carries an explicit pre-multiplication check: before computing <Math>{"2G + P"}</Math> at resolution, it reverts if any active commitment&rsquo;s expected cumulative value exceeds one third of the maximum representable value. The check is asserted at resolution rather than at commitment, so an overflow-prone commitment can be admitted but cannot be settled &mdash; harmless because the buyer is the only party who can trigger settlement and bears the locked bond as the cost of any admitted commitment.
                    </PaperRun>
                    <PaperRun title="Resolution-loop gas bounding.">
                        Resolution performs a fixed-cost block of work per order (a hash, a storage read, two transfers, a storage write), so its total cost grows linearly in the active-order count. Liveness is conditional on <Math>{"\\text{activeOrderCount} \\times g_{\\text{per-order}} < g_{\\text{block}}"}</Math>; a process whose order count would exceed the block-gas limit must be composed via the multi-process pattern (a sub-order in process <Math>{"A"}</Math> rooting a separate process <Math>{"B"}</Math>) rather than packed into one resolvable process.
                    </PaperRun>
                    <PaperRun title="Signature replay across forks.">
                        The EIP-712 domain separator binds the digest to chain id and verifying contract, and is recomputed when the chain id changes, so a chain split that updates the chain id on one fork invalidates pre-fork signatures on that fork. A split that does <em>not</em> update the chain id leaves both forks sharing the domain separator (a property of the chain identification scheme, addressed at the deployment layer).
                    </PaperRun>
                </PaperSubsection>
                <PaperSubsection title="6.2 Liveness">
                    <p>
                        Liveness &mdash; that a buyer who has received satisfactory performance resolves in finite time &mdash; holds under the rational-buyer assumptions established by the bonding-equilibrium results; it is not re-derived here. The implementation adds only operational preconditions: the resolve transaction must be admissible (no permanent censorship, no sequencer outage), the resolution loop must fit within the block-gas limit, the buyer must retain the ability to originate a call from the root-buyer address (a held key, or a delegation installed on that address beforehand), and the process denomination must itself be live (transfers do not revert under blocklist or freeze). The residual non-rational case &mdash; a spiteful buyer who refuses to resolve &mdash; is addressed by the outer layers: the immutable on-chain evidence, admissible in the arbitration and legal forums (Layers 3&ndash;4).
                    </p>
                </PaperSubsection>
                <PaperSubsection title="6.3 The Five-Layer Enforcement Architecture">
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
                                    ["0. Chain", "Consensus and finality", "All on-chain state", "Chain halt, censorship, deep reorg"],
                                    ["1. Bonding + record", "Asymmetric bonds; immutable log emitted by construction", "Rational actors", "Irrational actors"],
                                    ["2. Coordination", "Atomic resolution (co-sellers remedy)", "Multi-seller faults", "Uncoordinated sellers"],
                                    ["3. Arbitration", "On-chain record read in a decentralized forum", "Adversarial actors", "Forum reach"],
                                    ["4. Legal systems", "On-chain record read in courts", "Adversarial actors", "Jurisdictional limits"],
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
                        <strong>Layer 0 (foundation):</strong> the consensus and finality of the underlying chain, named rather than assumed &mdash; every property above inherits its authenticity from here, and the chain-dependency limitations enumerated in Section 5.5 (halt, censorship, deep reorg, denomination-token authority) are the ground on which the rest stands. <strong>Layer 1 (economic, with its co-resident record):</strong> the bonding equilibrium handles rational participants &mdash; cooperation weakly dominates defection at every node, and the all-cooperate profile uniquely survives iterated elimination of weakly dominated strategies (defection is never a profitable deviation, and against a defecting counterparty both actions yield the same locked-bond payoff). The immutable record &mdash; every commitment, bond deposit, and resolution or its absence, block-timestamped &mdash; is emitted at this same layer, in the same act, <em>always and by construction</em>: no party can collect a settlement payout without the corresponding events having been emitted, so the record is a byproduct of the bonding game rather than a fallback summoned when it fails. <strong>Layer 2 (coordinational):</strong> because atomic resolution means no one is paid until the buyer resolves the whole process, honest sellers have a direct interest of magnitude <Math>{"P_i + 2G_i"}</Math> in <em>remedying</em> a faulting co-seller &mdash; helping performance reach the bar that unlocks the shared resolution &mdash; with monitoring and pressure the backing behind that interest, not the mechanism itself. <strong>Layers 3&ndash;4 (adjudicative):</strong> the kernel does not attempt on-chain dispute resolution; it provides the <em>evidence</em> that off-chain forums read, ordered outward from decentralized or institutional arbitration (Layer 3) to the traditional legal systems whose law the agreement selects (Layer 4). Recourse to Layers 3 and 4 exists even when the agreement names no dispute clause: the Layer-1 record is admissible on its own terms, and a party may bring it to whatever forum has jurisdiction.
                    </p>
                </PaperSubsection>
                <PaperSubsection title="6.4 Scope and Limitations">
                    <p>
                        <em>Liveness under non-rational failure.</em> Catastrophic non-rational failure (lost keys, hardware failure, participant death) imposes losses on co-sellers via atomic resolution regardless of incentive alignment. The coordination-pressure result assumes payoffs depend on co-sellers&rsquo; <em>choices</em>; failure is not a choice. Operational reliability under such failure depends on participant-continuity practices (key management, multisig, delegated signing) that sit above the kernel.
                    </p>
                    <p>
                        <em>Bond lock-up spans the process.</em> A bond is not capital seeking a return; it is a deterrent, and its price tag is time. It is locked for exactly the duration of the process it secures &mdash; deposited at commitment, released at resolution &mdash; and that span is not overhead to be weighed against an alternative use of the funds; it is the coordination the bond secures, held in force for precisely as long as defection remains possible. The honest statement of cost is therefore the stake (<Math>{"2P"}</Math> for a buyer, <Math>{"2G"}</Math> for a seller) immobilized for the process&rsquo;s own span &mdash; nothing more, and nothing recoverable through a secondary use of the locked funds, since there is no yield on, market for, or governance weight to a locked bond.
                    </p>
                </PaperSubsection>
            </PaperSection>

            <PaperSection title="7. Mechanism Composition: The Coordinator Pattern">
                <p>The kernel&rsquo;s bonding equilibrium is a fixed point. The natural next question &mdash; under what conditions does an external mechanism composed with the kernel preserve the equilibrium? &mdash; is answered, in this implementation, by the <em>coordinator pattern</em>.</p>
                <FormalBlock label="Proposition 7.1 (Coordinator Pattern — Sufficient Conditions).">
                    <p>An external mechanism <Math>{"M"}</Math> composed with the kernel preserves the kernel&rsquo;s bonding equilibrium if it satisfies:</p>
                    <ul className="space-y-1 list-none pl-0 text-sm">
                        <li>(i) <strong>No unauthorized kernel-state mutation</strong>: <Math>{"M"}</Math> reads kernel state freely &mdash; storage, the kernel&rsquo;s bonded balance, the event log &mdash; and writes none of it on its own account. The two entry points admit composition asymmetrically, and the asymmetry is the kernel&rsquo;s, not a design choice of the pattern. <em>Commitment</em> admits a relay: the call carries both parties&rsquo; signatures, which the kernel recovers itself before pulling each bond from the named party, so the caller supplies transport and the kernel remains the writer. <em>Resolution</em> admits none: it takes no signature at all and authorizes on the caller&rsquo;s own address &mdash; the caller must <em>be</em> the root buyer &mdash; so no composer can resolve on a buyer&rsquo;s behalf even holding a buyer signature. Nor can <Math>{"M"}</Math> hold a party role: the kernel admits only an address whose own ECDSA key produced the signature, so a contract wallet that authenticates by returning a validity answer for a third party&rsquo;s signature cannot be a party.</li>
                        <li>(ii) <strong>No alternative settlement path</strong>: <Math>{"M"}</Math> does not provide an operation that produces value flows equivalent to the kernel&rsquo;s atomic resolution but bypasses it or modifies its preconditions, and holds no discretion over a live process&rsquo;s settlement.</li>
                        <li>(iii) <strong>No discretionary lock-bypass</strong>: <Math>{"M"}</Math> custodies no kernel bonds and does not release bonded funds from the kernel&rsquo;s bonded balance under conditions different from those the kernel&rsquo;s resolution enforces.</li>
                        <li>(iv) <strong>Agreement-bound content</strong> (where applicable): if <Math>{"M"}</Math> accepts content typed by a registered clause identifier, it admits the content only against an order whose signed agreement included that clause, verified by a merkle-inclusion proof of the clause section against the agreement hash; content for a clause not present in the bilateral agreement is rejected.</li>
                        <li>(v) <strong>No off-kernel side-payment</strong>: <Math>{"M"}</Math> does not commit, on-chain or off-chain, to award value to a party contingent on the kernel&rsquo;s resolved bond outcome. A mechanism reading kernel state under conditions (i)&ndash;(iv) may still promise a payout from collateral it custodies off the kernel, indexed to how the kernel resolves; this condition excludes that.</li>
                    </ul>
                </FormalBlock>
                <p>
                    The proposition is stated here, not proved here. Its proof sketch is developed for the same five conditions in <Link href="/papers/protocol-composition" className="text-ink-heading hover:underline">Protocol Composition: A Decision Rule, Clause Design, and the Coordinator Pattern</Link>, where the argument is made condition by condition, including the invariance argument that carries condition (i). What that argument establishes directly is that the kernel&rsquo;s invariants survive composition and that no second path to the bonded funds or to a payoff indexed on them is opened; the step from there to preservation of the parties&rsquo; equilibrium is carried by the bonding derivation&rsquo;s payoff-structure argument, which neither that paper nor this one re-proves. Readers should hold the proposition to that reading: it is a condition set that keeps the payoff structure intact, verified per composition by inspection rather than by a rule quantifying over arbitrary <Math>{"M"}</Math>.
                </p>
                <p>
                    Condition (v) closes a counterexample worth naming: a mechanism <Math>{"M"}</Math> that custodies its own off-chain collateral and promises parties a side-payment indexed to the kernel&rsquo;s resolved state would satisfy (i)&ndash;(iv) &mdash; it touches no kernel bonds and never bypasses the kernel state machine &mdash; yet would reintroduce an unbonded actor (the side-payment custodian) into the parties&rsquo; decision calculus. The on-chain bond ratio would no longer be the marginal economic signal, and the equilibrium argument that licenses the proposition would degrade. Excluding off-kernel side-payments explicitly is therefore necessary for the proposition to bear on the equilibrium and not only on the kernel state machine.
                </p>
                <p>
                    Condition (i) is stated as <em>authorized</em> rather than <em>read-only</em> writing for a reason the instances below make concrete: a composer may legitimately submit a commitment the two parties have already signed, because the kernel then performs its own signature recovery, its own bond pulls, and its own state transition &mdash; the composer supplies transport, not authority. Resolution is the stronger case and needs no such reasoning: the kernel does not check a signature there at all, it checks who is calling, so buyer dominance survives composition by construction rather than by discipline &mdash; there is no artifact a composer could hold that would let it resolve. A composer that could move either kind of kernel state on its own account would be a party in all but name, which is what (i)&rsquo;s last clause forbids.
                </p>
                <p>
                    Proposition 7.1 is sufficient, not necessary; mechanisms that violate one of (i)&ndash;(v) may still preserve the equilibrium under additional per-mechanism argument. We exhibit three instances.
                </p>
                <PaperRun title="Attestation coordinator.">
                    A unified zero-storage attestation surface keyed by clause type. Each attestation verifies role membership against the process&rsquo;s root buyer (or a role-resolver for the third-party path), verifies a merkle inclusion proof of the attested clause section against the signed agreement hash, content-hashes the evidence into an attestation event, and invokes no external per-clause code. The coordinator never modifies kernel state &mdash; this is its headline verified guarantee, established for both order status and process state &mdash; and the merkle-inclusion check is condition (iv) discharged by construction. It is the cleanest example of an event-only composition.
                </PaperRun>
                <PaperRun title="Swap-funded commitment coordinator.">
                    A composer that lets a party post its bond from a token other than the process denomination. For each enabled leg it pulls the party&rsquo;s input token under a signature that binds the swap route itself &mdash; venue, input token, input ceiling, and a hash of the exact swap calldata &mdash; swaps through a venue fixed at deployment, forwards the entire proceeds to the party&rsquo;s own account, and only then submits the commitment the two parties had already signed. It is the instance condition (i) is worded for: it does invoke the kernel&rsquo;s commit entry point, and the write is authorized because the kernel recovers both party signatures itself and pulls each bond from the named party, so the composer funds the party in place rather than substituting for it and never becomes a counterparty. Bond amounts are derived from the signed commitment rather than supplied, so no leg can under-fund the kernel&rsquo;s pull; the coordinator carries the funding leg only and holds no lever after commitment, which is (ii) and (iii). It custodies no collateral and promises no contingent payout, which is (v). The construction is specific to direct kernel settlement: a proof-batched commitment carries no funding leg in its wire format, so a participant settling that way performs the swap wallet-side before the signed commitment is submitted.
                </PaperRun>
                <PaperRun title="Clause and participant registries.">
                    Permissionless, append-only, event-first registries. The clause registry anchors content clauses under a key hashed from the clause name <em>and</em> its version, holding a hash of the canonical specification alongside a pointer to the specification document itself &mdash; so a reader can check that the document it fetched is the one registered. The participant registry is on-chain self-registration with a reclaimable deposit, released after a cooldown so the stake cannot be recycled across identities. Both compose with the kernel by being visible to readers and never invoking the kernel&rsquo;s settlement entry points. Conditions (i)&ndash;(v) hold; both are pure coordination surfaces with no kernel interaction.
                </PaperRun>
                <PaperRun title="A note on liability allocation when conditions fail.">
                    The verification status of Proposition 7.1 matters for legal readers: the five conditions are presently checked by inspection per composition, not by a parametric specification rule quantifying over arbitrary <Math>{"M"}</Math>. If a composition silently violates a condition and a downstream user is harmed when the kernel equilibrium breaks for that composition, the kernel verification in this paper does not extend to the resulting harm. The kernel claims it is correct; it does not claim that every composition built against it is correct, nor that the legal chain from kernel correctness to user remedy is closed.
                </PaperRun>
            </PaperSection>

            <PaperSection title="8. Conclusion">
                <p>
                    We have presented a verified implementation of the two-mechanism bonded commitment settlement primitive: an ownerless, fee-less kernel of two entry points and a minimal state footprint, with a four-method verification stack that exercises the same invariants from four methodological directions. The coordinator pattern provides a discipline for extending the kernel without weakening its equilibrium.
                </p>
                <PaperRun title="The deeper claim: defense in depth, not a probability bound.">
                    The value of the verification stack is that four methodologically different proofs converge on the same body of safety properties (token conservation, solvency, bond correctness, status monotonicity, buyer dominance, cumulative monotonicity, atomic resolution). We present this as <em>defense in depth</em>: a bug that survives all four approaches must be consistent with bounded-exhaustive model checking, property-level random sampling, symbolic-input discharge, and method-quantified specification rules at once. We do not attempt a formal probability bound on residual error: the symbolic and specification approaches both lean on a common SMT solver, which breaks the independence assumption any probabilistic bound would require, and the prior distribution over kernel-invariant violations in this toolchain ecosystem is not characterized in the literature. The honest statement is that four methodologically distinct proofs agreeing provides substantially stronger assurance than any one alone, not that the residual probability is bounded above by any particular value. The stack reduces risk; it does not retire it.
                </PaperRun>
            </PaperSection>
        </PaperLayout>
    );
}
