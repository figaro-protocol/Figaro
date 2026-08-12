/**
 * reconstructOrders.ts — ONE walk from an assembly template to its orders.
 *
 * Every consumer that turns a template into kernel orders — an agent
 * originating a chain (`@figaro/sdk/agent` `buildChainOffers`), a checkout
 * realizing a bound assembly, a designer displaying a draft — performs the
 * same walk: order the template agreements so parents precede children,
 * detect the root, replace template-local parent ids with real EIP-712 order
 * hashes, accumulate cumulative value, and derive each order's hash and the
 * process id from the root. This module is that walk's single home.
 *
 * Two layers:
 *   - `planTemplateOrders` — the PURE STRUCTURE: commit-ordered nodes with
 *     their clause bags and local parent edges. No parties, no values, no
 *     signatures. Display paths consume this directly.
 *   - `reconstructOrdersFromTemplate` — the FULL REALIZATION: agreements,
 *     hashes, commitments, and typed data per node, against the running
 *     cumulative value. The SDK never fabricates signatures — the caller
 *     signs each node's `typedData` (and may do so per-node via `onOrder`).
 *
 * A DAG of orders under one root: the kernel sees a LINEAR sequence of
 * commits updating a monotonic cumulative-value accumulator; DAG topology is
 * off-chain (each order's parents recorded in its topology section, matched
 * by FIELD NAME, never clause id).
 */

import { templateClauseVersion, templateParentOrderHashes, templateCompositionHash } from "./assembly.js";
import type { AssemblyTemplate, TemplateAgreement } from "./assembly.js";
import { computeAgreementHash, type Agreement, type AgreementSection } from "./agreement.js";
import {
    buildCommitment,
    buildDomain,
    computeCommitmentProcessId,
    computeOrderHash,
    ZERO_PROCESS_ID,
} from "./commitments.js";
import {
    buildOrderAgreement,
    specDeclaresContentField,
    specDeclaresField,
    type SpecSource,
} from "./projection.js";
import { topologicalOrder } from "./topology.js";
import type { Address, Commitment, Hex } from "./types.js";

// ── Layer 1: pure structure ─────────────────────────────────────────────────

/** One template node, in commit order. */
export interface PlannedTemplateOrder {
    /** Template node id (matches `template.agreements[].id`). */
    nodeId: string;
    /** The node's clause bag, verbatim from the template (parents still
     *  template-local). */
    clauses: Record<string, Record<string, unknown>>;
    /** clauseId → composed version (COMPLETE — absent template entries resolve
     *  to 1, so downstream never falls back to a registry read: the template
     *  pinned WHICH clause it composed). */
    clauseVersions: Record<string, number>;
    /** Template-local parent node ids (empty on the root). */
    parentLocalIds: string[];
    /** Position in commit order — 0 is the root. */
    index: number;
}

/**
 * The template's agreements in commit order (parents before children, root
 * first), each with its clause bag and COMPLETE version map. Throws on a
 * cyclic topology; a template whose first node has parents (a sub-order with
 * no root) is rejected by the realization layer.
 */
export function planTemplateOrders(template: AssemblyTemplate): PlannedTemplateOrder[] {
    const byId = new Map(template.agreements.map((a) => [a.id, a]));
    const orderedIds = topologicalOrder(
        template.agreements.map((a) => a.id),
        (id) => [...templateParentOrderHashes(byId.get(id) as TemplateAgreement)],
        "throw",
    );
    // THE ASSEMBLY-SCOPE FOLD (ruled 2026-07-28): the template's
    // assembly-scoped sections — terms of the composition itself (a
    // denomination pin, a dispute forum) — fold into EVERY node's clause bag,
    // so every agreement carries them and every party signs them. Mechanical:
    // neither the designer nor any party repeats anything.
    const assemblyClauses = template.assemblyClauses ?? {};
    const assemblyVersions = Object.fromEntries(
        Object.keys(assemblyClauses).map((c) => [c, template.assemblyClauseVersions?.[c] ?? 1]),
    );
    return orderedIds.map((id, index) => {
        const node = byId.get(id) as TemplateAgreement;
        const clauseVersions: Record<string, number> = { ...assemblyVersions };
        for (const clauseId of Object.keys(node.clauses)) {
            clauseVersions[clauseId] = templateClauseVersion(node, clauseId);
        }
        return {
            nodeId: id,
            clauses: { ...assemblyClauses, ...node.clauses },
            clauseVersions,
            parentLocalIds: [...templateParentOrderHashes(node)],
            index,
        };
    });
}

/** Build an Agreement from a template node's clause bag: each clauseId → a
 *  section, caller overrides merged in. Section versions come from the
 *  COMPOSITION (`node.clauseVersions`, sparse — absent = 1), never from a
 *  registry read: the template pinned WHICH clause it composed, and two live
 *  versions are two clauses. */
export function templateAgreementFromClauses(
    clauses: Record<string, Record<string, unknown>>,
    node: Pick<TemplateAgreement, "clauseVersions">,
    buyer: Address,
    seller: Address,
    overrides?: Record<string, Record<string, unknown>>,
): Agreement {
    const sections: AgreementSection[] = Object.entries(clauses).map(([clauseId, data]) => ({
        clause: clauseId,
        version: templateClauseVersion(node, clauseId),
        data: { ...data, ...(overrides?.[clauseId] ?? {}) },
    }));
    return { version: "a1", buyer, seller, sections };
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
    /** Per-clause field values merged onto the template's clause data (e.g.
     *  the commerce clause's `{ currency, payment, lineItems }`). Keyed by
     *  clauseId; the SDK names none. */
    overrides?: Record<string, Record<string, unknown>>;
}

export interface ReconstructParams {
    buyer: Address;
    currency: Address;
    chainId: number;
    core: Address;
    /** One spec per template node id. */
    nodes: (planned: PlannedTemplateOrder) => ReconstructNodeSpec;
    /**
     * When supplied, agreements build through the spec-default projection
     * (`buildOrderAgreement` — checkout semantics: registry-declared defaults
     * fill omitted fields, process-log clauses stay empty anchors), and the
     * walk ALSO fills `currency` (matched by declared field, never clause id)
     * into the commerce section of EVERY realized order — the one term that
     * must equal the commitment struct's `currency` field
     * (docs/CLAUSES.md § "Every clause is a merkle leaf"). A caller override
     * that already names a currency is accepted only when it matches; a
     * CONTRADICTING override throws before hashing, so the walk never signs a
     * leaf that disagrees with its struct.
     *
     * Without `specs`, the raw override-merge (`templateAgreementFromClauses`)
     * applies — the agent-origination semantics — and currency-leaf routing is
     * impossible (no spec to find the commerce clause by declared field). A
     * spec-less caller OWNS that leaf: it must supply the commerce section's
     * `currency` itself, via `ReconstructNodeSpec.overrides`, equal to the
     * `currency` this walk is called with. The sign gate
     * (`assertAgreementSignable`) is the net that catches a spec-less caller
     * that forgets — it refuses to sign a leaf that disagrees with the struct
     * — but this walk cannot fill or check the leaf itself with no spec to
     * find it by.
     *
     * Either way the section versions come from the composition.
     */
    specs?: SpecSource;
    /** Optional deterministic salt per node (testing). */
    salt?: (nodeId: string) => bigint | undefined;
    /** CHAIN-time deadline for every reconstructed commitment (operator rule
     *  2026-08-06): `computeDeadline(await readChainTimestamp(client))`. */
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
     *  `expectedCumulativeValue` names. */
    cumulativeValue: bigint;
    agreement: Agreement;
    agreementHash: Hex;
    commitment: Commitment;
    /** The EIP-712 payload the buyer (and the seller, via `signAs`) signs. */
    typedData: ReturnType<typeof buildCommitment>["typedData"];
    /** This order's REAL EIP-712 order hash — fed to its children's topology. */
    orderHash: Hex;
    /** The process id every order names: ZERO on the root's signed struct
     *  (the kernel derives it), the root's derived id on every sub-order. */
    processId: Hex;
}

/**
 * Realize the whole chain, in commit order: the root signs `processId = 0`;
 * sub-orders name the root's derived processId, carry their parents' REAL
 * order hashes, and commit against the running cumulative value. Commits must
 * be SUBMITTED in the returned order (root first) so the kernel sees a
 * consistent running total.
 */
export async function reconstructOrdersFromTemplate(
    template: AssemblyTemplate,
    params: ReconstructParams,
): Promise<ReconstructedOrder[]> {
    const planned = planTemplateOrders(template);
    const domain = buildDomain(params.chainId, params.core);

    const realHash = new Map<string, Hex>();
    let rootProcessId: Hex | null = null;
    let cumulative = 0n;
    // Lazily computed only when a spec identifies a provenance clause — the
    // template's OWN composition hash, filled mechanically (see fillWalkProvenance).
    let walkCompositionHash: `0x${string}` | undefined;
    const out: ReconstructedOrder[] = [];

    for (const node of planned) {
        const spec = params.nodes(node);
        const isRoot = node.index === 0;
        if (!isRoot && rootProcessId === null) {
            throw new Error("template has a sub-order but no root");
        }

        cumulative += spec.payment;
        // Template-local parent ids → the REAL order hashes built for those
        // nodes (root's empty parents pass through unchanged). Matched by
        // FIELD NAME on every clause carrying `parentOrderHashes`.
        const clauses = withRealParents(node.clauses, realHash);
        const { agreement, agreementHash } = params.specs
            ? buildOrderAgreement(
                  params.buyer,
                  spec.seller,
                  fillWalkProvenance(
                      fillWalkCurrency(
                          mergeOverrides(clauses, spec.overrides),
                          params.currency,
                          params.specs,
                          node.nodeId,
                      ),
                      walkCompositionHash ?? (walkCompositionHash = templateCompositionHash(template)),
                      params.specs,
                      node.nodeId,
                  ),
                  params.specs,
                  node.clauseVersions,
              )
            : (() => {
                  const a = templateAgreementFromClauses(
                      clauses,
                      { clauseVersions: sparseVersions(node.clauseVersions) },
                      params.buyer,
                      spec.seller,
                      spec.overrides,
                  );
                  return { agreement: a, agreementHash: computeAgreementHash(a) };
              })();

        const { commitment, typedData } = buildCommitment(
            {
                processId: isRoot ? ZERO_PROCESS_ID : (rootProcessId as Hex),
                buyer: params.buyer,
                seller: spec.seller,
                currency: params.currency,
                payment: spec.payment,
                expectedCumulativeValue: cumulative,
                agreementHash,
                salt: params.salt?.(node.nodeId),
                deadline: params.deadline,
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
            cumulativeValue: cumulative,
            agreement,
            agreementHash,
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

/** Replace a node's template-local parent ids with the REAL order hashes built
 *  for those nodes. Root (empty parents) passes through unchanged. */
function withRealParents(
    clauses: Record<string, Record<string, unknown>>,
    realHash: Map<string, Hex>,
): Record<string, Record<string, unknown>> {
    const out: Record<string, Record<string, unknown>> = { ...clauses };
    for (const [cid, data] of Object.entries(clauses)) {
        const p = (data as { parentOrderHashes?: unknown }).parentOrderHashes;
        if (Array.isArray(p) && p.length > 0) {
            out[cid] = {
                ...data,
                parentOrderHashes: (p as string[]).map((localId) => {
                    const h = realHash.get(localId);
                    if (!h) throw new Error(`parent "${localId}" was not built before its child (bad topo order)`);
                    return h;
                }),
            };
        }
    }
    return out;
}

/** The commerce section's clause id, found the same way
 *  `checkoutPlan.fillCommerceSection` finds it: the composed clause whose
 *  loaded spec declares `payment` and declares `currency` as plain content
 *  (never a design-fill denomination pin — that is a different clause, a
 *  different term). Undefined when no composed clause matches or the spec
 *  cache is cold — a no-op, matching every other spec-routed fill in this
 *  SDK; never a clause id. */
function commerceClauseId(
    clauses: Record<string, Record<string, unknown>>,
    specs: SpecSource,
): string | undefined {
    return Object.keys(clauses).find((clauseId) => {
        const spec = specs.get(clauseId);
        return !!spec && specDeclaresField(spec, "payment") && specDeclaresContentField(spec, "currency");
    });
}

/** Write the process's settlement currency into the commerce section BEFORE
 *  hashing, so the leaf every party signs never diverges from the commitment
 *  struct's `currency` field (docs/CLAUSES.md § "Every clause is a merkle
 *  leaf"). A no-op when no composed clause carries the currency-as-content
 *  field. A caller override that already names a currency is accepted only
 *  when it is IDENTICAL to `currency`; a CONTRADICTING override throws —
 *  the walk owns this leaf whenever specs are available, so a mismatched
 *  override is caller error to surface immediately, not a value to silently
 *  reconcile or overwrite. */
function fillWalkCurrency(
    clauses: Record<string, Record<string, unknown>>,
    currency: Address,
    specs: SpecSource,
    nodeId: string,
): Record<string, Record<string, unknown>> {
    const clauseId = commerceClauseId(clauses, specs);
    if (!clauseId) return clauses;
    const existing = clauses[clauseId]?.currency;
    if (typeof existing === "string" && existing.length > 0 && existing.toLowerCase() !== currency.toLowerCase()) {
        throw new Error(
            `node "${nodeId}": override names commerce currency ${existing}, which contradicts this process's ` +
                `currency ${currency} — refusing to build a leaf that disagrees with the commitment struct`,
        );
    }
    return { ...clauses, [clauseId]: { ...clauses[clauseId], currency } };
}

/** The composed clause whose loaded spec declares `compositionHash` as plain
 *  content — the provenance section (`fillProvenanceSection` in checkoutPlan
 *  routes the same way). Undefined when none is composed or the cache is cold
 *  — a no-op, never a clause id. */
function provenanceClauseId(
    clauses: Record<string, Record<string, unknown>>,
    specs: SpecSource,
): string | undefined {
    return Object.keys(clauses).find((clauseId) => {
        const spec = specs.get(clauseId);
        return !!spec && specDeclaresContentField(spec, "compositionHash");
    });
}

/** Write the instantiated template's OWN composition hash into the provenance
 *  section BEFORE hashing — the mechanical fill the checkout performs
 *  (docs/CLAUSES.md: the hash cannot appear inside the composition it hashes,
 *  so it fills at instantiation, never at design). A no-op when no composed
 *  clause declares the field. A caller override that already names a hash is
 *  accepted only when IDENTICAL; a CONTRADICTING override throws — an
 *  agreement claiming to instantiate a different composition than the one
 *  that built it is a forgery to surface, not a value to reconcile. */
export function fillWalkProvenance(
    clauses: Record<string, Record<string, unknown>>,
    compositionHash: `0x${string}`,
    specs: SpecSource,
    nodeId: string,
): Record<string, Record<string, unknown>> {
    const clauseId = provenanceClauseId(clauses, specs);
    if (!clauseId) return clauses;
    const existing = clauses[clauseId]?.compositionHash;
    if (typeof existing === "string" && existing.length > 0 && existing.toLowerCase() !== compositionHash.toLowerCase()) {
        throw new Error(
            `node "${nodeId}": override names compositionHash ${existing}, which contradicts this template's ` +
                `own composition hash ${compositionHash} — refusing to claim a different provenance`,
        );
    }
    return { ...clauses, [clauseId]: { ...clauses[clauseId], compositionHash } };
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

/** The sparse form `templateAgreementFromClauses` reads (v1 entries dropped). */
function sparseVersions(complete: Record<string, number>): Record<string, number> | undefined {
    const sparse: Record<string, number> = {};
    for (const [cid, v] of Object.entries(complete)) if (v !== 1) sparse[cid] = v;
    return Object.keys(sparse).length > 0 ? sparse : undefined;
}
