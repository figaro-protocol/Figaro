import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import {
    PaperLayout,
    PaperSection,
    PaperSubsection,
    PaperRun,
    PaperScroll,
} from "@/components/papers/PaperLayout";
import { Math } from "@/components/papers/Math";
import { BatchResolutionSequenceFigure } from "@/components/figures/BatchResolutionSequenceFigure";
import { ResolutionPathsFigure } from "@/components/figures/ResolutionPathsFigure";

export const metadata: Metadata = withOg({
    title: "A Verified Resolution Contract — Figaro Protocol",
    description:
        "What it means to verify a contract of this shape — two calls, no upgrade path, no timeout: the classes of check that bear on it, what each one reaches and cannot reach, the properties established, the threat model, and the boundary between the direct resolution path and the proof-batched one.",
});

export default function VerifiedResolutionKernelPaper() {
    return (
        <PaperLayout slug="verified-resolution-kernel"
            title="A Verified Resolution Contract"
            subtitle="Formal Verification, Threat Model, and the Scope of the Claim"
            author="Figaro"
            date="April 2026"
            watermark="Figaro Protocol · Preprint"
            abstract={
                <>
                    <p>
                        We verify a smart contract with two calls. <em>Commit</em> locks a bond from each party to an order: the buyer twice the payment, the seller twice the value the process has accumulated through its order. <em>Resolve</em> is the buyer&rsquo;s alone, and it closes every order in the process at once or none. The contract is decentralized and permissionless: no upgrade path, no timeout, and nothing taken from what it distributes. The question is how far a machine check of such a contract reaches.
                    </p>
                    <p>
                        Four classes of check bear on the code: exhaustive model checking of a bounded state machine, property-based fuzzing of the compiled bytecode, symbolic execution over bounded call traces, and specification checking of method-quantified rules. A fifth class checks the equilibrium algebra rather than the code. It is a proof-assistant development that imports no mathematical library and holds at any chain length, over the payoff table the model-checked invariants pin to the contract. The properties established are token conservation, contract solvency, the bond and payout amounts, monotonic cumulative value, buyer-only atomic resolution, and a no-write guarantee for the attestation contract beside it.
                    </p>
                    <p>
                        Coverage is credited property by property, because the methods&rsquo; limits differ: some properties carry all four, one carries fuzzing alone. Every property belongs to the <em>direct</em> resolution path; the proof-batched path has a model of its own and five assumptions, named one at a time. The threat model runs the adversarial cases against the code and says where the answer is structural, a state the machine cannot reach, rather than economic.
                    </p>
                </>
            }
            references={
                <>
                    <li>Barrett, Clark, and Cesare Tinelli. 2018. &ldquo;Satisfiability Modulo Theories.&rdquo; In <em>Handbook of Model Checking</em>, edited by Edmund M. Clarke, Thomas A. Henzinger, Helmut Veith, and Roderick Bloem, 305&ndash;343. Cham: Springer. https://doi.org/10.1007/978-3-319-10575-8_11.</li>
                    <li>Bloemen, Remco, Leonid Logvinov, and Jacob Evans. 2017. &ldquo;EIP-712: Typed Structured Data Hashing and Signing.&rdquo; Ethereum Improvement Proposals, no. 712. https://eips.ethereum.org/EIPS/eip-712. Accessed October 19, 2026.</li>
                    <li>Clarke, Edmund M., Orna Grumberg, and Doron A. Peled. 1999. <em>Model Checking</em>. Cambridge, MA: MIT Press.</li>
                    <li>Figaro. 2026. &ldquo;Asymmetric Bonding and Buyer Dominance: Two Composing Mechanisms for Self-Enforcing N-Party Coordination.&rdquo; Preprint. https://figaroprotocol.com/papers/asymmetric-bonding/. Accessed October 19, 2026.</li>
                    <li>Figaro. n.d. &ldquo;Security.&rdquo; Figaro Protocol. https://figaroprotocol.com/security. Accessed October 19, 2026.</li>
                </>
            }
        >
            <PaperSection title="1. Introduction">
                <p>
                    At a root order (the order that opens a process) with payment <Math>{"P"}</Math>, two strangers lock <Math>{"4P"}</Math> in a smart contract before anything is delivered. The buyer locks <Math>{"2P"}</Math>; the seller locks <Math>{"2G"}</Math>, where <Math>{"G"}</Math> is the order&rsquo;s cumulative value. An <em>order</em> is one buyer&ndash;seller commitment, and a <em>process</em> is the chain of orders one buyer opens and resolves together. The <em>cumulative value</em> <Math>{"G \\geq P"}</Math> is every payment the process has accumulated through the order, its own included, so at the root <Math>{"G = P"}</Math>. When the buyer resolves, each seller receives <Math>{"2G_i + P_i"}</Math> and the buyer <Math>{"P"}</Math> per order, which exhausts what was locked.
                </p>
                <p>
                    Two mechanisms carry the design, one per call. <em>Asymmetric bonding</em> governs commit: the bond base is fixed by arithmetic on a signed accumulator, never reported by a party. <em>Buyer dominance with atomic resolution</em> governs resolve: only the root buyer (the buyer of the root order) may extend or resolve a process, and resolution closes every active order or none, terminally. The doubling answers retention. Value passes off-chain, so a seller that walks away keeps what is in its hands, and a bond equal to that value would be exactly canceled by the taking.
                </p>
                <p>
                    The equilibrium the two calls produce rests on one anchor and one fixed point. The anchor needs no assumption about the seller: after performance, resolving puts the buyer at <Math>{"0"}</Math>, its bond refunded less the payment, while never resolving leaves the whole bond locked and puts it at <Math>{"-P"}</Math>. Given the anchor, the buyer&rsquo;s plan to resolve once performance has occurred and not before, and its co-sellers&rsquo; performance, each seller strictly prefers performing, <Math>{"+P"}</Math>, to never performing, at most <Math>{"-G"}</Math>. Given the sellers&rsquo; performance, the buyer before performance keeps the process open rather than resolving at once, which is terminal at <Math>{"-P"}</Math>. Those last two comparisons are the two parties&rsquo; best-response checks against one profile, verified jointly: a fixed point, which is what an equilibrium is, so cooperation is an equilibrium and never a dominant strategy. Because no seller is paid until the buyer resolves the whole process, each seller also holds an interest in every other seller&rsquo;s performance: a weakest-link structure among co-sellers. The equilibrium is proved, for any number of orders the network resolves in one call, in Figaro (2026).
                </p>
                <p>
                    The buyer&rsquo;s resolution is the acceptance test, and the contract holds no test of performance of its own. A disagreement about what arrived is worked out between the parties while the process stands open: a remedy is negotiated, and the buyer resolves once satisfied. An outside forum may rule on the open process&rsquo;s data, but it cannot resolve anything, because resolution is the buyer&rsquo;s call alone. None of this is a claim about code, and the rest of the paper keeps that line.
                </p>
                <PaperRun title="Verification checks the preconditions of the equilibrium, not the equilibrium.">
                    The equilibrium is a property of rational play over a payoff structure. The code must enforce that structure on every reachable path: the bond formula <Math>{"C_b = 2P"}</Math>, <Math>{"C_s = 2G"}</Math> over a monotonic accumulator, buyer-only atomic resolution, and conservation of value. The four methods applied to the code check exactly those preconditions. Section 5.2 states where the four methods meet the proof of the algebra. A claim that some outside contract &ldquo;preserves the bonding equilibrium&rdquo; therefore invokes rational play, not the machine checks reported here.
                </PaperRun>
            </PaperSection>

            <PaperSection title="2. The Contract Under Verification">
                <p>
                    The contract under verification is one of four that form the protocol&rsquo;s <em>Core</em>. It holds each bond on the direct path and runs commit and resolve. The second defines the commitment each party signs and how it is hashed. The third, the attestation contract, binds what a party states about an open order to the agreement it signed. The fourth, the batch verifier, accepts a validity proof of many processes, nets what each party locked and was paid across them, and moves only the difference in one transaction. This paper verifies the first in full, checks one guarantee of the third (Section 5.3), and treats the fourth as a separate path (Sections 5.5 and 5.6).
                </p>
                <p>
                    The contract takes typed structured data signed by both parties, and holds a mutex against reentrancy across both entry points. Its only state-changing calls are <em>commit</em> and <em>resolve</em>; the rest of its surface is read-only views of its state and its signing domain. Its constructor takes no parameter, and its code is fixed at deployment. Everything the methods of Section 4 are asked about is a property of that surface.
                </p>
                <PaperSubsection title="2.1 The State It Keeps">
                    <p>The contract keeps three pieces of state:</p>
                    <ul className="space-y-1 list-disc pl-6 text-sm">
                        <li>A <strong>process state</strong>, keyed by process identifier: the root buyer, the process denomination, the cumulative value accumulated so far, and the active-order count.</li>
                        <li>An <strong>order status</strong>, keyed by order identifier, taking values in <Math>{"\\{0:\\text{unknown},\\ 1:\\text{committed},\\ 2:\\text{resolved}\\}"}</Math>. Status never decreases; this is one of the verified invariants.</li>
                        <li>An <strong>order-to-process binding</strong>, recording which process each order belongs to.</li>
                    </ul>
                    <p>
                        The contract stores no per-order terms. Payment, cumulative value, parties, and denomination are reconstructed off-chain from the signed commitment and the event it emits. Bond amounts are functions of those values, never separate variables. The commitment also carries the <em>agreement</em>&rsquo;s merkle root: the agreement is the clauses composed for one order, and a <em>clause</em> is one reusable term. The chain holds that fingerprint and never the terms themselves.
                    </p>
                </PaperSubsection>
                <PaperSubsection title="2.2 Commitment Protocol">
                    <p>
                        Both parties sign an EIP-712 typed commitment off-chain (Bloemen, Logvinov, and Evans 2017). One commit call verifies both signatures against the typed-data digest and pulls both bonds atomically. A root commitment creates a process. A sub-order commitment extends it by carrying the process identifier and the next expected cumulative value. The chain of orders is linear: resolution state holds no parent&ndash;child structure. Because both signatures arrive in one call, there is no accept step for a third party to front-run.
                    </p>
                    <PaperRun title="Parties sign with their own keys.">
                        The commit call recovers a signer from each signature by ECDSA public-key recovery, and reverts unless each equals the party the commitment names. A party is therefore an address whose own private key produced its signature. A contract wallet that authenticates by answering a validity query cannot hold a party role, because no signature recovers to its address. A DAO, a multisig, or any other contract authorizes a key-holding signer upstream, and the contract sees only that signer.
                    </PaperRun>
                </PaperSubsection>
                <PaperSubsection title="2.3 Identifier Derivation">
                    <p>Process and order identifiers are content-addressed:</p>
                    <PaperScroll className="my-3">
                        <Math display>{"\\begin{aligned} \\text{processId} &= H_{\\text{EIP-712}}(\\text{root commitment}) \\\\ \\text{orderId} &= H(\\text{processId} \\,\\|\\, \\text{structHash}) \\end{aligned}"}</Math>
                    </PaperScroll>
                    <p>
                        Here <Math>{"H_{\\text{EIP-712}}"}</Math> is the EIP-712 typed-data digest, which binds the data to a domain separator, and <Math>{"H"}</Math> is the chain&rsquo;s collision-resistant hash. The domain separator binds the root identifier to the chain id and the verifying contract, so a commitment cannot be replayed across deployments. No counter exists; two identifiers collide only if the hash collides.
                    </p>
                </PaperSubsection>
                <PaperSubsection title="2.4 Fee-on-Transfer Protection">
                    <p>
                        Every bond pull reads the contract&rsquo;s balance, performs the transfer, and reverts unless the balance rose by exactly the requested amount. A token that taxes the transfer into the contract therefore cannot be bonded at all, and conservation cannot be broken through that tax. The check binds at the moment of the pull: a token whose balances later rebase downward lies outside it, and Section 5.5 names that case.
                    </p>
                </PaperSubsection>
                <PaperSubsection title="2.5 Events">
                    <p>Five event types are emitted:</p>
                    <ul className="space-y-2 list-disc pl-6 text-sm">
                        <li>A <strong>commitment event</strong> carries the whole commitment: order and process identifiers, buyer, seller, denomination, payment, cumulative value, checkout hash, salt, and deadline. The salt and deadline let a reader derive the typed-data digest from the logs alone.</li>
                        <li>Two <strong>companion events</strong> index the seller and the denomination, because the host chain caps indexed event arguments at three.</li>
                        <li>An <strong>order-resolution event</strong> fires once per order at resolution.</li>
                        <li>A <strong>process-resolution event</strong> fires once per process at resolution, with the order count.</li>
                    </ul>
                    <p>A reader who replays these events into a state machine rebuilds the contract&rsquo;s three pieces of state exactly, with no indexing service. The commitment event carries every term that state is computed from, and the two resolution events mark each order&rsquo;s and each process&rsquo;s last transition. What an observer holds is that state, not a report of it.</p>
                </PaperSubsection>
            </PaperSection>

            <PaperSection title="3. Each Omission Protects a Property of the Mechanism">
                <p>Six features are absent by design. Each absence protects asymmetric bonding, buyer dominance, atomic resolution, or the security constraint that no path leads out of a bonded order except resolution.</p>
                <ol className="space-y-2 list-decimal pl-6 text-sm">
                    <li><strong>No upgrade.</strong> There is no pause or upgrade authority; the contract is decentralized and permissionless from deployment. Either authority would hand the refund of bonded tokens to a party that locked nothing in the process. The equilibrium derived for the two-call game does not carry over to a game with that third player.</li>
                    <li><strong>Nothing taken by the protocol.</strong> Resolution distributes exactly what was locked. The payoffs the equilibrium is computed over are therefore the payoffs the code produces, with no deduction the analysis would have to carry.</li>
                    <li><strong>No timeout.</strong> An active order stays active indefinitely. A timeout would give holding out a second continuation: keep what is in hand and wait for the bond&rsquo;s refund. The seller&rsquo;s comparison would then no longer be the one that makes performance strictly better.</li>
                    <li><strong>No partial resolution.</strong> Resolution requires the full active-order list and reverts otherwise. The weakest-link structure among co-sellers depends on this, because no single order can be resolved alone.</li>
                    <li><strong>No internal ledger.</strong> Payouts are direct transfers, never balances to be withdrawn later. This removes the withdrawal pattern&rsquo;s reentrancy surface and its class of accounting drift.</li>
                    <li><strong>No restriction on buyer&ndash;seller equality.</strong> The contract permits a buyer address <Math>{"B"}</Math> equal to the seller address <Math>{"S"}</Math>. An address that signs both sides locks both bonds and receives both payouts, so the arithmetic cancels and no third party is exposed. The analysis treats <Math>{"B \\neq S"}</Math> as the standard case; a guard against the degenerate one would be cosmetic.</li>
                </ol>
                <PaperSubsection title="3.1 Named Reverts as Specification">
                    <p>
                        The contract defines a closed set of named revert conditions, each named for the invariant it protects. They are an expired deadline, an invalid buyer or seller signature, a zero payment, a process that already exists or is unknown, a cumulative-value mismatch, a non-buyer at commit of a sub-order or at resolution, a denomination mismatch, an order that is not committed, an empty active-order list, an incomplete order list, a duplicate commitment, a detected transfer tax, an invalid root cumulative value, and a sub-order against a resolved process. One unnamed overflow backstop sits beside them (Section 6.1). The names work as a partial executable specification: every one reachable through the public surface has a revert-branch test in the regression suite of Section 5.4.
                    </p>
                    <p>
                        One name is a backstop rather than a reachable branch. Replaying an identical commitment never reaches the duplicate-commitment guard, because an earlier check refuses it first. A repeated root is refused as a process that already exists. A repeated sub-order is refused on the cumulative-value check, since the accumulator has moved since the first admission. The suite pins the preempting error on each path, so the order of the guards is itself a tested property.
                    </p>
                </PaperSubsection>
            </PaperSection>

            <PaperSection title="4. Each Class of Check Has a Limit, and the Limits Differ">
                <p>Four classes of check bear on the code, and a fifth bears on the algebra. Each is stated by what it establishes and by the limit past which it establishes nothing. The case for the stack is that those limits do not coincide. We state the class, never the instrument: any tool of a class carries the same claim. Which tools ran, at which versions, against which source moves over time, so it is kept on the protocol&rsquo;s security page (Figaro n.d.).</p>
                <PaperRun title="Exhaustive model checking of a bounded state machine.">
                    The contract is written as one transition system whose invariants are safety properties, and an explicit-state checker enumerates every reachable state of a finite configuration (Clarke, Grumberg, and Peled 1999). It returns either a violation with a minimal trace or exhaustive coverage. The configuration is sized to contain every action and every way the actions interfere, not to sample a size parameter. Strength: it abstracts cryptography and token mechanics, exposing accounting errors over every interleaving. Limit: it says nothing about configurations it did not enumerate.
                </PaperRun>
                <PaperRun title="Property-based fuzzing of the compiled bytecode.">
                    Randomized call sequences run against the compiled bytecode, with EIP-712 signing done in the harness. Strength: it exercises real bytecode against concrete adversaries, including operation sequences the model abstracts. Limit: it samples, so it finds defects but never proves their absence.
                </PaperRun>
                <PaperRun title="Symbolic execution over bounded call traces.">
                    Call traces are encoded as satisfiability-modulo-theories formulas (logical formulas over arithmetic and bit-vectors), and a decision procedure is asked whether any input satisfies an invariant&rsquo;s negation (Barrett and Tinelli 2018). Strength: an <em>unsatisfiable</em> answer means the property holds for every input on the modeled trace. Limit: the cost grows with control-flow depth, so traces are bounded, and the harnesses also bound the arithmetic: a ceiling on the payment and a starting balance that covers its bonds. &ldquo;Every input&rdquo; means every input those bounds admit; Section 5.1 names the properties carried at a root order alone.
                </PaperRun>
                <PaperRun title="Specification checking of method-quantified rules.">
                    Rules in a declarative specification language are discharged against the bytecode by the same class of solver. Strength: a rule can quantify over methods, so it states &ldquo;no method modifies <Math>{"X"}</Math>&rdquo; as one claim. Limit: a rule proves what it says, and encoding the intended property is itself error-prone.
                </PaperRun>
                <PaperRun title="A proof of the algebra, apart from the code.">
                    The fifth class checks a mathematical argument: the equilibrium&rsquo;s inequalities, stated in a proof assistant and proved over the payoff table the other four pin to the code. Strength: it quantifies over chains of any length, which no enumeration can, and leaves no step to a reader&rsquo;s assent. Limit: it is silent on whether any deployed machine produces that table (Section 5.2).
                </PaperRun>
                <PaperRun title="Regression testing as the spine.">
                    A unit-test suite is the harness the other classes are built on. It is not a verification method, and no property of Section 5.1 is credited to it. It carries the revert-branch coverage of Section 5.4.
                </PaperRun>
            </PaperSection>

            <PaperSection title="5. Verification Results">
                <p>Each method contributes a fixed kind of evidence wherever it applies. Model checking finds no violation over the bounded reachable state space. Fuzzing finds no counterexample after any randomized call sequence. Symbolic execution discharges the property for every input its harness admits. Specification checking proves it as a rule against the bytecode. The methods do not cover the same properties to the same depth, so each property below carries the methods that establish it and no others. Where coverage overlaps, a defect must slip past several kinds of check at once.</p>
                <p>Would a referee want a probability bound on residual error? We give none, because no honest one exists. Symbolic execution and specification checking lean on the same class of solver, which breaks the independence any such bound would need. The prior distribution of invariant violations in contracts of this kind is not characterized in the literature either. What a reader re-runs against is the invariants, the model bounds, and the property set, and those are what the claim rests on.</p>
                <PaperSubsection title="5.1 Properties Established">
                    <ol className="space-y-2 list-decimal pl-6 text-sm">
                        <li><strong>Token conservation</strong>: wallet balances plus the contract balance equal the total supply under every commit and resolve sequence. Exhaustive within the model bounds; on bytecode under fuzzing; symbolically after commitment; and as exact conservation rules at each transfer site under specification checking.</li>
                        <li><strong>Contract solvency</strong>: the contract balance is at least the sum of outstanding bonds, so every active process&rsquo;s payouts are covered. Exhaustive within the model bounds; under fuzzing; symbolically after commitment. This is a property of funding; whether a resolution call fits within a block is the gas condition of Section 6.1.</li>
                        <li><strong>Bond correctness</strong>: <Math>{"C_b = 2P"}</Math> and <Math>{"C_s = 2G"}</Math>. Symbolically at a root order, where the two figures coincide, over every payment the harness admits. Generally under specification checking: each commitment moves the buyer&rsquo;s, the seller&rsquo;s, and the contract&rsquo;s balance by exactly the expected amount, with no over-draw of allowance. On the code, the sub-order case, where <Math>{"G > P"}</Math>, rests on specification checking alone; the bounded model checks it by model checking.</li>
                        <li><strong>Payout correctness</strong>: <Math>{"\\pi_s = 2G + P"}</Math> and <Math>{"\\pi_b = P"}</Math> at resolution. Symbolically at a root order, over every payment the harness admits. Under specification checking, generally: each single-order resolution pays out exactly and conserves value.</li>
                        <li><strong>Order-status monotonicity</strong>: status moves only <Math>{"0 \\to 1 \\to 2"}</Math>. Fuzzing, symbolic execution, and specification checking.</li>
                        <li><strong>Cumulative-value integrity and monotonicity</strong>: per process, <Math>{"G"}</Math> equals the sum of the order payments and never decreases. Integrity within the model bounds and under fuzzing; monotonicity symbolically across sub-order commitments and as a specification rule.</li>
                        <li><strong>Buyer dominance</strong>: any caller of resolution other than the root buyer reverts. Fuzzing, symbolic execution, and specification checking. The model&rsquo;s resolution action carries no caller, so it exercises buyer-only resolution without testing the guard.</li>
                        <li><strong>Atomic resolution</strong>: an incomplete active-order list always reverts. Fuzzing alone, the thinnest coverage in the list; the model resolves only whole processes, which exercises atomicity without testing the guard. Why trust a property this lightly checked? Its guard is short: the supplied list must match the stored active-order count in length, and every listed order must be committed in this process. A repeated entry fails, because its first appearance has already marked it resolved.</li>
                        <li><strong>Commitment integrity</strong>: the root buyer and the process denomination never change once set, and an order&rsquo;s process membership is written once and never moves. Specification checking. The stored active-order count equals the actual count of committed orders, within the model bounds and under fuzzing; under specification checking, no method lowers the count except to zero.</li>
                    </ol>
                </PaperSubsection>
                <PaperSubsection title="5.2 Model Configuration">
                    <p>
                        The model is a transition system of eight variables and three actions: root commitment, sub-order commitment, and process resolution. Two variables are the contract&rsquo;s own state, the process state and the order status. A third is the order-to-process binding read the other way, as a membership relation, which lets atomicity be stated over a set. Two are token balances, which the contract does not hold. The last three are bookkeeping: per-order commitment terms, which a resolution call supplies, and two identifier counters standing in for content addressing. The counters are an abstraction; the contract has none.
                    </p>
                    <p>
                        The model abstracts signatures, assumed valid on valid commitments, and token mechanics, modeled as integer balances. It also abstracts timing: deadlines bound only a signed offer and are exercised by regression tests. Every bound on parties and process shape is two: two buyers, two sellers, two concurrent processes, two sub-orders beyond each root. The payment domain and starting balance are small, and the model admits a commitment only when both parties can fund their bonds. Wallet non-negativity holds within the same bounds, as does a type invariant over six of the eight variables.
                    </p>
                    <PaperRun title="A bound of two covers every operation, not every size.">
                        Does a bound of two say anything about a process of fifty orders? It says this much. The configuration contains every action and every way they interfere: two processes open at once, a process extended twice before it resolves, distinct parties on each side of an order. The enumeration therefore covers the transition classes of commit and resolve under every interleaving. It does not enumerate larger configurations, and no small-model theorem is claimed. The transition relation is written uniformly in the parameters, which is the ordinary argument that the same classes recur at size. What is established is that these operations keep the invariants under every interleaving the configuration admits, and no more.
                    </PaperRun>
                    <PaperRun title="Two invariants pin the payoff table.">
                        Conservation and solvency do not pin payoffs. A contract that paid a seller three times the accumulated value could satisfy both and would break every step of the equilibrium. Two further invariants do the pinning. While an order is committed, the buyer&rsquo;s locked position is twice the payment and the seller&rsquo;s twice the value accumulated at its link. At resolution exactly the payment moves from buyer to seller, and both bonds are refunded whole. Accumulator monotonicity is not among the model&rsquo;s invariants; symbolic execution and a specification rule carry it (Section 5.1).
                    </PaperRun>
                    <PaperRun title="The proof-assistant layer proves the equilibrium over that table.">
                        The development imports no mathematical library. It trusts the assistant&rsquo;s proof checker, its arithmetic decision procedure, and the assistant&rsquo;s standard axioms, and it reruns from a pinned toolchain. Every order carries two hypotheses: its payment is at least one unit, since the contract refuses a zero payment, and its accumulated value is at least its payment. Four results are proved over those numbers. First, after performance resolving strictly beats withholding for the buyer, with no hypothesis about the seller. Second, given the buyer&rsquo;s plan, performance is the seller&rsquo;s strict best response at every retention up to the whole value accumulated at its link. Third, the margin between performing and holding out at maximal retention is <Math>{"P_i + G_i"}</Math>, never less than <Math>{"2P_i"}</Math>. Fourth, at every position of a chain of any length no unilateral deviation profits, with the inclusive accumulator derived from the chain&rsquo;s payments.
                    </PaperRun>
                    <p>
                        The conditionality is proved as well. Where the process will not close, a seller&rsquo;s holding out beats performing whenever it retains anything, so cooperation is a best response <em>given</em> the buyer&rsquo;s plan and the others&rsquo; performance. No obligation is left unproved. Every result except the margin result rests only on propositional extensionality and the soundness of quotients; the margin result also depends on the axiom of choice. Any chain length costs no library, because the chain results apply the two-party inequalities once per position, on that position&rsquo;s own numbers. The one induction in the development is the prefix-sum lemma showing that a position&rsquo;s payment never exceeds its accumulated value.
                    </p>
                    <PaperRun title="The primitive has no N.">
                        Is the arbitrary-length result a generalization the bounded model cannot support? It is a reduction. The comparison at any position belongs to that position alone. The seller weighs <Math>{"+P_i"}</Math> against <Math>{"-2G_i + r_i"}</Math>, where <Math>{"r_i \\leq G_i"}</Math> is what it can retain. After performance the buyer weighs <Math>{"-P_i"}</Math> against <Math>{"-2P_i"}</Math>. These figures are net of the bond a resolution refunds, where Section 5.1&rsquo;s payouts are gross: <Math>{"+P_i"}</Math> is <Math>{"\\pi_s = 2G_i + P_i"}</Math> less the <Math>{"2G_i"}</Math> posted. The buyer&rsquo;s goods add <Math>{"+P_i"}</Math> to both of its branches and leave its comparison unchanged.
                    </PaperRun>
                    <p>
                        No other position&rsquo;s payment enters either comparison, and the only coupling between positions is the accumulator <Math>{"G_i"}</Math>, which the model-checked invariants pin. A result proved beside the others states this: the chain payoffs at a position are the bilateral payoffs on that position&rsquo;s data. A chain of any length is the verified edge replicated. A process is still bounded by the orders one resolution call can carry, which is the gas ceiling of Section 6.1.
                    </p>
                    <PaperRun title="The division between the two instruments.">
                        The bounded model checks that the machine keeps the table, at two of every party and process. The proof assistant checks what a rational party does given the table, at any chain length. Neither reaches what the other reaches: no model checking expresses an agent choosing, and no proof over the table shows that deployed code produces it. <em>Formally verified</em>, in this paper, means the conjunction of the two and nothing wider. No method here shows that participants are rational, or that the off-chain performance the payoffs credit ever occurred.
                    </PaperRun>
                    <PaperRun title="The one N-party object is not machine-checked.">
                        <em>Which</em> equilibrium the co-sellers select under the weakest-link structure is a question of mechanism design, answered on paper as a conditional: wherever the standard selection criteria separate universal performance from universal holding out, they favor universal performance, and the criteria that weigh a seller&rsquo;s belief about its co-sellers are stated for a risk-neutral seller (Figaro 2026, Corollary 3). The proof assistant contributes only the conditionality proved above. Selection among the equilibria that leaves open is outside what <em>formally verified</em> covers here.
                    </PaperRun>
                    <PaperScroll className="my-4">
                        <table className="text-sm border-collapse">
                            <thead>
                                <tr>
                                    {["", "What it establishes", "Over what range", "What it does not reach"].map((h) => (
                                        <th key={h} className="border border-default px-3 py-1.5 text-left font-semibold text-ink-heading">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td className="border border-default px-3 py-1.5 font-semibold text-ink-heading">Bounded state-machine model</td>
                                    <td className="border border-default px-3 py-1.5">that the machine keeps the payoff table: bond magnitudes, accumulator integrity, conservation, solvency, count correctness</td>
                                    <td className="border border-default px-3 py-1.5">every bound on parties and process shape two, sized to contain every action and every interference between them</td>
                                    <td className="border border-default px-3 py-1.5">configurations it did not enumerate; accumulator monotonicity; any agent choosing</td>
                                </tr>
                                <tr>
                                    <td className="border border-default px-3 py-1.5 font-semibold text-ink-heading">Proof-assistant development</td>
                                    <td className="border border-default px-3 py-1.5">that no unilateral deviation profits over that table, and that cooperation is a best response given the buyer&rsquo;s plan and the others&rsquo; performance</td>
                                    <td className="border border-default px-3 py-1.5">chains of any length, the accumulator derived from the chain&rsquo;s payments, each comparison the bilateral one at a link</td>
                                    <td className="border border-default px-3 py-1.5">that deployed code produces the table; that any participant is rational; which equilibrium co-sellers select</td>
                                </tr>
                            </tbody>
                        </table>
                        <p className="text-xs text-ink-muted mt-2">The two instruments of this subsection at their actual coverage.</p>
                    </PaperScroll>
                </PaperSubsection>
                <PaperSubsection title="5.3 Composition Surfaces">
                    <p>
                        Two further surfaces are verified under specification checking. The first is the attestation contract. An <em>attestation</em> is a statement a party signs about an open order, bound to a clause of the order&rsquo;s agreement. A non-buyer cannot attest as the buyer, and a successful buyer attestation implies the caller is the buyer. Quantified over every public entry point, no method of the attestation contract changes the resolution contract&rsquo;s state: neither an order&rsquo;s status nor a process state.
                    </p>
                    <p>
                        The second is the token-operations surface, a family of rules rather than a contract. Its coverage is claimed site by site, and it is complete on the resolution contract&rsquo;s own transfer sites: each carries exact-delta and conservation rules. The sites are enumerated rather than recalled, so a site with no rule is reported as uncovered. No property of Section 5.1 rests on a site outside the resolution contract.
                    </p>
                </PaperSubsection>
                <PaperSubsection title="5.4 Regression Spine">
                    <p>
                        The regression suite tests every named revert of Section 3.1 that is reachable through the public surface. For the one that is not, it pins the preempting error on each replay path. It also asserts that the off-chain typed-data digest matches the on-chain one, and that every event field encodes as readers expect. We state no counts of tests, rules, or files: they inventory a surface that changes, while the properties of Section 5.1 are the claim itself.
                    </p>
                </PaperSubsection>
                <PaperSubsection title="5.5 Scope of the Verification Claim">
                    <p>
                        The claim rests on checks a reader can re-run, and asks to be believed on no party&rsquo;s authority. Every property in Section 5.1 belongs to the <em>direct</em> resolution path: the contract&rsquo;s own commit and resolve and the state they keep, together with the two surfaces of Section 5.3. The second resolution path is treated below. On the direct path, the verification establishes that four distinct classes of check each find the properties named against them, within their bounds. It does not establish the following:
                    </p>
                    <ul className="space-y-2 list-disc pl-6 text-sm">
                        <li><strong>That the specification is the right one.</strong> Verification checks code against a specification, never the specification against what its writer meant.</li>
                        <li><strong>That the bytecode at a deployed address came from the checked source.</strong> Deployment is a separate act, under compiler settings this paper does not pin. A relying party confirms the chain from source to bytecode to address for itself.</li>
                        <li><strong>That the denomination token behaves.</strong> The contract takes any fungible token. If its issuer can blocklist, freeze, upgrade, or pause, it can strand a bonded balance the contract still counts as locked; a token whose balances rebase downward can leave the contract&rsquo;s pooled balance short of the bonds it counts. Choosing a denomination is choosing whose exit paths to accept.</li>
                        <li><strong>That the chain and the parties&rsquo; keys hold.</strong> A halt, censorship, or reorganization past finality, or a lost or stolen signing key, leaves the contract with no recovery path. These dependencies sit beneath and beside the verified surface (Section 6.3).</li>
                    </ul>
                    <PaperRun title="A flaw found after deployment is answered by a new instance.">
                        A contract with no upgrade path cannot be patched, so a flawed instance is abandoned. Replication is free: a corrected instance deploys beside it, and parties move by choosing where their next commitment goes. Nothing migrates. Commitments open in the flawed instance stay governed by it, with exactly the exposure the absence of exit paths fixes in advance. The same absence that prevents rescue prevents seizure. A party&rsquo;s protection against the residual is that each commitment is bounded: short-lived, sized to the trade, dissolved at resolution.
                    </PaperRun>
                    <PaperRun title="What a reader re-runs, and why its versions are not printed here.">
                        The specifications, models, and harness configurations are published with the implementation, each with its invariant list and its bounds. So are the pinned versions of every instrument and the outputs of the last full run. All are anchored to one fixed source snapshot, so a reader with the same classes of tooling re-runs the checks against the surface the results came from. Versions, snapshot, and run outputs change, so they live on the protocol&rsquo;s security page (Figaro n.d.) and the documents it points to. This paper keeps the shape of the claim: which class establishes which property, over what range, and what it does not reach.
                    </PaperRun>
                    <PaperRun title="The second resolution path shares one quantity with the first.">
                        Beside the direct path runs a proof-batched one. A batch verifier admits a validity proof that an off-chain mirror of the contract&rsquo;s state machine executed a batch. It then reconciles net token positions per participant and denomination, re-emits the attestations, and advances its own state root. The two paths share no resolution state, and neither calls or writes the other. An order resolved by batch never acquires a contract order status, so the properties of Section 5.1 are simply not about it. One quantity is common to both: a usage accrual, written into the same counter of clause, agreement, and assembly usage. An <em>assembly</em> is a published list of agreements that a process instantiates, and the counter is what designer rewards are counted from. Designer rewards are florins, the protocol&rsquo;s token, minted after the fact to the wallets that designed each clause, registered agreement, and assembly, in proportion to how much the network uses each. The counter resolves nothing and holds no bond.
                    </PaperRun>
                    <ResolutionPathsFigure
                        idPrefix="verified-resolution-kernel-resolution-paths"
                        lineFont="sans"
                        directPath={{
                            heading: "Direct path",
                            subheading: "the contract's own two calls",
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
                                "carried to the resolve call",
                            ],
                            events: ["batch resolved"],
                            state: ["its own state root, verifier-local"],
                        }}
                        sectionLabels={{ inputs: "Inputs", events: "Events emitted", state: "State" }}
                        neverWrittenNote="a contract order status — never acquired"
                        bridgeLabel="The usage counter"
                        bridgeSublabel="clause, agreement, and assembly usage"
                        crossingLabel="a usage accrual"
                        crossingSublabel="the one quantity common to both"
                        figureTitle="The two resolution paths, and the one surface common to both"
                        figureDesc={
                            "Two panels. The direct path is the contract's own two calls: a " +
                            "dual-signed commitment, and the buyer's resolution over the process; " +
                            "it emits an event for an order committed, an order resolved, and a process " +
                            "resolved, and it holds a per-order status that advances " +
                            "monotonically. It has no notion of a batch. The batch path is " +
                            "proof-verified off-chain execution: signed commitments gathered and " +
                            "ordered, a validity proof of a mirror's execution, carried to the " +
                            "resolve call; it emits an event for a batch resolved and advances its own " +
                            "verifier-local state root. A contract order status is never acquired " +
                            "on that path. The two panels share no resolution state, and neither " +
                            "calls the other or writes the other's. One arrow crosses between " +
                            "them, carrying a usage accrual — the one quantity common to both — " +
                            "into the counter of clause, agreement, and assembly usage, a surface that " +
                            "resolves nothing and holds no bond."
                        }
                        caption={
                            <>
                                An order resolved through the batch verifier never acquires a contract
                                order status at all. Exactly one quantity is common to the two paths
                                &mdash; a usage accrual &mdash; and the counter that receives it
                                resolves nothing and holds no bond.
                            </>
                        }
                    />
                    <PaperRun title="The composition of the two paths has its own model.">
                        A machine-checked model of the composed system interleaves the contract, the batch verifier, the usage counter, and the off-chain mirror arbitrarily. Its invariants include these: no value is paid out twice across the paths, and the paths&rsquo; order identities are disjoint. Token conservation and an exact locked amount per pool hold on both sides at once, and the contract&rsquo;s status gates stay blind to batch-resolved orders. The usage score is the sum of the two paths&rsquo; contributions, with the bridged write replacing rather than adding. The model establishes safety under arbitrary interleaving, given two assumptions.
                    </PaperRun>
                    <p>
                        The first assumption, that one signed commitment never acquires the same identity on both paths, is enforced by the contracts. Each path binds its own verifying-contract address into the typed-data domain, so the two identifier spaces are disjoint by construction. The second, that no accrual-period boundary falls between proving a batch and resolving it, is not enforced. An accrual period is one of the fixed windows into which the counter buckets usage, its counts final once it ends. When it fails, the affected processes&rsquo; usage is dropped rather than double-counted, so the failure is an under-count. The model abstracts proof validity, signature recovery, and hash collision-resistance, as the contract model of Section 5.2 does.
                    </p>
                </PaperSubsection>
                <PaperSubsection title="5.6 What the Batch Path Asks a Reader to Trust">
                    <p>
                        The direct path asks for trust in the chain beneath it and in the contract&rsquo;s arithmetic. The batch path asks for more, and its five assumptions are of two kinds. The first two are assumptions in the strong sense: no machine check in this paper discharges them. The other three are structural, a binding, a gate, and a role, each with limits a reader can inspect.
                    </p>
                    <ol className="space-y-2 list-decimal pl-6 text-sm">
                        <li><strong>Soundness of the proof system.</strong> A batch resolves because an accepting proof of a false statement is taken to be infeasible to produce. That is a cryptographic hardness assumption, together with the correctness of the proving system&rsquo;s implementation and of any setup parameters its scheme carries. It has no internal fallback: a broken proof system breaks the batch path, and nothing else in the pipeline would notice.</li>
                        <li><strong>Fidelity of the mirror to the contract.</strong> The proof attests that an off-chain mirror of the state machine executed the batch correctly. It cannot attest that the mirror <em>is</em> the contract. The two share the bond formula, the accumulator, the atomicity rule, and the rejection conditions, with one designed substitution: the mirror takes resolve authorization from a signature where the contract takes it from the calling address. Their equivalence rests on review and on running both against the same commitments, not on the proof. Where they diverge, the proof certifies the mirror&rsquo;s result faithfully. This is the assumption a reader who hears &ldquo;proved&rdquo; as &ldquo;proved against the contract&rdquo; is most likely to underestimate.</li>
                        <li><strong>The clause key binds the published clause.</strong> Clause specifications enter the proof as input data rather than as code, so a clause never seen before is batch-resolvable with no change to the prover. A clause&rsquo;s key is the hash of its specification&rsquo;s bytes. The proof checks the specification it used against the key of the clause the attestation names, a key the signed agreement commits, and commits that hash. The verifier accepts a batch only if each committed hash is the clause key and the key holds a public, first-write-wins registration under a stake. A substituted specification hashes to a different key, so the binding is as strong as the hash function, and anyone can fetch the specification and hash it.</li>
                        <li><strong>The on-chain verifier is the only gate.</strong> No off-chain party admits a batch. The verifier checks the proof, checks that it was made for this chain, for this verifier, and at a recent time, checks the hash bindings, and reconciles each participant&rsquo;s net position in each denomination. Otherwise it reverts. Prover and sequencer stand in the same relation to it: each can propose a batch and neither can admit one.</li>
                        <li><p><strong>The sequencer is transport, not authority.</strong> The <em>sequencer</em> gathers signed commitments and orders them for proving. It can stall or censor, leaving commitments unresolved while the failure lasts, but it cannot forge a resolution, because a batch that does not verify does not resolve.</p><p className="mt-2">A commitment never batched resolves directly. For a process already inside a batch, the guarantee rests on batch resolution being permissionless and on the state behind the root staying available. The verifier stores that root and a batch count, and accepts a batch only when the proof&rsquo;s previous root equals the stored one. The state behind the root is held off-chain and published by the sequencer that built the last batch. Anyone holding a copy can prove and submit what a stalled sequencer will not; if every copy is lost, the processes open on the batch path cannot be resolved, and their bonds stay in the verifier. Falling back to the direct path takes a fresh signature, since each path binds its own verifying contract into the domain. The cost is direct-path gas and one more signing round, which makes a sequencer failure a liveness problem rather than a safety one.</p></li>
                    </ol>
                    <BatchResolutionSequenceFigure idPrefix="verified-resolution-kernel-batch-sequence" />
                    <p>
                        Two consequences follow. The cross-path model establishes safety <em>given</em> proof validity, so the first two assumptions lie outside it. And the trust surface is a choice: a participant who declines any of the five resolves directly and pays direct-path gas. The batch path buys a lower cost per order with a longer list of things to believe.
                    </p>
                </PaperSubsection>
            </PaperSection>

            <PaperSection title="6. Security Analysis">
                <PaperSubsection title="6.1 Threat Model">
                    <p>We assume rational adversaries who maximize their payoff, and we run each attack against the code as written. The answer to each attack takes one of two forms. It is economic when the attacker loses a comparison of payoffs, and structural when the attack needs a state the machine cannot reach.</p>
                    <PaperRun title="Withheld resolution.">
                        A buyer that has received performance and does not resolve keeps what arrived and leaves its <Math>{"2P"}</Math> locked. Crediting it with the goods, it stands at <Math>{"-P"}</Math> where resolving would put it at <Math>{"0"}</Math>. The payment it withheld is frozen inside its own bond, out of reach of both parties, so withholding gains nothing. This is the equilibrium&rsquo;s first comparison on the code&rsquo;s arithmetic, and it holds only after performance; before it, the buyer prefers to keep the process open. Against a party acting outside these comparisons, the contract contributes the data: an unresolved commitment, emitted by construction (Section 2.5) and readable by any forum asked to rule while the process stands open.
                    </PaperRun>
                    <PaperRun title="Sybil orders.">
                        Each order requires both bonds in full, <Math>{"2(G_i + P_i)"}</Math>, so forging orders at scale is expensive in the way the mechanism intends. A locked bond earns no yield, trades on no secondary market, and carries no governance weight.
                    </PaperRun>
                    <PaperRun title="Front-running.">
                        Identifiers are content-addressed from the commitment (Section 2.3), and neither derivation reads a signature. An attacker therefore gains no fresh identifier by re-signing and obtains none without a commitment both parties have signed. Submitting an observed commitment first produces exactly the order the parties signed: the contract recovers both signatures and pulls each bond from the named party. A second submission is refused by the replay checks of Section 3.1. The race is open and wins nothing; the front-runner pays the gas for someone else&rsquo;s order.
                    </PaperRun>
                    <PaperRun title="Cumulative-value misreporting.">
                        There is nothing to report. Commitment admits exactly one cumulative value per order: the payment at a root, the stored accumulator plus the new payment for an extension. Any other declaration, higher or lower, reverts. The seller&rsquo;s bond base is computed, never declared, so the attack is unreachable rather than deterred.
                    </PaperRun>
                    <PaperRun title="Reentrancy.">
                        Both entry points carry a reentrancy mutex. The guard is load-bearing, because the resolution loop makes two transfers per order before writing its resolved status. Under a token whose transfer hooks call back into the caller, the callback could otherwise re-enter resolution on the same process. The mutex reverts the nested call before any half-resolved state is visible. The attestation contract adds no vector. Its caller must be the party the commitment names, the order&rsquo;s seller or its buyer, so a party attests for itself. Its only external calls are two reads of the resolution contract, an order&rsquo;s status and the domain separator. It holds no tokens and no storage, and its only effect is an event emitted after its checks pass.
                    </PaperRun>
                    <PaperRun title="The attestation binds to the signed agreement.">
                        The attestation contract runs no per-clause code. It verifies a merkle inclusion proof of the attested clause&rsquo;s leaf against the checkout hash the commitment carries. Content typed by a clause is therefore admitted only against an order whose signed agreement contains that clause. The evidence itself is never hashed on-chain: the caller supplies a fingerprint of the off-chain content, which the contract emits unchecked, so the content never reaches calldata.
                    </PaperRun>
                    <PaperRun title="ECDSA signature malleability.">
                        The signature-recovery routine rejects high-<Math>{"s"}</Math> signatures, the secp256k1 malleability class. A <Math>{"v"}</Math> value outside <Math>{"\\{27, 28\\}"}</Math> recovers no signer, and the call reverts. Malleation gains nothing in any case: identifiers read no signature, so a malleated copy names the same order and meets the replay checks of Section 3.1.
                    </PaperRun>
                    <PaperRun title="Integer overflow.">
                        The contract compiles under checked arithmetic and also checks, before computing <Math>{"2G + P"}</Math> at resolution, that no cumulative value exceeds a third of the largest representable value. The check is a backstop for a state that funding makes unreachable. When an order with cumulative value <Math>{"G_n"}</Math> is admitted, the contract holds its seller&rsquo;s bond <Math>{"2G_n"}</Math>, its buyer&rsquo;s bond <Math>{"2P_n"}</Math>, and at least the previous seller&rsquo;s bond <Math>{"2G_{n-1}"}</Math>. Since <Math>{"G_n = G_{n-1} + P_n"}</Math>, that is at least <Math>{"4G_n"}</Math>; at a root, <Math>{"2G + 2P = 4G"}</Math>. A cumulative value above a third of the maximum would need a balance above the maximum, which no token balance can hold, so no such commitment is admitted while the token keeps the contract&rsquo;s balance. A token that rebases downward or misreports balances can break that premise, and there the check is what stops the payout computation.
                    </PaperRun>
                    <PaperRun title="Resolution-loop gas bounding.">
                        Resolution does a fixed block of work per order: a hash, a storage read, two transfers, and a storage write. Its cost grows linearly in the active-order count, while each commitment&rsquo;s cost is fixed per call and does not grow with the process: a root commitment, which opens the process&rsquo;s state, costs more than one that extends it. Resolution is live only if <Math>{"g_0 + \\text{activeOrderCount} \\times g_{\\text{per-order}} \\le g_{\\text{max}}"}</Math>, where <Math>{"g_0"}</Math> is the call&rsquo;s fixed cost and <Math>{"g_{\\text{max}}"}</Math> is the most gas the host chain lets one transaction use. That limit therefore caps the orders one process may carry; the magnitude is a fact about a deployment. The equilibrium&rsquo;s algebra holds at any length, and the equilibrium holds for any number of orders the network resolves in one call; the substrate caps how much of that length one process carries. The contract cannot know the size a design intends, and a process grown past the ceiling can never resolve, leaving its bonds locked. The obligation therefore falls on whatever assembles the process: it refuses the commitment that would cross the ceiling, or splits the work across several processes, each resolved atomically on its own and none atomically with another.
                    </PaperRun>
                    <PaperRun title="Signature replay across forks.">
                        The EIP-712 domain separator binds the digest to the chain id and the verifying contract, and is recomputed when the chain id changes. A fork that changes its chain id therefore invalidates pre-fork signatures on that fork. A fork that keeps the chain id shares the domain separator on both branches, which is a property of chain identification, addressed beneath the contract.
                    </PaperRun>
                </PaperSubsection>
                <PaperSubsection title="6.2 Liveness">
                    <p>
                        That a buyer resolves after satisfactory performance is a property of rational play, the comparison of withheld resolution above. The contract adds four operational preconditions. The resolve transaction must be includable on the host chain. The resolution loop must fit within the gas limit. The buyer must be able to send a call from the root-buyer address. The denomination must be live, its transfers not reverting under a blocklist or freeze. The last three can be checked by the parties before they commit. No other address can resolve, and there is no timeout.
                    </p>
                </PaperSubsection>
                <PaperSubsection title="6.3 What the Verified Properties Rest On">
                    <p>
                        Every property in Section 5 is a property of state a chain maintains. Consensus and finality make the verified transitions authentic: a state the checks prove unreachable is unreachable only on the history the chain agrees on. Halt, censorship, deep reorganization, and a denomination issuer&rsquo;s authority over bonded balances are failures of that ground, not of the code. No method of Section 4 reasons about them, and nothing verified here survives them. That is the boundary of the claim.
                    </p>
                    <p>
                        The data any later account of a process rests on is emitted by construction. No party collects a payout without the corresponding events, so every commitment, bond, and resolution is visible, and so is every non-resolution by its absence. The data is a byproduct of resolution, never summoned when something goes wrong. What it is worth as evidence, and on what terms a forum credits it, is a question about institutions that this verification does not address.
                    </p>
                </PaperSubsection>
                <PaperSubsection title="6.4 Scope and Limitations">
                    <p>
                        <em>Non-rational failure.</em> Lost keys, failed hardware, or a participant&rsquo;s death leave co-sellers in open positions under atomic resolution, whatever their incentives. The coordination pressure among sellers is a statement about choices, and failure is not a choice. Reliability under such failure depends on continuity practices outside the verified surface.
                    </p>
                    <p>
                        <em>No clock runs from the bonded state.</em> No verified property depends on how long a bond stays locked, because the contract measures no elapsed time after commitment. The one deadline it reads bounds a signed offer and stops at commit, so duration enters no invariant, no revert condition, and no check.
                    </p>
                </PaperSubsection>
            </PaperSection>

            <PaperSection title="7. Contracts Built Against It, and the One Guarantee That Is Machine-Checked">
                <p>
                    Other contracts are built against the resolution contract, and for a verification paper the question is narrow. Does such a contract leave the state machine of Section 5 as it was checked? Whether it leaves the parties&rsquo; equilibrium intact runs through payoffs, which is mechanism design, and this section does not decide it. The half a machine can check has one guarantee to report.
                </p>
                <p>
                    The two entry points admit composition differently, by the contract&rsquo;s own design. <em>Commit</em> admits a relay. The call carries both parties&rsquo; signatures, which the contract recovers itself before pulling each bond from the named party. A relay supplies transport, and the contract stays the writer; the bond-correctness rules of Section 5.1 fix each balance a commitment moves. <em>Resolve</em> admits no relay. It takes no signature and authorizes on the calling address, so no one can perform it on the buyer&rsquo;s behalf with any artifact whatever. That is the buyer-dominance property of Section 5.1.
                </p>
                <p>
                    The attestation contract reads the resolution contract&rsquo;s state and invokes neither entry point. It recomputes an order identifier from a supplied commitment to confirm the order is open, checks that the caller is the party the commitment names, and verifies the clause leaf against the checkout hash. It then emits an event; it holds no storage and no tokens. Its guarantee is a rule quantified over every public entry point: <em>no method changes the resolution contract&rsquo;s state</em>, neither an order&rsquo;s status nor a process state (Section 5.3). Any reasoning about composition has to assume that of such a contract. Here it is a machine check over the whole surface, not a reader&rsquo;s inspection of the paths that came to mind.
                </p>
                <p>
                    Other contracts compose without that check, and none is among the verified surfaces. The usage counter also reads an order&rsquo;s status and the domain separator, and never invokes an entry point. A swap-funded commitment contract lets a party bond from a token other than the denomination. It takes the party&rsquo;s input token under a signature that binds the swap itself: venue, input token, input ceiling, and a hash of the exact swap call. It forwards the whole proceeds to the party and only then submits the commitment both parties signed. It is the relay case made concrete, with bond amounts read from the signed commitment, so no funding step can under-fund the contract&rsquo;s own pull; it carries a bounded model of its own. The registries of clauses, agreements, assemblies, and members are read by participants and never touch the resolution contract.
                </p>
                <PaperRun title="The machine check covers one surface as it stands.">
                    The rule covers the attestation contract&rsquo;s public surface and nothing else. It says nothing about a contract not yet written, and nothing about whether any composition preserves the equilibrium, which rests on payoffs the code does not contain. A composition that writes the resolution contract&rsquo;s state, or opens a second route to a payoff indexed on how a process resolves, lies outside this verification.
                </PaperRun>
            </PaperSection>

            <PaperSection title="8. Conclusion">
                <p>
                    A two-call contract with no upgrade path admits a verification whose reach can be stated exactly. On the direct path, four classes of check establish the properties the equilibrium presupposes, each property credited with the methods that carry it: conservation and accumulator integrity carry several, atomicity only fuzzing. Apart from the code, a proof assistant establishes the equilibrium over the payoff table the bounded model pins, at any chain length, because the chain reduces to its edges. The conjunction of those two is what <em>formally verified</em> means here. The batch path, the chain beneath, the token chosen, and the selection among co-seller equilibria lie outside it, each named. The assurance is uneven across properties; it is stronger than any single method gives, and it reduces risk without retiring it.
                </p>
            </PaperSection>
        </PaperLayout>
    );
}
