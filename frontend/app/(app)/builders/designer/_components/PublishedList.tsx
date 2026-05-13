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
 * Each row has a Fork button. Slugs are first-write-wins on-chain,
 * so re-publishing the same slug is impossible — forking means
 * fetching the IPFS manifest, building a new localStorage draft
 * under a fresh slug via `manifestToDraft`, and opening the canvas
 * at /builders/designer/edit/<new-slug>.
 */

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import {
    fetchAssemblyManifest,
    usePublishedAssemblies,
    type PublishedAssembly,
} from "@/lib/mechanisms/useAssemblyRegistry";
import { manifestToDraft } from "@/lib/designer/manifestToDraft";
import { listNamedDrafts, saveNamedDraft } from "@/lib/designer/syntheticDesignStore";

function uniqueDraftSlug(base: string): string {
    const existing = new Set(listNamedDrafts().map((d) => d.slug));
    if (!existing.has(base)) return base;
    let n = 2;
    while (existing.has(`${base}-${n}`)) n++;
    return `${base}-${n}`;
}

export function PublishedList() {
    const router = useRouter();
    const { address } = useAccount();
    const { data, isLoading } = usePublishedAssemblies(address);
    const [mounted, setMounted] = useState(false);
    const [forking, setForking] = useState<string | null>(null);
    useEffect(() => setMounted(true), []);

    const handleFork = useCallback(
        async (published: PublishedAssembly) => {
            const defaultSlug = uniqueDraftSlug(`${published.slug}-fork`);
            const proposed = typeof window === "undefined"
                ? defaultSlug
                : window.prompt(
                    `Fork "${published.slug}" as a new local draft. Slug:`,
                    defaultSlug,
                );
            if (!proposed) return;
            const trimmed = proposed.trim();
            if (!trimmed) return;
            const finalSlug = uniqueDraftSlug(trimmed);

            setForking(published.slug);
            try {
                const manifest = await fetchAssemblyManifest(published.metadataURI);
                if (!manifest) {
                    window.alert(
                        `Could not fetch the manifest at ${published.metadataURI}. Check that the IPFS gateway is reachable.`,
                    );
                    return;
                }
                const draft = manifestToDraft(manifest, { slug: finalSlug });
                saveNamedDraft(draft);
                router.push(`/builders/designer/edit/${encodeURIComponent(finalSlug)}`);
            } catch (err) {
                const message = err instanceof Error ? err.message : String(err);
                window.alert(`Fork failed: ${message}`);
            } finally {
                setForking(null);
            }
        },
        [router],
    );

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
                    className="rounded-lg border border-default bg-paper px-5 py-3 flex items-start gap-4"
                    data-testid={`published-row-${p.slug}`}
                >
                    <div className="flex-1 min-w-0">
                        <p className="text-sm font-semibold text-ink-heading truncate">{p.slug}</p>
                        <p className="font-mono text-[11px] text-ink-muted mt-0.5">
                            content <span title={p.contentHash}>{shortHash(p.contentHash)}</span>
                            {" · block "}
                            {p.blockNumber.toString()}
                        </p>
                        <p className="text-[11px] text-ink-muted mt-1 break-all">{p.metadataURI}</p>
                    </div>
                    <div className="flex flex-col gap-2 shrink-0">
                        <button
                            type="button"
                            onClick={() => handleFork(p)}
                            disabled={forking !== null}
                            className="text-xs px-3 py-1.5 rounded border border-black bg-white hover:bg-neutral-100 text-black disabled:opacity-40 disabled:cursor-not-allowed"
                            data-testid={`published-fork-${p.slug}`}
                        >
                            {forking === p.slug ? "Forking…" : "Fork"}
                        </button>
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
