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
    title: "Bookkeeping as Protocol Byproduct — Figaro Protocol",
    description:
        "A bonded process is a self-closing ledger period: the process is an accounting entity with identically zero equity, commitments are its journal entries, the buyer's single atomic resolution is its closing entry, and every account it opened is zeroed by that act. A specific class of record-keeping work becomes protocol byproduct; interpretive accounting and the audit of records against reality continue.",
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

export default function SelfClosingLedgerPeriodsPaper() {
    return (
        <PaperLayout slug="self-closing-ledger-periods"
            title="Bookkeeping as Protocol Byproduct"
            subtitle="Self-Closing Ledger Periods in a Bonded Settlement Primitive"
            author="Figaro"
            date="April 2026"
            watermark="Figaro Protocol · Preprint"
            keywords="bookkeeping, accounting, auditing, double-entry, triple-entry, escrow accounting, audit assertions, Pacioli, e-invoicing, EN 16931"
            abstract={
                <>
                    <p>
                        Modern accounting rests on a specific historical innovation: double-entry bookkeeping, codified in Pacioli (1494) and elaborated over five centuries into the apparatus of the modern firm. Pacioli&rsquo;s innovation solved a specific problem &mdash; how to track the position of an opaque economic entity over time, in a form that could be reconciled, audited, taxed, and adjudicated. The solution made the modern firm possible (Sombart, 1916; Chandler, 1977) and generated the professions that sit on top of it: bookkeeping, accounting, auditing, tax preparation, and the commercial law that treats books as the authoritative record of the firm&rsquo;s economic acts.
                    </p>
                    <p>
                        This paper reads a bonded settlement mechanism &mdash; one that forms each order by taking twice the payment from the buyer and twice the value accumulated at the seller&rsquo;s link, and closes the whole process on the buyer&rsquo;s single atomic call &mdash; in the accounting register. The reading yields one result. The <em>process</em> is an accounting entity in the ordinary sense: it comes into existence at the first commitment, holds positions, and dissolves when it closes. Its assets equal the claims against it at every moment, so its equity is identically zero; it opens no revenue or expense account, because the payment moves between two claims rather than through any result of its own; and the closing entry, which the buyer alone may write and which settles every order at once, zeroes every account the period opened. That is what we mean by a <em>self-closing ledger period</em>, and we give the entries and show the zeroing account by account. The journal, the closing entries, and the positions between them are held on chain; the documents they bind are held by their content hashes and pinned off chain, never reconstructed from the chain.
                    </p>
                    <p>
                        The record so produced is complete for the process and for nothing else. It records what was undertaken, what was posted against it, and how it settled; it does not record performance, which happens where the mechanism cannot look. The parties&rsquo; own entity-level accounts, which aggregate closed periods and everything they do outside any process, are a different object with a different boundary, and are out of this paper&rsquo;s scope throughout. Within that boundary, professional work divides into three classes rather than two: work the protocol performs as byproduct (journal-keeping, posting, trial balance, period-end close); work that continues unchanged in substance (interpretive judgment, translation, and the audit that tests records against reality); and practices that become structurally inapplicable rather than merely cheaper, because they presuppose an opaque entity whose books are its own assertion. We argue the shift is structurally analogous to the 1494 innovation that created the apparatus in the first place: a change at the records layer that makes a specific class of prior work unnecessary and leaves another class untouched.
                    </p>
                </>
            }
            references={
                <>
                    <li>American Institute of Certified Public Accountants. <em>AU-C Section 315: Understanding the Entity and Its Environment and Assessing the Risks of Material Misstatement</em>. In <em>AICPA Professional Standards</em>, n.d.</li>
                    <li>American Institute of Certified Public Accountants. <em>AU-C Section 500: Audit Evidence</em>. In <em>AICPA Professional Standards</em>, n.d.</li>
                    <li>Braudel, F. <em>Civilization and Capitalism, 15th&ndash;18th Century, Volume 2: The Wheels of Commerce</em>. Harper &amp; Row, New York, 1982. Trans. S. Reynolds.</li>
                    <li>Buterin, V. Ethereum: A Next-Generation Smart Contract and Decentralized Application Platform. White paper, 2014.</li>
                    <li>Chandler, A. D. <em>The Visible Hand: The Managerial Revolution in American Business</em>. Belknap Press of Harvard University Press, Cambridge, MA, 1977.</li>
                    <li>Council of the European Union. <em>VAT in the Digital Age (ViDA) package: measures amending Directive 2006/112/EC on the common system of value added tax</em>. Adopted 11 March 2025.</li>
                    <li>Dai, J. &amp; Vasarhelyi, M. A. Toward Blockchain-Based Accounting and Assurance. <em>Journal of Information Systems</em>, 31(3):5&ndash;21, 2017.</li>
                    <li>de Roover, R. <em>The Rise and Decline of the Medici Bank, 1397&ndash;1494</em>. Harvard University Press, Cambridge, MA, 1963.</li>
                    <li>European Committee for Standardization (CEN). <em>EN 16931-1:2017 &mdash; Electronic Invoicing, Part 1: Semantic Data Model of the Core Elements of an Electronic Invoice</em>. CEN, Brussels, 2017.</li>
                    <li>European Parliament and Council of the European Union. <em>Directive 2014/55/EU of 16 April 2014 on electronic invoicing in public procurement</em>. Official Journal of the European Union, 2014.</li>
                    <li>Financial Accounting Standards Board. <em>Accounting Standards Codification Topic 606: Revenue from Contracts with Customers</em>. FASB, Norwalk, CT, 2014.</li>
                    <li>Grigg, I. Triple Entry Accounting. Working paper, Systemics Inc., 2005.</li>
                    <li>Hirshleifer, J. From Weakest-Link to Best-Shot: The Voluntary Provision of Public Goods. <em>Public Choice</em>, 41(3):371&ndash;386, 1983.</li>
                    <li>Ijiri, Y. A Framework for Triple-Entry Bookkeeping. <em>The Accounting Review</em>, 61(4):745&ndash;759, 1986.</li>
                    <li>Ijiri, Y. <em>Momentum Accounting and Triple-Entry Bookkeeping: Exploring the Dynamic Structure of Accounting Measurements</em>. American Accounting Association, Sarasota, FL, 1989.</li>
                    <li>International Accounting Standards Board. <em>IFRS 15: Revenue from Contracts with Customers</em>. IFRS Foundation, London, 2014.</li>
                    <li>International Accounting Standards Board. <em>IFRS 13: Fair Value Measurement</em>. IFRS Foundation, London, 2011.</li>
                    <li>Kindleberger, C. P. <em>A Financial History of Western Europe</em>. Oxford University Press, New York, 2nd ed., 1993.</li>
                    <li>Mattessich, R. <em>Accounting and Analytical Methods: Measurement and Projection of Income and Wealth in the Micro- and Macro-Economy</em>. Richard D. Irwin, Homewood, IL, 1964.</li>
                    <li>Nakamoto, S. Bitcoin: A Peer-to-Peer Electronic Cash System. White paper, 2008.</li>
                    <li>Pacioli, L. <em>Summa de Arithmetica, Geometria, Proportioni et Proportionalita</em>. Paganinus de Paganinis, Venice, 1494. Particularis de computis et scripturis (book on accounts and records), treatise XI.</li>
                    <li>Power, M. <em>The Audit Society: Rituals of Verification</em>. Oxford University Press, Oxford, 1997.</li>
                    <li>Sombart, W. <em>Der moderne Kapitalismus</em>, volume 2. Duncker &amp; Humblot, Munich, 1916.</li>
                    <li>Yamey, B. S. Scientific Book-keeping and the Rise of Capitalism. <em>The Economic History Review</em>, 1(2&ndash;3):99&ndash;113, 1949.</li>
                    <li>Yermack, D. Corporate Governance and Blockchains. <em>Review of Finance</em>, 21(1):7&ndash;31, 2017.</li>
                </>
            }
        >
            <PaperSection title="1. Introduction">
                <p>
                    Every modern firm maintains books of account. The books record what the firm owns (assets), what it owes (liabilities), what has flowed in and out (revenues and expenses), and how these quantities have changed over a defined period. The books make the firm legible to itself, to its investors, to its regulators, and to its counterparties. They do not constitute the firm&rsquo;s legal personality &mdash; which flows from incorporation &mdash; but they are the artefact through which that personality is exercised in practice: regulators read books, contracts reference books, disputes are adjudicated against books.
                </p>
                <p>
                    The books are not an incidental feature. They are the infrastructure on which much of modern commercial law rests. Tax law assumes books and operates against them. Securities law requires disclosure of books. Insolvency proceedings run against books. Due diligence in mergers and acquisitions is substantially an examination of books. Auditing is the profession that verifies books, and the auditor&rsquo;s report is a legal artefact with specific consequences. The apparatus is substantial, costly, and well-adapted to the problem it solves.
                </p>
                <p>
                    What problem does it solve? Pacioli (1494) identified the underlying difficulty: an economic entity with continuous operations needs a way to answer the question <em>what is its position?</em> at any moment. Cash positions alone are insufficient because obligations outstanding are not captured; asset lists alone are insufficient because liabilities and equity are not distinguished; transaction logs alone are insufficient because the cumulative position is not summarised. Pacioli&rsquo;s double-entry bookkeeping solved this by recording every transaction as a balanced pair of debits and credits, allowing the cumulative position to be derived at any time as a trial balance and reconciled if no errors had been made. Every subsequent layer of the apparatus &mdash; accounting, auditing, commercial law, tax law &mdash; was built on the assumption that Pacioli&rsquo;s books exist and are more or less reliable.
                </p>
                <p>
                    Two features of that assumption do the work, and both are features of the <em>entity</em> rather than of the method. The entity is opaque: only it knows what it did, so its books are in the first instance its own assertion about itself. And the entity is continuous: it has no natural moment of closure, so a period boundary must be imposed on it by convention, and everything difficult in accounting &mdash; cut-off, accrual, provision, subsequent events, restatement &mdash; lives at that imposed boundary.
                </p>
                <p>
                    This paper asks what happens when a settlement mechanism produces, as the byproduct of its ordinary operation, a set of accounts belonging to neither party but to the transaction itself &mdash; accounts that are funded rather than asserted, and that have a natural moment of closure rather than an imposed one. The answer we develop divides professional work into three classes. A first class becomes protocol byproduct: journal-keeping, posting, trial balance, reconciliation of the record against itself, period-end close. A second class continues, undiminished and in substance unchanged: interpretive judgment under an accounting framework, translation of technical positions for non-technical readers, and the audit that tests whether records correspond to what happened in the world. A third class becomes structurally inapplicable rather than merely cheaper &mdash; the practices, in audit and in commercial litigation, whose entire subject matter is whether an entity&rsquo;s own books say what its own records say. That class has no application where there is only one record and no party keeps it.
                </p>
                <PaperRun title="What this paper is not.">
                    We do not argue that all economic activity migrates to bonded processes. We do not argue that accounting as a discipline ends. We do not advocate for any specific regulatory response. And we take no position on the parties&rsquo; own entity-level accounts, which lie outside the boundary drawn in Section 4 and stay outside it throughout. We claim only that a particular historical apparatus, designed for a particular problem, has a narrower scope of applicability once that problem can be solved at the settlement layer.
                </PaperRun>
                <PaperRun title="Paper organization.">
                    Section 2 describes the Pacioli stack &mdash; double-entry, the three books, the apparatus on top, and its place within the longer banking arc. Section 3 treats the prior literature on triple-entry bookkeeping and blockchain accounting, and states exactly where this argument departs from it. Section 4 develops the central claim: a bonded process is a self-closing ledger period, with the entries given and the accounts shown to zero. Section 5 states what stops being necessary and what stops applying. Section 6 states what continues. Section 7 treats the participant the accounts belong to &mdash; the real-world asset behind a wallet &mdash; and the books it keeps for itself. Section 8 places the resulting record in the hierarchy by which audit evidence is weighed. Section 9 states the argument&rsquo;s scope. Section 10 concludes.
                </PaperRun>
            </PaperSection>

            <PaperSection title="2. The Pacioli Stack">
                <p>
                    Pacioli (1494) published <em>Summa de arithmetica, geometria, proportioni et proportionalita</em> in Venice in 1494. The treatise was a general mathematics reference, but its thirty-six-chapter section <em>De computis et scripturis</em> contained the first printed exposition of double-entry bookkeeping as practised by Venetian merchants. The system was not invented by Pacioli &mdash; it had been in use in Italian commercial cities for at least a century &mdash; but his codification became the reference text and carried the method into every subsequent tradition of commercial accounting.
                </p>
                <p>
                    The method is simple. Every transaction is recorded twice, once as a debit to one account and once as a credit to another. The sum of all debits always equals the sum of all credits. At any moment the trial balance &mdash; the list of all account balances &mdash; reconciles if no errors have been made. The books are therefore self-checking: an error produces an imbalance that can be located and corrected. The cumulative position of the entity is derivable at any time by summarising account balances into a balance sheet (assets, liabilities, equity) and an income statement (revenues, expenses, net income).
                </p>
                <p>
                    Pacioli&rsquo;s exposition organises the method into three books that together constitute the merchant&rsquo;s record. The <em>memoriale</em> (memorandum) is the rough chronological record, kept at the point of transaction and informal in style. The <em>giornale</em> (journal) is the formal chronological record, where each transaction is re-entered as a balanced pair of debits and credits in a fixed format. The <em>quaderno</em> (ledger) is the categorial record, where journal entries are posted to individual accounts and the running balance of each account is maintained. The trial balance is taken from the <em>quaderno</em>, and the period&rsquo;s statements are derived from it through closing entries that move the period&rsquo;s results into permanent accounts. The three books are not redundant; each serves a distinct evidentiary and analytical function, and the sequence <em>memoriale</em> <Math>{"\\to"}</Math> <em>giornale</em> <Math>{"\\to"}</Math> <em>quaderno</em> is the path by which a transaction enters the merchant&rsquo;s cumulative position. Section 4.3 takes the triad back up and identifies what plays each of the three roles in a bonded process.
                </p>
                <PaperRun title="Why the innovation was decisive.">
                    Sombart (1916) argued &mdash; in a claim that has been debated but not decisively refuted &mdash; that double-entry bookkeeping was a necessary condition for the rise of modern capitalism. The argument is that without a reliable method for tracking cumulative position, an economic entity cannot grow beyond the scale at which its position is visible to a single person from direct observation. A cook running a kitchen can track inventories and obligations in their head; a merchant house running dozens of ships cannot. Double-entry made scale possible by making position legible under distributed operations. Subsequent historians (Chandler, 1977, on the managerial firm; Yamey, 1949, on the empirical record) have refined the argument but not the structural point.
                </PaperRun>
                <PaperRun title="The apparatus on top.">
                    Over five centuries a substantial professional apparatus has grown on top of the books. Bookkeepers maintain journals and post to ledgers. Accountants produce periodic financial statements, make closing entries, compute taxes, and advise on the treatment of ambiguous transactions. External auditors verify that the statements fairly represent the entity&rsquo;s position. Regulators require filings based on the books. Tax authorities compute liabilities against the books. Commercial lawyers litigate disputes whose subject matter is what the books say or should have said. Power (1997) describes the resulting <em>audit society</em> &mdash; a social formation in which verification by credentialed third parties is the default response to questions of organisational reliability.
                </PaperRun>
                <p>
                    The apparatus is real, well-established, and substantially functional. It is also costly. Compliance costs for public companies in mature jurisdictions are non-trivial relative to revenue; small firms spend a meaningful fraction of their overhead on tax filings and financial-statement preparation; audit budgets are substantial; forensic-accounting specialists are expensive. The apparatus is justified, under the existing model, because it answers a question that cannot be answered otherwise &mdash; is the entity&rsquo;s position as its managers say it is? &mdash; and because the alternative, believing the entity&rsquo;s own claim, has been tried historically and has repeatedly failed.
                </p>
                <PaperRun title="Banking as coordinating infrastructure since the Renaissance.">
                    Pacioli&rsquo;s innovation did not arise in isolation: it codified a practice that was itself one layer of the coordination infrastructure Italian merchant cities assembled to solve the problem of trust at distance. The Medici bank&rsquo;s bills of exchange and correspondent branches let a merchant in Florence pay one in Bruges by trusting the bank rather than each other (de Roover, 1963); double-entry made the multi-branch bank&rsquo;s own position legible, and the bank in turn made its merchant clients&rsquo; positions settleable. The institutional successors &mdash; the Amsterdam Wisselbank, the Bank of England, central banking, the correspondent and clearing arrangements of the twentieth century (Braudel, 1982; Kindleberger, 1993) &mdash; generalised the arrangement to global scale without changing its basic structure: trust in a counterparty underwritten by trust in an intermediary that keeps authoritative books about the position between them. Against that arc, the mechanism of Section 4 registers as a structural inflection rather than an incremental innovation. Pacioli made the books legible; the trusted intermediary made them enforceable across distance by keeping them; a mechanism in which each party&rsquo;s own posted capital makes its undertaking credible, and in which the accounts belong to the transaction rather than to any keeper, refactors the enforcement-at-distance problem that Pacioli&rsquo;s apparatus was one layer of. This is not a claim that the mechanism displaces banking infrastructure. We note the arc so that Section 4 is not misread as a narrow technical proposal about bookkeeping, when its consequence is a rearrangement of a five-hundred-year-old institutional stack.
                </PaperRun>
            </PaperSection>

            <PaperSection title="3. Triple-Entry and Its Limits">
                <p>
                    The idea that Pacioli&rsquo;s double-entry might be extended to solve additional problems has a small but identifiable literature. Ijiri (1986) proposes a framework for triple-entry bookkeeping: each transaction generates not two entries but three, the third recording a dimension conventional double-entry misses. Ijiri (1989) elaborates the framework into <em>momentum accounting</em> and identifies that missing dimension: a balance sheet captures wealth and a flow statement captures income, which is the rate at which wealth changes, but neither captures the rate at which income itself changes &mdash; so the third entry tracks the <em>forces</em> that alter an account&rsquo;s <em>momentum</em>, a second derivative of position.
                </p>
                <p>
                    We name Ijiri as inspiration and not as an ancestor we extend, and the difference is worth being exact about, because a third dimension is easy to claim and hard to supply. The cumulative-value accumulator of Section 4 is a stock in Ijiri&rsquo;s vocabulary: it records cumulative payment, not the rate at which anything changes, and nothing in this paper measures a derivative of anything. What a bonded process adds to the double-entry pair is not a third entry of the same kind but a <em>funded claim</em>: every obligation the process records is funded, in full, at the moment it is recorded, and the funding is the bond the obligated party has already posted. Conventional books are full of unfunded obligations &mdash; receivables, accruals, provisions, allowances for doubtful accounts &mdash; because an entry there is in part an assertion about what a counterparty will do later. The process ledger of Section 4 carries none of these and has no account into which one could be posted. That is the departure from Ijiri, and it is a narrower and more checkable claim than a new dimension of measurement.
                </p>
                <p>
                    A more deeply formal antecedent is Mattessich (1964), who develops accounting as an axiomatic system: the double-entry identity is an algebraic invariant over a set of basic propositions about value flows, analogous to the conservation laws of physics. The process identity of Section 4.1 is, in Mattessich&rsquo;s sense, the same algebraic invariant restated for a transaction-scoped entity: what the mechanism holds for a process equals the claims of that process&rsquo;s parties against it at every moment of the process&rsquo;s life, with the equality discharged at settlement rather than carried forward.
                </p>
                <p>
                    Grigg (2005) revived the idea in a blockchain-adjacent register. Grigg&rsquo;s triple entry proposes that two parties to a transaction each keep a record in the conventional way, and a third record &mdash; a cryptographically signed receipt both parties reference &mdash; serves as the attesting third. In practice that third record played the role now played by chain transaction records: a tamper-evident, timestamped, verifiable artefact neither party can modify after the fact. Grigg&rsquo;s contribution was to formalise what the Ricardian-contract practice had been doing: a cryptographic receipt can carry the weight of a signed document while also functioning as an accounting record.
                </p>
                <p>
                    A larger recent literature has explored the broader claim that distributed ledgers change the accounting problem. Dai &amp; Vasarhelyi (2017) propose that chain-recorded transactions can form the basis for continuous audit, replacing periodic audit cycles. Yermack (2017) surveys corporate-governance applications, including the implications for the audit function.
                </p>
                <PaperRun title="Where the prior literature stops.">
                    The recurring limit of the prior work is that it treats the chain as a <em>third, attesting</em> record alongside the two parties&rsquo; own records. The parties still keep books; the chain reinforces them. This is a real improvement over party-held records alone &mdash; reconciliation becomes faster, attestation becomes cryptographic, the third record cannot be unilaterally altered &mdash; but the structure of the apparatus is unchanged: the parties keep books, the chain attests, and the audit function verifies that the books match the chain and each other.
                </PaperRun>
                <p>
                    The departure here is in what the record <em>is</em>, not in how strongly it is attested. What a bonded process produces is not a third attestation standing beside two sets of books; it is the complete set of accounts of a third entity &mdash; the process itself, which begins at the first commitment and dissolves when it closes. For that entity nothing a party could keep in parallel would add anything, because its accounts are exhausted by positions the mechanism holds and claims a fixed schedule determines: there is nothing about it that a party knows and the record does not. This is a claim about the process and about nothing else. Each party remains whatever it was before &mdash; an enterprise, a public authority, a single productive asset &mdash; with its own accounts, its own reporting period, and its own activity outside any process. Those accounts are a different object with a different boundary; this paper marks the boundary and does not cross it.
                </p>
            </PaperSection>

            <PaperSection title="4. A Bonded Process as a Self-Closing Ledger Period">
                <p>
                    We now develop the central claim. It depends on properties of the settlement mechanism, and those properties are stated here rather than referred elsewhere, since an accounting argument that cannot say what it is accounting for is not an argument.
                </p>
                <PaperRun title="The mechanism, in the terms this paper needs.">
                    The mechanism has exactly two state-changing calls. <em>Commit</em> forms one bilateral order between the buyer and one seller. Both parties sign a commitment naming the payment <Math>{"P_i > 0"}</Math> for that order, the single unit of account the whole process uses, the cumulative value <Math>{"G_i"}</Math> the process has accumulated through that link with its own payment included, and a content hash of the agreement the parties struck. On that dual signature the mechanism pulls two bonds: <Math>{"2P_i"}</Math> from the buyer and <Math>{"2G_i"}</Math> from the seller. The accumulator is monotonic and admits exactly one declared value per commitment &mdash; the payment itself for the commitment that opens a process, and the standing accumulator plus the new payment for every commitment that extends it &mdash; so <Math>{"G_i = \\sum_{j \\leq i} P_j"}</Math> is determined by arithmetic rather than reported. A process has one buyer throughout, and the mechanism sees the orders as a linear sequence of commits extending that accumulator. <em>Resolve</em> settles the process: only the buyer may call it, and it settles every active order at once or none at all. Resolution pays the seller of order <Math>{"i"}</Math> the amount <Math>{"2G_i + P_i"}</Math> and returns <Math>{"P_i"}</Math> to the buyer, and the two exhaust what was posted, since <Math>{"(2G_i + P_i) + P_i = 2G_i + 2P_i"}</Math>. There is no third call: no timeout, no cancellation, no administrative override, and no path by which a bonded position leaves the mechanism except through the buyer&rsquo;s resolution.
                </PaperRun>
                <PaperRun title="The boundary.">
                    The goods, the work, every passage of value from one party to the next, and the parties&rsquo; own knowledge of all of it are outside the mechanism. They happen between the parties, off the record, and the mechanism can neither observe them nor undo them. What it holds is the bonds, the accumulator, and the record of what was committed to. The consequence for everything below is exact and must be carried through the whole argument: the record shows commitments, positions, and settlement or its absence &mdash; never performance. A defecting party keeps whatever is in its hands, and the record cannot see that either. The bonding schedule exists precisely because of this: crediting a defector with everything it retains, the doubled bond still leaves it out of pocket on either side &mdash; a seller that holds out by at least the value accumulated at its link, a buyer that keeps a delivery and never closes by exactly the payment &mdash; so the value moving outside the record moves honestly. That is a mechanism-design result, and its accounting consequence is the one this paper turns on &mdash; the accounts below are complete as the accounts of the process, and are not, and cannot be, a record of performance.
                </PaperRun>
                <PaperRun title="Why the period closes, and why it closes itself.">
                    Both calls carry load in the argument, and they carry different halves of it. The bonding schedule at commit is what makes every claim the process records a funded one: the amounts posted at commit are exactly the amounts payable at resolution, party by party, so the process never carries an obligation for which capital is not already held. It is also where the equilibrium sits, and the equilibrium is what makes the closing an event to be expected rather than hoped for: after performance, resolving is unconditionally strictly better for the buyer than never resolving &mdash; a comparison that needs no assumption whatever about the seller, since the buyer holds what it received either way and resolving returns its bond less the payment while withholding leaves the bond locked &mdash; and once that is settled, performance is each seller&rsquo;s strict best response, since performing into a buyer who will resolve earns the payment and returns the bond, while holding out leaves the seller with what it retains against twice that value posted. Buyer dominance with atomic resolution then supplies the period-close itself: the closing entry has exactly one author, it is written at exactly one moment, and it settles every order in the process together. A settlement rule that closed orders one at a time would produce partial closes, which are not period-closes in the accounting sense, and the claim below would not survive. Resolution is also terminal: a settled process cannot be reopened, and the mechanism holds nothing further for anyone to recover from it.
                </PaperRun>
                <p>
                    We claim that this structure is a ledger period in the accounting sense, and that it closes itself. We proceed in five steps: the entity and its identity, the entries, the three books, reconstruction and period-end, and the remedies that occur inside an open period.
                </p>
                <PaperSubsection title="4.1 The process is the accounting entity">
                    <p>
                        The first move is to be exact about whose books these are, because the natural answer is wrong and the wrong answer has consequences. They are not the buyer&rsquo;s books, nor any seller&rsquo;s. Nor are they a custodian&rsquo;s: there is no custodian. No party holds the balances, no party decides their release, no party may be instructed to release them, and the mechanism has no interest, no discretion, and no judgment of its own to exercise &mdash; the single act that moves a bonded balance is the buyer&rsquo;s resolution, and it moves every balance in the process by a fixed schedule. The accounts are custodial in <em>form</em> and not in substance.
                    </p>
                    <p>
                        The entity to which they belong is the <em>process</em>. It comes into existence when the first commitment is signed and bonded, it holds positions for as long as it stands open, and it dissolves when the buyer resolves. It has parties but no owner; a period but no going concern; a balance sheet but, as we now show, no equity.
                    </p>
                    <FormalBlock label="Definition 4.1 (The process ledger).">
                        <p>For a process <Math>{"\\Pi"}</Math> let <Math>{"\\mathcal{A}(\\Pi, t)"}</Math> be the set of orders committed to <Math>{"\\Pi"}</Math> at time <Math>{"t"}</Math> and not yet resolved. The ledger of <Math>{"\\Pi"}</Math> has one asset account and, for each order <Math>{"i \\in \\mathcal{A}(\\Pi, t)"}</Math>, the claims the schedule fixes:</p>
                        <ul className="space-y-1 list-disc pl-6 text-sm">
                            <li><em>Balance held for <Math>{"\\Pi"}</Math></em> (asset) &mdash; the bonds the mechanism holds on the process&rsquo;s account.</li>
                            <li><em>Claim of the buyer <Math>{"B"}</Math></em> (liability) &mdash; opened at <Math>{"C_{b,i} = 2P_i"}</Math>, the buyer&rsquo;s bond on order <Math>{"i"}</Math>.</li>
                            <li><em>Claim of the seller <Math>{"S_i"}</Math></em> (liability) &mdash; opened at <Math>{"C_{s,i} = 2G_i"}</Math>, that seller&rsquo;s bond.</li>
                            <li><em>Payment payable to <Math>{"S_i"}</Math></em> (liability) &mdash; nil until resolution, when the payment vests (&sect;4.2).</li>
                        </ul>
                        <p>Write <Math>{"A(\\Pi,t)"}</Math> for the balance held, <Math>{"L(\\Pi,t)"}</Math> for the sum of the claims, and, as usual, <Math>{"E(\\Pi,t) = A(\\Pi,t) - L(\\Pi,t)"}</Math> for the residual. There are no other accounts: no revenue account, no expense account, no account for anything the parties exchange outside the record, and &mdash; as Proposition 4.2 shows is why &mdash; no equity account, since the residual it would carry is zero at every moment.</p>
                    </FormalBlock>
                    <FormalBlock label="Proposition 4.2 (Zero-equity process entity).">
                        <p>At every moment from the first commitment to the resolution of <Math>{"\\Pi"}</Math>,</p>
                        <div className="my-3 overflow-x-auto">
                            <Math display>{"A(\\Pi, t) \\;=\\; L(\\Pi, t) \\;=\\; \\sum_{i \\in \\mathcal{A}(\\Pi, t)} \\bigl(2P_i + 2G_i\\bigr),"}</Math>
                        </div>
                        <p>so <Math>{"E(\\Pi, t) = 0"}</Math> identically; and after resolution every account of <Math>{"\\Pi"}</Math> stands at zero.</p>
                    </FormalBlock>
                    <Proof>
                        By induction on the calls, of which there are only two kinds. Before the first commitment both sides are empty and the identity holds trivially. A commit of order <Math>{"i"}</Math> increases the balance held by <Math>{"2P_i + 2G_i"}</Math>, being what the mechanism pulls from the two parties, and opens claims of <Math>{"2P_i"}</Math> and <Math>{"2G_i"}</Math>, so both sides rise by the same amount and the identity is preserved. No other operation changes either side while the process stands open: the accumulator is monotonic and touched only by commit, and no path exists by which any part of a bonded position leaves the process without resolution. At resolution the mechanism pays <Math>{"2G_i + P_i"}</Math> to each seller and <Math>{"P_i"}</Math> to the buyer, so the balance held falls by <Math>{"\\sum_i (2G_i + 2P_i)"}</Math> to zero, and the closing entries of &sect;4.2 retire claims of exactly that total. <Math>{"E(\\Pi,t)"}</Math>, being the difference of two equal quantities throughout, is identically zero. <Math>{"\\square"}</Math>
                    </Proof>
                    <PaperRemark title="What the zero means, and what it does not.">
                        The zero is not a statement that nothing of economic consequence occurred. It is a statement about <em>whose</em> consequence it was. The payment is real, and at resolution it passes from the buyer to the seller; but it passes between two claims against the same entity, so it never touches a result account of that entity, which is why the process has no income statement to prepare and no net position to carry forward. The corresponding gain and cost land in the parties&rsquo; own accounts, outside this boundary and outside this paper. A conventional entity is an accumulator of residuals, and its period-end procedure exists to sweep those residuals into permanent accounts; a process accumulates none, so there is nothing to sweep.
                    </PaperRemark>
                    <PaperRemark title="The identity in escrow-accounting form.">
                        Proposition 4.2 is the shape that lawyers&rsquo; trust accounts, IOLTA arrangements, and client-money custody rules impose by regulation: funds held for others are segregated, the aggregate held equals the aggregate owed, and the holder&rsquo;s own position in the account is nil. Here the same shape is not imposed by a rule that a holder might breach, since there is no holder with an account of its own to breach it into, and no operation that could take the two sides out of step. Mattessich (1964) would recognise the identity as the double-entry invariant restated over a smaller and shorter-lived domain; what is new is not the invariant but the domain &mdash; an entity whose life is one transaction chain and whose books have a natural last page.
                    </PaperRemark>
                </PaperSubsection>

                <PaperSubsection title="4.2 Commitments as journal entries; resolution as closing entries">
                    <p>Each commitment produces one balanced journal entry on the process&rsquo;s books:</p>
                    <ul className="space-y-1 list-disc pl-6 text-sm">
                        <li>Debit: <em>Balance held for <Math>{"\\Pi"}</Math></em> &nbsp; <Math>{"2P_i + 2G_i"}</Math></li>
                        <li>Credit: <em>Claim of <Math>{"B"}</Math></em> &nbsp; <Math>{"2P_i"}</Math></li>
                        <li>Credit: <em>Claim of <Math>{"S_i"}</Math></em> &nbsp; <Math>{"2G_i"}</Math></li>
                    </ul>
                    <p>
                        Debits equal credits by construction, since what is debited is exactly what the two parties bonded. The entry is dated by the settlement layer, carries a signature from each party, and binds the content hash of the agreement the two of them struck. Nothing in it is an estimate, an accrual, or a provision: the whole of each claim is funded by capital already posted, which is the departure from Ijiri noted in Section 3.
                    </p>
                    <p>
                        Resolution is a single atomic act that the buyer alone may perform, and it makes two transfers per order. In bookkeeping terms that act decomposes into two entries, and the decomposition is what makes the accounts zero. The first is the <em>reclassification</em>, in which the payment vests: it ceases to be returnable to the buyer and becomes payable to the seller.
                    </p>
                    <ul className="space-y-1 list-disc pl-6 text-sm">
                        <li>Debit: <em>Claim of <Math>{"B"}</Math></em> &nbsp; <Math>{"P_i"}</Math></li>
                        <li>Credit: <em>Payment payable to <Math>{"S_i"}</Math></em> &nbsp; <Math>{"P_i"}</Math></li>
                    </ul>
                    <p>The second is the <em>disbursement</em>, which retires every remaining claim against the balance held:</p>
                    <ul className="space-y-1 list-disc pl-6 text-sm">
                        <li>Debit: <em>Claim of <Math>{"S_i"}</Math></em> &nbsp; <Math>{"2G_i"}</Math></li>
                        <li>Debit: <em>Payment payable to <Math>{"S_i"}</Math></em> &nbsp; <Math>{"P_i"}</Math></li>
                        <li>Debit: <em>Claim of <Math>{"B"}</Math></em> &nbsp; <Math>{"P_i"}</Math></li>
                        <li>Credit: <em>Balance held for <Math>{"\\Pi"}</Math></em> &nbsp; <Math>{"2G_i + 2P_i"}</Math></li>
                    </ul>
                    <p>
                        Debits equal credits in each entry, and the two together move exactly what the mechanism transfers: <Math>{"2G_i + P_i"}</Math> to the seller and <Math>{"P_i"}</Math> to the buyer. Taking the three entries account by account leaves nothing outstanding:
                    </p>
                    <div className="my-4 overflow-x-auto">
                        <table className="text-sm border-collapse">
                            <thead>
                                <tr>
                                    {["Account", "At commit", "Reclassification", "Disbursement", "Balance"].map((h) => (
                                        <th key={h} className="border border-default px-3 py-1.5 text-left font-semibold text-ink-heading">{h}</th>
                                    ))}
                                </tr>
                            </thead>
                            <tbody>
                                <tr>
                                    <td className="border border-default px-3 py-1.5">Balance held for <Math>{"\\Pi"}</Math></td>
                                    <td className="border border-default px-3 py-1.5">Dr <Math>{"2P_i + 2G_i"}</Math></td>
                                    <td className="border border-default px-3 py-1.5">&mdash;</td>
                                    <td className="border border-default px-3 py-1.5">Cr <Math>{"2G_i + 2P_i"}</Math></td>
                                    <td className="border border-default px-3 py-1.5">0</td>
                                </tr>
                                <tr>
                                    <td className="border border-default px-3 py-1.5">Claim of <Math>{"B"}</Math></td>
                                    <td className="border border-default px-3 py-1.5">Cr <Math>{"2P_i"}</Math></td>
                                    <td className="border border-default px-3 py-1.5">Dr <Math>{"P_i"}</Math></td>
                                    <td className="border border-default px-3 py-1.5">Dr <Math>{"P_i"}</Math></td>
                                    <td className="border border-default px-3 py-1.5">0</td>
                                </tr>
                                <tr>
                                    <td className="border border-default px-3 py-1.5">Claim of <Math>{"S_i"}</Math></td>
                                    <td className="border border-default px-3 py-1.5">Cr <Math>{"2G_i"}</Math></td>
                                    <td className="border border-default px-3 py-1.5">&mdash;</td>
                                    <td className="border border-default px-3 py-1.5">Dr <Math>{"2G_i"}</Math></td>
                                    <td className="border border-default px-3 py-1.5">0</td>
                                </tr>
                                <tr>
                                    <td className="border border-default px-3 py-1.5">Payment payable to <Math>{"S_i"}</Math></td>
                                    <td className="border border-default px-3 py-1.5">&mdash;</td>
                                    <td className="border border-default px-3 py-1.5">Cr <Math>{"P_i"}</Math></td>
                                    <td className="border border-default px-3 py-1.5">Dr <Math>{"P_i"}</Math></td>
                                    <td className="border border-default px-3 py-1.5">0</td>
                                </tr>
                            </tbody>
                        </table>
                        <p className="text-xs text-ink-muted mt-2">The three entries of a complete order, account by account. Every account the period opened is zeroed by the closing act, and the same table repeated over the orders of a process zeroes the process. The reclassification line is the only entry in the whole period that is not a bond going in or coming back out: it is the consideration, and it occupies exactly one line.</p>
                    </div>
                    <p>
                        Two features of the table are worth reading off it, since they are the substance of the &ldquo;self-closing&rdquo; claim. The first is that of the buyer&rsquo;s bond of <Math>{"2P_i"}</Math>, exactly half is the consideration and half is the deterrent: the deterrent comes back and the consideration does not, and the split is made by the reclassification line rather than by anyone&rsquo;s judgment. The seller&rsquo;s bond of <Math>{"2G_i"}</Math> comes back entire, alongside the payment, so its net position over the period is <Math>{"+P_i"}</Math> and the buyer&rsquo;s is <Math>{"-P_i"}</Math>. The second is that no account closes at a loss. Nothing in the period is written off, allowed for, or provided against, because there is no operation that consumes a bond and no discretion that could impair a claim; the bonds are deterrents that stand behind conduct and are returned when the process closes.
                    </p>
                    <p>
                        A process that has not resolved is an open period, and the accounts say so and say nothing more. Both sides of Proposition 4.2 stand at their committed values, no clock runs, nothing accrues to anyone, and no entry falls due. This is the honest reading of an unresolved position: it is a position held, not a loss taken, and the mechanism has no operation that would convert it into one. What the parties make of an indefinitely open position in their own entity-level accounts is entity-level work, governed by the framework those accounts are prepared under, and outside this boundary.
                    </p>
                    <p>
                        The last point bears restating in the form it will keep for the rest of the paper. The entries above are the process&rsquo;s, they are complete, and no party needs to keep a parallel copy of them for the process&rsquo;s record to be whole. They are not the parties&rsquo; entries. When the payment lands in a seller&rsquo;s wallet it may be revenue to the asset behind that wallet under the applicable framework, and the returned bond is a movement of the same asset between two of its own positions; when it leaves the buyer&rsquo;s it may be a cost, an input, or an item of inventory. Those are classifications made in accounts this paper does not open, over a period this paper does not define, under frameworks this paper does not apply.
                    </p>
                </PaperSubsection>

                <PaperSubsection title="4.3 The three books, and what is held where">
                    <p>
                        Section 2 left the Pacioli triad open, and the process supplies an occupant for each of the three roles &mdash; not by analogy but by function, each book identified by the job Pacioli gives it.
                    </p>
                    <ul className="space-y-2 list-disc pl-6 text-sm">
                        <li>The <em>memoriale</em> &mdash; the rough record made at the point of transaction, in whatever form the transacting parties use &mdash; is the agreement itself: the terms the two parties struck, in their own language and at whatever level of detail they chose. It is not held on the chain. What the chain holds is its content hash, carried by the commitment and signed by both parties, which fixes which document is at issue without disclosing it and without the chain ever holding it. The document is pinned where the parties pin it and produced by whoever holds it; it is never reconstructed from the record, and the record makes no claim to contain it.</li>
                        <li>The <em>giornale</em> &mdash; the formal chronological record, each transaction a balanced pair &mdash; is the sequence of commitment and resolution events in the order the settlement layer records them. Each is the balanced entry of &sect;4.2, dated, authenticated by the signatures the mechanism verified before acting on them, and immutable in the ordinary sense that no later act rewrites an earlier one.</li>
                        <li>The <em>quaderno</em> &mdash; the categorial record, with a running balance per account &mdash; is the set of accounts of Definition 4.1, whose balances at any moment are a function of the events up to that moment. The <em>quaderno</em> is not stored anywhere as a separate artefact; it is derived. Any reader can post the events to the accounts and obtain the balances, and any two readers doing so obtain the same balances, which is the property a merchant&rsquo;s ledger was kept in order to have.</li>
                    </ul>
                    <p>
                        The trial balance is then Proposition 4.2 evaluated at a moment, and the closing entries are the resolution. What Pacioli separated into three physical books separates here by <em>where the thing is held</em> rather than by which volume it is written in: the agreement off the record and bound by its hash, the entries on the record, the accounts derived from the entries. The evidentiary division of labour survives the change of medium intact.
                    </p>
                    <PaperRun title="The supporting file.">
                        Beyond the three books, a merchant&rsquo;s record carried correspondence, receipts, and the working papers a later reader would need to see what a line meant. The bonded process has the same layer, and it is worth naming precisely because its evidentiary standing differs from the entries&rsquo;. Parties may emit typed attestations during the life of a process &mdash; a handoff, a condition on arrival, a quality disclosure, a stage reached &mdash; each bound by inclusion to the agreement the commitment already hashed, and each carrying a content reference rather than content. These are the analogue of working papers and supporting receipts. They are produced by interested parties at their discretion, which is exactly what a receipt is, and Section 8 separates them from the entries on that ground. Together with the entries and the agreements they reference, they constitute the complete file of the process, from opening to close.
                    </PaperRun>
                </PaperSubsection>

                <PaperSubsection title="4.4 Reconstruction and the period-end property">
                    <p>
                        The complete state of a process is recoverable by deterministic replay of its events. Any reader of the settlement layer can post the commitments and the resolution to the accounts of Definition 4.1 and obtain the ledger of any process at any moment of its life, without the cooperation of any party and without asking anyone for anything. This is a universal trial-balance generator over the class of processes, and it is what removes the reconciliation step from the record&rsquo;s own audit: there is no second copy of the accounts against which the first could disagree.
                    </p>
                    <p>
                        The limit of the replay is the boundary of &sect;4. What replays is the ledger. The agreements the entries bind are recovered by hash from wherever they are pinned, and are not in the record; performance is in neither. A reader who replays a resolved process learns what was undertaken, what was posted, what settled, and when &mdash; and learns nothing at all about whether the meal was cooked or the parcel handed over.
                    </p>
                    <PaperRun title="The period-end property.">
                        When a process resolves, its ledger period closes, in the full sense the word carries in accounting practice. Every balance returns to zero; every claim is discharged; every payment has reached its recipient; no further entry can be made against the accounts, because the mechanism holds nothing further and admits no operation that would touch a settled order. The records persist and remain readable &mdash; the file does not disappear when the period closes &mdash; but the period does not reopen. Conventional practice reaches this state by procedure and convention: adjusting entries are posted, accounts are reconciled, a cut-off date is chosen, a subsequent-events window is observed, and prior periods are occasionally restated when the choice turns out to have been wrong. None of those instruments exists here, and none is needed: the closing date is not chosen by an accountant but produced by the buyer&rsquo;s act, and it is the moment at which that party declares itself satisfied.
                    </PaperRun>
                </PaperSubsection>

                <PaperSubsection title="4.5 Remedies inside the open period">
                    <p>
                        Because the closing act is the buyer&rsquo;s acceptance, everything that would conventionally be handled after a period closes is handled here before it does, and this is a structural feature rather than a matter of practice. The mechanism holds no test of performance and admits no report of one; resolution <em>is</em> the buyer&rsquo;s judgment that what it contracted for arrived. Where performance is late, partial, or wrong, the parties are not choosing between settlement and non-settlement &mdash; they are negotiating a remedy while the process stands open, and the buyer resolves once it is satisfied.
                    </p>
                    <p>
                        The canonical remedy has a simple arithmetic and it is worth writing out, because it is the one an accountant will meet. A seller that cannot perform sends the buyer the payment it stands to receive, and makes good whatever of the buyer&rsquo;s its failure left in its hands. At resolution that seller takes back its bond and receives its payment, having already paid that payment away: over the period it nets its bond and nothing more, its failure earning it exactly nothing. The buyer, made whole before it closed the period, ends where the agreement said it would end if the exchange did not happen. The mechanism performs none of this and adjudicates none of it; it supplies the reason to reach it, which is that both parties hold positions neither can release except by the closing act.
                    </p>
                    <p>
                        Such transfers are ordinary transactions between the parties, made while the process stands open, and this is where their accounting treatment begins. Three classification questions arise and none of them is answered by the record. First, the failing seller&rsquo;s transfer to the buyer is typically variable consideration under ASC&nbsp;606 / IFRS&nbsp;15 (FASB, 2014; IASB, 2014) &mdash; a price concession or variable-consideration adjustment reducing that seller&rsquo;s revenue, recognised at the moment of the transfer rather than at the close. Second, a transfer between co-sellers, where one absorbs part of another&rsquo;s shortfall, may be a related-party transaction, a loan, a contribution to a shared arrangement, or a fee for bearing risk; the substance depends on the agreement the parties signed and the relationships it describes. Third, the buyer&rsquo;s receipt: where it offsets a payment already made it reduces the recorded cost of what was bought, and where it exceeds that payment the excess is something else again. The record establishes that the transfers occurred, between which addresses, in what amount, and when; the substance is classification work performed against the agreement, and it is professional work of exactly the kind Section 6 says continues.
                    </p>
                    <PaperRemark title="Why co-sellers take an interest.">
                        Atomic resolution gives every seller in a process a computable interest in every other&rsquo;s performance: since the process settles as one, a seller that has already performed stands in its whole bond for as long as any order remains unperformed, and the magnitude of that exposure is readable from the record. This is a weakest-link structure in the sense of Hirshleifer (1983) &mdash; the outcome for the group turns on the least contribution &mdash; and it is what makes remedy conduct among sellers rational rather than altruistic. What follows from it is the interest and its size; what any seller does about it is conduct, not a consequence, and this paper derives no behaviour from the figure. For the accountant the relevant point is narrower and firmer: the transfers such conduct produces are dated inside the open period, so they enter the same period as the settlement they precede, and no subsequent-events treatment or prior-period adjustment ever arises.
                    </PaperRemark>
                </PaperSubsection>
            </PaperSection>

            <PaperSection title="5. What Stops Being Necessary, and What Stops Applying">
                <p>
                    Two of the three classes named in Section 1 fall here &mdash; the first and the third &mdash; and they are different in kind. The <em>first</em> is work the protocol performs: the function is still performed, at no marginal cost, by the operation of the mechanism itself. The <em>third</em> is practice that has no application at all in this setting, because its subject matter has ceased to exist. The second, which continues, is Section 6&rsquo;s. Neither claim is a claim about practitioners&rsquo; livelihoods, and neither extends beyond activity that settles as a bonded process.
                </p>
                <PaperRun title="Byproduct: bookkeeping as record-keeping.">
                    The classical bookkeeping function &mdash; making journal entries, posting them to accounts, reconciling subsidiary records to the general ledger, running a trial balance &mdash; is byproduct for the process. No party maintains this record, and any reader can derive it. The labour historically performed in getting transactions into an account structure is done by the entries of &sect;4.2 and the replay of &sect;4.4.
                </PaperRun>
                <PaperRun title="Byproduct: the period-end close.">
                    The conventional period-end procedure &mdash; adjusting entries, trial balance, reconciliation of held balances against statements, closing entries &mdash; is performed by the resolution. Every commitment has a definite amount and a definite date, every receipt and disbursement has a counterparty the record names, there is no second record to reconcile against, and no closing adjustment is needed beyond the closing act itself. What makes this possible is not automation but the absence of the estimates that conventional closing exists to settle: an entity with no unfunded obligations has nothing to adjust at its period end.
                </PaperRun>
                <PaperRun title="Byproduct: internal audit of the record against itself.">
                    The internal-audit function that checks an entity&rsquo;s books against its own supporting documentation and transaction records is subsumed. The entries and the documents they bind are linked by content hash, the signatures are verifiable, and the dating is the settlement layer&rsquo;s. There is nothing to reconcile because there is no second record.
                </PaperRun>
                <PaperRun title="Inapplicable: audit of records-to-records correspondence.">
                    The external-audit function in its narrowest sense &mdash; attesting that a reported position reconciles to the underlying records &mdash; does not become cheaper; it ceases to have a subject. There is no reported position standing apart from the record and derived from it by a party, because the record is not the party&rsquo;s account of itself. What relocates rather than vanishes is the question of whose position the record is: verifying that the wallets an entity claims are the wallets it controls is a real assertion, it is not the one this function performed, and Section 6 treats it under <em>rights and obligations</em>.
                </PaperRun>
                <PaperRun title="Inapplicable: disputes about what the books say.">
                    A large category of commercial dispute has as its subject matter what an entity&rsquo;s books say or should have said &mdash; whether an expense was recorded, whether a liability was disclosed, whether a receipt was recognised when the entity&rsquo;s own criteria required. For activity settled as a bonded process the category is empty: there is one record, no party wrote it, and no party could have written it differently. Disagreement about it can only be disagreement about what it <em>means</em>, which is interpretation, or about whether it corresponds to what happened, which is the audit of Section 6. Neither is a dispute about the books.
                </PaperRun>
                <p>
                    All of this applies <em>within</em> a process. A single productive asset may participate in dozens or thousands of processes within a reporting period, and mapping that sequence of closed periods onto the asset&rsquo;s own reporting period under an applicable framework &mdash; when a performance obligation is satisfied, whether a receipt falls on one side of a cut-off or the other, how arrangements spanning several processes are unbundled &mdash; is interpretive work no closing act discharges. The record supplies dated, counterparty-identified, amount-exact settlements; what an entity-level statement makes of them is the subject of the next section.
                </p>
            </PaperSection>

            <PaperSection title="6. What Continues">
                <p>
                    The second class is the work that was never really about record-keeping. It continues in substance unchanged, and in one respect it is made easier: an interpretive judgment applied to a record nobody can dispute is a cleaner judgment than the same one applied to a record under negotiation.
                </p>
                <PaperRun title="Judgment about what records mean.">
                    Revenue recognition under ambiguity, going-concern assessment, fair-value measurement, impairment, and the full range of <em>interpretive</em> accounting work remain human. The record says what happened at the settlement layer; it does not say how what happened should be treated under a particular framework. The frameworks it does not displace are precisely the ones codified in current professional standards: ASC&nbsp;606 and IFRS&nbsp;15 on revenue from contracts with customers, IFRS&nbsp;13 on fair-value measurement, and the risk-assessment standards under which an auditor forms a view of an entity and its environment (AICPA, AU-C&nbsp;315; FASB, 2014; IASB, 2014; IASB, 2011).
                </PaperRun>
                <PaperRun title="A receipt with no counterparty.">
                    One interpretive question the setting creates deserves naming, because it has no conventional analogue and the record cannot answer it. Alongside the payments a wallet earns under agreements it signed, a wallet may come to hold tokens that no counterparty owed it: a periodic distribution of the protocol&rsquo;s own token to the authors of the composable terms and templates that settled processes actually used. How that distribution is computed is a mechanism with a subject of its own, which this paper does not describe and does not need to; nothing is pushed to anyone, and once a period has closed an eligible author claims what that period fixed, or does not. Such a receipt has no counterparty, no performance obligation behind it, and no agreement the recipient signed; it is not consideration in any contractual sense. Whether it is revenue, a capital contribution, a non-reciprocal receipt that triggers no recognition, or something else again, is interpretive work governed by the standards above and requiring judgment. The record establishes that the claim was made and by whom; it classifies nothing.
                </PaperRun>
                <PaperRun title="Translation for non-technical readers.">
                    Narrative management discussion, summaries of position for boards and external stakeholders, filings in jurisdictional formats, and the preparation of non-technical explanations of technical positions remain professional work. The record is complete and unreadable to most of its intended audiences; in this residual function the accountant is a translator rather than a record-keeper.
                </PaperRun>
                <PaperRun title="Audit of the relation between records and reality.">
                    The most substantive remaining audit function is verifying that records correspond to what happened. Did the cook prepare the food? Did the courier deliver it? Did the attested disclosure reflect what was measured? These questions ask whether the record faithfully represents events outside it, and the answer is fixed by &sect;4&rsquo;s boundary: the mechanism cannot answer them, has no operation that would, and never claimed to. It records what was undertaken and what settled. The professional standards separate the assertions an auditor tests &mdash; <em>existence</em>, <em>rights and obligations</em>, <em>completeness</em>, <em>accuracy</em>, <em>cut-off</em>, <em>classification</em>, and <em>valuation and allocation</em> (AICPA, AU-C&nbsp;315; AU-C&nbsp;500) &mdash; and the bonded setting redistributes them rather than retiring them.
                </PaperRun>
                <p>
                    Of the assertions, one is discharged by construction and the rest are not. <em>Accuracy</em> &mdash; that what was recorded was recorded faithfully &mdash; holds for the undertaking and the settlement, since the mechanism records nothing that was not signed and nothing that it did not itself do, and no later act rewrites either. The remaining six stand, with the burden distributed differently than under conventional bookkeeping:
                </p>
                <ul className="space-y-2 list-disc pl-6 text-sm">
                    <li><em>Existence</em> is the records-to-reality question above: did the economic event the record describes actually occur? The record establishes the undertaking, never the performance, so this assertion carries more of the audit&rsquo;s weight here rather than less.</li>
                    <li><em>Valuation and allocation</em> remains interpretive: fair value, impairment, amortisation, and similar measurement decisions are not what a settlement record contains.</li>
                    <li><em>Rights and obligations</em> relocates to wallet control &mdash; does the entity control the wallet whose positions it reports, and does that wallet&rsquo;s holding represent the entity&rsquo;s economic claim? This is a new audit surface specific to the bonded setting, and it is a question about keys and authority, not about classification.</li>
                    <li><em>Completeness</em> relocates to the boundary between activity that settled through processes and activity that did not: are there transactions within the reporting scope that never appear because they never settled this way?</li>
                    <li><em>Cut-off</em> reduces to nothing within a process, the closing moment being unambiguous and unchosen, and rises again at the entity-period boundary, where the question is which closings fall inside the reporting period under the applicable framework.</li>
                    <li><em>Classification</em> is interpretive throughout: addresses are not chart-of-accounts categories, and receipts and disbursements still have to be classified as revenue, cost, capital movement, or financing event. The record produces the dated flows; the classification is professional work.</li>
                </ul>
                <p>
                    The audit function that results is the one the records could never perform for themselves. Accuracy of recording is discharged by the mechanism; existence, completeness, and rights migrate toward the world and the keys; cut-off vanishes inside a process and reappears at the entity&rsquo;s own period boundary; valuation and classification stay where they always were, in judgment.
                </p>
                <PaperRun title="Regulatory compliance ahead of regulatory catch-up.">
                    Tax law, securities law, and sector regulation assume conventional books. For an extended period, participants settling through bonded processes will need to produce conventional statements from the record to satisfy those requirements, and that translation is professional work. Regulation may eventually reference settlement records directly; in the interim, the accountant&rsquo;s role includes producing traditional outputs from non-traditional inputs.
                </PaperRun>
                <PaperRun title="A worked projection: the European e-invoice norm.">
                    The translation can be made concrete. EN&nbsp;16931-1:2017 (CEN, 2017) defines the <em>semantic data model</em> of the core electronic invoice &mdash; not a file format, but the meaning and cardinality of an invoice&rsquo;s information elements, serialised into one of two permitted syntaxes. It is the model Directive&nbsp;2014/55/EU obliged European public bodies to accept (European Parliament and Council, 2014), and the &ldquo;VAT in the Digital Age&rdquo; package adopted by the Council on 11 March 2025 (Council of the European Union, 2025) makes a conformant structured invoice the definition of an EU e-invoice for intra-Community transactions from 2030 &mdash; regulation moving, as the preceding paragraph anticipated, toward machine-readable structured records rather than away from them. A settled process <em>projects</em> onto that model. The projection is a serialisation performed above the settlement layer, not a property of the mechanism, and it sorts the invoice&rsquo;s elements into two classes that recover precisely the byproduct-versus-interpretive split drawn throughout this paper.
                </PaperRun>
                <p>The first of the two element classes &mdash; the intrinsic commercial elements &mdash; falls out of the settlement record as byproduct:</p>
                <div className="my-4 overflow-x-auto">
                    <table className="text-sm border-collapse">
                        <thead>
                            <tr>
                                <th className="border border-default px-3 py-1.5 text-left font-semibold text-ink-heading">EN 16931 core element</th>
                                <th className="border border-default px-3 py-1.5 text-left font-semibold text-ink-heading">Recovered from the process as</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr><td className="border border-default px-3 py-1.5">Invoice number (BT-1)</td><td className="border border-default px-3 py-1.5">the commitment digest</td></tr>
                            <tr><td className="border border-default px-3 py-1.5">Issue date (BT-2)</td><td className="border border-default px-3 py-1.5">the resolution event&rsquo;s timestamp</td></tr>
                            <tr><td className="border border-default px-3 py-1.5">Invoice type code (BT-3)</td><td className="border border-default px-3 py-1.5">projection constant (commercial invoice, code 380)</td></tr>
                            <tr><td className="border border-default px-3 py-1.5">Invoice currency (BT-5)</td><td className="border border-default px-3 py-1.5">the process&rsquo;s unit of account (one per process)</td></tr>
                            <tr><td className="border border-default px-3 py-1.5">Seller (BG-4, BT-27)</td><td className="border border-default px-3 py-1.5">the seller wallet address</td></tr>
                            <tr><td className="border border-default px-3 py-1.5">Buyer (BG-7, BT-44)</td><td className="border border-default px-3 py-1.5">the buyer wallet address</td></tr>
                            <tr><td className="border border-default px-3 py-1.5">Invoice lines (BG-25, BT-131)</td><td className="border border-default px-3 py-1.5">the process&rsquo;s orders &mdash; each commitment&rsquo;s payment <Math>{"P_i"}</Math> with the description its bound agreement carries</td></tr>
                            <tr><td className="border border-default px-3 py-1.5">Sum of Invoice line net amount (BG-22, BT-106)</td><td className="border border-default px-3 py-1.5"><Math>{"\\sum_i P_i"}</Math> across the process&rsquo;s orders</td></tr>
                        </tbody>
                    </table>
                </div>
                <p>
                    The second of them &mdash; the tax elements &mdash; does not fall out, and cannot: seller VAT identifier (BT-31), the VAT breakdown (BG-23), category code (BT-118), rate (BT-119), tax point date (BT-7), tax representative (BG-11), and the VAT-inclusive total (BT-112). These presuppose a registered entity inside a particular regime. The model itself treats them as <em>conditional</em> rather than unconditional: BT-31 has cardinality 0..1, and rule BR-S-02 makes it conditional &mdash; where an invoice line is standard-rated for VAT, the invoice must carry the seller VAT identifier (BT-31), the seller tax registration identifier (BT-32), or the seller tax representative VAT identifier (BT-63). The tax apparatus attaches when, and only when, the party is inside a taxable regime; for a transaction that is not, the intrinsic class above is already a complete core invoice. That conditional trigger is exactly the registration status the settlement layer does not hold and the parties&rsquo; composed terms do: terms composed for an EU jurisdiction supply BT-31 and the VAT breakdown from the seller&rsquo;s registration data, and the settlement record supplies the rest as byproduct.
                </p>
                <p>
                    This is the same move the paper makes for revenue timing: the mechanism produces the structured record, and the jurisdiction-specific interpretation attaches above it. EN&nbsp;16931 is named here because it is the most fully specified invoice norm, not because the mechanism is European &mdash; it is one jurisdiction&rsquo;s model, and the same byproduct projects onto other jurisdictions&rsquo; invoice models with their own conditional tax fields. The projection reaches the <em>core</em> model; national profiles add further mandatory fields the same way, from the parties&rsquo; composed terms rather than from the settlement layer. And it is a mapping, not a compliance claim: it shows that the core invoice model is recoverable from the settlement record plus jurisdiction-supplied tax data, not that a process is by itself a compliant e-invoice or discharges any filing obligation.
                </p>
                <PaperRun title="One decomposition, three presentations.">
                    The line-item structure the projection recovers is not a further artefact anyone must separately produce &mdash; it is the same itemised record the buyer approves before committing and the same record an auditor reads. The orders of a process <em>are</em> its cost lines: each is one productive asset&rsquo;s contribution to what the buyer bought, tangible or intangible alike &mdash; an airframe&rsquo;s flight-hour, a fuel volume, a crew duty-period, a landing slot, a maintenance allocation. What the buyer sees at the point of purchase, what the file exposes order by order, and what the invoice serialises are three presentations of one self-closing ledger period. The conventional apparatus produced these as three systems &mdash; a point-of-sale record, an audit file, an invoice &mdash; and reconciled them after the fact; here they are one record read three ways.
                </PaperRun>
            </PaperSection>

            <PaperSection title="7. The Asset Behind the Wallet">
                <p>
                    The accounts of Section 4 belong to processes, and processes have parties. This section says what a party is, because the answer decides what remains to be accounted for once the periods have closed themselves, and because the conventional apparatus assumes an answer &mdash; the firm &mdash; that this setting does not supply.
                </p>
                <PaperRun title="Three layers: asset, wallet, operator.">
                    Every participant is a wallet, and every wallet <em>represents</em> a real-world asset: a piece of physical capital (an aircraft, a kitchen, a delivery van), a credentialed individual&rsquo;s labour capacity (a pilot&rsquo;s, a courier&rsquo;s, a physician&rsquo;s), or a public service (a screening checkpoint, a road network, a customs authority). Three layers must be kept apart. The <em>asset</em> is off the record by definition &mdash; the airframe that flies, the capacity that is exercised, the service that is provided. The <em>wallet</em> is the asset&rsquo;s on-record representation: an address holding balances, together with whatever pointers to credentials, certificates, and documents the parties&rsquo; terms require. The <em>operator</em> is whoever controls the wallet&rsquo;s signing key on the asset&rsquo;s behalf, human or autonomous agent alike; which of the two it is changes nothing in any account below. The mechanism sees only the wallet. &ldquo;Buyer&rdquo; and &ldquo;seller&rdquo; are not a fourth layer but positions a wallet occupies in a particular process, and the same wallet occupies either in different ones.
                </PaperRun>
                <p>
                    The payment an order carries is the value added by that asset at its link, and it is the only quantity the mechanism holds about the asset&rsquo;s economics. Payments a wallet receives are its revenue; payments it makes are its costs; the mechanism models neither, and no derivation in this paper contains a cost term. What it does see is whether the wallet holds balances it can post. That is the whole of the participation condition: a wallet takes part for as long as it has tokens to bond.
                </p>
                <PaperRun title="The sustainability logic.">
                    An asset participating through a wallet sustains itself the way a node on a network sustains itself. A node earns from participation, and those receipts must cover its off-record operating expenses &mdash; machines, power, maintenance, premises &mdash; or its operator stops running it and it leaves the network. An asset behind a wallet is in the same position in its own market: receipts from settled processes must cover fuel, parts, labour, premises, regulatory fees, and the amortisation of the capital itself, or the operator stops bonding the wallet into processes and the asset leaves the market it served. No rule enforces this and none needs to; ordinary rational exit does. The equilibrium such a market settles at is not a distribution of surplus but a rate of return sufficient for each asset to keep participating &mdash; in other words, a productive life.
                </PaperRun>
                <p>
                    Public-authority wallets stand on exactly the same footing. A screening authority&rsquo;s wallet, an airport authority&rsquo;s, a road authority&rsquo;s &mdash; each represents a real service whose continued operation requires receipts covering personnel, equipment, premises, and capital. The mechanism does not distinguish a tax from a fee for service: both are payments to a wallet whose participation costs the buyer exactly what any other order costs. Whether the underlying receipt is regulated as taxation, charged as a user fee, or appropriated from a general budget is a question outside the record &mdash; and it is a classification question of exactly the kind Section 6 assigns to judgment, arising here at the boundary between a settlement record that treats all payments alike and a framework that does not.
                </p>
                <PaperRun title="The books the asset keeps for itself.">
                    This is where the boundary of Section 4 pays off, and where it must be held rather than blurred. Each closed process leaves the asset with a period that closed itself: dated, counterparty-identified, amount-exact, and requiring nothing further of the asset&rsquo;s own bookkeeping to be complete <em>as the record of that process</em>. An asset whose participation is entirely a sequence of bonded processes therefore has, for that participation, no transaction-level bookkeeping left to do &mdash; its own books are the concatenation of closed periods, none of which it kept and none of which it can be asked to prove. What remains at the asset&rsquo;s own level is what Sections 5 and 6 assign there: mapping closed periods onto a reporting period, classifying receipts and disbursements under a framework, and everything the asset does outside any process. Those accounts are the asset&rsquo;s, this paper does not open them, and nothing in Section 4 is a claim about what they contain.
                </PaperRun>
                <PaperRemark title="Why co-sellers share fate for the duration.">
                    The sustainability logic explains the interest that &sect;4.5 priced. Because the process settles as one, every seller&rsquo;s release waits on every other&rsquo;s performance, so for as long as a process stands open the assets behind those wallets share a fate: a co-seller&rsquo;s failure is not an isolated matter of one counterparty&rsquo;s conduct but a position the others go on standing in. That is why a remedy of the kind &sect;4.5 describes is one such parties have their own reason to undertake, owing each other nothing &mdash; each is an asset whose own continued participation depends on receipts, and the closing act that releases all of them is the same act for all of them. The record supplies the interest and its magnitude; what any party does about it is conduct, which the record neither compels nor predicts.
                </PaperRemark>
            </PaperSection>

            <PaperSection title="8. Primacy in the Hierarchy of Audit Evidence">
                <p>
                    Accounting practice does not treat all evidence as equal, and the ordering it uses bears directly on everything above. Evidence obtained from outside the entity ranks above the entity&rsquo;s own representations; evidence the auditor derives directly ranks above evidence handed to it; and a record derived from another ranks below its source. Conventional books sit at the bottom of that ordering by construction. They are the entity&rsquo;s assertion about itself, which is precisely why confirming them requires the apparatus of Section 2 &mdash; the confirmations, the vouching, the third-party attestation whose whole purpose is to reach evidence the entity did not author.
                </p>
                <p>
                    The accounts of a bonded process do not sit anywhere on that scale, because they are not any entity&rsquo;s representation. No party wrote them, no party could have written them differently, and no party is in a position to offer a competing version to be weighed against them. For the process, therefore, the record is not merely reliable evidence <em>of</em> the account &mdash; it <em>is</em> the account, and the documents a party holds about a process (a summary, a statement, an export) are derived records, ranking below the source in the ordering above rather than standing beside it as rivals. This is the property Section 5 draws on when it says that reconciling records against records has lost its subject, and the one Section 6 draws on when it discharges accuracy of recording and leaves the other assertions standing.
                </p>
                <p>
                    Whether such a record may be introduced and weighed in a legal proceeding is a separate question, belonging to the law of electronic evidence rather than to accounting, and this paper does not take it up. The claim here is the narrower accounting one: within the ordering by which audit evidence is weighed, the process&rsquo;s accounts occupy the position that the entity&rsquo;s own books never could. And it is a claim about the process alone &mdash; the standing of a party&rsquo;s own entity-level accounts is untouched by it, and remains what it has always been.
                </p>
                <p>
                    One qualification follows from Section 4.3 and should be read with it, since the two kinds of material in a process file do not carry equal weight. The entries are what the mechanism did, and it could not have done otherwise; there is nothing in them to verify against anything. The supporting file is the parties&rsquo; own: an attestation is bound by inclusion to the agreement its commitment hashed, so it cannot be introduced against terms nobody agreed to, but the decision to make it and the truth of what it asserts about the world are the attesting party&rsquo;s. An audit budget therefore goes to the supporting file and not to the entries &mdash; which is the same conclusion Section 6 reaches from the assertions, arrived at from the evidence side.
                </p>
            </PaperSection>

            <PaperSection title="9. Scope">
                <p>
                    The argument has one boundary, and it has been drawn in the same place at every point above: it concerns the accounting record <em>of a bonded process</em>. Within that boundary the claim is strong &mdash; the process&rsquo;s accounts are complete, funded, derivable by any reader, and closed by an act that leaves no residue. Outside it the paper claims nothing. The parties&rsquo; own entity-level accounts, the reporting periods those accounts are prepared for, the frameworks they are prepared under, and every economic act that does not settle as a bonded process are all outside, and Sections 5, 6, and 7 each hand work back across that line rather than absorbing it.
                </p>
                <p>
                    The boundary has a second face, which is the more important of the two. What the record contains is undertakings, positions, and settlement. It does not contain performance, and no reading of it will establish that a meal was cooked or a parcel handed over, because those events happen where the mechanism cannot look. A complete accounting record of a process is therefore not a complete account of the exchange the process settled: the thing bought never appears in any account of Section 4. This is not a gap to be closed by a better record. It is the division of labour the whole design rests on, and it is why the audit function of Section 6 is not merely surviving but carrying more of the weight than before.
                </p>
                <PaperRun title="The record is only as reliable as the layer beneath it.">
                    The record inherits the reliability of the settlement layer that carries it and the cryptographic primitives underneath. A reorganisation that unwinds settled state, a signature-scheme break, or censorship at the layer&rsquo;s own level would each compromise the record. These risks are not new to accounting &mdash; a merchant&rsquo;s ledger could burn &mdash; but they are concentrated differently: at one layer rather than distributed across party-held books. Whether that concentration is a net improvement depends on the relative reliability of the two arrangements, which is an empirical question this paper does not settle.
                </PaperRun>
                <PaperRun title="Key custody is a first-order audit surface.">
                    If the wallet is the record of position, then control of its keys is control of that position. The Pacioli equivalent is the strongbox holding the journal: physical controls, segregation of duties, authorisation. The analogous surface here is control over signing keys &mdash; threshold arrangements, hardware custody, rotation procedures, signer-set governance, recovery. This is not a new audit assertion; it sits within the <em>rights and obligations</em> assertion and within existing IT-control frameworks. It is a relocated emphasis: where the conventional regime puts its control weight on reconciling records against records, this one puts it on establishing who holds the keys.
                </PaperRun>
            </PaperSection>

            <PaperSection title="10. Conclusion">
                <p>
                    Pacioli (1494) solved a specific problem: how to make the position of an opaque, continuously operating economic entity legible over time. The solution was double-entry bookkeeping, and the apparatus built on top of it &mdash; bookkeepers, accountants, auditors, commercial lawyers, tax preparers &mdash; is one of the defining professional formations of the modern economy. It solves the problem it was designed for.
                </p>
                <p>
                    A bonded settlement mechanism changes the entity rather than the method. The accounts it produces belong to the transaction: a process opens when the first commitment is bonded, holds positions whose claims are funded in full by capital already posted, has identically zero equity and no result account of its own, and closes when the buyer &mdash; the only party who may, and only when satisfied &mdash; settles every order at once. The closing entry zeroes every account the period opened, account by account, with the payment moving between two claims in the single reclassification line that is the whole economic content of the period. That is a self-closing ledger period, and it closes itself in the strong sense: the schedule that funds the claims also makes the closing the act each party prefers &mdash; after performance, resolving is unconditionally strictly better for the buyer, and given that, performing is each seller&rsquo;s strict best response.
                </p>
                <p>
                    The consequences divide in three. A class of professional work becomes byproduct: journal-keeping, posting, trial balance, reconciliation of a record against itself, and the period-end close, which needs no adjusting entries because there is nothing unfunded to adjust. A class becomes structurally inapplicable rather than cheaper: the audit of records against records, and the commercial disputes whose subject is what an entity&rsquo;s books say, have no subject where one record exists and no party wrote it. And a class continues undiminished: judgment about what records mean, translation for readers who cannot read them, and the audit that tests whether a record corresponds to what happened &mdash; which the boundary of this argument guarantees will always be needed, since the record holds undertakings and settlements and never performance.
                </p>
                <PaperRun title="The third inflection.">
                    Pacioli made the position of an entity legible. Nakamoto (2008) and Buterin (2014) made settlement itself a shared record rather than an intermediary&rsquo;s book. A bonded settlement primitive makes the record process-scoped and self-closing, which returns the accounting entity to the size of a transaction &mdash; the size it had before firms were invented to hold coordination durably. Each inflection reduces a specific apparatus from necessary to optional for the class of activity it covers, and leaves the rest intact. This paper is an attempt to describe what the third entails before the debate is muddied by the usual overpromising of blockchain-accounting claims and the usual under-appreciation of what specifically has changed.
                </PaperRun>
                <PaperRun title="A note on what is gained.">
                    We have written mostly about what stops being necessary. It is worth stating what is gained. The apparatus described in Section 2 costs substantial fractions of overhead and imposes substantial compliance costs. It is also a gate: participants who cannot afford professional accounting are partly excluded from the forms of economic activity that presuppose it &mdash; formal contracts, audited transactions, disclosures requiring an attestor. A mechanism that produces the accounting record of a transaction as the byproduct of settling it makes that record available to participants who could not otherwise have bought it. Smaller productive assets, participants in places without a deep accounting profession, and machine-operated activity whose scale would never justify an accountant all obtain audit-grade records of their transactions for the cost of transacting. The apparatus is not abolished for them; the entry price to having books at all is.
                </PaperRun>
            </PaperSection>
        </PaperLayout>
    );
}
