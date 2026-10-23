import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import {
    PaperLayout,
    PaperSection,
    PaperSubsection,
    PaperRun,
    PaperRemark,
} from "@/components/papers/PaperLayout";
import { Math } from "@/components/papers/Math";

export const metadata: Metadata = withOg({
    title: "The Visibility of Coordination — Figaro Protocol",
    description:
        "A Gramscian reading: “two strangers need a platform to transact safely” is a hegemonic proposition, not a structural necessity. The mechanism makes the coordination function visible as a separable design choice.",
});

export default function VisibilityOfCoordinationPaper() {
    return (
        <PaperLayout slug="visibility-of-coordination"
            title="The Visibility of Coordination"
            subtitle="A Gramscian Reading of the Platform Economy and Its Successor"
            author="Figaro"
            date="April 2026"
            watermark="Figaro Protocol · Preprint"
            abstract={
                <>
                    <p>
                        Gramsci (1971) observed that the most durable power is embedded in common sense: it rules by appearing natural rather than by compelling assent. We apply his concept of hegemony to the infrastructure through which strangers coordinate exchange. Three propositions meet his test: that two strangers need a platform to transact safely, that production requires firms, and that cross-border transfer requires rails controlled by a state or an alliance. Each is presupposed in the language used to describe its alternatives, and each is a contingent design choice.
                    </p>
                    <p>
                        Beneath all three lies an older proposition: a stranger&rsquo;s promise is made good after the fact, from outside the trade. A bonded commit-and-resolve mechanism, whose equilibrium we state in the slice our argument uses, moves the guarantee before the trade and into the parties&rsquo; own bonds. That change of tense makes the coordination function visible as a bundle the incumbents perform, which can therefore be taken apart. Our claim is diagnostic: making such a substitution conceivable is the political-economy problem, and we turn the same diagnostic on the arrangement that proposes it.
                    </p>
                </>
            }
            references={
                <>
                    <li>Albæk, Svend, Peter Møllgaard, and Per B. Overgaard. 1997. &ldquo;Government-Assisted Oligopoly Coordination? A Concrete Case.&rdquo; <em>Journal of Industrial Economics</em> 45 (4): 429&ndash;443. https://doi.org/10.1111/1467-6451.00057.</li>
                    <li>Anderson, Perry. 1976. &ldquo;The Antinomies of Antonio Gramsci.&rdquo; <em>New Left Review</em> I/100: 5&ndash;78. https://doi.org/10.64590/lrz.</li>
                    <li>Coase, Ronald H. 1937. &ldquo;The Nature of the Firm.&rdquo; <em>Economica</em> 4 (16): 386&ndash;405. https://doi.org/10.1111/j.1468-0335.1937.tb00002.x.</li>
                    <li>Dahlman, Carl J. 1979. &ldquo;The Problem of Externality.&rdquo; <em>Journal of Law and Economics</em> 22 (1): 141&ndash;162. https://doi.org/10.1086/466936.</li>
                    <li>Edelman. 2025. <em>2025 Edelman Trust Barometer: Trust and the Crisis of Grievance</em>. Global report, twenty-fifth annual edition; 33,000 respondents in 28 countries. New York: Edelman Trust Institute. https://www.edelman.com/trust/2025/trust-barometer. Accessed October 19, 2026.</li>
                    <li>Edwards, Jeremy, and Sheilagh Ogilvie. 2012. &ldquo;Contract Enforcement, Institutions, and Social Capital: The Maghribi Traders Reappraised.&rdquo; <em>Economic History Review</em> 65 (2): 421&ndash;444. https://doi.org/10.1111/j.1468-0289.2011.00635.x.</li>
                    <li>Figaro. 2026. &ldquo;Asymmetric Bonding and Buyer Dominance: Two Composing Mechanisms for Self-Enforcing N-Party Coordination.&rdquo; Preprint. https://figaroprotocol.com/papers/asymmetric-bonding/. Accessed October 19, 2026.</li>
                    <li>Genovese, F. R. 2022. &ldquo;Figaro: A Proof of Delivery Blockchain Solution to the Last Mile Problem.&rdquo; Unpublished working paper, March 2022.</li>
                    <li>Genovese, F. R., and A. Daliana. 2023. &ldquo;Figaro: Compositional Market Design.&rdquo; Unpublished working paper, May 2023.</li>
                    <li>Gramsci, Antonio. 1971. <em>Selections from the Prison Notebooks</em>. Edited and translated by Quintin Hoare and Geoffrey Nowell-Smith. New York: International Publishers.</li>
                    <li>Greif, Avner. 1993. &ldquo;Contract Enforceability and Economic Institutions in Early Trade: The Maghribi Traders&rsquo; Coalition.&rdquo; <em>American Economic Review</em> 83 (3): 525&ndash;548. https://www.jstor.org/stable/2117532.</li>
                    <li>Hall, Stuart. 1986. &ldquo;Gramsci&rsquo;s Relevance for the Study of Race and Ethnicity.&rdquo; <em>Journal of Communication Inquiry</em> 10 (2): 5&ndash;27. https://doi.org/10.1177/019685998601000202.</li>
                    <li>Hall, Stuart. 1988. <em>The Hard Road to Renewal: Thatcherism and the Crisis of the Left</em>. London: Verso.</li>
                    <li>Hirschman, Albert O. 1970. <em>Exit, Voice, and Loyalty: Responses to Decline in Firms, Organizations, and States</em>. Cambridge, MA: Harvard University Press.</li>
                    <li>Laclau, Ernesto, and Chantal Mouffe. 1985. <em>Hegemony and Socialist Strategy: Towards a Radical Democratic Politics</em>. London: Verso.</li>
                    <li>Larimer, Daniel. 2013. &ldquo;Overpaying for Security.&rdquo; <em>Let&rsquo;s Talk Bitcoin</em> (blog), September 7, 2013. https://letstalkbitcoin.com/is-bitcoin-overpaying-for-false-security/. Archived by the Internet Archive, September 13, 2013, https://web.archive.org/web/20130913013606/http://letstalkbitcoin.com/is-bitcoin-overpaying-for-false-security/. Accessed October 19, 2026.</li>
                    <li>Milgrom, Paul R., Douglass C. North, and Barry R. Weingast. 1990. &ldquo;The Role of Institutions in the Revival of Trade: The Law Merchant, Private Judges, and the Champagne Fairs.&rdquo; <em>Economics and Politics</em> 2 (1): 1&ndash;23. https://doi.org/10.1111/j.1468-0343.1990.tb00020.x.</li>
                    <li>Robertson, Brian J. 2015. <em>Holacracy: The New Management System for a Rapidly Changing World</em>. New York: Henry Holt.</li>
                    <li>Schelling, Thomas C. 1960. <em>The Strategy of Conflict</em>. Cambridge, MA: Harvard University Press.</li>
                    <li>Srinivasan, Balaji. 2022. <em>The Network State: How to Start a New Country</em>. Self-published. https://thenetworkstate.com/. Accessed October 20, 2026.</li>
                </>
            }
        >
            <PaperSection title="1. Introduction">
                <p>
                    Consider two strangers who agree that one will deliver a part to the other for a payment <Math>{"P"}</Math>. Asked how the trade can be made safe, most readers name an institution: a platform that holds the payment, a firm that employs both parties, a bank that clears the transfer, a court that hears the breach. Each answer supplies the guarantee after the breach and from outside the trade. A second answer exists, in which each party locks its own bond before the trade begins. This paper asks why that second answer is so hard to hear.
                </p>
                <p>
                    The explanation we offer is Gramscian. The second answer lands, outside its technical audience, as either obvious but unimportant or implausible by construction. We read that pattern as a symptom of the first answer&rsquo;s hegemonic status, not of the second answer&rsquo;s weakness. The paper is an essay in the political economy of infrastructure: it extends no mechanism and makes no empirical prediction. Its one claim is diagnostic, and the mechanism of §1.1 is the evidence the diagnosis rests on.
                </p>
                <PaperSubsection title="1.1 The mechanism, in the slice this paper uses">
                    <p>
                        The mechanism has two calls, and each carries a mechanism design of its own. A <em>process</em> is one buyer&rsquo;s trade with one or more sellers; each buyer&ndash;seller commitment inside it is an <em>order</em>. The two calls run on what we call the Core, four contracts that, beside commit and resolve, bind what a party attests to the agreement it signed and resolve many processes at once against one validity proof; neither adds a decision of its own. <em>Commit</em> opens an order under asymmetric bonding. Both parties sign it; the buyer locks <Math>{"2P"}</Math>, and the seller locks <Math>{"2G"}</Math>, where <Math>{"G"}</Math> is the cumulative value through its order: every payment the process has accumulated so far, its own included. <Math>{"G"}</Math> is fixed by arithmetic on the signed accumulator, so no party reports it.
                    </p>
                    <p>
                        <em>Resolve</em> closes the process under buyer dominance with atomic resolution. Only the buyer may call it. It resolves every order in the process together or none of them, and it is terminal: no bond is refunded party by party, and a resolved process takes no further order. At resolution each seller receives <Math>{"2G + P"}</Math>, its bond and its payment, and the buyer receives <Math>{"P"}</Math>, its bond less the payment. The process then dissolves, leaving its data.
                    </p>
                    <p>
                        The doubling answers retention. The goods pass off the chain, so a party that walks away keeps what is in its hands, and a bond equal to that value would be exactly canceled by the taking (Figaro 2026, Definition 7). A seller that holds out leaves its <Math>{"2G"}</Math> locked and keeps at most <Math>{"G"}</Math>, so it ends at <Math>{"-G"}</Math> or worse against <Math>{"+P"}</Math> for performing. A buyer that never resolves leaves its <Math>{"2P"}</Math> locked and holds a delivery worth <Math>{"P"}</Math>, so it ends at <Math>{"-P"}</Math> against <Math>{"0"}</Math> for resolving.
                    </p>
                    <p>
                        Cooperation is the equilibrium, in three steps. After performance, resolving is strictly better for the buyer, with no assumption about the seller. Given that, the buyer&rsquo;s plan to resolve once performance has occurred and not before, and its co-sellers&rsquo; performance, performing is each seller&rsquo;s strict best response. Given that the sellers will perform, the buyer keeps the process open before performance rather than resolving at once, which would end it at <Math>{"-P"}</Math>. The last two steps are the two parties&rsquo; best-response checks against one profile, so they hold jointly, as a fixed point; the first is the one unconditional anchor. The equilibrium is proved, for any number of orders the network resolves in one call, in Figaro (2026).
                    </p>
                    <p>
                        The two mechanisms compose, and neither substitutes for the other. Bonding is what scales: the same schedule at every order secures a process as long as the network can resolve in one call. Buyer dominance with atomic resolution coordinates the process bonding has secured: nobody is paid until the buyer resolves, so every seller holds a live interest in every other seller&rsquo;s performance. Only the buyer&rsquo;s resolution closes a process or releases a bond. That rule is a constraint protecting the equilibrium the two mechanisms induce, rather than a third mechanism.
                    </p>
                    <p>
                        The chain holds fingerprints, never the goods. It holds the parties, the unit (the one token in which a process&rsquo;s payments and bonds are counted), the payment, the bonds, the accumulator, the merkle root of the agreement each order carries, and whether the process has closed. The Core holds no test of performance and decides nothing about it. An honest disagreement about whether what arrived met the agreement is worked out while the process stands open: the parties negotiate a remedy before resolve, and a forum asked to rule does so on the open data. The forum cannot call resolve; the buyer resolves once satisfied, and resolution is terminal acceptance.
                    </p>
                    <p>
                        Above the Core sit the published designs. A <em>clause</em> is one relationship between parties; an <em>agreement</em> is the clauses composed for one order; an <em>assembly</em> is agreements composed into a reusable design of a process. A <em>designer</em> composes them and registers them in public registries; sellers bind a design and buyers select it. We call the composed designs the <em>graph</em>.
                    </p>
                </PaperSubsection>
            </PaperSection>

            <PaperSection title="2. Hegemony in the Gramscian Sense">
                <p>
                    Gramsci (1971) distinguished two registers of rule: <em>coercion</em>, the state&rsquo;s monopoly on violence, and <em>consent</em>, the cultural saturation that makes the dominant arrangement appear inevitable. The second, which he called <em>egemonia</em>, constitutes the field within which agreement and disagreement become legible. A hegemonic proposition is not believed; it is presupposed in the question. To dispute it is not to disagree but to fail to make sense. Any arrangement that must be argued for has not yet achieved hegemony, and the durable institutions sit where their contingency is granted in principle and repressed in practice.
                </p>
                <p>
                    Later scholarship (Anderson 1976; Hall 1986, 1988; Laclau and Mouffe 1985) has debated how far the apparatus extends beyond the class politics of early-twentieth-century Italy. From Gramsci we take the distinction between a <em>war of maneuver</em>, direct confrontation with the dominant configuration, and a <em>war of position</em>, the slower work of establishing an alternative common sense; this argument belongs to the second. From Hall we take hegemony as an articulation of common sense rather than an elite program, the reading his study of Thatcherism makes concrete. From Laclau and Mouffe we take articulation as the joining of disjoint elements: the platform, the firm, and the corridor share no structural origin, yet the language of economics, business journalism, and policy makes them refer to one another.
                </p>
                <p>
                    We also take <em>passive revolution</em> as a caution: a hegemonic bloc absorbs the vocabulary of a challenge while neutralizing its substantive claim. The likely path for this mechanism&rsquo;s vocabulary is incumbents adopting &ldquo;decentralized,&rdquo; &ldquo;self-sovereign,&rdquo; and &ldquo;trustless&rdquo; for products that keep the structure the mechanism replaces. The distinction we owe the reader is between adopting a vocabulary and substituting a substrate. We describe only the second.
                </p>
                <PaperRun title="Is platform hegemony just platform critique in Gramscian dress?">
                    The distinction is structural. A platform critique of the usual kind argues that the platform&rsquo;s rent is exploitative, and that regulation, public ownership, or worker cooperatives would deliver the same coordination function on better terms. Our claim is that the function as currently bundled &mdash; search, matching, payment, dispute, reputation, enforcement &mdash; is itself a historical production rather than a list of services any economy must buy from one provider. Rebundling it under different ownership is what passive revolution looks like.
                </PaperRun>
                <PaperRun title="Three hegemonic propositions.">
                    Three propositions about coordination infrastructure meet the Gramscian test. Each is contingent in principle and presupposed in practice.
                </PaperRun>
                <ol className="list-decimal pl-6 space-y-2">
                    <li><strong>Two strangers need a platform to transact safely.</strong> Arguments against the platform&rsquo;s commission are conducted in the platform&rsquo;s own register: a smaller commission, a fairer one, a regulated one, a public platform. The platform is the newest carrier of an older proposition. Exchange between strangers has always had an institution that made a promise good after the fact: the law merchant, whose private judges kept the account by which a cheat was known (Milgrom, North, and Weingast 1990); the coalition whose members punished a cheating agent by collective exclusion (Greif 1993); the guild; the court. Each presupposed, and the platform presupposes now, that the guarantee arrives after the breach and from outside the trade.</li>
                    <li><strong>Production requires firms.</strong> Debates about &ldquo;the future of work&rdquo; are typically debates about employment inside firms, not about whether the firm is the right unit of production. The firm makes performance good after the fact, by direction and dismissal: the same proposition, carried by hierarchy.</li>
                    <li><strong>Cross-border transfer requires rails controlled by a state or an alliance.</strong> Payment rails, clearing networks, and correspondent-banking relationships embed the assumption that value crossing a border must clear through a sovereign or a coalition. The corridor bundles more than this, and we examine only the narrower proposition: that the clearing itself, apart from the corridor&rsquo;s ports, railways, and cables, requires such rails. The corridor makes the transfer good after the fact, by a sovereign&rsquo;s clearing and its courts: the same proposition, carried by a state.</li>
                </ol>
                <PaperRun title="Does the contested Maghribi evidence weaken the lineage?">
                    Edwards and Ogilvie (2012) dispute that the Maghribi traders relied on a coalition rather than on formal courts. The lineage needs only the point both sides of that debate share: whichever supplied it, the guarantee came after the fact.
                </PaperRun>
                <PaperRun title="The historical bloc.">
                    A Gramscian analysis names the bloc that sustains the arrangement. We call it the <em>industrial-enforcement bloc</em>, and it joins four members. The first two are capital accumulated within firm-shaped containers and a managerial class whose authority derives from the subordination the firm institutionalizes. The other two are platforms that take coordination rent, the recurring extraction by a party the two sides cannot transact without, and states whose property-rights frameworks make the firm the privileged legal subject of contract, credit, and compliance. The three propositions are common sense because this configuration has been the coordination substrate for the whole period in which modern economies formed. A counter-hegemonic formation needs more than an alternative technology. It needs what Gramsci called organic intellectuals, whose vocabulary makes the configuration legible as a configuration rather than as gravity.
                </PaperRun>
                <PaperRun title="A permissive condition, not a signature.">
                    The configuration&rsquo;s reliance on unexamined consent is under strain. The 2025 Edelman Trust Barometer frames its findings as a crisis of grievance: about six in ten respondents across its countries report a moderate or high sense of grievance, and a majority see government and business as serving a privileged few (Edelman 2025). Does falling trust signal failing hegemony? Not at this level of evidence, because trust surveys measure many things. We read the finding as a permissive condition: where the configuration can rely less on common sense, its contingency becomes easier to state. It does not by itself produce a counter-hegemonic formation.
                </PaperRun>
                <PaperRun title="Hegemonic convergence and Schelling convergence are different.">
                    Hegemonic convergence is <em>presupposed</em>: the arrangement is common sense because participants do not deliberate about it. Schelling convergence (Schelling 1960) is <em>recognized</em>: participants knowingly pick a focal point because they expect others to pick it, and the recognition is part of the coordination. The incumbent configuration operates in the first register; whoever converges on the mechanism operates in the second. Counter-hegemonic coordination is therefore a Schelling process, because an arrangement cannot be presupposed while it is still being argued for.
                </PaperRun>
            </PaperSection>

            <PaperSection title="3. The Coordination Function as a Design Choice">
                <p>
                    The mechanism makes the coordination function visible by separating it from the entities that perform it. This is an interpretive claim, and the equilibrium of §1.1 is its evidence. Under the separation, the platform&rsquo;s bundle comes apart into pieces no single entity performs. Enforcement becomes the bonds and the buyer&rsquo;s resolution. Search becomes what participants declare of themselves in public registries. Payment becomes resolution&rsquo;s own transfers. Dispute becomes any forum asked to rule, on open data, before the buyer resolves. Reputation becomes the data a party&rsquo;s closed processes leave.
                </p>
                <p>
                    The firm&rsquo;s function separates the same way. It becomes Coase&rsquo;s (1937) cost of using the price mechanism, in Dahlman&rsquo;s (1979) three-part statement: search and information, bargaining and decision, policing and enforcement, each priced rather than internalized. The corridor&rsquo;s clearing function becomes a bonded commitment between the transacting parties. The multi-party function of all three &mdash; holding <Math>{"N"}</Math> parties in commitment through to a single close, up to as many orders as the network resolves in one call &mdash; becomes the work of atomic resolution rather than of an organizational nucleus. Once the function is a named bundle rather than a property of its provider, the bundle can be taken apart, and taking it apart makes substitution conceivable.
                </p>
                <PaperRemark title="Does the chain become the new platform?">
                    A referee will ask whether separation only relocates the bundle to a new provider. It does not, because the chain accepts exactly one judgment after commit: the buyer&rsquo;s decision to resolve. Every other judgment &mdash; which assembly to bind, which remedy to accept, which forum to ask &mdash; is made by a named party, before the signatures or while the process stands open. A provider that sits between the parties needs a decision point, and the Core offers none.
                </PaperRemark>
                <PaperSubsection title="3.1 The mechanism as organizational substrate">
                    <p>
                        The mechanism is a <em>substrate</em>: a layer on which many organizational forms can be expressed, of which the firm is one. It is not a better firm, platform, or corridor. Holacracy (Robertson 2015) was a network-native coordination experiment adopted firm by firm, so each instance stayed inside one firm&rsquo;s ownership. The substrate carries network-native coordination beyond any such nucleus: standing treasury communities, transaction-scoped processes, agent coalitions, peer networks that cross institutional and jurisdictional lines. The equilibrium holds under all of them, because no composed design can move a bond or resolve a process without its buyer&rsquo;s signature.
                    </p>
                    <p>
                        The apt analogy is between energy substrates, not software tools. An electric vehicle is not an internal-combustion car with batteries attached; it is a design native to its substrate. Descriptions of the mechanism in firm vocabulary (&ldquo;a decentralized firm,&rdquo; &ldquo;the DAO as a new kind of corporation,&rdquo; &ldquo;the network equivalent of a platform&rdquo;) make the opposite mistake. The forms native to this substrate are not yet named.
                    </p>
                    <PaperRun title="A note on the name.">
                        The protocol is named Figaro, after the factotum of Seville: the coordinator who arranges between parties of unequal standing without owning what he coordinates. The mechanism holds the bonds and executes resolution without becoming counterparty or patron, so it is a factotum in the literal sense, one that does everything and owns nothing. The name bears on this paper&rsquo;s argument: a coordination function without a vocabulary of its own stays invisible as a coordination function. The name dates to the project&rsquo;s first formulation (Genovese 2022; Genovese and Daliana 2023), which predates the present mechanism.
                    </PaperRun>
                </PaperSubsection>
            </PaperSection>

            <PaperSection title="4. Adjacent Movements: Exit, Network States, and Chambers Without Arbiters">
                <p>
                    Three contemporary movements reach a conclusion near ours from other starting points. We name them to place the argument, and to identify where the mechanism supplies infrastructure each has struggled to specify.
                </p>
                <PaperRun title="Exit as political instrument.">
                    Hirschman (1970) distinguished three responses to institutional decline: <em>exit</em>, taking one&rsquo;s resources elsewhere; <em>voice</em>, arguing within; and <em>loyalty</em>, staying. Arguments that coordination infrastructure admits exit collapse back into platform reform or platform regulation, both forms of voice, when no credible exit exists. From Hirschman&rsquo;s perspective our diagnosis concerns the artifactual character of that constraint: exit from the platform configuration has not been a serious option because the coordination function has not been available outside it. Hirschman treats exit and voice as interacting, and we claim no more than this: the mechanism supplies the alternative that exit requires.
                </PaperRun>
                <PaperRun title="The network-state thesis.">
                    We read Srinivasan (2022) as carrying exit into the cloud era: communities form online, acquire cohesion, crowdfund territory, and seek diplomatic recognition. The book&rsquo;s sequence runs from startup society through network union and network archipelago to network state, and it lists an integrated cryptocurrency and an on-chain census among a network state&rsquo;s traits. In our reading it leaves the enforcement of trade between members unspecified, so commerce inside such a community still routes through incumbent platforms and fiat rails. The mechanism supplies that commerce substrate. This says nothing about whether the program&rsquo;s further aims are right.
                </PaperRun>
                <PaperRun title="Chambers without arbiters.">
                    A recurring pattern in crypto-native coordination is the attempt to federate participants without a governance body empowered to adjudicate disputes; an early form was the decentralized autonomous corporation (Larimer 2013). The attempts drift into governance because participants have no other tool: once dispute is on the table, a vote is the default answer. The mechanism supplies the tool, and the work splits across its two mechanisms and its open admission. Asymmetric bonding takes the enforcement the chamber would adjudicate. Buyer dominance with atomic resolution takes the coordination the chamber would govern, since one signature resolves the whole bonded process without a vote. Permissionless participation takes the membership the chamber would gatekeep. The chamber without arbiters becomes architecturally achievable.
                </PaperRun>
            </PaperSection>

            <PaperSection title="5. Why This Argument Is Hard to Make">
                <p>
                    The difficulty is structural, not a failure of exposition. Arguing against an arrangement whose necessity is hegemonic differs in kind from arguing for a better version of it.
                </p>
                <PaperRun title="The asymmetry of argument.">
                    A better version of the same structure argues inside the existing register: more efficient platforms, fairer firms, more inclusive corridors. Removing a structure most readers do not know is there requires first establishing that the register exists. The proponent asks the listener to accept not a counter-argument but that there is something to argue about. A skeptical reader must then do two unfamiliar things at once: grant that the incumbent&rsquo;s necessity is contingent, and evaluate a specific alternative. Many readers, in good faith, decline both and conclude the proposal is implausible. That conclusion is rational under the reader&rsquo;s evaluative budget, and it is no evidence about the proposal.
                </PaperRun>
                <PaperRun title="The proponent&rsquo;s inversion.">
                    Proponents of an alternative architecture typically frame it by the incumbent: &ldquo;a better Uber,&rdquo; &ldquo;a cooperative Uber,&rdquo; &ldquo;a decentralized firm.&rdquo; The framing has two costs. It concedes the incumbent&rsquo;s centrality, since the alternative is defined relative to it. And it re-encodes the incumbent&rsquo;s vocabulary into the alternative, importing the assumptions the alternative dissolves. The accurate framing is additive: the alternative does what the incumbent does, plus what the incumbent&rsquo;s structure prevents, and the second part is the contribution. Finding the vocabulary for that second part is the organic intellectual&rsquo;s work of §2, and the technology cannot do it for itself.
                </PaperRun>
                <PaperRun title="The role of repeated exposure.">
                    Hegemonic propositions dissolve under sustained exposure to arrangements that work, not under a definitive argument. A working example &mdash; a multi-party process that closes without a platform, a treasury that coordinates without a firm, a cross-border trade its parties close themselves &mdash; does not prove the alternative possible. It shifts the horizon of the imaginable, which is the slow register of institutional change and the Schelling process of §2.
                </PaperRun>
            </PaperSection>

            <PaperSection title="6. The Diagnostic Turned on Its Proposers">
                <p>
                    The mechanism is ideologically agnostic, and the graph is the politics. The Core contains no commitment about currency, jurisdiction, identity, arbitration, role structure, price discovery, or contribution metric. Each is expressed in the graph that designers compose, sellers bind, and buyers select: a posted-price graph of private sellers expresses a market-liberal pattern, a cooperative graph with contribution-weighted distribution a cooperative one, an interest-free risk-sharing graph an Islamic-finance one. The Core enables each and prefers none, because it sits at the altitude of TCP/IP: below it nothing remains to factor out, and above it normative choices are legible as choices.
                </p>
                <p>
                    The hegemony framework applies recursively. If the mechanism became hegemonic in turn, the same work would be needed to make its contingency visible. That work can begin now, at the graph layer: the composed designs, the tokens a graph is denominated in, and the registrations participants make, none of which the Core contains. That is where this arrangement&rsquo;s own concentrations would form, and four are visible.
                </p>
                <p>
                    The first is <em>compounding</em>. The protocol rewards designers, from a fixed reserve and by a rule published in advance, in proportion to the use resolved trades make of their clauses, registered agreements (an agreement registered without its values, the reusable unit an assembly is composed from), and assemblies. A reward that tracks use compounds advantage toward work adopted early, a first-mover advantage the design discloses rather than removes. Its largest single instance is the treasury&rsquo;s own: the treasury is the wallet of the protocol&rsquo;s DAO, a body that spends it by judgment on what the network needs. A registry binds each design to its <em>designer of record</em>, the wallet that registered it and the one its rewards accrue to. The treasury is designer of record of the mandatory clauses it registers. By the registration layer&rsquo;s convention an agreement composes a pick of mandatory clauses, the treasury&rsquo;s or another wallet&rsquo;s; where the pick is the treasury&rsquo;s, the reserve rewards it, on the same meter as any designer, each time a trade under that design resolves. Its share is largest in a period where third-party design is thin, and is diluted pro rata where third-party design thrives.
                </p>
                <p>
                    The second is <em>holding</em>. The protocol&rsquo;s token, the florin, is capped, and its larger part is a reserve that exists only as designers claim it. The part minted at genesis, at no price, sits in a few wallets from the start: seven hundredths with the founder and three tenths with the treasury, under a standing, published position never to sell, buy, or supply a market for it, and three hundredths with early supporters under no such position. Nothing on chain enforces the position. A holding confers no position in the mechanism and no lever over the reward rule, yet it carries weight in whatever market forms around the token. The position that restrains it is exactly the kind of commitment this paper is about: its whole force is that a breach would be legible beside the words.
                </p>
                <p>
                    The third is <em>standing</em>. Each registry keys a design on a hash of its content, registers it first-write-wins, and binds its designer of record permanently. For a clause the key is the hash of its exact bytes; for an agreement or an assembly it is a root over the leaves it composes, so prose outside those leaves leaves the key unchanged. Early arrival therefore takes the designer-of-record standing over one composition, and a fast registrant can take that standing over a composition someone else published, an agreement or assembly whose prose it has rewritten included. What it cannot take is a name, since a rival composition is a new key.
                </p>
                <p>
                    The fourth is <em>disclosure</em>, and it has two faces. Between the parties, publishing the rules and the bonds in advance lowers the information asymmetry every ex post institution lived on. Between rivals, a public ledger on which each order&rsquo;s payment, unit, buyer, and seller can be read is the kind of price exchange competition law treats as a facilitator of tacit coordination. When the Danish competition authority published firm-level transaction prices for ready-mixed concrete, average prices of the published grades rose by fifteen to twenty percent within a year (Albæk, Møllgaard, and Overgaard 1997). The analogy has one break and two mitigations, and none disposes of it. No authority publishes on the rivals&rsquo; behalf, since the ledger is the mechanism&rsquo;s own; the parties are wallets, not names; and the chain holds only the coarsest grain of a trade, the terms staying the parties&rsquo; own.
                </p>
                <p>
                    Against these four, the architecture contains its own counter-pressures. Competition is permissionless over every surface: a rival clause, a rival assembly, a rival interface, rival contracts on the same public infrastructure. Bonds scale with the value a process carries, summed from its signed payments, rather than with any one order&rsquo;s price. Against compounding, the reward schedule places its largest budgets on the latest periods, when there is most use to measure, and ends after a fixed number of them. Whether these suffice cannot be decided by the designers&rsquo; assurances; it can be answered only by the diagnostic vigilance this paper has applied to the incumbent arrangement, and disclosure is where that work is least done.
                </p>
            </PaperSection>

            <PaperSection title="7. Conclusion">
                <p>
                    The platform, the firm, and the corridor are contingent coordination architectures with hegemonic status, and each carries one older proposition: a promise between strangers is made good after the breach, from outside the trade. The mechanism moves the guarantee before the trade and into the parties&rsquo; own bonds, and that change of tense makes the carriers visible as carriers. Visibility is the precondition of any substitution argument; it does not decide whether substitution occurs, or where. A thesis about the invisibility of coordination that exempted the infrastructure of those who wrote it would be held for convenience. We do not exempt it, and that refusal is the only evidence available that the thesis is held honestly.
                </p>
            </PaperSection>
        </PaperLayout>
    );
}
