"use client";

/**
 * ReclaimStakeRow — one registration of the connected wallet, with its
 * stake-reclaim affordance (`withdrawDeposit` on the family's registry).
 *
 * The one row shape for every staked-intent family a designer of record lists
 * by wallet: `/clauses/register` (`RegisteredClausesReclaim`) and the designer
 * landing's registered agreements (`RegisteredAgreementsReclaim`). The row owns
 * its own `useWithdrawGate(target)`: the reclaim disables while VERIFIED
 * in-flight trades compose the registration, or while the gate is unknown
 * (loading / chain-read failure), and the party-private caveat is shown
 * otherwise. The caller supplies the family's withdraw hook's `withdraw`, so
 * each registry's own revert copy surfaces.
 *
 * Test ids are `${family}-reclaim-row-${key}`, `${family}-reclaim-state-${key}`,
 * `${family}-withdraw-button`, `${family}-withdraw-caveat`,
 * `${family}-withdraw-error`.
 */

import { useState, type ReactNode } from "react";
import { extractErrorMessage } from "@/lib/shared/errors";
import {
    useWithdrawGate,
    withdrawBlockedReason,
    withdrawUnverifiedCaveat,
    type WithdrawClauseOrAssembly,
} from "@/lib/protocol/withdrawGate";
import { truncateHex } from "@/lib/shared/formatHex";

export function ReclaimStakeRow({
    family,
    registrationKey,
    target,
    title,
    meta,
    stakeWithdrawn,
    withdraw,
    onReclaimed,
}: {
    /** The registry family's noun, in the test ids and the copy. */
    family: "clause" | "agreement";
    registrationKey: `0x${string}`;
    /** The gate's target — the same registration, by its family's key. */
    target: WithdrawClauseOrAssembly;
    title: ReactNode;
    /** The row's descriptive line, before its stake state. */
    meta: ReactNode;
    stakeWithdrawn: boolean;
    withdraw: (key: `0x${string}`) => Promise<unknown>;
    onReclaimed: () => void;
}) {
    const { gate } = useWithdrawGate(target);
    const [withdrawing, setWithdrawing] = useState(false);
    const [error, setError] = useState<string | null>(null);
    // Reflect a successful reclaim locally until the event refetch catches up.
    const [locallyWithdrawn, setLocallyWithdrawn] = useState(false);
    const withdrawn = stakeWithdrawn || locallyWithdrawn;
    // Unverifiable in-flight trades are informational only (party-private terms),
    // never disabling — shown while the reclaim is still available.
    const caveat = !withdrawn ? withdrawUnverifiedCaveat(gate) : null;

    async function handleWithdraw() {
        setWithdrawing(true);
        setError(null);
        try {
            await withdraw(registrationKey);
            setLocallyWithdrawn(true);
            onReclaimed();
        } catch (err) {
            setError(extractErrorMessage(err, "Reclaiming the stake failed."));
        } finally {
            setWithdrawing(false);
        }
    }

    return (
        <li
            className="rounded-lg border border-default bg-paper px-5 py-3 flex flex-col gap-2"
            data-testid={`${family}-reclaim-row-${registrationKey}`}
        >
            <div className="flex items-start gap-4">
                <div className="flex-1 min-w-0">
                    <p className="text-base font-semibold text-ink-heading truncate">{title}</p>
                    <p className="text-[11px] text-ink-muted mt-1">
                        {meta}
                        {" · "}
                        <span
                            className={withdrawn ? "text-ink-muted" : "text-success-fg"}
                            data-testid={`${family}-reclaim-state-${registrationKey}`}
                        >
                            {withdrawn ? "stake reclaimed" : "live"}
                        </span>
                    </p>
                </div>
                <button
                    type="button"
                    onClick={handleWithdraw}
                    // RegisteredBy-only reclaim, gated by the advisory commits==resolves
                    // gate: disabled while any VERIFIED in-flight trade composes this
                    // registration, while the gate is unknown (loading / chain-read
                    // failure), or once already reclaimed. Unverified trades never
                    // disable — they render as the caveat strip below.
                    disabled={withdrawing || withdrawn || gate === null || gate.inFlightCount > 0}
                    className="text-xs px-3 py-1.5 rounded border border-default bg-paper hover:bg-subtle text-ink-heading font-semibold disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                    data-testid={`${family}-withdraw-button`}
                    title={
                        withdrawn
                            ? `This ${family}'s registration stake has already been reclaimed.`
                            : (withdrawBlockedReason(gate)
                                ?? `Reclaim your registration stake. The binding stays anchored; the ${family} de-surfaces for new compositions.`)
                    }
                >
                    {withdrawn ? "Stake reclaimed" : withdrawing ? "Reclaiming…" : "Reclaim stake"}
                </button>
            </div>
            {caveat && (
                <p className="text-xs text-ink-muted" role="status" data-testid={`${family}-withdraw-caveat`}>
                    {caveat}
                </p>
            )}
            {error && (
                <p className="text-xs text-error-fg" role="alert" data-testid={`${family}-withdraw-error`}>
                    Reclaim failed: {error}
                </p>
            )}
            <p className="font-mono text-[10px] text-ink-muted" title={registrationKey}>
                {truncateHex(registrationKey, { head: 10, tail: 6 })}
            </p>
        </li>
    );
}
