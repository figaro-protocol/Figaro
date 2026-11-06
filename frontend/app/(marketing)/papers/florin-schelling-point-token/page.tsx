import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import {
    PaperLayout,
    PaperSection,
    PaperRun,
    PaperScroll,
} from "@/components/papers/PaperLayout";
import { Math } from "@/components/papers/Math";

export const metadata: Metadata = withOg({
    title: "The Florin: A Schelling-Point Token Issued at Zero — Figaro",
    description:
        "A token issued at zero after the work is done, controlled by no central operator, disclosed in full before anyone holds it, and worth something only if strangers use it. Read against its facts, each of the securities tests' questions fails for a florin as it is first minted; the disclosure those tests exist to compel is the substrate itself. What such a token can be, and all it can be, is a Schelling point.",
});

export default function FlorinSchellingPointTokenPaper() {
    return (
        <PaperLayout slug="florin-schelling-point-token"
            title="The Florin: A Schelling-Point Token Issued at Zero"
            subtitle="From Howey to Sufficiently Decentralized to a Focal Point"
            author="Figaro"
            date="April 2026"
            watermark="Figaro Protocol · Preprint"
            abstract={
                <>
                    <p>
                        A token sold before its network exists is held by investors, and its project takes the shape of a company, the shape the securities tests were written for. The florin&rsquo;s genesis allocation goes to three wallets: the founder&rsquo;s, the supporters&rsquo;, and the DAO&rsquo;s. It is minted at zero at genesis (the moment the token&rsquo;s first supply is created), in no public offer and for no consideration, to wallets that pay nothing for it. The designers&rsquo; reserve alone is minted afterward, and only on the counted use of published work. Nothing in the economic system the florin names is conditioned on the florin. We read the four questions of <em>Howey</em> against the florin&rsquo;s facts: for a florin as it is first minted each fails, and a purchase on a secondary market reopens only the first. The European regulation&rsquo;s offer obligation does not attach to an allocation made for free, nor, arguably, to a reserve with no identifiable issuer. The disclosure those tests exist to compel is the substrate itself (the rules and data beneath every trade): public rules nobody can change, and public data that is the act of trading. The condition under which one official judged a network sufficiently decentralized holds on its first day. In Singapore, Japan, Korea, and China the rule attaches to an issuer who takes value from the public or to the providers through which tokens trade. A token that took nothing from anyone gives the first kind no one to reach. What remains is a token whose only content is that participants recognize it: a Schelling point (Schelling 1960) with nothing beneath it.
                    </p>
                </>
            }
            references={
                <>
                    <li>Bacharach, Michael. 2006. <em>Beyond Individual Choice: Teams and Frames in Game Theory</em>. Edited by Natalie Gold and Robert Sugden. Princeton, NJ: Princeton University Press.</li>
                    <li>Buterin, Vitalik. 2014. &ldquo;Ethereum: A Next-Generation Smart Contract and Decentralized Application Platform.&rdquo; White paper. Accessed October 18, 2026. https://ethereum.org/whitepaper/.</li>
                    <li>Buterin, Vitalik. 2020. &ldquo;Credible Neutrality as a Guiding Principle.&rdquo; <em>Nakamoto</em>, January 3, 2020. Archived January 6, 2020, at http://archive.md/20200106090252/https://nakamoto.com/credible-neutrality/. Republished at <em>balajis.com</em>. Accessed October 19, 2026. https://balajis.com/p/credible-neutrality.</li>
                    <li>CFTC (US Commodity Futures Trading Commission). 2015. <em>In the Matter of Coinflip, Inc., d/b/a Derivabit, and Francisco Riordan</em>. CFTC Docket No. 15-29. Order, September 17, 2015.</li>
                    <li>European Parliament and Council. 2023. <em>Regulation (EU) 2023/1114 of the European Parliament and of the Council of 31 May 2023 on markets in crypto-assets, and amending Regulations (EU) No 1093/2010 and (EU) No 1095/2010 and Directives 2013/36/EU and (EU) 2019/1937</em>. <em>Official Journal of the European Union</em> L 150 (June 9, 2023): 40&ndash;205.</li>
                    <li>Figaro. 2026a. &ldquo;Asymmetric Bonding and Buyer Dominance: Two Composing Mechanisms for N-Party Coordination Among Strangers.&rdquo; Preprint. Accessed October 18, 2026. https://figaroprotocol.com/papers/asymmetric-bonding/.</li>
                    <li>Figaro. 2026b. &ldquo;What Formal Verification Transfers to a Bonded Contract: The Payoff Table as the Specification, and What No Check Reaches.&rdquo; Preprint. Accessed October 18, 2026. https://figaroprotocol.com/papers/verified-resolution-kernel/.</li>
                    <li>Hinman, William. 2018. &ldquo;Digital Asset Transactions: When Howey Met Gary (Plastic).&rdquo; Remarks at the Yahoo Finance All Markets Summit: Crypto, San Francisco, CA, June 14, 2018. US Securities and Exchange Commission. Accessed November 4, 2026. https://www.sec.gov/news/speech/speech-hinman-061418.</li>
                    <li>Japan. 1948. <em>Financial Instruments and Exchange Act</em>. Act No. 25 of 1948, as amended.</li>
                    <li>Japan. 2009. <em>Payment Services Act</em>. Act No. 59 of June 24, 2009, as amended. English translation, Japanese Law Translation. Accessed October 18, 2026. https://www.japaneselawtranslation.go.jp/en/laws/view/3965.</li>
                    <li>Korea. 2023. <em>Act on the Protection of Virtual Asset Users</em>. Act No. 19563, July 18, 2023. In force July 19, 2024.</li>
                    <li>MAS (Monetary Authority of Singapore). 2025. <em>Guide on the Tokenisation of Capital Markets Products</em>. Last updated November 14, 2025. Re-issue of <em>A Guide to Digital Token Offerings</em>, first published 2017 and last updated May 26, 2020. Accessed October 18, 2026. https://www.mas.gov.sg/regulation/guidelines/guide-on-tokenisation-of-cmps.</li>
                    <li>Mehta, Judith, Chris Starmer, and Robert Sugden. 1994. &ldquo;The Nature of Salience: An Experimental Investigation of Pure Coordination Games.&rdquo; <em>American Economic Review</em> 84 (3): 658&ndash;673. https://www.jstor.org/stable/2118074.</li>
                    <li>Nakamoto, Satoshi. 2008. &ldquo;Bitcoin: A Peer-to-Peer Electronic Cash System.&rdquo; White paper. Accessed October 20, 2026. https://bitcoin.org/bitcoin.pdf.</li>
                    <li>People&rsquo;s Bank of China, Office of the Central Cyberspace Affairs Commission, Ministry of Industry and Information Technology, State Administration for Industry and Commerce, China Banking Regulatory Commission, China Securities Regulatory Commission, and China Insurance Regulatory Commission. 2017. &ldquo;Announcement on Preventing the Risks of Token Issuance and Financing.&rdquo; September 4, 2017.</li>
                    <li>Schelling, Thomas C. 1960. <em>The Strategy of Conflict</em>. Cambridge, MA: Harvard University Press.</li>
                    <li>SEC (US Securities and Exchange Commission). 2019. &ldquo;Framework for &lsquo;Investment Contract&rsquo; Analysis of Digital Assets.&rdquo; Staff statement, Strategic Hub for Innovation and Financial Technology, April 3, 2019. Accessed November 4, 2026. https://www.sec.gov/corpfin/framework-investment-contract-analysis-digital-assets.</li>
                    <li>SEC (US Securities and Exchange Commission). 2025. &ldquo;Staff Statement on Meme Coins.&rdquo; Division of Corporation Finance, February 27, 2025. Accessed November 4, 2026. https://www.sec.gov/newsroom/speeches-statements/staff-statement-meme-coins.</li>
                    <li>SEC and CFTC (US Securities and Exchange Commission and US Commodity Futures Trading Commission). 2026. <em>Application of the Federal Securities Laws to Certain Types of Crypto Assets and Certain Transactions Involving Crypto Assets</em>. Interpretive release, Release Nos. 33-11412 and 34-105020, March 17, 2026. <em>Federal Register</em> 91 (March 23, 2026): 13714&ndash;33. Accessed November 4, 2026. https://www.sec.gov/rules-regulations/2026/03/s7-2026-09.</li>
                    <li><em>SEC v. Kik Interactive Inc.</em>, 492 F. Supp. 3d 169 (S.D.N.Y. 2020).</li>
                    <li><em>SEC v. Ripple Labs, Inc.</em>, 682 F. Supp. 3d 308 (S.D.N.Y. 2023).</li>
                    <li><em>SEC v. Telegram Group Inc.</em>, 448 F. Supp. 3d 352 (S.D.N.Y. 2020).</li>
                    <li><em>SEC v. W. J. Howey Co.</em>, 328 U.S. 293 (1946).</li>
                    <li>Sugden, Robert. 1995. &ldquo;A Theory of Focal Points.&rdquo; <em>Economic Journal</em> 105 (430): 533&ndash;550. https://doi.org/10.2307/2235016.</li>
                </>
            }
        >
            <PaperSection title="1. Introduction">
                <p>
                    A token reaches its first holders in one of a few ways, and each of them pays for work the network still needs. Three of them sell it in advance: a premine (tokens created and allocated before launch) sold to early backers, a public sale, and a venture round with a vesting schedule. Each exchanges the token for what a project needs before it exists. Bitcoin pays each unit to the miner whose work secures the next block. In the first three the first holders are investors in the plain sense: they gave value in advance and expect it back with more. A project whose token investors hold is a company in every respect that matters to a regulator, and the securities tests were written for exactly that shape.
                </p>
                <p>
                    The florin is issued another way. Its economic system is a permissionless, decentralized protocol, Figaro, on which any wallet trades with any other under one public set of rules. The florin&rsquo;s design puts its issuance after the work it rewards. Its genesis allocation is minted at zero to three wallets: the founder&rsquo;s, the supporters&rsquo;, and the DAO&rsquo;s (the wallet of a treasury that spends on the commons by its own judgment). Its designers&rsquo; reserve is minted only on the counted use of work already published.
                </p>
                <PaperRun title="The claim.">
                    A token issued at zero after the work it rewards, with nothing in its economic system conditioned on it, meets the condition of sufficient decentralization at genesis, where the prior reading has a token earn it over time (Hinman 2018). What such a token can then be, and all it can be, is a pure Schelling-point token: a token held for recognition alone (held because each holder recognizes it as the unit the others hold), with nothing beneath it.
                </PaperRun>
                <PaperRun title="What the argument rests on.">
                    The argument rests on eight premises. One comes from the theory of focal points, six are stipulated rules of the token and of the protocol, and one is the law the claim is read against. Section 3 to Section 5 set out the facts behind the stipulated ones. (1) Parties who cannot communicate converge on the option a shared frame of reference makes stand out, and repeated coordination on similar problems builds that frame (Schelling 1960; Sugden 1995). (2) The genesis allocation is minted at genesis to wallets that pay nothing for it, in no public offer, for no consideration, and with no promise of the token&rsquo;s value (stipulated: the token&rsquo;s rule).
                </PaperRun>
                <p>
                    The third premise states how the rest of the supply is issued, and defines the terms it uses. (3) The rest of the supply, the designers&rsquo; reserve, is minted only on a designer&rsquo;s claim. Its shares are set by the counted use of work already published (the resolved processes that ran on it), under a schedule that caps each period (a fixed span of time). A process is one buyer&rsquo;s trade, and each seller&rsquo;s part in it is an order. A designer is the wallet that published a clause (one reusable term), an agreement (the clauses composed for one order), or an assembly (agreements composed into a reusable design of a process). No volume of trade raises the supply above that schedule or brings issuance forward within it (stipulated: the token&rsquo;s rule).
                </p>
                <p>
                    Two premises state what the florin is not needed for and what it refuses. (4) Neither of the mechanism&rsquo;s two operations, commit and the buyer&rsquo;s resolution, mints, consults, or denominates in the florin. No charge is made in it, no bond need be posted in it, and each process&rsquo;s denomination is its parties&rsquo; choice (stipulated: the protocol&rsquo;s rule). A denomination is the token a process&rsquo;s payments and bonds are counted in. (5) The florin carries no vote, no yield, and no claim on revenue. Before genesis its deployer sets the allocation and the reserve&rsquo;s schedule; at genesis that power ends and nothing restores it. From then on the token and the rule that mints its reserve have no admin, no pause, no upgrade, and no mint beyond the schedule (stipulated: the token&rsquo;s rule).
                </p>
                <p>
                    Two state the reach of a treasury and the publicity of the rules, and the last names the tests. (6) A treasury&rsquo;s tokens are its own. Its spending reaches no other party&rsquo;s bond, commitment, registry binding, or resolution, and it holds the same calls as any party (stipulated: the protocol&rsquo;s rule). (7) The rules are public before the first token exists and no party can change them. Every commitment and every resolution is on-chain, and the terms of each order are fingerprinted (hashed) before signing (stipulated: the protocol&rsquo;s rule). (8) The tests are the four questions of an investment contract (<em>SEC v. W. J. Howey Co.</em>, 1946), and the control and disclosure legs of sufficient decentralization (Hinman 2018), as Section 4 and Section 7 state them. The control leg asks that no person or group&rsquo;s essential managerial efforts be what holders rely on, and the disclosure leg that the asymmetries disclosure cures have receded.
                </p>
                <PaperRun title="How the argument runs.">
                    The argument takes six steps, in the order the paper takes them. Step 1 draws the second reasons from the definition. By premise 1, recognition alone can be a reason to hold a token, and it is the only reason a pure Schelling-point token gives. A service it buys, a vote, a flow, or a mechanical floor (a cost of production beneath each unit, or a use the system&rsquo;s own transactions make of it) is a second reason to hold it (Section 2). Step 2 establishes non-conditioning. By premise 4, no operation requires or privileges the florin, so a holding buys nothing inside the system (Section 3). Step 3 applies the refusals. By premises 3 and 5, no vote, no yield, no revenue claim, and no supply that trade can enlarge gives a second reason to hold. By premises 5 to 7, no party after genesis can mint beyond the schedule, change the rules, or move a holder&rsquo;s rights: authority over spending one&rsquo;s own tokens is not authority over the token (Section 3 and Section 4).
                </PaperRun>
                <p>
                    Step 4 takes the investment-contract test prong by prong. By premises 2 to 6 and 8, on the mint path (the genesis allocation and a reserve mint on a designer&rsquo;s claim) nothing is invested, nothing is pooled, nothing is promised, and no one&rsquo;s efforts are meant. A secondary purchase reopens only the first question (Section 4). Step 5 finds the two legs at genesis. By steps 3 and 4 the control leg holds, and by premise 7 the disclosure leg holds. Both hold from genesis, because nothing a central party might do is needed for the token to be what its rules say, and nothing a central party knows is hidden (Section 5 and Section 7).
                </p>
                <p>
                    Step 6 leaves recognition only. By steps 1 to 3, no service, vote, yield, or supply that trade can enlarge gives a second reason to hold the florin. By premises 2 to 4, no floor gives one either. Nothing is given for a unit at genesis. No cost of production sits beneath a reserve unit, because the reserve rewards work already published for use. No transaction of the system is made in the florin. The one reason left to hold the florin is that participants recognize it (Section 9).
                </p>
                <PaperRun title="Conclusion.">
                    By steps 1 to 6, a token issued at zero after the work it rewards, with nothing in its economic system conditioned on it, meets the condition of sufficient decentralization at genesis, and what it can be, and all it can be, is a pure Schelling-point token.
                </PaperRun>
                <PaperRun title="Falsifier.">
                    The claim is false if the system supplies a reason to hold the florin other than recognition. Such a reason would be an operation that requires or privileges it, a vote, a yield, a charge in it, a floor beneath it, or a supply that trade can enlarge. It is false too if some party after genesis can mint beyond the schedule, change the rules, or move a holder&rsquo;s rights. And it is false if a fact bearing on the token&rsquo;s supply or rules is known to some party and not public.
                </PaperRun>
                <PaperRun title="Scope.">
                    The claim reads the tests&rsquo; questions against the design. It holds on the mint path; a secondary purchase and admission to a trading platform are their own questions. A transfer of florins from a genesis holder&rsquo;s or a treasury&rsquo;s balance in exchange for a service is a distribution for value, a third question beside the mint path and a secondary purchase. It is bounded by jurisdiction. The issuer of a process&rsquo;s denomination and the chain&rsquo;s validators keep the levers Section 7 names. Whether participants converge on the florin is a question about strangers, which the design does not answer.
                </PaperRun>
            </PaperSection>
            <PaperSection title="2. What a Schelling-Point Token Is">
                <p>
                    A focal point is the solution parties choose when they cannot communicate, because some feature of it stands out as the natural place to meet (Schelling 1960). Sugden (1995) gave the phenomenon its theory: parties pick the option a shared frame of reference makes stand out, and repeated coordination on similar problems builds that frame. Mehta, Starmer, and Sugden (1994) separated experimentally what is merely conspicuous from what parties treat as the coordination target. Bacharach (2006) added that focal points work because both parties shift to a frame in which the salient choice is the team&rsquo;s choice.
                </p>
                <p>
                    Recognition, in the claim&rsquo;s sense, is that reason applied to a token, and the shared holding is the coordination itself. A utility token is held for the services it buys, a governance token for its votes, a yield-bearing token for the flows it represents. Each adds a reason to hold other than recognition, and each such reason recruits holders whose presence muddies what a balance means.
                </p>
                <p>
                    Bitcoin is the nearest precedent, and the disanalogy matters. Its own transactions are paid for in it, and its issuance consumes real computation and electricity (Nakamoto 2008). A mechanical floor therefore sits beneath its convergence, so bitcoin is a focal point but not a pure Schelling-point token. The pure condition is stronger and more exposed, and the florin occupies it.
                </p>
            </PaperSection>
            <PaperSection title="3. What the Florin Is Conditioned On: Nothing">
                <p>
                    Figaro&rsquo;s mechanism is the set of public contracts every trade runs on, and value moves through it by two operations, commit and resolve. At commit each party bonds, so that each can count on the other before the trade. The buyer bonds twice the payment <Math>{"P"}</Math>. Each seller bonds twice its cumulative value <Math>{"G"}</Math>: the value the process has accumulated through that seller&rsquo;s order. The later an order stands in the process&rsquo;s sequence of orders, the more value has accumulated through it, and that value is the most a holdout there could keep.
                </p>
                <p>
                    Only the buyer resolves, and resolution transfers every payment and refunds every bond at once, the buyer&rsquo;s less the payments it carried. Resolving after performance then becomes the buyer&rsquo;s best move. Performing becomes each seller&rsquo;s, given that plan and given that its co-sellers (the other sellers of the process) perform. For parties beyond each other&rsquo;s coercive reach, performance by every seller and resolution by the buyer is then an equilibrium, as Figaro (2026a, Theorem 3) proves. It holds at every position of a process of any length whose orders are resolved together.
                </p>
                <p>
                    Every quantity in that equilibrium is a payment or a bond, and two magnitudes compare only when they are counted in one token. So a process&rsquo;s denomination is fixed at its first commit, and every later order commits in that token. The clauses, agreements, and assemblies of premise 3 sit above the mechanism, and neither they nor any registry treats the florin as a default. A process denominated in it is not cheaper, faster, better secured, or more visible than one denominated in anything else.
                </p>
                <p>
                    A participant who trades every process in a stablecoin (a token whose value is held to a national currency) holds zero florins and adds zero florin demand, and the mechanism is indifferent to the choice. Buterin (2020) asks of a credibly neutral mechanism that it write no specific people or outcomes into itself. This mechanism writes in no token, the florin included. Does a process denominated in the florin not give a holding a use, to pay and bond in it? Any token can be that denomination, so the use is no reason the system supplies for the florin, and premise 4 says it supplies none.
                </p>
                <p>
                    Why, then, a native token at all? We stipulate that coordination among strangers in a system with no central operator needs a signal that depends on no central operator, and no general-purpose token supplies it. A holder of a stablecoin may want dollar exposure, a payment rail, or nothing in particular; a holder of the chain&rsquo;s own asset may want to pay for gas (what the chain charges to execute a transaction). A balance in a unit that serves many purposes says nothing about why it is held. A balance in a unit that serves none says one thing: the holder recognizes the unit, and with it the ecosystem the unit names. That is the whole of what the florin is for, and it is why every feature that would give a second reason to hold it is refused (premises 3 to 5).
                </p>
            </PaperSection>
            <PaperSection title="4. The Tests, Written for a Promoter">
                <p>
                    Each of the four questions that define an investment contract fails for the florin on the mint path, as the scope defines it. That position is a property of the design, not an undertaking by anyone. Under <em>SEC v. W. J. Howey Co.</em> (1946), an investment contract exists where there is (i) an &ldquo;investment of money,&rdquo; (ii) in a common enterprise, (iii) with an expectation of profit, (iv) derived from the entrepreneurial or managerial efforts of others. The questions were written for a promoter who takes value from the public in advance and undertakes to deliver more. The Commission&rsquo;s staff drew a framework for digital assets from them (SEC 2019). The Commission&rsquo;s interpretive release of March 17, 2026, joint with the Commodity Futures Trading Commission, superseded that staff framework (SEC and CFTC 2026). The four questions are the Court&rsquo;s, and we apply them directly.
                </p>
                <p>
                    <em>(i) Investment.</em> Is work an investment in another form? Nothing is delivered to an issuer: the work is published for anyone&rsquo;s use before any reward, and the reward follows counted use (premise 3). A later purchase on a secondary market is an acquisition like any token acquisition, and the courts have treated that context as its own question (<em>SEC v. Ripple Labs</em>, 2023). On the mint path nothing is invested, because nothing is sold: the genesis allocation costs its holders nothing (premise 2), and a reserve mint follows use already counted.
                </p>
                <p>
                    <em>(ii) Common enterprise.</em> A florin is an interest in nothing. It is not pooled, nothing distributes to holders as holders, and no treasury&rsquo;s performance reaches a florin because one is held. No flow exists that could be shared, because the protocol takes nothing in any unit and pays no yield (Section 3).
                </p>
                <p>
                    <em>(iii) Expectation of profit.</em> A florin has a value in any other unit only if strangers come to use it. No one offers or promises that, and the design holds out no inducement: the refusals of Section 3 leave nothing to promise, and the supply follows its schedule whatever the volume of trade (premise 3). A holder who expects the florin to be worth more if more participants converge on it expects something about other holders, not about an issuer. That is not the expectation the test names. What the test looks for is a promise; what the design contains is a refusal to make one.
                </p>
                <p>
                    <em>(iv) Efforts of others.</em> This question fails because no effort anyone makes is promised or needed. The work precedes the token, and after genesis no one holds authority over it (step 3). The founder holds florins as any holder does and stands in no fiduciary relation to anyone.
                </p>
                <p>
                    Does work done after genesis count: the founder&rsquo;s papers and interface, or a treasury&rsquo;s spending on promotion? Promotion can draw participants, and a holder may hope it does. The test asks for efforts that someone undertakes to make and on which a holder&rsquo;s return depends. No one undertakes any: a treasury owes holders nothing and spends by its own judgment, case by case. None is essential: whether a treasury spends or not, the rules run, the supply follows its schedule, a holder&rsquo;s rights stay as they were, and any wallet may promote, build on, or fund the same rules (premises 5 and 6). What a holder expects rests on the convergence of strangers, which promotion can invite and no one can deliver.
                </p>
                <PaperRun title="The European classes.">
                    The Markets in Crypto-Assets Regulation (European Parliament and Council 2023) sorts crypto-assets into asset-referenced tokens, e-money tokens, and other crypto-assets. The florin references nothing and is backed by no reserve of assets, so it is not asset-referenced; it targets no nominal value, so it is not e-money. Its title is therefore Title II, whose principal obligation is a white paper for an offer to the public. Title II does not apply where the crypto-asset is offered for free (Art. 4(3)(a)), and the genesis allocation is made to no public and for no consideration, so the obligation does not attach to it.
                </PaperRun>
                <p>
                    Recital 22 adds that a crypto-asset with no identifiable issuer falls outside Titles II to IV, while services in it stay within the Regulation. The reserve arguably has no identifiable issuer, because no party decides a reserve mint. A contract makes it on the designer&rsquo;s claim, as the reward for work already used. Admission to a trading platform is a separate question under the Regulation, as a secondary purchase is under <em>Howey</em>.
                </p>
            </PaperSection>
            <PaperSection title="5. The Substrate Is the Disclosure the Tests Exist to Compel">
                <p>
                    Securities regulation is a disclosure regime. Its tests decide who must disclose, and its remedy is to make a promoter tell the public what the promoter knows and the public cannot see. The wrong it addresses is an asymmetry of information between the party who controls an enterprise and the parties who hold claims on it. Here the answer to what is disclosed, to whom, and how a reader verifies it is not a filing. It is the substrate: the rules and the data beneath every trade.
                </p>
                <PaperRun title="The rules.">
                    The mechanism is public and nobody can change it. Two invariants pin the payoff table: the bond schedule and the resolution&rsquo;s transfers. A check of the contract must establish that table for its operations to realize the equilibrium (Figaro 2026b). The code is public for any reader to check. Every clause, agreement, and assembly is published under a fingerprint of its content. The terms of each order are fingerprinted before signing, one hash committing to every clause. The terms of a process are therefore readable before anyone signs, in the one form that cannot be revised after the fact.
                </PaperRun>
                <PaperRun title="The data.">
                    Every commitment and every resolution is on-chain: the parties, the denomination, the payment, the bonds, and whether the process closed. Any observer can recompute a resolution from what the chain holds. The signed agreement, with the terms and the detail of what was traded, sits behind the fingerprint each commitment carries. The parties hold the document, and whoever they grant access to can verify that the document shown is the one that was bonded. The aggregate is transparent to everyone, and the detail is verifiable by everyone the parties choose. The disclosure is made the day the trade is made, because the data is the act of trading and not a report about it.
                </PaperRun>
                <PaperRun title="The token.">
                    The florin&rsquo;s fixed supply ceiling and the schedule of the designers&rsquo; reserve are readable on-chain. So are the terms of the reward, what counts, who is eligible, and when a period closes, because the reward rule and the mint are public code anyone can read. A participant assessing the unit does not rely on a statement about its supply; the contract is the statement.
                </PaperRun>
                <p>
                    A prospectus is a promoter&rsquo;s promise of disclosure at one moment, about an enterprise the promoter goes on controlling. Here there is no promoter, no enterprise, and no moment: the disclosure is the rules and the data set out above. The asymmetry the regime exists to cure does not arise, because no party stands on the far side of it.
                </p>
            </PaperSection>
            <PaperSection title="6. The Tokens the Tests Found to Be Securities Were Sold in Advance">
                <p>
                    The tests are best read against the tokens they were written for. Each row below states what was sold and to whom, who controlled the rules at issuance, what a holder could verify at acquisition, and what the tests found. The middle two columns decide the outer two.
                </p>
                <PaperScroll>
                    <table className="text-sm border-collapse">
                        <thead>
                            <tr>
                                {["Token", "What was sold, to whom", "Who controlled the rules", "What a holder could verify at acquisition", "What the tests found"].map((h) => (
                                    <th key={h} className="border border-default px-3 py-1.5 text-left font-semibold text-ink-heading">{h}</th>
                                ))}
                            </tr>
                        </thead>
                        <tbody>
                                <tr>
                                    <td className="border border-default px-3 py-1.5 align-top">Bitcoin</td>
                                    <td className="border border-default px-3 py-1.5 align-top">nothing sold; every unit mined against real cost</td>
                                    <td className="border border-default px-3 py-1.5 align-top">no central operator</td>
                                    <td className="border border-default px-3 py-1.5 align-top">the code, running</td>
                                    <td className="border border-default px-3 py-1.5 align-top">treated as a commodity (CFTC 2015)</td>
                                </tr>
                                <tr>
                                    <td className="border border-default px-3 py-1.5 align-top">Ether, 2014</td>
                                    <td className="border border-default px-3 py-1.5 align-top">ether sold in advance to pay for development</td>
                                    <td className="border border-default px-3 py-1.5 align-top">a foundation and a founding team</td>
                                    <td className="border border-default px-3 py-1.5 align-top">a white paper (Buterin 2014) and a promise</td>
                                    <td className="border border-default px-3 py-1.5 align-top">years later, current offers and sales taken not to be securities transactions, in one official&rsquo;s stated view (Hinman 2018)</td>
                                </tr>
                                <tr>
                                    <td className="border border-default px-3 py-1.5 align-top">The token-sale generation</td>
                                    <td className="border border-default px-3 py-1.5 align-top">tokens sold to investors to pay for a network not yet built</td>
                                    <td className="border border-default px-3 py-1.5 align-top">the issuing company</td>
                                    <td className="border border-default px-3 py-1.5 align-top">a white paper</td>
                                    <td className="border border-default px-3 py-1.5 align-top">securities (<em>SEC v. Telegram</em>, 2020; <em>SEC v. Kik</em>, 2020); exchange sales treated as their own question (<em>SEC v. Ripple Labs</em>, 2023)</td>
                                </tr>
                                <tr>
                                    <td className="border border-default px-3 py-1.5 align-top">Venture-backed tokens with vesting</td>
                                    <td className="border border-default px-3 py-1.5 align-top">equity and tokens sold to venture investors before launch</td>
                                    <td className="border border-default px-3 py-1.5 align-top">the company and its investors</td>
                                    <td className="border border-default px-3 py-1.5 align-top">nothing public until launch</td>
                                    <td className="border border-default px-3 py-1.5 align-top">the company shape in full; analyzed case by case</td>
                                </tr>
                                <tr>
                                    <td className="border border-default px-3 py-1.5 align-top">Meme coins</td>
                                    <td className="border border-default px-3 py-1.5 align-top">launched into a market, often with insiders holding early</td>
                                    <td className="border border-default px-3 py-1.5 align-top">nobody, and no enterprise</td>
                                    <td className="border border-default px-3 py-1.5 align-top">nothing</td>
                                    <td className="border border-default px-3 py-1.5 align-top">on the staff&rsquo;s view, not securities, for the type of meme coin the statement describes (SEC 2025)</td>
                                </tr>
                                <tr>
                                    <td className="border border-default px-3 py-1.5 align-top">The florin</td>
                                    <td className="border border-default px-3 py-1.5 align-top">nothing sold; issued at zero, after the work, in no offering</td>
                                    <td className="border border-default px-3 py-1.5 align-top">no central operator; nobody can mint beyond the schedule, upgrade, or freeze</td>
                                    <td className="border border-default px-3 py-1.5 align-top">the whole system, running and verifiable, before a unit exists</td>
                                    <td className="border border-default px-3 py-1.5 align-top">none of the four questions met on the mint path (Section 4)</td>
                                </tr>
                        </tbody>
                    </table>
                </PaperScroll>
                <p>
                    Every token the tests found to be a security was sold in advance to pay for something not yet built. The party that sold it controlled it. It was sold on the strength of a document rather than a running system. Three tokens escaped, and two of them escaped by one route: no central operator, and nothing a holder could not see. Bitcoin had it from the start. Ether, sold in advance under a foundation, had it only in one official&rsquo;s view of its network, years after the sale. The florin has bitcoin&rsquo;s two properties from the first day and adds the one Section 2 found bitcoin lacks: nothing in its system requires the unit.
                </p>
                <p>
                    Meme coins, the third, escape for a narrower reason: there is no enterprise. On the staff&rsquo;s view they are not securities, for the type of meme coin its statement describes (SEC 2025). Such a token is launched through a market, often with insiders holding early, and no enterprise sits beneath it.
                </p>
                <p>
                    How, then, does a free genesis allocation to the founder&rsquo;s and the supporters&rsquo; wallets differ from those insiders? The difference is the sale. Nothing is paid for a genesis unit of the florin, and it reaches its holders in no public offer (premise 2). No promoter makes an undertaking to them or to anyone who later holds the token (premises 2 and 5). A genesis holder&rsquo;s later sale is a secondary purchase for its buyer, which the scope of Section 1 treats as its own question. A transfer for a service is the third question that scope names.
                </p>
            </PaperSection>
            <PaperSection title="7. Sufficiently Decentralized, on Day One">
                <p>
                    On Hinman&rsquo;s (2018) view a token earns decentralization over time, and a regulator asks how far along a network is. Hinman was then the Commission&rsquo;s Director of Corporation Finance, and he spoke in his own view rather than the Commission&rsquo;s. He described when a digital asset once sold as a security can stop being one. The condition is that the network is sufficiently decentralized: purchasers no longer reasonably expect a person or group to carry out essential managerial efforts, and the information asymmetries disclosure exists to cure have receded. The two halves are the control leg and the disclosure leg of one condition. On his understanding of the network as it then stood, he took current offers and sales of ether to be outside the securities laws.
                </p>
                <p>
                    The florin starts at the end of that road: both legs hold at genesis, not after a history. The reason is that nothing a central party might do is needed for the token to be what its rules say, and nothing a central party knows is hidden. Its disclosure leg is the substrate of Section 5, public before the first token existed.
                </p>
                <p>
                    Its control leg is step 3, which Section 4(iv) applies: the founder holds no authority after genesis that any other wallet lacks. In the industry&rsquo;s words, there is no central operator and the network is censorship-resistant. The contracts have no pause and no admin, so no one can halt commitment or resolution in them. Only a process&rsquo;s buyer resolves it. The issuer of a process&rsquo;s denomination can still refuse that token&rsquo;s transfers, and the chain&rsquo;s validators can delay a transaction&rsquo;s inclusion, as they can any call&rsquo;s.
                </p>
                <p>
                    Disclosure reduces the asymmetry Section 5 defines, and the securities regime is one of two answers to it. That regime does not remove the asymmetry. It appoints a knowing class to mediate it on the public&rsquo;s behalf: the issuer who must file, the auditor who attests, the examiner who reviews. A substrate whose rules are public code and whose data is the act of trading gives the other answer, removing the asymmetry for everyone alike, with no class in between.
                </p>
            </PaperSection>
            <PaperSection title="8. Elsewhere the Rule Reaches an Issuer Who Takes Value, or a Trading Provider">
                <p>
                    The large regimes outside the United States and the European Union attach the rule either to an issuer who takes value from the public or to the service providers through which tokens are sold and traded. A token that took nothing from anyone gives the first kind of rule no one to reach. The second reaches whoever chooses to trade it, as it reaches trade in any token.
                </p>
                <p>
                    Under its guide, Singapore asks whether a token is a capital-markets product and, where it is, regulates its offer as it would any such product&rsquo;s (MAS 2025). Japan&rsquo;s two acts separate crypto-assets from security tokens (Japan 1948, 2009). Crypto-assets fall under the Payment Services Act, which registers exchange service providers. Security tokens fall under the Financial Instruments and Exchange Act, which reaches their issuers. Korea&rsquo;s act regulates virtual-asset service providers and unfair trading in virtual assets (Korea 2023). China&rsquo;s 2017 announcement answers by prohibition, barring token offerings as a means of fundraising (People&rsquo;s Bank of China et al. 2017).
                </p>
            </PaperSection>
            <PaperSection title="9. Conclusion">
                <p>
                    A token that can be neither a claim nor a floor can only be recognized. Focality cannot be declared, and a designer can do no more than refuse the features that would make recognition implausible. If participants converge on the florin, a balance means one thing: its holder recognizes the unit. If nobody does, the florin is an unvalued token whose rights are empty and whose reserve mints only as premise 3 describes. Which of those it becomes is a question about strangers, and a design that answered it any other way would be a different object under the tests.
                </p>
            </PaperSection>
        </PaperLayout>
    );
}
