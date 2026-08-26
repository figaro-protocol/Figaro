import type { ReactNode } from "react";
import type { BaseFigureProps } from "@/components/figures/BaseFigureProps";
import { FigureFrame } from "@/components/figures/FigureFrame";

interface LayeredDefenseLayer {
    /** Layer heading, including whatever numbering the citing surface uses. */
    label: string;
    /** One line of gloss beneath the heading. */
    note: string;
}

export interface LayeredDefenseFigureProps extends BaseFigureProps {
    /** Exactly five layers, INSIDE OUT. Position is load-bearing: the inner
     *  three are drawn inside the reach boundary and the outer two outside it,
     *  so a caller reordering them changes what the figure asserts. Defaults to
     *  /faq's ranked list; a paper that numbers the same stack differently
     *  passes its own. */
    layers?: readonly [LayeredDefenseLayer, LayeredDefenseLayer, LayeredDefenseLayer, LayeredDefenseLayer, LayeredDefenseLayer];
    /** The sentence printed on the reach boundary itself. */
    boundaryNote?: string;
    /** The short label on the leader line pointing at the boundary ring.
     *  Defaults to /faq's coinage, which is /faq's and belongs to it — a
     *  paper naming the same boundary in its own register passes its own. */
    boundaryRingLabel?: string;
    figureTitle?: string;
    figureDesc?: string;
    caption?: ReactNode;
}

// /faq's own ranked list and wording ("lockbox", "the record", "reach into the
// lockbox", "the losing party's other assets") — the default's sole consumer.
const FAQ_LAYERS: NonNullable<LayeredDefenseFigureProps["layers"]> = [
    { label: "1 · The chain", note: "Ethereum's consensus — the record nothing can rewrite" },
    { label: "2 · The lockbox (FigaroCore)", note: "holds both doubled stakes; only the buyer's resolveProcess moves them" },
    { label: "3 · The other sellers", note: "all-or-nothing settlement gives every co-seller a stake-backed reason to help remedy" },
    { label: "4 · Arbitration (e.g. Kleros)", note: "weighs the on-chain record from outside the deal" },
    { label: "5 · Ordinary courts", note: "always available; enforces against the losing party's other assets — the lockbox stays sealed" },
];

const FAQ_BOUNDARY = "record only below this line — nothing here moves a bonded fund";
const FAQ_RING_LABEL = "reach boundary";
const FAQ_TITLE = "The layered defense stack, nested inside-out";
const FAQ_DESC =
    "Five concentric layers. Layer one, the chain, is Ethereum's immutable " +
    "ledger. Layer two, the lockbox, is FigaroCore holding both sides' doubled " +
    "stakes — nothing leaves it until the buyer signs the close. Layer three is " +
    "the other bonded sellers, whose stake-backed interest in remedy comes from " +
    "the same lockbox's all-or-nothing settlement, not a separate custody. A " +
    "reach boundary separates those three from layer four, arbitration such as " +
    "Kleros, and layer five, ordinary courts — both weigh the on-chain record " +
    "from outside the deal and enforce against the losing party's other assets, " +
    "but neither can reach into the lockbox.";
const FAQ_CAPTION = (
    <>
        Layers 1&ndash;3 are where the deal&apos;s bonded funds live and move.
        Arbitration and courts act on the record from outside &mdash; neither
        can reach into the lockbox.
    </>
);

/**
 * The canonical five-layer defense-in-depth stack, nested inside-out as
 * concentric rings so the one load-bearing fact reads as shape, not
 * prose: the inner three are where bonded funds actually sit (only the
 * buyer's own resolveProcess signature moves them); the outer two act on
 * the on-chain record from outside the deal and cannot reach in.
 *
 * Source of truth: the ranked list at /faq#layers ("What stands
 * behind a deal?", frontend/app/(marketing)/(deal)/faq/page.tsx) — chain,
 * lockbox+record, other sellers, arbitration, ordinary courts — cross-
 * checked against the canonical stack in
 * ~/.claude/projects/-Users-adaliana-Figaro/memory/reference_layered_security_stack.md
 * (blockchain → FigaroCore+evidence → social/co-seller layer →
 * arbitration → law).
 *
 * The five positions are the invariant; the labels are not. A surface that
 * numbers or names the same stack in its own register passes `layers`.
 */
export function LayeredDefenseFigure({
    idPrefix = "layered-defense",
    className,
    svgProps,
    layers = FAQ_LAYERS,
    boundaryNote = FAQ_BOUNDARY,
    boundaryRingLabel = FAQ_RING_LABEL,
    figureTitle = FAQ_TITLE,
    figureDesc = FAQ_DESC,
    caption = FAQ_CAPTION,
}: LayeredDefenseFigureProps) {
    const cx = 200;
    const cy = 122;
    const rChain = 16;
    const rLockbox = 42;
    const rSellers = 66;
    const rArbitration = 88;
    const rCourts = 110;

    return (
        <FigureFrame
            idPrefix={idPrefix}
            className={className}
            svgProps={svgProps}
            viewBox="0 0 400 456"
            title={figureTitle}
            desc={figureDesc}
            caption={caption}
        >
                {/* ── Concentric rings, largest first so later draws sit on top ── */}
                <circle cx={cx} cy={cy} r={rCourts} className="fill-canvas stroke-ink-faint" strokeWidth="1" strokeDasharray="3 3" />
                <circle cx={cx} cy={cy} r={rArbitration} className="fill-paper stroke-ink-faint" strokeWidth="1" strokeDasharray="3 3" />
                {/* Reach boundary — the strongest stroke in the figure, by design */}
                <circle cx={cx} cy={cy} r={rSellers} className="fill-subtle-hover stroke-ink-primary" strokeWidth="2.75" />
                <circle cx={cx} cy={cy} r={rLockbox} className="fill-ink-heading" />
                <circle cx={cx} cy={cy} r={rChain} className="fill-default-strong" />

                {/* Boundary callout, anchored on the reach-boundary ring */}
                <line x1={cx + rSellers} y1={cy} x2="322" y2={cy} className="stroke-ink-primary" strokeWidth="1" />
                <text x="326" y={cy + 3} fontSize="8" className="fill-ink-primary font-mono">{boundaryRingLabel}</text>

                {/* ── Legend / label list ─────────────────────────────── */}
                {layers.map((layer, i) => {
                    // The inner three print above the reach-boundary rule, the outer
                    // two below it — which is why the y offsets jump at i === 3.
                    const y = i < 3 ? 256 + i * 36 : 390 + (i - 3) * 36;
                    const swatch = [
                        "fill-default-strong",
                        "fill-ink-heading",
                        "fill-subtle-hover stroke-default",
                        "fill-paper stroke-ink-faint",
                        "fill-canvas stroke-ink-faint",
                    ][i];
                    return (
                        <g key={layer.label}>
                            <rect
                                x="20"
                                y={y}
                                width="12"
                                height="12"
                                rx="2"
                                className={swatch}
                                strokeWidth={i === 2 ? "0.75" : i > 2 ? "1" : undefined}
                                strokeDasharray={i > 2 ? "2 2" : undefined}
                            />
                            <text x="40" y={y + 10} fontSize="10.5" fontWeight="600" className="fill-ink-heading">
                                {layer.label}
                            </text>
                            <text x="40" y={y + 23} fontSize="9" className="fill-ink-muted">
                                {layer.note}
                            </text>
                        </g>
                    );
                })}

                <line x1="20" y1="362" x2="380" y2="362" strokeDasharray="5 3" className="stroke-ink-primary" strokeWidth="1.5" />
                <text x="200" y="376" fontSize="9.5" fontWeight="600" textAnchor="middle" className="fill-ink-primary">
                    {boundaryNote}
                </text>
        </FigureFrame>
    );
}
