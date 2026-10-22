/**
 * planUsageRecords — which usage writes the buyer's app sends after a resolve,
 * planned BEFORE the buyer is asked to resolve so the confirm can say how many.
 *
 * Pure: the chain facts arrive as the `UsageClaimContext`
 * (`fetchUsageClaimContext` — the counter's provenance and assembly-terms
 * leaf keys), and the per-order claims come from the SDK's
 * `buildUsageClaims`, the same builder the headless `recordProcessUsage` and
 * the batch path use: one claim per clause, and — when the agreement
 * names its provenance (`Agreement.provenance`: the registered agreement it
 * instantiated and its assembly's assembly root) — the agreement claim and
 * the assembly claim, the latter carrying the agreement's membership proof
 * from the assembly's assembly. Planning here adds only what is
 * process-wide:
 *
 *  - ONE write per DISTINCT `(kind, key)` pair across the whole process —
 *    `UsageCounter` counts a pair once per process (`AlreadyCounted`), so the
 *    first order that carries it is the one planned. The kind keeps the three
 *    families apart: a clause key, an agreement hash and an assembly
 *    assembly hash with the same bytes are three pairs, each counted under
 *    its own registry;
 *  - an order whose claims do not build (a malformed provenance, a missing or
 *    mismatched assembly, a counter whose reserved leaves are not the
 *    format's) plans nothing and is said in `problems`.
 *
 * The plan is what the counter would accept from what the agreements alone
 * say; the live-stake gates and a key another caller counted meanwhile are
 * checked per write by simulation at send time (`useUsageRecorder`).
 */
import {
    buildUsageClaims,
    usageClaimKindCode,
    usageKeyId,
    type Agreement,
    type Assembly,
    type Commitment,
    type UsageClaimContext,
} from "@figaro-protocol/sdk";
import { isBytes32Hex } from "@/lib/shared/evm";
import type { UsageWrite } from "@/lib/protocol/useUsageRecorder";

/** One resolved order's inputs: the SIGNED commitment the counter re-hashes,
 *  its hydrated agreement, the counter's facts, and — when the agreement
 *  names a provenance — the assembly of the assembly it instantiated (read
 *  from `AssemblyRegistry` by the assembly root). */
export interface UsagePlanEntry {
    orderHash: string;
    commitment: Commitment;
    agreement: Agreement;
    context: UsageClaimContext;
    assembly?: Assembly;
}

export type PlannedUsageWrite = UsageWrite & { orderHash: string };

interface UsagePlan {
    writes: PlannedUsageWrite[];
    /** Problems that cost a write, said loudly by the caller (a committed
     *  provenance that is not two bytes32 keys kills every write of its order). */
    problems: string[];
}

export function planUsageRecords(entries: readonly UsagePlanEntry[]): UsagePlan {
    const writes: PlannedUsageWrite[] = [];
    const problems: string[] = [];
    const planned = new Set<string>();
    for (const { orderHash, commitment, agreement, context, assembly } of entries) {
        const provenance = agreement.provenance as unknown;
        if (provenance !== undefined && (
            provenance === null || typeof provenance !== "object"
            || !isBytes32Hex((provenance as { agreementHash?: unknown }).agreementHash)
            || !isBytes32Hex((provenance as { assemblyHash?: unknown }).assemblyHash))) {
            problems.push(`order ${orderHash}: provenance present but malformed: ${JSON.stringify(provenance)}`);
            continue;
        }
        let claims: ReturnType<typeof buildUsageClaims>;
        try {
            claims = buildUsageClaims(commitment, agreement, context, assembly);
        } catch (error) {
            problems.push(`order ${orderHash}: ${error instanceof Error ? error.message : String(error)}`);
            continue;
        }
        for (const claim of claims) {
            const id = usageKeyId(usageClaimKindCode(claim), claim.clause_or_assembly);
            if (planned.has(id)) continue;
            planned.add(id);
            const kind = claim.kind;
            if ("Clause" in kind) {
                writes.push({
                    kind: "clause",
                    orderHash,
                    order: commitment,
                    key: claim.clause_or_assembly,
                    clauseDataHash: kind.Clause.clause_data_hash,
                    proof: claim.inclusion_proof,
                });
            } else if ("Agreement" in kind) {
                writes.push({
                    kind: "agreement",
                    orderHash,
                    order: commitment,
                    key: claim.clause_or_assembly,
                    assemblyHash: kind.Agreement.assembly_hash,
                    proof: claim.inclusion_proof,
                });
            } else {
                writes.push({
                    kind: "assembly",
                    orderHash,
                    order: commitment,
                    key: claim.clause_or_assembly,
                    agreementHash: kind.Assembly.agreement_hash,
                    slotContentHash: kind.Assembly.slot_content_hash,
                    proof: claim.inclusion_proof,
                    membershipProof: kind.Assembly.membership_proof,
                });
            }
        }
    }
    return { writes, problems };
}

