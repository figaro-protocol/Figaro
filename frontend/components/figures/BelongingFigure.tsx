import type { BaseFigureProps } from "@/components/figures/BaseFigureProps";
import { FigureFrame } from "@/components/figures/FigureFrame";

export type BelongingFigureProps = BaseFigureProps;

/**
 * The IDEA of belonging, chosen three ways: three rings, a process, a
 * community, and a token, each drawn by its own members, and one wallet
 * standing where the three it chose overlap. Four words on the drawing. Which
 * process, whose community, and what token are the reader's to pick, and the
 * pages that own them say how.
 */

const CX = 200;
const CY = 158;
const R = 62;
const OFFSET = 38;

export function BelongingFigure({ idPrefix = "belonging", className, svgProps }: BelongingFigureProps) {
    const rings = [
        { cx: CX, cy: CY - OFFSET, label: "process", labelX: CX, labelY: CY - OFFSET - R - 8, anchor: "middle" },
        { cx: CX - OFFSET, cy: CY + OFFSET * 0.6, label: "community", labelX: CX - OFFSET - R - 6, labelY: CY + OFFSET * 0.6 + 4, anchor: "end" },
        { cx: CX + OFFSET, cy: CY + OFFSET * 0.6, label: "token", labelX: CX + OFFSET + R + 6, labelY: CY + OFFSET * 0.6 + 4, anchor: "start" },
    ] as const;

    return (
        <FigureFrame
            idPrefix={idPrefix}
            className={className}
            svgProps={svgProps}
            viewBox="10 36 380 230"
            title="Belonging, chosen three ways: a process, a community, a token, and you where they overlap"
            desc="Three overlapping rings, one for a process, one for a community, one for a token. One wallet, labelled you, stands in the small region where all three overlap."
        >
            {rings.map((r) => (
                <g key={r.label}>
                    <circle cx={r.cx} cy={r.cy} r={R} strokeWidth={1.5} className="fill-paper stroke-ink-primary" fillOpacity={0.5} />
                    <text x={r.labelX} y={r.labelY} textAnchor={r.anchor} fontSize={11} className="fill-ink-muted">
                        {r.label}
                    </text>
                </g>
            ))}
            <circle cx={CX} cy={CY + 4} r={13} className="fill-ink-primary" />
            <text x={CX} y={CY + 7} textAnchor="middle" fontSize={9} className="fill-paper">
                you
            </text>
        </FigureFrame>
    );
}
