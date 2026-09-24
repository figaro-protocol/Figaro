import type { BaseFigureProps } from "@/components/figures/BaseFigureProps";
import { FigureFrame } from "@/components/figures/FigureFrame";

export interface BelongingFigureProps extends BaseFigureProps {
    /** How many token communities are drawn as heavy rings. */
    tokens?: number;
    /** How many processes are drawn as light rings between them. */
    processes?: number;
}

/**
 * The IDEA of belonging as a rosette: a wallet is defined by the token
 * communities it holds and the processes it takes part in, and it holds many
 * of each at once. One heavy ring per token, one light ring per process,
 * every ring passing through the one wallet at the center, so the wallet is
 * the intersection of all of them. Line weight tells the two families apart,
 * and one label names each family; no ring names a token or an assembly. A
 * member's own rosette, read from the wallet, is the profile's to draw; this
 * is the sketch.
 */

const CX = 200;
const CY = 150;
const R = 58;
const ORBIT = 34;
const PROCESS_R = 44;
const PROCESS_ORBIT = 22;

export function BelongingFigure({ idPrefix = "belonging", className, svgProps, tokens = 5, processes = 3 }: BelongingFigureProps) {
    const ring = (i: number, n: number, orbit: number, phase: number) => {
        const angle = -Math.PI / 2 + phase + (i * 2 * Math.PI) / n;
        return { cx: CX + orbit * Math.cos(angle), cy: CY + orbit * Math.sin(angle), angle };
    };
    const tokenRings = Array.from({ length: tokens }, (_, i) => ring(i, tokens, ORBIT, 0));
    const processRings = Array.from({ length: processes }, (_, i) => ring(i, processes, PROCESS_ORBIT, Math.PI / tokens));
    // One label per family, on the first ring of each, outward along its spoke.
    const tokenLabel = { x: CX + (ORBIT + R + 8) * Math.cos(tokenRings[0].angle), y: CY + (ORBIT + R + 8) * Math.sin(tokenRings[0].angle) + 4 };
    const last = processRings[processRings.length - 1];
    const processLabel = { x: CX + (PROCESS_ORBIT + PROCESS_R + 8) * Math.cos(last.angle), y: CY + (PROCESS_ORBIT + PROCESS_R + 8) * Math.sin(last.angle) + 4 };

    return (
        <FigureFrame
            idPrefix={idPrefix}
            className={className}
            svgProps={svgProps}
            viewBox="10 26 380 250"
            title="Belonging: one wallet at the intersection of the tokens it holds and the processes it takes part in"
            desc={`${tokens} heavy rings, one per token community, and ${processes} light rings, one per process, all passing through one wallet, labelled you, at the center. One heavy ring is labelled token and one light ring process.`}
        >
            {processRings.map((r, i) => (
                <circle key={`process-${i}`} cx={r.cx} cy={r.cy} r={PROCESS_R} strokeWidth={0.75} className="fill-paper stroke-ink-primary" fillOpacity={0.2} />
            ))}
            {tokenRings.map((r, i) => (
                <circle key={`token-${i}`} cx={r.cx} cy={r.cy} r={R} strokeWidth={2} className="fill-paper stroke-ink-primary" fillOpacity={0.3} />
            ))}
            <text x={tokenLabel.x} y={tokenLabel.y} textAnchor="middle" fontSize={11} className="fill-ink-muted">
                token
            </text>
            <text x={processLabel.x} y={processLabel.y} textAnchor={Math.cos(last.angle) > 0.3 ? "start" : Math.cos(last.angle) < -0.3 ? "end" : "middle"} fontSize={11} className="fill-ink-muted">
                process
            </text>
            <circle cx={CX} cy={CY} r={13} className="fill-ink-primary" />
            <text x={CX} y={CY + 3} textAnchor="middle" fontSize={9} className="fill-paper">
                you
            </text>
        </FigureFrame>
    );
}
