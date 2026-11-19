"use client";

/**
 * ClausesList — renders one address's registered clauses: the connected
 * wallet's, or the one `?wallet=0x…` names (`OneAddressList`); with neither,
 * the list's place says so and reads nothing.
 *
 * Reads from `useRegisteredClausesByWallet(subject)` which filters the
 * `ClauseRegistered` event log by registeredBy. For most wallets the list is
 * empty; the empty state points at `/clauses/register` (the clause authoring
 * surface — paste a spec and register it) and at the marketing /clauses page
 * so users can see what clauses exist protocol-wide. For the deployer wallet
 * (which registers the bundled specs through the deploy script), the list
 * shows the built-ins with their human-readable names.
 *
 * States are `RegistryListState`'s: loading, failed (nothing), empty, list.
 */

import Link from "@/components/shared/Link";
import type { RegisteredClauseEvent } from "@/lib/registries/useClauseRegistry";
import { useRegisteredClausesByWallet } from "@/lib/registries/useRegisterClause";
import { useClauseSpecs } from "@/lib/registries/useClauseSpecs";
import { getClauseSpec } from "@/lib/shared/clauseSpecSource";
import { truncateHex } from "@/lib/shared/formatHex";
import { OneAddressList, RegistryListState, type ListedAddress } from "@/components/shared/RegistryListState";

export function ClausesList() {
    return (
        <OneAddressList testId="clauses" what="registered clauses" publicHref="/registries?family=clauses">
            {(listed) => <ClausesOf {...listed} />}
        </OneAddressList>
    );
}

function ClausesOf({ subject, signer }: ListedAddress) {
    const { read } = useRegisteredClausesByWallet(subject);
    // The chain row carries only the key; the spec's own name and version —
    // its label — are read from the verified spec once it loads.
    useClauseSpecs();

    return (
        <RegistryListState
            read={read}
            testId="clauses"
            loading="Loading registered clauses…"
            empty={!signer ? "This address has registered no clauses." : (
                <>
                    You haven&apos;t registered any clauses yet.{" "}
                    <Link href="/clauses/register" className="underline">
                        Register a clause
                    </Link>{" "}
                    — paste a spec and anchor it on the <code>ClauseRegistry</code> — or browse the{" "}
                    <Link href="/clauses" className="underline">
                        protocol-tier clauses
                    </Link>{" "}
                    to see what&apos;s in force.
                </>
            )}
        >
            {(data) => <ClauseRows data={data} />}
        </RegistryListState>
    );
}

function ClauseRows({ data }: { data: RegisteredClauseEvent[] }) {
    return (
        <ul className="space-y-3" data-testid="clauses-list">
            {data.map((clause) => {
                const spec = getClauseSpec(clause.clauseKey);
                return (
                <li
                    key={`${clause.clauseKey}-${clause.blockNumber.toString()}`}
                    className="rounded-lg border border-default bg-paper px-5 py-3 flex items-start gap-4"
                    data-testid={`clause-row-${clause.clauseKey}`}
                >
                    <div className="flex-1 min-w-0">
                        <p className="text-base font-semibold text-ink-heading truncate">
                            {spec?.clauseId ?? <span className="font-mono">{truncateHex(clause.clauseKey, { head: 10, tail: 6 })}</span>}
                        </p>
                        {spec && (
                            <p
                                className="font-mono text-[11px] text-ink-muted mt-0.5"
                                title={clause.clauseKey}
                                data-testid={`clause-hash-${clause.clauseKey}`}
                            >
                                {truncateHex(clause.clauseKey, { head: 10, tail: 6 })}
                            </p>
                        )}
                        <p className="text-[11px] text-ink-muted mt-1">
                            {spec && <>version {spec.version}{" · "}</>}
                            <span title={clause.contentURI} className="font-mono">
                                {clause.contentURI || "(no spec uri)"}
                            </span>
                            {" · block "}
                            {clause.blockNumber.toString()}
                        </p>
                    </div>
                </li>
                );
            })}
        </ul>
    );
}

