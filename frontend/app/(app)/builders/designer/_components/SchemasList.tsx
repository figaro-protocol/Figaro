"use client";

/**
 * SchemasList — renders the connected wallet's registered schemas.
 *
 * Reads from `useRegisteredSchemasByWallet(address)` which filters the
 * `SchemaRegistered` event log by registrar. For most wallets the list is
 * empty (no authoring UI ships yet); the empty state points at the
 * marketing /schemas page so users can see what schemas exist
 * protocol-wide. For the deployer wallet (which registers the bundled
 * specs through the deploy script), the list shows the 17+ built-ins
 * with their human-readable names.
 *
 * Mirrors `PublishedList`'s shape: no-wallet, loading, empty, list.
 */

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAccount } from "wagmi";
import { useRegisteredSchemasByWallet } from "@/lib/mechanisms/useSchemaRegistry";

export function SchemasList() {
    const { address } = useAccount();
    const { data, isLoading } = useRegisteredSchemasByWallet(address);
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);

    if (!mounted) return null;

    if (!address) {
        return (
            <p className="text-sm text-ink-muted" data-testid="schemas-no-wallet">
                Connect a wallet to see your registered schemas.
            </p>
        );
    }

    if (isLoading || data === null) {
        return (
            <p className="text-sm text-ink-muted" data-testid="schemas-loading">
                Loading registered schemas…
            </p>
        );
    }

    if (data.length === 0) {
        return (
            <p className="text-sm text-ink-muted" data-testid="schemas-empty">
                You haven&apos;t registered any schemas yet. Browse the
                {" "}
                <Link href="/schemas" className="underline">
                    protocol-tier schemas
                </Link>{" "}
                to see what&apos;s in force, or register a new one via{" "}
                <code>SchemaRegistrationHelper</code> on{" "}
                <Link href="/spec" className="underline">/spec</Link>.
            </p>
        );
    }

    return (
        <ul className="space-y-3" data-testid="schemas-list">
            {data.map((schema) => (
                <li
                    key={`${schema.schemaIdHash}-${schema.blockNumber.toString()}`}
                    className="rounded-lg border border-default bg-paper px-5 py-3 flex items-start gap-4"
                    data-testid={`schema-row-${schema.schemaIdHash}`}
                >
                    <div className="flex-1 min-w-0">
                        <p className="text-base font-semibold text-ink-heading truncate">
                            {schema.schemaName ?? <span className="font-mono">{shortHash(schema.schemaIdHash)}</span>}
                        </p>
                        {schema.schemaName && (
                            <p
                                className="font-mono text-[11px] text-ink-muted mt-0.5"
                                title={schema.schemaIdHash}
                                data-testid={`schema-hash-${schema.schemaIdHash}`}
                            >
                                {shortHash(schema.schemaIdHash)}
                            </p>
                        )}
                        <p className="text-[11px] text-ink-muted mt-1">
                            version {schema.version}
                            {" · "}
                            uri{" "}
                            <span title={schema.uriHash} className="font-mono">
                                {shortHash(schema.uriHash)}
                            </span>
                            {" · block "}
                            {schema.blockNumber.toString()}
                        </p>
                    </div>
                </li>
            ))}
        </ul>
    );
}

function shortHash(hash: string): string {
    if (hash.length < 18) return hash;
    return `${hash.slice(0, 10)}…${hash.slice(-6)}`;
}
