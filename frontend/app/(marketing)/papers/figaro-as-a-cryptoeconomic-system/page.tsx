import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import { PaperLayout, PaperSection, PaperRun } from "@/components/papers/PaperLayout";
import { Math } from "@/components/papers/Math";

export const metadata: Metadata = withOg({
    title: "Figaro as a Cryptoeconomic System — Figaro Protocol",
    description:
        "Trade between strangers bears three costs a credible promise would not impose: attracting buyers, handling disputes, and the intermediary's capture of the trade's data. Read against the field's three definitions of a cryptoeconomic system, Zamfir's, Buterin's, and Voshmgir and Zargham's, every part of Figaro has its place, and every other axis (the Core alone, the product, the interface, the firm, the platform) returns a closed-world prior. What emerges is a substrate on which economic forms compose.",
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
                        Trade between strangers bears three costs that a credible promise would not impose. They are the cost of attracting buyers, the cost of handling disputes, and the capture of the trade&rsquo;s data by the intermediary that stands behind it. We argue that cryptoeconomics is the one frame in which the whole of Figaro, a decentralized, permissionless protocol for bonded trade between strangers, holds together, and that every other axis returns a closed-world prior. The measure is the field&rsquo;s three definitions: Zamfir&rsquo;s, Buterin&rsquo;s, and Voshmgir and Zargham&rsquo;s. Each is read with what it presupposes, made explicit by later work where the definition leaves it implicit: an institution, a guarantee stated as cost against profit, and tokens that steer action toward a collective goal without intermediaries.
                    </p>
                    <p>
                        The bonded commitment, the stake, the designers&rsquo; rewards, the florin, and the decentralized autonomous organization (DAO) answer the three costs at once. The bond carries the cost of handling disputes; the cost of attracting buyers moves to a staked public listing, the communities, and a designer&rsquo;s token; no party in the middle holds the data. Each part has its place under one of the definitions. The Core alone, the product, the interface, the firm, and the platform each leave a part unplaced or restore a party that stands over the system. What emerges is a substrate on which economic forms compose, composed by designers, bound by sellers, and selected by buyers. The equilibrium the argument uses is proved, not observed.
                    </p>
                </>
            }
            references={
                <>
                    <li>Berg, Chris, Sinclair Davidson, and Jason Potts. 2019. <em>Understanding the Blockchain Economy: An Introduction to Institutional Cryptoeconomics</em>. Cheltenham: Edward Elgar. https://doi.org/10.4337/9781788975001.</li>
                    <li>Brekke, Jaya Klara, and Wassim Zuhair Alsindi. 2021. &ldquo;Cryptoeconomics.&rdquo; <em>Internet Policy Review</em> 10 (2). https://doi.org/10.14763/2021.2.1553.</li>
                    <li>Buterin, Vitalik. 2017. &ldquo;Introduction to Cryptoeconomics.&rdquo; Talk, Ethereum Foundation. YouTube video. https://youtu.be/pKqdjaH1dRo. Accessed October 28, 2026. Quoted in Brekke and Alsindi 2021.</li>
                    <li>Buterin, Vitalik. 2019. &ldquo;On Collusion.&rdquo; vitalik.eth.limo, April 3, 2019. https://vitalik.eth.limo/general/2019/04/03/collusion.html. Accessed October 20, 2026.</li>
                    <li>Buterin, Vitalik, and Tyler Cowen. 2018. &ldquo;Vitalik Buterin on Cryptoeconomics and Markets in Everything.&rdquo; <em>Conversations with Tyler</em>, episode 45, podcast, July 18, 2018. https://conversationswithtyler.com/episodes/vitalik-buterin/. Accessed October 20, 2026.</li>
                    <li>Davidson, Sinclair, Primavera De Filippi, and Jason Potts. 2018. &ldquo;Blockchains and the Economic Institutions of Capitalism.&rdquo; <em>Journal of Institutional Economics</em> 14 (4): 639&ndash;658. https://doi.org/10.1017/S1744137417000200.</li>
                    <li>Deb, Soubhik, Robert Raynor, and Sreeram Kannan. 2024. &ldquo;STAKESURE: Proof of Stake Mechanisms with Strong Cryptoeconomic Safety.&rdquo; arXiv preprint, arXiv:2401.05797. https://arxiv.org/abs/2401.05797. Accessed October 23, 2026.</li>
                    <li>Figaro. 2026a. &ldquo;Air Service as Coordinated Resource Markets: An Industrial-Engineering Reading of the Bonded Architecture.&rdquo; Preprint. https://figaroprotocol.com/papers/air-service-coordination/. Accessed October 28, 2026.</li>
                    <li>Figaro. 2026b. &ldquo;Asymmetric Bonding and Buyer Dominance: Two Composing Mechanisms for Self-Enforcing N-Party Coordination.&rdquo; Preprint. https://figaroprotocol.com/papers/asymmetric-bonding/. Accessed October 28, 2026.</li>
                    <li>Figaro. 2026c. &ldquo;Behavioral Game Theory of the Two-Mechanism Bonded Commitment: Loss Aversion, Coordination, Peer Pressure, and Incentive Legibility.&rdquo; Preprint. https://figaroprotocol.com/papers/behavioral-game-theory/. Accessed October 28, 2026.</li>
                    <li>Figaro. 2026d. &ldquo;Bookkeeping as Protocol Byproduct: Self-Closing Ledger Periods under the Bonded Commitment.&rdquo; Preprint. https://figaroprotocol.com/papers/self-closing-ledger-periods/. Accessed October 28, 2026.</li>
                    <li>Figaro. 2026e. &ldquo;Coordination Substrates: Firm, Platform, Court, and Bond: A Comparative Institutional Analysis of Trade Between Strangers.&rdquo; Preprint. https://figaroprotocol.com/papers/coordination-substrates/. Accessed October 28, 2026.</li>
                    <li>Figaro. 2026f. &ldquo;The Florin: A Schelling-Point Token Issued at Zero: From Howey to Sufficiently Decentralized to a Focal Point.&rdquo; Preprint. https://figaroprotocol.com/papers/florin-schelling-point-token/. Accessed October 28, 2026.</li>
                    <li>Figaro. 2026g. &ldquo;From Firms to Transaction-Scoped Institutions: The Coasean Collapse.&rdquo; Preprint. https://figaroprotocol.com/papers/transaction-scoped-institutions/. Accessed October 28, 2026.</li>
                    <li>Figaro. 2026h. &ldquo;Markets Without a Venue: Dispatch Races and Requests for Quotes as Market-Design Mechanisms over a Market-Blind Mechanism.&rdquo; Preprint. https://figaroprotocol.com/papers/markets-without-a-venue/. Accessed October 28, 2026.</li>
                    <li>Figaro. 2026i. &ldquo;On-Chain Evidence, Off-Chain Adjudication: A Layered Approach to Smart-Contract Dispute Resolution.&rdquo; Preprint. https://figaroprotocol.com/papers/on-chain-evidence/. Accessed October 28, 2026.</li>
                    <li>Figaro. 2026j. &ldquo;Self-Authenticating Data Sales: Arrow&rsquo;s Information Paradox Under the Bonded Commitment.&rdquo; Preprint. https://figaroprotocol.com/papers/self-authenticating-data-sales/. Accessed October 28, 2026.</li>
                    <li>Figaro. 2026k. &ldquo;Substrate-Broadening Retroactive Public-Goods Funding: Allocating a Fixed Reserve on Adoption Counted as It Happens.&rdquo; Preprint. https://figaroprotocol.com/papers/substrate-broadening-rpgf/. Accessed October 28, 2026.</li>
                    <li>Figaro. 2026l. &ldquo;The Ungoverned Substrate: Network States, Holacracy, On-Chain Governance, the Ethereum Mandate, the Cypherpunks, and d/acc: The Ex-Post Frame They Share, and a Commercial Layer With No Seat.&rdquo; Preprint. https://figaroprotocol.com/papers/ungoverned-substrate/. Accessed October 28, 2026.</li>
                    <li>Figaro. 2026m. &ldquo;The Visibility of Coordination: A Gramscian Reading of the Platform Economy and the Bonded Alternative.&rdquo; Preprint. https://figaroprotocol.com/papers/visibility-of-coordination/. Accessed October 28, 2026.</li>
                    <li>Figaro. 2026n. &ldquo;What a Trust Layer for Agents Acting for Principals Needs: Why a Bond Locked at Commit Supplies It, and Neither a Reputation Registry nor a Legal Wrapper Does.&rdquo; Preprint. https://figaroprotocol.com/papers/actor-neutral-coordination/. Accessed October 28, 2026.</li>
                    <li>Figaro. 2026o. &ldquo;What Formal Verification Transfers to a Bonded Contract: The Payoff Table as the Specification, and What No Check Reaches.&rdquo; Preprint. https://figaroprotocol.com/papers/verified-resolution-kernel/. Accessed October 28, 2026.</li>
                    <li>Ito, Kensuke. 2024. &ldquo;Cryptoeconomics and Tokenomics as Economics: A Survey with Opinions.&rdquo; arXiv preprint, arXiv:2407.15715. https://arxiv.org/abs/2407.15715. Accessed October 23, 2026.</li>
                    <li>Milgrom, Paul R., Douglass C. North, and Barry R. Weingast. 1990. &ldquo;The Role of Institutions in the Revival of Trade: The Law Merchant, Private Judges, and the Champagne Fairs.&rdquo; <em>Economics and Politics</em> 2 (1): 1&ndash;23. https://doi.org/10.1111/j.1468-0343.1990.tb00020.x.</li>
                    <li>Rochet, Jean-Charles, and Jean Tirole. 2003. &ldquo;Platform Competition in Two-Sided Markets.&rdquo; <em>Journal of the European Economic Association</em> 1 (4): 990&ndash;1029. https://doi.org/10.1162/154247603322493212.</li>
                    <li>Rochet, Jean-Charles, and Jean Tirole. 2006. &ldquo;Two-Sided Markets: A Progress Report.&rdquo; <em>RAND Journal of Economics</em> 37 (3): 645&ndash;667. https://doi.org/10.1111/j.1756-2171.2006.tb00036.x.</li>
                    <li>Srnicek, Nick. 2017. <em>Platform Capitalism</em>. Cambridge: Polity.</li>
                    <li>Voshmgir, Shermin, and Michael Zargham. 2020. <em>Foundations of Cryptoeconomic Systems</em>. Working Paper Series 1/2020. Vienna: Institute for Cryptoeconomics, Vienna University of Economics and Business. https://doi.org/10.57938/10d8b646-3266-4ec9-b94d-810b528c40a9.</li>
                    <li>Williamson, Oliver E. 1985. <em>The Economic Institutions of Capitalism</em>. New York: Free Press.</li>
                    <li>Zamfir, Vlad. 2015. &ldquo;What Is Cryptoeconomics?&rdquo; Talk, Cryptoeconomicon. YouTube video, posted by Cryptoeconomicon CCRG, February 1, 2015. https://www.youtube.com/watch?v=9lw3s7iGUXQ. Accessed October 20, 2026. Quoted in Brekke and Alsindi 2021.</li>
                    <li>Zuboff, Shoshana. 2019. <em>The Age of Surveillance Capitalism: The Fight for a Human Future at the New Frontier of Power</em>. New York: PublicAffairs.</li>
                </>
            }
        >
            <PaperSection title="1. Three Costs of Trade Between Strangers">
                <p>
                    Stipulate a trade. A machine shop quotes a part to a buyer in another jurisdiction. Neither has traded with the other or expects to again, and no court reaches both at a cost the part could bear. Before the part ships, three costs fall on the trade. Someone pays to bring the buyer to the shop. One party must perform first, so someone stands ready to handle the dispute if the other walks away. And whoever stands behind the trade learns who bought what, from whom, and at what price, and keeps it.
                </p>
                <p>
                    The intermediary that bears these costs has a generic form, which the two-sided-market literature describes. A platform serves two groups whose members do not internalize the value each creates for the other. It bears the cost of attracting one side, often by pricing that side&rsquo;s access below cost so that the other side follows (Rochet and Tirole 2003, 2006). It handles disputes between the strangers it matched, under a policy of its own. It recovers both costs by charging a per-transaction take-rate and by setting the terms of access on both sides. And it holds the relationship between the two sides and the data their trades produce (Srnicek 2017). Taken beyond what the service needs, such data becomes raw material for prediction products sold to others (Zuboff 2019). The older institutions carried the dispute cost the same way, after the trade and by an authority outside it. The law merchant&rsquo;s private judges kept the account by which a cheat was known (Milgrom, North, and Weingast 1990), and a court hears a complaint within a jurisdiction that reaches both parties.
                </p>
                <p>
                    We call each of the three a <em>distortion</em>: a cost or rent that exchange between strangers bears, or bears in the form it takes, because promises between strangers are not credible. Is a distortion not a transaction cost under another name? In part: it takes two of the <em>ex post</em> costs of contracting, haggling and running the governance structure to which disputes are referred (Williamson 1985), and adds the rent an intermediary earns from its position between the parties. Search and the measurement of quality remain transaction costs a credible promise does not remove, so the cost of attracting buyers changes hands rather than vanishing. What a credible promise removes is the intermediary&rsquo;s subsidy of one side, recovered through its rent. The bonds&rsquo; time value is Williamson&rsquo;s fourth <em>ex post</em> cost, the bonding cost of a secure commitment, and it is the one the mechanism keeps.
                </p>
                <p>
                    Two further words recur. A <em>substrate</em> is an institutional technology that makes a stranger&rsquo;s promise worth acting on. The firm, the platform, and the court are three. A bond locked before the trade is a fourth, whose cost is the time value of the parties&rsquo; own tokens and the network&rsquo;s gas (Figaro 2026e). A <em>venue</em> is a party that holds the authoritative state of a market between asking and binding, as an exchange, an auction house, or a dispatcher does (Figaro 2026h).
                </p>
                <p>
                    A reading of a system is <em>closed-world</em> when it takes the set of the system&rsquo;s parties, terms, or uses to be fixed by someone who stands over it. Whatever that someone has not listed then reads as outside the system. A reading is <em>open-world</em> when the set is whatever anyone publishes and others use. A <em>closed-world prior</em> is the closed-world reading a frame brings before it meets the system.
                </p>
                <p>
                    Our claim is that cryptoeconomics is the one frame in which the whole of Figaro holds together, and that every other axis returns a closed-world prior. Its nearest priors are three. Berg, Davidson, and Potts (2019) read the blockchain through one frame, institutional cryptoeconomics. One paper compares the four substrates on ten axes, cost among them (Figaro 2026e), and another reads the programs that seek coordination beyond the state against a bonded substrate (Figaro 2026l). None asks in which frame the whole of one system holds together. Section 2 states the whole, Section 3 the measure, and Section 4 the argument.
                </p>
            </PaperSection>

            <PaperSection title="2. The Whole">
                <p>
                    Figaro is a decentralized, permissionless protocol: the rules strangers follow to trade and to publish what they trade with, which anyone may implement and anyone may build on. A party is any wallet that signs and locks its bond, a person&rsquo;s or an agent&rsquo;s, and every asset that trades does so through a wallet of its own. The whole over which the claim ranges has the following parts.
                </p>
                <ol className="space-y-2 list-decimal pl-6">
                    <li><strong>The bonded commitment.</strong> A process is a linear chain of orders under one buyer, each order a commitment both parties sign. At commit the buyer locks <Math>{"2P"}</Math>, twice the order&rsquo;s payment. The seller locks <Math>{"2G"}</Math>, twice the cumulative value through its order: the sum of its own payment and every payment committed before it in the process. Only the buyer resolves, and resolution is atomic: every seller is paid and every bond refunded at once, the buyer&rsquo;s less the payments it carried, or nothing moves. Commit and resolve are the only operations. Universal performance with resolution is an equilibrium at every order of a process chain. Atomic resolution gives each seller a bonded interest in every other seller&rsquo;s performance (Figaro 2026b, Theorems 1, 3, and 4).</li>
                    <li><strong>The stake.</strong> A wallet registers as a member, or registers a clause, an agreement, or an assembly, by locking the base chain&rsquo;s own currency, placed and reclaimable. While it is locked the registration is surfaced where buyers and designers look.</li>
                    <li><strong>The designs and the designers&rsquo; rewards.</strong> Designers compose terms (clauses and the agreements built from them) or assemblies, reusable designs of a process. A fixed reserve of florins rewards them in proportion to a score of real use alone, counted once a process resolves, with no vote (Figaro 2026k).</li>
                    <li><strong>The florin.</strong> The one token the protocol issues carries no claim on revenue and no vote. Its genesis allocation is minted at zero, for no consideration, and the designers&rsquo; reserve only on counted use (Figaro 2026f).</li>
                    <li><strong>The DAO.</strong> The decentralized autonomous organization (DAO) governs its own treasury and reaches nothing else: no vote moves a commitment, a bond, or a resolution. It spends by judgment on what use cannot measure. Its income arises only when the network is used: the DAO publishes designs of its own, and their counted use accrues to it under the same rule of counted use as any designer&rsquo;s.</li>
                    <li><strong>The denominations.</strong> Any ERC-20 token with fixed balances and exact transfers may denominate a process, one per process: a coordination token, such as a stablecoin or the florin; a community&rsquo;s token; or a designer&rsquo;s utility token. A designer makes its token the door to a resource by composing an assembly under which every payment and bond is in that token. The chain checks no holding. Every party signs the token into the agreement, so the gate is the sellers&rsquo; bindings, and the token carries access and no claim on anyone&rsquo;s revenue.</li>
                    <li><strong>The data.</strong> The chain holds a fingerprint of the agreement and of the data that admits a proof of any one term against it. A party therefore shows one term, to a buyer of its data or to a forum, with that proof and nothing else. A datum is public only where the mechanism needs it beyond the two parties, at no finer grain than that need: a neighborhood cell, never a door; a hash, never the plaintext. The aggregate is public; the detail is the parties&rsquo; own, sealed or sold on their terms; the mechanism holds no data to sell.</li>
                </ol>
            </PaperSection>

            <PaperSection title="3. The Measure: Three Definitions and What Each Presupposes">
                <p>
                    Zamfir&rsquo;s 2015 talk is the earliest recorded citation of the term (Voshmgir and Zargham 2020). It defines cryptoeconomics as &ldquo;a formal discipline that studies protocols that govern the production, distribution, and consumption of goods and services in a decentralized digital economy&rdquo; (Zamfir 2015, quoted in Brekke and Alsindi 2021). The discipline &ldquo;focuses on the design and characterization of these protocols&rdquo;. The object it presupposes is an institution, and later work makes that explicit. In that work &ldquo;blockchains are an institutional technology&rdquo;, a kind of economic coordination beside firms, markets, and relational contracting (Davidson, De Filippi, and Potts 2018; Berg, Davidson, and Potts 2019). <em>Test D1:</em> the system governs production, distribution, and consumption as an institution does, decentralized.
                </p>
                <p>
                    Buterin&rsquo;s 2017 talk presents cryptoeconomics &ldquo;as a methodology for building systems that try to guarantee certain kinds of information security properties&rdquo; (Buterin 2017, quoted in Brekke and Alsindi 2021). The field later stated such a guarantee as a comparison, &ldquo;Cryptoeconomic Safety: cost-of-corruption &gt; profit-from-corruption&rdquo; (Deb, Raynor, and Kannan 2024). It also put collusion inside the threat model, since &ldquo;it is much harder, and more likely to be outright impossible, to make mechanisms that maintain desirable properties in a model where participants can collude&rdquo; (Buterin 2019). <em>Test D2:</em> each guarantee holds as what a defector loses against what it gains, collusion included.
                </p>
                <p>
                    Voshmgir and Zargham (2020) define a cryptoeconomic system by &ldquo;individual autonomous actors&rdquo;, &ldquo;economic policies embedded in software&rdquo;, and &ldquo;emergent properties arising from the interactions of those actors with the whole network&rdquo;. Its tokens are purpose-driven: programmed to steer the collective action of autonomous actors &ldquo;towards a collective goal in the absence of intermediaries&rdquo;. Of designing one, they hold that &ldquo;it is more realistic to take a polycentric viewpoint where there is no one social optimum&rdquo;, since &ldquo;any choice of coordination objective is a subjective choice&rdquo;. <em>Test D3:</em> autonomous actors, policies in software, and tokens that steer toward goals with no intermediary, the goals several.
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
                        Cryptoeconomics is the one frame in which the whole of Figaro holds together: under its three definitions each part of Section 2 has its place, the three distortions are each carried by a part, and each definition is met by the whole. Every other axis, whether the Core alone, the product, the interface, the firm, or the platform, either leaves a part without a place or places it by restoring a party that stands over the system, which is a closed-world prior.
                    </p>
                </FormalBlock>
                <PaperRun title="Premises.">
                    The argument uses seven.
                </PaperRun>
                <ol className="space-y-2 list-decimal pl-6">
                    <li><strong>Three distortions.</strong> Exchange between strangers bears the cost of attracting buyers, the cost of handling disputes, and the intermediary&rsquo;s capture of the trade&rsquo;s data (stipulated, with the literature of Section 1).</li>
                    <li><strong>The measure.</strong> Tests D1, D2, and D3 (Section 3).</li>
                    <li><strong>The equilibrium.</strong> After performance the buyer nets <Math>{"0"}</Math> by resolving against <Math>{"-P"}</Math> by withholding, with no assumption about the seller. Given that, and the buyer&rsquo;s plan to resolve once performance has occurred and not before, each seller nets <Math>{"+P"}</Math> by performing, provided the other sellers perform, against at most <Math>{"-G"}</Math> by holding out, a margin of <Math>{"P + G \\ge 2P"}</Math>. Given the sellers&rsquo; performance, the buyer prefers keeping the process open before performance to resolving at once. Universal performance with resolution is therefore an equilibrium at every order of a process chain, and its outcome is the buyer&rsquo;s unique maximum (Figaro 2026b, Theorems 1 and 3).</li>
                    <li><strong>Formation without a venue.</strong> A market layer inherits the mechanism&rsquo;s equilibrium unchanged when its only output is a commitment the mechanism accepts, formed only from inputs the parties themselves supply, and accepted on nothing the layer did. An offer therefore forms by a dispatch race on posted prices or by a request for quotes, with no venue holding the market&rsquo;s state (Figaro 2026h, Propositions 3.1 and 6.2).</li>
                    <li><strong>The data sale.</strong> Under a bonded commitment a sale of data between strangers is an ordinary purchase: after delivery, resolving is the buyer&rsquo;s strictly better reply (Figaro 2026j, Proposition 1).</li>
                    <li><strong>The reward and the unit.</strong> Fabricated score dilutes the fixed reserve and never enlarges it (Figaro 2026k), and the florin is a focal point with nothing beneath it (Figaro 2026f).</li>
                    <li><strong>The composition doctrine.</strong> Every design is published without permission, composed by designers, bound by sellers, and selected by buyers, and no party ranks or admits designs (stipulated: the protocol&rsquo;s rule).</li>
                </ol>
                <PaperRun title="Step 1: each distortion against the part that carries it.">
                    By premise 3, keeping its word is each party&rsquo;s best reply before any dispute arises, so the bond carries the cost of handling disputes. Less is left in dispute, and a forum rules on the open data for the remainder before the buyer resolves. No venue holds the market (premise 4), so no party bears the cost of attracting buyers on the market&rsquo;s behalf and recovers it through a rent. The cost falls on whoever gains from a buyer&rsquo;s arrival: a registrant through its staked public listing (part 2), a community that brings its own members, and a designer through its token, the door to a resource (part 6). By part 7 and premise 5, no party in the middle holds the data, and each party sells its own in a trade of its own. Is the public aggregate, which any analyst may mine, not capture by another name? Its grain answers it (part 7): what is public is a cell and a hash, never a door or a plaintext, and the detail stays with the parties. The mechanism&rsquo;s price is gas and the time value of the bonds and of the listing stake, and it takes nothing; the cost of attracting buyers stays with those who gain from it.
                </PaperRun>
                <PaperRun title="Step 2: each part placed under a definition.">
                    Buterin&rsquo;s information security properties are, here, the mechanism&rsquo;s invariants. <em>Asymmetric bonding</em>: the buyer locks twice the payment and each seller twice the cumulative value. <em>Cumulative bonding</em>: a seller&rsquo;s bond counts every payment committed before it. <em>Buyer dominance</em>: only the buyer resolves. <em>Atomic resolution</em>: every order or none. <em>Immutable evidence</em>: each step is bound to the signed agreement by its fingerprint as it happens. <em>No escape hatches</em>: commit and resolve are the only operations. Each is a property of the mechanism&rsquo;s rules, checkable from the chain&rsquo;s public state. The bond meets D2 in the field&rsquo;s own form. A seller that walks away keeps at most what it holds, worth at most <Math>{"G"}</Math>, and leaves <Math>{"2G"}</Math> locked. A buyer that withholds after performance keeps what arrived, worth <Math>{"P"}</Math>, and leaves <Math>{"2P"}</Math> locked, the payment inside it.
                </PaperRun>
                <div className="my-2">
                    <Math display>{"\\text{seller: } G - 2G = -G \\;<\\; +P \\qquad\\qquad \\text{buyer: } P - 2P = -P \\;<\\; 0"}</Math>
                </div>
                <p>
                    On each side what defection leaves locked exceeds what the defector keeps. Collusion enters as an outside payment, and it has only the parties&rsquo; own comparisons to change, because after commit the chain accepts one judgment, the buyer&rsquo;s resolution. A payment that makes holding out worth a seller&rsquo;s while must exceed its margin of <Math>{"P + G"}</Math>. One that makes a buyer withhold after performance must exceed <Math>{"P"}</Math>, so the guarantee holds against any outside payment smaller than the margin. A payment conditional on holding out must be renewed for as long as the process stands open. Parties acting together can still produce well-formed books for a trade that never took place: the data proves what the mechanism enforced, never the world. The other parts fall under D1 and D3: sellers and designers produce, and resolution distributes, with the data going to the parties that produced it (D1); the stake, the rewards, the florin, the denominations, and the DAO&rsquo;s judgment over its own treasury are policies and tokens that steer actors toward several goals (D3).
                </p>
                <p>
                    The stake does not deter a determined Sybil, one actor posing as many; the bound on farming is dilution per unit of the attacker&rsquo;s capital (Figaro 2026k). The cost-against-profit form of D2 is the bond&rsquo;s alone.
                </p>
                <PaperRun title="Step 3: every other axis restores a party over the system.">
                    Read on the Core alone, the system is one contract between given parties, and the designs, the rewards, the florin, and the DAO fall outside it. Read as a product, it has an offeror who sets its features and admits its users; the protocol has none, only rules anyone may implement. Read as an interface, it is the set of acts the screens list, a catalog closed by whoever draws it, while any wallet may publish a clause no screen has shown. Read as a firm, the process has a standing nucleus and a residual claimant, yet it dissolves at resolution with zero equity (Figaro 2026d). Read as a platform, it is an intermediary that matches, holds the data, and charges, and no party stands in the middle. Is a designer whose token gates an assembly not a platform under another name? It sets no price but the one each seller signs, takes nothing from the trade, and holds no data; what it holds is the token, whose value is the access it grants.
                </PaperRun>
                <PaperRun title="Step 4: the measure is open-world by its own words.">
                    Zamfir&rsquo;s definition presupposes, in its own text, a decentralized economy, and Voshmgir and Zargham&rsquo;s autonomous actors and goals pursued in the absence of intermediaries. Buterin&rsquo;s states its guarantee as a comparison each party makes for itself, which no party over the system enters. A frame built on them therefore places no party over the system, and Step 2 shows that each part finds its place under one of them. The other axes place the parts only by supplying that party (Step 3). Is the measure not chosen to fit the system? The three definitions are the field&rsquo;s, stated before this system and for others, and the test they set can fail in the three ways the falsifier names.
                </PaperRun>
                <PaperRun title="Conclusion.">
                    By Steps 1 to 4, cryptoeconomics is the one frame in which the whole of Figaro holds together, and every other axis, the Core alone, the product, the interface, the firm, or the platform, returns a closed-world prior.
                </PaperRun>
                <PaperRun title="Falsifier.">
                    The proposition is false if another axis is shown under which every part of Section 2 has its place with no party standing over the system. It is false if a definition of Section 3 is shown that the system fails: a guarantee that does not hold as loss against gain, a distribution that needs an intermediary, or a token that steers by some party&rsquo;s discretion. It is false if a part of the whole is shown that none of the three definitions can place.
                </PaperRun>
                <PaperRun title="Scope.">
                    The claim is about the frame for the whole; a part read on its own axis, the bond by mechanism design or the books by accounting, keeps that axis&rsquo;s result. The chain beneath is governed, and its governance is inherited whole by whoever chooses a chain. The equilibrium is proved, not observed, and &ldquo;the level of security very much depends on how people react to economic incentives&rdquo; (Voshmgir and Zargham 2020). The road to the programs in Section 5 is a possibility the substrate opens, not a prediction.
                </PaperRun>
                <p>
                    Does a Core that accepts any ERC-20 token fail D3, whose tokens sit at the system&rsquo;s center? The token belongs to the system, not to the Core. The system&rsquo;s tokens are the florin and the denominations designers and communities choose, beside a stake in the base chain&rsquo;s currency. Reading the token-neutral Core as the system is the first closed-world prior of Step 3.
                </p>
                <p>
                    Would any frame for decentralized systems do as well? Distributed systems place the rules but not the incentives, and mechanism design the incentives of one game but not the tokens or what emerges from many. Institutional economics places the process as an institution beside firms, markets, and relational contracting (Davidson, De Filippi, and Potts 2018), which is D1 itself. Read alone it places neither the bond&rsquo;s comparison nor the tokens&rsquo; steering, which are D2&rsquo;s and D3&rsquo;s.
                </p>
            </PaperSection>

            <PaperSection title="5. What Emerges Is a Substrate on Which Economic Forms Compose">
                <p>
                    Voshmgir and Zargham&rsquo;s three levels are levels of analysis, not sizes. The micro-foundational level, &ldquo;relating to agent level behaviors&rdquo;, is here each party&rsquo;s comparison at its order. The meso-institutional level is &ldquo;relating to policy setting and governance&rdquo;, and the macro-observable level is here what the public data shows. For them &ldquo;governance is precisely managing the relationship between the micro and macro scales&rdquo;, and &ldquo;automation in socioeconomic systems is tantamount to algorithmic policy making&rdquo;. In Figaro that management is distributed: designers set policy by publishing, sellers by binding, and buyers by selecting, and nothing moves a bonded commitment but its buyer.
                </p>
                <p>
                    Three properties emerge, under Voshmgir and Zargham&rsquo;s caution that &ldquo;the system level behaviour cannot be inferred from the local state changes induced by individual network actors&rdquo;. Communities form around a signal, though not only around it: the tokens a wallet holds and the assemblies it trades through say which communities and designs it takes part in. A public map of trade forms from the aggregate data. Value can move from the top of hierarchies to the assets that produce, since each wallet trades for itself on the same terms. Whether it does is a matter of use, which the equilibrium does not decide.
                </p>
                <p>
                    This paper&rsquo;s own step is the composition doctrine. The rules fix the bond and the resolution and nothing else, so the economic form a trade takes is a property of the graph composed above them. That graph is the designs published, the bindings sellers make, and the selections buyers make. A market-liberal graph, a cooperative graph, and a mutual-aid graph run over the same rules under premise 7. No coordination objective is fixed at the substrate, so Voshmgir and Zargham&rsquo;s polycentric viewpoint becomes an operational rule. The doctrine reaches any form whose exchanges are voluntary, signed, bonded commitments with a positive payment in one ERC-20 token per process. A group that would trade at no price issues its own token and trades at a positive price in it.
                </p>
                <p>
                    What emerges is a substrate on which economic forms compose. Such a substrate has no seat that decides after the close. For the network-state, on-chain-governance, and holacracy programs, the question of who governs therefore moves from the commercial layer to the graph. For the cypherpunks, the Ethereum Foundation&rsquo;s mandate, and defensive acceleration (d/acc), the substrate is the <em>ex ante</em> instance of what they ask for (Figaro 2026l). The substrate can serve as a network state&rsquo;s commercial layer, never its polity: criminal law, public goods, and defense stay with the polity.
                </p>
            </PaperSection>

            <PaperSection title="6. The Institution Is the Process">
                <p>
                    Voshmgir and Zargham claim cryptoeconomic infrastructure can &ldquo;reduce the principal-agent dilemma of organizations&rdquo; through transparency and &ldquo;disintermediate by reducing bureaucracy&rdquo;. They also claim it can &ldquo;replace the reactive procedural security of the current legal system, with proactive and automated mechanisms that make a potential breach of contract expensive and therefore infeasible&rdquo;. Ours is narrower. The firm, the platform, and the court make a stranger&rsquo;s promise good after the fact, by an authority outside the trade, and the bond moves the guarantee before it (Figaro 2026m). Figaro therefore displaces, but does not completely substitute, those institutions, and their apparatus is needed far less.
                </p>
                <p>
                    The institution Figaro makes available is the process itself, one that lasts the time of one transaction. Its terms are the signed clauses, its enforcement the bonds, its books the data it leaves, and its close the buyer&rsquo;s resolution (Figaro 2026g). Remedies are agreed before resolution, and resolution is final. The parties bargain over a remedy while the process stands open, and a forum or court reaches the trade through the parties, never through the resolution.
                </p>
            </PaperSection>

            <PaperSection title="7. The Eight Disciplines">
                <p>
                    Voshmgir and Zargham name eight disciplines a full account of a cryptoeconomic system passes through. In their order, each holds one result about the whole.
                </p>
                <PaperRun title="Industrial and Systems Engineering.">
                    A service with many providers, such as an air journey, decomposes into one process in which each provider is a seller bonded to the passenger. Atomic resolution gives the providers their own reason to remedy a disruption before a forum engages, wherever a provider&rsquo;s share of the remedy costs less than that standing position (Figaro 2026a).
                </PaperRun>
                <PaperRun title="AI, Optimization and Control Theory.">
                    Any key that signs and locks its bond is a party, so the equilibrium binds an agent as it binds a person, and the bound over many commitments is the agent&rsquo;s policy (Figaro 2026n).
                </PaperRun>
                <PaperRun title="Computer Science and Cryptography.">
                    A machine check of a mechanism whose only operations are commit and resolve carries its equilibrium to the code only through a specification that entails the payoff table, which conservation and solvency do not entail (Figaro 2026o).
                </PaperRun>
                <PaperRun title="Economics and Game Theory.">
                    Premises 3 to 5 are its results (Figaro 2026b, 2026h, 2026j), the last answering Arrow&rsquo;s information paradox: that a buyer cannot value information before seeing it, and need not pay once it has.
                </PaperRun>
                <PaperRun title="Psychology and Decisions Science.">
                    Each party&rsquo;s comparison straddles its reference point, so loss aversion weights the defecting branch without reversing either comparison, and the equilibrium is checkable with one comparison per node (Figaro 2026c).
                </PaperRun>
                <PaperRun title="Political Science, Institutional Economics and Governance.">
                    The process is the cheaper governance mode where each party can bond its own link, the bonds&rsquo; time value is small beside the apparatus it displaces, and the buyer can judge the outcome at acceptance (Figaro 2026g).
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
                    Trade between strangers pays to attract buyers, pays to handle disputes, and surrenders its data to whoever stands behind it. Figaro answers all three with one set of parts: the mechanism at the price of gas and the time value of what is locked, and the cost of attracting buyers with those who gain from it. Each part has its place under a definition that presupposes no party in the middle, and every other axis places the same parts only by putting such a party back. Cryptoeconomics is the frame in which the whole holds together. What it shows is a substrate on which economic forms compose, displacing in part the institutions that act after the trade.
                </p>
            </PaperSection>
        </PaperLayout>
    );
}
