/**
 * @figaro-protocol/sdk/derive — Withdraw gate (commits==resolves)
 *
 * The off-chain, advisory half of the K4 staked-intent model: the designer of
 * record of a clause, a registered agreement or an assembly (each registry's
 * `registeredBy`) must not reclaim their registration stake while trades
 * COMPOSED FROM it are still in flight. This is the read-side derivation RPGF attribution pays on — the same
 * count. It is ADVISORY today (surfaced as a disabled affordance); an on-chain
 * inclusion-proof withdraw lock would harden it if one is ever built — a
 * deliberate open item, not machinery that exists. Nothing here touches the
 * FigaroCore.
 *
 * The join, derived at read time from chain + IPFS, NEVER stored:
 *   1. an order is IN-FLIGHT when committed (`OrderCommitted`) but its process
 *      is not yet resolved (`ProcessResolved`) — `deriveInFlightOrders` reads
 *      that straight off the reconstructed `Topology`;
 *   2. each in-flight order carries an `checkoutHash`; the caller fetches the
 *      pinned, hash-verified agreement document for it (the SDK stays viem-only
 *      and does no IPFS I/O — the frontend's `fetchAgreement` is that fetch);
 *   3. the agreement NAMES the clauses it composes — `Agreement.clauses[].clause`,
 *      each the clause's key — and, in its provenance leaf
 *      (`Agreement.provenance`, under the same hash), the registered agreement
 *      and the assembly it instantiated. A clause is attributed by its key
 *      among the clauses; an agreement and an assembly by the provenance's
 *      `agreementHash` and `assemblyHash`.
 *
 * `canWithdraw(clauseOrAssembly) == (inFlightCount === 0)`.
 *
 * VERIFIED in-flight trades block; UNVERIFIED trades are counted and SURFACED
 * but do not block. An in-flight order whose agreement could not be
 * fetched/verified is passed here as `agreement: null` and lands in
 * `unverifiedCount` — an informational caveat, never a veto. Two reasons,
 * both structural: (i) agreement bodies are PARTY-PRIVATE — a reader holds a
 * URI only for orders their own wallet witnessed — so a clause-or-assembly author can
 * never verify a stranger's trade; blocking on unverifiable foreign agreements
 * would dead-lock every author's withdraw whenever ANY trade is in flight
 * anywhere on the network. (ii) The on-chain hardening this advisory gate
 * anticipates is an opt-in INCLUSION-PROOF model: a trade locks the stake only
 * by PROVING the clause or assembly's leaf is in its committed agreement, so unrevealed
 * trades don't lock it there either — the advisory mirrors those semantics.
 * Absence stays absence: a clause or assembly with NO in-flight orders resolves to
 * `canWithdraw: true` (reads-at-edge — resolved-empty is absence, not error).
 */

import type { Hex } from "../types.js";
import { OrderState } from "../types.js";
import type { CoreEvents } from "../state.js";
import { Topology } from "../state.js";
import type { Agreement, AgreementProvenance } from "../agreement.js";

// ── In-flight extraction (pure — the caller supplies fetched events) ─────────

/** A committed-but-unresolved order — one live bonded commitment. The chain
 *  part of the join; the caller resolves each `checkoutHash` to its pinned
 *  agreement before running a gate. */
export interface InFlightOrderRef {
    orderHash: Hex;
    processId: Hex;
    checkoutHash: Hex;
}

/**
 * Every in-flight order (committed, its process not yet resolved) from a batch
 * of reconstructed core events. Reuses `Topology`, the one reconstruction path —
 * a process leaves the active set on `ProcessResolved`, and FigaroCore's atomic
 * resolution resolves all of a process's orders together, so an active process's
 * orders are exactly the live commitments.
 */
export function deriveInFlightOrders(events: CoreEvents): InFlightOrderRef[] {
    const topology = new Topology();
    topology.applyEvents(events);

    const refs: InFlightOrderRef[] = [];
    for (const process of topology.getActiveProcesses()) {
        for (const order of process.orders.values()) {
            if (order.state !== OrderState.Active) continue;
            refs.push({
                orderHash: order.orderHash,
                processId: order.processId,
                checkoutHash: order.checkoutHash,
            });
        }
    }
    return refs;
}

// ── The gate ─────────────────────────────────────────────────────────────────

/** An in-flight order paired with its committed agreement — `null` when the
 *  pinned document was unreachable, failed hash-verification, or is simply
 *  party-private (the reader's wallet never witnessed the order's URI). */
export interface InFlightAgreement {
    processId: Hex;
    agreement: Agreement | null;
}

export interface WithdrawGate {
    /** True iff no in-flight trade VERIFIABLY composes the clause or assembly — the
     *  advisory "safe to reclaim the stake now" signal
     *  (`inFlightCount === 0`; unverified trades never block). */
    canWithdraw: boolean;
    /** In-flight trades that verifiably compose the clause or assembly. */
    inFlightCount: number;
    /** In-flight trades whose agreement could not be verified — surfaced as an
     *  informational caveat, never blocking: terms are party-private, and the
     *  on-chain inclusion-proof model doesn't lock on unrevealed trades either. */
    unverifiedCount: number;
}

function gate(inFlightCount: number, unverifiedCount: number): WithdrawGate {
    return { canWithdraw: inFlightCount === 0, inFlightCount, unverifiedCount };
}

/**
 * Withdraw gate for a CLAUSE. A trade composes the clause iff its
 * agreement names its key (`clauses[].clause`). Counted per order — each
 * committed order is a distinct live commitment bound to the clause; a stake is
 * reclaimable only once every trade naming that key has resolved.
 */
export function deriveClauseWithdrawGate(
    clauseKey: Hex,
    agreements: readonly InFlightAgreement[],
): WithdrawGate {
    let inFlightCount = 0;
    let unverifiedCount = 0;
    for (const entry of agreements) {
        if (entry.agreement === null) {
            unverifiedCount += 1;
            continue;
        }
        if (entry.agreement.clauses.some((s) => s.clause.toLowerCase() === clauseKey.toLowerCase())) {
            inFlightCount += 1;
        }
    }
    return gate(inFlightCount, unverifiedCount);
}

/** A gate counted per PROCESS from the verified agreements' provenance: a
 *  process counts once when any of its verified orders names `key` under
 *  `field`; a process with any unverifiable agreement lands in
 *  `unverifiedCount` (surfaced, never blocking). */
function provenanceGate(
    field: keyof AgreementProvenance,
    key: Hex,
    agreements: readonly InFlightAgreement[],
): WithdrawGate {
    const byProcess = new Map<Hex, InFlightAgreement[]>();
    for (const entry of agreements) {
        const group = byProcess.get(entry.processId);
        if (group) group.push(entry);
        else byProcess.set(entry.processId, [entry]);
    }
    let inFlightCount = 0;
    let unverifiedCount = 0;
    for (const group of byProcess.values()) {
        if (group.some((g) => g.agreement === null)) {
            unverifiedCount += 1;
            continue;
        }
        const names = group.some((g) => g.agreement?.provenance?.[field]?.toLowerCase() === key.toLowerCase());
        if (names) inFlightCount += 1;
    }
    return gate(inFlightCount, unverifiedCount);
}

/**
 * Withdraw gate for an ASSEMBLY. A trade is composed from the assembly iff
 * one of its verified orders' provenance names the `assemblyHash`.
 * Counted per process.
 */
export function deriveAssemblyWithdrawGate(
    assemblyHash: Hex,
    agreements: readonly InFlightAgreement[],
): WithdrawGate {
    return provenanceGate("assemblyHash", assemblyHash, agreements);
}

/**
 * Withdraw gate for a REGISTERED AGREEMENT. A trade is composed from the
 * agreement iff one of its verified orders' provenance names the
 * `agreementHash` — whichever assembly the agreement sits in. Counted per
 * process, as the assembly gate.
 */
export function deriveAgreementWithdrawGate(
    agreementHash: Hex,
    agreements: readonly InFlightAgreement[],
): WithdrawGate {
    return provenanceGate("agreementHash", agreementHash, agreements);
}
