/**
 * The registry explorer's pure logic — `/registries` reads all three
 * protocol registries (clauses, assemblies, members) and lets a reader
 * search, facet, and sort what is registered. Everything here is DERIVED
 * from event streams and pinned content: the family, an article
 * (`block.design.article`), a registrar/author wallet, the live-stake
 * state, the clauses an assembly composes. Nothing is a stored taxonomy or
 * a bundled roster, and no sort key ranks by usage or popularity — that
 * would fork the UNIFORM reward's doctrine into the optics of a list.
 *
 * The URL query IS the state (permalinkable: `?family=clauses&article=…`,
 * `?registrar=0x…`, `?family=assemblies&clause=figaro-schedule`), parsed
 * and serialised here so the page, the marketing count-links, and agents all
 * speak one shape.
 */

export const REGISTRY_FAMILIES = ["clauses", "assemblies", "members"] as const;
export type RegistryFamily = (typeof REGISTRY_FAMILIES)[number];

export const REGISTRY_SORTS = ["article", "name", "block", "registrar"] as const;
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
    /** The registrar (clauses) / author (assemblies) / member wallet. */
    registrar: string;
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

function pick<T extends readonly string[]>(values: T, raw: string | null | undefined, fallback: T[number]): T[number] {
    return raw && (values as readonly string[]).includes(raw) ? (raw as T[number]) : fallback;
}

/** Parse the URL query into explorer state. Unknown values fall back to
 *  defaults; nothing throws on a hand-typed link. */
export function parseExplorerQuery(params: URLSearchParams | Record<string, string | undefined>): ExplorerQuery {
    const get = (k: string) => (params instanceof URLSearchParams ? params.get(k) : params[k]) ?? "";
    const family = pick(REGISTRY_FAMILIES, get("family"), "clauses");
    return {
        family,
        q: get("q").trim(),
        sort: pick(REGISTRY_SORTS, get("sort"), defaultSortFor(family)),
        article: get("article").trim(),
        registrar: get("registrar").trim(),
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
    if (state.registrar) p.set("registrar", state.registrar);
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
    registrar: string;
    blockNumber: bigint;
    stakeWithdrawn: boolean;
    /** Assemblies: composed clause ids. Clauses/members: empty. */
    clauses: readonly string[];
    text: string;
}

function matchesQuery(row: ExplorerRow, state: ExplorerQuery): boolean {
    if (row.family !== state.family) return false;
    if (state.stake === "live" && row.stakeWithdrawn) return false;
    if (state.stake === "withdrawn" && !row.stakeWithdrawn) return false;
    if (state.article && row.article !== state.article) return false;
    if (state.registrar && row.registrar.toLowerCase() !== state.registrar.toLowerCase()) return false;
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
        case "registrar":
            return a.registrar.toLowerCase().localeCompare(b.registrar.toLowerCase()) || a.name.localeCompare(b.name);
        case "block":
        default:
            // Most recent first; ties by name for a stable order.
            return a.blockNumber === b.blockNumber ? a.name.localeCompare(b.name) : (a.blockNumber > b.blockNumber ? -1 : 1);
    }
}

/** Filter + sort in one pass — the explorer's whole read model. */
export function selectRows(rows: readonly ExplorerRow[], state: ExplorerQuery): ExplorerRow[] {
    return rows.filter((r) => matchesQuery(r, state)).sort((a, b) => compareRows(a, b, state.sort));
}

/** The distinct values a facet can take within a family — derived from the
 *  rows themselves (never a list the frontend knows in advance). */
export function facetValues(rows: readonly ExplorerRow[], family: RegistryFamily, facet: "article" | "registrar"): string[] {
    const set = new Set<string>();
    for (const r of rows) {
        if (r.family !== family) continue;
        const v = r[facet];
        if (v) set.add(facet === "registrar" ? v.toLowerCase() : v);
    }
    return Array.from(set).sort();
}

/** The breadcrumb trail a deep-linked arrival sees — derived from the
 *  active state, never a stored taxonomy. The last item is hrefless. */
export function explorerBreadcrumb(state: ExplorerQuery): Array<{ label: string; href?: string }> {
    const familyLabel = { clauses: "Clauses", assemblies: "Assemblies", members: "Members" }[state.family];
    const trail: Array<{ label: string; href?: string }> = [
        { label: "Builders", href: "/clauses" },
        { label: "Registries", href: "/registries" },
    ];
    const facetLeaf = state.article || state.clause || state.registrar;
    if (facetLeaf) {
        trail.push({ label: familyLabel, href: `/registries?family=${state.family}` });
        trail.push({ label: state.article || (state.clause ? `composing ${state.clause}` : state.registrar) });
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
