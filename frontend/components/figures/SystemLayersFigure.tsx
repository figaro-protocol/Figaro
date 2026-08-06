import type { SVGProps } from "react";
import { cn } from "@/lib/shared/utils";

export interface SystemLayersFigureProps {
    /** Base id for the accessible <title>/<desc> pair. Override when embedding
     *  more than one instance on the same page to avoid id collisions. */
    idPrefix?: string;
    /** Merged onto the outer <figure>. */
    className?: string;
    svgProps?: SVGProps<SVGSVGElement>;
}

// The whole system, drawn once (operator rule 2026-08-06: HOME owns this
// figure; the kernel page carries only FigaroCore's mechanism design).
// Source of truth: the ratified frame (CLAUDE.md § "The frame") — the kernel
// floor plus six layers: clauses, assemblies + checkout, composition,
// registries + RPGF, data, agents. Glosses stay at home's layman altitude:
// no contract names, no standards jargon.
const LAYERS = [
    { name: "Agents", gloss: "software trades, authors, and competes — as an equal" },
    { name: "Data", gloss: "the market's map is public; your detail is yours to sell" },
    { name: "Registries + RPGF", gloss: "anyone joins; work that gets used gets paid" },
    { name: "Composition", gloss: "other on-chain contracts plug into every deal" },
    { name: "Assemblies + checkout", gloss: "whole deal-shapes, published and reused" },
    { name: "Clauses", gloss: "the terms of the deal, public and composable" },
] as const;

const FLOOR = { name: "Kernel", gloss: "two stakes and one rule — cheating always loses" } as const;

const BAND_H = 38;
const GAP = 6;
const WIDTH = 560;

export function SystemLayersFigure({
    idPrefix = "system-layers",
    className,
    svgProps,
}: SystemLayersFigureProps) {
    const titleId = `${idPrefix}-title`;
    const descId = `${idPrefix}-desc`;
    const viewHeight = (LAYERS.length + 1) * (BAND_H + GAP) + 2;

    return (
        <figure className={cn("w-full max-w-xl mx-auto", className)}>
            <svg
                viewBox={`0 0 ${WIDTH} ${viewHeight}`}
                role="img"
                aria-labelledby={`${titleId} ${descId}`}
                className="w-full h-auto"
                style={{ maxWidth: "100%" }}
                {...svgProps}
            >
                <title id={titleId}>The whole of Figaro: six layers on one floor</title>
                <desc id={descId}>
                    Seven stacked bands. The floor is the kernel — two stakes
                    and one rule. Built on it, in order: clauses, assemblies
                    and checkout, composition with other on-chain contracts,
                    the registries with retroactive public-goods funding, the
                    data layer, and agents participating as equals.
                </desc>
                {LAYERS.map((layer, i) => {
                    const y = 1 + i * (BAND_H + GAP);
                    return (
                        <g key={layer.name}>
                            <rect x="1" y={y} width={WIDTH - 2} height={BAND_H} rx="4" className="fill-none stroke-default" strokeWidth="1" />
                            <text x="16" y={y + 24} fontSize="13" fontWeight="600" className="fill-ink-heading">
                                {layer.name}
                            </text>
                            <text x={WIDTH - 16} y={y + 24} fontSize="11" textAnchor="end" className="fill-ink-muted">
                                {layer.gloss}
                            </text>
                        </g>
                    );
                })}
                {(() => {
                    const y = 1 + LAYERS.length * (BAND_H + GAP);
                    return (
                        <g>
                            <rect x="1" y={y} width={WIDTH - 2} height={BAND_H} rx="4" className="fill-subtle-hover stroke-ink-heading" strokeWidth="1.5" />
                            <text x="16" y={y + 24} fontSize="13" fontWeight="700" className="fill-ink-heading">
                                {FLOOR.name}
                            </text>
                            <text x={WIDTH - 16} y={y + 24} fontSize="11" textAnchor="end" className="fill-ink-body">
                                {FLOOR.gloss}
                            </text>
                        </g>
                    );
                })()}
            </svg>
            <figcaption className="mt-3 text-center text-sm text-ink-muted">
                One floor, six layers. Everything above changes freely; the floor never does.
            </figcaption>
        </figure>
    );
}
