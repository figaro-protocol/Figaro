import type { Metadata } from "next";
import {
    PaperLayout,
    PaperSection,
    PaperRun,
    PaperRemark,
} from "@/components/papers/PaperLayout";
import { Math } from "@/components/papers/Math";

export const metadata: Metadata = {
    title: "Substrate-Broadening Retroactive Public-Goods Funding — Figaro Protocol",
    description:
        "An allocation mechanism that distributes 600M florins to clause authors and assembly designers of record across three tranches. Artifacts are scored by counterparty diversity over raw volume, value is excluded, and a 15% per-wallet cap bounds concentration. Usage is counted on chain at the moment it happens, by a permissionless recording call that verifies settlement and agreement inclusion itself — so there is no root to post, no bond, no challenge window and no forum.",
};

export default function SubstrateBroadeningRpgfPaper() {
    return (
        <PaperLayout slug="substrate-broadening-rpgf"
            title="Substrate-Broadening Retroactive Public-Goods Funding"
            subtitle="Allocating a Fixed Reserve on Adoption Counted as It Happens"
            author="Alessandro Daliana"
            date="July 2026"
            watermark="Figaro Protocol · Preprint"
            keywords="retroactive public goods funding, mechanism design, resource allocation, verified usage accounting, permissionless recording, deterministic allocation, clause authoring, assembly design, coordination protocols"
            abstract={
                <>
                    <p>
                        A permissionless coordination protocol grows by accretion of the artifacts that extend its substrate &mdash; in the Figaro protocol, the <em>clauses</em> that define new attestation and agreement types and the <em>assemblies</em> that compose them into reusable coordinations. The authors of those artifacts perform public-goods work: once registered, an artifact is usable by every participant at no charge to them and no recurring revenue to its author. This paper develops the mechanism by which the florin, the Figaro protocol&rsquo;s money, funds that work retroactively: a fixed 600-million-unit reserve, released across three tranches at years 2, 5, and 9, allocated to clause authors and assembly designers of record by a scoring rule whose every constant is fixed in the deployed contracts. The mechanism&rsquo;s distinctive choice is what it measures. It does not reward volume, and it does not reward value moved: it rewards <em>substrate-broadening</em> &mdash; adoption of an artifact across many distinct counterparty relationships, in processes that actually settled &mdash; weighting counterparty diversity above raw process count. Payment and bond size never enter the score. A single declared-tag weight triples the score of the category of work the substrate most needs and cannot obtain otherwise; a 15% per-wallet cap bounds concentration; and the counting rule itself &mdash; settled processes only, one count per process, and a hard limit on how often one counterparty pair may feed one artifact &mdash; closes the cheap farming vectors.
                    </p>
                    <p>
                        The allocation rests on no trusted party, because it rests on no claim about the past. Adoption is counted on chain at the moment it occurs: anyone may record that a settled process used a given artifact, and the recording contract verifies both halves of that statement from state the chain already holds &mdash; that the order resolved, and that the artifact was committed in the agreement both parties signed. Accrual buckets into fixed periods whose numbers stop moving the instant a period ends, so a tranche is arithmetic over quantities that can no longer change. This is what removes an apparatus the mechanism&rsquo;s earlier construction could not do without. Because the chain cannot look backwards &mdash; the settlement kernel is frozen, it never calls the artifact registries, and no contract can read an event &mdash; adoption could only be reconstructed after the fact, which meant someone had to <em>post</em> the answer, which meant a <em>bond</em> to make posting costly, a <em>challenge</em> to contest it, and a <em>forum</em> to award the bonds. Recording the fact when it happens removes that entire chain of consequences at its root. The rule is not a document whose hash is anchored somewhere: it is the deployed contracts&rsquo; own immutable constants, and changing one would require deploying a new token system.
                    </p>
                </>
            }
            references={
                <>
                    <li>Buterin, V., Hitzig, Z., &amp; Weyl, E. G. A Flexible Design for Funding Public Goods. <em>Management Science</em>, 65(11):5171&ndash;5187, 2019.</li>
                    <li>Optimism Collective. <em>Retroactive Public Goods Funding</em>. Optimism PBC Blog, July 2021.</li>
                    <li>Optimism Foundation. <em>Optimistic Rollups</em>. Optimism Technical Documentation, 2021.</li>
                    <li>Succinct Labs. <em>Introducing SP1: A Performant, 100% Open-Source, Contributor-Friendly zkVM</em>. Succinct Blog, February 2024.</li>
                </>
            }
        >
            <PaperSection title="1. Introduction">
                <p>
                    The Figaro settlement kernel is deliberately minimal: it verifies two signatures, locks two bonds, and resolves a process atomically. Everything that gives a bonded commitment meaning beyond &ldquo;party A paid party B&rdquo; &mdash; what was promised, what was attested, what credential was presented, what handoff occurred &mdash; lives in <em>clauses</em>: content-typed agreement and attestation definitions, each registered permissionlessly on the clause registry. Clauses compose into <em>assemblies</em>: reusable coordinations that a designer publishes once and that any buyer can instantiate thereafter. Clauses and assemblies are the protocol&rsquo;s substrate. The reachable surface of coordinations the protocol can express is exactly the set of artifacts that exist.
                </p>
                <p>
                    Authoring an artifact is public-goods work in the strict sense. A registered clause is non-rival (one author&rsquo;s registration does not consume another&rsquo;s ability to use it), non-excludable (anyone may attest under a registered clause), and uncompensated by the protocol&rsquo;s own operation (the kernel takes no fee, and there is no per-attestation or per-settlement revenue path). The author who writes a high-quality logistics-attestation clause, or the designer who composes a handoff assembly that a hundred unrelated buyers later instantiate, captures none of the value their work creates for the network. This is the canonical under-provision problem of public goods, reproduced at the protocol-substrate layer.
                </p>
                <p>
                    Retroactive public-goods funding (RPGF), developed in practice by the Optimism Collective (2021), addresses under-provision by rewarding work after its value is observable rather than speculating on it in advance. The intuition is that judging impact is easier in retrospect than prospect. This paper specifies a fully mechanized instance of that intuition for protocol-artifact authoring: a fixed florin reserve, released in tranches years after the work, allocated by an objective scoring function computed over on-chain settlement history &mdash; with no committee, no vote, no discretionary curation, and no privileged party who supplies the inputs. Where Optimism&rsquo;s practice retains human badgeholder panels to score impact, this mechanism replaces the panel with a rule and the ballot with a count the chain keeps for itself; what it keeps from that lineage is the retroactivity and the discipline of <em>fixing the rule in public</em> before the work it will judge has been done.
                </p>
                <PaperRun title="Contribution.">
                    The contribution is a concrete, fixed allocation mechanism with three properties we develop in turn: (i) it scores artifacts by <em>substrate-broadening</em> &mdash; counterparty diversity in settled processes &mdash; rather than by volume or value, behind counting rules that close the cheap farming vectors; (ii) it bounds concentration with a per-wallet cap that binds at the moment of claim; and (iii) it removes the verification problem rather than solving it, by counting adoption on chain as it happens instead of reconstructing it afterwards &mdash; which is what leaves the tranche with no root to post, no bond to stake, no window to challenge, and no forum to adjudicate.
                </PaperRun>
                <PaperRun title="Paper organization.">
                    Section 2 states the allocation problem &mdash; what is allocated, to whom, and under what constraints. Section 3 develops the substrate-broadening objective. Section 4 states the counting rules that make the objective farming-resistant, and what the count deliberately refuses to interpret. Section 5 gives the scoring formula and the diversity-over-volume rationale. Section 6 develops the substrate-broadening weight. Section 7 develops the concentration cap. Section 8 develops the counting-as-it-happens construction and its trust model. Section 9 examines two verification designs that were considered and rejected. Section 10 states scope and limitations. Section 11 concludes.
                </PaperRun>
            </PaperSection>

            <PaperSection title="2. The Allocation Problem">
                <PaperRun title="What is allocated.">
                    The florin reserves 600 million units &mdash; 60% of the one-billion fixed supply &mdash; for artifact-author funding. The reserve is released in three tranches: 300M at year 2, 200M at year 5, and 100M at year 9 (50% / 33% / 17% of the reserve; 30% / 20% / 10% of total supply). The schedule is front-loaded because early-network substrate growth has higher marginal coordination value, and the nine-year tail reserves a share for sustained contribution. The tranche budgets are fixed at deployment, and so are the boundaries of the accrual periods they pay for: tranche <Math>{"i"}</Math> pays for accrual period <Math>{"i"}</Math>, and the two schedules are one schedule, configured together in the same act. No party can accelerate, delay, or resize a tranche afterwards.
                </PaperRun>
                <PaperRun title="To whom.">
                    Allocation goes to the artifacts&rsquo; authors and designers <em>of record</em> &mdash; the first-write-wins wallets that registered them. A clause&rsquo;s author of record is the wallet that first registered its string identifier (later versions of the same clause merge into that author&rsquo;s account); an assembly&rsquo;s designer of record is the wallet that first registered its composition. One resolved process credits its assembly&rsquo;s designer and, independently, the author of every clause the parties committed within it. There is no per-attestation, per-seller, or per-settlement reward path: a seller who attests heavily under someone else&rsquo;s clause earns nothing from RPGF, and a buyer who settles a thousand processes earns nothing from RPGF. The recipient set is exactly the set of artifact authors and designers with non-zero eligible adoption, determined by registry state, with no curation step.
                </PaperRun>
                <PaperRun title="Under what constraints.">
                    The mechanism operates under constraints inherited from the protocol&rsquo;s design discipline. It must introduce no governance surface (every governance parameter is an attack surface the protocol exists to avoid) and no human curation (which would reintroduce the discretionary authority the protocol displaces). It must resist gaming: because the recipient is decided by an objective formula over public data, the formula must not reward behavior that is cheap to manufacture and uncorrelated with genuine substrate growth. And it must be verifiable: a participant assessing the token should be able to confirm that each tranche was allocated by the stated rule, not by an allocator&rsquo;s preference and not over inputs an allocator chose.
                </PaperRun>
                <PaperRemark title="Why not prospective or per-use funding.">
                    Two alternatives are deliberately excluded. <em>Prospective</em> funding by committee &mdash; grants decided before the work by a panel that predicts impact &mdash; reintroduces exactly the discretion the protocol displaces. (Prospective funding need not be discretionary: a crowd-steered matching round, where many independent donors direct a pool under a fixed arithmetic rule, funds work going forward without a committee &mdash; but it is a distinct instrument for a distinct job, and the retroactive, artifact-attached allocation developed here is what this paper specifies.) <em>Per-use</em> funding (a micro-payment on each attestation under a clause) couples token issuance to protocol activity, which invites wash-attestation to farm the reward and muddies the token&rsquo;s meaning &mdash; the same coupling the token&rsquo;s focal-point design forbids. Retroactive, lump-sum, formula-based allocation avoids both failure modes: impact is observed, not predicted, and the reward attaches to the durable artifact (the clause, the assembly) rather than to the gameable event (an attestation).
                </PaperRemark>
            </PaperSection>

            <PaperSection title="3. The Substrate-Broadening Objective">
                <p>
                    The allocation table fixes how many florins each tranche distributes but not <em>which</em> authors receive them or in what proportion. That is decided by the objective the mechanism optimizes for, and the choice of objective is the substantive design decision. We call it <em>substrate-broadening</em>.
                </p>
                <p>
                    An artifact broadens the protocol&rsquo;s substrate to the extent that it is adopted across genuinely distinct coordination relationships. The reachable surface of the protocol is not the number of times any single relationship transacts; it is the number of distinct relationships the protocol can express and secure. A clause that fifty unrelated buyer&ndash;seller pairs each adopt has extended the protocol into fifty relationships that did not previously coordinate through it. A clause that one pair uses fifty times has deepened a single relationship but not broadened the surface. Both are valuable; only the first is <em>substrate-broadening</em>, and that is the quantity the mechanism rewards.
                </p>
                <PaperRun title="The settled-only principle.">
                    The objective is measured only over work that settled. A process contributes to an artifact&rsquo;s score only once that process has resolved &mdash; the recording contract asks the settlement kernel for the order&rsquo;s status and refuses anything that is not resolved. An artifact written into agreements that never reach resolution earns nothing; an artifact with no settled adoption in a tranche&rsquo;s period receives zero by absence. This ties the reward to completed coordination rather than to declared intent, and it removes the cheapest gaming vector &mdash; manufacturing unsettled commitments to inflate a count &mdash; because an unsettled commitment cannot be recorded at all. Settlement is the first of the counting rules developed in Section 4.
                </PaperRun>
                <PaperRun title="Relation to quadratic funding.">
                    The diversity-over-volume principle has a direct antecedent in quadratic funding (Buterin, Hitzig, &amp; Weyl, 2019), where a public good&rsquo;s match weights the square of the summed square-roots of individual contributions &mdash; <Math>{"\\bigl(\\sum_i \\sqrt{c_i}\\bigr)^2"}</Math> &mdash; so that many small contributions outweigh few large ones and broad support outweighs concentrated support. Substrate-broadening applies the same intuition on a different axis: it rewards breadth of <em>adoption</em> (distinct counterparty pairs) over depth of use (repeated transactions), so that an artifact embraced widely outscores one used intensively by few. The mechanism is not quadratic funding &mdash; there is no matching pool against contributions, and the exponents differ &mdash; but it shares the foundational commitment to weighting breadth above magnitude. (The protocol operates a genuine quadratic-funding instrument separately &mdash; a crowd-steered matching round that splits a funded pool by the coordination surplus in the donations a recipient received, the square of their summed square roots less their total; this retroactive mechanism is its complement, applying the same breadth-over-magnitude commitment on the adoption axis rather than the contribution axis.)
                </PaperRun>
            </PaperSection>

            <PaperSection title="4. The Counting Rules and Farming Resistance">
                <p>
                    Because the recipient is decided by an objective count, the count must not reward behavior that is cheap to manufacture and uncorrelated with genuine substrate growth. Four rules govern what may be counted. They are not filters applied downstream by an aggregator: each is a condition the recording call itself checks against chain state before it will accept a record, so an ineligible record does not enter the accounting and then get removed &mdash; it never lands.
                </p>
                <ul className="space-y-2 list-disc pl-6 text-sm">
                    <li><span className="font-semibold text-ink-heading">Settled only.</span> The record names an order, and the recording contract recomputes that order&rsquo;s hash from the signed commitment struct and asks the settlement kernel for its status. An unknown order is refused; an order that has not resolved is refused. Adoption is what a finished process leaves behind (Section 3).</li>
                    <li><span className="font-semibold text-ink-heading">Committed in the signed agreement.</span> The artifact must be a committed leaf of the agreement hash the two parties signed, proved by Merkle inclusion against that hash, under the same leaf construction the protocol&rsquo;s attestation surface uses. Nobody can credit an artifact to a process that did not use it, because the proof is checked against a digest neither party can restate after signing.</li>
                    <li><span className="font-semibold text-ink-heading">One process, one count.</span> A given process counts once per artifact per period. A repeat record is refused rather than absorbed, so nothing is gained by recording the same settlement twice, and the record may safely be attempted by anyone at any time.</li>
                    <li><span className="font-semibold text-ink-heading">Per-pair cap.</span> A single buyer&ndash;seller pair may feed at most five processes to one artifact in one period. Beyond that the process is dropped entirely &mdash; it contributes to neither the process count nor the pair count. Repeating one relationship therefore cannot inflate an artifact&rsquo;s score without bound, which puts breadth over depth at the counting layer and not only in the exponents.
                    </li>
                </ul>
                <PaperRun title="What the count refuses to interpret.">
                    The rules above are exactly the rules. There is no eligibility list, no excluded category, no condition on whether an author still has capital staked behind an artifact, and no reading of the artifact&rsquo;s content. That restraint is deliberate and it is what keeps the count checkable: every rule above is decided by comparing two hashes or reading one status word, so no participant has to agree with a curator about what an artifact <em>means</em> in order to agree about what it scored. The consequence is that an artifact carried by many settled processes scores for that fact alone, including an artifact so generic that most agreements carry it. Concentration from that quarter is bounded not by excluding the artifact but by the per-wallet cap of Section 7, which is the same instrument, applied once, to every source of concentration at once.
                </PaperRun>
                <PaperRun title="Recording is permissionless and opt-in.">
                    Anyone may record; nothing is trusted about the caller, because the proof is what is checked. In practice the party who records is the party with the incentive &mdash; the artifact&rsquo;s author, for whom the record is how the work is counted &mdash; and the gas is theirs. An unrecorded settlement simply does not count. The evidence is not lost &mdash; the signed agreement and the resolution stay on chain &mdash; but a record lands in whichever period is open when it is made, and once a period has ended nothing can be added to it. Recording therefore has to be current, and the cost of being current is paid by the party it benefits rather than by the network.
                </PaperRun>
            </PaperSection>

            <PaperSection title="5. The Scoring Formula">
                <p>
                    Each artifact carries, per period, two counters and the score they determine. The counters move as records land; the score is recomputed on the spot and the period&rsquo;s running total moves by the difference, so no pass over history is ever required:
                </p>
                <div className="my-3 overflow-x-auto">
                    <Math display>{"\\text{score}(a) \\;=\\; w(a)\\;\\cdot\\; c(a)^{\\,\\alpha}\\;\\cdot\\; d(a)^{\\,1-\\alpha}, \\qquad \\alpha = \\tfrac{1}{3}."}</Math>
                </div>
                <ul className="space-y-1 list-disc pl-6 text-sm">
                    <li><Math>{"c(a)"}</Math> &mdash; the number of distinct settled <em>processes</em> recorded against artifact <Math>{"a"}</Math> in the period, after the per-pair cap.</li>
                    <li><Math>{"d(a)"}</Math> &mdash; the number of distinct buyer&ndash;seller <em>pairs</em> across those processes.</li>
                    <li><Math>{"w(a)"}</Math> &mdash; the substrate-broadening weight, developed in Section 6, taking one of two values.</li>
                </ul>
                <p>
                    An artifact with zero processes or zero pairs scores zero. The exponent split is the load-bearing choice. With <Math>{"\\alpha = \\tfrac13"}</Math>, the diversity term <Math>{"d(a)"}</Math> carries the larger exponent (<Math>{"1-\\alpha = \\tfrac23"}</Math>), so counterparty diversity dominates raw process count: holding the product <Math>{"c \\cdot d"}</Math> fixed, an artifact scores higher the more its activity is spread across distinct pairs rather than concentrated in repeated processes between the same parties. The split expresses &mdash; not derives &mdash; the design judgment that breadth outweighs volume, and it is fixed at deployment.
                </p>
                <PaperRun title="Integer arithmetic throughout.">
                    The score is computed with integer arithmetic and no floating point anywhere. The integer form is <Math>{"w \\cdot \\lfloor\\sqrt[3]{\\,c\\,d^{2}\\cdot 10^{18}}\\,\\rfloor"}</Math>, a floor integer cube root taken over a fixed-point scale large enough that the flooring error is negligible, with the weight carried in integer thousandths. The scale factor is what lets a monotone quantity be maintained exactly: the score is stored, and when a record moves <Math>{"c"}</Math> or <Math>{"d"}</Math>, the period&rsquo;s total moves by the new score less the stored one. There is no accumulated drift to reconcile, and an off-chain reader mirroring the same integer operations obtains the identical number rather than an approximation of it.
                </PaperRun>
                <PaperRun title="Value is deliberately excluded.">
                    Neither payment nor bond size enters the formula. The protocol&rsquo;s cost to move one unit of value equals its cost to move a trillion; an artifact that broadens coordination across many small settlements has done the same substrate work as one used in a few large ones. Weighting by value would import a &ldquo;total value locked matters&rdquo; metric from financial protocols that the coordination layer rejects &mdash; and it would skew the reward toward whoever authors the artifacts that high-value transactions happen to use, which is uncorrelated with how broadly an artifact extends the substrate. The omission is principled, not an oversight.
                </PaperRun>
            </PaperSection>

            <PaperSection title="6. The Substrate-Broadening Weight">
                <p>
                    The weight <Math>{"w(a)"}</Math> takes one of exactly two values. A clause carrying the boosted tag weighs <Math>{"3.0"}</Math>; every other clause, and every assembly, weighs <Math>{"1.0"}</Math>. Both are integer constants of the counting contract, carried in thousandths, and the identity of the tag that earns the boost is fixed when that contract is deployed.
                </p>
                <PaperRun title="Which category, and why.">
                    The boosted tag marks the artifacts that record <em>where</em> and <em>how</em> work physically moved &mdash; the pickup, the handoff, the zone a service covers. A settled agreement already discloses who paid whom, in what, how much, and in what order contributors added value; the one thing it cannot emit by itself is the geography of the work, because geography is not a consequence of settlement but an observation someone has to make and commit. That observation is the public good the protocol most needs and the least likely to arise unincentivized, so the mechanism pays three times as much for the artifacts that carry it. Nothing else is boosted, and the boost is a multiplier on a score that is zero without genuine adoption.
                </PaperRun>
                <PaperRun title="The tag is declared, not adjudicated.">
                    The tag is supplied by whoever registers the clause and recorded by the clause registry, which interprets nothing. Two properties follow, and both matter. <em>Which</em> tag pays is frozen at deployment &mdash; a reward decision, made once, unchangeable without deploying a new token system. <em>Membership</em> of that tag is permissionless and open forever: any author registering a clause under the boosted tag inherits the weight, with no application, no approval, and no change to any deployed contract. The weighting therefore privileges a category of work, never a set of authors, and the category cannot be closed to newcomers by anyone including its designer.
                </PaperRun>
                <PaperRemark title="Why a false declaration does not pay.">
                    Nothing on chain verifies that a clause tagged as flow-recording actually records flow. It does not need to: the tag is a public statement, checkable by any reader against the content-addressed spec the registry anchors, and permanent under first-write-wins. What it buys is a multiplier on a quantity that only real, settled, breadth-spanning adoption produces. A false tag on an unused artifact multiplies zero; a false tag on a widely adopted artifact is a standing, permanent, publicly-legible misdeclaration by an author whose reward depends on other people continuing to compose their work. The mechanism does not need to police the declaration because it never pays for the declaration &mdash; it pays for the adoption.
                </PaperRemark>
            </PaperSection>

            <PaperSection title="7. The Concentration Cap">
                <p>
                    A wallet claims a tranche once, presenting every artifact it authored or designed in that single call. Each is checked against its own registry &mdash; the clause registry for a registrar of record, the assembly registry for an author of record &mdash; so the list a claimant supplies is a lookup key, never an assertion of ownership. Their scores for the period are summed, and the two artifact families merge into one per-wallet quantity. The wallet&rsquo;s share of the tranche is that quantity over the period&rsquo;s total score, and it is then clamped at <Math>{"15\\%"}</Math> of the tranche. Because the cap spans both families and the claim is one-shot, an author cannot evade it by splitting contribution between clauses and assemblies, or across several claims.
                </p>
                <PaperRun title="The cap binds at claim, and the excess is not redistributed.">
                    Water-filling the excess back over the remaining recipients &mdash; fixing each capped wallet at its ceiling and re-splitting the freed budget until no uncapped wallet exceeds it &mdash; is the standard construction, and it is deliberately not used here. It cannot be: it requires every wallet&rsquo;s score in one computation, and a global pass over all recipients is exactly the step this design exists not to need. Instead a capped wallet takes the cap and the overflow stays unminted. The cap binds identically for everyone; only the redistribution is gone. Integer flooring dust stays unminted for the same reason: the tranche budget is a ceiling, not a target, and no mechanism exists &mdash; or could be added later &mdash; to sweep what a tranche does not mint.
                </PaperRun>
                <PaperRun title="The sparse case.">
                    If a period&rsquo;s score is concentrated in few enough wallets that each of them is at the cap &mdash; possible only when at most <Math>{"1/0.15 \\approx 6"}</Math> wallets hold it &mdash; each takes the cap and the residue goes unallocated. This is the intended behavior rather than a failure mode: the cap&rsquo;s purpose is to bound concentration, not to guarantee that a tranche is consumed. A period in which the substrate was broadened by six wallets should not, on that evidence, mint six wallets a tranche.
                </PaperRun>
                <p>
                    Nothing anywhere in this procedure requires knowing who else is claiming. The denominator is a number the counting contract already holds and can no longer change; the numerator is the claimant&rsquo;s own artifacts; the ceiling is a constant. That is the whole of the allocation.
                </p>
            </PaperSection>

            <PaperSection title="8. Counting Adoption as It Happens">
                <p>
                    Everything above describes an arithmetic. This section describes why that arithmetic can be trusted, and the answer is not that it is proved or challenged or adjudicated: it is that no one ever states it. The mechanism&rsquo;s design problem was never how to check an allocator&rsquo;s claim. It was how to avoid needing an allocator&rsquo;s claim at all.
                </p>
                <PaperRun title="The chain cannot look backwards.">
                    Three properties of the substrate combine into one hard constraint. The settlement kernel is frozen &mdash; it will never be modified to notify anything. It never calls the artifact registries, and must not: coupling settlement to a registry would make the registries load-bearing for trade. And no contract can read an event, because logs are an interface for observers outside the machine, not state inside it. So at the moment a process settles, the fact that it used a particular clause is a fact the chain has recorded and cannot subsequently consult. Any mechanism that wants to pay for adoption must therefore either reconstruct that fact after the event, or capture it at the event. Everything else about the two designs follows from that fork.
                </PaperRun>
                <PaperRun title="Reconstruction forces a chain of consequences.">
                    Take the first branch and the cascade is forced, link by link. Reconstruction happens off chain, since the chain cannot do it; so the answer must be brought back on chain, which means somebody <em>posts</em> it. A posting is an unverified claim about the past, so it must be made costly, which means a <em>bond</em>. A bond is only a deterrent if a false posting can be attacked, which means a <em>challenge</em>. A challenge stakes capital on both sides, and something must decide who keeps it, which means a <em>forum</em> &mdash; and now the allocation mechanism has acquired a dispute layer, an escalation path, a concession deadline, and an outside adjudicator that has to be composed, funded, and trusted to rule. None of that apparatus funds a single public good. All of it exists to make the chain believe a claim about the past.
                </PaperRun>
                <PaperRun title="Capture removes the claim.">
                    Take the second branch and the cascade never starts. A record names a settled order and an artifact, and the recording contract checks both halves itself, against state the chain already holds: it recomputes the order hash from the signed commitment and requires the kernel to report it resolved, and it requires Merkle inclusion of the artifact in the agreement hash that order carries. Neither check consults the caller. Nobody is trusted, so there is nothing to post; nothing is posted, so there is nothing to bond; nothing is bonded, so there is nothing to challenge; nothing is challenged, so there is no forum. The apparatus is not simplified or hardened &mdash; it is unnecessary, and its absence is not a gap in the design but the design.
                </PaperRun>
                <PaperRun title="Periods, not snapshots.">
                    One difficulty survives the move and is worth stating precisely. If a tranche paid pro rata out of a total that kept growing, early claimants would take more than their share, and the usual answer is a snapshot &mdash; a checkpoint of every score at a chosen block, walked at claim time. The mechanism does not take one. Accrual buckets instead into fixed periods, set when the counting contract is deployed, and a tranche pays for its own period. Claiming requires that period to have ended, and once it has, its counters and its total are immovable: a record that arrives late lands in whatever period is open when it arrives, never in a closed one. So a claimant reads a denominator that no subsequent transaction can change, without a checkpoint array, without a history walk, and without any block-height parameter for anyone to choose. Claims never expire, because a closed period&rsquo;s arithmetic is stable forever.
                </PaperRun>
                <PaperRun title="Crediting an assembly&rsquo;s designer.">
                    Clauses and assemblies are separate artifact families with separate registries, and the count treats them uniformly: what a record proves is that a particular thirty-two-byte artifact identity was committed as a leaf of the signed agreement. For a clause that identity is its registry identifier; for an assembly it is the composition hash under which the designer registered the composition. An agreement that commits the composition it instantiates therefore credits its designer by the same inclusion proof that credits a clause author, with no separate linkage table, no inversion step, and no piece of scoring infrastructure that has to be excluded from earning to keep the accounting honest.
                </PaperRun>
                <PaperRun title="Claiming, and the two budget backstops.">
                    A claim mints directly to the claimant &mdash; there is no intermediate custody, no root to prove against, and nothing that expires. Issuance is bounded twice over: the minter tracks what it has minted per tranche and refuses any claim that would overspend that tranche, and the token independently caps what this minter may ever mint at the 600M reserve, a cap registered at the token&rsquo;s genesis before the deployer&rsquo;s own minting authority was permanently renounced. The second bound holds even if the first were wrong, and neither can be raised by anyone.
                </PaperRun>
                <PaperRun title="The rule is fixed, and it is the code.">
                    The exponent split <Math>{"\\alpha = \\tfrac13"}</Math>, the <Math>{"15\\%"}</Math> per-wallet cap, the per-pair cap of five, the two weights, the identity of the boosted tag, the period boundaries and the three tranche budgets are all constants or immutables of the deployed contracts. There is no owner, no pause, no upgrade path, and no configuration surface: one rule applies unchanged across all three tranches, and changing any constant means deploying a new token system. This is a stronger guarantee than anchoring a document&rsquo;s hash on chain, because there is no document that could disagree with what executes &mdash; a participant assessing the mechanism reads the constants from the contracts themselves.
                </PaperRun>
            </PaperSection>

            <PaperSection title="9. Two Rejected Verification Designs">
                <p>
                    Both rejected designs took the reconstruction branch of Section 8, and both are instructive, because each was a genuine improvement on its predecessor and neither escaped the branch. We state them precisely, since the case for capture is made by exactly what reconstruction costs.
                </p>
                <PaperRun title="Proof-gated verification.">
                    The first design gated a posted root behind a zero-knowledge proof: a succinct-proof virtual machine (Succinct Labs, 2024) ran the canonical aggregator as its guest program and attested that the submitted root was the correct output of applying the frozen formula to a specific event window supplied as input. The proof bound the <em>formula</em> to the <em>inputs</em>: given those events, the root was provably the formula&rsquo;s output, with no deviation, no favoritism, and no off-formula adjustment. What it could not bind was the <em>inputs</em> to <em>chain history</em>. A submitter who fed the prover a doctored event stream &mdash; omitting some artifacts&rsquo; usage, inventing others &mdash; would obtain a valid proof for the wrong allocation, because the proof certifies correct computation over the inputs and says nothing about their provenance. Input provenance remained a trusted-submitter assumption, and the design paid the full price of proving infrastructure without discharging it.
                </PaperRun>
                <PaperRun title="Posted root under a bonded challenge.">
                    The second design dropped the proof and made the window chain-defined instead: every event up to the block before the posting, the same for every observer, so there was no supplied stream to doctor. It then took the assertion-stands-unless-contested pattern that optimistic rollups established (Optimism Foundation, 2021) and applied it to allocation &mdash; a poster staked a bond, anyone could stake an equal bond to void the posting, and an unchallenged posting finalized and paid by Merkle claim. That construction did close the input-provenance hole, and on its own terms it is sound. Its cost is the cascade itself. It needed a challenge period before any recipient could be paid, so a correct allocation waited on a window whose only function was to give a hypothetical challenger time. It needed a rule for the bonds when a challenge landed, which meant an escalation path, a concession deadline, and an external arbitration forum composed into the token system &mdash; a discretionary body introduced into a mechanism whose entire claim was to have none, even though its rulings only ever moved bonds. And it rested on a liveness assumption: safety required that at least one honest party be watching, recomputing, and willing to bond, at each of three moments spread over nine years.
                </PaperRun>
                <p>
                    Counting adoption as it happens dominates both, and it does so by refusing the premise they share. There is no window, because there is no reconstruction. There is no root, because there is no assertion. There is no bond, no challenge period, no forum, and no watcher who must be present for the mechanism to be safe &mdash; a correct allocation is payable the moment its period closes, and an incorrect one cannot be expressed. The proof-gated approach remains the right tool for a different problem, batch settlement, where signatures must be verified in-circuit rather than read from a log; it is the wrong tool for adoption, which the chain can simply be told about at the moment it occurs. We keep the account of both rejected designs because the discipline they illustrate generalizes past this mechanism: when a construction accumulates a bond, a challenge, and a referee, the thing to examine is not the construction but the claim it was built to make believable.
                </p>
            </PaperSection>

            <PaperSection title="10. Scope and Limitations">
                <PaperRun title="Cohort selection is the formula, by construction.">
                    The mechanism deliberately has no cohort-selection policy. The recipient set is the set of artifact authors and designers with non-zero recorded adoption in the period, and the proportions are the rule&rsquo;s output. There is no list of approved recipients to curate and no committee to convene. This is a feature &mdash; it is what makes the mechanism discretion-free &mdash; but it means the mechanism funds exactly two kinds of contribution (clause authoring and assembly design) and is silent on every other kind of protocol work (client development, documentation, review, operations). Those are funded, if at all, through the separately-held treasury allocation &mdash; which may itself direct that funding through a crowd-steered matching round rather than a committee &mdash; not through this mechanism.
                </PaperRun>
                <PaperRun title="Single denomination per process.">
                    The counting layer reads a process&rsquo;s parties and its resolution from chain state directly; it takes no position on the currency a process settles in, and it compares no values across currencies, because value never enters the score. The mechanism therefore inherits, and does not relax, the kernel&rsquo;s single-denomination-per-process boundary: it scores the shape of coordination, not the units it moved.
                </PaperRun>
            </PaperSection>

            <PaperSection title="11. Conclusion">
                <p>
                    Artifact authoring &mdash; writing the clauses and composing the assemblies &mdash; is the public-goods work that grows a permissionless coordination protocol&rsquo;s substrate, and it is uncompensated by the protocol&rsquo;s own operation. The mechanism developed here funds it retroactively, from a fixed 600M florin reserve released in three tranches, allocated by a fixed rule that rewards substrate-broadening &mdash; adoption across distinct counterparty relationships in settled processes &mdash; over volume or value, behind counting rules that close the cheap farming vectors, with a tripled weight for the category of work the substrate cannot obtain otherwise and a 15% per-wallet cap on concentration.
                </p>
                <p>
                    The mechanism&rsquo;s claim to legitimacy rests on four refusals and one substitution. It refuses governance; it refuses human curation, and in particular the badgeholder panel that retroactive-funding practice elsewhere retains; it refuses to couple issuance to gameable per-use events; and it refuses a trusted submitter of the facts it scores. The substitution is the whole of it: rather than reconstructing adoption after the fact and then building the machinery to make that reconstruction believable &mdash; a posting, a bond, a challenge window, a forum &mdash; it has the chain verify each fact at the moment the fact occurs. What remains is arithmetic over numbers that are already final: no allocator, no submitter, no challenger, no referee, and no window anyone must be awake for. The authors and designers who broadened the substrate are paid on the strength of what their artifacts demonstrably coordinated, and nothing in between has an opinion.
                </p>
            </PaperSection>
        </PaperLayout>
    );
}
