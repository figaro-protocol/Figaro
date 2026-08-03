import type { Metadata } from "next";
import {
    PaperLayout,
    PaperSection,
    PaperSubsection,
    PaperRun,
} from "@/components/papers/PaperLayout";
import { Math } from "@/components/papers/Math";

export const metadata: Metadata = {
    title: "Air Service as Coordinated Resource Markets — Figaro Protocol",
    description:
        "Air service is coordination across resource markets — crew, aircraft, fuel, slots, catering, maintenance, ground handling, public-authority services — each an RWA-as-wallet. Bonded commitments coordinate them directly; under buyer-dominant atomic resolution, the seller cohort pays compensation directly before any external mechanism engages.",
};

export default function AirServiceCoordinationPaper() {
    return (
        <PaperLayout slug="air-service-coordination"
            title="Air Service as Coordinated Resource Markets"
            subtitle="An Industrial-Engineering Reading of the Bonded Architecture"
            author="Alessandro Daliana"
            date="May 2026"
            watermark="Figaro Protocol · Preprint"
            keywords="scheduled-service coordination, supply-chain coordination, process modeling, resource markets, weakest-link coordination, industrial engineering"
            abstract={
                <>
                    <p>
                        Air service is coordination across a set of resource markets: crew-hours and certifications, aircraft-time, fuel volume, gate slots, catering counts, maintenance hours, ground handling. Each resource provider is an off-chain real-world asset (RWA) &mdash; a pilot, an airframe, a fuel inventory, a security checkpoint &mdash; whose on-chain participation is mediated by a wallet. The wallet holds the asset&rsquo;s earnings as token balances and points to the asset&rsquo;s off-chain credentials through NFTs (a flight-crew certification, an airworthiness certificate, an operating permit). A human or autonomous agent operates the wallet on the asset&rsquo;s behalf. The wallet is an active counterparty in the assembly iff the asset is alive and its credentials are current. Public-authority services participate on the same footing as commercial providers. Bonded commitments in the Figaro kernel coordinate these wallets directly: the buyer wallet (the passenger) posts <Math>{"2P_i"}</Math> at each commit, and each provider wallet posts <Math>{"2G"}</Math> against the cumulative process value at the moment it commits.
                    </p>
                    <p>
                        Two architectural properties carry the contribution. <em>Asymmetric bonding within a single process</em>: the passenger is the root buyer of every order in the process; each provider wallet bonds against the cumulative-value accumulator <Math>{"G"}</Math> at its own commit; the kernel enforces a single root buyer across every order. <em>Buyer-initiated atomic resolution</em>: the passenger settles the entire process at destination as a single action; every active order in the process resolves together or none does.
                    </p>
                    <p>
                        Two consequences follow. First, the resource markets are directly accessible to the passenger through bonded commerce. Each provider wallet&rsquo;s interests align with the passenger&rsquo;s at the bonded commit, mediated by no third party. Second, when operational disruption occurs the seller cohort faces direct economic incentive &mdash; under locked bonds across every edge &mdash; to determine and pay compensation directly to the buyer, before any external mechanism (specialized contracts, dispute forums, insurance, regulators) engages.
                    </p>
                </>
            }
            references={
                <>
                    <li>European Parliament and Council. <em>Regulation (EC) No 261/2004 establishing common rules on compensation and assistance to passengers in the event of denied boarding and of cancellation or long delay of flights</em>. 11 February 2004.</li>
                    <li>Ghatak, M. Group Lending, Local Information and Peer Selection. <em>Journal of Development Economics</em>, 60(1):27&ndash;50, 1999.</li>
                    <li>Lan, S., Clarke, J.-P., &amp; Barnhart, C. Planning for Robust Airline Operations: Optimizing Aircraft Routings and Flight Departure Times to Minimize Passenger Disruptions. <em>Transportation Science</em>, 40(1):15&ndash;28, 2006.</li>
                    <li>Stiglitz, J. E. Peer Monitoring and Credit Markets. <em>World Bank Economic Review</em>, 4(3):351&ndash;366, 1990.</li>
                    <li>US Federal Aviation Administration. <em>14 CFR Part 117: Flight and Duty Limitations and Rest Requirements: Flightcrew Members</em>. 2014.</li>
                </>
            }
        >
            <PaperSection title="1. Introduction">
                <p>
                    Air service is coordination across a set of resource markets. The journey a passenger purchases is the joint output of a flight crew (whose certifications and duty-time bands are verified at agreement signing), an aircraft (whose airworthiness certificate is verified the same way), a quantity of jet fuel, slot allocations at origin and destination gates, per-passenger catering, a share of the day&rsquo;s maintenance allocation for the operating airframe, and ground handling for boarding and baggage. Each is a distinct resource the journey draws on; each has natural units of measure already in industry use &mdash; crew-hours, type ratings, fuel volume, gate-slot time bands, meal counts, maintenance hours, baggage counts. Public services are further inputs the flight consumes: air-traffic control, security screening, the federal aviation system itself. These public-authority services are real-world assets with commercial value in the same sense the catering supply or the fuel inventory is, and their wallets participate in the bonded process on the same footing (Section 7 scopes this assumption).
                </p>
                <p>
                    Each provider in the assembly is an RWA-as-wallet. The <em>asset</em> is the off-chain real-world asset whose participation produces value &mdash; the airframe that flies, the labor capacity of the pilot, the screening service the security authority provides. The <em>wallet</em> is the on-chain representation of that participation: an address holding the asset&rsquo;s earnings as token balances, plus NFTs that point to the off-chain credentials the asset&rsquo;s role requires (the pilot&rsquo;s flight-crew certification, the aircraft&rsquo;s airworthiness certificate, the maintenance provider&rsquo;s authority-issued authorization). The <em>seller</em> is the human or autonomous agent who controls the wallet&rsquo;s signing key on the asset&rsquo;s behalf. The wallet is an active counterparty in the assembly iff the asset is alive and its credentials are current; that conditional is enforced operationally by the seller and at agreement signing by whichever credential clauses the assembly designer composes.
                </p>
                <p>
                    Each provider wallet sustains its participation the way a node on a blockchain network sustains its participation. A node earns fees and rewards from the network and uses them to cover its off-chain operating expenses (machines, electricity, HVAC, rent); when the receipts no longer cover the costs, the seller stops running the node and the node drops out of the network. An RWA-as-wallet operates on the same logic in its market: receipts from bonded processes must cover the asset&rsquo;s off-chain operating expenses (fuel, parts, labor, premises, regulatory fees, capital amortization), or the seller stops bonding the wallet into processes and the wallet drops out of the market it serves. This holds for the catering wallet and for the security-screening wallet alike: the kernel does not distinguish between a &ldquo;market-traded fee&rdquo; and a &ldquo;regulated fee.&rdquo; Both are payments to service-providing wallets that need receipts sufficient to sustain operation.
                </p>
                <p>
                    The bonded settlement primitive coordinates across these wallets without a coordinating party. Enforcement of bilateral commitments is self-enforcing through asymmetric bonding; multi-party coordination is resolvable from a single signature through atomic resolution. The journey is composed as a bonded process across those resource markets; each provider wallet bonds against the passenger&rsquo;s process; the passenger settles the entire process at destination in a single atomic resolution.
                </p>
                <PaperRun title="Paper organization.">
                    Section 2 summarizes the settlement primitive. Section 3 develops the architectural properties applied to air-service coordination: per-edge asymmetric bonding, buyer-initiated atomic resolution, the two consequences for the assembly, the kernel / composability-stack distinction, and where specialized mechanism contracts can be developed for specific resource markets. Section 4 treats disruption resolution: the seller-cohort compensation mechanism that arises from buyer-dominance under bond pressure (the primary mechanism), illustrated through a worked bond-posture example and the crew-allocation case, with fallback mechanisms treated downstream. Section 5 treats the clause requirements: a sister-clause pair for schedule binding, with the rest of the assembly satisfied by existing infrastructure. Section 6 treats what the architecture preserves (safety regulation, crew-labor protections, insurance, competition law) and what it changes (the cost-flow path). Section 7 states the scope conditions. Section 8 concludes.
                </PaperRun>
            </PaperSection>

            <PaperSection title="2. The Settlement Primitive">
                <p>The bonded primitive in the settlement kernel has two mechanisms. We summarize the features the present argument uses.</p>
                <PaperRun title="Asymmetric bonding (Mechanism 1).">
                    For a transaction with payment <Math>{"P > 0"}</Math> and cumulative upstream value <Math>{"G \\geq P"}</Math>, the buyer locks <Math>{"2P"}</Math> and the seller locks <Math>{"2G"}</Math>. Cooperation is the unique profile surviving iterated elimination of weakly dominated strategies. The mechanism scales to <Math>{"N"}</Math>-party processes: each seller bonds against the cumulative value of all upstream commitments, producing a mesh of independently secured bilateral edges, each of which carries its own equilibrium.
                </PaperRun>
                <PaperRun title="Buyer dominance with atomic resolution (Mechanism 2).">
                    Only the root buyer can trigger resolution, and resolution settles all active orders in the process simultaneously or not at all. The all-or-nothing rule induces a weakest-link subgame among sellers: each seller&rsquo;s payout depends on universal cooperation across the process. Each seller has <Math>{"P_i + 2G_i"}</Math> of its own at stake in universal cooperation, which is the pressure it exerts on the cohort &mdash; without explicit communication, governance, or managerial layer.
                </PaperRun>
                <PaperRun title="What this implies for air-service coordination.">
                    The bonded primitive&rsquo;s two mechanisms supply two coordinative properties for air service. Mechanism&nbsp;1 supplies a bilateral commitment whose settlement does not require either party&rsquo;s home jurisdiction&rsquo;s contract-law regime to enforce: settlement is the on-chain release of locked bonds, mediated by no court. The off-chain agreement remains binding under whatever law the parties select for the substantive commitment, but the kernel&rsquo;s settlement guarantee is jurisdiction-agnostic. Mechanism&nbsp;2 supplies the atomic resolution that propagates a single commit-or-don&rsquo;t decision through the entire process; this is what makes operational damages flow proportionally to the unit that caused them rather than being absorbed at whichever contract has the loosest cap. Neither mechanism is novel to the air-service domain; both are general-purpose settlement properties whose application here is the present paper&rsquo;s contribution. Both hold under perfect monitoring with costless performance, and what the bonds price is settlement discipline; an honest dispute over whether a service was performed as agreed is adjudicated by the forums composed above the kernel, not by the bond posture.
                </PaperRun>
            </PaperSection>

            <PaperSection title="3. The Bonded Architecture Applied to Air Service">
                <p>
                    The substantive contribution of the bonded primitive to air-service coordination operates at the edge of the bonded process, not at any particular position within it. Two architectural properties supply the contribution.
                </p>
                <PaperRun title="Asymmetric bonding within a single process.">
                    The kernel enforces a strong structural rule: every order in a process has the same buyer (the root buyer). The passenger wallet commits directly to each provider wallet. The first commit creates the process under the passenger&rsquo;s address; every subsequent commit in the same process extends the cumulative-value accumulator <Math>{"G"}</Math> by the new payment. At each commit the passenger posts <Math>{"2P_i"}</Math> for that specific payment, and the seller posts <Math>{"2G_{\\text{at commit time}}"}</Math> &mdash; the full cumulative process value at the moment they commit.
                </PaperRun>
                <PaperRun title="Buyer-initiated atomic resolution.">
                    The passenger resolves, and the entire process settles simultaneously. Every active order in the process is resolved together or none is. The passenger&rsquo;s signature is the only signature required for settlement, and atomicity guarantees that no subset of orders settles without the rest.
                </PaperRun>
                <PaperRun title="Two consequences for the air-service assembly.">
                    The two properties together produce two consequences.
                </PaperRun>
                <p>
                    First, <em>the resource markets named in Section 1 become directly accessible to the passenger through bonded commerce.</em> Each provider wallet &mdash; the crew member wallet, the aircraft wallet, the fuel-supplier wallet, the gate-seller wallet, the caterer wallet, the maintenance-provider wallet, the ground-handling wallet &mdash; is a seller bonded against the passenger&rsquo;s process, with payout depending on the passenger&rsquo;s atomic resolution. Each provider&rsquo;s interests align with the passenger&rsquo;s at the bonded commit, mediated by no third party. We treat one alignment case in detail in Section 4: the crew-allocation arrangement.
                </p>
                <p>
                    Second, <em>damage flow tracks bond posture across the assembly&rsquo;s commits rather than the loosest contractual liability cap.</em> The atomic-resolution rule operates on this set of bonds. When something goes wrong, every seller&rsquo;s bond is locked across every commit &mdash; which is the structural pressure behind the disruption-resolution mechanism developed in Section 4.
                </p>
                <PaperRun title="What the kernel constrains; what the composability stack carries.">
                    The kernel reads only per-order facts: buyer (which must be the root buyer in every order in the process), seller, payment, cumulative-value snapshot at commit, and the atomic-resolution rule covering the process. The kernel-level shape of a single process is therefore tightly constrained: one buyer, one or more sellers, all under one cumulative accumulator, all resolving atomically. Deeper compositions across multiple processes (a seller in process <Math>{"A"}</Math> becoming the root buyer of process <Math>{"B"}</Math> to coordinate their own sub-suppliers) are admissible at the kernel layer but resolve process-by-process, not across.
                </PaperRun>
                <p>
                    Above the kernel, the protocol-and-runtime composability stack attaches clauses to specific orders: the scheduled-departure clause binds to whichever order the parties want to subject to schedule-tolerance enforcement; the modalities clause declares the buyer&rsquo;s requested delivery modality, the handoff clause the point where physical exchange occurs, and proximity-policy witness-stage attestations attach to those handoff orders. Mechanism contracts operate on specific order patterns, assembly specifications declare which clauses attach where and which view definitions render which surfaces, and UIs render the process per the assembly&rsquo;s declarations. An assembly&rsquo;s structure, once specified, is a fixed verifiable artifact bound to its full composability stack. The bonded-architecture argument of this paper applies to whichever resource markets the designer composes under one process, with the kernel-enforced structural rule holding throughout.
                </p>
                <PaperRun title="Specialized mechanism contracts per resource market.">
                    Each resource market admits its own market mechanism: bilateral commits where the parties contract directly, or a resource-specific mechanism the designer composes under the protocol-composition discipline &mdash; a slot-allocation mechanism for gate-time bidding, a crew-dispatch mechanism that respects type-rating and duty-time constraints, a fuel-pool mechanism for shared ramp-side procurement. The mechanism-contract space sits at the runtime tier; the kernel constraint that every order in a process shares one root buyer (the passenger) holds across whichever mechanism contracts the assembly composes.
                </PaperRun>
            </PaperSection>

            <PaperSection title="4. Disruption Resolution Under Buyer Dominance">
                <p>
                    We turn to the operational question: when something goes wrong &mdash; a delay, a slip, a service failure &mdash; how is the disruption resolved under the bonded architecture? We treat the primary mechanism first through a bond-posture worked example, develop the crew-allocation case, note the IROps-scale extension, and then position the fallback mechanisms in their proper register downstream.
                </p>
                <PaperSubsection title="4.1 The primary mechanism: seller-cohort compensation under bond pressure">
                    <PaperRun title="A bond-posture worked example.">
                        Consider a stylized domestic short-haul passenger journey totalling $250. The kernel enforces that the buyer of every order is the root buyer, so the passenger commits directly to each provider wallet. The ten commits below are all part of one process under one root buyer (the passenger). The kernel maintains a single process-wide cumulative-value accumulator <Math>{"G"}</Math> that grows monotonically as each commit lands (<Math>{"G \\leftarrow G + P_i"}</Math>). At every commit the buyer posts <Math>{"2P_i"}</Math> and the seller posts <Math>{"2G_{\\text{at commit time}}"}</Math>.
                    </PaperRun>
                    <div className="my-4 overflow-x-auto">
                        <table className="text-sm border-collapse w-full">
                            <thead>
                                <tr>
                                    <th className="border border-default px-3 py-1.5 text-left font-semibold text-ink-heading">Seller (commit sequence)</th>
                                    <th className="border border-default px-3 py-1.5 text-right font-semibold text-ink-heading"><Math>{"P_i"}</Math></th>
                                    <th className="border border-default px-3 py-1.5 text-right font-semibold text-ink-heading"><Math>{"G"}</Math> after</th>
                                    <th className="border border-default px-3 py-1.5 text-right font-semibold text-ink-heading">Buyer <Math>{"2P_i"}</Math></th>
                                    <th className="border border-default px-3 py-1.5 text-right font-semibold text-ink-heading">Seller <Math>{"2G"}</Math></th>
                                </tr>
                            </thead>
                            <tbody>
                                {[
                                    ["Aircraft wallet (first commit)", "$65", "$65", "$130", "$130"],
                                    ["Fuel-supplier wallet", "$45", "$110", "$90", "$220"],
                                    ["Crew member wallet", "$40", "$150", "$80", "$300"],
                                    ["Maintenance-provider wallet", "$15", "$165", "$30", "$330"],
                                    ["Catering wallet", "$5", "$170", "$10", "$340"],
                                    ["Ground-handling wallet", "$15", "$185", "$30", "$370"],
                                    ["Origin airport authority wallet", "$20", "$205", "$40", "$410"],
                                    ["Destination airport authority wallet", "$20", "$225", "$40", "$450"],
                                    ["TSA wallet (security screening)", "$6", "$231", "$12", "$462"],
                                    ["Federal aviation system wallet", "$19", "$250", "$38", "$500"],
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
                                    <td className="border border-default px-3 py-1.5 text-right">$500</td>
                                    <td className="border border-default px-3 py-1.5 text-right">$3,512</td>
                                </tr>
                            </tbody>
                        </table>
                        <p className="text-xs text-ink-muted mt-2 leading-relaxed">
                            Stylized per-commit bond posture for a domestic short-haul passenger journey under one process. <Math>{"G"}</Math> is the process-wide cumulative-value accumulator, monotonically growing with each commit. The last seller to commit posts the largest seller bond, <Math>{"2G_{\\text{final}}"}</Math> = 2 &times; $250 = $500. Per-seller payments are illustrative; absolute magnitudes vary with route, aircraft type, and operating context.
                        </p>
                    </div>
                    <p>
                        <em>The asymmetry between buyer and seller bonds.</em> The passenger&rsquo;s aggregate locked bond is $500, which equals <Math>{"2P_{\\text{ticket}}"}</Math> &mdash; the standard buyer posture. The seller cohort&rsquo;s aggregate locked bond is $3,512, more than seven times the passenger&rsquo;s posture, because each seller bonds against the cumulative <Math>{"G"}</Math> that has grown across the upstream commits. This is not an accident of the example; it is the asymmetric-bonding architecture in operation. As the assembly adds more resource markets, the seller-side total grows super-linearly with the number of commits while the passenger&rsquo;s side stays at <Math>{"2P_{\\text{ticket}}"}</Math>. A non-resolving passenger holds that full pool locked across every commit in the process.
                    </p>
                    <p>
                        The order in which sub-orders commit reorders which specific seller posts the largest bond, but does not change the aggregate seller cohort total: it depends only on the set of payments, not the sequence. Whichever seller commits last bonds against the full <Math>{"G_{\\text{final}} = P_{\\text{ticket}}"}</Math>.
                    </p>
                    <PaperRun title="Withholding resolution as the buyer&rsquo;s leverage.">
                        The passenger holds unilateral authority to resolve. As long as the passenger does not resolve, every seller&rsquo;s bond in the process remains locked. Each seller faces forfeit of their full <Math>{"2G_i"}</Math> on continued non-resolution. The buyer&rsquo;s atomic-resolution authority is therefore not a remedy in the conventional sense (it does not pay the buyer anything beyond bond recovery); it is leverage. The buyer can hold the entire bond pool locked by simply not signing.
                    </PaperRun>
                    <PaperRun title="Sellers determine and pay compensation themselves.">
                        When operational disruption occurs and the buyer is left worse off than the agreement contemplated, the seller cohort faces direct economic incentive to make the buyer whole enough that the buyer chooses to resolve. The mechanism unfolds operationally as follows.
                    </PaperRun>
                    <p>
                        Sellers approach the buyer with compensation offers. Compensation takes whatever form the buyer accepts: cash transfer, future service credit, accommodation or meal vouchers, refund of the ticket payment, alternative routing, partial or full refund combined with services. The currency of compensation is at the parties&rsquo; discretion &mdash; the kernel does not constrain it.
                    </p>
                    <p>
                        Sellers negotiate among themselves about which seller bears what fraction of the compensation. The unit whose performance materially failed bears more. Operational parties around the failure who could not have prevented it (the catering provider who had no role in a fuel slip; the gate seller whose service was unaffected) contribute less or not at all. The negotiation is real but routine: each seller knows their own bond exposure, their counterfactual payout under cooperative resolution, and their willingness-to-pay against losing the bond entirely.
                    </p>
                    <p>
                        The buyer accepts the compensation that satisfies them and resolves. Bonds release across the process; every seller recovers <Math>{"2G_i + P_i"}</Math> less their share of the compensation; the buyer recovers their bond plus the compensation already paid. The settlement is bilateral and direct.
                    </p>
                    <p>
                        This happens fast. The negotiation occurs at the operational boundary (the airport gate, the destination airport&rsquo;s customer service desk, in some cases through the runtime UI&rsquo;s disruption-coordination surface), not in a court filing six months later. It happens before insurance claims, before dispute-resolution forums, before regulatory engagement. Most disruption resolves through this path because that is where the bond pressure points.
                    </p>
                    <PaperRun title="The crew-allocation case.">
                        The mechanism is concrete in the crew market. The crew-allocation operates as a direct market between the passenger and the crew member. The crew member&rsquo;s wallet &mdash; holding their certification NFTs and operating-permit credentials, verified through the relevant credential clauses at agreement signing &mdash; bonds against the passenger&rsquo;s process at the crew-edge. The crew member&rsquo;s payout depends on the passenger&rsquo;s atomic resolution at destination; the crew member&rsquo;s interests align with the passenger&rsquo;s directly through the bonded edge. The allocation discipline is whichever the assembly designer composes for the crew market: a bilateral commerce commit, or a crew-specific mechanism contract that respects type-rating and duty-time constraints. Collective-bargaining institutions over wage rates, duty-time protections, and seniority among crew remain; they are labor-market institutions the bonded primitive does not touch.
                    </PaperRun>
                    <p>
                        Under disruption &mdash; say a crew member cannot fly &mdash; the crew-edge bond is locked alongside every other edge in the process. The crew member negotiates compensation directly with the passenger (find a substitute crew member at speed, accommodate the passenger on the next flight, refund the leg, or whatever the passenger accepts). Resolution follows compensation. There is no intermediary in this negotiation; the architecture does not contemplate one.
                    </p>
                    <PaperRun title="IROps-scale coordination.">
                        The single-flight example understates the operational complexity of large-scale irregular operations (IROps). A hub disruption produces simultaneous bonded processes across hundreds of flights, with thousands of bonded edges across the resource-market mesh. The compensation negotiation at IROps scale is operationally heavier than the per-flight case: each affected passenger holds a separate bonded process with its own seller cohort, and many provider wallets (crew member wallets, aircraft wallets, ground-handling wallets) appear in many processes at once. The bonded architecture does not eliminate this coordination cost; it routes the cost in a structurally different direction. Each affected passenger faces a busy but bilaterally coordinated seller cohort negotiating their compensation directly.
                    </PaperRun>
                    <PaperRun title="The weakest-link character of the pressure.">
                        Under buyer dominance with atomic resolution, each seller&rsquo;s payout depends on universal cooperation across the process: each seller has <Math>{"P_i + 2G_i"}</Math> of its own at stake in universal cooperation, which is the pressure it exerts on the cohort. Cooperation is the unique equilibrium surviving iterated elimination of weakly dominated strategies, induced by atomic resolution operating on the bonded mesh. The same structural shape produces the joint-liability dynamic documented in the Grameen-style microfinance literature (Ghatak, 1999; Stiglitz, 1990), in which group members chip in to cover a struggling member&rsquo;s installment before the lender forecloses, because each member&rsquo;s continued credit access is exposed to every other member&rsquo;s repayment. The bonded architecture&rsquo;s seller-cohort-compensates-buyer dynamic is the same structural mechanism scaled with chain depth and operating without the social-substrate prerequisites Grameen requires. Buyer dominance with atomic resolution is in this sense a <em>social mechanism</em>: it produces social-coordination behavior (peer pressure, cohort negotiation, burden-sharing, coverage of a struggling counterpart) endogenously through the bond architecture, with each provider wallet&rsquo;s continued participation in its market making the negotiation rationally compelled rather than socially expected.
                    </PaperRun>
                    <PaperRun title="Why this is structural, not procedural.">
                        The mechanism is not a courtesy that sellers may or may not extend. It is a direct consequence of the bond posture under atomic resolution. A seller who refuses to participate in compensation negotiation watches their full bond forfeit alongside every other seller&rsquo;s. The compensation mechanism emerges from the architecture because the architecture has made non-cooperation strictly worse than reasonable compensation for every seller in the process.
                    </PaperRun>
                </PaperSubsection>
                <PaperSubsection title="4.2 Fallback mechanisms">
                    <p>
                        The primary mechanism resolves most disruption directly. Fallback mechanisms engage when the primary does not, or when the disruption involves a class of issue the primary cannot address. We list them in the order of operational engagement.
                    </p>
                    <p>
                        <em>Specialized mechanism contracts (protocol layer).</em> Where the assembly composes a specialized mechanism contract &mdash; a delay-compensation contract that disburses pre-agreed amounts under specified conditions &mdash; the contract complements the primary mechanism by making specific compensation patterns automatic rather than negotiated.
                    </p>
                    <p>
                        <em>Off-chain dispute resolution forums.</em> The off-chain agreement named in the bonded commitment binds a dispute forum, ordered outward from arbitration to the courts (an international arbitration center, ODR platform, or Schelling-point juror system; ultimately a state court). The forum engages when the seller-cohort compensation does not resolve the dispute &mdash; typically because the dispute is substantive in a way bond pressure cannot address (duress, mistake, frustration, illegality, public-policy concerns). The bonded record is the evidentiary input the forum operates on: kernel byproducts (commit and resolution events) supply the indisputable settlement record, and clause-validated attestations (proximity-policy hand-off witness attestations, process-log stage events) supply the substantive performance evidence.
                    </p>
                    <p>
                        <em>Insurance compositions.</em> A passenger or provider wallet who wants insurance against risks the bond pool cannot absorb (catastrophic events, multi-day weather disruption, force-majeure events) composes a parallel bonded process with an insurer. The insurer&rsquo;s bond underwrites the risk; insurance settlement is its own bonded event. Insurance composes with the bonded primitive without modifying the kernel.
                    </p>
                    <p>
                        <em>Regulators.</em> Aviation safety regulators, consumer protection authorities, antitrust enforcement, and labor protection regimes operate alongside the bonded architecture and engage in the matters their authority covers. The architecture does not displace them.
                    </p>
                    <p>
                        The conventional regime&rsquo;s cascading-delay pathology &mdash; damages absorbed by whichever contract has the loosest liability cap, with limited unit-level operational signal (Lan, Clarke, &amp; Barnhart, 2006) &mdash; reduces under the bonded architecture as a consequence of bond posture and atomic resolution.
                    </p>
                </PaperSubsection>
            </PaperSection>

            <PaperSection title="5. Clauses">
                <p>
                    The assembly draws almost entirely on existing clause infrastructure. A sister-clause pair is required for schedule binding: a scheduled-departure clause and a scheduled-arrival clause, so the resolution path can verify whether the sellers delivered against the agreed schedule at each end of the journey.
                </p>
                <p>
                    The schedule and credential clauses the assembly relies on are generic across vehicle types: the same primitives serve aircraft, ships, trucks, and other scheduled vehicles, with per-vehicle personalization in the clause content (designator format, authority issuing the credential, tolerance windows). The air-service application below is one personalization of those primitives, not a domain-specific architecture.
                </p>
                <PaperRun title="Existing clauses.">
                    The commerce clause carries the currency, payment, and itemized line-items of every commitment in the assembly &mdash; the passenger ticket and every sub-procurement commitment. The courier-process clause (a live sovereign staged-log primitive) carries staged progression as a sequence of attestations; its staged event structure can be re-used by reinterpretation (boarding initiated, cabin ready, pushback, takeoff, arrival, or whatever projection the assembly designer adopts), without authoring a new clause. The modalities clause declares the buyer&rsquo;s requested delivery modality, the handoff clause the point where physical exchange occurs between operational parties, and a proximity-policy witness-stage attestation records that a given hand-off happened at the agreed place and time. An arbitration clause (a Kleros forum selection, say) carries the dispute-resolution choice, and an applicable-law clause the governing law, for international flights, where the parties want to specify a particular forum and law. The geolocation clause carries the origin and destination geohashes where geographic-anchoring is operationally relevant. The emissions clause is available for assemblies that wish to compose carbon-emission attestations into the ticket commitment.
                </PaperRun>
                <p>
                    The credential clauses verifying the wallet-held NFTs that qualify each provider to participate (the pilot wallet&rsquo;s FAA certification, the aircraft wallet&rsquo;s airworthiness certificate, the maintenance-provider wallet&rsquo;s authority-issued certifications) are credential clauses the assembly designer composes; the kernel does not enforce them &mdash; they bind at agreement signing.
                </p>
                <PaperRun title="The new sister-clause pair.">
                    The pair binds the ticket commitment to a specific scheduled departure event and a specific scheduled arrival event. Splitting departure and arrival into a sister pair follows the established sister-clause pattern in Figaro (the merchant and courier process clauses; the provider-specific arbitration clause beside future per-provider arbitration siblings): each event is attested separately, with content shaped to the event the parties expect at that point.
                </PaperRun>
                <p>
                    The scheduled-departure clause carries the flight designator, the scheduled departure time with an explicit timezone, the origin airport, optionally the aircraft type (omitted if the parties reserve substitution rights), and the agreed departure tolerance &mdash; the slip below which no penalty applies, say a fifteen-minute window. The scheduled-arrival clause mirrors it at the destination end: the same flight designator, the scheduled arrival time, the destination airport, the optional aircraft type, and an arrival tolerance. The shared designator lets the arrival event be matched to its departure within the bonded process.
                </p>
                <p>
                    We deliberately do not impose a maximum on either tolerance. Scheduled-service operations vary widely in operationally meaningful tolerance windows, and hard-coding a maximum would foreclose legitimate use cases. The contracting parties choose the tolerance their operation supports; if a domain-specific maximum is later wanted, it can be enforced by a stricter sister clause without mutating the present binding.
                </p>
                <PaperRun title="Clauses the architecture deliberately does not include.">
                    Three classes of clause are conspicuously absent. First, there is no force-majeure clause that allows a counterparty to avoid bond loss in weather events. Force-majeure handling is a <em>composition</em> concern, not a kernel concern: a party who wants to insure against weather-driven delay composes a parallel insurance process; the kernel neither knows about weather nor adjudicates whether a given event qualifies. This is the no-escape-hatches discipline of the kernel, applied to the air-service domain. Second, there is no clause that governs which delays count toward bond loss; the departure and arrival tolerances are the only such criteria the bonded commitment carries, and any further refinement is for the off-chain forum that adjudicates disputes the parties bring to it. Third, there is no clause that grants any party a unilateral reschedule right; rescheduling is a new commitment, not a mutation of the existing binding. Append-only identity is the discipline.
                </PaperRun>
            </PaperSection>

            <PaperSection title="6. Comparison with the Conventional Apparatus">
                <p>The architectural change should be located precisely against the existing apparatus to clarify what does and does not change.</p>
                <PaperRun title="What changes.">
                    The architecture changes the cost-flow path. Under the contract-of-carriage regime, passenger schedule loss is bounded by per-incident penalty caps and counterparty discretion in issuing voucher compensation; sub-supplier liability for sub-service slip is bounded by per-incident contractual penalties; and the residual loss is absorbed by whichever contract has the loosest cap. Under the bonded architecture, every provider is a direct seller under the passenger as root buyer &mdash; there is no tier of sub-suppliers &mdash; and schedule loss is allocated proportionally to the wallet whose bond is exposed at the failing commit: the provider whose service slipped bears the loss, and the passenger&rsquo;s bond is returned in full on satisfactory delivery. The cost flow is direct, proportional, and tracks the commit at which performance failed.
                </PaperRun>
                <PaperRun title="Where scarcity remains, and where rent disappears.">
                    Decomposing the journey into its resource markets makes visible which inputs are scarce and which are commodity. The aircraft is a commodity input &mdash; leased, fungible, available to any operator on similar terms; the scarce, hard-to-replicate inputs are the airport slots at congested hubs and the brand. Decomposition returns each contributor&rsquo;s margin to the contributor: every value-adder prices its own edge in its own market and bonds against it. Scarce inputs remain scarce and price accordingly &mdash; a congested-hub slot commands what scarcity commands, whether or not any one operator aggregates it. What decomposition removes is not the scarcity but the intermediary&rsquo;s rent: a bonded process has no take-rate seat for a platform to occupy, because no party sits between the buyer and the value-adders skimming the difference. The margin a conventional aggregator would retain is instead settled to whichever wallet added the value.
                </PaperRun>
                <PaperRun title="What does not change.">
                    Safety regulation is unchanged: the FAA in the US, EASA in the EU, and analogous national civil-aviation authorities continue to certify aircraft, pilot licensing, maintenance procedures, and operational standards. Crew-labor protections are unchanged: pilot-union and flight-attendant collective bargaining and flight-time / duty-time limits &mdash; for pilots under FAR Part 117 and for flight attendants under Part 121 in the US, with analogous regimes elsewhere &mdash; apply to the crew-edge under the bonded architecture exactly as they apply under the conventional regime. Insurance and reinsurance are unchanged in their underlying function; the bonded architecture changes the risk profile aviation insurance markets price (a smaller residual after bond allocation; concentrated risk at whichever edges carry the largest cumulative-value bond posture; a new class of bond-forfeiture exposure at every provider wallet in the process) but does not displace the insurance function. Antitrust and competition law are unchanged: provider-wallet markets remain subject to anti-collusion enforcement, slot-allocation regimes at congested airports remain governed by the relevant authorities, and code-share arrangements remain subject to the applicable competition regimes.
                </PaperRun>
                <PaperRun title="Regulatory roles attached to wallets.">
                    Some regulatory functions attach to a single designated holder in the conventional regime &mdash; the FAA issues the operating certificate under Part 119 (and analogous regimes in other jurisdictions), imposing a single-certificate-holder requirement on commercial scheduled passenger operations, with many safety functions attaching to that holder. Under the bonded architecture the certificate-holder is one of the wallets in the assembly (typically the aircraft wallet, or a wallet associated with the aircraft&rsquo;s operating credentials); the certificate function is preserved, but the certificate-holder participates as one bonded counterparty alongside others, not as a cross-market coordinator. Off-chain discovery surfaces, quality-signal aggregators, and multi-process curators may also be useful around the bonded process. The kernel forbids any party other than the passenger from being the buyer of resource-market commits, so no off-chain surface can re-emerge as a kernel-level coordinator.
                </PaperRun>
                <PaperRun title="What this is not.">
                    The architecture is a re-architecture of the cost-flow path in air-service coordination. Whether any specific provider wallet operates well or poorly within the architecture is an operational-management question the architecture is silent on.
                </PaperRun>
                <p>
                    The architecture is also not a passenger-protection regime. It is a coordination protocol that has the side effect of routing schedule-loss damages to the passenger more proportionally than the contract-of-carriage regime does. Passenger-protection regimes (the EU&rsquo;s Regulation 261/2004, the US&rsquo;s Department of Transportation refund and compensation rules, and analogous regimes elsewhere) continue to operate in their own register and apply to the regulated wallet in the relevant jurisdiction. The bonded architecture&rsquo;s passenger-side benefit is structural rather than regulatory.
                </p>
            </PaperSection>

            <PaperSection title="7. Scope">
                <p>The argument bounds itself by several scope conditions.</p>
                <PaperRun title="Public-authority wallets are a deliberate provocation.">
                    Section 1 treats a security checkpoint or the federal aviation system as a wallet bonding into a passenger&rsquo;s process and sharing in compensation. This is the paper&rsquo;s deliberate provocation, not settled practice: no such wallet exists today, and whether public authorities would bond into passenger processes at all is an open institutional question the paper does not resolve. The architecture admits the assumption structurally; we carry it through the rest of the paper to show what the architecture makes expressible at its edge, not to claim the assumption is close to adoption.
                </PaperRun>
                <PaperRun title="Asset specificity.">
                    The architecture works best where provider wallets compete in markets with multiple available alternatives. Where a provider is a near-monopolist (as airport authority wallets often are at hub airports for gate operations, or as ATC services are by regulatory construction), the buyer-side leverage at sub-procurement is constrained. The architecture is most effective in the low-specificity region of the resource portfolio and least effective at the high-specificity end.
                </PaperRun>
                <PaperRun title="Bond-currency access.">
                    The architecture presumes that all parties can post the bond in a denomination the kernel accepts. For some provider wallets (e.g. small catering contractors operating in jurisdictions with limited crypto on-ramps) this may be a binding operational constraint. The constraint is real but solvable through standard treasury and on-ramp infrastructure.
                </PaperRun>
                <PaperRun title="Bond posture at a high-volume provider.">
                    A high-volume provider wallet covering thousands of flights per day posts a bond against each active commitment, so its aggregate bond posture scales with the count of processes open at once. This is the honest price tag of operating at that volume, not a liquidity burden to be financed away: each bond is the coordination instrument for the commitment it stands behind, sized by the value it secures and held for exactly the span that commitment is open. Bonds are deposited as processes commit and returned as they resolve, so the standing posture at any moment is bounded by the active-process count multiplied by the per-process bond &mdash; a deterrent held ready across the provider&rsquo;s open book, not capital seeking a return while it waits.
                </PaperRun>
                <PaperRun title="Composability with the conventional regime.">
                    The architecture is composable with the conventional regime: a provider wallet can serve some passengers under the bonded architecture and others under the contract-of-carriage regime, and a sub-supplier can serve some counterparties under bonded contracts and others under conventional ones.
                </PaperRun>
            </PaperSection>

            <PaperSection title="8. Conclusion">
                <p>
                    Air service is a coordination problem across resource markets. Each resource provider is a wallet holding productive value: NFT credentials that qualify the wallet to participate, the underlying real-world asset whose lifecycle the wallet tracks, and a signing key that binds the wallet to bonded commitments. The bonded primitive in the settlement kernel coordinates across those wallets without a third party: each commit binds a bilateral edge, asymmetric bonding makes cooperation the dominant strategy at every edge, and atomic resolution propagates a single commit-or-don&rsquo;t decision through the entire process. Cascading-delay reduction follows as a consequence of bond posture and atomic resolution; it is a property the architecture produces, not the property the paper is for.
                </p>
                <p>
                    The architecture is composable with existing safety regulation, crew-labor protections, insurance markets, and competition regimes. It changes the cost-flow path without displacing the regulatory and contractual layers that surround it. The architecture is well-defined, and its operational properties differ from the conventional regime in ways the operations-research literature on airline scheduling has documented without being positioned to address. What the present paper supplies is the assembly &mdash; the configuration of bonded commits, the credential clauses, the schedule sister-pair, and the disruption-resolution mechanism &mdash; that turns the bonded primitive into a working air-service coordination architecture.
                </p>
            </PaperSection>
        </PaperLayout>
    );
}
