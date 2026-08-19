"use client";

/**
 * ClausesList — renders the connected wallet's registered clauses.
 *
 * Reads from `useRegisteredClausesByWallet(address)` which filters the
 * `ClauseRegistered` event log by registeredBy. For most wallets the list is
 * empty; the empty state points at `/clauses/register` (the clause authoring
 * surface — paste a spec and register it) and at the marketing /clauses page
 * so users can see what clauses exist protocol-wide. For the deployer wallet
 * (which registers the bundled specs through the deploy script), the list
 * shows the built-ins with their human-readable names.
 *
 * Mirrors `PublishedList`'s shape: no-wallet, loading, empty, list.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { useRegisteredClausesByWallet } from "@/lib/protocol/useClauseRegistry";
import { truncateHex } from "@/lib/shared/formatHex";

export function ClausesList() {
    const { address } = useAccount();
    const { data, isLoading } = useRegisteredClausesByWallet(address);
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);

    if (!mounted) return null;

    if (!address) {
        return (
            <p className="text-sm text-ink-muted" data-testid="clauses-no-wallet">
                Connect a wallet to see your registered clauses.
            </p>
        );
    }

    if (isLoading || data === null) {
        return (
            <p className="text-sm text-ink-muted" data-testid="clauses-loading">
                Loading registered clauses…
            </p>
        );
    }

    if (data.length === 0) {
        return (
            <p className="text-sm text-ink-muted" data-testid="clauses-empty">
                You haven&apos;t registered any clauses yet.{" "}
                <Link href="/clauses/register" className="underline">
                    Register a clause
                </Link>{" "}
                — paste a spec and anchor it on the <code>ClauseRegistry</code> — or browse the{" "}
                <Link href="/clauses" className="underline">
                    protocol-tier clauses
                </Link>{" "}
                to see what&apos;s in force.
            </p>
        );
    }

    return (
        <ul className="space-y-3" data-testid="clauses-list">
            {data.map((clause) => (
                <li
                    key={`${clause.idHash}-${clause.blockNumber.toString()}`}
                    className="rounded-lg border border-default bg-paper px-5 py-3 flex items-start gap-4"
                    data-testid={`clause-row-${clause.idHash}`}
                >
                    <div className="flex-1 min-w-0">
                        <p className="text-base font-semibold text-ink-heading truncate">
                            {clause.clauseId ?? <span className="font-mono">{truncateHex(clause.idHash, { head: 10, tail: 6 })}</span>}
                        </p>
                        {clause.clauseId && (
                            <p
                                className="font-mono text-[11px] text-ink-muted mt-0.5"
                                title={clause.idHash}
                                data-testid={`clause-hash-${clause.idHash}`}
                            >
                                {truncateHex(clause.idHash, { head: 10, tail: 6 })}
                            </p>
                        )}
                        <p className="text-[11px] text-ink-muted mt-1">
                            version {clause.version}
                            {" · "}
                            <span title={clause.contentURI} className="font-mono">
                                {clause.contentURI || "(no spec uri)"}
                            </span>
                            {" · block "}
                            {clause.blockNumber.toString()}
                        </p>
                    </div>
                </li>
            ))}
        </ul>
    );
}

