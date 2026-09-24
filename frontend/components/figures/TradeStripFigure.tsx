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

/** One of the three strangers: its pictogram and the word the descriptions use. */
interface StripPart {
    icon: (props: { x: number; y: number }) => ReactNode;
    word: string;
}

export interface TradeStripFigureProps extends BaseFigureProps {
    /** The two payments, in the token's own units, as printed: the maker's, then the carrier's. */
    kitchenPayment?: string;
    courierPayment?: string;
    /** The three strangers: who makes, who carries, who buys. The meal by default. */
    cast?: { maker: StripPart; carrier: StripPart; buyer: StripPart };
}

const HOUSE_X = 330;
const POT_X = 70;
const BIKE_X = 200;
const ROW_Y = 110;
const WALLET_R = 26;

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

/** A wallet drawn as a chef's hat: the kitchen. */
function ChefHat({ x, y }: { x: number; y: number }) {
    return (
        <g>
            <circle cx={x} cy={y} r={WALLET_R} strokeWidth={1.5} className="fill-paper stroke-ink-primary" />
            <path
                d={`M ${x - 9} ${y + 4} v -6 a 6 6 0 0 1 -3 -11 a 7 7 0 0 1 12 -4 a 7 7 0 0 1 12 4 a 6 6 0 0 1 -3 11 v 6 z`}
                strokeWidth={1.5}
                strokeLinejoin="round"
                className="fill-paper stroke-ink-primary"
            />
            <rect x={x - 9} y={y + 4} width={18} height={7} rx={1} strokeWidth={1.5} className="fill-paper stroke-ink-primary" />
        </g>
    );
}

/** A wallet drawn as a bicycle: the courier. */
function Bicycle({ x, y }: { x: number; y: number }) {
    return (
        <g>
            <circle cx={x} cy={y} r={WALLET_R} strokeWidth={1.5} className="fill-paper stroke-ink-primary" />
            <circle cx={x - 10} cy={y + 6} r={7} fill="none" strokeWidth={1.5} className="stroke-ink-primary" />
            <circle cx={x + 10} cy={y + 6} r={7} fill="none" strokeWidth={1.5} className="stroke-ink-primary" />
            <path d={`M ${x - 10} ${y + 6} L ${x - 4} ${y - 4} L ${x + 6} ${y - 4} L ${x + 10} ${y + 6} L ${x - 1} ${y + 6} L ${x - 4} ${y - 4}`} fill="none" strokeWidth={1.5} strokeLinejoin="round" className="stroke-ink-primary" />
            <path d={`M ${x + 6} ${y - 4} L ${x + 4} ${y - 9} h 5 M ${x - 4} ${y - 4} l -2 -4 h -4`} fill="none" strokeWidth={1.5} className="stroke-ink-primary" />
        </g>
    );
}

/** A wallet drawn as a warehouse: crates under a roof. */
function Warehouse({ x, y }: { x: number; y: number }) {
    return (
        <g>
            <circle cx={x} cy={y} r={WALLET_R} strokeWidth={1.5} className="fill-paper stroke-ink-primary" />
            <path d={`M ${x - 14} ${y - 2} L ${x} ${y - 12} L ${x + 14} ${y - 2}`} fill="none" strokeWidth={1.5} strokeLinejoin="round" className="stroke-ink-primary" />
            <rect x={x - 11} y={y - 1} width={9} height={7} strokeWidth={1.5} className="fill-paper stroke-ink-primary" />
            <rect x={x + 2} y={y - 1} width={9} height={7} strokeWidth={1.5} className="fill-paper stroke-ink-primary" />
            <rect x={x - 4.5} y={y + 6} width={9} height={7} strokeWidth={1.5} className="fill-paper stroke-ink-primary" />
        </g>
    );
}

/** A wallet drawn as a truck: the haulier. */
function Truck({ x, y }: { x: number; y: number }) {
    return (
        <g>
            <circle cx={x} cy={y} r={WALLET_R} strokeWidth={1.5} className="fill-paper stroke-ink-primary" />
            <rect x={x - 15} y={y - 8} width={18} height={13} strokeWidth={1.5} className="fill-paper stroke-ink-primary" />
            <path d={`M ${x + 3} ${y - 4} h 7 l 5 5 v 4 h -12 z`} strokeWidth={1.5} strokeLinejoin="round" className="fill-paper stroke-ink-primary" />
            <circle cx={x - 9} cy={y + 8} r={3.5} strokeWidth={1.5} className="fill-paper stroke-ink-primary" />
            <circle cx={x + 8} cy={y + 8} r={3.5} strokeWidth={1.5} className="fill-paper stroke-ink-primary" />
        </g>
    );
}

const MEAL_CAST = {
    maker: { icon: ChefHat, word: "the kitchen" },
    carrier: { icon: Bicycle, word: "the courier" },
    buyer: { icon: Person, word: "the buyer" },
} as const;

export const SHIPMENT_CAST = {
    maker: { icon: Warehouse, word: "the warehouse" },
    carrier: { icon: Truck, word: "the haulier" },
    buyer: { icon: Person, word: "the buyer" },
} as const;

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

export function TradeStripFigure({ idPrefix = "trade-strip", className, kitchenPayment = "8.40", courierPayment = "2.10", cast = MEAL_CAST }: TradeStripFigureProps) {
    const Maker = cast.maker.icon;
    const Carrier = cast.carrier.icon;
    const Buyer = cast.buyer.icon;
    const { word: maker } = cast.maker;
    const { word: carrier } = cast.carrier;
    const total = (Number(kitchenPayment) + Number(courierPayment)).toFixed(2);
    const lines = [kitchenPayment, courierPayment] as const;
    const arrow = (n: number) => `${idPrefix}-${n}-arrow`;
    // Each hand locks twice the value at its link: the maker twice its own
    // line, the carrier twice both lines, the buyer twice each payment.
    const kitchenBond = `2 \u00d7 ${kitchenPayment}`;
    const courierBond = `2 \u00d7 ${total}`;
    const buyerBond = `2 \u00d7 ${total}`;

    return (
        <div className={className}>
            <ol className="flex flex-col gap-y-12 list-none pl-0">
                <li>
                    <Panel idPrefix={idPrefix} n={1} title="Three strangers" desc={`Three wallets side by side: ${maker}, ${carrier}, and the buyer. None has met the others.`} caption="Three strangers.">
                        <Maker x={POT_X} y={ROW_Y} />
                        <Carrier x={BIKE_X} y={ROW_Y} />
                        <Buyer x={HOUSE_X} y={ROW_Y} />
                    </Panel>
                </li>
                <li>
                    <Panel idPrefix={idPrefix} n={2} title="Signed before the work" desc={`One sheet of terms with two lines, ${kitchenPayment} for ${maker} and ${courierPayment} for ${carrier}, and three signatures at its foot. Each wallet is joined to the sheet by one line.`} caption="Signed before.">
                        <line x1={POT_X + WALLET_R} y1={ROW_Y} x2={BIKE_X - 42} y2={ROW_Y} strokeWidth={1.5} className="stroke-ink-muted" />
                        <line x1={BIKE_X + 42} y1={ROW_Y} x2={HOUSE_X - WALLET_R} y2={ROW_Y} strokeWidth={1.5} className="stroke-ink-muted" />
                        <line x1={BIKE_X} y1={ROW_Y + 54} x2={BIKE_X} y2={ROW_Y + 70} strokeWidth={1.5} className="stroke-ink-muted" />
                        <Maker x={POT_X} y={ROW_Y} />
                        <Buyer x={HOUSE_X} y={ROW_Y} />
                        <Sheet x={BIKE_X} y={ROW_Y} lines={lines} marks={3} />
                        <Carrier x={BIKE_X} y={ROW_Y + 96} />
                    </Panel>
                </li>
                <li>
                    <Panel idPrefix={idPrefix} n={3} title="Each locks a bond" desc={`A padlock beside each wallet, sized to what it locked, and the rule under each: ${maker} twice its own line (${kitchenBond}), ${carrier} twice both lines (${courierBond}), the buyer the same (${buyerBond}).`} caption="Each locks a bond.">
                        <Maker x={POT_X} y={ROW_Y - 20} />
                        <Carrier x={BIKE_X} y={ROW_Y - 20} />
                        <Buyer x={HOUSE_X} y={ROW_Y - 20} />
                        <Padlock x={POT_X} y={ROW_Y + 42} size={1.4} label={kitchenBond} />
                        <Padlock x={BIKE_X} y={ROW_Y + 42} size={1.7} label={courierBond} />
                        <Padlock x={HOUSE_X} y={ROW_Y + 42} size={1.7} label={buyerBond} />
                    </Panel>
                </li>
                <li>
                    <Panel idPrefix={idPrefix} n={4} title="The work" desc={`The goods go from ${maker} to ${carrier}, and from ${carrier} to the buyer: two arrows.`} caption="The work.">
                        <Maker x={POT_X} y={ROW_Y} />
                        <Carrier x={BIKE_X} y={ROW_Y} />
                        <Buyer x={HOUSE_X} y={ROW_Y} />
                        <Arrow id={arrow(4)} from={[POT_X + WALLET_R + 4, ROW_Y]} to={[BIKE_X - WALLET_R - 4, ROW_Y]} />
                        <Arrow id={arrow(4)} from={[BIKE_X + WALLET_R + 4, ROW_Y]} to={[HOUSE_X - WALLET_R - 4, ROW_Y]} />
                    </Panel>
                </li>
                <li>
                    <Panel idPrefix={idPrefix} n={5} title="Paid at once" desc={`The buyer ticks the trade confirmed. In the same moment ${kitchenPayment} goes to ${maker}, ${courierPayment} goes to ${carrier}, and every padlock opens.`} caption="Paid at once.">
                        <Maker x={POT_X} y={ROW_Y - 20} />
                        <Carrier x={BIKE_X} y={ROW_Y - 20} />
                        <Buyer x={HOUSE_X} y={ROW_Y - 20} />
                        <Tick x={HOUSE_X} y={ROW_Y - 62} />
                        <Arrow id={arrow(5)} from={[HOUSE_X - WALLET_R - 4, ROW_Y - 28]} to={[BIKE_X + WALLET_R + 4, ROW_Y - 28]} label={courierPayment} />
                        {/* The maker's payment runs under the row, clear of the carrier, and its number sits beside the maker. */}
                        <Arrow id={arrow(5)} from={[HOUSE_X - 18, ROW_Y + 16]} to={[POT_X + WALLET_R + 4, ROW_Y + 16]} label={kitchenPayment} labelX={POT_X + WALLET_R + 26} />
                        <Padlock x={POT_X} y={ROW_Y + 42} size={1.4} open />
                        <Padlock x={BIKE_X} y={ROW_Y + 42} size={1.7} open />
                        <Padlock x={HOUSE_X} y={ROW_Y + 42} size={1.7} open />
                    </Panel>
                </li>
                <li>
                    <Panel idPrefix={idPrefix} n={6} title="The evidence, yours" desc="The signed sheet, one copy beside each wallet: what was agreed, delivered and paid, kept by each of the three." caption="The evidence, yours.">
                        <Maker x={POT_X} y={ROW_Y - 20} />
                        <Carrier x={BIKE_X} y={ROW_Y - 20} />
                        <Buyer x={HOUSE_X} y={ROW_Y - 20} />
                        <Sheet x={POT_X} y={ROW_Y + 44} lines={lines} marks={3} small />
                        <Sheet x={BIKE_X} y={ROW_Y + 44} lines={lines} marks={3} small />
                        <Sheet x={HOUSE_X} y={ROW_Y + 44} lines={lines} marks={3} small />
                    </Panel>
                </li>
            </ol>
        </div>
    );
}
