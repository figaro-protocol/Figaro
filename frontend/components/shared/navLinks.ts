// Two nav tiers (per `feedback_two_navs_allowed.md`):
//
// - `NAV_LINKS` is the publication row. Used by:
//     - Marketing tier (only nav)
//     - (app) tier (top row of two-row header)
//   The seven entries are the ruled protocol-object sections: The Deal,
//   Market, Clauses & Assemblies, Participants, Rewards, Specifications,
//   Research (papers are reached through Working Groups — discussion
//   starters). The logo links home; no "Home" item here.
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
    { href: "/kernel", label: "The Deal" },
    { href: "/discover", label: "Market" },
    { href: "/clauses", label: "Builders" },
    { href: "/members", label: "Participants" },
    { href: "/why", label: "Research" },
];

// Every entry below MUST be a route that lives in `app/(app)/`. The
// (marketing) ↔ (app) split is enforced by the route group, not by judgment.
// `ls app/(app)/*/page.tsx` is the audit. If a route is in
// `app/(marketing)/`, do NOT add it here — it belongs in `NAV_LINKS`.
//
// The first entry (Orders) is the consumer's primary surface — the wallet's
// single actor-neutral order list (every order it's on as buyer OR seller,
// plus anything awaiting its action). It precedes the protocol-tier surfaces
// (Builders, Terminal, etc.) so a participant who already has a wallet
// connected has a one-click path to "their" work.
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
    // The RPGF distribution's runtime surface (read your accrual, claim a
    // closed tranche) — a protocol surface (the composed UsageCounter +
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
 * The marketing map — the ruled site tree (operator, 2026-08-07), five nav
 * entries: The Deal `(deal)`, Market (the all-bridge group carrying the app
 * tier's e-commerce tools), Builders (`(compose)` + `(rewards)` + `(spec)`, one flat list of pages),
 * Participants `(participants)`, Research `(research)`. Each group's first
 * PAGE entry is its doorway; entry ORDER within a group is the ruled
 * reading order, not alphabetical.
 * Labels derive from each page's own `metadata.title` minus the site suffix.
 * `(reference)` (FAQ, Glossary) is footer chrome, never nav; papers are
 * reached through Working Groups; /local-commerce is DEMOTED — linked from
 * /kernel as a worked example, never a nav entry. Tools (Register a clause,
 * Designer, Claim, Join) are buttons on their object's page, never nav
 * slots. `scripts/lint-nav-structure.sh` enforces all of this.
 * ONE source, two renderings: `NavTreeRow` (desktop disclosure submenus) and
 * `NAV_LINKS_MARKETING_DRAWER` (mobile, flattened with section headers).
 */
export const MARKETING_MAP: { section: string; links: NavLink[] }[] = [
    {
        section: "The Deal",
        links: [
            { href: "/kernel", label: "How it works" },
            { href: "/invariants", label: "Invariants" },
            { href: "/data", label: "Data" },
        ],
    },
    {
        section: "Market",
        links: [
            { href: "/discover", label: "Discover members" },
            { href: "/orders", label: "Your orders" },
            { href: "/audit", label: "Audit" },
        ],
    },
    {
        section: "Builders",
        links: [
            { href: "/clauses", label: "Clauses" },
            { href: "/assemblies", label: "Assemblies" },
            { href: "/composition", label: "Composition" },
            { href: "/rpgf", label: "RPGF" },
            { href: "/spec", label: "Specifications" },
            { href: "/pitfalls", label: "Sharp edges" },
            { href: "/security", label: "Security" },
        ],
    },
    {
        section: "Participants",
        links: [
            { href: "/members", label: "Members" },
            { href: "/agents", label: "Agents" },
        ],
    },
    {
        section: "Research",
        links: [
            { href: "/why", label: "Why" },
            { href: "/working-groups", label: "Working Groups" },
            { href: "/consequences", label: "Consequences" },
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
    // The app tier, announced on marketing mobile exactly as the footer's App
    // column announces it on desktop — DERIVED (filtered spread), never a
    // hand-copy. Routes the marketing map already lists (e.g. /discover,
    // /members/manage under Users) are not repeated here.
    { isSectionHeader: true, label: "App", href: "" },
    ...NAV_LINKS_APP_PRIMARY.filter(
        (link) => !MARKETING_MAP.some((g) => g.links.some((l) => l.href === link.href)),
    ),
];
