import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import {
    PaperLayout,
    PaperSection,
    PaperSubsection,
    PaperRun,
    PaperRemark,
    PaperScroll,
} from "@/components/papers/PaperLayout";
import { Math } from "@/components/papers/Math";

export const metadata: Metadata = withOg({
    title: "Substrate-Broadening Retroactive Public-Goods Funding — Figaro Protocol",
    description:
        "A fixed rule that distributes 600 million florins to the designers of clauses, registered agreements, and assemblies over a fixed run of periods on a rising budget schedule, scoring each by the distinct staked sellers who carried it in resolved processes, counted on chain by a call anyone may make while the period is open, with Sybil resistance carried by a two-sided live stake whose price the paper derives.",
});

function FormalBlock({ label, children }: { label: string; children: React.ReactNode }) {
    return (
        <div className="border-l-2 border-default pl-6 my-3 space-y-3">
            <p className="text-sm font-semibold text-ink-heading">{label}</p>
            {children}
        </div>
    );
}

function Proof({ children }: { children: React.ReactNode }) {
    return (
        <div className="my-3 space-y-3 text-ink-body">
            <p>
                <span className="italic text-ink-muted">Proof. </span>
                {children}
            </p>
        </div>
    );
}

export default function SubstrateBroadeningRpgfPaper() {
    return (
        <PaperLayout slug="substrate-broadening-rpgf"
            title="Substrate-Broadening Retroactive Public-Goods Funding"
            subtitle="Allocating a Fixed Reserve on Adoption Counted from Resolved Trade"
            author="Figaro"
            date="July 2026"
            watermark="Figaro Protocol · Preprint"
            abstract={
                <>
                    <p>
                        The florin, the token of the Figaro protocol, has a fixed supply, and 600 million units of it, 60%, are reserved to reward the designers of the clauses, registered agreements, and assemblies that processes use. This paper specifies the rule that distributes the reserve. It is distributed over a fixed run of periods, one budget to each, on a schedule that rises from the first period to the last. Within a period each registration&rsquo;s share is its score over the period&rsquo;s total, and the score is <Math>{"c^{1/3}d^{2/3}"}</Math>, where <Math>{"c"}</Math> counts the resolved processes that carried it and <Math>{"d"}</Math> the distinct staked sellers behind them. No tag, category, or identity weights a score; we prove that any weighting layer is either a function of the same counters or a curatorial judgment supplied from outside them.
                    </p>
                    <p>
                        Use is counted on chain, by a call anyone may make while the period is open, from facts the chain already holds: that the order resolved, and that the registration was committed in the agreement both parties signed. Sybil resistance is carried by a live stake in the chain&rsquo;s base currency on both sides of a counted event, and breadth is counted in exactly the unit that stake prices. We derive the consequence: for one registration, fabricated score above a threshold the minimum-support floor sets costs an outlay linear in the score, at a unit price fixed by the member stake, the withdrawal cooldown, the period length, and the gas of one resolved process. Against honest accrual taken as given, capturing a fraction of a period&rsquo;s budget costs an outlay convex in that fraction and unbounded as it approaches one.
                    </p>
                </>
            }
            references={
                <>
                    <li>Buterin, Vitalik, Zo&euml; Hitzig, and E. Glen Weyl. 2019. &ldquo;A Flexible Design for Funding Public Goods.&rdquo; <em>Management Science</em> 65 (11): 5171&ndash;5187. https://doi.org/10.1287/mnsc.2019.3337.</li>
                    <li>Douceur, John R. 2002. &ldquo;The Sybil Attack.&rdquo; In <em>Peer-to-Peer Systems (IPTPS 2002)</em>, edited by Peter Druschel, Frans Kaashoek, and Antony Rowstron, 251&ndash;260. Lecture Notes in Computer Science 2429. Berlin: Springer. https://doi.org/10.1007/3-540-45748-8_24.</li>
                    <li>Figaro. 2026. &ldquo;Asymmetric Bonding and Buyer Dominance: Two Composing Mechanisms for N-Party Coordination Among Strangers.&rdquo; Preprint. https://figaroprotocol.com/papers/asymmetric-bonding/. Accessed October 18, 2026.</li>
                    <li>Kalodner, Harry, Steven Goldfeder, Xiaoqi Chen, S. Matthew Weinberg, and Edward W. Felten. 2018. &ldquo;Arbitrum: Scalable, Private Smart Contracts.&rdquo; In <em>Proceedings of the 27th USENIX Security Symposium (USENIX Security 18)</em>, 1353&ndash;1370. Baltimore, MD: USENIX Association. https://www.usenix.org/conference/usenixsecurity18/presentation/kalodner. Accessed October 27, 2026.</li>
                    <li>Optimism. 2021. &ldquo;Retroactive Public Goods Funding.&rdquo; <em>Optimism PBC Blog</em> (Medium), July 20, 2021. https://medium.com/ethereum-optimism/retroactive-public-goods-funding-33c9b7d00f0c. Accessed September 5, 2026.</li>
                </>
            }
        >
            <PaperSection title="1. Introduction">
                <p>
                    When a process resolves on a public chain, three things are left there: the commitments the parties signed, the bonds those commitments locked, and the buyer&rsquo;s resolution of them. The work and the goods passed off chain; the payments passed on chain, at resolution. This paper builds a reward on that residue alone. Before the reward can be stated, the reader needs the mechanism that produces the residue, and we state the slice of it the argument uses.
                </p>
                <p>
                    Figaro is a protocol for trade between strangers. A <em>process</em> is one buyer&rsquo;s trade with one or more sellers; each <em>order</em> in it is one buyer&ndash;seller commitment, signed by both. The <em>mechanism</em> is two operations: commit, which accepts a signed commitment and locks its bonds, and resolve, which only the buyer calls. At commit both parties bond, and the bonds are what each can count on before the trade. After performance the buyer strictly prefers resolving to never resolving, and given its plan to resolve then and not before, each seller whose co-sellers perform strictly prefers performing. The buyer bonds twice the payment <Math>{"P"}</Math> and each seller twice the cumulative value <Math>{"G"}</Math> through its order, every payment the process has accumulated so far, its own included. The deeper the order, the more value has accumulated through it; that is the most a holdout there could keep, and the bond at twice it deters the holdout. Resolution is atomic: every seller is paid and every bond refunded, the buyer&rsquo;s less the payments it carried, at once, or none is. For parties beyond each other&rsquo;s coercive reach, cooperation is the equilibrium, proved for any number of orders the network resolves in one call in Figaro (2026). What matters here is the consequence. A resolution is the buyer&rsquo;s own acceptance, terminal once given, so it is the one event on the chain that reports a trade completed, and the only one an adoption count can rest on.
                </p>
                <p>
                    What a commitment means lives in its <em>clauses</em>. A clause is one reusable term, written once and registered publicly under the hash of its specification, defining a relationship between a buyer and a seller or between two sellers. An <em>agreement</em> is the clauses composed for one order; a <em>registered agreement</em> is that composition with its designer&rsquo;s fills and no values, registered for reuse. An <em>assembly</em> is a list of registered agreements composed into one reusable design of a process, which any buyer may instantiate. The wallet that first registers one, bound to it permanently, earning on it while its stake against the entry is live, is its <em>designer</em>. Together they are the protocol&rsquo;s substrate: the trades the protocol can express are exactly the ones its clauses, registered agreements, and assemblies describe.
                </p>
                <p>
                    Designing one is public-goods work in the strict sense. A registered clause is non-rival, since one process&rsquo;s use leaves it whole for the next. It is non-excludable, since anyone may compose it into an agreement, and the parties to that order attest under it for themselves. And the protocol&rsquo;s own operation returns nothing to its designer: there is no per-use charge and no revenue path from an attestation or a resolution. A designer whose assembly a hundred unrelated buyers instantiate captures none of the value it creates. This is the canonical under-provision problem, reproduced at the substrate.
                </p>
                <p>
                    Retroactive public-goods funding, proposed by Optimism together with Vitalik Buterin (Optimism 2021), answers under-provision by rewarding work after its value is observable. The premise is that impact is easier to judge in retrospect than in prospect. The proposal leaves that judgment to a results oracle, a body that decides after the fact which work was useful. This paper replaces the oracle with a rule and its judgment with a count the chain keeps itself, and keeps from that lineage the retroactivity and the discipline of fixing the rule in public before the work it judges is done.
                </p>
                <PaperRun title="Contribution.">
                    We specify a fixed allocation with three properties. (i) It scores registrations by <em>substrate-broadening</em> (Section 3), uniformly and behind counting rules that close the cheap farming vectors. (ii) It resists Sybil manufacture with a two-sided live stake rather than a cap or a weight, and we derive the cost of fabricated score rather than assert it. (iii) It removes the verification problem rather than solving it, by counting adoption as it happens instead of reconstructing it afterwards.
                </PaperRun>
                <PaperRun title="Organization.">
                    Section 2 states what is allocated, to whom, and under what constraints; Section 3 the objective; Section 4 the counting rules; Section 5 the score. Section 6 proves the reward uniform and places Sybil resistance in the stake, and Section 7 prices it. Section 8 gives the distribution, Section 9 the construction that counts adoption as it happens, Section 10 why reconstruction fails, Section 11 the scope, and Section 12 concludes.
                </PaperRun>
            </PaperSection>

            <PaperSection title="2. The Allocation Problem">
                <PaperRun title="What is allocated.">
                    The florin reserves 600 million units, 60% of its fixed supply, for designer rewards. Accrual runs in <Math>{"K"}</Math> periods, each of length <Math>{"L"}</Math> and each with a budget fixed in advance: a schedule <Math>{"B_1 \\le B_2 \\le \\dots \\le B_K"}</Math>, with <Math>{"B_1 < B_K"}</Math>, that sums to the reserve. The claim unit is the period, and the rule knows only periods and their budgets. The period boundaries and the budgets are one schedule, with exactly one budget per period, and no party can accelerate, delay, or resize any of it afterwards.
                </PaperRun>
                <PaperRun title="Why the schedule rises.">
                    The budgets rise because the evidence does. A share is divided by the period&rsquo;s total score, and in the first period that denominator is smallest: the least informative reading of what was adopted, and the most manipulable, since a fixed quantity of fabricated score buys a larger fraction of a small honest total than of a large one (Section 7.3 makes this exact). Placing the largest budgets where the measurement is best aligns the reserve with what it measures, and shrinks the worst case when the mechanism is least able to defend itself. Funding work before the evidence exists is a different job, and the DAO, which holds a separate treasury and spends it by human judgment, is the instrument for it.
                </PaperRun>
                <PaperRun title="What the period&rsquo;s length trades off.">
                    The period length <Math>{"L"}</Math> answers considerations that pull in opposite directions. Two argue for a short period. A designer must price the lag between doing the work and being rewarded for it, and a long lag is hard to price in a token with no protocol-set price. And the period sets the price of a fabricated identity, through the <em>member stake</em>: the stake in the chain&rsquo;s base currency a wallet places to register as a member, a wallet with a published profile others can find, reclaimable after a cooldown of length <Math>{"T"}</Math>. A member stake can be withdrawn and placed again under a fresh address, so one unit of stake furnishes about <Math>{"L/T"}</Math> identities in a period, and a shorter period narrows that recycling (Section 7.1). One consideration argues for a long period: the honest total that fabricated score must dilute grows with the window it is measured over. The rule fixes one length <Math>{"L"}</Math>, and with the cooldown <Math>{"T"}</Math> it fixes a price: each fabricated identity costs about <Math>{"T/L"}</Math> of a member stake.
                </PaperRun>
                <PaperRun title="To whom.">
                    The reward goes to each registration&rsquo;s designer (Section 8). Each family is keyed by a hash of its content, never by a name, so a specification that differs by one byte is another clause, with its own key, designer, stake, and adoption; a title is read by people and by nothing in the count. A registered agreement&rsquo;s key is its <em>agreement hash</em>, and an assembly&rsquo;s is its own root. A use is counted only on an inclusion proof against the root both parties signed; an assembly&rsquo;s needs one proof more, of the agreement&rsquo;s membership under the assembly&rsquo;s registered root. One resolved process credits the designer of each registered agreement its orders instantiated, the designer of its assembly, and, independently, the designer of every clause committed in it. There is no reward path per attestation, per seller, or per resolution: a seller who attests heavily under another designer&rsquo;s clause earns no designer reward, and neither does a buyer who resolves a thousand processes.
                </PaperRun>
                <PaperRun title="Under what constraints.">
                    The rule must add no governance surface, since every adjustable parameter is a point of capture, and no human curation, which would reintroduce the discretion the protocol displaces. It must resist gaming: an objective formula over public data must not reward behavior that is cheap to manufacture and uncorrelated with substrate growth. And it must be verifiable: anyone assessing the token can confirm that each period&rsquo;s budget was allocated by the stated rule, over inputs no allocator chose.
                </PaperRun>
                <PaperRemark title="Why not prospective or per-use funding.">
                    Two alternatives are excluded. <em>Prospective</em> funding, grants decided before the work by a body that predicts impact, reintroduces the discretion this rule exists to avoid; it belongs to the DAO&rsquo;s treasury, not to the reserve. <em>Per-use</em> funding, a reward on each attestation under a clause, couples issuance to a per-event trigger and invites wash attestation to farm it. A retroactive, formula-based allocation avoids both: impact is observed rather than predicted, and the reward attaches to the durable registration rather than to the event.
                </PaperRemark>
            </PaperSection>

            <PaperSection title="3. The Substrate-Broadening Objective">
                <p>
                    The schedule fixes how many florins each period distributes, not which designers receive them. That is decided by the objective, and the choice of objective is the substantive design decision. We call it <em>substrate-broadening</em>: a registration broadens the substrate to the extent that it is adopted across distinct trading relationships. A clause that fifty unrelated sellers each adopt has extended the protocol into fifty practices. A clause one seller uses fifty times has deepened one practice. Both are valuable; only the first broadens the substrate, and that is the quantity rewarded.
                </p>
                <p>
                    An objective is only as good as the statistic that stands in for it, and here the statistic is constrained from outside the objective. Breadth must be measured in a unit the mechanism can <em>price</em>, or it can be manufactured and the objective is a wish. The unit is therefore the distinct <em>seller of record</em>, the seller named in a counted order, who holds a live member stake in the chain&rsquo;s base currency. Section 4 shows why the counterparty pair, the obvious unit of a relationship, cannot be priced; Section 7 shows what the seller unit buys.
                </p>
                <PaperRun title="Resolved only.">
                    The objective is measured over work that resolved. A process contributes to a score only once it has resolved, and a registration with no resolved adoption in a period receives nothing. This ties the reward to completed trade rather than declared intent, and it closes the cheapest farming vector, manufacturing commitments that never resolve, because such a commitment cannot be counted at all.
                </PaperRun>
                <PaperRun title="Relation to quadratic funding.">
                    The principle of breadth over volume has an antecedent in quadratic funding (Buterin, Hitzig, and Weyl 2019), where a public good&rsquo;s total funding is <Math>{"\\bigl(\\sum_i \\sqrt{c_i}\\bigr)^2"}</Math> over individual contributions <Math>{"c_i"}</Math>, the match being that total less the contributions, so that many small contributions outweigh a few large ones. Substrate-broadening applies the intuition on another axis: breadth of adoption, in distinct staked sellers, over depth of use. The resemblance ends there. There are no donors, no matched contributions, and no matching pool; the reward is a fixed reserve divided by observed adoption, and its exponents are not quadratic.
                </PaperRun>
            </PaperSection>

            <PaperSection title="4. The Counting Rules">
                <p>
                    Seven conditions decide whether a count lands, and none is a filter applied downstream: an ineligible count never enters the accounting. A count names one use: one resolved order and one registration. It lands only if all seven hold at the moment of counting: the order resolved, the registration was committed in the signed agreement, the process has not been counted for it before, the seller of record holds a live member stake, the registration&rsquo;s own stake is live, the key is not one of the format&rsquo;s two reserved keys, and a period is open. A use that fails one is not counted, and may be presented again while a period is open. Two further rules turn admitted counts into a score: what breadth is counted in, and the minimum support a registration needs.
                </p>
                <p>
                    Every rule depends on one property: a count that lands is permanent. A registration&rsquo;s counters, its score, and the period&rsquo;s total can only grow. Every admitted count increments them. Nothing anywhere retracts a landed count, so every gate below is a gate on the moment of counting.
                </p>
                <ul className="space-y-2 list-disc pl-6 text-sm">
                    <li><span className="font-semibold text-ink-heading">Resolved only.</span> The order must be resolved on chain; an unknown or still-open order is refused.</li>
                    <li><span className="font-semibold text-ink-heading">Committed in the signed agreement.</span> The count must be proved by an inclusion proof against the merkle root the parties signed. A clause is proved by its own key. A registered agreement is proved by its agreement hash, which the signed agreement commits as the registered agreement the order instantiated. An assembly, keyed by its own root, is proved the same way and, in addition, by a <em>membership proof</em> of the agreement under the assembly&rsquo;s root (Section 9). Nobody can credit a registration to a process that did not commit it, because the proof runs against a digest neither party can restate after signing.</li>
                    <li><span className="font-semibold text-ink-heading">One process, one count.</span> A process counts once for a registration, once ever, not once per period. A repeat is refused, so the call may safely be attempted by anyone at any time. Because a count names one order, the seller credited is the seller of that order, whichever order of a multi-seller process it is: a process adds one to the process count and at most one seller to the breadth.</li>
                    <li><span className="font-semibold text-ink-heading">Seller staked.</span> A process counts only if its seller of record holds a live member stake in the chain&rsquo;s base currency, which is what prices a seller identity. Requesting the stake back removes the seller from view at the request, not at the release, and until it stakes again its resolved trade counts toward nothing, including trade that resolved earlier and was not yet counted. What was counted stands. The practical consequence is a habit: a use is counted as soon as its process has resolved, while its seller is still staked. A seller who withdraws to deny a designer its count must stay unstaked for as long as the denial is to last, forfeiting its own visibility and waiting out the cooldown; once it stakes again, the uses it left uncounted land in whichever period is then open. The buyer side is ungated: anyone may buy, and a buyer&rsquo;s purchase counts toward a designer&rsquo;s reward without the buyer staking anything.</li>
                    <li><span className="font-semibold text-ink-heading">Registration live.</span> The registration a count names must hold a live stake at that moment, in the registry of its own family (clauses, registered agreements, or assemblies) and never another&rsquo;s. Without this gate a self-written agreement could commit any key and accrue score to it for the gas alone, inflating the denominator every honest designer is rewarded from.</li>
                    <li><span className="font-semibold text-ink-heading">The reserved keys earn nothing.</span> The format reserves two keys, each the hash of a fixed label rather than of any specification: one under which a signed agreement states which registered agreement and assembly the order instantiated, and one under which the clauses composed for an assembly&rsquo;s whole design are committed. Neither is a term the parties chose. Both are refused on every kind: a reserved key is never counted, whatever stake stands behind it. Under the hash function&rsquo;s second-preimage resistance neither key collides with a clause key. The line is structural, between a term and the format that carries the terms, and it reads no content.</li>
                    <li><span className="font-semibold text-ink-heading">Breadth counts distinct staked sellers.</span> A seller who carries the same registration repeatedly within a period adds to the process count each time and to breadth once. Breadth is counted in exactly the unit the stake prices: one unit requires one live staked seller, and no arrangement of wallets returns more than one unit per identity in a period. Distinct (buyer, seller) pairs would be the obvious unit, but pairs cannot be priced. The buyer side holds no stake, so one staked seller trading with <Math>{"N"}</Math> fresh buyer wallets would manufacture <Math>{"N"}</Math> units of breadth for the gas alone. Staking both sides does not repair it: <Math>{"j"}</Math> staked buyers trading with <Math>{"m"}</Math> staked sellers mint <Math>{"j \\cdot m"}</Math> pairs from <Math>{"j + m"}</Math> stakes, a quadratic return on what is staked. Distinct staked sellers is the statistic with no leverage, and Section 7 rests on that property.</li>
                    <li><span className="font-semibold text-ink-heading">Minimum support.</span> A registration scores nothing in a period until <Math>{"d_{\\min}"}</Math> distinct staked sellers have carried it there, a floor fixed when the rule is put on chain. Set at <Math>{"d_{\\min} \\ge 3"}</Math>, the floor is reached by neither one identity nor a colluding pair. The floor withholds scoring, never counting: the counters accrue below it, and the full score appears when the <Math>{"d_{\\min}"}</Math>-th seller lands. It filters the thinnest entries, the ones one or two identities stand behind: a shard split off an existing clause, a copied specification registered ahead of its designer, a trivial rider committed beside real work. It does not make them impossible. <Math>{"d_{\\min}"}</Math> staked identities and <Math>{"d_{\\min}"}</Math> resolved processes are a price, not a barrier, and Section 7.3 quotes it.</li>
                </ul>
                <PaperRun title="What the count does not interpret.">
                    Every rule is decided by comparing hashes, reading a status, reading a stake, or comparing a counter with a threshold. No participant has to agree with a curator about what a clause <em>means</em> to agree about what it scored. The count reads no content and consults no approval list, so a registration carried by many resolved processes and many staked sellers scores for that fact alone.
                </PaperRun>
                <PaperRemark title="Why the mandatory terms earn.">
                    A designer composes each agreement on top of a registration of mandatory terms, whose clauses merge into it, and the terms stating the consideration and the order of the sellers are mandatory in this sense. The rule counts those clauses as it counts any clause, so their counters track counted resolution itself, and scoring them rewards whichever wallet registered them, on every counted process that carries them. That wallet is decided by registration, which is permissionless, and the count reads a registrant&rsquo;s address and never an identity. Two properties follow with nothing tuned for them. The registrant&rsquo;s share dilutes itself in the right direction: those counters can do no better than full coverage, while every other scoring registration enters the same total, so its share falls as the set of designers broadens and is largest where little else emerged. And a competing clause registered by any other wallet is scored on the same counters, and any agreement may commit it.
                </PaperRemark>
                <PaperRun title="Counting is permissionless and opt-in.">
                    Anyone may submit a count; nothing is trusted about the caller, because the proof is what is checked. Its gas is paid by whoever submits it, and the party with the incentive to submit it is the designer. An uncounted resolution does not count. Its evidence stays on chain, but a count lands only while a period is open, so counting must be current, and its cost falls on the party it benefits.
                </PaperRun>
            </PaperSection>

            <PaperSection title="5. The Scoring Formula">
                <p>
                    Each registration <Math>{"a"}</Math> carries, per period, one pair of counters <Math>{"(c(a), d(a))"}</Math>, and every count that lands for it enters that pair. Its score is a function of the pair alone, and the period&rsquo;s total moves by the change in a score whenever a count lands, so no pass over history is ever required:
                </p>
                <PaperScroll className="my-3">
                    <Math display>{"\\text{score}(a) \\;=\\; \\sigma\\bigl(c(a), d(a)\\bigr), \\qquad \\sigma(c, d) \\;=\\; \\begin{cases} c^{\\,1/3}\\, d^{\\,2/3}, & d \\;\\ge\\; d_{\\min},\\\\[4pt] 0, & \\text{otherwise.}\\end{cases}"}</Math>
                </PaperScroll>
                <ul className="space-y-1 list-disc pl-6 text-sm">
                    <li><Math>{"c"}</Math> &mdash; the number of distinct resolved <em>processes</em> counted for the registration in the period.</li>
                    <li><Math>{"d"}</Math> &mdash; the number of distinct live-staked <em>sellers of record</em> across those processes, each counted once however often it trades in the period.</li>
                    <li><Math>{"d_{\\min}"}</Math> &mdash; the minimum-support floor, fixed when the rule is put on chain.</li>
                </ul>
                <p>
                    By construction <Math>{"d \\le c"}</Math>, since every counted seller is the seller of a counted process, so a registration that meets the floor has <Math>{"c \\ge d_{\\min}"}</Math> as well. There is no weight term. Every registration is scored by the same function of its own counters, and Section 6 proves that no weight could be added without either restating that function or importing a judgment.
                </p>
                <PaperRun title="One count per registration.">
                    Every counted process enters <Math>{"c"}</Math> once and every counted seller enters <Math>{"d"}</Math> once in a period, so the score is a function of the set of uses counted for the registration and of nothing else: the order in which counts land changes nothing, and no seller enters the breadth twice. Above the floor <Math>{"\\sigma"}</Math> is increasing in both counters, homogeneous of degree one, <Math>{"\\sigma(\\lambda c, \\lambda d) = \\lambda\\,\\sigma(c, d)"}</Math>, and concave: a Cobb&ndash;Douglas form whose exponents sum to one. Two consequences follow, and Section 7 uses both. Homogeneity makes the score neutral to size: a registration whose processes and sellers both double doubles its score, so a share of the budget tracks a share of adoption with no return to scale. Homogeneity with concavity makes <Math>{"\\sigma"}</Math> superadditive, <Math>{"\\sigma(c_1 + c_2,\\, d_1 + d_2) \\ge \\sigma(c_1, d_1) + \\sigma(c_2, d_2)"}</Math>, because <Math>{"\\sigma(x + y) = 2\\,\\sigma\\bigl(\\tfrac{x + y}{2}\\bigr) \\ge \\sigma(x) + \\sigma(y)"}</Math> for any two pairs of counters <Math>{"x"}</Math> and <Math>{"y"}</Math>, the equality by homogeneity and the inequality by concavity at the midpoint. The floor preserves the inequality: when the combined pair is below it so is each part, and when the combined pair is above it the floor can only lower the parts. Adoption carried by disjoint sets of sellers therefore scores at least as much in one registration as split across two. The same uses score more across several registrations only when the registrations share sellers, and Section 7.3 prices that case.
                </PaperRun>
                <p>
                    The exponents are constitutive of the mechanism: breadth carries <Math>{"\\tfrac23"}</Math> and volume <Math>{"\\tfrac13"}</Math>, fixed at deployment for every registration. The effect is easiest to read in the form <Math>{"\\sigma = d\\,(c/d)^{1/3}"}</Math>: a registration scores its distinct staked sellers, multiplied by the cube root of its average repeat depth. Eight times the depth earns twice the score, and where every seller carries one process (<Math>{"c = d"}</Math>) the score is the seller count itself. The reading behind the exponents is that a new adopter tells more about substrate growth than another observation of a known one; that is a judgment about adoption, offered as one. The exponents are not a Sybil defense and cannot be one. No scoring function distinguishes a fabricated seller from a genuine one, since any concavity that dampens the first dampens the second identically. Resistance lives in the price of an identity (Sections 6 and 7), which is why the statistic under the larger exponent had to be one the stake prices.
                </p>
                <p>
                    Above the floor, the score is <Math>{"(c\\,d^{2})^{1/3}"}</Math>, the form Section 7 works in.
                </p>
                <PaperRun title="Value is excluded.">
                    Neither payment nor bond size enters the formula. A clause that carries many small resolutions has done the same substrate work as one used in a few large ones. Weighting by value would import the &ldquo;total value locked&rdquo; metric of financial protocols, and it would skew the reward toward whoever designs the clauses high-value trades happen to use, which is uncorrelated with how broadly a clause extends the substrate.
                </PaperRun>
            </PaperSection>

            <PaperSection title="6. Uniform Reward and the Two-Sided Stake">
                <PaperRun title="Why the reward is uniform.">
                    A weighting scheme, rewarding more for the category of work the substrate is judged to need, requires the mechanism to make and keep current a standing judgment about which category that is. That judgment is curation in arithmetic form. It privileges a class of work ahead of the evidence, it owes a defense to every designer whose work it rewards less, and it is the discretion the rest of the mechanism refuses. Uniformity declines to make it: every registration&rsquo;s score is its own use alone, and what participants actually adopted decides the split.
                </PaperRun>
                <p>
                    Is a weight not only arithmetic, and arithmetic not discretion? The question has an exact answer. Write <Math>{"A"}</Math> for the registrations a period admits, and <Math>{"\\kappa(a) = \\bigl(c(a), d(a)\\bigr)"}</Math> for the counters of Section 5, which are everything the count holds of <Math>{"a"}</Math>. Call a <em>weighting layer</em> any map <Math>{"w : A \\to \\mathbb{R}_{\\ge 0}"}</Math> under which a registration is rewarded a share proportional to <Math>{"w(a)\\,\\text{score}(a)"}</Math>. The uniform rule is <Math>{"w \\equiv 1"}</Math>.
                </p>
                <FormalBlock label="Proposition (A weighting layer is inert or discretionary).">
                    <p>
                        Let <Math>{"w"}</Math> be a weighting layer. Exactly one of the following holds. (i) <Math>{"w"}</Math> factors through the counters: there is a function <Math>{"W"}</Math> with <Math>{"w(a) = W\\bigl(\\kappa(a)\\bigr)"}</Math> for every <Math>{"a \\in A"}</Math>, in which case the weighted rule is itself a uniform rule, scoring every registration by the single function <Math>{"W(\\kappa)\\,\\text{score}(\\kappa)"}</Math> of its own counters. (ii) Two registrations with identical counters carry unequal weights, in which case <Math>{"w"}</Math> ranks them by something other than their use: their family, their key, or a quantity the count does not hold. Such a ranking may be computable from what the count admits once it is given, but nothing the count admits chooses it; it is a judgment of which work deserves more, supplied from outside the count and maintained there.
                    </p>
                </FormalBlock>
                <p>The proposition rests on three premises.</p>
                <ol className="space-y-2 list-decimal pl-6 text-sm">
                    <li><strong>What the count admits (Section 4).</strong> Of a registration the counting rules admit its key, its family, the resolved processes counted for it, and the distinct live-staked sellers behind them, and nothing else: no content is read, no category is held, and no property of the registrant enters.</li>
                    <li><strong>The score is a function of the counters (Section 5).</strong> <Math>{"\\text{score}(a) = \\sigma\\bigl(\\kappa(a)\\bigr)"}</Math> for every <Math>{"a \\in A"}</Math>.</li>
                    <li><strong>A weighting layer (stipulated).</strong> A weighting layer is a map <Math>{"w : A \\to \\mathbb{R}_{\\ge 0}"}</Math> under which a registration&rsquo;s share is proportional to <Math>{"w(a)\\,\\text{score}(a)"}</Math>.</li>
                </ol>
                <Proof>
                    <em>Step 1, the dichotomy is exhaustive.</em> Either <Math>{"\\kappa(a) = \\kappa(b)"}</Math> implies <Math>{"w(a) = w(b)"}</Math> for all <Math>{"a, b \\in A"}</Math>, or it does not. <em>Step 2, factoring (premises 2 and 3).</em> Suppose it does. Then <Math>{"W(\\kappa) := w(a)"}</Math> for any <Math>{"a"}</Math> with counters <Math>{"\\kappa"}</Math> is well defined, and the share rewarded to <Math>{"a"}</Math> is proportional to <Math>{"W\\bigl(\\kappa(a)\\bigr)\\,\\text{score}\\bigl(\\kappa(a)\\bigr)"}</Math>: one function of the counters, applied to every registration alike, which is (i). <em>Step 3, separation (premise 1).</em> Suppose it does not, and fix <Math>{"a, b"}</Math> with <Math>{"\\kappa(a) = \\kappa(b)"}</Math> and <Math>{"w(a) \\neq w(b)"}</Math>. By premise 1, what separates them is their family, their key, or nothing the count holds. In the last case <Math>{"w"}</Math> is not computable from the count at all. In the first two it is, since every count is kept by family and key. Yet the count supplies only the labels, never an order among them: that clauses earn twice what assemblies earn, or that one key earns more than another with the same use, is a category judgment that no counter determines. <em>Conclusion.</em> In branch (ii) the separating value enters as an input from outside, supplied by whoever holds it, revised as adoption moves, and owed a defense to every designer it rewards less: a standing curatorial judgment. So exactly one of (i) and (ii) holds. <Math>{"\\square"}</Math>
                </Proof>
                <PaperRun title="What would refute it?">
                    A count that held an order among registrations beyond their use: a category recorded per registration, or a ranking of families the rule itself fixes. Either refutes premise 1, and a weight read from it would separate registrations with identical counters without a judgment supplied from outside.
                </PaperRun>
                <PaperRemark title="Scope.">
                    The proposition is about the reward&rsquo;s arithmetic over what the count admits, under the counting rules of Section 4 as stated. It does not say a curatorial judgment is wrong, only that it enters from outside the count and stays there.
                </PaperRemark>
                <p>
                    Neither branch does what a weighting scheme is proposed to do. Branch (i) is a restatement: a content-blind reweighting is a different function of the same counters, which is where the exponents of Section 5 already sit, argued in the open and fixed before the work they judge. Branch (ii) is curation, and a scheme that rewards the category of work the substrate is judged to need is branch (ii) by construction. The reserved keys of Section 4 are not a third case: they are refused before a count lands and never enter <Math>{"A"}</Math>.
                </p>
                <PaperRun title="Where Sybil resistance goes: the two-sided live stake.">
                    With no weight to tune and no cap to bind, what stops the counts being manufactured is a stake in the chain&rsquo;s base currency, required live on both sides of a counted event. On the seller side, a process counts only if its seller of record holds a live member stake when the count lands, and since breadth is counted in such sellers, this one gate prices the breadth term directly. On the designer side, the registration must hold a live stake for a count naming it to land, and when the closed period is claimed its designer must still hold that stake and hold a live member stake of its own (Section 8). The two gates read at different moments. The seller&rsquo;s stake governs what may still be counted and nothing else, since a landed count is permanent. The designer&rsquo;s stake is read at each count and again at the claim, so withdrawing before the claim forfeits the whole period, adoption already counted included. Neither stake is spent, and neither is returned by the reward.
                </PaperRun>
                <PaperRun title="The stake is held, not spent.">
                    A required stake reads naturally as a cost to minimize, but it is reclaimable after the cooldown: an honest participant gives up its use for that time, and a fabricated identity pays the price Section 7 derives. The stake is placed in the chain&rsquo;s base currency, the unit gas is spent in. The two units the mechanism touches are divided by function. The reward is minted in the florin, from the reserve; the stake is placed in the base currency. The coupling runs one way. No resolution mints, consults, or is denominated in the florin by rule: a process is denominated in whatever ERC-20 token its parties chose, the florin among them, and nothing prefers or rewards that choice. The reward mints florins by reading what resolution left, and nothing it counts, scores, or rewards moves a bond or any party&rsquo;s position in an open process. A reward that could move a bonded position would be a party to the equilibrium of Section 1; this one only reads its outcome.
                </PaperRun>
            </PaperSection>

            <PaperSection title="7. The Sybil Bound">
                <p>
                    A mechanism that distributes value on a public count owes its readers a price list: how much fabricating adoption costs, in what unit, and how the cost grows with the share an adversary wants. The setting is the one Douceur (2002) named. Identities are free to create in an open system, so a mechanism that counts them must tie each to a scarce resource or accept that its count can be manufactured. This mechanism ties them to a stake, and what follows is the exchange rate between that stake and the reward. It rests on one property from Section 4, that a unit of breadth costs one live staked seller and never less, and on nothing about the florin&rsquo;s price, which the design does not set.
                </p>
                <PaperSubsection title="7.1 The two costs an adversary faces">
                    <p>
                        Write <Math>{"D"}</Math> for the member stake a seller of record must place; <Math>{"T"}</Math> is the cooldown between requesting it back and receiving it, and <Math>{"L"}</Math> the length of a period, both of Section 2. Eligibility ends at the <em>request</em>, so one stake can be run through a sequence of identities within a period: register a fresh address, resolve and count with it, request the stake, wait out the cooldown, register the next. One stake furnishes at most <Math>{"\\lceil L/T \\rceil"}</Math> identities in a period, and the outlay of holding one fabricated staked seller for one period is
                    </p>
                    <PaperScroll className="my-3">
                        <Math display>{"\\delta \\;=\\; \\frac{D}{\\lceil L/T \\rceil} \\;\\approx\\; D\\,\\frac{T}{L}\\,, \\qquad \\text{saturating at } \\delta = D \\text{ once } T \\ge L."}</Math>
                    </PaperScroll>
                    <p>
                        A cooldown of zero makes <Math>{"\\delta"}</Math> vanish, because one stake then serves unboundedly many identities in sequence. A cooldown of a period or more makes each fabricated identity cost the full stake, the strongest the pair can be. The stake and the cooldown are one price, and neither means anything alone.
                    </p>
                    <p>
                        Write <Math>{"g"}</Math> for the least marginal gas at which the deployment lets one fabricated process resolve and be counted. It is a measured constant of a deployment, not a modeling assumption; we credit the adversary with the cheapest, and with nothing else. A fabricated process must also lock bonds until it resolves and clear the protocol&rsquo;s non-zero payment floor, and we do not count the time value of either, so the bound errs in the adversary&rsquo;s favor.</p>
                    <p>
                        One convention makes the two costs addable: <Math>{"\\delta"}</Math> is committed for a period and reclaimable at its end, <Math>{"g"}</Math> is spent outright, and both enter the outlay <Math>{"C"}</Math> at face value in the base currency. A reader who prices the waiting applies their own time value to the <Math>{"\\delta"}</Math> term alone, which moves the level of every figure below and the shape of none. A reader needs four constants and one measurement: the member stake <Math>{"D"}</Math> and the cooldown <Math>{"T"}</Math>, which price a fabricated seller; the period length <Math>{"L"}</Math>; the designer-side registration stakes, which price a fabricated registration (Section 7.3); and <Math>{"g"}</Math>, held by no contract and measured. No florin price enters.
                    </p>
                </PaperSubsection>
                <PaperSubsection title="7.2 The cost of fabricated score">
                    <p>
                        Consider an adversary who wants score <Math>{"s"}</Math> for a registration it designs, and who chooses how much to buy with identities and how much with volume. With <Math>{"n"}</Math> fabricated staked sellers and <Math>{"c"}</Math> fabricated resolved processes the score is <Math>{"s = (c\\,n^{2})^{1/3}"}</Math>. Every seller needs at least one process, so <Math>{"c \\ge n"}</Math>, and the floor requires <Math>{"n \\ge d_{\\min}"}</Math>. Counts are treated as reals, so every figure below is exact over that relaxation and integrality only rounds the adversary&rsquo;s outlay up. The adversary&rsquo;s problem is
                    </p>
                    <PaperScroll className="my-3">
                        <Math display>{"\\min_{n,\\,c}\\;\\; C \\;=\\; n\\,\\delta \\;+\\; c\\,g \\qquad \\text{subject to} \\qquad (c\\,n^{2})^{1/3} = s, \\quad c \\ge n \\ge d_{\\min}."}</Math>
                    </PaperScroll>
                    <FormalBlock label="Proposition (Unit price of fabricated score).">
                        <p>
                            For <Math>{"s \\ge s_{0}"}</Math>, where <Math>{"s_{0} = d_{\\min}\\max\\{1,\\,(\\delta/2g)^{1/3}\\}"}</Math>, the minimum outlay of fabricating score <Math>{"s"}</Math> is <Math>{"C^{*}(s) = \\gamma \\, s"}</Math>, where
                        </p>
                        <PaperScroll className="my-3">
                            <Math display>{"\\gamma \\;=\\; \\begin{cases} \\delta + g, & \\delta \\le 2g,\\\\[4pt] 3\\cdot 2^{-2/3}\\,\\delta^{2/3}g^{1/3} \\;\\approx\\; 1.89\\,\\delta^{2/3}g^{1/3}, & \\delta > 2g.\\end{cases}"}</Math>
                        </PaperScroll>
                        <p>
                            The outlay is <em>linear in the score fabricated</em> in both regimes, and the two expressions agree at <Math>{"\\delta = 2g"}</Math>, where both equal <Math>{"3g"}</Math>.
                        </p>
                    </FormalBlock>
                    <p>The proposition rests on four premises.</p>
                    <ol className="space-y-2 list-decimal pl-6 text-sm">
                        <li><strong>The score (Section 5).</strong> With <Math>{"n"}</Math> fabricated staked sellers and <Math>{"c"}</Math> fabricated resolved processes, a registration above the floor scores <Math>{"s = (c\\,n^{2})^{1/3}"}</Math>.</li>
                        <li><strong>The counting rules (Section 4).</strong> Every counted seller is the seller of a counted process, so <Math>{"c \\ge n"}</Math>; the floor requires <Math>{"n \\ge d_{\\min}"}</Math>; and a unit of breadth costs one live staked seller and never less.</li>
                        <li><strong>The two costs (Section 7.1).</strong> A fabricated staked seller costs <Math>{"\\delta"}</Math> for the period and a fabricated counted process at least <Math>{"g"}</Math>, so the outlay is <Math>{"C = n\\delta + cg"}</Math>, with the time value of bonds and stakes left out in the adversary&rsquo;s favor.</li>
                        <li><strong>Counts are reals (stipulated).</strong> The minimization runs over real <Math>{"n"}</Math> and <Math>{"c"}</Math>; integrality only rounds the adversary&rsquo;s outlay up.</li>
                    </ol>
                    <Proof>
                        <em>Step 1, substitution (premises 1, 3 and 4).</em> Relax <Math>{"c \\ge n"}</Math> and substitute the score constraint <Math>{"c = s^{3}/n^{2}"}</Math>, giving <Math>{"C(n) = n\\delta + g\\,s^{3}/n^{2}"}</Math>. This is strictly convex on <Math>{"n > 0"}</Math>, and <Math>{"C'(n) = \\delta - 2g\\,s^{3}/n^{3} = 0"}</Math> yields the interior optimum <Math>{"n^{*} = s\\,(2g/\\delta)^{1/3}"}</Math>, hence <Math>{"c^{*} = s\\,(\\delta/2g)^{2/3}"}</Math>. <em>Step 2, the interior regime (premise 2).</em> Feasibility of the relaxed optimum requires <Math>{"c^{*} \\ge n^{*}"}</Math>, i.e. <Math>{"(\\delta/2g)^{2/3} \\ge (2g/\\delta)^{1/3}"}</Math>, which holds exactly when <Math>{"\\delta \\ge 2g"}</Math>. In that regime, substituting back gives <Math>{"C^{*} = s\\,\\delta^{2/3}\\bigl[(2g)^{1/3} + g\\,(2g)^{-2/3}\\bigr] = s\\,\\delta^{2/3}g^{1/3}\\,2^{-2/3}(2+1) = 3\\cdot 2^{-2/3}\\,\\delta^{2/3}g^{1/3}\\,s"}</Math>. <em>Step 3, the corner regime (premise 2).</em> When <Math>{"\\delta < 2g"}</Math> the relaxed optimum violates <Math>{"c \\ge n"}</Math>. Along the constraint curve <Math>{"c(n) = s^{3}/n^{2}"}</Math>, feasibility <Math>{"c \\ge n"}</Math> is exactly <Math>{"n \\le s"}</Math>, and <Math>{"n^{*} > s"}</Math> in this regime, so <Math>{"C"}</Math> is strictly decreasing across the whole feasible interval and the minimum sits at its right endpoint <Math>{"n = c = s"}</Math>, giving <Math>{"C^{*} = (\\delta + g)\\,s"}</Math>. <em>Step 4, continuity and linearity.</em> At <Math>{"\\delta = 2g"}</Math> the corner and interior solutions coincide at <Math>{"n = c = s"}</Math> and both expressions give <Math>{"3g\\,s"}</Math>, so <Math>{"\\gamma"}</Math> is continuous. Neither branch&rsquo;s <Math>{"\\gamma"}</Math> depends on <Math>{"s"}</Math>, so <Math>{"C^{*}"}</Math> is exactly linear in <Math>{"s"}</Math> in each. <em>Step 5, the floor (premise 2).</em> The optimizing <Math>{"n"}</Math> in each branch is <Math>{"s"}</Math> and <Math>{"s(2g/\\delta)^{1/3}"}</Math> respectively, and requiring it to satisfy <Math>{"n \\ge d_{\\min}"}</Math> is exactly <Math>{"s \\ge s_{0}"}</Math>. <em>Conclusion.</em> For <Math>{"s \\ge s_{0}"}</Math> the minimum outlay of fabricating score <Math>{"s"}</Math> is <Math>{"\\gamma s"}</Math>, linear in the score. <Math>{"\\square"}</Math>
                    </Proof>
                    <PaperRun title="What would refute it?">
                        A way to raise one registration&rsquo;s score at less than <Math>{"\\gamma"}</Math> per unit: a unit of breadth obtained without a live staked seller, one seller entering a registration&rsquo;s breadth twice in a period, or a counted process cheaper than <Math>{"g"}</Math>. The first two refute premise 2 and the third premise 3, and each removes the bound.
                    </PaperRun>
                    <PaperRemark title="Scope.">
                        The proposition prices score on one registration in one period, for scores at or above <Math>{"s_{0}"}</Math>, against an adversary that fabricates both sides itself. It reads no florin price. Replication across registrations and collusion with genuine sellers are outside it, and Section 7.3 states what each costs.
                    </PaperRemark>
                    <p>
                        The regimes read plainly. When identities are cheap relative to trade (<Math>{"\\delta \\le 2g"}</Math>), the adversary buys pure breadth, one process per fabricated seller, because under the cube root a second process from one seller is worth less than a first from a new one. When identities are dear (<Math>{"\\delta > 2g"}</Math>), gas-bought volume substitutes for them, at <Math>{"(\\delta/2g)^{2/3}"}</Math> processes per identity. Below <Math>{"s_{0}"}</Math> the floor binds before either optimum is reachable, so small fabricated scores cost strictly more than <Math>{"\\gamma s"}</Math>, and the linear figure is the conservative one to quote.
                    </p>
                    <PaperRemark title="Linearity is the property.">
                        The result worth holding is the shape, not the constant: fabricated score has a flat unit price, and there is no scale at which the adversary&rsquo;s outlay buys more than proportionally. Linearity is the direct consequence of counting breadth in the unit the stake prices. Under (buyer, seller) pairs it fails outright: one staked seller and <Math>{"N"}</Math> free buyer wallets yield <Math>{"N"}</Math> units of breadth, so <Math>{"C^{*}"}</Math> would be bounded by a constant in <Math>{"\\delta"}</Math> however large the score, and no stake or cooldown could repair it.
                    </PaperRemark>
                    <PaperRemark title="The stake has diminishing returns.">
                        Raising the stake does not raise the adversary&rsquo;s price indefinitely. Past <Math>{"\\delta = 2g"}</Math>, <Math>{"\\gamma"}</Math> grows only as <Math>{"\\delta^{2/3}"}</Math>, because gas-bought volume substitutes for identities under the cube root: doubling the stake there raises the unit price by about 59%, not 100%. Two consequences follow. Below saturation the cooldown is the stronger lever, since <Math>{"\\delta"}</Math> is linear in <Math>{"T/L"}</Math> until it reaches <Math>{"D"}</Math>. And no stake substitutes for measuring <Math>{"g"}</Math>, since <Math>{"g"}</Math> sets the floor the stake works against.
                    </PaperRemark>
                </PaperSubsection>
                <PaperSubsection title="7.3 Dilution: what an outlay buys of a period&rsquo;s budget">
                    <p>
                        The model rests on three hypotheses, stated first because the result is worth exactly what they are. Honest accrual <Math>{"S_h"}</Math> is exogenous: it is whatever genuine adopters counted, and does not respond to the adversary. The adversary dilutes only: the seller-withdrawal attack of Section 4, which leaves honest designers&rsquo; uses uncounted, suppresses honest score instead and lies outside this model. And one denominator is in view: the period&rsquo;s total score, which is what a claim divides by.
                    </p>
                    <p>
                        A wallet&rsquo;s reward is its score over the period&rsquo;s total, so the adversary&rsquo;s real objective is a share. Let it want a fraction <Math>{"\\varphi \\in (0,1)"}</Math> of the period&rsquo;s budget. Its own score <Math>{"s_A"}</Math> enters the denominator too, so it needs <Math>{"s_A/(s_A + S_h) = \\varphi"}</Math>, that is <Math>{"s_A = S_h\\,\\varphi/(1-\\varphi)"}</Math>. With the Proposition:
                    </p>
                    <PaperScroll className="my-3">
                        <Math display>{"C(\\varphi) \\;=\\; \\gamma\\,S_h\\,\\frac{\\varphi}{1-\\varphi}\\,, \\qquad \\frac{dC}{d\\varphi} \\;=\\; \\frac{\\gamma\\,S_h}{(1-\\varphi)^{2}} \\;>\\; 0."}</Math>
                    </PaperScroll>
                    <p>
                        The curve is convex and unbounded as <Math>{"\\varphi \\to 1"}</Math>, and three things follow. First, honest designers always keep a positive share, because the last increment of share costs without limit. Second, the marginal price of share rises with the share already taken: an adversary at a tenth spends about 23% more for the next increment than for the first, and one at half spends four times as much, so capture gets harder as it proceeds. Third, the statement is denominated in outlay per unit of dilution, never in profit. The mechanism sets no price for the florin and reads none, so a claim that an attack is unprofitable below some stake would smuggle in a price forecast. What it can publish exactly is the cost side, and a reader supplies its own view of the other.
                    </p>
                    <PaperRun title="The entry price, and where the worst case sits.">
                        The floor truncates the curve from the left. A registration scores nothing until <Math>{"d_{\\min}"}</Math> distinct staked sellers carry it, so the smallest score the mechanism recognizes is <Math>{"d_{\\min}"}</Math>, the curve begins at <Math>{"\\varphi_{0} = d_{\\min}/(d_{\\min} + S_h)"}</Math>, and the entry price is <Math>{"d_{\\min}(\\delta + g)"}</Math>: <Math>{"d_{\\min}"}</Math> identity-periods and <Math>{"d_{\\min}"}</Math> resolved processes. That is at or above <Math>{"\\gamma\\,d_{\\min}"}</Math>, because a floor-bound adversary buys identities the unconstrained optimum would not. One actor can pay it; the floor sets the entry price and keeps noise from fewer than <Math>{"d_{\\min}"}</Math> identities out of the denominator. Since <Math>{"\\varphi_{0}"}</Math> is measured against <Math>{"S_h"}</Math>, the worst case is the first period, where <Math>{"S_h"}</Math> is smallest. The schedule answers it: <Math>{"B_1"}</Math> is its smallest budget, no larger than an even share <Math>{"1/K"}</Math> of the reserve, and the budgets rise toward the last periods. The period in which fabricated score buys the largest share is the one with the least at stake.
                    </PaperRun>
                    <PaperRemark title="How the curve moves with the stake and the cooldown.">
                        The stake and the cooldown enter only through <Math>{"\\delta"}</Math>, and <Math>{"\\delta"}</Math> only through <Math>{"\\gamma"}</Math>, which multiplies the whole curve. Raising the stake therefore scales <Math>{"C(\\varphi)"}</Math> vertically and leaves its convexity, its divergence, and the ratio of the price of any two shares untouched. The scaling is inelastic: <Math>{"d\\ln\\gamma/d\\ln\\delta = \\delta/(\\delta+g)"}</Math> in the first regime, rising to <Math>{"\\tfrac23"}</Math> at <Math>{"\\delta = 2g"}</Math> and holding there in the second, so the elasticity of capture price to the stake is at most two-thirds everywhere. Below saturation the stake and the cooldown are interchangeable, since every pair holding <Math>{"D\\,T/L"}</Math> fixed lands on the same curve; at <Math>{"T \\ge L"}</Math> only <Math>{"D"}</Math> moves anything. We characterize the movement and stop: nothing in the mechanism optimizes over its own constants.
                    </PaperRemark>
                    <PaperRun title="What the bound prices, and what it does not.">
                        The Proposition prices score on one registration. Every fabricated seller enters that registration&rsquo;s breadth once in a period and every fabricated process enters its process count once, so the Proposition is the whole of what one set of identities buys for one registration, and the floor still takes <Math>{"d_{\\min}"}</Math> distinct staked identities to reach.
                    </PaperRun>
                    <p>
                        An adversary who registers several clauses and commits all of them in the same fabricated agreements replicates the score across each. The identity and resolution outlay is shared. Each replicate costs its own designer-side registration stake, plus the gas of one further count per process. That stake cannot be recycled (Section 8). Splitting the same processes across <Math>{"k"}</Math> registrations instead, the same <Math>{"n \\ge d_{\\min}"}</Math> sellers carrying each, scores <Math>{"k^{2/3}"}</Math> times the single registration&rsquo;s figure, below the <Math>{"k"}</Math> times that committing every registration in every process earns (Section 5), so replication is the adversary&rsquo;s best use of one set of identities. The bound is therefore per registration, never over a portfolio, and the designer-side stake is what prices replication. Nor does the bound price collusion among genuine participants. An adversary who persuades real staked sellers to carry a junk clause beside their real work has bought breadth at the price of persuasion, and no rule reading only chain state can tell that from adoption; the clause is scored on what it demonstrably carried, like every other.
                    </p>
                </PaperSubsection>
                <PaperSubsection title="7.4 What a reader can recompute">
                    <p>
                        The stakes, the cooldown, and the period length are constants fixed when the rule is put on chain, and with the measured <Math>{"g"}</Math> they fix the point the mechanism occupies on the <Math>{"C(\\varphi)"}</Math> curve. Publishing them beside the formula for <Math>{"\\gamma"}</Math> makes &ldquo;how was the stake sized?&rdquo; a question with an arithmetic answer: a reader takes the constants from the rule as put on chain, computes <Math>{"\\delta"}</Math> and <Math>{"\\gamma"}</Math>, estimates <Math>{"S_h"}</Math> from the period&rsquo;s public accrual, and reads the outlay of any dilution off the curve.
                    </p>
                    <p>
                        The price does not buy impossibility: every share short of the whole is purchasable at a finite figure. What the mechanism holds against fabricated adoption is four structural facts. Fabrication costs a published, recomputable outlay per unit of score. That outlay must stay committed while the reward it gates is earned, on both sides and by different clocks. The reserve is fixed, so a fabricator dilutes a budget it cannot enlarge. And every counted process costs gas, spent whoever sends it, which is the one cost that scales with fabricated volume.
                    </p>
                </PaperSubsection>
            </PaperSection>

            <PaperSection title="8. Uniform Pro-Rata Distribution and Designer Eligibility">
                <p>
                    A wallet claims a closed period once, naming in that one claim each registration whose designer it is, each once, by its family and its key. The claimant must also hold a live member stake when it claims, the same stake that prices a seller of record: a wallet that has requested its member stake back cannot claim until it stakes again, and once it stakes again it can claim. Each registration is looked up in its own family and no other, so the list names what to look up and asserts no ownership. A claim that names a withdrawn registration, or names one twice, is refused whole. The family is part of the name because a key alone does not tell a clause, a registered agreement, and an assembly apart, and the families hold no edge between them.
                </p>
                <p>
                    The scores of the presented registrations are summed into one quantity, and the wallet&rsquo;s share of the period&rsquo;s budget is that quantity over the period&rsquo;s total score, minted to it directly, with no per-wallet ceiling. Nothing in the procedure requires knowing who else is claiming. The denominator is the closed period&rsquo;s total, which no count can change any longer, and the numerator is the claimant&rsquo;s own live registrations.
                </p>
                <PaperRun title="Designer eligibility: the stake must be live.">
                    A designer earns for a registration only while the stake placed at its registration remains unwithdrawn, and the check runs at both ends: no count naming the registration lands after the stake is withdrawn (Section 4), and a withdrawn registration cannot be presented at a claim. The adoption counted for it while its stake was live goes unclaimed, and the forfeited share is not redistributed: the score stays in the period&rsquo;s total, and the share goes unminted, as flooring dust does. This closes the path of registering, farming, and withdrawing, because the stake that makes a registration costly cannot be recovered while the registration still earns. Since a registration binds permanently and its stake can be withdrawn exactly once, nothing can be placed again against it, so each replicated registration of Section 7.3 costs a fresh stake rather than the same stake cycled.
                </PaperRun>
                <PaperRun title="Why there is no cap.">
                    The mechanism places no ceiling on any wallet&rsquo;s share. A cap would defend against a concentration the two-sided stake already prices: a wallet reaches a large share only by carrying a large amount of resolved, broad adoption across live-staked sellers, and fabricating that costs the published unit price of Section 7 against a reserve it can only dilute. A cap would add an arbitrary fraction to defend and leave the clamped remainder unminted. Uniform pro rata tracks use directly, and the wallet that broadened the substrate most receives the most. A period&rsquo;s budget is a ceiling, not a target: flooring dust stays unminted, and nothing can sweep what a period did not mint.
                </PaperRun>
            </PaperSection>

            <PaperSection title="9. Counting Adoption as It Happens">
                <p>
                    The arithmetic above can be trusted because no claim about the past is ever stated, not because one is posted, contested, and adjudicated. The design problem was never how to check an allocator&rsquo;s claim. It was how to need none.
                </p>
                <PaperRun title="The chain cannot look backwards.">
                    Two facts combine into one constraint. No count can refuse or unwind a resolution, and that separation is deliberate: a resolution that waited on the reward would make the reward load-bearing for trade. And no contract can read an event, because logs are an interface for observers outside the machine, not state inside it. So when a process resolves, the fact that it used a particular clause is on the chain as data no contract can later consult. A mechanism that rewards adoption must either reconstruct that fact after the event or capture it at the event, and everything about the two designs follows from that fork.
                </PaperRun>
                <PaperRun title="Reconstruction forces a chain of consequences.">
                    Take the first branch and each step forces the next. Reconstruction happens off chain, since the chain cannot do it, so the answer must be brought back on chain: somebody <em>posts</em> it. A posting is an unverified claim about the past, so it must be made costly with a <em>bond</em>. A bond deters only if a false posting can be attacked, which takes a <em>challenge</em>. A challenge puts bonds on both sides, and something must decide who keeps them, which takes a <em>forum</em>. The allocation has now acquired a dispute layer, an escalation path, a concession deadline, and an outside adjudicator to compose and trust, and none of it rewards a single public good.
                </PaperRun>
                <PaperRun title="Capture removes the claim.">
                    Take the second branch and the sequence never starts. A count names a resolved order and a registration, and the rule checks both halves against state the chain already holds: it requires the order to be resolved, and it requires the registration&rsquo;s inclusion under the merkle root the order carries. Neither check consults the caller. Nothing is posted, so nothing is bonded, challenged, or adjudicated. The apparatus is not simplified; it is unnecessary.
                </PaperRun>
                <PaperRun title="Periods, not snapshots.">
                    One difficulty survives. If a budget were shared pro rata out of a total that kept growing, early claimants would take more than their share, and the usual answer is a snapshot: a checkpoint of every score at a chosen block, walked at claim time. The mechanism takes none. Accrual falls into fixed periods set when the rule is put on chain, each period&rsquo;s budget rewards that period alone, and a claim requires the period to have ended. A late count lands in whatever period is open, never in a closed one, so a closed period&rsquo;s counters and total are immovable. A claimant reads a denominator no transaction can change, with no checkpoint, no history walk, and no block height for anyone to choose. Claims never expire, because a closed period&rsquo;s arithmetic is stable forever.
                </PaperRun>
                <PaperRun title="Crediting a registered agreement and an assembly.">
                    What a count proves is that a key was committed in the signed agreement, and the count is kept under the family it names. A clause&rsquo;s own key opens under the signed root. A registered agreement and an assembly are proved through the reserved key under which the signed agreement states the agreement hash the order instantiated and the assembly that holds it; the assembly&rsquo;s further proof is the membership proof Section 2 states, checked against its registered root and never looked up.
                </PaperRun>
                <PaperRun title="Claiming, and the two budget backstops.">
                    A claim mints directly to the claimant, with nothing held between, no root to prove against, and nothing that expires. Issuance is bounded twice, by two properties of the rule held independently of each other: issuance in a period never exceeds that period&rsquo;s budget, and total issuance never exceeds the 600M reserve. No party can raise either bound, and the second holds even if the first were wrong.
                </PaperRun>
                <PaperRun title="The rule is fixed when it is put on chain.">
                    The exponents, the floor <Math>{"d_{\\min}"}</Math>, the two live-stake gates, the reserved keys, the <Math>{"K"}</Math> period boundaries, and the <Math>{"K"}</Math> budgets are all fixed when the rule is put on chain, and nothing can change them afterwards: changing one means putting a new rule on chain. The periods and the budgets are fixed together, one budget per period, so the two schedules cannot disagree. A rule fixed on chain is stronger than anchoring a document&rsquo;s hash there, because no document exists that could disagree with what executes.
                </PaperRun>
            </PaperSection>

            <PaperSection title="10. Why Reconstruction-Based Verification Fails">
                <p>
                    Reconstruction admits two natural approaches, and neither escapes the fork of Section 9. The bond, the challenge, and the forum are a cost of the branch, not of a technique. We work through both, because the case for capture is made by what reconstruction costs.
                </p>
                <PaperRun title="Proof-gated verification.">
                    One approach gates a posted root behind a zero-knowledge proof: a succinct-proof virtual machine runs the aggregator and attests that the root is the formula&rsquo;s output over a supplied event window. The proof binds the <em>formula</em> to the <em>inputs</em>: given those events, the root is exactly the formula&rsquo;s output. It cannot bind the inputs to <em>chain history</em>. A submitter who feeds the prover a doctored event stream, omitting some clauses&rsquo; use and inventing others&rsquo;, obtains a valid proof of the wrong allocation, because the proof certifies computation and says nothing of provenance. Input provenance remains a trusted-submitter assumption, so the approach pays for proving without discharging the branch&rsquo;s cost.
                </PaperRun>
                <PaperRun title="Posted root under a bonded challenge.">
                    A second approach drops the proof and fixes the window by the chain instead: every event up to the block before the posting, the same for every observer. It then applies the pattern optimistic constructions are built on, in the shape Kalodner et al. (2018) set out for off-chain virtual-machine execution: a claim about a computation stands unless a party disputes it, and a challenge protocol identifies and penalizes the party that lied. A poster locks a bond, anyone may lock an equal bond to void the posting, and an unchallenged posting finalizes. This closes the provenance hole and is sound on its own terms. Its cost is the sequence of Section 9. A correct allocation waits on a challenge period whose only function is to give a hypothetical challenger time. The bonds at stake in a challenge need a rule, which means an escalation path, a concession deadline, and an arbitration forum composed into the token system, a discretionary body inside a mechanism whose claim is to have none. And safety rests on liveness: at least one honest party watching, recomputing, and willing to bond at each of the <Math>{"K"}</Math> postings, one a period.
                </PaperRun>
                <p>
                    Counting as it happens dominates both by refusing their shared premise. There is no window, because there is no reconstruction; no root, because there is no assertion; and no bond, challenge, forum, or watcher, so a correct allocation is claimable when its period closes and an incorrect one cannot be expressed. When a construction accumulates a bond, a challenge, and a referee, the thing to examine is the claim it was built to make believable.
                </p>
            </PaperSection>

            <PaperSection title="11. Scope">
                <PaperRun title="Cohort selection is the formula.">
                    The recipient set is the designers of registrations with eligible adoption in the period: counted while the seller&rsquo;s and the registration&rsquo;s stakes were live, scoring above the floor, and claimed while the registration&rsquo;s stake and the claimant&rsquo;s member stake are live. The proportions are the rule&rsquo;s output, with no list to curate and no committee to convene. The mechanism therefore rewards exactly three kinds of contribution, clause design, agreement composition, and assembly design, and is silent on every other kind of protocol work: client development, documentation, review, operations. Whether to fund those from its treasury is the DAO&rsquo;s judgment.
                </PaperRun>
                <PaperRun title="Single denomination per process.">
                    The mechanism binds each process to a single denomination, and the counting layer relies on none: it reads a process&rsquo;s parties and its resolution, compares no values across tokens, and never writes to the mechanism. What is scored is the shape of a trade, not the units it moved.
                </PaperRun>
                <PaperRun title="The rule optimizes nothing.">
                    The mechanism has no social-welfare objective. A welfare criterion over designers would rank kinds of contribution, a ranking justifies weights, and a weight is the judgment Section 6 declines. Neutrality comes from holding no objective over kinds of work: the reward is uniform, and the two-sided stake carries what the score cannot. The constants are published as calibrations of that position: the exponents a judgment about breadth over depth, the floor the number of separately priced identities a registration must gather, and the stakes, the cooldown, and the period length a point on a curve any reader can recompute.
                </PaperRun>
            </PaperSection>

            <PaperSection title="12. Conclusion">
                <p>
                    A designer reward can rest on facts the chain already holds, and nothing else. Because a resolution is the buyer&rsquo;s terminal acceptance, a count of resolved processes measures completed trade; because the count is checked at the event against the signed merkle root and the order&rsquo;s resolution on chain, no allocator, submitter, challenger, or referee is needed to make it believable; and because breadth is counted in distinct staked sellers, the one quantity the score rewards most is the one a stake prices. The result is a Sybil resistance stated as a price: fabricated score for one registration has a flat unit price in the base currency; against an honest total taken as given, a share of a period costs an outlay convex in that share and unbounded as it approaches the whole; and every figure is recomputable from the rule&rsquo;s constants and one gas measurement. Designers of clauses, registered agreements, and assemblies are rewarded for what their work demonstrably carried, and nothing between the trade and the reward holds an opinion.
                </p>
            </PaperSection>
        </PaperLayout>
    );
}
