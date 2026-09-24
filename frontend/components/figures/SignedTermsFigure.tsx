import type { BaseFigureProps } from "@/components/figures/BaseFigureProps";
import { FigureFrame } from "@/components/figures/FigureFrame";

export type SignedTermsFigureProps = BaseFigureProps;

/**
 * The IDEA of an agreement signed before the work: one sheet of terms in the
 * middle, the buyer's wallet on one side and the seller's on the other, each
 * joined to the sheet by one line and each leaving its mark on it. Three
 * words on the drawing. What the terms say, and the bond each signature
 * commits, belong to the pages that own them.
 */

const CX = 200;
const CY = 150;
const SHEET_W = 96;
const SHEET_H = 120;
const WALLET_R = 17;
const WALLET_DX = 130;

export function SignedTermsFigure({ idPrefix = "signed-terms", className, svgProps }: SignedTermsFigureProps) {
    const sheetX = CX - SHEET_W / 2;
    const sheetY = CY - SHEET_H / 2;
    const rules = [0, 1, 2, 3].map((i) => sheetY + 30 + i * 16);
    const sides = [
        { x: CX - WALLET_DX, label: "buyer", markX: sheetX + 18 },
        { x: CX + WALLET_DX, label: "seller", markX: sheetX + SHEET_W - 34 },
    ] as const;

    return (
        <FigureFrame
            idPrefix={idPrefix}
            className={className}
            svgProps={svgProps}
            viewBox="10 36 380 230"
            title="An agreement signed before the work: the terms, the buyer's mark, the seller's mark"
            desc="One sheet of terms in the middle. A buyer's wallet on the left and a seller's wallet on the right, each joined to the sheet by one line, and each has left its signature at the foot of the sheet."
        >
            {sides.map((s) => (
                <line key={`join-${s.label}`} x1={s.x} y1={CY} x2={s.x < CX ? sheetX : sheetX + SHEET_W} y2={CY} strokeWidth={1.5} className="stroke-ink-muted" />
            ))}
            <rect x={sheetX} y={sheetY} width={SHEET_W} height={SHEET_H} rx={3} strokeWidth={1.5} className="fill-paper stroke-ink-primary" />
            <text x={CX} y={sheetY + 18} textAnchor="middle" fontSize={11} className="fill-ink-muted">
                terms
            </text>
            {rules.map((y) => (
                <line key={`rule-${y}`} x1={sheetX + 14} y1={y} x2={sheetX + SHEET_W - 14} y2={y} strokeWidth={1} className="stroke-ink-muted" />
            ))}
            {sides.map((s) => (
                <g key={`mark-${s.label}`}>
                    {/* the signature: one short stroke at the foot of the sheet */}
                    <path
                        d={`M ${s.markX} ${sheetY + SHEET_H - 16} q 5 -9 8 0 t 8 0`}
                        fill="none"
                        strokeWidth={1.5}
                        className="stroke-ink-primary"
                    />
                    <circle cx={s.x} cy={CY} r={WALLET_R} className="fill-ink-primary" />
                    <text x={s.x} y={CY + 3} textAnchor="middle" fontSize={9} className="fill-paper">
                        {s.label}
                    </text>
                </g>
            ))}
        </FigureFrame>
    );
}
