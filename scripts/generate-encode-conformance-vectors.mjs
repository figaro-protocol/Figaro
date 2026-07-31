#!/usr/bin/env node
// generate-encode-conformance-vectors.mjs — regenerate the expected-hex
// conformance vectors in prover/clause/tests/encode_conformance.rs from
// the LIVE Layer A encoder (`@figaro/sdk/clauses`, executed from sdk/dist).
//
// The vectors lock the Rust clause engine to the TS encoder, so they are
// generated FROM THE TS SIDE, never from Rust — regenerating from the side
// under test would lock Rust to itself and silently delete the guard.
//
// The .rs file stays the single source of the vector INPUTS (clauseId,
// stage, content payload); this script re-derives only the expected hex.
// Each payload is validated (`validateContent`) before encoding, so every
// vector is validated content. Idempotent: a second run is a no-op.
//
// Usage:   node scripts/generate-encode-conformance-vectors.mjs
// Prereq:  sdk/dist built (`cd sdk && npm run build`).

import { readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const testPath = join(repoRoot, "prover", "clause", "tests", "encode_conformance.rs");
const clausesDir = join(repoRoot, "clauses");

const { parseClauseSpec, validateContent, encodeContentFromSpec } = await import(
    join(repoRoot, "sdk", "dist", "clauses", "index.js")
);

// ── Rust-source scanning ────────────────────────────────────────────────────

/** Scan from `open` (index of "(") to its balanced close, string-aware. */
function balancedSpan(src, open) {
    let depth = 0;
    let inString = false;
    for (let i = open; i < src.length; i++) {
        const c = src[i];
        if (inString) {
            if (c === "\\") i++;
            else if (c === '"') inString = false;
            continue;
        }
        if (c === '"') inString = true;
        else if (c === "(" || c === "[" || c === "{") depth++;
        else if (c === ")" || c === "]" || c === "}") {
            depth--;
            if (depth === 0) return i;
        }
    }
    throw new Error(`unbalanced parens from index ${open}`);
}

/** Split a call's argument text at top-level commas, string-aware.
 *  Returns [{ text, start, end }] with absolute source offsets. */
function splitArgs(src, start, end) {
    const args = [];
    let depth = 0;
    let inString = false;
    let argStart = start;
    for (let i = start; i < end; i++) {
        const c = src[i];
        if (inString) {
            if (c === "\\") i++;
            else if (c === '"') inString = false;
            continue;
        }
        if (c === '"') inString = true;
        else if (c === "(" || c === "[" || c === "{") depth++;
        else if (c === ")" || c === "]" || c === "}") depth--;
        else if (c === "," && depth === 0) {
            args.push({ start: argStart, end: i });
            argStart = i + 1;
        }
    }
    if (src.slice(argStart, end).trim().length > 0) args.push({ start: argStart, end });
    return args.map(({ start: s, end: e }) => {
        while (/\s/.test(src[s])) s++;
        while (e > s && /\s/.test(src[e - 1])) e--;
        return { text: src.slice(s, e), start: s, end: e };
    });
}

/** Expand `format!("0x{}", "ab".repeat(32))` into the string literal it
 *  evaluates to — the only non-literal expression the vectors use. */
function expandFormatMacro(text) {
    return text.replace(
        /format!\(\s*"0x\{\}"\s*,\s*"([0-9a-fA-F]+)"\s*\.repeat\((\d+)\)\s*\)/g,
        (_, hex, n) => `"0x${hex.repeat(Number(n))}"`,
    );
}

/** A Rust `json!({...})` literal → the JS value it denotes. */
function parseContentExpr(text) {
    const m = /^json!\(/.exec(text);
    if (!m) throw new Error(`content is not a json! literal: ${text.slice(0, 60)}`);
    const inner = text.slice(m[0].length, text.length - 1);
    const jsonish = expandFormatMacro(inner)
        // Rust's json! admits trailing commas; JSON.parse does not.
        .replace(/,(\s*[\]}])/g, "$1");
    return JSON.parse(jsonish);
}

/** An expected-hex expression (`"0x…"` or `&format!(…)`) → its hex string. */
function evalExpectedExpr(text) {
    const literal = expandFormatMacro(text.replace(/^&/, ""));
    if (!/^"0x[0-9a-fA-F]*"$/.test(literal)) {
        throw new Error(`expected-hex expression is not a hex literal: ${text.slice(0, 60)}`);
    }
    return JSON.parse(literal);
}

/** The name of the enclosing `fn` for a call at `index` (for reporting). */
function enclosingFn(src, index) {
    const head = src.slice(0, index);
    const m = head.match(/fn\s+(\w+)\s*\([^)]*\)\s*\{(?![\s\S]*fn\s+\w+\s*\([^)]*\)\s*\{)/);
    return m ? m[1] : "<unknown fn>";
}

// ── Vector extraction ───────────────────────────────────────────────────────

const src = readFileSync(testPath, "utf8");
const callRe = /^[ \t]+(assert_encode_stage|assert_encode)\(/gm;
const vectors = [];
let m;
while ((m = callRe.exec(src)) !== null) {
    const open = m.index + m[0].length - 1;
    const close = balancedSpan(src, open);
    const args = splitArgs(src, open + 1, close);
    // Skip non-vector call sites (e.g. assert_encode's own body forwards
    // identifiers, not literals).
    if (!args[0]?.text.startsWith('"')) continue;
    const isStage = m[1] === "assert_encode_stage";
    const [clauseArg, stageArg, contentArg, expectedArg] = isStage
        ? args
        : [args[0], undefined, args[1], args[2]];
    const stageText = stageArg?.text;
    const stage =
        stageText === undefined || stageText === "None"
            ? undefined
            : Number(/^Some\((\d+)\)$/.exec(stageText)[1]);
    vectors.push({
        fn: enclosingFn(src, m.index),
        clauseId: JSON.parse(clauseArg.text),
        stage,
        content: parseContentExpr(contentArg.text),
        expected: evalExpectedExpr(expectedArg.text),
        expectedStart: expectedArg.start,
        expectedEnd: expectedArg.end,
    });
}

if (vectors.length === 0) {
    console.error(`no vectors found in ${testPath}`);
    process.exit(1);
}

// ── Regeneration from Layer A ───────────────────────────────────────────────

const edits = [];
let failed = false;
for (const v of vectors) {
    const label = `${v.fn} (${v.clauseId}${v.stage !== undefined ? `, stage ${v.stage}` : ""})`;
    const specRaw = JSON.parse(readFileSync(join(clausesDir, `${v.clauseId}.json`), "utf8"));
    const parsed = parseClauseSpec(specRaw);
    if (!parsed.ok) {
        console.error(`✖ ${label}: spec failed to parse: ${JSON.stringify(parsed.errors)}`);
        failed = true;
        continue;
    }
    const valid = validateContent(v.content, parsed.spec, { stage: v.stage });
    if (!valid.ok) {
        console.error(`✖ ${label}: payload failed validation: ${JSON.stringify(valid.errors)}`);
        failed = true;
        continue;
    }
    const hex = encodeContentFromSpec(parsed.spec, v.content, { stage: v.stage });
    if (hex === v.expected) {
        console.log(`  ${label}: unchanged`);
    } else {
        console.log(`~ ${label}: expected hex regenerated`);
        edits.push({ start: v.expectedStart, end: v.expectedEnd, text: `"${hex}"` });
    }
}
if (failed) process.exit(1);

if (edits.length === 0) {
    console.log(`${vectors.length} vectors checked; ${testPath} is up to date.`);
} else {
    let out = src;
    for (const e of edits.sort((a, b) => b.start - a.start)) {
        out = out.slice(0, e.start) + e.text + out.slice(e.end);
    }
    writeFileSync(testPath, out);
    console.log(`${vectors.length} vectors checked; ${edits.length} updated in ${testPath}.`);
}
