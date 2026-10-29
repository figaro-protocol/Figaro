import type { ReactNode } from "react";
import type { BaseFigureProps } from "@/components/figures/BaseFigureProps";
import { FigureFrame } from "@/components/figures/FigureFrame";

export interface WholeSystemFigureProps extends BaseFigureProps {
    /** The <figcaption>; the figure carries none unless the citing page passes one. */
    caption?: ReactNode;
}

interface WholeSystemPart {
    n: number;
    name: string;
    /** One node per line; part 1's bond line sets P and G in italic. */
    gloss: readonly ReactNode[];
    /** Top edge of the row's tile in the 400-wide viewBox. */
    y: number;
}

// Parts 1–7, bottom to top, every word from the cryptoeconomic paper's § 2 and
// § 5 (/papers/figaro-as-a-cryptoeconomic-system). Part 8, the data, is the
// strip along the side. The y positions are the approved draft's.
const PARTS: readonly WholeSystemPart[] = [
    {
        n: 1,
        name: "The bonded commitment",
        gloss: [
            "commit and resolve, the only operations",
            <>
                the buyer bonds 2<tspan fontStyle="italic">P</tspan>, each seller 2<tspan fontStyle="italic">G</tspan>
            </>,
            "only the buyer resolves; resolution is atomic",
        ],
        y: 630,
    },
    { n: 2, name: "The stake", gloss: ["the base chain’s own currency, locked", "to register; placed and reclaimable"], y: 560 },
    {
        n: 3,
        name: "The designs and the designers’ rewards",
        gloss: ["terms and assemblies; florins for", "real use alone, with no vote"],
        y: 492,
    },
    { n: 4, name: "The florin", gloss: ["the one token the protocol issues:", "no claim on revenue, no vote"], y: 424 },
    { n: 5, name: "The DAO", gloss: ["governs its own treasury and", "reaches nothing else"], y: 356 },
    { n: 6, name: "The denominations", gloss: ["any ERC-20 token, one per process"], y: 304 },
    {
        n: 7,
        name: "The composition with law and the market",
        gloss: ["clauses name the law, a forum, a filing, a license;", "the data meets a norm"],
        y: 236,
    },
];

const TITLE = "The whole of Figaro";
const DESC =
    "Bottom to top: the base chain, with gas; 1, the bonded commitment: commit and resolve, the only " +
    "operations, the buyer bonding 2P and each seller 2G, only the buyer resolving and resolution atomic; " +
    "2, the stake; 3, the designs and the designers’ rewards; 4, the florin; 5, the DAO; 6, the " +
    "denominations; 7, the composition with law and the market: clauses name the law, a forum, a filing, " +
    "a license; the data meets a norm. The rules fix the bond and the resolution and nothing else. Above " +
    "them, the graph: the designs published, the bindings sellers make, the selections buyers make; and " +
    "the economic forms it carries: a market-liberal graph, a cooperative graph, a mutual-aid graph. Along " +
    "the side, 8, the data: the chain holds a fingerprint of the agreement; the aggregate is public, the " +
    "detail the parties’ own, sealed or sold.";

const FORMS = ["market-liberal", "cooperative", "mutual-aid"] as const;
const GRAPH_LINES = ["the designs published", "the bindings sellers make", "the selections buyers make"] as const;

// Every mark is currentColor at an opacity, so the one ink class on the <svg>
// themes the whole drawing: ink-primary on the light canvas, canvas on a
// surface that opts into `.dark` (docs/DESIGN_TOKENS.md § "Dark mode").
const TILE = { fill: "none", stroke: "currentColor", strokeOpacity: 0.35, strokeWidth: 1 } as const;
const CORE = { fill: "currentColor", fillOpacity: 0.05, stroke: "currentColor", strokeWidth: 1.5 } as const;
const CHAIN = { fill: "currentColor", fillOpacity: 0.12, stroke: "currentColor", strokeOpacity: 0.5, strokeWidth: 1 } as const;
const NAME = { fill: "currentColor", fontSize: 13, fontWeight: 600 } as const;
const GLOSS = { fill: "currentColor", fontSize: 12, fillOpacity: 0.85 } as const;
const STRONG = { fill: "currentColor", fontSize: 13, fillOpacity: 1 } as const;
const NUM = { fill: "currentColor", fontSize: 12, fontWeight: 600, fillOpacity: 0.6 } as const;
const LABEL = { fill: "currentColor", fontSize: 11.5, fontStyle: "italic", fillOpacity: 0.75 } as const;

/**
 * The whole of Figaro as one stack: the base chain at the foot, the seven
 * parts of the rules above it (the bonded commitment drawn as the core
 * tile), the line where the rules stop, the graph composed above them and
 * the economic forms it carries; part 8, the data, runs the full height
 * along the side. Source: the cryptoeconomic paper's § 2 and § 5; the
 * words are the paper's, and a change to the parts changes there first.
 *
 * DOM order is bottom to top, the order the description reads, so a screen
 * reader and the drawing agree; part 8 follows part 7.
 */
export function WholeSystemFigure({ idPrefix = "whole-system", className, svgProps, caption }: WholeSystemFigureProps) {
    return (
        <FigureFrame
            idPrefix={idPrefix}
            className={className}
            svgProps={svgProps}
            svgClassName="text-ink-primary dark:text-canvas"
            viewBox="0 0 400 768"
            title={TITLE}
            desc={DESC}
            caption={caption}
        >
            {/* ── The base chain ─────────────────────────────────────── */}
            <rect x={12} y={716} width={312} height={40} rx={12} {...CHAIN} />
            <text x={26} y={741} {...NAME}>
                The base chain
            </text>
            <text x={310} y={741} textAnchor="end" {...GLOSS}>
                gas
            </text>

            {/* ── Parts 1–7, bottom to top ───────────────────────────── */}
            {PARTS.map((part) => {
                const height = 30 + part.gloss.length * 16;
                return (
                    <g key={part.n}>
                        <rect x={12} y={part.y} width={312} height={height} rx={12} {...(part.n === 1 ? CORE : TILE)} />
                        <text x={26} y={part.y + 21} {...NUM}>
                            {part.n}
                        </text>
                        <text x={42} y={part.y + 21} {...NAME}>
                            {part.name}
                        </text>
                        {part.gloss.map((line, i) => (
                            <text key={i} x={42} y={part.y + 39 + i * 16} {...GLOSS}>
                                {line}
                            </text>
                        ))}
                    </g>
                );
            })}

            {/* ── Part 8, the data, along the side ──────────────────── */}
            <rect x={332} y={34} width={56} height={722} rx={12} {...TILE} />
            <text x={0} y={0} textAnchor="middle" transform="translate(349 395) rotate(-90)" {...NAME}>
                {"8  The data"}
            </text>
            <text x={0} y={0} textAnchor="middle" transform="translate(364 395) rotate(-90)" {...GLOSS}>
                the chain holds a fingerprint of the agreement
            </text>
            <text x={0} y={0} textAnchor="middle" transform="translate(379 395) rotate(-90)" {...GLOSS}>
                the aggregate is public; the detail is the parties’ own, sealed or sold
            </text>

            {/* ── Where the rules stop ──────────────────────────────── */}
            <text x={168} y={212} textAnchor="middle" {...LABEL}>
                the rules fix the bond and the resolution
            </text>
            <text x={168} y={226} textAnchor="middle" {...LABEL}>
                and nothing else
            </text>

            {/* ── The graph composed above the rules ────────────────── */}
            <rect x={12} y={108} width={312} height={84} rx={12} {...TILE} />
            {GRAPH_LINES.map((line, i) => (
                <text key={line} x={168} y={134 + i * 22} textAnchor="middle" {...STRONG}>
                    {line}
                </text>
            ))}
            <text x={168} y={100} textAnchor="middle" {...LABEL}>
                the graph composed above the rules
            </text>

            {/* ── The economic forms the graph carries ──────────────── */}
            {FORMS.map((form, i) => {
                const x = 12 + i * 106;
                return (
                    <g key={form}>
                        <rect x={x} y={34} width={100} height={46} rx={12} {...TILE} />
                        <text x={x + 50} y={54} textAnchor="middle" {...NAME}>
                            {form}
                        </text>
                        <text x={x + 50} y={70} textAnchor="middle" {...GLOSS}>
                            graph
                        </text>
                    </g>
                );
            })}
            <text x={168} y={26} textAnchor="middle" {...LABEL}>
                economic forms
            </text>
        </FigureFrame>
    );
}
