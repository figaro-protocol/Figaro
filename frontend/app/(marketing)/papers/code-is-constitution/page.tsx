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
        "A decentralized trade protocol occupies the constitutional layer of rules, not the statutory one: it fixes how commitments are recognized and what no rule may do, scores well on Fuller's principles of legality, and leaves ordinary law to govern the actors at its edges with the data it leaves.",
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
                        In 2016 the Ethereum community forked its own chain to reverse the drain of the DAO, and the slogan <em>code is law</em> lost the argument it was coined to win. We propose that the slogan names the wrong layer of rules. A sufficiently decentralized protocol is not a rival body of law but a constitution in the sense of constitutional political economy: an entrenched procedural layer that fixes how commitments are recognized and what no rule may do, held stable by a community that reads it. We test the framing against a concrete artifact, a trade protocol whose Core makes cooperation the equilibrium between strangers by bonds locked before the trade and a resolution only the buyer can call. Against Lon Fuller&rsquo;s eight principles of legality the Core scores well, and for the rules it holds it attains congruence. Three properties protect it from capture: immutability, credible neutrality, and forkability. A federal appellate court has recognized the first in holding that immutable smart contracts cannot be owned. The practical consequence is a demand regulators can apply: regulate the actors at the edges, using the data the protocol leaves, and leave the arithmetic neutral.
                    </p>
                </>
            }
            references={
                <>
                    <li>Alston, E., Law, W., Murtazashvili, I. &amp; Weiss, M. Blockchain Networks as Constitutional and Competitive Polycentric Orders. <em>Journal of Institutional Economics</em>, 18(5):707&ndash;723, 2022.</li>
                    <li>Berman, H. J. <em>Law and Revolution: The Formation of the Western Legal Tradition</em>. Harvard University Press, Cambridge, MA, 1983.</li>
                    <li>Buchanan, J. M. &amp; Tullock, G. <em>The Calculus of Consent: Logical Foundations of Constitutional Democracy</em>. University of Michigan Press, Ann Arbor, 1962.</li>
                    <li>Buterin, V. Credible Neutrality as a Guiding Principle. <em>Nakamoto.com</em>, January 3, 2020.</li>
                    <li>De Filippi, P. &amp; Wright, A. <em>Blockchain and the Law: The Rule of Code</em>. Harvard University Press, Cambridge, MA, 2018.</li>
                    <li>Fuller, L. L. <em>The Morality of Law</em>. Yale University Press, New Haven, 1964.</li>
                    <li>Hart, H. L. A. <em>The Concept of Law</em>. Clarendon Press, Oxford, 1961.</li>
                    <li>Hinman, W. Digital Asset Transactions: When Howey Met Gary (Plastic). Remarks at the Yahoo Finance All Markets Summit: Crypto, San Francisco. U.S. Securities and Exchange Commission, June 14, 2018.</li>
                    <li>Lessig, L. <em>Code and Other Laws of Cyberspace</em>. Basic Books, New York, 1999.</li>
                    <li>Madison, J. Federalist No. 48. 1788.</li>
                    <li>Milgrom, P. R., North, D. C. &amp; Weingast, B. R. The Role of Institutions in the Revival of Trade: The Law Merchant, Private Judges, and the Champagne Fairs. <em>Economics &amp; Politics</em>, 2(1):1&ndash;23, 1990.</li>
                    <li>Murtazashvili, I., Palida, A. &amp; Madison, M. J. The Past, Present, and Future of Polycentric Legal Order: A Comparative Institutional Analysis of Lex Mercatoria and Blockchain. <em>Journal of Institutional Economics</em>, 22:e2, 2026.</li>
                    <li>Ostrom, E. <em>Governing the Commons: The Evolution of Institutions for Collective Action</em>. Cambridge University Press, Cambridge, 1990.</li>
                    <li>Radin, M. J. <em>Boilerplate: The Fine Print, Vanishing Rights, and the Rule of Law</em>. Princeton University Press, Princeton, NJ, 2012.</li>
                    <li>Szabo, N. Money, Blockchains, and Social Scalability. <em>Unenumerated</em>, February 9, 2017.</li>
                    <li><em>Van Loon v. Department of the Treasury</em>, No. 23-50669 (5th Cir. November 26, 2024).</li>
                    <li>Zamfir, V. Against Szabo&rsquo;s Law, For a New Crypto Legal System. <em>Crypto Law Review</em>, January 29, 2019.</li>
                </>
            }
        >
            <PaperSection title="1. A Slogan That Lost Its Own Argument">
                <p>
                    &ldquo;Code is law&rdquo; entered the culture through Lawrence Lessig, who meant it descriptively: software architecture regulates behavior the way law, markets and norms do, and deserves the same scrutiny (Lessig, 1999). Crypto inverted the claim into a normative one. On that reading the program&rsquo;s execution <em>is</em> the agreement, final and beyond appeal.
                </p>
                <p>
                    The inversion failed within its first decade. When the DAO was drained in 2016, the Ethereum community did not accept the execution as the agreement; it forked the chain and unwound the result. The minority that kept the original chain kept the slogan, and the majority kept the users. The lesson is structural: the deepest layer of a blockchain is the social layer that decides which code to run. On Szabo&rsquo;s social-scalability argument, that layer&rsquo;s trust is the scarce resource the technology exists to economize (Szabo, 2017).
                </p>
                <p>
                    The fork was an exercise of constituent power: the authority to re-found an order, which is what constitutions exist to channel. &ldquo;Code is law&rdquo; cannot describe the most important event in its own history. &ldquo;Code is constitution&rdquo; describes it directly: enacted rules executed faithfully, and beneath them a social process that can, at great cost, re-found the order. The strongest objection to code-finality is therefore evidence for the constitutional framing, not against it.
                </p>
                <p>
                    The same conclusion was reached from inside protocol design. Vlad Zamfir argued against &ldquo;Szabo&rsquo;s law&rdquo;, the maxim that a blockchain&rsquo;s rules should change only for technical maintenance, and for a crypto legal system built on the premise that legal systems are protocols for the management of disputes (Zamfir, 2019). That argument is often read as a rejection of rule by code. It reads better as the constitutional framing stated from the governance side: code can hold the entrenched layer, and only a community can hold the constituent one.
                </p>
                <p>
                    <em>Constitution</em> is used here in the sense of constitutional political economy: the rule-choosing level, which fixes how commitments are recognized and what no rule may do. It does not mean an order that coerces anyone. The protocol&rsquo;s relation to enforcement is narrower and can be stated exactly. It makes a stranger&rsquo;s promise credible before the trade, by bonds each party locks and only the buyer&rsquo;s resolution refunds, so the after-the-fact enforcement of that one bargain is needed far less. It leaves every other function of law where it stood. What it hands to law is data: forums read it, rule on it, and cannot move a bond. Section 3 states the mechanism, and Section 6 the data.
                </p>
            </PaperSection>

            <PaperSection title="2. The Constitutional Shape">
                <p>
                    Constitutional political economy rests on a categorical distinction, owed to James Buchanan: choosing the <em>rules of the game</em> is a different act from making <em>moves within the game</em> (Buchanan &amp; Tullock, 1962). Elinor Ostrom found the same structure in self-governing commons: operational rules, nested in collective-choice rules, nested in constitutional rules (Ostrom, 1990). H. L. A. Hart drew the corresponding line in legal theory. Primary rules govern conduct; secondary rules of recognition, change and adjudication are how a system knows what its own law is (Hart, 1961).
                </p>
                <p>
                    A decentralized protocol has a constitution&rsquo;s two-part anatomy. The mathematics fixes the rules: what counts as a valid signature, a valid commitment, a valid resolution. A community of users, builders and node operators sustains the shared understanding under which those rules are read, trusted and, rarely and expensively, re-founded. Neither part works alone. Madison called constitutional text without supporting norms a &ldquo;parchment barrier&rdquo; (Madison, 1788), and a chain whose community will not run its code is parchment in exactly his sense.
                </p>
                <p>
                    Primavera De Filippi and Aaron Wright named the rule-set such systems administer <em>lex cryptographia</em>: rules enforced through self-executing code and decentralized organizations, operating alongside state law and owed analysis on their own terms (De Filippi &amp; Wright, 2018). We accept that analysis and press it one layer down. What distinguishes these systems is less that their rules form a new body of law than where in the hierarchy of rules they sit. Statutes are enacted, applied with discretion and repealed. These rules form the <em>entrenched layer beneath enactment</em>, the term we use for the stratum that fixes how commitments are recognized, how rules may change, and what no rule may do.
                </p>
            </PaperSection>

            <PaperSection title="3. The Artifact Under Test">
                <p>
                    The artifact is a protocol for trade between strangers. Its unit is the <em>order</em>: one commitment between a buyer and a seller, signed by both. A <em>process</em> is a sequence of orders opened by one buyer, counted in one token and closed together. The <em>Core</em> is the set of smart contracts that accepts each order and closes each process, and it has two operations. <em>Commit</em> admits an order when both signatures recover to the named parties over one hash and the bonds arrive. <em>Resolve</em>, which only the buyer may call, closes the process.
                </p>
                <p>
                    The bonds follow one schedule. At commit the buyer bonds <Math>{"2P"}</Math>, twice the payment <Math>{"P"}</Math>, and the seller of each order bonds <Math>{"2G"}</Math>, twice the cumulative value <Math>{"G"}</Math> of the process through its order, its own payment included. At resolution every payment transfers and every bond is refunded at once: each seller receives <Math>{"2G + P"}</Math>, and the buyer its bond less the payment. Resolution is atomic, so every order resolves together or none does and no bond is refunded party by party. The process then dissolves, leaving its data.
                </p>
                <p>
                    The doubling answers retention. Goods pass off the chain, so a party that walks away keeps what is in its hands, and a bond equal to that value would be exactly canceled by the taking. A seller that holds out forfeits <Math>{"2G"}</Math> and keeps at most <Math>{"G"}</Math>, ending at <Math>{"-G"}</Math> or worse against <Math>{"+P"}</Math> for performing. A buyer that never resolves after performance forfeits <Math>{"2P"}</Math> and holds a delivery worth <Math>{"P"}</Math>, ending at <Math>{"-P"}</Math> against <Math>{"0"}</Math> for resolving.
                </p>
                <p>
                    Cooperation is the equilibrium, by three comparisons. After performance the buyer strictly prefers resolving to never resolving, whatever the seller does: this is the one unconditional anchor. Given that, and given the buyer&rsquo;s plan to resolve once performance has occurred and not before, each seller strictly prefers performing. Given the sellers&rsquo; performance, the buyer keeps the process open rather than resolving at once, which would end it at <Math>{"-P"}</Math>. The last two are the parties&rsquo; best-response checks against one profile, so they hold jointly, as a fixed point.
                </p>
                <p>
                    Two mechanisms compose here, and neither substitutes for the other. Asymmetric bonding is what scales: the same schedule at every order secures a process as long as the network can resolve in one call. Buyer dominance with atomic resolution coordinates the process bonding has secured, because no seller is paid until the buyer resolves, so each holds a live interest in every other seller&rsquo;s performance. No exit, timeout or reversal exists. That absence is a constraint protecting the equilibrium, not a third mechanism.
                </p>
                <p>
                    The chain holds fingerprints, never the terms. It holds the parties, the payments, the bonds, the accumulator, and the merkle root of the agreement each order carries; an <em>attestation</em>, a representation a party signs about an open process, is held as the hash of its content. The Core holds no test of performance. A disagreement about what arrived is worked out while the process stands open: the parties negotiate a remedy before resolve, and a forum asked to rule does so on the data a party produces. The forum cannot call resolve; the buyer resolves once satisfied, and resolution is terminal acceptance.
                </p>
                <p>
                    Above the Core sit the terms. A <em>clause</em> is one reusable term, a relationship between a buyer and a seller or between two sellers. An <em>agreement</em> is the clauses composed for one order, and its merkle root is what the order carries. An <em>assembly</em> composes agreements into one reusable design of a process, and a buyer opens a process by selecting one. A <em>designer</em> writes and registers clauses, agreements and assemblies; buyers select them, and sellers bind them by signing.
                </p>
            </PaperSection>

            <PaperSection title="4. Trade&rsquo;s Rule-Makers, in Succession">
                <p>
                    Trade has changed rule-makers before, and the succession shows what a fourth would have to supply. The first was the merchant community itself. Commerce grew across town, fair and jurisdiction faster than any crown&rsquo;s courts could follow, so merchants wrote their own commercial law and staffed their own courts where they traded: the lex mercatoria, one strand within the medieval formation of Western legal institutions (Berman, 1983). At the Champagne fairs, private judges decided disputes with no coercive power of their own (Milgrom, North &amp; Weingast, 1990). Their sanction was exclusion: a trader who ignored a judgment lost his standing to trade at the fair again.
                </p>
                <p>
                    States then assimilated much of this order. Merchant custom was eventually codified, through common law or through decrees in code-based systems, and trade&rsquo;s rule-book moved from the fair court to the ordinary bench and the legislature (Murtazashvili, Palida &amp; Madison, 2026). The reading is contested. The same study reports the view that modern commercial law displaced trade custom rather than incorporating it, and doubts that custom was ever autonomous law. On either reading the shape held: a rule-set trade could rely on, adjudicated by a party with no stake in the dispute.
                </p>
                <p>
                    The shape broke with the platform. A single firm drafts the operative rules of a trade, publishes them as a clickwrap no counterparty negotiates, and reserves the right to amend them at will. It governs millions of strangers who transact through it, and it resolves their disputes in its own support queue, so the party that wrote the rule also rules on whether it was followed. Margaret Jane Radin argues that mass-market boilerplate replaces the rights the law would give its recipients with a scheme the drafter writes, imposed on counterparties who never bargained over it (Radin, 2012). Against the legality principles of Section 5 this rule-maker fails early. A rule its drafter may amend at will has neither constancy nor prospectivity, because tomorrow&rsquo;s dispute may be decided under a rule the trade was not struck under.
                </p>
                <p>
                    A protocol is the fourth rule-maker. Like the law merchant, it returns trade&rsquo;s operative rules to a form every trader may read and use on the same terms. Unlike the law merchant, it needs no bounded community able to enforce exclusion, for the reason Section 7 gives. Unlike the platform, no party can amend the rules that bind it: the Core is immutable, and a different Core is a new deployment beside the old, which a trader adopts only by committing to it. Entry is open to any wallet that can sign and fund its bond.
                </p>
            </PaperSection>

            <PaperSection title="5. Legality Without a Legislator">
                <p>
                    The constitutional claim can be tested, because legal philosophy specified long ago what lawlike rules require. Lon Fuller&rsquo;s <em>The Morality of Law</em> names eight principles of legality: rules must be general, public, prospective, clear, non-contradictory, possible to follow, constant over time, and <em>congruent</em>, meaning the rule as applied is the rule as declared (Fuller, 1964). We take congruence to be the principle legal systems fail most often.
                </p>
                <p>
                    Generality and publicity hold directly. The same code binds every participant, and the Core&rsquo;s code and every transaction it has executed are public. Prospectivity and constancy follow from content-addressing. A clause is its spec, identified by the hash of its bytes; the first registration of that identifier stands and is never rewritten, so a changed spec is a new clause under a new identifier, and no party is bound by an edit made after it signed. Clarity is the spec itself, a fixed document anyone may read and check.
                </p>
                <p>
                    Possibility holds at two checks, kept apart. The Core refuses at commit any order it could not resolve: one whose signatures fail, whose payment is zero, whose bond falls short of the schedule, whose token or buyer differs from the process&rsquo;s, whose deadline has passed, that names a process unknown or already resolved, or that repeats an order already committed. The content of each clause is checked against its published spec before the parties sign. Non-contradiction is the one principle no check secures. Two clauses composed into one agreement could conflict, and consistency is kept by the designer&rsquo;s composition and the parties&rsquo; reading before they sign.
                </p>
                <p>
                    Congruence is attained for the rules the Core holds. Its bond schedule and its transfers at resolution execute exactly as declared, because for a deterministic program the declaration is the application. The caveat belongs here. Whether a delivery met the agreement is the buyer&rsquo;s judgment, exercised when it resolves, and a forum&rsquo;s when one is asked to rule; for those terms, congruence is what judgment makes of the data.
                </p>
                <p>
                    Two further features carry the constitutional reading. First, the Core has no emergency powers. Its two operations are all it has: no actor can pause it, and no path refunds a bond except the buyer&rsquo;s resolution. Any unilateral exit would alter the payoffs that make cooperation the equilibrium, so the absence is a security property; it is equally the entrenchment clause that makes every other guarantee credible. Second, above the Core sit four open registries: clauses, registered agreements and assemblies, each keyed on the hash of its content, and members, keyed on the wallet. Any wallet that places a stake may register. An entry in the clause, agreement or assembly registry, once registered, cannot be rewritten; a member&rsquo;s profile is its own declaration, which the member may update, or withdraw and register afresh. That is a rule of recognition operating in public: the system knows what counts as valid law within it, anyone may propose new law, and nobody may rewrite law already relied upon.
                </p>
                <p>
                    Constitution beneath, open legislation above, and ordinary politics in the assemblies participants compose. The same Core runs a market-liberal assembly, a cooperative one, and an Islamic-finance one without taking a side, because it holds no field in which a side could be taken. The constitution here has no preamble. It is all articles.
                </p>
            </PaperSection>

            <PaperSection title="6. What Capture Actually Targets">
                <p>
                    Does abstraction protect such systems from capture? The intuition is that an algorithm abstract enough to run anywhere is infrastructure rather than product, and so escapes it. The conclusion is close, but abstraction is not the mechanism. GPS is abstract, universal and infrastructure by any definition, and it is operated by the United States military. Universality is necessary; it does not do the work.
                </p>
                <p>
                    Three properties do the work. The first is <em>immutability</em>: entity-targeted law, which is most law, needs a defendant, and the Core is code that executes as written for anyone who calls it and that no party, its deployers included, can alter. This is the substance behind the &ldquo;sufficiently decentralized&rdquo; framing in an SEC official&rsquo;s 2018 remarks, given as his own view and not the Commission&rsquo;s: where no central party&rsquo;s efforts drive the enterprise, the securities category fails to attach (Hinman, 2018). The second is <em>credible neutrality</em>: a mechanism&rsquo;s neutrality must be easy to see, so that participants with different views share a notion of its legitimacy (Buterin, 2020). A rule that names nobody and is public in full leaves capture no hidden privilege to sit in. The third is <em>forkability</em>: the code can be redeployed by anyone, so a captured instance is escaped by exit, and the prize for capture is an empty room.
                </p>
                <p>
                    The law has begun to recognize the first property. In <em>Van Loon v. Department of the Treasury</em> (5th Cir. 2024), a federal appellate court held that immutable smart contracts were not &ldquo;property&rdquo; that the Treasury could block, because property must be capable of being owned. The court described the software as unownable, uncontrollable and unchangeable, even by its creators. The ruling placed nobody above the law; the developers and users of such systems remain as regulable as anyone. It recognized that the artifact itself is a thing, like an open road, not an entity, like a toll company.
                </p>
                <p>
                    That distinction states the division of labor between such systems and the state in one line: <strong>regulate actors, not arithmetic.</strong> A constitution does not abolish ordinary law; it allocates it. Participants at the edges are taxed, licensed and held to consumer protection as they always were. The protocol supplies the law data whose integrity anyone can check. The chain holds, timestamped and immutable, who committed, the bonds, the payments, when the buyer resolved, and the fingerprints of each agreement and attestation. The terms and evidence behind those fingerprints are the parties&rsquo; own, so a forum reads them when a party produces them and checks each against a fingerprint fixed before any dispute arose.
                </p>
            </PaperSection>

            <PaperSection title="7. The Constitution of a Voluntary Order">
                <p>
                    A referee will ask whether a protocol can be a constitution at all. Constitutions constitute polities: they bind persons who never consented, within borders they did not choose. A protocol binds only those who sign. Entry is a voluntary act, a signature and a bond, and so is the choice of each next trade. Once committed, though, a party cannot leave: its bond stays locked until the buyer resolves, and that lock is what the equilibrium of Section 3 rests on. In the classical sense, then, the protocol sits closer to contract than to constitution.
                </p>
                <p>
                    The answer is that such a protocol is the constitution of a <em>voluntary order</em>: Buchanan&rsquo;s constitutional contract, entered at the rule-choosing level by everyone who participates. Institutional economists have begun to analyze blockchains in these terms, as constitutional and polycentric orders that change through internal collective choice and external competitive pressure (Alston, Law, Murtazashvili &amp; Weiss, 2022). For a trade protocol the case is older still. The comparative-institutional argument that blockchain continues the polycentric lineage of the lex mercatoria has been made directly (Murtazashvili, Palida &amp; Madison, 2026).
                </p>
                <p>
                    The bond is where that lineage changes. The fair court excluded a defector after the fact, and only within a community bounded enough to remember him. A bonded commitment makes defection cost the defector before the trade, between strangers who share no community at all. The voluntary order of trade is old; what is new is a rule-maker that meets Fuller&rsquo;s checklist for the rules it holds.
                </p>
            </PaperSection>

            <PaperSection title="8. What the Reframing Changes">
                <p>
                    For builders, the framing is a design criterion, and each part of it is checkable. Entrench the core and give it no emergency powers. Keep rulemaking above it open and non-retroactive. Keep the core neutral among the politics composed on top of it. Fix the fingerprints of the data before any dispute arises.
                </p>
                <p>
                    For lawyers and regulators, the framing replaces a dead-end question with a productive one. &ldquo;Is this code legal?&rdquo; asks for the conduct of an artifact that acts only when a party calls it. &ldquo;What layer of rules is this, and who are the actors at its edges?&rdquo; routes analysis to where it can succeed, and lawyers already know how to ask it, because federal systems allocate layers of rules every day.
                </p>
                <p>
                    The reframing concedes what &ldquo;code is law&rdquo; could never afford to concede. Code is not law: law is enacted by legislatures, applied with discretion, and backed by states. Code of the kind described here is humbler and prior to it, a procedural floor beneath agreement within which any law and any politics can compose. The demand to place on infrastructure of this kind follows: not that it comply as an entity, but that it remain neutral as a procedure.
                </p>
            </PaperSection>

            <PaperSection title="Acknowledgements">
                <p>
                    We thank Vlad Zamfir and Primavera De Filippi, whose years of conversation and collaboration shaped the questions this paper tries to answer. The errors are ours alone.
                </p>
            </PaperSection>
        </PaperLayout>
    );
}
