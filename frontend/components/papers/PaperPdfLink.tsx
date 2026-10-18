import { buttonVariants } from "@/components/ui/Button";

/**
 * The paper's typeset PDF, served beside its page at
 * `/papers/<slug>/<slug>.pdf`. The site build writes it from this page's own
 * export (scripts/build-paper-pdfs.mjs: LaTeX with each formula's TeX taken
 * from KaTeX, compiled by Tectonic), so the page stays the one source and the
 * PDF's text layer keeps every formula inside its sentence. A reader who
 * prints the page instead still gets the print stylesheet in globals.css.
 */
export function PaperPdfLink({ slug }: { slug: string }) {
    return (
        <a
            href={`/papers/${slug}/${slug}.pdf`}
            download
            className={buttonVariants({ variant: "outline", size: "sm" })}
        >
            Download PDF
        </a>
    );
}
