/**
 * Whether the parties' attestations under one stage agree — derived at read
 * time from the process's attestation log and the published content behind
 * each fingerprint, never stored.
 *
 * Clause-agnostic: the caller decides which (clause, stage) pairs take part
 * (on the process view, a declared witness stage of an assembly-scoped clause,
 * read from the clause's own spec), and the comparison runs over the stage's
 * declared fields alone. No clause is named here.
 *
 * The reader's rule: one filing per attester per order — the latest a party
 * filed on that order (a repeatable stage's last word is the party's word on
 * it) — and every such filing across the process's orders is compared. The
 * stage agrees only when every filing agrees with every other; a party that
 * filed differently on two orders makes the stage differ.
 *
 * Per declared field: an array compares as the SET of its items' canonical
 * JSON (order and repeats carry no meaning); every other value by equality of
 * its canonical JSON. A value the spec declares as hex (`format` `bytes32-hex`
 * or `address-hex`, at any depth) compares case-insensitively, since hex case
 * carries no meaning there; any other string compares as written. A field no
 * filing filled agrees.
 */
import type { FieldSpec } from "@figaro-protocol/sdk/clauses";
import { canonicalize } from "@figaro-protocol/sdk";
import type { RuntimeAttestation } from "@/lib/composition/indexer";

/** The attestations one (clause, stage) received across the process's orders:
 *  the latest filing per attester per order, in block order. */
export interface StageAttestationGroup {
    clauseKey: string;
    stage: number;
    filings: RuntimeAttestation[];
}

/** Group a process's attestations by (clause, stage), keeping the latest
 *  filing per (attester, order). Only the pairs `includes` admits are grouped. */
export function groupAttestationsByStage(
    attestations: readonly RuntimeAttestation[],
    includes: (clauseKey: string, stage: number) => boolean,
): StageAttestationGroup[] {
    const groups = new Map<string, { clauseKey: string; stage: number; byFiler: Map<string, RuntimeAttestation> }>();
    for (const att of attestations) {
        if (!includes(att.clauseId, att.stage)) continue;
        const key = `${att.clauseId.toLowerCase()}:${att.stage}`;
        let group = groups.get(key);
        if (!group) {
            group = { clauseKey: att.clauseId, stage: att.stage, byFiler: new Map() };
            groups.set(key, group);
        }
        const filer = `${att.attester.toLowerCase()}:${att.orderHash.toLowerCase()}`;
        const prior = group.byFiler.get(filer);
        if (!prior || att.blockNumber >= prior.blockNumber) group.byFiler.set(filer, att);
    }
    return Array.from(groups.values(), ({ clauseKey, stage, byFiler }) => ({
        clauseKey,
        stage,
        filings: Array.from(byFiler.values()).sort((a, b) => a.blockNumber - b.blockNumber),
    }));
}

/** The comparison's outcome for one stage. `differ` names the declared fields
 *  on which at least two filings part. */
export type StageComparison =
    | { kind: "one-party" }
    | { kind: "unavailable" }
    | { kind: "agree" }
    | { kind: "differ"; fields: string[] };

/** One filing to compare: who filed it, and its decoded content (`null` when
 *  the content could not be read — sealed, unpinned, erased). */
export interface StageFilingContent {
    attester: string;
    content: Record<string, unknown> | null;
}

const HEX_FORMATS: ReadonlySet<string> = new Set(["bytes32-hex", "address-hex"]);

/** A JSON-able value, normalized by its declared field: bigints as decimal
 *  strings, a declared-hex string lowercased, any other string as written. */
function normalize(field: FieldSpec | undefined, value: unknown): unknown {
    if (value === undefined || value === null || value === "") return null;
    if (typeof value === "bigint") return value.toString();
    if (typeof value === "string") {
        return field?.type === "string" && field.format !== undefined && HEX_FORMATS.has(field.format)
            ? value.toLowerCase()
            : value;
    }
    if (Array.isArray(value)) return value.map((item) => normalize(field?.type === "array" ? field.items : undefined, item));
    if (typeof value === "object") {
        const children = field?.type === "object" ? field.fields : [];
        return Object.fromEntries(Object.entries(value as Record<string, unknown>)
            .map(([k, v]) => [k, normalize(children.find((c) => c.name === k), v)]));
    }
    return value;
}

/** The comparable form of one field's value, by the field's declared type. */
function comparable(field: FieldSpec, value: unknown): string {
    if (field.type === "array") {
        const items = Array.isArray(value) ? value : [];
        return canonicalize(Array.from(new Set(items.map((item) => canonicalize(normalize(field.items, item))))).sort());
    }
    return canonicalize(normalize(field, value));
}

/** Compare every filing of one stage over its declared fields. Fewer than two
 *  distinct parties is "one party only"; with any unreadable content nothing
 *  is compared. */
export function compareStageContent(
    fields: readonly FieldSpec[],
    filings: readonly StageFilingContent[],
): StageComparison {
    if (new Set(filings.map((f) => f.attester.toLowerCase())).size < 2) return { kind: "one-party" };
    if (filings.some((f) => f.content === null)) return { kind: "unavailable" };
    const read = filings.map((f) => f.content as Record<string, unknown>);
    const differing = fields
        .filter((field) => new Set(read.map((c) => comparable(field, c[field.name]))).size > 1)
        .map((field) => field.name);
    return differing.length === 0 ? { kind: "agree" } : { kind: "differ", fields: differing };
}
