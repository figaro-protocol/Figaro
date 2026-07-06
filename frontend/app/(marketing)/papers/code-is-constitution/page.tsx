import type { Metadata } from "next";
import {
    PaperLayout,
    PaperSection,
} from "@/components/papers/PaperLayout";

export const metadata: Metadata = {
    title: "Code Is Constitution — Figaro Protocol",
    description:
        "Against 'code is law': sufficiently decentralized protocols are not rival legal systems but the entrenched procedural layer beneath enactment — rules about rules, held stable by a normative community, with ordinary law re-seated at the boundary as a consumer of the protocol's evidence.",
};

export default function CodeIsConstitutionPaper() {
    return (
        <PaperLayout
            title="Code Is Constitution"
            subtitle="The Entrenched Layer Beneath Enactment"
            author="Alessandro Daliana"
            date="July 2026"
            watermark="Figaro Protocol · Preprint"
            keywords="constitutional political economy, code is law, lex cryptographia, credible neutrality, legality, lex mercatoria, decentralized protocols, entrenchment"
            abstract={
                <>
                    <p>
                        Since Bitcoin, the public debate over crypto has been framed by a slogan: <em>code is law</em>. The slogan misstates what the technology does and invites the wrong arguments &mdash; it casts protocols as rivals to legal systems and then loses that argument every time a community overrides its own code. This paper proposes a different framing: <em>code is constitution</em>. A constitution is not enacted law; it is the entrenched procedural layer beneath enactment &mdash; rules about rules, held stable within a normative community that makes them legible and acceptable. Sufficiently decentralized protocols have exactly this shape: the mathematics sets the rules of the game, the community sets the norms under which those rules are read, and ordinary law is not displaced but re-seated at the boundary, where courts consume the protocol&rsquo;s evidence rather than operate its core. The paper develops the framing against constitutional political economy and legal theory, and tests it against a concrete artifact &mdash; a settlement kernel for trade with no administrator, no owner, and no emergency powers. It then draws the practical consequence: the right demand to place on infrastructure of this kind is not &ldquo;comply as an entity&rdquo; but &ldquo;remain neutral as a procedure,&rdquo; because there is no entity there to regulate &mdash; a fact a federal appellate court has recognized in holding that such artifacts are not ownable property.
                    </p>
                </>
            }
            references={
                <>
                    <li>Alston, E., Law, W., Murtazashvili, I. &amp; Weiss, M. Blockchain Networks as Constitutional and Competitive Polycentric Orders. <em>Journal of Institutional Economics</em>, 18(5):707&ndash;723, 2022.</li>
                    <li>Buchanan, J. M. &amp; Tullock, G. <em>The Calculus of Consent: Logical Foundations of Constitutional Democracy</em>. University of Michigan Press, Ann Arbor, 1962.</li>
                    <li>Buterin, V. Credible Neutrality as a Guiding Principle. <em>Nakamoto.com</em>, January 3, 2020.</li>
                    <li>De Filippi, P. &amp; Wright, A. <em>Blockchain and the Law: The Rule of Code</em>. Harvard University Press, Cambridge, MA, 2018.</li>
                    <li>Fuller, L. L. <em>The Morality of Law</em>. Yale University Press, New Haven, 1964.</li>
                    <li>Hart, H. L. A. <em>The Concept of Law</em>. Clarendon Press, Oxford, 1961.</li>
                    <li>Hinman, W. Digital Asset Transactions: When Howey Met Gary (Plastic). U.S. Securities and Exchange Commission, June 14, 2018.</li>
                    <li>Lessig, L. <em>Code and Other Laws of Cyberspace</em>. Basic Books, New York, 1999.</li>
                    <li>Madison, J. Federalist No. 48. 1788.</li>
                    <li>Murtazashvili, I., Palida, A. &amp; Madison, M. J. The Past, Present, and Future of Polycentric Legal Order: A Comparative Institutional Analysis of Lex Mercatoria and Blockchain. <em>Journal of Institutional Economics</em>, 22:e2, 2026.</li>
                    <li>Ostrom, E. <em>Governing the Commons: The Evolution of Institutions for Collective Action</em>. Cambridge University Press, Cambridge, 1990.</li>
                    <li>Szabo, N. Money, Blockchains, and Social Scalability. <em>Unenumerated</em>, February 9, 2017.</li>
                    <li><em>Van Loon v. Department of the Treasury</em>, No. 23-50669 (5th Cir. November 26, 2024).</li>
                    <li>Zamfir, V. Against Szabo&rsquo;s Law, For a New Crypto Legal System. <em>Crypto Law Review</em>, January 29, 2019.</li>
                </>
            }
        >
            <PaperSection title="1. A Slogan That Lost Its Own Argument">
                <p>
                    &ldquo;Code is law&rdquo; entered the culture through Lawrence Lessig, who meant it descriptively: software architecture regulates behavior the way law, markets, and norms do, and we should scrutinize it accordingly (Lessig, 1999). Crypto inverted the claim into a normative one &mdash; the program&rsquo;s execution <em>is</em> the agreement, final and beyond appeal.
                </p>
                <p>
                    The inversion failed empirically within its first decade. When the DAO was drained in 2016, the Ethereum community did not accept the execution as the agreement; it forked the chain and unwound the result. The minority that kept the original chain kept the slogan; the majority kept the users. Whatever one thinks of that episode, its lesson is structural: the deepest layer of a blockchain is not its code but the social layer that decides which code to run &mdash; the layer whose trust, on Szabo&rsquo;s own social-scalability argument, is the resource the technology exists to economize (Szabo, 2017).
                </p>
                <p>
                    Notice what the fork actually was. A community exercised constituent power &mdash; the authority to re-found the order &mdash; over its enacted rules, the thing constitutions are <em>for</em>. &ldquo;Code is law&rdquo; cannot describe the most important event in its own history. &ldquo;Code is constitution&rdquo; describes it natively: enacted rules executed faithfully, beneath them an extraordinary social process that can, at extraordinary cost, re-found the order. The strongest objection to code-finality is not an objection to the constitutional framing; it is evidence for it.
                </p>
                <p>
                    The same conclusion was reached from inside the protocol-design community itself. Vlad Zamfir&rsquo;s case against &ldquo;Szabo&rsquo;s law&rdquo; &mdash; the maxim that a blockchain&rsquo;s rules should change only for technical maintenance &mdash; insisted that blockchain governance is, and ought to remain, a social process: a crypto-legal order that pretends otherwise is making a political claim while denying that it is one (Zamfir, 2019). That argument, often read as a rejection of rule-by-code, is better read as the constitutional framing stated from the governance side: code can hold the entrenched layer, but only a community can hold the constituent one.
                </p>
            </PaperSection>

            <PaperSection title="2. The Constitutional Shape">
                <p>
                    Constitutional political economy rests on a categorical distinction, owed to James Buchanan: choosing the <em>rules of the game</em> is a different act from making <em>moves within the game</em> (Buchanan &amp; Tullock, 1962). Elinor Ostrom found the same structure empirically in self-governing commons: operational rules, nested in collective-choice rules, nested in constitutional rules (Ostrom, 1990). H. L. A. Hart drew the corresponding line in legal theory between primary rules of conduct and secondary rules &mdash; of recognition, change, and adjudication &mdash; by which a system knows what its own law is (Hart, 1961).
                </p>
                <p>
                    A framer writes governance rules within a normative social context that makes them acceptable to the governed. A decentralized protocol has the same two-part anatomy: the mathematics fixes the rules &mdash; what counts as a valid signature, a valid commitment, a valid settlement &mdash; and a community of users, builders, and node operators sustains the shared understanding under which those rules are read, trusted, and, rarely and expensively, re-founded. Neither part works alone. Madison called constitutional text without supporting norms a &ldquo;parchment barrier&rdquo; (Madison, 1788); a chain whose community will not run its code is parchment in exactly his sense.
                </p>
                <p>
                    Legal theory has already mapped much of this terrain. Primavera De Filippi and Aaron Wright, in the most sustained treatment the field has received, named the rule-set such systems administer <em>lex cryptographia</em> &mdash; rules enforced through self-executing code and decentralized organizations, operating alongside state law and demanding analysis on their own terms rather than dismissal or deference (De Filippi &amp; Wright, 2018). The framing offered here accepts that analysis and presses it one layer down. What distinguishes these systems is not that their rules form a new <em>body</em> of law beside the old ones, but where in the hierarchy of rules they sit: not statutes, which are enacted, applied with discretion, and repealed, but the entrenched procedural stratum <em>beneath</em> enactment. That stratum fixes how commitments are recognized, how rules may change, and what no rule may do.
                </p>
                <p>
                    The framing also explains a fact that has puzzled regulators for a decade &mdash; why &ldquo;sufficiently decentralized&rdquo; networks have proven so hard to legislate; what capture actually targets, and why it finds nothing here to attach to, is the work of Section 4.
                </p>
            </PaperSection>

            <PaperSection title="3. Legality Without a Legislator">
                <p>
                    The claim that a piece of infrastructure has constitutional shape can be tested, because legal philosophy long ago specified what lawlike rules require. Lon Fuller&rsquo;s <em>The Morality of Law</em> names eight principles of legality: rules must be general; public; prospective; clear; non-contradictory; possible to follow; constant over time; and &mdash; the principle legal systems fail most &mdash; <em>congruent</em>, meaning the rule as applied must be the rule as declared (Fuller, 1964).
                </p>
                <p>
                    Run a deterministic, ownerless settlement kernel against that list. Generality and publicity are trivial: the same code binds every participant, and the code and its full execution history are world-readable. Prospectivity and constancy follow from immutability discipline: registered rules are never mutated; changed behavior requires a new enactment under a new identifier, so no participant is ever bound retroactively by an edit. Clarity is the spec, machine-checkable. Possibility is enforced at signature time &mdash; the system will not accept a commitment its rules cannot settle. And congruence, the principle whose failure fills the law reports, is not merely satisfied but <em>perfected</em>: a deterministic machine cannot apply a rule other than the one declared, because the declaration is the application.
                </p>
                <p>
                    Two features of the artifact under study sharpen the picture. First, the kernel &mdash; the layer that holds bonds and settles them &mdash; has no administrator, no owner, no pause function, and no recovery path. In constitutional terms it has no emergency powers: there is no actor for whom the rules suspend, no sovereign who decides the exception. This is usually presented as a security property (any unilateral exit path weakens the equilibrium that makes cooperation dominant); it is equally a legality property, the entrenchment clause that makes every other guarantee credible. Second, above the entrenched core sits an open registry of clauses &mdash; trade terms anyone may author and register permissionlessly, each bound immutably to its validator on first registration. That is a rule of recognition operating in public: the system knows what counts as valid law within it, anyone may propose new law, and no one may rewrite law already relied upon. Constitution beneath, open legislation above, and &mdash; in the graphs participants actually compose &mdash; ordinary politics: the same procedural core hosts a market-liberal graph, a cooperative graph, an Islamic-finance graph, without taking a side. The constitution here has no preamble. It is all articles.
                </p>
            </PaperSection>

            <PaperSection title="4. What Capture Actually Targets">
                <p>
                    It is tempting to conclude that abstraction is what protects such systems: an algorithm sufficiently abstract to run anywhere, universally understandable, is infrastructure rather than product, and so escapes capture. The conclusion is close, but the mechanism is not abstraction. GPS is abstract, universal, and infrastructure by any definition, and it is operated by a military. Universality is necessary; it is not what does the work.
                </p>
                <p>
                    Three properties do the work. The first is <em>ownerlessness</em>: entity-targeted law &mdash; which is most law &mdash; needs a defendant, and a system with no operator, no issuer, and no promoter offers none. This is the substance behind the influential &ldquo;sufficiently decentralized&rdquo; framing offered in an SEC official&rsquo;s 2018 remarks: where no central party&rsquo;s managerial efforts drive the enterprise, the securities category fails to attach (Hinman, 2018). The second is <em>credible neutrality</em>: when a mechanism visibly favors no one, capturing it yields no rent and suppressing it carries political cost that suppressing a company does not (Buterin, 2020). The third is <em>forkability</em>: capture of an instance is escapable by exit, so the prize for capture is an empty room.
                </p>
                <p>
                    The law has begun to recognize the category this creates. In <em>Van Loon v. Department of the Treasury</em> (5th Cir. 2024), a federal appellate court held that immutable smart contracts could not be sanctioned as &ldquo;property&rdquo; &mdash; they are not capable of being owned, controlled, or altered by anyone, including their creators, and property must at minimum be ownable. The government&rsquo;s own enforcement framework, the court found, had no handle on the object. The ruling did not place anyone above the law; the developers and users of such systems remain as regulable as anyone. It recognized that the <em>artifact itself</em> belongs to a different category &mdash; a thing, like an open road, not an entity, like a toll company.
                </p>
                <p>
                    That distinction states the correct settlement between such systems and the state, and the constitutional framing lets it be said in one line: <strong>regulate actors, not arithmetic.</strong> A constitution does not abolish ordinary law; it allocates it. Participants at the edges are taxed, licensed, and held to consumer protection as they always were &mdash; and the protocol, for its part, <em>supplies</em> the law&rsquo;s raw material: every commitment, bond, attestation, and settlement, timestamped, immutable, and legible to any forum. Infrastructure of this kind is not a jurisdiction-evasion device. It is the most subpoena-friendly evidence layer commerce has ever had.
                </p>
            </PaperSection>

            <PaperSection title="5. The Constitution of a Voluntary Order">
                <p>
                    An objection should be met head-on. Constitutions constitute polities: they bind persons who never consented, within borders they did not choose. A protocol binds no one. Entry is a voluntary act &mdash; a signature, a bond &mdash; and exit is free. In the classical sense, then, a protocol is closer to contract than constitution.
                </p>
                <p>
                    The precise claim is therefore narrower and older than it first appears: such a protocol is the constitution of a <em>voluntary order</em> &mdash; Buchanan&rsquo;s constitutional contract, entered at the rule-choosing level by everyone who participates. Institutional economists have begun analyzing blockchains in exactly these terms, as constitutional and polycentric orders that change through internal collective-choice processes and external competitive pressure (Alston, Law, Murtazashvili &amp; Weiss, 2022).
                </p>
                <p>
                    And for a <em>trade</em> protocol specifically, history supplies a seven-century precedent. The medieval law merchant &mdash; lex mercatoria &mdash; was privately produced commercial law: stateless, voluntary, enforced by bonds, sureties, reputation, and exclusion, administered in merchants&rsquo; own courts across jurisdictions whose sovereigns it did not consult. States did not defeat it; they learned from it and absorbed it, and its descendants run through commercial codes today. The comparative-institutional case that blockchain continues this polycentric lineage has now been made directly (Murtazashvili, Palida &amp; Madison, 2026). A bonded commitment between strangers, secured by stakes that make cooperation the dominant strategy and producing a record any court can read, is the merchant&rsquo;s pledge with the surety made mathematical. The constitutional order of trade is not a novel legal claim. It is the oldest one commerce has, re-implemented on a substrate that finally satisfies Fuller&rsquo;s checklist.
                </p>
            </PaperSection>

            <PaperSection title="6. What the Reframing Changes">
                <p>
                    For builders, the framing is a design criterion. If code is constitution, then the constitutional virtues are the engineering requirements: entrench the core and strip it of emergency powers; keep rulemaking above it open and non-retroactive; keep the core neutral among the politics composed on top of it; and produce evidence in a form courts can consume. Each of these is a checkable property, not a posture.
                </p>
                <p>
                    For lawyers and regulators, the framing replaces a dead-end question with a productive one. &ldquo;Is this legal?&rdquo; has no purchase on an artifact with no owner. &ldquo;What layer of rules is this, and who are the actors at its edges?&rdquo; routes analysis to where it can succeed &mdash; and it is a question lawyers already know how to ask, because it is the question federal systems pose every day.
                </p>
                <p>
                    And for the decade-old debate, the reframing concedes exactly what &ldquo;code is law&rdquo; could never afford to concede, and gains everything by it. Code is not law. Law is made by legislatures, applied with discretion, and owned by states. Code of the kind described here is something at once humbler and prior: a procedural floor beneath agreement &mdash; entrenched, neutral, evidence-producing &mdash; within which any law, and any politics, can compose. The slogan promised finality and delivered forks. The constitution promises only structure, and delivers it every block.
                </p>
            </PaperSection>

            <PaperSection title="Acknowledgements">
                <p>
                    The author thanks Vlad Zamfir, Primavera De Filippi, and Aaron Wright &mdash; years of conversation and collaboration shaped the questions this paper tries to answer, long before this framing arrived. The errors are the author&rsquo;s alone.
                </p>
            </PaperSection>
        </PaperLayout>
    );
}
