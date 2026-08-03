export interface ReadingPathStep {
    href: string;
    label: string;
    description: string;
}

/**
 * The five-page reading path — the site's front-door curriculum, first told
 * on the homepage ("Read it in order"). ONE source of truth: the homepage's
 * fuller numbered block (`app/(marketing)/page.tsx`, a server component) and
 * the client `ReadingPathStrip` both render from this array, so the two
 * tellings can never diverge. It lives in this plain module — NOT inside the
 * `"use client"` strip file — because a client module's exports reach server
 * components as unmappable proxies (the homepage prerender throws; only
 * `next build` catches it). Order and copy match the front page's telling
 * verbatim — do not restate the curriculum anywhere else.
 */
export const READING_PATH_STEPS: ReadingPathStep[] = [
    {
        href: "/protocol",
        label: "Protocol",
        description: "how a deal works: the lockbox, the stakes, the one rule.",
    },
    {
        href: "/why",
        label: "Why",
        description: "why it exists: three eras of rule-making, and what the third changes.",
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
