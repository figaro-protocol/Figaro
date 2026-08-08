import { cn } from "@/lib/shared/utils";
import type { BaseFigureProps } from "@/components/figures/BaseFigureProps";

export type LayeredDefenseFigureProps = BaseFigureProps;

/**
 * The canonical five-layer defense-in-depth stack, nested inside-out as
 * concentric rings so the one load-bearing fact reads as shape, not
 * prose: layers 1–3 are where bonded funds actually sit (only the
 * buyer's own resolveProcess signature moves them); layers 4–5 act on
 * the on-chain record from outside the deal and cannot reach in.
 *
 * Source of truth: the ranked list at /faq#layers ("What stands
 * behind a deal?", frontend/app/(marketing)/(explain)/faq/page.tsx) — chain,
 * lockbox+record, other sellers, arbitration, ordinary courts — cross-
 * checked against the canonical stack in
 * ~/.claude/projects/-Users-adaliana-Figaro/memory/reference_layered_security_stack.md
 * (blockchain → FigaroCore+evidence → social/co-seller layer →
 * arbitration → law). Wording ("lockbox", "the record", "reach into the
 * lockbox", "the losing party's other assets") is /faq's own.
 */
export function LayeredDefenseFigure({
    idPrefix = "layered-defense",
    className,
    svgProps,
}: LayeredDefenseFigureProps) {
    const titleId = `${idPrefix}-title`;
    const descId = `${idPrefix}-desc`;

    const cx = 200;
    const cy = 122;
    const rChain = 16;
    const rLockbox = 42;
    const rSellers = 66;
    const rArbitration = 88;
    const rCourts = 110;

    return (
        <figure className={cn("w-full max-w-xl mx-auto", className)}>
            <svg
                viewBox="0 0 400 456"
                role="img"
                aria-labelledby={`${titleId} ${descId}`}
                className="w-full h-auto"
                style={{ maxWidth: "100%" }}
                {...svgProps}
            >
                <title id={titleId}>The layered defense stack, nested inside-out</title>
                <desc id={descId}>
                    Five concentric layers. Layer one, the chain, is
                    Ethereum&apos;s immutable ledger. Layer two, the
                    lockbox, is FigaroCore holding both sides&apos; doubled
                    stakes — nothing leaves it until the buyer signs the
                    close. Layer three is the other bonded sellers, whose
                    stake-backed interest in remedy comes from the same
                    lockbox&apos;s all-or-nothing settlement, not a
                    separate custody. A reach boundary separates those
                    three from layer four, arbitration such as Kleros, and
                    layer five, ordinary courts — both weigh the on-chain
                    record from outside the deal and enforce against the
                    losing party&apos;s other assets, but neither can
                    reach into the lockbox.
                </desc>

                {/* ── Concentric rings, largest first so later draws sit on top ── */}
                <circle cx={cx} cy={cy} r={rCourts} className="fill-canvas stroke-ink-faint" strokeWidth="1" strokeDasharray="3 3" />
                <circle cx={cx} cy={cy} r={rArbitration} className="fill-paper stroke-ink-faint" strokeWidth="1" strokeDasharray="3 3" />
                {/* Reach boundary — the strongest stroke in the figure, by design */}
                <circle cx={cx} cy={cy} r={rSellers} className="fill-subtle-hover stroke-ink-primary" strokeWidth="2.75" />
                <circle cx={cx} cy={cy} r={rLockbox} className="fill-ink-heading" />
                <circle cx={cx} cy={cy} r={rChain} className="fill-default-strong" />

                <text x={cx} y={cy - 4} fontSize="9" fontWeight="700" textAnchor="middle" className="fill-paper">$</text>

                {/* Boundary callout, anchored on the reach-boundary ring */}
                <line x1={cx + rSellers} y1={cy} x2="368" y2={cy} className="stroke-ink-primary" strokeWidth="1" />
                <text x="372" y={cy + 3} fontSize="8" className="fill-ink-primary font-mono">reach boundary</text>

                {/* ── Legend / label list ─────────────────────────────── */}
                <g>
                    <rect x="20" y="256" width="12" height="12" rx="2" className="fill-default-strong" />
                    <text x="40" y="266" fontSize="10.5" fontWeight="600" className="fill-ink-heading">1 · The chain</text>
                    <text x="40" y="279" fontSize="9" className="fill-ink-muted">Ethereum&apos;s consensus — the record nothing can rewrite</text>
                </g>

                <g>
                    <rect x="20" y="292" width="12" height="12" rx="2" className="fill-ink-heading" />
                    <text x="40" y="302" fontSize="10.5" fontWeight="600" className="fill-ink-heading">2 · The lockbox (FigaroCore)</text>
                    <text x="40" y="315" fontSize="9" className="fill-ink-muted">holds both doubled stakes; only the buyer&apos;s resolveProcess moves them</text>
                </g>

                <g>
                    <rect x="20" y="328" width="12" height="12" rx="2" className="fill-subtle-hover stroke-default" strokeWidth="0.75" />
                    <text x="40" y="338" fontSize="10.5" fontWeight="600" className="fill-ink-heading">3 · The other sellers</text>
                    <text x="40" y="351" fontSize="9" className="fill-ink-muted">all-or-nothing settlement gives every co-seller a stake-backed reason to help remedy</text>
                </g>

                <line x1="20" y1="362" x2="380" y2="362" strokeDasharray="5 3" className="stroke-ink-primary" strokeWidth="1.5" />
                <text x="200" y="376" fontSize="9.5" fontWeight="600" textAnchor="middle" className="fill-ink-primary">
                    record only below this line — nothing here moves a bonded fund
                </text>

                <g>
                    <rect x="20" y="390" width="12" height="12" rx="2" className="fill-paper stroke-ink-faint" strokeWidth="1" strokeDasharray="2 2" />
                    <text x="40" y="400" fontSize="10.5" fontWeight="600" className="fill-ink-heading">4 · Arbitration (e.g. Kleros)</text>
                    <text x="40" y="413" fontSize="9" className="fill-ink-muted">weighs the on-chain record from outside the deal</text>
                </g>

                <g>
                    <rect x="20" y="426" width="12" height="12" rx="2" className="fill-canvas stroke-ink-faint" strokeWidth="1" strokeDasharray="2 2" />
                    <text x="40" y="436" fontSize="10.5" fontWeight="600" className="fill-ink-heading">5 · Ordinary courts</text>
                    <text x="40" y="449" fontSize="9" className="fill-ink-muted">always available; enforces against the losing party&apos;s other assets — the lockbox stays sealed</text>
                </g>
            </svg>
            <figcaption className="mt-3 text-center text-sm text-ink-muted">
                Layers 1–3 are where the deal&apos;s bonded funds live and move.
                Arbitration and courts act on the record from outside — neither
                can reach into the lockbox.
            </figcaption>
        </figure>
    );
}
