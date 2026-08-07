import { cn } from "@/lib/shared/utils";

export interface MerkleForestFigureProps {
    /** Merged onto the outer <figure>. */
    className?: string;
}

// Diagram reinforcing the copy above it — never a retelling of the deeper
// pages. Constraints the drawing keeps: clauses stay generic (clause a, b,
// …); each clause links to one data artifact; the data live inside an IPFS
// boundary and color alone says public or private; the tree converges to an
// unlabeled point whose single line lands in a block — the chain holds the
// fingerprint, never the data.
const CONSUMERS = ["public", "private", "personal", "administrative", "…"] as const;

const CX = [50, 130, 210, 290] as const;
const DATA_PRIVATE = [false, true, false, true] as const;
const NODE_W = 66;
const NODE_H = 22;
const MID_CX = [90, 250] as const;

export function MerkleForestFigure({ className }: MerkleForestFigureProps) {
    return (
        <figure className={cn("w-full max-w-xl mx-auto", className)}>
            <div className="relative rounded border border-default px-3 pt-5 pb-2.5 mb-3">
                <span aria-hidden="true" className="absolute top-1 right-2.5 text-[10px] text-ink-muted">consumers</span>
                <ul className="flex flex-wrap justify-center gap-1.5" aria-label="The data's consumers">
                    {CONSUMERS.map((consumer) => (
                        <li key={consumer} className="rounded border border-default px-3 py-1 text-xs text-ink-heading">
                            {consumer}
                        </li>
                    ))}
                </ul>
            </div>
            <svg
                viewBox="0 0 340 304"
                role="img"
                aria-labelledby="merkle-diagram-title merkle-diagram-desc"
                className="w-full h-auto"
            >
                <title id="merkle-diagram-title">One agreement, drawn as a diagram</title>
                <desc id="merkle-diagram-desc">
                    Four clauses and their data artifacts sit inside an IPFS
                    boundary, the data colored public or private. The clauses hash
                    pairwise down to a single point, and one line carries that
                    fingerprint into a block of the blockchain.
                </desc>

                {/* IPFS boundary around the data artifacts and their clauses. */}
                <rect x="6" y="6" width="328" height="116" rx="6" className="fill-none stroke-default" strokeWidth="1" strokeDasharray="4 3" />
                <text x="326" y="18" fontSize="9" textAnchor="end" className="fill-ink-muted">IPFS</text>

                {/* Data artifacts — color carries public/private. */}
                {CX.map((cx, i) => (
                    <g key={`data-${i}`}>
                        <rect
                            x={cx - NODE_W / 2}
                            y={30}
                            width={NODE_W}
                            height={NODE_H}
                            rx="3"
                            className={DATA_PRIVATE[i] ? "fill-ink-heading" : "fill-subtle-hover stroke-default"}
                            strokeWidth="0.75"
                        />
                        <text x={cx} y={45} fontSize="10" textAnchor="middle" className={DATA_PRIVATE[i] ? "fill-paper" : "fill-ink-heading"}>
                            {`data ${String.fromCharCode(97 + i)}`}
                        </text>
                    </g>
                ))}

                {/* Each clause connects to its data artifact. */}
                {CX.map((cx, i) => (
                    <g key={`clause-${i}`}>
                        <line x1={cx} y1={52} x2={cx} y2={92} className="stroke-default" strokeWidth="1" />
                        <rect x={cx - NODE_W / 2} y={92} width={NODE_W} height={NODE_H} rx="3" className="fill-none stroke-default" strokeWidth="1" />
                        <text x={cx} y={107} fontSize="10" textAnchor="middle" className="fill-ink-heading">
                            {`clause ${String.fromCharCode(97 + i)}`}
                        </text>
                    </g>
                ))}

                {/* Pairwise hashing down to one point. */}
                {MID_CX.map((mx, i) => (
                    <g key={`mid-${i}`}>
                        <line x1={CX[i * 2]} y1={114} x2={mx} y2={150} className="stroke-default" strokeWidth="1" />
                        <line x1={CX[i * 2 + 1]} y1={114} x2={mx} y2={150} className="stroke-default" strokeWidth="1" />
                        <rect x={mx - 6} y={150} width="12" height="12" rx="2" className="fill-subtle-hover stroke-default" strokeWidth="0.75" />
                        <line x1={mx} y1={162} x2={170} y2={205} className="stroke-default" strokeWidth="1" />
                    </g>
                ))}
                <circle cx="170" cy="205" r="2.5" className="fill-ink-heading" />

                {/* One line carries the fingerprint into a block. */}
                <line x1="170" y1="207.5" x2="170" y2="244" className="stroke-ink-heading" strokeWidth="1.25" />
                {[14, 78, 142, 206, 270].map((x, i) => (
                    <g key={`block-${i}`}>
                        <rect x={x} y={244} width="56" height="24" rx="3" className="fill-subtle-hover stroke-ink-heading" strokeWidth="1.25" />
                        <text x={x + 28} y={260} fontSize="9" textAnchor="middle" className="fill-ink-heading">block</text>
                    </g>
                ))}

                {/* Color legend. */}
                <rect x="14" y="284" width="10" height="10" rx="2" className="fill-subtle-hover stroke-default" strokeWidth="0.75" />
                <text x="29" y="292.5" fontSize="9" className="fill-ink-muted">public data</text>
                <rect x="92" y="284" width="10" height="10" rx="2" className="fill-ink-heading" />
                <text x="107" y="292.5" fontSize="9" className="fill-ink-muted">private data</text>
            </svg>
        </figure>
    );
}
