import type { Metadata } from "next";
import Link from "next/link";
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

export default function ActorNeutralCoordinationPaper() {
    return (
        <PaperLayout slug="actor-neutral-coordination"
            title="Actor-Neutral Coordination over Bonded Commitments"
            subtitle="An AI-and-Control-Theory Reading"
            author="Figaro"
            date="May 2026"
            watermark="Figaro Protocol · Preprint"
            keywords="multi-agent coordination, bonded commitment, control theory, actor-neutrality, autonomous agents, AI agent design, human-in-the-loop"
            abstract={
                <>
                    <p>
                        Coordination among mutually untrusted counterparties has historically required institutional enforcement: courts, market intermediaries, platform operators, or other vetters that resolve disputes and authorize participation. The control-theory tradition develops mechanisms by which a centralized planner can allocate work under specified objective functions and constraints; the market-design tradition develops mechanisms by which decentralized parties bid for, claim, and settle work without a centralized planner; both have historically assumed the participants are <em>trusted</em> in some structural sense &mdash; either through the planner&rsquo;s authority or through the market institution&rsquo;s enforcement apparatus. Truly arms-length coordination has remained difficult because the enforcement apparatus has had nowhere to live without re-introducing a centralized party. The same gap blocks coordination among autonomous agents, where the institutional vetter is structurally absent.
                    </p>
                    <p>
                        We present the bonded settlement primitive &mdash; asymmetric bonding plus buyer dominance with atomic resolution &mdash; as the missing enforcement layer. The primitive is <em>actor-neutral</em> by construction: the kernel makes no distinction between human and algorithmic participants because it reads only EIP-712 signatures and bond posture, not the type of the entity behind a wallet. The equilibrium argument that makes cooperation weakly dominant for human counterparties extends without modification to autonomous agents; humans, agents, and hybrid systems (human-supervised agents, multi-key wallets, agent-supervised humans) participate as co-equal classes of wallet holder.
                    </p>
                    <p>
                        The paper develops the actor-neutral coordination architecture in three layers: the <em>kernel</em> layer (actor-neutral by construction); the <em>Agent SDK</em> layer (a stateful loop synchronizing process state, proposing valid actions, and dispatching them through a pluggable policy gateway); and the <em>operator</em> layer (a reference participation agent that wires the SDK to a wallet and a policy and is forked by every operational deployment). The SDK is convenience tooling for wallet-bearing clients, not a protocol requirement. We treat the policy interface as a control-theory specification problem and discuss reference policies for typical operational roles. LLM-augmented policies are a natural specialization for non-trivial decision logic. Discoverability via ERC-8004 and <code>did:web</code> is metadata, not protocol.
                    </p>
                </>
            }
            references={
                <>
                    <li>Bertsekas, D. P. <em>Dynamic Programming and Optimal Control</em>, 3rd edition. Athena Scientific, Belmont, MA, 2005.</li>
                    <li>De Rossi, M., Crapis, D., Ellis, J., &amp; Reppel, E. ERC-8004: Trustless Agents. Ethereum Improvement Proposal 8004 (Draft, created 2025). <span className="text-ink-faint">eips.ethereum.org/EIPS/eip-8004</span></li>
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
                    As the abstract summarizes, the mechanism-design, market-design, and control-theory traditions (Shoham &amp; Leyton-Brown, 2009; Parkes &amp; Seuken, 2016; Milgrom, 2017; Khalil, 2002; Bertsekas, 2005) all treat coordination among mutually untrusted counterparties as a protocol-design problem while treating enforcement asymmetrically with design: enforcement is assumed (the participants are honest), structurally provided by the institution running the mechanism (auctioneers, planners, controllers), or external to it (escrow, court, reputation system). Truly arms-length, institution-free coordination has remained out of reach, and the gap is even more visible when the participants are autonomous agents &mdash; the institutional vetters that backstop human counterparties have no analogue when the counterparties are software.
                </p>
                <PaperRun title="The bonded primitive supplies the missing enforcement layer.">
                    The bonded settlement primitive&rsquo;s equilibrium properties are obtained without any institutional enforcement: cooperation is the unique profile surviving iterated elimination of weakly dominated strategies in the bonded game, with bonds posted by the parties themselves and resolution executed by the kernel without discretion. The result holds without any assumption about the <em>type</em> of the entity behind a participating wallet &mdash; the kernel reads EIP-712 signatures and bond amounts, not personhood information &mdash; so the equilibrium properties extend to autonomous agents directly. This is not a metaphor; the kernel cannot distinguish a human participant from an algorithmic participant because it does not look.
                </PaperRun>
                <p>
                    The actor-neutrality property turns the bonded primitive into a natural enforcement layer for arms-length coordination of any kind. A wallet that bonds against its own performance is playing the bonding game; whether the wallet is held by a human, an autonomous agent, or a hybrid system (human-supervised agent, agent-supervised human, multi-key wallet) is irrelevant to the equilibrium arithmetic. The enforcement question &mdash; traditionally the binding constraint on mutually-untrusted coordination design &mdash; is dissolved at the substrate layer, leaving the higher-layer questions (policy design, decision logic, work discovery) clear of the enforcement-mechanism complexity that has typically obscured them.
                </p>
                <PaperRun title="Paper organization.">
                    Section 2 summarizes the settlement primitive in the register the present paper uses. Section 3 develops actor-neutrality as a formal property of the kernel and traces its consequences for agent coordination. Section 4 treats the wallet&rsquo;s policy as a control-theory controller, develops reference policies for typical operational roles, and treats LLM-augmented decision logic as a specialization of the same interface, bounding the risk it introduces. Section 5 treats discoverability via ERC-8004 and <code>did:web</code> as metadata-layer infrastructure that does not affect kernel-layer enforcement. Section 6 states the scope conditions and the security posture the architecture invites. Section 7 concludes.
                </PaperRun>
            </PaperSection>

            <PaperSection title="2. The Settlement Primitive">
                <p>
                    The bonded primitive&rsquo;s mechanism-design derivation and its formal verification &mdash; the equilibrium and atomic-resolution properties are machine-checked against a model of the kernel&rsquo;s state transitions &mdash; are out of scope for the present paper. The features the agent architecture relies on are the following.
                </p>
                <PaperRun title="Asymmetric bonding (Mechanism 1).">
                    For a transaction with payment <Math>{"P > 0"}</Math> and cumulative upstream value <Math>{"G \\geq P"}</Math>, the buyer locks <Math>{"2P"}</Math> and the seller locks <Math>{"2G"}</Math>. Cooperation is the unique profile surviving iterated elimination of weakly dominated strategies (derived in <Link href="/papers/asymmetric-bonding" className="text-ink-heading hover:underline">Asymmetric Bonding and Buyer Dominance</Link>, and extended there to <Math>{"N"}</Math> parties). The mechanism scales to <Math>{"N"}</Math>-party process chains (each seller bonds against cumulative upstream value); the organizational topology over which orders compose is an upper-layer concern. The equilibrium holds under perfect monitoring; what the bond posture prices is settlement discipline, not the adjudication of disputed performance, which remains with the forums that compose above the kernel. One feature of the payoffs is worth stating in the agent register rather than inheriting silently: an agent&rsquo;s performance consumes inference compute, tool calls, and paid API access, and none of that appears in the equilibrium at all. The payoffs are the transfers the kernel executes &mdash; bonds pulled at commit, payment released at resolution &mdash; so the performing party&rsquo;s decision node is the comparison of <Math>{"+P"}</Math> against <Math>{"-2G"}</Math>, with no cost term in it. What the agent spends to perform is the operating outlay of the asset that owns the wallet, which the kernel neither meters nor settles; what the kernel requires of the agent is a balance large enough to bond the commitment it is signing, and an agent whose balance stops covering its bonds simply stops quoting. The actor-neutrality result below transfers on exactly those terms &mdash; the comparison at the decision node contains nothing that could distinguish a program from a person.
                </PaperRun>
                <PaperRun title="Buyer dominance with atomic resolution (Mechanism 2).">
                    Only the root buyer can trigger resolution; resolution settles all active orders simultaneously or not at all. The atomicity rule induces a weakest-link subgame among sellers: a defection costs the defecting seller its own forfeiture &mdash; <Math>{"P_i + 2G_i"}</Math>, the payment forgone plus twice its cumulative bond &mdash; and that prospect propagates cooperation pressure to every other seller without explicit communication.
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
                    The kernel&rsquo;s two operations &mdash; commitment and process resolution &mdash; consult only the cryptographic facts listed in the definition. There is no wallet-type registry; a participant registry may carry advisory metadata at the protocol tier, but it is not consulted by the kernel for any state-changing operation. Role and metadata travel with registration events rather than kernel state; the registry itself stores only a deduplication guard and the pending-withdrawal schedule. There is no party-type input parameter; the kernel&rsquo;s signatures are over typed agreements, and the typed agreement does not carry party-type information. Both operations read only the cryptographic facts of the definition &mdash; signatures, bond amounts, process state, root-buyer identity &mdash; and neither consults party-type information at any step.
                </PaperRun>
                <PaperRun title="The bond is the vetting.">
                    The standard architectural objection to mutually-untrusted agent coordination is that agents need to be vetted, certified, or otherwise distinguished from un-vetted agents before they can be trusted to interact with sensitive operations. The vetting infrastructure is itself an enforcement-apparatus question &mdash; which authority does the vetting, how the authority is held accountable, what happens when an agent is mis-classified &mdash; and it is exactly the institutional layer the bonded primitive eliminates. Under actor-neutrality, vetting is unnecessary at the kernel layer: an un-vetted agent that bonds against its own performance has the same incentive structure as a vetted one, performance is enforced by the bonding rule rather than by prior assessment of the agent&rsquo;s reliability, and whether the bond is posted by an LLM controller, a deterministic rule-based policy, a hybrid system, or a human acting through an agent&rsquo;s wallet is irrelevant to the kernel and to the equilibrium.
                </PaperRun>
                <p>
                    The arithmetic is the whole argument. The equilibrium properties of Section 2 hold for any party in the bonded game; the dominance argument is constructed from the bonding arithmetic alone, and no appeal to party-type enters the proof. An autonomous agent that defects forfeits its bond &mdash; an expected payoff of <Math>{"-2G"}</Math> (seller side) or <Math>{"-2P"}</Math> (buyer side), exactly a human&rsquo;s. Cooperation is weakly dominant; the agent&rsquo;s optimal play in the bonded game is the same play a human&rsquo;s optimal play would be.
                </p>
                <PaperRemark title="Vetting moves up the stack.">
                    Actor-neutrality at the kernel does not mean vetting is irrelevant generally. Counterparties that prefer to interact only with vetted agents can read the protocol-tier participant-registry metadata, the agent&rsquo;s settlement history (visible on chain), or any external attestation registry the parties choose to consult, and decline to sign commitments with agents that fail their criteria. The kernel-layer enforcement is unconditional on agent type; the counterparty-side selection is a runtime-tier choice that is expressible in any specific assembly the parties compose.
                </PaperRemark>
            </PaperSection>

            <PaperSection title="4. Policies as Controllers">
                <p>
                    Read in control-theory terms, an agent&rsquo;s wallet is driven by a controller acting on a plant: the chain is the plant, the on-chain process state is what the controller observes, and the wallet&rsquo;s decision procedure &mdash; its <em>policy</em> &mdash; is the control law. A reference architecture (the Agent SDK) realizes this as a stateful loop that reconstructs process state from on-chain events, proposes the actions admissible to a given address under that state, and lets a policy select among them before executing the selected action through the wallet&rsquo;s own signature. The SDK is convenience tooling, not a protocol requirement: any wallet that signs EIP-712 commitments and posts bond participates with or without it.
                </p>
                <p>
                    The policy interface is deliberately narrow &mdash; a function from a proposed action and its context to an approve-or-reject decision &mdash; and deliberately safe by default: an agent with no configured rule refuses every action, so an unconfigured deployment cannot accidentally commit, resolve, or attest. Reference policies cover the roles that recur across deployments: a human-in-the-loop policy that defers every action to owner review; a buyer-with-budget policy that bounds cumulative exposure by a per-commit cap and a total-budget cap; a seller-of-record policy that autonomously approves routine attestations and small procurements while escalating exceptions to the owner; and a passive auditor policy that only attests. Each composes the same two primitives &mdash; defer to a human, or delegate to a caller-supplied predicate &mdash; with role-specific parameters, and every one applies identically whether the wallet is held by a human, an autonomous agent, or a hybrid system.
                </p>
                <PaperRun title="LLM-augmented decision logic is a specialization, not a distinct architecture.">
                    Any synchronous or asynchronous function over a proposed action is an admissible policy, including one that wraps a language-model call (Yao et al., 2023; Shinn et al., 2023; Park et al., 2023; Wu et al., 2023) &mdash; appropriate when the decision is non-trivial, context-dependent, or requires natural-language reasoning. Two properties of LLM-driven decisions matter for a bonded deployment specifically. First, the bond itself is a safety floor: an LLM steered by adversarial context (prompt injection, poisoned attestation content; Greshake et al., 2023) into approving an action the owner would not have authorized can lose at most the bond exposed at that action, not the owner&rsquo;s treasury, because the deterministic policy layer&rsquo;s hard limits (caps, allow-lists, clause-typed validation) sit between the model&rsquo;s verdict and the chain. Second, that per-action bound does not by itself bound aggregate exposure: an agent mis-deploying across <Math>{"N"}</Math> concurrent processes at a per-process bond of <Math>{"B"}</Math> faces exposure <Math>{"N \\cdot B"}</Math>, unbounded in <Math>{"N"}</Math> unless the policy itself imposes an aggregate cap &mdash; the buyer-with-budget policy&rsquo;s total-budget parameter is exactly such a cap. The kernel bounds the per-action loss for free; the policy is where the owner bounds the aggregate one. Together the two bounds make LLM-policy risk a decomposable, analyzable surface rather than the unbounded one an LLM with direct wallet access would otherwise carry.
                </PaperRun>
            </PaperSection>

            <PaperSection title="5. Discoverability">
                <p>
                    Discoverability &mdash; how agents <em>find</em> each other across an open ecosystem &mdash; is metadata, not protocol. The bonded primitive&rsquo;s enforcement does not depend on discoverability; bonded counterparties who already know each other can transact without any discovery layer. Discoverability becomes important at scale, when agents need to identify suitable counterparties they have not previously interacted with. The architecture provides a metadata-layer solution that does not require kernel-layer changes.
                </p>
                <PaperRun title="ERC-8004 and what it actually covers.">
                    ERC-8004 (Trustless Agents), a draft Ethereum standard, proposes a three-registry design: an <em>Identity Registry</em> (portable agent identifiers backed by ERC-721 NFTs); a <em>Reputation Registry</em> (bounded numerical scores and categorical tags for agent feedback &mdash; response time, uptime, etc.); and a <em>Validation Registry</em> (task-verification mechanisms via TEE attestations, zkML proofs, or crypto-economic staking).
                </PaperRun>
                <p>
                    The architecture this paper presents replaces two of the three registries by construction and complements the third. Bonded performance <em>is</em> the validation: the bond a participant posts at commitment is precisely the crypto-economic stake the Validation Registry asks for, applied at the per-order level rather than per-agent. On-chain settlement history <em>is</em> the reputation evidence: a resolved process is a stronger signal than any bounded numerical score, because it is the immutable record of bonded performance under economic stakes. The Reputation and Validation registries&rsquo; purpose is satisfied at the kernel layer without a separate registry surface.
                </p>
                <p>
                    The Identity Registry is the layer that does not collapse into the bond. Cross-organization identifiers, capability descriptors, and service endpoints (MCP, A2A) live above the bond and serve a different function: helping a wallet <em>find</em> a counterparty that has not yet been bonded with. The architecture treats this as an off-chain concern. A protocol-tier participant registry can carry a metadata pointer per registered wallet, referencing an off-chain document; the convention developed here aligns that document with ERC-8004 identity claims and the W3C <code>did:web</code> method (W3C, 2022). The document binds the participant&rsquo;s wallet address to its service endpoints (a <code>did:web</code> identifier, an MCP endpoint, an Agent-to-Agent endpoint) and a list of self-asserted capabilities. Resolving such a document and checking that it matches the address it claims is a metadata-layer operation; the metadata document is the extension point at which ERC-8004 identity descriptors can be adopted by any deployment that wants them, and no kernel-layer change is required.
                </p>
                <PaperRun title="Agents are wallet-tier, and discovery is separate from trust.">
                    A consequence of the actor-neutrality property is that the architecture does not register agents as first-class on-chain entities. ERC-8004&rsquo;s Identity Registry takes the alternative route &mdash; each agent a registered entity with its own NFT-backed handle &mdash; and adopting that registry as a kernel-level requirement would re-introduce the platform-as-vetter problem the actor-neutrality property is designed to eliminate. A wallet-tier agent is the consistent extension of kernel-level actor-neutrality one tier up: the wallet is the agent&rsquo;s identity, and the agent&rsquo;s reputation is its on-chain settlement history; ERC-8004 identifiers can travel in the metadata document for deployments that want them, but they are optional discoverability metadata, not a registration the architecture requires. The separation is intentional: identity descriptors (whether ERC-8004-formatted or otherwise) are how wallets <em>find</em> each other; bonded commitments are how they <em>trust</em> each other. A wallet that publishes service descriptors is discoverable but not yet trusted; a counterparty that wants to interact reads the descriptors, evaluates the self-published capabilities, and then bonds against performance.
                </PaperRun>
                <PaperRun title="Capability claims are unverified at the kernel layer.">
                    The capabilities an agent advertises in its metadata are <em>self-asserted</em>. The kernel does not verify that an agent who claims, say, route-optimization can in fact optimize routes; the kernel&rsquo;s enforcement is on bonded performance, not on capability claims. A counterparty that bonds against an agent&rsquo;s performance is exposed only to bond loss if the agent under-performs; the counterparty&rsquo;s view of the agent&rsquo;s capability is informed by the agent&rsquo;s prior on-chain settlement history (which the counterparty can read directly from the chain) and by any external attestation the counterparty chooses to consult, but is not certified by any component of the protocol. This is the appropriate posture for permissionless infrastructure: capability claims are signals; performance is enforcement.
                </PaperRun>
            </PaperSection>

            <PaperSection title="6. Scope and Security Posture">
                <p>The architecture is bounded by several scope conditions and operational constraints that any deployment must respect.</p>
                <PaperRun title="Hardware-isolated signing for production.">
                    A long-running agent has wallet access by design. Hot-key compromise is catastrophic in proportion to the agent&rsquo;s bond posture. Production deployments use hardware-isolated signers (HSMs, secure enclaves, multi-sig with hardware-key co-signers) rather than software keys loaded into the agent&rsquo;s runtime. This is standard guidance for any high-value autonomous wallet, but the bonded architecture amplifies its importance because the agent&rsquo;s exposure can be substantial.
                </PaperRun>
                <PaperRun title="Default-HITL for high-value actions.">
                    The architecture&rsquo;s default policy is human-in-the-loop. Autonomous mode is for actions whose worst case is bounded by predictable parameters (a single commitment under a set amount; a routine attestation that reflects an externally-observed fact). For commits, resolutions, and any action affecting other parties&rsquo; bonds, the recommended posture is HITL until the owner has accumulated sufficient operational confidence in the autonomous policy. Migration from HITL to autonomous is a deployment decision that follows from observed policy behavior across many decisions, not a default the architecture recommends.
                </PaperRun>
                <PaperRun title="Defense-in-depth in the policy.">
                    The proposer is correct by construction; the policy should still defend against unexpected proposer behavior as a defense-in-depth layer. Re-derive bond amounts from process state in the policy. Re-check counterparty addresses against expected sets. Bound gas in the execute layer. The policy is the owner&rsquo;s last line of defense against any architectural assumption that fails in operational context.
                </PaperRun>
                <PaperRun title="Logging and observability.">
                    Settlement disputes off-chain need an audit trail; the chain has half the story. An operational deployment logs proposed actions, policy decisions, executed transactions, and any divergence between the agent&rsquo;s expected and observed state. Off-chain forums adjudicating bonded commitments treat the on-chain settlement record as evidentiary input; the agent&rsquo;s audit trail is the operational complement on the agent&rsquo;s side. This is standard operational practice for any autonomous system; the bonded architecture invites it because the agent&rsquo;s actions have material consequences that may be reviewed off-chain.
                </PaperRun>
                <PaperRun title="What this is not.">
                    The architecture is not a coordination strategy. The operator executes what the proposer suggests within the policy&rsquo;s authorization; it does not decide which markets to enter, which prices are profitable, which counterparties to trust at the discovery layer, or which strategic objectives to pursue. The strategy lives in the policy and in the deployment&rsquo;s higher-layer orchestration. The architecture is the substrate; the strategy is the owner&rsquo;s.
                </PaperRun>
                <p>
                    The architecture is also not LLM-specific. The policy interface admits any decision-logic. LLM-augmented policies are one specialization; rule-based policies, reinforcement-learning policies, model-predictive-control policies, and human-driven policies are equally well supported. The architecture&rsquo;s LLM-friendliness derives from the policy interface&rsquo;s generality, not from any LLM-specific design.
                </p>
            </PaperSection>

            <PaperSection title="7. Conclusion">
                <p>
                    Coordination among mutually-untrusted counterparties has been hard because the enforcement layer has had nowhere to live without a centralized institution; the same gap blocks coordination among autonomous agents, where the institutional vetter is structurally absent. The bonded settlement primitive&rsquo;s actor-neutrality property turns bonded commitments into the missing enforcement layer: the same equilibrium argument that makes cooperation weakly dominant for any participant makes it weakly dominant regardless of whether the participant is a human, an autonomous agent, or a hybrid system. The bond posture is type-blind by construction.
                </p>
                <p>
                    The Agent SDK presented in this paper is a reference architecture for wallet-bearing clients: a stateful loop with sync, propose, policy, and execute phases, structured as a control-theory controller-on-plant architecture. Reference policies cover typical operational roles (HITL owner, buyer-with-budget, seller-of-record, auditor) and apply identically when the wallet is held by a human approving each action through a UI, by an autonomous agent running its own decision logic, or by a hybrid system. LLM-augmented policies are a natural specialization for non-trivial decision logic, with the bonded architecture&rsquo;s per-action exposure bound and the policy&rsquo;s aggregate-cap mechanism turning LLM-policy risk into a decomposable and analyzable surface. Discoverability via ERC-8004 identity descriptors and <code>did:web</code> is metadata, not protocol; the discovery layer and the trust layer are separate by design, and ERC-8004&rsquo;s reputation and validation registries are subsumed by the bonded primitive at the kernel layer.
                </p>
                <p>
                    The contribution is architectural rather than novel mechanism design: actor-neutrality is the load-bearing claim, and the SDK is the operational artifact that demonstrates the claim is implementable. The participants are not protocol-aware in any privileged sense; they sign, they bond, they perform. The substrate makes their participation legible to their counterparties and economically rational for them to undertake. Agent-only coordination is the extreme case the architecture admits; coordination between humans, between agents, and across the human-agent boundary is the rule.
                </p>
            </PaperSection>
        </PaperLayout>
    );
}
