import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import {
    PaperLayout,
    PaperSection,
    PaperRun,
} from "@/components/papers/PaperLayout";
import { Math } from "@/components/papers/Math";
import { DesignGraphCollapseFigure } from "@/components/figures/DesignGraphCollapseFigure";

export const metadata: Metadata = withOg({
    title: "After TradeLens: A Permissionless Bonded Replacement — Figaro Protocol",
    description:
        "TradeLens failed for a structural reason no governance fix resolves: a competitor-controlled platform asks rival carriers to ratify a competitor's gatekeeping. The fix is no consortium at the platform layer. A permissionless bonded composition coordinates the inter-logistics perimeter without one.",
});

const HANDOFF_CHAIN = `        shipper-of-record (origin country)
            |
            | handoff: goods presented for shipment
            v
        freight forwarder + NVOCC
            |   (forwarder coordinates multimodal
            |    movement; NVOCC issues house BoL)
            v
        origin inland leg (truck or rail to port)
            |
            | handoff: container stuffed and sealed
            v
        inspection service (pre-shipment, optional)
            |
            | custody event: seal inspected intact
            v
        port-of-loading (terminal services)
            |
            | handoff: container loaded; master BoL issued
            v
        ocean carrier
            |
            | vessel-position stream (carrier event log),
            | custody-event sequence,
            | cold-chain monitor (if reefer)
            v
        port-of-discharge (terminal services)
            |
            | handoff: container discharged
            v
        customs agent + customs authority
            |   (agent files entries on behalf of
            |    importer; authority bonded for
            |    clearance service and tariff)
            v
        destination inland leg
            |
            | modalities: delivery to consignee
            v
        consignee (importer-of-record / buyer-at-tier)`;

function CodeBlock({ children }: { children: string }) {
    return (
        <pre className="paper-code my-4 overflow-x-auto rounded border border-default p-4 text-xs leading-relaxed font-mono text-ink-body whitespace-pre">
            {children}
        </pre>
    );
}

export default function AfterTradeLensPaper() {
    return (
        <PaperLayout slug="after-tradelens"
            title="After TradeLens"
            subtitle="A Permissionless Bonded Replacement"
            author="Figaro"
            date="May 2026"
            watermark="Figaro Protocol · Preprint"
            keywords="container shipping, supply-chain coordination, bills of lading, Incoterms, MLETR, transferable records, process modeling"
            abstract={
                <>
                    <p>
                        TradeLens (2018&ndash;2023), the IBM&ndash;Maersk container-shipping consortium that aimed to produce a tamper-proof shared record of every container&rsquo;s journey, shut down in 2023 even after several major carriers had joined, because the industry never consolidated under it &mdash; rival carriers split across competing consortia rather than concentrate a shared industry resource under one competitor&rsquo;s platform. The shutdown was not a software failure. It was a governance failure visible from the consortium&rsquo;s structural shape: a competitor-controlled platform that the rest of the industry would not consolidate under, and one that offered participants shared visibility without offering them any settlement guarantee for holding to the arrangement. The failure was structural, predictable from the shape of the architecture, and not specific to TradeLens, which is one species of a broader pattern &mdash; the coordination apparatus of the prior era, a consortium with a membership and a governing body, ported onto a new technical substrate without changing what the substrate is asked to do.
                    </p>
                    <p>
                        The architectural alternative we develop operates at the same perimeter TradeLens attempted: inter-logistics coordination among ocean carriers, ports of loading and discharge, customs authorities, freight forwarders, NVOCCs, customs agents, trade-finance parties / LC issuers, marine insurers, and inspection services. We present a permissionless, ownerless bonded composition built on the Figaro kernel&rsquo;s two mechanisms (asymmetric bonding plus buyer dominance with atomic resolution). The composition has no consortium, no foundation, no admin function, no upgrade path, and no central party who can be ratified or refused. Each provider is a wallet standing for an off-chain productive asset, operated by a human or by an autonomous agent on the asset&rsquo;s behalf, with public-authority wallets participating on the same footing as commercial ones. The root buyer at this perimeter is the buyer-of-record at the relevant tier; the kernel is agnostic about which party occupies the buyer slot. At each commit the buyer locks twice that leg&rsquo;s payment and the seller twice everything the process has accumulated through its own link; atomic resolution by the buyer-of-record then settles every leg at once, on receipt of the goods at the agreed delivery point. Carriers who want to participate compose; carriers who do not do not, with no consequence for either decision.
                    </p>
                    <p>
                        The composition is built rather than proposed, and the clause set it draws on is shipped protocol infrastructure: commerce, cargo, geolocation, modalities, acceptance criteria, cold chain, freight class, emissions, the merchant and courier process-event logs, the registered Incoterms-2020 anchor, and &mdash; for the container&rsquo;s integrity &mdash; a chain-of-custody clause that commits the seal regime at signing and carries the seal&rsquo;s applied, inspected-intact, transferred, breached, and removed events as runtime witness attestations. An order that involves a physical exchange carries one hand-off clause naming where it happens, with the proximity policy nested under it: the accepted detection bands are committed at signing, and the proof that the hand-off occurred within one of them is filed as a witness stage on that same clause. One clause remains a candidate &mdash; a customs-clearance clause &mdash; and the built composition does without it, the clearance determination reaching the record through the customs agent&rsquo;s own attestations against a pinned filing-terms document. We also treat the bill-of-lading transferability question through the treatment of a cargo sale in transit as an event outside the process, squared by the parties before resolution without weakening the kernel&rsquo;s invariants.
                    </p>
                    <p>
                        The paper is in industrial-engineering register: the contribution is the composition and its operational properties, not novel mechanism-design results. Why TradeLens failed and what a bonded replacement at the same perimeter looks like architecturally are answerable as supply-chain coordination questions.
                    </p>
                </>
            }
            references={
                <>
                    <li>CargoX d.o.o. <em>CargoX Platform: Blockchain Document Transfer Solution for Shipping</em>. CargoX product documentation, 2023.</li>
                    <li>Goode, R. &amp; Gullifer, L. <em>Goode and Gullifer on Legal Problems of Credit and Security</em>, 6th edition. Sweet &amp; Maxwell, London, 2017.</li>
                    <li>Infocomm Media Development Authority of Singapore (IMDA). <em>TradeTrust: Open-Source Framework for Electronic Transferable Records</em>. IMDA, 2023.</li>
                    <li>International Chamber of Commerce. <em>Incoterms 2020: ICC Rules for the Use of Domestic and International Trade Terms</em>. ICC Publication 723E, 2020.</li>
                    <li>Jensen, T., Hedman, J., &amp; Henningsson, S. How TradeLens Delivers Business Value With Blockchain Technology. <em>MIS Quarterly Executive</em>, 18(4):221&ndash;243, 2019.</li>
                    <li>Ramberg, J. <em>ICC Guide to Incoterms 2010</em>. ICC Publication 720E, 2011.</li>
                    <li>Sarker, S., Henningsson, S., Jensen, T., &amp; Hedman, J. The Use of Blockchain as a Resource for Combating Corruption in Global Shipping: An Interpretive Case Study. <em>Journal of Management Information Systems</em>, 38(2):338&ndash;373, 2021.</li>
                    <li>The Loadstar. AP M&oslash;ller-M&aelig;rsk and IBM to Discontinue TradeLens. The Loadstar, 30 November 2022.</li>
                    <li>UNCITRAL. <em>UNCITRAL Model Law on Electronic Transferable Records</em>. United Nations, 2017.</li>
                </>
            }
        >
            <PaperSection title="1. Introduction">
                <p>
                    Container shipping is a coordination problem of unusual scale: a single 20,000-TEU vessel carries cargo from thousands of shippers, moves through multiple ports under multiple jurisdictions, transfers to multiple consignees, and is documented by a stack of bills of lading, customs filings, GHG attestations, and operational handoffs that no single party originates and no single party owns. The information problem is real &mdash; duplicated paper-based records, opaque vessel-position data, contested seal-integrity claims &mdash; and the industry has been searching for a digital solution for two decades.
                </p>
                <p>
                    TradeLens, the consortium platform jointly developed by IBM and Maersk between 2018 and 2023, was the most ambitious attempt at that solution: a permissioned blockchain on which participants would publish operational records that all parties to a shipment could read. The platform was technically functional and shut down anyway in early 2023. Section 2 reads the failure structurally: the binding constraint was not network effects but the governance shape &mdash; a competitor-controlled platform asks rival carriers to ratify the controlling competitor&rsquo;s gatekeeping, and the industry hedged across rival consortia rather than consolidate under it.
                </p>
                <PaperRun title="The architectural alternative.">
                    The structural fix is not better governance but no governance at the platform layer at all. A permissionless, ownerless settlement primitive &mdash; the Figaro kernel&rsquo;s bonded commitment &mdash; removes the governance question from the architecture. There is no consortium to join; there is a public protocol that any wallet can compose with. There is no gatekeeping authority to refuse; carriers participate by signing commitments and decline by not signing. The network-effects question becomes more manageable because the platform-as-veto problem disappears: a competitor&rsquo;s participation does not require the competitor&rsquo;s consent to a competitor&rsquo;s gatekeeping.
                </PaperRun>
                <PaperRun title="Wallets, providers, and the perimeter.">
                    Every party in the bonded composition is a wallet, and behind each wallet is an off-chain productive asset &mdash; an ocean-going vessel, a terminal&rsquo;s berth and crane capacity, a customs authority&rsquo;s clearance service, a forwarder&rsquo;s multimodal coordination capability, an inspection service&rsquo;s presence on the ground. A human or an autonomous agent operates the wallet on the asset&rsquo;s behalf; the mechanism does not distinguish the two and does not look behind the wallet at all. Public-authority wallets (port authorities, customs authorities) participate on the same footing as commercial providers: the kernel does not distinguish a tax from a fee for service, which is what lets an import duty and a drayage charge sit in one process as two ordinary bonded legs. <em>Buyer</em> and <em>seller</em> are positions a wallet occupies in a given process rather than kinds of party &mdash; the carrier that is a seller in the importer&rsquo;s process is the root buyer of its own bunkering process, and nothing in the mechanism marks either role as belonging to it.
                </PaperRun>
                <PaperRun title="The perimeter the paper develops.">
                    This paper develops the bonded composition at the same perimeter TradeLens attempted: <em>inter-logistics coordination</em> among the parties that move a container from origin to destination &mdash; ocean carriers, ports of loading and discharge, customs authorities, freight forwarders, NVOCCs, customs agents, trade-finance parties / letter-of-credit issuers, marine insurers, inspection services, and cold-chain monitors. The composition is not a TradeLens replacement in the sense of a drop-in alternative product; it is a re-architecture of the inter-logistics coordination problem in which the consortium-platform layer dissolves into a permissionless settlement primitive.
                </PaperRun>
            </PaperSection>

            <PaperSection title="2. What TradeLens Was and Why It Failed">
                <PaperRun title="What TradeLens was.">
                    TradeLens was a permissioned blockchain platform for global container shipping, jointly developed by IBM and Maersk and operational from 2018 to 2023. The platform&rsquo;s stated goal was a shared, tamper-proof record of every container&rsquo;s journey &mdash; bills of lading, customs filings, port handoffs, vessel positions &mdash; accessible to all parties in a shipment.
                </PaperRun>
                <p>
                    The technical architecture was Hyperledger-Fabric-based: a permissioned ledger where participating carriers, ports, and customs authorities could publish operational records. The platform&rsquo;s use-case design rested on the assumption that all major ocean carriers would join, producing a single ledger that shippers could rely on as comprehensive cross-carrier reference. Jensen et al. (2019) and Sarker et al. (2021) document the platform&rsquo;s use-case design as it stood mid-deployment; both papers predate the shutdown and frame the platform around adoption potential rather than around the governance refusal we read as the binding constraint below. The governance-was-binding reading is original to this paper; Jensen and Sarker supply the use-case baseline against which the reading is offered.
                </p>
                <PaperRun title="The adoption shape.">
                    TradeLens did attract major non-Maersk carriers: MSC and CMA CGM joined as foundation carriers in 2020, with Hapag-Lloyd and Ocean Network Express (ONE) also participating. But the industry did not consolidate under it. As reported by The Loadstar (2022), a rival consortium &mdash; the Global Shipping Business Network (GSBN) &mdash; drew other carriers and terminal operators, with Hapag-Lloyd among the carriers engaging with both groupings rather than consolidating under either; we rely on The Loadstar&rsquo;s account for this specific configuration and do not independently verify GSBN&rsquo;s founding membership beyond it. With the industry split across competing consortia, no single platform held the share of cargo volume its value proposition required. In November 2022, IBM and Maersk announced the shutdown, citing the failure to reach the level of commercial viability needed for full global industry collaboration; production ended in Q1 2023 (The Loadstar, 2022).
                </PaperRun>
                <PaperRun title="Why the industry would not consolidate.">
                    The standard adoption-dynamics reading explains the shutdown through a familiar mechanism: shippers want a single ledger covering 90%+ of their cargo volume; with the industry split across TradeLens and the rival consortium, no single platform held that share; without comprehensive data, shippers wouldn&rsquo;t commit to any one platform; without that commitment, carriers had no incremental reason to consolidate under a competitor&rsquo;s platform; the equilibrium was fragmented non-consolidation. This is correct as far as it goes.
                </PaperRun>
                <p>
                    The deeper reading is that the non-Maersk carriers correctly identified a strategic problem with the platform&rsquo;s governance shape, and responded by hedging across a rival consortium rather than consolidating their operational data under it. A platform controlled by Maersk, with IBM as the technical seller and Maersk as the principal customer, is structurally a coordination layer whose governance accountability runs to a single industry participant; other carriers are being asked to provision their operational data into a layer whose contested cases will resolve in that participant&rsquo;s favour. Whatever the platform&rsquo;s formal governance arrangements, the controlling-competitor dynamic is the binding constraint on whether competitors will consolidate under it &mdash; which is a different and lower bar than whether they will join.
                </p>
                <p>
                    The argument is not that Maersk acted in bad faith or that the formal governance was inadequate. The argument is that the platform&rsquo;s shape <em>is</em> the problem: a competitor-controlled infrastructure requires other competitors to ratify the controller&rsquo;s strategic position relative to the industry, and there is no formal-governance fix that dissolves this requirement. Carriers proved unwilling to consolidate exclusively under a Maersk-controlled platform regardless of how its governance was configured &mdash; several joined but hedged across a rival consortium rather than concentrate the industry&rsquo;s coordination layer under one competitor.
                </p>
                <PaperRun title="The general lesson.">
                    TradeLens&rsquo;s failure is not specific to IBM, to Maersk, or to shipping. It is the recurring pattern of consortium-governance infrastructure: any platform whose governance accountability runs to a participant of the industry it is meant to serve will find that participant&rsquo;s competitors declining to <em>consolidate</em> under it. The refusal is rarely a refusal to appear &mdash; competitors may well join, as several major carriers did &mdash; and that is what makes it hard to read from a membership list. What they withhold is exclusivity: the operational data stays hedged across alternatives, and the single comprehensive ledger the value proposition needed never forms. The fix is not better consortium governance; the fix is no consortium at the platform layer. The claim should be read as one about accountability shape rather than about collective arrangements in general. A utility owned by its members collectively, none of whom controls it, is a different object from a coordination platform controlled by one participant in the industry it serves: what the non-Maersk carriers refused was the second, and the refusal says nothing about the first. What it does say is that the shape is a standing hazard for anyone who proposes to sit at the middle of an industry &mdash; the controlling participant cannot promise the shape away, because the shape is not a promise. The structural alternative is permissionless, ownerless infrastructure at the platform layer, with whatever industry-specific arrangements the participants want to compose on top.
                </PaperRun>
            </PaperSection>

            <PaperSection title="3. The Settlement Primitive">
                <p>The settlement primitive the composition is built on has two calls and nothing else, each carrying a mechanism design of its own. We restate what the present argument uses, in the terms the rest of the paper will use.</p>
                <PaperRun title="Commit: asymmetric bonding.">
                    An order is a commitment signed by both its parties and bonded on both sides. For an order with payment <Math>{"P > 0"}</Math>, the buyer locks <Math>{"2P"}</Math> and the seller locks <Math>{"2G"}</Math>, where <Math>{"G"}</Math> is the value the process has accumulated through that seller&rsquo;s own link, <em>its own payment included</em>: <Math>{"G_i = \\sum_{j \\leq i} P_j"}</Math>. That figure is not a report and not a claim &mdash; commit admits exactly one value, the standing accumulator plus the new payment, so the seller&rsquo;s bond base is fixed by arithmetic on what the two parties signed. The schedule is constitutive rather than chosen: twice the payment from the buyer, twice the cumulative value through its link from the seller, on every order at every position, with no setting to tune and no order admitted on other terms. At the root there is nothing accumulated ahead of the order, so <Math>{"G = P"}</Math> and the two bonds coincide; at every position below it the seller&rsquo;s bond is the larger.
                </PaperRun>
                <PaperRun title="Resolve: buyer dominance with atomic resolution.">
                    Only the root buyer may resolve, and resolution is atomic: every active order in the process settles together or none does. It is also terminal &mdash; a resolved process cannot be reopened, and there is no partial resolution, no timeout, no cancellation, and no third party who can release a bonded position. An unresolved process is not a failure that has been banked; it is a position the parties hold, with no clock running in it, until the buyer closes it.
                </PaperRun>
                <PaperRun title="What the two calls give, and in what order.">
                    After performance, resolving is unconditionally strictly better for the buyer than never resolving &mdash; a comparison that needs no assumption whatever about the seller, since the buyer holds what it received either way and withholding merely leaves its own bond locked. Given that, performance is each seller&rsquo;s strict best response. The two calls compose in that order, and neither result stands alone. The deterrent behind the second comparison is computed with what a defector <em>keeps</em>, never from locked bonds alone: a seller that holds on to what is in its hands is credited that value &mdash; at most <Math>{"G"}</Math>, everything accumulated at its link, and less where its own contribution is a service it has not rendered &mdash; against its locked <Math>{"2G"}</Math>, so it stands at best at <Math>{"-G"}</Math> where performing would have paid it <Math>{"+P"}</Math>. That is what the doubling is for: a bond merely equal to the value at the link would be exactly offset by the taking, and the second half is what makes the taking cost. Nothing in the mechanism ever consumes a bond, which is why the standoff terminates in performance rather than in destruction.
                </PaperRun>
                <PaperRun title="The boundary the mechanism keeps.">
                    Value, performance, and the parties&rsquo; knowledge of both pass off-chain. What the mechanism holds is the bonds, the signed accumulator, and the record of what was committed to &mdash; so the record shows commitments and non-resolution, and never shows performance. A container that moved, a seal that held, a berth that was worked: none of it is visible to the mechanism, and the composition of Section 4 is accordingly an arrangement of attestations <em>about</em> a world the mechanism cannot see, settled by a buyer who judges for itself whether what it contracted for arrived. Resolution is that judgement expressed; the mechanism holds no acceptance test of its own and admits no report of delivery.
                </PaperRun>
                <PaperRun title="Disagreement, remedy, and forums.">
                    Where a leg is late, short, damaged, or contested, the mechanism decides nothing and by construction cannot. The parties settle it between themselves <em>while the process stands open</em>, and the concrete transfer is unremarkable: a seller that cannot perform sends the buyer the payment it stands to receive, so that at resolution it takes back its bond and nothing more &mdash; no profit from failing &mdash; and the buyer is whole. A forum the parties have named in their agreement, or any forum that would have heard them anyway, may rule on the open process record and on whatever the parties bring it. What a forum cannot do is resolve: resolution is the buyer&rsquo;s alone, so no ruling reaches a balance the mechanism holds, and it is this absence of direct enforcement &mdash; not any question of layering or of timing after settlement &mdash; that lets a forum compose without touching the comparisons above. Resolution is terminal acceptance: a buyer with a live complaint resolves after the complaint is answered, not before, and has no recourse inside the mechanism afterwards.
                </PaperRun>
                <PaperRun title="What this implies for shipping coordination.">
                    Commit prices each leg&rsquo;s enforcement in bond posture without any consortium or platform underwriting it. Resolve enforces the multi-leg coordination at settlement without any party governing the multi-leg arrangement. Together they supply the coordination function TradeLens attempted to supply through a consortium-governed shared ledger, and they supply it without the consortium: permissionlessness alone removes the veto but gives self-interested rivals nothing to coordinate on, and bonded settlement is the enforcement a bare permissionless ledger cannot provide. A logistics reader will ask where bunker fuel, terminal handling, chassis time, and reefer power sit in that accounting, since they are consumed the moment a leg is performed. They sit outside it. What the mechanism moves is bonds pulled at commit and payment released at resolution; what a provider burns to move the box is expenditure on its own account, revenue and outlay of the operating asset behind the wallet, which the mechanism neither observes nor settles. What it asks of the provider is only that the wallet hold enough to bond the leg it is quoting; a carrier whose balance no longer covers its bonds has left the market, and it has left it by ordinary commercial arithmetic rather than by any act of the kernel.
                </PaperRun>
            </PaperSection>

            <PaperSection title="4. The Assembly">
                <p>
                    We now describe the bonded composition that operates at the TradeLens perimeter. The composition has two layers that must be kept distinct: the <em>organizational handoff chain</em> (how the container physically moves from origin to destination through the inter-logistics value-adders, documented by clause attestations) and the <em>commit sequence</em> the kernel actually sees, which is linear &mdash; a series of dual-signed commits extending one monotonic accumulator, every one of them running to the same root buyer, with no parent-child structure recorded anywhere in the settlement state. The ordering the operational chain has is the parties&rsquo; own, committed in the agreement and reconstructed off-chain by whoever reads the record. The kernel is blind to the handoff chain; the clause layer documents it. The two layers co-exist in one process.
                </p>
                <PaperRun title="The composition is built.">
                    What this section describes exists rather than being proposed. The composition is a published assembly composed from registered clauses, and it has been run end to end at a granularity of six bonded orders: shipper of record, pre-shipment inspection service, freight forwarder, reefer ocean carrier, customs agent, and destination drayage, all of them sellers to one root buyer, the importer of record. In that run each seller accepted and bonded on its own order with the exact <Math>{"2P_i"}</Math> / <Math>{"2G_i"}</Math> movements the schedule prescribes; custody, cold-chain, acceptance, emissions, proximity-band and process-log attestations were filed against each order as the schedule requires; and the importer resolved once, settling every order together, with each wallet&rsquo;s final balance read back from the chain rather than from the interface that produced it. The run is the authoring project&rsquo;s own exercise of the composition, demonstrating that the mechanics work end to end; it is not a report of independent carriers, ports, or agents operating the assembly on their own account, and nothing here should be read as one.
                </PaperRun>
                <PaperRun title="The organizational handoff chain.">
                    A container shipment is a sequence of operational handoffs from origin to destination. We sketch a canonical international flow, with the inter-logistics value-adders made explicit:
                </PaperRun>
                <CodeBlock>{HANDOFF_CHAIN}</CodeBlock>
                <p>
                    Marine insurance and trade-finance / letter-of-credit issuance operate as parallel value-adders bonded against the same process without sitting on the cargo-flow line &mdash; the marine insurer&rsquo;s wallet bonds against the goods&rsquo; value, the LC issuer&rsquo;s wallet bonds against the payment-on-documents arrangement, and both are sellers in the bonded composition without owning a physical handoff. Variations on the structure (intermodal rail substituted for inland truck, multiple consolidation points, transhipment ports, etc.) instantiate the same pattern with the operational divisions shifted to reflect the route. Every handoff along this chain is documented by a clause-typed attestation: a hand-off clause carrying the transfer point, with the proximity policy nested under it supplying the witness-stage proof that the transfer occurred within an accepted detection band; the chain-of-custody clause for seal-state changes; the geolocation clause fixing the leg&rsquo;s origin and destination at signing; the carrier&rsquo;s own process-event log for the positions it reports as the voyage runs; the cold-chain clause for the reefer&rsquo;s temperature record; the acceptance-criteria clause for the basis an inspection attests against; and the modalities clause carrying the buyer&rsquo;s requested delivery modality. None of these attestations is a kernel commit; they are evidentiary records documenting the operational reality of the container&rsquo;s flow.
                </p>
                <PaperRun title="The kernel commit structure.">
                    The kernel commits, by contrast, all share one buyer: the kernel requires every order&rsquo;s buyer to be the process&rsquo;s root buyer, and the root buyer at this perimeter is the <em>buyer-of-record at the relevant tier</em>. Depending on the Incoterm and the operational arrangement, that party can be the importer-of-record, the consignee, a forwarder-of-record acting on the importer&rsquo;s behalf, or in seller-arranged shipments the shipper-of-record itself. The kernel is agnostic about which party occupies the buyer slot. We use <em>importer-of-record</em> as the running illustration; the apparatus is the same with any of the alternatives.
                </PaperRun>
                <p>
                    The commits document who the importer-of-record pays and how much: importer &rarr; shipper-of-record (for the cargo&rsquo;s invoice value, if the Incoterm assigns the import side that obligation), importer &rarr; freight forwarder, importer &rarr; NVOCC, importer &rarr; origin inland carrier, importer &rarr; inspection service, importer &rarr; port-of-loading authority, importer &rarr; ocean carrier, importer &rarr; port-of-discharge authority, importer &rarr; customs agent, importer &rarr; customs authority (for the import duty), importer &rarr; destination inland carrier, importer &rarr; marine insurer (if buyer-procured cover), importer &rarr; LC issuer (if the payment is letter-of-credit-arranged), and any other resource provider the operational arrangement draws on. The commits are independent of who hands the container to whom in the handoff chain above. The importer alone resolves on receipt at the agreed delivery point, settling the process atomically.
                </p>
                <DesignGraphCollapseFigure
                    idPrefix="after-tradelens-design-collapse"
                    designHeading="The organizational handoff chain"
                    designNodes={[
                        { label: "shipper-of-record (origin)" },
                        { label: "freight forwarder + NVOCC" },
                        { label: "origin inland leg" },
                        { label: "inspection service" },
                        { label: "port-of-loading" },
                        { label: "ocean carrier" },
                        { label: "port-of-discharge" },
                        { label: "customs agent + authority" },
                        { label: "destination inland leg" },
                        { label: "consignee (importer-of-record)" },
                        { label: "marine insurer", branch: true },
                        { label: "LC issuer", branch: true },
                    ]}
                    commitOrder={[
                        "importer → shipper-of-record",
                        "importer → freight forwarder",
                        "importer → NVOCC",
                        "importer → origin inland carrier",
                        "importer → inspection service",
                        "importer → port-of-loading authority",
                        "importer → ocean carrier",
                        "importer → port-of-discharge authority",
                        "importer → customs agent",
                        "importer → customs authority",
                        "importer → destination inland carrier",
                        "importer → marine insurer",
                        "importer → LC issuer",
                    ]}
                    rootBuyerLabel="Importer-of-record"
                    topologyNote={[
                        "The agreement does. The ordering the operational chain has is the parties' own,",
                        "committed in the agreement and reconstructed off-chain by whoever reads the record.",
                    ]}
                    figureTitle="The handoff graph at the design layer, and the commit sequence the kernel sees"
                    figureDesc={
                        "On the left, the organizational handoff chain: ten operational nodes " +
                        "from shipper-of-record to consignee, plus two value-adders — the marine " +
                        "insurer and the letter-of-credit issuer — branching off the cargo-flow " +
                        "line, bonded against the same process without owning a handoff. On the " +
                        "right, what the kernel holds: thirteen dual-signed commits in a single " +
                        "linear sequence, every one of them running to the importer-of-record as " +
                        "root buyer, extending one monotonic accumulator. No parent, child, or " +
                        "branch is recorded anywhere in settlement state. The ordering the " +
                        "operational chain has is the parties' own: committed in the agreement, " +
                        "and reconstructed off-chain by whoever reads the record."
                    }
                    caption={
                        <>
                            The two layers co-exist in one process. The branch on the left is real
                            and is documented by clause attestations; the kernel is blind to it,
                            and the commits are independent of who hands the container to whom.
                        </>
                    }
                />
                <PaperRun title="Granularity is a design choice.">
                    The same shipment can be composed coarsely (a few commits to aggregator wallets &mdash; the forwarder absorbs origin inland + port-of-loading + carrier + port-of-discharge + destination inland into one bonded commit) or finely (each value-adder a separate commit, as enumerated above). The kernel sees only commits; it does not reify any tier-role or aggregation choice. Granularity is chosen by the contracting parties to suit their coordination needs. The per-edge equilibrium is invariant to the choice in its <em>form</em> &mdash; every order is bonded on the same schedule, twice the payment against twice the accumulated value, whatever else the process carries &mdash; though not in its magnitudes, since a seller&rsquo;s bond base is the accumulator at its own link and therefore depends on how much was committed ahead of it. The cohort-pressure topology induced by atomic resolution varies in both, since each co-seller&rsquo;s exposure to a peer&rsquo;s fault (<Math>{"P_i + 2G_i"}</Math>) depends on how many parties are in the cohort and on where each sits. The six-order run described above is one point on that axis and the enumeration above is another; both are the same composition read at different granularities. This paper develops the fine-grained version because the value-adder structure is the substantive content of the TradeLens-perimeter coordination problem; coarse aggregations are admissible, may be operationally appropriate in many arrangements, and produce a different cohort-pressure topology that the assembly designer can engineer for.
                </PaperRun>
                <PaperRun title="Off-chain organizational shapes.">
                    The conventional inter-logistics chain involves named organizational shapes (shipper-of-record, consignee, forwarder, NVOCC, customs broker, importer-of-record, customs agent). Under the bonded composition the kernel does not see these tier-roles; each tier-role is whichever wallet the contracting parties designate at agreement signing. Off-chain organizational shapes that today perform discovery, curation, brand-as-quality-signal, or coordination services around the inter-logistics layer can still be filled by wallets representing the assets that provide those services and operated by whichever human or agent stack the asset&rsquo;s owner runs &mdash; but those wallets cannot insert themselves as kernel intermediaries between the buyer-of-record and the operational sellers, since the kernel forbids any party other than the root buyer from being the buyer of within-process commits.
                </PaperRun>
                <PaperRun title="Per-commit clauses.">
                    Each kernel commit pairs the standard commerce (payment) clause with the clauses appropriate to the seller&rsquo;s role:
                </PaperRun>
                <ul className="space-y-2 list-disc pl-6 text-sm">
                    <li><em>Shipper-of-record</em>: the cargo clause carrying the shipment&rsquo;s logistic-unit measures; the Incoterms 2020 anchor for the term and named place; the chain-of-custody clause opening the goods&rsquo; integrity regime; the acceptance-criteria clause fixing the basis on which the importer receives; the modalities and geolocation clauses; optional emissions disclosure for manufacturing emissions.</li>
                    <li><em>Freight forwarder</em>: the process-event log for the coordination role; geolocation for the consolidation point; a hand-off with its proximity policy where the forwarder takes physical receipt.</li>
                    <li><em>NVOCC</em>: house bill-of-lading reference (the BoL itself is treated as a protocol-layer composition pattern in Section 7).</li>
                    <li><em>Origin and destination inland carriers</em>: the courier process-event log, carrying pickup and drop-off as events; one hand-off on each carrier&rsquo;s own order, with its proximity policy nested under it; geolocation origin and destination geohashes.</li>
                    <li><em>Inspection service</em>: the acceptance-criteria clause, against which the inspector files its outcome as a witness-stage attestation; a chain-of-custody inspected-intact event; an optional evidence reference to the pre-shipment inspection report.</li>
                    <li><em>Port-of-loading and port-of-discharge authorities</em>: payment for terminal handling and gate access; one hand-off on each authority&rsquo;s own order, with its proximity policy nested under it; chain-of-custody inspected-intact events at each port.</li>
                    <li><em>Ocean carrier</em>: the courier process-event log over the voyage, carrying the loading, position and discharge events the carrier reports; one hand-off on the carrier&rsquo;s order, with its proximity policy nested under it; chain-of-custody events through the voyage; geolocation for the leg&rsquo;s endpoints; the freight-class clause where the cargo needs a declared class; an emissions disclosure for voyage emissions; for reefer cargo, the cold-chain clause committing the temperature window and recording interval and carrying the observed record as its witness stage.</li>
                    <li><em>Customs agent</em>: payment for entry-filing services; the process-event log recording the filing sequence; the consent clause binding the parties to the pinned filing-terms document. The customs determination itself reaches the record through those attestations; a dedicated customs-clearance clause is a candidate, treated in Section 6.</li>
                    <li><em>Customs authority</em>: the import-duty payment lands in the customs-authority wallet at this commit. The kernel sees only the bonded payment; the authority&rsquo;s sovereign decision on whether the cargo clears stays off-chain. Section 9 treats the dual function.</li>
                    <li><em>Marine insurer</em>: the policy premium is the payment leg; the insurer posts the same <Math>{"2G"}</Math> bond every seller in the process posts &mdash; twice the cumulative process value through its own link, its own premium included &mdash; as a deterrent, not as underwriting capacity. The underwriting capacity itself lives off-chain in the policy; the bond is identical in kind to every other seller&rsquo;s. Insurance composes with the bonded primitive without modifying the kernel.</li>
                    <li><em>LC issuer</em> (if applicable): the LC issuance fee is the payment leg; the issuer posts the same <Math>{"2G"}</Math> bond every seller posts, not a distinct credit-capacity stake. The documentary-payment arrangement itself lives off-chain in the LC terms; the bond is the ordinary deterrent, identical in kind to the rest of the cohort.</li>
                </ul>
                <PaperRun title="Operational sub-procurement as separate processes.">
                    Each value-adder&rsquo;s own procurement (the carrier&rsquo;s fuel + crew + maintenance, the forwarder&rsquo;s IT + staffing, the inspection service&rsquo;s labour + equipment, the port authority&rsquo;s terminal operations, etc.) is a separate process in which that provider wallet is itself the root buyer. The kernel does not link those processes to the importer&rsquo;s, and nothing needs it to: each process is a complete settlement frame in its own right, and anything that must actually coordinate with the shipment enters the shipment&rsquo;s own process as one more bonded link &mdash; the chain is bounded only by gas. Each provider wallet runs its own bonded processes for its operating expenses against its own counterparties.
                </PaperRun>
            </PaperSection>

            <PaperSection title="5. Bond Posture and Cascade Mechanics">
                <p>The composition&rsquo;s structural contribution is that each leg&rsquo;s risk is priced and propagated by the bonding rule of the kernel, without consortium intermediation.</p>
                <PaperRun title="Bond posture per commit.">
                    The kernel maintains a single process-wide cumulative-value accumulator <Math>{"G"}</Math> that grows monotonically as each commit lands (<Math>{"G \\leftarrow G + P_i"}</Math>). At every commit the importer-of-record (as root buyer) posts <Math>{"2P_i"}</Math> for that specific payment, and the seller posts twice the accumulator <em>as the commit leaves it</em> &mdash; <Math>{"G_i = \\sum_{j \\leq i} P_j"}</Math>, the whole value the process has accumulated through that seller&rsquo;s own link, its own payment included. Bond posture is asymmetric: the importer&rsquo;s per-commit bond scales with the immediate payment, while each seller&rsquo;s scales with everything the process has accumulated at its link. Sellers committing later post correspondingly larger bonds; the last seller&rsquo;s bond is twice the full landed value of the shipment.
                </PaperRun>
                <PaperRun title="A bond-posture worked example.">
                    Consider a stylized $1,000 total shipment value (cargo invoice $700) &mdash; containerised goods shipped from an exporting country to an importing country with a 5% import duty assessed on the CIF declared value &mdash; with the importer-of-record as root buyer. The table below traces one illustrative commit sequence.
                </PaperRun>
                <div className="my-4 overflow-x-auto">
                    <table className="text-sm border-collapse w-full">
                        <thead>
                            <tr>
                                <th className="border border-default px-3 py-1.5 text-left font-semibold text-ink-heading">Seller (commit sequence)</th>
                                <th className="border border-default px-3 py-1.5 text-right font-semibold text-ink-heading"><Math>{"P_i"}</Math></th>
                                <th className="border border-default px-3 py-1.5 text-right font-semibold text-ink-heading"><Math>{"G"}</Math> after</th>
                                <th className="border border-default px-3 py-1.5 text-right font-semibold text-ink-heading">Importer <Math>{"2P_i"}</Math></th>
                                <th className="border border-default px-3 py-1.5 text-right font-semibold text-ink-heading">Seller <Math>{"2G"}</Math></th>
                            </tr>
                        </thead>
                        <tbody>
                            {[
                                ["Shipper-of-record (cargo, root)", "$700", "$700", "$1,400", "$1,400"],
                                ["Marine insurer", "$15", "$715", "$30", "$1,430"],
                                ["Freight forwarder", "$30", "$745", "$60", "$1,490"],
                                ["NVOCC (house BoL)", "$15", "$760", "$30", "$1,520"],
                                ["Origin inland carrier", "$20", "$780", "$40", "$1,560"],
                                ["Inspection service (pre-shipment)", "$10", "$790", "$20", "$1,580"],
                                ["Port-of-loading authority", "$25", "$815", "$50", "$1,630"],
                                ["Ocean carrier", "$60", "$875", "$120", "$1,750"],
                                ["Port-of-discharge authority", "$25", "$900", "$50", "$1,800"],
                                ["Customs agent", "$20", "$920", "$40", "$1,840"],
                                ["Customs authority (import duty)", "$39", "$959", "$78", "$1,918"],
                                ["Destination inland carrier", "$25", "$984", "$50", "$1,968"],
                                ["LC issuer (documentary credit fee)", "$16", "$1,000", "$32", "$2,000"],
                            ].map((row) => (
                                <tr key={row[0]}>
                                    <td className="border border-default px-3 py-1.5">{row[0]}</td>
                                    <td className="border border-default px-3 py-1.5 text-right">{row[1]}</td>
                                    <td className="border border-default px-3 py-1.5 text-right">{row[2]}</td>
                                    <td className="border border-default px-3 py-1.5 text-right">{row[3]}</td>
                                    <td className="border border-default px-3 py-1.5 text-right">{row[4]}</td>
                                </tr>
                            ))}
                            <tr className="font-semibold text-ink-heading">
                                <td className="border border-default px-3 py-1.5">Total bond locked across the process</td>
                                <td className="border border-default px-3 py-1.5 text-right">&mdash;</td>
                                <td className="border border-default px-3 py-1.5 text-right">&mdash;</td>
                                <td className="border border-default px-3 py-1.5 text-right">$2,000</td>
                                <td className="border border-default px-3 py-1.5 text-right">$21,886</td>
                            </tr>
                        </tbody>
                    </table>
                    <p className="text-xs text-ink-muted mt-2 leading-relaxed">
                        Stylized per-commit bond posture for a shipment with $1,000 total process value under one TradeLens-perimeter process with the importer-of-record as root buyer. The import duty ($39, rounded from 0.05 &times; $775 = $38.75) is 5% of the declared CIF value ($775 = $700 cargo + $15 marine insurance + $60 ocean freight). <Math>{"G"}</Math> is the process-wide cumulative-value accumulator as the row&rsquo;s own commit leaves it, so each seller&rsquo;s bond is twice a figure that already includes that seller&rsquo;s own payment. Per-leg payments are illustrative; absolute magnitudes vary with cargo class, route, tariff schedule, and the operational arrangement.
                    </p>
                </div>
                <p>
                    The asymmetry between importer-side and seller-cohort bonds is visible: the importer&rsquo;s aggregate locked bond is $2,000 (<Math>{"= 2G"}</Math>, twice the total process value &mdash; the sum of the per-commit <Math>{"2P_i"}</Math>), while the seller cohort&rsquo;s aggregate locked bond is $21,886, nearly eleven times the importer&rsquo;s. The seller cohort&rsquo;s bond is a large multiple of the total shipment value because each seller bonds against the accumulator as its own commit leaves it, and the inter-logistics perimeter has a substantial number of value-adders. The growth claim needs stating precisely, since two different things vary. The importer&rsquo;s aggregate is <Math>{"2\\sum_i P_i"}</Math> &mdash; exactly twice the total process value, by construction, whatever the granularity and whatever the route. The cohort&rsquo;s aggregate is <Math>{"2\\sum_i G_i"}</Math>, which is super-linear <em>in the number of value-adders at fixed per-leg payments</em>: adding further legs of the same size &mdash; which raises the total process value as it goes &mdash; grows it quadratically, and for <Math>{"n"}</Math> equal legs it is exactly <Math>{"(n+1)"}</Math> times the total process value. Held against a fixed number of legs it grows only linearly with the total value, like the importer&rsquo;s. So adding transhipment ports, further inland legs, or additional inspection services widens the ratio between the two sides; raising the cargo&rsquo;s invoice value does not.
                </p>
                <PaperRun title="Slip propagation as cohort-compensation pressure.">
                    When a slip occurs &mdash; a damaged container, a port congestion delay, a customs hold, a documentary discrepancy, a cold-chain breach &mdash; atomic resolution puts <em>every</em> seller in the importer&rsquo;s process in the same position: nobody is paid until the importer resolves, and the importer resolves when it is satisfied. The arithmetic of that position is exact and readable from the record. A co-seller that has already performed carries an exposure to another&rsquo;s fault of <Math>{"P_i + 2G_i"}</Math> &mdash; the payment it is waiting on, plus its whole bond standing against goods it has already parted with. One that has not yet performed carries at least <Math>{"P_i + G_i"}</Math>, since it still holds what is in its hands. Every seller in the cohort therefore holds a computable, bonded interest in every other seller&rsquo;s performance, arising from the settlement rule alone and needing no communication, no repeated dealing, and no prior acquaintance to exist. That is what makes cohort-internal remedy the cheap path: the party whose performance failed bears the larger share, sellers whose service was unaffected contribute less or nothing, and compensation flows from the cohort to the importer <em>before</em> any external mechanism &mdash; dispute forum, insurer, regulator &mdash; is engaged, because the alternative for each of them is a position that nothing but resolution ends. What the settlement rule establishes is the interest and its magnitude, not a course of conduct: whether co-sellers press the failing party, arrange a substitution, or simply wait is behaviour this paper does not model. Nor is the interest a substitute for knowledge. Which operational unit caused the slip is not something the record shows &mdash; performances are off-chain, exactly as the value is &mdash; so identifying it remains the parties&rsquo; work, with external forums ruling on the open record plus whatever the parties bring them.
                </PaperRun>
                <PaperRun title="What the pressure is, and is not.">
                    The pressure just described is a logistics-specific consequence of the settlement primitive restated in Section 3, not a separate result: atomic resolution is what puts every seller in the cohort in the same position, and the doubled bond is what makes each one&rsquo;s exposure to a peer&rsquo;s fault a figure rather than a hope. It needs no repeated interaction among the sellers, no local information they hold about one another, and no punishment technology outside the arrangement &mdash; each bond is posted individually against that seller&rsquo;s own link, and the coupling comes from atomic resolution rather than from any shared obligation among the sellers. It is also confined: the cohort assembled for one shipment does not select its members and does not monitor them, and nothing here claims that it does. The useful reading for a logistics deployment is narrow and still substantial: the cohort has a stake in the shipment closing that a consortium-governed shared ledger tried to manufacture through transparency and could not, and it has that stake among strangers, on the first shipment, without anyone administering it.
                </PaperRun>
                <PaperRun title="What the pressure does across repeat shipments.">
                    One consequence reaches beyond the single process. Because each co-seller&rsquo;s exposure to a peer&rsquo;s fault is a figure it can compute rather than a reputation it must infer, a provider whose failures repeatedly draw the cohort into compensation negotiations becomes expensive to stand beside in a measurable way: the exposure a carrier or a port accepts when it commits alongside that provider is arithmetic on the accumulator, available before it signs. Nothing in the mechanism scores anyone, carries anything from one process into the next, or ranks a party &mdash; what it supplies is a figure, and the judgement is made by the parties, outside it. There is no managerial layer here and no ledger operator, and the pressure exists on the first shipment as fully as on the hundredth.
                </PaperRun>
            </PaperSection>

            <PaperSection title="6. Clauses">
                <p>
                    The composition needs no new clause. Every clause it composes is registered protocol infrastructure, including the one a container shipment might be expected to lack &mdash; a canonical record of the seal. One candidate remains open, and the built composition does without it. The bill-of-lading transferability question is treated separately in Section 7.
                </p>
                <PaperRun title="The clauses the composition uses.">
                    On the orders themselves:
                </PaperRun>
                <ul className="space-y-2 list-disc pl-6 text-sm">
                    <li><em>Commerce</em> &mdash; the per-leg payment commitment, on every order.</li>
                    <li><em>Cargo</em> &mdash; the shipment&rsquo;s logistic-unit measures: gross and net mass, volume, packaged dimensions, packaging type and count, and the marks the packages carry.</li>
                    <li><em>Geolocation</em> &mdash; the leg&rsquo;s origin and destination under a declared geocode standard, committed at signing. It carries no runtime stage and reports no positions: where a route is tracked as it runs, the positions are events on the carrier&rsquo;s own process log, not on this clause.</li>
                    <li><em>Modalities</em> &mdash; the buyer&rsquo;s requested delivery modality for the process.</li>
                    <li><em>Hand-off</em> &mdash; the point at which a physical exchange occurs on a given order: one hand-off per order that has one, and never two. A leg whose single seller touches the cargo more than once therefore has a choice, and it is a composition choice rather than a clause one. Either the order names the one hand-off that matters to the parties &mdash; the point the proximity policy witnesses &mdash; and the seller&rsquo;s other movements are events on its process log; or the leg is composed as more than one order, each with a hand-off of its own and each bonded in the ordinary way. The built composition takes the first course throughout: one hand-off on the carrier&rsquo;s order, one on the drayage order, and none on the orders that move no cargo.</li>
                    <li><em>Proximity policy</em> &mdash; nested under the hand-off: the accepted detection bands committed at signing, with the proof that a particular transfer occurred within one of them filed as a runtime witness stage on the same clause, at each container transfer point.</li>
                    <li><em>Chain of custody</em> &mdash; the goods&rsquo; integrity regime and its events; treated on its own below.</li>
                    <li><em>Cold chain</em> &mdash; for reefer cargo: the temperature class, the agreed window in whole degrees, the recording interval and the monitoring standard committed at signing, with the observed minimum and maximum over each period filed as the witness stage.</li>
                    <li><em>Freight class</em> &mdash; the declared classification where a road leg needs one.</li>
                    <li><em>Acceptance criteria</em> &mdash; the committed basis on which goods or work are accepted: what an inspection service attests against and what the importer&rsquo;s receipt refers to, with the outcome filed as the witness stage. Resolution is never conditioned on it; it is the shared reference an acceptance argument is conducted in.</li>
                    <li><em>Emissions</em> &mdash; a free-form accounting methodology (GHG Protocol, ISO 14064, PAS 2050, EN 16258, or any other) committed at signing, with measured grams CO&#8322;e filed as the witness stage. It goes on the transport edges the parties want it on rather than on all of them by default; in the built composition that is the ocean carrier&rsquo;s order, the leg that dominates a container shipment&rsquo;s emissions.</li>
                    <li><em>Merchant and courier process events</em> &mdash; the sister pair of per-role event logs, the merchant form for coordinating roles (forwarder, inspection service, customs agent) and the courier form for transport roles (ocean carrier, inland carriers). The carrier&rsquo;s per-role event log over a multi-stop voyage is this clause, not a proposal.</li>
                    <li><em>Consent</em> &mdash; the wallet&rsquo;s cryptographic attestation to pinned off-chain documents by content hash, used at the customs-agent leg for the filing terms.</li>
                    <li><em>Incoterms 2020</em> &mdash; the registered anchor for the trade-delivery term and its named place; treated below.</li>
                    <li><em>Topology</em> &mdash; the agreement-only clause carrying the parties&rsquo; own account of how the orders relate. The kernel stores no such structure: it sees a sequence of commits extending one accumulator, and the ordering the operational chain has is committed here and reconstructed off-chain by whoever reads the record.</li>
                </ul>
                <p>
                    And at the assembly scope, binding every order in the composition alike: the <em>applicable-law</em> clause naming the governing body of law and, optionally, a venue and a language; and an <em>arbitration</em> clause naming a decentralized forum and the terms on which it is seised. Neither puts anyone on the settlement path &mdash; a named forum has no more power to resolve than an unnamed one, per Section 3 &mdash; and naming one in advance fixes the venue rather than creating the recourse. A third assembly-scope clause is not a design choice at all: the <em>provenance</em> section records which published composition the agreement instantiates, and its value is the composition&rsquo;s own hash, folded in mechanically at checkout because no party could supply it. That is what lets a use of the composition be counted against the composition, which is how its author is paid.
                </p>
                <PaperRun title="The chain-of-custody clause.">
                    Container seals are the integrity mechanism of ocean shipping: a uniquely numbered seal is applied at stuffing and broken only at a customs examination or at the destination. Carrier, ports, customs and consignee all need one canonical record of when it was applied, when it was inspected intact, and whether it was ever breached &mdash; and that record is the registered chain-of-custody clause, which the composition already composes on the shipper&rsquo;s order (where the regime opens) and on the carrier&rsquo;s (where the sealed leg runs). What the clause commits at signing is the <em>regime</em>: a free-form reference to the integrity scheme the parties follow &mdash; a high-security bolt seal on a numbered container, a tamper-evident bag, a rail wagon seal &mdash; together with the custody unit&rsquo;s identifier where one is already assigned. What it carries at runtime is the event sequence, one witness-stage attestation per event: <em>applied</em>, <em>inspected intact</em>, <em>transferred</em>, <em>breached</em>, or <em>removed</em>, each with the unit identifier, the seal identifier where the scheme uses one, when it occurred, optionally where, and an optional reference to captured evidence such as a photograph or an inspection report. The enum distinguishes the two ways a seal comes off: an authorised removal at a customs examination or at destination unsealing is <em>removed</em>; an unauthorised one is <em>breached</em>.
                </PaperRun>
                <p>
                    Two design choices in that clause are worth drawing out, because both are places a specification naturally goes wrong. The first is what it does <em>not</em> carry: there is no attesting-inspector field. The wallet that files an attestation is recorded by the attestation itself, and a field restating it would be a second, forgeable copy of a fact the record already holds authenticated. The second is the openness of the scheme reference. Because the scheme is a free-form reference to an external standard rather than a value drawn from a closed list, a sealed ocean container, a tamper-evident courier bag and a wagon seal are the same clause under different regimes, and a regime nobody has specified yet needs no new clause identity to be usable &mdash; which is what a closed list of transport-mode sister clauses would have cost. Custody continuity, gaps between events, and the exposure a breach implies are derived at read time from the witnessed sequence against the committed regime; none of it is stored, and nothing needs to be, because the events are already merkle-bound to the agreement the parties signed.
                </p>
                <PaperRun title="The one candidate: customs clearance.">
                    A customs-clearance clause &mdash; a typed record of the authority&rsquo;s determination on a specific entry &mdash; is a candidate and is declared as one here. The composition as built does without it, and the substitute is worth stating because it may be the right answer permanently: the customs agent files the entry sequence as ordinary process events on its own order, and the parties bind themselves to the filing terms by content hash through the consent clause. What that arrangement records is what an agent can honestly attest &mdash; what it filed, when, and against which terms &mdash; and it stops short of putting a sovereign determination into a clause a commercial party signs. A dedicated clause would be worth registering only if the authority itself attested, which is a question about how a customs administration chooses to operate rather than about the protocol; the clause would be registered permissionlessly, like any other, and would touch neither the kernel nor any clause already in use.
                </PaperRun>
                <PaperRun title="The Incoterms 2020 clause.">
                    Incoterms 2020 (from the International Chamber of Commerce) are the international trade vocabulary for risk-transfer points and cost allocation across legs of a shipment. The current edition&rsquo;s eleven rules are EXW, FCA, CPT, CIP, DAP, DPU, DDP, FAS, FOB, CFR, CIF (ICC, 2020); the interpretive tradition around the terms is older than that edition and turns over with it, the guide to the previous edition (Ramberg, 2011) reading a rule set that DPU had not yet entered. The vocabulary is useful as cross-party shared reference, but the traditional Incoterms semantics come from a context without the bonded primitive&rsquo;s invariants and may not all map cleanly. We treat this carefully because it is the canonical worked example of how traditional commercial vocabulary smuggles in assumptions the bonded architecture cannot honor.
                </PaperRun>
                <p>Three structural mismatches deserve direct treatment.</p>
                <p>
                    <em>There is no risk-transfer point in the bonded structure.</em> Incoterms encode one: &ldquo;risk transfers from seller to buyer at point X.&rdquo; Under the bonded primitive nothing transfers at X, because there is no partial discharge and no event-triggered discharge of any kind &mdash; a seller&rsquo;s bond stands, in full, until the buyer resolves the whole process, and resolution settles every order together. An attestation cannot release a bond, and no operation exists that would let one. What the hand-off attestation due at the named place actually does is evidentiary: it is the record the buyer&rsquo;s acceptance turns on at that boundary, and the thing a forum would be shown if the parties later disagreed about whether the goods were where the term said they would be. So the reading that survives the port is not &ldquo;the attestation at X discharges the seller&rsquo;s exposure&rdquo; but &ldquo;the attestation at X is what the parties agreed would evidence performance at X&rdquo;; exposure ends at resolution and nowhere else. Read that way the Incoterm keeps its whole operational function &mdash; the parties still know who arranges carriage, who arranges insurance, and where the goods change hands &mdash; while the allocation of consequence, which the term states as a transfer, is instead what the bonds and the buyer&rsquo;s resolution already price.
                </p>
                <p>
                    <em>Cost-vs-risk separation collapses.</em> Incoterms separate &ldquo;who pays for transport&rdquo; from &ldquo;who bears risk during transport.&rdquo; Under the bonded primitive the two are not separately allocable, because both fall out of the process structure: the party that pays for a leg is the buyer of that leg&rsquo;s order, and what the term calls bearing risk is what the schedule already prices on both sides of every order until the process resolves. Features that genuinely add a second obligation &mdash; a seller-arranged insurance cover, for instance &mdash; are composed as a parallel bonded leg with the insurer as its own seller, not encoded into the delivery clause.
                </p>
                <p>
                    <em>Buyer dominance changes the resolution model.</em> Incoterms presuppose good-faith settlement between the parties; the bonded primitive supplies the reason for it, in mutual assured destruction at the doubled schedule plus a settlement only the buyer can call. The dispute-resolution paths the terms travel with &mdash; typically adjudication in a local commercial court &mdash; continue to function, but as an external forum the parties name in their agreement rather than as an internal property of the term, ruling while the process stands open and feeding the remedy the buyer&rsquo;s acceptance will record.
                </p>
                <p>
                    The right clause is therefore not &ldquo;Incoterm as a traditional contract clause&rdquo; but <em>Incoterm as a reference to the delivery arrangement the parties composed</em>. The registered anchor commits exactly two things: the declared rule, drawn from the eleven of the 2020 edition, and the named place that every one of those rules requires, in the standard&rsquo;s own citation form. It encodes no per-term semantics &mdash; the canonical text is the ICC&rsquo;s publication and stays there &mdash; and it does not duplicate the machine-readable location, which arrives instead by placing the geolocation clause alongside it on the same order: shared reference lives in composition, not in duplicated fields.
                </p>
                <p>
                    This split lets a future ICC edition (an Incoterms-2030 clause, etc.) ship as a new clause identity rather than a mutation of the registered anchor. Per-term mapping verification &mdash; which terms map directly, which require composition with parallel processes (insurance, customs), and which do not transfer at all &mdash; is standing analysis against the kernel&rsquo;s invariants rather than anything the registered anchor encodes: the clause references the ICC term and the named place; it does not restate or compute the term&rsquo;s obligations, and it does not itself resolve which terms map directly versus which require an auxiliary process. The Incoterms clause is a clean illustration of the principle that the protocol anchors shared references but does not import every contractual assumption that travels with traditional vocabulary.
                </p>
                <PaperRun title="Clauses the assembly does not include.">
                    The assembly does not include a multi-currency-cross-leg clause (would break same-unit comparability and the bonding equilibrium), a force-majeure-escape clause (would re-introduce the kind of unilateral exit the kernel forbids), or a transferability clause internal to commerce. The transferability question is treated separately in Section 7 as a protocol-layer composition pattern.
                </PaperRun>
            </PaperSection>

            <PaperSection title="7. Bill of Lading Transferability">
                <p>
                    The bill of lading is the carrier&rsquo;s receipt of cargo, the contract of carriage, and (in the negotiable case) a document of title. The transferability question &mdash; whether the right to receive cargo at destination can be transferred mid-shipment from the original consignee to a new consignee &mdash; is doctrinally significant because container-shipping commerce often involves cargo sale in transit, and the canonical legal artifact for that sale is endorsement of the bill of lading.
                </p>
                <p>
                    The bonded primitive&rsquo;s kernel does not support party substitution within a single bonded order. Three kernel invariants each independently rule it out: the buyer is fixed at root commitment and identical across every sub-order in the process; the parties to each commitment are fixed at the moment of commit; and the no-escape-hatches discipline forbids unilateral exit paths from a bonded state. A literal endorsement of the BoL during shipment would require any of these invariants to bend, and they do not bend.
                </p>
                <PaperRun title="The endorsement is an event outside the process.">
                    The substitution the kernel refuses and the commerce the parties want are not the same thing. Title moves by the instrument the law already recognises, outside the protocol entirely; what remains inside is an allocation of payments across a fixed schedule, and that is squared before the buyer&rsquo;s one terminal call &mdash; the same treatment every other outside event receives. The sellers downstream of the transfer point return their committed payment amounts to the buyer; any performance variation, a new discharge port or a new receiving party, is attested as what actually happened; and the buyer&rsquo;s single resolution then settles the committed schedule atomically, the pre-paid legs netting to zero. One bond cycle, no early resolution, and no party substituted anywhere.
                </PaperRun>
                <p>
                    The equilibrium survives the netting, which is what makes it a mechanism rather than a hope. Every bond stays deposited through the negotiation, so each party&rsquo;s exposure is unchanged while the transfers are agreed; and resolving remains strictly better for the buyer once the transfers are collected, since retaining amounts bounded by the payment while forfeiting a bond of twice it is strictly worse than resolving. The pressure that makes the original schedule credible is exactly the pressure that makes its reallocation credible.
                </p>
                <PaperRun title="What this does and does not give the new owner.">
                    The honest limit is that no transferable right is minted inside the protocol. The new owner holds title by the external instrument and never becomes a party to the process, so their protection between payment and discharge is the ordinary legal layer together with the committed evidence &mdash; which is why the netting agreement is itself worth attesting, so the evidence demonstrates why the transfers happened. A shipping reader pressing the transferable-record question should read the answer this way: the singular, controlled artifact remains the bonded commitment, identified by its content-addressed order identifier and admitted exactly once by its status; the endorsement chain lives beside it in law, not inside it.
                </PaperRun>
                <PaperRun title="Order-form and bearer-form.">
                    The distinction between order-form bills, transferred by endorsement to a designated party, and bearer-form bills, transferred by delivery of the instrument itself, does not change the treatment. Both move title outside the protocol, and both leave the same question inside it &mdash; who is owed what against a schedule already signed &mdash; which the pre-resolution transfers answer. What neither form obtains is an in-protocol right that circulates on its own; the commerce is expressible, the circulating instrument is not.
                </PaperRun>
            </PaperSection>

            <PaperSection title="8. Comparison with Existing Approaches">
                <PaperRun title="TradeLens.">
                    TradeLens was a permissioned consortium ledger; the architecture proposed here is a permissionless bonded settlement primitive. The functional comparison is asymmetric: TradeLens supplied information transparency without settlement; the bonded architecture supplies settlement (with information transparency emerging as a byproduct of the bonded record). The governance comparison is also asymmetric: TradeLens was governed by IBM&ndash;Maersk; the bonded architecture has no governance at the kernel layer.
                </PaperRun>
                <PaperRun title="CargoX.">
                    CargoX is a blockchain-based bill-of-lading platform that emphasizes transferable-electronic-record functionality and MLETR compliance (CargoX, 2023). CargoX is a focused product addressing the BoL transferability problem; the bonded architecture is a more general settlement primitive whose relationship to CargoX is composable rather than competitive. A shipper using the bonded architecture for the bilateral transport coordination could compose CargoX (or its successor) at the BoL layer, with the bonded record providing the underlying settlement evidence and the CargoX layer providing the transferable-instrument semantics.
                </PaperRun>
                <PaperRun title="TradeTrust.">
                    TradeTrust, a Singapore-government-backed framework for electronic transferable records, supplies open-source tools and standards for issuing and managing electronic BoLs and similar instruments (IMDA, 2023). Like CargoX, it is composable with the bonded architecture rather than competitive with it. TradeTrust&rsquo;s standards-based approach to MLETR fit produces artifacts that are interoperable with the bonded composition&rsquo;s evidence record.
                </PaperRun>
                <PaperRun title="MLETR.">
                    The UNCITRAL Model Law on Electronic Transferable Records (2017) is a legal framework rather than a technology platform (UNCITRAL, 2017), so it is not an alternative to the architecture but a standard the architecture&rsquo;s record can be held against. Where the bonded composition meets it is the transfer pattern of Section 7, and the bearer-form exclusion stated there is the honest limit of the meeting.
                </PaperRun>
                <PaperRun title="The architectural distinction.">
                    The TradeLens replacement is not a better TradeLens. It is a re-architecture of the underlying coordination function from <em>shared ledger maintained by consortium</em> to <em>bonded settlement primitive composed by participants</em>. The shift is structurally substantial: the consortium&rsquo;s role is absorbed into the kernel&rsquo;s permissionless protocol; the carriers&rsquo; participation decision is reduced to whether to compose with the protocol on individual shipments rather than whether to ratify a competitor&rsquo;s gatekeeping. The decision is made at the level of individual commerce rather than at the level of industry governance.
                </PaperRun>
            </PaperSection>

            <PaperSection title="9. Scope">
                <p>The argument bounds itself by several scope conditions.</p>
                <PaperRun title="Asset specificity at the port layer.">
                    Major ports are functional monopolies for the slot, terminal capacity, and operational infrastructure they provide; carriers have limited alternative-supplier leverage at congested hubs. The architecture&rsquo;s competitive properties at the port-supply layer are constrained accordingly: where the port-of-call is dictated by the route and the port seller is a near-monopolist, the buyer-dominance leverage at the sub-procurement is attenuated. The architecture continues to function in these cases (the bond posture is well-defined; the resolution path is clean) but it does not produce price competition in port services where structural conditions don&rsquo;t admit it.
                </PaperRun>
                <PaperRun title="Customs and sovereign authorities.">
                    Customs authorities have two distinct functions in this composition. As bonded sellers of border-clearance service (charging the importer for handling, examination capacity, filing-receipt processing) they are wallets on the same footing as any commercial provider &mdash; the kernel does not distinguish a tax from a fee for service &mdash; and their participation in the bonded process is unproblematic at the kernel layer. As sovereign decisional authorities on whether specific goods clear under the relevant tariff schedule, they continue to operate in their own register, off-chain; the architecture does not re-engineer customs administration and the kernel does not encode the sovereign decision. The bonded composition produces a verifiable evidence record on which customs decisions can operate and which customs decisions are recorded against; this is an improvement over the paper-and-database baseline but not a substitute for the sovereign authority itself.
                </PaperRun>
                <PaperRun title="Bond-currency at the small-shipper end.">
                    Small shippers without crypto-treasury infrastructure face operational friction at the bonding step. The constraint is real but solvable through ordinary party-of-record aggregation: a forwarder that consolidates small shippers&rsquo; cargo is itself the kernel seller on the resulting commitment, posting its own bond as its own deterrent on its own performance, and the small shippers are its off-chain customers under conventional commercial terms. The bond is never outsourced or rented &mdash; the deterrent works only as the forwarder&rsquo;s own staked skin &mdash; and what aggregates is the commitment itself, not the bonding. This is a runtime-tier implementation question rather than a substrate-tier question; the substrate is denomination-agnostic.
                </PaperRun>
                <PaperRun title="Insurance and reinsurance.">
                    Marine insurance, P&amp;I clubs, and the general apparatus of shipping-risk underwriting continue to operate on the objects insurance has always covered &mdash; the cargo, the hull, third-party liability, the real-world externalities of moving goods. The bonded architecture changes the risk profile these markets price on those objects (a smaller residual after bond allocation; a container that arrives against a verifiable evidence record rather than a contested paper trail), and incumbent insurers can adapt their cargo and liability products to read that record. What insurance does not extend to is the bond itself: a bond is a party&rsquo;s own staked deterrent, not an insurable position. A policy that made a party whole against its own bonded exposure would hedge away the very exposure the bond exists to create &mdash; it would neutralize the deterrent and, with it, the equilibrium the mechanism induces &mdash; so the mechanism&rsquo;s design excludes it. Insurance composes with the bonded primitive by covering the cargo, never by covering the bond.
                </PaperRun>
                <PaperRun title="Network effects and adoption.">
                    The architecture&rsquo;s adoption dynamics differ from TradeLens&rsquo;s in that no participant must ratify any other participant&rsquo;s governance position. A shipper, forwarder, or carrier can participate on individual shipments without joining anything; the participation decision is shipment-by-shipment rather than platform-membership-shaped. We do not model the diffusion trajectory beyond noting that the structural barrier that defeated TradeLens (consortium ratification by competitors) is absent here.
                </PaperRun>
            </PaperSection>

            <PaperSection title="10. Conclusion">
                <p>
                    TradeLens failed for a governance reason no consortium-governance fix resolves: a platform accountable to one participant in the industry it serves asks that participant&rsquo;s competitors to ratify its position, and they will not. The structural alternative is not a better consortium but no consortium at the platform layer &mdash; permissionless, ownerless infrastructure, with whatever industry arrangements the participants care to compose on top. The bonded primitive supplies the shape: each leg of a shipment is a bilateral bonded commitment, each seller bonding twice the value the process has accumulated through its own link; a single atomic resolution, callable only by the buyer of record, settles the whole chain and leaves every seller in the cohort holding a computable interest in every other&rsquo;s performance until it comes. What the present paper supplies is the composition at that perimeter &mdash; the organizational handoff chain and the linear commit sequence held apart, the per-commit bond posture worked through, the shipped clause set that carries the seal, the custody, the cold chain, the acceptance basis, the emissions and the Incoterms anchor, and the treatment of bill-of-lading transferability as commerce settled by pre-resolution transfers rather than by a circulating right. The coordination TradeLens tried to obtain by asking an industry to consolidate under one of its members is obtained here per shipment, by parties who need not agree on anything but the shipment.
                </p>
            </PaperSection>
        </PaperLayout>
    );
}
