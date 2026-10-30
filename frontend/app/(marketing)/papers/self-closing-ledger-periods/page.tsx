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

export const metadata: Metadata = withOg({
    title: "Bookkeeping as Protocol Byproduct — Figaro Protocol",
    description:
        "A bonded process is a self-closing ledger period: an accounting entity with identically zero equity, whose commitments are its journal entries and whose buyer's single atomic resolution is its closing entry, zeroing every account it opened. Bookkeeping becomes protocol byproduct; interpretive accounting and the audit of the data against the world continue.",
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
            subtitle="Self-Closing Ledger Periods under the Bonded Commitment"
            author="Figaro"
            date="April 2026"
            watermark="Figaro Protocol · Preprint"
            abstract={
                <>
                    <p>
                        Double-entry bookkeeping, codified by Pacioli (1494), made the position of an opaque, continuously operating entity legible enough to reconcile, audit, tax, and adjudicate, and let the firm and the professions on its books grow past one person&rsquo;s sight (Sombart 1916&ndash;1927; Chandler 1977).
                    </p>
                    <p>
                        We read a bonded mechanism in the accounting register: each party&rsquo;s own bond makes its promise good before the trade, the buyer&rsquo;s twice the payment and each seller&rsquo;s twice the cumulative value through its order. The whole process closes on the buyer&rsquo;s single atomic resolution. The <em>process</em> is then an accounting entity in the ordinary sense: it comes into existence at the first commitment, holds positions, and dissolves when it closes. Its assets equal the claims against it at every moment, so its equity is identically zero. It opens no revenue or expense account, because the payment moves between two claims rather than through a result of its own. The closing entry, which only the buyer may make, zeroes every account the period opened. We call this a <em>self-closing ledger period</em> and give its entries account by account.
                    </p>
                    <p>
                        The ledger is complete for the process and for nothing else: it holds what was undertaken, what was posted, and how it resolved, never performance. Journal-keeping, posting, trial balance and the period-end close become protocol byproduct. Interpretive judgment, translation, and the audit that tests the data against the world continue in substance unchanged. The practices whose subject is whether a reported position matches an entity&rsquo;s own books become inapplicable rather than cheaper, because they presuppose an opaque entity whose books are its own assertion.
                    </p>
                </>
            }
            references={
                <>
                    <li>AICPA (American Institute of Certified Public Accountants). 2020. <em>AU-C Section 500: Audit Evidence</em>. Statement on Auditing Standards No. 142. In <em>AICPA Professional Standards</em>, current as of August 2026. https://www.aicpa-cima.com/resources/download/aicpa-statements-on-auditing-standards-currently-effective. Accessed October 20, 2026.</li>
                    <li>AICPA (American Institute of Certified Public Accountants). 2021. <em>AU-C Section 315: Understanding the Entity and Its Environment and Assessing the Risks of Material Misstatement</em>. Statement on Auditing Standards No. 145. In <em>AICPA Professional Standards</em>, current as of August 2026. https://www.aicpa-cima.com/resources/download/aicpa-statements-on-auditing-standards-currently-effective. Accessed October 20, 2026.</li>
                    <li>Braudel, Fernand. 1982. <em>Civilization and Capitalism, 15th&ndash;18th Century</em>. Vol. 2, <em>The Wheels of Commerce</em>. Translated by Si&acirc;n Reynolds. London: Collins.</li>
                    <li>Buterin, Vitalik. 2014. &ldquo;Ethereum: A Next-Generation Smart Contract and Decentralized Application Platform.&rdquo; White paper. https://ethereum.org/whitepaper/. Accessed October 18, 2026.</li>
                    <li>CEN (European Committee for Standardization). 2017. <em>EN 16931-1:2017: Electronic Invoicing&mdash;Part 1: Semantic Data Model of the Core Elements of an Electronic Invoice</em>. Brussels: CEN.</li>
                    <li>Chandler, Alfred D., Jr. 1977. <em>The Visible Hand: The Managerial Revolution in American Business</em>. Cambridge, MA: Belknap Press of Harvard University Press.</li>
                    <li>Council of the European Union. 2025. <em>Council Directive (EU) 2025/516 of 11 March 2025 amending Directive 2006/112/EC as regards VAT rules for the digital age</em>. <em>Official Journal of the European Union</em> L, 2025/516 (March 25, 2025).</li>
                    <li>Dai, Jun, and Miklos A. Vasarhelyi. 2017. &ldquo;Toward Blockchain-Based Accounting and Assurance.&rdquo; <em>Journal of Information Systems</em> 31 (3): 5&ndash;21. https://doi.org/10.2308/isys-51804.</li>
                    <li>De Filippi, Primavera, and Aaron Wright. 2018. <em>Blockchain and the Law: The Rule of Code</em>. Cambridge, MA: Harvard University Press. https://doi.org/10.4159/9780674985933.</li>
                    <li>de Roover, Raymond. 1963. <em>The Rise and Decline of the Medici Bank, 1397&ndash;1494</em>. Cambridge, MA: Harvard University Press.</li>
                    <li>European Parliament and Council. 2014. <em>Directive 2014/55/EU of the European Parliament and of the Council of 16 April 2014 on electronic invoicing in public procurement</em>. <em>Official Journal of the European Union</em> L 133 (May 6, 2014): 1&ndash;11.</li>
                    <li>FASB (Financial Accounting Standards Board). 2014. <em>Accounting Standards Codification Topic 606: Revenue from Contracts with Customers</em>. Norwalk, CT: FASB.</li>
                    <li>Figaro. 2026. &ldquo;Asymmetric Bonding and Buyer Dominance: Two Composing Mechanisms for N-Party Coordination Among Strangers.&rdquo; Preprint. https://figaroprotocol.com/papers/asymmetric-bonding/. Accessed October 18, 2026.</li>
                    <li>Grigg, Ian. 2005. &ldquo;Triple Entry Accounting.&rdquo; Working paper, Systemics Inc. https://iang.org/papers/triple_entry.html. Accessed October 20, 2026.</li>
                    <li>Hirshleifer, Jack. 1983. &ldquo;From Weakest-Link to Best-Shot: The Voluntary Provision of Public Goods.&rdquo; <em>Public Choice</em> 41 (3): 371&ndash;386. https://doi.org/10.1007/BF00141070.</li>
                    <li>IASB (International Accounting Standards Board). 2011. <em>IFRS 13: Fair Value Measurement</em>. London: IFRS Foundation.</li>
                    <li>IASB (International Accounting Standards Board). 2014. <em>IFRS 15: Revenue from Contracts with Customers</em>. London: IFRS Foundation.</li>
                    <li>Ijiri, Yuji. 1986. &ldquo;A Framework for Triple-Entry Bookkeeping.&rdquo; <em>Accounting Review</em> 61 (4): 745&ndash;759. https://doi.org/10.2308/tar-4479114.</li>
                    <li>Ijiri, Yuji. 1989. <em>Momentum Accounting and Triple-Entry Bookkeeping: Exploring the Dynamic Structure of Accounting Measurements</em>. Sarasota, FL: American Accounting Association.</li>
                    <li>Kindleberger, Charles P. 1993. <em>A Financial History of Western Europe</em>. 2nd ed. New York: Oxford University Press.</li>
                    <li>Mattessich, Richard. 1964. <em>Accounting and Analytical Methods: Measurement and Projection of Income and Wealth in the Micro- and Macro-Economy</em>. Homewood, IL: Richard D. Irwin.</li>
                    <li>Nakamoto, Satoshi. 2008. &ldquo;Bitcoin: A Peer-to-Peer Electronic Cash System.&rdquo; White paper. https://bitcoin.org/bitcoin.pdf. Accessed October 20, 2026.</li>
                    <li>Pacioli, Luca. 1494. <em>Summa de arithmetica, geometria, proportioni et proportionalita</em>. Venice: Paganino de Paganini. Treatise XI, <em>Particularis de computis et scripturis</em>.</li>
                    <li>Power, Michael. 1997. <em>The Audit Society: Rituals of Verification</em>. Oxford: Oxford University Press.</li>
                    <li>Sombart, Werner. 1916&ndash;1927. <em>Der moderne Kapitalismus</em>. 2nd ed. Munich and Leipzig: Duncker &amp; Humblot.</li>
                    <li>Yamey, Basil S. 1949. &ldquo;Scientific Bookkeeping and the Rise of Capitalism.&rdquo; <em>Economic History Review</em> 1 (2&ndash;3): 99&ndash;113. https://doi.org/10.2307/2589824.</li>
                    <li>Yermack, David. 2017. &ldquo;Corporate Governance and Blockchains.&rdquo; <em>Review of Finance</em> 21 (1): 7&ndash;31. https://doi.org/10.1093/rof/rfw074.</li>
                </>
            }
        >
            <PaperSection title="1. Introduction">
                <p>
                    Every modern firm keeps books of account. The books state what the firm owns (assets), what it owes (liabilities), what has flowed in and out (revenues and expenses), and how these quantities changed over a defined period. They make the firm legible to itself, its investors, its regulators, and its counterparties. They do not constitute the firm&rsquo;s legal personality, which flows from incorporation, but they are the artifact through which that personality acts: regulators read books, contracts reference books, disputes are adjudicated against books.
                </p>
                <p>
                    Much of commercial law rests on them. Tax law assumes books and operates against them. Securities law requires their disclosure. Insolvency proceedings run against them, and due diligence in an acquisition is largely an examination of them. Auditing is the profession that verifies books, and the auditor&rsquo;s report is a legal artifact with specific consequences.
                </p>
                <p>
                    The problem the books solve is the one Pacioli (1494) identified: an entity with continuous operations needs an answer to the question <em>what is its position?</em> at any moment. Cash alone misses the obligations outstanding; a list of assets does not separate liabilities from equity; a log of transactions does not summarize the cumulative position. Double entry solved this by entering every transaction as a balanced pair of debit and credit, so that the cumulative position can be drawn at any time as a trial balance. Every later layer of the apparatus was built on the assumption that such books exist and are more or less reliable.
                </p>
                <p>
                    Two features of that assumption do the work, and both belong to the <em>entity</em> rather than to the method. The entity is opaque: only it knows what it did, so its books are in the first instance its own assertion about itself. And the entity is continuous: it has no natural moment of closure, so a period boundary is imposed on it by convention. Everything difficult in accounting lives at that imposed boundary: cutoff, accrual, provision, subsequent events, restatement.
                </p>
                <p>
                    This paper asks what follows when a mechanism produces, as the byproduct of its ordinary operation, a set of accounts that belongs to neither party but to the transaction itself. Those accounts are funded rather than asserted, and they have a natural moment of closure rather than an imposed one. Our answer sorts professional work into three classes: work that becomes byproduct, work that continues, and practice that becomes inapplicable. The argument for each is in Sections 5 and 6.
                </p>
                <PaperRun title="Organization.">
                    Section 2 describes the Pacioli stack: double entry, the three books, the apparatus on top, and its place in the longer arc of banking. Section 3 treats triple-entry bookkeeping and blockchain accounting, and states where this argument departs from them. Section 4 states the mechanism and develops the central claim, with the entries given and the accounts shown to zero. Section 5 states what stops being necessary and what stops applying; Section 6 states what continues, with a worked projection onto the European e-invoice norm. Section 7 treats the asset behind a wallet and the books it keeps for itself. Section 8 places the process&rsquo;s ledger in the ordering by which audit evidence is weighed. Section 9 states the argument&rsquo;s scope, and Section 10 concludes.
                </PaperRun>
            </PaperSection>

            <PaperSection title="2. The Pacioli Stack">
                <p>
                    Pacioli published the <em>Summa de arithmetica, geometria, proportioni et proportionalita</em> in Venice in 1494. It was a general mathematics reference, but its thirty-six-chapter treatise <em>Particularis de computis et scripturis</em> was the first printed exposition of double entry as Venetian merchants practiced it. Pacioli did not invent the method, which Italian commercial cities had used for at least a century. His codification became the reference text and carried the method into every later tradition of commercial accounting.
                </p>
                <p>
                    The method is simple. Every transaction is entered twice, once as a debit to one account and once as a credit to another, so the sum of debits always equals the sum of credits. At any moment the trial balance, the list of all account balances, agrees if no error has been made. The books therefore check themselves: an error produces an imbalance that can be located and corrected. The entity&rsquo;s position is drawn by summarizing balances into a balance sheet and an income statement.
                </p>
                <p>
                    Pacioli organizes the method into three books. The <em>memoriale</em> (memorandum) is the rough chronological book, kept at the point of transaction and informal in style. The <em>giornale</em> (journal) is the formal chronological book, where each transaction is re-entered as a balanced pair in a fixed format. The <em>quaderno</em> (ledger) is the categorial book: journal entries are posted to individual accounts, each with its running balance, and the trial balance is taken from it. Each book serves a distinct evidentiary function, and the sequence <em>memoriale</em> <Math>{"\\to"}</Math> <em>giornale</em> <Math>{"\\to"}</Math> <em>quaderno</em> is the path by which a transaction enters the merchant&rsquo;s position. Section 4.3 identifies what plays each of the three roles in a bonded process.
                </p>
                <PaperRun title="Why the innovation was decisive.">
                    Sombart (1916&ndash;1927) argued that double entry was a necessary condition for modern capitalism. Without a reliable method for tracking cumulative position, an entity cannot grow beyond the scale at which one person sees its position directly: a cook can carry a kitchen&rsquo;s stocks and obligations in their head, but a merchant house running dozens of ships cannot. Yamey (1949), reading the merchants&rsquo; actual books, disputed the causal role Sombart gave the method. Chandler (1977) showed the managerial hierarchies of the modern firm running on systematic financial and cost accounting. The structural point survives either reading of the causal claim: position must be legible for an entity to grow past one person&rsquo;s sight.
                </PaperRun>
                <PaperRun title="The apparatus on top.">
                    Over five centuries a professional apparatus grew on the books. Bookkeepers keep journals and post ledgers. Accountants prepare periodic statements, make closing entries, compute taxes, and advise on ambiguous transactions. External auditors attest that the statements fairly present the entity&rsquo;s position. Regulators and tax authorities work from the books, and commercial lawyers litigate what the books say or should have said. Power (1997) calls the result the <em>audit society</em>: a social formation in which verification by credentialed third parties is the default answer to questions of organizational reliability.
                </PaperRun>
                <p>
                    The apparatus works, and it is costly. The cost is justified under the existing model because the apparatus answers a question nothing else answers: is the entity&rsquo;s position what its managers say it is?
                </p>
                <PaperRun title="Banking as coordinating infrastructure since the Renaissance.">
                    Double entry was one layer of the infrastructure Italian merchant cities built to solve trust at distance. The Medici bank&rsquo;s bills of exchange and correspondent branches let a merchant in Florence pay one in Bruges by trusting the bank rather than each other (de Roover 1963). Double entry made the multi-branch bank&rsquo;s own position legible, and the bank in turn cleared its clients&rsquo; positions against one another. Its successors, from the Amsterdam Wisselbank to central banking and the correspondent arrangements of the twentieth century (Braudel 1982; Kindleberger 1993), carried the arrangement to global scale without changing its structure: trust in a counterparty, underwritten by trust in an intermediary that keeps authoritative books about the position between them. The mechanism of Section 4 changes that structure. Each party&rsquo;s own bond makes its undertaking credible, and the accounts belong to the transaction rather than to a keeper. We draw the arc so that Section 4 is read for what it rearranges: the enforcement-at-distance problem that Pacioli&rsquo;s books were one layer of.
                </PaperRun>
            </PaperSection>

            <PaperSection title="3. Triple-Entry and Its Limits">
                <p>
                    A small literature asks whether double entry can be extended to solve further problems. Ijiri (1986) proposes triple-entry bookkeeping, which adds a third dimension of measurement to the double-entry pair. Ijiri (1989) develops it as <em>momentum accounting</em>. A balance sheet captures wealth and an income statement captures the rate at which wealth changes; neither captures the rate at which income itself changes, so the third entry tracks the <em>forces</em> that alter an account&rsquo;s <em>momentum</em>, a second derivative of position.
                </p>
                <p>
                    We take Ijiri as inspiration, not as an ancestor we extend, because a third dimension is easy to claim and hard to supply. The cumulative-value accumulator of Section 4 is a stock in Ijiri&rsquo;s vocabulary: it sums payments and measures no rate of change. What a bonded process adds to the double-entry pair is a <em>funded claim</em>: every obligation the process holds is funded in full when it is entered, by the bond the obligated party has already posted. Conventional books are full of unfunded obligations (receivables, accruals, provisions, allowances for doubtful accounts), because an entry there is partly an assertion about what a counterparty will do later. The process ledger of Section 4 carries none of these and has no account one could be posted to. That is the departure from Ijiri, and it is narrower and more checkable than a new dimension of measurement.
                </p>
                <p>
                    A more formal antecedent is Mattessich (1964), who develops accounting as an axiomatic system: the double-entry identity is an algebraic invariant over propositions about value flows, much as a conservation law is in physics. The identity of Section 4.1 is that invariant restated for a transaction-scoped entity. The mechanism of Section 4 has two operations that move a balance, commit and the buyer&rsquo;s resolution, and holds the bonds. What it holds for a process equals its parties&rsquo; claims against it at every moment, and the equality is discharged at resolution rather than carried forward.
                </p>
                <p>
                    Grigg (2005) revived the idea in a cryptographic register. Each party keeps its own books in the conventional way, and a third entry, a signed receipt both parties reference, serves as the attesting one. That receipt played the role a chain transaction plays now: a tamper-evident, timestamped artifact neither party can alter after the fact. Grigg&rsquo;s contribution was to formalize what Ricardian-contract practice had done: it binds a digitally signed contract of issuance into each receipt by the contract&rsquo;s message digest, a hash that identifies the document uniquely. A receipt so bound can carry the weight of a signed document and serve as an accounting entry at once. The same hybrid, prose bound to code, is what De Filippi and Wright (2018, chap. 4) treat as a legal contract, its code construed by the principles of contract-law interpretation.
                </p>
                <p>
                    Nakamoto (2008) built a ledger that peers keep in common, with no single bookkeeper, and Buterin (2014) generalized it to a chain that executes programs. A literature followed on what such ledgers change in accounting. Dai and Vasarhelyi (2017) propose transactions on a chain as the basis for continuous audit in place of periodic audit cycles. Yermack (2017) surveys the governance applications, including their consequences for the audit function.
                </p>
                <PaperRun title="Where the prior literature stops.">
                    The prior work treats the chain as a <em>third, attesting</em> ledger beside the two parties&rsquo; own books. The parties still keep books and the chain reinforces them. That improves on party-held books alone: reconciliation is faster, attestation is cryptographic, and the third ledger cannot be altered unilaterally. The structure of the apparatus is unchanged, though: the parties keep books, the chain attests, and the audit verifies that the books match the chain and each other.
                </PaperRun>
                <p>
                    Our departure is in what the ledger <em>is</em>, not in how strongly it is attested. A bonded process produces the complete accounts of a third entity, the process itself, which begins at the first commitment and dissolves when it closes. Nothing a party could keep in parallel would add to them, because they are exhausted by positions the mechanism holds and claims a fixed schedule determines. Each party remains whatever it was before, an enterprise or a public authority or a single productive asset, with its own accounts and its own reporting period; Section 7 treats those.
                </p>
            </PaperSection>

            <PaperSection title="4. A Bonded Process as a Self-Closing Ledger Period">
                <p>
                    We call a <em>self-closing ledger period</em> an accounting period with three properties. Its entity holds identically zero equity; its journal entries are its parties&rsquo; bonded commitments; and its one closing entry, made by one of its parties, zeroes every account the period opened. This section&rsquo;s claim is that a bonded process is one, and an accounting argument has to say what it accounts for, so the mechanism is stated first, in the slice the argument uses.
                </p>
                <PaperRun title="The mechanism, in the terms this paper needs.">
                    The mechanism is a set of rules a public chain executes. A <em>process</em> is one buyer&rsquo;s orders, resolved together; an <em>order</em> is one commitment between that buyer and one seller. Two operations move balances. <em>Commit</em> forms one order. Buyer and seller both sign a commitment naming the payment <Math>{"P_i > 0"}</Math> and the denomination, the one token every payment and bond of the process is counted in. The commitment also names the cumulative value <Math>{"G_i"}</Math> the process has accumulated through that order, its own payment included, and the merkle root of the order&rsquo;s agreement: a single hash computed over the agreement&rsquo;s clauses, so that any one clause can later be shown to belong to it without disclosing the rest.
                </PaperRun>
                <p>
                    The <em>agreement</em> is the clauses composed for the order, every field filled; a <em>clause</em> is one reusable term, registered publicly for anyone to compose. On the two signatures the mechanism takes two bonds, each making its party&rsquo;s performance the move the other can count on. The buyer bonds <Math>{"2P_i"}</Math> and the seller <Math>{"2G_i"}</Math>. So the deeper the link, the more value has reached it, the most a holdout there could keep. The accumulator admits exactly one declared value per commitment: the payment itself for the commitment that opens a process, the standing accumulator plus the new payment for each one that extends it. So <Math>{"G_i = \\sum_{j \\leq i} P_j"}</Math> is fixed by arithmetic, not reported. The mechanism sees a process as a process chain: a linear sequence of commits by one buyer extending that accumulator, as many as the chain can resolve in one call.
                </p>
                <p>
                    <em>Resolve</em> closes the process. Only the buyer may call it, and it resolves every active order at once or none at all. It pays the seller of order <Math>{"i"}</Math> the amount <Math>{"2G_i + P_i"}</Math> and refunds the buyer <Math>{"P_i"}</Math>, and the two exhaust what was posted, since <Math>{"(2G_i + P_i) + P_i = 2G_i + 2P_i"}</Math>. One further operation touches an open order without moving a balance: a party to it may attest, binding a signed content hash to the order (&sect;4.3). The mechanism has nothing else: no timeout, no cancellation, no administrative override, and no path by which a bonded position leaves the mechanism except the buyer&rsquo;s resolution.
                </p>
                <PaperRun title="The boundary.">
                    The goods, the work, and every passage of value between the parties lie outside the mechanism. It can neither observe them nor undo them; it holds the bonds, the accumulator, and the fingerprints of what was signed. The data therefore shows commitments, positions, attestations, and resolution or its absence, never performance. A defecting party keeps whatever is in its hands, and the schedule is set against exactly that. The second half of each bond answers what a defector can retain, since a bond equal to that value would be exactly canceled by the taking (Figaro 2026, Definition 7). Crediting a defector with everything it keeps, a seller that holds out is out of pocket by at least the value accumulated through its order, and a buyer that keeps a delivery and never resolves is out of pocket by exactly the payment. The accounting consequence is the one this paper turns on: the accounts below are complete as the accounts of the process, and they are not a ledger of performance.
                </PaperRun>
                <PaperRun title="Why the period closes, and why it closes itself.">
                    Both calls carry load, and different halves of it. The schedule at commit makes every claim funded: every amount payable at resolution is already locked in the bonds, and the amounts posted are exactly those amounts. The schedule is also where the equilibrium sits, and the equilibrium is what makes the close an expected event. After performance the buyer strictly prefers resolving, at <Math>{"0"}</Math>, to never resolving, at <Math>{"-P_i"}</Math>, whatever the seller did; given the buyer&rsquo;s plan to resolve once performance has occurred and not before, each seller strictly prefers performing, at <Math>{"+P_i"}</Math>, to holding out, at most <Math>{"-G_i"}</Math>, when its co-sellers perform. That profile is an equilibrium for any number of orders the network resolves in one call, as Figaro (2026) proves.
                </PaperRun>
                <p>
                    Buyer dominance with atomic resolution supplies the close itself. The closing entry has one signer, is made at one moment, and resolves every order of the process together. It is the buyer&rsquo;s judgment that what it contracted for arrived, not a computation the chain performs. A rule that closed orders one at a time would produce partial closes, which are not period-closes in the accounting sense. Resolution is also terminal: a resolved process cannot be reopened, and the mechanism holds nothing further of it. We now show that this structure is a self-closing ledger period, in five steps: the entity and its identity, the entries, the three books, reconstruction and period-end, and the remedies made inside an open period.
                </p>
                <PaperSubsection title="4.1 The process is the accounting entity">
                    <p>
                        The first question is whose books these are. They are not the buyer&rsquo;s, nor any seller&rsquo;s, nor a trustee&rsquo;s. The mechanism holds the balances under a fixed rule: no party decides what each is refunded, no party may be instructed to refund them, and the mechanism exercises no judgment of its own. The single act that moves a bonded balance is the buyer&rsquo;s resolution, and it moves every balance of the process by the schedule. The accounts have the form of client accounts held in trust and none of a trustee&rsquo;s discretion.
                    </p>
                    <p>
                        The entity they belong to is the <em>process</em>. It comes into existence when the first commitment is signed and bonded, holds positions while it stands open, and dissolves when the buyer resolves. It has parties and a period, and, as we now show, a balance sheet with zero equity.
                    </p>
                    <FormalBlock label="Definition 4.1 (The process ledger).">
                        <p>For a process <Math>{"\\Pi"}</Math> let <Math>{"\\mathcal{A}(\\Pi, t)"}</Math> be the set of orders committed to <Math>{"\\Pi"}</Math> at time <Math>{"t"}</Math> and not yet resolved. The ledger of <Math>{"\\Pi"}</Math> has one asset account and, for each order <Math>{"i \\in \\mathcal{A}(\\Pi, t)"}</Math>, the claims the schedule fixes:</p>
                        <ul className="space-y-1 list-disc pl-6 text-sm">
                            <li><em>Balance held for <Math>{"\\Pi"}</Math></em> (asset): the bonds the orders of <Math>{"\\Pi"}</Math> have brought into the mechanism and resolution has not yet paid out.</li>
                            <li><em>Claim of the buyer <Math>{"B"}</Math></em> (liability): opened at <Math>{"C_{b,i} = 2P_i"}</Math>, the buyer&rsquo;s bond on order <Math>{"i"}</Math>.</li>
                            <li><em>Claim of the seller <Math>{"S_i"}</Math></em> (liability): opened at <Math>{"C_{s,i} = 2G_i"}</Math>, that seller&rsquo;s bond.</li>
                            <li><em>Payment payable to <Math>{"S_i"}</Math></em> (liability): nil until resolution, when the payment vests (&sect;4.2).</li>
                        </ul>
                        <p>Write <Math>{"A(\\Pi,t)"}</Math> for the balance held, <Math>{"L(\\Pi,t)"}</Math> for the sum of the claims, and <Math>{"E(\\Pi,t) = A(\\Pi,t) - L(\\Pi,t)"}</Math> for the residual. There are no other accounts: no revenue account, no expense account, no account for anything the parties exchange off chain, and no equity account, since by Proposition 4.2 the residual it would carry is zero at every moment.</p>
                    </FormalBlock>
                    <FormalBlock label="Proposition 4.2 (Zero-equity process entity).">
                        <p>At every moment from the first commitment to the resolution of <Math>{"\\Pi"}</Math>,</p>
                        <PaperScroll className="my-3">
                            <Math display>{"A(\\Pi, t) \\;=\\; L(\\Pi, t) \\;=\\; \\sum_{i \\in \\mathcal{A}(\\Pi, t)} \\bigl(2P_i + 2G_i\\bigr),"}</Math>
                        </PaperScroll>
                        <p>so <Math>{"E(\\Pi, t) = 0"}</Math> identically; and after resolution every account of <Math>{"\\Pi"}</Math> stands at zero.</p>
                    </FormalBlock>
                    <p>The proposition rests on five premises, four from the mechanism and one stipulated of the denomination.</p>
                    <ol className="space-y-2 list-decimal pl-6 text-sm">
                        <li><strong>Commit.</strong> A commit of order <Math>{"i"}</Math> brings <Math>{"2P_i"}</Math> from the buyer and <Math>{"2G_i"}</Math> from the seller into the balance held for <Math>{"\\Pi"}</Math> (&sect;4; Figaro 2026).</li>
                        <li><strong>Attestation.</strong> An attestation binds a content hash to an open order and moves no balance (&sect;4).</li>
                        <li><strong>No other path.</strong> The accumulator changes only at commit, and no bonded position leaves the process except by the buyer&rsquo;s resolution (&sect;4).</li>
                        <li><strong>Resolution.</strong> Resolution pays <Math>{"2G_i + P_i"}</Math> to the seller of each active order and <Math>{"P_i"}</Math> to the buyer, for every active order at once (&sect;4).</li>
                        <li><strong>The denomination moves by transfer (stipulated).</strong> The balances of the process&rsquo;s token change only by transfer, so the balance held changes only when one of the operations above moves it.</li>
                    </ol>
                    <Proof>
                        By induction on the operations, in four steps. <em>Base.</em> Before the first commitment both sides are empty. <em>Commit step (premises 1 and 5).</em> A commit of order <Math>{"i"}</Math> adds <Math>{"2P_i + 2G_i"}</Math> to the balance held and opens claims of <Math>{"2P_i"}</Math> and <Math>{"2G_i"}</Math>, so each side rises by <Math>{"2P_i + 2G_i"}</Math>. <em>Open-period step (premises 2, 3 and 5).</em> An attestation moves neither side, and no other operation changes either side while the process stands open. <em>Closing step (premises 4 and 5).</em> At resolution the balance held falls by <Math>{"\\sum_i (2G_i + 2P_i)"}</Math> to zero, and the closing entries of &sect;4.2 retire claims of exactly that total. <em>Conclusion.</em> The balance held equals the sum of the claims at every moment from the first commitment to the resolution, so <Math>{"E(\\Pi,t)"}</Math>, the difference of two equal quantities, is identically zero, and after resolution every account of <Math>{"\\Pi"}</Math> stands at zero. <Math>{"\\square"}</Math>
                    </Proof>
                    <PaperRun title="What would refute it?">
                        A moment of an open process at which the balance held for it differs from the sum of its claims. Three things could produce one: an operation besides commit and resolve that moves a bonded balance, which premise 3 excludes; a resolution that pays other than the schedule, which premise 4 excludes; or a denomination whose balances change without a transfer, which premise 5 excludes by stipulation.
                    </PaperRun>
                    <PaperRemark title="Scope.">
                        The proposition is a statement about the accounts of one process, exact for a denomination that meets premise 5. It says nothing about the parties&rsquo; own accounts, which &sect;7 treats, and nothing about performance, which lies beyond the boundary of &sect;4.
                    </PaperRemark>
                    <PaperRemark title="What the zero means, and what it does not.">
                        The zero does not say that nothing of economic consequence occurred; it says <em>whose</em> consequence it was. The payment is real, and at resolution it passes from the buyer to the seller. It passes between two claims against the same entity, though, so it never touches a result account of that entity, and the process has no income statement to prepare and no net position to carry forward. The gain and the cost land in the parties&rsquo; own accounts. A conventional entity accumulates residuals, and its period-end procedure sweeps them into permanent accounts; a process accumulates none, so there is nothing to sweep.
                    </PaperRemark>
                    <PaperRemark title="The identity in trust-account form.">
                        Is this not a trust account under another name? Proposition 4.2 is the shape that lawyers&rsquo; trust accounts, Interest on Lawyers&rsquo; Trust Accounts (IOLTA) arrangements, and client-money rules impose by regulation: balances held for others are segregated, the aggregate held equals the aggregate owed, and the holder&rsquo;s own position is nil. What differs is the holder: here the shape is produced by arithmetic rather than imposed on a holder who might breach it. Mattessich (1964) would recognize the identity as the double-entry invariant over a smaller and shorter-lived domain; what is new is the domain, an entity whose life is one process chain and whose books have a natural last page.
                    </PaperRemark>
                </PaperSubsection>

                <PaperSubsection title="4.2 Commitments as journal entries; resolution as closing entries">
                    <p>Each commitment produces one balanced journal entry in the process&rsquo;s books:</p>
                    <ul className="space-y-1 list-disc pl-6 text-sm">
                        <li>Debit: <em>Balance held for <Math>{"\\Pi"}</Math></em> &nbsp; <Math>{"2P_i + 2G_i"}</Math></li>
                        <li>Credit: <em>Claim of <Math>{"B"}</Math></em> &nbsp; <Math>{"2P_i"}</Math></li>
                        <li>Credit: <em>Claim of <Math>{"S_i"}</Math></em> &nbsp; <Math>{"2G_i"}</Math></li>
                    </ul>
                    <p>
                        Debits equal credits by construction, since what is debited is exactly what the two parties bonded. The entry is dated by the chain, carries both parties&rsquo; signatures, and binds the merkle root of the order&rsquo;s agreement. Nothing in it is an estimate, an accrual, or a provision: each claim is funded in full by tokens already bonded, the departure from Ijiri drawn in Section 3.
                    </p>
                    <p>
                        Resolution is one atomic act that only the buyer may perform, and it makes two transfers per order. In bookkeeping terms it decomposes into two entries, and the decomposition is what zeroes the accounts. The first is the <em>reclassification</em>, in which the payment vests: it stops being refundable to the buyer and becomes payable to the seller.
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
                        Debits equal credits in each entry, and together the two move exactly what the mechanism transfers: <Math>{"2G_i + P_i"}</Math> to the seller and <Math>{"P_i"}</Math> to the buyer. Taken account by account, the three entries leave nothing outstanding:
                    </p>
                    <PaperScroll className="my-4">
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
                        <p className="text-xs text-ink-muted mt-2">The three entries of a complete order, account by account. The closing act zeroes every account the period opened, and the same table repeated over the orders of a process zeroes the process. The reclassification line is the only entry of the period that is neither a bond going in nor a bond being refunded: it is the consideration, and it occupies one line.</p>
                    </PaperScroll>
                    <p>
                        The table carries the substance of the &ldquo;self-closing&rdquo; claim in two features. First, of the buyer&rsquo;s bond of <Math>{"2P_i"}</Math>, exactly half is the consideration and half the deterrent. The deterrent is refunded and the consideration transfers, and the reclassification line makes the split, not anyone&rsquo;s judgment. The seller&rsquo;s bond of <Math>{"2G_i"}</Math> is refunded whole alongside the payment, so the seller&rsquo;s net over the period is <Math>{"+P_i"}</Math> and the buyer&rsquo;s is <Math>{"-P_i"}</Math>. Second, no account closes at a loss: nothing is written off, allowed for, or provided against, because no operation consumes a bond and no discretion can impair a claim.
                    </p>
                    <p>
                        What becomes of a process that never closes, say because the buyer&rsquo;s key is lost? A process that has not resolved is an open period, and the accounts say so and nothing more. Both sides of Proposition 4.2 stand at their committed values, no clock runs, nothing accrues, and no entry falls due. An unresolved position is a position held, not a loss taken, and the mechanism has no operation that would convert it into one. What a party makes of an indefinitely open position in its own accounts is governed by the framework those accounts are prepared under.
                    </p>
                    <p>
                        The entries are the process&rsquo;s, and they are not the parties&rsquo;. When the payment reaches a seller&rsquo;s wallet it may be revenue to the asset behind that wallet under the applicable framework, and the refunded bond moves the same asset between two of its own positions. For the buyer the payment may be a cost, an input, or an item of inventory. Those classifications are made in the parties&rsquo; own accounts, over periods the process does not define.
                    </p>
                </PaperSubsection>

                <PaperSubsection title="4.3 The three books, and what is held where">
                    <p>
                        The process supplies an occupant for each of Pacioli&rsquo;s three roles, identified by function: by the job Pacioli gives each book. What Pacioli separated into three volumes separates here by where each is held: the agreement off chain under its merkle root, the entries on the chain, and the accounts derived from the entries.
                    </p>
                    <ul className="space-y-2 list-disc pl-6 text-sm">
                        <li>The <em>memoriale</em>, the rough book made at the point of transaction, is the agreement: the clauses composed for the order, every field filled. It is not held on the chain. The chain holds its merkle root, carried by the commitment both parties sign, which fixes which terms are at issue without disclosing them. The agreement is kept off chain by the parties and produced by whoever holds it; it is never reconstructed from the chain.</li>
                        <li>The <em>giornale</em>, the formal chronological book of balanced entries, is the sequence of signed commitments and the resolution, in the order the chain carries them. Each is the balanced entry of &sect;4.2: dated, authenticated by the signatures the mechanism verified before acting, and immutable in the sense that no later act rewrites an earlier one.</li>
                        <li>The <em>quaderno</em>, the categorial book with a running balance per account, is the set of accounts of Definition 4.1, whose balances at any moment are a function of the entries up to that moment. It is not stored anywhere as a separate artifact; it is derived. Any reader can post the entries to the accounts, and any two readers who do so obtain the same balances, which is the property a merchant&rsquo;s ledger was kept in order to have. The trial balance is Proposition 4.2 evaluated at a moment, and the closing entries are the resolution.</li>
                    </ul>
                    <PaperRun title="The supporting file.">
                        Beyond the three books, a merchant&rsquo;s file carried correspondence, receipts, and the working papers a later reader needs to see what a line meant. The process has the same layer. A party to an open order may attest: a handoff, a condition on arrival, a quality disclosure, a stage reached. Each attestation is signed by the party that gives it, carries a content hash rather than content, and is bound by merkle inclusion to the order&rsquo;s agreement: it names a clause of the agreement and carries the proof that the clause sits under the agreement&rsquo;s merkle root. Attestations are the analog of working papers and receipts, given by interested parties at their discretion, which is what a receipt is. Section 8 weighs them apart from the entries on that ground. The entries, the agreements, and the attestations together are the complete file of the process, from opening to close.
                    </PaperRun>
                </PaperSubsection>

                <PaperSubsection title="4.4 Reconstruction and the period-end property">
                    <p>
                        The ledger of a process is recomputed from its signed commitments and its resolution. Any reader of the chain can post the commitments and the resolution to the accounts of Definition 4.1 and obtain the ledger of any process at any moment of its life, without any party&rsquo;s cooperation. This removes the reconciliation step from the ledger&rsquo;s own audit, because no second copy of the accounts exists to disagree with the first. The recomputation yields the ledger and nothing beyond it: the agreements are recovered from the parties who keep them, and performance is in neither.
                    </p>
                    <PaperRun title="The period-end property.">
                        When a process resolves, its ledger period closes in the full sense the word carries in accounting practice. Every balance returns to zero, every claim is discharged, and every payment has reached its recipient. No further entry can be made against the accounts, because the mechanism holds nothing further of the process and admits no operation on a resolved order. The data persists and stays readable, but the period does not reopen. Conventional practice reaches this state by procedure: adjusting entries are posted, accounts reconciled, a cutoff date chosen, a subsequent-events window observed, and prior periods occasionally restated when the choice proves wrong. None of those instruments is needed here. The closing date is not chosen by an accountant; the buyer&rsquo;s act produces it, at the moment the buyer judges itself satisfied.
                    </PaperRun>
                </PaperSubsection>

                <PaperSubsection title="4.5 Remedies inside the open period">
                    <p>
                        Because the closing act is the buyer&rsquo;s acceptance, everything conventionally handled after a period closes is handled here before it does. The mechanism holds no test of performance and acts on no report of one; resolution <em>is</em> the buyer&rsquo;s judgment that what it contracted for arrived. Where performance is late, partial, or wrong, the parties negotiate a remedy while the process stands open, and the buyer resolves once it is satisfied. A forum the parties composed may rule on the process&rsquo;s data in that window, but it cannot call resolve: its ruling reaches the process only through what the parties do before the buyer signs.
                    </p>
                    <p>
                        The canonical remedy has a simple arithmetic, and it is the one an accountant will meet. A seller that cannot perform sends the buyer the payment <Math>{"P_i"}</Math> it stands to receive and makes good whatever of the buyer&rsquo;s it holds. At resolution it is refunded its bond <Math>{"2G_i"}</Math> and receives <Math>{"P_i"}</Math>, a payment it has already passed to the buyer, so it ends at <Math>{"0"}</Math>. That beats holding out, worth at most <Math>{"-G_i"}</Math>, by the whole value through its order. The comparison holds on the buyer&rsquo;s plan to resolve once it is made whole, and given that the process&rsquo;s other orders close. The buyer, made whole before it resolves, ends where it would have stood had the exchange not happened. The mechanism performs none of this and adjudicates none of it; it supplies the reason to reach it, since both parties hold positions that only the closing act refunds.
                    </p>
                    <p>
                        Such transfers are ordinary transactions between the parties, made while the process stands open, and their accounting treatment begins here. They raise three classification questions, and the data answers none of them. First, where the failing seller performed in part, its transfer to the buyer may be a price concession or a change in the transaction price under ASC&nbsp;606 / IFRS&nbsp;15 (FASB 2014; IASB 2014). It is then recognized as a reduction of the revenue on what was performed, in the period the price changes, allocated to the performance obligation it relates to, rather than as an entry at the close. Where the seller performed nothing, no performance obligation was satisfied and no revenue was recognized, so there is nothing to reduce: the payment it receives at resolution offsets the amount it has already paid back. Second, a transfer between co-sellers, where one absorbs part of another&rsquo;s shortfall, may be a related-party transaction, a loan, a contribution to a shared arrangement, or a charge for bearing risk; the substance depends on the agreement the parties signed. Third, the buyer&rsquo;s receipt reduces the cost of what was bought where it offsets a payment already made, and is something else where it exceeds that payment. The data establishes that the transfers occurred, between which wallets, in what amount, and when; their substance is classification work of the kind Section 6 says continues.
                    </p>
                    <PaperRemark title="Why co-sellers take an interest.">
                        Atomic resolution gives every seller in a process a computable interest in every other&rsquo;s performance. Since the process resolves as one, a seller that has already performed stands in its whole bond for as long as any order remains unperformed, and the size of that bonded interest is readable from the data. This is a weakest-link structure in the sense of Hirshleifer (1983): the outcome for the group turns on the least contribution. It makes remedy conduct among sellers rational rather than altruistic, and it reaches a seller&rsquo;s attestation as it reaches its performance, as Section 8 shows. What a seller does about the interest is conduct, and this paper derives no behavior from the figure. For the accountant the point is narrower: the transfers such conduct produces are dated inside the open period, so they fall in the same period as the resolution they precede, and no subsequent-events treatment or prior-period adjustment arises.
                    </PaperRemark>
                </PaperSubsection>
            </PaperSection>

            <PaperSection title="5. What Stops Being Necessary, and What Stops Applying">
                <p>
                    Two of the three classes fall here, and they differ in kind. Byproduct is work still performed, at no marginal cost, by the operation of the mechanism. Inapplicable is practice whose subject matter has ceased to exist in this setting. Neither claim concerns practitioners&rsquo; livelihoods, and neither extends beyond activity that resolves as a bonded process.
                </p>
                <PaperRun title="Byproduct: bookkeeping.">
                    The classical bookkeeping function, making journal entries, posting them to accounts, reconciling subsidiary ledgers to the general ledger, and running a trial balance, is byproduct for the process. The entries of &sect;4.2 and the recomputation of &sect;4.4 do the work of getting transactions into an account structure. No party keeps the ledger, and any reader derives it.
                </PaperRun>
                <PaperRun title="Byproduct: the period-end close.">
                    The conventional period-end procedure, with its adjusting entries, trial balance, reconciliation of balances against statements, and closing entries, is performed by the resolution. Every commitment has a definite amount and date, every receipt and disbursement names its counterparty, and no adjustment is needed beyond the closing act. Automation is not the reason. The reason is that the estimates conventional closing exists to decide are absent: an entity with no unfunded obligations has nothing to adjust at its period end.
                </PaperRun>
                <PaperRun title="Byproduct: internal audit of the ledger against itself.">
                    The internal-audit function that checks an entity&rsquo;s books against its own supporting documents is subsumed. The entries and the agreements they bind are linked by merkle root, the signatures are verifiable, and the dating is the chain&rsquo;s. No second ledger exists to reconcile against.
                </PaperRun>
                <PaperRun title="Inapplicable: the audit of books against books.">
                    The external-audit function in its narrowest sense, attesting that a reported position reconciles to the underlying books, does not become cheaper; it loses its subject. No reported position stands apart from the ledger, derived from it by a party, because the ledger is not a party&rsquo;s account of itself. What relocates is the question of whose position the ledger is. Verifying that the wallets an entity claims are the wallets it controls is a real assertion, but a different one, and Section 6 treats it under <em>rights and obligations</em>.
                </PaperRun>
                <PaperRun title="Inapplicable: disputes about what the books say.">
                    A large category of commercial dispute is about what an entity&rsquo;s books say or should have said: whether an expense was entered, a liability disclosed, a receipt recognized when the entity&rsquo;s own criteria required. For activity resolved as a bonded process the category is empty. The ledger is the mechanism&rsquo;s arithmetic over what both parties signed, and neither party can produce a different one. A disagreement about it can only be about what it <em>means</em>, which is interpretation, or about whether it matches what happened, which is the audit of Section 6.
                </PaperRun>
                <p>
                    All of this holds <em>within</em> a process. One productive asset may take part in thousands of processes within a reporting period. Mapping that sequence of closed periods onto the asset&rsquo;s own reporting period is interpretive work that no closing act discharges: when a performance obligation is satisfied, which side of a cutoff a receipt falls on, how an arrangement spanning several processes is unbundled. The data supplies dated, counterparty-identified, amount-exact resolutions; what an entity-level statement makes of them is the next section&rsquo;s subject.
                </p>
            </PaperSection>

            <PaperSection title="6. What Continues">
                <p>
                    The second class is the work that was never about bookkeeping. It continues in substance unchanged, and in one respect it gets easier: an interpretive judgment applied to a ledger no party can dispute is cleaner than the same judgment applied to books under negotiation.
                </p>
                <PaperRun title="Judgment about what the data means.">
                    Revenue recognition under ambiguity, going-concern assessment, fair-value measurement, impairment, and the rest of <em>interpretive</em> accounting stay human work. The data says what happened on the chain, not how it should be treated under a particular framework. The frameworks it leaves in place are the ones current standards codify: ASC&nbsp;606 and IFRS&nbsp;15 on revenue from contracts with customers, IFRS&nbsp;13 on fair-value measurement, and the risk-assessment standards under which an auditor forms a view of an entity and its environment (AICPA 2021; FASB 2014; IASB 2011, 2014).
                </PaperRun>
                <PaperRun title="A receipt with no counterparty.">
                    One interpretive question has no conventional analog, and the chain cannot answer it. A <em>designer</em> is the wallet that first registered a clause, a registered agreement, or an assembly. A <em>registered agreement</em> is an agreement&rsquo;s design registered as a reusable unit, filled and signed when an order uses it. An <em>assembly</em> is registered agreements composed in order into one reusable design of a process.
                </PaperRun>
                <p>
                    Alongside the payments it receives under agreements it signed, a designer&rsquo;s wallet may come to hold florins, the protocol&rsquo;s token, that no counterparty owed it. These are designer rewards: florins minted for the purpose, in proportion to real use, for the clauses, registered agreements, and assemblies that resolved processes used, and claimed by an eligible designer once a reward period has closed. Such a receipt has no counterparty, no performance obligation behind it, and no agreement the recipient signed, so it is not consideration in any contractual sense. Whether it is revenue, a capital contribution, a non-reciprocal receipt that triggers no recognition, or something else is interpretive work under the standards above. The chain establishes that the claim was made and by whom; it classifies nothing.
                </p>
                <PaperRun title="Translation for non-technical readers.">
                    Narrative management discussion, summaries of position for boards and stakeholders, filings in jurisdictional formats, and plain explanations of technical positions remain professional work. The ledger is complete and unreadable to most of its intended audiences, and in this function the accountant is a translator rather than a bookkeeper.
                </PaperRun>
                <PaperRun title="Audit of the data against the world.">
                    The largest remaining audit function is verifying that the data corresponds to what happened. Did the cook prepare the food? Did the courier deliver it? Did the attested disclosure reflect what was measured? The boundary of &sect;4 fixes the answer: the mechanism cannot answer these questions and has no operation that would. The professional standards separate the assertions an auditor tests: about classes of transactions, <em>occurrence</em>, <em>completeness</em>, <em>accuracy</em>, <em>cutoff</em>, <em>classification</em>, and <em>presentation</em>; about account balances, <em>existence</em>, <em>rights and obligations</em>, <em>completeness</em>, <em>accuracy, valuation, and allocation</em>, <em>classification</em>, and <em>presentation</em> (AICPA 2021). The bonded setting redistributes them rather than retiring them.
                </PaperRun>
                <p>
                    One assertion is discharged by construction. <em>Accuracy</em>, that what was entered was entered faithfully, holds for the undertaking and the resolution, because the mechanism enters nothing that was not signed and nothing it did not itself do, and no later act rewrites either. The rest stand, the transaction-level ones (occurrence, completeness, cutoff, classification, presentation) and the balance-level ones (existence, rights and obligations, accuracy, valuation, and allocation), with the burden distributed differently:
                </p>
                <ul className="space-y-2 list-disc pl-6 text-sm">
                    <li><em>Occurrence</em> is the question above: did the economic event the data describes occur? The data establishes the undertaking, never the performance, so this assertion carries more of the audit&rsquo;s weight here, not less.</li>
                    <li><em>Existence</em>, its balance-level counterpart, asks whether a position exists at the reporting date. The bonds of an open process are derivable from the chain at any block (the chain&rsquo;s unit of appended transactions, each carrying its timestamp). For what has left the mechanism, existence relocates, with rights and obligations, to the wallet.</li>
                    <li><em>Accuracy, valuation, and allocation</em>, at the balance level, remains interpretive: fair value, impairment, amortization, and similar measurements are not in a process&rsquo;s data.</li>
                    <li><em>Rights and obligations</em> relocates to control of the wallet. Does the entity control the wallet whose positions it reports, and does that wallet&rsquo;s holding represent the entity&rsquo;s economic claim? This audit surface is specific to the bonded setting, and it is a question about keys and authority, not classification.</li>
                    <li><em>Completeness</em> relocates to the line between activity that resolved through processes and activity that did not: do transactions within the reporting scope exist that never resolved this way?</li>
                    <li><em>Cutoff</em> vanishes within a process, whose closing moment is unambiguous and unchosen, and returns at the entity&rsquo;s period boundary, where the question is which closings fall inside the reporting period.</li>
                    <li><em>Classification</em> and <em>presentation</em> are interpretive throughout. Wallet addresses are not chart-of-accounts categories, and receipts and disbursements still have to be classified as revenue, cost, capital movement, or financing.</li>
                </ul>
                <p>
                    The audit that results is the one books could never perform on themselves. Accuracy is discharged by the mechanism. Occurrence, completeness, and rights move toward the world and the keys, and existence, for what the mechanism still holds, is read from the chain. Valuation, classification, and presentation stay where they always were, in judgment.
                </p>
                <PaperRun title="Regulatory compliance from the data.">
                    Tax law, securities law, and sector regulation assume conventional books. Participants who resolve through bonded processes need conventional statements produced from the data to satisfy them, and that translation is professional work. Where regulation references conventional statements, the accountant&rsquo;s role includes producing them from these inputs.
                </PaperRun>
                <PaperRun title="A worked projection: the European e-invoice norm.">
                    The translation can be made concrete. EN&nbsp;16931-1 defines the <em>semantic data model</em> of the core electronic invoice: the meaning and cardinality of an invoice&rsquo;s information elements, serialized into one of two permitted syntaxes. The projection targets the norm&rsquo;s 2017 edition and uses that edition&rsquo;s element identifiers (CEN 2017). Directive&nbsp;2014/55/EU obliged European public bodies to accept invoices conforming to it (European Parliament and Council 2014). Council Directive (EU) 2025/516, part of the &ldquo;VAT in the Digital Age&rdquo; package, makes a structured invoice conforming to the norm the definition of an electronic invoice for intra-Community transactions from 2030 (Council of the European Union 2025). A resolved order projects onto that model, one invoice per order: the model admits exactly one seller per invoice, and each order of a process has its own seller. The projection is a serialization performed above the mechanism, and it sorts the invoice&rsquo;s elements into two classes that recover the byproduct-versus-interpretive split of this paper.
                </PaperRun>
                <p>The first class, the intrinsic commercial elements, falls out of the order&rsquo;s data as byproduct:</p>
                <PaperScroll className="my-4">
                    <table className="text-sm border-collapse">
                        <thead>
                            <tr>
                                <th className="border border-default px-3 py-1.5 text-left font-semibold text-ink-heading">EN 16931 core element</th>
                                <th className="border border-default px-3 py-1.5 text-left font-semibold text-ink-heading">Recovered from the order as</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr><td className="border border-default px-3 py-1.5">Invoice number (BT-1)</td><td className="border border-default px-3 py-1.5">the order&rsquo;s hash, which binds its signed commitment to its process</td></tr>
                            <tr><td className="border border-default px-3 py-1.5">Issue date (BT-2)</td><td className="border border-default px-3 py-1.5">the date of the block that carries the resolution</td></tr>
                            <tr><td className="border border-default px-3 py-1.5">Invoice type code (BT-3)</td><td className="border border-default px-3 py-1.5">projection constant (commercial invoice, code 380)</td></tr>
                            <tr><td className="border border-default px-3 py-1.5">Seller (BG-4, BT-27)</td><td className="border border-default px-3 py-1.5">the seller wallet the commitment names</td></tr>
                            <tr><td className="border border-default px-3 py-1.5">Buyer (BG-7, BT-44)</td><td className="border border-default px-3 py-1.5">the buyer wallet the commitment names</td></tr>
                            <tr><td className="border border-default px-3 py-1.5">Invoice line (BG-25, BT-131)</td><td className="border border-default px-3 py-1.5">the order&rsquo;s payment <Math>{"P_i"}</Math>, described by the clauses of its agreement</td></tr>
                            <tr><td className="border border-default px-3 py-1.5">Sum of Invoice line net amount (BG-22, BT-106)</td><td className="border border-default px-3 py-1.5"><Math>{"P_i"}</Math></td></tr>
                        </tbody>
                    </table>
                </PaperScroll>
                <p>
                    The invoice currency code (BT-5) sits between the classes. The norm takes an ISO 4217 code and the order counts in a token, so the projection assigns the code; the data does not carry it. The second class, the tax elements, does not fall out and cannot: the seller VAT identifier (BT-31), the VAT breakdown (BG-23), its category code (BT-118) and rate (BT-119), the tax point date (BT-7), the tax representative (BG-11), and the VAT-inclusive total (BT-112). These presuppose a registered entity inside a particular regime, and the model treats them as conditional. Rule BR-S-02 requires, where an invoice line is standard-rated, the seller VAT identifier (BT-31), the seller tax registration identifier (BT-32), or the seller tax representative VAT identifier (BT-63). The tax apparatus attaches when the party is inside a taxable regime. That trigger is the registration status the mechanism does not hold and the parties&rsquo; terms do: clauses composed for an EU jurisdiction supply BT-31 and the VAT breakdown from the seller&rsquo;s registration data, and the order&rsquo;s data supplies the rest.
                </p>
                <p>
                    This is the move the paper makes for revenue timing: the mechanism produces the structured data, and the jurisdiction&rsquo;s interpretation attaches above it. EN&nbsp;16931 is used here because it is the most fully specified invoice norm, and the same byproduct projects onto other jurisdictions&rsquo; invoice models with their own conditional tax fields. National profiles add mandatory fields the same way, from the parties&rsquo; terms. The projection is a mapping, not a compliance claim: it shows the core invoice model recoverable from an order&rsquo;s data plus jurisdiction-supplied tax data, and it does not make an order a compliant e-invoice or discharge any filing obligation.
                </p>
                <PaperRun title="One decomposition, three presentations.">
                    The line structure the projection recovers is not a further artifact anyone must produce. The orders of a process are the buyer&rsquo;s cost lines, each one asset&rsquo;s contribution to what the buyer bought. What the buyer approves at checkout, what the file exposes order by order, and the invoices the orders project to are three readings of one ledger period. The conventional apparatus kept them as three systems, a point-of-sale log, an audit file, and an invoice, and reconciled them afterwards.
                </PaperRun>
            </PaperSection>

            <PaperSection title="7. The Asset Behind the Wallet">
                <p>
                    The accounts of Section 4 belong to processes, and processes have parties. What a party is decides what remains to be accounted for once the periods have closed themselves, and the conventional apparatus assumes an answer, the firm, that this setting does not supply.
                </p>
                <PaperRun title="Three layers: asset, wallet, operator.">
                    Every participant is a wallet, and every wallet <em>represents</em> a real-world asset: physical capital (an aircraft, a kitchen, a delivery van), a credentialed person&rsquo;s labor (a pilot&rsquo;s, a courier&rsquo;s, a physician&rsquo;s), or a public service (a screening checkpoint, a road network, a customs authority). Three layers are kept apart. The <em>asset</em> is off chain by definition: the airframe that flies, the labor exercised, the service provided. The <em>wallet</em> is the asset&rsquo;s on-chain representation: an address holding balances, with whatever pointers to credentials and documents the parties&rsquo; terms require. The <em>operator</em> is whoever holds the wallet&rsquo;s signing key for the asset, a person or an agent, and which of the two changes nothing in any account. The mechanism sees only the wallet, and buyer and seller are positions a wallet occupies in a particular process.
                </PaperRun>
                <p>
                    The payment an order carries is the value the asset adds at that order, and it is the only quantity the mechanism holds about the asset&rsquo;s economics. In the mechanism&rsquo;s model a payment a wallet receives is income to it and a payment it makes is an outlay; whether either is revenue or a cost is decided in the asset&rsquo;s own accounts under the applicable framework (&sect;4.2, &sect;6). The mechanism models no cost, and no derivation in this paper contains a cost term. What the mechanism does see is whether the wallet holds balances it can bond. That is the whole participation condition: a wallet takes part for as long as it has tokens to bond.
                </p>
                <PaperRun title="The sustainability logic.">
                    An asset behind a wallet sustains itself the way a node on a network does. A node&rsquo;s receipts must cover its operating expenses off chain, machines, power, maintenance, and premises, or its operator stops running it and it leaves the network. An asset is in the same position in its own market. Receipts from resolved processes must cover fuel, parts, labor, premises, regulatory charges, and the amortization of the asset itself, or its operator stops committing the wallet to processes and the asset leaves the market it served. Ordinary rational exit enforces this. The rest point of such a market is likely a rate of return sufficient for each asset to keep taking part, which is to say a productive life.
                </PaperRun>
                <p>
                    Public-authority wallets stand on the same footing. A screening authority&rsquo;s wallet, an airport authority&rsquo;s or a road authority&rsquo;s each represents a real service whose operation requires receipts covering personnel, equipment, premises, and replacement. In the data, a tax and a charge for service take the same form: each is a payment in an order, bonded and resolved like any other. Whether the receipt is regulated as taxation, levied as a user charge or appropriated from a general budget is decided off chain. It is a classification question of the kind Section 6 assigns to judgment, arising where data that treats all payments alike meets a framework that does not.
                </p>
                <PaperRun title="The books the asset keeps for itself.">
                    Here the boundary of Section 4 pays off, and it has to be held rather than blurred. Each closed process leaves the asset a period that closed itself: dated, counterparty-identified, amount-exact, and complete <em>as the ledger of that process</em> with nothing further from the asset&rsquo;s own bookkeeping. An asset whose participation is entirely a sequence of bonded processes has, for that participation, no transaction-level bookkeeping left to do. Its own books are the concatenation of closed periods it did not have to write. What remains at its own level is what Sections 5 and 6 assign there: mapping closed periods onto a reporting period, classifying receipts and disbursements under a framework, and accounting for everything it does outside any process.
                </PaperRun>
            </PaperSection>

            <PaperSection title="8. Primacy in the Hierarchy of Audit Evidence">
                <p>
                    Audit evidence is not weighed equally. Under AU-C 500, the reliability of audit evidence generally increases when it comes from parties outside the entity, because it is then less susceptible to management bias (AICPA 2020). Information the auditor obtains directly may be more reliable than information obtained indirectly, and information in documentary form more reliable than an oral representation. On that ordering, conventional books are the entity&rsquo;s own representation. That is why confirming them takes the apparatus of Section 2: confirmations, vouching, and third-party attestation, each reaching for evidence the entity did not produce.
                </p>
                <p>
                    The accounts of a bonded process are no entity&rsquo;s representation. They are the mechanism&rsquo;s arithmetic over what both parties signed, and no party can offer a competing version to be weighed against them. For the process, the ledger is therefore not evidence <em>of</em> the account but the account itself. A document a party holds about a process, a summary or a statement or an export, is a copy, whose weight rests on its agreement with the source, which any reader can check. This is the property Section 5 draws on when the audit of books against books loses its subject, and the one Section 6 draws on when it discharges accuracy and leaves the other assertions standing.
                </p>
                <p>
                    Admissibility in a legal proceeding belongs to the law of electronic evidence. The claim here is the accounting one: within the ordering by which audit evidence is weighed, the process&rsquo;s accounts occupy a position no entity&rsquo;s own books can.
                </p>
                <p>
                    The two kinds of material in a process file do not carry equal weight. The entries are what the mechanism did, and it could not have done otherwise, so nothing in them needs verifying against anything. The attestations are the parties&rsquo; own. Each is bound by merkle inclusion to the order&rsquo;s agreement, so it cannot be set against terms nobody signed, but the decision to give it and the truth of what it asserts about the world are the attesting party&rsquo;s. What makes the assertion credible is what a false one costs, at two moments.
                </p>
                <p>
                    While the process stands open, what stands behind a seller&rsquo;s attestation is the buyer&rsquo;s decision to withhold resolution, which keeps the seller&rsquo;s bond locked, and its own, until a false one is put right. Co-sellers whose payments wait on the same resolution have the interest &sect;4.5 measured in pressing for the correction. A buyer&rsquo;s own attestation meets no such pressure, since the buyer resolves at will.
                </p>
                <p>
                    After resolution, which nothing reverses, the attestation stays in the public data under its signer&rsquo;s wallet and in its <em>resolution history</em>: the summary of the resolved processes a wallet was a party to and the attestations it carries, derived from the data its processes leave whenever it is read. That exposure raises an attestation&rsquo;s credibility without proving it, and it does not reach parties acting together, who can produce a fully bound file for an event that never occurred. A wallet can manufacture that history by trading with itself, since nothing forbids one wallet, or two wallets of one operator, from being buyer and seller of an order, and a reader weighing the history weighs that. An audit budget therefore goes to the attestations and not to the entries, the conclusion Section 6 reached from the assertions, here reached from the evidence.
                </p>
            </PaperSection>

            <PaperSection title="9. Scope">
                <p>
                    The argument concerns the accounts of a bonded process. Within that boundary they are complete, funded, derivable by any reader, and closed by an act that leaves no residue. The parties&rsquo; own accounts, the reporting periods and frameworks those accounts are prepared under, and every act that does not resolve as a bonded process lie outside it, and Sections 5, 6, and 7 hand that work back across the line.
                </p>
                <PaperRun title="The ledger is as reliable as the layer beneath it.">
                    The ledger inherits the reliability of the chain that carries it and of the cryptographic primitives beneath. A reorganization that unwinds resolved state, a break in the signature scheme, or censorship at the chain&rsquo;s own level would each compromise it. These risks are not new to accounting, since a merchant&rsquo;s ledger could burn, but they are concentrated in one layer rather than spread across party-held books. Whether that concentration improves on the conventional arrangement turns on the relative reliability of the two, which is an empirical matter.
                </PaperRun>
                <PaperRun title="Key control is a first-order audit surface.">
                    If the wallet holds the position, control of its keys is control of the position. Pacioli&rsquo;s equivalent is the strongbox holding the journal, with its physical controls, segregation of duties, and authorization. The analogous surface here is control of signing keys: threshold arrangements, hardware key storage, rotation, signer-set governance, recovery. It is not a new audit assertion; it sits within <em>rights and obligations</em> and within existing IT-control frameworks. It relocates the emphasis: the conventional regime puts its control weight on reconciling books against books, and this one puts it on establishing who holds the keys.
                </PaperRun>
            </PaperSection>

            <PaperSection title="10. Conclusion">
                <p>
                    The mechanism changes the entity, not the method. Its accounts belong to the transaction: a process opens at the first bonded commitment, holds claims funded in full by bonds already posted, has identically zero equity, and closes when the buyer resolves every order at once, leaving every account it opened at zero. The close is the act the schedule makes each party prefer, the buyer once performance has occurred and each seller given the buyer&rsquo;s plan to resolve then and its co-sellers&rsquo; performance, so the period closes itself in the strong sense. For the activity that resolves this way, bookkeeping, the period-end close, and the audit of books against books leave the professional&rsquo;s desk, while interpretation, translation, and the audit of the data against the world stay on it and carry more weight. The larger consequence is likely the price of having audit-grade books at all, which falls to the cost of transacting for the activity that resolves this way. That would matter most for the participants the apparatus has kept out: small assets, places without a deep accounting profession, and machine-operated activity whose scale would never justify an accountant.
                </p>
            </PaperSection>
        </PaperLayout>
    );
}
