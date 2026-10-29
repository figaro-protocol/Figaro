import type { BaseFigureProps } from "@/components/figures/BaseFigureProps";
import { ArrowMarker } from "@/components/figures/ArrowMarker";
import { FigureFrame } from "@/components/figures/FigureFrame";

export type LockedFundsStateFigureProps = BaseFigureProps;

/**
 * The bond state machine, derived read-only from FigaroCore
 * (`src/core/kernel/FigaroCore.sol`, cross-checked against `docs/CONTRACTS.md`):
 *
 *   Unknown (orderStatus 0) --commit()--> Committed/Active (orderStatus 1)
 *     --resolveProcess()--> Resolved (orderStatus 2)
 *
 * `commit()` requires both signatures and pulls both bonds in the same
 * call (`_pullExact` ×2, FigaroCore.sol:208-209). `resolveProcess()` is
 * buyer-only (`msg.sender != ps.rootBuyer` reverts, FigaroCore.sol:268)
 * and atomic across every active order in the process
 * (`IncompleteOrderList` requires the full set, FigaroCore.sol:270-271;
 * payouts happen in one loop, FigaroCore.sol:276-299).
 *
 * The two absent transitions are load-bearing, not missing features —
 * `docs/DESIGN_DECISIONS.md` §3 ("No admin, no escape hatch —
 * by design") and §5 ("Buyer key loss permanently locks bonds — by
 * design"): "There is no timeout, no recovery path, no admin override."
 * If the buyer never calls resolveProcess, Committed simply persists —
 * this figure draws that as a stable state, never as a bond "trapped" or
 * "held hostage" (the failure-story doctrine: the buyer's own signature
 * is the only door, by design, not a bug to be excused).
 */
export function LockedFundsStateFigure({
    idPrefix = "locked-funds-state",
    className,
    svgProps,
}: LockedFundsStateFigureProps) {
    const arrowId = `${idPrefix}-arrow`;

    const cy = 90;
    const r = 32;
    const cx1 = 66;
    const cx2 = 200;
    const cx3 = 334;

    return (
        <FigureFrame
            idPrefix={idPrefix}
            className={className}
            svgProps={svgProps}
            viewBox="0 0 400 500"
            title="The three states of one order"
            desc={
                <>
                    Three states of one order and two steps between them.
                    An order not yet committed becomes committed when both
                    parties have signed and the smart contract locks both
                    bonds: the buyer&apos;s, twice the payment, and the
                    seller&apos;s, twice the value through its order. A
                    committed order becomes resolved only when the buyer
                    resolves, for every order in the process at once: the
                    seller is paid and its bond refunded, and the
                    buyer&apos;s bond is refunded less the payment. Two
                    exits from a committed order do not exist: no timeout
                    and no override from outside the parties. If the buyer
                    never resolves, the order stays committed with both
                    bonds locked, by design.
                </>
            }
            caption={
                <>
                    No timeout and no override from outside the parties are not gaps — they are the
                    mechanism. Removing either would give one party an escape
                    hatch the other can be forced through.
                </>
            }
        >
                <defs>
                    <ArrowMarker id={arrowId} />
                </defs>

                {/* ── State spine ─────────────────────────────────────── */}
                <text x="200" y="16" fontSize="10" textAnchor="middle" className="fill-ink-muted font-mono">
                    the state of one order
                </text>

                {/* commit() arrow */}
                <line
                    x1={cx1 + r} y1={cy} x2={cx2 - r} y2={cy}
                    className="stroke-ink-muted" strokeWidth="1.5"
                    markerEnd={`url(#${arrowId})`}
                />
                <text x={(cx1 + r + cx2 - r) / 2} y={cy - 20} fontSize="11" fontWeight="600" textAnchor="middle" className="fill-ink-heading font-mono">
                    commit
                </text>
                <text x={(cx1 + r + cx2 - r) / 2} y={cy + 18} fontSize="8.5" textAnchor="middle" className="fill-ink-muted">
                    both sign; both bonds locked
                </text>

                {/* resolveProcess() arrow */}
                <line
                    x1={cx2 + r} y1={cy} x2={cx3 - r} y2={cy}
                    className="stroke-ink-muted" strokeWidth="1.5"
                    markerEnd={`url(#${arrowId})`}
                />
                <text x={(cx2 + r + cx3 - r) / 2} y={cy - 20} fontSize="11" fontWeight="600" textAnchor="middle" className="fill-ink-heading font-mono">
                    resolve
                </text>
                <text x={(cx2 + r + cx3 - r) / 2} y={cy + 18} fontSize="8.5" textAnchor="middle" className="fill-ink-muted">
                    buyer only, all at once
                </text>

                {/* Unknown */}
                <circle cx={cx1} cy={cy} r={r} className="fill-paper stroke-default" strokeWidth="1.5" />
                <text x={cx1} y={cy + 9} fontSize="26" fontWeight="700" textAnchor="middle" className="fill-ink-faint">1</text>
                <text x={cx1} y={cy + r + 22} fontSize="12" fontWeight="600" textAnchor="middle" className="fill-ink-heading">Not committed</text>
                <text x={cx1} y={cy + r + 37} fontSize="9" textAnchor="middle" className="fill-ink-muted">no bond locked yet</text>

                {/* Committed / Active */}
                <circle cx={cx2} cy={cy} r={r} className="fill-subtle stroke-default-strong" strokeWidth="2.5" />
                <text x={cx2} y={cy + 9} fontSize="26" fontWeight="700" textAnchor="middle" className="fill-ink-heading">2</text>
                <text x={cx2} y={cy + r + 22} fontSize="12" fontWeight="600" textAnchor="middle" className="fill-ink-heading">Committed</text>
                <text x={cx2} y={cy + r + 37} fontSize="9" textAnchor="middle" className="fill-ink-muted">bonds locked</text>

                {/* Resolved */}
                <circle cx={cx3} cy={cy} r={r} className="fill-subtle-hover stroke-default" strokeWidth="1.5" />
                <text x={cx3} y={cy + 9} fontSize="26" fontWeight="700" textAnchor="middle" className="fill-ink-faint">3</text>
                <text x={cx3} y={cy + r + 22} fontSize="12" fontWeight="600" textAnchor="middle" className="fill-ink-heading">Resolved</text>
                <text x={cx3} y={cy + r + 37} fontSize="9" textAnchor="middle" className="fill-ink-muted">paid and refunded</text>

                {/* ── Two non-transitions off Committed ──────────────── */}
                <line x1={cx2} y1="170" x2="140" y2="222" strokeDasharray="4 3" className="stroke-ink-faint" strokeWidth="1.25" />
                <line x1={cx2} y1="170" x2="260" y2="222" strokeDasharray="4 3" className="stroke-ink-faint" strokeWidth="1.25" />

                <g transform="translate(140, 228)">
                    <circle r="9" className="fill-paper stroke-ink-faint" strokeWidth="1.25" />
                    <line x1="-6.5" y1="6.5" x2="6.5" y2="-6.5" className="stroke-ink-faint" strokeWidth="1.25" />
                </g>
                <text x="140" y="252" fontSize="9.5" fontWeight="600" textAnchor="middle" className="fill-ink-body">no timeout exists</text>
                <text x="140" y="264" fontSize="8" textAnchor="middle" className="fill-ink-muted">bonds do not expire</text>

                <g transform="translate(260, 228)">
                    <circle r="9" className="fill-paper stroke-ink-faint" strokeWidth="1.25" />
                    <line x1="-6.5" y1="6.5" x2="6.5" y2="-6.5" className="stroke-ink-faint" strokeWidth="1.25" />
                </g>
                <text x="260" y="252" fontSize="9.5" fontWeight="600" textAnchor="middle" className="fill-ink-body">nobody can reach in</text>
                <text x="260" y="264" fontSize="8" textAnchor="middle" className="fill-ink-muted">no address can force it</text>

                {/* ── Where each party's stake sits, per state ───────── */}
                <g>
                    <text x={cx1} y="296" fontSize="9" fontWeight="600" textAnchor="middle" className="fill-ink-body">buyer</text>
                    <rect x={cx1 - 44} y="302" width="88" height="8" rx="2" className="fill-none stroke-default" strokeWidth="0.75" />
                    <text x={cx1} y="322" fontSize="8" textAnchor="middle" className="fill-ink-muted">tokens in wallet</text>

                    <text x={cx1} y="342" fontSize="9" fontWeight="600" textAnchor="middle" className="fill-ink-body">seller</text>
                    <rect x={cx1 - 44} y="348" width="88" height="8" rx="2" className="fill-none stroke-default" strokeWidth="0.75" />
                    <text x={cx1} y="368" fontSize="8" textAnchor="middle" className="fill-ink-muted">tokens in wallet</text>
                </g>

                <g>
                    <text x={cx2} y="296" fontSize="9" fontWeight="600" textAnchor="middle" className="fill-ink-body">buyer</text>
                    <rect x={cx2 - 44} y="302" width="88" height="8" rx="2" className="fill-default-strong" />
                    <text x={cx2} y="322" fontSize="8" textAnchor="middle" className="fill-ink-muted">2× payment, locked</text>

                    <text x={cx2} y="342" fontSize="9" fontWeight="600" textAnchor="middle" className="fill-ink-body">seller</text>
                    <rect x={cx2 - 44} y="348" width="88" height="8" rx="2" className="fill-ink-heading" />
                    <text x={cx2} y="368" fontSize="8" textAnchor="middle" className="fill-ink-muted">2× value so far, locked</text>
                </g>

                <g>
                    <text x={cx3} y="296" fontSize="9" fontWeight="600" textAnchor="middle" className="fill-ink-body">buyer</text>
                    <rect x={cx3 - 44} y="302" width="44" height="8" rx="2" className="fill-subtle-hover stroke-default" strokeWidth="0.75" />
                    <text x={cx3} y="322" fontSize="8" textAnchor="middle" className="fill-ink-muted">bond refunded, less payment</text>

                    <text x={cx3} y="342" fontSize="9" fontWeight="600" textAnchor="middle" className="fill-ink-body">seller</text>
                    <rect x={cx3 - 44} y="348" width="88" height="8" rx="2" className="fill-ink-heading" />
                    <text x={cx3} y="368" fontSize="8" textAnchor="middle" className="fill-ink-muted">bond refunded, and paid</text>
                </g>

                {/* ── Terminal-condition note ─────────────────────────── */}
                <rect x="16" y="396" width="368" height="82" rx="10" className="fill-subtle stroke-default" strokeWidth="1" />
                <text x="200" y="418" fontSize="11" fontWeight="600" textAnchor="middle" className="fill-ink-heading">
                    If the buyer never resolves
                </text>
                <text x="200" y="436" fontSize="9.5" textAnchor="middle" className="fill-ink-body">
                    The order stays committed, and both bonds stay locked.
                </text>
                <text x="200" y="452" fontSize="9.5" textAnchor="middle" className="fill-ink-body">
                    By design: the buyer&apos;s own signature is the only door.
                </text>
                <text x="200" y="468" fontSize="8" fontStyle="italic" textAnchor="middle" className="fill-ink-muted">
                    No timeout and no override, by design.
                </text>
        </FigureFrame>
    );
}
