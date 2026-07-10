/**
 * Process-recourse resolution.
 *
 * Layer 3 of the three-layer dispute model (see the on-chain-evidence paper) is the only
 * *configured* layer: Layers 1 (bonding) and 2 (peer coordination) are kernel
 * mechanisms, always on. Layer 3 is the off-chain forum, and the parties'
 * agreement NAMES it — the dispute-resolution clause(s) the assembly designer
 * authored into the order(s).
 *
 * This reader is OPEN-WORLD: it recognises a recourse clause by its
 * `block.article === "dispute-resolution"`, never by a hardcoded field name or
 * clause id. So ANY decentralized-ADR or applicable-law clause — the two that
 * exist today, or a `figaro-arbitration-<provider>` registered tomorrow — is
 * read the instant it declares that article. The runtime surface renders each
 * clause generically from its own spec (`describeClause`); a provider's own
 * dispute UI is deep-linked from the clause spec's `block.composes.forumUrl`
 * (read via `composesForumUrl`) — the forum is named in the clause spec, not in
 * code, so a never-seen `figaro-arbitration-<provider>` surfaces its own forum.
 */
import type { Order } from "@/lib/kernel/store";
import type { Agreement } from "@figaro/sdk";
import { getClauseSpec } from "@/lib/shared/clauseSpecSource";

/** The article every dispute-resolution clause declares. Grouping is `article`'s
 *  job (see the clause model); recourse reads that group, nothing narrower. */
const RECOURSE_ARTICLE = "dispute-resolution";

/** A dispute-resolution clause a process authored — the clauseId plus its
 *  committed data. Surfaced generically (rendered via `describeClause` at the
 *  edge); the reader never interprets the fields itself. */
export interface RecourseClause {
    clauseId: string;
    data: Record<string, unknown>;
}

/**
 * Derive the dispute-resolution clause(s) a process's orders authored —
 * array-aware, deduped. Reads every order's committed sections and keeps those
 * whose clause declares the dispute-resolution article. A designer may author
 * more than one (e.g. a decentralized-ADR clause + an applicable-law clause),
 * so every distinct one is returned in first-seen order. Named `derive`, not
 * `resolve`, to stay clear of the kernel's `resolveProcess` settlement call.
 */
export function deriveProcessRecourse(
    orders: readonly Order[],
    agreements: Map<string, Agreement>,
): RecourseClause[] {
    const seen = new Set<string>();
    const out: RecourseClause[] = [];
    for (const order of orders) {
        const agreement = order.agreementHash ? agreements.get(order.agreementHash) : undefined;
        if (!agreement) continue;
        for (const section of agreement.sections) {
            if (getClauseSpec(section.clause)?.block?.article !== RECOURSE_ARTICLE) continue;
            const data = ((section as { data?: Record<string, unknown> }).data) ?? {};
            const key = `${section.clause}:${JSON.stringify(data)}`;
            if (seen.has(key)) continue;
            seen.add(key);
            out.push({ clauseId: section.clause, data });
        }
    }
    return out;
}
