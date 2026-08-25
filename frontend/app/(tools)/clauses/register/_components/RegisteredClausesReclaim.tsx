"use client";

/**
 * RegisteredClausesReclaim — the connected wallet's registered clauses, each
 * with a stake-reclaim affordance.
 *
 * Derived from chain events only: `useRegisteredClausesByWallet` filters
 * `ClauseRegistered` to `registeredBy == connected wallet` and folds
 * `DepositWithdrawn` in as `stakeWithdrawn` (the wallet-scoped read KEEPS
 * withdrawn rows, flagged). The article is read from the warm clause-spec cache
 * (`block.design.article`) — never a stored field. Each row owns its own
 * `useWithdrawGate({ kind: "clause", clauseId })`, so the reclaim disables while
 * VERIFIED in-flight deals compose the clause and surfaces the party-private
 * caveat otherwise — the same pattern as ViewAssemblyClient's reclaim.
 *
 * Mirrors `ClausesList`'s states: no-wallet, loading, empty, list.
 */

import { useState } from "react";
import { extractErrorMessage } from "@/lib/shared/errors";
import Link from "next/link";
import { useAccount } from "wagmi";
import { useMounted } from "@/hooks/useMounted";
import {
    useRegisteredClausesByWallet,
    useWithdrawClause,
    type RegisteredClauseEvent,
} from "@/lib/protocol/useClauseRegistry";
import { useClauseSpecs } from "@/lib/protocol/useClauseSpecs";
import {
    useWithdrawGate,
    withdrawBlockedReason,
    withdrawUnverifiedCaveat,
} from "@/lib/protocol/withdrawGate";
import { getClauseSpec } from "@/lib/shared/clauseSpecSource";
import { truncateHex } from "@/lib/shared/formatHex";

export function RegisteredClausesReclaim() {
    const mounted = useMounted();
    const { address } = useAccount();
    const { data, isLoading, refetch } = useRegisteredClausesByWallet(address);
    // Warm the spec cache so each row can read its `block.design.article`. The returned
    // state changes as specs resolve, re-rendering the rows against the cache.
    useClauseSpecs();

    if (!mounted) return null;

    if (!address) {
        return (
            <p className="text-sm text-ink-muted" data-testid="clauses-reclaim-no-wallet">
                Connect a wallet to see the clauses you registered.
            </p>
        );
    }

    if (isLoading || data === null) {
        return (
            <p className="text-sm text-ink-muted" data-testid="clauses-reclaim-loading">
                Loading your registered clauses…
            </p>
        );
    }

    if (data.length === 0) {
        return (
            <p className="text-sm text-ink-muted" data-testid="clauses-reclaim-empty">
                You haven&apos;t registered any clauses yet. Paste a spec above, or browse the{" "}
                <Link href="/clauses" className="underline">protocol-tier clauses</Link>{" "}
                to see what&apos;s in force.
            </p>
        );
    }

    return (
        <ul className="space-y-3" data-testid="clauses-reclaim-list">
            {data.map((clause) => (
                <ReclaimClauseRow
                    key={`${clause.idHash}-${clause.blockNumber.toString()}`}
                    clause={clause}
                    onReclaimed={refetch}
                />
            ))}
        </ul>
    );
}

function ReclaimClauseRow({
    clause,
    onReclaimed,
}: {
    clause: RegisteredClauseEvent;
    onReclaimed: () => void;
}) {
    const { withdraw } = useWithdrawClause();
    const { gate } = useWithdrawGate({ kind: "clause", clauseId: clause.clauseId });
    const [withdrawing, setWithdrawing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    // Reflect a successful reclaim locally until the event refetch catches up.
    const [locallyWithdrawn, setLocallyWithdrawn] = useState(false);
    const withdrawn = clause.stakeWithdrawn || locallyWithdrawn;

    // "(unclassified)" is a RESOLVED spec declaring no article; a spec the
    // gateway has not served yet is not unclassified — its article is unknown here.
    const spec = getClauseSpec(clause.clauseId, clause.version);
    const article = spec ? spec.block?.design.article ?? "(unclassified)" : "(spec not resolved yet)";
    // Unverifiable in-flight deals are informational only (party-private terms),
    // never disabling — shown while the reclaim is still available.
    const caveat = !withdrawn ? withdrawUnverifiedCaveat(gate) : null;

    async function handleWithdraw() {
        setWithdrawing(true);
        setError(null);
        try {
            await withdraw(clause.idHash);
            setLocallyWithdrawn(true);
            onReclaimed();
        } catch (err) {
            setError(extractErrorMessage(err, "Reclaiming the deposit failed."));
        } finally {
            setWithdrawing(false);
        }
    }

    return (
        <li
            className="rounded-lg border border-default bg-paper px-5 py-3 flex flex-col gap-2"
            data-testid={`clause-reclaim-row-${clause.idHash}`}
        >
            <div className="flex items-start gap-4">
                <div className="flex-1 min-w-0">
                    <p className="text-base font-semibold text-ink-heading truncate">
                        {clause.clauseId}
                    </p>
                    <p className="text-[11px] text-ink-muted mt-1">
                        article {article}
                        {" · version "}
                        {clause.version}
                        {" · "}
                        <span
                            className={withdrawn ? "text-ink-faint" : "text-success-fg"}
                            data-testid={`clause-reclaim-state-${clause.idHash}`}
                        >
                            {withdrawn ? "stake reclaimed" : "live"}
                        </span>
                    </p>
                </div>
                <button
                    type="button"
                    onClick={handleWithdraw}
                    // RegisteredBy-only reclaim, gated by the advisory commits==resolves
                    // gate: disabled while any VERIFIED in-flight deal composes this
                    // clause, while the gate is unknown (loading / chain-read
                    // failure), or once already reclaimed. Unverified deals never
                    // disable — they render as the caveat strip below.
                    disabled={withdrawing || withdrawn || gate === null || gate.inFlightCount > 0}
                    className="text-xs px-3 py-1.5 rounded border border-default bg-paper hover:bg-subtle text-ink-heading font-semibold disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                    data-testid="clause-withdraw-button"
                    title={
                        withdrawn
                            ? "This clause's registration stake has already been reclaimed."
                            : (withdrawBlockedReason(gate)
                                ?? "Reclaim your registration stake. The binding stays anchored; the clause de-surfaces for new compositions.")
                    }
                >
                    {withdrawn ? "Stake reclaimed" : withdrawing ? "Reclaiming…" : "Reclaim stake"}
                </button>
            </div>
            {caveat && (
                <p className="text-xs text-ink-muted" role="status" data-testid="clause-withdraw-caveat">
                    {caveat}
                </p>
            )}
            {error && (
                <p className="text-xs text-error-fg" role="alert" data-testid="clause-withdraw-error">
                    Reclaim failed: {error}
                </p>
            )}
            <p className="font-mono text-[10px] text-ink-faint" title={clause.idHash}>
                {truncateHex(clause.idHash, { head: 10, tail: 6 })}
            </p>
        </li>
    );
}
