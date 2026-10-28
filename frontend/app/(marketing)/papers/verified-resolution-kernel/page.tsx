import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import {
    PaperLayout,
    PaperSection,
    PaperRun,
} from "@/components/papers/PaperLayout";
import { Math } from "@/components/papers/Math";

export const metadata: Metadata = withOg({
    title: "What Formal Verification Transfers to a Bonded Contract — Figaro Protocol",
    description:
        "For a contract whose security is an equilibrium, a machine check of the code carries the theorem only through a specification that entails the payoff table the theorem is proved over. Conservation and solvency do not entail it; two invariants, the bond schedule and the resolution's transfers, do; and the conjunction of those checks with a proof over the table never reaches rationality, off-chain performance, equilibrium selection, or a composed contract's payoffs.",
});

function FormalBlock({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="border-l-2 border-default pl-6 my-3 space-y-3">
            <p className="text-sm font-semibold text-ink-heading">{label}</p>
            {children}
        </div>
    );
}

export default function VerifiedResolutionKernelPaper() {
    return (
        <PaperLayout slug="verified-resolution-kernel"
            title="What Formal Verification Transfers to a Bonded Contract"
            subtitle="The Payoff Table as the Specification, and What No Check Reaches"
            author="Figaro"
            date="April 2026"
            watermark="Figaro Protocol · Preprint"
            abstract={
                <>
                    <p>
                        Some smart contracts are secure because of an equilibrium: no party gains by deviating, given the transfers the contract makes. We ask what a machine check of such a contract&rsquo;s code can establish about that security. Our answer is that a check carries the equilibrium theorem to the code only through a specification that entails the payoff table the theorem is proved over. Token conservation and contract solvency, the specifications verification most often states, do not entail it. Two worked variants of a bonded resolution contract satisfy both and break the equilibrium: one that pays the seller the buyer&rsquo;s whole bond leaves the buyer no better off for resolving than for walking away, and one that bonds a seller on its own payment, identical to the mechanism at every root order, makes holding out a seller&rsquo;s strict best response deeper in the chain.
                    </p>
                    <p>
                        Two invariants do entail the table, given that commit and resolve are the only operations that move a bond: the bond schedule and the resolution&rsquo;s transfers. Each concerns one position of the process chain, coupled to its neighbors only through the cumulative-value accumulator, so a check per transition and a proof per position together cover a chain of any length. <em>Formally verified</em> can therefore defensibly mean one conjunction: checks that the code realizes the table, and a proof of the equilibrium over it. That conjunction does not reach whether participants are rational, whether off-chain performance occurred, which equilibrium co-sellers select, or whether a contract composed beside this one preserves the equilibrium.
                    </p>
                </>
            }
            references={
                <>
                    <li>Babel, Kushal, Philip Daian, Mahimna Kelkar, and Ari Juels. 2023. &ldquo;Clockwork Finance: Automated Analysis of Economic Security in Smart Contracts.&rdquo; In <em>2023 IEEE Symposium on Security and Privacy (SP)</em>, 2499&ndash;2516. IEEE. https://doi.org/10.1109/SP46215.2023.10179346.</li>
                    <li>Barrett, Clark, and Cesare Tinelli. 2018. &ldquo;Satisfiability Modulo Theories.&rdquo; In <em>Handbook of Model Checking</em>, edited by Edmund M. Clarke, Thomas A. Henzinger, Helmut Veith, and Roderick Bloem, 305&ndash;343. Cham: Springer. https://doi.org/10.1007/978-3-319-10575-8_11.</li>
                    <li>Bhargavan, Karthikeyan, Antoine Delignat-Lavaud, C&eacute;dric Fournet, Anitha Gollamudi, Georges Gonthier, Nadim Kobeissi, Natalia Kulatova, et al. 2016. &ldquo;Formal Verification of Smart Contracts: Short Paper.&rdquo; In <em>Proceedings of the 2016 ACM Workshop on Programming Languages and Analysis for Security</em>, 91&ndash;96. New York: ACM. https://doi.org/10.1145/2993600.2993611.</li>
                    <li>Buterin, Vitalik. 2016. &ldquo;A Proof of Stake Design Philosophy.&rdquo; <em>Medium</em>, December 30, 2016. https://medium.com/@VitalikButerin/a-proof-of-stake-design-philosophy-506585978d51. Accessed October 28, 2026.</li>
                    <li>Caminati, Marco B., Manfred Kerber, Christoph Lange, and Colin Rowat. 2015. &ldquo;Sound Auction Specification and Implementation.&rdquo; In <em>Proceedings of the Sixteenth ACM Conference on Economics and Computation</em>, 547&ndash;564. New York: ACM. https://doi.org/10.1145/2764468.2764511.</li>
                    <li>Clarke, Edmund M., Orna Grumberg, and Doron A. Peled. 1999. <em>Model Checking</em>. Cambridge, MA: MIT Press.</li>
                    <li>Figaro. 2026. &ldquo;Asymmetric Bonding and Buyer Dominance: Two Composing Mechanisms for Self-Enforcing N-Party Coordination.&rdquo; Preprint. https://figaroprotocol.com/papers/asymmetric-bonding/. Accessed October 19, 2026.</li>
                    <li>Kerber, Manfred, Christoph Lange, and Colin Rowat. 2016. &ldquo;An Introduction to Mechanized Reasoning.&rdquo; <em>Journal of Mathematical Economics</em> 66: 26&ndash;39. https://doi.org/10.1016/j.jmateco.2016.06.005.</li>
                    <li>Le Roux, St&eacute;phane, &Eacute;rik Martin-Dorel, and Jan-Georg Smaus. 2017. &ldquo;An Existence Theorem of Nash Equilibrium in Coq and Isabelle.&rdquo; In <em>Proceedings of the Eighth International Symposium on Games, Automata, Logics and Formal Verification (GandALF 2017)</em>, Electronic Proceedings in Theoretical Computer Science 256: 46&ndash;60. https://doi.org/10.4204/EPTCS.256.4.</li>
                    <li>Nipkow, Tobias. 2009. &ldquo;Social Choice Theory in HOL: Arrow and Gibbard&ndash;Satterthwaite.&rdquo; <em>Journal of Automated Reasoning</em> 43 (3): 289&ndash;304. https://doi.org/10.1007/s10817-009-9147-4.</li>
                    <li>Tolmach, Palina, Yi Li, Shang-Wei Lin, Yang Liu, and Zengxiang Li. 2021. &ldquo;A Survey of Smart Contract Formal Specification and Verification.&rdquo; <em>ACM Computing Surveys</em> 54 (7): 1&ndash;38. https://doi.org/10.1145/3464421.</li>
                </>
            }
        >
            <PaperSection title="1. Introduction">
                <p>
                    Take a process chain of four orders, each with payment <Math>{"P"}</Math>, and two contracts that run it. Both lock bonds at commit and pay them out when the buyer resolves; both conserve every token, and neither ever owes more than it holds. In the first, the fourth seller bonds <Math>{"8P"}</Math>, twice the <Math>{"4P"}</Math> accumulated through its order. In the second it bonds <Math>{"2P"}</Math>, twice its own payment. A seller that keeps the <Math>{"4P"}</Math> in its hands and never performs ends at <Math>{"-4P"}</Math> under the first contract and at <Math>{"+2P"}</Math> under the second, where performing earns <Math>{"+P"}</Math> under both. A verification of conservation and solvency passes both contracts, and only one of them has the equilibrium its design promises.
                </p>
                <p>
                    The first contract is the mechanism of Figaro (2026), which we restate in one paragraph. An <em>order</em> is one buyer&ndash;seller commitment; a <em>process</em> is the chain of orders one buyer opens and resolves together. The <em>cumulative value</em> <Math>{"G_i \\geq P_i"}</Math> of order <Math>{"i"}</Math> is every payment the process has accumulated through it, its own included, so <Math>{"G_1 = P_1"}</Math> at the root and <Math>{"G_i = G_{i-1} + P_i"}</Math> after. <em>Commit</em> locks <Math>{"2P_i"}</Math> from the buyer and <Math>{"2G_i"}</Math> from the seller. <em>Resolve</em> is the buyer&rsquo;s alone and closes every order of the process or none; it pays each seller <Math>{"2G_i + P_i"}</Math> and refunds the buyer <Math>{"P_i"}</Math>, the rest of its bond, which exhausts what was locked. Over these transfers, performance with resolution is an equilibrium at every position of a chain of any length the network resolves in one call (Figaro 2026, Theorems 1 and 3). The contract&rsquo;s security is that equilibrium: it holds no test of performance, and nothing else keeps a party honest.
                </p>
                <p>
                    Our question is what a machine check of such a contract&rsquo;s code can establish about its security. The answer is Proposition 1: a check carries the equilibrium theorem to the code only through a specification that entails the payoff table, and the defensible meaning of <em>formally verified</em> is a conjunction of two kinds of evidence with a named residue. The proposition is an argument about evidence, proved from its premises. The checks it reasons about establish protocol properties of code; the theorem it reasons about is a mechanism-design result; it makes no claim about how participants have played.
                </p>
            </PaperSection>

            <PaperSection title="2. Verification Has Proved the Economics or the Code, Rarely the Bridge">
                <p>
                    One literature mechanizes economic theorems. Nipkow (2009) formalizes in higher-order logic two proofs of Arrow&rsquo;s impossibility theorem and derives the Gibbard&ndash;Satterthwaite theorem as a corollary. Le Roux, Martin-Dorel, and Smaus (2017) prove an existence theorem for Nash equilibrium in two proof assistants. Kerber, Lange, and Rowat (2016) introduce mechanized reasoning to economists through social choice and auction theory, with a mechanized proof of Vickrey&rsquo;s theorem on second-price auctions. These results are about the mathematics, and they are silent on any machine that runs a mechanism.
                </p>
                <p>
                    Caminati et al. (2015) close that gap for the combinatorial Vickrey auction by construction. They prove the design&rsquo;s properties in a proof assistant and then generate executable code directly from the proved specification, so the implementation cannot depart from what was proved. A smart contract is usually written separately, in a language for a chain&rsquo;s virtual machine, and the bridge must be built the other way: a specification of the existing code that entails the object the proof is about. That bridge is our subject.
                </p>
                <p>
                    A second literature verifies smart-contract code. Bhargavan et al. (2016) translate contracts into a language for program verification to check their runtime safety and functional correctness. Tolmach et al. (2021) survey the formal models and specifications of smart contracts in the literature and the approaches used to verify them. The properties in this line are properties of every execution: no reentrant drain, no overflow, balances conserved. None of them, alone, is an equilibrium, and the introduction&rsquo;s two contracts show that the most common ones do not imply one.
                </p>
                <p>
                    A third literature takes economic security as its object. Babel et al. (2023) define extractable value, a formal notion of economic security for composed decentralized-finance contracts, and extract the economic attacks a set of modeled contracts admits. Buterin (2016) puts the principle for proof of stake as security that comes from economic value-at-loss, and adds at once that economics is not everything, since individual actors may act on motives outside the protocol. Our contribution sits between the second and third lines: given a contract whose security is a proved equilibrium, which specification a code check must establish for the proof to apply to the code, and what remains outside both.
                </p>
            </PaperSection>

            <PaperSection title="3. A Check Establishes a Property of Code Against a Specification">
                <p>
                    Every class of machine check answers one question: does this code satisfy this specification over this range? The classes differ in the range, and a reader can apply any of them to a contract of this shape. We state each by what it can reach and where it stops.
                </p>
                <PaperRun title="Exhaustive model checking of a bounded state machine.">
                    The contract is written as a transition system, and an explicit-state checker enumerates every reachable state of a finite configuration, returning a violating trace or exhaustive coverage (Clarke, Grumberg, and Peled 1999). It covers every interleaving of the actions within its bounds and says nothing about configurations it did not enumerate.
                </PaperRun>
                <PaperRun title="Property-based fuzzing of the compiled code.">
                    Randomized call sequences run against the code the chain executes. Fuzzing reaches behavior a model abstracts away, and it samples: it finds defects and never proves their absence.
                </PaperRun>
                <PaperRun title="Symbolic execution over bounded call traces.">
                    Call traces are encoded as satisfiability-modulo-theories formulas, and a decision procedure is asked whether any input satisfies a property&rsquo;s negation (Barrett and Tinelli 2018). An unsatisfiable answer covers every input on the modeled trace; the traces, and often the arithmetic, are bounded.
                </PaperRun>
                <PaperRun title="Specification checking of method-quantified rules.">
                    Declarative rules are discharged against the code by the same class of solver. A rule can quantify over methods, so &ldquo;no method other than commit and resolve moves a bond&rdquo; is one claim. A rule checked from an arbitrary state that satisfies its hypothesis is inductive: it holds at every reachable state, whatever the length of the history.
                </PaperRun>
                <PaperRun title="A proof of the algebra, apart from the code.">
                    The equilibrium&rsquo;s inequalities can be stated and proved over the payoff table, and a proof assistant can check that proof. It quantifies over chains of any length and is silent on whether any deployed code produces the table.
                </PaperRun>
                <p>
                    Would a referee want a probability bound on the residual error of such a stack? No honest one exists. Symbolic execution and specification checking lean on the same class of solver, which breaks the independence a bound would need, and the prior rate of invariant violations in contracts of this kind is not characterized. What a reader can re-run is the specification, the bounds, and the property set, and those are what any verification claim rests on.
                </p>
            </PaperSection>

            <PaperSection title="4. What a Check Transfers Is Bounded by What the Specification Pins">
                <p>
                    Call the <em>payoff table</em> of an order the transfers the contract makes on it at each of its two calls, as functions of <Math>{"P_i"}</Math> and <Math>{"G_i"}</Math>: <Math>{"2P_i"}</Math> and <Math>{"2G_i"}</Math> locked at commit, <Math>{"2G_i + P_i"}</Math> and <Math>{"P_i"}</Math> paid at resolution, nothing otherwise. A specification <em>pins</em> the table when every contract that satisfies it makes exactly those transfers at every reachable state.
                </p>
                <FormalBlock label="Proposition 1 (What Verification Transfers).">
                    <p>
                        For a contract whose security property is an equilibrium over a payoff table, a machine check of the code carries the equilibrium theorem to the code only through a specification that pins that table. Conservation and solvency do not pin it. The bond schedule and the resolution&rsquo;s transfers do, at any chain length, given that commit and resolve are the only operations that move a bond. <em>Formally verified</em> therefore means defensibly only the conjunction of checks that the code realizes the table and a proof of the equilibrium over it.
                    </p>
                </FormalBlock>
                <PaperRun title="Premises.">
                    The argument uses four.
                </PaperRun>
                <ol className="space-y-2 list-decimal pl-6 text-sm">
                    <li><strong>The security property is an equilibrium over the table.</strong> Its hypotheses are two per order: a payment of at least one unit, and a cumulative value at least that payment. Four results hold over them (Figaro 2026, Theorems 1 and 3 and the gap stated beside Theorem 3). After performance, resolving strictly beats never resolving for the buyer, with no hypothesis about the seller. The buyer&rsquo;s plan is to resolve once every seller has performed, and not before. Given that plan, performing is the seller&rsquo;s strict best response at every retention <Math>{"r_i \\leq G_i"}</Math>, where <Math>{"r_i"}</Math> is the value it can keep by never performing. The margin between performing and holding out at maximal retention is <Math>{"P_i + G_i"}</Math>, never less than <Math>{"2P_i"}</Math>. At every position of a chain of any length, no unilateral deviation profits. Each comparison is local: the seller weighs <Math>{"+P_i"}</Math> against <Math>{"-2G_i + r_i"}</Math>, the buyer after performance <Math>{"-P_i"}</Math> against <Math>{"-2P_i"}</Math> before the value it received, and no other position&rsquo;s payment enters either. The game&rsquo;s only moves are commit and resolve, and an exit path added to it leaves the equilibrium unproved for the augmented game (Figaro 2026, Theorem 2).</li>
                    <li><strong>A machine check establishes a property of the code against a specification</strong>, over the range its class admits (Section 3), and nothing about the code beyond what the specification states.</li>
                    <li><strong>Conservation and solvency are satisfied by a contract that breaks the equilibrium.</strong> <em>Conservation</em>: wallet balances and the contract&rsquo;s balance together equal the supply under every sequence of calls. <em>Solvency</em>: the contract&rsquo;s balance is at least every outstanding bond. Both constrain only the sum an order locks and pays out, never the base of a bond or how the payout is split. The <em>whole-bond</em> variant pays the seller, at resolution, its own bond and the buyer&rsquo;s whole bond, <Math>{"2G_i + 2P_i"}</Math>, and refunds the buyer nothing. Each order pays out exactly the <Math>{"2P_i + 2G_i"}</Math> it locked, so the variant conserves every token and never owes more than it holds.</li>
                    <li><strong>Two invariants pin the table, each a property of one position.</strong> The <em>bond schedule</em>: while an order is committed, the buyer&rsquo;s locked position is <Math>{"2P_i"}</Math> and the seller&rsquo;s <Math>{"2G_i"}</Math>, with <Math>{"G_i = G_{i-1} + P_i"}</Math> computed from the contract&rsquo;s own accumulator, never declared by a party. The <em>resolution&rsquo;s transfers</em>: at resolution exactly <Math>{"P_i"}</Math> moves from buyer to seller on each order and both bonds are refunded whole, on every order of the process or none. Each reads only its own order&rsquo;s terms and the accumulator its predecessor left (stipulated as the model of Figaro 2026, Definitions 1, 5 and 6).</li>
                </ol>
                <PaperRun title="Premise 3, worked against the theorem&rsquo;s comparisons.">
                    In the mechanism, the buyer that resolves after performance ends at <Math>{"-2P_i + P_i + P_i = 0"}</Math>: resolution refunds the rest of its bond, <Math>{"2P_i - P_i"}</Math>, and it holds the value it received. Never resolving leaves the bond locked, at <Math>{"-2P_i + P_i = -P_i"}</Math>. Under the whole-bond variant the refund is zero, so resolving ends at <Math>{"-2P_i + P_i = -P_i"}</Math> as well. The buyer&rsquo;s strict comparison, Theorem 1(a)&rsquo;s <Math>{"0"}</Math> against <Math>{"-P"}</Math>, becomes a tie. The seller&rsquo;s step is stated given the buyer&rsquo;s, so it loses its premise: the profile in which the buyer never resolves and every seller holds out is as consistent as the cooperative one, each party&rsquo;s step at best a tie, and the theorem&rsquo;s strict equilibrium is lost.
                </PaperRun>
                <PaperRun title="A second variant breaks the other invariant.">
                    The <em>payment-bonded</em> variant of the introduction leaves the resolution&rsquo;s transfers as they are and changes the bond schedule: each seller bonds <Math>{"2P_i"}</Math> and is paid <Math>{"3P_i"}</Math>. Each order locks <Math>{"4P_i"}</Math> and pays out <Math>{"3P_i + P_i"}</Math>, so it too conserves and stays solvent. Its seller weighs <Math>{"+P_i"}</Math> against <Math>{"r_i - 2P_i"}</Math>, and holds out whenever <Math>{"r_i > 3P_i"}</Math>: the introduction&rsquo;s fourth seller retains <Math>{"4P"}</Math>. At every root order <Math>{"G_1 = P_1"}</Math>, and the variant makes exactly the mechanism&rsquo;s transfers, so a check confined to root orders cannot tell the two apart. Each invariant of premise 4 thus has a variant that conserves, stays solvent, keeps the other invariant, and breaks the equilibrium.
                </PaperRun>
                <PaperRun title="Step 1: the specification bounds the transfer.">
                    From premises 1 and 2: the theorem is a statement about contracts whose transfers are the table, and a check tells us only that the code satisfies its specification. The theorem therefore applies to the code exactly when the specification entails the table, or entails some family of tables over which an equilibrium theorem has been proved.
                </PaperRun>
                <PaperRun title="Step 2: the standard specifications entail too little.">
                    From premise 3 and its second variant: a specification of conservation and solvency admits both, and under neither does the theorem&rsquo;s strict equilibrium hold, the buyer&rsquo;s comparison tying under the first and the seller&rsquo;s reversing under the second. No equilibrium theorem holds over every table that specification admits, so checking it carries none to the code.
                </PaperRun>
                <PaperRun title="Step 3: per-position invariants reach any chain length.">
                    From premise 4: each invariant is preserved or broken by one transition, a commit at one position or the resolution of one process, reading only its own order&rsquo;s terms and the stored accumulator. A check of each transition from an arbitrary state that satisfies the invariants, with the invariants holding at the initial state and preserved by every method, is inductive, so it reaches every reachable state at every chain length; a bounded enumeration adds that the transitions keep the invariants under every interleaving within its bounds. On the proof&rsquo;s side, premise 1 makes every comparison local to its position, so the proof at one position is the proof at all of them, the accumulator being the only coupling and the one quantity the bond schedule pins.
                </PaperRun>
                <PaperRun title="Conclusion.">
                    A machine check carries the equilibrium theorem to the code only through a specification that pins the payoff table. The bond schedule and the resolution&rsquo;s transfers pin it at any chain length, given the two-operation move set, which a method-quantified rule states as one claim; conservation and solvency do not. <em>Formally verified</em> means defensibly only the conjunction of the checks that the code realizes the table and a proof of the equilibrium over it.
                </PaperRun>
                <p>
                    Does the equilibrium need the exact table? It does not. With the bonds fixed at <Math>{"2P_i"}</Math> and <Math>{"2G_i"}</Math>, the comparisons of premise 1 stay strict for every seller payout strictly between <Math>{"G_i"}</Math> and <Math>{"2G_i + 2P_i"}</Math>; the whole-bond variant sits at the upper end, where the buyer&rsquo;s comparison ties. Only the table gives the outcome Figaro (2026) proves, the buyer at <Math>{"0"}</Math> and each seller at <Math>{"+P_i"}</Math>. A weaker specification can therefore carry an equilibrium claim, but only with a fresh proof over every table it admits. That is the qualification Step 1 already states, and it leaves the proposition&rsquo;s point intact: what transfers is fixed by what the specification entails, never by what the code was meant to do.
                </p>
                <PaperRun title="Falsifier.">
                    The proposition is false if the equilibrium of the chain has a property that does not reduce to per-position comparisons coupled through the accumulator: a seller&rsquo;s comparison that reads a co-seller&rsquo;s payment, say, would make Step 3&rsquo;s locality fail and leave no per-position invariant that pins it. It is also false if a check carries the theorem to the code under a specification that admits a table the theorem is not proved over.
                </PaperRun>
            </PaperSection>

            <PaperSection title="5. What the Conjunction Never Reaches">
                <p>
                    The scope of Proposition 1 is its residue. The conjunction establishes that the code makes the table&rsquo;s transfers and that rational parties facing the table perform and resolve. It assumes parties that maximize their payoffs over certain amounts, information that is symmetric about the table and the chain&rsquo;s data, the timing of the game of Figaro (2026), and a chain that executes the two operations faithfully. Four questions stay outside it, and each is answered, where it is answered, by other means.
                </p>
                <ul className="space-y-2 list-disc pl-6 text-sm">
                    <li><strong>Rationality.</strong> No check of code shows that a participant ranks outcomes by the table. A party may act on motives outside the protocol, which is Buterin&rsquo;s (2016) caution for any security built on value-at-loss.</li>
                    <li><strong>Off-chain performance.</strong> The table credits performance, and the contract holds no test of it: the buyer&rsquo;s resolution is the acceptance test. Whether the value a payoff credits ever arrived is a fact about the world, and a forum asked to rule on it reads the open process&rsquo;s data.</li>
                    <li><strong>Equilibrium selection.</strong> Atomic resolution leaves the sellers two mutually consistent profiles, universal performance and universal holding out. Which one co-sellers select is answered on paper as a conditional: wherever the standard criteria separate the two, they favor performance (Figaro 2026, Corollary 3). A proof over the table contributes only that cooperation is a best response given the buyer&rsquo;s plan and the others&rsquo; performance.</li>
                    <li><strong>Composition.</strong> A contract built beside this one can be checked for one thing by machine: that no method of it changes the resolution contract&rsquo;s state, which keeps the move set of premise 1 intact. Whether it preserves the equilibrium turns on payoffs it adds outside the table, such as a transfer conditional on a seller&rsquo;s holding out, which enters the seller&rsquo;s comparison exactly as a side transfer does (Figaro 2026, Proposition 2). Those payoffs are not in the resolution contract&rsquo;s code, so no check of it sees them.</li>
                </ul>
                <p>
                    Four further limits belong to every verification claim, and the proposition narrows the first. A check never shows that its specification is the right one; Proposition 1 turns that question into a comparison anyone can make, whether the specification entails the table the theorem is proved over. A check of source never shows that the code at a deployed address came from it; a relying party confirms that chain for itself. And every verified property is a property of state a chain maintains, so a denomination token whose issuer can freeze or reduce balances, or a chain that halts, censors, or reorganizes past finality, lies beneath the claim, where no method of Section 3 reasons. Last, a lost key signs no new commitment.
                </p>
            </PaperSection>

            <PaperSection title="6. Conclusion">
                <p>
                    For a contract whose security is an equilibrium, &ldquo;formally verified&rdquo; is a statement about two objects and the bridge between them. The bridge is the payoff table: conservation and solvency leave it unpinned, as a contract that pays the seller the buyer&rsquo;s whole bond and one that bonds a seller on its own payment both show, while the bond schedule and the resolution&rsquo;s transfers pin it at any chain length because each is a property of one position coupled only through the accumulator. A verification report for such a contract should therefore state which specification entails the table, which proof covers it, and which of rationality, performance, selection and composition it leaves to other means. A claim stated that way can be checked, and the field gains a test it can apply to any contract whose security is a theorem.
                </p>
            </PaperSection>
        </PaperLayout>
    );
}
