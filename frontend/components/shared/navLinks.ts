// Two nav tiers (per `feedback_two_navs_allowed.md`):
//
// - `NAV_LINKS` is the publication row. Used by:
//     - Marketing tier (only nav)
//     - (app) tier (top row of two-row header)
//   Protocol (how it works) and Research (the disciplines, the papers,
//   the working groups). The logo links home; no "Home" item here.
//
// - `NAV_LINKS_APP_PRIMARY` is the (app) second row, desktop only. Each
//   entry MUST be a protocol surface (a role-bound tool, schema family,
//   or registry), not a product feature. Adding ad-hoc product nav here
//   regresses the protocol-publication discipline (see
//   `feedback_protocol_not_product_ui.md`).
//
// - `NAV_LINKS_APP_DRAWER` is the (app) mobile drawer — combined
//   publication + reference + transactional surfaces, grouped by
//   section. Marketing drawer uses NAV_LINKS only.
export interface NavLink {
    href: string;
    label: string;
    description?: string;
    isSectionHeader?: boolean;
}

export const NAV_LINKS: NavLink[] = [
    { href: "/protocol", label: "Protocol" },
    { href: "/research", label: "Research" },
];

// Every entry below MUST be a route that lives in `app/(app)/`. The
// (marketing) ↔ (app) split is enforced by the route group, not by judgment.
// `ls app/(app)/*/page.tsx` is the audit. If a route is in
// `app/(marketing)/`, do NOT add it here — it belongs in `NAV_LINKS`.
//
// The first two entries (Orders, Inbox) are the consumer's primary
// surfaces — buyer's order list and merchant's incoming-orders inbox.
// They precede the protocol-tier surfaces (Builders, Terminal, etc.) so a
// participant who already has a wallet connected has a one-click path to
// "their" work.
export const NAV_LINKS_APP_PRIMARY: NavLink[] = [
    { href: "/orders", label: "Orders" },
    { href: "/inbox", label: "Inbox" },
    { href: "/builders", label: "Builders" },
    { href: "/terminal", label: "Terminal" },
    { href: "/operators", label: "Operators" },
    { href: "/fig", label: "FIG token" },
];

export const NAV_LINKS_APP_DRAWER: NavLink[] = [
    { isSectionHeader: true, label: "Publication", href: "" },
    ...NAV_LINKS,
    { isSectionHeader: true, label: "App", href: "" },
    { href: "/orders", label: "Orders" },
    { href: "/inbox", label: "Inbox" },
    { href: "/builders", label: "Builders" },
    { href: "/terminal", label: "Terminal" },
    { href: "/operators", label: "Operators" },
    { href: "/fig", label: "FIG token" },
];
