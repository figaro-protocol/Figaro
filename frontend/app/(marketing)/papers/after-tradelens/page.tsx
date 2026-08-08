import type { Metadata } from "next";
import Link from "next/link";
import {
    PaperLayout,
    PaperSection,
    PaperRun,
} from "@/components/papers/PaperLayout";
import { Math } from "@/components/papers/Math";

export const metadata: Metadata = {
    title: "After TradeLens: A Permissionless Bonded Replacement — Figaro Protocol",
    description:
        "TradeLens failed for a structural reason no governance fix resolves: a competitor-controlled platform asks rival carriers to ratify a competitor's gatekeeping. The fix is no consortium at the platform layer. A permissionless bonded composition coordinates the inter-logistics perimeter without one.",
};

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
            | container-seal inspection
            v
        port-of-loading (terminal services)
            |
            | handoff: container loaded; master BoL issued
            v
        ocean carrier
            |
            | vessel-position stream (geolocation),
            | container-seal sequence,
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
                        TradeLens (2018&ndash;2023), the IBM&ndash;Maersk container-shipping consortium that aimed to produce a tamper-proof shared record of every container&rsquo;s journey, shut down in 2023 even after several major carriers had joined, because the industry never consolidated under it &mdash; rival carriers split across competing consortia rather than concentrate a shared industry resource under one competitor&rsquo;s platform. The shutdown was not a software failure. It was a governance failure visible from the consortium&rsquo;s structural shape: a competitor-controlled platform that the rest of the industry would not consolidate under, with high integration cost and no settlement guarantee binding parties to the arrangement. The failure was structural, predictable from the shape of the architecture, and not specific to TradeLens. TradeLens is one species of a broader pattern: institutional apparatus from the prior era of trade coordination &mdash; consortium governance, on-chain voting, contract-engineering toolchains &mdash; ported onto a new technical substrate without changing the underlying coordination mechanism.
                    </p>
                    <p>
                        The architectural alternative we develop operates at the same perimeter TradeLens attempted: inter-logistics coordination among ocean carriers, ports of loading and discharge, customs authorities, freight forwarders, NVOCCs, customs agents, trade-finance parties / LC issuers, marine insurers, and inspection services. We present a permissionless, ownerless bonded composition built on the Figaro kernel&rsquo;s two mechanisms (asymmetric bonding plus buyer dominance with atomic resolution). The composition has no consortium, no foundation, no admin function, no upgrade path, and no central party who can be ratified or refused. Each provider is an off-chain real-world asset (RWA) whose on-chain participation is mediated by a wallet, with a human or autonomous agent operating the wallet on the asset&rsquo;s behalf. The root buyer at this perimeter is the buyer-of-record at the relevant tier; the kernel is agnostic about which party occupies the buyer slot. Bonded commitments at each commit lock skin in the game proportional to the cumulative process value; atomic resolution by the buyer-of-record settles the whole process on receipt of the goods at the agreed delivery point. Carriers who want to participate compose; carriers who do not do not, with no consequence for either decision.
                    </p>
                    <p>
                        The clauses the composition draws on are largely existing infrastructure (commerce, geolocation, modalities, proximity-policy, emissions, and the registered Incoterms-2020 anchor) &mdash; the proof that a container transfer occurred at the agreed place rides proximity-policy&rsquo;s runtime witness stage rather than a separate proof clause; a new container-seal clause and proposed candidates (a carrier process-log, a customs-clearance clause) extend the protocol&rsquo;s surface additively, without touching the kernel. We also treat the bill-of-lading transferability question through the cancellable-seller / counter-process pattern that expresses transferability at the protocol layer without weakening the kernel&rsquo;s invariants.
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
                <PaperRun title="Wallets, real-world assets, and the perimeter.">
                    Every party in the bonded composition is a wallet representing an off-chain real-world asset (RWA) with productive, commercial value &mdash; an ocean-going vessel, a port terminal&rsquo;s berth and crane capacity, a customs authority&rsquo;s clearance service, a forwarder&rsquo;s multi-modal coordination capability, an inspection service&rsquo;s on-the-ground presence, a marine insurer&rsquo;s underwriting capacity. The wallet holds the asset&rsquo;s earnings as token balances and points to the asset&rsquo;s off-chain credentials through NFTs (a vessel&rsquo;s classification certificate, a port seller&rsquo;s authority licence, a customs broker&rsquo;s customs licence, an insurer&rsquo;s policy authorisation). A human or autonomous agent operates the wallet on the asset&rsquo;s behalf. Public-authority wallets (port authorities, customs authorities) participate on the same footing as commercial providers; the kernel does not distinguish a tax from a fee for service. A wallet is an active counterparty in the composition iff the underlying asset is alive and its credentials are current &mdash; the asset / wallet / seller three-layer split is load-bearing throughout what follows.
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
                    TradeLens did attract major non-Maersk carriers: MSC and CMA CGM joined as foundation carriers in 2020, with Hapag-Lloyd and Ocean Network Express (ONE) also participating. But the industry did not consolidate under it. As reported by The Loadstar (2022), a rival consortium &mdash; the Global Shipping Business Network (GSBN) &mdash; drew other carriers and terminal operators, with some, including Hapag-Lloyd and ONE, engaging with both groupings rather than consolidating under either; we rely on The Loadstar&rsquo;s account for this specific configuration and do not independently verify GSBN&rsquo;s founding membership beyond it. With the industry split across competing consortia, no single platform held the share of cargo volume its value proposition required. In November 2022, IBM and Maersk announced the shutdown, citing the failure to reach the level of commercial viability needed for full global industry collaboration; production ended in Q1 2023 (The Loadstar, 2022).
                </PaperRun>
                <PaperRun title="Why the industry would not consolidate.">
                    The standard adoption-dynamics reading explains the shutdown through a familiar mechanism: shippers want a single ledger covering 90%+ of their cargo volume; with the industry split across TradeLens and the rival consortium, no single platform held that share; without comprehensive data, shippers wouldn&rsquo;t commit to any one platform; without that commitment, carriers had no incremental reason to consolidate under a competitor&rsquo;s platform; the equilibrium was fragmented non-consolidation. This is correct as far as it goes.
                </PaperRun>
                <p>
                    The deeper reading is that the non-Maersk carriers correctly identified a strategic problem with the platform&rsquo;s governance shape, and responded by hedging across a rival consortium rather than consolidating their operational data under it. A platform controlled by Maersk, with IBM as the technical seller and Maersk as the principal customer, is structurally a coordination layer whose governance accountability runs to a single industry participant; other carriers are being asked to provision their operational data into a layer whose contested cases will resolve in that participant&rsquo;s favour. Whatever the platform&rsquo;s formal governance arrangements, the controlling-competitor dynamic is the binding constraint on competitors&rsquo; participation.
                </p>
                <p>
                    The argument is not that Maersk acted in bad faith or that the formal governance was inadequate. The argument is that the platform&rsquo;s shape <em>is</em> the problem: a competitor-controlled infrastructure requires other competitors to ratify the controller&rsquo;s strategic position relative to the industry, and there is no formal-governance fix that dissolves this requirement. Carriers proved unwilling to consolidate exclusively under a Maersk-controlled platform regardless of how its governance was configured &mdash; several joined but hedged across a rival consortium rather than concentrate the industry&rsquo;s coordination layer under one competitor.
                </p>
                <PaperRun title="The general lesson.">
                    TradeLens&rsquo;s failure is not specific to IBM, to Maersk, or to shipping. It is the recurring pattern of consortium-governance infrastructure: any platform whose governance accountability runs to a participant of the industry the platform is meant to serve will face structural participation refusal from that participant&rsquo;s competitors. The fix is not better consortium governance; the fix is no consortium at the platform layer. Adjacent industries have run the same experiment with the same outcome: various consortium attempts at securities settlement, healthcare-records consortia. The instructive contrast is SWIFT, which survives in payments precisely because its governance is member-neutral &mdash; a cooperative controlled by no single competitor &mdash; rather than accountable to one participant of the industry it serves. The structural alternative is permissionless, ownerless infrastructure at the platform layer, with whatever industry-specific arrangements the participants want to compose on top.
                </PaperRun>
            </PaperSection>

            <PaperSection title="3. The Settlement Primitive">
                <p>The bonded primitive in the settlement kernel has two mechanisms. We summarize the features the present argument uses.</p>
                <PaperRun title="Asymmetric bonding (Mechanism 1).">
                    For a transaction with payment <Math>{"P > 0"}</Math> and cumulative upstream value <Math>{"G \\geq P"}</Math>, the buyer locks <Math>{"2P"}</Math> and the seller locks <Math>{"2G"}</Math>. Cooperation is the unique profile surviving iterated elimination of weakly dominated strategies (derived in <Link href="/papers/asymmetric-bonding" className="text-ink-heading hover:underline">Asymmetric Bonding and Buyer Dominance</Link>, &sect;4.1, and extended to <Math>{"N"}</Math> parties in &sect;5.1). The mechanism scales to <Math>{"N"}</Math>-party processes: each seller bonds against the cumulative value of all upstream commitments, producing a mesh of independently secured bilateral edges, each carrying its own equilibrium.
                </PaperRun>
                <PaperRun title="Buyer dominance with atomic resolution (Mechanism 2).">
                    Only the root buyer can trigger resolution; resolution settles all active orders in the process simultaneously or not at all. The all-or-nothing rule induces a weakest-link subgame among sellers: each seller stands to lose its own payment <Math>{"P_i"}</Math> and bond <Math>{"2G_i"}</Math> if any co-seller&rsquo;s failure leads the buyer to withhold resolution &mdash; cooperation pressure without explicit communication, governance, or managerial layer.
                </PaperRun>
                <PaperRun title="What this implies for shipping coordination.">
                    Mechanism&nbsp;1 prices each leg&rsquo;s enforcement in proportional bond posture without requiring any consortium or platform to underwrite it. Mechanism&nbsp;2 enforces the multi-leg coordination at resolution without requiring any party to govern the multi-leg arrangement. The two mechanisms together supply the coordination function that TradeLens attempted to supply through a consortium-governed shared ledger; they supply it without needing the consortium. Permissionlessness alone removes the veto but gives self-interested rivals nothing to coordinate on; bonded settlement supplies the enforcement a bare permissionless ledger cannot. Both mechanisms price settlement discipline under perfect monitoring with costless performance; an honest dispute over whether a leg was performed as agreed is adjudicated not by the bond posture but by the forums composed above it. Costless performance is the assumption a logistics reader should hold onto: bunker fuel, terminal handling, chassis time, and reefer power are consumed the moment a leg is performed, and at a positive performance cost <Math>{"c"}</Math> a provider facing a withholding buyer compares <Math>{"-2G - c"}</Math> with <Math>{"-2G"}</Math>, so the seller-side weak dominance does not survive unchanged &mdash; the derivation cited above states that caveat in its &sect;3.1 and, in its &sect;4.1, establishes what survives at positive cost in the two-party game: for a cost below the payment plus the provider&rsquo;s bond (<Math>{"c < P + 2G"}</Math>) the cooperative profile is still the unique survivor of iterated elimination, reached in two rounds rather than by one comparison. That two-round repair does not extend to the <Math>{"N"}</Math>-party mesh invoked above: the multi-leg equilibrium this paper composes across is claimed at <Math>{"c = 0"}</Math>. The composition developed here inherits the result, the bound, and the caveat alike.
                </PaperRun>
            </PaperSection>

            <PaperSection title="4. The Assembly">
                <p>
                    We now describe the bonded composition that operates at the TradeLens perimeter. The composition has two layers that must be kept distinct: the <em>organizational handoff chain</em> (how the container physically moves from origin to destination through the inter-logistics value-adders, documented via clause attestations) and the <em>kernel commit structure</em> (who commits to whom on-chain &mdash; the kernel requires every order&rsquo;s buyer to be the process&rsquo;s root buyer). The kernel is blind to the handoff chain; the clause layer documents it. The two layers co-exist in one process.
                </p>
                <PaperRun title="The organizational handoff chain.">
                    A container shipment is a sequence of operational handoffs from origin to destination. We sketch a canonical international flow, with the inter-logistics value-adders made explicit:
                </PaperRun>
                <CodeBlock>{HANDOFF_CHAIN}</CodeBlock>
                <p>
                    Marine insurance and trade-finance / letter-of-credit issuance operate as parallel value-adders bonded against the same process without sitting on the cargo-flow line &mdash; the marine insurer&rsquo;s wallet bonds against the goods&rsquo; value, the LC issuer&rsquo;s wallet bonds against the payment-on-documents arrangement, and both are sellers in the bonded composition without owning a physical handoff. Variations on the structure (intermodal rail substituted for inland truck, multiple consolidation points, transhipment ports, etc.) instantiate the same pattern with the operational divisions shifted to reflect the route. Every handoff along this chain is documented via a clause-typed attestation: a proximity-policy witness-stage attestation for cargo-transfer handoffs, container-seal for seal-state changes, geolocation for vessel-position updates, a customs-clearance attestation for the customs determination, and the modalities clause carrying the buyer&rsquo;s requested delivery modality. None of these attestations is a kernel commit; they are evidentiary records documenting the operational reality of the container&rsquo;s flow.
                </p>
                <PaperRun title="The kernel commit structure.">
                    The kernel commits, by contrast, all share one buyer: the kernel requires every order&rsquo;s buyer to be the process&rsquo;s root buyer, and the root buyer at this perimeter is the <em>buyer-of-record at the relevant tier</em>. Depending on the Incoterm and the operational arrangement, that party can be the importer-of-record, the consignee, a forwarder-of-record acting on the importer&rsquo;s behalf, or in seller-arranged shipments the shipper-of-record itself. The kernel is agnostic about which party occupies the buyer slot. We use <em>importer-of-record</em> as the running illustration; the apparatus is the same with any of the alternatives.
                </PaperRun>
                <p>
                    The commits document who the importer-of-record pays and how much: importer &rarr; shipper-of-record (for the cargo&rsquo;s invoice value, if the Incoterm assigns the import side that obligation), importer &rarr; freight forwarder, importer &rarr; NVOCC, importer &rarr; origin inland carrier, importer &rarr; inspection service, importer &rarr; port-of-loading authority, importer &rarr; ocean carrier, importer &rarr; port-of-discharge authority, importer &rarr; customs agent, importer &rarr; customs authority (for the import duty), importer &rarr; destination inland carrier, importer &rarr; marine insurer (if buyer-procured cover), importer &rarr; LC issuer (if the payment is letter-of-credit-arranged), and any other resource provider the operational arrangement draws on. The commits are independent of who hands the container to whom in the handoff chain above. The importer alone resolves on receipt at the agreed delivery point, settling the process atomically.
                </p>
                <PaperRun title="Granularity is a design choice.">
                    The same shipment can be composed coarsely (a few commits to aggregator wallets &mdash; the forwarder absorbs origin inland + port-of-loading + carrier + port-of-discharge + destination inland into one bonded commit) or finely (each value-adder a separate commit, as enumerated above). The kernel sees only commits; it does not reify any tier-role or aggregation choice. Granularity is chosen by the contracting parties to suit their coordination needs. The per-edge bonding equilibrium is invariant to the choice (each commit&rsquo;s <Math>{"2P"}</Math> / <Math>{"2G"}</Math> posture is independent of how many other commits the process carries); the cohort-pressure topology induced by atomic resolution is not, since each co-seller&rsquo;s exposed stake (<Math>{"P_i + 2G_i"}</Math>) depends on cohort cardinality. This paper develops the fine-grained version because the value-adder structure is the substantive content of the TradeLens-perimeter coordination problem; coarse aggregations are admissible, may be operationally appropriate in many deployments, and produce a different cohort-pressure topology that the assembly designer can engineer for.
                </PaperRun>
                <PaperRun title="Off-chain organizational shapes.">
                    The conventional inter-logistics chain involves named organizational shapes (shipper-of-record, consignee, forwarder, NVOCC, customs broker, importer-of-record, customs agent). Under the bonded composition the kernel does not see these tier-roles; each tier-role is whichever wallet the contracting parties designate at agreement signing. Off-chain organizational shapes that today perform discovery, curation, brand-as-quality-signal, or coordination services around the inter-logistics layer can still be filled by wallets representing the assets that provide those services and operated by whichever human or agent stack the asset&rsquo;s owner runs &mdash; but those wallets cannot insert themselves as kernel intermediaries between the buyer-of-record and the operational sellers, since the kernel forbids any party other than the root buyer from being the buyer of within-process commits.
                </PaperRun>
                <PaperRun title="Per-commit clauses.">
                    Each kernel commit pairs the standard commerce (payment) clause with the clauses appropriate to the seller&rsquo;s role:
                </PaperRun>
                <ul className="space-y-2 list-disc pl-6 text-sm">
                    <li><em>Shipper-of-record</em>: a proximity-policy hand-off attestation on goods presented for shipment, optional emissions disclosure for manufacturing emissions.</li>
                    <li><em>Freight forwarder</em>: a proximity-policy hand-off attestation on cargo receipt at consolidation; container-seal applied at the consolidation point.</li>
                    <li><em>NVOCC</em>: house bill-of-lading reference (the BoL itself is treated as a protocol-layer composition pattern in Section 7).</li>
                    <li><em>Origin and destination inland carriers</em>: proximity-policy hand-off attestations at pickup and dropoff; geolocation pickup and dropoff geohashes.</li>
                    <li><em>Inspection service</em>: container-seal inspection event; optional evidence-hash pointer to a pre-shipment inspection report.</li>
                    <li><em>Port-of-loading and port-of-discharge authorities</em>: payment for terminal handling and gate access; proximity-policy hand-off attestations at port-side transfers; container-seal inspected-intact attestations at each port handoff.</li>
                    <li><em>Ocean carrier</em>: an Incoterms-2020 clause anchoring the shipment term and named place; proximity-policy hand-off attestations on transfer to the vessel and at discharge; container-seal sealing events through the voyage; geolocation vessel-position attestations on the voyage cadence; an emissions disclosure for voyage emissions; for reefer cargo, cold-chain attestations.</li>
                    <li><em>Customs agent</em>: a customs-clearance attestation recording the customs authority&rsquo;s determination (a candidate clause, not yet registered), plus payment for entry-filing services.</li>
                    <li><em>Customs authority</em>: the import-duty payment lands in the customs-authority wallet at this commit. The kernel sees only the bonded payment; the authority&rsquo;s sovereign decision on whether the cargo clears stays off-chain. Section 9 treats the dual function.</li>
                    <li><em>Marine insurer</em>: the policy premium is the payment leg; the insurer posts the same <Math>{"2G"}</Math> bond every seller in the process posts &mdash; the cumulative process value up to its commit &mdash; as a deterrent, not as underwriting capacity. The underwriting capacity itself lives off-chain in the policy; the bond is identical in kind to every other seller&rsquo;s. Insurance composes with the bonded primitive without modifying the kernel.</li>
                    <li><em>LC issuer</em> (if applicable): the LC issuance fee is the payment leg; the issuer posts the same <Math>{"2G"}</Math> bond every seller posts, not a distinct credit-capacity stake. The documentary-payment arrangement itself lives off-chain in the LC terms; the bond is the ordinary deterrent, identical in kind to the rest of the cohort.</li>
                </ul>
                <PaperRun title="Operational sub-procurement as separate processes.">
                    Each value-adder&rsquo;s own procurement (the carrier&rsquo;s fuel + crew + maintenance, the forwarder&rsquo;s IT + staffing, the inspection service&rsquo;s labour + equipment, the port authority&rsquo;s terminal operations, etc.) is a separate process in which that provider wallet is itself the root buyer. The kernel does not link those processes to the importer&rsquo;s. Cross-process coordination is achieved through within-process cohort-pressure on each side and through off-chain reconciliation, not through cross-process atomic resolution; each provider wallet runs its own bonded processes for its operating expenses against its own counterparties.
                </PaperRun>
            </PaperSection>

            <PaperSection title="5. Bond Posture and Cascade Mechanics">
                <p>The composition&rsquo;s structural contribution is that each leg&rsquo;s risk is priced and propagated by the bonding rule of the kernel, without consortium intermediation.</p>
                <PaperRun title="Bond posture per commit.">
                    The kernel maintains a single process-wide cumulative-value accumulator <Math>{"G"}</Math> that grows monotonically as each commit lands (<Math>{"G \\leftarrow G + P_i"}</Math>). At every commit the importer-of-record (as root buyer) posts <Math>{"2P_i"}</Math> for that specific payment, and the seller posts <Math>{"2G_{\\text{at commit time}}"}</Math> &mdash; the full cumulative process value at the moment they commit. Bond posture is asymmetric: the importer&rsquo;s per-commit bond scales with the immediate payment, while each seller&rsquo;s bond scales with the cumulative value of every upstream commit in the process. Sellers committing later post correspondingly larger bonds; the last seller bonds against the full landed value of the cargo.
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
                        Stylized per-commit bond posture for a shipment with $1,000 total process value under one TradeLens-perimeter process with the importer-of-record as root buyer. The import duty ($39, rounded from 0.05 &times; $775 = $38.75) is 5% of the declared CIF value ($775 = $700 cargo + $15 marine insurance + $60 ocean freight). <Math>{"G"}</Math> is the process-wide cumulative-value accumulator. Per-leg payments are illustrative; absolute magnitudes vary with cargo class, route, tariff schedule, and the operational arrangement.
                    </p>
                </div>
                <p>
                    The asymmetry between importer-side and seller-cohort bonds is visible: the importer&rsquo;s aggregate locked bond is $2,000 (<Math>{"= 2G"}</Math>, twice the total process value &mdash; the sum of the per-commit <Math>{"2P_i"}</Math>), while the seller cohort&rsquo;s aggregate locked bond is $21,886, nearly eleven times the importer&rsquo;s. The seller cohort&rsquo;s bond is a large multiple of the total shipment value because each seller bonds against the cumulative <Math>{"G"}</Math> that has grown across upstream commits, and the inter-logistics perimeter has a substantial number of value-adders. As the composition adds more value-adders (transhipment ports, additional inland legs, multiple inspection services) the seller-side total grows super-linearly while the importer&rsquo;s aggregate grows only linearly with the total process value.
                </p>
                <PaperRun title="Slip propagation as cohort-compensation pressure.">
                    When a slip occurs &mdash; a damaged container, a port congestion delay, a customs hold, a documentary discrepancy, a cold-chain breach &mdash; the kernel&rsquo;s atomic-resolution rule means <em>every</em> seller&rsquo;s bond in the importer&rsquo;s process is at risk: the importer alone resolves, and the importer can withhold resolution while the seller cohort negotiates compensation. The unit whose performance failed bears the larger share of cohort-internal compensation; sellers whose service was unaffected contribute less or not at all. Compensation flows directly from the seller cohort to the importer before any external mechanism (specialized mechanism contracts, dispute forums, insurance, regulators) is engaged. The mechanism is buyer dominance plus atomic resolution under bond pressure: cooperation is the unique profile surviving iterated elimination of weakly dominated strategies, induced by atomic resolution operating on the bonded mesh. The same structural shape produces the joint-liability dynamic in Grameen-style microfinance, but operating without the social-substrate prerequisites Grameen requires (no repeated interaction, no local information, no exogenous punishment technology). Buyer dominance with atomic resolution is in this sense a <em>social mechanism</em>: it produces social-coordination behavior (peer pressure, cohort negotiation, burden-sharing, coverage of a struggling counterpart) endogenously through the bond architecture, with each provider wallet&rsquo;s continued participation in its market making the negotiation rationally compelled rather than socially expected. The off-chain question of which operational unit caused the slip is adjudicated by external forums with the bonded record as input.
                </PaperRun>
                <PaperRun title="Cohort pressure across the resource provider set.">
                    The composition exhibits cohort pressure across the seller set in the importer&rsquo;s process. Each seller&rsquo;s bond is at risk if any other seller&rsquo;s slip propagates to a resolution-withholding by the importer. Sellers therefore have direct economic interest in each other&rsquo;s reliability: a forwarder whose coordination failures force repeat compensation negotiations loses repeat importer-of-record business not through reputation effects but because the cohort&rsquo;s expected bond-loss exposure on shipments through that forwarder is direct and measurable; a port whose congestion consistently produces cascading delays does likewise. The mechanism operates without a managerial layer; the bonded structure does the work that a consortium-governed shared ledger was meant to do through information transparency alone.
                </PaperRun>
            </PaperSection>

            <PaperSection title="6. Clauses">
                <p>
                    The composition draws mostly on existing clause infrastructure. One new clause is required &mdash; a container-seal attestation &mdash; beside the already-registered Incoterms-2020 anchor; two further attestations described below ride clauses not yet registered. The bill-of-lading transferability question is treated separately in Section 7.
                </p>
                <PaperRun title="Existing clauses.">
                    The composition reuses the following:
                </PaperRun>
                <ul className="space-y-2 list-disc pl-6 text-sm">
                    <li>commerce &mdash; per-leg payment commitment.</li>
                    <li>geolocation &mdash; pickup / drop-off geohashes and vessel-position updates.</li>
                    <li>modalities &mdash; declares the buyer&rsquo;s requested delivery modality; the hand-off point where the physical exchange occurs (final delivery to the consignee) is carried on the handoff clause.</li>
                    <li>proximity-policy &mdash; commits the accepted detection bands at signing; the proof that a given hand-off occurred within an accepted band is filed as a runtime witness-stage attestation on the same clause, at each container transfer point.</li>
                    <li>emissions (free-form accounting methodology — GHG Protocol, ISO 14064, PAS 2050, EN 16258, or any other) &mdash; per-leg emissions disclosure on every transport edge, the measured grams CO&#8322;e filed as its runtime witness stage.</li>
                </ul>
                <p>
                    These clauses are already registered; no further authoring work is needed for them. Two further attestations ride candidate clauses that do not yet exist in the registered set: the carrier&rsquo;s per-role event log over the multi-stop carrier process (a proposed sister clause following merchant-process / courier-process), and the customs-clearance determination recorded by the customs-authority wallet. Each is a candidate composition, authored and registered the same way as the container-seal clause below.
                </p>
                <PaperRun title="New clause: container-seal.">
                    Container seals are the integrity mechanism for ocean shipping. A uniquely-numbered seal is applied at the origin and broken only at customs or at the destination consignee. Multiple parties (carrier, ports, customs, consignee) need a single canonical attestation of when the seal was applied, when it was inspected intact, and if it was breached. The clause&rsquo;s specification carries:
                </PaperRun>
                <ul className="space-y-1 list-disc pl-6 text-sm">
                    <li><code>containerNumber</code> (string, ISO 6346 format)</li>
                    <li><code>sealNumber</code> (string)</li>
                    <li><code>event</code> (enum: applied, inspected_intact, transferred, breached, removed_by_customs)</li>
                    <li><code>inspectorAddress</code> (the address of the wallet making the attestation)</li>
                    <li><code>timestamp</code> (ISO 8601 datetime)</li>
                    <li><code>locationGeohash</code> (string, 8-character precision)</li>
                    <li><code>evidenceHash</code> (optional content hash of a photo or inspection report)</li>
                </ul>
                <p>
                    The clause could later gain <em>container-integrity</em> sister clauses covering seal-equivalents in other transport modes (rail container seals, air-freight tamper-evident packaging, etc.), each registered without affecting the others. The clause name, once registered, binds permanently.
                </p>
                <PaperRun title="The Incoterms 2020 clause.">
                    Incoterms 2020 (from the International Chamber of Commerce) are the international trade vocabulary for risk-transfer points and cost allocation across legs of a shipment: EXW, FCA, CPT, CIP, DAP, DPU, DDP, FAS, FOB, CFR, CIF (ICC, 2020; Ramberg, 2011). The vocabulary is useful as cross-party shared reference, but the traditional Incoterms semantics come from a context without the bonded primitive&rsquo;s invariants and may not all map cleanly. We treat this carefully because it is the canonical worked example of how traditional commercial vocabulary smuggles in assumptions the bonded architecture cannot honor.
                </PaperRun>
                <p>Three structural mismatches deserve direct treatment.</p>
                <p>
                    <em>Risk transfer is a Figaro-foreign concept.</em> Incoterms encode a discretionary risk-transfer point: &ldquo;risk transfers from seller to buyer at point X.&rdquo; Under the bonded primitive, risk follows bond &mdash; the bonded party is at stake until they perform per the agreed clauses, and there is no separate <em>risk-transfer</em> concept distinct from the bonding rule. A clean port from Incoterms to bonded clauses requires reinterpreting &ldquo;risk transfer at X&rdquo; as &ldquo;the seller&rsquo;s proximity-policy hand-off attestation due at X discharges the seller&rsquo;s bond exposure for the upstream segment.&rdquo;
                </p>
                <p>
                    <em>Cost-vs-risk separation collapses.</em> Incoterms separate &ldquo;who pays for transport&rdquo; from &ldquo;who bears risk during transport.&rdquo; Under the bonded primitive, both follow from process structure: a party who bonds for a sub-process is the buyer of that sub-process, and risk is what the bonding rule already prices. Some Incoterms features (CIP/CIF&rsquo;s seller-pays-insurance feature, for instance) require composition with a parallel insurance process rather than direct encoding in the delivery-clause specification.
                </p>
                <p>
                    <em>Buyer dominance changes the resolution model.</em> Incoterms assume good-faith resolution between parties; the bonded primitive encodes buyer dominance plus mutually-assured bond-loss as the equilibrium that produces good-faith resolution. Some Incoterms&rsquo; implicit dispute-resolution paths &mdash; which typically rely on local commercial-court adjudication &mdash; continue to function under the bonded architecture but at the off-chain forum the parties name in their agreement, not as an internal property of the term.
                </p>
                <p>
                    The right clause is therefore not &ldquo;Incoterm as a traditional contract clause&rdquo; but <em>Incoterm as a reference to a Figaro-native delivery-clause specification</em>. The clause anchors the term plus the named place; the term-to-delivery-clause mapping lives in the off-chain ICC publication (the canonical text) and a runtime term-to-clause table that the assembly&rsquo;s participants compose from. The registered clause commits two fields &mdash; the declared term and the named place &mdash; and does not encode per-term semantics; it also does not duplicate the machine-readable location into the anchor, which composes instead by placing the geolocation clause alongside on the same order, a clean instance of the principle that shared reference lives in composition, not in duplicated fields. The clause specification carries:
                </p>
                <ul className="space-y-1 list-disc pl-6 text-sm">
                    <li><code>incotermsRule</code> (enum: EXW, FCA, CPT, CIP, DAP, DPU, DDP, FAS, FOB, CFR, CIF)</li>
                    <li><code>incotermsNamedPlace</code> (string; every Incoterm requires a named place, in the standard&rsquo;s own citation form)</li>
                </ul>
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
                <PaperRun title="The cancellable-seller / counter-process pattern.">
                    The architectural direction is that BoL transferability is a <em>protocol-layer composition</em>, not a kernel-layer property. The candidate pattern is a <em>cancellable-seller wrapper plus counter-process</em>: the original buyer, who wants to transfer the right to the cargo mid-shipment, commits a parallel <em>cancellation process</em> <Math>{"P_{\\text{cancel}}"}</Math> in which each sub-seller is compensated for early exit through a fee owed by the original buyer (and bonded under the standard kernel rule), and the new buyer commits a fresh transport process for the remaining legs.
                </PaperRun>
                <p>
                    The pattern is a sketch, not a deliverable mechanism, included because the BoL-transferability question is the load-bearing concern for any container-shipping deployment and the conventional answer &mdash; negotiable bills of lading endorsed mid-transit &mdash; is precisely what the kernel&rsquo;s buyer-fixed invariant rules out. Three elements lie outside the kernel-discipline guarantee and must be specified by the parties at agreement signing rather than relied on as architectural invariants: sub-seller consent under the wrapper (the wrapper turns on programmatic acknowledgement of cancellation under a fee schedule pre-agreed at commit time, and whether that satisfies the kernel-discipline reading of counterparty consent at the moment of cancellation is a design-discipline question the parties resolve off-chain); cargo-handoff operationalization (the original carrier must release cargo to the new carrier, an event the off-chain agreement attaches an attestation surface to &mdash; a proximity-policy hand-off attestation between the two carriers, with the original buyer counter-signing); and cancellation-fee arithmetic (the fee schedule must be high enough that sub-sellers do not face an early-exit option they will refuse and low enough that the transfer use case remains operational, with specific values agreement-shaped rather than architectural). Deployments requiring BoL transferability can rely on conventional BoL doctrine through the off-chain agreement, or constrain their use cases to the non-transferable region the kernel admits directly.
                </p>
                <PaperRun title="Why MLETR-style transferable-record analysis applies.">
                    The MLETR analysis distinguishes records emitted by the kernel itself &mdash; commitment digests, bond deposits, the cumulative-value accumulator state, resolution events &mdash; from discretionary clause-validated attestations such as container-seal events or proximity-policy hand-off attestations. The kernel byproducts are clause-typed at the kernel level and cryptographically authenticated; the MLETR Article 10&ndash;11 analysis applies to them directly, with the kernel&rsquo;s structural properties (singularity through the cumulative-value accumulator, control through buyer-dominance, integrity through the chain&rsquo;s consensus) discharging the control and singularity tests for transferable records. The discretionary clause-validated attestations are evidentiary artifacts <em>about</em> the underlying transferable record (the commitment), not separate transferable records inheriting MLETR status in their own right. The cancellable-seller / counter-process pattern preserves the kernel-byproduct fit because the transfer is achieved through bilateral signing on two separate processes rather than through unilateral endorsement of a single record; the protocol-layer transfer pattern does not violate either MLETR test.
                </PaperRun>
                <PaperRun title="Order-form and bearer-form.">
                    A useful organizing distinction is between order-form (named consignee, transferred by endorsement to a designated party) and bearer-form (transferred by physical delivery of the instrument without endorsement) bills of lading. Order-form endorsement is partially expressible through the cancellable-seller pattern above (subject to the underspecification axes). Bearer-form BoLs are functionally equivalent to a transfer-without-counterparty-consent pattern that the bonded composition does not support. Bearer-instrument practices remain common in commodity trading (oil cargoes, grain shipments) where the bill is treated as a near-money instrument (Goode &amp; Gullifer, 2017); non-bearer order-form practice predominates in container shipping but is not the only operational pattern. The bearer-form exclusion is an honest exclusion: parties whose operations depend on bearer-instrument liquidity should plan around the conventional regime for that part of their workflow.
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
                    The UNCITRAL Model Law on Electronic Transferable Records (2017) is a legal framework rather than a technology platform (UNCITRAL, 2017). The kernel-layer artifacts satisfy Articles 10 and 11 (singularity and integrity under Article 10, control under Article 11) for non-bearer transferable records, with bearer-instrument semantics noted as an honest exclusion (Section 7).
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
                    Customs authorities have two distinct functions in this composition. As bonded sellers of border-clearance service (charging the importer for handling, examination capacity, filing-receipt processing) they are RWA-as-wallet on the same footing as commercial providers, and their participation in the bonded process is unproblematic at the kernel layer. As sovereign decisional authorities on whether specific goods clear under the relevant tariff schedule, they continue to operate in their own register, off-chain; the architecture does not re-engineer customs administration and the kernel does not encode the sovereign decision. The bonded composition produces a verifiable evidence record on which customs decisions can operate and which customs decisions are recorded against; this is an improvement over the paper-and-database baseline but not a substitute for the sovereign authority itself.
                </PaperRun>
                <PaperRun title="Bond-currency at the small-shipper end.">
                    Small shippers without crypto-treasury infrastructure face operational friction at the bonding step. The constraint is real but solvable through ordinary party-of-record aggregation: a forwarder that consolidates small shippers&rsquo; cargo is itself the kernel seller on the resulting commitment, posting its own bond as its own deterrent on its own performance, and the small shippers are its off-chain customers under conventional commercial terms. The bond is never outsourced or rented &mdash; the deterrent works only as the forwarder&rsquo;s own staked skin &mdash; and what aggregates is the commitment itself, not the bonding. This is a runtime-tier implementation question rather than a substrate-tier question; the substrate is denomination-agnostic.
                </PaperRun>
                <PaperRun title="Insurance and reinsurance.">
                    Marine insurance, P&amp;I clubs, and the general apparatus of shipping-risk underwriting continue to operate on the objects insurance has always covered &mdash; the cargo, the hull, third-party liability, the real-world externalities of moving goods. The bonded architecture changes the risk profile these markets price on those objects (a smaller residual after bond allocation; a container that arrives against a verifiable evidence record rather than a contested paper trail), and incumbent insurers can adapt their cargo and liability products to read that record. What insurance does not extend to is the bond itself: a bond is a party&rsquo;s own staked deterrent, not an insurable position. A policy that indemnified a party against forfeiting its own bond would hedge away the very exposure the bond exists to create &mdash; it would neutralize the deterrent and, with it, the equilibrium the mechanism induces &mdash; so the mechanism&rsquo;s design excludes it. Insurance composes with the bonded primitive by covering the cargo, never by covering the bond.
                </PaperRun>
                <PaperRun title="Network effects and adoption.">
                    The architecture&rsquo;s adoption dynamics differ from TradeLens&rsquo;s in that no participant must ratify any other participant&rsquo;s governance position. A shipper, forwarder, or carrier can participate on individual shipments without joining anything; the participation decision is shipment-by-shipment rather than platform-membership-shaped. We do not model the diffusion trajectory beyond noting that the structural barrier that defeated TradeLens (consortium ratification by competitors) is absent here.
                </PaperRun>
            </PaperSection>

            <PaperSection title="10. Conclusion">
                <p>
                    TradeLens failed for governance reasons that no consortium-governance fix can resolve; the structural alternative is permissionless, ownerless infrastructure at the platform layer rather than a better consortium. The bonded primitive in the settlement kernel supplies the architectural shape: each leg of a shipment is a bilateral bonded commitment; cumulative upstream bonding scales the primitive across the multi-leg fan-out; buyer dominance plus atomic resolution propagates damage to the unit causing the slip. What the present paper supplies is the composition &mdash; the organizational handoff chain, the per-edge bonding mechanics, the clause set including the registered Incoterms-2020 anchor and the new container-seal clause, and the cancellable-seller / counter-process pattern for BoL transferability &mdash; that turns the bonded primitive into a working inter-logistics coordination architecture at the same perimeter TradeLens attempted and could not sustain.
                </p>
            </PaperSection>
        </PaperLayout>
    );
}
