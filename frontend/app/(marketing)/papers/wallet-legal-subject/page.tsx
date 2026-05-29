import type { Metadata } from "next";
import {
    PaperLayout,
    PaperSection,
    PaperSubsection,
    PaperRun,
} from "@/components/papers/PaperLayout";
import { Math } from "@/components/papers/Math";

export const metadata: Metadata = {
    title: "The Wallet as Legal Subject — Figaro Protocol",
    description:
        "Labor law classifies along one axis — subordination. A bonded settlement primitive removes the axis by removing the employment relation that gave it a subject. The wallet collapses the Roman res/persona distinction.",
};

export default function WalletLegalSubjectPaper() {
    return (
        <PaperLayout
            title="The Wallet as Legal Subject"
            subtitle="Subordination, Property, and the Dissolution of the Employee–Contractor Line"
            author="Alessandro Daliana"
            date="April 2026"
            watermark="Figaro Protocol · Preprint"
            keywords="labor law, employee classification, gig economy, private government, subordination, legal subject, self-sovereign identity"
            abstract={
                <>
                    <p>
                        Labor law distinguishes employees from independent contractors along a single doctrinal axis: the degree of subordination the employer exercises over how the worker conducts themselves within the employer&rsquo;s system of processes and values. The axis is a continuum, the classification is a threshold placed somewhere on it, and the threshold is the perpetual subject of legislative and judicial contest &mdash; AB5 and Proposition 22 in California, <em>Uber BV v Aslam</em> in the United Kingdom, the 2024 EU Platform Work Directive. The cases are all the same case, relitigated in each jurisdiction against each new technology.
                    </p>
                    <p>
                        This paper argues that the bonded settlement primitive &mdash; its mechanism established and its kernel formally verified &mdash; changes the doctrinal terrain by eliminating the axis. Figaro parties are bonded counterparties; there is no employment relation to classify. The wallet collapses a distinction the Roman legal tradition kept separate: <em>res</em> (property) and <em>persona</em> (legal party). Every productive asset is simultaneously property and party &mdash; self-owned rather than owned or rented.
                    </p>
                    <p>
                        We develop the argument in three moves. First, we locate subordination as the doctrinal variable in the long-running labor-classification debate, drawing on Anderson&rsquo;s analysis of the firm as private government (2017), Ellerman&rsquo;s argument that the employment contract renews the master&ndash;servant relation in softer form (1992), and Taleb&rsquo;s compressed version of the same point in <em>Skin in the Game</em> (2018). Second, we show that the gig-economy case law is a classification dispute whose ground disappears once subordination ceases to be a variable. Third, we name the trade-off: Figaro is a leveller on the subordination axis but simultaneously a privatizer of employment-attached protections (unemployment insurance, healthcare, pensions, collective bargaining). What follows is a matter of policy, not mechanism.
                    </p>
                </>
            }
            references={
                <>
                    <li>California State Legislature. Assembly Bill No. 5, Ch. 296, Stats. 2019 (codifying the ABC test for employee classification).</li>
                    <li>Anderson, E. <em>Private Government: How Employers Rule Our Lives (and Why We Don&rsquo;t Talk About It)</em>. Princeton University Press, 2017.</li>
                    <li><em>Autoclenz Ltd v Belcher</em>, [2011] UKSC 41.</li>
                    <li><em>Dynamex Operations West, Inc. v Superior Court</em>, 4 Cal.5th 903 (2018).</li>
                    <li>Ellerman, D. P. <em>Property and Contract in Economics: The Case for Economic Democracy</em>. Blackwell, Cambridge, MA, 1992.</li>
                    <li>European Parliament and Council. Directive (EU) 2024/2831 of 23 October 2024 on improving working conditions in platform work. <em>Official Journal of the European Union</em>, 2024.</li>
                    <li>California Proposition 22 (2020), codified at Cal. Bus. &amp; Prof. Code §§ 7448&ndash;7467.</li>
                    <li>Taleb, N. N. <em>Skin in the Game: Hidden Asymmetries in Daily Life</em>. Random House, New York, 2018 (Book 4, &ldquo;Wolves Among Dogs,&rdquo; Ch. 3, &ldquo;How to Legally Own Another Person&rdquo;).</li>
                    <li>Collins, H. Market Power, Bureaucratic Power, and the Contract of Employment. <em>Industrial Law Journal</em>, 15(1):1&ndash;14, 1986.</li>
                    <li>Deakin, S. The Changing Concept of the &lsquo;Employer&rsquo; in Labour Law. <em>Industrial Law Journal</em>, 30(1):72&ndash;84, 2001.</li>
                    <li>Deakin, S. &amp; Morris, G. S. <em>Labour Law</em>, 6th ed. Hart Publishing, Oxford, 2012.</li>
                    <li>Freedland, M. &amp; Kountouris, N. <em>The Legal Construction of Personal Work Relations</em>. Oxford University Press, 2011.</li>
                    <li>Fudge, J. The Legal Boundaries of the Employer, Precarious Workers, and Labour Protection. In G. Davidov &amp; B. Langille (eds.), <em>Boundaries and Frontiers of Labour Law</em>. Hart Publishing, Oxford, 2006.</li>
                    <li>Veitch, S. <em>Obligations: New Trajectories in Law</em>. Routledge, Abingdon, 2021.</li>
                    <li>Hohfeld, W. N. Some Fundamental Legal Conceptions as Applied in Judicial Reasoning. <em>Yale Law Journal</em>, 23(1):16&ndash;59, 1913.</li>
                    <li>Naffine, N. <em>Law&rsquo;s Meaning of Life: Philosophy, Religion, Darwin and the Legal Person</em>. Hart Publishing, Oxford, 2009.</li>
                    <li>Bayern, S. Of Bitcoins, Independently Wealthy Software, and the Zero-Member LLC. <em>Northwestern University Law Review</em>, 108:1485&ndash;1500, 2014.</li>
                    <li>LoPucki, L. M. Algorithmic Entities. <em>Washington University Law Review</em>, 95:887&ndash;953, 2018.</li>
                    <li>Fairfield, J. A. T. <em>Owned: Property, Privacy, and the New Digital Serfdom</em>. Cambridge University Press, 2017.</li>
                    <li>Pasquale, F. <em>The Black Box Society: The Secret Algorithms That Control Money and Information</em>. Harvard University Press, Cambridge, MA, 2015.</li>
                    <li><em>Uber BV and others v Aslam and others</em>, [2021] UKSC 5.</li>
                </>
            }
        >
            <PaperSection title="1. Introduction">
                <p>
                    Labor law, across every jurisdiction that has one, answers a recurring question: is this person an employee or an independent contractor? The answer matters because the two categories attract radically different legal consequences &mdash; minimum wage, overtime, unemployment insurance, employer health-insurance obligations, workers&rsquo; compensation, collective-bargaining rights, anti-discrimination protections, tax treatment, pension eligibility. The classification test varies by jurisdiction, but all tests converge on a common underlying variable: the degree to which the putative employer directs and controls the putative employee&rsquo;s work &mdash; their schedule, their tools, their processes, their supervision, their ability to work for others.
                </p>
                <p>
                    We will call this variable <em>subordination</em>, following the usage common in Continental labor-law scholarship and in the political-economy tradition we return to in Section 2. Subordination is a continuum; the employee&ndash;contractor line is a threshold placed somewhere on it; and the location of the threshold is the perpetual subject of doctrinal and political contest.
                </p>
                <p>
                    The gig economy made the contest legible. Drivers, couriers, and platform freelancers occupy a region of the subordination continuum the existing legal categories were not designed for: loosely supervised by algorithm, nominally free to refuse work, economically dependent on the platform nonetheless. Jurisdictions have responded with increasingly granular tests. California&rsquo;s Assembly Bill 5 (2019) codified the ABC test, pushing many gig workers toward employee status; Proposition 22 (2020) carved out an exception for app-based rideshare and delivery drivers. The UK Supreme Court in <em>Uber BV v Aslam</em> (2021) classified drivers as &ldquo;workers&rdquo; &mdash; a third category intermediate between employee and contractor &mdash; on subordination grounds. The EU Platform Work Directive (Directive (EU) 2024/2831) established a presumption of employment for platform workers meeting specified control indicators.
                </p>
                <p>
                    Each of these cases and statutes is, at root, an attempt to draw the same line differently. The line itself is what the cases cannot dispense with.
                </p>
                <PaperRun title="The argument of this paper.">
                    We argue that the bonded settlement primitive changes the question. The institutional consequence is that the firm becomes one organizational pattern among several when the subordination overlay is no longer enforcement-driven. The legal consequence follows but needs a separate treatment because its vocabulary and its audience are different. Specifically: when every party to a productive exchange is a bonded counterparty &mdash; signing commitments under their own key, posting collateral against their own performance, receiving settlement directly to their own wallet &mdash; there is no employment relation to classify. The classification problem has no subject. The employee&ndash;contractor line is not redrawn; it is dissolved by the absence of the relation it was drawing.
                </PaperRun>
                <PaperRun title="What this paper is not.">
                    This paper does not provide legal advice. It does not argue that labor law should be abolished. It does not argue that employment-attached protections are undesirable. It does not predict that the bonded primitive will displace employment as the dominant coordination form, and does not endorse any particular outcome of the classification it dissolves. Its argument is diagnostic: the primitive changes the doctrinal terrain, and legal scholarship should understand that change independently of any normative conclusion one might draw from it.
                </PaperRun>
                <PaperRun title="Paper organization.">
                    Section 2 develops subordination as the labor-law variable, drawing on Anderson, Ellerman, and Taleb. Section 3 summarizes the settlement primitive in the terms relevant here. Section 4 develops the central legal move: the wallet as a legal subject that collapses the classical <em>res</em>/<em>persona</em> distinction. Section 5 re-reads the gig-economy case law through that lens. Section 6 names the leveller/privatizer trade-off. Section 7 concludes.
                </PaperRun>
            </PaperSection>

            <PaperSection title="2. Subordination as the Labor-Law Variable">
                <PaperSubsection title="2.1 The Doctrinal Test">
                    <p>Every mature labor-law regime operationalizes the employee&ndash;contractor distinction through a control-flavored test. The details vary:</p>
                    <ul className="list-disc pl-6 space-y-2">
                        <li>The IRS twenty-factor test in the United States examines behavioral control, financial control, and the nature of the relationship.</li>
                        <li>California&rsquo;s ABC test, codified in AB5, places the burden on the hiring entity to show that the worker (A) is free from control and direction, (B) performs work outside the hiring entity&rsquo;s usual business, and (C) is customarily engaged in an independently established trade.</li>
                        <li>UK jurisprudence, following <em>Autoclenz</em> (2011) and refined in <em>Aslam</em>, examines the reality of the working arrangement rather than its contractual label, focusing on personal service, mutuality of obligation, and control.</li>
                        <li>Continental systems (France, Germany, Italy) distinguish <em>travail salarié</em>, <em>abhängige Arbeit</em>, <em>lavoro subordinato</em> respectively, anchoring the status on <em>subordination juridique</em> &mdash; the juridical subordination of the worker to the employer&rsquo;s directive power.</li>
                    </ul>
                    <p>
                        The tests differ in which facts they weight and in whether the burden sits on the worker or the employer. They agree on what the variable is. Control, direction, supervision, integration into the employer&rsquo;s processes &mdash; these are all labels for the same underlying relationship: subordination of the worker&rsquo;s conduct to the employer&rsquo;s authority, in exchange for a wage.
                    </p>
                    <PaperRun title="Where the labor-law literature has located subordination.">
                        The point is not original to the present paper. Collins (1986) argued that the contract of employment is a legal construction that aligns ordinary contract principles with the operational reality of subordinated work, and that the construction is contingent on the firm-shaped container within which most employment historically takes place. Deakin (2001; Deakin &amp; Morris, 2012) traces the contract of employment as a legal construct that emerged in response to nineteenth-century factory production, with subordination as its constitutive marker rather than its incidental feature. Freedland &amp; Kountouris (2011) extend the analysis with their <em>personal work nexus</em> framework, which treats personal-service relationships as a continuous category that the employee/contractor binary partitions imperfectly. Fudge (2006) examines the boundary problem from the labor-protection side: as platform work and other &ldquo;new forms of personal work&rdquo; proliferate, the binary partition produces increasing classification arbitrariness, and the response of regulators has been to extend protections by status (presumption rules, minimum-protection floors) rather than to revise the partition itself. Veitch (2021) takes the political-philosophical step further: subordination is itself a relation of asymmetric obligation that requires its own justification, and the consent supplied by the employment contract is conditioned on the absence of viable alternatives that could supply equivalent income without the subordination overlay.
                    </PaperRun>
                    <p>
                        The present argument enters this literature with a structural move it has not had occasion to make: it asks what the doctrinal test does when the firm-shaped container itself becomes economically optional in a region of transactions. The answer below is that the test does not so much fail as run out of applicants: it asks a question that has no party to be its subject when the parties to a transaction are bonded counterparties rather than employer and employee.
                    </p>
                </PaperSubsection>
                <PaperSubsection title="2.2 The Philosophical Position">
                    <p>
                        A scholarly tradition with roots in classical liberalism and in Marx, refreshed more recently by legal and political philosophers, reads the employment relationship as lying on the same continuum as older forms of property-in-persons. We summarize three representative positions; the paper does not endorse any of them, and each can be read as descriptive rather than normative.
                    </p>
                    <PaperRun title="Ellerman: the firm as rent-a-person.">
                        Ellerman (1992) argues that the employment contract is not merely economically one-sided but ontologically incoherent: it attempts to rent <em>persona</em> (the worker as legal party) on the same terms as <em>res</em> (the worker&rsquo;s labor power as object). In ordinary jurisprudence, persons cannot be rented &mdash; a doctrine that predates and survived the legal abolition of chattel slavery. The employment contract, Ellerman argues, honors the formal doctrine by contracting for labor power rather than the person, but the substance of the relation (subordination of the worker&rsquo;s conduct to another&rsquo;s authority for a defined period) exercises the same operative control. The argument is philosophical rather than legal, but it names a tension that labor law operationalizes as the employee/contractor test.
                    </PaperRun>
                    <PaperRun title="Anderson: the firm as private government.">
                        Anderson (2017) makes the complementary argument at the level of political theory. Firms exercise governmental powers over employees &mdash; mandatory schedules, speech restrictions, body surveillance, drug testing, arbitrary dismissal &mdash; that are constitutionally proscribed when exercised by the state. American political vocabulary, Anderson argues, has no term for this because the liberal tradition&rsquo;s attention to state power left the authoritarian structure of the workplace unanalyzed. The firm is a private government, and the employment relation is the governance relation within it.
                    </PaperRun>
                    <p>
                        The structural observation common to Ellerman and Anderson &mdash; that the employment relation places one party&rsquo;s conduct under another party&rsquo;s authority along an axis whose endpoints touch historical arrangements of chattel and serfdom &mdash; has been put in popular form by other writers as well. (Taleb (2018), in &ldquo;How to Legally Own Another Person,&rdquo; frames the relation as &ldquo;an employee is practically a slave&rdquo;; his register is rhetorical and not peer-reviewed, and we cite him as evidence that the observation has currency outside academic labor philosophy, not as an argument on par with Anderson and Ellerman, on whom the substantive analytical work rests.) The observation, however framed, is that the axis is subordination; the differences between historical arrangements at different points on it are quantitative. The paper does not endorse this framing as a moral claim about modern employment; we return to that scope question in the conclusion.
                    </p>
                    <PaperRun title="Subordination in two registers.">
                        The doctrinal test and the philosophical treatment just given describe the same relationship from two disciplinary vantages. The doctrinal register is direction-and-control: does the putative employer specify schedule, tools, processes, supervision, ability to work for others? The property-rights register is residual-rights allocation: does the employment contract transfer residual control rights over non-contractible decisions to an ownership nucleus separate from the productive asset? These are not competing definitions. The direction-and-control test is the <em>operational</em> face of subordination &mdash; what a court observes when assessing the relation. The residual-rights framing is its <em>structural</em> face &mdash; what a property-rights theorist sees. The two converge: a relation with high directional control is one in which residual rights have been transferred; a relation in which residual rights stay with the worker is one of low directional control. This paper uses the doctrinal register (its subject is labor law); the property-rights register belongs to firm-boundary analysis (whose subject is the boundary of the firm). The primitive dissolves both faces at once because they are faces of the same thing.
                    </PaperRun>
                </PaperSubsection>
                <PaperSubsection title="2.3 Why the Threshold Keeps Moving">
                    <p>
                        Once subordination is recognized as the variable and the employee&ndash;contractor line as a threshold placed on it, the perpetual legal contest becomes explicable. The threshold has no principled location. Any specific test produces a bright line through a continuum, and whichever side of the line a given working arrangement falls on becomes the object of rent-seeking effort by the party for whom that side is cheaper.
                    </p>
                    <ul className="list-disc pl-6 space-y-2">
                        <li>Employers push the threshold upward: reclassifying employees as contractors reduces payroll taxes, avoids benefits-attachment, eliminates collective-bargaining obligations, and removes discrimination-law exposure. Every major gig-economy platform has been the subject of litigation on this point.</li>
                        <li>Workers with bargaining power push the threshold downward: reclassification as employees unlocks minimum-wage protections, overtime, employer-funded health insurance, unemployment eligibility, and union rights. Much of AB5 was a legislative response to this pressure.</li>
                    </ul>
                    <p>
                        The threshold is not &ldquo;wrong&rdquo;; it is <em>under-specified</em>. The underlying continuum has no natural joint. As technologies of remote direction (apps, algorithms, performance dashboards) evolve, the reality of the control relation changes faster than the law can locate the threshold, which is why gig-economy cases recur across jurisdictions with broadly similar facts and broadly divergent outcomes.
                    </p>
                </PaperSubsection>
            </PaperSection>

            <PaperSection title="3. The Settlement Primitive">
                <p>
                    We summarize only the features relevant to the legal argument; the mechanism, the Solidity implementation and its formal verification, and the evidentiary framework for off-chain dispute adjudication are each developed in their own right.
                </p>
                <p>
                    The primitive composes two mechanisms whose institutional work the present argument relies on. <em>Asymmetric bonding</em> makes defection more expensive than cooperation at every bonded edge. <em>Buyer dominance with atomic resolution</em> makes the entire multi-party process resolvable from a single signature, with all orders settling together or not at all. The first mechanism removes the standing arbitrator from the bilateral case; the second removes the firm-shaped container from the <Math>{"N"}</Math>-party case. The labor-law argument below depends on both: without the first the bilateral counterparties have no self-enforcing escrow; without the second the multi-party fulfillment workflow would still require an organizing nucleus to clear all parties simultaneously, and that nucleus would inherit the subordination apparatus the primitive is supposed to retire.
                </p>
                <PaperRun title="Bonded counterparties.">
                    A transaction between two parties is consummated by dual-signed EIP-712 commitments. Each party signs from their own wallet. Each party locks collateral against their own performance &mdash; the buyer locks <Math>{"2P"}</Math>, the seller locks <Math>{"2G"}</Math> where <Math>{"G"}</Math> is the cumulative upstream value bonded in the process. Only the buyer can trigger resolution, and resolution settles every active order in the process atomically. Defection is structurally more expensive than cooperation. There is no platform between the parties, no arbitrator authorized to resolve disputes on-chain, and no admin key permitting external override.
                </PaperRun>
                <PaperRun title="What the primitive does not require.">
                    No employment relation, no subcontractor hierarchy, no master&ndash;servant agreement, no W-9 or W-2, no 1099 or P-60, no PAYE code, no <em>contrat de travail</em>. The primitive operates on parties as parties: each is a wallet address bonded against performance for a specified exchange. The direction-and-control relation that labor-law categories turn on does not exist at the primitive layer; it is replaced by the direction given by the off-chain agreement both parties sign and the bond that backs their mutual performance.
                </PaperRun>
            </PaperSection>

            <PaperSection title="4. The Wallet as Legal Subject">
                <p>
                    Roman private law distinguished <em>res</em> (things, property, objects that can be owned and alienated) from <em>persona</em> (persons, parties, subjects capable of acting legally). The distinction survived and structures modern private law: physical assets are <em>res</em>; natural persons and recognized legal persons (corporations, states, partnerships) are <em>personae</em>; the two interact through contracts of sale, lease, license, and labor.
                </p>
                <p>
                    The employment contract sits awkwardly in this structure. A worker is unambiguously a <em>persona</em>, but the employment contract treats the worker&rsquo;s labor power as <em>res</em> &mdash; a resource rented from the worker for a specified period, under the employer&rsquo;s direction. Ellerman&rsquo;s argument is that this treatment is operationally coherent only because the legal tradition has learned to overlook the <em>persona</em>/<em>res</em> boundary in this one setting. Every labor-law test for employee status is implicitly an attempt to police that boundary without naming it.
                </p>
                <PaperRun title="The wallet as collapse.">
                    A wallet in the Figaro architecture is a legal artifact that does not fit the classical categories. It is a property &mdash; a cryptographic key-pair that its holder owns and can transfer or abandon. It is simultaneously a party &mdash; it signs commitments, posts bonds, receives settlements, accrues credentials, and generates an evidence record that off-chain adjudication can consume. The wallet is the productive asset acting in its own legal name. The collapse is not metaphorical. When the party to a commitment is the wallet itself (whether operated by a natural person, a software agent, or an organizational treasury), the classical <em>persona</em>/<em>res</em> partition no longer partitions. The wallet is what it controls and it controls what it is.
                </PaperRun>
                <PaperRun title="The Hohfeldian reading.">
                    The collapse is easier to see in Hohfeldian than in Roman terms. Hohfeld (1913) disaggregated the omnibus concept of a &ldquo;right&rdquo; into four jural correlatives: right/duty, privilege/no-right, power/liability, and immunity/disability. Ownership in the property-rights tradition is a bundle of Hohfeldian incidents allocated by some legal arrangement. What the wallet in the bonded primitive holds is precisely a Hohfeldian bundle keyed to its private key: the power to commit under EIP-712 (with the correlative liability of the counterparty&rsquo;s settlement obligation), the right to receive <Math>{"\\pi_{s,i}"}</Math> or <Math>{"\\pi_{b,i}"}</Math> on resolution, the privilege of not committing, and the immunity from external override (no third party can rewrite an executed resolution; this is a Hohfeldian immunity in the strong sense). The Roman <em>persona</em>/<em>res</em> distinction is doing rough work that the Hohfeldian apparatus sharpens: the wallet is not a <em>persona</em> acting on <em>res</em>, but a Hohfeldian <em>position</em> whose incidents are held together by the cryptographic key.
                </PaperRun>
                <p>
                    The personhood literature tracks the move. Naffine (2009) taxonomizes legal personhood into three registers (P1: capacity to bear rights; P2: rational agency; P3: moral personhood); the wallet sits unambiguously in P1, contingently in P2 (depending on whether a human, an agent, or a treasury operates it), and is silent on P3 (which the kernel does not address and the off-chain forum inherits). Bayern (2014) and LoPucki (2018) have argued separately that algorithmic entities can be made to fit existing personhood doctrine through LLC-style legal scaffolding, and Fairfield (2017) has examined property-in-data and property-in-code as a related doctrinal frontier; Pasquale (2015) treats algorithmic personhood from the opacity-and-accountability side. The wallet collapses the constructs the personhood literature has been keeping separate &mdash; it is a P1 holder of Hohfeldian incidents whose seller may or may not be a P2 agent and whose moral status is a separate question.
                </p>
                <PaperRun title="Three consequences.">
                    These follow from the architecture of dual-signed bonded commitments settled directly between parties:
                </PaperRun>
                <ol className="list-[lower-alpha] pl-6 space-y-3">
                    <li><strong>Self-control is the default.</strong> A wallet cannot be <em>owned</em> by another wallet the way a <em>res</em> can be owned by a <em>persona</em>: ownership transfer requires key transfer, which is a change of control rather than a change of subject. We are careful not to collapse ownership and control: the property-rights tradition (Grossman&ndash;Hart, Hart&ndash;Moore) builds on the distinction, and this paper relocates the question rather than dissolving it. The relocation is that residual control rights over the productive capability the wallet represents are held by whoever holds the key, not by an ownership nucleus separate from the productive asset.</li>
                    <li><strong>No rental of persona.</strong> A commitment between two wallets bonds each wallet&rsquo;s performance directly. There is no construct in which one wallet&rsquo;s persona is rented to another for a defined period; each party signs for themselves, commitment-by-commitment.</li>
                    <li><strong>Credentialing is self-attached.</strong> At the protocol tier, clause-validated attestations and seller profiles attach to the wallet; at the runtime tier, NFT-anchored deeds and credentials may be layered on. A worker&rsquo;s skills, certifications, and performance history travel with the wallet, not with the employer. The resume becomes the wallet; the reference becomes an attestation.</li>
                </ol>
                <PaperRun title="A fourth consequence: the wallet is self-accounting.">
                    The Roman private-law inheritance distinguishes <em>res</em> from <em>persona</em> and keeps both separate from the <em>liber rationum</em> &mdash; the book of account in which the entity&rsquo;s dealings are recorded. A Figaro wallet collapses the first two (the <em>res</em>/<em>persona</em> collapse above); it also collapses both into the third. A Figaro process is a self-closing ledger period whose records are constituted by the protocol rather than maintained by any party. For labor-law analysis, the implication is that the wallet is not only property-and-party but also its own continuously updated book of account: the worker-as-wallet has a record of performance, attested capability, and settled compensation that travels with the wallet indefinitely. This eliminates one traditional source of asymmetry between employer and employee &mdash; the employer keeps the books, the employee does not &mdash; by making the books protocol-level and symmetrically readable.
                </PaperRun>
            </PaperSection>

            <PaperSection title="5. The Gig-Economy Cases, Re-read">
                <p>
                    The gig-economy case law can be read as a series of attempts to place the employee&ndash;contractor threshold in the face of a technology (the platform) that had engineered a new position on the subordination continuum. We re-read four landmark cases/statutes through the primitive&rsquo;s lens.
                </p>
                <PaperRun title="California AB5 (2019).">
                    AB5 codified the ABC test established in <em>Dynamex Operations West v Superior Court</em> (2018), shifting the classification default toward employee status for workers performing services in the hiring entity&rsquo;s usual course of business. The statute&rsquo;s legal force turns on the direction-and-control finding (prong A), the nature-of-work finding (prong B), and the independent-trade finding (prong C). Under the primitive, none of the three prongs are well-posed. There is no hiring entity to direct and control (prong A has no subject). There is no usual course of business for the bonded counterparty relation (prong B presupposes a firm). The bonded party is by construction independently established (prong C is trivially satisfied, by default). AB5 operationalizes a threshold that Figaro does not instantiate at all.
                </PaperRun>
                <PaperRun title="Proposition 22 (2020).">
                    Prop 22 created a statutory exception to AB5 for app-based rideshare and delivery drivers, classifying them as contractors with a specified minimum earnings guarantee and healthcare subsidy. The political coalition behind Prop 22 argued that AB5 was forcing classification into a category inappropriate for the work; the coalition against argued that the exception hollowed out AB5&rsquo;s protective purpose. Both arguments are downstream of the threshold choice. Under the primitive, Prop 22&rsquo;s carve-out is unnecessary because the category it is carving out of does not apply. The underlying question it tries to answer &mdash; how to provide minimum earnings and healthcare to workers outside the employment relation &mdash; is what we treat in Section 6 as the leveller/privatizer trade-off.
                </PaperRun>
                <PaperRun title="Uber BV v Aslam (UKSC 2021).">
                    The UK Supreme Court held unanimously that Uber drivers are <em>workers</em> &mdash; an intermediate category in UK employment law that attracts minimum wage and holiday-pay protections but not full employee rights. The Court examined the substance of the relation (algorithmic direction, tightly specified routes, rating systems, ability-to-work-for-others constraints) rather than the contractual label. The judgment is unusually clear that subordination-in-substance is the operative test. Under the primitive, the <em>Aslam</em> analysis does not run. There is no entity whose substance can be examined against the contractual label, because the primitive produces no contract between substance-behind-label and worker. A bonded counterparty signs commitment-by-commitment with the party it serves. The rating-and-algorithmic-direction apparatus that <em>Aslam</em> turned on is a platform artifact; it does not exist in the primitive.
                </PaperRun>
                <PaperRun title="EU Platform Work Directive (2024).">
                    The Directive establishes a presumption of employment for platform workers when specified criteria are met (algorithmic management, remuneration caps, appearance restrictions, tool prescriptions, supervision of work, restrictions on working for others). Member states are to implement by 2026. The Directive is the most sophisticated of the four measures: it treats platform employment as its own typological object, with a presumption rule rather than a bright-line test. Under the primitive, the Directive&rsquo;s presumption criteria have no referent &mdash; there is no platform between parties whose algorithmic management would trigger the presumption.
                </PaperRun>
                <PaperRun title="The substance-over-form rejoinder.">
                    A labor-law reader will respond with a structural objection. The doctrinal innovations of the past decade &mdash; ABC-test prong B, the <em>Aslam</em> substance-over-form analysis, the Directive&rsquo;s presumption rule &mdash; were designed precisely to defeat formal restructuring of the employment relation into the language of independent contracting. The doctrines reach behind the contractual label to the operational reality. If a bonded counterparty performs forty hours a week for a single buyer, on a schedule effectively dictated by that buyer, with rating-driven flow control producing economic dependence, then on <em>Aslam</em>-style reasoning the parties may still be in something that quacks like an employment relation regardless of how the commitments are denominated.
                </PaperRun>
                <p>
                    The objection is correct in spirit and partially correct on the facts, and this paper does not argue that Figaro defeats the substance-over-form move. We argue something narrower: that the bonded primitive enlarges the choice set of how a productive relationship can be structured, and that substance-over-form tests applied within the new choice set will reach different conclusions because the substance has changed. A worker who holds attestations from many counterparties, settles commitment-by-commitment, owns their own tooling and credentials, and is bonded against performance rather than directed by authority is not a substance-over-form employee in the sense the doctrines were drafted to capture. A worker who, by contrast, bonds against a single counterparty on terms that effectively replicate the platform-mediated arrangement may still be reached by substance-over-form analysis, and we do not argue otherwise. The regime change is in the choice set; whether any given working relationship is substantively employment-shaped remains a fact-pattern question that the applicable doctrine answers in the usual way.
                </p>
                <PaperRun title="The endogenous-platform-emergence concern.">
                    A related concern is that platforms are likely to re-emerge on top of the bonded primitive. Even with the kernel non-discretionary, surrounding layers &mdash; discoverability, dispatch, reputation aggregation, credit provision, identity vouching, key custody &mdash; will be supplied by some entity. That entity, once it reaches scale, will recreate the platform&rsquo;s economic position relative to the bonded counterparties on its layer. The substance-over-form doctrines will then have purchase against <em>that</em> entity exactly as they have purchase against existing platforms. We accept this concern without qualification. The primitive does not preclude platform-shaped intermediation at the runtime tier; it precludes it at the kernel and protocol tiers. The kernel is the layer at which the direction-and-control finding has no subject; surrounding layers that introduce direction-and-control into the working relationship remain fully subject to the doctrinal test. The architectural claim is not that subordination is impossible on top of a bonded substrate; it is that subordination is no longer architecturally required, and where it appears it appears as a runtime-tier choice the existing labor-law apparatus is well-equipped to evaluate.
                </PaperRun>
            </PaperSection>

            <PaperSection title="6. Leveller and Privatizer">
                <p>
                    The primitive is, in one register, a leveller. It eliminates a structural asymmetry in labor markets: the subordination gradient between employer and employee. Every party is bonded on the same terms; every party signs from its own wallet; no party is rented as <em>persona</em>.
                </p>
                <p>
                    The primitive is, in another register, a privatizer. The protections labor law built around the employment relation &mdash; employer-funded healthcare, employer-paid payroll taxes feeding unemployment insurance, employer pension contributions, workplace-safety inspections tied to employer status, collective bargaining structured around bargaining units within firms &mdash; are all attached to the category that the primitive removes. When employment is not the container, employment-attached protections are not delivered.
                </p>
                <PaperRun title="Asset specificity is a scope condition.">
                    The argument above presumes that the productive activity in question is the kind for which symmetric bilateral bonding is an adequate substitute for hierarchical governance. Transaction-cost economics is explicit that asset specificity continues to favor hierarchy: when a productive asset&rsquo;s value is contingent on a specific counterparty (relationship-specific human capital, co-located equipment, firm-specific tacit routine), the holdup risk lies in the pre-transaction sunk investment rather than in the transaction itself, and symmetric bonding does not neutralize that holdup &mdash; it relocates it. The class of activity for which the primitive substitutes for the firm is therefore bounded. Where asset specificity is low, or where specificity-protecting arrangements are achievable through other means (long-term peer networks, treasury communities, serial bonded-commitment patterns), the employment relation becomes optional. Where it is high, the employment relation persists for the standard transaction-cost reason.
                </PaperRun>
                <PaperRun title="Four options for the political response.">
                    We do not advocate for any of them; we name them so the trade-off is legible:
                </PaperRun>
                <ol className="list-[lower-roman] pl-6 space-y-3">
                    <li><strong>Attach protections to the wallet.</strong> Health insurance, pension contributions, income protection become benefits that the wallet itself purchases from portable providers, priced per unit of bonded activity. This is the direction Prop 22 gestured at, without the AB5 backdrop making it necessary.</li>
                    <li><strong>Attach protections to citizenship.</strong> Universal basic income, single-payer healthcare, state-funded unemployment assistance &mdash; all decouple protection from employment and re-couple it to polity membership. The social-democratic tradition has advocated this independently of Figaro; the primitive removes one historical argument against the decoupling (that employment was the natural locus because that is where most people spend most of their time).</li>
                    <li><strong>Preserve the employment option.</strong> Nothing in the primitive prevents the employment relation from continuing to exist. Firms can hire employees, employees can bargain collectively, labor law can continue to regulate the subordination region. The primitive coexists with the employment relation rather than abolishing it. The question is what fraction of productive activity moves out of that region, and at what rate.</li>
                    <li><strong>Treat employment as the asset-specificity residual.</strong> Employment continues to apply to the class of productive activity for which Williamsonian asset specificity makes hierarchical coordination the equilibrium response, and labor-law protections continue to attach to that residual domain. On this view the primitive does not compete with employment in the high-specificity region; it competes only in the low-specificity region, where employment was a second-best response to enforcement cost rather than a first-best response to specificity. The question becomes empirical: what is the asset-specificity distribution of contemporary productive activity, and what fraction lies on each side of the threshold?</li>
                </ol>
                <p>
                    The trade-off is real: each of (i)&ndash;(iv) has different distributive consequences, and the fight over which one dominates will occupy the political economy of the next several decades regardless of how the primitive diffuses. What the primitive changes is that the fight becomes explicit: the attachment of protections to employment was a historical contingency that looked like a natural fact; once the category is removable, the attachment becomes a policy choice.
                </p>
                <PaperRun title="Voluntary participation as a scope condition.">
                    The mechanism&rsquo;s equilibrium results hold under the assumption that both parties are legally and materially free to enter the bonding game &mdash; that entering is a choice, and that capital sufficient to post the required bond is available. For a labor-law analysis this assumption is load-bearing in a way it is not for the mechanism analysis itself. A worker whose only realistic income path runs through bonded assemblies, and who lacks access to the capital needed to post the required bond, faces a choice set that is not substantively voluntary in the sense the equilibrium argument presupposes. Such a worker is not freed by the substrate change; they are bonded into asymmetric capital relations that the substrate equally well supports. The primitive is symmetric in form and asymmetric in the access conditions that make use of the form possible.
                </PaperRun>
                <p>
                    The labor-law implication is that the leveller register applies fully only to the participants for whom the bonding option is substantively available, and the distributional question of how that availability is itself distributed is, in our view, the most important policy question the primitive raises. A regime that delivers symmetric form under asymmetric access produces a labor market that looks levelled at the moment of transaction and is not, in the relevant economic sense, levelled at all. Of the four options above, (ii) addresses the access asymmetry directly by uncoupling productive participation from social-protection access; (i) and (iii) leave the access asymmetry where the historical employment relation left it and propose that the bonded counterparty purchase protections from earnings; (iv) treats the asymmetric-access region as the residual-employment region and accepts the partition. The choice among them is a policy question this paper does not adjudicate, but it is the question on which the leveller-versus-privatizer reading ultimately turns.
                </p>
            </PaperSection>

            <PaperSection title="7. Conclusion">
                <p>
                    Labor law has treated subordination as an axis on which to place threshold after threshold, in each jurisdiction against each technology. The bonded settlement primitive removes the axis by removing the relation that gave it its subject matter. The employee&ndash;contractor line, the platform-worker line, the <em>worker</em> category, the <em>subordonné</em> test &mdash; all presuppose a directional control relation between two parties that the primitive does not produce. The classification problem has no classification problem.
                </p>
                <p>
                    What is left is a different set of questions, not answerable from mechanism-design first principles: what protections, if any, should attach to productive activity independent of the employment relation; which organizational patterns will absorb the productive activity that moves out of the employment relation, and how they will be regulated; how labor law&rsquo;s traditional counterparty, the state, will relate to productive activity that increasingly occurs between wallets rather than between firms and workers. These are legal-doctrinal, political-economic, and constitutional questions that the primitive poses rather than resolves.
                </p>
                <PaperRun title="A scope caveat.">
                    This paper&rsquo;s argument is diagnostic. The primitive changes what labor law is asked about; the paper says so. It does not argue that the primitive will diffuse uniformly or that employment as a legal category will disappear, nor that the disappearance of the classification problem is desirable, in whole or in part. It argues that the doctrinal terrain has changed, that legal scholarship has not yet caught up, and that whatever normative position the reader takes will be better served by engagement with the primitive on its own terms than by treating it as one more gig-economy platform to be reclassified under the existing test.
                </PaperRun>
                <PaperRun title="A note on rhetoric.">
                    We have, following Anderson and Ellerman (and, in a popular register, Taleb), used the vocabulary of &ldquo;subordination&rdquo; and &ldquo;slavery&rdquo; to describe the employment relation. The rhetorical register is deliberate but should not be mistaken for a normative claim about modern employment. Modern labor law has developed substantial protections that distinguish the employee from the serf and the serf from the slave. The axis on which these arrangements sit is structural, not moral; the primitive removes the arrangement, not the moral progress the arrangement&rsquo;s softening represented. Whether that removal is desirable is a policy question; whether it is happening is an engineering one; and the two should not be conflated.
                </PaperRun>
            </PaperSection>
        </PaperLayout>
    );
}
