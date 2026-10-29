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
import { KERNEL_EQUILIBRIUM } from "@figaro-protocol/sdk";

// The common trade of Section 1.3 renders the bond's figures from the
// equilibrium module, the one owner of the numbers;
// the other figures are arithmetic over them, done here once.
const EX = KERNEL_EQUILIBRIUM.example;
// The trade is a single order, a root order: G = P.
const EX_P = EX.payment;
const EX_G = EX.payment;
const EX_SELLER_PAYOUT = 2 * EX_G + EX_P;
const EX_BUYER_PAYOUT = EX_P;
// The platform's take at the twenty percent rate Section 4.2 uses.
const EX_TAKE = (0.2 * EX_P).toFixed(0);
// The time value of everything held for one week at five percent a year.
const EX_WEEK_TIME_VALUE = ((EX.held * 0.05 * 7) / 365).toFixed(2);

export const metadata: Metadata = withOg({
    title: "Coordination Substrates: Firm, Court, and Bond — Figaro Protocol",
    description:
        "A comparative institutional analysis of three substrates in four columns that make trade between strangers safe (the firm in its two business models, hierarchy and the platform; the court; and the parties' own bonded commitment) on ten axes: who bears the cost of making a promise good and to whom it is revenue, who holds the map, admission, discretion, the cost of instituting, jurisdiction dependence, failure modes, fiscal and regulatory legibility, who chooses the unit of account, and whether transparency, verifiability, and privacy hold together. The alignment result gives the bond the strangers' region the cost shapes assign it, and the whole region where a party is no person any legal order recognizes.",
});

function FormalBlock({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="border-l-2 border-default pl-6 my-3 space-y-3">
            <p className="text-sm font-semibold text-ink-heading">{label}</p>
            {children}
        </div>
    );
}

export default function CoordinationSubstratesPaper() {
    return (
        <PaperLayout slug="coordination-substrates"
            title="Coordination Substrates: Firm, Court, and Bond"
            subtitle="A Comparative Institutional Analysis of Trade Between Strangers"
            author="Figaro"
            date="August 2026, revised October 2026"
            watermark="Figaro Protocol · Preprint"
            abstract={
                <>
                    <p>
                        Every market between strangers runs on a <em>coordination substrate</em>: an institutional technology that makes a stranger&rsquo;s promise worth acting on. History supplies two. The firm has two business models: under hierarchy it internalizes the trade, and as a platform it intermediates the trade for a take-rate and the parties&rsquo; data. The court hears a complaint afterward within a jurisdiction reaching both parties. This paper treats a third. Each party bonds its own tokens before the trade, which makes keeping its word its best reply while the others keep theirs, so each can act on the other&rsquo;s promise. Each seller&rsquo;s part of the trade is an order, and the buyer&rsquo;s resolution pays every seller and refunds every bond at once.
                    </p>
                    <p>
                        We compare them in four columns, the firm&rsquo;s two business models apart, on ten axes of Williamson&rsquo;s comparative institutional analysis. Three of the four columns turn the cost of making a promise good into somebody&rsquo;s revenue. The bond&rsquo;s cost is the time value of the parties&rsquo; own tokens, paid to no one, and the network&rsquo;s gas.
                    </p>
                    <p>
                        A discriminating-alignment result follows from the two mechanisms, proved in Figaro (2026a), and from four cost shapes stated rather than measured. Against a platform, for a trade of <Math>{"N"}</Math> equal orders whose gas and matching are small beside the platform&rsquo;s take, and setting aside its data and its power to revoke admission, the bond is the cheaper substrate while the trade stands open less than <Math>{"\\tau/((N+3)r)"}</Math>: at a five percent time value and a twenty percent take-rate, one year for a bilateral trade and sixteen weeks for ten orders. Against a court it is cheaper at small value. Where a party is no person any legal order recognizes, the bond alone is available once its first tokens reach it. The firm in either business model and the court keep pooled and partitioned assets, thin markets, and relief after the fact, which acts on persons.
                    </p>
                </>
            }
            references={
                <>
                    <li>Acquisti, Alessandro, Curtis Taylor, and Liad Wagman. 2016. &ldquo;The Economics of Privacy.&rdquo; <em>Journal of Economic Literature</em> 54 (2): 442&ndash;492. https://doi.org/10.1257/jel.54.2.442.</li>
                    <li>CEN (European Committee for Standardization). 2026. <em>EN 16931-1:2026: Electronic Invoicing&mdash;Part 1: Semantic Data Model of the Core Elements of an Electronic Invoice</em>. Brussels: CEN.</li>
                    <li>Coase, Ronald H. 1937. &ldquo;The Nature of the Firm.&rdquo; <em>Economica</em> 4 (16): 386&ndash;405. https://doi.org/10.1111/j.1468-0335.1937.tb00002.x.</li>
                    <li>Coase, Ronald H. 1960. &ldquo;The Problem of Social Cost.&rdquo; <em>Journal of Law and Economics</em> 3: 1&ndash;44. https://doi.org/10.1086/466560.</li>
                    <li>Demsetz, Harold. 1967. &ldquo;Toward a Theory of Property Rights.&rdquo; <em>American Economic Review</em> 57 (2): 347&ndash;359. https://www.jstor.org/stable/1821637.</li>
                    <li>Dixit, Avinash K. 2004. <em>Lawlessness and Economics: Alternative Modes of Governance</em>. Princeton, NJ: Princeton University Press.</li>
                    <li>Ellickson, Robert C. 1991. <em>Order without Law: How Neighbors Settle Disputes</em>. Cambridge, MA: Harvard University Press.</li>
                    <li>European Union. 2006. <em>Council Directive 2006/112/EC of 28 November 2006 on the common system of value added tax</em>. <em>Official Journal of the European Union</em> L 347 (December 11, 2006): 1&ndash;118.</li>
                    <li>European Union. 2014. <em>Directive 2014/55/EU of the European Parliament and of the Council of 16 April 2014 on electronic invoicing in public procurement</em>. <em>Official Journal of the European Union</em> L 133 (May 6, 2014): 1&ndash;11.</li>
                    <li>European Union. 2016. <em>Regulation (EU) 2016/679 of the European Parliament and of the Council of 27 April 2016 on the protection of natural persons with regard to the processing of personal data and on the free movement of such data, and repealing Directive 95/46/EC (General Data Protection Regulation)</em>. <em>Official Journal of the European Union</em> L 119 (May 4, 2016): 1&ndash;88.</li>
                    <li>European Union. 2021. <em>Council Directive (EU) 2021/514 of 22 March 2021 amending Directive 2011/16/EU on administrative cooperation in the field of taxation</em>. <em>Official Journal of the European Union</em> L 104 (March 25, 2021): 1&ndash;26.</li>
                    <li>European Union. 2022. <em>Directive (EU) 2022/2464 of the European Parliament and of the Council of 14 December 2022 amending Regulation (EU) No 537/2014, Directive 2004/109/EC, Directive 2006/43/EC and Directive 2013/34/EU, as regards corporate sustainability reporting</em>. <em>Official Journal of the European Union</em> L 322 (December 16, 2022): 15&ndash;80.</li>
                    <li>European Union. 2023. <em>Regulation (EU) 2023/956 of the European Parliament and of the Council of 10 May 2023 establishing a carbon border adjustment mechanism</em>. <em>Official Journal of the European Union</em> L 130 (May 16, 2023): 52&ndash;104.</li>
                    <li>Figaro. 2026a. &ldquo;Asymmetric Bonding and Buyer Dominance: Two Composing Mechanisms for N-Party Coordination Among Strangers.&rdquo; Preprint. https://figaroprotocol.com/papers/asymmetric-bonding/. Accessed October 18, 2026.</li>
                    <li>Figaro. 2026b. &ldquo;Code Is Constitution: The Entrenched Layer Beneath Enactment.&rdquo; Preprint. https://figaroprotocol.com/papers/code-is-constitution/. Accessed October 18, 2026.</li>
                    <li>Figaro. 2026c. &ldquo;From Firms to Transaction-Scoped Institutions: The Coasean Collapse.&rdquo; Preprint. https://figaroprotocol.com/papers/transaction-scoped-institutions/. Accessed October 21, 2026.</li>
                    <li>Figaro. 2026d. &ldquo;What Formal Verification Transfers to a Bonded Contract: The Payoff Table as the Specification, and What No Check Reaches.&rdquo; Preprint. https://figaroprotocol.com/papers/verified-resolution-kernel/. Accessed October 18, 2026.</li>
                    <li>Galanter, Marc. 1974. &ldquo;Why the &lsquo;Haves&rsquo; Come Out Ahead: Speculations on the Limits of Legal Change.&rdquo; <em>Law &amp; Society Review</em> 9 (1): 95&ndash;160. https://doi.org/10.2307/3053023.</li>
                    <li>Greif, Avner. 1993. &ldquo;Contract Enforceability and Economic Institutions in Early Trade: The Maghribi Traders&rsquo; Coalition.&rdquo; <em>American Economic Review</em> 83 (3): 525&ndash;548. https://www.jstor.org/stable/2117532.</li>
                    <li>Hadfield, Gillian K. 2017. <em>Rules for a Flat World: Why Humans Invented Law and How to Reinvent It for a Complex Global Economy</em>. New York: Oxford University Press.</li>
                    <li>Hansmann, Henry, and Reinier Kraakman. 2000. &ldquo;The Essential Role of Organizational Law.&rdquo; <em>Yale Law Journal</em> 110 (3): 387&ndash;440. https://doi.org/10.2307/797521.</li>
                    <li>Hart, Oliver. 1995. <em>Firms, Contracts, and Financial Structure</em>. Oxford: Clarendon Press.</li>
                    <li>Jevons, William Stanley. 1875. <em>Money and the Mechanism of Exchange</em>. New York: D. Appleton.</li>
                    <li>Kiyotaki, Nobuhiro, and Randall Wright. 1989. &ldquo;On Money as a Medium of Exchange.&rdquo; <em>Journal of Political Economy</em> 97 (4): 927&ndash;954. https://doi.org/10.1086/261634.</li>
                    <li>Macaulay, Stewart. 1963. &ldquo;Non-Contractual Relations in Business: A Preliminary Study.&rdquo; <em>American Sociological Review</em> 28 (1): 55&ndash;67. https://doi.org/10.2307/2090458.</li>
                    <li>Menger, Carl. 1892. &ldquo;On the Origin of Money.&rdquo; Translated by Caroline A. Foley. <em>Economic Journal</em> 2 (6): 239&ndash;255. https://doi.org/10.2307/2956146.</li>
                    <li>Milgrom, Paul R., Douglass C. North, and Barry R. Weingast. 1990. &ldquo;The Role of Institutions in the Revival of Trade: The Law Merchant, Private Judges, and the Champagne Fairs.&rdquo; <em>Economics and Politics</em> 2 (1): 1&ndash;23. https://doi.org/10.1111/j.1468-0343.1990.tb00020.x.</li>
                    <li>North, Douglass C. 1990. <em>Institutions, Institutional Change and Economic Performance</em>. Cambridge: Cambridge University Press.</li>
                    <li>Ostrom, Elinor. 1990. <em>Governing the Commons: The Evolution of Institutions for Collective Action</em>. Cambridge: Cambridge University Press.</li>
                    <li>Rochet, Jean-Charles, and Jean Tirole. 2003. &ldquo;Platform Competition in Two-Sided Markets.&rdquo; <em>Journal of the European Economic Association</em> 1 (4): 990&ndash;1029. https://doi.org/10.1162/154247603322493212.</li>
                    <li>Rochet, Jean-Charles, and Jean Tirole. 2006. &ldquo;Two-Sided Markets: A Progress Report.&rdquo; <em>RAND Journal of Economics</em> 37 (3): 645&ndash;667. https://doi.org/10.1111/j.1756-2171.2006.tb00036.x.</li>
                    <li>Schelling, Thomas C. 1960. <em>The Strategy of Conflict</em>. Cambridge, MA: Harvard University Press.</li>
                    <li>Simon, Herbert A. 1951. &ldquo;A Formal Theory of the Employment Relationship.&rdquo; <em>Econometrica</em> 19 (3): 293&ndash;305. https://doi.org/10.2307/1906815.</li>
                    <li>United Nations. 1958. <em>Convention on the Recognition and Enforcement of Foreign Arbitral Awards</em>. New York, June 10, 1958. <em>United Nations Treaty Series</em>, vol. 330, 3.</li>
                    <li>Williamson, Oliver E. 1983. &ldquo;Credible Commitments: Using Hostages to Support Exchange.&rdquo; <em>American Economic Review</em> 73 (4): 519&ndash;540. https://www.jstor.org/stable/1816557.</li>
                    <li>Williamson, Oliver E. 1985. <em>The Economic Institutions of Capitalism</em>. New York: Free Press.</li>
                    <li>Williamson, Oliver E. 1991. &ldquo;Comparative Economic Organization: The Analysis of Discrete Structural Alternatives.&rdquo; <em>Administrative Science Quarterly</em> 36 (2): 269&ndash;296. https://doi.org/10.2307/2393356.</li>
                </>
            }
        >
            <PaperSection title="1. Introduction">
                <p>
                    Two parties who have never met, and who will likely never meet again, wish to exchange value. Each can see what the other says. Neither can see what the other will do. The exchange is worth making to both, and it does not happen, because a promise on its own is not a thing either can act on. Parties who share a relationship or a community often trade on relational norms alone, with no formal enforcement consulted (Macaulay 1963; Ellickson 1991); these two share neither, and Section 2.5 explains why that answer needs both. Markets solve this by running on something underneath the trade: an institutional technology that converts a promise into something worth acting on. We call that technology a <em>coordination substrate</em>, and this paper compares three of them, in four columns.
                </p>
                <p>
                    The comparison is worth making because one of the three, the parties&rsquo; own bond, is new. Its arrival is easy to misread in two opposite directions: as a general replacement for the others, or as a curiosity confined to digital goods. Neither reading survives an axis-by-axis comparison, which is what we conduct.
                </p>
                <PaperSubsection title="1.1 What a substrate is">
                    <p>
                        A coordination substrate is the layer at which a defection is made unattractive, and nothing above that layer. North (1990) locates the central difficulty of impersonal exchange here: the costs of measuring what is exchanged and of enforcing the terms are what make transacting expensive. On his account, the historical inability to enforce contracts cheaply between people not personally known to one another is a principal source of stagnation. Coase (1960) makes the methodological point: where transacting is costless the assignment of rights does not affect what gets produced, so institutional arrangements matter only because transacting is costly. A substrate is what makes that cost what it is.
                    </p>
                    <p>
                        A substrate is the answer to one question: <em>if my counterparty takes the value and gives nothing back, what happens?</em> The firm under hierarchy answers it as every ex-post form does, by an authority that acts after the failure: management over what it brings inside. What the hierarchy changes is the contract: a promise of a particular performance becomes a promise to do as directed, subordination (Section 2.1). That is why the hierarchy enters the comparison only at the make-or-buy margin (Section 1.4). Everything else is built on top of it. How prices are discovered, who may profit, what counts as fair, and whether surplus is distributed by capital or by work are properties of what runs on a substrate, never of the substrate. Section 5 states the consequence of that separation.
                    </p>
                </PaperSubsection>
                <PaperSubsection title="1.2 The three, in four columns">
                    <p>
                        The substrates differ in <em>who is made to bear the burden of making a promise good</em>. The firm has two business models, each with its own cost shape, so the comparison runs in four columns: hierarchy internalizes the trade, and the platform intermediates it for a take and the parties&rsquo; data. Where the columns are compared, the firm names its hierarchy and the platform its intermediation. The two differ in business model and in how far each is exposed to competition (Sections 3.5 and 3.7), never in kind: each is a party in the middle whom the trade pays for. The firm in either business model and the court are the <em>ex-post forms</em>: each makes a promise good after the fact, by authority, and places the burden with a party other than the two who are trading. The bond differs from both in kind.
                    </p>
                    <ol className="space-y-2 list-decimal pl-6 text-sm">
                        <li><strong>Internalization &mdash; the firm.</strong> The trade is brought inside an organization. The parties become positions in a hierarchy under an authority that acts after a failure, and the contract between them becomes subordination: performance is directed rather than promised. The hierarchy bears the cost as standing overhead and recovers it from residual output.</li>
                        <li><strong>Intermediation &mdash; the firm as platform.</strong> The trade is routed through a standing intermediary that stands behind it: it screens both sides, holds the payment, reverses payments, scores conduct, and expels. The intermediary bears the cost and is paid twice: in a take-rate, and in the data of who traded what with whom.</li>
                        <li><strong>Externalization &mdash; the court.</strong> The trade is left bilateral, and a public adjudicator stands behind it after the fact. The state bears the marginal cost of adjudication out of taxation, and the parties bear filing, counsel, and delay. The arrangement works only where both parties are inside a jurisdiction whose judgments reach them.</li>
                        <li><strong>Self-bonding &mdash; the bonded commitment.</strong> The parties bear the cost themselves, before the fact, by bonding tokens of their own that resolution refunds. The cost has two terms: the time value of the bonded tokens over the trade&rsquo;s duration, which is paid to no one, and the network&rsquo;s gas, which is paid to the network that executes the calls. Section 2.4 states the mechanism.</li>
                    </ol>
                </PaperSubsection>
                <PaperSubsection title="1.3 One trade, four columns">
                    <p>
                        One stipulated trade runs through the comparison. A buyer <Math>{"B"}</Math> and a seller <Math>{"S"}</Math> have never met and do not expect to trade again. <Math>{"S"}</Math> will provide a good or a service off-chain within a week, and <Math>{"B"}</Math> will pay <Math>{`P = ${EX_P}`}</Math> tokens for it. The payment is small next to what a claim in any forum costs. The question of Section 1.1 is the same on every substrate: if <Math>{"S"}</Math> takes the payment and provides nothing, or <Math>{"B"}</Math> takes what was provided and pays nothing, what happens?
                    </p>
                    <ol className="space-y-2 list-decimal pl-6 text-sm">
                        <li><strong>The firm.</strong> The trade runs on this substrate only if one party brings the other inside: <Math>{"S"}</Math> works under <Math>{"B"}</Math>&rsquo;s direction, or both hold positions in one organization. The provision is then instructed rather than promised, and a failure is a matter for management. The cost is an organization that exists before the trade and continues after it, which one trade of {EX_P} tokens between strangers does not carry.</li>
                        <li><strong>The platform.</strong> Both parties accept a platform&rsquo;s terms. <Math>{"B"}</Math> pays the platform, which holds the payment until the provision and passes it to <Math>{"S"}</Math> less its take: at a twenty percent take-rate it keeps {EX_TAKE} tokens. It also keeps the data of who bought what from whom at what price. A complaint goes to the platform, which decides it under its own policy and can remove either party.</li>
                        <li><strong>The court.</strong> The parties sign terms and trade directly. If <Math>{"S"}</Math> takes the payment and provides nothing, <Math>{"B"}</Math>&rsquo;s remedy is a claim in a forum whose judgment reaches <Math>{"S"}</Math>. At this value the claim costs more than it recovers. If the two live under different legal orders, there is no forum whose judgment reaches both.</li>
                        <li><strong>The bond.</strong> <Math>{"B"}</Math> signs the commitment as the offer and <Math>{"S"}</Math> counter-signs it as the acceptance. At commit each bonds its own tokens, which makes keeping its word its best reply while the other keeps its own, so each can act on the other&rsquo;s promise. <Math>{"B"}</Math> locks {EX.buyer_locks}, twice the payment, and <Math>{"S"}</Math> locks {EX.seller_locks}, twice the value of the trade, {EX.held} held in all. <Math>{"S"}</Math> provides, and <Math>{"B"}</Math> resolves: <Math>{"S"}</Math> receives {EX_SELLER_PAYOUT}, its bond with the payment, and <Math>{"B"}</Math> receives {EX_BUYER_PAYOUT}, the rest of its bond. A seller that keeps what it would have provided stands at best at <Math>{`-${EX.seller_locks - EX_G}`}</Math>, and a buyer that keeps the provision and never resolves stands at <Math>{`-${EX.buyer_locks - EX_P}`}</Math>; neither locked bond goes to the other party. The parties spend the time value of the {EX.held} tokens for the week, about {EX_WEEK_TIME_VALUE} tokens at five percent a year, and the network&rsquo;s gas. No legal order is consulted at any step.</li>
                    </ol>
                    <p>
                        The trade is the same in all four columns; what differs is who bears the cost of making the promise good, who receives that cost, who holds the map, who admits and removes, who decides, and whether the parties must share a legal order. Those are among the axes of Section 3. Two kinds of figure appear above. The bond&rsquo;s amounts are read off its schedule before the trade; the time value depends on the week and on the rate Section 4.1 defines, and the platform&rsquo;s take and the cost of a claim depend on an operator and a forum. Section 4.1 keeps the two kinds apart. The trade assumes that <Math>{"B"}</Math> and <Math>{"S"}</Math> have already found each other and will not meet again, which is the case this paper is about; Section 4.3 states where each of the other three columns is the better choice.
                    </p>
                </PaperSubsection>
                <PaperSubsection title="1.4 Scope">
                    <p>
                        Three boundaries define what follows. First, this is a comparison of substrates, not a theory of the firm: where the argument touches the boundary of the firm&rsquo;s hierarchy it uses only the make-or-buy margin, and stops. Second, the paper does not treat how the bond&rsquo;s shared infrastructure is sustained, or any token of its own; neither is needed here. Third, everything below is analytic: a comparison of institutional structures and their cost shapes, with no empirical claim about how the bond performs in the field.
                    </p>
                </PaperSubsection>
            </PaperSection>

            <PaperSection title="2. The Substrates">
                <PaperSubsection title="2.1 Internalization: the firm">
                    <p>
                        Coase (1937) asked why, if markets allocate efficiently, so much activity happens inside organizations where nothing is priced. His answer was that using the price mechanism has costs: discovering prices and negotiating each bargain; Williamson (1985) adds enforcing what was agreed. When those costs exceed the cost of directing the same activity by authority, the activity moves inside. The firm, on this reading, is a device for not having to transact. The property-rights theory (Hart 1995) relocates the firm&rsquo;s boundary to the ownership of assets; we keep Coase&rsquo;s question, because the comparison turns on who bears enforcement and not on who owns what.
                    </p>
                    <p>
                        What replaces the transaction is subordination. Simon (1951) gives the relation its exact form: in an employment contract one party accepts, in advance and for a price, the other&rsquo;s authority to select its behavior from within an agreed area of acceptance. The employee promises to do as directed within that area, not a particular performance. Internalization does not make the promise good; it changes the contract. No bargain is left at each step, only an instruction. What makes good a promise inside the firm is management&rsquo;s authority after a failure. Williamson (1991) adds the legal fact most often forgotten here. Hierarchy has a contract-law regime of its own, <em>forbearance</em> (courts decline to hear disputes between divisions of one firm), so the firm is its own court of ultimate appeal. Internalization moves enforcement out of the legal system and into management.
                    </p>
                    <p>
                        The price of that move is the standing organization. A nucleus must exist before any particular transaction and continue after it, carrying hiring, direction, monitoring, and the loss of the information prices would have supplied. The overhead is fixed with respect to any one trade, so it is cheap per transaction only where transactions are frequent.
                    </p>
                </PaperSubsection>
                <PaperSubsection title="2.2 Intermediation: the firm as platform">
                    <p>
                        The platform is the firm under another business model. It leaves the parties outside its own organization and stands behind the trade as a third party. It earns by a take and by the data, where the hierarchy recovers its cost from the residual output of the trade it brings inside. Its enforcement work is real: admitting participants, holding the payment until delivery, reversing payments, adjudicating complaints under its own policy, keeping a rating that raises the cost of a bad act, and removing those who commit one. A buyer trading with a stranger on a platform is trusting the platform&rsquo;s willingness to make it whole and its power to punish.
                    </p>
                    <p>
                        Rochet and Tirole (2003) give the analytic account of how such an intermediary earns. A platform serves two groups whose members do not internalize the value their participation creates for the other side. Its characteristic instrument is the <em>price structure</em>: the split of the total charge between the two sides, as distinct from its level. Rochet and Tirole (2006) make this the criterion of two-sidedness: shifting a unit of charge from one side to the other, holding the total fixed, changes how much trade occurs. The platform courts and if necessary subsidizes the harder side, and recovers from the side whose participation is less elastic.
                    </p>
                    <p>
                        Two features of the charge matter for the comparison. The charge is a <em>transfer</em>: it leaves the parties and stays with the intermediary, and no resolution returns it. And it is only half of what is paid, because the intermediary also ends up holding the transaction data: who bought what, from whom, at what price, how often. Acquisti, Taylor, and Wagman (2016) survey the economics of that second payment and its ambiguity: personal data is a productive input, which is why matching improves, and a claim held by someone other than its subject, whose interests need not coincide. A comparison that counts only the take-rate has counted one of two prices.
                    </p>
                </PaperSubsection>
                <PaperSubsection title="2.3 Externalization: the court">
                    <p>
                        The court leaves the trade bilateral and puts a public adjudicator behind it. The parties write terms, perform or fail to, and a breach is heard afterwards by an institution neither controls. North (1990) treats third-party enforcement as the decisive institutional achievement of impersonal exchange. He also treats it as the one whose cost is chronically understated, since the enforcer must itself be constrained.
                    </p>
                    <p>
                        Three properties of this substrate structure Section 4. It is <em>ex post and contingent</em>: nothing is spent unless a breach occurs and the injured party pursues it. Its cost is roughly <em>fixed per dispute</em> rather than proportional to the amount in issue, because pleadings, counsel, and delay do not shrink to fit a small claim; below a threshold value the substrate is unavailable in practice. And it is <em>jurisdictional</em>: it works between parties a single legal order can reach.
                    </p>
                    <p>
                        Each property has an empirical literature behind it. Macaulay (1963) found that businesses able to sue mostly do not, because invoking the court is expensive and damaging to the relationship. Galanter (1974) showed that access is structurally asymmetric: repeat players who can absorb delay, spread costs, and play for rules do better than one-shot participants. Hadfield (2017) argues that legal infrastructure has not scaled to the complexity and border-crossing of contemporary activity, and that its cost structure, not its doctrine, leaves much ordinary economic life outside it. Dixit (2004) studies what people do where state enforcement is weak or absent.
                    </p>
                    <PaperRun title="Arbitration customizes the court; it does not escape the jurisdictional condition.">
                        Parties can create a private forum by agreement, and cross-border commerce routinely does. The reach of an arbitral award is a property of a treaty, not of the agreement. The New York Convention (United Nations 1958) obliges its contracting states to recognize and enforce foreign arbitral awards, and that obligation makes a private award collectible against an unwilling loser abroad. Private adjudication is therefore a customization of the court: the hearing is privately organized, and the enforcement remains public.
                    </PaperRun>
                </PaperSubsection>
                <PaperSubsection title="2.4 Self-bonding: the bonded commitment">
                    <p>
                        The bonded commitment keeps the burden of making a promise good with the parties and moves it forward in time: each party bonds tokens beforehand, and the completion of the trade refunds them. The instrument is old in principle. Schelling (1960) analyzed the general form, in which a party improves its position by giving up some of its own freedom of action. Williamson (1983) gave the commercial version its institutional treatment: a hostage offered by the party in a position to defect can support an exchange that would otherwise not occur. What is new is the arrangement that makes a hostage credible between strangers, at any distance, and along a chain of several producers: the bond is locked before the trade, only the buyer&rsquo;s resolution refunds it, and nothing collects it. We state it compactly, and the paper uses only what is stated here.
                    </p>
                    <p>
                        A trade runs as a <em>process</em>: one buyer, and the sellers who add value to what it buys, each seller&rsquo;s part an <em>order</em>. Each order enters by a <em>commitment</em>, which the buyer signs as the offer and the seller counter-signs as the acceptance. The commitment names the payment <Math>{"P > 0"}</Math>, the unit of account, and the fingerprint of the <em>agreement</em>, its <em>root</em>: one hash computed over the hashes of its filled clauses, which changes if any clause does. The agreement is the terms of that one order, composed of <em>clauses</em>, each clause one relationship between two parties. A designer composes agreements into an <em>assembly</em>, a reusable design whose arrangement of parties and terms is its <em>graph</em>; the buyer selects an assembly and the sellers bind it. The signed commitment is then submitted to the mechanism, which holds the bonds.
                    </p>
                    <p>
                        Committing the signed commitment locks tokens on both sides under one schedule. The buyer locks <Math>{"2P"}</Math>; the seller locks <Math>{"2G"}</Math>, twice the value accumulated through its own order, the most a holdout there could keep. That value <Math>{"G"}</Math>, the <em>cumulative value</em>, counts every payment the process has accumulated through the seller&rsquo;s order, its own included. Each party&rsquo;s bond is locked at commit, not at signing, and nothing else is locked. The doubling answers retention: value passes off-chain, so a party that walks away keeps what is in its hands, and the bond is sized to leave it worse off net of what it keeps. A seller that keeps the goods holds at most <Math>{"G"}</Math> against <Math>{"2G"}</Math> locked, and stands at best at <Math>{"-G"}</Math>. A buyer that takes delivery and never resolves holds value <Math>{"P"}</Math> against <Math>{"2P"}</Math> locked, and stands at <Math>{"-P"}</Math>. What the schedule delivers is the theorem of Figaro (2026a): cooperation is an equilibrium at every position of a chain, and this paper uses that result as stated there.
                    </p>
                    <p>
                        Resolution is the buyer&rsquo;s act, and it is <em>atomic</em>: every order in the process resolves at once, paying every seller and refunding every bond, or none does. Cooperation is an equilibrium of this game: a mechanism-design result, proved in Figaro (2026a) under stated assumptions, among them that a seller that holds out retains at most the cumulative value <Math>{"G"}</Math> through its order, that the parties are beyond each other&rsquo;s coercive reach, that the buyer&rsquo;s resolution is its own judgment of performance, and that nothing expires once the bonds are locked; it is restated here without proof. Three comparisons establish it. (a) After performance, the buyer strictly prefers resolving, at <Math>{"0"}</Math>, to never resolving, at <Math>{"-P"}</Math>; this comparison assumes nothing about the seller. (b) Given (a) and the buyer&rsquo;s plan to resolve once performance has occurred and not before, and given that its co-sellers perform, each seller strictly prefers performing, at <Math>{"+P"}</Math>, to never performing, at most <Math>{"-G"}</Math>. (c) Given (b), the buyer keeps the process open before performance rather than resolving at once, which would pay for a performance that has not occurred. (b) and (c) are the two parties&rsquo; best-response checks against one strategy profile, verified jointly: the profile is a fixed point.
                    </p>
                    <p>
                        Commit and resolve are the only operations, and the buyer&rsquo;s resolution is the only way out of the bonded state. The reason is a second result of the same analysis (Figaro 2026a). Any further release is either decided by a party that bonded nothing, whose choice nothing in the mechanism orders, or available to a party that bonded, by its own decision or on a timer. In the second case it adds a third continuation at a node where the equilibrium was derived by comparing two, so the equilibrium no longer carries over. Remedies are therefore agreed between the parties <em>while the process stands open</em>, and resolution is terminal acceptance. An outside forum may rule on an open process&rsquo;s data and on what the parties bring it; it cannot resolve a process, so its ruling costs the equilibrium nothing. The remoteness assumption above excludes proximate force, a party able to reach the other and take what it is owed; a court with reach over both parties is an outside option of exactly this kind, and it leaves the equilibrium standing.
                    </p>
                    <p>
                        Atomicity does a second piece of work. Because payouts arrive together or not at all, each seller holds a computable interest in every other seller&rsquo;s performance. The protocol gives co-sellers that interest, not the means to act on it. An <em>attestation</em> is a party&rsquo;s own signed statement about a clause of its agreement, entered while the process stands open. Performance happens off-chain, so which seller has not performed is knowledge the parties hold (Figaro 2026a), and reaching a co-seller needs a channel the assembly composes.
                    </p>
                    <PaperRemark title="What the bonded commitment holds.">
                        The mechanism sees a <em>linear process chain</em>: commitments each extending one cumulative value under one buyer and one unit of account, as many as the network can resolve in one call. Who supplied whom among the sellers is part of their agreements, above the mechanism and invisible to it. The substrate holds the bonds, the cumulative value, and fingerprints: each commitment the parties signed and the root of each agreement. It holds no representation of the goods, no acceptance test, no report of delivery, and no identity beyond a key. It cannot tell whether performance was good: the buyer&rsquo;s resolution <em>is</em> that judgment, and the bonds make a buyer with the goods in hand prefer to give it. Identity, insurance, adjudication, tax treatment, and the terms themselves attach above it by composition with institutions that already exist, or are absent.
                    </PaperRemark>
                </PaperSubsection>
                <PaperSubsection title="2.5 Why private-order reputation regimes are not a fifth column">
                    <p>
                        A reader of comparative institutions will ask why the list omits the most studied alternative: private order sustained by reputation within a community. Greif (1993) reconstructs the Maghribi traders&rsquo; coalition, whose agents across the Mediterranean were kept honest by a multilateral punishment rule (cheat one member and no member employs you again) and an information network that made cheating known. Milgrom, North, and Weingast (1990) analyze the Champagne fairs&rsquo; law merchant, whose private judges enforced nothing but supplied the information about past conduct that made decentralized punishment work. Ostrom (1990) documents long-lived commons regimes governed by their appropriators, with design principles that include defined membership, monitoring accountable to the appropriators, graduated sanctions, and accessible arenas for conflict. Ellickson (1991) finds ranchers who decide serious disputes by norm and reciprocity while largely ignorant of the law that formally governs them.
                    </p>
                    <p>
                        These are genuine substrates and the closest ancestors of the bond. They are not a separate column for one reason: every one of them requires closure. Multilateral punishment needs a membership one can be excluded from, a channel that carries conduct to future counterparties, and an expectation of future dealing that makes exclusion costly. Where those hold, these regimes are often the cheapest arrangement available. Where they do not, as with a stranger met once outside any community either belongs to, the reputational substrate supplies nothing: there is no audience for the report and no future to withhold. That case is the subject of this paper. The bond has an entry condition too, a balance (Sections 3.3 and 3.7), and it closes on that balance as the coalition closes on membership. The two differ in who can meet them: a stranger acquires tokens by selling anything to anyone, while membership in a coalition is granted by its members and cannot be acquired.
                    </p>
                    <p>
                        The relation can be stated exactly. What atomic resolution produces among co-sellers, a live and sized interest in a stranger&rsquo;s performance, is structurally the coordination pressure that joint-liability arrangements obtain socially. As a mechanism-design result (Figaro 2026a), that pressure is obtained within one process without repeated interaction, local information among the sellers, a punishment imposed from outside the contract, or a joint-liability contract, and so without the membership the regimes above require. What it does not obtain is the rest of what those regimes deliver: they select good counterparties into the group and monitor them, and a bond does neither. The bond reproduces the pressure and not the screening.
                    </p>
                </PaperSubsection>
            </PaperSection>

            <PaperSection title="3. Ten Axes">
                <p>
                    Williamson (1991) frames comparative institutional analysis as the study of <em>discrete structural alternatives</em>, and asks which attributes of a transaction align with which form. The ten axes are chosen on that principle. The three substrates differ in who bears the burden of making a promise good, and when. That is no parameter of a column, so no setting converts an ex-post form into the bond, or the bond into one. The firm&rsquo;s two business models are one institution, a party in the middle, and differ in their cost shapes. Each axis asks one plain question of the trade of Section 1.3.
                </p>
                <ol className="space-y-1 list-decimal pl-6 text-sm">
                    <li><strong>The cost of a promise made good.</strong> What making a stranger&rsquo;s promise good costs, who pays it, and who receives the payment.</li>
                    <li><strong>The map.</strong> Who holds the data of who traded what with whom.</li>
                    <li><strong>Admission.</strong> What a party must be or hold before it may trade at all.</li>
                    <li><strong>Discretion.</strong> Who may decide an outcome by judgment rather than by rule, and who can review that judgment.</li>
                    <li><strong>The cost of instituting.</strong> What it takes to create one more arrangement of the kind.</li>
                    <li><strong>Jurisdiction.</strong> Whether the substrate works only between parties one legal order reaches.</li>
                    <li><strong>Failure modes.</strong> How the substrate breaks, and who bears the break.</li>
                    <li><strong>Fiscal and regulatory legibility.</strong> How a party shows a tax authority or a supervisor what it traded.</li>
                    <li><strong>Unit of account.</strong> Who chooses the unit the trade is priced and paid in.</li>
                    <li><strong>Transparency, verifiability, and privacy.</strong> Whether a party can see the arrangement, check how it operated, and keep the substance of its trade to itself, all three at once.</li>
                </ol>
                <PaperSubsection title="3.1 Who bears the cost of a promise made good, and to whom it is revenue">
                    <p>
                        Under internalization the cost is a standing overhead borne by the ownership nucleus and recovered from residual output; it is paid whether or not a given transaction occurs, and it is income to the management function. Under intermediation the platform bears the cost and recovers it as a take-rate plus the parties&rsquo; data, and its recipient is a single identified party. Under externalization the public bears the marginal cost of adjudication through taxation, while the parties bear counsel, filing, and delay; it is revenue to the professions that conduct it. Under self-bonding each party bears the time value of its own bond, ex ante, and that term is revenue to nobody: the tokens are refunded at resolution, and what was consumed is their time value for the duration.
                    </p>
                    <p>
                        The <em>shape</em> of the charge differs as much as its destination, and Section 4 formalizes the difference. The firm&rsquo;s apparatus exists before any trade and persists after it, so its cost is incurred whether or not a trade happens and is recovered by spreading. The platform&rsquo;s take-rate is proportional to value, paid on every trade, and permanent, and the data it collects is a second price on the same trade. The court&rsquo;s costs are contingent but lumpy, and every trade carries their expected value. The bond charges two terms. The first is the time value of the bonded tokens over the process&rsquo;s duration, which scales with value and with time. The second is the network&rsquo;s gas for the commit and the resolution; it is paid to the network in tokens and does not scale with value.
                    </p>
                    <p>
                        This is the sharpest structural difference among the four columns, and it cuts both ways. Time value with no recipient is still a cost, the one Section 4.1 writes as <Math>{"r"}</Math>, and the party who bonded the tokens bears it for as long as the process stands open. What it lacks is a constituency. A take-rate has a beneficiary who prefers it higher, adjudication has a profession whose income scales with its complexity, and a hierarchy has incumbents whose position depends on the transaction not being simple. Time value has no one positioned to raise it, because it is paid to no one. An issuer able to debase its own unit gains from doing so, but a debased unit is a risk of the denomination, which Section 3.9 leaves with the parties, and not a rise in time value. The claim is structural: it names who would gain from a higher charge, and makes no claim about whether anyone acts on that gain. The gas is paid to the network, but its price is set by the network&rsquo;s market for block space, which prices every transaction alike and knows nothing of the trade.
                    </p>
                </PaperSubsection>
                <PaperSubsection title="3.2 Who holds the map">
                    <p>
                        Every substrate leaves a map of who traded what with whom, and the four columns allocate it differently. The firm&rsquo;s map is internal and proprietary: visible to the nucleus alone, one of its most valuable assets, and it dies with the entity. The platform&rsquo;s map is the platform: the accumulated data of matches, prices, and conduct makes its matching good and its position durable, and it is collected from the parties as part of the price of using it (Acquisti, Taylor, and Wagman 2016). The court&rsquo;s map exists only for the transactions that failed and were litigated. It is public in principle and scattered across dockets in a form close to unusable in aggregate, and successful trades leave no trace in it.
                    </p>
                    <p>
                        The bond splits the map in two. Its <em>skeleton</em> is the data the process leaves: which parties signed, in what order within the process, in what unit, at what amounts, and that the buyer resolved. The <em>content</em> stays with the parties: what was traded, on what terms, to what specification, in the document behind the agreement&rsquo;s fingerprint. What either party does with its own content is its own affair. Under the bond the map is therefore not the price of a promise made good, because no intermediary collects it.
                    </p>
                </PaperSubsection>
                <PaperSubsection title="3.3 Admission">
                    <p>
                        Internalization admits by hire or by contract, at the nucleus&rsquo;s discretion, and the admitted party then sits inside an authority relation. Intermediation admits by acceptance of terms, usually with identity verification and often a jurisdictional filter, and the admission is revocable at the intermediary&rsquo;s discretion. Removal is a principal instrument of its enforcement, which makes it an unappealable power over livelihoods. Externalization admits by legal personality and standing: a party must be a person the legal order recognizes, in a jurisdiction whose process can reach its counterparty.
                    </p>
                    <p>
                        Self-bonding admits on two conditions: the ability to sign, and a balance sufficient to bond the commitment being signed. The condition is permissionless: no application, no admitting party, no revocation. A balance is a real requirement, and Section 3.7 treats it as the substrate&rsquo;s principal distributional cost. But the condition differs in kind: it is a condition on a token balance rather than on status, and a balance is acquirable by the party who must meet it, from anyone who will trade with it, where status and membership are granted by others. An entity no legal order recognizes can meet it, such as a software agent or a productive asset holding a key of its own. Section 4.4 draws the consequence, which is the strongest claim in the paper.
                    </p>
                </PaperSubsection>
                <PaperSubsection title="3.4 Where discretion lives">
                    <p>
                        Discretion is a resource with a price, and the substrates differ in where it sits and what constrains it. In the firm it is managerial fiat, exercised continuously within Simon&rsquo;s area of acceptance and <em>not</em> reviewable from outside, because forbearance keeps courts out of intra-firm disputes (Williamson 1991). In the platform it is policy, exercised unilaterally by the operator over admission, payouts, and rankings, revisable at will, and appealable only to the operator. In the court it is judicial: bounded by procedure, disciplined by precedent, exercised in public, and reviewable on appeal. That is the most thoroughly institutionalized discretion humanity has built, and it is slow and expensive for that reason.
                    </p>
                    <p>
                        Under the bond the one discretion is the buyer&rsquo;s: whether and when to resolve. The operations are the commitment and the resolution, and nothing moves a bonded balance but the buyer&rsquo;s resolution. A forum&rsquo;s discretion attaches from outside. A designer may compose an arbitration forum into an assembly, and a court may rule on an open process&rsquo;s data whether or not any assembly names it. Either ruling is an input to the buyer&rsquo;s decision, not a substitute for it, because no forum can resolve a process. The substrate itself offers no review of the buyer&rsquo;s judgment, so parties who want a reviewer select an assembly that composes one.
                    </p>
                </PaperSubsection>
                <PaperSubsection title="3.5 The marginal cost of a new institution">
                    <p>
                        Demsetz (1967) argued that property rights emerge when the gains from internalizing an externality come to exceed the cost of doing so. We extend that logic from property rights to institutional arrangements in general: a substrate on which instituting is cheap will carry arrangements that a substrate on which instituting is dear will never see, whatever their merits.
                    </p>
                    <p>
                        The smallest firm is an authority relation, a sole trader hiring one person, and its standing cost is the direction and monitoring that relation needs. Standing the firm up as a legal entity means incorporation in some jurisdiction, a charter, governance organs, and books: days to months of work and a permanent administrative burden. Hansmann and Kraakman (2000) identify what that expense buys. It is <em>asset partitioning</em>, the shielding of the entity&rsquo;s assets from its owners&rsquo; personal creditors, which contracting alone cannot cheaply replicate. Standing up a platform costs far more: it means solving the chicken-and-egg problem on two sides at once and carrying both until the network is worth joining, which is why platforms are few, durable, and hard to displace. Standing up a court is not available to the parties at all, and the private-forum route reaches across borders only through the treaty framework of Section 2.3.
                    </p>
                    <p>
                        Under the bond the marginal cost of a new institution is a pair of signatures, the network&rsquo;s gas, and the time value of the bonds. The process is the institution, and it lasts one transaction. Its membership is the parties who signed into it; it has no fixed term and stands open until the buyer resolves; its one rule of dissolution is that resolution, which pays every seller, refunds every bond, and leaves the process&rsquo;s data. By the logic above, the consequence is not that existing arrangements get cheaper but that arrangements never worth constituting become worth constituting: a coalition of four parties for one afternoon, which no one would incorporate for and no court would be invoked over. That follows from Demsetz&rsquo;s argument applied to the cost of a process and to the two mechanisms, proved in Figaro (2026a), under their conditions; whether real participants constitute such arrangements and play the equilibrium in them no theorem covers.
                    </p>
                </PaperSubsection>
                <PaperSubsection title="3.6 Jurisdiction dependence">
                    <p>
                        The firm is chartered somewhere, and its internal authority and its external liability run through that place. The platform is more mobile but holds the parties&rsquo; payments, so it is a regulated payments actor in most places it operates, and its terms select a forum. The court is jurisdiction itself: its efficacy is the reach of one legal order over both parties, extended across borders only by treaty. Each ex-post form rests on a legal order: the court on one that reaches both parties, the firm on its own in either business model. Two parties with no legal order in common therefore lose the court, and keep the firm and the platform only on the law those select.
                    </p>
                    <p>
                        The bond does not depend on a shared jurisdiction, because it does not depend on anyone&rsquo;s coercive reach. What deters the defector is a bond of its own tokens, locked until the buyer resolves, and that holds however far apart the parties are, provided neither is within the other&rsquo;s coercive reach, which the equilibrium presumes (Figaro 2026a). The substrate displaces no legal obligation. Parties some legal order recognizes remain subject to whatever law applies to them: tax, sanctions, and consumer protection continue to attach, and the data the substrate produces is good evidence for any forum that takes an interest. That assurance covers recognized parties; a participant no legal order recognizes as a bearer of rights and duties, the region of Section 4.4, is outside it. Even there, obligations do not attach to nobody: the participant&rsquo;s first tokens entered from a recognized party, and what that funding owes attaches at that boundary. What it removes is the <em>precondition</em>: the trade is safe to enter before any question of forum is decided, and that question can be answered afterwards, or never.
                    </p>
                </PaperSubsection>
                <PaperSubsection title="3.7 Failure modes">
                    <p>
                        Each substrate breaks in a way that follows from what made it work.
                    </p>
                    <PaperRun title="The firm.">
                        Because performance inside is directed rather than promised, the failure is in the direction: agency loss, influence activity, and the suppression of information prices would have carried. Because the nucleus is a standing entity, its failure is discontinuous: insolvency ends every coordination inside it at once, leaving trade creditors unpaid and the internal map extinguished. And its characteristic cost falls on the subordinated party, whose exit is expensive by construction.
                    </PaperRun>
                    <PaperRun title="The platform.">
                        Its failure modes are versions of one fact: the party that bears the enforcement cost also sets the rules. Take-rates ratchet, terms change unilaterally, participants are removed with no appeal but to the remover, and the accumulated map gives the incumbent a position no entrant can price against. When a platform fails outright, its map goes with it, and the trading relationships it mediated do not survive their index.
                    </PaperRun>
                    <PaperRun title="The court.">
                        Delay and cost are the ordinary modes, and their consequence is the court&rsquo;s practical unavailability below a value threshold. The structural mode is Galanter&rsquo;s: repeat players extract better outcomes than one-shot participants from the same rules. Add the judgment-proof defendant, against whom a valid judgment is worth nothing, and non-recognition abroad, which makes a valid judgment worth nothing wherever the defendant is.
                    </PaperRun>
                    <PaperRun title="The bond.">
                        Its first failure mode is severe. The substrate demands a token balance of twice the value traded for the duration of the trade, so it favors the wallet that holds a balance and rations the rest. The rationing is what the deterrent asks: the bond that leaves a defector worse off is the balance a party must hold to trade. A party who cannot post the bond does not transact on this substrate at all, a distributional property as consequential as any advantage claimed in this paper. Second, the bond deters and pays no remedy: a harm the parties have not put right before the buyer resolves, a consequential loss, or an injury to a non-party is outside the substrate, and relief for it acts on persons, after the fact. Third, the substrate provides no recovery path: a buyer that loses its key, having made no provision while it held it, strands every bond in its process, which is the price of a mechanism whose only operations are commit and resolve. Fourth, resolution is terminal acceptance, so a buyer who resolves and later finds a defect has no recourse within the substrate. Fifth, in a chain of several producers each seller bonds the cumulative value through its order, so the bonds summed over a process rise faster than the value it carries; with <Math>{"N"}</Math> orders of equal payment <Math>{"P"}</Math>, the total locked is <Math>{"N(N+3)P"}</Math> against <Math>{"NP"}</Math> carried (Section 4.1). Depth is therefore priced by the bonds, and it is bounded per process by the gas the network allows one call.
                    </PaperRun>
                </PaperSubsection>
                <PaperSubsection title="3.8 Fiscal and regulatory legibility">
                    <p>
                        Trade is also reported. Every substrate must produce, for a tax authority, an auditor, a customs administration, or a supervisor, a demonstration of what was traded, with whom, for how much, and when. The cost of producing it is a real cost of transacting, largely fixed with respect to any one trade&rsquo;s size, and so it bears on the amortization argument of Section 4: a fixed compliance overhead is one of the standing reasons an activity is carried on inside a firm rather than between strangers.
                    </p>
                    <PaperRun title="The firm demonstrates by reconstruction.">
                        A firm keeps books for its own management, in its own chart of accounts, and the demonstration a regime demands is assembled afterwards from those books. Audit is reconstruction: an outside party re-derives, from books designed for another purpose, a view the firm did not keep. The cost is a standing overhead that rises with regulatory complexity and is amortized over the firm&rsquo;s transactions, so complexity favors the larger entity: the same demonstration costs a small enterprise a far larger share of its turnover. European e-invoicing shows the shape. Directive 2014/55/EU requires public contracting authorities to receive electronic invoices conforming to a common semantic model, standardized as EN 16931-1 (CEN 2026), and the burden on a supplier is a mapping from books kept one way onto a model specified another way.
                    </PaperRun>
                    <PaperRun title="The platform holds the data and mediates the demonstration.">
                        Where trade is intermediated, the authoritative data is the intermediary&rsquo;s, and a participant demonstrates compliance by requesting a statement and accepting what it contains. This is convenient and not neutral: the participant&rsquo;s ability to prove its own history depends on continued access, on the intermediary&rsquo;s retention policy, and on its survival. Council Directive (EU) 2021/514 formalizes the arrangement by making digital platform operators reporting agents, obliged to collect information about their sellers and report it to tax administrations. The regulatory function is thereby fused to the intermediation function, which raises the cost of entry and gives the incumbent a second reason to be indispensable that has nothing to do with matching.
                    </PaperRun>
                    <PaperRun title="The court generates evidence only adversarially.">
                        Litigation produces evidence of a transaction only for the transactions that fail, only after they fail, and only by compelling each side to disclose what it holds. Disclosure is expensive, contested, and retrospective, and it produces nothing for the large majority of trades, which complete. As a source of fiscal or regulatory legibility the court is close to useless: it resolves a dispute about what happened rather than producing an account of it.
                    </PaperRun>
                    <PaperRun title="The bond emits the data as a byproduct.">
                        Under the bond the demonstration accumulates as trading happens. Each order enters by a commitment both parties sign, naming the counterparties, the amount, the unit of account, and the agreement&rsquo;s fingerprint, and resolving writes that the process closed and what each party received. A compliance demonstration therefore becomes a retrieval. Its cost falls from reconstruction, which scales with the regime&rsquo;s complexity, to reading data that already exists and attaching the regime&rsquo;s own attributes on top.
                    </PaperRun>
                    <p>
                        Three regimes make the difference concrete, each named for the kind of demand it makes. Value-added tax reporting in the European Union, governed by Council Directive 2006/112/EC and moving toward digital reporting built on electronic invoicing, demands per-transaction counterparties, amounts, and dates: the set the public skeleton contains. Sustainability reporting under Directive (EU) 2022/2464 obliges in-scope undertakings to report on their value chains under assurance, and the carbon border adjustment mechanism of Regulation (EU) 2023/956 requires importers to account for goods produced along a chain that ends at the customs frontier. For these two, the public skeleton of a multi-party process shows which sellers were in one process, in what order the commits came, and for what amounts. Who supplied whom, what moved, and what it embodied sit behind the agreement&rsquo;s root, in documents the parties hold and may disclose with an inclusion proof. A party demonstrates that substance by producing the documents, and the root proves they are the ones that were bonded: the chain-level demonstration is the public skeleton plus the parties&rsquo; disclosures against it.
                    </p>
                    <PaperRun title="Reporting without over-disclosure.">
                        The split of Section 3.2 has a regulatory consequence. A party can demonstrate to a regime what the regime asks, and disclose the underlying document only where the demand reaches it, rather than surrendering an undifferentiated history to an intermediary and relying on it to disclose narrowly. Regulation (EU) 2016/679 makes minimal disclosure a legal principle: personal data must be adequate, relevant, and limited to what is necessary for the purpose (Article 5(1)(c)). Here the structure of the data, not a policy operated over it, keeps the content out of general circulation.
                    </PaperRun>
                    <PaperRun title="Two costs on this axis.">
                        Byproduct data is not a compliance solution, and two of its properties cut the other way. First, the data carries no fiscal attributes of its own: registration identifiers, tax categories, and rates presuppose a registered party inside a particular regime, which a substrate admitting on a key and a balance cannot know. Those attach from the parties&rsquo; own terms, and a demonstration is the data plus that attachment; how the data maps onto a given jurisdiction&rsquo;s invoice or filing model is decided by that regime&rsquo;s rules. Second, public data discloses to everyone, not only to the authority that asked. Counterparty relationships and transaction values are visible to competitors as well as to supervisors, a cost the ex-post forms do not impose. And where an address is linkable to a natural person, the immutability that makes the data good evidence sits uneasily with rights of erasure; parties address that by keeping identifying detail off-chain from the start.
                    </PaperRun>
                </PaperSubsection>
                <PaperSubsection title="3.9 Unit of account">
                    <p>
                        A substrate that makes promises credible must also denominate them, and the four columns differ in who chooses the unit. The firm keeps its books in a functional currency and pays over banking rails, so its reach is bounded by the rails that will carry the payment: correspondent relationships, sanctions screening, and an intermediary bank&rsquo;s willingness to serve a corridor. The platform runs a rail of its own: it holds the payments, publishes the units it accepts, decides who may receive a payout and where, and can revise all three. The court enforces in its forum&rsquo;s legal tender, which is one way the court is jurisdictional even when the bargain was not.
                    </p>
                    <p>
                        A shared unit is itself an instance of coordination, and one of the oldest. Menger (1892) accounts for the medium of exchange as an emergent convention: each participant accepts the object it expects others to accept, and the convergence of those expectations on one object <em>is</em> the institution. Kiyotaki and Wright (1989) give the modern statement: in a search economy an object&rsquo;s acceptability as a medium of exchange is an equilibrium sustained by beliefs, and more than one such equilibrium can exist. Jevons (1875, chap. 8) supplies the functional distinction: the unit in which accounts are kept and a bargain is reckoned may differ both from the coin that circulates and from the standard unit of value. Choosing a unit is therefore choosing a coordination device, and a group that already shares one has already solved a coordination problem.
                    </p>
                    <p>
                        The ex-post forms <em>prescribe</em> the device. The firm imposes its functional currency on what it internalizes, the platform its rail and its list of units, the court its forum&rsquo;s legal tender; in each case someone other than the parties decides before they arrive. The bond leaves the choice to the parties, who name the unit in the commitment they sign. It places two conditions on the unit. Bonds and payment are quoted in one unit within a process, because the schedule of Section 2.4 sets a bond against a value and the comparison holds only if the two are commensurable. And the unit is an ERC-20 token that delivers exactly the amount transferred and keeps the balances it delivered, because a rebasing token breaks the schedule: a downward rebase leaves the bonds short of it, and an upward one leaves a surplus that no resolution pays out. Within those conditions, choosing the unit is part of the coordination the parties perform, on the same footing as choosing the terms.
                    </p>
                    <p>
                        For a group with a unit of its own, the consequence is that its unit goes on coordinating its members when a trade crosses the group&rsquo;s boundary. A dispersed community that reckons in its own unit can trade among its members, and with outsiders willing to accept it, without converting the exchange into a monetary system that admits both ends, whose unavailability is usually a gate rather than a shortage of willing counterparties. The cost mirrors the benefit: the substrate supplies no stability, no conversion, and no view on whether the unit holds its value between commitment and resolution. A unit few will accept buys little, and the whole risk of choosing badly is the parties&rsquo;.
                    </p>
                </PaperSubsection>
                <PaperSubsection title="3.10 Transparency, verifiability, and privacy at once">
                    <p>
                        The last axis is a conjunction, because its three members usually trade against one another. <em>Transparency</em> is how much of the arrangement a party can see, before entering it and afterwards. <em>Verifiability</em> is whether a claim about how the arrangement operated can be checked by someone who does not trust its operator. <em>Privacy</em> is whether the substance of a trade stays with its parties. Each incumbent substrate gives up one of the three, and the sacrifice is structural.
                    </p>
                    <PaperRun title="The firm keeps privacy by giving up the other two.">
                        Almost nothing about a firm&rsquo;s internal coordination is visible outside its boundary, and part of what a boundary is for is keeping that arrangement unpublished. An outsider who needs assurance gets an auditor, which relocates the trust rather than removing it. The party inside has no privacy from the nucleus, whose authority to direct includes the authority to observe.
                    </PaperRun>
                    <PaperRun title="The platform is transparent to itself and opaque to everyone else.">
                        The operator sees every trade, price, and complaint; the participant sees what the interface displays. That asymmetry is the model, because the accumulated view is the asset (Section 3.2). Verifiability is absent in the strong sense: a participant cannot check that the rule that decided its case decided anyone else&rsquo;s. Privacy from third parties is real, and is often why participants prefer a platform; privacy from the operator does not exist.
                    </PaperRun>
                    <PaperRun title="The court buys publicity and review at privacy&rsquo;s expense.">
                        Open proceedings and reasoned, appealable judgments are the most developed institutional verifiability humanity has, and they are bought with compelled disclosure: what one holds becomes discoverable and what one argued becomes public. The transparency covers only the transactions that failed, which is why Section 3.8 finds the court near-useless for ordinary legibility.
                    </PaperRun>
                    <p>
                        The bond has all three, because it separates the object (Section 3.2). The public skeleton is what transparency and verifiability need, and the sealed content is what privacy needs. The fingerprint committed with the skeleton binds the two: a party can prove afterwards that the document it produces is the document that was bonded, without having published it. The equilibrium of Section 2.4 is a theorem at every position of a chain of any length (Figaro 2026a). What a machine check of an implementation must establish for that theorem to apply, the bond schedule and the resolution&rsquo;s transfers, is stated in Figaro (2026d).
                    </p>
                    <p>
                        The conjunction carries the cost Section 3.8 named: a skeleton public to a supervisor is public to a competitor. The institutional point is not that the bond is private, transparent, or checkable, since each incumbent is at least one of those. It is that the three normally trade against one another and here do not, because the substrate holds a fingerprint where the others hold the file.
                    </p>
                </PaperSubsection>
                <PaperSubsection title="3.11 The comparison in one view">
                    <p>
                        The first two columns are the firm&rsquo;s two business models. The table gives the ten axes thirteen rows. Axis 1 takes three, for who bears the cost, to whom it is revenue, and the shape of the charge, and axis 8 takes two, for the regulatory data and the cost of compliance.
                    </p>
                    <PaperScroll className="my-4">
                        <table className="text-sm border-collapse">
                            <thead>
                                <tr>
                                    {["Axis", "Firm: hierarchy", "Firm: platform", "Court", "Bond"].map((h) => (
                                        <th key={h} className="border border-default px-3 py-1.5 text-left font-semibold text-ink-heading">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td className="border border-default px-3 py-1.5">Cost borne by</td>
                                    <td className="border border-default px-3 py-1.5">the hierarchy, as standing overhead</td>
                                    <td className="border border-default px-3 py-1.5">the intermediary, recovered per trade</td>
                                    <td className="border border-default px-3 py-1.5">the state and the litigants</td>
                                    <td className="border border-default px-3 py-1.5">each party, for its own bond, before the trade</td>
                                </tr>
                                <tr>
                                    <td className="border border-default px-3 py-1.5">Cost is revenue to</td>
                                    <td className="border border-default px-3 py-1.5">the management function</td>
                                    <td className="border border-default px-3 py-1.5">the intermediary (take-rate and data)</td>
                                    <td className="border border-default px-3 py-1.5">the professions; funded by taxation</td>
                                    <td className="border border-default px-3 py-1.5">time value: nobody; gas: the network</td>
                                </tr>
                                <tr>
                                    <td className="border border-default px-3 py-1.5">Holds the map</td>
                                    <td className="border border-default px-3 py-1.5">the nucleus; dies with the entity</td>
                                    <td className="border border-default px-3 py-1.5">the intermediary; it is the asset</td>
                                    <td className="border border-default px-3 py-1.5">dockets: failures only, unusable in aggregate</td>
                                    <td className="border border-default px-3 py-1.5">skeleton public, content with the parties</td>
                                </tr>
                                <tr>
                                    <td className="border border-default px-3 py-1.5">Admission</td>
                                    <td className="border border-default px-3 py-1.5">hire, at the nucleus&rsquo;s discretion</td>
                                    <td className="border border-default px-3 py-1.5">terms of service; revocable</td>
                                    <td className="border border-default px-3 py-1.5">legal personality and standing</td>
                                    <td className="border border-default px-3 py-1.5">a key and a balance</td>
                                </tr>
                                <tr>
                                    <td className="border border-default px-3 py-1.5">Discretion</td>
                                    <td className="border border-default px-3 py-1.5">managerial; unreviewable from outside</td>
                                    <td className="border border-default px-3 py-1.5">operator policy; unilateral</td>
                                    <td className="border border-default px-3 py-1.5">judicial; procedural, reviewable</td>
                                    <td className="border border-default px-3 py-1.5">the buyer&rsquo;s, to resolve; forums rule but cannot resolve</td>
                                </tr>
                                <tr>
                                    <td className="border border-default px-3 py-1.5">Cost of instituting</td>
                                    <td className="border border-default px-3 py-1.5">incorporation; buys asset partitioning</td>
                                    <td className="border border-default px-3 py-1.5">two-sided launch; very high</td>
                                    <td className="border border-default px-3 py-1.5">not available to the parties</td>
                                    <td className="border border-default px-3 py-1.5">signatures, gas, and the bonds&rsquo; time value, per trade</td>
                                </tr>
                                <tr>
                                    <td className="border border-default px-3 py-1.5">Jurisdiction</td>
                                    <td className="border border-default px-3 py-1.5">chartered somewhere</td>
                                    <td className="border border-default px-3 py-1.5">regulated where it holds payments</td>
                                    <td className="border border-default px-3 py-1.5">constitutive; extended only by treaty</td>
                                    <td className="border border-default px-3 py-1.5">not a precondition of the trade</td>
                                </tr>
                                <tr>
                                    <td className="border border-default px-3 py-1.5">Charge shape</td>
                                    <td className="border border-default px-3 py-1.5">standing overhead, spread over trades</td>
                                    <td className="border border-default px-3 py-1.5">take-rate on value, plus the parties&rsquo; data</td>
                                    <td className="border border-default px-3 py-1.5">contingent and lumpy, per dispute</td>
                                    <td className="border border-default px-3 py-1.5">time value over the duration, plus the network&rsquo;s gas</td>
                                </tr>
                                <tr>
                                    <td className="border border-default px-3 py-1.5">Transparency / verifiability / privacy</td>
                                    <td className="border border-default px-3 py-1.5">privacy only; opaque and unverifiable outside</td>
                                    <td className="border border-default px-3 py-1.5">transparent to the operator alone; unverifiable</td>
                                    <td className="border border-default px-3 py-1.5">public and reviewable, at privacy&rsquo;s expense</td>
                                    <td className="border border-default px-3 py-1.5">all three: public skeleton, sealed content, bound by a fingerprint</td>
                                </tr>
                                <tr>
                                    <td className="border border-default px-3 py-1.5">Unit of account</td>
                                    <td className="border border-default px-3 py-1.5">functional currency; bank rails</td>
                                    <td className="border border-default px-3 py-1.5">the operator&rsquo;s rail and accepted list</td>
                                    <td className="border border-default px-3 py-1.5">the forum&rsquo;s legal tender</td>
                                    <td className="border border-default px-3 py-1.5">named by the parties; one exact-transfer token per process</td>
                                </tr>
                                <tr>
                                    <td className="border border-default px-3 py-1.5">Regulatory data</td>
                                    <td className="border border-default px-3 py-1.5">reconstructed from internal books; audited</td>
                                    <td className="border border-default px-3 py-1.5">held by the intermediary; it reports for you</td>
                                    <td className="border border-default px-3 py-1.5">adversarial only: disputes, by disclosure</td>
                                    <td className="border border-default px-3 py-1.5">byproduct of trading; signed by both sides</td>
                                </tr>
                                <tr>
                                    <td className="border border-default px-3 py-1.5">Compliance cost</td>
                                    <td className="border border-default px-3 py-1.5">standing overhead; favors the larger entity</td>
                                    <td className="border border-default px-3 py-1.5">bundled into the take-rate; access-contingent</td>
                                    <td className="border border-default px-3 py-1.5">borne per dispute; produces nothing otherwise</td>
                                    <td className="border border-default px-3 py-1.5">retrieval, plus disclosure and regime attributes from the parties</td>
                                </tr>
                                <tr>
                                    <td className="border border-default px-3 py-1.5">Fails by</td>
                                    <td className="border border-default px-3 py-1.5">agency loss; insolvency; costly exit</td>
                                    <td className="border border-default px-3 py-1.5">rule-setter is the cost-bearer; removal</td>
                                    <td className="border border-default px-3 py-1.5">delay, cost floor, repeat-player advantage</td>
                                    <td className="border border-default px-3 py-1.5">balance rationing; no remedy from the bond; no recovery</td>
                                </tr>
                            </tbody>
                        </table>
                    </PaperScroll>
                </PaperSubsection>
            </PaperSection>

            <PaperSection title="4. Discriminating Alignment">
                <p>
                    Williamson&rsquo;s discriminating-alignment hypothesis holds that transactions, which differ in their attributes, align with governance structures, which differ in their costs and competences, in a mainly transaction-cost-economizing way (Williamson 1985, 1991). We apply that hypothesis with the bond added to the menu. The purpose is to identify regions, not to compute an optimum: the cost objects are written as shapes, and the section extracts where the shapes cross.
                </p>
                <PaperSubsection title="4.1 Cost objects">
                    <p>
                        Let a trade run as a process of <Math>{"N"}</Math> orders of equal payment <Math>{"P"}</Math>, so that it carries value <Math>{"NP"}</Math>; a bilateral trade is the case <Math>{"N = 1"}</Math>. Let <Math>{"T"}</Math> be its duration from the first commitment to resolution, <Math>{"k"}</Math> the asset specificity of any investment a party must sink before the trade, and <Math>{"m \\geq 1"}</Math> the number of times the same activity recurs among the same parties over the period that bears the firm&rsquo;s standing overhead. Each shape below is the cost of a promise made good, attributed to one trade. The firm has a shape per business model, <Math>{"C_H"}</Math> under hierarchy and <Math>{"C_I"}</Math> as a platform.
                    </p>
                    <p>
                        For each party <Math>{"i"}</Math>, let <Math>{"\\ell_i \\in \\{0,1\\}"}</Math> indicate whether some legal order recognizes <Math>{"i"}</Math> as a bearer of rights and duties. For each order, let <Math>{"j \\in \\{0,1\\}"}</Math> indicate whether some legal order reaches both its buyer and its seller. Is an arbitral forum not available where no court is? Its award binds an unwilling party only through the treaty of Section 2.3, which gives some legal order reach over both parties, so <Math>{"j"}</Math> counts the forum&rsquo;s reach as the court&rsquo;s. Write <Math>{"r"}</Math> for the time value of a bonded token: the rate at which the real-world value the tokens represent erodes over time, regardless of the unit&rsquo;s price movements, so a unit stable in price carries it too. The mechanism does not state <Math>{"r"}</Math>, and every bond carries it. The comparison takes trades whose outcome the buyer can judge when it resolves, so no shape carries a loss from a wrong or withheld judgment.
                    </p>
                    <FormalBlock label="The four shapes.">
                        <p>
                            <em>Firm.</em> <Math>{"C_H = F_H/m + a"}</Math>: a standing overhead <Math>{"F_H"}</Math>, the firm&rsquo;s own matching included, amortized over the trades it covers, plus the agency and influence loss <Math>{"a"}</Math> of directing rather than pricing. It carries no hold-up term, because integration is what removes the hold-up. Decreasing in recurrence; available only where the activity can be brought inside, which requires <Math>{"\\ell_i = 1"}</Math> for every party brought in.
                        </p>
                        <p>
                            <em>Platform.</em> <Math>{"C_I = \\tau NP + \\delta + \\rho + h(k)"}</Math>, with <Math>{"I"}</Math> for intermediation: a take-rate <Math>{"\\tau"}</Math> on the value carried, the value <Math>{"\\delta"}</Math> of the parties&rsquo; data surrendered, the expected cost <Math>{"\\rho"}</Math> of revocable admission, and the expected hold-up loss <Math>{"h(k)"}</Math> on an investment sunk before the trade, rising in <Math>{"k"}</Math>. The take buys matching and enforcement together, so the shape carries no separate matching term. The take is proportional to value, independent of duration, and permanent. The shape is independent of <Math>{"j"}</Math>, because the platform&rsquo;s terms select its own forum, and available only where every party it serves has <Math>{"\\ell_i = 1"}</Math>, because terms of service need a party some legal order recognizes as bound by them (Section 4.4).
                        </p>
                        <p>
                            <em>Court.</em> <Math>{"C_C = A + \\phi + q(k)\\,(L + D) + h(k)"}</Math> for an order with <Math>{"j = 1"}</Math> whose buyer and seller both have <Math>{"\\ell_i = 1"}</Math>, and unavailable otherwise. <Math>{"A"}</Math> is the apparatus a claim presupposes (terms drafted to be enforceable, counsel, files kept against a dispute), paid on every trade whether or not a dispute arises. <Math>{"\\phi"}</Math> is the cost of finding the counterparties of one trade without a platform. <Math>{"q(k)"}</Math> is the probability that a breach occurs and is pursued, rising with specificity, <Math>{"L"}</Math> the litigation cost, and <Math>{"D"}</Math> the cost of delay; <Math>{"h(k)"}</Math> is the same hold-up loss, which a judgment does not cure. We take <Math>{"A"}</Math>, <Math>{"L"}</Math>, and <Math>{"D"}</Math> as approximately fixed with respect to <Math>{"P"}</Math>: an assumption, and the court&rsquo;s decisive property where it holds (Hadfield 2017).
                        </p>
                        <p>
                            <em>Bond.</em> <Math>{"C_B = N(N+3)\\,P\\,rT + g + \\phi + h(k)"}</Math>. The first term is the time value of every bond, each counted over the whole duration. The buyer locks <Math>{"2P"}</Math> at each commit and the seller at position <Math>{"i"}</Math> locks <Math>{"2iP"}</Math>, so the total locked is <Math>{"2NP + N(N+1)P = N(N+3)P"}</Math>, which is <Math>{"4P"}</Math> for a bilateral trade. Does the result need equal payments? It does not: with payments <Math>{"P_i"}</Math> the total locked is <Math>{"2\\sum_i P_i + 2\\sum_i G_i"}</Math>, larger than <Math>{"N(N+3)\\bar{P}"}</Math> at the same mean payment <Math>{"\\bar{P}"}</Math> where value comes early in the chain and smaller where it comes late, and the crossings below move with that total. <Math>{"g"}</Math> is the network&rsquo;s gas for the process: its <Math>{"N"}</Math> commits, each of which locks its two parties&rsquo; bonds, and its resolution. It rises with <Math>{"N"}</Math> and is fixed in <Math>{"P"}</Math>. <Math>{"\\phi"}</Math> is the court&rsquo;s matching term, because a commitment is admitted on its two signatures and the parties&rsquo; balances, never on how the counterparty was found, and <Math>{"h(k)"}</Math> is the same hold-up, since a bond on the trade does not reach an investment sunk before it. The tokens themselves are refunded in full at resolution, and the shape is independent of <Math>{"j"}</Math> and of every <Math>{"\\ell_i"}</Math>.
                        </p>
                        <p>
                            On the other side of the bond&rsquo;s ledger sits the data the process leaves. What the parties own and may sell is the sealed detail behind the hashes, the platform&rsquo;s <Math>{"\\delta"}</Math> with its sign reversed. Against it stands the skeleton&rsquo;s disclosure to competitors as well as supervisors, the cost Section 3.8 names.
                        </p>
                    </FormalBlock>
                    <PaperRemark title="On what these expressions are.">
                        They are shapes, not measurements. Each omits terms that matter in an application: the firm&rsquo;s organizational knowledge, how well a platform matches beyond what matching costs, the court&rsquo;s deterrence of breaches that never occur, the risk of the unit the parties chose (Section 3.9), and the cost of holding keys. The comparisons below turn only on how each expression varies with <Math>{"N"}</Math>, <Math>{"P"}</Math>, <Math>{"T"}</Math>, <Math>{"k"}</Math>, <Math>{"m"}</Math>, <Math>{"j"}</Math>, and <Math>{"\\ell_i"}</Math>, the level at which the omitted terms are least likely to reverse them.
                    </PaperRemark>
                    <PaperRemark title="What the mechanism fixes, and what it does not.">
                        The four expressions mix two kinds of term, and the results below depend on keeping them apart. The bond schedule fixes some quantities outright: the total locked, the payouts at resolution, and the position each party reaches by defecting. Anyone can compute these from the commitment and the two calls before the trade. The price of holding them is set elsewhere: <Math>{"r"}</Math> by no party, <Math>{"T"}</Math> by when the buyer resolves, and <Math>{"g"}</Math> by the network&rsquo;s market for block space. The terms of the other shapes depend on an institution or on conduct. <Math>{"F_H"}</Math> and <Math>{"a"}</Math> depend on how the firm is organized, <Math>{"\\tau"}</Math>, <Math>{"\\delta"}</Math>, and <Math>{"\\rho"}</Math> on the platform&rsquo;s policy, and <Math>{"A"}</Math>, <Math>{"L"}</Math>, and <Math>{"D"}</Math> on the forum and the jurisdiction. <Math>{"q(k)"}</Math> depends on how often breaches occur and are pursued, <Math>{"\\phi"}</Math> on whatever venue matches the parties, and <Math>{"h(k)"}</Math>, which every shape but the firm&rsquo;s carries, on the investment sunk before the trade. The cost crossings of Section 4.2 use terms of both kinds, so they hold at the parameter values stated; the court&rsquo;s absence where no legal order reaches both parties uses no price at all.
                    </PaperRemark>
                    <PaperRemark title="How these shapes stand to those of Figaro (2026c).">
                        The firm under hierarchy, the court, and the bond carry the shapes of the governance-cost proposition in Figaro (2026c), with that paper&rsquo;s market with a court written <Math>{"C_C"}</Math>, its trilateral mode counted in the court, its chain length <Math>{"n"}</Math> written <Math>{"N"}</Math>, its gas terms gathered into <Math>{"g"}</Math> and its loss from a wrong or withheld judgment set to zero, and with the platform <Math>{"C_I"}</Math> and the condition <Math>{"\\ell_i"}</Math> added here.
                    </PaperRemark>
                </PaperSubsection>
                <PaperSubsection title="4.2 The crossings">
                    <PaperRun title="Bond against court: a value threshold.">
                        The matching and hold-up terms stand on both sides and cancel, and for a process of <Math>{"N"}</Math> orders we hold the court&rsquo;s side at the expected cost of one claim. The bond is then the cheaper substrate when <Math>{"N(N+3)\\,P\\,rT + g < A + q(k)\\,(L + D)"}</Math>. The left side rises linearly in <Math>{"P"}</Math> and in <Math>{"T"}</Math>, and the right side is fixed in both, so the inequality holds at small value and reverses at the payment <Math>{"P^{*} = \\big(A + q(k)\\,(L + D) - g\\big)/\\big(N(N+3)\\,rT\\big)"}</Math>, which is <Math>{"\\big(A + q(k)\\,(L + D) - g\\big)/(4rT)"}</Math> for a bilateral trade. With the gas held equal, ten orders lower this payment threshold by the factor <Math>{"N(N+3)/4 = 32.5"}</Math>, and the threshold on the process&rsquo;s total value, <Math>{"NP^{*}"}</Math>, by <Math>{"(N+3)/4 = 3.25"}</Math>; the gas of ten commits lowers both further. The first answers how large each order&rsquo;s payment may be, and the second how much value one process may carry in all against a bilateral trade of the same value. Without the standing apparatus <Math>{"A"}</Math>, both thresholds are lower and still exist: above them, a large and long trade is cheaper to make good by a claim.
                    </PaperRun>
                    <PaperRun title="The bond's cost is certain, and the court's is contingent.">
                        The value threshold places the bond&rsquo;s strength where the court has always been unavailable in practice, the small transaction, where a claim costs more than it recovers. The two costs also differ in kind at the moment of choice. A party choosing the bond buys certainty about the cost of making its promise good, and a party relying on the court holds an option it pays for only in the states where it is exercised.
                    </PaperRun>
                    <PaperRun title="Bond against platform: a duration threshold.">
                        The hold-up term cancels, and the bond is the cheaper substrate when <Math>{"N(N+3)\\,P\\,rT + g + \\phi < \\tau NP + \\delta + \\rho"}</Math>, that is, when <Math>{"T < \\big[\\tau + (\\delta + \\rho - g - \\phi)/(NP)\\big]/\\big((N+3)\\,r\\big)"}</Math>. Only the take and the bonds&rsquo; time value are proportional to value; gas, matching, the surrendered data, and the revocation risk are absolute amounts, and they enter through the bracket. Setting the data and the revocation risk aside, and where gas and matching are small against the platform&rsquo;s take <Math>{"\\tau NP"}</Math>, the threshold is <Math>{"T < \\tau/\\big((N+3)\\,r\\big)"}</Math>, in which <Math>{"P"}</Math> cancels, and for a bilateral trade <Math>{"T < \\tau/(4r)"}</Math>. Matching is where the platform&rsquo;s own function enters the comparison: once <Math>{"\\phi + g"}</Math> reaches <Math>{"\\tau NP + \\delta + \\rho"}</Math>, the bracket is no longer positive and the platform is cheaper at every duration, the cost side of the thin market Proposition 4.1 assigns it. A payment rail that moves the payment for a few percent is the wrong comparison: it screens nobody, holds nothing, reverses nothing, and rules on nothing, so its charge is not the price of a substrate.
                    </PaperRun>
                    <PaperRun title="The magnitudes are illustrative.">
                        Take a trade of 100 tokens, ten times the trade of Section 1.3, at a time value of five percent a year. Held open for a week, its bonds cost 0.38 tokens of time value, and for ninety days 4.9, in each case plus the network&rsquo;s gas. A platform at a twenty percent take-rate keeps 20 tokens of the same trade, permanently, and takes the parties&rsquo; data besides, so the two meet at one year. Ten such orders lock 13,000 tokens, about 12 tokens of time value a week against the platform&rsquo;s 200 of the 1,000 carried, and the two meet at sixteen weeks. At ten percent both thresholds halve, to six months and eight weeks, and the 100-token trade held ninety days costs 9.9 tokens of time value against the platform&rsquo;s 20.
                    </PaperRun>
                    <PaperRun title="Bond against firm: frequency and specificity.">
                        The firm&rsquo;s cost falls with recurrence and the bond&rsquo;s does not, so recurrence favors internalization. Setting <Math>{"C_B"}</Math> against <Math>{"C_H"}</Math>, the bond is the cheaper substrate exactly when <Math>{"m < m^{*}(k) = F_H/(C_B - a)"}</Math>, wherever <Math>{"C_B - a"}</Math> is positive: the recurrence threshold Figaro (2026c) derives, below which the firm cannot spread its overhead over enough trades. Where <Math>{"C_B - a"}</Math> is not positive, the bond is cheaper at every recurrence. The threshold falls as <Math>{"k"}</Math> rises, because <Math>{"h(k)"}</Math> sits in the bond&rsquo;s cost and not in the firm&rsquo;s: the bond is sized to the value committed for this trade, and asset specificity concerns an investment sunk <em>before</em> the trade whose value depends on a particular counterparty. A bond cannot reach a hold-up over a sunk specific investment, because the investment at risk lies outside any single transaction. Both of Williamson&rsquo;s classic drivers point where they always pointed.
                    </PaperRun>
                    <PaperRun title="The crossing that is not about cost.">
                        Where <Math>{"j = 0"}</Math> for an order, no legal order reaches both its parties, and the court&rsquo;s cost is undefined rather than high: it supplies no credibility at any price. The court drops out there, and only the court. The firm rests on the law it is formed under and the platform on the law its terms select, so both remain, and the bond&rsquo;s comparison with them is the cost comparison above: recurrence and specificity against the firm, the duration threshold against the platform. The bond is indifferent to <Math>{"j"}</Math> because it sits on a different layer of rules: it makes the promise good before the trade and requires no legal order, and where a legal order reaches a party, it governs that party at the edge, ex post, with the data the process leaves (Figaro 2026b). The ex-post forms make the promise good afterwards, by authority, and each requires a legal order somewhere (Section 3.6). Section 4.4 treats a party with <Math>{"\\ell_i = 0"}</Math>, for whose orders all three alternatives drop out.
                    </PaperRun>
                </PaperSubsection>
                <PaperSubsection title="4.3 The alignment result">
                    <FormalBlock label="Proposition 4.1 (Substrate alignment).">
                        <p>
                            Under premises 1 to 7 below, the transaction-cost-economizing substrate is:
                        </p>
                        <ol className="space-y-2 list-decimal pl-6 text-sm">
                            <li><strong>the bond</strong>, where the counterparties are strangers to one another and to any common community, asset specificity is low, the buyer can judge the outcome when it resolves, each party holds the balance its bond requires, recurrence is below <Math>{"m^{*}(k)"}</Math>, the duration is below the platform threshold of Section 4.2 where a platform is available to the parties, and either each order&rsquo;s payment is below the court threshold <Math>{"P^{*}"}</Math> or <Math>{"j = 0"}</Math> for the order, which removes the court rather than out-pricing it; and for every order one of whose parties has <Math>{"\\ell_i = 0"}</Math>, once that party&rsquo;s first tokens reach it, which removes all three alternatives for that order;</li>
                            <li><strong>the firm under hierarchy</strong>, where asset specificity is high, recurrence is above <Math>{"m^{*}(k)"}</Math>, so that the standing overhead amortizes, or the transaction requires what no per-transaction arrangement supplies: assets pooled across projects, risk pooled across uncorrelated ventures, organizational knowledge held over time, and the asset partitioning that Hansmann and Kraakman (2000) identify as organizational law&rsquo;s irreducible contribution;</li>
                            <li><strong>the firm as platform</strong>, where the binding problem is the cross-side externality, a market thin enough that a counterparty must be attracted before one can be selected, and where a residual claimant able to shift the charge between the sides brings the thin side on board; and, on cost alone, where the trade stands open longer than the platform threshold of Section 4.2, which is every duration once <Math>{"\\phi + g"}</Math> reaches <Math>{"\\tau NP + \\delta + \\rho"}</Math>;</li>
                            <li><strong>the court</strong>, where each order&rsquo;s payment is above <Math>{"P^{*}"}</Math>, so that value and duration carry the bonds&rsquo; time value, with the gas, above the expected cost of a claim, where the trade needs relief after the fact, which acts on persons and which no bond pays, or where the interests at stake include those of parties who are not in the trade.</li>
                        </ol>
                    </FormalBlock>
                    <p><em>Premises.</em></p>
                    <ol className="space-y-2 list-decimal pl-6 text-sm">
                        <li><em>Cost shapes.</em> Each column costs the shape Section 4.1 states for it, <Math>{"C_H"}</Math>, <Math>{"C_I"}</Math>, <Math>{"C_C"}</Math> and <Math>{"C_B"}</Math>, in the terms of transaction-cost economics (Williamson 1985, 1991). The shapes are stipulated, not measured, and the comparisons use only how each varies with <Math>{"N"}</Math>, <Math>{"P"}</Math>, <Math>{"T"}</Math>, <Math>{"k"}</Math>, <Math>{"m"}</Math>, <Math>{"j"}</Math> and <Math>{"\\ell_i"}</Math>.</li>
                        <li><em>The bond&rsquo;s cost.</em> Universal performance with resolution is an equilibrium at every position of a chain of any length the network resolves in one call (Figaro 2026a, Theorem 3), under that paper&rsquo;s standing assumptions, among them that the parties are beyond each other&rsquo;s coercive reach and that nothing expires once the bonds are locked (Section 2.4). The parties are taken to play that equilibrium, which no theorem covers (Section 3.5): stipulated. On that path every bond is refunded, so the bond&rsquo;s own terms are the time value <Math>{"r"}</Math> of the tokens locked over <Math>{"T"}</Math> and the gas <Math>{"g"}</Math>, with no litigation term.</li>
                        <li><em>Judgment.</em> The buyer can judge the outcome when it resolves, so no shape carries a loss from a wrong or withheld judgment. Stipulated (Section 4.1).</li>
                        <li><em>One claim.</em> For a process of <Math>{"N"}</Math> orders, the court&rsquo;s side is held at the expected cost of one claim, <Math>{"A + q(k)\\,(L + D)"}</Math>. Stipulated (Section 4.2).</li>
                        <li><em>Availability.</em> The court is available for an order only where <Math>{"j = 1"}</Math> and both its parties have <Math>{"\\ell_i = 1"}</Math>, an arbitral forum&rsquo;s reach counting as the court&rsquo;s through the treaty (United Nations 1958; Section 2.3). The firm and the platform are available only to parties with <Math>{"\\ell_i = 1"}</Math>, on the law each selects (Section 4.1). The bond admits on a signature and a balance alone, whatever <Math>{"j"}</Math> and <Math>{"\\ell_i"}</Math> are, and a party&rsquo;s first tokens reach it by a transfer from someone else (Sections 3.3 and 4.4).</li>
                        <li><em>Functions the bond does not perform.</em> A bond on the trade is sized to the value committed for that trade and refunded at its resolution, so it does not reach the hold-up Williamson (1985) locates in an investment sunk before the trade whose value depends on a particular counterparty (Section 4.2); a hostage sized to that investment (Williamson 1983) is another instrument. It pools no assets or risk, holds no organizational knowledge, and partitions no assets, the contribution Hansmann and Kraakman (2000) assign to organizational law. It attracts no thin side, which a platform does by shifting its charge between the sides (Rochet and Tirole 2003, 2006). It pays no remedy: relief after the fact acts on persons (Section 3.7).</li>
                        <li><em>Strangers.</em> Parties who share a relationship or a community often trade on relational norms alone, with none of the four columns consulted (Macaulay 1963; Ellickson 1991). The reputational regimes behind such trade require closure (Section 2.5), so the four columns are compared for parties strangers to one another and to any common community.</li>
                    </ol>
                    <p>
                        <em>Step 1, value.</em> By premises 1, 2 and 4, the matching and hold-up terms cancel between <Math>{"C_B"}</Math> and <Math>{"C_C"}</Math>. The bond is then cheaper exactly when <Math>{"N(N+3)\\,P\\,rT + g < A + q(k)\\,(L + D)"}</Math>, which holds below the payment <Math>{"P^{*}"}</Math> and reverses above it (Section 4.2). This gives item 1&rsquo;s court condition and item 4&rsquo;s value condition.
                    </p>
                    <p>
                        <em>Step 2, duration.</em> By premises 1 and 2, the hold-up term cancels between <Math>{"C_B"}</Math> and <Math>{"C_I"}</Math>. The bond is cheaper exactly while <Math>{"T < \\big[\\tau + (\\delta + \\rho - g - \\phi)/(NP)\\big]/\\big((N+3)\\,r\\big)"}</Math>, and at no duration once <Math>{"\\phi + g"}</Math> reaches <Math>{"\\tau NP + \\delta + \\rho"}</Math> (Section 4.2). This gives item 1&rsquo;s platform condition and item 3&rsquo;s cost clause.
                    </p>
                    <p>
                        <em>Step 3, recurrence and specificity.</em> By premises 1 and 2, the bond is cheaper than the firm exactly when <Math>{"m < m^{*}(k) = F_H/(C_B - a)"}</Math> where <Math>{"C_B - a"}</Math> is positive, and at every recurrence otherwise. The threshold falls as <Math>{"k"}</Math> rises, because <Math>{"h(k)"}</Math> sits in <Math>{"C_B"}</Math> and not in <Math>{"C_H"}</Math> (Section 4.2). This gives item 1&rsquo;s recurrence condition and item 2&rsquo;s recurrence clause, and <Math>{"m^{*}(k)"}</Math> divides the two items; specificity enters both through <Math>{"m^{*}(k)"}</Math> and, by step 5, as a function.
                    </p>
                    <p>
                        <em>Step 4, availability.</em> By premise 5, where <Math>{"j = 0"}</Math> for an order the court supplies no credibility at any price and drops out, while the firm and the platform remain, so steps 2 and 3 alone compare the bond with them. Where a party to the order has <Math>{"\\ell_i = 0"}</Math>, all three drop out, and the bond is the one substrate there once that party&rsquo;s first tokens reach it. Items 2 to 4 hold only where the substrate they name is available.
                    </p>
                    <p>
                        <em>Step 5, functions and domain.</em> By premise 6, a transaction that needs a function the bond does not perform needs the institution that performs it: the firm for pooled or partitioned assets and specific investments, the platform for a thin side, the court for relief after the fact owed to a party or a non-party. This gives the functional clauses of items 2 to 4, and where such a transaction lies in item 1&rsquo;s region the bond composes with that institution. By premises 3 and 7, the comparison runs only over trades whose buyer can judge the outcome when it resolves and whose parties are strangers to one another and to any common community, which are item 1&rsquo;s first and third conditions.
                    </p>
                    <p>
                        <em>Conclusion.</em> Under premises 1 to 7, the bond is the transaction-cost-economizing substrate where the counterparties are strangers to one another and to any common community, asset specificity is low, the buyer can judge the outcome when it resolves, each party holds the balance its bond requires, recurrence is below <Math>{"m^{*}(k)"}</Math>, the duration is below the platform threshold where a platform is available, and each order&rsquo;s payment is below <Math>{"P^{*}"}</Math> or <Math>{"j = 0"}</Math> for the order. For every order one of whose parties has <Math>{"\\ell_i = 0"}</Math>, once that party&rsquo;s first tokens reach it, the bond is the one substrate available. The firm in either business model and the court are the economizing substrate in the regions of items 2 to 4, each where it is available.
                    </p>
                    <p>
                        <em>Falsifier.</em> The proposition is refuted by a transaction that meets every condition of item 1 and for which, on the shapes as stated, another column&rsquo;s expression is lower, which refutes the step that placed it. It is refuted too by a term the shapes omit that varies in <Math>{"N"}</Math>, <Math>{"P"}</Math>, <Math>{"T"}</Math>, <Math>{"k"}</Math>, <Math>{"m"}</Math>, <Math>{"j"}</Math> or <Math>{"\\ell_i"}</Math> and reverses a crossing, which refutes premise 1. It is refuted as well by a firm, a platform or a forum that admits a party with <Math>{"\\ell_i = 0"}</Math> in its own name and holds it to its terms, which refutes premise 5; by bonded trades in item 1&rsquo;s region whose parties do not play the equilibrium, which refutes premise 2; and by a regime that makes good, at lower cost, the promise of a stranger met once outside any community, which refutes premise 7.
                    </p>
                    <p>
                        <em>Scope.</em> The proposition is analytic: it compares substrates, touches the firm&rsquo;s hierarchy only at the make-or-buy margin, and makes no empirical claim about how the bond performs in the field (Section 1.4). Its crossings hold at the parameter values stated; the court&rsquo;s absence where <Math>{"j = 0"}</Math> uses no price (Section 4.1). The alignment is over regions of transaction space, not industries or sectors, and every real economy contains all four sets of conditions at once. Inside item 1&rsquo;s region the bond is an alternative to the other three columns for one function, making a stranger&rsquo;s promise worth acting on for the length of one trade; outside it, the proposition claims nothing. The shapes omit the terms Section 4.1 names, among them the unit&rsquo;s risk and the cost of holding keys, and the bond&rsquo;s region holds only for parties who hold the balance their bonds require (Section 3.7). For a party with <Math>{"\\ell_i = 0"}</Math> the claim is about operation, not genesis, and holds for as long as its receipts cover its bonds (Section 4.4); the boundaries move with <Math>{"r"}</Math> and with the fixed cost of a claim, as the second corollary below states.
                    </p>
                    <p>
                        Two corollaries follow. The first is that the columns <em>compose</em>, because discrete structural alternatives are alternatives per transaction, not per participant. A firm may bond its external trades while directing its internal ones. An assembly may compose an arbitral forum into a process&rsquo;s open window and borrow the court&rsquo;s reviewable discretion without its cost floor. And a platform may offer discovery and matching over trades it does not stand behind, the two-sided function separated from the enforcement function.
                    </p>
                    <p>
                        The second is that the boundaries move with parameters that are not institutional. The platform threshold <Math>{"\\tau/\\big((N+3)\\,r\\big)"}</Math> is inversely proportional to <Math>{"r"}</Math>, so a higher time value hands trades to the platform, at the rates Section 4.2 works through. The court threshold <Math>{"P^{*}"}</Math> rises with the fixed cost of a claim, so anything that lowers that cost, and Hadfield (2017) argues much of it could fall, moves the threshold down and gives the court territory back. A comparative result of this kind is a statement about a configuration of prices, and it is re-derived when they change.
                    </p>
                </PaperSubsection>
                <PaperSubsection title="4.4 The strongest region: participants no legal order recognizes">
                    <p>
                        For a party with <Math>{"\\ell_i = 0"}</Math> the comparison stops being about cost. A substrate that admits on legal personality cannot admit a participant that has none. A software agent transacting on its own behalf, or a productive asset that holds a key and receives what it earns, cannot be hired into a hierarchy in its own name, cannot accept terms of service as a person the operator can pursue, and cannot sue or be sued. Under the ex-post forms such a participant transacts only through a recognized person who stands for it, which is to say the person transacts.
                    </p>
                    <p>
                        The bond takes no view on what stands behind a key: it checks a signature and a balance, not a biography. Its admission condition is therefore met by participants the ex-post forms exclude in principle, and the exclusion follows from what a firm, in either business model, and a court each are, so better rules would not close it. Whether an economy should have such participants is a normative question this paper does not reach. That the bond alone can carry them is a structural fact: in this region the alignment is the absence of an alternative. The region has one limit, which stands beside the claim. The bond admits on a balance, and a participant cannot bond its way to its first tokens: they reach it by a transfer from someone else, and the route by which they enter may run through a person some legal order recognizes. The claim is therefore about operation, not genesis. Once funded, the participant transacts on its own account, for as long as its receipts cover its bonds, with no recognized person standing in for it at any trade. That condition is a selection: the population of the region is bounded by what recognized parties choose to fund, and sustained only by participants whose receipts cover their costs.
                    </p>
                </PaperSubsection>
            </PaperSection>

            <PaperSection title="5. Substrate Neutrality">
                <p>
                    A comparison of substrates invites a category error, and the argument fails if it is committed: a substrate does not encode an economic ideology, and no result above is a claim about one. The bond makes a promise good before the trade, and in one sense only: a party who takes value and returns nothing is worse off for having done so. It takes no position on who should trade, what a fair price is, whether surplus should accrue to capital or to labor, whether an activity should be undertaken for profit, or how participants organize among themselves.
                </p>
                <p>
                    Mutually hostile arrangements therefore run on it unchanged. A market-liberal graph in which each participant sells at whatever price is agreed; a cooperative graph in which producers hold the surplus in common and distribute it by their own rule; an Islamic-finance graph whose permitted structures exclude interest and share risk; a mutual-aid graph whose trades net to nothing: all four are arrangements of parties, terms, and payments above the same substrate. The substrate distinguishes none of them, because it holds only bonds, the cumulative value, and the fingerprints of agreements it never reads.
                </p>
                <p>
                    Neutrality cuts against the argument as often as for it. A substrate that takes no positions protects no one: it does not favor the weaker party, cap a price, enforce a labor standard, distinguish an essential good from a luxury, or know whether the party posting a bond can afford it. By the balance condition of Section 3.7, some parties who ought to be able to trade will not be. Everything protective is built above the substrate, in the clauses a designer composes and the parties select, and in the forums those terms name. Neutrality is a property, not a virtue, and its merit here is narrow: it makes this a comparison between substrates rather than a contest between a substrate and someone&rsquo;s politics.
                </p>
                <p>
                    The ex-post forms are not neutral in this sense, and the difference is structural: a party in the middle, or a legal order, makes the distributional choice. The firm under hierarchy takes a position by construction: it organizes activity under an authority relation and allocates the residual to an ownership nucleus, a determinate answer to a distributional question. Under the platform&rsquo;s business model it takes one each time it sets its price structure, since choosing which side to subsidize is choosing who bears the cost of the market existing (Rochet and Tirole 2003). The court takes the position of its legal order, which is why the same contract yields different outcomes in different jurisdictions and forum selection is itself a negotiated term. The bond&rsquo;s abstention leaves those choices to be made explicitly, in the assemblies designers compose and parties select, and explicit is not the same as absent.
                </p>
            </PaperSection>

            <PaperSection title="6. Conclusion">
                <p>
                    The bonded commitment is a different arrangement for making a promise good, not a better version of the firm, in either business model, or of the court: it returns the burden to the parties and moves it before the trade, and its cost is the time value of their own bonds, which no one receives, plus the network&rsquo;s gas. On the cost shapes, that arrangement is the economizing choice between strangers at low asset specificity and below the firm&rsquo;s recurrence threshold. For a trade of <Math>{"N"}</Math> equal orders whose gas and matching are small beside a platform&rsquo;s take, it is the cheaper substrate while the trade stands open less than <Math>{"\\tau/\\big((N+3)\\,r\\big)"}</Math> and while each order&rsquo;s payment is below the court threshold <Math>{"P^{*}"}</Math>. Where no legal order reaches both parties the court drops out, and the bond meets the firm and the platform on cost alone; for the orders of a party no legal order recognizes, once its first tokens reach it, the bond alone is available. Beyond those bounds, where investments are specific, activity recurs above the firm&rsquo;s threshold, assets must be pooled or partitioned, thin markets must be built, durations are long, or relief must act on persons after the fact, for a party or a non-party, or the decision that ends a trade must answer to a reviewer, the firm, the platform, and the court keep their columns. This paper adds a fourth column to the menu of discrete structural alternatives, and the useful question about any transaction is which of the four its attributes align with.
                </p>
            </PaperSection>
        </PaperLayout>
    );
}
