import type { ReactNode } from "react";
import type { BaseFigureProps } from "@/components/figures/BaseFigureProps";
import { FigureFrame } from "@/components/figures/FigureFrame";

interface ProcessTopologyLeg {
    /** The seller-of-record's label, as the citing paper names it. */
    name: string;
    /** This order's payment, in the figure's declared unit. */
    payment: number;
}

export interface ProcessTopologyFigureProps extends BaseFigureProps {
    /** The orders, in COMMIT ORDER. Position is load-bearing: the accumulator
     *  is monotonic, so the same set of payments in a different sequence gives
     *  every seller a different bond. */
    legs: readonly ProcessTopologyLeg[];
    /** How the citing paper names the one party on the buyer side of every edge. */
    buyerLabel: string;
    /** Currency/unit prefix for every figure in the diagram (e.g. "$"). */
    unit: string;
    figureTitle: string;
    figureDesc: string;
    caption: ReactNode;
}

/**
 * The SHAPE of an N-party process: one root buyer, N independent bilateral
 * edges, and a monotonic accumulator.
 *
 * This figure answers a different question from `StackedBondChainFigure`,
 * which renders the bond ARITHMETIC of a short chain as stacked bars. Here the
 * load-bearing facts are topological: every order in a process runs to the same
 * root buyer (the kernel requires it), no edge joins one seller to another, and
 * the sellers are ordered — the accumulator each seller bonds twice over is the
 * value the process has reached at that seller's own commit.
 *
 * Bond arithmetic per `sdk/src/bonds.ts` `calculateBonds`: sellerBond =
 * 2 × cumulativeValue, buyerBond = 2 × payment, on every order.
 */

const ROW_H = 30;
const TOP = 62;
const HUB_X = 22;
const HUB_W = 86;
const NODE_X = 148;
const NODE_W = 158;
const BAR_X = NODE_X + NODE_W + 10;
const BAR_W = 68;

const fmt = (unit: string, n: number) =>
    `${unit}${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`;

export function ProcessTopologyFigure({
    idPrefix = "process-topology",
    className,
    svgProps,
    legs,
    buyerLabel,
    unit,
    figureTitle,
    figureDesc,
    caption,
}: ProcessTopologyFigureProps) {
    let running = 0;
    const nodes = legs.map((leg, i) => {
        running += leg.payment;
        return {
            ...leg,
            index: i + 1,
            cumulative: running,
            sellerBond: 2 * running,
            buyerBond: 2 * leg.payment,
            y: TOP + i * ROW_H,
        };
    });

    const finalCumulative = nodes[nodes.length - 1].cumulative;
    const cohortBonds = nodes.reduce((s, n) => s + n.sellerBond, 0);
    const buyerBonds = 2 * finalCumulative;

    const hubTop = TOP - 8;
    const hubBottom = nodes[nodes.length - 1].y + 8;
    const hubMid = (hubTop + hubBottom) / 2;

    const viewHeight = hubBottom + 110;

    return (
        <FigureFrame
            idPrefix={idPrefix}
            className={className}
            svgProps={svgProps}
            viewBox={`0 0 400 ${viewHeight}`}
            title={figureTitle}
            desc={figureDesc}
            caption={caption}
        >
                {/* Column headings */}
                <text x={NODE_X} y="26" fontSize="9" fontWeight="600" className="fill-ink-muted">
                    seller of record · commit order
                </text>
                <text x={BAR_X} y="26" fontSize="9" fontWeight="600" className="fill-ink-muted">
                    seller bond = 2G
                </text>
                <text x={NODE_X} y="40" fontSize="8.5" className="fill-ink-muted">
                    payment P · accumulator G
                </text>
                <text x={BAR_X} y="40" fontSize="8.5" className="fill-ink-muted">
                    bar ∝ 2G
                </text>

                {/* The hub: one root buyer on the buyer side of every edge. */}
                <rect
                    x={HUB_X}
                    y={hubTop}
                    width={HUB_W}
                    height={hubBottom - hubTop}
                    rx="8"
                    className="fill-ink-heading"
                />
                <text
                    x={HUB_X + HUB_W / 2}
                    y={hubMid - 4}
                    fontSize="11"
                    fontWeight="600"
                    textAnchor="middle"
                    className="fill-paper"
                >
                    {buyerLabel}
                </text>
                <text
                    x={HUB_X + HUB_W / 2}
                    y={hubMid + 10}
                    fontSize="8.5"
                    textAnchor="middle"
                    className="fill-paper"
                >
                    root buyer
                </text>

                {/* One bilateral edge per order — the only edges that exist. */}
                {nodes.map((node) => (
                    <g key={`edge-${node.index}`}>
                        <path
                            d={`M ${HUB_X + HUB_W} ${hubMid} C ${HUB_X + HUB_W + 40} ${hubMid}, ${NODE_X - 40} ${node.y}, ${NODE_X} ${node.y}`}
                            className="fill-none stroke-default-strong"
                            strokeWidth="0.9"
                        />
                        <circle cx={NODE_X - 4} cy={node.y} r="1.8" className="fill-default-strong" />
                    </g>
                ))}

                {/* Seller nodes + accumulator bars */}
                {nodes.map((node) => (
                    <g key={`node-${node.index}`}>
                        <text x={NODE_X + 2} y={node.y - 2} fontSize="8.8" fontWeight="600" className="fill-ink-heading">
                            {node.index} · {node.name}
                        </text>
                        <text x={NODE_X + 2} y={node.y + 9} fontSize="8" className="fill-ink-body">
                            P {fmt(unit, node.payment)} · G {fmt(unit, node.cumulative)}
                        </text>

                        <rect
                            x={BAR_X}
                            y={node.y - 8}
                            width={BAR_W}
                            height="8"
                            rx="2"
                            className="fill-none stroke-default"
                            strokeWidth="0.6"
                        />
                        <rect
                            x={BAR_X}
                            y={node.y - 8}
                            width={(node.sellerBond / (2 * finalCumulative)) * BAR_W}
                            height="8"
                            rx="2"
                            className="fill-default-strong"
                        />
                        <text x={BAR_X} y={node.y + 8} fontSize="8" className="fill-ink-muted">
                            {fmt(unit, node.sellerBond)}
                        </text>
                    </g>
                ))}

                {/* Aggregate postures */}
                <line x1="22" y1={hubBottom + 22} x2="378" y2={hubBottom + 22} className="stroke-default" strokeWidth="1" />
                <text x="22" y={hubBottom + 40} fontSize="9.5" className="fill-ink-body">
                    {buyerLabel} locks 2P on every order — {fmt(unit, buyerBonds)} in all (2 × {fmt(unit, finalCumulative)}).
                </text>
                <text x="22" y={hubBottom + 54} fontSize="9.5" className="fill-ink-body">
                    {nodes.length === 1
                        ? `The seller locks ${fmt(unit, cohortBonds)} — against G at its own commit.`
                        : `The ${nodes.length} sellers together lock ${fmt(unit, cohortBonds)} — each against G at its own commit.`}
                </text>
                <text x="22" y={hubBottom + 70} fontSize="9" className="fill-ink-muted">
                    G is monotonic, so the last to commit always bonds 2 × {fmt(unit, finalCumulative)} = {fmt(unit, 2 * finalCumulative)}.
                </text>
                <text x="22" y={hubBottom + 84} fontSize="9" className="fill-ink-muted">
                    Every edge runs to the buyer; no edge joins one seller to another.
                </text>
                <text x="22" y={hubBottom + 98} fontSize="9" className="fill-ink-muted">
                    {nodes.length === 1
                        ? "Resolution settles the order, and it is the buyer's alone to call."
                        : `Resolution settles all ${nodes.length} orders at once, or none of them.`}
                </text>
        </FigureFrame>
    );
}
