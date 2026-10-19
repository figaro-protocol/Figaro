"use client";

/**
 * ViewAssemblyClient — read-only inspect view for an assembly. Resolves
 * a slug from one of two sources, in priority order:
 *
 *   1. localStorage draft (loadNamedDraft) — work-in-progress in this
 *      browser.
 *   2. On-chain published assembly — AssemblyRegistered event filtered
 *      by its derived slug (a pure function of the indexed compositionHash),
 *      then the assembly fetched from IPFS via contentURI and verified
 *      against the anchored compositionHash, and every agreement's
 *      registered agreement read from AgreementRegistry by key and verified
 *      against it (absent ⇒ the assembly is not shown).
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
 * read out of the assembly ASSEMBLY: for a draft, the one built by the same
 * `draftToAssembly` walk publish anchors; for a published assembly,
 * the pinned bytes. And in review mode publish is reachable only while that
 * assembly builds and the stored draft still hashes to the composition on
 * screen, so an irreversible anchor can never carry terms this page did not
 * show.
 */

import Link from "@/components/shared/Link";
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
    fetchHydratedAssembly,
    getAssemblyRegistry,
    useWithdrawAssembly,
} from "@/lib/protocol/useAssemblyRegistry";
import { useWithdrawGate, withdrawBlockedReason, withdrawUnverifiedCaveat } from "@/lib/protocol/withdrawGate";
import { usePublishAssembly } from "@/lib/designer/publishAssembly";
import { assemblyToOrders } from "@/lib/designer/assemblyToDraft";
import {
    projectSnapshotForReview,
    assemblyComposedByAgreement,
    composedClauseLabel,
    unfilledAssemblyTerms,
} from "@/lib/designer/draftToAssembly";
import { useClauseSpecs } from "@/lib/protocol/useClauseSpecs";
import type { HydratedAssembly } from "@figaro-protocol/sdk";
import { deriveAssemblySlug } from "@/lib/shared/assembly";
import { truncateHex } from "@/lib/shared/formatHex";
import { fetchRegisteredAgreement, useRegisteredAgreementsVersion } from "@/lib/protocol/useAgreementRegistry";
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
        hydratedAssembly: HydratedAssembly;
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
    // Continue. Mirrors the member wizard's post-publish pattern.
    // Replaces the prior window.alert(`Published. IPFS: … Tx: …`)
    // which got dismissed instantly and gave no persistent receipt.
    const [receipt, setReceipt] = useState<{
        hash: `0x${string}`;
        ipfsURI: string;
        slug: string;
        agreements: { agreementKey: `0x${string}`; hash: `0x${string}`; ipfsURI: string }[];
    } | null>(null);
    const [publishError, setPublishError] = useState<string | null>(null);
    const { publish } = usePublishAssembly();
    const { address } = useAccount();
    const { withdraw } = useWithdrawAssembly();
    const [withdrawing, setWithdrawing] = useState(false);
    const [withdrawError, setWithdrawError] = useState<string | null>(null);
    // The advisory commits==resolves gate for THIS assembly — in-flight trades
    // composed from it (derived from chain + IPFS by the SDK). Null (no
    // assembly) for drafts/errors; the hook no-ops. The reclaim affordance
    // reads `.canWithdraw`.
    const { gate: withdrawGate } = useWithdrawGate(
        resolved.kind === "published"
            ? { kind: "assembly", compositionHash: resolved.compositionHash }
            : null,
    );
    // `assemblyToOrders` builds synthetic agreements through the chain-loaded
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
        // Spec gate — hold the on-chain resolution (it ends in assemblyToOrders)
        // until the clause-spec cache is warm; `resolved` stays "loading".
        if (!clauseSpecsLoaded) return;

        let canceled = false;

        // Backoff schedule for the post-publish indexer race. Single-shot
        // for cold loads (justPublished=false) so non-existent slugs 404
        // fast. Bounded total wait ~3.75s — past that we give up rather
        // than block the page indefinitely on a misfiring provider.
        const backoffsMs = justPublished ? [0, 250, 500, 1000, 2000] : [0];

        (async () => {
            for (let attempt = 0; attempt < backoffsMs.length; attempt += 1) {
                if (canceled) return;
                if (backoffsMs[attempt] > 0) {
                    await new Promise((r) => setTimeout(r, backoffsMs[attempt]));
                    if (canceled) return;
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
                    if (canceled) return;
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
                    const hydratedAssembly = await fetchHydratedAssembly(
                        contentURI,
                        compositionHash,
                    );
                    if (canceled) return;
                    if (!hydratedAssembly) {
                        setResolved({
                            kind: "error",
                            message:
                                "Assembly content could not be read — the assembly or one of its agreements' registered agreements could not be fetched from IPFS, or failed verification against the key the chain anchors. The on-chain identity is anchored regardless.",
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
                    if (canceled) return;
                    const orders = assemblyToOrders(hydratedAssembly);
                    // The editorial name the designer published; the
                    // content-derived slug is the fallback (and the identity).
                    setResolved({
                        kind: "published",
                        name: hydratedAssembly.assembly.name ?? slug,
                        orders,
                        hydratedAssembly,
                        registeredBy,
                        compositionHash,
                        stakeWithdrawn,
                    });
                    return;
                } catch (err) {
                    if (canceled) return;
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
            canceled = true;
        };
    }, [slug, client, chainId, justPublished, clauseSpecsLoaded]);

    /**
     * THE composition this screen shows — read out of the very bytes the
     * publish call will anchor (a draft, projected through the one
     * draft→assembly walk) or out of the pinned bytes themselves (a published
     * assembly). Never a second reading of the draft: a review that projected
     * the composition its own way could — and did — show an order as empty
     * while publish anchored its terms.
     *
     * The spec cache is an input to the walk (every composed and picked
     * clause is read from it, and scope is verified against it), so a warm
     * re-runs the projection.
     */
    // The registered agreements a draft binds and picks in the mandatory
    // article are an input to the walk too: read each from the
    // AgreementRegistry (chain → IPFS, verified against its key) into the
    // session the build reads; each read re-runs it.
    const agreementsVersion = useRegisteredAgreementsVersion();
    useEffect(() => {
        if (resolved.kind !== "draft") return;
        for (const key of Object.values(resolved.snapshot.registeredByOrderId ?? {})) void fetchRegisteredAgreement(key);
        for (const key of Object.values(resolved.snapshot.mandatoryByOrderId ?? {})) void fetchRegisteredAgreement(key);
    }, [resolved]);
    const review = useMemo(
        () => (resolved.kind === "draft" ? projectSnapshotForReview(resolved.snapshot) : null),
        // eslint-disable-next-line react-hooks/exhaustive-deps
        [resolved, clauseSpecsVersion, agreementsVersion],
    );
    /** canvas order id → clause key → composed values, exactly as the assembly states it. */
    const composedByOrderId = useMemo(() => {
        if (resolved.kind === "published") return assemblyComposedByAgreement(resolved.hydratedAssembly);
        return review?.ok ? review.composedByOrderId : {};
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [resolved, review, clauseSpecsVersion]);
    /** The assembly-scoped terms the composition carries — composed once for the
     *  whole design, folded into every agreement at checkout. */
    const composedAssemblyClauses = useMemo(() => {
        if (resolved.kind === "published") return resolved.hydratedAssembly.assembly.assemblyClauses ?? {};
        return review?.ok ? review.assemblyClauses : {};
    }, [resolved, review]);
    // A required assembly term the assembly carries empty — the review says
    // which, and Confirm stays closed until the editor fills it.
    const missingTerms = useMemo(
        () => (resolved.kind === "draft" && review?.ok
            ? unfilledAssemblyTerms(review.assemblyClauses)
            : []),
        [resolved.kind, review],
    );
    /**
     * The registry's answer for the composition under review, read at the edge
     * (`AssemblyRegistry.bindings(compositionHash)`): `null` is resolved-empty —
     * nothing anchored, publish stays open; a binding means this composition is
     * already anchored (an unchanged fork, say: the name and descriptions sit
     * outside the hash), so publish could only revert. `undefined` is not yet
     * read, or a read that failed — publish stays open and its simulate remains
     * the backstop (`translatePublishRevert`).
     */
    const reviewedHash = isPublishReview && review?.ok ? review.compositionHash : null;
    const [anchoredBinding, setAnchoredBinding] = useState<{ registeredBy: `0x${string}` } | null | undefined>(undefined);
    useEffect(() => {
        setAnchoredBinding(undefined);
        const registry = getAssemblyRegistry();
        if (!reviewedHash || !client || !registry) return;
        let canceled = false;
        client.readContract({
            address: registry,
            abi: ASSEMBLY_REGISTRY_ABI,
            functionName: "bindings",
            args: [reviewedHash],
        }).then((binding) => {
            if (canceled) return;
            const [registeredBy, registeredAt] = binding as readonly [`0x${string}`, bigint, boolean, string];
            setAnchoredBinding(registeredAt > 0n ? { registeredBy } : null);
        }).catch(() => { /* unknown — publish's simulate stays the backstop */ });
        return () => {
            canceled = true;
        };
    }, [reviewedHash, client]);

    const handleConfirmPublish = useCallback(async () => {
        if (resolved.kind !== "draft") return;
        // One assembly, one hash. `review` is the composition this screen
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
        if (missingTerms.length > 0) {
            setPublishError(
                `Still to fill: ${missingTerms.map((m) => `${m.clauseTitle} · ${m.fieldLabel}`).join("; ")}. `
                + "A required assembly term is empty; go back to the editor and fill it.",
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
                agreements: outcome.agreements,
            });
        } catch (err) {
            setPublishError(extractErrorMessage(err, "Publishing the assembly failed."));
            // Stay on the review page so the user can hit "← Back to editor"
            // and fix the underlying problem (e.g. rename the slug).
        } finally {
            setConfirming(false);
        }
    }, [resolved, publish, review, missingTerms]);

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
            const outcome = forkPublishedAssembly(slug, resolved.hydratedAssembly);
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

    // Receipt state: publish succeeded, awaiting the designer's dismissal.
    // Mirrors the member wizard's post-publish receipt: a persistent
    // receipt of the tx hash + IPFS URI, not a dismissible alert.
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
                        the AssemblyRegistry. The assembly is pinned to IPFS;
                        the slug binding is irreversible.
                        {receipt.agreements.length > 0 && (
                            <> {receipt.agreements.length === 1 ? "One new agreement was" : `${receipt.agreements.length} new agreements were`}{" "}
                                registered on the AgreementRegistry first, one stake each.</>
                        )}
                    </>
                }
                proseClassName="text-sm text-ink-body"
                rows={[
                    ...receipt.agreements.flatMap((a, i) => [
                        { label: `Agreement ${i + 1} key`, value: a.agreementKey },
                        { label: `Agreement ${i + 1} transaction`, value: a.hash },
                        { label: `Agreement ${i + 1} IPFS URI`, value: a.ipfsURI },
                    ]),
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
    // The connected wallet designed this published assembly — the reclaim
    // affordance (and its caveat strip) renders only for them.
    const isAuthor =
        resolved.kind === "published" && !!address && hexEqual(resolved.registeredBy, address);
    // Unverifiable in-flight trades: informational only (party-private terms),
    // never disabling. Shown visibly while the reclaim is still available.
    const withdrawCaveat =
        isAuthor && !resolved.stakeWithdrawn ? withdrawUnverifiedCaveat(withdrawGate) : null;
    // Editorial prose the designer attached — read from the pinned assembly
    // (published) or the local snapshot (draft). Both optional.
    const editorial =
        resolved.kind === "published"
            ? resolved.hydratedAssembly.assembly
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
            {missingTerms.length > 0 && (
                <p className="text-xs text-warning-fg" data-testid="review-missing-terms">
                    Still to fill: {missingTerms.map((m) => `${m.clauseTitle} · ${m.fieldLabel}`).join("; ")}
                </p>
            )}
            <Button
                type="button"
                size="compact"
                onClick={handleConfirmPublish}
                // Gated on the spec cache: the publish build reads every
                // composed and picked clause from loaded specs — confirming
                // before the chain→IPFS warm completes would throw "spec is not loaded".
                // And gated on the composition BUILDING: an assembly whose
                // assembly this screen could not derive is one whose terms it
                // could not show, so it must not be anchorable from here.
                // And closed once the registry answers that this composition is
                // already anchored: the publish could only revert.
                disabled={confirming || !clauseSpecsLoaded || !review?.ok || missingTerms.length > 0 || !!anchoredBinding}
                className="font-semibold"
                data-testid="review-confirm-publish"
                title="Pin the assembly to IPFS, place the stake, anchor the slug on-chain. Irreversible."
            >
                {confirming
                    ? "Publishing…"
                    : !clauseSpecsLoaded
                        ? "Loading clause specs…"
                        : anchoredBinding
                            ? "Already anchored"
                        : review?.ok && missingTerms.length > 0
                            ? "Fill the required assembly terms"
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
                    // gate: disabled while any VERIFIED in-flight trade composes
                    // this assembly, while the gate is unknown (loading /
                    // chain-read failure), or once already reclaimed. Unverified
                    // trades never disable — they render as the caveat strip
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

    // The composition root and each agreement's agreement key — read from
    // the pinned assembly (published) or the review's build (draft).
    const entryAssembly = resolved.kind === "published"
        ? resolved.hydratedAssembly.assembly
        : review?.ok ? review.assembly : null;
    const composition = entryAssembly
        ? {
            compositionHash: resolved.kind === "published"
                ? resolved.compositionHash
                : (review?.ok ? review.compositionHash : ("0x" as `0x${string}`)),
            agreementKeys: entryAssembly.agreements.map((entry) => entry.agreementKey),
        }
        : null;
    // canvas order id → the agreement key its agreement binds: a published
    // assembly's canvas orders carry the agreement ids; a draft's are the
    // canvas orders in assembly order.
    const agreementKeyByOrderId: Record<string, `0x${string}`> = Object.fromEntries(
        orders.flatMap((order, index) => {
            const entry = resolved.kind === "published"
                ? entryAssembly?.agreements.find((a) => a.id === order.orderHash)
                : entryAssembly?.agreements[index];
            return entry ? [[order.orderHash, entry.agreementKey]] : [];
        }),
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
                        Confirming will register each newly agreement on the
                        AgreementRegistry (one stake each), pin the assembly to
                        IPFS, place the stake, and anchor the slug{" "}
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
                    {review?.ok && (
                        <div className="mt-2 max-w-3xl space-y-1" data-testid="review-agreements">
                            <p className="text-xs text-warning-fg leading-relaxed">
                                Composition root{" "}
                                <code className="font-mono" data-testid="review-composition-root" title={review.compositionHash}>
                                    {review.compositionHash}
                                </code>
                                . Each agreement binds one agreement by key:
                            </p>
                            <ul className="text-xs text-warning-fg font-mono space-y-0.5">
                                {review.entries.map((entry, index) => (
                                    <li key={entry.orderId} data-testid={`review-entry-${index}`} data-agreement-key={entry.agreementKey}>
                                        <span className="font-sans">Order {index + 1}: </span>
                                        <span title={entry.agreementKey}>{truncateHex(entry.agreementKey, { head: 10, tail: 6 })}</span>
                                        <span className="font-sans">
                                            {entry.bound
                                                ? " — registered agreement, bound as is"
                                                : " — composed here; registered on publish"}
                                        </span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                    {review?.ok && review.mandatory.length > 0 && (
                        <div className="mt-2 max-w-3xl space-y-1" data-testid="review-mandatory-clauses">
                            <p className="text-xs text-warning-fg leading-relaxed">
                                Mandatory clauses: they come from the registered agreement picked
                                in the mandatory article for each order. Anyone can register a
                                clause or an agreement, so check that each name, version and key
                                below is one you mean to publish; confirming publishes them with
                                this assembly.
                            </p>
                            <ul className="text-xs text-warning-fg font-mono space-y-0.5">
                                {review.mandatory.map((clause) => (
                                    <li key={clause.clauseKey} data-testid={`review-mandatory-${clause.clauseKey}`}>
                                        {composedClauseLabel(clause)}
                                        <span className="font-sans"> — {clause.title} (
                                            {clause.carriedBy[0] === "assembly"
                                                ? "assembly terms"
                                                : `${clause.carriedBy.length} of ${review.assembly.agreements.length} agreements`}
                                        )</span>
                                    </li>
                                ))}
                            </ul>
                        </div>
                    )}
                    {review?.ok && Object.values(review.composedClausesByOrderId).some((picks) => picks.length > 0) && (
                        <div className="mt-2 max-w-3xl space-y-1" data-testid="review-composed-clauses">
                            <p className="text-xs text-warning-fg leading-relaxed">
                                Your clauses, by order:
                            </p>
                            <ul className="text-xs text-warning-fg font-mono space-y-0.5">
                                {orders.map((order, index) => {
                                    const picks = review.composedClausesByOrderId[order.orderHash] ?? [];
                                    if (picks.length === 0) return null;
                                    return (
                                        <li key={order.orderHash} data-testid={`review-composed-order-${index}`}>
                                            <span className="font-sans">Order {index + 1}: </span>
                                            {picks.map((clause, i) => (
                                                <span key={clause.clauseKey} data-testid={`review-composed-${clause.clauseKey}`}>
                                                    {i > 0 ? ", " : ""}{composedClauseLabel(clause)}
                                                </span>
                                            ))}
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    )}
                    {review?.ok && anchoredBinding && (
                        <p
                            className="text-xs text-warning-fg mt-2 max-w-3xl leading-relaxed"
                            role="status"
                            data-testid="review-already-anchored"
                        >
                            This composition is already anchored on the AssemblyRegistry as{" "}
                            <Link
                                href={`/assemblies/designer/view?slug=${encodeURIComponent(deriveAssemblySlug(review.compositionHash))}`}
                                className="font-mono underline"
                            >
                                {deriveAssemblySlug(review.compositionHash)}
                            </Link>
                            . Its identity is the composition, and the name and descriptions sit outside
                            it, so publishing would anchor nothing new. To publish a different assembly,
                            change a composed clause or one of its values in the editor.
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
                    denomination) that fold into EVERY agreement at
                    checkout. Read-only here; without it a review would omit
                    terms the designer composed. */}
                {(inReviewMode || resolved.kind === "published" || Object.keys(composedAssemblyClauses).length > 0) && (
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
                            composition={composition ?? undefined}
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
                    boundAgreementKey={selectedOrderId ? agreementKeyByOrderId[selectedOrderId] : undefined}
                    embedded
                    readOnly
                />
            </div>
        </div>
    );
}
