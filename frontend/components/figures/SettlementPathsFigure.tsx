import { cn } from "@/lib/shared/utils";
import type { BaseFigureProps } from "@/components/figures/BaseFigureProps";

export type SettlementPathsFigureProps = BaseFigureProps;

/**
 * Embedded by /spec § "Two settlement paths" (the canonical #settlement-paths anchor).
 *
 * The two disjoint settlement universes: FigaroCore's direct kernel path
 * (`commit` / `resolveProcess`) and `FigaroBatchVerifier`'s proof-based batch
 * path (`settleBatch`). They never share kernel state — `orderStatus` is
 * written only by the direct path. The single point of contact is usage
 * accrual, which the batch path carries into `UsageCounter` in the same
 * transaction as `settleBatch`. Names verified against `docs/CONTRACTS.md`
 * and `src/kernel/FigaroCore.sol` / `src/protocol/verifier/FigaroBatchVerifier.sol`.
 */
export function SettlementPathsFigure({
    idPrefix = "settlement-paths",
    className,
    svgProps,
}: SettlementPathsFigureProps) {
    const titleId = `${idPrefix}-title`;
    const descId = `${idPrefix}-desc`;

    return (
        <figure className={cn("w-full max-w-xl mx-auto", className)}>
            <svg
                viewBox="0 0 400 620"
                role="img"
                aria-labelledby={`${titleId} ${descId}`}
                className="w-full h-auto"
                style={{ maxWidth: "100%" }}
                {...svgProps}
            >
                <title id={titleId}>Two disjoint settlement paths</title>
                <desc id={descId}>
                    FigaroCore&apos;s direct path (commit, resolveProcess) and
                    FigaroBatchVerifier&apos;s proof-based batch path (signed
                    commitments through a sequencer and an SP1 proof to
                    settleBatch) settle independently. The batch path never
                    writes FigaroCore&apos;s orderStatus. The one connection
                    between the two paths is usage accrual, carried from
                    settleBatch into UsageCounter in the same transaction.
                </desc>

                <defs>
                    <marker
                        id={`${idPrefix}-arrow`}
                        viewBox="0 0 10 10"
                        refX="8"
                        refY="5"
                        markerWidth="7"
                        markerHeight="7"
                        orient="auto-start-reverse"
                    >
                        <path d="M0,0 L10,5 L0,10 z" className="fill-ink-muted" />
                    </marker>
                </defs>

                {/* Direct path — FigaroCore (kernel) */}
                <rect x="16" y="16" width="368" height="256" rx="10" className="fill-paper stroke-default" strokeWidth="1" />
                <text x="32" y="44" fontSize="14" fontWeight="600" className="fill-ink-heading">Direct path</text>
                <text x="32" y="60" fontSize="10" className="fill-ink-muted">FigaroCore — kernel (frozen)</text>
                <line x1="32" y1="70" x2="368" y2="70" className="stroke-default" strokeWidth="1" />

                <text x="32" y="88" fontSize="11" fontWeight="600" className="fill-ink-body">Inputs</text>
                <text x="40" y="104" fontSize="10" className="fill-ink-primary font-mono">commit(commitment, buyerSig, sellerSig)</text>
                <text x="40" y="120" fontSize="10" className="fill-ink-primary font-mono">resolveProcess(processId, commitments[])</text>

                <text x="32" y="140" fontSize="11" fontWeight="600" className="fill-ink-body">Events</text>
                <text x="40" y="156" fontSize="10" className="fill-ink-primary font-mono">OrderCommitted</text>
                <text x="40" y="170" fontSize="10" className="fill-ink-primary font-mono">OrderResolved</text>
                <text x="40" y="184" fontSize="10" className="fill-ink-primary font-mono">ProcessResolved</text>

                <text x="32" y="204" fontSize="11" fontWeight="600" className="fill-ink-body">State</text>
                <text x="40" y="220" fontSize="10" className="fill-ink-primary font-mono">orderStatus[orderHash]: 0 → 1 → 2</text>
                <text x="40" y="238" fontSize="10" fontStyle="italic" className="fill-ink-muted">has no notion of a batch</text>

                {/* Batch path — FigaroBatchVerifier (proof-based) */}
                <rect x="16" y="296" width="368" height="250" rx="10" className="fill-paper stroke-default" strokeWidth="1" />
                <text x="32" y="324" fontSize="14" fontWeight="600" className="fill-ink-heading">Batch path</text>
                <text x="32" y="340" fontSize="10" className="fill-ink-muted">FigaroBatchVerifier — proof-based (SP1)</text>
                <line x1="32" y1="350" x2="368" y2="350" className="stroke-default" strokeWidth="1" />

                <text x="32" y="368" fontSize="11" fontWeight="600" className="fill-ink-body">Inputs</text>
                <text x="40" y="384" fontSize="10" className="fill-ink-primary font-mono">signed Commitment structs</text>
                <text x="40" y="398" fontSize="10" className="fill-ink-primary font-mono">→ sequencer → SP1 validity proof</text>
                <text x="40" y="412" fontSize="10" className="fill-ink-primary font-mono">→ settleBatch(proof, publicValues,</text>
                <text x="52" y="426" fontSize="10" className="fill-ink-primary font-mono">positions, events, usage)</text>

                <text x="32" y="446" fontSize="11" fontWeight="600" className="fill-ink-body">Events</text>
                <text x="40" y="462" fontSize="10" className="fill-ink-primary font-mono">BatchSettled</text>

                <text x="32" y="482" fontSize="11" fontWeight="600" className="fill-ink-body">State</text>
                <text x="40" y="498" fontSize="10" className="fill-ink-primary font-mono">stateRoot (verifier-local only)</text>

                {/* Visually explicit disjointness: a no-entry glyph beside the one kernel field the batch path never touches. */}
                <g transform="translate(46, 512)">
                    <circle r="7" className="fill-none stroke-ink-muted" strokeWidth="1.25" />
                    <line x1="-5" y1="5" x2="5" y2="-5" className="stroke-ink-muted" strokeWidth="1.25" />
                </g>
                <text x="60" y="517" fontSize="10" fontStyle="italic" className="fill-ink-muted">FigaroCore.orderStatus — never written</text>

                {/* UsageCounter — the one bridge between the two universes */}
                <rect x="110" y="572" width="180" height="46" rx="8" className="fill-subtle stroke-default-strong" strokeWidth="1" />
                <text x="200" y="592" fontSize="12" fontWeight="600" textAnchor="middle" className="fill-ink-heading">UsageCounter</text>
                <text x="200" y="607" fontSize="9" textAnchor="middle" className="fill-ink-muted">usage-accrual ledger</text>

                {/* The one crossing arrow: batch path → UsageCounter, same tx. */}
                <line
                    x1="200" y1="546" x2="200" y2="570"
                    className="stroke-ink-muted"
                    strokeWidth="1.5"
                    markerEnd={`url(#${idPrefix}-arrow)`}
                />
                <text x="208" y="562" fontSize="9" className="fill-ink-body font-mono">usage accrual</text>
                <text x="208" y="573" fontSize="8" fontStyle="italic" className="fill-ink-muted">(same settleBatch tx)</text>
            </svg>
            <figcaption className="mt-3 text-center text-sm text-ink-muted">
                Batch-settled orders never acquire kernel status — FigaroBatchVerifier
                never writes FigaroCore.orderStatus. UsageCounter is the only bridge
                between the two settlement universes.
            </figcaption>
        </figure>
    );
}
