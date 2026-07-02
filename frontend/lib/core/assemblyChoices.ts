/**
 * lib/core/assemblyChoices.ts — READING published assemblies.
 *
 * The enrichment layer over the on-chain `AssemblyRegistry` hooks
 * (`@/lib/core/useAssemblyRegistry`): every published assembly, enriched with
 * its lazily-fetched template (name, order count, clause set), projected into
 * the selectable/inspectable `AssemblyChoice` shape. Consumed by every
 * reading surface — the designer's published list, the seller-profile
 * assembly picker, the marketing `/assemblies` inventory. AUTHORING (build /
 * pin / anchor) lives in `lib/designer/` — design is design; this module
 * only reads.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { activeChain } from "@/lib/shared/wagmi";
import { clauseDeclaresField, clauseIsProcessLog } from "@/lib/shared/clauseSpecSource";
import { templateParentOrderHashes, type AssemblyTemplate } from "@/lib/shared/assemblyTemplate";
import { DEVNET_CHAIN_ID } from "@/lib/shared/chains";
import {
    usePublishedAssemblies,
    fetchAssemblyTemplate,
} from "@/lib/core/useAssemblyRegistry";

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

/** Walk the assemblyTemplate's inlined agreements and collect the unique set of
 *  clauses anchored across all orders. Sorted alphabetically for stable
 *  display order. */
function collectAssemblyClauses(template: AssemblyTemplate): string[] {
    const set = new Set<string>();
    for (const order of template.orders) {
        for (const clauseId of Object.keys(order.clauses)) set.add(clauseId);
    }
    return Array.from(set).sort();
}

/** Process clauses the seller may bind counterparty wallets to when they
 *  adopt this assembly. Emitted for every non-root order that carries a
 *  process-log clause — whatever the seller binds in their catalogue is
 *  seller-assigned; whatever they leave unbound becomes the buyer's
 *  checkout-time choice. There is NO coordination clause: the fill mechanism
 *  is DERIVED (bound vs unbound in the catalogue; a `descending-auction`
 *  composition defers to the auction), never read from a stored field.
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
    for (const order of template.orders) {
        if (templateParentOrderHashes(order).length === 0) continue; // root has no counterparty
        for (const clauseId of Object.keys(order.clauses)) {
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
    author: `0x${string}`;
    contentHash: `0x${string}`;
    metadataURI: string;
    blockNumber: bigint;
    networkTargets: readonly string[];
    state: AssemblyTemplateFetchState;
    /** Display name from the assemblyTemplate; falls back to `slug` until loaded. */
    name: string;
    /** Available when state === "loaded". */
    orderCount: number | null;
    /** Available when state === "loaded". Sorted, deduped clauseIds. */
    clauses: readonly string[] | null;
    /** The full assembly template when state === "loaded". Avoids re-fetching
     *  from consumers that need it (e.g. fork). */
    assemblyTemplate: AssemblyTemplate | null;
}

/**
 * Lists every published assembly (optionally filtered to one author)
 * enriched with assemblyTemplate data — name, order count, clause set.
 *
 * Composes `usePublishedAssemblies` (event log) with a lazy per-row
 * assemblyTemplate fetch. Both `PublishedList` (designer index) and the
 * seller-profile assembly picker consume this — keeping one fetch
 * strategy and one enriched shape means they can't drift apart.
 */
export function useAssemblyChoices(
    author?: `0x${string}` | undefined,
): { data: AssemblyChoice[] | null; isLoading: boolean; refetch: () => void } {
    const { data: events, isLoading, refetch } = usePublishedAssemblies(author);
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

    useEffect(() => {
        if (!events || events.length === 0) return;
        for (const event of events) {
            if (inFlightRef.current.has(event.contentHash)) continue;
            inFlightRef.current.add(event.contentHash);
            setAssemblyTemplateState((prev) => {
                const next = new Map(prev);
                next.set(event.contentHash, { state: "loading", assemblyTemplate: null });
                return next;
            });
            fetchAssemblyTemplate(event.metadataURI).then(
                (assemblyTemplate) => {
                    setAssemblyTemplateState((prev) => {
                        const next = new Map(prev);
                        next.set(
                            event.contentHash,
                            assemblyTemplate
                                ? { state: "loaded", assemblyTemplate }
                                : { state: "error", assemblyTemplate: null },
                        );
                        return next;
                    });
                },
                () => {
                    setAssemblyTemplateState((prev) => {
                        const next = new Map(prev);
                        next.set(event.contentHash, { state: "error", assemblyTemplate: null });
                        return next;
                    });
                },
            );
        }
    }, [events]);

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
            const entry = assemblyTemplateState.get(event.contentHash);
            const state = entry?.state ?? "loading";
            const assemblyTemplate = entry?.assemblyTemplate ?? null;
            return {
                slug: event.slug,
                author: event.author,
                contentHash: event.contentHash,
                metadataURI: event.metadataURI,
                blockNumber: event.blockNumber,
                networkTargets: [networkTarget],
                state,
                // The editorial name from the pinned template once it loads;
                // the content-derived slug is the fallback (and the identity).
                name: assemblyTemplate?.name ?? event.slug,
                orderCount: assemblyTemplate ? assemblyTemplate.orders.length : null,
                clauses: assemblyTemplate ? collectAssemblyClauses(assemblyTemplate) : null,
                assemblyTemplate,
            };
        });
    }, [events, assemblyTemplateState, chainId]);
    return { data, isLoading, refetch };
}

/** Read a single-select clause scalar from an order's clause set BY DECLARED
 *  FIELD, never by clause name (open-world). One reader for the
 *  modality/coordination-style scalars. */
function readSingleSelectClauseField(
    clauses: Record<string, unknown> | undefined,
    fieldName: string,
): string | undefined {
    const data = Object.entries(clauses ?? {})
        .find(([clauseId]) => clauseDeclaresField(clauseId, fieldName))?.[1] as
        | Record<string, unknown>
        | undefined;
    const value = data?.[fieldName];
    return typeof value === "string" ? value : undefined;
}

/** Extract the single-select modality value from an assemblyTemplate's root
 *  order agreement. The root order is the one with no topology parents — if a
 *  consumer needs a sub-order's modality, they walk the orders array
 *  themselves. */
export function extractRootModality(
    template: AssemblyTemplate,
): { modality?: string } {
    const rootOrder =
        template.orders.find((o) => templateParentOrderHashes(o).length === 0) ?? template.orders[0];
    return {
        modality: readSingleSelectClauseField(rootOrder?.clauses, "modality"),
    };
}
