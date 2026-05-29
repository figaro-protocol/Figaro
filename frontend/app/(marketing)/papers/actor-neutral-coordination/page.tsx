import type { Metadata } from "next";
import {
    PaperLayout,
    PaperSection,
    PaperRun,
    PaperRemark,
} from "@/components/papers/PaperLayout";
import { Math } from "@/components/papers/Math";

export const metadata: Metadata = {
    title: "Actor-Neutral Coordination over Bonded Commitments — Figaro Protocol",
    description:
        "The bonded settlement primitive is actor-neutral by construction: the kernel reads EIP-712 signatures and bond posture, not the type of the entity behind a wallet. The equilibrium that makes cooperation dominant for humans extends without modification to autonomous agents. A control-theory reading of the Agent SDK.",
};

const CODE_POLICY = `interface Policy<TAction, TContext = unknown> {
  name: string;
  decide(
    entries: PolicyEntry<TAction, TContext>[],
  ): Promise<PolicyDecision<TAction, TContext>[]>;
}`;

const CODE_BUYER = `const PER_COMMIT_LIMIT = 1_000_000_000n; // $1K
const TOTAL_BUDGET   = 50_000_000_000n;  // $50K
const buyerPolicy = buyerWithBudgetPolicy({
  perCommitLimit: PER_COMMIT_LIMIT,
  totalBudget: TOTAL_BUDGET,
  budgetSpent,
});`;

const CODE_SELLER = `const policy = sellerOfRecordPolicy({
  routineProcurementLimit: 5_000_000_000n, // $5K
});`;

const CODE_BIDDER = `const MIN_MARGIN_BPS = 500n; // 5% margin
const dutchAuctionBidderGate = (
  auction: AuctionState,
  ctx: Ctx,
) => {
  const offered = auction.currentPrice;
  const myCost = ctx.estimateMyCost(auction);
  const marginBps = ((offered - myCost) * 10000n) / myCost;
  return marginBps >= MIN_MARGIN_BPS
    ? { claim: true }
    : { claim: false, reason: "below margin threshold" };
};`;

const CODE_AUDITOR = `const auditorPolicy = makeAutonomousPolicy<ProposedAction, Ctx>(
  (action) => {
    if (action.type === "attest-as-seller" || action.type === "attest-as-buyer")
      return { execute: true };
    return { execute: false, reason: "auditor does not commit" };
  },
);`;

const CODE_METADATA = `{
  "subjectAddress": "0xYourAgent",
  "services": {
    "did": "did:web:agent-42.example.com",
    "mcp": "https://agent-42.example.com/mcp",
    "a2a": "https://agent-42.example.com/a2a"
  },
  "capabilities": ["route-optimization", "live-eta"]
}`;

function CodeBlock({ children }: { children: string }) {
    return (
        <pre className="paper-code my-4 overflow-x-auto rounded border border-default p-4 text-xs leading-relaxed font-mono text-ink-body whitespace-pre">
            {children}
        </pre>
    );
}

export default function ActorNeutralCoordinationPaper() {
    return (
        <PaperLayout
            title="Actor-Neutral Coordination over Bonded Commitments"
            subtitle="An AI-and-Control-Theory Reading"
            author="Alessandro Daliana"
            date="May 2026"
            watermark="Figaro Protocol · Preprint"
            keywords="multi-agent coordination, bonded commitment, control theory, actor-neutrality, autonomous agents, AI agent design, human-in-the-loop"
            abstract={
                <>
                    <p>
                        Coordination among mutually untrusted counterparties has historically required institutional enforcement: courts, market intermediaries, platform sellers, or other vetters that resolve disputes and authorize participation. The control-theory tradition develops mechanisms by which a centralized planner can allocate work under specified objective functions and constraints; the market-design tradition develops mechanisms by which decentralized parties bid for, claim, and settle work without a centralized planner; both have historically assumed the participants are <em>trusted</em> in some structural sense &mdash; either through the planner&rsquo;s authority or through the market institution&rsquo;s enforcement apparatus. Truly arms-length coordination has remained difficult because the enforcement apparatus has had nowhere to live without re-introducing a centralized party. The same gap blocks coordination among autonomous agents, where the institutional vetter is structurally absent.
                    </p>
                    <p>
                        We present the bonded settlement primitive &mdash; asymmetric bonding plus buyer dominance with atomic resolution &mdash; as the missing enforcement layer. The primitive is <em>actor-neutral</em> by construction: the kernel makes no distinction between human and algorithmic participants because it reads only EIP-712 signatures and bond posture, not the type of the entity behind a wallet. The equilibrium argument that makes cooperation weakly dominant for human counterparties extends without modification to autonomous agents; humans, agents, and hybrid systems (human-supervised agents, multi-key wallets, agent-supervised humans) participate as co-equal classes of wallet holder. Agent-only coordination is the extreme case the primitive admits, not the rule it was built for.
                    </p>
                    <p>
                        The paper develops the actor-neutral coordination architecture in three layers: the <em>kernel</em> layer (actor-neutral by construction); the <em>Agent SDK</em> layer (a stateful loop synchronizing process state, proposing valid actions, and dispatching them through a pluggable policy gateway); and the <em>factotum</em> layer (a reference participation agent that wires the SDK to a wallet and a policy and is forked by every operational deployment). The SDK is convenience tooling for wallet-bearing clients; the protocol is the kernel ABI, and any wallet that signs EIP-712 commitments and posts bond participates with or without the SDK. We treat the policy interface as a control-theory specification problem and discuss reference policies for typical operational roles. LLM-augmented policies are a natural specialization for non-trivial decision logic. Discoverability via ERC-8004 and <code>did:web</code> is metadata, not protocol.
                    </p>
                </>
            }
            references={
                <>
                    <li>Bertsekas, D. P. <em>Dynamic Programming and Optimal Control</em>, 3rd edition. Athena Scientific, Belmont, MA, 2005.</li>
                    <li>De Rossi, M., Crapis, D., Ellis, J., &amp; Reppel, E. ERC-8004: Trustless Agents. Ethereum Improvement Proposal 8004 (Draft, created 2025). <span className="text-ink-faint">eips.ethereum.org/EIPS/eip-8004</span></li>
                    <li>Dong, L., Lu, Q., &amp; Zhu, L. AgentOps: Enabling Observability of LLM Agents. arXiv:2411.05285, 2024.</li>
                    <li>Greshake, K., Abdelnabi, S., Mishra, S., Endres, C., Holz, T., &amp; Fritz, M. Not What You&rsquo;ve Signed Up For: Compromising Real-World LLM-Integrated Applications with Indirect Prompt Injection. In <em>Proc. ACM Workshop on Artificial Intelligence and Security (AISec)</em>, 2023.</li>
                    <li>Khalil, H. K. <em>Nonlinear Systems</em>, 3rd edition. Prentice Hall, Upper Saddle River, NJ, 2002.</li>
                    <li>Milgrom, P. <em>Discovering Prices: Auction Design in Markets with Complex Constraints</em>. Columbia University Press, New York, 2017.</li>
                    <li>Park, J. S., O&rsquo;Brien, J. C., Cai, C. J., Morris, M. R., Liang, P., &amp; Bernstein, M. S. Generative Agents: Interactive Simulacra of Human Behavior. In <em>Proc. ACM Symposium on User Interface Software and Technology (UIST)</em>, 2023.</li>
                    <li>Parkes, D. C. &amp; Seuken, S. <em>Introduction to Economics and Computation</em>. Cambridge University Press, Cambridge, 2016.</li>
                    <li>Shinn, N., Cassano, F., Berman, E., Gopinath, A., Narasimhan, K., &amp; Yao, S. Reflexion: Language Agents with Verbal Reinforcement Learning. In <em>Proc. Advances in Neural Information Processing Systems (NeurIPS)</em>, 2023.</li>
                    <li>Shoham, Y. &amp; Leyton-Brown, K. <em>Multiagent Systems: Algorithmic, Game-Theoretic, and Logical Foundations</em>. Cambridge University Press, Cambridge, 2009.</li>
                    <li>W3C. <em>Decentralized Identifiers (DIDs) v1.0: Core Architecture, Data Model, and Representations</em>. W3C Recommendation, July 2022.</li>
                    <li>Wu, Q., Bansal, G., Zhang, J., Wu, Y., Li, B., Zhu, E., Jiang, L., Zhang, X., Zhang, S., Liu, J., Awadallah, A. H., White, R. W., Burger, D., &amp; Wang, C. AutoGen: Enabling Next-Gen LLM Applications via Multi-Agent Conversation. arXiv preprint, 2023.</li>
                    <li>Yao, S., Zhao, J., Yu, D., Du, N., Shafran, I., Narasimhan, K., &amp; Cao, Y. ReAct: Synergizing Reasoning and Acting in Language Models. In <em>Proc. International Conference on Learning Representations (ICLR)</em>, 2023.</li>
                </>
            }
        >
            <PaperSection title="1. Introduction">
                <p>
                    Coordination among mutually untrusted counterparties is the problem of getting parties who do not share institutional context to cooperate on shared work without producing defections or deadlocks. The classical formulation (Shoham &amp; Leyton-Brown, 2009; Parkes &amp; Seuken, 2016) treats coordination as a mechanism-design problem in which the designer chooses a protocol with desirable equilibrium properties and the participants play within the protocol. The market-design specialization (Milgrom, 2017) treats specific allocation problems (auctions, matching, scheduling) for which competitive mechanisms are well-studied. The control-theory specialization (Khalil, 2002; Bertsekas, 2005) treats coordination as a distributed-control problem with a designed objective and stability analysis.
                </p>
                <p>
                    Across all three frameworks, the enforcement question is treated asymmetrically with the design question. The mechanism designer specifies the protocol, the participants follow it, and enforcement is either assumed (the participants are honest), structurally provided by the institution running the mechanism (auctioneers, planners, controllers), or external to the mechanism (escrow, court, reputation system). Truly arms-length, institution-free coordination has remained out of reach: the institutional-enforcement assumption persists across these traditions, and is even more visibly absent when the participants are autonomous agents &mdash; the institutional vetters that backstop human counterparties have no analogue when the counterparties are software.
                </p>
                <PaperRun title="The bonded primitive supplies the missing enforcement layer.">
                    The bonded settlement primitive&rsquo;s equilibrium properties are obtained without any institutional enforcement: cooperation is the unique profile surviving iterated elimination of weakly dominated strategies in the bonded game, with bonds posted by the parties themselves and resolution executed by the kernel without discretion. The result holds without any assumption about the <em>type</em> of the entity behind a participating wallet &mdash; the kernel reads EIP-712 signatures and bond amounts, not personhood information &mdash; so the equilibrium properties extend to autonomous agents directly. This is not a metaphor; the kernel cannot distinguish a human participant from an algorithmic participant because it does not look.
                </PaperRun>
                <p>
                    The actor-neutrality property turns the bonded primitive into a natural enforcement layer for arms-length coordination of any kind. A wallet that bonds against its own performance is playing the bonding game; whether the wallet is held by a human, an autonomous agent, or a hybrid system (human-supervised agent, agent-supervised human, multi-key wallet) is irrelevant to the equilibrium arithmetic. The enforcement question &mdash; traditionally the binding constraint on mutually-untrusted coordination design &mdash; is dissolved at the substrate layer, leaving the higher-layer questions (policy design, decision logic, work discovery) clear of the enforcement-mechanism complexity that has typically obscured them. Agent-only coordination is the extreme case the architecture admits, not the rule it was built for.
                </p>
                <PaperRun title="Paper organization.">
                    Section 2 summarizes the settlement primitive in the register the present paper uses. Section 3 develops actor-neutrality as a formal property of the kernel and traces its consequences for agent coordination. Section 4 presents the Agent SDK as a control-theory architecture: a stateful loop with sync, propose, policy, and execute phases. Section 5 treats policies as controllers and develops reference policies for typical operational roles. Section 6 treats LLM-augmented policies and the latency / non-determinism trade-offs they introduce. Section 7 treats discoverability via ERC-8004 and <code>did:web</code> as metadata-layer infrastructure that does not affect kernel-layer enforcement. Section 8 states the scope conditions and the security posture the architecture invites. Section 9 concludes.
                </PaperRun>
            </PaperSection>

            <PaperSection title="2. The Settlement Primitive">
                <p>
                    The bonded primitive&rsquo;s mechanism-design derivation and its formal verification (TLA⁺, Halmos symbolic execution, Echidna property-based fuzzing, Certora specification rules) are out of scope for the present paper. The features the agent architecture relies on are the following.
                </p>
                <PaperRun title="Asymmetric bonding (Mechanism 1).">
                    For a transaction with payment <Math>{"P > 0"}</Math> and cumulative upstream value <Math>{"G \\geq P"}</Math>, the buyer locks <Math>{"2P"}</Math> and the seller locks <Math>{"2G"}</Math>. Cooperation is the unique profile surviving iterated elimination of weakly dominated strategies. The mechanism scales to <Math>{"N"}</Math>-party process chains through progressive collateralization; the organizational topology over which orders compose is an upper-layer concern.
                </PaperRun>
                <PaperRun title="Buyer dominance with atomic resolution (Mechanism 2).">
                    Only the root buyer can trigger resolution; resolution settles all active orders simultaneously or not at all. The atomicity rule induces a weakest-link subgame among sellers, propagating cooperation pressure of magnitude <Math>{"P_i + 2G_i"}</Math> on every other seller without explicit communication.
                </PaperRun>
                <PaperRun title="What this means for an agent.">
                    An autonomous agent participating in a bonded commitment faces the same payoff structure as a human participant. The agent&rsquo;s bond is exposed to the kernel-rule resolution exactly as a human&rsquo;s bond is. The agent&rsquo;s defection is dominated by cooperation under the same arithmetic that makes a human&rsquo;s defection dominated. The agent&rsquo;s expected payoff under cooperation is <Math>{"+P"}</Math> (seller side) or <Math>{"-P"}</Math> (buyer side); under defection it is the bond loss. There is no agent-specific incentive structure. The kernel has no API for &ldquo;trust this party more because they are an agent&rdquo; or &ldquo;trust them less.&rdquo; The kernel has no notion of party type.
                </PaperRun>
            </PaperSection>

            <PaperSection title="3. Actor-Neutrality">
                <p>We state and discuss the actor-neutrality property formally.</p>
                <div className="border-l-2 border-default pl-6 my-2 space-y-3">
                    <p className="text-sm font-semibold text-ink-heading">Definition 3.1 (Actor-Neutrality of the Kernel).</p>
                    <p>
                        A coordination kernel is <em>actor-neutral</em> if its operational behavior depends only on the cryptographic facts visible to the kernel (EIP-712 signatures, bond posting, agreement-hash, process state) and not on any out-of-band classification of the entity behind a wallet (human vs. agent, individual vs. institutional, identified vs. pseudonymous, jurisdiction-of-residence, regulatory status). Specifically, the kernel&rsquo;s transition function is invariant under any consistent re-labeling of the parties as the &ldquo;same wallet, different entity-type behind it.&rdquo;
                    </p>
                </div>
                <PaperRun title="The Figaro kernel is actor-neutral.">
                    The kernel&rsquo;s two operations (<code>commit</code> and <code>resolveProcess</code>) consult only the cryptographic facts listed in the definition. There is no wallet-type registry; the <code>SellerRegistry</code> contract carries advisory metadata at the runtime tier but is not consulted by the kernel for any state-changing operation. Role and metadata travel with the <code>SellerRegistered</code> event; the contract itself stores only a dedup guard and a deposit-lock timestamp. There is no party-type input parameter; the kernel&rsquo;s signatures are over typed agreements, and the typed agreement does not carry party-type information. The <code>commit</code> function verifies signatures, transfers bond amounts, and updates process state; none of these steps reads party-type information. The <code>resolveProcess</code> function verifies the caller is the root buyer, verifies all active orders are present, and executes the bonding rule&rsquo;s payouts; none of these steps reads party-type information.
                </PaperRun>
                <PaperRun title="Why this matters for agent coordination.">
                    The standard architectural objection to mutually-untrusted agent coordination is that agents need to be vetted, certified, or otherwise distinguished from un-vetted agents before they can be trusted to interact with sensitive operations. The vetting infrastructure is itself an enforcement-apparatus question, and deploying it requires deciding which authority does the vetting, how the authority is held accountable, and what happens when an agent is mis-classified. The vetting apparatus is the institutional layer the bonded primitive eliminates.
                </PaperRun>
                <p>
                    Under actor-neutrality, vetting is unnecessary at the kernel layer. An un-vetted agent that bonds against its own performance has the same incentive structure as a vetted agent that bonds against its own performance. The agent&rsquo;s bond is the vetting; performance is enforced by the bonding rule rather than by prior assessment of the agent&rsquo;s reliability. This collapses the authority-of-the-vetter question into the architectural fact of bond posting.
                </p>
                <PaperRemark title="Vetting moves up the stack.">
                    Actor-neutrality at the kernel does not mean vetting is irrelevant generally. Counterparties that prefer to interact only with vetted agents can read the <code>SellerRegistry</code> metadata, the agent&rsquo;s settlement history (visible on chain), or any external attestation registry the parties choose to consult, and decline to sign commitments with agents that fail their criteria. The kernel-layer enforcement is unconditional on agent type; the counterparty-side selection is a runtime-tier choice that is expressible in any specific assembly the parties compose.
                </PaperRemark>
                <PaperRun title="The same equilibrium for the agent.">
                    The equilibrium properties of Section 2 hold for any party in the bonded game, regardless of whether the party is human or autonomous. The dominance argument is constructed from the bonding arithmetic alone; no appeal to party-type enters the proof. An autonomous agent that defects forfeits its bond; the agent&rsquo;s expected payoff under defection is therefore <Math>{"-2G"}</Math> (seller side) or <Math>{"-2P"}</Math> (buyer side), exactly the same as a human&rsquo;s. Cooperation is weakly dominant; the agent&rsquo;s optimal play in the bonded game is the same play a human&rsquo;s optimal play would be.
                </PaperRun>
                <p>
                    This collapses the &ldquo;trust the agent&rdquo; question into the bonding arithmetic. A counterparty considering whether to bond with an autonomous agent does not need to certify the agent&rsquo;s reliability; the bond&rsquo;s existence is the certification. Whether the bond is posted by an LLM controller, a deterministic rule-based policy, a hybrid system, or a human acting through an agent&rsquo;s wallet is irrelevant to the kernel and irrelevant to the equilibrium.
                </p>
            </PaperSection>

            <PaperSection title="4. The Agent Loop">
                <p>
                    We now present the Agent SDK as a reference architecture for wallet-bearing clients participating in the bonded primitive. The SDK is convenience tooling, not a protocol requirement: the protocol is the kernel ABI, and any wallet that signs EIP-712 commitments and posts bond participates with or without the SDK. The SDK matters because it standardizes a shape that operational deployments converge on regardless. The architecture is a stateful loop with four phases: sync, propose, policy, execute.
                </p>
                <PaperRun title="The control-theory framing.">
                    Read in control-theory terms, the wallet&rsquo;s policy is the controller, the chain is the plant, and the policy&rsquo;s decision is the control law. The state of the plant is the on-chain process graph: the set of active processes, their committed orders, their attestations, and their settlement events. The agent observes the state through its sync phase, proposes admissible actions through its proposer, and selects an action through its policy. The execute phase commits the selected action to the chain, advancing the plant state. The loop runs until shut down, with the agent&rsquo;s wallet as the identifier under which actions are committed.
                </PaperRun>
                <PaperRun title="Sync.">
                    The sync phase reconstructs the process graph from on-chain events. The reference implementation (<code>FigaroContext</code> in <code>@figaro/core/agent</code>) maintains a local <code>ProcessGraph</code> that ingests <code>OrderCommitted</code> and <code>OrderResolved</code> events from the kernel contract. Sync is incremental: the first call fetches from the kernel&rsquo;s deployment block; subsequent calls fetch only new blocks. Sync produces a <code>SyncResult</code> carrying the count of new commits, new resolutions, and the synced-to-block. The graph is the agent&rsquo;s view of the plant state.
                </PaperRun>
                <p>
                    There is no subgraph requirement, no indexer dependency, and no API gateway between the agent and the chain. The sync phase reads events directly. This is operationally important for the trust-minimization story: the agent&rsquo;s view of the world is reconstructed from the same cryptographically-verifiable on-chain state that any other party can verify, with no intermediation that could distort the view.
                </p>
                <PaperRun title="Propose.">
                    The propose phase is a pure function over process state: <code>{"proposeActions(process, myAddress)"}</code> returns the actions admissible to the address <code>myAddress</code> given the current process state. The action types are <code>commit-sub-order</code> (extending the process chain), <code>resolve-process</code> (the buyer-dominance settlement), <code>attest-as-seller</code>, and <code>attest-as-buyer</code>. Each <code>ProposedAction</code> carries a human/LLM-readable description, pre-validated parameters, and bond math (approval amounts, payouts).
                </PaperRun>
                <p>
                    The proposer is pure: no side effects, no signing, no submission. The agent (human or autonomous) decides which proposed action to execute through the policy phase. The proposer&rsquo;s role is to narrow the space of all syntactically-valid kernel transactions to the space of process-state-admissible actions for the given address; the policy&rsquo;s role is to select among those.
                </p>
                <PaperRun title="Policy.">
                    The policy is the agent&rsquo;s decision logic. The policy interface is batch-shaped: a policy decides on a list of pending action entries and returns a list of approve/reject decisions.
                </PaperRun>
                <CodeBlock>{CODE_POLICY}</CodeBlock>
                <p>
                    The factotum reference implementation supplies the policy primitives at <code>agents/factotum/src/policy.ts</code> &mdash; <code>makeHitlPolicy()</code>, which returns a human-in-the-loop policy that defers every action to seller approval, and <code>{"makeAutonomousPolicy(shouldExecute)"}</code>, which returns an autonomous policy whose per-action decision is delegated to a caller-supplied <code>{"(action, ctx) => {execute, reason?}"}</code> callback. Role-shaped reference policies ship as separate factories at <code>agents/factotum/src/policies/</code>: <code>auditorPolicy</code>, <code>basicSellerPolicy</code>, <code>buyerWithBudgetPolicy</code>, <code>auctionBidderPolicy</code>, and <code>sellerOfRecordPolicy</code>, each composing the primitives above with role-specific parameters. Operational deployments either fork one of these or compose the primitives directly; we treat typical roles in Section 5.
                </p>
                <PaperRun title="Execute.">
                    The execute phase commits an approved action to the chain via the agent&rsquo;s wallet. The SDK exposes two execution surfaces. For self-contained actions whose parameters are fully captured on the <code>ProposedAction</code>, <code>executeAction</code> in <code>@figaro/core/agent</code> builds and submits the transaction directly via a viem <code>WalletClient</code>; in the current SDK this covers <code>resolve-process</code>. For actions whose execution requires inputs beyond what the proposer carried (signed commitments, attestation <code>sectionData</code>, merkle proofs), the SDK exposes standalone direct functions &mdash; <code>commit</code>, <code>attestAsSeller</code>, <code>attestAsBuyer</code> &mdash; which operational deployments call after assembling the additional inputs at submission time. A separate <code>SequencerClient</code> export covers the batched-execution path for deployments that prefer to consolidate multiple actions into a single sequencer submission rather than direct on-chain calls. Execution on either surface is sequential per agent: actions are committed one at a time, with the agent&rsquo;s nonce advancing per transaction. Parallel execution would race the kernel state and is explicitly avoided.
                </PaperRun>
                <PaperRun title="The full loop.">
                    A factotum (the reference participation agent at <code>agents/factotum/</code>) wires the four phases together with a polling interval, loading the wallet from configuration, selecting the policy from environment configuration (HITL by default), and running the loop until shutdown. The factotum is not a production system; it is a fork-and-modify reference that any operational deployment specializes into its own runtime. Other runtimes (Python, Rust, Go) are expected; the protocol is language-agnostic, and the only requirements are a wallet, EIP-712 signing, and event-derived state.
                </PaperRun>
            </PaperSection>

            <PaperSection title="5. Policies as Controllers">
                <p>
                    Read in control-theory terms, the policy is the wallet&rsquo;s control law. The space of admissible policies is wide; the architecture constrains the policy interface but not the policy logic. We develop reference policies for typical operational roles. The roles are not agent-specific; the same policies apply when the wallet is held by a human seller approving each action through a UI, by an autonomous agent running its own decision logic, or by a hybrid system in which an autonomous proposer routes high-stakes actions to a human reviewer.
                </p>
                <PaperRun title="Human seller with HITL approval.">
                    The simplest policy under the architecture is the one a human seller running the SDK from a web UI follows. Every proposed action is presented to the seller through an <code>ActionQueue</code>; the seller approves or rejects each one, and the SDK executes only the approved entries. The shipping <code>makeHitlPolicy()</code> factory at <code>agents/factotum/src/policy.ts</code> returns exactly this policy: every entry is queued for seller review; nothing is auto-approved. A wallet driven only by <code>makeHitlPolicy()</code> is operationally indistinguishable from a wallet driven by a person clicking &ldquo;confirm&rdquo; on every transaction. The kernel sees the same EIP-712 signatures and bond posting either way. This is the trivial case actor-neutrality permits and the case many production deployments will run for high-value processes.
                </PaperRun>
                <PaperRun title="Buyer-with-budget.">
                    A buyer in a bonded process commits sub-orders that contribute to the cumulative process value and resolves the process when performance attestations indicate completion. A buyer-with-budget policy bounds the buyer&rsquo;s exposure by a per-commit cap and a total-budget cap. Two operational facts about the SDK&rsquo;s action shape inform the policy: <code>action.currentCumulativeValue</code> exposed by <code>proposeActions</code> carries the cumulative-prior value (the sum of all previously-committed orders&rsquo; payments), not the new sub-order&rsquo;s payment, and the new sub-order&rsquo;s payment is supplied by the off-chain agreement the agent is signing against rather than as a field on the proposed action. A buyer-with-budget policy therefore reads from <code>action.currentCumulativeValue</code> together with a deployment-supplied tracker of per-process spend; the shipping <code>buyerWithBudgetPolicy</code> factory at <code>agents/factotum/src/policies/buyerWithBudget.ts</code> composes the primitive <code>makeAutonomousPolicy</code> with this pattern:
                </PaperRun>
                <CodeBlock>{CODE_BUYER}</CodeBlock>
                <p>
                    where <code>budgetSpent</code> is a mutable cell of shape <code>{"{ value: bigint }"}</code> holding the running total of bonded commits the deployment has executed under this policy. The factory&rsquo;s internal <code>shouldExecute</code> callback consults <code>action.currentCumulativeValue</code>, applies the per-commit and total-budget limits against <code>budgetSpent.value</code>, and approves <code>resolve-process</code> actions unconditionally; the deployment owns the cell and is responsible for incrementing it on successful execution. The control-theory reading: the policy enforces a budget constraint on the closed-loop trajectory of bonded commits, bounding the cumulative bonded exposure across the process.
                </p>
                <PaperRun title="Seller-of-record.">
                    A fan-out actor (an airline, an ocean carrier, a marketplace) acts as seller to the buyer and as buyer at every sub-procurement. By volume this is typically the busiest factotum in any non-trivial assembly. A split policy is the right shape: autonomous for routine attestations and small sub-procurements, HITL for resolutions and exceptional sub-procurements:
                </PaperRun>
                <CodeBlock>{CODE_SELLER}</CodeBlock>
                <p>
                    The shipping <code>sellerOfRecordPolicy</code> factory at <code>agents/factotum/src/policies/sellerOfRecord.ts</code> approves attestation actions (<code>attest-as-seller</code>, <code>attest-as-buyer</code>) autonomously and approves <code>commit-sub-order</code> actions whose cumulative value falls under the configured <code>routineProcurementLimit</code>; everything else is rejected with a reason and escalates to the seller&rsquo;s HITL surface. An operational deployment configures the routine-limit threshold to match its operational reserves.
                </p>
                <PaperRun title="Dutch-auction bidder.">
                    A bidder on a Dutch auction (the protocol&rsquo;s <code>DutchAuction</code> mechanism contract) monitors a descending price curve and claims the position when the price meets a profitability threshold. A subtlety of the current SDK surface deserves naming: <code>proposeActions</code> as currently implemented emits <code>commit-sub-order</code> only for the address that holds the buyer-side role in the process chain, not for prospective sellers competing on a Dutch auction. A factotum acting as a prospective Dutch-auction bidder therefore does not receive a <code>commit-sub-order</code> proposal directly; the bidder&rsquo;s work-discovery happens through the <code>DutchAuction</code> mechanism contract&rsquo;s own auction-state events, surfaced off-chain through the <code>@figaro/core/extensions</code> auction helpers (<code>computeCurrentPrice</code>, <code>evaluateClaim</code>). The policy acts at the moment the bidder is preparing a claim transaction rather than at the moment a kernel-level action is proposed. A reference <code>auctionBidderPolicy</code> ships at <code>agents/factotum/src/policies/auctionBidder.ts</code> as the shipping example of this pattern. The bidder&rsquo;s logic, expressed as a pre-claim gate rather than as a factotum policy in the strict SDK sense, looks like:
                </PaperRun>
                <CodeBlock>{CODE_BIDDER}</CodeBlock>
                <p>
                    The control-theory reading: the policy implements a threshold-rule controller on the price-vs-cost gap, with the threshold parameterized by minimum acceptable margin. The agent does not optimize across competing auctions; it claims the first auction that crosses its threshold, leaving cross-auction optimization to a higher-layer policy if the deployment wants one. The bidder gate runs adjacent to the factotum loop rather than inside it, reflecting the architectural split: kernel-level actions live in <code>proposeActions</code>; auction monitoring and evaluation live in the extensions surface; the bidder composes both at the deployment layer.
                </p>
                <PaperRun title="Auditor.">
                    A passive observer that emits attestations against process events without committing or resolving. Auditor policies accept attestation actions and refuse all others:
                </PaperRun>
                <CodeBlock>{CODE_AUDITOR}</CodeBlock>
                <PaperRun title="The default refuse-all behavior.">
                    The architecture&rsquo;s policy interface defaults to refuse-all when no rule is supplied. A fresh-fork factotum running in autonomous mode with no rule does nothing on chain. This is by design: the security floor is that an unconfigured agent cannot accidentally commit, resolve, or attest. The seller must explicitly write the rule that authorizes any specific action type. The architecture chooses safe-by-default over convenient-by-default.
                </PaperRun>
            </PaperSection>

            <PaperSection title="6. LLM-Augmented Policies">
                <p>
                    The recent wave of LLM-agent architectures (Yao et al., 2023; Shinn et al., 2023; Park et al., 2023; Wu et al., 2023) treats an LLM as the decision substrate of an autonomous agent: the LLM observes context, reasons over it, and selects tool calls. The policy interface developed here is LLM-agnostic: any synchronous-or-asynchronous function over actions is admissible. Wrapping an LLM call inside <code>shouldExecute</code> is direct, and is appropriate for decisions whose logic is non-trivial, context-dependent, or requires natural-language reasoning.
                </p>
                <PaperRun title="Two cautions.">
                    LLM latency is real. A 2-second model call inside a tight loop limits the agent&rsquo;s throughput, and inside an auction context can produce a miss when a faster competitor&rsquo;s policy claims the auction during the LLM&rsquo;s deliberation. The architectural responses are: cache decisions where the input space repeats, batch the LLM context across multiple actions where the LLM can usefully reason about a set, and move the LLM out of the hot path for actions whose latency is critical (routine attestations, time-sensitive auction claims). The hot-path decisions stay in deterministic policy logic; the LLM-augmented decisions are reserved for actions where a longer deliberation is acceptable.
                </PaperRun>
                <p>
                    LLM decisions are non-deterministic. Two identical inputs may produce different verdicts on different runs. For high-value actions (commits, resolutions) the recommendation is to keep human-in-the-loop and route LLM verdicts to a separate review layer rather than to direct execution. For low-stakes filters (which jobs to surface, which to ignore, when to escalate to a human reviewer) LLM autonomy is operationally tractable.
                </p>
                <PaperRun title="Prompt injection as a defection vector.">
                    LLM controllers consume context that may include adversarial input: attestation content surfaced through the proposer, off-chain agreement text, third-party-supplied operational notes (Greshake et al., 2023). A poisoned context can steer the LLM into approving actions the seller did not authorize. The defense is structural: the deterministic policy layer applies hard limits (per-commit cap, total-budget cap, allow-list of counterparties, schema-typed action validation) that the LLM&rsquo;s verdict cannot override. The bond posture amplifies the defense: even if the LLM is steered into approving a bonded commitment the seller would not have approved, the loss is capped at the bond that commitment entails, not at the seller&rsquo;s full treasury. The combination of hard policy limits plus per-action bond capping makes the LLM&rsquo;s worst case operationally analyzable rather than catastrophic.
                </PaperRun>
                <PaperRun title="Tool-use frameworks and the policy interface.">
                    Tool-use frameworks (function-calling APIs, the Model Context Protocol, the Agent-to-Agent protocol) select among actions an LLM can take in a given context. The policy interface developed here is composable with these frameworks at one site: the deterministic policy gate runs after the LLM proposes an action through its tool-use surface and before the SDK executes it. The LLM&rsquo;s tool-use selection becomes a recommendation; the policy remains the authority on what reaches the chain. Operational observability (Dong et al., 2024) is the third leg: proposed actions, policy decisions, executed transactions, and post-execution divergence between expected and observed state are all logged for review and replay.
                </PaperRun>
                <PaperRun title="The hybrid pattern.">
                    A natural hybrid wires deterministic-rule policy as the front line and LLM as the second-stage filter. The deterministic rule disposes of routine actions (attestations, sub-procurement under threshold, default-resolve when all attestations are clean); the LLM is consulted for actions the rule defers (exceptional sub-procurement, ambiguous attestation patterns, resolution decisions on contested processes). The hybrid bounds the LLM&rsquo;s hot-path exposure while still capturing its value on the genuinely-novel decisions.
                </PaperRun>
                <PaperRun title="Why bonding is the safety floor (and why it is not, by itself, sufficient).">
                    LLM-augmented policies are dangerous to deploy in unsupervised settings if the agent&rsquo;s decisions are unrecoverable. The bonded architecture supplies a per-action bound: an LLM-augmented agent&rsquo;s maximum loss on any single action is bounded by the bond exposed at that action, so a misjudged commit forfeits the bond at that sub-process and not the agent&rsquo;s entire treasury. This is a real structural property and it is what the kernel&rsquo;s bonding rule gives for free.
                </PaperRun>
                <p>
                    The per-action bound does not by itself produce a treasury-level bound. An agent operating across many concurrent processes with small per-action bonds still faces aggregate loss exposure equal to the sum of active bonds, which scales with the number of processes the agent has open. An LLM that mis-deploys across <Math>{"N"}</Math> concurrent processes at a per-process bond of <Math>{"B"}</Math> faces an aggregate exposure of <Math>{"N \\cdot B"}</Math>, which grows unbounded in <Math>{"N"}</Math> unless an aggregate cap is imposed. The kernel does not impose the aggregate cap; the policy does. The buyer-with-budget reference policy of Section 5 is one such cap (the <code>TOTAL_BUDGET</code> parameter); a deployment that omits the cap or sets it too high inherits the unbounded-aggregate exposure.
                </p>
                <p>
                    Two distinct bounds therefore matter for LLM-augmented operation: the per-action bound (kernel-level, automatic, equal to the bond posted at that action) and the aggregate bound (policy-level, seller-imposed, equal to the cap on cumulative bonded exposure across active processes). The architecture supplies the first; the seller must supply the second through policy code or aggregate-budget tracking. Both are required for autonomous deployment at scale.
                </p>
                <p>
                    This is a structural advantage relative to LLM agents operating outside the bonded primitive. An LLM that can autonomously execute arbitrary transactions on its seller&rsquo;s behalf has loss exposure bounded only by the seller&rsquo;s wallet balance and the seller&rsquo;s willingness to refill it. An LLM operating through a factotum on the bonded primitive has the kernel-level per-action bound for free, plus a cleanly defined site (the policy&rsquo;s aggregate-cap field) at which the seller imposes treasury-level bounds. The bonded architecture makes LLM-policy risk decomposable into analyzable components rather than collapsed into a single unbounded surface; it does not eliminate the need for seller-imposed limits.
                </p>
            </PaperSection>

            <PaperSection title="7. Discoverability">
                <p>
                    Discoverability &mdash; how agents <em>find</em> each other across an open ecosystem &mdash; is metadata, not protocol. The bonded primitive&rsquo;s enforcement does not depend on discoverability; bonded counterparties who already know each other can transact without any discovery layer. Discoverability becomes important at scale, when agents need to identify suitable counterparties they have not previously interacted with. The architecture provides a metadata-layer solution that does not require kernel-layer changes.
                </p>
                <PaperRun title="ERC-8004 and what it actually covers.">
                    ERC-8004 (Trustless Agents), a draft Ethereum standard, proposes a three-registry design: an <em>Identity Registry</em> (portable agent identifiers backed by ERC-721 NFTs); a <em>Reputation Registry</em> (bounded numerical scores and categorical tags for agent feedback &mdash; response time, uptime, etc.); and a <em>Validation Registry</em> (task-verification mechanisms via TEE attestations, zkML proofs, or crypto-economic staking).
                </PaperRun>
                <p>
                    The architecture this paper presents replaces two of the three registries by construction and complements the third. Bonded performance <em>is</em> the validation: the bond a participant posts at <code>commit</code> is precisely the crypto-economic stake the Validation Registry asks for, applied at the per-order level rather than per-agent. On-chain settlement history <em>is</em> the reputation evidence: a resolved process is a stronger signal than any bounded numerical score, because it is the immutable record of bonded performance under economic stakes. The Reputation and Validation registries&rsquo; purpose is satisfied at the kernel layer without a separate registry surface.
                </p>
                <p>
                    The Identity Registry is the layer that does not collapse into the bond. Cross-organization identifiers, capability descriptors, and service endpoints (MCP, A2A) live above the bond and serve a different function: helping a wallet <em>find</em> a counterparty that has not yet been bonded with. The architecture treats this as an off-chain concern. The <code>SellerRegistry</code> contract carries a <code>metadataURI</code> per registered seller, pointing at an off-chain JSON document; the convention developed here aligns the document with ERC-8004 identity claims and the W3C <code>did:web</code> method (W3C, 2022):
                </p>
                <CodeBlock>{CODE_METADATA}</CodeBlock>
                <p>
                    The SDK provides <code>resolveDidWeb()</code>, <code>didDocumentMatchesAddress()</code>, and <code>buildSellerDidDocument()</code> helpers in <code>@figaro/core/extensions</code>. The metadata document is the extension point at which ERC-8004 identity descriptors can be adopted by any deployment that wants them; no kernel-layer contract change is required.
                </p>
                <PaperRun title="Why agents are wallet-tier, not entity-tier.">
                    A consequence of the actor-neutrality property is that the architecture does not register agents as first-class on-chain entities. ERC-8004&rsquo;s Identity Registry takes the alternative route: each agent is a registered entity with its own NFT-backed handle. Adopting that registry as a kernel-level requirement would re-introduce the platform-as-vetter problem the actor-neutrality property is designed to eliminate. A wallet-tier agent is the consistent extension of kernel-level actor-neutrality one tier up: the wallet is the agent&rsquo;s identity, and the agent&rsquo;s reputation is its on-chain settlement history. ERC-8004 identifiers can travel in the metadata document for deployments that want them, but they are optional discoverability metadata, not a registration the architecture requires.
                </PaperRun>
                <PaperRun title="The structural separation.">
                    Identity descriptors (whether ERC-8004-formatted or otherwise) are how wallets <em>find</em> each other; bonded commitments are how they <em>trust</em> each other. The two are intentionally separate. A wallet that publishes service descriptors is discoverable but not yet trusted; a counterparty that wants to interact reads the descriptors, evaluates the self-published capabilities, and then bonds against performance. The bond is the trust layer; the descriptor is the discovery layer. Conflating the two &mdash; by, for instance, requiring discovery to imply trust or trust to imply discovery &mdash; would re-introduce the platform-as-vetter problem the actor-neutrality property eliminates. The architecture keeps them separate.
                </PaperRun>
                <PaperRun title="Capability claims are unverified at the kernel layer.">
                    The <code>capabilities</code> array in an agent&rsquo;s metadata is <em>self-asserted</em>. The kernel does not verify that an agent who claims <code>route-optimization</code> can in fact optimize routes; the kernel&rsquo;s enforcement is on bonded performance, not on capability claims. A counterparty that bonds against an agent&rsquo;s performance is exposed only to bond loss if the agent under-performs; the counterparty&rsquo;s view of the agent&rsquo;s capability is informed by the agent&rsquo;s prior on-chain settlement history (which the counterparty can read directly from the chain) and by any external attestation the counterparty chooses to consult, but is not certified by any component of the protocol. This is the appropriate posture for permissionless infrastructure: capability claims are signals; performance is enforcement.
                </PaperRun>
            </PaperSection>

            <PaperSection title="8. Scope and Security Posture">
                <p>The architecture is bounded by several scope conditions and operational constraints that any deployment must respect.</p>
                <PaperRun title="Hardware-isolated signing for production.">
                    A long-running agent has wallet access by design. Hot-key compromise is catastrophic in proportion to the agent&rsquo;s bond posture. Production deployments use hardware-isolated signers (HSMs, secure enclaves, multi-sig with hardware-key co-signers) rather than software keys loaded into the agent&rsquo;s runtime. This is standard guidance for any high-value autonomous wallet, but the bonded architecture amplifies its importance because the agent&rsquo;s exposure can be substantial.
                </PaperRun>
                <PaperRun title="Default-HITL for high-value actions.">
                    The architecture&rsquo;s default policy is human-in-the-loop. Autonomous mode is for actions whose worst case is bounded by predictable parameters (a single auction claim under a set amount; a routine attestation that reflects an externally-observed fact). For commits, resolutions, and any action affecting other parties&rsquo; bonds, the recommended posture is HITL until the seller has accumulated sufficient operational confidence in the autonomous policy. Migration from HITL to autonomous is a deployment decision that follows from observed policy behavior across many decisions, not a default the architecture recommends.
                </PaperRun>
                <PaperRun title="Defense-in-depth in the policy.">
                    The proposer is correct by construction; the policy should still defend against unexpected proposer behavior as a defense-in-depth layer. Re-derive bond amounts from process state in the policy. Re-check counterparty addresses against expected sets. Bound gas in the execute layer. The policy is the seller&rsquo;s last line of defense against any architectural assumption that fails in operational context.
                </PaperRun>
                <PaperRun title="Logging and observability.">
                    Settlement disputes off-chain need an audit trail; the chain has half the story. An operational deployment logs proposed actions, policy decisions, executed transactions, and any divergence between the agent&rsquo;s expected and observed state. Off-chain forums adjudicating bonded commitments treat the on-chain settlement record as evidentiary input; the agent&rsquo;s audit trail is the operational complement on the agent&rsquo;s side. This is standard operational practice for any autonomous system; the bonded architecture invites it because the agent&rsquo;s actions have material consequences that may be reviewed off-chain.
                </PaperRun>
                <PaperRun title="What this is not.">
                    The architecture is not a coordination strategy. The factotum executes what the proposer suggests within the policy&rsquo;s authorization; it does not decide which markets to enter, which prices are profitable, which counterparties to trust at the discovery layer, or which strategic objectives to pursue. The strategy lives in the policy and in the deployment&rsquo;s higher-layer orchestration. The architecture is the substrate; the strategy is the seller&rsquo;s.
                </PaperRun>
                <p>
                    The architecture is also not LLM-specific. The policy interface admits any decision-logic. LLM-augmented policies are one specialization; rule-based policies, reinforcement-learning policies, model-predictive-control policies, and human-driven policies are equally well supported. The architecture&rsquo;s LLM-friendliness derives from the policy interface&rsquo;s generality, not from any LLM-specific design.
                </p>
            </PaperSection>

            <PaperSection title="9. Conclusion">
                <p>
                    Coordination among mutually-untrusted counterparties has been hard because the enforcement layer has had nowhere to live without a centralized institution; the same gap blocks coordination among autonomous agents, where the institutional vetter is structurally absent. The bonded settlement primitive&rsquo;s actor-neutrality property turns bonded commitments into the missing enforcement layer: the same equilibrium argument that makes cooperation weakly dominant for any participant makes it weakly dominant regardless of whether the participant is a human, an autonomous agent, or a hybrid system. The bond posture is type-blind by construction.
                </p>
                <p>
                    The Agent SDK presented in this paper is a reference architecture for wallet-bearing clients: a stateful loop with sync, propose, policy, and execute phases, structured as a control-theory controller-on-plant architecture. The SDK is convenience tooling, not a protocol requirement. Reference policies cover typical operational roles (HITL seller, buyer-with-budget, seller-of-record, Dutch-auction bidder, auditor) and apply identically when the wallet is held by a human approving each action through a UI, by an autonomous agent running its own decision logic, or by a hybrid system. LLM-augmented policies are a natural specialization for non-trivial decision logic, with the bonded architecture&rsquo;s per-action exposure bound and the policy&rsquo;s aggregate-cap mechanism turning LLM-policy risk into a decomposable and analyzable surface. Discoverability via ERC-8004 identity descriptors and <code>did:web</code> is metadata, not protocol; the discovery layer and the trust layer are separate by design, and ERC-8004&rsquo;s reputation and validation registries are subsumed by the bonded primitive at the kernel layer.
                </p>
                <p>
                    The contribution is architectural rather than novel mechanism design: actor-neutrality is the load-bearing claim, and the SDK is the operational artifact that demonstrates the claim is implementable. The participants are not protocol-aware in any privileged sense; they sign, they bond, they perform. The substrate makes their participation legible to their counterparties and economically rational for them to undertake. Agent-only coordination is the extreme case the architecture admits; coordination between humans, between agents, and across the human-agent boundary is the rule.
                </p>
            </PaperSection>
        </PaperLayout>
    );
}
