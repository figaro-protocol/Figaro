/**
 * @figaro-protocol/sdk — Assembly and agreement identity
 *
 * Two design-time registry families key by content, each a merkle ROOT built
 * with the agreement format's own leaf convention. `AgreementRegistry` keys
 * a registered agreement by `agreementHashOf(composed)` — the root over one
 * leaf per composed clause (the clause key and the designer's fills), so
 * membership of a clause in a registered agreement is a merkle proof
 * (`buildRegisteredClauseInclusionProof`). `AssemblyRegistry` keys an assembly by
 * `assemblyHash` — the root over its agreements (each a registered
 * agreement hash and the agreement's own fills) and its assembly-scoped
 * terms, so membership of an agreement in an assembly is a merkle proof
 * (`buildAgreementInclusionProof`).
 * This module is both families' key derivation — pure functions over the
 * documents, no chain access — and the one authoring resolver that turns the
 * clause NAMES a human writes in a source document into the clause keys a
 * published document carries.
 */

import { keccak256, toHex, concat } from "viem";
import type { Hex } from "./types.js";
import { isBytes32Hex } from "./types.js";
import {
    buildLeafInclusionProof,
    buildMerkleRoot,
    canonicalize,
    computeClauseLeaf,
    PROVENANCE_LEAF_KEY,
    sortLeaves,
    hashClauseData,
} from "./agreement.js";
import type { ProjectionSpecView } from "./projection.js";

// ── The registered agreement (the pinned document behind an agreement hash) ──

/** A registered agreement's pinned document: the clauses composed for ONE
 *  agreement, value-free, with the designer's fills. The topology clause is
 *  composed with `{}` — who follows whom is the assembly's fact (each agreement
 *  own own `clauses` fill it), so one registered agreement sits in any
 *  agreement of any assembly.
 *  The editorial fields are the designer's own words, pinned in the document
 *  and EXCLUDED from the key, as the assembly's are. */
export interface RegisteredAgreement {
    name?: string;
    summary?: string;
    description?: string;
    /** clauseKey → the designer's composed values (`block.design.fills`
     *  only; `{}` for a clause the designer only selects). */
    clauses: Record<Hex, Record<string, unknown>>;
}

/** One composed clause's leaf — the agreement format's leaf convention with
 *  the clause key as the key and the canonical bytes of the designer's fills
 *  as the clause data: `keccak256(keccak256(clauseKey ‖ keccak256(fills)))`.
 *  Throws for a reserved format key, which no clause can be. */
function composedClauseLeaf(clauseKey: Hex, fills: Record<string, unknown>): Hex {
    assertNotReservedKey(clauseKey, "composed clause key");
    return computeClauseLeaf({ clause: clauseKey, data: fills });
}

/** Every leaf of a registered agreement's tree, sorted as the tree is built:
 *  one per composed clause. */
export function agreementClauseLeaves(doc: RegisteredAgreement): Hex[] {
    const keys = Object.keys(doc.clauses).map((k) => k.toLowerCase());
    const dupes = keys.filter((k, i) => keys.indexOf(k) !== i);
    if (dupes.length > 0) {
        throw new Error(`Duplicate clause keys in agreement: ${[...new Set(dupes)].join(", ")}`);
    }
    return sortLeaves(Object.entries(doc.clauses).map(([clauseKey, fills]) => composedClauseLeaf(clauseKey as Hex, fills)));
}

/** A registered agreement's hash — the merkle root over its composed clause
 *  leaves (`agreementClauseLeaves`), built by the agreement format's own tree
 *  (`buildMerkleRoot`): a one-clause agreement's hash is its leaf. This is the
 *  key `AgreementRegistry.registerAgreement` takes. Editorial prose is
 *  excluded, so renaming never forks the key. A reader recomputes it from a
 *  fetched document (`anchorRegisteredAgreement`); a clause's membership in it
 *  is a proof under it (`buildRegisteredClauseInclusionProof`). */
export function agreementHashOf(doc: RegisteredAgreement): Hex {
    return buildMerkleRoot(agreementClauseLeaves(doc));
}

/** The membership proof of one composed clause under `agreementHashOf`: its
 *  leaf, its sorted-pair proof, and `fillsHash` = `keccak256` of the canonical
 *  bytes of the designer's fills for it. Throws for a clause the agreement
 *  does not compose. The clause key is compared case-insensitively. */
export function buildRegisteredClauseInclusionProof(
    doc: RegisteredAgreement,
    clauseKey: Hex,
): { leaf: Hex; proof: Hex[]; fillsHash: Hex } {
    const entry = Object.entries(doc.clauses).find(([k]) => k.toLowerCase() === clauseKey.toLowerCase());
    if (!entry) throw new Error(`clause ${clauseKey} is not composed in this agreement`);
    const [key, fills] = entry;
    const fillsHash = keccak256(toHex(canonicalize(fills)));
    const { leaf, proof } = buildLeafInclusionProof(agreementClauseLeaves(doc), composedClauseLeaf(key as Hex, fills));
    return { leaf, proof, fillsHash };
}

// ── The assembly document (the pinned assembly, hydrated off-chain) ──────────

/** One agreement of an assembly: the registered agreement it binds and the
 *  agreement's own fills over it. */
export interface AssemblyAgreement {
    /** Local label for the agreement — `agreement-<index>`, stable within the
     *  assembly; the reference target the topology clause's
     *  `follows` names. NOT a chain id, and NOT a party — the
     *  assembly is party-agnostic. */
    id: string;
    /** The registered agreement this agreement binds (`AgreementRegistry`
     *  key). */
    agreementHash: Hex;
    /** The agreement's own fills, clauseKey → values, merged over the
     *  registered agreement's `clauses` at checkout (the agreement's fill
     *  wins for the keys it names): the topology clause's
     *  `{ follows: ["agreement-<j>", …] }` (empty on the root). */
    clauses: Record<Hex, Record<string, unknown>>;
}

/** One question a designer answers about their assembly, in plain words. */
export interface AssemblyFaqEntry {
    question: string;
    answer: string;
}

export interface Assembly {
    /** EDITORIAL — the designer's own words, for legibility (the content-derived
     *  slug is opaque at scale). Free-form prose, NOT a taxonomy. Pinned in the
     *  document but EXCLUDED from the assembly hash — identity stays
     *  composition-derived, so renaming never forks the slug. All optional. */
    name?: string;
    summary?: string;
    description?: string;
    /** EDITORIAL — the questions a party to THIS assembly asks and the
     *  designer's answers: where orders come from, what a party needs in hand,
     *  how and when each side is paid under this design. Rendered wherever the
     *  assembly is offered to a user; the users' FAQ surfaces every published
     *  assembly's entries from the registry at runtime. Excluded from the
     *  assembly hash like the rest of the editorial prose. */
    faq?: readonly AssemblyFaqEntry[];
    /** ASSEMBLY-SCOPED clauses — clauses declaring
     *  `design.scope: "assembly"`, composed ONCE for the whole design
     *  (clauseKey → the designer's values, `design.fills` only — same
     *  value-free rule as agreements). At checkout every one of these folds
     *  into EVERY agreement, so every party signs the assembly-wide term in
     *  their own agreement. Sparse: absent when none composed; when present,
     *  one leaf of the composition tree (`ASSEMBLY_TERMS_LEAF_KEY`). */
    assemblyClauses?: Record<Hex, Record<string, unknown>>;
    /** The composition: one agreement per future FigaroCore order, in
     *  assembly order — each a registered agreement and its own fills. */
    agreements: AssemblyAgreement[];
}

/** An assembly with every agreement's registered agreement
 *  beside it, keyed by lowercased `agreementHash` — what checkout plans from.
 *  Each document is read from the agreement registry's binding and verified
 *  against its key (`anchorRegisteredAgreement`) before it lands here. */
export interface HydratedAssembly {
    assembly: Assembly;
    agreements: Record<Hex, RegisteredAgreement>;
}

/** The registered agreement an agreement binds. Throws when the hydrated
 *  map does not carry it — a checkout never plans an agreement it cannot
 *  read. */
export function boundAgreement(hydrated: HydratedAssembly, entry: AssemblyAgreement): RegisteredAgreement {
    const doc = hydrated.agreements[entry.agreementHash.toLowerCase() as Hex]
        ?? hydrated.agreements[entry.agreementHash];
    if (!doc) {
        throw new Error(`agreement ${entry.id} binds agreement ${entry.agreementHash}, which is not hydrated`);
    }
    return doc;
}

/** The clauses an agreement instantiates: the registered agreement's
 *  `clauses` with the agreement's own fills merged over them (per clause,
 *  the agreement's values win for the fields it names). An agreement
 *  fills clauses its agreement composes and never adds one: a fill naming a
 *  clause the registered agreement does not carry throws. */
export function agreementClauses(hydrated: HydratedAssembly, entry: AssemblyAgreement): Record<Hex, Record<string, unknown>> {
    const composed = boundAgreement(hydrated, entry).clauses;
    const out: Record<Hex, Record<string, unknown>> = { ...composed };
    const carried = new Map((Object.keys(composed) as Hex[]).map((k) => [k.toLowerCase(), k]));
    for (const [clauseKey, values] of Object.entries(entry.clauses ?? {}) as [Hex, Record<string, unknown>][]) {
        const key = carried.get(clauseKey.toLowerCase());
        if (!key) {
            throw new Error(`agreement ${entry.id} fills clause ${clauseKey}, which its agreement ${entry.agreementHash} does not compose`);
        }
        out[key] = { ...out[key], ...values };
    }
    return out;
}

/** The agreements an agreement follows — the data of its topology fill. The
 *  entry is found by its DATA KEY (`follows`, one name at both times: at
 *  runtime the committed clause holds the FigaroCore order hashes of the
 *  orders the order follows; at design time the values are sibling
 *  `agreement-<i>` labels), so reading needs no spec cache and tolerates any
 *  registry-defined topology clause. */
export function assemblyFollows(entry: Pick<AssemblyAgreement, "clauses">): string[] {
    const fill = Object.values(entry.clauses ?? {}).find(
        (fields) => Array.isArray((fields as { follows?: unknown } | undefined)?.follows),
    );
    const ids = (fill as { follows?: unknown } | undefined)?.follows;
    return Array.isArray(ids) ? ids.filter((p): p is string => typeof p === "string") : [];
}

/** Every clause a hydrated assembly composes — the assembly-scoped clauses
 *  plus each agreement's — as one sorted, de-duplicated key list: each of these must be live on `ClauseRegistry` for the design to
 *  check out. */
export function assemblyComposedClauseKeys(
    assembly: Assembly,
    agreements: Readonly<Record<Hex, RegisteredAgreement>>,
): Hex[] {
    const hydrated: HydratedAssembly = { assembly, agreements: agreements as Record<Hex, RegisteredAgreement> };
    const keys = new Set<Hex>(Object.keys(assembly.assemblyClauses ?? {}) as Hex[]);
    for (const entry of assembly.agreements) {
        for (const clauseKey of Object.keys(agreementClauses(hydrated, entry)) as Hex[]) keys.add(clauseKey);
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

/** The label the assembly tree's leaf domain is the hash of — a bare string
 *  no spec or agreement document serializes to. */
export const ASSEMBLY_LEAF_DOMAIN_LABEL = "figaro-assembly-leaf";

/** The domain mixed into every leaf of the assembly tree (the agreement
 *  leaves and the assembly-terms leaf), `keccak256("figaro-assembly-leaf")`:
 *  an assembly root is built as `keccak256(keccak256(domain ‖ key ‖ dataHash))`
 *  per leaf where the agreement format builds `keccak256(keccak256(key ‖
 *  dataHash))`, so a tree over agreements and a tree over clauses never share
 *  one shape and no agreement root can pass as an assembly root. The same
 *  constant is `UsageCounter.assemblyLeafDomain` on chain and
 *  `ASSEMBLY_LEAF_DOMAIN` in the guest. */
export const ASSEMBLY_LEAF_DOMAIN: Hex = keccak256(toHex(ASSEMBLY_LEAF_DOMAIN_LABEL));

/** A leaf of the assembly tree: the domain, the leaf's key (an agreement's
 *  `agreementHash`, or the assembly-terms key) and the keccak256 of its
 *  committed bytes, double-hashed as every leaf of the format is. */
export function computeAssemblyLeaf(key: Hex, dataHash: Hex): Hex {
    if (!isBytes32Hex(key) || !isBytes32Hex(dataHash)) throw new Error("an assembly leaf takes a 32-byte key and a 32-byte data hash");
    return keccak256(keccak256(concat([ASSEMBLY_LEAF_DOMAIN, key, dataHash])));
}

/** An agreement leaf's committed bytes — canonical JSON
 *  `{"clauses":{…},"slot":i}` (`slot`, the wire name for the agreement's index) of the agreement's own fills (object keys
 *  sorted, arrays in authored order). `i` is the agreement's 0-based
 *  position in the assembly. */
export function agreementLeafBytes(entry: Pick<AssemblyAgreement, "clauses">, i: number): Hex {
    if (!Number.isSafeInteger(i) || i < 0) throw new Error(`entry index is not a non-negative integer: ${i}`);
    return toHex(new TextEncoder().encode(canonicalize({ clauses: entry.clauses ?? {}, slot: i })));
}

/** The two format keys an agreement hash may never be: the provenance leaf's
 *  and the assembly-terms leaf's. Throws for either. */
export function assertNotReservedKey(agreementHash: Hex, where = "agreementHash"): void {
    const k = agreementHash.toLowerCase();
    if (k === PROVENANCE_LEAF_KEY.toLowerCase() || k === ASSEMBLY_TERMS_LEAF_KEY.toLowerCase()) {
        throw new Error(`${where} ${agreementHash} is a reserved format key, never a registered agreement`);
    }
}

/** An agreement's leaf in the assembly tree — the assembly leaf shape with
 *  the agreement's own `agreementHash` as the key and
 *  `keccak256(agreementLeafBytes)` as the data hash. Throws for a reserved key. */
function agreementLeaf(entry: AssemblyAgreement, i: number): Hex {
    assertNotReservedKey(entry.agreementHash, `agreement ${i} agreementHash`);
    return computeAssemblyLeaf(entry.agreementHash, keccak256(agreementLeafBytes(entry, i)));
}

/** Every leaf of the composition tree, sorted as the tree is built: one per
 *  agreement, plus the assembly-terms leaf when any assembly-scoped clause is
 *  composed. */
export function assemblyLeaves(assembly: Assembly): Hex[] {
    const leaves = assembly.agreements.map((entry, i) => agreementLeaf(entry, i));
    const terms = assembly.assemblyClauses;
    if (terms && Object.keys(terms).length > 0) {
        leaves.push(computeAssemblyLeaf(ASSEMBLY_TERMS_LEAF_KEY, hashClauseData({ clause: ASSEMBLY_TERMS_LEAF_KEY, data: terms })));
    }
    return sortLeaves(leaves);
}

/** The assembly's identity — the merkle root over its agreement leaves and its
 *  assembly-terms leaf (`assemblyLeaves`, each in the assembly tree's own
 *  leaf shape, `computeAssemblyLeaf`), built by the format's tree
 *  (`buildMerkleRoot`): a one-leaf tree's root is its leaf.
 *  Editorial prose is excluded, so renaming never forks identity. This is
 *  the hash `AssemblyRegistry` keys bindings on. Publishers anchor it;
 *  readers recompute it from a fetched document to verify integrity. */
export function assemblyHashOf(
    assembly: Assembly,
): Hex {
    return buildMerkleRoot(assemblyLeaves(assembly));
}

/** The membership proof of agreement `i` under `assemblyHashOf`:
 *  its leaf, its sorted-pair proof, and `slotContentHash` =
 *  `keccak256(agreementLeafBytes(entry, i))` — what
 *  `UsageCounter.recordAssemblyUsage` and the batch path's assembly claim
 *  take beside the agreement's agreement hash. Throws for an index outside
 *  the assembly. */
export function buildAgreementInclusionProof(
    assembly: Assembly,
    i: number,
): { leaf: Hex; proof: Hex[]; slotContentHash: Hex } {
    const entry = assembly.agreements[i];
    if (!entry) throw new Error(`agreement ${i} is not in the assembly (${assembly.agreements.length} agreements)`);
    const slotContentHash = keccak256(agreementLeafBytes(entry, i));
    const { leaf, proof } = buildLeafInclusionProof(assemblyLeaves(assembly), agreementLeaf(entry, i));
    return { leaf, proof, slotContentHash };
}

/** The published slug — presentation only, a deterministic pure function of
 *  the assembly hash. Identical compositions → identical slug; distinct
 *  compositions → distinct slug. The slug exists nowhere on-chain: the
 *  registry keys bindings by `assemblyHash`, and every reader derives the
 *  slug from the event's hash. */
export function deriveAssemblySlug(assemblyHash: Hex): string {
    return `asm-${assemblyHash.slice(2, 18)}`;
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
 * A human authors `agreements/*.json` agreements, `assemblies/*.json`
 * assemblies and `members/*.json` documents by clause name; a published
 * document carries keys. Each name is
 * matched against the loaded specs' own `clauseId` — written `name@version`,
 * the spec's `version` must match too. A name two loaded specs share, written
 * without `@version`, is refused (the document must say which), as is a name
 * no loaded spec carries. A value that is already a 32-byte key passes
 * through. This is a LOCAL authoring read over the caller's spec set, never a
 * chain read by name: on chain a clause is only its key.
 *
 * Rewritten in an authored agreement: the top-level `clauses` keys. In a
 * assembly: every `agreements[].clauses` and `assemblyClauses` key. In a
 * member profile: `disclosurePolicy[].clauseId` and
 * `assemblyBindings[].coSellerBindings[].clauseId` (each becomes
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
    if ("clauses" in src) out.clauses = rekey(src.clauses, "clauses");
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
                ...("coSellerBindings" in binding && {
                    coSellerBindings: mapArray(binding.coSellerBindings, (e, j) =>
                        renameClauseId(e, `assemblyBindings[${i}].coSellerBindings[${j}]`)),
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
