"use client";

/**
 * useClauseSpecs — warms the clause-spec cache from chain → IPFS.
 *
 * Reads every `ClauseRegistered` event (`useAllRegisteredClauses`) and fetches
 * each clause's spec from its on-chain `contentURI` into the module cache
 * (`loadClauseSpec`). Once `loaded` is true, the synchronous reads in
 * `clauseSpecSource` (getClauseSpec / clauseEnumValues /
 * describeAttestation / groupClausesByArticle / clauseNestsUnder) resolve for every
 * registered clause.
 *
 * This is the clause analogue of the assembly loader: spec-consuming surfaces
 * call this and gate their render on `loaded`, so nothing reads a half-warm
 * cache. The cache is a module singleton, so the fetch happens once per spec
 * across the whole app; `version` bumps as specs resolve so dependents recompute.
 *
 * `loaded` means the load pass FINISHED — every registered spec reached a
 * terminal state (cached, or failed and skipped) — NOT that every spec cached.
 * Open-world registration is permissionless, so a single adversarial clause
 * (dead URI, hash mismatch, unparseable spec) must degrade to "skip that one,
 * render the rest," never wedge every clause surface for every user. Consumers
 * read each spec via `getClauseSpec` (undefined = skipped) and fall back per-clause.
 */

import { useEffect, useMemo, useState } from "react";
import { useAllRegisteredClauses } from "./useClauseRegistry";
import { getClauseSpec, loadClauseSpec } from "@/lib/shared/clauseSpecSource";

export interface ClauseSpecsState {
    /** True once the registry has been read AND every registered clause's spec
     *  is in the cache. */
    loaded: boolean;
    /** How many registered clauses currently have a cached spec. */
    loadedCount: number;
    /** Total registered clauses (null while the registry read is in flight). */
    total: number | null;
    /** Per-spec load failures (unreachable gateway, parse error, id mismatch). */
    errors: string[];
    /** Bumps each time a batch of specs resolves — a dependency handle for
     *  consumers that read the sync cache. */
    version: number;
}

export function useClauseSpecs(): ClauseSpecsState {
    const { data: events, failed: readFailed } = useAllRegisteredClauses();
    const [version, setVersion] = useState(0);
    const [errors, setErrors] = useState<string[]>([]);
    /** True once the load pass for the current `events` set has settled — every
     *  spec fetch resolved or rejected. This is the terminal-state signal that
     *  makes a failed clause a SKIP, not a permanent block. */
    const [settled, setSettled] = useState(false);

    useEffect(() => {
        if (!events) return;
        let cancelled = false;
        setSettled(false);
        const pending = events.filter((e) => e.contentURI && e.clauseId);
        Promise.allSettled(pending.map((e) => loadClauseSpec(e.clauseId, e.version, e.contentURI, e.contentHash))).then((results) => {
            if (cancelled) return;
            setErrors(results.flatMap((r) => (r.status === "rejected" ? [String(r.reason)] : [])));
            setSettled(true);
            setVersion((v) => v + 1);
        });
        return () => {
            cancelled = true;
        };
    }, [events]);

    return useMemo<ClauseSpecsState>(() => {
        const total = events?.length ?? null;
        const loadedCount = (events ?? []).filter((e) => getClauseSpec(e.clauseId) !== undefined).length;
        // loaded = the registry read resolved AND the load pass finished (each
        // spec terminal). A FAILED registry read is never loaded. Resolved-empty
        // (a genuinely empty registry) settles immediately and counts as loaded:
        // absence is a real state. Partial spec failure DEGRADES — the pass still
        // settles, `loadedCount` reflects what cached, consumers skip the rest.
        const loaded = !readFailed && total !== null && settled;
        return {
            loaded,
            loadedCount,
            total,
            errors,
            version,
        };
        // `version` is intentionally a dep: it bumps after loads resolve so
        // `loadedCount` is recounted from the now-warm cache.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [events, readFailed, errors, version, settled]);
}
