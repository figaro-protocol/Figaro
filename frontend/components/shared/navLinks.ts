// Two nav tiers (per `feedback_two_navs_allowed.md`):
//
// - `NAV_LINKS` is the publication row. Used by:
//     - Marketing tier (only nav)
//     - (app) tier (top row of two-row header)
//   The three entries: Protocol (the substrate), Builders (affordances),
//   Users (participation via /discover). The logo links home; no "Home"
//   item here.
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
//   `MARKETING_MAP` (which the footer renders as columns). Same grouped shape
//   as the (app) drawer.
export interface NavLink {
    href: string;
    label: string;
    description?: string;
    isSectionHeader?: boolean;
}

export const NAV_LINKS: NavLink[] = [
    { href: "/protocol", label: "Protocol" },
    { href: "/builders", label: "Builders" },
    { href: "/users", label: "Users" },
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
    // interchangeable with `/sellers`, which is the seller's own registration
    // surface (register a wallet in MembersRegistry, or manage that entry). Both
    // read a registry; they serve opposite roles, so both are listed.
    { href: "/discover", label: "Discover" },
    { href: "/sellers", label: "Sellers" },
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
 * The marketing map — the canonical section→pages structure of the `(marketing)`
 * tier, grouped under the three publication doorways (each group's first entry
 * IS its doorway). ONE source, two renderings: `Footer` lays each group out as a
 * column; `NAV_LINKS_MARKETING_DRAWER` flattens it with section headers. Add a
 * marketing page here and both surfaces carry it.
 */
export const MARKETING_MAP: { section: string; links: NavLink[] }[] = [
    {
        section: "Protocol",
        links: [
            { href: "/protocol", label: "Protocol mechanisms" },
            { href: "/why", label: "Why" },
            { href: "/physics", label: "Physics" },
            { href: "/cryptoeconomics", label: "Cryptoeconomics" },
            { href: "/papers", label: "Papers" },
            { href: "/security", label: "Security" },
            { href: "/spec", label: "Specifications" },
        ],
    },
    {
        section: "Builders",
        links: [
            { href: "/builders", label: "Builders" },
            { href: "/builders/designer", label: "Designer" },
            { href: "/builders/clauses", label: "Register a clause" },
            { href: "/builders/composability", label: "Composability" },
            { href: "/clauses", label: "Clauses" },
            { href: "/assemblies", label: "Assemblies" },
            { href: "/local-commerce", label: "Local Commerce reference" },
            { href: "/integrate", label: "Integrate" },
            { href: "/clause-rewards", label: "Clause rewards" },
            { href: "/papers/florin-schelling-point-token", label: "florin token" },
        ],
    },
    {
        section: "Users",
        links: [
            { href: "/users", label: "Users" },
            { href: "/discover", label: "Discover sellers" },
            { href: "/sellers", label: "Sellers" },
            { href: "/agents", label: "Agents" },
        ],
    },
];

// The marketing mobile drawer. The desktop marketing nav is the three-doorway
// publication row; on mobile that row was the ONLY way in, leaving every page
// behind a doorway reachable only by scrolling to the footer. Grouped like
// `NAV_LINKS_APP_DRAWER` so the whole map is one tap away.
export const NAV_LINKS_MARKETING_DRAWER: NavLink[] = MARKETING_MAP.flatMap((group) => [
    { isSectionHeader: true, label: group.section, href: "" },
    ...group.links,
]);
