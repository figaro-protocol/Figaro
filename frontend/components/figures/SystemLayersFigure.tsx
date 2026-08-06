import { cn } from "@/lib/shared/utils";

export interface SystemLayersFigureProps {
    /** Merged onto the outer <figure>. */
    className?: string;
}

// The whole system, drawn once (operator rule 2026-08-06: HOME owns this
// figure; the kernel page carries only FigaroCore's mechanism design).
// Source of truth: the ratified frame (CLAUDE.md § "The frame") — the kernel
// floor plus six layers: clauses, assemblies + checkout, composition,
// registries + RPGF, data, agents. Glosses stay at home's layman altitude:
// no contract names, no standards jargon.
// RULED 2026-08-06: plain HTML, not SVG — the stack must read as TEXT to
// every reader (curl, agents, screen readers), not only as shape.
const LAYERS = [
    { name: "Agents", gloss: "software trades, authors, and competes — as an equal" },
    { name: "Data", gloss: "the market's map is public; your detail is yours to sell" },
    { name: "Registries + RPGF", gloss: "anyone joins; work that gets used gets paid" },
    { name: "Composition", gloss: "other on-chain contracts plug into every deal" },
    { name: "Assemblies + checkout", gloss: "whole deal-shapes, published and reused" },
    { name: "Clauses", gloss: "the terms of the deal, public and composable" },
] as const;

const FLOOR = { name: "Kernel", gloss: "two stakes and one rule — cheating always loses" } as const;

export function SystemLayersFigure({ className }: SystemLayersFigureProps) {
    return (
        <figure className={cn("w-full max-w-xl mx-auto", className)}>
            <ol className="space-y-1.5" aria-label="The whole of Figaro: six layers on one floor">
                {LAYERS.map((layer) => (
                    <li
                        key={layer.name}
                        className="flex items-baseline justify-between gap-4 rounded border border-default px-4 py-2"
                    >
                        <span className="text-sm font-semibold text-ink-heading whitespace-nowrap">{layer.name}</span>
                        <span className="text-xs text-ink-muted text-right">{layer.gloss}</span>
                    </li>
                ))}
                <li className="flex items-baseline justify-between gap-4 rounded border-[1.5px] border-ink-heading bg-subtle-hover px-4 py-2">
                    <span className="text-sm font-bold text-ink-heading whitespace-nowrap">{FLOOR.name}</span>
                    <span className="text-xs text-ink-body text-right">{FLOOR.gloss}</span>
                </li>
            </ol>
            <figcaption className="mt-3 text-center text-sm text-ink-muted">
                One floor, six layers. Everything above changes freely; the floor never does.
            </figcaption>
        </figure>
    );
}
