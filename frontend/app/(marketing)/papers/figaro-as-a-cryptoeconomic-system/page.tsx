import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import { PaperLayout, PaperSection, PaperRun } from "@/components/papers/PaperLayout";
import { Math } from "@/components/papers/Math";
import { WholeSystemFigure } from "@/components/figures/WholeSystemFigure";

export const metadata: Metadata = withOg({
    title: "Figaro as a Cryptoeconomic System — Figaro",
    description:
        "Trade between strangers bears three costs a credible promise would not impose: attracting buyers, handling disputes, and the intermediary's capture of the trade's data. Read against the field's three definitions of a cryptoeconomic system, Zamfir's, Buterin's, and Voshmgir and Zargham's, every part of Figaro has its place, and every other axis (the mechanism alone, the product, the interface, the firm in either of its business models) returns a closed-world prior. What emerges is a substrate on which economic forms compose.",
});

function FormalBlock({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="border-l-2 border-default pl-6 my-3 space-y-3">
            <p className="text-sm font-semibold text-ink-heading">{label}</p>
            {children}
        </div>
    );
}

export default function FigaroAsACryptoeconomicSystemPaper() {
    return (
        <PaperLayout
            slug="figaro-as-a-cryptoeconomic-system"
            title="Figaro as a Cryptoeconomic System"
            subtitle="Three Costs of Trade Between Strangers, Read Against the Field’s Three Definitions"
            author="Figaro"
            date="October 2026"
            watermark="Figaro Protocol · Preprint"
            abstract={
                <>
                    <p>
                        Trade between strangers bears three costs that a credible promise would not impose. They are the cost of attracting buyers, the cost of handling disputes, and the capture of the trade&rsquo;s data by the intermediary that stands behind it. Figaro is a decentralized, permissionless protocol for bonded trade between strangers. We argue that cryptoeconomics is the one frame in which its whole holds together, and that every other axis returns a closed-world prior. The measure is the field&rsquo;s three definitions: Zamfir&rsquo;s, Buterin&rsquo;s, and Voshmgir and Zargham&rsquo;s. We read each with what it presupposes. Zamfir&rsquo;s presupposes an institution, Buterin&rsquo;s a guarantee stated as cost against profit, and Voshmgir and Zargham&rsquo;s tokens that steer action toward a collective goal without intermediaries. Where a definition leaves its presupposition implicit, later work makes it explicit.
                    </p>
                    <p>
                        The bonded commitment, the stake, the designers&rsquo; rewards, the florin, and the decentralized autonomous organization (DAO) answer the three costs at once. For parties beyond each other&rsquo;s coercive reach, the bond makes keeping a promise the promising party&rsquo;s best reply before any dispute arises, and so carries the cost of handling disputes. The cost of attracting buyers moves to a staked public listing, the communities, and a designer&rsquo;s token; no party in the middle holds the data. Each part has its place under one of the definitions. Every other axis leaves a part unplaced or restores a party that stands over the system. What emerges is a substrate on which economic forms compose: designers compose the designs, sellers bind them, and buyers select them. The equilibrium the argument uses is proved, not observed.
                    </p>
                </>
            }
            references={
                <>
                    <li>Berg, Chris, Sinclair Davidson, and Jason Potts. 2019. <em>Understanding the Blockchain Economy: An Introduction to Institutional Cryptoeconomics</em>. Cheltenham: Edward Elgar. https://doi.org/10.4337/9781788975001.</li>
                    <li>Brekke, Jaya Klara, and Wassim Zuhair Alsindi. 2021. &ldquo;Cryptoeconomics.&rdquo; <em>Internet Policy Review</em> 10 (2). https://doi.org/10.14763/2021.2.1553.</li>
                    <li>Budish, Eric. 2025. &ldquo;Trust at Scale: The Economic Limits of Cryptocurrencies and Blockchains.&rdquo; <em>Quarterly Journal of Economics</em> 140 (1): 1&ndash;62. https://doi.org/10.1093/qje/qjae033.</li>
                    <li>Buterin, Vitalik. 2017. &ldquo;Introduction to Cryptoeconomics.&rdquo; Talk, Ethereum Foundation. YouTube video. Accessed October 28, 2026. https://youtu.be/pKqdjaH1dRo. Quoted in Brekke and Alsindi 2021.</li>
                    <li>Buterin, Vitalik. 2019. &ldquo;On Collusion.&rdquo; vitalik.eth.limo, April 3, 2019. Accessed October 20, 2026. https://vitalik.eth.limo/general/2019/04/03/collusion.html.</li>
                    <li>Buterin, Vitalik, and Tyler Cowen. 2018. &ldquo;Vitalik Buterin on Cryptoeconomics and Markets in Everything.&rdquo; <em>Conversations with Tyler</em>, episode 45, podcast, July 18, 2018. Accessed October 20, 2026. https://conversationswithtyler.com/episodes/vitalik-buterin/.</li>
                    <li>Catalini, Christian, and Joshua S. Gans. 2020. &ldquo;Some Simple Economics of the Blockchain.&rdquo; <em>Communications of the ACM</em> 63 (7): 80&ndash;90. https://doi.org/10.1145/3359552.</li>
                    <li>Coase, Ronald H. 1937. &ldquo;The Nature of the Firm.&rdquo; <em>Economica</em> 4 (16): 386&ndash;405. https://doi.org/10.1111/j.1468-0335.1937.tb00002.x.</li>
                    <li>Davidson, Sinclair, Primavera De Filippi, and Jason Potts. 2018. &ldquo;Blockchains and the Economic Institutions of Capitalism.&rdquo; <em>Journal of Institutional Economics</em> 14 (4): 639&ndash;658. https://doi.org/10.1017/S1744137417000200.</li>
                    <li>Deb, Soubhik, Robert Raynor, and Sreeram Kannan. 2024. &ldquo;STAKESURE: Proof of Stake Mechanisms with Strong Cryptoeconomic Safety.&rdquo; arXiv preprint, arXiv:2401.05797. Accessed October 23, 2026. https://arxiv.org/abs/2401.05797.</li>
                    <li>Easley, David, Maureen O&rsquo;Hara, and Soumya Basu. 2019. &ldquo;From Mining to Markets: The Evolution of Bitcoin Transaction Fees.&rdquo; <em>Journal of Financial Economics</em> 134 (1): 91&ndash;109. https://doi.org/10.1016/j.jfineco.2019.03.004.</li>
                    <li>Figaro. 2026a. &ldquo;Air Service as Coordinated Resource Markets: An Industrial-Engineering Reading of the Bonded Architecture.&rdquo; Preprint. Accessed October 28, 2026. https://figaroprotocol.com/papers/air-service-coordination/.</li>
                    <li>Figaro. 2026b. &ldquo;Asymmetric Bonding and Buyer Dominance: Two Composing Mechanisms for N-Party Coordination Among Strangers.&rdquo; Preprint. Accessed October 28, 2026. https://figaroprotocol.com/papers/asymmetric-bonding/.</li>
                    <li>Figaro. 2026c. &ldquo;Behavioral Game Theory of the Two-Mechanism Bonded Commitment: Loss Aversion, Coordination, Peer Pressure, and Incentive Legibility.&rdquo; Preprint. Accessed October 28, 2026. https://figaroprotocol.com/papers/behavioral-game-theory/.</li>
                    <li>Figaro. 2026d. &ldquo;Bookkeeping as Protocol Byproduct: Self-Closing Ledger Periods under the Bonded Commitment.&rdquo; Preprint. Accessed October 28, 2026. https://figaroprotocol.com/papers/self-closing-ledger-periods/.</li>
                    <li>Figaro. 2026e. &ldquo;Coordination Substrates: Firm, Court, and Bond: A Comparative Institutional Analysis of Trade Between Strangers.&rdquo; Preprint. Accessed October 28, 2026. https://figaroprotocol.com/papers/coordination-substrates/.</li>
                    <li>Figaro. 2026f. &ldquo;The Florin: A Schelling-Point Token Issued at Zero: From Howey to Sufficiently Decentralized to a Focal Point.&rdquo; Preprint. Accessed October 28, 2026. https://figaroprotocol.com/papers/florin-schelling-point-token/.</li>
                    <li>Figaro. 2026g. &ldquo;From Firms to Transaction-Scoped Institutions: The Coasean Collapse.&rdquo; Preprint. Accessed October 28, 2026. https://figaroprotocol.com/papers/transaction-scoped-institutions/.</li>
                    <li>Figaro. 2026h. &ldquo;Markets Without a Venue: Dispatch Races and Requests for Quotes as Market-Design Mechanisms over a Market-Blind Mechanism.&rdquo; Preprint. Accessed October 28, 2026. https://figaroprotocol.com/papers/markets-without-a-venue/.</li>
                    <li>Figaro. 2026i. &ldquo;On-Chain Evidence, Off-Chain Adjudication: A Layered Approach to Smart-Contract Dispute Resolution.&rdquo; Preprint. Accessed October 28, 2026. https://figaroprotocol.com/papers/on-chain-evidence/.</li>
                    <li>Figaro. 2026j. &ldquo;Self-Authenticating Data Sales: Arrow&rsquo;s Information Paradox under the Bonded Commitment.&rdquo; Preprint. Accessed October 28, 2026. https://figaroprotocol.com/papers/self-authenticating-data-sales/.</li>
                    <li>Figaro. 2026k. &ldquo;Substrate-Broadening Retroactive Public-Goods Funding: Allocating a Fixed Reserve on Adoption Counted from Resolved Trade.&rdquo; Preprint. Accessed October 28, 2026. https://figaroprotocol.com/papers/substrate-broadening-rpgf/.</li>
                    <li>Figaro. 2026l. &ldquo;The Ungoverned Substrate: Network States, Holacracy, On-Chain Governance, the Ethereum Mandate, the Cypherpunks, and d/acc: The Ex-Post Frame They Share, and a Commercial Layer With No Seat.&rdquo; Preprint. Accessed October 28, 2026. https://figaroprotocol.com/papers/ungoverned-substrate/.</li>
                    <li>Figaro. 2026m. &ldquo;The Visibility of Coordination: A Gramscian Reading of the Platform Economy and the Bonded Alternative.&rdquo; Preprint. Accessed October 28, 2026. https://figaroprotocol.com/papers/visibility-of-coordination/.</li>
                    <li>Figaro. 2026n. &ldquo;What a Trust Layer for Agents Acting for Principals Needs: Why a Bond Locked at Commit Supplies It, and Neither a Reputation Registry nor a Legal Wrapper Does.&rdquo; Preprint. Accessed October 28, 2026. https://figaroprotocol.com/papers/actor-neutral-coordination/.</li>
                    <li>Figaro. 2026o. &ldquo;What Formal Verification Transfers to a Bonded Contract: The Payoff Table as the Specification, and What No Check Reaches.&rdquo; Preprint. Accessed October 28, 2026. https://figaroprotocol.com/papers/verified-resolution-kernel/.</li>
                    <li>Huberman, Gur, Jacob D. Leshno, and Ciamac Moallemi. 2021. &ldquo;Monopoly without a Monopolist: An Economic Analysis of the Bitcoin Payment System.&rdquo; <em>Review of Economic Studies</em> 88 (6): 3011&ndash;3040. https://doi.org/10.1093/restud/rdab014.</li>
                    <li>Ito, Kensuke. 2024. &ldquo;Cryptoeconomics and Tokenomics as Economics: A Survey with Opinions.&rdquo; arXiv preprint, arXiv:2407.15715. Accessed October 23, 2026. https://arxiv.org/abs/2407.15715.</li>
                    <li>Milgrom, Paul R., Douglass C. North, and Barry R. Weingast. 1990. &ldquo;The Role of Institutions in the Revival of Trade: The Law Merchant, Private Judges, and the Champagne Fairs.&rdquo; <em>Economics and Politics</em> 2 (1): 1&ndash;23. https://doi.org/10.1111/j.1468-0343.1990.tb00020.x.</li>
                    <li>Nakamoto, Satoshi. 2008. &ldquo;Bitcoin: A Peer-to-Peer Electronic Cash System.&rdquo; White paper. Accessed October 23, 2026. https://bitcoin.org/bitcoin.pdf.</li>
                    <li>Pagnotta, Emiliano. 2022. &ldquo;Decentralizing Money: Bitcoin Prices and Blockchain Security.&rdquo; <em>Review of Financial Studies</em> 35 (2): 866&ndash;907. https://doi.org/10.1093/rfs/hhaa149.</li>
                    <li>Prat, Julien, and Benjamin Walter. 2021. &ldquo;An Equilibrium Model of the Market for Bitcoin Mining.&rdquo; <em>Journal of Political Economy</em> 129 (8): 2415&ndash;2452. https://doi.org/10.1086/714445.</li>
                    <li>Rochet, Jean-Charles, and Jean Tirole. 2003. &ldquo;Platform Competition in Two-Sided Markets.&rdquo; <em>Journal of the European Economic Association</em> 1 (4): 990&ndash;1029. https://doi.org/10.1162/154247603322493212.</li>
                    <li>Rochet, Jean-Charles, and Jean Tirole. 2006. &ldquo;Two-Sided Markets: A Progress Report.&rdquo; <em>RAND Journal of Economics</em> 37 (3): 645&ndash;667. https://doi.org/10.1111/j.1756-2171.2006.tb00036.x.</li>
                    <li>Srnicek, Nick. 2017. <em>Platform Capitalism</em>. Cambridge: Polity.</li>
                    <li>Varoufakis, Yanis. 2023. <em>Technofeudalism: What Killed Capitalism</em>. London: Bodley Head.</li>
                    <li>Voshmgir, Shermin, and Michael Zargham. 2020. <em>Foundations of Cryptoeconomic Systems</em>. Working Paper Series 1/2020. Vienna: Institute for Cryptoeconomics, Vienna University of Economics and Business. https://doi.org/10.57938/10d8b646-3266-4ec9-b94d-810b528c40a9.</li>
                    <li>Williamson, Oliver E. 1985. <em>The Economic Institutions of Capitalism</em>. New York: Free Press.</li>
                    <li>Zamfir, Vlad. 2015. &ldquo;What Is Cryptoeconomics?&rdquo; Talk, Cryptoeconomicon. YouTube video, posted by Cryptoeconomicon CCRG, February 1, 2015. Accessed October 20, 2026. https://www.youtube.com/watch?v=9lw3s7iGUXQ. Quoted in Brekke and Alsindi 2021.</li>
                    <li>Zuboff, Shoshana. 2019. <em>The Age of Surveillance Capitalism: The Fight for a Human Future at the New Frontier of Power</em>. New York: PublicAffairs.</li>
                </>
            }
        >
            <PaperSection title="1. Three Costs of Trade Between Strangers">
                <p>
                    Stipulate a trade. A machine shop quotes a part to a buyer in another jurisdiction. Neither has traded with the other or expects to again, the two are beyond each other&rsquo;s coercive reach, and no court reaches both at a cost the part could bear. Before the part ships, three costs fall on the trade. Someone pays to bring the buyer to the shop. One party must perform first, so someone stands ready to handle the dispute if the other walks away. And whoever stands behind the trade learns who bought what, from whom, and at what price, and keeps it.
                </p>
                <p>
                    One institution stands in the middle of such a trade: an authorized party that makes a stranger&rsquo;s promise good after the fact. The firm, the court, the bank, and the platform are its forms. Each carries the dispute cost the same way, after the trade and by an authority outside it. The law merchant&rsquo;s private judges kept the account by which a cheat was known (Milgrom, North, and Weingast 1990), and a court hears a complaint within a jurisdiction that reaches both parties.
                </p>
                <p>
                    The marketplaces that set out to connect strangers directly met the first two costs. They paid to attract buyers, often by pricing one side&rsquo;s access below cost so that the other side follows (Rochet and Tirole 2003, 2006). They paid to handle disputes between the strangers they matched. The data their trades produced did not pay for both. The marketplaces that survived became platforms: a take on each trade, rules the operator sets, the customers kept, and the data held (Srnicek 2017). Data taken beyond what the service needs is sold as raw material for prediction products (Zuboff 2019). Varoufakis (2023) names the result technofeudalism: those who hold the cloud collect rent, not profit, from everyone who depends on their platforms.
                </p>
                <p>
                    A firm meets the same problem from inside. Coordinating many people through the market costs more than directing them, so a boss directs the work (Coase 1937). The organizations that set out to remove the boss still kept a seat from which a party decides afterward (Figaro 2026l). The platform and the firm are thus one institution, a party in the middle whom the trade pays for. They differ in business model and in the competition each faces, never in kind.
                </p>
                <p>
                    We call each of the three a <em>distortion</em>: a cost or rent that exchange between strangers bears because promises between strangers are not credible. A cost that exchange would bear anyway also counts when that want of credibility sets the form it takes. The cost of attracting buyers is such a cost. Search and the measurement of quality remain transaction costs a credible promise does not remove, but the intermediary&rsquo;s subsidy of one side, recovered through its rent, is a form a credible promise removes. The cost of attracting buyers therefore changes hands rather than vanishing.
                </p>
                <p>
                    Is a distortion not a transaction cost under another name? In part: it takes two of the <em>ex post</em> costs of contracting, haggling and running the governance structure to which disputes are referred (Williamson 1985). It adds the rent an intermediary earns from its position between the parties. A bond that makes each party&rsquo;s promise one the other can count on keeps one of Williamson&rsquo;s <em>ex post</em> costs, his fourth. That cost is the bonding cost of a secure commitment: the bonds&rsquo; time value.
                </p>
                <p>
                    Two further words recur. A <em>substrate</em> is an institutional technology that makes a stranger&rsquo;s promise worth acting on. The firm, under either business model, and the court are substrates. A bond locked before the trade is another: it makes keeping its word each party&rsquo;s best reply while the others keep theirs. It is refunded when the buyer resolves, so its cost is the time value of the parties&rsquo; own tokens and the network&rsquo;s gas, the chain&rsquo;s charge for a transaction (Figaro 2026e). A <em>venue</em> is a party that holds the authoritative state of a market between asking and binding, as an exchange, an auction house, or a dispatcher does (Figaro 2026h).
                </p>
                <p>
                    A reading of a system is <em>closed-world</em> when it takes the set of the system&rsquo;s parties, terms, or uses to be fixed by someone who stands over it, the reader included where the reading itself draws the boundary. Whatever that someone has not listed then reads as outside the system. A reading is <em>open-world</em> when the set is whatever anyone publishes and others use. A <em>closed-world prior</em> is the closed-world reading a frame brings before it meets the system.
                </p>
                <p>
                    Our claim is that cryptoeconomics is the one frame in which the whole of Figaro holds together, and that every other axis, a frame or a reading brought to the system, returns a closed-world prior. Its nearest priors are three. Berg, Davidson, and Potts (2019) read the blockchain through one frame, institutional cryptoeconomics. One paper compares these substrates on ten axes, cost among them (Figaro 2026e), and another reads the programs that seek coordination beyond the state against a bonded substrate (Figaro 2026l). None asks in which frame the whole of one system holds together. Section 2 states the whole, Section 3 the measure, and Section 4 the argument.
                </p>
            </PaperSection>

            <PaperSection title="2. The Whole">
                <p>
                    Figaro is a decentralized, permissionless protocol: the rules strangers follow to trade and to publish what they trade with, which anyone may implement and anyone may build on. A party is any wallet (a signing key and the balance it controls) that signs and locks its bond. The wallet may be a person&rsquo;s or an agent&rsquo;s. Every asset that trades does so through a wallet of its own. The whole over which the claim ranges has the following parts.
                </p>
                <ol className="space-y-2 list-decimal pl-6">
                    <li><strong>The bonded commitment.</strong> A process is a linear sequence of orders under one buyer, each order a commitment both parties sign. At commit each party locks a bond in the process&rsquo;s token. The buyer locks <Math>{"2P"}</Math>, twice the order&rsquo;s payment. The seller locks <Math>{"2G"}</Math>, twice the value accumulated through its own order. That value is the sum of its own payment and every payment committed before it. It is the most a holdout (a seller that walks away with what it holds) could keep at that order. Only the buyer resolves. Resolution is atomic: every seller is paid and every bond refunded at once, or nothing moves. The buyer&rsquo;s bond is refunded less the payments it carried. Commit and resolve are the only operations. The equilibrium these rules carry is premise 3 of Section 4. Atomic resolution gives each seller a bonded interest in every other seller&rsquo;s performance (Figaro 2026b, Theorems 1, 3, and 4).</li>
                    <li><strong>The stake.</strong> A wallet registers as a member of the network by locking a stake, which it places and can reclaim. It registers a clause, an agreement, or an assembly (the terms and designs of part 3) the same way. While the stake is locked the registration is surfaced where buyers and designers look. Section 4 states what the stake does against one actor posing as many wallets.</li>
                    <li><strong>The designs and the designers&rsquo; rewards.</strong> Designers compose terms (clauses and the agreements built from them) or assemblies, reusable designs of a process. A fixed reserve of florins rewards them in proportion to a score of real use alone, counted once a process resolves, with no vote (Figaro 2026k).</li>
                    <li><strong>The florin.</strong> The one token the protocol issues carries no claim on revenue and no vote. Its genesis allocation is minted at zero, for no consideration, and the designers&rsquo; reserve only on counted use (Figaro 2026f).</li>
                    <li><strong>The DAO.</strong> The decentralized autonomous organization (DAO) governs its own treasury and reaches nothing else: no vote moves a commitment, a bond, or a resolution. It spends by judgment on what use cannot measure. It holds a grant minted at genesis. Beyond the grant, the DAO accrues rewards only when the network is used: it publishes designs of its own, and their counted use is rewarded under the same rule as any designer&rsquo;s.</li>
                    <li><strong>The denominations.</strong> Any token of the ERC-20 standard (the fungible-token standard) with fixed balances and exact transfers may denominate a process, one per process: a coordination token, such as a stablecoin or the florin; a community&rsquo;s token; or a designer&rsquo;s utility token. A designer makes its token the door to a resource by composing an assembly under which every payment and bond is in that token. The chain checks no eligibility; a party needs only the token to bond and pay. Every party signs the token into the agreement, so the gate is the sellers&rsquo; bindings. The token carries access and no claim on anyone&rsquo;s revenue.</li>
                    <li><strong>The data.</strong> The chain holds a fingerprint (a hash) of the agreement. A party can show one term of it, to a buyer of its data or to a forum, with the evidence that the term belongs to the agreement and nothing else. A datum is public only where the mechanism needs it beyond the two parties, at no finer grain than that need: a locality, never an address; a hash, never the plaintext. The aggregate is public; the detail is the parties&rsquo; own, sealed or sold on their terms; the mechanism holds no data to sell.</li>
                    <li><strong>The composition with law and the market.</strong> An agreement composes legality in through its clauses: a clause may name the applicable law, a forum, the filing a jurisdiction requires, or a license. The data a process leaves meets a norm outside the mechanism, such as an electronic invoice, a sustainability report, or a tax return. A trade can thus meet its regulatory, legal, and fiscal obligations through the terms the parties signed and the data the process leaves. The mechanism reads none of those terms.</li>
                </ol>
                <p>Figure 1 draws the whole as this section states it.</p>
                <WholeSystemFigure
                    idPrefix="cryptoeconomic-system-whole-system"
                    caption={
                        <>
                            Figure 1. The whole, drawn from this section: the base chain beneath; the mechanism&rsquo;s two operations; the parts of the whole in this section&rsquo;s order; the graph composed above the rules, the designs published, the bindings sellers make, and the selections buyers make; the forms it carries. The data runs beside every part: the chain holds fingerprints, the aggregate is public, the detail is the parties&rsquo; own.
                        </>
                    }
                />
            </PaperSection>

            <PaperSection title="3. The Measure: Three Definitions and What Each Presupposes">
                <p>
                    Zamfir&rsquo;s 2015 talk is the earliest recorded citation of the term (Voshmgir and Zargham 2020). It defines cryptoeconomics as &ldquo;a formal discipline that studies protocols that govern the production, distribution, and consumption of goods and services in a decentralized digital economy&rdquo; (Zamfir 2015, quoted in Brekke and Alsindi 2021). The discipline &ldquo;focuses on the design and characterization of these protocols&rdquo;. The object it presupposes is an institution, and later work makes that explicit. In that work &ldquo;blockchains are an institutional technology&rdquo;, a kind of economic coordination beside firms, markets, and relational contracting (Davidson, De Filippi, and Potts 2018; Berg, Davidson, and Potts 2019). <em>Test D1:</em> the system governs production, distribution, and consumption as an institution does, decentralized.
                </p>
                <p>
                    Buterin&rsquo;s 2017 talk presents cryptoeconomics &ldquo;as a methodology for building systems that try to guarantee certain kinds of information security properties&rdquo; (Buterin 2017, quoted in Brekke and Alsindi 2021). The field later stated such a guarantee as a comparison, &ldquo;Cryptoeconomic Safety: cost-of-corruption &gt; profit-from-corruption&rdquo; (Deb, Raynor, and Kannan 2024, sec. 1, eq. 1). It also put collusion inside the threat model, since &ldquo;it is much harder, and more likely to be outright impossible, to make mechanisms that maintain desirable properties in a model where participants can collude&rdquo; (Buterin 2019). <em>Test D2:</em> each guarantee holds as what a defector loses against what it gains, collusion included.
                </p>
                <p>
                    Voshmgir and Zargham (2020, 9) define a cryptoeconomic system by &ldquo;individual autonomous actors&rdquo;, &ldquo;economic policies embedded in software&rdquo;, and &ldquo;emergent properties arising from the interactions of those actors with the whole network&rdquo;. Its tokens are purpose-driven: programmed to steer the collective action of autonomous actors &ldquo;towards a collective goal in the absence of intermediaries&rdquo; (8). Of designing one, they hold that &ldquo;it is more realistic to take a polycentric viewpoint where there is no one social optimum&rdquo;, since &ldquo;any choice of coordination objective is a subjective choice&rdquo; (10). <em>Test D3:</em> autonomous actors, policies in software, and tokens that steer toward goals with no intermediary, the goals several.
                </p>
                <p>
                    The term is contested. Ito (2024) proposes renaming the field &ldquo;token-based mechanism design&rdquo;, and Buterin restated his own definition: &ldquo;cryptoeconomics, first of all, is economics&rdquo; (Buterin and Cowen 2018). We take the three together, with Voshmgir and Zargham&rsquo;s as the spine, since it alone defines the whole and names the disciplines a full account passes through.
                </p>
            </PaperSection>

            <PaperSection title="4. The Whole Holds Under This Frame and Under No Other">
                <p>
                    A part <em>has its place</em> under a definition when it is an instance of an object the definition names. Under D1 the object is a protocol that governs production, distribution, or consumption. Under D2 it is a guarantee that holds as what a defector loses against what it gains. Under D3 it is an autonomous actor, a policy embedded in software, a token that steers toward a goal, or an emergent property of the actors&rsquo; interactions.
                </p>
                <FormalBlock label="Proposition 1 (The frame in which the whole holds).">
                    <p>
                        Cryptoeconomics is the one frame in which the whole of Figaro holds together: under its three definitions each part of Section 2 has its place, the three distortions are each carried by a part, and each definition is met by the whole. Every other axis, whether the mechanism alone, the product, the interface, or the firm in either of its business models, either leaves a part without a place or places it by restoring a party that stands over the system; either way it fixes the set from above, which is a closed-world prior.
                    </p>
                </FormalBlock>
                <PaperRun title="What the argument rests on.">
                    The argument uses seven premises, and the first two state the problem and its measure. (1) Exchange between strangers bears the cost of attracting buyers, the cost of handling disputes, and the intermediary&rsquo;s capture of the trade&rsquo;s data (stipulated, with the literature of Section 1). (2) The measure is tests D1, D2, and D3 (Section 3).
                </PaperRun>
                <p>
                    The other five are four results proved in earlier papers and one rule of the protocol. (3) For parties beyond each other&rsquo;s coercive reach, universal performance with resolution is an equilibrium at every order of a process, and its outcome is the buyer&rsquo;s unique maximum (Figaro 2026b, Theorems 1 and 3). After performance the buyer nets <Math>{"0"}</Math> by resolving against <Math>{"-P"}</Math> by withholding; each seller nets <Math>{"+P"}</Math> against at most <Math>{"-G"}</Math>, a margin of <Math>{"P + G \\ge 2P"}</Math>. The seller&rsquo;s comparison takes two things as given: the buyer&rsquo;s plan to resolve once performance has occurred and not before, and the other sellers&rsquo; performance. (4) Formation needs no venue: a market layer inherits the mechanism&rsquo;s equilibrium unchanged when its only output is a commitment the mechanism accepts, formed only from inputs the parties themselves supply, and accepted on nothing the layer did. An order therefore forms by a dispatch race on posted prices or by a request for quotes, with no venue holding the market&rsquo;s state (Figaro 2026h, Propositions 3.1 and 6.2). (5) Under a bonded commitment a sale of data between strangers is an ordinary purchase: after performance, resolving is the buyer&rsquo;s strictly better reply (Figaro 2026j, Proposition 2). (6) Fabricated score dilutes the fixed reserve and never enlarges it (Figaro 2026k), and the florin is a focal point (Schelling&rsquo;s term: the choice parties converge on without communicating) with nothing beneath it (Figaro 2026f). (7) Under the composition doctrine, every design is published without permission, composed by designers, bound by sellers, and selected by buyers, and no party ranks or admits designs (stipulated: the protocol&rsquo;s rule).
                </p>
                <p>
                    Two limits bound the claim. That no other axis holds the whole is shown against the axes named in Step 3 and after Step 4, not against every frame a reader may bring; a frame not taken here, such as a reading of the network as a governed commons, is what the falsifier&rsquo;s first limb invites. Step 1 says which part carries each distortion, not how large the cost is: the paper does not weigh the bonds&rsquo; time value, which grows with the number of orders in a process, against the take of a platform a process would replace.
                </p>
                <PaperRun title="Step 1: each distortion against the part that carries it.">
                    By premise 3, the bond makes the promise good before any dispute arises, so it carries the cost of handling disputes. Less is left in dispute, and a forum rules on the open data for the remainder before the buyer resolves. No venue holds the market (premise 4), so no party bears the cost of attracting buyers on the market&rsquo;s behalf and recovers it through a rent. The cost falls on whoever gains from a buyer&rsquo;s arrival: a wallet that registers, through its staked public listing (part 2), a community that brings its own members, and a designer through its token, the door to a resource (part 6). By part 7 and premise 5, no party in the middle holds the data, and each party sells its own in a trade of its own. Is the public aggregate, which any analyst may mine, not capture by another name? Its grain answers it (part 7): what is public is a locality and a hash, never an address or a plaintext, and the detail stays with the parties.
                </PaperRun>
                <PaperRun title="Step 2: each part placed under a definition.">
                    Buterin&rsquo;s information security properties are, here, the mechanism&rsquo;s invariants. They are the rules of Section 2, part 1, read as properties: <em>asymmetric and cumulative bonding</em>, <em>buyer dominance</em>, <em>atomic resolution</em>, and <em>no escape hatches</em>. A fifth, <em>immutable evidence</em>, binds each step to the signed agreement by its fingerprint as it happens. Each is a property of the mechanism&rsquo;s rules, checkable from the chain&rsquo;s public state.
                </PaperRun>
                <p>
                    The bond meets D2 in the field&rsquo;s own form. Premise 3&rsquo;s comparison is a cost of defection set against its profit, written below for a seller that walks away and a buyer that withholds after performance.
                </p>
                <div className="my-2">
                    <Math display>{"\\text{seller: } G - 2G = -G \\;<\\; +P \\qquad\\qquad \\text{buyer: } P - 2P = -P \\;<\\; 0"}</Math>
                </div>
                <p>
                    Return to the machine shop of Section 1, with the part priced at <Math>{"P = 100"}</Math> in a stablecoin. With one seller, the value accumulated through the shop&rsquo;s order is its own payment, so <Math>{"G = P = 100"}</Math>. At commit the buyer locks <Math>{"200"}</Math> and the shop locks <Math>{"200"}</Math>. The shop ships and the buyer resolves: the shop is paid <Math>{"100"}</Math> and its bond of <Math>{"200"}</Math> is refunded, and the buyer&rsquo;s bond is refunded less the payment, <Math>{"100"}</Math> of its <Math>{"200"}</Math>. Had the shop walked away, it would have kept a part worth at most <Math>{"100"}</Math> and left <Math>{"200"}</Math> locked, a net of <Math>{"-100"}</Math> against <Math>{"+100"}</Math>. Had the buyer withheld after performance, it would have kept the part and left <Math>{"200"}</Math> locked, <Math>{"-100"}</Math> against <Math>{"0"}</Math>. What was bought and on what terms stays with the two; the chain shows two wallets, the amounts, and the agreement&rsquo;s fingerprint.
                </p>
                <p>
                    Collusion enters as an outside payment, and it has only the parties&rsquo; own comparisons to change, because after commit the chain accepts one judgment, the buyer&rsquo;s resolution. A payment that makes holding out worth a seller&rsquo;s while must exceed its margin of <Math>{"P + G"}</Math>. One that makes a buyer withhold after performance must exceed <Math>{"P"}</Math>, so the guarantee holds against any outside payment smaller than the margin. A payment conditional on holding out must be renewed for as long as the process stands open. Parties acting together can still produce well-formed books for a trade that never took place: the data proves what the mechanism executed, never the world.
                </p>
                <p>
                    The other parts fall under D1 and D3. Sellers and designers produce, and resolution distributes (D1). The data goes to the parties that produced it, and the trade&rsquo;s obligations under law are met through its signed terms and its data (D1). The stake, the rewards, the florin, the denominations, and the DAO&rsquo;s judgment over its own treasury are policies and tokens that steer actors toward several goals (D3). The stake steers the honest majority but does not deter a determined Sybil (one actor posing as many wallets), which locks one stake for each registration it holds live. The bound on such farming is dilution per unit of the attacker&rsquo;s tokens (Figaro 2026k). The cost-against-profit form of D2 is the bond&rsquo;s alone.
                </p>
                <p>
                    Does a mechanism that accepts any ERC-20 token fail D3, whose tokens sit at the system&rsquo;s center? The token belongs to the system, not to the mechanism. The system&rsquo;s tokens are the florin and the denominations designers and communities choose, beside the stake a registration locks. Reading the token-neutral mechanism as the system is the first closed-world prior of Step 3.
                </p>
                <PaperRun title="Step 3: every other axis restores a party over the system.">
                    Read on the mechanism alone, the system is one contract between given parties, and the designs, the rewards, the florin, and the DAO fall outside it. The reader who draws that boundary fixes the system&rsquo;s parts from above, which is the closed-world reading of Section 1. Read as a product, it has an offeror who sets its features and admits its users; the protocol has none, only rules anyone may implement. Read as an interface, it is the set of acts the screens list, a catalog closed by whoever draws it, while any wallet may publish a clause no screen has shown.
                </PaperRun>
                <p>
                    The firm has two business models: one internalizes the trade under a boss, and the other, the platform, intermediates it for a take. Read as the first, the process has a standing nucleus and a residual claimant (the party that keeps what is left after every other claim is paid), yet it dissolves at resolution with zero equity (Figaro 2026d). Read as the second, it is an intermediary that matches, holds the data, and charges, and no party stands in the middle. Is a designer whose token gates an assembly not a platform under another name? It sets no price, each price being the one its buyer and its seller sign, takes nothing from the trade, and holds no data; what it holds is the token, whose value is the access it grants.
                </p>
                <PaperRun title="Step 4: the measure is open-world by its own words.">
                    Zamfir&rsquo;s definition presupposes, in its own text, a decentralized economy, and Voshmgir and Zargham&rsquo;s autonomous actors and goals pursued in the absence of intermediaries. Buterin&rsquo;s states its guarantee as a comparison each party makes for itself, which no party over the system enters. A frame built on them therefore places no party over the system, and Step 2 shows that each part finds its place under one of them. The other axes place the parts only by supplying that party (Step 3).
                </PaperRun>
                <p>
                    Is the measure not chosen to fit the system? The three definitions are the field&rsquo;s, stated before this system and for others, and the test they set can fail in the three ways the falsifier names.
                </p>
                <p>
                    Would any frame for decentralized systems do as well? Distributed systems place the rules but not the incentives, and mechanism design the incentives of one game but not the tokens or what emerges from many. Institutional economics places the process as an institution beside firms, markets, and relational contracting (Davidson, De Filippi, and Potts 2018), which is D1 itself. Read alone it places neither the bond&rsquo;s comparison nor the tokens&rsquo; steering, which are D2&rsquo;s and D3&rsquo;s.
                </p>
                <PaperRun title="Conclusion.">
                    By Steps 1 to 4, cryptoeconomics is the one frame in which the whole of Figaro holds together: each part has its place under one of its definitions, each distortion is carried by a part, and each definition is met by the whole. Every other axis, the mechanism alone, the product, the interface, the firm in either of its business models, or the three frames answered after Step 4, either leaves a part without a place or places it by restoring a party over the system, and either way returns a closed-world prior.
                </PaperRun>
                <PaperRun title="Falsifier.">
                    The proposition is false if another axis is shown under which every part of Section 2 has its place with no party standing over the system. It is false if a definition of Section 3 is shown that the system fails: a guarantee that does not hold as loss against gain, a distribution that needs an intermediary, or a token that steers by some party&rsquo;s discretion. It is false if a part of the whole is shown that none of the three definitions can place.
                </PaperRun>
                <PaperRun title="Scope.">
                    The claim is about the frame for the whole, for parties beyond each other&rsquo;s coercive reach; a part read on its own axis, the bond by mechanism design or the books by accounting, keeps that axis&rsquo;s result. The chain beneath is governed, and its governance is inherited whole by whoever chooses a chain. The equilibrium is proved (Figaro 2026b, Theorems 1 and 3), not observed, and &ldquo;the level of security very much depends on how people react to economic incentives&rdquo; (Voshmgir and Zargham 2020, 9). The road to the programs in Section 5 is a possibility the substrate opens, not a prediction.
                </PaperRun>
            </PaperSection>

            <PaperSection title="5. What Emerges Is a Substrate on Which Economic Forms Compose">
                <p>
                    In Figaro governance is distributed among the designers, sellers, and buyers of premise 7, and nothing moves a bonded commitment but its buyer. The sense of governance is Voshmgir and Zargham&rsquo;s (2020, 9), stated over three levels that are levels of analysis, not sizes. The micro-foundational level, &ldquo;relating to agent level behaviors&rdquo;, is here each party&rsquo;s comparison at its order. The meso-institutional level is &ldquo;relating to policy setting and governance&rdquo;, and the macro-observable level is here what the public data shows. For them &ldquo;governance is precisely managing the relationship between the micro and macro scales&rdquo;, and &ldquo;automation in socioeconomic systems is tantamount to algorithmic policy making&rdquo; (10).
                </p>
                <PaperRun title="The markets.">
                    A proof-of-work chain has four markets, one standing on the next. At the bottom is the market for the resource, electricity. Budish (2025) counts the per-block cost of securing the chain as electricity plus the rental of equipment, a cost that has to stay large relative to what an attack would win. Above it is the market for the machinery that turns the resource into a service: the warehouse, the wiring, the ASICs (chips built to run one hashing algorithm) or the computers, and the software, open source though it is. Prat and Walter (2021) model it as a market with free entry, in which the token&rsquo;s exchange rate sets the computing power the network attracts, and find that a significant share of mining rewards went into mining equipment.
                </PaperRun>
                <p>
                    Above that is the market for block production, the service itself. Its producers are paid by what each transaction gives to be included in a block, together with a subsidy in newly issued tokens. Nakamoto (2008, &sect; 6) set that subsidy as an incentive to support the network and as the way to distribute the first coins, one that &ldquo;may help encourage nodes to stay honest&rdquo; and that can give way to transaction payments over time (Easley, O&rsquo;Hara, and Basu 2019). Huberman, Leshno, and Moallemi (2021) show that what users pay is set by congestion in a market with no monopolist: a monopoly run by a protocol. The consensus protocol&rsquo;s mechanism design is what makes honest validation each participant&rsquo;s best strategy in that market, within the limits Budish states.
                </p>
                <p>
                    At the top is the market for the token itself: how much value a holder is willing to store in it. Pagnotta (2022) shows that the token&rsquo;s price and the chain&rsquo;s security are determined together, since those who secure the chain are paid in the token its users hold. On a proof-of-stake chain the bottom rung is the stake its validators lock rather than electricity, and the rungs above stand as before; Budish (2025) writes the resource as &ldquo;work, stake, etc.&rdquo; Catalini and Gans (2020) name the two costs the service lowers: verification and networking.
                </p>
                <PaperRun title="The markets above the chain&rsquo;s.">
                    We read Figaro&rsquo;s markets on the same four rungs. The reading is ours, and the chain&rsquo;s mechanisms do not come with it. At the bottom is the resource: the real-world asset each wallet represents. Above it is the machinery that turns the resource into a service: the clauses, agreements, and assemblies that designers compose and sellers bind. Above that is the production: the process, a trade between strangers, in which the buyer&rsquo;s payment pays the sellers. At the top are the tokens: a designer&rsquo;s utility token, valued by how much a holder stores in it to reach the resource; a community&rsquo;s token; the florin.
                </PaperRun>
                <p>
                    The bonded commitment secures the third rung as a consensus protocol secures block production, in one exact sense. For parties beyond each other&rsquo;s coercive reach, the bond schedule makes performance and resolution each party&rsquo;s best reply in that market while the others keep theirs (Section 4). It secures the market one order at a time, where consensus secures a chain as a whole. Unlike a block producer, it pays itself nothing (Section 1). A Figaro transaction executes on the chain and inherits its security.
                </p>
                <p>
                    Above these four, Figaro opens a fifth market, the one the platform economy was built on: the market for data. Its goods are the data of Section 2, part 7, sold under premise 5. No one can erase a fingerprint from the chain once written, so the evidence persists. The data is the party&rsquo;s own where a platform held it, so a compromise of one wallet&rsquo;s data reaches that wallet&rsquo;s alone, never a store of everyone&rsquo;s. The composition of Section 2 keeps the markets above the mechanism an open set.
                </p>
                <p>
                    Three properties emerge, under Voshmgir and Zargham&rsquo;s (2020, 2) caution that &ldquo;the system level behaviour cannot be inferred from the local state changes induced by individual network actors&rdquo;. Communities form around a signal, though not only around it: the tokens a wallet holds and the assemblies it trades through say which communities and designs it takes part in. A public map of trade forms from the aggregate data. Value can move from the top of hierarchies to the assets that produce, since each wallet trades for itself on the same terms. Whether it does is a matter of use, which the equilibrium does not decide.
                </p>
                <p>
                    This paper&rsquo;s own step is drawn from the composition doctrine of premise 7. The rules fix the bond and the resolution and nothing else, so the economic form a trade takes is a property of the graph composed above them, the graph premise 7 describes. A market-liberal graph, a cooperative graph, and a mutual-aid graph run over the same rules under premise 7. No coordination objective is fixed at the substrate, so Voshmgir and Zargham&rsquo;s polycentric viewpoint becomes an operational rule. The doctrine reaches any form whose exchanges are voluntary, signed, bonded commitments with a positive payment in one ERC-20 token per process. A group that would trade at no price issues its own token and trades at a positive price in it.
                </p>
                <p>
                    The substrate that emerges has no seat that decides after the close. For the network-state, on-chain-governance, and holacracy programs, the question of who governs therefore moves from the commercial layer to the graph. For the cypherpunks, the Ethereum Foundation&rsquo;s mandate, and defensive acceleration (d/acc), the substrate is the <em>ex ante</em> instance of what they ask for (Figaro 2026l). The substrate can serve as a network state&rsquo;s commercial layer, never its polity: criminal law, public goods, and defense stay with the polity.
                </p>
            </PaperSection>

            <PaperSection title="6. The Institution Is the Process">
                <p>
                    Our claim is narrower than Voshmgir and Zargham&rsquo;s: the bond moves the guarantee that the firm, the court, the bank, and the platform give after the fact to before the trade, for parties beyond each other&rsquo;s coercive reach (Figaro 2026m); what remains of the court is the forum that rules on what the bond leaves in dispute. Voshmgir and Zargham (2020, 5) claim cryptoeconomic infrastructure can &ldquo;reduce the principal-agent dilemma of organizations&rdquo; through transparency and &ldquo;disintermediate by reducing bureaucracy&rdquo;. They also claim it can &ldquo;replace the reactive procedural security of the current legal system, with proactive and automated mechanisms that make a potential breach of contract expensive and therefore infeasible&rdquo;.
                </p>
                <p>
                    The institution Figaro makes available is the process itself, one that lasts the time of one transaction. Its terms are the signed clauses, what makes its promise good the bonds, its books the data it leaves, and its close the buyer&rsquo;s resolution (Figaro 2026g). Remedies are agreed before resolution, and resolution is final. The parties bargain over a remedy while the process stands open, and a forum or court reaches the trade through the parties, never through the resolution.
                </p>
            </PaperSection>

            <PaperSection title="7. The Eight Disciplines">
                <p>
                    Voshmgir and Zargham name eight disciplines a full account of a cryptoeconomic system passes through. We take them in their order and give each one result about the whole, cited to the paper that proves it. Where a result rests on the equilibrium, it holds for parties beyond each other&rsquo;s coercive reach.
                </p>
                <PaperRun title="Industrial and Systems Engineering.">
                    A service with many providers, such as an air journey, decomposes into one process in which each provider is a seller bonded to the passenger. Atomic resolution gives the providers their own reason to remedy a disruption before a forum engages (Figaro 2026a, 2026b, Theorem 4). The reason holds wherever a provider&rsquo;s share of the remedy costs less than its payment and its bond. Both stay out of its reach while the disruption stands.
                </PaperRun>
                <PaperRun title="AI, Optimization and Control Theory.">
                    Any key that signs and locks its bond is a party, so the equilibrium applies to an agent as to a person, and the bound over many commitments is the agent&rsquo;s policy (Figaro 2026n).
                </PaperRun>
                <PaperRun title="Computer Science and Cryptography.">
                    A machine check of a mechanism whose only operations are commit and resolve carries its equilibrium to the code only through a specification that pins the payoff table, or narrows it to a family of tables over which an equilibrium has been proved, and conservation and solvency do neither (Figaro 2026o).
                </PaperRun>
                <PaperRun title="Economics and Game Theory.">
                    Premise 3&rsquo;s equilibrium extends to two further settings (Figaro 2026h, 2026j). It holds unchanged for an order formed with no venue, wherever the market layer&rsquo;s only output is a commitment the mechanism already accepts. It holds for a sale of data, which answers Arrow&rsquo;s information paradox: that a buyer cannot value information before seeing it, and need not pay once it has.
                </PaperRun>
                <PaperRun title="Psychology and Decisions Science.">
                    Each party&rsquo;s comparison straddles its reference point (the wealth from which it counts gains and losses), so loss aversion weights the defecting branch without reversing either comparison, and the equilibrium is checkable with one comparison per node (Figaro 2026c).
                </PaperRun>
                <PaperRun title="Political Science, Institutional Economics and Governance.">
                    The process is the cheaper governance mode where three conditions hold (Figaro 2026g). Each party can bond its own order. Its gas, its bonds&rsquo; time value, and the loss a standoff leaves lie together below the apparatus the process displaces. The buyer can judge performance before it resolves.
                </PaperRun>
                <PaperRun title="Philosophy, Law and Ethics.">
                    Resolution is on chain and adjudication off chain: a forum rules on the signed, fingerprinted data and has no act in the mechanism, which is why attaching one costs the equilibrium nothing (Figaro 2026i).
                </PaperRun>
                <PaperRun title="Operations Research and Management Science.">
                    A process is an accounting entity whose equity is zero at every moment and whose resolution is the closing entry of a self-closing ledger period (Figaro 2026d).
                </PaperRun>
            </PaperSection>

            <PaperSection title="8. Conclusion">
                <p>
                    Trade between strangers pays to attract buyers, pays to handle disputes, and surrenders its data to whoever stands behind it. Figaro answers all three with one set of parts: the cost of disputes with the mechanism, for parties beyond each other&rsquo;s coercive reach, at the price of gas and the time value of what is locked; the cost of attracting buyers with those who gain from it; and the data with the parties that produced it. Each part has its place under a definition that presupposes no party in the middle, and every other axis places the same parts only by putting such a party back. Cryptoeconomics is the frame in which the whole holds together. What it shows is a substrate on which economic forms compose, displacing in part the institutions that act after the trade.
                </p>
            </PaperSection>
        </PaperLayout>
    );
}
