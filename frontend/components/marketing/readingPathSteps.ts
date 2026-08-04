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
 * `/why` sits at step 3, AFTER the lived example (`/local-commerce`) rather
 * than before it — the conviction content lands once the reader has seen a
 * deal, not before. This position is deliberate and distinct from `/why`'s
 * old placement in the (now two-item) argument track below.
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
        href: "/why",
        label: "Why",
        description: "why it exists: three eras of rule-making, and what the third changes.",
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
 * "step N of" claim is made for this track. `/why` moved into the numbered
 * spine (above); this track is now Physics + Consequences.
 */
export const ARGUMENT_TRACK_STEPS: ReadingPathStep[] = [
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
