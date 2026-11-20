"use client";

/**
 * RegisteredAgreementsReclaim — one address's registered agreements, each
 * with a two-step stake reclaim (`AgreementRegistry.requestWithdrawal`, then
 * `AgreementRegistry.withdraw` after the cooldown, through
 * `useWithdrawAgreement`) when the connected wallet registered it.
 *
 * The address is the connected wallet's or the one `?wallet=0x…` names
 * (`OneAddressList`); with neither, the list's place says so and reads
 * nothing. Derived from chain events only: `usePublishedAgreements(subject)`
 * filters `AgreementRegistered` to `registeredBy == subject` and folds
 * `WithdrawalRequested` in as `stakeWithdrawn` (the wallet-scoped read KEEPS
 * withdrawn rows, flagged). The rows are narrowed again to the address. Each
 * row is labeled by its pinned document's name, read and verified against its
 * key (`fetchRegisteredAgreement`), and is the shared `ReclaimStakeRow` — the
 * same row `/clauses/register` lists clauses with, owning its own
 * `useWithdrawGate({ kind: "agreement", agreementHash })`.
 *
 * States are `RegistryListState`'s: loading, failed (nothing), empty, list.
 */

import { useEffect } from "react";
import { OneAddressList, RegistryListState, type ListedAddress } from "@/components/shared/RegistryListState";
import {
    fetchRegisteredAgreement,
    getRegisteredAgreement,
    usePublishedAgreements,
    useRegisteredAgreementsVersion,
    type PublishedAgreement,
} from "@/lib/registries/useAgreementRegistry";
import { useWithdrawAgreement } from "@/lib/registries/useWithdrawStake";
import { ReclaimStakeRow } from "@/components/registries/ReclaimStakeRow";
import { hexEqual } from "@/lib/shared/evm";

export function RegisteredAgreementsReclaim() {
    return (
        <OneAddressList testId="agreements-reclaim" what="registered agreements" publicHref="/registries?family=agreements">
            {(listed) => <AgreementRows {...listed} />}
        </OneAddressList>
    );
}

function AgreementRows({ subject, signer }: ListedAddress) {
    const { read, refetch } = usePublishedAgreements(subject);
    const data = read.status === "present" ? read.value : null;
    const { requestWithdrawal, withdraw } = useWithdrawAgreement();
    // Re-renders as each document is read and verified (the labels read the
    // session cache).
    useRegisteredAgreementsVersion();
    const own = data?.filter((row) => hexEqual(row.registeredBy, subject));
    useEffect(() => {
        for (const row of data ?? []) void fetchRegisteredAgreement(row.agreementHash, row.contentURI);
    }, [data]);

    return (
        <RegistryListState<PublishedAgreement>
            read={read}
            rows={own}
            testId="agreements-reclaim"
            loading="Loading the registered agreements…"
            empty={signer
                ? "You haven't registered any agreements yet. Register one from an order's drawer on the composition canvas, or publish an assembly, which registers each of its agreements first."
                : "This address has registered no agreements."}
        >
            {(rows) => (
                <ul className="space-y-3" data-testid="agreements-reclaim-list">
                    {rows.map((row) => (
                        <ReclaimAgreementRow
                            key={`${row.agreementHash}-${row.blockNumber.toString()}`}
                            row={row}
                            requestWithdrawal={requestWithdrawal}
                            claim={withdraw}
                            onReclaimed={refetch}
                            signerIsRegistrant={hexEqual(row.registeredBy, signer)}
                        />
                    ))}
                </ul>
            )}
        </RegistryListState>
    );
}

function ReclaimAgreementRow({
    row,
    requestWithdrawal,
    claim,
    onReclaimed,
    signerIsRegistrant,
}: {
    row: PublishedAgreement;
    requestWithdrawal: (key: `0x${string}`) => Promise<unknown>;
    claim: (key: `0x${string}`) => Promise<unknown>;
    onReclaimed: () => void;
    signerIsRegistrant: boolean;
}) {
    const doc = getRegisteredAgreement(row.agreementHash);
    const clauseCount = doc ? Object.keys(doc.clauses).length : 0;
    return (
        <ReclaimStakeRow
            family="agreement"
            registrationKey={row.agreementHash}
            target={{ kind: "agreement", agreementHash: row.agreementHash }}
            // The document's own name, or nothing while it is unread — the
            // registration key below is the row's identity, never a stand-in title.
            title={doc?.name ?? null}
            meta={
                doc
                    ? <>{clauseCount} clause{clauseCount === 1 ? "" : "s"}{" · block "}{row.blockNumber.toString()}</>
                    : <>block {row.blockNumber.toString()}</>
            }
            stakeWithdrawn={row.stakeWithdrawn}
            requestWithdrawal={requestWithdrawal}
            claim={claim}
            onReclaimed={onReclaimed}
            signerIsRegistrant={signerIsRegistrant}
        />
    );
}
