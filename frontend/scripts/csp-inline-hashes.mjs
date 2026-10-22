#!/usr/bin/env node
// Post-build pass over the static export: every page names the SHA-256 of each inline script
// it ships in a Content-Security-Policy <meta>, first in its head. The static export has no
// server to mint a per-request nonce, and Cloudflare's `_headers` cannot carry a per-page list
// (100 rules, 2,000 characters a line), so the header policy keeps `'unsafe-inline'` and this
// page policy narrows it: a browser enforces both, so an inline script runs only when its
// hash is listed — an injected one matches none. Frontend invariant S-4.
//
// Runs in the npm `postbuild` lifecycle after the prettify pass (whose newline sits inside the
// closing tag, never in a script's body), and again over the site's export after the docs-site
// is copied under /docs (work/deploy/site-build.sh). Idempotent: a page's policy is replaced,
// never stacked.
//
// Usage: node scripts/csp-inline-hashes.mjs [dir]   (default: NEXT_DISTDIR, where an e2e export
//        lands, else `out/`, where a production export lands)

import { createHash } from "node:crypto";
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const SCRIPT = /<script(\s[^>]*)?>([\s\S]*?)<\/script\s*>/g;
const POLICY_META = /<meta http-equiv="Content-Security-Policy" content="[^"]*"\/>/g;

const hashOf = (body) => `'sha256-${createHash("sha256").update(body, "utf8").digest("base64")}'`;

/** The page with its inline-script policy written first in its head. */
export function withInlineScriptPolicy(html) {
    if (!html.includes("<head>")) return html;
    const bare = html.replace(POLICY_META, "");
    const hashes = new Set();
    for (const [, attrs = "", body] of bare.matchAll(SCRIPT)) {
        if (/\ssrc\s*=/.test(attrs)) continue;
        hashes.add(hashOf(body));
    }
    const policy = ["script-src 'self' 'wasm-unsafe-eval'", ...[...hashes].sort()].join(" ");
    return bare.replace("<head>", `<head><meta http-equiv="Content-Security-Policy" content="${policy}"/>`);
}

function* htmlFiles(dir) {
    for (const entry of readdirSync(dir)) {
        const full = join(dir, entry);
        if (statSync(full).isDirectory()) yield* htmlFiles(full);
        else if (entry.endsWith(".html")) yield full;
    }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const dir = process.argv[2] ?? join(process.cwd(), process.env.NEXT_DISTDIR || "out");
    let pages = 0;
    for (const file of htmlFiles(dir)) {
        const html = readFileSync(file, "utf8");
        const out = withInlineScriptPolicy(html);
        if (out !== html) writeFileSync(file, out);
        pages++;
    }
    console.log(`[csp-inline-hashes] ${pages} pages carry their inline-script policy (${dir})`);
}
