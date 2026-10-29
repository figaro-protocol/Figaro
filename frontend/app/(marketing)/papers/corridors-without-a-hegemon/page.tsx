import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import {
    PaperLayout,
    PaperSection,
    PaperRun,
    PaperRemark,
} from "@/components/papers/PaperLayout";

export const metadata: Metadata = withOg({
    title: "Corridors Without a Hegemon — Figaro Protocol",
    description:
        "The Belt and Road Initiative and the India-Middle East-Europe Economic Corridor are rival infrastructure-power projects in which control of the corridor is the geopolitical prize. A decentralized, permissionless bonded substrate, in which every position is held by a party over its own trade and the data is public to every reader alike, can be common ground beneath them. The physical corridor, the denomination, and the ramps stay exactly as contested as they were, and an issuer's lever over a denomination reaches through the substrate.",
});

export default function CorridorsWithoutAHegemonPaper() {
    return (
        <PaperLayout slug="corridors-without-a-hegemon"
            title="Corridors Without a Hegemon"
            subtitle="The Substrate as Common Infrastructure Beneath Rival Trade Corridors"
            author="Figaro"
            date="May 2026"
            watermark="Figaro Protocol · Preprint"
            abstract={
                <>
                    <p>
                        In September 2023 seven states and the European Union signed a memorandum to build the India&ndash;Middle East&ndash;Europe Economic Corridor, a coalition alternative to China&rsquo;s Belt and Road Initiative. Both projects are infrastructure power in the sense of the literature on weaponized interdependence. The sponsor builds the rails, the ports, and the coordination that runs along them, and the dependence they create becomes an instrument of statecraft. A partner choosing a corridor therefore chooses whose chokepoint it sits behind.
                    </p>
                    <p>
                        A corridor&rsquo;s coordination layer is what makes good the commitments between an exporter in one bloc and an importer in another. We argue that it can rest on a substrate whose control structure differs from the physical layer&rsquo;s. The substrate we study is a set of smart contracts on a public chain, decentralized and permissionless. Any wallet calls them on the same terms, each bond is posted by the party it deters, and only the buyer resolves. Every position in the substrate is held by a party over its own trade, and its data is public to every reader alike. The denomination, the ramps to local purchasing power, and the chain beneath stay governed, and an issuer&rsquo;s lever over a denomination reaches through the substrate. Within that boundary the substrate can be common ground beneath rival corridors: a participant sits behind one chokepoint fewer, never none.
                    </p>
                </>
            }
            references={
                <>
                    <li>Council of the European Union. 2022. Council Regulation (EU) 2022/345 of 1 March 2022 amending Regulation (EU) No 833/2014 concerning restrictive measures in view of Russia&rsquo;s actions destabilising the situation in Ukraine. <em>Official Journal of the European Union</em> L 63.</li>
                    <li>Farrell, Henry, and Abraham L. Newman. 2019. &ldquo;Weaponized Interdependence: How Global Economic Networks Shape State Coercion.&rdquo; <em>International Security</em> 44 (1): 42&ndash;79. https://doi.org/10.1162/isec_a_00351.</li>
                    <li>Figaro. 2026. &ldquo;Asymmetric Bonding and Buyer Dominance: Two Composing Mechanisms for N-Party Coordination Among Strangers.&rdquo; Preprint. https://figaroprotocol.com/papers/asymmetric-bonding/. Accessed October 19, 2026.</li>
                    <li>Gramsci, Antonio. 1971. <em>Selections from the Prison Notebooks</em>. Edited and translated by Quintin Hoare and Geoffrey Nowell-Smith. New York: International Publishers.</li>
                    <li>Hirschman, Albert O. 1945. <em>National Power and the Structure of Foreign Trade</em>. Berkeley: University of California Press.</li>
                    <li>Hirschman, Albert O. 1970. <em>Exit, Voice, and Loyalty: Responses to Decline in Firms, Organizations, and States</em>. Cambridge, MA: Harvard University Press.</li>
                    <li>Hussain, Afaq, and Nicholas Shafer. 2025. <em>The India&ndash;Middle East&ndash;Europe Economic Corridor: Connectivity in an Era of Geopolitical Uncertainty</em>. Washington, DC: Atlantic Council, August 27, 2025. https://www.atlanticcouncil.org/in-depth-research-reports/report/the-india-middle-east-europe-economic-corridor-connectivity-in-an-era-of-geopolitical-uncertainty/. Accessed October 19, 2026.</li>
                    <li>Keohane, Robert O. 1984. <em>After Hegemony: Cooperation and Discord in the World Political Economy</em>. Princeton, NJ: Princeton University Press.</li>
                    <li>Loadstar. 2022. &ldquo;AP M&oslash;ller-M&aelig;rsk and IBM to Discontinue TradeLens.&rdquo; <em>The Loadstar</em>, November 29, 2022. https://theloadstar.com/ap-moller-maersk-and-ibm-to-discontinue-tradelens/. Accessed October 19, 2026.</li>
                    <li>Rolland, Nad&egrave;ge. 2017. <em>China&rsquo;s Eurasian Century? Political and Strategic Implications of the Belt and Road Initiative</em>. Seattle: National Bureau of Asian Research.</li>
                    <li>Strange, Susan. 1988. <em>States and Markets</em>. London: Pinter Publishers.</li>
                    <li>White House. 2023. &ldquo;Memorandum of Understanding on the Principles of an India&ndash;Middle East&ndash;Europe Economic Corridor.&rdquo; Statements and Releases, September 9, 2023. https://bidenwhitehouse.archives.gov/briefing-room/statements-releases/2023/09/09/memorandum-of-understanding-on-the-principles-of-an-india-middle-east-europe-economic-corridor/. Accessed October 19, 2026.</li>
                </>
            }
        >
            <PaperSection title="1. Introduction">
                <p>
                    China&rsquo;s Belt and Road Initiative finances ports, railways, pipelines, power generation, and digital infrastructure across Asia, Africa, Europe, and Latin America. On September 9, 2023, seven states and the European Union signed a memorandum of understanding on an India&ndash;Middle East&ndash;Europe Economic Corridor, hereafter IMEC (White House 2023). The states were Saudi Arabia, India, the United Arab Emirates, France, Germany, Italy, and the United States. The memorandum describes two corridors: an eastern one linking India to the Arabian Gulf, and a northern one linking the Gulf to Europe. We read the two projects as rivals because each offers partners the same thing, a corridor and the coordination that runs along it, under a different sponsor.
                </p>
                <p>
                    The two projects are usually compared as routes: which is faster, which is cheaper, which is more resilient. Farrell and Newman (2019) suggest a different comparison. Their term <em>weaponized interdependence</em> names the use of an economic network&rsquo;s hubs, by the state with jurisdiction over them, for coercion or surveillance. On this reading a corridor is a structure of dependence, and the dependence is the point. The canonical case is financial: the dominant interbank messaging network has been turned into a sanctions instrument by disconnecting targeted banks from it. The corridor projects extend the same logic to physical and digital trade infrastructure.
                </p>
                <p>
                    We make one observation and draw one claim from it. The dependence a corridor creates has two layers, and they need not share a control structure. The <em>physical</em> layer (the ports, railways, pipelines, and cable) belongs to whoever financed it. The <em>coordination</em> layer is what makes good the commercial commitments across blocs, together with the data of who committed to what. It has been bundled with the physical layer and run by the sponsor or by a platform under its influence. That bundling is a design choice, and a different design unbundles it.
                </p>
                <PaperRun title="The claim.">
                    A coordination layer built as a decentralized, permissionless substrate, in which every position is held by a party over its own trade, contains no hub of the kind that control requires. Such a substrate can therefore be <em>common ground</em> beneath rival corridors: participants on both sides use it, neither bloc commands it, and a participant sits behind one chokepoint fewer, never none.
                </PaperRun>
                <PaperRun title="Premises.">
                    The argument uses nine; Section 4 defines the substrate&rsquo;s terms.
                </PaperRun>
                <ol className="space-y-2 list-decimal pl-6">
                    <li><strong>The hub.</strong> A hub is a node in an economic network far more connected than the others (Farrell and Newman 2019), and the flows that pass through it are the flows of parties other than its holder (the second clause is our reading). The state with jurisdiction over it can observe those flows (the panopticon effect) and interrupt them (the chokepoint effect).</li>
                    <li><strong>The sponsor&rsquo;s premise.</strong> Both corridor projects treat control of the corridor, its coordination layer included, as a geopolitical instrument (our reading in Section 2, of Rolland 2017 for the Belt and Road and of White House 2023 for IMEC, in Strange&rsquo;s (1988) terms).</li>
                    <li><strong>Two calls.</strong> At commit a buyer and a seller sign one commitment, the buyer bonding twice the payment and the seller twice the cumulative value at its order. At resolution the buyer alone signs, and every order of the process resolves at once. The rules name no currency, forum, or jurisdiction; the parties choose them for each process, in one token (stipulated: the protocol&rsquo;s rule).</li>
                    <li><strong>No key over the contracts.</strong> No party holds an admin, pause, or upgrade power over the contracts, so commit and resolution are the only operations that move a bond. Every other call is a party&rsquo;s act over its own entry (stipulated: the protocol&rsquo;s rule).</li>
                    <li><strong>One process suffices.</strong> Performance by every seller and resolution by the buyer is an equilibrium inside a single process, for parties beyond each other&rsquo;s coercive reach, with no continuation value from one process into the next (Figaro 2026, Theorems 1 and 3).</li>
                    <li><strong>Own acts.</strong> Every state-changing act carries a party&rsquo;s own signature over its own trade or its own entry, and no party can alter or remove another&rsquo;s entry (stipulated: the protocol&rsquo;s rule).</li>
                    <li><strong>The symmetric view.</strong> A process&rsquo;s parties, amounts, denomination, agreement fingerprint, and attestations are public to every reader alike. The terms stay with the parties behind the fingerprint, disclosed only by their choice (stipulated: the protocol&rsquo;s rule).</li>
                    <li><strong>The boundary.</strong> Four kinds of position around the substrate stay governed: the issuer of the denomination, the ramps to local purchasing power, the validators of the chain beneath, and the conveniences beside it (stipulated; Section 4).</li>
                    <li><strong>A state&rsquo;s reach.</strong> A state with reach over a buyer can compel that buyer&rsquo;s resolution, its abstention, or its disclosure of its sealed terms through its law, and so reaches the buyer&rsquo;s own processes (stipulated).</li>
                </ol>
                <PaperRun title="Steps.">
                    The argument runs in five named steps, in the order the paper takes them.
                </PaperRun>
                <ol className="space-y-2 list-decimal pl-6">
                    <li><strong>Unbundling.</strong> By premise 2 the sponsor&rsquo;s control covers two layers, the physical and the coordination layer. By premises 3 and 4 the second can run on contracts no party holds a key over, so the two need not share a control structure (Section 1).</li>
                    <li><strong>The hub test, position by position.</strong> By premises 3 and 6 each position inside the substrate is held by a party over its own trade. By premise 4 the contracts every process passes through are held by no one, so a jurisdiction gains over them no power to close or read that it lacks over each party. By premise 1 none is a hub (Section 4).</li>
                    <li><strong>Subtracting the boundary.</strong> By premises 8 and 9 the levers a state keeps over a participant sit in the issuer, the ramps, the validators, the conveniences, and its law over each party, all outside the substrate (Section 4).</li>
                    <li><strong>A symmetric view is no panopticon.</strong> By premises 1 and 7 the panopticon effect is an asymmetric view held by a hub&rsquo;s jurisdiction, and the substrate&rsquo;s view is the same for every reader (Section 4).</li>
                    <li><strong>Common ground.</strong> By premises 3, 4, and 5 the rules name no currency, forum, or jurisdiction, and the equilibrium holds inside one process. Parties of rival blocs therefore share the substrate while trusting no shared institution (Section 4 and Section 5).</li>
                </ol>
                <PaperRun title="Conclusion.">
                    By Steps 1 to 5, a coordination layer built as a decentralized, permissionless substrate, in which every position is held by a party over its own trade, contains no hub of the kind that control requires. It can therefore be common ground beneath rival corridors, and a participant sits behind one chokepoint fewer, never none.
                </PaperRun>
                <PaperRun title="Falsifier.">
                    Consider a position inside the substrate, held by a wallet that is no party to a trade, through which that trade&rsquo;s commitment, resolution, or data passes. The claim is false if such a position is shown and a jurisdiction can close it or read it asymmetrically.
                </PaperRun>
                <PaperRun title="Scope.">
                    The claim is about a layer, never about a transaction. The physical corridor, the denomination, the ramps, the chain beneath, and the conveniences beside it stay exactly as contested as before, and an issuer&rsquo;s lever over a denomination reaches through the substrate. A state with reach over a party reaches that party&rsquo;s own trades through its law, and through a buyer every seller of the buyer&rsquo;s process, whatever bloc the seller belongs to. The argument is architectural, not a forecast of adoption.
                </PaperRun>
            </PaperSection>

            <PaperSection title="2. Two Corridors as Infrastructure-Power Projects">
                <PaperRun title="The Belt and Road as structural power.">
                    The Belt and Road Initiative is best read through Strange&rsquo;s (1988) <em>structural power</em>: the power to shape the frameworks within which others act. It differs from relational power, the power to compel a specific act. Strange named four structures (security, production, finance, and knowledge), and the Belt and Road works across all four at once. It finances production capacity, builds the digital infrastructure through which trade is coordinated, and acquires a security-adjacent foothold through long-term port concessions. The reading of the Belt and Road as a grand strategy rather than a purely commercial program is well established (Rolland 2017). The recurring critique (that infrastructure lending creates dependence that can later be leveraged) is the weaponized-interdependence concern applied to physical infrastructure (Farrell and Newman 2019). Whether the sponsor has used that leverage is beside our point. What matters is that the architecture concentrates the capacity for leverage in the sponsor, by design.
                </PaperRun>
                <PaperRun title="IMEC as counter-architecture.">
                    The India&ndash;Middle East&ndash;Europe Economic Corridor answers the question &ldquo;whose corridor?&rdquo; with a different coalition, not with a different kind of control. Its value depends on a chain of bilateral arrangements (Indian ports, Gulf rail, Mediterranean shipping, and European terminals), each governed by a coalition state and its preferred operators. Two years after signature, a report urging renewed momentum found a financing shortfall of about five billion dollars to make the transport route minimally operational, and no body coordinating the whole (Hussain and Shafer 2025). The finding is instructive. A corridor assembled from state-controlled bilateral links is coordinated only as far as the political relationships among its sponsors carry it. Those relationships are what an adversary or a shock can disrupt.
                </PaperRun>
                <PaperRun title="The common logic.">
                    Beneath the rivalry the two projects share a premise: the coordination layer of a trade corridor belongs to whoever sponsors the corridor. The premise is Gramscian in form (Gramsci 1971): infrastructure as a vehicle of hegemony, the building of the rails as the building of consent to the rail-builder&rsquo;s framework. It is what makes corridor competition zero-sum at the coordination layer. If that layer must belong to someone, every partner must choose whose framework to work within, and the choice is a geopolitical alignment. The corridor debate runs entirely inside the premise: it asks <em>which</em> sponsor&rsquo;s coordination layer, never <em>whether</em> the coordination layer needs a sponsor.
                </PaperRun>
            </PaperSection>

            <PaperSection title="3. The Chokepoint Logic and the Partner&rsquo;s Dilemma">
                <p>
                    A corridor&rsquo;s coordination layer becomes an instrument of power through the chokepoint. Farrell and Newman (2019) theorize the mechanism: economic networks develop hubs, nodes far more connected than the others, and the state with jurisdiction over a hub gains two capabilities. The <em>panopticon effect</em> is its capacity to observe the flows; the <em>chokepoint effect</em> is its capacity to interrupt them. Interbank messaging is the textbook case. Iranian banks were disconnected from it in 2012 (Farrell and Newman 2019), and seven major Russian banks in March 2022 (Council of the European Union 2022). The lesson generalizes: a coordination layer with a controllable hub is a latent chokepoint, and building the hub is building the lever.
                </p>
                <PaperRun title="The partner&rsquo;s dilemma.">
                    A state or firm considering a corridor faces a dilemma that the comparison of routes conceals. Using the corridor means routing commercial coordination, enforcement, dispute resolution, and the data of performance, through infrastructure its sponsor controls or strongly influences. The gains (lower cost, faster transit, financing) are bought with a standing exposure: over the life of the relationship, the sponsor holds the capacity to observe and to interrupt. Diversifying across corridors reduces dependence on any one sponsor but multiplies the chokepoints a partner sits behind. Building a sovereign coordination layer is beyond most states, and for those that can it moves the chokepoint rather than removing it. Hirschman (1945) described the structure beneath the dilemma: the gains from trade and the political dependence trade creates come from the same flows. A state cannot take the first without incurring the second, unless the structure of the flow changes.
                </PaperRun>
                <PaperRun title="The platform variant.">
                    One attempt to change that structure stands as a fact here and nothing more. TradeLens, the container-shipping platform built by IBM and Maersk, offered the industry a shared coordination layer under the sponsorship of one of its carriers. Its discontinuation was announced on November 29, 2022 (Loadstar 2022). We use the case only as one instance of a sponsored coordination layer that did not become its industry&rsquo;s common ground.
                </PaperRun>
            </PaperSection>

            <PaperSection title="4. The Substrate as Common Ground">
                <p>
                    Figaro is a protocol for trade between strangers: a set of rules written as smart contracts on a public chain. We call those contracts the <em>substrate</em>, and the public chain that executes them the chain beneath. The substrate&rsquo;s center is the mechanism, two operations: commit, which takes the bonds, and the buyer&rsquo;s resolution. An <em>order</em> is one signed commitment between a buyer and a seller, and a <em>process</em> is the orders one buyer opens and resolves together. The <em>cumulative value</em> at an order is every payment the process has accumulated through it, its own included. A process&rsquo;s <em>data</em> is what was committed, attested, and resolved, and anyone can read it.
                </p>
                <p>
                    The terms of a trade are built from three kinds of design. A <em>clause</em> is one reusable term, such as the forum that rules on a dispute or the order of the sellers. An <em>agreement</em> is the clauses composed for one order, and an <em>assembly</em> is a reusable design of a process, its agreements composed in order. Beside the mechanism sit public registries. In them <em>designers</em> (the wallets that write and register these designs) publish clauses, agreements, and assemblies. <em>Members</em> (the wallets that take part in trade) publish profiles so that others can find them.
                </p>
                <PaperRun title="A promise is made good in two calls.">
                    The substrate makes a commitment good through two calls. At commit, a buyer and a seller sign the same commitment, and the mechanism takes two bonds, each posted by the party it deters so the other can count on it. The buyer&rsquo;s, twice the payment, makes resolving after performance its best move. The seller&rsquo;s, twice the cumulative value at its order, makes performing its best move against that plan while its co-sellers perform. The deeper the order, the more value has accumulated through it, the most a holdout there could keep, so the larger its bond. At resolution, the buyer alone signs, and every order in the process resolves at once. Each seller receives its payment and its bond refunded whole; the buyer&rsquo;s bond is refunded less the payments it carried. The mechanism has these two calls and no third, and no party holds an admin, pause, or upgrade power that would add one. Performance by every seller and resolution by the buyer is an equilibrium inside one process, for any number of orders the network resolves in one call (Figaro 2026, Theorems 1 and 3).
                </PaperRun>
                <PaperRun title="Remedy comes before resolution.">
                    Where performance has not occurred the process stays open, and the parties negotiate a remedy before the buyer resolves. Resolution is the buyer&rsquo;s acceptance, and it is terminal. In a process of several orders the single resolution couples the sellers: one that has performed is paid only when the whole process resolves. Its payment and its bond wait on the whole process, so it has its own reason to see any co-seller&rsquo;s fault cured. Which co-seller failed is knowledge the parties hold, since the mechanism holds no fault and each attestation is its signer&rsquo;s own word. Across blocs this coupling matters, because the parties to a stalled shipment have their own reason to cure it before any forum, sponsor, or state is asked. A forum may rule on a process&rsquo;s data while it stands open, and its ruling reaches the parties as rulings ordinarily do. No forum can resolve in the buyer&rsquo;s place, so a forum has no direct enforcement over the substrate.
                </PaperRun>
                <PaperRun title="The chain holds fingerprints, never the trade.">
                    Performance passes between the parties. The chain holds the bonds, out of which resolution pays each payment, the cumulative value, the agreement&rsquo;s fingerprint (a single hash committing to every clause of the agreement), and the attestations. An attestation is a statement a party gives for itself about a process while it is open, signed and bound to the order it concerns. The chain checks that an attestation is signed and bound, never that it is true. The data therefore shows who committed to what and who attested what. It never shows whether a cargo was loaded or a cable laid.
                </PaperRun>
                <PaperRun title="Every position is a party&rsquo;s own.">
                    A seller commits by its own signature and bond; a party attests for itself; the buyer resolves its own process. A designer registers its own design, keyed by the hash of its content, and a member its own profile. Each entry is placed by its own wallet under a reclaimable stake in tokens, and no other party can alter or remove it. Inside the substrate, the only judgment that holds a process open is its buyer&rsquo;s, and it reaches that one process. The positions around the substrate that can hold one open from outside are the boundary&rsquo;s subject. None of these positions is a hub (Step 2). A sanctions instrument reaches the substrate&rsquo;s participants as it reaches anyone: through the law over each of them, the ramps they use, and the issuer of the denomination they chose (the boundary below).
                </PaperRun>
                <PaperRemark title="The boundary: the positions around the substrate stay governed.">
                    The claim reaches the substrate and nothing around it, and four kinds of position around it stay governed. The <em>denomination</em> is the token every payment and bond of a process is counted in, one token per process. A fiat-referenced stablecoin (a token its issuer keeps at the value of a state&rsquo;s currency) has an issuer that can block an address on a sanctioning state&rsquo;s instruction. The block reaches through the substrate. Because resolution is atomic, an issuer that refuses a transfer to one seller holds the whole process open: every bond stays locked and every other seller unpaid until the issuer relents. An issuer that blocks the address holding a process&rsquo;s bonds holds that process open. Choosing a denomination is therefore choosing whose lever enters the process.
                </PaperRemark>
                <PaperRemark title="The ramps and the chain beneath stay governed, and the conveniences beside can delay.">
                    The <em>ramps</em> between the denomination and local purchasing power run through exchanges and banking rails that are gated exactly where corridor politics is sharpest. The <em>chain beneath</em> is ordered by validators, who are governed entities whose choices reach the substrate from below. The <em>conveniences beside</em> the substrate, the indexers that read the data and the interfaces that present it, can see and delay what they carry. None can fabricate or alter what resolves.
                </PaperRemark>
                <PaperRemark title="Is the protocol&rsquo;s own token a lever?">
                    The protocol&rsquo;s own token, the florin, is one denomination among many. The mechanism counts a florin bond as it counts a bond in any other token, so whoever holds florins holds a position in that token&rsquo;s market and none over the substrate.
                </PaperRemark>
                <PaperRun title="At the coordination layer, each position is a party&rsquo;s own and the view is public.">
                    At this layer the chokepoint a platform or an intermediary would hold over enforcement passes to no new holder: what makes a promise good here is the parties&rsquo; own bonds, posted before the trade, and the buyer&rsquo;s resolution.
                </PaperRun>
                <PaperRun title="Is the public chain a new hub?">
                    Is a public chain not a better panopticon than any hub? It gives a sanctioning state the view every party and every rival state already has. The panopticon effect as Farrell and Newman describe it is an asymmetric view held by a hub&rsquo;s jurisdiction. Here the view is symmetric, and acting on it runs through the levers the state holds outside the substrate: the denomination and the ramps. Is the chain beneath not itself a hub, its validators concentrated under a few jurisdictions? Validators can delay a call&rsquo;s inclusion, but they cannot forge a party&rsquo;s signature or change an amount: that is a chokepoint at another layer, the chain beneath, which the boundary counts.
                </PaperRun>
                <PaperRun title="The graph is the politics.">
                    The mechanism takes no position on currency, jurisdiction, identity, arbitration forum, role structure, price discovery, or contribution metric; each of these is expressed in the graph above it. The graph is the design an assembly carries: who sells to whom, in which token, under which forum. The designer composes the assembly, the sellers bind it (each names it in its profile as a standing offer), and the buyer selects it. A renminbi-denominated assembly naming Chinese arbitral forums and a dollar- or euro-denominated assembly naming coalition forums are different graphs on the same substrate. The mechanism makes the promises under both good with the same arithmetic and prefers neither. Two parties on opposite sides of the corridor rivalry can share the substrate while trusting no shared institution. Sharing it commits each to nothing beyond the bond it has posted and the denomination both chose.
                </PaperRun>
                <PaperRemark title="What remains contested.">
                    The substrate does not pacify the corridor. The ports are still owned, the rail is still financed by someone, and the physical routes still run through territory that can be closed. A commitment whose performance depends on a closed strait is not rescued by the mechanism. The buyer holds a process it need not resolve, and the seller&rsquo;s bond stays locked while the two decide what to do about the strait. The physical chokepoint is exactly as contested as it was.
                </PaperRemark>
            </PaperSection>

            <PaperSection title="5. Cooperation Without a Hegemon">
                <p>
                    The deeper question is whether coordination at scale can hold without a coordinating power. Keohane&rsquo;s (1984) <em>After Hegemony</em> is the canonical treatment. It engages hegemonic stability theory. On that theory an international regime (the rules, norms, and institutions that make cooperation under anarchy possible) is a public good that a hegemon supplies and that is under-provided without one. Keohane holds that hegemony often plays an important role in creating a regime but is not needed to keep it going. States come to value the regime itself, so it can outlast the power that built it.
                </p>
                <PaperRun title="A regime each trade supplies.">
                    The substrate performs a regime function, credible commitment between strangers, that each trade supplies for itself. The credibility of an order is the bonds its own parties post. Its cost to them is the gas their calls consume (the network&rsquo;s charge for executing a call) and the time value of the bonded tokens while they stay locked. Who supplied the contracts? Publishing them is a single act, after which they run on the chain with no further provision, and anyone may publish another implementation of the same rules. This does not refute hegemonic stability theory, which concerns regimes constituted as institutions that must be funded, staffed, and defended. It identifies a coordination function realized as a property of each trade&rsquo;s bonds, to which the supply problem does not apply.
                </PaperRun>
                <PaperRun title="Why neither bloc need trust the other.">
                    Cooperation under anarchy classically needs a hegemon to enforce it or enough repeated interaction to make defection unprofitable. The substrate needs neither, because the equilibrium of Section 4 holds inside a single process. No continuation value runs from one process into the next, and the coupling among a process&rsquo;s sellers lasts exactly as long as the process stands open. A Chinese exporter and an Indian importer may expect never to trade again and trust no common institution. Inside their process they hold the same equilibrium as parties who trade through a process while embedded in a dense web of repeated trades. For the second pair, repetition adds reputation to the equilibrium, and the equilibrium does not need it. Keohane&rsquo;s regimes often owe their origin to a hegemon; the substrate&rsquo;s credibility owes its origin to the bonds of each trade.
                </PaperRun>
            </PaperSection>

            <PaperSection title="6. Why States May Resist, and Why Adoption Does Not Depend on Their Sponsorship">
                <p>
                    A substrate that takes no position is not obviously in the interest of the states sponsoring the corridors. The weaponized-interdependence literature is clear that states value chokepoints: the leverage is an asset of statecraft, and a sponsor has little reason to welcome a layer that holds none for it. If adoption depended on state sponsorship, the prediction would be non-adoption.
                </p>
                <PaperRun title="Adoption is participant-level, not state-level.">
                    Adoption depends on participants, because the substrate is permissionless: a participant adopts it by posting a bond and signing a commitment, without any state&rsquo;s endorsement. The adopters are firms and traders, the parties who bear the chokepoint exposure and gain from leaving it: this is Hirschman&rsquo;s (1970) <em>exit</em> in its commercial form. When the cost of staying within a sponsor-controlled coordination layer exceeds the cost of leaving, participants exit to the substrate, and each can do so alone. The exit is partial: a firm leaves the chokepoint at the coordination layer while still using the physical corridor.
                </PaperRun>
                <p>
                    Can a state not forbid its residents to use the substrate? It can, through its law over its own residents, through the ramps, and through an issuer it governs over every trade in that issuer&rsquo;s token. Validators and conveniences in its jurisdiction can also delay what they carry. What a participant leaves is the sponsor&rsquo;s hold over enforcement and data; the law over the participant, and every sanction it carries, stays where it was.
                </p>
                <PaperRemark title="Every wallet holds the same calls over its own trades.">
                    Every wallet, a state&rsquo;s included, holds the same calls over its own trades and none over another wallet&rsquo;s process. An instrument aimed at a rival needs a lever over the rival&rsquo;s trades. Inside the substrate each wallet&rsquo;s calls reach only its own trades, and the issuer&rsquo;s lever (which the boundary states) enters through the denomination the parties chose. The substrate is adopted trade by trade, by whoever finds the exit worthwhile, so the argument favors neither corridor.
                </PaperRemark>
            </PaperSection>

            <PaperSection title="7. Conclusion">
                <p>
                    The Belt and Road Initiative and the India&ndash;Middle East&ndash;Europe Economic Corridor are debated as rival routes. They are rival architectures of dependence, each premised on a coordination layer that belongs to the corridor&rsquo;s sponsor. A decentralized, permissionless substrate denies the premise at that layer: every position in it is held by a party over its own trade, and its view is the same for everyone. Its judgment is that the coordination layer is the contingent part of corridor dependence: the corridors can go on competing, and the substrate beneath them need not take a side.
                </p>
            </PaperSection>
        </PaperLayout>
    );
}
