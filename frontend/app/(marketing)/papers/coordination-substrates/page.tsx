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

export const metadata: Metadata = withOg({
    title: "Coordination Substrates: Firm, Platform, Court, and Bond — Figaro Protocol",
    description:
        "A comparative institutional analysis of the four substrates on which trade between strangers can be made safe — internalization into a firm, intermediation through a platform, externalization to a court, and the parties' own bonded commitment — compared on who bears the enforcement cost, who holds the resulting map, admission, discretion, the cost of instituting, jurisdiction dependence, failure modes, fiscal and regulatory legibility, and who chooses the unit of account, with a discriminating-alignment result identifying where each dominates.",
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
            title="Coordination Substrates: Firm, Platform, Court, and Bond"
            subtitle="A Comparative Institutional Analysis of Trade Between Strangers"
            author="Figaro"
            date="August 2026"
            watermark="Figaro Protocol · Preprint"
            keywords="comparative institutional analysis, discriminating alignment, transaction cost economics, contract enforcement, two-sided markets, private ordering, bonded commitment, institutional substrates, regulatory reporting, unit of account"
            abstract={
                <>
                    <p>
                        A promise between strangers is not credible on its own. Every market, and every ideology that organizes one, therefore runs on a <em>coordination substrate</em>: an institutional technology that makes a stranger&rsquo;s promise worth acting on. History supplies three. A trade can be <em>internalized</em>, brought inside a firm where hierarchy bears the enforcement cost and recovers it from residual output. It can be <em>intermediated</em>, routed through a platform that bears the cost and is paid in a take-rate and in the record of who trades what with whom. It can be <em>externalized</em>, left to a court that will hear a complaint afterwards, at the state&rsquo;s expense and the parties&rsquo;, within a jurisdiction both are inside. This paper treats a fourth: the parties bear the cost themselves, ex ante, as a temporary and self-liquidating capital lockup that no one collects and that settlement returns.
                    </p>
                    <p>
                        We compare the four as discrete structural alternatives in Williamson&rsquo;s sense, on ten institutional axes: who bears the enforcement cost, in what shape, and to whom it is revenue; who ends up holding the map of who traded what; the conditions of admission; where discretion sits and whether it is reviewable; the marginal cost of standing up a <em>new</em> institution; dependence on a shared jurisdiction; characteristic failure modes; how the records that fiscal and regulatory regimes demand are produced, and at what cost; who chooses the unit in which the bargain is reckoned; and whether transparency, verifiability, and privacy can be had together. The axes do not merely rank the substrates &mdash; they separate them. Three of the four turn the enforcement cost into somebody&rsquo;s revenue, and therefore produce a constituency with an interest in its level; the fourth turns it into a carry with no recipient, which is a real social cost with no one positioned to ratchet it. Three condition admission on something a party may not have &mdash; an employer, an accepted terms-of-service, a legal personality; the fourth conditions it on a key and a balance. And where the first three produce the records that tax and regulatory regimes demand by reconstruction, by proprietary custody, or only adversarially, the fourth emits a signed settlement record as a byproduct of trading, so that demonstrating what a regime asks becomes a retrieval rather than a reconstruction. And where the first three each prescribe the unit in which a bargain is reckoned &mdash; a functional currency, an operator&rsquo;s rail, a forum&rsquo;s legal tender &mdash; the fourth leaves that choice to the parties, so the oldest coordination device of all remains theirs to select. And where each of the first three obtains transparency, verifiability, or privacy by sacrificing another of the three, the fourth holds a fingerprint where the others hold the file, and so has all three at once.
                    </p>
                    <p>
                        We then state a discriminating-alignment result. The enforcement cost of the bonded substrate is proportional to transaction value and to duration; that of the court is roughly fixed per dispute and contingent on breach; that of the platform is proportional to value and permanent; that of the firm is a standing overhead amortized over frequency. Those different shapes cross at identifiable places, and the crossings mark out the region where the fourth substrate dominates &mdash; stranger counterparties, no shared jurisdiction, low asset specificity, short duration, values too small for litigation to be economic, and participants with no legal personality at all &mdash; alongside the regions the other three keep: asset specificity, capital aggregation and asset partitioning for the firm; thin markets and the cross-side externality for the platform; remedies unbounded by any posted stake, non-monetary relief, and the interests of non-parties for the court. The claim is dominance in a region, never supersession. We close on substrate neutrality: a substrate takes no position on what is built on it &mdash; a market-liberal graph, a cooperative graph, and an Islamic-finance graph run on the same one &mdash; so the comparison here is between substrates and never between a substrate and an ideology.
                    </p>
                </>
            }
            references={
                <>
                    <li>Acquisti, A., Taylor, C., &amp; Wagman, L. The Economics of Privacy. <em>Journal of Economic Literature</em>, 54(2):442&ndash;492, 2016.</li>
                    <li>CEN. <em>EN 16931-1: Electronic Invoicing &mdash; Part 1: Semantic Data Model of the Core Elements of an Electronic Invoice</em>. European Committee for Standardization, Brussels, 2017.</li>
                    <li>Coase, R. H. The Nature of the Firm. <em>Economica</em>, 4(16):386&ndash;405, 1937.</li>
                    <li>Coase, R. H. The Problem of Social Cost. <em>Journal of Law and Economics</em>, 3:1&ndash;44, 1960.</li>
                    <li>Demsetz, H. Toward a Theory of Property Rights. <em>American Economic Review</em>, 57(2):347&ndash;359, 1967.</li>
                    <li>Dixit, A. K. <em>Lawlessness and Economics: Alternative Modes of Governance</em>. Princeton University Press, Princeton, NJ, 2004.</li>
                    <li>Ellickson, R. C. <em>Order Without Law: How Neighbors Settle Disputes</em>. Harvard University Press, Cambridge, MA, 1991.</li>
                    <li>European Union. <em>Council Directive 2006/112/EC of 28 November 2006 on the common system of value added tax</em>.</li>
                    <li>European Union. <em>Directive 2014/55/EU of the European Parliament and of the Council of 16 April 2014 on electronic invoicing in public procurement</em>.</li>
                    <li>European Union. <em>Regulation (EU) 2016/679 of the European Parliament and of the Council of 27 April 2016 on the protection of natural persons with regard to the processing of personal data and on the free movement of such data (General Data Protection Regulation)</em>.</li>
                    <li>European Union. <em>Council Directive (EU) 2021/514 of 22 March 2021 amending Directive 2011/16/EU on administrative cooperation in the field of taxation</em>.</li>
                    <li>European Union. <em>Directive (EU) 2022/2464 of the European Parliament and of the Council of 14 December 2022 as regards corporate sustainability reporting</em>.</li>
                    <li>European Union. <em>Regulation (EU) 2023/956 of the European Parliament and of the Council of 10 May 2023 establishing a carbon border adjustment mechanism</em>.</li>
                    <li>Galanter, M. Why the &ldquo;Haves&rdquo; Come Out Ahead: Speculations on the Limits of Legal Change. <em>Law &amp; Society Review</em>, 9(1):95&ndash;160, 1974.</li>
                    <li>Greif, A. Contract Enforceability and Economic Institutions in Early Trade: The Maghribi Traders&rsquo; Coalition. <em>American Economic Review</em>, 83(3):525&ndash;548, 1993.</li>
                    <li>Hadfield, G. K. <em>Rules for a Flat World: Why Humans Invented Law and How to Reinvent It for a Complex Global Economy</em>. Oxford University Press, New York, 2017.</li>
                    <li>Hansmann, H. &amp; Kraakman, R. The Essential Role of Organizational Law. <em>Yale Law Journal</em>, 110(3):387&ndash;440, 2000.</li>
                    <li>Jevons, W. S. <em>Money and the Mechanism of Exchange</em>. D. Appleton and Company, New York, 1875.</li>
                    <li>Kiyotaki, N. &amp; Wright, R. On Money as a Medium of Exchange. <em>Journal of Political Economy</em>, 97(4):927&ndash;954, 1989.</li>
                    <li>Macaulay, S. Non-Contractual Relations in Business: A Preliminary Study. <em>American Sociological Review</em>, 28(1):55&ndash;67, 1963.</li>
                    <li>Menger, C. On the Origin of Money. <em>Economic Journal</em>, 2(6):239&ndash;255, 1892.</li>
                    <li>Milgrom, P. R., North, D. C., &amp; Weingast, B. R. The Role of Institutions in the Revival of Trade: The Law Merchant, Private Judges, and the Champagne Fairs. <em>Economics and Politics</em>, 2(1):1&ndash;23, 1990.</li>
                    <li>North, D. C. <em>Institutions, Institutional Change and Economic Performance</em>. Cambridge University Press, Cambridge, 1990.</li>
                    <li>Ostrom, E. <em>Governing the Commons: The Evolution of Institutions for Collective Action</em>. Cambridge University Press, Cambridge, 1990.</li>
                    <li>Rochet, J.-C. &amp; Tirole, J. Platform Competition in Two-Sided Markets. <em>Journal of the European Economic Association</em>, 1(4):990&ndash;1029, 2003.</li>
                    <li>Rochet, J.-C. &amp; Tirole, J. Two-Sided Markets: A Progress Report. <em>RAND Journal of Economics</em>, 37(3):645&ndash;667, 2006.</li>
                    <li>Schelling, T. C. <em>The Strategy of Conflict</em>. Harvard University Press, Cambridge, MA, 1960.</li>
                    <li>Simon, H. A. A Formal Theory of the Employment Relationship. <em>Econometrica</em>, 19(3):293&ndash;305, 1951.</li>
                    <li>United Nations. <em>Convention on the Recognition and Enforcement of Foreign Arbitral Awards</em>. New York, 10 June 1958.</li>
                    <li>Williamson, O. E. Credible Commitments: Using Hostages to Support Exchange. <em>American Economic Review</em>, 73(4):519&ndash;540, 1983.</li>
                    <li>Williamson, O. E. <em>The Economic Institutions of Capitalism</em>. Free Press, New York, 1985.</li>
                    <li>Williamson, O. E. Comparative Economic Organization: The Analysis of Discrete Structural Alternatives. <em>Administrative Science Quarterly</em>, 36(2):269&ndash;296, 1991.</li>
                </>
            }
        >
            <PaperSection title="1. Introduction">
                <p>
                    Two parties who have never met, and who will very likely never meet again, wish to exchange value. Each can see what the other says. Neither can see what the other will do. The exchange is worth making to both of them, and it does not happen &mdash; not because either has decided against it, but because a promise, on its own, is not a thing either can act on. This is the oldest problem in economic organization, and no market has ever solved it by exhortation. Markets solve it by running on something: an institutional technology underneath the trade that converts a promise into something worth acting on. We call that technology a <em>coordination substrate</em>, and this paper is a comparison among four of them.
                </p>
                <p>
                    The comparison is worth making now because the fourth is new, and because its arrival is easy to misread in two opposite directions at once &mdash; as a general replacement for the other three, which it is not, or as a curiosity confined to digital goods, which it also is not. Neither reading survives an axis-by-axis comparison, which is what we set out to conduct.
                </p>
                <PaperSubsection title="1.1 What a substrate is, and what it is not">
                    <p>
                        By a coordination substrate we mean the layer at which a defection is made unattractive, and nothing above that layer. North (1990) locates the central difficulty of impersonal exchange precisely here: the costs of measuring what is being exchanged and of enforcing the terms of exchange are what make transacting expensive, and the historical inability to enforce contracts cheaply between people who are not personally known to one another is, on his account, a principal source of stagnation. Coase (1960) makes the corresponding methodological point &mdash; where transacting is costless the assignment of rights does not affect what gets produced, and it is only because transacting is costly that institutional arrangements have any consequences at all. A substrate is what makes the cost what it is.
                    </p>
                    <p>
                        A substrate is not a market, an ideology, or a business model. It is the answer to one question: <em>if my counterparty takes the value and gives nothing back, what happens?</em> Everything else &mdash; how prices are discovered, who is allowed to profit, what counts as fair, whether the surplus is distributed by shares or by shares of work &mdash; is built on top of a substrate and is not a property of it. Section 5 states the consequence of that separation carefully, because it is the point on which comparative arguments of this kind are most often misread.
                    </p>
                </PaperSubsection>
                <PaperSubsection title="1.2 The four">
                    <p>
                        The four substrates differ in <em>who is made to bear the enforcement burden</em>, and each of the first three answers by locating that burden with a party other than the two who are trading.
                    </p>
                    <ol className="space-y-2 list-decimal pl-6 text-sm">
                        <li><strong>Internalization &mdash; the firm.</strong> The trade is brought inside an organization. The parties stop being counterparties and become positions in a hierarchy, and the enforcement problem is replaced by an authority relation: performance is directed rather than promised. The hierarchy bears the cost as standing overhead and recovers it from residual output.</li>
                        <li><strong>Intermediation &mdash; the platform.</strong> The trade is routed through a standing intermediary that stands behind it: it screens both sides, holds funds, reverses payments, scores conduct, and expels. The intermediary bears the cost and is paid twice &mdash; in a take-rate, and in the record of who traded what with whom.</li>
                        <li><strong>Externalization &mdash; the court.</strong> The trade is left bilateral, and a public adjudicator stands behind it after the fact. The state bears the marginal cost of adjudication out of taxation; the parties bear filing, counsel, and delay; and the arrangement works only where both parties are inside a jurisdiction whose judgments reach them.</li>
                        <li><strong>Self-bonding &mdash; the bonded commitment.</strong> The parties bear the cost themselves, before the fact, by locking capital that the settlement of the trade returns to them. Nobody receives the cost, because it is not a payment: it is the carry on capital immobilized for the duration of the trade. Section 2.4 states the mechanism.</li>
                    </ol>
                </PaperSubsection>
                <PaperSubsection title="1.3 Scope">
                    <p>
                        Three boundaries define what follows. First, this is a comparison of substrates, not a theory of the firm. Where the argument touches the boundary of the firm it restates only the slice it needs and stops: what a fixed-cost enforcement technology does to the make-or-buy margin is a Coasean calculation, and it is another treatment&rsquo;s subject rather than this one&rsquo;s. Second, the paper says nothing about how the fourth substrate&rsquo;s common infrastructure is funded, nor about any unit of account it might use; both are questions of their own and neither is needed here. Third, and most important for how the results should be read: the fourth substrate is realized rather than hypothetical &mdash; a mechanism implementing it settles processes on a public record &mdash; but every process settled there so far is the authoring project&rsquo;s own exercise of it. There is no observed play by independent participants. Everything below is therefore analytic: a comparison of institutional structures and their cost shapes, containing no empirical claim about how the fourth substrate performs in the field.
                    </p>
                </PaperSubsection>
            </PaperSection>

            <PaperSection title="2. The Four Substrates">
                <PaperSubsection title="2.1 Internalization: the firm">
                    <p>
                        Coase (1937) asked why, if markets allocate efficiently, so much economic activity happens inside organizations where nothing is priced at all. His answer was that using the price mechanism has costs &mdash; discovering prices, negotiating each bargain, enforcing what was agreed &mdash; and that when those costs exceed the cost of directing the same activity by authority, the activity moves inside. The firm, on this reading, is not primarily an owner of assets or a bearer of risk. It is a device for not having to transact.
                    </p>
                    <p>
                        What replaces the transaction is subordination. Simon (1951) gives the relation its exact form: an employment contract is one in which one party accepts, in advance and for a price, the other&rsquo;s authority to select their behaviour from within an agreed zone. The employee does not promise a particular performance; the employee promises to do as directed within the zone. That is why internalization solves the enforcement problem so completely for the transactions it covers: there is no promise between strangers left to enforce, because there is no longer a bargain at each step, only an instruction. Williamson (1991) adds the corresponding legal fact, and it is the one most often forgotten in comparisons of this kind: hierarchy comes with a contract-law regime of its own, <em>forbearance</em>, under which courts decline to hear disputes between divisions of the same firm. The firm is its own court of ultimate appeal. Internalization does not lower the cost of enforcement so much as move it out of the legal system entirely and into management.
                    </p>
                    <p>
                        The price of that move is the standing organization: a nucleus that must exist before any particular transaction and continue after it, carrying hiring, direction, monitoring, and the loss of the information that prices would otherwise have supplied. The overhead is fixed with respect to any one trade and is therefore cheap per transaction only where transactions are frequent.
                    </p>
                </PaperSubsection>
                <PaperSubsection title="2.2 Intermediation: the platform">
                    <p>
                        The platform leaves the parties outside each other&rsquo;s organizations and inserts a third that stands behind the trade. Its enforcement work is real and unglamorous: admitting participants, holding money until delivery, reversing payments, adjudicating complaints under its own policy, maintaining a rating that raises the cost of a bad act, and removing participants who commit one. A buyer transacting with a stranger on a platform is not trusting the stranger; the buyer is trusting the platform&rsquo;s willingness to make the buyer whole and its power to punish.
                    </p>
                    <p>
                        Rochet and Tirole (2003) supply the analytic account of what such an intermediary is and how it earns. A platform serves two user groups whose members do not internalize the value their own participation creates for the other side, and its characteristic instrument is the <em>price structure</em> &mdash; the allocation of the total charge between the two sides, as distinct from its level. Rochet and Tirole (2006) make this the criterion: a market is two-sided when the volume of transactions depends on how the charge is split and not only on its total, so that shifting a unit of charge from the seller side to the buyer side, holding the sum fixed, changes how much trade occurs. The platform courts and where necessary subsidizes the harder side, and recovers from the side whose participation is less elastic.
                    </p>
                    <p>
                        For the comparison that follows, two features matter more than the fee itself. The charge is a <em>transfer</em>: it leaves the parties and stays with the intermediary, and no settlement returns it. And the charge is only half of what is paid. The intermediary also ends up holding the transaction record &mdash; who bought what, from whom, at what price, how often &mdash; which is the asset that makes matching good and makes the position durable. Acquisti, Taylor and Wagman (2016) survey the economics of that second payment and its central ambiguity: personal data is simultaneously a productive input, which is why the matching improves, and a claim held by someone other than its subject, whose interests in it need not coincide. A comparison of substrates that counts only the take-rate has counted only one of the two prices.
                    </p>
                </PaperSubsection>
                <PaperSubsection title="2.3 Externalization: the court">
                    <p>
                        The third substrate leaves the trade bilateral and puts a public adjudicator behind it. It is the substrate of the standard contract: the parties write terms, perform or fail to perform, and a breach is heard afterwards by an institution neither of them controls. North (1990) treats third-party enforcement of this kind as the decisive institutional achievement of impersonal exchange, and also as the one whose cost is chronically understated, since the enforcing third party must itself be constrained and is not free.
                    </p>
                    <p>
                        Three properties of this substrate structure everything in Section 4. It is <em>ex post and contingent</em>: nothing is spent unless a breach occurs and the injured party elects to pursue it, so its expected cost is the probability of that path multiplied by what walking it costs. Its cost is roughly <em>fixed per dispute</em> rather than proportional to the amount in issue &mdash; pleadings, counsel, and delay do not shrink to fit a small claim &mdash; which is why the substrate is unavailable in practice below a threshold value, however available it is in principle. And it is <em>jurisdictional</em>: it works between parties a single legal order can reach.
                    </p>
                    <p>
                        Each property has a large empirical literature behind it. Macaulay (1963) found that businesses which could sue mostly do not, preferring to settle by relationship and to leave the contract in the drawer, precisely because invoking the substrate is expensive and damaging. Galanter (1974) showed that access to it is asymmetric in a structural rather than incidental way: repeat players who can absorb delay, spread costs, and play for rules systematically do better than one-shot participants, so the substrate&rsquo;s protection is unevenly distributed among those nominally entitled to it. Hadfield (2017) argues that legal infrastructure has not scaled to the complexity and the border-crossing of contemporary economic activity, and that its cost structure &mdash; not its doctrine &mdash; is what leaves so much ordinary economic life outside it. Dixit (2004) takes the corresponding step and studies what people do where state enforcement is weak or absent, which is to say, what the substrate&rsquo;s absence looks like.
                    </p>
                    <PaperRun title="Arbitration does not escape the jurisdictional condition.">
                        Parties can create a private forum by agreement, and cross-border commerce routinely does. But the reach of an arbitral award is not a property of the agreement; it is a property of a treaty. The New York Convention (United Nations, 1958) obliges its contracting states to recognize and enforce foreign arbitral awards, and it is that obligation &mdash; adopted by most of the world&rsquo;s states, but by states &mdash; which makes a private award collectible against an unwilling loser abroad. Private adjudication of this kind is best read as a customization of the third substrate rather than as a fourth: the hearing is privately organized, and the enforcement remains public.
                    </PaperRun>
                </PaperSubsection>
                <PaperSubsection title="2.4 Self-bonding: the bonded commitment">
                    <p>
                        The fourth substrate keeps the enforcement burden with the two parties and moves it in time: instead of an adjudicator afterwards, each party posts capital beforehand which the completion of the trade returns to it. The instrument is old in principle &mdash; Schelling (1960) analyzed the general form, in which a party improves its position by voluntarily destroying some of its own freedom of action, and Williamson (1983) gave the commercial version its name and its institutional treatment, showing that a hostage offered by the party in a position to defect can support an exchange that would otherwise not occur. What is new is the arrangement that makes a hostage work between strangers, at arbitrary distance, and along a chain of several producers rather than in one bilateral trade. We state it compactly; the paper uses only what is stated here.
                    </p>
                    <p>
                        A trade is entered by a <em>commitment</em> that both parties sign, carrying a payment <Math>{"P > 0"}</Math> from the buyer to the seller. Signing locks capital on both sides under one schedule: the buyer locks <Math>{"2P"}</Math>, and the seller locks <Math>{"2G"}</Math>, where <Math>{"G"}</Math> is the value the process has accumulated through that seller&rsquo;s own link, its own payment included. Nothing else is locked and nothing else is charged. The doubling is constitutive rather than a parameter: it is what makes defection self-destructive once the defector is credited with what it walks away holding. A seller that keeps the goods keeps something worth at most <Math>{"G"}</Math> against <Math>{"2G"}</Math> locked, and so stands at best at <Math>{"-G"}</Math>; a buyer that takes delivery and never settles holds value <Math>{"P"}</Math> against <Math>{"2P"}</Math> locked, and so stands at <Math>{"-P"}</Math>, the payment it is withholding being frozen inside its own bond rather than kept by it. Halve the schedule and both comparisons vanish: a bond equal to what the defector retains merely offsets the taking, and the second half is what makes the taking cost.
                    </p>
                    <p>
                        Settlement is the buyer&rsquo;s act and no one else&rsquo;s, and it is <em>atomic</em>: every order in the process settles at once or none does. Two consequences follow that a comparison of substrates needs. Because settling after performance is unconditionally better for the buyer than not settling, and because performance is then each seller&rsquo;s strict best response, cooperation is what self-interest recommends at every position &mdash; without an arbitrator, a timeout, or a governing body. And because payouts arrive together or not at all, each seller acquires a computable stake in every other seller&rsquo;s performance: strangers who have never met, and who need not communicate, hold a live bonded interest in curing one another&rsquo;s faults while the process stands open.
                    </p>
                    <p>
                        Two structural facts complete the picture. There is <em>no exit</em> from the bonded state other than settlement: no timeout, no cancellation, no administrator, no vote. This is not asceticism but a requirement of the analysis &mdash; any further release either hands the decision to a party the bonds do not constrain, or adds a third option at a node whose two the equilibrium was derived by weighing. Remedies are therefore agreed between the parties <em>while the process stands open</em>, and settlement is terminal acceptance. External forums compose into that open window and may rule on the record and on whatever the parties bring them; what they cannot do is settle a process, which is why composing one costs the equilibrium nothing. And the mechanism itself sees a <em>linear</em> sequence: commitments extending one monotonic accumulator under one root buyer and one unit of account. Whatever richer arrangement the parties have in mind among themselves is their own agreement, expressed above the mechanism and invisible to it.
                    </p>
                    <PaperRemark title="What the fourth substrate does not hold.">
                        It holds no representation of the goods, no acceptance test, no report of delivery, and no identity beyond a key. It cannot tell whether performance was good; the buyer&rsquo;s settlement <em>is</em> that judgement, and the substrate is arranged so that a buyer with the goods in hand prefers to make it. Everything the substrate does not hold &mdash; identity, insurance, adjudication, tax treatment, the terms themselves &mdash; is attached above it by composition with institutions that already exist, or it is absent.
                    </PaperRemark>
                </PaperSubsection>
                <PaperSubsection title="2.5 Why private-order reputation regimes are not a fifth column">
                    <p>
                        A reader of comparative institutions will object that the list omits the most studied alternative of all: private order sustained by reputation within a community. Greif (1993) reconstructs the Maghribi traders&rsquo; coalition, in which agents scattered across the Mediterranean were kept honest by a multilateral punishment rule &mdash; cheat one member and no member will employ you again &mdash; supported by an information-sharing network that made cheating known. Milgrom, North and Weingast (1990) analyze the Champagne fairs&rsquo; law merchant as an institution whose private judges did not enforce anything but supplied the information about past conduct that made decentralized punishment work. Ostrom (1990) documents long-lived commons regimes governed by their appropriators, and identifies the design principles they share, including clearly defined membership boundaries, monitoring by or accountable to the appropriators themselves, graduated sanctions, and accessible arenas for resolving conflict. Ellickson (1991) finds the same pattern among ranchers who settle serious disputes by norm and reciprocity while remaining largely ignorant of the law that formally governs them.
                    </p>
                    <p>
                        These are genuine substrates and they are the closest ancestors of the fourth. They are not a separate column here for one reason, and it is the paper&rsquo;s boundary condition rather than a dismissal: every one of them requires closure. Multilateral punishment requires a membership one can be excluded from, an information channel that carries conduct to future counterparties, and an expectation of future dealing that makes exclusion costly. Where those hold, the regimes described are frequently the cheapest arrangement available, and nothing below argues otherwise. Where they do not &mdash; a genuine stranger, met once, outside any community that either party belongs to &mdash; the reputational substrate supplies nothing, because there is no audience for the report and no future to withhold. That is precisely the case this paper is about.
                    </p>
                    <p>
                        The relation between those regimes and the fourth substrate is worth stating exactly, because it is easy to overstate in both directions. What atomic settlement manufactures among co-sellers &mdash; a live, sized interest in a stranger&rsquo;s performance, held by parties who need not know one another &mdash; is structurally the coordination pressure that joint-liability arrangements obtain socially, and it is obtained here without repeat play, local information, or community membership. What it does not obtain is the rest of what those regimes deliver: they also select good counterparties into the group and monitor them continuously, and a bond does neither. The fourth substrate reproduces the pressure and not the screening.
                    </p>
                </PaperSubsection>
            </PaperSection>

            <PaperSection title="3. Ten Axes">
                <p>
                    Williamson (1991) frames comparative institutional analysis as the study of <em>discrete structural alternatives</em>: governance forms differ in kind and not merely in degree, each is matched with its own contract-law regime, and the useful question is which attributes of a transaction align with which form. The ten axes below are chosen on that principle. Each is an attribute on which the four substrates differ structurally, so that a difference of setting or of business model could not convert one into another.
                </p>
                <PaperSubsection title="3.1 Who bears the enforcement cost &mdash; and to whom it is revenue">
                    <p>
                        Under internalization the cost is a standing overhead borne by the ownership nucleus and recovered from residual output; it is paid whether or not any particular transaction occurs, and it is revenue to no one outside the firm but income to the management function inside it. Under intermediation the cost is borne by the platform and recovered as a take-rate plus the transaction record; it is revenue, and its recipient is a single identified party. Under externalization the marginal cost of adjudication is borne by the public and funded from taxation, while the parties bear counsel, filing and delay; it is revenue to the professions that conduct it. Under self-bonding the cost is borne by the two parties jointly, ex ante, and it is revenue to nobody: the capital is returned at settlement, and what has been consumed is its availability for the duration.
                    </p>
                    <p>
                        The <em>shape</em> of the charge differs as much as its destination, and the difference is what Section 4 formalizes. Three of the four charge a standing cost. The firm&rsquo;s administrative apparatus exists before any particular trade and persists after it, so the cost is incurred whether or not the trade happens and is recovered by spreading it. The platform&rsquo;s take-rate is proportional to value, is paid on every trade, and is permanent, and the transaction record it collects is an implicit second price on the same trade. The court&rsquo;s fees and delay are contingent but lumpy, and their expected value is carried by every trade whether or not any particular one is disputed. The fourth substrate charges two terms and no others: the carry on the bonded capital over the process&rsquo;s duration, which is the substantive economic cost and which scales with both value and time; and a small execution cost for entering and settling a commitment, which does not scale with value and can be amortized across many settlements where they are proved together rather than one at a time. We are deliberate about the accounting: the carry is the term that matters and it is a real cost, while the execution term is small relative to it for the transaction sizes this paper treats. Neither term is zero, and nothing on this substrate is free.
                    </p>
                    <p>
                        This is the sharpest structural difference among the four, and it cuts in both directions. A carry with no recipient is still a real cost &mdash; capital immobilized is capital not deployed, and the party who must find it is worse off for the period than a party who need not. What it lacks is a constituency. A take-rate has a beneficiary who prefers it higher, an adjudication system has a profession whose income scales with its complexity, and a management hierarchy has incumbents whose position depends on the transaction not being made simple. A carry has no one at all positioned to raise it, because there is no one to raise it to. The cost of the fourth substrate can rise or fall with interest rates and with the duration of trades, but it cannot be ratcheted, and no institutional actor gains by the trade being harder than it needs to be.
                    </p>
                </PaperSubsection>
                <PaperSubsection title="3.2 Who holds the map">
                    <p>
                        Every substrate leaves behind a record of who traded what with whom, and the four allocate it very differently. The firm&rsquo;s map is internal and proprietary: it is one of the firm&rsquo;s most valuable assets, it is visible to the nucleus and to nobody else, and it dies with the entity. The platform&rsquo;s map is the platform &mdash; the accumulated record of matches, prices, and conduct is what makes its matching good and its position durable, and it is collected from the parties as part of the price of using it (Acquisti, Taylor and Wagman, 2016). The court&rsquo;s map is peculiar: it exists only for the transactions that failed and were litigated, it is public in principle, and it is scattered across dockets in a form that is close to unusable in aggregate. The successful trades leave no trace at all.
                    </p>
                    <p>
                        The fourth substrate inverts the allocation rather than abolishing it. Because commitments and settlements are recorded on a public ledger, the aggregate map &mdash; that these parties transacted, in this unit, at these amounts, and that the process closed &mdash; is public by construction and owned by no one. Because the substrate holds only a fingerprint of the agreement and never its contents, the detail &mdash; what was traded, on what terms, to what specification &mdash; stays with the parties who hold the document behind that fingerprint. What either party then does with its own detail is its own affair. The structural point for the comparison is narrow and it is enough: under the fourth substrate the map is not the intermediary&rsquo;s price for the enforcement, because there is no intermediary and no price.
                    </p>
                </PaperSubsection>
                <PaperSubsection title="3.3 Admission">
                    <p>
                        Internalization admits by hire or by contract, at the discretion of the nucleus, and the admitted party is thereafter inside an authority relation. Intermediation admits by acceptance of terms, usually with identity verification and often with a jurisdictional filter, and the admission is revocable at the intermediary&rsquo;s discretion &mdash; removal is a principal instrument of its enforcement, which means it is also an unappealable power over livelihoods. Externalization admits by legal personality and standing: to be a party to a contract that a court will hear, one must be a person the legal order recognizes, present in a jurisdiction whose process can reach one&rsquo;s counterparty.
                    </p>
                    <p>
                        Self-bonding admits on two conditions and no others: the ability to sign, and a balance sufficient to bond the commitment being signed. There is no gate, no application, and no revocation, because there is no admitting party. The condition is not weaker than the others in every respect &mdash; a balance is a real requirement, and Section 3.7 treats it as the substrate&rsquo;s principal distributional cost &mdash; but it is different in kind. It is a condition on capital rather than on status, and it can be satisfied by an entity that no legal order recognizes: a software agent, or a productive asset holding a key of its own. Section 4.4 draws the consequence, which is the strongest dominance claim in the paper.
                    </p>
                </PaperSubsection>
                <PaperSubsection title="3.4 Where discretion lives">
                    <p>
                        Discretion is not an impurity to be eliminated; it is a resource with a price, and the substrates differ in where it sits and in what constrains it. In the firm, discretion is managerial fiat exercised continuously within Simon&rsquo;s zone of acceptance, and its distinctive legal feature is that it is <em>not</em> reviewable from outside: forbearance doctrine keeps courts out of intra-firm disputes (Williamson, 1991). In the platform, discretion is policy, exercised unilaterally by the operator over admission, funds, and rankings, generally unappealable except to the operator itself, and revisable at will. In the court, discretion is judicial: bounded by procedure, disciplined by precedent, exercised in public, and reviewable on appeal. This is the most thoroughly institutionalized discretion humanity has built, and it is slow and expensive for exactly that reason.
                    </p>
                    <p>
                        In the fourth substrate there is no discretion inside the substrate at all. The two operations are settlement and the commitment that precedes it; nothing decides anything about a bonded position but the buyer&rsquo;s own signature, and no party outside the two can move a locked balance. Discretion re-enters only where the parties put it there, by composing an external forum into the window before settlement. Such a forum rules on the record and on what the parties bring it, and its ruling is an input to the buyer&rsquo;s decision rather than a substitute for it: no forum can settle a process. The trade is exact &mdash; the substrate offers no discretion and therefore no protection from the counterparty&rsquo;s judgement, and parties who want reviewable discretion must compose it in with their eyes open.
                    </p>
                </PaperSubsection>
                <PaperSubsection title="3.5 The marginal cost of a new institution">
                    <p>
                        Demsetz (1967) argued that new institutional arrangements emerge when the gains from creating them come to exceed the cost of creating them, and that the observed structure of rights in any period is largely explained by that comparison. The axis therefore matters in its own right: a substrate on which instituting is cheap will carry arrangements that a substrate on which instituting is dear will never see, whatever their merits.
                    </p>
                    <p>
                        Standing up a firm means incorporation in some jurisdiction, a charter, governance organs, capitalization, and books &mdash; days to months of work and a permanent administrative burden. Hansmann and Kraakman (2000) identify what that expense buys, and it is not the ability to contract, which the parties had already: it is <em>asset partitioning</em> &mdash; the shielding of the entity&rsquo;s assets from the personal creditors of its owners &mdash; which is the one contribution of organizational law that contracting alone cannot cheaply replicate. Standing up a platform is enormously more expensive: it means solving the chicken-and-egg problem on two sides at once and carrying both until the network is worth joining, which is why platforms are few, durable, and hard to displace. Standing up a court is not available to the parties at all; they get the one their jurisdiction supplies, and the private-forum route reaches across borders only by way of the treaty framework of Section 2.3.
                    </p>
                    <p>
                        Under the fourth substrate the marginal cost of a new institution is the cost of a signature and the carry on a bond. Each trade constitutes a small institution with a defined membership, a fixed term, and a rule of dissolution, and settlement dissolves it. This is a difference of kind rather than of degree, and by Demsetz&rsquo;s logic its consequence is not that existing arrangements get cheaper but that arrangements which were never worth constituting begin to be constituted: coalitions of four parties for one afternoon, which no one would incorporate for and no court would be invoked over.
                    </p>
                </PaperSubsection>
                <PaperSubsection title="3.6 Jurisdiction dependence">
                    <p>
                        The firm is chartered somewhere, and both its internal authority and its external liability run through that somewhere. The platform is more mobile but not free: it holds funds, so it is a regulated payments actor in most places it operates, and its terms select a forum. The court is jurisdiction itself &mdash; its whole efficacy is the reach of one legal order over both parties, extended across borders only by treaty. Each of the three therefore fails on the same margin: two parties with no legal order in common have, between them, no substrate of the first three kinds available on ordinary terms.
                    </p>
                    <p>
                        The fourth substrate does not depend on a shared jurisdiction because it does not depend on anyone&rsquo;s coercive reach. What deters the defector is capital the defector itself has already locked and cannot retrieve; that is equally true whether the counterparty is next door or unreachable. We put this carefully, because it is the point at which comparative arguments of this kind become overclaims. The substrate is not outside the law and it displaces no legal obligation: parties remain subject to whatever law applies to them, tax and sanctions and consumer protection continue to attach, and the record the substrate produces is unusually good evidence for any forum that later takes an interest. What it removes is the <em>precondition</em>: the trade is safe to enter before any question of forum has been settled, and the question of forum can be answered afterwards, or not at all.
                    </p>
                </PaperSubsection>
                <PaperSubsection title="3.7 Failure modes">
                    <p>
                        Substrates are best distinguished by how they break, since each breaks in a way that follows from what made it work.
                    </p>
                    <PaperRun title="The firm.">
                        Because performance is directed rather than promised, the failure is in the direction: agency loss, influence activity, and the suppression of information that prices would have carried. Because the nucleus is a standing entity, its failure is discontinuous &mdash; insolvency ends every coordination inside it at once, leaving trade creditors unpaid and the internal map extinguished. And because subordination is the mechanism, its characteristic cost falls on the subordinated party, whose exit is expensive by construction.
                    </PaperRun>
                    <PaperRun title="The platform.">
                        Its failure modes are all versions of the same fact: the party that bears the enforcement cost also sets the rules. Take-rates ratchet, terms change unilaterally, participants are removed without an appeal that is not to the remover, and the accumulated map gives the incumbent a position no entrant can price against. When a platform fails outright, the map goes with it and the trading relationships it mediated do not survive their index.
                    </PaperRun>
                    <PaperRun title="The court.">
                        Delay and cost are the ordinary modes, and their consequence is the practical unavailability of the substrate below a value threshold. The structural mode is Galanter&rsquo;s: repeat players extract systematically better outcomes than one-shot participants from the same rules. Add the judgment-proof defendant, against whom a valid judgment is worth nothing, and non-recognition abroad, against which a valid judgment is worth nothing anywhere the defendant is.
                    </PaperRun>
                    <PaperRun title="The bond.">
                        Its failure modes are equally characteristic, and the first is severe. The substrate demands capital from those who use it, at multiples of the value being traded and for the duration of the trade &mdash; so it favours the capitalized and rations the rest. A party who cannot post the bond does not get a worse deal on this substrate; that party does not transact on it at all, which is a distributional property as consequential as any advantage claimed elsewhere in this paper. Second, the deterrent is bounded by the stake: harms exceeding what was posted, consequential losses, and injuries to non-parties are outside its reach entirely, and no bond delivers a non-monetary remedy. Third, the substrate itself provides no recovery path &mdash; whether a bonded position survives the loss of a key depends entirely on arrangements the key&rsquo;s holder made above the substrate before the loss, which is the direct price of having no administrator. Fourth, settlement is terminal acceptance: a buyer who settles and later discovers a defect has no recourse within the substrate. Fifth, in a chain of several producers the bonded stake sums over both sides and rises faster than the value the chain carries, so depth is priced even though the mechanism does not ration it. Exactly where that pricing turns the comparison against the substrate depends on the make-or-buy margin of the parties involved; what belongs here is that the limit exists and binds.
                    </PaperRun>
                </PaperSubsection>
                <PaperSubsection title="3.8 Fiscal and regulatory legibility">
                    <p>
                        Trade is not only enforced; it is also reported. Every substrate must eventually produce, for a tax authority, an auditor, a customs administration, or a supervisor, some demonstration of what was traded, with whom, for how much, and when. This axis is usually treated as an administrative afterthought and it is nothing of the kind: the cost of producing that demonstration is a real cost of transacting, it is largely fixed with respect to the size of any individual trade, and it therefore bears directly on the amortization argument of Section 4.1 &mdash; a fixed compliance overhead is one of the standing reasons an activity is carried on inside a firm rather than between strangers.
                    </p>
                    <PaperRun title="The firm demonstrates by reconstruction.">
                        A firm keeps books for its own management, in its own chart of accounts, and the demonstration a regime demands is assembled afterwards from those books by people paid to assemble it. Audit is reconstruction: an external party re-derives, from records the firm designed for another purpose, a view the firm did not keep. The cost is a standing overhead that rises with regulatory complexity and is amortized over the firm&rsquo;s transactions, which is why complexity systematically favours the larger entity &mdash; the same demonstration costs a small enterprise a far larger share of its turnover than a large one. The European e-invoicing regime illustrates the shape without exhausting it: Directive 2014/55/EU requires public-sector contracting authorities to receive and process electronic invoices conforming to a common semantic model, standardized as EN 16931-1, and the burden it creates for a supplier is a mapping burden &mdash; from books kept one way onto a model specified another way.
                    </PaperRun>
                    <PaperRun title="The platform holds the records and mediates the demonstration.">
                        Where trade is intermediated, the authoritative record is the intermediary&rsquo;s, and a participant demonstrates compliance by asking for a statement and accepting what the statement contains. This is convenient and it is not neutral: the participant&rsquo;s ability to prove its own history is contingent on continued access, on the intermediary&rsquo;s retention policy, and on its survival. The arrangement has since been formalized in the direction one would expect &mdash; Council Directive (EU) 2021/514 makes digital platform operators reporting agents, obliging them to collect information about their sellers and report it to tax administrations. The regulatory function is thereby fused to the intermediation function, which raises the cost of entry for any competitor and gives the incumbent a second reason to be indispensable that has nothing to do with matching.
                    </PaperRun>
                    <PaperRun title="The court generates records only adversarially.">
                        Litigation produces an evidentiary record of a transaction, but only of the transactions that fail, only after they have failed, and only by compelling each side to disclose what it holds. Disclosure is expensive, contested, and retrospective, and it produces nothing at all for the overwhelming majority of trades, which complete. As a source of fiscal or regulatory legibility the third substrate is therefore close to useless: it is an instrument for resolving a dispute about a record, not an instrument for producing one.
                    </PaperRun>
                    <PaperRun title="The bond emits the record as a byproduct.">
                        Under the fourth substrate the demonstration is not produced at all &mdash; it accumulates. Entering a trade requires both parties to sign a commitment naming the counterparties, the amount, the unit of account, and a fingerprint of the agreement they struck; settling it records that the trade closed and what each party received. Nothing has to be kept, because nothing was constructed for another purpose first: the record of the trade <em>is</em> the act of trading, it is signed by both sides rather than asserted by one, and it is timestamped by a public ledger neither party controls. What that turns a compliance demonstration into is a retrieval. The cost falls from the cost of reconstruction, which scales with the complexity of the regime, to the cost of reading a record that already exists and of attaching whatever jurisdiction-specific attributes the regime requires on top of it.
                    </PaperRun>
                    <p>
                        Three regimes make the difference concrete, and each is named here for the kind of demand it makes rather than for any provision-level treatment. Value-added tax reporting, governed in the European Union by Council Directive 2006/112/EC and moving under an agreed reform programme towards digital reporting built on electronic invoicing, demands per-transaction records of counterparties, amounts, and dates &mdash; the exact set a settlement record already contains. Sustainability reporting under Directive (EU) 2022/2464 obliges in-scope undertakings to report on their value chains under assurance, and the hard part of that obligation has always been that a value chain is a sequence of separate parties whose records do not join up; a settlement record of a multi-party process joins them up by construction, because the parties bonded into one process and settled from one signature. The carbon border adjustment mechanism established by Regulation (EU) 2023/956 requires importers to account for goods along a chain that crosses the customs frontier, which is the same problem again. In each case the demand is for a chain-level record that no single participant possesses, and the substrate produces exactly that as the residue of trading.
                    </p>
                    <PaperRun title="Reporting without over-disclosure.">
                        The data allocation of Section 3.2 has a regulatory consequence that is worth stating separately, because it is the axis on which the fourth substrate&rsquo;s answer is structurally different rather than merely cheaper. The public part of the record is the aggregate skeleton &mdash; that these parties committed, in this unit, at these amounts, and that the process closed. The substantive detail sits behind a fingerprint, in a document the parties hold, and the substrate never sees it. A party can therefore demonstrate to a regime exactly what the regime asks, and disclose the underlying document only where the demand actually reaches it, rather than surrendering an undifferentiated history to an intermediary and relying on that intermediary to disclose narrowly. Regulation (EU) 2016/679 makes minimal disclosure a legal principle rather than a preference &mdash; personal data must be adequate, relevant and limited to what is necessary for the purpose (Article 5(1)(c)) &mdash; and the point here is that the record&rsquo;s structure, not a policy operated over it, is what keeps the detail out of general circulation.
                    </PaperRun>
                    <PaperRun title="Two honest costs on this axis.">
                        A byproduct record is not a compliance solution, and two of its properties cut the other way. First, the record carries no fiscal attributes of its own: registration identifiers, tax categories, rates, and the status that determines which of them apply presuppose a registered party inside a particular regime, and none of that is knowable to a substrate that admits on a key and a balance. Those attach from the parties&rsquo; own terms above the record, and a demonstration is the record plus that attachment, never the record alone. What exactly projects from a settlement record onto a given jurisdiction&rsquo;s invoice or filing model is a mapping each regime&rsquo;s own rules decide, and no general answer is offered here. Second, a public record discloses to everyone, not only to the authority that asked. Counterparty relationships and transaction values are visible to competitors as well as to supervisors, which is a genuine cost of the arrangement and one the other three substrates do not impose. And where an address is linkable to a natural person, the immutability that makes the record good evidence sits uneasily with rights of erasure &mdash; a tension the substrate does not resolve, and which parties address by keeping identifying detail off the record rather than by removing it afterwards.
                    </PaperRun>
                </PaperSubsection>
                <PaperSubsection title="3.9 Monetary neutrality">
                    <p>
                        A substrate that makes promises credible must also settle them in something, and the four differ in who chooses what that something is. The firm keeps its books in a functional currency and pays over banking rails, so its ability to trade with a counterparty is bounded by the rails that will carry the payment &mdash; correspondent relationships, sanctions screening, and the willingness of an intermediary bank to serve a corridor at all. The platform operates a rail of its own: it holds funds, publishes the list of units it will accept, decides who may receive a payout and where, and can revise all three. The court enforces in the money of its forum; a judgment is denominated in a legal tender, which is one of the ways the third substrate is jurisdictional even when the parties&rsquo; own bargain was not.
                    </p>
                    <p>
                        Underneath that difference is a fact about money that the axis exists to expose: a shared unit is not a conduit for coordination but an instance of it, and one of the oldest. Menger (1892) accounts for money as an emergent convention &mdash; no one decrees the medium; each participant accepts the object it expects others to accept, and the convergence of those expectations on one object <em>is</em> the institution. Kiyotaki and Wright (1989) give the modern statement of the same structure: in a search economy the acceptability of an object as a medium of exchange is an equilibrium property sustained by beliefs about what others will accept, and more than one such equilibrium can exist, so which object becomes money is not fully determined by the object&rsquo;s own properties. Jevons (1875) supplies the functional distinction that keeps the argument tidy &mdash; the unit in which a bargain is reckoned need not be the instrument in which a state discharges debts. Put together: choosing a unit is choosing a coordination device, and a group that already shares one has already solved a coordination problem.
                    </p>
                    <p>
                        The comparative point follows directly. The first three substrates <em>prescribe</em> the device. The firm imposes its functional currency on everything it internalizes; the platform imposes its rail and the list of units it will carry; the court imposes the legal tender of its forum. In each case the coordination that a shared unit performs has been settled before the parties arrive, by someone who is not either of them. The fourth substrate prescribes nothing: the parties name the unit in the commitment they sign, and the mechanism&rsquo;s only requirement is internal &mdash; bonds and payment must be quoted in the same unit within one process, because the schedule of Section 2.4 sets a bond against a value and the comparison is only a comparison if the two are commensurable. Which unit that is, the substrate neither knows nor prefers. Choosing it is therefore part of the coordination the parties themselves perform, on the same footing as choosing the terms.
                    </p>
                    <p>
                        The consequence for a group with a unit of its own is not merely that it may keep using it. It is that the group&rsquo;s unit goes on coordinating its members when a trade crosses the group&rsquo;s boundary. A dispersed community whose members reckon in their own unit can trade with one another, and with outsiders willing to accept it, without the exchange being converted into and cleared through a monetary system that admits both ends &mdash; the unavailability of which is usually a gate rather than a shortage of willing counterparties. The device the group built for coordinating among themselves continues to do that work outside, because nothing in the substrate replaces it with a device of its own choosing. The honest cost is the mirror of the benefit: the substrate supplies no stability, no conversion, and no view on whether the chosen unit will hold its value between commitment and settlement. A unit few will accept buys little, and the whole of the risk of choosing badly is the parties&rsquo;. Selecting the coordination device is a substantive decision, and this substrate, unlike the other three, declines to make it on the parties&rsquo; behalf.
                    </p>
                </PaperSubsection>
                <PaperSubsection title="3.10 Transparency, verifiability, and privacy at once">
                    <p>
                        The last axis is a conjunction rather than a single property, and it is stated as one because the interesting fact is that the three members are usually in tension. <em>Transparency</em> is how much of the arrangement a party can see, before entering it and afterwards. <em>Verifiability</em> is whether a claim about how the arrangement operated can be checked by someone who does not trust whoever operates it. <em>Privacy</em> is whether the substance of a trade stays with the parties to it. Each incumbent substrate resolves the tension by giving up one of the three, and the sacrifice is structural rather than a matter of practice.
                    </p>
                    <PaperRun title="The firm keeps privacy by giving up the other two.">
                        Almost nothing about a firm&rsquo;s internal coordination is visible outside its boundary, and that opacity is not incidental &mdash; part of what a boundary is for is to keep the arrangement inside it unpublished. An outsider who needs assurance does not get verifiability; the outsider gets an auditor, which relocates the trust rather than removing it. Meanwhile the party inside has no privacy from the nucleus, whose authority to direct includes the authority to observe.
                    </PaperRun>
                    <PaperRun title="The platform is transparent to itself and opaque to everyone else.">
                        The operator sees every trade, every price, and every complaint; the participant sees what the interface displays. That asymmetry is not a deficiency of the model but the model: the accumulated view is the asset (Section 3.2). Verifiability is absent in the strong sense &mdash; a participant cannot check that the rule which decided its case is the rule that decided anyone else&rsquo;s, and the only appeal from the operator is to the operator. Privacy from third parties is real and is often the reason participants prefer it; privacy from the operator does not exist.
                    </PaperRun>
                    <PaperRun title="The court buys publicity and review at privacy&rsquo;s expense.">
                        Open proceedings and reasoned, appealable judgments are the most developed form of institutional verifiability humanity has, and they are purchased with compelled disclosure: the price of invoking the third substrate is that what one holds becomes discoverable and what one argued becomes public. And the transparency it produces covers only the transactions that failed, which is why Section 3.8 finds it near-useless as a source of ordinary legibility.
                    </PaperRun>
                    <p>
                        The fourth substrate delivers all three at once, and it does so for a structural reason worth naming precisely: it separates the object. What is public is the <em>skeleton</em> of the trade &mdash; who committed, in what unit, for how much, and whether the process closed &mdash; which is exactly what transparency and verifiability need. What stays sealed is the <em>content</em> &mdash; the agreement itself, the specification, the terms &mdash; which is exactly what privacy needs. A fingerprint of the content is committed with the skeleton, so neither can drift from the other: a party can prove afterwards that the document it produces is the document that was bonded, without ever having published it, and disclosure remains its own to make on its own terms. The verifiability is of two kinds and both are available without trusting anyone: any observer can recompute a settlement&rsquo;s distribution from the public record, and the mechanism&rsquo;s own guarantees &mdash; that cooperation is what self-interest recommends, that settlement exhausts exactly what was locked, that no party outside the two can move a bonded balance &mdash; are established by proof and by machine-checked verification of the settlement rules rather than by assurance from an interested party.
                    </p>
                    <p>
                        Two qualifications keep this from being a boast. Those machine checks are the authoring project&rsquo;s own and no external audit of them has been performed, so what a reader is offered is a claim that can be checked rather than a claim that has been checked by an independent party. And the conjunction has the cost Section 3.8 already recorded: a skeleton that is public to a supervisor is public to a competitor too. The institutional point is not that the fourth substrate is private, or transparent, or checkable &mdash; each of the other three is at least one of those. It is that these three normally trade against one another, and that here they do not, because the substrate holds a fingerprint where the others hold the file.
                    </p>
                </PaperSubsection>
                <PaperSubsection title="3.11 The comparison in one view">
                    <div className="my-4 overflow-x-auto">
                        <table className="text-sm border-collapse">
                            <thead>
                                <tr>
                                    {["Axis", "Firm", "Platform", "Court", "Bond"].map((h) => (
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
                                    <td className="border border-default px-3 py-1.5">the two parties, before the trade</td>
                                </tr>
                                <tr>
                                    <td className="border border-default px-3 py-1.5">Cost is revenue to</td>
                                    <td className="border border-default px-3 py-1.5">the management function</td>
                                    <td className="border border-default px-3 py-1.5">the intermediary (fee and record)</td>
                                    <td className="border border-default px-3 py-1.5">the professions; funded by taxation</td>
                                    <td className="border border-default px-3 py-1.5">nobody &mdash; a carry, returned at settlement</td>
                                </tr>
                                <tr>
                                    <td className="border border-default px-3 py-1.5">Holds the map</td>
                                    <td className="border border-default px-3 py-1.5">the nucleus; dies with the entity</td>
                                    <td className="border border-default px-3 py-1.5">the intermediary; it is the asset</td>
                                    <td className="border border-default px-3 py-1.5">dockets &mdash; failures only, unusable in aggregate</td>
                                    <td className="border border-default px-3 py-1.5">aggregate public, detail with the parties</td>
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
                                    <td className="border border-default px-3 py-1.5">none inside; composed forums rule but cannot settle</td>
                                </tr>
                                <tr>
                                    <td className="border border-default px-3 py-1.5">Cost of instituting</td>
                                    <td className="border border-default px-3 py-1.5">incorporation; buys asset partitioning</td>
                                    <td className="border border-default px-3 py-1.5">two-sided launch; very high</td>
                                    <td className="border border-default px-3 py-1.5">not available to the parties</td>
                                    <td className="border border-default px-3 py-1.5">a signature and a bond, per trade</td>
                                </tr>
                                <tr>
                                    <td className="border border-default px-3 py-1.5">Jurisdiction</td>
                                    <td className="border border-default px-3 py-1.5">chartered somewhere</td>
                                    <td className="border border-default px-3 py-1.5">regulated where it holds funds</td>
                                    <td className="border border-default px-3 py-1.5">constitutive; extended only by treaty</td>
                                    <td className="border border-default px-3 py-1.5">not a precondition of the trade</td>
                                </tr>
                                <tr>
                                    <td className="border border-default px-3 py-1.5">Charge shape</td>
                                    <td className="border border-default px-3 py-1.5">standing overhead, spread over trades</td>
                                    <td className="border border-default px-3 py-1.5">take-rate on value, plus the record</td>
                                    <td className="border border-default px-3 py-1.5">contingent and lumpy, per dispute</td>
                                    <td className="border border-default px-3 py-1.5">carry over the duration, plus a small execution cost</td>
                                </tr>
                                <tr>
                                    <td className="border border-default px-3 py-1.5">Transparency / verifiability / privacy</td>
                                    <td className="border border-default px-3 py-1.5">privacy only; opaque and unverifiable outside</td>
                                    <td className="border border-default px-3 py-1.5">transparent to the operator alone; unverifiable</td>
                                    <td className="border border-default px-3 py-1.5">public and reviewable, at privacy&rsquo;s expense</td>
                                    <td className="border border-default px-3 py-1.5">all three &mdash; public skeleton, sealed content, bound by a fingerprint</td>
                                </tr>
                                <tr>
                                    <td className="border border-default px-3 py-1.5">Unit of account</td>
                                    <td className="border border-default px-3 py-1.5">functional currency; bank rails</td>
                                    <td className="border border-default px-3 py-1.5">the operator&rsquo;s rail and accepted list</td>
                                    <td className="border border-default px-3 py-1.5">the forum&rsquo;s legal tender</td>
                                    <td className="border border-default px-3 py-1.5">named by the parties; one unit per process</td>
                                </tr>
                                <tr>
                                    <td className="border border-default px-3 py-1.5">Regulatory record</td>
                                    <td className="border border-default px-3 py-1.5">reconstructed from internal books; audited</td>
                                    <td className="border border-default px-3 py-1.5">held by the intermediary; it reports for you</td>
                                    <td className="border border-default px-3 py-1.5">adversarial only &mdash; disputes, by disclosure</td>
                                    <td className="border border-default px-3 py-1.5">byproduct of trading; signed by both sides</td>
                                </tr>
                                <tr>
                                    <td className="border border-default px-3 py-1.5">Compliance cost</td>
                                    <td className="border border-default px-3 py-1.5">standing overhead; favours the larger entity</td>
                                    <td className="border border-default px-3 py-1.5">bundled into the fee; access-contingent</td>
                                    <td className="border border-default px-3 py-1.5">borne per dispute; produces nothing otherwise</td>
                                    <td className="border border-default px-3 py-1.5">retrieval, plus regime attributes attached above</td>
                                </tr>
                                <tr>
                                    <td className="border border-default px-3 py-1.5">Fails by</td>
                                    <td className="border border-default px-3 py-1.5">agency loss; insolvency; costly exit</td>
                                    <td className="border border-default px-3 py-1.5">rule-setter is the cost-bearer; removal</td>
                                    <td className="border border-default px-3 py-1.5">delay, cost floor, repeat-player advantage</td>
                                    <td className="border border-default px-3 py-1.5">capital rationing; stake-bounded remedy; no recovery</td>
                                </tr>
                            </tbody>
                        </table>
                    </div>
                </PaperSubsection>
            </PaperSection>

            <PaperSection title="4. Discriminating Alignment">
                <p>
                    Williamson&rsquo;s discriminating-alignment hypothesis holds that transactions, which differ in their attributes, are aligned with governance structures, which differ in their costs and competences, in a mainly transaction-cost-economizing way (Williamson, 1985; 1991). The exercise below applies that hypothesis with the fourth substrate added to the menu. Its purpose is to identify regions, not to compute an optimum: the cost objects are written at the level of shape, and what the section extracts from them is where the shapes cross.
                </p>
                <PaperSubsection title="4.1 Cost objects">
                    <p>
                        Let a transaction be characterized by its value <Math>{"P"}</Math>, its duration <Math>{"T"}</Math> from commitment to completion, its asset specificity <Math>{"k"}</Math>, the frequency <Math>{"m"}</Math> with which the same pair or the same activity recurs, an indicator <Math>{"j \\in \\{0,1\\}"}</Math> of whether the parties share a legal order that reaches them both, and an indicator <Math>{"\\ell \\in \\{0,1\\}"}</Math> of whether both parties are persons that legal order recognizes. Write <Math>{"r"}</Math> for the prevailing cost of capital. For each substrate <Math>{"\\sigma"}</Math> let <Math>{"C_\\sigma"}</Math> be the enforcement cost attributable to one transaction.
                    </p>
                    <FormalBlock label="The four shapes.">
                        <p>
                            <em>Firm.</em> <Math>{"C_H = F_H/m + a(k)"}</Math>: a standing overhead <Math>{"F_H"}</Math> amortized over the transactions it covers, plus the agency and influence loss of directing rather than pricing. Decreasing in frequency; available only where the activity can be brought inside, which requires <Math>{"\\ell = 1"}</Math>.
                        </p>
                        <p>
                            <em>Platform.</em> <Math>{"C_M = \\tau P + \\delta + \\rho"}</Math>: a take-rate <Math>{"\\tau"}</Math> on the value, plus the value <Math>{"\\delta"}</Math> of the transaction record surrendered, plus <Math>{"\\rho"}</Math>, the expected cost of revocable admission. Proportional to value, independent of duration, and permanent &mdash; nothing is returned.
                        </p>
                        <p>
                            <em>Court.</em> <Math>{"C_C = q\\,(L + D)"}</Math> when <Math>{"j = 1"}</Math> and <Math>{"\\ell = 1"}</Math>, and unavailable otherwise: the probability <Math>{"q"}</Math> that a breach occurs and is pursued, multiplied by litigation cost <Math>{"L"}</Math> and the cost of delay <Math>{"D"}</Math>. Contingent, ex post, and with <Math>{"L"}</Math> approximately fixed with respect to <Math>{"P"}</Math> &mdash; the substrate&rsquo;s decisive property.
                        </p>
                        <p>
                            <em>Bond.</em> <Math>{"C_B = 4P\\,rT + g"}</Math> for a bilateral trade at the root of a process, where the two bonds are <Math>{"2P"}</Math> each: the carry on the whole locked stake over the duration, plus a small execution cost <Math>{"g"}</Math>. Proportional to value <em>and</em> to duration, and returned in full at settlement &mdash; the carry is consumed, the principal is not. Independent of <Math>{"j"}</Math> and of <Math>{"\\ell"}</Math>.
                        </p>
                    </FormalBlock>
                    <PaperRemark title="On what these expressions are.">
                        They are shapes, not measurements. Each omits terms that matter in a particular application &mdash; the firm&rsquo;s organizational knowledge, the platform&rsquo;s matching value, the court&rsquo;s deterrent effect on breaches that never occur, the bond&rsquo;s execution fees and the operational cost of holding keys. The comparisons below turn only on how each expression varies with <Math>{"P"}</Math>, <Math>{"T"}</Math>, <Math>{"m"}</Math>, <Math>{"j"}</Math>, and <Math>{"\\ell"}</Math>, which is the level at which the omitted terms are least likely to reverse them.
                    </PaperRemark>
                </PaperSubsection>
                <PaperSubsection title="4.2 The crossings">
                    <PaperRun title="Bond against court: the value threshold.">
                        The bond is preferred when <Math>{"4P\\,rT + g < q\\,(L + D)"}</Math>. Because <Math>{"L"}</Math> does not shrink with the amount in issue while the carry is proportional to it, the inequality holds decisively at small <Math>{"P"}</Math> and reverses at large <Math>{"P"}</Math>. This is a sharp and slightly uncomfortable result: the fourth substrate is at its strongest exactly where the third has always been unavailable in practice &mdash; the small transaction, where the cost of a claim exceeds the claim. Note also that the two are not substitutes at the moment of choice, since the court&rsquo;s cost is contingent and the bond&rsquo;s is certain. A party choosing the bond buys certainty about the enforcement cost; a party relying on the court buys an option, and pays only in the states where it is exercised.
                    </PaperRun>
                    <PaperRun title="Bond against platform: the duration threshold.">
                        Both costs are proportional to value, so <Math>{"P"}</Math> cancels: the bond is preferred when <Math>{"4rT < \\tau + (\\delta + \\rho)/P"}</Math>, and, ignoring the record and the revocation risk, simply when <Math>{"T < \\tau/(4r)"}</Math>. The magnitudes are worth writing out, with the caveat that they are illustrative rather than measured. At a cost of capital of five percent a year, a marketplace take-rate of twenty percent corresponds to a threshold of a full year: the bond is cheaper for any transaction that completes inside one. Against a low-margin payment rail charging two percent, the threshold falls to about five weeks. The comparison is therefore not close in the marketplace case and is genuinely close in the payments case &mdash; and in both, the surrendered record <Math>{"\\delta"}</Math> sits on the platform&rsquo;s side of the ledger and is not counted in either figure.
                    </PaperRun>
                    <PaperRun title="Bond against firm: frequency and specificity.">
                        The firm&rsquo;s cost falls with frequency and the bond&rsquo;s does not, so recurrence favours internalization; and the bond secures only the value that the parties have put on the record for this trade, whereas asset specificity concerns an investment sunk <em>before</em> the trade whose value depends on a particular counterparty. A bond cannot reach a hold-up over a sunk specific investment, because the exposure is not inside any single transaction. Both of Williamson&rsquo;s classic drivers therefore continue to point where they always pointed, and the fourth substrate does not disturb them.
                    </PaperRun>
                    <PaperRun title="The one crossing that is not about cost.">
                        Where <Math>{"j = 0"}</Math> &mdash; no legal order reaches both parties &mdash; the court&rsquo;s cost is not high but undefined, since the substrate supplies no credibility at any price. Where <Math>{"\\ell = 0"}</Math> &mdash; a participant that no legal order recognizes as a person &mdash; the firm and the court are both unavailable in principle, and the platform is available only through a recognized person who accepts its terms on the participant&rsquo;s behalf. The bond is indifferent to both indicators. This is not a cheaper column; it is the only column.
                    </PaperRun>
                </PaperSubsection>
                <PaperSubsection title="4.3 The alignment result">
                    <FormalBlock label="Proposition 4.1 (Substrate alignment).">
                        <p>
                            Under the cost shapes of Section 4.1, the transaction-cost-economizing substrate is:
                        </p>
                        <ol className="space-y-2 list-decimal pl-6 text-sm">
                            <li><strong>the bond</strong>, where the counterparties are strangers to one another and to any common community, asset specificity is low, the duration is short relative to <Math>{"\\tau/(4r)"}</Math>, the value is below the threshold at which litigation becomes economic, and either <Math>{"j = 0"}</Math> or <Math>{"\\ell = 0"}</Math> &mdash; the last two conditions being sufficient on their own, since they remove the alternatives rather than out-pricing them;</li>
                            <li><strong>the firm</strong>, where asset specificity is high, frequency is high enough to amortize the standing overhead, or the transaction requires what no per-transaction arrangement supplies &mdash; capital aggregated across projects, risk pooled across uncorrelated ventures, organizational knowledge held over time, and the asset partitioning that Hansmann and Kraakman (2000) identify as organizational law&rsquo;s irreducible contribution;</li>
                            <li><strong>the platform</strong>, where the binding problem is not enforcement but the cross-side externality &mdash; a market thin enough that a counterparty must be attracted before one can be selected &mdash; and where a residual claimant able to shift the charge between the sides is what brings the thin side on board;</li>
                            <li><strong>the court</strong>, where the amount in issue is large enough to carry the fixed cost of a claim, where the remedy required exceeds any stake a party would post, where relief must be non-monetary, or where the interests at stake include those of parties who are not in the trade at all.</li>
                        </ol>
                        <p>
                            The regions overlap, and the alignment is over regions of transaction space rather than over industries or sectors. Nothing in the proposition says that any substrate supersedes another; each column names conditions under which it is the economizing choice, and every real economy contains all four sets of conditions simultaneously.
                        </p>
                    </FormalBlock>
                    <p>
                        Two corollaries are worth stating because they are what the comparison is for. The first is that the four substrates <em>compose</em>. A firm may bond its external trades while directing its internal ones; a bonded process may compose an arbitral forum into its open window and thereby borrow the third substrate&rsquo;s reviewable discretion without borrowing its cost floor; a platform may operate as a discovery and matching service over trades it does not stand behind, which is the two-sided function separated from the enforcement function. Discrete structural alternatives are alternatives per transaction, not per participant.
                    </p>
                    <p>
                        The second is that the boundaries move with parameters that are not institutional at all. The bond&rsquo;s advantage over the platform is a function of <Math>{"r"}</Math>: a sustained rise in the cost of capital shrinks the region where a carry beats a fee, and a fall widens it. Its advantage over the court is a function of <Math>{"L"}</Math>: anything that lowers the fixed cost of a small claim &mdash; and Hadfield (2017) is an argument that a good deal could &mdash; moves the value threshold down and takes territory back. A comparative institutional result of this kind is a statement about a configuration of prices, and it should be re-derived when they change.
                    </p>
                </PaperSubsection>
                <PaperSubsection title="4.4 The strongest region: participants no legal order recognizes">
                    <p>
                        The condition <Math>{"\\ell = 0"}</Math> deserves separate treatment, because it is where the comparison stops being about cost. A substrate that admits on legal personality cannot admit a participant that has none. A software agent transacting on its own behalf, or a productive asset that holds a key and receives what it earns, cannot be hired into a hierarchy in its own name, cannot accept terms of service as a person the operator can pursue, and cannot sue or be sued. Under the first three substrates such a participant transacts only through a recognized person who stands for it &mdash; which is to say it does not transact; the person does.
                    </p>
                    <p>
                        The fourth substrate has no view on what stands behind a key. It requires a signature and a balance, and it checks the balance rather than the biography. Its admission condition is therefore satisfiable by participants that the other three exclude in principle rather than by policy, and the exclusion is not a gap that better rules would close: it follows from what a firm, a platform, and a court each are. Whether an economy should have such participants is a normative question this paper does not reach. That only one of the four substrates can carry them is a structural fact, and it is the clearest instance in this comparison of a region where the alignment is not a preference but the absence of an alternative.
                    </p>
                </PaperSubsection>
            </PaperSection>

            <PaperSection title="5. Substrate Neutrality">
                <p>
                    A comparison of substrates invites a category error that is worth naming precisely, because the whole argument fails if it is committed. A substrate does not encode an economic ideology, and no result above is a claim about one. What the fourth substrate enforces is that a party who takes value and returns nothing is worse off for having done so. It has no view on who should be trading, what a fair price is, whether surplus should accrue to capital or to labour, whether an activity should be undertaken for profit at all, or how the participants should be organized among themselves.
                </p>
                <p>
                    The consequence is that mutually hostile arrangements run on it unchanged. A market-liberal arrangement in which each participant sells at whatever price is agreed; a cooperative in which the producers hold the surplus in common and distribute it by their own rule; an Islamic-finance arrangement in which the permitted structures exclude interest and require the sharing of risk; a mutual-aid network in which the trades net to nothing and the point is the coordination &mdash; all four are expressible as arrangements of parties, terms, and payments above the same substrate, and the substrate distinguishes none of them. It cannot: it holds only bonds, an accumulator, and the fingerprints of agreements it never reads.
                </p>
                <p>
                    This cuts against the argument as often as for it, and both directions belong in a comparative treatment. A substrate that takes no positions also protects no one. It does not favour the weaker party, does not cap a price, does not enforce a labour standard, does not distinguish an essential good from a luxury, and does not know whether the party posting a bond can afford it &mdash; and the capital condition of Section 3.7 means that some parties who ought to be able to trade will not be able to. Everything protective must therefore be built above the substrate, in the terms the parties compose and in the forums they attach, and none of it is supplied by the substrate&rsquo;s existence. Neutrality is a property, not a virtue, and its principal merit in this comparison is a narrow one: it is what makes the comparison a comparison between substrates at all, rather than a contest between a substrate and someone&rsquo;s politics.
                </p>
                <p>
                    The other three substrates are not neutral in this sense, and the difference is structural rather than a matter of good or bad conduct. The firm takes a position by construction &mdash; it organizes activity under an authority relation and allocates the residual to an ownership nucleus, which is a determinate answer to a distributional question and not a technical necessity. The platform takes a position each time it sets its price structure, since choosing which side to subsidize and which to charge is choosing who bears the cost of the market existing (Rochet and Tirole, 2003). The court takes the position its legal order takes, which is why the same contract yields different outcomes in different jurisdictions and why forum selection is itself a negotiated term. The fourth substrate&rsquo;s abstention is what leaves those choices to be made explicitly, by the parties, in the terms they compose &mdash; and being explicit is not the same as being absent.
                </p>
            </PaperSection>

            <PaperSection title="6. Conclusion">
                <p>
                    Trade between strangers has been made safe in three ways, and each locates the enforcement burden with someone other than the two parties: a hierarchy that replaces the promise with an instruction, an intermediary that stands behind the promise and is paid in fee and record, or a public adjudicator that will hear a complaint about the promise afterwards, within a jurisdiction that reaches both. The fourth way returns the burden to the parties and moves it forward in time. Each posts capital that the completion of the trade returns, in an amount that makes taking the value and giving nothing back the worse outcome for whoever holds the value; and settlement, which only the buyer can perform and which closes every part of the trade at once, gives the parties who are waiting on one another a live interest in one another&rsquo;s performance.
                </p>
                <p>
                    Compared axis by axis, the fourth substrate is not a better version of the other three. It is a different arrangement of the same problem, with a cost that is a carry rather than a transfer and so has no recipient and no constituency; with a map whose aggregate is public and whose detail stays with the parties; with an admission condition on capital rather than on status; with no discretion inside it at all; with an instituting cost of a signature; with no dependence on a shared jurisdiction; with a record that regimes can read as the residue of trading rather than as the product of reconstruction, proprietary custody, or discovery; with the unit of account left to the parties, so that the oldest coordination device of all is one they select rather than one prescribed to them; with transparency, verifiability, and privacy held together rather than traded against one another; and with failure modes of its own, of which the demand for capital is the most serious and the stake-bounded remedy the most limiting.
                </p>
                <p>
                    The alignment result is correspondingly bounded. Where counterparties are strangers, asset specificity is low, durations are short, values are below what litigation can economically pursue, and no legal order reaches both parties &mdash; or one of them is not a person any legal order recognizes &mdash; the bonded substrate is the economizing choice, and in the last case the only one. Where investments are specific, activity is frequent, capital must be aggregated or assets partitioned, thin markets must be brought into existence, remedies must exceed a posted stake or take a non-monetary form, or the interests of non-parties are engaged, the firm, the platform, and the court keep what they have always had. A fourth column has been added to the menu of discrete structural alternatives. The other three columns remain, and the useful question about any transaction is which of the four its attributes align with.
                </p>
            </PaperSection>
        </PaperLayout>
    );
}
