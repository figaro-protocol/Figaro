import { cn } from "@/lib/shared/utils";
import type { ReactNode } from "react";
import type { BaseFigureProps } from "@/components/figures/BaseFigureProps";

/** A settlement transaction actually measured on a public chain. */
interface GasReceipt {
    /** Gas used by the whole transaction. */
    gasUsed: number;
    /** Net positions it carried — the divisor. */
    positions: number;
    /** What the transaction carried, in a few words. */
    note: string;
}

export interface GasCrossoverFigureProps extends BaseFigureProps {
    /** The direct path's all-in per-order gas: one commit plus its share of a
     *  resolve. Drawn as the flat line, because it does not amortize. */
    directPerOrder?: number;
    /** The batch path's FIXED cost per batch — proof verification, paid once
     *  however many positions ride on it. */
    batchFixed?: number;
    /** The batch path's marginal cost per net position. */
    batchMarginal?: number;
    /** The per-order term of `resolveProcess` — the part of `directPerOrder`
     *  that is not the commit. */
    resolvePerOrder?: number;
    /** `resolveProcess`'s one-time overhead, which the per-order direct line
     *  excludes. Named on the figure so the exclusion is visible. */
    resolveFixedOverhead?: number;
    /** Measured receipts, plotted at their own position count. */
    receipts?: readonly GasReceipt[];
    /** Right edge of the x axis, in net positions. */
    maxPositions?: number;
    figureTitle?: string;
    figureDesc?: string;
    caption?: ReactNode;
}

/**
 * Where the batch path passes under the direct path, and why a small batch
 * does not.
 *
 * NUMBERS (all four verified, none invented):
 *  - `directPerOrder` 167,000 = the ~144k sub-order `commit` marginal plus the
 *    ~23k per-order term of `resolveProcess`. Both constants are
 *    `sdk/src/gasCeilings.ts` (`COMMIT_GAS_PER_ORDER`, `RESOLVE_GAS_PER_ORDER`),
 *    measured on Anvil receipts by `test/kernel/GasCeilingTest.t.sol` and
 *    lint-pinned across the two. `resolveProcess` also carries a one-time
 *    `RESOLVE_FIXED_OVERHEAD` of 38,000 that this per-order line excludes —
 *    stated on the figure rather than buried, since excluding it FAVOURS the
 *    direct path and so cannot flatter the crossover.
 *  - `batchMarginal` 26,500 = ~2k/position hash verification + ~24k/position
 *    for the net token transfer (/spec § "What the proof costs to verify on
 *    chain", from `docs/SCALING_STRATEGY.md` § Gas Economics).
 *  - `batchFixed` 332,902 = the measured 385,902-gas settlement minus its two
 *    positions' marginal — i.e. what /spec means by "~333k of that transaction
 *    was fixed proof verification".
 *  - The two receipts are the Sepolia settlements /spec tabulates:
 *    385,902 gas (commit + witness attestation) and 377,885 gas (resolve +
 *    RPGF usage claim), 2 net positions each.
 *
 * The crossover is DERIVED from those, never restated:
 * `batchFixed / (directPerOrder - batchMarginal)` = 332,902 / 140,500 ≈ 2.37,
 * which is why /spec puts the line at the third net position — the first
 * integer past it.
 */

const SPEC_DIRECT_PER_ORDER = 167_000;
const SPEC_BATCH_FIXED = 332_902;
const SPEC_BATCH_MARGINAL = 26_500;
const SPEC_RESOLVE_PER_ORDER = 23_000;
const SPEC_RESOLVE_FIXED_OVERHEAD = 38_000;
const SPEC_RECEIPTS: readonly GasReceipt[] = [
    { gasUsed: 385_902, positions: 2, note: "commit + witness attestation" },
    { gasUsed: 377_885, positions: 2, note: "resolve + RPGF usage claim" },
];
const SPEC_TITLE =
    "Gas per unit settled against batch size — per order on the direct path, per net position on the batch path";
const SPEC_DESC =
    "A line chart of gas per unit settled — per order on the direct path, per " +
    "net position on the batch path — against the number of net positions in a " +
    "batch. The direct path is a flat line at about 167,000 gas per order — a " +
    "commit plus its share of a resolve — because it never amortizes. The " +
    "batch path is a falling curve: about 333,000 gas of fixed proof " +
    "verification divided by the number of positions, plus about 26,500 per " +
    "position. The two measured settlements on the public record's chain sit at " +
    "two positions each, around 190,000 gas per position — above the direct " +
    "path. The curves cross at about 2.4 net positions, so the third net " +
    "position is the first one at which the batch path is cheaper.";
const SPEC_CAPTION = (
    <>
        The batch path is an amortization, not a discount: the fixed proof
        verification is the same ~300k whether two positions carry it or a
        thousand do.
    </>
);

const PLOT_X = 54;
const PLOT_W = 322;
const PLOT_TOP = 62;
const PLOT_H = 176;
const BASE_Y = PLOT_TOP + PLOT_H;
const Y_MAX = 400_000;
const Y_TICKS = [0, 200_000, 400_000];

/** Thousands, to the nearest 0.5k below 100k and the nearest 1k above — so the
 *  26.5k marginal stays 26.5k rather than rounding into a different claim. */
const fmt = (gas: number) =>
    gas >= 100_000 ? `${Math.round(gas / 1000)}k` : `${Math.round(gas / 500) / 2}k`;

/** The first WHOLE position at which the batch path is strictly cheaper. At a
 *  crossing of exactly N the two paths cost the same, so the answer is N+1
 *  either way — which is how a crossing at 2.4 makes the third position the
 *  first cheaper one, the integer /spec's prose quotes. */
const firstCheaperPosition = (crossing: number) => Math.floor(crossing) + 1;

/** SVG cannot measure text, so a label that must be kept on the plate is sized
 *  from its own character count. 0.55em per character at the 7.5 font size the
 *  crossing label uses — deliberately over-wide, since the cost of guessing
 *  high is a few units of slack and the cost of guessing low is a clipped
 *  claim. */
const widestOf = (lines: readonly string[]) => Math.max(0, ...lines.map((l) => l.length * 7.5 * 0.55));

const ordinal = (n: number) => {
    const teens = n % 100;
    if (teens >= 11 && teens <= 13) return `${n}th`;
    switch (n % 10) {
        case 1:
            return `${n}st`;
        case 2:
            return `${n}nd`;
        case 3:
            return `${n}rd`;
        default:
            return `${n}th`;
    }
};

export function GasCrossoverFigure({
    idPrefix = "gas-crossover",
    className,
    svgProps,
    directPerOrder = SPEC_DIRECT_PER_ORDER,
    batchFixed = SPEC_BATCH_FIXED,
    batchMarginal = SPEC_BATCH_MARGINAL,
    resolvePerOrder = SPEC_RESOLVE_PER_ORDER,
    resolveFixedOverhead = SPEC_RESOLVE_FIXED_OVERHEAD,
    receipts = SPEC_RECEIPTS,
    maxPositions = 8,
    figureTitle = SPEC_TITLE,
    figureDesc = SPEC_DESC,
    caption = SPEC_CAPTION,
}: GasCrossoverFigureProps) {
    const titleId = `${idPrefix}-title`;
    const descId = `${idPrefix}-desc`;

    const xOf = (n: number) => PLOT_X + ((n - 1) / (maxPositions - 1)) * PLOT_W;
    const yOf = (gas: number) => BASE_Y - Math.min(gas, Y_MAX) * (PLOT_H / Y_MAX);

    // Per-position cost of a batch of n: the fixed proof verification divided
    // across the batch, plus each position's own marginal.
    const batchAt = (n: number) => batchFixed / n + batchMarginal;

    // Sampled finely enough that the knee near n = 1 reads as a curve.
    const samples = Array.from({ length: (maxPositions - 1) * 8 + 1 }, (_, i) => 1 + i / 8);
    const batchPath = samples
        .map((n, i) => `${i === 0 ? "M" : "L"}${xOf(n).toFixed(2)},${yOf(batchAt(n)).toFixed(2)}`)
        .join(" ");

    // No crossing exists when a position costs at least as much on the batch
    // path as a whole order does on the direct path.
    const crossover = batchMarginal < directPerOrder ? batchFixed / (directPerOrder - batchMarginal) : undefined;
    const crossoverInRange = crossover !== undefined && crossover >= 1 && crossover <= maxPositions;
    // Two lines, then clamped: the crossing moves with the inputs, and a
    // single line long enough to say what it means fits neither anchor once
    // the crossing sits mid-plate.
    const crossoverLines =
        crossover === undefined
            ? []
            : [`crossover ≈ ${crossover.toFixed(1)}`, `the ${ordinal(firstCheaperPosition(crossover))} position is the first cheaper`];
    const crossoverLabelX =
        crossover === undefined
            ? 0
            : Math.min(xOf(crossover) + 6, PLOT_X + PLOT_W - widestOf(crossoverLines));

    return (
        <figure className={cn("w-full max-w-xl mx-auto", className)}>
            <svg
                viewBox="0 0 400 336"
                role="img"
                aria-labelledby={`${titleId} ${descId}`}
                className="w-full h-auto"
                style={{ maxWidth: "100%" }}
                {...svgProps}
            >
                <title id={titleId}>{figureTitle}</title>
                <desc id={descId}>{figureDesc}</desc>

                <text x="18" y="22" fontSize="11" fontWeight="600" className="fill-ink-heading">
                    Gas per unit settled, by batch size
                </text>
                <text x="18" y="35" fontSize="8" className="fill-ink-muted">
                    Per order on the direct path; per net position on the batch path.
                </text>
                <text x="18" y="45" fontSize="8" className="fill-ink-muted">
                    Direct is flat &mdash; it never amortizes. Batch divides one fixed proof cost.
                </text>

                {/* ── Axes: two gridlines and a baseline, nothing more ── */}
                {Y_TICKS.map((tick) => (
                    <g key={tick}>
                        {tick > 0 && (
                            <line
                                x1={PLOT_X}
                                y1={yOf(tick)}
                                x2={PLOT_X + PLOT_W}
                                y2={yOf(tick)}
                                className="stroke-default"
                                strokeWidth="0.5"
                            />
                        )}
                        <text x={PLOT_X - 8} y={yOf(tick) + 3} fontSize="7.5" textAnchor="end" className="fill-ink-muted">
                            {tick === 0 ? "0" : fmt(tick)}
                        </text>
                    </g>
                ))}
                <line x1={PLOT_X} y1={PLOT_TOP - 8} x2={PLOT_X} y2={BASE_Y} className="stroke-default" strokeWidth="1" />
                <line x1={PLOT_X} y1={BASE_Y} x2={PLOT_X + PLOT_W} y2={BASE_Y} className="stroke-default-strong" strokeWidth="1" />

                {[1, 2, 4, 6, 8]
                    .filter((n) => n <= maxPositions)
                    .map((n) => (
                        <text key={n} x={xOf(n)} y={BASE_Y + 12} fontSize="7.5" textAnchor="middle" className="fill-ink-muted">
                            {n}
                        </text>
                    ))}
                <text x={PLOT_X + PLOT_W / 2} y={BASE_Y + 26} fontSize="8.5" textAnchor="middle" className="fill-ink-muted">
                    net positions in the batch
                </text>

                {/* ── The batch curve: stroke-ink-heading, dashed ─────── */}
                <path d={batchPath} fill="none" className="stroke-ink-heading" strokeWidth="1.75" strokeDasharray="5 3" />

                {/* ── The direct line: stroke-ink-primary, solid, flat ── */}
                <line
                    x1={PLOT_X}
                    y1={yOf(directPerOrder)}
                    x2={PLOT_X + PLOT_W}
                    y2={yOf(directPerOrder)}
                    className="stroke-ink-primary"
                    strokeWidth="1.75"
                />
                <text x={PLOT_X + PLOT_W} y={yOf(directPerOrder) - 6} fontSize="8" textAnchor="end" className="fill-ink-primary">
                    direct path &mdash; {fmt(directPerOrder)} per order
                </text>
                <text x={PLOT_X + PLOT_W} y={yOf(batchAt(maxPositions)) - 8} fontSize="8" textAnchor="end" className="fill-ink-heading">
                    batch path &mdash; {fmt(batchFixed)} fixed &divide; positions, + {fmt(batchMarginal)} each
                </text>

                {/* ── The two measured settlements ────────────────────── */}
                {receipts.map((receipt) => (
                    <circle
                        key={receipt.gasUsed}
                        cx={xOf(receipt.positions)}
                        cy={yOf(receipt.gasUsed / receipt.positions)}
                        r="3.25"
                        className="fill-ink-heading"
                    />
                ))}
                {receipts.length > 0 && (
                    <>
                        <line
                            x1={xOf(receipts[0].positions) + 6}
                            y1={yOf(receipts[0].gasUsed / receipts[0].positions)}
                            x2={xOf(receipts[0].positions) + 34}
                            y2={PLOT_TOP + 4}
                            className="stroke-ink-faint"
                            strokeWidth="1"
                        />
                        <text x={xOf(receipts[0].positions) + 38} y={PLOT_TOP + 2} fontSize="7.5" fontWeight="600" className="fill-ink-heading">
                            measured on chain
                        </text>
                        {receipts.map((receipt, i) => (
                            <text
                                key={receipt.gasUsed}
                                x={xOf(receipts[0].positions) + 38}
                                y={PLOT_TOP + 12 + i * 9.5}
                                fontSize="7"
                                className="fill-ink-body"
                            >
                                {receipt.gasUsed.toLocaleString("en-US")} gas &divide; {receipt.positions} &mdash; {receipt.note}
                            </text>
                        ))}
                    </>
                )}

                {/* ── The crossing ────────────────────────────────────── */}
                {crossoverInRange && crossover !== undefined && (
                    <>
                        <line
                            x1={xOf(crossover)}
                            y1={yOf(directPerOrder)}
                            x2={xOf(crossover)}
                            y2={BASE_Y}
                            className="stroke-ink-faint"
                            strokeWidth="1"
                            strokeDasharray="3 3"
                        />
                        <circle cx={xOf(crossover)} cy={yOf(directPerOrder)} r="3.25" className="fill-paper stroke-ink-primary" strokeWidth="1.5" />
                        {crossoverLines.map((line, i) => (
                            <text
                                key={line}
                                x={crossoverLabelX}
                                y={BASE_Y - 18 + i * 10}
                                fontSize="7.5"
                                fontWeight={i === 0 ? "600" : undefined}
                                className={i === 0 ? "fill-ink-primary" : "fill-ink-body"}
                            >
                                {line}
                            </text>
                        ))}
                    </>
                )}

                {/* ── What the line excludes, stated rather than buried ── */}
                <line x1="18" y1="282" x2="382" y2="282" className="stroke-default" strokeWidth="1" />
                <text x="18" y="295" fontSize="7.5" className="fill-ink-body">
                    Direct = {fmt(directPerOrder - resolvePerOrder)} sub-order commit + {fmt(resolvePerOrder)} per-order resolve. It excludes the resolve
                </text>
                <text x="18" y="305" fontSize="7.5" className="fill-ink-body">
                    call&apos;s one-time {fmt(resolveFixedOverhead)} &mdash; an exclusion that favours the direct path.
                </text>
                <text x="18" y="315" fontSize="7.5" className="fill-ink-body">
                    Positions, not orders: netting collapses many orders into few positions.
                </text>
                <text x="18" y="328" fontSize="7" fontStyle="italic" className="fill-ink-muted">
                    Per-order constants: sdk/src/gasCeilings.ts, measured on receipts by GasCeilingTest.t.sol.
                </text>
            </svg>
            <figcaption className="mt-3 text-center text-sm text-ink-muted">{caption}</figcaption>
        </figure>
    );
}
