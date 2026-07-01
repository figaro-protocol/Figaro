/**
 * Process-jurisdiction recourse resolution.
 *
 * Layer 3 of the three-layer dispute model (see the on-chain-evidence paper) is the only
 * *configured* layer: Layers 1 (bonding) and 2 (peer coordination) are
 * kernel mechanisms, always on. Layer 3 is the off-chain forum, and the
 * parties' agreement NAMES it — the arbitration and applicable-law clauses
 * the assembly designer authored into the order(s), found by their declared
 * FIELDS (`klerosCourt`, `applicableLaw`), never by clause name.
 *
 * This module reads those clauses off a process's committed orders and
 * resolves the recourse option(s) the runtime dispute surface presents.
 * The dispute module is surfaced FROM the assembly — never from a global
 * default. A designer may author more than one dispute-resolution clause
 * across a design, so resolution is array-aware: it returns every distinct
 * recourse path the process's orders carry.
 */
import type { Order } from "@/lib/core/store";
import type { Agreement } from "@figaro/core";
import { sectionByField } from "@/lib/core/agreementSections";
import { clauseFieldSpec, labelEnumValue } from "@/lib/shared/clauseSpecSource";

/** The shape of a resolved agreement section — its clauseId + committed data. */
type ClauseSection = { clause: string; data?: Record<string, unknown> };

/** A Kleros (decentralized ODR) recourse path authored in a clause. The court
 *  key + its human label come from the clause spec (the arbitration clause's
 *  `klerosCourt` enum + `valueLabels`), never a forked local catalog. */
interface KlerosRecourse {
    kind: "kleros";
    courtKey: string;
    courtLabel: string;
    minJurors: number;
}

/** A traditional (state / ADR) recourse path authored in a clause. */
interface TraditionalRecourse {
    kind: "traditional";
    applicableLaw: string;
    forum?: string;
    language?: string;
}

export type JurisdictionRecourse = KlerosRecourse | TraditionalRecourse;

/** Stable identity for a recourse — dedupes identical clauses across orders. */
function recourseKey(r: JurisdictionRecourse): string {
    return r.kind === "kleros"
        ? `kleros:${r.courtKey}:${r.minJurors}`
        : `traditional:${r.applicableLaw}:${r.forum ?? ""}:${r.language ?? ""}`;
}

function parseArbitrationKlerosSection(section: ClauseSection): KlerosRecourse | null {
    const data = section.data ?? {};
    const courtKey = typeof data.klerosCourt === "string" ? data.klerosCourt : "";
    if (!courtKey) return null;
    // Display label: the arbitration clause's own `klerosCourt` valueLabels are
    // the SSoT (unknown value → raw key, open-world). The clause is found by
    // field, so its clauseId is read off the section, never hardcoded.
    const courtField = clauseFieldSpec(section.clause, "klerosCourt");
    const courtLabel = labelEnumValue(courtField?.type === "enum" ? courtField : null, courtKey);
    // Min-juror default: the clause's `klerosMinJurors.default` (Kleros default 3).
    const raw = data.klerosMinJurors;
    const parsed = typeof raw === "number" ? raw : typeof raw === "string" ? parseInt(raw, 10) : NaN;
    const minField = clauseFieldSpec(section.clause, "klerosMinJurors");
    const defaultMin = typeof minField?.default === "number" ? minField.default : 3;
    const minJurors = Number.isInteger(parsed) && parsed >= 1 ? parsed : defaultMin;
    return { kind: "kleros", courtKey, courtLabel, minJurors };
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
        const klerosSection = sectionByField(agreement, "klerosCourt");
        if (klerosSection) {
            const recourse = parseArbitrationKlerosSection(klerosSection);
            if (recourse) {
                const key = recourseKey(recourse);
                if (!seen.has(key)) {
                    seen.add(key);
                    out.push(recourse);
                }
            }
        }
        const lawSection = sectionByField(agreement, "applicableLaw");
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
