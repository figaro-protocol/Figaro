#!/usr/bin/env node
// Checks the text layer of every built paper PDF (build-paper-pdfs.mjs) —
// the layer referees, preprint servers and scholarly indexes read — for the
// one failure the typeset PDF exists to prevent: an inline formula falling
// out of its sentence.
//
//   1. Canonical cases: transaction-scoped-institutions §2 ("the buyer bonds
//      twice the payment P, and the seller bonds twice the value G ≥ P …") and
//      §5 ("Market with a court. C_M = …: the apparatus …") read in order.
//   2. Every inline <Math> of every paper: the words before it and the words
//      after it, taken from the exported page, are found in the PDF's text
//      with the formula's own text between them — never side by side (a
//      formula-shaped hole) and never missing.
//   3. No ". :"-style gap (punctuation, a space, punctuation) anywhere.
//
// The text layer is read with pypdf (`python3 -I`). Text is compared in a
// canonical form: NFKC (math italic 𝑃 → P), whitespace and hyphens removed
// (line breaks and hyphenation), the running header and page numbers dropped.
//
// Usage: node scripts/check-paper-pdfs.mjs   (cwd = frontend/, after a build)

import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { JSDOM } from "jsdom";
import { katexSource, paperExportDir } from "./paper-latex.mjs";

const papersDir = join(paperExportDir(), "papers");
const slugs = readdirSync(papersDir)
    .filter((s) => existsSync(join(papersDir, s, "index.html")) && readFileSync(join(papersDir, s, "index.html"), "utf8").includes("paper-header"))
    .sort();

const missingPdf = slugs.filter((s) => !existsSync(join(papersDir, s, `${s}.pdf`)));
if (missingPdf.length > 0) {
    console.error(`[check-paper-pdfs] FAILED: no PDF for ${missingPdf.join(", ")}`);
    process.exit(1);
}

// ── The text layer, one pypdf pass over every PDF ───────────────────────────
const PY = `
import json, sys, pypdf
out = {}
for path in sys.argv[1:]:
    out[path] = [p.extract_text() or "" for p in pypdf.PdfReader(path).pages]
print(json.dumps(out))
`;
const pdfPaths = slugs.map((s) => join(papersDir, s, `${s}.pdf`));
const py = spawnSync("python3", ["-I", "-c", PY, ...pdfPaths], { encoding: "utf8", maxBuffer: 256 * 1024 * 1024 });
if (py.status !== 0) {
    console.error(`[check-paper-pdfs] FAILED: pypdf could not read the PDFs (python3 -I with pypdf installed is required)\n${py.stderr}`);
    process.exit(1);
}
const pages = JSON.parse(py.stdout);

const canon = (s) => s.normalize("NFKC").replace(/[\s­\-‐‑]/g, "");

/** The PDF's running text: header line and page-number lines removed. */
function pdfText(path, header) {
    const h = canon(header);
    return pages[path]
        .map((t) =>
            t
                .split("\n")
                .filter((line) => canon(line) !== h && !/^\s*\d+\s*$/.test(line))
                .join("\n"),
        )
        .join("\n");
}

// ── Inline formulas and the words around them, from the page ───────────────
const INLINE = "\u0000";
const DISPLAY = "\u0001";

/** A block's text with each inline formula as INLINE and each display as DISPLAY. */
function sentinelText(node, formulas) {
    if (node.nodeType === 3) return node.nodeValue;
    if (node.nodeType !== 1) return "";
    if (node.classList.contains("katex-display")) return DISPLAY;
    if (node.classList.contains("katex")) {
        formulas.push(katexSource(node));
        return INLINE;
    }
    let s = "";
    for (const c of node.childNodes) s += sentinelText(c, formulas);
    return s;
}

const CONTEXT = 14; // canonical characters of sentence on each side
function contexts(document) {
    const out = [];
    let skipped = 0;
    const blocks = [...document.querySelectorAll("article p, article li, article td, article th, article figcaption")].filter(
        (b) => !b.querySelector("p, li, td, th") && b.querySelector(".katex") && !b.closest(".print\\:hidden"),
    );
    for (const block of blocks) {
        const formulas = [];
        const parts = sentinelText(block, formulas).split(/(\u0000|\u0001)/);
        let f = 0;
        for (let i = 1; i < parts.length; i += 2) {
            if (parts[i] !== INLINE) continue;
            const tex = formulas[f++];
            const before = canon(parts[i - 1]).slice(-CONTEXT);
            const after = canon(parts[i + 1] ?? "").slice(0, CONTEXT);
            // A formula against another formula, or at a block edge, has no
            // sentence text on that side to anchor it.
            if (before.length < 6 || after.length < 6) {
                skipped++;
                continue;
            }
            out.push({ tex, before, after });
        }
    }
    return { contexts: out, skipped };
}

/** Where the formula sits in the PDF's canonical text. */
function locate(text, { tex, before, after }) {
    const window = Math.max(40, 3 * canon(tex).length + 24);
    let hole = false;
    for (let at = text.indexOf(before); at >= 0; at = text.indexOf(before, at + 1)) {
        const end = at + before.length;
        const next = text.indexOf(after, end);
        if (next === end) hole = true;
        else if (next > end && next - end <= window) return "ok";
    }
    return hole ? "hole" : "missing";
}

// ── Run ─────────────────────────────────────────────────────────────────────
let failed = false;
const report = [];

for (const slug of slugs) {
    const html = readFileSync(join(papersDir, slug, "index.html"), "utf8");
    const { document } = new JSDOM(html).window;
    const header = document.querySelector(".paper-watermark")?.textContent ?? "";
    const raw = pdfText(join(papersDir, slug, `${slug}.pdf`), header);
    const text = canon(raw);

    const { contexts: cs, skipped } = contexts(document);
    const bad = [];
    for (const c of cs) {
        const where = locate(text, c);
        if (where !== "ok") bad.push({ ...c, where });
    }
    // A punctuation pair the page itself writes ("Inc.,") is prose; one the
    // page writes with a formula between ("court. <Math>:") is a hole.
    const pageText = canon(sentinelText(document.querySelector("article"), []));
    const gaps = [...raw.replace(/\s+/g, " ").matchAll(/\S{2}[.,;:] [.,;:](?= |$)/g)]
        .map((m) => m[0])
        .filter((g) => !pageText.includes(canon(g)));
    report.push(`${slug}: ${cs.length} inline formulas checked${skipped ? ` (${skipped} beside another formula or a block edge, not anchored)` : ""}`);
    for (const b of bad) report.push(`  ${b.where.toUpperCase()}: …${b.before} [${b.tex}] ${b.after}…`);
    for (const g of gaps) report.push(`  GAP: "${g}"`);
    if (bad.length > 0 || gaps.length > 0) failed = true;
}

// The canonical cases, quoted from the text layer.
const tsi = "transaction-scoped-institutions";
if (slugs.includes(tsi)) {
    const path = join(papersDir, tsi, `${tsi}.pdf`);
    const raw = pdfText(path, "Figaro Protocol · Preprint");
    const text = canon(raw);
    const cases = [
        ["§2", "the buyer bonds twice the payment", "the buyer bonds twice the payment P, and the seller bonds twice the value G ≥ P the process has accumulated"],
        ["§5", "Market with a court.", "Market with a court. C_M = A + φ + q(k)(L + D) + h(k): the apparatus a claim presupposes"],
    ];
    for (const [where, start, expected] of cases) {
        const want = canon(expected.replace("C_M", "CM"));
        const ok = text.includes(want);
        const at = raw.indexOf(start);
        const quoted = at >= 0 ? raw.slice(at, at + expected.length + 30).replace(/\s+/g, " ") : "(not found)";
        report.push(`${tsi} ${where}: ${ok ? "in its sentence" : "OUT OF ITS SENTENCE"} — "${quoted}"`);
        if (!ok) failed = true;
    }
} else {
    report.push(`${tsi}: not in the export — the canonical cases were not checked`);
    failed = true;
}

console.log(report.join("\n"));
if (failed) {
    console.error(`\n[check-paper-pdfs] FAILED`);
    process.exit(1);
}
console.log(`\n[check-paper-pdfs] ${slugs.length} paper PDFs: every anchored inline formula sits in its sentence`);
