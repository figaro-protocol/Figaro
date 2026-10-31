"use client";

/**
 * RegisteredAgreementsReclaim — the connected wallet's registered agreements,
 * each with a stake-reclaim affordance (`AgreementRegistry.withdrawDeposit`
 * through `useWithdrawAgreement`).
 *
 * Derived from chain events only: `usePublishedAgreements(address)` filters
 * `AgreementRegistered` to `registeredBy == connected wallet` and folds
 * `DepositWithdrawn` in as `stakeWithdrawn` (the wallet-scoped read KEEPS
 * withdrawn rows, flagged). The rows are narrowed again to the connected
 * wallet, so the reclaim renders only for the designer of record. Each row is
 * labeled by its pinned document's name, read and verified against its key
 * (`fetchRegisteredAgreement`), and is the shared `ReclaimStakeRow` — the same
 * row `/clauses/register` lists clauses with, owning its own
 * `useWithdrawGate({ kind: "agreement", agreementHash })`.
 *
 * States: no-wallet, loading, failed read, empty, list.
 */

import { useEffect } from "react";
import { useAccount } from "wagmi";
import { useMounted } from "@/hooks/useMounted";
import {
    fetchRegisteredAgreement,
    getRegisteredAgreement,
    usePublishedAgreements,
    useRegisteredAgreementsVersion,
    useWithdrawAgreement,
    type PublishedAgreement,
} from "@/lib/protocol/useAgreementRegistry";
import { ReclaimStakeRow } from "@/components/registries/ReclaimStakeRow";
import { hexEqual } from "@/lib/shared/evm";
import { truncateHex } from "@/lib/shared/formatHex";

export function RegisteredAgreementsReclaim() {
    const mounted = useMounted();
    const { address } = useAccount();
    const { data, isLoading, failed, error, refetch } = usePublishedAgreements(address);
    const { withdraw } = useWithdrawAgreement();
    // Re-renders as each document is read and verified (the labels read the
    // session cache).
    useRegisteredAgreementsVersion();
    const own = (data ?? []).filter((row) => hexEqual(row.registeredBy, address));
    useEffect(() => {
        for (const row of data ?? []) void fetchRegisteredAgreement(row.agreementHash, row.contentURI);
    }, [data]);

    if (!mounted) return null;

    if (!address) {
        return (
            <p className="text-sm text-ink-muted" data-testid="agreements-reclaim-no-wallet">
                Connect a wallet to see the agreements you registered.
            </p>
        );
    }

    if (isLoading || data === null) {
        return (
            <p className="text-sm text-ink-muted" data-testid="agreements-reclaim-loading">
                Loading your registered agreements…
            </p>
        );
    }

    if (failed) {
        return (
            <p className="text-sm text-error-fg" role="alert" data-testid="agreements-reclaim-failed">
                Reading the <code>AgreementRegistry</code> failed{error ? `: ${error}` : "."}
            </p>
        );
    }

    if (own.length === 0) {
        return (
            <p className="text-sm text-ink-muted" data-testid="agreements-reclaim-empty">
                You haven&apos;t registered any agreements yet. Register one from an order&apos;s drawer on the composition canvas, or publish an assembly, which registers each of its agreements first.
            </p>
        );
    }

    return (
        <ul className="space-y-3" data-testid="agreements-reclaim-list">
            {own.map((row) => (
                <ReclaimAgreementRow
                    key={`${row.agreementHash}-${row.blockNumber.toString()}`}
                    row={row}
                    withdraw={withdraw}
                    onReclaimed={refetch}
                />
            ))}
        </ul>
    );
}

function ReclaimAgreementRow({
    row,
    withdraw,
    onReclaimed,
}: {
    row: PublishedAgreement;
    withdraw: (key: `0x${string}`) => Promise<unknown>;
    onReclaimed: () => void;
}) {
    const doc = getRegisteredAgreement(row.agreementHash);
    const clauseCount = doc ? Object.keys(doc.clauses).length : 0;
    return (
        <ReclaimStakeRow
            family="agreement"
            registrationKey={row.agreementHash}
            target={{ kind: "agreement", agreementHash: row.agreementHash }}
            title={doc?.name || truncateHex(row.agreementHash, { head: 10, tail: 6 })}
            meta={
                doc
                    ? <>{clauseCount} clause{clauseCount === 1 ? "" : "s"}{" · block "}{row.blockNumber.toString()}</>
                    : <>document not read yet{" · block "}{row.blockNumber.toString()}</>
            }
            stakeWithdrawn={row.stakeWithdrawn}
            withdraw={withdraw}
            onReclaimed={onReclaimed}
        />
    );
}
