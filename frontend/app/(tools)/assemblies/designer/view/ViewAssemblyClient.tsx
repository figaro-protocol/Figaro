"use client";

/**
 * ViewAssemblyClient — read-only inspect view for an assembly. Resolves
 * a slug from one of two sources, in priority order:
 *
 *   1. localStorage draft (loadNamedDraft) — work-in-progress in this
 *      browser.
 *   2. On-chain published assembly — AssemblyRegistered event filtered
 *      by its derived slug (a pure function of the indexed compositionHash),
 *      then the assemblyTemplate fetched from IPFS via contentURI and verified
 *      against the anchored compositionHash.
 *
 * If the slug exists in both places, the draft wins (it's more current
 * by definition; the on-chain one is the prior snapshot). If neither,
 * the error UI surfaces a clear message.
 *
 * Renders the same `TopologyCanvas` as /new and /edit/[slug] in
 * designerMode (so per-node clauses/values surface via the lens
 * overlays), but with no edit handlers — drag-add, delete, drawer
 * mutations all absent. The `AgreementDrawer` mounts in read-only
 * mode so clicking a node surfaces its clauses/clauses without
 * permitting edits. The action button at the right of the toolbar is
 * "Edit" for drafts and "Fork" for published assemblies.
 *
 * WHAT IT SHOWS IS WHAT IT PUBLISHES. Every composed term on this page —
 * the per-node clauses, the drawer's ticks, the assembly-scoped terms — is
 * read out of the assembly TEMPLATE: for a draft, the one built by the same
 * `draftToAssemblyTemplate` walk publish anchors; for a published assembly,
 * the pinned bytes. And in review mode publish is reachable only while that
 * template builds and the stored draft still hashes to the composition on
 * screen, so an irreversible anchor can never carry terms this page did not
 * show.
 */

import Link from "next/link";
import { extractErrorMessage } from "@/lib/shared/errors";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useAccount, useChainId, usePublicClient } from "wagmi";
import { cachedGetContractEvents } from "@/lib/kernel/eventCache";
import { TopologyCanvas } from "@/components/runtime/TopologyCanvas";
import { Button } from "@/components/ui/Button";
import { TransactionReceipt } from "@/components/shared/TransactionReceipt";
import { AgreementDrawer } from "../_components/AgreementDrawer";
import { AssemblyTermsPanel } from "../_components/AssemblyTermsPanel";
import { CompositionIdentity } from "../_components/CompositionIdentity";
import {
    deleteNamedDraft,
    loadNamedDraft,
    clearCurrentSession,
} from "@/lib/designer/syntheticDesignStore";
import { ASSEMBLY_REGISTRY_ABI } from "@/lib/kernel/contracts";
import {
    fetchAssemblyTemplate,
    getAssemblyRegistry,
    useWithdrawAssembly,
} from "@/lib/protocol/useAssemblyRegistry";
import { useWithdrawGate, withdrawBlockedReason, withdrawUnverifiedCaveat } from "@/lib/protocol/withdrawGate";
import { usePublishAssembly } from "@/lib/designer/publishAssembly";
import { templateToOrders } from "@/lib/designer/assemblyTemplateToDraft";
import {
    projectSnapshotForReview,
    templateComposedByAgreement,
} from "@/lib/designer/draftToAssemblyTemplate";
import { useClauseSpecs } from "@/lib/protocol/useClauseSpecs";
import { deriveAssemblySlug, type AssemblyTemplate } from "@/lib/shared/assemblyTemplate";
import { forkPublishedAssembly } from "@/lib/designer/forkAssembly";
import { hexEqual } from "@/lib/shared/evm";
import type { Order } from "@/lib/kernel/store";
import type { DesignSnapshot } from "@/lib/designer/syntheticDesignStore";

type ResolvedSource =
    | { kind: "loading" }
    | { kind: "draft"; name: string; orders: Order[]; snapshot: DesignSnapshot }
    | {
        kind: "published";
        name: string;
        orders: Order[];
        assemblyTemplate: AssemblyTemplate;
        /** The on-chain binding — needed to gate the registeredBy-only reclaim. */
        registeredBy: `0x${string}`;
        compositionHash: `0x${string}`;
        /** Whether the registration stake has already been reclaimed. */
        stakeWithdrawn: boolean;
    }
    | { kind: "error"; message: string };

export function ViewAssemblyClient({ slug }: { slug: string }) {
    const router = useRouter();
    const client = usePublicClient();
    const chainId = useChainId();
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
    const { address } = useAccount();
    const { withdraw } = useWithdrawAssembly();
    const [withdrawing, setWithdrawing] = useState(false);
    const [withdrawError, setWithdrawError] = useState<string | null>(null);
    // The advisory commits==resolves gate for THIS assembly — in-flight deals
    // composed from it (derived from chain + IPFS by the SDK). Null (no
    // assembly) for drafts/errors; the hook no-ops. The reclaim affordance
    // reads `.canWithdraw`.
    const { gate: withdrawGate } = useWithdrawGate(
        resolved.kind === "published"
            ? { kind: "assembly", template: resolved.assemblyTemplate }
            : null,
    );
    // `templateToOrders` builds synthetic agreements through the chain-loaded
    // clause specs; the on-chain resolution path below waits for the cache
    // (the `useClauseSpecs` contract). Drafts don't build, so they resolve
    // immediately regardless.
    const { loaded: clauseSpecsLoaded, version: clauseSpecsVersion } = useClauseSpecs();

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
                    // The slug is not on-chain — it is derived from the
                    // indexed compositionHash, so resolution scans the event
                    // log for the binding whose derived slug matches.
                    // Through the event cache (deployment block, adaptive
                    // chunks — public gateways cap `eth_getLogs` ranges).
                    const allLogs = await cachedGetContractEvents(client, chainId, {
                        address: registry,
                        abi: ASSEMBLY_REGISTRY_ABI,
                        eventName: "AssemblyRegistered",
                    });
                    if (cancelled) return;
                    const logs = allLogs.filter(
                        (l) => deriveAssemblySlug((l.args as { compositionHash?: `0x${string}` } | undefined)?.compositionHash as `0x${string}`) === slug,
                    );
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
                    const log = logs[0] as { args: { contentURI?: string; compositionHash?: `0x${string}`; registeredBy?: `0x${string}` } };
                    const contentURI = (log.args.contentURI ?? "") as string;
                    const compositionHash = log.args.compositionHash as `0x${string}`;
                    const assemblyTemplate = await fetchAssemblyTemplate(
                        contentURI,
                        compositionHash,
                    );
                    if (cancelled) return;
                    if (!assemblyTemplate) {
                        setResolved({
                            kind: "error",
                            message:
                                "Assembly content could not be fetched from IPFS (or failed integrity verification against the anchored composition hash). The on-chain identity is anchored regardless.",
                        });
                        return;
                    }
                    // The binding is authoritative for registeredBy + withdrawn state
                    // (registeredBy is also an indexed event topic, but reading the
                    // binding also tells us whether the stake was already
                    // reclaimed). A read failure falls back to the event's registeredBy
                    // and a not-yet-withdrawn assumption.
                    let registeredBy = log.args.registeredBy as `0x${string}`;
                    let stakeWithdrawn = false;
                    try {
                        const binding = (await client.readContract({
                            address: registry,
                            abi: ASSEMBLY_REGISTRY_ABI,
                            functionName: "bindings",
                            args: [compositionHash],
                        })) as readonly [`0x${string}`, bigint, boolean, string];
                        registeredBy = binding[0];
                        stakeWithdrawn = binding[2];
                    } catch {
                        /* fall back to the event's registeredBy, stakeWithdrawn=false */
                    }
                    if (cancelled) return;
                    const orders = templateToOrders(assemblyTemplate);
                    // The editorial name the designer published; the
                    // content-derived slug is the fallback (and the identity).
                    setResolved({
                        kind: "published",
                        name: assemblyTemplate.name ?? slug,
                        orders,
                        assemblyTemplate,
                        registeredBy,
                        compositionHash,
                        stakeWithdrawn,
                    });
                    return;
                } catch (err) {
                    if (cancelled) return;
                    // Treat a thrown error as terminal — don't retry through
                    // a 500 from the provider, that's a different failure.
                    setResolved({
                        kind: "error",
                        message: extractErrorMessage(err, "Loading the assembly failed."),
                    });
                    return;
                }
            }
        })();

        return () => {
            cancelled = true;
        };
    }, [slug, client, chainId, justPublished, clauseSpecsLoaded]);

    /**
     * THE composition this screen shows — read out of the very bytes the
     * publish call will anchor (a draft, projected through the one
     * draft→template walk) or out of the pinned bytes themselves (a published
     * assembly). Never a second reading of the draft: a review that projected
     * the composition its own way could — and did — show an order as empty
     * while publish anchored its terms.
     *
     * The spec cache is an input to the walk (the mandatory clauses fold from
     * it, and scope is verified against it), so a warm re-runs the projection.
     */
    const review = useMemo(
        () => (resolved.kind === "draft" ? projectSnapshotForReview(resolved.snapshot) : null),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [resolved, clauseSpecsVersion],
    );
    /** canvas order id → clauseId → composed values, exactly as the template states it. */
    const composedByOrderId = useMemo(() => {
        if (resolved.kind === "published") return templateComposedByAgreement(resolved.assemblyTemplate);
        return review?.ok ? review.composedByOrderId : {};
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [resolved, review, clauseSpecsVersion]);
    /** The assembly-scoped terms the composition carries — composed once for the
     *  whole design, folded into every agreement at checkout. */
    const composedAssemblyClauses = useMemo(() => {
        if (resolved.kind === "published") return resolved.assemblyTemplate.assemblyClauses ?? {};
        return review?.ok ? review.assemblyClauses : {};
    }, [resolved, review]);

    const handleConfirmPublish = useCallback(async () => {
        if (resolved.kind !== "draft") return;
        // One template, one hash. `review` is the composition this screen
        // rendered; the anchor is permanent, so publish is only reachable when
        // that composition still builds AND the stored draft still hashes to
        // it. Either check failing means the terms on screen are not the terms
        // that would go out — refuse before the wallet, never publish blind.
        if (!review?.ok) {
            setPublishError(
                review?.error
                    ?? "This composition could not be built, so there is nothing verified to publish.",
            );
            return;
        }
        const stored = loadNamedDraft(resolved.snapshot.slug);
        const storedReview = stored ? projectSnapshotForReview(stored) : null;
        if (storedReview && (!storedReview.ok
            || !hexEqual(storedReview.compositionHash, review.compositionHash))) {
            setPublishError(
                "This draft changed after it was opened for review, so what is on screen is no "
                + "longer what would be published. Nothing was published — go back to the editor "
                + "and review it again.",
            );
            return;
        }
        setConfirming(true);
        setPublishError(null);
        try {
            const outcome = await publish(resolved.snapshot, review.compositionHash);
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
            setPublishError(extractErrorMessage(err, "Publishing the assembly failed."));
            // Stay on the review page so the user can hit "← Back to editor"
            // and fix the underlying problem (e.g. rename the slug).
        } finally {
            setConfirming(false);
        }
    }, [resolved, publish, review]);

    const handleContinueAfterPublish = useCallback(() => {
        // Don't clear receipt locally — that triggers a re-render of the
        // underlying review canvas (banner + Confirm publish button) for
        // one paint before router.push completes, which reads as
        // "shoots me through another page". Letting the component unmount
        // on route change is sufficient cleanup.
        router.push("/assemblies/designer");
    }, [router]);

    const handleWithdraw = useCallback(async () => {
        if (resolved.kind !== "published") return;
        setWithdrawing(true);
        setWithdrawError(null);
        try {
            await withdraw(resolved.compositionHash);
            // Reflect the reclaim locally — the binding stays; only the stake moved.
            setResolved((prev) => (prev.kind === "published" ? { ...prev, stakeWithdrawn: true } : prev));
        } catch (err) {
            setWithdrawError(extractErrorMessage(err, "Withdrawing the deposit failed."));
        } finally {
            setWithdrawing(false);
        }
    }, [resolved, withdraw]);

    const handleFork = useCallback(async () => {
        if (resolved.kind !== "published") return;
        setForking(true);
        try {
            const outcome = forkPublishedAssembly(slug, resolved.assemblyTemplate);
            if (!outcome) return;
            router.push(`/assemblies/designer/edit?slug=${encodeURIComponent(outcome.finalSlug)}`);
        } catch (err) {
            window.alert(`Fork failed: ${extractErrorMessage(err, "unknown error")}`);
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
                    href="/assemblies/designer"
                    className="text-xs px-3 py-1.5 rounded border border-default bg-paper hover:border-default-strong"
                >
                    ← Back to assemblies
                </Link>
            </div>
        );
    }

    // Receipt state: publish succeeded, awaiting seller dismissal.
    // Mirrors the seller wizard's post-publish receipt: a persistent
    // record of the tx hash + IPFS URI, not a dismissible alert.
    if (receipt) {
        return (
            <TransactionReceipt
                testId="assembly-publish-receipt"
                className="min-h-screen bg-canvas p-8 flex flex-col items-start gap-6 max-w-2xl mx-auto"
                heading="Published."
                headingAs="h1"
                headingClassName="text-heading-h2 text-ink-heading"
                prose={
                    <>
                        The slug <code data-testid="receipt-slug">{receipt.slug}</code> is now anchored on
                        the AssemblyRegistry. The assemblyTemplate is pinned to IPFS;
                        the slug binding is irreversible.
                    </>
                }
                proseClassName="text-sm text-ink-body"
                rows={[
                    { label: "Transaction", value: receipt.hash },
                    { label: "IPFS URI", value: receipt.ipfsURI },
                ]}
                rowsClassName="text-xs text-ink-body space-y-2 pt-2 border-t border-default w-full"
                actions={
                    <div className="flex items-center gap-3 pt-2">
                        <Link
                            href={`/assemblies/designer/view?slug=${encodeURIComponent(receipt.slug)}&just-published=1`}
                            className="text-sm text-ink-faint hover:text-ink-heading underline"
                            title={`Opens the public read-only view at /assemblies/designer/view?slug=${receipt.slug}`}
                        >
                            Open public read-only view →
                        </Link>
                        <Button
                            type="button"
                            size="sm"
                            onClick={handleContinueAfterPublish}
                            className="font-semibold"
                            data-testid="receipt-continue"
                        >
                            Continue to assemblies
                        </Button>
                    </div>
                }
            />
        );
    }

    const orders = resolved.orders;
    // The connected wallet authored this published assembly — the reclaim
    // affordance (and its caveat strip) renders only for them.
    const isAuthor =
        resolved.kind === "published" && !!address && hexEqual(resolved.registeredBy, address);
    // Unverifiable in-flight deals: informational only (party-private terms),
    // never disabling. Shown visibly while the reclaim is still available.
    const withdrawCaveat =
        isAuthor && !resolved.stakeWithdrawn ? withdrawUnverifiedCaveat(withdrawGate) : null;
    // Editorial prose the designer attached — read from the pinned template
    // (published) or the local snapshot (draft). Both optional.
    const editorial =
        resolved.kind === "published"
            ? resolved.assemblyTemplate
            : resolved.kind === "draft"
                ? resolved.snapshot
                : undefined;
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
                href={`/assemblies/designer/edit?slug=${encodeURIComponent(slug)}`}
                className="text-xs px-3 py-1.5 rounded border border-default bg-paper hover:border-default-strong text-ink-heading"
                data-testid="review-back-to-editor"
            >
                ← Back to editor
            </Link>
            <Button
                type="button"
                size="compact"
                onClick={handleConfirmPublish}
                // Gated on the spec cache: the publish build folds the MANDATORY
                // mandatory clauses from loaded specs — confirming before the
                // chain→IPFS warm completes would throw "no mandatory clauses".
                // And gated on the composition BUILDING: an assembly whose
                // template this screen could not derive is one whose terms it
                // could not show, so it must not be anchorable from here.
                disabled={confirming || !clauseSpecsLoaded || !review?.ok}
                className="font-semibold"
                data-testid="review-confirm-publish"
                title="Pin the assembly template to IPFS, lock the registration deposit, anchor the slug on-chain. Irreversible."
            >
                {confirming
                    ? "Publishing…"
                    : !clauseSpecsLoaded
                        ? "Loading clause specs…"
                        : review?.ok
                            ? "Confirm publish — irreversible"
                            : "Composition unavailable"}
            </Button>
        </div>
    ) : resolved.kind === "draft" ? (
        <Link
            href={`/assemblies/designer/edit?slug=${encodeURIComponent(slug)}`}
            className="ml-auto text-xs px-3 py-1.5 rounded border border-ink-heading bg-paper hover:bg-subtle text-ink-heading font-semibold"
            data-testid="view-edit-button"
        >
            Edit
        </Link>
    ) : (
        <div className="ml-auto flex items-center gap-2">
            {isAuthor && (
                <Button
                    type="button"
                    variant="outline"
                    size="compact"
                    onClick={handleWithdraw}
                    // Author-only reclaim, gated by the advisory commits==resolves
                    // gate: disabled while any VERIFIED in-flight deal composes
                    // this assembly, while the gate is unknown (loading /
                    // chain-read failure), or once already reclaimed. Unverified
                    // deals never disable — they render as the caveat strip
                    // below the toolbar. The title names why.
                    disabled={withdrawing || resolved.stakeWithdrawn || withdrawGate === null || withdrawGate.inFlightCount > 0}
                    className="border-default text-ink-heading font-semibold"
                    data-testid="view-withdraw-button"
                    title={
                        resolved.stakeWithdrawn
                            ? "This assembly's registration stake has already been reclaimed."
                            : (withdrawBlockedReason(withdrawGate)
                                ?? "Reclaim your registration stake. The binding stays anchored; the assembly de-surfaces for new orders.")
                    }
                >
                    {resolved.stakeWithdrawn ? "Stake reclaimed" : withdrawing ? "Reclaiming…" : "Reclaim stake"}
                </Button>
            )}
            <Button
                type="button"
                variant="outline"
                size="compact"
                onClick={handleFork}
                disabled={forking}
                className="border-ink-heading text-ink-heading font-semibold"
                data-testid="view-fork-button"
            >
                {forking ? "Forking…" : "Fork"}
            </Button>
        </div>
    );

    const selectedOrder = selectedOrderId
        ? (orders.find((o) => o.orderHash === selectedOrderId) ?? null)
        : null;

    return (
        <div className="h-screen bg-canvas flex flex-col" data-testid="assembly-view-page">
            {inReviewMode && (
                <div
                    className="px-8 py-3 border-b border-warning/30 bg-warning/10 shrink-0"
                    data-testid="review-banner"
                    role="status"
                >
                    <p className="text-sm font-semibold text-warning-fg">
                        Review before publish — this action is irreversible.
                    </p>
                    <p className="text-xs text-warning-fg mt-1 max-w-3xl leading-relaxed">
                        Confirming will pin the assembly assemblyTemplate to IPFS, lock the
                        registration deposit, and anchor the slug{" "}
                        <code className="font-mono">/{slug}</code> on-chain. The slug
                        binding is permanent — once registered it cannot be reassigned,
                        renamed, or transferred. The canvas below is read-only;
                        click <strong>← Back to editor</strong> to make changes
                        before confirming.
                    </p>
                    {review && !review.ok && (
                        <p
                            className="text-xs text-error-fg mt-2 max-w-3xl leading-relaxed"
                            role="alert"
                            data-testid="review-composition-error"
                        >
                            This composition could not be built, so its terms cannot be shown and
                            it cannot be published from here: {review.error}
                        </p>
                    )}
                </div>
            )}
            <div
                data-testid="view-toolbar"
                className="px-8 py-4 border-b border-default bg-paper flex items-center gap-3 flex-wrap shrink-0"
            >
                <Link
                    href="/assemblies/designer"
                    className="text-xs px-3 py-1.5 rounded border border-default bg-paper hover:border-default-strong"
                >
                    ← Assemblies
                </Link>
                <span className="text-sm font-semibold text-ink-heading">{resolved.name}</span>
                <span className="font-mono text-xs text-ink-muted">/{slug}</span>
                <span
                    className={`text-[10px] uppercase tracking-widest rounded px-2 py-0.5 ${inReviewMode ? "bg-warning/20 text-warning-fg border border-warning/30" : "text-ink-muted bg-subtle"}`}
                    data-testid="view-source-badge"
                >
                    {sourceLabel}
                </span>
                {actionButton}
            </div>
            {(editorial?.summary || editorial?.description) && (
                <div
                    data-testid="view-editorial"
                    className="px-8 py-3 border-b border-default bg-paper space-y-1 shrink-0"
                >
                    {editorial.summary && (
                        <p className="text-sm text-ink-heading" data-testid="view-summary">
                            {editorial.summary}
                        </p>
                    )}
                    {editorial.description && (
                        <p className="text-xs text-ink-muted whitespace-pre-line" data-testid="view-description">
                            {editorial.description}
                        </p>
                    )}
                </div>
            )}
            {publishError && (
                <div className="px-6 py-3 border-b border-default bg-subtle">
                    <p className="text-sm text-error-fg" role="alert" data-testid="publish-error">
                        Publish failed: {publishError}
                    </p>
                </div>
            )}
            {withdrawError && (
                <div className="px-6 py-3 border-b border-default bg-subtle">
                    <p className="text-sm text-error-fg" role="alert" data-testid="withdraw-error">
                        Reclaim failed: {withdrawError}
                    </p>
                </div>
            )}
            {withdrawCaveat && (
                <div className="px-6 py-3 border-b border-default bg-subtle">
                    <p className="text-xs text-ink-muted" role="status" data-testid="withdraw-caveat">
                        {withdrawCaveat}
                    </p>
                </div>
            )}
            <div className="flex-1 overflow-hidden flex flex-row">
                {/* LEFT — the composition's whole-assembly face: the identity a
                    designer compared on the canvas, and the assembly-scoped
                    terms (a dispute forum, an applicable law, a pinned
                    settlement token) that fold into EVERY agreement at
                    checkout. Read-only here; without it a review would omit
                    terms the designer composed. */}
                {(inReviewMode || Object.keys(composedAssemblyClauses).length > 0) && (
                    <aside
                        data-testid="view-assembly-terms"
                        className="w-[300px] shrink-0 overflow-y-auto border-r border-default bg-paper px-5 py-4 space-y-4"
                    >
                        {resolved.kind === "draft" && (
                            <CompositionIdentity snapshot={resolved.snapshot} />
                        )}
                        <AssemblyTermsPanel
                            values={composedAssemblyClauses}
                            onToggleClause={() => { /* read-only */ }}
                            onSetClauseField={() => { /* read-only */ }}
                            readOnly
                        />
                    </aside>
                )}
                <div className="flex-1 overflow-hidden">
                    <div className="h-full px-6 py-4 flex flex-col">
                        <TopologyCanvas
                            orders={orders}
                            clauseValuesByOrderId={composedByOrderId}
                            title={`${resolved.name} (read-only)`}
                            designerMode
                            onSelectNode={setSelectedOrderId}
                        />
                    </div>
                </div>
                <AgreementDrawer
                    order={selectedOrder}
                    onClose={() => setSelectedOrderId(null)}
                    selectedClauseValues={
                        selectedOrderId ? (composedByOrderId[selectedOrderId] ?? {}) : undefined
                    }
                    embedded
                    readOnly
                />
            </div>
        </div>
    );
}
