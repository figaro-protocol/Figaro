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
        "TradeLens failed for a structural reason no governance fix resolves: a competitor-controlled platform asks rival carriers to ratify a competitor's gatekeeping. The fix is a published composition each party signs into, one order at a time; bonded and permissionless, it coordinates the inter-logistics perimeter.",
});

const HANDOFF_CHAIN = `        shipper (origin country)
            |
            | handoff: goods presented for shipment
            v
        freight forwarder + NVOCC
            |   (forwarder coordinates multimodal
            |    movement; NVOCC issues house
            |    bill of lading)
            v
        origin inland leg (truck or rail to port)
            |
            | handoff: container stuffed and sealed
            v
        inspection service (pre-shipment, optional)
            |
            | seal event: inspected intact
            v
        port of loading (terminal services)
            |
            | handoff: container loaded; master bill of lading issued
            v
        ocean carrier
            |
            | courier process events (positions in evidence),
            | seal events,
            | cold-chain periods (if reefer)
            v
        port of discharge (terminal services)
            |
            | handoff: container discharged
            v
        customs agent + customs authority
            |   (agent files the entry for the
            |    importer; authority is a seller
            |    for clearance service and duty)
            v
        destination inland leg
            |
            | modalities: delivery to consignee
            v
        consignee (importer, the root buyer)`;

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
            abstract={
                <>
                    <p>
                        TradeLens, the IBM&ndash;Maersk container-shipping platform, was switched off in 2023 although carriers covering more than half the world&rsquo;s ocean container cargo had joined it. We read the failure as one of governance shape rather than software. A platform controlled by one carrier asks its rivals to ratify that carrier&rsquo;s gatekeeping, and the rivals joined while hedging across a competing consortium. On this reading no formal-governance fix removes that requirement, because the requirement comes from the shape and not from any promise the controller makes.
                    </p>
                    <p>
                        We then develop a permissionless, decentralized alternative at the same perimeter, built on Figaro&rsquo;s two mechanisms: asymmetric bonding, and buyer dominance with atomic resolution. Every carrier, port, forwarder, inspector, insurer, credit issuer, and customs authority is a wallet, and each is a seller to one buyer, the importer. At each commit the importer bonds twice that leg&rsquo;s payment and the seller twice the value the process has accumulated through its order. The importer alone resolves, and resolution pays every seller and refunds every bond at once. We work the bonds through a thirteen-order shipment, derive the interest each seller holds in every other seller&rsquo;s performance, map the published clauses onto the legs, and treat a cargo sale in transit as an outside event squared before resolution. The contribution is the composition and its operational properties, in the register of industrial engineering; the mechanism-design results it rests on are restated, not extended.
                    </p>
                </>
            }
            references={
                <>
                    <li>CargoX. n.d. &ldquo;CargoX Platform Compliance.&rdquo; https://cargox.io/legal-compliance-and-standards/. Accessed October 18, 2026.</li>
                    <li>Figaro. 2026. &ldquo;Asymmetric Bonding and Buyer Dominance: Two Composing Mechanisms for Self-Enforcing N-Party Coordination.&rdquo; Preprint. https://figaroprotocol.com/papers/asymmetric-bonding/. Accessed October 18, 2026.</li>
                    <li>ICC (International Chamber of Commerce). 2019. <em>Incoterms 2020: ICC Rules for the Use of Domestic and International Trade Terms</em>. ICC Publication 723E. Paris: ICC.</li>
                    <li>IMDA (Infocomm Media Development Authority of Singapore). 2026. &ldquo;What Is TradeTrust.&rdquo; TradeTrust. Last modified April 10, 2026. https://www.tradetrust.io/about/what-is-tradetrust. Accessed October 18, 2026.</li>
                    <li>Jensen, Thomas, Jonas Hedman, and Stefan Henningsson. 2019. &ldquo;How TradeLens Delivers Business Value with Blockchain Technology.&rdquo; <em>MIS Quarterly Executive</em> 18 (4): 221&ndash;243. https://doi.org/10.17705/2msqe.00018.</li>
                    <li>Ledger Insights. 2020. &ldquo;COSCO, CMA CGM to Become Shareholders in GSBN Blockchain Shipping Consortium.&rdquo; <em>Ledger Insights</em>, February 28, 2020. https://www.ledgerinsights.com/blockchain-shipping-consortium-cosco-cma-cgm-hapag-lloyd-gsbn/. Accessed October 20, 2026.</li>
                    <li>The Loadstar. 2022. &ldquo;AP M&oslash;ller-M&aelig;rsk and IBM to Discontinue TradeLens.&rdquo; <em>The Loadstar</em>, November 29, 2022. https://theloadstar.com/ap-moller-maersk-and-ibm-to-discontinue-tradelens/. Accessed October 20, 2026.</li>
                    <li>Maersk (A.P. Moller &ndash; Maersk). 2019. &ldquo;TradeLens Blockchain-Enabled Digital Shipping Platform Continues Expansion with Addition of Major Ocean Carriers Hapag-Lloyd and Ocean Network Express.&rdquo; Press release, July 2, 2019. https://www.maersk.com/news/articles/2019/07/02/hapag-lloyd-and-ocean-network-express-join-tradelens. Accessed October 20, 2026.</li>
                    <li>Maersk (A.P. Moller &ndash; Maersk). 2022. &ldquo;A.P. Moller &ndash; Maersk and IBM to Discontinue TradeLens, a Blockchain-Enabled Global Trade Platform.&rdquo; Press release, Copenhagen, November 29, 2022. https://www.maersk.com/news/articles/2022/11/29/maersk-and-ibm-to-discontinue-tradelens. Accessed October 20, 2026.</li>
                    <li>Ramberg, Jan. 2011. <em>ICC Guide to Incoterms 2010: Understanding and Practical Use</em>. ICC Publication 720E. Paris: ICC.</li>
                    <li>Sarker, Suprateek, Stefan Henningsson, Thomas Jensen, and Jonas Hedman. 2021. &ldquo;The Use of Blockchain as a Resource for Combating Corruption in Global Shipping: An Interpretive Case Study.&rdquo; <em>Journal of Management Information Systems</em> 38 (2): 338&ndash;373. https://doi.org/10.1080/07421222.2021.1912919.</li>
                    <li>UNCITRAL (United Nations Commission on International Trade Law). 2017. <em>UNCITRAL Model Law on Electronic Transferable Records</em>. Adopted July 13, 2017. https://uncitral.un.org/en/texts/ecommerce/modellaw/electronic_transferable_records. Accessed October 20, 2026.</li>
                </>
            }
        >
            <PaperSection title="1. Introduction">
                <p>
                    A single vessel of 20,000 TEU (twenty-foot equivalent units) carries cargo for thousands of shippers through several ports and jurisdictions to many consignees. Each box is documented by bills of lading, customs filings, emissions statements, and handoff papers that no single party originates. The information problem is familiar to everyone in the trade: duplicated paper, opaque vessel positions, contested seal integrity, and at border points the corruption that paper documentation leaves room for (Sarker et al. 2021).
                </p>
                <p>
                    TradeLens, developed by IBM and Maersk, was a prominent attempt at a digital answer. It was a permissioned blockchain on which participants would publish operational events that every party to a shipment could read (Jensen et al. 2019). It worked technically and was switched off in 2023. Section 2 argues that the binding constraint was the platform&rsquo;s governance shape: rival carriers joined, but would not consolidate under a platform a competitor controlled.
                </p>
                <PaperRun title="The alternative this paper develops.">
                    If the shape is the problem, the fix is a published composition each party signs into, one order at a time. We develop a composition at the same perimeter TradeLens attempted: <em>inter-logistics coordination</em> among ocean carriers, ports of loading and discharge, customs authorities, freight forwarders, NVOCCs (non-vessel-operating common carriers, which issue their own bills of lading), customs agents, letter-of-credit (LC) issuers, marine insurers, and inspection services. It is built on Figaro, a permissionless and decentralized protocol for bonded commitments.
                </PaperRun>
                <PaperRun title="Wallets and the assets behind them.">
                    Every party is a wallet, and behind each wallet stands an off-chain productive asset: a vessel, a terminal&rsquo;s berth and cranes, a customs authority&rsquo;s clearance service, a forwarder&rsquo;s routing capability, an inspector&rsquo;s presence on the ground. A person or an autonomous agent operates the wallet for the asset, and the protocol treats the two alike. Public authorities take part on the same terms as commercial providers. Buyer and seller are positions a wallet holds in one process, not kinds of party.
                </PaperRun>
            </PaperSection>

            <PaperSection title="2. What TradeLens Was and Why It Failed">
                <PaperRun title="What TradeLens was.">
                    TradeLens was a permissioned blockchain platform for global container shipping, jointly developed by IBM and Maersk and operated from 2018 to early 2023. Its stated goal was one tamper-evident account of every container&rsquo;s journey, readable by all parties to the shipment: bills of lading, customs filings, port handoffs, and vessel positions. Its design assumed that the major ocean carriers would join, so that shippers could rely on one ledger across carriers. Jensen et al. (2019) give the business-value case as it stood before the shutdown; the governance reading below is ours.
                </PaperRun>
                <PaperRun title="The adoption shape.">
                    Carriers did join. CMA CGM and MSC announced in 2019 that they would, and Hapag-Lloyd and Ocean Network Express followed in July 2019, when Maersk put the platform&rsquo;s scope at more than half the world&rsquo;s ocean container cargo (Maersk 2019). The same carriers kept a second option open. The Global Shipping Business Network (GSBN), a rival blockchain consortium unveiled in 2018, signed a shareholders&rsquo; agreement in February 2020 with nine carriers and terminal operators, CMA CGM and Hapag-Lloyd among them (Ledger Insights 2020). Two TradeLens carriers had thus signed to become shareholders of its competitor. In November 2022 Maersk and IBM announced the shutdown, stating that &ldquo;the need for full global industry collaboration has not been achieved&rdquo; and that the platform would go offline by the end of the first quarter of 2023 (Maersk 2022; The Loadstar 2022).
                </PaperRun>
                <PaperRun title="Why joining was not consolidating.">
                    The adoption-dynamics reading is correct as far as it goes. Shippers want one ledger covering nearly all their cargo; with the industry split across two consortia, no platform covered it; without that coverage shippers would not commit, and without shippers carriers had no reason to consolidate. That reading does not say why the split formed. Our answer is that the non-Maersk carriers identified a strategic problem in the platform&rsquo;s shape and hedged against it. A platform controlled by Maersk, with IBM as its technology provider, is a coordination layer whose accountability runs to one industry participant. Its rivals are asked to provision operational data into a layer whose contested cases that participant&rsquo;s interests will shape.
                </PaperRun>
                <p>
                    The argument is not that Maersk acted in bad faith or that the formal governance was inadequate. It is that a competitor-controlled infrastructure requires competitors to ratify the controller&rsquo;s position, and no formal arrangement removes that requirement: the controller cannot promise the shape away, because the shape is not a promise. The refusal is hard to read from a membership list, since competitors join; what they withhold is exclusivity. Does this condemn every collective arrangement? It does not. A utility its members own jointly, none of whom controls it, is a different object from a platform controlled by one participant in the industry it serves, and the carriers refused only the second. The lesson generalizes to any platform whose accountability runs to a participant of its own industry.
                </p>
            </PaperSection>

            <PaperSection title="3. The Mechanism">
                <p>
                    Figaro&rsquo;s Core is a small set of smart contracts with two calls, commit and resolve; we call the rules those calls enforce <em>the mechanism</em>. This section fixes the vocabulary and restates the slice of the equilibrium the argument uses; the equilibrium and its proof, for any number of orders the network resolves in one call, are given in Figaro (2026).
                </p>
                <PaperRun title="The terms.">
                    A <em>process</em> is one buyer&rsquo;s trade with any number of sellers, opened by its first commit and closed by the buyer&rsquo;s resolution. An <em>order</em> is one buyer&ndash;seller commitment inside a process. A <em>clause</em> is one reusable term, registered publicly under the hash of its specification. An <em>agreement</em> is the clauses composed for one order. It is registered value-free under its agreement key, the merkle root (a single hash committing to every clause of the agreement) over one leaf per clause with the designer&rsquo;s fills; at checkout the parties fill and sign it, and its merkle root is what the order&rsquo;s commitment carries. An <em>assembly</em> is a list of registered agreements composed into one reusable design of a process. <em>Composition</em> is how all of it is built: a designer composes, a seller binds an assembly by naming it in its profile as a standing offer, and a buyer selects among the assemblies its sellers bind.
                </PaperRun>
                <PaperRun title="Commit: asymmetric bonding.">
                    An order is signed by both its parties and bonded on both sides. For an order with payment <Math>{"P > 0"}</Math>, the buyer locks <Math>{"2P"}</Math> and the seller locks <Math>{"2G"}</Math>, where <Math>{"G"}</Math> is the cumulative value through that seller&rsquo;s order, <em>its own payment included</em>: <Math>{"G_i = \\sum_{j \\leq i} P_j"}</Math>. The figure is arithmetic, not a report. Commit admits exactly one value, the standing accumulator plus the new payment, so each seller&rsquo;s bond is fixed by what the two parties signed. The schedule is constitutive: twice the payment from the buyer, twice the cumulative value from the seller, on every order, with no other terms admitted. At the root nothing has accumulated ahead of the order, so <Math>{"G = P"}</Math> and the two bonds coincide; below it the seller&rsquo;s bond is the larger.
                </PaperRun>
                <PaperRun title="Resolve: buyer dominance with atomic resolution.">
                    Only the root buyer may resolve, and resolution is atomic: every active order in the process resolves together or none does. Resolution is the buyer&rsquo;s judgment that what it contracted for arrived; the Core holds no acceptance test and admits no report of delivery. It is terminal: a resolved process cannot be reopened. An unresolved process is a position the parties hold, with no clock running, until the buyer closes it.
                </PaperRun>
                <PaperRun title="Why cooperation is the equilibrium.">
                    After performance, resolving is strictly better for the buyer than never resolving, <Math>{"0"}</Math> against <Math>{"-P"}</Math>, with no assumption about the seller: the buyer holds what arrived either way, and withholding only leaves its own bond locked. It is the one unconditional anchor. Given it, and given the buyer&rsquo;s plan to resolve once performance has occurred and not before, performing is each seller&rsquo;s strict best reply, <Math>{"+P"}</Math> against at most <Math>{"-G"}</Math> for never performing.
                </PaperRun>
                <p>
                    The deterrent is computed with what a defector keeps, because value passes off-chain. A seller that walks away keeps at most <Math>{"G"}</Math>, and less where its contribution is a service not yet rendered. Against its locked <Math>{"2G"}</Math> it then stands at best at <Math>{"-G"}</Math>, where performing would have left it at <Math>{"+P"}</Math>. A bond equal to the value at the order would be exactly canceled by the taking; the second <Math>{"G"}</Math> is what makes the taking cost. No call consumes a bond, so the standoff ends in performance and resolution, never in destruction. Given the sellers&rsquo; reply, before performance the buyer keeps the process open rather than resolving at once, which is terminal at <Math>{"-P"}</Math>. The sellers&rsquo; reply and the buyer&rsquo;s waiting are the two parties&rsquo; best-response checks against one profile, verified jointly: they are the fixed point, and the anchor stands outside it.
                </p>
                <PaperRun title="The boundary the Core keeps.">
                    The chain holds fingerprints: the bonds, the accumulator, each agreement&rsquo;s merkle root, and attestations as content hashes bound to their orders. It never holds the terms and never tests performance. A container that moved, a seal that held, a berth that was worked: none of it is visible to the Core. The composition of Section 4 is therefore an arrangement of attestations <em>about</em> a world the Core cannot see, resolved by a buyer who judges it.
                </PaperRun>
                <PaperRun title="Disagreement, remedy, and forums.">
                    Where a leg is late, short, damaged, or contested, the Core decides nothing. The parties decide it between themselves <em>while the process stands open</em>, and the remedy is a plain transfer. A seller that cannot perform sends the buyer the payment it stands to receive, so at resolution it receives back only what it sent, its bond is refunded, and the buyer is whole. A forum the parties named, or any forum that would hear them anyway, may rule on the open process&rsquo;s data and on whatever the parties bring it. No forum can resolve, because resolution is the buyer&rsquo;s alone: no ruling reaches a balance the Core holds, and this absence of direct enforcement is what lets a forum compose without touching the comparisons above. Resolution is terminal acceptance, so a buyer with a live complaint resolves after the complaint is answered.
                </PaperRun>
                <PaperRun title="Where operating costs sit.">
                    Where do bunker fuel, terminal handling, chassis time, and reefer power enter this accounting? They sit outside it. The Core pulls bonds at commit, transfers payments and refunds bonds at resolution; what a provider spends to move the box is the operating asset&rsquo;s own expenditure, which the Core neither observes nor resolves. The Core asks of a provider only that its wallet hold enough to bond the leg it quotes. A carrier whose balance cannot cover its bonds leaves the market by ordinary commercial arithmetic, not by any act of the Core.
                </PaperRun>
            </PaperSection>

            <PaperSection title="4. The Assembly">
                <p>
                    The composition has two layers, and the argument depends on keeping them apart. The <em>organizational handoff chain</em> is how the container physically moves through the value-adders, documented by attestations. The <em>commit sequence</em> is what the Core sees: a linear series of dual-signed commits extending one monotonic accumulator, every one of them to the same root buyer, with no parent or child recorded in the resolution state. How the orders relate is the parties&rsquo; own account, committed in each agreement&rsquo;s topology clause and reconstructed off-chain by whoever reads the data.
                </p>
                <PaperRun title="The composition is published.">
                    Clauses are composed into six registered agreements, one per order, and the six agreements into one published assembly: shipper, pre-shipment inspection service, freight forwarder, reefer ocean carrier, customs agent, and destination drayage, all sellers to one root buyer, the importer. The published assembly runs end to end: the importer bonds exactly <Math>{"2P_i"}</Math> on each order and each seller exactly <Math>{"2G_i"}</Math>, as the schedule prescribes, and the importer&rsquo;s one resolution closes every order together. A run demonstrates the mechanics; it is not evidence of independent carriers, ports, or agents operating the assembly.
                </PaperRun>
                <PaperRun title="The organizational handoff chain.">
                    A canonical international flow, with the value-adders made explicit:
                </PaperRun>
                <CodeBlock>{HANDOFF_CHAIN}</CodeBlock>
                <p>
                    Marine insurance and letter-of-credit issuance are value-adders off the cargo line. The insurer and the issuer are sellers in the same process without owning a physical handoff. Variations such as rail for the inland leg, extra consolidation points, or transshipment ports follow the same pattern with the divisions shifted to the route.
                </p>
                <PaperRun title="The commit structure.">
                    Every order&rsquo;s buyer must be the process&rsquo;s root buyer, and at this perimeter the root buyer is the party that buys at the relevant tier. Depending on the Incoterm, that is the importer, the consignee, a forwarder acting for the importer, or in seller-arranged shipments the shipper itself. We use the importer as the running case; the apparatus is the same with any of the others. A wallet that offers discovery, curation, or brokerage around the shipment can sell those services, but it cannot sit between the importer and the operational sellers, because no order inside the process has any buyer but the root buyer.
                </PaperRun>
                <p>
                    The commits state who the importer pays and how much, in the order of Section 5&rsquo;s table: the shipper (for the cargo&rsquo;s invoice value, where the Incoterm puts that obligation on the import side), the marine insurer (where the importer buys the cover), the freight forwarder, the NVOCC, the origin inland carrier, the inspection service, the port-of-loading authority, the ocean carrier, the port-of-discharge authority, the customs agent, the customs authority (for the import duty), the destination inland carrier, and the letter-of-credit issuer (where the payment runs on documentary credit). The commits are independent of who hands the container to whom. The importer alone resolves, on receipt at the agreed delivery point.
                </p>
                <DesignGraphCollapseFigure
                    idPrefix="after-tradelens-design-collapse"
                    designHeading="The organizational handoff chain"
                    designNodes={[
                        { label: "shipper (origin)" },
                        { label: "freight forwarder + NVOCC" },
                        { label: "origin inland leg" },
                        { label: "inspection service" },
                        { label: "port of loading" },
                        { label: "ocean carrier" },
                        { label: "port of discharge" },
                        { label: "customs agent + authority" },
                        { label: "destination inland leg" },
                        { label: "consignee (importer)" },
                        { label: "marine insurer", branch: true },
                        { label: "LC issuer", branch: true },
                    ]}
                    commitOrder={[
                        "importer → shipper",
                        "importer → marine insurer",
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
                        "importer → LC issuer",
                    ]}
                    rootBuyerLabel="Importer"
                    topologyNote={[
                        "The topology clause does: the parties' own account of how the orders",
                        "relate, committed in each agreement and reconstructed off-chain.",
                    ]}
                    figureTitle="The handoff graph at the design layer, and the commit sequence the Core sees"
                    figureDesc={
                        "On the left, the organizational handoff chain: ten operational nodes " +
                        "from shipper to consignee, plus two value-adders, the marine insurer " +
                        "and the letter-of-credit issuer, branching off the cargo line. On the " +
                        "right, what the Core holds: thirteen dual-signed commits in one linear " +
                        "sequence, each to the importer as root buyer, extending one monotonic " +
                        "accumulator. No parent, child, or branch is held in resolution state."
                    }
                    caption={
                        <>
                            The branch on the left is real and is documented by attestations; the
                            Core is blind to it, and the commits are independent of who hands the
                            container to whom.
                        </>
                    }
                />
                <PaperRun title="Granularity is a design choice.">
                    The same shipment can be composed coarsely, with the forwarder absorbing inland, port, and ocean legs into one order, or finely, with each value-adder an order of its own. The Core sees only commits and reifies no tier or aggregation. The equilibrium is invariant to the choice in its form, since every order is bonded on the same schedule. It is not invariant in magnitude, because a seller&rsquo;s bond is the accumulator at its own order and so depends on what was committed ahead of it. The exposure each seller carries to a peer&rsquo;s fault, <Math>{"P_i + 2G_i"}</Math>, varies with the number of sellers and their positions. The six-order published assembly and the thirteen-order enumeration are two points on that axis; we develop the fine-grained one because the value-adder structure is the substance of the TradeLens perimeter.
                </PaperRun>
                <PaperRun title="Per-order clauses.">
                    Every agreement composes the commerce clause, which carries the payment, and the topology clause. Beside them, each order carries the clauses its role needs; Section 6 states what each clause commits.
                </PaperRun>
                <ul className="space-y-2 list-disc pl-6 text-sm">
                    <li><em>Shipper</em>: the cargo clause with the shipment&rsquo;s measures; the Incoterms 2020 clause for the rule and named place; the chain of custody clause, which opens the seal regime; the acceptance-criteria clause fixing the basis on which the importer receives; the modalities and geolocation clauses; optionally an emissions clause for manufacturing emissions.</li>
                    <li><em>Freight forwarder</em>: the merchant process-event clause for its coordinating role; geolocation for the consolidation point; a handoff with its proximity policy where the forwarder takes physical receipt.</li>
                    <li><em>NVOCC</em>: the consent clause, binding the parties by content hash to the pinned house bill of lading, whose transferability Section 7 treats.</li>
                    <li><em>Origin and destination inland carriers</em>: the courier process-event clause, whose arrived-at-pickup and arrived-at-drop-off events mark the leg; one handoff on each carrier&rsquo;s order with its proximity policy; geolocation for origin and destination; on a road leg that needs one, the freight-class clause.</li>
                    <li><em>Inspection service</em>: the acceptance-criteria clause, against which the inspector files its outcome; a chain of custody <em>inspected intact</em> event, filed against the shipper&rsquo;s order, where the seal regime lives; optionally the inspection report, as the evidence reference of the outcome it files under the acceptance-criteria clause.</li>
                    <li><em>Port-of-loading and port-of-discharge authorities</em>: the payment for terminal handling and gate access; one handoff on each authority&rsquo;s order with its proximity policy; chain of custody events at each port.</li>
                    <li><em>Ocean carrier</em>: the courier process-event clause over the voyage, with any reported positions inside the evidence its events reference; one handoff with its proximity policy; chain of custody events through the voyage; geolocation for the leg&rsquo;s endpoints; an emissions clause for voyage emissions; for reefer cargo, the cold-chain clause.</li>
                    <li><em>Customs agent</em>: the payment for entry filing; the merchant process-event clause; the consent clause binding the parties to the pinned filing-terms document.</li>
                    <li><em>Customs authority</em>: the import duty is this order&rsquo;s payment, transferred to the authority&rsquo;s wallet at resolution with every other payment. The sovereign decision whether the cargo clears stays off-chain; Section 9 treats the two functions.</li>
                    <li><em>Marine insurer</em>: the premium is the payment. The insurer bonds the same <Math>{"2G"}</Math> every seller bonds, twice the cumulative value through its order, as a deterrent; its underwriting capacity lives off-chain in the policy.</li>
                    <li><em>Letter-of-credit issuer</em>: the issuer&rsquo;s charge is the payment, and its <Math>{"2G"}</Math> bond is the ordinary deterrent, not a measure of its credit. The documentary-credit terms live off-chain.</li>
                </ul>
                <p>
                    Each order&rsquo;s agreement also carries one reserved leaf, its <em>provenance</em>: the agreement key of the registered agreement the order instantiates and the hash of the assembly. Checkout writes it from the assembly instantiated; it is part of the format, not a term the parties negotiate. Through it, a resolved order&rsquo;s use is counted for the designer of the registered agreement and the designer of the assembly, beside the clause designers, each counted by the clause&rsquo;s own leaf. Designers are rewarded in proportion to that counted use.
                </p>
                <PaperRun title="Sub-procurement runs in separate processes.">
                    Each value-adder&rsquo;s own procurement, such as the carrier&rsquo;s fuel, crew, and maintenance or the forwarder&rsquo;s staff, is a separate process in which that provider is the root buyer. The carrier that sells into the importer&rsquo;s process buys its bunkers in a process of its own. The Core does not link those processes, and nothing requires it to: each resolves on its own, and anything that must coordinate with the shipment enters the shipment&rsquo;s process as one more order. A process carries as many orders as the network can resolve in one call, which is far more than any shipment here needs.
                </PaperRun>
            </PaperSection>

            <PaperSection title="5. Bonds and Cascade Mechanics">
                <p>Each leg&rsquo;s risk is priced and propagated by the bonding schedule alone. The importer&rsquo;s bond tracks the payments; the sellers&rsquo; bonds track the accumulator.</p>
                <PaperRun title="Bonds per commit.">
                    The Core keeps one cumulative-value accumulator <Math>{"G"}</Math> per process, which grows as each commit lands: <Math>{"G \\leftarrow G + P_i"}</Math>. At each commit the importer bonds <Math>{"2P_i"}</Math> and the seller bonds twice the accumulator as its own commit leaves it, <Math>{"2G_i"}</Math>. Sellers committing later bond more, and the last seller&rsquo;s bond is twice the shipment&rsquo;s full landed value.
                </PaperRun>
                <PaperRun title="A worked example.">
                    Take a stylized $1,000 shipment with a cargo invoice of $700, imported under a 5% duty on the declared CIF (cost, insurance, and freight) value, with the importer as root buyer. The table traces one commit sequence, the one Section 4 lists.
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
                                ["Shipper (cargo, root)", "$700", "$700", "$1,400", "$1,400"],
                                ["Marine insurer", "$15", "$715", "$30", "$1,430"],
                                ["Freight forwarder", "$30", "$745", "$60", "$1,490"],
                                ["NVOCC (house bill of lading)", "$15", "$760", "$30", "$1,520"],
                                ["Origin inland carrier", "$20", "$780", "$40", "$1,560"],
                                ["Inspection service (pre-shipment)", "$10", "$790", "$20", "$1,580"],
                                ["Port-of-loading authority", "$25", "$815", "$50", "$1,630"],
                                ["Ocean carrier", "$60", "$875", "$120", "$1,750"],
                                ["Port-of-discharge authority", "$25", "$900", "$50", "$1,800"],
                                ["Customs agent", "$20", "$920", "$40", "$1,840"],
                                ["Customs authority (import duty)", "$39", "$959", "$78", "$1,918"],
                                ["Destination inland carrier", "$25", "$984", "$50", "$1,968"],
                                ["LC issuer (documentary credit)", "$16", "$1,000", "$32", "$2,000"],
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
                        Stylized bonds per commit for a shipment with $1,000 total process value, the importer as root buyer. The import duty ($39, rounded from 0.05 &times; $775 = $38.75) is 5% of the declared CIF value ($775 = $700 cargo + $15 marine insurance + $60 ocean freight). <Math>{"G"}</Math> is the accumulator as the row&rsquo;s own commit leaves it, so each seller&rsquo;s bond is twice a figure that already includes its own payment. Per-leg payments are illustrative; magnitudes vary with cargo, route, tariff, and arrangement.
                    </p>
                </div>
                <p>
                    The importer&rsquo;s aggregate bond is $2,000, the sum of the <Math>{"2P_i"}</Math> and twice the total process value. The sellers&rsquo; aggregate is $21,886, nearly eleven times the importer&rsquo;s. The two grow differently, and the difference needs stating precisely. The importer&rsquo;s aggregate, <Math>{"2\\sum_i P_i"}</Math>, is exactly twice the total process value by construction, whatever the granularity or route. The sellers&rsquo; aggregate, <Math>{"2\\sum_i G_i"}</Math>, is super-linear <em>in the number of legs at fixed per-leg payments</em>: for <Math>{"n"}</Math> equal legs it is exactly <Math>{"(n+1)"}</Math> times the total process value. Held to a fixed number of legs, it grows only linearly with the total value. So adding transshipment ports, inland legs, or inspections widens the ratio between the two sides; raising the cargo&rsquo;s invoice value does not.
                </p>
                <PaperRun title="A slip puts every seller in one position.">
                    When a slip occurs, such as a damaged container, a congestion delay, a customs hold, a documentary discrepancy, or a cold-chain breach, atomic resolution puts every seller in the same position: nobody is paid until the importer resolves. The arithmetic of that position is exact and readable from the data. A seller that has already performed carries an exposure to another&rsquo;s fault of <Math>{"P_i + 2G_i"}</Math>: the payment it waits on, plus its whole bond standing against goods it has parted with. One that has not yet performed carries at least <Math>{"P_i + G_i"}</Math>, since it still holds what is in its hands. Every seller therefore holds a computable, bonded interest in every other seller&rsquo;s performance, from the resolution rule alone, among strangers, on the first shipment.
                </PaperRun>
                <p>
                    That interest makes remedy inside the cohort the cheaper path for any seller whose share of it is smaller than its exposure, as long as the importer withholds resolution until the slip is made good, because the alternative for each is a position only resolution ends. A cohort that takes the path would place the larger share on the party whose performance failed, ask less or nothing of unaffected sellers, and compensate the importer <em>before</em> any forum, insurer, or regulator is engaged. The rule fixes the interest and its size, not a course of conduct: whether co-sellers press the failing party, arrange a substitute, or wait is behavior we do not model. Nor does the interest supply knowledge. Which unit caused the slip is not in the data, since performance is off-chain, so identifying it remains the parties&rsquo; work. The cohort for one shipment neither selects nor monitors its members, and each bond is posted against its own order; the coupling comes from atomic resolution, not from any shared obligation among sellers.
                </p>
                <PaperRun title="Across repeat shipments.">
                    Does the pressure compound over time? The Core carries nothing from one process into the next and scores no one. What a later counterparty can read is the public data earlier processes left, a wallet&rsquo;s <em>resolution history</em>: the public summary of the resolved processes it was a party to and the attestations it carries, derived from the chain&rsquo;s events at read time, never stored and never a score. A provider whose failures repeatedly draw cohorts into compensation likely becomes measurably expensive to stand beside, since the exposure a port or carrier accepts by committing alongside it is arithmetic available before it signs. The judgment is the parties&rsquo;, made outside the Core.
                </PaperRun>
            </PaperSection>

            <PaperSection title="6. Clauses">
                <p>
                    The composition needs no new clause: every clause it composes is published, including a canonical account of the seal. Each clause states what it commits at signing and, where it has one, its witness stage: the shape of the evidence a party attests under the clause while the process is open.
                </p>
                <ul className="space-y-2 list-disc pl-6 text-sm">
                    <li><em>Commerce</em>: the payment, on every order.</li>
                    <li><em>Topology</em>: the parties&rsquo; own account of which orders each order follows, on every agreement. The Core stores no such structure.</li>
                    <li><em>Cargo</em>: the shipment&rsquo;s measures, namely gross and net mass, volume, packaged dimensions, packaging type and count, and the marks.</li>
                    <li><em>Geolocation</em>: the leg&rsquo;s origin and destination under a declared geocode standard, committed at signing. It has no witness stage and reports no positions.</li>
                    <li><em>Modalities</em>: the buyer&rsquo;s requested delivery modality for the process.</li>
                    <li><em>Handoff</em>: the kinds of physical exchange the order admits, one or more of four: face to face, an agreed drop point, a parking area, or a locker. It names no place and has no witness stage. An order carries at most one handoff. A seller that touches the cargo more than once either names the handoff that matters to the parties, with its other movements as process events, or the leg is composed as several orders, each with its own handoff. The published composition takes the first course: one handoff on the carrier&rsquo;s order, one on the drayage order, none on the other four, the shipper&rsquo;s included.</li>
                    <li><em>Proximity policy</em>: nested under the handoff, the device-detection ranges that count as the two parties being together, committed at signing: a shared Wi-Fi network, Bluetooth range, ultra-wideband ranging, or a near-field communication (NFC) tap. Its witness stage holds the range the exchange was detected in, with an optional evidence reference. It witnesses that the parties&rsquo; devices met, not that the container moved.</li>
                    <li><em>Chain of custody</em>: the seal regime and its events, treated below.</li>
                    <li><em>Cold chain</em>: the temperature class, the agreed window in whole degrees, the recording interval, and the monitoring standard, committed at signing; the observed minimum and maximum over each period, filed as the witness stage.</li>
                    <li><em>Freight class</em>: a declared class under the National Motor Freight Classification, a road classification, composed where a road leg needs one. No clause in the set declares a class for the ocean leg.</li>
                    <li><em>Acceptance criteria</em>: the basis on which goods or work are accepted, which an inspector attests against and the importer&rsquo;s receipt refers to, with the outcome filed as the witness stage. Resolution is never conditioned on it; it is the shared reference an acceptance argument is conducted in.</li>
                    <li><em>Emissions</em>: a free-form accounting methodology (GHG Protocol, ISO 14064, PAS 2050, EN 16258, or any other), with measured grams CO&#8322;e filed as the witness stage. In the published composition it sits on the ocean carrier&rsquo;s order, the leg that dominates a container&rsquo;s emissions.</li>
                    <li><em>Merchant and courier process events</em>: a pair of event logs, each event carrying an optional evidence reference. The merchant log, for coordinating roles such as the forwarder, inspector, and customs agent, has three events: preparation started, ready for pickup, handed off. The courier log, for transport roles, has five: en route to pickup, arrived at pickup, in transit, arrived at drop-off, completed. Neither has a value for loading, discharge, or a vessel position, so a voyage&rsquo;s positions reach the data only inside the evidence document an event references.</li>
                    <li><em>Consent</em>: a party&rsquo;s attestation to pinned off-chain documents by content hash, used on the customs agent&rsquo;s order for the filing terms.</li>
                    <li><em>Incoterms 2020</em>: the declared rule and its named place, treated below.</li>
                </ul>
                <p>
                    Two clauses are composed for the whole assembly and sit in the assembly&rsquo;s own tree, in its assembly terms leaf (the leaf that carries the clauses composed for the whole design); every agreement signed under the assembly carries them as clause leaves of its own: the <em>applicable-law</em> clause, naming the governing law and optionally a venue and a language, and an <em>arbitration</em> clause naming a decentralized forum. Neither puts anyone on the resolution path. A named forum has no more power to resolve than an unnamed one; naming it in advance fixes the venue.
                </p>
                <PaperRun title="The chain of custody clause.">
                    Container seals are ocean shipping&rsquo;s integrity mechanism: a numbered seal is applied at stuffing and broken only at a customs examination or at destination. Carrier, ports, customs, and consignee all need one canonical account of when it was applied, when it was inspected intact, and whether it was ever breached. At signing the clause commits the <em>regime</em>: a free-form reference to the integrity scheme the parties follow, such as a high-security bolt seal, a tamper-evident bag, or a wagon seal, with the unit&rsquo;s identifier where one is assigned. At runtime it carries one witness-stage attestation per event: <em>applied</em>, <em>inspected intact</em>, <em>transferred</em>, <em>breached</em>, or <em>removed</em>. Each event carries the unit identifier, the seal identifier where the scheme uses one, when it occurred, optionally where, and optionally a reference to evidence such as a photograph. An authorized removal is <em>removed</em>; an unauthorized one is <em>breached</em>.
                </PaperRun>
                <p>
                    Two design choices in the clause are worth drawing out, because a specification easily goes wrong at both. First, there is no attesting-inspector field. A party attests for itself, and the wallet that files an attestation is part of the attestation; a field restating it would be a second, forgeable copy of a fact the data already holds authenticated. Second, the scheme is a free-form reference to an external standard, not a value from a closed list. A sealed container, a courier bag, and a wagon seal are therefore the same clause under different regimes, and a regime nobody has specified yet needs no new clause. Continuity, gaps between events, and the exposure a breach implies are derived at read time from the witnessed events against the committed regime, and none of it is stored.
                </p>
                <PaperRun title="Customs clearance without a clearance clause.">
                    The composition carries no clause for the authority&rsquo;s clearance determination, and the reason is a design judgment. The customs agent attests its work through the merchant process events and their evidence references, and the parties bind themselves to the filing terms by content hash through the consent clause. That is what an agent can honestly attest: what it filed, when, and under which terms. It stops short of putting a sovereign determination into a clause a commercial party signs. A clause for the determination is worth composing only where the authority attests for itself, and any designer may register one permissionlessly without touching the Core or any clause in use.
                </PaperRun>
                <PaperRun title="The Incoterms 2020 clause.">
                    Incoterms, published by the International Chamber of Commerce, are the trade&rsquo;s vocabulary for cost allocation and risk-transfer points across a shipment. The 2020 edition has eleven rules: EXW, FCA, CPT, CIP, DAP, DPU, DDP, FAS, FOB, CFR, and CIF (ICC 2019). The interpretive tradition is older than the edition and turns over with it; the guide to the 2010 edition reads a rule set DPU had not yet entered (Ramberg 2011). The vocabulary is useful shared reference, but its semantics were written for a world without bonds, and three of its assumptions do not carry over.
                </PaperRun>
                <p>
                    <em>There is no risk-transfer point.</em> Incoterms say risk passes from seller to buyer at a point X. Under the bonded schedule nothing passes at X, because no event discharges a bond: a seller&rsquo;s bond stands in full until the buyer resolves the whole process. An attestation cannot release a bond, and no call exists that would let one. The proximity witness on the handoff at X is evidentiary: it is what the buyer&rsquo;s acceptance turns on at that boundary, and what a forum would be shown if the parties disagreed about where the goods were. The reading that survives is &ldquo;the attestation at X is what the parties agreed would evidence performance at X&rdquo;, and exposure ends at resolution and nowhere else. The Incoterm keeps its operational function, telling the parties who arranges carriage, who arranges insurance, and where the goods change hands.
                </p>
                <p>
                    <em>Cost and risk do not separate.</em> Incoterms distinguish who pays for transport from who bears risk during it. Here both fall out of the process: the party that pays for a leg is the buyer of that leg&rsquo;s order, and what the term calls bearing risk is what the schedule already prices on both sides of every order. A genuinely separate obligation, such as seller-arranged insurance, is composed as a parallel order with the insurer as its seller.
                </p>
                <p>
                    <em>Resolution belongs to the buyer.</em> Incoterms presuppose good-faith resolution between the parties; the bonds give each party its own reason for it, and only the buyer can resolve. The courts the terms usually travel with keep their function as forums the parties name in their agreement, ruling while the process stands open and informing the remedy before the buyer resolves.
                </p>
                <p>
                    The clause therefore commits exactly two things: the declared rule, one of the eleven, and the named place every rule requires, in the standard&rsquo;s own citation form. It encodes no per-rule semantics, since the canonical text is the ICC&rsquo;s, and it does not duplicate the coordinates, which the geolocation clause on the same order supplies. A later ICC edition is a new clause, registered under the hash of its own specification, beside this one. Which rules map directly onto the bonded schedule and which need parallel orders is analysis against the mechanism, not something the clause computes.
                </p>
                <PaperRun title="Clauses the assembly does not include.">
                    The assembly has no clause for bonding legs in different tokens, because the 2:1 comparison holds only within one denomination. It has no force-majeure exit, because the Core has no call that would execute one; an outside event is squared by transfers before resolution. It has no transferability clause inside commerce, for the reasons Section 7 gives.
                </PaperRun>
            </PaperSection>

            <PaperSection title="7. Bill of Lading Transferability">
                <p>
                    The bill of lading is the carrier&rsquo;s receipt for the cargo, the contract of carriage, and, when negotiable, a document of title. Whether the right to receive cargo can pass mid-voyage from the original consignee to a new one matters because cargo is often sold in transit, and the legal artifact of that sale is endorsement of the bill.
                </p>
                <p>
                    The Core does not support substituting a party within an order. Three properties each rule it out: the root buyer is fixed at the first commit and is the buyer of every order; the parties to each commitment are fixed at commit; and the Core has no call for a unilateral exit from a bonded order. A literal endorsement inside the process would need one of the three to bend, and none does.
                </p>
                <PaperRun title="The endorsement is an event outside the process.">
                    The substitution the Core refuses and the trade the parties want are different things. Title moves by the instrument the law recognizes, outside the protocol. What remains inside is the allocation of payments across a schedule already signed, and it is squared before the buyer&rsquo;s one call, like any other outside event. Where the new owner takes over the cost of the remaining legs, the sellers of those legs send the buyer their committed payments before resolution. Any change in performance, such as a new discharge port or a new receiving party, is attested as what happened. The buyer then resolves the committed schedule atomically, and the prepaid legs net to zero: one bond cycle, no early resolution, no party substituted.
                </PaperRun>
                <p>
                    The equilibrium survives the netting. Every bond stays locked through the negotiation, so each party&rsquo;s exposure is unchanged while the transfers are agreed. Once the transfers are collected, resolving is still strictly better for the buyer: withholding would keep amounts bounded by the payments while its own bond of twice them stays locked. The pressure that makes the original schedule credible is the pressure that makes its reallocation credible.
                </p>
                <PaperRun title="What this gives the new owner.">
                    No transferable right is minted inside the protocol. The new owner holds title by the external instrument and never becomes a party to the process, so its protection between purchase and discharge is the ordinary legal layer together with the process&rsquo;s committed data. The netting agreement is therefore worth attesting, so the data shows why the transfers happened. The singular, controlled artifact remains the order, identified by the hash of its commitment and admitted exactly once; the endorsement chain lives beside it in law.
                </PaperRun>
                <PaperRun title="Order form and bearer form.">
                    The distinction between order-form bills, transferred by endorsement, and bearer-form bills, transferred by delivery of the instrument, does not change the treatment. Both move title outside the protocol and leave the same question inside it: who is owed what against a signed schedule, which the transfers before resolution answer. Neither obtains an in-protocol right that circulates on its own. The trade is expressible; the circulating instrument is not.
                </PaperRun>
            </PaperSection>

            <PaperSection title="8. Comparison with Existing Approaches">
                <PaperRun title="TradeLens.">
                    TradeLens was a permissioned consortium ledger; the composition here runs on a permissionless bonded mechanism. TradeLens supplied shared visibility without resolution. The bonded composition supplies resolution, and visibility follows from the data each process leaves. TradeLens answered to IBM and Maersk; the Core&rsquo;s rules are fixed code that every wallet calls on the same terms.
                </PaperRun>
                <PaperRun title="CargoX.">
                    CargoX is a blockchain platform for transferring bills of lading and other trade documents, and states that it is guided by the provisions of the Model Law on Electronic Transferable Records (MLETR) of UNCITRAL, the United Nations Commission on International Trade Law (CargoX n.d.). It addresses transferability, which the bonded composition does not. The two compose: a shipper can carry an order&rsquo;s coordination in a process and the bill&rsquo;s transfer on CargoX, binding the pinned document to the order by content hash through the consent clause.
                </PaperRun>
                <PaperRun title="TradeTrust.">
                    TradeTrust, a framework of Singapore&rsquo;s Infocomm Media Development Authority, provides open-source tools for verifiable and transferable trade documents, designed to comply with the MLETR (IMDA 2026). It composes in the same way as CargoX: a TradeTrust document is an off-chain artifact an order can bind by content hash.
                </PaperRun>
                <PaperRun title="MLETR.">
                    The MLETR is a legal framework rather than a platform (UNCITRAL 2017). It is not an alternative to the composition but a standard its data can be held against. Where the two meet is the transfer pattern of Section 7, and the absence of an in-protocol circulating right stated there is the limit of the meeting.
                </PaperRun>
                <PaperRun title="The architectural distinction.">
                    The bonded composition moves the coordination function from <em>a shared ledger maintained by a consortium</em> to <em>a mechanism a designer composes and participants sign into, order by order</em>. A carrier&rsquo;s decision shrinks from whether to ratify a competitor&rsquo;s gatekeeping to whether to sign one order on one shipment. The decision is made at the level of individual trade, not industry governance.
                </PaperRun>
            </PaperSection>

            <PaperSection title="9. Scope">
                <p>Four conditions bound the argument.</p>
                <PaperRun title="Asset specificity at the port.">
                    Major ports are functional monopolies for berth windows, terminal capacity, and the infrastructure they provide, and carriers have little alternative at congested hubs. Where the route dictates the port and the port is a near-monopolist, the buyer&rsquo;s leverage in choosing its seller is weak. The composition still works there, with well-defined bonds and a clean resolution path, but it does not create price competition in port services where structure does not admit it.
                </PaperRun>
                <PaperRun title="Customs and sovereign authorities.">
                    A customs authority has two functions in the composition. As a seller of clearance service and the recipient of duty, it is a wallet on the same terms as any provider: the Core does not distinguish a tax from a fee for service, which is what lets an import duty and a drayage charge sit in one process as two ordinary orders. As the sovereign that decides whether goods clear, it acts in its own register, off-chain. The composition gives that decision data whose integrity anyone can check, namely what each party signed, against which order, and when; it does not replace the authority.
                </PaperRun>
                <PaperRun title="Bonding at the small-shipper end.">
                    Small shippers that hold no tokens to bond with face friction at commit. The answer is ordinary consolidation: a forwarder that consolidates small shippers&rsquo; cargo is itself the seller on the order, bonding its own deterrent on its own performance, and the small shippers are its off-chain customers on conventional terms. The bond is never outsourced or rented, because it deters only as its party&rsquo;s own; what aggregates is the commitment. The Core is agnostic about the denomination, so a forwarder bonds in whatever token the process uses.
                </PaperRun>
                <PaperRun title="Insurance and reinsurance.">
                    Marine insurance, P&amp;I (protection and indemnity) clubs, and the rest of shipping-risk underwriting keep operating on the objects they have always covered: the cargo, the hull, and third-party liability. What changes is the evidence those markets can read: a container arrives against signed, order-bound attestations rather than a contested paper trail. The chain proves of each attestation that it was signed, bound to its order, and when, never that it is true. What stands behind a seller&rsquo;s attestation is the buyer&rsquo;s choice to withhold resolution, at the price of its own bond, until a false one is put right; after resolution it stays in the public data and in its signer&rsquo;s resolution history. Well-formed data does not prove a voyage happened, since parties acting together can produce it. Insurance composes by covering the cargo, never the bond: a policy that made a party whole against its own bond would cancel the deterrent the bond exists to be.
                </PaperRun>
            </PaperSection>

            <PaperSection title="10. Conclusion">
                <p>
                    Consolidation under a rival is a request competitors refuse, and the bonded composition never makes it. The interest that holds a shipment&rsquo;s sellers together is arithmetic on the accumulator, not trust in a controller: each seller bonds twice the value accumulated through its order, and one atomic resolution by the importer pays every seller and refunds every bond. What the composition leaves outside, namely the sovereign&rsquo;s decision, the port&rsquo;s market power, and the circulating title, stays where law and markets already hold it. The composition offers per shipment the coordination TradeLens sought by asking an industry to consolidate under one of its members, to parties who need agree on nothing but the shipment.
                </p>
            </PaperSection>
        </PaperLayout>
    );
}
