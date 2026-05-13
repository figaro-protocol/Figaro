"use client";

/**
 * PublishedList — renders the connected wallet's published assemblies
 * by reading `AssemblyRegistered` events from the AssemblyRegistry,
 * then fetching each manifest from IPFS to surface human-readable
 * fields (name, order count, schema set) on top of the on-chain
 * identity (slug + content hash + block).
 *
 * Source of truth: the event log. No on-chain mapping enumeration
 * is possible, so the event log IS the index — same pattern the
 * codebase uses for operator listings via `lib/core/indexer.ts`.
 *
 * Each row has a Fork button that fetches the manifest, runs
 * `manifestToDraft`, saves a new draft under a fresh slug, and
 * navigates to /edit/{new-slug}.
 *
 * No-wallet, empty, and loading states each render their own message.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import {
    type AssemblyManifest,
    fetchAssemblyManifest,
    usePublishedAssemblies,
    type PublishedAssembly,
} from "@/lib/mechanisms/useAssemblyRegistry";
import { forkPublishedAssembly } from "@/lib/designer/forkAssembly";

/** Per-row enrichment derived from the IPFS-fetched manifest. */
interface RowDetail {
    name: string;
    orderCount: number;
    schemas: readonly string[];
}

type DetailState = RowDetail | "loading" | "error";

/** Walk the manifest's inlined agreements and collect the unique set of
 *  schemas anchored across all orders. Sorted alphabetically for stable
 *  display order. */
function collectSchemas(manifest: AssemblyManifest): string[] {
    const set = new Set<string>();
    for (const agreement of Object.values(manifest.agreements)) {
        for (const section of agreement.sections) {
            if (typeof section.schema === "string") set.add(section.schema);
        }
    }
    return Array.from(set).sort();
}

export function PublishedList() {
    const router = useRouter();
    const { address } = useAccount();
    const { data, isLoading } = usePublishedAssemblies(address);
    const [mounted, setMounted] = useState(false);
    const [forking, setForking] = useState<string | null>(null);
    const [details, setDetails] = useState<Map<string, DetailState>>(new Map());
    /** Hashes whose fetch has already been kicked off. A ref (not state)
     *  because we want to guard against double-fetch without retriggering
     *  the effect every time we add an entry. */
    const inFlightRef = useRef<Set<string>>(new Set());
    useEffect(() => setMounted(true), []);

    // Lazy-fetch the manifest for each row. Keyed by contentHash so two
    // rows pointing at the same content (shouldn't happen, but cheap to
    // guard) share a single fetch.
    useEffect(() => {
        if (!data || data.length === 0) return;
        for (const p of data) {
            if (inFlightRef.current.has(p.contentHash)) continue;
            inFlightRef.current.add(p.contentHash);
            setDetails((prev) => {
                const next = new Map(prev);
                next.set(p.contentHash, "loading");
                return next;
            });
            fetchAssemblyManifest(p.metadataURI).then(
                (manifest) => {
                    setDetails((prev) => {
                        const next = new Map(prev);
                        next.set(
                            p.contentHash,
                            manifest
                                ? {
                                    name: manifest.name,
                                    orderCount: manifest.orders.length,
                                    schemas: collectSchemas(manifest),
                                }
                                : "error",
                        );
                        return next;
                    });
                },
                () => {
                    setDetails((prev) => {
                        const next = new Map(prev);
                        next.set(p.contentHash, "error");
                        return next;
                    });
                },
            );
        }
    }, [data]);

    const handleFork = useCallback(
        async (published: PublishedAssembly) => {
            setForking(published.slug);
            try {
                const manifest = await fetchAssemblyManifest(published.metadataURI);
                if (!manifest) {
                    window.alert(
                        `Could not fetch the manifest at ${published.metadataURI}. Check that the IPFS gateway is reachable.`,
                    );
                    return;
                }
                const outcome = forkPublishedAssembly(published.slug, manifest);
                if (!outcome) return;
                router.push(`/builders/designer/edit/${encodeURIComponent(outcome.finalSlug)}`);
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
            {data.map((p) => {
                const detail = details.get(p.contentHash);
                const displayName =
                    detail && detail !== "loading" && detail !== "error" ? detail.name : null;
                const orderCount =
                    detail && detail !== "loading" && detail !== "error" ? detail.orderCount : null;
                const schemas =
                    detail && detail !== "loading" && detail !== "error" ? detail.schemas : null;
                return (
                    <li
                        key={`${p.slugHash}-${p.blockNumber.toString()}`}
                        className="rounded-lg border border-default bg-paper px-5 py-3 flex items-start gap-4"
                        data-testid={`published-row-${p.slug}`}
                    >
                        <div className="flex-1 min-w-0">
                            <p className="text-base font-semibold text-ink-heading truncate">
                                {displayName ?? p.slug}
                            </p>
                            <p className="font-mono text-[11px] text-ink-muted mt-0.5">
                                /{p.slug}
                            </p>
                            {detail === "loading" && (
                                <p className="text-[11px] text-ink-muted mt-1">Loading manifest…</p>
                            )}
                            {detail === "error" && (
                                <p className="text-[11px] text-amber-700 mt-1">
                                    Manifest unavailable (IPFS gateway?). Identity is on-chain regardless.
                                </p>
                            )}
                            {orderCount !== null && schemas !== null && (
                                <p
                                    className="text-[11px] text-ink-muted mt-1"
                                    data-testid={`published-shape-${p.slug}`}
                                    title={schemas.join(", ")}
                                >
                                    {orderCount} order{orderCount === 1 ? "" : "s"}
                                    {" · "}
                                    {schemas.length} schema{schemas.length === 1 ? "" : "s"}
                                    {schemas.length > 0 && `: ${formatSchemaList(schemas)}`}
                                </p>
                            )}
                            <p className="font-mono text-[11px] text-ink-muted mt-1">
                                content <span title={p.contentHash}>{shortHash(p.contentHash)}</span>
                                {" · block "}
                                {p.blockNumber.toString()}
                            </p>
                            <p className="text-[11px] text-ink-muted mt-0.5 break-all">{p.metadataURI}</p>
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
                            <Link
                                href={`/builders/designer/view/${encodeURIComponent(p.slug)}`}
                                className="text-xs px-3 py-1.5 rounded border border-neutral-300 bg-white hover:border-neutral-500 text-neutral-700 text-center"
                                data-testid={`published-inspect-${p.slug}`}
                            >
                                Inspect
                            </Link>
                        </div>
                    </li>
                );
            })}
        </ul>
    );
}

function shortHash(hash: string): string {
    if (hash.length < 18) return hash;
    return `${hash.slice(0, 10)}…${hash.slice(-6)}`;
}

/** Strip the `figaro-` prefix and the `-vN` version suffix for a compact
 *  display. Show the first three schemas inline, summarize the rest as
 *  `+N more`. The full set is in the row's `title` tooltip. */
function formatSchemaList(schemas: readonly string[]): string {
    const trimmed = schemas.map((s) => s.replace(/^figaro-/, "").replace(/-v\d+$/, ""));
    if (trimmed.length <= 3) return trimmed.join(", ");
    return `${trimmed.slice(0, 3).join(", ")}, +${trimmed.length - 3} more`;
}
