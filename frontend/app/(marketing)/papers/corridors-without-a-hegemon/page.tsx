import type { Metadata } from "next";
import {
    PaperLayout,
    PaperSection,
    PaperRun,
    PaperRemark,
} from "@/components/papers/PaperLayout";

export const metadata: Metadata = {
    title: "Corridors Without a Hegemon — Figaro Protocol",
    description:
        "The Belt and Road Initiative and the India-Middle East-Europe Economic Corridor are rival infrastructure-power projects in which control of the corridor is the geopolitical prize. An ownerless bonded settlement substrate can be common ground beneath them precisely because it takes no position and nobody owns it: it neutralizes the settlement-layer chokepoint while leaving the physical corridor exactly as contested as it was.",
};

export default function CorridorsWithoutAHegemonPaper() {
    return (
        <PaperLayout slug="corridors-without-a-hegemon"
            title="Corridors Without a Hegemon"
            subtitle="Bonded Settlement as Common Infrastructure Beneath Rival Trade Corridors"
            author="Alessandro Daliana"
            date="May 2026"
            watermark="Figaro Protocol · Preprint"
            keywords="weaponized interdependence, hegemony, Belt and Road Initiative, IMEC, infrastructure power, cooperation under anarchy, ownerless settlement"
            abstract={
                <>
                    <p>
                        Two rival trade-corridor megaprojects organize the present contest over the physical and digital infrastructure of global commerce: China&rsquo;s Belt and Road Initiative and the United States&ndash;India&ndash;European Union-backed India&ndash;Middle East&ndash;Europe Economic Corridor. Both are, in the precise sense developed by the literature on weaponized interdependence, projects in which control of the corridor is itself the geopolitical prize: the sponsoring power builds the rails, the ports, the fiber, and the clearing arrangements, and the resulting dependence becomes an instrument of statecraft. A partner state choosing a corridor is not only choosing a route; it is choosing whose chokepoint it will sit behind.
                    </p>
                    <p>
                        This paper observes that the dependence has distinct layers, and that they need not move together. The <em>physical</em> layer &mdash; ports, railways, pipelines, undersea cable &mdash; is built and controlled by whoever finances it, and an ownerless settlement primitive does nothing to change that. The <em>settlement and coordination</em> layer &mdash; how a bonded commitment between an exporter in one bloc and an importer in another is enforced, cleared, and made tamper-evident &mdash; need not inherit the control structure of the physical layer. A settlement substrate that has no owner, no admin, no clearing intermediary, and no registry any party controls cannot be weaponized as a chokepoint, because there is no position from which to weaponize it.
                    </p>
                    <p>
                        The claim is therefore bounded and is stated as such. The bonded substrate can be common ground beneath rival corridors &mdash; the one layer both blocs&rsquo; participants can use without either bloc controlling it &mdash; precisely because the kernel takes no position and nobody owns it. It does not neutralize the physical corridor, does not end great-power competition over routes and ports, and is not an instrument by which one corridor defeats another. It relocates a single variable: the settlement-layer chokepoint, which prior architectures treated as necessarily belonging to whoever operated the coordination platform, becomes a thing no one operates.
                    </p>
                </>
            }
            references={
                <>
                    <li>Farrell, H. &amp; Newman, A. L. Weaponized Interdependence: How Global Economic Networks Shape State Coercion. <em>International Security</em>, 44(1):42&ndash;79, 2019.</li>
                    <li>Gramsci, A. <em>Selections from the Prison Notebooks</em>. Ed. and trans. Q. Hoare &amp; G. Nowell-Smith. International Publishers, New York, 1971.</li>
                    <li>Hirschman, A. O. <em>National Power and the Structure of Foreign Trade</em>. University of California Press, Berkeley, 1945.</li>
                    <li>Hirschman, A. O. <em>Exit, Voice, and Loyalty: Responses to Decline in Firms, Organizations, and States</em>. Harvard University Press, Cambridge, MA, 1970.</li>
                    <li>Hussain, A. &amp; Shafer, N. <em>The India&ndash;Middle East&ndash;Europe Economic Corridor: Connectivity in an Era of Geopolitical Uncertainty</em>. Atlantic Council, Washington, DC, 2025. [Report.]</li>
                    <li>Keohane, R. O. <em>After Hegemony: Cooperation and Discord in the World Political Economy</em>. Princeton University Press, Princeton, 1984.</li>
                    <li>Rolland, N. <em>China&rsquo;s Eurasian Century? Political and Strategic Implications of the Belt and Road Initiative</em>. The National Bureau of Asian Research, Seattle, 2017.</li>
                    <li>Strange, S. <em>States and Markets</em>. Pinter Publishers, London, 1988.</li>
                </>
            }
        >
            <PaperSection title="1. Introduction">
                <p>
                    The infrastructure of global commerce is again a theater of great-power competition. Two corridor projects dominate the present contest. China&rsquo;s Belt and Road Initiative, launched in 2013, has enrolled cooperation agreements with roughly one hundred and fifty states (as of 2024) and some thirty international organizations, financing ports, railways, pipelines, power generation, and digital infrastructure across Asia, Africa, Europe, and Latin America, with cumulative engagement since its launch estimated in excess of one trillion United States dollars. The India&ndash;Middle East&ndash;Europe Economic Corridor, announced as a memorandum of understanding on the sidelines of the 2023 G20 summit in New Delhi by India, the United States, Saudi Arabia, the United Arab Emirates, the European Union, France, Germany, and Italy, proposes a rail-and-shipping spine linking India through the Gulf to Europe, explicitly framed by several of its sponsors as a counter-offer to the Belt and Road.
                </p>
                <p>
                    The two projects are usually compared as routes &mdash; which is faster, which is cheaper, which is more resilient. The political-science literature on economic networks suggests a different comparison. Both projects are instances of what Farrell &amp; Newman (2019) call <em>weaponized interdependence</em>: the construction of economic networks whose chokepoints the constructing power can later exploit for coercion or surveillance. On this reading the corridor is not merely a route; it is a structure of dependence, and the dependence is the point. A state that ships through a corridor someone else controls has handed that someone a lever &mdash; over clearing, over data, over the continued operation of the route itself. The canonical demonstration is financial: the dominance of a single interbank-messaging network has repeatedly been converted into a sanctions instrument, with targeted banks disconnected from it as an act of statecraft. The corridor projects extend the same logic from finance to physical and digital trade infrastructure.
                </p>
                <p>
                    This paper makes a layered observation. The dependence a corridor creates is not monolithic; it decomposes into a physical layer and a settlement-coordination layer, and these need not share a control structure. The physical layer is owned by whoever financed it, and an ownerless settlement primitive changes nothing about that. But the settlement-coordination layer &mdash; the enforcement of cross-bloc commercial commitments, the clearing of payment against performance, the production of tamper-evident records of who did what &mdash; has historically been bundled with the physical layer and operated by the sponsoring power or by a platform under its influence. That bundling is a design contingency, not a necessity. A bonded settlement substrate with no owner and no operator unbundles it.
                </p>
                <PaperRun title="The thesis.">
                    (1) Both corridor projects are infrastructure-power projects in which control of the corridor &mdash; including its settlement and coordination layer &mdash; is a geopolitical instrument. (2) The settlement-coordination layer need not inherit the physical layer&rsquo;s control structure: a substrate that has no owner, admin, clearing intermediary, or party-controlled registry presents no chokepoint to seize. (3) Such a substrate can therefore be <em>common ground</em> beneath rival corridors &mdash; the one layer participants on both sides can use without either bloc controlling it &mdash; precisely because the kernel takes no position and nobody owns it.
                </PaperRun>
            </PaperSection>

            <PaperSection title="2. Two Corridors as Infrastructure-Power Projects">
                <PaperRun title="The Belt and Road as structural power.">
                    The Belt and Road Initiative is most usefully read through Strange&rsquo;s (1988) account of <em>structural power</em>: the power to shape the frameworks within which others operate, as distinct from the relational power to compel a specific act. Strange identified four structural domains &mdash; security, production, finance, and knowledge &mdash; and the Belt and Road operates across all four at once. It finances production capacity, denominates and clears a growing share of the resulting trade, builds the digital infrastructure through which the trade is coordinated, and, through long-term concessions over ports and corridors, acquires a security-adjacent foothold. The reading of the Belt and Road as a grand strategy rather than a purely commercial program is by now well established in the scholarly literature (Rolland, 2017). The recurring critique &mdash; that infrastructure lending produces dependence that can later be leveraged &mdash; is precisely the weaponized-interdependence concern (Farrell &amp; Newman, 2019) applied to physical and financial infrastructure rather than to interbank messaging. Whether any particular instance of leverage has been exercised is contested and beside the present point; what matters here is that the <em>architecture</em> concentrates the capacity for leverage in the sponsoring power, by design.
                </PaperRun>
                <PaperRun title="IMEC as counter-architecture.">
                    The India&ndash;Middle East&ndash;Europe Economic Corridor was announced on 9 September 2023 as a coalition counter-offer. Its sponsors present it as a more open, rules-based alternative; its structure, however, exhibits the same layering. The corridor&rsquo;s value depends on a chain of bilateral arrangements &mdash; Indian ports, Gulf rail, Israeli and Mediterranean shipping, European terminals &mdash; each governed by the coalition states and their preferred operators, and the corridor&rsquo;s realization was tied to a regional-normalization track whose disruption after the October 2023 outbreak of war in Gaza left the project substantially stalled, though not formally abandoned (Hussain &amp; Shafer, 2025). The fragility is instructive: a corridor assembled from state-controlled bilateral links is only as coordinated as the political relationships among its sponsors, and those relationships are exactly what an adversary or an exogenous shock can disrupt. The counter-architecture answers the question &ldquo;whose corridor&rdquo; with a different coalition, not with a different <em>kind</em> of control.
                </PaperRun>
                <PaperRun title="The common logic.">
                    Beneath the rivalry, the two projects share a premise: that the coordination layer of a trade corridor belongs to whoever sponsors the corridor. This premise is Gramscian in form (Gramsci, 1971) &mdash; infrastructure as a vehicle of hegemony, the building of the rails as simultaneously the building of consent to the rail-builder&rsquo;s framework &mdash; and it is what makes corridor competition zero-sum at the coordination layer. If the coordination layer must belong to someone, then every state must choose whose framework to operate within, and the choice is a geopolitical alignment. The premise is so deeply assumed that the corridor projects are debated entirely within it: the question is always <em>which</em> hegemon&rsquo;s coordination layer, never <em>whether</em> the coordination layer must have a hegemon at all.
                </PaperRun>
            </PaperSection>

            <PaperSection title="3. The Chokepoint Logic and the Partner&rsquo;s Dilemma">
                <p>
                    The mechanism by which a corridor&rsquo;s coordination layer becomes an instrument of power is the chokepoint. Farrell &amp; Newman (2019) formalize the intuition: economic networks develop hubs through which a disproportionate share of flows must pass, and the state with jurisdiction over a hub acquires two capabilities &mdash; a <em>panopticon effect</em> (it can observe the flows) and a <em>chokepoint effect</em> (it can interrupt them). The displacement of targeted banks from interbank messaging is the textbook case: a network built for efficiency became, in the hands of the state with jurisdiction over it, a coercive instrument &mdash; Iranian banks were disconnected in 2012 and again in 2018, and seven major Russian banks in 2022. The lesson generalizes. Any coordination layer with a controllable hub is a latent chokepoint, and building the hub is building the lever.
                </p>
                <PaperRun title="The partner&rsquo;s dilemma.">
                    A state or firm contemplating a corridor faces a dilemma the route-comparison framing conceals. Using a corridor means routing commercial coordination &mdash; settlement, clearing, dispute resolution, the record of performance &mdash; through infrastructure the corridor&rsquo;s sponsor controls or strongly influences. The immediate gains (lower cost, faster transit, financing) are paid for with a standing exposure: the sponsor acquires, over the life of the relationship, the capacity to observe and to interrupt. The dilemma has no satisfactory resolution within the assumption that the coordination layer must belong to someone. Diversifying across corridors reduces dependence on any one sponsor but multiplies the number of chokepoints one sits behind; building a sovereign coordination layer is beyond the means of most states and merely relocates the chokepoint for those that can. Hirschman (1945) described the underlying structure eight decades ago: the gains from trade and the political dependence trade creates are produced by the same flows, so a state cannot capture the former without incurring the latter &mdash; unless the structure of the flow is changed.
                </PaperRun>
                <PaperRun title="The platform variant.">
                    A recent attempt to change the structure illustrates the failure mode the bonded substrate avoids. A consortium-operated shipping-data platform sought to provide a neutral coordination layer for container logistics, but it was operated by an identifiable joint venture, and rival carriers, unwilling to route their commercial data through infrastructure a competitor co-owned, declined to depend on it or backed a rival consortium instead; the platform was wound down. The episode is not evidence that neutral coordination is impossible; it is evidence that an <em>operated</em> coordination layer cannot be neutral, because the operator is always someone, and someone&rsquo;s control is exactly the exposure participants will not accept. A coordination layer that is operated has an operator; an operator can be acquired, sanctioned, subpoenaed, or simply distrusted. Neutrality at the coordination layer is unavailable to any architecture that has an operator at all.
                </PaperRun>
            </PaperSection>

            <PaperSection title="4. The Settlement Layer as Common Ground">
                <p>
                    The bonded settlement primitive offers a coordination layer with no operator. Its enforcement is not a service rendered by an intermediary but a property of the bond structure: each party to a cross-bloc commitment locks bonds, and the structure makes cooperation the dominant strategy for both without any third party adjudicating, clearing, or releasing funds. There is no admin, no owner, no governance body, no fee parameter under anyone&rsquo;s control, and no registry whose entries a controlling party can alter or deny &mdash; registrations are permissionless. Because there is no position from which the layer is operated, there is no position from which it can be weaponized. The equilibrium that makes cooperation dominant holds under perfect monitoring with costless performance; what the bonds price is settlement discipline, and an honest dispute over whether a cross-bloc commitment was performed as agreed is adjudicated by whatever forum the parties compose above the layer, not by the layer itself.
                </p>
                <PaperRun title="The chokepoint dissolves, not relocates.">
                    The significance is that the chokepoint does not move to a new owner; it ceases to exist. A sanctions instrument requires a hub with a jurisdiction over it; an ownerless settlement primitive has neither a hub that concentrates flows nor a jurisdiction that controls the hub. The panopticon effect is bounded to what is intrinsically public (the existence and resolution of bonded commitments, visible to anyone, belonging to no one) rather than privately surveilled by a hub operator; the chokepoint effect is absent, because interruption would require a controlling position the architecture does not contain. This is the precise content of the claim that the substrate can be common ground: not that it is governed neutrally by a trusted authority, but that it is governed by no one, which is the only form of neutrality the partner&rsquo;s dilemma can accept.
                </PaperRun>
                <PaperRun title="The graph is the politics.">
                    The kernel is ideologically agnostic; the graph is the politics. It takes no position on currency, jurisdiction, identity, arbitration forum, role structure, or contribution metric &mdash; all of which are expressed in the assembly a particular set of parties composes on top of it. A Belt-and-Road-flavored assembly &mdash; renminbi-denominated, with Chinese arbitral forums named in its dispute clauses and Chinese sellers in its roles &mdash; and an IMEC-flavored assembly &mdash; dollar- or euro-denominated, with coalition forums and coalition sellers &mdash; are different graphs composed on the <em>same</em> kernel. The kernel enforces both with the same arithmetic and prefers neither. Two parties on opposite sides of the corridor rivalry, who agree on nothing else and trust no shared institution, can nonetheless share the settlement substrate, because sharing it commits them to nothing beyond the bond they have each posted. The politics lives in the graph each composes; the common ground is the layer beneath both graphs that makes no political choice of its own.
                </PaperRun>
                <PaperRemark title="What remains contested.">
                    The substrate does not pacify the corridor. The ports are still owned, the rail is still financed by someone, the physical routes still run through territory that can be closed, and the great-power competition over who builds the next corridor is untouched. A bonded commitment whose physical performance depends on a closed strait is not rescued by the settlement layer&rsquo;s neutrality; the buyer&rsquo;s recourse against non-performance is the forfeited bond, not the reopening of the strait. The claim is strictly that the settlement-and-coordination chokepoint &mdash; the SWIFT-shaped lever, the platform-operator lever &mdash; is removed. The physical chokepoint is exactly as contested as it was. Confusing the two would overclaim the result into something the architecture does not deliver.
                </PaperRemark>
            </PaperSection>

            <PaperSection title="5. Cooperation Without a Hegemon">
                <p>
                    The deeper political-science question is whether coordination at scale can survive the absence of a coordinating power. Keohane&rsquo;s (1984) <em>After Hegemony</em> is the canonical treatment: international regimes &mdash; the rules, norms, and institutions that make cooperation under anarchy possible &mdash; can persist after the hegemon that created them declines, because states come to value the regime itself, but the regime had to be <em>supplied</em> by a hegemon in the first place. The supply problem is the crux. A regime is a public good; absent a hegemon willing to bear the cost of provision, the standard prediction is under-provision. Keohane&rsquo;s contribution was to show that an already-supplied regime can outlast its supplier; he did not claim regimes arise without one.
                </p>
                <PaperRun title="A regime no one supplies.">
                    The bonded substrate occupies a position the hegemonic-stability framing does not anticipate: it performs a regime-function &mdash; making credible commitment between strangers possible &mdash; without anyone supplying it as a public good. The credibility is not provided by an institution that must be funded, staffed, and defended; it is a property of the bond arithmetic, which costs its provider nothing because it has no provider. The substrate is not a hegemon&rsquo;s gift that might outlast the hegemon; it is a coordination capacity that never required a hegemon to exist. This does not refute hegemonic-stability theory, which concerns regimes constituted as institutions; it identifies a coordination function realizable as a substrate property rather than as an institution, and to which the supply problem therefore does not apply.
                </PaperRun>
                <PaperRun title="Why neither bloc need trust the other.">
                    Cooperation under anarchy classically requires either a hegemon to enforce it or sufficient repeated interaction to make defection unprofitable. The bonded substrate requires neither. The equilibrium that makes cooperation dominant is one-shot and bilateral: it does not depend on the parties&rsquo; sharing a community, a jurisdiction, a hegemon, or a future. A Chinese exporter and an Indian importer who expect never to transact again, who trust no common institution, and who sit on opposite sides of the corridor rivalry, can nonetheless transact with the same security as parties embedded in a dense web of repeated dealings. The substrate supplies the missing enforcement that, in the hegemonic account, only a hegemon or a repeated game could supply &mdash; and it supplies it without being a hegemon and without requiring a repeated game. The cooperation is genuinely <em>without a hegemon</em>, in a sense stronger than Keohane&rsquo;s after-hegemony regimes, which still presuppose one in their origin.
                </PaperRun>
            </PaperSection>

            <PaperSection title="6. Why States May Resist, and Why It Is Adopted Anyway">
                <p>
                    A neutral settlement layer is not obviously in the interest of the states sponsoring the corridors, and the argument is weaker for pretending otherwise. The weaponized-interdependence literature is clear that states <em>value</em> chokepoints; the leverage is an asset of statecraft, and a sponsoring power has little reason to welcome infrastructure that dissolves the asset it spent to build. If adoption depended on state sponsorship, the prediction would be non-adoption.
                </p>
                <PaperRun title="Adoption is participant-level, not state-level.">
                    Adoption does not depend on state sponsorship, and this is the structural point. The bonded substrate is permissionless: a participant adopts it by posting a bond and signing a commitment, not by securing a state&rsquo;s endorsement. The relevant adopters are therefore firms and traders &mdash; the parties who bear the chokepoint exposure and gain from escaping it &mdash; rather than the states who benefit from maintaining it. This is Hirschman&rsquo;s (1970) <em>exit</em> in its commercial form: when the cost of remaining within a sponsor-controlled coordination layer (the standing exposure to its chokepoint) exceeds the cost of leaving, participants exit to the substrate, and they can do so unilaterally because the substrate asks no one&rsquo;s permission. The exit is partial &mdash; a firm exits the settlement chokepoint without exiting the physical corridor, which it still uses &mdash; and it is available to participants on both sides of the rivalry independently.
                </PaperRun>
                <PaperRemark title="The substrate is not a policy instrument.">
                    Because adoption is participant-level and permissionless, the substrate is not an instrument any state or coalition can wield, including against the other. There is no version of &ldquo;deploying&rdquo; the substrate as a counter-corridor strategy, because there is nothing to deploy and no one to deploy it; it is adopted transaction by transaction by whoever finds the exit worthwhile. This is why the argument cannot be read as favoring one corridor over another. A policy instrument has a wielder; the substrate has none, and an architecture with no wielder cannot be aimed.
                </PaperRemark>
            </PaperSection>

            <PaperSection title="7. What This Paper Is Not">
                <PaperRun title="Not a prediction of geopolitical outcomes.">
                    The paper does not predict that participants will adopt the substrate at corridor scale, that either corridor will be reshaped by it, or that great-power competition over trade infrastructure will abate. The argument is conceptual: the option of an ownerless settlement layer exists, is structurally distinct from platform-operated coordination, and changes which part of corridor dependence is contingent. Whether the option is taken up is an empirical matter the paper does not forecast.
                </PaperRun>
            </PaperSection>

            <PaperSection title="8. Conclusion">
                <p>
                    The Belt and Road Initiative and the India&ndash;Middle East&ndash;Europe Economic Corridor are debated as rival routes, but they are more precisely rival architectures of dependence, each premised on the assumption that the coordination layer of a trade corridor must belong to whoever sponsors the corridor. The premise makes corridor competition zero-sum at the coordination layer and forces every state into an alignment it might prefer to avoid. The bonded settlement substrate denies the premise. The coordination layer can be operated by no one, and a layer operated by no one presents no chokepoint to seize, no hub to surveil, and no operator to coerce or distrust. It can therefore be common ground beneath rival corridors.
                </p>
                <p>
                    The chokepoint &mdash; the structural instrument of infrastructure power &mdash; becomes nonexistent rather than relocated when the coordination layer has no operator. The kernel makes no political choice, and the politics lives in the graph composed upon it. The corridors will continue to compete. The settlement layer beneath them need not.
                </p>
            </PaperSection>
        </PaperLayout>
    );
}
