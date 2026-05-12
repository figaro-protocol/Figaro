"use client";

/**
 * PublishedList — renders the connected wallet's published assemblies
 * by reading `AssemblyRegistered` events from the AssemblyRegistry.
 *
 * Parallel to `DraftsList`, but the source-of-truth is the on-chain
 * event log instead of localStorage. No on-chain mapping enumeration
 * is possible, so the event log IS the index — same pattern the
 * codebase uses for operator listings via `lib/core/indexer.ts`.
 *
 * No-wallet, empty, and loading states each render their own message.
 */

import { useEffect, useState } from "react";
import { useAccount } from "wagmi";
import { usePublishedAssemblies } from "@/lib/mechanisms/useAssemblyRegistry";

export function PublishedList() {
    const { address } = useAccount();
    const { data, isLoading } = usePublishedAssemblies(address);
    const [mounted, setMounted] = useState(false);
    useEffect(() => setMounted(true), []);

    if (!mounted) return null;

    if (!address) {
        return (
            <p className="text-sm text-ink-muted" data-testid="published-no-wallet">
                Connect a wallet to see your published assemblies.
            </p>
        );
    }

    if (isLoading || data === null) {
        return (
            <p className="text-sm text-ink-muted" data-testid="published-loading">
                Loading registered assemblies…
            </p>
        );
    }

    if (data.length === 0) {
        return (
            <p className="text-sm text-ink-muted" data-testid="published-empty">
                You haven&apos;t published any assemblies yet. Publish a draft from the designer to see it here.
            </p>
        );
    }

    return (
        <ul className="space-y-3" data-testid="published-list">
            {data.map((p) => (
                <li
                    key={`${p.slugHash}-${p.blockNumber.toString()}`}
                    className="rounded-lg border border-default bg-paper px-5 py-3"
                    data-testid={`published-row-${p.slug}`}
                >
                    <p className="text-sm font-semibold text-ink-heading truncate">{p.slug}</p>
                    <p className="font-mono text-[11px] text-ink-muted mt-0.5">
                        class <span title={p.classId}>{shortHash(p.classId)}</span>
                        {" · "}content <span title={p.contentHash}>{shortHash(p.contentHash)}</span>
                        {" · block "}
                        {p.blockNumber.toString()}
                    </p>
                    <p className="text-[11px] text-ink-muted mt-1 break-all">{p.metadataURI}</p>
                </li>
            ))}
        </ul>
    );
}

function shortHash(hash: string): string {
    if (hash.length < 18) return hash;
    return `${hash.slice(0, 10)}…${hash.slice(-6)}`;
}
