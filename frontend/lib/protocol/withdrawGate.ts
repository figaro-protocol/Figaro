"use client";

/**
 * withdrawGate — the ADVISORY, off-chain half of the K4 commits==resolves gate.
 *
 * An artifact author (clause registrar / assembly author) must not reclaim
 * their registration stake while deals COMPOSED FROM that artifact are still in
 * flight. The whole join lives in `@figaro/sdk/derive` (`deriveInFlightOrders`
 * + `deriveClauseWithdrawGate` / `deriveAssemblyWithdrawGate`) — this hook does
 * ONLY the I/O the SDK deliberately does not: read the kernel event log from
 * the chain, then fetch each in-flight order's pinned agreement from IPFS. It
 * never re-derives the count.
 *
 * The join is derived at read time, never stored: in-flight orders come from
 * the reconstructed topology; each order's agreement (hash-verified) names the
 * clauses it composes. An order this wallet never witnessed resolves to a null
 * agreement (no witnessed URI — bodies are PARTY-PRIVATE) — the SDK gate
 * counts that as unverified and SURFACES it as a caveat, never a block:
 * blocking on unverifiable foreign deals would dead-lock every author's
 * withdraw, and the on-chain inclusion-proof hardening (the RPGF prover)
 * doesn't lock the stake on unrevealed deals either. Only VERIFIED in-flight
 * deals block (`canWithdraw === (inFlightCount === 0)`). A chain-READ failure
 * is different — the chain state is genuinely unknown — so it yields a null
 * gate and the affordance stays disabled.
 */

import { useEffect, useMemo, useState } from "react";
import {
    parseOrderCommittedLogs,
    parseOrderResolvedLogs,
    parseProcessResolvedLogs,
} from "@figaro/sdk";
import {
    deriveInFlightOrders,
    deriveClauseWithdrawGate,
    deriveAssemblyWithdrawGate,
    type InFlightAgreement,
    type WithdrawGate,
} from "@figaro/sdk/derive";
import { templateCompositionHash, type AssemblyTemplate } from "@/lib/shared/assemblyTemplate";
import { publicClient } from "@/lib/shared/wagmi";
import { CONTRACTS } from "@/lib/kernel/contracts";
import { fetchAgreement } from "@/lib/kernel/agreementFetch";

export type WithdrawArtifact =
    | { kind: "clause"; clauseId: string }
    | { kind: "assembly"; template: AssemblyTemplate };

/** Read every in-flight order off-chain, then resolve each to its committed
 *  agreement (best-effort — an un-witnessed order has no URI and resolves to
 *  null, which the SDK gate counts as unverified: surfaced, never blocking). */
async function resolveInFlightAgreements(coreAddress: `0x${string}`): Promise<InFlightAgreement[]> {
    // Read the kernel event log directly (the SDK's `fetchCoreEvents` takes a
    // strictly-typed PublicClient the frontend's standalone client doesn't
    // unify with — the registry readers sidestep the same way), then hand the
    // logs to the SDK parsers + the SDK in-flight derivation. The derivation is
    // the SDK's; only the raw chain read is here.
    const logs = await publicClient.getLogs({ address: coreAddress, fromBlock: 0n, toBlock: "latest" });
    const refs = deriveInFlightOrders({
        orderCommitted: parseOrderCommittedLogs(logs),
        orderResolved: parseOrderResolvedLogs(logs),
        processResolved: parseProcessResolvedLogs(logs),
    });
    return Promise.all(
        refs.map(async (ref) => ({
            processId: ref.processId,
            agreement: await fetchAgreement(ref.agreementHash),
        })),
    );
}

/**
 * The withdraw gate for one artifact. `null` artifact (or an unconfigured core
 * address) yields `{ gate: null }`. `gate` is `null` while loading or on a
 * chain-read failure (genuinely unknown chain state — affordance stays
 * disabled); once loaded, only VERIFIED in-flight deals block
 * (`gate.canWithdraw === (gate.inFlightCount === 0)`), and
 * `gate.unverifiedCount > 0` is surfaced as a caveat via
 * `withdrawUnverifiedCaveat`, never blocking.
 */
export function useWithdrawGate(artifact: WithdrawArtifact | null): {
    gate: WithdrawGate | null;
    isLoading: boolean;
} {
    const [gate, setGate] = useState<WithdrawGate | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    // A stable identity for the artifact so the effect re-runs only when the
    // target changes (an assembly is identified by its composition hash).
    const artifactKey = useMemo(() => {
        if (!artifact) return null;
        return artifact.kind === "clause"
            ? `clause:${artifact.clauseId}`
            : `assembly:${templateCompositionHash(artifact.template)}`;
    }, [artifact]);

    useEffect(() => {
        const core = CONTRACTS.core;
        if (!artifact || !/^0x[0-9a-fA-F]{40}$/.test(core)) {
            setGate(null);
            return;
        }
        let cancelled = false;
        setIsLoading(true);
        setGate(null);

        resolveInFlightAgreements(core)
            .then((agreements) => {
                if (cancelled) return;
                setGate(
                    artifact.kind === "clause"
                        ? deriveClauseWithdrawGate(artifact.clauseId, agreements)
                        : deriveAssemblyWithdrawGate(artifact.template, agreements),
                );
                setIsLoading(false);
            })
            .catch((err) => {
                if (cancelled) return;
                console.warn("[useWithdrawGate] in-flight read failed:", err);
                setGate(null); // chain state unknown → the affordance stays disabled
                setIsLoading(false);
            });

        return () => {
            cancelled = true;
        };
        // artifactKey captures the meaningful identity; artifact is read fresh
        // in the closure from the same render that produced the key.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [artifactKey]);

    return { gate, isLoading };
}

/** Human-readable reason a stake can't be reclaimed yet, or null when it can.
 *  Only VERIFIED in-flight deals block (`inFlightCount > 0`); unverified deals
 *  are a caveat (`withdrawUnverifiedCaveat`), not a reason. `gate === null`
 *  means the gate could not be computed (loading / chain-read failure) — the
 *  chain state is genuinely unknown, so also "not safe to reclaim". */
export function withdrawBlockedReason(gate: WithdrawGate | null): string | null {
    if (gate === null) return "Checking for in-flight deals composed from this artifact…";
    if (gate.canWithdraw) return null;
    return `Cannot reclaim the stake yet: ${gate.inFlightCount} in-flight deal${gate.inFlightCount === 1 ? "" : "s"} still compose${gate.inFlightCount === 1 ? "s" : ""} this artifact. The stake frees once every composed deal has settled.`;
}

/** Informational caveat when unverifiable in-flight deals exist, or null.
 *  Never blocks: agreement bodies are party-private, so a reader cannot check
 *  a stranger's deal — and on-chain enforcement (the inclusion-proof model,
 *  arriving with the prover) doesn't lock the stake on unrevealed deals
 *  either. Rendered alongside an ENABLED reclaim affordance. */
export function withdrawUnverifiedCaveat(gate: WithdrawGate | null): string | null {
    if (gate === null || gate.unverifiedCount === 0) return null;
    return `${gate.unverifiedCount} in-flight deal${gate.unverifiedCount === 1 ? "" : "s"} could not be checked — agreement terms are party-private, so deals this wallet is not a party to are unverifiable here. They do not block the reclaim; on-chain enforcement arrives with the prover (deals lock the stake only by proving composition).`;
}
