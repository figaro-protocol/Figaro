"use client";

/**
 * MemberTrackRecord — renders a seller's public-graph track record:
 * the settlement + coordination history reconstructed from on-chain events
 * (PUBLIC_GRAPH_MODEL.md §"Reputation derivation"). Pure render — the
 * caller supplies the record via useMemberTrackRecord.
 *
 * Every figure is recomputed from events, never a stored score. A seller
 * with no history renders as "no on-chain history" rather than a fabricated
 * rating — the honest absence of a track record is itself the signal.
 */

import { formatUnits } from "viem";
import type { MemberTrackRecord as TrackRecord } from "@/lib/composition/indexer";
import { truncateHex } from "@/lib/shared/formatHex";
import { formatBlockTimestamp } from "@/lib/shared/formatTimestamp";

interface Props {
    record: TrackRecord | null;
    isLoading: boolean;
}

function Stat({ label, value, testId }: { label: string; value: string; testId: string }) {
    return (
        <div className="rounded border border-default px-3 py-2">
            <div className="text-lg font-semibold text-ink-primary tabular-nums" data-testid={testId}>{value}</div>
            <div className="text-xs text-ink-muted">{label}</div>
        </div>
    );
}

export function MemberTrackRecord({ record, isLoading }: Props) {
    if (isLoading) {
        return (
            <p className="text-xs text-ink-muted" data-testid="track-record-loading">
                Reconstructing track record from the public graph…
            </p>
        );
    }
    if (!record) return null;

    const sinceLabel = record.operatingSinceTimestamp != null
        ? formatBlockTimestamp(record.operatingSinceTimestamp, { year: "numeric", month: "short" })
        : "—";
    const hasHistory = record.ordersSold > 0 || record.ordersBought > 0;

    return (
        <section className="space-y-3" data-testid="seller-track-record">
            <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-sm font-semibold text-ink-primary">Track record</h3>
                <span className="text-xs text-ink-muted">operating since {sinceLabel}</span>
            </div>

            {!hasHistory ? (
                <p className="text-xs text-ink-muted" data-testid="track-record-empty">
                    No committed orders yet — this seller has no on-chain history to show.
                </p>
            ) : (
                <>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                        <Stat testId="track-stat-completed" label="processes completed" value={String(record.completedProcesses)} />
                        <Stat testId="track-stat-active" label="processes active" value={String(record.activeProcesses)} />
                        <Stat testId="track-stat-orders-sold" label="orders sold" value={String(record.ordersSold)} />
                        <Stat testId="track-stat-orders-bought" label="orders bought" value={String(record.ordersBought)} />
                        <Stat testId="track-stat-buyers-served" label="buyers served" value={String(record.buyersServed)} />
                        <Stat testId="track-stat-sellers-used" label="sellers used" value={String(record.sellersUsed)} />
                        <Stat testId="track-stat-attestations" label="attestations emitted" value={String(record.attestationsEmitted)} />
                    </div>

                    {record.valueTransacted.length > 0 && (
                        <div className="text-xs text-ink-body" data-testid="track-record-value">
                            <span className="font-semibold">Value transacted as seller: </span>
                            {record.valueTransacted.map((v, i) => (
                                <span key={v.currency}>
                                    {i > 0 ? ", " : ""}
                                    <span className="tabular-nums">{formatUnits(v.total, 18)}</span>{" "}
                                    <span className="font-mono text-ink-faint">{truncateHex(v.currency)}</span>
                                </span>
                            ))}
                        </div>
                    )}

                    <p className="text-[11px] text-ink-faint leading-snug">
                        Every figure is recomputed from public on-chain events — settlement and
                        coordination history, not a platform score. Token amounts shown at 18 decimals.
                    </p>
                </>
            )}
        </section>
    );
}
