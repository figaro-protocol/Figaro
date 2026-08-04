export interface ReadingPathStep {
    href: string;
    label: string;
    description: string;
}

/**
 * The five-page reading path — the site's front-door curriculum. Rendered by
 * `ReadingPathStrip`, mounted once in `app/(marketing)/layout.tsx` above the
 * footer on every marketing page; the homepage points at it with a single
 * demoted sentence rather than restating it. It lives in this plain module —
 * NOT inside the `"use client"` strip file — because a client module's
 * exports reach server components as unmappable proxies (the homepage
 * prerender throws; only `next build` catches it). Do not restate the
 * curriculum anywhere else.
 *
 * THE SPINE'S SHAPE IS FINAL (ruled 2026-08-04, close of the probe cycle).
 * Across three blind expert runs the /why placement cycled full circle —
 * run-8 said take it off the spine, run-9 said insert it after the lived
 * example, run-10 (with it inserted) said take it off again. Both placements
 * carry a real cost; expert-driven flipping is the wrong methodology for a
 * taste decision. The ruling: the numbered path is ALL-CONCRETE (mechanism →
 * lived deal → risks → participation) and /why LEADS "The argument" track
 * beside it. Do not move /why again on probe evidence alone — reopening this
 * requires an operator ruling that cites this comment.
 */
export const READING_PATH_STEPS: ReadingPathStep[] = [
    {
        href: "/protocol",
        label: "Protocol",
        description: "how a deal works: the lockbox, the stakes, the one rule.",
    },
    {
        href: "/local-commerce",
        label: "Local commerce",
        description: "one deal, lived: a meal ordered, cooked, carried, and settled.",
    },
    {
        href: "/security",
        label: "Security",
        description: "what can go wrong, answered plainly — and how to verify any deal yourself.",
    },
    {
        href: "/users",
        label: "Users",
        description: "take part: buy something, or offer something.",
    },
];

/**
 * "The argument" — the second track alongside the numbered path: the case
 * for the mechanism's origin and its implications, rather than the
 * mechanism itself. Same shape as `READING_PATH_STEPS` but unordered — no
 * "step N of" claim is made for this track. /why leads it (see the spine
 * ruling above).
 */
export const ARGUMENT_TRACK_STEPS: ReadingPathStep[] = [
    {
        href: "/why",
        label: "Why",
        description: "why it exists: three eras of rule-making, and what the third changes.",
    },
    {
        href: "/physics",
        label: "Physics",
        description: "the boundary, read four ways: holds, couples, emerges, admits.",
    },
    {
        href: "/consequences",
        label: "Consequences",
        description: "the project's own pre-release ethical analysis.",
    },
];
