// HTML → LaTeX for one exported paper page (`out/papers/<slug>/index.html`).
//
// The `/papers/<slug>` page is the one source of a paper; this module reads
// the page's statically exported DOM and writes the LaTeX that
// `build-paper-pdfs.mjs` compiles into the paper's PDF. Math is never
// re-derived: `components/papers/Math.tsx` renders through KaTeX, which keeps
// each formula's original TeX in `<annotation encoding="application/x-tex">`,
// and that string is taken verbatim (inline → `$…$`, display → `\[…\]`).
//
// The conversion is pure: it takes a DOM `Document` (jsdom in the build, the
// Vitest jsdom environment in tests) and returns strings. Figures are the one
// input it does not draw — each SVG figure is rendered to PDF by the build's
// Chromium pass and included here by the file name `figureFile(index)` names.
// `paperExportDir` is the one helper that reads the disk, shared by the build
// and by check-paper-pdfs.mjs.

import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

/** The SVG figures of a paper body, in document order. The build renders
 *  exactly these, in this order, so index i here is file i there. Runs in
 *  jsdom and in the build's Chromium page alike. */
export function paperSvgFigures(root) {
    return [...root.querySelectorAll(".paper-body figure")].filter((f) => f.querySelector(":scope > svg"));
}

/** The static export's root: the directory `next build` records in
 *  `<distDir>/export-detail.json` (out/ on a default build), else the dist dir
 *  itself when an e2e build exported into it. */
export function paperExportDir(cwd = process.cwd(), distDir = process.env.NEXT_DISTDIR || ".next") {
    const detail = join(cwd, distDir, "export-detail.json");
    if (existsSync(detail)) return resolve(JSON.parse(readFileSync(detail, "utf8")).outDirectory);
    // An e2e build exports into its own dist dir and records nothing.
    const inPlace = join(cwd, distDir);
    if (existsSync(join(inPlace, "index.html"))) return inPlace;
    throw new Error(`${detail} not found (run next build first)`);
}

/** The file name the build writes figure `index` (0-based) to. */
export function paperFigureFile(index) {
    return `figure-${index + 1}.pdf`;
}

const BLOCK_TAGS = new Set([
    "ADDRESS", "ARTICLE", "ASIDE", "BLOCKQUOTE", "DIV", "DL", "FIGCAPTION", "FIGURE",
    "FOOTER", "H1", "H2", "H3", "H4", "H5", "H6", "HEADER", "HR", "LI", "NAV", "OL",
    "P", "PRE", "SECTION", "TABLE", "UL",
]);

const URL_RE = /https?:\/\/[^\s<>"]+/g;

// Characters the page's prose carries that Latin Modern Roman has no glyph
// for: each is set from the math font or as a text sub/superscript. The build
// fails on any glyph a font lacks, so a new one is added here.
const GREEK = "αβγδεζηθικλμνξπρστυφχψωΓΔΘΛΞΠΣΦΨΩ";
const GREEK_NAMES = [
    "alpha", "beta", "gamma", "delta", "epsilon", "zeta", "eta", "theta", "iota", "kappa", "lambda", "mu",
    "nu", "xi", "pi", "rho", "sigma", "tau", "upsilon", "phi", "chi", "psi", "omega",
    "Gamma", "Delta", "Theta", "Lambda", "Xi", "Pi", "Sigma", "Phi", "Psi", "Omega",
];
const SUBSCRIPTS = "₀₁₂₃₄₅₆₇₈₉ₐₑₒₓₕₖₗₘₙₚₛₜᵢⱼᵣᵤᵥ";
const SUBSCRIPT_PLAIN = "0123456789aeoxhklmnpstijruv";
const SUPERSCRIPTS = "⁰¹²³⁴⁵⁶⁷⁸⁹ⁱⁿ";
const SUPERSCRIPT_PLAIN = "0123456789in";
const TEXT_GLYPH_FALLBACKS = {
    "′": "\\ensuremath{'}",
    "″": "\\ensuremath{''}",
    "□": "\\ensuremath{\\square}",
    "∎": "\\ensuremath{\\QED}",
    "■": "\\ensuremath{\\blacksquare}",
    "→": "\\ensuremath{\\rightarrow}",
    "←": "\\ensuremath{\\leftarrow}",
    "↔": "\\ensuremath{\\leftrightarrow}",
    "⇒": "\\ensuremath{\\Rightarrow}",
    "≤": "\\ensuremath{\\leq}",
    "≥": "\\ensuremath{\\geq}",
    "≠": "\\ensuremath{\\neq}",
    "≈": "\\ensuremath{\\approx}",
    "∈": "\\ensuremath{\\in}",
    "∞": "\\ensuremath{\\infty}",
    ...Object.fromEntries([...GREEK].map((c, i) => [c, `\\ensuremath{\\${GREEK_NAMES[i]}}`])),
    ...Object.fromEntries([...SUBSCRIPTS].map((c, i) => [c, `\\textsubscript{${SUBSCRIPT_PLAIN[i]}}`])),
    ...Object.fromEntries([...SUPERSCRIPTS].map((c, i) => [c, `\\textsuperscript{${SUPERSCRIPT_PLAIN[i]}}`])),
};
const FALLBACK_RE = new RegExp(`[${Object.keys(TEXT_GLYPH_FALLBACKS).join("")}]`, "gu");

/** Escape running text for LaTeX. Whitespace is collapsed (never U+00A0, which
 *  becomes a tie). */
export function escapeLatexText(text) {
    return text
        .replace(/[ \t\n\r\f]+/g, " ")
        .replace(/[\\{}$&#^_~%]/g, (c) => {
            switch (c) {
                case "\\": return "\\textbackslash{}";
                case "^": return "\\textasciicircum{}";
                case "~": return "\\textasciitilde{}";
                default: return `\\${c}`;
            }
        })
        .replace(/\u00a0/g, "~")
        .replace(FALLBACK_RE, (c) => TEXT_GLYPH_FALLBACKS[c]);
}

/** Escape a URL for the argument of `\url`/`\href` (hyperref prints `\#` and
 *  `\%` as `#` and `%`). */
function escapeUrl(url) {
    return url.replace(/[\\{}]/g, "").replace(/[#%&~_^$]/g, (c) => (c === "~" ? "\\~{}" : `\\${c}`));
}

/** Running text with every bare URL set as a breakable `\url`. */
function textToLatex(text) {
    let out = "";
    let last = 0;
    for (const m of text.matchAll(URL_RE)) {
        let url = m[0];
        // Sentence punctuation after a URL is prose, not the URL.
        const trail = url.match(/[.,;:)\]]+$/);
        if (trail) url = url.slice(0, -trail[0].length);
        out += escapeLatexText(text.slice(last, m.index));
        out += `\\url{${escapeUrl(url)}}`;
        last = m.index + url.length;
    }
    return out + escapeLatexText(text.slice(last));
}

/** The TeX KaTeX was given for this `.katex` element. */
export function katexSource(el) {
    const ann = el.querySelector('annotation[encoding="application/x-tex"]');
    if (!ann) throw new Error(`KaTeX element without a TeX annotation: ${el.outerHTML.slice(0, 120)}`);
    return ann.textContent.trim();
}

function hasClass(el, ...names) {
    return names.some((n) => el.classList?.contains(n));
}

function isBlock(node) {
    if (node.nodeType !== 1) return false;
    if (hasClass(node, "katex-display")) return true;
    return BLOCK_TAGS.has(node.tagName);
}

/** Never typeset: screen-only chrome. */
function isSkipped(el) {
    return (
        hasClass(el, "print:hidden", "paper-watermark", "katex-html", "sr-only") ||
        el.getAttribute?.("aria-hidden") === "true" && !hasClass(el, "katex")
    );
}

// ── Inline ──────────────────────────────────────────────────────────────────

function inlineChildren(el, ctx) {
    let out = "";
    for (const child of el.childNodes) out += inlineNode(child, ctx);
    return out;
}

function inlineNode(node, ctx) {
    if (node.nodeType === 3) return textToLatex(node.nodeValue);
    if (node.nodeType !== 1) return "";
    const el = node;
    if (isSkipped(el)) return "";
    if (hasClass(el, "katex-display")) return `\n\\[ ${katexSource(el)} \\]\n`;
    if (hasClass(el, "katex")) return `$${katexSource(el)}$`;
    const inner = () => inlineChildren(el, ctx);
    switch (el.tagName) {
        case "EM":
        case "I":
            return `\\emph{${inner()}}`;
        case "STRONG":
        case "B":
            return `\\textbf{${inner()}}`;
        case "CODE":
            return `\\texttt{${inner()}}`;
        case "SUB":
            return `\\textsubscript{${inner()}}`;
        case "SUP":
            return `\\textsuperscript{${inner()}}`;
        case "BR":
            return "\\newline{}";
        case "svg":
        case "SVG":
            return "";
        case "A": {
            const href = el.getAttribute("href") ?? "";
            const abs = href.startsWith("http") ? href : href.startsWith("/") && ctx.origin ? ctx.origin + href : "";
            const text = inner();
            if (!abs || text.includes("\\url{")) return text;
            return `\\href{${escapeUrl(abs)}}{${text}}`;
        }
        default: {
            if (hasClass(el, "font-semibold", "font-bold")) {
                const body = `\\textbf{${inner()}}`;
                return hasClass(el, "not-italic") ? `\\textup{${body}}` : body;
            }
            if (hasClass(el, "italic")) return `\\textit{${inner()}}`;
            if (isBlock(el)) return blockChildren(el, ctx);
            return inner();
        }
    }
}

// ── Block ───────────────────────────────────────────────────────────────────

function paragraph(latex) {
    const t = latex.replace(/^[ \n]+|[ \n]+$/g, "");
    return t ? `${t}\n\n` : "";
}

/** A container's children: runs of inline nodes become paragraphs, block
 *  children convert on their own. */
function blockChildren(el, ctx) {
    let out = "";
    let run = "";
    for (const child of el.childNodes) {
        if (isBlock(child)) {
            out += paragraph(run);
            run = "";
            out += blockNode(child, ctx);
        } else {
            run += inlineNode(child, ctx);
        }
    }
    return out + paragraph(run);
}

function heading(cmd, el, ctx) {
    const title = inlineChildren(el, ctx).trim();
    const level = cmd === "section" ? "section" : cmd === "subsection" ? "subsection" : "subsubsection";
    return `\\${cmd}*{${title}}\n\\phantomsection\\addcontentsline{toc}{${level}}{${title.replace(/\\\\/g, " ")}}\n\n`;
}

function listMarker(el) {
    const cls = el.getAttribute("class") ?? "";
    if (/\blist-decimal\b/.test(cls)) return { env: "enumerate", label: "\\arabic*." };
    if (/list-\[lower-alpha\]/.test(cls)) return { env: "enumerate", label: "\\alph*." };
    if (/list-\[lower-roman\]/.test(cls)) return { env: "enumerate", label: "\\roman*." };
    if (/\blist-disc\b/.test(cls)) return { env: "itemize", label: "\\textbullet" };
    // No list style class: the page shows no marker (Tailwind's preflight).
    return { env: "itemize", label: "" };
}

function list(el, ctx) {
    const { env, label } = listMarker(el);
    const opts = label ? `label=${label}` : "label={},leftmargin=1.5em";
    let out = `\\begin{${env}}[${opts}]\n`;
    for (const li of el.children) {
        if (li.tagName !== "LI") continue;
        out += `\\item ${blockChildren(li, ctx).trim()}\n`;
    }
    return `${out}\\end{${env}}\n\n`;
}

function table(el, ctx) {
    const rows = [...el.querySelectorAll("tr")];
    if (rows.length === 0) return "";
    const ncols = Math.max(...rows.map((r) => [...r.children].reduce((n, c) => n + Number(c.getAttribute("colspan") ?? 1), 0)));
    const longest = Math.max(...rows.map((r) => r.textContent.replace(/\s+/g, " ").length));
    // Short rows set at natural width; prose cells wrap across the line.
    const wide = longest > 70;
    const spec = wide ? `@{}${"L".repeat(ncols)}@{}` : `@{}${"l".repeat(ncols)}@{}`;
    const head = el.querySelector("thead");
    let out = wide
        ? `\\begin{center}\\small\n\\begin{tabularx}{\\linewidth}{${spec}}\n\\toprule\n`
        : `\\begin{center}\\small\n\\begin{tabular}{${spec}}\n\\toprule\n`;
    rows.forEach((tr, i) => {
        const cells = [...tr.children].map((c) => {
            const body = inlineChildren(c, ctx).replace(/\n+/g, " ").trim();
            const span = Number(c.getAttribute("colspan") ?? 1);
            const strong = c.tagName === "TH" && !hasClass(c, "font-normal") ? `\\textbf{${body}}` : body;
            return span > 1 ? `\\multicolumn{${span}}{${wide ? "L" : "l"}}{${strong}}` : strong;
        });
        out += `${cells.join(" & ")} \\\\\n`;
        if (head && tr.parentElement === head && i === head.querySelectorAll("tr").length - 1) out += "\\midrule\n";
    });
    return `${out}\\bottomrule\n\\end{${wide ? "tabularx" : "tabular"}}\n\\end{center}\n\n`;
}

function figure(el, ctx) {
    const caption = el.querySelector(":scope > figcaption");
    const captionTex = caption ? `\n\\par\\vspace{0.5em}{\\small ${inlineChildren(caption, ctx).trim()}\\par}` : "";
    if (el.querySelector(":scope > svg")) {
        const index = ctx.figures.indexOf(el);
        if (index < 0) throw new Error("SVG figure outside the paper body's figure set");
        return `\\begin{center}\n\\includegraphics[width=\\linewidth,height=0.6\\textheight,keepaspectratio]{${ctx.figureFile(index)}}${captionTex}\n\\end{center}\n\n`;
    }
    // An HTML figure is text: it converts like any block, caption last.
    let body = "";
    for (const child of el.childNodes) if (child !== caption) body += isBlock(child) ? blockNode(child, ctx) : paragraph(inlineNode(child, ctx));
    return `\\begin{center}\n${body.trim()}${captionTex}\n\\end{center}\n\n`;
}

function blockNode(el, ctx) {
    if (el.nodeType !== 1 || isSkipped(el)) return "";
    if (hasClass(el, "katex-display")) return `\\[ ${katexSource(el)} \\]\n\n`;
    switch (el.tagName) {
        case "H1":
        case "H2":
            return heading("section", el, ctx);
        case "H3":
            return heading("subsection", el, ctx);
        case "H4":
        case "H5":
        case "H6":
            return heading("subsubsection", el, ctx);
        case "P":
            return paragraph(inlineChildren(el, ctx));
        case "OL":
        case "UL":
            return list(el, ctx);
        case "TABLE":
            return table(el, ctx);
        case "FIGURE":
            return figure(el, ctx);
        case "PRE":
            return `\\begin{small}\\begin{verbatim}\n${el.textContent.replace(/\n+$/, "")}\n\\end{verbatim}\\end{small}\n\n`;
        case "HR":
            return "\\medskip\\noindent\\rule{\\linewidth}{0.4pt}\\medskip\n\n";
        case "BLOCKQUOTE":
            return `\\begin{quote}\n${blockChildren(el, ctx).trim()}\n\\end{quote}\n\n`;
        case "ASIDE":
            // PaperRemark: a set-off italic aside with an upright bold title.
            return `\\begin{quote}\\small\\itshape\n${blockChildren(el, ctx).trim()}\n\\end{quote}\n\n`;
        default:
            // A ruled block on the page (FormalBlock and its kin) is set off.
            if (hasClass(el, "border-l-2")) return `\\begin{quote}\n${blockChildren(el, ctx).trim()}\n\\end{quote}\n\n`;
            return blockChildren(el, ctx);
    }
}

// ── The paper ───────────────────────────────────────────────────────────────

function plain(el) {
    return (el?.textContent ?? "").replace(/\s+/g, " ").trim();
}

/** The parts of a paper page the LaTeX is built from. */
function readPaper(document) {
    const article = document.querySelector("article");
    const header = article?.querySelector("header.paper-header");
    if (!article || !header) throw new Error("not a paper page: no <article> with a header.paper-header");
    const subtitleEl = header.querySelector("p.italic");
    const [bylineEl, dateEl] = [...header.querySelectorAll("p")].filter((p) => p !== subtitleEl);
    const abstractSection = article.querySelector('section[aria-label="Abstract"]');
    const keywordsEl = [...(abstractSection?.querySelectorAll("p") ?? [])].find((p) => plain(p).startsWith("Keywords:"));
    const canonical =
        document.querySelector('link[rel="canonical"]')?.getAttribute("href") ??
        document.querySelector('meta[property="og:url"]')?.getAttribute("content") ??
        "";
    return {
        article,
        title: header.querySelector("h1"),
        subtitle: subtitleEl,
        byline: bylineEl,
        date: dateEl,
        abstract: abstractSection?.querySelector(":scope > div"),
        keywords: keywordsEl ? plain(keywordsEl).replace(/^Keywords:\s*/, "") : "",
        watermark: plain(article.querySelector(".paper-watermark")),
        body: article.querySelector(".paper-body"),
        references: article.querySelector(".paper-references ol"),
        origin: canonical ? new URL(canonical).origin : "",
    };
}

/**
 * The whole `.tex` source for one exported paper page.
 * @param {Document} document the page's DOM
 * @param {{ figureFile?: (index: number) => string }} [options]
 */
export function paperToLatex(document, { figureFile = paperFigureFile } = {}) {
    const p = readPaper(document);
    if (!p.body) throw new Error("paper page without a .paper-body");
    const ctx = { origin: p.origin, figureFile, figures: paperSvgFigures(document) };
    const inl = (el) => (el ? inlineChildren(el, ctx).trim() : "");
    const header = escapeLatexText(p.watermark || "Preprint");
    const title = inl(p.title);
    const pdfTitle = escapeLatexText(plain(p.title));
    const pdfAuthor = escapeLatexText(plain(p.byline));

    let refs = "";
    if (p.references) {
        for (const li of p.references.children) {
            if (li.tagName === "LI") refs += `\\item ${blockChildren(li, ctx).trim()}\n`;
        }
    }

    return `% Generated from the exported /papers page by frontend/scripts/build-paper-pdfs.mjs.
% The page is the source; edit the page, never this file.
\\documentclass[11pt,a4paper]{article}
\\usepackage{amsmath}
\\usepackage{amssymb}
\\usepackage{fontspec}
\\usepackage{unicode-math}
\\setmathfont{latinmodern-math.otf}
\\usepackage[a4paper,margin=2.5cm,headheight=14pt]{geometry}
\\usepackage{graphicx}
\\usepackage{booktabs}
\\usepackage{tabularx}
\\newcolumntype{L}{>{\\raggedright\\arraybackslash}X}
\\usepackage{enumitem}
\\usepackage{fancyhdr}
\\usepackage{xurl}
\\usepackage[hidelinks,unicode]{hyperref}
\\hypersetup{pdftitle={${pdfTitle}},pdfauthor={${pdfAuthor}},pdfkeywords={${escapeLatexText(p.keywords)}}}
\\pagestyle{fancy}
\\fancyhf{}
\\fancyhead[L]{\\small ${header}}
\\fancyfoot[C]{\\small\\thepage}
\\renewcommand{\\headrulewidth}{0.4pt}
\\setlength{\\parindent}{0pt}
\\setlength{\\parskip}{0.6em}
\\setlist{itemsep=0.2em,topsep=0.4em}
\\emergencystretch=2em
\\AtBeginDocument{\\renewcommand{\\setminus}{\\smallsetminus}}
\\begin{document}
\\thispagestyle{fancy}
\\begin{center}
{\\LARGE\\bfseries ${title}\\par}
${p.subtitle ? `\\vspace{0.6em}{\\large\\itshape ${inl(p.subtitle)}\\par}\n` : ""}\\vspace{1.2em}{${inl(p.byline)}\\par}
${p.date ? `\\vspace{0.3em}{\\small ${inl(p.date)}\\par}\n` : ""}\\end{center}
\\vspace{1em}
\\begin{abstract}
${p.abstract ? blockChildren(p.abstract, ctx).trim() : ""}
${p.keywords ? `\n\\medskip\\noindent\\textbf{Keywords:} ${escapeLatexText(p.keywords)}\n` : ""}\\end{abstract}

${blockChildren(p.body, ctx).trim()}

\\section*{References}
\\phantomsection\\addcontentsline{toc}{section}{References}
\\begin{list}{}{\\setlength{\\leftmargin}{1.5em}\\setlength{\\itemindent}{-1.5em}\\setlength{\\itemsep}{0.3em}\\small}
${refs}\\end{list}
\\end{document}
`;
}
