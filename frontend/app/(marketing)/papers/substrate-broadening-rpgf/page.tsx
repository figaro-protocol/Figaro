import type { Metadata } from "next";
import {
    PaperLayout,
    PaperSection,
    PaperSubsection,
    PaperRun,
    PaperRemark,
} from "@/components/papers/PaperLayout";
import { Math } from "@/components/papers/Math";

export const metadata: Metadata = {
    title: "Substrate-Broadening Retroactive Public-Goods Funding — Figaro Protocol",
    description:
        "A frozen, zero-knowledge-verified allocation mechanism that distributes 600M FIG to clause authors across three tranches. Clauses are scored by counterparty diversity over raw volume, value is deliberately excluded, and a 15% per-author cap is enforced by iterative water-filling.",
};

export default function SubstrateBroadeningRpgfPaper() {
    return (
        <PaperLayout
            title="Substrate-Broadening Retroactive Public-Goods Funding"
            subtitle="A Verifiable Allocation Mechanism for Protocol Clause Authors"
            author="Alessandro Daliana"
            date="May 2026"
            watermark="Figaro Protocol · Preprint"
            keywords="retroactive public goods funding, mechanism design, resource allocation, quadratic funding, zero-knowledge verification, clause authoring, coordination protocols"
            abstract={
                <>
                    <p>
                        A permissionless coordination protocol grows by accretion of the artifacts that extend its substrate &mdash; in the Figaro protocol, the clauses that define new attestation and agreement types. The authors of those clauses perform public-goods work: a clause, once registered, is usable by every participant at no charge to them and no recurring revenue to its author. This paper develops the mechanism by which the Figaro token (FIG) funds that work retroactively: a fixed 600-million-unit reserve, released across three tranches at years 2, 5, and 9, allocated to clause authors by a frozen scoring formula.
                    </p>
                    <p>
                        The mechanism&rsquo;s distinctive choice is what it measures. It does not reward volume, and it does not reward value moved: it rewards <em>substrate-broadening</em> &mdash; adoption of a clause across many distinct counterparty relationships, in processes that actually settled. A clause written into a hundred agreements that never resolve earns nothing; a clause used once between each of fifty distinct buyer&ndash;seller pairs broadens the protocol&rsquo;s reachable surface more than the same clause used fifty times between one pair, and the formula weights counterparty diversity above raw process count accordingly. Payment and bond size never enter the score. A tier-1 graph weighting rewards clauses that anchor analytically valuable families and that sit deeper in process chains; a 15% per-author cap, enforced by iterative water-filling, bounds concentration.
                    </p>
                    <p>
                        The allocation is verifiable without trusting the allocator. Each tranche&rsquo;s Merkle root is submitted on chain only behind a zero-knowledge proof attesting that the canonical formula was applied correctly to the event window supplied. We are precise about what the proof does and does not establish &mdash; it binds the formula to the inputs, not the inputs to chain history, which remains a trusted-submitter assumption &mdash; and we treat that residual trust honestly rather than claiming it away. The formula and its constants are frozen at deployment and applied unchanged across all three tranches; changing them would require deploying a new token system.
                    </p>
                </>
            }
            references={
                <>
                    <li>Buterin, V., Hitzig, Z., &amp; Weyl, E. G. A Flexible Design for Funding Public Goods. <em>Management Science</em>, 65(11):5171&ndash;5187, 2019.</li>
                    <li>Optimism Collective. <em>Retroactive Public Goods Funding</em>. Optimism PBC Blog, July 2021.</li>
                    <li>Succinct Labs. <em>Introducing SP1: A Performant, 100% Open-Source, Contributor-Friendly zkVM</em>. Succinct Blog, February 2024.</li>
                </>
            }
        >
            <PaperSection title="1. Introduction">
                <p>
                    The Figaro settlement kernel is deliberately minimal: it verifies two signatures, escrows two bonds, and resolves a process atomically. Everything that gives a bonded commitment meaning beyond &ldquo;party A paid party B&rdquo; &mdash; what was promised, what was attested, what credential was presented, what handoff occurred &mdash; lives in <em>clauses</em>: content-typed agreement and attestation definitions, each registered permissionlessly on the clause registry and bound to a validator contract. Clauses are the protocol&rsquo;s substrate. The reachable surface of coordinations the protocol can express is exactly the set of clauses that exist.
                </p>
                <p>
                    Authoring a clause is public-goods work in the strict sense. A clause is non-rival (one author&rsquo;s registration does not consume another&rsquo;s ability to use it), non-excludable (anyone may attest under a registered clause), and uncompensated by the protocol&rsquo;s own operation (the kernel takes no fee, and there is no per-attestation or per-settlement revenue path). The author who writes a high-quality geographic-attestation clause, or a fulfilment-handoff clause that a hundred unrelated assemblies later adopt, captures none of the value their work creates for the network. This is the canonical under-provision problem of public goods, reproduced at the protocol-substrate layer.
                </p>
                <p>
                    Retroactive public-goods funding (RPGF), developed in practice by the Optimism Collective (2021), addresses under-provision by rewarding work after its value is observable rather than speculating on it in advance. The intuition is that judging impact is easier in retrospect than prospect. This paper specifies a fully mechanized instance of that intuition for clause authoring: a fixed FIG reserve, released in tranches years after the work, allocated by an objective scoring function computed over on-chain settlement history &mdash; with no committee, no vote, and no discretionary curation.
                </p>
                <PaperRun title="Contribution.">
                    The contribution is a concrete, frozen, zero-knowledge-verified allocation mechanism with three properties we develop in turn: (i) it scores clauses by <em>substrate-broadening</em> &mdash; counterparty diversity in settled processes &mdash; rather than by volume or value; (ii) it bounds concentration with a per-author cap enforced by iterative water-filling; and (iii) it makes each tranche&rsquo;s allocation verifiable behind a proof that the canonical formula was applied to the supplied inputs, with an honest account of the residual trust the proof does not discharge.
                </PaperRun>
                <PaperRun title="Paper organization.">
                    Section 2 states the allocation problem &mdash; what is allocated, to whom, and under what constraints. Section 3 develops the substrate-broadening objective. Section 4 gives the scoring formula and the diversity-over-volume rationale. Section 5 develops the tier-1 graph weighting. Section 6 develops the concentration cap. Section 7 develops the verifiable-distribution path and its trust model. Section 8 reports the verification surface. Section 9 states scope and limitations. Section 10 concludes.
                </PaperRun>
            </PaperSection>

            <PaperSection title="2. The Allocation Problem">
                <PaperRun title="What is allocated.">
                    The FIG token reserves 600 million units &mdash; 60% of the one-billion fixed supply &mdash; for clause-author funding. The reserve is released in three tranches: 300M at year 2, 200M at year 5, and 100M at year 9 (50% / 33% / 17% of the reserve; 30% / 20% / 10% of total supply). The schedule is front-loaded because early-network substrate growth has higher marginal coordination value, and the nine-year tail reserves a share for sustained contribution. The tranche budgets and unlock times are immutable constants set at deployment.
                </PaperRun>
                <PaperRun title="To whom.">
                    A clause&rsquo;s allocation goes to its <code>clauseAuthor</code> &mdash; the first-write-wins wallet that registered the clause on the registry. One clause, one recipient. There is no per-attestation, per-seller, or per-settlement reward path anywhere in the system: an seller who attests heavily under someone else&rsquo;s clause earns nothing from RPGF, and a buyer who settles a thousand processes earns nothing from RPGF. The recipient set is exactly the set of clause authors, determined by registry state, with no curation step.
                </PaperRun>
                <PaperRun title="Under what constraints.">
                    The mechanism operates under constraints inherited from the protocol&rsquo;s design discipline. It must introduce no governance surface (every governance parameter is an attack surface the protocol exists to avoid) and no human curation (which would reintroduce the discretionary authority the protocol displaces). It must resist gaming: because the recipient is decided by an objective formula over public data, the formula must not reward behavior that is cheap to manufacture and uncorrelated with genuine substrate growth. And it must be verifiable: a participant assessing the token should be able to confirm that each tranche was allocated by the stated rule, not by an allocator&rsquo;s preference.
                </PaperRun>
                <PaperRemark title="Why not prospective or per-use funding.">
                    Two alternatives are deliberately excluded. <em>Prospective</em> funding (grants decided before the work) requires a committee to predict impact and reintroduces discretion. <em>Per-use</em> funding (a micro-payment on each attestation under a clause) couples token issuance to protocol activity, which invites wash-attestation to farm the reward and muddies the token&rsquo;s meaning &mdash; the same coupling the token&rsquo;s focal-point design forbids. Retroactive, lump-sum, formula-based allocation avoids both failure modes: impact is observed, not predicted, and the reward attaches to the durable artifact (the clause) rather than to the gameable event (an attestation).
                </PaperRemark>
            </PaperSection>

            <PaperSection title="3. The Substrate-Broadening Objective">
                <p>
                    The allocation table fixes how much FIG each tranche distributes but not <em>which</em> authors receive it or in what proportion. That is decided by the objective the mechanism optimizes for, and the choice of objective is the substantive design decision. We call it <em>substrate-broadening</em>.
                </p>
                <p>
                    A clause broadens the protocol&rsquo;s substrate to the extent that it is adopted across genuinely distinct coordination relationships. The reachable surface of the protocol is not the number of times any single relationship transacts; it is the number of distinct relationships the protocol can express and secure. A clause that fifty unrelated buyer&ndash;seller pairs each adopt has extended the protocol into fifty relationships that did not previously coordinate through it. A clause that one pair uses fifty times has deepened a single relationship but not broadened the surface. Both are valuable; only the first is <em>substrate-broadening</em>, and that is the quantity the mechanism rewards.
                </p>
                <PaperRun title="The resolved-only filter.">
                    The objective is measured only over work that settled. An attestation counts toward a clause&rsquo;s score only if the order it belongs to is part of a process that has resolved. A clause written into agreements that never reach resolution earns nothing; a clause with no resolved attestations in a tranche&rsquo;s window receives zero by absence. This ties the reward to completed coordination rather than to declared intent, and it removes the cheapest gaming vector &mdash; manufacturing unsettled commitments to inflate a count &mdash; because an unsettled commitment is invisible to the formula.
                </PaperRun>
                <PaperRun title="Relation to quadratic funding.">
                    The diversity-over-volume principle has a direct antecedent in quadratic funding (Buterin, Hitzig, &amp; Weyl, 2019), where a public good&rsquo;s match is a function of the <em>number</em> of distinct contributors rather than the total amount contributed, precisely so that broad support outweighs concentrated support. Substrate-broadening applies the same intuition on a different axis: it rewards breadth of <em>adoption</em> (distinct counterparty pairs) over depth of use (repeated transactions), so that a clause embraced widely outscores one used intensively by few. The mechanism is not quadratic funding &mdash; there is no matching pool against contributions, and the exponents differ &mdash; but it shares the foundational commitment to weighting breadth above magnitude.
                </PaperRun>
            </PaperSection>

            <PaperSection title="4. The Scoring Formula">
                <p>
                    Per tranche, the aggregator builds one snapshot per clause from a window of on-chain events under the resolved-only filter, and scores each clause:
                </p>
                <div className="my-3 overflow-x-auto">
                    <Math display>{"\\text{score}(s) \\;=\\; w_{\\text{tier1}}(s)\\;\\cdot\\; c(s)^{\\,\\alpha}\\;\\cdot\\; d(s)^{\\,1-\\alpha}, \\qquad \\alpha = \\tfrac{33}{100}."}</Math>
                </div>
                <ul className="space-y-1 list-disc pl-6 text-sm">
                    <li><Math>{"c(s)"}</Math> &mdash; the number of distinct resolved <em>processes</em> in which clause <Math>{"s"}</Math> appeared.</li>
                    <li><Math>{"d(s)"}</Math> &mdash; the number of distinct buyer&ndash;seller <em>pairs</em> that used <Math>{"s"}</Math>.</li>
                    <li><Math>{"w_{\\text{tier1}}(s)"}</Math> &mdash; the graph weight, developed in Section 5, with range <Math>{"[1.0, 5.0]"}</Math>.</li>
                </ul>
                <p>
                    A clause with zero processes or zero pairs scores zero. The exponent split is the load-bearing choice. With <Math>{"\\alpha = 0.33"}</Math>, the diversity term <Math>{"d(s)"}</Math> carries the larger exponent (<Math>{"1-\\alpha = 0.67"}</Math>), so counterparty diversity dominates raw process count. Holding the product <Math>{"c \\cdot d"}</Math> fixed, a clause scores higher the more its activity is spread across distinct pairs rather than concentrated in repeated processes between the same parties. The split is a deploy-time constant, chosen to express &mdash; not to derive &mdash; the design judgment that breadth outweighs volume; the simulator that accompanies the implementation explored alternatives, and <Math>{"33/100"}</Math> is the value the system commits to.
                </p>
                <PaperRun title="Value is deliberately excluded.">
                    Neither payment nor bond size enters the formula. The protocol&rsquo;s cost to move one unit of value equals its cost to move a trillion; a clause that broadens coordination across many small settlements has done the same substrate work as one used in a few large ones. Weighting by value would import a &ldquo;total value locked matters&rdquo; metric from financial protocols that the coordination layer rejects &mdash; and it would skew the reward toward whoever authors the clauses that high-value transactions happen to use, which is uncorrelated with how broadly a clause extends the substrate. The omission is principled, not an oversight.
                </PaperRun>
            </PaperSection>

            <PaperSection title="5. Tier-1 Graph Weighting">
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
                    <Math>{"w_{\\text{cat}}"}</Math> is <Math>{"3.0"}</Math> for clauses belonging to a tier-1 <em>family</em> and <Math>{"1.0"}</Math> otherwise. Tier-1 families are the analytically load-bearing categories &mdash; geographic and fulfilment attestation &mdash; whose data feeds the protocol&rsquo;s public coordination graphs. The set of tier-1 families is hard-coded at deployment and is reversible only by deploying a new token system. Crucially, the <em>families</em> are frozen but the <em>clauses inside each family</em> are not: any third-party clause registered under a tier-1 family key inherits the tier-1 category weight at the next tranche, with no change to the kernel and no permission required. The weighting privileges a category of work, not a privileged set of authors.
                </PaperRun>
                <PaperRun title="Topology weight.">
                    <Math>{"w_{\\text{topo}}"}</Math> is the clause&rsquo;s mean position in the process chains it appeared in over the window, clamped to <Math>{"[1.0, 3.0]"}</Math>. Clauses used deeper in process chains &mdash; further from the root buyer, where the accumulated upstream value is larger and more coordination depends on correct attestation &mdash; weigh more. Depth is a proxy for structural load: a clause that reliably carries meaning at chain position three is doing more coordination work than one used only at the root.
                </PaperRun>
                <PaperRemark title="Why additive, not multiplicative.">
                    Composing the two dimensions additively (each as an excess-over-one increment) rather than multiplicatively bounds the combined weight at <Math>{"5.0"}</Math> and keeps each dimension&rsquo;s contribution legible and independent. A multiplicative composition would let the two dimensions compound to <Math>{"9.0"}</Math> and would make a clause&rsquo;s weight disproportionately sensitive to scoring well on both at once &mdash; a sharper incentive edge than the mechanism intends.
                </PaperRemark>
            </PaperSection>

            <PaperSection title="6. The Concentration Cap">
                <p>
                    Raw scores become pro-rata shares of the tranche budget: a clause&rsquo;s share is its score divided by the sum of all scores in the tranche. A per-author cap of <Math>{"15\\%"}</Math> is then enforced, so that no single author can take more than 15% of a tranche regardless of how dominant their clauses&rsquo; scores are. The cap bounds capture: it prevents a single prolific or well-positioned author from absorbing a tranche, preserving the funding&rsquo;s public-goods character.
                </p>
                <PaperRun title="Iterative water-filling.">
                    The cap is enforced by iterative water-filling. Any share above the cap is truncated to the cap, and the truncated excess is redistributed pro-rata across the under-cap shares. Because a redistribution can push a previously under-cap share above the cap, the procedure iterates to a fixpoint &mdash; repeating until no share exceeds the cap. This is the standard water-filling construction: the capped quantity is held at its ceiling while the freed budget flows to the unconstrained recipients, level by level, until equilibrium.
                </PaperRun>
                <PaperRun title="The degenerate case.">
                    If every share is at or above the cap &mdash; possible only when the number of distinct authors is at most <Math>{"1/0.15 \\approx 6"}</Math> &mdash; all shares are truncated to the cap and the procedure stops. The residual budget (the sum of shares minus the number of authors times the cap) goes unallocated by design. The cap&rsquo;s purpose is to bound concentration, not to guarantee full budget consumption; in a tranche with too few authors to distribute under the cap, leaving budget unallocated is the correct behavior, not a failure.
                </PaperRun>
                <p>
                    Capped shares scale to FIG amounts against the tranche budget, and the resulting <Math>{"(\\text{clauseAuthor}, \\text{amount})"}</Math> pairs form the leaves of the tranche&rsquo;s Merkle tree.
                </p>
            </PaperSection>

            <PaperSection title="7. Verifiable Distribution and Its Trust Model">
                <p>
                    The 600M reserve is held by a single minter contract with three immutable tranche stages, each parameterized by an immutable unlock timestamp. Per-tranche Merkle roots are not baked in at deployment &mdash; they cannot be, because the scoring window for year 9 does not exist at year 0. Instead each root is submitted at tranche time by a designated submitter, and the submission is gated by verification of a zero-knowledge proof.
                </p>
                <PaperRun title="What the proof attests.">
                    The proof &mdash; produced by an SP1 zero-knowledge virtual machine (Succinct Labs, 2024) running the canonical aggregator as its guest program &mdash; attests that the submitted Merkle root is the correct output of applying the frozen scoring-and-capping formula to a specific event window supplied as input. It binds the <em>formula</em> to the <em>inputs</em>: given those events, the root is provably the formula&rsquo;s output, computed with no deviation, no favoritism, and no off-formula adjustment.
                </PaperRun>
                <PaperRun title="What the proof does not attest.">
                    The proof does not attest that the supplied event window faithfully mirrors chain history. A submitter who fed the prover a doctored event stream &mdash; omitting some clauses&rsquo; attestations, inventing others &mdash; would obtain a valid proof for the wrong allocation, because the proof certifies correct computation over the inputs, not the provenance of the inputs. Input provenance is a <em>trusted-submitter</em> assumption. We state this plainly rather than eliding it: the zero-knowledge layer removes trust in the allocator&rsquo;s arithmetic and discretion, and relocates the residual trust to the integrity of the event window. Closing that gap &mdash; proving the input window against chain state &mdash; is a strengthening the present design does not yet implement, and the honest characterization is that the mechanism is allocator-discretion-free but not yet input-provenance-free.
                </PaperRun>
                <PaperRun title="Claiming.">
                    Once a tranche&rsquo;s root is recorded and its unlock time has passed, each listed author claims by presenting a Merkle proof of their <Math>{"(\\text{author}, \\text{amount})"}</Math> leaf. The claim is one-shot per author per tranche; the contract mints FIG directly to the claimant, and the token&rsquo;s own per-minter cap independently bounds total issuance from the reserve at 600M. No claim can exceed what the recorded root authorizes.
                </PaperRun>
                <PaperRun title="The formula is frozen.">
                    The exponent split <Math>{"\\alpha = 33/100"}</Math>, the <Math>{"15\\%"}</Math> cap, and the tier-1 family set are deploy-time constants. The zero-knowledge program commits to exactly one formula and applies it unchanged across all three tranches. Changing any of them would require deploying a new token system, because the minter is sealed at deployment and admits no reconfiguration. A participant assessing the mechanism at any time can verify from on-chain state that the rule cannot be altered between tranches.
                </PaperRun>
            </PaperSection>

            <PaperSection title="8. Verification Surface">
                <p>
                    The mechanism is specified twice and checked against itself. The canonical implementation is the Rust aggregator compiled into the zero-knowledge guest program; a TypeScript simulator mirrors it as a conformance specification, and a Solidity-level conformance test asserts that the canonical Merkle root computed by the Rust aggregator matches the root the on-chain contract verifies for a fixed input. The token contract that holds the reserve carries its own formal surface &mdash; supply-cap and minter-cap invariants checked in a model checker and a specification language &mdash; guaranteeing that no path mints beyond the registered 600M reserve cap regardless of what any tranche root claims.
                </p>
                <PaperRun title="Open verification work.">
                    The minter contract that gates tranche submission and claiming does not yet carry a symbolic-execution harness or a specification-language proof of its own; its current coverage is the conformance test and a contract-level regression suite. Porting the retired predecessor contract&rsquo;s symbolic and specification harnesses to the current minter is open work. We report this rather than overclaim a verification completeness the contract does not yet have.
                </PaperRun>
            </PaperSection>

            <PaperSection title="9. Scope and Limitations">
                <PaperRun title="Cohort selection is the formula, by construction.">
                    The mechanism deliberately has no cohort-selection policy. The recipient set is the set of clause authors with non-zero resolved adoption in the window, and the proportions are the formula&rsquo;s output. There is no list of approved recipients to curate and no committee to convene. This is a feature &mdash; it is what makes the mechanism discretion-free &mdash; but it means the mechanism funds exactly one kind of contribution (clause authoring) and is silent on every other kind of protocol work (client development, documentation, review, operations). Those are funded, if at all, through the separately-held treasury allocation, not through this mechanism.
                </PaperRun>
                <PaperRun title="The trusted-submitter assumption.">
                    As Section 7 states, input provenance is trusted. The mechanism&rsquo;s integrity against a malicious submitter rests on the submitter being a known, accountable party and on the event window being independently reconstructible by any observer who wishes to check it &mdash; the events are public, so a fraudulent window is detectable after the fact even though it is not prevented in-proof. A provenance proof binding the window to chain state would remove this assumption and is the natural next strengthening.
                </PaperRun>
                <PaperRun title="The constants are judgments, not derivations.">
                    The exponent split, the cap fraction, the tier-1 family set, and the tranche schedule are design judgments calibrated to express stated principles, not values derived from a first-principles optimization. A different calibration consistent with the same principles is conceivable; the present values are the ones the system commits to and freezes. We claim defensibility under the stated principles, not optimality.
                </PaperRun>
            </PaperSection>

            <PaperSection title="10. Conclusion">
                <p>
                    Clause authoring is the public-goods work that grows a permissionless coordination protocol&rsquo;s substrate, and it is uncompensated by the protocol&rsquo;s own operation. The mechanism developed here funds it retroactively, from a fixed 600M FIG reserve released in three tranches, allocated by a frozen formula that rewards substrate-broadening &mdash; adoption across distinct counterparty relationships in settled processes &mdash; over volume or value, with a tier-1 graph weighting for analytically load-bearing and structurally deep clauses, and a 15% per-author concentration cap enforced by iterative water-filling.
                </p>
                <p>
                    The mechanism&rsquo;s claim to legitimacy rests on three refusals and one proof. It refuses governance, refuses human curation, and refuses to couple issuance to gameable per-use events. And it proves, for each tranche, that the stated formula was applied to the supplied inputs without deviation &mdash; while stating plainly the one trust the proof does not discharge, the provenance of those inputs. The result is an allocation that is free of allocator discretion, frozen against mid-stream change, and verifiable by anyone, funding the authors who broaden the substrate on the strength of what their clauses demonstrably coordinated.
                </p>
            </PaperSection>
        </PaperLayout>
    );
}
