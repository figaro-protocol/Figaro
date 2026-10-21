import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import {
    PaperLayout,
    PaperSection,
    PaperSubsection,
    PaperRun,
} from "@/components/papers/PaperLayout";
import { Math } from "@/components/papers/Math";

export const metadata: Metadata = withOg({
    title: "The Wallet Without a Polity — Figaro Protocol",
    description:
        "Between strangers the contract element that fails is consideration. For refugees, stateless people and others beyond stable banking and courts, a bonded commitment makes a promise credible by two acts no state is asked about: a wallet signs, and it locks its bond.",
});

export default function WalletWithoutPolityPaper() {
    return (
        <PaperLayout slug="wallet-without-polity"
            title="The Wallet Without a Polity"
            subtitle="Displaced and Stateless People under the Bonded Commitment"
            author="Figaro"
            date="April 2026"
            watermark="Figaro Protocol · Preprint"
            abstract={
                <>
                    <p>
                        Refugees, stateless people, undocumented migrants and people beyond stable banking share one position in commerce: a stranger beyond their community has no ordinary reason to rely on their promise. Recognition, a bank account and a court that hears both sides are what ordinarily make a promise credible, and they lack all three. Statelessness rarely removes legal capacity, which turns on age and competence; it removes nationality, and displacement often removes lawful presence and standing. Between strangers the element of a contract that fails is consideration, and a bonded commitment makes it hold. The buyer bonds twice the payment, and each seller twice the cumulative value through its order. Only the buyer resolves, paying every seller and refunding the rest of every bond at once, and defection never pays on either side. The two acts the mechanism asks of a party, a signature and the locking of a bond, consult no polity. What it supplies is a credible promise; legality, a forum and status stay the state&rsquo;s, acting on persons, never on the process, and Arendt&rsquo;s right to have rights stays political. Eight constraints remain: keeping the key, the on-ramp, counterparty and currency gatekeeping, the absence of a forum, legality, exposure of the data, a counterparty&rsquo;s coercive reach, and the funding of the bond, which bounds the claim. For those who can lock a bond, trading with a stranger becomes an operational problem rather than an impossibility.
                    </p>
                </>
            }
            references={
                <>
                    <li>Allen, Christopher. 2016. &ldquo;The Path to Self-Sovereign Identity.&rdquo; <em>Life with Alacrity</em> (blog), April 26, 2016. https://www.lifewithalacrity.com/article/the-path-to-self-soverereign-identity/. Accessed October 20, 2026.</li>
                    <li>American Law Institute. 1981. <em>Restatement (Second) of Contracts</em>. St. Paul, MN: American Law Institute Publishers.</li>
                    <li>Arendt, Hannah. (1951) 1973. <em>The Origins of Totalitarianism</em>. New ed. New York: Harcourt Brace Jovanovich.</li>
                    <li>Arendt, Hannah. (1958) 1998. <em>The Human Condition</em>. 2nd ed. Chicago: University of Chicago Press.</li>
                    <li>Benhabib, Seyla. 2004. <em>The Rights of Others: Aliens, Residents, and Citizens</em>. Cambridge: Cambridge University Press. https://doi.org/10.1017/CBO9780511790799.</li>
                    <li>Betts, Alexander, Louise Bloom, Josiah Kaplan, and Naohiko Omata. 2017. <em>Refugee Economies: Forced Displacement and Development</em>. Oxford: Oxford University Press. https://doi.org/10.1093/acprof:oso/9780198795681.001.0001.</li>
                    <li>Betts, Alexander, and Paul Collier. 2017. <em>Refuge: Transforming a Broken Refugee System</em>. London: Allen Lane.</li>
                    <li>The Block. 2022. &ldquo;Circle Freezes USDC Funds in Tornado Cash&rsquo;s US Treasury-Sanctioned Wallets.&rdquo; August 8, 2022. https://www.theblock.co/post/162172/circle-freezes-usdc-funds-in-tornado-cashs-us-treasury-sanctioned-wallets. Accessed October 20, 2026.</li>
                    <li>Brito, Jerry, and Peter Van Valkenburgh. 2022. &ldquo;Analysis: What Is and What Is Not a Sanctionable Entity in the Tornado Cash Case.&rdquo; Coin Center, August 15, 2022. https://www.coincenter.org/analysis-what-is-and-what-is-not-a-sanctionable-entity-in-the-tornado-cash-case/. Accessed October 20, 2026.</li>
                    <li>Buterin, Vitalik. 2021. &ldquo;Why We Need Wide Adoption of Social Recovery Wallets.&rdquo; <em>Vitalik Buterin&rsquo;s Website</em> (blog), January 11, 2021. https://vitalik.eth.limo/general/2021/01/11/recovery.html. Accessed October 20, 2026.</li>
                    <li>CGAP. 2018. <em>Jordanians and Syrian Refugees: Remittances and Financial Services Use</em>. Washington, DC: CGAP, with GIZ and the Central Bank of Jordan. https://www.cgap.org/research/publication/jordanians-and-syrian-refugees-remittances-and-financial-services-use. Accessed October 20, 2026.</li>
                    <li>Circle. n.d. &ldquo;USDC Risk Factors.&rdquo; https://www.circle.com/legal/usdc-risk-factors. Accessed October 20, 2026.</li>
                    <li>Colombia. 1887. <em>Código Civil</em>, art. 1502. https://www.cancilleria.gov.co/sites/default/files/Normograma/docs/pdf/codigo_civil_pr046.pdf. Accessed October 20, 2026.</li>
                    <li>Coppi, Giulio, and Larissa Fast. 2019. <em>Blockchain and Distributed Ledger Technologies in the Humanitarian Sector</em>. HPG Commissioned Report. London: Overseas Development Institute. https://cdn.odi.org/media/documents/12605.pdf. Accessed October 20, 2026.</li>
                    <li>Fafchamps, Marcel. 2004. <em>Market Institutions in Sub-Saharan Africa: Theory and Evidence</em>. Cambridge, MA: MIT Press. https://doi.org/10.7551/mitpress/4445.001.0001.</li>
                    <li>Farnsworth, E. Allan. 2004. <em>Contracts</em>. 4th ed. New York: Aspen Publishers.</li>
                    <li>Figaro. 2026. &ldquo;Asymmetric Bonding and Buyer Dominance: Two Composing Mechanisms for Self-Enforcing N-Party Coordination.&rdquo; Preprint. https://figaroprotocol.com/papers/asymmetric-bonding/. Accessed October 20, 2026.</li>
                    <li>France. 2016. <em>Code civil</em>, art. 1128, as amended by Ordonnance n° 2016-131 du 10 février 2016. https://www.legifrance.gouv.fr/codes/article_lc/LEGIARTI000032040794. Accessed October 20, 2026.</li>
                    <li>Gaius. 1988. <em>The Institutes of Gaius</em>. Translated by W. M. Gordon and O. F. Robinson. London: Duckworth.</li>
                    <li>Goodwin-Gill, Guy S., and Jane McAdam, with Emma Dunlop. 2021. <em>The Refugee in International Law</em>. 4th ed. Oxford: Oxford University Press. https://doi.org/10.1093/law/9780198808565.001.0001.</li>
                    <li>Greif, Avner. 1993. &ldquo;Contract Enforceability and Economic Institutions in Early Trade: The Maghribi Traders&rsquo; Coalition.&rdquo; <em>American Economic Review</em> 83 (3): 525&ndash;48. https://ideas.repec.org/a/aea/aecrev/v83y1993i3p525-48.html.</li>
                    <li>Hernandez, Kevin. 2017. <em>Blockchain for Development: Hope or Hype?</em> IDS Rapid Response Briefing 17. Brighton: Institute of Development Studies. https://opendocs.ids.ac.uk/articles/report/Blockchain_for_Development_Hope_or_Hype_/26479891. Accessed October 20, 2026.</li>
                    <li>Jacobsen, Katja Lindskov. 2015. <em>The Politics of Humanitarian Technology: Good Intentions, Unintended Consequences and Insecurity</em>. London: Routledge. https://doi.org/10.4324/9781315777276.</li>
                    <li>Kesby, Alison. 2012. <em>The Right to Have Rights: Citizenship, Humanity, and International Law</em>. Oxford: Oxford University Press. https://doi.org/10.1093/acprof:oso/9780199600823.001.0001.</li>
                    <li>Latonero, Mark, and Paula Kift. 2018. &ldquo;On Digital Passages and Borders: Refugees and the New Infrastructure for Movement and Control.&rdquo; <em>Social Media + Society</em> 4 (1). https://doi.org/10.1177/2056305118764432.</li>
                    <li>Locke, John. 1689. <em>Two Treatises of Government</em>. London: Awnsham Churchill.</li>
                    <li>Madianou, Mirca. 2019. &ldquo;Technocolonialism: Digital Innovation and Data Practices in the Humanitarian Response to Refugee Crises.&rdquo; <em>Social Media + Society</em> 5 (3). https://doi.org/10.1177/2056305119863146.</li>
                    <li>Marelli, Massimo, ed. 2024. <em>Handbook on Data Protection in Humanitarian Action</em>. 3rd ed. Cambridge: Cambridge University Press / ICRC. https://doi.org/10.1017/9781009414630.</li>
                    <li>Mühle, Alexander, Andreas Grüner, Tatiana Gayvoronskaya, and Christoph Meinel. 2018. &ldquo;A Survey on Essential Components of a Self-Sovereign Identity.&rdquo; <em>Computer Science Review</em> 30: 80&ndash;86. https://doi.org/10.1016/j.cosrev.2018.10.002.</li>
                    <li>Nozick, Robert. 1974. <em>Anarchy, State, and Utopia</em>. New York: Basic Books.</li>
                    <li>Pritchett, Lant. 2006. <em>Let Their People Come: Breaking the Gridlock on Global Labor Mobility</em>. Washington, DC: Center for Global Development. https://www.cgdev.org/publication/let-their-people-come-breaking-gridlock-global-labor-mobility. Accessed October 20, 2026.</li>
                    <li>Sporny, Manu, Dave Longley, Markus Sabadello, Drummond Reed, Orie Steele, and Christopher Allen. 2022. &ldquo;Decentralized Identifiers (DIDs) v1.0: Core Architecture, Data Model, and Representations.&rdquo; W3C Recommendation, July 19, 2022. https://www.w3.org/TR/2022/REC-did-core-20220719/. Accessed October 20, 2026.</li>
                    <li>Tobin, Andrew, and Drummond Reed. 2017. &ldquo;The Inevitable Rise of Self-Sovereign Identity.&rdquo; Sovrin Foundation white paper, version 2.0, March 28, 2017. https://sovrin.org/library/inevitable-rise-of-self-sovereign-identity/. Accessed October 20, 2026.</li>
                    <li>Türkiye. 2011. <em>Türk Borçlar Kanunu</em> [Turkish Code of Obligations], Law No. 6098, arts. 1, 27. https://www.mevzuat.gov.tr/mevzuat?MevzuatNo=6098&amp;MevzuatTur=1&amp;MevzuatTertip=5. Accessed October 20, 2026.</li>
                    <li>UNHCR. 2026. <em>Global Trends: Forced Displacement in 2025</em>. Copenhagen: UNHCR, June 11, 2026. https://www.unhcr.org/sites/default/files/2026-06/global-trends-report-2025.pdf. Accessed October 20, 2026.</li>
                    <li>United Nations. 1948. <em>Universal Declaration of Human Rights</em>, art. 6. https://www.un.org/en/about-us/universal-declaration-of-human-rights. Accessed October 20, 2026.</li>
                    <li>United Nations. 1951. <em>Convention relating to the Status of Refugees</em>, 189 UNTS 137; and <em>Protocol relating to the Status of Refugees</em>, 1967, 606 UNTS 267. https://treaties.un.org/doc/Treaties/1954/04/19540422%2000-23%20AM/Ch_V_2p.pdf. Accessed October 20, 2026.</li>
                    <li>United Nations. 1954. <em>Convention relating to the Status of Stateless Persons</em>, 360 UNTS 117. https://www.ohchr.org/sites/default/files/Documents/ProfessionalInterest/stateless.pdf. Accessed October 20, 2026.</li>
                    <li>United Nations. 1961. <em>Convention on the Reduction of Statelessness</em>, 989 UNTS 175. https://legal.un.org/ilc/texts/instruments/english/conventions/6_1_1961.pdf. Accessed October 20, 2026.</li>
                    <li>United Nations. 1966. <em>International Covenant on Civil and Political Rights</em>, 999 UNTS 171, art. 16. https://www.ohchr.org/sites/default/files/ccpr.pdf. Accessed October 20, 2026.</li>
                    <li>US Department of the Treasury. 2022. &ldquo;U.S. Treasury Sanctions Notorious Virtual Currency Mixer Tornado Cash.&rdquo; Press release, August 8, 2022. https://home.treasury.gov/news/press-releases/jy0916. Accessed October 20, 2026.</li>
                    <li>US Department of the Treasury. 2025. &ldquo;Tornado Cash Delisting.&rdquo; Press release, March 21, 2025. https://home.treasury.gov/news/press-releases/sb0057. Accessed October 20, 2026.</li>
                    <li><em>Van Loon v. Department of the Treasury</em>. 2024. 122 F.4th 549 (5th Cir.). https://www.ca5.uscourts.gov/opinions/pub/23/23-50669-CV0.pdf. Accessed October 20, 2026.</li>
                    <li>World Bank. 2025. &ldquo;Mobile-Phone Technology Powers Saving Surge in Developing Economies.&rdquo; Press release, July 16, 2025. https://www.worldbank.org/en/news/press-release/2025/07/16/mobile-phone-technology-powers-saving-surge-in-developing-economies. Accessed October 20, 2026.</li>
                    <li>World Food Programme. n.d. &ldquo;Building Blocks.&rdquo; https://www.wfp.org/building-blocks. Accessed October 20, 2026.</li>
                </>
            }
        >
            <PaperSection title="1. Introduction">
                <p>
                    At the end of 2025 an estimated 117.8 million people were forcibly displaced worldwide, and 4.5 million were estimated to be stateless (UNHCR 2026). UNHCR says the true stateless number is likely much higher, because many stateless populations are unregistered and invisible to official statistics. The displaced are not one population: about 68.7 million of them are internally displaced, most of them nationals of the state they live in. What joins the people this paper concerns is a position in commerce rather than a legal status. A stranger has no formal means to rely on their promise, and informal means end at the edge of their community. They stand in the same position when they must rely on a stranger&rsquo;s.
                </p>
                <p>
                    The law does more for them than is often assumed. The 1954 Convention gives stateless persons a personal status, rights in property that include leases and other contracts relating to it, and free access to courts. It accords those lawfully in the territory treatment in wage-earning employment and self-employment (United Nations 1954, arts. 12&ndash;13, 16&ndash;18). The 1961 Convention governs the grant, loss and deprivation of nationality and nothing else (United Nations 1961). Everyone holds &ldquo;the right to recognition everywhere as a person before the law&rdquo; (United Nations 1948, art. 6; United Nations 1966, art. 16). What the treaties do not supply is a bank account or a court that reaches both parties to a trade: one survey found account access for Syrian refugees in Jordan to be &ldquo;practically zero&rdquo; (CGAP 2018).
                </p>
                <p>
                    This paper argues that a bonded commitment changes that position. Between strangers, the element of a contract that fails is consideration: promising value is easy, and nothing makes its delivery credible. Recognition, banking and courts are what ordinarily lend a promise that credibility, and they are exactly what this population lacks. A bonded commitment supplies the credibility from the parties&rsquo; own bonds, and it asks of a party two acts, a signature and the locking of a bond, about which no state is consulted. We call trade on these terms <em>commerce without recognition</em>: trade that proceeds whether or not any state recognizes its parties as nationals, as lawfully present, or as entitled to a hearing.
                </p>
                <PaperRun title="Scope of the claim.">
                    The claim is structural and argued, not measured: it states what the mechanism makes possible, for whom, and at what cost. It assumes that each party chooses its own actions, controls a key, and holds the tokens to lock its bond. It relies on the equilibrium proved for any number of orders the network resolves in one call (Figaro 2026). What a state confers stays the state&rsquo;s to confer: nationality, lawful presence, standing, legality and protection. No use of the mechanism by displaced participants has been observed, and the paper predicts no rate of adoption and endorses no program.
                </PaperRun>
                <PaperRun title="Paper organization.">
                    Section 2 states the mechanism as far as the argument needs. Section 3 separates the legal terms the argument turns on and places each element of a contract in the mechanism. Section 4 develops self-sovereignty as the cryptographic precondition. Section 5 develops the central claim: Arendt&rsquo;s objection and the part of it the paper accepts, the scale of the population, the architecture it faces, and what the mechanism does. Section 6 names the eight constraints that remain, the funding of the bond last, because it bounds the claim. Section 7 concludes.
                </PaperRun>
            </PaperSection>

            <PaperSection title="2. The Mechanism">
                <p>
                    The mechanism has two calls, and each carries a mechanism design of its own. An <em>order</em> is one buyer&ndash;seller commitment; a <em>process</em> is the chain of orders one buyer commits, one seller at a time, and resolves together. <em>Commit</em> opens an order under <em>asymmetric bonding</em>. Both parties sign one commitment from their own wallets. The buyer bonds twice the payment, <Math>{"2P"}</Math>, and the seller bonds twice the cumulative value through its order, <Math>{"2G"}</Math>, where <Math>{"G"}</Math> is every payment committed in the process up to and including the seller&rsquo;s own. Nobody reports <Math>{"G"}</Math>: the process carries an accumulator, and a commitment is admitted only when its declared cumulative value equals the accumulator plus its own payment.
                </p>
                <p>
                    <em>Resolve</em> closes the process under <em>buyer dominance with atomic resolution</em>. Only the buyer can call it, and every order in the process resolves together or none does. Resolution is terminal: each seller is paid and refunded its bond whole, and the buyer is refunded its bond less the payments it carried.
                </p>
                <p>
                    The two calls compose in a definite order, and that order is the equilibrium, proved for any number of orders the network resolves in one call (Figaro 2026). After performance, resolving is strictly better for the buyer with no assumption about the seller. It holds what arrived either way, so it compares <Math>{"0"}</Math> for resolving against <Math>{"-P"}</Math> for never resolving, the withheld payment sitting inside its own bond. Given that, and given the buyer&rsquo;s plan to resolve once performance has occurred and not before, performing is each seller&rsquo;s strict best response: <Math>{"+P"}</Math> against at most <Math>{"-G"}</Math>. A seller that walks away leaves its <Math>{"2G"}</Math> locked and keeps at most <Math>{"G"}</Math>. Every figure is net of what a defector keeps, so defection never pays on either side.
                </p>
                <p>
                    Two features matter here. First, the mechanism asks each party to control a key that signs and to lock the bond that key commits; besides these, the chain asks only the gas each transaction costs. Second, value moves between wallets. The mechanism holds the bonds from commit and makes every transfer at resolution, so no account is credited in between.
                </p>
                <p>
                    The bonds decide whether a party that can perform will; they do not decide an honest disagreement about whether what arrived met the agreement. The mechanism holds no test of performance. The parties work such a disagreement out while the process stands open, and agree any remedy before the buyer resolves. A seller that cannot perform sends the buyer the payment it stands to receive, so that at resolution it nets its bond and nothing else. An outside forum may rule on the process&rsquo;s data where both parties can reach one, which for this population is often impossible (&sect;5.3). A forum rules and cannot resolve, so the buyer&rsquo;s resolution, terminal acceptance, is the only thing that closes a process. The goods stay off the chain; the chain holds the parties, the denomination, the payment, the bonds, the accumulator and the commitments.
                </p>
                <p>
                    For this paper both mechanisms are load-bearing. Asymmetric bonding takes the place of the enforcer, because each party&rsquo;s own bond deters its own defection. Buyer dominance with atomic resolution takes the place of the clearing house: one signature resolves a whole multi-party process, and because no seller is paid until every order resolves, each seller has a reason to see its co-sellers perform. A displaced or stateless party can reach neither a formal enforcer nor a clearing house, and the mechanism needs neither.
                </p>
            </PaperSection>

            <PaperSection title="3. A Party Without Recognition">
                <p>
                    Four terms that are often run together are kept apart here. <em>Nationality</em> is membership of a state, and statelessness is its absence. <em>Lawful presence</em> is a state&rsquo;s permission to be on its territory, which undocumented status lacks. <em>Standing</em> is the ability to be heard by a forum. <em>Legal capacity</em> is the ability to bind oneself by contract, which private law ties to age and mental competence.
                </p>
                <p>
                    Legal capacity is a person&rsquo;s status, and statelessness rarely removes it: the 1954 Convention presumes a stateless person can hold property and make contracts relating to it (&sect;1). Even which law governs that status has an answer for a stateless person, because the Convention governs personal status by the law of the country of domicile or, failing a domicile, of residence (United Nations 1954, art. 12). Statelessness removes nationality, and displacement often removes lawful presence and standing, and with them the bank account and the court that ordinarily stand behind a promise.
                </p>
                <p>
                    Contract law&rsquo;s standard account of formation asks for offer and acceptance, consideration, capacity and legality (Farnsworth 2004). The Restatement requires a bargain in which there is a manifestation of mutual assent to the exchange and a consideration (American Law Institute 1981, &sect; 17). Counted as six elements, the list names offer, acceptance and mutual assent separately, though offer and acceptance are the means of assent. The mechanism keeps the three apart because each has its own place in it.
                </p>
                <p>
                    Offer is the buyer&rsquo;s signature over the commitment, acceptance the seller&rsquo;s counter-signature over the same commitment, and mutual assent the check at commit that both signatures recover to the named parties over one hash. Consideration is the buyer&rsquo;s payment for the seller&rsquo;s performance, carried inside the buyer&rsquo;s bond from commit and transferred to the seller at resolution. In the mechanism, capacity is any wallet that can sign and fund its bond. The law&rsquo;s own capacity, which turns on age and competence, stays the person&rsquo;s status and is read where the law reads it. Legality enters from outside the mechanism, through the terms the parties sign or a forum ruling on the data, and &sect;6 takes it up.
                </p>
                <p>
                    Civil-law codes count differently, and Colombia and Türkiye, the first and third largest hosts of refugees and others in need of international protection in 2025 (UNHCR 2026), use them. France requires the parties&rsquo; consent, their capacity to contract, and lawful and certain content (France 2016, art. 1128). Colombia requires capacity, consent, a lawful object and a lawful cause (Colombia 1887, art. 1502). Türkiye forms a contract from the parties&rsquo; mutual and concordant declarations of will, and voids one contrary to mandatory law, morality or public order, or impossible (Türkiye 2011, arts. 1, 27). None of the three has a doctrine of consideration. In either family the bargain forms; what fails between strangers is that the value promised in it is not credibly delivered, which a bonded commitment makes hold.
                </p>
                <p>
                    The mechanism knows one identity, the wallet, so the party, as the mechanism sees it, is the wallet. The asset is the person&rsquo;s labor or a productive thing they hold, and it acts through the wallet: a signing key and the balance that key controls. The operator holds the key, usually the person and possibly an agent. The person is never the asset.
                </p>
                <p>
                    Roman law divided everything it governed into persons, things and actions (Gaius 1988, 1.8). Legal thought since has kept the first two apart: property is held by a person, and a person is what a legal order recognizes. In Gaius&rsquo;s division the wallet is a thing, held and transferable, and the mechanism sees that one thing sign, bond and receive resolution for the asset behind it. It never asks on which side of the division the key&rsquo;s holder stands.
                </p>
                <p>
                    The mechanism checks the signatures and pulls the bonds; it asks nothing of the person. A minor&rsquo;s wallet signs as an adult&rsquo;s does, and the contract stays voidable wherever the law makes a minor&rsquo;s contract voidable. The same indifference is what lets a wallet trade where no state recognizes the person who holds its key. A bonded commitment therefore has a party wherever someone holds a key and can lock a bond, whatever that person&rsquo;s standing in the territory where they live.
                </p>
                <p>
                    One consequence of the wallet being a thing must be stated rather than left to be found: the data is the wallet&rsquo;s, never the person&rsquo;s. A key that is sold carries the wallet&rsquo;s history to whoever acquires it, as a business sold with its books does. The sale does not divest the seller, because the mechanism authenticates whoever holds the key and knows no title, so the history is portable and copyable at once. That bounds what the data can evidence about any one person. A key that is lost loses the history outright, and the person&rsquo;s claim on it is possession of the key and nothing else (&sect;6, constraint 1).
                </p>
            </PaperSection>

            <PaperSection title="4. Self-Sovereignty: The Cryptographic Key as Precondition">
                <p>
                    A wallet can be a party where no state recognizes the person who holds its key, and the self-sovereign-identity literature names a related condition. Allen (2016) set out ten principles for an identity its subject controls, Tobin and Reed (2017) made the case for building one on a public network, and Mühle et al. (2018) survey the components such systems share. The W3C specification of decentralized identifiers formalizes identifiers a subject controls through its own keys, with no central registrar (Sporny et al. 2022). We use <em>self-sovereignty</em> in a narrower, commercial sense: the condition of a party whose ability to bind itself, trade and accumulate a verifiable history comes from control of a key rather than from recognition by a state.
                </p>
                <PaperRun title="Three acts, and what each has needed.">
                    A bonded transaction reduces to three acts on a party&rsquo;s side. <em>Signing</em> binds the party to terms. Binding oneself has needed legal capacity, which a stateless adult usually has (&sect;3). The mechanism asks of a signing party only a private key, and the signature verifies against the key alone. Is signing the barrier at all? It never was: the barrier is making a signature credible to a stranger, and the bond is what makes it credible.
                </PaperRun>
                <p>
                    <em>Bonding</em> pledges assurance. It has needed a lender, a guarantor a court will enforce against, or the residence papers a bank asks for. The mechanism asks of a bonding party only the bond&rsquo;s tokens. At resolution it refunds each seller&rsquo;s bond whole and the buyer&rsquo;s less the payments it carried, with no court&rsquo;s order. The chain asks, besides, the gas each transaction costs in its native token (&sect;6, constraint 3).
                </p>
                <p>
                    <em>Resolving</em> delivers the consideration. Receiving a payment has needed a bank that can credit the payee in the local currency. Under the mechanism the payment and the refunds are transfers to the parties&rsquo; wallets at resolution. These properties are architectural, and whether they hold in a given denomination depends on the token&rsquo;s issuer (&sect;6, constraint 3).
                </p>
                <PaperRun title="Three senses of sovereignty.">
                    Self-sovereign identity is about identity: a person holds verifiable credentials about themselves rather than depending on an identity provider. The mechanism implements no identity; it knows wallets, never persons. The Lockean and libertarian sense of sovereignty (Locke 1689; Nozick 1974) is normative: a natural right of self-ownership that political arrangements must respect. The mechanism is silent on it, because it is architecture, not ethics.
                </PaperRun>
                <p>
                    The sense used here is structural. A party&rsquo;s commercial agency is constituted by control of a key, and that is a fact about how the mechanism operates, not a claim about how anything should be. The agency belongs to every wallet that signs, bonds and resolves, but its marginal value is uneven. A person whose nationality and lawful presence are secure has many ways to make a promise credible, and the mechanism is one more. A person who has neither may have no other, and for them the agency the mechanism supplies is the whole of it.
                </p>
            </PaperSection>

            <PaperSection title="5. A Credible Promise Where the Right to Have Rights Is Denied">
                <PaperSubsection title="5.1 Arendt and the Right to Have Rights">
                    <p>
                        Arendt located the calamity of the stateless in the loss of &ldquo;a place in the world which makes opinions significant and actions effective&rdquo; (Arendt [1951] 1973, 296&ndash;97). What they had lost she named a right to have rights: to belong to a community in which one is judged by one&rsquo;s actions and opinions. The loss is of a political community, not of particular entitlements. Its remedy is political, and no technology can grant it.
                    </p>
                    <p>
                        The objection to this paper takes its sharpest form from <em>The Human Condition</em>. There Arendt calls the social life of the <em>animal laborans</em>, the human being as laborer, &ldquo;worldless and herdlike&rdquo; (Arendt [1958] 1998, 160). Could commerce without recognition deepen that worldlessness, enlarging labor, the metabolic necessity of staying alive, without restoring action, the act that appears before others? The question deserves a direct answer, because the paper&rsquo;s main claim about recognition stands or falls with it.
                    </p>
                    <p>
                        We accept the objection in part. By Arendt&rsquo;s own taxonomy, exchange does not belong to labor. The public realm of <em>homo faber</em>, the maker, &ldquo;is the exchange market,&rdquo; where he shows what he has made, &ldquo;even though it may not be a political realm, properly speaking&rdquo; (Arendt [1958] 1998, 160). She adds that &ldquo;exchange itself already belongs in the field of action,&rdquo; and sets it apart from the buying of food and other means of consumption, which is incidental to laboring (209). A displaced person who receives aid and spends it stands where Arendt puts the laborer; one who sells goods into a bonded exchange stands at the market, and the reply holds for that seller.
                    </p>
                    <p>
                        A seller of labor services stands closer to the <em>animal laborans</em>. Arendt&rsquo;s chapter on labor takes up Adam Smith&rsquo;s &ldquo;menial servants,&rdquo; who &ldquo;leave nothing behind them in return for their consumption&rdquo; (Arendt [1958] 1998, 86). Of labor of that kind Smith wrote, in a passage she quotes, that it &ldquo;perishes in the very instant of its production&rdquo; (93n29). For that seller the objection applies with more force. What the objection gets right for every seller is the rest: bilateral acknowledgment by a counterparty is not plural appearance before a public, and no accumulation of such acknowledgments makes the shared world in which action appears.
                    </p>
                    <p>
                        The bonded transaction carries a recognition function of this smaller kind. A counterparty commits with the wallet, both bonds stand behind the commitment, and the data a resolved process leaves is public: each order&rsquo;s wallets, payment and resolution (&sect;6, constraint 6). That data shows a wallet&rsquo;s commitments, the attestations given in its processes, and its resolutions. An <em>attestation</em> is a signed statement a party gives about an order while its process is open, checked for being signed and bound, never for being true; each resolution is a buyer&rsquo;s terminal acceptance. The data never shows performance. What the mechanism supplies is therefore a wallet&rsquo;s <em>resolution history</em>, the public summary of the resolved processes it was a party to and the attestations it carries, portable across borders. That is narrower than membership, and it exists where statelessness has left nothing.
                    </p>
                    <PaperRun title="What host states owe stays owed.">
                        The 1951 Convention and its 1967 Protocol enumerate what host states owe refugees, among them access to courts, wage-earning employment, public education, public relief, identity papers, travel documents and protection from <em>refoulement</em>, return to a place of persecution (United Nations 1951, arts. 16&ndash;17, 22&ndash;23, 27&ndash;28, 33; Goodwin-Gill and McAdam 2021). International lawyers have read Arendt&rsquo;s phrase as a claim to nationality, to humanity and to citizenship in turn (Kesby 2012). Does access to commerce give states a reason to do less? The critical literature on humanitarian technology raises that worry (Jacobsen 2015; Madianou 2019; Latonero and Kift 2018). The answer is that every one of those duties stays owed, and the mechanism discharges none of them, because each stays the state&rsquo;s to confer (&sect;1).
                    </PaperRun>
                    <p>
                        How much states should do is a political question, and this paper takes no side on it. The position closest to the paper&rsquo;s own is Benhabib&rsquo;s (2004) account of citizenship coming apart, with the rights once bundled in membership secured by different institutions. The bonded commitment adds one such piece, a credible promise, and leaves the others where they are.
                    </p>
                </PaperSubsection>
                <PaperSubsection title="5.2 Scale">
                    <p>
                        The population this paper concerns is broader than the displaced and stateless counted in &sect;1. It includes undocumented migrants, internally displaced people in regions banking does not reach, and people whose nationality cannot be exercised for commerce where they live. What they share is the position in commerce that &sect;1 named. No source counts this population as one. The nearest figure measures a different thing, financial exclusion: 1.3 billion adults lack an account, and about 900 million of them have a mobile phone (World Bank 2025). We found no source that measures displaced people&rsquo;s balances, so the fraction able to lock a bond is unknown. Displacement dispossesses unevenly, and the fraction is perhaps substantial; the claim&rsquo;s scope is that fraction, whatever its size.
                    </p>
                </PaperSubsection>
                <PaperSubsection title="5.3 The Received Architecture Presumes a Recognized Party">
                    <p>
                        Labor law, contract law, banking and commercial adjudication each presume a party recognized by a jurisdiction that enforces its rights. The populations of &sect;5.2 meet that presumption at four points.
                    </p>
                    <ul className="list-disc pl-6 space-y-2">
                        <li>Employment is formally closed to many of them: permission to work gates the employee category, and undocumented work, where it occurs, occurs outside legal recognition.</li>
                        <li>Independent contracting is unstable: in many places of residence they cannot register a business, cannot enforce a contract in a court that will not hear them, and cannot serve process across a border.</li>
                        <li>Banking is restricted or absent: opening an account typically requires residence and identity papers in the form the host state recognizes.</li>
                        <li>Adjudication has no stable forum: a party whose standing is contested finds no local court willing to hear its commercial dispute.</li>
                    </ul>
                    <p>
                        Betts and Collier (2017) argue that the refugee system leaves most of the productive capacity refugees bring unused, so they stay dependent on aid where work would be possible and preferred. Pritchett (2006) makes the general case that barriers to labor mobility carry a large welfare cost.
                    </p>
                    <p>
                        What the formal architecture withholds, informal institutions partly supply. In Uganda, which grants refugees the right to work, refugees&rsquo; economic lives are varied, often entrepreneurial and connected to the global economy (Betts et al. 2017). Fafchamps (2004), surveying market institutions in twelve countries of sub-Saharan Africa, finds that contracts depend more on social networks and personal trust where large hierarchies are absent. Such institutions work without a court. Greif (1993) shows how eleventh-century Maghribi traders employed overseas agents through a coalition whose shared information supported a reputation mechanism.
                    </p>
                    <p>
                        Where do these institutions stop? A reputation deters only a party whose conduct the network observes and can sanction, so it ends at the network&rsquo;s edge. It does not reach a counterparty beyond the community, or a member of another network in a market segmented by origin or kinship. It also thins as a trade grows larger or more distant. The gain from one defection grows with the trade while the network&rsquo;s sanction does not, and a network observes less of a distant trade.
                    </p>
                    <p>
                        The bonded commitment matters most at exactly those edges, for one of the two things such a network does: it deters defection, and it decides disputes among its members. The commitment&rsquo;s deterrent against defection is each party&rsquo;s own bond, which needs no shared network and grows with the value committed through each order. The bond does not replace the network&rsquo;s arbitration, since it decides no honest disagreement (&sect;2). It also costs what reputation does not: the time value of tokens that grow with the trade (&sect;6, constraint 8). A seller dealing with an unknown buyer still screens by resolution history (&sect;6, constraint 4).
                    </p>
                </PaperSubsection>
                <PaperSubsection title="5.4 What the Mechanism Does">
                    <ol className="list-[lower-alpha] pl-6 space-y-3">
                        <li>It provides a commerce architecture whose precondition is a key and a bond rather than recognition. A wallet needs no passport to bond, a bonded commitment needs no host-state court to enforce it, and a resolved process needs no domestic bank to clear it.</li>
                        <li>It leaves data of what each wallet committed to, attested and resolved, and that data travels with the wallet across borders. A wallet whose holder&rsquo;s standing is contested in jurisdiction <Math>{"A"}</Math> accumulates the same resolution history as a wallet whose holder&rsquo;s status is secure in jurisdiction <Math>{"B"}</Math>. Employment or contracting papers issued in one jurisdiction carry no such portability.</li>
                        <li>It opens to these parties any productive activity a process can carry: a chain of orders under one buyer, each order bonded, all of them resolved at once. The bound is what one buyer&rsquo;s process can coordinate; that is much of productive activity, though not all of it.</li>
                    </ol>
                    <p>
                        These are properties of the architecture. They depend on no humanitarian program and no legal reform; they follow from the construction of the mechanism.
                    </p>
                </PaperSubsection>
            </PaperSection>

            <PaperSection title="6. Operational Constraints">
                <p>
                    The mechanism moves the barrier from the architecture of law to operations, and eight constraints remain, one of them a limit of the equilibrium itself (constraint 7). The World Food Programme&rsquo;s <em>Building Blocks</em> shows two of them at work. It delivers food assistance to refugees through a blockchain, with recipients identified by UNHCR&rsquo;s biometric registration and spending at WFP-contracted retailers (Coppi and Fast 2019). WFP reports that it serves more than a million refugees in Jordan and Bangladesh (World Food Programme n.d.). The on-ramp and the gatekeeping of constraints 2 and 3 are met there by the program&rsquo;s own arrangements: a registration and a network of contracted retailers. The recipients receive; they do not bond. The mechanism adds the case the program leaves out, the displaced party as a counterparty in a bonded exchange rather than the recipient of a transfer.
                </p>
                <PaperRun title="Constraint 1: keeping the key.">
                    A wallet needs no legal identification, but digital inequalities limit who can hold one (Hernandez 2017). People with unreliable power, devices and connectivity face barriers at the cryptographic layer that the mechanism does not lower, and a key is easily lost in an unstable life. Recovery exists in three forms, each with its own threat model, and the people concerned are poorly placed to weigh them.
                </PaperRun>
                <p>
                    Trusted contacts can hold shares of a key and reassemble it. Recovery logic installed as smart-contract code on the key&rsquo;s own account can let named contacts jointly act from that account once its key is lost, an adaptation of the guardian scheme of Buterin (2021), in which guardians replace the signing key. A provider can hold the key under a trust the person can revoke. One bound is the mechanism&rsquo;s own, because a commitment is verified against the signing key alone and no smart-contract code can sign one. Recovery logic installed as smart-contract code on the key&rsquo;s own account before its key is lost lets that account still resolve, attest and move what resolution pays it. Only the key itself, held whole or reassembled from shares, signs a new commitment.
                </p>
                <PaperRun title="Constraint 2: the on-ramp.">
                    Converting tokens to local currency still runs through existing rails, and those rails are gated for this population. The mechanism runs on a public chain; the bridge to local purchasing power is a separate problem with its own gatekeepers. It narrows where local merchants accept stablecoins, tokens pegged to a national currency, directly.
                </PaperRun>
                <PaperRun title="Constraint 3: counterparty and currency gatekeeping.">
                    A well-placed buyer may decline to bond with a party whose standing is contested, because of exposure in its own jurisdiction: sanctions screening, anti-money-laundering obligations, the question of where a judgment could be enforced. Where the mechanism has an effect, it moves this friction from the architectural (commerce with the displaced cannot be built) to the discretionary (some counterparties will, others will not).
                </PaperRun>
                <p>
                    The same reach extends to the denomination. The mechanism accepts any token that transfers its exact amount, but the tokens available in practice are issued under some jurisdiction. Circle can block addresses and freeze USDC at its discretion and on a legal order from a valid government authority (Circle n.d.). It blocked the addresses named in the Tornado Cash designation (The Block 2022). That designation listed the mixer&rsquo;s contract addresses (US Department of the Treasury 2022), which Brito and Van Valkenburgh (2022) read as sanctioning autonomous code rather than a person. The Fifth Circuit then held that the immutable contracts are not property a sanctioned person can own (<em>Van Loon v. Department of the Treasury</em> 2024), and the Treasury delisted them (US Department of the Treasury 2025).
                </p>
                <p>
                    The fact the episode leaves standing is the one that matters here: an issuer can freeze the addresses that hold its token. A court&rsquo;s narrowing of the state&rsquo;s reach over code leaves the issuer&rsquo;s reach over its own token where it was. The chain&rsquo;s native token, which pays its gas, is created by the protocol&rsquo;s own rules, and no issuer can freeze an address that holds it. What remains is reach over inclusion: a block producer can decline to include a transaction, though it cannot move what an address holds. The native token is typically acquired through exchanges that identify their users, though peer-to-peer and on-chain routes exist.
                </p>
                <PaperRun title="Constraint 4: no forum both parties can reach.">
                    This population is the one for which a reachable forum is most often missing. A party whose standing is contested has no local court to hear its dispute (&sect;5.3). A counterparty in a recognized jurisdiction has no forum whose process reaches the other side, and where a forum can be named at all, the better-placed party names it.
                </PaperRun>
                <p>
                    What does a missing forum cost? The cost falls on the honest disagreement the bonds do not decide: a party without a forum negotiates its remedy alone. It leaves the deterrent standing, because no forum resolves in the buyer&rsquo;s place: the seller&rsquo;s deterrent is its bond, and what deters a withheld close is the buyer&rsquo;s own payment. The data travels with the parties should a forum become reachable, and ordinary courts may read it as evidence wherever they sit. What this population lacks before a court is standing, not evidence.
                </p>
                <p>
                    What if the buyer never closes? A buyer that never resolves after performance is out exactly the payment, against nothing for resolving, so a threat never to close is not credible. A delay can extract at most the time value of the seller&rsquo;s bond and withheld payment over the delay, and the buyer bears its own refund&rsquo;s time value meanwhile.
                </p>
                <p>
                    The cost still falls unevenly. A seller with a high time value bears delay more, and a wallet whose balance covers one bond holds one process at a time. A buyer paid from outside the trade can hold a performed seller&rsquo;s bond standing at the price of its own payment. That residue is what a resolution only the buyer can call leaves standing. Because no forum resolves in the buyer&rsquo;s place, the seller&rsquo;s protection is to counter-sign only for buyers whose resolution history it has read.
                </p>
                <PaperRun title="Constraint 5: legality.">
                    In some jurisdictions a contract with a party whose presence the state does not recognize is void. In some the act of contracting is itself an offense, the employment of a person without permission to work being the common case. Legality is an element of a binding contract, and it enters from outside the mechanism. A process resolves whether or not the state would have it resolve. The mechanism consults no state, so the law&rsquo;s answer reaches the parties directly: they bear whatever exposure the state attaches to what they did. The counterparty&rsquo;s exposure in constraint 3 is one side of this constraint; the displaced party&rsquo;s is the other. The mechanism makes a promise credible, and whether a trade is lawful is the law&rsquo;s to say.
                </PaperRun>
                <PaperRun title="Constraint 6: exposure of the data.">
                    For people whose safety depends on not being found, public data is exposure as well as evidence. What stays public and permanent is each order&rsquo;s two wallets, its payment, its denomination, its cumulative value and its process link, which ties co-sellers to one buyer. So are every attestation&rsquo;s signer, the clause of the agreement it concerns and a fingerprint of its content. Each resolution and its payouts stay public, as does any profile a wallet publishes about itself as a member of a public registry. The private detail, which the parties keep sealed, stays their own.
                </PaperRun>
                <p>
                    A wallet becomes linkable to a person at the ramps, where exchanges that identify their users convert tokens to local currency (constraint 2). From there, counterparties and states can read a wallet&rsquo;s resolution history to screen it or to find it. The humanitarian field&rsquo;s guidance on data protection is written for exactly this kind of linkage (Marelli 2024; Latonero and Kift 2018).
                </p>
                <p>
                    The linkage leaves each party a trade-off. A fresh key for each process, whose balance arrives from no wallet already linked, breaks the link, but it forgoes the resolution history that &sect;5.1 counts as the mechanism&rsquo;s recognition function. That history is also the seller&rsquo;s protection of constraint 4, so a buyer with none bears the cold start. A seller that reads history before it counter-signs is likely to pass over a buyer with no resolved process behind it. A party newly displaced into a market meets this as a buyer; as a seller, its own bond stands in for the history it lacks.
                </p>
                <PaperRun title="Constraint 7: a counterparty&rsquo;s coercive reach.">
                    The equilibrium this paper relies on presumes that the parties are beyond each other&rsquo;s coercive reach (Figaro 2026). A party within another&rsquo;s reach can be made by force to sign, to perform or to resolve, and the bonds do not price that force. Displaced people are often within such reach: of smugglers, of those who hold them in debt bondage, of officials who can detain them. Where a counterparty holds that reach, the bond&rsquo;s deterrent does not govern the trade. The paper&rsquo;s claim holds only where the parties are beyond each other&rsquo;s force, as strangers trading at a distance ordinarily are.
                </PaperRun>
                <PaperRun title="Constraint 8: the funding of the bond, and the boundary of the claim.">
                    The bond is what lets a seller with no account, no papers and no forum sell to a stranger, and be relied on. It is also tokens the seller must hold. A seller with balance <Math>{"B"}</Math> can take the order at link <Math>{"i"}</Math> only when <Math>{"B \\geq 2G_i"}</Math>, and keeps that much locked until the buyer resolves. What the bond costs it is the time value of <Math>{"2G_i"}</Math> over the process. No source measures <Math>{"B"}</Math> for displaced people (&sect;5.2).
                </PaperRun>
                <p>
                    Take a seller at the first link of a process, offering a service worth 50 tokens. At the first link the cumulative value equals the payment, <Math>{"G_1 = P_1 = 50"}</Math>, so the seller bonds <Math>{"2G_1 = 100"}</Math> tokens and the buyer bonds <Math>{"2P_1 = 100"}</Math>. A second seller whose order pays 30 tokens bonds twice the cumulative value through its own order, <Math>{"2G_2 = 2(50 + 30) = 160"}</Math>, while the buyer bonds <Math>{"2P_2 = 60"}</Math> for that order. At resolution each seller is refunded its bond whole and paid, so the first receives 150 tokens and the second 190.
                </p>
                <p>
                    The bond is the party&rsquo;s own deterrent, never a facility it can draw on. A borrowed bond is the lender&rsquo;s deterrent rather than the party&rsquo;s, and borrowing or hedging it unwinds the equilibrium it exists to create. Displacement often costs people what they own, and for those it has left with nothing to bond, the mechanism offers nothing. The paper&rsquo;s claim, a credible promise where the right to have rights is denied, holds for those who can still lock a bond.
                </p>
            </PaperSection>

            <PaperSection title="7. Conclusion">
                <p>
                    For people whom no state recognizes, or whom the state they live in will not hear, commerce with a stranger has failed at consideration: nothing made their promise credible, or a stranger&rsquo;s credible to them. A bonded commitment makes the promise credible from the parties&rsquo; own bonds, and asks of them only a signature and a bond. That changes the architecture they face and leaves their political condition as it was; Arendt&rsquo;s right to have rights stays with the polity, where she placed it. Within the bound of a bond that can be locked, and between parties beyond each other&rsquo;s reach, trading with a stranger becomes a set of operational problems rather than an impossibility: keeping a key, reaching an on-ramp, finding a willing counterparty, guarding the data. Humanitarian economics has reason to study the bonded commitment as one of the ways people outside a state&rsquo;s recognition can earn a living.
                </p>
            </PaperSection>
        </PaperLayout>
    );
}
