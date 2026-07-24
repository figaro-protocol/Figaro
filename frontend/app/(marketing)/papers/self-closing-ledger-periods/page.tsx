import type { Metadata } from "next";
import {
    PaperLayout,
    PaperSection,
    PaperSubsection,
    PaperRun,
} from "@/components/papers/PaperLayout";
import { Math } from "@/components/papers/Math";

export const metadata: Metadata = {
    title: "Bookkeeping as Protocol Byproduct — Figaro Protocol",
    description:
        "A Figaro process is a self-closing ledger period: commitments are journal entries, resolution is the closing entry, the kernel's conservation law is the bookkeeping identity. A specific class of record-keeping work becomes protocol byproduct; interpretive accounting and audit-against-reality continue.",
};

export default function SelfClosingLedgerPeriodsPaper() {
    return (
        <PaperLayout slug="self-closing-ledger-periods"
            title="Bookkeeping as Protocol Byproduct"
            subtitle="Self-Closing Ledger Periods in the Figaro Settlement Primitive"
            author="Alessandro Daliana"
            date="April 2026"
            watermark="Figaro Protocol · Preprint"
            keywords="bookkeeping, accounting, auditing, double-entry, triple-entry, smart contracts, verifiable records, Pacioli, e-invoicing, EN 16931"
            abstract={
                <>
                    <p>
                        Modern accounting rests on a specific historical innovation: double-entry bookkeeping, codified in Pacioli (1494) and elaborated over five centuries into the apparatus of the modern firm. Pacioli&rsquo;s innovation solved a specific problem &mdash; how to track the position of an opaque economic entity over time, in a form that could be reconciled, audited, taxed, and adjudicated. The solution made the modern firm possible (Sombart, 1916; Chandler, 1977) and generated the professions that sit on top of it: bookkeeping, accounting, auditing, tax preparation, and the commercial law that treats books as the authoritative record of the firm&rsquo;s economic acts.
                    </p>
                    <p>
                        This paper argues that the Figaro settlement primitive &mdash; the asymmetric bonding and buyer-dominance mechanisms of the settlement kernel &mdash; makes that apparatus optional for a class of economic activity. A Figaro process &mdash; a root bonded commitment together with its sub-orders, terms of agreement, and lifecycle attestations &mdash; is a <em>self-closing ledger period</em> in the precise accounting sense: the complete accounting record of the process &mdash; balance-sheet position, journal, closing entries, and contemporaneous supporting documentation &mdash; is produced on chain, content-addressed and signed, as a byproduct of settlement, and the period closes when the process dissolves.
                    </p>
                    <p>
                        The consequence is not that accounting as a discipline disappears. The consequence is that a specific class of professional work &mdash; record-keeping, reconciliation, period-end closing, basic audit of the records themselves &mdash; becomes protocol byproduct rather than professional service. What remains genuinely professional is interpretive: going-concern judgment, revenue-recognition timing under ambiguity, fair-value assessment, regulatory translation, and the forms of audit that test the relation between records and real-world performance rather than the internal consistency of records. We argue the shift is structurally analogous to the 1494 innovation that created the apparatus in the first place: a new technology at the records layer that makes a specific class of prior work unnecessary and leaves another class untouched.
                    </p>
                </>
            }
            references={
                <>
                    <li>Braudel, F. <em>Civilization and Capitalism, 15th&ndash;18th Century, Volume 2: The Wheels of Commerce</em>. Harper &amp; Row, New York, 1982. Trans. S. Reynolds.</li>
                    <li>Buterin, V. Ethereum: A Next-Generation Smart Contract and Decentralized Application Platform. White paper, 2014.</li>
                    <li>Chandler, A. D. <em>The Visible Hand: The Managerial Revolution in American Business</em>. Belknap Press of Harvard University Press, Cambridge, MA, 1977.</li>
                    <li>Dai, J. &amp; Vasarhelyi, M. A. Toward Blockchain-Based Accounting and Assurance. <em>Journal of Information Systems</em>, 31(3):5&ndash;21, 2017.</li>
                    <li>de Roover, R. <em>The Rise and Decline of the Medici Bank, 1397&ndash;1494</em>. Harvard University Press, Cambridge, MA, 1963.</li>
                    <li>Grigg, I. Triple Entry Accounting. Working paper, Systemics Inc., 2005.</li>
                    <li>Ijiri, Y. A Framework for Triple-Entry Bookkeeping. <em>The Accounting Review</em>, 61(4):745&ndash;759, 1986.</li>
                    <li>Ijiri, Y. <em>Momentum Accounting and Triple-Entry Bookkeeping: Exploring the Dynamic Structure of Accounting Measurements</em>. American Accounting Association, Sarasota, FL, 1989.</li>
                    <li>International Accounting Standards Board. <em>IFRS 15: Revenue from Contracts with Customers</em>. IFRS Foundation, London, 2014.</li>
                    <li>Financial Accounting Standards Board. <em>Accounting Standards Codification Topic 606: Revenue from Contracts with Customers</em>. FASB, Norwalk, CT, 2014.</li>
                    <li>American Institute of Certified Public Accountants. <em>AU-C Section 315: Understanding the Entity and Its Environment and Assessing the Risks of Material Misstatement</em>. AICPA, Durham, NC, 2020.</li>
                    <li>American Institute of Certified Public Accountants. <em>AU-C Section 500: Audit Evidence</em>. AICPA, Durham, NC, 2020.</li>
                    <li>American Institute of Certified Public Accountants. <em>AU-C Section 570: The Auditor&rsquo;s Consideration of an Entity&rsquo;s Ability to Continue as a Going Concern</em>. AICPA, Durham, NC, 2020.</li>
                    <li>Governmental Accounting Standards Board. <em>Statement No. 33: Accounting and Financial Reporting for Nonexchange Transactions</em>. GASB, Norwalk, CT, December 1998.</li>
                    <li>Governmental Accounting Standards Board. <em>Statement No. 34: Basic Financial Statements &mdash; and Management&rsquo;s Discussion and Analysis &mdash; for State and Local Governments</em>. GASB, Norwalk, CT, June 1999.</li>
                    <li>European Committee for Standardization (CEN). <em>EN 16931-1:2017 &mdash; Electronic Invoicing, Part 1: Semantic Data Model of the Core Elements of an Electronic Invoice</em>. CEN, Brussels, 2017.</li>

                    <li>Kindleberger, C. P. <em>A Financial History of Western Europe</em>. Oxford University Press, New York, 2nd ed., 1993.</li>
                    <li>Mattessich, R. <em>Accounting and Analytical Methods: Measurement and Projection of Income and Wealth in the Micro- and Macro-Economy</em>. Richard D. Irwin, Homewood, IL, 1964.</li>
                    <li>Nakamoto, S. Bitcoin: A Peer-to-Peer Electronic Cash System. White paper, 2008.</li>
                    <li>Pacioli, L. <em>Summa de Arithmetica, Geometria, Proportioni et Proportionalita</em>. Paganinus de Paganinis, Venice, 1494. Particularis de computis et scripturis (book on accounts and records), treatise XI.</li>
                    <li>Power, M. <em>The Audit Society: Rituals of Verification</em>. Oxford University Press, 1997.</li>
                    <li>Sombart, W. <em>Der moderne Kapitalismus</em>, volume 2. Duncker &amp; Humblot, Munich, 1916.</li>
                    <li>Yamey, B. S. Scientific Book-keeping and the Rise of Capitalism. <em>The Economic History Review</em>, 1(2&ndash;3):99&ndash;113, 1949.</li>
                    <li>Yermack, D. Corporate Governance and Blockchains. <em>Review of Finance</em>, 21(1):7&ndash;31, 2017.</li>

                    <li>Compound Labs. <em>Compound Governor: On-Chain Governance Module</em>. Compound Protocol Documentation, 2020.</li>
                    <li>OpenZeppelin. <em>Governor Contracts: Reference Implementation for On-Chain Governance</em>. OpenZeppelin Contracts Documentation, ongoing as of 2024.</li>
                    <li>Sablier Labs. <em>Sablier Protocol: Token Streaming Infrastructure</em>. Sablier Documentation, 2023.</li>
                    <li>Superfluid Finance. <em>Superfluid Protocol: Continuous Money Streams</em>. Superfluid Documentation, 2023.</li>
                    <li>Messari Research. <em>The Health of DAO Treasuries</em>. Messari Report, 2022.</li>
                    <li>DeepDAO. <em>DAO Treasury Aggregate Statistics</em>. DeepDAO Analytics Platform, ongoing as of 2024.</li>
                </>
            }
        >
            <PaperSection title="1. Introduction">
                <p>
                    Every modern firm maintains books of account. The books record what the firm owns (assets), what it owes (liabilities), what has flowed in and out (revenues and expenses), and how these quantities have changed over a defined period. The books make the firm legible to itself, to its investors, to its regulators, and to its counterparties. They do not constitute the firm&rsquo;s legal personality &mdash; which flows from incorporation &mdash; but they are the artefact through which the firm&rsquo;s legal personality is exercised in practice: regulators read books, contracts reference books, disputes are adjudicated against books.
                </p>
                <p>
                    The books are not an incidental feature. They are the infrastructure on which much of modern commercial law rests. Tax law assumes books and operates against them. Securities law requires disclosure of books. Insolvency proceedings run against books. Due diligence in mergers and acquisitions is substantially an examination of books. Auditing is the profession that verifies books, and the auditor&rsquo;s report is a legal artifact with specific consequences. The apparatus is substantial, costly, and well-adapted to the problem it solves.
                </p>
                <p>
                    What problem does it solve? Pacioli (1494) identified the underlying difficulty: an economic entity with continuous operations needs a way to answer the question <em>what is its position?</em> at any moment. Cash positions alone are insufficient because obligations outstanding are not captured; asset lists alone are insufficient because liabilities and equity are not distinguished; transaction logs alone are insufficient because the cumulative position is not summarized. Pacioli&rsquo;s double-entry bookkeeping solved this by recording every transaction as a balanced pair of debits and credits, allowing the cumulative position to be derived at any time as a trial balance, and reconciled to zero if no errors had been made. Every subsequent layer of the apparatus &mdash; accounting, auditing, commercial law, tax law &mdash; was built on the assumption that Pacioli&rsquo;s books exist and are more or less reliable.
                </p>
                <p>
                    This paper asks what happens to that apparatus when the books are not maintained by any party but are instead constituted by a settlement protocol as the byproduct of its operation. The answer we develop: a specific class of accounting work becomes unnecessary, a distinct class remains valuable, and a third class &mdash; commercial law and audit practices that assume the firm is opaque and its books need external verification &mdash; becomes structurally inapplicable to the class of economic activity that settles through the protocol.
                </p>
                <PaperRun title="What this paper is not.">
                    We do not argue that all economic activity migrates to Figaro processes. We do not argue that accounting as a discipline ends. We do not advocate for any specific regulatory response. We claim only that a particular historical apparatus, designed for a particular problem, has a narrower scope of applicability once that problem can be solved at the settlement layer. What to do with the narrowed scope is a matter for accounting research, regulatory policy, and the profession itself.
                </PaperRun>
                <PaperRun title="Paper organization.">
                    Section 2 describes the Pacioli stack &mdash; double-entry, the apparatus on top, and the costs and benefits of the arrangement. Section 3 locates that stack within the longer banking arc it was one layer of. Section 4 treats the prior literature on triple-entry bookkeeping and blockchain-accounting, acknowledging the antecedents we depart from. Section 5 develops the central technical claim: a Figaro process is a self-closing ledger period. Section 6 describes what stops being necessary. Section 7 describes what continues and why. Section 8 canonicalises the wallet-as-RWA apparatus and catalogues treasury composition patterns. Section 9 treats admissibility, primacy, and the two classes of record. Section 10 states the argument&rsquo;s limits. Section 11 concludes.
                </PaperRun>
            </PaperSection>

            <PaperSection title="2. The Pacioli Stack">
                <p>
                    Pacioli (1494) published <em>Summa de arithmetica, geometria, proportioni et proportionalita</em> in Venice in 1494. The treatise was a general mathematics reference, but its thirty-six-chapter section <em>De computis et scripturis</em> contained the first printed exposition of double-entry bookkeeping as practiced by Venetian merchants. The system was not invented by Pacioli &mdash; it had been in use in Italian commercial cities for at least a century &mdash; but his codification became the reference text and carried the method into every subsequent tradition of commercial accounting.
                </p>
                <p>
                    The method is simple. Every transaction is recorded twice, once as a debit to one account and once as a credit to another. The sum of all debits always equals the sum of all credits. At any moment the trial balance &mdash; the list of all account balances &mdash; sums to zero if no errors have been made. The books are therefore self-checking: an error produces an imbalance that can be located and corrected. The cumulative position of the entity is derivable at any time by summarizing account balances into a balance sheet (assets, liabilities, equity) and an income statement (revenues, expenses, net income).
                </p>
                <p>
                    Pacioli&rsquo;s exposition organizes the method into three books that together constitute the merchant&rsquo;s record. The <em>memoriale</em> (memorandum) is the rough chronological record, kept at the point of transaction and informal in style. The <em>giornale</em> (journal) is the formal chronological record, where each transaction is re-entered as a balanced pair of debits and credits in a fixed format. The <em>quaderno</em> (ledger) is the categorial record, where journal entries are posted to individual accounts and the running balance of each account is maintained. The trial balance is taken from the quaderno, and the period&rsquo;s financial statements are derived from the trial balance through closing entries that move period results into permanent accounts. The three books are not redundant; each serves a distinct evidentiary and analytical function, and the sequence <em>memoriale</em> <Math>{"\\to"}</Math> <em>giornale</em> <Math>{"\\to"}</Math> <em>quaderno</em> is the path by which a transaction enters the merchant&rsquo;s cumulative position. We return to this triad in Section 5: the bonded process, on the reading we will develop, supplies the equivalent of all three books as a single byproduct of the settlement event.
                </p>
                <PaperRun title="Why the innovation was decisive.">
                    Sombart (1916) argued &mdash; in a claim that has been debated but not decisively refuted &mdash; that double-entry bookkeeping was a necessary condition for the rise of modern capitalism. The argument is that without a reliable method for tracking cumulative position, an economic entity cannot grow beyond the scale at which its position is visible to a single person from direct observation. A cook running a kitchen can track inventories and obligations in their head; a merchant house running dozens of ships cannot. Double-entry made scale possible by making position legible under distributed operations. Subsequent historians (Chandler, 1977, on the managerial firm; Yamey, 1949, on the empirical record) have refined the argument but not the structural point.
                </PaperRun>
                <PaperRun title="The apparatus on top.">
                    Over five centuries a substantial professional apparatus has grown on top of the books. Bookkeepers maintain journals and post to ledgers. Accountants produce periodic financial statements, make closing entries, compute taxes, and advise on treatment of ambiguous transactions. External auditors verify that the statements fairly represent the firm&rsquo;s position. Regulators require filings based on the books. Tax authorities compute liabilities against the books. Commercial lawyers litigate disputes whose subject matter is what the books say or should have said. Power (1997) describes the resulting <em>audit society</em> &mdash; a social formation in which verification by credentialed third parties is the default response to questions of organizational reliability.
                </PaperRun>
                <p>
                    The apparatus is real, well-established, and substantially functional. It is also costly. Compliance costs for public companies in mature jurisdictions are non-trivial relative to revenue; small firms spend a meaningful fraction of their overhead on tax filings and financial-statement preparation; audit budgets are substantial; forensic-accounting specialists are expensive. The apparatus is justified, under the existing model, because it answers a question that cannot be answered otherwise &mdash; is the firm&rsquo;s position as its managers say it is? &mdash; and because the alternative (believe the firm&rsquo;s own claim) has been tried historically and repeatedly failed.
                </p>
            </PaperSection>

            <PaperSection title="3. Banking as Coordinating Infrastructure Since the Renaissance">
                <p>
                    The Pacioli innovation of Section 2 did not arise in isolation: it codified a bookkeeping practice that was itself one layer of the coordination infrastructure Italian merchant cities assembled to solve the problem of trust at distance. The Medici bank&rsquo;s bills of exchange and correspondent branches let a merchant in Florence pay one in Bruges by trusting the bank rather than each other (de Roover, 1963); double-entry made the multi-branch bank&rsquo;s position legible, and the bank in turn made its merchant clients&rsquo; positions settleable. The institutional successors &mdash; the Amsterdam Wisselbank, the Bank of England, central banking, the Bretton Woods / SWIFT / CLS configuration (Braudel, 1982; Kindleberger, 1993) &mdash; generalized the arrangement to global scale without changing its basic structure: trust in a counterparty underwritten by trust in an intermediary that keeps authoritative books about the position between them. Against that arc, the mechanism of Section 5 registers as a structural inflection rather than an incremental innovation. Pacioli made the books legible; the trusted intermediary made them enforceable across distance by keeping them; a settlement primitive that enforces bilateral agreements directly, locating the keeping of the books at the protocol layer, refactors the enforcement-at-distance problem that Pacioli&rsquo;s apparatus was one layer of. This is not a claim that Figaro displaces banking infrastructure; we note the arc so that Section 5 is not misread as a narrow technical proposal about bookkeeping, when its consequence is a rearrangement of a five-hundred-year-old institutional stack.
                </p>
            </PaperSection>

            <PaperSection title="4. Triple-Entry and Its Limits">
                <p>
                    The idea that Pacioli&rsquo;s double-entry might be extended to solve additional problems has a small but identifiable literature. Ijiri (1986) proposes a framework for triple-entry bookkeeping: each transaction generates not two entries but three, with the third recording a dimension conventional double-entry misses. Ijiri (1989) elaborates the framework into <em>momentum accounting</em>, identifying that missing dimension: a balance sheet captures stocks and a flow statement captures changes in stocks, but neither captures the rate at which stocks are changing, so the third entry tracks the <em>force</em> or <em>momentum</em> of an account &mdash; the second derivative. We name Ijiri as inspiration rather than as an ancestor we extend. The bonded process&rsquo;s cumulative-value accumulator <Math>{"G_i"}</Math> records cumulative <em>payment</em> (a stock, in Ijiri&rsquo;s vocabulary), not force or its integral. What the two share is the structural commitment to recording an additional dimension beyond stocks and flows; what they do not share is the dimension itself.
                </p>
                <p>
                    A more deeply formal antecedent is Mattessich (1964), who develops accounting as an axiomatic system: the double-entry identity is an algebraic invariant on a set of basic propositions about value flows, analogous to the conservation laws of physics. The custodial identity we will define in Section 5 below is, in Mattessich&rsquo;s sense, the same algebraic invariant restated for the bonded process: total assets in the contract&rsquo;s escrow equal total liabilities to the bonded parties at every moment of the process&rsquo;s life, with the equality discharged at settlement.
                </p>
                <p>
                    Grigg (2005) revived the idea in a blockchain-adjacent register. Grigg&rsquo;s triple-entry proposes that two parties to a transaction each keep a record in the conventional way, and a third party &mdash; a cryptographically signed receipt that both parties can reference &mdash; serves as the attesting third record. In practice the third record played the role now played by blockchain transaction records: a tamper-evident, timestamped, publicly verifiable artifact that neither party could modify after the fact. Grigg&rsquo;s contribution was to formalize what the Ricardian contracts community had been practicing: that cryptographic receipts could carry the legal weight of a signed document while also functioning as an accounting record.
                </p>
                <p>
                    A larger recent literature has explored the broader claim that blockchain technology changes the accounting problem. Dai &amp; Vasarhelyi (2017) propose that blockchain-based transaction records can form the basis for real-time audit, replacing periodic audit cycles. Yermack (2017) surveys corporate-governance applications of blockchain, including the implications for the audit function. Various industry and professional-society reports have explored blockchain and accounting in the period 2017&ndash;2022.
                </p>
                <PaperRun title="Where the prior literature stops.">
                    The recurring limit of the prior work is that it treats the chain as a <em>third, attesting</em> record alongside the two parties&rsquo; own records. The parties still maintain books; the chain provides cryptographic reinforcement. This is a real improvement over pure party-held records (reconciliation becomes faster; attestation becomes cryptographic; the third record cannot be unilaterally altered), but the structure of the apparatus remains unchanged: the parties keep books, the chain attests, the audit function verifies that the parties&rsquo; books match the chain and match each other.
                </PaperRun>
                <p>
                    The Figaro extension is different. In a Figaro process, the parties do not need to maintain books at all &mdash; not because they can choose not to, but because the protocol-level records are themselves the complete accounting record of the process. The chain is not an attesting third; it is the primary and only record required. We develop this claim in the next section.
                </p>
            </PaperSection>

            <PaperSection title="5. A Figaro Process as a Self-Closing Ledger Period">
                <p>
                    We now develop the central technical claim. Let a <em>process</em> be the kernel object: a root bonded commitment, zero or more sub-order commitments sharing a common root buyer and currency, a monotonic cumulative-value accumulator, and a buyer-initiated atomic resolution. Every commitment is a pair of dual-signed EIP-712 payloads; every resolution is an atomic distribution governed by the payout functions <Math>{"\\pi_{s,i} = 2G_i + P_i"}</Math> and <Math>{"\\pi_{b,i} = P_i"}</Math>, where <Math>{"P_i"}</Math> is the payment for order <Math>{"i"}</Math> and <Math>{"G_i"}</Math> is the cumulative value accumulator snapshot at order <Math>{"i"}</Math>. The kernel&rsquo;s conservation law states that <Math>{"\\pi_{s,i} + \\pi_{b,i} = C_{s,i} + C_{b,i}"}</Math> for every order: the total distributed equals the total locked.
                </p>
                <p>
                    The accounting argument that follows depends specifically on Mechanism&nbsp;2 of the primitive &mdash; buyer dominance with atomic resolution. Mechanism&nbsp;1 (asymmetric bonding) supplies the balance-sheet positions during process life; Mechanism&nbsp;2 supplies the period-close, since atomic resolution is what guarantees that every active order in the process settles in a single moment. A non-atomic resolution would yield partial closes that are not period-closes in the accounting sense, and the self-closing-ledger-period claim below would not survive.
                </p>
                <p>
                    We claim this structure is equivalent to a self-closing ledger period in the accounting sense. We proceed in three steps.
                </p>
                <PaperSubsection title="5.1 The contract state as a balance-sheet position">
                    <p>
                        At any time <Math>{"t"}</Math> during the life of a process, the contract holds an escrow balance equal to the sum of all active bonds: <Math>{"\\sum_i 2G_i"}</Math> in seller bonds (one per committed order) plus <Math>{"\\sum_i 2P_i"}</Math> in buyer bonds (one per committed order). This balance is a liability of the contract toward the parties: each buyer&rsquo;s bond is a liability toward that buyer; each seller&rsquo;s bond is a liability toward that seller; together with the obligation to pay the seller&rsquo;s payment at resolution, the contract&rsquo;s liabilities at any time during process life sum to exactly the assets it holds.
                    </p>
                    <div className="border-l-2 border-default pl-6 my-2 space-y-3">
                        <p className="text-sm font-semibold text-ink-heading">Definition 5.1 (Custodial Ledger Identity).</p>
                        <p>
                            At any reachable state of the contract, for a given process <Math>{"\\Pi"}</Math>, the escrowed custody balance attributable to <Math>{"\\Pi"}</Math> equals the aggregated claim of the process&rsquo;s counterparties against the contract:
                        </p>
                        <div className="my-3 overflow-x-auto">
                            <Math display>{"\\text{custody}(\\Pi, t) \\;=\\; \\sum_{i \\in \\text{active}(\\Pi)} (C_{s,i} + C_{b,i}) \\;=\\; \\sum_{i \\in \\text{active}(\\Pi)} \\bigl(\\pi_{s,i}^{\\text{committed}} + \\pi_{b,i}^{\\text{committed}}\\bigr)."}</Math>
                        </div>
                    </div>
                    <p>
                        This is the bookkeeping identity in escrow-accounting form &mdash; the same algebraic shape that lawyers&rsquo; trust accounts, IOLTA arrangements, and AICPA-standard custody accounts use to keep client funds segregated from the custodian&rsquo;s own books. Assets held equal liabilities owed. The contract is not an economic entity in its own right; it is a custodian whose position reconciles to zero net at all times.
                    </p>
                    <p>
                        The buyers and sellers in this identity are wallets representing real-world assets, with the wallet, the asset, and the seller distinct in ways that matter when the identity is read at scale; Section 8 canonicalises that apparatus and shows how treasury sellers compose it. The present section&rsquo;s identity holds independently of the wallet&rsquo;s institutional shape behind the address.
                    </p>
                </PaperSubsection>
                <PaperSubsection title="5.2 Commits as journal entries; resolution as closing entries">
                    <p>Each commitment produces a journal entry of the form:</p>
                    <ul className="space-y-1 list-disc pl-6 text-sm">
                        <li>Debit: <em>Custody &mdash; buyer <Math>{"B"}</Math> bond</em> &nbsp; <Math>{"+\\, 2P_i"}</Math></li>
                        <li>Debit: <em>Custody &mdash; seller <Math>{"S_i"}</Math> bond</em> &nbsp; <Math>{"+\\, 2G_i"}</Math></li>
                        <li>Credit: <em>Liability to <Math>{"B"}</Math> (refund obligation)</em> &nbsp; <Math>{"+\\, 2P_i"}</Math></li>
                        <li>Credit: <em>Liability to <Math>{"S_i"}</Math> (payout obligation)</em> &nbsp; <Math>{"+\\, 2G_i"}</Math></li>
                    </ul>
                    <p>
                        The journal entry balances by construction (debits = credits). The kernel records it as a commitment event &mdash; indexed by seller and by currency &mdash; with a cryptographic signature from each party and a block timestamp.
                    </p>
                    <p>Resolution produces, for each active order, a closing entry on the custodian&rsquo;s (i.e., the kernel&rsquo;s) books:</p>
                    <ul className="space-y-1 list-disc pl-6 text-sm">
                        <li>Debit: <em>Liability to <Math>{"S_i"}</Math></em> &nbsp; <Math>{"+\\, (2G_i + P_i)"}</Math></li>
                        <li>Debit: <em>Liability to <Math>{"B"}</Math></em> &nbsp; <Math>{"+\\, P_i"}</Math></li>
                        <li>Credit: <em>Custody &mdash; seller <Math>{"S_i"}</Math> bond</em> &nbsp; <Math>{"2G_i"}</Math></li>
                        <li>Credit: <em>Custody &mdash; buyer <Math>{"B"}</Math> bond</em> &nbsp; <Math>{"2P_i"}</Math></li>
                    </ul>
                    <p>
                        The closing entries zero out all custodial accounts and liability accounts for the process. The contract returns to zero position with respect to this process, and the process itself is marked resolved.
                    </p>
                    <p>
                        These are the <em>custodian&rsquo;s</em> entries. The contracting parties&rsquo; own books, which run in parallel, do not close to zero &mdash; the resolution moves <Math>{"P_i"}</Math> from the buyer&rsquo;s books (where it was a deposit / asset against the custodian) into the seller&rsquo;s books, where it lands as revenue under the applicable revenue-recognition standard. The seller&rsquo;s <Math>{"2G_i"}</Math> component is bond returned &mdash; an asset reclassification (cash equivalent ex-custody back to cash equivalent in-wallet) with no P&amp;L impact. Symmetrically, the buyer&rsquo;s <Math>{"2P_i"}</Math> bond returns as an asset reclassification. The custodian&rsquo;s books closing to zero is the period-close; the parties&rsquo; books continue, with the period&rsquo;s net economic result &mdash; revenue earned, expense incurred &mdash; captured at the resolution moment in the parties&rsquo; own classification.
                    </p>
                </PaperSubsection>
                <PaperSubsection title="5.3 Supporting documentation and the complete record">
                    <p>The accounting record of a process consists of:</p>
                    <ul className="space-y-2 list-disc pl-6 text-sm">
                        <li><em>Journal entries</em>: the commitment and resolution events. Timestamped, signed, content-addressed, publicly verifiable.</li>
                        <li><em>Supporting documentation</em>: the bound agreement&rsquo;s hash carried by each commitment, which binds both parties to a specific off-chain document (contract text, specification, order details). The document&rsquo;s content can be anything the parties choose; the hash proves which document is at issue.</li>
                        <li><em>Contemporaneous lifecycle evidence</em>: clause-typed attestations emitted during process life (proximity proofs, handoff attestations, quality disclosures, lifecycle-stage transitions). These are the analogue of working papers and supporting receipts in conventional accounting. Their class (settlement byproduct vs. discretionary attestation) matters for evidentiary weight; Section 9 treats this.</li>
                    </ul>
                    <p>
                        Together, these constitute a complete and contemporaneously produced accounting record for the process, from opening through resolution. No party maintains additional books; the record is complete without them.
                    </p>
                </PaperSubsection>
                <PaperSubsection title="5.4 Reconstruction">
                    <p>
                        The complete kernel state of a process is recoverable by a deterministic replay of the events &mdash; the equivalent of a universal trial-balance generator: any reader with read access to the chain can reconstruct the complete ledger state of any process, at any historical moment, without any party&rsquo;s cooperation. The reconstruction is verifiable against the chain and depends on no off-chain record beyond the documents the bound agreements&rsquo; hashes reference.
                    </p>
                    <PaperRun title="Cohort-compensation transactions and their accounting.">
                        The buyer&rsquo;s leverage during process life is the bond pool locked across every commitment. When something goes wrong &mdash; a defective unit, a missed delivery, a quality slip &mdash; the buyer can withhold resolution while the seller cohort negotiates compensation directly. The pattern that emerges is that the unit at fault transfers tokens to the buyer (or to other co-sellers who absorb the cost) to make the buyer whole enough to resolve. These compensation transfers are real transactions that land on chain during the process&rsquo;s open window, before resolution.
                    </PaperRun>
                    <p>
                        For the accountant, three classification questions arise. First, the failing seller&rsquo;s transfer to the buyer is typically variable consideration under ASC&nbsp;606 / IFRS&nbsp;15 (FASB, 2014; IASB, 2014) &mdash; a refund or rebate that reduces the seller&rsquo;s revenue, recognised at the moment of the compensation transfer rather than at process resolution. Second, a transfer between co-sellers (one seller helping another stay whole during the negotiation) may be a related-party transaction, a loan, a contribution to a joint-and-several arrangement, or a fee for risk-pooling services; the substance depends on the agreement the parties have signed and the relationships the agreement describes. Third, the buyer&rsquo;s receipt of compensation: if it offsets a prior payment, it reduces the buyer&rsquo;s recorded cost; if it exceeds the prior payment, the excess may be other income.
                    </p>
                    <p>
                        The kernel records the transfers; the substance is classification work the accountant performs against the agreement and the economic relationship it describes. The mechanism producing these transactions &mdash; buyer dominance plus atomic resolution operating on a cohort with shared bond fate &mdash; is the same one that produces joint-liability behaviour in microfinance contexts, here induced by the bond architecture rather than by social substrate.
                    </p>
                    <PaperRun title="The period-end property.">
                        When a process resolves, its ledger period closes. All custodial balances for the process return to zero; all liabilities are discharged; all payments have flowed to their recipients. The process-specific ledger ceases to have active entries. Records remain on chain indefinitely &mdash; the audit trail does not disappear &mdash; but no further transactions occur against the closed ledger. This is the period-end property of conventional accounting: the books for the period are finalized and archived; the next period&rsquo;s books open anew.
                    </PaperRun>
                </PaperSubsection>
            </PaperSection>

            <PaperSection title="6. What Stops Being Necessary">
                <p>
                    We enumerate the classes of professional work that become unnecessary for economic activity that settles through Figaro processes. &ldquo;Unnecessary&rdquo; means: the work performs a function that the protocol performs equivalently or better at zero marginal cost. It does not mean: the work is valueless, nor that practitioners lose their livelihoods overnight.
                </p>
                <PaperRun title="Bookkeeping as record-keeping.">
                    The classical bookkeeping function &mdash; maintaining journals, posting to ledgers, reconciling sub-ledgers to the general ledger, periodic trial-balance runs &mdash; is protocol byproduct for activity that settles through Figaro processes. No party needs to maintain this record because the protocol maintains it, and any reader can reconstruct it. The labor historically performed by bookkeepers in recording transactions into account structures is done by the event log, the content-addressing, and the deterministic replay of the events.
                </PaperRun>
                <PaperRun title="Period-end close.">
                    The conventional period-end procedure &mdash; posting adjusting entries, preparing trial balance, reconciling bank statements, running the closing entries &mdash; is performed automatically when a process resolves. Every commitment in the process has definite amount and timing, every receipt and disbursement has a chain-recorded counterparty, no reconciliation step is required against records the kernel itself produces, and no closing adjustments are needed beyond the resolution itself.
                </PaperRun>
                <p>
                    This applies <em>within</em> a process. At the entity-period level, the wallet&rsquo;s seller may run dozens or thousands of processes per fiscal quarter; revenue-recognition timing across those processes (when the performance obligation is satisfied under ASC 606 / IFRS 15, whether revenue lands at commitment or at resolution, how multi-process arrangements are unbundled) is interpretive accrual work the kernel does not discharge. The chain produces the dated cash-flow record; mapping that to the entity&rsquo;s reporting period under the applicable framework remains the controller&rsquo;s responsibility.
                </p>
                <PaperRun title="Internal audit of the records.">
                    The internal-audit function that verifies the firm&rsquo;s own books against supporting documentation and transaction records is subsumed: the records and the documentation are on the same chain, linked by content hashes, with cryptographic authentication of signatures and block timestamps. There is nothing to verify because there is no second record to reconcile against.
                </PaperRun>
                <PaperRun title="External audit of records-to-records correspondence.">
                    The external-audit function in its narrowest sense &mdash; verifying that the firm&rsquo;s reported position reconciles to its underlying records &mdash; relocates rather than vanishes. There is no &ldquo;reported position&rdquo; separate from the chain that needs records-to-records reconciliation; the chain is the primary record from which any reported position derives. The audit function that attested to records-to-records correspondence is structurally inapplicable. What replaces it is wallet-control attestation (verifying that the entity&rsquo;s claimed wallets are the wallets the entity actually controls, and that off-chain narrative classification of receipts and disbursements faithfully maps to the on-chain log) &mdash; treated under Section 7.
                </PaperRun>
                <PaperRun title="Disputes over what the books say.">
                    Commercial-law disputes whose subject matter is what the books say or should have said &mdash; was this expense recorded, was that liability disclosed, did revenue recognition occur at the right moment by the firm&rsquo;s own criteria &mdash; become moot for Figaro-process activity. The chain is the record; disagreements about its content are about interpretation, not about existence.
                </PaperRun>
            </PaperSection>

            <PaperSection title="7. What Continues">
                <p>
                    The professional work that continues is the work that was never really about bookkeeping. Three categories in particular.
                </p>
                <PaperRun title="Judgment about what records mean.">
                    Revenue recognition under ambiguity (has the performance obligation been satisfied?), going-concern assessment (is the entity a going concern?), fair-value assessment (what is this asset or liability worth?), impairment judgments, and the full range of <em>interpretive</em> accounting work remain genuinely human. The protocol records what happened; it does not determine how what happened should be interpreted under a particular accounting framework. The interpretive frameworks that the protocol does not displace are precisely the ones codified in current professional standards: ASC&nbsp;606 / IFRS&nbsp;15 on revenue recognition, IFRS&nbsp;13 on fair-value measurement, ISA&nbsp;315 (revised) and AICPA AU-C&nbsp;315 on understanding the entity and assessing risks of material misstatement, and sector-specific tax codes (AICPA, 2020; FASB, 2014; IASB, 2014). A wallet cohort that has received <Math>{"N"}</Math> florins via staged merkle airdrop has a record that this happened; whether those tokens constitute revenue, a capital contribution, an airdrop deemed non-recognition-triggering, or something else depends on interpretive work governed by these standards and requiring human judgment.
                </PaperRun>
                <PaperRun title="Translation for non-technical readers.">
                    Narrative management discussion and analysis (MD&amp;A), executive summaries of financial position for boards and external stakeholders, regulatory filings in jurisdictional formats, and the preparation of non-technical explanations of technical financial positions remain professional work. The chain is complete but unreadable to most intended audiences; the accountant or auditor becomes, in this residual function, a translator rather than a record-keeper.
                </PaperRun>
                <PaperRun title="Audit of the relation between records and reality.">
                    The most substantive remaining audit function is verifying that on-chain records correspond to real-world performance. Did the cook actually prepare the food? Did the courier actually deliver it? Did the attested emissions disclosure actually reflect the measured quantity? These questions ask whether the on-chain record is a faithful representation of off-chain reality. The protocol cannot answer them; it can only record what was signed. The professional standards distinguish the substantive audit assertions explicitly: AICPA AU-C&nbsp;500 separates <em>existence</em> (the asset or transaction is real), <em>accuracy of recording</em> (it was recorded faithfully), <em>valuation and allocation</em> (it is recorded at appropriate amounts), <em>rights and obligations</em> (the entity holds the rights or controls the obligation), <em>completeness</em> (all transactions that should have been recorded are recorded), <em>cutoff</em> (transactions are recorded in the correct period), and <em>classification</em> (transactions are recorded in the appropriate accounts) (AICPA, 2020).
                </PaperRun>
                <p>
                    The bonded process discharges <em>accuracy of recording</em> by construction &mdash; the kernel cannot record what was not signed, and what was signed is recorded immutably. The other six assertions remain substantive audit work, with the burden distributed differently than under conventional bookkeeping:
                </p>
                <ul className="space-y-2 list-disc pl-6 text-sm">
                    <li><em>Existence</em> is the on-chain-to-off-chain correspondence question above &mdash; did the substantive economic event the records describe actually occur?</li>
                    <li><em>Valuation and allocation</em> remains interpretive &mdash; fair value, impairment, depreciation, and similar measurement decisions are not what the chain records.</li>
                    <li><em>Rights and obligations</em> relocates to wallet control &mdash; does the entity actually control the wallet that holds the asset, and does the wallet&rsquo;s holding actually represent the entity&rsquo;s economic claim? This is a new audit surface specific to the bonded regime.</li>
                    <li><em>Completeness</em> relocates to the boundary between on-chain and off-chain activity &mdash; are there transactions the entity engaged in that should have been on-chain but were not, and is the chain&rsquo;s record of the entity&rsquo;s activity comprehensive within the relevant scope?</li>
                    <li><em>Cutoff</em> reduces to within-process clarity (the process resolution moment is unambiguous) but rises again at the entity-period boundary, where the question is which processes&rsquo; resolutions fall within the reporting period under the applicable framework.</li>
                    <li><em>Classification</em> is interpretive: addresses are not chart-of-accounts categories, and an entity&rsquo;s receipts and disbursements still need to be classified as revenue, expense, capital movement, or financing event under the applicable framework. The chain produces the cash-flow record; classification is professional work.</li>
                </ul>
                <p>
                    The post-Pacioli audit profession&rsquo;s core function becomes the substantive assertion work the records have never been able to do alone, with accuracy of recording discharged by the protocol and the other assertions distributed across new and familiar surfaces.
                </p>
                <PaperRun title="Regulatory compliance ahead of regulatory catch-up.">
                    Tax law, securities law, and sector-specific regulation assume conventional books. For an extended period &mdash; probably decades &mdash; firms operating on Figaro processes will need to produce conventional financial statements from their on-chain records to satisfy regulatory requirements. This translation work is a professional function. Eventually regulation may update to reference chain state directly; in the interim, the accountant&rsquo;s role includes producing traditional outputs from non-traditional inputs.
                </PaperRun>
                <PaperRun title="A worked projection: the European e-invoice norm.">
                    The translation can be made concrete. EN&nbsp;16931-1:2017 (CEN, 2017) defines the <em>semantic data model</em> of the core electronic invoice &mdash; not a file format, but the meaning and cardinality of an invoice&rsquo;s information elements, serialised into one of two permitted syntaxes (OASIS UBL&nbsp;2.1 or UN/CEFACT CII). It is the model that Directive&nbsp;2014/55/EU obliged European public bodies to accept; the &ldquo;VAT in the Digital Age&rdquo; package (adopted 11&nbsp;March&nbsp;2025) makes an EN&nbsp;16931-conformant structured invoice the definition of an EU e-invoice for intra-Community transactions from 2030 &mdash; regulation moving, as this section anticipated, toward machine-readable structured records rather than away from them. A settled Figaro process <em>projects</em> onto that model. The projection is a runtime-tier serialisation, not a kernel property, and it sorts the invoice&rsquo;s elements into two classes that recover precisely the byproduct-versus-interpretive split this paper has drawn throughout.
                </PaperRun>
                <p>The first class &mdash; the intrinsic commercial elements &mdash; falls out of the settlement record as byproduct:</p>
                <div className="my-4 overflow-x-auto">
                    <table className="text-sm border-collapse">
                        <thead>
                            <tr>
                                <th className="border border-default px-3 py-1.5 text-left font-semibold text-ink-heading">EN 16931 core element</th>
                                <th className="border border-default px-3 py-1.5 text-left font-semibold text-ink-heading">Recovered from the process as</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr><td className="border border-default px-3 py-1.5">Invoice number (BT-1)</td><td className="border border-default px-3 py-1.5">the commitment digest / order hash</td></tr>
                            <tr><td className="border border-default px-3 py-1.5">Issue date (BT-2)</td><td className="border border-default px-3 py-1.5">the resolution event&rsquo;s block timestamp</td></tr>
                            <tr><td className="border border-default px-3 py-1.5">Invoice type code (BT-3)</td><td className="border border-default px-3 py-1.5">projection constant (commercial invoice, code 380)</td></tr>
                            <tr><td className="border border-default px-3 py-1.5">Invoice currency (BT-5)</td><td className="border border-default px-3 py-1.5">the process currency (single-denomination per process)</td></tr>
                            <tr><td className="border border-default px-3 py-1.5">Seller (BG-4, BT-27)</td><td className="border border-default px-3 py-1.5">the seller wallet address</td></tr>
                            <tr><td className="border border-default px-3 py-1.5">Buyer (BG-7, BT-44)</td><td className="border border-default px-3 py-1.5">the root-buyer wallet address</td></tr>
                            <tr><td className="border border-default px-3 py-1.5">Invoice lines (BG-25, BT-131)</td><td className="border border-default px-3 py-1.5">the sub-orders &mdash; each commitment&rsquo;s payment <Math>{"P_i"}</Math> with the description its bound agreement carries</td></tr>
                            <tr><td className="border border-default px-3 py-1.5">Sum of Invoice line net amount (BG-22, BT-106)</td><td className="border border-default px-3 py-1.5"><Math>{"\\sum_i P_i"}</Math> across the process&rsquo;s orders</td></tr>
                        </tbody>
                    </table>
                </div>
                <p>
                    The second class &mdash; the tax elements &mdash; does not fall out, and cannot: seller VAT identifier (BT-31), the VAT breakdown (BG-23), category code (BT-118), rate (BT-119), tax point date (BT-7), tax representative (BG-11), and the VAT-inclusive total (BT-112). These presuppose a VAT-registered entity in a particular regime. The model itself treats them as <em>conditional</em> rather than unconditional: BT-31 has cardinality 0..1, and rule BR-S-02 makes it conditional &mdash; when an invoice line is standard-rated for VAT, the invoice must carry the Seller VAT identifier (BT-31), the seller tax registration identifier (BT-32), or the seller tax representative VAT identifier (BT-63). The tax apparatus attaches when, and only when, the entity is inside a taxable regime; for a transaction that is not, the intrinsic class above is already a complete core invoice. That conditional trigger is exactly the jurisdiction-specific registration status the kernel does not hold and the assembly graph does: an EU-jurisdiction assembly supplies BT-31 and the VAT breakdown from the seller&rsquo;s registration data, and the kernel supplies the rest as byproduct.
                </p>
                <p>
                    This is the same move the paper makes for GASB&rsquo;s tax-versus-fee distinction and for ASC&nbsp;606 revenue timing: the kernel produces the structured record; the jurisdiction-specific interpretation attaches above it. EN&nbsp;16931 is named here because it is the most fully specified invoice norm, not because the kernel is European &mdash; it is one jurisdiction&rsquo;s model, and the same byproduct projects onto other jurisdictions&rsquo; invoice models with their own conditional tax fields. The projection reaches the <em>core</em> model; national profiles (XRechnung, Peppol BIS) add further mandatory fields the same way, from graph-tier configuration rather than from the kernel.
                </p>
                <PaperRun title="One decomposition, three presentations.">
                    The line-item structure the projection recovers is not a further artifact the protocol must separately produce &mdash; it is the same itemized record the buyer approves at the point of sale and the same record an auditor reads. The sub-orders of a process <em>are</em> its cost lines: each is a real-world asset&rsquo;s contribution to the service the buyer purchased, tangible or intangible alike (an airframe&rsquo;s flight-hour, a fuel volume, a crew duty-period, a landing slot, a maintenance allocation, a brand). What the buyer sees at checkout, what the audit trail exposes order by order, and what the invoice serialises are three presentations of one self-closing ledger period. The conventional apparatus produced these as three systems &mdash; a point-of-sale record, an audit file, an invoice &mdash; and reconciled them after the fact; here they are one record read three ways.
                </PaperRun>
            </PaperSection>

            <PaperSection title="8. Wallets, Real-World Assets, and Treasury Composition">
                <p>
                    The self-closing-ledger property the previous sections developed is a property of every process. To use the property at scale we need to be precise about what a participant in a process actually is.
                </p>
                <PaperRun title="Wallets represent real-world assets.">
                    Every party to a Figaro process is a wallet, and what each wallet <em>represents</em> is a real-world asset (RWA) with productive, commercial value. The wallet is not a balance-sheet representation of the asset &mdash; the asset remains on the entity&rsquo;s balance sheet at its carrying value, under the applicable measurement basis, exactly as before. The wallet is a <em>signing apparatus and token-holding pocket</em> through which the asset transacts: it holds the asset&rsquo;s on-chain earnings (typically as token balances in the denominations the asset transacts in), holds NFT pointers to the off-chain credentials, certificates, or licences the asset&rsquo;s participation requires, and produces the EIP-712 signatures that bind the asset to bonded commitments.
                </PaperRun>
                <p>
                    The asset itself is off-chain by definition &mdash; a piece of physical capital (an aircraft, a delivery van, a landing slot, a kitchen, a server), a credentialed individual (a pilot, a courier, a maintenance engineer, a doctor), a public service (a security checkpoint, a customs clearance, a road network), or any other commercial-value unit whose participation in a process needs an on-chain handle. The wallet does not contain the asset; it represents the asset&rsquo;s participation in the markets the asset operates in.
                </p>
                <p>
                    <em>Worked example.</em> An airline holds an aircraft on its balance sheet at, say, $40M depreciated cost. The aircraft&rsquo;s wallet holds USDC receipts from charter and ticket-share arrangements, plus NFTs pointing to the airworthiness certificate, the engine maintenance log, and the operating permit. The USDC balance is cash equivalent in the entity&rsquo;s hands &mdash; the same accounting category as a bank balance, not a re-representation of the aircraft. The aircraft remains the asset; the wallet is the cash-equivalent + signing-instrument through which the aircraft earns and contracts.
                </p>
                <PaperRun title="Three layers: asset, wallet, seller.">
                    Three layers must be kept distinct. The <em>asset</em> is the off-chain real-world asset whose participation produces value. The <em>wallet</em> is the on-chain representation of that participation: an address, the tokens and NFTs it holds, the signatures it can produce. The <em>seller</em> is the human or autonomous agent who controls the wallet&rsquo;s signing key on the asset&rsquo;s behalf. The kernel sees only the wallet; the seller-acts-for-asset relationship is below the kernel&rsquo;s resolution and lives in the off-chain stack the seller runs. A wallet is an active counterparty in an assembly iff the underlying asset is alive and its credentials are current; that conditional is maintained operationally by the seller and verified at agreement signing through whichever credential clauses the assembly designer composes, not by the kernel.
                </PaperRun>
                <PaperRun title="The going-concern condition.">
                    A wallet sustains its participation in the same sense a business sustains its operation under the going-concern assertion (ISA&nbsp;570 / AICPA AU-C&nbsp;570; AICPA, 2020): receipts from on-chain participation must, in aggregate over time, cover the asset&rsquo;s off-chain operating expenses (fuel, parts, labour, premises, regulatory fees, capital amortisation), or the seller ceases bonding the wallet into processes and the wallet drops out of the market it serves. The kernel does not enforce going-concern; the market does, through ordinary rational exit. The accounting consequence is that the chain produces a complete record of the asset&rsquo;s on-chain receipts and disbursements &mdash; the cash-flow record from which any going-concern assessment of the asset&rsquo;s market participation derives &mdash; with the period-closing property the prior sections developed. The going-concern assertion itself remains the auditor&rsquo;s work, performed against the chain&rsquo;s record plus whatever off-chain information is relevant.
                </PaperRun>
                <PaperRun title="Public-authority wallets are RWA-as-wallet too.">
                    The same definition covers government services that today move through tax-and-appropriation channels. A security-screening authority&rsquo;s wallet collecting per-passenger screening fees, an airport authority&rsquo;s wallet collecting gate-use fees, a road-authority wallet collecting per-mile charges: each is the on-chain representation of a real-world service whose continued operation requires receipts that cover its expenses (personnel, equipment, premises, capital amortization). The kernel does not distinguish between a &ldquo;tax&rdquo; and a &ldquo;fee for service&rdquo;; both are payments to a service-providing wallet whose participation in the assembly costs the buyer the same way any other commitment does. Whether the underlying authority&rsquo;s revenue is regulated as taxation, charged as a user fee, or appropriated from a general budget is an off-chain regulatory question; mechanically the kernel sees a wallet that committed and a payment that flowed. This brings public-authority participation into the self-closing-ledger framework on the same footing as commercial participation at the settlement layer. The interpretive layer still distinguishes: GASB&nbsp;33 (Accounting and Financial Reporting for Nonexchange Transactions) and GASB&nbsp;34 (Basic Financial Statements for State and Local Governments) (GASB, 1998; GASB, 1999) treat tax revenue and fee-for-service revenue under different rules, and that distinction continues to operate against the chain&rsquo;s record. The kernel does not encode the distinction; the accounting framework still does.
                </PaperRun>
                <PaperRun title="Treasury composition patterns.">
                    Below the wallet sits the seller. The seller can be a single human with a single key, or any of several institutional shapes that decide how a wallet&rsquo;s signing apparatus is composed. The kernel reads a wallet, an EIP-712 signature, and a bond; the buyer is an EOA, and the internal governance of the signing key is invisible to the settlement layer and irrelevant to the ledger-period guarantee. One consequence should be stated plainly: a lost buyer key strands the bonds, with no timeout or recovery path, so a treasury that cannot tolerate that loss runs the buyer key under a threshold-signing or guardian-recovery scheme. Four composition patterns cover how on-chain treasuries (and RWA-as-wallet sellers more generally) drive bonded commitments in practice:
                </PaperRun>
                <ul className="space-y-2 list-disc pl-6 text-sm">
                    <li><em>Multi-party control of the buyer key.</em> Signing authority is distributed over the key itself &mdash; threshold signing across a committee, or a designated signer under whatever off-chain authorization the treasury&rsquo;s governance requires &mdash; presenting a single buyer wallet to the settlement layer. However the signing authority is composed, the period closes at resolution.</li>
                    <li><em>Governance vote as authorization.</em> A DAO vote authorizes a commitment (Compound, 2020; OpenZeppelin, 2024); how the signature was authorized &mdash; token-weighted, quadratic, optimistically passed &mdash; is invisible to the settlement layer. The DAO&rsquo;s accounting treatment of the disbursement (revenue, grant, capital contribution) is the interpretive work Section 7 discusses; the closing of the ledger period is automatic at resolution.</li>
                    <li><em>Streaming upstream of commitment.</em> A streaming contract (Sablier, 2023; Superfluid, 2023) drips payment continuously to an intermediary buyer wallet that commits discrete bonded processes as specific work is contracted. Each bonded process is a closed period nested inside the stream&rsquo;s continuous flow &mdash; the flow is the parent stock movement, the bonded periods the discrete journal entries against it &mdash; and the two compose without either accounting model bending.</li>
                    <li><em>Bookkeeping from chain state.</em> Accounting tooling reads chain state directly: every commitment and resolution event pair is a complete disbursement record &mdash; the parties, the amount, the clause identifiers, the bound agreement&rsquo;s hash, the cumulative position &mdash; requiring no reconciliation against a separate institutional ledger. The AU-C&nbsp;500 existence work remains; the accuracy-of-recording work is discharged by the protocol.</li>
                </ul>
                <PaperRun title="Operational constraints the patterns inherit.">
                    The patterns inherit four constraints from the bonded primitive. <em>Counterparty bond:</em> every process requires the seller to post the <Math>{"2G"}</Math> bond against the cumulative value of upstream commitments, so a treasury must choose counterparties that can post bond. <em>No clawback after resolution:</em> settlement is terminal; milestone-gated disbursement is achieved by committing a sequence of smaller processes against successive deliverables, not by reversal &mdash; the same finality the closing entry of double-entry bookkeeping has always exhibited. <em>No kernel-level arbitration:</em> the kernel produces evidence; the agreement names the forum that adjudicates disputes off-chain (Section 9 develops the evidentiary register). <em>Public visibility of participation:</em> the agreement text stays off chain (only the bound agreement&rsquo;s hash is public), but which wallets committed, against whom, for what cumulative value is visible; treasuries that require confidential disbursement compose a confidentiality layer above the protocol or use a different substrate &mdash; though most treasury disbursement is already disclosed by accounting practice or regulatory requirement.
                </PaperRun>
                <PaperRun title="What the patterns add to the accounting argument.">
                    These are the standard institutional shapes already in use in DAO and treasury operations (Messari, 2022; DeepDAO, 2024). Composed with the self-closing-ledger property, they give the treasury a complete chain-derivable accounting record for the portion of its activity disbursed through bonded processes, with the ledger periods closing automatically at each resolution &mdash; the audit and reporting functions for that activity become chain-state-reading functions rather than book-keeping functions.
                </PaperRun>
            </PaperSection>

            <PaperSection title="9. Admissibility, Primacy, and the Two Classes of Record">
                <p>
                    The bonded record is more than evidentiary: it is <em>constitutive</em> of the accounting record for the process it describes. The distinction matters in two registers.
                </p>
                <PaperRun title="Admissibility vs. primacy.">
                    On-chain records are admissible as evidence under eIDAS, the UCC, UNCITRAL frameworks, and analogous regimes elsewhere. The admissibility question asks whether the record can be introduced in a proceeding and weighed. The primacy question asks whether the record is <em>the</em> account of the economic activity or merely <em>an</em> account of it. For Figaro processes, the on-chain record is the primary account from which other accounts derive; no other account exists unless a party chooses to maintain one separately. In a dispute about what the accounting record of a process says, the chain is not corroborating evidence for party-held books; party-held documents are summaries or translations of the record the chain produces.
                </PaperRun>
                <PaperRun title="Two classes of record.">
                    The bonded record divides naturally into two classes that carry different evidentiary weight.
                </PaperRun>
                <p>
                    <em>Settlement-byproduct records</em> are produced mechanically by the bonding game &mdash; commitment digests, bond deposits, the cumulative-value accumulator state, resolution events. They are emitted by the settlement layer &mdash; with clause typing supplied by the agreement above it &mdash; cryptographically authenticated, and self-verifying by construction. In the accounting register they are the primary ledger entries: journal and closing entries that no party can alter ex post.
                </p>
                <p>
                    <em>Discretionary attestation records</em> are produced voluntarily by self-interested parties &mdash; proximity proofs, handoff attestations, lifecycle-stage transitions, quality disclosures. These are evidentiary artifacts <em>about</em> the underlying settlement; they require clause validation but remain attestations, not byproducts. In the accounting register they are supporting documentation: working papers, evidentiary exhibits, operational attestations.
                </p>
                <p>
                    Both classes are part of the complete accounting record. An audit that tests the records against real-world performance (Section 7 above) is primarily an audit of the discretionary class, since the byproduct class is self-verifying by construction.
                </p>
            </PaperSection>

            <PaperSection title="10. Scope and Limitations">
                <p>
                    The paper&rsquo;s argument is bounded in three ways that we state explicitly to preempt predictable misreadings.
                </p>
                <PaperRun title="The EN&nbsp;16931 projection is a mapping, not a compliance claim.">
                    It shows the core invoice model is recoverable from the settlement record plus jurisdiction-supplied tax data &mdash; not that a Figaro process is by itself a compliant e-invoice or discharges any filing obligation.
                </PaperRun>
                <PaperRun title="The argument does not claim the chain is infallible.">
                    The on-chain record is only as reliable as the chain&rsquo;s consensus and the cryptographic primitives underneath. A chain reorganization that unwinds finalized state, a signature-scheme break, or a validator-level censorship event could all compromise the accounting record. These risks exist and are not new. What is new is that they are concentrated at the chain layer rather than distributed across party-held books; whether that is a net improvement depends on the relative reliability of the two regimes.
                </PaperRun>
                <PaperRun title="Key custody is a first-order audit surface.">
                    If the wallet is the books, key compromise is books compromise. The Pacioli equivalent is the safe holding the journal: physical and IT controls, segregation of duties, authorisation matrices. Under the bonded composition the analogous control surface is IT general controls (ITGCs) over key custody &mdash; multisig thresholds, hardware-security-module custody, key-rotation procedures, signer-set governance, recovery procedures. ITGCs over key custody become a first-order concern for any audit of an entity operating on-chain. This is not a new audit assertion (it sits within existing IT-control frameworks such as COSO and COBIT) but it is a relocated emphasis: where the conventional regime puts its control weight on records-against-records reconciliation, the bonded regime puts it on key-control attestation.
                </PaperRun>
            </PaperSection>

            <PaperSection title="11. Conclusion">
                <p>
                    Pacioli (1494) solved a specific problem: how to make the position of an opaque economic entity legible over time. The solution was double-entry bookkeeping, and the apparatus built on top of it &mdash; bookkeepers, accountants, auditors, commercial lawyers, tax preparers &mdash; is one of the defining professional formations of the modern economy. The apparatus solves the problem it was designed for.
                </p>
                <p>
                    The Figaro settlement primitive solves a different version of the same problem at a different layer: it makes the position of a process-scoped economic event transparent at the protocol layer, as the byproduct of ordinary operation. The parties do not need to maintain books because the protocol constitutes the books &mdash; the self-closing ledger period Section 5 derives &mdash; and a deterministic replay of the events makes the complete record accessible to any reader without cooperation from the parties, with the records persisting on chain indefinitely.
                </p>
                <p>
                    The consequence is that a specific class of accounting work &mdash; record-keeping, reconciliation, period-end closing, audit of the records themselves &mdash; becomes protocol byproduct rather than professional service. What remains professional is genuinely interpretive and human: judgment about what records mean, translation for non-technical audiences, and the audit function that tests the relation between records and real-world performance.
                </p>
                <PaperRun title="The third inflection.">
                    Pacioli made entity-tracking possible (1494). Nakamoto (2008) and Buterin (2014) made settlement distributed (2008&ndash;2015). The Figaro primitive makes records process-scoped and self-closing (2026). Each inflection reduces a specific apparatus from necessary to optional for the class of activity it covers, leaving the rest intact. The accounting profession is at the beginning of absorbing the third inflection. The present paper is an attempt to describe what it entails before the debate becomes muddied by the usual overpromising of blockchain-accounting claims and the usual under-appreciation of what specifically has changed.
                </PaperRun>
                <PaperRun title="A note on what is gained.">
                    We have written mostly about what is no longer necessary. It is worth stating what is gained. The accounting apparatus described in Section 2 costs substantial fractions of firm overhead and imposes substantial compliance costs on participants. The apparatus is also a gating function: small firms and individual participants who cannot afford professional accounting are partially excluded from certain forms of economic activity (formal contracts, audited transactions, disclosures that require an attestor). A protocol that produces the accounting record as a byproduct of ordinary settlement makes the record available to participants who could not otherwise have afforded it. This is a distributional effect: accounting infrastructure becomes available at the protocol layer to participants who previously faced the full cost of the apparatus. Smaller economic units, participants in jurisdictions without strong accounting-profession infrastructure, and machine and agent-led economic activity whose scale does not justify an accountant all gain access to audit-grade records as a byproduct of settlement.
                </PaperRun>
            </PaperSection>
        </PaperLayout>
    );
}
