import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import {
    PaperLayout,
    PaperSection,
    PaperSubsection,
    PaperRun,
    PaperRemark,
} from "@/components/papers/PaperLayout";
import { Math } from "@/components/papers/Math";
import { MarketFormationSwimlaneFigure } from "@/components/figures/MarketFormationSwimlaneFigure";

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
            date="August 2026"
            watermark="Figaro Protocol · Preprint"
            abstract={
                <>
                    <p>
                        An exchange, an auction house, a procurement portal and a dispatcher each hold state between the moment a bid is solicited and the moment it binds. That held state does four jobs. It lets at most one of the competing bids bind, it tells a participant whom it may ask, it makes reneging costly, and it lets a loser check the selection. A venue contract on a public chain would do the same four jobs, and it would hold a position no party bonded, outside the analysis that makes resolution safe.
                    </p>
                    <p>
                        We study formation over a commit-and-resolve mechanism, the Core, which admits a commitment on two signatures over one struct and has each party lock a bond against its own defection. Two formation mechanisms are analyzed. In the <em>dispatch race</em>, the buyer drafts one unsigned commitment per candidate at that candidate&rsquo;s published price, candidates countersign to answer, and the buyer signs one. In the <em>request for quotes</em>, the draft goes out at the buyer&rsquo;s ceiling, each candidate returns it re-priced, and the buyer verifies a reply by rebuilding its own draft at the quoted figure. The race is a posted-price mechanism that searches over availability, not price. The request for quotes has the form of a sealed-bid first-price procurement auction with an announced reserve, and the commitment structure of a negotiation.
                    </p>
                    <p>
                        Three results carry the argument. A buyer that signs last is held to exactly one commitment, and chooses which, however many candidates it solicited. First price is forced, because the buyer signs last, is bound by no rule, and completes the struct that pays least. The participation constraint is a balance: the draft states the figure the candidate will be bonded against, so whether it can take part is known in advance and rises with its own quote. A market layer whose only output is a commitment the Core already accepts inherits the Core&rsquo;s equilibrium unchanged, and the data the Core keeps is silent about how the pair was found.
                    </p>
                </>
            }
            references={
                <>
                    <li>Ausubel, L. M. &amp; Milgrom, P. The Lovely but Lonely Vickrey Auction. In P. Cramton, Y. Shoham, &amp; R. Steinberg (eds.), <em>Combinatorial Auctions</em>, pp. 17&ndash;40. MIT Press, Cambridge, MA, 2006.</li>
                    <li>Bajari, P., McMillan, R., &amp; Tadelis, S. Auctions Versus Negotiations in Procurement: An Empirical Analysis. <em>Journal of Law, Economics, and Organization</em>, 25(2):372&ndash;399, 2009.</li>
                    <li>Bulow, J. &amp; Klemperer, P. Auctions Versus Negotiations. <em>American Economic Review</em>, 86(1):180&ndash;194, 1996.</li>
                    <li>Diamond, P. A. A Model of Price Adjustment. <em>Journal of Economic Theory</em>, 3(2):156&ndash;168, 1971.</li>
                    <li>Gale, D. &amp; Shapley, L. S. College Admissions and the Stability of Marriage. <em>American Mathematical Monthly</em>, 69(1):9&ndash;15, 1962.</li>
                    <li>Gibbard, A. Manipulation of Voting Schemes: A General Result. <em>Econometrica</em>, 41(4):587&ndash;601, 1973.</li>
                    <li>Hagerty, K. M. &amp; Rogerson, W. P. Robust Trading Mechanisms. <em>Journal of Economic Theory</em>, 42(1):94&ndash;107, 1987.</li>
                    <li>Hayek, F. A. The Use of Knowledge in Society. <em>American Economic Review</em>, 35(4):519&ndash;530, 1945.</li>
                    <li>Klemperer, P. Auction Theory: A Guide to the Literature. <em>Journal of Economic Surveys</em>, 13(3):227&ndash;286, 1999.</li>
                    <li>Milgrom, P. <em>Discovering Prices: Auction Design in Markets with Complex Constraints</em>. Columbia University Press, New York, 2017.</li>
                    <li>Milgrom, P. R. &amp; Weber, R. J. A Theory of Auctions and Competitive Bidding. <em>Econometrica</em>, 50(5):1089&ndash;1122, 1982.</li>
                    <li>Myerson, R. B. Optimal Auction Design. <em>Mathematics of Operations Research</em>, 6(1):58&ndash;73, 1981.</li>
                    <li>Myerson, R. B. &amp; Satterthwaite, M. A. Efficient Mechanisms for Bilateral Trading. <em>Journal of Economic Theory</em>, 29(2):265&ndash;281, 1983.</li>
                    <li>Riley, J. G. &amp; Samuelson, W. F. Optimal Auctions. <em>American Economic Review</em>, 71(3):381&ndash;392, 1981.</li>
                    <li>Roth, A. E. What Have We Learned from Market Design? <em>Economic Journal</em>, 118(527):285&ndash;310, 2008.</li>
                    <li>Roth, A. E. &amp; Ockenfels, A. Last-Minute Bidding and the Rules for Ending Second-Price Auctions: Evidence from eBay and Amazon Auctions on the Internet. <em>American Economic Review</em>, 92(4):1093&ndash;1103, 2002.</li>
                    <li>Roth, A. E. &amp; Sotomayor, M. <em>Two-Sided Matching: A Study in Game-Theoretic Modeling and Analysis</em>. Cambridge University Press, Cambridge, 1990.</li>
                    <li>Roth, A. E. &amp; Xing, X. Jumping the Gun: Imperfections and Institutions Related to the Timing of Market Transactions. <em>American Economic Review</em>, 84(4):992&ndash;1044, 1994.</li>
                    <li>Rothkopf, M. H., Teisberg, T. J., &amp; Kahn, E. P. Why Are Vickrey Auctions Rare? <em>Journal of Political Economy</em>, 98(1):94&ndash;109, 1990.</li>
                    <li>Satterthwaite, M. A. Strategy-Proofness and Arrow&rsquo;s Conditions: Existence and Correspondence Theorems for Voting Procedures and Social Welfare Functions. <em>Journal of Economic Theory</em>, 10(2):187&ndash;217, 1975.</li>
                    <li>Stigler, G. J. The Economics of Information. <em>Journal of Political Economy</em>, 69(3):213&ndash;225, 1961.</li>
                    <li>Vickrey, W. Counterspeculation, Auctions, and Competitive Sealed Tenders. <em>Journal of Finance</em>, 16(1):8&ndash;37, 1961.</li>
                </>
            }
        >
            <PaperSection title="1. Introduction">
                <PaperSubsection title="1.1 The venue assumption">
                    <p>
                        A buyer wants one position filled and finds <Math>{"k"}</Math> wallets that publish a price for it. If it sends each of them a commitment it has already signed, each can complete one alone, and the buyer may be bound <Math>{"k"}</Math> times. If it asks first and signs later, it must decide what to sign and on what evidence. A venue answers both questions by holding the bids: it collects them, keeps them sealed, applies a rule, and keeps the bids and the outcome where a loser can check them.
                    </p>
                    <p>
                        Market design has mostly designed such institutions. The sealed-bid tender, the ascending auction, the clearinghouse and the deferred-acceptance match are each specified as a procedure someone runs. Milgrom (2017) develops auction design for markets with complex constraints, in which the auctioneer computes both the allocation and the prices. The procedure&rsquo;s properties then hold only if the party running it behaves. Rothkopf, Teisberg, &amp; Kahn (1990) explain the rarity of second-price auctions by bidders&rsquo; distrust of an auctioneer who learns the highest bid and computes the payment from the second, and Ausubel &amp; Milgrom (2006) extend the diagnosis to combinatorial settings.
                    </p>
                    <p>
                        The setting here adds a reason to avoid a venue that reputation and law do not address. The Core, defined in &sect;2, makes performance self-enforcing between strangers by having each party lock a bond against its own conduct. Its security is an equilibrium over exactly those locked positions. A venue that holds bid bonds, or that can move a party&rsquo;s tokens, adds a position that analysis does not cover. Our question is how much of a venue&rsquo;s work the two signatures on a commitment can do by themselves.
                    </p>
                </PaperSubsection>
                <PaperSubsection title="1.2 Contribution">
                    <p>
                        We analyze two formation mechanisms with the field&rsquo;s ordinary tools: mechanism class, where price is discovered, incentives on both sides, and stability in the matching sense.
                    </p>
                    <ol className="space-y-2 list-decimal pl-6 text-sm">
                        <li><strong>Exclusion by signature order.</strong> A buyer that signs first releases structs its recipients can complete alone; a buyer that signs last releases none, and its one signature is the selection and the commitment at once. Signing last holds the buyer to one commitment of its choosing at every position (&sect;3.2).</li>
                        <li><strong>Two mechanisms, classified.</strong> The dispatch race is a posted-price mechanism with simultaneous solicitation, the class Hagerty &amp; Rogerson (1987) identify with dominant strategies in bilateral trade. The request for quotes is what a buyer uses to discover a price the posted class cannot supply (&sect;&sect;4.1, 5.1).</li>
                        <li><strong>First price is forced.</strong> The winner is paid a field of the struct it signed, and the buyer, signing last and bound by no rule, completes the struct that pays least. A second-price rule needs a party that binds the buyer&rsquo;s choice, which is the venue (&sect;5.3).</li>
                        <li><strong>The participation constraint is a balance.</strong> Each draft states the cumulative value the candidate will be bonded against, so the quantity that decides participation is known in advance, depends on position, and rises with the candidate&rsquo;s own quote. A cheaper price at one position lowers the balance required at every later one (&sect;&sect;5.4, 5.5).</li>
                        <li><strong>Composition without awareness.</strong> A market layer whose only output is an object the Core already accepts inherits the Core&rsquo;s equilibrium without re-derivation, and the data the Core keeps cannot tell a raced commitment from one arranged by hand (&sect;6).</li>
                    </ol>
                    <p>
                        Section 2 states the Core and the slice of its equilibrium the argument uses. Section 3 treats signature order and the four roles of a venue. Sections 4 and 5 analyze the two mechanisms, &sect;6 states the composition property, and &sect;7 concludes.
                    </p>
                </PaperSubsection>
            </PaperSection>

            <PaperSection title="2. The Setting">
                <PaperSubsection title="2.1 What the Core holds">
                    <p>
                        The Core is a commit-and-resolve mechanism with two operations and no others. <em>Commitment</em> admits one order between a buyer and a seller. Its struct names the process the order extends (or none, when the order opens one), the buyer, the seller, the denomination (the token every payment and bond of the process is counted in), a payment <Math>{"P \\geq 1"}</Math>, the cumulative value <Math>{"G"}</Math> the process holds through this order, the merkle root of the order&rsquo;s agreement, a salt, and a deadline. The Core admits it only when two signatures over that one struct recover to the buyer and the seller it names. On admission it locks <Math>{"2P"}</Math> from the buyer and <Math>{"2G"}</Math> from the seller.
                    </p>
                    <p>
                        <em>Resolution</em> closes the whole process, and it is the buyer&rsquo;s judgment: only the buyer may call it, and every open order resolves together or none does. Each seller receives <Math>{"2G + P"}</Math> and the buyer <Math>{"P"}</Math> back per order, so each seller ends ahead by its payment and the buyer has paid exactly what it agreed. The agreement is the clauses composed for one order, each clause a reusable term registered publicly, with every field filled. The chain holds the agreement&rsquo;s merkle root, never its terms, and it tests no performance.
                    </p>
                    <p>
                        A <em>process</em> is the set of orders one buyer opens. The first commitment carries no process identifier, and admitting it opens a process named by that commitment&rsquo;s own signed digest; every later commitment names the process and must name its buyer. The orders form a <em>process chain</em>: a sequence of commitments, each extending one cumulative value that only grows. We call an order&rsquo;s place in that chain its <em>position</em>, which either opens the process or extends it. A process holds as many orders as the network can resolve in one transaction.
                    </p>
                    <p>
                        The Core runs two mechanisms that compose. <em>Asymmetric bonding</em> secures each order and scales the security along the chain, since each seller bonds twice the cumulative value through its own order. <em>Buyer dominance with atomic resolution</em> coordinates the sellers on the chain the bonds already secure: nobody is paid until the buyer resolves, so each seller holds a live interest in every other seller&rsquo;s performance. Four features of the Core are the ones this paper uses.
                    </p>
                    <PaperRun title="Two signatures, in no particular order.">
                        The Core verifies both signatures against one digest and imposes no order between them. Which side signs first is a convention of whatever produces the struct, never a rule of the Core. Any wallet holding both signatures may submit the commitment, because the Core checks the signatures and never the sender. Section 3 shows that this degree of freedom is where the market lives.
                    </PaperRun>
                    <PaperRun title="No revocation, one deadline.">
                        The Core has no operation that withdraws a signature. A released signature stays admissible until the deadline inside its struct, whenever its signer&rsquo;s balance and the allowance it has granted the Core cover the bond. Only by withdrawing that balance or allowance can a signer make its released signatures inadmissible earlier; the Core does not see the withdrawal, and it blocks every other commitment the signer has signed in that token.
                    </PaperRun>
                    <PaperRun title="Orders are related only through their process.">
                        Each admitted order is identified by its content: two structs that differ anywhere, in the seller, the payment or the salt, are two orders, and the Core&rsquo;s duplicate guard is per order. Orders that open different processes are related in no way. Orders in one process share one buyer, one denomination, one cumulative value and one resolution. Each carries, as a signed field, the cumulative value the process is to hold once it joins, and the Core admits it only if that figure equals the running value plus the order&rsquo;s own payment.
                    </PaperRun>
                    <PaperRun title="One denomination per process, and a positive floor.">
                        A process is counted in one token, because the doubled schedule compares magnitudes and comparability is what lets it be enforced from chain state alone. A payment of zero is refused. A market formed here inherits both: quotes within one solicitation are commensurable by construction, and a zero-priced answer cannot be expressed.
                    </PaperRun>
                </PaperSubsection>

                <PaperSubsection title="2.2 The equilibrium the argument uses">
                    <p>
                        The Core&rsquo;s equilibrium is a comparison over its transfers plus what a party retains off-chain, credited at the figures the parties signed. The retention term is the reason the schedule doubles: value passes off-chain, so a party that walks away keeps what it holds, and a bond equal to that value would be exactly canceled by the taking. Three comparisons follow, with the seller performing or holding out and the buyer resolving or withholding.
                    </p>
                    <ol className="space-y-2 list-decimal pl-6 text-sm">
                        <li><strong>After performance, the buyer resolves.</strong> Resolving ends at <Math>{"-2P + P + P = 0"}</Math>: it is refunded its bond less the payment, and it holds a delivery worth <Math>{"P"}</Math>. Never resolving ends at <Math>{"-2P + P = -P"}</Math>, its bond held against the delivery it keeps. This comparison needs no assumption about the seller.</li>
                        <li><strong>Given that plan, the seller performs.</strong> If the buyer resolves once performance has occurred and not before, performing ends at <Math>{"+P"}</Math>, and holding out ends at most at <Math>{"-2G + G = -G"}</Math>, since the seller forfeits its bond and keeps at most the cumulative value it withheld.</li>
                        <li><strong>Before performance, the buyer keeps the process open.</strong> Resolving at once is terminal at <Math>{"-P"}</Math>, with nothing delivered, while keeping the process open leads to performance by (2).</li>
                    </ol>
                    <p>
                        Comparisons (2) and (3) are each party&rsquo;s best reply to the other&rsquo;s plan, verified jointly, so cooperation is the equilibrium: a fixed point, not a dominance result. A shortfall is put right before the buyer resolves, because resolution is terminal and the Core has no path that reverses a payment. An outside forum may rule on a process&rsquo;s data while the process stands open, and it cannot call resolve. The comparison contains no term for what a party spends to perform. This paper adds a layer above the Core and adds nothing to that comparison; where it needs a party&rsquo;s capacity to trade, it uses the one quantity the Core contains, the balance a wallet can commit.
                    </p>
                </PaperSubsection>

                <PaperSubsection title="2.3 What a market has to add">
                    <p>
                        Roth (2008) names three things a market must accomplish before its allocation rule matters. It must be <em>thick</em>: enough participants on both sides that the match found is worth having. It must overcome <em>congestion</em>: participants must be able to make, receive and evaluate enough offers in the time available. And it must be <em>safe</em>: acting straightforwardly must not expose a participant to exploitation for having done so.
                    </p>
                    <p>
                        Safety is two things that one institution usually supplies together. <em>Formation safety</em> means that answering a solicitation exposes the answerer to no more than the trade it answered for. <em>Performance safety</em> means that the counterparty, once matched, delivers. An exchange that holds margin supplies both at once, and its design does not separate them. Here they are separate: performance safety is the Core&rsquo;s, complete before any market exists, and the market layer supplies only formation safety. Thickness and congestion return in &sect;4.4 as the only two ways the race&rsquo;s outcome can fail to be stable.
                    </p>
                </PaperSubsection>

                <PaperSubsection title="2.4 The four roles a venue plays">
                    <p>
                        A venue between a solicitation and a binding commitment does four separable things, and &sect;3 takes them one at a time.
                    </p>
                    <ol className="space-y-2 list-decimal pl-6 text-sm">
                        <li><strong>Mutual exclusion.</strong> Soliciting <Math>{"k"}</Math> bids must not oblige the solicitor to <Math>{"k"}</Math> trades: at most one may bind.</li>
                        <li><strong>Discovery.</strong> A participant must learn who may be asked, and on what terms, without a prior relationship with each.</li>
                        <li><strong>An anti-reneging stake.</strong> A bid that costs nothing to make and nothing to abandon is weak evidence of availability, so venues take bid bonds.</li>
                        <li><strong>Verifiable selection.</strong> A losing participant must be able to check that the announced rule was the rule applied.</li>
                    </ol>
                </PaperSubsection>
            </PaperSection>

            <PaperSection title="3. Signature Order as a Market Primitive">
                <PaperSubsection title="3.1 Three states of one artifact">
                    <p>
                        Everything exchanged during formation is one object in one of three states, and the states differ only in how many signatures the object carries. A <em>candidate</em> is a wallet the buyer solicits; a <em>solicitation</em> is the set of drafts the buyer sends for one position.
                    </p>
                    <p>
                        A <em>draft</em> carries no signature. It is a complete commitment struct, every field filled, that nobody has signed. The Core will not admit it, and no recipient can make it admissible alone, so sending a draft is a communication and nothing more. A candidate checks that the draft names it, that the agreement attached hashes to the root the struct carries, and that the agreement&rsquo;s terms agree with the struct it would be bonded against, and refuses to answer otherwise.
                    </p>
                    <p>
                        An <em>answer</em> carries one signature, the candidate&rsquo;s. It binds its signer to exactly the trade in the struct, only if the buyer completes it, and only until the deadline inside it. It requires no balance to produce, because the Core pulls nothing until a commitment is admitted. A candidate holding no tokens can answer, and its commitment fails at admission if it is selected while still unfunded.
                    </p>
                    <p>
                        A <em>commitment</em> carries both signatures and is the only state the Core has a name for. Producing it is the buyer&rsquo;s single act. That act is at once the selection of a counterparty and the formation of the obligation.
                    </p>
                </PaperSubsection>

                <PaperSubsection title="3.2 Exclusion by signature order">
                    <p>
                        Mutual exclusion seems to require held state most obviously of the four roles, and it requires none.
                    </p>
                    <FormalBlock label="Proposition 3.1 (Exclusion by signature order).">
                        <p>
                            Let a buyer solicit <Math>{"k \\geq 2"}</Math> candidates for one position, sending candidate <Math>{"i"}</Math> a struct that names it as seller at payment <Math>{"P_i"}</Math>, the structs differing at least in the seller field.
                        </p>
                        <p>
                            <em>(a) Buyer-first, at an opening position.</em> If the structs carry no process identifier and the buyer signs each before sending it, each candidate can make its struct admissible alone, the Core relates the <Math>{"k"}</Math> resulting processes in no way, and the buyer&rsquo;s worst-case exposure is all <Math>{"k"}</Math> commitments, with <Math>{"\\sum_{i} 2P_i"}</Math> locked from it.
                        </p>
                        <p>
                            <em>(a&prime;) Buyer-first, at an extending position.</em> If the structs name a process already open, at most one of the <Math>{"k"}</Math> can ever be admitted, whatever the buyer signed. The buyer&rsquo;s exposure is one commitment, and which one is decided by whichever commitment the network includes first.
                        </p>
                        <p>
                            <em>(b) Candidate-first.</em> If the structs go out unsigned and the buyer signs exactly one returned answer, then at either kind of position at most one commitment from the solicitation can ever be admitted, and it is the one the buyer chose.
                        </p>
                    </FormalBlock>
                    <Proof>
                        For <em>(a)</em>: admission requires two valid signatures over one struct, and a candidate holding a buyer-signed struct that names it supplies the second. A struct that opens a process names that process by its own signed digest, so the <Math>{"k"}</Math> structs open <Math>{"k"}</Math> distinct processes, and the per-order duplicate guard never fires across them. The Core has no notion of a solicitation, no per-signer nonce, no revocation and no state across processes, so each released buyer signature stays admissible until its deadline. All <Math>{"k"}</Math> may be admitted, and commitment <Math>{"i"}</Math> locks <Math>{"2P_i"}</Math> from the buyer.
                        {" "}For <em>(a&prime;)</em>: the Core admits an extending order only if its signed cumulative figure equals the running value plus the order&rsquo;s own payment. The <Math>{"k"}</Math> rivals are drafted against one running value, and admitting any one advances that value by its payment, which is at least one unit. Each remaining rival&rsquo;s signed figure then disagrees with the running value plus its payment, and since the running value only grows, it disagrees at every later time. This exclusion is arithmetic: it does not depend on the rivals differing in any field, and the buyer cannot repair it by re-signing, because its signature covers the stale figure.
                        {" "}For <em>(b)</em>: an unsigned draft is admissible for nobody, and an answer carries one of the two signatures the Core requires. The buyer produces one signature over one struct, so at most one struct in the solicitation ever carries two, and it is the one the buyer signed. <span className="italic">&#9633;</span>
                    </Proof>
                    <p>
                        The two buyer-first cases fail differently. At an opening position, signing first multiplies the buyer&rsquo;s exposure by the size of its own search, since <Math>{"k"}</Math> released signatures are <Math>{"k"}</Math> commitments it can be held to. At an extending position the Core already excludes the rivals, so signing first costs the buyer its <em>selection</em>: the counterparty is whichever commitment the network includes first. Every position after the first is an extending one, so the second failure is the common one. Candidate-first answers both with one rule that need not know which kind of position it fills, which is why the same exchange of drafts runs at any position of a process chain.
                    </p>
                    <PaperRemark title="The buyer&rsquo;s exposure does not grow with k.">
                        Part <em>(b)</em> bounds the buyer&rsquo;s exposure at one commitment for any <Math>{"k"}</Math>, while each candidate&rsquo;s exposure is the single trade it answered for. The bound mirrors the Core: the buyer is the only party who can close a process, and under candidate-first it is the only party who can complete a commitment. Neither power reaches another party&rsquo;s position, because a candidate that is not selected is left exactly as it was.
                    </PaperRemark>
                </PaperSubsection>

                <PaperSubsection title="3.3 The remaining three roles">
                    <PaperRun title="Discovery is a registry read, not an admission.">
                        The candidate set is derived at the moment of solicitation from the members, wallets that have registered a profile with a stake so that others can find them. Registration is permissionless: the stake is in the chain&rsquo;s own currency and stays reclaimable, and withdrawing it removes the profile from view while leaving every admitted commitment intact. The buyer reads the members live and keeps those whose catalogs can price the position. The set is not a roster any party maintains, so an empty result means absence. What a candidate sells, and at what price, is its own declaration; which declaration is taken is the buyer&rsquo;s decision.
                    </PaperRun>
                    <PaperRun title="The answer carries its own bond.">
                        A venue takes a bid bond because a bid is otherwise cheap talk. Here the object a candidate signs to signal availability is the object that will bond it if the buyer completes it. A candidate cannot signal availability more cheaply than by becoming bound if selected, because there is nothing else to send. A losing answer forfeits nothing and needs no cancellation: it lapses at the deadline the buyer fixed in every draft of the solicitation. The member stake remains as a standing signal of seriousness, held once rather than per answer.
                    </PaperRun>
                    <PaperRun title="Verifiable selection is not available, and is not owed.">
                        A sealed-bid venue must let a loser check the rule, because a loser in a committed mechanism has a claim if the rule was broken. Here the buyer is bound by no rule: the cheapest verified answer is a default, and the buyer may take any answer. A loser has nothing to audit and no claim to lose. The real cost is the incentive consequence of the buyer&rsquo;s non-commitment, which &sect;5.3 states.
                    </PaperRun>
                    <MarketFormationSwimlaneFigure className="my-8" />
                </PaperSubsection>
            </PaperSection>

            <PaperSection title="4. The Dispatch Race">
                <PaperSubsection title="4.1 Mechanism class">
                    <p>
                        In the dispatch race, the buyer builds one draft per candidate, priced at that candidate&rsquo;s published figure for the position, and sends the drafts out unsigned and at once. A candidate answers by countersigning its draft as it stands. The buyer accepts an answer only if it is the struct the buyer drafted, hash for hash, and only if the signature recovers against the buyer&rsquo;s own copy. Answers accumulate for a window the buyer chooses. At the close, the cheapest verified answer wins by default and ties break by arrival order; the buyer may instead take any answer, or close the window early.
                    </p>
                    <p>
                        The candidate makes no report. The price in its draft is the one it published before the solicitation existed, and its action set is <Math>{"\\{\\text{answer}, \\text{do not answer}\\}"}</Math>. The race is a posted-price mechanism with simultaneous solicitation and buyer-side selection: an assignment over an already-priced set, not an auction, since no participant submits a figure the allocation rule operates on.
                    </p>
                    <p>
                        Hagerty &amp; Rogerson (1987) show that in bilateral trade the mechanisms that are dominant-strategy incentive compatible, individually rational and budget balanced are posted-price mechanisms or randomizations over them. Their setting has a mediator computing the outcome from reports, and this one has none, so the result is recognized here more than applied. The race&rsquo;s clean incentives have the reason their theorem identifies: the terms of trade depend on no report. A market with no mediator is pushed toward posted prices at least as hard as a mediated one, since nobody is there to compute a report-dependent rule.
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
                        Price discovery happens at publication. A published figure is a standing, public, unilateral price statement, the kind of dispersed knowledge Hayek (1945) treats prices as conveying, and buyers observe the whole published set before they solicit. Diamond (1971) shows that with sequential search at any strictly positive cost, posted prices go to the monopoly price, because a buyer accepts a small overcharge rather than pay to check one more seller. The race removes that premise. Reading the published set costs the buyer nothing, and each further candidate costs one message, so the search cost is near zero where Diamond&rsquo;s argument needs it positive.
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
                        In conventional procurement, award and contract are separate, and the interval between them is where requalification, renegotiation and hold-up occur. Here the interval does not exist, because the buyer&rsquo;s single signature is both the selection and the commitment. The buyer cannot select and then reopen terms, since no state exists in which it has selected and not committed. It cannot commit at other terms either, since the winner&rsquo;s signature covers one struct and any other struct is a different object.
                    </PaperRun>
                    <PaperRun title="Timing rules favor the candidate.">
                        Roth &amp; Ockenfels (2002) show that the ending rule matters: hard-close auctions attract last-moment bidding that soft-close auctions do not. The race closes hard on the buyer&rsquo;s clock, and nobody gains by arriving late, because a late answer cannot move the price and ties break by arrival order. The buyer&rsquo;s option to close early makes the window a maximum, so the buyer has no reason to wait out a market that has answered. In the unraveling literature (Roth &amp; Xing, 1994), exploding offers are how one side pressures the other into deciding early. Here the expiring object is the <em>candidate&rsquo;s</em> answer, at the one deadline fixed for the whole solicitation, and its expiry protects the candidate.
                    </PaperRun>
                </PaperSubsection>

                <PaperSubsection title="4.4 Stability, and the only two ways it fails">
                    <p>
                        The race allocates one position among candidates, which invites the matching question (Gale &amp; Shapley, 1962; Roth &amp; Sotomayor, 1990): is there a buyer and a candidate who would both rather be matched to each other than to what the race gave them?
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
                        The ceiling is a field of the struct every candidate receives, and that is why a quote above it cannot survive verification. In optimal-auction theory the reserve is likewise announced as part of the rules the auctioneer commits to, set against the distribution of bidders&rsquo; types (Myerson, 1981; Riley &amp; Samuelson, 1981). What differs here is that the ceiling is the only rule the buyer is bound by. An announced reserve draws quotes toward it as competition thins, and with one invited candidate a quote at the ceiling is the obvious play. The buyer&rsquo;s defenses are the ones in its hands: an honest ceiling and more candidates. The race reveals nothing about what the buyer would pay, since its drafts carry the candidates&rsquo; own figures.
                    </PaperRemark>
                    <p>
                        In substance the quote leg is nearer a negotiation than an auction. Bulow &amp; Klemperer (1996) show that a seller does better with an auction without a reserve and with one additional bidder than with a negotiation among the original bidders in which it may choose the best mechanism. Their auction is one whose allocation rule the auctioneer commits to. Here the buyer commits to the ceiling and to nothing else: it may take a quote that is not the lowest, or none. Bajari, McMillan, &amp; Tadelis (2009) find that auctions have limits in complex projects with incomplete designs and few bidders, and that they discourage communication between buyer and contractor about the design. Those are the jobs for which a buyer reaches for a quote leg, so the quote leg has an auction&rsquo;s form and a negotiation&rsquo;s commitment structure.
                    </p>
                </PaperSubsection>

                <PaperSubsection title="5.2 A quote moves the price and nothing else">
                    <p>
                        Reconstruction is what makes a quote comparable to the request it answers, and it has a formal statement.
                    </p>
                    <FormalBlock label="Proposition 5.1 (Price-only variation).">
                        <p>
                            Let the buyer&rsquo;s request be a draft <Math>{"D"}</Math> built at ceiling <Math>{"\\bar{q}"}</Math> over a set of priced fields <Math>{"F"}</Math> named by the buyer, and let <Math>{"\\sigma(D, F, q)"}</Math> denote the substitution that writes <Math>{"q"}</Math> at every field of <Math>{"F"}</Math> and re-derives the payment, the cumulative value, and the agreement&rsquo;s merkle root accordingly. A reply <Math>{"R"}</Math> naming figure <Math>{"q"}</Math> is accepted only if <Math>{"1 \\leq q \\leq \\bar{q}"}</Math> and <Math>{"R"}</Math> is identical to <Math>{"\\sigma(D, F, q)"}</Math> as a struct, with its attached agreement hashing to that struct&rsquo;s root and its signature recovering to the candidate the buyer drafted against. Consequently a reply differing from <Math>{"D"}</Math> in any respect not determined by <Math>{"q"}</Math> through <Math>{"\\sigma"}</Math> is rejected.
                        </p>
                    </FormalBlock>
                    <Proof>
                        The buyer never reads <Math>{"R"}</Math> to learn what changed. It computes <Math>{"\\sigma(D, F, q)"}</Math> from its own retained <Math>{"D"}</Math>, taking from <Math>{"R"}</Math> only the scalar <Math>{"q"}</Math>, and compares struct hashes. Struct-hash equality is equality in every field, including the parties, the denomination, the salt, the deadline and the agreement&rsquo;s root. The check that <Math>{"R"}</Math>&rsquo;s attached agreement hashes to that root extends the equality from the struct to the terms, and recovery runs against the buyer&rsquo;s reconstruction, so a signature over any other struct fails. The bounds on <Math>{"q"}</Math> are evaluated against <Math>{"D"}</Math>, which the reply cannot influence. <span className="italic">&#9633;</span>
                    </Proof>
                    <p>
                        The priced set <Math>{"F"}</Math> is the buyer&rsquo;s. A candidate cannot enlarge it by returning a reply that moves more, because that reply would not reconstruct, so a quote is a scalar answer to the buyer&rsquo;s question and quotes from different candidates are commensurable. The comparison is by reconstruction rather than by difference, for a reason of substance. A check by difference must list what may differ and is wrong when the list is incomplete; a check by reconstruction is one equality and has no list. The Core identifies orders by content for the same reason.
                    </p>
                </PaperSubsection>

                <PaperSubsection title="5.3 First price is forced">
                    <p>
                        Vickrey (1961) showed that paying the winner the second-best figure makes truthful reporting a dominant strategy, and Klemperer (1999) surveys the theory built on that result. The objections recalled in &sect;1.1 are about trusting the party that runs the auction. The obstacle here is structural, and it lies with the buyer.
                    </p>
                    <FormalBlock label="Proposition 5.2 (First price is forced).">
                        <p>
                            Let the only admissible object be a struct both parties sign, let the winner be paid that struct&rsquo;s payment field, and let a signature count only when it recovers to its signer&rsquo;s own key. Then no rule paying the winner a figure computed from other candidates&rsquo; reports is implementable unless some party other than the buyer can bind the buyer&rsquo;s choice of which struct to complete, or can supply a signature without its signer.
                        </p>
                    </FormalBlock>
                    <Proof>
                        Let the winner have answered at <Math>{"q_1"}</Math> and let the rule prescribe <Math>{"q_2 \\neq q_1"}</Math>, computed from rival reports. The Core transfers the payment field of the admitted struct, so paying <Math>{"q_2"}</Math> requires an admitted struct whose payment field is <Math>{"q_2"}</Math>, and a signature over the struct at <Math>{"q_1"}</Math> does not cover it. The winner may sign a struct at <Math>{"q_2"}</Math> after the reports are known, and if <Math>{"q_2 < q_1"}</Math> it may decline, which makes the rule a fresh request rather than an allocation rule. It may also sign in advance a ladder of structs at several figures. Either way the buyer signs last and is bound by no rule, so among the structs the winner has signed it completes the one that pays least. The winner&rsquo;s lowest signed figure is then its bid and its payment, which is first price. A payment of <Math>{"q_2"}</Math> in every profile of reports therefore needs a party that binds the buyer&rsquo;s choice, or one that supplies a party&rsquo;s signature without it. The Core accepts a signature only when it recovers to the named party&rsquo;s key, so either party holds power over a key not its own, and that party is the venue. <span className="italic">&#9633;</span>
                    </Proof>
                    <p>
                        The proposition is a cost. The quote leg is not strategy-proof and cannot be made so within the design: a candidate&rsquo;s best quote depends on its beliefs about rival quotes and about the ceiling, as in first-price sealed bidding (Milgrom &amp; Weber, 1982; Klemperer, 1999). The impossibility is this proposition&rsquo;s, and it is narrower than the classical one. Gibbard (1973) and Satterthwaite (1975) show that every non-dictatorial rule over at least three outcomes and unrestricted preferences is manipulable; procurement with quasilinear payoffs is a restricted domain, and there the Vickrey rule is strategy-proof. What excludes it here is that the buyer cannot commit to it. The race has dominant strategies because it has no report, the quote leg discovers price because it has one, and the design cannot have both: <em>strategy-proofness on the quote leg is the price of having no venue</em>.
                    </p>
                    <PaperRemark title="The efficiency question is not asked.">
                        Myerson &amp; Satterthwaite (1983) show that no mechanism for bilateral trade under two-sided private information is at once efficient, individually rational and budget balanced. Their result is about valuations and costs. The Core&rsquo;s game is over payments and bonds, with retained value credited at the figures the parties signed, and the market layer adds a quote, a figure a candidate names. We make no efficiency claim. What the two mechanisms supply is feasibility: the parties who trade are secured, and finding a counterparty costs a message.
                    </PaperRemark>
                </PaperSubsection>

                <PaperSubsection title="5.4 The participation constraint is a balance">
                    <p>
                        Procurement theory places the bidder&rsquo;s participation constraint in an unobservable private type: the bidder takes part when the price it expects to win at covers what performing is worth to it. The constraint that governs participation here is a quantity the Core contains.
                    </p>
                    <p>
                        A draft states the cumulative value <Math>{"G"}</Math> through the candidate&rsquo;s order, and the Core pulls <Math>{"2G"}</Math> from the candidate when the commitment is admitted. On the quote leg, if the position follows a cumulative value <Math>{"V_0"}</Math> and the candidate quotes <Math>{"q"}</Math>, then <Math>{"G = V_0 + q"}</Math> and the requirement is <Math>{"2(V_0 + q)"}</Math>. Let <Math>{"\\beta"}</Math> be what the Core can pull from the candidate in the process&rsquo;s denomination: the lesser of its balance and the allowance it has granted the Core. The candidate can be committed only where
                    </p>
                    <p className="text-center">
                        <Math display>{"2(V_0 + q) \\leq \\beta \\quad \\Longleftrightarrow \\quad q \\leq \\tfrac{1}{2}\\beta - V_0 ."}</Math>
                    </p>
                    <p>
                        The constraint has four properties that shape the market.
                    </p>
                    <ol className="space-y-2 list-decimal pl-6 text-sm">
                        <li><strong>It is stated in the request.</strong> The draft names <Math>{"G"}</Math>, so a candidate knows the exact balance a commitment will require before it answers. The quantity that decides whether it <em>can</em> participate is common knowledge between the two parties at solicitation, where a participation constraint is usually private.</li>
                        <li><strong>It binds from above, jointly with the ceiling.</strong> The effective cap on a quote is <Math>{"\\min\\{\\bar{q},\\; \\tfrac{1}{2}\\beta - V_0\\}"}</Math>, and each unit of quote raises the required balance by two units. Public-works procurement also couples ask and bond, since it commonly sets the performance bond as a share of the contract price. The coupling here differs in kind: the bond is the candidate&rsquo;s own locked balance, at twice the cumulative value through its order, refunded whole at resolution, where a performance bond is a surety&rsquo;s promise.</li>
                        <li><strong>It depends on position.</strong> <Math>{"V_0"}</Math> enters additively, so the same quote at a deeper position requires a larger balance. Depth filters the candidate set by balance, and a market can be thin at a late position while the same members are plentiful at an early one.</li>
                        <li><strong>It is checked at admission, not at answering.</strong> Answering requires a signature and no balance, and a losing quote leaves its signer untouched. An unfunded winner&rsquo;s commitment fails at admission, which is a liveness event for one solicitation and a safety event for nobody. Falling back to the next verified answer is a second buyer signature, and any wallet holding both signatures may submit it until the deadline. The first commitment also stays admissible until that same deadline, should its signer fund it. At an extending position the Core admits at most one of the two, whichever the network includes first; at an opening position it may admit both.</li>
                    </ol>
                    <p>
                        Competition cannot run on the size of the bond. Every candidate is bonded on the one schedule, twice the cumulative value through its order, and neither side can offer the bond as a term. Competition runs on price and on the non-price terms the buyer put in the draft.
                    </p>
                </PaperSubsection>

                <PaperSubsection title="5.5 Competition upstream widens the market downstream">
                    <p>
                        A price agreed at one position reaches the participation constraint at every later one, because the bond at each order is keyed to the cumulative value through it.
                    </p>
                    <FormalBlock label="Proposition 5.3 (Downstream widening).">
                        <p>
                            Let a process chain have payments <Math>{"P_1, \\ldots, P_n"}</Math> in commitment order, so that the cumulative value through order <Math>{"i"}</Math> is <Math>{"G_i = \\sum_{j \\leq i} P_j"}</Math> and the balance required at position <Math>{"i"}</Math> is <Math>{"2G_i"}</Math>. Suppose formation at position <Math>{"m"}</Math> returns a figure lower by <Math>{"\\delta > 0"}</Math> than the alternative, with every other payment unchanged. Then for every <Math>{"i \\geq m"}</Math> the balance required at position <Math>{"i"}</Math> falls by <Math>{"2\\delta"}</Math>, and the set of candidates able to be committed at position <Math>{"i"}</Math> weakly expands. Positions with <Math>{"i < m"}</Math> are unaffected.
                        </p>
                    </FormalBlock>
                    <Proof>
                        <Math>{"G_i"}</Math> is a sum over <Math>{"j \\leq i"}</Math>, and <Math>{"m \\leq i"}</Math>, so reducing <Math>{"P_m"}</Math> by <Math>{"\\delta"}</Math> reduces <Math>{"G_i"}</Math> by <Math>{"\\delta"}</Math> and <Math>{"2G_i"}</Math> by <Math>{"2\\delta"}</Math>. The constraint at position <Math>{"i"}</Math> is <Math>{"2G_i \\leq \\beta"}</Math>; relaxing its left side weakly enlarges the set of balances satisfying it. Positions with <Math>{"i < m"}</Math> are unaffected, <Math>{"G_i"}</Math> not depending on <Math>{"P_m"}</Math>. <span className="italic">&#9633;</span>
                    </Proof>
                    <p>
                        A buyer&rsquo;s search at one position is therefore more than a private saving. It lowers the balance the winner must hold and the balance every later seller must hold, so it thickens the market at that position and at every one after it, where &sect;5.4(3) located the scarcity. The effect runs one way, from a position to itself and the positions after it, and it follows from the cumulative value being a running sum. A buyer forming several positions in sequence therefore does weakly better forming the earlier ones first. The same running sum also excludes rival drafts once one of them commits, by Proposition 3.1<em>(a&prime;)</em>, so one figure both sizes the bond and closes the position.
                    </p>
                </PaperSubsection>
            </PaperSection>

            <PaperSection title="6. Composing with a Market-Blind Mechanism">
                <PaperSubsection title="6.1 Interface minimality">
                    <p>
                        Both mechanisms share a composition property that lets a market be added to a mechanism whose guarantees were established without one.
                    </p>
                    <FormalBlock label="Definition 6.1 (Interface-minimal market layer).">
                        <p>
                            A market layer over a mechanism <Math>{"S"}</Math> is <em>interface-minimal</em> if its entire output is an object <Math>{"S"}</Math> already accepts, formed only from inputs the parties themselves supply, and if <Math>{"S"}</Math>&rsquo;s acceptance of that object is conditioned on nothing the market layer did.
                        </p>
                    </FormalBlock>
                    <p>
                        Both mechanisms are interface-minimal. Their output is a commitment with both signatures, the object the Core accepted before any market existed. Their inputs are the parties&rsquo; signatures and published terms. Admission turns on the struct, the two signatures and the two parties&rsquo; balances, never on how the struct was found.
                    </p>
                    <FormalBlock label="Proposition 6.2 (No re-derivation).">
                        <p>
                            If a market layer is interface-minimal, then every equilibrium property of <Math>{"S"}</Math> holds unchanged for the commitments it forms.
                        </p>
                    </FormalBlock>
                    <Proof>
                        <Math>{"S"}</Math>&rsquo;s game begins at an admitted commitment. Its payoffs are the transfers <Math>{"S"}</Math> executes plus the value each party retains, credited at the figures in the signed struct. Interface minimality leaves the admitted object, the figures it carries and the conditions of its admission unchanged, and adds no transfer. The game, its comparisons and hence its equilibria are the same objects. <span className="italic">&#9633;</span>
                    </Proof>
                    <p>
                        The proposition is nearly a tautology, and its contrapositive is the useful part. A market layer that holds a bid bond adds a transfer; one that can move a party&rsquo;s locked tokens changes the conditions of admission or of resolution; one that requires the Core to know a solicitation happened changes the acceptance condition. The commitments each of these forms do not inherit the Core&rsquo;s equilibrium, and each design must earn its own equilibrium argument, about a different mechanism.
                    </p>
                </PaperSubsection>

                <PaperSubsection title="6.2 The reproduction obligation">
                    <p>
                        Interface minimality carries one demanding obligation, and a market layer that neglects it fails silently. The winner&rsquo;s signature covers the exact struct the buyer drafted, so when the buyer signs, that struct must be rebuilt identically in every field. That includes the cumulative value, which depends on the payments committed before the position, and the salt and deadline, which fix the order&rsquo;s identity.
                    </p>
                    <p>
                        A market layer therefore fixes its reproduction inputs once, at drafting, and reuses them at closing: one salt per position and one deadline for the whole solicitation. At closing it rebuilds the struct, compares it to the one the winner signed, and refuses to proceed on any difference. A rebuilt struct that differs in any field carries no valid seller signature, so proceeding would discard the winner&rsquo;s answer and produce a commitment the Core cannot admit, with nothing in it to say why. The obligation is the market layer&rsquo;s because the Core, blind to the market, cannot know that the struct in front of it was meant to match another.
                    </p>
                </PaperSubsection>

                <PaperSubsection title="6.3 What the data holds">
                    <p>
                        The Core keeps the commitments it admitted, the bonds, the cumulative value and the resolution that closed the process. It keeps nothing about the solicitation, the candidates, the answers not taken, or whether a market was consulted at all. A commitment formed by racing a dozen candidates and one arranged between two parties who have traded for years are the same object in the data.
                    </p>
                    <p>
                        The benefit is that nothing needs reconciling. Losing answers moved no value, so they leave no entry and no refund. A party reconstructing a process from the data obtains every transfer that occurred, because the transfers that occurred are exactly those of the commitments admitted.
                    </p>
                    <p>
                        The cost is that the data does not evidence the selection. A buyer that must later show <em>how</em> it chose, to a counterparty, an auditor or a forum ruling on the process while it stands open, can do so only by an attestation. A party attests for itself, so the buyer signs the attestation; it is bound to a clause the winning order&rsquo;s signed agreement carries, and it can be given only while the process is open. The chain checks that the attestation is signed and bound, never that it is true. Such an attestation observes the selection and never takes part in it, which keeps it outside Proposition 6.2&rsquo;s contrapositive.
                    </p>
                </PaperSubsection>

                <PaperSubsection title="6.4 What a venue would cost">
                    <p>
                        For each of the four roles of &sect;2.4, a venue contract would add little and cost something specific.
                    </p>
                    <p>
                        For <em>mutual exclusion</em> it adds nothing: candidate-first signing excludes rivals at every position, and a contract would have to hold or constrain a signature that is never in circulation. For <em>discovery</em> it adds nothing a read of the members does not do, and a candidate list kept by a venue is a roster, where an entry means admission by someone and an empty result means the roster is incomplete. For an <em>anti-reneging stake</em>, a venue could hold bid bonds, at exactly the cost of Proposition 6.2&rsquo;s contrapositive: the candidate&rsquo;s calculation gains a position the Core&rsquo;s equilibrium does not cover, and losing stops being free. For <em>verifiable selection</em>, a venue could make the buyer&rsquo;s rule binding and checkable, which is the one role genuinely lost. It would buy the commitment Proposition 5.2 shows to be otherwise unavailable, at the cost of a party with authority over which of several bonded parties becomes obliged.
                    </p>
                    <p>
                        Two asymmetries decide the balance. The role a venue adds limits the buyer&rsquo;s ability to make promises to candidates, never a candidate&rsquo;s safety: an answering candidate is exposed to its own answer and to nothing the buyer can enlarge. And the choice is reversible in one direction only. A venue can later compose alongside an interface-minimal market, taking as inputs what the parties already exchange; a market built around a venue cannot have it removed without redesigning the exchange from the signature order up. Beginning without one is the reversible choice.
                    </p>
                </PaperSubsection>
            </PaperSection>

            <PaperSection title="7. Conclusion">
                <p>
                    A venue&rsquo;s first three roles need no venue when the object exchanged during formation is the commitment itself, signed in a chosen order. Exclusion follows from the buyer signing last, discovery is a read of a permissionless registry, and the anti-reneging stake is the answer, which binds its signer if selected. The fourth role, commitment to an allocation rule, is genuinely lost, and the loss is exact: the buyer completes the struct that pays least, so first price is forced. The dispatch race and the request for quotes sit on either side of that trade, one keeping dominant strategies by asking for no report, the other discovering price at the cost of strategy-proofness and of a disclosed ceiling. Both produce only what the Core already accepts, so the parties who trade are secured by an equilibrium proved without reference to how they found each other, and finding each other cost a message.
                </p>
            </PaperSection>
        </PaperLayout>
    );
}
