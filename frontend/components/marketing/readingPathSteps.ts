interface ReadingPathStep {
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
 * comprehension probes + an expert copy wave). Each step teaches ONE thing, and
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
        label: "How it works",
        description:
            "how one deal enforces itself: the bonds, the equilibrium, the proof behind “a theorem, not a policy.”",
    },
    {
        rung: "One deal",
        href: "/invariants",
        label: "What can never change",
        description: "the kernel's guarantees: no admin, no escape hatches, no custodian.",
    },
    {
        rung: "One deal",
        href: "/faq",
        label: "The hard questions",
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
        href: "/local-commerce",
        label: "A worked example",
        description: "local commerce, end to end — one example among unbounded kinds.",
    },
    {
        rung: "An economy",
        href: "/rpgf",
        // Not "Rewards": the nav already binds that word to /rewards, the
        // (app) claim surface — one screen must not show two different
        // "Rewards" destinations.
        label: "Rewards for authors",
        description: "how the commons pays its authors: real usage, retroactively.",
    },
    {
        rung: "An economy",
        href: "/data",
        label: "The data layer",
        description: "the record: public map, sealed detail, sold only on its owner's terms.",
    },
    {
        rung: "An economy",
        href: "/members",
        label: "Who takes part",
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
        href: "/consequences",
        label: "Consequences",
        description: "what the world looks like if it works.",
    },
];
