import type { SVGProps } from "react";
import { cn } from "@/lib/shared/utils";

export interface MerkleTreeFigureProps {
    /** Leaf labels, left to right (2–6). An empty string renders an unlabeled leaf. */
    leaves: readonly string[];
    /** Label inside the root node. */
    rootLabel?: string;
    /** Base id for the accessible <title>/<desc> pair. Override when embedding
     *  more than one tree on the same page to avoid id collisions. */
    idPrefix?: string;
    /** Accessible <title> text. */
    accessibleTitle?: string;
    /** Accessible <desc> text. */
    accessibleDesc?: string;
    /** Merged onto the outer <svg>. */
    className?: string;
    svgProps?: SVGProps<SVGSVGElement>;
}

interface TreeNode {
    cx: number;
    label?: string;
}

// One merkle tree, drawn as a tree: leaves at the top, pairwise hash nodes
// below, one root at the bottom — the direction the record travels: terms,
// hashed pair by pair, down to the single fingerprint the chain holds.
// Reusable by design — pages draw several trees side by side; give each
// instance its own idPrefix.
const VIEW_W = 320;
const LEAF_H = 24;
const HASH_W = 44;
const HASH_H = 18;
const ROOT_W = 132;
const ROOT_H = 24;
const LEVEL_GAP = 34;

function chunkPairs(nodes: TreeNode[]): TreeNode[] {
    const parents: TreeNode[] = [];
    for (let i = 0; i < nodes.length; i += 2) {
        const pair = nodes.slice(i, i + 2);
        parents.push({ cx: pair.reduce((sum, n) => sum + n.cx, 0) / pair.length });
    }
    return parents;
}

/** @public Reusable multi-tree primitive; pages draw several instances side by side. */
export function MerkleTreeFigure({
    leaves,
    rootLabel = "root — the fingerprint",
    idPrefix = "merkle-tree",
    accessibleTitle = "A merkle tree",
    accessibleDesc = "The terms of an agreement as leaves, hashed pair by pair down to a single root.",
    className,
    svgProps,
}: MerkleTreeFigureProps) {
    const slot = VIEW_W / leaves.length;
    const leafW = Math.min(slot - 8, 74);

    // Levels, top to bottom: leaves, then pairwise hash levels, then the root.
    const levels: TreeNode[][] = [leaves.map((label, i) => ({ cx: slot * (i + 0.5), label }))];
    while (levels[levels.length - 1].length > 1) {
        levels.push(chunkPairs(levels[levels.length - 1]));
    }

    const levelY = (level: number) => 4 + level * (LEAF_H + LEVEL_GAP);
    const levelH = (level: number) => (level === 0 ? LEAF_H : level === levels.length - 1 ? ROOT_H : HASH_H);
    const viewH = levelY(levels.length - 1) + ROOT_H + 6;

    const titleId = `${idPrefix}-title`;
    const descId = `${idPrefix}-desc`;

    return (
        <svg
            viewBox={`0 0 ${VIEW_W} ${viewH}`}
            role="img"
            aria-labelledby={`${titleId} ${descId}`}
            className={cn("w-full h-auto", className)}
            {...svgProps}
        >
            <title id={titleId}>{accessibleTitle}</title>
            <desc id={descId}>{accessibleDesc}</desc>

            {/* Connectors: child bottom-center to parent top-center. */}
            {levels.slice(0, -1).map((level, li) =>
                level.map((node, ni) => {
                    const parent = levels[li + 1][Math.floor(ni / 2)];
                    return (
                        <line
                            key={`${li}-${ni}`}
                            x1={node.cx}
                            y1={levelY(li) + levelH(li)}
                            x2={parent.cx}
                            y2={levelY(li + 1)}
                            className="stroke-default"
                            strokeWidth="1"
                        />
                    );
                }),
            )}

            {/* Leaves. */}
            {levels[0].map((leaf, i) => (
                <g key={`leaf-${i}`}>
                    <rect
                        x={leaf.cx - leafW / 2}
                        y={levelY(0)}
                        width={leafW}
                        height={LEAF_H}
                        rx="3"
                        className="fill-none stroke-default"
                        strokeWidth="1"
                    />
                    {leaf.label && (
                        <text x={leaf.cx} y={levelY(0) + 16} fontSize="10" textAnchor="middle" className="fill-ink-heading">
                            {leaf.label}
                        </text>
                    )}
                </g>
            ))}

            {/* Hash levels between leaves and root. */}
            {levels.slice(1, -1).map((level, li) =>
                level.map((node, ni) => (
                    <g key={`hash-${li}-${ni}`}>
                        <rect
                            x={node.cx - HASH_W / 2}
                            y={levelY(li + 1)}
                            width={HASH_W}
                            height={HASH_H}
                            rx="3"
                            className="fill-subtle-hover stroke-default"
                            strokeWidth="0.75"
                        />
                        <text x={node.cx} y={levelY(li + 1) + 12.5} fontSize="8" textAnchor="middle" className="fill-ink-muted">
                            hash
                        </text>
                    </g>
                )),
            )}

            {/* Root. */}
            {(() => {
                const root = levels[levels.length - 1][0];
                const y = levelY(levels.length - 1);
                return (
                    <g>
                        <rect
                            x={root.cx - ROOT_W / 2}
                            y={y}
                            width={ROOT_W}
                            height={ROOT_H}
                            rx="3"
                            className="fill-subtle-hover stroke-ink-heading"
                            strokeWidth="1.25"
                        />
                        <text x={root.cx} y={y + 16} fontSize="10" fontWeight="600" textAnchor="middle" className="fill-ink-heading">
                            {rootLabel}
                        </text>
                    </g>
                );
            })()}
        </svg>
    );
}
