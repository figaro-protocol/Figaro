import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import {
    PaperLayout,
    PaperSection,
    PaperRun,
} from "@/components/papers/PaperLayout";
import { Math } from "@/components/papers/Math";

export const metadata: Metadata = withOg({
    title: "The Florin: A Schelling-Point Token Issued at Zero — Figaro Protocol",
    description:
        "A token issued at zero after the work is done, controlled by no central operator, disclosed in full before anyone holds it, and worth something only if strangers use it. Each of the securities tests' questions fails on its facts; the disclosure those tests exist to compel is the substrate itself. What such a token can be, and all it can be, is a Schelling point.",
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
                        A token sold before its network exists is held by investors, and its project takes the shape of a company, the shape the securities tests were written for. The florin was issued after its economic system was built, at zero, to wallets that paid nothing for it, and nothing in that system is conditioned on it. We take it through the tests in a regulator&rsquo;s order. Each of the four questions of <em>Howey</em> fails on the florin&rsquo;s facts. The disclosure those tests exist to compel is the substrate itself: public rules nobody can change, and public data that is the act of trading. The condition under which a network is judged sufficiently decentralized holds on its first day. What remains is a token whose only content is that participants recognize it: a Schelling point, in the sense of Schelling (1960), with nothing beneath it.
                    </p>
                </>
            }
            references={
                <>
                    <li>Bacharach, M. <em>Beyond Individual Choice: Teams and Frames in Game Theory</em>, edited by N. Gold and R. Sugden. Princeton University Press, Princeton, NJ, 2006.</li>
                    <li>Buterin, V. Ethereum: A Next-Generation Smart Contract and Decentralized Application Platform. White paper, 2014.</li>
                    <li>Buterin, V. Credible Neutrality As A Guiding Principle. nakamoto.com, January 3, 2020.</li>
                    <li>Commodity Futures Trading Commission (US). <em>In re Coinflip, Inc.</em>, CFTC Docket No. 15-29, September 17, 2015.</li>
                    <li>European Parliament and Council of the European Union. Regulation (EU) 2023/1114 of 31 May 2023 on Markets in Crypto-Assets. <em>Official Journal of the European Union</em>, L 150, 9 June 2023, pp. 40&ndash;205.</li>
                    <li>Hinman, W. Digital Asset Transactions: When Howey Met Gary (Plastic). Remarks at the Yahoo Finance All Markets Summit: Crypto, San Francisco, June 14, 2018.</li>
                    <li>Japan. Financial Instruments and Exchange Act, Act No. 25 of 1948, as amended.</li>
                    <li>Japan. Payment Services Act, Act No. 59 of 2009, as amended.</li>
                    <li>Korea. Act on the Protection of Virtual Asset Users, Act No. 19563, 2023, in force July 19, 2024.</li>
                    <li>Mehta, J., Starmer, C., &amp; Sugden, R. The Nature of Salience: An Experimental Investigation of Pure Coordination Games. <em>American Economic Review</em>, 84(3):658&ndash;673, 1994.</li>
                    <li>Monetary Authority of Singapore. A Guide to Digital Token Offerings. 2017, last updated May 26, 2020; re-issued November 14, 2025 as the Guide on the Tokenisation of Capital Markets Products.</li>
                    <li>Nakamoto, S. Bitcoin: A Peer-to-Peer Electronic Cash System. White paper, 2008.</li>
                    <li>People&rsquo;s Bank of China and six other agencies. Announcement on Preventing the Risks of Token Issuance and Financing. September 4, 2017.</li>
                    <li>Schelling, T. C. <em>The Strategy of Conflict</em>. Harvard University Press, Cambridge, MA, 1960.</li>
                    <li>Securities and Exchange Commission (US), Strategic Hub for Innovation and Financial Technology. Framework for &ldquo;Investment Contract&rdquo; Analysis of Digital Assets. Staff statement, April 3, 2019.</li>
                    <li>Securities and Exchange Commission (US), Division of Corporation Finance. Staff Statement on Meme Coins. February 27, 2025.</li>
                    <li>Securities and Exchange Commission and Commodity Futures Trading Commission (US). Application of the Federal Securities Laws to Certain Types of Crypto Assets and Certain Transactions Involving Crypto Assets. Interpretive release, Release No. 33-11412, March 17, 2026.</li>
                    <li><em>SEC v. Kik Interactive Inc.</em>, No. 1:19-cv-05244 (S.D.N.Y. Sept. 30, 2020), order on summary judgment.</li>
                    <li><em>SEC v. Ripple Labs, Inc.</em>, 682 F. Supp. 3d 308 (S.D.N.Y. 2023).</li>
                    <li><em>SEC v. Telegram Group Inc.</em>, 448 F. Supp. 3d 352 (S.D.N.Y. 2020).</li>
                    <li><em>SEC v. W. J. Howey Co.</em>, 328 U.S. 293 (1946).</li>
                    <li>Sugden, R. A Theory of Focal Points. <em>Economic Journal</em>, 105(430):533&ndash;550, 1995.</li>
                </>
            }
        >
            <PaperSection title="1. Introduction">
                <p>
                    A token reaches its first holders in one of a few ways, and each of them pays for work the network still needs. A premine sold to early backers, a public sale, and a venture round with a vesting schedule all exchange the token for what a project needs before it exists. Bitcoin pays each unit to the miner whose work secures the next block. In the first three the first holders are investors in the plain sense: they gave value in advance and expect it back with more. A project whose token investors hold is a company in every respect that matters to a regulator, and the securities tests were written for exactly that shape.
                </p>
                <p>
                    The florin was issued another way. Its economic system is a permissionless, decentralized protocol, Figaro, on which any wallet trades with any other under one public set of rules. That system was built first, by its founder alone, with software agents that hold no rights in it. The florin was issued afterwards, at zero, to wallets that paid nothing for it, in no sale and no offering. That combination is the subject of this paper.
                </p>
                <p>
                    We follow a regulator&rsquo;s order. Section 2 states what a Schelling-point token is, and Section 3 the fact the rest stands on: nothing in the protocol is conditioned on the florin. Sections 4 to 8 take the token through <em>Howey</em> and the European regulation, the disclosure those tests compel, the tokens they were written for, the condition of sufficient decentralization, and the other large regimes. Section 9 states what remains.
                </p>
            </PaperSection>
            <PaperSection title="2. What a Schelling-Point Token Is">
                <p>
                    A focal point is the solution parties choose when they cannot communicate, because some feature of it stands out as the natural place to meet (Schelling, 1960). Sugden (1995) gave the phenomenon its theory: parties pick the option a shared frame of reference makes stand out, and repeated coordination on similar problems builds that frame. Mehta, Starmer, and Sugden (1994) separated experimentally what is merely conspicuous from what parties treat as the coordination target. Bacharach (2006) added that focal points work because both parties shift to a frame in which the salient choice is the team&rsquo;s choice.
                </p>
                <p>
                    A Schelling-point token is a token held for that reason and no other: holding it makes a participant legible to other aligned participants, and the shared holding is the coordination itself. A utility token is held for the services it buys, a governance token for its votes, a yield-bearing token for the flows it represents. Each adds a reason to hold that is not alignment, and each such reason recruits holders whose presence muddies what a balance means. Bitcoin is the nearest precedent, and the disanalogy matters. Its own transactions are paid for in it, and its issuance consumes real computation and electricity (Nakamoto, 2008), so a mechanical floor sits beneath its convergence. A <em>pure</em> Schelling-point token has focality with nothing beneath it. That condition is stronger and more exposed, and the florin occupies it.
                </p>
            </PaperSection>
            <PaperSection title="3. What the Florin Is Conditioned On: Nothing">
                <p>
                    Figaro&rsquo;s Core is the set of public contracts every trade runs on, and it accepts two operations: commit and resolve. A process is one buyer&rsquo;s trade with one or more sellers, each seller&rsquo;s part an order. At commit the buyer bonds twice the payment <Math>{"P"}</Math>, and each seller bonds twice its cumulative value <Math>{"G"}</Math>, the value the process has accumulated through that seller&rsquo;s order. Only the buyer resolves, and resolution transfers every payment and refunds every bond at once. Two mechanisms compose here: asymmetric bonding at commit, and buyer dominance with atomic resolution. Above the Core sit the terms a process runs on: a clause is one reusable term, an agreement is the clauses composed for one order, and an assembly is agreements composed into one reusable design of a process.
                </p>
                <p>
                    Each bond deters because it is measured net of what a defector keeps. A buyer that never resolves forfeits <Math>{"2P"}</Math> and keeps what arrived, worth <Math>{"P"}</Math>, so it is out <Math>{"P"}</Math>. A seller that walks away forfeits <Math>{"2G"}</Math> and keeps what it withheld, worth at most <Math>{"G"}</Math>, so it is out at least <Math>{"G"}</Math>. Three comparisons make cooperation the equilibrium. After performance the buyer prefers resolving, <Math>{"0"}</Math>, to never resolving, <Math>{"-P"}</Math>, whatever the seller does. Given that, and the buyer&rsquo;s plan to resolve once performance has occurred and not before, each seller prefers performing, <Math>{"+P"}</Math>, to never performing, at most <Math>{"-G"}</Math>. Given that, the buyer keeps the process open until performance rather than resolving at once. The last two are each party&rsquo;s best reply to the other&rsquo;s plan, checked together: a fixed point, not a chain of steps.
                </p>
                <p>
                    Every quantity in those comparisons is a payment or a bond, and two magnitudes compare only when they are counted in one token. So a process&rsquo;s denomination, the token every payment and bond in it is counted in, is fixed at its first commit, and every later order commits in that token. Which token it is, the Core neither knows nor cares. No operation mints, consults, or denominates in the florin. No charge is levied in it, no bond need be posted in it, and no registry, clause, agreement, or assembly treats it as a default. A process denominated in it is not cheaper, faster, better secured, or more visible than one denominated in anything else. A participant who trades every process in a stablecoin holds zero florins and adds zero florin demand, and the Core is indifferent to the choice. Buterin (2020) asks of a credibly neutral mechanism that it write no specific people or outcomes into itself; the Core writes in no token, the florin included. The bond, not the token, is what lets two strangers trust each other.
                </p>
                <p>
                    Why, then, a native token at all? Coordination among strangers in a system with no central operator needs a signal that depends on no central operator, and no general-purpose token supplies it. A holder of a stablecoin may want dollar exposure, a payment rail, or nothing in particular; a holder of the chain&rsquo;s own asset may want to pay for gas. A balance in a unit that serves many purposes says nothing about why it is held. A balance in a unit that serves none says one thing: the holder has declared for the ecosystem that unit names. That is the whole of what the florin is for. It is why every feature that would give a second reason to hold it is refused: a vote, a yield, a charge routed through it, a supply that grows with trade, a privileged denomination. The refusals keep a florin balance readable, and Section 4 shows they also leave the securities tests nothing to attach to.
                </p>
            </PaperSection>
            <PaperSection title="4. The Tests, Written for a Promoter">
                <p>
                    Under <em>SEC v. W. J. Howey Co.</em> (1946), an investment contract exists where there is (i) an &ldquo;investment of money,&rdquo; (ii) in a common enterprise, (iii) with an expectation of profit, (iv) derived from the entrepreneurial or managerial efforts of others. The Commission&rsquo;s staff drew a framework for digital assets from those four questions (Securities and Exchange Commission, 2019), and this analysis was first written against it. The Commission&rsquo;s interpretive release of 17 March 2026, joint with the Commodity Futures Trading Commission, superseded and withdrew that staff framework (Securities and Exchange Commission and Commodity Futures Trading Commission, 2026). The four questions are the Court&rsquo;s, and we apply them directly. They were written for a promoter who takes value from the public in advance and undertakes to deliver more. On the florin&rsquo;s facts each fails, and each failure follows from a specific refusal in the design.
                </p>
                <p>
                    <em>(i) Investment.</em> The genesis allocations were minted at zero to wallets that paid nothing for them, in no sale or offering. A florin confers no right on its holder. The reward reserve is six hundred million florins, six tenths of the ceiling, set aside at genesis. It mints only when a designer of record claims a share in proportion to the recorded use of its published work, under a schedule that caps each period&rsquo;s issuance. A designer of record is the wallet that registered a clause, an agreement, or an assembly and holds a live stake against it. Nothing is delivered to an issuer, and what the recipient supplied was work the network adopted. A later purchase on a secondary market is an acquisition like any token acquisition, and the courts have treated that context as its own question (<em>SEC v. Ripple Labs</em>, 2023). On the mint path nothing is invested, because nothing is sold.
                </p>
                <p>
                    <em>(ii) Common enterprise.</em> A florin is an interest in nothing. It is not pooled, nothing distributes to holders as holders, and no treasury&rsquo;s performance reaches a florin because one is held. The refusal that produces this is the absence of any yield or charge: the protocol levies nothing in any unit, so no flow exists that could be shared.
                </p>
                <p>
                    <em>(iii) Expectation of profit.</em> A florin has a value in any other unit only if strangers come to use it. Nobody offers, promises, or works toward that, and the design holds out no inducement. It carries no yield, no vote, and no charge routed through the unit, and its supply no volume of trade can raise above its schedule or bring forward within it. A holder who expects the florin to be worth more if more participants converge on it expects something about other holders, not about an issuer. That is not the expectation the test names. What the test looks for is a promise; what the design contains is a refusal to make one.
                </p>
                <p>
                    <em>(iv) Efforts of others.</em> The work precedes the token. After genesis nobody holds authority over the unit: the founder holds florins as any holder does, cannot mint, cannot upgrade, cannot freeze, and stands in no fiduciary relation to anyone. The Core has no pause and no vote, so no protocol effort exists that a holder&rsquo;s expectation could rest on. Whatever a holder expects rests on the convergence of other holders, which is no one&rsquo;s managerial effort. Most token cases turn on this question, and it fails here for the plainest reason: there is no one whose efforts could be meant.
                </p>
                <p>
                    On our reading, none of the four questions is met on the mint path, and a secondary purchase changes only the first. The position is jurisdictionally bounded, and specific advice in any jurisdiction belongs to counsel. What a design paper can say is that the position is a property of the design, not an undertaking by anyone.
                </p>
                <PaperRun title="The European classes.">
                    The Markets in Crypto-Assets Regulation (European Parliament and Council, 2023) sorts crypto-assets into asset-referenced tokens, e-money tokens, and other crypto-assets. The florin references nothing and is backed by no reserve of assets, so it is not asset-referenced; it targets no nominal value, so it is not e-money. Its title is therefore Title II, whose principal obligation is a white paper for an offer to the public. Title II does not apply where the crypto-asset is offered for free (Art. 4(3)(a)). The genesis allocations were made to no public and for no consideration, so the obligation does not attach to them. Recital 22 adds that a crypto-asset with no identifiable issuer falls outside Titles II to IV, while services in it stay within the Regulation. A reserve mint rewards a designer for work already used, and a contract makes it on the designer&rsquo;s claim, decided by no party, so the reserve arguably has no identifiable issuer. We rest the genesis allocations on the first ground and the reserve on the second. Admission to a trading platform is a separate question under the Regulation, as a secondary purchase is under <em>Howey</em>.
                </PaperRun>
            </PaperSection>
            <PaperSection title="5. The Disclosure the Tests Exist to Compel">
                <p>
                    Securities regulation is, at bottom, a disclosure regime. Its tests decide who must disclose, and its remedy is to make a promoter tell the public what the promoter knows and the public cannot see. The wrong it addresses is an asymmetry of information between the party who controls an enterprise and the parties who hold claims on it. Here the answer to what is disclosed, to whom, and how a reader verifies it is not a filing.
                </p>
                <PaperRun title="The rules.">
                    The Core is public and nobody can change it: it has no upgrade path and no pause, and its two operations do exactly what their code says, machine-checked and re-checkable by anyone. Every clause is registered under its clause key, the hash of its specification&rsquo;s bytes, with the specification pinned where anyone can read it. Every agreement composed for reuse is registered under its agreement key: the merkle root over one leaf per clause, each leaf the clause key and the fields the designer fixed for every use, with none of a particular trade&rsquo;s values. Every assembly is published under the merkle root over one leaf per agreement key, in order, and, when it composes clauses for the whole design, one assembly terms leaf holding them. The terms of a process are therefore readable before anyone signs, in the one form that cannot be revised after the fact.
                </PaperRun>
                <PaperRun title="The data.">
                    Every commitment and every resolution is on-chain: the parties, the denomination, the payment, the bonds, and whether the process closed. Any observer can recompute a resolution from what the chain holds. The signed agreement, with the terms and the detail of what was traded, sits behind the merkle root each commitment carries. The parties hold the document, and whoever they grant access to can verify that the document shown is the one that was bonded. The aggregate is transparent to everyone, and the detail is verifiable by everyone the parties choose. The disclosure is made the day the trade is made, because the data is the act of trading and not a report about it.
                </PaperRun>
                <PaperRun title="The token.">
                    The florin&rsquo;s supply ceiling of <Math>{"10^9"}</Math>, the two minters that share it, the schedule of the reward reserve, and the one-way latch that closed the register of minters at genesis are readable on-chain. So are the terms of the reward, what counts, who is eligible, and when a period closes, because the reward rule and the mint are public code anyone can read. A participant assessing the unit does not rely on a statement about its supply; the contract is the statement.
                </PaperRun>
                <p>
                    A prospectus is a promoter&rsquo;s promise of disclosure at one moment, about an enterprise the promoter goes on controlling. Here there is no promoter, no enterprise, and no moment: the rules were public before the first token existed and cannot be changed, and the data accrues with every trade. The asymmetry the regime exists to cure does not arise, because no party stands on the far side of it.
                </p>
            </PaperSection>
            <PaperSection title="6. The Comparison">
                <p>
                    The tests are best read against the tokens they were written for. Each row below states what was sold and to whom, who controlled the rules at issuance, what a holder could verify at acquisition, and what the tests found. The middle two columns decide the outer two.
                </p>
                <div className="overflow-x-auto">
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
                                    <td className="border border-default px-3 py-1.5 align-top">treated as a commodity (Commodity Futures Trading Commission, 2015)</td>
                                </tr>
                                <tr>
                                    <td className="border border-default px-3 py-1.5 align-top">Ether, 2014</td>
                                    <td className="border border-default px-3 py-1.5 align-top">ether sold in advance to pay for development</td>
                                    <td className="border border-default px-3 py-1.5 align-top">a foundation and a founding team</td>
                                    <td className="border border-default px-3 py-1.5 align-top">a white paper (Buterin, 2014) and a promise</td>
                                    <td className="border border-default px-3 py-1.5 align-top">years later, current offers and sales taken not to be securities transactions, in one official&rsquo;s stated view (Hinman, 2018)</td>
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
                                    <td className="border border-default px-3 py-1.5 align-top">the company shape in full; analysed case by case</td>
                                </tr>
                                <tr>
                                    <td className="border border-default px-3 py-1.5 align-top">Meme coins</td>
                                    <td className="border border-default px-3 py-1.5 align-top">launched into a market, often with insiders holding early</td>
                                    <td className="border border-default px-3 py-1.5 align-top">nobody, and no enterprise</td>
                                    <td className="border border-default px-3 py-1.5 align-top">nothing</td>
                                    <td className="border border-default px-3 py-1.5 align-top">on the staff&rsquo;s view, not securities, for the type of meme coin the statement describes (Securities and Exchange Commission, 2025)</td>
                                </tr>
                                <tr>
                                    <td className="border border-default px-3 py-1.5 align-top">The florin</td>
                                    <td className="border border-default px-3 py-1.5 align-top">nothing sold; issued at zero, after the work, in no offering</td>
                                    <td className="border border-default px-3 py-1.5 align-top">no central operator; nobody can mint, upgrade, or freeze</td>
                                    <td className="border border-default px-3 py-1.5 align-top">the whole system, running and verifiable, before a unit exists</td>
                                    <td className="border border-default px-3 py-1.5 align-top">none of the four questions met on the mint path (Section 4)</td>
                                </tr>
                        </tbody>
                    </table>
                </div>
                <p>
                    Two things stand out. First, every token that met the tests was sold in advance to pay for something not yet built, under the control of the party that sold it, on the strength of a document rather than a running system. Second, the two that did not meet them, bitcoin and ether on the stated view, escaped by one route: no central operator, and nothing a holder could not see. Meme coins escape for a narrower reason, the absence of any enterprise, and they show what belief alone looks like when a token is launched through a market with insiders holding early. The florin has bitcoin&rsquo;s two properties from the first day and adds the one Section 2 found bitcoin lacks: nothing in its system requires the unit.
                </p>
            </PaperSection>
            <PaperSection title="7. Sufficiently Decentralized, on Day One">
                <p>
                    Hinman (2018), the Commission&rsquo;s Director of Corporation Finance, speaking in his own view rather than the Commission&rsquo;s, described when a digital asset once sold as a security can stop being one. The condition is that the network is sufficiently decentralized: purchasers no longer reasonably expect a person or group to carry out essential managerial efforts, and the information asymmetries disclosure exists to cure have receded. The two halves are the control leg and the disclosure leg of one condition. On his understanding of the network as it then stood, he took current offers and sales of ether to be outside the securities laws. The staff&rsquo;s framework carried that view, with variations, until the Commission&rsquo;s interpretive release replaced it (Section 4). On that view a token earns decentralization over time, and a regulator asks how far along a network is.
                </p>
                <p>
                    The florin starts at the end of that road. Its control leg is the fact Section 4(iv) established: nobody can mint beyond the schedule, register a minter, upgrade, freeze, or change what a resolution does, and the founder holds no authority after genesis that any other wallet lacks. In the industry&rsquo;s word there is no central operator, and the network is censorship-resistant: no party can stop a commitment or a resolution, and none can be compelled to. Its disclosure leg is Section 5: the rules are public code and the data is the act of trading. Both legs hold at genesis, not after a history, for one reason: there is nothing for a central party to do and nothing for it to know.
                </p>
                <p>
                    Disclosure reduces asymmetry, and the securities regime is one of two answers to it. It does not remove the asymmetry between the party who controls an enterprise and the public who hold claims on it. It appoints a knowing class to mediate it on the public&rsquo;s behalf: the issuer who must file, the auditor who attests, the examiner who reviews. That is the answer of a republic: the asymmetry is acknowledged and delegated. A substrate whose rules are public code and whose data is the act of trading gives the other answer, removing the asymmetry for everyone alike, with no class in between. Low asymmetry is the democratic condition, and here it is a property of the substrate rather than the achievement of a profession.
                </p>
            </PaperSection>
            <PaperSection title="8. The Other Regimes">
                <p>
                    The large regimes outside the United States and the European Union share the premise rather than the details. Singapore asks whether a token is a capital-markets product and, where it is, regulates its offer as it would any such product&rsquo;s (Monetary Authority of Singapore, 2020). Japan sorts crypto-assets, regulated under the Payment Services Act through the registration of exchange service providers, from security tokens, regulated under the Financial Instruments and Exchange Act, which reaches their issuers (Japan, Payment Services Act; Japan, Financial Instruments and Exchange Act). Korea regulates virtual-asset service providers and unfair trading in virtual assets (Korea, 2023). China answers by prohibition, having barred token offerings as a means of fundraising (People&rsquo;s Bank of China, 2017). In each, the rule attaches either to an issuer who takes value from the public or to the service providers through which tokens are sold and traded. A token that took nothing from anyone, issued at zero by nobody who retains control, gives the first kind of rule no one to reach; the second reaches whoever chooses to trade it, as it reaches trade in any token.
                </p>
            </PaperSection>
            <PaperSection title="9. Conclusion">
                <p>
                    A token issued at zero after the work, with no central operator and nothing beneath it, can be one thing only: recognized. It cannot be a claim, a vote, a charge, or a floor, because the design refuses each, and that is a Schelling point in Schelling&rsquo;s sense. Focality cannot be declared, and a designer can do no more than refuse the features that would make recognition implausible. If participants converge on the florin, a balance means what Section 3 says it means. If nobody does, the florin is an unvalued token whose rights are empty and whose reserve mints only when a designer of record claims, in proportion to recorded use, under a schedule that caps each period&rsquo;s issuance. Which of those it becomes is a question about strangers, and a design that had any other answer to it would have failed the tests it passes.
                </p>
            </PaperSection>
        </PaperLayout>
    );
}
