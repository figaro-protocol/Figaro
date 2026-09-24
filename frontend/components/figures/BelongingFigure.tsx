import type { BaseFigureProps } from "@/components/figures/BaseFigureProps";
import { FigureFrame } from "@/components/figures/FigureFrame";

export interface BelongingFigureProps extends BaseFigureProps {
    /** The kinds of token community drawn; the last is always the open one. */
    kinds?: readonly string[];
}

/**
 * The IDEA of belonging: a wallet is defined by the token communities it
 * holds, and it holds many at once. One ring per kind of token, every ring
 * passing through the one wallet at the center, so the wallet is the
 * intersection of all of them; the last ring is open, for the kinds that do
 * not exist yet. Labels name kinds, never tokens. Which tokens are the
 * reader's to pick, and the pages that own them say how.
 */

const CX = 200;
const CY = 150;
const R = 58;
const ORBIT = 34;
const DEFAULT_KINDS = ["utility", "meme", "stablecoin", "shared value", "lending", "…"] as const;

export function BelongingFigure({ idPrefix = "belonging", className, svgProps, kinds = DEFAULT_KINDS }: BelongingFigureProps) {
    const rings = kinds.map((label, i) => {
        const angle = -Math.PI / 2 + (i * 2 * Math.PI) / kinds.length;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const cx = CX + ORBIT * cos;
        const cy = CY + ORBIT * sin;
        const labelR = ORBIT + R + 8;
        return {
            label,
            cx,
            cy,
            open: i === kinds.length - 1,
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
            viewBox="10 26 380 250"
            title="Belonging: one wallet at the intersection of the token communities it holds"
            desc={`${kinds.length} overlapping rings, one per kind of token community (${kinds.slice(0, -1).join(", ")}, and one left open for kinds not yet invented), all passing through one wallet, labelled you, at the center.`}
        >
            {rings.map((r) => (
                <g key={r.label}>
                    <circle
                        cx={r.cx}
                        cy={r.cy}
                        r={R}
                        strokeWidth={1.5}
                        strokeDasharray={r.open ? "4 4" : undefined}
                        className="fill-paper stroke-ink-primary"
                        fillOpacity={0.35}
                    />
                    <text x={r.labelX} y={r.labelY} textAnchor={r.anchor} fontSize={11} className="fill-ink-muted">
                        {r.label}
                    </text>
                </g>
            ))}
            <circle cx={CX} cy={CY} r={13} className="fill-ink-primary" />
            <text x={CX} y={CY + 3} textAnchor="middle" fontSize={9} className="fill-paper">
                you
            </text>
        </FigureFrame>
    );
}
