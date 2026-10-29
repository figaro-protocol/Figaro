import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import {
    PaperLayout,
    PaperSection,
    PaperSubsection,
    PaperRun,
    PaperRemark,
    PaperScroll,
} from "@/components/papers/PaperLayout";
import { Math } from "@/components/papers/Math";
import { MarketFormationSwimlaneFigure } from "@/components/figures/MarketFormationSwimlaneFigure";
import { KERNEL_EQUILIBRIUM } from "@figaro-protocol/sdk";

// The position of Section 1.2 renders the winning order's figures from the
// equilibrium module, the one owner of the numbers. The order opens a process,
// so its cumulative value is its payment: G = P.
const EX = KERNEL_EQUILIBRIUM.example;
const EX_P = EX.payment;
// The other prices of the position, placed around the winning figure.
const EX_CHEAPER = EX_P - 1;
const EX_DEARER = EX_P + 2;
const EX_CEILING = EX_P + 2;
const EX_QUOTE_HIGH = EX_P + 1;

export const metadata: Metadata = withOg({
    title: "Markets Without a Venue — Figaro Protocol",
    description:
        "Two ways an order's commitment forms over a mechanism that knows nothing about markets: the dispatch race, a posted-price mechanism with simultaneous solicitation, and the request for quotes, which has the form of a sealed-bid first-price procurement auction with an announced reserve. A market-design treatment of formation without a venue: the class of each mechanism, where each discovers price, what each does to both sides' incentives, and why the mechanism beneath never has to learn that either happened.",
});

function FormalBlock({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="border-l-2 border-default pl-6 my-3 space-y-3">
            <p className="text-sm font-semibold text-ink-heading">{label}</p>
            {children}
        </div>
    );
}

function Proof({ children }: { children: React.ReactNode }) {
    return (
        <div className="my-3 space-y-3 text-ink-body">
            <p>
                <span className="italic text-ink-muted">Proof. </span>
                {children}
            </p>
        </div>
    );
}

export default function MarketsWithoutAVenuePaper() {
    return (
        <PaperLayout slug="markets-without-a-venue"
            title="Markets Without a Venue"
            subtitle="Dispatch Races and Requests for Quotes as Market-Design Mechanisms over a Market-Blind Mechanism"
            author="Figaro"
            date="August 2026, revised October 2026"
            watermark="Figaro Protocol · Preprint"
            abstract={
                <>
                    <p>
                        A buyer needs one job done, and several sellers have published a price for it. Asking all at once is a coordination problem: several can answer, only one order should form, and nobody holds the authoritative state between asking and binding. An exchange, an auction house, a procurement portal or a dispatcher holds that state. A venue contract would hold a position no party bonded. We study formation over a commit-and-resolve mechanism that admits a commitment on two signatures over one struct and locks a bond from each party so the other can count on it. In the <em>dispatch race</em> the buyer drafts one unsigned commitment per candidate (a seller it solicits) at its published price and signs one answer: a posted-price mechanism that searches over availability. In the <em>request for quotes</em> each candidate re-prices a draft written at the buyer&rsquo;s ceiling: in form, a sealed-bid first-price procurement auction with an announced reserve. An answer fills only the price fields the buyer names; no term is negotiated. Four results carry the argument, each proved here or derived from the mechanism&rsquo;s own arithmetic. A buyer that signs last, and signs one answer, is held to at most one commitment, the one it chose. First price is forced. Participation turns on a balance the draft states. A market layer whose only output is a commitment the mechanism accepts inherits its equilibrium unchanged. The results take the candidate set as given: how a buyer finds candidates among many, and what reading their terms costs, lie outside the model.
                    </p>
                </>
            }
            references={
                <>
                    <li>Ausubel, Lawrence M., and Paul Milgrom. 2006. &ldquo;The Lovely but Lonely Vickrey Auction.&rdquo; In <em>Combinatorial Auctions</em>, edited by Peter Cramton, Yoav Shoham, and Richard Steinberg, 17&ndash;40. Cambridge, MA: MIT Press. https://doi.org/10.7551/mitpress/9780262033428.003.0002.</li>
                    <li>Bajari, Patrick, Robert McMillan, and Steven Tadelis. 2009. &ldquo;Auctions versus Negotiations in Procurement: An Empirical Analysis.&rdquo; <em>Journal of Law, Economics, and Organization</em> 25 (2): 372&ndash;399. https://doi.org/10.1093/jleo/ewn002.</li>
                    <li>Bulow, Jeremy, and Paul Klemperer. 1996. &ldquo;Auctions versus Negotiations.&rdquo; <em>American Economic Review</em> 86 (1): 180&ndash;194. https://ideas.repec.org/a/aea/aecrev/v86y1996i1p180-94.html. Accessed October 29, 2026.</li>
                    <li>Diamond, Peter A. 1971. &ldquo;A Model of Price Adjustment.&rdquo; <em>Journal of Economic Theory</em> 3 (2): 156&ndash;168. https://doi.org/10.1016/0022-0531(71)90013-5.</li>
                    <li>Figaro. 2026. &ldquo;Asymmetric Bonding and Buyer Dominance: Two Composing Mechanisms for N-Party Coordination Among Strangers.&rdquo; Preprint. https://figaroprotocol.com/papers/asymmetric-bonding/. Accessed October 18, 2026.</li>
                    <li>Gale, David, and Lloyd S. Shapley. 1962. &ldquo;College Admissions and the Stability of Marriage.&rdquo; <em>American Mathematical Monthly</em> 69 (1): 9&ndash;15. https://doi.org/10.1080/00029890.1962.11989827.</li>
                    <li>Gibbard, Allan. 1973. &ldquo;Manipulation of Voting Schemes: A General Result.&rdquo; <em>Econometrica</em> 41 (4): 587&ndash;601. https://doi.org/10.2307/1914083.</li>
                    <li>Hagerty, Kathleen M., and William P. Rogerson. 1987. &ldquo;Robust Trading Mechanisms.&rdquo; <em>Journal of Economic Theory</em> 42 (1): 94&ndash;107. https://doi.org/10.1016/0022-0531(87)90104-9.</li>
                    <li>Hayek, F. A. 1945. &ldquo;The Use of Knowledge in Society.&rdquo; <em>American Economic Review</em> 35 (4): 519&ndash;530. https://www.jstor.org/stable/1809376.</li>
                    <li>Klemperer, Paul. 1999. &ldquo;Auction Theory: A Guide to the Literature.&rdquo; <em>Journal of Economic Surveys</em> 13 (3): 227&ndash;286. https://doi.org/10.1111/1467-6419.00083.</li>
                    <li>Milgrom, Paul. 2017. <em>Discovering Prices: Auction Design in Markets with Complex Constraints</em>. New York: Columbia University Press. https://doi.org/10.7312/milg17598.</li>
                    <li>Milgrom, Paul R., and Robert J. Weber. 1982. &ldquo;A Theory of Auctions and Competitive Bidding.&rdquo; <em>Econometrica</em> 50 (5): 1089&ndash;1122. https://doi.org/10.2307/1911865.</li>
                    <li>Myerson, Roger B. 1981. &ldquo;Optimal Auction Design.&rdquo; <em>Mathematics of Operations Research</em> 6 (1): 58&ndash;73. https://doi.org/10.1287/moor.6.1.58.</li>
                    <li>Myerson, Roger B., and Mark A. Satterthwaite. 1983. &ldquo;Efficient Mechanisms for Bilateral Trading.&rdquo; <em>Journal of Economic Theory</em> 29 (2): 265&ndash;281. https://doi.org/10.1016/0022-0531(83)90048-0.</li>
                    <li>Riley, John G., and William F. Samuelson. 1981. &ldquo;Optimal Auctions.&rdquo; <em>American Economic Review</em> 71 (3): 381&ndash;392. https://ideas.repec.org/a/aea/aecrev/v71y1981i3p381-92.html. Accessed October 29, 2026.</li>
                    <li>Roth, Alvin E. 2008. &ldquo;What Have We Learned from Market Design?&rdquo; <em>Economic Journal</em> 118 (527): 285&ndash;310. https://doi.org/10.1111/j.1468-0297.2007.02121.x.</li>
                    <li>Roth, Alvin E., and Axel Ockenfels. 2002. &ldquo;Last-Minute Bidding and the Rules for Ending Second-Price Auctions: Evidence from eBay and Amazon Auctions on the Internet.&rdquo; <em>American Economic Review</em> 92 (4): 1093&ndash;1103. https://doi.org/10.1257/00028280260344632.</li>
                    <li>Roth, Alvin E., and Marilda A. Oliveira Sotomayor. 1990. <em>Two-Sided Matching: A Study in Game-Theoretic Modeling and Analysis</em>. Cambridge: Cambridge University Press. https://doi.org/10.1017/CCOL052139015X.</li>
                    <li>Roth, Alvin E., and Xiaolin Xing. 1994. &ldquo;Jumping the Gun: Imperfections and Institutions Related to the Timing of Market Transactions.&rdquo; <em>American Economic Review</em> 84 (4): 992&ndash;1044. https://ideas.repec.org/a/aea/aecrev/v84y1994i4p992-1044.html. Accessed October 29, 2026.</li>
                    <li>Rothkopf, Michael H., Thomas J. Teisberg, and Edward P. Kahn. 1990. &ldquo;Why Are Vickrey Auctions Rare?&rdquo; <em>Journal of Political Economy</em> 98 (1): 94&ndash;109. https://doi.org/10.1086/261670.</li>
                    <li>Satterthwaite, Mark Allen. 1975. &ldquo;Strategy-Proofness and Arrow&rsquo;s Conditions: Existence and Correspondence Theorems for Voting Procedures and Social Welfare Functions.&rdquo; <em>Journal of Economic Theory</em> 10 (2): 187&ndash;217. https://doi.org/10.1016/0022-0531(75)90050-2.</li>
                    <li>Stigler, George J. 1961. &ldquo;The Economics of Information.&rdquo; <em>Journal of Political Economy</em> 69 (3): 213&ndash;225. https://doi.org/10.1086/258464.</li>
                    <li>Vickrey, William. 1961. &ldquo;Counterspeculation, Auctions, and Competitive Sealed Tenders.&rdquo; <em>Journal of Finance</em> 16 (1): 8&ndash;37. https://doi.org/10.1111/j.1540-6261.1961.tb02789.x.</li>
                </>
            }
        >
            <PaperSection title="1. Introduction">
                <PaperSubsection title="1.1 The coordination problem">
                    <p>
                        A buyer needs one job done and finds <Math>{"k"}</Math> wallets that publish a price for it. It wants to ask several at once, because any one of them may be busy, and it wants exactly one of them bound. We call each wallet the buyer solicits a <em>candidate</em>. Three facts make this a coordination problem: several candidates can answer, only one order should form, and nobody holds the authoritative state of the solicitation, which says who was asked, who answered, and which answer binds. If the buyer sends each candidate a commitment it has already signed, each can complete one alone, and the buyer may be bound <Math>{"k"}</Math> times. If it asks first and signs later, it must decide what to sign and on what evidence.
                    </p>
                    <p>
                        The buyer may lack one of two things, and the distinction runs through the paper. When the published prices fit the job, the buyer knows every price before it asks, and what it lacks is <em>availability</em>: whether the cheapest candidate is willing and able to take this job now. When no published price fits, it lacks the <em>price</em> itself. The two formation mechanisms studied here divide on that line. The dispatch race searches over availability at published prices (&sect;4.2), and the request for quotes discovers a price (&sect;5.1).
                    </p>
                    <p>
                        A venue solves the problem by holding the authoritative state. It collects the bids, keeps them sealed, applies a rule, and keeps the bids and the outcome where a loser can check them. Market design has mostly designed such institutions. The sealed-bid tender, the ascending auction, the clearinghouse, and the deferred-acceptance match are each specified as a procedure someone runs. Milgrom (2017) develops auction design for markets with complex constraints, in which the auctioneer computes both the allocation and the prices. The procedure&rsquo;s properties then hold only if the party running it behaves. Rothkopf, Teisberg, and Kahn (1990) explain the rarity of second-price auctions by bidders&rsquo; distrust of an auctioneer who learns the highest bid and computes the payment from the second, and Ausubel and Milgrom (2006) extend the diagnosis to combinatorial settings.
                    </p>
                    <p>
                        The setting here adds a reason to avoid a venue that reputation and law do not address. The mechanism, defined in &sect;2, makes a promise between strangers good before the trade by having each party lock a bond against its own conduct. Its security is an equilibrium over exactly those locked positions and the two operations that move them, and a game with any further way to release a locked position does not inherit it (Figaro 2026, Theorem 2). A venue that holds bid bonds, or that can move a party&rsquo;s tokens, adds a position that analysis does not cover. Our question is how much of a venue&rsquo;s work the two signatures on a commitment can do by themselves.
                    </p>
                </PaperSubsection>
                <PaperSubsection title="1.2 One position, two routes">
                    <p>
                        A stipulated case shows both routes before the formal apparatus. A buyer <Math>{"B"}</Math> needs one job done at a <em>position</em>, an order&rsquo;s place in the sequence of orders the buyer opens (&sect;2.1); this one opens a process, so the order&rsquo;s cumulative value is its payment. Three candidates, <Math>{"S_1"}</Math>, <Math>{"S_2"}</Math>, and <Math>{"S_3"}</Math>, have published terms for jobs of this kind; on the race route their posted prices fit this one, and on the quote route none does. Every object exchanged is one commitment struct in one of three states: a <em>draft</em> carries no signature, an <em>answer</em> carries the candidate&rsquo;s, and a <em>commitment</em> carries both and is the one object the mechanism admits. The table gives each step of each route, and who signs what at it.
                    </p>
                    <PaperScroll className="my-4">
                        <table className="text-sm border-collapse">
                            <thead>
                                <tr>
                                    {["Step", "Dispatch race", "Request for quotes"].map((h) => (
                                        <th key={h} className="border border-default px-3 py-1.5 text-left font-semibold text-ink-heading">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td className="border border-default px-3 py-1.5">1. Read, before asking</td>
                                    <td className="border border-default px-3 py-1.5"><Math>{"B"}</Math> reads the published prices: <Math>{"S_1"}</Math> at {EX_CHEAPER}, <Math>{"S_2"}</Math> at {EX_P}, <Math>{"S_3"}</Math> at {EX_DEARER}. Nobody signs.</td>
                                    <td className="border border-default px-3 py-1.5">No published price fits the job. <Math>{"B"}</Math> fixes its ceiling at {EX_CEILING}, the most it will pay. Nobody signs.</td>
                                </tr>
                                <tr>
                                    <td className="border border-default px-3 py-1.5">2. Draft, sent at once with one deadline</td>
                                    <td className="border border-default px-3 py-1.5">Three drafts, each naming one candidate at that candidate&rsquo;s own price. <Math>{"B"}</Math> signs nothing.</td>
                                    <td className="border border-default px-3 py-1.5">Three drafts at the ceiling, each naming one candidate and the fields <Math>{"B"}</Math> treats as priced. <Math>{"B"}</Math> signs nothing.</td>
                                </tr>
                                <tr>
                                    <td className="border border-default px-3 py-1.5">3. Answer, within the window</td>
                                    <td className="border border-default px-3 py-1.5"><Math>{"S_1"}</Math> is busy and does not answer. <Math>{"S_2"}</Math> and <Math>{"S_3"}</Math> each sign their draft unchanged.</td>
                                    <td className="border border-default px-3 py-1.5"><Math>{"S_1"}</Math> re-prices its draft at {EX_QUOTE_HIGH} and signs it; <Math>{"S_2"}</Math> re-prices at {EX_P} and signs; <Math>{"S_3"}</Math> does not answer.</td>
                                </tr>
                                <tr>
                                    <td className="border border-default px-3 py-1.5">4. Verify</td>
                                    <td className="border border-default px-3 py-1.5"><Math>{"B"}</Math> checks that each answer is the struct it drafted, hash for hash, and that the signature verifies against the terms as signed.</td>
                                    <td className="border border-default px-3 py-1.5"><Math>{"B"}</Math> rebuilds its own draft at each quoted figure, requires the answer to equal it hash for hash, with the attached agreement hashing to its root and the signature verifying against the terms as signed, and checks that the figure lies between one unit and the ceiling.</td>
                                </tr>
                                <tr>
                                    <td className="border border-default px-3 py-1.5">5. Select and sign, at the close</td>
                                    <td className="border border-default px-3 py-1.5"><Math>{"B"}</Math> signs <Math>{"S_2"}</Math>&rsquo;s answer at {EX_P}, the cheapest verified one.</td>
                                    <td className="border border-default px-3 py-1.5"><Math>{"B"}</Math> signs <Math>{"S_2"}</Math>&rsquo;s answer at {EX_P}, the cheapest verified quote.</td>
                                </tr>
                                <tr>
                                    <td className="border border-default px-3 py-1.5">6. Admission</td>
                                    <td className="border border-default px-3 py-1.5" colSpan={2}>Any wallet holding both signatures submits the commitment. The mechanism locks a bond from each party so the other can count on it: {EX.buyer_locks} from <Math>{"B"}</Math>, twice the payment, and {EX.seller_locks} from <Math>{"S_2"}</Math>, twice the cumulative value, {EX.held} held in all. The losing answer lapses at the deadline, having moved nothing.</td>
                                </tr>
                            </tbody>
                        </table>
                    </PaperScroll>
                    <p>
                        The two routes differ in the first four steps, in what a draft carries and what an answer may change, and coincide in the last two. A race candidate signs a price it published before the solicitation existed, so its answer reports availability and nothing else: what the race found out is that <Math>{"S_1"}</Math>, the cheapest, could not take the job. A quote candidate signs a figure it chose, so the answers are the price discovery. On both routes the buyer signs last and once, and the mechanism sees only the commitment at the sixth step. Section 3 shows why signing last is what makes asking several candidates safe, and &sect;&sect;4 and 5 analyze each route. The figure at the end of &sect;3.3 draws both routes and marks where the mechanism enters.
                    </p>
                </PaperSubsection>
                <PaperSubsection title="1.3 Contribution">
                    <p>
                        We analyze two formation mechanisms with the field&rsquo;s ordinary tools: mechanism class, where price is discovered, incentives on both sides, and stability in the matching sense. Section 2 states the mechanism, the slice of its equilibrium the argument uses, and what the results establish and assume. Section 3 treats signature order and the four roles of a venue. Sections 4 and 5 analyze the two mechanisms, &sect;6 states the composition property, and &sect;7 concludes. The contributions are five.
                    </p>
                    <ol className="space-y-2 list-decimal pl-6 text-sm">
                        <li><strong>Exclusion by signature order.</strong> A buyer that signs first releases structs its recipients can complete alone; a buyer that signs last releases none. Signing last, and signing one answer, holds the buyer to one commitment of its choosing at every position (&sect;3.2).</li>
                        <li><strong>Two mechanisms, classified.</strong> The dispatch race is a posted-price mechanism with simultaneous solicitation, the class Hagerty and Rogerson (1987) identify with dominant strategies in bilateral trade. The request for quotes is what a buyer uses to discover a price the posted class cannot supply (&sect;&sect;4.1, 5.1).</li>
                        <li><strong>First price is forced.</strong> The winner is paid a field of the struct it signed, and the buyer, signing last and bound by no rule, completes the struct that pays least. A second-price rule needs a party that binds the buyer&rsquo;s choice, which is the venue (&sect;5.3).</li>
                        <li><strong>The participation constraint is a balance.</strong> Each draft states the cumulative value the candidate will be bonded against, so the quantity that decides participation is known in advance, depends on position, and rises with the candidate&rsquo;s own quote. A cheaper price at one position lowers the balance required at every later one (&sect;&sect;5.4, 5.5).</li>
                        <li><strong>Composition without awareness.</strong> A market layer whose only output is an object the mechanism already accepts inherits the mechanism&rsquo;s equilibrium without re-derivation, and the data the mechanism keeps cannot tell a raced commitment from one arranged by hand (&sect;6).</li>
                    </ol>
                </PaperSubsection>
            </PaperSection>

            <PaperSection title="2. The Setting">
                <PaperSubsection title="2.1 What the mechanism holds">
                    <p>
                        The mechanism beneath the market has two operations that move value, commitment and resolution, and no others. <em>Commitment</em> admits one order between a buyer and a seller. Its struct names the process the order extends (or none, when the order opens one), the buyer, the seller, and the denomination (the token every payment and bond of the process is counted in). It also names a payment <Math>{"P \\geq 1"}</Math>, the cumulative value <Math>{"G"}</Math> the process holds through this order, the merkle root of the order&rsquo;s agreement (a single hash committing to every clause of the agreement), a salt, and a deadline. The mechanism admits it only when two signatures over that one struct verify as those of the buyer and the seller it names. On admission it locks <Math>{"2P"}</Math> from the buyer and <Math>{"2G"}</Math> from the seller.
                    </p>
                    <p>
                        <em>Resolution</em> closes the whole process, and it is the buyer&rsquo;s judgment: only the buyer may call it, and every open order resolves together or none does. Each seller receives <Math>{"2G + P"}</Math> and the buyer <Math>{"P"}</Math> back per order, so each seller ends ahead by its payment and the buyer has paid exactly what it agreed. The agreement is the clauses composed for one order, each clause a reusable term registered publicly, with every field filled. The chain holds the agreement&rsquo;s merkle root, never its terms, and it tests no performance.
                    </p>
                    <p>
                        A <em>process</em> is the set of orders one buyer opens. The first commitment carries no process identifier, and admitting it opens a process named by that commitment&rsquo;s own content; every later commitment names the process and must name its buyer. The orders form a <em>process chain</em>: a sequence of commitments, each extending one cumulative value that only grows. An order&rsquo;s place in that chain is its position (&sect;1.2), which either opens the process or extends it. A process holds as many orders as the network can resolve in one transaction.
                    </p>
                    <p>
                        Two mechanisms compose in the mechanism, one at each operation. <em>Asymmetric bonding</em> bonds each order and scales the bond along the chain, since each seller bonds twice the value accumulated through its own order, the most a holdout there could keep. <em>Buyer dominance with atomic resolution</em> coordinates the sellers on the chain the bonds already cover: nobody is paid until the buyer resolves, so each seller holds a live interest in every other seller&rsquo;s performance. Four features of the mechanism are the ones this paper uses.
                    </p>
                    <PaperRun title="Two signatures, in no particular order.">
                        The mechanism verifies both signatures against one digest and imposes no order between them. Which side signs first is a convention of whatever produces the struct, never a rule of the mechanism. Any wallet holding both signatures may submit the commitment, because the mechanism checks the signatures and never the sender. Section 3 shows that this degree of freedom is where the market lives.
                    </PaperRun>
                    <PaperRun title="No revocation, one deadline.">
                        The mechanism has no operation that withdraws a signature: a commitment once signed is not revoked, and lapses unused past its deadline. A released signature stays admissible until the deadline inside its struct while two conditions hold: what the mechanism may draw from its signer&rsquo;s balance covers the bond, and the cumulative value the struct names still equals the process&rsquo;s running value plus the order&rsquo;s own payment. A signer can end its released signatures earlier by reducing what the mechanism may draw from its balance; the mechanism does not see the reduction, and it blocks every other commitment the signer has signed in that token. At an extending position the buyer also ends a released signature by committing any other order in the process, which advances the running value, or by resolving, which closes the process.
                    </PaperRun>
                    <PaperRun title="Orders are related only through their process.">
                        Each admitted order is identified by its content: two structs that differ anywhere, in the seller, the payment, or the salt, are two orders, and each order is admitted at most once. Orders that open different processes are related in no way. Orders in one process share one buyer, one denomination, one cumulative value, and one resolution. Each carries, as a signed field, the cumulative value the process is to hold once it joins, and the mechanism admits it only if that figure equals the running value plus the order&rsquo;s own payment: one cumulative figure is admissible per commitment. No counter is kept per signer.
                    </PaperRun>
                    <PaperRun title="One denomination per process, and a positive floor.">
                        A process is counted in one token, because the doubled schedule compares magnitudes and comparability is what lets it be checked from chain state alone. A payment of zero is refused. A market formed here inherits both: quotes within one solicitation are commensurable by construction, and a zero-priced answer cannot be expressed.
                    </PaperRun>
                </PaperSubsection>

                <PaperSubsection title="2.2 The equilibrium the argument uses">
                    <p>
                        The mechanism&rsquo;s equilibrium is a comparison over its transfers plus what a party retains off-chain, credited at the figures the parties signed. The retention term is the reason the schedule doubles: value passes off-chain, so a party that walks away keeps what it holds, and a bond equal to that value would be exactly canceled by the taking (Figaro 2026, Definition 7). Three comparisons follow, with the seller performing or holding out and the buyer resolving or withholding.
                    </p>
                    <ol className="space-y-2 list-decimal pl-6 text-sm">
                        <li><strong>After performance, the buyer resolves.</strong> Resolving ends at <Math>{"-2P + P + P = 0"}</Math>: it is refunded its bond less the payment, and it holds a delivery worth <Math>{"P"}</Math>. Never resolving ends at <Math>{"-2P + P = -P"}</Math>, its bond held against the delivery it keeps. This comparison needs no assumption about the seller.</li>
                        <li><strong>Given that plan, and given that its co-sellers perform, the seller performs.</strong> If the buyer resolves once performance has occurred and not before, and its co-sellers perform, performing ends at <Math>{"+P"}</Math>, and holding out ends at most at <Math>{"-2G + G = -G"}</Math>, since its bond stays locked and it keeps at most the cumulative value it withheld.</li>
                        <li><strong>Before performance, the buyer keeps the process open.</strong> Resolving at once is terminal at <Math>{"-P"}</Math>, with nothing delivered, while keeping the process open leads to performance by (2).</li>
                    </ol>
                    <p>
                        Comparisons (2) and (3) are each party&rsquo;s best reply to the other&rsquo;s plan, verified jointly, so cooperation is the equilibrium: a fixed point, not a dominance result. Figaro (2026, Theorems 1 and 3) proves the comparisons for two parties, where the profile is subgame-perfect, and for a process chain of any length the network resolves in one call. The proof assumes the following.
                    </p>
                    <ul className="space-y-2 list-disc pl-6 text-sm">
                        <li>The parties rank outcomes by these payoffs, at the figures both signed.</li>
                        <li>They know the schedule of transfers and the two operations.</li>
                        <li>They stand beyond each other&rsquo;s coercive reach.</li>
                        <li>Performance has no observer but the parties themselves, and the buyer&rsquo;s resolution is its own judgment of it.</li>
                        <li>Resolution is terminal and the buyer&rsquo;s alone; withholding is not terminal.</li>
                        <li>No clock runs once the bonds are locked.</li>
                        <li>Either party may adopt any plan at its nodes.</li>
                    </ul>
                    <p>
                        A shortfall is put right before the buyer resolves, because resolution is terminal and the mechanism has no path that reverses a payment. An outside forum may rule on a process&rsquo;s data while the process stands open, and it cannot call resolve. The comparison contains no term for what a party spends to perform. This paper adds a layer above the mechanism and adds nothing to that comparison; where it needs a party&rsquo;s capacity to trade, it uses the one quantity the mechanism contains, the balance a wallet can commit.
                    </p>
                </PaperSubsection>

                <PaperSubsection title="2.3 What a market has to add">
                    <p>
                        Roth (2008) names three things a market must accomplish before its allocation rule matters. It must be <em>thick</em>: enough participants on both sides that the match found is worth having. It must overcome <em>congestion</em>: participants must be able to make, receive, and evaluate enough offers in the time available. And it must be <em>safe</em>: acting straightforwardly must not expose a participant to exploitation for having done so.
                    </p>
                    <p>
                        Safety is two things that one institution usually supplies together. <em>Formation safety</em> means that answering a solicitation exposes the answerer to no more than the trade it answered for. <em>Performance safety</em> means that the counterparty, once matched, delivers. On a margined exchange, the exchange and the clearinghouse it mandates supply both, as one stack. Here they are separate: performance safety is the mechanism&rsquo;s, complete before any market exists, and the market layer supplies only formation safety. Thickness and congestion return in &sect;4.4 as the only two ways the race&rsquo;s outcome can fail to be stable.
                    </p>
                </PaperSubsection>

                <PaperSubsection title="2.4 The four roles a venue plays">
                    <p>
                        A venue between a solicitation and a binding commitment does four separable things. They are taken apart because the signatures on a commitment can do some of them and not others: &sect;3 takes them one at a time, and &sect;6.3 sets each against what the two mechanisms supply.
                    </p>
                    <ol className="space-y-2 list-decimal pl-6 text-sm">
                        <li><strong>Mutual exclusion.</strong> Soliciting <Math>{"k"}</Math> bids must not oblige the solicitor to <Math>{"k"}</Math> trades: at most one may bind.</li>
                        <li><strong>Discovery.</strong> A participant must learn who may be asked, and on what terms, without a prior relationship with each.</li>
                        <li><strong>An anti-reneging bond.</strong> A bid that costs nothing to make and nothing to abandon is weak evidence of availability, so a tender commonly takes a bid bond.</li>
                        <li><strong>Verifiable selection.</strong> A losing participant must be able to check that the announced rule was the rule applied.</li>
                    </ol>
                </PaperSubsection>

                <PaperSubsection title="2.5 What the results establish and what they assume">
                    <p>
                        The results of &sect;&sect;3 to 6 are mechanism-design results about formation: how one commitment comes to carry two signatures. They establish seven things.
                    </p>
                    <ol className="space-y-2 list-decimal pl-6 text-sm">
                        <li>A buyer signing last, and signing one answer, is held to one commitment of its choosing (Proposition 3.1).</li>
                        <li>The race&rsquo;s outcome is stable among the candidates that answered (Proposition 4.1).</li>
                        <li>A quote varies the price and nothing else (Proposition 5.1).</li>
                        <li>First price is forced (Proposition 5.2).</li>
                        <li>Participation turns on a balance the draft states (&sect;5.4).</li>
                        <li>A lower figure at one position weakly widens the set of candidates able to be committed there and at every later position (Proposition 5.3).</li>
                        <li>The commitment formed inherits the mechanism&rsquo;s equilibrium (Proposition 6.2).</li>
                    </ol>
                    <p>
                        Six of the seven are propositions proved here; the fifth is derived in &sect;5.4 from the mechanism&rsquo;s own arithmetic. All seven assume the following.
                    </p>
                    <ol className="space-y-2 list-decimal pl-6 text-sm">
                        <li><strong>Actors.</strong> One buyer and a finite set of candidates, each a wallet that signs for itself. No other party acts between the solicitation and the commitment.</li>
                        <li><strong>Information.</strong> The buyer observes the published terms of every candidate it solicits before it asks. Each candidate sees only its own draft, which states the payment, the cumulative value, and the deadline it would be bound by. A candidate&rsquo;s capacity, its cost of performing, and its beliefs about rivals are its own; they enter the incentive arguments of &sect;&sect;4.3 and 5.3 and no proposition.</li>
                        <li><strong>Timing.</strong> The buyer sends every draft of one solicitation at once, under one deadline. Answers arrive within a window the buyer sets and may close early, and the buyer signs one answer per position, save the fallback of &sect;5.4(4), a second signature after the first winner&rsquo;s commitment fails at admission. Positions are formed in commit order.</li>
                        <li><strong>Strategies.</strong> A race candidate answers or does not. A quote candidate names a figure between one unit and the ceiling, or does not answer. The buyer chooses <Math>{"k"}</Math>, the window, the ceiling, and which verified answer to sign, if any, and it is bound by no selection rule.</li>
                        <li><strong>External mechanisms.</strong> The profiles of the <em>members</em>, the wallets that have registered one publicly under a stake, read at the moment of solicitation (&sect;3.3); a channel that carries drafts and answers between the buyer and each candidate; and the mechanism, with the equilibrium of &sect;2.2. Nothing holds state between the solicitation and the commitment.</li>
                    </ol>
                    <p>
                        Discovery is an input to formation, and this paper does not supply it. Both mechanisms begin from a candidate set: the members whose published terms can price the position. How a buyer finds those members among many, filters them by the terms a complex job needs, and judges whether a declared catalog (the document a member publishes listing what it offers, and under which assemblies) is accurate lies outside the model. So does the cost of reading their published terms, which &sect;4.2 takes as zero.
                    </p>
                    <p>
                        The apparatus bears on scale in three places. Each further candidate costs the buyer one message, and the buyer is held to one commitment however many it asks (Proposition 3.1(b)). A losing answer costs its signer nothing, so a solicitation that many candidates lose moves no value and leaves no entry in the data (&sect;6.2). A job of many positions is formed one position at a time, each a separate solicitation in commit order, up to the orders the network can resolve in one transaction. Stability is established per position only (&sect;4.4), and each position&rsquo;s participation constraint depends on the figures committed before it (&sect;5.5).
                    </p>
                </PaperSubsection>
            </PaperSection>

            <PaperSection title="3. Signature Order as a Market Primitive">
                <PaperSubsection title="3.1 Three states of one artifact">
                    <p>
                        The three states of &sect;1.2 differ only in how many signatures the one object carries, and a <em>solicitation</em> is the set of drafts the buyer sends for one position. A draft, carrying none, is a complete commitment struct, every field filled, that nobody has signed. The mechanism will not admit it, and no recipient can make it admissible alone, so sending a draft is a communication and nothing more. A candidate checks that the draft names it, that the agreement attached hashes to the root the struct carries, and that the agreement&rsquo;s terms agree with the struct it would be bonded against, and refuses to answer otherwise.
                    </p>
                    <p>
                        An answer carries one signature, the candidate&rsquo;s. It binds its signer to exactly the trade in the struct, only if the buyer completes it, and only until the deadline inside it. It requires no balance to produce, because the mechanism locks nothing until a commitment is admitted. A candidate holding no tokens can answer, and its commitment fails at admission if it is selected while still unfunded.
                    </p>
                    <p>
                        A commitment carries both signatures and is the only state the mechanism has a name for. Producing it is the buyer&rsquo;s single act. That act is at once the selection of a counterparty and the formation of the obligation.
                    </p>
                </PaperSubsection>

                <PaperSubsection title="3.2 Exclusion by signature order">
                    <FormalBlock label="Proposition 3.1 (Exclusion by signature order).">
                        <p>
                            Let a buyer solicit <Math>{"k \\geq 2"}</Math> candidates for one position, sending candidate <Math>{"i"}</Math> a struct that names it as seller at payment <Math>{"P_i"}</Math>, the structs differing at least in the seller field.
                        </p>
                        <p>
                            <em>(a) Buyer-first, at an opening position.</em> If the structs carry no process identifier and the buyer signs each before sending it, each candidate can make its struct admissible alone, the mechanism relates the <Math>{"k"}</Math> resulting processes in no way, and the buyer can be held to all <Math>{"k"}</Math> commitments, with <Math>{"\\sum_{i} 2P_i"}</Math> locked from it.
                        </p>
                        <p>
                            <em>(a&prime;) Buyer-first, at an extending position.</em> If the structs name a process already open and each states the cumulative value the process holds now plus its own payment, at most one of the <Math>{"k"}</Math> can ever be admitted, whatever the buyer signed. The buyer is held to one commitment, and which one is decided by whichever commitment the network includes first.
                        </p>
                        <p>
                            <em>(b) Candidate-first.</em> If the structs go out unsigned and the buyer signs exactly one returned answer, then at either kind of position at most one commitment from the solicitation can ever be admitted, and it is the one the buyer chose.
                        </p>
                        <p>Premises, the model&rsquo;s axioms (&sect;2.1).</p>
                        <ol className="space-y-1 list-decimal pl-6 text-sm">
                            <li>Admission requires two signatures over one commitment, verifying as those of the buyer and the seller it names; the mechanism checks neither the sender nor the order of signing.</li>
                            <li>An opening order names its process by its own content: commitments that differ in any field open distinct processes, and each order is admitted at most once.</li>
                            <li>A commitment once signed is not revoked, and lapses unused past its deadline: a released signature stays admissible until the deadline it carries, while what the mechanism may draw from its signer&rsquo;s balance covers the bond.</li>
                            <li>One cumulative figure is admissible per commitment: an extending commitment is admitted only if its signed cumulative value equals the process&rsquo;s running value plus its own payment, and each admission raises the running value by its payment, at least one unit.</li>
                            <li>No per-signer counter exists, and the mechanism holds no notion of a solicitation and no state across processes.</li>
                        </ol>
                    </FormalBlock>
                    <Proof>
                        <em>Step 1 (case (a), from premises 1, 2, 3 and 5).</em> A candidate holding a buyer-signed commitment that names it supplies the second signature (premise 1). The <Math>{"k"}</Math> commitments differ in the seller field, so they open <Math>{"k"}</Math> distinct processes, and none is a repeat of another (premise 2). Nothing ends a released buyer signature before its deadline (premises 3 and 5), so all <Math>{"k"}</Math> may be admitted, and commitment <Math>{"i"}</Math> locks <Math>{"2P_i"}</Math> from the buyer.
                        {" "}<em>Step 2 (case (a&prime;), from premise 4).</em> The <Math>{"k"}</Math> rivals are drafted against one running value, and admitting any one advances that value by at least one unit. Each remaining rival&rsquo;s signed figure then disagrees with the running value plus its payment, and since the running value only grows, it disagrees at every later time. This exclusion is arithmetic: it does not depend on the rivals differing in any field, and the buyer cannot repair it by re-signing, because its signature covers the stale figure.
                        {" "}<em>Step 3 (case (b), from premise 1).</em> An unsigned draft is admissible for nobody, and an answer carries one of the two signatures admission requires. The buyer produces one signature over one commitment, so at most one commitment in the solicitation ever carries two, and it is the one the buyer signed.
                        {" "}<em>Conclusion.</em> Buyer-first can hold the buyer to all <Math>{"k"}</Math> commitments at an opening position, and holds it to the network&rsquo;s choice of one at an extending position; candidate-first admits at most one commitment from the solicitation at either kind of position, and it is the one the buyer chose. <span className="italic">&#9633;</span>
</Proof>
                    <PaperRemark title="What would refute Proposition 3.1, and what it covers.">
                        Under candidate-first, two commitments from one solicitation both admitted would refute part (b); two rivals at one extending position both admitted would refute part (a&prime;); and a mechanism satisfying the five premises that admitted fewer than all <Math>{"k"}</Math> buyer-signed openings would show part (a) overstates what the buyer is held to. The scope is one position and one solicitation, with balances sufficient to bond. The proposition says which commitments can be admitted, and nothing about which answer the buyer will choose.
                    </PaperRemark>
                    <p>
                        Of the four roles, mutual exclusion seems most obviously to require held state, and Proposition 3.1 shows it requires none. The two buyer-first cases fail differently. At an opening position, signing first multiplies the commitments the buyer can be held to by the size of its own search, since <Math>{"k"}</Math> released signatures are <Math>{"k"}</Math> commitments it can be held to. At an extending position the mechanism already excludes the rivals, so signing first costs the buyer its <em>selection</em>: the counterparty is whichever commitment the network includes first. Every position after the first is an extending one, so the second failure is the common one. Candidate-first answers both with one rule that need not know which kind of position it fills, which is why the same exchange of drafts runs at any position of a process chain.
                    </p>
                    <PaperRemark title="The buyer is held to one commitment, whatever k.">
                        Part <em>(b)</em> holds the buyer to one commitment for any <Math>{"k"}</Math>; each candidate&rsquo;s own position is the single trade it answered for. The bound mirrors the mechanism: the buyer is the only party who can close a process, and under candidate-first it is the only party who can complete a commitment. Neither power reaches another party&rsquo;s position, because a candidate that is not selected is left exactly as it was.
                    </PaperRemark>
                </PaperSubsection>

                <PaperSubsection title="3.3 The remaining three roles">
                    <PaperRun title="Discovery is a registry read, not an admission.">
                        The candidate set is derived at the moment of solicitation from the members (&sect;2.5), who register a profile with a stake so that others can find them. Registration is permissionless: the stake is in tokens and stays reclaimable, and withdrawing it removes the profile from view while leaving every admitted commitment intact. The buyer reads the members live and keeps those whose catalogs can price the position. The set is not a roster any party maintains, so an empty result means absence. What a candidate sells, and at what price, is its own declaration; which declaration is taken is the buyer&rsquo;s decision.
                    </PaperRun>
                    <PaperRun title="The answer carries its own bond.">
                        A tender takes a bid bond because a bid is otherwise cheap talk. Here the object a candidate signs to signal availability is the object that bonds it once the commitment is admitted. A candidate cannot signal availability more cheaply than by becoming bound on admission, because there is nothing else to send. A losing answer costs its signer nothing and needs no cancellation: it lapses at the deadline the buyer fixed in every draft of the solicitation. The member stake remains as a standing signal of seriousness, held once rather than per answer.
                    </PaperRun>
                    <PaperRun title="Selection is the buyer&rsquo;s own, under no announced rule.">
                        A sealed-bid venue must let a loser check the rule, because a loser in a committed mechanism has a claim if the rule was broken. Here the buyer is bound by no rule: the cheapest verified answer is a default, and the buyer may take any answer. A loser has nothing to audit and no claim to lose. The real cost is the incentive consequence of the buyer&rsquo;s non-commitment, which &sect;5.3 states.
                    </PaperRun>
                    <MarketFormationSwimlaneFigure className="my-8" />
                </PaperSubsection>
            </PaperSection>

            <PaperSection title="4. The Dispatch Race">
                <PaperSubsection title="4.1 Mechanism class">
                    <p>
                        In the dispatch race, the buyer builds one draft per candidate, priced at that candidate&rsquo;s published figure for the position, and sends the drafts out unsigned and at once. A candidate answers by countersigning its draft as it stands. The buyer accepts an answer only if it is the struct the buyer drafted, hash for hash, and only if the signature verifies against the terms as signed. Answers accumulate for a window the buyer chooses. At the close, the cheapest verified answer wins by default and ties break by arrival order; the buyer may instead take any answer, or close the window early.
                    </p>
                    <p>
                        The candidate makes no report. The price in its draft is the one it published before the solicitation existed, and its action set is <Math>{"\\{\\text{answer}, \\text{do not answer}\\}"}</Math>. The race is a posted-price mechanism with simultaneous solicitation and buyer-side selection: an assignment over an already-priced set, not an auction, since no participant submits a figure the allocation rule operates on.
                    </p>
                    <p>
                        Hagerty and Rogerson (1987) show that in bilateral trade the mechanisms that are dominant-strategy incentive compatible, individually rational, and budget balanced are posted-price mechanisms or randomizations over them. Their setting has a mediator computing the outcome from reports, and this one has none, so the result is recognized here more than applied. The race&rsquo;s clean incentives have the reason their theorem identifies: the terms of trade depend on no report. A market with no mediator is pushed toward posted prices at least as hard as a mediated one, since nobody is there to compute a report-dependent rule.
                    </p>
                </PaperSubsection>

                <PaperSubsection title="4.2 Where price discovery happens">
                    <p>
                        The race discovers no price, because the buyer has read every price before it asks anyone. It reads the published terms of every member that can price the position, sorts them, and solicits the cheapest <Math>{"k"}</Math>. What the race searches over is <em>availability</em> at those prices: whether the member with the lowest figure is willing and able to take this job now.
                    </p>
                    <p>
                        This is Stigler&rsquo;s (1961) fixed-sample search with the two unknowns exchanged. Stigler&rsquo;s buyer samples <Math>{"k"}</Math> sellers to learn prices and takes the lowest draw, trading the cost of one more query against the expected fall in the minimum. Here the prices are observed in full, and the sample buys the probability of finding the cheapest <em>available</em> candidate, in parallel rather than in sequence. Choosing <Math>{"k"}</Math> trades the cost of one more message against the risk that all <Math>{"k"}</Math> cheapest candidates are unavailable.
                    </p>
                    <p>
                        Price discovery happens at publication. A published figure is a standing, public, unilateral price statement, the kind of dispersed knowledge Hayek (1945) treats prices as conveying, and buyers observe the whole published set before they solicit. Diamond (1971) shows that with sequential search at any strictly positive cost, posted prices go to the monopoly price, because a buyer accepts a small overcharge rather than pay to check one more seller. The race removes that premise. Reading the published set sends no message to any candidate, and the model takes its cost as zero, an assumption &sect;2.5 bounds. Each further candidate costs one message, so the search cost is near zero where Diamond&rsquo;s argument needs it positive.
                    </p>
                    <PaperRemark title="Publication is not a commitment to trade.">
                        A candidate may decline any draft for any reason, and declining costs it nothing beyond the trade it declined. Publication commits a candidate to the terms on which it will be asked, as a catalog does, never to capacity. That is why the race can solicit widely without any candidate having reserved capacity for it.
                    </PaperRemark>
                </PaperSubsection>

                <PaperSubsection title="4.3 Incentives on both sides">
                    <PaperRun title="The candidate has nothing to shade.">
                        The draft is priced at the candidate&rsquo;s own figure, and the buyer accepts only that exact struct, so an answer that alters anything is discarded rather than negotiated. In the single-position problem, answering whenever the candidate is willing to perform the trade is weakly dominant: there is no rival behavior to condition on, no winner&rsquo;s curse since the price is its own, and no cost to losing. The problem omits capacity. A candidate with finite capacity holding several live answers is choosing among them, and declining is the only instrument the race gives it for that choice.
                    </PaperRun>
                    <PaperRun title="The buyer&rsquo;s award and contract are one event.">
                        In conventional procurement, award and contract are separate, and the interval between them is where requalification, renegotiation, and hold-up occur. Here the interval does not exist, because the buyer&rsquo;s single signature is both the selection and the commitment (&sect;3.1). The buyer cannot select and then reopen terms, since no state exists in which it has selected and not committed. It cannot commit at other terms either, since the winner&rsquo;s signature covers one struct and any other struct is a different object.
                    </PaperRun>
                    <PaperRun title="Timing rules favor the candidate.">
                        Roth and Ockenfels (2002) show that the ending rule matters: hard-close auctions attract last-moment bidding that soft-close auctions do not. The race closes hard on the buyer&rsquo;s clock, and nobody gains by arriving late, because a late answer cannot move the price and ties break by arrival order. The buyer&rsquo;s option to close early makes the window a maximum, so the buyer has no reason to wait out a market that has answered. In the unraveling literature (Roth and Xing 1994), exploding offers are how one side pressures the other into deciding early. Here the expiring object is the <em>candidate&rsquo;s</em> answer, at the one deadline fixed for the whole solicitation, and its expiry protects the candidate.
                    </PaperRun>
                </PaperSubsection>

                <PaperSubsection title="4.4 Stability, and the only two ways it fails">
                    <p>
                        The race allocates one position among candidates, which invites the matching question (Gale and Shapley 1962; Roth and Sotomayor 1990): is there a buyer and a candidate who would both rather be matched to each other than to what the race gave them? Such a pair is a <em>blocking pair</em>, and an outcome with none is <em>stable</em>.
                    </p>
                    <FormalBlock label="Proposition 4.1 (Stability within the responsive set).">
                        <p>
                            Fix one position, an invited set <Math>{"K"}</Math> with published prices <Math>{"\\{p_i\\}_{i \\in K}"}</Math> observed by the buyer before invitation, and a window. Let <Math>{"A \\subseteq K"}</Math> be the candidates whose verified answers arrive within it, and let the buyer apply the default rule, matching to <Math>{"w = \\arg\\min_{i \\in A} p_i"}</Math> with ties broken by arrival order. Then no blocking pair exists whose candidate lies in <Math>{"A"}</Math>. Every blocking pair involves a candidate outside <Math>{"K"}</Math> or in <Math>{"K \\setminus A"}</Math>.
                        </p>
                    </FormalBlock>
                    <Proof>
                        Suppose the buyer and some <Math>{"j \\in A"}</Math> form a blocking pair. Blocking requires the buyer to strictly prefer <Math>{"j"}</Math> to <Math>{"w"}</Math>, so <Math>{"p_j < p_w"}</Math>, which contradicts <Math>{"w = \\arg\\min_{i \\in A} p_i"}</Math>. If <Math>{"p_j = p_w"}</Math> the buyer is indifferent and the pair does not block strictly; if <Math>{"p_j > p_w"}</Math> the buyer does not prefer <Math>{"j"}</Math>. Any blocking candidate was therefore never invited or did not answer in time. <span className="italic">&#9633;</span>
                    </Proof>
                    <p>
                        The two residual sources of instability are Roth&rsquo;s (2008) first two market failures. A blocking candidate outside <Math>{"K"}</Math> is a <em>thickness</em> failure: the market was there and the buyer did not reach it. A blocking candidate in <Math>{"K \\setminus A"}</Math> is a <em>congestion</em> failure: the buyer reached it and the answer came too late. Both <Math>{"k"}</Math> and the window are the buyer&rsquo;s choice for one transaction, stored nowhere, so a buyer buys thickness at <Math>{"k"}</Math> messages and less congestion at the price of waiting. Stability is parameterized entirely by the party that bears the cost of each parameter.
                    </p>
                    <p>
                        The proposition has two limits. Under the buyer&rsquo;s override the outcome is stable with respect to the preference the override expresses, provided it is complete over <Math>{"A"}</Math>, and the proof goes through with <Math>{"p"}</Math> replaced by that preference&rsquo;s index. It is also a one-position result: a buyer filling several positions runs the races in sequence, each winner entering the next race&rsquo;s inputs, and a sequence of stable one-position matches is not in general a stable many-to-many match.
                    </p>
                </PaperSubsection>
            </PaperSection>

            <PaperSection title="5. The Request for Quotes">
                <PaperSubsection title="5.1 Mechanism class">
                    <p>
                        The request for quotes is the race with one inversion: the candidate sets the price. A buyer reaches for it when the job is particular and no published figure fits. If candidates publish a priceable item whose figure does not fit, the buyer solicits the same set it would have raced and asks for a re-price within a ceiling. If nothing published fits, the buyer names its counterparty and asks it for a quote directly. The analysis below is the same for both routes.
                    </p>
                    <p>
                        The buyer builds its draft at its <em>ceiling</em>, the highest figure it will pay, written into the agreement at the fields the buyer names as priced. A candidate answers with a counter-draft that applies the same substitution at its own figure, with the payment and the cumulative value it will be bonded against re-derived from that figure. The buyer verifies by <em>reconstruction</em>: it applies the substitution to its own draft at the figure the reply names, requires a match hash for hash, and checks the ceiling and the positive floor against its own copy. The cheapest verified quote wins by default, the buyer may take another, and the buyer signs exactly one.
                    </p>
                    <p>
                        In form this is a sealed-bid first-price procurement auction with an announced reserve. It is sealed, because each candidate sees only its own draft and nothing holds the quotes that could reveal them. It is first-price, because the winner is paid the figure it named (&sect;5.3). The reserve is the ceiling, and it binds, because a quote above it fails reconstruction and is discarded.
                    </p>
                    <PaperRemark title="The ceiling binds because it is disclosed.">
                        The ceiling is a field of the struct every candidate receives, and that is why a quote above it cannot survive verification. In optimal-auction theory the reserve is likewise announced as part of the rules the auctioneer commits to, set against the distribution of bidders&rsquo; types (Myerson 1981; Riley and Samuelson 1981). What differs here is that the ceiling is the only rule the buyer is bound by. An announced reserve draws quotes toward it as competition thins, and with one invited candidate a quote at the ceiling is the obvious play. The buyer&rsquo;s defenses are the ones in its hands: an honest ceiling and more candidates. The race reveals nothing about what the buyer would pay, since its drafts carry the candidates&rsquo; own figures.
                    </PaperRemark>
                    <p>
                        In one respect the quote leg is nearer a negotiation than an auction: the buyer is not bound to award, and may decline every answer. Bulow and Klemperer (1996) show that a seller does better with an auction without a reserve and with one additional bidder than with a negotiation among the original bidders in which it may choose the best mechanism. Their auction is one whose allocation rule the auctioneer commits to. Here the buyer commits to the ceiling and to nothing else: it may take a quote that is not the lowest, or none. Bajari, McMillan, and Tadelis (2009) find that auctions have limits in complex projects with incomplete designs and few bidders, and that they discourage communication between buyer and contractor about the design. Those are the jobs for which a buyer reaches for a quote leg, so the quote leg has an auction&rsquo;s form and leaves the buyer as free not to award as a negotiation does. What it does not share with a negotiation is the terms: a seller&rsquo;s answer fills only the price fields the buyer&rsquo;s request names, and no term is negotiated.
                    </p>
                </PaperSubsection>

                <PaperSubsection title="5.2 A quote moves the price and nothing else">
                    <FormalBlock label="Proposition 5.1 (Price-only variation).">
                        <p>
                            Let the buyer&rsquo;s request be a draft <Math>{"D"}</Math> built at ceiling <Math>{"\\bar{q}"}</Math> over a set of priced fields <Math>{"F"}</Math> named by the buyer, and let <Math>{"\\sigma(D, F, q)"}</Math> denote the substitution that writes <Math>{"q"}</Math> at every field of <Math>{"F"}</Math> and re-derives the payment, the cumulative value, and the agreement&rsquo;s merkle root accordingly. A reply <Math>{"R"}</Math> naming figure <Math>{"q"}</Math> is accepted only if <Math>{"1 \\leq q \\leq \\bar{q}"}</Math> and <Math>{"R"}</Math> is identical to <Math>{"\\sigma(D, F, q)"}</Math> as a struct, with its attached agreement hashing to that struct&rsquo;s root and its signature verifying, against the terms as signed, as that of the candidate the buyer drafted against. Consequently a reply differing from <Math>{"D"}</Math> in any respect not determined by <Math>{"q"}</Math> through <Math>{"\\sigma"}</Math> is rejected.
                        </p>
                    </FormalBlock>
                    <Proof>
                        The buyer never reads <Math>{"R"}</Math> to learn what changed. It computes <Math>{"\\sigma(D, F, q)"}</Math> from its own retained <Math>{"D"}</Math>, taking from <Math>{"R"}</Math> only the scalar <Math>{"q"}</Math>, and compares struct hashes. Struct-hash equality is equality in every field, including the parties, the denomination, the salt, the deadline, and the agreement&rsquo;s root. The check that <Math>{"R"}</Math>&rsquo;s attached agreement hashes to that root extends the equality from the struct to the terms, and the signature is verified against the buyer&rsquo;s reconstruction, so a signature over any other struct fails. The bounds on <Math>{"q"}</Math> are evaluated against <Math>{"D"}</Math>, which the reply cannot influence. <span className="italic">&#9633;</span>
                    </Proof>
                    <p>
                        Reconstruction is what makes a quote comparable to the request it answers. The priced set <Math>{"F"}</Math> is the buyer&rsquo;s. A candidate cannot enlarge it by returning a reply that moves more, because that reply would not reconstruct, so a quote is a scalar answer to the buyer&rsquo;s question and quotes from different candidates are commensurable. The comparison is by reconstruction rather than by difference, for a reason of substance. A check by difference must list what may differ and is wrong when the list is incomplete; a check by reconstruction is one equality and has no list. The mechanism identifies orders by content for the same reason.
                    </p>
                </PaperSubsection>

                <PaperSubsection title="5.3 First price is forced">
                    <p>
                        Vickrey (1961) showed that paying the winner the second-best figure makes truthful reporting a dominant strategy, and Klemperer (1999) surveys the theory built on that result. The objections recalled in &sect;1.1 are about trusting the party that runs the auction. The obstacle here is structural, and it lies with the buyer.
                    </p>
                    <FormalBlock label="Proposition 5.2 (First price is forced).">
                        <p>
                            No rule paying the winner a figure computed from other candidates&rsquo; reports is implementable unless some party other than the buyer can bind the buyer&rsquo;s choice of which struct to complete, or can supply a signature without its signer.
                        </p>
                        <p>Premises, the model&rsquo;s axioms (&sect;&sect;2.1, 3.2).</p>
                        <ol className="space-y-1 list-decimal pl-6 text-sm">
                            <li>The only admissible object is a commitment both parties sign.</li>
                            <li>The winner is paid the payment field of the admitted commitment, and the mechanism transfers no other figure to it.</li>
                            <li>A signature counts only when it verifies under its signer&rsquo;s own key.</li>
                            <li>A commitment once signed is not revoked, and lapses unused past its deadline, so every struct the winner has signed stays available to the buyer until its deadline.</li>
                            <li>The buyer signs last and is bound by no rule in choosing which answer to complete (candidate-first, Proposition 3.1(b)).</li>
                        </ol>
                    </FormalBlock>
                    <Proof>
                        Let the winner have answered at <Math>{"q_1"}</Math> and let the rule prescribe <Math>{"q_2 \\neq q_1"}</Math>, computed from rival reports. <em>Step 1 (the payment needs its own struct, from premises 1 and 2).</em> Paying <Math>{"q_2"}</Math> requires an admitted struct whose payment field is <Math>{"q_2"}</Math>, and a signature over the struct at <Math>{"q_1"}</Math> does not cover it. <em>Step 2 (the winner&rsquo;s options).</em> The winner may sign a struct at <Math>{"q_2"}</Math> after the reports are known, and if <Math>{"q_2 < q_1"}</Math> it may decline, which makes the rule a fresh request rather than an allocation rule. It may also sign in advance a ladder of structs at several figures, each of which stays available (premise 4). <em>Step 3 (the buyer completes the cheapest, from premise 5).</em> Either way the buyer, signing last and bound by no rule, completes among the structs the winner has signed the one that pays least, so the winner&rsquo;s lowest signed figure is its bid and its payment, which is first price. <em>Step 4 (who could enforce <Math>{"q_2"}</Math>, from premise 3).</em> A payment of <Math>{"q_2"}</Math> in every profile of reports therefore needs a party that binds the buyer&rsquo;s choice, or one that supplies a party&rsquo;s signature without it; a signature counts only under its signer&rsquo;s key, so either party holds power over a key not its own, and that party is the venue. <em>Conclusion.</em> No rule paying the winner a figure computed from other candidates&rsquo; reports is implementable unless some party other than the buyer can bind the buyer&rsquo;s choice of which struct to complete, or can supply a signature without its signer. <span className="italic">&#9633;</span>
</Proof>
                    <PaperRemark title="What would refute Proposition 5.2, and what it covers.">
                        The proposition is refuted by a second-price quote leg built under the five premises in which no party but the buyer binds the buyer&rsquo;s choice and no signature is supplied without its signer. Its scope is implementability on the quote leg, one position at a time; it makes no claim about efficiency, and the race, which has no report, lies outside it.
                    </PaperRemark>
                    <p>
                        The proposition is a cost. The quote leg is not strategy-proof and cannot be made so within the design: a candidate&rsquo;s best quote depends on its beliefs about rival quotes and about the ceiling, as in first-price sealed bidding (Milgrom and Weber 1982; Klemperer 1999). The impossibility is this proposition&rsquo;s, and it is narrower than the classical one. Gibbard (1973) and Satterthwaite (1975) show that every non-dictatorial rule over at least three outcomes and unrestricted preferences is manipulable; procurement with quasilinear payoffs is a restricted domain, and there the Vickrey rule is strategy-proof. What excludes it here is that the buyer cannot commit to it. The race has dominant strategies because it has no report, the quote leg discovers price because it has one, and the design cannot have both: <em>strategy-proofness on the quote leg is the price of having no venue</em>.
                    </p>
                    <p>
                        Can the buyer shop the bids, taking one round&rsquo;s quotes as information and re-soliciting at a lower ceiling, so that candidates shade their first quotes? It can, being bound by no rule; this is the incentive consequence &sect;3.3 names, and a candidate&rsquo;s best quote depends on its beliefs about the buyer&rsquo;s conduct as well as its rivals&rsquo;. Each answer lapses at the solicitation&rsquo;s deadline, and a second round is a fresh solicitation each candidate may decline.
                    </p>
                    <PaperRemark title="The efficiency question is not asked.">
                        Myerson and Satterthwaite (1983) show that no mechanism for bilateral trade under two-sided private information is at once efficient, individually rational, and budget balanced. Their result is about valuations and costs. The mechanism&rsquo;s game is over payments and bonds, with retained value credited at the figures the parties signed, and the market layer adds a quote, a figure a candidate names. We make no efficiency claim. What the two mechanisms supply is feasibility: keeping its word is each trading party&rsquo;s best reply while the others keep theirs, and soliciting a candidate costs one message.
                    </PaperRemark>
                </PaperSubsection>

                <PaperSubsection title="5.4 The participation constraint is a balance">
                    <p>
                        Procurement theory places the bidder&rsquo;s participation constraint in an unobservable private type: the bidder takes part when the price it expects to win at covers what performing is worth to it. The constraint that governs participation here is a quantity the mechanism contains, and it has four properties that shape the market. A draft states the cumulative value <Math>{"G"}</Math> through the candidate&rsquo;s order, and the mechanism locks <Math>{"2G"}</Math> from the candidate when the commitment is admitted. On the quote leg, if the position follows a cumulative value <Math>{"V_0"}</Math> and the candidate quotes <Math>{"q"}</Math>, then <Math>{"G = V_0 + q"}</Math> and the requirement is <Math>{"2(V_0 + q)"}</Math>. Let <Math>{"\\beta"}</Math> be what the mechanism may draw from the candidate&rsquo;s balance in the process&rsquo;s denomination. The candidate can be committed only where
                    </p>
                    <p className="text-center">
                        <Math display>{"2(V_0 + q) \\leq \\beta \\quad \\Longleftrightarrow \\quad q \\leq \\tfrac{1}{2}\\beta - V_0 ."}</Math>
                    </p>
                    <ol className="space-y-2 list-decimal pl-6 text-sm">
                        <li><strong>It is stated in the request.</strong> The draft names <Math>{"G"}</Math>, so a candidate knows the exact balance a commitment will require before it answers. The quantity that decides whether it <em>can</em> participate is common knowledge between the two parties at solicitation, where a participation constraint is usually private.</li>
                        <li><strong>It binds from above, jointly with the ceiling.</strong> The effective cap on a quote is <Math>{"\\min\\{\\bar{q},\\; \\tfrac{1}{2}\\beta - V_0\\}"}</Math>, and each unit of quote raises the required balance by two units. Public-works procurement also couples ask and bond, since it commonly sets the performance bond as a share of the contract price. The coupling here differs in kind: the bond is the candidate&rsquo;s own locked balance, at twice the cumulative value through its order, refunded whole at resolution, where a performance bond is a surety&rsquo;s promise.</li>
                        <li><strong>It depends on position.</strong> <Math>{"V_0"}</Math> enters additively, so the same quote at a deeper position requires a larger balance. Depth filters the candidate set by balance, and a market can be thin at a late position while the same members are plentiful at an early one.</li>
                        <li><strong>It is checked at admission, not at answering.</strong> Answering requires a signature and no balance, and a losing quote leaves its signer untouched. An unfunded winner&rsquo;s commitment fails at admission, which costs one solicitation time and moves no tokens. Is an answer a free option, since a selected candidate can reduce what the mechanism may draw from its balance and let the commitment fail at no cost to itself? It is, until admission, and its cost falls on the buyer as time: the buyer signs the next verified answer, and the failed admission moves no tokens. The option lasts only until the deadline the buyer fixed for the whole solicitation. That fallback is a second buyer signature, and any wallet holding both signatures may submit it until the deadline. The first commitment also stays admissible until that same deadline, should its signer fund it. At an extending position the mechanism admits at most one of the two, whichever the network includes first; at an opening position it may admit both.</li>
                    </ol>
                    <p>
                        Competition cannot run on the size of the bond. Every candidate is bonded on the one schedule, twice the cumulative value through its order, and neither side can offer the bond as a term. Competition runs on price and on the non-price terms the buyer put in the draft.
                    </p>
                </PaperSubsection>

                <PaperSubsection title="5.5 Competition upstream widens the market downstream">
                    <FormalBlock label="Proposition 5.3 (Downstream widening).">
                        <p>
                            Let a process chain have payments <Math>{"P_1, \\ldots, P_n"}</Math> in commitment order, so that the cumulative value through order <Math>{"i"}</Math> is <Math>{"G_i = \\sum_{j \\leq i} P_j"}</Math> and the balance required at position <Math>{"i"}</Math> is <Math>{"2G_i"}</Math>. Suppose formation at position <Math>{"m"}</Math> returns a figure lower by <Math>{"\\delta > 0"}</Math> than the alternative, with every other payment unchanged. Then for every <Math>{"i \\geq m"}</Math> the balance required at position <Math>{"i"}</Math> falls by <Math>{"2\\delta"}</Math>, and the set of candidates able to be committed at position <Math>{"i"}</Math> weakly expands. Positions with <Math>{"i < m"}</Math> are unaffected.
                        </p>
                    </FormalBlock>
                    <Proof>
                        <Math>{"G_i"}</Math> is a sum over <Math>{"j \\leq i"}</Math>, and <Math>{"m \\leq i"}</Math>, so reducing <Math>{"P_m"}</Math> by <Math>{"\\delta"}</Math> reduces <Math>{"G_i"}</Math> by <Math>{"\\delta"}</Math> and <Math>{"2G_i"}</Math> by <Math>{"2\\delta"}</Math>. The constraint at position <Math>{"i"}</Math> is <Math>{"2G_i \\leq \\beta"}</Math>; relaxing its left side weakly enlarges the set of balances satisfying it. Positions with <Math>{"i < m"}</Math> are unaffected, <Math>{"G_i"}</Math> not depending on <Math>{"P_m"}</Math>. <span className="italic">&#9633;</span>
                    </Proof>
                    <p>
                        A price agreed at one position reaches the participation constraint at every later one, because the bond at each order is keyed to the cumulative value through it. A buyer&rsquo;s search at one position is therefore more than a private saving. It lowers the balance the winner must hold and the balance every later seller must hold, so it weakly widens the set of candidates able to be committed at that position and at every one after it, where &sect;5.4(3) located the scarcity. Whether a wider set draws more answers is conduct the proposition does not model. The effect runs one way, from a position to itself and the positions after it, and it follows from the cumulative value being a running sum in commit order, so the same reduction at an earlier position relieves more of the positions after it than at a later one. The same running sum also excludes rival drafts once one of them commits, by Proposition 3.1<em>(a&prime;)</em>, so one figure both sizes the bond and closes the position.
                    </p>
                </PaperSubsection>
            </PaperSection>

            <PaperSection title="6. Composing with a Market-Blind Mechanism">
                <PaperSubsection title="6.1 Interface minimality">
                    <FormalBlock label="Definition 6.1 (Interface-minimal market layer).">
                        <p>
                            A market layer over a mechanism <Math>{"\\mathcal{M}"}</Math> is <em>interface-minimal</em> if its entire output is an object <Math>{"\\mathcal{M}"}</Math> already accepts, formed only from inputs the parties themselves supply, and if <Math>{"\\mathcal{M}"}</Math>&rsquo;s acceptance of that object is conditioned on nothing the market layer did.
                        </p>
                    </FormalBlock>
                    <p>
                        Interface minimality is the composition property that lets a market be added to a mechanism whose guarantees were established without one, and both mechanisms have it. Their output is a commitment with both signatures, the object the mechanism accepted before any market existed. Their inputs are the parties&rsquo; signatures and published terms. Admission turns on the struct, the two signatures, and what the mechanism may draw from the two parties&rsquo; balances, never on how the struct was found.
                    </p>
                    <FormalBlock label="Proposition 6.2 (No re-derivation).">
                        <p>
                            If a market layer is interface-minimal, then every equilibrium property of <Math>{"\\mathcal{M}"}</Math> holds unchanged for the commitments it forms.
                        </p>
                    </FormalBlock>
                    <Proof>
                        <Math>{"\\mathcal{M}"}</Math>&rsquo;s game begins at an admitted commitment. Its payoffs are the transfers <Math>{"\\mathcal{M}"}</Math> executes plus the value each party retains, credited at the figures in the signed struct. Interface minimality leaves the admitted object, the figures it carries, and the conditions of its admission unchanged, and adds no transfer. The game, its comparisons, and hence its equilibria are the same objects. <span className="italic">&#9633;</span>
                    </Proof>
                    <p>
                        The proposition is nearly a tautology, and its contrapositive is the useful part. A market layer that holds a bid bond adds a transfer; one that can move a party&rsquo;s locked tokens changes the conditions of admission or of resolution; one that requires the mechanism to know a solicitation happened changes the acceptance condition. The commitments each of these forms do not inherit the mechanism&rsquo;s equilibrium, and each design must earn its own equilibrium argument, about a different mechanism.
                    </p>
                </PaperSubsection>

                <PaperSubsection title="6.2 What the data holds">
                    <p>
                        The mechanism keeps the commitments it admitted, the bonds, the cumulative value, and the resolution that closed the process. It keeps nothing about the solicitation, the candidates, the answers not taken, or whether a market was consulted at all. A commitment formed by racing a dozen candidates and one arranged between two parties who have traded for years are the same object in the data.
                    </p>
                    <p>
                        The benefit is that nothing needs reconciling. Losing answers moved no value, so they leave no entry and no refund. A party reconstructing a process from the data obtains every transfer that occurred, because the transfers that occurred are exactly those of the commitments admitted.
                    </p>
                    <p>
                        The cost is that the data does not evidence the selection. A buyer that must later show <em>how</em> it chose, to a counterparty, an auditor, or a forum ruling on the process while it stands open, can do so only by an attestation. A party attests for itself, so the buyer signs the attestation; it is bound to a clause the winning order&rsquo;s signed agreement carries, and it can be given only while the process is open. The chain checks that the attestation is signed and bound, never that it is true. Such an attestation observes the selection and never takes part in it, which keeps it outside Proposition 6.2&rsquo;s contrapositive.
                    </p>
                </PaperSubsection>

                <PaperSubsection title="6.3 What a venue would cost, and what its absence forbids">
                    <p>
                        The trade-off can be stated property by property. The table sets each property a market design asks for against what the two mechanisms supply when no venue holds the authoritative state, with the result that establishes it. The four roles of &sect;2.4 are among its rows, and for three of them a venue contract would add little and cost something specific.
                    </p>
                    <PaperScroll className="my-4">
                        <table className="text-sm border-collapse">
                            <thead>
                                <tr>
                                    {["Property", "Without a venue", "Where"].map((h) => (
                                        <th key={h} className="border border-default px-3 py-1.5 text-left font-semibold text-ink-heading">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td className="border border-default px-3 py-1.5">Mutual exclusion</td>
                                    <td className="border border-default px-3 py-1.5">Held: a buyer signing last, and signing one answer, is held to one commitment of its choosing at every position. A venue contract would have to hold or constrain a signature that is never in circulation.</td>
                                    <td className="border border-default px-3 py-1.5">Proposition 3.1</td>
                                </tr>
                                <tr>
                                    <td className="border border-default px-3 py-1.5">Formation safety</td>
                                    <td className="border border-default px-3 py-1.5">Held: an answer exposes its signer to the one trade it answered for, and to nothing the buyer can enlarge.</td>
                                    <td className="border border-default px-3 py-1.5">&sect;3.2, Remark</td>
                                </tr>
                                <tr>
                                    <td className="border border-default px-3 py-1.5">Anti-reneging bond</td>
                                    <td className="border border-default px-3 py-1.5">Held in part, without a bid bond: the answer bonds its signer once the commitment is admitted, and a losing answer costs its signer nothing; a selected candidate that reduces what the mechanism may draw from its balance before admission fails the commitment at no cost to itself. A venue&rsquo;s bid bond would price that withdrawal by giving the candidate&rsquo;s calculation a position the mechanism&rsquo;s equilibrium does not cover, and losing would stop being free.</td>
                                    <td className="border border-default px-3 py-1.5">&sect;&sect;2.1, 3.3, 5.4(4); Proposition 6.2</td>
                                </tr>
                                <tr>
                                    <td className="border border-default px-3 py-1.5">Discovery</td>
                                    <td className="border border-default px-3 py-1.5">Held as a read of the members, where an empty result means absence. A venue&rsquo;s list is a roster, where an entry means admission by someone and an empty result means the roster is incomplete. Discovery at scale is outside the model.</td>
                                    <td className="border border-default px-3 py-1.5">&sect;&sect;2.5, 3.3</td>
                                </tr>
                                <tr>
                                    <td className="border border-default px-3 py-1.5">No interval between award and contract</td>
                                    <td className="border border-default px-3 py-1.5">Held: no state exists in which the buyer has selected and not committed, so terms cannot be reopened.</td>
                                    <td className="border border-default px-3 py-1.5">&sect;4.3</td>
                                </tr>
                                <tr>
                                    <td className="border border-default px-3 py-1.5">Stability</td>
                                    <td className="border border-default px-3 py-1.5">Held for the race at one position, among the candidates that answered, under the default rule or any override complete over them; the residual failures are thickness and congestion, priced by the buyer&rsquo;s own <Math>{"k"}</Math> and window. No stability result is stated for the request for quotes.</td>
                                    <td className="border border-default px-3 py-1.5">Proposition 4.1</td>
                                </tr>
                                <tr>
                                    <td className="border border-default px-3 py-1.5">Commensurable quotes</td>
                                    <td className="border border-default px-3 py-1.5">Held: a quote moves the price and nothing else.</td>
                                    <td className="border border-default px-3 py-1.5">Proposition 5.1</td>
                                </tr>
                                <tr>
                                    <td className="border border-default px-3 py-1.5">Participation known in advance</td>
                                    <td className="border border-default px-3 py-1.5">Held: the balance a commitment requires is stated in the draft.</td>
                                    <td className="border border-default px-3 py-1.5">&sect;5.4</td>
                                </tr>
                                <tr>
                                    <td className="border border-default px-3 py-1.5">The mechanism&rsquo;s equilibrium for the commitments formed</td>
                                    <td className="border border-default px-3 py-1.5">Held: inherited without re-derivation.</td>
                                    <td className="border border-default px-3 py-1.5">Proposition 6.2</td>
                                </tr>
                                <tr>
                                    <td className="border border-default px-3 py-1.5">Verifiable selection</td>
                                    <td className="border border-default px-3 py-1.5">Lost: the buyer is bound by no rule, so a loser has nothing to audit.</td>
                                    <td className="border border-default px-3 py-1.5">&sect;3.3</td>
                                </tr>
                                <tr>
                                    <td className="border border-default px-3 py-1.5">Second-price payment; a strategy-proof quote leg</td>
                                    <td className="border border-default px-3 py-1.5">Impossible: first price is forced.</td>
                                    <td className="border border-default px-3 py-1.5">Proposition 5.2</td>
                                </tr>
                                <tr>
                                    <td className="border border-default px-3 py-1.5">Selection evidenced in the data</td>
                                    <td className="border border-default px-3 py-1.5">Absent: the data cannot tell a raced commitment from one arranged by hand, and the buyer shows how it chose only by its own attestation.</td>
                                    <td className="border border-default px-3 py-1.5">&sect;6.2</td>
                                </tr>
                                <tr>
                                    <td className="border border-default px-3 py-1.5">Stability across several positions</td>
                                    <td className="border border-default px-3 py-1.5">Not established: a sequence of stable one-position matches is not in general a stable many-to-many match.</td>
                                    <td className="border border-default px-3 py-1.5">&sect;4.4</td>
                                </tr>
                                <tr>
                                    <td className="border border-default px-3 py-1.5">Efficiency</td>
                                    <td className="border border-default px-3 py-1.5">Not claimed.</td>
                                    <td className="border border-default px-3 py-1.5">&sect;5.3, Remark</td>
                                </tr>
                            </tbody>
                        </table>
                    </PaperScroll>
                    <p>
                        Verifiable selection is the one role lost. A venue could make the buyer&rsquo;s rule binding and checkable, which would buy the commitment Proposition 5.2 shows to be otherwise unavailable. Its cost is a party with authority over which of several bonded parties becomes obliged.
                    </p>
                    <p>
                        Two asymmetries decide the balance. The role a venue adds limits the buyer&rsquo;s ability to make promises to candidates, never a candidate&rsquo;s safety: an answering candidate is exposed to its own answer and to nothing the buyer can enlarge. And the choice is reversible in one direction only. A venue can later compose alongside an interface-minimal market, taking as inputs what the parties already exchange; a market built around a venue cannot have it removed without redesigning the exchange from the signature order up. Beginning without one is the reversible choice.
                    </p>
                </PaperSubsection>
            </PaperSection>

            <PaperSection title="7. Conclusion">
                <p>
                    A venue&rsquo;s first three roles need no venue when the object exchanged during formation is the commitment itself, signed in a chosen order. Exclusion follows from the buyer signing last, and the anti-reneging bond is, in part, the answer, which bonds its signer once admitted. Discovery of the candidate set is a read of a permissionless registry, though finding candidates at scale lies outside the model. The fourth role, commitment to an allocation rule, is lost, and the loss is exact: the buyer completes the struct that pays least, so first price is forced. The dispatch race and the request for quotes sit on either side of that trade. The race searches over availability and asks for no report, so in the single-position problem answering is weakly dominant for a candidate willing to perform. The request for quotes discovers price at the cost of strategy-proofness and of a disclosed ceiling. Both produce only what the mechanism already accepts. Keeping its word is therefore each trading party&rsquo;s best reply while the others keep theirs, by an equilibrium proved for the mechanism alone without reference to how they found each other (Figaro 2026). Asking each candidate cost one message.
                </p>
            </PaperSection>
        </PaperLayout>
    );
}
