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
    title: "From Firms to Transaction-Scoped Institutions — Figaro Protocol",
    description:
        "A Coasean re-examination: when bilateral enforcement collapses to a fixed 2x capital lockup, the firm's subordination overlay loses its cost advantage. The firm is demoted from privileged organizational container to one pattern among several — assemblies, treasury communities, peer networks, agent coalitions.",
};

export default function TransactionScopedInstitutionsPaper() {
    return (
        <PaperLayout slug="transaction-scoped-institutions"
            title="From Firms to Transaction-Scoped Institutions"
            subtitle="A Coasean Re-Examination Under Costless Bilateral Enforcement"
            author="Alessandro Daliana"
            date="April 2026"
            watermark="Figaro Protocol · Preprint"
            keywords="transaction cost economics, theory of the firm, subordination, coordination economics, organizational substrate, institutional economics"
            abstract={
                <>
                    <p>
                        Coase (1937) argued that firms exist because the cost of discovering prices, negotiating terms, and enforcing contracts in open markets sometimes exceeds the cost of hierarchical management. Williamson (1985) refined this into Transaction Cost Economics (TCE), identifying asset specificity, uncertainty, and frequency as drivers of vertical integration. Hart (1995) located the firm boundary at the allocation of residual control rights over non-contractible decisions. Across these traditions, a common premise is that contract enforcement between strangers is costly, slow, and jurisdiction-dependent. This paper examines what happens to the boundary of the firm when one of those underlying costs collapses to a fixed, jurisdiction-displaced capital lockup.
                    </p>
                    <p>
                        We take as given the existence of a settlement primitive &mdash; one whose bonding equilibrium admits formal proof &mdash; that prices the cost of trust at exactly <Math>{"2\\times"}</Math> the transaction value in temporarily locked capital, with no recurring extraction, no arbitrator, and no jurisdictional dependency. Treating this primitive as exogenous, we ask two questions. First, what does the existence of such a primitive imply for the Coasean threshold that defines the boundary of the firm? Second, what is the firm&rsquo;s status in the organizational space once that threshold has shifted?
                    </p>
                    <p>
                        Our argument is that the firm has always been a coordination mechanism with a particular layer added &mdash; <em>subordination</em>: the organization of labor and assets under an ownership nucleus that retains residual control rights and captures residual output. In Coase&rsquo;s analysis, the subordination layer is not incidental; it is load-bearing, because enforcement between non-subordinated counterparties was costly in the pre-primitive regime. A fixed-cost bilateral-bond settlement primitive prices that enforcement directly. The subordination layer loses its cost advantage for the class of transactions identified below; what emerges is not the abolition of the firm, but its demotion from the privileged organizational container to one pattern among several. How this demotion looks from the outside is a political-economy question; the present paper is internal institutional-economics.
                    </p>
                </>
            }
            references={
                <>
                    <li>Coase, R. H. The Nature of the Firm. <em>Economica</em>, 4(16):386&ndash;405, 1937.</li>
                    <li>Grossman, S. J. &amp; Hart, O. D. The Costs and Benefits of Ownership: A Theory of Vertical and Lateral Integration. <em>Journal of Political Economy</em>, 94(4):691&ndash;719, 1986.</li>
                    <li>Gibbons, R. Four Formal(izable) Theories of the Firm? <em>Journal of Economic Behavior &amp; Organization</em>, 58(2):200&ndash;245, 2005.</li>
                    <li>Hansmann, H. <em>The Ownership of Enterprise</em>. Harvard University Press, Cambridge, MA, 1996.</li>
                    <li>Hart, O. <em>Firms, Contracts, and Financial Structure</em>. Oxford University Press, 1995.</li>
                    <li>Hart, O. &amp; Moore, J. Property Rights and the Nature of the Firm. <em>Journal of Political Economy</em>, 98(6):1119&ndash;1158, 1990.</li>
                    <li>Holmstrom, B. &amp; Roberts, J. The Boundaries of the Firm Revisited. <em>Journal of Economic Perspectives</em>, 12(4):73&ndash;94, 1998.</li>
                    <li>Macneil, I. R. <em>The New Social Contract: An Inquiry into Modern Contractual Relations</em>. Yale University Press, New Haven, 1980.</li>
                    <li>Ostrom, E. <em>Governing the Commons: The Evolution of Institutions for Collective Action</em>. Cambridge University Press, Cambridge, 1990.</li>
                    <li>Pacioli, L. <em>Summa de Arithmetica, Geometria, Proportioni et Proportionalita</em>. Paganinus de Paganinis, Venice, 1494.</li>
                    <li>Robertson, B. J. <em>Holacracy: The New Management System for a Rapidly Changing World</em>. Henry Holt and Company, New York, 2015.</li>
                    <li>Schelling, T. C. <em>The Strategy of Conflict</em>. Harvard University Press, Cambridge, MA, 1960.</li>
                    <li>Tadelis, S. &amp; Williamson, O. E. Transaction Cost Economics. In R. Gibbons &amp; J. Roberts (eds.), <em>Handbook of Organizational Economics</em>, chapter 4. Princeton University Press, Princeton, NJ, 2013.</li>
                    <li>Williamson, O. E. <em>The Economic Institutions of Capitalism</em>. Free Press, New York, 1985.</li>
                </>
            }
        >
            <PaperSection title="1. Introduction">
                <p>
                    The boundary of the firm has been the central object of theoretical attention in organizational economics since Coase (1937). Williamson&rsquo;s Transaction Cost Economics (Williamson, 1985) identified asset specificity, uncertainty, and frequency as the conditions under which hierarchical governance dominates market exchange. The property-rights theory (Hart, 1995) located the firm boundary at the allocation of residual control rights over non-contractible decisions. Across these traditions, a common premise is that market contracting between strangers is expensive: search is costly, negotiation is costly, and enforcement &mdash; through courts, arbitrators, or platforms &mdash; is costly, slow, and jurisdiction-dependent.
                </p>
                <p>
                    This paper asks what happens to that boundary when one of the underlying costs &mdash; contract enforcement between mutually distrusting parties &mdash; collapses to a fixed, jurisdiction-displaced capital lockup. The collapse is not a thought experiment: the mechanism admits formal proofs of cooperation as the unique surviving equilibrium.
                </p>
                <p>
                    We treat that primitive as exogenous. The contribution of this paper is institutional-economic: given the primitive, what follows for the theory of the firm? We argue two things. First, the Coasean threshold shifts inward &mdash; narrowly, in a precise sense we make explicit. Second, the firm ceases to be the privileged organizational container in the region where the threshold has shifted; it becomes one pattern among several, sharing the organizational space with treasury communities, peer networks, transaction-scoped assemblies, agent coalitions, and forms whose naming is yet to stabilize.
                </p>
                <PaperRun title="Paper organization.">
                    Section 2 summarizes the settlement primitive, taking its formal development as given. Section 3 develops the Coasean threshold shift. Section 4 treats the firm as one organizational pattern among many, introducing subordination as the variable whose cost advantage the primitive erases, and developing the three concrete implications for property-rights theory and for the unit of coordination. Section 5 examines token denomination as a coordination signal that supplants standing platform credentialing. Section 6 concludes.
                </PaperRun>
            </PaperSection>

            <PaperSection title="2. The Settlement Primitive">
                <p>
                    The settlement primitive composes two mechanisms. <em>Asymmetric bonding</em> (Mechanism&nbsp;1) produces the bilateral Nash equilibrium and scales it to <Math>{"N"}</Math>-party processes; <em>buyer dominance with atomic resolution</em> (Mechanism&nbsp;2) lets only the buyer trigger resolution and settles all orders in a process simultaneously or not at all. We summarize below only the properties the present argument uses &mdash; the bonding equilibrium, the escape-hatch theorem, and the <Math>{"N"}</Math>-party extension are taken as given &mdash; and write &ldquo;Mechanism&nbsp;1&rdquo; and &ldquo;Mechanism&nbsp;2&rdquo; where the distinction is load-bearing.
                </p>
                <PaperRun title="Asymmetric bonding.">
                    For a transaction with payment <Math>{"P > 0"}</Math> and cumulative upstream value <Math>{"G \\geq P"}</Math>, the buyer locks <Math>{"2P"}</Math> and the seller locks <Math>{"2G"}</Math>. Only the buyer can trigger resolution. On resolution, the buyer recovers <Math>{"P"}</Math> (net cost: <Math>{"-P"}</Math>) and the seller recovers <Math>{"2G + P"}</Math> (net gain: <Math>{"+P"}</Math>). On non-resolution, both bonds remain locked indefinitely.
                </PaperRun>
                <PaperRun title="Equilibrium properties.">
                    In the resulting one-shot bonding game, cooperation weakly dominates defection for all parties, and the cooperative profile is the unique outcome surviving iterated elimination of weakly dominated strategies &mdash; the refinement that repeatedly discards any strategy that never does better and sometimes does worse. The result extends to <Math>{"N"}</Math>-party processes through <em>cumulative upstream bonding</em>, with the seller&rsquo;s risk-to-reward ratio growing with chain depth.
                </PaperRun>
                <PaperRun title="Atomic resolution and peer enforcement.">
                    All orders within a process resolve atomically &mdash; all or nothing &mdash; which induces a weakest-link subgame among sellers. This produces an endogenous coordination pressure analogous to peer enforcement in joint-liability microfinance, but obtained without repeated interaction, local information, or social punishment technology.
                </PaperRun>
                <PaperRun title="No escape hatches.">
                    The primitive has no timeout, no admin override, no governance mechanism, no protocol fee, and no upgrade path. The escape-hatch theorem shows that any such exit path weakens the equilibrium.
                </PaperRun>
                <PaperRun title="What the primitive does not provide.">
                    For the institutional argument that follows, two non-properties matter as much as the properties. The primitive does not provide capital aggregation across projects, does not provide pooled risk-bearing across uncorrelated ventures, and does not provide legal personhood for off-chain liability. We return to these absences in Section 4.
                </PaperRun>
            </PaperSection>

            <PaperSection title="3. The Coasean Threshold Shift">
                <p>
                    Coase&rsquo;s central insight is that firms exist because market transaction costs &mdash; searching for partners, negotiating terms, enforcing agreements &mdash; sometimes exceed the cost of hierarchical management. Williamson refined this into TCE, identifying three conditions under which hierarchical governance dominates market exchange: high asset specificity, high uncertainty, and high frequency.
                </p>
                <p>
                    The settlement primitive changes the calculus by collapsing one of these costs to a fixed, predictable capital lockup. Consider the three transaction costs separately.
                </p>
                <PaperRun title="Search costs.">
                    Public on-chain signals (settlement history, accepted-token lists, attested capabilities) allow autonomous discovery through shared coordination graphs. For agents able to read blockchain state, search cost approaches zero. The substantive change is not that search is cheaper &mdash; platforms already make search cheap &mdash; but that the search index is non-proprietary: no platform owns the discovery function, and the data is not extracted as rent.
                </PaperRun>
                <PaperRun title="Negotiation costs.">
                    Off-chain commitment building lets parties iterate on terms without on-chain cost. The negotiation is bilateral and direct; counterparties can discover and iterate through shared graph visibility rather than through a standing intermediary&rsquo;s matching function. The substantive change here is asymmetric: the <em>cost</em> of negotiating is roughly unchanged from web2 baselines, but the <em>counterparty space</em> from which one can negotiate is no longer mediated by a platform&rsquo;s terms of service.
                </PaperRun>
                <PaperRun title="Enforcement costs.">
                    This is the decisive variable. In the pre-primitive world, enforcement requires courts (slow, expensive, jurisdiction-dependent), arbitrators (trusted third parties), or standing intermediaries that internalize coordination and charge for it. The primitive prices enforcement at exactly <Math>{"2\\times"}</Math> the transaction value in temporarily locked capital &mdash; a fixed, predictable, jurisdiction-displaced cost requiring no third party.
                </PaperRun>
                <PaperRemark title="On the enforcement-cost accounting.">
                    The headline comparison uses the opportunity cost of the locked capital &mdash; roughly <Math>{"2P \\cdot rT"}</Math> for a lockup of <Math>{"2P"}</Math> held over the process duration <Math>{"T"}</Math> at the prevailing risk-free rate <Math>{"r"}</Math>, which is the substantive change relative to the prior regime. A full accounting adds smaller terms: on-chain transaction fees for entering and settling the commitment, slippage if the bond denomination must be acquired at transaction time, and the operational-security costs of key custody. The comparison below abstracts these because they are small relative to the standing-firm overheads against which it is made for the retail-scale transactions this paper treats; the abstraction should be revisited where any of them is comparable in magnitude to the lockup&rsquo;s opportunity cost.
                </PaperRemark>
                <div className="border-l-2 border-default pl-6 my-2 space-y-3">
                    <p className="text-sm font-semibold text-ink-heading">Proposition 3.1 (Coasean Threshold Shift).</p>
                    <p>
                        For any transaction where the opportunity cost of the capital lockup &mdash; approximately <Math>{"2P \\cdot rT"}</Math> for a lockup of <Math>{"2P"}</Math> over duration <Math>{"T"}</Math> at rate <Math>{"r"}</Math> &mdash; is less than the firm&rsquo;s coordination overhead for the same transaction, the rational organizational choice is market exchange via the primitive rather than hierarchical integration.
                    </p>
                </div>
                <p>
                    Proposition 3.1 is a comparative-statics statement, not a sweeping institutional prediction. It identifies a class of transactions for which the make-or-buy boundary tilts toward <em>buy</em>. The class is non-empty (most retail-scale transactions in mature financial environments satisfy it) and bounded (very-high-frequency, very-low-margin, or very-long-duration transactions do not). The proposition does not claim that all transactions migrate; it claims that the migration threshold is now defined by capital opportunity cost rather than by the cost of standing institutional infrastructure.
                </p>
                <PaperRun title="Engagement with TCE.">
                    Williamson&rsquo;s three drivers of vertical integration deserve direct treatment. <em>Asset specificity</em> continues to favor hierarchy: a specialized asset whose value is contingent on a specific counterparty cannot be efficiently coordinated through a sequence of short-lived bonded transactions, since the holdup risk is in the asset&rsquo;s pre-transaction sunk investment, not in the transaction itself. <em>Uncertainty</em> cuts both ways: contract incompleteness favors hierarchy, but the primitive&rsquo;s evidence trail (timestamped commitments, signed disclosures) reduces some classes of uncertainty &mdash; specifically those that hierarchical authority historically resolved by managerial fiat. <em>Frequency</em> is the condition under which the shift is most pronounced: high-frequency exchanges with low asset specificity are exactly where the standing firm&rsquo;s overhead is hardest to amortize and the primitive&rsquo;s per-transaction capital lockup is easiest to absorb.
                </PaperRun>
                <p>
                    The proposition therefore narrows rather than overturns TCE. It identifies a region of the asset-specificity / uncertainty / frequency space where hierarchical governance was previously the equilibrium outcome but is no longer. Tadelis &amp; Williamson (2013) update this picture for the contemporary literature, treating the transaction as the unit of analysis and the choice among market, hybrid, and hierarchy as turning on transaction attributes; Proposition 3.1 adds a new entry to that menu of governance modes &mdash; the bonded transaction-scoped assembly &mdash; whose attributes are different from any of the three Williamson catalogs.
                </p>
                <PaperRun title="Holmstrom and Roberts&rsquo; caution.">
                    Holmstrom &amp; Roberts (1998) argue that asset-specificity-based hold-up is not by itself sufficient to explain firm boundaries: firms also do work that markets do not, particularly in promoting cooperation and coordinating decisions that no single contract can fully specify. The caution applies to our argument: pricing enforcement addresses one component of the firm&rsquo;s bundle, not all of it. The cooperation-promotion component is discharged by the weakest-link subgame &mdash; each seller&rsquo;s payout depends on universal cooperation &mdash; rather than by a manager (Section&nbsp;4.2 develops this). The non-coordination components &mdash; capital aggregation, risk pooling, organizational knowledge &mdash; remain durable requirements, and we return to them in Section 4.
                </PaperRun>
            </PaperSection>

            <PaperSection title="4. The Firm as One Pattern Among Many">
                <p>
                    The implication of Proposition 3.1 is not that the firm dissolves but that the firm&rsquo;s status in the organizational space changes. The firm has always been a coordination mechanism. What distinguishes the modern corporate firm from older coordination forms &mdash; partnerships, guilds, cooperatives, market exchange &mdash; is not the coordination function itself but a particular overlay placed on top of it: <em>subordination</em>.
                </p>
                <PaperSubsection title="4.1 Subordination as the Variable">
                    <p>
                        By subordination we mean the allocation of labor and productive assets under a single ownership nucleus, combined with an employment contract that transfers residual output rights and residual control rights to that nucleus in exchange for a wage. In the Coasean analysis, subordination is not incidental to the firm; it is load-bearing. Prior to the settlement primitive, enforcement between non-subordinated counterparties was costly, and aggregation under an ownership nucleus that resolved enforcement internally through managerial authority was the institutional response.
                    </p>
                    <div className="border-l-2 border-default pl-6 my-2 space-y-3">
                        <p className="text-sm font-semibold text-ink-heading">Proposition 4.1 (Subordination as an Enforcement Economy).</p>
                        <p>
                            In the pre-primitive regime, subordination is a response to enforcement cost. The firm&rsquo;s subordination layer secures coordination between counterparties whose direct bilateral enforcement would be prohibitively costly, at the price of aggregating residual rights under a single nucleus. When bilateral enforcement is priced at a fixed capital lockup, the subordination layer loses its cost advantage in the region identified by Proposition 3.1.
                        </p>
                    </div>
                    <p>
                        Proposition 4.1 reframes what is dissolving. It is not the firm&rsquo;s coordination function that becomes unnecessary &mdash; coordination is still required. It is the subordination overlay &mdash; the transfer of residual control rights from the producing party to an ownership nucleus &mdash; that becomes economically optional where the primitive is applicable. What is left behind is coordination without subordination: the same productive assets, the same coordination requirements, but without the ownership aggregation that historically secured them.
                    </p>
                </PaperSubsection>
                <PaperSubsection title="4.2 What Emerges in the Shifted Region">
                    <p>
                        The viability of the alternative patterns named below rests on a property of the primitive that Section 2 introduced but that the Coasean argument of Section 3 did not yet deploy: atomic resolution. Mechanism&nbsp;1 (asymmetric bonding) supplies the bilateral equilibrium at every edge of an arbitrary multi-party process, but a mesh of independently secured bilateral edges is not by itself an organization &mdash; coordinating an <Math>{"N"}</Math>-party process to a single settlement under Mechanism&nbsp;1 alone would still require either a standing intermediary, an arbitrator, or an <Math>{"N"}</Math>-way mutual signing at the moment of resolution. Any of those three responses re-introduces the firm-shaped container under a different name. Mechanism&nbsp;2 (buyer dominance with atomic resolution) makes the mesh of edges resolvable as a unit at the buyer&rsquo;s signature, and the weakest-link subgame propagates cooperation pressure through the mesh without managerial authority or external choreography. The transaction-scoped assembly clears itself. The Coasean shift of Section 3 is what makes the assembly competitive with the firm at the cost margin; Mechanism&nbsp;2 is what makes the assembly structurally available at all.
                    </p>
                    <p>
                        Where subordination is no longer load-bearing, the firm becomes one organizational pattern among several. The organizational space in that region admits multiple viable coordination patterns that were previously suppressed by the enforcement-cost structure: transaction-scoped assemblies that form around a process and dissolve at settlement; standing treasury communities whose members recurrently participate in compatible multi-party processes; peer networks of independent bonded counterparties without a common treasury; agent coalitions mixing human, software, and machine participants. The firm continues to exist; it shares the space with these other forms rather than occupying it alone. Which form dominates for a given industry is an empirical question about the parameters of Proposition 3.1 and the non-coordination functions (capital aggregation, risk pooling, legal personhood) that the primitive does not itself address.
                    </p>
                    <PaperRun title="Hansmann&rsquo;s typology of ownership.">
                        The closest comparator in the existing literature is Hansmann (1996), who classifies firms by the patron class that holds residual claims and control rights: investor-owned, worker-owned, customer-owned, supplier-owned, and mutual. Each form is an ownership nucleus, and Hansmann&rsquo;s central observation is that one form dominates within an industry when the costs of contracting with the other patron classes exceed the costs of ownership by the dominant class. Transaction-scoped assemblies sit outside this typology: they have no standing residual claim to allocate, because resolution dissolves the per-process residual into deterministic per-order payouts, fixed at settlement. This is not a fifth Hansmann form; it is what becomes available when the residual-claim allocation question is discharged at settlement rather than carried over time. Hansmann&rsquo;s heterogeneity-cost objection to worker cooperatives &mdash; that collective decision-making among workers with different preferences is expensive enough to outweigh the benefits of worker ownership &mdash; does not bind here because the assembly&rsquo;s lifespan is bounded by a single process: there is no continuing collective decision to make. Where the assembly form is feasible and the firm form is not (the shifted region of Proposition 3.1), the assembly is chosen for the same Hansmann-style reason that a particular firm form is chosen elsewhere: the contracting costs against the alternative are higher.
                    </PaperRun>
                    <PaperRun title="Ostrom&rsquo;s design principles.">
                        Ostrom (1990) identifies eight design principles that long-enduring self-governing institutions tend to share: clearly defined boundaries, congruence between rules and local conditions, collective-choice arrangements, monitoring, graduated sanctions, conflict-resolution mechanisms, recognition by external authorities, and (for systems above a threshold size) nested enterprises. Transaction-scoped assemblies satisfy several of these structurally rather than by governance: boundaries are defined by who has signed a process commitment; sanctions are graduated by the bonded mesh&rsquo;s payoff structure (each seller&rsquo;s bond is forfeit, not penalty-as-a-policy); conflict resolution defaults to atomic resolution at the buyer&rsquo;s signature, with external legal forums available as evidentiary consumers of the bonded commitment. Other principles &mdash; collective choice, congruence with local conditions &mdash; are properties of the graph the parties compose on top of the kernel, not of the kernel itself. The point is not that the assembly is an Ostrom commons (it is not); it is that several Ostrom-identified properties of durable institutions appear here as architectural rather than as governance achievements.
                    </PaperRun>
                    <PaperRun title="Relational contracts and Macneil.">
                        The relational-contract literature (Macneil, 1980; Gibbons, 2005) treats long-running counterparty relationships as governance structures in their own right &mdash; self-enforcing through reputation and continuation value when formal contracting is incomplete. The bonded primitive does not replace relational contracting; it composes with it. A standing peer network or treasury community is precisely a long-running relationship in Macneil&rsquo;s sense, and the primitive supplies the per-transaction enforcement that the relational contract would otherwise have to underwrite via reputation. The two substitute for each other along one axis (formal enforcement of each transaction) and complement each other along another (the relational layer carries reputation; the bonded layer carries the equilibrium).
                    </PaperRun>
                    <PaperRun title="Holacracy as an intra-firm precedent.">
                        Intra-firm experiments with flat coordination &mdash; most visibly the Zappos adoption of Holacracy (Robertson, 2015) in 2014 &mdash; previewed what some of these patterns look like when they remain confined to a single ownership nucleus. Such experiments are informative as data points about what flat coordination requires operationally, but they are not what the primitive generalizes. Holacracy, once the subordination nucleus is retained, operates at the mercy of that nucleus. The primitive enables flat coordination where the nucleus itself is not required; that is a stronger condition than any intra-firm reform can provide.
                    </PaperRun>
                </PaperSubsection>
                <PaperSubsection title="4.3 Three Concrete Implications">
                    <PaperRun title="(a) The wallet is the unit of coordination.">
                        Each productive asset is represented directly by a wallet address. At the protocol tier the wallet can hold content-addressed credentials &mdash; attested capabilities, seller profiles, and (at the runtime tier) NFT-anchored deeds &mdash; that certify the asset&rsquo;s identity and performance history. In the firm model, the cook&rsquo;s skill, the kitchen&rsquo;s equipment, the courier&rsquo;s vehicle are subsumed under the firm&rsquo;s legal identity and cease to be individually addressable. In the wallet model, each asset is its own coordination endpoint. The productive asset <em>is</em> the identity; it remains an identity whether the firm persists or not.
                    </PaperRun>
                    <PaperRemark title="On the kernel / protocol / runtime distinction.">
                        We use the three-tier distinction throughout: the <em>kernel</em> is the irreducible settlement primitive, guaranteeing only the bond-and-settlement structure; the <em>protocol</em> adds the extension doctrine, where the attestation-and-credential layer is realized; the <em>runtime</em> adds the semantic and builder surfaces above it.
                    </PaperRemark>
                    <PaperRun title="(b) Tokens replace stock.">
                        Participants in the shifted region do not receive shares in a firm; they hold tokens denominated by the communities with which they coordinate. Token holdings signal community affiliation and participation-history, not residual-output ownership in a centralized nucleus. The relationship between productive asset and community is market-mediated rather than hierarchically internalized. Tokens are borderless, community-defined rather than jurisdiction-issued, and the community&rsquo;s definition is itself an open parameter.
                    </PaperRun>
                    <PaperRun title="(c) Actor type is neutral.">
                        Nothing in the primitive&rsquo;s coordination layer distinguishes an AI capable of bearing capital risk from a human capable of the same risk. A person with a law degree and an AI trained on legal precedent compete on identical terms &mdash; each as a bonded counterparty whose capabilities, if attested at all, are attested at the protocol tier rather than asserted at the kernel tier. Actor-type neutrality is a property of the kernel&rsquo;s coordination layer, not a policy choice; it follows directly from the kernel&rsquo;s indifference to what sits behind a wallet.
                    </PaperRun>
                </PaperSubsection>
                <PaperSubsection title="4.4 Engagement with the Property-Rights Tradition">
                    <p>
                        The property-rights tradition (Hart, 1995; Grossman &amp; Hart, 1986; Hart &amp; Moore, 1990) locates the firm boundary at the allocation of residual control rights over non-contractible decisions. The primitive does not abolish non-contractibility; rather, it changes <em>where</em> residual control rights are allocated, and it narrows the temporal window over which they are exercised. In the firm model, those rights are allocated to the ownership nucleus and exercised continuously through managerial authority. In the wallet model, they are allocated to whoever controls the wallet &mdash; which, under self-sovereign key management and NFT-anchored credentials, is the productive asset itself (or the individual operating it) &mdash; and Mechanism&nbsp;2 closes the temporal window: atomic resolution dissolves the per-process residual claim into deterministic per-order payouts at settlement, leaving no ongoing residual that requires standing custody. Residual control rights do not disappear; they are held by the asset rather than aggregated under an ownership layer, and the per-process residual claim is discharged at the moment of resolution rather than accumulated over time.
                    </p>
                    <p>
                        This is the institutional-economics translation of what Section 4 has been describing throughout: the decision about who holds residual rights, previously answered by the firm&rsquo;s ownership structure, is now a property of the asset&rsquo;s wallet architecture. This relocates the allocation question rather than dissolving it; Hart &amp; Moore (1990) applies to the wallet-layer question just as it applied to the firm-layer question before, with a different set of empirical facts about costs and observability.
                    </p>
                    <PaperRun title="Williamson&rsquo;s drivers, revisited.">
                        Our treatment of Williamson&rsquo;s three drivers (Section 3) likewise does not dissolve TCE; it relocates the question. Asset specificity continues to matter wherever a productive asset&rsquo;s value is contingent on a specific bond-specific investment; the primitive does not change that. What changes is that the institutional response to asset specificity need not be subordination under an ownership nucleus &mdash; a treasury community, a long-term peer network, or a serial bonded-commitment pattern can, for some parameter regions, secure the specific investment without aggregating residual rights.
                    </PaperRun>
                    <p>
                        The non-coordination functions of the firm &mdash; capital aggregation, organizational knowledge, risk pooling, legal personhood &mdash; persist as durable requirements that some institution must satisfy. They do not necessarily re-bundle into a firm-shaped container; they can be satisfied by treasuries, DAOs, mutuals, cooperatives, or jurisdiction-specific legal wrappers attached to wallet clusters. The empirical question of which bundling pattern dominates in a given industry is outside the scope of this paper.
                    </p>
                    <PaperRun title="The firm&rsquo;s self-knowledge function dissolves alongside.">
                        A function we have not separately named is that the firm historically has been the unit at which <em>books</em> are kept &mdash; the unit whose position is tracked over time through double-entry bookkeeping in the tradition of Pacioli (1494). A bonded process closes its own ledger period at settlement, so the apparatus that grew up around the books (bookkeeping, accounting, audit) becomes optional for activity that settles through the protocol, and a wallet cohort participating in many processes has its full position visible without consolidation. The records function that historically motivated the firm boundary is no longer firm-bound.
                    </PaperRun>
                </PaperSubsection>
            </PaperSection>

            <PaperSection title="5. Token Denomination as Coordination Signal">
                <p>
                    In the primitive, the choice of denomination token is itself a coordination signal. The settlement layer is token-agnostic: any fungible settlement token can serve as the bond and payment currency. This means:
                </p>
                <ul className="space-y-1 list-disc pl-6 text-sm">
                    <li>A stablecoin signals legal-system alignment.</li>
                    <li>A DAO governance token signals community membership.</li>
                    <li>A commodity-backed token signals value anchoring.</li>
                    <li>Accepting a specific token <em>is</em> the seller&rsquo;s identity declaration &mdash; an accepted-token list is a brand.</li>
                </ul>
                <p>
                    Settlement velocity in a given token replaces traditional reputation metrics (star ratings, review scores). The on-chain record of resolved orders denominated in token <Math>{"\\tau"}</Math> is a public, tamper-proof signal of the seller&rsquo;s reliability within the <Math>{"\\tau"}</Math> economy. No platform needs to aggregate, curate, or attest this signal; it is a natural byproduct of protocol usage.
                </p>
                <p>
                    This matters institutionally because reputation infrastructure is one of the durable rents that platforms extract. A standing platform&rsquo;s credentialing function &mdash; certifying that a counterparty is reliable, safe, or qualified &mdash; is one of the structural reasons platforms persist even after their matching function is technically replicable. When reputation is a public byproduct of settlement rather than a proprietary platform asset, the platform&rsquo;s claim to that rent weakens.
                </p>
                <PaperRun title="Schelling-point tokens as a distinct category.">
                    The coordination-signal argument above applies to <em>any</em> token used in a bonded commitment. A second coordination role is played by tokens designed specifically to serve as focal points in the sense of Schelling (1960): anchors around which participants converge to signal alignment with a specific ecosystem, without central authority and without relying on any of the token&rsquo;s financial-mechanism features. With BTC and ETH as precedents at the money and settlement layers respectively, the FIG token is the focal anchor for participants who coordinate around the bonded-commitment primitive. A Schelling-point token does not compete with the general-purpose denomination tokens discussed above; it carries a signal they cannot carry, which is alignment with a specific coordination ecosystem rather than with legal-system, community, or value-anchoring choices. Such a token is underpinned not by cost-of-production (as Bitcoin is) nor by transaction-execution demand (as Ethereum is) but by the <em>value-added of trade</em> conducted through the substrate it coordinates around: FIG&rsquo;s value rests on the scale and quality of bonded commitments conducted by participants who use it to identify each other.
                </PaperRun>
            </PaperSection>

            <PaperSection title="6. Conclusion">
                <p>
                    The Coasean threshold is not a conjecture &mdash; it is observable. Contemporary coordination stacks often extract 15&ndash;30% of transaction value as coordination rent (Uber ~25%, DoorDash ~30%, Airbnb ~14%, Amazon Marketplace ~15%). Credit card networks layer 2&ndash;3% interchange plus double-digit annual interest on revolving balances. Financial markets intermediate trillions in notional value against a fraction of that in real economic exchange. Asymmetric bonding (Mechanism&nbsp;1) prices the cost of trust at <Math>{"2\\times"}</Math> the transaction value in temporarily locked (not spent) capital, with zero recurring extraction. Buyer dominance with atomic resolution (Mechanism&nbsp;2) makes the resulting mesh of bonded edges resolvable as a single coordinated unit at the buyer&rsquo;s signature. The Coasean threshold shift is the work of Mechanism&nbsp;1; the structural availability of transaction-scoped assemblies as a firm-substituting organizational form is the work of Mechanism&nbsp;2.
                </p>
                <p>
                    For any economic activity where the coordination rent exceeds the opportunity cost of locked capital, the standing firm &mdash; as Coase conceived it &mdash; is no longer the uniquely efficient unit of economic organization in that activity. The stronger consequence is that the firm becomes one organizational pattern among several in the shifted region: transaction-scoped assemblies, treasury communities, peer networks, and agent coalitions share the coordination space alongside it. The settlement primitive does not abolish coordination, nor does it abolish the firm; it retires the <em>subordination overlay</em> that previously made the firm the privileged container, and leaves a richer organizational space in its place.
                </p>
                <PaperRun title="A note on scope.">
                    This paper bounds its claim by two scope conditions: the Coasean comparison (Proposition 3.1: <Math>{"2P \\cdot rT"}</Math> vs. coordination overhead) and asset specificity (Section 4). Both must hold for a transaction to lie within the paper&rsquo;s argumentative domain; readers constructing arguments about transactions that satisfy one condition but not the other should treat the argument with corresponding partial force.
                </PaperRun>
            </PaperSection>
        </PaperLayout>
    );
}
