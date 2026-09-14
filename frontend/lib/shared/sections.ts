import sectionMap from "./sections.json";

// The section map's reader. sections.json is the one owner of which section
// owns which route; this module answers, for the chrome: which section the
// reader is in, which nav groups that section shows, and which FAQ is the
// section's own. One host — every link stays an in-tree path.

export type SectionId = "use" | "build" | "core";

export const SECTION_IDS: readonly SectionId[] = ["use", "build", "core"];

type RouteEntry = readonly [prefix: string, sections: readonly SectionId[]];
const ROUTES = sectionMap.routes as unknown as readonly RouteEntry[];
const LANDINGS = sectionMap.landings as Record<SectionId, string>;

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

/** The section the reader is in — the first section owning the page; null on the apex or an unmapped route. */
export function currentSection(pathname: string): SectionId | null {
    return sectionsOfRoute(pathname)[0] ?? null;
}

/** Each section's landing page. */
export function sectionLanding(section: SectionId): string {
    return LANDINGS[section];
}

/** Each section's own FAQ. The apex and an unmapped route get the users'. */
export function sectionFaqRoute(section: SectionId | null): string {
    if (section === "build") return "/build/faq";
    if (section === "core") return "/core/faq";
    return "/faq";
}

/**
 * Whether a nav group belongs in the second level of the chrome on the page
 * at `pathname`: it does if any page it lists is shown by the reader's
 * section. The apex — the router, in no section — has no second level; its
 * chrome is the three section links alone.
 */
export function navGroupShown(hrefs: readonly string[], pathname: string): boolean {
    const section = currentSection(pathname);
    if (!section) return false;
    return hrefs.some((h) => sectionsOfRoute(h).includes(section));
}

/** The section's name in the header: Use, Build, Core; the apex has none. */
export function sectionLabel(section: SectionId | null): string | null {
    if (section === "use") return "Use";
    if (section === "build") return "Build";
    if (section === "core") return "Core";
    return null;
}
