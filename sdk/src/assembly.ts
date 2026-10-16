/**
 * @figaro-protocol/sdk — Assembly and agreement identity
 *
 * Two design-time registry families key by content, each a merkle ROOT built
 * with the agreement format's own leaf convention. `AgreementRegistry` keys
 * a registered agreement by `agreementKeyOf(composed)` — the root over one
 * leaf per composed clause (the clause key and the designer's fills), so
 * membership of a clause in a registered agreement is a merkle proof
 * (`buildClauseInclusionProof`). `AssemblyRegistry` keys an assembly by
 * `compositionHash` — the root over its order slots (each a registered
 * agreement key and the order slot's own fills) and its assembly-scoped
 * terms, so membership of an agreement in an assembly is a merkle proof
 * (`buildSlotInclusionProof`).
 * This module is both families' key derivation — pure functions over the
 * documents, no chain access — and the one authoring resolver that turns the
 * clause NAMES a human writes in a source document into the clause keys a
 * published document carries.
 */

import { keccak256, toHex } from "viem";
import type { Hex } from "./types.js";
import { isBytes32Hex } from "./types.js";
import {
    buildLeafInclusionProof,
    buildMerkleRoot,
    canonicalize,
    computeSectionLeaf,
    PROVENANCE_LEAF_KEY,
    sortLeaves,
} from "./agreement.js";
import type { ProjectionSpecView } from "./projection.js";

// ── The registered agreement (the pinned document behind an agreement key) ──

/** A registered agreement's pinned document: the clauses composed for ONE
 *  order slot, value-free, with the designer's fills. The topology clause is
 *  composed with `{}` — who follows whom is the assembly's fact (each order
 *  slot's own `clauses` fill it), so one registered agreement sits in any
 *  order slot of any assembly.
 *  The editorial fields are the designer's own words, pinned in the document
 *  and EXCLUDED from the key, as the assembly's are. */
export interface ComposedAgreement {
    name?: string;
    summary?: string;
    description?: string;
    /** clauseKey → the designer's composed values (`block.design.fills`
     *  only; `{}` for a clause the designer only selects). */
    clauses: Record<Hex, Record<string, unknown>>;
}

/** One composed clause's leaf — the agreement format's leaf convention with
 *  the clause key as the key and the canonical bytes of the designer's fills
 *  as the section data: `keccak256(keccak256(clauseKey ‖ keccak256(fills)))`.
 *  Throws for a reserved format key, which no clause can be. */
function composedClauseLeaf(clauseKey: Hex, fills: Record<string, unknown>): Hex {
    assertNotReservedKey(clauseKey, "composed clause key");
    return computeSectionLeaf({ clause: clauseKey, data: fills });
}

/** Every leaf of a registered agreement's tree, sorted as the tree is built:
 *  one per composed clause. */
export function agreementClauseLeaves(doc: ComposedAgreement): Hex[] {
    const keys = Object.keys(doc.clauses).map((k) => k.toLowerCase());
    const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
    if (dupes.length > 0) {
        throw new Error(`Duplicate clause keys in composed agreement: ${[...new Set(dupes)].join(", ")}`);
    }
    return sortLeaves(Object.entries(doc.clauses).map(([clauseKey, fills]) => composedClauseLeaf(clauseKey as Hex, fills)));
}

/** A registered agreement's key — the merkle root over its composed clause
 *  leaves (`agreementClauseLeaves`), built by the agreement format's own tree
 *  (`buildMerkleRoot`): a one-clause agreement's key is its leaf. This is the
 *  key `AgreementRegistry.registerAgreement` takes. Editorial prose is
 *  excluded, so renaming never forks the key. A reader recomputes it from a
 *  fetched document (`anchorComposedAgreement`); a clause's membership in it
 *  is a proof under it (`buildClauseInclusionProof`). */
export function agreementKeyOf(doc: ComposedAgreement): Hex {
    return buildMerkleRoot(agreementClauseLeaves(doc));
}

/** The membership proof of one composed clause under `agreementKeyOf`: its
 *  leaf, its sorted-pair proof, and `fillsHash` = `keccak256` of the canonical
 *  bytes of the designer's fills for it. Throws for a clause the agreement
 *  does not compose. The clause key is compared case-insensitively. */
export function buildClauseInclusionProof(
    doc: ComposedAgreement,
    clauseKey: Hex,
): { leaf: Hex; proof: Hex[]; fillsHash: Hex } {
    const entry = Object.entries(doc.clauses).find(([k]) => k.toLowerCase() === clauseKey.toLowerCase());
    if (!entry) throw new Error(`clause ${clauseKey} is not composed in this agreement`);
    const [key, fills] = entry;
    const fillsHash = keccak256(toHex(canonicalize(fills)));
    const { leaf, proof } = buildLeafInclusionProof(agreementClauseLeaves(doc), composedClauseLeaf(key as Hex, fills));
    return { leaf, proof, fillsHash };
}

// ── The template document (the pinned assembly, hydrated off-chain) ──────────

/** One order slot of an assembly: the registered agreement it binds and the
 *  order slot's own fills over it. */
export interface TemplateSlot {
    /** Local label for the order slot — `order-<index>`, stable within the
     *  template; the reference target the topology clause's
     *  `parentOrderHashes` names. NOT a chain id, and NOT a party — the
     *  template is party-agnostic. */
    id: string;
    /** The registered agreement this order slot binds (`AgreementRegistry`
     *  key). */
    agreementKey: Hex;
    /** The order slot's own fills, clauseKey → values, merged over the
     *  registered agreement's `clauses` at checkout (the order slot's fill
     *  wins for the keys it names): the topology clause's
     *  `{ parentOrderHashes: ["order-<j>", …] }` (empty on the root). */
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
     *  their own agreement. Sparse: absent when none composed; when present,
     *  one leaf of the composition tree (`ASSEMBLY_TERMS_LEAF_KEY`). */
    assemblyClauses?: Record<Hex, Record<string, unknown>>;
    /** The composition: one order slot per future FigaroCore order, in
     *  template order — each a registered agreement and its own fills. */
    agreements: TemplateSlot[];
}

/** An assembly template with every order slot's registered agreement
 *  beside it, keyed by lowercased `agreementKey` — what checkout plans from.
 *  Each document is read from the agreement registry's binding and verified
 *  against its key (`anchorComposedAgreement`) before it lands here. */
export interface HydratedAssembly {
    template: AssemblyTemplate;
    agreements: Record<Hex, ComposedAgreement>;
}

/** The registered agreement an order slot binds. Throws when the hydrated
 *  map does not carry it — a checkout never plans an order slot it cannot
 *  read. */
export function slotAgreement(hydrated: HydratedAssembly, slot: TemplateSlot): ComposedAgreement {
    const doc = hydrated.agreements[slot.agreementKey.toLowerCase() as Hex]
        ?? hydrated.agreements[slot.agreementKey];
    if (!doc) {
        throw new Error(`order slot ${slot.id} binds agreement ${slot.agreementKey}, which is not hydrated`);
    }
    return doc;
}

/** The clauses an order slot instantiates: the registered agreement's
 *  `clauses` with the order slot's own fills merged over them (per clause,
 *  the order slot's values win for the fields it names). An order slot
 *  fills clauses its agreement composes and never adds one: a fill naming a
 *  clause the registered agreement does not carry throws. */
export function slotClauses(hydrated: HydratedAssembly, slot: TemplateSlot): Record<Hex, Record<string, unknown>> {
    const composed = slotAgreement(hydrated, slot).clauses;
    const out: Record<Hex, Record<string, unknown>> = { ...composed };
    const carried = new Map((Object.keys(composed) as Hex[]).map((k) => [k.toLowerCase(), k]));
    for (const [clauseKey, values] of Object.entries(slot.clauses ?? {}) as [Hex, Record<string, unknown>][]) {
        const key = carried.get(clauseKey.toLowerCase());
        if (!key) {
            throw new Error(`order slot ${slot.id} fills clause ${clauseKey}, which its agreement ${slot.agreementKey} does not compose`);
        }
        out[key] = { ...out[key], ...values };
    }
    return out;
}

/** An order slot's parent ids — the data of its topology fill. The entry is
 *  found by its DATA KEY (`parentOrderHashes` — named for what the committed
 *  clause holds at runtime: the parent orders' FigaroCore order hashes; at
 *  design time the values are sibling `order-<i>` labels), so reading needs
 *  no spec cache and tolerates any registry-defined topology clause. */
export function templateParentOrderHashes(slot: Pick<TemplateSlot, "clauses">): string[] {
    const entry = Object.values(slot.clauses ?? {}).find(
        (fields) => Array.isArray((fields as { parentOrderHashes?: unknown } | undefined)?.parentOrderHashes),
    );
    const ids = (entry as { parentOrderHashes?: unknown } | undefined)?.parentOrderHashes;
    return Array.isArray(ids) ? ids.filter((p): p is string => typeof p === "string") : [];
}

/** Every clause a hydrated assembly composes — the assembly-scoped sections
 *  plus each order slot's — as one sorted, de-duplicated key list: each of these must be live on `ClauseRegistry` for the design to
 *  check out. */
export function templateComposedClauseKeys(
    template: AssemblyTemplate,
    agreements: Readonly<Record<Hex, ComposedAgreement>>,
): Hex[] {
    const hydrated: HydratedAssembly = { template, agreements: agreements as Record<Hex, ComposedAgreement> };
    const keys = new Set<Hex>(Object.keys(template.assemblyClauses ?? {}) as Hex[]);
    for (const slot of template.agreements) {
        for (const clauseKey of Object.keys(slotClauses(hydrated, slot)) as Hex[]) keys.add(clauseKey);
    }
    return Array.from(keys).sort();
}

// ── The composition tree ────────────────────────────────────────────────────

/** The label the assembly-terms leaf's key is the hash of — a bare string no
 *  spec or agreement document serializes to. */
export const ASSEMBLY_TERMS_LEAF_LABEL = "figaro-assembly-terms";

/** The reserved key of the composition tree's assembly-terms leaf, whose
 *  bytes are the canonical JSON of `assemblyClauses`. */
export const ASSEMBLY_TERMS_LEAF_KEY: Hex = keccak256(toHex(ASSEMBLY_TERMS_LEAF_LABEL));

/** An order slot leaf's committed bytes — canonical JSON
 *  `{"clauses":{…},"slot":i}` of the order slot's own fills (object keys
 *  sorted, arrays in authored order). `i` is the order slot's 0-based
 *  position in the template. */
export function slotSectionBytes(slot: Pick<TemplateSlot, "clauses">, i: number): Hex {
    if (!Number.isSafeInteger(i) || i < 0) throw new Error(`slot index is not a non-negative integer: ${i}`);
    return toHex(new TextEncoder().encode(canonicalize({ clauses: slot.clauses ?? {}, slot: i })));
}

/** The two format keys an agreement key may never be: the provenance leaf's
 *  and the assembly-terms leaf's. Throws for either. */
export function assertNotReservedKey(agreementKey: Hex, where = "agreementKey"): void {
    const k = agreementKey.toLowerCase();
    if (k === PROVENANCE_LEAF_KEY.toLowerCase() || k === ASSEMBLY_TERMS_LEAF_KEY.toLowerCase()) {
        throw new Error(`${where} ${agreementKey} is a reserved format key, never a registered agreement`);
    }
}

/** An order slot's leaf — the agreement leaf convention with the order
 *  slot's `agreementKey` as the key and `keccak256(slotSectionBytes)` as the
 *  section hash. Throws for a reserved key. */
function slotLeaf(slot: TemplateSlot, i: number): Hex {
    assertNotReservedKey(slot.agreementKey, `order slot ${i} agreementKey`);
    return computeSectionLeaf({ clause: slot.agreementKey, dataHash: keccak256(slotSectionBytes(slot, i)) });
}

/** Every leaf of the composition tree, sorted as the tree is built: one per
 *  order slot, plus the assembly-terms leaf when any assembly-scoped clause is
 *  composed. */
export function templateLeaves(template: AssemblyTemplate): Hex[] {
    const leaves = template.agreements.map((slot, i) => slotLeaf(slot, i));
    const terms = template.assemblyClauses;
    if (terms && Object.keys(terms).length > 0) {
        leaves.push(computeSectionLeaf({ clause: ASSEMBLY_TERMS_LEAF_KEY, data: terms }));
    }
    return sortLeaves(leaves);
}

/** The assembly's identity — the merkle root over its order slot leaves and its
 *  assembly-terms leaf (`templateLeaves`), built by the agreement format's
 *  own tree (`buildMerkleRoot`): a one-leaf tree's root is its leaf.
 *  Editorial prose is excluded, so renaming never forks identity. This is
 *  the hash `AssemblyRegistry` keys bindings on. Publishers anchor it;
 *  readers recompute it from a fetched document to verify integrity. */
export function templateCompositionHash(
    template: AssemblyTemplate,
): Hex {
    return buildMerkleRoot(templateLeaves(template));
}

/** The membership proof of order slot `i` under `templateCompositionHash`:
 *  its leaf, its sorted-pair proof, and `slotContentHash` =
 *  `keccak256(slotSectionBytes(slot, i))` — what
 *  `UsageCounter.recordAssemblyUsage` and the batch path's assembly claim
 *  take beside the order slot's agreement key. Throws for an index outside
 *  the template. */
export function buildSlotInclusionProof(
    template: AssemblyTemplate,
    i: number,
): { leaf: Hex; proof: Hex[]; slotContentHash: Hex } {
    const slot = template.agreements[i];
    if (!slot) throw new Error(`order slot ${i} is not in the template (${template.agreements.length} order slots)`);
    const slotContentHash = keccak256(slotSectionBytes(slot, i));
    const { leaf, proof } = buildLeafInclusionProof(templateLeaves(template), slotLeaf(slot, i));
    return { leaf, proof, slotContentHash };
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
