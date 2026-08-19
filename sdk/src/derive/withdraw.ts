/**
 * @figaro/sdk/derive — Withdraw gate (commits==resolves)
 *
 * The off-chain, advisory half of the K4 staked-intent model: a clause-or-assembly
 * author (each registry's `registeredBy`) must not reclaim their
 * registration stake while deals COMPOSED FROM that clause or assembly are still in
 * flight. This is the read-side derivation RPGF attribution pays on — the same
 * count. It is ADVISORY today (surfaced as a disabled affordance); an on-chain
 * inclusion-proof withdraw lock would harden it if one is ever built — a
 * deliberate open item, not machinery that exists. Nothing here touches the
 * kernel.
 *
 * The join, derived at read time from chain + IPFS, NEVER stored:
 *   1. an order is IN-FLIGHT when committed (`OrderCommitted`) but its process
 *      is not yet resolved (`ProcessResolved`) — `deriveInFlightOrders` reads
 *      that straight off the reconstructed `Topology`;
 *   2. each in-flight order carries an `agreementHash`; the caller fetches the
 *      pinned, hash-verified agreement document for it (the SDK stays viem-only
 *      and does no IPFS I/O — the frontend's `fetchAgreement` is that fetch);
 *   3. the agreement NAMES the clauses it composes — `Agreement.sections[].clause`
 *      (paired with `.version` for the on-chain id). There is NO stored assembly
 *      reference on the committed agreement, so an assembly is attributed
 *      STRUCTURALLY: its template's per-node clause composition (the set of
 *      `TemplateAgreement.clauses` keys) is fingerprinted and matched against
 *      the in-flight process's committed orders (whose section-clause sets are
 *      preserved verbatim from the template — checkout fills VALUES, never adds
 *      or drops clauses). Collisions between two assemblies with identical
 *      per-node clause sets OVER-block (both authors see the deal), which is the
 *      safe direction for a withdraw gate.
 *
 * `canWithdraw(clauseOrAssembly) == (inFlightCount === 0)`.
 *
 * VERIFIED in-flight deals block; UNVERIFIED deals are counted and SURFACED
 * but do not block. An in-flight order whose agreement could not be
 * fetched/verified is passed here as `agreement: null` and lands in
 * `unverifiedCount` — an informational caveat, never a veto. Two reasons,
 * both structural: (i) agreement bodies are PARTY-PRIVATE — a reader holds a
 * URI only for orders their own wallet witnessed — so a clause-or-assembly author can
 * never verify a stranger's deal; blocking on unverifiable foreign agreements
 * would dead-lock every author's withdraw whenever ANY deal is in flight
 * anywhere on the network. (ii) The on-chain hardening this advisory gate
 * anticipates is an opt-in INCLUSION-PROOF model: a deal locks the stake only
 * by PROVING the clause or assembly's leaf is in its committed agreement, so unrevealed
 * deals don't lock it there either — the advisory mirrors those semantics.
 * Absence stays absence: a clause or assembly with NO in-flight orders resolves to
 * `canWithdraw: true` (reads-at-edge — resolved-empty is absence, not error).
 */

import type { Hex } from "../types.js";
import { OrderState } from "../types.js";
import type { CoreEvents } from "../state.js";
import { Topology } from "../state.js";
import type { Agreement } from "../agreement.js";
import type { AssemblyTemplate } from "../assembly.js";

// ── In-flight extraction (pure — the caller supplies fetched events) ─────────

/** A committed-but-unresolved order — one live bonded commitment. The chain
 *  part of the join; the caller resolves each `agreementHash` to its pinned
 *  agreement before running a gate. */
export interface InFlightOrderRef {
    orderHash: Hex;
    processId: Hex;
    agreementHash: Hex;
}

/**
 * Every in-flight order (committed, its process not yet resolved) from a batch
 * of reconstructed core events. Reuses `Topology`, the one reconstruction path —
 * a process leaves the active set on `ProcessResolved`, and the kernel's atomic
 * resolution settles all of a process's orders together, so an active process's
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
                agreementHash: order.agreementHash,
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
    /** True iff no in-flight deal VERIFIABLY composes the clause or assembly — the
     *  advisory "safe to reclaim the stake now" signal
     *  (`inFlightCount === 0`; unverified deals never block). */
    canWithdraw: boolean;
    /** In-flight deals that verifiably compose the clause or assembly. */
    inFlightCount: number;
    /** In-flight deals whose agreement could not be verified — surfaced as an
     *  informational caveat, never blocking: terms are party-private, and the
     *  on-chain inclusion-proof model doesn't lock on unrevealed deals either. */
    unverifiedCount: number;
}

function gate(inFlightCount: number, unverifiedCount: number): WithdrawGate {
    return { canWithdraw: inFlightCount === 0, inFlightCount, unverifiedCount };
}

/**
 * Withdraw gate for a CLAUSE. A deal composes the clause iff its
 * agreement names it (`sections[].clause`). Counted per order — each committed
 * order is a distinct live commitment bound to the clause. Version-agnostic by
 * design: withdrawing a registration de-surfaces the clause for NEW
 * compositions regardless of which live version an in-flight deal pinned, and a
 * stake is reclaimable only once every deal naming that clause id has settled.
 */
export function deriveClauseWithdrawGate(
    clauseId: string,
    agreements: readonly InFlightAgreement[],
): WithdrawGate {
    let inFlightCount = 0;
    let unverifiedCount = 0;
    for (const entry of agreements) {
        if (entry.agreement === null) {
            unverifiedCount += 1;
            continue;
        }
        if (entry.agreement.sections.some((s) => s.clause === clauseId)) {
            inFlightCount += 1;
        }
    }
    return gate(inFlightCount, unverifiedCount);
}

/** The sorted clause ids one node composes — its structural signature. */
function nodeSignature(clauseIds: readonly string[]): string {
    return [...clauseIds].sort().join("|");
}

/** An assembly's structural fingerprint: the sorted multiset of its nodes'
 *  clause signatures. Derivable identically from the registered template and
 *  from an in-flight process's committed orders, so the two are comparable
 *  without recomputing the (irrecoverable-from-runtime) composition hash.
 *  Each node's signature applies THE ASSEMBLY-SCOPE FOLD exactly as
 *  `planTemplateOrders` does (`{...assemblyClauses, ...node.clauses}`): a
 *  committed order's sections always carry the assembly-scoped clauses (the
 *  provenance anchor at minimum), so a fingerprint computed without the fold
 *  can never match a real process — which is precisely the bug this comment
 *  guards against recurring. */
function assemblyFingerprint(template: AssemblyTemplate): string[] {
    const assemblyClauseIds = Object.keys(template.assemblyClauses ?? {});
    return template.agreements
        .map((node) => nodeSignature([
            ...new Set([...assemblyClauseIds, ...Object.keys(node.clauses)]),
        ]))
        .sort();
}

function processFingerprint(orders: readonly Agreement[]): string[] {
    return orders.map((a) => nodeSignature(a.sections.map((s) => s.clause))).sort();
}

function fingerprintsEqual(a: readonly string[], b: readonly string[]): boolean {
    return a.length === b.length && a.every((v, i) => v === b[i]);
}

/**
 * Withdraw gate for an ASSEMBLY. A deal is composed from the assembly
 * iff it is a PROCESS whose committed orders reproduce the template's per-node
 * clause composition (see `assemblyFingerprint`). Counted per process. A
 * process with any unverifiable agreement can't be fully fingerprinted, so it
 * lands in `unverifiedCount` (surfaced, never blocking). The structural match
 * is EXACT: a process only partially committed (mid-checkout) or extended
 * beyond the template does not fingerprint-match and is not counted — this
 * hardens when on-chain provenance (the inclusion-proof model) lands.
 * `template` is the fetched, composition-hash-verified assembly document; the
 * SDK does no IPFS I/O.
 */
export function deriveAssemblyWithdrawGate(
    template: AssemblyTemplate,
    agreements: readonly InFlightAgreement[],
): WithdrawGate {
    const byProcess = new Map<Hex, InFlightAgreement[]>();
    for (const entry of agreements) {
        const group = byProcess.get(entry.processId);
        if (group) group.push(entry);
        else byProcess.set(entry.processId, [entry]);
    }

    const target = assemblyFingerprint(template);
    let inFlightCount = 0;
    let unverifiedCount = 0;
    for (const group of byProcess.values()) {
        if (group.some((g) => g.agreement === null)) {
            unverifiedCount += 1;
            continue;
        }
        const fingerprint = processFingerprint(group.map((g) => g.agreement as Agreement));
        if (fingerprintsEqual(fingerprint, target)) {
            inFlightCount += 1;
        }
    }
    return gate(inFlightCount, unverifiedCount);
}
