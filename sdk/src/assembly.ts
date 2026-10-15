/**
 * @figaro-protocol/sdk — Assembly identity
 *
 * The AssemblyRegistry keys bindings by `compositionHash`, as the
 * ClauseRegistry keys clauses by the hash of the pinned spec
 * (`computeClauseKey`). This module is that family's key derivation — pure
 * functions over the template document, no chain access — and the one
 * authoring resolver that turns the clause NAMES a human writes in a source
 * document into the clause keys a published document carries.
 */

import type { Hex } from "./types.js";
import { isBytes32Hex } from "./types.js";
import { canonicalContentHash } from "./agreement.js";
import type { ProjectionSpecView } from "./projection.js";

// ── The template document (the pinned assembly, hydrated off-chain) ──────────

export interface TemplateAgreement {
    /** Local label for the order slot this agreement binds to at
     *  checkout — `order-<index>`, stable within the template; the reference
     *  target the topology clause points at. NOT a chain id, and NOT a
     *  party — the template is party-agnostic. */
    id: string;
    /** clauseKey → the designer's composed clause map. Design time is
     *  STRUCTURAL: a clause with no designer fills carries
     *  `{}` — the selection only; its fields are transaction particulars
     *  filled at checkout. Exactly two kinds of values exist here: the
     *  mandatory topology clause's `{ parentOrderHashes }` (root = [] — the
     *  DAG, the design itself) and clauses declaring `block.design.fills`
     *  (the designer's tailoring — a pinned consent document, a pinned
     *  denomination) whose values are the designer's fills.
     *  `buildAssemblyTemplate` (exported from the root `@figaro-protocol/sdk`; defined
     *  in `projection.ts`, not here) enforces this by construction. */
    clauses: Record<Hex, Record<string, unknown>>;
}

/** One question a designer answers about their assembly, in plain words. */
export interface AssemblyFaqEntry {
    question: string;
    answer: string;
}

export interface AssemblyTemplate {
    /** EDITORIAL — the designer's own words, for legibility (the content-derived
     *  slug is opaque at scale). Free-form prose, NOT a taxonomy. Pinned in the
     *  document but EXCLUDED from the composition hash — identity stays
     *  composition-derived, so renaming never forks the slug. All optional. */
    name?: string;
    summary?: string;
    description?: string;
    /** EDITORIAL — the questions a party to THIS assembly asks and the
     *  designer's answers: where orders come from, what a party needs in hand,
     *  how and when each side is paid under this design. Rendered wherever the
     *  assembly is offered to a user; the users' FAQ surfaces every published
     *  assembly's entries from the registry at runtime. Excluded from the
     *  composition hash like the rest of the editorial prose. */
    faq?: readonly AssemblyFaqEntry[];
    /** ASSEMBLY-SCOPED clause sections — clauses declaring
     *  `design.scope: "assembly"`, composed ONCE for the whole design
     *  (clauseKey → the designer's values, `design.fills` only — same
     *  value-free rule as agreements). At checkout every one of these folds
     *  into EVERY agreement, so every party signs the assembly-wide term in
     *  their own agreement. Sparse: absent when none composed (the hash of an
     *  assembly without them is unchanged). */
    assemblyClauses?: Record<Hex, Record<string, unknown>>;
    /** The composition: the agreements the designer composed, one per future
     *  FigaroCore order. */
    agreements: TemplateAgreement[];
}

/** Read a template agreement's parent ids — the data of its topology clause.
 *  The topology is a clause like any other; this is the one accessor for it.
 *  The entry is found by its DATA KEY (`parentOrderHashes` — named for what
 *  the committed clause holds at runtime: the parent orders' FigaroCore order
 *  hashes; at design time the values are sibling `order-<i>` labels), so
 *  reading needs no spec cache and tolerates any registry-defined topology
 *  clause. */
export function templateParentOrderHashes(agreement: TemplateAgreement): string[] {
    const entry = Object.values(agreement.clauses).find(
        (fields) => Array.isArray((fields as { parentOrderHashes?: unknown } | undefined)?.parentOrderHashes),
    );
    const ids = (entry as { parentOrderHashes?: unknown } | undefined)?.parentOrderHashes;
    return Array.isArray(ids) ? ids.filter((p): p is string => typeof p === "string") : [];
}

/** Every clause a template composes — the assembly-scoped sections plus each
 *  agreement's own — as one sorted, de-duplicated key list. The registration
 *  prerequisite of an assembly: `AssemblyRegistry` anchors a composition, so
 *  each of these must be live on `ClauseRegistry` before the anchor resolves. */
export function templateComposedClauseKeys(template: AssemblyTemplate): Hex[] {
    const keys = new Set<Hex>(Object.keys(template.assemblyClauses ?? {}) as Hex[]);
    for (const agreement of template.agreements) {
        for (const clauseKey of Object.keys(agreement.clauses) as Hex[]) keys.add(clauseKey);
    }
    return Array.from(keys).sort();
}

/** The assembly's identity — keccak256 of the canonical COMPOSITION subset of
 *  the template (the composed agreements: their clauses, values, and topology;
 *  editorial prose excluded, so renaming never forks identity). This is the
 *  hash `AssemblyRegistry` keys bindings on. Publishers anchor it; readers
 *  recompute it from a fetched document to verify integrity. */
export function templateCompositionHash(
    template: Pick<AssemblyTemplate, "agreements" | "assemblyClauses">,
): Hex {
    // Assembly-scoped sections are IDENTITY-BEARING (a differently-termed
    // assembly is a different assembly) — included in the hash whenever
    // composed; omitted entirely when none.
    const assemblyClauses = template.assemblyClauses;
    const hasAssemblyClauses = assemblyClauses && Object.keys(assemblyClauses).length > 0;
    return canonicalContentHash({
        agreements: template.agreements,
        ...(hasAssemblyClauses && { assemblyClauses }),
    });
}

/** The published slug — presentation only, a deterministic pure function of
 *  the composition hash. Identical compositions → identical slug; distinct
 *  compositions → distinct slug. The slug exists nowhere on-chain: the
 *  registry keys bindings by `compositionHash`, and every reader derives the
 *  slug from the event's hash. */
export function deriveAssemblySlug(compositionHash: Hex): string {
    return `asm-${compositionHash.slice(2, 18)}`;
}

// ── Authoring: clause names → clause keys ───────────────────────────────────

/** The specs an authored document's names resolve against — the specs the
 *  caller loaded (seeding reads them from `clauses/`), each with its key. */
export interface AuthoredSpecSet {
    list(): readonly Pick<ProjectionSpecView, "clauseKey" | "clauseId" | "version">[];
}

/**
 * Resolve the clause NAMES in an authored source document to clause KEYS.
 *
 * A human authors `assemblies/*.json` templates and `members/*.json`
 * documents by clause name; a published document carries keys. Each name is
 * matched against the loaded specs' own `clauseId` — written `name@version`,
 * the spec's `version` must match too. A name two loaded specs share, written
 * without `@version`, is refused (the document must say which), as is a name
 * no loaded spec carries. A value that is already a 32-byte key passes
 * through. This is a LOCAL authoring read over the caller's spec set, never a
 * chain read by name: on chain a clause is only its key.
 *
 * Rewritten in a template: every `agreements[].clauses` and `assemblyClauses`
 * key. In a member profile: `disclosurePolicy[].clauseId` and
 * `assemblyBindings[].counterpartyBindings[].clauseId` (each becomes
 * `clauseKey`), and the `profileClauseValues` keys. In a catalog: every
 * `items[].clauseValues` key and `items[].dataSold.clauseId` (→ `clauseKey`).
 * Everything else is copied unchanged. The input is not mutated.
 */
export function resolveAuthoredClauseKeys<T extends object>(doc: T, specs: AuthoredSpecSet): T {
    const loaded = specs.list();
    const resolve = (authored: string, where: string): Hex => {
        if (isBytes32Hex(authored)) return authored.toLowerCase() as Hex;
        const at = authored.lastIndexOf("@");
        const name = at > 0 ? authored.slice(0, at) : authored;
        const versionText = at > 0 ? authored.slice(at + 1) : undefined;
        if (versionText !== undefined && !/^[1-9]\d*$/.test(versionText)) {
            throw new Error(`${where}: "${authored}" — the version after "@" must be a positive integer`);
        }
        const version = versionText === undefined ? undefined : Number(versionText);
        const matches = loaded.filter((spec) =>
            spec.clauseId === name && (version === undefined || spec.version === version));
        if (matches.length === 0) {
            throw new Error(`${where}: no loaded clause spec is named "${authored}"`);
        }
        if (matches.length > 1) {
            const which = matches.map((m) => `${m.clauseId}@${m.version} (${m.clauseKey})`).join(", ");
            throw new Error(`${where}: "${authored}" names ${matches.length} loaded clause specs — write name@version to say which: ${which}`);
        }
        return matches[0].clauseKey.toLowerCase() as Hex;
    };
    const rekey = (map: unknown, where: string): unknown => {
        if (!isPlainRecord(map)) return map;
        const out: Record<string, unknown> = {};
        for (const [authored, value] of Object.entries(map)) {
            const key = resolve(authored, where);
            if (key in out) throw new Error(`${where}: two entries resolve to clause ${key}`);
            out[key] = value;
        }
        return out;
    };
    const renameClauseId = (entry: unknown, where: string): unknown => {
        if (!isPlainRecord(entry) || typeof entry.clauseId !== "string") return entry;
        const { clauseId, ...rest } = entry;
        return { ...rest, clauseKey: resolve(clauseId, where) };
    };
    const mapArray = (value: unknown, fn: (entry: unknown, i: number) => unknown): unknown =>
        Array.isArray(value) ? value.map(fn) : value;

    if (!isPlainRecord(doc)) return doc;
    const src = doc as Record<string, unknown>;
    if ("clauseVersions" in src || "assemblyClauseVersions" in src) {
        throw new Error("the document carries a version map — write a clause as name@version instead");
    }
    const out: Record<string, unknown> = { ...src };
    if ("agreements" in src) {
        out.agreements = mapArray(src.agreements, (agreement, i) => {
            if (!isPlainRecord(agreement)) return agreement;
            if ("clauseVersions" in agreement) {
                throw new Error(`agreements[${i}] carries a version map — write a clause as name@version instead`);
            }
            return { ...agreement, clauses: rekey(agreement.clauses, `agreements[${i}].clauses`) };
        });
    }
    if ("assemblyClauses" in src) out.assemblyClauses = rekey(src.assemblyClauses, "assemblyClauses");
    if ("profileClauseValues" in src) out.profileClauseValues = rekey(src.profileClauseValues, "profileClauseValues");
    if ("disclosurePolicy" in src) {
        out.disclosurePolicy = mapArray(src.disclosurePolicy, (e, i) => renameClauseId(e, `disclosurePolicy[${i}]`));
    }
    if ("assemblyBindings" in src) {
        out.assemblyBindings = mapArray(src.assemblyBindings, (binding, i) => {
            if (!isPlainRecord(binding)) return binding;
            return {
                ...binding,
                ...("counterpartyBindings" in binding && {
                    counterpartyBindings: mapArray(binding.counterpartyBindings, (e, j) =>
                        renameClauseId(e, `assemblyBindings[${i}].counterpartyBindings[${j}]`)),
                }),
            };
        });
    }
    if ("items" in src) {
        out.items = mapArray(src.items, (item, i) => {
            if (!isPlainRecord(item)) return item;
            return {
                ...item,
                ...("clauseValues" in item && { clauseValues: rekey(item.clauseValues, `items[${i}].clauseValues`) }),
                ...("dataSold" in item && { dataSold: renameClauseId(item.dataSold, `items[${i}].dataSold`) }),
            };
        });
    }
    return out as T;
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
