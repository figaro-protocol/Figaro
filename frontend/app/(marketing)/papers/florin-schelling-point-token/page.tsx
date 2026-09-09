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
        "A token issued at zero after the work is done, controlled by no central operator, disclosed in full before anyone holds it, and worth something only if strangers use it. The securities tests were written for tokens that pay for a company, and each of their questions fails on this one by construction; the disclosure those tests exist to compel is the substrate itself. What such a token can be, and all it can be, is a Schelling point.",
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
                        Every token before this one paid for the work: a premine sold, a token sale, a venture round. Its holders were therefore investors, and the project took the shape of a company &mdash; which is the shape the securities tests were written for. The florin is a different object. The economic system it belongs to was built first, and the token was issued afterwards, at zero, to wallets that paid nothing for it, conditioned on nothing, and worth something in any other unit only if strangers come to use it. This paper takes that object through the tests in the order a regulator would: the four questions of <em>Howey</em>, each of which fails on the florin&rsquo;s facts by construction; the disclosure those tests exist to compel, which here is not a filing but the substrate itself &mdash; public rules nobody can change and public data that is the act of trading; and the condition under which a network is judged sufficiently decentralized, which the florin meets on its first day rather than after years. What remains, once every test has found nothing to attach to, is a token whose only content is that participants recognize it: a Schelling point, in the sense of Schelling (1960), and nothing beneath it.
                    </p>
                </>
            }
            references={
                <>
                    <li>Bacharach, M. <em>Beyond Individual Choice: Teams and Frames in Game Theory</em>, edited by N. Gold and R. Sugden. Princeton University Press, Princeton, NJ, 2006.</li>
                    <li>Buterin, V. Ethereum: A Next-Generation Smart Contract and Decentralized Application Platform. White paper, 2014.</li>
                    <li>Buterin, V. Credible Neutrality As A Guiding Principle. nakamoto.com, 2020.</li>
                    <li>Commodity Futures Trading Commission (US). <em>In re Coinflip, Inc.</em>, CFTC Docket No. 15-29, September 17, 2015.</li>
                    <li>European Parliament and Council of the European Union. Regulation (EU) 2023/1114 of 31 May 2023 on Markets in Crypto-Assets. <em>Official Journal of the European Union</em>, L 150, 9 June 2023, pp. 40&ndash;205.</li>
                    <li>Hinman, W. Digital Asset Transactions: When Howey Met Gary (Plastic). Remarks at the Yahoo Finance All Markets Summit: Crypto, San Francisco, June 14, 2018.</li>
                    <li>Japan. Payment Services Act, Act No. 59 of 2009, as amended.</li>
                    <li>Korea. Act on the Protection of Virtual Asset Users, Act No. 19563, 2023.</li>
                    <li>Mehta, J., Starmer, C., &amp; Sugden, R. The Nature of Salience: An Experimental Investigation of Pure Coordination Games. <em>American Economic Review</em>, 84(3):658&ndash;673, 1994.</li>
                    <li>Monetary Authority of Singapore. A Guide to Digital Token Offerings. 2017, last updated 2020.</li>
                    <li>Nakamoto, S. Bitcoin: A Peer-to-Peer Electronic Cash System. White paper, 2008.</li>
                    <li>People&rsquo;s Bank of China and six other agencies. Announcement on Preventing the Risks of Token Issuance and Financing. September 4, 2017.</li>
                    <li>Schelling, T. C. <em>The Strategy of Conflict</em>. Harvard University Press, Cambridge, MA, 1960.</li>
                    <li>Securities and Exchange Commission (US). Framework for &ldquo;Investment Contract&rdquo; Analysis of Digital Assets. Strategic Hub for Innovation and Financial Technology, April 3, 2019.</li>
                    <li>Securities and Exchange Commission (US), Division of Corporation Finance. Staff Statement on Meme Coins. February 27, 2025.</li>
                    <li><em>SEC v. Kik Interactive Inc.</em>, 492 F. Supp. 3d 169 (S.D.N.Y. 2020).</li>
                    <li><em>SEC v. Ripple Labs, Inc.</em>, No. 1:20-cv-10832 (S.D.N.Y. July 13, 2023), order on summary judgment.</li>
                    <li><em>SEC v. Telegram Group Inc.</em>, 448 F. Supp. 3d 352 (S.D.N.Y. 2020).</li>
                    <li><em>SEC v. W. J. Howey Co.</em>, 328 U.S. 293 (1946).</li>
                    <li>Sugden, R. A Theory of Focal Points. <em>Economic Journal</em>, 105(430):533&ndash;550, 1995.</li>
                </>
            }
        >
            <PaperSection title="1. Introduction">
                <p>
                    A token can be issued in only a few ways, and until now every one of them has paid for the work. A premine sold to early backers, a public sale, a venture round with a vesting schedule: in each the token reaches its first holders in exchange for something the project needs before it exists, and those holders are investors in the plain sense &mdash; they gave value in advance and expect it back with more. A project whose token is held by investors is a company in every respect that matters to a regulator, whatever it calls itself, and the securities tests were written for exactly that shape.
                </p>
                <p>
                    The florin is not issued that way. The economic system it belongs to &mdash; a permissionless, decentralized protocol on which any wallet trades with any other under a simple set of rules, with no bank, platform, or court between them &mdash; was built first, by its founder alone with software agents that hold no rights in it. The token was issued afterwards, at zero, to wallets that paid nothing for it, in no sale and no offering of any kind. It confers no right on its holder: no ownership interest, no vote, no claim on anything. Nothing in the protocol requires it, charges in it, or treats it differently from any other token. It is worth something in any other unit only if strangers come to use it, and nobody offers, promises, or works toward that. That combination has not existed before, and it is the subject of this paper.
                </p>
                <p>
                    The paper follows the order a regulator would. Section 2 states what a Schelling-point token is. Section 3 states the fact everything else rests on: the florin is conditioned on nothing. Section 4 takes the token through the four questions of <em>Howey</em> and through the classes of the European regulation, and finds that each question fails on the florin&rsquo;s facts by construction, not by argument. Section 5 turns to what those tests exist to compel, which is disclosure, and shows that here the disclosure is the substrate: the rules are public code nobody can change, and the data is the act of trading. Section 6 sets the florin beside the tokens the tests were written for. Section 7 states the condition under which a network is judged sufficiently decentralized and why the florin meets it on its first day. Section 8 notes that the other large regimes share the same premise. Section 9 concludes: what is left when every test has found nothing to attach to is a token whose only content is that participants recognize it.
                </p>
            </PaperSection>
            <PaperSection title="2. What a Schelling-Point Token Is">
                <p>
                    Schelling (1960) identified focal points as the solutions parties choose when they cannot communicate, because some feature of the solution makes it stand out as the natural place to meet. Sugden (1995) gave the phenomenon its theory: parties pick the option that stands out by a shared frame of reference, and the standing-out is itself built by repeated coordination on similar problems. Mehta, Starmer, and Sugden (1994) supplied the experimental account, separating what is merely conspicuous from what parties treat as the coordination target; Bacharach (2006) added that focal points work because both parties shift to a frame in which the salient choice is the team&rsquo;s choice.
                </p>
                <p>
                    A Schelling-point token is a token held for that reason and no other: holding it makes a participant legible to other aligned participants, and the shared holding is the coordination itself. A utility token is held for the services it buys; a governance token for the votes it carries; a yield-bearing token for the flows it represents. Each of those adds a reason to hold that is not alignment, and each such reason recruits holders whose presence muddies what a balance means. Bitcoin is the nearest precedent, and the disanalogy matters: its focality rides on a mechanism that requires the unit &mdash; its own transactions are paid in it and its issuance consumes real factors &mdash; so a mechanical floor sits beneath the convergence. A <em>pure</em> Schelling-point token has focality with nothing beneath it at all. That is a stronger and more exposed condition, and it is the one the florin occupies.
                </p>
            </PaperSection>
            <PaperSection title="3. What the Florin Is Conditioned On: Nothing">
                <p>
                    The kernel is token-agnostic in a checkable sense. A bonded process fixes one unit at its first signature and every later order resolves in that unit, because the mechanism sets a bond against a value and two magnitudes compare only when quoted alike; which unit it is, the kernel neither knows nor cares. The buyer bonds twice the payment, each seller bonds twice the value accumulated through its own link, and the comparisons the equilibrium turns on are stated in those quantities and nothing else. No operation mints, consults, or denominates in the florin. No charge is levied in it, no bond need be posted in it, no registry, clause, or assembly treats it as a default, and a process denominated in it is not cheaper, faster, better secured, or more visible than one denominated in anything else. A participant who resolves every process in a stablecoin pays zero florins and contributes zero florin demand, and the mechanism is indifferent to the choice. Nothing anywhere is conditioned on the florin. The bond, not the token, is what lets two strangers trust each other with no third party between them.
                </p>
                <p>
                    Why, then, a native token at all? Because coordination among strangers in a system with no central operator needs a signal that depends on no central operator, and no general-purpose token supplies it. A participant who holds a stablecoin may want dollar exposure, a payment rail, or nothing in particular; one who holds the chain&rsquo;s own asset may want to pay for gas. A balance in a unit that serves many purposes says nothing about why it is held. A balance in a unit that serves none says one thing: the holder has declared for the ecosystem that unit names, and nothing else could have been the reason. That is the whole of what the florin is for, and it is why every feature that would give a second reason to hold it &mdash; a vote, a yield, a charge routed through it, a supply that grows with trade, a privileged denomination &mdash; is refused. The refusals are not asceticism. They are what keeps a florin balance readable, and, as Section 4 shows, they are also exactly what leaves the securities tests nothing to attach to.
                </p>
            </PaperSection>
            <PaperSection title="4. The Tests, Written for a Promoter">
                <p>
                    Under <em>SEC v. W. J. Howey Co.</em> (1946) and the framework the Securities and Exchange Commission (2019) drew from it for digital assets, an investment contract exists where there is (i) an &ldquo;investment of money,&rdquo; (ii) in a common enterprise, (iii) with an expectation of profit, (iv) derived from the entrepreneurial or managerial efforts of others. The four questions were written for a promoter who takes value from the public in advance and undertakes to deliver more. On the florin&rsquo;s facts each fails, and each failure is produced by a specific refusal in the design rather than by any characterization of it.
                </p>
                <p>
                    <em>(i) Investment.</em> The genesis allocations were minted at genesis, at zero, to wallets that paid nothing for them. There was no sale and no offering. The work the token recognizes was done before the token existed, by the founder alone, and a florin confers no right on its holder. The reserve, released on a fixed schedule to the designers of record whose published work the chain shows was used, is likewise not an investment in the ordinary sense: nothing is delivered to an issuer, and what the recipient supplied was work the network adopted. A later purchase on a secondary market is an acquisition in the same sense any token acquisition is, and the courts have treated that context as its own question (<em>SEC v. Ripple Labs</em>, 2023). On the mint path the question is not met, and no design choice could make it so, because there is nothing to invest in.
                </p>
                <p>
                    <em>(ii) Common enterprise.</em> A florin is an interest in nothing. It is not pooled, nothing distributes to holders as holders, and no treasury&rsquo;s performance reaches a florin because one is held. The refusal that produces this is the absence of any yield or any charge: the protocol levies nothing in any unit, so there is no flow that could be shared.
                </p>
                <p>
                    <em>(iii) Expectation of profit.</em> A florin has a value in any other unit only if strangers come to use it. Nobody offers, promises, or works toward that, and the design holds out no inducement: no yield, no vote, no charge routed through the unit, and a supply that no volume of trade can raise above its schedule or bring forward within it. A holder who expects the florin to be worth more if more participants converge on it is expecting something about other holders, not about an issuer, and that is not the expectation the test names. What the test looks for is a promise; what the design contains is a refusal to make one.
                </p>
                <p>
                    <em>(iv) Efforts of others.</em> The work precedes the token. After genesis nobody holds authority over the unit: the founder holds florins as any holder does, cannot mint, cannot upgrade, cannot freeze, and stands in no fiduciary relation to anyone. The kernel has no pause and no vote, so there is no protocol effort a holder&rsquo;s expectation could rest on. Whatever a holder expects rests on the convergence of other holders, which is not anyone&rsquo;s managerial effort. This is the question on which most token cases turn, and it fails here for the plainest of reasons: there is no one whose efforts could be meant.
                </p>
                <p>
                    On our reading, then, none of the four questions is met on the mint path, and a secondary purchase changes only the first. The position is jurisdictionally bounded, and specific advice in any jurisdiction belongs to counsel; what a design paper can say is that the position is a property of the design rather than an undertaking by anyone.
                </p>
                <PaperRun title="The European classes.">
                    The Markets in Crypto-Assets Regulation (European Parliament and Council, 2023) sorts crypto-assets into asset-referenced tokens, e-money tokens, and the residual class of other crypto-assets. The florin is not asset-referenced, since it references nothing and holds no reserve; it is not e-money, since it targets no nominal value; it falls in the residual class, whose principal obligation is the publication of a white paper. That obligation is a disclosure obligation, and Section 5 is about what it asks for.
                </PaperRun>
            </PaperSection>
            <PaperSection title="5. The Disclosure the Tests Exist to Compel">
                <p>
                    Securities regulation is, at bottom, a disclosure regime. Its tests decide who must disclose, and its remedy is to make a promoter tell the public what the promoter knows and the public cannot see. The wrong it addresses is an asymmetry of information between the party who controls an enterprise and the parties who hold claims on it. It is worth stating what the florin discloses, to whom, and how a reader verifies it, because the answer is not a filing.
                </p>
                <PaperRun title="The rules.">
                    The kernel is a public smart contract that nobody can change: it has no upgrade path, no pause, and its two operations do exactly what its code says, which is machine-checked and can be re-checked by anyone. Every clause &mdash; a term a process can run on &mdash; is registered under a hash of its content with its specification pinned where anyone can read it, so the terms of a process are readable before anyone signs. Every assembly, a composition of clauses into a reusable process design, is published under the hash of its composition. The rules are disclosed up front, and disclosed in the only form that cannot be revised after the fact.
                </PaperRun>
                <PaperRun title="The data.">
                    Every commitment and every resolution is on-chain: the parties, the unit, the payment, the bonds, and whether the process closed. Any observer can recompute a resolution from what the chain holds. The agreement itself &mdash; the specification, the terms, the detail of what was traded &mdash; sits behind a fingerprint committed with the process. The parties hold the document, and whoever they grant access to can verify that the document they are shown is the one that was bonded. So the aggregate is transparent to everyone, the detail is verifiable by everyone the parties choose, and nothing about a trade is private from the parties to it. The disclosure is made the day the trade is made, and every day after, because the data is the act of trading and not a report about it.
                </PaperRun>
                <PaperRun title="The token.">
                    The florin&rsquo;s supply ceiling of <Math>{"10^9"}</Math>, the two minters that share it, the schedule of the reserve, and the one-way latch that closed the register of minters at genesis are readable on-chain. A participant assessing the unit does not rely on a statement about its supply; the contract is the statement.
                </PaperRun>
                <p>
                    A prospectus is a promoter&rsquo;s promise of disclosure at one moment, about an enterprise the promoter goes on controlling. Here there is no promoter, no enterprise, and no moment: the rules were public before the first token existed and cannot be changed, and the data accrues with every trade. The asymmetry the regime exists to cure does not arise, because there is no party on the far side of it.
                </p>
            </PaperSection>
            <PaperSection title="6. The Comparison">
                <p>
                    The tests are best read against the tokens they were written for. Each row below states what was sold and to whom, who controlled the rules at issuance, what a holder could verify at the moment of acquisition, and what the tests found. The middle two columns are the ones that decide the outer two.
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
                                    <td className="border border-default px-3 py-1.5 align-top">a white paper and a promise</td>
                                    <td className="border border-default px-3 py-1.5 align-top">years later, the Commission&rsquo;s Director of Corporation Finance stated as his own view that current offers and sales of ether were not securities transactions, the network having become sufficiently decentralized (Hinman, 2018)</td>
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
                                    <td className="border border-default px-3 py-1.5 align-top">on the view of the Commission&rsquo;s staff, generally not securities, there being no enterprise (Securities and Exchange Commission, 2025)</td>
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
                    Two things stand out. First, every token that met the tests was sold in advance to pay for something not yet built, under the control of the party that sold it, on the strength of a document rather than a running system. Second, the two that did not meet them &mdash; bitcoin, and ether on the Director&rsquo;s stated view years after its sale &mdash; escaped by the same route: no central operator, and nothing a holder could not see. Meme coins escape for a narrower reason, the absence of any enterprise, and they show what a token with belief alone beneath it looks like when it is launched through a market with insiders holding early. The florin sits in the last row because it has bitcoin&rsquo;s two properties from the first day and adds one bitcoin lacks: nothing in its system requires the unit, so nothing beneath the convergence is mechanical.
                </p>
            </PaperSection>
            <PaperSection title="7. Sufficiently Decentralized, on Day One">
                <p>
                    Hinman (2018), speaking as the Commission&rsquo;s Director of Corporation Finance and in his own view rather than the Commission&rsquo;s, described the condition under which a digital asset that may have been sold as a security can stop being one: when the network it functions on is sufficiently decentralized, so that purchasers do not reasonably expect a person or group to carry out essential managerial efforts, and the information asymmetries that disclosure exists to cure have receded, there being no party who knows what the public cannot. The two halves are the control leg and the disclosure leg of one condition. He set aside the sale that accompanied ether&rsquo;s creation and, on his understanding of the network as it then stood, took current offers and sales of ether to be outside the securities laws. The Commission&rsquo;s own framework carries that view, with variations (Securities and Exchange Commission, 2019). Under it a token earns decentralization over time, and the question a regulator asks is how far along a network is.
                </p>
                <p>
                    The florin does not travel that road because it starts at its end. On the control leg: the kernel is frozen, with no pause or vote; nobody can mint beyond the schedule, register a minter, or change what a resolution does; the founder holds no authority the day after genesis that any other wallet lacks. In the industry&rsquo;s word, there is no central operator, and the network is censorship-resistant &mdash; no party can stop a commitment or a resolution, and none can be compelled to. On the disclosure leg, Section 5 already said it: the rules are public code and the data is the act of trading, from the first day. Both halves of the condition hold at genesis, not after a history, and they hold for the same reason: there is nothing for a central party to do and nothing for it to know.
                </p>
                <p>
                    Disclosure reduces asymmetry, and it is worth saying what the two answers to asymmetry are, because the securities regime is one of them. It does not remove the asymmetry between the party who controls an enterprise and the public who hold claims on it; it appoints a knowing class to mediate it on the public&rsquo;s behalf &mdash; the issuer who must file, the auditor who attests, the examiner who reviews. That is the answer of a republic: the asymmetry is acknowledged and delegated. A substrate whose rules are public code and whose data is the act of trading gives the other answer. It removes the asymmetry rather than mediating it, for everyone alike, with no class in between. Low asymmetry is the democratic condition, and here it is a property of the substrate rather than an achievement of a profession. The tests find nothing to attach to, and it is the same fact seen from two sides: no promoter, and nothing a participant cannot see.
                </p>
            </PaperSection>
            <PaperSection title="8. The Other Regimes">
                <p>
                    The large regimes outside the United States and the European Union share the premise rather than the details. Singapore asks whether a token is a capital-markets product and, where it is, whom the issuer must disclose to (Monetary Authority of Singapore, 2020). Japan sorts crypto-assets from security tokens and attaches disclosure and registration to the issuer of either (Japan, Payment Services Act). Korea regulates virtual assets around the parties who issue and trade them (Korea, 2023). China answers by prohibition, having barred token issuance as a means of financing (People&rsquo;s Bank of China, 2017). In each case the object of the rule is an issuer who takes value from the public and must therefore disclose; a token that took nothing from anyone, issued at zero by nobody who retains control, is a case the rules were not written to reach. Nothing here is advice in any of those jurisdictions, and each line should be read against its source.
                </p>
            </PaperSection>
            <PaperSection title="9. Conclusion">
                <p>
                    A token issued at zero after the work, with no central operator and nothing beneath it, is a new object, and the tests show why. <em>Howey</em>&rsquo;s four questions look for a promoter and find none; the disclosure they exist to compel is already made, in the only form that cannot be revised; the condition Hinman described for a network to stand outside the regime holds on the first day rather than after a history. What is left when every test has found nothing to attach to is a token that can be one thing only. It cannot be a claim, a vote, a charge, or a floor, because the design refuses each of those in order to leave the tests nothing. It can be recognized. Holding it says that the holder has declared for a permissionless, decentralized system in which any wallet trades with any other under a simple set of rules, and it says nothing else, because nothing else could have been the reason. That is a Schelling point in Schelling&rsquo;s sense, and it is the whole of what the florin is.
                </p>
                <p>
                    The honest scope is the one every focal point carries. Focality cannot be declared; it can only be recognized, and a designer can do no more than refuse the features that would make recognition implausible. If participants converge on the florin, it means what this paper says it means. If nobody does, it is an unvalued token that a fixed schedule goes on issuing, its supply as certain and its rights as empty as before. Which of those it becomes is a question about strangers, and a design that had any other answer to it would have failed the tests it just passed.
                </p>
            </PaperSection>
        </PaperLayout>
    );
}
