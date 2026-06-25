import "katex/dist/katex.min.css";
import type { ReactNode } from "react";
import { PrintButton } from "./PrintButton";
import { BackToTop } from "./BackToTop";

interface PaperLayoutProps {
    title: string;
    subtitle?: string;
    author: string;
    /** Standing co-author credit, rendered after `author`. Defaults to the AI
     *  co-author; pass "" to suppress on a paper with no AI contribution. */
    coauthor?: string;
    date: string;
    abstract: ReactNode;
    keywords?: string;
    /** Diagonal print-only watermark text. Shown on every printed page, hidden on screen. */
    watermark?: string;
    children: ReactNode;
    references: ReactNode;
}

/**
 * Document-format shell for a prose paper rendered as a page. Screen view is a
 * single readable column; the print path (PrintButton → window.print()) exports
 * it to PDF with the watermark and pagination from the `paper-*` rules in
 * globals.css. The page itself is the source of truth — there is no `.tex` and
 * no committed `.pdf`.
 */
export function PaperLayout({
    title,
    subtitle,
    author,
    coauthor = "Claude (Anthropic)",
    date,
    abstract,
    keywords,
    watermark = "Figaro Protocol · Preprint",
    children,
    references,
}: PaperLayoutProps) {
    return (
        <article className="container mx-auto px-6 pt-16 pb-24 max-w-[46rem]">
            <div aria-hidden className="paper-watermark">
                {watermark}
            </div>

            <div className="print:hidden mb-8 flex justify-end">
                <PrintButton />
            </div>

            <header className="paper-header mb-10 border-b border-default pb-8">
                <h1 className="text-heading-h1 text-ink-heading leading-tight">{title}</h1>
                {subtitle && (
                    <p className="text-body-lead text-ink-muted italic mt-3">{subtitle}</p>
                )}
                <p className="text-sm text-ink-body mt-5">
                    {author}
                    {coauthor ? ` · ${coauthor}` : ""}
                </p>
                <p className="text-sm text-ink-faint">{date}</p>
            </header>

            <section className="mb-12 border-l-2 border-default pl-6" aria-label="Abstract">
                <h2 className="text-xs font-semibold uppercase tracking-wide text-ink-faint mb-3">
                    Abstract
                </h2>
                <div className="text-sm text-ink-muted leading-relaxed space-y-3">{abstract}</div>
                {keywords && (
                    <p className="text-xs text-ink-faint mt-5">
                        <span className="font-semibold">Keywords:</span> {keywords}
                    </p>
                )}
            </section>

            <div className="paper-body text-base text-ink-body leading-relaxed space-y-6">
                {children}
            </div>

            <section className="paper-references mt-14 border-t border-default pt-8">
                <h2 className="text-heading-h3 text-ink-heading mb-4">References</h2>
                <ol className="space-y-2 text-sm text-ink-body leading-relaxed list-none pl-0">
                    {references}
                </ol>
            </section>

            <BackToTop />
        </article>
    );
}

/** Run-in section heading inside a paper body. */
export function PaperSection({ id, title, children }: { id?: string; title: string; children: ReactNode }) {
    return (
        <section id={id} className="space-y-4">
            <h2 className="text-heading-h2 text-ink-heading mt-4">{title}</h2>
            {children}
        </section>
    );
}

/** Numbered subsection heading inside a paper section. */
export function PaperSubsection({ title, children }: { title: string; children: ReactNode }) {
    return (
        <section className="space-y-4">
            <h3 className="text-heading-h3 text-ink-heading mt-6">{title}</h3>
            {children}
        </section>
    );
}

/** Bold run-in subheading (LaTeX \paragraph equivalent). */
export function PaperRun({ title, children }: { title: string; children: ReactNode }) {
    return (
        <p>
            <span className="font-semibold text-ink-heading">{title} </span>
            {children}
        </p>
    );
}

/** Set-off remark / aside. */
export function PaperRemark({ title, children }: { title: string; children: ReactNode }) {
    return (
        <aside className="paper-remark border-l-2 border-default pl-4 text-sm text-ink-muted italic">
            <span className="font-semibold not-italic text-ink-body">{title} </span>
            {children}
        </aside>
    );
}
