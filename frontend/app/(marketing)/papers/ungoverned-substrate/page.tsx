import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import {
    PaperLayout,
    PaperSection,
    PaperRun,
    PaperRemark,
} from "@/components/papers/PaperLayout";

export const metadata: Metadata = withOg({
    title: "The Ungoverned Substrate — Figaro Protocol",
    description:
        "The network-state and blockchain-governance programs both assume the alternative to state coordination must itself be a governed entity. Figaro's Core realizes a third option: an invariant substrate whose only decisions are its parties' signatures, on which governed entities of any form compose.",
});

export default function UngovernedSubstratePaper() {
    return (
        <PaperLayout slug="ungoverned-substrate"
            title="The Ungoverned Substrate"
            subtitle="Network States, Blockchain Governance, and the Option Both Programs Presuppose Away"
            author="Figaro"
            date="April 2026"
            watermark="Figaro Protocol · Preprint"
            abstract={
                <>
                    <p>
                        Two research programs ask what kind of polity network-native coordination can support. Srinivasan&rsquo;s (2022) <em>network state</em> is a community that forms online and seeks territory and diplomatic recognition. The program of De Filippi and Wright (2018) studies the legal and governance consequences of running rules through code. Both assume that the alternative to state coordination must itself be a <em>governed entity</em>, with governance answered at the protocol layer.
                    </p>
                    <p>
                        We argue that the assumption reflects the governance-rich protocols both programs studied and is not forced by architecture. The Core of the Figaro protocol is an <em>ungoverned substrate</em>: four contracts fixed at deployment, whose only decisions are the parties&rsquo; signatures and the buyer&rsquo;s resolution. Its equilibrium holds with no party outside the trade, so governance moves up to the graph of arrangements composed on it, where any form of governance, or none, can be chosen.
                    </p>
                </>
            }
            references={
                <>
                    <li>Compound Labs. 2020. &ldquo;Governance.&rdquo; Compound v2 Documentation. https://docs.compound.finance/v2/governance/. Accessed October 19, 2026.</li>
                    <li>De Filippi, Primavera, and Samer Hassan. 2016. &ldquo;Blockchain Technology as a Regulatory Technology: From Code Is Law to Law Is Code.&rdquo; <em>First Monday</em> 21 (12). https://doi.org/10.5210/fm.v21i12.7113.</li>
                    <li>De Filippi, Primavera, Morshed Mannan, and Wessel Reijers. 2020. &ldquo;Blockchain as a Confidence Machine: The Problem of Trust &amp; Challenges of Governance.&rdquo; <em>Technology in Society</em> 62: 101284. https://doi.org/10.1016/j.techsoc.2020.101284.</li>
                    <li>De Filippi, Primavera, and Aaron Wright. 2018. <em>Blockchain and the Law: The Rule of Code</em>. Cambridge, MA: Harvard University Press. https://doi.org/10.4159/9780674985933.</li>
                    <li>Figaro. 2026a. &ldquo;Asymmetric Bonding and Buyer Dominance: Two Composing Mechanisms for Self-Enforcing N-Party Coordination.&rdquo; Preprint. https://figaroprotocol.com/papers/asymmetric-bonding/. Accessed October 19, 2026.</li>
                    <li>Figaro. 2026b. &ldquo;A Verified Resolution Contract: Formal Verification, Threat Model, and the Scope of the Claim.&rdquo; Preprint. https://figaroprotocol.com/papers/verified-resolution-kernel/. Accessed October 19, 2026.</li>
                    <li>Hirschman, Albert O. 1970. <em>Exit, Voice, and Loyalty: Responses to Decline in Firms, Organizations, and States</em>. Cambridge, MA: Harvard University Press.</li>
                    <li>Lessig, Lawrence. 2006. <em>Code: Version 2.0</em>. New York: Basic Books.</li>
                    <li>OpenZeppelin. 2024. &ldquo;Governance.&rdquo; OpenZeppelin Contracts 5.x Documentation. https://docs.openzeppelin.com/contracts/5.x/api/governance. Accessed October 19, 2026.</li>
                    <li>Reijers, Wessel, and Mark Coeckelbergh. 2018. &ldquo;The Blockchain as a Narrative Technology: Investigating the Social Ontology and Normative Configurations of Cryptocurrencies.&rdquo; <em>Philosophy &amp; Technology</em> 31 (1): 103&ndash;130. https://doi.org/10.1007/s13347-016-0239-x.</li>
                    <li>Sablier Labs. 2023. &ldquo;What Is Sablier?&rdquo; Sablier Documentation. https://docs.sablier.com/concepts/what-is-sablier. Accessed October 19, 2026.</li>
                    <li>Srinivasan, Balaji. 2022. <em>The Network State: How to Start a New Country</em>. Self-published. https://thenetworkstate.com/. Accessed October 20, 2026.</li>
                    <li>Walch, Angela. 2017. &ldquo;The Path of the Blockchain Lexicon (and the Law).&rdquo; <em>Review of Banking &amp; Financial Law</em> 36 (2): 713. https://commons.stmarytx.edu/facarticles/553/.</li>
                    <li>Walch, Angela. 2019a. &ldquo;Deconstructing &lsquo;Decentralization&rsquo;: Exploring the Core Claim of Crypto Systems.&rdquo; In <em>Cryptoassets: Legal, Regulatory, and Monetary Perspectives</em>, edited by Chris Brummer, 39&ndash;68. New York: Oxford University Press. https://doi.org/10.1093/oso/9780190077310.003.0003.</li>
                    <li>Walch, Angela. 2019b. &ldquo;In Code(rs) We Trust: Software Developers as Fiduciaries in Public Blockchains.&rdquo; In <em>Regulating Blockchain: Techno-Social and Legal Challenges</em>, edited by Philipp Hacker, Ioannis Lianos, Georgios Dimitropoulos, and Stefan Eich, 58&ndash;82. Oxford: Oxford University Press. https://doi.org/10.1093/oso/9780198842187.003.0004.</li>
                    <li>Werbach, Kevin. 2018. <em>The Blockchain and the New Architecture of Trust</em>. Cambridge, MA: MIT Press.</li>
                </>
            }
        >
            <PaperSection title="1. Introduction">
                <p>
                    The blockchain protocols the governance literature has studied all change their rules by some process. Ethereum changes through improvement proposals and client releases, Bitcoin through an informal but real social process, Tezos and the Cosmos chains through on-chain votes. Maker changes its parameters by the votes of its token holders, and Optimism through its token house and citizens&rsquo; house. From this population a reasonable induction follows: network-native coordination needs governance at the protocol layer.
                </p>
                <p>
                    Two programs build on that induction. The network-state thesis (Srinivasan 2022) is prescriptive: a program for constituting alternative polities. The blockchain-governance program (De Filippi and Wright 2018) is analytical: an account of what blockchain arrangements imply for law and governance. Both treat the substrate of network-native coordination as something that must be governed. We argue that this premise is a design choice and that a protocol can make the other choice.
                </p>
                <p>
                    Figaro is a decentralized, permissionless protocol for trade between strangers, and its <em>Core</em> is the four contracts every trade runs on. One holds the bonds of every process committed one call at a time and resolves a process when its buyer signs. One defines the commitment each party signs, and one binds what a party attests to the order it concerns. The fourth resolves many processes in one transaction on the strength of a validity proof, pulling and paying each party&rsquo;s net amount when the batch resolves. An <em>order</em> is one buyer&ndash;seller commitment. A <em>process</em> is the sequence of orders one buyer opens: each seller that adds value commits an order, the process accumulates value along that chain, and the buyer resolves all of its orders at once. A process can carry as many orders as the chain can resolve in one transaction.
                </p>
                <p>
                    Two terms carry the argument, and we fix them here. The <em>substrate</em> is the Core and nothing else: the chain beneath it is the <em>execution layer</em>, which Section 3 treats on its own. The <em>graph</em> is everything composed above the Core: the clauses, agreements, and assemblies that designers (the wallets that write and register them) publish, the processes run on them, and the wallets, communities, and organizations that act through them. A <em>clause</em> is one reusable term; an <em>agreement</em> is the clauses composed for one order; an <em>assembly</em> is agreements composed into a reusable design of a process.
                </p>
                <PaperRun title="The thesis.">
                    (1) Both programs assume that the alternative to state coordination must be a governed network entity. (2) The assumption is not architecturally forced: a coordination substrate can be invariant, and whether it is governed is a design choice. (3) An ungoverned substrate does not abolish governance; it moves governance to the graph, where any form of it, or its absence, can be composed. (4) The move clarifies what each program proposes: a network state is one graph, a DAO&rsquo;s arrangements are another, and neither is the substrate.
                </PaperRun>
                <PaperRun title="Scope.">
                    This is an essay in the political architecture of network coordination. It takes no position on whether network states are desirable, whether DAOs are well governed, or whether conventional jurisdictions should recognize <em>lex cryptographia</em>. Both programs are sound on their own terms; our claim is that the class of governance-rich arrangements they analyze is one class among two. Functions that require adaptability should have governance, and choosing among arrangements is the participants&rsquo; work.
                </PaperRun>
            </PaperSection>

            <PaperSection title="2. The Network-State Program and the Promise Between Members">
                <PaperRun title="The thesis as articulated.">
                    Srinivasan (2022) defines a network state as a highly aligned online community with a capacity for collective action, which crowdfunds territory and eventually gains diplomatic recognition. The book traces a path from startup society to network union, network archipelago, and network state, with an integrated cryptocurrency and an on-chain census among its traits. A community forms around a <em>one commandment</em>: a single moral innovation its founders have already converged on. On our reading the program extends Hirschman&rsquo;s (1970) account of exit: where voice inside incumbent states fails, exit needs a destination, and the network state designs one. Governance is constitutive throughout, from the founder&rsquo;s self-conception to collective decision, internal adjudication, and external recognition.
                </PaperRun>
                <PaperRun title="What the thesis leaves open.">
                    The book specifies a currency for its community, and a currency is not yet a way to make a stranger&rsquo;s promise good. When two members trade, or a member trades with an outsider, someone must bear the risk that the other side does not deliver. That role has been filled by incumbent institutions: the platform that holds the payment, the court of the parties&rsquo; jurisdiction. A bonded commitment fills it inside the trade, because each party locks its own deterrent before the trade begins and no institution of any polity is needed to resolve it. It serves members, outsiders, and two strangers who happen to share the chain on the same terms.
                </PaperRun>
                <PaperRun title="The substrate a network state does not need to govern.">
                    A network state that builds its commercial substrate under its own governance recreates, inside itself, the substrate-governance problem it set out to leave. A network-state chain, a network-state arbitration body, or a network-state currency board each becomes a seat its members must then contest. The substrate the program needs is one whose rules no member body governs and every member body can use. A bonded commitment carries a self-enforcing form and no moral content, so it adds no commandment of its own and constrains none.
                </PaperRun>
                <PaperRemark title="On partial exit.">
                    In Hirschman&rsquo;s account, exit presupposes an alternative to go to. A bonded substrate adds that exit can be <em>partial</em>. A participant can leave the incumbent state&rsquo;s apparatus for making commercial promises good while keeping its citizenship, its criminal-law protection, its public goods, and its defense. Earlier architectures bundled these functions, so leaving one meant leaving all; the bonded substrate separates the first from the rest. Whether a participant goes on to found a network state is a choice the substrate leaves to it.
                </PaperRemark>
            </PaperSection>

            <PaperSection title="3. Blockchain Governance and the Confidence Machine">
                <PaperRun title="The program in outline.">
                    De Filippi and Wright (2018) name <em>lex cryptographia</em>: rules administered through self-executing smart contracts and decentralized autonomous organizations (DAOs). Their account extends Lessig&rsquo;s (2006) &ldquo;code is law&rdquo; (software regulates behavior as law does) into a study of how such rules meet conventional jurisdictions. A consistent thread is that code does not escape governance. Its rules are written and revised by people, and regulators reach it through the intermediaries it depends on: developers, miners and validators, exchanges, and the services that give users access.
                </PaperRun>
                <PaperRun title="The hidden-fiduciary critique.">
                    Walch (2017) argues that the field&rsquo;s vocabulary (&ldquo;decentralized&rdquo;, &ldquo;trustless&rdquo;, &ldquo;immutable&rdquo;) obscures what it claims to describe, and that this matters legally because regulators assess the systems in those terms. Walch (2019a) shows that &ldquo;decentralization&rdquo; bundles several independent dimensions of power, so a system can be decentralized in one and concentrated in another. Walch (2019b) names the relation of the concentrated groups to everyone else: the developers who reshape a public blockchain act much as <em>fiduciaries</em> (parties trusted with discretion over another&rsquo;s interest), though none of a fiduciary&rsquo;s duties has been recognized. Werbach (2018) reaches an adjacent point from trust theory: a blockchain replaces one architecture of trust with another, which has institutional preconditions of its own. Our argument needs only the concentration claim, and it is the strongest challenge to any protocol said to be free of governance.
                </PaperRun>
                <PaperRun title="The confidence machine.">
                    De Filippi, Mannan, and Reijers (2020) describe blockchain as a <em>confidence machine</em>: an architecture that moves reliance from people and institutions to code, while trust and governance persist in those who write and change the code. Reijers and Coeckelbergh (2018) read cryptocurrencies, in the same vein, as narrative technologies that configure social and normative relations. De Filippi and Hassan (2016) trace the converse movement, from code is law to <em>law is code</em>, where legal rules are expressed in software. The confidence-machine analysis fits the class it was built on: protocols whose rules evolve, whose parameters are voted, whose treasuries fund development. It says nothing about a protocol whose rules are fixed at deployment, and we place the Core in that second class.
                </PaperRun>
                <PaperRun title="The substrate and the execution layer beneath it.">
                    Walch&rsquo;s critique is correct for the execution layer, and we accept it there. The execution layer is everything the Core depends on to run and to be reached: the chain and its validators, the RPC providers, the exchanges that price the denomination, and the fiat on-ramps. Its operators are governed entities, and what they decide reaches the Core. Our ungoverned claim is made of the substrate alone, and the execution layer&rsquo;s governance is inherited whole by whoever chooses a chain. A participant therefore relies on two surfaces: fixed rules it can read once, and an execution layer that must keep executing them faithfully.
                </PaperRun>
                <PaperRun title="The batch path.">
                    Two further dependencies join the execution layer when processes are resolved in a <em>batch</em>, a set of processes resolved together in one transaction on the strength of a validity proof. The <em>sequencer</em> is the relay that gathers the parties&rsquo; signed operations, proves the batch and submits it. It cannot fabricate an operation or change what resolves, because each party signs for itself and the proof checks every signature against the Core&rsquo;s rules. It can delay: an open process on the batch path waits on the state the sequencer holds, while a new process can always open on the direct path, one call at a time. The proof is checked by an external verifier contract under its own operator&rsquo;s arrangements, which belongs to the execution layer and not to the substrate.
                </PaperRun>
            </PaperSection>

            <PaperSection title="4. The Common Premise: Governance at the Substrate">
                <p>
                    The two programs share one premise. The network state&rsquo;s alternative to the incumbent state is a polity to be governed: a founder, a constitution, collective decision, a treasury, internal adjudication, external standing. The blockchain-governance program&rsquo;s alternative to the platform is a protocol to be governed: a governance token, a voting process, a developer foundation, an upgrade path. In both, the alternative is a governed entity.
                </p>
                <PaperRun title="Why the premise is a choice.">
                    The premise is the induction from the population the opening section listed, and the population is the reason it seems necessary. A protocol&rsquo;s rules need not evolve. A coordination architecture can fix a small core at deployment and push all variability to the layers above it, which then owe the core no part in its evolution because it has none. The choice has a price: a governed protocol can adapt and correct its errors, and an invariant one cannot. Both programs treat substrate governance as constitutive, and so they price only one side of that choice.
                </PaperRun>
                <PaperRemark title="Is adaptability not required?">
                    A referee will ask whether every protocol needs adaptability. The answer depends on the function. A lending market must respond to market conditions, a scaling layer to throughput, an identity system to changing standards. A protocol that does one well-defined thing, enforcing a bonded commitment between two signatures, faces no such external state. The adaptability argument is specific to function and generic to no protocol.
                </PaperRemark>
            </PaperSection>

            <PaperSection title="5. The Ungoverned Substrate">
                <PaperRun title="What &ldquo;ungoverned&rdquo; means.">
                    A substrate is <em>ungoverned</em> when no body can change its rules and the only decisions it accepts are its parties&rsquo; own. The Core meets the definition from two sources. Its deployed contracts are invariant: every rule, the bond ratio included, is written into their code at deployment, so a change of behavior means new contracts at new addresses, a different protocol instance the deployed one has no relation to. The shape of its calls leaves no seat for discretion at resolution. On the direct path two calls move bonds, commit and resolve; the Core also binds attestations, which move no bond, and the batch call applies on a proof the commits and resolutions the parties signed.
                </PaperRun>
                <PaperRun title="The two calls.">
                    <em>Commit</em> forms one order under asymmetric bonding, and both parties sign it. The buyer locks twice the payment <em>P</em>, and the payment travels inside that bond. The seller locks twice the cumulative value <em>G</em> through its order: every payment the process has accumulated so far, its own included, a figure the Core computes from the signed accumulator. <em>Resolve</em> can be called by the buyer alone. It resolves every order of the process together or none of them, pays every seller, refunds every bond (the buyer&rsquo;s less the payments it carried), and is terminal.
                </PaperRun>
                <PaperRun title="Why no third party is needed: the equilibrium.">
                    Cooperation is the equilibrium of the two calls, and it holds without anyone outside the trade. Value passes off-chain, so each payoff counts what the Core moves and what the party keeps in hand. After performance, resolving leaves the buyer at 0 and never resolving at &minus;<em>P</em>, since its bond stays locked while it keeps goods worth <em>P</em>; resolving is strictly better with no assumption about the seller. That comparison is the one unconditional anchor. The equilibrium itself is a fixed point: two best-response checks against one profile, verified together.
                </PaperRun>
                <p>
                    Given the anchor, the buyer&rsquo;s plan to resolve once performance has occurred and not before, and its co-sellers&rsquo; performance, performing leaves the seller at +<em>P</em> and never performing at most &minus;<em>G</em>. Given that the seller performs, the buyer keeps the process open before performance rather than resolving at once, which is terminal at &minus;<em>P</em>. On a process that will not close, holding out beats performing only by what the seller retains, and the two are equal when it retains nothing. The doubling answers retention, because a party that walks away keeps what is in its hands, and a bond equal to that value would be exactly canceled by the taking. The equilibrium is proved, for any number of orders the network resolves in one call, in Figaro (2026a).
                </p>
                <PaperRemark title="Is the buyer not a governor?">
                    The buyer&rsquo;s decision to resolve is a judgment, and the chain accepts it as the one judgment after commit. It is a party&rsquo;s judgment over its own trade, made at the price of its own bond, and it reaches no other process. No body decides for the parties: none can alter or override a resolution, on either path, and on the batch path the sequencer can only delay what it carries. A grievance between the parties is put right before the buyer resolves, because resolution is terminal acceptance and only a bond is ever refunded.
                </PaperRemark>
                <PaperRun title="What the option requires.">
                    An ungoverned substrate is available only to a function that can be specified in advance and is small enough to verify. The Core&rsquo;s safety properties are stated formally and checked by model checking (Figaro 2026b), and the algebra of its equilibrium is proved (Figaro 2026a). A function too large or too dependent on external state for that discipline belongs under governance.
                </PaperRun>
                <PaperRun title="A narrower claim than &ldquo;code is law&rdquo;.">
                    The claim does not rest on &ldquo;code is law&rdquo;, whose conflation of software and law both Walch (2017) and De Filippi and Wright (2018) criticize. It rests on a narrower claim: two calls over bonds and an accumulator form a mechanism small enough for formal specification and immutable deployment. Law stays in the forums that rule under conventional doctrine. The chain holds a fingerprint of each trade (the agreement&rsquo;s merkle root, each attestation&rsquo;s content hash, the bonds, and the accumulator), never its terms, and never tests performance. A forum rules on that data while the process is open, and it has no call into the Core: its ruling reaches the trade through a remedy the parties make before the buyer resolves.
                </PaperRun>
            </PaperSection>

            <PaperSection title="6. Where Governance Returns: At the Graph">
                <PaperRun title="Arrangements as governed entities.">
                    A single process, one buyer and the sellers it binds, needs no governance beyond its signatures, because the equilibrium holds inside it. An arrangement that runs many processes over time needs more: questions its commitments did not foresee, members who join and leave, disputes beyond what bonding secures. That governance is real work, and the substrate leaves its form to the participants: cooperative, corporate, constitutional, or none. The protocol&rsquo;s own DAO is an instance. Its signers spend by judgment its treasury of florins, the protocol&rsquo;s token, and their decisions reach only what the DAO itself holds and signs: its tokens, its registrations, and the processes it enters as a party. Conventional legal personality stays available, and for an arrangement that takes it, the relation between its coded and its legal rules (De Filippi and Hassan 2016) becomes an option rather than a precondition.
                </PaperRun>
                <PaperRun title="Concentration at the graph.">
                    Concentrations that form at the graph meet no governor either. Designer rewards, florins rewarded to a design&rsquo;s designer of record after the fact and in proportion to real use, accrue to the designers whose designs the network uses most, token holdings concentrate as holdings do, and a registry confers one priority: the first registration of a key. No registry keys an entry on a name. The clause registry keys on a hash of the spec&rsquo;s exact bytes, the agreement and assembly registries on merkle roots over their leaves. The members registry, where a wallet registers its own profile under a stake, keys on the wallet, so a design&rsquo;s priority attaches to its exact content and a profile&rsquo;s to its wallet. The design answers these concentrations with competition and disclosure rather than administration, and whether that answer suffices is an empirical question.
                </PaperRun>
                <PaperRun title="The substrate constrains the signer, not the governance.">
                    Does a DAO not need a governance interface to use the primitive? It needs a signer. The Core authenticates a party by recovering an ECDSA signature from its own key: an ordinary wallet, or one delegated to run code under EIP-7702 while its key still signs, never a contract wallet that answers a validity query under ERC-1271. A DAO approves a commitment by its own process (token vote, delegation, optimistic approval), and its executor transfers tokens to the wallet it designates to sign (Compound Labs 2020; OpenZeppelin 2024). A collective can also hold the key itself by threshold signing, which yields one ECDSA signature. The Core sees the signature and never the vote, the proposal, or the delegation graph; a disbursement policy run through a streaming contract upstream (Sablier Labs 2023) reaches it the same way.
                </PaperRun>
                <PaperRun title="Keys and history.">
                    A permanently lost buyer key leaves a process&rsquo;s bonds locked, because only the buyer&rsquo;s resolution releases them, so a buyer&rsquo;s key belongs under a recovery arrangement installed on its account before it commits. On the direct path every commitment and every resolution is an on-chain event, and a DAO&rsquo;s history of trades through the substrate reads off chain state with no accommodation. On the batch path the chain holds each batch&rsquo;s state root, its net transfers, and the attestations it carried, and the per-order commitments and resolutions stay with the parties and the sequencer. An arrangement that wants its whole history derivable from the chain commits on the direct path.
                </PaperRun>
                <PaperRemark title="On infrastructural literacy.">
                    The blockchain-governance program worries that participants cannot evaluate the arrangements they live under, and the worry applies to the substrate as to any infrastructure. An invariant Core bounds the problem without solving it. A governed protocol&rsquo;s demand on its users grows each time its rules change; the Core&rsquo;s rules are learned once.
                </PaperRemark>
            </PaperSection>

            <PaperSection title="7. Conclusion">
                <p>
                    Both programs placed governance at the substrate because the protocols they studied had it there. An invariant Core shows that placement to be a choice: the substrate holds commitments by an equilibrium among its own parties, and every governance question moves to the graph, where each arrangement answers it in its own form on the same contracts. A network state is one such graph and a DAO&rsquo;s arrangements another; neither has to govern the rules both use. The Core is ideologically agnostic, and the graph is the politics.
                </p>
            </PaperSection>
        </PaperLayout>
    );
}
