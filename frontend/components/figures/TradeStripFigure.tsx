import type { ReactNode } from "react";
import type { BaseFigureProps } from "@/components/figures/BaseFigureProps";
import { FigureFrame } from "@/components/figures/FigureFrame";
import { ArrowMarker } from "@/components/figures/ArrowMarker";

/**
 * One trade, start to finish, as six numbered pictures in one column — a
 * strip a reader follows without reading. Three wallets — two sellers and the
 * buyer, drawn as wallets and a person, never as a trade — one sheet of terms,
 * one padlock per bond, and two plain numbers. Words appear only as captions,
 * at most three each. Any trade where value is added twice and confirmed once
 * is this strip; no kind of trade is its model. The arithmetic behind the
 * padlocks belongs to `StackedBondChainFigure`.
 *
 * The panels share one 400 × 220 coordinate space. Each is its own
 * `FigureFrame`, so each carries its own accessible title and description.
 */

export interface TradeStripFigureProps extends BaseFigureProps {
    /** The two payments, in the token's own units, as printed: the first seller's, then the second's. */
    firstPayment?: string;
    secondPayment?: string;
}

const BUYER_X = 330;
const FIRST_X = 70;
const SECOND_X = 200;
const ROW_Y = 110;
const WALLET_R = 26;

const FIRST = "the first seller";
const SECOND = "the second seller";

/** A wallet drawn as a person: the buyer. */
function Person({ x, y }: { x: number; y: number }) {
    return (
        <g>
            <circle cx={x} cy={y} r={WALLET_R} strokeWidth={1.5} className="fill-paper stroke-ink-primary" />
            <circle cx={x} cy={y - 7} r={6} strokeWidth={1.5} className="fill-paper stroke-ink-primary" />
            <path d={`M ${x - 13} ${y + 14} a 13 12 0 0 1 26 0 z`} strokeWidth={1.5} className="fill-paper stroke-ink-primary" />
        </g>
    );
}

/** A wallet drawn as a wallet: a seller, whatever it sells. */
function Wallet({ x, y }: { x: number; y: number }) {
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
function Sheet({ x, y, lines, marks, small }: { x: number; y: number; lines: readonly string[]; marks: number; small?: boolean }) {
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
function Padlock({ x, y, size, open, label }: { x: number; y: number; size: number; open?: boolean; label?: string }) {
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

function Arrow({ from, to, id, label, labelX }: { from: readonly [number, number]; to: readonly [number, number]; id: string; label?: string; labelX?: number }) {
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
function Tick({ x, y }: { x: number; y: number }) {
    return <path d={`M ${x - 8} ${y} l 6 6 l 12 -13`} fill="none" strokeWidth={2.5} className="stroke-ink-primary" />;
}

const VIEWBOX = "0 20 400 200";

function Panel({ idPrefix, n, title, desc, caption, children }: { idPrefix: string; n: number; title: string; desc: string; caption: string; children: ReactNode }) {
    return (
        <FigureFrame idPrefix={`${idPrefix}-${n}`} viewBox={VIEWBOX} title={title} desc={desc} caption={`${n}. ${caption}`} frameClassName="w-full max-w-xl mx-auto">
            <defs>
                <ArrowMarker id={`${idPrefix}-${n}-arrow`} />
            </defs>
            {children}
        </FigureFrame>
    );
}

export function TradeStripFigure({ idPrefix = "trade-strip", className, firstPayment = "100", secondPayment = "40" }: TradeStripFigureProps) {
    const sum = Number(firstPayment) + Number(secondPayment);
    const total = Number.isInteger(sum) ? String(sum) : sum.toFixed(2);
    const lines = [firstPayment, secondPayment] as const;
    const arrow = (n: number) => `${idPrefix}-${n}-arrow`;
    // Each hand locks twice the value at its link: the first seller twice its own
    // line, the second twice both lines, the buyer twice each payment.
    const firstBond = `2 \u00d7 ${firstPayment}`;
    const secondBond = `2 \u00d7 ${total}`;
    const buyerBond = `2 \u00d7 ${total}`;

    return (
        <div className={className}>
            <ol className="flex flex-col gap-y-12 list-none pl-0">
                <li>
                    <Panel idPrefix={idPrefix} n={1} title="Three strangers" desc={`Three wallets side by side: ${FIRST}, ${SECOND}, and the buyer. None has met the others.`} caption="Three strangers.">
                        <Wallet x={FIRST_X} y={ROW_Y} />
                        <Wallet x={SECOND_X} y={ROW_Y} />
                        <Person x={BUYER_X} y={ROW_Y} />
                    </Panel>
                </li>
                <li>
                    <Panel idPrefix={idPrefix} n={2} title="Signed before the work" desc={`One sheet of terms with two lines, ${firstPayment} for ${FIRST} and ${secondPayment} for ${SECOND}, and three signatures at its foot. Each wallet is joined to the sheet by one line.`} caption="Signed before.">
                        <line x1={FIRST_X + WALLET_R} y1={ROW_Y} x2={SECOND_X - 42} y2={ROW_Y} strokeWidth={1.5} className="stroke-ink-muted" />
                        <line x1={SECOND_X + 42} y1={ROW_Y} x2={BUYER_X - WALLET_R} y2={ROW_Y} strokeWidth={1.5} className="stroke-ink-muted" />
                        <line x1={SECOND_X} y1={ROW_Y + 54} x2={SECOND_X} y2={ROW_Y + 70} strokeWidth={1.5} className="stroke-ink-muted" />
                        <Wallet x={FIRST_X} y={ROW_Y} />
                        <Person x={BUYER_X} y={ROW_Y} />
                        <Sheet x={SECOND_X} y={ROW_Y} lines={lines} marks={3} />
                        <Wallet x={SECOND_X} y={ROW_Y + 96} />
                    </Panel>
                </li>
                <li>
                    <Panel idPrefix={idPrefix} n={3} title="Each locks a bond" desc={`A padlock beside each wallet, sized to what it locked, and the rule under each: ${FIRST} twice its own line (${firstBond}), ${SECOND} twice both lines (${secondBond}), the buyer the same (${buyerBond}).`} caption="Each locks a bond.">
                        <Wallet x={FIRST_X} y={ROW_Y - 20} />
                        <Wallet x={SECOND_X} y={ROW_Y - 20} />
                        <Person x={BUYER_X} y={ROW_Y - 20} />
                        <Padlock x={FIRST_X} y={ROW_Y + 42} size={1.4} label={firstBond} />
                        <Padlock x={SECOND_X} y={ROW_Y + 42} size={1.7} label={secondBond} />
                        <Padlock x={BUYER_X} y={ROW_Y + 42} size={1.7} label={buyerBond} />
                    </Panel>
                </li>
                <li>
                    <Panel idPrefix={idPrefix} n={4} title="The work" desc={`What ${FIRST} made goes to ${SECOND}, and what ${SECOND} added goes on to the buyer: two arrows.`} caption="The work.">
                        <Wallet x={FIRST_X} y={ROW_Y} />
                        <Wallet x={SECOND_X} y={ROW_Y} />
                        <Person x={BUYER_X} y={ROW_Y} />
                        <Arrow id={arrow(4)} from={[FIRST_X + WALLET_R + 4, ROW_Y]} to={[SECOND_X - WALLET_R - 4, ROW_Y]} />
                        <Arrow id={arrow(4)} from={[SECOND_X + WALLET_R + 4, ROW_Y]} to={[BUYER_X - WALLET_R - 4, ROW_Y]} />
                    </Panel>
                </li>
                <li>
                    <Panel idPrefix={idPrefix} n={5} title="Paid at once" desc={`The buyer ticks the trade confirmed. In the same moment ${firstPayment} goes to ${FIRST}, ${secondPayment} goes to ${SECOND}, and every padlock opens.`} caption="Paid at once.">
                        <Wallet x={FIRST_X} y={ROW_Y - 20} />
                        <Wallet x={SECOND_X} y={ROW_Y - 20} />
                        <Person x={BUYER_X} y={ROW_Y - 20} />
                        <Tick x={BUYER_X} y={ROW_Y - 62} />
                        <Arrow id={arrow(5)} from={[BUYER_X - WALLET_R - 4, ROW_Y - 28]} to={[SECOND_X + WALLET_R + 4, ROW_Y - 28]} label={secondPayment} />
                        {/* The first seller's payment runs under the row, clear of the second, and its number sits beside it. */}
                        <Arrow id={arrow(5)} from={[BUYER_X - 18, ROW_Y + 16]} to={[FIRST_X + WALLET_R + 4, ROW_Y + 16]} label={firstPayment} labelX={FIRST_X + WALLET_R + 26} />
                        <Padlock x={FIRST_X} y={ROW_Y + 42} size={1.4} open />
                        <Padlock x={SECOND_X} y={ROW_Y + 42} size={1.7} open />
                        <Padlock x={BUYER_X} y={ROW_Y + 42} size={1.7} open />
                    </Panel>
                </li>
                <li>
                    <Panel idPrefix={idPrefix} n={6} title="The evidence, yours" desc="The signed sheet, one copy beside each wallet: what was agreed, delivered and paid, kept by each of the three." caption="The evidence, yours.">
                        <Wallet x={FIRST_X} y={ROW_Y - 20} />
                        <Wallet x={SECOND_X} y={ROW_Y - 20} />
                        <Person x={BUYER_X} y={ROW_Y - 20} />
                        <Sheet x={FIRST_X} y={ROW_Y + 44} lines={lines} marks={3} small />
                        <Sheet x={SECOND_X} y={ROW_Y + 44} lines={lines} marks={3} small />
                        <Sheet x={BUYER_X} y={ROW_Y + 44} lines={lines} marks={3} small />
                    </Panel>
                </li>
            </ol>
        </div>
    );
}
