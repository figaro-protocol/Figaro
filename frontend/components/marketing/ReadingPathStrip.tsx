"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import { ARGUMENT_TRACK_STEPS, READING_PATH_STEPS } from "./readingPathSteps";

/** The strip's "go deeper" affordance — reference surfaces beyond the
 *  numbered curriculum and the argument track. Not part of either. */
const GO_DEEPER_LINKS: { href: string; label: string }[] = [
    { href: "/data", label: "Data" },
    { href: "/clauses", label: "Clauses" },
    { href: "/assemblies", label: "Assemblies" },
];

/**
 * Footer-adjacent restatement of the reading path, mounted once in
 * `app/(marketing)/layout.tsx` above the `Footer` — every marketing page
 * carries it, not just the homepage. Position indicator is modeled on
 * `PaperLayout`'s prev/next nav: the current step is DERIVED from
 * `usePathname` each render, never stored. A page outside the five steps
 * (e.g. `/data`, reached via "go deeper") renders the same five links with
 * no step highlighted and no "step N of 5" claim — the strip never asserts a
 * position it can't back up.
 *
 * A second, unordered track ("The argument": `ARGUMENT_TRACK_STEPS`) sits
 * below the numbered path — the case for the mechanism's origin and
 * implications rather than the mechanism itself. It carries no position
 * indicator; it is not a sequence.
 */
export function ReadingPathStrip() {
    const pathname = usePathname();
    const currentIndex = READING_PATH_STEPS.findIndex((step) => step.href === pathname);
    const next =
        currentIndex >= 0 && currentIndex < READING_PATH_STEPS.length - 1
            ? READING_PATH_STEPS[currentIndex + 1]
            : null;

    return (
        <nav
            aria-label="Reading path"
            data-testid="reading-path-strip"
            className="border-t border-default bg-canvas"
        >
            <div className="container mx-auto px-6 py-6 max-w-5xl flex flex-col gap-3 text-sm">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className="text-ink-faint" data-testid="reading-path-strip-position">
                            {currentIndex >= 0
                                ? (
                                    <>
                                        Reading path &middot; step {currentIndex + 1} of {READING_PATH_STEPS.length}
                                        {next && <> &middot; next: {next.label}</>}
                                    </>
                                )
                                : "Reading path"}
                            {" "}&mdash;{" "}
                        </span>
                        <span data-testid="reading-path-strip-steps" className="contents">
                            {READING_PATH_STEPS.map((step, i) => (
                                <span key={step.href} className="flex items-center gap-2">
                                    {i > 0 && <span aria-hidden="true" className="text-ink-faint">&rarr;</span>}
                                    <Link
                                        href={step.href}
                                        aria-current={i === currentIndex ? "page" : undefined}
                                        className={
                                            i === currentIndex
                                                ? "text-ink-heading font-medium underline"
                                                : "text-ink-muted hover:underline"
                                        }
                                    >
                                        {step.label}
                                    </Link>
                                </span>
                            ))}
                        </span>
                    </div>
                    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-ink-faint">
                        <span>Go deeper:</span>
                        {GO_DEEPER_LINKS.map((link) => (
                            <Link key={link.href} href={link.href} className="hover:underline hover:text-ink-body">
                                {link.label}
                            </Link>
                        ))}
                    </div>
                </div>
                <div
                    className="flex flex-wrap items-center gap-x-2 gap-y-1 text-ink-faint"
                    data-testid="reading-path-strip-argument-track"
                >
                    <span>The argument:</span>
                    {ARGUMENT_TRACK_STEPS.map((step, i) => (
                        <span key={step.href} className="flex items-center gap-2">
                            {i > 0 && <span aria-hidden="true">&middot;</span>}
                            <Link
                                href={step.href}
                                aria-current={step.href === pathname ? "page" : undefined}
                                className={
                                    step.href === pathname
                                        ? "text-ink-heading font-medium underline"
                                        : "hover:underline hover:text-ink-body"
                                }
                            >
                                {step.label}
                            </Link>
                        </span>
                    ))}
                </div>
            </div>
        </nav>
    );
}
