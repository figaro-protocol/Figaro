import type { BaseFigureProps } from "@/components/figures/BaseFigureProps";
import { FigureFrame } from "@/components/figures/FigureFrame";

export interface DisciplineIntersectionFigureProps extends BaseFigureProps {
    /** One circle per discipline. Pass the live catalogue
     *  (`PAPER_GROUPS.map((g) => g.name)`), never a copied list. */
    labels: string[];
}

const CX = 330;
const CY = 290;
/** Circle centers sit on this ring; RING_R < CIRCLE_R, so every circle
 *  contains the center — the shared region IS the figure's claim. */
const RING_R = 70;
const CIRCLE_R = 130;
const LABEL_R = 210;
const LINE_H = 12;

function wrapLabel(label: string, max = 20): string[] {
    const lines: string[] = [];
    let line = "";
    for (const word of label.split(" ")) {
        const next = line ? `${line} ${word}` : word;
        if (next.length > max && line) {
            lines.push(line);
            line = word;
        } else {
            line = next;
        }
    }
    if (line) lines.push(line);
    return lines;
}

export function DisciplineIntersectionFigure({
    labels,
    idPrefix = "discipline-intersection",
    className,
    svgProps,
}: DisciplineIntersectionFigureProps) {
    return (
        <FigureFrame
            idPrefix={idPrefix}
            className={className}
            svgProps={svgProps}
            viewBox="0 0 660 580"
            frameClassName="w-full max-w-2xl mx-auto"
            title="The disciplines intersecting in one working group"
            desc={
                <>
                    {labels.length} overlapping circles, one per discipline, every
                    circle containing a single shared center region labeled &ldquo;a
                    working group&rdquo; &mdash; a group is people from the
                    disciplines converging on one problem.
                </>
            }
            caption="One shared center: the group lives where every discipline overlaps."
        >
                <circle cx={CX} cy={CY} r={RING_R - 12} className="fill-subtle-hover" />

                {labels.map((label, i) => {
                    const a = (i / labels.length) * 2 * Math.PI - Math.PI / 2;
                    const cos = Math.cos(a);
                    const sin = Math.sin(a);
                    const lines = wrapLabel(label);
                    const lx = CX + cos * LABEL_R;
                    const ly = CY + sin * LABEL_R;
                    const anchor = cos > 0.35 ? "start" : cos < -0.35 ? "end" : "middle";
                    const startY =
                        sin < -0.3
                            ? ly - (lines.length - 1) * LINE_H - 6
                            : sin > 0.3
                              ? ly + LINE_H
                              : ly - ((lines.length - 1) * LINE_H) / 2 + 4;

                    return (
                        <g key={label}>
                            <circle
                                cx={CX + cos * RING_R}
                                cy={CY + sin * RING_R}
                                r={CIRCLE_R}
                                className="fill-none stroke-default"
                                strokeWidth="1"
                            />
                            <text textAnchor={anchor} fontSize="10.5" className="fill-ink-body">
                                {lines.map((line, j) => (
                                    <tspan key={j} x={lx} y={startY + j * LINE_H}>
                                        {line}
                                    </tspan>
                                ))}
                            </text>
                        </g>
                    );
                })}

                <text
                    x={CX}
                    y={CY + 4}
                    textAnchor="middle"
                    fontSize="14"
                    fontWeight="600"
                    className="fill-ink-heading"
                >
                    a working group
                </text>
        </FigureFrame>
    );
}
