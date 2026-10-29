import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import { PaperLayout, PaperSection, PaperRun } from "@/components/papers/PaperLayout";
import { Math } from "@/components/papers/Math";

export const metadata: Metadata = withOg({
    title: "What a Trust Layer for Agents Acting for Principals Needs — Figaro Protocol",
    description:
        "An agent acting for a principal needs, from a counterparty it has never met, a promise good before the work and a ceiling on what one commitment can cost. A reputation registry supplies a signal about the past that no one bonds; a validator's stake secures a report on finished work; a legal wrapper supplies a remedy after the breach. A bond locked at commit supplies the promise, the agent's own bond caps one commitment's cost, and the agent's policy bounds the rest.",
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
            title="What a Trust Layer for Agents Acting for Principals Needs"
            subtitle="Why a Bond Locked at Commit Supplies It, and Neither a Reputation Registry nor a Legal Wrapper Does"
            author="Figaro"
            date="May 2026"
            watermark="Figaro Protocol · Preprint"
            abstract={
                <>
                    <p>
                        An agent that acts for a principal commits the principal&rsquo;s tokens to counterparties it has never met. The principal needs two things of a <em>trust layer</em>, what lets a party commit value to a stranger: enforcement in place before the work, and a ceiling, fixed when the agent signs, on what one commitment can cost. We argue that a reputation registry, one of the trust models ERC-8004 proposes for agents, supplies neither. Its signal is a statement about past conduct by raters who lock nothing against it, and it binds a counterparty only through the value of future dealing under one identity, which a counterparty willing to defect discards with its key. A validator&rsquo;s stake secures a report on work already done. A legal wrapper, an entity whose governance is wired to smart contracts, gives the counterparty a liability: a remedy after the breach.
                    </p>
                    <p>
                        A bond locked at commit supplies both. The counterparty&rsquo;s bond makes its performance its strict best reply before the work when its co-sellers perform, and the mechanism moves no more of the principal&rsquo;s tokens on one commitment than the bond the agent itself locked; neither bond compensates anyone. The buyer locks twice the payment and each seller twice the cumulative value through its order: the deeper the link, the more of the process&rsquo;s value rides on its performance, the most a holdout there could keep. Only the buyer resolves, atomically, and any key that signs and locks its bond is a party, so the proved equilibrium binds an agent as it binds a person. The bound over many commitments is the agent&rsquo;s policy. Reputation keeps its role in choosing counterparties, and a wrapper its role in recourse; enforcement before the work is the bond&rsquo;s.
                    </p>
                </>
            }
            references={
                <>
                    <li>Bertsekas, Dimitri P. 2017. <em>Dynamic Programming and Optimal Control</em>. Vol. 1. 4th ed. Belmont, MA: Athena Scientific.</li>
                    <li>Chan, Alan, Kevin Wei, Sihao Huang, Nitarshan Rajkumar, Elija Perrier, Seth Lazar, Gillian K. Hadfield, and Markus Anderljung. 2025. &ldquo;Infrastructure for AI Agents.&rdquo; Preprint, arXiv:2501.10114. Accepted to <em>Transactions on Machine Learning Research</em>. https://arxiv.org/abs/2501.10114. Accessed October 28, 2026.</li>
                    <li>COALA (Coalition of Automated Legal Applications). 2021. <em>Model Law for Decentralized Autonomous Organizations (DAOs)</em>. Contributors Constance Choi, Primavera De Filippi, Rick Dudley, Silke Noa Elrifai, Fatemeh Fannizadeh, Florence Guillaume, Andrea Leiter, Morshed Mannan, Greg McMullen, Sven Riva, and Ori Shimony. https://coala.global/wp-content/uploads/2021/06/DAO-Model-Law.pdf. Accessed October 28, 2026.</li>
                    <li>De Rossi, Marco, Davide Crapis, Jordan Ellis, and Erik Reppel. 2025. &ldquo;ERC-8004: Trustless Agents.&rdquo; Ethereum Improvement Proposal 8004, draft, created August 13, 2025. https://eips.ethereum.org/EIPS/eip-8004. Accessed October 28, 2026.</li>
                    <li>Douceur, John R. 2002. &ldquo;The Sybil Attack.&rdquo; In <em>Peer-to-Peer Systems: First International Workshop, IPTPS 2002</em>, edited by Peter Druschel, Frans Kaashoek, and Antony Rowstron, 251&ndash;60. Lecture Notes in Computer Science 2429. Berlin: Springer. https://doi.org/10.1007/3-540-45748-8_24.</li>
                    <li>Figaro. 2026. &ldquo;Asymmetric Bonding and Buyer Dominance: Two Composing Mechanisms for N-Party Coordination Among Strangers.&rdquo; Preprint. https://figaroprotocol.com/papers/asymmetric-bonding/. Accessed October 28, 2026.</li>
                    <li>Friedman, Eric J., and Paul Resnick. 2001. &ldquo;The Social Cost of Cheap Pseudonyms.&rdquo; <em>Journal of Economics &amp; Management Strategy</em> 10 (2): 173&ndash;99. https://doi.org/10.1111/j.1430-9134.2001.00173.x.</li>
                    <li>Greshake, Kai, Sahar Abdelnabi, Shailesh Mishra, Christoph Endres, Thorsten Holz, and Mario Fritz. 2023. &ldquo;Not What You&rsquo;ve Signed Up For: Compromising Real-World LLM-Integrated Applications with Indirect Prompt Injection.&rdquo; In <em>Proceedings of the 16th ACM Workshop on Artificial Intelligence and Security</em>, 79&ndash;90. New York: Association for Computing Machinery. https://doi.org/10.1145/3605764.3623985.</li>
                    <li>Jensen, Michael C., and William H. Meckling. 1976. &ldquo;Theory of the Firm: Managerial Behavior, Agency Costs and Ownership Structure.&rdquo; <em>Journal of Financial Economics</em> 3 (4): 305&ndash;60. https://doi.org/10.1016/0304-405X(76)90026-X.</li>
                    <li>Klein, Benjamin, and Keith B. Leffler. 1981. &ldquo;The Role of Market Forces in Assuring Contractual Performance.&rdquo; <em>Journal of Political Economy</em> 89 (4): 615&ndash;41. https://doi.org/10.1086/260996.</li>
                    <li>Kolt, Noam. 2025. &ldquo;Governing AI Agents.&rdquo; Preprint, arXiv:2501.07913. Forthcoming in <em>Notre Dame Law Review</em> 101. https://arxiv.org/abs/2501.07913. Accessed October 28, 2026.</li>
                    <li>Metagov. n.d. &ldquo;About Metagov.&rdquo; https://metagov.org. Accessed October 28, 2026.</li>
                    <li>Resnick, Paul, Ko Kuwabara, Richard Zeckhauser, and Eric Friedman. 2000. &ldquo;Reputation Systems.&rdquo; <em>Communications of the ACM</em> 43 (12): 45&ndash;48. https://doi.org/10.1145/355112.355122.</li>
                    <li>Shapiro, Gabriel. 2024. &ldquo;The MetaLeX Vision Paper v2.0.&rdquo; <em>MetaLeX</em> (Substack), March 11, 2024. https://metalex.substack.com/p/the-metalex-whitepaper. Accessed October 28, 2026.</li>
                    <li>South, Tobin, Samuele Marro, Thomas Hardjono, Robert Mahari, Cedric Deslandes Whitney, Dazza Greenwood, Alan Chan, and Alex Pentland. 2025. &ldquo;Authenticated Delegation and Authorized AI Agents.&rdquo; Preprint, arXiv:2501.09674. https://arxiv.org/abs/2501.09674. Accessed October 28, 2026.</li>
                    <li>Tan, Joshua, Isaac Patka, Ido Gershtein, Eyal Eithcowich, Michael Zargham, and Sam Furter. 2022. &ldquo;ERC-4824: Common Interfaces for DAOs.&rdquo; Ethereum Improvement Proposal 4824, in review, created February 17, 2022. https://eips.ethereum.org/EIPS/eip-4824. Accessed October 28, 2026.</li>
                    <li>W3C. 2022. <em>Decentralized Identifiers (DIDs) v1.0: Core Architecture, Data Model, and Representations</em>. W3C Recommendation, July 19, 2022. https://www.w3.org/TR/2022/REC-did-core-20220719/. Accessed October 28, 2026.</li>
                    <li>Yao, Shunyu, Jeffrey Zhao, Dian Yu, Nan Du, Izhak Shafran, Karthik Narasimhan, and Yuan Cao. 2023. &ldquo;ReAct: Synergizing Reasoning and Acting in Language Models.&rdquo; Paper presented at the Eleventh International Conference on Learning Representations, Kigali, Rwanda, May 1&ndash;5, 2023. arXiv:2210.03629. https://arxiv.org/abs/2210.03629. Accessed October 28, 2026.</li>
                </>
            }
        >
            <PaperSection title="1. Introduction">
                <p>
                    Let <Math>{"H"}</Math> be a principal, a person or an organization, who has given a software agent <Math>{"A"}</Math> a key to a wallet that holds <Math>{"H"}</Math>&rsquo;s tokens, and one task: buy the translation of a contract, for a payment <Math>{"P"}</Math>, from whichever provider quotes best. The provider <Math>{"A"}</Math> finds is another agent, <Math>{"C"}</Math>, whose key <Math>{"A"}</Math> has never seen and whose principal it cannot name. <Math>{"A"}</Math> must decide, before any work is done, whether to commit <Math>{"H"}</Math>&rsquo;s tokens to <Math>{"C"}</Math>. Whatever it decides, <Math>{"H"}</Math> bears the outcome, and no court that <Math>{"H"}</Math> can reach reaches <Math>{"C"}</Math>.
                </p>
                <p>
                    That is the setting of this paper. Software agents navigate the web, buy goods, and carry out tasks for the people and organizations they act for (Chan et al. 2025; Kolt 2025), and they meet counterparties across organizational boundaries without prior trust (De Rossi et al. 2025). Two relationships meet in each such trade. The first, between <Math>{"H"}</Math> and <Math>{"A"}</Math>, is the agency relationship of economics: a principal delegates decision authority to an agent who acts on its behalf (Jensen and Meckling 1976), and its problems of information, discretion, and loyalty carry to AI agents (Kolt 2025). Work on agent infrastructure attributes an agent&rsquo;s actions to its principal and scopes its authority (Chan et al. 2025; South et al. 2025). The second relationship, between <Math>{"A"}</Math> and the stranger <Math>{"C"}</Math>, is the one this paper addresses.
                </p>
                <p>
                    The answer proposed for it is a reputation registry. ERC-8004 (Trustless Agents) proposes three registries for agents (De Rossi et al. 2025). An identity registry resolves an agent&rsquo;s handle to a registration file. A reputation registry keeps the feedback a client posts on an agent, as a signed fixed-point value with optional tags. A validation registry keeps the responses of independent validators to requests to check an agent&rsquo;s work, among them stake-secured re-execution. The reputation registry continues a long line of systems that let strangers trust each other through a public history of past dealings (Resnick et al. 2000).
                </p>
                <p>
                    A second family of projects puts a legal wrapper around the autonomous system instead. MetaLeX&rsquo;s BORG (cybernetic organization) is a traditional entity that legally mandates smart contracts and AI for some or all of its operations and governance (Shapiro 2024). The DAO Model Law of the Coalition of Automated Legal Applications gives a DAO legal personality and its members limited liability (COALA 2021). A neighboring line, Metagov&rsquo;s, builds governance tooling and standards for online organizations (Metagov n.d.), among them a common interface that publishes a DAO&rsquo;s members, proposals, and governing documents (Tan et al. 2022). A wrapper gives a legal person to the autonomous system, one that a court or an arbitrator can rule against, and so gives a principal on the other side a party to sue.
                </p>
                <p>
                    Our claim is that neither a reputation registry nor a legal wrapper supplies what a delegated agent needs, and a bond locked at commit does. An agent acting for a principal needs, from a counterparty it has never met, a promise that is good before the work and bounded in what it can cost the principal. A reputation registry supplies a signal about the past, which the counterparty does not bond and the principal cannot enforce. A validator&rsquo;s stake secures a report on work already done, not the performance still to come. A legal wrapper makes the promise good after the fact, by law, which is recourse after a breach rather than enforcement before the work. A bond locked at commit supplies the promise itself, and the agent&rsquo;s own bond bounds what one commitment can cost the principal, while the bound over many commitments is the agent&rsquo;s own policy.
                </p>
                <p>
                    Section 2 states the bonded mechanism and the neutrality the argument takes from it. Section 3 states what a delegated commitment needs and proves the claim (Proposition 3.1). Section 4 reads the agent&rsquo;s wallet as a controller and places the aggregate bound with its policy (Proposition 4.1). Section 5 separates discovery from trust, and Section 6 states the security posture the argument asks of a deployment.
                </p>
            </PaperSection>

            <PaperSection title="2. The Mechanism and Its Neutrality">
                <p>
                    A process is a sequence of orders under one buyer, each order a commitment that its buyer and its seller both sign (Figaro 2026, Definitions 1&ndash;5). At commit each party locks the bond that makes its cooperation the other&rsquo;s to count on: the buyer <Math>{"2P"}</Math>, twice the order&rsquo;s payment <Math>{"P > 0"}</Math>, and the seller <Math>{"2G"}</Math>, twice the cumulative value <Math>{"G \\geq P"}</Math> through its order, this order&rsquo;s payment included. The deeper the order, the more its bond deters. Only the buyer resolves, and resolution is atomic: every order of the process at once, each seller paid its payment and refunded its bond, the buyer refunded its bond less the payments it carried. Performance stays off-chain and the mechanism holds no test of it, so the buyer&rsquo;s resolution is its acceptance; a shortfall is remedied between the parties before resolution, and a forum may rule on the process&rsquo;s public data while the process stands open. Over these transfers, cooperation is the equilibrium at every order of a process chain of any length (Figaro 2026, Theorems 1 and 3). After performance the buyer strictly prefers resolving, at <Math>{"0"}</Math>, to withholding, at <Math>{"-P"}</Math>. Given the buyer&rsquo;s plan to resolve once performance has occurred, each seller strictly prefers performing, at <Math>{"+P"}</Math>, to holding out, at most <Math>{"-G"}</Math> even when it keeps everything in its hands: a margin of <Math>{"P + G"}</Math>.
                </p>
                <p>
                    The mechanism admits as a party any key that signs the commitment and locks its bond, and it reads nothing of who or what holds the key (Figaro 2026, Standing Assumptions, Entry). A key may be held by a person, by one machine, or split among several holders that sign jointly; what holds it is invisible to the mechanism, and a party&rsquo;s role is read from the orders its key has signed. Every comparison of the equilibrium is between transfers the mechanism makes and values bounded by signed amounts, so the equilibrium that binds a person binds an agent unchanged. Is that trivial? For the transitions it is. What it buys is that the incentive result is stated in nothing else, so no referee, oracle, or reputation feed stands between an agent&rsquo;s signature and the comparison that governs it. This neutrality is a premise of the argument below, not its result.
                </p>
            </PaperSection>

            <PaperSection title="3. A Registry Supplies a Signal and a Wrapper a Remedy; a Bond Supplies the Promise">
                <FormalBlock label="Definition 3.1 (Delegated commitment and its two requirements).">
                    <p>
                        A <em>principal</em> is a party whose tokens an agent commits, and an <em>agent</em> is a key holder that signs commitments for a principal under a policy the principal sets (Definition 4.1). A <em>delegated commitment</em> is a commitment the agent signs over the principal&rsquo;s tokens with a <em>stranger</em>, a counterparty with which neither has dealt. The principal requires two things of it. (R1) <em>Enforcement before the fact</em>: when the agent signs, the stranger&rsquo;s performance on this commitment is already its strict best reply, on no condition the agent cannot check at signing. (R2) <em>A bounded loss</em>: when the agent signs, the tokens the commitment can take from the principal&rsquo;s wallet have a ceiling that the policy computes from the commitment&rsquo;s own fields.
                    </p>
                    <p>
                        A <em>reputation registry</em> is a public list of statements that parties post about an agent&rsquo;s past conduct, readable by anyone and holding none of the rated agent&rsquo;s tokens. A <em>validator&rsquo;s stake</em> is value a third party locks behind its report that an agent&rsquo;s work, once done, was done correctly. A <em>legal wrapper</em> is a legal entity whose governance is wired to smart contracts, so that the system acting through it has a person in law that can sue and be sued. ERC-8004&rsquo;s reputation and validation registries and MetaLeX&rsquo;s BORG are the instances this paper tests (De Rossi et al. 2025; Shapiro 2024).
                    </p>
                </FormalBlock>
                <FormalBlock label="Proposition 3.1 (What a trust layer for delegated agents needs).">
                    <p>
                        Under a reputation registry, a delegated commitment meets neither requirement: the stranger&rsquo;s performance is its best reply only when the value of its future dealing under its identity exceeds what it gains by defecting, a condition the registry neither fixes nor lets the principal enforce, and the principal&rsquo;s loss on a default is whatever it advanced. A validator&rsquo;s stake does not change either answer, because it secures a report about work already done, and a legal wrapper does not, because its liability is made good by a forum after the breach. Under the bonded mechanism a delegated commitment meets both, with the agent on either side of the order: the stranger&rsquo;s bond makes its performance as seller, or its resolution after performance as buyer, its strict best reply before the work, and the tokens the mechanism can move out of the agent&rsquo;s wallet on the commitment are at most the bond the agent itself locked.
                    </p>
                </FormalBlock>
                <PaperRun title="Premises.">
                    The argument uses seven.
                </PaperRun>
                <ol className="space-y-2 list-decimal pl-6 text-sm">
                    <li><strong>The principal bears the agent&rsquo;s commitments, and cannot reach the stranger.</strong> The agent&rsquo;s key commits the principal&rsquo;s tokens, so every transfer from the wallet falls on the principal; this is the agency relationship, decision authority delegated to an agent acting on the principal&rsquo;s behalf (Jensen and Meckling 1976; Kolt 2025). The principal and the stranger are beyond each other&rsquo;s coercive reach, and no forum reaches both (stipulated, as in Figaro 2026, Standing Assumptions, Remoteness).</li>
                    <li><strong>A reputation signal is a statement about past conduct, produced by parties who do not bond it.</strong> Under ERC-8004 any client address other than the agent&rsquo;s owner or operator may post feedback; the registry keeps the value and its tags, and the standard locks no token of the rater or of the rated agent against it. The standard states that &ldquo;Sybil attacks are possible, inflating the reputation of fake agents&rdquo; (De Rossi et al. 2025, Security Considerations).</li>
                    <li><strong>A history of past conduct deters defection only through the value of future dealing under the same identity.</strong> A party performs when the stream of future trade it would forfeit exceeds what it gains by defecting now (Klein and Leffler 1981). Where a new identity costs nothing, a party sheds a bad history at no cost, and no equilibrium sustains much more cooperation than one in which newcomers are mistrusted (Friedman and Resnick 2001).</li>
                    <li><strong>A validator&rsquo;s stake secures the validator&rsquo;s report about work already done.</strong> Under ERC-8004 an agent requests validation of its work, and a validator contract responds, by stake-secured re-execution among other methods; the standard leaves &ldquo;validator incentives and slashing&rdquo; to &ldquo;specific validation protocols&rdquo; (De Rossi et al. 2025, Validation Registry and Security Considerations). What the stake stands behind is the validator&rsquo;s response, given after the work. The standard&rsquo;s third trust model, a trusted-execution attestation (a hardware enclave&rsquo;s signed statement of the computation it ran), is likewise a report on work already done (De Rossi et al. 2025, Abstract and Security Considerations).</li>
                    <li><strong>A legal wrapper supplies standing and liability, enforced after the fact.</strong> BORGs are &ldquo;traditional entities (corporations, LLCs, foundations and the like) that legally mandate the use of autonomous technologies such as smart contracts and AI to conduct some or all of their operations and governance,&rdquo; and where an entity&rsquo;s liabilities arise from off-chain contracts, &ldquo;the company and its members rely on the wet contract and TradLaw enforcement&rdquo; (Shapiro 2024). Under the DAO Model Law, members forfeit limited liability for fraud or for failing to comply with binding arbitral awards or court orders (COALA 2021, Chapter 3). What the wrapper adds is a party a forum can rule against and an enforcement that follows the ruling.</li>
                    <li><strong>The bonded mechanism admits any key and makes cooperation its equilibrium.</strong> A party is any key that signs the commitment and locks its bond, and the mechanism reads nothing of who or what holds the key. After performance the buyer strictly prefers resolving; given that plan, each seller strictly prefers performing, by a margin of <Math>{"P + G"}</Math> at any retention up to <Math>{"G"}</Math> (Figaro 2026, Standing Assumptions, Entry; Theorems 1 and 3).</li>
                    <li><strong>Under the bonded mechanism, the tokens one commitment can move out of a wallet are at most that wallet&rsquo;s own bond, and neither bond compensates.</strong> The mechanism moves a party&rsquo;s tokens only against a commitment that party signed, and never more than the bond it locked: the buyer&rsquo;s <Math>{"2P"}</Math>, which carries the payment, or the seller&rsquo;s <Math>{"2G"}</Math>. Resolution pays payments and refunds bonds; a bond of a party that defaults stays locked and is never paid to the other side (Figaro 2026, Definitions 1, 2, 6, and 7).</li>
                </ol>
                <PaperRun title="Step 1: what the principal needs.">
                    From premise 1, the principal bears whatever the agent&rsquo;s commitment costs, and once the work is under way it holds no instrument that reaches the stranger. Whatever protects it must therefore be in place when the agent signs. That is enforcement before the fact and a ceiling on loss, which are R1 and R2.
                </PaperRun>
                <PaperRun title="Step 2: the reputation registry supplies neither.">
                    From premise 3, on the commitment at hand the stranger weighs its one-time gain from defecting, the advance it keeps or the payment it withholds, against the value <Math>{"V"}</Math> of future dealing under its identity. The registry fixes neither term, and <Math>{"V"}</Math> is zero for a key the stranger means to replace, which costs it nothing. R1 then holds only on a condition the agent cannot check at signing. The registry holds no token, so on a default the principal loses what it advanced, and its one move against the stranger, posting feedback, moves no token: R2 fails. By premise 2 the history is unbonded at its source as well, so even the evidence the agent would read is unverified.
                </PaperRun>
                <PaperRun title="Step 3: a validator&rsquo;s stake or a trusted-execution attestation supplies neither.">
                    From premise 4, the stake, like a trusted-execution attestation, stands behind a report about work that has been done. When the agent signs, the work does not exist, so no response bears on it, and the stranger&rsquo;s comparison on this commitment is the one Step 2 describes: R1 fails. The stake secures the accuracy of the report, not the principal&rsquo;s tokens, and nothing in it bounds what the principal advanced: R2 fails. A validator&rsquo;s response can still inform the buyer&rsquo;s judgment of performance, as a forum&rsquo;s ruling can; it does not replace the promise.
                </PaperRun>
                <PaperRun title="Step 4: a legal wrapper supplies neither.">
                    From premise 5, the wrapper acts after a breach: a forum rules, and the ruling is enforced against the entity. When the agent signs, the stranger&rsquo;s comparison is its one-time gain against the expected judgment, a product of the chance that a forum reaches it, rules against it, and collects. That is a condition on a forum, and by premise 1 the setting is one in which no forum reaches both parties: R1 fails. The principal&rsquo;s loss on a default is what it advanced, recovered after the fact if a ruling is made good, and nothing at signing caps it: R2 fails. Where a forum does reach both parties the wrapper improves the recourse, and it still acts after the work. A common interface that publishes a DAO&rsquo;s members, proposals, and governing documents (Tan et al. 2022) adds disclosure to the wrapper, and disclosure is not a remedy before the work.
                </PaperRun>
                <PaperRun title="Step 5: the bond supplies both.">
                    From premise 6, the stranger&rsquo;s key, whoever holds it, faces the theorem&rsquo;s comparisons from the moment both bonds are locked. Its own bond makes its performance as seller, or its resolution after performance as buyer, its strict best reply on no condition about its identity&rsquo;s future and on no condition that a forum reach the stranger: R1. From premise 7, the mechanism moves out of the agent&rsquo;s wallet on this commitment at most the bond the agent itself locked, a figure the policy computes from the payment and the cumulative value it signs: R2. The stranger&rsquo;s bond enters R1 alone, since by premise 7 it never compensates the principal.
                </PaperRun>
                <PaperRun title="The introduction&rsquo;s trade, worked.">
                    Let <Math>{"P = 100"}</Math> tokens and let the order be the root of its process, so <Math>{"G = P = 100"}</Math>. Under the registry, one side advances: if <Math>{"A"}</Math> pays first, <Math>{"C"}</Math> gains <Math>{"100"}</Math> by keeping the payment and not translating, and performs only if <Math>{"V > 100"}</Math>; if <Math>{"C"}</Math> translates first, it carries the mirror risk on its side. Under the bond, <Math>{"A"}</Math> locks <Math>{"200"}</Math> and <Math>{"C"}</Math> locks <Math>{"200"}</Math>. <Math>{"C"}</Math> ends at <Math>{"+100"}</Math> by translating and at most <Math>{"-100"}</Math> by holding out with everything it holds, a margin of <Math>{"200"}</Math> on no condition about <Math>{"V"}</Math>. Through the mechanism, <Math>{"H"}</Math>&rsquo;s ceiling on this order is <Math>{"200"}</Math>, of which <Math>{"100"}</Math> is the payment it meant to make; if <Math>{"C"}</Math> held out anyway, <Math>{"C"}</Math>&rsquo;s <Math>{"200"}</Math> would stay locked, not pass to <Math>{"H"}</Math>.
                </PaperRun>
                <PaperRun title="Conclusion.">
                    A delegated commitment needs enforcement before the fact and a ceiling on loss. Under a reputation registry it meets neither requirement, because the stranger&rsquo;s performance turns on the value of its future dealing, a condition the agent cannot check at signing. A validator&rsquo;s stake or a trusted-execution attestation changes neither answer, because each is a report on work already done. A legal wrapper changes neither, because its liability is made good by a forum after the breach. A bond locked at commit supplies both, for one commitment, with the agent on either side of the order: the stranger&rsquo;s bond makes the promise good before the work, and the agent&rsquo;s own bond caps what the mechanism can move from the principal&rsquo;s wallet.
                </PaperRun>
                <PaperRun title="Falsifier.">
                    The proposition is false if a reputation design is shown under which a stranger&rsquo;s past history makes its performance on one commitment its strict best reply without the stranger locking value against that commitment and without a condition on the value of its future dealing. It is false if a stake secured on a report about finished work is shown to make the performance of work not yet begun the stranger&rsquo;s best reply. It is false if a legal wrapper is shown to make the stranger&rsquo;s performance its strict best reply when the agent signs, with no forum&rsquo;s ruling after a breach in the comparison. It is false on the other side if the mechanism moves out of an agent&rsquo;s wallet, on one commitment, more than the bond the agent locked.
                </PaperRun>
                <PaperRun title="Scope.">
                    The proposition compares trust layers on one commitment. It assumes parties that maximize payoffs over the signed amounts, the timing and information of the game of Figaro (2026), and an agent that signs only what its policy approves. The payoffs carry no cost term, so the bound is on tokens the mechanism moves: the cost of performing and any off-chain value the agent hands over lie outside it, and neither party&rsquo;s bond compensates the other. The agent&rsquo;s policy, including whether it signs a commitment its principal would refuse, is the principal&rsquo;s to set (Section 4). The principal&rsquo;s recourse against its own agent is the law&rsquo;s. A wrapper and a bond compose, and a principal may want both: the wrapper for recourse where a forum reaches, the bond for the promise before the work. The proposition says only that the wrapper does not supply what the bond does. The bound over many commitments is the policy&rsquo;s, not the mechanism&rsquo;s (Proposition 4.1).
                </PaperRun>
                <p>
                    Is a stake on the stranger&rsquo;s identity not a reputation that binds? A stake is a bond, so it falls outside the reputation class of the falsifier, and as a bond it has a different shape from the one locked at commit. It is sized to the identity rather than to the commitment, so it deters only defections whose gain is smaller than it. Its forfeit also needs someone to judge a breach after the work, since performance is off-chain, which puts a decision between the parties and the stake. The bond locked at commit needs no third party&rsquo;s judgment: the one judgment is the buyer&rsquo;s own, made with its own bond locked in the same process, and a defaulter&rsquo;s bond simply stays locked.
                </p>
                <p>
                    Does reputation then have no role? It has the role of selection: deciding with whom to sign at all. Reputation systems work where entities are long-lived, so that future interaction is expected, and where feedback is captured and used (Resnick et al. 2000). That condition is premise 3&rsquo;s, and it holds for some counterparties and not for others. Under the bonded mechanism every commitment, attestation, and resolution is public, an <em>attestation</em> being a party&rsquo;s signed statement on a clause of an order it is party to, while the process is open, so a wallet&rsquo;s <em>resolution history</em>, the list of resolved processes it was party to and the attestations it carries, can be read by anyone before signing.
                </p>
                <p>
                    Can a wallet manufacture history by trading with itself, one operator behind many keys (Douceur 2002)? It can, but each such process costs gas and locks both bonds for its duration, and the history names the counterparties, so a reader weighs entries by who signed them. Reputation selects; the bond enforces.
                </p>
            </PaperSection>

            <PaperSection title="4. The Aggregate Bound Belongs to the Policy">
                <p>
                    An agent&rsquo;s wallet acts on the chain as a controller: it observes the state of the processes it is party to, considers the actions open to its key, and acts by a <em>policy</em>, a map from state to action in the sense of dynamic programming (Bertsekas 2017). Every commitment, attestation, and resolution is public, so an agent reconstructs the state of its processes from the public data, and the state is fully observable. A wallet&rsquo;s role in a process is read from the orders its key has signed. As buyer it offers, attests, and resolves; as seller it accepts an offer by counter-signing it, and attests. A seller that needs inputs buys them in a process of its own, in which it is the buyer.
                </p>
                <FormalBlock label="Definition 4.1 (Policy).">
                    <p>
                        A <em>policy</em> is a map <Math>{"\\pi(s, a) \\in \\{\\text{approve}, \\text{refuse}\\}"}</Math> from an observed state <Math>{"s"}</Math> and a proposed action <Math>{"a"}</Math>. Its floor is refusal: the empty policy refuses every action, so an unconfigured wallet cannot commit, attest, or resolve by accident.
                    </p>
                </FormalBlock>
                <PaperRun title="Roles as policies.">
                    Policies differ by the role a wallet plays and by how much judgment its principal delegates. A principal may defer every action to its own review. It may cap the payment of any single commitment and the number of open processes, or keep for itself the one buyer action that is terminal, resolution. Nothing in the definition is specific to a kind of decision logic: rule-based, learned, and human policies are maps of the same type.
                </PaperRun>
                <PaperRun title="Language-model policies.">
                    A policy may wrap a language model that reasons and acts through tools, which suits decisions that need reasoning over documents (Yao et al. 2023). Such a model can be steered by adversarial content in what it reads, a stranger&rsquo;s documents among them (Greshake et al. 2023). The question for a delegated agent is what a steered decision can cost the principal, and the answer divides between the mechanism and the policy.
                </PaperRun>
                <FormalBlock label="Proposition 4.1 (The aggregate bound is the policy&rsquo;s).">
                    <p>
                        Let a wallet hold open commitments <Math>{"k = 1, \\dots, N"}</Math>, with bond <Math>{"b_k \\leq B"}</Math> in commitment <Math>{"k"}</Math>. The wallet&rsquo;s exposure through the mechanism is at most <Math>{"\\sum_k b_k \\leq N \\cdot B"}</Math>. The count <Math>{"N"}</Math>, the cap <Math>{"B"}</Math>, and every outflow its key can sign outside the mechanism are bounded by the policy alone.
                    </p>
                </FormalBlock>
                <PaperRun title="Premises.">
                    (1) One commitment moves out of a wallet at most the bond that wallet locked (Proposition 3.1, premise 7). (2) The mechanism moves a party&rsquo;s tokens only against a commitment that party signed, since commit needs both parties&rsquo; signatures and resolution only the buyer&rsquo;s (Figaro 2026, Definitions 2 and 4). (3) The mechanism moves tokens by two operations only, commit and resolution; an attestation moves none, and the mechanism sees no other call the key makes (Figaro 2026, Section 3.2). (4) The key signs only what the policy approves (Definition 4.1, stipulated).
                </PaperRun>
                <PaperRun title="Step 1: the sum.">
                    By premises 1 and 2, each open commitment adds at most <Math>{"b_k"}</Math> to what the mechanism can move or hold from the wallet, and nothing else does, so the exposure through the mechanism is at most <Math>{"\\sum_k b_k"}</Math>, and at most <Math>{"N \\cdot B"}</Math> under the cap.
                </PaperRun>
                <PaperRun title="Step 2: the rest is the policy&rsquo;s.">
                    By premise 2, each of the <Math>{"N"}</Math> commitments exists only because the key signed it, and by premise 4 only because the policy approved it, so <Math>{"N"}</Math> and <Math>{"B"}</Math> are bounded by the policy and by nothing in the mechanism. By premise 3, a transfer, an allowance to another contract, or any other call the key signs lies outside the mechanism, and premise 4 leaves its bound to the policy alone.
                </PaperRun>
                <PaperRun title="Conclusion, falsifier, and scope.">
                    The mechanism bounds the wallet&rsquo;s exposure at the sum of the bonds it locked; how many it locks, how large each is, and what the key signs elsewhere are the policy&rsquo;s to bound. The proposition is false if a token leaves the wallet through the mechanism other than against a commitment the wallet signed, or beyond the bonds it locked. It holds for a key that only its policy uses; a compromised key is Section 6&rsquo;s.
                </PaperRun>
                <p>
                    The mechanism therefore bounds what one approved commitment can cost, and nothing more. As buyer, the costliest single decision is resolution before performance: it leaves the buyer at <Math>{"-P"}</Math> on that order, inside the bond it already locked. A policy bounds <Math>{"N"}</Math> by tracking open exposure across the wallet&rsquo;s processes and refusing a commitment that would cross a ceiling the principal sets. A steered model&rsquo;s risk is thus a sum of named terms, each owned by one layer.
                </p>
            </PaperSection>

            <PaperSection title="5. Discovery Is Separate from Trust">
                <p>
                    Discovery is how a wallet finds a counterparty it has not dealt with, and the mechanism&rsquo;s enforcement does not depend on it: two wallets that already know each other commit without it. A wallet can publish a profile document naming a decentralized identifier (W3C 2022), the endpoints at which it can be reached under the agent communication protocols ERC-8004 builds on, the Model Context Protocol and Agent2Agent (De Rossi et al. 2025), and the capabilities it claims. The mechanism reads none of it. A directory of such profiles needs to keep no role and no party type: registering in it publishes, it never qualifies, since commit requires no registration. ERC-8004&rsquo;s identity registry serves the same need, resolving an agent&rsquo;s handle to its registration file, and the handle can travel in the profile document.
                </p>
                <p>
                    The capabilities an agent advertises are self-asserted, and nothing tests them before the work. ERC-8004 itself states that it &ldquo;cannot cryptographically guarantee that advertised capabilities are functional and non-malicious&rdquo; (De Rossi et al. 2025, Security Considerations). A counterparty reads a claim against the agent&rsquo;s resolution history and bonds against performance, never against the claim. Making a per-agent registry a condition of trading would bring back, as vetting, the selection Section 3 leaves to each party. Descriptors are how wallets find each other; bonds are how they trust each other.
                </p>
            </PaperSection>

            <PaperSection title="6. Security Posture">
                <PaperRun title="Signers.">
                    A long-running agent holds signing authority by design, so a compromised key costs up to the agent&rsquo;s open bonds and whatever else the key can move (Proposition 4.1). A deployment that holds value keeps the key outside the agent&rsquo;s own runtime, in a hardware signer or split among several holders that sign jointly. Either is a key the mechanism admits.
                </PaperRun>
                <PaperRun title="Human review where the action is terminal.">
                    The floor is refusal, and human review is the first policy a principal composes. Autonomy suits actions whose worst case is fixed in advance, such as a commitment under a set payment. Resolution deserves review longest, because it is terminal acceptance and no remedy reaches a resolved process. Moving an action from review to autonomy is the principal&rsquo;s judgment, made on the policy&rsquo;s observed behavior.
                </PaperRun>
                <PaperRun title="The policy reads what it signs.">
                    The commitment is typed data whose fields the signature fixes: the parties, the token, the payment, the cumulative value, and the deadline. A policy that recomputes the bond from those fields and the process state, and checks the stranger against an expected set, defends against any upstream component that proposed the action wrongly, a steered model among them.
                </PaperRun>
                <PaperRun title="Logs.">
                    A forum rules on a process&rsquo;s data, which shows what was committed, attested, and resolved, and never performance itself. An agent&rsquo;s log of what was proposed to it, what its policy decided, and what it signed is the operational complement. The principal holds it and produces it when a ruling needs it.
                </PaperRun>
            </PaperSection>

            <PaperSection title="7. Conclusion">
                <p>
                    The principal behind an agent cannot reach the stranger its agent signs with, so whatever protects it has to be in place at the signature. Of the three trust layers built or proposed for agents, the registry speaks about the past, the validator and the enclave about finished work, and the wrapper about the forum afterward. The bond speaks at the signature itself: it makes performing the stranger&rsquo;s better move whoever holds the key, and it caps what the mechanism can take from the principal at the agent&rsquo;s own bond. The rest of what the principal stands to lose is bounded by the policy it gives its agent. Agents that work for principals can then trade with strangers on a promise each side can count on before the work.
                </p>
            </PaperSection>
        </PaperLayout>
    );
}
