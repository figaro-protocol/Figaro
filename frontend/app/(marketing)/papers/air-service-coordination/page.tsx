import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import {
    PaperLayout,
    PaperSection,
    PaperSubsection,
    PaperRun,
} from "@/components/papers/PaperLayout";
import { Math } from "@/components/papers/Math";
import { ProcessTopologyFigure } from "@/components/figures/ProcessTopologyFigure";

export const metadata: Metadata = withOg({
    title: "Air Service as Coordinated Resource Markets — Figaro Protocol",
    description:
        "Air service read as coordination across resource markets — crew, aircraft, fuel, slots, catering, maintenance, ground handling, and public services — each provider a wallet bonded directly to the passenger inside one process. Under buyer-only atomic resolution the provider cohort holds its own bonded interest in determining and paying compensation to the passenger directly, before any external mechanism engages. The public-authority wallets are the paper's declared thought experiment.",
});

export default function AirServiceCoordinationPaper() {
    return (
        <PaperLayout slug="air-service-coordination"
            title="Air Service as Coordinated Resource Markets"
            subtitle="An Industrial-Engineering Reading of the Bonded Architecture"
            author="Figaro"
            date="May 2026"
            watermark="Figaro Protocol · Preprint"
            abstract={
                <>
                    <p>
                        Air service is coordination across a set of resource markets: crew-hours and certifications, aircraft-time, fuel volume, gate slots, catering counts, maintenance hours, ground handling. Each provider participates as a real-world asset whose on-chain representation is a wallet &mdash; an address holding the asset&rsquo;s earnings as token balances, against which the asset&rsquo;s off-chain credentials are declared and checkable at their source, operated by a person or a program on the asset&rsquo;s behalf. The wallet is an active counterparty in the assembly iff the asset is alive and its credentials are current. We carry the public services a flight consumes &mdash; security screening, air-traffic services, the airport authorities themselves &mdash; as wallets on the same footing as the commercial providers, and that assumption is this paper&rsquo;s declared thought experiment rather than settled practice: no such wallet exists, and whether public authorities would bond into a passenger&rsquo;s process at all is an open institutional question the paper does not resolve (Section 7). Everything else here holds whether or not that assumption is granted.
                    </p>
                    <p>
                        Two architectural properties carry the contribution. <em>Asymmetric bonding within a single process</em>: the passenger is the buyer of every order in the process; at each commit the passenger locks <Math>{"2P_i"}</Math> for that payment and the provider locks <Math>{"2G_i"}</Math>, twice the value the process has accumulated through its own commit, its own payment included. <em>Buyer-initiated atomic resolution</em>: the passenger settles the entire process at destination as a single action; every active order resolves together or none does, and the resolution is terminal.
                    </p>
                    <p>
                        Two consequences follow. First, the resource markets are directly accessible to the passenger: every provider stands on a bonded edge to the passenger, mediated by no third party. Second, when operational disruption occurs, nobody is paid until the passenger accepts, and each provider&rsquo;s own position &mdash; the payment it forgoes plus the bond it stands in &mdash; is exposed to any other provider&rsquo;s failure. The provider cohort therefore has its own reason to determine and pay compensation directly to the passenger, before any external mechanism &mdash; specialized contracts, dispute forums, insurance, regulators &mdash; engages.
                    </p>
                </>
            }
            references={
                <>
                    <li>Christensen, C. M., Hall, T., Dillon, K., &amp; Duncan, D. S. Know Your Customers&rsquo; &ldquo;Jobs to Be Done&rdquo;. <em>Harvard Business Review</em>, September 2016.</li>
                    <li>European Parliament and Council. <em>Regulation (EC) No 261/2004 establishing common rules on compensation and assistance to passengers in the event of denied boarding and of cancellation or long delay of flights</em>. 11 February 2004.</li>
                    <li>Ghatak, M. Group Lending, Local Information and Peer Selection. <em>Journal of Development Economics</em>, 60(1):27&ndash;50, 1999.</li>
                    <li>Lan, S., Clarke, J.-P., &amp; Barnhart, C. Planning for Robust Airline Operations: Optimizing Aircraft Routings and Flight Departure Times to Minimize Passenger Disruptions. <em>Transportation Science</em>, 40(1):15&ndash;28, 2006.</li>
                    <li>Stiglitz, J. E. Peer Monitoring and Credit Markets. <em>World Bank Economic Review</em>, 4(3):351&ndash;366, 1990.</li>
                    <li>US Federal Aviation Administration. <em>14 CFR Part 117: Flight and Duty Limitations and Rest Requirements: Flightcrew Members</em>. Code of Federal Regulations.</li>
                    <li>US Federal Aviation Administration. <em>14 CFR Part 119: Certification: Air Carriers and Commercial Operators</em>. Code of Federal Regulations.</li>
                    <li>US Federal Aviation Administration. <em>14 CFR Part 121: Operating Requirements: Domestic, Flag, and Supplemental Operations</em>, &sect;121.467 (flight attendant duty period limitations and rest requirements). Code of Federal Regulations.</li>
                </>
            }
        >
            <PaperSection title="1. Introduction">
                <p>
                    Air service is coordination across a set of resource markets. The journey a passenger purchases is the joint output of a flight crew (whose certifications and duty-time bands are declared and bound in the agreement, and checkable afterwards by any reader against the register of the authority that issued them), an aircraft (whose airworthiness certificate is bound the same way), a quantity of jet fuel, slot allocations at origin and destination gates, per-passenger catering, a share of the day&rsquo;s maintenance allocation for the operating airframe, and ground handling for boarding and baggage. Each is a distinct resource the journey draws on; each has natural units of measure already in industry use &mdash; crew-hours, type ratings, fuel volume, gate-slot time bands, meal counts, maintenance hours, baggage counts. Public services are further inputs the flight consumes: air-traffic services, security screening, the airport authorities at either end.
                </p>
                <p>
                    We treat those public services as providers on the same footing as the commercial ones, and we say at the outset what that is: the paper&rsquo;s declared thought experiment. No public-authority wallet exists, nothing in current practice suggests one is imminent, and whether such an authority would bond into a passenger&rsquo;s process is an institutional question no settlement mechanism answers. What the assumption buys is a reading of the whole journey in one register, with nothing left implicitly outside the process; Section 7 states the assumption again and bounds it. The rest of the argument &mdash; the bond posture, the compensation mechanism, the clause requirements &mdash; holds unchanged over the commercial providers alone.
                </p>
                <p>
                    Each provider participates in three layers. The <em>asset</em> is the off-chain real-world asset whose participation produces the value &mdash; the airframe that flies, the labor capacity of the pilot, the screening service the security authority provides. The <em>wallet</em> is the on-chain representation of that participation: an address holding the asset&rsquo;s earnings as token balances, and the party against which the credentials the asset&rsquo;s role requires are declared &mdash; the pilot&rsquo;s flight-crew certification, the aircraft&rsquo;s airworthiness certificate, the maintenance provider&rsquo;s authority-issued authorization. A declaration is bound into the agreements the wallet signs and is checkable by any reader against the register of the authority that issued it; nothing gates the signing, and a false or lapsed declaration is priced by the bond behind it like any other failure to be what one said one was. The <em>operator</em> is the person or autonomous program that controls the wallet&rsquo;s signing key on the asset&rsquo;s behalf. The mechanism sees only the wallet; that the operator acts for the asset sits below its resolution entirely. A wallet is an active counterparty in the assembly iff the asset is alive and its credentials are current &mdash; a conditional the operator maintains, and which the assembly designer binds at agreement signing through whichever credential clauses it composes. Participation is likewise the asset&rsquo;s question and not the mechanism&rsquo;s: receipts from settled processes must cover what the asset costs to run, or the operator stops bonding the wallet into processes and the asset leaves the market it serves. Nothing in that sentence distinguishes a market-set fee from a regulated one; both are payments to a wallet whose asset has to be paid for.
                </p>
                <p>
                    The bonded settlement primitive coordinates across these wallets without a coordinating party. The journey is composed as one bonded process: the passenger is the buyer of every order in it, each provider bonds against the process at its own commit, and the passenger settles the whole process at destination in a single atomic resolution.
                </p>
                <PaperRun title="Paper organization.">
                    Section 2 states the settlement primitive at the depth this argument uses. Section 3 develops the two architectural properties applied to air-service coordination, the two consequences for the assembly, the demand-side reading of the decomposition, and the boundary between what the mechanism constrains and what the composition layer carries. Section 4 treats disruption resolution: the cohort-compensation mechanism that arises from the bond posture under atomic resolution, illustrated through a worked bond-posture example and the crew-allocation case, with fallback mechanisms placed downstream of it. Section 5 treats the clause requirements: a schedule sister-pair and a flight-phase event log to be authored, with the rest of the assembly satisfied by clauses already registered. Section 6 treats what the architecture preserves (safety regulation, crew-labor protections, insurance, competition law) and what it changes (the cost-flow path). Section 7 states the scope conditions. Section 8 concludes.
                </PaperRun>
            </PaperSection>

            <PaperSection title="2. The Settlement Primitive">
                <p>The mechanism has two calls, each with a mechanism design of its own. This section states them, and the equilibrium they compose to, at the depth the air-service argument uses; nothing below is domain-specific, and nothing in the air-service reading modifies it.</p>
                <PaperRun title="Commit &mdash; asymmetric bonding.">
                    A commitment is signed by both parties and names a payment <Math>{"P > 0"}</Math> and a cumulative value <Math>{"G"}</Math>. The buyer locks <Math>{"2P"}</Math>; the seller locks <Math>{"2G"}</Math>. The base is the value the process has accumulated <em>through the seller&rsquo;s own link, its own payment included</em>: for the <Math>{"i"}</Math>-th commit into a process, <Math>{"G_i = \\sum_{j \\leq i} P_j"}</Math>. It is fixed by arithmetic rather than reported &mdash; a commitment declares the standing accumulator plus its own payment, and any other declaration is refused &mdash; so a seller&rsquo;s bond base is determined jointly by the process&rsquo;s history and the payment the two parties signed. The first commit opens the process, where <Math>{"G = P"}</Math> and the two bonds coincide; every later commit raises the accumulator by its own payment and bonds its seller against the whole of it.
                </PaperRun>
                <PaperRun title="Resolve &mdash; buyer dominance with atomic resolution.">
                    Only the process&rsquo;s buyer may resolve, and resolution is atomic: every active order settles at once or none does. It pays each seller its bond back plus its payment, <Math>{"2G_i + P_i"}</Math>, and returns to the buyer its locked <Math>{"2P_i"}</Math> less that payment. It is the only terminal move: an unresolved process stays open indefinitely, with no clock, no timeout, and no operation that releases a bonded position any other way. Resolution is the buyer&rsquo;s acceptance and nothing else &mdash; the mechanism holds no test of performance, admits no report of delivery, and offers no party a way to certify performance to it.
                </PaperRun>
                <PaperRun title="How the two compose.">
                    After performance, resolving is unconditionally strictly better for the buyer: it holds what it bought whichever it does, so the comparison is its bond returned less the payment against its bond left locked, and nothing about the seller enters it. Given that, performance is each seller&rsquo;s strict best response &mdash; performing earns <Math>{"+P_i"}</Math>, while holding out leaves it standing in <Math>{"2G_i"}</Math> against what it kept. The two calls compose in that order, and the deterrence is computed with the retention credited: a provider that holds what is in its hands is credited that value at the figure the parties themselves signed, at most <Math>{"G_i"}</Math>, and still stands at best at <Math>{"-G_i"}</Math> against the payment it declined. That is what the doubling is for &mdash; a bond equal to the value at the link would be exactly offset by what the defector keeps. The deterrent is mutual assured destruction with that content, and nothing ever executes it: no operation consumes a bond, so the standoff ends in performance and acceptance rather than in loss.
                </PaperRun>
                <PaperRun title="The boundary the mechanism runs against.">
                    Value, performance, and the parties&rsquo; knowledge of both pass off-chain. What the mechanism holds is the bonds, the signed accumulator, and the record of what was committed to; the record shows commitments made and whether a process closed, never that an aircraft departed or a meal was loaded. What the bonds price is accordingly settlement discipline, not performance measurement. An honest disagreement about whether a service met the agreement is settled between the parties while the process stands open &mdash; a remedy agreed, and the passenger resolving once satisfied. The concrete remedy is arithmetic: a provider that cannot perform sends the passenger the payment it stands to receive, so that at resolution it takes back its bond and nets nothing from the failure, and the passenger is whole. Where the parties cannot reach that themselves, an external forum can be shown the record for what was undertaken and the parties&rsquo; own evidence for what happened; it rules while the process is open and it cannot resolve the process, resolution being the passenger&rsquo;s alone. That absence of direct enforcement is precisely why composing a forum leaves the equilibrium untouched. Resolution is terminal acceptance: once the passenger resolves, the process is settled and the mechanism holds nothing further for anyone to recover.
                </PaperRun>
                <PaperRun title="What atomicity does to the cohort.">
                    Because nobody is paid until the buyer resolves, each seller&rsquo;s position is exposed to every other&rsquo;s conduct. For a seller that has already performed, the difference between universal performance with resolution and a process left open by some other seller&rsquo;s failure is <Math>{"P_i + 2G_i"}</Math> &mdash; the payment forgone plus the whole bond it stands in, having parted with what it had. For a seller that has not yet performed, the same figure has a floor of <Math>{"P_i + G_i"}</Math>, since it still holds what is in its hands. Either figure is computable from the accumulator alone, with no communication, no repeated interaction, and no information about the other party. This reproduces the coordination-pressure component of the peer-enforcement equilibrium analyzed in the joint-liability lending literature (Ghatak, 1999; Stiglitz, 1990) and only that component: the peer-selection and peer-monitoring results of that literature are not reproduced here, and nothing below assumes them.
                </PaperRun>
                <PaperRun title="Where the operating outlay sits.">
                    A reader from this domain will object at once that fuel burn, crew duty hours, gate time, and catering stock are consumed the moment a provider performs, and will want to know where they enter the equilibrium. They do not enter it. The payoffs are the transfers the mechanism executes &mdash; the bonds it pulls at commit and what it pays out at resolution &mdash; together with the off-chain value a party ends up holding, so the provider&rsquo;s decision node carries no cost term. What a provider consumes to perform is the operating outlay of the asset behind the wallet: the aircraft wallet, the crew wallet, and the fuel-supplier wallet of Section 3 each take payments in and send payments out, and both sides of that ledger belong to the asset rather than to the mechanism. The mechanism asks one thing of a provider &mdash; that the wallet hold enough to bond the commitment it is signing &mdash; and an asset whose balances no longer cover its bonds stops quoting, which is how an asset leaves a market rather than anything the mechanism does to it.
                </PaperRun>
                <PaperRun title="What this buys a cross-border service.">
                    Settlement is the release of locked balances on the mechanism&rsquo;s own terms, executed by no court and dependent on no party&rsquo;s home jurisdiction. The substantive agreement remains binding under whatever law the parties name for it, and disputes about that agreement go where the parties send them; what the mechanism supplies is that the money at stake moves by the buyer&rsquo;s acceptance rather than by an enforcement action, in a service whose providers routinely sit in a dozen legal systems at once.
                </PaperRun>
            </PaperSection>

            <PaperSection title="3. The Bonded Architecture Applied to Air Service">
                <p>
                    The substantive contribution of the bonded primitive to air-service coordination operates at the edge of the bonded process, not at any particular position within it. Two architectural properties supply the contribution.
                </p>
                <PaperRun title="Asymmetric bonding within a single process.">
                    Every order in a process has the same buyer. The passenger wallet commits directly to each provider wallet: the first commit creates the process under the passenger&rsquo;s address, and every subsequent commit extends the same cumulative-value accumulator <Math>{"G"}</Math> by its own payment. At each commit the passenger posts <Math>{"2P_i"}</Math> for that payment, and the provider posts twice the accumulator as it stands after its own commit. The mechanism sees a linear sequence of commits raising one accumulator; it holds no relation between one provider and another, and needs none, because every order runs to the passenger.
                </PaperRun>
                <PaperRun title="Buyer-initiated atomic resolution.">
                    The passenger resolves, and the entire process settles simultaneously. Every active order is resolved together or none is. The passenger is the only party whose action is required for settlement &mdash; the call is the buyer&rsquo;s own, and no provider countersigns it &mdash; and atomicity guarantees that no subset of orders settles without the rest.
                </PaperRun>
                <PaperRun title="Two consequences for the air-service assembly.">
                    The two properties together produce two consequences.
                </PaperRun>
                <p>
                    First, <em>the resource markets named in Section 1 become directly accessible to the passenger through bonded commerce.</em> Each provider wallet &mdash; the crew-member wallet, the aircraft wallet, the fuel-supplier wallet, the gate-seller wallet, the caterer wallet, the maintenance-provider wallet, the ground-handling wallet &mdash; is a seller bonded into the passenger&rsquo;s process, its payout waiting on the passenger&rsquo;s atomic resolution. There is no intermediate buyer anywhere in the process, and no party sits between the passenger and a provider. We treat one alignment case in detail in Section 4: the crew-allocation arrangement.
                </p>
                <p>
                    Second, <em>the loss from a service slip is carried at the commit where it happened rather than at whichever contract has the loosest liability cap.</em> Every provider&rsquo;s bond is locked across every commit until the passenger resolves, and the provider whose service slipped is the one that must make the passenger willing to accept. Section 4 develops what that produces.
                </p>
                <PaperRun title="The demand side: what the passenger was buying.">
                    The decomposition is not an accounting exercise performed on an airline. It is a description of what the passenger was buying in the first place: progress on a job that arises in a circumstance &mdash; be in the destination city, in a fit state, by a stated hour &mdash; for which crew-hours, airframe-time, fuel, gate slots, catering, a share of the maintenance allocation, and ground handling are the resources actually consumed (Christensen, Hall, Dillon, &amp; Duncan, 2016). The bonded process expresses that description directly: it comes into existence at the first commit, holds exactly the bonded relations the journey needs, and settles at one resolution. What follows for the boundaries of the firm &mdash; whether a durable institution is the efficient way to hold such resources together, and under what conditions &mdash; is an institutional-economics question, and it is outside this paper&rsquo;s subject; the claim made here is only that the resource-market decomposition matches the demand it serves and is expressible as one bonded process.
                </PaperRun>
                <PaperRun title="What the mechanism constrains; what the composition layer carries.">
                    The mechanism constrains the shape of a process through the per-order facts it holds: buyer (which must be the process&rsquo;s buyer in every order), seller, payment, the denomination &mdash; one for the whole process, enforced at every commit &mdash; the cumulative-value snapshot at commit, and the atomic-resolution rule covering the process. The shape of a single process is therefore tightly constrained: one buyer, one or more sellers, one accumulator, one resolution. Compositions across multiple processes &mdash; a provider in process <Math>{"A"}</Math> opening a process <Math>{"B"}</Math> of its own, as its buyer, to coordinate its own sub-suppliers &mdash; are admissible and resolve process by process, never across.
                </PaperRun>
                <p>
                    Above that, the composition layer attaches clauses to specific orders: a schedule clause binds the agreed window for the order it sits on, a modalities clause declares the coordination scenario the process runs, a hand-off clause names where a physical exchange occurs, and a proximity-verification policy commits the detection bands that certify such an exchange when it happens. An assembly specification declares which clauses attach where; the assembly&rsquo;s structure, once specified, is fixed and verifiable against the agreement the parties signed. The argument of this paper applies to whichever resource markets the designer composes under one process.
                </p>
                <PaperRun title="Specialized mechanisms per resource market.">
                    Each resource market admits its own market mechanism: bilateral commits where the parties contract directly, or a resource-specific mechanism the designer composes &mdash; a slot-allocation mechanism for gate-time bidding, a crew-dispatch mechanism that respects type-rating and duty-time constraints, a fuel-pool mechanism for shared ramp-side procurement. Whatever is composed, the structural rule holds across it: every order in the process has the passenger as its buyer, and the process settles at one resolution.
                </PaperRun>
            </PaperSection>

            <PaperSection title="4. Disruption Resolution Under Buyer Dominance">
                <p>
                    We turn to the operational question: when something goes wrong &mdash; a delay, a slip, a service failure &mdash; how is the disruption resolved under the bonded architecture? We treat the primary mechanism first through a bond-posture worked example, develop the crew-allocation case, note the IROps-scale extension, and then place the fallback mechanisms in their proper register downstream.
                </p>
                <PaperSubsection title="4.1 The primary mechanism: cohort compensation under bond pressure">
                    <PaperRun title="A bond-posture worked example.">
                        Consider a stylized domestic short-haul passenger journey totalling $250. The passenger is the buyer of every order, so it commits directly to each provider wallet. The ten commits below are all part of one process. The accumulator <Math>{"G"}</Math> grows monotonically as each commit lands (<Math>{"G \\leftarrow G + P_i"}</Math>); at every commit the buyer posts <Math>{"2P_i"}</Math> and the seller posts twice the accumulator as it then stands.
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
                            Stylized per-commit bond posture for a domestic short-haul passenger journey under one process. <Math>{"G"}</Math> is the cumulative-value accumulator, monotonically growing with each commit. The last seller to commit posts the largest seller bond, <Math>{"2G_{\\text{final}}"}</Math> = 2 &times; $250 = $500. Per-seller payments are illustrative; absolute magnitudes vary with route, aircraft type, and operating context. The two public-authority rows and the two airport-authority rows carry the assumption declared in Section 1 and bounded in Section 7.
                        </p>
                    </div>
                    <p>
                        <em>The asymmetry between the two sides.</em> The passenger&rsquo;s aggregate locked position is $500, which is twice the ticket &mdash; the standard buyer posture, and the whole of it. The provider cohort&rsquo;s aggregate is $3,512, more than seven times the passenger&rsquo;s, because each provider bonds against the accumulator as it stands at its own commit and every payment before it is inside that figure. This is not an accident of the example; it is asymmetric bonding in operation. Held at fixed per-commit payments, the cohort&rsquo;s aggregate grows quadratically in the number of commits while the passenger&rsquo;s grows linearly: <Math>{"n"}</Math> commits of equal payment <Math>{"p"}</Math> put the cohort at <Math>{"p\\,n(n+1)"}</Math> against the passenger&rsquo;s <Math>{"2pn"}</Math>, a ratio of <Math>{"(n+1)/2"}</Math> that rises with every market the assembly adds. The qualifier is load-bearing: split a <em>fixed</em> ticket into <Math>{"n"}</Math> equal commits instead and the cohort aggregate is <Math>{"P_{\\text{ticket}}(n+1)"}</Math>, still rising with each market added but linearly rather than quadratically. A process the passenger has not resolved holds that whole pool locked.
                    </p>
                    <ProcessTopologyFigure
                        idPrefix="air-service-process-topology"
                        legs={[
                            { name: "Aircraft wallet", payment: 65 },
                            { name: "Fuel supplier", payment: 45 },
                            { name: "Crew member", payment: 40 },
                            { name: "Maintenance provider", payment: 15 },
                            { name: "Catering", payment: 5 },
                            { name: "Ground handling", payment: 15 },
                            { name: "Origin airport authority", payment: 20 },
                            { name: "Destination airport authority", payment: 20 },
                            { name: "Security screening", payment: 6 },
                            { name: "Federal aviation system", payment: 19 },
                        ]}
                        buyerLabel="Passenger"
                        unit="$"
                        figureTitle="One process, ten bilateral edges, one root buyer"
                        figureDesc={
                            "The passenger is the buyer of all ten orders in the journey process. " +
                            "Each order is an independent bilateral edge between the passenger and one " +
                            "provider wallet; no edge joins one provider to another. The orders are " +
                            "ordered by commit, and the accumulator G grows monotonically from $65 at " +
                            "the aircraft commit to $250 at the last, so each provider's bond of twice G " +
                            "rises along the sequence from $130 to $500. The passenger's own bonds total " +
                            "$500, twice the ticket; the ten providers together lock $3,512."
                        }
                        caption={
                            <>
                                The same schedule read as shape rather than as arithmetic. Ten separately
                                bonded edges, every one of them to the passenger, with no edge between
                                providers &mdash; and a monotone accumulator that makes the last commit
                                the largest bond whatever the sequence.
                            </>
                        }
                    />
                    <p>
                        The cohort aggregate depends on the commit <em>order</em>, not only on the set of payments. Summing the schedule gives <Math>{"2\\sum_j (n - j + 1)\\,P_j"}</Math>: a payment made at position <Math>{"j"}</Math> is inside the bond base of its own commit and of every commit after it, so early payments are counted many times and late ones once. Permuting the order therefore changes the total whenever the permutation moves payments of different size between positions &mdash; swapping the two $20 authority commits leaves it exactly where it was, while committing the $19 federal-aviation-system payment first and shifting the other nine one place later gives $3,392 rather than $3,512, a $120 difference from a reordering that changes nothing else. What the order does <em>not</em> change is the end state: <Math>{"G_{\\text{final}}"}</Math> is the ticket total whatever the sequence, so the last provider to commit always bonds $500, and the passenger&rsquo;s aggregate is twice the ticket regardless. An assembly designer choosing a commit sequence is therefore choosing both how large the cohort&rsquo;s aggregate posture is and how it is distributed across the providers; what no sequence changes is the last bond, the accumulator it stands against, or the passenger&rsquo;s side.
                    </p>
                    <PaperRun title="Non-resolution is not a penalty; it is the position everyone is already in.">
                        The passenger holds the only authority to resolve, and until it does, every provider&rsquo;s bond stays locked and no payment moves. It is worth being exact about what that is and is not. It is not a remedy: withholding pays the passenger nothing, its own <Math>{"2P_i"}</Math> being locked alongside the providers&rsquo;. It is not a sanction the passenger administers, since nothing is consumed, destroyed, or transferred by the waiting &mdash; the mechanism has no operation that takes a bond from anyone. It is simply that the process has not been accepted, and each provider stands where its commit put it: its payment unearned and its bond unreleased, with the value at its own link the only thing it holds against it. That standing position is what makes compensation the cohort&rsquo;s own business rather than a courtesy extended to the passenger.
                    </PaperRun>
                    <PaperRun title="Providers determine and pay compensation themselves.">
                        When operational disruption leaves the passenger worse off than the agreement contemplated, each provider faces the arithmetic of Section 2: a provider that has performed is out <Math>{"P_i + 2G_i"}</Math> relative to a settled process, and one that has not yet performed is out at least <Math>{"P_i + G_i"}</Math>. Both figures dwarf a proportionate contribution to making the passenger willing to accept. The route those figures open runs as follows.
                    </PaperRun>
                    <p>
                        Providers approach the passenger with compensation offers. Compensation takes whatever form the passenger accepts: a cash transfer, a future service credit, accommodation or meal vouchers, alternative routing, or the failing provider returning the payment it stands to receive so that it nets nothing from the failure. The denomination of any such transfer is the parties&rsquo; business; the mechanism does not constrain it, and none of it passes through the mechanism at all.
                    </p>
                    <p>
                        The providers negotiate among themselves over who bears what fraction. The unit whose performance materially failed bears more. Parties around the failure who could not have prevented it &mdash; the caterer with no role in a fuel slip, the gate seller whose service was unaffected &mdash; contribute less or nothing. The negotiation is real but routine: each provider knows its own bond, its payout under a settled process, and what it is willing to pay rather than stand where it is standing.
                    </p>
                    <p>
                        The passenger accepts what satisfies it and resolves. Bonds release across the process; each provider takes back <Math>{"2G_i + P_i"}</Math>, less whatever it paid in compensation; the passenger recovers its locked position less the payments it agreed to make, and holds the compensation already paid. The settlement is bilateral and direct.
                    </p>
                    <p>
                        That route runs at the operational boundary &mdash; the gate, the destination service desk, the runtime surface the assembly&rsquo;s designer provides &mdash; rather than in a filing six months later, and it stands open before insurance claims, before dispute forums, before regulatory engagement, because that is where the bonded positions point. Whether a given cohort takes it, and how quickly, is conduct the bonds do not decide; what they supply is each party&rsquo;s own reason to take it.
                    </p>
                    <PaperRun title="Why the pressure does not depend on the provider&rsquo;s market position.">
                        The incentive above arises from a provider&rsquo;s own locked position and its own forgone payment, not from any alternative the passenger might turn to. It is therefore the same at a competitively supplied edge and at an edge whose provider has no substitute: the near-monopolist airport authority that has bonded into this process stands in the same unreleased bond as the caterer. What a provider&rsquo;s market position does constrain is what happens <em>before</em> the commit &mdash; the passenger&rsquo;s ability to source the resource elsewhere, and therefore the terms it can obtain &mdash; and that constraint is stated as a scope condition in Section 7. The two are different moments and should not be read against each other.
                    </PaperRun>
                    <PaperRun title="The crew-allocation case.">
                        The mechanism is concrete in the crew market. Crew allocation operates as a direct market between the passenger and the crew member. The crew member&rsquo;s wallet &mdash; whose certification and operating-permit credentials the assembly&rsquo;s credential clauses bind at agreement signing, verifiable by any reader against the issuing authority&rsquo;s own register &mdash; bonds into the passenger&rsquo;s process at the crew edge. Its payout waits on the passenger&rsquo;s resolution at destination, so its interest and the passenger&rsquo;s coincide through the bonded edge itself. The allocation discipline is whichever the assembly designer composes for the crew market: a bilateral commit, or a crew-specific mechanism that respects type-rating and duty-time constraints. Collective-bargaining institutions over wage rates, duty-time protections, and seniority remain what they are; they are labor-market institutions the settlement mechanism does not touch.
                    </PaperRun>
                    <p>
                        Under disruption &mdash; say a crew member cannot fly &mdash; the crew edge is locked alongside every other edge in the process. The crew member deals with the passenger directly: find a substitute at speed, accommodate the passenger on the next departure, return the payment for the leg, or whatever else the passenger will accept. Resolution follows the remedy. There is no intermediary in that negotiation, and the architecture does not contemplate one.
                    </p>
                    <PaperRun title="IROps-scale coordination.">
                        The single-flight example understates the operational complexity of large-scale irregular operations (IROps). A hub disruption produces simultaneous bonded processes across hundreds of flights, with thousands of bonded edges across the resource-market mesh. The compensation negotiation at that scale is operationally heavier than the per-flight case: each affected passenger holds a separate process with its own provider cohort, and many provider wallets appear in many processes at once. The bonded architecture does not eliminate that coordination cost. It routes it differently: each affected passenger faces a busy but directly reachable cohort negotiating that passenger&rsquo;s compensation, rather than a queue behind a single counterparty&rsquo;s discretion.
                    </PaperRun>
                    <PaperRun title="The weakest-link character of the pressure.">
                        Atomic resolution makes the providers&rsquo; payouts wait on one another, which is the structure of a weakest-link game: one unremedied failure leaves every position in the process open, and each provider holds a figure it can read off the accumulator for what that costs it. What this produces is the interest that makes a cohort dynamic rational rather than altruistic &mdash; providers pressing the failing party, covering part of its compensation, arranging a substitution &mdash; and it is the coordination-pressure component of the peer-enforcement equilibrium of joint-liability lending, obtained here with no repeated interaction, no local information among the providers, and no social substrate at all. It is the component and not the literature&rsquo;s other results: nothing here reproduces peer selection or peer monitoring, and nothing here needs them. What the mechanism establishes is the interest and its magnitude; how a cohort acts on that interest is conduct the mechanism does not describe and does not need to.
                    </PaperRun>
                    <PaperRun title="Why this is structural, not procedural.">
                        The interest is not a courtesy providers may or may not extend. A provider that stays out of the compensation negotiation watches its own bond stay locked alongside everyone else&rsquo;s, for as long as the passenger is unsatisfied, with no event that improves its position and no clock that ends it. That standing exposure follows from the bond posture under atomic resolution, and it is present in every process composed this way without anyone agreeing to it in advance; what a cohort does with it stays the cohort&rsquo;s own.
                    </PaperRun>
                </PaperSubsection>
                <PaperSubsection title="4.2 Fallback mechanisms">
                    <p>
                        The primary mechanism is where the bonded positions point disruption first: into the cohort, settled directly. Fallback mechanisms engage where it does not settle there, or where the disruption involves a class of issue it cannot address. We list them in the order of operational engagement.
                    </p>
                    <p>
                        <em>Specialized mechanisms composed into the assembly.</em> Where the designer composes a delay-compensation mechanism that disburses pre-agreed amounts under specified conditions, it complements the primary mechanism by making certain compensation patterns automatic rather than negotiated. It sits beside the bonded process and never on the path by which bonds are released.
                    </p>
                    <p>
                        <em>Dispute forums.</em> The agreement named in the bonded commitment may name a forum &mdash; an arbitration center, an online dispute-resolution platform, a Schelling-point juror system &mdash; and where none is named, whichever forum would have heard the parties anyway remains available. A forum engages when cohort compensation does not settle the matter, typically because the dispute is substantive in a way bond posture cannot address (duress, mistake, frustration, illegality, public-policy concerns). It rules while the process stands open, on the record for what was undertaken and on the parties&rsquo; own evidence for what happened, and it cannot resolve the process in the passenger&rsquo;s place. Its ruling reaches the parties as rulings ordinarily do, through their exposure outside the process, and it feeds the remedy the passenger will accept.
                    </p>
                    <p>
                        <em>Insurance compositions.</em> A passenger or provider wanting cover against risks the bonded positions cannot absorb (catastrophic events, multi-day weather disruption, force majeure) composes a parallel bonded process with an insurer. The insurer&rsquo;s own bond stands behind its undertaking, and its settlement is its own bonded event; the composition changes nothing inside the original process.
                    </p>
                    <p>
                        <em>Regulators.</em> Aviation safety regulators, consumer-protection authorities, competition enforcement, and labor-protection regimes operate alongside the bonded architecture and engage in the matters their authority covers. The architecture does not displace them.
                    </p>
                    <p>
                        The conventional regime&rsquo;s cascading-delay pathology &mdash; loss absorbed by whichever contract has the loosest liability cap, with limited unit-level operational signal (Lan, Clarke, &amp; Barnhart, 2006) &mdash; reduces under the bonded architecture as a consequence of bond posture and atomic resolution, and the reduction is a by-product of the coordination design rather than the thing it was built for.
                    </p>
                </PaperSubsection>
            </PaperSection>

            <PaperSection title="5. Clauses">
                <p>
                    The assembly draws almost entirely on clause infrastructure that already exists. Two pieces have to be authored: a schedule sister-pair binding the journey to its scheduled departure and arrival, and a flight-phase event log for the operating provider. Both are generic across vehicle types &mdash; the same primitives serve aircraft, ships, trucks, and other scheduled vehicles, with per-vehicle personalization in the clause content (designator format, the authority issuing a credential, tolerance windows). The air-service treatment below is one personalization of those primitives, not a domain-specific architecture.
                </p>
                <PaperRun title="What the existing clauses already carry.">
                    The commerce clause carries the payment and the itemized line items of every commitment in the assembly &mdash; the passenger ticket and each resource commitment. The denomination is not there either, and it is not a per-order matter: it is a separate clause scoped to the <em>assembly</em>, composed once when the design is authored, naming the one token every process of that design bonds and settles in. The pin is folded into every agreement at checkout, so each party signs the denomination it is committing under; the mechanism independently enforces a single denomination across every order in a process, whether or not the design pinned one. The schedule clause already binds an agreed window &mdash; a single interval <Math>{"[\\text{start}, \\text{end})"}</Math> that expresses an appointment, a booked timeslot, or a rental period equally &mdash; and it binds it per order, so each resource commitment carries the window its own service occupies. The modalities clause declares which coordination scenario the process runs; the hand-off clause names where a physical exchange occurs between parties, and the proximity-verification policy commits the detection bands accepted for certifying that exchange when it happens. An arbitration clause carries a forum selection and an applicable-law clause the governing law, for the international flights where the parties want both named. The geolocation clause carries origin and destination as locality codes under a declared geocode standard &mdash; a cell-grid encoding or a jurisdiction code, whichever the assembly declares. The axis is open: any standard, existing or future, and whatever encoding a given client offers by default is only a default. The emissions clause is available where the assembly wants a reporting methodology committed with the ticket. The credential clauses that qualify each provider to participate &mdash; the crew certification, the airworthiness certificate, the maintenance provider&rsquo;s authorization &mdash; are composed by the assembly designer and anchored to the issuing authority&rsquo;s own public register, so any reader can check a declared credential against the authority that issued it. The mechanism enforces none of them; they bind at agreement signing.
                </PaperRun>
                <PaperRun title="The schedule sister-pair.">
                    What the schedule clause does not carry is the identity of the scheduled service, the airports at either end, and the slip the parties agree to tolerate. A sister pair supplies them: a scheduled-departure clause and a scheduled-arrival clause. Splitting departure from arrival follows the sister-clause pattern already used in the registered set, where several specialized variants of one coordination concept share a content shape and differ by identity: each event is attested separately, with content shaped to what the parties expect at that end of the journey.
                </PaperRun>
                <p>
                    The scheduled-departure clause carries the flight designator, the origin airport, optionally the aircraft type (omitted where the parties reserve substitution rights), and the agreed departure tolerance &mdash; the slip below which the parties treat the departure as on schedule, say a fifteen-minute window. The scheduled-arrival clause mirrors it at the destination end: the same designator, the destination airport, the optional aircraft type, and an arrival tolerance. The scheduled times themselves are the agreed window the schedule clause already binds on the order; the shared designator is what lets an arrival be matched to its departure inside the process.
                </p>
                <p>
                    We deliberately impose no maximum on either tolerance. Scheduled-service operations vary widely in what tolerance is operationally meaningful, and a hard maximum would foreclose legitimate use. The contracting parties choose the tolerance their operation supports; where a domain-specific maximum is later wanted, a stricter sibling supplies it without disturbing the pair.
                </p>
                <PaperRun title="The flight-phase event log.">
                    The registered set carries per-role event logs &mdash; one for a merchant&rsquo;s role in an order, one for a courier&rsquo;s &mdash; each a sovereign log whose event vocabulary is a closed set fitted to that role&rsquo;s flow. Neither vocabulary fits a flight: a courier&rsquo;s log runs from en-route-to-pickup through in-transit to completed, and reading &ldquo;pushback&rdquo; or &ldquo;cabin ready&rdquo; into those labels would commit a courier&rsquo;s vocabulary to a flight&rsquo;s phases and leave every reader to guess the mapping. The flight-phase log is therefore a new sibling in the same family, authored and registered like any other: its own identity, the same content shape, its own closed vocabulary for the phases the parties want attested (boarding initiated, cabin ready, pushback, takeoff, arrival, or whichever projection the designer settles on). It is a candidate composition, not a registered clause, and it is authored the way any other is.
                </PaperRun>
                <PaperRun title="Clauses the architecture deliberately does not include.">
                    Three classes of clause are conspicuously absent. First, there is no force-majeure clause releasing a party from its bonded position in a weather event. Force majeure is a composition concern, not a settlement concern: a party wanting cover against weather-driven delay composes a parallel insurance process, and the mechanism neither knows about weather nor adjudicates whether an event qualifies. A clause that released a bond on any other terms than the passenger&rsquo;s resolution would be an exit from the bonded state, and the equilibrium of Section 2 is derived for a mechanism that has none. Second, there is no clause scoring which delays count against whom; the departure and arrival tolerances are the only such criteria the commitment carries, and any further refinement is for the parties, or for the forum they bring a dispute to. Third, there is no clause granting any party a unilateral reschedule right; a reschedule is a new commitment, signed by both parties like any other, not a mutation of an existing binding.
                </PaperRun>
            </PaperSection>

            <PaperSection title="6. Comparison with the Conventional Apparatus">
                <p>The architectural change should be located precisely against the existing apparatus, to be clear about what does and does not change.</p>
                <PaperRun title="What changes.">
                    The architecture changes the cost-flow path. Under the contract-of-carriage regime, a passenger&rsquo;s schedule loss is bounded by per-incident caps and by the counterparty&rsquo;s discretion in issuing voucher compensation; a sub-supplier&rsquo;s liability for its own slip is bounded by its per-incident contractual penalty; and the residual is absorbed by whichever contract has the loosest cap. Under the bonded architecture every provider is a direct seller under the passenger as buyer &mdash; there is no tier of sub-suppliers &mdash; and the loss is carried at the commit where the service slipped, by the provider whose bond stands there. On satisfactory delivery the passenger&rsquo;s position unwinds exactly as it was agreed to: it locked <Math>{"2P_i"}</Math> at each commit and takes <Math>{"P_i"}</Math> of that back at resolution, the other half being the payment itself, which goes to the provider. Nothing is retained from either side; the passenger ends having paid the ticket for the journey, which is what it signed for.
                </PaperRun>
                <PaperRun title="Where scarcity remains.">
                    Decomposing the journey into its resource markets makes visible which inputs are scarce and which are commodity. The aircraft is largely a commodity input &mdash; leased, fungible, available to any operator on similar terms. The scarce, hard-to-replicate inputs are the slots at congested hubs and the brand: a slot commands what scarcity commands whether or not any one party aggregates it, and a name that passengers seek out is scarce in the same way and stays with whichever wallet or published composition carries it. Decomposition does not dissolve either. What it does is return each contributor&rsquo;s margin to the contributor: every value-adder prices its own edge in its own market and bonds against it, and a bonded process has no take-rate seat for an intermediary to occupy, because no party sits between the passenger and the value-adders.
                </PaperRun>
                <PaperRun title="What does not change.">
                    Safety regulation is unchanged: the FAA in the US, EASA in the EU, and analogous national civil-aviation authorities continue to certify aircraft, license pilots, approve maintenance procedures, and set operational standards. Crew-labor protections are unchanged: collective bargaining and flight-time / duty-time limits &mdash; for flightcrew under 14 CFR Part 117 in the US, for flight attendants under Part 121, with analogous regimes elsewhere &mdash; apply to the crew edge under the bonded architecture exactly as they do under the conventional regime. Insurance and reinsurance are unchanged in their underlying function; what changes is the risk profile the market prices (a smaller residual after the bonded positions have done their work, concentrated exposure at whichever edges carry the largest bond, and a new class of exposure at every provider wallet whose position stays locked while a process is open), not the function itself. Competition law is unchanged: provider markets remain subject to anti-collusion enforcement, slot allocation at congested airports remains governed by the relevant authorities, and cooperative service arrangements remain subject to the applicable regimes.
                </PaperRun>
                <PaperRun title="Regulatory roles attached to wallets.">
                    Some regulatory functions attach to a single designated holder. The FAA issues the air-carrier certificate under 14 CFR Part 119, with many safety obligations attaching to the certificate holder, and other jurisdictions have analogous regimes. Under the bonded architecture the certificate holder is one of the wallets in the assembly &mdash; typically the aircraft wallet, or a wallet associated with the aircraft&rsquo;s operating credentials &mdash; and the function is preserved: the certificate holder participates as one bonded counterparty among others rather than as a cross-market coordinator. Discovery surfaces, quality-signal aggregators, and multi-process curators may be useful around the process; none can re-emerge as a coordinator inside it, because every order in the process has the passenger as its buyer and no other party can hold that position.
                </PaperRun>
                <PaperRun title="What this is not.">
                    This is a re-architecture of the cost-flow path in air-service coordination. Whether any particular provider operates well or poorly within it is an operational-management question the architecture is silent on. Nor is it a passenger-protection regime: it is a coordination mechanism whose side effect is that schedule loss is carried where it arose. Passenger-protection regimes &mdash; the EU&rsquo;s Regulation 261/2004, the US Department of Transportation&rsquo;s rules on cancellations and delays, and analogous regimes elsewhere &mdash; continue to operate in their own register and apply to the regulated party in the relevant jurisdiction. The passenger-side benefit here is structural, not regulatory.
                </PaperRun>
            </PaperSection>

            <PaperSection title="7. Scope">
                <p>The argument bounds itself by several scope conditions.</p>
                <PaperRun title="The public-authority wallets are the paper&rsquo;s thought experiment.">
                    Section 1 declared it and the worked example carries it: a security checkpoint, an airport authority, or an air-traffic service treated as a wallet bonding into a passenger&rsquo;s process and sharing in the compensation that process produces. No such wallet exists, and whether public authorities would participate on those terms is an institutional question this paper does not resolve &mdash; it turns on appropriation rules, sovereign-immunity doctrine, and public-finance practice, none of which a settlement mechanism speaks to. The architecture admits the assumption structurally, which is why we carry it: it shows what the mechanism makes expressible at its edge. Nothing else in the paper depends on it. Delete the four authority rows from the worked example and the figures shrink, but the bond schedule, the order-dependence of the cohort aggregate, the compensation arithmetic, and the clause requirements read exactly the same over the commercial providers that remain.
                </PaperRun>
                <PaperRun title="Asset specificity constrains procurement, not the compensation pressure.">
                    The architecture works best on the procurement side where providers compete with available alternatives. Where a provider is a near-monopolist &mdash; an airport authority for gate operations at a congested hub, air-traffic services by regulatory construction &mdash; the passenger has no substitute to turn to and the terms it can obtain reflect that. This is a constraint on what happens before the commit. Once a provider has bonded, its position in the process is the same as any other&rsquo;s, and so is the compensation arithmetic of Section 4, which reads off its own bond rather than off the market it sells into. The architecture is accordingly most effective, on the procurement side, in the low-specificity region of the resource portfolio and least effective at the high-specificity end.
                </PaperRun>
                <PaperRun title="Bond-denomination access.">
                    The architecture presumes every party can post its bond in the one denomination the process runs in. For some providers &mdash; a small catering contractor in a jurisdiction with thin access to that denomination &mdash; this may bind operationally. The constraint is real and is a treasury and on-ramp problem rather than a mechanism problem: the conversion happens before the commit, outside the process.
                </PaperRun>
                <PaperRun title="Bond posture at a high-volume provider.">
                    A provider covering thousands of flights a day posts a bond against each active commitment, so its aggregate posture scales with the count of processes open at once. This is the honest price of operating at that volume, not a liquidity burden to be financed away: each bond is the coordination instrument for the commitment it stands behind, sized by the value it secures and held for exactly the span that commitment is open. Bonds are deposited as processes commit and returned as they resolve, so the standing posture at any moment is bounded by the active-process count multiplied by the per-process bond &mdash; a deterrent held ready across the provider&rsquo;s open book, not capital seeking a return while it waits.
                </PaperRun>
                <PaperRun title="Composability with the conventional regime.">
                    The architecture composes with the conventional regime rather than requiring its replacement: a provider can serve some passengers under bonded processes and others under contracts of carriage, and a supplier can serve some counterparties under bonded commitments and others under conventional ones.
                </PaperRun>
            </PaperSection>

            <PaperSection title="8. Conclusion">
                <p>
                    Air service is a coordination problem across resource markets. Each provider is a wallet standing for a real-world asset: earnings held as balances, credentials declared against it and checkable at their source, a signing key an operator holds on the asset&rsquo;s behalf. The bonded primitive coordinates across those wallets with no coordinating party. Each commit binds a bilateral edge under asymmetric bonding &mdash; the passenger twice the payment, the provider twice the value the process has accumulated through its own link &mdash; and the two calls compose in a definite order: after performance, resolving is unconditionally better for the passenger, and only because that is settled is performance each provider&rsquo;s strict best response. Atomic resolution then makes every payout wait on every performance, which is what turns a set of separately secured edges into a cohort with a common interest in the process closing.
                </p>
                <p>
                    What that produces operationally is the paper&rsquo;s substantive claim: when something goes wrong, the parties who can fix it are the ones standing in unreleased bonds, they can compute what the failure costs them, and they can reach the passenger directly. The route compensation can take accordingly runs inside the cohort, before insurance, before forums, before regulators, and every party on it holds its own bonded reason to take it; whether a given cohort does is conduct the bonds do not decide. Any reduction in cascading-delay loss rides on the same bond posture, as a by-product rather than as the aim. The architecture composes with existing safety regulation, crew-labor protections, insurance markets, and competition regimes; it changes the cost-flow path without displacing the regulatory and contractual layers around it. What the paper supplies is the assembly &mdash; the configuration of bonded commits, the credential clauses, the schedule sister-pair, the flight-phase log, and the disruption-resolution mechanism &mdash; that turns a general settlement primitive into a working air-service coordination architecture, together with an honest statement of the one assumption in it that no mechanism can discharge.
                </p>
            </PaperSection>
        </PaperLayout>
    );
}
