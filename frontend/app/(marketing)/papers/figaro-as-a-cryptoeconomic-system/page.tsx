import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import { PaperLayout, PaperSection, PaperRun, PaperScroll } from "@/components/papers/PaperLayout";
import { Math } from "@/components/papers/Math";

export const metadata: Metadata = withOg({
    title: "Figaro as a Cryptoeconomic System — Figaro Protocol",
    description:
        "Figaro read through the field's own definitions: what it governs, in Zamfir's terms; what it guarantees, in Buterin's, with the bond's guarantee stated as the field now states security; what it is as a whole, in Voshmgir and Zargham's; the several incentive mechanisms it carries and the several ends they serve; and the institution it is, one that acts before the trade.",
});

const th = "border border-default px-3 py-1.5 text-left font-semibold text-ink-heading align-top";
const td = "border border-default px-3 py-1.5 text-left align-top";

export default function FigaroAsACryptoeconomicSystemPaper() {
    return (
        <PaperLayout
            slug="figaro-as-a-cryptoeconomic-system"
            title="Figaro as a Cryptoeconomic System"
            subtitle="The Protocol Read Through the Field’s Own Definitions"
            author="Figaro"
            date="October 2026"
            watermark="Figaro Protocol · Preprint"
            abstract={
                <>
                    <p>
                        Cryptoeconomics has three founding definitions: what a system governs (Zamfir), what it tries to guarantee (Buterin), and what it is as a whole (Voshmgir and Zargham). This paper answers all three for Figaro, a decentralized, permissionless protocol under which strangers trade with bonds locked before the trade. Figaro governs trade in goods, work, or data of any kind. It guarantees six invariants, and its bond meets the field&rsquo;s statement of security: at every order, what defection leaves locked exceeds what the defector keeps. Write <Math>{"P"}</Math> for the payment at an order and <Math>{"G"}</Math> for the cumulative value through it: a seller that walks away nets <Math>{"-G"}</Math> against the <Math>{"+P"}</Math> that performing earns once the buyer resolves, and a buyer that never resolves after performance nets <Math>{"-P"}</Math> against zero for resolving.
                    </p>
                    <p>
                        Its incentive mechanisms move different parties toward different ends, so its collective goal is plural. Designer rewards share a fixed budget in proportion to counted use, so capturing a fraction <Math>{"\\varphi"}</Math> of a period&rsquo;s rewards takes <Math>{"\\varphi/(1-\\varphi)"}</Math> times the honest score; under a stated assumption on what score costs, the attack&rsquo;s cost is linear in that score. It has autonomous actors, policies embedded in software, and emergent properties. As an institution it acts before the trade, where the firm, the platform, and the court act after it, and it displaces them without completely substituting for them. It closes by reading the mechanism through each of Voshmgir and Zargham&rsquo;s eight disciplines, each in its own terms.
                    </p>
                </>
            }
            references={
                <>
                    <li>Arrow, Kenneth J. 1962. &ldquo;Economic Welfare and the Allocation of Resources for Invention.&rdquo; In <em>The Rate and Direction of Inventive Activity: Economic and Social Factors</em>, edited by Richard R. Nelson, 609&ndash;626. Princeton, NJ: Princeton University Press.</li>
                    <li>Asgaonkar, Aditya, and Bhaskar Krishnamachari. 2019. &ldquo;Solving the Buyer and Seller&rsquo;s Dilemma: A Dual-Deposit Escrow Smart Contract for Provably Cheat-Proof Delivery and Payment for a Digital Good without a Trusted Mediator.&rdquo; In <em>2019 IEEE International Conference on Blockchain and Cryptocurrency (ICBC)</em>, 262&ndash;267. IEEE. https://doi.org/10.1109/BLOC.2019.8751482.</li>
                    <li>Berg, Chris, Sinclair Davidson, and Jason Potts. 2019. <em>Understanding the Blockchain Economy: An Introduction to Institutional Cryptoeconomics</em>. Cheltenham: Edward Elgar. https://doi.org/10.4337/9781788975001.</li>
                    <li>Brekke, Jaya Klara, and Wassim Zuhair Alsindi. 2021. &ldquo;Cryptoeconomics.&rdquo; <em>Internet Policy Review</em> 10 (2). https://doi.org/10.14763/2021.2.1553.</li>
                    <li>Budish, Eric. 2025. &ldquo;Trust at Scale: The Economic Limits of Cryptocurrencies and Blockchains.&rdquo; <em>Quarterly Journal of Economics</em> 140 (1): 1&ndash;62. https://doi.org/10.1093/qje/qjae033.</li>
                    <li>Buterin, Vitalik. 2017. &ldquo;Introduction to Cryptoeconomics.&rdquo; Talk, Ethereum Foundation. Quoted in Brekke and Alsindi 2021.</li>
                    <li>Buterin, Vitalik. 2019. &ldquo;On Collusion.&rdquo; vitalik.eth.limo, April 3, 2019. https://vitalik.eth.limo/general/2019/04/03/collusion.html. Accessed October 20, 2026.</li>
                    <li>Buterin, Vitalik. 2023. &ldquo;What Do I Think about Biometric Proof of Personhood?&rdquo; vitalik.eth.limo, July 24, 2023. https://vitalik.eth.limo/general/2023/07/24/biometric.html. Accessed October 20, 2026.</li>
                    <li>Buterin, Vitalik, and Tyler Cowen. 2018. &ldquo;Vitalik Buterin on Cryptoeconomics and Markets in Everything.&rdquo; <em>Conversations with Tyler</em>, episode 45, podcast, July 18, 2018. https://conversationswithtyler.com/episodes/vitalik-buterin/. Accessed October 20, 2026.</li>
                    <li>Buterin, Vitalik, Zo&euml; Hitzig, and E. Glen Weyl. 2019. &ldquo;A Flexible Design for Funding Public Goods.&rdquo; <em>Management Science</em> 65 (11): 5171&ndash;5187. https://doi.org/10.1287/mnsc.2019.3337.</li>
                    <li>Catalini, Christian, and Joshua S. Gans. 2020. &ldquo;Some Simple Economics of the Blockchain.&rdquo; <em>Communications of the ACM</em> 63 (7): 80&ndash;90. https://doi.org/10.1145/3359552.</li>
                    <li>Davidson, Sinclair, Primavera De Filippi, and Jason Potts. 2018. &ldquo;Blockchains and the Economic Institutions of Capitalism.&rdquo; <em>Journal of Institutional Economics</em> 14 (4): 639&ndash;658. https://doi.org/10.1017/S1744137417000200.</li>
                    <li>Deb, Soubhik, Robert Raynor, and Sreeram Kannan. 2024. &ldquo;STAKESURE: Proof of Stake Mechanisms with Strong Cryptoeconomic Safety.&rdquo; arXiv preprint, arXiv:2401.05797. https://arxiv.org/abs/2401.05797. Accessed October 23, 2026.</li>
                    <li>Easley, David, Maureen O&rsquo;Hara, and Soumya Basu. 2019. &ldquo;From Mining to Markets: The Evolution of Bitcoin Transaction Fees.&rdquo; <em>Journal of Financial Economics</em> 134 (1): 91&ndash;109. https://doi.org/10.1016/j.jfineco.2019.03.004.</li>
                    <li>Gans, Joshua S. 2019. &ldquo;The Fine Print in Smart Contracts.&rdquo; NBER Working Paper 25443, National Bureau of Economic Research. https://doi.org/10.3386/w25443.</li>
                    <li>Holden, Richard T., and Anup Malani. 2019. &ldquo;Can Blockchain Solve the Hold-up Problem in Contracts?&rdquo; NBER Working Paper 25833, National Bureau of Economic Research. https://doi.org/10.3386/w25833.</li>
                    <li>Huberman, Gur, Jacob D. Leshno, and Ciamac Moallemi. 2021. &ldquo;Monopoly without a Monopolist: An Economic Analysis of the Bitcoin Payment System.&rdquo; <em>Review of Economic Studies</em> 88 (6): 3011&ndash;3040. https://doi.org/10.1093/restud/rdab014.</li>
                    <li>Ito, Kensuke. 2024. &ldquo;Cryptoeconomics and Tokenomics as Economics: A Survey with Opinions.&rdquo; arXiv preprint, arXiv:2407.15715. https://arxiv.org/abs/2407.15715. Accessed October 23, 2026.</li>
                    <li>Kahneman, Daniel, and Amos Tversky. 1979. &ldquo;Prospect Theory: An Analysis of Decision under Risk.&rdquo; <em>Econometrica</em> 47 (2): 263&ndash;291. https://doi.org/10.2307/1914185.</li>
                    <li>Murtazashvili, Ilia, Ali Palida, and Michael J. Madison. 2026. &ldquo;The Past, Present, and Future of Polycentric Legal Order: A Comparative Institutional Analysis of <em>Lex Mercatoria</em> and Blockchain.&rdquo; <em>Journal of Institutional Economics</em> 22: e2. https://doi.org/10.1017/S1744137425100386.</li>
                    <li>Nakamoto, Satoshi. 2008. &ldquo;Bitcoin: A Peer-to-Peer Electronic Cash System.&rdquo; White paper. https://bitcoin.org/bitcoin.pdf. Accessed October 23, 2026.</li>
                    <li>Ohlhaver, Puja, Mikhail Nikulin, and Paula Berman. 2024. &ldquo;Compressed to 0: The Silent Strings of Proof of Personhood.&rdquo; SSRN working paper 4749892. https://doi.org/10.2139/ssrn.4749892.</li>
                    <li>Open Source Observer. 2024. &ldquo;Lessons Learned from Two Years of Retroactive Public Goods Funding.&rdquo; Optimism governance forum, topic 9239. https://gov.optimism.io/t/lessons-learned-from-two-years-of-retroactive-public-goods-funding/9239. Accessed October 20, 2026.</li>
                    <li>Optimism. 2024. &ldquo;Retro Funding 4: Learnings and Reflections.&rdquo; Optimism governance forum, topic 9271. https://gov.optimism.io/t/retro-funding-4-learnings-and-reflections/9271. Accessed October 20, 2026.</li>
                    <li>Pagnotta, Emiliano, and Andrea Buraschi. 2018. &ldquo;An Equilibrium Valuation of Bitcoin and Decentralized Network Assets.&rdquo; Working paper, Imperial College London. https://www.aeaweb.org/conference/2019/preliminary/paper/ESfbQzYt. Accessed October 23, 2026.</li>
                    <li>Prat, Julien, and Benjamin Walter. 2021. &ldquo;An Equilibrium Model of the Market for Bitcoin Mining.&rdquo; <em>Journal of Political Economy</em> 129 (8): 2415&ndash;2452. https://doi.org/10.1086/714445.</li>
                    <li>Schelling, Thomas C. 1960. <em>The Strategy of Conflict</em>. Cambridge, MA: Harvard University Press.</li>
                    <li>Voshmgir, Shermin. 2025. <em>Token Economy</em>. 3rd ed. Token Kitchen. https://doi.org/10.5281/zenodo.15358988.</li>
                    <li>Voshmgir, Shermin, and Michael Zargham. 2020. <em>Foundations of Cryptoeconomic Systems</em>. Working Paper Series 1/2020. Vienna: Institute for Cryptoeconomics, Vienna University of Economics and Business. https://doi.org/10.57938/10d8b646-3266-4ec9-b94d-810b528c40a9.</li>
                    <li>Werbach, Kevin, and Nicolas Cornell. 2017. &ldquo;Contracts Ex Machina.&rdquo; <em>Duke Law Journal</em> 67 (2): 313&ndash;382. https://scholarship.law.duke.edu/dlj/vol67/iss2/2/.</li>
                    <li>Zamfir, Vlad. 2015. &ldquo;What Is Cryptoeconomics?&rdquo; Talk, Cryptoeconomicon. YouTube video, posted by Cryptoeconomicon CCRG, February 1, 2015. https://www.youtube.com/watch?v=9lw3s7iGUXQ. Accessed October 20, 2026. Quoted in Brekke and Alsindi 2021.</li>
                </>
            }
        >
            <PaperSection title="1. The Word">
                <p>
                    The word cryptoeconomics has three founding definitions. Zamfir&rsquo;s 2015 talk is the earliest recorded citation of the term (Voshmgir and Zargham 2020). It defines cryptoeconomics as &ldquo;a formal discipline that studies protocols that govern the production, distribution, and consumption of goods and services in a decentralized digital economy.&rdquo; That discipline &ldquo;focuses on the design and characterization of these protocols&rdquo; (Zamfir 2015, quoted in Brekke and Alsindi 2021), so it asks what a protocol governs. Buterin&rsquo;s 2017 talk presents cryptoeconomics &ldquo;as a methodology for building systems that try to guarantee certain kinds of information security properties&rdquo; (Buterin 2017, quoted in Brekke and Alsindi 2021), and so asks what a system guarantees. Voshmgir and Zargham (2020) define a cryptoeconomic system by &ldquo;individual autonomous actors&rdquo;, &ldquo;economic policies embedded in software&rdquo;, and &ldquo;emergent properties arising from the interactions of those actors with the whole network&rdquo;, and so ask what the system is as a whole.
                </p>
                <p>
                    The field has since sharpened each question. Ito (2024) proposes renaming the field &ldquo;token-based mechanism design&rdquo;. Buterin restated his own definition, &ldquo;cryptoeconomics, first of all, is economics&rdquo;, under constraints that cap punishment, since &ldquo;you cannot drag people’s utility down below zero&rdquo; (Buterin and Cowen 2018). Security became a comparison, &ldquo;Cryptoeconomic Safety: cost-of-corruption &gt; profit-from-corruption&rdquo; (Deb, Raynor, and Kannan 2024), with collusion inside the threat model (Buterin 2019). The object came to be read as an institution beside firms and markets (Davidson, De Filippi, and Potts 2018; Berg, Davidson, and Potts 2019).
                </p>
                <PaperRun title="The object.">
                    Figaro is a protocol: the rules strangers follow to trade and to publish what they trade with. It makes a stranger&rsquo;s promise credible with bonds locked before the trade. The buyer bonds twice the payment and each seller twice the cumulative value through its order; only the buyer resolves, and resolution pays every seller and refunds every bond at once. Each process is an institution that lasts the time of one transaction.
                </PaperRun>
                <p>
                    This paper applies the three founding definitions in their own words. Voshmgir and Zargham&rsquo;s is the spine: it alone defines the system as a whole, and it names the eight disciplines a full account passes through. Later work enters where it sharpens a point, and where a definition names something Figaro lacks, the paper says so.
                </p>
            </PaperSection>

            <PaperSection title="2. What Figaro Governs">
                <PaperRun title="The economy.">
                    Figaro governs trade in goods, work, or data of any kind: any chain of added value, bounded only by what the network can resolve in one call. The protocol is decentralized, as Zamfir asks, and the economy is digital in a precise sense. The commitments, bonds, and trail are on-chain, while the goods, the work, and the parties&rsquo; knowledge of them pass off-chain, beyond the protocol&rsquo;s sight. Many buyers trade at once, each opening processes of its own, and within a process every order has that one buyer. A seller in one process may open another as its buyer, so a supply chain of any depth composes as many processes. The Core is the set of contracts that holds the bonds and executes two calls, commit and resolve. It sees each process alone, and each resolves atomically by its own buyer, never across processes. Many processes can also be resolved together in a batch on the strength of one validity proof, a succinct cryptographic proof the chain verifies that each process was computed under the same rules; buyer dominance holds in each.
                </PaperRun>
                <PaperRun title="Who acts.">
                    Every asset is a wallet: a kitchen, a machine, a person&rsquo;s labor, an agent selling its own service. The wallet is a signing key and its balance, the only identity the protocol knows; the operator is whoever holds the key, a person or an agent. An agent buys, sells, and designs clauses, agreements, and assemblies on the same footing as a person, reading the same public registries and data.
                </PaperRun>
                <p>
                    Voshmgir and Zargham&rsquo;s table for the Bitcoin system has three vertex types: the entity, an &ldquo;Off-chain unique identity of a person or organization&rdquo;; the account, an &ldquo;On-chain address controllable via a private key&rdquo;; and the node, &ldquo;Software and hardware participating in a peer-to-peer network&rdquo;. A wallet is an account, and an operator the entity that controls its keys. An asset is wider than an entity: a machine or a kitchen is a party in its own right. Figaro runs above a chain and inherits its nodes&rsquo; consensus. Is it then a cryptoeconomic system or an application on one? It is a system at the meso level of Section 5: above the chain&rsquo;s consensus it adds incentive mechanisms of its own, the bonds, the reward, and the stake.
                </p>
                <PaperRun title="Production.">
                    Sellers produce value, each adding its part in its own order. Designers produce the terms: clauses, reusable terms registered publicly for anyone to compose; agreements, the clauses composed for one order with the designer&rsquo;s fills, registered under the fingerprint of their content; and assemblies, reusable designs of a process composed from agreements. The clauses registered cover payment and acceptance, carriage and handling, trade terms, applicable law and forums, credentials and consent, schedules and places, emissions, and the terms on which data is shared or licensed. Processes produce data: what was committed, attested, and resolved. That trail is the process&rsquo;s own books, for regulatory, legal, fiscal, and market-making purposes first and analysis last: one decomposition of what the buyer paid is the buyer&rsquo;s checkout, the trail a regulator reads, and the invoice. Its public part is the signal from which members and agents find work and demand, by reading the public graphs themselves.
                </PaperRun>
                <PaperRun title="Distribution.">
                    Resolution transfers every payment and refunds every bond at once, the buyer&rsquo;s less the payments it carried. Designer rewards distribute florins after the fact, in proportion to the real use processes made of each clause, registered agreement, and assembly. The data divides at a seam: the aggregate map is public, and the private detail belongs to the parties, who keep it sealed or sell it on their own terms. What only a counterparty needs travels between the parties under a hash anchored on-chain; each holder may unpin its own copy, and a party may reveal it to a forum, which checks it against the hash.
                </PaperRun>
                <PaperRun title="Consumption.">
                    The buyer is the one party who pays and the only party who can resolve, and resolving is its acceptance of what arrived. Every process leaves both of its parties data. A buyer that is a member may sell its share, and in that sale it is the seller of record.
                </PaperRun>
                <PaperRun title="Design and characterization.">
                    The Core runs two mechanisms under one constraint: asymmetric bonding at commit; buyer dominance with atomic resolution at resolve; and no escape hatches, since commit and resolve are its only operations. A buyer that loses its key, with no recovery arrangement installed on its wallet while it still holds its key, strands every bond in its process. The arrangement is the wallet&rsquo;s, never the Core&rsquo;s, and it reaches a resolution called on the direct path, not one signed for the batch path. The Core sees each process as a linear chain of commitments extending one accumulator; who comes before whom is a clause in the parties&rsquo; agreement. The equilibrium is proved, and its best-response inequalities are checked again in a proof assistant, separately from the code. The implementation is checked by exhaustive model checking, property-based fuzzing, symbolic execution, and specification checking, under a stated threat model. How people play is a separate question: &ldquo;the level of security very much depends on how people react to economic incentives&rdquo; (Voshmgir and Zargham 2020).
                </PaperRun>
                <PaperRun title="Composition.">
                    A process composes with any other contract on the chain. A swap can fund a party&rsquo;s bond from another token it holds, delivering the process&rsquo;s denomination at commit; a payment splitter can divide what a seller received after resolution; a forum can rule on the open process. A composed contract supplies terms, funding, evidence, or consequences, never a signature. Off the chain, a process composes with legal and regulatory norms through the data it leaves: an EU electronic invoice, ESG reporting, GDPR, taxation. Composition is what makes the protocol a network rather than a silo.
                </PaperRun>
            </PaperSection>

            <PaperSection title="3. What Figaro Guarantees">
                <p>
                    Buterin&rsquo;s information security properties are, for Figaro, its six invariants, and the six describe how the two mechanisms and the one constraint of Section 2 work. Two concern the bond: <em>asymmetric bonding</em>, the buyer locking twice the payment and each seller twice the value at its link; and <em>cumulative bonding</em>, that value including everything added ahead of it. Two concern resolution: <em>buyer dominance</em>, only the buyer closing a process; and <em>atomic resolution</em>, all orders or none. Two concern the evidence and the exits: <em>immutable evidence</em>, each step bound to the signed agreement by its fingerprint as it happens; and <em>no escape hatches</em>, commit and resolve being the only moves. Cryptography guarantees what is signed. Are bond schedules information security properties in Buterin&rsquo;s sense? Each of the six is a property of the contracts&rsquo; code, checkable from the chain, and together they make keeping one&rsquo;s word each party&rsquo;s best reply to the buyer&rsquo;s plan to resolve once performance has occurred and not before, the equilibrium stated below.
                </p>
                <PaperRun title="The bond, stated as security.">
                    Each bond is its party&rsquo;s own deterrent, measured net of what a defector keeps. Write <Math>{"P"}</Math> for the payment at an order and <Math>{"G"}</Math> for the cumulative value through it. A seller that walks away keeps at most what it holds, worth at most <Math>{"G"}</Math>, and leaves its bond of <Math>{"2G"}</Math> locked. A buyer that never resolves after performance keeps what arrived, worth <Math>{"P"}</Math>, and leaves its bond of <Math>{"2P"}</Math> locked, the payment inside it.
                </PaperRun>
                <div className="my-2">
                    <Math display>{"\\text{seller: } G - 2G = -G \\;<\\; +P \\qquad\\qquad \\text{buyer: } P - 2P = -P \\;<\\; 0"}</Math>
                </div>
                <p>
                    The left of each line is what a defector nets. The right is what the same party nets by keeping its word: the seller is paid <Math>{"P"}</Math>, and the buyer, having paid <Math>{"P"}</Math> for what arrived, nets zero. On each side what defection leaves locked exceeds what the defector keeps, so the defector ends below what keeping its word nets: the buyer after performance unconditionally, the seller against the buyer&rsquo;s plan stated next; the seller&rsquo;s margin between performing and holding out is at least <Math>{"P + G \\ge 2P"}</Math>.
                </p>
                <PaperRun title="The equilibrium.">
                    The result is a best-response fixed point, not a dominance result, and it stands on one anchor. (a) After performance the buyer strictly prefers resolving, which nets <Math>{"0"}</Math>, to never resolving, which nets <Math>{"-P"}</Math>, with no assumption about the seller. (b) Given (a) and the buyer&rsquo;s plan to resolve once performance has occurred and not before, each seller strictly prefers performing, <Math>{"+P"}</Math>, to never performing, at most <Math>{"-G"}</Math>. (c) Given (b), before performance the buyer strictly prefers keeping the process open, which nets <Math>{"0"}</Math> once the seller performs, to resolving at once, which is terminal and nets <Math>{"-P"}</Math>. (b) and (c) are the two parties&rsquo; best-response checks against one profile, verified jointly, and that joint check is the fixed point; (a) holds unconditionally and lies outside it.
                </PaperRun>
                <p>
                    On a process that will not close, holding out beats performing strictly only when the seller retains something; at zero retention the two are equal. The result is therefore conditional on the seller&rsquo;s side. A second equilibrium exists: the seller never performs and the buyer resolves regardless, at <Math>{"-P"}</Math> to the buyer and at most <Math>{"P + G"}</Math> to the seller, sustained only by a buyer that has given up the instrument the mechanism reserves to it. The same comparisons hold at every order of a longer process while its co-sellers perform; where one holds out, Section 4 gives the co-sellers&rsquo; reply.
                </p>
                <PaperRun title="Collusion and bribery.">
                    The field now assumes collusion: &ldquo;it is much harder, and more likely to be outright impossible, to make mechanisms that maintain desirable properties in a model where participants can collude&rdquo; (Buterin 2019). Figaro&rsquo;s answer is that after commit the chain accepts exactly one judgment, the buyer&rsquo;s resolution (Section 5), so an outside payment has only the parties&rsquo; own comparisons to change. An outside payment that makes holding out worth a seller&rsquo;s while must exceed its margin of <Math>{"P + G"}</Math>, and one that makes a buyer withhold after performance must exceed <Math>{"P"}</Math>. A payment made conditional on holding out, and larger than the margin, does change the comparison, though it must be renewed for as long as the process stands open. Parties acting together can also emit perfectly formed books for a trade whose service was never rendered. The data proves what the Core enforced, never the world.
                </PaperRun>
                <PaperRun title="What must be verifiable, and by whom.">
                    Asgaonkar and Krishnamachari (2019) prove that, with deposits on both sides, &ldquo;honest behavior by both parties is the only subgame perfect Nash equilibrium&rdquo; of their exchange game. Their result holds for any positive deposits, so it says nothing for or against twice the payment. They state its condition: the problem becomes considerably harder without a trusted third party &ldquo;if the buyer cannot independently verify the delivery.&rdquo; In Figaro a party may attest that it delivered, and the chain holds the attestation&rsquo;s content hash, but no report of delivery decides resolution. The judgment their condition names is the buyer&rsquo;s, and resolving expresses it.
                </PaperRun>
                <PaperRun title="When the mechanism is not enough.">
                    Budish (2025) concludes that deterring the largest attacks on a chain needs &ldquo;a source of trust support external to the protocol, such as rule of law&rdquo;. Figaro answers with five layers, innermost first: the chain, whose consensus makes the data authentic; the bonds; the co-sellers, whose payment waits on the same resolution; an arbitration forum, which rules on the data; and the courts, which read it from outside. The inner layers are built to carry the ordinary process, and the outer ones exist for the remainder.
                </PaperRun>
            </PaperSection>

            <PaperSection title="4. The Incentive Mechanisms">
                <p>
                    Voshmgir and Zargham define purpose-driven tokens as steering collective action &ldquo;towards a collective goal in the absence of intermediaries&rdquo;. Of designing one, they hold that &ldquo;it is more realistic to take a polycentric viewpoint where there is no one social optimum&rdquo;, since &ldquo;any choice of coordination objective is a subjective choice&rdquo;. Figaro&rsquo;s ends are several, and three of them are these: cooperation is the equilibrium on every order; value moves from the top of hierarchies to the assets that produce; and each asset earns what it needs to keep taking part, a productive life.
                </p>
                <PaperScroll className="my-4">
                    <table className="text-sm border-collapse w-full">
                        <thead>
                            <tr>
                                <th className={th}>Mechanism</th>
                                <th className={th}>Whom it moves</th>
                                <th className={th}>Toward what</th>
                                <th className={th}>Token</th>
                            </tr>
                        </thead>
                        <tbody>
                            {[
                                ["Asymmetric bonding", "The buyer and each seller", "Keeping their word on each order", "The process's denomination"],
                                ["Buyer dominance with atomic resolution", "The co-sellers of a process", "Putting any one seller's fault right before resolution", "The same bonds"],
                                ["The stake", "Members and designers", "Being found, being rewarded, an identity priced per stake", "The base chain's own currency"],
                                ["Designer rewards", "Designers", "Publishing what real trade uses", "The florin"],
                                ["The florin", "Strangers choosing a unit", "A unit they can converge on", "The florin"],
                                ["The DAO's treasury and income", "The DAO", "Funding what use cannot yet measure; its income tracks use", "The florins and stake it holds"],
                                ["Utility and community tokens", "Designers; communities", "A share priced by use; worth sustained at home", "Their own"],
                                ["The data market", "Every party to a process", "Selling its own data on its own terms", "The sale's denomination"],
                                ["Catalog prices and offer formation", "Sellers; buyers", "Posting prices; answering requests", "The process's denomination"],
                            ].map(([m, w, t, k]) => (
                                <tr key={m}>
                                    <td className={td}>{m}</td>
                                    <td className={td}>{w}</td>
                                    <td className={td}>{t}</td>
                                    <td className={td}>{k}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </PaperScroll>
                <PaperRun title="The two mechanisms of the Core.">
                    Asymmetric bonding secures each order and scales; buyer dominance with atomic resolution coordinates what the bonds already secured. Nobody is paid until the buyer resolves, so when one seller&rsquo;s work is faulty, every co-seller holds a bonded interest in helping put it right. This one-shot weakest-link game reproduces the coordination-pressure component of joint-liability lending, though not its peer selection or monitoring.
                </PaperRun>
                <PaperRun title="The stake.">
                    Members and designers register by placing the base chain&rsquo;s own currency, reclaimable, whose minting and supply belong to that chain; a member&rsquo;s withdrawal waits out a cooldown, so each stake can serve only a bounded number of identities in a period. The stake aligns the honest majority. It does not deter a determined Sybil, one actor posing as many. The bound on farming is dilution per unit of attacker capital. A period&rsquo;s budget is shared pro rata to score, so an attacker holding score <Math>{"S_a"}</Math> against an honest total <Math>{"S_h"}</Math> captures the fraction <Math>{"\\varphi = S_a/(S_a + S_h)"}</Math>, and capturing <Math>{"\\varphi"}</Math> requires
                </PaperRun>
                <div className="my-2">
                    <Math display>{"S_a \\;=\\; \\frac{\\varphi}{1-\\varphi}\\, S_h ."}</Math>
                </div>
                <p>
                    The capital that score costs is assumed, not derived. We take each unit of score to cost the attacker at least a fixed amount <Math>{"\\kappa > 0"}</Math> of live stake, the time value of bonds, and gas. Capturing <Math>{"\\varphi"}</Math> costs at least <Math>{"\\kappa\\,\\varphi S_h/(1-\\varphi)"}</Math>, linear in the score. The assumption has a ground for a single published item. Its score, defined below, is homogeneous of degree one in the processes and the distinct sellers that carry it, so when each process and each seller&rsquo;s stake costs a fixed amount, the cheapest way to reach a score scales with it.
                </p>
                <PaperRun title="Designer rewards.">
                    A clause&rsquo;s, a registered agreement&rsquo;s, or an assembly&rsquo;s score in a period is its real use alone, <Math>{"(c\\,d^{2})^{1/3}"}</Math>, where <Math>{"c"}</Math> counts the processes that used it and <Math>{"d"}</Math> the distinct live-staked sellers who carried it. Below a minimum number of such sellers the score is zero. Use is counted once a process has resolved, from the clauses, registered agreements, and assemblies its signed agreements committed, each process once. Both the seller of record and the designer must hold a live stake. Budgets rise across three groups of periods, so the largest fall on the best-measured evidence. The DAO spends its treasury by human judgment, and its own income arises only when the network is used: it is designer of record of the clauses every process composes by convention, whose use accrues to it on the same meter as any designer&rsquo;s.
                </PaperRun>
                <PaperRun title="Denominations, data, and offers.">
                    Any ERC-20 (the Ethereum standard interface for fungible tokens) with fixed balances and exact transfers may denominate a process, one token per process. Among others, that token may be a coordination token, such as a stablecoin (a token built to hold a steady price against an outside currency) or the florin; a community token; or a designer&rsquo;s utility token. A utility token is pinned to an assembly, its worth is discovered through use of the assembly, and it is the designer&rsquo;s share in what it built. Figaro accepts community and utility tokens and issues neither; the only token it issues is the florin. A data sale is an ordinary bonded trade, and an offer forms by a dispatch race or a request for quotes.
                </PaperRun>
                <p>
                    The two tokens with a design of their own, in Voshmgir&rsquo;s (2025) seven properties:
                </p>
                <PaperScroll className="my-4">
                    <table className="text-sm border-collapse w-full">
                        <thead>
                            <tr>
                                <th className={th}>Property</th>
                                <th className={th}>The florin</th>
                                <th className={th}>A designer&rsquo;s utility token</th>
                            </tr>
                        </thead>
                        <tbody>
                            {[
                                ["Embedded rights", "None: a unit strangers converge on, with no claim on revenue and no vote", "Denominates every process of the designer's assembly"],
                                ["Fungibility", "Fungible (ERC-20)", "Fungible (ERC-20)"],
                                ["Transferability", "Freely transferable", "Freely transferable"],
                                ["Minting event", "Four tenths at genesis; six tenths per period, by designers' claims for counted use", "The designer's choice"],
                                ["Expiry event", "None", "The designer's choice"],
                                ["Stability mechanism or pricing strategy", "None; neither the DAO's treasury nor the founder ever sells, buys, or provides liquidity", "Discovered through use of the assembly"],
                                ["Supply & distribution", "Fixed at one billion: 60% designer rewards, 30% the DAO, 10% founder and supporters", "The designer's choice"],
                            ].map(([p, f, u]) => (
                                <tr key={p}>
                                    <td className={td}>{p}</td>
                                    <td className={td}>{f}</td>
                                    <td className={td}>{u}</td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </PaperScroll>
                <PaperRun title="The field&rsquo;s experience with formula rewards.">
                    &ldquo;The central vulnerabilities of QF [quadratic funding] are collusion and fraud&rdquo; (Buterin, Hitzig, and Weyl 2019). In retroactive funding, &ldquo;mega rounds devolve into popularity contests&rdquo;, and &ldquo;we don’t (yet) have the data to show that retroactive funding produces superior outcomes&rdquo; (Open Source Observer 2024); &ldquo;Any metric can be gameable&rdquo;, in the words of a participant quoted in Optimism&rsquo;s report on its fourth round (Optimism 2024). Proof of personhood is a check that each account belongs to one distinct human. On Idena, a network whose members prove it by solving puzzles in one simultaneous online session, &ldquo;hidden pools rapidly emerged&rdquo; (Ohlhaver, Nikulin, and Berman 2024).
                </PaperRun>
                <p>
                    Figaro addresses some of these failure modes. No vote allocates, so there is no popularity contest and no ballot to buy. Eligibility is never declared; use is counted from the resolved process. Identity is priced by a live stake on both sides; the pool is fixed, so farming dilutes it and never inflates it; and the minimum number of distinct staked sellers keeps what one actor fabricates alone off the board.
                </p>
                <p>
                    Other failure modes remain. No score can tell a fabricated counterparty from a genuine one, so an attacker with capital is bounded only by the dilution it pays for. Any stake meets Buterin&rsquo;s point that &ldquo;sometimes a price high enough to keep out attackers is also too high for many lower-income legitimate users&rdquo; (Buterin 2023). And the meter measures use, never worth: a public good no trade composes earns nothing from it, which is why the DAO&rsquo;s judgment stands beside the meter.
                </p>
            </PaperSection>

            <PaperSection title="5. The System">
                <p>
                    Voshmgir and Zargham&rsquo;s definition applies term by term. The autonomous actors are assets, each acting through its wallet and operated by a person or an agent; the policies embedded in software are the Core, the public registries, and the meter that counts use. Their three levels are levels of analysis, not sizes: micro-foundational, &ldquo;relating to agent level behaviors&rdquo;, which in Figaro is the comparison each party makes at its own order; meso-institutional, &ldquo;relating to policy setting and governance&rdquo;; and macro-observable, which in Figaro is what the public data shows.
                </p>
                <PaperRun title="The markets.">
                    A blockchain has four markets, one standing on the next. At the bottom is the market for the resource, electricity: in Budish&rsquo;s (2025) accounting the per-block cost of securing the chain is electricity plus the rental of equipment, and that cost must grow with the value the chain protects. Above it is the market for the machinery that turns the resource into a service, the warehouse, the wiring, the ASICs or the computers, and the software, open source though it is: Prat and Walter (2021) model it as a market with free entry in which the token&rsquo;s exchange rate sets the computing power the network attracts, and find that most of what mining earned was reinvested in hardware. Above that is the market for block production, the service itself: Bitcoin and the chains that followed it use mechanism design, a microeconomics, to make honest validation each participant&rsquo;s best strategy in that market, and the producers are paid by what each transaction gives to have its block produced, together with a subsidy in newly issued tokens that Nakamoto (2008, &sect; 6) set to finance the network&rsquo;s growth and to give way to user payments over time (Easley, O&rsquo;Hara, and Basu 2019); Huberman, Leshno, and Moallemi (2021) show that price and capacity in this market are set together by congestion, in a monopoly run by a protocol rather than by a firm. At the top is the market for the token itself, how much value a holder is willing to store in it: Pagnotta and Buraschi (2018) show that the token&rsquo;s price and the chain&rsquo;s security are determined together, since those who secure the chain are paid in the token its users hold, so the token&rsquo;s worth rises and falls with the security the three markets beneath it deliver (Catalini and Gans 2020 give the costs the service lowers, verification and networking).
                </PaperRun>
                <PaperRun title="The markets above the chain&rsquo;s.">
                    The markets that remain stand on top of these four, formed with a microeconomics of Figaro&rsquo;s own, and the four rungs recur. At the bottom the resource: the real-world asset each wallet represents. Above it the machinery that turns the resource into a service: the clauses, agreements, and assemblies designers compose and sellers bind. Above that the production: the process, a trade between strangers, paid by the buyer&rsquo;s payment. At the top the token: a designer&rsquo;s utility token, how much value a holder stores in it to reach the resource; a community&rsquo;s token; the florin; each an ERC-20 like most others. The bonded commitment secures the third rung as a consensus protocol secures block production, by making performance and resolution each party&rsquo;s best strategy in that market, with nothing taken for itself: a Figaro transaction pays only gas, the chain&rsquo;s own charge for its security, and so inherits the network&rsquo;s security. On top of all of these Figaro secures a fifth market, the one that matters most: the market for data. Every process leaves its data, fingerprinted on the chain and held by the parties that produced it, theirs to keep, to sell, or to show a regulator, a court, or an auditor, with no platform holding it for them. That flips the platform company&rsquo;s hegemony over data in the user&rsquo;s favor, since the data is censorship resistant, and it reduces the impact of hacking: a breach reaches one party&rsquo;s data, never a platform&rsquo;s store of everyone&rsquo;s. And Figaro composes with what stands beside these markets, on-chain contracts, a swap between tokens, a splitter of one payment among many, off-chain components, dispute resolution, taxation, savings, so the markets above its microeconomics are not a closed set.
                </PaperRun>
                <PaperRun title="What emerges.">
                    Communities emerge from a signal: the tokens a wallet holds and the assemblies it trades through say which communities and designs it takes part in, and communities can form around that signal, not only around it. A public map of trade emerges from the aggregate data. Value moves to the assets that produce, resting where each earns what it needs to keep taking part. These are what the design is built to produce, under Voshmgir and Zargham&rsquo;s caution that &ldquo;the system level behaviour cannot be inferred from the local state changes induced by individual network actors&rdquo;.
                </PaperRun>
                <PaperRun title="The loop.">
                    A wallet stakes and publishes; members trade on the published terms; once a process resolves, its use of each clause, registered agreement, and assembly is counted, and designers are rewarded for it; each party may sell its data in a trade of its own. The stake is the chain&rsquo;s own currency, so its worth rises and falls with demand for the chain, to which the network&rsquo;s use, one&rsquo;s own work included, adds. The Core is deployed once and anyone builds above it, clauses, registered agreements, assemblies, interfaces, and other contracts alike, so every process&rsquo;s public data lies on one map.
                </PaperRun>
                <PaperRun title="The meso level.">
                    For Voshmgir and Zargham &ldquo;governance is precisely managing the relationship between the micro and macro scales&rdquo;, and &ldquo;automation in socioeconomic systems is tantamount to algorithmic policy making&rdquo;. In Figaro, nothing moves a bonded commitment but its buyer. The DAO governs its own treasury and reaches nothing else: no DAO vote can touch a commitment, a bond, a registry binding, or a resolution. Designers set policy by publishing; sellers set it by binding the assemblies they trade under, and buyers by selecting among them.
                </PaperRun>
            </PaperSection>

            <PaperSection title="6. The Institution">
                <p>
                    Voshmgir and Zargham claim cryptoeconomic infrastructure can &ldquo;reduce the principal-agent dilemma of organizations&rdquo; through transparency, &ldquo;disintermediate by reducing bureaucracy&rdquo;, and &ldquo;replace the reactive procedural security of the current legal system, with proactive and automated mechanisms that make a potential breach of contract expensive and therefore infeasible&rdquo;. Figaro&rsquo;s own position: it displaces, but does not completely substitute, the institutions that make a stranger&rsquo;s promise good after the fact. The firm, the platform, and the court act after the trade, by authority; Figaro acts before it, with a bond, so their apparatus is needed far less.
                </p>
                <PaperRun title="Among the institutions.">
                    Davidson, De Filippi, and Potts (2018) read the blockchain as an economic institution of capitalism, set beside the firm and the market, and Berg, Davidson, and Potts (2019) read it as economic infrastructure beside markets, firms, governments, clubs, and the commons. Figaro&rsquo;s entry in that line is the process, a transaction-scoped institution that dissolves at its resolution, leaving its own books.
                </PaperRun>
                <PaperRun title="Contract doctrine.">
                    Werbach and Cornell (2017) test smart contracts against meeting of the minds, consideration, capacity, and legality, and conclude: &ldquo;But smart contracts will not displace contract law.&rdquo; Their reason is &ldquo;the essential role of contract law as a remedial institution&rdquo;. Figaro stands beside that conclusion. A binding contract in law needs six elements, and each has its place.
                </PaperRun>
                <p>
                    Offer is the buyer&rsquo;s signature over the commitment, carried to the seller, and acceptance the seller&rsquo;s counter-signature over the same commitment. Mutual assent, the meeting of the minds Werbach and Cornell test, is the Core&rsquo;s check at commit that both signatures recover to the named parties over one hash. Consideration, the value each side gives the other, is the seller&rsquo;s performance and the buyer&rsquo;s payment. The payment travels inside the buyer&rsquo;s bond, half of which is the payment and half the deterrent; each seller&rsquo;s bond is deterrent only and is refunded whole. Capacity at commit is any wallet that can sign and fund its bond, a person&rsquo;s or an agent&rsquo;s, while the law&rsquo;s own capacity stays the person&rsquo;s status. Legality enters through the clauses composed into the agreement, or through a forum ruling on the data. These are the law&rsquo;s six elements, not Figaro&rsquo;s.
                </p>
                <p>
                    The contract&rsquo;s terms are the agreement, the clauses composed for one order; its warranties and representations are the attestations each party gives while the process is open, each signed and bound to the order it concerns. The chain checks that a warranty is signed and bound, never that it is true. What stands behind a seller&rsquo;s warranty is the buyer&rsquo;s decision to withhold resolution, at the price of its own locked bond, until a false one is put right. A buyer&rsquo;s own attestation meets no such pressure, because the buyer is the party that resolves. After resolution every attestation stays in the data: the evidence a forum reads, and a line in its signer&rsquo;s resolution history, the resolved processes a wallet was a party to and the attestations it carries. A wallet can manufacture that history by trading with itself, since nothing forbids one wallet, or two wallets of one operator, from being buyer and seller of an order, and a reader weighing the history weighs that.
                </p>
                <PaperRun title="Incomplete contracts.">
                    For the gaps every contract leaves, &ldquo;One can resort to formal dispute resolution (judiciary) or informal dispute resolution (bargaining) to resolve such contractual gaps&rdquo; (Voshmgir and Zargham 2020). Gans (2019) holds that &ldquo;the commitment engendered by the blockchain could substitute for a lack of trust in the real world&rdquo;, and finds the limit in &ldquo;obligations that cannot be easily measured&rdquo;. Holden and Malani (2019) answer hold-up by asking parties &ldquo;to place enough assets in their accounts on the blockchain network to cover penalties until both parties satisfactorily perform on the contract&rdquo;. Figaro&rsquo;s bonds are placed that way, and the measure of performance is the buyer&rsquo;s own satisfaction, which no third party has to measure. What a contract leaves incomplete is put right before resolution: a failing seller sends the buyer the payment it stands to receive and makes good what it holds. Where the parties cannot agree, a forum&rsquo;s ruling reaches the process in the way Section 7 states; resolution is terminal acceptance.
                </PaperRun>
                <PaperRun title="Two layers.">
                    Murtazashvili, Palida, and Madison (2026) describe an <em>ex ante</em> layer, where &ldquo;blockchains function as self-executing ledgers&rdquo;, and an <em>ex post</em> layer, where &ldquo;blockchain systems often resolve them internally through mechanisms like DAOs&rdquo; or through off-chain bodies. Figaro has the first layer and the off-chain half of the second. Their internal dispute layer of DAOs has no counterpart in Figaro, whose DAO governs only its own treasury (Section 5).
                </PaperRun>
            </PaperSection>

            <PaperSection title="7. The Eight Disciplines">
                <p>
                    Voshmgir and Zargham name eight disciplines a full account of a cryptoeconomic system passes through. Read in their order, each restates the mechanism of the sections above in its own terms, and most draw a result from it.
                </p>
                <PaperRun title="Industrial and Systems Engineering.">
                    A service with many providers decomposes into one process: each provider is a seller in its own order, bonded under the same buyer, and one resolution pays them all. An air journey is such a service, with the carrier, the airport, and the ground handler each a seller to the passenger. Container shipping across rival carriers composes the same way. Any designer may publish the assembly, and each carrier binds it, so no rival&rsquo;s gatekeeping has to be accepted.
                </PaperRun>
                <PaperRun title="AI, Optimization and Control Theory.">
                    The Core reads signatures and bond posture, never the kind of entity behind a key, so the equilibrium extends without modification to autonomous agents, and a wallet&rsquo;s policy reads as a controller over bonded commitments.
                </PaperRun>
                <PaperRun title="Computer Science and Cryptography.">
                    A contract of two calls, with no timeout and no upgrade path, is verified by several classes of check, each reaching a different part of a claim whose threat model and scope are stated.
                </PaperRun>
                <PaperRun title="Economics and Game Theory.">
                    The bonding equilibrium of Section 3 holds at every order of a process while its co-sellers perform. Markets form without a venue, by the dispatch race on posted prices or the request for quotes of Section 4. A stranger&rsquo;s promise enforces itself for the network&rsquo;s gas and the time value of a bond, so the institution a trade needs lasts the time of that trade. The florin carries no claim on revenue and no vote, and neither the DAO nor the founder trades it; what can make it a unit is that strangers converge on it, the focal point Schelling (1960) describes. Arrow&rsquo;s (1962) information paradox is that a buyer cannot value information before seeing it, and a seller who shows it has given it away. A bonded data sale meets the paradox with the comparison of Section 3: once the data is delivered, resolving is the buyer&rsquo;s strictly better reply, zero against <Math>{"-P"}</Math>.
                </PaperRun>
                <PaperRun title="Psychology and Decisions Science.">
                    Each party&rsquo;s comparison in Section 3 sets a certain loss against a certain gain or zero: the seller&rsquo;s <Math>{"-G"}</Math> against <Math>{"+P"}</Math>, the buyer&rsquo;s <Math>{"-P"}</Math> against <Math>{"0"}</Math>. Measured from where each party stood, defection is the branch with the loss, so loss aversion (Kahneman and Tversky 1979) adds weight against it. The equilibrium holds without that weight. Whatever happens between commit and resolve the parties square before the terminal call, as Section 6 states.
                </PaperRun>
                <PaperRun title="Political Science, Institutional Economics and Governance.">
                    The politics lives in the graph composed above the mechanism. Every process is transparent, and every wallet picks the communities and the units it coordinates with. Economic doctrines therefore stop being systems one must choose between and become terms in a trade: a market-liberal graph, a cooperative graph, and a mutual-aid graph run on the same Core. Capacity at commit is any wallet that can sign and fund its bond, so a person without state papers can trade; the law&rsquo;s own capacity, age and competence, stays that person&rsquo;s status and is read where the law reads it. Through its bonded wallet, an asset is at once what produces and the party that trades. No vote reaches a commitment, as Section 5 states, so the same Core can sit beneath governed entities and beneath rival trade corridors alike.
                </PaperRun>
                <PaperRun title="Philosophy, Law and Ethics.">
                    Resolution is on-chain and adjudication off-chain: a forum rules on the signed, fingerprinted data and cannot call resolve, so its ruling reaches the process through the parties. Bilateral commerce is enforced with no third party applying force, because each party&rsquo;s own bond carries its deterrent. No standing relationship outlasts the process: each value-adder bonds, is paid, and is refunded in its own order, and the relationship dissolves at resolution. The Core&rsquo;s rules are fixed at deployment, so they stand as an entrenched procedural layer beneath the clauses parties enact above them.
                </PaperRun>
                <PaperRun title="Operations Research and Management Science.">
                    A process&rsquo;s books close themselves. The bonds enter at commit; at resolution every payment moves and every bond is refunded, so nothing remains and the process ends with zero equity. Its commitments read as journal entries and its resolution as the closing entry of one accounting period. Designer rewards allocate a fixed reserve by counted use, with breadth over volume, since the score weights distinct sellers above processes, and a two-sided live stake whose cost bound Section 4 states.
                </PaperRun>
            </PaperSection>

            <PaperSection title="8. Conclusion">
                <p>
                    Read through the field&rsquo;s definitions, Figaro governs trade in goods, work, or data. It guarantees six invariants, and its bond meets the field&rsquo;s statement of security on both sides of every order. Its incentive mechanisms serve several ends, so its collective goal is plural by design. It is a system of autonomous actors and policies in software, and as an institution it acts before the trade, lasts the time of one transaction, and leaves the remainder to the institutions that act after it.
                </p>
            </PaperSection>
        </PaperLayout>
    );
}
