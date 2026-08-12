import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import {
    PaperLayout,
    PaperSection,
    PaperSubsection,
    PaperRun,
} from "@/components/papers/PaperLayout";
import { Math } from "@/components/papers/Math";
import { BatchSettlementSequenceFigure } from "@/components/figures/BatchSettlementSequenceFigure";
import { SettlementPathsFigure } from "@/components/figures/SettlementPathsFigure";

export const metadata: Metadata = withOg({
    title: "A Verified Settlement Kernel — Figaro Protocol",
    description:
        "A reference implementation of the two-mechanism bonded commitment kernel — ownerless, fee-less, admin-less — with the machine-checked verification methodology applied to it, the properties each method establishes, the threat model, and an honest boundary between the direct settlement path and the proof-batched one.",
});

export default function VerifiedSettlementKernelPaper() {
    return (
        <PaperLayout slug="verified-settlement-kernel"
            title="A Verified Settlement Kernel"
            subtitle="Formal Verification, Threat Model, and the Scope of the Claim"
            author="Figaro"
            date="April 2026"
            watermark="Figaro Protocol · Preprint"
            keywords="smart contracts, formal verification, model checking, symbolic execution, property-based fuzzing, EIP-712, settlement layer, verification scope"
            abstract={
                <>
                    <p>
                        We describe a reference implementation of the two-mechanism bonded commitment settlement primitive &mdash; <em>asymmetric bonding</em> (the buyer locks twice the payment and each seller twice the value the process has accumulated through its own link, that figure inclusive of the order&rsquo;s own payment) and <em>buyer dominance with atomic resolution</em> (only the root buyer may extend or resolve, and resolution settles every active order in the process simultaneously or not at all) &mdash; together with the formal-verification methodology applied to it (machine checks by the authoring project; no external audit has been performed). The kernel is <strong>ownerless, fee-less, and admin-less</strong>: two external entry points, a minimal storage footprint, no upgrade path, no escape hatch from the bonded state. The object is a coordination primitive for bilateral commercial agreements rather than a decentralized-finance protocol: nothing is pooled, lent, or issued, no return accrues to a locked bond, and what the mechanism prices is settlement discipline rather than capital.
                    </p>
                    <p>
                        Verification is layered: exhaustive model checking explores the full reachable state space under bounded parameters; property-based fuzzing exercises the compiled bytecode against randomized adversarial call sequences; symbolic execution discharges the kernel safety properties over all inputs in the modeled traces; and SMT-based specification checking proves method-quantified rules across the kernel, the attestation surface, and a token-operations conservation surface covering every kernel value-transfer call site. The properties established are token conservation, contract solvency, the asymmetric-bonding amounts, monotonic cumulative value, buyer-dominant atomic resolution, and the no-state-change guarantee on the attestation surface.
                    </p>
                    <p>
                        Coverage is reported as it stands rather than as a uniform claim: each property carries the methods that actually establish it, which for some is all four and for others one; every property is a property of the <em>direct</em> settlement path, and the system as built also runs a proof-batched path whose additional assumptions are named one by one rather than folded into the phrase <em>validity proof</em>. The threat model runs the adversarial cases against the code as written and says where the answer is structural &mdash; a state the machine cannot reach &mdash; rather than economic. One composition guarantee is contributed, and it is machine-checked: quantified over every public entry point of the clause-typed attestation coordinator, no method changes kernel state.
                    </p>
                </>
            }
            references={
                <>
                    <li>Barrett, C. &amp; Tinelli, C. Satisfiability Modulo Theories. In <em>Handbook of Model Checking</em>, pages 305&ndash;343. Springer, 2018.</li>
                    <li>Bloemen, R., Logvinov, L., &amp; Evans, J. EIP-712: Typed Structured Data Hashing and Signing. Ethereum Improvement Proposal 712, 2017.</li>
                    <li>Clarke, E. M., Grumberg, O., &amp; Peled, D. A. <em>Model Checking</em>. MIT Press, 1999.</li>
                </>
            }
        >
            <PaperSection title="1. Introduction">
                <p>
                    The bonded commitment settlement primitive has two calls, each carrying a mechanism design of its own. <em>Commit</em>, under <em>asymmetric bonding</em>: for an order with payment <Math>{"P"}</Math> and cumulative value <Math>{"G \\geq P"}</Math> &mdash; the value the process has accumulated through that order&rsquo;s own link, its own payment included &mdash; the buyer locks <Math>{"2P"}</Math> and the seller locks <Math>{"2G"}</Math>, the bond base being fixed by arithmetic on the signed accumulator rather than reported by anyone. <em>Resolve</em>, under <em>buyer dominance with atomic resolution</em>: only the root buyer may extend or resolve a process, resolution settles every active order simultaneously or not at all, and it is terminal. The equilibrium the two produce composes in that order: after performance, resolving is unconditionally strictly better for the buyer, and given that, performance is each seller&rsquo;s strict best response. Because no seller is paid until the buyer resolves the whole process, each seller also holds an interest, computable from the accumulator, in every other seller&rsquo;s performance &mdash; a weakest-link structure among co-sellers that needs no communication between them.
                </p>
                <p>
                    What the mechanism prices is settlement discipline: the buyer&rsquo;s resolution <em>is</em> the acceptance test, the mechanism holding none of its own and admitting no report of delivery. Where the parties honestly disagree about whether what arrived met the agreement, the disagreement is settled between them while the process stands open &mdash; a remedy negotiated, the buyer resolving once satisfied &mdash; and an outside forum may rule on the open record without being able to resolve anything itself, resolution being the buyer&rsquo;s alone. None of that is a claim about code, which is the distinction the rest of this paper is organized around.
                </p>
                <p>
                    The mechanism is settlement-substrate-agnostic; it admits realisation on any state machine that maintains a monotonic cumulative-value accumulator, authenticates both parties&rsquo; signatures on a commitment, and authorizes resolution on the identity of the caller. This paper presents <em>one</em> such realisation &mdash; the Figaro kernel, a smart contract on a general-purpose blockchain &mdash; and the verification methodology applied to it. The core property the verification is asked to deliver is precisely the gap between mechanism and code: the equilibrium analysis assumes the settlement layer enforces (i) the asymmetric bond formula <Math>{"C_b = 2P"}</Math>, <Math>{"C_s = 2G"}</Math> on commitment with a monotonic accumulator, and (ii) buyer dominance with atomic resolution on process resolution. The code must <em>actually</em> enforce those, in every reachable path, against all reasonable adversaries.
                </p>
                <PaperRun title="What verification does and does not deliver.">
                    A distinction worth naming up front: the equilibrium argument is a property of rational play over a payoff structure, not a property of code. The four verification methods we apply do not verify the equilibrium itself; they verify the <em>structural preconditions</em> that the equilibrium assumes (asymmetric bond formula, monotonic accumulation, buyer dominance, atomic resolution, conservation of value) &mdash; that the code implements the payoff structure faithfully in every reachable path. Claims that some external mechanism &ldquo;preserves the kernel&rsquo;s bonding equilibrium&rdquo; invoke the equilibrium argument, which holds by rational play, and not the verification claim made here, which holds by machine checks against the code.
                </PaperRun>
                <PaperRun title="The state-machine surface, stated once.">
                    For each committed order the buyer locks <Math>{"2P"}</Math> and the seller locks <Math>{"2G"}</Math>; only the root buyer can trigger resolution; on resolution the buyer receives <Math>{"P"}</Math> and each seller <Math>{"2G_i + P_i"}</Math>, which exhausts what was locked, with every order in the process settling simultaneously or none. That is the whole of what the kernel must enforce, and it is what Sections 4 and 5 are about. The derivation of the equilibrium from those figures is mechanism-design content and lies outside the scope of the present paper; where a later section needs a result of that derivation, it states the result and does not re-derive it.
                </PaperRun>
            </PaperSection>

            <PaperSection title="2. Kernel Architecture">
                <p>
                    The kernel is a single smart contract that reuses a widely used typed-signing facility and a standard reentrancy mutex. It exposes two external entry points &mdash; <em>commit</em> and <em>resolve</em>. There is no deployment-time parameter, no owner, no admin, no upgrade path.
                </p>
                <PaperSubsection title="2.1 Storage Layout">
                    <p>Three pieces of state comprise the kernel:</p>
                    <ul className="space-y-1 list-disc pl-6 text-sm">
                        <li>A <strong>process record</strong>, keyed by process identifier, holding the root buyer, the process denomination, the cumulative value the process has accumulated, and the active-order count.</li>
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
                    <li><strong>No owner, admin, or upgrade.</strong> There is no pause, upgrade, or ownership-transfer authority. The kernel is ownerless from deployment. Any of them would put the release of bonded funds on the decision of a party that deposited nothing into the process and holds nothing of what it moves &mdash; the configuration under which the equilibrium derived for the two-call mechanism does not carry over to the augmented one.</li>
                    <li><strong>No protocol fee.</strong> Settlement distributes exactly what was locked, so the payoffs the mechanism-design analysis is conducted over are the payoffs the code produces; a fee would shift every one of them by an amount that analysis does not carry.</li>
                    <li><strong>No timeout.</strong> An active order remains active indefinitely. The absence is what keeps the seller&rsquo;s comparison the one the mechanism intends: under a timeout, holding out acquires a second continuation &mdash; keep what is in hand and wait for the bond to come back &mdash; and the comparison that makes performance strictly better is no longer the comparison the game presents.</li>
                    <li><strong>No partial resolution.</strong> Resolution requires the full active order list and reverts otherwise. This enforces atomicity, on which the weakest-link structure among co-sellers depends: each seller&rsquo;s payout waits on every other&rsquo;s performance because there is no way to settle one order alone.</li>
                    <li><strong>No internal ledger.</strong> Payouts are direct transfers, not balance increments to be withdrawn later. This eliminates withdrawal-pattern reentrancy surface and removes a class of accounting drift bugs.</li>
                    <li><strong>No restriction on buyer&ndash;seller equality.</strong> The kernel does not forbid <Math>{"B = S"}</Math>. If a single address signs both sides of a commitment, that address deposits both bonds and receives both payouts at resolution; the bond math is self-cancelling and no third party is exposed. The equilibrium analysis treats <Math>{"B \\neq S"}</Math> as the standard case but the kernel permits the degenerate case rather than introducing a guard whose effect would be cosmetic.</li>
                </ol>
                <PaperSubsection title="3.1 Named Reverts as Specification">
                    <p>
                        The kernel defines a closed set of named revert conditions, each named for the invariant it protects: an expired deadline, an invalid buyer or seller signature, a zero payment, a process that already exists or is unknown, a cumulative-value mismatch, a non-buyer caller of resolution, a denomination mismatch, an order that is not committed, an empty active-order list, an incomplete order list, a duplicate commitment, a detected transfer fee, an invalid root cumulative value, and a sub-order against an already-resolved process. The revert names function as a partial executable specification: every named revert reachable through the public surface is exercised by a revert-branch test in the regression suite of Section 5.4, which is written against this list. One name is a defensive backstop rather than a reachable branch. The duplicate-commitment guard cannot be reached by replaying an identical commitment, because an earlier check preempts it on every path: a repeated root commitment is refused for a process that already exists, and a repeated sub-order is refused on the cumulative-value check, the accumulator having strictly moved since the first admission. The suite pins the preempting error on each of those paths, which makes the ordering of the guards a tested property in its own right rather than an unexamined consequence of how the checks happen to be sequenced. A single overflow guard at resolution time is raised as a bare string rather than a declared named revert.
                    </p>
                </PaperSubsection>
            </PaperSection>

            <PaperSection title="4. Formal Verification Methodology">
                <p>We use four verification techniques, each chosen for what it covers that the others do not: exhaustive model checking of a state-machine specification, property-based fuzzing of the compiled bytecode, symbolic execution over the entry points, and specification checking of declarative rules against the bytecode. Each is stated below by what it establishes and by the limit past which it establishes nothing; the case for the stack is that those limits do not coincide.</p>
                <PaperRun title="Exhaustive model checking of a state-machine specification.">
                    The kernel is captured as a single transition system whose invariants are propositional safety properties, and an explicit-state checker enumerates the reachable states under bounded parameters (Clarke, Grumberg, &amp; Peled, 1999), returning either an invariant violation with a minimal trace or exhaustive coverage of the bounded space. Strength: high-level state-machine reasoning; abstracts cryptography and token mechanics to expose accounting errors. Weakness: bounded by parameters; gives no guarantee for unbounded state.
                </PaperRun>
                <PaperRun title="Property-based fuzzing of the compiled bytecode.">
                    Randomized call sequences are run against the compiled bytecode, with EIP-712 signing performed in the test harness. Strength: exercises real bytecode against concrete adversaries, including combinations of operations the model abstracts. Weakness: random sampling; finds bugs but does not prove their absence.
                </PaperRun>
                <PaperRun title="Symbolic execution over the entry points.">
                    Call traces are encoded as satisfiability-modulo-theories formulas, and a decision procedure is asked whether any concrete input satisfies the negation of an invariant (Barrett &amp; Tinelli, 2018). Strength: when the answer is <em>unsatisfiable</em>, the property holds for <em>all</em> inputs in the modeled trace, complementing the bounded random sampling of fuzzing with symbolic coverage of the commit/resolve state machine. Weakness: symbolic complexity blows up with control-flow depth; tractable on bounded path lengths.
                </PaperRun>
                <PaperRun title="Specification checking of declarative rules against the bytecode.">
                    Rules stated in a declarative specification language are discharged against the bytecode by the same class of solver. Strength: a rule can quantify over methods, allowing universal statements like &ldquo;no method modifies <Math>{"X"}</Math>&rdquo;. Weakness: rule encoding is non-trivial.
                </PaperRun>
                <PaperRun title="Regression testing as the spine.">
                    A unit-test suite serves as the continuous-integration spine. These tests are not counted toward formal verification but provide the harness the other techniques compile against.
                </PaperRun>
                <PaperRun title="Supplementary scanning, out of loop.">
                    One further check belongs in none of the four categories above: a general-purpose vulnerability scanner, which searches the contracts for common defect classes &mdash; reentrancy, unchecked calls, arithmetic and access-control patterns &mdash; rather than for this kernel&rsquo;s named invariants. It is run by hand on individual contracts, is not wired into continuous integration, and none of the results in Section 5 depend on it. It is recorded here because a stack described as complete should not quietly omit a check that was in fact run.
                </PaperRun>
            </PaperSection>

            <PaperSection title="5. Verification Results">
                <p>What each technique contributes, wherever it applies, is fixed: model checking establishes a property exhaustively over the bounded reachable state space with no violation; fuzzing checks it after every randomized call sequence on the compiled bytecode with no counterexample produced; symbolic execution discharges it for all inputs in the modeled trace; specification checking proves it as a method-quantified rule against the bytecode. What they do <em>not</em> do is cover the same properties to the same depth, and the attributions below are stated property by property rather than summarized: each property carries the methods that actually establish it, which for some is all four and for others one. The case for running four is that their limits do not coincide &mdash; where the coverage overlaps, a defect has to be consistent with several different kinds of check at once; where it does not, the property rests on the methods listed against it and no others. The configuration parameters (invariants, model bounds, property set) are the stable artifact, while incidental run-time figures are not.</p>
                <PaperSubsection title="5.1 Properties Established">
                    <ol className="space-y-2 list-decimal pl-6 text-sm">
                        <li><strong>Token conservation</strong>: the sum of wallet balances plus the contract balance equals the total supply under all commit/resolve sequences &mdash; exhaustive within the model bounds; on bytecode under fuzzing; symbolically after commitment; and as exact per-call-site conservation rules under specification checking.</li>
                        <li><strong>Contract solvency</strong>: the contract balance is non-negative and at least the sum of outstanding bonds, so the payouts every active process would require are covered by what is held &mdash; exhaustive within the model bounds; on bytecode under fuzzing; symbolically after commitment. The property is one of funds held, not of resolution being executable: whether a given resolution call fits within a block is the separate gas condition of Section 6.1.</li>
                        <li><strong>Bond correctness</strong>: <Math>{"C_b = 2P"}</Math> and <Math>{"C_s = 2G"}</Math> &mdash; symbolically for all <Math>{"P"}</Math>; under specification checking, each commitment moves exactly the buyer&rsquo;s, the seller&rsquo;s, and the contract&rsquo;s balance by the expected delta, with no allowance over-draw.</li>
                        <li><strong>Payout correctness</strong>: <Math>{"\\pi_s = 2G + P"}</Math> and <Math>{"\\pi_b = P"}</Math> at resolution &mdash; symbolically for all <Math>{"P"}</Math>; under specification checking, each single-order resolution pays out exactly and conserves value.</li>
                        <li><strong>Order-status monotonicity</strong>: status moves only <Math>{"0 \\to 1 \\to 2"}</Math>, never backwards &mdash; fuzzing, symbolic execution, and specification checking.</li>
                        <li><strong>Cumulative-value integrity and monotonicity</strong>: per process, <Math>{"G"}</Math> equals the sum of all order payments and never decreases &mdash; all four techniques (integrity within the model bounds and under fuzzing; monotonicity symbolically across sub-order commitments and as a specification rule).</li>
                        <li><strong>Buyer dominance</strong>: any non-buyer caller of resolution reverts &mdash; fuzzing, symbolic execution, and specification checking. The bounded model builds the property into its action structure rather than testing it: its resolution action carries no caller at all and no adversarial resolution exists in it, so the model exercises buyer-dominant settlement rather than the guard that enforces it, and the property is carried by the other three.</li>
                        <li><strong>Atomic resolution</strong>: an incomplete active-order list always reverts &mdash; fuzzing alone. The model resolves processes only in full, which exercises atomicity rather than testing the guard against it, and this is the property with the thinnest coverage in the list.</li>
                        <li><strong>Commitment integrity</strong>: no double commitment is admitted; commitment increments the active-order count and the stored count matches the actual count; the root buyer and the process denomination are immutable once set &mdash; specification checking, with count correctness also within the model bounds and under fuzzing.</li>
                    </ol>
                </PaperSubsection>
                <PaperSubsection title="5.2 Model Configuration">
                    <p>
                        The kernel is modeled as a transition system of eight variables, with three actions: root commitment, sub-order commitment, and process resolution. Four of the eight have no counterpart in the kernel and are bookkeeping rather than claims about storage. A per-order record of the commitment terms, which the kernel does not keep at all (Section 2.1) and which a resolution call supplies from the signed commitments. A process-to-order membership relation, the inverse of the kernel&rsquo;s order-to-process binding, which lets the model state atomicity as a property of a set. And two sequential identifier counters, standing in for the content-addressed derivation of Section 2.3 &mdash; an abstraction, since the kernel carries no counter of any kind. What the model shares with the kernel is therefore two of the three pieces of Section 2.1 &mdash; the process record and the order status &mdash; plus the inverse of the third, and the safety invariants are stated over that shared part together with the token balances. The model abstracts signatures (assumed correct given valid commitments), token mechanics (modeled as integer balances), and timing (deadlines are orthogonal to the bonding equilibrium and are exercised by regression testing instead). Every bound in the configuration is two: two buyers, two sellers, two concurrent processes, and two sub-orders beyond each root. Wallet non-negativity is verified within the same bounds, as is a type invariant &mdash; which types six of the eight variables, the two bookkeeping structures being left to the actions that build them.
                    </p>
                </PaperSubsection>
                <PaperSubsection title="5.3 Composition Surfaces">
                    <p>
                        Two further verified surfaces sit outside the kernel&rsquo;s own state machine, both under specification checking. On the <strong>attestation surface</strong>, a non-buyer cannot attest as the buyer, and a successful buyer attestation implies the caller is the buyer; quantified over every public entry point on the coordinator, the attestation surface <em>cannot change kernel state</em> &mdash; neither order status nor process state &mdash; which is the headline guarantee for the coordinator, the quantifier ranging over the contract&rsquo;s methods rather than over a chosen sample of them. The <strong>token-operations surface</strong> is a rule family rather than a contract, and what it guarantees should be stated precisely, since two different things are easily conflated. An inventory tracks every value-transfer call site in the source, and a call site that is not tracked fails the gate rather than passing unexamined &mdash; so what the gate enforces is that no transfer can be added unnoticed. Rule coverage is a separate column of the same inventory, and it is complete on the kernel&rsquo;s own transfer sites: each carries named exact-delta and conservation rules, which is what licenses the coverage claim stated for the kernel. Tracked sites outside the kernel may carry a rule that is still pending, and two of them presently do; nothing in Section 5.1 rests on them.
                    </p>
                </PaperSubsection>
                <PaperSubsection title="5.4 Regression Spine">
                    <p>
                        The regression suite targets every named revert listed in Section 3 that is reachable through the public surface, and, for the one name that is not, pins the error that preempts it on each replay path; asserts typed-data-digest parity between the off-chain hash derivation and the on-chain implementation; and asserts that every event field encodes as readers expect. Counts of files, tests, rules, or invariants are deliberately not stated anywhere in this paper: they inventory a surface that evolves rather than describe a method that does not. The properties of Section 5.1 are enumerated because they are the claim itself, not an inventory of the harness that carries them.
                    </p>
                </PaperSubsection>
                <PaperSubsection title="5.5 Scope of the Verification Claim">
                    <p>
                        Two framing statements before the list. First on status: the results above are machine checks run by the authoring project, not an external audit. The Solidity surface was frozen for external audit in April 2026 and no external audit has been performed on it; completion of one is a named release blocker, and nothing in this paper should be read as reporting an auditor&rsquo;s opinion. Second on coverage: every property in Section 5.1 is a property of the <em>direct</em> settlement path &mdash; the kernel&rsquo;s own commit and resolve entry points and the state they maintain &mdash; together with the two composition surfaces of Section 5.3. The system as built carries a second settlement path as well, treated separately below.
                    </p>
                    <p>What this verification establishes: the frozen Solidity source has been checked by four methodologically distinct approaches, and each finds the source satisfies the properties named against it in Section 5.1, within the bounds it explores. What it does <em>not</em> establish:</p>
                    <ul className="space-y-2 list-disc pl-6 text-sm">
                        <li><strong>That the specification is the right specification.</strong> Verification checks code against a spec; it does not check whether the spec captures what the author meant or what users expect.</li>
                        <li><strong>That bytecode at a deployed address was compiled from this commit.</strong> The production deployment is a separate act, using a compiler under settings this paper does not pin. Relying parties should confirm the source-to-bytecode-to-address chain independently.</li>
                        <li><strong>That the denomination token behaves.</strong> The kernel takes an arbitrary fungible token. If the chosen token&rsquo;s issuer exercises blocklist, freeze, upgrade, or pause authority over a party&rsquo;s bonded balance, the &ldquo;no escape hatch&rdquo; property is vacuously violated &mdash; the bond is still locked from the kernel&rsquo;s perspective but unreachable from the world&rsquo;s. The choice of denomination token is a selection of whose escape hatches to accept, not an avoidance of escape hatches in aggregate.</li>
                        <li><strong>That chain liveness and key custody persist.</strong> If the host chain halts, censors, or reorgs past finality, and if either party loses or has compromised their signing key, the kernel has no recovery mechanism. These are operational-security dependencies above the verified surface.</li>
                    </ul>
                    <p>A practitioner or legal reader should treat these claims as input to due diligence, not as a substitute for it.</p>
                    <PaperRun title="Reproducibility.">
                        Pinned tool versions are meaningful to a reader only once there is a published artifact to pin them against, so what follows is what is true now. The suites reported above were last re-run in full against the frozen source: the declared rules, carried across independent specifications, were all discharged; the symbolic-execution properties were all proved, on every harness that carries them; and each model-checking model &mdash; the kernel model, a token model, a swap-funded-composer model, and the composed-settlement model of the two paths &mdash; exhausted its own bounded state space without a violation, exhaustive within the bounds stated in Section 5.2 for the kernel model and within each other model&rsquo;s own configuration for the rest, and nowhere beyond them. The specifications, the models, and the harness configurations are published alongside the implementation, carrying their own invariant lists and bounds, so a reader with the same class of tooling re-runs them rather than takes any of this on trust. What is not yet published is a commit-anchored artifact bundle &mdash; the source snapshot, the tool versions, and the run outputs fixed together at one commit &mdash; and producing it is a named pre-release task, gated on the same freeze as the external audit.
                    </PaperRun>
                    <PaperRun title="The second settlement path.">
                        Beside the direct path the system carries a proof-batched one: a batch verifier that admits a validity proof of off-chain execution by a guest mirror of the kernel&rsquo;s state machine, reconciles net token positions per participant and denomination, re-emits the attestations, and advances its own state root. The two paths share no settlement state, and neither calls the other or writes the other&rsquo;s. An order settled through the batch verifier never acquires a kernel order status at all, which means the kernel-state properties of Section 5.1 are silent about it &mdash; not satisfied and not violated, simply not about that path. Exactly one quantity is common to both: a usage accrual, which each path writes into the same counter of clause and assembly usage &mdash; the batch path as proved numbers &mdash; a surface that settles nothing and holds no bond. This is the honest statement of what the Section 5 claims cover, and it is why the coverage sentence above is stated at all.
                    </PaperRun>
                    <SettlementPathsFigure
                        idPrefix="verified-settlement-kernel-settlement-paths"
                        lineFont="sans"
                        directPath={{
                            heading: "Direct path",
                            subheading: "the kernel's own two calls",
                            inputs: ["a dual-signed commitment", "the buyer's resolution over the process"],
                            events: ["order committed", "order resolved", "process resolved"],
                            state: ["per-order status, advancing monotonically"],
                            stateNote: "has no notion of a batch",
                        }}
                        batchPath={{
                            heading: "Batch path",
                            subheading: "proof-verified off-chain execution",
                            inputs: [
                                "signed commitments, gathered and ordered",
                                "a validity proof of a mirror's execution",
                                "carried to the settlement call",
                            ],
                            events: ["batch settled"],
                            state: ["its own state root, verifier-local"],
                        }}
                        sectionLabels={{ inputs: "Inputs", events: "Records emitted", state: "State" }}
                        neverWrittenNote="a kernel order status — never acquired"
                        bridgeLabel="The usage counter"
                        bridgeSublabel="clause and assembly usage"
                        crossingLabel="a usage accrual"
                        crossingSublabel="the one quantity common to both"
                        figureTitle="The two settlement paths, and the one surface common to both"
                        figureDesc={
                            "Two panels. The direct path is the kernel's own two calls: a " +
                            "dual-signed commitment, and the buyer's resolution over the process; " +
                            "it records an order committed, an order resolved, and a process " +
                            "resolved, and it holds a per-order status that advances " +
                            "monotonically. It has no notion of a batch. The batch path is " +
                            "proof-verified off-chain execution: signed commitments gathered and " +
                            "ordered, a validity proof of a mirror's execution, carried to the " +
                            "settlement call; it records a batch settled and advances its own " +
                            "verifier-local state root. A kernel order status is never acquired " +
                            "on that path. The two panels share no settlement state, and neither " +
                            "calls the other or writes the other's. One arrow crosses between " +
                            "them, carrying a usage accrual — the one quantity common to both — " +
                            "into the counter of clause and assembly usage, a surface that " +
                            "settles nothing and holds no bond."
                        }
                        caption={
                            <>
                                An order settled through the batch verifier never acquires a kernel
                                order status at all. Exactly one quantity is common to the two paths
                                &mdash; a usage accrual &mdash; and the counter that receives it
                                settles nothing and holds no bond.
                            </>
                        }
                    />
                    <PaperRun title="What is checked about the composition of the two paths.">
                        The cross-path composition is not left to inspection. A machine-checked model of the composed system &mdash; the kernel, the batch verifier, the usage counter, and the off-chain guest kernel, interleaved arbitrarily &mdash; carries invariants of its own, among them that no value is paid out twice across the two paths, that the two paths&rsquo; order identities are disjoint, that token conservation and exact per-pool escrow hold on both sides at once, that the kernel&rsquo;s status gates stay blind to batch-settled orders, and that the usage score composes as the sum of the two paths&rsquo; contributions with the bridged write replacing rather than adding. What the model establishes is safety under arbitrary interleaving, given two named assumptions, and neither the model nor this paper claims more. The first assumption &mdash; that one signed commitment can never acquire the same identity in both paths &mdash; is contract-enforced rather than promised, since each path binds its own verifying-contract address into the typed-data domain from which a root identifier is derived, so the two identifier spaces are disjoint by construction. The second &mdash; that no accrual-period boundary falls between a batch being proved and its settling &mdash; is <em>not</em> enforced; when it fails, the usage accrual for the affected processes is dropped rather than double-counted, so the failure mode is a conservative under-count and the model separates which invariants rest on which assumption. Proof validity itself, signature recovery, and hash collision-resistance are abstracted by the model, as they are by the kernel model of Section 5.2.
                    </PaperRun>
                </PaperSubsection>
                <PaperSubsection title="5.6 What the Batch Path Asks a Reader to Trust">
                    <p>
                        The direct path asks for trust in the chain beneath it and in the kernel&rsquo;s own arithmetic, and in nothing else. The batch path asks for more, and the additional assumptions deserve to be named individually rather than folded into the phrase <em>validity proof</em>. There are five, and they are not of the same kind: the first two are assumptions in the strong sense that no machine check in this paper discharges them, while the other three are structural &mdash; a binding, a gate, and a role, each with limits a reader can inspect rather than has to grant.
                    </p>
                    <ol className="space-y-2 list-decimal pl-6 text-sm">
                        <li><strong>Soundness of the proof system.</strong> A batch settles because producing an accepting proof of a false statement is taken to be infeasible. That is a cryptographic hardness assumption together with the correctness of the proving system&rsquo;s own implementation, including whatever setup parameters the scheme carries. It is the one item on this list with no internal fallback: if the proof system is broken, the batch path is broken, and no other check in the pipeline would notice.</li>
                        <li><strong>Fidelity of the re-execution to the kernel&rsquo;s semantics.</strong> What the proof attests is that an off-chain mirror of the settlement state machine executed the batch correctly. What it cannot attest is that the mirror <em>is</em> the kernel. Equivalence between the guest program&rsquo;s semantics and the on-chain kernel&rsquo;s &mdash; the same bond formula, the same monotonic accumulator, the same atomicity rule, the same rejection conditions, with one designed substitution: the resolve authorization the kernel takes from the transaction sender, the mirror takes from a signature over the same typed-data discipline &mdash; is established by review and by differential exercise of both against the same commitments, not by the proof. Where the two diverge, a batch settles as the mirror would have settled, and the proof will faithfully certify the divergence. This is the assumption we consider most likely to be underestimated by a reader who reads &ldquo;proved&rdquo; as &ldquo;proved against the kernel.&rdquo;</li>
                        <li><strong>The registry-anchored content hash as the binding to published clause specifications.</strong> Clause specifications enter the proof as witness input rather than as code, which is what allows a never-before-seen clause to be batch-settled with no change to the prover. What prevents a prover from validating against a specification of its own choosing is that the settling verifier compares the hash of the specification actually used against the hash anchored by that clause&rsquo;s public, first-write-wins registration. The binding is therefore exactly as strong as the registration discipline: an anchor that is immutable once written, and a specification document a reader can fetch and hash for themselves. This is what makes &ldquo;validated against the published clause&rdquo; a checkable statement rather than the prover&rsquo;s own assertion.</li>
                        <li><strong>The on-chain verifier as the sole acceptance gate.</strong> No off-chain party admits a batch. The verifier contract checks the proof, checks the hash bindings, reconciles the net token position of each participant in each denomination, and reverts otherwise. Prover, sequencer, and operator stand in the same relation to it: each can produce a candidate batch and none can admit one. A reader who trusts the first three items does not additionally have to trust whoever ran the proving job.</li>
                        <li><strong>The sequencer as transport, not as authority.</strong> Batching needs someone to gather commitments and order them for proving. That role can withhold service &mdash; a sequencer that stalls, censors a participant, or simply fails leaves the affected commitments unsettled for as long as the failure lasts &mdash; but it cannot forge a settlement, because a batch that does not verify does not settle, and it cannot capture a participant: a commitment never batched settles directly, and for a process already inside a settled batch &mdash; where the paths do not migrate &mdash; the guarantee rests on batch settlement itself being permissionless, so anyone may prove and submit what a stalled sequencer will not. The fallback is a fresh signature rather than a re-submission: each path binds its own verifying contract into the typed-data domain, so parties falling back to the kernel&rsquo;s own entry points sign again for that path. The cost of the fallback is direct-path gas and one more signing round, which is why a sequencer failure is a liveness problem and not a safety one.</li>
                    </ol>
                    <BatchSettlementSequenceFigure idPrefix="verified-settlement-kernel-batch-sequence" />
                    <p>
                        Two consequences follow for how the Section 5 claims should be read. First, the cross-path model described above establishes safety under arbitrary interleaving <em>given</em> proof validity, which it abstracts; items 1 and 2 therefore sit outside what that model covers rather than inside it, and no machine check in this paper discharges them. Second, the trust surface is a choice rather than a condition of use. A participant who declines any of the five settles directly and pays direct-path gas for the privilege; the batch path buys amortized cost with a larger set of things to believe, and stating both sides of that trade is the point of this subsection.
                    </p>
                </PaperSubsection>
            </PaperSection>

            <PaperSection title="6. Security Analysis">
                <PaperSubsection title="6.1 Threat Model">
                    <p>We assume rational adversaries who maximize economic payoff. We consider several attack vectors.</p>
                    <PaperRun title="Withheld resolution.">
                        A buyer that has received performance and does not resolve keeps what was delivered and leaves its own <Math>{"2P"}</Math> locked. Crediting it with everything it holds, the mechanism&rsquo;s figures put it at <Math>{"-P"}</Math> where closing the process would put it at <Math>{"0"}</Math>, and the payment it withheld is frozen inside its own bond, out of reach of both parties: there is nothing at the end of the withholding to collect. That is the equilibrium result restated on the code&rsquo;s own arithmetic rather than a fresh claim, and its force is unconditional only after performance has occurred &mdash; before performance the same buyer strictly prefers to keep the process open, which is a different comparison. What the implementation contributes against a party acting outside those comparisons altogether is the record: a commitment made and not settled, emitted by construction (Section 2.5), readable by anyone, including a forum asked to rule while the process stands open.
                    </PaperRun>
                    <PaperRun title="Sybil (fake orders to manipulate state).">
                        Each order requires real bond deposits totaling <Math>{"2(G_i + P_i)"}</Math> per order. At scale, Sybil attacks are capital-intensive with no path to extracting the invested capital &mdash; no secondary market for locked bonds, no yield, no governance influence.
                    </PaperRun>
                    <PaperRun title="Front-running.">
                        Identifiers are content-addressed from the commitment itself: the process identifier is the typed-data digest of the root commitment, and an order identifier is the hash of the process identifier with the commitment&rsquo;s struct hash (Section 2.3). Neither derivation reads a signature, so an attacker gains no fresh identifier by re-signing, and obtains no identifier at all without a commitment both named parties have already signed. Submitting an observed commitment ahead of its intended sender therefore produces exactly the order the parties signed &mdash; the kernel recovers both signatures itself and pulls each bond from the party the struct names &mdash; and a second submission of the same commitment reverts on the duplicate-commitment guard. The race is available and wins nothing: what a front-runner can accomplish is paying the gas for someone else&rsquo;s order.
                    </PaperRun>
                    <PaperRun title="Cumulative-value misreporting.">
                        There is nothing to report. Commitment admits exactly one cumulative value per order &mdash; the payment itself at a root, the stored accumulator plus the new payment for any extension &mdash; checked against process state and reverting on any other declaration, higher or lower. The seller&rsquo;s bond base is determined by arithmetic rather than declared, so the case is unreachable rather than deterred.
                    </PaperRun>
                    <PaperRun title="Reentrancy.">
                        The kernel carries a reentrancy mutex on both external entry points. The guard is load-bearing because the resolution loop performs two transfers per iteration before writing the order&rsquo;s resolved status: under a token whose transfer hooks call back into the caller (a callback-bearing token standard), the callback could otherwise re-enter resolution on the same process. The mutex blocks this by reverting the nested call before any half-resolved state can be observed. The attestation surface adds one external call and no vector. It invokes no per-clause code, verifying a merkle inclusion proof of the attested clause section against the signed agreement hash and content-hashing the evidence; the single call it makes to an address it does not control is the authorization query on the third-party path, put to the order&rsquo;s own seller address, which may be an arbitrary contract. A callee that re-enters gains nothing there: the coordinator holds no funds and no storage, its only effect is an event emitted after the check has passed, and it writes no kernel state at all &mdash; the machine-checked guarantee of Section 5.3, quantified over its whole public surface &mdash; while the kernel&rsquo;s own mutex blocks any nested call into the settlement entry points regardless.
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
                        Liveness &mdash; that a buyer who has received satisfactory performance resolves in finite time &mdash; is a property of rational play rather than of code, and it is stated rather than re-derived here: after performance, resolving is strictly better for the buyer than not resolving. What the implementation adds is operational preconditions. The resolve transaction must be admissible on the host chain (no permanent censorship at its inclusion layer); the resolution loop must fit within the block-gas limit; the buyer must be able to originate a call from the root-buyer address; and the process denomination must itself be live, its transfers not reverting under blocklist or freeze. The last three are checkable in advance by the parties. Key custody is one of the operational dependencies above the verified surface named in Section 5.5, and the kernel offers no recovery for its failure &mdash; there is no timeout and no path by which any other address may resolve.
                    </p>
                </PaperSubsection>
                <PaperSubsection title="6.3 What the Verified Properties Rest On">
                    <p>
                        Every property in Section 5 is a property of state maintained by a chain, and the chain is named here rather than assumed. Consensus and finality beneath the kernel are what make the verified transitions authentic: a state the checks prove unreachable is unreachable only insofar as the history that produced the state is the history the chain agrees on. The chain-dependency limitations enumerated in Section 5.5 &mdash; halt, censorship, deep reorg, and the denomination token&rsquo;s own authority over a bonded balance &mdash; are accordingly failure modes of that ground rather than of the code above it, and no method in Section 4 is asked to reason about them. Nothing verified in this paper survives their occurrence, and stating so is not a hedge but the boundary of the claim.
                    </p>
                    <p>
                        One further boundary belongs in the same place. The record on which any later account of a process rests &mdash; every commitment, every bond deposit, every resolution and, by its absence, every non-resolution &mdash; is emitted at the bonding layer by construction: no party collects a settlement payout without the corresponding events having been emitted (Section 2.5), so the record is a byproduct of settling rather than something summoned when settlement goes wrong. Off-chain forums asked to rule while a process stands open read that record, and they cannot resolve anything: resolution is the buyer&rsquo;s call and no other party&rsquo;s. What such a record is worth evidentially, and on what terms a forum should credit it, is a question about institutions rather than about code, and this paper&rsquo;s verification does not address it.
                    </p>
                </PaperSubsection>
                <PaperSubsection title="6.4 Scope and Limitations">
                    <p>
                        <em>Non-rational failure.</em> Catastrophic non-rational failure (lost keys, hardware failure, participant death) leaves co-sellers in open positions under atomic resolution regardless of incentive alignment. The coordination pressure among sellers is a statement about payoffs and therefore about <em>choices</em>; failure is not a choice, and nothing in Section 5 speaks to it. Operational reliability under such failure depends on participant-continuity practices above the kernel and outside the verified surface.
                    </p>
                    <p>
                        <em>No clock runs from the bonded state.</em> No verified property depends on how long a bond stays locked, because the kernel measures no elapsed time after commitment: the one deadline the code reads bounds the validity of a signed offer and stops at commit, so duration enters no invariant, no revert condition, and no check in Section 5.
                    </p>
                </PaperSubsection>
            </PaperSection>

            <PaperSection title="7. Composition, and the One Guarantee That Is Machine-Checked">
                <p>
                    External mechanisms are built against the kernel, and for a verification paper the question they raise is narrow: does a composition leave the kernel&rsquo;s state machine the one Section 5 checked? The wider question &mdash; what conditions suffice for an external mechanism to leave the <em>parties&rsquo; equilibrium</em> intact &mdash; runs through payoffs rather than through storage, and is mechanism design rather than code inspection; it is not this paper&rsquo;s subject and nothing below should be read as settling it. What is this paper&rsquo;s subject is the half that a machine can check, and there is one guarantee of that kind to report.
                </p>
                <p>
                    Begin with what the kernel itself decides. Its two entry points admit composition asymmetrically, and the asymmetry is the kernel&rsquo;s own rather than a discipline asked of composers. <em>Commitment</em> admits a relay: the call carries both parties&rsquo; signatures, which the kernel recovers itself before pulling each bond from the party the struct names, so a composer supplies transport while the kernel remains the writer &mdash; and the bond-correctness rules of Section 5.1 bear on exactly this, each commitment moving the named buyer&rsquo;s, the named seller&rsquo;s, and the contract&rsquo;s balance by the expected amount and no other. <em>Resolution</em> admits no relay at all: it takes no signature, authorizes on the calling address, and therefore cannot be performed on a buyer&rsquo;s behalf by anyone holding any artifact whatever &mdash; which is Section 5.1&rsquo;s buyer-dominance property, discharged by three of the four methods. Nor can a composer hold a party role: the kernel admits only an address whose own key produced the signature, so a contract that authenticates by returning a validity answer for a third party&rsquo;s signature never recovers as a party.
                </p>
                <p>
                    Against that background, the composition that reads kernel state without invoking either entry point is the clause-typed attestation coordinator. It recomputes an order identifier from a caller-supplied commitment to confirm the order exists, checks the caller against the role that commitment names, verifies a merkle inclusion proof of the attested clause section against the signed agreement hash, and emits an event; it holds no storage and no funds. Its guarantee is stated as a rule quantified over every public entry point it exposes: <em>no method of the coordinator changes kernel state</em> &mdash; neither an order&rsquo;s status nor a process record (Section 5.3). That is the no-kernel-write condition any composition discipline has to assume of a coordinator, and here it is discharged by a machine check over the whole surface rather than by a reader&rsquo;s inspection of the paths that happened to occur to them. The merkle check is worth naming beside it: content typed by a clause identifier is admitted only against an order whose signed agreement carried that clause, so a runtime declaration cannot contradict the contract the parties signed.
                </p>
                <p>
                    Two further compositions are named for completeness, and neither is among the verified surfaces of Section 5.3. A swap-funded commitment coordinator lets a party post its bond from a token other than the process denomination: it pulls the party&rsquo;s input token under a signature that binds the swap route itself &mdash; venue, input token, input ceiling, and a hash of the exact swap calldata &mdash; forwards the entire proceeds to the party&rsquo;s own account, and only then submits the commitment the two parties had already signed. It is the relay case above made concrete, with bond amounts derived from the signed commitment rather than supplied, so no funding leg can under-fund the kernel&rsquo;s own pull; it carries a bounded model of its own among those re-run in Section 5.5, and the construction is specific to direct settlement, a proof-batched commitment carrying no funding leg in its wire format. The clause and participant registries compose more simply still: they are read by participants and never invoke the kernel&rsquo;s entry points at all.
                </p>
                <PaperRun title="What the machine check does and does not extend to.">
                    The rule quantifies over one coordinator&rsquo;s public surface as it stands. It says nothing about a composition not yet written, and nothing about whether any composition preserves the parties&rsquo; equilibrium &mdash; a claim of a different kind, resting on payoffs the code does not contain. If a composition writes kernel state on its own account, or opens a second route to a payoff indexed on how a process resolves, the verification reported in this paper does not extend to what follows from it. The kernel claims that it is correct; it does not claim that everything built against it is, nor that the chain from kernel correctness to a user&rsquo;s remedy is closed.
                </PaperRun>
            </PaperSection>

            <PaperSection title="8. Conclusion">
                <p>
                    We have presented a verified implementation of the two-mechanism bonded commitment settlement primitive: an ownerless, fee-less kernel of two entry points and a minimal state footprint, checked by four methodologically distinct approaches whose limits do not coincide. <em>Verified</em> carries here exactly the weight Section 5.5 gave it and no more: the four methods were run by the authoring project on its own kernel, no external audit of that work has been performed, and every property established is a property of the direct settlement path, the proof-batched path being covered by a separate model under assumptions named one at a time. The one composition guarantee contributed is of the same kind as the rest &mdash; a method-quantified rule, checked over a coordinator&rsquo;s entire public surface, that it writes no kernel state.
                </p>
                <PaperRun title="Defense in depth, stated at its actual coverage.">
                    The value of running four methods is that a defect must survive every method that covers the property it lives in, and those methods differ in kind &mdash; bounded-exhaustive state enumeration, property-level random sampling against compiled bytecode, symbolic discharge over all inputs in a modeled trace, and method-quantified specification rules. That is a claim about overlap, and the overlap is uneven, which is why Section 5.1 attributes methods property by property and why a reader should take those attributions rather than a headline: cumulative-value integrity and monotonicity carry all four, while atomicity carries fuzzing alone, the model exercising it rather than testing the guard against it. Nor do we attempt a formal probability bound on residual error: the symbolic and specification approaches lean on a common class of solver, which breaks the independence assumption any probabilistic bound would require, and the prior distribution over kernel-invariant violations in this toolchain ecosystem is not characterized in the literature. The honest statement is that methodologically distinct checks agreeing on a property give substantially stronger assurance than any one of them alone, that the assurance therefore differs from property to property, and that the stack reduces risk without retiring it.
                </PaperRun>
            </PaperSection>
        </PaperLayout>
    );
}
