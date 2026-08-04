import type { SVGProps } from "react";
import { cn } from "@/lib/shared/utils";

export interface StackedBondChainFigureProps {
    /** Base id for the accessible <title>/<desc> pair. Override when embedding
     *  more than one instance on the same page to avoid id collisions. */
    idPrefix?: string;
    /** Merged onto the outer <figure>. Default width is a sensible content-figure
     *  measure (`max-w-xl mx-auto`); override to fit a specific page's rail. */
    className?: string;
    svgProps?: SVGProps<SVGSVGElement>;
}

// The /local-commerce worked example (frontend/app/(marketing)/local-commerce/page.tsx):
// "8.40 to the kitchen, 2.10 to the courier, 0.30 to the farm". Reused verbatim so
// the site keeps one consistent worked example. Order is load-bearing, not
// editorial: the page states the courier's stake rides on "food and delivery
// both" — i.e. at the courier's node cumulative value is exactly kitchen+courier,
// with no farm yet — which only holds if the farm commits AFTER the courier.
const LEGS = [
    { name: "Kitchen", role: "root order", payment: 8.4 },
    { name: "Courier", role: "sub-order", payment: 2.1 },
    { name: "Farm", role: "sub-order", payment: 0.3 },
] as const;

// Kernel bond/payout math (src/kernel/FigaroCore.sol, verified against
// docs/CONTRACTS.md): root sellerBond = 2×payment (== 2×cumulativeValue,
// since a root order's expectedCumulativeValue must equal its payment);
// sub-order sellerBond = 2×cumulativeValue; buyerBond = 2×payment on every
// order; resolution sellerPayout = 2×cumulativeValue + payment, buyerPayout
// = payment.
function buildNodes() {
    let cumulative = 0;
    return LEGS.map((leg) => {
        const priorCumulative = cumulative;
        cumulative += leg.payment;
        const sellerBond = 2 * cumulative;
        const buyerBond = 2 * leg.payment;
        const sellerPayout = 2 * cumulative + leg.payment;
        const buyerPayout = leg.payment;
        return { ...leg, priorCumulative, cumulative, sellerBond, buyerBond, sellerPayout, buyerPayout };
    });
}

const fmt = (n: number) => n.toFixed(2);

const BAR_X = 24;
const BAR_W = 280;
const BLOCK_H = 164;
const BASE_Y0 = 50;

export function StackedBondChainFigure({
    idPrefix = "stacked-bond-chain",
    className,
    svgProps,
}: StackedBondChainFigureProps) {
    const nodes = buildNodes();
    const totalPayment = nodes[nodes.length - 1].cumulative;
    const maxBond = nodes[nodes.length - 1].sellerBond; // == 2 × totalPayment
    const pxPerUnit = BAR_W / maxBond;

    const titleId = `${idPrefix}-title`;
    const descId = `${idPrefix}-desc`;

    const viewHeight = BASE_Y0 + nodes.length * BLOCK_H + 56;

    return (
        <figure className={cn("w-full max-w-xl mx-auto", className)}>
            <svg
                viewBox={`0 0 400 ${viewHeight}`}
                role="img"
                aria-labelledby={`${titleId} ${descId}`}
                className="w-full h-auto"
                style={{ maxWidth: "100%" }}
                {...svgProps}
            >
                <title id={titleId}>Stacked bond chain: kitchen, courier, farm</title>
                <desc id={descId}>
                    A three-order value chain from the local-commerce worked
                    example: kitchen paid 8.40 as the root order, courier paid
                    2.10 as a sub-order, farm paid 0.30 as a sub-order. Each
                    seller&apos;s bond is twice the cumulative value at their
                    node, not just their own payment, so the farm — paid the
                    least — still stakes against the whole 10.80 chain.
                    Resolution is atomic across all three orders.
                </desc>

                {/* Legend */}
                <rect x="24" y="18" width="14" height="10" rx="2" className="fill-subtle-hover stroke-default" strokeWidth="0.5" />
                <text x="42" y="27" fontSize="9" className="fill-ink-muted">already staked (upstream orders)</text>
                <rect x="24" y="34" width="14" height="10" rx="2" className="fill-ink-heading" />
                <text x="42" y="43" fontSize="9" className="fill-ink-muted">this order&apos;s own payment</text>

                {nodes.map((node, i) => {
                    const baseY = BASE_Y0 + 20 + i * BLOCK_H;
                    const priorW = node.priorCumulative * pxPerUnit;
                    const ownW = node.payment * pxPerUnit;
                    const bondW = node.sellerBond * pxPerUnit;

                    return (
                        <g key={node.name}>
                            <text x="24" y={baseY} fontSize="13" fontWeight="600" className="fill-ink-heading">
                                {i + 1} · {node.name} — {node.role}
                            </text>
                            <text x="24" y={baseY + 18} fontSize="11" className="fill-ink-body">
                                payment in: {fmt(node.payment)}
                            </text>

                            <text x="24" y={baseY + 38} fontSize="10" className="fill-ink-body">
                                cumulative value → {fmt(node.cumulative)}
                            </text>
                            <rect x={BAR_X} y={baseY + 44} width={BAR_W} height="10" rx="2" className="fill-none stroke-default" strokeWidth="0.75" />
                            {priorW > 0 && (
                                <rect x={BAR_X} y={baseY + 44} width={priorW} height="10" rx="2" className="fill-subtle-hover" />
                            )}
                            <rect x={BAR_X + priorW} y={baseY + 44} width={ownW} height="10" className="fill-ink-heading" />

                            <text x="24" y={baseY + 70} fontSize="10" className="fill-ink-body">
                                seller bond = 2 × cumulative → {fmt(node.sellerBond)}
                            </text>
                            <rect x={BAR_X} y={baseY + 76} width={BAR_W} height="10" rx="2" className="fill-none stroke-default" strokeWidth="0.75" />
                            <rect x={BAR_X} y={baseY + 76} width={bondW} height="10" className="fill-default-strong" />

                            <text x="24" y={baseY + 100} fontSize="10" className="fill-ink-muted">
                                buyer bond = 2 × payment → {fmt(node.buyerBond)}
                            </text>
                            <text x="24" y={baseY + 116} fontSize="10" className="fill-ink-body">
                                resolves → seller {fmt(node.sellerPayout)} · buyer {fmt(node.buyerPayout)}
                            </text>
                        </g>
                    );
                })}

                <text x="200" y={viewHeight - 24} fontSize="11" textAnchor="middle" className="fill-ink-body">
                    Resolution is atomic — all {nodes.length} orders settle together, or none do.
                </text>
                <text x="200" y={viewHeight - 10} fontSize="10" textAnchor="middle" className="fill-ink-muted">
                    Total payment {fmt(totalPayment)} · buyer paid twice that ({fmt(2 * totalPayment)}) to open the chain
                </text>
            </svg>
            <figcaption className="mt-3 text-center text-sm text-ink-muted">
                Each new contributor stakes against everything ahead of them: the farm
                is paid least (0.30) but bonds most (2 × 10.80 = 21.60) because by the
                time it joins, it is carrying the whole chain&apos;s value, not just its own.
            </figcaption>
        </figure>
    );
}
