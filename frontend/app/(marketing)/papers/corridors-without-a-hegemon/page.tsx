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
        "The Belt and Road Initiative and the India-Middle East-Europe Economic Corridor are rival infrastructure-power projects in which control of the corridor is the geopolitical prize. A decentralized, permissionless bonded substrate, in which every position belongs to a party to the trade it carries and the data is public to every reader alike, can be common ground beneath them. The physical corridor, the denomination, and the ramps stay exactly as contested as they were, and an issuer's lever over a denomination reaches through the substrate.",
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
                        In September 2023 eight governments signed a memorandum to build the India&ndash;Middle East&ndash;Europe Economic Corridor, a coalition alternative to China&rsquo;s Belt and Road Initiative. Both projects are infrastructure power in the sense of the literature on weaponized interdependence: the sponsor builds the rails, the ports, and the coordination that runs along them, and the dependence they create becomes an instrument of statecraft. A partner choosing a corridor therefore chooses whose chokepoint it sits behind.
                    </p>
                    <p>
                        We argue that a corridor&rsquo;s coordination layer, the enforcement of commitments between an exporter in one bloc and an importer in another, can rest on a substrate whose control structure differs from the physical layer&rsquo;s. The substrate we study is a set of smart contracts on a public chain, decentralized and permissionless. Any wallet calls them on the same terms, each bond is posted by the party it deters, and only the buyer resolves. Every position in the substrate belongs to a party to the trade it carries, and its data is public to every reader alike. The denomination, the ramps to local purchasing power, and the chain beneath stay governed, and an issuer&rsquo;s lever over a denomination reaches through the substrate. Within that boundary the substrate can be common ground beneath rival corridors: a participant sits behind one chokepoint fewer, never none.
                    </p>
                </>
            }
            references={
                <>
                    <li>Council of the European Union. 2022. Council Regulation (EU) 2022/345 of 1 March 2022 amending Regulation (EU) No 833/2014 concerning restrictive measures in view of Russia&rsquo;s actions destabilising the situation in Ukraine. <em>Official Journal of the European Union</em> L 63.</li>
                    <li>Farrell, Henry, and Abraham L. Newman. 2019. &ldquo;Weaponized Interdependence: How Global Economic Networks Shape State Coercion.&rdquo; <em>International Security</em> 44 (1): 42&ndash;79. https://doi.org/10.1162/isec_a_00351.</li>
                    <li>Figaro. 2026. &ldquo;Asymmetric Bonding and Buyer Dominance: Two Composing Mechanisms for Self-Enforcing N-Party Coordination.&rdquo; Preprint. https://figaroprotocol.com/papers/asymmetric-bonding/. Accessed October 19, 2026.</li>
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
                    China launched the Belt and Road Initiative in 2013, financing ports, railways, pipelines, power generation, and digital infrastructure across Asia, Africa, Europe, and Latin America. On September 9, 2023, Saudi Arabia, the European Union, India, the United Arab Emirates, France, Germany, Italy, and the United States signed a memorandum of understanding on an India&ndash;Middle East&ndash;Europe Economic Corridor, hereafter IMEC (White House 2023). The memorandum describes two corridors: an eastern one linking India to the Arabian Gulf, and a northern one linking the Gulf to Europe. We read the two projects as rivals because each offers partners the same thing, a corridor and the coordination that runs along it, under a different sponsor.
                </p>
                <p>
                    The two projects are usually compared as routes: which is faster, which is cheaper, which is more resilient. Farrell and Newman (2019) suggest a different comparison. Their term <em>weaponized interdependence</em> names the use of an economic network&rsquo;s hubs, by the state with jurisdiction over them, for coercion or surveillance. On this reading a corridor is a structure of dependence, and the dependence is the point. The canonical case is financial: the dominant interbank messaging network has been turned into a sanctions instrument by disconnecting targeted banks from it. The corridor projects extend the same logic to physical and digital trade infrastructure.
                </p>
                <p>
                    We make one observation and draw one claim from it. The dependence a corridor creates has two layers, and they need not share a control structure. The <em>physical</em> layer, the ports, railways, pipelines, and cable, belongs to whoever financed it. The <em>coordination</em> layer is the enforcement of commercial commitments across blocs and the data of who committed to what. It has been bundled with the physical layer and run by the sponsor or by a platform under its influence. That bundling is a design choice, and a different design unbundles it.
                </p>
                <PaperRun title="The thesis.">
                    (1) Both corridor projects treat control of the corridor, its coordination layer included, as a geopolitical instrument. (2) A coordination layer built as a decentralized, permissionless substrate, in which every position belongs to a party to the trade it carries, contains no hub of the kind that control requires. (3) Such a substrate can therefore be <em>common ground</em> beneath rival corridors: participants on both sides use it, and neither bloc commands it. The physical corridor stays exactly as contested as before.
                </PaperRun>
            </PaperSection>

            <PaperSection title="2. Two Corridors as Infrastructure-Power Projects">
                <PaperRun title="The Belt and Road as structural power.">
                    The Belt and Road Initiative is best read through Strange&rsquo;s (1988) <em>structural power</em>: the power to shape the frameworks within which others act. It differs from relational power, the power to compel a specific act. Strange named four structures, security, production, finance, and knowledge, and the Belt and Road works across all four at once. It finances production capacity, builds the digital infrastructure through which trade is coordinated, and acquires a security-adjacent foothold through long-term port concessions. The reading of the Belt and Road as a grand strategy rather than a purely commercial program is well established (Rolland 2017). The recurring critique, that infrastructure lending creates dependence that can later be leveraged, is the weaponized-interdependence concern applied to physical infrastructure (Farrell and Newman 2019). Whether any instance of leverage has been exercised is contested and beside our point. What matters is that the architecture concentrates the capacity for leverage in the sponsor, by design.
                </PaperRun>
                <PaperRun title="IMEC as counter-architecture.">
                    The India&ndash;Middle East&ndash;Europe Economic Corridor answers the question &ldquo;whose corridor?&rdquo; with a different coalition, not with a different kind of control. Its value depends on a chain of bilateral arrangements, Indian ports, Gulf rail, Mediterranean shipping, and European terminals, each governed by a coalition state and its preferred operators. Two years after signature, a report urging renewed momentum found a financing shortfall of about five billion dollars to make the transport route minimally operational, and no body coordinating the whole (Hussain and Shafer 2025). The finding is instructive. A corridor assembled from state-controlled bilateral links is coordinated only as far as the political relationships among its sponsors carry it, and those relationships are what an adversary or a shock can disrupt.
                </PaperRun>
                <PaperRun title="The common logic.">
                    Beneath the rivalry the two projects share a premise: the coordination layer of a trade corridor belongs to whoever sponsors the corridor. The premise is Gramscian in form (Gramsci 1971): infrastructure as a vehicle of hegemony, the building of the rails as the building of consent to the rail-builder&rsquo;s framework. It is what makes corridor competition zero-sum at the coordination layer. If that layer must belong to someone, every partner must choose whose framework to work within, and the choice is a geopolitical alignment. The corridor debate runs entirely inside the premise: it asks <em>which</em> sponsor&rsquo;s coordination layer, never <em>whether</em> the coordination layer needs a sponsor.
                </PaperRun>
            </PaperSection>

            <PaperSection title="3. The Chokepoint Logic and the Partner&rsquo;s Dilemma">
                <p>
                    A corridor&rsquo;s coordination layer becomes an instrument of power through the chokepoint. Farrell and Newman (2019) theorize the mechanism: economic networks develop hubs through which a disproportionate share of flows pass, and the state with jurisdiction over a hub gains two capabilities. The <em>panopticon effect</em> is its capacity to observe the flows; the <em>chokepoint effect</em> is its capacity to interrupt them. Interbank messaging is the textbook case. Iranian banks were disconnected from it in 2012 (Farrell and Newman 2019), and seven major Russian banks in March 2022 (Council of the European Union 2022). The lesson generalizes: a coordination layer with a controllable hub is a latent chokepoint, and building the hub is building the lever.
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
                    Figaro is a protocol for trade between strangers: a set of rules enforced by smart contracts on a public chain. We call those contracts the <em>substrate</em>, and the public chain that executes them the chain beneath. The substrate&rsquo;s center is the Core, which accepts bonded commitments and resolves them. An <em>order</em> is one signed commitment between a buyer and a seller, and a <em>process</em> is the orders one buyer opens and resolves together. The <em>cumulative value</em> at an order is every payment the process has accumulated through it, its own included. A process&rsquo;s <em>data</em> is what was committed, attested, and resolved, and anyone can read it.
                </p>
                <p>
                    The terms of a trade are built from three kinds of design. A <em>clause</em> is one reusable term, such as the forum that rules on a dispute or the order of the sellers. An <em>agreement</em> is the clauses composed for one order, and an <em>assembly</em> is a reusable design of a process, its agreements composed in order. Beside the Core sit four public registries. In three of them <em>designers</em>, the wallets that write and register these designs, publish clauses, agreements, and assemblies; in the fourth, <em>members</em>, the wallets that take part in trade, publish profiles so that others can find them.
                </p>
                <PaperRun title="Enforcement is two calls.">
                    The substrate enforces a commitment through two calls. At commit, a buyer and a seller sign the same commitment, and the Core takes two bonds: the buyer&rsquo;s of twice the payment, the seller&rsquo;s of twice the cumulative value at its order. At resolution, the buyer alone signs, and every order in the process resolves at once. Each seller receives its payment and its bond refunded whole; the buyer&rsquo;s bond is refunded less the payments it carried. The mechanism has these two calls and no third, and a process carries as many orders as the chain can resolve in one transaction.
                </PaperRun>
                <p>
                    The calls reach the Core by one of two paths. On the <em>direct path</em> the commitment, signed by both parties, is submitted in one call, and the buyer submits its own resolution; the Core&rsquo;s resolution contract holds the bonds. On the <em>batched path</em> a <em>sequencer</em> gathers the parties&rsquo; signed calls into a batch and submits it with a validity proof (a proof, checked by the chain, that every call in the batch follows the substrate&rsquo;s rules). The Core&rsquo;s batch verifier holds those bonds and draws each party&rsquo;s net amount when a batch resolves.
                </p>
                <PaperRun title="Why each party performs.">
                    Each party performs because its bond, measured net of what a defector keeps, makes defection cost more than it yields. Take a first order with a payment of 10: the buyer locks 20, and the seller, whose cumulative value is 10, locks 20. A seller that holds out leaves its 20 locked and keeps at most the 10 it withheld, so it ends at least 10 down; performing earns it the payment. A buyer that has received performance and never resolves leaves its 20 locked while holding a delivery worth 10, so it ends exactly the payment down. Resolving leaves it holding what it bought for what it paid.
                </PaperRun>
                <p>
                    After performance, resolving is therefore strictly better for the buyer with no assumption about the seller, because the seller&rsquo;s conduct is already fixed. The seller&rsquo;s performance rests on that comparison and on the buyer&rsquo;s plan: resolve once performance has occurred, and not before. Given both, and given its co-sellers&rsquo; performance, performing is each seller&rsquo;s strict best response. The buyer&rsquo;s plan passes its own check against that response. Before performance, resolving at once is terminal and leaves the buyer the payment down, while keeping the process open leads to performance and a resolution that leaves it whole. The seller&rsquo;s check and the buyer&rsquo;s hold against the same pair of plans, verified together: that fixed point is the equilibrium, and cooperation is it. The equilibrium is proved, for any number of orders the network resolves in one call, in Figaro (2026).
                </p>
                <PaperRun title="Remedy comes before resolution.">
                    Where performance has not occurred the process stays open, and the parties negotiate a remedy before the buyer resolves. Resolution is the buyer&rsquo;s acceptance, and it is terminal. In a process of several orders the single resolution couples the sellers: one that has performed is paid only when the whole process resolves. It therefore holds a bonded interest in seeing any co-seller&rsquo;s fault cured. Across blocs this coupling matters, because the parties to a stalled shipment have their own reason to cure it before any forum, sponsor, or state is asked. A forum may rule on a process&rsquo;s data while it stands open, and its ruling reaches the parties as rulings ordinarily do. No forum can resolve in the buyer&rsquo;s place, so a forum has no direct enforcement over the substrate.
                </PaperRun>
                <PaperRun title="The chain holds fingerprints, never the trade.">
                    Performance passes between the parties; the chain holds the bonds, out of which resolution pays each payment, the cumulative value, the agreement&rsquo;s merkle root (a single hash committing to every clause of the agreement), and the attestations. An attestation is a statement a party gives for itself about a process while it is open, signed and bound to the order it concerns. The chain checks that an attestation is signed and bound, never that it is true. The data therefore shows who committed to what and who attested what. It never shows whether a cargo was loaded or a cable laid.
                </PaperRun>
                <PaperRun title="Every position belongs to a party to the trade.">
                    Every state-changing act in the substrate carries a party&rsquo;s own signature over its own trade; on the batched path the sequencer submits, and it carries only what each party signed. A seller commits by its own signature and bond; a party attests for itself; the buyer resolves its own process. A designer registers its own design, keyed by the hash of its content, and a member its own profile. Each entry is placed by its own wallet under a stake (the chain&rsquo;s currency a wallet locks with its registry entry and can reclaim), and no other party can alter or remove it. Inside the substrate, the only judgment that holds a process open is its buyer&rsquo;s, and it reaches that one process; the positions around the substrate that can hold one open from outside are the boundary&rsquo;s subject. A hub, in Farrell and Newman&rsquo;s sense, is a position through which others&rsquo; flows pass and over which a jurisdiction can be exercised. The substrate&rsquo;s positions are each held by a party over its own trade, so none of them is a hub through which others&rsquo; flows pass. A sanctions instrument reaches the substrate&rsquo;s participants as it reaches anyone: through the law over each of them, the ramps they use, and the issuer of the denomination they chose (the boundary below).
                </PaperRun>
                <PaperRemark title="The boundary: the positions around the substrate stay governed.">
                    The claim reaches the substrate and nothing around it, and four kinds of position around it stay governed. The <em>denomination</em> is the token every payment and bond of a process is counted in, one token per process. A fiat-referenced stablecoin (a token its issuer keeps at the value of a state&rsquo;s currency) has an issuer that can block an address on a sanctioning state&rsquo;s instruction, and the block reaches through the substrate. Because resolution is atomic, an issuer that refuses a transfer to one seller holds the whole process open: every bond stays locked and every other seller unpaid until the issuer relents. An issuer that blocks the contract holding the bonds, the resolution contract on the direct path or the batch verifier on the batched path, holds every process in its token on that path. Choosing a denomination is therefore choosing whose lever enters the process.
                </PaperRemark>
                <PaperRemark title="The ramps and the chain beneath stay governed, and the conveniences beside can delay.">
                    The <em>ramps</em> between the denomination and local purchasing power run through exchanges and banking rails that are gated exactly where corridor politics is sharpest. The <em>chain beneath</em> is ordered by validators, who are governed entities whose choices reach the substrate from below. The <em>conveniences beside</em> the substrate, the sequencers that batch processes for resolution, the indexers that read the data, and the interfaces that present it, can see and delay what they carry. None can fabricate or alter what resolves. A process open on the batched path resolves only through a sequencer started on the state behind the root the chain holds. Nothing moves between the two paths, so a delayed party opens its next process on the direct path.
                </PaperRemark>
                <PaperRemark title="The protocol&rsquo;s own token is a concentration in a market, never a lever.">
                    The same test applied to the protocol&rsquo;s own token, the florin, finds a concentration: at genesis 40% of its supply ceiling is minted to three wallets, the founder&rsquo;s, the supporters&rsquo;, and the DAO&rsquo;s; the remaining 60% can be minted only per period, as rewards designers claim for the counted use of what they publish. The DAO is the body that holds and spends the protocol&rsquo;s treasury by human judgment. That is a concentration in the token&rsquo;s market, never a lever over the Core, which counts a florin bond as it counts a bond in any other denomination.
                </PaperRemark>
                <PaperRun title="At the coordination layer, each position is a party&rsquo;s own and the view is public.">
                    At this layer the chokepoint a platform or an intermediary would hold over enforcement passes to no new holder: enforcement is the parties&rsquo; own bonds and the buyer&rsquo;s resolution. Its view, though, is public. On the direct path anyone, a sanctioning state included, reads every order&rsquo;s process identifier, order hash (the hash of the process identifier and the signed commitment, which names the order), salt (a number the parties choose, random by default, that keeps otherwise identical orders distinct), wallets, denomination, payment, cumulative value, deadline, and agreement root (the agreement&rsquo;s merkle root). On the batched path it reads the batch&rsquo;s state roots and net positions. On both it reads every attestation&rsquo;s attester, clause, stage, and content reference. Only the terms stay sealed behind the root.
                </PaperRun>
                <PaperRun title="Is the public chain a new hub?">
                    A referee will ask whether a public chain is a better panopticon than any hub. It gives a sanctioning state the view every party and every rival state already has. The panopticon effect as Farrell and Newman describe it is an asymmetric view held by a hub&rsquo;s jurisdiction; here the view is symmetric, and acting on it runs through the levers the state holds outside the substrate, the denomination and the ramps. A referee will also ask whether the chain beneath is itself a hub, its validators concentrated under a few jurisdictions. Validators can delay a call&rsquo;s inclusion, but they cannot forge a party&rsquo;s signature or change an amount: that is a chokepoint at another layer, the chain beneath, which the boundary counts. The claim of this section is therefore about a layer, never about a transaction: a participant sits behind one chokepoint fewer, never none.
                </PaperRun>
                <PaperRun title="The graph is the politics.">
                    The mechanism takes no position on currency, jurisdiction, identity, arbitration forum, role structure, price discovery, or contribution metric; each of these is expressed in the graph above it. The graph is the design an assembly carries: who sells to whom, in which token, under which forum. The designer composes the assembly, the sellers bind it (each names it in its profile as a standing offer), and the buyer selects it. A renminbi-denominated assembly naming Chinese arbitral forums and a dollar- or euro-denominated assembly naming coalition forums are different graphs on the same substrate. The Core enforces both with the same arithmetic and prefers neither. Two parties on opposite sides of the corridor rivalry can share the substrate while trusting no shared institution, because sharing it commits each to nothing beyond the bond it has posted and the denomination both chose.
                </PaperRun>
                <PaperRemark title="What remains contested.">
                    The substrate does not pacify the corridor. The ports are still owned, the rail is still financed by someone, and the physical routes still run through territory that can be closed. A commitment whose performance depends on a closed strait is not rescued by the mechanism. The buyer holds a process it need not resolve, and the seller&rsquo;s bond stays locked while the two decide what to do about the strait. The physical chokepoint is exactly as contested as it was.
                </PaperRemark>
            </PaperSection>

            <PaperSection title="5. Cooperation Without a Hegemon">
                <p>
                    The deeper question is whether coordination at scale can hold without a coordinating power. Keohane&rsquo;s (1984) <em>After Hegemony</em> is the canonical treatment. It engages hegemonic stability theory, on which an international regime (the rules, norms, and institutions that make cooperation under anarchy possible) is a public good that a hegemon supplies and that is under-provided without one. Keohane holds that hegemony often plays an important role in creating a regime but is not needed to keep it going: states come to value the regime itself, so it can outlast the power that built it.
                </p>
                <PaperRun title="A regime each trade supplies.">
                    The substrate performs a regime function, credible commitment between strangers, that each trade supplies for itself. The credibility of an order is the bonds its own parties post. Its cost to them is the gas their calls consume (the network&rsquo;s charge for executing a call) and the time value of the bonded tokens while they stay locked. Each bond is refunded at resolution, the buyer&rsquo;s less the payment. A referee will ask who supplied the contracts. Publishing them is a single act, after which they run on the chain with no further provision, and anyone may publish another implementation of the same rules. This does not refute hegemonic stability theory, which concerns regimes constituted as institutions that must be funded, staffed, and defended. It identifies a coordination function realized as a property of each trade&rsquo;s bonds, to which the supply problem does not apply.
                </PaperRun>
                <PaperRun title="Why neither bloc need trust the other.">
                    Cooperation under anarchy classically needs a hegemon to enforce it or enough repeated interaction to make defection unprofitable. The substrate needs neither, because the equilibrium of Section 4 holds inside a single process. No continuation value runs from one process into the next, and the coupling among a process&rsquo;s sellers lasts exactly as long as the process stands open. A Chinese exporter and an Indian importer who expect never to trade again, and who trust no common institution, hold inside their process the same equilibrium as parties who trade through a process while embedded in a dense web of repeated trades. For the second pair, repetition adds reputation to the equilibrium, and the equilibrium does not need it. Keohane&rsquo;s regimes often owe their origin to a hegemon; the substrate&rsquo;s credibility owes its origin to the bonds of each trade.
                </PaperRun>
            </PaperSection>

            <PaperSection title="6. Why States May Resist, and Why Adoption Does Not Depend on Them">
                <p>
                    A substrate that takes no position is not obviously in the interest of the states sponsoring the corridors. The weaponized-interdependence literature is clear that states value chokepoints: the leverage is an asset of statecraft, and a sponsor has little reason to welcome a layer that holds none for it. If adoption depended on state sponsorship, the prediction would be non-adoption.
                </p>
                <PaperRun title="Adoption is participant-level, not state-level.">
                    Adoption depends on participants, because the substrate is permissionless: a participant adopts it by posting a bond and signing a commitment, without any state&rsquo;s endorsement. The adopters are firms and traders, the parties who bear the chokepoint exposure and gain from leaving it: this is Hirschman&rsquo;s (1970) <em>exit</em> in its commercial form. When the cost of staying within a sponsor-controlled coordination layer exceeds the cost of leaving, participants exit to the substrate, and each can do so alone. The exit is partial: a firm leaves the chokepoint at the coordination layer while still using the physical corridor.
                </PaperRun>
                <p>
                    Can a state not forbid its residents to use the substrate? It can: through its law over its own residents, through the ramps, through an issuer it governs over every trade in that issuer&rsquo;s token, and through validators and conveniences in its jurisdiction, which can delay what they carry. Inside the substrate it holds the calls any wallet holds, over its own trades. What a participant leaves is the sponsor&rsquo;s hold over enforcement and data; the law over the participant, and every sanction it carries, stays where it was.
                </p>
                <PaperRemark title="Every wallet holds the same calls over its own trades.">
                    Every wallet, a state&rsquo;s included, holds the same calls over its own trades and none over another wallet&rsquo;s process. An instrument aimed at a rival needs a lever over the rival&rsquo;s trades; inside the substrate each wallet&rsquo;s calls reach only its own trades, and the issuer&rsquo;s lever, which the boundary states, enters through the denomination the parties chose. The substrate is adopted trade by trade, by whoever finds the exit worthwhile, so the argument favors neither corridor.
                </PaperRemark>
            </PaperSection>

            <PaperSection title="7. Conclusion">
                <p>
                    The Belt and Road Initiative and the India&ndash;Middle East&ndash;Europe Economic Corridor are debated as rival routes, but they are rival architectures of dependence, each premised on a coordination layer that belongs to the corridor&rsquo;s sponsor. A decentralized, permissionless substrate denies the premise at that layer: every position in it belongs to a party to the trade it carries, and its view is the same for everyone. The physical corridor, the denomination, and the ramps stay where they were, and an issuer&rsquo;s lever still reaches through. The argument is architectural, not a forecast of adoption. Its judgment is that the coordination layer is the contingent part of corridor dependence: the corridors will continue to compete, and the substrate beneath them need not take a side.
                </p>
            </PaperSection>
        </PaperLayout>
    );
}
