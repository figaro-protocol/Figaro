"use client";

/**
 * ViewAssemblyClient — read-only inspect view for an assembly. Resolves
 * a slug from one of two sources, in priority order:
 *
 *   1. localStorage draft (loadNamedDraft) — work-in-progress in this
 *      browser.
 *   2. On-chain published assembly — AssemblyRegistered event filtered
 *      by slugHash, then the manifest fetched from IPFS via metadataURI.
 *
 * If the slug exists in both places, the draft wins (it's more current
 * by definition; the on-chain one is the prior snapshot). If neither,
 * the error UI surfaces a clear message.
 *
 * Renders the same `ProcessGraphCanvas` as /new and /edit/[slug] in
 * designerMode (so per-node clauses/values surface via the lens
 * overlays), but with no edit handlers — drag-add, delete, drawer
 * mutations all absent. The action button at the right of the toolbar
 * is "Edit" for drafts and "Fork" for published assemblies.
 */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { keccak256, toBytes } from "viem";
import { usePublicClient } from "wagmi";
import { ProcessGraphCanvas } from "@/components/core/ProcessGraphCanvas";
import {
    listNamedDrafts,
    loadNamedDraft,
    saveNamedDraft,
} from "@/lib/designer/syntheticDesignStore";
import {
    ASSEMBLY_REGISTRY_ABI,
    fetchAssemblyManifest,
    getAssemblyRegistry,
    type AssemblyManifest,
} from "@/lib/mechanisms/useAssemblyRegistry";
import { saveAgreement } from "@/lib/core/agreementStore";
import { manifestToDraft } from "@/lib/designer/manifestToDraft";
import type { Order } from "@/lib/core/store";

type ResolvedSource =
    | { kind: "loading" }
    | { kind: "draft"; name: string; orders: Order[] }
    | {
        kind: "published";
        name: string;
        orders: Order[];
        manifest: AssemblyManifest;
    }
    | { kind: "error"; message: string };

/** Manifest orders are JSON-serialized — bigint fields come back as
 *  strings. Rehydrate before passing to the canvas, which expects
 *  bigint-typed payment/cumulativeValue/etc. */
function rehydrateOrder(raw: Order): Order {
    return {
        ...raw,
        cumulativeValue: BigInt(raw.cumulativeValue as unknown as string),
        payment: BigInt(raw.payment as unknown as string),
        sellerBond: BigInt(raw.sellerBond as unknown as string),
        buyerBond: BigInt(raw.buyerBond as unknown as string),
        salt: BigInt(raw.salt as unknown as string),
        deadline: BigInt(raw.deadline as unknown as string),
    };
}

function uniqueDraftSlug(base: string): string {
    const existing = new Set(listNamedDrafts().map((d) => d.slug));
    if (!existing.has(base)) return base;
    let n = 2;
    while (existing.has(`${base}-${n}`)) n++;
    return `${base}-${n}`;
}

export function ViewAssemblyClient({ slug }: { slug: string }) {
    const router = useRouter();
    const client = usePublicClient();
    const [resolved, setResolved] = useState<ResolvedSource>({ kind: "loading" });
    const [forking, setForking] = useState(false);

    useEffect(() => {
        // Local draft first — more current than any on-chain snapshot.
        const draft = loadNamedDraft(slug);
        if (draft) {
            setResolved({ kind: "draft", name: draft.name, orders: draft.orders });
            return;
        }
        // Fall through to on-chain lookup.
        const registry = getAssemblyRegistry();
        if (!client || !registry) {
            setResolved({
                kind: "error",
                message:
                    "Assembly not found in this browser's drafts and no chain client is available to look up published assemblies.",
            });
            return;
        }
        const slugHash = keccak256(toBytes(slug));
        client
            .getContractEvents({
                address: registry,
                abi: ASSEMBLY_REGISTRY_ABI,
                eventName: "AssemblyRegistered",
                args: { slugHash },
                fromBlock: 0n,
                toBlock: "latest",
            })
            .then(async (logs) => {
                if (logs.length === 0) {
                    setResolved({
                        kind: "error",
                        message: `Slug "${slug}" not found in localStorage drafts or on-chain.`,
                    });
                    return;
                }
                const log = logs[0];
                const metadataURI = (log.args.metadataURI ?? "") as string;
                const manifest = await fetchAssemblyManifest(metadataURI);
                if (!manifest) {
                    setResolved({
                        kind: "error",
                        message:
                            "Manifest could not be fetched from IPFS. The on-chain identity is anchored regardless; the off-chain content is currently unreachable.",
                    });
                    return;
                }
                // Seed the manifest's inlined agreements into local storage
                // so the canvas's loadAgreement(hash) lookups resolve. Same
                // step manifestToDraft does on fork.
                for (const agreement of Object.values(manifest.agreements)) {
                    saveAgreement(agreement);
                }
                const orders = manifest.orders.map(rehydrateOrder);
                setResolved({ kind: "published", name: manifest.name, orders, manifest });
            })
            .catch((err) => {
                setResolved({
                    kind: "error",
                    message: err instanceof Error ? err.message : String(err),
                });
            });
    }, [slug, client]);

    const handleFork = useCallback(async () => {
        if (resolved.kind !== "published") return;
        const defaultSlug = uniqueDraftSlug(`${slug}-fork`);
        const proposed =
            typeof window === "undefined"
                ? defaultSlug
                : window.prompt(`Fork "${slug}" as a new local draft. Slug:`, defaultSlug);
        if (!proposed) return;
        const trimmed = proposed.trim();
        if (!trimmed) return;
        const finalSlug = uniqueDraftSlug(trimmed);
        setForking(true);
        try {
            const draft = manifestToDraft(resolved.manifest, { slug: finalSlug });
            saveNamedDraft(draft);
            router.push(`/builders/designer/edit/${encodeURIComponent(finalSlug)}`);
        } catch (err) {
            window.alert(`Fork failed: ${err instanceof Error ? err.message : String(err)}`);
        } finally {
            setForking(false);
        }
    }, [slug, resolved, router]);

    if (resolved.kind === "loading") {
        return (
            <div className="min-h-screen bg-canvas p-8" data-testid="assembly-view-loading">
                <p className="text-sm text-ink-muted">Loading…</p>
            </div>
        );
    }

    if (resolved.kind === "error") {
        return (
            <div
                className="min-h-screen bg-canvas p-8 flex flex-col items-start gap-4"
                data-testid="assembly-view-error"
            >
                <h1 className="text-heading-h2 text-ink-heading">Assembly not found</h1>
                <p className="text-sm text-ink-body max-w-2xl">{resolved.message}</p>
                <Link
                    href="/builders/designer"
                    className="text-xs px-3 py-1.5 rounded border border-default bg-paper hover:border-default-strong"
                >
                    ← Back to assemblies
                </Link>
            </div>
        );
    }

    const sourceLabel = resolved.kind === "draft" ? "draft" : "on-chain";
    const actionButton =
        resolved.kind === "draft" ? (
            <Link
                href={`/builders/designer/edit/${encodeURIComponent(slug)}`}
                className="ml-auto text-xs px-3 py-1.5 rounded border border-ink-heading bg-paper hover:bg-subtle text-ink-heading font-semibold"
                data-testid="view-edit-button"
            >
                Edit
            </Link>
        ) : (
            <button
                type="button"
                onClick={handleFork}
                disabled={forking}
                className="ml-auto text-xs px-3 py-1.5 rounded border border-ink-heading bg-paper hover:bg-subtle text-ink-heading font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                data-testid="view-fork-button"
            >
                {forking ? "Forking…" : "Fork"}
            </button>
        );

    return (
        <div className="min-h-screen bg-canvas" data-testid="assembly-view-page">
            <div
                data-testid="view-toolbar"
                className="px-8 py-4 border-b border-default bg-paper flex items-center gap-3 flex-wrap"
            >
                <Link
                    href="/builders/designer"
                    className="text-xs px-3 py-1.5 rounded border border-default bg-paper hover:border-default-strong"
                >
                    ← Assemblies
                </Link>
                <span className="text-sm font-semibold text-ink-heading">{resolved.name}</span>
                <span className="font-mono text-xs text-ink-muted">/{slug}</span>
                <span
                    className="text-[10px] uppercase tracking-widest text-ink-muted rounded bg-subtle px-2 py-0.5"
                    data-testid="view-source-badge"
                >
                    {sourceLabel}
                </span>
                {actionButton}
            </div>
            <div className="container mx-auto px-6 pt-8 pb-16 max-w-5xl">
                <ProcessGraphCanvas
                    orders={resolved.orders}
                    title={`${resolved.name} (read-only)`}
                    designerMode
                />
            </div>
        </div>
    );
}
