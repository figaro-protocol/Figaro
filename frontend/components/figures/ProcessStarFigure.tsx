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
const R0 = 80;
const R_STEP = 14;
const NODE_R0 = 8;
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
        const nodeR = NODE_R0 + i * NODE_R_STEP;
        const labelR = r + nodeR + 12;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        return {
            x: CX + r * cos,
            y: CY + r * sin,
            nodeR,
            // The label sits outward along the spoke, clear of the line, and
            // is anchored toward the center so it never crosses its own spoke.
            labelX: CX + labelR * cos,
            labelY: CY + labelR * sin + 4,
            anchor: cos > 0.3 ? "start" : cos < -0.3 ? "end" : "middle",
        } as const;
    });

    return (
        <FigureFrame
            idPrefix={idPrefix}
            className={className}
            svgProps={svgProps}
            viewBox="10 36 340 250"
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
                    <text x={p.labelX} y={p.labelY} textAnchor={p.anchor} fontSize={11} className="fill-ink-muted">
                        seller
                    </text>
                </g>
            ))}
            <circle cx={CX} cy={CY} r={17} className="fill-ink-primary" />
            <text x={CX} y={CY + 3} textAnchor="middle" fontSize={9} className="fill-paper">
                buyer
            </text>
        </FigureFrame>
    );
}
