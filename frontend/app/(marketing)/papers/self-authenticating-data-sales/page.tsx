import type { Metadata } from "next";
import Link from "next/link";
import {
    PaperLayout,
    PaperSection,
    PaperRun,
    PaperRemark,
} from "@/components/papers/PaperLayout";
import { Math } from "@/components/papers/Math";

export const metadata: Metadata = {
    title: "Self-Authenticating Data Sales — Figaro Protocol",
    description:
        "A dataset sold on ordinary terms suffers Arrow's information paradox: the buyer cannot value the data without seeing it, and having seen it, has no reason to pay. A settlement layer that records trade as merkle-committed agreements dissolves the paradox economically rather than cryptographically: each record offered for sale carries an inclusion proof against the on-chain fingerprint of the settled process that produced it, and the 2x bond makes misrepresentation of the unseen remainder an economically dominated strategy.",
};

export default function SelfAuthenticatingDataSalesPaper() {
    return (
        <PaperLayout slug="self-authenticating-data-sales"
            title="Self-Authenticating Data Sales"
            subtitle="Dissolving Arrow's Information Paradox Through Bonded Settlement"
            author="Alessandro Daliana"
            date="August 2026"
            watermark="Figaro Protocol · Preprint"
            keywords="information paradox, mechanism design, merkle proofs, data markets, asymmetric bonding, disclosure, repeated games"
            abstract={
                <>
                    <p>
                        A dataset sold on ordinary terms suffers Arrow&rsquo;s information paradox: the buyer cannot value the data without seeing it, and having seen it, has no reason to pay. We show that a settlement layer which records trade as merkle-committed agreements dissolves the paradox <em>as a barrier to trade</em>, economically rather than cryptographically: each record offered for sale carries an inclusion proof against the on-chain fingerprint of the settled process that produced it, so what is sold arrives self-authenticating &mdash; provably a real record of a real trade &mdash; while the 2&times; bond makes misrepresentation of the unseen remainder an economically dominated strategy. The two claims are not symmetric, and the paper is precise about which is which: the appropriation horn is closed outright, since paying and reclaiming one&rsquo;s own bond are the same act; the valuation horn is answered by verified provenance plus a bond that <em>bounds</em> the seller&rsquo;s gain from misdescription rather than eliminating the buyer&rsquo;s residual valuation risk. Section 8 states the three limits in full.
                    </p>
                    <p>
                        Disclosure regimes (closed, each-own, open) are composition choices, not platform policy; the same mechanism prices a snapshot or a stream, and the stream is the repeated game that sustains honest data production.
                    </p>
                </>
            }
            references={
                <>
                    <li>Akerlof, G. A. The Market for Lemons: Quality Uncertainty and the Market Mechanism. <em>Quarterly Journal of Economics</em>, 84(3):488&ndash;500, 1970.</li>
                    <li>Arrow, K. J. Economic Welfare and the Allocation of Resources for Invention. In R. R. Nelson (ed.), <em>The Rate and Direction of Inventive Activity: Economic and Social Factors</em>, pp. 609&ndash;626. Princeton University Press for the National Bureau of Economic Research, Princeton, NJ, 1962.</li>
                    <li>Fudenberg, D. &amp; Maskin, E. The Folk Theorem in Repeated Games with Discounting or with Incomplete Information. <em>Econometrica</em>, 54(3):533&ndash;554, 1986.</li>
                    <li>Klein, B. &amp; Leffler, K. B. The Role of Market Forces in Assuring Contractual Performance. <em>Journal of Political Economy</em>, 89(4):615&ndash;641, 1981.</li>
                    <li>Merkle, R. C. A Digital Signature Based on a Conventional Encryption Function. In <em>Advances in Cryptology &mdash; CRYPTO &rsquo;87</em>, Lecture Notes in Computer Science vol. 293, pp. 369&ndash;378. Springer, Berlin, 1988.</li>
                    <li>Myerson, R. B. Incentive Compatibility and the Bargaining Problem. <em>Econometrica</em>, 47(1):61&ndash;73, 1979.</li>
                    <li>Shapiro, C. &amp; Varian, H. R. <em>Information Rules: A Strategic Guide to the Network Economy</em>. Harvard Business School Press, Boston, 1998.</li>
                    <li>Varian, H. R. Buying, Sharing and Renting Information Goods. <em>Journal of Industrial Economics</em>, 48(4):473&ndash;488, 2000.</li>
                    <li>Williamson, O. E. Credible Commitments: Using Hostages to Support Exchange. <em>American Economic Review</em>, 73(4):519&ndash;540, 1983.</li>
                </>
            }
        >
            <PaperSection title="1. The Paradox, Restated">
                <p>
                    Arrow (1962) observed that information behaves unlike an ordinary good at the moment of sale: &ldquo;there is a fundamental paradox in the determination of demand for information; its value for the purchaser is not known until he has the information, but then he has in effect acquired it without cost.&rdquo; A prospective buyer of a dataset, a model, or a research finding cannot rationally price it sight unseen &mdash; the good&rsquo;s value is exactly the thing withheld until sale &mdash; yet a buyer who has been shown enough to price it has, in the same act, been given the thing itself.
                </p>
                <PaperRun title="The valuation horn.">
                    Before disclosure, the buyer has no basis to distinguish a genuine, well-sourced dataset from a fabricated or degraded one, and no way to distinguish a seller&rsquo;s description of what a licensed feed contains from an accurate one. This is Arrow&rsquo;s paradox applied to provenance rather than only to content: the buyer faces the ordinary quality-uncertainty problem Akerlof (1970) formalized for used cars, sharpened by the fact that the only direct test of quality &mdash; inspecting the good &mdash; is also the disclosure that triggers the second horn.
                </PaperRun>
                <PaperRun title="The appropriation horn.">
                    After disclosure, the informational content the buyer wanted has already changed hands. Information is non-rival and, absent an external enforcement mechanism, non-excludable once shown: nothing about having seen a dataset compels a buyer to then pay for it (Shapiro &amp; Varian, 1998). A seller who discloses to let the buyer value the good has, in the same motion, given up the leverage that would have compelled payment.
                </PaperRun>
                <p>
                    Classical partial remedies each answer one horn at the cost of the other. Patents and copyright convert information into excludable property, but require registration, jurisdiction, and litigation to enforce, and do not help an unregistered dataset or a one-off feed. Non-disclosure agreements make the second horn a breach of contract, but a breach discovered only after the buyer has already extracted the value is a recourse, not a deterrent, and it does nothing for the first horn&rsquo;s provenance problem. Reputation sustained by repeated dealing addresses both horns over a relationship&rsquo;s lifetime (see &sect;6), but supplies nothing for a first transaction between strangers. What follows shows a settlement mechanism that dissolves both horns for a single, first-time sale between parties who have no reputational history and share no jurisdiction &mdash; and does so by economic construction rather than by access control. &ldquo;Dissolves&rdquo; is used throughout in the sense of removing the paradox as an obstacle to the trade taking place, not in the sense of eliminating every risk each horn names: the appropriation horn is closed outright, while the valuation horn is answered by verified provenance and by a bond that bounds what misdescription can be worth to a seller, leaving a residual valuation risk the mechanism prices rather than abolishes (&sect;8).
                </p>
            </PaperSection>

            <PaperSection title="2. A Data Sale Is an Ordinary Bonded Order">
                <p>
                    The mechanism is not a purpose-built data-market contract; it is the same two-mechanism settlement kernel used for any bonded trade, composed with two clauses that name the subject matter as data. Recalling the kernel briefly, because the argument below depends on it: a buyer and seller each lock a bond at commit &mdash; the buyer twice the payment, the seller twice the cumulative value of the process up to and including its own order &mdash; and only the buyer can subsequently trigger resolution, which settles every order in the process atomically or not at all. Under costless performance and perfect monitoring, cooperation is the weakly dominant strategy for both parties and the unique profile surviving iterated elimination of weakly dominated strategies (Myerson, 1979; the derivation is <Link href="/papers/asymmetric-bonding" className="text-ink-heading hover:underline">Asymmetric Bonding and Buyer Dominance</Link>, &sect;4.1, whose &sect;3.1 states what the costless-performance assumption carries): a defecting seller forfeits a bond worth strictly more than the payment it forgoes, and a defecting buyer forfeits its own locked capital with nothing to show for it. There is no timeout, no administrator, and no unilateral exit from the bonded state; the only path back to either party&rsquo;s capital is the buyer&rsquo;s own resolution call.
                </p>
                <p>
                    A data sale composes exactly two clauses onto this same order. The first, <em>data terms</em>, governs whether and how a process&rsquo;s own co-produced records &mdash; the signed agreement, the delivery evidence, the books each side keeps of the trade itself &mdash; may later be disclosed: <em>closed</em> (neither party discloses beyond the parties), <em>each-own</em> (each party may disclose the copy it holds), or <em>open</em> (either party may publish the record). The designer fixes the regime at design time, as a composition choice; the buyer separately commits, at checkout, whether to permit or withhold the content it contributed. Sealed per-order fields &mdash; a delivery address, counterparty-private hand-off content &mdash; sit outside every regime by construction and are never disclosable through this clause, regardless of which of the three is chosen. The second clause, <em>data license</em>, is the term of a specific data sale &mdash; a bonded order whose value-added is access to records, rather than a physical or digital good produced fresh. It names what is licensed (a short editorial description of the dataset, stream, or record family), the permitted purpose, whether access is a one-time <em>snapshot</em> or a continuing <em>stream</em>, whether redistribution is permitted, and, when the licensed content derives from prior settled trade, which settled processes it derives from. No dedicated market contract exists for any of this: the sale is priced, bonded, and settled by the same kernel that settles any other trade, and the two clauses above are what make its subject matter legible as data rather than leaving that to prose.
                </p>
            </PaperSection>

            <PaperSection title="3. Self-Authentication Dissolves the Valuation Horn">
                <p>
                    A signed agreement is a set of clause sections; each section is hashed and merkle-committed, and the resulting root &mdash; the <em>agreement hash</em> &mdash; is exactly what both parties sign and what the kernel anchors on-chain at commit. A section&rsquo;s leaf is
                </p>
                <div className="my-4 overflow-x-auto">
                    <Math display>{"\\text{leaf} = \\mathrm{keccak256}\\big(\\mathrm{keccak256}(\\text{clauseId} \\,\\|\\, \\text{sectionDataHash})\\big)"}</Math>
                </div>
                <p>
                    where <Math>{"\\text{clauseId}"}</Math> identifies the clause and version and <Math>{"\\text{sectionDataHash}"}</Math> is the keccak256 of the section&rsquo;s canonical-JSON content; the double hash domain-separates leaves from internal nodes of the tree (Merkle, 1988), and internal nodes are formed by sorted-pair hashing so the same leaf set always produces the same root regardless of authoring order. A holder of any single disclosed section can produce an inclusion proof &mdash; the sibling hashes on the path to the root &mdash; that any counterparty verifies against the root alone, without needing the rest of the agreement&rsquo;s content.
                </p>
                <p>
                    This is what makes a licensed record self-authenticating. When a data-license section names the settled processes its content derives from, a disclosed leaf travels with an inclusion proof against that named process&rsquo;s own on-chain agreement hash. A recipient does not take the seller&rsquo;s word that a record is a genuine artifact of a real, economically-backed trade; the recipient recomputes the leaf from the disclosed content and checks it against a root the chain itself committed at the moment that trade settled. Provenance is verified the same way for a record produced yesterday or bought third-hand: by recomputing a hash and walking a proof, never by trusting a narrative.
                </p>
                <p>
                    Self-authentication answers the provenance half of the valuation horn &mdash; the record is verifiably real &mdash; but it does not, by itself, price the unseen remainder of a dataset or stream the buyer has not inspected. That is answered by the bond, on the same logic that governs any bonded order (&sect;2): a seller who ships a licensed feed materially different from what the data-license terms describe has defected exactly as a seller who fails to deliver any other bonded good defects, and forfeits the same bond &mdash; sized to twice the cumulative value of the process, which for any order strictly exceeds the payment the seller would otherwise forgo. The bond is a credible hostage in Williamson&rsquo;s (1983) sense, posted against a future performance the buyer cannot yet verify, and it is what lets the buyer price a license from its description and its verified provenance rather than from a first inspection of its full unseen content.
                </p>
            </PaperSection>

            <PaperSection title="4. Atomic Resolution Dissolves the Appropriation Horn">
                <p>
                    The second horn survives self-authentication on its own: nothing about a merkle proof stops a buyer who has received a licensed record from reading it, copying it, and simply declining to pay. What stops it is the shape of resolution itself. Write <Math>{"P"}</Math> for the sale&rsquo;s payment and <Math>{"V \\geq P"}</Math> for the buyer&rsquo;s realized valuation of the delivered content, at whatever point during the process the buyer actually inspects it. The buyer has exactly two available continuations once committed &mdash; there is no third, no escape hatch from the bonded state &mdash; resolve, or withhold indefinitely.
                </p>
                <p>
                    If the buyer resolves: its locked bond of <Math>{"2P"}</Math> returns net of the <Math>{"P"}</Math> transferred to the seller, for a net capital outcome of <Math>{"-P"}</Math>, plus the already-realized <Math>{"V"}</Math>. If the buyer withholds resolution indefinitely: the bond never returns &mdash; there is no timeout, no recovery path, no third party who can release it &mdash; for a net capital outcome of <Math>{"-2P"}</Math>, plus the same already-realized <Math>{"V"}</Math>, since nothing about withholding resolution un-discloses content the buyer has already received over the sealed hand-off channel. The comparison is
                </p>
                <div className="my-4 overflow-x-auto">
                    <Math display>{"V - P \\;>\\; V - 2P \\qquad \\text{for every } P > 0,\\ \\text{independent of } V"}</Math>
                </div>
                <p>
                    so resolving strictly dominates withholding for the buyer regardless of how much value the buyer has already extracted by inspecting the delivered content. This is the sign-flip that Arrow&rsquo;s second horn assumes away: the classical paradox treats payment as a free-standing act a buyer can skip once the informational value is in hand, because in an ordinary sale skipping it costs the buyer nothing. Here, paying and reclaiming one&rsquo;s own locked capital are the same on-chain call; skipping it is not free, it is the single most expensive continuation available, and the buyer performs it not because access to the data is withheld pending payment &mdash; it is not, by construction, since the content already travelled the sealed channel &mdash; but because failing to reclaim one&rsquo;s own bond is a strictly worse outcome than reclaiming it. The dissolution is economic rather than cryptographic: no encryption, watermark, or access gate polices the buyer&rsquo;s use of the data after receipt; the buyer&rsquo;s own arithmetic does.
                </p>
                <PaperRemark title="Why this differs from the ordinary bonded-order argument.">
                    The credibility-of-resolution argument for an ordinary trade turns on the buyer withholding resolution as a rational response to a seller&rsquo;s non-delivery, so that withholding is a threat the seller must avoid triggering. Here the direction is reversed: it is the buyer, having already received the informational value, who might want to withhold to avoid paying. The inequality above shows the reversal changes nothing about which action the buyer prefers &mdash; resolving remains strictly better for the buyer in both directions, because in both cases withholding strands the buyer&rsquo;s own capital rather than the counterparty&rsquo;s.
                </PaperRemark>
            </PaperSection>

            <PaperSection title="5. Disclosure Regimes Are Composition Choices">
                <p>
                    The data-terms clause&rsquo;s three regimes &mdash; closed, each-own, open &mdash; are not settings a platform enforces on a seller&rsquo;s behalf; they are design-time composition choices, and a process instantiated under one regime is a different assembly from the same process instantiated under another, identified by a different composition hash rather than by a version bump on a shared one. Two reference assemblies built from an otherwise identical aerial-survey template &mdash; one composing data terms with disclosure fixed to <em>each-own</em>, the other to <em>open</em> &mdash; anchor as two distinct compositions; adopting one commits a buyer and seller to that regime&rsquo;s terms exactly as adopting a different price or a different delivery window would commit them to those. Within whichever regime the assembly composes, the buyer&rsquo;s own consent over the content it contributed is a further, separate, per-order commitment &mdash; permit or withhold &mdash; signed at checkout rather than inferred from the regime, so a buyer who transacts under an each-own regime still explicitly opts in or out of disclosing its own half. Sealed per-order fields are excluded from all three regimes at the clause boundary, not by a policy exception: a delivery address or a counterparty-private hand-off payload is simply never a candidate for disclosure through this mechanism, whatever regime the surrounding process has chosen.
                </p>
            </PaperSection>

            <PaperSection title="6. Pricing a Snapshot or a Stream">
                <p>
                    The same license clause prices two different products with the same field: a <em>snapshot</em>, a one-time delivery of the records as they stand, verified once by content hash; or a <em>stream</em>, continuing access to a growing record, realized as a further bonded order (or delivery under the same standing agreement) each period. The dominance argument of &sect;4 already governs each individual delivery in a stream on its own, independent of repetition &mdash; every period is its own bonded order, and every period&rsquo;s buyer faces the same <Math>{"V - P"}</Math> versus <Math>{"V - 2P"}</Math> comparison. What repetition adds is a further deterrent neither horn-dissolving argument needs but that strengthens both: a seller who ships a degraded or fabricated period loses not only that period&rsquo;s bond but the buyer&rsquo;s continuation into the next period, and a buyer who is caught misrepresenting its use of a stream under a redistribution-prohibited term loses continued access on the same footing. This is the ordinary logic by which a relationship&rsquo;s continuation value disciplines behavior beyond what a single period&rsquo;s stakes alone would (Klein &amp; Leffler, 1981; Fudenberg &amp; Maskin, 1986), applied to a channel where every period is already separately, contemporaneously bonded rather than merely promised. A snapshot prices a single fact; a stream prices an ongoing relationship whose value to both sides is largest when neither side ever triggers the one-period argument of &sect;4 in anger &mdash; which is why the sustainable data product is the stream rather than the snapshot (Varian, 2000): a snapshot buyer who is deceived has no future recourse but the forfeited bond of that one order, while a stream licensee&rsquo;s continued access is itself the larger stake a seller stands to lose.
                </p>
            </PaperSection>

            <PaperSection title="7. A Worked Instance">
                <p>
                    Two independent bonded processes, executed end to end in the protocol&rsquo;s own development network as an existence proof of the mechanism above &mdash; not a live or publicly deployed market, which does not exist &mdash; illustrate the full cycle. In the first process, a survey operator flies a route for a client under an assembly composing a flight-schedule clause, an operator-credential clause, and data terms fixed to the each-own regime; the client separately commits, at checkout, to permit disclosure of the half of the record it contributed. The order commits, both bonds lock, and the buyer resolves once the flight is complete, releasing payment and settling the process. In the second, independent process, the client &mdash; now the seller of a data product rather than its buyer &mdash; licenses continuing access to the resulting telemetry stream to a counterparty, under an assembly composing a data-license clause (access set to <em>stream</em>, redistribution prohibited, and the first process&rsquo;s settled identifier named as its source) alongside a content-handoff clause whose completion evidence is the keccak256 of the access credential delivered over the sealed channel. Both processes are, to the kernel, entirely separate linear chains of commits against their own cumulative-value accumulators; nothing in the kernel records that the second derives from the first. The link is carried off-chain, in the license clause&rsquo;s own field, and it is checkable rather than assumed: the disclosed license section&rsquo;s inclusion proof verifies against the second process&rsquo;s own committed agreement hash, and the source-process identifier it names resolves to the first process&rsquo;s own settled record, so a party holding only the license can confirm both that the license itself was genuinely agreed and that the stream it describes traces to a real, bonded, already-settled flight &mdash; and, as a negative control, a single altered field in either disclosed section breaks its inclusion proof rather than silently passing.
                </p>
            </PaperSection>

            <PaperSection title="8. Scope and Limits">
                <p>
                    The mechanism bounds three risks; it does not eliminate any of them. First, the bond bounds misrepresentation of the unseen remainder rather than eliminating valuation risk outright: a seller can still ship a licensed feed that is technically consistent with a loosely-worded license description yet disappoints the buyer&rsquo;s expectation, and the buyer&rsquo;s recourse is bounded by the bond&rsquo;s size, not by a guarantee that the bond&rsquo;s size always exceeds the buyer&rsquo;s disappointment. Second, a redistribution-prohibited term creates a timestamped, co-signed record for outer recourse &mdash; co-seller pressure, an arbitration forum, an ordinary court &mdash; it does not, and cannot, prevent a licensee from copying data once received; the chain has no mechanism to un-disclose what has already crossed the sealed channel, and the term&rsquo;s force is entirely in the evidence it leaves for a forum outside the mechanism to act on. Third, what anchors on-chain is a fingerprint: the agreement hash, the section hashes, the inclusion proofs. The content behind those fingerprints &mdash; the dataset itself, the evidence bundle, the books a process leaves behind &mdash; is never on-chain and stays with whichever party produced it, disclosed only by that party&rsquo;s own choice under whichever regime the process composed. What the mechanism guarantees is referential integrity &mdash; that a disclosed record really is the record a named, settled process produced &mdash; not substantive accuracy of that record&rsquo;s content, which the protocol has no way to adjudicate and does not attempt to.
                </p>
            </PaperSection>

            <PaperSection title="9. Conclusion">
                <p>
                    Arrow&rsquo;s paradox has two horns, and the settlement layer described here dissolves each by a different property of the same mechanism rather than by restricting access to the data itself. The valuation horn dissolves because a disclosed record&rsquo;s provenance is self-authenticating against an on-chain fingerprint, and because the seller&rsquo;s bond prices the unseen remainder&rsquo;s conformity to its description without requiring the buyer to inspect it first. The appropriation horn dissolves because resolving a bonded order and reclaiming one&rsquo;s own locked capital are the same act, so a buyer who has already read the data still strictly prefers to pay rather than to strand its own bond forever. Neither dissolution depends on restricting what the buyer can do with data once received; both depend entirely on what each party stands to lose by not completing the trade it already committed to. Disclosure regimes and access modes are composed, not policed, and the same clause that prices a single record prices a continuing one &mdash; where the larger, self-reinforcing stake is exactly what makes the stream, rather than the one-off sale, the form in which honest data production sustains itself.
                </p>
            </PaperSection>
        </PaperLayout>
    );
}
