"use client";

/**
 * RegisteredClausesReclaim — the connected wallet's registered clauses, each
 * with a stake-reclaim affordance.
 *
 * Derived from chain events only: `useRegisteredClausesByWallet` filters
 * `ClauseRegistered` to `registeredBy == connected wallet` and folds
 * `DepositWithdrawn` in as `stakeWithdrawn` (the wallet-scoped read KEEPS
 * withdrawn rows, flagged). The article is read from the warm clause-spec cache
 * (`block.design.article`) — never a stored field. Each row is the shared
 * `ReclaimStakeRow` (the registered agreements' row too), which owns its own
 * `useWithdrawGate({ kind: "clause", clauseKey })`, so the reclaim disables while
 * VERIFIED in-flight trades compose the clause and surfaces the party-private
 * caveat otherwise — the same pattern as ViewAssemblyClient's reclaim.
 *
 * States are `RegistryListState`'s: wallet, loading, failed (nothing), empty, list.
 */

import { useEffect, useRef } from "react";
import Link from "@/components/shared/Link";
import { useAccount } from "wagmi";
import { RegistryListState } from "@/components/shared/RegistryListState";
import { useRegistryWriteVersion } from "@/lib/protocol/registryWrites";
import {
    useRegisteredClausesByWallet,
    useWithdrawClause,
    type RegisteredClauseEvent,
} from "@/lib/protocol/useClauseRegistry";
import { useClauseSpecs } from "@/lib/protocol/useClauseSpecs";
import { ReclaimStakeRow } from "@/components/registries/ReclaimStakeRow";
import { getClauseSpec } from "@/lib/shared/clauseSpecSource";
import { truncateHex } from "@/lib/shared/formatHex";

export function RegisteredClausesReclaim() {
    const { address } = useAccount();
    const { read, refetch } = useRegisteredClausesByWallet(address);
    const { withdraw } = useWithdrawClause();
    // A registration confirmed by the form above is a write this scan ran
    // before: read the events again when the write signal changes.
    const writeVersion = useRegistryWriteVersion();
    const seenWriteVersion = useRef(writeVersion);
    useEffect(() => {
        if (seenWriteVersion.current === writeVersion) return;
        seenWriteVersion.current = writeVersion;
        void refetch();
    }, [writeVersion, refetch]);
    // Warm the spec cache so each row can read its `block.design.article`. The returned
    // state changes as specs resolve, re-rendering the rows against the cache.
    useClauseSpecs();

    return (
        <RegistryListState
            read={read}
            testId="clauses-reclaim"
            walletHint="Connect a wallet to see the clauses you registered."
            loading="Loading your registered clauses…"
            empty={
                <>
                    You haven&apos;t registered any clauses yet. Paste a spec above, or browse the{" "}
                    <Link href="/clauses" className="underline">protocol-tier clauses</Link>{" "}
                    to see what&apos;s in force.
                </>
            }
        >
            {(data) => (
                <ul className="space-y-3" data-testid="clauses-reclaim-list">
                    {data.map((clause) => (
                        <ReclaimClauseRow
                            key={`${clause.clauseKey}-${clause.blockNumber.toString()}`}
                            clause={clause}
                            withdraw={withdraw}
                            onReclaimed={refetch}
                        />
                    ))}
                </ul>
            )}
        </RegistryListState>
    );
}

function ReclaimClauseRow({
    clause,
    withdraw,
    onReclaimed,
}: {
    clause: RegisteredClauseEvent;
    withdraw: (key: `0x${string}`) => Promise<unknown>;
    onReclaimed: () => void;
}) {
    // The row's labels are the spec's own: a spec that declares no article
    // shows none, and a spec not resolved names nothing — never a placeholder.
    const spec = getClauseSpec(clause.clauseKey);
    const article = spec?.block?.design.article;
    return (
        <ReclaimStakeRow
            family="clause"
            registrationKey={clause.clauseKey}
            target={{ kind: "clause", clauseKey: clause.clauseKey }}
            title={spec?.clauseId ?? truncateHex(clause.clauseKey, { head: 10, tail: 6 })}
            meta={<>{article && <>article {article}</>}{article && spec && " · "}{spec && <>version {spec.version}</>}</>}
            stakeWithdrawn={clause.stakeWithdrawn}
            withdraw={withdraw}
            onReclaimed={onReclaimed}
        />
    );
}
