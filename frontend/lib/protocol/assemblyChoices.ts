/**
 * lib/protocol/assemblyChoices.ts — READING published assemblies.
 *
 * The enrichment layer over the on-chain `AssemblyRegistry` hooks
 * (`@/lib/protocol/useAssemblyRegistry`): every published assembly, enriched with
 * its lazily-fetched assembly (name, agreement count, clause set), projected into
 * the selectable/inspectable `AssemblyChoice` shape. Consumed by every
 * reading surface — the designer's published list, the member-profile
 * assembly picker, the marketing `/assemblies` inventory. AUTHORING (build /
 * pin / anchor) lives in `lib/designer/` — design is design; this module
 * only reads.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { activeChain } from "@/lib/shared/wagmi";
import { clauseIsProcessLog, getClauseSpec } from "@/lib/shared/clauseSpecSource";
import { truncateHex } from "@/lib/shared/formatHex";
import { agreementClauses, assemblyComposedClauseKeys, type HydratedAssembly } from "@figaro-protocol/sdk";
import { assemblyFollows } from "@/lib/shared/assembly";
import { DEVNET_CHAIN_ID } from "@/lib/shared/chains";
import { contentRetryDelayMs } from "@/lib/shared/ipfsService";
import {
    usePublishedAssemblies,
    fetchHydratedAssembly, getAssemblyLoadError } from "@/lib/protocol/useAssemblyRegistry";

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


/** Process clauses the seller may bind co-seller wallets to when they
 *  adopt this assembly. Emitted for every non-root order that carries a
 *  process-log clause — whatever the seller binds in their catalog is
 *  seller-assigned; whatever they leave unbound becomes the buyer's
 *  checkout-time choice. There is NO coordination clause: the fill mechanism
 *  is DERIVED (bound vs unbound in the catalog), never read from a
 *  stored field.
 *
 *  The sub-order's process clause is identified from its SPEC, never by
 *  name: a runtime clause with an enum ladder that is not a companion
 *  (the runtime event-log a sub-order's seller advances). Whatever such
 *  clause the registry defines marks which kind of off-chain seller the
 *  sub-order needs. Returns the set of distinct clause keys, sorted.
 *
 *  Root order is excluded — the rootBuyer is the connected wallet at
 *  checkout, not designated by the seller's profile. */
export function requiredCoSellerClauses(hydrated: HydratedAssembly): string[] {
    const clauses = new Set<string>();
    for (const entry of hydrated.assembly.agreements) {
        if (assemblyFollows(entry).length === 0) continue; // root has no co-seller
        for (const clauseKey of Object.keys(agreementClauses(hydrated, entry))) {
            if (clauseIsProcessLog(clauseKey)) clauses.add(clauseKey);
        }
    }
    return Array.from(clauses).sort();
}

/** Compact display formatting for a list of clause keys: each key reads as
 *  its spec's own title (the short key while the spec is not loaded). Shows
 *  the first three inline, summarizes the rest as `+N more`. Callers
 *  typically place the full set in the row's `title` tooltip. */
export function formatAssemblyClauseList(clauses: readonly string[]): string {
    const trimmed = clauses.map((key) => getClauseSpec(key)?.title ?? truncateHex(key, { head: 10, tail: 0 }));
    if (trimmed.length <= 3) return trimmed.join(", ");
    return `${trimmed.slice(0, 3).join(", ")}, +${trimmed.length - 3} more`;
}

/**
 * A published assembly enriched with assembly-derived fields, suitable
 * for surfacing to a user as a selectable / inspectable choice.
 *
 * The read is lazy per-row: the assembly, then every agreement's registered
 * agreement (`fetchHydratedAssembly`); `state` tracks the lifecycle. While
 * `state === "loading"`, `name` falls back to `slug` so the UI can
 * render the row immediately. When `state === "loaded"`, all
 * assembly-derived fields are populated. An assembly whose assembly or any
 * agreement's agreement is absent stays in `"error"` — not offered.
 */
/** Per-assembly read state: requested, succeeded, or failed. */
type AssemblyFetchState = "loading" | "loaded" | "error";

export interface AssemblyChoice {
    slug: string;
    registeredBy: `0x${string}`;
    assemblyHash: `0x${string}`;
    contentURI: string;
    blockNumber: bigint;
    networkTargets: readonly string[];
    state: AssemblyFetchState;
    /** Display name from the assembly; falls back to `slug` until loaded. */
    name: string;
    /** The designer's own one-liner for what this assembly is for, from the
     *  pinned assembly's editorial prose (`summary`, or `description` when the
     *  designer wrote only that). `null` until the assembly loads, and for a
     *  assembly that carries neither — a reader gets the slug and the shape,
     *  never invented words. */
    summary: string | null;
    /** Available when state === "loaded". */
    agreementCount: number | null;
    /** Available when state === "loaded". Sorted, deduped clause keys. */
    clauses: readonly string[] | null;
    /** The hydrated assembly when state === "loaded": the assembly verified
     *  against `assemblyHash` and every agreement's registered agreement
     *  verified against its key. Avoids re-fetching from consumers that need
     *  it (e.g. fork). */
    hydratedAssembly: HydratedAssembly | null;
    /** True when the registering wallet has withdrawn the stake — present only
     *  on reads that opted in to withdrawn rows (or wallet-scoped reads). */
    stakeWithdrawn: boolean;
}

/**
 * Lists every published assembly (optionally filtered to one registering wallet)
 * enriched with assembly data — name, order count, clause set.
 *
 * Composes `usePublishedAssemblies` (event log) with a lazy per-row
 * hydrated read. Both `PublishedList` (designer index) and the
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
    const [hydratedState, setHydratedState] = useState<
        Map<string, { state: AssemblyFetchState; hydratedAssembly: HydratedAssembly | null }>
    >(new Map());
    /** Hashes whose fetch has already been kicked off. A ref (not state)
     *  because we want to guard against double-fetch without retriggering
     *  the effect every time we add an entry. */
    const inFlightRef = useRef<Set<string>>(new Set());
    /** Re-read timers for assemblies no gateway has served yet — cleared on
     *  unmount so a departed surface never sets state. */
    const retryTimersRef = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());

    useEffect(() => {
        if (!events || events.length === 0) return;
        const timers = retryTimersRef.current;
        /** Fetch one assembly; on a miss, re-read on `contentRetryDelayMs`'s
         *  schedule (a public gateway finds a fresh pin minutes after the
         *  anchor — the row shows its slug until then, then names itself
         *  without a reload). `fetchHydratedAssembly` reports a mismatched
         *  pin exactly like an unreachable one (absence, by its contract), so
         *  absence is re-checked the same way. */
        const read = (event: (typeof events)[number], attempt: number) => {
            fetchHydratedAssembly(event.contentURI, event.assemblyHash).then(
                (hydratedAssembly) => {
                    setHydratedState((prev) => {
                        const next = new Map(prev);
                        next.set(
                            event.assemblyHash,
                            hydratedAssembly
                                ? { state: "loaded", hydratedAssembly }
                                : { state: "error", hydratedAssembly: null },
                        );
                        return next;
                    });
                    // A served document that is not the one its root anchors —
                    // or a entry whose agreement failed the same way — never
                    // resolves: no re-read, the row says so.
                    if (!hydratedAssembly && !getAssemblyLoadError(event.assemblyHash)) schedule(event, attempt);
                },
                () => {
                    setHydratedState((prev) => {
                        const next = new Map(prev);
                        next.set(event.assemblyHash, { state: "error", hydratedAssembly: null });
                        return next;
                    });
                    if (!getAssemblyLoadError(event.assemblyHash)) schedule(event, attempt);
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
            if (inFlightRef.current.has(event.assemblyHash)) continue;
            inFlightRef.current.add(event.assemblyHash);
            setHydratedState((prev) => {
                const next = new Map(prev);
                next.set(event.assemblyHash, { state: "loading", hydratedAssembly: null });
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
    // when none of its inputs (events, hydratedState, chainId) have changed.
    // Without this, the .map allocates a fresh array on every render, which
    // breaks every downstream useEffect that depends on `choices` — most
    // notably the OnboardingAssembliesForm's autosave effect, which would
    // refire on every render, call update(), trigger another render, and
    // freeze the UI in an infinite loop.
    const data = useMemo<AssemblyChoice[] | null>(() => {
        if (!events) return null;
        const networkTarget = chainIdToNetworkTarget(chainId);
        return events.map((event) => {
            const entry = hydratedState.get(event.assemblyHash);
            const state = entry?.state ?? "loading";
            const hydratedAssembly = entry?.hydratedAssembly ?? null;
            const assembly = hydratedAssembly?.assembly ?? null;
            return {
                slug: event.slug,
                registeredBy: event.registeredBy,
                assemblyHash: event.assemblyHash,
                contentURI: event.contentURI,
                blockNumber: event.blockNumber,
                stakeWithdrawn: event.stakeWithdrawn,
                networkTargets: [networkTarget],
                state,
                // The editorial name from the pinned assembly once it loads;
                // the content-derived slug is the fallback (and the identity).
                name: assembly?.name ?? event.slug,
                summary: assembly?.summary ?? assembly?.description ?? null,
                agreementCount: assembly ? assembly.agreements.length : null,
                clauses: hydratedAssembly ? assemblyComposedClauseKeys(hydratedAssembly.assembly, hydratedAssembly.agreements) : null,
                hydratedAssembly,
            };
        });
    }, [events, hydratedState, chainId]);
    return { data, isLoading, failed, refetch };
}
