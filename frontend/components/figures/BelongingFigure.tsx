import type { BaseFigureProps } from "@/components/figures/BaseFigureProps";
import { FigureFrame } from "@/components/figures/FigureFrame";

export interface BelongingFigureProps extends BaseFigureProps {
    /** The kinds of token community drawn as solid rings; the last is the open one. */
    tokens?: readonly string[];
    /** How many processes are drawn as light rings between the token rings. */
    processes?: number;
}

/**
 * The IDEA of belonging as a rosette: a wallet is defined by the token
 * communities it holds and the processes it takes part in, and it holds many
 * of each at once. One solid ring per kind of token, one light ring per
 * process, every ring passing through the one wallet at the center, so the
 * wallet is the intersection of all of them; the last token ring is open, for
 * the kinds that do not exist yet. Labels name kinds, never tokens or
 * assemblies. A member's own rosette, read from the wallet, is the profile's
 * to draw; this is the sketch.
 */

const CX = 200;
const CY = 150;
const R = 58;
const ORBIT = 34;
const PROCESS_R = 44;
const PROCESS_ORBIT = 22;
const DEFAULT_TOKENS = ["utility", "meme", "stablecoin", "shared value", "lending", "…"] as const;

export function BelongingFigure({
    idPrefix = "belonging",
    className,
    svgProps,
    tokens = DEFAULT_TOKENS,
    processes = 3,
}: BelongingFigureProps) {
    const tokenRings = tokens.map((label, i) => {
        const angle = -Math.PI / 2 + (i * 2 * Math.PI) / tokens.length;
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const labelR = ORBIT + R + 8;
        return {
            label,
            cx: CX + ORBIT * cos,
            cy: CY + ORBIT * sin,
            open: i === tokens.length - 1,
            labelX: CX + labelR * cos,
            labelY: CY + labelR * sin + 4,
            anchor: cos > 0.3 ? "start" : cos < -0.3 ? "end" : "middle",
        } as const;
    });
    const processRings = Array.from({ length: processes }, (_, i) => {
        const angle = -Math.PI / 2 + Math.PI / tokens.length + (i * 2 * Math.PI) / processes;
        return { cx: CX + PROCESS_ORBIT * Math.cos(angle), cy: CY + PROCESS_ORBIT * Math.sin(angle) };
    });

    return (
        <FigureFrame
            idPrefix={idPrefix}
            className={className}
            svgProps={svgProps}
            viewBox="10 26 380 250"
            title="Belonging: one wallet at the intersection of the tokens it holds and the processes it takes part in"
            desc={`${tokens.length} solid rings, one per kind of token community (${tokens.slice(0, -1).join(", ")}, and one left open for kinds not yet invented), and ${processes} light rings, one per process, all passing through one wallet, labelled you, at the center.`}
            caption="Solid rings: the tokens you hold. Light rings: the processes you take part in."
        >
            {processRings.map((r, i) => (
                <circle key={`process-${i}`} cx={r.cx} cy={r.cy} r={PROCESS_R} strokeWidth={1} className="fill-paper stroke-ink-muted" fillOpacity={0.25} />
            ))}
            {tokenRings.map((r) => (
                <g key={r.label}>
                    <circle
                        cx={r.cx}
                        cy={r.cy}
                        r={R}
                        strokeWidth={1.5}
                        strokeDasharray={r.open ? "4 4" : undefined}
                        className="fill-paper stroke-ink-primary"
                        fillOpacity={0.3}
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
