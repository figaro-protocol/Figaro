import type { BaseFigureProps } from "@/components/figures/BaseFigureProps";
import { FigureFrame } from "@/components/figures/FigureFrame";

export interface ProcessStarFigureProps extends BaseFigureProps {
    /** How many sellers the star shows; the idea, never a worked example. */
    sellers?: number;
}

/**
 * The IDEA of a process, with none of its details: one buyer at the center,
 * every order a spoke from that buyer to one seller (the kernel's own shape —
 * every order in a process runs to the same root buyer, and no edge joins one
 * seller to another). The sellers sit on one turn of a spiral, each a little
 * farther out than the one before it: the value a process accumulates through
 * its orders, and nothing more. Two words on the drawing. The arithmetic
 * belongs to `ProcessTopologyFigure` and `StackedBondChainFigure`.
 */

const CX = 200;
const CY = 150;
const R0 = 62;
const R_STEP = 14;
const NODE_R0 = 7;
const NODE_R_STEP = 1.5;

export function ProcessStarFigure({
    idPrefix = "process-star",
    className,
    svgProps,
    sellers = 5,
}: ProcessStarFigureProps) {
    const points = Array.from({ length: sellers }, (_, i) => {
        const angle = -Math.PI / 2 + (i * 2 * Math.PI) / sellers;
        const r = R0 + i * R_STEP;
        return {
            x: CX + r * Math.cos(angle),
            y: CY + r * Math.sin(angle),
            nodeR: NODE_R0 + i * NODE_R_STEP,
        };
    });

    return (
        <FigureFrame
            idPrefix={idPrefix}
            className={className}
            svgProps={svgProps}
            viewBox="0 0 400 300"
            title="A process: one buyer, every seller on its own spoke"
            desc={`One buyer at the center and ${sellers} sellers around it, each joined to the buyer by one line and none to each other; each seller sits a little farther out than the one before it.`}
        >
            {points.map((p, i) => (
                <line
                    key={`spoke-${i}`}
                    x1={CX}
                    y1={CY}
                    x2={p.x}
                    y2={p.y}
                    strokeWidth={1.5}
                    className="stroke-ink-muted"
                />
            ))}
            {points.map((p, i) => (
                <g key={`seller-${i}`}>
                    <circle cx={p.x} cy={p.y} r={p.nodeR} className="fill-paper stroke-ink-primary" strokeWidth={1.5} />
                    <text
                        x={p.x}
                        y={p.y + p.nodeR + 13}
                        textAnchor="middle"
                        fontSize={11}
                        className="fill-ink-muted"
                    >
                        seller
                    </text>
                </g>
            ))}
            <circle cx={CX} cy={CY} r={14} className="fill-ink-primary" />
            <text x={CX} y={CY + 30} textAnchor="middle" fontSize={11} className="fill-ink-heading">
                buyer
            </text>
        </FigureFrame>
    );
}
