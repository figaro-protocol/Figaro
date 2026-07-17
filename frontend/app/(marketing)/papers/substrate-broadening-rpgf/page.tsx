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
        "An optimistic, deterministically verifiable allocation mechanism that distributes 600M florins to clause authors and assembly designers of record across three tranches. Artifacts are scored by counterparty diversity over raw volume, value is excluded, and a 15% per-wallet cap is enforced by iterative water-filling. Each tranche's payout root is posted under a bond and finalizes only after an open challenge window, so anyone can recompute it exactly from public chain events and challenge a mismatch.",
};

export default function SubstrateBroadeningRpgfPaper() {
    return (
        <PaperLayout slug="substrate-broadening-rpgf"
            title="Substrate-Broadening Retroactive Public-Goods Funding"
            subtitle="An Optimistic Allocation Mechanism for Protocol Artifact Authors"
            author="Alessandro Daliana"
            date="July 2026"
            watermark="Figaro Protocol · Preprint"
            keywords="retroactive public goods funding, mechanism design, resource allocation, optimistic verification, bonded challenge, deterministic recompute, clause authoring, assembly design, coordination protocols"
            abstract={
                <>
                    <p>
                        A permissionless coordination protocol grows by accretion of the artifacts that extend its substrate &mdash; in the Figaro protocol, the <em>clauses</em> that define new attestation and agreement types and the <em>assemblies</em> that compose them into reusable coordinations. The authors of those artifacts perform public-goods work: once registered, an artifact is usable by every participant at no charge to them and no recurring revenue to its author. This paper develops the mechanism by which the florin, the Figaro protocol&rsquo;s money, funds that work retroactively: a fixed 600-million-unit reserve, released across three tranches at years 2, 5, and 9, allocated to clause authors and assembly designers of record by a published, hash-anchored scoring formula. The mechanism&rsquo;s distinctive choice is what it measures. It does not reward volume, and it does not reward value moved: it rewards <em>substrate-broadening</em> &mdash; adoption of an artifact across many distinct counterparty relationships, in processes that actually settled &mdash; weighting counterparty diversity above raw process count. Payment and bond size never enter the score. A tier-1 graph weighting rewards artifacts that anchor analytically valuable article groups and that sit deeper in process chains; a 15% per-wallet cap, enforced by iterative water-filling, bounds concentration; and a family of eligibility filters closes the cheap farming vectors.
                    </p>
                    <p>
                        The allocation is verifiable without trusting any allocator or submitter. The scoring formula is deterministic over public chain events, and its exact bytes are anchored on chain. Each tranche&rsquo;s payout Merkle root is not proved into place; it is <em>posted</em> under an economic bond, and it finalizes only if it survives an open challenge window unchallenged. The window over which the formula runs is defined by the chain itself &mdash; every event up to the block before the posting &mdash; so any observer recomputes the exact root with integer-only arithmetic and challenges a mismatch, and a challenge always voids the posting. This covers <em>input provenance</em>, the residual trust a proof of correct computation cannot discharge, because the inputs are not supplied by anyone: they are read from the public ledger. The formula and its constants are fixed at deployment; changing them would require deploying a new token system.
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
                    The Figaro settlement kernel is deliberately minimal: it verifies two signatures, escrows two bonds, and resolves a process atomically. Everything that gives a bonded commitment meaning beyond &ldquo;party A paid party B&rdquo; &mdash; what was promised, what was attested, what credential was presented, what handoff occurred &mdash; lives in <em>clauses</em>: content-typed agreement and attestation definitions, each registered permissionlessly on the clause registry. Clauses compose into <em>assemblies</em>: reusable coordinations that a designer publishes once and that any buyer can instantiate thereafter. Clauses and assemblies are the protocol&rsquo;s substrate. The reachable surface of coordinations the protocol can express is exactly the set of artifacts that exist.
                </p>
                <p>
                    Authoring an artifact is public-goods work in the strict sense. A registered clause is non-rival (one author&rsquo;s registration does not consume another&rsquo;s ability to use it), non-excludable (anyone may attest under a registered clause), and uncompensated by the protocol&rsquo;s own operation (the kernel takes no fee, and there is no per-attestation or per-settlement revenue path). The author who writes a high-quality logistics-attestation clause, or the designer who composes a handoff assembly that a hundred unrelated buyers later instantiate, captures none of the value their work creates for the network. This is the canonical under-provision problem of public goods, reproduced at the protocol-substrate layer.
                </p>
                <p>
                    Retroactive public-goods funding (RPGF), developed in practice by the Optimism Collective (2021), addresses under-provision by rewarding work after its value is observable rather than speculating on it in advance. The intuition is that judging impact is easier in retrospect than prospect. This paper specifies a fully mechanized instance of that intuition for protocol-artifact authoring: a fixed florin reserve, released in tranches years after the work, allocated by an objective scoring function computed over on-chain settlement history &mdash; with no committee, no vote, no discretionary curation, and no privileged party who supplies the inputs. Where Optimism&rsquo;s practice retains human badgeholder panels to score impact, this mechanism replaces the panel with a formula and the ballot with a public recompute; what it keeps from that lineage is the retroactivity and the discipline of <em>publishing the rule</em> so that anyone can rerun it.
                </p>
                <PaperRun title="Contribution.">
                    The contribution is a concrete, fixed, optimistically verifiable allocation mechanism with three properties we develop in turn: (i) it scores artifacts by <em>substrate-broadening</em> &mdash; counterparty diversity in settled processes &mdash; rather than by volume or value, behind a set of eligibility filters that close the cheap farming vectors; (ii) it bounds concentration with a per-wallet cap enforced by iterative water-filling; and (iii) it makes each tranche&rsquo;s allocation verifiable not by a proof but by a posted-root, bonded-challenge game over a chain-defined event window, so that the trust a proof of correct computation cannot discharge &mdash; the provenance of its inputs &mdash; is discharged by the ledger itself.
                </PaperRun>
                <PaperRun title="Paper organization.">
                    Section 2 states the allocation problem &mdash; what is allocated, to whom, and under what constraints. Section 3 develops the substrate-broadening objective. Section 4 develops the eligibility filters that make the objective farming-resistant. Section 5 gives the scoring formula and the diversity-over-volume rationale. Section 6 develops the tier-1 graph weighting. Section 7 develops the concentration cap. Section 8 develops the optimistic distribution and its trust model. Section 9 examines a proof-gated design that was considered and rejected. Section 10 states scope and limitations. Section 11 concludes.
                </PaperRun>
            </PaperSection>

            <PaperSection title="2. The Allocation Problem">
                <PaperRun title="What is allocated.">
                    The florin reserves 600 million units &mdash; 60% of the one-billion fixed supply &mdash; for artifact-author funding. The reserve is released in three tranches: 300M at year 2, 200M at year 5, and 100M at year 9 (50% / 33% / 17% of the reserve; 30% / 20% / 10% of total supply). The schedule is front-loaded because early-network substrate growth has higher marginal coordination value, and the nine-year tail reserves a share for sustained contribution. The tranche budgets are immutable constants set at deployment, and each tranche&rsquo;s earliest-posting time is a fixed timestamp fixed in the same act; no party can accelerate, delay, or resize a tranche after deployment.
                </PaperRun>
                <PaperRun title="To whom.">
                    Allocation goes to the artifacts&rsquo; authors and designers <em>of record</em> &mdash; the first-write-wins wallets that registered them. A clause&rsquo;s author of record is the wallet that first registered its string identifier (later versions of the same clause merge into that author&rsquo;s account); an assembly&rsquo;s designer of record is the wallet that first registered its composition. One resolved process credits its assembly&rsquo;s designer and, independently, the author of every clause attested within it. There is no per-attestation, per-seller, or per-settlement reward path: a seller who attests heavily under someone else&rsquo;s clause earns nothing from RPGF, and a buyer who settles a thousand processes earns nothing from RPGF. The recipient set is exactly the set of artifact authors and designers with non-zero eligible adoption, determined by registry state, with no curation step.
                </PaperRun>
                <PaperRun title="Under what constraints.">
                    The mechanism operates under constraints inherited from the protocol&rsquo;s design discipline. It must introduce no governance surface (every governance parameter is an attack surface the protocol exists to avoid) and no human curation (which would reintroduce the discretionary authority the protocol displaces). It must resist gaming: because the recipient is decided by an objective formula over public data, the formula must not reward behavior that is cheap to manufacture and uncorrelated with genuine substrate growth. And it must be verifiable: a participant assessing the token should be able to confirm that each tranche was allocated by the stated rule, not by an allocator&rsquo;s preference and not over inputs an allocator chose.
                </PaperRun>
                <PaperRemark title="Why not prospective or per-use funding.">
                    Two alternatives are deliberately excluded. <em>Prospective</em> funding by committee &mdash; grants decided before the work by a panel that predicts impact &mdash; reintroduces exactly the discretion the protocol displaces. (Prospective funding need not be discretionary: a crowd-steered matching round, where many independent donors direct a pool under a published formula, funds work going forward without a committee &mdash; but it is a distinct instrument for a distinct job, and the retroactive, artifact-attached allocation developed here is what this paper specifies.) <em>Per-use</em> funding (a micro-payment on each attestation under a clause) couples token issuance to protocol activity, which invites wash-attestation to farm the reward and muddies the token&rsquo;s meaning &mdash; the same coupling the token&rsquo;s focal-point design forbids. Retroactive, lump-sum, formula-based allocation avoids both failure modes: impact is observed, not predicted, and the reward attaches to the durable artifact (the clause, the assembly) rather than to the gameable event (an attestation).
                </PaperRemark>
            </PaperSection>

            <PaperSection title="3. The Substrate-Broadening Objective">
                <p>
                    The allocation table fixes how many florins each tranche distributes but not <em>which</em> authors receive them or in what proportion. That is decided by the objective the mechanism optimizes for, and the choice of objective is the substantive design decision. We call it <em>substrate-broadening</em>.
                </p>
                <p>
                    An artifact broadens the protocol&rsquo;s substrate to the extent that it is adopted across genuinely distinct coordination relationships. The reachable surface of the protocol is not the number of times any single relationship transacts; it is the number of distinct relationships the protocol can express and secure. A clause that fifty unrelated buyer&ndash;seller pairs each adopt has extended the protocol into fifty relationships that did not previously coordinate through it. A clause that one pair uses fifty times has deepened a single relationship but not broadened the surface. Both are valuable; only the first is <em>substrate-broadening</em>, and that is the quantity the mechanism rewards.
                </p>
                <PaperRun title="The resolved-only principle.">
                    The objective is measured only over work that settled. An attestation counts toward an artifact&rsquo;s score only if the process it belongs to has resolved. An artifact written into agreements that never reach resolution earns nothing; an artifact with no resolved adoption in a tranche&rsquo;s window receives zero by absence. This ties the reward to completed coordination rather than to declared intent, and it removes the cheapest gaming vector &mdash; manufacturing unsettled commitments to inflate a count &mdash; because an unsettled commitment is invisible to the formula. Resolution is the first of several eligibility filters, developed in Section 4.
                </PaperRun>
                <PaperRun title="Relation to quadratic funding.">
                    The diversity-over-volume principle has a direct antecedent in quadratic funding (Buterin, Hitzig, &amp; Weyl, 2019), where a public good&rsquo;s match weights the square of the summed square-roots of individual contributions &mdash; <Math>{"\\bigl(\\sum_i \\sqrt{c_i}\\bigr)^2"}</Math> &mdash; so that many small contributions outweigh few large ones and broad support outweighs concentrated support. Substrate-broadening applies the same intuition on a different axis: it rewards breadth of <em>adoption</em> (distinct counterparty pairs) over depth of use (repeated transactions), so that an artifact embraced widely outscores one used intensively by few. The mechanism is not quadratic funding &mdash; there is no matching pool against contributions, and the exponents differ &mdash; but it shares the foundational commitment to weighting breadth above magnitude. (The protocol operates a genuine quadratic-funding instrument separately &mdash; a crowd-steered matching round that splits a funded pool by the square of summed square-roots of independent donations; this retroactive mechanism is its complement, applying the same breadth-over-magnitude commitment on the adoption axis rather than the contribution axis.)
                </PaperRun>
            </PaperSection>

            <PaperSection title="4. Eligibility and Farming Resistance">
                <p>
                    Because the recipient is decided by an objective count over public data, the count must not reward behavior that is cheap to manufacture and uncorrelated with genuine substrate growth. Four filters, applied before any score is computed, close the cheap vectors. Each is a predicate over public chain state, so each is as reconstructible as the score it gates.
                </p>
                <ul className="space-y-2 list-disc pl-6 text-sm">
                    <li><span className="font-semibold text-ink-heading">Resolved-only.</span> A process contributes to any artifact&rsquo;s score only if it resolved within the window. Unsettled commitments carry no economic finality and are invisible to the formula (Section 3).</li>
                    <li><span className="font-semibold text-ink-heading">Staked root seller.</span> A process counts only if the seller on its root order held a live seller-registry stake at the moment of resolution. Manufacturing counterparty diversity from throwaway seller identities therefore requires standing registry stake behind each one &mdash; capital at risk, not a fresh keypair.</li>
                    <li><span className="font-semibold text-ink-heading">Live artifact stake.</span> A clause counts only while at least one of its registrations retains its registry deposit; an assembly counts only while its composition retains its deposit. An author who withdraws the stake behind an artifact removes it from scoring &mdash; the reward attaches to artifacts their authors continue to stand behind.</li>
                    <li><span className="font-semibold text-ink-heading">Per-pair cap.</span> A single counterparty pair contributes at most five processes to any one artifact&rsquo;s process count, taken in resolution order; processes beyond the fifth for that pair are dropped from the artifact&rsquo;s aggregation entirely. Repeating the same relationship cannot inflate an artifact&rsquo;s score without bound, which reinforces breadth over depth at the counting layer, not only in the exponents.</li>
                </ul>
                <p>
                    Two article groups are excluded from scoring outright, independent of adoption. <em>Mandatory-article</em> clauses &mdash; those committed on every order regardless of what the order does &mdash; carry zero signal about contribution: their usage is unconditional, so counting it would reward ubiquity rather than substrate-broadening. The <em>provenance</em> article is excluded as scoring infrastructure: it is the mechanism by which a process declares which assembly it instantiates (Section 8), and it must not itself earn from the linkage it exists to record. Both exclusions read the article from the artifact&rsquo;s content-addressed spec; nothing about the exclusion is stored on chain.
                </p>
            </PaperSection>

            <PaperSection title="5. The Scoring Formula">
                <p>
                    Per tranche, the aggregator builds one snapshot per eligible artifact from the window of on-chain events, and scores each:
                </p>
                <div className="my-3 overflow-x-auto">
                    <Math display>{"\\text{score}(a) \\;=\\; w_{\\text{tier1}}(a)\\;\\cdot\\; c(a)^{\\,\\alpha}\\;\\cdot\\; d(a)^{\\,1-\\alpha}, \\qquad \\alpha = \\tfrac{1}{3}."}</Math>
                </div>
                <ul className="space-y-1 list-disc pl-6 text-sm">
                    <li><Math>{"c(a)"}</Math> &mdash; the number of distinct resolved <em>processes</em> in which artifact <Math>{"a"}</Math> was adopted, after the per-pair cap.</li>
                    <li><Math>{"d(a)"}</Math> &mdash; the number of distinct buyer&ndash;seller <em>pairs</em> across those processes.</li>
                    <li><Math>{"w_{\\text{tier1}}(a)"}</Math> &mdash; the graph weight, developed in Section 6, with range <Math>{"[1.0, 5.0]"}</Math>.</li>
                </ul>
                <p>
                    An artifact with zero processes or zero pairs scores zero. The exponent split is the load-bearing choice. With <Math>{"\\alpha = \\tfrac13"}</Math>, the diversity term <Math>{"d(a)"}</Math> carries the larger exponent (<Math>{"1-\\alpha = \\tfrac23"}</Math>), so counterparty diversity dominates raw process count: holding the product <Math>{"c \\cdot d"}</Math> fixed, an artifact scores higher the more its activity is spread across distinct pairs rather than concentrated in repeated processes between the same parties. The split expresses &mdash; not derives &mdash; the design judgment that breadth outweighs volume, and it is fixed at deployment.
                </p>
                <PaperRun title="Integer arithmetic throughout.">
                    The score is computed with integer arithmetic and no floating point anywhere &mdash; the equivalent integer form is <Math>{"w_{\\text{tier1}} \\cdot \\lfloor\\sqrt[3]{\\,c\\,d^{2}\\cdot 10^{18}}\\,\\rfloor"}</Math>, using a floor integer cube root over arbitrary-precision integers, with the graph weight carried in integer thousandths. This is not an implementation footnote: it is what makes the recompute of Section 8 <em>exactly</em> reproducible. Any two observers running the formula over the same window obtain not approximately equal scores but bit-identical roots, so a disagreement is unambiguous rather than a matter of rounding.
                </PaperRun>
                <PaperRun title="Value is deliberately excluded.">
                    Neither payment nor bond size enters the formula. The protocol&rsquo;s cost to move one unit of value equals its cost to move a trillion; an artifact that broadens coordination across many small settlements has done the same substrate work as one used in a few large ones. Weighting by value would import a &ldquo;total value locked matters&rdquo; metric from financial protocols that the coordination layer rejects &mdash; and it would skew the reward toward whoever authors the artifacts that high-value transactions happen to use, which is uncorrelated with how broadly an artifact extends the substrate. The omission is principled, not an oversight.
                </PaperRun>
            </PaperSection>

            <PaperSection title="6. Tier-1 Graph Weighting">
                <p>
                    The graph weight <Math>{"w_{\\text{tier1}}"}</Math> adds two dimensions to the score by additive composition,
                </p>
                <div className="my-3 overflow-x-auto">
                    <Math display>{"w_{\\text{tier1}} \\;=\\; 1 + \\bigl(w_{\\text{cat}} - 1\\bigr) + \\bigl(w_{\\text{topo}} - 1\\bigr),"}</Math>
                </div>
                <p>
                    each dimension contributing a factor in <Math>{"[1.0, 3.0]"}</Math>, for a combined range of <Math>{"[1.0, 5.0]"}</Math>.
                </p>
                <PaperRun title="Category weight.">
                    <Math>{"w_{\\text{cat}}"}</Math> is <Math>{"3.0"}</Math> for clauses whose <em>article</em> is tier-1 and <Math>{"1.0"}</Math> otherwise; assemblies always take <Math>{"1.0"}</Math>. The tier-1 articles are the physical- and virtual-flow groups &mdash; logistics and coordination &mdash; whose attestations draw the map of <em>where</em> and <em>how</em> work moved, the one graph that payment and topology alone cannot emit. That map is the public good the protocol most needs and the least likely to arise unincentivized, so the formula pays more for the artifacts that draw it. The tier-1 article set is fixed at deployment and reversible only by deploying a new token system. Crucially, the <em>set of articles</em> is fixed but the <em>clauses inside each article</em> are not: any third-party clause whose article is tier-1 inherits the tier-1 category weight at the next tranche, with no change to the kernel and no permission required. The weighting privileges a category of work, not a privileged set of authors.
                </PaperRun>
                <PaperRun title="Topology weight.">
                    <Math>{"w_{\\text{topo}}"}</Math> is the artifact&rsquo;s mean position in the process chains it appeared in over the window, clamped to <Math>{"[1.0, 3.0]"}</Math>. Artifacts used deeper in process chains &mdash; later in the process&rsquo;s commit sequence, where accumulated upstream value is larger and more coordination depends on correct attestation &mdash; weigh more. Depth is a proxy for structural load: an artifact that reliably carries meaning at chain position three is doing more coordination work than one used only at the root.
                </PaperRun>
                <PaperRemark title="Why additive, not multiplicative.">
                    Composing the two dimensions additively (each as an excess-over-one increment) rather than multiplicatively bounds the combined weight at <Math>{"5.0"}</Math> and keeps each dimension&rsquo;s contribution legible and independent. A multiplicative composition would let the two dimensions compound to <Math>{"9.0"}</Math> and would make an artifact&rsquo;s weight disproportionately sensitive to scoring well on both at once &mdash; a sharper incentive edge than the mechanism intends.
                </PaperRemark>
            </PaperSection>

            <PaperSection title="7. The Concentration Cap">
                <p>
                    Raw scores are summed per recipient wallet before any cap is applied: a wallet&rsquo;s score is the total of every artifact it authored or designed, and the clause-author and assembly-designer families merge into one per-wallet quantity. A per-wallet cap of <Math>{"15\\%"}</Math> of the tranche is then enforced, so that no single wallet can take more than 15% of a tranche regardless of how dominant its artifacts&rsquo; scores are &mdash; and because the cap spans both families, an author cannot evade it by splitting contribution between clauses and assemblies. The cap bounds capture: it prevents a single prolific or well-positioned recipient from absorbing a tranche, preserving the funding&rsquo;s public-goods character.
                </p>
                <PaperRun title="Iterative water-filling.">
                    The cap is enforced by iterative water-filling. Any wallet whose pro-rata share would exceed the cap is fixed at the cap and removed from the pool, and the remaining budget is re-split pro-rata across the wallets still under it. Because a redistribution can push a previously under-cap wallet above the cap, the procedure iterates to a fixpoint &mdash; repeating until no uncapped wallet exceeds the cap. This is the standard water-filling construction: the capped quantities are held at their ceiling while the freed budget flows to the unconstrained recipients, level by level, until equilibrium. The split is computed with integer flooring; the resulting rounding dust stays unminted, since the tranche budget is a ceiling, not a target.
                </PaperRun>
                <PaperRun title="The degenerate case.">
                    If every wallet is at or above the cap &mdash; possible only when the number of distinct recipients is at most <Math>{"1/0.15 \\approx 6"}</Math> &mdash; all shares are truncated to the cap and the procedure stops. The residual budget goes unallocated by design. The cap&rsquo;s purpose is to bound concentration, not to guarantee full budget consumption; in a tranche with too few recipients to distribute under the cap, leaving budget unminted is the correct behavior, not a failure.
                </PaperRun>
                <p>
                    Capped shares scale to florin amounts against the tranche budget, and the resulting <Math>{"(\\text{wallet}, \\text{amount})"}</Math> pairs form the leaves of the tranche&rsquo;s Merkle tree.
                </p>
            </PaperSection>

            <PaperSection title="8. The Optimistic Distribution and Its Trust Model">
                <p>
                    The 600M reserve is held by a single minter contract with three immutable tranche stages, each parameterized by an immutable earliest-posting time. Per-tranche Merkle roots are not baked in at deployment &mdash; they cannot be, because the scoring window for year 9 does not exist at year 0. Nor are they proved into place. Each root is <em>posted</em>, and the mechanism&rsquo;s legitimacy rests on the conditions under which a posted root becomes payable.
                </p>
                <PaperRun title="The window is defined by the chain, not supplied.">
                    The formula runs over a window that begins at the genesis block and ends at the block immediately before the posting transaction. Every event up to that block is in scope; nothing later is. The window is therefore not an input any party chooses and hands to the mechanism &mdash; it is fixed by the act of posting, and it is the same window for every observer who looks. This is the pivot on which the whole trust model turns: there is no event stream to doctor, because there is no submitter who supplies one. The inputs are the public ledger, read at a chain-defined boundary.
                </PaperRun>
                <PaperRun title="Post, challenge, finalize.">
                    Once a tranche&rsquo;s earliest-posting time passes, <em>anyone</em> may post that tranche&rsquo;s payout root, staking an ETH bond and recording the window it computed over. During an open challenge window, <em>anyone</em> may stake an equal bond to challenge the posting; a challenge <em>always</em> voids it, with no adjudication of validity, because reposting a correct root is cheap and a wrong root should never survive. A posting that lasts its full challenge window unchallenged finalizes, and the poster&rsquo;s bond returns. The formula&rsquo;s exact bytes are anchored in the minter, so any observer recomputes the posted root from the public window with the integer arithmetic of Section 5 and challenges a mismatch. Recompute determinism is not merely argued but demonstrated: an identical root is obtained across two independently rebuilt chains, because the arithmetic admits exactly one answer for any window.
                </PaperRun>
                <PaperRun title="Challenges settle money, never mints.">
                    A challenge routes the two bonds to a separate settlement track and nothing else. The poster may escalate a challenge to a composed arbitration forum by paying its fee, in which case the forum&rsquo;s ruling awards the bonds to one party or splits them; a poster who does not escalate within a dispute window concedes the bonds to the challenger. The forum decides only who keeps the bonds &mdash; it never decides whether a mint happens. Minting is purely mechanical: an unchallenged window yields a finalized root, and a finalized root yields Merkle claims. No panel, no vote, and no forum sits between a correct posting and the payout it authorizes.
                </PaperRun>
                <PaperRun title="Input provenance is covered.">
                    The design this mechanism replaced proved that the formula had been applied correctly to a supplied event window, but it could not prove that the window mirrored chain history &mdash; a trusted-submitter assumption we treat below (Section 9). The optimistic construction discharges exactly that residual. Because the window is chain-defined and the events are public, a fraudulent allocation is not merely detectable after the fact but <em>rejectable before payment</em>: any honest party recomputes the true root and challenges the false posting inside its window, voiding it. The mechanism is free of both allocator discretion and input-provenance trust, at zero recurring cost to anyone but the parties to a dispute.
                </PaperRun>
                <PaperRun title="Linking a process to its assembly.">
                    Crediting an assembly&rsquo;s designer requires linking a resolved process to the assembly it instantiated. That linkage is itself a clause: the provenance article. At checkout the process attests the composition identifier of the assembly it is instantiating &mdash; the template carries its own composition identifier, which the buyer&rsquo;s attestation commits &mdash; and that attestation is the designer-credit event. The recompute inverts the attested reference back to the registered composition, and thence to its designer of record. Because the provenance article is scoring infrastructure, it is excluded from earning (Section 4); it records the linkage on which the assembly leg depends without itself being paid for the linkage.
                </PaperRun>
                <PaperRun title="Claiming.">
                    Once a tranche&rsquo;s root is finalized, each listed recipient claims by presenting a Merkle proof of their <Math>{"(\\text{wallet}, \\text{amount})"}</Math> leaf; the claim may be submitted by anyone on the recipient&rsquo;s behalf, and the mint always goes to the recipient. Claims never expire &mdash; there is no owner, no sweep, and no reclamation of unclaimed funds. The claim is one-shot per wallet per tranche, a per-tranche budget backstop rejects any claim that would overspend the tranche, and the token&rsquo;s own per-minter cap independently bounds total issuance from the reserve at 600M. No claim can exceed what the finalized root authorizes.
                </PaperRun>
                <PaperRun title="The formula is fixed.">
                    The exponent split <Math>{"\\alpha = \\tfrac13"}</Math>, the <Math>{"15\\%"}</Math> cap, the per-pair cap, the excluded articles, and the tier-1 article set are all deployment constants, carried in a single published artifact whose exact bytes are anchored in the minter. One formula is committed and applied unchanged across all three tranches. Changing any constant would change the artifact&rsquo;s hash and so require deploying a new token system, because the minter is sealed at deployment and admits no reconfiguration. A participant assessing the mechanism at any time can verify from on-chain state that the rule cannot be altered between tranches.
                </PaperRun>
            </PaperSection>

            <PaperSection title="9. A Rejected Alternative: Proof-Gated Verification">
                <p>
                    The optimistic construction was not the first design. Its predecessor gated each posted root behind a zero-knowledge proof: a succinct-proof virtual machine (Succinct Labs, 2024) ran the canonical aggregator as its guest program and attested that the submitted root was the correct output of applying the frozen formula to a specific event window supplied as input. That design is worth stating precisely, because its one honest limitation is what motivated the turn to optimism.
                </p>
                <p>
                    The proof bound the <em>formula</em> to the <em>inputs</em>: given those events, the root was provably the formula&rsquo;s output, computed with no deviation, no favoritism, and no off-formula adjustment. What it could not bind was the <em>inputs</em> to <em>chain history</em>. A submitter who fed the prover a doctored event stream &mdash; omitting some artifacts&rsquo; attestations, inventing others &mdash; would obtain a valid proof for the wrong allocation, because the proof certifies correct computation over the inputs, not the provenance of the inputs. Input provenance was a trusted-submitter assumption. The proof removed trust in the allocator&rsquo;s arithmetic and discretion but relocated a residual trust to the integrity of the supplied window &mdash; and it paid the full price of proving infrastructure to do so.
                </p>
                <p>
                    The optimistic mechanism is strictly stronger on exactly this axis. It removes the same allocator discretion, and it additionally removes the submitter: there is no supplied window to doctor, because the window is the public ledger read at a chain-defined boundary, and any honest party recomputes the true root and voids a false posting before it can pay out. It achieves this with no proving infrastructure and no recurring cost to anyone but disputing parties. The proof-gated design remains the right tool for a different problem &mdash; batch-settlement scaling, where signatures must be verified in-circuit rather than read from logs &mdash; but for retroactive allocation over public events, deterministic recompute under a bonded challenge dominates it. We retain the account of the rejected design not as a footnote but because naming the trust a proof cannot discharge is what makes the case for the mechanism that discharges it.
                </p>
            </PaperSection>

            <PaperSection title="10. Scope and Limitations">
                <PaperRun title="Cohort selection is the formula, by construction.">
                    The mechanism deliberately has no cohort-selection policy. The recipient set is the set of artifact authors and designers with non-zero eligible adoption in the window, and the proportions are the formula&rsquo;s output. There is no list of approved recipients to curate and no committee to convene. This is a feature &mdash; it is what makes the mechanism discretion-free &mdash; but it means the mechanism funds exactly two kinds of contribution (clause authoring and assembly design) and is silent on every other kind of protocol work (client development, documentation, review, operations). Those are funded, if at all, through the separately-held treasury allocation &mdash; which may itself direct that funding through a crowd-steered matching round rather than a committee &mdash; not through this mechanism.
                </PaperRun>
                <PaperRun title="Single denomination per process.">
                    The eligibility filters and the counting layer read a process&rsquo;s parties and resolution from chain state directly; they take no position on the currency a process settles in, and they compare no values across currencies (value never enters the score). The mechanism therefore inherits, and does not relax, the kernel&rsquo;s single-denomination-per-process boundary: it scores the shape of coordination, not the units it moved.
                </PaperRun>
            </PaperSection>

            <PaperSection title="11. Conclusion">
                <p>
                    Artifact authoring &mdash; writing the clauses and composing the assemblies &mdash; is the public-goods work that grows a permissionless coordination protocol&rsquo;s substrate, and it is uncompensated by the protocol&rsquo;s own operation. The mechanism developed here funds it retroactively, from a fixed 600M florin reserve released in three tranches, allocated by a fixed formula that rewards substrate-broadening &mdash; adoption across distinct counterparty relationships in settled processes &mdash; over volume or value, behind eligibility filters that close the cheap farming vectors, with a tier-1 graph weighting for analytically load-bearing and structurally deep artifacts and a 15% per-wallet concentration cap enforced by iterative water-filling.
                </p>
                <p>
                    The mechanism&rsquo;s claim to legitimacy rests on four refusals and one construction. It refuses governance; it refuses human curation, and in particular the badgeholder panel that retroactive-funding practice elsewhere retains; it refuses to couple issuance to gameable per-use events; and it refuses a trusted submitter of the inputs it scores. In place of a proof, it stands each tranche&rsquo;s allocation on a posted root under a bond, finalized only if it survives an open challenge, recomputable by anyone to a bit-identical answer from a chain-defined window of public events. The result is an allocation free of allocator discretion, free of input-provenance trust, fixed against mid-stream change, and verifiable by anyone &mdash; funding the authors and designers who broaden the substrate on the strength of what their artifacts demonstrably coordinated.
                </p>
            </PaperSection>
        </PaperLayout>
    );
}
