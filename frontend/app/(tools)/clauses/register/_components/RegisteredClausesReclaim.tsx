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
 * Mirrors `ClausesList`'s states: no-wallet, loading, empty, list.
 */

import { useEffect, useRef } from "react";
import Link from "@/components/shared/Link";
import { useAccount } from "wagmi";
import { useMounted } from "@/hooks/useMounted";
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
    const mounted = useMounted();
    const { address } = useAccount();
    const { data, isLoading, refetch } = useRegisteredClausesByWallet(address);
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
                    key={`${clause.clauseKey}-${clause.blockNumber.toString()}`}
                    clause={clause}
                    withdraw={withdraw}
                    onReclaimed={refetch}
                />
            ))}
        </ul>
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
    // "(unclassified)" is a RESOLVED spec declaring no article; a spec the
    // gateway has not served yet is not unclassified — its article is unknown here.
    const spec = getClauseSpec(clause.clauseKey);
    const article = spec ? spec.block?.design.article ?? "(unclassified)" : "(spec not resolved yet)";
    return (
        <ReclaimStakeRow
            family="clause"
            registrationKey={clause.clauseKey}
            target={{ kind: "clause", clauseKey: clause.clauseKey }}
            title={spec?.clauseId ?? truncateHex(clause.clauseKey, { head: 10, tail: 6 })}
            meta={<>article {article}{spec && <>{" · version "}{spec.version}</>}</>}
            stakeWithdrawn={clause.stakeWithdrawn}
            withdraw={withdraw}
            onReclaimed={onReclaimed}
        />
    );
}
