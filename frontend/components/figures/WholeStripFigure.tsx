import { Arrow, Padlock, Panel, Person, ROW_Y, Sheet, Tick, WALLET_R, Wallet } from "@/components/figures/stripParts";

/**
 * The whole of Figaro, as six numbered pictures in the trade strip's own
 * language — the home's one picture. Five parts and the loop that joins
 * them: wallets, each its own, inside the communities it belongs to; terms,
 * written once and published; a process, signed and bonded before the work;
 * paid at once when the buyer confirms; the evidence, kept by each party and
 * read by a court, the books, a market; and the count of resolved processes
 * that rewards the designer whose terms ran, which brings more terms. No
 * number, no product, captions of at most three words. Each frame renders
 * on its own (`WholeStripFrame`) so the page can set its claim beside it.
 */

const X = [60, 130, 200, 270, 340] as const;

/** A public shelf of terms: the registry, drawn as three sheets standing. */
function Shelf({ x, y }: { x: number; y: number }) {
    return (
        <g>
            <rect x={x - 40} y={y - 32} width={80} height={64} rx={2} strokeWidth={1.5} className="fill-paper stroke-ink-primary" />
            {[-24, -6, 12].map((dx) => (
                <rect key={dx} x={x + dx} y={y - 22} width={12} height={44} rx={1} strokeWidth={1.2} className="fill-paper stroke-ink-primary" />
            ))}
        </g>
    );
}

/** A sheet of terms being written: the designer's, with its rules. */
function RuledSheet({ x, y }: { x: number; y: number }) {
    return (
        <g>
            <rect x={x - 32} y={y - 42} width={64} height={84} rx={2} strokeWidth={1.5} className="fill-paper stroke-ink-primary" />
            {[0, 1, 2, 3].map((i) => (
                <line key={i} x1={x - 20} y1={y - 24 + i * 14} x2={x + 20} y2={y - 24 + i * 14} strokeWidth={1} className="stroke-ink-muted" />
            ))}
        </g>
    );
}

/** A reader of the evidence, named by its function. */
function Reader({ x, y, word }: { x: number; y: number; word: string }) {
    return (
        <g>
            <circle cx={x} cy={y} r={15} strokeWidth={1.5} className="fill-paper stroke-ink-primary" />
            <text x={x} y={y + 28} textAnchor="middle" fontSize={11} className="fill-ink-muted">
                {word}
            </text>
        </g>
    );
}

export function WholeStripFrame({ n, idPrefix = "whole-strip" }: { n: number; idPrefix?: string }) {
    const arrow = (k: number) => `${idPrefix}-${k}-arrow`;
    const lines = ["", " "] as const;
    switch (n) {
        case 1:
            return (
                <Panel idPrefix={idPrefix} n={1} title="Wallets, each its own" desc="Five wallets side by side, a person's or a machine's, each trading for itself. Two rings pass through them: the communities a wallet belongs to, chosen by the token it holds and the processes it takes part in." caption="Every wallet, itself.">
                    <circle cx={X[1]} cy={ROW_Y} r={84} fill="none" strokeWidth={2} className="stroke-ink-primary" />
                    <circle cx={X[3]} cy={ROW_Y} r={84} fill="none" strokeWidth={0.75} className="stroke-ink-primary" />
                    <Person x={X[0]} y={ROW_Y} />
                    <Wallet x={X[1]} y={ROW_Y} />
                    <Wallet x={X[2]} y={ROW_Y} />
                    <Person x={X[3]} y={ROW_Y} />
                    <Wallet x={X[4]} y={ROW_Y} />
                </Panel>
            );
        case 2:
            return (
                <Panel idPrefix={idPrefix} n={2} title="Terms, published" desc="A designer's wallet on the left writes one sheet of terms; an arrow carries the sheet to a public shelf on the right, where it stands beside others for any wallet to trade on." caption="Terms, published.">
                    <Person x={70} y={ROW_Y} />
                    <line x1={70 + WALLET_R} y1={ROW_Y} x2={168} y2={ROW_Y} strokeWidth={1.5} className="stroke-ink-muted" />
                    <RuledSheet x={200} y={ROW_Y} />
                    <Arrow id={arrow(2)} from={[236, ROW_Y]} to={[286, ROW_Y]} />
                    <Shelf x={330} y={ROW_Y} />
                </Panel>
            );
        case 3:
            return (
                <Panel idPrefix={idPrefix} n={3} title="Signed and bonded before the work" desc="Two sellers' wallets and the buyer's, each joined by one line to a signed sheet of terms above them, and a padlock beside each wallet: every party locks a bond before any work begins." caption="Each locks a bond.">
                    <line x1={X[0] + 10} y1={ROW_Y - 8} x2={200 - 12} y2={ROW_Y - 62} strokeWidth={1.5} className="stroke-ink-muted" />
                    <line x1={200} y1={ROW_Y - 44} x2={200} y2={ROW_Y - 30} strokeWidth={1.5} className="stroke-ink-muted" />
                    <line x1={X[4] - 10} y1={ROW_Y - 8} x2={200 + 12} y2={ROW_Y - 62} strokeWidth={1.5} className="stroke-ink-muted" />
                    <Sheet x={200} y={ROW_Y - 64} lines={lines} marks={3} small />
                    <Wallet x={X[0]} y={ROW_Y} />
                    <Wallet x={X[2]} y={ROW_Y} />
                    <Person x={X[4]} y={ROW_Y} />
                    <Padlock x={X[0]} y={ROW_Y + 52} size={1.4} />
                    <Padlock x={X[2]} y={ROW_Y + 52} size={1.6} />
                    <Padlock x={X[4]} y={ROW_Y + 52} size={1.6} />
                </Panel>
            );
        case 4:
            return (
                <Panel idPrefix={idPrefix} n={4} title="Paid at once" desc="The buyer ticks the trade confirmed. In the same moment an arrow runs from the buyer to each seller, and every padlock opens." caption="Paid at once.">
                    <Wallet x={X[0]} y={ROW_Y} />
                    <Wallet x={X[2]} y={ROW_Y} />
                    <Person x={X[4]} y={ROW_Y} />
                    <Tick x={X[4]} y={ROW_Y - 44} />
                    <Arrow id={arrow(4)} from={[X[4] - WALLET_R - 4, ROW_Y - 10]} to={[X[2] + WALLET_R + 4, ROW_Y - 10]} />
                    <Arrow id={arrow(4)} from={[X[4] - 18, ROW_Y + 36]} to={[X[0] + WALLET_R + 4, ROW_Y + 36]} />
                    <Padlock x={X[0]} y={ROW_Y + 62} size={1.4} open />
                    <Padlock x={X[2]} y={ROW_Y + 62} size={1.6} open />
                    <Padlock x={X[4]} y={ROW_Y + 62} size={1.6} open />
                </Panel>
            );
        case 5:
            return (
                <Panel idPrefix={idPrefix} n={5} title="The evidence, yours" desc="The signed sheet, one copy beside each of the three wallets, and under them three readers of it: a court, the books, a market." caption="The evidence, yours.">
                    <Wallet x={X[0]} y={ROW_Y - 36} />
                    <Wallet x={X[2]} y={ROW_Y - 36} />
                    <Person x={X[4]} y={ROW_Y - 36} />
                    <Sheet x={X[0]} y={ROW_Y + 16} lines={lines} marks={3} small />
                    <Sheet x={X[2]} y={ROW_Y + 16} lines={lines} marks={3} small />
                    <Sheet x={X[4]} y={ROW_Y + 16} lines={lines} marks={3} small />
                    <Arrow id={arrow(5)} from={[X[0], ROW_Y + 38]} to={[X[0], ROW_Y + 56]} />
                    <Arrow id={arrow(5)} from={[X[2], ROW_Y + 38]} to={[X[2], ROW_Y + 56]} />
                    <Arrow id={arrow(5)} from={[X[4], ROW_Y + 38]} to={[X[4], ROW_Y + 56]} />
                    <Reader x={X[0]} y={ROW_Y + 74} word="court" />
                    <Reader x={X[2]} y={ROW_Y + 74} word="books" />
                    <Reader x={X[4]} y={ROW_Y + 74} word="market" />
                </Panel>
            );
        default:
            return (
                <Panel idPrefix={idPrefix} n={6} title="Counted, rewarded" desc="On the left, three resolved sheets, each ticked, and a tally under them: every resolved process is counted. An arrow carries a reward from the count to the designer's wallet, and from the designer a line runs to the public shelf: more terms." caption="Counted, rewarded.">
                    {[0, 1, 2].map((i) => (
                        <g key={i}>
                            <Sheet x={44 + i * 36} y={ROW_Y - 20} lines={lines} marks={3} small />
                            <Tick x={44 + i * 36} y={ROW_Y - 26} />
                        </g>
                    ))}
                    <line x1={26} y1={ROW_Y + 12} x2={134} y2={ROW_Y + 12} strokeWidth={1.5} className="stroke-ink-primary" />
                    {[0, 1, 2, 3, 4].map((i) => (
                        <line key={i} x1={40 + i * 20} y1={ROW_Y + 4} x2={40 + i * 20} y2={ROW_Y + 20} strokeWidth={1.5} className="stroke-ink-primary" />
                    ))}
                    <Arrow id={arrow(6)} from={[142, ROW_Y]} to={[200 - WALLET_R - 4, ROW_Y]} />
                    <Person x={200} y={ROW_Y} />
                    <Arrow id={arrow(6)} from={[200 + WALLET_R + 4, ROW_Y]} to={[286, ROW_Y]} />
                    <Shelf x={330} y={ROW_Y} />
                </Panel>
            );
    }
}
