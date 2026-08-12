import { cn } from "@/lib/shared/utils";
import type { ReactNode } from "react";
import type { BaseFigureProps } from "@/components/figures/BaseFigureProps";

interface DesignGraphNode {
    label: string;
    /** A value-adder that sits off the main line at the design layer — bonded
     *  against the same process without owning a handoff. Drawn as a branch,
     *  which is the whole reason the design layer is not a line. */
    branch?: boolean;
}

export interface DesignGraphCollapseFigureProps extends BaseFigureProps {
    /** The design-layer graph, in operational order. */
    designNodes: readonly DesignGraphNode[];
    /** The commit sequence the kernel sees, in commit order. */
    commitOrder: readonly string[];
    /** The one party on the buyer side of every order. */
    rootBuyerLabel: string;
    /** Heading over the left panel — the citing paper's own name for its design layer. */
    designHeading: string;
    /** What carries the ordering across the collapse, in the citing paper's own
     *  terms. One entry per rendered line — SVG does not wrap text, so the
     *  caller owns the break points. */
    topologyNote: readonly string[];
    figureTitle: string;
    figureDesc: string;
    caption: ReactNode;
}

/**
 * The design layer branches; the kernel's commit sequence does not.
 *
 * The left panel is an upper-layer graph — operational handoffs plus
 * value-adders that sit off the main line. The right panel is what
 * `ProcessState` actually holds: a linear series of dual-signed commits
 * extending one monotonic accumulator, every one of them to the same root
 * buyer, with no parent-child structure anywhere in settlement state. The
 * ordering survives the collapse only because the parties committed it in
 * their agreement — the topology clause is agreement-only, enforced off-chain
 * by whoever reconstructs the graph from the record (`docs/CLAUSES.md`).
 */

const ROW_H = 26;
const L_X = 16;
const L_W = 178;
const R_X = 206;
const R_W = 178;

export function DesignGraphCollapseFigure({
    idPrefix = "design-graph-collapse",
    className,
    svgProps,
    designNodes,
    commitOrder,
    rootBuyerLabel,
    designHeading,
    topologyNote,
    figureTitle,
    figureDesc,
    caption,
}: DesignGraphCollapseFigureProps) {
    const titleId = `${idPrefix}-title`;
    const descId = `${idPrefix}-desc`;

    const headerY = 58;
    const leftTop = headerY + 22;
    const rightTop = headerY + 62; // room for the root-buyer bar above the commits

    const bodyBottom = Math.max(leftTop + designNodes.length * ROW_H, rightTop + commitOrder.length * ROW_H);
    // The seam's closing sentence sits below however many lines the caller's
    // topology note takes.
    const seamY = bodyBottom + 58 + topologyNote.length * 11;
    const viewHeight = seamY + 26;

    const spineX = L_X + 14;
    const lastMainLine = designNodes.reduce((last, n, i) => (n.branch ? last : i), -1);
    const firstBranch = designNodes.findIndex((n) => n.branch);

    return (
        <figure className={cn("w-full max-w-2xl mx-auto", className)}>
            <svg
                viewBox={`0 0 400 ${viewHeight}`}
                role="img"
                aria-labelledby={`${titleId} ${descId}`}
                className="w-full h-auto"
                style={{ maxWidth: "100%" }}
                {...svgProps}
            >
                <title id={titleId}>{figureTitle}</title>
                <desc id={descId}>{figureDesc}</desc>

                <defs>
                    <marker
                        id={`${idPrefix}-arrow`}
                        viewBox="0 0 10 10"
                        refX="8"
                        refY="5"
                        markerWidth="6"
                        markerHeight="6"
                        orient="auto-start-reverse"
                    >
                        <path d="M0,0 L10,5 L0,10 z" className="fill-ink-muted" />
                    </marker>
                </defs>

                {/* Panel headings */}
                <text x={L_X} y="22" fontSize="11" fontWeight="600" className="fill-ink-heading">
                    {designHeading}
                </text>
                <text x={L_X} y="36" fontSize="8.5" className="fill-ink-muted">
                    branches; ordering is the parties&rsquo; own
                </text>
                <text x={R_X} y="22" fontSize="11" fontWeight="600" className="fill-ink-heading">
                    What the kernel holds
                </text>
                <text x={R_X} y="36" fontSize="8.5" className="fill-ink-muted">
                    one accumulator, one root buyer, no parent field
                </text>

                <line x1={L_X} y1={headerY - 12} x2="384" y2={headerY - 12} className="stroke-default" strokeWidth="1" />

                {/* The collapse arrow, between the panels */}
                <line
                    x1={L_X + L_W + 4}
                    y1={(leftTop + bodyBottom) / 2}
                    x2={R_X - 4}
                    y2={(leftTop + bodyBottom) / 2}
                    className="stroke-ink-primary"
                    strokeWidth="1.5"
                    markerEnd={`url(#${idPrefix}-arrow)`}
                />
                <text
                    x={(L_X + L_W + R_X) / 2}
                    y={(leftTop + bodyBottom) / 2 - 6}
                    fontSize="7.5"
                    textAnchor="middle"
                    className="fill-ink-primary"
                >
                    collapses
                </text>

                {/* ── Left: the design-layer graph ────────────────────────── */}
                <line
                    x1={spineX}
                    y1={leftTop - 6}
                    x2={spineX}
                    y2={leftTop + (lastMainLine === -1 ? 0 : lastMainLine) * ROW_H + 6}
                    className="stroke-default-strong"
                    strokeWidth="1"
                />
                {designNodes.map((node, i) => {
                    const y = leftTop + i * ROW_H;
                    const x = node.branch ? spineX + 26 : spineX;
                    return (
                        <g key={node.label}>
                            {i === firstBranch && (
                                // No connector: these value-adders are deliberately NOT on
                                // the main line, and drawing them onto it would assert the
                                // sequence the paragraph denies.
                                <text x={x - 4} y={y - 12} fontSize="7.5" fontStyle="italic" className="fill-ink-muted">
                                    off the main line, bonded to the same process
                                </text>
                            )}
                            <circle
                                cx={x}
                                cy={y}
                                r="3.5"
                                className={node.branch ? "fill-paper stroke-default-strong" : "fill-ink-heading"}
                                strokeWidth={node.branch ? "1" : undefined}
                            />
                            <text x={x + 9} y={y + 3} fontSize="8.5" className={node.branch ? "fill-ink-muted" : "fill-ink-body"}>
                                {node.label}
                            </text>
                        </g>
                    );
                })}

                {/* ── Right: the linear commit sequence under one root buyer ── */}
                <rect x={R_X} y={headerY + 22} width={R_W} height="26" rx="6" className="fill-ink-heading" />
                <text
                    x={R_X + R_W / 2}
                    y={headerY + 32}
                    fontSize="9"
                    fontWeight="600"
                    textAnchor="middle"
                    className="fill-paper"
                >
                    {rootBuyerLabel}
                </text>
                <text x={R_X + R_W / 2} y={headerY + 43} fontSize="7.5" textAnchor="middle" className="fill-paper">
                    root buyer of every order below
                </text>

                <line
                    x1={R_X + 10}
                    y1={headerY + 48}
                    x2={R_X + 10}
                    y2={rightTop + (commitOrder.length - 1) * ROW_H + 6}
                    className="stroke-default-strong"
                    strokeWidth="1"
                />
                {commitOrder.map((label, i) => {
                    const y = rightTop + i * ROW_H;
                    return (
                        <g key={label}>
                            <line x1={R_X + 10} y1={y} x2={R_X + 20} y2={y} className="stroke-default-strong" strokeWidth="1" />
                            <text x={R_X + 24} y={y - 2} fontSize="8" fontWeight="600" className="fill-ink-heading">
                                commit {i + 1}
                            </text>
                            <text x={R_X + 24} y={y + 8} fontSize="8.5" className="fill-ink-body">
                                {label}
                            </text>
                        </g>
                    );
                })}
                <text x={R_X + 10} y={rightTop + commitOrder.length * ROW_H + 4} fontSize="8" className="fill-ink-muted">
                    G rises monotonically down this list, and only down it.
                </text>

                {/* ── The seam ────────────────────────────────────────────── */}
                <line x1={L_X} y1={bodyBottom + 22} x2="384" y2={bodyBottom + 22} className="stroke-default" strokeWidth="1" />
                <text x={L_X} y={bodyBottom + 40} fontSize="9" fontWeight="600" className="fill-ink-primary">
                    What carries across the collapse
                </text>
                {topologyNote.map((line, i) => (
                    <text key={line} x={L_X} y={bodyBottom + 54 + i * 11} fontSize="8.5" className="fill-ink-body">
                        {line}
                    </text>
                ))}
                <text x={L_X} y={seamY} fontSize="8.5" className="fill-ink-muted">
                    Settlement state records no parent, no child, and no branch &mdash; {designNodes.length} nodes
                </text>
                <text x={L_X} y={seamY + 11} fontSize="8.5" className="fill-ink-muted">
                    on the left, {commitOrder.length} commits and one accumulator on the right.
                </text>
            </svg>
            <figcaption className="mt-3 text-center text-sm text-ink-muted">{caption}</figcaption>
        </figure>
    );
}
