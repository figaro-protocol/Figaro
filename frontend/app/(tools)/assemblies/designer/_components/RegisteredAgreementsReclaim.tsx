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
 * States are `RegistryListState`'s: wallet, loading, failed (nothing), empty, list.
 */

import { useEffect } from "react";
import { useAccount } from "wagmi";
import { RegistryListState } from "@/components/shared/RegistryListState";
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
    const { address } = useAccount();
    const read = usePublishedAgreements(address);
    const { data, refetch } = read;
    const { withdraw } = useWithdrawAgreement();
    // Re-renders as each document is read and verified (the labels read the
    // session cache).
    useRegisteredAgreementsVersion();
    const own = (data ?? []).filter((row) => hexEqual(row.registeredBy, address));
    useEffect(() => {
        for (const row of data ?? []) void fetchRegisteredAgreement(row.agreementHash, row.contentURI);
    }, [data]);

    return (
        <RegistryListState<PublishedAgreement>
            read={read}
            rows={own}
            testId="agreements-reclaim"
            walletHint="Connect a wallet to see the agreements you registered."
            loading="Loading your registered agreements…"
            empty="You haven't registered any agreements yet. Register one from an order's drawer on the composition canvas, or publish an assembly, which registers each of its agreements first."
        >
            {(rows) => (
                <ul className="space-y-3" data-testid="agreements-reclaim-list">
                    {rows.map((row) => (
                        <ReclaimAgreementRow
                            key={`${row.agreementHash}-${row.blockNumber.toString()}`}
                            row={row}
                            withdraw={withdraw}
                            onReclaimed={refetch}
                        />
                    ))}
                </ul>
            )}
        </RegistryListState>
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
