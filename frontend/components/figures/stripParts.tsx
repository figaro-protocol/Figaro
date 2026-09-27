import type { ReactNode } from "react";
import { FigureFrame } from "@/components/figures/FigureFrame";
import { ArrowMarker } from "@/components/figures/ArrowMarker";

/**
 * The strip's parts, shared by the two strips: one trade (`TradeStripFigure`)
 * and the whole (`WholeStripFigure`). Wallets drawn as wallets and a person,
 * a sheet of terms, a padlock per bond, an arrow, a tick, and the numbered
 * panel each frame sits in. Words appear only as captions; every part is a
 * function, never a product.
 */
export const ROW_Y = 110;
export const WALLET_R = 26;

/** A wallet drawn as a person: the buyer. */
export function Person({ x, y }: { x: number; y: number }) {
    return (
        <g>
            <circle cx={x} cy={y} r={WALLET_R} strokeWidth={1.5} className="fill-paper stroke-ink-primary" />
            <circle cx={x} cy={y - 7} r={6} strokeWidth={1.5} className="fill-paper stroke-ink-primary" />
            <path d={`M ${x - 13} ${y + 14} a 13 12 0 0 1 26 0 z`} strokeWidth={1.5} className="fill-paper stroke-ink-primary" />
        </g>
    );
}

/** A wallet drawn as a wallet: a seller, whatever it sells. */
export function Wallet({ x, y }: { x: number; y: number }) {
    return (
        <g>
            <circle cx={x} cy={y} r={WALLET_R} strokeWidth={1.5} className="fill-paper stroke-ink-primary" />
            <rect x={x - 13} y={y - 9} width={26} height={18} rx={3} strokeWidth={1.5} className="fill-paper stroke-ink-primary" />
            <path d={`M ${x - 13} ${y - 5} h 26`} fill="none" strokeWidth={1.5} className="stroke-ink-primary" />
            <rect x={x + 4} y={y - 1} width={9} height={6} rx={1.5} strokeWidth={1.5} className="fill-paper stroke-ink-primary" />
        </g>
    );
}

/** The sheet of terms, with the trade's two numbers and room for marks. */
export function Sheet({ x, y, lines, marks, small }: { x: number; y: number; lines: readonly string[]; marks: number; small?: boolean }) {
    const w = small ? 30 : 84;
    const h = small ? 38 : 108;
    return (
        <g>
            <rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx={2} strokeWidth={1.5} className="fill-paper stroke-ink-primary" />
            {small
                ? [0, 1, 2].map((i) => (
                      <line key={i} x1={x - w / 2 + 6} y1={y - h / 2 + 9 + i * 7} x2={x + w / 2 - 6} y2={y - h / 2 + 9 + i * 7} strokeWidth={1} className="stroke-ink-muted" />
                  ))
                : lines.map((t, i) => (
                      <text key={t} x={x + w / 2 - 10} y={y - h / 2 + 26 + i * 18} textAnchor="end" fontSize={12} className="fill-ink-heading">
                          {t}
                      </text>
                  ))}
            {Array.from({ length: marks }, (_, i) => {
                const mx = small ? x - w / 2 + 5 + i * 8 : x - w / 2 + 12 + i * 22;
                const my = y + h / 2 - (small ? 6 : 14);
                const s = small ? 0.4 : 1;
                return (
                    <path
                        key={i}
                        d={`M ${mx} ${my} q ${5 * s} ${-9 * s} ${8 * s} 0 t ${8 * s} 0`}
                        fill="none"
                        strokeWidth={1.5}
                        className="stroke-ink-primary"
                    />
                );
            })}
        </g>
    );
}

/** A padlock: a bond, locked or open, drawn to a size. */
export function Padlock({ x, y, size, open, label }: { x: number; y: number; size: number; open?: boolean; label?: string }) {
    const w = 14 * size;
    const h = 11 * size;
    const r = 5 * size;
    return (
        <g>
            <path
                d={open ? `M ${x - r} ${y - h / 2} v ${-r} a ${r} ${r} 0 0 1 ${2 * r} 0 v ${r * 0.4}` : `M ${x - r} ${y - h / 2} v ${-r} a ${r} ${r} 0 0 1 ${2 * r} 0 v ${r}`}
                fill="none"
                strokeWidth={1.5}
                className="stroke-ink-primary"
            />
            <rect x={x - w / 2} y={y - h / 2} width={w} height={h} rx={1.5} strokeWidth={1.5} className={open ? "fill-paper stroke-ink-muted" : "fill-ink-primary stroke-ink-primary"} />
            {label && (
                <text x={x} y={y + h / 2 + 13} textAnchor="middle" fontSize={11} className="fill-ink-muted">
                    {label}
                </text>
            )}
        </g>
    );
}

export function Arrow({ from, to, id, label, labelX }: { from: readonly [number, number]; to: readonly [number, number]; id: string; label?: string; labelX?: number }) {
    return (
        <g>
            <line x1={from[0]} y1={from[1]} x2={to[0]} y2={to[1]} strokeWidth={1.5} className="stroke-ink-muted" markerEnd={`url(#${id})`} />
            {label && (
                <text x={labelX ?? (from[0] + to[0]) / 2} y={Math.min(from[1], to[1]) - 8} textAnchor="middle" fontSize={12} className="fill-ink-heading">
                    {label}
                </text>
            )}
        </g>
    );
}

/** A tick: the buyer's close. */
export function Tick({ x, y }: { x: number; y: number }) {
    return <path d={`M ${x - 8} ${y} l 6 6 l 12 -13`} fill="none" strokeWidth={2.5} className="stroke-ink-primary" />;
}

const VIEWBOX = "0 20 400 200";

export function Panel({ idPrefix, n, title, desc, caption, children }: { idPrefix: string; n: number; title: string; desc: string; caption: string; children: ReactNode }) {
    return (
        <FigureFrame idPrefix={`${idPrefix}-${n}`} viewBox={VIEWBOX} title={title} desc={desc} caption={`${n}. ${caption}`} frameClassName="w-full max-w-xl mx-auto">
            <defs>
                <ArrowMarker id={`${idPrefix}-${n}-arrow`} />
            </defs>
            {children}
        </FigureFrame>
    );
}

