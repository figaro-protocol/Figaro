import type { Metadata } from "next";
import { PaperLayout, PaperSection, PaperRun, PaperRemark } from "@/components/papers/PaperLayout";

export const metadata: Metadata = {
    title: "The Coercion Variable — Figaro Protocol",
    description:
        "A bonded settlement primitive performs law's enforcement function in bilateral commerce without a coercive apparatus. Coercion becomes a substrate variable; the question of legitimate coercion relocates to a bounded domain.",
};

export default function CoercionVariablePaper() {
    return (
        <PaperLayout slug="coercion-variable"
            title="The Coercion Variable"
            subtitle="On the Boundary Between What the Sovereign Must Do and What the Bond Can Do"
            author="Alessandro Daliana"
            date="April 2026"
            watermark="Figaro Protocol · Preprint"
            keywords="coercion, sovereignty, monopoly on violence, pre-commitment, bonded enforcement, political philosophy, Hobbes, Weber, Hart, boundary of state authority"
            abstract={
                <>
                    <p>
                        The dominant tradition of legal philosophy from Austin (1832) and Hobbes (1651) through Weber (1919) and Hart (1961) has treated law as a system of texts paired with a coercive enforcement apparatus. The texts specify obligations; the apparatus &mdash; police, courts, sheriffs, ultimately the sovereign&rsquo;s monopoly on legitimate violence &mdash; ensures the obligations are met or punishes their breach. The exact articulation of the relationship between text and coercion varies across the tradition (command theory, secondary rules, legitimate violence, and so on), but the structural pairing is shared.
                    </p>
                    <p>
                        This paper observes that the bonded settlement primitive performs the enforcement function of law in bilateral commerce <em>without</em> a coercive apparatus in the tradition&rsquo;s sense. There is no third party who applies force upon breach. There is no court that compels performance. There is no sovereign whose monopoly on violence stands behind the arrangement. The enforcement is performed by bonds that the parties themselves lock at the moment of consent, and that the protocol releases or forfeits according to the parties&rsquo; subsequent behavior. The mechanism is, in the precise language of Elster (1979), a <em>pre-commitment</em> structure: self-binding at the moment of consent, with no external party in the position to apply or withhold force after the fact.
                    </p>
                    <p>
                        Pre-commitment via bond is qualitatively different from retributive coercion via the sovereign. The difference is not a matter of degree &mdash; a softer or kinder enforcement &mdash; but of mechanism: the relationship between obligation and enforcement runs through the parties&rsquo; own resources and consent, not through an external authority&rsquo;s standing capacity to compel. Where the mechanism applies, it substitutes for the coercive apparatus. Where it does not apply &mdash; against criminal harm, against externalities affecting non-parties, against the provision of public goods, against status and rights adjudication &mdash; the coercive apparatus continues to do work that the bonded primitive is structurally unable to do.
                    </p>
                    <p>
                        The substantive claim of this paper is therefore not that the sovereign is unnecessary or that the state should be reduced. It is that the political-philosophical question of legitimate coercion &mdash; which thinkers from Hobbes to Schmitt have addressed as if it ranged over the entirety of social cooperation &mdash; becomes a bounded question once a substantial part of bilateral commerce can be coordinated by pre-commitment rather than by sovereign-backed coercion. The state retains its load-bearing functions; the question of how it should exercise them retains its political-philosophical urgency; what changes is the <em>domain</em> over which the question must be answered. This relocation is the political-philosophical content of the substrate change, and it is the subject of this paper.
                    </p>
                </>
            }
            references={
                <>
                    <li>Austin, J. <em>The Province of Jurisprudence Determined</em>. John Murray, London, 1832.</li>
                    <li>Elster, J. <em>Ulysses and the Sirens: Studies in Rationality and Irrationality</em>. Cambridge University Press, Cambridge, 1979.</li>
                    <li>Hart, H. L. A. <em>The Concept of Law</em>. Oxford University Press, Oxford, 1961.</li>
                    <li>Hobbes, T. <em>Leviathan, or The Matter, Forme, and Power of a Common-Wealth Ecclesiasticall and Civill</em>. Andrew Crooke, London, 1651.</li>
                    <li>Nozick, R. Coercion. In S. Morgenbesser, P. Suppes, and M. White, eds., <em>Philosophy, Science, and Method: Essays in Honor of Ernest Nagel</em>, pp. 440&ndash;472. St. Martin&rsquo;s Press, New York, 1969.</li>
                    <li>Olson, M. <em>The Logic of Collective Action: Public Goods and the Theory of Groups</em>. Harvard University Press, Cambridge, MA, 1965.</li>
                    <li>Pettit, P. <em>Republicanism: A Theory of Freedom and Government</em>. Oxford University Press, Oxford, 1997.</li>
                    <li>Pettit, P. <em>On the People&rsquo;s Terms: A Republican Theory and Model of Democracy</em>. Cambridge University Press, Cambridge, 2012.</li>
                    <li>Schmitt, C. <em>Politische Theologie</em> (1922). English: <em>Political Theology: Four Chapters on the Concept of Sovereignty</em>, trans. G. Schwab, MIT Press, 1985.</li>
                    <li>Srinivasan, B. <em>The Network State: How to Start a New Country</em>. Self-published, 2022.</li>
                    <li>Stigler, G. J. The Theory of Economic Regulation. <em>Bell Journal of Economics and Management Science</em>, 2(1):3&ndash;21, 1971.</li>
                    <li>Weber, M. <em>Politik als Beruf</em> (1919). English: &ldquo;Politics as a Vocation,&rdquo; in H. H. Gerth and C. Wright Mills, eds., <em>From Max Weber: Essays in Sociology</em>, Oxford University Press, 1946.</li>
                    <li>Weber, M. <em>Wirtschaft und Gesellschaft</em> (1922). English: <em>Economy and Society</em>, G. Roth and C. Wittich, eds., University of California Press, Berkeley, 1978.</li>
                    <li>Williamson, O. E. <em>The Economic Institutions of Capitalism</em>. Free Press, New York, 1985.</li>
                </>
            }
        >
            <PaperSection title="1. Introduction">
                <p>
                    This paper sits at the intersection of political philosophy and the analysis of a particular coordination primitive. Its starting point is an observation that emerged in conversation about how to characterize the bonded settlement primitive relative to the dominant Western tradition on the nature of law. The observation is sharp enough to warrant explicit treatment.
                </p>
                <p>
                    The dominant tradition reads law as the pairing of texts (the obligations) with a coercive apparatus (the enforcement). The coercive apparatus performs two functions: it compels performance of obligation when a party would not otherwise perform, and it punishes breach as a deterrent against future breach by the same party or by others. The apparatus is grounded in the sovereign&rsquo;s monopoly on legitimate violence within a territory (Weber, 1919). When the obligation is honored, the apparatus does no observable work; when the obligation is breached, the apparatus is invoked. The apparatus&rsquo;s standing capacity is what makes the texts effective even in cases where it is not invoked: the threat of enforcement does the work even when the actual enforcement is not required.
                </p>
                <p>
                    The bonded settlement primitive performs the enforcement function for bilateral commercial obligations <em>without</em> a coercive apparatus in the tradition&rsquo;s sense.
                </p>
                <p>
                    This is not a marginal substitution. In bilateral commercial exchange, the coercive apparatus has historically been the guarantor of last resort against which all other enforcement mechanisms (reputation, repeated interaction, social pressure) operate. Removing the requirement for that guarantor changes the structural role those secondary mechanisms play. More fundamentally, it changes what kind of question the philosophical analysis of coercion is. We argue that this change is the substantive political-philosophical content of the substrate change.
                </p>
                <PaperRun title="The thesis.">
                    The thesis is structural and bounded. (1) Coercion is a substrate variable: in the dominant tradition, it is structurally load-bearing in the enforcement of bilateral commercial obligations. (2) The bonded primitive removes coercion as a substrate variable in this domain by substituting pre-commitment for retribution. (3) The substitution does not extend to domains in which the coercion was performing functions the bond cannot perform: criminal harm, third-party externality, public-goods provision, status, rights adjudication. (4) Where the substitution applies, the political-philosophical question of how to legitimate coercive power becomes irrelevant rather than corrected &mdash; the coercion is no longer being exercised, so the question of its legitimacy does not arise. (5) Where the substitution does not apply, the political-philosophical question retains its full urgency, now operating over a bounded rather than an unbounded domain.
                </PaperRun>
                <PaperRun title="What this paper is and is not.">
                    This paper is a short essay in the political philosophy of coercion. It does not extend the underlying settlement mechanism; it takes the mechanism as given and asks what its joint implication is for the philosophical analysis of coercion that has organized political thought from Hobbes to the present.
                </PaperRun>
                <p>
                    The paper takes no position on whether the state should be larger, smaller, more interventionist, less interventionist, democratic, republican, or any other configuration. Those questions are real, and they survive the substrate change in the domain where coercion remains load-bearing. The paper&rsquo;s claim is that the substrate change shrinks that domain by removing bilateral commerce from it, and that this shrinkage is the political-philosophical content of the change. The shrinkage is neither a libertarian victory nor a statist defeat &mdash; it is a relocation of where the question of legitimate coercion must be answered.
                </p>
            </PaperSection>

            <PaperSection title="2. Coercion as a Substrate Variable">
                <p>
                    This paper treats coercion as a <em>substrate variable</em>: a feature of bilateral commercial enforcement that the dominant tradition has taken as a structural constant, but whose <em>Herrschaft</em> component &mdash; in the Weberian distinction developed below &mdash; a sufficiently different coordination architecture can in principle set to zero. The move &mdash; taking something long treated as a fixed condition of social cooperation and exhibiting an architecture under which it becomes adjustable &mdash; is the method of the argument. Coercion is the variable analyzed here, and it is analyzed by a tradition, legal and political philosophy, distinct from the economic one in which such substrate questions are more often posed.
                </p>
                <PaperRun title="Coercion in the dominant tradition.">
                    Austin (1832) formulated the command theory of law: laws are commands of a sovereign, backed by sanctions for non-compliance. The pairing of command with sanction is constitutive of law on this view; an obligation without an enforcement mechanism is, in Austin&rsquo;s terms, a moral injunction rather than a legal one. Hart (1961) refined the analysis substantially, distinguishing primary rules of obligation from secondary rules of recognition, change, and adjudication, and arguing that not all law operates by sanction. But Hart retained coercive enforcement as one component of legal systems and acknowledged that, in practice, the enforceability of legal rules depends on the standing capacity of officials to apply force when required. Hobbes (1651) provided the upstream political-philosophical justification for the standing capacity: covenants without the sword are but words, and of no strength to secure a man at all.
                </PaperRun>
                <PaperRun title="Weber&rsquo;s distinction between Macht and Herrschaft.">
                    Weber (1922) sharpens the picture in a way the present argument relies on heavily. <em>Macht</em> is the bare capacity to bring about an outcome despite resistance &mdash; power in the most general sense. <em>Herrschaft</em>, often translated as &ldquo;domination&rdquo; or &ldquo;authority,&rdquo; is a narrower category: <em>Macht</em> exercised through a stable relationship of command and obedience, in which one party has a recognized right to issue directives and another a recognized obligation to comply. Weber&rsquo;s three pure types of legitimate <em>Herrschaft</em> &mdash; traditional, charismatic, and rational-legal (Weber, 1919) &mdash; describe how command-relationships are stabilized as authority. The Hobbesian sword Austin and Hart later analyze is <em>Herrschaft</em>-shaped: it presupposes the sovereign&rsquo;s recognized authority to exercise the coercive capacity, not just the bare capacity itself.
                </PaperRun>
                <p>
                    The bonded primitive does coercion-like work &mdash; the breaching party&rsquo;s bond is forfeit despite their preference &mdash; but it does that work in the <em>Macht</em> register without reaching for <em>Herrschaft</em>. There is no party whose recognized authority the forfeiture depends on; the bond is released or forfeit by public algorithm whose execution the parties have themselves authorized at the moment of consent. The primitive supplies the forcing function (<em>Macht</em>) without supplying or requiring the authority structure (<em>Herrschaft</em>) the dominant tradition has assumed must accompany it. This is what makes coercion a variable: separating <em>Macht</em> from <em>Herrschaft</em> has been historically difficult precisely because the available enforcement architectures bundled them together; the bonded primitive is one of the first arrangements in which the bundle can be unbundled at the level of bilateral commerce.
                </p>
                <p>
                    The functional locus of coercion across these accounts is the same: it is what makes contractual obligation effective in cases where a party would not otherwise perform. Without it, parties who can defect at lower cost than they can perform will defect, and the system of obligation collapses into a set of pious recommendations. With it, performance becomes the rational strategy because the cost of breach exceeds the cost of compliance.
                </p>
                <PaperRun title="Coercion in commercial law specifically.">
                    Commercial law inherits the dominant tradition&rsquo;s structure. Contract enforcement runs through the courts; specific performance and damages awards rely on the state&rsquo;s capacity to compel transfer of property or impose financial penalties; the standing threat of these remedies is what makes commercial contracts effective even in the cases where the remedies are not invoked. Williamson (1985)&rsquo;s transaction-cost analysis treats the cost of using courts as one component of market enforcement that hierarchy (the firm) is sometimes able to economize on; the analysis assumes the courts are available as the residual enforcement mechanism.
                </PaperRun>
                <p>
                    The commercial-law apparatus is not equally available across all cases. Cross-border transactions involve choice-of-law and choice-of-forum complexities that often render litigation prohibitively expensive. Transactions between parties in jurisdictions whose courts do not recognize each other&rsquo;s judgments lack effective remedy. Transactions between informally-constituted parties, parties without legal personality in the relevant jurisdiction, or parties whose identity is hard to establish, are similarly under-served. These under-served cases have historically been managed by intermediaries (merchant houses, factors, escrow agents) or by extralegal arrangements (reputation, repeated interaction). Each of these secondary mechanisms operates in the shadow of the residual state-coercion option, even when the option is not directly available &mdash; because the residual option&rsquo;s existence has shaped the social conventions on which the secondary mechanisms rely.
                </p>
                <PaperRun title="Coercion as a variable.">
                    Treating coercion as a <em>variable</em> whose <em>Herrschaft</em> component can in principle be set to zero is a move the dominant tradition has not historically been able to make. The reason is that no coordination architecture has been available in which bilateral commercial obligations could be enforced at scale without a residual coercive backstop. The bond posted by the parties under prior arrangements was either (a) held by an intermediary who would release it to the cooperative party &mdash; in which case the intermediary&rsquo;s discretion was the coercive mechanism, simply relocated; or (b) held by a court &mdash; in which case the court&rsquo;s standing capacity was the coercive mechanism, simply made explicit; or (c) absent &mdash; in which case the obligation was un-enforced and the parties bore the performance risk. The dominant tradition&rsquo;s analysis was correct on its own terms: under the available coordination architectures, some form of coercive backstop was structurally necessary.
                </PaperRun>
                <p>
                    The bonded primitive is a coordination architecture in which the bond is held neither by an intermediary nor by a court, and in which the release is performed by a public algorithm with no discretion. This is the architectural change that makes coercion a variable. The variable&rsquo;s <em>Herrschaft</em> component can now in principle be set to zero in the bilateral-commerce domain, and the question of what happens to the dominant tradition&rsquo;s analysis when that occurs is the question the present paper addresses.
                </p>
                <PaperRemark title="On reading coercion as a variable.">
                    The method is general. Political philosophy and political economy have treated certain features of social cooperation as structural constants because no available architecture admitted their removal. When an architecture does admit removal, the feature becomes a variable, and the analysis that took it as a constant relocates accordingly. Coercion is one such feature; the relocation it undergoes is the subject of the rest of this paper.
                </PaperRemark>
            </PaperSection>

            <PaperSection title="3. What the Primitive Does to Coercion">
                <p>
                    We now turn from the structural framing to the specific mechanism by which the bonded primitive substitutes for the coercive apparatus in bilateral commerce; we summarize only what is necessary for the present argument.
                </p>
                <p>
                    The substitution rests on two compositions in the kernel: <em>asymmetric bonding</em> supplies the credible threat of loss that makes performance the rational strategy, and <em>buyer dominance with atomic resolution</em> supplies the non-discretion that makes the substitute architectural rather than dependent on a trusted enforcer &mdash; no agent, arbitrator, governance body, oracle, or jury is in a position to defer, partial-resolve, or selectively enforce. The structural difference between Hobbesian sovereignty and the bonded primitive is not just that the parties post their own swords; it is that no third party stands in the position from which the sovereign formerly acted.
                </p>
                <PaperRun title="Pre-commitment instead of retribution.">
                    The bond is locked at the moment of consent, from the parties&rsquo; own resources, by their own signatures. The amount is fixed by the protocol&rsquo;s bonding ratios, and is verifiable by both parties before the commitment is signed. The protocol&rsquo;s resolution mechanic releases the bond to the cooperative party and forfeits it from the defecting party, automatically, with no discretion exercised by any human agent or external authority. The mechanism is what Elster (1979) analyzed under the heading of <em>pre-commitment</em>: a self-binding move at the moment of consent that substitutes for ongoing enforcement during performance.
                </PaperRun>
                <p>
                    Pre-commitment differs from retributive coercion in three structural ways. First, it operates at the moment of consent rather than at the moment of breach: the binding occurs when the parties agree, not when one of them tries to deviate. Second, the resource that performs the binding is the party&rsquo;s own, posted voluntarily, rather than the sovereign&rsquo;s standing capacity to apply force. Third, no agent is in the position to apply or withhold the binding after the fact: the protocol executes the release or forfeiture mechanically, without discretion, and without the structural capacity to be lobbied, captured, or selectively enforced.
                </p>
                <PaperRun title="Hobbes&rsquo;s covenant with self-applied sword.">
                    Hobbes&rsquo;s famous remark that &ldquo;covenants, without the sword, are but words&rdquo; identifies the structural problem the dominant tradition has spent four centuries solving by erecting and legitimating sovereign coercive apparatuses. The bonded primitive offers a different solution: the covenant arrives with its own sword, applied automatically by the protocol upon breach, the sword being the bond the breaching party has itself posted. The Hobbesian framing is not refuted; it is satisfied by a different mechanism. The covenant has its sword; the sword is not the sovereign&rsquo;s; the parties supply it themselves at the moment of agreement.
                </PaperRun>
                <p>
                    This is a literal reading, not a metaphorical one. The bond is the sword in the precise sense Hobbes intended: a credible threat of loss whose existence makes performance the rational strategy. What changes is who holds and who applies the sword. Under the sovereign&rsquo;s monopoly, the sovereign holds and applies; the parties&rsquo; obligations are effective because the sovereign stands behind them. Under bonded pre-commitment, the parties themselves hold (in escrow with the protocol) and the protocol applies; the parties&rsquo; obligations are effective because they have themselves made breach more costly than performance.
                </p>
                <PaperRun title="What this is not: a softer kind of coercion.">
                    A reader might object that pre-commitment is just coercion with a friendlier name &mdash; the bond is forfeited against the breaching party&rsquo;s preferences, after all, and that is coercive in the ordinary-language sense. The objection elides a structural difference the political-philosophical literature has long recognized. Nozick (1969) distinguished proposals from threats by reference to the baseline against which compliance is evaluated: a threat alters the baseline in a way that compels compliance, while a proposal offers an alternative to the baseline that the recipient may accept or refuse. The bond posted at consent is a proposal in Nozick&rsquo;s sense: at the moment of bonding, the party&rsquo;s baseline is unchanged; the bond arrives only with the party&rsquo;s signature, and the consequences of forfeiture are baked into the offer. This is the ordinary structure of voluntary commerce. It is categorically different from the standing capacity of a sovereign to apply force against a party who has not consented.
                </PaperRun>
                <PaperRemark title="On the limit of the analogy.">
                    The pre-commitment / retribution distinction is structural, not ethical. We are not claiming that pre-commitment is morally superior to retributive coercion &mdash; that is a normative question on which the substrate takes no position. We are claiming the two are different mechanisms of enforcement, with different agents, different timing, different relations to consent, and therefore different political-philosophical analyses. The substitution of pre-commitment for retribution in a bounded domain therefore changes the political-philosophical analysis applicable in that domain. This is descriptive, not prescriptive.
                </PaperRemark>
            </PaperSection>

            <PaperSection title="4. Distance and the Menu of Coercive Alternatives">
                <p>
                    A natural question is when, in practice, the bonded primitive is the operative enforcement mechanism and when it is one of several coexisting mechanisms. The answer is governed by what we will call <em>social distance</em> between the parties: their distance from one another along three dimensions &mdash; physical-geographic, jurisdictional-legal, and identity-relational.
                </p>
                <PaperRun title="Physical-geographic distance.">
                    Parties in physical proximity have access to enforcement mechanisms that require neither bond nor sovereign: in-person renegotiation, social pressure, recourse to local intermediaries, and at the limit, direct physical compulsion. The bonded primitive is available to them but is not the only option. Parties at physical distance lose access to most of these alternatives. Direct compulsion becomes infeasible; in-person renegotiation cannot occur; social pressure operates only insofar as the parties share a community that traverses the distance.
                </PaperRun>
                <PaperRun title="Jurisdictional-legal distance.">
                    Parties under a shared sovereign jurisdiction have access to that sovereign&rsquo;s coercive apparatus: courts, contract enforcement, specific performance, damages, criminal sanction for fraud. Parties under distinct sovereigns may or may not have access, depending on mutual-recognition treaties, the cost of cross-border litigation, and the political-economic relationship between the sovereigns. Parties under sovereigns that do not recognize each other&rsquo;s judgments, or under no sovereign at all, lack the apparatus entirely.
                </PaperRun>
                <PaperRun title="Identity-relational distance.">
                    Parties who know each other, who have transacted before, or who share membership in a small community have access to reputational enforcement: the cost of breach includes the loss of future transactions and standing within the community. Parties who are strangers to each other, who have no prior interaction, and who share no community lack this. The reputational mechanism does not extend to first encounters between unknown parties.
                </PaperRun>
                <PaperRun title="The menu argument.">
                    At low social distance along all three dimensions, parties have a rich menu of enforcement mechanisms: physical, sovereign-legal, reputational. The bonded primitive is one option among several and is not necessarily the dominant one. At high social distance along all three dimensions, the alternatives drop away: physical compulsion is infeasible, sovereign apparatus is unavailable or prohibitively expensive, and reputation cannot operate between strangers. The bonded primitive is then the only enforcement mechanism available, and its existence becomes the difference between transaction and no transaction.
                </PaperRun>
                <p>
                    This is not an empirical claim that the bonded primitive will be adopted at high social distance and ignored at low social distance &mdash; adoption is a separate question &mdash; but a structural observation about where the mechanism is doing decisive work and where it is one option among others. The decisive cases are the ones in which prior coordination architectures had no answer: cross-border commerce between parties with no shared sovereign, exchange between parties whose identities cannot be reliably established, transactions between artificial agents acting under distributed organizational arrangements, and commerce by populations who lack civil-legal personality in any jurisdiction the counterparty can sue in.
                </p>
                <PaperRemark title="On the physical-proximity intuition.">
                    A common intuition holds that the bonded primitive&rsquo;s incentives are stronger at distance and weaker in proximity. The intuition is correct in direction but imprecise in mechanism. The bonded primitive&rsquo;s incentives do not change with distance &mdash; the bonding ratios are constant. What changes with distance is the menu of competing mechanisms. At distance, the menu shrinks to the bonded primitive alone, making it decisive. In proximity, the menu expands to include alternatives, of which the bonded primitive is one. The mechanism is not stronger at distance; it is exclusive at distance and one-of-several in proximity.
                </PaperRemark>
            </PaperSection>

            <PaperSection title="5. The Boundary: What Shrinks, What Stays">
                <p>
                    The bonded primitive&rsquo;s domain of substitution is bounded. Within the boundary, it substitutes for sovereign-backed coercion; the coercion is no longer being applied because the obligation is self-enforcing. Outside the boundary, the bonded primitive is structurally unable to substitute, and sovereign-backed coercion continues to perform functions the bond cannot. This section identifies what is on each side of the boundary, and why.
                </p>
                <PaperRun title="Inside the boundary: priceable bilateral commercial obligations.">
                    The bonded primitive substitutes for coercion in obligations that are (a) priceable in a unit the protocol denominates bonds in, (b) bilateral or composable into bilateral edges via the mechanism&rsquo;s asymmetric bonding, (c) voluntary at the moment of bonding, and (d) capable of being specified in clauses the parties accept at consent. The bulk of contemporary commercial activity falls under these conditions: sale of goods, provision of services, delivery, escrow, payment, attestation against measurable standards. For these, the bonded primitive removes the requirement for an external coercive backstop.
                </PaperRun>
                <p>
                    The substitution has cascading effects on the regulatory apparatus that historically performed coordination functions adjacent to direct enforcement. Antitrust regimes assume the existence of intermediaries with market power to constrain; where intermediation is structurally unnecessary, the intermediary-targeting regime has less to operate on. Consumer-protection regimes assume an information asymmetry between seller and buyer that clause-validated attestations reduce. Cross-border commercial-dispute regimes assume the necessity of choosing between competing sovereign coercive apparatuses; where the obligation is self-enforcing, the choice is moot. The shrinkage is real but is itself bounded: each of these regimes addresses other concerns (systemic risk, fraud, market manipulation) that survive the substrate change.
                </p>
                <PaperRun title="Outside the boundary: non-priceable, non-bilateral, non-voluntary harms.">
                    The bonded primitive cannot substitute for sovereign-backed coercion where the obligation is non-priceable (violence against persons cannot be made commensurable with a sum of money in a way that captures what the violation involves), non-bilateral (third parties harmed by an externality are not parties to the bond), or non-voluntary (the harming party did not consent to a bond at the moment of harm). These include criminal harm against persons, large-scale environmental externality, public-goods provision under free-rider conditions, status questions (citizenship, legal personality, identity), fundamental rights adjudication, and the standing capacity to defend the territory against external coercion.
                </PaperRun>
                <p>
                    For each of these, the sovereign&rsquo;s coercive apparatus continues to do work the bonded primitive is structurally unable to do. The reason is not that the bonded primitive is inefficient in these domains but that the conditions for its operation are not present: there is no consent at the moment of harm, no bilateral counterparty to bond against, no priceable specification of the obligation. Substituting bond for sovereign in these domains would require the substitution to itself be sovereign-backed, which is not a substitution.
                </p>
                <PaperRun title="The boundary itself.">
                    The boundary between the two domains is not a moral or political choice but a structural one, given by the conditions under which bonded pre-commitment is operable. The boundary will shift over time as clause design improves and as bondable composition extends to obligations not currently priceable in practice. But the structural limits &mdash; non-consent at the moment of harm, externality on non-parties, non-priceability of certain violations &mdash; are categorical and do not yield to engineering improvement. They mark the part of the cooperative landscape where sovereign-backed coercion remains load-bearing.
                </PaperRun>
                <PaperRun title="What this implies for the apparatus.">
                    The state&rsquo;s coercive apparatus is not made unnecessary by the substrate change. It is bounded, in the precise sense that some of its prior functions (commercial enforcement of bilateral obligations) are no longer required for the obligations to be honored, while other functions (criminal, externality, public goods, status, rights, defense) continue to require it. The shrinkage is in the part of the apparatus&rsquo;s work that was addressing the coordination problem; the part addressing the not-coordination problems remains.
                </PaperRun>
                <PaperRemark title="On contested boundary cases.">
                    Some categories sit on the boundary and admit dispute about which side they fall on. Securities regulation is one example: some of its function is intermediary-targeting (and shrinks with the substrate change), some is externality-pricing (systemic risk to non-parties, which does not shrink), some is status-based (defining qualified-investor categories, which does not shrink). Disentangling these is empirical work the present paper does not undertake. We note only that the boundary is real, that it bounds the political-philosophical question, and that contested cases at the boundary are adjudicable on structural grounds rather than political ones.
                </PaperRemark>
            </PaperSection>

            <PaperSection title="6. The Democratic-Republican Apparatus: Bounded Domain, Not Reformed">
                <p>
                    We now turn to what the substrate change implies for the democratic-republican apparatus through which contemporary states exercise their coercive monopoly. The implication is narrower than may be tempting to claim, and the framing matters.
                </p>
                <PaperRun title="The levers of power and their abuses.">
                    The standard analysis identifies four broad levers of power in democratic-republican constitutional systems: legislation (rule-making), executive enforcement, judicial adjudication, and the franchise (the citizenry&rsquo;s authorization of the previous three). Each is subject to characteristic abuses: regulatory capture in legislation (Stigler, 1971), executive overreach and emergency powers (Schmitt, 1922), judicial drift, gerrymandering and voter suppression in the franchise, and across-lever phenomena like agency capture and lobbying (Olson, 1965). These abuses are real, are extensively documented, and have generated centuries of political-philosophical and constitutional reflection on how to constrain them.
                </PaperRun>
                <PaperRun title="What the substrate change does not do.">
                    The substrate change does not correct the abuses listed above. Regulatory capture continues to operate in the domains where regulation continues to operate; executive overreach continues to be possible where the executive continues to exercise authority; judicial drift continues where courts continue to adjudicate. The substrate change does not provide a constitutional remedy for any of these. It is not a proposal for democratic reform.
                </PaperRun>
                <PaperRun title="What the substrate change does do.">
                    The substrate change shrinks the <em>domain</em> over which the levers of power operate. Where bilateral commercial obligations become self-enforcing, the legislative apparatus that has historically generated rules for their regulation has less to generate rules about. Where commercial disputes resolve atomically by protocol, the judicial apparatus that has historically adjudicated them has less to adjudicate. Where coordination occurs by bond, the executive apparatus that has historically enforced commercial obligations has less to enforce. The abuses that operate on these levers are not corrected; the levers&rsquo; <em>reach</em> is narrowed in the part of social cooperation that becomes self-enforcing.
                </PaperRun>
                <p>
                    This is subtraction, not reform. The political-philosophical work of constraining the levers in their remaining domains continues. The work is, however, more bounded than it was: the domain over which legitimate coercion must be authorized, exercised, and constrained is smaller, because a substantial part of what historically required authorization, exercise, and constraint is now operating without coercion in the relevant sense.
                </p>
                <PaperRun title="Pettit&rsquo;s freedom-as-non-domination, and where it lands here.">
                    Pettit (1997) reframes liberty in a way the present argument can use directly. The classical-liberal reading takes liberty to be the absence of <em>actual</em> interference; an agent is free to the extent that no one is currently obstructing their actions. Pettit&rsquo;s republican reading takes liberty to be the absence of <em>capacity</em> for arbitrary interference; an agent is free to the extent that no one is in a position to interfere arbitrarily, even if no one is currently doing so. The republican reading is the stronger condition: a slave with a kind master is not free in the republican sense, because the master retains the capacity to interfere arbitrarily even when not exercising it.
                </PaperRun>
                <p>
                    The bonded primitive&rsquo;s non-discretion is a freedom-as-non-domination property. At the moment of resolution, no third party is in a position to interfere arbitrarily with the outcome &mdash; not the buyer (whose dominance is bounded by the conservation law and the atomic-resolution constraint), not the seller, not a manager, not a foundation, not a court (which can adjudicate on the evidence but cannot reach into the bonded escrow). Participants in a bonded process enjoy republican-style freedom within the process&rsquo;s scope: not because no one chooses to interfere, but because the architecture has eliminated the position from which arbitrary interference could be exercised. The connection should not be over-stated &mdash; republican freedom is a property of political order broadly, and the bonded primitive is a settlement architecture in a specific domain &mdash; but the structural alignment is direct, and the primitive supplies within its domain what republican theory has historically required political institutions to supply across domains.
                </p>
                <p>
                    The two traditions just invoked do not deliver the same verdict, and the difference should be surfaced rather than blurred. The claim that no coercion arises inside the boundary is the Nozickian reading: the bond is a proposal rather than a threat because the party&rsquo;s pre-bond baseline is unchanged. A republican reading in Pettit&rsquo;s sense assesses the capacity for arbitrary interference rather than the baseline, and yields only the weaker claim that no <em>domination</em> arises &mdash; the architecture eliminates the position from which arbitrary interference could be exercised, whatever one calls the forfeiture itself. This paper commits to the Nozickian reading, on which its thesis is stated; the republican reading is the live alternative, and a reader who adopts it should read the relocation argument with &ldquo;no domination arises&rdquo; in place of &ldquo;no coercion arises.&rdquo;
                </p>
                <PaperRun title="What about democracy itself.">
                    A democratic-republican order has multiple justifications, only some of which depend on its coordinative function in commerce. Its role in legitimating coercion, in protecting rights against arbitrary authority, in providing for collective self-determination (Pettit, 1997, 2012), and in adjudicating among competing visions of the good, are each independent of its role in regulating commerce. None is affected by the substrate change. The order&rsquo;s coordinative function in commerce, however, is one of its historically major functions, and that function shrinks. A democratic-republican order is not made unnecessary by the substrate change; it is freed, in the bounded domain of self-enforcing commerce, from one of the responsibilities that has historically occupied it.
                </PaperRun>
                <PaperRemark title="On the Network State and adjacent proposals.">
                    A separate question, on which we take no position here, is whether the substrate change implies that some functions of the democratic-republican order can or should be replaced by network-organized arrangements (Srinivasan, 2022). That question requires its own treatment. The present paper notes only that the substrate change does not by itself entail any particular network-organizational form, and that conflating the substrate change with a specific political proposal is the category error this paper has been at pains to avoid.
                </PaperRemark>
            </PaperSection>

            <PaperSection title="7. What This Paper Is Not">
                <p>
                    The argument is liable to several misreadings &mdash; as anarchism, as libertarianism, as statism, as a constitutional proposal, as a prediction. It is none of these: the paper makes no normative claim about whether the shrinkage is good or bad and no empirical claim about adoption, only the structural claim that the substitution occurs, and is bounded, in the manner described.
                </p>
                <PaperRun title="Hobbes and Schmitt: how the substitution does and does not engage them.">
                    Hobbes and Schmitt are the two thinkers whose challenges are most often raised, and they require different responses. Hobbes&rsquo;s structural observation, that covenants without swords are but words, is satisfied &mdash; in the bilateral-commerce domain and only there &mdash; by a different sword: the bond the parties have themselves posted, released or forfeit by an algorithm whose execution they have themselves authorized. The Hobbesian challenge is met on its own terms in the domain where the substitution applies, and is not addressed in the domain where it does not. We do not argue that the substitution generalizes outside bilateral commerce.
                </PaperRun>
                <p>
                    Schmitt&rsquo;s challenge is sharper, and we engage it directly rather than dismiss it. Schmitt (1922) argues that any rule-system requires an extralegal decision on the exception, and that the sovereign is whoever decides whether a given case is or is not a normal application of the rules. The bonded primitive, taken as a rule-system, would on Schmitt&rsquo;s account require some sovereign to decide when it does not apply. Our response is that the primitive is not a rule-system in Schmitt&rsquo;s sense; it is a settlement primitive that runs in the domain where its rules apply and is silent in the domain where they do not. The Schmittian decision on the exception &mdash; whether a particular bonded commitment was procured under duress, whether a particular outcome violates public policy, whether a particular party lacks capacity &mdash; is a decision the primitive does not make and does not pretend to make. It is made, where it is made at all, by external legal forums applying their own constitutional and doctrinal apparatus to the bonded commitment as evidentiary input. The exception is not absorbed by the primitive; it is left where it has always been, in the forums whose authority to decide on it derives from elsewhere.
                </p>
                <p>
                    The Schmittian challenge therefore lands, but at a different level than its formulators may have intended. It is correct that the primitive cannot decide its own exceptions; that is precisely why the exception remains the province of external forums, and why this paper bounds its substitution claim to bilateral commerce in normal application. The non-discretion of the primitive within its domain, and its silence outside its domain, are two faces of the same design property: the primitive has no authority to extend itself, and no authority to retract itself either. That property is what makes coexistence with conventional sovereignty architectural rather than negotiated.
                </p>
            </PaperSection>

            <PaperSection title="8. Conclusion">
                <p>
                    This paper has argued that coercion is a substrate variable: structurally load-bearing in the dominant tradition&rsquo;s account of bilateral commercial enforcement, and substituted by pre-commitment when the bonded primitive is the operable coordination architecture. The substitution holds within a bounded domain (priceable, bilateral, voluntary, clause-specifiable obligations) and does not extend beyond it (criminal harm, externality, public goods, status, rights, defense). Within the domain, the political-philosophical question of legitimate coercion becomes irrelevant rather than corrected; outside the domain, the question retains its full urgency, now operating over a bounded rather than an unbounded scope. This is not a refutation of the prior tradition &mdash; the analysis remains correct on its own terms in the remaining domain &mdash; but a relocation of where the question of legitimate coercion must be answered.
                </p>
                <p>
                    We close with an observation of method. The kernel is ideologically agnostic; the graph is the politics. What the present paper adds to that formulation is that the political-philosophical analysis of coercion becomes a graph-tier question over a bounded substrate domain rather than a substrate-tier inevitability over an unbounded one. The politics is at the graph in a stronger sense: it is freed, in the bounded domain, from a structural premise (coercive backstop required) that prior architectures forced upon it.
                </p>
            </PaperSection>
        </PaperLayout>
    );
}
