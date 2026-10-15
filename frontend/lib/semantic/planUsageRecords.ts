/**
 * planUsageRecords — which usage writes the buyer's app sends after a resolve,
 * planned BEFORE the buyer is asked to resolve so the confirm can say how many.
 *
 * Pure: the chain fact arrives as the `UsageClaimContext`
 * (`fetchUsageClaimContext` — the counter's provenance leaf key), and the
 * per-order claims come from the SDK's `buildUsageClaims`, the same builder
 * the headless `recordProcessUsage` and the batch path use: one claim per
 * clause section, and the assembly claim from the agreement's provenance leaf
 * (`Agreement.provenance`) when the agreement names the assembly it
 * instantiated. Planning here adds only what is process-wide:
 *
 *  - ONE write per DISTINCT `(kind, key)` pair across the whole process —
 *    `UsageCounter` counts a pair once per process (`AlreadyCounted`), so the
 *    first order that carries it is the one planned. The kind keeps the two
 *    families apart: a clause key and an assembly composition hash with the
 *    same bytes are two pairs, each counted under its own registry;
 *  - an order whose claims do not build (a provenance that is not a bytes32,
 *    a counter whose provenance leaf is not the agreement format's) plans
 *    nothing and is said in `problems`.
 *
 * The plan is what the counter would accept from what the agreements alone
 * say; the live-stake gates and a key another caller counted meanwhile are
 * checked per write by simulation at send time (`useUsageRecorder`).
 */
import type { Hex } from "viem";
import {
    USAGE_KIND_ASSEMBLY,
    USAGE_KIND_CLAUSE,
    buildUsageClaims,
    usageKeyId,
    type Agreement,
    type Commitment,
    type UsageClaimContext,
} from "@figaro-protocol/sdk";
import { isBytes32Hex } from "@/lib/shared/evm";

/** One resolved order's inputs: the SIGNED commitment the counter re-hashes,
 *  its hydrated agreement and the counter's fact (its provenance leaf key). */
export interface UsagePlanEntry {
    orderHash: string;
    commitment: Commitment;
    agreement: Agreement;
    context: UsageClaimContext;
}

export type PlannedUsageWrite =
    | {
          kind: "clause";
          orderHash: string;
          order: Commitment;
          /** The clause key the section carries. */
          key: Hex;
          /** The section FINGERPRINT — only it reaches calldata, never the
           *  plaintext, so a private section stays off-chain. */
          sectionHash: Hex;
          proof: readonly Hex[];
      }
    | {
          kind: "assembly";
          orderHash: string;
          order: Commitment;
          /** The assembly's compositionHash. */
          key: Hex;
          proof: readonly Hex[];
      };

interface UsagePlan {
    writes: PlannedUsageWrite[];
    /** Problems that cost a write, said loudly by the caller (a committed
     *  provenance that is not a bytes32 kills every write of its order). */
    problems: string[];
}

export function planUsageRecords(entries: readonly UsagePlanEntry[]): UsagePlan {
    const writes: PlannedUsageWrite[] = [];
    const problems: string[] = [];
    const planned = new Set<string>();
    for (const { orderHash, commitment, agreement, context } of entries) {
        if (agreement.provenance !== undefined && (typeof agreement.provenance !== "string" || !isBytes32Hex(agreement.provenance))) {
            problems.push(`order ${orderHash}: provenance present but malformed: ${JSON.stringify(agreement.provenance)}`);
            continue;
        }
        let claims: ReturnType<typeof buildUsageClaims>;
        try {
            claims = buildUsageClaims(commitment, agreement, context);
        } catch (error) {
            problems.push(`order ${orderHash}: ${error instanceof Error ? error.message : String(error)}`);
            continue;
        }
        for (const claim of claims) {
            const isAssembly = claim.kind === "Assembly";
            const id = usageKeyId(isAssembly ? USAGE_KIND_ASSEMBLY : USAGE_KIND_CLAUSE, claim.clause_or_assembly);
            if (planned.has(id)) continue;
            planned.add(id);
            if (claim.kind === "Assembly") {
                writes.push({ kind: "assembly", orderHash, order: commitment, key: claim.clause_or_assembly, proof: claim.inclusion_proof });
                continue;
            }
            writes.push({
                kind: "clause",
                orderHash,
                order: commitment,
                key: claim.clause_or_assembly,
                sectionHash: claim.kind.Clause.section_hash,
                proof: claim.inclusion_proof,
            });
        }
    }
    return { writes, problems };
}
