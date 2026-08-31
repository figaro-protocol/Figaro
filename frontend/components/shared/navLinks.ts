// Two nav tiers (per `feedback_two_navs_allowed.md`):
//
// - `NAV_LINKS` is the publication row. Used by:
//     - Marketing tier (only nav)
//     - (app) tier (top row of two-row header)
//   The five entries are the ruled protocol-object sections (maintainer
//   2026-08-07, enforced by scripts/lint-nav-structure.sh): Build,
//   The Deal, Market, Participants, Research — full tree in the
//   MARKETING_MAP docstring below. The logo links home; no "Home" item here.
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
    { href: "/spec", label: "Build" },
    { href: "/kernel", label: "The Deal" },
    { href: "/discover", label: "Market" },
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
// (Build, Terminal, etc.) so a participant who already has a wallet
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
 * The marketing map — the ruled site tree (maintainer, 2026-08-07), five nav
 * entries: Build (`(compose)` + `(rewards)` + `(spec)`, one flat list of pages),
 * The Deal `(deal)`, Market (the all-bridge group carrying the app
 * tier's e-commerce tools),
 * Participants `(participants)`, Research `(research)`. Each group's first
 * PAGE entry is its doorway; entry ORDER within a group is the ruled
 * reading order, not alphabetical.
 *
 * SECTION ORDER is the maintainer's word, not machine-enforced —
 * `lint-nav-structure.sh` checks doorway-first, set equality, and
 * label==metadata.title, never the order of the sections themselves. Build
 * leads and The Deal follows it (maintainer, 2026-08-24, safe→build
 * reorientation on the 2026-08-22 USP ratification): the first doorway a
 * visitor meets resolves to a build object, and the warrant section answers a
 * question they have just acquired a reason to ask. The same ruling renamed
 * the section "Builders" → "Build" — a verb, not an audience noun (the
 * `/builders` hub was deleted for being an audience carve; do not re-grow one).
 * Labels derive from each page's own `metadata.title` minus the site suffix.
 * `(reference)` (Glossary) is footer chrome, never nav; papers are
 * reached through Working Groups (RE-RULED 2026-08-21: a /papers index was
 * briefly built off a misread "Fix" and deleted the same day — the corpus has
 * ONE surface, /working-groups; do not rebuild the index). Build leads
 * with Specifications (maintainer-ruled 2026-08-21). /local-commerce and /faq are nav-visible
 * under The Deal (maintainer, 2026-08-07) on the standing condition that the
 * rest of the site stays demoted — the meal is one worked example among
 * many, never THE model. The two AUTHORING tools (Register a clause,
 * Designer) are nav leaves under Build, each beside its object page
 * (SUPERSEDING ruling, maintainer 2026-08-25: the maintainer could not find
 * the designer — a build-first site whose composing surfaces hide behind an
 * inline sentence contradicts its own orientation; the seam is emphasized,
 * in nav AND as a CTA on each object page). The data explorer
 * (`/data/explore`, the (app)-tier graph-query surface) is the third such
 * leaf, beside its own object page (maintainer-ruled 2026-08-26) — same
 * shape: the concept page explains the data layer, the tool queries it.
 * Claim and Join remain buttons on their object's page, never nav slots. `scripts/lint-nav-structure.sh` enforces the mechanical half of this
 * (doorway-first, set equality against the route tree, label==metadata.title,
 * and breadcrumb doorways) — section order and section names are the
 * maintainer's word, checked by review.
 * ONE source, two renderings: `NavTreeRow` (desktop disclosure submenus) and
 * `NAV_LINKS_MARKETING_DRAWER` (mobile, flattened with section headers).
 */
export const MARKETING_MAP: { section: string; links: NavLink[] }[] = [
    {
        section: "Build",
        links: [
            { href: "/spec", label: "Specifications" },
            { href: "/clauses", label: "Clauses" },
            { href: "/clauses/register", label: "Register a clause" },
            { href: "/assemblies", label: "Assemblies" },
            { href: "/assemblies/designer", label: "Designer" },
            { href: "/worked-example", label: "Worked example" },
            { href: "/registries", label: "Registries" },
            { href: "/composition", label: "Composition" },
            { href: "/data", label: "Data" },
            { href: "/data/explore", label: "Data explorer" },
            { href: "/pitfalls", label: "Sharp edges" },
            { href: "/security", label: "Security" },
            { href: "/rpgf", label: "Rewards for designers" },
            // The (rewards) group is THREE pages, one per concept, in reading
            // order: the reward is the reason a reader asks what it is paid in,
            // and the supply is where they meet the treasury holding three
            // tenths of it. Rewards owns the PROGRAM (how use becomes a
            // reward), Tokenomics owns the TOKEN (supply, who holds what), The
            // DAO owns the BOOTSTRAP (what the treasury is for, how it earns,
            // how it ends). None re-derives another's subject.
            { href: "/tokenomics", label: "Tokenomics" },
            { href: "/dao", label: "The DAO" },
        ],
    },
    {
        section: "The Deal",
        links: [
            { href: "/kernel", label: "Kernel" },
            { href: "/local-commerce", label: "Local Commerce" },
            { href: "/invariants", label: "Invariants" },
            { href: "/faq", label: "FAQ" },
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
        section: "Participants",
        links: [
            { href: "/members", label: "Members" },
            { href: "/agents", label: "Agents" },
        ],
    },
    {
        section: "Research",
        links: [
            { href: "/why", label: "Why this exists" },
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
    // The app tier — DERIVED (filtered spread), never a hand-copy. Routes the
    // marketing map already lists (e.g. /discover, /orders, /audit under
    // Market) are not repeated here.
    { isSectionHeader: true, label: "App", href: "" },
    ...NAV_LINKS_APP_PRIMARY.filter(
        (link) => !MARKETING_MAP.some((g) => g.links.some((l) => l.href === link.href)),
    ),
];
