import { cn } from "@/lib/shared/utils";
import type { BaseFigureProps } from "@/components/figures/BaseFigureProps";

export type MarketFormationSwimlaneFigureProps = BaseFigureProps;

/**
 * Who acts, in what order, when a buyer forms an offer by racing the market —
 * and where the settlement layer enters, which is once, at the end.
 *
 * TWO LANES ABOVE, ONE BAND BELOW is the whole point of the shape: formation
 * is entirely a two-party exchange of an UNSIGNED, then SINGLY-SIGNED, then
 * DUAL-SIGNED commitment artifact, and only the third state crosses into
 * settlement. Drawing the settlement layer as a third lane would imply it
 * observes the earlier steps; it does not.
 *
 * STEP SEMANTICS verified against `sdk/src/agent/dispatchRace.ts`:
 *  - Step 1: drafts carry NO signatures (`validateDraft` rejects a payload
 *    with either `buyerSig` or `sellerSig`), one per candidate, each naming
 *    that candidate as `seller`; the bond the commitment will require is the
 *    struct's own `expectedCumulativeValue`, doubled by the kernel at commit.
 *  - Step 2 (race leg): `counterSignDraft` — the candidate signs the drafted
 *    struct unchanged; it refuses a payload carrying `quoteRequest`.
 *  - Step 3 (quote leg): `quoteDraft` — the candidate re-prices through
 *    `substitutePricedValue`/`buildCounterDraft` and declines any figure above
 *    the request's ceiling (`q > draft.commitment.payment`) or below the
 *    payment floor (`q < 1n`); it refuses a payload with no `quoteRequest`.
 *  - Step 4: `verifyRaceReply` = struct-hash equality against the buyer's own
 *    draft; `verifyQuoteReply` = reconstruction (`buildCounterDraft` at the
 *    quoted figure) plus the same equality. Both then recover the signature
 *    against the buyer's copy, never the reply's echoed fields.
 *  - Step 5: `startRace`'s `finish()` — cheapest verified reply by default
 *    (`selectRaceWinner`), any candidate address on an explicit pick. The
 *    buyer's ONE signature follows; the drafts never carried one.
 *  - Band: `FigaroCore.commit` verifies both signatures against one digest
 *    with no ordering, then pulls 2× from each side.
 *  - Footer: losing answers need no cancellation — `commit` reverts past
 *    `c.deadline`, and the buyer fixes one deadline for the whole race.
 *
 * VOCABULARY (load-bearing). The rendered strings name no contract, function,
 * package, or file: no paper in the corpus does. Source identifiers belong
 * here in the comment, not on the page.
 */

interface Row {
    lane: "buyer" | "candidates";
    /** Rendered step ordinal. Steps 2 and 3 are alternatives, so they share
     *  the brace rather than the sequence. */
    n: string;
    title: string;
    /** SVG does not wrap text — the break points are authored here. */
    lines: readonly string[];
    /** Part of the either/or pair braced in the candidates lane. */
    leg?: boolean;
}

const ROWS: readonly Row[] = [
    {
        lane: "buyer",
        n: "1",
        title: "Draft",
        lines: [
            "One unsigned struct per candidate, each naming",
            "that candidate and stating the value the chain",
            "has accumulated through its link — so a candidate",
            "knows the balance it must hold before it answers.",
        ],
    },
    {
        lane: "candidates",
        n: "2",
        title: "Answer — race leg",
        leg: true,
        lines: [
            "Countersign the draft as it stands: available at",
            "the price the catalogue already posted.",
        ],
    },
    {
        lane: "candidates",
        n: "3",
        title: "Answer — quote leg",
        leg: true,
        lines: [
            "Return the draft re-priced at your own figure, at",
            "or below the ceiling the buyer drafted at.",
        ],
    },
    {
        lane: "buyer",
        n: "4",
        title: "Verify",
        lines: [
            "Race: the answer must be the drafted struct, hash",
            "for hash. Quote: rebuild at the quoted figure and",
            "require the same equality — never a difference.",
        ],
    },
    {
        lane: "buyer",
        n: "5",
        title: "Select, and sign once",
        lines: [
            "Cheapest verified answer by default; any answer",
            "at the buyer's discretion. The single signature is",
            "the selection and the commitment in one act.",
        ],
    },
];

const LANE_A_X = 14;
const LANE_B_X = 204;
const LANE_W = 182;
const laneX = (lane: Row["lane"]) => (lane === "buyer" ? LANE_A_X : LANE_B_X);

const LANES_TOP = 42;
const ROW_GAP = 12;
const rowHeight = (r: Row) => 18 + r.lines.length * 10.5 + 8;

export function MarketFormationSwimlaneFigure({
    idPrefix = "market-formation-swimlane",
    className,
    svgProps,
}: MarketFormationSwimlaneFigureProps) {
    const titleId = `${idPrefix}-title`;
    const descId = `${idPrefix}-desc`;

    // Row tops, stacked in order with a uniform gap.
    const tops: number[] = [];
    let cursor = LANES_TOP + 12;
    for (const r of ROWS) {
        tops.push(cursor);
        cursor += rowHeight(r) + ROW_GAP;
    }
    const lanesBottom = cursor - ROW_GAP + 10;
    const bandY = lanesBottom + 30;
    const bandH = 66;
    const footerY = bandY + bandH + 20;
    const viewHeight = footerY + 26;

    const legRows = ROWS.map((r, i) => ({ r, i })).filter(({ r }) => r.leg);
    const braceTop = tops[legRows[0].i] - 4;
    const braceBottom = tops[legRows[legRows.length - 1].i] + rowHeight(legRows[legRows.length - 1].r) + 4;

    /** An elbow from the bottom of one row's box to the top of the next. */
    const connector = (fromX: number, fromY: number, toX: number, toY: number) => {
        const mid = (fromY + toY) / 2;
        return `M ${fromX} ${fromY} V ${mid} H ${toX} V ${toY}`;
    };

    return (
        <figure className={cn("w-full max-w-2xl mx-auto", className)}>
            <svg
                viewBox={`0 0 400 ${viewHeight}`}
                role="img"
                aria-labelledby={`${titleId} ${descId}`}
                className="w-full h-auto"
                style={{ maxWidth: "100%" }}
                {...svgProps}
            >
                <title id={titleId}>
                    Offer formation by dispatch race and by request for quotes, and where
                    settlement enters
                </title>
                <desc id={descId}>
                    Two lanes above a band. The left lane is the buyer, the right lane the
                    candidate sellers, and the band beneath both is the settlement layer.
                    Step one, in the buyer&apos;s lane: the buyer builds one unsigned
                    commitment struct per candidate, each naming that candidate and stating
                    the value the chain has accumulated through its link, so a candidate
                    knows the balance the commitment will require of it before it answers.
                    Step two or step three, in the candidates&apos; lane and never both: on
                    the race leg a candidate countersigns the draft exactly as it stands,
                    which answers availability at the price its catalogue already posted; on
                    the quote leg it returns the draft re-priced at its own figure, at or
                    below the ceiling the buyer drafted at. Step four, back in the
                    buyer&apos;s lane: the buyer verifies — on the race leg the answer must
                    be the drafted struct hash for hash, and on the quote leg the buyer
                    rebuilds its own draft at the quoted figure and requires the same
                    equality, so a quote can move the price and nothing else. Step five,
                    still the buyer&apos;s: the cheapest verified answer wins by default and
                    any answer may be taken at the buyer&apos;s discretion, and the single
                    signature the buyer then produces is at once the selection and the
                    commitment. Only after that does anything reach the settlement band,
                    where two signatures over one struct admit the commitment and the bonds
                    are pulled from both sides. The settlement layer observes none of the
                    earlier steps; it receives one artifact and cannot tell whether the
                    seller was raced for, quoted against, or chosen by hand. Answers not
                    taken need no cancellation: the buyer fixes one deadline inside every
                    draft, and the settlement layer refuses a commitment past it, so losing
                    answers expire inert at no cost and leave no record.
                </desc>

                <defs>
                    <marker
                        id={`${idPrefix}-arrow`}
                        viewBox="0 0 10 10"
                        refX="8"
                        refY="5"
                        markerWidth="6"
                        markerHeight="6"
                        orient="auto-start-reverse"
                    >
                        <path d="M0,0 L10,5 L0,10 z" className="fill-ink-muted" />
                    </marker>
                </defs>

                {/* Lane headings */}
                <text x={LANE_A_X} y="20" fontSize="11" fontWeight="600" className="fill-ink-heading">
                    Buyer
                </text>
                <text x={LANE_A_X} y="33" fontSize="8" className="fill-ink-muted">
                    holds one signature back until the end
                </text>
                <text x={LANE_B_X} y="20" fontSize="11" fontWeight="600" className="fill-ink-heading">
                    Candidates 1&hellip;k
                </text>
                <text x={LANE_B_X} y="33" fontSize="8" className="fill-ink-muted">
                    answer independently; none sees another
                </text>
                <line
                    x1={LANE_A_X}
                    y1={LANES_TOP}
                    x2="386"
                    y2={LANES_TOP}
                    className="stroke-default-strong"
                    strokeWidth="1"
                />

                {/* Lane spines */}
                <line
                    x1={LANE_B_X - 10}
                    y1={LANES_TOP}
                    x2={LANE_B_X - 10}
                    y2={lanesBottom}
                    strokeDasharray="3 4"
                    className="stroke-default"
                    strokeWidth="1"
                />

                {/* The either/or brace over the two answer legs */}
                <path
                    d={`M ${LANE_B_X - 5} ${braceTop} H ${LANE_B_X - 3} V ${braceBottom} H ${LANE_B_X - 5}`}
                    fill="none"
                    className="stroke-ink-muted"
                    strokeWidth="1"
                />
                <text
                    x={LANE_B_X - 8}
                    y={(braceTop + braceBottom) / 2}
                    fontSize="7.5"
                    textAnchor="middle"
                    className="fill-ink-muted"
                    transform={`rotate(-90 ${LANE_B_X - 8} ${(braceTop + braceBottom) / 2})`}
                >
                    one leg or the other
                </text>

                {/* Connectors, drawn under the boxes */}
                {ROWS.map((r, i) => {
                    if (i === ROWS.length - 1) return null;
                    const next = ROWS[i + 1];
                    // The two answer legs are alternatives: the draft fans into both,
                    // and both return to verification.
                    if (r.leg && next.leg) return null;
                    const fromX = laneX(r.lane) + 20;
                    const toX = laneX(next.lane) + 20;
                    const fromY = tops[i] + rowHeight(r);
                    const toY = tops[i + 1] - 2;
                    return (
                        <path
                            key={`c-${r.n}`}
                            d={connector(fromX, fromY, toX, toY)}
                            fill="none"
                            className="stroke-ink-muted"
                            strokeWidth="1"
                            markerEnd={`url(#${idPrefix}-arrow)`}
                        />
                    );
                })}
                {/* The draft fans to the second leg as well, and the second leg returns. */}
                <path
                    d={connector(LANE_A_X + 20, tops[0] + rowHeight(ROWS[0]), LANE_B_X + 20, tops[2] - 2)}
                    fill="none"
                    strokeDasharray="3 3"
                    className="stroke-ink-muted"
                    strokeWidth="1"
                    markerEnd={`url(#${idPrefix}-arrow)`}
                />
                <path
                    d={connector(LANE_B_X + 20, tops[2] + rowHeight(ROWS[2]), LANE_A_X + 20, tops[3] - 2)}
                    fill="none"
                    strokeDasharray="3 3"
                    className="stroke-ink-muted"
                    strokeWidth="1"
                    markerEnd={`url(#${idPrefix}-arrow)`}
                />

                {/* Rows */}
                {ROWS.map((r, i) => {
                    const x = laneX(r.lane);
                    const y = tops[i];
                    return (
                        <g key={r.n}>
                            <rect
                                x={x}
                                y={y}
                                width={LANE_W}
                                height={rowHeight(r)}
                                rx="6"
                                className="fill-paper stroke-default"
                                strokeWidth="0.75"
                            />
                            <circle cx={x + 14} cy={y + 14} r="7" className="fill-ink-heading" />
                            <text
                                x={x + 14}
                                y={y + 17}
                                fontSize="8"
                                fontWeight="700"
                                textAnchor="middle"
                                className="fill-paper"
                            >
                                {r.n}
                            </text>
                            <text x={x + 27} y={y + 17} fontSize="9.5" fontWeight="600" className="fill-ink-heading">
                                {r.title}
                            </text>
                            {r.lines.map((line, j) => (
                                <text
                                    key={line}
                                    x={x + 9}
                                    y={y + 30 + j * 10.5}
                                    fontSize="8"
                                    className="fill-ink-body"
                                >
                                    {line}
                                </text>
                            ))}
                        </g>
                    );
                })}

                {/* The one artifact that crosses */}
                <line
                    x1={LANE_A_X}
                    y1={bandY - 14}
                    x2="386"
                    y2={bandY - 14}
                    className="stroke-ink-primary"
                    strokeWidth="1.75"
                />
                <text x={LANE_A_X} y={bandY - 19} fontSize="8" fontWeight="600" className="fill-ink-primary">
                    nothing above this line is on chain
                </text>
                <path
                    d={connector(LANE_A_X + 34, tops[4] + rowHeight(ROWS[4]), LANE_A_X + 34, bandY - 2)}
                    fill="none"
                    className="stroke-ink-primary"
                    strokeWidth="1.25"
                    markerEnd={`url(#${idPrefix}-arrow)`}
                />

                <rect
                    x={LANE_A_X}
                    y={bandY}
                    width={386 - LANE_A_X}
                    height={bandH}
                    rx="8"
                    className="fill-subtle stroke-default-strong"
                    strokeWidth="0.75"
                />
                <text x={LANE_A_X + 12} y={bandY + 18} fontSize="10" fontWeight="600" className="fill-ink-heading">
                    Settlement layer &mdash; market-blind
                </text>
                <text x={LANE_A_X + 12} y={bandY + 32} fontSize="8" className="fill-ink-body">
                    Two signatures over one struct admit the commitment; the bonds pull from both
                </text>
                <text x={LANE_A_X + 12} y={bandY + 42.5} fontSize="8" className="fill-ink-body">
                    sides. Nothing in the artifact says how the seller was found, so a raced offer,
                </text>
                <text x={LANE_A_X + 12} y={bandY + 53} fontSize="8" className="fill-ink-body">
                    a quoted one, and one arranged by hand are the same object here.
                </text>

                <text x={LANE_A_X} y={footerY} fontSize="8" fontStyle="italic" className="fill-ink-muted">
                    One deadline, fixed by the buyer inside every draft: answers not taken expire
                </text>
                <text x={LANE_A_X} y={footerY + 11} fontSize="8" fontStyle="italic" className="fill-ink-muted">
                    inert. The market has no cancel operation because it needs none.
                </text>
            </svg>
            <figcaption className="mt-3 text-center text-sm text-ink-muted">
                Reversing the signing order is the whole mechanism: drafts bind nobody, an
                answer binds only its author, and the buyer&rsquo;s one signature is at once
                the selection and the commitment &mdash; so no venue is needed to hold state
                between the two.
            </figcaption>
        </figure>
    );
}
