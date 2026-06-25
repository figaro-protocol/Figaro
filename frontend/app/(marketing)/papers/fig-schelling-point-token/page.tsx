import type { Metadata } from "next";
import {
    PaperLayout,
    PaperSection,
    PaperRun,
    PaperRemark,
} from "@/components/papers/PaperLayout";
import { Math } from "@/components/papers/Math";

export const metadata: Metadata = {
    title: "FIG: A Schelling-Point Token — Figaro Protocol",
    description:
        "FIG is a pure focal-point token: its value is its focality, not yield, governance, fees, or settlement-coupled emission. The design is defined by what it refuses to do — each exclusion removes a reason to hold FIG that is not alignment-signaling.",
};

export default function FigSchellingPointTokenPaper() {
    return (
        <PaperLayout
            title="FIG: A Schelling-Point Token"
            subtitle="for the Figaro Coordination Ecosystem"
            author="Alessandro Daliana"
            date="April 2026"
            watermark="Figaro Protocol · Preprint"
            keywords="cryptoeconomics, Schelling point, focal-point coordination, token design, coordination token, supply integrity, decoupled emission"
            abstract={
                <>
                    <p>
                        We describe FIG, the coordination token that ships alongside the Figaro settlement primitive. FIG is designed as a <em>Schelling-point token</em> in the sense of Schelling (1960): a focal point around which participants in the Figaro ecosystem can coordinate without central authority or explicit agreement. Its value as a coordination artifact derives from its focality, not from any on-chain utility function, yield stream, governance claim, or fee path.
                    </p>
                    <p>
                        This framing inverts the usual design question for a new token. Rather than asking &ldquo;what does FIG <em>do</em>?&rdquo; we ask &ldquo;what would FIG have to <em>not</em> do in order to remain a credible focal point?&rdquo; The answer produces a catalogue of design exclusions, each of which removes a class of holding motivation that would dilute the purity of FIG&rsquo;s signaling value. FIG is not governance, not yield-bearing, not a fee path, not bond collateral for the kernel, not settlement-emitted, and not founder-vested. Each negative preserves focality by removing a reason to hold FIG that is not &ldquo;I am signaling alignment with the Figaro ecosystem.&rdquo;
                    </p>
                    <p>
                        The positive design content is modest and targeted: a fixed one-billion-unit cap enforced by two complementary supply-integrity mechanisms, a one-way deployer-renouncement latch that freezes the allocation plan at deployment, and a single staged-merkle airdrop that distributes 60% of supply to clause-author cohorts at years 2, 5, and 9. We lay this design out in detail, reject an earlier settlement-anchored &ldquo;Euler oscillation&rdquo; design for the focality-destroying reasons it introduced, and close with an honest analysis of how FIG can lose its focal-point status and what the design does and does not defend against.
                    </p>
                    <p>
                        The paper sits within a lineage. Nakamoto (2008) demonstrated that money could be a protocol rather than an institution, with BTC as the focal Schelling point for a peer-to-peer cash system. Buterin (2014) demonstrated that contracts could be composable, with ETH as the focal point for programmable settlement. The present work extends the lineage one step: <em>institutions</em> themselves become composable through the Figaro primitive, and FIG is the focal point for participants who coordinate around the composition.
                    </p>
                </>
            }
            references={
                <>
                    <li>Bacharach, M. <em>Beyond Individual Choice: Teams and Frames in Game Theory</em>, edited by N. Gold and R. Sugden. Princeton University Press, Princeton, NJ, 2006.</li>
                    <li>Buterin, V. Ethereum: A Next-Generation Smart Contract and Decentralized Application Platform. White paper, 2014.</li>
                    <li>Buterin, V. Credible Neutrality As A Guiding Principle. nakamoto.com, 2020.</li>
                    <li>Hayek, F. A. The Use of Knowledge in Society. <em>American Economic Review</em>, 35(4):519&ndash;530, 1945.</li>
                    <li>Markey-Towler, B. Anarchy, Blockchain and Utopia: A Theory of Political-Socioeconomic Systems Organised Using Blockchain. <em>Journal of the British Blockchain Association</em>, 1(1):1&ndash;14, 2018.</li>
                    <li>Mehta, J., Starmer, C., &amp; Sugden, R. The Nature of Salience: An Experimental Investigation of Pure Coordination Games. <em>American Economic Review</em>, 84(3):658&ndash;673, 1994.</li>
                    <li>Nakamoto, S. Bitcoin: A Peer-to-Peer Electronic Cash System. White paper, 2008.</li>
                    <li>Schelling, T. C. <em>The Strategy of Conflict</em>. Harvard University Press, Cambridge, MA, 1960.</li>
                    <li>US Securities and Exchange Commission. <em>Framework for &ldquo;Investment Contract&rdquo; Analysis of Digital Assets</em>. SEC Strategic Hub for Innovation and Financial Technology, April 3, 2019.</li>
                    <li>Selgin, G. A. <em>The Theory of Free Banking: Money Supply Under Competitive Note Issue</em>. Rowman &amp; Littlefield, Totowa, NJ, 1988.</li>
                    <li>Sugden, R. A Theory of Focal Points. <em>Economic Journal</em>, 105(430):533&ndash;550, 1995.</li>
                </>
            }
        >
            <PaperSection title="1. Introduction">
                <p>
                    FIG is the native token that ships alongside the Figaro settlement primitive. This paper describes its design and defends a specific framing of what it is. The framing is the substantive contribution; the supply-integrity and distribution mechanics follow from it.
                </p>
                <p>
                    The framing: <em>FIG is a Schelling-point token for the Figaro ecosystem.</em> Its value to participants is not a claim on protocol revenue (there is no protocol fee), not a governance vote (the kernel has no governance), not a yield stream (no activity-coupled emission), not a utility token purchasable for on-chain services (there are no protocol-layer services that require it), and not bond collateral (the kernel is token-agnostic). Its value is its focality: in the sense of Schelling (1960), FIG is the focal point that Figaro-aligned participants converge on when they want to signal alignment without coordinating through a central authority.
                </p>
                <PaperRun title="A lineage note.">
                    The design pattern has precedent. Nakamoto&rsquo;s (2008) Bitcoin is, in retrospect, the clearest example of a Schelling-point token at the money layer: its value as a store of value derives from holders converging on it as <em>the</em> answer to the question &ldquo;what digital bearer asset are we coordinating around?&rdquo; The proof-of-work mechanism secures Bitcoin&rsquo;s ledger, but it does not manufacture Bitcoin&rsquo;s Schelling-point status &mdash; that emerged from participant convergence under conditions in which Bitcoin&rsquo;s design made convergence viable (fixed supply, open participation, no issuer). Buterin&rsquo;s (2014) Ethereum moved the logic up one layer: ETH became the focal point for programmable settlement, with composable contracts as the substrate. The present work moves it up again: with Figaro, institutions themselves are composable, and FIG is the focal point for aligned participation in that composition. Each layer&rsquo;s native token has the same structural role &mdash; a focal coordination anchor that does not require a central issuer, does not require a governance apparatus, and cannot be replicated by a general-purpose token, because the signal it provides is specifically about alignment with that particular ecosystem. Each layer&rsquo;s token is also underpinned by a different primary economic quantity &mdash; Bitcoin by the cost of producing the asset, Ethereum by the demand for executing transactions, FIG by the trade conducted through the substrate (Section 3). Of the three, FIG&rsquo;s underpinning sits closest to where actual economic value is created, because trade is where it is created.
                </PaperRun>
                <PaperRun title="Paper organization.">
                    Section 2 introduces Schelling-point tokens as a design category and locates FIG within it. Section 3 argues why the Figaro ecosystem is well-suited to a focal-point native token rather than a utility-coupled one. Section 4 articulates design rules that support focal-point emergence and resist focality-dilution. Section 5 develops supply integrity. Section 6 develops allocation. Section 7 develops the staged-merkle airdrop. Section 8 catalogues the design exclusions and ties each to the focality property it preserves. Section 9 records the rejection of an earlier settlement-anchored &ldquo;Euler oscillation&rdquo; design. Section 10 treats bootstrap and attack surface. Section 11 retains the scope note on substrate-neutrality and distributional silhouette. Section 12 states the supply-integrity guarantees. Section 13 treats regulatory framing. Section 14 concludes.
                </PaperRun>
            </PaperSection>

            <PaperSection title="2. Schelling-Point Tokens as a Design Category">
                <p>
                    Schelling (1960) identified <em>focal points</em> (what later came to be called Schelling points) as solutions that parties tend to choose in the absence of explicit communication, because some feature of the solution makes it stand out as the natural coordination target. Schelling&rsquo;s canonical example: if two parties are told to meet in New York City without being able to communicate, a disproportionate fraction converge on Grand Central at noon. Neither the location nor the time is more rational than any other; what makes them focal is a shared cultural salience that each party correctly expects the other to recognize.
                </p>
                <PaperRun title="The focal-point literature, briefly.">
                    The conceptual machinery is older and more developed than the crypto-token literature usually engages. Schelling (1960) introduced focal points as a coordination phenomenon and observed the empirical fact that humans converge on salient solutions without communication. Sugden (1995) formalized the phenomenon as <em>salience theory</em>: parties pick the option that stands out by some shared frame of reference, and the salience is itself constructed through repeated coordination on similar problems. Mehta, Starmer, &amp; Sugden (1994) produced the canonical experimental confirmation that focal-point convergence operates robustly across populations on a wide range of pure-coordination problems. Bacharach&rsquo;s (2006) <em>team reasoning</em> formalized the further step that focal points operate not because each party reasons about the other&rsquo;s reasoning but because both parties shift to a we-frame in which the salient solution is the team-rational choice. The combined apparatus gives a precise account of what makes a token focal: it is not the token&rsquo;s properties in isolation but the token&rsquo;s properties as picked out by a shared frame within which holding the token is recognizable as a coordination act.
                </PaperRun>
                <PaperRun title="The cryptoeconomic application.">
                    The cryptoeconomic literature has applied the apparatus repeatedly without always citing it. Markey-Towler (2018) examines tokens as Schelling points in a behavioral-economics register; Buterin (2020) on <em>credible neutrality</em> articulates the design discipline for tokens whose focality is to be sustained over time. The classical economic-theory antecedents worth naming are Hayek (1945) on the distributed-coordination role of prices (a non-token analogue of the focal-point function) and Selgin (1988) on the emergence of focal monetary instruments without central authority.
                </PaperRun>
                <PaperRun title="Crypto and Schelling points.">
                    The structure has been rediscovered repeatedly in crypto design. Nakamoto (2008) did not use the word &ldquo;Schelling,&rdquo; but Bitcoin&rsquo;s emergence as a store of value followed the logic precisely: a fixed-supply, non-upgradable, issuer-less digital bearer asset with a peer-to-peer monetary intent. No mechanism guarantees Bitcoin&rsquo;s store-of-value status; it emerged because the design made focal convergence viable and participants converged. Buterin (2014) extended the logic up a layer: ETH became the focal settlement unit for programmable contracts, for the same reason &mdash; the design made convergence viable (gas-required, ubiquitous across contracts, issuer-less at the base layer). Similar focal patterns have emerged for subsidiary positions within crypto: Uniswap as the focal automated market maker, Aave as the focal lending protocol, Lido as the focal liquid-staking wrapper. In each case the token has some utility, but a substantial fraction of its holding behavior is Schelling convergence on &ldquo;the token that represents alignment with this particular primitive.&rdquo;
                </PaperRun>
                <PaperRun title="Schelling tokens vs. utility tokens.">
                    A pure utility token is valued for the services a holder can purchase with it (gas, access, data). A pure governance token is valued for the votes it conveys. A pure yield-bearing token is valued for the cash flows it represents. A Schelling-point token is valued for something different: its <em>focality</em>, which is a coordination property, not a cash-flow property or a rights property. A participant holds a Schelling-point token because holding it makes them legible to other aligned participants and because the shared holding constitutes the coordination itself.
                </PaperRun>
                <p>
                    Pure Schelling-point tokens are rare because most token designs add utility or governance features to create additional demand drivers. Each such addition, however, introduces holders whose reason for holding is <em>not</em> focal alignment &mdash; governance speculators, yield farmers, utility arbitrageurs &mdash; and these holders&rsquo; presence dilutes the focality signal. Bitcoin&rsquo;s focality is durable partly because Bitcoin has <em>remained</em> a pure Schelling point by refusing to add governance or yield or utility features beyond the base-layer payment rail. Each refused feature protects the signal&rsquo;s purity.
                </p>
                <PaperRun title="FIG&rsquo;s design category.">
                    FIG is designed to sit in the pure-Schelling-point category. The design is committed to refusing utility couplings, governance rights, yield streams, and fee paths. The rest of this paper develops what that refusal looks like in practice.
                </PaperRun>
            </PaperSection>

            <PaperSection title="3. Why the Figaro Ecosystem Is Well-Suited to a Focal-Point Token">
                <PaperRun title="What underpins FIG&rsquo;s value, said honestly.">
                    A Schelling-point token requires focal convergence, and focal convergence is itself a value-formation mechanism in the strict sense: a holder values the token because other aligned holders value it for the same reason, and the shared recognition is what gives the token its content. We need to be careful here, because earlier framings (and the adjacent crypto literature broadly) have invited a misreading that conflates focal convergence with mechanism-coupled token demand. The two are different and should be kept apart.
                </PaperRun>
                <p>
                    The standard lineage &mdash; Bitcoin underpinned by the cost of proof-of-work, Ethereum underpinned by gas demand, FIG underpinned by trade &mdash; is rhetorically tidy and mechanically misleading. Bitcoin and Ethereum each have a <em>mechanism-coupled</em> demand source: Bitcoin&rsquo;s proof-of-work issuance consumes real factors and puts a marginal-cost floor under issuance; Ethereum&rsquo;s gas requirement makes ETH necessary for any transaction on the Ethereum L1, with EIP-1559 burn reinforcing the floor. FIG has neither. The Figaro kernel uses any ERC-20 as its bond and payment currency; a participant who settles every bonded commitment in <code>USDC</code> pays zero FIG, contributes zero FIG-denominated demand, and the kernel is indifferent to their choice. Saying FIG is &ldquo;underpinned by trade&rdquo; in the way Bitcoin is underpinned by proof-of-work elides this asymmetry and overstates the case.
                </p>
                <p>
                    FIG is a <em>pure focal-point token</em> in the sense Section 2 defined. Its value derives from the focal-convergence mechanism alone &mdash; aligned holders recognize FIG as the coordination anchor for the Figaro-ecosystem question, and the coordination is itself the token&rsquo;s content. There is no settlement coupling, no gas coupling, no fee path that routes ecosystem activity through FIG-denominated demand. We do not introduce one, and the design rules of Section 4 below explicitly forbid us from doing so.
                </p>
                <p>
                    This is a more honest version of the standard lineage claim, and we think it is also the correct version. FIG occupies a different category from Bitcoin and Ethereum, not a homologous position in the same category. Bitcoin and Ethereum are tokens whose mechanism-couplings happen to support focal convergence on top; FIG is a token whose focal convergence is the mechanism, with no coupling beneath it. The question is whether such a category can sustain value, and the answer is uncertain in the way any pure coordination phenomenon is uncertain: focality can be sustained through participant convergence, can be diluted by holders whose reason to hold is not focal alignment, and can be lost altogether if the convergence breaks. The design discipline below is the work of keeping the convergence intact.
                </p>
                <p>
                    A reader sympathetic to the cost-of-production or transaction-demand framings should understand the present paper as conceding their mechanical correctness and arguing that they do not apply to FIG, rather than claiming FIG sits in the same category. The trade-volume of the Figaro ecosystem is a useful public signal of the ecosystem&rsquo;s health, and a holder of FIG may correctly expect that ecosystem health correlates with the maintenance of focal alignment, but the correlation is reflexive (held together by participant belief) rather than mechanical (held together by required-token-flow). Reflexive value is real and durable when the focality is durable; it is not the same thing as cost-floor or fee-floor value.
                </p>
                <PaperRun title="Why a general-purpose token cannot carry this signal.">
                    The Figaro kernel is token-agnostic. Any ERC-20 can serve as the bond and payment currency for a bonded commitment. The kernel does not need a native token to function, and FIG does not interact with the kernel in any equilibrium-relevant way. Why, then, have a native token at all?
                </PaperRun>
                <p>
                    The answer is that multi-party coordination in an ecosystem without central authority requires a coordination signal that does not depend on any central authority, and no general-purpose token provides that signal. Participants bond in <code>USDC</code> when they want legal-system alignment; in a DAO governance token when they want community membership in that DAO; in <code>ETH</code> when they want to denominate in the base settlement unit; in a commodity-backed token when they want value anchoring. None of these signals <em>Figaro-ecosystem alignment specifically</em>. A general-purpose token carries many signals; what distinguishes them cannot be inferred from the token.
                </p>
                <p>
                    A focal-point token that signals Figaro alignment <em>only</em>, and whose design forbids any other reading of the holder&rsquo;s motivation, provides a coordination instrument the ecosystem does not otherwise have. This instrument is useful in two distinct settings.
                </p>
                <PaperRun title="Finding aligned counterparties.">
                    A participant designing a new Figaro assembly (a bonded workflow composed from protocol components) wants to find counterparties who understand the protocol, operate in its idiom, and will engage constructively with its equilibrium discipline. Searching for such counterparties by settlement history is possible but expensive &mdash; one must read the chain. Searching by FIG holding is cheaper: a participant who holds FIG has declared alignment through the specific act of acquiring a token whose only plausible reason to acquire is alignment.
                </PaperRun>
                <PaperRun title="Signaling alignment in contested contexts.">
                    Participants who want to declare Figaro-aligned participation in adjacent debates &mdash; regulatory, academic, industry &mdash; benefit from a token whose holding is unambiguous. A founder who accepts FIG in lieu of other compensation signals more than a founder who accepts <code>USDC</code>. Not every participant needs this signal; those who do benefit from the existence of a focal coordination anchor that has no financial pretext.
                </PaperRun>
                <p>
                    These use cases are modest. We do not claim FIG is indispensable or that the ecosystem fails without it. We claim only that a focal-point token has a coordination function unavailable to general-purpose tokens, and that a cohort of participants will find the function useful.
                </p>
            </PaperSection>

            <PaperSection title="4. Design Rules for a Focal-Point Token">
                <p>
                    Supporting focal-point emergence is not the same as manufacturing it. A designer cannot declare that a token is a Schelling point; focality emerges from participant convergence or it does not. What the designer can do is remove features that would make convergence implausible or fragile, and add features that make convergence stable once it starts. We articulate four design rules.
                </p>
                <PaperRun title="Rule 1: Pure signaling.">
                    The token must carry <em>one</em> unambiguous reason to hold it. Holders should be alignment-signalers, not yield-chasers, governance-speculators, utility-arbitrageurs, or fee-path-optimizers. Features that would introduce non-alignment holders are forbidden. This is the most restrictive rule and generates most of FIG&rsquo;s catalogue of exclusions (Section 8).
                </PaperRun>
                <PaperRun title="Rule 2: Predictable supply.">
                    Focality is fragile under surprise inflation. A holder who believes supply is fixed may exit on learning it is not. FIG&rsquo;s supply schedule is committed at deployment and cannot be modified: 1B hard cap, staged airdrop with immutable per-tranche roots and immutable calendar unlocks, one-way deployer-renouncement at the end of the deploy transaction. There are no surprise-inflation paths available to any actor after deployment.
                </PaperRun>
                <PaperRun title="Rule 3: Clean distribution.">
                    Focality is fragile under highly concentrated ownership. If a single holder can dump enough supply to destabilize the price, Schelling convergence is less credible. FIG&rsquo;s allocation is 60% to a clause-author cohort (the staged airdrop), 30% to a treasury with an ecosystem mandate (the DAO), and 10% to founders. The concentration is higher than ideal for focality (the DAO + founder share is 40%), which we address honestly in Section 10 and in the distributional-silhouette concession in Section 11.
                </PaperRun>
                <PaperRun title="Rule 4: Absence of protocol-activity coupling.">
                    Focality requires that participants hold for alignment reasons. If the token&rsquo;s supply is a function of protocol activity, holders acquire the token by doing things that are not alignment (gaming the emission curve, wash-trading for rewards), and the signal is muddied. Activity-coupled emission is ruled out. We develop the argument at length in Section 9, where we describe an earlier FIG design that used settlement-anchored emission and explain why we rejected it on focality grounds.
                </PaperRun>
            </PaperSection>

            <PaperSection title="5. Supply Integrity">
                <p>
                    FIG has a fixed maximum supply of <Math>{"10^9"}</Math> units (one billion). The supply ceiling is enforced by two distinct mechanisms operating at different times.
                </p>
                <PaperRun title="Per-mint enforcement (run-time).">
                    Every individual mint is checked at the moment it executes: a mint that would carry total supply above the one-billion ceiling is rejected, atomically and with no reentrant path around the check.
                </PaperRun>
                <PaperRun title="Pre-registration enforcement (deploy-time).">
                    Beyond the per-mint check, the design maintains an aggregate registered cap &mdash; the sum of the mint allowances granted to every authorized minter. A new minter cannot be registered if doing so would push the aggregate registered cap above the one-billion ceiling. The entire allocation plan is therefore committed to the <Math>{"10^9"}</Math> ceiling <em>before any token is minted</em>.
                </PaperRun>
                <p>
                    The pair (per-mint + pre-registration) is stronger than either alone in the focality frame: per-mint enforcement catches cap overruns that survive bugs; pre-registration enforcement puts the allocation plan on chain where a focality-assessing participant can read it directly rather than relying on off-chain narrative.
                </p>
                <p>
                    <span className="font-semibold text-ink-heading">The renouncement latch. </span>
                    FIG carries a one-way renouncement latch &mdash; a flag the original deployer can set exactly once, irreversibly. Once renouncement is set, no further minter can be registered and the deployer&rsquo;s own mint authority is extinguished. The deployment registers exactly two minters &mdash; the deployer wallet (cap <Math>{"4 \\times 10^8"}</Math>, used for the genesis mint) and the airdrop mechanism (cap <Math>{"6 \\times 10^8"}</Math>) &mdash; and then trips the renouncement latch as the final act of the deployment transaction. After that transaction completes:
                </p>
                <ul className="space-y-1 list-disc pl-6 text-sm">
                    <li>the aggregate registered cap equals <Math>{"10^9"}</Math> exactly;</li>
                    <li>the deployer has minted exactly <Math>{"4 \\times 10^8"}</Math> to the designated founder and DAO wallets;</li>
                    <li>only the airdrop mechanism retains residual mint authority, capped at <Math>{"6 \\times 10^8"}</Math>;</li>
                    <li>no path exists to register additional minters.</li>
                </ul>
                <p>
                    The supply schedule is therefore frozen by a single transaction, and the contract has no further &ldquo;governance moments&rdquo; available to anyone &mdash; not to the deployer, not to the DAO, not to any future upgrade proposal. In focality terms: a participant assessing FIG at time <Math>{"t > t_{\\text{deploy}}"}</Math> can verify on chain that no further minting will occur beyond the airdrop schedule. Focal convergence is not destabilized by uncertainty about supply.
                </p>
            </PaperSection>

            <PaperSection title="6. Allocation: 10 / 30 / 60">
                <p>The total supply is split:</p>
                <ul className="space-y-1 list-disc pl-6 text-sm">
                    <li><strong>Founder</strong> &mdash; 10% (100M) &mdash; genesis mint, no vesting, no unlock.</li>
                    <li><strong>DAO</strong> &mdash; 30% (300M) &mdash; genesis mint, no vesting, no unlock.</li>
                    <li><strong>Airdrop</strong> &mdash; 60% (600M) &mdash; three-stage merkle, years 2 / 5 / 9.</li>
                </ul>
                <PaperRun title="Founder allocation (10%).">
                    A modest founder share, by contemporary norms. The non-vesting choice is deliberate: a vesting cliff is a tacit promise of future voting alignment or schedule-driven holding, both of which would be reasons to hold FIG other than alignment signaling. Releasing the founder allocation at genesis exposes the founder to whatever market consequences attach to early sale; the structural observation is that an unvested founder forgoes an asymmetric option (sell into early demand if it materializes; ride out the vesting if it does not) that a vested founder retains, and we have chosen to forgo the option. The prior question &mdash; whether founder allocation at this magnitude is the right allocation at all &mdash; is a political-economy question we do not attempt to answer in a cryptoeconomic paper.
                </PaperRun>
                <PaperRun title="The bootstrap-dump scenario.">
                    A fair objection to the no-vesting choice is the bootstrap-dump scenario: between genesis (year 0) and the year-2 first airdrop stage, the founder cohort holds a 10% liquid position and the focal-point convergence has not yet had time to establish the Schelling stickiness that would make later dump events self-correcting. A founder dump in this window could foreclose focality emergence by signaling to potential aligned holders that the alignment is not credibly committed. The Section 10 attack-surface analysis treats general dump attacks but does not specifically address the bootstrap window where the structural defenses are weakest.
                </PaperRun>
                <p>
                    The honest answer is that the design has accepted this risk rather than mitigated it through vesting. Two reasons. First, vesting would import the same focality-dilution problem the non-vesting choice was designed to avoid: a founder who must vest will be a holder for schedule-driven reasons that are not alignment, and the schedule itself becomes a Schelling object that competes with the underlying alignment signal. Second, a public lock-up commitment outside a vesting contract &mdash; e.g., self-custody with stated non-sale intent for a specified window &mdash; is available to a founder who wishes to mitigate the bootstrap risk through credible signal rather than through mechanism. We have not committed to a specific lock-up window here because the signal&rsquo;s content depends on the founder&rsquo;s standing relationship with the participant cohort rather than on a contractual instrument; the appropriate commitment is a matter for the founders to make publicly and is not a property of the protocol itself.
                </p>
                <PaperRun title="DAO allocation (30%).">
                    A treasury share, available immediately at genesis. The DAO is not a kernel-governance body &mdash; there is no kernel governance to be done &mdash; but a coordination treasury for ecosystem activity (grants, public goods, reference implementations). Releasing the DAO allocation at genesis means the treasury is operational from day one. A fair objection: doesn&rsquo;t a liquid 30% treasury with an ecosystem-grants mandate create exactly the reflexivity that Section 9 rejects in the Euler design, and doesn&rsquo;t it dilute FIG&rsquo;s focal-point purity (Rule 1)? We concede the objection in its general form. The defense is narrower than the objection implies: the coupling the Euler design introduces is <em>mechanism-level</em> (a deterministic on-chain function from settlement count to mint), while the coupling a treasury introduces is <em>policy-level</em> (a human-discretionary function from treasury governance to disbursement). Mechanism-level coupling is what the kernel&rsquo;s no-escape-hatches design principle rules out; policy-level coupling is attenuated by two layers of friction (off-chain discretion, revocable grants). The distinction is principled but not absolute: a sufficiently mechanical grant policy would reintroduce the coupling, which is why the DAO&rsquo;s operating procedures are themselves a design artifact that warrants its own treatment rather than a silent assumption.
                </PaperRun>
                <PaperRun title="Airdrop allocation (60%).">
                    The majority share, allocated over a calendar window with declining per-stage size. The structure is designed to (a) reach clause-author participants, (b) reward sustained substrate contribution (longer-window cohorts at year 5 and year 9), and (c) avoid the &ldquo;dump-on-launch&rdquo; dynamic of single-event airdrops by spreading the supply emission over a 9-year horizon. The recipients and amounts within each stage are decided by the clause-author substrate-broadening formula, computed retroactively over settled on-chain history; the allocation is not a generic user airdrop.
                </PaperRun>
                <p>
                    The 50/33/17 internal split of the airdrop (300M at year 2, 200M at year 5, 100M at year 9) is front-loaded for the bootstrap reason: the network needs substrate contributors more in its early years than in its mature years. The declining schedule encodes that asymmetry into the supply.
                </p>
                <PaperRun title="A note on the specific percentages.">
                    The 10/30/60 split and the internal 50/33/17 staging of the airdrop reflect a design judgment rather than a first-principles derivation. Any front-loaded schedule (45/35/20, 40/40/20, 50/30/20) would satisfy the bootstrap argument above, and the specific weights are a calibration we do not attempt to justify beyond &ldquo;plausible under the stated principles.&rdquo;
                </PaperRun>
            </PaperSection>

            <PaperSection title="7. Cohort-Based Distribution via Staged Merkle">
                <p>
                    The 600M airdrop is realized by a single staged-merkle airdrop mechanism with three immutable stages. Each stage carries an immutable unlock time; the per-stage merkle root is submitted at tranche time, gated by verification of a zero-knowledge proof attesting that the root correctly aggregates the clause-author substrate-broadening formula. Per-stage root submission is one-shot &mdash; a root cannot be replaced once committed. There is no privileged path to add a stage, extend the schedule, or modify a cohort.
                </p>
                <PaperRemark title="On the move from baked to submitted roots.">
                    An earlier candidate design baked the three merkle roots into the constructor alongside the unlock times. That shape was retired once the clause-author substrate-broadening aggregation matured: a tranche&rsquo;s recipients depend on settlement history that does not exist at deploy time (the year-9 window is empty at year 0), so pre-deploy root computation became inadequate. The roots are now computed and submitted per tranche, behind a proof that the canonical formula was applied to the supplied window.
                </PaperRemark>
                <PaperRun title="Single mechanism, three stages.">
                    An earlier candidate design used three separate airdrop mechanisms. The single-mechanism design is preferred for two reasons. First, surface area: a single mechanism is a single audit target, a single verification surface, and a single locus of state. Second, atomic-deploy guarantees: the airdrop&rsquo;s <Math>{"6 \\times 10^8"}</Math> cap is registered before the renouncement latch is tripped, and a single mechanism makes that cap binding atomic.
                </PaperRun>
                <PaperRun title="Leaf format.">
                    The merkle leaf binds an (account, amount) pair under the canonical hashing format in common use. Choosing a non-canonical leaf format would have required custom tooling per off-chain proof generator and a corresponding audit cost; we accept the canonical choice.
                </PaperRun>
                <PaperRun title="One-shot per (stage, address).">
                    Each (stage, address) pair is marked claimed on a successful claim and checked on every entry. A given account can claim at most once per stage. No top-up, no re-claim, no rebate.
                </PaperRun>
                <PaperRun title="Calendar-based unlock.">
                    The unlock timestamps are calendar-based (Unix epoch seconds), not activity-based. Tying unlocks to settlement activity would re-introduce a coupling between protocol use and token availability &mdash; the category Rule 4 forbids. Calendar timing has the additional virtue of being predictable to all parties at deploy time, which supports focal-point clarity.
                </PaperRun>
            </PaperSection>

            <PaperSection title="8. Design Exclusions as Focality Preservers">
                <p>
                    The cryptoeconomic content of FIG is largely defined by what the design excludes. We catalogue the exclusions and tie each explicitly to the focality property it preserves. With the Schelling-point framing the reasons become unified: each exclusion removes a class of holder whose reason for holding FIG would be something other than alignment signaling.
                </p>
                <PaperRun title="FIG is not a governance token.">
                    The kernel has no governance surface to vote on. Adding a governance role to FIG would introduce governance speculators &mdash; participants who hold FIG because they want to vote on proposals, not because they want to signal alignment. This would dilute the signal by populating the holder set with non-alignment holders. Refusing governance preserves the signal&rsquo;s purity (Rule 1).
                </PaperRun>
                <PaperRun title="FIG is not yield-bearing.">
                    The kernel takes no protocol fee; there is no fee pool to distribute. A stake-and-earn mechanism would introduce yield farmers &mdash; participants who hold FIG for expected cash flow, not for alignment. Refusing yield preserves the signal&rsquo;s purity (Rule 1) and also preserves the activity-decoupling (Rule 4), since yield mechanisms are typically indirectly coupled to protocol activity.
                </PaperRun>
                <PaperRun title="FIG is not a fee path.">
                    Even if a future runtime layer above the kernel introduces a fee mechanism, that fee is not denominated in FIG. A fee-denomination role would introduce utility arbitrageurs &mdash; participants who acquire FIG to pay fees, not to signal alignment. The signal would be muddied by transactional holders.
                </PaperRun>
                <PaperRun title="FIG is not bond collateral for the kernel.">
                    The kernel&rsquo;s bonds are denominated in whatever ERC-20 the parties choose. Making FIG the preferred bond denomination would introduce collateral demand that distorts price discovery and couples FIG to kernel activity through the back door. Refusing this role keeps the kernel token-agnostic and preserves FIG&rsquo;s focal-signal purity.
                </PaperRun>
                <PaperRun title="FIG is not founder-vested.">
                    The 10% founder allocation and the 30% DAO allocation are unvested. There is no cliff, no schedule, no time-locked vesting contract. Vesting would introduce schedule-driven holders &mdash; participants who hold FIG because they will receive more in the future, not because they are signaling current alignment. The vested-founder case is the clearest instance: a founder vesting into liquidity over four years holds FIG during that period for mixed reasons, only one of which is alignment.
                </PaperRun>
                <PaperRun title="FIG is not settlement-emitted.">
                    There is no path from kernel activity (commit, resolve, attest) to FIG mint. The batch-verification layer that aggregates settlement evidence is explicitly not a registered minter and will never be: it is never granted mint authority at deployment, and the renouncement latch ensures it cannot be added later. This refusal is the most rigorous application of Rule 4 and is worth its own section (Section 9).
                </PaperRun>
                <PaperRun title="FIG is not a coordinator-pattern extension.">
                    A <em>coordinator pattern</em> for protocol composition specifies four sufficient conditions under which a mechanism composed with the kernel preserves the bonding equilibrium. FIG satisfies these conditions trivially: it has no kernel interaction at all. FIG and the kernel are siblings, not a composition.
                </PaperRun>
            </PaperSection>

            <PaperSection title="9. Rejected Design: Euler-Oscillation Emission">
                <p>
                    An earlier iteration (preprint draft, February 2026) included a settlement-anchored emission mechanism we called <em>Euler oscillation</em>: a settlement-count-decayed cosine modulation on top of a halving envelope, with seller-only emission at resolution time. Three properties motivated it: persistent bootstrap subsidy, partial wash-trade resistance, and seasonal coordination through a <Math>{"1.5\\times"}</Math> peak rate.
                </p>
                <p>
                    We rejected it. The rejection deepens under the Schelling-point frame. In the prior draft we listed three reasons: reflexivity, partial-but-not-eliminative wash-trade defense, and oscillation-pattern speculation. The Schelling-point frame reveals a more fundamental reason: activity-coupled emission <em>destroys focal-point status</em> by introducing holders whose reason for acquiring FIG is not alignment.
                </p>
                <PaperRun title="The focality argument, formally.">
                    Under Euler emission at rate <Math>{"r(n)"}</Math> with settlement-count decay and seller-only payout, a participant who settles a process through the kernel acquires FIG. The acquisition is triggered by the settlement event, not by a decision to signal alignment. After acquisition, the holder has FIG in their wallet &mdash; but the token-in-wallet does not distinguish &ldquo;holder of FIG by alignment choice&rdquo; from &ldquo;holder of FIG because an Euler function happened to pay me.&rdquo; In the Schelling-point frame, these are two distinct populations whose signals interfere. A third party looking at the distribution of FIG holders cannot read focal alignment from the distribution because the distribution mixes two holder populations.
                </PaperRun>
                <p>
                    This is distinct from the reflexivity argument (which points at a decision-coupling between settlement choice and emission expectation) and the wash-trade argument (which points at a gameable payoff structure). It is a more fundamental point about what a token <em>means</em> under each design. Activity-coupled emission makes the token mean two things at once; pure airdrop distribution makes it mean one thing.
                </p>
                <PaperRun title="The wash-trade inequality, for completeness.">
                    Let the prevailing FIG/currency exchange rate be <Math>{"\\phi"}</Math>, let the seller-only emission rate at settlement count <Math>{"n"}</Math> be <Math>{"r(n)"}</Math>, let gas per cycle be <Math>{"g"}</Math>, and let the process duration be <Math>{"T"}</Math> with opportunity cost of capital <Math>{"\\rho"}</Math> per unit time. A wash-trader bonds both sides: buyer posts <Math>{"2P"}</Math>, seller posts <Math>{"2P"}</Math>, total locked <Math>{"4P"}</Math> for <Math>{"T"}</Math>, seller receives <Math>{"r(n)"}</Math> FIG at resolution. The cycle is profitable iff
                </PaperRun>
                <div className="my-3 overflow-x-auto">
                    <Math display>{"\\phi \\cdot r(n) \\;>\\; \\rho \\cdot 4P \\cdot T \\;+\\; g."}</Math>
                </div>
                <p>
                    Seller-only emission doubles the capital requirement from <Math>{"2P"}</Math> to <Math>{"4P"}</Math> but does not drive the inequality to infeasibility. The parameter region where wash-trading is infeasible is non-empty but not universal. This was a secondary reason to reject Euler; the primary reason was the focality-destroying mixing of holder motivations above.
                </p>
                <PaperRun title="What we kept.">
                    The 600M airdrop bucket, the staged structure (now realized via calendar unlocks rather than settlement counts), and the design intent of distributing the bootstrap subsidy over time. The underlying intuition &mdash; that distribution should be staged rather than instantaneous &mdash; survived; the Euler mathematics did not.
                </PaperRun>
            </PaperSection>

            <PaperSection title="10. Bootstrap and Attack Surface">
                <p>
                    A Schelling-point token cannot be declared; it must be <em>recognized</em>. This section is the most uncertain part of the design, because it concerns processes we cannot directly control.
                </p>
                <PaperRun title="Bootstrap: how FIG achieves focal status.">
                    Focal-point emergence for a newly-launched token depends on several converging factors, none of which the designer can guarantee: the <em>initial cohort</em> (the year-2 airdrop distributes 300M to the clause-author cohort the substrate-broadening formula selects, who have the first opportunity to recognize FIG as a focal point); <em>design legibility</em> (the design rules and exclusions must read as consistent with focal-point coordination rather than as random design preferences &mdash; this paper is part of that legibility work); and <em>absence of competing focal candidates</em> (if an alternative token launched with better focal properties at a moment when FIG had not yet stabilized, participants might converge on it instead). The design attempts to make FIG hard to beat on focal grounds (Rule 1 purity, Rule 2 supply predictability) but cannot preempt all competitors.
                </PaperRun>
                <PaperRun title="Focal-shift attack.">
                    The relevant attack against a Schelling-point token is the <em>focal-shift attack</em>: an adversary, through concerted action, moves focal convergence to a different token. The canonical example is the decade-long debate over whether Bitcoin-Cash or Bitcoin-SV could displace Bitcoin as the store-of-value focal point; neither succeeded, but both made the attempt at significant scale. The defense is Schelling stickiness: participants who have converged on a focal point typically hold through attempts to move the focus, because moving costs coordination value.
                </PaperRun>
                <PaperRun title="Dump attacks.">
                    An adversary with large FIG holdings can attempt to destabilize focal-point status by dumping supply. In a pure Schelling-point frame, this is <em>less damaging</em> than in a yield-anchored or governance-anchored frame: holders of FIG are holders by alignment choice, not by financial hedging, and the financial price of FIG is somewhat decoupled from its focal-point status. A price crash that leaves participant alignment unchanged does not necessarily destroy the focal point; a coordinated loss of participant alignment does.
                </PaperRun>
                <PaperRun title="Acquiescence attacks.">
                    The quietest attack is no attack at all: nobody converges, and FIG fails to become a focal point. This is possible and unavoidable. The defense is limited &mdash; we can support focal emergence but cannot force it. The honest statement is that if no cohort recognizes FIG as a focal point, the token has no Schelling-point value and operates as an unvalued distribution artifact. The supply-integrity and allocation properties continue to hold in that case; only the signaling function fails.
                </PaperRun>
                <PaperRun title="The griefing attack reconsidered.">
                    In earlier design iterations, a concern was raised about <em>griefing</em> &mdash; an adversary who writes code to drain the reward pool not for profit but for spite, given that no governance or fee-extraction capture is available. Under Euler, this attack had a concrete surface (manipulate the emission function to empty the reward budget). Under the current pure-airdrop design, the attack surface is narrower: the airdrop contract&rsquo;s claim path requires merkle-proof inclusion at a pre-committed address, and no drain is possible beyond what the merkle root already authorizes. The dump-at-unlock surface remains (addresses can claim at unlock and sell), but that is indistinguishable from the normal operation of the airdrop; it is not an exploit.
                </PaperRun>
            </PaperSection>

            <PaperSection title="11. Substrate-Neutrality and Distributional Silhouette">
                <p>
                    The bonded settlement <em>kernel</em> is a substrate on which multiple organizational forms can be expressed. The present paper describes FIG, a specific token ecosystem that ships alongside the kernel. Those two statements are about different objects and a careful reader should not confuse them.
                </p>
                <p>
                    FIG&rsquo;s 10/30/60 allocation is <em>one</em> instantiation of a token economy over the substrate. The substrate is substrate-neutral; FIG is not. If the distributional silhouette of FIG &mdash; early founder allocation, large standing treasury, community recipients on a calendar schedule &mdash; rhymes with the silhouette of prior platform-capital arrangements that a political-economy critique would target, that rhyme is a feature of this specific token&rsquo;s distribution, not of the substrate, and not inherent to the Schelling-point framing. Different focal-point tokens could be launched with different silhouettes (flatter, community-only, non-founder), and the Schelling-point design principles would apply to them unchanged.
                </p>
                <p>We flag this explicitly to disentangle three claims:</p>
                <ul className="space-y-2 list-disc pl-6 text-sm">
                    <li><strong>Substrate-neutrality (true of the kernel)</strong>: the bonded settlement primitive does not impose any particular distributional structure on tokens or organizations.</li>
                    <li><strong>Focal-point integrity (true of FIG)</strong>: the specific supply mechanism and exclusion catalogue enforce the allocation and the focality-preservation properties at deploy.</li>
                    <li><strong>Allocation legitimacy (out-of-scope)</strong>: whether 10/30/60 is the <em>right</em> allocation, whether a 30% liquid treasury is an appropriate ecosystem-coordination vehicle, and whether the implicit authority of the DAO over grant direction reproduces soft-governance patterns a platform-hegemony analysis would critique &mdash; these are political-economy questions the present paper does not resolve.</li>
                </ul>
            </PaperSection>

            <PaperSection title="12. Supply-Integrity Guarantees">
                <p>
                    The FIG supply mechanism is designed to be verifiable independently of the kernel, and its supply-integrity properties are established by formal verification. We state the guarantees the design is built to provide rather than the apparatus that establishes them; the apparatus is incidental to the claims, and the claims are what a focal-point participant needs.
                </p>
                <PaperRun title="The invariant set.">
                    The supply mechanism is held to a small set of invariants: total supply never exceeds the one-billion ceiling; balances are non-negative and sum to total supply; total supply equals the sum of all minted amounts; the aggregate registered cap never exceeds the ceiling and only ever increases; no minter ever mints beyond its own registered cap; a minter&rsquo;s cap, once registered, is immutable; no mint targets the zero address; and the deployer cannot mint after renouncement. Together these pin the supply trajectory to the allocation plan committed at deployment.
                </PaperRun>
                <PaperRun title="The renouncement latch as a one-way property.">
                    The renouncement latch is verified to be a genuine one-way latch: once set it cannot be unset, and after it is set the deployer has no mint authority and no minter can be registered. This is the property on which the whole supply schedule rests, and it is established as an invariant rather than asserted in prose.
                </PaperRun>
                <PaperRun title="Headline supply guarantee.">
                    The guarantee these properties combine into is this: from the moment deployer-mint renouncement is included in a finalized transaction, total supply is bounded above by <Math>{"10^9"}</Math>, no new minters can be registered, and the only remaining mint authority is the airdrop whose schedule is itself frozen by its three immutable stages. The supply is deterministic conditional on the merkle leaves; the leaves are committed per tranche behind the substrate-broadening proof. A focal-point participant assessing FIG can verify this directly from on-chain state.
                </PaperRun>
            </PaperSection>

            <PaperSection title="13. Regulatory Framing">
                <p>
                    A token paper that takes itself seriously must address the regulatory-status question, even if the answer it produces is provisional and jurisdictionally bounded. We address the question here in three registers &mdash; US securities law, EU MiCA, and a structural register prior to specific regimes.
                </p>
                <PaperRun title="The Howey four-prong test.">
                    Under <em>SEC v. W.J. Howey Co.</em>, 328 U.S. 293 (1946) and its extensive subsequent application to token offerings, an investment contract exists where there is (i)&nbsp;an investment of money, (ii)&nbsp;in a common enterprise, (iii)&nbsp;with an expectation of profit, (iv)&nbsp;derived from the entrepreneurial or managerial efforts of others. The SEC&rsquo;s 2019 <em>Framework for Investment Contract Analysis of Digital Assets</em> extended the test to digital-asset arrangements specifically (SEC, 2019), weighing factors that bear on each prong. FIG&rsquo;s position relative to the four prongs is, on our reading, the following.
                </PaperRun>
                <p>
                    (i)&nbsp;<em>Investment of money.</em> A participant acquires FIG through a merkle-claim airdrop or through secondary-market purchase. The airdrop is not an investment of money in the ordinary sense (no consideration is delivered to the issuer); the secondary purchase is an investment of money in the same sense any token acquisition is. Prong (i) is satisfied for secondary acquisition and not for airdrop receipt. Most analyses treat this asymmetry as not dispositive &mdash; the secondary market is the more material context &mdash; so we proceed assuming prong (i) is met for the relevant population.
                </p>
                <p>
                    (ii)&nbsp;<em>Common enterprise.</em> The doctrinal test for &ldquo;common enterprise&rdquo; is jurisdictionally split (horizontal vs. vertical commonality) but typically asks whether the investor&rsquo;s fortunes are tied to the enterprise&rsquo;s fortunes through pooling of assets or sharing of profits. FIG is not pooled, has no profit-sharing arrangement, and is not tied to a treasury whose performance distributes to holders. The DAO treasury holds 30% of supply (Section 6) and disburses grants under its own governance, but treasury distributions are not pro-rata to FIG holdings and do not constitute profit-sharing. Prong (ii) is the weakest of the four for FIG; we read it as likely <em>not</em> satisfied under either commonality test for FIG as currently constituted, with the caveat that the DAO&rsquo;s disbursement policy is the relevant variable and a sufficiently mechanistic disbursement policy could re-implicate the prong.
                </p>
                <p>
                    (iii)&nbsp;<em>Expectation of profit.</em> Holders may reasonably expect FIG to appreciate if the focal convergence strengthens. This is an expectation of profit in the ordinary sense, and prong (iii) is met.
                </p>
                <p>
                    (iv)&nbsp;<em>Derived from the efforts of others.</em> This is the prong on which most token cases turn under the SEC framework. The framework weighs whether an active participant (developer, foundation, promoter) is undertaking essential managerial efforts on which the holder&rsquo;s profit expectation depends. FIG&rsquo;s deployment registers the deployer as a one-shot minter, mints the founder and DAO allocations, and renounces &mdash; permanently, by a code-enforced one-way latch (Section 5). After deploy, the founder&rsquo;s effort is not managerial in any sense the framework recognizes: the founder holds liquid FIG as any holder does, has no protocol-level authority, cannot mint, cannot upgrade, cannot freeze, and has no fiduciary relationship to other holders. The DAO has treasury authority over its own allocation but not protocol authority over FIG. The development of the underlying Figaro protocol is a separate question, governed by a separate and ongoing analysis; FIG is not coupled to that development through any protocol-level mechanism. Prong (iv) is, on our reading, partially met (insofar as ecosystem development is happening and holder profit expectations may depend on it) and partially not met (insofar as the relationship between holder profit and developer effort is reflexive, not contractual or fiduciary). The prong is the hardest to assess because the SEC framework&rsquo;s factors were written with team-managed token projects in mind, and FIG is structurally a less-managed instrument than the framework contemplates.
                </p>
                <p>
                    The honest summary is that FIG&rsquo;s position relative to Howey is uncertain and varies with the development trajectory of the broader Figaro ecosystem. We do not claim FIG is not a security; we claim that the design is engineered to minimize the prongs&rsquo; applicability, and that the resulting position is defensible but not assured. This is the most we believe a cryptoeconomic paper can responsibly say. Specific jurisdictional advice belongs in a regulatory submission, not in this venue.
                </p>
                <PaperRun title="EU MiCA.">
                    The Markets in Crypto-Assets Regulation (Regulation (EU) 2023/1114) classifies crypto-assets into asset-referenced tokens, e-money tokens, and &ldquo;other&rdquo; crypto-assets, with distinct disclosure and authorization regimes. FIG is not asset-referenced (no reserve), not e-money (no nominal-value stability target), and would fall in the residual &ldquo;other&rdquo; category, subject to the white-paper publication requirement of MiCA Title II. The MiCA regime is more permissive of focal-point-style instruments than Howey is, conditional on disclosure compliance, and we treat MiCA as a tractable disclosure obligation rather than as an existential classification question.
                </PaperRun>
                <PaperRun title="Structural register.">
                    A reader may ask why a paper that has spent itself arguing for FIG as a focal-point coordination instrument should nonetheless engage securities law at all. The answer is that &ldquo;what FIG is for&rdquo; (focal-point coordination) and &ldquo;what FIG is in regulatory-classification space&rdquo; (a question about the prongs) are different questions, and a paper that addresses the first without acknowledging the second is doing its readers a disservice. The DAO-allocation contradiction flagged in Section 6 is, in part, a regulatory contradiction: a 30% treasury with grant-disbursement authority is exactly the structural feature most likely to re-implicate prong (iv) of Howey if the disbursement policy becomes mechanically tied to holding behavior. Keeping the disbursement policy at human discretion, separated from holding by the two layers of friction identified there (off-chain discretion, revocable grants), is also a regulatory discipline as well as a focality-protection discipline. The two disciplines align, and we have written the design to satisfy both, but the alignment is not coincidental and should not be relied on as a substitute for legal advice in any specific jurisdiction.
                </PaperRun>
            </PaperSection>

            <PaperSection title="14. Conclusion">
                <p>
                    FIG is a small design. Most of its positive content is procedural (supply cap, renouncement latch, staged merkle airdrop) and most of its substantive content is negative (no governance, no yield, no fee path, no founder vesting, no settlement-anchored emission, no coordinator-pattern role). Under the framing this paper develops, the negatives are not restraint without purpose &mdash; they are the specific design discipline required to support focal-point emergence. Every exclusion removes a class of holder whose presence would dilute the signaling value of FIG for participants who hold for alignment reasons.
                </p>
                <PaperRun title="The lineage, made explicit.">
                    Nakamoto (2008) took money out of institutions and made it a protocol. Bitcoin is the Schelling point at the money layer, underpinned by the cost of producing the asset: a bearer asset around which participants converge because its design makes convergence credible (fixed supply, issuer-less, peer-to-peer). Buterin (2014) made contracts composable and put ETH at the focal point of programmable settlement, underpinned by transaction demand: gas is the utility floor, Schelling recognition the coordination premium. The present work extends the pattern to institutions: bonded commitments are composable into arbitrarily large assemblies, and FIG is the focal point for aligned participation in that composition, underpinned by <em>trade</em> &mdash; the value-added produced when parties exchange goods, services, or coordination through the bonded primitive. The pattern is the same at each layer: a native token that is not a utility, not a governance claim, and not a cash-flow instrument, but a coordination anchor whose value rests on a distinct real-economic quantity. The distinction between the three is which quantity: factor cost for Bitcoin, transaction utility for Ethereum, and the value-added of trade for FIG.
                </PaperRun>
                <PaperRun title="Open questions.">
                    Three questions remain outside this paper&rsquo;s scope but worth flagging. First, the clause-author substrate-broadening formula that decides which authors appear in which tranche&rsquo;s merkle root is developed as its own mechanism, and the policy and verification framework around each tranche&rsquo;s submission should be audited before that tranche&rsquo;s root is committed. Second, the relationship between FIG and the various treasury communities likely to form around it is genuinely emergent and not centrally designable; the present paper does not attempt to predict or control that emergence. Third, the status of the specific percentages in the allocation is as addressed in Section 6: judgment, not proof; the structural choices are the defensible content.
                </PaperRun>
                <PaperRun title="What the design can and cannot do.">
                    Schelling-point design is a matter of supporting emergence, not causing it. The design rules of Section 4 and the exclusions of Section 8 make focal-point convergence on FIG viable: a participant who wants to signal alignment can do so by acquiring and holding FIG, and the design ensures the signal is not muddied by non-alignment holders. Whether focal-point convergence <em>happens</em> is a social process we do not control. We document the design so that those who choose to converge can do so legibly, and so that those who do not can see what they are declining.
                </PaperRun>
            </PaperSection>
        </PaperLayout>
    );
}
