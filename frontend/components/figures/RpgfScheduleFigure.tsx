import type { ReactNode } from "react";
import type { BaseFigureProps } from "@/components/figures/BaseFigureProps";
import { FigureFrame } from "@/components/figures/FigureFrame";

interface RpgfScheduleTranche {
    /** How the citing surface names the tranche. */
    label: string;
    /** Number of annual periods in the tranche. */
    periods: number;
    /** Florins budgeted per period in this tranche, in millions. */
    perPeriodMillions: number;
}

export interface RpgfScheduleFigureProps extends BaseFigureProps {
    /** The tranches, in period order. Defaults to the deployed nine-period
     *  schedule; a surface stating a different one passes its own. */
    tranches?: readonly RpgfScheduleTranche[];
    figureTitle?: string;
    figureDesc?: string;
    caption?: ReactNode;
}

/**
 * The deployed RPGF budget schedule: nine annual periods, budgets grouped into
 * three RISING tranches.
 *
 * NUMBERS. Every figure below is the per-period budget list the deployment
 * script hands the minter's constructor — `_rpgfAmounts()` in
 * `script/Deploy.s.sol`: 45M, 45M, 60M, 60M, 60M, 82.5M, 82.5M, 82.5M, 82.5M,
 * summing to the 600M minter cap (the script asserts the sum). The tranche
 * grouping — 15% over years 1–2, 30% over years 3–5, 55% over years 6–9, split
 * equally within each group — is `docs/DESIGNER_REWARDS.md` § "The schedule".
 * Nothing here is a vesting or unlock curve: the founder, supporter, and DAO
 * allocations are minted whole at genesis with no vesting
 * (`docs/FLORIN_TOKEN.md` § Rationale). This is the reserve's per-period BUDGET, minted only
 * as authors claim against a closed period's usage.
 */

const DEPLOYED_TRANCHES: readonly RpgfScheduleTranche[] = [
    { label: "15% over years 1–2", periods: 2, perPeriodMillions: 45 },
    { label: "30% over years 3–5", periods: 3, perPeriodMillions: 60 },
    { label: "55% over years 6–9", periods: 4, perPeriodMillions: 82.5 },
];

const DEFAULT_TITLE = "The nine-period RPGF budget schedule";
const DEFAULT_DESC =
    "Nine annual periods. Each of years one and two budgets 45 million florins, " +
    "each of years three to five budgets 60 million, and each of years six to " +
    "nine budgets 82.5 million — 15 percent of the 600-million reserve over the " +
    "first tranche, 30 percent over the second, and 55 percent over the third, " +
    "split equally within each. The bars rise in three steps. Year one disposes " +
    "of 7.5 percent of the reserve, the smallest slice the schedule ever pays; " +
    "each of the last four disposes of 13.75 percent.";
const DEFAULT_CAPTION = (
    <>
        The nine slices sum to the whole 600M reserve and no more. Budgets rise
        as the evidence thickens, so the largest ones pay on the thickest
        denominators &mdash; and the period in which fabricated score buys the
        largest share is also the period with the least at stake.
    </>
);

const PLOT_X = 46;
const PLOT_W = 330;
const PLOT_TOP = 66;
const PLOT_H = 168;
const BASE_Y = PLOT_TOP + PLOT_H;

export function RpgfScheduleFigure({
    idPrefix = "rpgf-schedule",
    className,
    svgProps,
    tranches = DEPLOYED_TRANCHES,
    figureTitle = DEFAULT_TITLE,
    figureDesc = DEFAULT_DESC,
    caption = DEFAULT_CAPTION,
}: RpgfScheduleFigureProps) {
    const periods = tranches.flatMap((t, ti) =>
        Array.from({ length: t.periods }, () => ({ trancheIndex: ti, millions: t.perPeriodMillions })),
    );
    const total = periods.reduce((s, p) => s + p.millions, 0);
    const maxMillions = Math.max(...periods.map((p) => p.millions));

    const slotW = PLOT_W / periods.length;
    const barW = slotW * 0.62;
    const pxPerMillion = PLOT_H / (maxMillions * 1.12);

    return (
        <FigureFrame
            idPrefix={idPrefix}
            className={className}
            svgProps={svgProps}
            viewBox="0 0 400 336"
            title={figureTitle}
            desc={figureDesc}
            caption={caption}
        >
                <text x="20" y="24" fontSize="12" fontWeight="600" className="fill-ink-heading">
                    Per-period budget, in millions of florins
                </text>
                <text x="20" y="38" fontSize="9" className="fill-ink-muted">
                    Fixed at deployment; no party can accelerate, delay, or resize any of it.
                </text>

                {/* Y axis */}
                <line x1={PLOT_X - 8} y1={PLOT_TOP - 6} x2={PLOT_X - 8} y2={BASE_Y} className="stroke-default" strokeWidth="1" />
                {[0, 30, 60, 90].map((tick) => {
                    const y = BASE_Y - tick * pxPerMillion;
                    return (
                        <g key={tick}>
                            <line x1={PLOT_X - 11} y1={y} x2={PLOT_X + PLOT_W} y2={y} className="stroke-default" strokeWidth="0.4" />
                            <text x={PLOT_X - 14} y={y + 3} fontSize="7.5" textAnchor="end" className="fill-ink-muted">
                                {tick}
                            </text>
                        </g>
                    );
                })}

                {/* Bars */}
                {periods.map((p, i) => {
                    const x = PLOT_X + i * slotW + (slotW - barW) / 2;
                    const h = p.millions * pxPerMillion;
                    return (
                        <g key={`period-${i}`}>
                            <rect
                                x={x}
                                y={BASE_Y - h}
                                width={barW}
                                height={h}
                                className={p.trancheIndex % 2 === 0 ? "fill-ink-heading" : "fill-default-strong"}
                            />
                            <text x={x + barW / 2} y={BASE_Y - h - 5} fontSize="7.5" textAnchor="middle" className="fill-ink-body">
                                {p.millions}
                            </text>
                            <text x={x + barW / 2} y={BASE_Y + 12} fontSize="7.5" textAnchor="middle" className="fill-ink-muted">
                                {i + 1}
                            </text>
                        </g>
                    );
                })}
                <line x1={PLOT_X - 8} y1={BASE_Y} x2={PLOT_X + PLOT_W} y2={BASE_Y} className="stroke-default-strong" strokeWidth="1" />
                <text x={PLOT_X + PLOT_W / 2} y={BASE_Y + 26} fontSize="8.5" textAnchor="middle" className="fill-ink-muted">
                    accrual period (year)
                </text>

                {/* Tranche brackets */}
                {tranches.map((t, ti) => {
                    const startIndex = tranches.slice(0, ti).reduce((s, x) => s + x.periods, 0);
                    const x1 = PLOT_X + startIndex * slotW + 3;
                    const x2 = PLOT_X + (startIndex + t.periods) * slotW - 3;
                    const y = BASE_Y + 34;
                    return (
                        <g key={t.label}>
                            <line x1={x1} y1={y} x2={x2} y2={y} className="stroke-default-strong" strokeWidth="1" />
                            <line x1={x1} y1={y} x2={x1} y2={y - 4} className="stroke-default-strong" strokeWidth="1" />
                            <line x1={x2} y1={y} x2={x2} y2={y - 4} className="stroke-default-strong" strokeWidth="1" />
                            <text x={(x1 + x2) / 2} y={y + 11} fontSize="7.5" textAnchor="middle" className="fill-ink-heading">
                                {t.label}
                            </text>
                        </g>
                    );
                })}

                <text x="20" y="322" fontSize="8.5" className="fill-ink-body">
                    The {periods.length} budgets sum to {total % 1 === 0 ? total : total.toFixed(1)}M &mdash; the reserve exactly, and the cap the token registers for it.
                </text>
        </FigureFrame>
    );
}
