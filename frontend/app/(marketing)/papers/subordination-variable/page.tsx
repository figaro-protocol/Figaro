import type { Metadata } from "next";
import Link from "next/link";
import {
    PaperLayout,
    PaperSection,
    PaperSubsection,
    PaperRun,
    PaperRemark,
} from "@/components/papers/PaperLayout";
import { Math } from "@/components/papers/Math";

export const metadata: Metadata = {
    title: "The Subordination Variable — Figaro Protocol",
    description:
        "The socialist and capitalist traditions both hinge on the wage/subordination relation. A bonded settlement primitive removes it from the substrate — so the same artifact admits both the associated-producer and the frictionless-market reading, and the partition relocates to the graph.",
};

export default function SubordinationVariablePaper() {
    return (
        <PaperLayout slug="subordination-variable"
            title="The Subordination Variable"
            subtitle="Why a Single Coordination Substrate Admits Both the Associated-Producer and the Frictionless-Market Reading"
            author="Figaro"
            date="April 2026"
            watermark="Figaro Protocol · Preprint"
            keywords="political economy, subordination, coordination rent, associated production, classical liberalism, frame collapse, conditionality of the left/right partition"
            abstract={
                <>
                    <p>
                        The political-economy traditions usually grouped under the labels &ldquo;socialist&rdquo; and &ldquo;capitalist&rdquo; do not agree on much, but they agree on what divides them. Both traditions identify the wage relation as the central institutional fact of the modern economy: one reads it as the locus of value extraction, the other as the engine of voluntary coordination at scale. In each reading, the load-bearing variable is the same &mdash; the transfer of residual control over a worker&rsquo;s conduct to an owner of the means of production, in exchange for a wage &mdash; and each tradition&rsquo;s normative conclusions follow from how that transfer is theorized.
                    </p>
                    <p>
                        This paper observes that the bonded settlement primitive removes the residual-control transfer from the set of variables that need to be specified at all. A wallet bonded to perform an obligation is simultaneously the means of production, the producer, and the contracting party. There is no employer to whom residual control is transferred; there is also no intermediary extracting coordination rent on the transfer&rsquo;s behalf. Subordination ceases to be a variable, and coordination rent ceases to be a recurring extraction.
                    </p>
                    <p>
                        The consequence is that the same artifact admits both readings. A reader trained in the cooperative tradition can describe the primitive as the architectural realization of associated production in Marx&rsquo;s sense (Marx, 1867, ch. 1, §4): producers hold the means of production, coordinate without capital mediation, and retain the value their labor creates. A reader trained in the classical-liberal tradition can describe the same primitive as voluntary exchange between owners stripped of the coordination rents and authority frictions that have historically attended it (Hayek, 1945; Friedman, 1962). Both descriptions are accurate; the category error is the assumption that one of them must be the right answer. The partition between the two traditions was conditional on the subordination variable being load-bearing in the first place. When the variable is removed, the partition does not vanish; it relocates: what was a substrate-level disagreement about the architecture of production becomes a graph-level disagreement about distribution, public goods, and the social composition of the assemblies the substrate admits. That relocation is the real political-economy content of the kernel&rsquo;s ideological agnosticism, and it is the subject of this paper.
                    </p>
                </>
            }
            references={
                <>
                    <li>Coase, R. H. The Nature of the Firm. <em>Economica</em>, 4(16):386&ndash;405, 1937.</li>
                    <li>Cohen, G. A. <em>Karl Marx&rsquo;s Theory of History: A Defence</em>. Princeton University Press, 1978.</li>
                    <li>Friedman, M. <em>Capitalism and Freedom</em>. University of Chicago Press, 1962.</li>
                    <li>Hart, O. <em>Firms, Contracts, and Financial Structure</em>. Oxford University Press, 1995.</li>
                    <li>Hayek, F. A. The Use of Knowledge in Society. <em>American Economic Review</em>, 35(4):519&ndash;530, 1945.</li>
                    <li>Marx, K. <em>Das Kapital, Band I</em>. Verlag von Otto Meissner, Hamburg, 1867. English: <em>Capital, Volume I</em>, trans. B. Fowkes, Penguin Classics, 1976.</li>
                    <li>North, D. C. <em>Institutions, Institutional Change and Economic Performance</em>. Cambridge University Press, 1990.</li>
                    <li>Srnicek, N. <em>Platform Capitalism</em>. Polity, Cambridge, 2017.</li>
                    <li>Williamson, O. E. <em>The Economic Institutions of Capitalism</em>. Free Press, New York, 1985.</li>
                    <li>Hansmann, H. <em>The Ownership of Enterprise</em>. Harvard University Press, Cambridge, MA, 1996.</li>
                    <li>Bowles, S. &amp; Gintis, H. The Distribution of Wealth and the Viability of the Democratic Firm. In U. Pagano &amp; R. Rowthorn (eds.), <em>Democracy and Efficiency in the Economic Enterprise</em>. Routledge, London, 1996.</li>
                    <li>Whyte, W. F. &amp; Whyte, K. K. <em>Making Mondragon: The Growth and Dynamics of the Worker Cooperative Complex</em>, 2nd ed. ILR Press, Ithaca, NY, 1991.</li>
                    <li>Cheney, G. <em>Values at Work: Employee Participation Meets Market Pressure at Mondragón</em>. Cornell University Press, Ithaca, NY, 1999.</li>
                    <li>Vanek, J. <em>The General Theory of Labor-Managed Market Economies</em>. Cornell University Press, Ithaca, NY, 1970.</li>
                    <li>Ward, B. The Firm in Illyria: Market Syndicalism. <em>American Economic Review</em>, 48(4):566&ndash;589, 1958.</li>
                    <li>Braverman, H. <em>Labor and Monopoly Capital: The Degradation of Work in the Twentieth Century</em>. Monthly Review Press, New York, 1974.</li>
                    <li>Burawoy, M. <em>Manufacturing Consent: Changes in the Labor Process Under Monopoly Capitalism</em>. University of Chicago Press, Chicago, 1979.</li>
                    <li>Wright, E. O. <em>Envisioning Real Utopias</em>. Verso, London, 2010.</li>
                </>
            }
        >
            <PaperSection title="1. Introduction">
                <p>
                    This paper sits between political philosophy and the institutional analysis of a particular primitive, and addresses a puzzle in how the bonded settlement primitive should be characterized.
                </p>
                <p>
                    When the primitive is described to a reader trained in the cooperative or socialist tradition, the natural reading is that each wallet bonded to perform an obligation <em>is</em> a means of production owned by the actor it represents; that production proceeds without a wage relation, since there is no party in the position of employer; that coordination occurs without capital mediation, since the bonded commitment itself does the enforcement work that a firm would otherwise do; and that the value the labor creates is retained by the labor, since there is no surplus-extraction layer to siphon it. The reading is recognizable: it is the architectural realization, at protocol scale, of what Marx (1867) called the association of free producers.
                </p>
                <p>
                    When the same primitive is described to a reader trained in the classical-liberal tradition, an equally natural reading is that the primitive is voluntary exchange between owners, stripped of the coordination rents and authority frictions that have historically attended it. There is no platform extracting a take rate. There is no firm imposing internal hierarchy. There is no sovereign gating cross-border settlement. What remains is bilateral agreement between consenting parties, secured by collateral that each party voluntarily posts, executed by a public algorithm with no admin and no fee. The reading is also recognizable: it is the architectural realization of what Hayek (1945) and Friedman (1962) described as voluntary exchange under decentralized price information, with the historical impediments to that exchange systematically removed.
                </p>
                <p>
                    The two readings are usually thought to be opposed. They are classified along an axis political philosophy has spent two centuries refining; they occupy distinct vocabularies, name distinct historical lineages, and recommend distinct institutional prescriptions. That a single artifact admits both readings, with neither requiring metaphorical license, is the puzzle this paper addresses.
                </p>
                <PaperRun title="The thesis.">
                    The thesis is not that the primitive is Marxist, capitalist, or some synthesis or third way. The thesis is structural: the partition between the two traditions has historically been organized around two variables &mdash; the subordination relation between worker and employer, and the coordination rent extracted by intermediaries the parties cannot transact without. The primitive removes both of these variables from the substrate of exchange. The partition does not survive the removal in its familiar form, because the two traditions had been arguing about the same thing using opposed vocabularies, and the thing they had been arguing about was no longer where they had located it.
                </PaperRun>
                <PaperRun title="What this paper is and is not.">
                    This paper is a short essay in the conceptual conditions of political economy. It takes the underlying mechanism as given and asks what its joint implication is for the partition that has organized political-economic disagreement since at least the mid-nineteenth century. It takes no position on which tradition has it right about distribution, public goods, externalities, or the social composition of the assemblies the substrate admits. Those disagreements are real, and they survive the substrate change. The paper&rsquo;s claim is narrower: the part of the partition that appeared to be about the architecture of production was conditional on the architecture being one in which subordination and coordination rent were unavoidable. When they become avoidable, the disagreement does not disappear &mdash; it moves up the stack. Most of what political economy has been arguing about, on this reading, was a graph-level question conducted in substrate-level vocabulary because the substrate was not yet disaggregable.
                </PaperRun>
            </PaperSection>

            <PaperSection title="2. The Subordination Variable as Hinge of the Partition">
                <p>
                    Two traditions usually treated as opposed &mdash; the cooperative-Marxian and the classical-liberal &mdash; agree on the centrality of subordination, disagree about its meaning, and locate the partition between them at this disagreement. Both take subordination&rsquo;s structural necessity as given, and locate their prescriptive divergence on top of that shared premise.
                </p>
                <PaperRun title="The Marxian reading of subordination.">
                    Marx (1867) reads the wage relation as the moment at which a worker&rsquo;s labor capacity is alienated to an owner of the means of production. The contractual form is voluntary; the substantive content is the surrender of residual control over the worker&rsquo;s productive activity to a party whose interests in that activity are not the worker&rsquo;s. Surplus value is the difference between what the labor produces and what the wage compensates; the firm is the institutional container in which the surplus is realized. The worker cannot retain the full product of their labor because the means of production is not theirs &mdash; because the architectural condition of production places means and producer in different hands. Marx&rsquo;s normative conclusion follows: reunite the producer with the means of production, the &ldquo;association of free producers&rdquo; working with means held in common (Marx, 1867, ch. 1, §4). We use Cohen&rsquo;s (1978) analytical reconstruction for the structural shape of the claim, without taking a position on the broader historical-materialist program.
                </PaperRun>
                <PaperRun title="The classical-liberal reading of subordination.">
                    The classical-liberal tradition reads the wage relation as voluntary exchange between owners of distinct factors of production: the worker owns labor, the firm owns capital, and the wage is the price at which the two are combined. The transfer of residual control to the employer is not an alienation but an efficient response to the fact that productive activity must be coordinated and that coordination is costly. Coase (1937) gave the canonical formulation: firms exist because the cost of discovering prices, negotiating terms, and enforcing contracts in open markets exceeds the cost of internal hierarchy. Williamson (1985) and Hart (1995) refined the analysis; North (1990) generalized the move to institutions broadly construed. Across these refinements the central premise is retained: hierarchy and intermediation are efficient responses to coordination cost, and the wage relation is welfare-improving relative to doing all coordination through spot contracting.
                </PaperRun>
                <PaperRun title="The shared premise.">
                    The two traditions disagree about how to interpret subordination &mdash; exploitation in the first reading, efficiency in the second &mdash; but agree on the structural fact that some form of it is required for production to occur at scale under existing arrangements. Marx does not claim production can occur without coordination; he claims the existing form of coordination expropriates the producer. Coase, Williamson, and Hart do not claim coordination is costless; they claim hierarchy is the efficient response to its costliness. The shared terrain has a structural feature both take as given: the only available coordination architectures for production at scale are (a) the firm, which internalizes coordination at the cost of subordination, or (b) the spot market, which avoids subordination at the cost of coordination breakdown. Both readings presuppose this binary. The cooperative-Marxian program (reunite producer with means) is hard precisely because it requires inventing a coordination architecture the binary denies; the classical-liberal equanimity about the wage relation is sustained precisely because no such architecture has been available.
                </PaperRun>
                <PaperRun title="The coordination-rent variable.">
                    A second variable runs alongside subordination and reinforces the binary. When parties who have not subordinated themselves to a common authority must nonetheless transact, the historical solution has been intermediation: a third party that holds custody, vouches for performance, or arbitrates dispute, and extracts a recurring rent for the function. Srnicek (2017) traces the contemporary form (platform capitalism); the form predates platforms by centuries in merchant houses, factor agents, clearinghouses, and the transactional infrastructure of modern finance. Here too the cooperative-Marxian tradition reads the rent as expropriation and the classical-liberal tradition reads it as price for genuine service; the shared premise is that the rent corresponds to a function someone must perform.
                </PaperRun>
                <PaperRemark title="On reading subordination as a variable.">
                    Treating subordination and coordination rent as &ldquo;variables&rdquo; that can in principle be set to zero is a move neither tradition has historically been able to make, because neither has had access to a coordination architecture in which they are not load-bearing. The move becomes available once the architecture changes. The argument is not that prior analyses were wrong on their own terms; it is that their terms held one variable fixed that is no longer fixed.
                </PaperRemark>
            </PaperSection>

            <PaperSection title="3. What the Primitive Does to Both Variables">
                <p>
                    We turn from the partition&rsquo;s structure to what the bonded settlement primitive does to the two variables on which the partition depends, summarizing only what is necessary for the present argument.
                </p>
                <PaperRun title="Asymmetric bonding.">
                    The first mechanism requires the buyer to lock <Math>{"2P"}</Math> in custody (twice the contract price) and the seller to lock <Math>{"2G"}</Math> in custody (twice the cumulative seller value being contributed). Total custody during execution is <Math>{"2P + 2G"}</Math>. The bonding ratios make cooperation the unique strategy profile surviving iterated elimination of weakly dominated strategies for both parties at every depth of a multi-party process &mdash; the bonding-equilibrium result, derived in <Link href="/papers/asymmetric-bonding" className="text-ink-heading hover:underline">Asymmetric Bonding and Buyer Dominance</Link> (&sect;4.1 and &sect;5.1). Coordination between the parties is induced by the bond structure itself; no authority is required to enforce it. The bonding-equilibrium result holds under perfect monitoring with costless performance; what the bonds price is settlement discipline, not the adjudication of disputed performance, which remains with the forums composed above the kernel.
                </PaperRun>
                <PaperRun title="Buyer dominance with atomic resolution.">
                    The second mechanism restricts resolution authority to the root buyer and requires that all orders in a process settle together or not at all. This induces a weakest-link subgame among co-sellers (the weakest-link result) that propagates cooperation pressure through the multi-party process without explicit inter-seller communication. Together the two mechanisms produce the result that an N-party set of bilateral commitments is equilibrium-secured from a single buyer signature, with no intermediary in the position of arbitrator, custodian, or adjudicator other than the kernel itself &mdash; which holds no discretion and extracts no rent.
                </PaperRun>
                <PaperRun title="Buyer dominance is not subordination.">
                    The mechanism just described invites the objection this paper cannot leave standing: if the root buyer holds an authority no seller holds, has hierarchy not simply re-entered through the settlement layer? It has not, and the reason is what the authority consists in. Buyer dominance is a resolution right &mdash; authority over settlement timing and atomicity &mdash; not directive authority. No party on the substrate directs the manner, means, or sequence of any seller&rsquo;s work; and control over conduct is precisely what the subordination tests of labor law examine, and precisely what the labor-process tradition (Braverman, 1974; Burawoy, 1979) identifies as the substance of subordination &mdash; command over how the work is done, not over when the exchange settles.
                </PaperRun>
                <p>
                    What buyer dominance does instead is oblige &mdash; albeit weakly &mdash; all the sellers in a process to coordinate without management, without anyone telling them what to do. The weakest-link subgame propagates cooperation pressure through the process with no director in the loop: each seller&rsquo;s settlement depends on every other obligation being performed, so each seller&rsquo;s interest in the others&rsquo; performance is enforced by the bond structure rather than by an authority who monitors, instructs, or sequences. Coordination pressure without a director is the answer to the residual-hierarchy objection, not a concession to it: the coordination function that hierarchy has historically performed is performed here by settlement structure alone, and no residual control over anyone&rsquo;s conduct changes hands.
                </p>
                <PaperRun title="Wallet collapse.">
                    Each wallet participating in a process is simultaneously the means of production, the producer, and the contracting party. The worker&rsquo;s productive capacity is no longer a thing rented to someone else but a thing that acts in its own legal name.
                </PaperRun>
                <PaperRun title="Effect on subordination.">
                    Subordination, as both traditions have used the term, is the transfer of residual control over a worker&rsquo;s conduct to an employer in exchange for a wage. The transfer is not strictly required by production at scale; it has been required because prior coordination architectures could not enforce bilateral agreements between non-subordinated parties at low enough cost. The bonded primitive enforces such agreements at fixed lockup cost, with no recurring extraction. Residual control over a wallet&rsquo;s conduct stays with the wallet&rsquo;s holder; there is no party to whom control is transferred. Production proceeds; the wage relation does not. This is not an empirical claim that the wage relation will disappear &mdash; it will persist wherever an actor prefers to operate as an employee; the substrate is permissive, not prescriptive. The claim is structural: the wage relation ceases to be a precondition of coordinated production at scale.
                </PaperRun>
                <PaperRun title="Effect on coordination rent.">
                    Coordination rent is recurring extraction by an intermediary in exchange for performing a coordination function the parties cannot perform themselves. The primitive performs the function &mdash; custody, enforcement, atomic resolution &mdash; as a public algorithm with no fee, no admin, and no privileged caller. The bond posted by the parties is fully reclaimable on cooperation; nothing is extracted as rent. Intermediaries can still exist on the substrate (a seller may charge a service fee for coordinating a process, an aggregator may charge for discovery), but the substrate does not require them and does not privilege them. Intermediation becomes a service on the graph, not a tax on the substrate.
                </PaperRun>
            </PaperSection>

            <PaperSection title="4. Two Readings of One Artifact">
                <p>We now state the readings this paper claims are jointly correct.</p>
                <PaperSubsection title="4.1 The Associated-Producer Reading">
                    <p>
                        A reader in the cooperative-Marxian tradition can describe the primitive as follows. Each wallet bonded to perform an obligation is a means of production owned by the actor it represents &mdash; not a token of identity granted by an employer, but a token of self-ownership cryptographically established and unilaterally controlled. The wallet acts on its own behalf; it is not subordinated to any other party. Production proceeds through bilateral commitments between such wallets, secured by collateral each posts voluntarily. No party extracts surplus from another&rsquo;s labor; the bond is reclaimable on cooperation, and the value the labor creates flows directly to the labor&rsquo;s wallet at resolution.
                    </p>
                    <p>
                        The architectural realization of this is, in Marx&rsquo;s own vocabulary, the association of free producers working with means of production they hold and coordinating their labor without capital mediation. The associated producers do not need to nationalize the means of production, because the means are already distributed at the wallet boundary. They do not need to abolish the wage relation, because it has no substrate to reproduce on. They do not need to coordinate through a planning bureau, because the coordination function is performed by the bonded commitment itself. The reading follows from the protocol&rsquo;s own behavior, not from interpretive license.
                    </p>
                    <PaperRun title="Engagement with the producer-cooperative literature.">
                        The reading invites the obvious question of why, if the architectural conditions for free-producer association are now available, producer cooperatives have not historically dominated even where the legal architecture admits them. Hansmann (1996) argues that worker-owned firms are rare not because they are illegal but because the costs of collective decision among workers with heterogeneous interests typically exceed the benefits; investor-owned firms dominate because investors are a relatively homogeneous patron class. The objection has limited traction here, because the relevant unit on the bonded substrate is not the standing worker cooperative but the transaction-scoped assembly: its lifespan is bounded by a single process, and the standing collective decision Hansmann identifies as the cost driver does not arise. Bowles &amp; Gintis (1996) argue that worker control is associated with higher effort and lower monitoring cost where tried, but is undercapitalized because investor markets prefer predictable governance &mdash; precisely the asymmetric-access concern developed in Section 4.3. The Mondragon literature (Whyte &amp; Whyte, 1991; Cheney, 1999) provides the most-developed standing case: its durability has rested on internal financing through a member-owned bank, addressing the capitalization constraint internally. Vanek (1970) and Ward (1958) provide the formal theory of the labor-managed firm. The honest summary: the producer-cooperative literature has both identified the structural opportunity and characterized its principal constraints; the bonded primitive supplies an architectural shape under which the constraint (asymmetric access to capital, heterogeneity costs of standing collective decision) is no longer binding for transaction-scoped collaboration, while remaining binding for standing arrangements. The relocation is from <em>cooperative as standing entity</em> to <em>cooperative as process pattern</em>.
                    </PaperRun>
                </PaperSubsection>
                <PaperSubsection title="4.2 The Frictionless-Market Reading">
                    <p>
                        A reader in the classical-liberal tradition encountering the same primitive can describe it as follows. Voluntary exchange between owners is the foundational institution of welfare-improving production. Historically it has been impeded by two friction sources: enforcement (parties who do not trust each other cannot transact) and intermediation (parties who must use intermediaries to enforce pay rent for the privilege). Courts, contract law, payment rails, and platforms have all been attempts to reduce the first friction at the cost of introducing or compounding the second.
                    </p>
                    <p>
                        The bonded primitive removes both frictions in a single move. The enforcement function is performed by the bond structure of the commitment, requiring no third party. The intermediation function is therefore unnecessary, eliminating the rent it extracts. Voluntary exchange between owners proceeds at substantially lower friction than has been historically available &mdash; the architectural realization of what Hayek (1945) and Friedman (1962) described as the welfare case for voluntary exchange, with the impediments that have historically prevented it from operating cleanly systematically removed. This reading too follows from the protocol&rsquo;s own behavior.
                    </p>
                </PaperSubsection>
                <PaperSubsection title="4.3 Why Both Readings Are Correct, Already Qualified">
                    <p>
                        That both readings are correct is not a synthesis. It does not mean the two traditions secretly agreed all along. It means the artifact has features that satisfy both descriptions simultaneously, because the features each picks out are the features that absence-of-subordination and absence-of-coordination-rent jointly produce. The joint description has the shape: <em>voluntary exchange between owners of means of production, none of whom occupies the position of employer of another, and none of whom is required to pay an intermediary for the exchange to be enforced.</em> A cooperative-Marxian reader emphasizes the first half; a classical-liberal reader the second; both halves are true of the same artifact at the same time. Both readings are descriptions of how each tradition can accurately characterize the primitive, not the protocol&rsquo;s own commitment or the author&rsquo;s endorsement of either program in full &mdash; each tradition carries claims (on distribution, the state, and historical materialism for one; on the minimal state and property as foundational for the other) on which the substrate takes no position.
                    </p>
                    <p>
                        The joint claim is qualified by two objections we take seriously rather than defer. First, the capital-access objection, from the Marxian analysis of primitive accumulation &mdash; the historical separation of producers from the means of production and hence from the terms of market entry (Marx, 1867, pt. VIII): subordination, on this reading, is not eliminated by removing the wage relation; it is reproduced in whatever asymmetry remains in the access conditions to the substrate that displaces wage relations. A wallet that cannot post bond is not a free associated producer; it is excluded from the bonded-substrate economy on terms structurally analogous to the way unpropertied workers were excluded from nineteenth-century petit-bourgeois cooperation. The bonded primitive is symmetric in form and asymmetric in the access condition that makes use of the form possible; where capital is distributed unequally, the substrate&rsquo;s symmetric form will support a labor market that looks levelled at the moment of transaction and is not, in any economic sense, levelled at all. The objection is correct on its own terms and we decline to dispute it. Our narrower position: the bonded substrate eliminates the architectural privilege of subordination <em>as a structural feature of the substrate</em>, and relocates the distributional question to capital access, which Section 5 develops.
                    </p>
                    <p>
                        Second, the property-as-default objection, from the same side: the substrate enforces <em>property</em> as its operating principle &mdash; the wallet owns its private key, the bond is reclaimable by the wallet that posted it, and value flows on resolution to the wallet that signed for it. Property-as-default is not neutral between the two traditions; it is the Lockean baseline the cooperative-Marxian tradition contests. The substrate does not enforce a worker&rsquo;s claim to the surplus produced by their labor; it enforces a wallet&rsquo;s claim to the bond it posted and the payment it bargained for. We accept the observation: the substrate is, at the architectural layer, more naturally compatible with the classical-liberal property baseline than with a cooperative-Marxian baseline that would treat property in means of production as itself a contingent institutional choice. The associated-producer reading of Section 4.1 holds only in the specific sense that, once property is granted as the architectural baseline, the substrate produces an arrangement in which the means of production are distributed at the wallet boundary rather than aggregated under capital. But the substrate inherits the property baseline from the surrounding legal architecture; a reader for whom that baseline is itself the contested question will find the substrate insufficient on philosophical grounds, and rightly so.
                    </p>
                    <PaperRemark title="On what is not collapsing.">
                        The two traditions disagree about much more than subordination and coordination rent &mdash; distribution, public goods, externalities, the legitimacy of inheritance, the appropriate scope of collective decision, the moral status of inequality &mdash; and about the two objections just conceded. These disagreements are not addressed by the substrate change and do not collapse; Section 5 returns to where they continue to operate. The claim here is narrower, and now fully qualified: the architectural disagreement that has been entangled with the distributional disagreement disentangles when the architectural variable is removed, subject to the capital-access and property-baseline objections above. This is not synthesis, not a claim that the two traditions agreed all along, and not a prediction that either will recognize the substrate as the realization of its program &mdash; it is the conceptual claim that, under the supposition the primitive is adopted, the substrate-level disagreement disentangles in the manner described.
                    </PaperRemark>
                </PaperSubsection>
            </PaperSection>

            <PaperSection title="5. Where the Partition Relocates">
                <p>
                    The partition between the two traditions does not disappear when the substrate is changed. It relocates. We sketch the relocation in several places, not exhaustively, building on the capital-access and property-baseline objections already conceded in Section 4.3.
                </p>
                <PaperRun title="Distribution.">
                    The substrate determines that bonded commitments settle to the wallets that posted them; it does not determine how wallets should be initially endowed, how returns should be shared inside multi-party assemblies, or how rents arising from network position should flow. A graph that weights resolution payouts by some contribution metric expresses one position; a graph that distributes uniformly expresses another; a graph that flows surplus to a treasury for collective allocation expresses a third. The substrate admits all three. Wright&rsquo;s (2010) work on &ldquo;real utopias&rdquo; maps cleanly onto graph-tier composition once the substrate is no longer the constraint. The disagreement about which is appropriate is a graph disagreement, not adjudicable by appeal to the protocol&rsquo;s behavior.
                </PaperRun>
                <PaperRun title="Public goods and externalities.">
                    The substrate does not produce non-excludable goods, does not internalize externalities by default, and does not arrange the collective action by which under-provision of public goods is addressed. A graph that requires emissions attestation and bonds carbon-removal commitments expresses one approach; a graph that ignores externalities expresses another. The substrate admits both; which is right is a graph-level question the substrate does not answer.
                </PaperRun>
                <PaperRun title="The social composition of assemblies.">
                    The substrate is permissive about who participates. It does not require a worker, an owner, an artificial intelligence, a state agency, a cooperative, or a foundation to participate or abstain; any wallet may compose with any other. What social composition produces a desirable political economy &mdash; whether assemblies should privilege workers, displace platform sellers, exclude predatory actors, admit AI agents on equal footing, route around state authority, or none of these &mdash; is again a graph-level question. The substrate admits answers across the spectrum.
                </PaperRun>
                <PaperRemark title="The kernel is agnostic; the graph is the politics.">
                    A guiding formulation holds: the kernel is ideologically agnostic; the graph is the politics. This paper extends it. Once the partition between the two traditions has been disentangled from the substrate, the disagreement that remains is not eliminated &mdash; it is concentrated at the graph tier. The graph is the politics not because the substrate suppresses politics, but because the substrate frees politics from being conducted in vocabulary inherited from a particular configuration of the substrate. The graph is where political economy actually happens once the architectural variable is no longer doing its conventional work.
                </PaperRemark>
            </PaperSection>

            <PaperSection title="6. Conclusion">
                <p>
                    The partition between the cooperative-Marxian and classical-liberal traditions has historically been organized around two variables &mdash; the subordination relation and the coordination rent &mdash; both of which the bonded settlement primitive removes from the substrate of exchange. The same artifact therefore admits the associated-producer reading from the first tradition and the frictionless-market reading from the second, with neither requiring metaphorical license. What appeared to be a foundational political-economic partition was conditional on a particular configuration of the substrate: the two traditions were arguing about the same thing using opposed vocabularies, and the thing they were arguing about was held in place by the substrate&rsquo;s prior limitations.
                </p>
                <p>
                    We close with an observation of method. The kernel is ideologically agnostic; the graph is the politics &mdash; and what this paper adds is that the graph is the politics in a stronger sense: it is where ideology has always been operating, partially obscured by the substrate&rsquo;s prior non-neutrality. The substrate&rsquo;s becoming neutral is what makes the actual location of ideological disagreement visible. The disagreement does not disappear; it moves to the graph, where the questions it has always been about &mdash; distribution, public goods, the social composition of assemblies &mdash; continue to operate. That is not a victory for either side. It is a relocation.
                </p>
            </PaperSection>
        </PaperLayout>
    );
}
