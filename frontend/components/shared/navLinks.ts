// Two nav tiers (per `feedback_two_navs_allowed.md`):
//
// - `NAV_LINKS` is the publication row. Used by:
//     - Marketing tier (only nav)
//     - (app) tier (top row of two-row header)
//   The four entries: Kernel (the substrate), Builders (affordances),
//   Join (membership), Groups (the working groups; the
//   paper corpus is reached through it — papers are discussion starters,
//   and the goal is groups forming worldwide, spontaneously). The
//   logo links home; no "Home" item here.
//
// - `NAV_LINKS_APP_PRIMARY` is the (app) second row, desktop only. Each
//   entry MUST be a protocol surface (a role-bound tool, clause family,
//   or registry), not a product feature. Adding ad-hoc product nav here
//   regresses the protocol-publication discipline (see
//   `feedback_protocol_not_product_ui.md`).
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
    { href: "/kernel", label: "Kernel" },
    { href: "/builders", label: "Builders" },
    { href: "/members", label: "Join" },
    { href: "/working-groups", label: "Groups" },
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
    { href: "/members/manage", label: "Members" },
    { href: "/audit", label: "Audit" },
    // The RPGF distribution's runtime surface (read your accrual, claim a
    // closed tranche) — a protocol surface (the composed UsageCounter +
    // RpgfMinter), not a product feature; claiming is permissionless network
    // participation.
    { href: "/rewards", label: "Rewards" },
    // The wallet's own runtime infrastructure (RPC provider, IPFS node) —
    // actor-neutral, no operator service in the middle.
    { href: "/settings", label: "Endpoints" },
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
 * The marketing map — DERIVED from the `(marketing)` route-group structure,
 * never hand-curated: each doorway's group is exactly one route group's
 * pages — `(explain)` → Kernel, `(contribute)` → Builders, `(surfaces)` →
 * Join, `working-groups/` → Groups (papers are reached through Groups, so
 * they carry no nav entries). Each group's first entry IS its doorway; every
 * other entry follows alphabetically; each label is its page's own
 * `metadata.title` minus the site suffix. Only `(marketing)` routes may
 * appear — cross-tier links belong to their own tier's nav.
 * `scripts/lint-nav-structure.sh` enforces all of this against the tree.
 * ONE source, two renderings: `NavTreeRow` opens each group as a desktop
 * disclosure submenu; `NAV_LINKS_MARKETING_DRAWER` flattens it with section
 * headers.
 */
export const MARKETING_MAP: { section: string; links: NavLink[] }[] = [
    {
        section: "Kernel",
        links: [
            { href: "/kernel", label: "How it works" },
            { href: "/consequences", label: "Consequences" },
            { href: "/faq", label: "FAQ" },
            { href: "/glossary", label: "Glossary" },
            { href: "/physics", label: "Physics" },
            { href: "/security", label: "Security" },
            { href: "/why", label: "Why" },
        ],
    },
    {
        section: "Builders",
        links: [
            { href: "/builders", label: "Builders" },
            { href: "/builders/pitfalls", label: "Sharp edges" },
            { href: "/rpgf", label: "RPGF" },
            { href: "/spec", label: "Specifications" },
        ],
    },
    {
        section: "Join",
        links: [
            { href: "/members", label: "Members" },
            { href: "/agents", label: "Agents" },
            { href: "/assemblies", label: "Assemblies" },
            { href: "/clauses", label: "Clauses" },
            { href: "/composes", label: "Composes" },
            { href: "/data", label: "Your records, your terms" },
            { href: "/local-commerce", label: "Local Commerce" },
        ],
    },
    {
        section: "Groups",
        links: [{ href: "/working-groups", label: "Working Groups" }],
    },
];

// The marketing mobile drawer. The desktop marketing nav is the four-doorway
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
