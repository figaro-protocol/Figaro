import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PaperLayout, PaperRun, PaperSection, PaperSubsection } from "@/components/papers/PaperLayout";
import { Math } from "@/components/papers/Math";
import { escapeLatexText, paperToLatex } from "@/scripts/paper-latex.mjs";

// The converter reads the exported page, so the fixture is the real paper
// shell (PaperLayout) and the real KaTeX render (Math), rendered to static
// markup exactly as the export prerenders them.
function paperDocument(body: React.ReactNode) {
    const html = renderToStaticMarkup(
        <PaperLayout
            slug="not-a-registered-paper"
            title="Bonds & Orders"
            subtitle="A Test Paper"
            author="Figaro"
            date="The paper's date"
            watermark="Figaro Protocol · Preprint"
            abstract={<p>The buyer bonds <Math>{"2P"}</Math> at commit.</p>}
            references={
                <>
                    <li>Coase, R. H. The Nature of the Firm. <em>Economica</em>, 4(16):386&ndash;405, 1937.</li>
                    <li>Solidity Team. Safe Remote Purchase. https://docs.soliditylang.org/en/v0.8.26/solidity-by-example.html#safe-remote-purchase (a living document).</li>
                </>
            }
        >
            {body}
        </PaperLayout>,
    );
    return new DOMParser().parseFromString(`<!doctype html><html><body>${html}</body></html>`, "text/html");
}

describe("paper HTML → LaTeX", () => {
    it("takes each formula's TeX verbatim from KaTeX's annotation, inline and display", () => {
        const tex = paperToLatex(
            paperDocument(
                <PaperSection title="2. The Mechanism">
                    <p>
                        the buyer bonds twice the payment <Math>{"P"}</Math>, and the seller bonds twice the value <Math>{"G \\geq P"}</Math> the process has accumulated.
                    </p>
                    <p>
                        <em>Market with a court.</em> <Math>{"C_M = A + q(k)\\,(L + D) + h(k)"}</Math>: the apparatus a claim presupposes.
                    </p>
                    <p>
                        <Math display>{"\\sum_i b_i \\le 2G"}</Math>
                    </p>
                </PaperSection>,
            ),
        );
        expect(tex).toContain("the buyer bonds twice the payment $P$, and the seller bonds twice the value $G \\geq P$ the process has accumulated.");
        expect(tex).toContain("\\emph{Market with a court.} $C_M = A + q(k)\\,(L + D) + h(k)$: the apparatus a claim presupposes.");
        expect(tex).toContain("\\[ \\sum_i b_i \\le 2G \\]");
        // KaTeX's rendered HTML (the visual copy of each formula) never leaks.
        expect(tex).not.toMatch(/katex|mord|vlist/);
    });

    it("escapes LaTeX specials and keeps decoded entities as text", () => {
        expect(escapeLatexText("R&D costs 50% of $5 #1 a_b {x} ~ ^ \\")).toBe(
            "R\\&D costs 50\\% of \\$5 \\#1 a\\_b \\{x\\} \\textasciitilde{} \\textasciicircum{} \\textbackslash{}",
        );
        const tex = paperToLatex(paperDocument(<p>Buyer&rsquo;s bond &mdash; twice&nbsp;the payment, 1937&ndash;1960 &amp; after.</p>));
        expect(tex).toContain("Buyer’s bond — twice~the payment, 1937–1960 \\& after.");
        expect(tex).toContain("\\begin{center}\n{\\LARGE\\bfseries Bonds \\& Orders\\par}");
    });

    it("sets glyphs the text font lacks from the math font", () => {
        expect(escapeLatexText("(a′) ρ = 2 CO₂ ∎")).toBe("(a\\ensuremath{'}) \\ensuremath{\\rho} = 2 CO\\textsubscript{2} \\ensuremath{\\QED}");
    });

    it("turns sections, subsections, run-in headings and lists into their LaTeX forms", () => {
        const tex = paperToLatex(
            paperDocument(
                <PaperSection title="1. Introduction">
                    <PaperSubsection title="1.1 The Problem">
                        <PaperRun title="Mutual-destruction deposits.">The double deposit predates Ethereum.</PaperRun>
                        <ol className="space-y-2 list-decimal pl-6 text-sm">
                            <li><strong>A model.</strong> The goods are off-chain.</li>
                            <li>A second item.</li>
                        </ol>
                        <ul className="list-disc pl-6">
                            <li>One</li>
                        </ul>
                    </PaperSubsection>
                </PaperSection>,
            ),
        );
        expect(tex).toContain("\\section*{1. Introduction}");
        expect(tex).toContain("\\subsection*{1.1 The Problem}");
        expect(tex).toContain("\\textbf{Mutual-destruction deposits. }The double deposit predates Ethereum.");
        expect(tex).toContain("\\begin{enumerate}[label=\\arabic*.]\n\\item \\textbf{A model.} The goods are off-chain.\n\\item A second item.\n\\end{enumerate}");
        expect(tex).toContain("\\begin{itemize}[label=\\textbullet]\n\\item One\n\\end{itemize}");
    });

    it("writes the front matter, the preprint header and the references", () => {
        const tex = paperToLatex(paperDocument(<p>Body.</p>));
        expect(tex).toContain("\\documentclass[11pt,a4paper]{article}");
        expect(tex).toContain("\\fancyhead[L]{\\small Figaro Protocol · Preprint}");
        expect(tex).toContain("{\\large\\itshape A Test Paper\\par}");
        expect(tex).toContain("{Figaro · Claude (Anthropic)\\par}");
        expect(tex).toContain("\\begin{abstract}\nThe buyer bonds $2P$ at commit.");
        expect(tex).toContain("\\section*{References}");
        expect(tex).toContain("\\item Coase, R. H. The Nature of the Firm. \\emph{Economica}, 4(16):386–405, 1937.");
        // A bare URL is a breakable \url; its '#' is escaped and the closing
        // parenthesis of the prose stays outside it.
        expect(tex).toContain(
            "\\url{https://docs.soliditylang.org/en/v0.8.26/solidity-by-example.html\\#safe-remote-purchase} (a living document).",
        );
        // Screen chrome is not typeset.
        expect(tex).not.toContain("Download PDF");
    });

    it("includes each SVG figure by the file the build renders it to, with its caption as text", () => {
        const tex = paperToLatex(
            paperDocument(
                <figure>
                    <svg viewBox="0 0 10 10" role="img">
                        <title>t</title>
                        <rect width="10" height="10" />
                    </svg>
                    <figcaption>The chain of <Math>{"n"}</Math> orders.</figcaption>
                </figure>,
            ),
        );
        expect(tex).toContain("\\includegraphics[width=\\linewidth,height=0.6\\textheight,keepaspectratio]{figure-1.pdf}");
        expect(tex).toContain("{\\small The chain of $n$ orders.\\par}");
    });

    it("sets a table with a header rule and math cells", () => {
        const tex = paperToLatex(
            paperDocument(
                <table>
                    <thead>
                        <tr>
                            <th className="font-normal"><Math>{"(u_b, u_s)"}</Math></th>
                            <th>resolution occurs</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>performance occurs</td>
                            <td><Math>{"(0,\\; +P)"}</Math></td>
                        </tr>
                    </tbody>
                </table>,
            ),
        );
        expect(tex).toContain("\\begin{tabular}{@{}ll@{}}\n\\toprule\n$(u_b, u_s)$ & \\textbf{resolution occurs} \\\\\n\\midrule\nperformance occurs & $(0,\\; +P)$ \\\\\n\\bottomrule");
    });

    it("sets a prose table so it can break across pages, its header repeated, and a spanning cell across its columns", () => {
        const tex = paperToLatex(
            paperDocument(
                <table>
                    <thead>
                        <tr>
                            <th>Step</th>
                            <th>Dispatch race</th>
                            <th>Request for quotes</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>5. Select and sign</td>
                            <td>The buyer signs the first valid answer, and that signature is the selection.</td>
                            <td>The buyer signs the cheapest verified answer at the close.</td>
                        </tr>
                        <tr>
                            <td>6. Admission</td>
                            <td colSpan={2}>The commitment, with both signatures, is submitted.</td>
                        </tr>
                    </tbody>
                </table>,
            ),
        );
        // A page-breaking table: the header rows end at \endhead and print again on each page.
        expect(tex).toContain("\\begin{xltabular}{\\linewidth}{@{}LLL@{}}\n\\toprule\n\\textbf{Step} & \\textbf{Dispatch race} & \\textbf{Request for quotes} \\\\\n\\midrule\n\\endhead\n");
        // The spanning cell is as wide as the two columns it covers, and keeps the table's flush right edge.
        expect(tex).toContain("6. Admission & \\multicolumn{2}{>{\\raggedright\\arraybackslash\\hsize=\\dimexpr 2\\hsize+2\\tabcolsep\\relax}X@{}}{The commitment, with both signatures, is submitted.} \\\\\n\\bottomrule\n\\end{xltabular}");
        expect(tex).toContain("\\usepackage{xltabular}");
    });

    it("shields a row that opens with a parenthesis or a bracket, which a rule or a row end would read as its own option", () => {
        const tex = paperToLatex(
            paperDocument(
                <table>
                    <thead>
                        <tr>
                            <th className="font-normal">(buyer, seller)</th>
                            <th>resolution occurs, and every bond is refunded</th>
                            <th>no resolution, and every bond stays locked</th>
                        </tr>
                    </thead>
                    <tbody>
                        <tr>
                            <td>[performance occurs]</td>
                            <td>the seller is paid</td>
                            <td>nobody is paid</td>
                        </tr>
                    </tbody>
                </table>,
            ),
        );
        expect(tex).toContain("\\toprule\n{}(buyer, seller) & ");
        expect(tex).toContain("\\endhead\n{}[performance occurs] & ");
    });

    it("sets a bold paragraph bold, and a block span inside a paragraph as a paragraph of its own", () => {
        const tex = paperToLatex(
            paperDocument(
                <PaperSection title="3. The Frame">
                    <div className="border-l-2 border-default pl-6 my-3 space-y-3">
                        <p className="text-sm font-semibold text-ink-heading">Definition 1 (The committed schedule).</p>
                        <p>At commit, each order locks its bonds.</p>
                    </div>
                    <p>
                        The share is a ratio, never an identity.
                        <span className="block mt-2">Two properties bound that share.</span>
                    </p>
                </PaperSection>,
            ),
        );
        expect(tex).toContain("\\textbf{Definition 1 (The committed schedule).}\n\nAt commit, each order locks its bonds.");
        expect(tex).toContain("The share is a ratio, never an identity.\n\nTwo properties bound that share.");
    });

    it("sets headings ragged right, so none is hyphenated, and leaves no single line of a paragraph alone on a page", () => {
        const tex = paperToLatex(paperDocument(<p>Text.</p>));
        expect(tex).toContain("\\allsectionsfont{\\raggedright}");
        expect(tex).toContain("\\widowpenalty=10000");
        expect(tex).toContain("\\clubpenalty=10000");
    });
});
