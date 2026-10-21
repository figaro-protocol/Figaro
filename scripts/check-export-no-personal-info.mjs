#!/usr/bin/env node
// check-export-no-personal-info.mjs — NOTHING THE SITE SHIPS CARRIES PERSONAL INFORMATION.
//
// Frontend invariant S-0: no email, name or other personal identifier leaves the project in
// the bundle, in any token inside it, or in a document it publishes. Run over the export
// before every upload (work/deploy/site-build.sh) and over the documents the repository pins
// (clauses/, agreements/, assemblies/, members/).
//
// What it reads, in every text file under the given directories:
//   - every email-shaped string in the plain text;
//   - every JWT-shaped string, decoded (header and payload), for an email-shaped value or a
//     personal field name anywhere in its JSON;
//   - the maintainer's private token list (.claude/personal-identity.tokens), when present.
//
// One known exception: the testnet pinning key, whose payload carries the account's email.
// It is reissued from a non-personal account before the flip (docs/RELEASE_READINESS.md
// § "Public on testnet", item 5). It passes only while the export's robots.txt disallows
// every crawler, so the build that lifts the Disallow fails until the key is reissued. Its
// SHA-256 is pinned below; delete the constant when the key is reissued.
//
// Usage: node scripts/check-export-no-personal-info.mjs <dir>...   (exit 0 clean, 1 on a hit)
//        node scripts/check-export-no-personal-info.mjs --self-test

import { createHash } from 'node:crypto';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const KNOWN_PRE_FLIP_KEY_SHA256 = 'd9ab25501dc9d395add79a630d58e08575f82dc61f50ba233cccde5812f4197b';

const TEXT_EXT = new Set(['.html', '.js', '.mjs', '.json', '.txt', '.xml', '.css', '.map', '.md', '.svg', '.webmanifest', '']);
const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
const JWT = /eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]*/g;
const PERSONAL_KEYS = /^(email|e-?mail|mail|name|firstname|lastname|first_name|last_name|given_name|family_name|phone|phone_number|address|userinformation|username|user_name|preferred_username)$/i;

function personalTokens() {
    const p = join(ROOT, '.claude/personal-identity.tokens');
    if (!existsSync(p)) return [];
    return readFileSync(p, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#')).map((l) => l.toLowerCase());
}

function decodeSegment(seg) {
    try {
        return JSON.parse(Buffer.from(seg, 'base64url').toString('utf8'));
    } catch {
        return null;
    }
}

// Every personal finding inside a decoded JSON value: a personal field name, or an
// email-shaped string at any depth.
function personalInJson(value, path = '') {
    const out = [];
    if (typeof value === 'string') {
        if (value.match(EMAIL)) out.push(`${path || 'value'}: an email`);
    } else if (Array.isArray(value)) {
        value.forEach((v, i) => out.push(...personalInJson(v, `${path}[${i}]`)));
    } else if (value && typeof value === 'object') {
        for (const [k, v] of Object.entries(value)) {
            const at = path ? `${path}.${k}` : k;
            if (PERSONAL_KEYS.test(k)) out.push(`${at}: a personal field`);
            out.push(...personalInJson(v, at));
        }
    }
    return out;
}

const sha256 = (s) => createHash('sha256').update(s).digest('hex');

// A private-list token stands legitimately in a citation of a published work, the same places
// scripts/lint-no-personal-identity.sh allows in the tree: an author-year citation
// ("X and Token 2023", "Token 2023"), a bibliography entry ("A. Token. 2023.") or another
// author's given name after a surname ("Surname, Token,").
const YEAR = '(?:19|20)\\d{2}';
function isCitation(text, at, len) {
    const before = text.slice(Math.max(0, at - 40), at);
    const after = text.slice(at + len, at + len + 12);
    return (
        new RegExp(`^,?\\s+${YEAR}\\b`).test(after) ||
        new RegExp(`^\\.\\s+${YEAR}\\.`).test(after) ||
        (/[A-Z][a-z]+,\s+$/.test(before) && /^,/.test(after))
    );
}

// The findings in one text. `preFlip` is true while the export still disallows every crawler.
export function scanText(text, { tokens = [], preFlip = false, knownKey = KNOWN_PRE_FLIP_KEY_SHA256 } = {}) {
    const findings = [];
    for (const m of text.matchAll(EMAIL)) findings.push(`an email in the text (${m[0].length} characters)`);
    for (const m of text.matchAll(JWT)) {
        const [h, p] = m[0].split('.');
        const inside = [...personalInJson(decodeSegment(h) ?? {}, 'header'), ...personalInJson(decodeSegment(p) ?? {}, 'payload')];
        if (inside.length === 0) continue;
        if (preFlip && knownKey && sha256(m[0]) === knownKey) continue;
        findings.push(`a token carrying ${inside.join(', ')}`);
    }
    const lower = text.toLowerCase();
    for (const t of tokens) {
        for (let i = lower.indexOf(t); i !== -1; i = lower.indexOf(t, i + t.length)) {
            if (!isCitation(text, i, t.length)) {
                findings.push('a token from the private personal-identity list');
                break;
            }
        }
    }
    return findings;
}

function* walk(dir) {
    for (const name of readdirSync(dir)) {
        const p = join(dir, name);
        const st = statSync(p);
        if (st.isDirectory()) yield* walk(p);
        else if (TEXT_EXT.has(extname(name).toLowerCase())) yield p;
    }
}

function preFlipOf(dir) {
    const robots = join(dir, 'robots.txt');
    return existsSync(robots) && /^Disallow: \/\s*$/m.test(readFileSync(robots, 'utf8'));
}

function selfTest() {
    const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');
    const jwt = (payload) => `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(payload)}.c2lnbmF0dXJlLXBhcnQ`;
    const personalKey = jwt({ userInformation: { id: 'x', email: 'someone@example.org' }, exp: 1 });
    const cleanKey = jwt({ scopedKeyKey: 'k', exp: 1 });
    const cases = [
        ['fires: an email in the text', 'contact someone@example.org now', {}, true],
        ['fires: a token whose payload carries an email', `let e="${personalKey}"`, {}, true],
        ['fires: a token with a personal field name', `x=${jwt({ name: 'Ann' })}`, {}, true],
        ['fires: the known key once the crawlers are let in', personalKey, { preFlip: false, knownKey: sha256(personalKey) }, true],
        ['fires: a private-list token', 'by Jane Example', { tokens: ['jane example'] }, true],
        ['quiet: a token without personal fields', `let e="${cleanKey}"`, {}, false],
        ['quiet: the known key before the flip', personalKey, { preFlip: true, knownKey: sha256(personalKey) }, false],
        ['fires: a byline', 'written by Jane Example for the site', { tokens: ['example'] }, true],
        ['quiet: an address-free text', 'the wallet 0xabc signs', {}, false],
        ['quiet: an author-year citation', '(Genovese and Example 2023)', { tokens: ['example'] }, false],
        ['quiet: a bibliography entry', 'Genovese, F. R., and J. Example. 2023. “Title.”', { tokens: ['example'] }, false],
        ['quiet: another author with the given name', 'Acquisti, Jane, Curtis Taylor, and Liad Wagman. 2016.', { tokens: ['jane'] }, false],
    ];
    let failed = 0;
    for (const [label, text, opts, fires] of cases) {
        const got = scanText(text, opts).length > 0;
        if (got !== fires) {
            failed++;
            console.log(`  FAIL ${label}`);
        } else console.log(`  ok   ${label}`);
    }
    console.log(failed ? `[personal-info] self-test: ${failed} case(s) failed` : `[personal-info] self-test: ${cases.length} cases pass`);
    return failed ? 1 : 0;
}

function main(args) {
    if (args[0] === '--self-test') return selfTest();
    if (args.length === 0) {
        console.error('usage: check-export-no-personal-info.mjs <dir>... | --self-test');
        return 2;
    }
    const tokens = personalTokens();
    let hits = 0;
    for (const dir of args) {
        if (!existsSync(dir)) {
            console.log(`[personal-info] ${dir}: missing`);
            hits++;
            continue;
        }
        const preFlip = preFlipOf(dir);
        for (const file of walk(dir)) {
            const findings = scanText(readFileSync(file, 'utf8'), { tokens, preFlip });
            for (const f of findings) {
                hits++;
                console.log(`[personal-info] ${file}: ${f}`);
            }
        }
    }
    if (hits) {
        console.log(`[personal-info] ${hits} finding(s): nothing that leaves the project may carry personal information`);
        return 1;
    }
    console.log(`[personal-info] clean: ${args.join(', ')}`);
    return 0;
}

process.exit(main(process.argv.slice(2)));
