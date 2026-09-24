import sectionMap from "./sections.json";

// The section map's reader. sections.json is the one owner of which section
// (door) owns which route; this module answers, for the chrome: which section
// the reader is in, and which FAQ is the section's own. One host — every link stays an in-tree path.

export type SectionId = "join" | "trade" | "communities" | "terms" | "evidence" | "code";


type RouteEntry = readonly [prefix: string, sections: readonly SectionId[]];
const ROUTES = sectionMap.routes as unknown as readonly RouteEntry[];

/** A pathname without its query, hash, or trailing slash; "/" stays "/". */
function normalize(pathname: string): string {
    const bare = pathname.split(/[?#]/)[0] ?? "";
    if (bare === "" || bare === "/") return "/";
    return bare.endsWith("/") ? bare.slice(0, -1) : bare;
}

/**
 * The sections that show a route, longest prefix first. The first section
 * listed owns it. An unmapped route returns an empty list — the guard
 * (scripts/lint-section-map.sh) keeps that from happening for any page route.
 */
export function sectionsOfRoute(pathname: string): readonly SectionId[] {
    const route = normalize(pathname);
    let best: RouteEntry | undefined;
    for (const entry of ROUTES) {
        const [prefix] = entry;
        const hit = prefix === "/" ? route === "/" : route === prefix || route.startsWith(prefix + "/");
        if (hit && (!best || prefix.length > best[0].length)) best = entry;
    }
    return best ? best[1] : [];
}

/** The section the reader is in — the first section owning the page; null on the home page or an unmapped route. */
export function currentSection(pathname: string): SectionId | null {
    return sectionsOfRoute(pathname)[0] ?? null;
}

/** Each section's own FAQ: the builders' for terms, the core's for the code, the users' for every other door and the home page. */
export function sectionFaqRoute(section: SectionId | null): string {
    if (section === "terms") return "/terms/faq";
    if (section === "code") return "/core/faq";
    return "/faq";
}
