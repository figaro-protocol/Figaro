import type { ReactNode } from "react";
import type { BaseFigureProps } from "@/components/figures/BaseFigureProps";
import { FigureFrame } from "@/components/figures/FigureFrame";
import { ArrowMarker } from "@/components/figures/ArrowMarker";

/**
 * One trade, start to finish, as six numbered pictures in one column — a
 * strip a reader follows without reading. Three wallets drawn as what they are to a layman (a house,
 * a pot, a bicycle), one sheet of terms, one padlock per bond, and the two
 * numbers of the meal. Words appear only as captions, at most three each.
 * The arithmetic behind the padlocks belongs to `StackedBondChainFigure`.
 *
 * The panels share one 400 × 220 coordinate space. Each is its own
 * `FigureFrame`, so each carries its own accessible title and description.
 */

export interface TradeStripFigureProps extends BaseFigureProps {
    /** The two payments of the meal, in the token's own units, as printed. */
    kitchenPayment?: string;
    courierPayment?: string;
}

const HOUSE_X = 330;
const POT_X = 70;
const BIKE_X = 200;
const ROW_Y = 110;
const WALLET_R = 26;

/** A wallet drawn as a house: the buyer. */
function House({ x, y }: { x: number; y: number }) {
    return (
        <g>
            <circle cx={x} cy={y} r={WALLET_R} strokeWidth={1.5} className="fill-paper stroke-ink-primary" />
            <path d={`M ${x - 12} ${y + 1} L ${x} ${y - 11} L ${x + 12} ${y + 1}`} fill="none" strokeWidth={1.5} className="stroke-ink-primary" />
            <rect x={x - 9} y={y + 1} width={18} height={11} strokeWidth={1.5} className="fill-paper stroke-ink-primary" />
            <rect x={x - 2.5} y={y + 5} width={5} height={7} className="fill-ink-primary" />
        </g>
    );
}

/** A wallet drawn as a pot: the kitchen. */
function Pot({ x, y }: { x: number; y: number }) {
    return (
        <g>
            <circle cx={x} cy={y} r={WALLET_R} strokeWidth={1.5} className="fill-paper stroke-ink-primary" />
            <path d={`M ${x - 12} ${y - 2} h 24 v 3 a 12 11 0 0 1 -24 0 z`} strokeWidth={1.5} className="fill-paper stroke-ink-primary" />
            <line x1={x - 16} y1={y - 2} x2={x - 12} y2={y - 2} strokeWidth={1.5} className="stroke-ink-primary" />
            <line x1={x + 12} y1={y - 2} x2={x + 16} y2={y - 2} strokeWidth={1.5} className="stroke-ink-primary" />
            <path d={`M ${x - 4} ${y - 12} q 2 -3 0 -6 M ${x + 4} ${y - 12} q 2 -3 0 -6`} fill="none" strokeWidth={1} className="stroke-ink-muted" />
        </g>
    );
}

/** A wallet drawn as a bicycle: the courier. */
function Bicycle({ x, y }: { x: number; y: number }) {
    return (
        <g>
            <circle cx={x} cy={y} r={WALLET_R} strokeWidth={1.5} className="fill-paper stroke-ink-primary" />
            <circle cx={x - 9} cy={y + 5} r={6} fill="none" strokeWidth={1.5} className="stroke-ink-primary" />
            <circle cx={x + 9} cy={y + 5} r={6} fill="none" strokeWidth={1.5} className="stroke-ink-primary" />
            <path d={`M ${x - 9} ${y + 5} L ${x - 3} ${y - 5} L ${x + 5} ${y - 5} L ${x + 9} ${y + 5} L ${x} ${y + 5} L ${x - 3} ${y - 5}`} fill="none" strokeWidth={1.5} className="stroke-ink-primary" />
            <line x1={x + 5} y1={y - 5} x2={x + 3} y2={y - 9} strokeWidth={1.5} className="stroke-ink-primary" />
        </g>
    );
}

/** The sheet of terms, with the meal's two numbers and room for marks. */
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

function Arrow({ from, to, id, label }: { from: readonly [number, number]; to: readonly [number, number]; id: string; label?: string }) {
    return (
        <g>
            <line x1={from[0]} y1={from[1]} x2={to[0]} y2={to[1]} strokeWidth={1.5} className="stroke-ink-muted" markerEnd={`url(#${id})`} />
            {label && (
                <text x={(from[0] + to[0]) / 2} y={Math.min(from[1], to[1]) - 8} textAnchor="middle" fontSize={12} className="fill-ink-heading">
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

export function TradeStripFigure({ idPrefix = "trade-strip", className, kitchenPayment = "8.40", courierPayment = "2.10" }: TradeStripFigureProps) {
    const total = (Number(kitchenPayment) + Number(courierPayment)).toFixed(2);
    const lines = [kitchenPayment, courierPayment] as const;
    const arrow = (n: number) => `${idPrefix}-${n}-arrow`;
    // Each hand locks twice the value at its link: the kitchen twice the meal,
    // the courier twice the meal and the ride, the buyer twice each payment.
    const kitchenBond = `2 \u00d7 ${kitchenPayment}`;
    const courierBond = `2 \u00d7 ${total}`;
    const buyerBond = `2 \u00d7 ${total}`;

    return (
        <div className={className}>
            <ol className="flex flex-col gap-y-12 list-none pl-0">
                <li>
                    <Panel idPrefix={idPrefix} n={1} title="Three strangers" desc="Three wallets side by side: a pot for the kitchen, a bicycle for the courier, a house for the buyer. None has met the others." caption="Three strangers.">
                        <Pot x={POT_X} y={ROW_Y} />
                        <Bicycle x={BIKE_X} y={ROW_Y} />
                        <House x={HOUSE_X} y={ROW_Y} />
                    </Panel>
                </li>
                <li>
                    <Panel idPrefix={idPrefix} n={2} title="Signed before the work" desc={`One sheet of terms with two lines, ${kitchenPayment} for the meal and ${courierPayment} for the ride, and three signatures at its foot. Each wallet is joined to the sheet by one line.`} caption="Signed before.">
                        <line x1={POT_X + WALLET_R} y1={ROW_Y} x2={BIKE_X - 42} y2={ROW_Y} strokeWidth={1.5} className="stroke-ink-muted" />
                        <line x1={BIKE_X + 42} y1={ROW_Y} x2={HOUSE_X - WALLET_R} y2={ROW_Y} strokeWidth={1.5} className="stroke-ink-muted" />
                        <line x1={BIKE_X} y1={ROW_Y + 54} x2={BIKE_X} y2={ROW_Y + 70} strokeWidth={1.5} className="stroke-ink-muted" />
                        <Pot x={POT_X} y={ROW_Y} />
                        <House x={HOUSE_X} y={ROW_Y} />
                        <Sheet x={BIKE_X} y={ROW_Y} lines={lines} marks={3} />
                        <Bicycle x={BIKE_X} y={ROW_Y + 96} />
                    </Panel>
                </li>
                <li>
                    <Panel idPrefix={idPrefix} n={3} title="Each locks a bond" desc={`A padlock beside each wallet, sized to what it locked, and the rule under each: the kitchen twice the meal (${kitchenBond}), the courier twice the meal and the ride (${courierBond}), the buyer the same (${buyerBond}).`} caption="Each locks a bond.">
                        <Pot x={POT_X} y={ROW_Y - 20} />
                        <Bicycle x={BIKE_X} y={ROW_Y - 20} />
                        <House x={HOUSE_X} y={ROW_Y - 20} />
                        <Padlock x={POT_X} y={ROW_Y + 42} size={1.4} label={kitchenBond} />
                        <Padlock x={BIKE_X} y={ROW_Y + 42} size={1.7} label={courierBond} />
                        <Padlock x={HOUSE_X} y={ROW_Y + 42} size={1.7} label={buyerBond} />
                    </Panel>
                </li>
                <li>
                    <Panel idPrefix={idPrefix} n={4} title="The work" desc="The meal goes from the pot to the bicycle, and from the bicycle to the house: two arrows." caption="The work.">
                        <Pot x={POT_X} y={ROW_Y} />
                        <Bicycle x={BIKE_X} y={ROW_Y} />
                        <House x={HOUSE_X} y={ROW_Y} />
                        <Arrow id={arrow(4)} from={[POT_X + WALLET_R + 4, ROW_Y]} to={[BIKE_X - WALLET_R - 4, ROW_Y]} />
                        <Arrow id={arrow(4)} from={[BIKE_X + WALLET_R + 4, ROW_Y]} to={[HOUSE_X - WALLET_R - 4, ROW_Y]} />
                    </Panel>
                </li>
                <li>
                    <Panel idPrefix={idPrefix} n={5} title="Paid at once" desc={`The buyer ticks the trade closed. In the same moment ${kitchenPayment} goes to the kitchen, ${courierPayment} goes to the courier, and every padlock opens.`} caption="Paid at once.">
                        <Pot x={POT_X} y={ROW_Y - 20} />
                        <Bicycle x={BIKE_X} y={ROW_Y - 20} />
                        <House x={HOUSE_X} y={ROW_Y - 20} />
                        <Tick x={HOUSE_X} y={ROW_Y - 62} />
                        <Arrow id={arrow(5)} from={[HOUSE_X - WALLET_R - 4, ROW_Y - 28]} to={[BIKE_X + WALLET_R + 4, ROW_Y - 28]} label={courierPayment} />
                        <Arrow id={arrow(5)} from={[HOUSE_X - WALLET_R - 4, ROW_Y - 8]} to={[POT_X + WALLET_R + 4, ROW_Y - 8]} label={kitchenPayment} />
                        <Padlock x={POT_X} y={ROW_Y + 42} size={1.4} open />
                        <Padlock x={BIKE_X} y={ROW_Y + 42} size={1.7} open />
                        <Padlock x={HOUSE_X} y={ROW_Y + 42} size={1.7} open />
                    </Panel>
                </li>
                <li>
                    <Panel idPrefix={idPrefix} n={6} title="The evidence, yours" desc="The signed sheet, one copy beside each wallet: what was agreed, delivered and paid, kept by each of the three." caption="The evidence, yours.">
                        <Pot x={POT_X} y={ROW_Y - 20} />
                        <Bicycle x={BIKE_X} y={ROW_Y - 20} />
                        <House x={HOUSE_X} y={ROW_Y - 20} />
                        <Sheet x={POT_X} y={ROW_Y + 44} lines={lines} marks={3} small />
                        <Sheet x={BIKE_X} y={ROW_Y + 44} lines={lines} marks={3} small />
                        <Sheet x={HOUSE_X} y={ROW_Y + 44} lines={lines} marks={3} small />
                    </Panel>
                </li>
            </ol>
        </div>
    );
}
