/**
 * lib/protocol/assemblyChoices.ts — READING published assemblies.
 *
 * The enrichment layer over the on-chain `AssemblyRegistry` hooks
 * (`@/lib/protocol/useAssemblyRegistry`): every published assembly, enriched with
 * its lazily-fetched template (name, agreement count, clause set), projected into
 * the selectable/inspectable `AssemblyChoice` shape. Consumed by every
 * reading surface — the designer's published list, the member-profile
 * assembly picker, the marketing `/assemblies` inventory. AUTHORING (build /
 * pin / anchor) lives in `lib/designer/` — design is design; this module
 * only reads.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { activeChain } from "@/lib/shared/wagmi";
import { clauseIsProcessLog } from "@/lib/shared/clauseSpecSource";
import { templateParentOrderHashes, type AssemblyTemplate } from "@/lib/shared/assemblyTemplate";
import { DEVNET_CHAIN_ID } from "@/lib/shared/chains";
import { contentRetryDelayMs } from "@/lib/shared/ipfsService";
import {
    usePublishedAssemblies,
    fetchAssemblyTemplate,
} from "@/lib/protocol/useAssemblyRegistry";

/**
 * Synthesize a `networkTargets` value for an on-chain-registered assembly
 * based on the chain its registry lives on. Derived rather than stored —
 * the AssemblyRegistry is per-chain, so the chain IS the network target.
 */
function chainIdToNetworkTarget(chainId: number): string {
    switch (chainId) {
        case DEVNET_CHAIN_ID:
            return "local-anvil";
        case 11155111:
            return "sepolia";
        case 1:
            return "mainnet";
        default:
            return `evm-${chainId}`;
    }
}

/** Walk the assemblyTemplate's agreements and collect the unique set of
 *  clauses anchored across all of them. Sorted alphabetically for stable
 *  display order. */
function collectAssemblyClauses(template: AssemblyTemplate): string[] {
    const set = new Set<string>();
    for (const agreement of template.agreements) {
        for (const clauseId of Object.keys(agreement.clauses)) set.add(clauseId);
    }
    return Array.from(set).sort();
}

/** Process clauses the seller may bind counterparty wallets to when they
 *  adopt this assembly. Emitted for every non-root order that carries a
 *  process-log clause — whatever the seller binds in their catalogue is
 *  seller-assigned; whatever they leave unbound becomes the buyer's
 *  checkout-time choice. There is NO coordination clause: the fill mechanism
 *  is DERIVED (bound vs unbound in the catalogue), never read from a
 *  stored field.
 *
 *  The sub-order's process clause is identified from its SPEC, never by
 *  name: a runtime clause with an enum ladder that is not a companion
 *  (the runtime event-log a sub-order's seller advances). Whatever such
 *  clause the registry defines marks which kind of off-chain seller the
 *  sub-order needs. Returns the set of distinct clauseIds, sorted.
 *
 *  Root order is excluded — the rootBuyer is the connected wallet at
 *  checkout, not designated by the seller's profile. */
export function requiredCounterpartyClauses(template: AssemblyTemplate): string[] {
    const clauses = new Set<string>();
    for (const agreement of template.agreements) {
        if (templateParentOrderHashes(agreement).length === 0) continue; // root has no counterparty
        for (const clauseId of Object.keys(agreement.clauses)) {
            if (clauseIsProcessLog(clauseId)) clauses.add(clauseId);
        }
    }
    return Array.from(clauses).sort();
}

/** Compact display formatting for a clause list. Strips the `figaro-`
 *  prefix and `-vN` version suffix. Shows the first three inline,
 *  summarizes the rest as `+N more`. Callers typically place the full
 *  set in the row's `title` tooltip. */
export function formatAssemblyClauseList(clauses: readonly string[]): string {
    const trimmed = clauses.map((s) => s.replace(/^figaro-/, "").replace(/-v\d+$/, ""));
    if (trimmed.length <= 3) return trimmed.join(", ");
    return `${trimmed.slice(0, 3).join(", ")}, +${trimmed.length - 3} more`;
}

/**
 * A published assembly enriched with assemblyTemplate-derived fields, suitable
 * for surfacing to a user as a selectable / inspectable choice.
 *
 * Template fetch is lazy per-row; `state` tracks the lifecycle. While
 * `state === "loading"`, `name` falls back to `slug` so the UI can
 * render the row immediately. When `state === "loaded"`, all
 * assemblyTemplate-derived fields are populated.
 */
/** Per-assembly assemblyTemplate fetch state: requested, succeeded, or failed. */
type AssemblyTemplateFetchState = "loading" | "loaded" | "error";

export interface AssemblyChoice {
    slug: string;
    registeredBy: `0x${string}`;
    compositionHash: `0x${string}`;
    contentURI: string;
    blockNumber: bigint;
    networkTargets: readonly string[];
    state: AssemblyTemplateFetchState;
    /** Display name from the assemblyTemplate; falls back to `slug` until loaded. */
    name: string;
    /** The designer's own one-liner for what this assembly is for, from the
     *  pinned template's editorial prose (`summary`, or `description` when the
     *  designer wrote only that). `null` until the template loads, and for a
     *  template that carries neither — a reader gets the slug and the shape,
     *  never invented words. */
    summary: string | null;
    /** Available when state === "loaded". */
    agreementCount: number | null;
    /** Available when state === "loaded". Sorted, deduped clauseIds. */
    clauses: readonly string[] | null;
    /** The full assembly template when state === "loaded". Avoids re-fetching
     *  from consumers that need it (e.g. fork). */
    assemblyTemplate: AssemblyTemplate | null;
    /** True when the registering wallet has withdrawn the stake — present only
     *  on reads that opted in to withdrawn rows (or wallet-scoped reads). */
    stakeWithdrawn: boolean;
}

/**
 * Lists every published assembly (optionally filtered to one registering wallet)
 * enriched with assemblyTemplate data — name, order count, clause set.
 *
 * Composes `usePublishedAssemblies` (event log) with a lazy per-row
 * assemblyTemplate fetch. Both `PublishedList` (designer index) and the
 * member-profile assembly picker consume this — keeping one fetch
 * strategy and one enriched shape means they can't drift apart.
 */
export function useAssemblyChoices(
    registeredBy?: `0x${string}` | undefined,
    opts?: { includeWithdrawn?: boolean },
): { data: AssemblyChoice[] | null; isLoading: boolean; failed: boolean; refetch: () => void } {
    const { data: events, isLoading, failed, refetch } = usePublishedAssemblies(registeredBy, opts);
    // `activeChain` is env-determined; the read uses the standalone public
    // client bound to it. Wagmi's `useChainId` would reflect the connected
    // wallet's chain, which is irrelevant for a read against a fixed chain
    // — and undefined on the marketing tier where no provider is mounted.
    const chainId = activeChain.id;
    const [assemblyTemplateState, setAssemblyTemplateState] = useState<
        Map<string, { state: AssemblyTemplateFetchState; assemblyTemplate: AssemblyTemplate | null }>
    >(new Map());
    /** Hashes whose fetch has already been kicked off. A ref (not state)
     *  because we want to guard against double-fetch without retriggering
     *  the effect every time we add an entry. */
    const inFlightRef = useRef<Set<string>>(new Set());
    /** Re-read timers for templates no gateway has served yet — cleared on
     *  unmount so a departed surface never sets state. */
    const retryTimersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

    useEffect(() => {
        if (!events || events.length === 0) return;
        const timers = retryTimersRef.current;
        /** Fetch one template; on a miss, re-read on `contentRetryDelayMs`'s
         *  schedule (a public gateway finds a fresh pin minutes after the
         *  anchor — the row shows its slug until then, then names itself
         *  without a reload). `fetchAssemblyTemplate` reports a mismatched
         *  pin exactly like an unreachable one (absence, by its contract), so
         *  absence is re-checked the same way. */
        const read = (event: (typeof events)[number], attempt: number) => {
            fetchAssemblyTemplate(event.contentURI, event.compositionHash).then(
                (assemblyTemplate) => {
                    setAssemblyTemplateState((prev) => {
                        const next = new Map(prev);
                        next.set(
                            event.compositionHash,
                            assemblyTemplate
                                ? { state: "loaded", assemblyTemplate }
                                : { state: "error", assemblyTemplate: null },
                        );
                        return next;
                    });
                    if (!assemblyTemplate) schedule(event, attempt);
                },
                () => {
                    setAssemblyTemplateState((prev) => {
                        const next = new Map(prev);
                        next.set(event.compositionHash, { state: "error", assemblyTemplate: null });
                        return next;
                    });
                    schedule(event, attempt);
                },
            );
        };
        const schedule = (event: (typeof events)[number], attempt: number) => {
            const timer = setTimeout(() => {
                timers.delete(timer);
                read(event, attempt + 1);
            }, contentRetryDelayMs(attempt));
            timers.add(timer);
        };
        for (const event of events) {
            if (inFlightRef.current.has(event.compositionHash)) continue;
            inFlightRef.current.add(event.compositionHash);
            setAssemblyTemplateState((prev) => {
                const next = new Map(prev);
                next.set(event.compositionHash, { state: "loading", assemblyTemplate: null });
                return next;
            });
            read(event, 0);
        }
    }, [events]);

    useEffect(() => {
        const timers = retryTimersRef.current;
        return () => {
            for (const timer of timers) clearTimeout(timer);
            timers.clear();
        };
    }, []);

    // Memoize the derived array so its reference is stable across renders
    // when none of its inputs (events, assemblyTemplateState, chainId) have changed.
    // Without this, the .map allocates a fresh array on every render, which
    // breaks every downstream useEffect that depends on `choices` — most
    // notably the OnboardingAssembliesForm's autosave effect, which would
    // refire on every render, call update(), trigger another render, and
    // freeze the UI in an infinite loop.
    const data = useMemo<AssemblyChoice[] | null>(() => {
        if (!events) return null;
        const networkTarget = chainIdToNetworkTarget(chainId);
        return events.map((event) => {
            const entry = assemblyTemplateState.get(event.compositionHash);
            const state = entry?.state ?? "loading";
            const assemblyTemplate = entry?.assemblyTemplate ?? null;
            return {
                slug: event.slug,
                registeredBy: event.registeredBy,
                compositionHash: event.compositionHash,
                contentURI: event.contentURI,
                blockNumber: event.blockNumber,
                stakeWithdrawn: event.stakeWithdrawn,
                networkTargets: [networkTarget],
                state,
                // The editorial name from the pinned template once it loads;
                // the content-derived slug is the fallback (and the identity).
                name: assemblyTemplate?.name ?? event.slug,
                summary: assemblyTemplate?.summary ?? assemblyTemplate?.description ?? null,
                agreementCount: assemblyTemplate ? assemblyTemplate.agreements.length : null,
                clauses: assemblyTemplate ? collectAssemblyClauses(assemblyTemplate) : null,
                assemblyTemplate,
            };
        });
    }, [events, assemblyTemplateState, chainId]);
    return { data, isLoading, failed, refetch };
}
