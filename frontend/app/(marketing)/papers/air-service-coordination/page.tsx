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
        <PaperLayout
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
                        Two architectural properties carry the contribution. <em>Asymmetric bonding within a single process</em>: the passenger is the <code>rootBuyer</code> of every order in the process; each provider wallet bonds against the cumulative-value accumulator <Math>{"G"}</Math> at its own commit; the kernel enforces a single <code>rootBuyer</code> across every order. <em>Buyer-initiated atomic resolution</em>: the passenger settles the entire process at destination as a single action; every active order in the process resolves together or none does.
                    </p>
                    <p>
                        Two consequences follow. First, the resource markets are directly accessible to the passenger through bonded commerce. Each provider wallet&rsquo;s interests align with the passenger&rsquo;s at the bonded commit, mediated by no third party. Second, when operational disruption occurs the seller cohort faces direct economic incentive &mdash; under locked bonds across every edge &mdash; to determine and pay compensation directly to the buyer, before any external mechanism (specialized contracts, dispute forums, insurance, regulators) engages. Cascading-delay reduction follows as a consequence of bond posture and atomic resolution; it is a property the architecture produces, not the property the paper is for.
                    </p>
                </>
            }
            references={
                <>
                    <li>European Parliament and Council. <em>Regulation (EC) No 261/2004 establishing common rules on compensation and assistance to passengers in the event of denied boarding and of cancellation or long delay of flights</em>. 11 February 2004.</li>
                    <li>Lan, S., Clarke, J.-P., &amp; Barnhart, C. Planning for Robust Airline Operations: Optimizing Aircraft Routings and Flight Departure Times to Minimize Passenger Disruptions. <em>Transportation Science</em>, 40(1):15&ndash;28, 2006.</li>
                    <li>US Federal Aviation Administration. <em>14 CFR Part 117: Flight and Duty Limitations and Rest Requirements: Flightcrew Members</em>. 2014.</li>
                </>
            }
        >
            <PaperSection title="1. Introduction">
                <p>
                    Air service is coordination across a set of resource markets. The journey a passenger purchases is the joint output of a flight crew (whose certifications and duty-time bands are verified at agreement signing), an aircraft (whose airworthiness certificate is verified the same way), a quantity of jet fuel, slot allocations at origin and destination gates, per-passenger catering, a share of the day&rsquo;s maintenance allocation for the operating airframe, and ground handling for boarding and baggage. Each is a distinct resource the journey draws on; each has natural units of measure already in industry use &mdash; crew-hours, type ratings, fuel volume, gate-slot time bands, meal counts, maintenance hours, baggage counts. Public services are further inputs the flight consumes: air-traffic control, security screening, the federal aviation system itself. These public-authority services are real-world assets with commercial value in the same sense the catering supply or the fuel inventory is, and their wallets participate in the bonded process on the same footing.
                </p>
                <p>
                    Each provider in the assembly is an RWA-as-wallet. The <em>asset</em> is the off-chain real-world asset whose participation produces value &mdash; the airframe that flies, the labor capacity of the pilot, the screening service the security authority provides. The <em>wallet</em> is the on-chain representation of that participation: an address holding the asset&rsquo;s earnings as token balances, plus NFTs that point to the off-chain credentials the asset&rsquo;s role requires (the pilot&rsquo;s flight-crew certification, the aircraft&rsquo;s airworthiness certificate, the maintenance provider&rsquo;s authority-issued authorization). The <em>seller</em> is the human or autonomous agent who controls the wallet&rsquo;s signing key on the asset&rsquo;s behalf. The wallet is an active counterparty in the assembly iff the asset is alive and its credentials are current; that conditional is enforced operationally by the seller and at agreement signing by whichever credential clauses the assembly designer composes.
                </p>
                <p>
                    Each provider wallet sustains its participation the way a node on a blockchain network sustains its participation. A node earns fees and rewards from the network and uses them to cover its off-chain operating expenses (machines, electricity, HVAC, rent); when the receipts no longer cover the costs, the seller stops running the node and the node drops out of the network. An RWA-as-wallet operates on the same logic in its market: receipts from bonded processes must cover the asset&rsquo;s off-chain operating expenses (fuel, parts, labor, premises, regulatory fees, capital amortization), or the seller stops bonding the wallet into processes and the wallet drops out of the market it serves. This holds for the catering wallet and for the security-screening wallet alike: the kernel does not distinguish between a &ldquo;market-traded fee&rdquo; and a &ldquo;regulated fee.&rdquo; Both are payments to service-providing wallets that need receipts sufficient to sustain operation. The clauses the assembly uses to verify credentials at agreement signing are generic across vehicle types &mdash; the same credential and schedule clauses serve aircraft, ships, trucks, and other vehicles, with per-vehicle personalization in the clause content and validator-contract configuration.
                </p>
                <p>
                    The bonded settlement primitive coordinates across these wallets without a coordinating party. Enforcement of bilateral commitments is self-enforcing through asymmetric bonding; multi-party coordination is resolvable from a single signature through atomic resolution. The journey is composed as a bonded process across those resource markets; each provider wallet bonds against the passenger&rsquo;s process; the passenger settles the entire process at destination through one atomic <code>resolveProcess</code> call.
                </p>
                <PaperRun title="Paper organization.">
                    Section 2 summarizes the settlement primitive. Section 3 develops the architectural properties applied to air-service coordination: per-edge asymmetric bonding, buyer-initiated atomic resolution, the two consequences for the assembly, the kernel / composability-stack distinction, and where specialized mechanism contracts can be developed for specific resource markets. Section 4 treats disruption resolution: the seller-cohort compensation mechanism that arises from buyer-dominance under bond pressure (the primary mechanism), illustrated through a worked bond-posture example and the crew-allocation case, with fallback mechanisms treated downstream. Section 5 treats the clause requirements: a sister-clause pair for schedule binding, with the rest of the assembly satisfied by existing infrastructure generic across vehicle types. Section 6 treats what the architecture preserves (safety regulation, crew-labor protections, insurance, competition law) and what it changes (the cost-flow path). Section 7 states the scope conditions. Section 8 concludes.
                </PaperRun>
            </PaperSection>

            <PaperSection title="2. The Settlement Primitive">
                <p>The bonded primitive in <code>FigaroCore</code> has two mechanisms. We summarize the features the present argument uses.</p>
                <PaperRun title="Asymmetric bonding (Mechanism 1).">
                    For a transaction with payment <Math>{"P > 0"}</Math> and cumulative upstream value <Math>{"G \\geq P"}</Math>, the buyer locks <Math>{"2P"}</Math> and the seller locks <Math>{"2G"}</Math>. Cooperation is the unique profile surviving iterated elimination of weakly dominated strategies. The mechanism scales to <Math>{"N"}</Math>-party processes: each seller bonds against the cumulative value of all upstream commitments, producing a mesh of independently secured bilateral edges, each of which carries its own equilibrium.
                </PaperRun>
                <PaperRun title="Buyer dominance with atomic resolution (Mechanism 2).">
                    Only the root buyer can trigger resolution, and resolution settles all active orders in the process simultaneously or not at all. The all-or-nothing rule induces a weakest-link subgame among sellers: each seller&rsquo;s payout depends on universal cooperation across the process. The architecture produces cooperation pressure of magnitude <Math>{"P_i + 2G_i"}</Math> on every other seller from each seller&rsquo;s perspective, without explicit communication, governance, or managerial layer.
                </PaperRun>
                <PaperRun title="What this implies for air-service coordination.">
                    The bonded primitive&rsquo;s two mechanisms supply two coordinative properties for air service. Mechanism&nbsp;1 supplies a bilateral commitment whose settlement does not require either party&rsquo;s home jurisdiction&rsquo;s contract-law regime to enforce: settlement is the on-chain release of locked bonds, mediated by no court. The off-chain agreement remains binding under whatever law the parties select for the substantive commitment, but the kernel&rsquo;s settlement guarantee is jurisdiction-agnostic. Mechanism&nbsp;2 supplies the atomic resolution that propagates a single commit-or-don&rsquo;t decision through the entire process; this is what makes operational damages flow proportionally to the unit that caused them rather than being absorbed at whichever contract has the loosest cap. Neither mechanism is novel to the air-service domain; both are general-purpose settlement properties whose application here is the present paper&rsquo;s contribution.
                </PaperRun>
            </PaperSection>

            <PaperSection title="3. The Bonded Architecture Applied to Air Service">
                <p>
                    The substantive contribution of the bonded primitive to air-service coordination operates at the edge of the bonded process, not at any particular position within it. Two architectural properties supply the contribution.
                </p>
                <PaperRun title="Asymmetric bonding within a single process.">
                    The kernel enforces a strong structural rule: every order in a process has the same buyer (the <code>rootBuyer</code>). The passenger wallet commits directly to each provider wallet. The first commit creates the process under the passenger&rsquo;s address; every subsequent commit in the same process extends the cumulative-value accumulator <Math>{"G"}</Math> by the new payment. At each commit the passenger posts <Math>{"2P_i"}</Math> for that specific payment, and the seller posts <Math>{"2G_{\\text{at commit time}}"}</Math> &mdash; the full cumulative process value at the moment they commit. Bond posture is asymmetric: the passenger&rsquo;s per-commit bond scales with the immediate payment, while each seller&rsquo;s bond scales with the cumulative value of every upstream commit in the process. Sellers committing later post correspondingly larger bonds; the last seller bonds against the entire ticket value.
                </PaperRun>
                <PaperRun title="Buyer-initiated atomic resolution.">
                    The passenger calls <code>resolveProcess</code>, and the entire process settles simultaneously. Every active order in the process is resolved together or none is. The passenger&rsquo;s signature is the only signature required for settlement, and atomicity guarantees that no subset of orders settles without the rest.
                </PaperRun>
                <PaperRun title="Two consequences for the air-service assembly.">
                    The two properties together produce two consequences.
                </PaperRun>
                <p>
                    First, <em>the resource markets named in Section 1 become directly accessible to the passenger through bonded commerce.</em> Each provider wallet &mdash; the crew member wallet, the aircraft wallet, the fuel-supplier wallet, the gate-seller wallet, the caterer wallet, the maintenance-provider wallet, the ground-handling wallet &mdash; is a seller bonded against the passenger&rsquo;s process, with payout depending on the passenger&rsquo;s atomic resolution. Each provider&rsquo;s interests align with the passenger&rsquo;s at the bonded commit, mediated by no third party. We treat one alignment case in detail in Section 4: the crew-allocation arrangement.
                </p>
                <p>
                    Second, <em>damage flow tracks bond posture across the assembly&rsquo;s commits rather than the loosest contractual liability cap.</em> Each seller carries asymmetric bond exposure proportional to the cumulative process value at their commit; the seller-side total grows super-linearly with the number of commits while the passenger&rsquo;s posture stays at <Math>{"2P_{\\text{ticket}}"}</Math>. The atomic-resolution rule operates on this set of bonds. When something goes wrong, every seller&rsquo;s bond is locked across every commit &mdash; which is the structural pressure behind the disruption-resolution mechanism developed in Section 4.
                </p>
                <PaperRun title="What the kernel constrains; what the composability stack carries.">
                    The kernel reads only per-order facts: buyer (which must be the <code>rootBuyer</code> in every order in the process), seller, payment, cumulative-value snapshot at commit, and the atomic-resolution rule covering the process. The kernel-level shape of a single process is therefore tightly constrained: one buyer, one or more sellers, all under one cumulative accumulator, all resolving atomically. Deeper compositions across multiple processes (a seller in process <Math>{"A"}</Math> becoming the <code>rootBuyer</code> of process <Math>{"B"}</Math> to coordinate their own sub-suppliers) are admissible at the kernel layer but resolve process-by-process, not across.
                </PaperRun>
                <p>
                    Above the kernel, the protocol-and-runtime composability stack attaches clauses to specific orders: the <code>scheduled-departure-v1</code> clause binds to whichever order the parties want to subject to schedule-tolerance enforcement; the <code>figaro-fulfilment-v2</code> clause declares the handoff points where physical exchange occurs, and <code>figaro-proximity-proof-v1</code> attestations attach to those handoff orders. Mechanism contracts operate on specific order patterns, assembly specifications declare which clauses attach where and which view definitions render which surfaces, and UIs render the process per the assembly&rsquo;s declarations. An assembly&rsquo;s structure, once specified, is a fixed verifiable artifact bound to its full composability stack. The bonded-architecture argument of this paper applies to whichever resource markets the designer composes under one process, with the kernel-enforced structural rule holding throughout.
                </p>
                <PaperRun title="Specialized mechanism contracts per resource market.">
                    Each resource market admits its own market mechanism. The existing <code>DutchAuction</code> contract supplies one such mechanism for cases where descending-price coordination is appropriate (fuel procurement is a candidate where the supplier market admits competition). Bilateral <code>figaro-commerce-v1</code> commits cover the cases where the parties contract directly. Additional mechanism contracts can be developed under the protocol-extension discipline for resources whose market mechanics deserve their own primitive: a slot-allocation mechanism for gate-time bidding, a crew-dispatch mechanism that respects type-rating and duty-time constraints, a fuel-pool mechanism for shared ramp-side procurement. The mechanism-contract space sits at the runtime tier; the kernel constraint that every order in a process shares one <code>rootBuyer</code> (the passenger) holds across whichever mechanism contracts the assembly composes.
                </PaperRun>
            </PaperSection>

            <PaperSection title="4. Disruption Resolution Under Buyer Dominance">
                <p>
                    We turn to the operational question: when something goes wrong &mdash; a delay, a slip, a service failure &mdash; how is the disruption resolved under the bonded architecture? The substantive answer is that Mechanism&nbsp;2 of the kernel (buyer dominance with atomic resolution) creates structural pressure for the seller cohort to determine and pay compensation themselves, directly to the buyer, before any external mechanism engages. This is the primary damage-management mechanism in the architecture. We treat it first, place a bond-posture worked example, develop the crew-allocation case, note the IROps-scale extension, and then position the fallback mechanisms in their proper register downstream.
                </p>
                <PaperSubsection title="4.1 The primary mechanism: seller-cohort compensation under bond pressure">
                    <PaperRun title="Bond posture per commit.">
                        Every order in a process shares the same <code>rootBuyer</code>; the passenger as that <code>rootBuyer</code> posts <Math>{"2P_i"}</Math> at each commit to each resource provider, and each resource provider posts <Math>{"2G_{\\text{at commit time}}"}</Math> where <Math>{"G"}</Math> is the cumulative process value at the moment of that commit. Sellers committing later in the sequence post correspondingly larger bonds. Aggregated across an <Math>{"N"}</Math>-seller process, the bonded exposure of the seller cohort scales super-linearly with the number of resource markets the assembly draws on.
                    </PaperRun>
                    <PaperRun title="A bond-posture worked example.">
                        Consider a stylized domestic short-haul passenger journey totalling $250. The kernel enforces <code>buyer = rootBuyer</code> in every order in a process, so the passenger commits directly to each provider wallet. The ten commits below are all part of one process under one <code>rootBuyer</code> (the passenger). The kernel maintains a single process-wide cumulative-value accumulator <Math>{"G"}</Math> that grows monotonically as each commit lands (<Math>{"G \\leftarrow G + P_i"}</Math>). At every commit the buyer posts <Math>{"2P_i"}</Math> and the seller posts <Math>{"2G_{\\text{at commit time}}"}</Math>. The asymmetry shows up across the sequence: the passenger&rsquo;s buyer-side bond at each commit scales only with the immediate payment to that seller, while each seller&rsquo;s bond scales with the full cumulative value of every upstream commit. Sellers committing later post correspondingly larger bonds; the last seller bonds against the entire ticket value. This is cumulative upstream bonding in operation.
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
                                    ["Aircraft wallet (root)", "$65", "$65", "$130", "$130"],
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
                            Stylized per-commit bond posture for a domestic short-haul passenger journey under one process. <Math>{"G"}</Math> is the process-wide cumulative-value accumulator, monotonically growing with each commit. The passenger&rsquo;s bond at each commit is proportional to the immediate payment; each seller&rsquo;s bond is proportional to the cumulative process value at the moment that seller commits. The last seller to commit posts the largest seller bond, <Math>{"2G_{\\text{final}}"}</Math> = 2 &times; $250 = $500. Per-seller payments are illustrative; absolute magnitudes vary with route, aircraft type, and operating context.
                        </p>
                    </div>
                    <p>Two features of the table carry the structural argument.</p>
                    <p>
                        <em>The asymmetry between buyer and seller bonds.</em> The passenger&rsquo;s aggregate locked bond is $500, which equals <Math>{"2P_{\\text{ticket}}"}</Math> &mdash; the standard buyer posture. The seller cohort&rsquo;s aggregate locked bond is $3,512, more than seven times the passenger&rsquo;s posture, because each seller bonds against the cumulative <Math>{"G"}</Math> that has grown across the upstream commits. This is not an accident of the example; it is the asymmetric-bonding architecture in operation. As the assembly adds more resource markets, the seller-side total grows super-linearly with the number of commits while the passenger&rsquo;s side stays at <Math>{"2P_{\\text{ticket}}"}</Math>.
                    </p>
                    <p>
                        <em>The magnitude of the seller cohort&rsquo;s locked bond.</em> The seller cohort&rsquo;s aggregate locked bond ($3,512) is more than fourteen times the ticket payment. A non-resolving passenger holds that full pool locked across every commit in the process. The pressure on the cohort to compensate the passenger and secure resolution is structural in proportion that exceeds the ticket by more than an order of magnitude.
                    </p>
                    <p>
                        The order in which sub-orders commit reorders which specific seller posts the largest bond, but does not change the aggregate seller cohort total: it depends only on the set of payments, not the sequence. Whichever seller commits last bonds against the full <Math>{"G_{\\text{final}} = P_{\\text{ticket}}"}</Math>.
                    </p>
                    <PaperRun title="Withholding resolution as the buyer&rsquo;s leverage.">
                        The passenger holds unilateral authority to call <code>resolveProcess</code>. As long as the passenger does not call, every seller&rsquo;s bond in the process remains locked. Each seller faces forfeit of their full <Math>{"2G_i"}</Math> on continued non-resolution. The buyer&rsquo;s atomic-resolution authority is therefore not a remedy in the conventional sense (it does not pay the buyer anything beyond bond recovery); it is leverage. The buyer can hold the entire bond pool locked by simply not signing.
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
                        The buyer accepts the compensation that satisfies them and calls <code>resolveProcess</code>. Bonds release across the process; every seller recovers <Math>{"2G_i + P_i"}</Math> less their share of the compensation; the buyer recovers their bond plus the compensation already paid. The settlement is bilateral and direct.
                    </p>
                    <p>
                        This happens fast. The negotiation occurs at the operational boundary (the airport gate, the destination airport&rsquo;s customer service desk, in some cases through the runtime UI&rsquo;s disruption-coordination surface), not in a court filing six months later. It happens before insurance claims, before dispute-resolution forums, before regulatory engagement. Most disruption resolves through this path because that is where the bond pressure points.
                    </p>
                    <PaperRun title="The crew-allocation case.">
                        The mechanism is concrete in the crew market. The crew-allocation operates as a direct market between the passenger and the crew member. The crew member&rsquo;s wallet &mdash; holding their certification NFTs and operating-permit credentials, verified through the relevant credential clauses at agreement signing &mdash; bonds against the passenger&rsquo;s process at the crew-edge. The crew member&rsquo;s payout depends on the passenger&rsquo;s atomic resolution at destination; the crew member&rsquo;s interests align with the passenger&rsquo;s directly through the bonded edge. The allocation discipline is whichever mechanism contract the assembly designer composes for the crew market: a bilateral <code>figaro-commerce-v1</code> commit, a descending-price <code>DutchAuction</code>, or a future crew-dispatch mechanism contract that respects type-rating and duty-time constraints. Collective-bargaining institutions over wage rates, duty-time protections, and seniority among crew remain; they are labor-market institutions the bonded primitive does not touch.
                    </PaperRun>
                    <p>
                        Under disruption &mdash; say a crew member cannot fly &mdash; the crew-edge bond is locked alongside every other edge in the process. The crew member negotiates compensation directly with the passenger (find a substitute crew member at speed, accommodate the passenger on the next flight, refund the leg, or whatever the passenger accepts). Resolution follows compensation. There is no intermediary in this negotiation; the architecture does not contemplate one.
                    </p>
                    <PaperRun title="IROps-scale coordination.">
                        The single-flight example understates the operational complexity of large-scale irregular operations (IROps). A hub disruption produces simultaneous bonded processes across hundreds of flights, with thousands of bonded edges across the resource-market mesh. The compensation negotiation at IROps scale is operationally heavier than the per-flight case: each affected passenger holds a separate bonded process with its own seller cohort, and many provider wallets (crew member wallets, aircraft wallets, ground-handling wallets) appear in many processes at once. The bonded architecture does not eliminate this coordination cost; it routes the cost in a structurally different direction. Each affected passenger faces a busy but bilaterally coordinated seller cohort negotiating their compensation directly. Operational tooling for the provider wallet&rsquo;s seller &mdash; who manages bonds locked across many simultaneous processes and must coordinate compensation responses at scale &mdash; is itself an assembly-design question.
                    </PaperRun>
                    <PaperRun title="The weakest-link character of the pressure.">
                        Under buyer dominance with atomic resolution, each seller bears direct economic interest of magnitude <Math>{"P_i + 2G_i"}</Math> in every other seller&rsquo;s performance, because each seller&rsquo;s payout depends on universal cooperation across the process: cooperation is the unique equilibrium surviving iterated elimination of weakly dominated strategies, induced by atomic resolution operating on the bonded mesh. The analytical content is the formal characterization of the pressure; the operational content is sellers paying compensation to buyers directly to secure resolution. The same structural shape produces the joint-liability dynamic in Grameen-style microfinance, in which group members chip in to cover a struggling member&rsquo;s installment before the lender forecloses, because each member&rsquo;s continued credit access is exposed to every other member&rsquo;s repayment. The bonded architecture&rsquo;s seller-cohort-compensates-buyer dynamic is the same structural mechanism scaled with chain depth and operating without the social-substrate prerequisites Grameen requires. Buyer dominance with atomic resolution is in this sense a <em>social mechanism</em>: it produces social-coordination behavior (peer pressure, cohort negotiation, burden-sharing, coverage of a struggling counterpart) endogenously through the bond architecture, with each provider wallet&rsquo;s continued participation in its market making the negotiation rationally compelled rather than socially expected.
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
                        <em>Specialized mechanism contracts (protocol layer).</em> Where the assembly composes a specialized mechanism contract &mdash; a delay-compensation contract that disburses pre-agreed amounts under specified conditions, a slot-reallocation mechanism, a fuel-pool mechanism &mdash; the contract handles its specific coordination automatically. The specialized contract complements the primary mechanism by making specific compensation patterns automatic rather than negotiated.
                    </p>
                    <p>
                        <em>Coordination tokens (runtime layer).</em> Where the assembly composes around a coordination token, the substrate&rsquo;s operational state registers as token value. Token holders bear operational quality through value impact rather than through direct compensation. Token-value reflection is a diffuse signal operating in parallel with the per-edge compensation mechanism, not a substitute for it.
                    </p>
                    <p>
                        <em>Off-chain dispute resolution forums.</em> The off-chain agreement named in the bonded commitment binds a dispute forum (state court, international arbitration center, ODR platform, Schelling-point juror system). The forum engages when the seller-cohort compensation does not resolve the dispute &mdash; typically because the dispute is substantive in a way bond pressure cannot address (duress, mistake, frustration, illegality, public-policy concerns). The bonded record is the evidentiary input the forum operates on: kernel byproducts (commit and resolution events) supply the indisputable settlement record, and clause-validated attestations (<code>figaro-proximity-proof-v1</code> handoff attestations, <code>figaro-courier-process-v1</code> stage events) supply the substantive performance evidence.
                    </p>
                    <p>
                        <em>Insurance compositions.</em> A passenger or provider wallet who wants insurance against risks the bond pool cannot absorb (catastrophic events, multi-day weather disruption, force-majeure events) composes a parallel bonded process with an insurer. The insurer&rsquo;s bond underwrites the risk; insurance settlement is its own bonded event. Insurance composes with the bonded primitive without modifying the kernel.
                    </p>
                    <p>
                        <em>Regulators.</em> Aviation safety regulators, consumer protection authorities, antitrust enforcement, and labor protection regimes operate alongside the bonded architecture and engage in the matters their authority covers. The architecture does not displace them.
                    </p>
                    <p>
                        The substantive contribution of the bonded architecture to damage management is that the primary mechanism &mdash; seller cohort negotiating and paying compensation directly to the buyer, before external mechanisms engage &mdash; is structural, immediate, and operates without any of the fallbacks being needed in most cases. The conventional regime&rsquo;s cascading-delay pathology &mdash; damages absorbed by whichever contract has the loosest liability cap, with limited unit-level operational signal (Lan, Clarke, &amp; Barnhart, 2006) &mdash; reduces under the bonded architecture as a consequence of bond posture and atomic resolution.
                    </p>
                </PaperSubsection>
            </PaperSection>

            <PaperSection title="5. Clauses">
                <p>
                    The assembly draws almost entirely on existing clause infrastructure. A sister-clause pair is required for schedule binding: <code>scheduled-departure-v1</code> and <code>scheduled-arrival-v1</code>, so the resolution path can verify whether the sellers delivered against the agreed departure and arrival schedule respectively.
                </p>
                <p>
                    The schedule and credential clauses the assembly relies on are generic across vehicle types: the same primitives serve aircraft, ships, trucks, and other scheduled vehicles, with per-vehicle personalization in the clause content (designator format, authority issuing the credential, tolerance windows) and in validator-contract configuration. The air-service application below is one personalization of those primitives, not a domain-specific architecture.
                </p>
                <PaperRun title="Existing clauses.">
                    <code>figaro-commerce-v1</code> carries the currency, payment, and itemized line-items of every commitment in the assembly &mdash; the passenger ticket and every sub-procurement commitment. <code>figaro-courier-process-v1</code> carries staged progression as a sequence of attestations; the clause&rsquo;s staged event structure can be re-used by reinterpretation (boarding initiated, cabin ready, pushback, takeoff, arrival, or whatever projection the assembly designer adopts), without authoring a new clause. <code>figaro-fulfilment-v2</code> declares the handoff points where physical exchange occurs between operational parties, and <code>figaro-proximity-proof-v1</code> attests that a given handoff happened at the agreed place and time. <code>figaro-arbitration-kleros-v1</code> carries the dispute-resolution-forum selection and <code>figaro-applicable-law-v1</code> the governing-law clause for international flights, where the parties want to specify a particular forum and law. <code>figaro-geo-v2</code> carries the origin and destination geohashes where geographic-anchoring is operationally relevant. The GHG family of clauses is available for assemblies that wish to compose carbon-emission attestations into the ticket commitment.
                </PaperRun>
                <p>
                    The credential clauses verifying the wallet-held NFTs that qualify each provider to participate (the pilot wallet&rsquo;s FAA certification, the aircraft wallet&rsquo;s airworthiness certificate, the maintenance-provider wallet&rsquo;s authority-issued certifications) are runtime-tier credential clauses the assembly designer composes; the kernel does not enforce them, but the validator contracts the assembly binds at agreement signing do.
                </p>
                <PaperRun title="The new sister-clause pair.">
                    The pair binds a commerce-v1 ticket commitment to a specific scheduled departure event and a specific scheduled arrival event, so the resolution path can verify whether the sellers delivered against schedule at each end of the journey. Splitting departure and arrival into a sister pair follows the established sister-clause pattern in Figaro (proximity-policy / proximity-proof; the GHG-disclosure family / GHG-measurement split): each event is attested separately, with content shaped to the event the parties expect at that point.
                </PaperRun>
                <p><code>scheduled-departure-v1</code> (Layer A spec):</p>
                <ul className="space-y-1 list-disc pl-6 text-sm">
                    <li><code>flightDesignator</code> (string, IATA format, e.g. &ldquo;NK1234&rdquo;)</li>
                    <li><code>scheduledDeparture</code> (ISO 8601 datetime, with explicit timezone)</li>
                    <li><code>originAirport</code> (string, ICAO 4-character, e.g. &ldquo;KORD&rdquo;)</li>
                    <li><code>aircraftType</code> (string, optional, IATA aircraft code; omitted if the parties reserve substitution rights at the runtime tier)</li>
                    <li><code>departureToleranceSeconds</code> (integer, the agreed slip below which no penalty applies; e.g. 900 for a 15-minute window)</li>
                </ul>
                <p><code>scheduled-arrival-v1</code> (Layer A spec):</p>
                <ul className="space-y-1 list-disc pl-6 text-sm">
                    <li><code>flightDesignator</code> (string, IATA format)</li>
                    <li><code>scheduledArrival</code> (ISO 8601 datetime, with explicit timezone)</li>
                    <li><code>destinationAirport</code> (string, ICAO 4-character)</li>
                    <li><code>aircraftType</code> (string, optional, IATA aircraft code)</li>
                    <li><code>arrivalToleranceSeconds</code> (integer)</li>
                </ul>
                <p>
                    The two clauses share the <code>flightDesignator</code> field so the arrival event can be matched to its departure within the bonded process. We deliberately do not impose a maximum on <code>departureToleranceSeconds</code> or <code>arrivalToleranceSeconds</code>. Scheduled-service operations vary widely in operationally meaningful tolerance windows, and hard-coding a maximum at the validator contract would foreclose legitimate use cases under the first-write-wins binding discipline that makes the clauseId permanent. The contracting parties choose the tolerance their operation supports; if a domain-specific maximum is later wanted, it can be enforced at a tighter sister clause (e.g. <code>figaro-passenger-departure-v1</code>) without mutating the present binding. The pair is the seed of a <em>scheduled-service</em> family; later extensions could cover scheduled ground transport, scheduled deliveries with tight windows, and other scheduled-binding use cases without reauthoring the family.
                </p>
                <PaperRun title="Clauses the architecture deliberately does not include.">
                    Three classes of clause are conspicuously absent. First, there is no force-majeure clause that allows a counterparty to avoid bond loss in weather events. Force-majeure handling is a <em>composition</em> concern, not a kernel concern: a party who wants to insure against weather-driven delay composes a parallel insurance process; the kernel neither knows about weather nor adjudicates whether a given event qualifies. This is the no-escape-hatches discipline of the kernel, applied to the air-service domain. Second, there is no clause that governs which delays count toward bond loss; the <code>scheduled-departure-v1</code> and <code>scheduled-arrival-v1</code> tolerances are the kernel&rsquo;s only such criteria, and any further refinement is for the off-chain forum that adjudicates disputes the parties bring to it. Third, there is no clause that grants any party a unilateral reschedule right; rescheduling is a new commitment with a new clauseId or a new instance, not a mutation of the existing binding. Append-only identity is the discipline.
                </PaperRun>
            </PaperSection>

            <PaperSection title="6. Comparison with the Conventional Apparatus">
                <p>The architectural change should be located precisely against the existing apparatus to clarify what does and does not change.</p>
                <PaperRun title="What changes.">
                    The architecture changes the cost-flow path. Under the contract-of-carriage regime, passenger schedule loss is bounded by per-incident penalty caps and counterparty discretion in issuing voucher compensation; sub-supplier liability for sub-service slip is bounded by per-incident contractual penalties; and the residual loss is absorbed by whichever contract has the loosest cap. Under the bonded architecture, schedule loss is allocated proportionally to the wallet whose bond is exposed at the relevant process layer: sub-supplier bond for sub-service slip, root-counterparty bond for arrival-tolerance violation, passenger bond returned in full on satisfactory delivery. The cost flow is direct, proportional, and tracks the operational layer at which performance failed.
                </PaperRun>
                <PaperRun title="Where value concentrates.">
                    Decomposing the journey into its resource markets makes visible which inputs carry pricing power and which do not. The aircraft is a commodity input &mdash; leased, fungible, available to any operator on similar terms; an airline holds no enduring advantage in the airframe itself. The scarce, hard-to-replicate positions are the airport slots at congested hubs and the brand. Under the conventional regime the firm internalises every input and represents the whole as equity, so the commodity inputs and the scarce positions are valued together inside one share; under the decomposed regime the commodity cost-lines compete toward their cost of capital while value capture concentrates on the scarce positions. An operator captures that value on-chain through a token bound to the scarce asset or to the assembly itself &mdash; access to the slot, or to the operator&rsquo;s branded process, runs through the token, and its price is discovered through use rather than on a securities market. Spirit Airlines is the limiting case in the opposite direction: a carrier built almost entirely on commodity inputs, with correspondingly thin moat, whose position is therefore the hardest to defend once the inputs are individually contractable.
                </PaperRun>
                <PaperRun title="What does not change.">
                    Safety regulation is unchanged: the FAA in the US, EASA in the EU, and analogous national civil-aviation authorities continue to certify aircraft, pilot licensing, maintenance procedures, and operational standards. Crew-labor protections are unchanged: pilot-union and flight-attendant collective bargaining and flight-time / duty-time limits under FAR Part 117 in the US (with analogous regimes elsewhere) apply to the crew-edge under the bonded architecture exactly as they apply under the conventional regime. Insurance and reinsurance are unchanged in their underlying function; the bonded architecture changes the risk profile aviation insurance markets price (a smaller residual after bond allocation; concentrated risk at whichever edges carry the largest cumulative-value bond posture; a new class of bond-default risk at every provider wallet in the process) but does not displace the insurance function. Antitrust and competition law are unchanged: provider-wallet markets remain subject to anti-collusion enforcement, slot-allocation regimes at congested airports remain governed by the relevant authorities, and code-share arrangements remain subject to the applicable competition regimes.
                </PaperRun>
                <PaperRun title="Regulatory roles attached to wallets.">
                    Some regulatory functions attach to a single designated holder in the conventional regime &mdash; FAA Part 121 (and analogous regimes in other jurisdictions) imposes a single-certificate-holder requirement on commercial scheduled passenger operations, with many safety functions attaching to that holder. Under the bonded architecture the certificate-holder is one of the wallets in the assembly (typically the aircraft wallet, or a wallet associated with the aircraft&rsquo;s operating credentials); the certificate function is preserved, but the certificate-holder participates as one bonded counterparty alongside others, not as a cross-market coordinator. Off-chain discovery surfaces, quality-signal aggregators, and multi-process curators may also be useful around the bonded process. The kernel forbids any party other than the passenger from being the buyer of resource-market commits, so no off-chain surface can re-emerge as a kernel-level coordinator.
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
                <PaperRun title="Asset specificity.">
                    The architecture works best where provider wallets compete in markets with multiple available alternatives. Where a provider is a near-monopolist (as airport authority wallets often are at hub airports for gate operations, or as ATC services are by regulatory construction), the buyer-side leverage at sub-procurement is constrained. The architecture is most effective in the low-specificity region of the resource portfolio and least effective at the high-specificity end.
                </PaperRun>
                <PaperRun title="Bond-currency access.">
                    The architecture presumes that all parties can post collateral in a denomination the kernel accepts. For some provider wallets (e.g. small catering contractors operating in jurisdictions with limited crypto on-ramps) this may be a binding operational constraint. The constraint is real but solvable through standard treasury and on-ramp infrastructure.
                </PaperRun>
                <PaperRun title="Aggregate liquidity at the provider tier.">
                    A high-volume provider wallet covering thousands of flights per day under the bonded architecture would face aggregate bond-custody requirements that scale with daily volume. This is an operational treasury question: the wallet maintains a working bond pool sized to its active commitments, with bonds released and rebound as processes resolve. The cumulative custody at any moment is bounded by the active-process count multiplied by per-process bond requirements; the architecture is liquidity-intensive in steady state but not unbounded.
                </PaperRun>
                <PaperRun title="Composability with the conventional regime.">
                    The architecture is composable with the conventional regime: a provider wallet can serve some passengers under the bonded architecture and others under the contract-of-carriage regime, and a sub-supplier can serve some counterparties under bonded contracts and others under conventional ones.
                </PaperRun>
            </PaperSection>

            <PaperSection title="8. Conclusion">
                <p>
                    Air service is a coordination problem across resource markets. Each resource provider is a wallet holding productive value: NFT credentials that qualify the wallet to participate, the underlying real-world asset whose lifecycle the wallet tracks, and a signing key that binds the wallet to bonded commitments. The bonded primitive in <code>FigaroCore</code> coordinates across those wallets without a third party: each commit binds a bilateral edge, asymmetric bonding makes cooperation the dominant strategy at every edge, and atomic resolution propagates a single commit-or-don&rsquo;t decision through the entire process. Cascading-delay reduction follows as a consequence of bond posture and atomic resolution; it is a property the architecture produces, not the property the paper is for.
                </p>
                <p>
                    The architecture is composable with existing safety regulation, crew-labor protections, insurance markets, and competition regimes. It changes the cost-flow path without displacing the regulatory and contractual layers that surround it. The architecture is well-defined, and its operational properties differ from the conventional regime in ways the operations-research literature on airline scheduling has documented without being positioned to address. What the present paper supplies is the assembly &mdash; the configuration of bonded commits, the credential clauses, the schedule sister-pair, and the disruption-resolution mechanism &mdash; that turns the bonded primitive into a working air-service coordination architecture.
                </p>
            </PaperSection>
        </PaperLayout>
    );
}
