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
        "A journey read as coordination across resource markets — crew, aircraft, fuel, landing slots, catering, maintenance, ground handling — each provider a wallet bonded directly to the passenger in one process. Because only the passenger resolves, and resolution is atomic, every provider's payment and bond wait on every other provider's performance, so the providers hold their own reason to compensate the passenger directly. A ten-order worked example: the passenger bonds $500, the providers $3,512.",
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
                        A domestic short-haul journey draws on seven resource markets at least: crew-hours, aircraft-time, jet fuel, landing slots, catering, maintenance hours and ground handling. We read each provider as a wallet, the on-chain address of a real-world asset, bonded directly to the passenger in one process. The passenger is the buyer of every order. At each commit it bonds twice the payment, and the provider bonds twice the value the process has accumulated through its order. Only the passenger resolves, and resolution pays every provider and refunds every bond at once.
                    </p>
                    <p>
                        Atomic resolution puts each provider&rsquo;s payment and bond behind every other provider&rsquo;s performance. A provider that has performed forgoes its payment, and its bond of twice the accumulated value stays locked, while another&rsquo;s failure holds the process open. The provider cohort therefore holds its own reason to compensate the passenger directly, before a forum, an insurer or a regulator engages. In a stylized ten-order journey of $250 the passenger bonds $500 and the providers $3,512, and the providers&rsquo; total depends on the order of commits. Public services enter as wallets too, as a declared thought experiment on which no result depends.
                    </p>
                </>
            }
            references={
                <>
                    <li>Airports Council International, International Air Transport Association, &amp; Worldwide Airport Coordinators Group. <em>Worldwide Airport Slot Guidelines (WASG)</em>, Edition 4, effective 1 August 2025. Montreal and Geneva, 2025.</li>
                    <li>Christensen, C. M., Hall, T., Dillon, K., &amp; Duncan, D. S. Know Your Customers&rsquo; &ldquo;Jobs to Be Done&rdquo;. <em>Harvard Business Review</em>, September 2016.</li>
                    <li>Council of the European Communities. Regulation (EEC) No 95/93 of 18 January 1993 on common rules for the allocation of slots at Community airports. <em>Official Journal</em>, L 14, 22 January 1993, pp. 1&ndash;6.</li>
                    <li>European Parliament and Council. Regulation (EC) No 261/2004 of 11 February 2004 establishing common rules on compensation and assistance to passengers in the event of denied boarding and of cancellation or long delay of flights, and repealing Regulation (EEC) No 295/91. <em>Official Journal</em>, L 46, 17 February 2004, pp. 1&ndash;8.</li>
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
                    Consider a passenger who buys a $250 seat on a domestic short-haul flight. The seat is the joint output of a flight crew, an aircraft, a quantity of jet fuel, landing slots at both ends, per-passenger catering, a share of the airframe&rsquo;s maintenance and ground handling for boarding and baggage. Each input already has units in industry use: crew-hours, type ratings, fuel volume, time slots at the gate, meal counts, maintenance hours, baggage counts. Public services are inputs as well: air-traffic services, security screening and the airport authorities at either end. We read the journey as coordination across these resource markets, and we ask what follows when each provider bonds directly to the passenger.
                </p>
                <p>
                    We treat the public services as providers on the same footing as the commercial ones, and we say at the outset what that is: a declared thought experiment. No public authority holds a wallet in a passenger&rsquo;s process. The assumption lets the whole journey be read in one register. Section 7 bounds it, and every result below holds over the commercial providers alone.
                </p>
                <p>
                    Each provider participates in three layers. The <em>asset</em> is the off-chain thing whose participation produces the value: the airframe that flies, the pilot&rsquo;s labor, the screening service. The <em>wallet</em> is the asset&rsquo;s on-chain address; it holds the asset&rsquo;s earnings as token balances and signs the asset&rsquo;s commitments. The credentials a role requires, such as a flight-crew certificate or an airworthiness certificate, are declared in the agreements the wallet signs. Any reader can check a declaration against the register of the authority that issued it. Nothing gates the signing, and a false or lapsed declaration is a failure to be what one said one was, standing behind the same bond as any other failure. The <em>operator</em> is the person or autonomous program that holds the wallet&rsquo;s signing key on the asset&rsquo;s behalf, and the mechanism sees only the wallet.
                </p>
                <p>
                    A wallet is an active counterparty while its asset can perform and its credentials are current, a condition its operator keeps. Participation is the asset&rsquo;s own economics: receipts from resolved processes must cover what the asset costs to run, or the operator stops bonding the wallet into processes. At this level a regulated price and a market price are the same object. Each is a payment to a wallet whose asset has to be paid for.
                </p>
                <PaperRun title="Paper organization.">
                    Section 2 states the mechanism and its equilibrium. Section 3 applies it to a journey and states what the designer composes above it. Section 4 treats disruption: a worked bond schedule, the compensation route the bonds open and the fallbacks behind it. Section 5 lists the clauses a journey&rsquo;s agreements compose. Section 6 compares the architecture with the conventional apparatus, Section 7 states the scope conditions and Section 8 concludes.
                </PaperRun>
            </PaperSection>

            <PaperSection title="2. The Mechanism">
                <p>
                    The Core is the set of contracts that holds the bonds and executes two calls, commit and resolve. Each call carries a mechanism of its own, and the two compose. A <em>process</em> is a sequence of orders under one buyer, resolved together; an <em>order</em> is one buyer&ndash;seller commitment inside it. This section states the two calls and their equilibrium at the depth the air-service argument uses, and nothing in the air-service reading modifies them.
                </p>
                <PaperRun title="Commit &mdash; asymmetric bonding.">
                    A commitment is signed by both parties and names a payment <Math>{"P > 0"}</Math> and a cumulative value <Math>{"G"}</Math>. The buyer locks <Math>{"2P"}</Math> and the seller locks <Math>{"2G"}</Math>. The base is the value the process has accumulated <em>through the seller&rsquo;s own order, its own payment included</em>: for the <Math>{"i"}</Math>-th commit, <Math>{"G_i = \\sum_{j \\leq i} P_j"}</Math>. The base is fixed by arithmetic rather than reported. A commitment must declare the standing accumulator plus its own payment, and any other declaration is refused. The first commit opens the process, where <Math>{"G = P"}</Math> and the two bonds coincide; every later commit raises the accumulator by its own payment and bonds its seller against the whole of it.
                </PaperRun>
                <PaperRun title="Resolve &mdash; buyer dominance with atomic resolution.">
                    Only the process&rsquo;s buyer may resolve, and resolution is atomic: every active order resolves at once, or none does. It pays each seller its payment and refunds its bond, <Math>{"2G_i + P_i"}</Math> in all, and refunds the buyer its <Math>{"2P_i"}</Math> less that payment. Resolution is the only terminal move. An unresolved process stays open, with no clock and no timeout, and no other operation releases a bonded position. Resolving is the buyer&rsquo;s judgment: the Core holds no test of performance and admits no report of delivery.
                </PaperRun>
                <PaperRun title="The equilibrium: three comparisons, one fixed point.">
                    The payoffs are the Core&rsquo;s transfers plus the value a party holds off-chain, credited at the figure the parties signed. <em>(a)</em> After performance the buyer strictly prefers resolving, <Math>{"0"}</Math>, to never resolving, <Math>{"-P_i"}</Math>. It holds what it bought either way, so the branches differ only in its own bond; nothing about the seller enters, and this is the one unconditional anchor. <em>(b)</em> Given (a) and the buyer&rsquo;s plan, resolve once performance has occurred and not before, the seller strictly prefers performing, <Math>{"+P_i"}</Math>, to never performing, at most <Math>{"-G_i"}</Math>. <em>(c)</em> Given (b), the buyer before performance keeps the process open rather than resolving at once, which would end its game at <Math>{"-P_i"}</Math>. Comparisons (b) and (c) are the two parties&rsquo; best-response checks against one profile, verified jointly. That fixed point is an equilibrium, and cooperation is its play.
                </PaperRun>
                <PaperRun title="Why the bond is twice the value.">
                    The seller&rsquo;s figure in (b) carries the retention term. Value passes off-chain, so a seller that holds out keeps what is in its hands, credited at most <Math>{"G_i"}</Math>. Against its bond of <Math>{"2G_i"}</Math> that leaves it at best at <Math>{"-G_i"}</Math>. A bond equal to the value at the order would be exactly canceled by the taking, and that is what the doubling answers. The deterrent is mutual assured destruction, and no operation ever executes it: no bond is consumed, so the standoff ends in performance and acceptance.
                </PaperRun>
                <PaperRun title="The chain holds fingerprints; the parties judge performance.">
                    The chain keeps the bonds, the accumulator, the merkle root of each signed agreement and each attestation as a content hash. It never holds the terms, and it never sees an aircraft depart or a meal load. A disagreement about whether a service met the agreement is decided between the parties while the process stands open, and the remedy comes before resolution. The remedy is arithmetic: a provider that cannot perform sends the passenger the payment it stands to receive and makes good what it holds. At resolution it is paid that payment and refunded its bond, ending at zero, and the passenger is whole. Where the parties cannot agree, a forum can rule on the process&rsquo;s data and the parties&rsquo; own evidence while the process is open. It cannot resolve the process, which is the passenger&rsquo;s call alone, and that absence of direct enforcement is why composing a forum leaves the equilibrium unchanged. Once the passenger resolves, the resolution is terminal acceptance.
                </PaperRun>
                <PaperRun title="What atomicity does to the cohort.">
                    The bonding schedule secures each order on its own; atomic resolution coordinates the orders the schedule has already secured. Because nobody is paid until the buyer resolves, a seller that has performed stands <Math>{"P_i + 2G_i"}</Math> better off under universal performance and resolution than in a process another seller&rsquo;s failure holds open. That figure is its payment forgone plus its whole bond, having parted with what it had. For a seller that has not yet performed the gap is at least <Math>{"P_i + G_i"}</Math>, since it still holds what is in its hands. Either figure reads off the accumulator alone, with no communication, no repeated interaction and no information about the other sellers. One unremedied failure holds every position open, which is the structure of a weakest-link game. Joint-liability lending builds the same dependence into each borrower&rsquo;s payoff, and its models derive repayment from peer selection (Ghatak, 1999) and peer monitoring (Stiglitz, 1990). Atomic resolution reproduces the coordination-pressure component of that literature and only that component; nothing below assumes selection or monitoring.
                </PaperRun>
                <PaperRun title="Where does the operating outlay enter?">
                    A referee from this domain will ask where fuel burn, crew duty hours, gate time and catering stock enter the equilibrium. They enter the asset&rsquo;s ledger, and the equilibrium is computed without them. The payoffs are the transfers the Core executes plus the off-chain value a party ends up holding, so a provider&rsquo;s decision carries no cost term. What a provider consumes to perform is the operating outlay of the asset behind the wallet: the aircraft wallet, the crew wallet and the fuel-supplier wallet each take payments in and send payments out. The mechanism asks one thing of a provider, that the wallet hold enough to bond the commitment it signs. An asset whose balances no longer cover its bonds stops quoting, and that is how an asset leaves a market.
                </PaperRun>
                <PaperRun title="What this gives a cross-border service.">
                    Resolution moves locked balances on the Core&rsquo;s own terms, executed by no court and dependent on no party&rsquo;s home jurisdiction. The substantive agreement stays binding under whatever law the parties name, and disputes about it go where the parties send them. What the mechanism supplies is that the tokens at stake move by the buyer&rsquo;s acceptance. That matters in a service whose providers routinely sit in a dozen legal systems at once.
                </PaperRun>
            </PaperSection>

            <PaperSection title="3. The Bonded Architecture Applied to Air Service">
                <PaperRun title="One buyer, many sellers.">
                    The passenger is the buyer of every order in the journey&rsquo;s process. Its first commit opens the process under its address, and each later commit raises the same accumulator by its own payment. The Core requires the process&rsquo;s buyer in every order and holds no relation between one provider and another, so the process is a linear chain of commits that all run to the passenger. Every provider wallet &mdash; crew member, aircraft, fuel supplier, gate, caterer, maintenance provider, ground handler &mdash; is a seller whose payout waits on the passenger&rsquo;s resolution. A process holds as many orders as the network can resolve in one call, far more than the ten a journey needs.
                </PaperRun>
                <PaperRun title="What the Core constrains.">
                    The Core holds a handful of per-order facts: the buyer, which must be the process&rsquo;s buyer, the seller, the payment, the denomination and the cumulative value at commit. The denomination is one token for the whole process, enforced at every commit. A single process is therefore tightly shaped: one buyer, one or more sellers, one accumulator, one resolution. A provider in process <Math>{"A"}</Math> may open a process <Math>{"B"}</Math> of its own, as its buyer, to coordinate its own suppliers; the two resolve process by process, never across.
                </PaperRun>
                <PaperRun title="What the designer composes.">
                    Above the Core, a <em>clause</em> is one reusable term of an agreement, registered publicly for anyone to compose. A designer composes the clauses for one order into an <em>agreement</em>, registered under its agreement key: the merkle root over one leaf per clause, each leaf the clause and the designer&rsquo;s fills. An <em>assembly</em> composes registered agreements, in order, into one reusable design of a process. It is published under the merkle root over its agreements and, when the design composes clauses scoped to the whole assembly, an assembly terms leaf. The designer composes, the passenger selects an assembly and each provider binds the agreement for its order. At checkout the parties fill and sign that agreement, and its merkle root is what the commitment carries.
                </PaperRun>
                <PaperRun title="The demand side: what the passenger was buying.">
                    The decomposition describes what the passenger was buying in the first place. It is progress on a job that arises in a circumstance &mdash; be in the destination city, in a fit state, by a stated hour &mdash; for which crew-hours, airframe-time, fuel, gate time, catering, maintenance and ground handling are the resources consumed (Christensen, Hall, Dillon, &amp; Duncan, 2016). The bonded process expresses that description directly. It comes into existence at the first commit, holds the bonded orders the journey needs and ends at one resolution.
                </PaperRun>
                <PaperRun title="Each resource market keeps its own allocation.">
                    Each market admits its own mechanism: bilateral commits where the parties contract directly, or a resource-specific mechanism the designer composes. A gate-time mechanism takes an airport&rsquo;s allocated landing slots as an input, since landing slots at coordinated airports are allocated by a coordinator, not bid for (Airports Council International et al., 2025; Council of the European Communities, 1993). A crew-dispatch mechanism respects type-rating and duty-time constraints, and a fuel-pool mechanism serves shared ramp-side procurement. Whatever is composed, the rule of the process holds across it: every order has the passenger as its buyer, and the process ends at one resolution.
                </PaperRun>
            </PaperSection>

            <PaperSection title="4. Disruption Resolution Under Buyer Dominance">
                <p>
                    When a delay, a slip or a service failure occurs, who puts it right, and why? We answer through a worked bond schedule, the compensation route it opens, the crew case and the scale of irregular operations, and then place the fallbacks behind that route.
                </p>
                <PaperSubsection title="4.1 The primary route: cohort compensation under bond pressure">
                    <PaperRun title="A bond-posture worked example.">
                        Consider a stylized domestic short-haul journey totalling $250. The passenger is the buyer of every order, so it commits directly to each provider wallet, and the ten commits below form one process. The accumulator <Math>{"G"}</Math> grows monotonically as each commit lands (<Math>{"G \\leftarrow G + P_i"}</Math>). At every commit the buyer posts <Math>{"2P_i"}</Math> and the seller posts twice the accumulator as it then stands.
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
                        <em>The asymmetry between the two sides.</em> The passenger&rsquo;s aggregate locked position is $500, twice the ticket, and that is the whole of it. The provider cohort&rsquo;s aggregate is $3,512, more than seven times the passenger&rsquo;s. Each provider bonds against the accumulator as it stands at its own commit, and every earlier payment is inside that figure. Held at fixed per-commit payments, the cohort&rsquo;s aggregate grows quadratically in the number of commits while the passenger&rsquo;s grows linearly: <Math>{"n"}</Math> commits of equal payment <Math>{"p"}</Math> put the cohort at <Math>{"p\\,n(n+1)"}</Math> against the passenger&rsquo;s <Math>{"2pn"}</Math>, a ratio of <Math>{"(n+1)/2"}</Math>. The qualifier carries weight. Split a <em>fixed</em> ticket into <Math>{"n"}</Math> equal commits instead and the cohort aggregate is <Math>{"P_{\\text{ticket}}(n+1)"}</Math>, still rising with each market added, but linearly. A process the passenger has not resolved holds that whole pool locked.
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
                        The cohort aggregate depends on the commit <em>order</em>, not only on the set of payments. Summing the schedule gives <Math>{"2\\sum_j (n - j + 1)\\,P_j"}</Math>: a payment made at position <Math>{"j"}</Math> is inside the bond base of its own commit and of every commit after it, so early payments count many times and late ones once. Swapping the two $20 authority commits leaves the total where it was. Committing the $19 federal-aviation-system payment first, and shifting the other nine one place later, gives $3,392 rather than $3,512, a $120 difference from a reordering that changes nothing else. The end state is fixed whatever the sequence: <Math>{"G_{\\text{final}}"}</Math> is the ticket total, so the last provider to commit bonds $500, and the passenger&rsquo;s aggregate is twice the ticket. A designer choosing a commit sequence therefore chooses how large the cohort&rsquo;s aggregate is and how it is spread across the providers, and nothing else.
                    </p>
                    <PaperRun title="Waiting is the position everyone already holds.">
                        Until the passenger resolves, every provider&rsquo;s bond stays locked and no payment moves. Waiting pays the passenger nothing, since its own <Math>{"2P_i"}</Math> is locked beside the providers&rsquo; bonds. Nor is it a sanction: no operation takes a bond from anyone, and nothing is consumed by the wait. The process has simply not been accepted, and each provider stands where its commit put it, its payment unearned and its bond locked. That standing position is what makes compensation the cohort&rsquo;s own business.
                    </PaperRun>
                    <PaperRun title="Providers determine and pay compensation themselves.">
                        When a disruption leaves the passenger worse off than the agreement contemplated, each provider holds the figures of Section 2. One that has performed is out <Math>{"P_i + 2G_i"}</Math> against a resolved process, and one that has not yet performed is out at least <Math>{"P_i + G_i"}</Math>. Both dwarf a proportionate share of making the passenger willing to accept.
                    </PaperRun>
                    <p>
                        Providers approach the passenger with offers, in whatever form the passenger accepts: a cash transfer, a service credit, accommodation or meal vouchers, alternative routing, or the remedy of Section 2, in which the failing provider sends back the payment it stands to receive. The denomination of such a transfer is the parties&rsquo; business, and none of it passes through the Core. Among themselves the providers negotiate who bears what share. The provider whose performance failed bears most, and providers who could not have prevented the failure, such as the caterer beside a fuel slip, bear little or nothing.
                    </p>
                    <p>
                        A referee will ask why a provider whose own service was sound would contribute at all. The answer is in its own figure: its payment and its bond wait on the same resolution as the failing provider&rsquo;s. The negotiation is routine for that reason, since each provider knows its bond, its payout under a resolved process and what it would pay rather than keep standing where it stands. The passenger accepts what satisfies it and resolves. Each provider is then paid and refunded <Math>{"2G_i + P_i"}</Math>, less whatever it paid in compensation, and the passenger keeps the compensation already received.
                    </p>
                    <p>
                        This route runs at the operational boundary: the gate, the destination service desk or whatever surface the assembly&rsquo;s designer provides, rather than in a filing months later. It stands open before insurance claims, dispute forums or regulatory engagement, because that is where the bonded positions point. Whether a given cohort takes it, and how quickly, is conduct the bonds leave to the cohort. What they supply is each party&rsquo;s own reason to take it.
                    </p>
                    <PaperRun title="The crew case.">
                        Crew allocation is a direct market between the passenger and the crew member. The crew member&rsquo;s wallet declares its certification in the agreement it signs and bonds into the passenger&rsquo;s process at its own order, so its payout waits on the passenger&rsquo;s resolution. Suppose the crew member cannot fly. Its order is locked beside every other order in the process, and it deals with the passenger directly: it finds a substitute at speed, places the passenger on the next departure, sends back the payment for the leg, or offers whatever else the passenger will accept. Resolution follows the remedy. Collective bargaining over wage rates, duty-time protections and seniority stays what it is, a labor-market institution the mechanism leaves in place.
                    </PaperRun>
                    <PaperRun title="Irregular operations at scale.">
                        A single flight understates the load of large-scale irregular operations. A hub disruption opens the compensation question in hundreds of flights at once, across thousands of bonded orders, and many provider wallets appear in many processes. Each affected passenger holds a separate process with its own provider cohort. The bonded architecture leaves that coordination cost in place and routes it differently: each passenger faces a busy but directly reachable cohort negotiating that passenger&rsquo;s compensation.
                    </PaperRun>
                </PaperSubsection>
                <PaperSubsection title="4.2 Fallbacks">
                    <p>
                        The primary route is where the bonded positions point a disruption first. Fallbacks engage where it does not come to rest there, or where the issue is of a class bond posture cannot address. We list them in the order they engage.
                    </p>
                    <p>
                        <em>Specialized mechanisms composed into the assembly.</em> A designer may compose a delay-compensation mechanism that disburses pre-agreed amounts under specified conditions. It makes some compensation patterns automatic rather than negotiated. It sits beside the bonded process, and the only path by which a bond is refunded stays the passenger&rsquo;s resolution.
                    </p>
                    <p>
                        <em>Dispute forums.</em> An agreement may name a forum, such as an arbitration center, an online dispute-resolution service or a Schelling-point juror system; where none is named, whichever forum would have heard the parties stays available. A forum engages when the dispute is substantive in a way bond posture cannot address: duress, mistake, frustration, illegality or public policy. It rules as Section 2 states, on the process&rsquo;s data while the process is open. Its ruling reaches the parties through their exposure outside the process and feeds the remedy the passenger will accept.
                    </p>
                    <p>
                        <em>Insurance compositions.</em> A passenger or provider wanting cover against risks bond posture cannot absorb, such as catastrophic events or multi-day weather disruption, composes a parallel bonded process with an insurer. The insurer&rsquo;s own bond stands behind its undertaking, and that process resolves on its own. Nothing inside the original process changes.
                    </p>
                    <p>
                        <em>Regulators.</em> Aviation safety regulators, consumer-protection authorities, competition enforcement and labor-protection regimes operate beside the bonded architecture, each in the matters its authority covers.
                    </p>
                </PaperSubsection>
            </PaperSection>

            <PaperSection title="5. Clauses">
                <p>
                    A journey&rsquo;s agreements compose clauses from an open set that any designer extends by publishing. The arguments of Sections 2 and 4 read off the Core&rsquo;s figures alone, so no result depends on a clause specific to aviation. What the clauses add is the terms each party signs and the evidence the parties, and any forum, read while the process is open.
                </p>
                <PaperRun title="What the clauses carry.">
                    The commerce clause carries each order&rsquo;s denomination, payment and itemized line items, one order per resource commitment; the ticket is the sum of those payments. The denomination is a term of every agreement, written at checkout. When the designer has composed an assembly-scoped denomination pin, the pin is written; otherwise the buyer picks among the tokens the seller accepts, or the seller&rsquo;s default applies. A pin is folded into every agreement at checkout, so each party signs it, and the Core requires one denomination across every order of a process, pinned or not. The schedule clause binds the agreed window of each order, a single interval <Math>{"[\\text{start}, \\text{end})"}</Math> whose meaning the parties agree, including any slip they tolerate. The geolocation clause carries origin and destination as locality codes under a declared standard, a cell-grid encoding or a jurisdiction code, and the axis is open to any standard.
                </PaperRun>
                <p>
                    The modalities clause declares which coordination scenario the process runs. The handoff clause names where a physical exchange occurs, and a proximity policy commits the detection bands accepted as certifying that exchange. An arbitration clause carries a forum selection and an applicable-law clause the governing law. For the international flights the designer fills both once for the whole assembly, and a seller accepts them by binding. An emissions clause commits a reporting methodology where the design wants one signed with the ticket. Credential clauses qualify each provider, such as the crew certificate, the airworthiness certificate and the maintenance authorization, each anchored to the issuing authority&rsquo;s public register; they bind at signing, and the Core enforces none of them.
                </p>
                <PaperRun title="What happened is an attestation.">
                    The schedule clause holds only the agreed window. What happened &mdash; boarding, pushback, takeoff, arrival &mdash; is an attestation the operating provider gives for itself on its own order while the process is open. It gives it on the event log of its role, a clause whose closed vocabulary names that role&rsquo;s stages so that every reader reads an attestation the same way. The chain checks that each attestation is signed and bound to its order, never that it is true. What stands behind it is the passenger&rsquo;s decision to withhold resolution until a false one is put right.
                </PaperRun>
                <PaperRun title="Three terms the design leaves out, and why.">
                    The first is a force-majeure clause that lets a party exit its bonded position in a weather event. Cover against weather is a composition: a party wanting it composes a parallel insurance process, and the Core neither knows about weather nor adjudicates whether an event qualifies. A clause that freed a bond on terms other than the passenger&rsquo;s resolution would be an exit from the bonded state, and the equilibrium of Section 2 holds for a game that has none. The second is a clause scoring which delays count against whom; the agreed windows are the only timing criteria the commitment carries, and any refinement is for the parties or their forum. The third is a unilateral reschedule right. A reschedule is a new commitment, signed by both parties like any other.
                </PaperRun>
            </PaperSection>

            <PaperSection title="6. Comparison with the Conventional Apparatus">
                <PaperRun title="What changes is the cost-flow path.">
                    Under a contract of carriage the passenger&rsquo;s counterparty is the carrier. The carrier&rsquo;s suppliers are bound to the carrier by their own contracts, and the passenger holds none with them. A supplier&rsquo;s slip reaches the passenger only through the carrier, at the amounts the carrier&rsquo;s terms or a passenger-protection regime set, while delay propagates along an aircraft&rsquo;s routing to later flights and misconnected passengers (Lan, Clarke, &amp; Barnhart, 2006). In a bonded process every provider is a seller to the passenger. The remedy for a slip is owed at the order where the service slipped and negotiated among providers whose bonds all stand behind the same resolution. Any reduction of propagated-delay loss is a by-product of that bond posture rather than its aim.
                </PaperRun>
                <PaperRun title="Where scarcity remains.">
                    Decomposing the journey shows which inputs are scarce and which are commodity. The aircraft is largely a commodity input, leased and available to any operator on similar terms. The scarce inputs are the slots and the brand: a landing slot at a congested hub commands what scarcity commands whoever holds it, and a name passengers seek out stays with whichever wallet or published composition carries it. Decomposition dissolves neither. What it changes is where the margin goes: every value-adder prices its own order in its own market and bonds against it, and each order runs from the passenger to the provider directly.
                </PaperRun>
                <PaperRun title="What stays in place.">
                    Safety regulation stays: the FAA in the US, EASA in the EU and analogous national authorities certify aircraft, license pilots, approve maintenance procedures and set operational standards. Crew-labor protections stay: collective bargaining and duty-time limits apply to the crew&rsquo;s order exactly as they apply under the conventional regime, for flightcrew under 14 CFR Part 117 and for flight attendants under 14 CFR &sect;121.467 in the US, with analogous regimes elsewhere. Insurance keeps its function. The risk profile it prices shifts: a smaller residual once the bonded positions have done their work, concentrated exposure at the orders carrying the largest bonds, and a new exposure at every provider wallet whose bond stays locked while a process is open. Competition law stays: provider markets remain subject to anti-collusion enforcement, and the allocation of landing slots at congested airports remains with the relevant authorities.
                </PaperRun>
                <PaperRun title="Regulatory roles attach to wallets.">
                    Some regulatory functions attach to a single designated holder. The FAA issues the air-carrier certificate under 14 CFR Part 119, and many safety obligations attach to the certificate holder; other jurisdictions have analogous regimes. Under the bonded architecture the certificate holder is one of the wallets in the assembly, such as the aircraft wallet or a wallet holding the aircraft&rsquo;s operating credentials. The function is preserved, and its holder participates as one bonded counterparty among the others. Discovery surfaces, quality-signal aggregators and multi-process curators may serve the market around the process. Inside it the passenger holds the buyer&rsquo;s position in every order, and the Core admits no other party to it.
                </PaperRun>
                <PaperRun title="Passenger-protection regimes operate beside it.">
                    The architecture is a coordination mechanism, and its passenger-side effect is that a disruption&rsquo;s loss is carried where it arose. Passenger-protection regimes operate in their own register. In the EU, Regulation 261/2004 sets common rules on compensation and assistance for denied boarding, cancellation and long delay, owed by the operating carrier (European Parliament and Council, 2004). That obligation, and its analogues elsewhere, stays with the regulated party in its jurisdiction. Whether a given provider operates well inside the bonded architecture is an operational-management question the architecture leaves to it.
                </PaperRun>
            </PaperSection>

            <PaperSection title="7. Scope">
                <PaperRun title="The public-authority wallets are bounded.">
                    Whether a security checkpoint, an airport authority or an air-traffic service would bond into a passenger&rsquo;s process turns on appropriation rules, sovereign-immunity doctrine and public-finance practice. The mechanism speaks to none of them. The architecture admits the assumption, which is why we carry it as the thought experiment declared in Section 1. Delete the four authority rows from the worked example and the figures shrink, but the bond schedule, the order dependence of the cohort aggregate, the compensation arithmetic and the clause list read the same over the commercial providers that remain.
                </PaperRun>
                <PaperRun title="Asset specificity constrains procurement, not the compensation pressure.">
                    The architecture works best on the procurement side where providers compete with available alternatives. Where a provider is a near-monopolist, such as an airport authority at a congested hub or air-traffic services by regulatory construction, the passenger has no substitute, and the terms it obtains reflect that. That constraint acts before the commit. Once a provider has bonded, its position is the same as the caterer&rsquo;s, and so is the compensation arithmetic of Section 4, which reads off its own bond rather than off the market it sells into. On the procurement side, then, the architecture is most effective in the low-specificity region of the resource portfolio and least effective at the high-specificity end.
                </PaperRun>
                <PaperRun title="Bond-denomination access.">
                    Every party must post its bond in the one denomination the process runs in. For some providers, such as a small caterer in a jurisdiction with thin access to that token, this may bind. The constraint is real, and it is an on-ramp problem rather than a mechanism problem: the conversion happens before the commit, outside the process.
                </PaperRun>
                <PaperRun title="Bond posture at a high-volume provider.">
                    A provider covering thousands of flights a day posts a bond against each open commitment, so its aggregate posture scales with the number of its processes open at once. The posture at any moment is bounded by that number times the per-process bond, since bonds are deposited as processes commit and refunded as they resolve. Its price is the time value of the locked tokens, the cost of serving that volume. Each bond is the deterrent for the commitment it stands behind, sized by the value it secures and held for exactly the span that commitment is open.
                </PaperRun>
                <PaperRun title="Composability with the conventional regime.">
                    The architecture composes with the conventional regime. A provider can serve some passengers under bonded processes and others under contracts of carriage, and a supplier can serve some counterparties under bonded commitments and others under conventional ones.
                </PaperRun>
            </PaperSection>

            <PaperSection title="8. Conclusion">
                <p>
                    A journey decomposes into resource markets whose providers can each bond directly to the passenger in one process. Asymmetric bonding secures every order, and atomic resolution makes every payout wait on every performance. The providers who can repair a disruption are therefore the ones whose bonds stand behind it, and each can compute from the accumulator what the failure costs it. Compensation accordingly has a route through the cohort to the passenger before insurers, forums or regulators engage, and every party on it holds its own bonded reason to take it. The regulatory and contractual layers around air service stay in place; what moves is the path a disruption&rsquo;s cost travels.
                </p>
            </PaperSection>
        </PaperLayout>
    );
}
