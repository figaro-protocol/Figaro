import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import {
    PaperLayout,
    PaperSection,
} from "@/components/papers/PaperLayout";
import { Math } from "@/components/papers/Math";

export const metadata: Metadata = withOg({
    title: "Code Is Constitution — Figaro Protocol",
    description:
        "We propose that a decentralized trade protocol occupies the constitutional layer of rules, not the statutory one: it fixes how commitments are recognized and what no rule may do, meets seven of Fuller's eight principles of legality, and leaves ordinary law to govern the actors at its edges with the data it leaves.",
});

export default function CodeIsConstitutionPaper() {
    return (
        <PaperLayout slug="code-is-constitution"
            title="Code Is Constitution"
            subtitle="The Entrenched Layer Beneath Enactment"
            author="Figaro"
            date="July 2026"
            watermark="Figaro Protocol · Preprint"
            abstract={
                <>
                    <p>
                        In 2016 the Ethereum community forked its own chain to reverse the drain of The DAO (an investment fund run by smart contracts on Ethereum), and the slogan <em>code is law</em> lost the argument it was coined to win. We propose that the slogan names the wrong layer of rules. A sufficiently decentralized protocol is not a rival body of law but a constitution in the sense of constitutional political economy: an entrenched procedural layer that fixes how commitments are recognized and what no rule may do, held stable by a community that reads it. We test the framing against a concrete artifact, a trade protocol. Its Core is the set of smart contracts that accepts each order and closes each process. It makes cooperation the equilibrium between strangers, given a buyer that resolves once performance has occurred and not before, by bonds locked before the trade and a resolution only the buyer can call. Against Lon Fuller&rsquo;s eight principles of legality the Core meets seven; non-contradiction rests on the designer and the parties, and congruence holds for the rules the Core itself holds. We argue that three properties protect it from capture: immutability, credible neutrality, and forkability. A federal appellate court has recognized the first in holding that immutable smart contracts cannot be owned. The practical consequence is a demand regulators can apply: regulate the actors at the edges, using the data the protocol leaves, and leave the arithmetic neutral.
                    </p>
                </>
            }
            references={
                <>
                    <li>Alston, Eric, Wilson Law, Ilia Murtazashvili, and Martin Weiss. 2022. &ldquo;Blockchain Networks as Constitutional and Competitive Polycentric Orders.&rdquo; <em>Journal of Institutional Economics</em> 18 (5): 707&ndash;723. https://doi.org/10.1017/S174413742100093X.</li>
                    <li>Berman, Harold J. 1983. <em>Law and Revolution: The Formation of the Western Legal Tradition</em>. Cambridge, MA: Harvard University Press.</li>
                    <li>Buchanan, James M., and Gordon Tullock. 1962. <em>The Calculus of Consent: Logical Foundations of Constitutional Democracy</em>. Ann Arbor: University of Michigan Press.</li>
                    <li>Buterin, Vitalik. 2020. &ldquo;Credible Neutrality as a Guiding Principle.&rdquo; <em>Nakamoto</em>, January 3, 2020. Archived January 6, 2020, at http://archive.md/20200106090252/https://nakamoto.com/credible-neutrality/. Republished at <em>balajis.com</em>, https://balajis.com/p/credible-neutrality. Accessed October 19, 2026.</li>
                    <li>De Filippi, Primavera, and Aaron Wright. 2018. <em>Blockchain and the Law: The Rule of Code</em>. Cambridge, MA: Harvard University Press. https://doi.org/10.4159/9780674985933.</li>
                    <li>Figaro. 2026. &ldquo;Asymmetric Bonding and Buyer Dominance: Two Composing Mechanisms for Self-Enforcing N-Party Coordination.&rdquo; Preprint. https://figaroprotocol.com/papers/asymmetric-bonding/. Accessed October 18, 2026.</li>
                    <li>Fuller, Lon L. 1964. <em>The Morality of Law</em>. New Haven, CT: Yale University Press.</li>
                    <li>Hart, H. L. A. 1961. <em>The Concept of Law</em>. Oxford: Clarendon Press.</li>
                    <li>Hinman, William. 2018. &ldquo;Digital Asset Transactions: When Howey Met Gary (Plastic).&rdquo; Remarks at the Yahoo Finance All Markets Summit: Crypto, San Francisco, CA, June 14, 2018. US Securities and Exchange Commission. https://www.sec.gov/news/speech/speech-hinman-061418.</li>
                    <li>Lessig, Lawrence. 1999. <em>Code and Other Laws of Cyberspace</em>. New York: Basic Books.</li>
                    <li>Madison, James. 1788. &ldquo;The Federalist No. 48: These Departments Should Not Be So Far Separated as to Have No Constitutional Control over Each Other.&rdquo; <em>New York Packet</em>, February 1, 1788.</li>
                    <li>Milgrom, Paul R., Douglass C. North, and Barry R. Weingast. 1990. &ldquo;The Role of Institutions in the Revival of Trade: The Law Merchant, Private Judges, and the Champagne Fairs.&rdquo; <em>Economics and Politics</em> 2 (1): 1&ndash;23. https://doi.org/10.1111/j.1468-0343.1990.tb00020.x.</li>
                    <li>Murtazashvili, Ilia, Ali Palida, and Michael J. Madison. 2026. &ldquo;The Past, Present, and Future of Polycentric Legal Order: A Comparative Institutional Analysis of <em>Lex Mercatoria</em> and Blockchain.&rdquo; <em>Journal of Institutional Economics</em> 22: e2. https://doi.org/10.1017/S1744137425100386.</li>
                    <li>Ostrom, Elinor. 1990. <em>Governing the Commons: The Evolution of Institutions for Collective Action</em>. Cambridge: Cambridge University Press. https://doi.org/10.1017/CBO9780511807763.</li>
                    <li>Radin, Margaret Jane. 2012. <em>Boilerplate: The Fine Print, Vanishing Rights, and the Rule of Law</em>. Princeton, NJ: Princeton University Press.</li>
                    <li>Szabo, Nick. 2017. &ldquo;Money, Blockchains, and Social Scalability.&rdquo; <em>Unenumerated</em> (blog), February 9, 2017. https://unenumerated.blogspot.com/2017/02/money-blockchains-and-social-scalability.html. Accessed October 20, 2026.</li>
                    <li><em>Van Loon v. Department of the Treasury</em>, No. 23-50669 (5th Cir. Nov. 26, 2024). https://www.ca5.uscourts.gov/opinions/pub/23/23-50669-CV0.pdf. Accessed October 20, 2026.</li>
                    <li>Zamfir, Vlad. 2019. &ldquo;Against Szabo&rsquo;s Law, for a New Crypto Legal System.&rdquo; <em>Crypto Law Review</em> (Medium), January 26, 2019. https://medium.com/cryptolawreview/against-szabos-law-for-a-new-crypto-legal-system-d00d0f3d3827. Archived by the Internet Archive, March 17, 2019, https://web.archive.org/web/20190317143303/https://medium.com/cryptolawreview/against-szabos-law-for-a-new-crypto-legal-system-d00d0f3d3827. Accessed October 23, 2026.</li>
                </>
            }
        >
            <PaperSection title="1. A Slogan That Lost Its Own Argument">
                <p>
                    &ldquo;Code is law&rdquo; entered the culture through Lawrence Lessig, who meant it descriptively: software architecture regulates behavior the way law, markets, and norms do, and deserves the same scrutiny (Lessig 1999). Crypto inverted the claim into a normative one. On that reading the program&rsquo;s execution <em>is</em> the agreement, final and beyond appeal.
                </p>
                <p>
                    The inversion failed within its first decade. When The DAO (an investment fund run by smart contracts on Ethereum) was drained in 2016, the Ethereum community did not accept the execution as the agreement; it forked the chain and unwound the result. The minority that kept the original chain kept the slogan, and the majority kept the users. The lesson is structural: the deepest layer of a blockchain is the social layer that decides which code to run. On Szabo&rsquo;s social-scalability argument, that layer&rsquo;s trust is the scarce resource the technology exists to economize (Szabo 2017).
                </p>
                <p>
                    The fork was an exercise of constituent power: the authority to re-found an order, which is what constitutions exist to channel. &ldquo;Code is law&rdquo; cannot describe the most important event in its own history. &ldquo;Code is constitution&rdquo; describes it directly: enacted rules executed faithfully, and beneath them a social process that can, at great cost, re-found the order. The strongest objection to code-finality is therefore evidence for the constitutional framing, not against it.
                </p>
                <p>
                    The same conclusion was reached from inside protocol design. Vlad Zamfir argued against &ldquo;Szabo&rsquo;s law&rdquo;, the maxim that a blockchain&rsquo;s rules should change only for technical maintenance, and for a crypto legal system built on the premise that legal systems are protocols for the management of disputes (Zamfir 2019). That argument is often read as a rejection of rule by code. It reads better as the constitutional framing stated from the governance side: code can hold the entrenched layer, and only a community can hold the constituent one.
                </p>
                <p>
                    <em>Constitution</em> is used here in the sense of constitutional political economy, the rule-choosing level that Section 2 defines. The protocol&rsquo;s relation to enforcement is narrower and can be stated exactly. It makes a stranger&rsquo;s promise credible before the trade, by bonds each party locks and only the buyer&rsquo;s resolution refunds. Where the parties play the equilibrium of Section 3, the after-the-fact enforcement of that one bargain is therefore needed far less. It leaves every other function of law where it stood. Section 3 states the mechanism, and Section 6 the data it hands to law.
                </p>
            </PaperSection>

            <PaperSection title="2. The Constitutional Shape">
                <p>
                    Constitutional political economy rests on a categorical distinction, owed to James Buchanan: choosing the <em>rules of the game</em> is a different act from making <em>moves within the game</em> (Buchanan and Tullock 1962). Elinor Ostrom found the same structure in self-governing commons: operational rules, nested in collective-choice rules, nested in constitutional rules (Ostrom 1990). H. L. A. Hart drew the corresponding line in legal theory. Primary rules govern conduct; secondary rules of recognition, change, and adjudication are how a system knows what its own law is (Hart 1961).
                </p>
                <p>
                    A decentralized protocol has a constitution&rsquo;s two-part anatomy. The mathematics fixes the rules: what counts as a valid signature, a valid commitment, a valid resolution. A community of users, builders, and node operators sustains the shared understanding under which those rules are read, trusted and, rarely and expensively, re-founded. Neither part works alone. Madison called constitutional text without supporting norms &ldquo;parchment barriers&rdquo; (Madison 1788), and a chain whose community will not run its code is parchment in exactly his sense.
                </p>
                <p>
                    Primavera De Filippi and Aaron Wright named the rule-set such systems administer <em>lex cryptographia</em>: rules enforced through self-executing code and decentralized organizations, operating alongside state law and owed analysis on their own terms (De Filippi and Wright 2018). We accept that analysis and press it one layer down. What distinguishes these systems is less that their rules form a new body of law than where in the hierarchy of rules they sit. Statutes are enacted, applied with discretion, and repealed. These rules form the <em>entrenched layer beneath enactment</em>, the term we use for the stratum that fixes how commitments are recognized, how rules may change, and what no rule may do.
                </p>
            </PaperSection>

            <PaperSection title="3. The Artifact Under Test">
                <p>
                    The artifact is a protocol for trade between strangers. Its unit is the <em>order</em>: one commitment between a buyer and a seller, signed by both. A <em>process</em> is a sequence of orders opened by one buyer, counted in one token (a unit of value a contract on the chain issues and transfers), and closed together. The <em>Core</em> is the set of smart contracts that accepts each order and closes each process, and it has two operations. <em>Commit</em> admits an order when both signatures recover to the named parties over one hash (a fixed-length fingerprint of data, which any change to the data alters) and the bonds arrive. <em>Resolve</em>, which only the buyer may call, closes the process.
                </p>
                <p>
                    The bonds follow one schedule. At commit the buyer bonds <Math>{"2P"}</Math>, twice the payment <Math>{"P"}</Math>, and the seller of each order bonds <Math>{"2G"}</Math>, twice the cumulative value <Math>{"G"}</Math> of the process through its order, its own payment included. At resolution every payment transfers and every bond is refunded at once: each seller receives <Math>{"2G + P"}</Math>, and the buyer its bond less the payment. Resolution is atomic, so every order resolves together or none does and no bond is refunded party by party. The process then dissolves, leaving its data.
                </p>
                <p>
                    The doubling answers retention. Goods pass off the chain, so a party that walks away keeps what is in its hands, and a bond equal to that value would be exactly canceled by the taking (Figaro 2026, Definition 7). A seller that holds out leaves its <Math>{"2G"}</Math> locked and keeps at most <Math>{"G"}</Math>, ending at <Math>{"-G"}</Math> or worse against <Math>{"+P"}</Math> for performing. A buyer that never resolves after performance leaves its <Math>{"2P"}</Math> locked and holds a delivery worth <Math>{"P"}</Math>, ending at <Math>{"-P"}</Math> against <Math>{"0"}</Math> for resolving.
                </p>
                <p>
                    Cooperation is the equilibrium, by three comparisons. After performance the buyer strictly prefers resolving to never resolving, with no assumption about the seller: this is the one unconditional anchor. Given that, and given the buyer&rsquo;s plan to resolve once performance has occurred and not before, each seller strictly prefers performing. Given the sellers&rsquo; performance, the buyer keeps the process open rather than resolving at once, which would end it at <Math>{"-P"}</Math>. The last two are the parties&rsquo; best-response checks against one profile, so they hold jointly, as a fixed point. The three comparisons are proved, for any number of orders the network resolves in one call, in Figaro (2026).
                </p>
                <p>
                    Two mechanisms compose here, and neither substitutes for the other. Asymmetric bonding is what scales: the same schedule at every order secures a process as long as the network can resolve in one call. Buyer dominance with atomic resolution coordinates the process bonding has secured, because no seller is paid until the buyer resolves, so each holds a live interest in every other seller&rsquo;s performance. Only the buyer&rsquo;s resolution closes a process or releases a bond. That rule is a constraint protecting the equilibrium the two mechanisms induce, rather than a third mechanism. A buyer that loses its key strands every bond in its process unless an arrangement installed on its wallet while it still held the key can resolve for it; the arrangement is the wallet&rsquo;s, never the mechanism&rsquo;s.
                </p>
                <p>
                    The chain holds fingerprints, never the terms. It holds, timestamped and immutable, the parties, the payments, the bonds, the accumulator, the moment the buyer resolved, and the merkle root of each order&rsquo;s agreement (a single hash committing to every clause of the agreement). An <em>attestation</em>, a representation a party signs about an open process, is held as the hash of its content. The Core holds no test of performance. A disagreement about what arrived is worked out while the process stands open: the parties negotiate a remedy before resolve, and a forum asked to rule does so on the data a party produces. The forum cannot call resolve; the buyer resolves once satisfied, and resolution is terminal acceptance.
                </p>
                <p>
                    Above the Core sit the terms. A <em>clause</em> is one reusable term, a relationship between a buyer and a seller or between two sellers. An <em>agreement</em> is the clauses composed for one order, and its merkle root is what the order carries. An <em>assembly</em> composes agreements into one reusable design of a process, and a buyer opens a process by selecting one. A <em>designer</em> writes and registers clauses, agreements, and assemblies; sellers bind the assemblies in their profiles as standing offers, and buyers select them.
                </p>
            </PaperSection>

            <PaperSection title="4. A Protocol Is Trade&rsquo;s Fourth Rule-Maker">
                <p>
                    Trade has changed rule-makers before, and the succession shows what a fourth would have to supply. The first was the merchant community itself. Commerce grew across town, fair, and jurisdiction faster than any crown&rsquo;s courts could follow. Merchants therefore wrote their own commercial law and staffed their own courts where they traded: the <em>lex mercatoria</em>, one strand within the medieval formation of Western legal institutions (Berman 1983). At the Champagne fairs, private judges decided disputes with no coercive power of their own (Milgrom, North, and Weingast 1990). Their sanction was exclusion: a trader who ignored a judgment lost his standing to trade at the fair again.
                </p>
                <p>
                    States then assimilated much of this order. Merchant custom was eventually codified, through common law or through decrees in code-based systems, and trade&rsquo;s rule-book moved from the fair court to the ordinary bench and the legislature (Murtazashvili, Palida, and Madison 2026). The reading is contested. The same study reports the view that modern commercial law displaced trade custom rather than incorporating it, and doubts that custom was ever autonomous law. On either reading the shape held: a rule-set trade could rely on, adjudicated by a party with no stake in the dispute.
                </p>
                <p>
                    The shape broke with the platform. A single firm drafts the operative rules of a trade, publishes them as a clickwrap no counterparty negotiates, and reserves the right to amend them at will. It governs millions of strangers who transact through it, and it resolves their disputes in its own support queue, so the party that wrote the rule also rules on whether it was followed. Margaret Jane Radin argues that mass-market boilerplate replaces the rights the law would give its recipients with a scheme the drafter writes, imposed on counterparties who never bargained over it (Radin 2012). Against the legality principles of Section 5 this rule-maker fails early. A rule its drafter may amend at will has neither constancy nor prospectivity, because tomorrow&rsquo;s dispute may be decided under a rule the trade was not struck under.
                </p>
                <p>
                    A protocol is the fourth rule-maker. Like the law merchant, it returns trade&rsquo;s operative rules to a form every trader may read and use on the same terms. Unlike the law merchant, it needs no bounded community able to enforce exclusion, for the reason Section 7 gives. Unlike the platform&rsquo;s terms, the Core&rsquo;s rules execute as deployed for every party, and Section 6 gives the reason. A different Core is a new deployment beside the old, which a trader adopts only by committing to it. Entry is open to any wallet (a signing key and the balance it controls) that can sign and fund its bond.
                </p>
            </PaperSection>

            <PaperSection title="5. The Core Meets Seven of Fuller&rsquo;s Eight Principles">
                <p>
                    The constitutional claim can be tested, because legal philosophy specified long ago what lawlike rules require. Lon Fuller&rsquo;s <em>The Morality of Law</em> names eight principles of legality: rules must be general, public, prospective, clear, non-contradictory, possible to follow, constant over time, and <em>congruent</em>, meaning the rule as applied is the rule as declared (Fuller 1964). The Core meets seven of them, and the paragraphs below take each in turn.
                </p>
                <p>
                    Generality and publicity hold directly. The same code binds every participant, and the Core&rsquo;s code and every transaction it has executed are public. Prospectivity and constancy follow from content-addressing. A clause is its spec, identified by the hash of its bytes. The first registration of that identifier stands and is never rewritten, so a changed spec is a new clause under a new identifier. No party is bound by an edit made after it signed. Clarity is the spec itself, a fixed document anyone may read and check.
                </p>
                <p>
                    Possibility holds at two checks, kept apart. The Core refuses at commit any order that breaks its rules. It refuses one whose signatures fail, whose payment is zero, whose bonds do not arrive in full, or whose deadline has passed. It refuses as well one whose stated cumulative value differs from the process&rsquo;s accumulator, whose token or buyer differs from the process&rsquo;s, that names a process unknown or already resolved, or that repeats an order already committed. The content of each clause is checked against its published spec before the parties sign. A process grown past the orders one call can resolve is refused before commit by whatever assembles it, since the Core cannot know the size a design intends. Non-contradiction is the one principle no check secures. Two clauses composed into one agreement could conflict, and consistency is kept by the designer&rsquo;s composition and the parties&rsquo; reading before they sign.
                </p>
                <p>
                    Congruence is attained for the rules the Core holds. Its bond schedule and its transfers at resolution execute exactly as declared, because for a deterministic program the declaration is the application. Is congruence then true by definition, since such a program applies its bugs as faithfully as its rules? It is a checked property, because the code is held to published specifications written apart from it. The bonds the code takes and the transfers it makes at resolution are checked against those specifications by tests, symbolic execution, and specification checking of the code. A formal model of the same rules is checked as well, by model checking. The caveat belongs here. Whether a delivery met the agreement is the buyer&rsquo;s judgment, exercised when it resolves, and a forum&rsquo;s when one is asked to rule; for those terms, congruence is what judgment makes of the data.
                </p>
                <p>
                    Two further features carry the constitutional reading. First, the Core&rsquo;s two operations are all it has, and the buyer&rsquo;s resolution is the one path that refunds a bond. That closure, which Section 3 shows protects the equilibrium, is also the entrenchment clause that makes every other guarantee credible.
                </p>
                <p>
                    Second, above the Core sit four open registries, and any wallet that places a stake may register in them. A <em>stake</em> is an amount of the chain&rsquo;s own currency the wallet places to register and may later reclaim; it is distinct from the bonds an order locks. Three registries hold designs, each keyed on the hash of its content: clauses, registered agreements, and assemblies. A <em>registered agreement</em> is an agreement registered under a stake in its own registry, the reusable unit a designer composes an assembly from. The fourth holds members, keyed on the wallet. An entry in the clause, agreement, or assembly registry, once registered, cannot be rewritten; a member&rsquo;s profile is its own declaration, which the member may update, or withdraw and register afresh. That is a rule of recognition operating in public: the system knows what counts as valid law within it, anyone may propose new law, and nobody may rewrite law already relied upon.
                </p>
                <p>
                    Constitution beneath, open legislation above, and ordinary politics in the assemblies designers compose and participants select. The same Core runs a market-liberal assembly, a cooperative one, and an Islamic-finance one without taking a side, because it holds no field in which a side could be taken. The constitution here has no preamble. It is all articles.
                </p>
            </PaperSection>

            <PaperSection title="6. Immutability, Neutrality, and Forkability Resist Capture">
                <p>
                    Does abstraction protect such systems from capture? The intuition is that an algorithm abstract enough to run anywhere is infrastructure rather than product, and so escapes it. The conclusion is close, but abstraction is not the mechanism. GPS is abstract, universal, and infrastructure by any definition, and it is operated by the United States military. Universality is necessary; it does not do the work.
                </p>
                <p>
                    Three properties do the work. The first is <em>immutability</em>: entity-targeted law, which is most law, needs a defendant. The Core is code that executes as deployed for anyone who calls it, and every party, its deployers included, calls the same immutable code. This is the substance behind the &ldquo;sufficiently decentralized&rdquo; framing an SEC official offered in 2018 as his own view: where no central party&rsquo;s efforts drive the enterprise, the securities category fails to attach (Hinman 2018). The second is <em>credible neutrality</em>: a mechanism&rsquo;s neutrality must be easy to see, so that participants with different views share a notion of its legitimacy (Buterin 2020). A rule that names nobody and is public in full leaves capture no hidden privilege to sit in. The third is <em>forkability</em>: the code can be redeployed by anyone, so a captured instance is escaped by exit, and the prize for capture is an empty room.
                </p>
                <p>
                    Does exit not cost the participants who sit on the captured instance? It does: exit to a fork forgoes the network&rsquo;s users and data, and that cost is the price of the exit credited here. The room empties as far as participants judge capture worse than that price. Capture can also aim below the protocol, at the base chain that includes its transactions, and redeploying the Core leaves that capture in place. The Core inherits its chain&rsquo;s security and resistance to censorship, so capture at the base chain is a limit this argument states and leaves standing.
                </p>
                <p>
                    The law has begun to recognize the first property. In <em>Van Loon v. Department of the Treasury</em> (5th Cir. 2024), a federal appellate court held that immutable smart contracts were not &ldquo;property&rdquo; that the Treasury could block, because property must be capable of being owned. The court described the software as unownable, uncontrollable, and unchangeable, even by its creators. The ruling placed nobody above the law; the developers and users of such systems remain as regulable as anyone. It recognized that the artifact itself is a thing, like an open road, not an entity, like a toll company.
                </p>
                <p>
                    That distinction states the division of labor between such systems and the state in one line: regulation applies to the actors, and the arithmetic stays neutral. A constitution does not abolish ordinary law; it allocates it. Participants at the edges are taxed, licensed, and held to consumer protection as they always were. The protocol supplies the law data whose integrity anyone can check. The chain keeps the data Section 3 lists. The terms and evidence behind its fingerprints are the parties&rsquo; own, so a forum reads them when a party produces them and checks each against a fingerprint fixed before any dispute arose.
                </p>
            </PaperSection>

            <PaperSection title="7. The Constitution of a Voluntary Order">
                <p>
                    A referee will ask whether a protocol can be a constitution at all. Constitutions constitute polities: they bind persons who never consented, within borders they did not choose. A protocol binds only those who sign. Entry is a voluntary act, a signature and a bond, and so is the choice of each next trade. Once committed, though, a party cannot leave: its bond stays locked until the buyer resolves, and that lock is what the equilibrium of Section 3 rests on. In the classical sense, then, the protocol sits closer to contract than to constitution.
                </p>
                <p>
                    The answer is that such a protocol is the constitution of a <em>voluntary order</em>: Buchanan&rsquo;s constitutional contract, entered at the rule-choosing level by everyone who participates. Institutional economists have begun to analyze blockchains in these terms, as constitutional and polycentric orders that change through internal collective choice and external competitive pressure (Alston et al. 2022). For a trade protocol the case is older still. The comparative-institutional argument that blockchain continues the polycentric lineage of the <em>lex mercatoria</em> has been made directly (Murtazashvili, Palida, and Madison 2026).
                </p>
                <p>
                    The bond is where that lineage changes. The fair court excluded a defector after the fact, and only within a community bounded enough to remember him. A bonded commitment locks what defection would cost the defector before the trade, between strangers who share no community at all. The voluntary order of trade is old; what is new is a rule-maker that meets Fuller&rsquo;s checklist for the rules it holds.
                </p>
            </PaperSection>

            <PaperSection title="8. The Demand Is Neutrality as a Procedure">
                <p>
                    The reframing concedes what &ldquo;code is law&rdquo; could never afford to concede. Code is not law: law is enacted by legislatures, applied with discretion, and backed by states. Code of the kind described here is humbler and prior to it, a procedural floor beneath agreement within which any law and any politics can compose. Lawyers and regulators then ask a question they already know how to answer, because federal systems allocate layers of rules every day: what layer of rules is this, and who are the actors at its edges? The demand to place on infrastructure of this kind follows: that it remain neutral as a procedure, while the actors at its edges comply as they always have.
                </p>
            </PaperSection>

            <PaperSection title="Acknowledgments">
                <p>
                    We thank Vlad Zamfir and Primavera De Filippi, whose years of conversation and collaboration shaped the questions this paper tries to answer. The errors are ours alone.
                </p>
            </PaperSection>
        </PaperLayout>
    );
}
