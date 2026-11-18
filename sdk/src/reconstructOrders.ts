/**
 * reconstructOrders.ts — ONE walk from an assembly to its orders.
 *
 * Every consumer that turns a assembly into FigaroCore orders — an agent
 * originating a chain (`@figaro-protocol/sdk/agent` `buildChainOffers`), a checkout
 * realizing a bound assembly, a designer displaying a draft — performs the
 * same walk: order the registered agreements so parents precede children,
 * detect the root, replace assembly-local parent ids with real EIP-712 order
 * hashes, accumulate cumulative value, and derive each order's hash and the
 * process id from the root. This module is that walk's single home.
 *
 * Two layers:
 *   - `planProcessOrders` — the PURE STRUCTURE: commit-ordered nodes with
 *     their clause bags and local parent edges. No parties, no values, no
 *     signatures. Display paths consume this directly.
 *   - `reconstructOrdersFromProcessDesign` — the FULL REALIZATION: agreements,
 *     hashes, commitments, and typed data per node, against the running
 *     cumulative value. The SDK never fabricates signatures — the caller
 *     signs each node's `typedData` (and may do so per-node via `onOrder`).
 *
 * A DAG of orders under one root: FigaroCore sees a LINEAR sequence of
 * commits updating a monotonic cumulative-value accumulator; DAG topology is
 * off-chain (each order's parents' order hashes in its agreement's topology
 * leaf, `Agreement.follows`, written from the assembly entry's `follows`).
 */

import { agreementClauses, processDesignFollows, processDesignHashOf } from "./assembly.js";
import type { HydratedProcessDesign, ProcessDesignAgreement } from "./assembly.js";
import {
    computeCheckoutHash,
    type Agreement,
    type AgreementProvenance,
    type AgreementClause,
} from "./agreement.js";
import {
    buildCommitment,
    buildDomain,
    computeCommitmentProcessId,
    computeOrderHash,
    ZERO_PROCESS_ID,
} from "./commitments.js";
import {
    buildOrderAgreement,
    type SpecSource,
} from "./projection.js";
import { topologicalOrder } from "./topology.js";
import type { Address, Commitment, Hex } from "./types.js";

// ── Layer 1: pure structure ─────────────────────────────────────────────────

/** One agreement, in commit order. */
export interface PlannedProcessOrder {
    /** Agreement id (matches `assembly.agreements[].id`). */
    nodeId: string;
    /** The registered agreement the agreement binds. */
    agreementHash: Hex;
    /** The agreement's clause bag (clauseKey → values): the assembly-scoped
     *  clauses, the registered agreement's clauses and the agreement's own
     *  fills over them. */
    clauses: Record<string, Record<string, unknown>>;
    /** Assembly-local parent node ids (empty on the root). */
    parentLocalIds: string[];
    /** Position in commit order — 0 is the root. */
    index: number;
}

/**
 * The assembly's agreements in commit order (parents before children, root
 * first), each with its clause bag read from its hydrated registered
 * agreement. Throws on a cyclic topology and on an agreement whose agreement
 * is not hydrated; a assembly whose first node has parents (a sub-order with
 * no root) is rejected by the realization layer.
 */
export function planProcessOrders(hydrated: HydratedProcessDesign): PlannedProcessOrder[] {
    const { assembly } = hydrated;
    const byId = new Map(assembly.agreements.map((a) => [a.id, a]));
    const orderedIds = topologicalOrder(
        assembly.agreements.map((a) => a.id),
        (id) => [...processDesignFollows(byId.get(id) as ProcessDesignAgreement)],
        "throw",
    );
    // THE ASSEMBLY-SCOPE FOLD: the assembly's
    // assembly-scoped clauses — terms of the composition itself (a
    // denomination pin, a dispute forum) — fold into EVERY node's clause bag,
    // so every agreement carries them and every party signs them. Mechanical:
    // neither the designer nor any party repeats anything.
    const assemblyClauses = assembly.assemblyClauses ?? {};
    return orderedIds.map((id, index) => {
        const entry = byId.get(id) as ProcessDesignAgreement;
        return {
            nodeId: id,
            agreementHash: entry.agreementHash,
            clauses: { ...assemblyClauses, ...agreementClauses(hydrated, entry) },
            parentLocalIds: [...processDesignFollows(entry)],
            index,
        };
    });
}

/** Build an Agreement from a assembly node's clause bag: each clause key → a
 *  clause, caller overrides merged in. The key is the clause's identity, so
 *  the assembly pinned WHICH clause it composed and no registry read is made. */
export function agreementFromClauses(
    clauses: Record<string, Record<string, unknown>>,
    buyer: Address,
    seller: Address,
    overrides?: Record<string, Record<string, unknown>>,
): Agreement {
    const clauseEntries: AgreementClause[] = Object.entries(clauses).map(([clauseKey, data]) => ({
        clause: clauseKey as Hex,
        data: { ...data, ...(overrides?.[clauseKey] ?? {}) },
    }));
    return { version: "a1", buyer, seller, clauses: clauseEntries };
}

// ── Layer 2: full realization ───────────────────────────────────────────────

/** The caller's per-node inputs: who sells, what it pays, and how the node's
 *  clause data is completed. */
export interface ReconstructNodeSpec {
    /** The seller for this node — the buyer's counterparty choice. A single
     *  seller across multiple nodes is fine: bond approval is additive. */
    seller: Address;
    /** This node's payment (the value it adds). */
    payment: bigint;
    /** Per-clause field values merged onto the assembly's clause data (e.g.
     *  the line-items clause's `{ lineItems }`). Keyed by clause key; the SDK
     *  names none. The payment and the token are the commitment's, never a
     *  clause's. */
    overrides?: Record<string, Record<string, unknown>>;
}

export interface ReconstructParams {
    buyer: Address;
    currency: Address;
    chainId: number;
    core: Address;
    /** One spec per assembly node id. */
    nodes: (planned: PlannedProcessOrder) => ReconstructNodeSpec;
    /**
     * When supplied, agreements build through the spec-default projection
     * (`buildOrderAgreement` — checkout semantics: registry-declared defaults
     * fill omitted fields, process-log clauses stay empty anchors).
     * Without `specs`, the raw override-merge (`agreementFromClauses`)
     * applies — the agent-origination semantics. Either way the token and
     * the payment go into the commitment only, never into a clause.
     */
    specs?: SpecSource;
    /** Optional deterministic salt per node (testing). */
    salt?: (nodeId: string) => bigint | undefined;
    /** CHAIN-time deadline for every reconstructed commitment (maintainer
     *  rule): `computeDeadline(await readChainTimestamp(client))`. */
    deadline: bigint;
    /** Per-node seam, invoked in commit order as each order is realized —
     *  where a caller signs (`order.typedData`), shares, or composes. */
    onOrder?: (order: ReconstructedOrder) => void | Promise<void>;
}

/** One realized order, in commit order. */
export interface ReconstructedOrder {
    nodeId: string;
    index: number;
    /** True for the process root (commit-order position 0). */
    isRoot: boolean;
    seller: Address;
    payment: bigint;
    /** The process's running total AFTER this order — what the commitment's
     *  `runningTotal` names. */
    runningTotal: bigint;
    agreement: Agreement;
    checkoutHash: Hex;
    commitment: Commitment;
    /** The EIP-712 payload the buyer (and the seller, via `signAs`) signs. */
    typedData: ReturnType<typeof buildCommitment>["typedData"];
    /** This order's REAL EIP-712 order hash — fed to its children's topology. */
    orderHash: Hex;
    /** The process id every order names: ZERO on the root's signed struct
     *  (FigaroCore derives it), the root's derived id on every sub-order. */
    processId: Hex;
}

/**
 * Realize the whole chain, in commit order: the root signs `processId = 0`;
 * sub-orders name the root's derived processId, carry their parents' REAL
 * order hashes, and commit against the running cumulative value. Commits must
 * be SUBMITTED in the returned order (root first) so FigaroCore sees a
 * consistent running total.
 */
export async function reconstructOrdersFromProcessDesign(
    hydrated: HydratedProcessDesign,
    params: ReconstructParams,
): Promise<ReconstructedOrder[]> {
    const planned = planProcessOrders(hydrated);
    const domain = buildDomain(params.chainId, params.core);

    const realHash = new Map<string, Hex>();
    let rootProcessId: Hex | null = null;
    let cumulative = 0n;
    // The assembly's OWN assembly hash — every realized order carries it,
    // beside its agreement's agreement hash, as the agreement's provenance
    // leaf (see fillWalkProvenance).
    const processDesignHash = processDesignHashOf(hydrated.assembly);
    const out: ReconstructedOrder[] = [];

    for (const node of planned) {
        const spec = params.nodes(node);
        const isRoot = node.index === 0;
        if (!isRoot && rootProcessId === null) {
            throw new Error("assembly has a sub-order but no root");
        }

        cumulative += spec.payment;
        // Assembly-local parent ids → the REAL order hashes built for those
        // nodes, written into the agreement's topology leaf ([] on the root).
        const follows = realParents(node, realHash);
        const clauses = node.clauses;
        const built = params.specs
            ? buildOrderAgreement(
                  params.buyer,
                  spec.seller,
                  mergeOverrides(clauses, spec.overrides),
                  params.specs,
              ).agreement
            : agreementFromClauses(
                  clauses,
                  params.buyer,
                  spec.seller,
                  spec.overrides,
              );
        const agreement = fillWalkTopology(
            fillWalkProvenance(built, { agreementHash: node.agreementHash, processDesignHash }, node.nodeId),
            follows,
            node.nodeId,
        );
        const checkoutHash = computeCheckoutHash(agreement);

        const { commitment, typedData } = buildCommitment(
            {
                processId: isRoot ? ZERO_PROCESS_ID : (rootProcessId as Hex),
                buyer: params.buyer,
                seller: spec.seller,
                token: params.currency,
                payment: spec.payment,
                runningTotal: cumulative,
                checkoutHash,
                salt: params.salt?.(node.nodeId),
                commitDeadline: params.deadline,
            },
            domain,
        );

        if (isRoot) {
            rootProcessId = computeCommitmentProcessId(commitment, params.chainId, params.core);
        }
        const orderHash = computeOrderHash(commitment, params.chainId, params.core);
        realHash.set(node.nodeId, orderHash);

        const order: ReconstructedOrder = {
            nodeId: node.nodeId,
            index: node.index,
            isRoot,
            seller: spec.seller,
            payment: spec.payment,
            runningTotal: cumulative,
            agreement,
            checkoutHash,
            commitment,
            typedData,
            orderHash,
            processId: rootProcessId as Hex,
        };
        if (params.onOrder) await params.onOrder(order);
        out.push(order);
    }
    return out;
}

/** A node's assembly-local parent ids, as the REAL order hashes built for
 *  those nodes. Empty for the root. */
function realParents(node: PlannedProcessOrder, realHash: Map<string, Hex>): Hex[] {
    return node.parentLocalIds.map((localId) => {
        const h = realHash.get(localId);
        if (!h) throw new Error(`parent "${localId}" was not built before its child (bad topo order)`);
        return h;
    });
}

/** Write the orders the order follows — their order hashes, `[]` for the
 *  root — into the agreement's topology leaf (`Agreement.follows`) BEFORE
 *  hashing: the agreement format's own field, never a clause, filled at
 *  instantiation from the assembly entry's `follows`, as the provenance is.
 *  An agreement already naming the SAME edges in the same order passes
 *  (case-insensitive); one naming other edges throws — an agreement
 *  claiming another place in the process than the one the walk gives it is
 *  a forgery to surface, not a value to reconcile. */
export function fillWalkTopology(agreement: Agreement, follows: readonly Hex[], nodeId: string): Agreement {
    const existing = agreement.follows;
    const same = (a: readonly Hex[], b: readonly Hex[]) =>
        a.length === b.length && a.every((h, i) => h.toLowerCase() === b[i].toLowerCase());
    if (existing !== undefined && !same(existing, follows)) {
        throw new Error(
            `node "${nodeId}": the agreement follows [${existing.join(", ")}], ` +
            `which contradicts this order's [${follows.join(", ")}] — refusing to claim another place in the process`,
        );
    }
    return { ...agreement, follows: [...follows] };
}

/** Write the order's provenance — the registered agreement its agreement
 *  binds and the instantiated assembly's OWN assembly hash — into the
 *  agreement's provenance leaf (`Agreement.provenance`) BEFORE hashing: the
 *  agreement format's own field, never a clause; neither hash can
 *  appear inside the composition it hashes, so it fills at instantiation,
 *  never at design. An agreement already naming the SAME pair passes
 *  (case-insensitive); one naming a DIFFERENT key or hash throws — an
 *  agreement claiming to instantiate a different design than the one that
 *  built it is a forgery to surface, not a value to reconcile. */
export function fillWalkProvenance(
    agreement: Agreement,
    provenance: AgreementProvenance,
    nodeId: string,
): Agreement {
    const existing = agreement.provenance;
    if (
        existing !== undefined &&
        (existing.agreementHash.toLowerCase() !== provenance.agreementHash.toLowerCase() ||
            existing.processDesignHash.toLowerCase() !== provenance.processDesignHash.toLowerCase())
    ) {
        throw new Error(
            `node "${nodeId}": the agreement names provenance ${existing.agreementHash} / ${existing.processDesignHash}, ` +
            `which contradicts this agreement's ${provenance.agreementHash} / ${provenance.processDesignHash} — ` +
            `refusing to claim a different provenance`,
        );
    }
    return { ...agreement, provenance: { agreementHash: provenance.agreementHash, processDesignHash: provenance.processDesignHash } };
}

/** The one clause-bag ∪ overrides merge (per-clause shallow spread) — shared
 *  by the walk and the root instantiation in agent/originate. */
export function mergeOverrides(
    clauses: Record<string, Record<string, unknown>>,
    overrides?: Record<string, Record<string, unknown>>,
): Record<string, Record<string, unknown>> {
    if (!overrides) return clauses;
    const out: Record<string, Record<string, unknown>> = { ...clauses };
    for (const [cid, data] of Object.entries(overrides)) {
        out[cid] = { ...(out[cid] ?? {}), ...data };
    }
    return out;
}
