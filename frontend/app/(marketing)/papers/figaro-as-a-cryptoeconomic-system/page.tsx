import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import { PaperLayout, PaperSection, PaperRun } from "@/components/papers/PaperLayout";
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
                        Cryptoeconomics has three founding definitions: what a system governs (Zamfir), what it tries to guarantee (Buterin), and what it is as a whole (Voshmgir and Zargham). This paper answers all three for Figaro, a decentralized, permissionless protocol under which strangers trade with bonds locked before the trade. Figaro governs trade in goods, work or data of any kind. It guarantees six invariants, and its bond meets the field&rsquo;s statement of security: at every order, what defection leaves deposited exceeds what the defector keeps.
                    </p>
                    <p>
                        Its incentive mechanisms move different parties toward different ends, so its collective goal is plural. It has autonomous actors, policies embedded in software and emergent properties. As an institution it acts before the trade, where the firm, the platform and the court act after it, and it displaces them without completely substituting for them. The paper closes with what each of Voshmgir and Zargham&rsquo;s eight disciplines establishes.
                    </p>
                </>
            }
            references={
                <>
                    <li>Alsindi, W. Z., Miller, A., &amp; Narula, N. Note from the Editors. <em>Cryptoeconomic Systems</em>, 2020. https://cryptoeconomicsystems.pubpub.org/pub/1g06a6ws/release/3</li>
                    <li>Asgaonkar, A. &amp; Krishnamachari, B. Solving the Buyer and Seller&rsquo;s Dilemma: A Dual-Deposit Escrow Smart Contract for Provably Cheat-Proof Delivery and Payment for a Digital Good without a Trusted Mediator. arXiv:1806.08379, 2018.</li>
                    <li>Berg, C., Davidson, S., &amp; Potts, J. <em>Understanding the Blockchain Economy: An Introduction to Institutional Cryptoeconomics</em>. Edward Elgar, Cheltenham, 2019.</li>
                    <li>Brekke, J. K. &amp; Alsindi, W. Z. Cryptoeconomics. <em>Internet Policy Review</em>, 10(2), 2021. https://doi.org/10.14763/2021.2.1553</li>
                    <li>Budish, E. Trust at Scale: The Economic Limits of Cryptocurrencies and Blockchains. <em>Quarterly Journal of Economics</em>, 140(1), 2025.</li>
                    <li>Buterin, V. Introduction to Cryptoeconomics. Talk, Ethereum Foundation, 2017. Quoted from Brekke &amp; Alsindi (2021).</li>
                    <li>Buterin, V. On Collusion. vitalik.eth.limo, 3 April 2019. https://vitalik.eth.limo/general/2019/04/03/collusion.html</li>
                    <li>Buterin, V. What Do I Think about Biometric Proof of Personhood? vitalik.eth.limo, 24 July 2023. https://vitalik.eth.limo/general/2023/07/24/biometric.html</li>
                    <li>Buterin, V. &amp; Cowen, T. Vitalik Buterin on Cryptoeconomics and Markets in Everything. <em>Conversations with Tyler</em>, episode 45, 2018. https://conversationswithtyler.com/episodes/vitalik-buterin/</li>
                    <li>Buterin, V., Hitzig, Z., &amp; Weyl, E. G. A Flexible Design for Funding Public Goods. <em>Management Science</em>, 65(11):5171&ndash;5187, 2019.</li>
                    <li>Davidson, S., De Filippi, P., &amp; Potts, J. Blockchains and the Economic Institutions of Capitalism. <em>Journal of Institutional Economics</em>, 14(4):639&ndash;658, 2018.</li>
                    <li>Deb, S., Raynor, R., &amp; Kannan, S. STAKESURE: Proof of Stake Mechanisms with Strong Cryptoeconomic Safety. arXiv:2401.05797, 2024.</li>
                    <li>Gans, J. S. The Fine Print in Smart Contracts. NBER Working Paper 25443, 2019.</li>
                    <li>Holden, R. T. &amp; Malani, A. Can Blockchain Solve the Hold-up Problem in Contracts? NBER Working Paper 25833, 2019.</li>
                    <li>Ito, K. Cryptoeconomics and Tokenomics as Economics: A Survey with Opinions. arXiv:2407.15715, 2024.</li>
                    <li>Murtazashvili, I., Palida, A., &amp; Madison, M. J. The Past, Present, and Future of Polycentric Legal Order: A Comparative Institutional Analysis of Lex Mercatoria and Blockchain. <em>Journal of Institutional Economics</em>, 22, 2026. https://doi.org/10.1017/S1744137425100386</li>
                    <li>Ohlhaver, P., Nikulin, M., &amp; Berman, P. Compressed to 0: The Silent Strings of Proof of Personhood. SSRN 4749892, 2024.</li>
                    <li>Open Source Observer. Lessons Learned from Two Years of Retroactive Public Goods Funding. Optimism governance forum, topic 9239, 2024. https://gov.optimism.io/t/lessons-learned-from-two-years-of-retroactive-public-goods-funding/9239</li>
                    <li>Optimism. Retro Funding 4: Learnings and Reflections. Optimism governance forum, topic 9271, 2024. https://gov.optimism.io/t/retro-funding-4-learnings-and-reflections/9271</li>
                    <li>Voshmgir, S. <em>Token Economy</em>, third edition. Token Kitchen, 2025. https://doi.org/10.5281/zenodo.15358988</li>
                    <li>Voshmgir, S. &amp; Zargham, M. <em>Foundations of Cryptoeconomic Systems</em>. Working Paper Series 1/2020, Institute for Cryptoeconomics, Vienna University of Economics and Business, 2020. https://doi.org/10.57938/10d8b646-3266-4ec9-b94d-810b528c40a9</li>
                    <li>Werbach, K. &amp; Cornell, N. Contracts Ex Machina. <em>Duke Law Journal</em>, 67:313&ndash;382, 2017.</li>
                    <li>Zamfir, V. What Is Cryptoeconomics? Talk, Cryptoeconomicon, 2015. Quoted from Brekke &amp; Alsindi (2021).</li>
                </>
            }
        >
            <PaperSection title="1. The Word">
                <PaperRun title="The object.">
                    Figaro is a protocol: the rules strangers follow to trade and to publish what they trade with. It makes a stranger&rsquo;s promise credible with bonds locked before the trade. The buyer bonds twice the payment and each seller twice the cumulative value through its order; only the buyer resolves, and resolution pays every seller and refunds every bond at once. Each process is an institution that lasts the time of one transaction.
                </PaperRun>
                <p>
                    The word cryptoeconomics has three founding definitions. Zamfir&rsquo;s 2015 talk is the earliest recorded use of the term (Voshmgir &amp; Zargham, 2020). It defines &ldquo;A formal discipline that studies protocols that govern the production, distribution, and consumption of goods and services in a decentralized digital economy,&rdquo; one that &ldquo;focuses on the design and characterization of these protocols&rdquo; (Zamfir, 2015, as quoted by Brekke &amp; Alsindi, 2021). It asks what a protocol governs. Buterin&rsquo;s 2017 talk presents cryptoeconomics &ldquo;as a methodology for building systems that try to guarantee certain kinds of information security properties&rdquo; (Buterin, 2017, as quoted by Brekke &amp; Alsindi, 2021). It asks what a system guarantees. Voshmgir and Zargham (2020) define a cryptoeconomic system by &ldquo;individual autonomous actors&rdquo;, &ldquo;economic policies embedded in software&rdquo;, and &ldquo;emergent properties arising from the interactions of those actors with the whole network&rdquo;. They ask what the system is as a whole.
                </p>
                <p>
                    The field has since sharpened each question. The editors of its journal wrote that its key terms &ldquo;do not have clear meanings&rdquo; (Alsindi, Miller &amp; Narula, 2020), and Ito (2024) proposes &ldquo;token-based mechanism design&rdquo; in their place. Buterin restated his own definition, &ldquo;cryptoeconomics, first of all, is economics&rdquo;, under constraints that cap punishment, since &ldquo;you cannot drag people’s utility down below zero&rdquo; (Buterin &amp; Cowen, 2018). Security became a comparison, &ldquo;Cryptoeconomic Safety: cost-of-corruption &gt; profit-from-corruption&rdquo; (Deb, Raynor &amp; Kannan, 2024), with collusion inside the threat model (Buterin, 2019). The object came to be read as an institution beside firms and markets (Davidson, De Filippi &amp; Potts, 2018; Berg, Davidson &amp; Potts, 2019).
                </p>
                <p>
                    This paper applies the three founding definitions in their own words. Voshmgir and Zargham&rsquo;s is the spine: it alone defines the system as a whole, and it names the eight disciplines a full account passes through. Later work enters where it sharpens a point, and where a definition names something Figaro lacks, the paper says so.
                </p>
            </PaperSection>

            <PaperSection title="2. What Figaro Governs">
                <PaperRun title="The economy.">
                    Figaro governs trade in goods, work or data of any kind: any chain of added value, bounded only by what the network can resolve in one call. The protocol is decentralized, as Zamfir asks, and the economy is digital in a precise sense: the commitments, bonds and trail are on-chain, while the goods, the work and the parties&rsquo; knowledge of them pass off-chain, beyond the protocol&rsquo;s sight. Many buyers trade at once, each opening processes of its own, and within a process every order has that one buyer. A seller in one process may open another as its buyer, so a supply chain of any depth composes as many processes; the Core sees each process alone, and each resolves atomically by its own buyer, never across processes. Many processes can also be resolved together in a batch, on the strength of one validity proof the chain verifies, under the same rules and with buyer dominance preserved in each.
                </PaperRun>
                <PaperRun title="Who acts.">
                    Every asset is a wallet: a kitchen, a machine, a person&rsquo;s labour, an agent selling its own service. The wallet is a signing key and its balance, the only identity the protocol knows; the operator is whoever holds the key, a person or an agent. An agent buys, sells and designs clauses and assemblies on the same footing as a person, reading the same public registries and data. Voshmgir and Zargham&rsquo;s table for the Bitcoin system has three vertex types: the entity, an &ldquo;Off-chain unique identity of a person or organization&rdquo;; the account, an &ldquo;On-chain address controllable via a private key&rdquo;; and the node, &ldquo;Software and hardware participating in a peer-to-peer network&rdquo;. A wallet is an account, and an operator the entity that controls its keys. An asset is wider than an entity: a machine or a kitchen is a party in its own right. Figaro has no counterpart to the node; it runs above a chain.
                </PaperRun>
                <PaperRun title="Production.">
                    Sellers produce value, each adding its part in its own order. Designers produce the terms: clauses, reusable terms registered publicly for anyone to compose, and assemblies, reusable designs of a process. The clauses registered cover payment and acceptance, carriage and handling, trade terms, applicable law and forums, credentials and consent, schedules and places, emissions, and the terms on which data is shared or licensed. Processes produce data: what was committed, attested and resolved. That trail is the process&rsquo;s own books, for regulatory, legal, fiscal and market-making purposes first and analysis last: one decomposition of what the buyer paid is the buyer&rsquo;s checkout, the trail a regulator reads, and the invoice. Its public part is the signal from which members and agents find work and demand, by reading the public graphs themselves.
                </PaperRun>
                <PaperRun title="Distribution.">
                    Resolution transfers every payment and refunds every bond at once, the buyer&rsquo;s less the payments it carried. Designer rewards distribute florins after the fact, in proportion to the real use processes made of each clause and assembly. The data divides at a seam: the aggregate map is public, and the private detail belongs to the parties, who keep it sealed or sell it on their own terms. What only a counterparty needs travels between the parties under a hash anchored on-chain, and can be erased until a party reveals it to a forum.
                </PaperRun>
                <PaperRun title="Consumption.">
                    The buyer is the one party who pays and the only party who can resolve, and resolving is its acceptance of what arrived. Every process leaves both of its parties data. A buyer that is a member may sell its share, and in that sale it is the seller of record.
                </PaperRun>
                <PaperRun title="Design.">
                    The Core is two mechanisms and one constraint: asymmetric bonding at commit; buyer dominance with atomic resolution at resolve; and no escape hatches, since commit and resolve are its only operations. It sees each process as a linear chain of commitments extending one accumulator; who comes before whom is a clause in the parties&rsquo; agreement.
                </PaperRun>
                <PaperRun title="Composition.">
                    A process composes with any other contract on the chain. A swap can fund a party&rsquo;s bond from another token it holds, delivering the process&rsquo;s denomination at commit; a payment splitter can divide what a seller received after resolution; a forum can rule on the open process. A composed contract supplies terms, funding, evidence or consequences, never a signature. Composition is what makes the protocol a network rather than a silo.
                </PaperRun>
                <PaperRun title="Characterization.">
                    The equilibrium is proved, and its best-response inequalities are checked again in a proof assistant, separately from the code; the implementation is checked by exhaustive model checking, property-based fuzzing, symbolic execution and specification checking, under a stated threat model. How people play is a separate question: &ldquo;the level of security very much depends on how people react to economic incentives&rdquo; (Voshmgir &amp; Zargham, 2020).
                </PaperRun>
            </PaperSection>

            <PaperSection title="3. What Figaro Guarantees">
                <p>
                    Buterin&rsquo;s information security properties are, for Figaro, its six invariants: <em>asymmetric bonding</em>, the buyer locking twice the payment and each seller twice the value at its link; <em>cumulative bonding</em>, that value including everything added ahead of it; <em>buyer dominance</em>, only the buyer closing a process; <em>atomic resolution</em>, all orders or none; <em>immutable evidence</em>, each step bound to the signed agreement by its fingerprint as it happens; and <em>no escape hatches</em>, commit and resolve being the only moves. Cryptography guarantees what is signed, and the bonds make keeping one&rsquo;s word the best move.
                </p>
                <PaperRun title="The bond, stated as security.">
                    Each bond is its party&rsquo;s own deterrent, measured net of what a defector keeps. Write <Math>{"P"}</Math> for the payment at an order and <Math>{"G"}</Math> for the cumulative value through it. A seller that walks away keeps at most what it holds, worth at most <Math>{"G"}</Math>, and leaves its bond of <Math>{"2G"}</Math> deposited. A buyer that never resolves after performance keeps what arrived, worth <Math>{"P"}</Math>, and leaves its bond of <Math>{"2P"}</Math> deposited, the payment inside it.
                </PaperRun>
                <div className="my-2">
                    <Math display>{"\\text{seller: } G - 2G = -G \\;<\\; +P \\qquad\\qquad \\text{buyer: } P - 2P = -P \\;<\\; 0"}</Math>
                </div>
                <p>
                    The left of each line is what a defector nets. The right is what the same party nets by keeping its word: the seller is paid <Math>{"P"}</Math>, and the buyer, having paid <Math>{"P"}</Math> for what arrived, nets zero. On each side what defection leaves deposited exceeds what the defector keeps, so defection never pays; the seller&rsquo;s margin between performing and holding out is <Math>{"P + G \\ge 2P"}</Math>.
                </p>
                <PaperRun title="The equilibrium.">
                    The result is a best-response fixed point, not a dominance result. After performance the buyer strictly prefers resolving to never resolving, with no assumption about the seller. Given the buyer&rsquo;s plan to resolve once performance has occurred and not before, performing is each seller&rsquo;s strict best response. The result is therefore conditional on the seller&rsquo;s side, and a second equilibrium exists: the seller never performs and the buyer resolves regardless. It is the no-trade equilibrium every exchange game carries, reached only by a buyer that has given up its instrument before performance. The same comparisons hold at every order of a longer process while its co-sellers perform. Where one holds out, the others&rsquo; cheapest move is to help put its fault right, as Section 4 describes.
                </PaperRun>
                <PaperRun title="Collusion and bribery.">
                    The field now assumes collusion: &ldquo;it is much harder, and more likely to be outright impossible, to make mechanisms that maintain desirable properties in a model where participants can collude&rdquo; (Buterin, 2019). Figaro&rsquo;s answer is that after commit the chain accepts exactly one judgment, the buyer&rsquo;s resolution, so a commitment contains no vote, jury or oracle to corrupt. An outside payment that makes holding out worth a seller&rsquo;s while must exceed its margin of <Math>{"P + G"}</Math>, and one that makes a buyer withhold after performance must exceed <Math>{"P"}</Math>. The limits stand beside it: a payment made conditional on holding out, and larger than the margin, changes the comparison, though it must be renewed for as long as the process stands open; and parties acting together can emit perfectly formed books for a trade whose service was never rendered. The data proves what the Core enforced, never the world.
                </PaperRun>
                <PaperRun title="What must be verifiable, and by whom.">
                    Asgaonkar and Krishnamachari (2018) prove that, with deposits on both sides, &ldquo;honest behavior by both parties is the only subgame perfect Nash equilibrium&rdquo; of their exchange game. Their result holds for any positive deposits, so it says nothing for or against twice the payment. They state its condition: the problem becomes considerably harder without a trusted third party &ldquo;if the buyer cannot independently verify the delivery.&rdquo; In Figaro the chain admits no report of delivery. The judgment their condition names is the buyer&rsquo;s, and resolving expresses it.
                </PaperRun>
                <PaperRun title="When the mechanism is not enough.">
                    Budish (2025) concludes that deterring the largest attacks on a chain needs &ldquo;a source of trust support external to the protocol, such as rule of law&rdquo;. Figaro answers with five layers, innermost first: the chain, whose consensus makes the data authentic; the bonds; the co-sellers, whose payment waits on the same resolution; an arbitration forum, which rules on the data; and the courts, which read it from outside. The inner layers are built to carry the ordinary process, and the outer ones exist for the remainder.
                </PaperRun>
            </PaperSection>

            <PaperSection title="4. The Incentive Mechanisms">
                <p>
                    Voshmgir and Zargham define purpose-driven tokens as steering collective action &ldquo;towards a collective goal in the absence of intermediaries&rdquo;, and of designing one they hold that &ldquo;it is more realistic to take a polycentric viewpoint where there is no one social optimum&rdquo;, since &ldquo;any choice of coordination objective is a subjective choice&rdquo;. Figaro&rsquo;s ends are several, and three of them are these: cooperation is the equilibrium on every order; value moves from the top of hierarchies to the assets that produce; and each asset earns what it needs to keep taking part, a productive life.
                </p>
                <div className="overflow-x-auto my-4">
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
                                ["The stake and its cooldown", "Members and designers", "Being found, being rewarded, an identity priced per stake", "The base chain's own currency"],
                                ["Designer rewards", "Designers", "Publishing what real trade uses", "The florin"],
                                ["The florin", "Strangers choosing a unit", "A unit they can converge on", "The florin"],
                                ["The DAO's treasury and income", "The DAO", "Funding what use cannot yet measure; its income tracks use", "The florins and stake it holds"],
                                ["Utility and community tokens", "Designers; communities", "A share priced by use; worth sustained at home", "Their own"],
                                ["The data market", "Every party to a process", "Selling its own data on its own terms", "The sale's denomination"],
                                ["Catalogue prices and offer formation", "Sellers; buyers", "Posting prices; answering requests", "The process's denomination"],
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
                </div>
                <PaperRun title="The two mechanisms of the Core.">
                    Asymmetric bonding secures each order and scales; buyer dominance with atomic resolution coordinates what the bonds already secured. Nobody is paid until the buyer resolves, so when one seller&rsquo;s work is faulty, every co-seller&rsquo;s cheapest move is to help put it right. This one-shot weakest-link game reproduces the coordination-pressure component of joint-liability lending, though not its peer selection or monitoring.
                </PaperRun>
                <PaperRun title="The stake.">
                    Members and designers register by placing the base chain&rsquo;s own currency, reclaimable, whose minting and supply belong to that chain; a member&rsquo;s withdrawal waits out a cooldown, so each stake can serve only a bounded number of identities in a period. The stake aligns the honest majority. It does not deter a determined Sybil. The bound on farming is dilution per unit of attacker capital: capturing a fraction <Math>{"\\varphi"}</Math> of a period&rsquo;s rewards requires a score <Math>{"\\varphi/(1-\\varphi)"}</Math> times the honest score, at a capital cost linear in that score.
                </PaperRun>
                <PaperRun title="Designer rewards.">
                    A clause&rsquo;s or an assembly&rsquo;s score in a period is its real use alone, <Math>{"(c\\,d^{2})^{1/3}"}</Math>, where <Math>{"c"}</Math> counts the processes that used it and <Math>{"d"}</Math> the distinct live-staked sellers who carried it; below a minimum number of such sellers the score is zero. Use is counted once a process has resolved, from the clauses and assemblies its signed agreement committed, each process once. Both the seller of record and the designer must hold a live stake. Budgets rise across three groups of periods, so the largest fall on the best-measured evidence.
                </PaperRun>
                <PaperRun title="The DAO.">
                    The DAO spends its treasury by human judgment, and its own income arises only when the network is used: it is designer of record of the clauses every process composes by convention, whose use accrues to it on the same meter as any designer&rsquo;s.
                </PaperRun>
                <PaperRun title="Denominations, data and offers.">
                    Any ERC-20 may denominate a process, one token per process: among others a coordination token, such as a stablecoin or the florin; a community token; or a designer&rsquo;s utility token, pinned to an assembly, whose worth is discovered through use of the assembly and which is the designer&rsquo;s share in what it built. Figaro accepts community and utility tokens and issues neither; the only token it issues is the florin. A data sale is an ordinary bonded trade, and an offer forms by a dispatch race or a request for quotes.
                </PaperRun>
                <p>
                    The two tokens with a design of their own, in Voshmgir&rsquo;s (2025) seven properties:
                </p>
                <div className="overflow-x-auto my-4">
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
                                ["Stability mechanism or pricing strategy", "None; neither the DAO's treasury nor the founder ever sells, buys or provides liquidity", "Discovered through use of the assembly"],
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
                </div>
                <PaperRun title="The field&rsquo;s experience with formula rewards.">
                    &ldquo;The central vulnerabilities of QF are collusion and fraud&rdquo; (Buterin, Hitzig &amp; Weyl, 2019). In retroactive funding, &ldquo;mega rounds devolve into popularity contests&rdquo;, and &ldquo;we don’t (yet) have the data to show that retroactive funding produces superior outcomes&rdquo; (Open Source Observer, 2024); &ldquo;Any metric can be gameable&rdquo; (Optimism, 2024). Under staked identity, &ldquo;hidden pools rapidly emerged&rdquo; (Ohlhaver, Nikulin &amp; Berman, 2024).
                </PaperRun>
                <p>
                    Figaro addresses some of these failure modes. No vote allocates, so there is no popularity contest and no ballot to buy. Eligibility is never declared; use is counted from the resolved process. Identity is priced by a live stake on both sides; the pool is fixed, so farming dilutes it and never inflates it; and the minimum number of distinct staked sellers keeps what one actor fabricates alone off the board. Other failure modes remain. No score can tell a fabricated counterparty from a genuine one, so an attacker with capital is bounded only by the dilution it pays for. Any stake meets Buterin&rsquo;s point that &ldquo;sometimes a price high enough to keep out attackers is also too high for many lower-income legitimate users&rdquo; (Buterin, 2023). And the meter measures use, never worth: a public good no trade composes earns nothing from it, which is why the DAO&rsquo;s judgment stands beside the meter.
                </p>
            </PaperSection>

            <PaperSection title="5. The System">
                <p>
                    Voshmgir and Zargham&rsquo;s definition applies term by term. The autonomous actors are assets, each acting through its wallet and operated by a person or an agent; the policies embedded in software are the Core, the public registries and the meter that counts use. Their three levels are levels of analysis, not sizes: micro-foundational, &ldquo;relating to agent level behaviors&rdquo;, which in Figaro is the comparison each party makes at its own order; meso-institutional, &ldquo;relating to policy setting and governance&rdquo;; and macro-observable, which in Figaro is what the public data shows.
                </p>
                <PaperRun title="What emerges.">
                    Communities emerge from a signal: the tokens a wallet holds and the assemblies it trades through say which communities and designs it takes part in, and communities can form around that signal, not only around it. A public map of trade emerges from the aggregate data. Value moves to the assets that produce, resting where each earns what it needs to keep taking part. These are what the design is built to produce, under Voshmgir and Zargham&rsquo;s caution that &ldquo;the system level behaviour cannot be inferred from the local state changes induced by individual network actors&rdquo;.
                </PaperRun>
                <PaperRun title="The loop.">
                    A wallet stakes and publishes; members trade on the published terms; once a process resolves, its use of each clause and assembly is counted, and designers are rewarded for it; each party may sell its data in a trade of its own. The stake rises and falls with demand for the chain, so the stake&rsquo;s worth tracks the growth one&rsquo;s own work produces. The Core is deployed once and anyone builds above it, clauses, assemblies, interfaces and other contracts alike, so every process&rsquo;s public data lies on one map.
                </PaperRun>
                <PaperRun title="The meso level.">
                    For Voshmgir and Zargham &ldquo;governance is precisely managing the relationship between the micro and macro scales&rdquo;, and &ldquo;automation in socioeconomic systems is tantamount to algorithmic policy making&rdquo;. In Figaro, nothing moves a bonded commitment but its buyer. The DAO governs its own treasury and reaches nothing else: no DAO vote can touch a commitment, a bond, a registry binding or a resolution. Designers set policy by publishing; sellers set it by binding the assemblies they trade under, and buyers by selecting among them.
                </PaperRun>
            </PaperSection>

            <PaperSection title="6. The Institution">
                <p>
                    Voshmgir and Zargham claim cryptoeconomic infrastructure can &ldquo;reduce the principal-agent dilemma of organizations&rdquo; through transparency, &ldquo;disintermediate by reducing bureaucracy&rdquo;, and &ldquo;replace the reactive procedural security of the current legal system, with proactive and automated mechanisms that make a potential breach of contract expensive and therefore infeasible&rdquo;. Figaro&rsquo;s own position: it displaces, but does not completely substitute, the institutions that make a stranger&rsquo;s promise good after the fact. The firm, the platform and the court act after the trade, by authority; Figaro acts before it, with a bond, so their apparatus is needed far less.
                </p>
                <PaperRun title="Among the institutions.">
                    Davidson, De Filippi and Potts (2018) place the blockchain in a line of &ldquo;firms, markets, relational contracting and now blockchains&rdquo;, and Berg, Davidson and Potts (2019) call blockchains &ldquo;an economic infrastructure, alongside markets, the firm, governments, clubs, and the commons&rdquo;. Figaro&rsquo;s entry in that line is the process, a transaction-scoped institution that dissolves at its resolution, leaving its own books.
                </PaperRun>
                <PaperRun title="Contract doctrine.">
                    Werbach and Cornell (2017) test smart contracts against meeting of the minds, consideration, capacity and legality, and conclude: &ldquo;But smart contracts will not displace contract law.&rdquo; Their reason: &ldquo;Contract law is a remedial institution.&rdquo; Figaro stands beside that conclusion. A binding contract in law needs six elements, and each has its place. Offer is the buyer&rsquo;s signature over the commitment, carried to the seller, and acceptance the seller&rsquo;s counter-signature over the same commitment. Mutual assent is the Core&rsquo;s check at commit that both signatures recover to the named parties over one hash. Consideration is the bonds pulled at commit and the payment moved at resolve. Capacity is any wallet that can sign and fund its bond, a person&rsquo;s or an agent&rsquo;s. Legality enters through the clauses the agreement binds, or through a forum ruling on the data. These are the law&rsquo;s six elements, not Figaro&rsquo;s. The contract&rsquo;s terms are the agreement, the clauses composed for one order; its warranties and representations are the attestations each party gives while the process is open, each signed and bound to the order it concerns.
                </PaperRun>
                <PaperRun title="Incomplete contracts.">
                    For the gaps every contract leaves, &ldquo;One can resort to formal dispute resolution (judiciary) or informal dispute resolution (bargaining) to resolve such contractual gaps&rdquo; (Voshmgir &amp; Zargham, 2020). Gans (2019) holds that &ldquo;the commitment engendered by the blockchain could substitute for a lack of trust in the real world&rdquo;, and finds the limit in &ldquo;obligations that cannot be easily measured&rdquo;. Holden and Malani (2019) answer hold-up by asking parties &ldquo;to place enough assets in their accounts on the blockchain network to cover penalties until both parties satisfactorily perform on the contract&rdquo;. Figaro&rsquo;s bonds are placed that way, and the measure of performance is the buyer&rsquo;s own satisfaction, which no third party has to measure. What a contract leaves incomplete is put right before resolution: a failing seller sends the buyer the payment it stands to receive and makes good what it holds. Where the parties cannot agree, a forum rules on the open process and the buyer resolves; resolution is terminal acceptance.
                </PaperRun>
                <PaperRun title="Two layers.">
                    Murtazashvili, Palida and Madison (2026) describe an ex ante layer, where &ldquo;blockchains function as self-executing ledgers&rdquo;, and an ex post layer, where &ldquo;blockchain systems often resolve them internally through mechanisms like DAOs&rdquo; or through off-chain bodies. Figaro has the first layer and the off-chain half of the second. Their internal dispute layer of DAOs has no counterpart in Figaro, where the DAO never touches a commitment.
                </PaperRun>
            </PaperSection>

            <PaperSection title="7. The Eight Disciplines">
                <p>
                    Each of Voshmgir and Zargham&rsquo;s eight disciplines has been given its own treatment of Figaro; in their order, each establishes the following.
                </p>
                <PaperRun title="Industrial and Systems Engineering.">
                    Air service decomposes into resource markets, each provider a wallet bonded to the passenger, with one resolution for the whole flight. Container shipping, where a consortium platform failed because rivals would not ratify a competitor&rsquo;s gatekeeping, can be coordinated at the same perimeter by a permissionless bonded composition.
                </PaperRun>
                <PaperRun title="AI, Optimization and Control Theory.">
                    The Core reads signatures and bond posture, never the kind of entity behind a key, so the equilibrium extends without modification to autonomous agents, and a wallet&rsquo;s policy reads as a controller over bonded commitments.
                </PaperRun>
                <PaperRun title="Computer Science and Cryptography.">
                    A contract of two calls, with no timeout and no upgrade path, is verified by several classes of check, each reaching a different part of a claim whose threat model and scope are stated.
                </PaperRun>
                <PaperRun title="Economics and Game Theory.">
                    The bonding equilibrium holds at every link of a process. Markets form without a venue, by a posted-price dispatch race or a sealed-bid request for quotes. When a stranger&rsquo;s promise enforces itself for the network&rsquo;s gas and the time value of a bond, the institution a trade needs lasts the time of that trade. A token issued at zero after the work, with no central operator, can only be a Schelling point. A bonded data sale dissolves, economically, Arrow&rsquo;s information paradox as a barrier to trade.
                </PaperRun>
                <PaperRun title="Psychology and Decisions Science.">
                    Each party compares two certain amounts straddling its reference point, so loss aversion weights the defecting branch, and the coordination-failure results lose the finality they depend on. Whatever happens between commit and resolve the parties square before the terminal call.
                </PaperRun>
                <PaperRun title="Political Science, Institutional Economics and Governance.">
                    The politics lives in the graph composed above the mechanism. Because every process is transparent and every wallet picks the communities and the units it coordinates with, economic doctrines stop being systems one must choose between and become terms in a trade: a market-liberal graph, a cooperative graph and a mutual-aid graph run on the same Core. The mechanism&rsquo;s precondition is a key, so the stateless gain a capacity to have commerce. A bonded wallet is producer, means of production and party at once. That strangers need a platform is hegemonic common sense, not necessity. An ungoverned substrate can sit beneath governed entities and beneath rival trade corridors alike.
                </PaperRun>
                <PaperRun title="Philosophy, Law and Ethics.">
                    Resolution is on-chain and adjudication off-chain, and existing evidence law already receives what the chain holds. Between bonded counterparties, employment classification loses its subject. Bilateral commerce is enforced with no third party applying force. Disclosure turns the engineering of consent into mechanism design. Code is constitution, the entrenched procedural layer beneath enactment.
                </PaperRun>
                <PaperRun title="Operations Research and Management Science.">
                    A process is a self-closing ledger period: an accounting entity with zero equity, whose commitments are journal entries and whose resolution is the closing entry. Designer rewards allocate a fixed reserve by counted use, with breadth over volume and a two-sided live stake whose cost bound can be derived.
                </PaperRun>
            </PaperSection>

            <PaperSection title="8. Conclusion">
                <p>
                    Read through the field&rsquo;s definitions, Figaro governs trade in goods, work or data. It guarantees six invariants, and its bond meets the field&rsquo;s statement of security on both sides of every order. Its incentive mechanisms serve several ends, so its collective goal is plural by design. It is a system of autonomous actors and policies in software, and as an institution it acts before the trade, lasts the time of one transaction, and leaves the remainder to the institutions that act after it.
                </p>
            </PaperSection>
        </PaperLayout>
    );
}
