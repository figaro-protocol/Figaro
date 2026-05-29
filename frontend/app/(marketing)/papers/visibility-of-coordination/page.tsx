import type { Metadata } from "next";
import {
    PaperLayout,
    PaperSection,
    PaperSubsection,
    PaperRun,
    PaperRemark,
} from "@/components/papers/PaperLayout";
import { Math } from "@/components/papers/Math";

export const metadata: Metadata = {
    title: "The Visibility of Coordination — Figaro Protocol",
    description:
        "A Gramscian reading: “two strangers need a platform to transact safely” is a hegemonic proposition, not a structural necessity. A bonded settlement primitive makes the coordination function visible as a separable design choice.",
};

export default function VisibilityOfCoordinationPaper() {
    return (
        <PaperLayout
            title="The Visibility of Coordination"
            subtitle="A Gramscian Reading of the Platform Economy and Its Successor"
            author="Alessandro Daliana"
            date="April 2026"
            watermark="Figaro Protocol · Preprint"
            keywords="cultural hegemony, Gramsci, platform economy, political economy of infrastructure, coordination substrate, paradigm shift"
            abstract={
                <>
                    <p>
                        Gramsci (1971) observed that the most durable forms of power are those embedded so deeply in common sense that they become invisible: the dominant arrangements rule not only through coercion but by appearing natural, inevitable, and beyond question. This paper applies the concept of cultural hegemony to contemporary coordination infrastructure &mdash; the platforms, intermediaries, and standing institutional containers through which most economic exchange between strangers passes today.
                    </p>
                    <p>
                        We argue that the proposition &ldquo;two strangers need a platform to transact safely&rdquo; has achieved hegemonic status in the precise Gramscian sense: it is no longer argued for; it is presupposed in the language used to describe alternatives. The same applies to the propositions that production requires firms (the Coasean assumption) and that cross-border trade requires state- or alliance-controlled corridors. Each is a contingent design choice that has acquired the appearance of structural necessity.
                    </p>
                    <p>
                        A recently developed settlement primitive &mdash; its mechanism formalized and its kernel verified &mdash; makes the coordination function <em>visible</em> by separating it from the entities that currently perform it, and in doing so opens the organizational space to patterns of which the firm is only one. The primitive is not a better firm or a decentralized platform; it is an <em>organizational substrate</em> on which multiple coordination forms can be expressed, the way electricity is a substrate on which multiple vehicle architectures can be built. This paper is concerned not with the primitive itself but with what its existence reveals about the incumbent arrangement: how a contingent infrastructure passes for natural gravity, why challenging it differs from challenging an explicit ideology, and what communicative work is required to make existing architecture legible as architecture.
                    </p>
                    <p>
                        The aim is not predictive but diagnostic. We do not argue that the primitive will displace incumbents; we argue that recognizing such displacement as conceivable is itself the political-economy problem.
                    </p>
                </>
            }
            references={
                <>
                    <li>Anderson, P. The Antinomies of Antonio Gramsci. <em>New Left Review</em>, I/100:5&ndash;78, 1976.</li>
                    <li>Bowker, G. C. &amp; Star, S. L. <em>Sorting Things Out: Classification and Its Consequences</em>. MIT Press, Cambridge, MA, 1999.</li>
                    <li>Genovese, F. R. &amp; Daliana, A. Figaro: A Proof-of-Delivery Blockchain Solution to the Last Mile Problem. Unpublished working paper, March 2022 (archived in the project repository).</li>
                    <li>Gramsci, A. <em>Selections from the Prison Notebooks</em>. International Publishers, New York, 1971 (ed./trans. Q. Hoare &amp; G. Nowell-Smith).</li>
                    <li>Hall, S. Gramsci&rsquo;s Relevance for the Study of Race and Ethnicity. <em>Journal of Communication Inquiry</em>, 10(2):5&ndash;27, 1986.</li>
                    <li>Hirschman, A. O. <em>Exit, Voice, and Loyalty: Responses to Decline in Firms, Organizations, and States</em>. Harvard University Press, Cambridge, MA, 1970.</li>
                    <li>Larimer, D. Overpaying for Security: The Hidden Costs of Bitcoin. <em>Let&rsquo;s Talk Bitcoin</em>, September 2013 (early articulation of the decentralized autonomous corporation framing).</li>
                    <li>Srinivasan, B. <em>The Network State: How to Start a New Country</em>. Self-published, 2022.</li>
                    <li>Polanyi, K. <em>The Great Transformation: The Political and Economic Origins of Our Time</em>. Farrar &amp; Rinehart, New York, 1944.</li>
                    <li>Schelling, T. C. <em>The Strategy of Conflict</em>. Harvard University Press, Cambridge, MA, 1960.</li>
                    <li>Srnicek, N. <em>Platform Capitalism</em>. Polity, Cambridge, 2017.</li>
                    <li>Star, S. L. The Ethnography of Infrastructure. <em>American Behavioral Scientist</em>, 43(3):377&ndash;391, 1999.</li>
                    <li>Hall, S. <em>The Hard Road to Renewal: Thatcherism and the Crisis of the Left</em>. Verso, London, 1988.</li>
                    <li>Laclau, E. &amp; Mouffe, C. <em>Hegemony and Socialist Strategy: Towards a Radical Democratic Politics</em>. Verso, London, 1985.</li>
                    <li>Zuboff, S. <em>The Age of Surveillance Capitalism: The Fight for a Human Future at the New Frontier of Power</em>. PublicAffairs, New York, 2019.</li>
                    <li>Pasquale, F. <em>The Black Box Society: The Secret Algorithms That Control Money and Information</em>. Harvard University Press, Cambridge, MA, 2015.</li>
                    <li>West, T. A. P., Börner, J., Sills, E. O., &amp; Kontoleon, A. Overstated Carbon Emission Reductions from Voluntary REDD+ Projects in the Brazilian Amazon. <em>Proceedings of the National Academy of Sciences</em>, 117(39):24188&ndash;24194, 2020.</li>
                    <li>Edelman Trust Institute. <em>Edelman Trust Barometer 2026</em>. Annual cross-national survey on institutional trust, conducted yearly since 2001.</li>
                </>
            }
        >
            <PaperSection title="1. Introduction">
                <p>
                    This paper sits between political economy and the philosophy of infrastructure. Its starting point is a recently developed settlement primitive that prices the cost of trust at a fixed multiple of transaction value, with no recurring extraction and no arbitrator. The mechanism (asymmetric bonding plus buyer dominance with atomic resolution), its verified Solidity implementation, and the institutional-economic implications for the boundary of the firm have been treated in detail in their own registers. The present paper takes those contributions as given and asks a different question.
                </p>
                <p>
                    If the primitive&rsquo;s institutional consequences are as argued &mdash; if a class of standing intermediaries becomes structurally unnecessary in a precisely defined region of transaction space &mdash; why is the consequence so difficult to communicate? Why does the proposal land, in venues outside its immediate technical audience, as either obvious-but-unimportant or implausible-by-construction? The pattern is consistent enough to warrant explanation. The explanation we offer is Gramscian.
                </p>
                <PaperRun title="What this paper is and is not.">
                    This paper is an essay in the political economy of infrastructure. It does not extend the mechanism, prove new theorems, or make empirical predictions. Its claim is diagnostic: the difficulty of arguing for an alternative coordination architecture is a function of the incumbent architecture&rsquo;s hegemonic status, not of the alternative&rsquo;s intrinsic implausibility. The argument is short because the underlying observation is simple. We hope it is useful to those working on infrastructure design, on platform critique, or on the sociotechnical conditions of legitimate institutional change.
                </PaperRun>
            </PaperSection>

            <PaperSection title="2. Hegemony in the Gramscian Sense">
                <p>
                    Gramsci (1971) distinguished two registers of class rule: <em>coercion</em> (the state&rsquo;s monopoly on violence) and <em>consent</em> (the cultural saturation that makes the dominant arrangements appear inevitable). The latter, which he called <em>egemonia</em>, operates not by compelling agreement but by constituting the field within which agreement and disagreement become legible. A hegemonic proposition is not believed; it is <em>presupposed in the question</em>. To dispute it is not to disagree &mdash; it is to fail to make sense.
                </p>
                <p>
                    Gramsci developed the concept in the context of class formation in early-twentieth-century Italy, but the structure generalizes. Any arrangement that is required to be argued for has not yet achieved hegemony; any arrangement whose absence is unimaginable has exceeded it. Between these poles lie the durable institutions whose contingency is recognized in principle but functionally repressed in practice.
                </p>
                <p>
                    Subsequent scholarship (Anderson, 1976; Hall, 1986, 1988; Laclau &amp; Mouffe, 1985) has debated how the apparatus extends beyond the class-political setting Gramsci originally addressed. From Gramsci (1971) we take the distinction between <em>war of manoeuvre</em> (direct confrontation with the dominant configuration) and <em>war of position</em> (the slower, more durable work of establishing alternative common sense in the institutions and vocabulary through which the configuration is reproduced); the present argument belongs to the latter register. We also take <em>passive revolution</em> &mdash; the process by which a hegemonic bloc absorbs the vocabulary and some of the demands of a counter-hegemonic challenge while neutralizing its substantive claim &mdash; as a recurring caution: the likely path through which the bonded primitive&rsquo;s vocabulary enters mainstream discourse is via incumbents adopting the words &ldquo;decentralized,&rdquo; &ldquo;self-sovereign,&rdquo; &ldquo;trustless&rdquo; for products that retain the structural properties the primitive eliminates. The distinction we owe the reader is between adoption of vocabulary and substitution of substrate; only the latter is what we describe.
                </p>
                <p>
                    From Hall (1986, 1988) we take hegemony as the saturating work that secures consent to a particular configuration of forces by making it appear natural; Hall&rsquo;s <em>The Hard Road to Renewal</em> is the closer methodological precedent because it analyzes a specific hegemonic project (Thatcherism) as an articulation of common sense rather than as an elite program. From Laclau &amp; Mouffe (1985) we take the discursive-formation reading of hegemony as articulation of otherwise-disjoint elements into a coherent ideological configuration: the platform, the firm, and the corridor are articulated together in the dominant discourse not because they share a structural origin but because they have become mutually referring within the language of mainstream economics, business journalism, and policy. Adjacent frames: Polanyi&rsquo;s (1944) analysis of the disembedding of markets; the infrastructure-studies tradition on visibility and invisibility of coordination systems (Bowker &amp; Star, 1999; Star, 1999); Srnicek&rsquo;s (2017) typology of platform capitalism; Zuboff&rsquo;s (2019) analysis of <em>instrumentarian power</em>; and Pasquale&rsquo;s (2015) analysis of opacity as the operating logic of algorithmic intermediation.
                </p>
                <PaperRun title="Platform hegemony, distinct from generic platform-critique.">
                    A natural worry is that &ldquo;platform hegemony&rdquo; is just generic platform-critique with Gramscian vocabulary attached. The distinction is structural. A non-Gramscian platform-critique typically argues that the platform&rsquo;s rent extraction is <em>exploitative</em> and that better regulation, public ownership, or worker cooperatives would deliver the same coordination function on better terms. The Gramscian critique here is that the platform is the form coordination has taken under a particular historical configuration, and that the &ldquo;coordination function&rdquo; as currently bundled &mdash; search, matching, escrow, dispute resolution, reputation, enforcement &mdash; is itself a hegemonic production rather than a list of services any sufficiently advanced civilization must produce. The bonded primitive lets us see the bundle as a bundle; disaggregating it is the war-of-position move, and rebundling it under different ownership is what passive revolution would look like.
                </PaperRun>
                <PaperRun title="Three hegemonic propositions.">
                    We identify three propositions about contemporary coordination infrastructure that meet the Gramscian criterion. Each is contingent in principle; each is presupposed in practice.
                </PaperRun>
                <ol className="list-decimal pl-6 space-y-2">
                    <li><strong>Two strangers need a platform to transact safely.</strong> So deeply embedded that arguments <em>against</em> platform fees are conducted in the platform&rsquo;s own register: smaller fees, fairer fees, regulated fees, public platforms. The proposition that no platform is required typically appears as utopian or fraudulent. Yet for centuries, most economic exchange occurred without anything resembling the contemporary platform.</li>
                    <li><strong>Production requires firms.</strong> So naturalized that debates about &ldquo;the future of work&rdquo; are typically debates about the conditions of employment within firms, not about whether the firm is the right unit of production at all.</li>
                    <li><strong>Cross-border trade requires corridors controlled by state or alliance actors.</strong> Ports, railways, undersea cables, payment rails, settlement networks: the proposition that these must be controlled by some sovereign or coalition is so embedded that the distinction between &ldquo;geopolitical competition for control&rdquo; and &ldquo;geopolitical contestation of necessity&rdquo; is rarely made.</li>
                </ol>
                <PaperRun title="The historical bloc.">
                    A Gramscian analysis is incomplete without naming the bloc that sustains the arrangement. The three propositions are sustained jointly by what we call the <em>industrial-enforcement bloc</em>: industrial and financial capital accumulated within firm-shaped containers; a managerial class whose authority derives from the subordination relation the firm institutionalizes; platform sellers that extract coordination rent at the choke points where firms, consumers, and service providers meet; and state apparatuses whose enforcement capacity and property-rights frameworks make the firm-shaped container the privileged legal subject of contract, credit, and compliance. The propositions are common sense because this configuration has been the coordination substrate for the period within which modern economies formed. A counter-hegemonic formation would require not simply an alternative technology but the emergence of organic intellectuals whose vocabulary makes the configuration legible as a configuration rather than as gravity.
                </PaperRun>
                <PaperRun title="Empirical signature of hegemonic crisis.">
                    The configuration is not stable. The Edelman Trust Barometer (Edelman, 2026), conducted annually since 2001, has tracked steady cross-national decline in public trust of the institutions whose authority sustains the platform/firm/corridor arrangement: business, government, media, and NGOs. The decline is not bounded to any country or sector; it is structural. The present-moment data are consistent with a hegemonic apparatus losing the saturating presupposition it requires. This does not by itself produce a counter-hegemonic formation, but it locates the moment in the Gramscian sequence: when the configuration can no longer rely on common sense, articulating its contingency becomes legible in ways it was not before.
                </PaperRun>
                <PaperRun title="Hegemonic convergence and Schelling convergence are different.">
                    The hegemonic convergence we describe is <em>presupposed</em> convergence &mdash; the arrangement is common sense because participants do not deliberate about it. <em>Schelling convergence</em>, in Schelling&rsquo;s (1960) sense, is <em>recognized</em> convergence &mdash; participants knowingly pick a focal point because they correctly expect others to, and the recognition is part of the coordination mechanism. The contemporary configuration operates in the first register; the cohort operating around the bonded primitive and its native FIG token operates in the second. Counter-hegemonic coordination is necessarily a Schelling process, because a counter-hegemonic arrangement cannot be presupposed while it is still being argued for. The work of making a coordination arrangement legible is, in part, the work of establishing it as a credible Schelling point around which aligned participants converge without central authority.
                </PaperRun>
            </PaperSection>

            <PaperSection title="3. The Coordination Function as Design Choice">
                <p>
                    The reading we propose is that the settlement primitive makes the coordination function visible by separating it from the entities that currently perform it. We offer this as an interpretive claim of the present paper, not as a theorem of the mechanism itself: the bonding game &mdash; composed of asymmetric bonding (which prices enforcement) and buyer dominance with atomic resolution (which propagates coordination through the bonded mesh) &mdash; establishes equilibrium properties, and the separation reading is the political-economy lens through which we propose those properties be understood. Under that lens, the platform&rsquo;s coordination function (matching, enforcement, dispute resolution) becomes a public smart contract. The firm&rsquo;s coordination function (search, negotiation, enforcement) becomes three reducible costs. The corridor&rsquo;s coordination function (settlement, standards, access control) becomes a bilateral mechanism. Crucially, the <em>multi-party coordination</em> function of these legacy entities &mdash; the work of holding <Math>{"N"}</Math> parties in synchronized commitment through to a single resolution &mdash; becomes the work of Mechanism 2 rather than of an organizational nucleus.
                </p>
                <p>
                    The crucial move is not replacement but separation. In each case the entity does not need to be <em>replaced</em>; it needs to be <em>seen</em>. Once the coordination function is identified as a specific bundle of services that some technology provides &mdash; rather than as an undifferentiated property of the entity that currently provides it &mdash; the bundle becomes disaggregable. Disaggregation, in turn, makes substitution conceivable.
                </p>
                <PaperSubsection title="3.1 Figaro as Organizational Substrate">
                    <p>
                        The reframing we propose is that the bonded settlement primitive is not a better firm, a better platform, or a better corridor. It is a <em>substrate</em>: an infrastructural layer on which multiple organizational forms can be expressed, only one of which is the firm. Holacracy, to pick one example, was a network-native coordination experiment confined to a single firm&rsquo;s ownership nucleus; the primitive generalizes network-native coordination <em>beyond</em> any particular nucleus, opening the organizational space to patterns the firm paradigm has no vocabulary for &mdash; standing treasury communities, transaction-scoped assemblies, agent coalitions, peer networks that cross institutional and jurisdictional lines. We take &ldquo;substrate&rdquo; as a working hypothesis; the formal question of which composed mechanisms preserve the kernel&rsquo;s bonding equilibrium is the subject of the coordinator pattern, the supporting technical artifact.
                    </p>
                    <p>
                        The appropriate analogy is not between software tools but between energy substrates. The transition from coal to oil and gas produced a new industrial landscape; the internal-combustion engine was one emblematic artifact, but not the only one. The current transition from fossil fuels to electric power produces a different landscape, and legacy manufacturers repeatedly demonstrate that one cannot simply engineer the outgoing paradigm&rsquo;s artifact on the new substrate and call it equivalent; an electric vehicle is not an internal-combustion car with batteries attached but a distinct design whose architecture, software, supply chain, and operational logic are native to the new substrate.
                    </p>
                    <p>
                        Applied to organizational substrates: legacy institutions that try to describe the bonded primitive in firm-vocabulary (&ldquo;decentralized firm,&rdquo; &ldquo;DAO as a new kind of corporation,&rdquo; &ldquo;network equivalent of a platform&rdquo;) are doing what Western automakers did for the first two decades of the electric transition. The forms that will dominate the new substrate are not yet named, and the vocabulary for naming them is still being produced. This is precisely the labor Gramsci identified: the slow, unglamorous work of producing the conceptual vocabulary in which the new configuration becomes evaluable on its own terms rather than as a degraded copy of the outgoing one.
                    </p>
                    <PaperRun title="A note on the name.">
                        The protocol bears the name Figaro after the factotum of Seville: the character who declares himself the city&rsquo;s factotum in the <em>Largo al factotum</em> aria of Rossini&rsquo;s <em>Il Barbiere di Siviglia</em> (1816, libretto by Sterbini, drawn from Beaumarchais&rsquo;s <em>Le Barbier de Séville</em>, 1775). Figaro is the coordinator who arranges, brokers, and mediates between parties of otherwise incommensurable standing without owning what is being coordinated; the household&rsquo;s formal principals cannot accomplish their ends without his mediation, and the coordination he provides is not itself legible as an institution in the classical sense. The naming is substantive, not decorative. A bonded settlement primitive whose construction produces a coordination function that is enforced but not owned &mdash; that holds collateral, executes commitments, and discharges resolution without occupying the position of counterparty or patron &mdash; is a factotum in the literal Renaissance sense: one that &ldquo;does everything&rdquo; while owning nothing. The protocol is the factotum of the network on which it is deployed; and the visibility argument of this paper is, in part, an argument about naming: an institution whose coordination function lacks a vocabulary of its own remains structurally invisible <em>as</em> a coordination function. The naming dates to the project&rsquo;s first formulation (Genovese &amp; Daliana, 2022), predating the present mechanism by four years; the metaphor&rsquo;s continuity across iterations is part of the project&rsquo;s intellectual record.
                    </PaperRun>
                    <PaperRemark title="On what &ldquo;visible&rdquo; means here.">
                        Gramsci&rsquo;s analysis emphasized the role of <em>intellectuals</em> &mdash; in his idiosyncratic sense &mdash; in producing the conceptual vocabulary through which arrangements become contestable. Making the coordination function visible is, in that register, a kind of intellectual labor. It is not technical exposition (technical readers already see it); it is the work of producing a vocabulary in which non-technical readers can see it without first becoming technical readers. The technical work has been done in its own register; the present paper is the prerequisite for that work being absorbable in venues where it otherwise sounds like noise.
                    </PaperRemark>
                </PaperSubsection>
            </PaperSection>

            <PaperSection title="4. Adjacent Movements: Network States and Chambers Without Arbiters">
                <p>
                    The Gramscian diagnostic shares a family resemblance with several contemporary movements that reach an overlapping conclusion from different starting points. Three are worth naming, both to position the argument honestly and to identify where the bonded primitive supplies infrastructure the movements have struggled to specify.
                </p>
                <PaperRun title="Exit as political instrument.">
                    Hirschman (1970) distinguished three responses to institutional dissatisfaction: <em>exit</em> (take one&rsquo;s resources elsewhere), <em>voice</em> (argue within), and <em>loyalty</em> (neither). His framework is the upstream reference for contemporary arguments that coordination infrastructure admits <em>exit</em> as a meaningful alternative to <em>voice</em> &mdash; arguments which, absent credible exit options, collapse back into platform reform (voice within) or platform regulation (voice above). Our diagnostic is, from Hirschman&rsquo;s perspective, a claim about the artifactual character of the present exit constraint: exit from the platform configuration is not a serious political option because the coordination function has not been available outside it. The bonded primitive restores the condition Hirschman required for exit to discipline incumbents without recourse to voice.
                </PaperRun>
                <PaperRun title="The network-state thesis.">
                    Srinivasan (2022) develops the Hirschmanian move for the cloud era: communities that form online, acquire cohesion, build shared institutions, and eventually seek territorial and diplomatic presence. The thesis names an &ldquo;economic engine&rdquo; as a constitutive stage between community and recognition, but the movement has treated that stage as an unsolved sub-problem &mdash; commerce within a network-state community in practice continues to route through incumbent platforms and state-clearable fiat rails, i.e., through exactly the hegemonic configuration the community claims to be exiting. The bonded primitive is the missing engine. This is not a claim that the network-state program is correct in its further aims; it is a claim that the program requires a commerce substrate that has, at the time of writing, no rival.
                </PaperRun>
                <PaperRun title="Chambers without arbiters.">
                    A recurring pattern in crypto-native coordination &mdash; variously the decentralized autonomous chamber of commerce, the coordinator DAO, or under earlier branding the decentralized autonomous corporation (Larimer, 2013) &mdash; is the attempt to federate participant coordination without incorporating a governance body empowered to adjudicate disputes. The attempts recurrently drift into governance because participants have no other tool for the coordination function: once dispute resolution is on the table, a voting apparatus is the default answer. The bonded primitive provides the tool, and the work splits cleanly across its two mechanisms. Mechanism 1 (asymmetric bonding) handles the enforcement function the chamber would otherwise adjudicate; Mechanism 2 (buyer dominance with atomic resolution) handles the inter-party coordination function the chamber would otherwise govern, by making the entire bonded mesh resolvable from a single signature without a vote; permissionless seller registration handles the membership function the chamber would otherwise gatekeep. The chamber-without-arbiters ambition is not obviated by the primitive; it is made architecturally achievable, which it was not before.
                </PaperRun>
                <PaperRun title="Climate and cross-sovereignty coordination.">
                    Climate change is a coordination problem that has resisted solution in part because its scale exceeds any single sovereignty. The voluntary carbon market, established to coordinate emissions-reduction credit across jurisdictional boundaries, has been wracked by integrity crises (West et al., 2020): many credits bear little relationship to the emissions reductions they claim. The structural failure is that buyers cannot verify credits directly and have no choice but to trust a registry. The bonded primitive offers a different arrangement. A buyer bonded with a carbon-removal seller can require clause-validated GHG attestations, verify them against the protocol&rsquo;s clause registry, and hold the seller&rsquo;s bond until resolution. This is not a claim that Figaro solves climate change; it is a claim that the infrastructural failure mode of the voluntary carbon market &mdash; trusted registries producing credits without verifiable provenance &mdash; is of the same structural type as the coordination-function failure mode of the platform economy, and that the primitive addresses both in the same way.
                </PaperRun>
                <PaperRun title="Position of the present paper.">
                    The Gramscian framing is neither a substitute for nor a rival to these movements. It supplies the diagnostic register within which the coordination-infrastructure question can be posed at all; the movements supply concrete political and organizational programs within which the bonded primitive can be deployed. A reader arriving from the network-state literature should read this paper as naming the hegemonic configuration their program is trying to exit; a reader arriving from the coordinator-DAO literature should read it as naming the reason their coordinator-without-governance attempts have been structurally difficult.
                </PaperRun>
            </PaperSection>

            <PaperSection title="5. Why This Argument Is Hard to Make">
                <p>
                    The practical difficulty of communicating the implications of infrastructure shifts of this kind is not a communicative deficit on the part of the proponent. It is a structural feature of arguing against an arrangement whose necessity has achieved hegemonic status.
                </p>
                <PaperRun title="The asymmetry of argument.">
                    Proposing to remove a structure that most people do not know is there is qualitatively different from proposing a better version of the same structure. The latter operates within the existing register of debate (more efficient platforms, fairer firms, more inclusive corridors); the former requires first establishing the existence of the register itself. The proponent is not asking the listener to accept a counter-argument; they are asking the listener to accept that there is something to argue about. This is much harder.
                </PaperRun>
                <PaperRun title="The evaluator&rsquo;s predicament.">
                    A skeptical reader evaluating an architectural proposal that implies the dissolution of a major incumbent must do two unfamiliar things at once: (a) accept that the incumbent&rsquo;s necessity is contingent, and (b) evaluate a specific alternative. Either move is hard alone; together they are uncomfortable enough that many readers, in good faith, decline both and conclude that the proposal is implausible. The conclusion is rational under the listener&rsquo;s actual evaluative budget; it is not evidence about the proposal.
                </PaperRun>
                <PaperRun title="The proponent&rsquo;s inversion.">
                    A proponent of an architectural alternative typically frames the work in terms of the incumbent: &ldquo;a better Uber,&rdquo; &ldquo;Uber without the middleman,&rdquo; &ldquo;a decentralized firm.&rdquo; This framing has two costs. First, it concedes the centrality of the incumbent: the alternative is defined relative to it. Second, it re-encodes the incumbent&rsquo;s hegemonic vocabulary into the alternative, importing the very assumptions the alternative is supposed to dissolve. The right framing is disjunctive: the alternative does what the incumbent does <em>plus</em> what the incumbent prevents, where the latter is the substantive contribution. &ldquo;A better X&rdquo; frames are near-guaranteed to be misread; the work of finding non-incumbent vocabulary is the political-economy work the technology cannot do for itself.
                </PaperRun>
                <PaperRun title="The role of repeated exposure.">
                    Hegemonic propositions are dissolved not by definitive argument but by sustained exposure to alternative arrangements that function. The role of working examples (multi-party processes that resolve without a platform, treasuries that coordinate without a firm, corridors that settle without a sovereign) is not to prove the alternative is possible; it is to gradually shift the horizon of the imaginable. This is the slow, not the dramatic, register of institutional change.
                </PaperRun>
            </PaperSection>

            <PaperSection title="6. Conclusion">
                <p>
                    The platform, the firm, and the corridor share a structural property: each is a contingent coordination architecture that has achieved hegemonic status in the Gramscian sense. The recently developed settlement primitive makes the coordination function performed by each entity visible as a separable design artifact. This visibility is the prerequisite for any subsequent substitution argument; it does not, by itself, settle whether substitution will occur, at what rate, or in which regions of the transaction space.
                </p>
                <p>
                    The political-economy stakes are real but should not be overstated. The argument is diagnostic rather than predictive: a proposition that is presupposed cannot be evaluated; making it explicit is the work political economy must do before institutional analysis can proceed. In a hegemonic arrangement, the substantive work of an architectural proposal is largely the work of producing the vocabulary in which the proposal becomes evaluable. The technology rarely does this work for itself.
                </p>
                <p>
                    We close with two observations of method. First, the kernel is ideologically agnostic; the graph is the politics. The irreducible settlement primitive &mdash; the <code>commit</code>-and-<code>resolveProcess</code> operations, the bond structure, and the equilibrium they induce &mdash; contains no commitments about currency, jurisdiction, identity, arbitration, role structure, price-discovery, or contribution metric. All of these are expressed in the graph that parties compose on top of it: a Dutch-auction-and-private-seller graph expresses a market-liberal pattern; a cooperative-bonding-and-contribution-weighted-resolution graph expresses a cooperative one; an interest-free risk-sharing graph expresses an Islamic-finance one. The kernel enables each and prefers none &mdash; the architectural consequence of placing the enforcement function at TCP/IP altitude: a layer below which nothing remains to factor out, and a layer above which normative choices become legible as choices rather than as properties of the infrastructure. Second, the hegemony framework applies recursively. If the bonded settlement primitive itself becomes hegemonic in turn, the same diagnostic work will be required to make <em>that</em> contingency visible. There is no terminal infrastructure; there is only the next infrastructure whose contingency we have not yet learned to see.
                </p>
            </PaperSection>
        </PaperLayout>
    );
}
