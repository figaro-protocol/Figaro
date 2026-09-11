import siteMap from "./sites.json";

// The site map's reader. sites.json is the one owner of which host serves
// which route; this module answers two questions for the pages: which sites
// carry a route, and how a link from one page to another route is written.
// With NEXT_PUBLIC_SPLIT_SITES unset every link stays relative and the whole
// tree is one host, exactly as before the split; with it set to "1" a link to a
// route the current host does not carry becomes absolute to the host that owns
// it. The export split (scripts/split-export.mjs) reads the same JSON.

export type SiteId = "apex" | "core" | "build" | "app";

export const SITE_IDS: readonly SiteId[] = ["apex", "core", "build", "app"];

export const SPLIT_SITES = process.env.NEXT_PUBLIC_SPLIT_SITES === "1";

const HOST_ENV: Record<SiteId, string | undefined> = {
    apex: process.env.NEXT_PUBLIC_SITE_HOST_APEX,
    core: process.env.NEXT_PUBLIC_SITE_HOST_CORE,
    build: process.env.NEXT_PUBLIC_SITE_HOST_BUILD,
    app: process.env.NEXT_PUBLIC_SITE_HOST_APP,
};

/** The origin each site is served from; the JSON's hosts unless the env overrides. */
export function siteHost(site: SiteId): string {
    const fromEnv = HOST_ENV[site]?.replace(/\/$/, "");
    return fromEnv || (siteMap.hosts as Record<SiteId, string>)[site].replace(/\/$/, "");
}

type RouteEntry = readonly [prefix: string, sites: readonly SiteId[]];
const ROUTES = siteMap.routes as unknown as readonly RouteEntry[];
type AliasEntry = readonly [sourceRoute: string, site: SiteId, servedPath: string];
const ALIASES = siteMap.aliases as unknown as readonly AliasEntry[];

/**
 * The path a route is served at on a host. A source route with an alias on
 * that host is served at the alias's path (the tree holds three FAQs under
 * three names; each host serves its own at /faq); everything else is served
 * at its own path. Applied to the path only — query and hash ride along.
 */
export function servedPath(href: string, site: SiteId): string {
    const m = /^([^?#]*)(.*)$/.exec(href);
    const bare = (m?.[1] ?? href).replace(/\/$/, "") || "/";
    const rest = m?.[2] ?? "";
    for (const [source, aliasSite, served] of ALIASES) {
        if (aliasSite !== site) continue;
        if (bare === source) return served + rest;
        if (bare.startsWith(source + "/")) return served + bare.slice(source.length) + rest;
    }
    return href;
}

/** A pathname without its query, hash, or trailing slash; "/" stays "/". */
function normalize(pathname: string): string {
    const bare = pathname.split(/[?#]/)[0] ?? "";
    if (bare === "" || bare === "/") return "/";
    return bare.endsWith("/") ? bare.slice(0, -1) : bare;
}

/**
 * The sites that carry a route, longest prefix first. The first site listed
 * owns it. An unmapped route returns an empty list — the guard
 * (scripts/lint-site-map.sh) keeps that from happening for any page route.
 */
export function sitesOfRoute(pathname: string): readonly SiteId[] {
    const route = normalize(pathname);
    let best: RouteEntry | undefined;
    for (const entry of ROUTES) {
        const [prefix] = entry;
        const hit = prefix === "/" ? route === "/" : route === prefix || route.startsWith(prefix + "/");
        if (hit && (!best || prefix.length > best[0].length)) best = entry;
    }
    return best ? best[1] : [];
}

/**
 * How a link written as an in-tree path is emitted from the page at
 * `currentPath`. Relative when the target is carried by every host the
 * current page is served from (a shared page renders once and is copied to
 * each of its hosts, so it must be right on all of them); otherwise absolute
 * to the target's owning host. Anything that is not an in-tree path — an
 * external URL, a bare anchor, mailto — passes through untouched.
 */
export function resolveHref(href: string, currentPath: string): string {
    if (!SPLIT_SITES) return href;
    if (!href.startsWith("/") || href.startsWith("//")) return href;
    const targets = sitesOfRoute(href);
    if (targets.length === 0) return href;
    const current = sitesOfRoute(currentPath);
    const carriedEverywhere = current.length > 0 && current.every((s) => targets.includes(s));
    if (carriedEverywhere) {
        // Relative on every host carrying the page; an alias renames per host,
        // so a page on one host only may use that host's served path.
        return current.length === 1 ? servedPath(href, current[0]) : href;
    }
    const owner = targets[0];
    return siteHost(owner) + servedPath(href, owner);
}
