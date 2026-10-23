import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import {
    PaperLayout,
    PaperSection,
    PaperRun,
    PaperRemark,
    PaperScroll,
} from "@/components/papers/PaperLayout";
import { Math } from "@/components/papers/Math";

export const metadata: Metadata = withOg({
    title: "Actor-Neutral Coordination over Bonded Commitments — Figaro Protocol",
    description:
        "A bonded commitment reads signatures, bond amounts, and the state of one process, never the kind of entity behind a key. Its equilibrium is computed in those quantities alone, so it binds a person and an agent alike. The agent's wallet read as a controller: the bond bounds what one commit can cost, the policy bounds the rest.",
});

function FormalBlock({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="border-l-2 border-default pl-6 my-3 space-y-3">
            <p className="text-sm font-semibold text-ink-heading">{label}</p>
            {children}
        </div>
    );
}

export default function ActorNeutralCoordinationPaper() {
    return (
        <PaperLayout slug="actor-neutral-coordination"
            title="Actor-Neutral Coordination over Bonded Commitments"
            subtitle="An AI-and-Control-Theory Reading"
            author="Figaro"
            date="May 2026"
            watermark="Figaro Protocol · Preprint"
            abstract={
                <>
                    <p>
                        A bonded commitment reads two signatures, two bond amounts, and the state of one process; it reads nothing about the kind of entity that holds either key. We show that this is enough for its incentive result to carry to autonomous agents unchanged. The buyer bonds twice the payment, each seller bonds twice the cumulative value through its order, and only the buyer resolves, atomically across the process. The equilibrium is computed wholly from the tokens the mechanism moves and the value each party keeps off-chain. A transition function blind to party type therefore yields an equilibrium blind to it. Vetting becomes each party&rsquo;s choice before it signs.
                    </p>
                    <p>
                        We then read an agent&rsquo;s wallet as a controller over the chain: it observes process state, enumerates the actions open to its address, and signs only what a policy approves. The loss one approved commit can cause is bounded by the bond the mechanism pulls; aggregate exposure and every outflow outside the mechanism are bounded by the policy. Discovery, through ERC-8004 identity documents and <code>did:web</code>, is kept apart from trust, which the bond supplies.
                    </p>
                </>
            }
            references={
                <>
                    <li>Bertsekas, Dimitri P. 2005. <em>Dynamic Programming and Optimal Control</em>. Vol. 1. 3rd ed. Belmont, MA: Athena Scientific.</li>
                    <li>De Rossi, Marco, Davide Crapis, Jordan Ellis, and Erik Reppel. 2025. &ldquo;ERC-8004: Trustless Agents.&rdquo; Ethereum Improvement Proposal 8004, draft, created August 13, 2025. https://eips.ethereum.org/EIPS/eip-8004. Accessed October 18, 2026.</li>
                    <li>Figaro. 2026. &ldquo;Asymmetric Bonding and Buyer Dominance: Two Composing Mechanisms for Self-Enforcing N-Party Coordination.&rdquo; Preprint. https://figaroprotocol.com/papers/asymmetric-bonding/. Accessed October 18, 2026.</li>
                    <li>Greshake, Kai, Sahar Abdelnabi, Shailesh Mishra, Christoph Endres, Thorsten Holz, and Mario Fritz. 2023. &ldquo;Not What You&rsquo;ve Signed Up For: Compromising Real-World LLM-Integrated Applications with Indirect Prompt Injection.&rdquo; In <em>Proceedings of the 16th ACM Workshop on Artificial Intelligence and Security</em>, 79&ndash;90. Association for Computing Machinery. https://doi.org/10.1145/3605764.3623985.</li>
                    <li>Khalil, Hassan K. 2002. <em>Nonlinear Systems</em>. 3rd ed. Upper Saddle River, NJ: Prentice Hall.</li>
                    <li>Milgrom, Paul. 2017. <em>Discovering Prices: Auction Design in Markets with Complex Constraints</em>. New York: Columbia University Press. https://doi.org/10.7312/milg17598.</li>
                    <li>Park, Joon Sung, Joseph O&rsquo;Brien, Carrie Jun Cai, Meredith Ringel Morris, Percy Liang, and Michael S. Bernstein. 2023. &ldquo;Generative Agents: Interactive Simulacra of Human Behavior.&rdquo; In <em>Proceedings of the 36th Annual ACM Symposium on User Interface Software and Technology</em>, 1&ndash;22. Association for Computing Machinery. https://doi.org/10.1145/3586183.3606763.</li>
                    <li>Shinn, Noah, Federico Cassano, Ashwin Gopinath, Karthik Narasimhan, and Shunyu Yao. 2023. &ldquo;Reflexion: Language Agents with Verbal Reinforcement Learning.&rdquo; In <em>Advances in Neural Information Processing Systems 36</em>, edited by A. Oh, T. Naumann, A. Globerson, K. Saenko, M. Hardt, and S. Levine, 8634&ndash;8652. Curran Associates. https://doi.org/10.52202/075280-0377.</li>
                    <li>Shoham, Yoav, and Kevin Leyton-Brown. 2009. <em>Multiagent Systems: Algorithmic, Game-Theoretic, and Logical Foundations</em>. Cambridge: Cambridge University Press. https://doi.org/10.1017/CBO9780511811654.</li>
                    <li>W3C. 2022. <em>Decentralized Identifiers (DIDs) v1.0: Core Architecture, Data Model, and Representations</em>. W3C Recommendation, July 19, 2022. https://www.w3.org/TR/2022/REC-did-core-20220719/. Accessed October 20, 2026.</li>
                    <li>Wu, Qingyun, Gagan Bansal, Jieyu Zhang, Yiran Wu, Beibin Li, Erkang Zhu, Li Jiang, et al. 2023. &ldquo;AutoGen: Enabling Next-Gen LLM Applications via Multi-Agent Conversation.&rdquo; Preprint, arXiv:2308.08155. https://arxiv.org/abs/2308.08155.</li>
                    <li>Yao, Shunyu, Jeffrey Zhao, Dian Yu, Nan Du, Izhak Shafran, Karthik Narasimhan, and Yuan Cao. 2023. &ldquo;ReAct: Synergizing Reasoning and Acting in Language Models.&rdquo; Paper presented at the Eleventh International Conference on Learning Representations, Kigali, Rwanda, May 1&ndash;5, 2023. https://arxiv.org/abs/2210.03629.</li>
                </>
            }
        >
            <PaperSection title="1. Introduction">
                <p>
                    Let <Math>{"A"}</Math> be a wallet whose key is held by a software agent and <Math>{"H"}</Math> a wallet whose key is held by a person. <Math>{"H"}</Math> wants a piece of work that <Math>{"A"}</Math> offers, for a payment <Math>{"P"}</Math> in a token both accept. <Math>{"H"}</Math> signs a commitment naming the two addresses, the payment, the token, a deadline, and a fingerprint of the terms, and <Math>{"A"}</Math> counter-signs it. The call that reaches the chain carries those fields and two ECDSA signatures (ECDSA is the elliptic-curve signature scheme Ethereum accounts use). No field says which signer is a program.
                </p>
                <p>
                    This paper asks whether that blindness is a gap or a property. Mechanism design and market design study rules under which self-interested parties reach good outcomes, and both take the enforcement of an outcome as given (Shoham and Leyton-Brown 2009; Milgrom 2017). An auction&rsquo;s winner pays because the auctioneer collects. A controller&rsquo;s law holds because the actuators it drives obey it (Khalil 2002; Bertsekas 2005). Between strangers, that enforcement has been an institution: a court, an intermediary, a vetter that admits participants. Software agents sharpen the problem, because a program that holds a key answers to no institution that vets it.
                </p>
                <p>
                    Our claim is that a bonded commitment supplies the enforcement and is blind to party type by construction. The mechanism&rsquo;s equilibrium is computed from the tokens it moves and the value each party keeps off-chain. Neither quantity depends on who holds a key, so the result that holds between two people holds between a person and an agent, and between two agents. Vetting becomes a choice each party makes before it signs (Section 3).
                </p>
                <p>
                    Section 2 states the mechanism and the slice of its equilibrium the argument uses. Section 3 defines actor-neutrality and proves the mechanism has it. Section 4 reads an agent&rsquo;s wallet as a controller and bounds the loss its policy can cause. Section 5 separates discovery from trust, and Section 6 states the security posture the architecture asks of a deployment.
                </p>
            </PaperSection>

            <PaperSection title="2. The Mechanism">
                <PaperRun title="Objects.">
                    A <em>clause</em> is one reusable term of an agreement, written once and registered publicly for anyone to compose. An <em>agreement</em> is the clauses composed for one order; the chain holds only its merkle root (a single hash committing to every clause of the agreement). An <em>assembly</em> is a list of agreements that a designer composes into one reusable design; a seller binds it, naming it in its profile as a standing offer, and a buyer selects it. A <em>process</em> is one run of an assembly, opened by one buyer, and an <em>order</em> is one buyer&ndash;seller commitment inside it. The <em>Core</em> is four contracts: one defines the commitment each party signs, one binds what a party attests to the agreement it signed, and two hold bonds and resolve. On the <em>direct path</em> the resolution contract holds every bond and resolves a process when its buyer calls it. On the <em>batched path</em> an off-chain relay, the <em>sequencer</em>, gathers signed operations, the buyer&rsquo;s signed resolution among them. A batch verifier resolves them under one proof that the batch was executed by the Core&rsquo;s rules, and pulls each party&rsquo;s net amount when the batch resolves. The Core sees a process as a linear chain of commits extending one monotonic accumulator; which seller comes before which is agreed above it.
                </PaperRun>
                <PaperRun title="Asymmetric bonding.">
                    At commit the buyer locks <Math>{"2P"}</Math>, twice the order&rsquo;s payment <Math>{"P > 0"}</Math>, and the seller locks <Math>{"2G"}</Math>. Here <Math>{"G \\geq P"}</Math> is the cumulative value through the order: every payment the process has accumulated so far, this order&rsquo;s own included. The schedule is fixed by the two signatures, because <Math>{"G"}</Math> is a signed field the Core checks against its own accumulator. The doubling answers retention. Value passes off-chain, so a party that walks away keeps what is in its hands, and a bond equal to that value would be exactly canceled by the taking (Figaro 2026, Definition 7). The same schedule, applied at every order, carries the two-party result to a process of any length the network can resolve in one call.
                </PaperRun>
                <PaperRun title="Buyer dominance with atomic resolution.">
                    Only the buyer can resolve, and resolution is atomic: every order in the process resolves in one call, or none does. Resolution pays each seller its payment and refunds its bond, <Math>{"2G + P"}</Math> in all, and refunds the buyer&rsquo;s bond less the payment it carried. No order is paid alone. Resolution is the buyer&rsquo;s judgment and its acceptance, because the Core holds no test of performance. While any seller has not performed, each seller <Math>{"i"}</Math> that has, with payment <Math>{"P_i"}</Math> and cumulative value <Math>{"G_i"}</Math> through its order, stands exposed at <Math>{"P_i + 2G_i"}</Math>, its payment forgone and its bond locked. Each seller therefore holds a bonded interest in every other seller&rsquo;s performance, readable from the accumulator alone. Bonding is what scales the mechanism; atomic resolution coordinates the process that bonding has already secured.
                </PaperRun>
                <PaperScroll className="my-4">
                    <table className="text-sm border-collapse">
                        <thead>
                            <tr>
                                <th className="border border-default px-3 py-1.5 text-left text-ink-muted font-normal"><Math>{"(u_b, u_s)"}</Math></th>
                                <th className="border border-default px-3 py-1.5 font-semibold text-ink-heading">resolution occurs</th>
                                <th className="border border-default px-3 py-1.5 font-semibold text-ink-heading">no resolution</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr>
                                <td className="border border-default px-3 py-1.5 font-semibold text-ink-heading">performance occurs</td>
                                <td className="border border-default px-3 py-1.5"><Math>{"(0,\\; +P)"}</Math></td>
                                <td className="border border-default px-3 py-1.5"><Math>{"(-P,\\; -2G)"}</Math></td>
                            </tr>
                            <tr>
                                <td className="border border-default px-3 py-1.5 font-semibold text-ink-heading">no performance</td>
                                <td className="border border-default px-3 py-1.5"><Math>{"(-P,\\; \\leq P + G)"}</Math></td>
                                <td className="border border-default px-3 py-1.5"><Math>{"(-2P,\\; \\leq -G)"}</Math></td>
                            </tr>
                        </tbody>
                    </table>
                    <p className="text-xs text-ink-muted mt-2">The four outcomes of one order, each the pair <Math>{"(u_b, u_s)"}</Math>: the position in the Core plus the assented value of what each party holds. Rows show whether the seller ever performs, columns whether the buyer ever resolves. The seller&rsquo;s entries are bounds, because it retains at most <Math>{"G"}</Math>. The right-hand column holds open positions, which the Core has no operation to convert.</p>
                </PaperScroll>
                <PaperRun title="The equilibrium.">
                    Three comparisons on the table make cooperation the equilibrium. (a) After performance the buyer strictly prefers resolving, <Math>{"0"}</Math>, to never resolving, <Math>{"-P"}</Math>; the comparison needs no assumption about the seller. (b) Given (a), and given the buyer&rsquo;s plan to resolve once performance has occurred and not before, each seller strictly prefers performing, <Math>{"+P"}</Math>, to never performing, at most <Math>{"-G"}</Math>; the margin is <Math>{"\\Delta = P + G"}</Math>. (c) Given (b), before performance the buyer keeps the process open rather than resolve at once, which is terminal at <Math>{"-P"}</Math>. Comparisons (b) and (c) are the two parties&rsquo; best replies to one profile and hold jointly, as a fixed point; (a) is the one unconditional anchor. The comparisons are proved for the two-party order and for every order of a process chain, for any number of orders the network resolves in one call (Figaro 2026).
                </PaperRun>
                <PaperRun title="Remedies and forums.">
                    A shortfall is remedied before resolution, because resolution is terminal acceptance and nothing remains in the Core to recover after it. A failing seller can send the buyer the payment it stands to receive and make good what it holds. At resolution it is refunded its bond and paid, ending at zero, which beats <Math>{"-G"}</Math> by the whole value through its order. An arbitration forum composed into the terms, or a court, rules on the process&rsquo;s data while the process stands open. Neither can resolve in the buyer&rsquo;s place; what a ruling changes is the remedy the parties negotiate.
                </PaperRun>
                <PaperRun title="What the payoffs contain.">
                    The payoffs are the transfers the Core makes and the value each party holds; there is no cost term. An agent&rsquo;s inference, tool calls, and paid services are the operating outlay of the asset behind its wallet, which the Core neither meters nor resolves. What the Core asks of an agent is a balance that covers the bond of each commitment it signs. An agent whose balance stops covering its bonds stops being able to commit.
                </PaperRun>
            </PaperSection>

            <PaperSection title="3. Actor-Neutrality">
                <FormalBlock label="Definition 3.1 (Actor-neutrality).">
                    <p>
                        Let a <em>type assignment</em> <Math>{"\\tau"}</Math> map each wallet to the kind of entity holding its key: person or program, individual or institution, identified or pseudonymous, or of any jurisdiction or regulatory status. A coordination mechanism with transition function <Math>{"\\delta(s, x)"}</Math> over state <Math>{"s"}</Math> and input <Math>{"x"}</Math> is <em>actor-neutral</em> if <Math>{"\\delta"}</Math> is the same function under every <Math>{"\\tau"}</Math>. Two runs that differ only in <Math>{"\\tau"}</Math> then pass through the same states and make the same transfers.
                    </p>
                </FormalBlock>
                <p>
                    Neutrality is over who holds a key, not over the form of account. The Core admits as a party the address that an ECDSA signature over the typed commitment recovers to. A smart-contract account has no key of its own and cannot take a party&rsquo;s place. Any key holder can: a person, an agent, a hardware signer, or a threshold scheme whose members jointly output one signature.
                </p>
                <FormalBlock label="Proposition 3.2 (The Core is actor-neutral).">
                    <p>
                        The Core&rsquo;s transition function does not vary with the type assignment.
                    </p>
                    <p>
                        <span className="italic text-ink-muted">Proof. </span>
                        By inspection of every state-changing call of the four contracts. Commit reads the commitment&rsquo;s fields (the process it extends, the two addresses, the token, the payment, the cumulative value, the agreement&rsquo;s merkle root, a salt, and a deadline), the two signatures, the chain&rsquo;s time against the deadline, whether the same order is already committed, and the process&rsquo;s state: its buyer, its token, its accumulator, and its count of open orders. Resolution on the direct path reads the process&rsquo;s state, the full list of its open commitments, and the address sending the call, which must be the buyer&rsquo;s; on the batched path the buyer&rsquo;s signature takes the sender&rsquo;s place. An attestation reads the commitments it names, the address sending it, which must be a party to an order in the same process, and the clause&rsquo;s inclusion under the target order&rsquo;s merkle root. Resolving a batch reads the proof, the net amounts the proof fixes, and the clause registry, which it asks whether each clause the batch validated is registered. That registry is keyed on the hash of a clause&rsquo;s exact bytes, so the read concerns a clause and never a wallet. The designer-reward count a batch forwards also reads whether each seller holds a member stake; it moves no bond or payment, and its failure never stops the batch. No input is a function of <Math>{"\\tau"}</Math>: a wallet&rsquo;s role is derived from the orders it holds and is stored nowhere. So <Math>{"\\delta"}</Math> cannot vary with <Math>{"\\tau"}</Math>. &#8718;
                    </p>
                </FormalBlock>
                <FormalBlock label="Corollary 3.3 (The equilibrium is type-blind).">
                    <p>
                        Comparisons (a)&ndash;(c) of Section 2 hold under every type assignment.
                    </p>
                    <p>
                        <span className="italic text-ink-muted">Proof. </span>
                        Each comparison is between entries of the outcome table. Each entry is a Core transfer plus a retained value bounded by signed amounts, at most <Math>{"G"}</Math> for the seller. By Proposition 3.2 the transfers do not depend on <Math>{"\\tau"}</Math>, and each comparison holds for every retained value within the bound, so none depends on who holds a key. &#8718;
                    </p>
                </FormalBlock>
                <p>
                    Is this trivial, since any smart contract that reads only signatures is blind to who signs? The neutrality of the transition function is trivial; the weight is in the incentive result being stated in nothing else. A mechanism whose contract is blind, but whose enforcement rests on an outside referee, an oracle&rsquo;s report of delivery, or a reputation feed, inherits whatever those parties know and decide about who a participant is. Here each node&rsquo;s comparison uses only what the Core moves and what the signed amounts bound. Blindness of the transitions is therefore blindness of the incentives.
                </p>
                <p>
                    Is an agent a payoff maximizer at all? The equilibrium tells an agent&rsquo;s designer which play is the best reply to the other party&rsquo;s plan; it does not make an agent competent. Two features keep the requirement small. Each seller&rsquo;s decision is one comparison at one node, <Math>{"+P"}</Math> against at most <Math>{"-G"}</Math> with margin <Math>{"P + G"}</Math>, rather than an elimination over strategy profiles. And an agent that errs, rather than deviates, meets the instruments a person who errs meets: the buyer withholds resolution, the parties negotiate a remedy, and a forum may rule on the data.
                </p>
                <PaperRun title="The bond prices performance.">
                    Must an agent be vetted before it touches anything of value? Vetting is itself an enforcement institution, with its own questions: who vets, who answers for a wrong classification, who is kept out. Under Proposition 3.2 the Core&rsquo;s comparisons hold without it. An unvetted agent that bonds faces the same comparison as a vetted one, and its performance is priced by its own bond rather than by a prior judgment of its reliability.
                </PaperRun>
                <PaperRemark title="Vetting moves up the stack.">
                    A party that wants only certain counterparties can read a wallet&rsquo;s published profile, its <em>resolution history</em> (the public summary of the resolved processes it was a party to and the attestations it carries, derived from the chain&rsquo;s events at read time and stored nowhere), or any outside register it trusts, and decline to sign. That selection is the party&rsquo;s own judgment, exercised before the signatures. An assembly a designer composes can carry it as a clause the parties select, and the Core enforces the commitment either way.
                </PaperRemark>
            </PaperSection>

            <PaperSection title="4. Policies as Controllers">
                <p>
                    In control-theoretic terms an agent&rsquo;s wallet is a controller acting on a plant, the system being steered (Khalil 2002). The plant is the chain, the observation is the state of the processes the wallet is party to, and the control law is a policy. On the direct path the state is fully observable, because every commit emits the whole commitment and every resolution emits its transfers. On the batched path a wallet reads its orders from the state the sequencer publishes behind the batch verifier&rsquo;s state root: it recomputes that root from the whole published state and holds it to the root the verifier stores on chain. A wallet client closes the loop: it rebuilds the state from events, enumerates the actions open to its address, asks the policy, and signs only what the policy approves. The client is a convenience; any key that signs typed data and holds its bond&rsquo;s tokens takes part without one.
                </p>
                <PaperRun title="Actions follow from roles, and roles follow from orders.">
                    A wallet&rsquo;s role in a process is read from the orders it is party to, and the actions open to it follow. As a buyer it offers, attests, and resolves; as a seller it accepts an offer by counter-signing and attests. Every order in a process has the process&rsquo;s buyer as its buyer, so a seller that needs inputs buys them in a process of its own, in which it is the buyer and which resolves on its own. An attestation is given only by a party to an order in the process, for itself, whichever path carries it to the chain. A verifier whose word should enter a process enters as the seller of an order of its own, bonded at its link like any other seller.
                </PaperRun>
                <FormalBlock label="Definition 4.1 (Policy).">
                    <p>
                        A <em>policy</em> is a map <Math>{"\\pi(s, a) \\in \\{\\text{approve}, \\text{refuse}\\}"}</Math> from an observed state <Math>{"s"}</Math> and a proposed action <Math>{"a"}</Math>. Its floor is refusal: the empty policy refuses every action, so an unconfigured wallet cannot commit, attest, or resolve by accident.
                    </p>
                </FormalBlock>
                <PaperRun title="Roles as policies.">
                    Policies differ by the role a wallet plays and by how much judgment its principal delegates; the <em>principal</em> is the person or asset for whom the agent signs. A principal may defer every action to its own review. It may cap the payment of any single commitment and the number of open processes. It may approve routine attestations of facts the agent observes and refer exceptions to review, or keep for itself the one buyer action that is terminal, resolution. Nothing in the definition is specific to a kind of decision logic: rule-based, learned, model-predictive, and human policies are maps of the same type.
                </PaperRun>
                <PaperRun title="Language-model policies.">
                    A policy may wrap a language-model call, which suits decisions that are contextual or need reasoning over documents (Yao et al. 2023; Shinn et al. 2023; Park et al. 2023; Wu et al. 2023). Such a model can be steered by adversarial content in what it reads, a counterparty&rsquo;s documents or an attestation&rsquo;s content among them (Greshake et al. 2023). The question for a bonded deployment is what a steered decision can cost. The answer divides between the mechanism and the policy.
                </PaperRun>
                <FormalBlock label="Proposition 4.2 (Exposure decomposition).">
                    <p>
                        Let a wallet hold open commitments in processes <Math>{"k = 1, \\dots, N"}</Math>, with bond <Math>{"b_k"}</Math> in process <Math>{"k"}</Math> and <Math>{"b_k \\leq B"}</Math>. (i) The Core moves tokens out of the wallet only against commitments the wallet signed. On the direct path it does so at commit and pulls exactly that commitment&rsquo;s bond: <Math>{"2P"}</Math> as buyer, <Math>{"2G"}</Math> as seller. On the batched path it does so when the batch resolves and pulls the wallet&rsquo;s net amount: the bonds of the commitments it signed in the batch, less what the batch pays it. (ii) The wallet&rsquo;s exposure through the Core is at most <Math>{"\\sum_k b_k \\leq N \\cdot B"}</Math>. (iii) Every other outflow its key can sign, whether a transfer, an allowance to another contract, or a call outside the Core, lies outside the mechanism and is bounded only by the policy.
                    </p>
                    <p>
                        <span className="italic text-ink-muted">Proof. </span>
                        (i) On the direct path commit pulls exactly the two bonds from the two signers, and resolution only pays payments and refunds bonds. On the batched path resolving a batch pulls a wallet&rsquo;s bonds less its payouts, never more than those bonds, and pays out the rest. (ii) sums (i) over the open commitments. (iii) holds because the Core sees no other call. &#8718;
                    </p>
                </FormalBlock>
                <p>
                    The mechanism bounds what one approved commit can cost, and nothing more. As buyer, the costliest single decision is resolution: taken before performance, it leaves the buyer at <Math>{"-P"}</Math> on that order, inside the bond it already posted. The count <Math>{"N"}</Math> is the policy&rsquo;s to bound, by tracking open exposure across the wallet&rsquo;s processes and refusing a commit that would cross a ceiling the principal sets. Calls outside the Core are the policy&rsquo;s as well. A model-driven policy&rsquo;s risk is thus a sum of named terms, each owned by one layer.
                </p>
            </PaperSection>

            <PaperSection title="5. Discovery Is Separate from Trust">
                <p>
                    Discovery is how a wallet finds a counterparty it has not traded with, and the mechanism&rsquo;s enforcement does not depend on it. Two wallets that already know each other commit without any discovery layer. Discovery matters at scale, and it lives in published documents above the Core.
                </p>
                <PaperRun title="The members registry.">
                    A member is a wallet that registers a profile, with a stake, so that others can find it. The registry emits a pointer to the profile document; its own storage holds only a guard against registering one wallet twice and, for a withdrawn stake, its amount and its release time. It stores no role and no party type. Registering is how a wallet publishes, never how it qualifies, since the Core requires no registration to commit. The profile can name the wallet&rsquo;s <code>did:web</code> identifier (W3C 2022), its service endpoints, and the capabilities it claims. An endpoint may follow the Model Context Protocol (an open standard for connecting an AI application to outside tools and data) or the Agent2Agent protocol (an open standard for messages between AI agents).
                </PaperRun>
                <PaperRun title="ERC-8004.">
                    ERC-8004 (Trustless Agents), a draft Ethereum standard, proposes three registries (De Rossi et al. 2025). An Identity Registry gives each agent an ERC-721 handle that resolves to a registration file. A Reputation Registry stores client feedback as signed fixed-point values with optional tags. A Validation Registry offers hooks through which independent validators check an agent&rsquo;s work, by stake-secured re-execution, zero-knowledge proofs of model inference, or trusted-execution attestations.
                </PaperRun>
                <p>
                    A bonded order answers, for that order, the questions the second and third registries answer per agent. The performer&rsquo;s own bond prices non-performance and the buyer&rsquo;s resolution is the acceptance, so the work ERC-8004 assigns to outside validators is done inside the order by its parties. A wallet&rsquo;s resolution history is the evidence a feedback value summarizes: each entry is a process its counterparties bonded through and its buyer resolved. The Identity Registry has no counterpart in the bond, because it serves a wallet nobody has yet bonded with. Its identifiers can travel in the profile document for any deployment that wants them.
                </p>
                <p>
                    Can a wallet manufacture history by trading with itself? It can, since nothing forbids one wallet, or two wallets of one principal, from being buyer and seller of an order. Each such process costs gas and locks both bonds for its duration, and the history names the counterparties, so a reader weighs entries by who signed them. History is evidence for a counterparty&rsquo;s judgment, never a score the protocol issues.
                </p>
                <PaperRun title="Agents are wallets.">
                    The wallet is the agent&rsquo;s on-chain identity, and its history is its evidence. Making a per-agent registry a condition of trading would restore at the Core the vetting Section 3 places with each party. The capabilities an agent advertises are self-asserted, and the Core does not test them. A counterparty reads a claim against the agent&rsquo;s history and bonds against performance, not against the claim. Descriptors are how wallets find each other; bonds are how they trust each other.
                </PaperRun>
            </PaperSection>

            <PaperSection title="6. Security Posture">
                <PaperRun title="Signers.">
                    A long-running agent holds signing authority by design, so a compromised key costs up to the agent&rsquo;s open bonds and whatever else the key can move. A deployment that holds value keeps the key in a hardware signer, or in a threshold scheme that outputs one ECDSA signature, rather than in the agent&rsquo;s own runtime. Either form is a key the Core admits.
                </PaperRun>
                <PaperRun title="Human review where the action is terminal.">
                    The floor is refusal, and human review is the first policy a principal composes. Autonomy suits actions whose worst case is fixed in advance: a commitment under a set payment, an attestation of a fact the agent observed. Resolution deserves review longest, because it is terminal acceptance and no remedy reaches a resolved process. Moving an action from review to autonomy is the principal&rsquo;s judgment, made on the policy&rsquo;s observed behavior.
                </PaperRun>
                <PaperRun title="The policy reads what it signs.">
                    The commitment is EIP-712 typed data, so the policy approves the very fields the signature fixes: the payment, the cumulative value, the token, the parties, and the deadline. A policy that recomputes the bond from those fields and the process state, and checks the counterparty against an expected set, defends against any upstream component that proposed the action wrongly.
                </PaperRun>
                <PaperRun title="Logs.">
                    A forum rules on a process&rsquo;s data, which shows what was committed, attested, and resolved, and never performance itself. An agent&rsquo;s log of what was proposed to it, what its policy decided, and what it signed is the operational complement. The principal holds it and produces it when a ruling needs it.
                </PaperRun>
            </PaperSection>

            <PaperSection title="7. Conclusion">
                <p>
                    Enforcement between strangers has needed an institution because nothing else made a promise of value credible before the trade. A bonded commitment makes it credible with the parties&rsquo; own bonds, and its equilibrium is computed in quantities that never mention who holds a key. That is why one commitment binds a person, an agent, or one supervising the other, and why vetting becomes each party&rsquo;s choice of whom to sign with. What remains for an agent&rsquo;s designer is a policy, and its risk divides cleanly: the bond bounds what one commit can cost, and the policy bounds the rest. Enforcing a commitment across the line between people and programs needs no institution of its own; it needs the commitment both already sign. The architecture enforces the commitments the policy chooses. Choosing offers and counterparties, judging competence, and guarding the key remain the work of the layers above the Core, where Sections 4 to 6 place them.
                </p>
            </PaperSection>
        </PaperLayout>
    );
}
