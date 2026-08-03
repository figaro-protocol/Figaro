import type { Metadata } from "next";
import {
    PaperLayout,
    PaperSection,
    PaperRun,
    PaperRemark,
} from "@/components/papers/PaperLayout";

export const metadata: Metadata = {
    title: "The Ungoverned Substrate — Figaro Protocol",
    description:
        "The network-state and blockchain-governance programs both assume the alternative to state coordination must itself be a governed entity. The bonded settlement primitive realizes a third option: an invariant, ungoverned substrate on which arbitrary governed entities compose.",
};

export default function UngovernedSubstratePaper() {
    return (
        <PaperLayout slug="ungoverned-substrate"
            title="The Ungoverned Substrate"
            subtitle="Network States, Blockchain Governance, and the Option Both Programs Presuppose Away"
            author="Alessandro Daliana"
            date="April 2026"
            watermark="Figaro Protocol · Preprint"
            keywords="network state, blockchain governance, lex cryptographica, ungoverned substrate, decentralized autonomous organization, governance at the graph"
            abstract={
                <>
                    <p>
                        Two contemporary research programs have addressed what kind of polity a network-native coordination architecture might support. The first, Srinivasan&rsquo;s (2022) <em>network state</em>, proposes a community that forms online, accumulates cohesion and shared institutions, and ultimately seeks territorial and diplomatic recognition. The second, developed by De Filippi &amp; Wright (2018) and the collaborators around the Coalition of Automated Legal Applications (COALA), examines the legal and governance consequences of running rules through code: <em>lex cryptographica</em>, decentralized autonomous organizations, on-chain governance. The two programs differ in goal &mdash; one constitutional, the other infrastructural &mdash; but share a structural premise: the alternative to state coordination must itself be a <em>governed entity</em>, and governance is a question that arises at the network or protocol layer and must be answered there.
                    </p>
                    <p>
                        This paper observes that the bonded settlement primitive admits a third option neither program names: an <em>ungoverned substrate</em> on which arbitrary governed entities can be constituted, but which itself is not a governed entity at all. The substrate does not vote, does not upgrade, has no constitution, no representatives, no protocol-level discretion. Network states can be constituted on it; so can DAOs, cooperatives, peer networks, sole traders, and agent coalitions. The claim is not that either program is wrong on its own terms &mdash; both are coherent programs addressing real questions &mdash; but that the architectural option they presuppose away is the one the bonded primitive realizes. Recognizing it does not adjudicate among governed arrangements; it relocates the governance question from the substrate, where both programs place it, to the graph, where the substrate admits it to be answered in arbitrarily many ways.
                    </p>
                </>
            }
            references={
                <>
                    <li>Compound Labs. Compound Governor: On-Chain Governance Module. Compound Protocol Documentation, 2020.</li>
                    <li>De Filippi, P. &amp; Hassan, S. Blockchain Technology as a Regulatory Technology: From Code is Law to Law is Code. <em>First Monday</em>, 21(12), 2016.</li>
                    <li>De Filippi, P., Mannan, M., &amp; Reijers, W. Blockchain as a Confidence Machine: The Problem of Trust &amp; Challenges of Governance. <em>Technology in Society</em>, 62:101284, 2020.</li>
                    <li>De Filippi, P. &amp; Wright, A. <em>Blockchain and the Law: The Rule of Code</em>. Harvard University Press, Cambridge, MA, 2018.</li>
                    <li>DeepDAO. DAO Treasury Aggregate Statistics. DeepDAO Analytics Platform, 2024.</li>
                    <li>Hirschman, A. O. <em>Exit, Voice, and Loyalty: Responses to Decline in Firms, Organizations, and States</em>. Harvard University Press, Cambridge, MA, 1970.</li>
                    <li>Lessig, L. <em>Code: Version 2.0</em>. Basic Books, New York, 2006.</li>
                    <li>Messari Research. The Health of DAO Treasuries. Messari, 2022.</li>
                    <li>OpenZeppelin. Governor Contracts: Reference Implementation for On-Chain Governance. OpenZeppelin Contracts Documentation, 2024.</li>
                    <li>Reijers, W. &amp; Coeckelbergh, M. The Blockchain as a Narrative Technology: Investigating the Social Ontology and Normative Configurations of Cryptocurrencies. <em>Philosophy &amp; Technology</em>, 31(1):103&ndash;130, 2018.</li>
                    <li>Sablier Labs. Sablier Protocol: Token Streaming Infrastructure. Sablier Documentation, 2023.</li>
                    <li>Srinivasan, B. <em>The Network State: How to Start a New Country</em>. Self-published, 2022.</li>
                    <li>Walch, A. The Path of the Blockchain Lexicon (and the Law). <em>Boston University Review of Banking and Financial Law</em>, 36:713&ndash;765, 2017.</li>
                    <li>Walch, A. Deconstructing &lsquo;Decentralization&rsquo;: Exploring the Core Claim of Crypto Systems. In C. Brummer (ed.), <em>Cryptoassets: Legal, Regulatory, and Monetary Perspectives</em>. Oxford University Press, 2019.</li>
                    <li>Werbach, K. <em>The Blockchain and the New Architecture of Trust</em>. MIT Press, Cambridge, MA, 2018.</li>
                </>
            }
        >
            <PaperSection title="1. Introduction">
                <p>
                    This paper sits between political philosophy, the literature on blockchain governance, and the analysis of a particular settlement primitive. Its starting point is a question the political philosophy of coercion leaves open: when the state&rsquo;s sovereign-coercive function is partially substituted by bonded pre-commitment in bilateral commerce, what follows for the proposals that have emerged to organize coordination at the network layer?
                </p>
                <p>
                    Two such proposals have organized the recent discussion: the network-state thesis (Srinivasan, 2022), which is normative-prescriptive &mdash; a program for constituting alternative polities &mdash; and the blockchain-governance research program (De Filippi &amp; Wright, 2018, and collaborators around COALA), which is descriptive-analytical &mdash; an account of what blockchain arrangements imply for law and governance. Both share a structural assumption the present paper identifies and argues is not forced.
                </p>
                <p>
                    The shared assumption is that the network-layer alternative to state coordination must itself be a <em>governed entity</em>. The network state requires a constitutional founder, a community self-conception, an explicit governance process, and ultimately sovereign-equivalent diplomatic standing. The blockchain-governance program treats the governance of on-chain arrangements as the central problem of the field: how decisions are made about protocol evolution, who has voting power, what counts as legitimate amendment (De Filippi, Mannan &amp; Reijers, 2020). In both, the substrate of network-native coordination is itself something that must be governed.
                </p>
                <p>
                    The bonded settlement primitive provides a different option: an <em>ungoverned substrate</em>. The kernel is invariant &mdash; no upgrades, no proposals, no votes, no protocol-level discretion. There is no entity of which the kernel is the constitution, because the kernel is not a constitution of anything. It is a small set of rules executed on public infrastructure, on top of which arbitrary governed entities can be composed &mdash; or which bilateral parties can use without constituting any entity at all.
                </p>
                <PaperRun title="The thesis.">
                    (1) Both programs assume the alternative to state coordination must be a governed network entity. (2) The assumption is not architecturally forced: a coordination substrate can be invariant rather than governed, and the decision is a design choice. (3) The ungoverned-substrate option does not abolish governance &mdash; it relocates governance from the substrate layer to the graph layer, where any pattern of governance (or its absence) can be composed. (4) The relocation is the political-architectural content of the substrate change, and it clarifies what each program is actually proposing: the network state is one possible graph, blockchain-governance arrangements are another, and neither is the substrate.
                </PaperRun>
                <PaperRun title="What this paper is and is not.">
                    This is a short essay in the political architecture of network coordination. It does not extend the underlying mechanism, and it takes no position on whether network states are desirable, whether DAOs are well-governed, or whether <em>lex cryptographica</em> should be recognized by conventional jurisdictions. Two disclaimers govern everything that follows. First, the paper is not a critique of either program: both analyses are substantive on their own terms, and the claim is only that the class of governance-rich arrangements they analyze is not the only class &mdash; the substrate the network state needs does not have to be one it governs, and an invariant kernel is a class to which the ongoing-governance concern does not apply. Second, it is not a claim that all protocols should be ungoverned, nor a constitutional proposal, nor a prediction: functions that genuinely require adaptability should have governance, and the substrate admits arbitrary arrangements &mdash; choosing among them is the participants&rsquo; work, and there is more political work to do at the graph layer, not less.
                </PaperRun>
            </PaperSection>

            <PaperSection title="2. The Network-State Program and Its Coordination Gap">
                <p>
                    We begin with the network-state thesis, both because it is the more public of the two programs and because its specific unsolved sub-problem is one the bonded primitive resolves.
                </p>
                <PaperRun title="The thesis as articulated.">
                    Srinivasan (2022) proposes the network state as a sequence: an online community forms around a shared interest, acquires cohesion, develops shared institutions, attains a population and a treasury large enough to act, acquires territorial presence, and ultimately seeks diplomatic recognition. A distinctive feature is the <em>one commandment</em>: the network state is organized around a single moral innovation on which the founding community has already converged. The sequence updates Hirschman&rsquo;s (1970) framework on <em>exit</em>: when voice within incumbent states becomes ineffective, exit becomes the alternative &mdash; but exit requires a destination, and the network state is the destination&rsquo;s design. The thesis takes governance as constitutive: explicit shared institutions, a founder-articulated self-conception, a process for collective decision, internal adjudication, external recognition &mdash; each a governance function the program addresses.
                </PaperRun>
                <PaperRun title="The unsolved sub-problem.">
                    The thesis names an &ldquo;economic engine&rdquo; as a constitutive stage between community formation and recognition, but treats that stage as under-specified: in practice, commerce within network-state communities continues to route through fiat rails, incumbent platforms, and the legal apparatuses of participants&rsquo; physical jurisdictions. The missing economic engine is the substrate gap, and the bonded primitive supplies it. Bilateral commercial coordination between participants, between participants and non-participants, and between two non-participants who happen to share the substrate can be conducted through bonded commitments that depend on no incumbent state apparatus and no network-state-internal governance.
                </PaperRun>
                <PaperRun title="What the thesis does not require.">
                    A subtler observation: the substrate the network-state program needs does not have to be one the network state <em>governs</em>. Treating the substrate as something to constitute under its own governance &mdash; a network-state-native blockchain, a network-state-issued currency, a network-state-operated arbitration system &mdash; recreates within the network state the very substrate-governance problem it was supposed to resolve relative to the incumbent state. The substrate it actually requires is one no entity governs, which any entity can use, and whose neutrality makes it suitable for cross-affiliation coordination. The bonded primitive supplies an enforceable form without supplying any moral content: it produces no commandment of its own, so a network state organized around any one commandment can use it without the substrate constraining what the commandment can be.
                </PaperRun>
                <PaperRemark title="On exit and the missing destination.">
                    Hirschman&rsquo;s analysis assumes exit is meaningful only when it has a destination. The bonded primitive contributes a different observation: exit can be <em>partial</em>. A participant can exit the incumbent state&rsquo;s commercial-coordination apparatus without exiting its other functions &mdash; citizenship, criminal-law protection, public goods, defense. Partial exit was difficult under prior architectures because the commercial-coordination apparatus was bundled with the others; the substrate change unbundles. Whether the participant goes on to constitute a network state is a separate choice the substrate does not make for them.
                </PaperRemark>
            </PaperSection>

            <PaperSection title="3. Blockchain Governance and the Confidence Machine">
                <p>
                    We turn to the blockchain-governance program, which addresses the same substrate question from a different angle and arrives at a more textured account of what governing network-native coordination involves.
                </p>
                <PaperRun title="The program in outline.">
                    De Filippi &amp; Wright (2018) examine the legal consequences of running rules through code: <em>lex cryptographica</em> as an emerging body of computational law, smart contracts as self-executing agreements, DAOs as code-mediated coordination structures, and the hybrid arrangements that emerge when computational rules encounter conventional jurisdictions. The framing extends Lessig&rsquo;s (2006) &ldquo;code is law&rdquo; into a positive program. A consistent thread is that the apparent elimination of governance through code is illusory: rules are written by people, require interpretation when situations arise their authors did not anticipate, require change when conditions shift, and the infrastructure on which they run introduces governance through the back door even when the on-chain protocol claims to have eliminated it.
                </PaperRun>
                <PaperRun title="The hidden-fiduciary critique.">
                    Walch (2017) argues that the field&rsquo;s self-description &mdash; &ldquo;decentralized,&rdquo; &ldquo;trustless,&rdquo; &ldquo;code is law&rdquo; &mdash; functions as a discourse that obscures rather than describes: &ldquo;decentralized&rdquo; protocols typically depend on small core-developer groups whose decisions carry enormous practical weight, a relationship properly characterized as <em>fiduciary</em> even though no formal fiduciary duty has been recognized. Walch (2019) adds that &ldquo;decentralization&rdquo; is too vague to serve as a legal standard: it bundles distinct, independently-varying domains of power concentration, so a protocol can be decentralized in some respects while highly centralized in others. The hidden-fiduciary critique is the strongest available challenge to any claim that a protocol has eliminated governance. Werbach (2018) arrives at an adjacent point from the trust-theory side: blockchain protocols substitute one <em>architecture of trust</em> for another, and the new architecture has its own institutional preconditions.
                </PaperRun>
                <PaperRun title="The confidence machine.">
                    De Filippi, Mannan &amp; Reijers (2020), building on Reijers &amp; Coeckelbergh (2018) reading blockchain as a narrative technology, frame blockchain as a <em>confidence machine</em>: an architecture that shifts the locus of trust from people and institutions to code and mathematics, but does not eliminate trust or governance. The framing is largely correct for the class it addresses &mdash; <em>governance-rich</em> protocols whose rules evolve, whose parameters are subject to vote, whose treasuries fund development. For such systems, trust shifted from human institutions to code does not arrive at a final resting place; it shifts to the human institutions that govern the code. A complementary COALA thread (De Filippi &amp; Hassan, 2016) has produced model legal frameworks for DAOs and analyses of how code-mediated arrangements integrate with conventional legal personality, treating code and conventional law as complementary.
                </PaperRun>
                <PaperRemark title="On the scope of the confidence-machine analysis.">
                    The confidence-machine analysis applies to the class it was developed for: governance-rich protocols whose rules evolve under explicit governance. It is silent on what happens when an architecture is <em>not</em> governance-rich &mdash; when its rules are invariant, no parameter is subject to vote, and no treasury funds its evolution. The present paper does not contradict the analysis; it identifies a class of arrangements outside its scope.
                </PaperRemark>
                <PaperRun title="Protocol-layer versus substrate-layer governance.">
                    Even an invariant kernel runs on infrastructure that is not invariant. Validators, sequencers and rollup operators, RPC providers, exchanges that price the bond currency, and fiat on-ramps are all governed entities, and decisions in those layers affect what happens at the kernel; Walch&rsquo;s hidden-fiduciary critique is the strongest version of the concern. We accept it and locate the kernel relative to it explicitly. The ungoverned-substrate claim is a claim about the <em>kernel</em> as a unit of governance, not about the entire stack. Substrate-level governance &mdash; of the chain, the validator set, the infrastructure providers &mdash; is not eliminated; it is delegated to the chain&rsquo;s own arrangements. A participant&rsquo;s confidence decomposes into confidence in the kernel&rsquo;s invariant bytecode, confidence in the chain&rsquo;s continued operation, and confidence in surrounding infrastructure. Only the first is what the present paper claims is ungoverned; the other two are real dependencies inherited from the choice of underlying chain.
                </PaperRun>
            </PaperSection>

            <PaperSection title="4. The Common Premise: Governance at the Substrate Layer">
                <p>
                    The network-state program assumes the alternative to state coordination is a network polity that must be governed: a founder, a constitution, a process for collective decision, a treasury, internal adjudication, external standing. The blockchain-governance program assumes the alternative to platform-mediated coordination is an on-chain protocol whose rules and parameters must be governed: a governance token, a voting process, a developer foundation, an upgrade path, external legal scaffolding. In both cases the alternative is itself a governed entity.
                </p>
                <PaperRun title="Why the assumption seems necessary.">
                    The assumption is not arbitrary. Most studied protocols are governance-rich &mdash; their parameters change, their rules admit upgrade paths, their treasuries fund development: Ethereum, Bitcoin (through its informal but real social process), Tezos, Cosmos chains, Optimism, Maker. The assumption that network-native coordination requires governance reflects the architectures the programs were analyzing.
                </PaperRun>
                <PaperRun title="Why the assumption is not architecturally forced.">
                    A protocol&rsquo;s parameters and rules need not evolve. A coordination architecture can be designed so its small invariant kernel is fixed at deployment, with all variability pushed to layers above that the kernel does not constrain. The bonded settlement primitive is such an architecture: no admin, no owner, no upgrade path, no governance token, no treasury, no parameter that can be voted on. Whatever assemblies are constituted on top inherit no governance dependency on the kernel and no obligation to participate in its evolution, because the kernel does not evolve. This is not an attempt to evade governance; it is a demonstration that governance is a substrate-design choice, not a necessity. The choice has consequences &mdash; a governance-rich protocol can adapt and correct errors; an invariant kernel cannot &mdash; but the choice exists, and pretending it does not is the move both programs make when they treat substrate-layer governance as constitutive.
                </PaperRun>
                <PaperRemark title="On governance and adaptability.">
                    The most common defense of substrate-layer governance is that adaptability is required. This is forceful for protocols whose function is itself adaptive (lending markets responding to market conditions, scaling layers responding to throughput, identity systems responding to evolving standards). It is weaker for protocols whose function is structurally invariant. A protocol that does one well-defined thing &mdash; enforce a bonded bilateral commitment &mdash; can be invariant in a way that a protocol doing many things subject to external state cannot. The adaptability defense is specific to function, not generic to protocols.
                </PaperRemark>
            </PaperSection>

            <PaperSection title="5. The Ungoverned Substrate: A Structural Alternative">
                <PaperRun title="What &ldquo;ungoverned&rdquo; means here.">
                    The kernel is governed in no respect the contemporary governance literature would recognize: no proposal process, no voting, no quorum, no veto, no executive, no foundation controlling protocol evolution, no privileged update access, no upgrade path. This is governance designed out of the substrate, not absent through inattention &mdash; and the non-discretion has two architectural sources that foreclose different things. Immutability with no admin surface forecloses <em>evolution</em> governance: the deployed bytecode is invariant, so changing the kernel&rsquo;s behavior requires deploying a <em>different kernel</em> at a different address, constituting a different protocol the existing one has no relationship to. Buyer dominance with atomic resolution (Mechanism 2, composing with asymmetric bonding, Mechanism 1) forecloses <em>resolution-time</em> discretion: only the buyer can trigger resolution; resolution settles every active order together or not at all; no third party is in a position to defer, partial-resolve, selectively enforce, or override. Between the two there is no decision-position from which governance could be exercised even if a governance body were stood up adjacent to the kernel.
                </PaperRun>
                <PaperRun title="What this requires of the kernel.">
                    The option is not free. It requires that the kernel&rsquo;s function be specifiable in advance and small enough to be formally specified and verified to a standard that warrants trust without ongoing governance. The ungoverned substrate is purchased by accepting the constraint that its function be amenable to this discipline.
                </PaperRun>
                <PaperRun title="This is not &ldquo;code is law.&rdquo;">
                    Lessig&rsquo;s (2006) &ldquo;code is law&rdquo; has been useful as a slogan and damaging as a method &mdash; useful because it observed that software increasingly performs law&rsquo;s regulatory function, damaging because it obscures the differences between what software and law do (a point both Walch (2017) and De Filippi &amp; Wright (2018) emphasize). The ungoverned-substrate claim does not depend on &ldquo;code is law.&rdquo; It depends on a narrower claim: that the <em>settlement primitive</em> &mdash; a single bilateral function with a deterministic outcome &mdash; is exactly the class for which formal specification, verification, and immutable deployment are appropriate, and that this class is much smaller than &ldquo;everything regulated by software.&rdquo; Law remains where it has always been: in the off-chain forums that adjudicate disputes under conventional doctrines. The kernel is not law; it is settlement infrastructure that produces evidence on which law operates.
                </PaperRun>
                <PaperRun title="What the substrate admits.">
                    A consequence of the ungoverned design is that the substrate admits arbitrary higher-layer arrangements without constraining them. A community can constitute a network state on top of it, with whatever governance it chooses; a group can constitute a DAO; a cooperative can compose itself; a peer network can operate without constituting any entity; two strangers can transact once and never again. A governance-rich substrate would import its governance into every arrangement constituted on it; an ungoverned substrate imports nothing &mdash; arrangements owe it only the use of its public infrastructure, and are free to govern (or not govern) themselves however their participants choose.
                </PaperRun>
                <PaperRemark title="The substrate is sub-political, not anti-political.">
                    The ungoverned substrate is not a rejection of politics or governance; it is a layer beneath them. The political question of how a network state should be governed, the institutional question of how a DAO should decide, the legal question of how an arrangement integrates with conventional jurisdictions &mdash; all remain real and unresolved at the layer at which they apply. What the substrate does is make it possible for these questions to be answered <em>differently in different arrangements</em> on the same infrastructure, rather than uniformly across all arrangements that share it.
                </PaperRemark>
            </PaperSection>

            <PaperSection title="6. Where Governance Returns: At the Graph">
                <p>
                    The argument that the substrate is ungoverned is not the argument that everything constituted on it is ungoverned. Most useful arrangements will have governance of some kind. This section identifies where governance returns and what shape it takes.
                </p>
                <PaperRun title="Assemblies as governed entities.">
                    A bonded multi-party process composed at the substrate is an assembly &mdash; a transaction-scoped arrangement of bonded commitments among multiple parties. A simple assembly (two parties, one commitment) requires no governance: the parties agreed, and the substrate enforces. A complex assembly typically does: questions arise the original commitments did not specify, parties join and leave, disputes require resolution beyond what bonding provides. For complex assemblies, governance is real work the participants must do, and the substrate provides no scaffolding for it. This is a feature, not a gap: the substrate&rsquo;s silence lets assemblies choose the form appropriate to their function &mdash; cooperative, corporate, constitutional, or none. The legal-scaffolding work developed within COALA (De Filippi &amp; Hassan, 2016) remains useful for assemblies that need conventional legal personality; it becomes one option among many rather than a precondition.
                </PaperRun>
                <PaperRun title="How DAOs use the substrate without governing it.">
                    A common objection: DAOs need governance, the primitive is meant for DAOs to use, therefore the primitive needs a governance interface. The objection mistakes a substrate property for a runtime requirement. The kernel admits only an address whose own ECDSA key produced the signature &mdash; an externally-owned account (EOA), or an EIP-7702-delegated EOA, but never a contract wallet authenticating by returning a validity answer under ERC-1271. A DAO or multisig authorizes a signer upstream; the kernel sees only that signer&rsquo;s own signature. And because a permanently lost buyer key strands a process&rsquo;s bonds &mdash; there is no timeout and no recovery &mdash; buyer keys are expected to sit under recoverable custody, at the key-custody layer above the kernel.
                </PaperRun>
                <PaperRun title="Governance authorizes the signer.">
                    A DAO whose commitments require formal governance approval &mdash; quadratic-vote, delegation-based, optimistic &mdash; approves the commitment through its process; the authorized commitment is then signed by the account the governance designates (Compound Governor, 2020; OpenZeppelin Governor, 2024). The substrate sees only that signer&rsquo;s signature; it does not see the vote, the proposal text, or the delegation graph. The DAO&rsquo;s governance is real and operates entirely above the substrate; the substrate is invisible to the governance and the governance is invisible to the substrate.
                </PaperRun>
                <PaperRun title="Streaming upstream of commit.">
                    A DAO with an ongoing disbursement program &mdash; grants, continuous public-goods funding, recurring contributor payments &mdash; can compose a streaming contract upstream of the substrate (Sablier, 2023): the streaming layer handles continuous-flow allocation under the DAO&rsquo;s chosen policy, and the substrate handles the discrete bonded commitments that disburse the streamed funds against specific work. The two layers compose without either&rsquo;s accounting model bending.
                </PaperRun>
                <PaperRun title="Bookkeeping from chain state.">
                    A DAO&rsquo;s accounting and audit read directly from chain state: its disbursement history and commitment portfolio for the disbursed-via-substrate portion are derivable from the substrate&rsquo;s public commit and resolution records without any substrate-specific accommodation. A DAO using the substrate produces verifiable accounting records as a byproduct of operation.
                </PaperRun>
                <p>
                    The patterns share a structural property: each composes with the substrate by treating it as a <em>signature interface</em>, not a governance interface. The standard institutional shapes already in use among DAO and treasury operators (Messari, 2022; DeepDAO, 2024) compose with the substrate without modification. A network-state community, likewise, has its governance work fully in front of it: the substrate provides the missing economic engine, but not the constitutional process, the self-conception, the diplomatic framework, or internal adjudication &mdash; those are the network state&rsquo;s to design.
                </p>
                <PaperRemark title="On infrastructural literacy.">
                    The blockchain-governance program&rsquo;s concern that participants generally cannot evaluate the arrangements they operate under applies to the substrate as to any infrastructure. The substrate does not reduce the literacy gap; it does <em>not expand</em> it. A governance-rich protocol&rsquo;s literacy demand grows as its rules and parameters evolve; an invariant kernel&rsquo;s demand is bounded &mdash; the participant must understand the fixed rules once. This does not solve the literacy problem, but it bounds the problem in a way governance-rich protocols structurally cannot.
                </PaperRemark>
            </PaperSection>

            <PaperSection title="7. Conclusion">
                <p>
                    The network-state and blockchain-governance programs share a structural assumption that the alternative to state coordination must itself be a governed network entity. The bonded settlement primitive realizes a third option neither names: an ungoverned substrate, invariant by design, on which arbitrary governed entities can be composed but which itself is not a governed entity at all. Recognizing the option does not adjudicate among governance forms above the substrate; it relocates the governance question from the substrate to the graph.
                </p>
                <p>
                    The substantive observation is that the choice between a governance-rich substrate and an ungoverned one is a real design choice with real consequences: governance-rich substrates provide adaptability at the cost of an ongoing governance-of-the-governance burden; ungoverned substrates provide invariance at the cost of inability to adapt. For substrate functions amenable to fixed specification &mdash; the bonded settlement primitive being one &mdash; the ungoverned option is available, and its availability is what permits the diversity of higher-layer governance forms the substrate admits.
                </p>
                <p>
                    We close with an observation of method: the kernel is ideologically agnostic; the graph is the politics. Subordination becomes a graph-tier choice because no seller on the substrate is directed by any party &mdash; every participant bonds and settles as an independent value-adder, so any hierarchy above that is composed rather than imposed. Coercion becomes a bounded question because enforcement within the substrate&rsquo;s domain is discretion-free &mdash; pre-committed bonds settle by rule, leaving no enforcer whose discretion could be leveraged against a party. And governance, the present paper&rsquo;s result, becomes a graph-tier choice when the substrate is invariant. In each case the move is the same: a feature prior architectures treated as constitutive of the substrate becomes a graph-tier choice when the substrate is designed to exclude it. The graph is the politics in a strong sense &mdash; the layer at which political-architectural choices are made on infrastructure that makes no political-architectural choices itself &mdash; and the relocation is recursive: future architectures may relocate further substrate variables still.
                </p>
            </PaperSection>
        </PaperLayout>
    );
}
