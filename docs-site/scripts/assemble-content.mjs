#!/usr/bin/env node
// Assembles `content/` — the tree fumadocs compiles — from the repository's
// own documents, at build time.
//
// One owner per document: the markdown stays where it lives (`docs/`, `sdk/`,
// `ecosystem-agents/`) and is never edited here. This script copies each
// source into the ignored `content/` tree, prepends the frontmatter fumadocs
// needs (a sidebar title, the source's own heading as the description, and the
// source path the page shows as its provenance), and rewrites repo-relative
// links so they resolve on the site: to the sibling page when the target is
// itself sourced here, to the file on GitHub otherwise. The site's own pages in
// `site/` (the sidebar map, the index, the security page, the working-groups
// stub) are copied in first; the typedoc output under
// `frontend/public/sdk-api/` is copied into `public/sdk-api/` so the static
// export carries the API reference. Nothing this script writes is committed.
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, posix, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SITE_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const REPO_ROOT = resolve(SITE_ROOT, '..');
const SITE_PAGES = join(SITE_ROOT, 'site');
const CONTENT = join(SITE_ROOT, 'content');
const API_SRC = join(REPO_ROOT, 'frontend', 'public', 'sdk-api');
const API_DEST = join(SITE_ROOT, 'public', 'sdk-api');
const GITHUB_BLOB = 'https://github.com/figaro-protocol/Figaro/blob/main/';

// [source path in the repo, destination under content/, sidebar title].
// The sidebar ORDER is the `meta.json` files under site/; this table only
// binds each document to its page.
const SOURCES = [
    ['docs/LEXICON.md', 'start-here/lexicon.md', 'Lexicon'],
    ['docs/VISION.md', 'start-here/vision.md', 'Vision'],
    ['docs/THEORY.md', 'start-here/theory.md', 'Theory'],
    ['docs/CONTRACTS.md', 'protocol/contracts.md', 'Contracts'],
    ['docs/CLAUSES.md', 'protocol/clauses.md', 'Clauses'],
    ['docs/OPEN_WORLD.md', 'protocol/open-world.md', 'Open world'],
    ['docs/DATA_LAYER.md', 'protocol/data-layer.md', 'Data layer'],
    ['docs/SCALING_STRATEGY.md', 'protocol/scaling.md', 'Scaling'],
    ['docs/VERIFICATION_MAP.md', 'verification/verification-map.md', 'Verification map'],
    ['docs/DESIGN_DECISIONS.md', 'verification/design-decisions.md', 'Design decisions'],
    ['docs/FLORIN_TOKEN.md', 'token/florin.md', 'Florin'],
    ['docs/DESIGNER_REWARDS.md', 'token/designer-rewards.md', 'Designer rewards'],
    ['docs/DAO.md', 'token/dao.md', 'DAO'],
    ['sdk/README.md', 'building/sdk.md', 'SDK'],
    ['ecosystem-agents/README.md', 'building/agents/index.md', 'Agent prompts'],
    ['ecosystem-agents/figaro-operator.md', 'building/agents/operator.md', 'Operator'],
    ['ecosystem-agents/figaro-clause-author.md', 'building/agents/clause-author.md', 'Clause author'],
    ['ecosystem-agents/figaro-assembly-designer.md', 'building/agents/assembly-designer.md', 'Assembly designer'],
    ['ecosystem-agents/figaro-analyst.md', 'building/agents/analyst.md', 'Analyst'],
    ['docs/AI_AGENT_COORDINATION.md', 'building/agent-coordination.md', 'Agent coordination'],
];

/** The site route a content path renders at (`trailingSlash: true`). */
function routeOf(dest) {
    const slug = dest.replace(/\.mdx?$/, '').replace(/(^|\/)index$/, '');
    return slug === '' ? '/' : `/${slug}/`;
}

const byRepoPath = new Map(SOURCES.map(([src, dest]) => [src, routeOf(dest)]));

/** Splits a leading YAML frontmatter block off; only `key: value` lines are read. */
function splitFrontmatter(text) {
    if (!text.startsWith('---\n')) return { fm: {}, body: text };
    const end = text.indexOf('\n---\n', 4);
    if (end === -1) return { fm: {}, body: text };
    const fm = {};
    for (const line of text.slice(4, end).split('\n')) {
        const m = /^([A-Za-z_][A-Za-z0-9_-]*):\s*(.*)$/.exec(line);
        if (m) fm[m[1]] = m[2].trim();
    }
    return { fm, body: text.slice(end + '\n---\n'.length) };
}

const isFence = (line) => /^\s*(```|~~~)/.test(line);

/** Removes the document's leading H1 (fumadocs renders the title) and returns its text. */
function takeH1(body) {
    const lines = body.split('\n');
    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        if (isFence(line)) break;
        const m = /^# (.+)$/.exec(line);
        if (m) {
            lines.splice(i, 1);
            if (lines[i] === '') lines.splice(i, 1);
            return { h1: m[1].trim(), body: lines.join('\n') };
        }
        if (line.trim() !== '') break;
    }
    return { h1: undefined, body };
}

/** Rewrites `[text](relative/path.md#anchor)` links outside fenced code. */
function rewriteLinks(body, srcRepoPath) {
    const srcDir = posix.dirname(srcRepoPath);
    let inFence = false;
    return body
        .split('\n')
        .map((line) => {
            if (isFence(line)) {
                inFence = !inFence;
                return line;
            }
            if (inFence) return line;
            return line.replace(/\]\(([^)\s]+)\)/g, (whole, target) => {
                if (/^(https?:|mailto:|#|\/)/.test(target)) return whole;
                const hash = target.indexOf('#');
                const path = hash === -1 ? target : target.slice(0, hash);
                const anchor = hash === -1 ? '' : target.slice(hash);
                const repoPath = posix.normalize(posix.join(srcDir, path));
                const route = byRepoPath.get(repoPath);
                return route ? `](${route}${anchor})` : `](${GITHUB_BLOB}${repoPath}${anchor})`;
            });
        })
        .join('\n');
}

function frontmatter({ title, description, source }) {
    const lines = ['---', `title: ${JSON.stringify(title)}`];
    if (description) lines.push(`description: ${JSON.stringify(description)}`);
    lines.push(`source: ${JSON.stringify(source)}`, '---', '');
    return lines.join('\n');
}

function assembleDocument([src, dest, title]) {
    const srcPath = join(REPO_ROOT, src);
    if (!existsSync(srcPath)) throw new Error(`assemble-content: source missing: ${src}`);
    const { fm, body: afterFm } = splitFrontmatter(readFileSync(srcPath, 'utf8'));
    const { h1, body: afterH1 } = takeH1(afterFm);
    const body = rewriteLinks(afterH1, src);
    const description = fm.description ?? (h1 && h1 !== title ? h1 : undefined);
    const out = join(CONTENT, dest);
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, frontmatter({ title, description, source: src }) + body);
}

rmSync(CONTENT, { recursive: true, force: true });
cpSync(SITE_PAGES, CONTENT, { recursive: true });
for (const entry of SOURCES) assembleDocument(entry);

if (!existsSync(join(API_SRC, 'index.html'))) {
    throw new Error(`assemble-content: typedoc output missing at ${API_SRC}`);
}
rmSync(API_DEST, { recursive: true, force: true });
mkdirSync(dirname(API_DEST), { recursive: true });
cpSync(API_SRC, API_DEST, { recursive: true });

console.log(`assemble-content: ${SOURCES.length} documents into content/, typedoc into public/sdk-api/`);
