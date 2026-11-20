"use client";

/**
 * ReclaimStakeRow — one registration of the address a list shows, with its
 * two-step stake reclaim: `requestWithdrawal(key)` on the family's registry,
 * which de-surfaces the registration at once, then `withdraw(key)` once the
 * chain says the cooldown has passed (`PendingStakeClaim`).
 *
 * The one row shape for every staked-intent family a designer of record lists
 * by wallet: `/clauses/register` (`RegisteredClausesReclaim`) and the designer
 * landing's registered agreements (`RegisteredAgreementsReclaim`). The row owns
 * its own `useWithdrawGate(target)`: the request disables while VERIFIED
 * in-flight trades compose the registration, or while the gate is unknown
 * (loading / chain-read failure), and the party-private caveat is shown
 * otherwise. The caller supplies the family's withdraw hook's two calls, so
 * each registry's own revert copy surfaces.
 *
 * A list may show another address's registrations (`?wallet=0x…`): the row
 * then reads the same, and offers no reclaim and no caveat about one, since
 * only the registrant signs either call (`signerIsRegistrant`).
 *
 * Test ids are `${family}-reclaim-row-${key}`, `${family}-reclaim-state-${key}`,
 * `${family}-withdraw-button`, `${family}-withdraw-caveat`,
 * `${family}-withdraw-error`, and `PendingStakeClaim`'s
 * `${family}-claim-${key}`, `${family}-claim-button`, `${family}-claim-error`.
 */

import { useState, type ReactNode } from "react";
import { extractErrorMessage } from "@/lib/shared/errors";
import { Button } from "@/components/ui/Button";
import {
    useWithdrawGate,
    withdrawGateOpen,
    withdrawBlockedReason,
    withdrawUnverifiedCaveat,
    type WithdrawClauseOrAssembly,
} from "@/lib/registries/withdrawGate";
import { useKeyWithdrawalStatus, type StakeFamily } from "@/lib/registries/useWithdrawStake";
import { cooldownPhrase } from "@/lib/registries/cooldownPhrase";
import { truncateHex } from "@/lib/shared/formatHex";

export function ReclaimStakeRow({
    family,
    registrationKey,
    target,
    title,
    meta,
    stakeWithdrawn,
    requestWithdrawal,
    claim,
    onReclaimed,
    signerIsRegistrant,
}: {
    /** The registry family's noun, in the test ids and the copy. */
    family: "clause" | "agreement";
    registrationKey: `0x${string}`;
    /** The gate's target — the same registration, by its family's key. */
    target: WithdrawClauseOrAssembly;
    title: ReactNode;
    /** The row's descriptive line, before its stake state. */
    meta: ReactNode;
    /** Whether the stake has been requested back (`WithdrawalRequested`). */
    stakeWithdrawn: boolean;
    requestWithdrawal: (key: `0x${string}`) => Promise<unknown>;
    claim: (key: `0x${string}`) => Promise<unknown>;
    onReclaimed: () => void;
    /** Whether the connected wallet registered this row: the one that may reclaim. */
    signerIsRegistrant: boolean;
}) {
    const { gate } = useWithdrawGate(target);
    const status = useKeyWithdrawalStatus(family, registrationKey);
    const [requesting, setRequesting] = useState(false);
    const [error, setError] = useState<string | null>(null);
    // Reflect a successful request, and a successful claim, locally until the
    // chain reads catch up.
    const [locallyRequested, setLocallyRequested] = useState(false);
    const [locallyClaimed, setLocallyClaimed] = useState(false);
    const withdrawn = stakeWithdrawn || locallyRequested;
    // Unverifiable in-flight trades are informational only (party-private terms),
    // never disabling — shown while the request is still available.
    const caveat = signerIsRegistrant && !withdrawn ? withdrawUnverifiedCaveat(gate) : null;
    // The state is the chain's: a requested stake still pending, or paid out.
    // A failed `releaseAt` read says only that the stake was requested back,
    // and so does a request this row just made, until the read catches up; a
    // claim this row just made is paid out.
    const paidOut = locallyClaimed || (stakeWithdrawn && !locallyRequested
        && status.releaseAt.status === "present" && status.releaseAt.value === 0n);
    const stateLabel = !withdrawn ? "live" : paidOut ? "stake reclaimed" : "withdrawal requested";
    const cooldown = status.cooldown.status === "present" ? status.cooldown.value : undefined;

    async function handleRequest() {
        setRequesting(true);
        setError(null);
        try {
            await requestWithdrawal(registrationKey);
            setLocallyRequested(true);
            status.refetch();
            onReclaimed();
        } catch (err) {
            setError(extractErrorMessage(err, "Requesting the stake back failed."));
        } finally {
            setRequesting(false);
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
                            {stateLabel}
                        </span>
                    </p>
                </div>
                {/* A gate that could not be read offers no request at all. */}
                {signerIsRegistrant && !withdrawn && gate.status !== "absent" && <Button
                    type="button"
                    variant="outline"
                    size="compact"
                    onClick={handleRequest}
                    // RegisteredBy-only request, gated by the advisory commits==resolves
                    // gate: disabled while any VERIFIED in-flight trade composes this
                    // registration, or while the gate is still being read.
                    // Unverified trades never disable — they render as the caveat
                    // strip below.
                    disabled={requesting || !withdrawGateOpen(gate)}
                    className="py-1.5 rounded border-default text-ink-heading font-semibold disabled:opacity-40 disabled:cursor-not-allowed shrink-0"
                    data-testid={`${family}-withdraw-button`}
                    title={
                        withdrawBlockedReason(gate)
                            ?? `Ask for your registration stake back. The ${family} de-surfaces for new compositions now; the binding stays anchored, and the stake can be claimed ${cooldownPhrase(cooldown)}. Claim its closed reward periods on /rewards first: requesting the stake back forfeits any not yet claimed.`
                    }
                >
                    {requesting ? "Requesting…" : "Request stake back"}
                </Button>}
            </div>
            {caveat && (
                <p className="text-xs text-ink-muted" role="status" data-testid={`${family}-withdraw-caveat`}>
                    {caveat}
                </p>
            )}
            {error && (
                <p className="text-xs text-error-fg" role="alert" data-testid={`${family}-withdraw-error`}>
                    Request failed: {error}
                </p>
            )}
            {signerIsRegistrant && withdrawn && !paidOut && (
                <PendingStakeClaim
                    family={family}
                    registrationKey={registrationKey}
                    status={status}
                    claim={claim}
                    onClaimed={() => {
                        setLocallyClaimed(true);
                        onReclaimed();
                    }}
                />
            )}
            <p className="font-mono text-[10px] text-ink-muted" title={registrationKey}>
                {truncateHex(registrationKey, { head: 10, tail: 6 })}
            </p>
        </li>
    );
}

/**
 * The second step of a key's reclaim: the requested stake, when it unlocks,
 * and the claim once the chain says it can be made. Renders nothing when
 * nothing is pending (`releaseAt` is `0n`: never requested, or already paid
 * out) or when either read failed — a failed `withdrawable` read offers no
 * claim, never a guess.
 *
 * `withdrawable` is the CHAIN's answer. Do not reintroduce a
 * `Date.now() >= releaseAt` comparison: `releaseAt` is a block timestamp, the
 * two clocks drift, and the comparison would disable a legitimate claim.
 * `releaseAt` is shown as human-readable context only.
 */
function PendingStakeClaim({
    family,
    registrationKey,
    status,
    claim,
    onClaimed,
    className = "flex flex-col gap-1 text-xs",
}: {
    family: StakeFamily;
    registrationKey: `0x${string}`;
    status: ReturnType<typeof useKeyWithdrawalStatus>;
    claim: (key: `0x${string}`) => Promise<unknown>;
    onClaimed: () => void;
    /** The outer element's classes: the place's own band, when it has one. */
    className?: string;
}) {
    const [claiming, setClaiming] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const { releaseAt, withdrawable } = status;
    if (releaseAt.status !== "present" || releaseAt.value === 0n) return null;
    if (withdrawable.status !== "present") return null;
    const canClaim = withdrawable.value;

    async function handleClaim() {
        setClaiming(true);
        setError(null);
        try {
            await claim(registrationKey);
            status.refetch();
            onClaimed();
        } catch (err) {
            setError(extractErrorMessage(err, "Claiming the stake failed."));
        } finally {
            setClaiming(false);
        }
    }

    return (
        <div className={className} data-testid={`${family}-claim-${registrationKey}`}>
            <p className="text-ink-body">
                {canClaim
                    ? "The cooldown has passed; you can claim the stake now."
                    : `The stake can be claimed from ${new Date(Number(releaseAt.value) * 1000).toLocaleString()}. The ${family} is already de-surfaced; only the ETH is still waiting.`}
            </p>
            <div>
                <Button
                    type="button"
                    variant="outline"
                    size="compact"
                    onClick={handleClaim}
                    disabled={claiming || !canClaim}
                    data-testid={`${family}-claim-button`}
                >
                    {claiming ? "Claiming…" : "Claim stake"}
                </Button>
            </div>
            {error && (
                <p className="text-error-fg" role="alert" data-testid={`${family}-claim-error`}>
                    Claim failed: {error}
                </p>
            )}
        </div>
    );
}

/**
 * `PendingStakeClaim` for a place that holds a key only some of the time (an
 * assembly page shows drafts too): mounted once a key exists, it reads the
 * key's withdrawal status itself.
 */
export function KeyStakeClaim({
    family,
    registrationKey,
    claim,
    onClaimed,
    className,
}: {
    family: StakeFamily;
    registrationKey: `0x${string}`;
    claim: (key: `0x${string}`) => Promise<unknown>;
    onClaimed: () => void;
    className?: string;
}) {
    const status = useKeyWithdrawalStatus(family, registrationKey);
    return (
        <PendingStakeClaim
            family={family}
            registrationKey={registrationKey}
            status={status}
            claim={claim}
            onClaimed={onClaimed}
            className={className}
        />
    );
}
