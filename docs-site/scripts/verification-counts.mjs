#!/usr/bin/env node
// The verification-layer counts the builder documentation's security page
// cites, derived from the tree at build time — never typed into the page.
//
// One derivation, two readers: `assemble-content.mjs` substitutes the counts
// into the page as it copies it, and the commit-time counts guard reads the
// same JSON to hold the handover's Foundry row and to refuse a literal count
// on the page (a sibling's new test used to refuse an unrelated commit when
// the page carried the number by hand).
//
//   node docs-site/scripts/verification-counts.mjs        → JSON on stdout
//
// The rules: a Foundry test is a `function test…` or `function invariant…` in
// test/**/*.t.sol; a Halmos property a `function check_…` or `prove_…` under
// test/; a Certora rule a `rule` or `invariant` in certora/*.spec, the spec
// files counted and spelled out; an Echidna property a `function echidna_…`
// under src/echidna.
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const WORDS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];

function walk(dir, out = []) {
    let entries = [];
    try { entries = readdirSync(dir); } catch { return out; }
    for (const name of entries) {
        const p = join(dir, name);
        if (statSync(p).isDirectory()) walk(p, out);
        else out.push(p);
    }
    return out;
}

function countLines(files, re) {
    let n = 0;
    for (const f of files) for (const line of readFileSync(f, 'utf8').split('\n')) if (re.test(line)) n++;
    return n;
}

export function verificationCounts(repoRoot) {
    const tests = walk(join(repoRoot, 'test'));
    const foundry = countLines(tests.filter((f) => f.endsWith('.t.sol')), /^\s*function (test|invariant)/);
    const halmos = countLines(tests.filter((f) => f.endsWith('.sol')), /^\s*function (check_|prove_)/);
    const specFiles = walk(join(repoRoot, 'certora')).filter((f) => /^[^/]*\.spec$/.test(f.slice(join(repoRoot, 'certora').length + 1)));
    const certora = countLines(specFiles, /^\s*(rule|invariant) /);
    const specs = specFiles.length;
    const echidna = countLines(walk(join(repoRoot, 'src', 'echidna')).filter((f) => f.endsWith('.sol')), /^\s*function echidna_/);
    return { foundry, halmos, certora, specs, specsWord: WORDS[specs] ?? String(specs), echidna };
}

/** The page's placeholders and the count each stands for. */
export const PLACEHOLDERS = {
    __FOUNDRY_TEST_FUNCTIONS__: 'foundry',
    __HALMOS_PROPERTIES__: 'halmos',
    __CERTORA_RULES__: 'certora',
    __CERTORA_SPECS_WORD__: 'specsWord',
    __ECHIDNA_PROPERTIES__: 'echidna',
};

export function substituteCounts(text, counts) {
    let out = text;
    for (const [token, key] of Object.entries(PLACEHOLDERS)) out = out.split(token).join(String(counts[key]));
    return out;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
    process.stdout.write(JSON.stringify(verificationCounts(repoRoot)) + '\n');
}
