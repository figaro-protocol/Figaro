// Two nav tiers:
//
// - `NAV_LINKS` is the publication row. Used by:
//     - Marketing tier (only nav)
//     - (app) tier (top row of two-row header)
//   The three entries are the three doors, one per door page (Participate,
//   Build, Research), each the doorway of its route group; enforced by
//   scripts/lint-nav-structure.sh. The logo links home; no "Home" item here.
//
// - `NAV_LINKS_APP_PRIMARY` feeds ONLY the mobile drawer's App section
//   (no desktop row exists); entries whose routes the marketing map
//   already lists are filtered out at the drawer. Each entry MUST be a
//   protocol surface, not a product feature.
//
// - `NAV_LINKS_APP_DRAWER` is the (app) mobile drawer — combined
//   publication + reference + transactional surfaces, grouped by
//   section.
//
// - `NAV_LINKS_MARKETING_DRAWER` is the marketing mobile drawer, derived from
//   `MARKETING_MAP` (which `NavTreeRow` renders as desktop disclosure
//   submenus). Same grouped shape as the (app) drawer.
export interface NavLink {
    href: string;
    label: string;
    description?: string;
    isSectionHeader?: boolean;
    /** A path this export does not serve (the docs-site, a separate build
     *  under `/docs` on the same host): rendered as a plain `<a>`, never the
     *  client-side Link, so the browser loads it as a page. */
    external?: boolean;
}

export const NAV_LINKS: NavLink[] = [
    { href: "/participate", label: "Participate" },
    { href: "/terms", label: "Build" },
    { href: "/research", label: "Research" },
];

// Every entry below MUST be a route that lives in `app/(app)/`. The
// (marketing) ↔ (app) split is enforced by the route group, not by judgment.
// `ls app/(app)/*/page.tsx` is the audit. If a route is in
// `app/(marketing)/`, do NOT add it here — it belongs in `NAV_LINKS`.
//
// The first entry (Orders) is the consumer's primary surface — the wallet's
// single actor-neutral order list (every order it's on as buyer OR seller,
// plus anything awaiting its action). It precedes the wallet's other surfaces
// (Discover, Manage membership, Audit) so a participant who already has a
// wallet connected has a one-click path to "their" work.
export const NAV_LINKS_APP_PRIMARY: NavLink[] = [
    { href: "/orders", label: "Orders" },
    // The buyer's start-order verb — the wallet browses bonded sellers and opens
    // the chosen seller's assembly runtime, where a commitment begins. NOT
    // interchangeable with `/members/manage`, which is the wallet's own registration
    // surface (register a wallet in MembersRegistry, or manage that entry). Both
    // read a registry; they serve opposite roles, so both are listed.
    { href: "/discover", label: "Discover" },
    { href: "/members/manage", label: "Manage membership" },
    { href: "/audit", label: "Audit" },
    // The graphs' query surface — a READING tool for spectators (it sits
    // here too: mobile is exactly where a spectator stands).
    // Also a Research leaf beside /data in MARKETING_MAP; both listings are the
    // ruled "distinct entry point", not a duplication.
    { href: "/data/explore", label: "Data explorer" },
    // The RPGF distribution's runtime surface (read your accrual, claim a
    // closed period) — a protocol surface (the composed UsageCounter +
    // RpgfMinter), not a product feature; claiming is permissionless network
    // participation.
    { href: "/rewards", label: "Claim rewards" },
];

// The drawer's App section IS the primary row restated for mobile, so it SPREADS
// `NAV_LINKS_APP_PRIMARY` instead of re-listing it — a hand-copy drifts the
// moment one surface gains an entry and the other is forgotten.
export const NAV_LINKS_APP_DRAWER: NavLink[] = [
    { isSectionHeader: true, label: "Publication", href: "" },
    ...NAV_LINKS,
    { isSectionHeader: true, label: "App", href: "" },
    ...NAV_LINKS_APP_PRIMARY,
];

/**
 * The marketing map — the site tree, three doors, one per route group:
 * Participate `(participate)`, Build `(build)`, Research `(research)`. Each
 * group's first entry is its doorway, the door page; the entries after it are
 * the door's menu, in reading order, not alphabetical — seven entries at most.
 * A page of the door that is not in its menu sits behind a listed entry (the
 * page that links it); `scripts/lint-nav-structure.sh` holds that declaration.
 * A shared surface is listed by more than one door (`/agents` under
 * Participate and Build), as `lib/shared/sections.json` allows; the first
 * section there owns it. Labels derive from each page's own `metadata.title`
 * minus the site suffix; the one `external` entry, the builder documentation,
 * is the docs-site, a separate build under `/docs`. The app tier's pages a
 * door opens onto (Discover and Your orders under Participate, the data
 * explorer under Research) are admitted beside their object pages.
 * `(reference)` is footer chrome, never nav; papers are reached through
 * Working Groups — the corpus has ONE surface.
 * `scripts/lint-nav-structure.sh` enforces the mechanical half (doorway-first,
 * every page of the door listed or declared behind a listed entry, the
 * seven-entry cap, label==metadata.title, breadcrumb doorways); section order
 * and names are the maintainer's word.
 * ONE source, two renderings: `NavTreeRow` (desktop disclosure submenus) and
 * `NAV_LINKS_MARKETING_DRAWER` (mobile, flattened with section headers).
 */
export const MARKETING_MAP: { section: string; links: NavLink[] }[] = [
    {
        section: "Participate",
        links: [
            { href: "/participate", label: "Participate" },
            { href: "/discover", label: "Discover members" },
            { href: "/members", label: "Join" },
            { href: "/communities", label: "Communities" },
            { href: "/trade", label: "Trade" },
            { href: "/agents", label: "Agents" },
            { href: "/orders", label: "Your orders" },
        ],
    },
    {
        section: "Build",
        links: [
            { href: "/terms", label: "Build" },
            { href: "/docs/", label: "Builder docs", external: true },
            { href: "/core", label: "Code" },
            { href: "/clauses", label: "Clauses" },
            { href: "/assemblies", label: "Assemblies" },
            { href: "/agents", label: "Agents" },
            { href: "/rpgf", label: "Designer Rewards" },
        ],
    },
    {
        section: "Research",
        links: [
            { href: "/research", label: "Research" },
            { href: "/working-groups", label: "Working Groups" },
            { href: "/kernel", label: "Mechanism" },
            { href: "/invariants", label: "Invariants" },
            { href: "/security", label: "Security" },
            { href: "/data", label: "Evidence" },
            { href: "/data/explore", label: "Data explorer" },
        ],
    },
];

// The marketing mobile drawer. The desktop marketing nav is the section-doorway
// publication row; on mobile that row was the ONLY way in, leaving every page
// behind a doorway reachable only by scrolling to the footer. Grouped like
// `NAV_LINKS_APP_DRAWER` so the whole map is one tap away.
export const NAV_LINKS_MARKETING_DRAWER: NavLink[] = [
    ...MARKETING_MAP.flatMap((group) => [
        { isSectionHeader: true, label: group.section, href: "" } as NavLink,
        ...group.links,
    ]),
    // The app tier — DERIVED (filtered spread), never a hand-copy. Routes the
    // marketing map already lists (e.g. /discover, /orders, /data/explore) are not
    // repeated here.
    { isSectionHeader: true, label: "App", href: "" },
    ...NAV_LINKS_APP_PRIMARY.filter(
        (link) => !MARKETING_MAP.some((g) => g.links.some((l) => l.href === link.href)),
    ),
];
