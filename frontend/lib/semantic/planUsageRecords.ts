/**
 * planUsageRecords — which usage writes the buyer's app sends after a resolve,
 * planned BEFORE the buyer is asked to resolve so the confirm can say how many.
 *
 * Pure: the chain facts arrive as each agreement's `UsageClaimContext`
 * (`fetchUsageClaimContext` — the counter's excluded set and its provenance
 * clause), and the per-order claims come from the SDK's `buildUsageClaims`,
 * the same builder the headless `recordProcessUsage` and the batch path use.
 * Planning here adds only what is process-wide:
 *
 *  - ONE write per DISTINCT clause-or-assembly key across the whole process —
 *    `UsageCounter` counts a key once per process (`AlreadyCounted`), so the
 *    first order that carries a key is the one planned;
 *  - never an excluded key — `buildUsageClaims` drops them, since a write for
 *    one is certain to revert `ClauseOrAssemblyExcluded`;
 *  - the assembly write stays INDEPENDENT of the clause writes: the section
 *    carrying the compositionHash is the provenance clause, which is itself
 *    excluded, and the designer's credit must not depend on it.
 *
 * The plan is what the counter would accept from what the agreements alone
 * say; the live-stake gates and a key another caller counted meanwhile are
 * checked per write by simulation at send time (`useUsageRecorder`).
 */
import type { Hex } from "viem";
import {
    buildUsageClaims,
    computeClauseKey,
    type Agreement,
    type Commitment,
    type UsageClaimContext,
} from "@figaro-protocol/sdk";
import { isBytes32Hex } from "@/lib/shared/evm";

/** One resolved order's inputs: the SIGNED commitment the counter re-hashes,
 *  its hydrated agreement and the counter's facts about that agreement. */
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
          /** `computeClauseKey(clause, version)`. */
          key: Hex;
          /** The clause id, for the log line. */
          clause: string;
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
     *  compositionHash that is not a bytes32 kills the designer's credit). */
    problems: string[];
}

export function planUsageRecords(entries: readonly UsagePlanEntry[]): UsagePlan {
    const writes: PlannedUsageWrite[] = [];
    const problems: string[] = [];
    const planned = new Set<string>();
    for (const { orderHash, commitment, agreement, context } of entries) {
        const clauseOf = new Map(
            agreement.sections.map((s) => [computeClauseKey(s.clause, s.version).toLowerCase(), s.clause]),
        );
        for (const section of agreement.sections) {
            const composition = (section.data as Record<string, unknown> | undefined)?.compositionHash;
            if (composition !== undefined && (typeof composition !== "string" || !isBytes32Hex(composition))) {
                problems.push(`${section.clause} on order ${orderHash}: compositionHash present but malformed: ${JSON.stringify(composition)}`);
            }
        }
        for (const claim of buildUsageClaims(commitment, agreement, context)) {
            const key = claim.clause_or_assembly.toLowerCase();
            if (planned.has(key)) continue;
            if (claim.kind === "Assembly") {
                if (!isBytes32Hex(claim.clause_or_assembly)) continue; // said in `problems` above
                planned.add(key);
                writes.push({ kind: "assembly", orderHash, order: commitment, key: claim.clause_or_assembly, proof: claim.inclusion_proof });
                continue;
            }
            planned.add(key);
            writes.push({
                kind: "clause",
                orderHash,
                order: commitment,
                key: claim.clause_or_assembly,
                clause: clauseOf.get(key) ?? claim.clause_or_assembly,
                sectionHash: claim.kind.Clause.section_hash,
                proof: claim.inclusion_proof,
            });
        }
    }
    return { writes, problems };
}
