import type { MetadataRoute } from "next";
import { PAPER_GROUPS } from "@/app/(marketing)/_lib/paperGroups";

// Set NEXT_PUBLIC_SITE_URL in deployment env (e.g. https://figaro.org).
// Falls back to a placeholder so build does not fail in dev.
const SITE_URL =
    process.env.NEXT_PUBLIC_SITE_URL?.replace(/\/$/, "") ||
    "https://figaro.example";

type Entry = {
    path: string;
    changeFrequency: MetadataRoute.Sitemap[number]["changeFrequency"];
    priority: number;
};

// Publication surface — the `(marketing)/` tier, the two `(tools)/` tools
// that are crawlable landings (they read walletlessly and enumerate live
// registry state), and the `(app)`-tier landings the nav/footer advertises
// (`/orders`, `/audit`, `/rewards`, `/members/manage`): each is a real,
// linked landing that prerenders a walletless-readable shell, so the
// sitemap must agree with the nav in both directions — a nav-listed page
// absent here is the drift the 2026-08-07 blind probe flagged.
//
// Drift audit for this hand list (papers are derived below):
//   cd frontend && find app -name page.tsx | sort
// Every route in that listing is either present here or enumerated in the
// deliberately-NOT-emitted set:
//   - Query-param app views (`/orders/view?process=`, `/audit/view?process=`,
//     `/s/view?seller=`, `/s/checkout?seller=`, `/sign?payload=`,
//     `/assemblies/designer/edit?slug=`, `/assemblies/designer/view?slug=`):
//     the id is an open-world value unknowable at build time, so there is no
//     enumerable URL set to publish.
//   - `/assemblies/designer/new`: a per-instance authoring form, not a document.
//   - The `/members/{identity,catalogue,assemblies,buyer,endpoints,agents,review}`
//     and `/members/edit/*` steps: interior states of the `/members` enrolment
//     wizard, entered from it and meaningless as landings.
//   - `/evidence-display`: a deliberate orphan — the iframe target for a
//     recognised arbitration forum, with a `frame-ancestors` override in
//     `public/_headers`. Nothing in-app links it by design.
const PUBLIC_ROUTES: Entry[] = [
    { path: "/", changeFrequency: "weekly", priority: 1.0 },
    { path: "/kernel", changeFrequency: "weekly", priority: 0.9 },
    { path: "/why", changeFrequency: "weekly", priority: 0.9 },
    { path: "/invariants", changeFrequency: "weekly", priority: 0.9 },
    { path: "/working-groups", changeFrequency: "weekly", priority: 0.9 },
    { path: "/spec", changeFrequency: "weekly", priority: 0.9 },
    { path: "/security", changeFrequency: "weekly", priority: 0.9 },
    { path: "/pitfalls", changeFrequency: "weekly", priority: 0.8 },
    { path: "/glossary", changeFrequency: "monthly", priority: 0.7 },
    { path: "/consequences", changeFrequency: "monthly", priority: 0.7 },
    { path: "/members", changeFrequency: "weekly", priority: 0.9 },
    { path: "/data", changeFrequency: "monthly", priority: 0.8 },
    // The data explorer: an (app)-tier surface, but a nav-listed, crawlable
    // landing that reads walletlessly — the same case as /registries.
    { path: "/data/explore", changeFrequency: "daily", priority: 0.7 },
    { path: "/faq", changeFrequency: "monthly", priority: 0.8 },
    { path: "/composition", changeFrequency: "monthly", priority: 0.7 },
    { path: "/assemblies/designer", changeFrequency: "weekly", priority: 0.7 },
    { path: "/clauses/register", changeFrequency: "weekly", priority: 0.7 },
    { path: "/agents", changeFrequency: "weekly", priority: 0.8 },
    { path: "/local-commerce", changeFrequency: "weekly", priority: 0.8 },
    { path: "/rpgf", changeFrequency: "monthly", priority: 0.7 },
    { path: "/clauses", changeFrequency: "weekly", priority: 0.7 },
    { path: "/assemblies", changeFrequency: "weekly", priority: 0.7 },
    { path: "/worked-example", changeFrequency: "weekly", priority: 0.7 },
    { path: "/registries", changeFrequency: "daily", priority: 0.7 },
    { path: "/discover", changeFrequency: "weekly", priority: 0.6 },
    // (app)-tier landings the nav/footer lists. What each renders in detail
    // is scoped to the connected wallet, but the page itself is a linked,
    // walletless-readable landing describing its surface.
    { path: "/orders", changeFrequency: "weekly", priority: 0.5 },
    { path: "/audit", changeFrequency: "weekly", priority: 0.5 },
    { path: "/rewards", changeFrequency: "weekly", priority: 0.5 },
    { path: "/members/manage", changeFrequency: "weekly", priority: 0.5 },
];

/**
 * Paper URLs are DERIVED from `PAPER_GROUPS` — the same source the
 * /working-groups page renders from (the corpus is unbounded, so that page IS
 * the papers index; no /papers listing exists) — never a hand list, so a paper
 * added to a discipline is crawlable without touching this file.
 *
 * A `PaperRef.href` is either a `/papers/<slug>` page route or a path to a
 * PDF for a paper still authored in LaTeX; only the page routes are emitted
 * (a PDF is a static asset, not a page).
 */
function paperRoutes(): Entry[] {
    const seen = new Set<string>();
    const routes: Entry[] = [];
    for (const group of PAPER_GROUPS) {
        for (const paper of group.papers) {
            if (!paper.href.startsWith("/papers/")) continue;
            if (paper.href.endsWith(".pdf")) continue;
            if (seen.has(paper.href)) continue;
            seen.add(paper.href);
            routes.push({
                path: paper.href,
                changeFrequency: "monthly",
                priority: 0.6,
            });
        }
    }
    return routes;
}

export default function sitemap(): MetadataRoute.Sitemap {
    const lastModified = new Date();
    // trailingSlash: true (next.config.mjs): the canonical form of every
    // route is the slash-terminated one the static hosts actually serve —
    // the sitemap must publish that form, not the redirecting one.
    return [...PUBLIC_ROUTES, ...paperRoutes()].map(
        ({ path, changeFrequency, priority }) => ({
            url: path === "/" ? `${SITE_URL}/` : `${SITE_URL}${path}/`,
            lastModified,
            changeFrequency,
            priority,
        }),
    );
}
