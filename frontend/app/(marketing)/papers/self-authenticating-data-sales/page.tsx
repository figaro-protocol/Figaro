import type { Metadata } from "next";
import { withOg } from "@/lib/shared/pageMetadata";
import {
    PaperLayout,
    PaperSection,
    PaperRun,
    PaperRemark,
    PaperScroll,
} from "@/components/papers/PaperLayout";
import { Math } from "@/components/papers/Math";

export const metadata: Metadata = withOg({
    title: "Self-Authenticating Data Sales — Figaro",
    description:
        "A buyer cannot value information without seeing it, and having seen it has no reason to pay: Arrow's information paradox. Under a bonded commitment the buyer resolves after delivery because resolving refunds its own bond, so the value it has extracted cancels; provenance verifies by recomputation against an agreement's merkle root and against the content hashes a process's parties attested; and the doubled seller bond leaves a seller that ships less than its license describes out of pocket, while the buyer withholds resolution, even after it is credited with what it keeps.",
});

export default function SelfAuthenticatingDataSalesPaper() {
    return (
        <PaperLayout slug="self-authenticating-data-sales"
            title="Self-Authenticating Data Sales"
            subtitle="Arrow's Information Paradox Under the Bonded Commitment"
            author="Figaro"
            date="August 2026"
            watermark="Figaro Protocol · Preprint"
            abstract={
                <>
                    <p>
                        Arrow (1962) observed that a buyer cannot value information before seeing it, and once it has seen it, it has acquired it without paying. We show that under a bonded commitment the paradox no longer bars a first sale between strangers, by economic construction rather than by access control: one horn closes, and the other is answered. The appropriation horn closes outright: after delivery, resolving refunds the buyer&rsquo;s own bond, and the value the buyer has already extracted sits in both of its continuations and cancels. The valuation horn is answered in two parts. Provenance verifies by recomputation: a term of a signed agreement verifies against the agreement&rsquo;s merkle root, left on-chain when the order commits, and data delivered during a process verifies against the content hash its producer attested under that agreement&rsquo;s terms while the process stood open, and where a seller attested it, it passed a buyer that could have withheld resolution and did not. The doubled seller bond then leaves a seller that ships less than its license describes out of pocket while the buyer withholds resolution, even credited with everything it keeps. That bounds what misdescription is worth to the seller and leaves the buyer a residual valuation risk. A disclosure regime is a designer&rsquo;s fill in a published agreement, so two regimes are two distinct designs. One license term chooses a snapshot or a stream, and the stream adds a continuation value on top of a bonded floor. The guarantee is referential rather than substantive, and it covers one transaction, never the correlated data of third parties.
                    </p>
                </>
            }
            references={
                <>
                    <li>Acemoglu, Daron, Ali Makhdoumi, Azarakhsh Malekian, and Asuman Ozdaglar. 2022. &ldquo;Too Much Data: Prices and Inefficiencies in Data Markets.&rdquo; <em>American Economic Journal: Microeconomics</em> 14 (4): 218&ndash;256. https://doi.org/10.1257/mic.20200200.</li>
                    <li>Akerlof, George A. 1970. &ldquo;The Market for &lsquo;Lemons&rsquo;: Quality Uncertainty and the Market Mechanism.&rdquo; <em>Quarterly Journal of Economics</em> 84 (3): 488&ndash;500. https://doi.org/10.2307/1879431.</li>
                    <li>Arrow, Kenneth J. 1962. &ldquo;Economic Welfare and the Allocation of Resources for Invention.&rdquo; In <em>The Rate and Direction of Inventive Activity: Economic and Social Factors</em>, edited by Richard R. Nelson, 609&ndash;626. Princeton, NJ: Princeton University Press for the National Bureau of Economic Research.</li>
                    <li>Figaro. 2026. &ldquo;Asymmetric Bonding and Buyer Dominance: Two Composing Mechanisms for N-Party Coordination Among Strangers.&rdquo; Preprint. Accessed October 18, 2026. https://figaroprotocol.com/papers/asymmetric-bonding/.</li>
                    <li>Fudenberg, Drew, and Eric Maskin. 1986. &ldquo;The Folk Theorem in Repeated Games with Discounting or with Incomplete Information.&rdquo; <em>Econometrica</em> 54 (3): 533&ndash;554. https://doi.org/10.2307/1911307.</li>
                    <li>Klein, Benjamin, and Keith B. Leffler. 1981. &ldquo;The Role of Market Forces in Assuring Contractual Performance.&rdquo; <em>Journal of Political Economy</em> 89 (4): 615&ndash;641. https://doi.org/10.1086/260996.</li>
                    <li>Merkle, Ralph C. 1988. &ldquo;A Digital Signature Based on a Conventional Encryption Function.&rdquo; In <em>Advances in Cryptology&mdash;CRYPTO &rsquo;87</em>, edited by Carl Pomerance, 369&ndash;378. Lecture Notes in Computer Science 293. Berlin: Springer. https://doi.org/10.1007/3-540-48184-2_32.</li>
                    <li>Shapiro, Carl, and Hal R. Varian. 1998. <em>Information Rules: A Strategic Guide to the Network Economy</em>. Boston: Harvard Business School Press.</li>
                    <li>Williamson, Oliver E. 1983. &ldquo;Credible Commitments: Using Hostages to Support Exchange.&rdquo; <em>American Economic Review</em> 73 (4): 519&ndash;540. https://www.jstor.org/stable/1816557.</li>
                </>
            }
        >
            <PaperSection title="1. The Paradox, Restated">
                <p>
                    Arrow (1962, 615) observed that information behaves unlike an ordinary good at the moment of sale: &ldquo;there is a fundamental paradox in the determination of demand for information; its value for the purchaser is not known until he has the information, but then he has in effect acquired it without cost.&rdquo; A buyer of a dataset, a model, or a finding cannot price it sight unseen, because its value is exactly what is withheld until the sale. Yet a buyer shown enough to price it has, in the same act, been given the thing itself.
                </p>
                <PaperRun title="The valuation horn.">
                    Before disclosure, the buyer cannot tell a genuine, well-sourced dataset from a fabricated or degraded one, nor an accurate description of a licensed feed from an inaccurate one. This is the quality-uncertainty problem Akerlof (1970) formalized for used cars, applied to provenance as well as to content. It is sharpened by one fact: the only direct test of quality, inspecting the good, is the disclosure that triggers the second horn. Against Akerlof&rsquo;s problem, the bond holds the seller to the described quality: shipping less than the license describes cannot pay. The bond holds the seller to no quality the description leaves unstated, and there the lemons problem stands, its reach set by how precisely the license is written.
                </PaperRun>
                <PaperRun title="The appropriation horn.">
                    After disclosure, the content the buyer wanted has already changed hands. Information is non-rival and, once shown, non-excludable without an outside enforcer, so nothing about having seen a dataset compels its buyer to pay (Shapiro and Varian 1998). A seller that discloses to let the buyer value the good gives up, in the same motion, the leverage that would have compelled payment.
                </PaperRun>
                <p>
                    Classical remedies each answer one horn at the cost of the other. Patents and copyright make information excludable, but they need registration, a jurisdiction, and litigation, and they do not reach an unregistered dataset or a one-off feed. A non-disclosure agreement makes the second horn a breach, but a breach found after the value is extracted is a recourse rather than a deterrent, and it does nothing for provenance. Repeated dealing answers both horns over a relationship&rsquo;s life, and supplies nothing for a first sale between strangers.
                </p>
                <p>
                    Our claim concerns exactly that first sale, between parties who share no history and no jurisdiction and are beyond each other&rsquo;s coercive reach, which is the condition under which the mechanism&rsquo;s equilibrium is proved. The first sale is where the mechanism does work no other remedy does; repetition, where it follows, compounds on that floor (&sect;6). The appropriation horn is closed outright; the valuation horn is answered by verified provenance and by a bond that bounds what misdescription is worth, leaving a residual risk that &sect;8 states. &ldquo;Self-authenticating&rdquo; names a property of the binding, not the evidentiary status the law gives the word: the bytes recompute to a fingerprint (a hash of content) the chain fixed, which shows who committed or attested them and never that they are true.
                </p>
            </PaperSection>

            <PaperSection title="2. A Data Sale Is an Ordinary Bonded Order">
                <p>
                    A data sale runs on the same mechanism as any other bonded trade, with clauses that name its subject as data. The argument below is an application of that mechanism, so we state its objects and its equilibrium here, at the depth the argument uses. A <em>clause</em> is one reusable term, written once and published for anyone to compose. An <em>agreement</em> is the clauses composed for one buyer&ndash;seller relationship, which the two parties complete and sign as their order&rsquo;s terms. A <em>designer</em> is whoever publishes a clause, an agreement, or an assembly, through its wallet (an account a private key controls). A designer composes an agreement&rsquo;s value-free design, the <em>published agreement</em>, and publishes it under its hash.
                </p>
                <p>
                    A seller publishes what it offers and what it is, item by item. A buyer takes a published design and fills it with the real parties and amounts, the seller&rsquo;s published terms supplying the fields they hold; the buyer fills what remains, and both parties sign the result. An <em>assembly</em> is a list of published agreements composed into one reusable design; a <em>process</em> is one instance of an assembly, opened by a single buyer; an <em>order</em> is one buyer&ndash;seller commitment inside a process. The <em>mechanism</em> has two operations, commit and the buyer&rsquo;s resolution, run by on-chain contracts that hold the bonds, and it sees each process as a linear chain of commitments extending one accumulator, the running total of the value committed.
                </p>
                <PaperRun title="The mechanism, at the depth the argument uses.">
                    Two operations move a bond (Figaro 2026). At <em>commit</em> buyer and seller sign one commitment: the buyer bonds twice the payment <Math>{"P"}</Math>, and the seller bonds twice the cumulative value through its order, <Math>{"G_i = \\sum_{j \\leq i} P_j"}</Math>, so a single-order data sale has <Math>{"G = P"}</Math> and both bonds equal <Math>{"2P"}</Math>. At <em>resolve</em>, which only the buyer may call, every order of the process is paid and every bond refunded at once, the buyer&rsquo;s less the payments, or nothing happens. No other path refunds a bond, whatever time passes. The chain holds the bonds and the <em>fingerprints</em> of what was committed and attested (a fingerprint is the hash of a piece of content, which whoever holds the content recomputes and compares), so its data shows what was undertaken and whether it closed, never that anyone performed. Because delivery is off-chain, each party is credited with what it <em>retains</em>, at the value the parties signed. A seller that keeps what is in its hands is credited at most <Math>{"G"}</Math> against <Math>{"2G"}</Math> locked, and stands at best at <Math>{"-G"}</Math> against the <Math>{"+P"}</Math> that performing pays. After performance the buyer strictly prefers resolving, at <Math>{"0"}</Math>, to never resolving, at <Math>{"-P"}</Math>, whatever the seller did; this is comparison (a), the one unconditional anchor. Given it and the buyer&rsquo;s plan to resolve once performance has occurred and not before, performing is the seller&rsquo;s strict best response, and, while its co-sellers perform, each seller&rsquo;s in a process of several orders. For parties beyond each other&rsquo;s coercive reach, cooperation is an equilibrium at any number of orders resolved together, in one atomic act (Figaro 2026). Under-performance never reaches the node of (a): it routes to a standoff, both bonds locked while a remedy is negotiated.
                </PaperRun>
                <PaperRun title="Where recourse sits.">
                    Recourse sits <em>before</em> resolution. Where a seller cannot perform, the parties arrange the remedy while the process stands open. The failing seller sends the buyer the payment it stands to receive, so at resolution it is refunded its bond and paid a payment it has already paid away. It ends at zero, and the buyer is whole. Where the parties disagree, an outside forum can read the process&rsquo;s data and whatever each party brings, and can rule while the process is open. A forum cannot call resolve, which is the buyer&rsquo;s alone, so there is no direct enforcement into the mechanism, and composing a forum costs the equilibrium nothing. Resolution is terminal acceptance: nothing is recoverable inside the mechanism after it.
                </PaperRun>
                <p>
                    A data sale&rsquo;s agreement carries what every order carries, the price the bonds are struck against and the order&rsquo;s place in its process, and two terms that make it a data sale: a <em>license term</em> and a <em>delivery term</em>.
                </p>
                <p>
                    The license term holds the terms of this sale. It gives a short name for the dataset, stream, or family of data licensed, the permitted purpose, and whether access is a one-time <em>snapshot</em> or a continuing <em>stream</em>. It states whether redistribution is permitted. Where the licensed content derives from earlier trade, it names the resolved processes it derives from by their identifiers. The seller writes these terms into what it publishes, and they become terms of the agreement both parties sign. The delivery term holds the delivery: the artifact, or a key to it, passes to the buyer off-chain by whatever means the terms name, and the seller attests the fingerprint of what it delivered while the process is open. Any recipient then verifies by rehashing what it received.
                </p>
                <p>
                    A further term, the <em>disclosure term</em>, does a different job: it is the disclosure regime for a process&rsquo;s own co-produced data, meaning the signed agreement, the attested evidence, and the books each side keeps. It fixes one of three postures: neither party discloses beyond the parties, each party may disclose the copy it holds, or either party may publish. It also carries the buyer&rsquo;s per-order choice, permit or withhold, over the half of the data the buyer contributed. A designer composes it into the published agreement of any process whose data may later be worth something, so it marks the process that <em>produces</em> saleable data. The later sale of that data is a separate process carrying the terms above.
                </p>
            </PaperSection>

            <PaperSection title="3. Provenance Verifies by Recomputation">
                <p>
                    A term of a signed agreement verifies against the agreement&rsquo;s merkle root (Merkle 1988). The root commits to one leaf per clause, each leaf binding the clause to its filled terms; the root is the agreement&rsquo;s fingerprint. Both parties sign the fingerprint. The chain holds it from the order&rsquo;s commit; resolution writes no fingerprint. A party holding the agreement can disclose one clause with its inclusion proof, and the recipient checks the pair by recomputation: hash the disclosed terms, walk the proof, compare with the fingerprint left on-chain. Nothing else about the agreement is disclosed in the clear, nothing about the discloser is believed, and a single altered character fails the check. Where a leaf binds a clause to its terms alone, with no secret beside them, a fingerprint hides only content an outsider cannot enumerate. A proof&rsquo;s sibling hashes (the hashes beside a leaf on its path to the root), and any attested hash of guessable content such as a yes-or-no flag or a small category, therefore give that content away to anyone who hashes the candidates. A party whose content is enumerable keeps it out of the agreement, since a sibling that cannot be guessed hides nothing of a leaf that can, and an agreement all of whose leaves are enumerable is given away by its root alone.
                </p>
                <p>
                    Data a process produces while it is open is not a leaf of its agreement, because the terms were fixed at commit, before the telemetry or the delivered file existed. Such data reaches the chain as an attestation: the party that produced it files a content hash of it against a clause of the order it concerns. A party attests for itself. The mechanism accepts an attestation only from a party to the order it concerns: the process&rsquo;s buyer, or that order&rsquo;s own seller. It accepts one only while the process is open, and only with an inclusion proof that the clause is a leaf of the order&rsquo;s fingerprint. A recipient rehashes the data it received and compares the result with the attested hash. What it then holds is a narrow fact: a named party filed exactly these bytes, under those terms, in a process its buyer later resolved.
                </p>
                <p>
                    The license is a term of the sale&rsquo;s own agreement, so it verifies by the first route against the sale process&rsquo;s fingerprint. It reaches its source by naming: it carries the identifiers of the resolved processes whose data it licenses. A buyer therefore runs three checks: the license against the sale&rsquo;s fingerprint, the source&rsquo;s disclosed terms against the source&rsquo;s fingerprint, and each delivered file against the hash attested in the source. Each check is a recomputation against data the chain fixed when each order committed and when each attestation was filed, which the seller cannot rewrite.
                </p>
                <p>
                    The checks rest on one premise: that the named source had resolved before the sale committed, since a source still open can take attestations after the sale commits. Commit reads no process but its own, and a license&rsquo;s terms reach the chain only as a fingerprint, so commit cannot check that a named source has resolved. The buyer reads each source&rsquo;s resolution on-chain before it signs. With that premise met, every datum checked was fixed no later than the sale&rsquo;s commit. This is the whole meaning of &ldquo;self-authenticating&rdquo; here, and it verifies identically for data produced yesterday and for data bought third-hand.
                </p>
                <p>
                    Provenance does not price the part of a dataset the buyer has not inspected; the bond does, on the accounting of &sect;2. A seller that ships a feed materially different from what the license describes has not performed, as any bonded seller that ships something else has not performed. The retention arithmetic of &sect;2 applies to it unchanged. For a data seller, what that arithmetic credits is what shipping less lets it keep: the withheld data and the collection it skipped. Its own copy does not count, because it keeps that copy whether it performs or not; the copy sits in both branches and cancels. The bond is a credible commitment in Williamson&rsquo;s (1983) sense: the seller locks it against its own conduct, when the buyer cannot yet verify what it will receive. It is refunded only at a resolution an unsatisfied buyer does not give.
                </p>
                <PaperRun title="Proposition 1 (the valuation horn is answered).">
                    A buyer holding data a resolved process left can establish, by recomputation against fingerprints the chain fixed and a read of that process&rsquo;s resolution, that the data is what the process committed or a party to it attested, and, where a seller attested it, that it passed a buyer that could have withheld resolution and did not. A seller that ships less than its license describes is out of pocket while the buyer withholds resolution. What is left for the buyer to price is the description&rsquo;s own looseness, not the content it has not seen.
                </PaperRun>
                <ol className="space-y-2 list-decimal pl-6 text-sm">
                    <li><strong>A term fixed at commit is a leaf.</strong> A disclosed term verifies by inclusion proof against the root both parties signed, which the chain holds from the order&rsquo;s commit (Merkle 1988; the first paragraph of this section).</li>
                    <li><strong>Data produced while the process is open reaches the chain as an attestation.</strong> The mechanism admits the content hash only from the order&rsquo;s own seller or the process&rsquo;s buyer, and only while the process is open (stipulated, as the mechanism&rsquo;s rule stated above).</li>
                    <li><strong>Resolution is the buyer&rsquo;s alone and is terminal, and the license names processes that resolved before the sale committed</strong> (&sect;2; the paragraph above). So a seller&rsquo;s attestation in a resolved process was made while a buyer could still withhold resolution, with that seller&rsquo;s bond and its own locked, until the attestation was put right; and the buyer resolved instead.</li>
                    <li><strong>A seller is credited with what it retains at the signed value.</strong> At most <Math>{"G"}</Math> against <Math>{"2G"}</Math> locked (&sect;2; Figaro 2026).</li>
                    <li><strong>Stipulated: a part of the data not shipped is either kept or never collected, so what the seller retains and what it saves are together credited at most the signed value of what it did not ship, which is at most <Math>{"G"}</Math>.</strong> A saving is a cost not incurred, which the signed value does not measure, so the argument takes it at that bound.</li>
                    <li><strong>Stipulated: the license describes the content precisely enough that shipping materially less is non-performance.</strong> A license that does not is the lemons residual of &sect;8.</li>
                </ol>
                <PaperRun title="Step 1, provenance (premises 1 to 3).">
                    The buyer recomputes three fingerprints, the license against the sale&rsquo;s root, the source&rsquo;s terms against the source&rsquo;s root, and each delivered file against the hash attested in the source, and reads the source&rsquo;s resolution on chain. By premises 1 and 2 the recomputations establish the binding: these bytes were committed, or attested by a named party, in the process the license names. By premise 3, bytes a seller attested were open to a buyer that could have withheld resolution and resolved instead; bytes the buyer attested stand as that buyer&rsquo;s own statement, and a reader weighs them as &sect;8 says. The binding and that resolution, never the truth of the content, are the provenance a stranger buys.
                </PaperRun>
                <PaperRun title="Step 2, misdescription (premises 4 to 6).">
                    By premise 6 shipping less than the license describes is non-performance. By premises 4 and 5 the seller is credited at most <Math>{"G"}</Math> for what it withheld and what it saved together, against <Math>{"2G"}</Math> locked, so it stands at best at <Math>{"-G"}</Math> against the <Math>{"+P"}</Math> that performing pays. No shortfall against the description pays while the buyer withholds resolution. Provenance is fixed by step 1 and shortfall does not pay, so what remains for the buyer to price is how loosely the description is worded, the residual &sect;8 states.
                </PaperRun>
                <PaperRun title="Conclusion.">
                    A buyer holding data a resolved process left can establish, by recomputation against fingerprints the chain fixed and a read of that process&rsquo;s resolution, that the data is what the process committed or a party to it attested, and, where a seller attested it, that it passed a buyer that could have withheld resolution and did not. A seller that ships less than its license describes is out of pocket while the buyer withholds resolution. What is left for the buyer to price is the description&rsquo;s own looseness, not the content it has not seen.
                </PaperRun>
                <PaperRun title="What would refute it?">
                    Against step 1: a disclosed term that verifies against a root other than the one the chain fixed at commit; a delivered file that recomputes to the attested hash yet differs from the bytes attested; an attestation the mechanism admitted from a party outside the order or after the process resolved; or a process resolved by anyone but its buyer, or closed by another path. Against step 2: a seller strictly better off shipping less than described while the buyer withholds, which needs a retained or saved value above the signed value of what it did not ship.
                </PaperRun>
                <PaperRemark title="Scope.">
                    Recomputation establishes the binding, and the chain shows the resolution; neither is the truth of the content. A buyer may resolve without regard to what arrived, so the resolution shows that the buyer closed the trade, not that it checked the bytes, and a source process whose two keys are one holder&rsquo;s shows nothing at all; &sect;8 states how a reader weighs each. The bound of step 2 is a bound on what misdescription is worth to the seller, not on the buyer&rsquo;s disappointment under a loosely worded license (&sect;8). The result holds for parties beyond each other&rsquo;s coercive reach, as every result of the mechanism does.
                </PaperRemark>
            </PaperSection>

            <PaperSection title="4. Bonded Resolution Closes the Appropriation Horn">
                <p>
                    Self-authentication leaves the second horn standing: nothing about an inclusion proof stops a buyer who has received a licensed file from reading it, copying it, and declining to pay. What stops it is the shape of resolution. Write <Math>{"P"}</Math> for the sale&rsquo;s payment and <Math>{"W"}</Math> for what the delivered content is worth to this buyer, a figure the buyer alone knows and the mechanism never sees. The accounting of &sect;2 credits a buyer with what it holds at the value both parties signed, which for a single-order sale is <Math>{"P"}</Math>. <Math>{"W"}</Math> is a different measure: private, unsigned, and free to sit above or below <Math>{"P"}</Math>.
                </p>
                <PaperRun title="Proposition 2 (the appropriation horn closes).">
                    A buyer that has received the licensed content strictly prefers resolving to never resolving, by exactly the payment <Math>{"P"}</Math>, whatever the content is worth to it.
                </PaperRun>
                <ol className="space-y-2 list-decimal pl-6 text-sm">
                    <li><strong>The bond is twice the payment.</strong> The buyer locked <Math>{"2P"}</Math> at commit (&sect;2; Figaro 2026).</li>
                    <li><strong>Resolving nets <Math>{"W - P"}</Math>.</strong> Resolving refunds the locked <Math>{"2P"}</Math> less the <Math>{"P"}</Math> that transfers to the seller, and the content stays where it is.</li>
                    <li><strong>Never resolving nets <Math>{"W - 2P"}</Math>.</strong> The whole bond stays locked, and the content stays where it is there too, since withholding resolution un-discloses nothing that has reached the buyer.</li>
                    <li><strong>There is no third continuation.</strong> Commit and the buyer&rsquo;s resolve are the only operations that move a bond, so after delivery the buyer has no exit from the bonded state (&sect;2).</li>
                </ol>
                <PaperRun title="Step, cancellation (premises 2 to 4).">
                    Subtract the two continuations&rsquo; payoffs. <Math>{"W"}</Math> enters both with coefficient one, so it drops out:
                </PaperRun>
                <PaperScroll className="my-4">
                    <Math display>{"(W - P) \\;-\\; (W - 2P) \\;=\\; P \\;>\\; 0 \\qquad \\text{for every } W"}</Math>
                </PaperScroll>
                <PaperRun title="Conclusion.">
                    The buyer that has received the content strictly prefers resolving, by exactly <Math>{"P"}</Math>, whatever <Math>{"W"}</Math> is. Its valuation cancels, exactly as the signed figure does in comparison (a), and the mechanism therefore never prices the quantity Arrow&rsquo;s paradox says nobody can price before disclosure.
                </PaperRun>
                <PaperRun title="What would refute it?">
                    A continuation open to a buyer holding the content whose payoff, less the payoff of resolving, depends on <Math>{"W"}</Math>. A path out of the bonded state that refunded the buyer&rsquo;s bond without paying would be one; a term that let the buyer keep the content in one continuation and not the other would be another. Premise 4 excludes the first and premise 3 the second.
                </PaperRun>
                <PaperRemark title="Scope.">
                    Performance is assumed: the seller delivered what the license describes, and the case where it did not is the valuation horn&rsquo;s, treated in &sect;3 and &sect;8. The result is a comparison at a node, not a ranking of every plan a buyer might adopt. The mechanism admits a buyer that resolves without regard to what arrived; such a buyer has given up the one instrument the mechanism reserves to it, and no argument here rests on it. The comparison holds for parties beyond each other&rsquo;s coercive reach, as every result of the mechanism does.
                </PaperRemark>
                <p>
                    Does the data case weaken the buyer&rsquo;s reason to resolve, since a buyer of information has banked everything it came for? It does not: the reason is exactly as strong, because what the buyer banked is common to both continuations and drops out. This is the sign Arrow&rsquo;s second horn assumes away. The classical paradox treats payment as a free-standing act a buyer can skip once the content is in hand, because in an ordinary sale skipping costs the buyer nothing. Here paying and reclaiming one&rsquo;s own bond are one call, so skipping is the more expensive of the buyer&rsquo;s two moves, by exactly the payment. No encryption, watermark, or access gate polices the buyer&rsquo;s use of the data after receipt; the buyer&rsquo;s own arithmetic does.
                </p>
                <p>
                    Can a buyer that has received the data claim misdescription and withhold, to press for the remedy of &sect;2 and so keep the data and its payment? Not against a seller that performed. Carrying out the threat leaves the buyer at <Math>{"W - 2P"}</Math>, against <Math>{"W - P"}</Math> by resolving, so the threat is not credible. A performing seller can decline the remedy, and the buyer&rsquo;s best reply is still to resolve (Figaro 2026, Theorem 1). A remedy is owed only where the license was not met, which the parties, or an outside forum, decide while the process stands open.
                </p>
                <p>
                    The direction of the usual telling is reversed at no cost. In an ordinary trade the buyer&rsquo;s willingness to withhold disciplines a seller that has not performed; in a data sale it is the buyer, holding what it came for, that might want to withhold. The arithmetic is indifferent to which party is tempted, because withholding strands the withholder&rsquo;s own bond and transfers none of the counterparty&rsquo;s to it.
                </p>
            </PaperSection>

            <PaperSection title="5. A Disclosure Regime Is a Published Agreement's Fill">
                <p>
                    The disclosure regime is fixed by the designer, as a fill of the published agreement that composes the disclosure term. An agreement&rsquo;s hash commits to every clause with the designer&rsquo;s fills. Two published agreements that differ only in their regime, one letting each party disclose its own copy and one letting either party publish, therefore have two different hashes. An assembly is identified by the agreements it composes, so an assembly built from one of them differs from the same design built from the other; it differs through the agreement, never as a version of a shared design.
                </p>
                <p>
                    A process instantiates one assembly, and the order it commits carries the disclosure term with that regime, which both parties sign as they sign the price. Within the regime, the buyer&rsquo;s consent over the content it contributed is a separate per-order choice, permit or withhold, filled by the buyer and committed at signing, never inferred from the regime. The regime reaches only the data the process leaves; what the parties keep private for one order, such as a delivery address, is never a candidate for disclosure under any regime.
                </p>
            </PaperSection>

            <PaperSection title="6. Repetition Compounds on a Bonded Floor">
                <p>
                    One field of the license term chooses between two products. A <em>snapshot</em> is a one-time delivery of the data as it stands, verified once by content hash. A <em>stream</em> is continuing access to growing data, and the clause admits two forms of it. In the first, each period is a further bonded order. We take each as a single-order process of its own, so <Math>{"G = P"}</Math> holds each period and the comparison of &sect;4 runs at each period&rsquo;s resolution, with that period&rsquo;s valuation canceling. In the second, periods are further handoffs under one order&rsquo;s terms; that stream is one bonded order, and the comparison runs once, at its resolution, over everything delivered before it. In the second form both bonds stay locked for the whole term; in the first each period&rsquo;s are refunded at that period&rsquo;s resolution.
                </p>
                <p>
                    The rest of this section treats the first form, where every period is separately bonded. Repetition is load-bearing for neither horn, and what it adds is a second discipline on top of a floor that does not need it. A seller whose period ships degraded or fabricated data stands where &sect;3 leaves it, out of pocket, with its own bond locked in the same process, while the buyer withholds and a remedy is negotiated. It also stands to lose the buyer&rsquo;s next period, which no bond had to be posted to make costly. A licensee found to have redistributed a stream held under a no-redistribution term stands to lose continued access on the same footing.
                </p>
                <p>
                    This is the ordinary logic by which a relationship&rsquo;s continuation value disciplines conduct beyond one period&rsquo;s stakes (Klein and Leffler 1981; Fudenberg and Maskin 1986), applied where every period is bonded rather than promised. The continuation value therefore adds to a floor rather than substituting for one. We read the stream as the form in which honest data production sustains itself. The deceived snapshot buyer holds the bonded position of one order; the stream seller holds that position and a continuation it wants, which the buyer alone renews.
                </p>
            </PaperSection>

            <PaperSection title="7. A Worked Instance">
                <p>
                    Two independent bonded processes carry the whole cycle, in one denomination. In process <Math>{"A"}</Math>, a client buys a survey flight from an operator for <Math>{"P_A = 400"}</Math>. Besides the price, its agreement carries a flight window, an origin and a destination, the operator&rsquo;s declared license number, a delivery term, and a disclosure term under which each party may disclose the copy it holds. The client fills the price and the window and chooses <em>permit</em> over its own half; the license number comes from what the operator published. Both bond <Math>{"800"}</Math> at commit. The operator flies, delivers the telemetry file, and attests its fingerprint under the delivery term while the process is open. The client resolves: the operator receives <Math>{"1{,}200"}</Math>, its bond and the payment, and the client is refunded <Math>{"400"}</Math>.
                </p>
                <p>
                    In process <Math>{"B"}</Math>, the client is the seller. It licenses the telemetry to a licensee for <Math>{"P_B = 100"}</Math>, under an agreement carrying the price, a license term (a <em>snapshot</em>, redistribution prohibited, process <Math>{"A"}</Math> named as the source), and a delivery term. Both bond <Math>{"200"}</Math>. The client delivers the file and attests its fingerprint under <Math>{"B"}</Math>&rsquo;s delivery term. The agreement of <Math>{"B"}</Math> needs no disclosure term, because the regime governs a process&rsquo;s own data and the data being sold is <Math>{"A"}</Math>&rsquo;s. To the mechanism these are two separate linear chains, each against its own accumulator; nothing on-chain states that <Math>{"B"}</Math> derives from <Math>{"A"}</Math>, and the link is the license term&rsquo;s naming of it.
                </p>
                <p>
                    The licensee runs the checks of &sect;3 in their three places. The license verifies by inclusion proof against <Math>{"B"}</Math>&rsquo;s fingerprint and names <Math>{"A"}</Math>. The flight&rsquo;s terms, the window, the locations, and the credential declaration, verify against <Math>{"A"}</Math>&rsquo;s fingerprint, fixed when <Math>{"A"}</Math> committed and beyond the reach of anything in <Math>{"B"}</Math>; the client may disclose them under <Math>{"A"}</Math>&rsquo;s disclosure term, which lets each party disclose its own copy. The file verifies by rehashing: its hash must equal the one the operator attested in <Math>{"A"}</Math>, and the one the client attested in <Math>{"B"}</Math>. The credential is different in kind. The fingerprint shows that the operator declared that license number and both parties signed it; whether the license is valid, the licensee reads from the issuing authority&rsquo;s own register.
                </p>
                <p>
                    The licensee&rsquo;s position follows &sect;4 with <Math>{"P = 100"}</Math>. Having received the file, it ends at <Math>{"W - 100"}</Math> by resolving and at <Math>{"W - 200"}</Math> by never resolving, whatever the telemetry is worth to it. Had the client shipped a truncated file, the hash would not match <Math>{"A"}</Math>&rsquo;s attestation, and the licensee would withhold. The client, credited with at most <Math>{"100"}</Math> for what it kept against <Math>{"200"}</Math> locked, would stand at best at <Math>{"-100"}</Math>. Delivering pays it <Math>{"+100"}</Math> under the licensee&rsquo;s plan to resolve on delivery.
                </p>
            </PaperSection>

            <PaperSection title="8. Scope and Limits">
                <p>
                    Four further risks stand beside the result; the mechanism bounds each and closes none. <em>First, the bond bounds misdescription; it does not abolish valuation risk.</em> Here the lemons problem of &sect;1 remains: a seller can ship a feed consistent with a loosely worded license and still disappoint a buyer who read the license generously. What &sect;3 establishes is that shipping less than the license describes cannot pay, not that the buyer&rsquo;s disappointment is smaller than the seller&rsquo;s bond. The precision of the license text does work no bond schedule can do for it, and a buyer that accepts a vague description has accepted a correspondingly vague standard of performance.
                </p>
                <p>
                    <em>Second, a no-redistribution term is evidence, not a control.</em> Nothing prevents a licensee from copying data once received. The term leaves a timestamped statement both parties signed, which an outside forum (an arbitration panel or an ordinary court) can rule on while the process stands open. Such a ruling feeds the parties&rsquo; remedy negotiation and reaches the licensee through its exposure outside the process.
                </p>
                <p>
                    <em>Third, the guarantee is referential, not substantive.</em> The chain holds fingerprints: the agreement&rsquo;s root, fixed at commit, and the content hash of each attestation, fixed when filed. It holds no term and no delivered file, which stay with the parties who produced them and are disclosed by their own choice under the regime their process composed, and a fingerprint keeps them hidden only where an outsider cannot enumerate the content (&sect;3). Recomputation therefore shows that disclosed data is the data a named process committed or a named party attested, never that its content is true. A drone that reports a position it was not at produces telemetry that verifies as the attested data of a real resolved flight and is false.
                </p>
                <p>
                    The mechanism prices the false report at two moments. While the process stands open, the seller&rsquo;s bond is locked and the buyer can withhold resolution until the report is put right. Once the buyer resolves, the false attestation stays in the public data under its signer&rsquo;s key. There it bears on what the next buyer pays, on what a forum reads, and on the signer&rsquo;s <em>resolution history</em>. A resolution history is the public summary of the resolved processes a wallet was a party to and the attestations it carries. It is read from the data the processes leave. A buyer&rsquo;s own attestation meets no such pressure, since the buyer resolves at will, and a buyer that resolves without regard to what arrived has given up the one check the mechanism reserves to it; a reader weighs the buyer&rsquo;s attestation and its resolution as that buyer&rsquo;s own statements, against its resolution history.
                </p>
                <p>
                    Neither moment reaches parties acting together. What, then, does a source process prove when its two keys may be one holder&rsquo;s? Recomputation establishes the binding: these bytes sat under that agreement, signed by those two keys. It cannot show the keys were at arm&rsquo;s length, since one holder can sign both sides and resolve at once, at the gas of a commit, an attestation, and a resolve, every token it locked back in its two wallets. The reader weighs that by each key&rsquo;s resolution history: its resolved processes with other parties and its attestations under keys with histories of their own. That history too can be manufactured, at the gas and the time value of every further wallet.
                </p>
                <p>
                    <em>Fourth, the bound covers one transaction.</em> A dataset rarely describes only the party that sells it, and two things lie outside the bound. One is a price externality: a resolved sale can depress the price of correlated data another seller holds (Acemoglu et al. 2022). The other is data about people party to neither process, whose claims over it come from the law that reaches them, and no clause between buyer and seller extinguishes them. Recomputation runs against the two parties&rsquo; own fingerprints, never against the population the content describes, and the bond prices what the seller shipped against what its own license promised. The result of &sect;3 and &sect;4 is a claim about the transaction resolved, to be weighed against both rather than read as having netted them out.
                </p>
            </PaperSection>

            <PaperSection title="9. Conclusion">
                <p>
                    Arrow&rsquo;s paradox does not bar a first data sale between strangers once the sale is a bonded commitment, and the two horns fall to different properties of one mechanism, to different depths. The appropriation horn closes outright, because paying and reclaiming one&rsquo;s own bond are one call and the buyer&rsquo;s private valuation cancels from its only remaining decision. The valuation horn is answered rather than abolished. Provenance becomes a recomputation anyone can run against data the chain fixed no later than the sale&rsquo;s commit, when its source resolved first. The doubled bond makes shipping less than the license describes a loss while the buyer withholds resolution, though not a loss guaranteed to exceed every buyer&rsquo;s disappointment. Neither answer restricts what the buyer does with the data after receipt; both rest on what each party stands to lose by not completing the trade it signed. The judgment this earns is a narrow one. What the mechanism makes tradable between strangers is attested data with verifiable provenance. What it leaves to readers, forums, and the next buyer is the truth of that data and its reach beyond the two parties.
                </p>
            </PaperSection>
        </PaperLayout>
    );
}
