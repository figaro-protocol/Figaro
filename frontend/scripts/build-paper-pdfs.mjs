#!/usr/bin/env node
// Post-build step: a LaTeX-typeset PDF of every paper, written beside its
// exported page (`<export>/papers/<slug>/<slug>.pdf`) and served there; the
// paper's "Download PDF" link (components/papers/PaperPdfLink.tsx) points at it.
//
// The `/papers/<slug>` page stays the one source. This step reads the page's
// exported HTML, converts it with `paper-latex.mjs` (formulas taken verbatim
// from KaTeX's TeX annotations), renders each SVG figure to a PDF in the
// headless Chromium Playwright ships, and compiles with Tectonic. A browser's
// own print of the page sets KaTeX's formulas outside their sentences in the
// PDF's text layer — the layer referees, preprint servers and scholarly
// indexes read — and a typeset PDF keeps each formula in its sentence.
//
// Runs from the npm `postbuild` hook after prettify-export.mjs, so every
// `npm run build` that produces the site produces its PDFs. Tectonic is a
// prerequisite: without it this step FAILS the build, so the export never
// ships a paper page whose PDF link is dead. The one exemption is the
// Playwright e2e harness build (FIGARO_ALLOW_TEST_HELPERS=1, the build
// next.config.mjs already marks as never a deploy): it skips the step.
//
// Usage: node scripts/build-paper-pdfs.mjs   (cwd = frontend/; the export
// root is the one `next build` records in <distDir>/export-detail.json)

/* global document -- the page.evaluate callbacks below run in the browser, where `document` is the page's */
import { spawn, spawnSync } from "node:child_process";
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir, cpus } from "node:os";
import { extname, join } from "node:path";
import { JSDOM } from "jsdom";
import { chromium } from "@playwright/test";
import { paperExportDir, paperFigureFile, paperSvgFigures, paperToLatex } from "./paper-latex.mjs";

const started = Date.now();

if (process.env.FIGARO_ALLOW_TEST_HELPERS === "1") {
    console.log("[paper-pdfs] skipped: e2e harness build (FIGARO_ALLOW_TEST_HELPERS=1), never a deploy");
    process.exit(0);
}

function fail(message) {
    console.error(`[paper-pdfs] FAILED: ${message}`);
    process.exit(1);
}

let exportDir;
try {
    exportDir = paperExportDir();
} catch (e) {
    fail(e.message);
}
const papersDir = join(exportDir, "papers");

const tectonic = spawnSync("tectonic", ["--version"], { encoding: "utf8" });
if (tectonic.error || tectonic.status !== 0) {
    fail(
        "Tectonic is not on PATH, and the site's paper PDFs are typeset with it. " +
            "Install it (`brew install tectonic`, or the release binary from " +
            "https://github.com/tectonic-typesetting/tectonic/releases) and rebuild.",
    );
}

if (!existsSync(papersDir)) fail(`no papers in the export: ${papersDir} does not exist (run next build first)`);

/** Every exported paper page: a papers/<slug>/index.html carrying the paper shell. */
const papers = readdirSync(papersDir)
    .filter((slug) => {
        const file = join(papersDir, slug, "index.html");
        return existsSync(file) && readFileSync(file, "utf8").includes("paper-header");
    })
    .sort();
if (papers.length === 0) fail(`no paper pages under ${papersDir}`);

const work = mkdtempSync(join(tmpdir(), "figaro-paper-pdfs-"));

// ── 1. LaTeX from each exported page ────────────────────────────────────────
const figureCounts = new Map();
for (const slug of papers) {
    const html = readFileSync(join(papersDir, slug, "index.html"), "utf8");
    const { document } = new JSDOM(html).window;
    mkdirSync(join(work, slug));
    writeFileSync(join(work, slug, `${slug}.tex`), paperToLatex(document));
    figureCounts.set(slug, paperSvgFigures(document).length);
}

// ── 2. Each SVG figure → PDF, in headless Chromium ─────────────────────────
// The page is served straight from the export with its scripts refused: the
// prerendered SVG and the site's CSS are the figure, with no hydration.
const MIME = { ".html": "text/html", ".css": "text/css", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".woff": "font/woff", ".png": "image/png", ".jpg": "image/jpeg" };
const ORIGIN = "http://paper-pdfs.invalid";
const FIGURE_WIDTH_PX = 640;
const withFigures = papers.filter((slug) => figureCounts.get(slug) > 0);
if (withFigures.length > 0) {
    const browser = await chromium.launch();
    try {
        const context = await browser.newContext({ colorScheme: "light" });
        await context.route(`${ORIGIN}/**`, async (route) => {
            const url = new URL(route.request().url());
            let path = join(exportDir, decodeURIComponent(url.pathname));
            if (path.endsWith("/")) path = join(path, "index.html");
            if (!path.startsWith(exportDir) || !existsSync(path) || statSync(path).isDirectory()) return route.fulfill({ status: 404, body: "" });
            if (extname(path) === ".js") return route.fulfill({ status: 200, contentType: "text/javascript", body: "" });
            return route.fulfill({ status: 200, contentType: MIME[extname(path)] ?? "application/octet-stream", body: readFileSync(path) });
        });
        const page = await context.newPage();
        await page.emulateMedia({ media: "screen", colorScheme: "light" });
        for (const slug of withFigures) {
            for (let i = 0; i < figureCounts.get(slug); i++) {
                await page.goto(`${ORIGIN}/papers/${slug}/`, { waitUntil: "load" });
                const box = await page.evaluate(
                    ({ i, width, fn }) => {
                        // eslint-disable-next-line no-new-func
                        const svgFigures = new Function(`return (${fn})`)();
                        const svg = svgFigures(document)[i].querySelector(":scope > svg");
                        const holder = document.createElement("div");
                        holder.style.cssText = `width:${width}px;margin:0;padding:0`;
                        holder.appendChild(svg);
                        document.body.replaceChildren(holder);
                        document.body.style.cssText = "margin:0;padding:0;background:transparent";
                        const r = svg.getBoundingClientRect();
                        return { width: Math.ceil(r.width), height: Math.ceil(r.height) };
                    },
                    { i, width: FIGURE_WIDTH_PX, fn: paperSvgFigures.toString() },
                );
                if (!box.width || !box.height) fail(`${slug}: figure ${i + 1} rendered empty`);
                await page.pdf({
                    path: join(work, slug, paperFigureFile(i)),
                    width: `${box.width}px`,
                    height: `${box.height + 1}px`,
                    margin: { top: "0", right: "0", bottom: "0", left: "0" },
                    pageRanges: "1",
                });
            }
        }
    } finally {
        await browser.close();
    }
}

// ── 3. Typeset with Tectonic ────────────────────────────────────────────────
function compile(slug) {
    return new Promise((done) => {
        const dir = join(work, slug);
        const child = spawn("tectonic", ["--keep-logs", "--chatter", "minimal", `${slug}.tex`], { cwd: dir });
        let output = "";
        child.stdout.on("data", (d) => (output += d));
        child.stderr.on("data", (d) => (output += d));
        child.on("close", (code) => {
            const logFile = join(dir, `${slug}.log`);
            const log = existsSync(logFile) ? readFileSync(logFile, "utf8") : "";
            const missing = [...new Set([...log.matchAll(/Missing character: There is no (.+?) in font/g)].map((m) => m[1]))];
            done({ slug, code, output, missing });
        });
    });
}

const queue = [...papers];
const results = [];
await Promise.all(
    Array.from({ length: Math.max(1, Math.min(4, cpus().length)) }, async () => {
        while (queue.length > 0) results.push(await compile(queue.shift()));
    }),
);

const failures = results.filter((r) => r.code !== 0 || r.missing.length > 0);
if (failures.length > 0) {
    for (const r of failures) {
        console.error(`\n[paper-pdfs] ${r.slug}: ${r.code !== 0 ? `tectonic exited ${r.code}` : `glyphs missing from the font: ${r.missing.join(" ")}`}`);
        if (r.code !== 0) console.error(r.output.split("\n").slice(-40).join("\n"));
    }
    fail(`${failures.length} paper(s) did not typeset; sources kept in ${work}`);
}

// ── 4. Each PDF beside its page ─────────────────────────────────────────────
let bytes = 0;
for (const slug of papers) {
    const pdf = join(papersDir, slug, `${slug}.pdf`);
    copyFileSync(join(work, slug, `${slug}.pdf`), pdf);
    bytes += statSync(pdf).size;
}
rmSync(work, { recursive: true, force: true });
console.log(
    `[paper-pdfs] ${papers.length} paper PDFs (${(bytes / 1024 / 1024).toFixed(1)} MB) in ${papersDir} — ${((Date.now() - started) / 1000).toFixed(1)} s`,
);
