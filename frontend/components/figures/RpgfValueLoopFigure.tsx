import Link from "next/link";
import type { BaseFigureProps } from "@/components/figures/BaseFigureProps";
import { FigureFrame } from "@/components/figures/FigureFrame";

/** Same fields as every content figure; `idPrefix` also seeds this figure's
 *  arrow-marker id. */
export type RpgfValueLoopFigureProps = BaseFigureProps;

// The deposit rationale, drawn. Source of truth for the mechanic:
// docs/PUBLIC_GRAPH_MODEL.md § "Neutrality comes from the stake, not from the
// weight" — the ETH stake is a value loop, not a cost: more trade means more
// base-currency demand for gas, aligned upside for every registry staker. The
// neighboring § "What the stake does and does not do" BOUNDS the wording here:
// appreciation aligns, it is never promised — keep step/caption text at or
// below that strength. Public derivation: /papers/substrate-broadening-rpgf.
const STEPS = [
    { title: "Stake ETH to register", detail: "your clauses and assemblies go live" },
    { title: "Real trade uses them", detail: "settled deals carry your work" },
    { title: "Every deal pays gas in ETH", detail: "demand for the currency you staked" },
    { title: "Your stake rides that demand", detail: "exposure to the growth you created" },
] as const;

const BOX_W = 230;
const BOX_H = 66;
// 2×2 loop, clockwise from top-left.
const BOXES = [
    { x: 20, y: 35 },
    { x: 310, y: 35 },
    { x: 310, y: 150 },
    { x: 20, y: 150 },
] as const;

export function RpgfValueLoopFigure({
    idPrefix = "rpgf-value-loop",
    className,
    svgProps,
}: RpgfValueLoopFigureProps) {
    const markerId = `${idPrefix}-arrow`;

    return (
        <FigureFrame
            idPrefix={idPrefix}
            className={className}
            svgProps={svgProps}
            viewBox="0 0 560 251"
            frameClassName="w-full max-w-xl mx-auto mt-8"
            svgClassName="text-ink-body"
            title={<>The registration deposit&apos;s value loop</>}
            desc={
                <>
                    Four steps in a closed loop: stake ETH to register, real trade
                    uses your clauses and assemblies, every deal pays gas in ETH,
                    and your stake rides that demand &mdash; exposure to the growth
                    your own work creates.
                </>
            }
            caption={
                <>
                    The registration deposit is a value loop, not a fee: the same real
                    trade that pays your work drives demand for the currency you staked.
                    The full derivation is in{" "}
                    <Link href="/papers/substrate-broadening-rpgf" className="underline hover:no-underline">
                        the RPGF paper
                    </Link>
                    .
                </>
            }
        >
                <defs>
                    <marker
                        id={markerId}
                        viewBox="0 0 8 8"
                        refX="7"
                        refY="4"
                        markerWidth="7"
                        markerHeight="7"
                        orient="auto"
                    >
                        <path d="M0,0 L8,4 L0,8 z" fill="currentColor" />
                    </marker>
                </defs>

                {STEPS.map((step, i) => {
                    const box = BOXES[i];
                    const midX = box.x + BOX_W / 2;
                    return (
                        <g key={step.title}>
                            <rect
                                x={box.x}
                                y={box.y}
                                width={BOX_W}
                                height={BOX_H}
                                rx="6"
                                className="fill-none stroke-default"
                                strokeWidth="1"
                            />
                            <text x={midX} y={box.y + 28} textAnchor="middle" fontSize="12" fontWeight="600" className="fill-ink-heading">
                                {step.title}
                            </text>
                            <text x={midX} y={box.y + 46} textAnchor="middle" fontSize="10" className="fill-ink-body">
                                {step.detail}
                            </text>
                        </g>
                    );
                })}

                {/* Clockwise arrows: top →, right ↓, bottom ←, left ↑. */}
                <line x1="252" y1="68" x2="306" y2="68" stroke="currentColor" strokeWidth="1.25" markerEnd={`url(#${markerId})`} />
                <line x1="425" y1="103" x2="425" y2="146" stroke="currentColor" strokeWidth="1.25" markerEnd={`url(#${markerId})`} />
                <line x1="308" y1="183" x2="254" y2="183" stroke="currentColor" strokeWidth="1.25" markerEnd={`url(#${markerId})`} />
                <line x1="135" y1="148" x2="135" y2="105" stroke="currentColor" strokeWidth="1.25" markerEnd={`url(#${markerId})`} />
        </FigureFrame>
    );
}
