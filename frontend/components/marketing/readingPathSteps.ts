export interface ReadingPathStep {
    /** Which rung of the telling this page belongs to. */
    rung: (typeof READING_PATH_RUNGS)[number];
    href: string;
    label: string;
    /** The one thing this page teaches — a phrase, never a sentence. */
    description: string;
}

/** The four rungs, in reading order: what you can make, why it holds, where you
 *  start, what it changes. */
export const READING_PATH_RUNGS = [
    "What you can build",
    "Why it holds",
    "Where you start",
    "What it changes",
] as const;

/**
 * The site's spine — the reading path the homepage closes with.
 *
 * THE ORDER IS DELIBERATE: BUILD altitude first. A reader meets a thing they
 * could make before the warrant that lets them believe it. Rung 1 is the
 * invitation (clauses, assemblies, composition, the data market as the
 * existence proof, the commons that pays authors, one published shape lived
 * end to end); rung 2 is the warrant — why the mechanism holds; rung 3 is the
 * door; rung 4 is the horizon. /security and /spec sit in the path as the
 * warrant's own evidence and the door itself. /registries stays off-path: it
 * is an explorer reached from the live counts, not a lesson.
 *
 * Each step teaches ONE thing, and labels stay unified with the nav — one
 * canonical name per page. Do not reorder, retitle, or insert a step on probe
 * evidence alone — this order reflects a deliberate choice about what a
 * reader needs first; changing it needs the same level of deliberation, not a
 * single probe result.
 *
 * Step 1 of the reading path is Home itself and is therefore NOT in this array;
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
        rung: "What you can build",
        href: "/clauses",
        label: "Clauses",
        description: "the terms of deals: public building blocks, and how to write one.",
    },
    {
        rung: "What you can build",
        href: "/assemblies",
        label: "Assemblies",
        description: "whole deal-shapes: publish once, reuse anywhere.",
    },
    {
        rung: "What you can build",
        href: "/composition",
        label: "Composition",
        description:
            "how deals compose — with each other, and with the chain's other contracts: swaps, the fiscal multisender, a forum where one is wanted.",
    },
    {
        rung: "What you can build",
        href: "/data",
        label: "Data",
        description: "the record: public map, sealed detail, sold only on its owner's terms.",
    },
    {
        rung: "What you can build",
        href: "/rpgf",
        label: "Rewards for designers",
        description: "how the commons pays its authors: real usage, retroactively.",
    },
    {
        rung: "What you can build",
        href: "/local-commerce",
        label: "Local Commerce",
        description:
            "one deal lived end to end — a meal among unbounded kinds of trade.",
    },
    {
        rung: "Why it holds",
        href: "/kernel",
        label: "Kernel",
        description:
            "how one deal enforces itself: the bonds, the equilibrium, the proof behind \u201ca theorem, not a policy.\u201d",
    },
    {
        rung: "Why it holds",
        href: "/invariants",
        label: "Invariants",
        description: "the kernel's invariants: no admin, no escape hatches, no custodian.",
    },
    {
        rung: "Why it holds",
        href: "/security",
        label: "Security",
        description:
            "testing and code security: six independent benches, and the audit posture stated plainly.",
    },
    {
        rung: "Why it holds",
        href: "/faq",
        label: "FAQ",
        description:
            "what happens when a deal goes wrong, and the other questions worth asking plainly.",
    },
    {
        rung: "Where you start",
        href: "/spec",
        label: "Specifications",
        description:
            "the canonical surface: every contract a permissionless primitive, with the deployment record.",
    },
    {
        rung: "Where you start",
        href: "/members",
        label: "Members",
        description: "any signer: people, businesses, assets with their own wallets.",
    },
    {
        rung: "Where you start",
        href: "/agents",
        label: "Agents",
        description: "software agents on the same footing — operating, authoring, trading.",
    },
    {
        rung: "What it changes",
        href: "/why",
        label: "Why this exists",
        description: "the argument from first principles.",
    },
    {
        rung: "What it changes",
        href: "/working-groups",
        label: "Working Groups",
        description: "the eight disciplines behind the claims.",
    },
    {
        rung: "What it changes",
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
