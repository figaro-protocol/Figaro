"use client";

/**
 * withdrawGate — the ADVISORY, off-chain half of the K4 commits==resolves gate.
 *
 * A clause's, an assembly's or a registered agreement's designer of record
 * must not reclaim their registration stake while trades COMPOSED FROM it are
 * still in flight. The whole join lives in `@figaro-protocol/sdk/derive`
 * (`deriveInFlightOrders` + `deriveClauseWithdrawGate` /
 * `deriveAssemblyWithdrawGate` / `deriveAgreementWithdrawGate`, the last two
 * attributing an order by its verified agreement's decoded provenance
 * `{ agreementHash, assemblyHash }`) — this hook does
 * ONLY the I/O the SDK deliberately does not: read the order events through
 * the indexer (`getCoreEvents`, every order emitter, cached and chunked), then
 * fetch each in-flight order's pinned agreement from IPFS. It never re-derives
 * the count.
 *
 * The join is derived at read time, never stored: in-flight orders come from
 * the reconstructed topology; each order's agreement (hash-verified) names the
 * clauses it composes. An order this wallet never witnessed resolves to a null
 * agreement (no witnessed URI — bodies are PARTY-PRIVATE) — the SDK gate
 * counts that as unverified and SURFACES it as a caveat, never a block:
 * blocking on unverifiable foreign trades would dead-lock every designer's
 * withdraw — and nothing on-chain locks the stake on unrevealed trades anyway
 * (FigaroCore holds no composition provenance, so this gate has no on-chain
 * enforcement). Only VERIFIED in-flight
 * trades block (`canWithdraw === (inFlightCount === 0)`). A chain-read
 * failure, or a failed read of a body this wallet DID witness, is different —
 * the state is genuinely unknown — so the gate is `absent` and a surface
 * offers no reclaim affordance at all.
 */

import { useEffect, useMemo, useState } from "react";
import type { PublicClient } from "viem";
import { PENDING, readNetwork, type NetworkRead } from "@/lib/shared/networkRead";
import {
    deriveInFlightOrders,
    deriveClauseWithdrawGate,
    deriveAssemblyWithdrawGate,
    deriveAgreementWithdrawGate,
    type InFlightAgreement,
    type WithdrawGate,
} from "@figaro-protocol/sdk/derive";
import { activeChain, publicClient } from "@/lib/shared/wagmi";
import { CONTRACTS } from "@/lib/kernel/contracts";
import { getCoreEvents } from "@/lib/kernel/indexer";
import { fetchAgreement, witnessedAgreementUri } from "@/lib/kernel/agreementFetch";
import { isValidAddress } from "@/lib/shared/evm";

export type WithdrawClauseOrAssembly =
    | { kind: "clause"; clauseKey: `0x${string}` }
    | { kind: "assembly"; assemblyHash: `0x${string}` }
    | { kind: "agreement"; agreementHash: `0x${string}` };

/** Read every in-flight order off-chain, then resolve each to its committed
 *  agreement (best-effort — an un-witnessed order has no URI and resolves to
 *  null, which the SDK gate counts as unverified: surfaced, never blocking). */
async function resolveInFlightAgreements(): Promise<InFlightAgreement[]> {
    // Both resolution paths: the verifier emits the Core's own order and
    // process events for every batched commit and resolution, so an in-flight
    // batched order gates a withdrawal exactly as a direct one does. The
    // derivation is the SDK's; only the chain read is here, through the
    // indexer's cached reader, chunked under a provider's block-range cap.
    const { events } = await getCoreEvents(publicClient as unknown as PublicClient, activeChain.id);
    const refs = deriveInFlightOrders(events);
    return Promise.all(
        refs.map(async (ref) => {
            // An order this wallet never witnessed has no URI and makes no
            // read: it is unverified (the SDK gate's caveat, never a block).
            if (!witnessedAgreementUri(ref.checkoutHash)) return { processId: ref.processId, agreement: null };
            // A witnessed order whose body failed to read is UNKNOWN state —
            // the whole gate is absent, never "unverified" (which would enable
            // the reclaim on a failed read).
            const read = await fetchAgreement(ref.checkoutHash);
            if (read.status !== "present") throw new Error(`agreement ${ref.checkoutHash} unreadable`);
            return { processId: ref.processId, agreement: read.value };
        }),
    );
}

/**
 * The withdraw gate for one clause, assembly or agreement, as a
 * `NetworkRead`: `pending` while reading (and for a null target), `absent`
 * when the chain or a witnessed body could not be read — the surface then
 * renders no reclaim affordance — and `present` once derived. Only VERIFIED
 * in-flight trades block (`gate.canWithdraw === (gate.inFlightCount === 0)`);
 * `gate.unverifiedCount > 0` is a caveat via `withdrawUnverifiedCaveat`.
 */
export function useWithdrawGate(clauseOrAssembly: WithdrawClauseOrAssembly | null): {
    gate: NetworkRead<WithdrawGate>;
} {
    const [gate, setGate] = useState<NetworkRead<WithdrawGate>>(PENDING);

    // A stable identity for the clause or assembly so the effect re-runs only
    // when the target changes (an assembly is identified by its assembly hash).
    const clauseOrAssemblyKey = useMemo(() => {
        if (!clauseOrAssembly) return null;
        switch (clauseOrAssembly.kind) {
            case "clause": return `clause:${clauseOrAssembly.clauseKey}`;
            case "assembly": return `assembly:${clauseOrAssembly.assemblyHash}`;
            case "agreement": return `agreement:${clauseOrAssembly.agreementHash}`;
        }
    }, [clauseOrAssembly]);

    useEffect(() => {
        const core = CONTRACTS.core;
        setGate(PENDING);
        if (!clauseOrAssembly || !isValidAddress(core)) return;
        let canceled = false;

        void readNetwork("useWithdrawGate", async () => {
            const agreements = await resolveInFlightAgreements();
            return clauseOrAssembly.kind === "clause"
                ? deriveClauseWithdrawGate(clauseOrAssembly.clauseKey, agreements)
                : clauseOrAssembly.kind === "assembly"
                    ? deriveAssemblyWithdrawGate(clauseOrAssembly.assemblyHash, agreements)
                    : deriveAgreementWithdrawGate(clauseOrAssembly.agreementHash, agreements);
        }).then((next) => {
            if (!canceled) setGate(next);
        });

        return () => {
            canceled = true;
        };
        // clauseOrAssemblyKey captures the meaningful identity; clauseOrAssembly
        // is read fresh in the closure from the same render that produced the key.
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [clauseOrAssemblyKey]);

    return { gate };
}

/** Whether the reclaim affordance may be enabled: the gate is read and no
 *  VERIFIED in-flight trade composes the registration. */
export function withdrawGateOpen(gate: NetworkRead<WithdrawGate>): boolean {
    return gate.status === "present" && gate.value.inFlightCount === 0;
}

/** Human-readable reason a stake can't be reclaimed yet, or null when it can
 *  (or when the gate is absent — a surface shows no affordance for it, so no
 *  reason either). Only VERIFIED in-flight trades block (`inFlightCount > 0`);
 *  unverified trades are a caveat (`withdrawUnverifiedCaveat`), not a reason. */
export function withdrawBlockedReason(gate: NetworkRead<WithdrawGate>): string | null {
    if (gate.status === "pending") return "Checking for in-flight trades composed from this registration…";
    if (gate.status === "absent" || gate.value.canWithdraw) return null;
    const n = gate.value.inFlightCount;
    return `Cannot reclaim the stake yet: ${n} in-flight trade${n === 1 ? "" : "s"} still compose${n === 1 ? "s" : ""} this registration. The stake frees once every composed trade has resolved.`;
}

/** Informational caveat when unverifiable in-flight trades exist, or null.
 *  Never blocks: agreement bodies are party-private, so a reader cannot check
 *  a stranger's trade — and on-chain enforcement (the inclusion-proof model,
 *  arriving with the prover) doesn't lock the stake on unrevealed trades
 *  either. Rendered alongside an ENABLED reclaim affordance. */
export function withdrawUnverifiedCaveat(gate: NetworkRead<WithdrawGate>): string | null {
    if (gate.status !== "present" || gate.value.unverifiedCount === 0) return null;
    const n = gate.value.unverifiedCount;
    return `${n} in-flight trade${n === 1 ? "" : "s"} could not be checked — agreement terms are party-private, so trades this wallet is not a party to are unverifiable here. They do not block the reclaim; on-chain enforcement arrives with the prover (trades lock the stake only by proving composition).`;
}
