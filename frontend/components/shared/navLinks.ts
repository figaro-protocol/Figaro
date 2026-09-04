// Two nav tiers (per `feedback_two_navs_allowed.md`):
//
// - `NAV_LINKS` is the publication row. Used by:
//     - Marketing tier (only nav)
//     - (app) tier (top row of two-row header)
//   The six entries are the six doors, one per landing page (Use, Build, Core,
//   Research, Data, Agents), each the doorway of its route group; enforced by
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
}

export const NAV_LINKS: NavLink[] = [
    { href: "/use", label: "Use" },
    { href: "/build", label: "Build" },
    { href: "/core", label: "Core" },
    { href: "/research", label: "Research" },
    { href: "/data", label: "Data" },
    { href: "/agents", label: "Agents" },
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
    // The graphs' query surface — a READING tool for spectators (maintainer-ruled
    // 2026-08-26 to sit here too: mobile is exactly where a spectator stands).
    // Also a Build leaf beside /data in MARKETING_MAP; both listings are the
    // ruled "distinct entry point", not a duplication.
    { href: "/data/explore", label: "Data explorer" },
    // The RPGF distribution's runtime surface (read your accrual, claim a
    // closed period) — a protocol surface (the composed UsageCounter +
    // RpgfMinter), not a product feature; claiming is permissionless network
    // participation.
    { href: "/rewards", label: "Rewards" },
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
 * The marketing map — the site tree, six nav entries, one per landing page:
 * Use `(use)`, Build `(build)`, Core `(core)`, Research `(research)`, Data
 * `(data)`, Agents `(agents)`. Each group's first entry is its doorway, the
 * landing page whose words are the pillar the beta panel reads; the entries
 * after it are the pages that door owns, in reading order, not alphabetical.
 * Labels derive from each page's own `metadata.title` minus the site suffix.
 * The app tier's pages a door opens onto (Discover and Orders under Use, Audit
 * and the data explorer under Data) and the two authoring tools under Build
 * are admitted beside their object pages. `(reference)` is footer chrome,
 * never nav; papers are reached through Working Groups — the corpus has ONE
 * surface. Claim and Join remain buttons on their object's page.
 * `scripts/lint-nav-structure.sh` enforces the mechanical half (doorway-first,
 * set equality against the route tree, label==metadata.title, breadcrumb
 * doorways); section order and names are the maintainer's word.
 * ONE source, two renderings: `NavTreeRow` (desktop disclosure submenus) and
 * `NAV_LINKS_MARKETING_DRAWER` (mobile, flattened with section headers).
 */
export const MARKETING_MAP: { section: string; links: NavLink[] }[] = [
    {
        section: "Use",
        links: [
            { href: "/use", label: "Use" },
            { href: "/members", label: "Members" },
            { href: "/faq", label: "FAQ" },
            { href: "/local-commerce", label: "Local Commerce" },
            { href: "/worked-example", label: "Worked example" },
            { href: "/discover", label: "Discover members" },
            { href: "/orders", label: "Your orders" },
        ],
    },
    {
        section: "Build",
        links: [
            { href: "/build", label: "Build" },
            { href: "/clauses", label: "Clauses" },
            { href: "/clauses/register", label: "Register a clause" },
            { href: "/assemblies", label: "Assemblies" },
            { href: "/assemblies/designer", label: "Designer" },
            { href: "/registries", label: "Registries" },
            { href: "/composition", label: "Composition" },
            { href: "/pitfalls", label: "Sharp edges" },
            { href: "/rpgf", label: "Rewards for designers" },
            { href: "/tokenomics", label: "Tokenomics" },
            { href: "/dao", label: "The DAO" },
        ],
    },
    {
        section: "Core",
        links: [
            { href: "/core", label: "Core" },
            { href: "/kernel", label: "Kernel" },
            { href: "/invariants", label: "Invariants" },
            { href: "/spec", label: "Specifications" },
            { href: "/security", label: "Security" },
        ],
    },
    {
        section: "Research",
        links: [
            { href: "/research", label: "Research" },
            { href: "/working-groups", label: "Working Groups" },
        ],
    },
    {
        section: "Data",
        links: [
            { href: "/data", label: "Data" },
            { href: "/data/yours", label: "Your data" },
            { href: "/attestations", label: "Attestations" },
            { href: "/data/explore", label: "Data explorer" },
            { href: "/audit", label: "Audit" },
        ],
    },
    {
        section: "Agents",
        links: [
            { href: "/agents", label: "Agents" },
            { href: "/agents/how", label: "How agents work" },
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
    // marketing map already lists (e.g. /discover, /orders, /audit under
    // Market) are not repeated here.
    { isSectionHeader: true, label: "App", href: "" },
    ...NAV_LINKS_APP_PRIMARY.filter(
        (link) => !MARKETING_MAP.some((g) => g.links.some((l) => l.href === link.href)),
    ),
];
