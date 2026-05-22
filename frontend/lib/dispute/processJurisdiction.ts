/**
 * Process-jurisdiction recourse resolution.
 *
 * Layer 3 of the three-layer dispute model (figaro3e) is the only
 * *configured* layer: Layers 1 (bonding) and 2 (peer coordination) are
 * kernel mechanisms, always on. Layer 3 is the off-chain forum, and the
 * parties' agreement NAMES it — the `figaro-jurisdiction-v1` clause the
 * assembly designer authored into the order(s).
 *
 * This module reads that clause off a process's committed orders and
 * resolves the recourse option(s) the runtime dispute surface presents.
 * The dispute module is surfaced FROM the assembly — never from a global
 * default. A designer may author more than one jurisdiction across a
 * design, so resolution is array-aware: it returns every distinct
 * recourse path the process's orders carry.
 */
import type { Address } from "viem";
import type { Order } from "@/lib/core/store";
import { getSection, JURISDICTION_SCHEMA_KEY, type Agreement } from "@/lib/core/agreementManifest";
import { getKlerosCourt, encodeArbitratorExtraData, type KlerosCourt } from "./klerosCourts";
import type { KlerosConfig } from "./klerosProxy";

/** A Kleros (decentralized ODR) recourse path authored in a jurisdiction clause. */
export interface KlerosRecourse {
    kind: "kleros";
    court: KlerosCourt;
    minJurors: number;
}

/** A traditional (state / ADR) recourse path authored in a jurisdiction clause. */
export interface TraditionalRecourse {
    kind: "traditional";
    applicableLaw: string;
    forum?: string;
    language?: string;
}

export type JurisdictionRecourse = KlerosRecourse | TraditionalRecourse;

/** Stable identity for a recourse — dedupes identical clauses across orders. */
function recourseKey(r: JurisdictionRecourse): string {
    return r.kind === "kleros"
        ? `kleros:${r.court.key}:${r.minJurors}`
        : `traditional:${r.applicableLaw}:${r.forum ?? ""}:${r.language ?? ""}`;
}

/** Parse one figaro-jurisdiction-v1 section's data into its recourse path(s).
 *  One clause may name a Kleros forum AND a traditional forum — the schema
 *  requires at least one of `klerosCourt` / `applicableLaw`. */
function recoursesFromClause(data: Record<string, unknown>): JurisdictionRecourse[] {
    const out: JurisdictionRecourse[] = [];

    const klerosCourt = typeof data.klerosCourt === "string" ? data.klerosCourt : "";
    if (klerosCourt) {
        const court = getKlerosCourt(klerosCourt);
        if (court) {
            const raw = data.klerosMinJurors;
            const parsed = typeof raw === "number" ? raw : typeof raw === "string" ? parseInt(raw, 10) : NaN;
            const minJurors = Number.isInteger(parsed) && parsed >= 1 ? parsed : court.defaultMinJurors;
            out.push({ kind: "kleros", court, minJurors });
        }
    }

    const applicableLaw = typeof data.applicableLaw === "string" ? data.applicableLaw : "";
    if (applicableLaw) {
        out.push({
            kind: "traditional",
            applicableLaw,
            forum: typeof data.forum === "string" && data.forum ? data.forum : undefined,
            language: typeof data.language === "string" && data.language ? data.language : undefined,
        });
    }

    return out;
}

/**
 * Resolve the recourse forum(s) a process's orders authored — array-aware.
 * Reads every order's figaro-jurisdiction-v1 clause, dedupes, and returns
 * the distinct recourse paths in first-seen order.
 */
export function resolveProcessRecourse(
    orders: readonly Order[],
    agreements: Map<string, Agreement>,
): JurisdictionRecourse[] {
    const seen = new Set<string>();
    const out: JurisdictionRecourse[] = [];
    for (const order of orders) {
        const agreement = order.agreementHash
            ? (agreements.get(order.agreementHash) ?? null)
            : null;
        if (!agreement) continue;
        const section = getSection(agreement, JURISDICTION_SCHEMA_KEY);
        if (!section) continue;
        for (const recourse of recoursesFromClause(section.data)) {
            const key = recourseKey(recourse);
            if (seen.has(key)) continue;
            seen.add(key);
            out.push(recourse);
        }
    }
    return out;
}

/**
 * Build the on-chain KlerosConfig for a Kleros recourse. The clause's court
 * + min-juror count encode `arbitratorExtraData`; the `arbitrableProxy`
 * address is deployment config — a contract address, not a clause term.
 */
export function klerosConfigForRecourse(
    recourse: KlerosRecourse,
    arbitrableProxy: Address,
): KlerosConfig {
    return {
        arbitrableProxy,
        arbitratorExtraData: encodeArbitratorExtraData(recourse.court.id, recourse.minJurors),
    };
}
