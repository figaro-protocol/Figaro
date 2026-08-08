import type { Metadata } from "next";
import Link from "next/link";
import {
    PaperLayout,
    PaperSection,
    PaperSubsection,
    PaperRun,
} from "@/components/papers/PaperLayout";
import { Math } from "@/components/papers/Math";

export const metadata: Metadata = {
    title: "The Wallet Without a Polity — Figaro Protocol",
    description:
        "A bonded settlement primitive's precondition is a cryptographic key, not a recognized civil-legal subjecthood. For the displaced and stateless, it grants not the right to have rights (political) but a capacity to have commerce (structural).",
};

export default function WalletWithoutPolityPaper() {
    return (
        <PaperLayout slug="wallet-without-polity"
            title="The Wallet Without a Polity"
            subtitle="Displaced and Stateless Subjects under a Bonded Settlement Primitive"
            author="Figaro"
            date="April 2026"
            watermark="Figaro Protocol · Preprint"
            keywords="statelessness, refugee economies, displaced populations, the wallet as legal subject, Arendt, humanitarian economics, commerce-without-jurisdiction"
            abstract={
                <>
                    <p>
                        The bonded settlement primitive &mdash; its mechanism established and its kernel formally verified &mdash; exhibits a property whose consequences are most consequential not for populations conventionally treated by labor or commercial law, but for those who occupy the negative space of those frames: refugees, stateless persons, undocumented migrants, and populations whose residency is beyond the reach of stable banking and enforcement infrastructure. The primitive&rsquo;s precondition is a cryptographic key, not a recognized civil-legal subjecthood. This paper develops the consequence.
                    </p>
                    <p>
                        The premise is that the primitive collapses the Roman <em>res</em>/<em>persona</em> distinction &mdash; the thing-owned versus the party-who-acts &mdash; so that the productive asset is simultaneously property and party; this paper extends the premise to settings where civil-legal subjecthood is itself absent. Arendt (1951) named the right to have rights as the fundamental human right &mdash; a right whose denial is a civilizational failure rather than an individual misfortune &mdash; and the technological infrastructure considered here cannot grant it. What it grants is narrower, and bounded to those who retain a stake sufficient to bond: a capacity to have commerce, where the capacity to have rights is denied. The two should not be confused. For populations for whom the first is denied and some stake survives, the second is non-trivial; for populations whose displacement has also stripped them of a stake, the primitive has nothing yet to offer.
                    </p>
                    <p>
                        The argument is positional rather than programmatic and bounded by that stake condition throughout. Real constraints &mdash; key custody, fiat on-ramp, counterparty and currency gatekeeping, and the stake constraint above all &mdash; are named and not dismissed. The analytical claim is that, for the population retaining a stake, the primitive moves the humanitarian-economics gap from an architectural impossibility to an operational engineering question, and that this is a consequential move worth scholarship.
                    </p>
                </>
            }
            references={
                <>
                    <li>Arendt, H. <em>The Origins of Totalitarianism</em>. Harcourt, Brace &amp; Co., New York, 1951 (esp. Part II, Ch. 9, &ldquo;The Decline of the Nation-State and the End of the Rights of Man&rdquo;).</li>
                    <li>Betts, A. &amp; Collier, P. <em>Refuge: Transforming a Broken Refugee System</em>. Penguin, London, 2017.</li>
                    <li>Pritchett, L. <em>Let Their People Come: Breaking the Gridlock on Global Labor Mobility</em>. Center for Global Development, Washington, DC, 2006.</li>
                    <li>Allen, C. The Path to Self-Sovereign Identity. Personal blog, April 26, 2016.</li>
                    <li>Buterin, V. Why We Need Wide Adoption of Social Recovery Wallets. Personal blog, January 11, 2021.</li>
                    <li>Tobin, A. &amp; Reed, D. The Inevitable Rise of Self-Sovereign Identity. Sovrin Foundation White Paper, 2017.</li>
                    <li>W3C. Decentralized Identifiers (DIDs) v1.0: Core Architecture, Data Model, and Representations. W3C Recommendation, July 2022.</li>
                    <li>Locke, J. <em>Two Treatises of Government</em>. Awnsham Churchill, London, 1689.</li>
                    <li>Nozick, R. <em>Anarchy, State, and Utopia</em>. Basic Books, New York, 1974.</li>
                    <li>Argent. Social Recovery: Reinventing Wallet Security. Argent Documentation.</li>
                    <li>Safe. Social Recovery via Threshold Multi-Signature. Safe (formerly Gnosis Safe) Documentation.</li>
                    <li>Arendt, H. <em>The Human Condition</em>. University of Chicago Press, Chicago, 1958.</li>
                    <li>Benhabib, S. <em>The Rights of Others: Aliens, Residents, and Citizens</em>. Cambridge University Press, 2004.</li>
                    <li>Goodwin-Gill, G. S. &amp; McAdam, J. <em>The Refugee in International Law</em>, 4th ed. Oxford University Press, 2021.</li>
                    <li>Kesby, A. <em>The Right to Have Rights: Citizenship, Humanity, and International Law</em>. Oxford University Press, 2012.</li>
                    <li>United Nations. <em>Convention Relating to the Status of Refugees</em>. 189 UNTS 137, 1951; expanded by the 1967 Protocol, 606 UNTS 267.</li>
                    <li>US Department of the Treasury, Office of Foreign Assets Control. Treasury Sanctions Notorious Virtual Currency Mixer Tornado Cash. Press release, August 8, 2022.</li>
                    <li>Van Valkenburgh, P. Analysis of the Tornado Cash Sanctions: How Far Does Treasury&rsquo;s Authority Reach? Coin Center Report, 2022.</li>
                    <li>World Food Programme. <em>Building Blocks: Blockchain for Humanitarian Assistance</em>. WFP (with UNHCR biometric registration), ongoing since 2017.</li>
                    <li>Coppi, G. &amp; Fast, L. Blockchain and Distributed Ledger Technologies in the Humanitarian Sector. Humanitarian Policy Group, Overseas Development Institute, 2019.</li>
                    <li>Hernandez, K. <em>Blockchain for Development: Hope or Hype?</em> IDS Rapid Response Briefing, Institute of Development Studies, 2017.</li>
                    <li>UN High Commissioner for Refugees. <em>Global Trends: Forced Displacement in 2023</em>. UNHCR, Geneva, 2024.</li>
                </>
            }
        >
            <PaperSection title="1. Introduction">
                <p>
                    The legal infrastructure of commerce presumes a recognized civil subject. Contract law requires parties whose standing the forum will accept; banking access requires identity documents the domestic regime issues; commercial-dispute adjudication requires a court whose jurisdiction reaches both sides. Each of these presumptions is so deeply embedded in the architecture of contemporary trade that its failure mode &mdash; populations for whom the presumptions do not hold &mdash; is treated by the architecture as exception rather than as a system property.
                </p>
                <p>
                    The United Nations Refugee Agency estimated 117.3 million forcibly displaced persons worldwide at the end of 2023, and approximately 4.4 million persons registered as stateless, with a substantially larger estimated population whose statelessness is undocumented (UNHCR, 2024). An overlapping and considerably larger population lacks stable banking and enforcement access for reasons of informal migration status, residence without papers, or residency in jurisdictions whose financial infrastructure does not reach them. Across these categories, the productive capacity of well over a hundred million working-age adults is systematically underused because the legal scaffold for engaging it is absent. The humanitarian-economics literature on refugee economies (Betts &amp; Collier, 2017) and the policy frontier between camp and labor market (Pritchett, 2006) documents the cost of this gap and the existing repertoire of responses.
                </p>
                <p>
                    This paper argues that the bonded settlement primitive &mdash; its mechanism established and its kernel formally verified &mdash; changes the architectural posture of the gap. The primitive operates on parties whose existence as parties does not require civil-legal recognition. A wallet can sign; a bonded commitment can settle; an exchange can complete &mdash; without a host-state court, a domestic bank, or a permission-to-work visa sitting between the parties. The present paper develops the consequence for populations to whom the labor-law debate is a second-order question, because the first-order question is whether they are recognized parties to any contract in any forum at all.
                </p>
                <PaperRun title="What this paper is not.">
                    This paper does not claim that the primitive resolves statelessness. It does not confer citizenship, restore legal recognition, or create enforcement against a state that denies a person&rsquo;s standing. It is not a substitute for the political work that addresses those gaps &mdash; work that remains necessary, that this paper does not duplicate, and that no technological infrastructure can perform. It does not predict adoption rates, endorse any particular humanitarian program, or assess the political consequences of widespread wallet adoption among displaced populations. Its argument is structural: the architectural posture of the commerce-access gap changes once a settlement primitive whose precondition is a cryptographic key exists.
                </PaperRun>
                <PaperRun title="Paper organization.">
                    Section 2 summarizes the settlement primitive in the terms relevant here. Section 3 states the paper&rsquo;s premise: the wallet can be a party where no civil-legal party exists. Section 4 develops self-sovereignty as the cryptographic precondition. Section 5 develops the central claim, leading with the Arendtian analysis of statelessness and the boundary it imposes on the thesis, then the scale of the affected population, the architecture they face, and what the primitive does and does not do. Section 6 names the operational constraints the primitive does not dissolve, foremost among them the stake constraint that bounds Section 5&rsquo;s claim. Section 7 concludes.
                </PaperRun>
            </PaperSection>

            <PaperSection title="2. The Settlement Primitive">
                <p>
                    The mechanism and its verification are summarized here only as far as the argument needs.
                </p>
                <p>
                    The primitive composes two mechanisms, derived in <Link href="/papers/asymmetric-bonding" className="text-ink-heading hover:underline">Asymmetric Bonding and Buyer Dominance</Link> (&sect;4.1 for the bilateral equilibrium, &sect;5.1 for the multi-party case). <em>Asymmetric bonding</em> makes defection more expensive than cooperation at every bonded edge. <em>Buyer dominance with atomic resolution</em> settles every active order in a process simultaneously, at the buyer&rsquo;s signature, with no third-party adjudicator. The first mechanism removes the trusted enforcer; the second removes the trusted clearing house. For the present paper both are load-bearing: the displaced or stateless subject lacks access to either, and the primitive&rsquo;s contribution is to make both unnecessary.
                </p>
                <p>
                    A transaction between two parties is consummated by dual-signed digital commitments. Each party signs from their own wallet. Each party locks a bond against their own performance &mdash; the buyer locks <Math>{"2P"}</Math>, the seller locks <Math>{"2G"}</Math> where <Math>{"G"}</Math> is the cumulative upstream value bonded in the process. Only the buyer can trigger resolution. Defection is structurally more expensive than cooperation. There is no platform between the parties, no arbitrator authorized to resolve disputes on-chain, and no admin key permitting external override.
                </p>
                <p>
                    The features that matter for the present paper are three. First, the kernel does not require either party to be a recognized civil subject; it requires them to control a key that can sign. Second, the kernel does not require a forum to enforce the agreement; the bond structure is the enforcement mechanism. Third, the kernel does not route value through a banking intermediary; settlement is direct, wallet to wallet, atomic on resolution. The enforcement the bond structure supplies is of settlement discipline under perfect monitoring with costless performance; an honest dispute over whether performance met the agreement is not settled by the bond but remains for an external forum, on the record the primitive produces.
                </p>
            </PaperSection>

            <PaperSection title="3. A Party Where No Civil-Legal Party Exists">
                <p>
                    Roman private law distinguished <em>res</em> (things that can be owned and alienated) from <em>persona</em> (parties capable of acting legally); the distinction survived and structures modern private law. The premise of this paper is that the bonded primitive collapses that partition: a wallet is simultaneously a property (a key-pair owned and transferable) and a party (a signer, bonder, settlement-receiver), and the collapse is operational rather than metaphorical &mdash; it follows from the architecture of dual-signed bonded commitments. The extension the present setting demands is stronger than the collapse itself. Where one or both parties lack stable <em>persona</em> status in the host jurisdiction at all, the wallet provides a party-to-the-transaction whose existence does not depend on the prior existence of a recognized civil subject: the wallet can be a party where no civil-legal party exists.
                </p>
                <p>
                    This is not a claim that the wallet <em>is</em> a civil-legal subject. Civil-legal subjecthood is conferred by polities, and its absence is a political condition. The claim is narrower: a party to a bonded commitment can transact, settle, and accumulate verifiable performance history without first acquiring civil-legal subjecthood, because the kernel does not consult the polity for permission to settle a bond.
                </p>
            </PaperSection>

            <PaperSection title="4. Self-Sovereignty: The Cryptographic Key as Precondition">
                <p>
                    The previous section established that the wallet can be a party where no civil-legal party exists. The deeper observation, which the self-sovereign-identity literature has been developing independently of the bonded-primitive context, is that this arrangement is a particular kind of agency that deserves a name distinct from both <em>civil-legal personhood</em> and the older <em>natural personhood</em> the philosophical tradition has analyzed. The name we adopt, following Allen (2016) and the broader self-sovereign-identity literature (Tobin &amp; Reed, 2017; W3C DID, 2022), is <em>self-sovereignty</em>: the condition of an agent whose capacity to bind, transact, and accumulate verifiable history derives from cryptographic self-control rather than from recognition by a polity.
                </p>
                <PaperRun title="Three acts, three preconditions discharged.">
                    A bonded transaction reduces to three acts at the participant&rsquo;s side, and each has historically required a civil-legal precondition the bonded primitive replaces with a cryptographic one. <em>Signing:</em> the act of binding oneself to terms has required a recognized capacity to enter contracts (adulthood, sound mind, jurisdictional standing); under the primitive the capacity to sign is the capacity to control a private key, and the signature verifies against the signing key without consulting any registry of recognized subjects. <em>Bonding:</em> pledging assurance has required a counterparty willing to extend credit, a court willing to enforce a guarantee, or a recognized residency status enabling a banking relationship; under the primitive it is the act of locking a bond in a permissionless token, the return on cooperation enforced by the kernel, not a court. <em>Settling:</em> receiving consideration has required a banking relationship that can credit the receiving party in the receiving jurisdiction&rsquo;s currency; under the primitive settlement is direct wallet-to-wallet on resolution. The architectural property is unconditional; the operational property in any given denomination is not, since the bond-denomination currency is itself a jurisdictional artifact (USDC is freezable by Circle on Treasury request; ETH is acquired through KYC-gated exchanges) &mdash; the constraint developed in Section 6 below.
                </PaperRun>
                <PaperRun title="What self-sovereignty does and does not mean.">
                    The <em>self-sovereign-identity</em> (SSI) literature (Allen, 2016; Tobin &amp; Reed, 2017) is grounded in identity specifically: the participant holds verifiable credentials about themselves rather than depending on identity providers. Allen&rsquo;s ten principles extend beyond credential-holding into the agency-of-interaction register, and the sense we develop is the commerce-specific narrowing of those agency principles &mdash; applied to the signing, bonding, and settling acts of bilateral commerce rather than to identity per se. The W3C Decentralized Identifiers specification (2022) formalizes the architectural shape (identifiers controlled by the subject through cryptographic keys, with no central registrar), but SSI in the W3C-DID register is about <em>identity</em>, and the bonded primitive does not implement identity: the kernel knows wallets, not persons. The <em>libertarian / Lockean</em> sense of sovereignty (Locke, 1689; Nozick, 1974) is normative &mdash; natural rights of self-ownership that political arrangements must respect &mdash; and the primitive is silent on it; it provides architecture, not ethics. The sense we adopt is narrower than either: an agent whose commercial agency is operationally constituted by cryptographic self-control rather than by polity recognition &mdash; a structural fact about how the primitive operates, not a normative claim about how it should. The agency applies universally &mdash; any wallet that signs, bonds, and settles exercises it &mdash; but its marginal value is asymmetric. A participant whose civil-legal subjecthood is already conferred and stable has plenty of paths to express commercial agency; the primitive is one substrate among many. A participant whose subjecthood is denied or unstable does not have those paths, and for them the operational self-sovereignty the primitive supplies <em>is</em> the agency, not an augmentation to it.
                </PaperRun>
            </PaperSection>

            <PaperSection title="5. The Capacity to Have Commerce">
                <PaperSubsection title="5.1 Arendt and the Right to Have Rights">
                    <p>
                        Arendt (1951) observed that the fundamental human right is the right to have rights &mdash; the right to belong to a political community within which one&rsquo;s other rights have standing. Her analysis of statelessness named the condition as a civilizational failure rather than an individual misfortune. The person without a polity is not merely deprived of specific rights; they are deprived of the institutional setting in which having-rights is even a coherent claim. The remedy is political, not technological.
                    </p>
                    <p>
                        The Arendtian objection is sharper than the surface formulation. Part II, Chapter 9 of <em>The Origins of Totalitarianism</em> is not only a diagnosis of statelessness; it is an analysis of a specific kind of <em>worldlessness</em> &mdash; the loss not of particular entitlements but of the standing of the human person within a public world that confers significance on their actions. Arendt&rsquo;s (1958) later distinction between <em>labor</em>, <em>work</em>, and <em>action</em> sharpens this: the world is constituted through action visible to others, in a public space within which the actor is recognized as an actor. The Arendtian objection to a &ldquo;capacity to have commerce&rdquo; framing is therefore not that commerce is unimportant for the displaced; it is that commerce-without-polity may be the deepening of worldlessness rather than its alleviation &mdash; participation in <em>labor</em> (the metabolic necessity of staying alive) without re-entering <em>action</em> (the recognized public act).
                    </p>
                    <p>
                        We take the objection seriously and decline it on these terms. The capacity-to-have-commerce we describe is not a substitute for membership; it is a structural precondition that membership historically subsumed and that, where membership is denied, can be supplied separately. The bonded transaction does include a recognition function in Arendt&rsquo;s sense, on a small scale: the commitment is dual-signed, the performance is attested, the record is public, and the counterparty acknowledges the participant as a party with whom binding agreements can be made. This is not the political recognition Arendt regarded as fundamental &mdash; co-membership in a polity &mdash; but it is not nothing in her register either. The disanalogy must be conceded rather than blurred: bilateral acknowledgment by a counterparty is not plural appearance before a public, and no accumulation of bilateral acknowledgments amounts to the shared world in which Arendtian action appears. What the substrate supplies is narrower &mdash; a portable evidentiary record of the participant&rsquo;s performances &mdash; not coextensive with political membership, but filling a gap statelessness has historically left empty.
                    </p>
                    <p>
                        The bonded primitive does not grant the right to have rights; it grants, more narrowly, a capacity to have commerce, and only to those who retain a stake sufficient to bond with &mdash; the boundary developed fully in Section 6. The right to have rights is political and is not within the gift of any technology. The capacity to have commerce is structural and becomes operational once the cryptographic infrastructure is in reach and a stake is in hand. For populations for whom the first right is denied but some stake survives, the second capacity is non-trivial; for populations for whom the first right is granted, the second is largely subsumed by existing institutions. The primitive&rsquo;s leverage is asymmetric: where the conventional infrastructure works, it adds modestly; where recognition fails but a stake remains, it adds the architectural condition for participation at all.
                    </p>
                    <PaperRun title="The protection-gap residue the substrate cannot reach.">
                        The 1951 Refugee Convention and its 1967 Protocol enumerate rights the host state owes refugees within its territory (<em>non-refoulement</em>, access to courts, identity and travel papers, employment, public education, public relief &mdash; Refugee Convention, 1951; Goodwin-Gill &amp; McAdam, 2021). The right to have rights as Arendt names it is closer to the spirit of the Convention than to any single article; the Convention operationalizes the spirit through specific institutional duties (Kesby, 2012; Benhabib, 2004). The bonded primitive supplies none of these: it cannot prevent <em>refoulement</em>, grant access to courts, or issue identity papers, travel documents, or work permits. The protection gap Goodwin-Gill &amp; McAdam describe is real, vast, and political; the substrate addresses one of its many components (the inability to bind in commerce without a recognized counterparty) and leaves the others where they were. The position we hope to occupy is closer to Benhabib&rsquo;s: the rights-of-others framework identifies layers of moral and legal claim that are differently secured by different institutional arrangements, and the bonded substrate adds one such layer (commerce-binding capacity) without displacing the others.
                    </PaperRun>
                </PaperSubsection>
                <PaperSubsection title="5.2 Scale">
                    <p>
                        Beyond the UNHCR figures cited in the introduction, the relevant population is broader than the forcibly-displaced and stateless categories alone. Undocumented migrants who hold no recognized status in their country of residence, internally displaced persons whose host sub-jurisdiction does not extend banking infrastructure to their location, and populations in failed-state or contested-sovereignty zones whose nominal citizenship is not exercisable for commercial purposes all share the operationally-relevant property: they cannot reliably enter the legal infrastructure of commerce as recognized parties. Estimates of the combined population vary substantially with definition; the order of magnitude is hundreds of millions, not millions. Not all of this population retains a stake sufficient to bond &mdash; the qualification Section 6 develops &mdash; but a substantial fraction does: displacement dispossesses unevenly, and holding some transferable capital while lacking recognized civil-legal standing is itself common among the categories named above.
                    </p>
                </PaperSubsection>
                <PaperSubsection title="5.3 The Received Architecture">
                    <p>
                        Labor law, contract law, banking, and commercial-dispute adjudication each presume a recognized legal subject attached to a jurisdiction that enforces their rights. The relevant populations occupy the negative space of that presumption.
                    </p>
                    <ul className="list-disc pl-6 space-y-2">
                        <li>The employment relation is typically unavailable to them formally: permission-to-work requirements gate access to the employee category, and undocumented work, where it occurs, occurs outside legal recognition.</li>
                        <li>The independent-contractor relation is unstable: cannot register a business in many jurisdictions of residence, cannot enforce contracts in local courts that do not recognize the party&rsquo;s standing, cannot reliably serve process across jurisdictional boundaries.</li>
                        <li>Banking access is restricted or absent: opening an account typically requires documents of residency and identity the population does not have in the form the host jurisdiction recognizes.</li>
                        <li>Adjudication has no stable forum: commercial disputes have no local court willing to hear them from a party whose standing is contested.</li>
                    </ul>
                    <p>
                        The humanitarian-economics tradition has documented the cost of this gap. Betts &amp; Collier (2017) argue that displaced populations are systematically prevented from contributing to the economies that host them by an institutional architecture designed for citizens, so the host economy captures little of the productive capacity the displaced bring and the displaced themselves remain dependent on humanitarian transfers when productive participation would be both possible and preferred. Pritchett (2006) makes the broader argument about labor-mobility friction and the welfare cost of the institutional gap between origin and destination labor markets.
                    </p>
                </PaperSubsection>
                <PaperSubsection title="5.4 What the Primitive Does and Does Not Do">
                    <p>
                        Section 1 named what the primitive does not do. What it does is structurally narrower:
                    </p>
                    <ol className="list-[lower-alpha] pl-6 space-y-3">
                        <li>It provides a commerce architecture whose precondition is a cryptographic key rather than a recognized civil-legal subjecthood. A wallet does not require a passport to bond; a bonded commitment does not require a host-state court to enforce; a settled exchange does not require a domestic bank to clear.</li>
                        <li>It produces a verifiable performance record that travels with the wallet across jurisdictional boundaries. A contributor whose civil-legal subjecthood is contested in jurisdiction <Math>{"A"}</Math> accumulates the same on-chain attestation history as one whose status is settled in jurisdiction <Math>{"B"}</Math>. The record is portable in a way that conventional employment or contracting records are not.</li>
                        <li>It opens a region of productive activity &mdash; bilateral, bonded, settled directly between parties &mdash; to participants for whom the legal scaffold that conventionally underwrites such activity is unavailable. The set of activities thus opened is bounded by what can be coordinated bilaterally and settled atomically; the bound is non-trivial but not all of productive activity.</li>
                    </ol>
                    <p>
                        These are descriptive properties of the architecture. They do not depend on any humanitarian program or any particular legal reform; they follow from the construction of the primitive.
                    </p>
                </PaperSubsection>
            </PaperSection>

            <PaperSection title="6. Operational Constraints">
                <p>
                    The primitive moves the commerce-access gap from architectural impossibility to operational engineering question; it does not solve the engineering question. We name the three constraints that remain, and the World Food Programme&rsquo;s <em>Building Blocks</em> pilot (with UNHCR providing biometric registration, deployed in Jordan since 2017 and expanded across several refugee operations) supplies existing evidence for two of them: independent evaluations (Coppi &amp; Fast, 2019; Hernandez, 2017) find the programs deliver real operational improvements in coordination and disbursement, but locate the binding constraint not in on-chain recognition of the participant &mdash; which the architecture supplies straightforwardly &mdash; but in the host-state and on-ramp gatekeeping the first constraint below describes. The displaced beneficiaries in these pilots do not bond; they receive. The bonded primitive extends the architecture to a use case the pilots have not yet exercised at scale: the displaced participant as <em>counterparty</em> in a productive bilateral exchange rather than as recipient of one-sided disbursement.
                </p>
                <PaperRun title="Access: key custody and the fiat on-ramp.">
                    Two constraints bound the population&rsquo;s practical access to the architecture even where it is legally reachable. Populations with unreliable access to power, devices, and connectivity face usability barriers at the cryptographic layer the primitive does not solve; loss-of-key risk is high in unstable environments, and key-recovery infrastructure for displaced populations is not built. Solutions exist &mdash; social-recovery wallets where participant-trusted contacts can collectively recover a lost key (Buterin, 2021; Argent; Safe), custodial wallets with revocable trust &mdash; but each carries its own threat model and trade-offs the population is poorly positioned to evaluate. Separately, converting wallet-denominated value to local currency still runs through existing rails, which remain gated for the population in question; the primitive operates within the crypto-native settlement layer, and the bridge to local purchasing power remains a separate problem with its own gatekeepers, partially closed where local merchants accept stablecoins directly.
                </PaperRun>
                <PaperRun title="Counterparty and currency gatekeeping.">
                    A well-resourced buyer in a recognized jurisdiction may decline to bond with a counterparty whose civil-legal standing is contested &mdash; not because of the primitive, but because of downstream legal exposure in the buyer&rsquo;s home jurisdiction (sanctions screening, anti-money-laundering obligations, forum-of-enforcement concerns). The primitive&rsquo;s effect, where it has one, is to shift this friction from architectural (&ldquo;commerce with the displaced is impossible&rdquo;) to discretionary (&ldquo;some counterparties will, others will not&rdquo;). The same reach extends to the bond&rsquo;s denomination currency, which is itself a jurisdictional artifact: the primitive is denomination-agnostic, but the denominations available in practice are not. The principal US-dollar-pegged stablecoin (USDC) is issued by Circle, a US entity subject to OFAC enforcement and capable of freezing addresses on Treasury request; the Tornado Cash sanctions of August 2022, which targeted a piece of immutable open-source code rather than an entity, made explicit how far the regulatory reach can extend (OFAC, 2022; Van Valkenburgh, 2022). ETH is a neutral substrate at the protocol level but is acquired through exchanges that KYC.
                </PaperRun>
                <PaperRun title="The stake constraint &mdash; and the boundary of this paper&rsquo;s thesis.">
                    The bond is the party&rsquo;s own staked deterrent, not an asset it holds or a facility it can draw on. A party without a stake cannot yet bond &mdash; a material reality the mechanism does not paper over with lending instruments: a financed bond is not the party&rsquo;s own skin, and hedging or borrowing the deterrent unwinds the equilibrium it exists to create. The primitive&rsquo;s equilibrium results assume only agency and a stake &mdash; that each party can choose its own actions and controls a stake sufficient to post the bond &mdash; and are otherwise jurisdiction-invariant, invoking no legal freedom, status, or standing. For the present analysis this is not one constraint among several but the constraint that fixes the thesis&rsquo;s scope: displacement and statelessness correlate with asset loss, and for the fraction of the affected population whose displacement has also stripped them of a stake, the primitive has no present contribution to make. This paper&rsquo;s claim &mdash; a capacity to have commerce where the capacity to have rights is denied &mdash; therefore holds only for the population that retains a stake despite lacking civil-legal recognition, not for the population that lacks both.
                </PaperRun>
                <p>
                    The cumulative effect of these constraints is that the primitive is not a solved-problem deliverable for displaced populations today. Its present-tense contribution is architectural, and bounded to those with a stake to bond: commerce-without-recognition is now possible to build, where it was not before, and the constraints that remain are engineering problems with engineering solutions rather than structural features of the legal infrastructure.
                </p>
            </PaperSection>

            <PaperSection title="7. Conclusion">
                <p>
                    The bonded settlement primitive changes the architecture of the commerce-access gap that statelessness creates, by replacing the precondition of recognized civil-legal subjecthood with the precondition of a cryptographic key. The change is not in the political condition of the populations under discussion; it is in the institutional architecture they face when they attempt to participate in productive activity across jurisdictional boundaries.
                </p>
                <p>
                    The paper is positional. It identifies a gap, names the architectural change, and acknowledges the operational constraints that remain. The programmatic work &mdash; building key-custody infrastructure for refugee populations, partnering with humanitarian organizations to evaluate where bonded commerce is structurally feasible and where it is not &mdash; is for the practitioners who do that work. The contribution of this paper is to make the architectural change legible to scholarship that has not yet recognized it as available.
                </p>
            </PaperSection>
        </PaperLayout>
    );
}
