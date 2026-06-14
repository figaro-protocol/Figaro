"use client";

/**
 * ViewAssemblyClient — read-only inspect view for an assembly. Resolves
 * a slug from one of two sources, in priority order:
 *
 *   1. localStorage draft (loadNamedDraft) — work-in-progress in this
 *      browser.
 *   2. On-chain published assembly — AssemblyRegistered event filtered
 *      by slugHash, then the assemblyTemplate fetched from IPFS via metadataURI.
 *
 * If the slug exists in both places, the draft wins (it's more current
 * by definition; the on-chain one is the prior snapshot). If neither,
 * the error UI surfaces a clear message.
 *
 * Renders the same `ProcessGraphCanvas` as /new and /edit/[slug] in
 * designerMode (so per-node clauses/values surface via the lens
 * overlays), but with no edit handlers — drag-add, delete, drawer
 * mutations all absent. The `AgreementDrawer` mounts in read-only
 * mode so clicking a node surfaces its clauses/clauses without
 * permitting edits. The action button at the right of the toolbar is
 * "Edit" for drafts and "Fork" for published assemblies.
 */

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { keccak256, toBytes } from "viem";
import { usePublicClient } from "wagmi";
import { ProcessGraphCanvas } from "@/components/core/ProcessGraphCanvas";
import { AgreementDrawer } from "../../_components/AgreementDrawer";
import {
    deleteNamedDraft,
    loadNamedDraft,
    clearCurrentSession,
} from "@/lib/designer/syntheticDesignStore";
import {
    ASSEMBLY_REGISTRY_ABI,
    fetchAssemblyTemplate,
    getAssemblyRegistry,
    usePublishAssembly,
} from "@/lib/mechanisms/useAssemblyRegistry";
import { templateToOrders } from "@/lib/designer/assemblyTemplateToDraft";
import { useClauseSpecs } from "@/lib/mechanisms/useClauseSpecs";
import type { AssemblyTemplate } from "@/lib/designer/assemblyTemplate";
import { forkPublishedAssembly } from "@/lib/designer/forkAssembly";
import type { Order } from "@/lib/core/store";
import type { DesignSnapshot } from "@/lib/designer/syntheticDesignStore";

type ResolvedSource =
    | { kind: "loading" }
    | { kind: "draft"; name: string; orders: Order[]; snapshot: DesignSnapshot }
    | {
        kind: "published";
        name: string;
        orders: Order[];
        assemblyTemplate: AssemblyTemplate;
    }
    | { kind: "error"; message: string };

export function ViewAssemblyClient({ slug }: { slug: string }) {
    const router = useRouter();
    const client = usePublicClient();
    const searchParams = useSearchParams();
    const isPublishReview = searchParams.get("intent") === "publish";
    /** Hint set by the publish-receipt's "Open public read-only view" link.
     *  When true, the on-chain lookup retries with bounded backoff to ride
     *  out the gap between AssemblyRegistered emission and the provider's
     *  log-query reflecting it. Without the hint, lookups single-shot so
     *  non-existent slugs 404 fast. */
    const justPublished = searchParams.get("just-published") === "1";
    const [resolved, setResolved] = useState<ResolvedSource>({ kind: "loading" });
    const [forking, setForking] = useState(false);
    const [confirming, setConfirming] = useState(false);
    const [selectedOrderId, setSelectedOrderId] = useState<string | null>(null);
    // Receipt held in local state — persists until the user clicks
    // Continue. Mirrors the seller wizard's post-publish pattern.
    // Replaces the prior window.alert(`Published. IPFS: … Tx: …`)
    // which got dismissed instantly and gave no persistent record.
    const [receipt, setReceipt] = useState<{
        hash: `0x${string}`;
        ipfsURI: string;
        slug: string;
    } | null>(null);
    const [publishError, setPublishError] = useState<string | null>(null);
    const { publish } = usePublishAssembly();
    // `templateToOrders` builds synthetic agreements through the chain-loaded
    // clause specs; the on-chain resolution path below waits for the cache
    // (the `useClauseSpecs` contract). Drafts don't build, so they resolve
    // immediately regardless.
    const { loaded: clauseSpecsLoaded } = useClauseSpecs();

    useEffect(() => {
        // Local draft first — more current than any on-chain snapshot.
        const draft = loadNamedDraft(slug);
        if (draft) {
            setResolved({ kind: "draft", name: draft.name, orders: draft.orders, snapshot: draft });
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
        // Spec gate — hold the on-chain resolution (it ends in templateToOrders)
        // until the clause-spec cache is warm; `resolved` stays "loading".
        if (!clauseSpecsLoaded) return;

        const slugHash = keccak256(toBytes(slug));
        let cancelled = false;

        // Backoff schedule for the post-publish indexer race. Single-shot
        // for cold loads (justPublished=false) so non-existent slugs 404
        // fast. Bounded total wait ~3.75s — past that we give up rather
        // than block the page indefinitely on a misfiring provider.
        const backoffsMs = justPublished ? [0, 250, 500, 1000, 2000] : [0];

        (async () => {
            for (let attempt = 0; attempt < backoffsMs.length; attempt += 1) {
                if (cancelled) return;
                if (backoffsMs[attempt] > 0) {
                    await new Promise((r) => setTimeout(r, backoffsMs[attempt]));
                    if (cancelled) return;
                }
                try {
                    const logs = await client.getContractEvents({
                        address: registry,
                        abi: ASSEMBLY_REGISTRY_ABI,
                        eventName: "AssemblyRegistered",
                        args: { slugHash },
                        fromBlock: 0n,
                        toBlock: "latest",
                    });
                    if (cancelled) return;
                    if (logs.length === 0) {
                        // Last attempt — surface not-found. Earlier attempts
                        // fall through to the next backoff window.
                        if (attempt === backoffsMs.length - 1) {
                            setResolved({
                                kind: "error",
                                message: `Slug "${slug}" not found in localStorage drafts or on-chain.`,
                            });
                        }
                        continue;
                    }
                    const log = logs[0];
                    const metadataURI = (log.args.metadataURI ?? "") as string;
                    const assemblyTemplate = await fetchAssemblyTemplate(metadataURI);
                    if (cancelled) return;
                    if (!assemblyTemplate) {
                        setResolved({
                            kind: "error",
                            message:
                                "Manifest could not be fetched from IPFS. The on-chain identity is anchored regardless; the off-chain content is currently unreachable.",
                        });
                        return;
                    }
                    const orders = templateToOrders(assemblyTemplate);
                    setResolved({ kind: "published", name: slug, orders, assemblyTemplate });
                    return;
                } catch (err) {
                    if (cancelled) return;
                    // Treat a thrown error as terminal — don't retry through
                    // a 500 from the provider, that's a different failure.
                    setResolved({
                        kind: "error",
                        message: err instanceof Error ? err.message : String(err),
                    });
                    return;
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [slug, client, justPublished, clauseSpecsLoaded]);

    const handleConfirmPublish = useCallback(async () => {
        if (resolved.kind !== "draft") return;
        setConfirming(true);
        setPublishError(null);
        try {
            const outcome = await publish(resolved.snapshot);
            // publish() waits for receipt-confirmed status:success, so
            // it's safe to delete the named draft + clear the session here.
            clearCurrentSession();
            deleteNamedDraft(resolved.snapshot.slug);
            // Hold the receipt; the seller clicks Continue to leave.
            setReceipt({
                hash: outcome.hash,
                ipfsURI: outcome.ipfsURI,
                slug: outcome.slug,
            });
        } catch (err) {
            setPublishError(err instanceof Error ? err.message : String(err));
            // Stay on the review page so the user can hit "← Back to editor"
            // and fix the underlying problem (e.g. rename the slug).
        } finally {
            setConfirming(false);
        }
    }, [resolved, publish]);

    const handleContinueAfterPublish = useCallback(() => {
        // Don't clear receipt locally — that triggers a re-render of the
        // underlying review canvas (banner + Confirm publish button) for
        // one paint before router.push completes, which reads as
        // "shoots me through another page". Letting the component unmount
        // on route change is sufficient cleanup.
        router.push("/builders/designer");
    }, [router]);

    const handleFork = useCallback(async () => {
        if (resolved.kind !== "published") return;
        setForking(true);
        try {
            const outcome = forkPublishedAssembly(slug, resolved.assemblyTemplate);
            if (!outcome) return;
            router.push(`/builders/designer/edit/${encodeURIComponent(outcome.finalSlug)}`);
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

    // Receipt state: publish succeeded, awaiting seller dismissal.
    // Mirrors the seller wizard's post-publish receipt — replaces the
    // prior window.alert that the user dismissed instantly with no
    // persistent record of the tx hash + IPFS URI.
    if (receipt) {
        return (
            <div
                className="min-h-screen bg-canvas p-8 flex flex-col items-start gap-6 max-w-2xl mx-auto"
                data-testid="assembly-publish-receipt"
            >
                <h1 className="text-heading-h2 text-ink-heading">Published.</h1>
                <p className="text-sm text-ink-body">
                    The slug <code>{receipt.slug}</code> is now anchored on
                    the AssemblyRegistry. The assemblyTemplate is pinned to IPFS;
                    the slug binding is irreversible.
                </p>
                <dl className="text-xs text-ink-body space-y-2 pt-2 border-t border-default w-full">
                    <div>
                        <dt className="text-ink-faint">Transaction</dt>
                        <dd className="font-mono break-all">{receipt.hash}</dd>
                    </div>
                    <div>
                        <dt className="text-ink-faint">IPFS URI</dt>
                        <dd className="font-mono break-all">{receipt.ipfsURI}</dd>
                    </div>
                </dl>
                <div className="flex items-center gap-3 pt-2">
                    <Link
                        href={`/builders/designer/view/${encodeURIComponent(receipt.slug)}?just-published=1`}
                        className="text-sm text-ink-faint hover:text-ink-heading underline"
                        title={`Opens the public read-only view at /builders/designer/view/${receipt.slug}`}
                    >
                        Open public read-only view →
                    </Link>
                    <button
                        type="button"
                        onClick={handleContinueAfterPublish}
                        className="text-xs px-3 py-1.5 rounded border border-ink-heading bg-ink-heading text-paper hover:bg-ink-primary font-semibold"
                        data-testid="receipt-continue"
                    >
                        Continue to assemblies
                    </button>
                </div>
            </div>
        );
    }

    const orders = resolved.orders;
    // `intent=publish` is only meaningful for drafts (publishing an
    // on-chain assembly is a no-op — slug bindings are immutable). For
    // any other resolved.kind, fall back to plain inspect.
    const inReviewMode = isPublishReview && resolved.kind === "draft";
    const sourceLabel = inReviewMode
        ? "review · pending publish"
        : resolved.kind === "draft"
            ? "draft"
            : "on-chain";
    const actionButton = inReviewMode ? (
        <div className="ml-auto flex items-center gap-2">
            <Link
                href={`/builders/designer/edit/${encodeURIComponent(slug)}`}
                className="text-xs px-3 py-1.5 rounded border border-default bg-paper hover:border-default-strong text-ink-heading"
                data-testid="review-back-to-editor"
            >
                ← Back to editor
            </Link>
            <button
                type="button"
                onClick={handleConfirmPublish}
                disabled={confirming}
                className="text-xs px-3 py-1.5 rounded border border-ink-heading bg-ink-heading text-paper hover:bg-ink-primary font-semibold disabled:opacity-40 disabled:cursor-not-allowed"
                data-testid="review-confirm-publish"
                title="Pin the assembly template to IPFS, lock the registration deposit, anchor the slug on-chain. Irreversible."
            >
                {confirming ? "Publishing…" : "Confirm publish — irreversible"}
            </button>
        </div>
    ) : resolved.kind === "draft" ? (
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

    const selectedOrder = selectedOrderId
        ? (orders.find((o) => o.id === selectedOrderId) ?? null)
        : null;

    return (
        <div className="h-screen bg-canvas flex flex-col" data-testid="assembly-view-page">
            {inReviewMode && (
                <div
                    className="px-8 py-3 border-b border-amber-200 bg-amber-50 shrink-0"
                    data-testid="review-banner"
                    role="status"
                >
                    <p className="text-sm font-semibold text-amber-900">
                        Review before publish — this action is irreversible.
                    </p>
                    <p className="text-xs text-amber-800 mt-1 max-w-3xl leading-relaxed">
                        Confirming will pin the assembly assemblyTemplate to IPFS, lock the
                        registration deposit, and anchor the slug{" "}
                        <code className="font-mono">/{slug}</code> on-chain. The slug
                        binding is permanent — once registered it cannot be reassigned,
                        renamed, or transferred. The canvas below is read-only;
                        click <strong>← Back to editor</strong> to make changes
                        before confirming.
                    </p>
                </div>
            )}
            <div
                data-testid="view-toolbar"
                className="px-8 py-4 border-b border-default bg-paper flex items-center gap-3 flex-wrap shrink-0"
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
                    className={`text-[10px] uppercase tracking-widest rounded px-2 py-0.5 ${inReviewMode ? "bg-amber-100 text-amber-900 border border-amber-200" : "text-ink-muted bg-subtle"}`}
                    data-testid="view-source-badge"
                >
                    {sourceLabel}
                </span>
                {actionButton}
            </div>
            {publishError && (
                <div className="px-6 py-3 border-b border-default bg-subtle">
                    <p className="text-sm text-red-600" role="alert" data-testid="publish-error">
                        Publish failed: {publishError}
                    </p>
                </div>
            )}
            <div className="flex-1 overflow-hidden flex flex-row">
                <div className="flex-1 overflow-hidden">
                    <div className="h-full px-6 py-4 flex flex-col">
                        <ProcessGraphCanvas
                            orders={orders}
                            title={`${resolved.name} (read-only)`}
                            designerMode
                            onSelectNode={setSelectedOrderId}
                        />
                    </div>
                </div>
                <AgreementDrawer
                    order={selectedOrder}
                    onClose={() => setSelectedOrderId(null)}
                    embedded
                    readOnly
                />
            </div>
        </div>
    );
}
