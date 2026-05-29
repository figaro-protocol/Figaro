/**
 * Process-jurisdiction recourse resolution.
 *
 * Layer 3 of the three-layer dispute model (see the on-chain-evidence paper) is the only
 * *configured* layer: Layers 1 (bonding) and 2 (peer coordination) are
 * kernel mechanisms, always on. Layer 3 is the off-chain forum, and the
 * parties' agreement NAMES it — the `figaro-arbitration-kleros-v1` and
 * `figaro-applicable-law-v1` clauses the assembly designer authored into
 * the order(s).
 *
 * This module reads those clauses off a process's committed orders and
 * resolves the recourse option(s) the runtime dispute surface presents.
 * The dispute module is surfaced FROM the assembly — never from a global
 * default. A designer may author more than one dispute-resolution clause
 * across a design, so resolution is array-aware: it returns every distinct
 * recourse path the process's orders carry.
 */
import type { Address } from "viem";
import type { Order } from "@/lib/core/store";
import {
    APPLICABLE_LAW_CLAUSE_KEY,
    ARBITRATION_KLEROS_CLAUSE_KEY,
    getSection,
    type Agreement,
} from "@/lib/core/agreementManifest";
import { getKlerosCourt, encodeArbitratorExtraData, type KlerosCourt } from "./klerosCourts";
import type { KlerosConfig } from "./klerosProxy";

/** A Kleros (decentralized ODR) recourse path authored in a clause. */
export interface KlerosRecourse {
    kind: "kleros";
    court: KlerosCourt;
    minJurors: number;
}

/** A traditional (state / ADR) recourse path authored in a clause. */
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

function parseArbitrationKlerosSection(data: Record<string, unknown>): KlerosRecourse | null {
    const klerosCourt = typeof data.klerosCourt === "string" ? data.klerosCourt : "";
    if (!klerosCourt) return null;
    const court = getKlerosCourt(klerosCourt);
    if (!court) return null;
    const raw = data.klerosMinJurors;
    const parsed = typeof raw === "number" ? raw : typeof raw === "string" ? parseInt(raw, 10) : NaN;
    const minJurors = Number.isInteger(parsed) && parsed >= 1 ? parsed : court.defaultMinJurors;
    return { kind: "kleros", court, minJurors };
}

function parseApplicableLawSection(data: Record<string, unknown>): TraditionalRecourse | null {
    const applicableLaw = typeof data.applicableLaw === "string" ? data.applicableLaw : "";
    if (!applicableLaw) return null;
    return {
        kind: "traditional",
        applicableLaw,
        forum: typeof data.forum === "string" && data.forum ? data.forum : undefined,
        language: typeof data.language === "string" && data.language ? data.language : undefined,
    };
}

/**
 * Resolve the recourse forum(s) a process's orders authored — array-aware.
 * Reads every order's arbitration + applicable-law clauses, dedupes, and
 * returns the distinct recourse paths in first-seen order.
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
        const klerosSection = getSection(agreement, ARBITRATION_KLEROS_CLAUSE_KEY);
        if (klerosSection) {
            const recourse = parseArbitrationKlerosSection(klerosSection.data);
            if (recourse) {
                const key = recourseKey(recourse);
                if (!seen.has(key)) {
                    seen.add(key);
                    out.push(recourse);
                }
            }
        }
        const lawSection = getSection(agreement, APPLICABLE_LAW_CLAUSE_KEY);
        if (lawSection) {
            const recourse = parseApplicableLawSection(lawSection.data);
            if (recourse) {
                const key = recourseKey(recourse);
                if (!seen.has(key)) {
                    seen.add(key);
                    out.push(recourse);
                }
            }
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
