import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import {
    PaperLayout,
    PaperSection,
    PaperSubsection,
    PaperRun,
} from "@/components/papers/PaperLayout";
import { Math } from "@/components/papers/Math";

export const metadata: Metadata = withOg({
    title: "The Subordination Variable — Figaro Protocol",
    description:
        "The cooperative-Marxian and classical-liberal traditions both hinge on subordination and on the rent intermediaries take. A bonded commitment sets both to zero in the layer exchange runs on, so one artifact admits both traditions' readings, and their partition relocates to the graph composed above it.",
});

export default function SubordinationVariablePaper() {
    return (
        <PaperLayout slug="subordination-variable"
            title="The Subordination Variable"
            subtitle="Why One Coordination Substrate Admits Both the Free-Association and the Frictionless-Market Reading"
            author="Figaro"
            date="April 2026"
            watermark="Figaro Protocol · Preprint"
            abstract={
                <>
                    <p>
                        The cooperative-Marxian and the classical-liberal traditions agree on what divides them: the wage relation, in which a worker transfers residual control over its conduct to an owner of the means of production in exchange for a wage. One tradition reads the transfer as expropriation, the other as the efficient answer to the cost of coordination. Both assume that production at scale needs either a firm, which subordinates, or an intermediary, which takes a recurring rent for enforcing exchange. We examine a mechanism that needs neither. In a bonded commitment the buyer bonds twice the payment and each seller twice the value accumulated through its order; only the buyer resolves, and resolution pays every seller and refunds every bond at once.
                    </p>
                    <p>
                        Under that mechanism no residual right over a seller&rsquo;s conduct passes to anyone, and no party takes a rent for enforcement. The same artifact then answers both to Marx&rsquo;s &ldquo;association of free men, working with the means of production held in common&rdquo; and to the classical-liberal account of voluntary exchange, and both descriptions are accurate. Two qualifications bind the claim: a party needs the wealth to post its bond, and the mechanism inherits its property baseline from the law around it. The partition between the traditions does not vanish. It relocates to the graph, the designs composed above the mechanism, where distribution, public goods, and the composition of participation are decided.
                    </p>
                </>
            }
            references={
                <>
                    <li>Bowles, Samuel, and Herbert Gintis. 1996. &ldquo;The Distribution of Wealth and the Viability of the Democratic Firm.&rdquo; In <em>Democracy and Efficiency in the Economic Enterprise</em>, edited by Ugo Pagano and Robert Rowthorn, 82&ndash;97. London: Routledge.</li>
                    <li>Braverman, Harry. 1974. <em>Labor and Monopoly Capital: The Degradation of Work in the Twentieth Century</em>. New York: Monthly Review Press.</li>
                    <li>Burawoy, Michael. 1979. <em>Manufacturing Consent: Changes in the Labor Process under Monopoly Capitalism</em>. Chicago: University of Chicago Press.</li>
                    <li>Cheney, George. 1999. <em>Values at Work: Employee Participation Meets Market Pressure at Mondrag&oacute;n</em>. Ithaca, NY: Cornell University Press.</li>
                    <li>Coase, R. H. 1937. &ldquo;The Nature of the Firm.&rdquo; <em>Economica</em> 4 (16): 386&ndash;405. https://doi.org/10.1111/j.1468-0335.1937.tb00002.x.</li>
                    <li>Cohen, G. A. 1978. <em>Karl Marx&rsquo;s Theory of History: A Defence</em>. Princeton, NJ: Princeton University Press.</li>
                    <li>Figaro. 2026. &ldquo;Asymmetric Bonding and Buyer Dominance: Two Composing Mechanisms for Self-Enforcing N-Party Coordination.&rdquo; Preprint. https://figaroprotocol.com/papers/asymmetric-bonding/. Accessed October 18, 2026.</li>
                    <li>Friedman, Milton. 1962. <em>Capitalism and Freedom</em>. Chicago: University of Chicago Press.</li>
                    <li>Grossman, Sanford J., and Oliver D. Hart. 1986. &ldquo;The Costs and Benefits of Ownership: A Theory of Vertical and Lateral Integration.&rdquo; <em>Journal of Political Economy</em> 94 (4): 691&ndash;719. https://doi.org/10.1086/261404.</li>
                    <li>Hansmann, Henry. 1996. <em>The Ownership of Enterprise</em>. Cambridge, MA: Belknap Press of Harvard University Press.</li>
                    <li>Hayek, F. A. 1945. &ldquo;The Use of Knowledge in Society.&rdquo; <em>American Economic Review</em> 35 (4): 519&ndash;530.</li>
                    <li>ILO (International Labour Organization). 2006. <em>Employment Relationship Recommendation, 2006 (No. 198)</em>. Adopted at the 95th Session of the International Labour Conference, Geneva, 2006.</li>
                    <li>Marx, Karl. (1867) 1976. <em>Capital: A Critique of Political Economy</em>. Vol. 1. Translated by Ben Fowkes. London: Penguin. Originally published as <em>Das Kapital: Kritik der politischen Oekonomie</em>, vol. 1 (Hamburg: Verlag von Otto Meissner, 1867).</li>
                    <li>Srnicek, Nick. 2017. <em>Platform Capitalism</em>. Cambridge: Polity.</li>
                    <li>Vanek, Jaroslav. 1970. <em>The General Theory of Labor-Managed Market Economies</em>. Ithaca, NY: Cornell University Press.</li>
                    <li>Ward, Benjamin. 1958. &ldquo;The Firm in Illyria: Market Syndicalism.&rdquo; <em>American Economic Review</em> 48 (4): 566&ndash;589.</li>
                    <li>Whyte, William Foote, and Kathleen King Whyte. 1991. <em>Making Mondragon: The Growth and Dynamics of the Worker Cooperative Complex</em>. 2nd ed. Ithaca, NY: ILR Press.</li>
                    <li>Williamson, Oliver E. 1985. <em>The Economic Institutions of Capitalism</em>. New York: Free Press.</li>
                    <li>Wright, Erik Olin. 2010. <em>Envisioning Real Utopias</em>. London: Verso.</li>
                </>
            }
        >
            <PaperSection title="1. Introduction">
                <p>
                    Consider a machinist who sells a day&rsquo;s work to a workshop for a wage. The contract fixes the wage and the hours and leaves the rest open: within those hours the workshop&rsquo;s owner decides what the machinist makes, how, and in what order. Labor law calls that open remainder control, and work performed under the instructions and control of another party is its first indicator of employment (ILO 2006). Now let the same machinist sell the same part to a buyer as one order of a bonded commitment, for a payment <Math>{"P"}</Math> fixed in an agreement both have signed. The part is specified, the payment is fixed, and nothing is left open for either party to direct once both have signed.
                </p>
                <p>
                    The cooperative-Marxian and the classical-liberal traditions read the first contract in opposite ways, and agree that it is the hinge between them. This paper asks what each makes of the second. Each, we argue, can describe it accurately in its own terms. The first sees producers holding their own means of production and coordinating without capital mediation; the second sees voluntary exchange between owners, stripped of the rents and frictions that have attended it. That one artifact admits both readings, neither needing metaphorical license, is the puzzle we address.
                </p>
                <PaperRun title="The thesis.">
                    The partition between the two traditions is organized around two variables. Subordination is the transfer of residual control over a worker&rsquo;s conduct to an employer; coordination rent is the recurring extraction taken by an intermediary the parties cannot transact without. The bonded commitment sets both to zero in the substrate, the layer every exchange runs on. The partition does not survive there in its familiar form, because the traditions had been arguing about one thing in opposed vocabularies, and that thing was held in place by the limits of the prior architecture. What remains of the disagreement moves to the graph: the designs, composed above the substrate, that say what is traded, among whom, and on what terms.
                </PaperRun>
                <PaperRun title="Scope.">
                    We take the mechanism as given and take no position on which tradition is right about distribution, public goods, or externalities. Those disagreements are real, and they survive the change of substrate. Our claim is narrower: the part of the partition that concerned the architecture of production was conditional on subordination and coordination rent being unavoidable.
                </PaperRun>
            </PaperSection>

            <PaperSection title="2. The Subordination Variable as Hinge of the Partition">
                <p>
                    The two traditions agree that subordination is central, disagree about what it means, and place their partition at that disagreement. Both take its structural necessity as given and build their prescriptions on top of that shared premise.
                </p>
                <PaperRun title="The Marxian reading.">
                    Marx ([1867] 1976) reads the wage relation as the moment at which a worker&rsquo;s capacity to labor is alienated to an owner of the means of production. The contractual form is voluntary. Its content is the surrender of control over the worker&rsquo;s productive activity to a party whose interests in that activity are not the worker&rsquo;s. Surplus value is the difference between what the labor produces and what the wage compensates, and the firm is the container in which the surplus is realized. The worker cannot keep the full product because means and producer sit in different hands. The normative conclusion follows: reunite them, in &ldquo;an association of free men, working with the means of production held in common&rdquo; (Marx [1867] 1976, ch. 1, §4). We use Cohen&rsquo;s (1978) analytical reconstruction for the shape of the claim, without taking a position on the wider historical-materialist program.
                </PaperRun>
                <PaperRun title="The classical-liberal reading.">
                    The classical-liberal tradition reads the wage relation as voluntary exchange between owners of distinct factors: the worker owns labor, the firm owns capital, and the wage is the price at which they combine. Coase (1937) gave the canonical formulation: firms exist because discovering prices, negotiating terms, and enforcing contracts in open markets costs more than internal hierarchy. Williamson (1985) traced the cost to asset specificity and incomplete contracts. Grossman and Hart (1986) made the transferred variable exact: ownership is the holding of residual control rights, the right to decide every use of an asset that the contract leaves unspecified. Employment is the case in which the asset is the worker&rsquo;s own conduct during the hours sold. Nothing below turns on which refinement one adopts; what the argument uses is the premise all of them keep, that hierarchy is the efficient response to the cost of coordination.
                </PaperRun>
                <PaperRun title="The shared premise.">
                    The traditions disagree about how to interpret subordination, as exploitation or as efficiency, and agree that some form of it is required for production at scale. Marx does not claim that production can occur without coordination; he claims the existing form of coordination expropriates the producer. Coase does not claim coordination is free; he claims hierarchy is the efficient response to its cost. Both therefore presuppose a binary: the firm, which internalizes coordination at the cost of subordination, or the spot market, which avoids subordination at the cost of coordination breakdown. The cooperative program is hard because it needs an architecture the binary denies. The classical-liberal equanimity about the wage relation holds because no such architecture has existed. Neither tradition could treat subordination as a variable that might be set to zero, because no available architecture had it at zero.
                </PaperRun>
                <PaperRun title="The coordination-rent variable.">
                    A second variable runs beside subordination and reinforces the binary. Parties who share no common authority and must still transact have historically used an intermediary: a third party that holds what they exchange, vouches for performance, or arbitrates disputes, and takes a recurring rent for the function. Srnicek (2017) traces its contemporary form, platform capitalism; the form predates platforms by centuries, in merchant houses, factors, and clearinghouses. The cooperative-Marxian tradition reads the rent as expropriation and the classical-liberal tradition as the price of a genuine service. The shared premise is again that the rent corresponds to a function someone must perform.
                </PaperRun>
            </PaperSection>

            <PaperSection title="3. The Bonded Commitment">
                <p>
                    An order is one commitment between a buyer and a seller, signed by both, inside a process. A process is the set of orders one buyer opens and resolves together: each seller adds value in turn, and a process carries as many orders as the network can resolve in one call. The Core is the set of smart contracts (programs that run on a public blockchain, whose code and state anyone can read) that hold every bond and resolve every process. It is decentralized and permissionless: any wallet that can sign and fund its bond may commit, and the only charge is the chain&rsquo;s gas, what the chain charges to execute a transaction. The Core holds the bonds, a running total of the value the process has accumulated, and a fingerprint of each order&rsquo;s signed terms (their merkle root). It never holds the terms themselves and never tests performance.
                </p>
                <PaperRun title="Asymmetric bonding.">
                    Write <Math>{"P"}</Math> for an order&rsquo;s payment and <Math>{"G"}</Math> for the cumulative value through it: every payment the process has accumulated so far, this order&rsquo;s own included. At commit the buyer bonds <Math>{"2P"}</Math> and the seller bonds <Math>{"2G"}</Math>, the same schedule at every order. The doubling answers retention. Value passes off-chain, so a party that walks away keeps what is in its hands, and a bond equal to that value would be exactly canceled by the taking. With the doubling, a defector is out of pocket after it is credited with everything it keeps. No party can move a bond once it is posted; the buyer&rsquo;s resolution refunds every one, on the schedule fixed at commit.
                </PaperRun>
                <PaperRun title="Buyer dominance with atomic resolution.">
                    Only the buyer can resolve, and resolution is atomic: every order in the process resolves in one call, or none does. At resolution each seller is paid <Math>{"P"}</Math> and refunded its <Math>{"2G"}</Math>, and the buyer is refunded <Math>{"2P"}</Math> less the payment, at every order. Nobody is paid until the buyer resolves, so each seller holds a bonded interest in every other seller&rsquo;s performance. That interest is a weakest-link game among the sellers: the outcome every seller receives depends on the least any one of them performs. Bonding is what carries the result to many orders; buyer dominance coordinates the orders bonding has already secured.
                </PaperRun>
                <PaperRun title="A worked process.">
                    Let a buyer <Math>{"B"}</Math> open a process with two sellers. <Math>{"S_1"}</Math> supplies a part for <Math>{"P_1 = 3"}</Math>, so <Math>{"G_1 = 3"}</Math>. <Math>{"S_2"}</Math> finishes it for <Math>{"P_2 = 5"}</Math>, so <Math>{"G_2 = 3 + 5 = 8"}</Math>. At commit <Math>{"B"}</Math> bonds <Math>{"6 + 10 = 16"}</Math>, <Math>{"S_1"}</Math> bonds <Math>{"6"}</Math>, and <Math>{"S_2"}</Math> bonds <Math>{"16"}</Math>. At resolution <Math>{"S_1"}</Math> receives <Math>{"6 + 3 = 9"}</Math>, <Math>{"S_2"}</Math> receives <Math>{"16 + 5 = 21"}</Math>, and <Math>{"B"}</Math> receives <Math>{"16 - 8 = 8"}</Math>; the <Math>{"38"}</Math> bonded leaves as <Math>{"9 + 21 + 8"}</Math>. Each seller ends its payment ahead, and the buyer ends with the finished part at the <Math>{"8"}</Math> it paid. Suppose instead <Math>{"S_2"}</Math> holds out and keeps everything it holds, worth at most <Math>{"G_2 = 8"}</Math>. Its bond of <Math>{"16"}</Math> stays locked while the process stays open, so its position is at best <Math>{"-16 + 8 = -8"}</Math>, against <Math>{"+5"}</Math> for performing. The comparison takes as given that <Math>{"S_1"}</Math> performs and that the buyer plans to resolve once performance has occurred.
                </PaperRun>
                <PaperRun title="The equilibrium.">
                    The two calls compose into one equilibrium with three comparisons, positions counted with the delivery at the payment the parties signed. (a) Once performance has occurred, the buyer strictly prefers resolving, <Math>{"0"}</Math>, to never resolving, <Math>{"-P"}</Math>, because the withheld payment sits inside its own bond; this comparison needs no assumption about the seller. (b) Given (a) and the buyer&rsquo;s plan, to resolve once performance has occurred and not before, the seller strictly prefers performing, <Math>{"+P"}</Math>, to never performing, at most <Math>{"-G"}</Math>. (c) Given (b), before performance the buyer keeps the process open rather than resolving at once, which would be terminal at <Math>{"-P"}</Math>. Comparisons (b) and (c) are the two parties&rsquo; best-response checks against one profile, verified together: a fixed point, which is what an equilibrium is, with (a) its one unconditional anchor. Among several sellers, performing is each seller&rsquo;s strict best response given that the other sellers perform; where another has held out, holding out is no worse. Cooperation is therefore an equilibrium of the sellers&rsquo; game, not a dominant strategy, and what the structure fixes is that nobody directs the sellers into it. The equilibrium is proved, for any number of orders the network resolves in one call, in Figaro (2026).
                </PaperRun>
                <PaperRun title="Remedy before resolution.">
                    A disagreement about performance is put right while the process stands open: the parties negotiate a cure or a remedy transfer, and the buyer resolves once satisfied. An outside forum may rule on the data the process leaves and on what the parties bring it. It cannot resolve in the buyer&rsquo;s place, so it holds no direct enforcement over the Core. Resolution is the buyer&rsquo;s acceptance and is terminal. The chain accepts one judgment after commit, the buyer&rsquo;s decision to resolve; everything else it does is arithmetic.
                </PaperRun>
                <PaperRun title="Above the Core: clauses, agreements, assemblies.">
                    The terms of an order are composed, not written fresh. A clause is one reusable term, registered publicly for anyone to compose; it defines a relationship between a buyer and a seller or between two sellers. An agreement is the clauses composed for one order: registered as a design, then filled at checkout (the step in which the buyer enters the real parties and amounts) and signed by both parties, its merkle root being what the commitment carries. An assembly is a list of agreements composed into one reusable design of a process, and a process instantiates it. A designer is the wallet that writes and registers a clause, an agreement, or an assembly. The buyer selects an assembly, and sellers bind it by naming it in their profiles as a standing offer. We call the designs so composed the graph.
                </PaperRun>
                <PaperRun title="Buyer dominance is not subordination.">
                    The resolution rule invites the objection this paper cannot leave standing: if one party alone decides when everyone is paid, has hierarchy not re-entered? It has not, and the reason is what the buyer holds. The buyer decides whether and when the process resolves; atomicity is the mechanism&rsquo;s, and the buyer cannot resolve one order without the others. What labor law examines is control over conduct (ILO 2006), and what the labor-process tradition identifies as the substance of subordination is command over how the work is done (Braverman 1974; Burawoy 1979). The buyer holds neither. Its acceptance is also disciplined: once a seller has performed, withholding resolution costs the buyer <Math>{"P"}</Math> against resolving, by comparison (a).
                </PaperRun>
                <p>
                    A referee may press further: is a signed specification of how the work is done not direction by another name? The distinction Grossman and Hart (1986) drew answers it. A contract may specify method, and the seller assented to every term it performs to before it signed. Subordination is the residual right, held by another party, to direct what the contract leaves open. After both parties sign, the Core admits commit, resolve, and each party&rsquo;s own attestations; it admits no instruction of any kind, so no residual right of direction exists for anyone to hold. Coordination among the sellers comes from their bonded positions instead: each seller&rsquo;s payment waits on every other order, so each holds an interest in the others&rsquo; performance that no manager supplies and no instruction conveys.
                </p>
                <PaperRun title="The wallet.">
                    A wallet is a signing key and the balance it controls, and it is the only identity the Core knows. In a process, the wallet that signs an order is the one that bonds, the one whose performance the order concerns, and the one paid at resolution. It may represent a person, a machine, a cooperative, or an agent, and it acts for itself. No other wallet holds a claim over its conduct, and none stands between it and its payment.
                </PaperRun>
                <PaperRun title="Effect on subordination.">
                    Subordination has been required for production at scale because prior architectures could not enforce agreements between parties who are not subordinate to one another at low enough cost. The bonded commitment enforces such agreements at the time value of the bonds, with no recurring extraction. Residual control over a wallet&rsquo;s conduct stays with the wallet, and there is no party to whom it is transferred. Is a seller that sells all its output to one buyer a dependent worker by another route? The ILO&rsquo;s indicators count that dependence beside control: work done solely or mainly for another&rsquo;s benefit, and pay that is the worker&rsquo;s principal income (ILO 2006, para. 13). Here the dependence is a fact of the market the seller sells in, and the control stays with the seller&rsquo;s wallet: no party directs its conduct, and the seller may bind other assemblies and sell to other buyers.
                </PaperRun>
                <p>
                    The wage relation will persist wherever a party prefers employment; the substrate permits it and does not require it. A wage relation entered by preference differs from one entered because a party cannot post its bond. The second is the access condition Section 4.3 concedes, and the claim here concerns the first: the wage relation likely ceases to be a precondition of coordinated production at scale.
                </p>
                <PaperRun title="Effect on coordination rent.">
                    Coordination rent is recurring extraction by an intermediary for performing a coordination function the parties cannot perform themselves. The Core performs that function, the bonding and the atomic resolution, as a set of decentralized, permissionless smart contracts that charge nothing beyond the chain&rsquo;s gas. Is gas, then, a coordination rent? Gas is a charge for computation, set per operation and independent of the trade&rsquo;s value: its base part is burned, and the rest goes to whichever validator includes the transaction. Validating is open to any party that locks the chain&rsquo;s validator stake, so the parties depend on no one intermediary. Every bond is refunded at resolution, and the only value that changes hands is the payment the parties bargained for. Intermediaries can still exist: a seller may charge for coordinating a process, or an aggregator for discovery. The substrate neither requires nor privileges them, so intermediation becomes a service in the graph rather than a tax on the substrate.
                </PaperRun>
            </PaperSection>

            <PaperSection title="4. Two Readings of One Artifact">
                <PaperSubsection title="4.1 The Free-Association Reading">
                    <p>
                        A reader in the cooperative-Marxian tradition can describe the bonded commitment as follows. Each wallet that bonds to perform represents means of production held by the party it represents, under a key that party alone controls rather than an identity an employer grants. Production proceeds through commitments between such wallets, each secured by a bond its party posts. No party extracts surplus from another&rsquo;s labor: every bond is refunded at resolution, and the payment for the work goes to the wallet that did it. In Marx&rsquo;s vocabulary this is an association of free producers working with means of production they hold, coordinating without capital mediation. They need not nationalize the means of production, because the means are already distributed at the wallet. They need no planning bureau, because the bonded commitment performs the coordination.
                    </p>
                    <PaperRun title="Engagement with the producer-cooperative literature.">
                        The reading invites the obvious question: if the conditions for free association are available, why have producer cooperatives not prevailed even where the law admits them? Hansmann (1996) gives the strongest answer. Worker-owned firms are rare because collective decision among workers with heterogeneous interests is costly, while investors are a comparatively homogeneous class of patrons. The unit that bonds and resolves here is the process, not a standing firm, and nothing requires the same parties to reconvene under continuing governance once a process resolves. Where the heterogeneity cost is the cost of standing collective decision, an architecture with no standing collective changes what the objection must be an objection to.
                    </PaperRun>
                    <p>
                        Bowles and Gintis (1996) identify a constraint the change leaves untouched: the share of democratic firms and the distribution of wealth determine each other. The Mondragon literature (Whyte and Whyte 1991; Cheney 1999) gives the best-developed standing case, whose durability has rested on internal financing through its own cooperative bank. Vanek (1970) and Ward (1958) supply the formal theory of the labor-managed firm. On this account the cooperative program would move from the cooperative as a standing entity to the cooperative as a pattern of processes. The wealth constraint moves with it, and Section 4.3 concedes it.
                    </p>
                </PaperSubsection>
                <PaperSubsection title="4.2 The Frictionless-Market Reading">
                    <p>
                        A reader in the classical-liberal tradition can describe the same artifact as follows. Voluntary exchange between owners is the foundational institution of welfare-improving production, and two frictions have impeded it: enforcement, since parties who do not trust each other cannot transact, and intermediation, since parties who need an intermediary to enforce pay rent for it. Courts, payment networks, and platforms have each reduced the first friction by adding to the second. The bonded commitment supplies enforcement directly, from the bond schedule of the commitment, and no third party holds what the parties exchange or vouches for either side. The rent intermediation extracted loses the function it attached to. What remains is the exchange Hayek (1945) defended, coordinating knowledge dispersed among the parties who hold it, and the voluntary cooperation Friedman (1962) set against coercive coordination, with its historical impediments made unnecessary rather than merely reduced.
                    </p>
                </PaperSubsection>
                <PaperSubsection title="4.3 Why Both Readings Hold, and Where They Stop">
                    <p>
                        That both readings hold is not a synthesis, and it does not mean the traditions secretly agreed. It means the artifact has features that satisfy both descriptions at once, because each picks out what the absence of subordination and the absence of coordination rent jointly produce. The joint description is <em>voluntary exchange between holders of means of production, none of whom is the employer of another, and none of whom must pay an intermediary for the exchange to be enforced.</em> A cooperative-Marxian reader stresses the first half and a classical-liberal reader the second; both halves are true of the same artifact. Each reading describes the artifact accurately; neither is the protocol&rsquo;s commitment or our endorsement of either program, and each tradition carries claims on which the substrate takes no position.
                    </p>
                    <p>
                        The first objection is access, from Marx&rsquo;s analysis of primitive accumulation: the historical separation of producers from the means of production, and hence from the terms of market entry (Marx [1867] 1976, pt. VIII). Removing the wage relation does not remove that dependence; it reappears in whatever asymmetry remains in who can enter the substrate. This is a second thing, not the first. Subordination as Section 2 defined it, residual control over conduct held by another party, is what the substrate removes; what returns here is the condition on which a party enters at all. A wallet without the wealth to post its bond is not a free associated producer; it is excluded, on terms analogous to the exclusion of unpropertied workers from nineteenth-century petty-proprietor cooperation. The bonded commitment is symmetric in form and asymmetric in access, so where wealth is unequal, exchanges that look leveled at the moment of commit are not leveled in any economic sense. The objection is correct and we do not dispute it; it relocates the distributional question to the distribution of wealth, which the Core does not decide (Section 5).
                    </p>
                    <p>
                        The second objection is the property baseline. The substrate operates on property: a wallet holds its own key, each bond is refunded to the wallet that posted it, and each payment goes to the wallet that signed for it. That baseline is the Lockean one the cooperative-Marxian tradition contests. The substrate enforces a wallet&rsquo;s claim to the bond it posted and the payment it bargained for, and no claim of a worker to the surplus its labor produced. At the architectural layer it is more naturally compatible with the classical-liberal baseline than with one that treats property in means of production as a contingent institutional choice. The free-association reading therefore holds in a specific sense: once property is granted as the baseline, the substrate distributes the means of production at the wallet rather than aggregating them under capital. The baseline itself comes from the surrounding law, and a reader for whom it is the contested question will find the substrate insufficient on philosophical grounds, rightly.
                    </p>
                </PaperSubsection>
            </PaperSection>

            <PaperSection title="5. Where the Partition Relocates">
                <p>
                    The partition does not disappear with the change of substrate; it relocates to the graph. The traditions still disagree about distribution, public goods, externalities, inheritance, the scope of collective decision, and the moral status of inequality, as well as about the two objections just conceded. Three of those disagreements show where they now operate. The Core is ideologically agnostic, and the graph carries the politics.
                </p>
                <PaperRun title="Distribution.">
                    The Core fixes what resolution moves: each seller is paid its order&rsquo;s payment and refunded its bond, and the buyer is refunded its bond less the payments. It does not decide how wallets are first endowed, how a process&rsquo;s payments are divided among its sellers, or how returns to a position in the network are shared. A graph decides the second, because each order&rsquo;s payment is set by the design&rsquo;s rule and filled when the buyer fills the agreement. A graph that sets each payment by a contribution metric expresses one position; a graph that divides uniformly expresses another; a graph that composes a collective&rsquo;s treasury wallet as a seller in the process expresses a third. The substrate admits all three. Wright&rsquo;s (2010) real utopias find their designs here, and which of them is right is a disagreement in the graph that no appeal to the Core can decide.
                </PaperRun>
                <PaperRun title="Public goods and externalities.">
                    The substrate does not produce non-excludable goods, internalize externalities by default, or organize the collective action by which under-provision is addressed. A graph that composes an emissions attestation into its agreements and bonds carbon-removal orders expresses one approach; a graph that ignores externalities expresses another. The substrate admits both, and which is right is a question for the graph.
                </PaperRun>
                <PaperRun title="The composition of participation.">
                    The substrate is permissive about who participates: any wallet may take any role, whether it represents a worker, an owner, an artificial agent, a state agency, a cooperative, or a foundation. The designer composes the graph, the buyer selects it, and sellers bind it, and each of those choices carries a political economy. Whether an assembly should privilege workers, exclude predatory parties, admit artificial agents on equal terms, or compose a jurisdiction&rsquo;s rules into its agreements is decided there. The substrate admits answers across the spectrum.
                </PaperRun>
            </PaperSection>

            <PaperSection title="6. Conclusion">
                <p>
                    The partition between the cooperative-Marxian and classical-liberal traditions has been organized around subordination and coordination rent, and the bonded commitment removes both from the substrate of exchange. Within the two concessions, the wealth a party needs to post its bond and the property baseline the substrate inherits from law, one artifact admits the free-association reading and the frictionless-market reading, each accurately. What looked like a foundational partition was conditional on a configuration of the substrate in which subordination and rent were load-bearing. With that configuration gone, the disagreement becomes visible where it has always operated: in distribution, public goods, and the composition of participation, decided in the graph. That is a victory for neither side. It is a relocation.
                </p>
            </PaperSection>
        </PaperLayout>
    );
}
