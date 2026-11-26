/**
 * @figaro-protocol/sdk — Assembly and agreement identity
 *
 * Two design-time registry families key by content, each a merkle ROOT built
 * with the agreement format's own leaf convention. `AgreementRegistry` keys
 * a registered agreement by `agreementHashOf(composed)` — the root over one
 * leaf per composed clause (the clause key and the designer's fills), so
 * membership of a clause in a registered agreement is a merkle proof
 * (`buildRegisteredClauseInclusionProof`). `ProcessRegistry` keys an assembly by
 * `processDesignHash` — the root over its agreements (each a registered
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
import { isBytes32Hex, isPlainRecord } from "./types.js";
import {
    distinctClauseKeys,
    buildLeafInclusionProof,
    buildMerkleRoot,
    canonicalize,
    canonicalContentHash,
    computeClauseLeaf,
    PROVENANCE_LEAF_KEY,
    sortLeaves,
    hashClauseData,
} from "./agreement.js";
import type { ProjectionSpecView } from "./projection.js";

// ── The registered agreement (the pinned document behind an agreement hash) ──

/** A registered agreement's pinned document: the clauses composed for ONE
 *  agreement, value-free, with the designer's fills. It names no topology —
 *  who follows whom is the assembly's fact (each entry's own `follows`), so
 *  one registered agreement sits in any entry of any assembly.
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
    distinctClauseKeys(Object.keys(doc.clauses));
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
    const fillsHash = canonicalContentHash(fills);
    const { leaf, proof } = buildLeafInclusionProof(agreementClauseLeaves(doc), composedClauseLeaf(key as Hex, fills));
    return { leaf, proof, fillsHash };
}

// ── The assembly document (the pinned assembly, hydrated off-chain) ──────────

/** One agreement of an assembly: the registered agreement it binds and the
 *  agreement's own fills over it. */
export interface ProcessDesignAgreement {
    /** Local label for the agreement — `agreement-<index>`, stable within the
     *  assembly; the reference target another entry's `follows` names. NOT a
     *  chain id, and NOT a party — the assembly is party-agnostic. */
    id: string;
    /** The registered agreement this agreement binds (`AgreementRegistry`
     *  key). */
    agreementHash: Hex;
    /** The agreement's own fills, clauseKey → values, merged over the
     *  registered agreement's `clauses` at checkout (the agreement's fill
     *  wins for the keys it names); `{}` when it fills none. */
    clauses: Record<Hex, Record<string, unknown>>;
    /** The entries this one follows, by their `id` labels — the design's
     *  topology, empty or absent on the root. Hashed into the entry's leaf
     *  (`agreementLeafBytes`), and written by checkout into each order's
     *  topology leaf as the order hashes of those entries' orders
     *  (`Agreement.follows`). */
    follows?: string[];
}

/** One question a designer answers about their assembly, in plain words. */
export interface ProcessDesignFaqEntry {
    question: string;
    answer: string;
}

export interface ProcessDesign {
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
    faq?: readonly ProcessDesignFaqEntry[];
    /** ASSEMBLY-SCOPED clauses — clauses declaring
     *  `design.scope: "assembly"`, composed ONCE for the whole design
     *  (clauseKey → the designer's values, `design.fills` only — same
     *  value-free rule as agreements). At checkout every one of these folds
     *  into EVERY agreement, so every party signs the assembly-wide term in
     *  their own agreement. Sparse: absent when none composed; when present,
     *  one leaf of the composition tree (`PROCESS_TERMS_LEAF_KEY`). */
    assemblyClauses?: Record<Hex, Record<string, unknown>>;
    /** The composition: one agreement per future FigaroCore order, in
     *  assembly order — each a registered agreement and its own fills. */
    agreements: ProcessDesignAgreement[];
}

/** An assembly with every agreement's registered agreement
 *  beside it, keyed by lowercased `agreementHash` — what checkout plans from.
 *  Each document is read from the agreement registry's binding and verified
 *  against its key (`anchorRegisteredAgreement`) before it lands here. */
export interface HydratedProcessDesign {
    assembly: ProcessDesign;
    agreements: Record<Hex, RegisteredAgreement>;
}

/** The registered agreement an agreement binds. Throws when the hydrated
 *  map does not carry it — a checkout never plans an agreement it cannot
 *  read. */
export function boundAgreement(hydrated: HydratedProcessDesign, entry: ProcessDesignAgreement): RegisteredAgreement {
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
export function agreementClauses(hydrated: HydratedProcessDesign, entry: ProcessDesignAgreement): Record<Hex, Record<string, unknown>> {
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

/** The entries an entry follows — its own `follows`, the sibling
 *  `agreement-<i>` labels; empty for the root and for an entry that names
 *  none. */
export function processDesignFollows(entry: Pick<ProcessDesignAgreement, "follows">): string[] {
    const ids = entry.follows;
    return Array.isArray(ids) ? ids.filter((p): p is string => typeof p === "string") : [];
}

/**
 * The root agreement of a process design: the entry whose order opens the
 * process. It is the first entry, in the design's own order, that follows
 * nothing: its `follows` is empty or absent. Every other entry's order is a
 * sub-order, and the commit order fixes the running total each seller bonds
 * against.
 *
 * A design may hold several entries that follow nothing: two sellers whose
 * work does not depend on each other. The first is the root, and the others
 * commit after it as sub-orders that follow no order. FigaroCore reads no
 * topology: to it a process is its root commit and the commits after it.
 *
 * Throws when no entry follows nothing (an empty design, a cycle, an entry
 * that follows itself, a design whose every entry names a parent): the
 * design states no order that opens the process.
 */
export function rootAgreementOf<E extends Pick<ProcessDesignAgreement, "id" | "follows">>(
    design: { agreements: readonly E[] },
): E {
    const root = design.agreements.find((entry) => processDesignFollows(entry).length === 0);
    if (root === undefined) {
        throw new Error("the process design has no root agreement: every entry follows another");
    }
    return root;
}

/** Every clause a hydrated assembly composes — the assembly-scoped clauses
 *  plus each agreement's — as one sorted, de-duplicated key list: each of these must be live on `ClauseRegistry` for the design to
 *  check out. */
export function processDesignComposedClauseKeys(
    assembly: ProcessDesign,
    agreements: Readonly<Record<Hex, RegisteredAgreement>>,
): Hex[] {
    const hydrated: HydratedProcessDesign = { assembly, agreements: agreements as Record<Hex, RegisteredAgreement> };
    const keys = new Set<Hex>(Object.keys(assembly.assemblyClauses ?? {}) as Hex[]);
    for (const entry of assembly.agreements) {
        for (const clauseKey of Object.keys(agreementClauses(hydrated, entry)) as Hex[]) keys.add(clauseKey);
    }
    return Array.from(keys).sort();
}

// ── The composition tree ────────────────────────────────────────────────────

/** The label the assembly-terms leaf's key is the hash of — a bare string no
 *  spec or agreement document serializes to. */
export const PROCESS_TERMS_LEAF_LABEL = "figaro-assembly-terms";

/** The reserved key of the composition tree's assembly-terms leaf, whose
 *  bytes are the canonical JSON of `assemblyClauses`. */
export const PROCESS_TERMS_LEAF_KEY: Hex = keccak256(toHex(PROCESS_TERMS_LEAF_LABEL));

/** The label the assembly tree's leaf domain is the hash of — a bare string
 *  no spec or agreement document serializes to. */
export const PROCESS_LEAF_DOMAIN_LABEL = "figaro-assembly-leaf";

/** The domain mixed into every leaf of the assembly tree (the agreement
 *  leaves and the assembly-terms leaf), `keccak256("figaro-assembly-leaf")`:
 *  an assembly root is built as `keccak256(keccak256(domain ‖ key ‖ dataHash))`
 *  per leaf where the agreement format builds `keccak256(keccak256(key ‖
 *  dataHash))`, so a tree over agreements and a tree over clauses never share
 *  one shape and no agreement root can pass as an assembly root. The same
 *  constant is `UsageCounter.processLeafDomain` on chain and
 *  `PROCESS_LEAF_DOMAIN` in the guest. */
export const PROCESS_LEAF_DOMAIN: Hex = keccak256(toHex(PROCESS_LEAF_DOMAIN_LABEL));

/** A leaf of the assembly tree: the domain, the leaf's key (an agreement's
 *  `agreementHash`, or the assembly-terms key) and the keccak256 of its
 *  committed bytes, double-hashed as every leaf of the format is. */
export function computeProcessLeaf(key: Hex, dataHash: Hex): Hex {
    if (!isBytes32Hex(key) || !isBytes32Hex(dataHash)) throw new Error("an assembly leaf takes a 32-byte key and a 32-byte data hash");
    return keccak256(keccak256(concat([PROCESS_LEAF_DOMAIN, key, dataHash])));
}

/** An agreement leaf's committed bytes — canonical JSON
 *  `{"agreement":i,"clauses":{…},"follows":[…]}` (`agreement`, the agreement's index) of the agreement's own fills
 *  and the labels of the entries it follows (`[]` on the root and when
 *  absent; object keys sorted, arrays in authored order). `i` is the
 *  agreement's 0-based position in the assembly. */
export function agreementLeafBytes(entry: Pick<ProcessDesignAgreement, "clauses" | "follows">, i: number): Hex {
    if (!Number.isSafeInteger(i) || i < 0) throw new Error(`entry index is not a non-negative integer: ${i}`);
    const follows = entry.follows ?? [];
    if (!Array.isArray(follows) || follows.some((label) => typeof label !== "string")) {
        throw new Error(`entry ${i} follows is not a list of entry labels`);
    }
    // One label named twice would register but never check out: checkout
    // writes each label's order hash, and the topology leaf refuses an order
    // hash named twice (`topologyLeafBytes`).
    const seen = new Set<string>();
    for (const label of follows) {
        if (seen.has(label)) throw new Error(`entry ${i} follows names entry ${label} twice`);
        seen.add(label);
    }
    return toHex(new TextEncoder().encode(canonicalize({ agreement: i, clauses: entry.clauses ?? {}, follows })));
}

/** The two format keys an agreement hash may never be: the provenance leaf's
 *  and the assembly-terms leaf's. Throws for either. */
export function assertNotReservedKey(agreementHash: Hex, where = "agreementHash"): void {
    const k = agreementHash.toLowerCase();
    if (k === PROVENANCE_LEAF_KEY.toLowerCase() || k === PROCESS_TERMS_LEAF_KEY.toLowerCase()) {
        throw new Error(`${where} ${agreementHash} is a reserved format key, never a registered agreement`);
    }
}

/** An agreement's leaf in the assembly tree — the assembly leaf shape with
 *  the agreement's own `agreementHash` as the key and
 *  `keccak256(agreementLeafBytes)` as the data hash. Throws for a reserved key. */
function agreementLeaf(entry: ProcessDesignAgreement, i: number): Hex {
    assertNotReservedKey(entry.agreementHash, `agreement ${i} agreementHash`);
    return computeProcessLeaf(entry.agreementHash, keccak256(agreementLeafBytes(entry, i)));
}

/** Every leaf of the composition tree, sorted as the tree is built: one per
 *  agreement, plus the assembly-terms leaf when any assembly-scoped clause is
 *  composed. */
export function processDesignLeaves(assembly: ProcessDesign): Hex[] {
    const leaves = assembly.agreements.map((entry, i) => agreementLeaf(entry, i));
    const terms = assembly.assemblyClauses;
    if (terms && Object.keys(terms).length > 0) {
        leaves.push(computeProcessLeaf(PROCESS_TERMS_LEAF_KEY, hashClauseData({ clause: PROCESS_TERMS_LEAF_KEY, data: terms })));
    }
    return sortLeaves(leaves);
}

/** The assembly's identity — the merkle root over its agreement leaves and its
 *  assembly-terms leaf (`processDesignLeaves`, each in the assembly tree's own
 *  leaf shape, `computeProcessLeaf`), built by the format's tree
 *  (`buildMerkleRoot`): a one-leaf tree's root is its leaf.
 *  Editorial prose is excluded, so renaming never forks identity. This is
 *  the hash `ProcessRegistry` keys bindings on. Publishers anchor it;
 *  readers recompute it from a fetched document to verify integrity. */
export function processDesignHashOf(
    assembly: ProcessDesign,
): Hex {
    return buildMerkleRoot(processDesignLeaves(assembly));
}

/** The membership proof of agreement `i` under `processDesignHashOf`:
 *  its leaf, its sorted-pair proof, and `agreementContentHash` =
 *  `keccak256(agreementLeafBytes(entry, i))` — what
 *  `UsageCounter.recordProcessDesignUsage` and the batch path's assembly claim
 *  take beside the agreement's agreement hash. Throws for an index outside
 *  the assembly. */
export function buildAgreementInclusionProof(
    assembly: ProcessDesign,
    i: number,
): { leaf: Hex; proof: Hex[]; agreementContentHash: Hex } {
    const entry = assembly.agreements[i];
    if (!entry) throw new Error(`agreement ${i} is not in the assembly (${assembly.agreements.length} agreements)`);
    const agreementContentHash = keccak256(agreementLeafBytes(entry, i));
    const { leaf, proof } = buildLeafInclusionProof(processDesignLeaves(assembly), agreementLeaf(entry, i));
    return { leaf, proof, agreementContentHash };
}

/** The published slug — presentation only, a deterministic pure function of
 *  the assembly hash. Identical compositions → identical slug; distinct
 *  compositions → distinct slug. The slug exists nowhere on-chain: the
 *  registry keys bindings by `processDesignHash`, and every reader derives the
 *  slug from the event's hash. */
export function deriveProcessDesignSlug(processDesignHash: Hex): string {
    return `asm-${processDesignHash.slice(2, 18)}`;
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
 * member profile: `processBindings[].coSellerBindings[].clauseId` (becomes
 * `clauseKey`), and the `profileClauseValues` keys. In a catalog: every
 * `items[].clauseValues` key.
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
    if ("processBindings" in src) {
        out.processBindings = mapArray(src.processBindings, (binding, i) => {
            if (!isPlainRecord(binding)) return binding;
            return {
                ...binding,
                ...("coSellerBindings" in binding && {
                    coSellerBindings: mapArray(binding.coSellerBindings, (e, j) =>
                        renameClauseId(e, `processBindings[${i}].coSellerBindings[${j}]`)),
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
            };
        });
    }
    return out as T;
}
