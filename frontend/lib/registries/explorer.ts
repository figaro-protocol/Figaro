/**
 * The registry explorer's pure logic — `/registries` reads all three
 * protocol registries (clauses, assemblies, members) and lets a reader
 * search, facet, and sort what is registered. Everything here is DERIVED
 * from event streams and pinned content: the family, an article
 * (`block.design.article`), a registeredBy wallet, the live-stake
 * state, the clauses an assembly composes. Nothing is a stored taxonomy or
 * a bundled roster, and no sort key ranks by usage or popularity — that
 * would fork the UNIFORM reward's doctrine into the optics of a list.
 *
 * The URL query IS the state (permalinkable: `?family=clauses&article=…`,
 * `?registeredBy=0x…`, `?family=assemblies&clause=figaro-schedule`), parsed
 * and serialised here so the page, the marketing count-links, and agents all
 * speak one shape.
 */

import { canonicalContentHash, templateCompositionHash } from "@figaro-protocol/sdk";
import type { BreadcrumbItem } from "@/components/shared/Breadcrumb";
import { safeJsonParse } from "@/lib/shared/safeJson";
import { pick, queryParam } from "@/lib/shared/urlQuery";

export const REGISTRY_FAMILIES = ["clauses", "assemblies", "members"] as const;
export type RegistryFamily = (typeof REGISTRY_FAMILIES)[number];

export const REGISTRY_SORTS = ["article", "name", "block", "registeredBy"] as const;
type RegistrySort = (typeof REGISTRY_SORTS)[number];

export const STAKE_VIEWS = ["live", "withdrawn", "all"] as const;
type StakeView = (typeof STAKE_VIEWS)[number];

export interface ExplorerQuery {
    family: RegistryFamily;
    /** Free-text, matched case-insensitively against every text column. */
    q: string;
    sort: RegistrySort;
    /** Clauses only — `block.design.article`. */
    article: string;
    /** The registeredBy (clauses and assemblies) / member wallet. */
    registeredBy: string;
    /** K4 de-surfacing: the DEFAULT view is the live stake set; withdrawn
     *  is an opt-in archival view, never a silent resurrection. */
    stake: StakeView;
    /** Assemblies only — narrow to compositions carrying this clause id. */
    clause: string;
}

/** The default sort per family — the reading order each surface had before
 *  it moved here: clauses by article, assemblies most-recent first, members
 *  most-recent first. */
function defaultSortFor(family: RegistryFamily): RegistrySort {
    return family === "clauses" ? "article" : "block";
}

/** Parse the URL query into explorer state. Unknown values fall back to
 *  defaults; nothing throws on a hand-typed link. */
export function parseExplorerQuery(params: URLSearchParams | Record<string, string | undefined>): ExplorerQuery {
    const get = (k: string) => queryParam(params, k);
    const family = pick(REGISTRY_FAMILIES, get("family"), "clauses");
    return {
        family,
        q: get("q").trim(),
        sort: pick(REGISTRY_SORTS, get("sort"), defaultSortFor(family)),
        article: get("article").trim(),
        registeredBy: get("registeredBy").trim(),
        stake: pick(STAKE_VIEWS, get("stake"), "live"),
        clause: get("clause").trim(),
    };
}

/** Serialise state back to a query string, omitting defaults so permalinks
 *  stay short and stable (`?family=clauses` is the whole default state). */
export function serializeExplorerQuery(state: ExplorerQuery): string {
    const p = new URLSearchParams();
    p.set("family", state.family);
    if (state.q) p.set("q", state.q);
    if (state.sort !== defaultSortFor(state.family)) p.set("sort", state.sort);
    if (state.article) p.set("article", state.article);
    if (state.registeredBy) p.set("registeredBy", state.registeredBy);
    if (state.stake !== "live") p.set("stake", state.stake);
    if (state.clause) p.set("clause", state.clause);
    return p.toString();
}

/** One explorer row — the family-neutral projection every registry maps
 *  into so search/sort/facet are written once. `text` is the free-text
 *  haystack (id, name, description, wallet, article, clause ids…). */
export interface ExplorerRow {
    family: RegistryFamily;
    /** Stable id for the DOM anchor and the React key. */
    key: string;
    name: string;
    /** Clauses: the clause id; assemblies: the slug; members: the address. */
    id: string;
    article: string;
    registeredBy: string;
    blockNumber: bigint;
    stakeWithdrawn: boolean;
    /** Assemblies: composed clause ids. Clauses/members: empty. */
    clauses: readonly string[];
    /** Whether the pinned content behind the on-chain pointer (the clause's
     *  spec, the assembly's template, the member's profile) has resolved.
     *  `resolving` — not served yet, being re-read; `unavailable` — served
     *  but wrong (integrity or parse failure), never going to resolve. Only
     *  a `resolved` row's name/article/description mean anything; the rest
     *  show the on-chain identity alone. */
    content: "resolved" | "resolving" | "unavailable";
    /** The IPFS locator the registration event carries — where the pinned
     *  document actually IS. Empty for members, whose profile document is the
     *  member's own and not anchored by a registration hash. */
    contentURI: string;
    /** The digest the CHAIN anchors for this row: `ClauseRegistry.contentHash`
     *  for a clause, `AssemblyRegistry`'s `compositionHash` for an assembly.
     *  Empty where the family anchors none. */
    anchoredHash: string;
    text: string;
}

function matchesQuery(row: ExplorerRow, state: ExplorerQuery): boolean {
    if (row.family !== state.family) return false;
    if (state.stake === "live" && row.stakeWithdrawn) return false;
    if (state.stake === "withdrawn" && !row.stakeWithdrawn) return false;
    if (state.article && row.article !== state.article) return false;
    if (state.registeredBy && row.registeredBy.toLowerCase() !== state.registeredBy.toLowerCase()) return false;
    if (state.clause && !row.clauses.includes(state.clause)) return false;
    if (state.q) {
        const needle = state.q.toLowerCase();
        if (!row.text.toLowerCase().includes(needle)) return false;
    }
    return true;
}

function compareRows(a: ExplorerRow, b: ExplorerRow, sort: RegistrySort): number {
    switch (sort) {
        case "article": {
            const c = a.article.localeCompare(b.article);
            return c !== 0 ? c : a.name.localeCompare(b.name);
        }
        case "name":
            return a.name.localeCompare(b.name) || a.id.localeCompare(b.id);
        case "registeredBy":
            return a.registeredBy.toLowerCase().localeCompare(b.registeredBy.toLowerCase()) || a.name.localeCompare(b.name);
        case "block":
        default:
            // Most recent first; ties by name for a stable order.
            return a.blockNumber === b.blockNumber ? a.name.localeCompare(b.name) : (a.blockNumber > b.blockNumber ? -1 : 1);
    }
}

// ── The document as stored ──────────────────────────────────────────────────

/**
 * What a family's on-chain digest is computed OVER. The two are NOT the same
 * shape, and a surface that showed one note for both would misstate one of
 * them:
 *
 *   `content-hash` — clauses. `ClauseRegistry.contentHash` is the keccak256
 *   of the canonical form of the WHOLE spec document, so re-canonicalizing
 *   everything the gateway served and hashing it must reproduce the anchor.
 *
 *   `composition-hash` — assemblies. `AssemblyRegistry`'s `compositionHash` is
 *   the keccak256 of the canonical form of the template's COMPOSITION slice
 *   alone (`agreements`, plus `assemblyClauses` / `assemblyClauseVersions`
 *   where composed — `templateCompositionHash`). The designer's editorial
 *   fields (name, summary, description) ride in the same document and are
 *   deliberately NOT covered: a differently-worded assembly is the same
 *   assembly, a differently-termed one is not.
 */
export type StoredDocumentAnchor = "content-hash" | "composition-hash";

/** Which digest a family anchors. Members anchor none — a profile is the
 *  member's own declaration, re-pinnable at will, not a registration. */
export function anchorForFamily(family: RegistryFamily): StoredDocumentAnchor | null {
    return family === "clauses" ? "content-hash" : family === "assemblies" ? "composition-hash" : null;
}

/** The one-line statement of what the chain's digest covers, per anchor. Shown
 *  beside the hash so a reader re-deriving it knows what to hash. */
export const STORED_DOCUMENT_NOTE: Record<StoredDocumentAnchor, string> = {
    "content-hash":
        "The hash on chain is the keccak256 of these bytes in canonical form — object keys sorted at every depth, no whitespace — so anyone can re-canonicalize this document and reproduce the anchor.",
    "composition-hash":
        "The hash on chain is the keccak256 of the canonical form of this document's composition — its agreements, and the assembly-scoped clauses where it composes any. The designer's editorial wording rides in the same document and is deliberately outside the anchor.",
};

/** A pinned document read back and checked against the chain's own digest. */
export interface StoredDocument {
    /** Which digest was checked, and therefore which note applies. */
    anchor: StoredDocumentAnchor;
    /** The digest the registration event carries. */
    anchored: string;
    /** Recomputed from the served bytes; null when they will not parse as
     *  JSON, which is a permanent failure and not a hash disagreement. */
    recomputed: string | null;
    /** True only when the recomputation reproduced the anchor. A false here is
     *  a real finding — the pin does not answer for what the chain claims. */
    matches: boolean;
}

/**
 * Verify served bytes against the chain's digest. PURE — the fetch is the
 * caller's; this is the arithmetic, and it is the same arithmetic the loaders
 * already run before they will use a document (`loadClauseSpec`,
 * `fetchAssemblyTemplate`). Stated separately so the reader can be SHOWN it
 * rather than told the loader did it.
 */
export function storedDocument(text: string, anchored: string, anchor: StoredDocumentAnchor): StoredDocument {
    const parsed = safeJsonParse<Record<string, unknown>>(text);
    if (parsed === null) return { anchor, anchored, recomputed: null, matches: false };
    let recomputed: string;
    try {
        recomputed =
            anchor === "content-hash"
                ? canonicalContentHash(parsed)
                : templateCompositionHash(parsed as Parameters<typeof templateCompositionHash>[0]);
    } catch {
        // A document that parses but carries no composition to hash cannot
        // reproduce the anchor. Absence of a recomputation, never a match.
        return { anchor, anchored, recomputed: null, matches: false };
    }
    return {
        anchor,
        anchored,
        recomputed,
        matches: recomputed.toLowerCase() === anchored.toLowerCase(),
    };
}

/** Filter + sort in one pass — the explorer's whole read model. */
export function selectRows<T extends ExplorerRow>(rows: readonly T[], state: ExplorerQuery): T[] {
    return rows.filter((r) => matchesQuery(r, state)).sort((a, b) => compareRows(a, b, state.sort));
}

/** The distinct values a facet can take within a family — derived from the
 *  rows themselves (never a list the frontend knows in advance). */
export function facetValues(rows: readonly ExplorerRow[], family: RegistryFamily, facet: "article" | "registeredBy"): string[] {
    const set = new Set<string>();
    for (const r of rows) {
        if (r.family !== family) continue;
        const v = r[facet];
        if (v) set.add(facet === "registeredBy" ? v.toLowerCase() : v);
    }
    return Array.from(set).sort();
}

/** The breadcrumb trail a deep-linked arrival sees — derived from the
 *  active state, never a stored taxonomy. The last item is hrefless. */
export function explorerBreadcrumb(state: ExplorerQuery): BreadcrumbItem[] {
    const familyLabel = { clauses: "Clauses", assemblies: "Assemblies", members: "Members" }[state.family];
    const trail: BreadcrumbItem[] = [
        { label: "Build", href: "/build" },
        { label: "Registries", href: "/registries" },
    ];
    const facetLeaf = state.article || state.clause || state.registeredBy;
    if (facetLeaf) {
        trail.push({ label: familyLabel, href: `/registries?family=${state.family}` });
        trail.push({ label: state.article || (state.clause ? `composing ${state.clause}` : state.registeredBy) });
    } else {
        trail.push({ label: familyLabel });
    }
    return trail;
}

/** Where a family's CONCEPT lives — the explorer answers "what is
 *  registered", the concept page answers "what it is". */
export const FAMILY_CONCEPT_ROUTE: Record<RegistryFamily, string> = {
    clauses: "/clauses",
    assemblies: "/assemblies",
    members: "/members",
};
