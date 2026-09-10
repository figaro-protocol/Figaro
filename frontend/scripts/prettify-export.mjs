#!/usr/bin/env node
// Post-build pass over the static export: Next.js emits each page as a single
// minified line, which makes every page un-pageable for curl/CLI readers (the
// flagship paper is 1.3MB on one line — line-based tools like head, grep -n,
// sed, and pagers are useless against it). This inserts a newline INSIDE
// BLOCK-LEVEL closing tags (`</p\n>`), never after them: whitespace before an
// end tag's `>` is spec-valid and creates no DOM node, so the hydrated body
// stays byte-identical to React's render — a newline AFTER the tag becomes a
// whitespace text node React never rendered, and every such node is a
// hydration mismatch (React #418/#423) on every page. Inline tags (span, a,
// em, code, …) are never touched — a newline between inline elements renders
// as a space and would corrupt KaTeX output and prose spacing.
//
// Runs automatically via the npm `postbuild` lifecycle hook, so every consumer
// of `npm run build` (manual builds, the Playwright webServer, deploys) serves
// pageable HTML. Resolves the export root exactly as next.config.mjs does.

import { readdirSync, readFileSync, writeFileSync, statSync } from "node:fs";
import { join } from "node:path";

const distDir = join(process.cwd(), process.env.NEXT_DISTDIR || ".next");

// Block-level closing tags safe to break inside (`</p\n>` parses as `</p>`).
const BLOCK_CLOSERS =
    /<\/(p|h[1-6]|section|article|li|ul|ol|table|thead|tbody|tr|blockquote|figure|main|header|footer|nav|aside|title|head|script|style)>/g;

function* htmlFiles(dir) {
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        const st = statSync(full);
        if (st.isDirectory()) {
            // _next holds JS/CSS chunks and build metadata — no page HTML.
            if (entry !== "_next") yield* htmlFiles(full);
        } else if (entry.endsWith(".html")) {
            yield full;
        }
    }
}

let files = 0;
let added = 0;
for (const file of htmlFiles(distDir)) {
    const before = readFileSync(file, "utf8");
    const after = before.replace(BLOCK_CLOSERS, (m) => `${m.slice(0, -1)}\n>`);
    if (after !== before) {
        writeFileSync(file, after);
        files += 1;
        added += after.length - before.length;
    }
}
console.log(`[prettify-export] ${files} pages made line-pageable (+${added} newlines) in ${distDir}`);
