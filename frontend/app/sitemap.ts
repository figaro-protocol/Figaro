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

// Publication surface — the `(marketing)/` tier plus the two `(builders)/`
// tools that are crawlable landings (they read walletlessly and enumerate
// live registry state).
//
// Deliberately NOT emitted, and why:
//   - Query-param app views (`/orders/view?process=`, `/audit/view?process=`,
//     `/s/view?seller=`, `/s/checkout?seller=`, `/builders/designer/edit?slug=`,
//     `/builders/designer/view?slug=`): the id is an open-world value unknowable
//     at build time, so there is no enumerable URL set to publish.
//   - `/builders/designer/new`: a per-instance authoring form, not a document.
//   - The `/members/{identity,catalogue,assemblies,agents,review}` and
//     `/members/edit/*` steps: interior states of the `/members` enrolment
//     wizard, entered from it and meaningless as landings.
//   - Wallet-personal surfaces (`/orders`, `/rewards`, `/settings`, `/sign`,
//     `/audit`): what they render is scoped to the connected wallet, so the
//     crawlable URL carries no content.
//   - `/evidence-display`: a deliberate orphan — the iframe target for a
//     recognised arbitration forum, with a `frame-ancestors` override in
//     `public/_headers`. Nothing in-app links it by design.
const PUBLIC_ROUTES: Entry[] = [
    { path: "/", changeFrequency: "weekly", priority: 1.0 },
    { path: "/kernel", changeFrequency: "weekly", priority: 0.9 },
    { path: "/why", changeFrequency: "weekly", priority: 0.9 },
    { path: "/physics", changeFrequency: "weekly", priority: 0.9 },
    { path: "/working-groups", changeFrequency: "weekly", priority: 0.9 },
    { path: "/spec", changeFrequency: "weekly", priority: 0.9 },
    { path: "/security", changeFrequency: "weekly", priority: 0.9 },
    { path: "/builders/pitfalls", changeFrequency: "weekly", priority: 0.8 },
    { path: "/glossary", changeFrequency: "monthly", priority: 0.7 },
    { path: "/consequences", changeFrequency: "monthly", priority: 0.7 },
    { path: "/join", changeFrequency: "weekly", priority: 0.9 },
    { path: "/data", changeFrequency: "monthly", priority: 0.8 },
    { path: "/builders", changeFrequency: "weekly", priority: 0.9 },
    { path: "/composes", changeFrequency: "monthly", priority: 0.7 },
    { path: "/builders/designer", changeFrequency: "weekly", priority: 0.7 },
    { path: "/builders/clauses", changeFrequency: "weekly", priority: 0.7 },
    { path: "/agents", changeFrequency: "weekly", priority: 0.8 },
    { path: "/local-commerce", changeFrequency: "weekly", priority: 0.8 },
    { path: "/rpgf", changeFrequency: "monthly", priority: 0.7 },
    { path: "/clauses", changeFrequency: "weekly", priority: 0.7 },
    { path: "/assemblies", changeFrequency: "weekly", priority: 0.7 },
    { path: "/members", changeFrequency: "weekly", priority: 0.7 },
    { path: "/discover", changeFrequency: "weekly", priority: 0.6 },
];

/**
 * Paper URLs are DERIVED from `PAPER_GROUPS` — the same source the `/papers`
 * listing renders from — never a hand list, so a paper added to a discipline
 * is crawlable without touching this file.
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
    return [...PUBLIC_ROUTES, ...paperRoutes()].map(
        ({ path, changeFrequency, priority }) => ({
            url: `${SITE_URL}${path}`,
            lastModified,
            changeFrequency,
            priority,
        }),
    );
}
