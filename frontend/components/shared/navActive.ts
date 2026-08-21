// "You are here" for the nav tiers. ONE route-matching rule, shared by the
// desktop tree (`NavTreeRow`) and the mobile drawer (`MobileNav`) so the two
// renderings of the same map cannot disagree about which entry holds the
// reader. Extracted from `MobileNav`'s inline `isActive`; no second copy.
//
// trailingSlash: true (next.config.mjs) — usePathname() reports "/orders/"
// for the "/orders" nav entry, so every comparison strips the trailing slash.
const stripSlash = (p: string) => (p.length > 1 && p.endsWith("/") ? p.slice(0, -1) : p);

/**
 * The `aria-current` value an href earns on the current route, or `undefined`
 * when it earns none. The return value IS the attribute — one rule, no
 * per-call-site re-derivation:
 *
 *   - `"page"` — exact match. Only ever ONE entry per rendering (WAI-ARIA:
 *     `page` means "this link IS the page you are on").
 *   - `"true"` — the route lives BENEATH the href (`/members/manage` under
 *     `/members`). The entry is the current item in the set without being the
 *     current page; this is what lights a section doorway.
 */
export function navCurrent(pathname: string, href: string): "page" | "true" | undefined {
    const p = stripSlash(pathname);
    const h = stripSlash(href);
    if (p === h) return "page";
    return p.startsWith(`${h}/`) ? "true" : undefined;
}
