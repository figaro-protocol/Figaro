export interface ReadingPathStep {
    /** Which rung of the telling this page belongs to. */
    rung: (typeof READING_PATH_RUNGS)[number];
    href: string;
    label: string;
    /** The one thing this page teaches — a phrase, never a sentence. */
    description: string;
}

/** The three rungs, in reading order: one deal, many deals, the world they meet. */
export const READING_PATH_RUNGS = ["One deal", "An economy", "The world"] as const;

/**
 * The site's spine — the reading path the homepage closes with.
 *
 * THE ORDER IS THE RULING (probe-validated 2026-08-21, four rounds of blind
 * comprehension probes + an expert copy wave; REORDERED same day by maintainer
 * ruling on the eight-probe full-site baseline, citing this comment: the worked
 * example follows the mechanism, and the hard questions follow a deal seen to
 * succeed — labels unified with the nav, one canonical name per page). Each
 * step teaches ONE thing, and
 * each rung earns the next: a single deal that enforces itself, then what many
 * such deals compose into, then how those economies meet the institutions that
 * already exist. Do not reorder, retitle, or insert a step on probe evidence
 * alone — reopening this requires a maintainer ruling that cites this comment.
 *
 * Step 1 of the ruled path is Home itself and is therefore NOT in this array;
 * a page does not link to itself. Steps are deliberately UNNUMBERED in the
 * rendering — order is positional (a visible "2." at the top of a list reads
 * as a bug, not a ruling).
 *
 * This is a plain module, NOT a `"use client"` file: a client module's exports
 * reach server components as unmappable proxies, and the homepage is a server
 * component (the prerender throws; only `next build` catches it).
 *
 * The nav (`components/shared/navLinks.ts`) is a different object — doorways
 * grouped by protocol surface. This is a curriculum in reading order. Neither
 * derives from the other; do not merge them. The path renders on `/` ONLY:
 * never mirror it into `Footer.tsx` (the one-wayfinding-surface ruling killed
 * site-map columns) or into the nav, and the rung names stay confined to the
 * homepage section — never in nav labels, breadcrumbs, or page headers.
 */
export const READING_PATH_STEPS: ReadingPathStep[] = [
    {
        rung: "One deal",
        href: "/kernel",
        label: "Kernel",
        description:
            "how one deal enforces itself: the bonds, the equilibrium, the proof behind \u201ca theorem, not a policy.\u201d",
    },
    {
        rung: "One deal",
        href: "/local-commerce",
        label: "Local Commerce",
        description:
            "one deal lived end to end — a meal among unbounded kinds of trade.",
    },
    {
        rung: "One deal",
        href: "/invariants",
        label: "Invariants",
        description: "the kernel's invariants: no admin, no escape hatches, no custodian.",
    },
    {
        rung: "One deal",
        href: "/faq",
        label: "FAQ",
        description:
            "what happens when a deal goes wrong, and the other questions worth asking plainly.",
    },
    {
        rung: "An economy",
        href: "/clauses",
        label: "Clauses",
        description: "the terms of deals: public building blocks, and how to write one.",
    },
    {
        rung: "An economy",
        href: "/assemblies",
        label: "Assemblies",
        description: "whole deal-shapes: publish once, reuse anywhere.",
    },
    {
        rung: "An economy",
        href: "/rpgf",
        label: "Rewards for authors",
        description: "how the commons pays its authors: real usage, retroactively.",
    },
    {
        rung: "An economy",
        href: "/data",
        label: "Data",
        description: "the record: public map, sealed detail, sold only on its owner's terms.",
    },
    {
        rung: "An economy",
        href: "/members",
        label: "Members",
        description: "any signer: people, businesses, assets with their own wallets.",
    },
    {
        rung: "An economy",
        href: "/agents",
        label: "Agents",
        description: "software agents on the same footing — operating, authoring, trading.",
    },
    {
        rung: "The world",
        href: "/composition",
        label: "Composition",
        description:
            "how deals compose — with each other, and with the chain's other contracts: forums, swaps, the fiscal multisender.",
    },
    {
        rung: "The world",
        href: "/why",
        label: "Why this exists",
        description: "the argument from first principles.",
    },
    {
        rung: "The world",
        href: "/working-groups",
        label: "Working Groups",
        description: "the eight disciplines behind the claims.",
    },
    {
        rung: "The world",
        href: "/consequences",
        label: "Consequences",
        description: "what the world looks like if it works.",
    },
];

/**
 * The step that FOLLOWS `pathname` on the path, or `null` when there is none —
 * the page is off the path (a lookup surface, a paper, Home) or it is the last
 * step. The only source of continuation: never hand-author a "read this next"
 * line on a page (that is the trailing link-farm the 2026-08-06 rulings killed).
 *
 * `trailingSlash: true` in next.config.mjs, so a pathname may arrive as
 * `/kernel/`; the array holds bare hrefs.
 */
export function nextReadingPathStep(pathname: string | null): ReadingPathStep | null {
    if (!pathname) return null;
    const normalized = pathname.length > 1 ? pathname.replace(/\/+$/, "") : pathname;
    const index = READING_PATH_STEPS.findIndex((step) => step.href === normalized);
    if (index === -1) return null;
    return READING_PATH_STEPS[index + 1] ?? null;
}
