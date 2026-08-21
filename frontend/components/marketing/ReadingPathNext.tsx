"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { nextReadingPathStep } from "@/components/marketing/readingPathSteps";

/**
 * The reading path's continuation line — ONE link to the next step, at the foot
 * of a page that is on the path. Mounted once in `app/(marketing)/layout.tsx`;
 * no page renders it itself, and no page carries a hand-written "read this
 * next" line.
 *
 * This is SEQUENCE, not wayfinding — the same object PaperLayout's derived
 * prev/next nav is. It stays that object only while all five of its ruled
 * properties hold (maintainer ruling 2026-08-21): derived from
 * READING_PATH_STEPS, exactly ONE link, no blurb, no number, no rung name. If
 * any one of them is ever negotiated away, this has become the trailing
 * link-farm the 2026-08-06 closer-kill removed — delete the file, do not amend
 * it.
 *
 * Renders nothing off the path (lookup pages, papers, Home) and nothing on the
 * last step: absence is the correct end of a reading order.
 *
 * `"use client"` for `usePathname()` — the layout is a server component and the
 * site is a static export, so the pathname is resolved per route at prerender
 * and the line ships inside the exported HTML.
 */
export function ReadingPathNext() {
    const next = nextReadingPathStep(usePathname());
    if (!next) return null;

    return (
        <nav aria-label="Reading path" className="container mx-auto px-6 pb-24 max-w-3xl">
            <p className="border-t border-default pt-6 text-sm text-ink-muted">
                Next in the reading path:{" "}
                <Link href={next.href} className="text-ink-heading hover:underline">
                    {next.label}
                </Link>
            </p>
        </nav>
    );
}
