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
        "Two ways an offer forms over a bonded settlement layer that knows nothing about markets: the dispatch race, a posted-price mechanism with simultaneous solicitation, and the request for quotes, a sealed-bid first-price procurement auction with an announced reserve. A market-design treatment of formation without a venue — what mechanism class each belongs to, how each discovers price, what each does to both sides' incentives, and why the settlement layer never has to learn that either happened.",
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
            subtitle="Dispatch Races and Requests for Quotes as Market-Design Mechanisms over a Market-Blind Settlement Layer"
            author="Figaro"
            date="August 2026"
            watermark="Figaro Protocol · Preprint"
            keywords="market design, auction theory, matching theory, procurement, posted prices, offer formation, sealed-bid, reserve price, bonded settlement"
            abstract={
                <>
                    <p>
                        Markets are conventionally formed at venues. An exchange, an auction house, a procurement portal, a dispatcher: each holds state between the moment an offer is solicited and the moment it binds, and that held state is what the venue is for. It supplies mutual exclusion among competing offers, so that soliciting many does not oblige the solicitor to many; it supplies discovery, so that a participant knows whom it may ask; it supplies a stake that makes reneging costly; and it supplies a record that makes the selection checkable afterwards. A settlement layer that enforces bilateral agreements between strangers still leaves all four unanswered, and the natural response &mdash; put a venue contract on the network &mdash; is expensive in a specific way: whatever the venue holds is a position no party bonded, and the analysis that made settlement safe does not cover it.
                    </p>
                    <p>
                        We show that the four roles dissolve when the artifact exchanged during formation is the settlement artifact itself, signed incrementally. Two mechanisms are analyzed. In the <em>dispatch race</em>, a buyer builds one unsigned commitment per candidate at that candidate&rsquo;s own posted price and candidates countersign to answer availability; the buyer then signs exactly one. In the <em>request for quotes</em>, the same draft goes out at the buyer&rsquo;s ceiling and each candidate returns it re-priced at a figure it authors, which the buyer verifies by rebuilding its own draft at that figure rather than by inspecting the reply. We classify each in the standard vocabulary. The race is a posted-price mechanism with simultaneous solicitation and buyer-side selection: it performs no price discovery, because the prices were discovered at publication, and what it searches over is availability. The request for quotes is a sealed-bid first-price procurement auction with an announced reserve and, crucially, no allocation commitment &mdash; which places it, in the comparative literature, nearer a negotiation with simultaneous structured offers than an auction proper.
                    </p>
                    <p>
                        Three results carry the argument. <em>Exclusion by signature order</em>: because a commitment is admitted only on two signatures over one struct, reversing which side signs first converts mutual exclusion from a piece of held state into a property of the protocol&rsquo;s own arithmetic &mdash; a buyer who signs last is held to exactly one commitment however many candidates it solicited, and chooses which; a buyer who signs first is held to as many as it solicited wherever the solicitation opens a fresh process, and, wherever it extends an open one, to a single commitment it did not choose, the settlement layer&rsquo;s accumulator excluding the rivals arithmetically as soon as the quickest of them settles. Exclusion at depth the settlement layer supplies unasked; the selection is what the signing order buys. <em>No second price without a second signature</em>: because the winner is paid a field of the very struct it signed, no allocation rule that pays a figure derived from rival reports is implementable without a party able to bind the winner without its signature &mdash; so first-price is not a design preference here but the whole of what a venue-free market admits, and strategy-proofness on the quote leg is the price of dispensing with the venue. And the mechanism&rsquo;s participation constraint is a <em>balance</em> rather than a valuation: the draft states the figure against which the answering candidate will be bonded, so the one quantity that decides whether a candidate can participate is observable, stated in advance, and increasing in the candidate&rsquo;s own quote. We close by stating the composition property precisely: formation&rsquo;s entire output is an input the settlement layer already accepts, so no equilibrium result of that layer needs re-derivation, and the record it keeps is silent about the market that produced it.
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
                        Market design has largely been the design of venues. The canonical objects of the field &mdash; the sealed-bid tender, the ascending auction, the clearinghouse, the deferred-acceptance match &mdash; are all specified as procedures run <em>by someone</em>, and the someone is load-bearing. It collects the bids and keeps them sealed; it applies the allocation rule and announces the winner; it holds the earnest deposits that make a bid more than talk; and it maintains the record on which a losing bidder&rsquo;s complaint can be adjudicated. Milgrom (2017) is explicit that a great deal of practical auction design is the design of the institution that runs the auction, not merely of the rule it applies.
                    </p>
                    <p>
                        The venue is not free. Rothkopf, Teisberg, &amp; Kahn (1990) explain the near-absence of second-price auctions in practice by the bidder&rsquo;s reasonable distrust of an auctioneer who both learns the highest bid and computes the payment from the second; Ausubel &amp; Milgrom (2006) extend the diagnosis to the combinatorial case. Both accounts share a shape: a mechanism&rsquo;s theoretical properties are contingent on the venue behaving, and the venue&rsquo;s behaving is not itself a theorem. Where the venue is a firm, the contingency is managed by reputation and by law. Where the venue is a program on a public network, it can be managed by making the program&rsquo;s conduct checkable &mdash; but the program still holds something, and what a program holds during formation is a position that no participant has bonded.
                    </p>
                    <p>
                        That last observation is what motivates the present treatment. A settlement layer of the kind analyzed here makes performance self-enforcing between strangers by having each side lock a deterrent against its own conduct: the buyer twice the payment, each seller twice the value the chain has accumulated through its own link, with the whole process settled by a single call the buyer alone may make, all orders together or none. The security of that arrangement is an equilibrium property of exactly those locked positions. A venue that additionally holds bid deposits, or that can release a party&rsquo;s funds, introduces a position the equilibrium analysis does not cover: at best a second exposure the participant must price separately, at worst a discretionary hand on the path by which the deterrents are released. The question this paper asks is therefore not &ldquo;what venue should sit above bonded settlement?&rdquo; but &ldquo;how much of a venue&rsquo;s work can be done by nobody at all?&rdquo;
                    </p>
                </PaperSubsection>
                <PaperSubsection title="1.2 Contribution">
                    <p>
                        We analyze two mechanisms by which an offer forms above such a settlement layer, and we analyze them with the ordinary tools: mechanism classes, price-discovery properties, incentive properties on both sides, and stability in the matching-theoretic sense.
                    </p>
                    <ol className="space-y-2 list-decimal pl-6 text-sm">
                        <li><strong>Exclusion by signature order.</strong> A commitment is admitted to settlement only on two signatures over one struct. It follows that the order in which the two signatures are produced is itself a market primitive: a buyer that signs <em>first</em> and solicits <Math>{"k"}</Math> candidates has released <Math>{"k"}</Math> structs that any of their recipients can complete alone, while a buyer that signs <em>last</em> has released none, and its single closing signature is at once the selection and the commitment. What signing first costs depends on where the position sits, and the settlement layer is the stricter of the two places. A solicitation that opens a process exposes the buyer to all <Math>{"k"}</Math>, the layer relating them in no way; a solicitation inside an open process exposes it to one, because each order&rsquo;s signed cumulative figure must agree with an accumulator that the first admitted order advances &mdash; a second, positional exclusion the layer supplies for nothing. Signing last obtains both uniformly, and obtains with them what exclusion alone does not confer: which answer becomes the deal is the buyer&rsquo;s to decide, not the quickest candidate&rsquo;s (&sect;3.2).</li>
                        <li><strong>Two mechanisms, classified.</strong> The <em>dispatch race</em> is a posted-price mechanism with simultaneous solicitation: no participant makes a report, and the candidate&rsquo;s only decision is whether to answer. The <em>request for quotes</em> is a sealed-bid first-price procurement auction with an announced reserve and no commitment to an allocation rule. The pairing is not accidental. Hagerty &amp; Rogerson (1987) characterize the dominant-strategy, individually rational, budget-balanced bilateral trading mechanisms as posted-price mechanisms; the race leg is that class, and the quote leg is what one buys price discovery with when the posted class does not fit (&sect;&sect;4.1, 5.1).</li>
                        <li><strong>No second price without a second signature.</strong> The winner is paid a figure that is a field of the struct it signed. Any allocation rule paying the winner a figure computed from rival reports therefore requires soliciting the winner&rsquo;s signature a second time, at that figure, which the winner may decline. Vickrey&rsquo;s (1961) rule is unavailable here not because it is imprudent but because it is not implementable without a party able to bind the winner without its signature &mdash; which is exactly the venue (&sect;5.3).</li>
                        <li><strong>The participation constraint is a balance.</strong> Each draft states the value the chain has accumulated through the answering candidate&rsquo;s link, and the settlement layer will require twice that figure from it. The quantity that decides participation is therefore observable, stated in advance, position-dependent, and increasing in the candidate&rsquo;s own quote &mdash; a coupling between what a bidder asks and what a bidder must hold that ordinary procurement markets do not have (&sect;5.4). A corollary runs along the chain: a cheaper answer accepted at any position lowers the balance required at every later one, so competition at one link weakly widens the market at all the links after it (&sect;5.5).</li>
                        <li><strong>Composition without awareness.</strong> Formation&rsquo;s entire output is an object the settlement layer already accepts, and formation reads nothing from settlement but the arithmetic it must reproduce. We state the resulting interface-minimality property and its two consequences: no equilibrium result of the settlement layer needs re-derivation for market-formed offers, and the record that layer keeps cannot distinguish an offer that was raced for from one arranged by hand (&sect;6).</li>
                    </ol>
                    <p>
                        Section 2 fixes the setting and states, in the register this paper uses, the slice of the settlement layer the argument depends on. Section 3 develops signature order as a market primitive and disposes of the four venue roles. Sections 4 and 5 analyze the two mechanisms. Section 6 states the composition property. Section 7 concludes.
                    </p>
                </PaperSubsection>
            </PaperSection>

            <PaperSection title="2. The Setting">
                <PaperSubsection title="2.1 What the settlement layer holds">
                    <p>
                        The settlement layer this paper composes above has two operations and no others. <em>Commitment</em> forms one bilateral edge: a struct naming a buyer, a seller, a unit of account, a payment <Math>{"P \\geq 1"}</Math>, the value <Math>{"G"}</Math> the process has accumulated through this link, a digest of the parties&rsquo; agreement, a salt, and a deadline, admitted only when two signatures over that one struct recover to the two named parties. On admission the layer locks <Math>{"2P"}</Math> from the buyer and <Math>{"2G"}</Math> from the seller. <em>Resolution</em> closes the whole process: only the buyer may call it, and every open order settles together or none does, each seller receiving <Math>{"2G + P"}</Math> and the buyer <Math>{"P"}</Math> back per order &mdash; so cooperation leaves each seller ahead by its payment and the buyer down by exactly what it agreed to pay.
                    </p>
                    <p>
                        Four features of that layer are the ones this paper actually uses, and each is used more than once.
                    </p>
                    <PaperRun title="Two signatures, in no particular order.">
                        The layer verifies both signatures against a single digest and imposes no ordering between them. Which side signs first is therefore not a rule of the settlement layer at all; it is a convention of whatever produces the struct. Section 3 shows that this apparently empty degree of freedom is where the market lives.
                    </PaperRun>
                    <PaperRun title="No revocation, one deadline.">
                        A signature, once released, cannot be withdrawn; there is no cancellation operation, and none is needed, because the struct carries a deadline past which the layer refuses to admit it. A released signature is thus irrevocably live for a bounded interval and inert thereafter.
                    </PaperRun>
                    <PaperRun title="Orders are related only through their process, and there only by an accumulator.">
                        Each admitted order is identified by content. Two structs that differ anywhere &mdash; in the named seller, in the payment, in the salt &mdash; are different orders, and the layer&rsquo;s duplicate guard is per-order. Orders that open different processes are related in no other way at all. Orders within one process are related by exactly one quantity: each carries, as a signed field, the cumulative value the process is to hold once that order joins it, and the layer admits it only if the figure agrees with the running accumulator. The layer therefore does not, and cannot, know that two structs were drafted as alternatives for the same job &mdash; but where they extend the same process it does not need to, because whichever arrives second no longer agrees with the accumulator the first advanced.
                    </PaperRun>
                    <PaperRun title="One unit of account per process, and a positive floor.">
                        A process settles throughout in one unit, because the doubled bond schedule is a comparison of magnitudes and comparability is what makes it enforceable from the record alone; and a payment of zero is refused. Both constraints are inherited by any market that forms offers here: quotes within one solicitation are commensurable by construction, and a zero-priced answer is not an expressible object.
                    </PaperRun>
                    <PaperRemark title="What is out of scope, and stays out.">
                        The equilibrium that makes performance the sellers&rsquo; best response, and resolution the buyer&rsquo;s, is a property of the settlement layer and is taken here as given rather than re-derived: the comparison at each node is over the transfers the layer executes, and it contains no term for what a participant spends to perform. This paper adds a layer above and takes care to add nothing to that comparison. Where an argument below needs a notion of a participant&rsquo;s willingness to trade, it uses the one quantity the mechanism actually contains &mdash; the balance a wallet can commit &mdash; and says so.
                    </PaperRemark>
                </PaperSubsection>

                <PaperSubsection title="2.2 What a market has to add">
                    <p>
                        Roth (2008), summarizing two decades of practical market design, names three things a market has to accomplish before its allocation rule matters at all. It must provide <em>thickness</em> &mdash; enough participants on both sides that the match found is worth having. It must overcome <em>congestion</em> &mdash; when a market is thick, participants must still be able to make, receive, and evaluate enough offers in the time available. And it must be <em>safe</em> to participate in, in the sense that acting straightforwardly does not expose a participant to being exploited for having done so.
                    </p>
                    <p>
                        The third is where a settlement layer of the present kind changes the problem, because safety in a real market is two things that are usually supplied by one institution. There is <em>formation safety</em> &mdash; answering a solicitation must not expose the answerer to more than the deal it answered for &mdash; and there is <em>performance safety</em> &mdash; the counterparty, once matched, must actually deliver. Conventional venues supply both together: an exchange that holds margin is simultaneously making bidding safe and making settlement safe, and the two are not separable in its design. Here they are separable, and separated. Performance safety is the settlement layer&rsquo;s, complete before any market exists. Formation safety is all that the market layer must supply on its own, and the mechanisms below supply it structurally rather than by holding anything.
                    </p>
                    <p>
                        Thickness and congestion are treated in &sect;4.4, where they turn out to be the only two ways the mechanism&rsquo;s outcome can fail to be stable, and where both are parameters the soliciting party sets per transaction rather than properties of the mechanism.
                    </p>
                </PaperSubsection>

                <PaperSubsection title="2.3 The four roles a venue plays">
                    <p>
                        It is worth being precise about what would be lost by having no venue, so that the argument of &sect;3 can be checked role by role rather than in the aggregate. A venue that stands between a solicitation and a binding offer does four separable things.
                    </p>
                    <ol className="space-y-2 list-decimal pl-6 text-sm">
                        <li><strong>Mutual exclusion.</strong> Soliciting <Math>{"k"}</Math> offers must not oblige the solicitor to <Math>{"k"}</Math> deals. Some mechanism must ensure that at most one of the solicited offers can become binding.</li>
                        <li><strong>Discovery.</strong> A participant must be able to learn who may be asked, and on what terms, without a prior relationship with each of them.</li>
                        <li><strong>An anti-reneging stake.</strong> An offer that costs nothing to make and nothing to abandon is weak evidence of availability; venues therefore take earnest deposits, bid bonds, or membership stakes.</li>
                        <li><strong>Verifiable selection.</strong> A losing participant must be able to check that the announced rule was the rule applied &mdash; the property that makes a sealed-bid process a mechanism rather than a conversation.</li>
                    </ol>
                    <p>
                        Sections 3.2 and 3.3 take these in turn. The first is answered by a theorem about signature order; the second by reading a permissionless registry rather than an admitted membership; the third by making the answer itself the stake; and the fourth by observing that the property is not needed, because the mechanism it would police was never a commitment in the first place &mdash; which is a real cost, accounted for in &sect;5.3 rather than argued away.
                    </p>
                </PaperSubsection>
            </PaperSection>

            <PaperSection title="3. Signature Order as a Market Primitive">
                <PaperSubsection title="3.1 Three states of one artifact">
                    <p>
                        Everything exchanged during formation is the same object in one of three states, and the states differ only in how many signatures the object carries.
                    </p>
                    <p>
                        A <em>draft</em> carries none. It is a fully specified commitment struct &mdash; parties, unit, payment, accumulated value, agreement digest, salt, deadline &mdash; that no one has signed. It is structurally inert: the settlement layer will not admit it, and no recipient can make it admissible alone. Sending a draft is therefore a communication and nothing more, and the mechanisms below rely on the recipient being able to establish that: an answering party checks that the draft names it, that the agreement attached hashes to the digest the struct commits to, and that the terms in the agreement do not contradict the struct it would be bonded against, and refuses to answer otherwise.
                    </p>
                    <p>
                        An <em>answer</em> carries one signature, the candidate&rsquo;s. It is binding-if-committed and otherwise inert: it obliges its author to exactly the deal stated in the struct it signed, and only if the buyer completes it, and only until the deadline inside it. It requires no balance to produce &mdash; the layer pulls nothing until a commitment is admitted &mdash; so a candidate holding no tokens at all can answer, and will simply fail at commitment if selected while still unfunded.
                    </p>
                    <p>
                        A <em>commitment</em> carries both signatures and is the only state the settlement layer has a name for. Producing it is the buyer&rsquo;s single act, and it is simultaneously the selection of a counterparty and the formation of the obligation.
                    </p>
                </PaperSubsection>

                <PaperSubsection title="3.2 Exclusion by signature order">
                    <p>
                        The venue&rsquo;s first role, mutual exclusion, is the one that seems most obviously to require held state, and it is the one that does not.
                    </p>
                    <FormalBlock label="Proposition 3.1 (Exclusion by signature order).">
                        <p>
                            Let a buyer solicit <Math>{"k \\geq 2"}</Math> candidates for one position, sending each a commitment struct naming that candidate as seller and differing from the others in at least the seller field.
                        </p>
                        <p>
                            <em>(a) Buyer-first, where the position opens the process.</em> If the struct carries no process identifier, so that admitting it creates one, and the buyer signs each of the <Math>{"k"}</Math> structs before sending it, then each solicited candidate can unilaterally make its struct admissible, the settlement layer relates the <Math>{"k"}</Math> resulting processes in no way, and the buyer&rsquo;s worst-case exposure is <Math>{"k"}</Math> commitments with <Math>{"2P"}</Math> locked against each.
                        </p>
                        <p>
                            <em>(a&prime;) Buyer-first, where the position extends an open process.</em> If the struct names a process already open, then at most one of the <Math>{"k"}</Math> can ever be admitted, whatever the buyer signed: the accumulator supplies a second, positional exclusion. The buyer&rsquo;s exposure is one commitment &mdash; but which one is decided by whichever candidate reaches the network first.
                        </p>
                        <p>
                            <em>(b) Candidate-first.</em> If the structs go out unsigned and the buyer signs exactly one of the returned answers, then at either kind of position at most one commitment can ever be admitted from the solicitation, and it is the one the buyer chose.
                        </p>
                    </FormalBlock>
                    <Proof>
                        For <em>(a)</em>: admission requires two valid signatures over one struct. A candidate holding a buyer-signed struct naming itself supplies the second, so each of the <Math>{"k"}</Math> structs is unilaterally admissible. A struct that opens a process is identified by its own signed digest, so the <Math>{"k"}</Math> structs open <Math>{"k"}</Math> distinct processes, and the layer&rsquo;s per-order duplicate guard &mdash; keyed on the order&rsquo;s content-derived identifier &mdash; never fires across them. Nothing else in the layer relates them: it has no notion of a solicitation, no per-signer nonce, no revocation, and no cross-process state, so a released buyer signature stays live until its deadline. All <Math>{"k"}</Math> may therefore be admitted, and each locks <Math>{"2P"}</Math> from the buyer.
                        {" "}For <em>(a&prime;)</em>: a struct extending an open process carries, as a signed field, the cumulative value the process is to hold once this order joins it, and the layer admits the order only if that figure equals the running accumulator plus this order&rsquo;s own payment. The <Math>{"k"}</Math> rivals are drafted against one accumulator state, and admitting any one of them advances it by that order&rsquo;s payment, which is at least one unit since a payment of zero is refused. Every remaining rival&rsquo;s signed figure therefore no longer agrees, and its admission is refused. This exclusion is arithmetic rather than nominal: it does not depend on the rivals differing in any field, and the buyer cannot repair it by re-signing, since its signature is over the figure that has gone stale.
                        {" "}For <em>(b)</em>: an unsigned draft is not admissible for any recipient, and an answer carrying only the candidate&rsquo;s signature is still short of the two the layer requires. The buyer produces exactly one signature; a signature is over one struct; hence at most one struct in the solicitation ever carries two, and it is the one the buyer signed. <span className="italic">&#9633;</span>
                    </Proof>
                    <p>
                        The proposition is elementary, and the interesting part is that its two buyer-first cases fail differently. Where the solicitation opens the process it fills, buyer-first multiplies the solicitor&rsquo;s exposure by the size of its own search: <Math>{"k"}</Math> signatures released are <Math>{"k"}</Math> commitments the buyer can be held to, and the layer, having no notion that they were alternatives, admits them all. Within an open process the layer is stricter, and stricter than a market designer would have thought to ask for &mdash; the rivals exclude one another arithmetically, because each order&rsquo;s signed figure must agree with an accumulator that admitting any order advances. Buyer-first at such a position therefore costs the buyer not its bond but its <em>selection</em>: whichever candidate reaches the network first is the counterparty, and every other answer becomes unusable.
                    </p>
                    <p>
                        That second case is the one that matters for reading either mechanism as market design, because the positions a solicitation actually fills within a composed process are positions inside it. What candidate-first buys there is precisely the thing a market layer exists to supply. Exclusion the settlement layer would have supplied anyway; <em>choosing</em> it will not supply, and buyer-first hands that choice to whoever is quickest to broadcast. The naive design is thus wrong twice over and for two unrelated reasons, which is worth noticing because a designer who patches the first &mdash; by soliciting only at depth, where over-exposure is impossible &mdash; still has the second. Reversing the signing order answers both at once, with one rule that does not need to know which kind of position it is filling. That uniformity is what lets the same choreography run at any position in a chain, and it is also why the settlement layer&rsquo;s indifference to signature order, noted in &sect;2.1, is not the idle degree of freedom it looks like.
                    </p>
                    <PaperRemark title="The asymmetry is the buyer&rsquo;s to exploit.">
                        Part <em>(b)</em> gives the buyer a bounded exposure that grows not at all in <Math>{"k"}</Math>, while each candidate&rsquo;s exposure is bounded by the single deal it answered for. This is not an accident of the mechanism but an inheritance: the settlement layer already gives the buyer the sole power to close a process, and the market layer gives it the sole power to open one. Both powers are the same structural fact seen at two altitudes, and neither is discretion over anyone else&rsquo;s position &mdash; a candidate that is not selected is not thereby made worse off in any respect the mechanism can express.
                    </PaperRemark>
                </PaperSubsection>

                <PaperSubsection title="3.3 The remaining three roles">
                    <PaperRun title="Discovery is a registry read, not an admission.">
                        The candidate set is derived, at the moment of solicitation, from the participants who have registered themselves and published what they sell. Registration is permissionless and backed by a refundable stake in the network&rsquo;s base asset rather than by any admitting authority&rsquo;s judgment; withdrawing the stake removes the entry from what readers surface, while leaving anything already agreed intact. A buyer forming an offer reads that set live and keeps the entries whose published terms can price the position at hand. Two properties follow that matter for the analysis. The set is not a roster the mechanism maintains, so an empty result means genuine absence rather than a failure to enumerate; and what a candidate offers, and at what price, is the candidate&rsquo;s own declaration, while which of the declared offers is taken is the buyer&rsquo;s decision. Neither side sets the other&rsquo;s half.
                    </PaperRun>
                    <PaperRun title="The answer is the stake.">
                        A venue takes an earnest deposit because a bid is otherwise cheap talk. Here the answer <em>is</em> the bond, in the precise sense that the object a candidate signs to signal availability is the same object that will oblige it if the buyer completes it. A candidate cannot signal availability more cheaply than by becoming bound-if-selected, because there is nothing else to send. This dispenses with the deposit and, with it, with the deposit&rsquo;s costs: a losing answer forfeits nothing, requires no refund, and needs no cancellation, since it expires inert at the deadline the buyer fixed inside every draft of the solicitation. What remains as a residual signal of seriousness is the registration stake, which is a standing commitment rather than a per-offer one.
                    </PaperRun>
                    <PaperRun title="Verifiable selection is not available, and is not needed for the same reason.">
                        A sealed-bid venue must let a loser check that the announced rule was applied, because in a committed mechanism the loser has a claim if it was not. Here the buyer announces no rule it is bound by: the default is the cheapest verified answer, and the buyer may take any answer instead. There is consequently nothing for a loser to audit, and also nothing for a loser to have lost. The cost of this is real and is not the auditability &mdash; it is the incentive consequence of non-commitment, which is analyzed at &sect;5.3 rather than disposed of here. Where parties want the selection itself to be evidenced, that is a matter for what they compose above the settlement layer alongside the process, and it is an attestation rather than a venue: it records what was chosen without acquiring the power to choose.
                    </PaperRun>
                    <MarketFormationSwimlaneFigure className="my-8" />
                </PaperSubsection>
            </PaperSection>

            <PaperSection title="4. The Dispatch Race">
                <PaperSubsection title="4.1 Mechanism class">
                    <p>
                        In the dispatch race the buyer builds one draft per candidate, priced at that candidate&rsquo;s own published figure for the position, and sends them out unsigned and simultaneously. A candidate answers by countersigning the draft <em>as it stands</em>. The buyer verifies each answer by requiring it to be the struct the buyer itself drafted, hash for hash, and by recovering the signature against its own copy rather than against anything the reply echoes. Answers accumulate for a window the buyer chooses; at the close, the cheapest verified answer wins by default, ties break by arrival order, and the buyer may instead take any answer that arrived, or close the window early. The number of candidates solicited and the length of the window are the buyer&rsquo;s policy for that transaction, recorded nowhere and carried by nothing.
                    </p>
                    <p>
                        The classification follows from what the candidate is asked. The candidate makes no report: the price in the draft is the price the candidate published before the solicitation existed, and the candidate&rsquo;s action set is <Math>{"\\{\\text{answer}, \\text{do not answer}\\}"}</Math>. This is a posted-price mechanism with simultaneous solicitation and buyer-side selection &mdash; formally an assignment procedure over an already-priced set, not an auction, since no participant submits a figure that the allocation rule then operates on.
                    </p>
                    <p>
                        Hagerty &amp; Rogerson (1987) show that in bilateral trade the mechanisms which are dominant-strategy incentive compatible, individually rational, and budget balanced are the posted-price mechanisms &mdash; those in which the terms of trade do not depend on either party&rsquo;s report. Their setting includes a mediator computing the outcome from reports and this one has no mediator at all, so the result is not applied here so much as recognized: the reason the race leg has clean incentive properties is the reason their theorem identifies, namely that there is no report for the terms to depend on. A venue-free market that wants dominant strategies is pushed toward posted prices by the same force that pushes a mediated one, and rather harder, since it has nobody to compute a report-dependent rule even if it wanted one.
                    </p>
                </PaperSubsection>

                <PaperSubsection title="4.2 Where price discovery happens">
                    <p>
                        The race performs no price discovery, and the observation is sharper than it first sounds. The buyer reads the published terms of every discovered candidate that can price the position <em>before</em> soliciting anyone, sorts them, and solicits the cheapest <Math>{"k"}</Math>. The prices are therefore not private information to be elicited; they are already common knowledge to the buyer at the moment of solicitation. What the race searches over is <em>availability</em> at those prices &mdash; whether the candidate whose published figure is lowest is in fact willing and able to take this job now.
                    </p>
                    <p>
                        This is Stigler&rsquo;s (1961) fixed-sample search with the roles of the two unknowns exchanged. Stigler&rsquo;s buyer samples <Math>{"k"}</Math> sellers to learn a distribution of prices and takes the lowest draw, trading the cost of an additional query against the expected improvement in the minimum. Here the price distribution is observed in full at no cost, and what the sample buys is the probability that the cheapest <em>available</em> candidate is found &mdash; the buyer walks the published price order and takes the first that answers, but does so in parallel rather than sequentially. Choosing <Math>{"k"}</Math> is then a trade between the cost of an additional message and the risk that all <Math>{"k"}</Math> cheapest candidates are unavailable, which is a materially different calculation from Stigler&rsquo;s and a considerably cheaper one.
                    </p>
                    <p>
                        Price discovery has not disappeared; it has moved to publication. A candidate that publishes a figure is making a standing, public, unilateral price statement of the sort Hayek (1945) treats as the market&rsquo;s informational output, and it is disciplined by the fact that buyers observe the whole published set before they solicit anyone. This is the mechanism&rsquo;s escape from the difficulty Diamond (1971) identifies: with strictly positive search costs and sequential search, posted prices unravel toward the seller-optimal figure, because a buyer facing a cost to check one more seller will accept a small overcharge rather than pay it. The race removes the premise. Observing the whole published set costs the buyer nothing, and the marginal cost of soliciting one more candidate is one message; the buyer&rsquo;s search cost is therefore near zero exactly where Diamond&rsquo;s argument needs it to be positive. What remains costly is availability, and availability is not something a candidate can overcharge for.
                    </p>
                    <PaperRemark title="Publication is not a commitment to trade.">
                        A published figure is not an offer in the contractual sense and the mechanism does not treat it as one: a candidate may decline any draft for any reason, and declining costs it nothing beyond the transaction it declined. What publication commits a candidate to is the terms on which it will be asked. This is the ordinary posture of a catalogue rather than of a firm order, and it is the reason the race can solicit widely without any candidate having pre-committed capacity to it.
                    </PaperRemark>
                </PaperSubsection>

                <PaperSubsection title="4.3 Incentives on both sides">
                    <PaperRun title="The candidate has nothing to shade.">
                        Because the draft is priced at the candidate&rsquo;s own published figure and verification requires the answer to be that exact struct, the candidate cannot improve its terms by answering differently &mdash; an answer that alters anything is discarded rather than negotiated. Its decision is binary and its exposure if it answers is exactly the deal in front of it, bounded by the deadline. Within the single-position problem, answering whenever the deal is one the candidate is willing to perform is therefore dominant: there is no rival&rsquo;s behaviour to condition on, no winner&rsquo;s curse, since the price is the candidate&rsquo;s own and the common value component is absent, and no cost to losing. What the single-position problem omits is capacity: a candidate with finite capacity that holds several live answers is choosing among them, and answering a marginal draft may forgo a better one that has not yet arrived. Capacity is the one genuine strategic dimension the race leaves the candidate, and the mechanism gives it no instrument for managing it other than declining.
                    </PaperRun>
                    <PaperRun title="The buyer&rsquo;s award and contract are one event.">
                        In conventional procurement, award and contract are separate. The interval between them is where requalification, renegotiation, and hold-up live, and a substantial part of procurement law exists to govern it. Here the interval does not exist: the buyer&rsquo;s single signature is the selection, and it is the commitment. The buyer cannot select and then reopen terms, because there is no state in which it has selected and not yet committed; and it cannot commit at terms other than those the winner signed, because the winner&rsquo;s signature is over the struct and any other struct is a different object with no signature on it. The collapse of award and contract into one act is what the closing sentence of Proposition 3.1 <em>(b)</em> actually buys.
                    </PaperRun>
                    <PaperRun title="Timing rules, and why the window is soft in the direction that matters.">
                        Roth &amp; Ockenfels (2002) show that the rule for ending an auction is not a detail: hard-close auctions attract last-moment bidding that soft-close ones do not, because a hard close makes late arrival strategically valuable. The race has a hard close in the buyer&rsquo;s clock, but the incentive to snipe is absent, because a late answer cannot improve on an earlier one at the same price &mdash; the tie-break is arrival order, so lateness is weakly bad, and the price is not something the answer can move. In the other direction, the buyer&rsquo;s ability to close early on the answers in hand makes the window a maximum rather than a fixed duration, which removes the incentive for the <em>buyer</em> to wait out a market that has already answered. The deadline inside the struct plays a different role again: it is not a bidding deadline but the interval over which a candidate&rsquo;s exposure runs, and it is the same for every candidate in one solicitation, since one deadline is fixed for the whole draft set. Read against the unraveling literature (Roth &amp; Xing, 1994), where exploding offers are the instrument by which one side pressures the other into deciding early, the direction is inverted: the exploding element here is the <em>candidate&rsquo;s</em> answer, and its expiry protects the candidate rather than pressuring it.
                    </PaperRun>
                </PaperSubsection>

                <PaperSubsection title="4.4 Stability, and the only two ways it fails">
                    <p>
                        The race allocates one position among candidates, which invites the matching-theoretic question (Gale &amp; Shapley, 1962; Roth &amp; Sotomayor, 1990): is the outcome stable &mdash; is there a buyer and a candidate who would both rather be matched to each other than to what the mechanism gave them?
                    </p>
                    <FormalBlock label="Proposition 4.1 (Stability within the responsive set).">
                        <p>
                            Fix one position, an invited set <Math>{"K"}</Math> with published prices <Math>{"\\{p_i\\}_{i \\in K}"}</Math> observed by the buyer before invitation, and a window. Let <Math>{"A \\subseteq K"}</Math> be the candidates whose verified answers arrive within it, and let the buyer apply the default rule, matching to <Math>{"w = \\arg\\min_{i \\in A} p_i"}</Math> with ties broken by arrival order. Then no blocking pair exists whose candidate lies in <Math>{"A"}</Math>. Every blocking pair therefore involves a candidate outside <Math>{"K"}</Math> or in <Math>{"K \\setminus A"}</Math>.
                        </p>
                    </FormalBlock>
                    <Proof>
                        Suppose <Math>{"(B, j)"}</Math> blocks with <Math>{"j \\in A"}</Math>. Blocking requires the buyer to strictly prefer <Math>{"j"}</Math> to <Math>{"w"}</Math>, so <Math>{"p_j < p_w"}</Math>. But <Math>{"j \\in A"}</Math> and <Math>{"p_j < p_w"}</Math> contradict <Math>{"w = \\arg\\min_{i \\in A} p_i"}</Math>. If instead <Math>{"p_j = p_w"}</Math> the buyer is indifferent and the pair does not block strictly; if <Math>{"p_j > p_w"}</Math> the buyer does not prefer <Math>{"j"}</Math>. Hence no such <Math>{"j"}</Math> exists, and any blocking candidate is one that was never invited or whose answer did not arrive in time. <span className="italic">&#9633;</span>
                    </Proof>
                    <p>
                        The two residual sources of instability are exactly Roth&rsquo;s (2008) first two market failures. A blocking candidate outside <Math>{"K"}</Math> is a <em>thickness</em> failure: the market was there and the buyer did not reach it. A blocking candidate in <Math>{"K \\setminus A"}</Math> is a <em>congestion</em> failure: the buyer reached it and the answer did not come back in time. What is unusual is where the two parameters sit. Both <Math>{"k"}</Math> and the window are chosen by the buyer for that transaction and stored nowhere &mdash; they are not properties of the mechanism, not attributes of any published profile, and not terms of any agreement. A buyer that wants a thicker market raises <Math>{"k"}</Math> at the price of <Math>{"k"}</Math> messages; a buyer that wants less congestion lengthens the window at the price of waiting. The mechanism&rsquo;s stability is thus parameterized entirely by the party that bears the cost of the parameter, which is an unusually clean incidence.
                    </p>
                    <p>
                        Two qualifications keep the proposition honest. It is stated for the default rule; when the buyer exercises the override, the outcome is stable with respect to whatever preference the override expresses, provided that preference is complete over <Math>{"A"}</Math>, and the proof goes through verbatim with <Math>{"p"}</Math> replaced by that preference&rsquo;s index. And it is a one-position result: the mechanism fills one position per solicitation, and a buyer filling several runs them in sequence, each winner entering the next solicitation&rsquo;s inputs. Sequential composition of stable one-position matches is not in general a stable many-to-many match, and the mechanism claims no such thing.
                    </p>
                </PaperSubsection>
            </PaperSection>

            <PaperSection title="5. The Request for Quotes">
                <PaperSubsection title="5.1 Mechanism class">
                    <p>
                        The race asks a candidate whether it is available at the price it published. Many jobs are not like that: the specification is particular, the published figure is not the right figure for it, and the buyer wants the market to tell it what <em>this</em> job costs. The request for quotes is the same choreography with one inversion &mdash; the candidate authors the price.
                    </p>
                    <p>
                        Two situations shade into each other here, and they are reached by different routes. Where candidates publish a priceable item but the published figure does not fit the job at hand, the buyer solicits the same discovered set it would have raced and asks it to re-price within a ceiling; this is the case that arises when a market is formed from a composed process, since a candidate whose published terms cannot price the position is not in the candidate set to begin with. Where nothing published fits at all, there is no discovered set to solicit, and the buyer names its counterparty and requests a quote from it directly. The choreography analyzed below is one and the same in both; only how the solicited set is arrived at differs, and nothing in the analysis turns on which route produced it.
                    </p>
                    <p>
                        The buyer builds the draft at its own <em>ceiling</em>: the highest figure it is prepared to pay, substituted into the agreement at the fields the buyer itself names as the priced ones. Each candidate receives that draft. A candidate answers by returning a counter-draft in which the same substitution has been applied at the candidate&rsquo;s own figure, and in which the payment and the accumulated value the settlement layer will bond it against have both been re-derived from that figure. The buyer verifies not by inspecting the difference but by <em>reconstruction</em>: it applies the same substitution to its own draft at the figure the reply names and requires the reply to match hash for hash, checking the ceiling and the positive floor against its own copy of the request rather than against anything the reply asserts. The cheapest verified quote wins by default; the buyer may take another; the buyer then signs exactly one.
                    </p>
                    <p>
                        In form this is a sealed-bid first-price procurement auction with an announced reserve. Sealed: each candidate receives its own draft and sees no other candidate&rsquo;s quote, and the mechanism reveals nothing between solicitation and selection because there is nothing holding the quotes that could reveal them. First-price: the winner is paid the figure it named, for reasons made structural in &sect;5.3. Reserve: the ceiling caps every admissible quote, and it caps them enforceably, because a quote above it fails the buyer&rsquo;s verification and is discarded rather than negotiated down.
                    </p>
                    <PaperRemark title="The ceiling is enforceable because it is disclosed, which is the cost of enforcing it.">
                        The reserve in this mechanism is not a figure the buyer keeps and applies afterwards; it is a field of the struct every invited candidate receives, and that is exactly why a quote above it cannot survive verification. The two properties are the same property. Optimal-auction theory treats the reserve as a screening instrument the seller sets against a distribution of types and does not generally require it to be common knowledge in this form (Myerson, 1981; Riley &amp; Samuelson, 1981), and the standard consequence of announcing it is that quotes bunch toward it as competition thins &mdash; with one invited candidate, a quote at the ceiling is the obvious play. A buyer therefore pays for the ceiling&rsquo;s enforceability in information disclosed, and the two instruments it retains against that are the ones already in its hands: setting the ceiling honestly rather than optimistically, and inviting more candidates. The race leg has the opposite disclosure profile &mdash; the draft is priced at the candidate&rsquo;s own published figure, so the buyer reveals nothing about what it would have paid.
                    </PaperRemark>
                    <p>
                        In substance the quote leg is nearer a negotiation than an auction, and the distinction is Bulow &amp; Klemperer&rsquo;s (1996). Their comparison &mdash; an auction with one additional bidder against a negotiation with an optimally set reserve &mdash; presumes the auctioneer commits to the allocation rule; that commitment is what makes an auction an auction. Here the buyer commits to nothing but the ceiling. It may take a quote that is not the lowest, and it may take none. Bajari, McMillan, &amp; Tadelis (2009) find empirically that negotiation outperforms competitive bidding precisely where the specification is complex or incomplete and where the buyer&rsquo;s judgment about the counterparty matters &mdash; which is the population of jobs for which a buyer reaches for a quote leg rather than a race in the first place. The mechanism is therefore well matched to its use, and it should be classified honestly: an auction&rsquo;s form, a negotiation&rsquo;s commitment structure.
                    </p>
                </PaperSubsection>

                <PaperSubsection title="5.2 A quote moves the price and nothing else">
                    <p>
                        The reconstruction discipline deserves a formal statement, because it is what makes a quote comparable to the request it answers.
                    </p>
                    <FormalBlock label="Proposition 5.1 (Price-only variation).">
                        <p>
                            Let the buyer&rsquo;s request be a draft <Math>{"D"}</Math> built at ceiling <Math>{"\\bar{q}"}</Math> over a set of priced fields <Math>{"F"}</Math> named by the buyer, and let <Math>{"\\sigma(D, F, q)"}</Math> denote the substitution that writes <Math>{"q"}</Math> at every field of <Math>{"F"}</Math> and re-derives the payment, the accumulated value, and the agreement digest accordingly. A reply <Math>{"R"}</Math> naming figure <Math>{"q"}</Math> is accepted only if <Math>{"1 \\leq q \\leq \\bar{q}"}</Math> and <Math>{"R"}</Math> is identical to <Math>{"\\sigma(D, F, q)"}</Math> as a struct, with its attached agreement hashing to that struct&rsquo;s digest and its signature recovering to the candidate the buyer drafted against. Consequently a reply differing from <Math>{"D"}</Math> in any respect not determined by <Math>{"q"}</Math> through <Math>{"\\sigma"}</Math> is rejected.
                        </p>
                    </FormalBlock>
                    <Proof>
                        The buyer never reads <Math>{"R"}</Math> to learn what changed. It computes <Math>{"\\sigma(D, F, q)"}</Math> from its own retained <Math>{"D"}</Math>, taking from <Math>{"R"}</Math> only the scalar <Math>{"q"}</Math>, and compares struct hashes. Struct-hash equality is therefore equality in every field, including the parties, the unit, the salt, the deadline, and the agreement digest; the separate check that <Math>{"R"}</Math>&rsquo;s attached agreement hashes to that digest extends the equality from the struct to the terms; and recovery is performed against the buyer&rsquo;s reconstruction, so a signature over any other struct fails. The bounds on <Math>{"q"}</Math> are evaluated against <Math>{"D"}</Math>, which the reply cannot influence. <span className="italic">&#9633;</span>
                    </Proof>
                    <p>
                        Two consequences are worth drawing out. First, the priced set <Math>{"F"}</Math> is the buyer&rsquo;s, not the candidate&rsquo;s and not the mechanism&rsquo;s: the buyer says which figures a quote may move, and a candidate cannot enlarge that set by returning a reply that moves more, because the reply would not reconstruct. A quote is thus a scalar answer to a question the buyer posed, which is what makes quotes from different candidates commensurable at all. Second, the comparison is by reconstruction rather than by difference, and the distinction is not stylistic. A difference-based check must enumerate what may differ and is wrong if the enumeration is incomplete; a reconstruction-based check is a single equality and has no enumeration to be incomplete. This is the same reason the settlement layer identifies orders by content rather than by a list of their fields.
                    </p>
                </PaperSubsection>

                <PaperSubsection title="5.3 No second price without a second signature">
                    <p>
                        Vickrey (1961) showed that paying the winner the second-best figure makes truthful reporting dominant, and Klemperer (1999) traces how central that insight has been to the theory and how marginal to the practice. The practical objections are institutional: Rothkopf, Teisberg, &amp; Kahn (1990) argue that bidders will not truthfully reveal to an auctioneer who both learns the top figure and computes payment from the next, and Ausubel &amp; Milgrom (2006) develop the difficulties in richer settings. Those objections are about trusting a venue. Here the objection is different in kind, and it is structural.
                    </p>
                    <FormalBlock label="Proposition 5.2 (First price is forced).">
                        <p>
                            In a mechanism whose only settlement artifact is a struct that both parties sign, and in which the amount transferred to the winner is a field of that struct, no allocation rule that pays the winner a figure computed from other candidates&rsquo; reports is implementable without a party able to bind the winner to a struct it has not signed.
                        </p>
                    </FormalBlock>
                    <Proof>
                        Let the winner have answered at <Math>{"q_1"}</Math> and let the rule prescribe payment <Math>{"q_2 \\neq q_1"}</Math> computed from rival reports. The settlement layer transfers the payment field of the admitted struct, so admitting a struct that pays <Math>{"q_2"}</Math> requires a struct whose payment field is <Math>{"q_2"}</Math>; the winner&rsquo;s signature is over a struct whose payment field is <Math>{"q_1"}</Math>, and a signature over one struct is not a signature over another. Admission requires the winner&rsquo;s signature over the struct admitted. Hence either the winner is solicited a second time at <Math>{"q_2"}</Math> &mdash; which it may decline, so the rule is not an allocation rule but an offer &mdash; or some party supplies the winner&rsquo;s assent without the winner, which is the venue. <span className="italic">&#9633;</span>
                    </Proof>
                    <p>
                        The proposition disposes of a natural improvement and it should be read as a cost, not a virtue. The quote leg is not strategy-proof and cannot be made so within the design: a candidate&rsquo;s optimal quote depends on its beliefs about rival quotes and about the buyer&rsquo;s ceiling, exactly as first-price sealed bidding always does (Milgrom &amp; Weber, 1982; Klemperer, 1999), and the general impossibility results (Gibbard, 1973; Satterthwaite, 1975) leave no room to hope otherwise for a mechanism with a non-trivial report space and no mediator. The race leg has dominant strategies because it has no report; the quote leg has price discovery because it has one; and the design cannot have both, because the instrument that would buy both is a party with authority over the winner&rsquo;s signature. <em>Strategy-proofness is the price of dispensing with the venue</em>, and it is stated here rather than engineered around.
                    </p>
                    <PaperRemark title="The efficiency question, and why it is not answered.">
                        Myerson &amp; Satterthwaite (1983) establish that no mechanism for bilateral trade under two-sided private information can be simultaneously efficient, individually rational, and budget balanced. Their impossibility is about valuations and costs, and neither this market nor the settlement layer beneath it contains such a variable: the settlement layer moves payments and bonds over wallet balances, and this market layer adds a quote, which is a figure a candidate names rather than a valuation it holds. No efficiency claim is made here, and the mechanisms should not be read as attempting one. What they attempt is feasibility &mdash; that the parties who do trade are secured, and that finding a counterparty costs a message.
                    </PaperRemark>
                </PaperSubsection>

                <PaperSubsection title="5.4 The participation constraint is a balance">
                    <p>
                        Standard procurement theory locates the bidder&rsquo;s participation constraint in an unobservable private type: the bidder participates when the price it expects to win at covers what performing is worth to it. The constraint that actually governs participation here is a different object, and it is one the mechanism contains.
                    </p>
                    <p>
                        A draft states the value <Math>{"G"}</Math> the process has accumulated through the answering candidate&rsquo;s link, and the settlement layer will pull <Math>{"2G"}</Math> from that candidate when the commitment is admitted. On the quote leg, if the position sits behind an accumulated <Math>{"V_0"}</Math> and the candidate quotes <Math>{"q"}</Math>, then <Math>{"G = V_0 + q"}</Math> and the requirement is <Math>{"2(V_0 + q)"}</Math>. A candidate whose free balance in the process&rsquo;s unit is <Math>{"B"}</Math> can therefore be committed only where
                    </p>
                    <p className="text-center">
                        <Math display>{"2(V_0 + q) \\leq B \\quad \\Longleftrightarrow \\quad q \\leq \\tfrac{1}{2}B - V_0 ."}</Math>
                    </p>
                    <p>
                        Four properties of this constraint have no analogue in an ordinary procurement market, and each of them is a market-design fact rather than an implementation detail.
                    </p>
                    <ol className="space-y-2 list-decimal pl-6 text-sm">
                        <li><strong>It is stated in the request.</strong> The draft names <Math>{"G"}</Math>, so a candidate knows the exact balance a commitment will require of it before it answers. The one quantity that determines whether it <em>can</em> participate is common knowledge between the two parties at solicitation time &mdash; which is the reverse of the usual situation, where participation constraints are precisely what is private.</li>
                        <li><strong>It binds from above, jointly with the buyer&rsquo;s ceiling.</strong> The effective cap on a candidate&rsquo;s quote is <Math>{"\\min\\{\\bar{q},\\; \\tfrac{1}{2}B - V_0\\}"}</Math>. A candidate that raises its quote raises the balance it must hold, at two units of balance per unit of quote. No posted-price or sealed-bid procurement market couples what a bidder asks to what a bidder must hold in this way, and the coupling is not a friction added on top of the mechanism &mdash; it is the bonding schedule, seen from the market layer.</li>
                        <li><strong>It is position-dependent.</strong> <Math>{"V_0"}</Math> enters additively, so the same quote at a deeper position requires a larger balance. Depth filters the candidate set by balance, and thinness at depth is therefore a balance phenomenon before it is a preference phenomenon &mdash; a market can be thin at a late link while the same participants are plentiful at an early one.</li>
                        <li><strong>It is not checked when the answer is made.</strong> Answering requires a signature and no balance at all; a candidate holding nothing can quote, and a losing quote leaves it untouched. The constraint is enforced at commitment, where an unfunded winner&rsquo;s commitment simply fails. The design consequence is that the mechanism can afford not to screen for balance in advance: the remaining verified answers are a costless fallback, so an unfunded winner is a liveness event for one solicitation rather than a safety event for anyone.</li>
                    </ol>
                    <p>
                        Point (2) also disposes of a competitive dimension that procurement markets usually have and this one deliberately does not. Competition here cannot run on the size of the deterrent. The schedule is fixed by the mechanism at twice the accumulated value, identically for every candidate, so no candidate can offer the same price against a thinner deterrent, and no buyer can prefer one for having done so. The familiar failure of competitive procurement &mdash; the erosion of the performance bonds it asks for, as a way of winning on price &mdash; has no expression here, because the dimension does not exist in the strategy space. Competition runs on price, and on whatever non-price terms the buyer put in the draft; what deters each side is not a term either side can offer.
                    </p>
                </PaperSubsection>

                <PaperSubsection title="5.5 Competition upstream widens the market downstream">
                    <p>
                        Because the bond at each link is keyed to the value accumulated through it, a price agreed at one position propagates to the participation constraints at every later one.
                    </p>
                    <FormalBlock label="Proposition 5.3 (Downstream widening).">
                        <p>
                            Let a process chain have payments <Math>{"P_1, \\ldots, P_n"}</Math> in commitment order, so that the value accumulated through link <Math>{"i"}</Math> is <Math>{"G_i = \\sum_{j \\leq i} P_j"}</Math> and the balance required at link <Math>{"i"}</Math> is <Math>{"2G_i"}</Math>. Suppose formation at link <Math>{"m"}</Math> returns a figure lower by <Math>{"\\delta > 0"}</Math> than the alternative, with every other payment unchanged. Then for every <Math>{"i \\geq m"}</Math> the balance required at link <Math>{"i"}</Math> falls by <Math>{"2\\delta"}</Math>, and the set of candidates able to be committed at link <Math>{"i"}</Math> weakly expands. Links with <Math>{"i < m"}</Math> are unaffected.
                        </p>
                    </FormalBlock>
                    <Proof>
                        <Math>{"G_i"}</Math> is a sum over <Math>{"j \\leq i"}</Math>, and <Math>{"m \\leq i"}</Math>, so reducing <Math>{"P_m"}</Math> by <Math>{"\\delta"}</Math> reduces <Math>{"G_i"}</Math> by <Math>{"\\delta"}</Math> and <Math>{"2G_i"}</Math> by <Math>{"2\\delta"}</Math>. The constraint at link <Math>{"i"}</Math> is <Math>{"2G_i \\leq B"}</Math>; relaxing its left side weakly enlarges the set of balances satisfying it. Links with <Math>{"i < m"}</Math> are unaffected, <Math>{"G_i"}</Math> not depending on <Math>{"P_m"}</Math>. <span className="italic">&#9633;</span>
                    </Proof>
                    <p>
                        The reading is that a buyer&rsquo;s search at one position is not only a private saving. It relaxes the balance the winner itself must hold and the balance every later participant must hold, which is to say it makes the market at that position and at all the positions after it thicker &mdash; and thickness at depth is exactly what &sect;5.4(3) identified as the scarce thing. The externality runs one way, from a link to itself and to the links after it, which follows from the accumulator&rsquo;s being a running sum rather than from anything the market layer arranges. It is also the reason a buyer forming several positions has a weak ordering: forming the earlier ones first widens the field for the later ones, whereas the reverse order does not.
                    </p>
                    <p>
                        The same running sum has now done two separate jobs, and it is worth naming the coincidence because nothing in the design arranged it. It sets the size of the deterrent at each link, which is what Proposition 5.3 is about; and it is the quantity whose movement excludes rival drafts at a link once one of them settles, which is what Proposition 3.1<em>(a&prime;)</em> is about. One accumulator therefore prices the deterrent and closes the position, and a market layer that reproduces the figure faithfully &mdash; the obligation of &sect;6.2 &mdash; gets both properties without asking for either.
                    </p>
                </PaperSubsection>
            </PaperSection>

            <PaperSection title="6. Composing with a Market-Blind Settlement Layer">
                <PaperSubsection title="6.1 Interface minimality">
                    <p>
                        The composition property both mechanisms have is worth naming, because it is what allows a market to be added to a settlement layer whose guarantees were established without one.
                    </p>
                    <FormalBlock label="Definition 6.1 (Interface-minimal market layer).">
                        <p>
                            A market layer over a settlement layer <Math>{"S"}</Math> is <em>interface-minimal</em> if its entire output is an object <Math>{"S"}</Math> already accepts, formed only from inputs the parties themselves supply, and if <Math>{"S"}</Math>&rsquo;s acceptance of that object is conditioned on nothing the market layer did.
                        </p>
                    </FormalBlock>
                    <p>
                        Both mechanisms are interface-minimal. Their output is a dual-signed commitment, which is the object the settlement layer accepted before any market existed; their inputs are the parties&rsquo; signatures and published terms; and acceptance turns on the two signatures and the struct, never on provenance. The consequence is the one that matters for a paper that declines to re-derive the settlement equilibrium:
                    </p>
                    <FormalBlock label="Proposition 6.2 (No re-derivation).">
                        <p>
                            If a market layer is interface-minimal, then every equilibrium property of <Math>{"S"}</Math> holds unchanged for offers it forms.
                        </p>
                    </FormalBlock>
                    <Proof>
                        <Math>{"S"}</Math>&rsquo;s game begins at an admitted commitment and its payoffs are the transfers <Math>{"S"}</Math> executes. Interface minimality says the admitted object and the conditions of its admission are unchanged, and adds no transfer. The game, its node comparisons, and hence its equilibria are therefore literally the same objects. <span className="italic">&#9633;</span>
                    </Proof>
                    <p>
                        The proposition is nearly a tautology and is included because its contrapositive is the useful part. A market layer that holds a deposit adds a transfer, so its offers do not inherit; a market layer that can release a party&rsquo;s locked position changes the conditions of admission or of settlement, so its offers do not inherit; a market layer that requires the settlement layer to know a solicitation happened changes the acceptance condition, so its offers do not inherit. Each of those is a design that would have to earn its own equilibrium argument from scratch, and the argument would be about a different mechanism. This is the precise sense in which &ldquo;zero contracts&rdquo; is an analytical property rather than a boast about parsimony.
                    </p>
                </PaperSubsection>

                <PaperSubsection title="6.2 The reproduction obligation">
                    <p>
                        Interface minimality has one demanding obligation attached, and a market layer that neglects it fails silently rather than loudly. The winner&rsquo;s signature is over the exact struct the buyer drafted, and by the time the buyer signs, that struct must be rebuilt identically &mdash; every field, including those that depend on the rest of the process, since a link&rsquo;s accumulated value depends on the payments committed before it and its identity depends on its own salt and deadline.
                    </p>
                    <p>
                        A market layer therefore has to fix its reproduction inputs once, at drafting time, and reuse them at closing: one salt per position in the process and one deadline for the whole solicitation. It must then check, rather than assume: rebuild the struct at closing, compare it to the one the winner signed, and refuse to proceed on any difference. The failure mode this guards against is the quiet one &mdash; a rebuilt struct that differs in any field carries no valid seller signature, so proceeding would discard the winner&rsquo;s answer and produce a commitment that cannot be admitted, with nothing in the artifact to say why. Refusing loudly at the comparison converts a silent formation failure into a stated one, and it is the market layer&rsquo;s obligation because the settlement layer, being blind to the market, has no way to notice that the struct in front of it was supposed to match another.
                    </p>
                </PaperSubsection>

                <PaperSubsection title="6.3 What the record holds">
                    <p>
                        The settlement layer records the commitment it admitted and the resolution that closed it. It does not record the solicitation, the candidates, the answers not taken, or the fact that a market was consulted at all. An offer formed by racing a dozen candidates and an offer arranged between two parties who have worked together for years are, in the record, the same object.
                    </p>
                    <p>
                        This is a substantive property with a cost and a benefit, and both should be stated. The benefit is that there is nothing to reconcile: losing answers moved no value, so they generate no entry, no refund, and no obligation to account for a position that was never taken. A party reconstructing a process from the record obtains the complete set of transfers that occurred, because the set of transfers that occurred is exactly the set the winning pair generated. Whatever bookkeeping properties the settlement record has, market formation neither improves nor degrades them.
                    </p>
                    <p>
                        The cost is that the selection itself is not evidenced by the record. A buyer who must later demonstrate <em>how</em> it chose &mdash; to a counterparty, an auditor, or a forum ruling on the process while it stands open &mdash; cannot obtain that from the settlement layer, and must arrange for it as an attestation composed alongside the process. The design permits this and does not perform it: the mechanisms analyzed here produce the deal, not a narrative of how the deal was found. Recording the narrative is available to parties who want it, and the important structural point is that such a record is an observer of the selection and never a participant in it &mdash; it can attest what was chosen without acquiring any power to choose, which is what keeps it outside Proposition 6.2&rsquo;s contrapositive.
                    </p>
                </PaperSubsection>

                <PaperSubsection title="6.4 What a venue would cost">
                    <p>
                        The examination is worth completing in the other direction: for each of the four venue roles of &sect;2.3, what would a venue contract add, and what would it cost?
                    </p>
                    <p>
                        For <em>mutual exclusion</em>, nothing &mdash; Proposition 3.1 obtains it from signature order at no cost, and at any position inside an open process the accumulator has already supplied it, so a venue could only duplicate what the settlement layer does unasked. What a venue would have to add there is not exclusion but the selection exclusion by itself does not confer, and the reversed signing order delivers that by never releasing the signature a rival would need. Any contract-based alternative would be strictly worse, since it would have to hold or constrain a signature that is not in circulation. For <em>discovery</em>, nothing that a registry read does not already do, and a venue-maintained candidate list would be a roster, with the closed-set properties a roster has: an entry means admission by someone, and an empty result means the roster is incomplete rather than that the market is empty. For an <em>anti-reneging stake</em>, a venue could hold bid deposits, and the cost is exactly Proposition 6.2&rsquo;s contrapositive: the deposit is a position no participant bonded under the settlement analysis, so a candidate&rsquo;s participation calculus acquires a term the settlement equilibrium does not cover, and losing stops being free. For <em>verifiable selection</em>, a venue could make the buyer&rsquo;s rule binding and its application checkable, which is the one role that is genuinely lost. What it would buy is the commitment that Proposition 5.2 shows to be unavailable otherwise; what it would cost is a party with authority over the selection, and therefore over which of several bonded parties becomes obliged.
                    </p>
                    <p>
                        Two asymmetries decide the balance. The first is that the marginal role a venue adds is the one whose absence is a limitation on the buyer&rsquo;s ability to make promises to candidates, not on any candidate&rsquo;s safety: a candidate that answers is exposed to its own answer and to nothing the buyer&rsquo;s conduct can enlarge, whether or not a rule binds the buyer. The second is that the migration is not symmetric. A venue can be added above an interface-minimal market as an auxiliary that composes alongside the process, taking as inputs what the parties already exchange; a market built around a venue cannot later have it removed, because the choreography would have to be redesigned from the signature order up. Beginning without one is therefore also the reversible choice, which is the ordinary reason to prefer it.
                    </p>
                </PaperSubsection>
            </PaperSection>

            <PaperSection title="7. Conclusion">
                <p>
                    Market design has treated the venue as the thing being designed, and with good reason: an institution that holds bids, applies a rule, and keeps a record is what turns a set of preferences into an allocation. What this paper has argued is that a settlement layer with two particular properties &mdash; that a commitment requires two signatures over one struct, in no fixed order, and that nothing else about it is revocable &mdash; makes three of the venue&rsquo;s four roles obtainable without holding anything. Mutual exclusion is a consequence of who signs last &mdash; and, at any position within an open process, of an accumulator that refuses the second of two rivals whether or not anyone intended it to, so that what the signing order really secures there is not exclusion but the buyer&rsquo;s choice among the answers. Discovery is a read of a registry nobody admits participants to. The anti-reneging stake is the answer itself, since the only way to signal availability is to become bound-if-selected. What is genuinely lost is the fourth role, commitment to an allocation rule, and its loss has a precise consequence rather than a vague one: the winner is paid a field of the struct it signed, so first price is forced, and a strategy-proof quote leg is unavailable at any level of engineering effort.
                </p>
                <p>
                    The two mechanisms sit on opposite sides of that trade and are complementary for exactly that reason. The dispatch race asks nothing of a candidate but a decision, and inherits the incentive properties that the posted-price class has always had; its search is over availability rather than price, because the prices were published before anyone was asked, and its buyer-side search cost is one message per candidate, which is where the classical unraveling of posted-price markets under costly search loses its premise. The request for quotes buys price discovery for jobs a published figure does not fit, and pays for it in strategy-proofness and in the disclosure of the buyer&rsquo;s ceiling &mdash; a cap enforceable only because it sits inside the struct the candidate signs, and therefore visible to every candidate that is asked.
                </p>
                <p>
                    Two features of the resulting market have no counterpart in the venue-based tradition. The participation constraint is a balance rather than a valuation: it is stated in the request, increasing in the candidate&rsquo;s own quote at two units per unit, larger at deeper positions, and unchecked until the moment of commitment, which is what lets an unfunded answer cost nothing and a competing answer be a free fallback. And competition propagates along the chain, since a cheaper agreement at one position lowers the balance required at every later one, so that a buyer&rsquo;s search widens the market for participants it will never deal with. Neither is a feature the market layer arranged; both are the bonding schedule read from above.
                </p>
                <p>
                    The composition property is the one to keep. A market layer whose entire output is an object the settlement layer already accepts adds no transfer, no discretion, and no state that could drift, and the settlement layer&rsquo;s equilibrium therefore holds for market-formed offers as a matter of identity rather than of argument. The layer beneath never learns that markets exist; it goes on admitting commitments signed by two parties and closing processes at the buyer&rsquo;s call, and the record it leaves is silent about the search that produced the pair. That silence is the correct outcome. The parties who traded are secured by an equilibrium that was proved without reference to how they found each other, and finding each other cost a message.
                </p>
            </PaperSection>
        </PaperLayout>
    );
}
