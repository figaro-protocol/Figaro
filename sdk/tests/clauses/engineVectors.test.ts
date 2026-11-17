/**
 * Clause-engine vectors — the hand-written leg of the clause-engine lock.
 *
 * The generated leg (`clauseFuzzVectors.test.ts`) draws cases at random; this
 * file names the boundaries one by one: each character position of the
 * datetime format, each hex width, each shape the regex screen reads, each
 * bound a spec declares. Every case is a field spec, a value, and Layer A's
 * verdict; every spec case is a raw spec and whether Layer A parses it.
 *
 * The verdicts are frozen into `test/fixtures/clause-engine-vectors.json`;
 * `prover/clause/tests/engine_vectors.rs` asserts the guest's engine gives
 * the same ones.
 *
 *   1. Regenerate the fixture on `HARVEST_CLAUSE_ENGINE_VECTORS=1`.
 *   2. Otherwise, assert Layer A still reproduces the frozen verdicts.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { encodeContentFromSpec, parseClauseSpec, validateContent } from "../../src/clauses/index.js";

const FIXTURE_PATH = path.resolve(__dirname, "../../../test/fixtures/clause-engine-vectors.json");

type Field = Record<string, unknown>;

const specOf = (fields: unknown, stages?: unknown) => ({
    clauseId: "t",
    version: 1,
    title: "T",
    description: "D",
    fields,
    ...(stages === undefined ? {} : { stages }),
});

// ── Values, by field ────────────────────────────────────────────────────────

const str = (extra: Field = {}): Field => ({ name: "v", type: "string", required: true, ...extra });
const H = (n: number, c = "a") => `0x${c.repeat(n * 2)}`;

/** Geohash values across the public cap, in UTF-16 units. */
const GEOHASHES: unknown[] = ["", "d", "dr5re", "dr5reg", "dr5regw", "dr5regw3pg6s", "dr5regw3pg6st", "dr5reé", "dr5regé", "🚚🚚🚚", "🚚🚚🚚a", 7];

/** A set's blinding field, in its one shape. */
const BLINDING: Field = { name: "b", type: "string", format: "bytes32-hex", required: true, disposition: "private", blinding: true };
const B32 = `0x${"ab".repeat(32)}`;

const VALUE_CASES: { group: string; field: Field; values: unknown[] }[] = [
    {
        group: "iso-datetime",
        field: str({ format: "iso-datetime" }),
        values: [
            "2026-01-01T00:00:00Z",
            "2026-01-01T00:00:00.1Z",
            "2026-01-01T00:00:00.123456789Z",
            "2026-01-01T00:00:00+02:00",
            "2026-01-01T00:00:00-11:30",
            "2026-01-01T00:00:00.5+02:00",
            "9999-99-99T99:99:99Z",
            "2026-01-01T00:00:00",
            "2026-01-01T00:00:0Z",
            "2026-01-01T00:00:00ZZ",
            "2026-01-01T00:00:00Z ",
            " 2026-01-01T00:00:00Z",
            "2026-01-01T00:00:00.Z",
            "2026-01-01T00:00:00.",
            "2026-01-01T00:00:00.123",
            "2026-01-01T00:00:00.12a",
            "2026-01-01T00:00:00X",
            "2026-01-01T00:00:00z",
            "2026-01-01t00:00:00Z",
            "2026-01-01 00:00:00Z",
            "202a-01-01T00:00:00Z",
            "2026-0a-01T00:00:00Z",
            "2026-01-0aT00:00:00Z",
            "2026-01-01T0a:00:00Z",
            "2026-01-01T00:0a:00Z",
            "2026-01-01T00:00:0aZ",
            "2026/01-01T00:00:00Z",
            "2026-01/01T00:00:00Z",
            "2026-01-01T00.00:00Z",
            "2026-01-01T00:00.00Z",
            "2026-01-01T00:00:00+0200",
            "2026-01-01T00:00:00+02:0",
            "2026-01-01T00:00:00+02:000",
            "2026-01-01T00:00:00+2:00",
            "2026-01-01T00:00:00+02-00",
            "2026-01-01T00:00:00+0a:00",
            "2026-01-01T00:00:00+02:0a",
            "2026-01-01T00:00:00+",
            "2026-01-01T00:00:00+02",
            "2026-01-01T00:00:00+02:",
            "2026-01-01T00:00:00.5",
            "2026-01-01T00:00:00.5+",
            "２０２６-01-01T00:00:00Z",
            "",
        ],
    },
    {
        group: "bytes32-hex",
        field: str({ format: "bytes32-hex" }),
        values: [H(32), H(32, "A"), H(31), H(33), H(32).slice(2) + "00", "0X" + "a".repeat(64), "0x" + "g".repeat(64), ""],
    },
    {
        group: "address-hex",
        field: str({ format: "address-hex" }),
        values: [
            H(20),
            H(20, "F"),
            H(19),
            H(21),
            "a".repeat(42),
            "00" + "a".repeat(40),
            "0X" + "a".repeat(40),
            "0x" + "g".repeat(40),
            "0x" + "a".repeat(39) + "é",
            "",
        ],
    },
    {
        group: "bytes-hex",
        field: str({ format: "bytes-hex" }),
        values: ["0x", "0xab", "0xAB", "0xabcd", "0xa", "0xabc", "0xzz", "abcd", "0Xab", "x0ab", "", "0x" + "ab".repeat(40)],
    },
    {
        group: "open format",
        field: str({ format: "evidence-capture" }),
        values: ["anything at all", "", "0xzz"],
    },
    {
        group: "string length, UTF-16 units",
        field: str({ minLength: 2, maxLength: 3 }),
        values: ["", "a", "ab", "abc", "abcd", "é", "éé", "🚚", "🚚a", "🚚🚚", "a🚚"],
    },
    {
        group: "pattern",
        field: str({ pattern: "^[a-z]+$" }),
        values: ["abc", "", "ABC", "ab1", "a"],
    },
    // The screen: a pattern it refuses is SATISFIED by any value, so a value
    // the pattern would reject shows which way the screen decided.
    ...[
        "(a+)+$",
        "(a*)*$",
        "(a+)*$",
        "(a{2,})+$",
        "((a+))+$",
        "((a)+)+$",
        "(a|b+)+$",
        "^(a+)$",
        "^(ab)+$",
        "^a+b+$",
        "^(a)(b+)$",
        "^(a+)(b)+$",
        "^\\(a+\\)+$",
        "^[+*]+$",
        "^[(+)]+$",
        "^[\\]+]+$",
        "^(a[+*])+$",
        "^(a\\+)+$",
        "^(a)+$",
        "^(a){2}$",
        "^(a+){2}$",
        "^(a+)?$",
        "^((a)(b+))+$",
        "^(a(b+)c)*$",
        "^(a(b)c)*$",
        "^(?:a+)+$",
        "^a{2}$",
        // Classes inside a group: what a class holds is never a quantifier.
        "^([+])+$",
        "^([a][+])+$",
        "^([a][b][*])+$",
        "^([\\]+])+$",
        "^([\\]][+])+$",
        "^([\\\\][+])+$",
        "^([+\\]])+$",
        "^([{])+$",
        "^(a[+]b+)+$",
        "^([+]b)+$",
    ].map((pattern) => ({
        group: `screen ${pattern}`,
        field: str({ pattern }),
        values: ["zzz", "a", "aa", "ab", "aab", "abc", "(a)", "+", "a+", ""],
    })),
    // The two engines run a pattern on two regex libraries. These are the
    // constructs and the inputs on which the libraries part; the portable
    // core (`isPortablePattern`) keeps a spec and a value clear of them.
    ...[
        "^(?!foo).*$",
        "^(?=a).*$",
        "^(?<=a)b$",
        "^(a)\\1$",
        "^(?<n>a)\\k<n>$",
        "^(?<n>a)$",
        "(?i)^a$",
        "^\\d$",
        "^\\w+$",
        "^\\s$",
        "^.$",
        "^..$",
        "^a$",
        "^[a&&b]$",
        "^[a--b]$",
        "^[[:alpha:]]$",
        "^\\p{L}$",
        "^a*+$",
        "^a++$",
        "^\\x41$",
        "^\\u0041$",
        "^\\u{41}$",
        "^\\cA$",
        "^[^a]$",
        "^\\bfoo\\b$",
        "^a{,2}$",
        "^a{2,1}$",
        "^\\/$",
        "^\\-$",
        "^[\\w-]+$",
        "^\\e$",
        "^\\a$",
        "^\\z$",
        "^a\\Z$",
        "^\\Aa$",
    ].map((pattern) => ({
        group: `dialect ${pattern}`,
        field: str({ pattern }),
        values: ["foo", "a", "aa", "ab", "b", "A", "&", "-", "/", "e", "z", "é", "🚚", "٣", "3", "\r", "\n", "a\n", "\u00a0", " ", "\u0001", "\u2028", "\u001b", "\u0007", ""],
    })),
    ...[
        "^[A-Za-z][A-Za-z0-9-]{1,15}$",
        "^[A-Za-z0-9][A-Za-z0-9 ./-]{0,63}$",
        "^[A-Za-z]{2,3}(-[A-Za-z]{2,4})?$",
        "^UN[0-9]{4}$",
        "^[-a]$",
        "^[a-]$",
        "^[a-c-]$",
        "^[z-a]$",
        "^[a-c-e]$",
        "^[a\\-c]$",
        "^[\\d-z]$",
        "^[a-\\d]$",
        "^[]a]$",
        "^[^]a]$",
        "^[^]$",
        "^[a[b]]$",
        "^[a~~b]$",
        "^a{2}$",
        "^a{2,}$",
        "^a{2,3}$",
        "^a{3,2}$",
        "^a{64}$",
        "^a{65}$",
        "^a{0,64}$",
        "^a{1000}$",
        "^a{}$",
        "^a{,}$",
        "^a{2,3$",
        "^a}$",
        "^a]$",
        "^a*?$",
        "^a+?$",
        "^a??$",
        "^a{2}?$",
        "^a**$",
        "^a?*$",
        "^*a$",
        "^(*a)$",
        "^a|*b$",
        "^$*",
        "^\\b*a$",
        "^(?:a|b)c$",
        "^(a|)c$",
        "^a|$",
        "^()$",
        "^(a$",
        "^a)$",
        "^\\.$",
        "^\\\\$",
        "^\\<$",
        "^\\_$",
        "^\\ $",
        "^\\n$",
        "^\\t$",
        "^\\1$",
        "^\\",
        // Each branch of the scanner, by the pattern that turns on it.
        "abc(?:\\n)",
        "abc(?:d)",
        "^[a&b]$",
        "^[a~b]$",
        "^[&]$",
        "^[a&]$",
        "^[~a]$",
        "^[a&&]$",
        "^[&&a]$",
        "^[A-\\d]$",
        "^[A-\\]]$",
        "^[A-[a]$",
        "^[!-\\.]$",
        "^[a-a]$",
        "^[a-b]$",
        "^[\\n]$",
        "^[\\x]$",
        "^[a\\b]$",
        "^[\\d\\w\\s]$",
        "^[\\.\\-\\]]$",
        "^[^-a]$",
        "^[^a-]$",
        "^[^^]$",
        "^a{2",
        "a{12",
        "a{1,2",
        "a{1,",
        "^a{064}$",
        "^a{001}$",
        "^a{0001}$",
        "^a{0064}$",
        "^a{1,064}$",
        "^a{1,0064}$",
        "^a{065}$",
        "^a{0,0}$",
        "^a{0}$",
        "a".repeat(256),
        "a".repeat(257),
        "^é$",
        "",
    ].map((pattern) => ({
        group: `core ${pattern}`,
        field: str({ pattern }),
        values: ["a", "aa", "aaa", "ab", "ac", "b", "c", "-", "]", "^", "~", "[", "}", ".", "\\", "<", "_", " ", "n", "t", "1", "UN1234", "en-GB", "a".repeat(64), "a".repeat(65), "é", "\n", "\t", ""],
    })),
    {
        group: "pattern input bound",
        field: str({ pattern: "^a$" }),
        values: ["b".repeat(4096), "b".repeat(4097), "🚚".repeat(2048), "🚚".repeat(2049)],
    },
    {
        group: "integer",
        field: { name: "v", type: "integer", required: true, min: -5, max: 5 },
        values: [-6, -5, 0, 5, 6, 1.5, 1.0, "1", null, true, 9007199254740991, 9007199254740992, -9007199254740992, 1e21],
    },
    {
        group: "integer, unbounded",
        field: { name: "v", type: "integer", required: true },
        values: [9007199254740991, -9007199254740991, 9007199254740992, -9007199254740992, 1e21, 0],
    },
    {
        group: "bigint",
        field: { name: "v", type: "bigint", required: true, min: "10", max: "1000000000000000000000000" },
        values: ["9", "10", "010", "0010", "00", "11", "1000000000000000000000000", "1000000000000000000000001", "0999999999999999999999999", "-10", "-0", "", "+5", "0x10", " 5", "5 ", 5, null],
    },
    {
        group: "bigint, zero and its written forms",
        field: { name: "v", type: "bigint", required: true, min: "0", max: "5" },
        values: ["0", "00", "000", "5", "05", "005", "6", "06", "0006", "1"],
    },
    {
        group: "bigint, a signed zero bound",
        field: { name: "v", type: "bigint", required: true, min: "-0", max: "-0" },
        values: ["0", "00", "1", "01"],
    },
    {
        group: "bigint, a negative lower bound",
        field: { name: "v", type: "bigint", required: true, min: "-5", max: "07" },
        values: ["0", "3", "7", "007", "8", "08"],
    },
    {
        group: "bigint, unbounded",
        field: { name: "v", type: "bigint", required: true },
        values: [
            "0",
            "000",
            "115792089237316195423570985008687907853269984665640564039457584007913129639935",
            "115792089237316195423570985008687907853269984665640564039457584007913129639936",
            "0115792089237316195423570985008687907853269984665640564039457584007913129639935",
            "99999999999999999999999999999999999999999999999999999999999999999999999999999",
        ],
    },
    {
        group: "enum",
        field: { name: "v", type: "enum", required: true, values: ["red", "green"] },
        values: ["red", "green", "blue", "", "RED", 0, null],
    },
    {
        group: "boolean",
        field: { name: "v", type: "boolean", required: true },
        values: [true, false, 0, 1, "true", null],
    },
    {
        group: "array",
        field: { name: "v", type: "array", required: true, minItems: 1, maxItems: 2, items: { type: "integer", min: 0 } },
        values: [[], [1], [1, 2], [1, 2, 3], [-1], [1, "2"], "x", {}, null],
    },
    {
        group: "object",
        field: {
            name: "v",
            type: "object",
            required: true,
            fields: [
                { name: "a", type: "integer", required: true },
                { name: "b", type: "string", required: false },
            ],
        },
        values: [{ a: 1 }, { a: 1, b: "x" }, { b: "x" }, { a: 1, c: 2 }, { a: 1, b: null }, { a: null }, {}, [], "x", null],
    },
    {
        group: "optional",
        field: { name: "v", type: "integer", required: false },
        values: [1, null, "x"],
    },
    // The geohash grain cap: a public (or absent) disposition carries at most
    // 6 characters, in UTF-16 units; `maxLength` stays the structural ceiling.
    {
        group: "geohash, no disposition",
        field: str({ format: "geohash", maxLength: 12 }),
        values: GEOHASHES,
    },
    {
        group: "geohash, public",
        field: str({ format: "geohash", disposition: "public" }),
        values: GEOHASHES,
    },
    {
        group: "a format the cap does not read",
        field: str({ format: "plus-code", maxLength: 12 }),
        values: ["dr5regw", "dr5regw3pg6s"],
    },
    {
        group: "geohash items of a public array",
        field: { name: "v", type: "array", required: true, items: { type: "string", format: "geohash" } },
        values: [[], ["dr5reg"], ["dr5regw"], ["dr5reg", "dr5regw3"], [7]],
    },
    {
        // The array field's disposition governs its items, never the item's own.
        group: "geohash items marked private in a public array",
        field: { name: "v", type: "array", required: true, items: { type: "string", format: "geohash", disposition: "private" } },
        values: [["dr5reg"], ["dr5regw"]],
    },
    {
        group: "geohash in a nested object, public",
        field: { name: "v", type: "object", required: true, fields: [{ name: "g", type: "string", required: true, format: "geohash" }] },
        values: [{ g: "dr5reg" }, { g: "dr5regw" }],
    },
    {
        // The set rules bind a top-level set; a nested field keeps its own disposition.
        group: "geohash in a nested object, private",
        field: { name: "v", type: "object", required: true, fields: [{ name: "g", type: "string", required: true, format: "geohash", disposition: "private" }] },
        values: [{ g: "dr5regw" }, { g: "dr5regw3pg6s" }, { g: "dr5regw3pg6st" }],
    },
    {
        group: "formatFromField with no sibling, a static geohash format",
        field: str({ format: "geohash", formatFromField: "standard" }),
        values: ["dr5reg", "dr5regw"],
    },
    {
        group: "formatFromField with no sibling, no static format",
        field: str({ formatFromField: "standard" }),
        values: ["dr5regw3pg6st"],
    },
];

/** Whole-content cases: the root object's own rules. */
const CONTENT_CASES: { label: string; fields: Field[]; content: unknown }[] = [
    { label: "absent optional", fields: [{ name: "v", type: "integer", required: false }], content: {} },
    { label: "absent required", fields: [{ name: "v", type: "integer", required: true }], content: {} },
    { label: "unknown field", fields: [{ name: "v", type: "integer", required: false }], content: { w: 1 } },
    { label: "unknown field beside a known one", fields: [{ name: "v", type: "integer", required: true }], content: { v: 1, w: 1 } },
    { label: "content is an array", fields: [{ name: "v", type: "integer", required: false }], content: [] },
    { label: "content is null", fields: [{ name: "v", type: "integer", required: false }], content: null },
    { label: "content is a string", fields: [{ name: "v", type: "integer", required: false }], content: "x" },
    // A private set: its geohash carries 12 characters, and its blinding value is a bytes32-hex string.
    ...[
        { g: "dr5regw3pg6s", b: B32 },
        { g: "dr5regw3pg6st", b: B32 },
        { g: "dr5reg" },
        { g: "dr5reg", b: "0xab" },
    ].map((content) => ({
        label: `private geohash ${JSON.stringify(content)}`,
        fields: [{ name: "g", type: "string", required: true, format: "geohash", disposition: "private" }, BLINDING],
        content,
    })),
    ...[{ a: ["dr5regw3pg6s"], b: B32 }, { a: ["dr5regw3pg6st"], b: B32 }].map((content) => ({
        label: `private array of geohashes ${JSON.stringify(content)}`,
        fields: [{ name: "a", type: "array", required: true, disposition: "private", items: { type: "string", format: "geohash" } }, BLINDING],
        content,
    })),
    // The format a sibling's committed value names, then the sibling's default, then the static format.
    ...[
        { std: "geohash", loc: "dr5regw" },
        { std: "geohash", loc: "dr5reg" },
        { std: "plus-code", loc: "dr5regw3pg6st" },
        { std: "", loc: "dr5regw" },
        { loc: "dr5regw" },
    ].map((content) => ({
        label: `formatFromField, a sibling with no default ${JSON.stringify(content)}`,
        fields: [{ name: "std", type: "string", required: false }, { name: "loc", type: "string", required: true, formatFromField: "std" }],
        content,
    })),
    ...[{ loc: "dr5regw" }, { std: "", loc: "dr5regw" }, { std: "plus-code", loc: "dr5regw" }, { std: "geohash", loc: "dr5reg" }].map((content) => ({
        label: `formatFromField, a sibling whose default is geohash ${JSON.stringify(content)}`,
        fields: [{ name: "std", type: "string", required: false, default: "geohash" }, { name: "loc", type: "string", required: true, formatFromField: "std" }],
        content,
    })),
    ...[{ loc: "dr5regw" }, { std: "geohash", loc: "dr5regw" }].map((content) => ({
        label: `formatFromField, an enum sibling whose default is geohash ${JSON.stringify(content)}`,
        fields: [
            { name: "std", type: "enum", values: ["geohash", "plus-code"], required: false, default: "geohash" },
            { name: "loc", type: "string", required: true, formatFromField: "std" },
        ],
        content,
    })),
    ...[{ loc: "dr5regw" }, { std: "plus-code", loc: "dr5regw" }].map((content) => ({
        label: `formatFromField over a static geohash format ${JSON.stringify(content)}`,
        fields: [{ name: "std", type: "string", required: false }, { name: "loc", type: "string", required: true, format: "geohash", formatFromField: "std" }],
        content,
    })),
    {
        label: "formatFromField, a sibling whose value is no string",
        fields: [{ name: "std", type: "integer", required: false }, { name: "loc", type: "string", required: true, format: "geohash", formatFromField: "std" }],
        content: { std: 5, loc: "dr5regw" },
    },
    ...[{ loc: "geohash" }, { loc: "dr5regw" }].map((content) => ({
        label: `formatFromField naming the field itself ${JSON.stringify(content)}`,
        fields: [{ name: "loc", type: "string", required: true, formatFromField: "loc" }],
        content,
    })),
    // A field named as a property every object inherits is absent when the content leaves it out.
    ...["toString", "constructor", "valueOf", "hasOwnProperty", "__proto__"].map((name) => ({
        label: `an absent optional field named ${name}`,
        fields: [{ name, type: "string", required: false }],
        content: {},
    })),
    { label: "an absent optional object field named constructor", fields: [{ name: "constructor", type: "object", required: false, fields: [] }], content: {} },
    { label: "an absent required field named toString", fields: [{ name: "toString", type: "string", required: true }], content: {} },
    { label: "a present field named __proto__", fields: [{ name: "__proto__", type: "string", required: true }], content: JSON.parse('{"__proto__":"x"}') as unknown },
    { label: "an undeclared key named toString", fields: [{ name: "v", type: "string", required: false }], content: { toString: "x" } },
];

// ── Specs ───────────────────────────────────────────────────────────────────

const f = (extra: Field): Field[] => [{ name: "v", required: true, ...extra }];
const nest = (depth: number): Field =>
    depth === 0
        ? { name: "leaf", type: "boolean", required: true }
        : { name: `n${depth}`, type: "object", required: true, fields: [nest(depth - 1)] };
const nestArrays = (depth: number): Field =>
    depth === 0
        ? { name: "leaf", type: "boolean", required: true }
        : { name: `n${depth}`, type: "array", required: true, items: nestArrays(depth - 1) };

const SPEC_CASES: { label: string; spec: unknown }[] = [
    { label: "minimal", spec: specOf(f({ type: "boolean" })) },
    { label: "empty field name", spec: specOf([{ name: "", type: "boolean", required: true }]) },
    { label: "missing required flag", spec: specOf([{ name: "v", type: "boolean" }]) },
    { label: "unknown type", spec: specOf(f({ type: "decimal" })) },
    { label: "version 0", spec: { ...specOf(f({ type: "boolean" })), version: 0 } },
    { label: "version -1", spec: { ...specOf(f({ type: "boolean" })), version: -1 } },
    { label: "version 1.5", spec: { ...specOf(f({ type: "boolean" })), version: 1.5 } },
    { label: "version 1.0", spec: { ...specOf(f({ type: "boolean" })), version: 1.0 } },
    { label: "version 1e21", spec: { ...specOf(f({ type: "boolean" })), version: 1e21 } },
    { label: "version as string", spec: { ...specOf(f({ type: "boolean" })), version: "1" } },
    { label: "version past the safe range", spec: { ...specOf(f({ type: "boolean" })), version: 9007199254740992 } },
    { label: "version at the safe range", spec: { ...specOf(f({ type: "boolean" })), version: 9007199254740991 } },
    { label: "integer max past the safe range", spec: specOf(f({ type: "integer", max: 1e21 })) },
    { label: "maxLength past the safe range", spec: specOf(f({ type: "string", maxLength: 1e21 })) },
    { label: "minLength 0", spec: specOf(f({ type: "string", minLength: 0 })) },
    { label: "minLength -1", spec: specOf(f({ type: "string", minLength: -1 })) },
    { label: "minLength 1.5", spec: specOf(f({ type: "string", minLength: 1.5 })) },
    { label: "maxLength -1", spec: specOf(f({ type: "string", maxLength: -1 })) },
    { label: "integer min 1.5", spec: specOf(f({ type: "integer", min: 1.5 })) },
    { label: "integer min -3", spec: specOf(f({ type: "integer", min: -3 })) },
    { label: "bigint min empty", spec: specOf(f({ type: "bigint", min: "" })) },
    { label: "bigint min signed", spec: specOf(f({ type: "bigint", min: "-5" })) },
    { label: "bigint min lone sign", spec: specOf(f({ type: "bigint", min: "-" })) },
    { label: "bigint min hex", spec: specOf(f({ type: "bigint", min: "0x10" })) },
    { label: "bigint min number", spec: specOf(f({ type: "bigint", min: 5 })) },
    { label: "bigint max plus", spec: specOf(f({ type: "bigint", max: "+5" })) },
    { label: "enum empty values", spec: specOf(f({ type: "enum", values: [] })) },
    { label: "enum no values", spec: specOf(f({ type: "enum" })) },
    { label: "enum one value", spec: specOf(f({ type: "enum", values: ["a"] })) },
    { label: "enum sentinel", spec: specOf(f({ type: "enum", values: ["none", "a"], sentinel: "none" })) },
    { label: "array without items", spec: specOf(f({ type: "array" })) },
    { label: "array items a string", spec: specOf(f({ type: "array", items: "integer" })) },
    { label: "array items an array", spec: specOf(f({ type: "array", items: [] })) },
    { label: "array items ok", spec: specOf(f({ type: "array", items: { type: "integer" } })) },
    { label: "array minItems -1", spec: specOf(f({ type: "array", items: { type: "integer" }, minItems: -1 })) },
    { label: "object without fields", spec: specOf(f({ type: "object" })) },
    { label: "object empty fields", spec: specOf(f({ type: "object", fields: [] })) },
    { label: "default string", spec: specOf(f({ type: "string", default: "x" })) },
    { label: "default string wrong type", spec: specOf(f({ type: "string", default: 1 })) },
    { label: "default integer", spec: specOf(f({ type: "integer", min: 0, max: 5, default: 5 })) },
    { label: "default integer at min", spec: specOf(f({ type: "integer", min: 0, max: 5, default: 0 })) },
    { label: "default integer above max", spec: specOf(f({ type: "integer", min: 0, max: 5, default: 6 })) },
    { label: "default integer below min", spec: specOf(f({ type: "integer", min: 0, max: 5, default: -1 })) },
    { label: "default integer 1.5", spec: specOf(f({ type: "integer", default: 1.5 })) },
    { label: "default integer 2.0", spec: specOf(f({ type: "integer", default: 2.0 })) },
    { label: "default bigint", spec: specOf(f({ type: "bigint", default: "5" })) },
    { label: "default bigint number", spec: specOf(f({ type: "bigint", default: 5 })) },
    { label: "default bigint malformed", spec: specOf(f({ type: "bigint", default: "5x" })) },
    { label: "default boolean", spec: specOf(f({ type: "boolean", default: true })) },
    { label: "default boolean wrong type", spec: specOf(f({ type: "boolean", default: "true" })) },
    { label: "default enum member", spec: specOf(f({ type: "enum", values: ["a", "b"], default: "b" })) },
    { label: "default enum stranger", spec: specOf(f({ type: "enum", values: ["a", "b"], default: "c" })) },
    { label: "default enum sentinel", spec: specOf(f({ type: "enum", values: ["none", "a"], sentinel: "none", default: "none" })) },
    { label: "default array of enum", spec: specOf(f({ type: "array", items: { type: "enum", values: ["a", "b"] }, default: ["a"] })) },
    { label: "default array of enum stranger", spec: specOf(f({ type: "array", items: { type: "enum", values: ["a", "b"] }, default: ["c"] })) },
    { label: "default array not an array", spec: specOf(f({ type: "array", items: { type: "enum", values: ["a"] }, default: "a" })) },
    { label: "default on an object", spec: specOf(f({ type: "object", fields: [{ name: "a", type: "boolean", required: true }], default: "x" })) },
    ...[6, 7, 8, 9, 10, 11, 12, 16, 17, 32, 33].map((depth) => ({ label: `nesting depth ${depth}`, spec: specOf([nest(depth)]) })),
    { label: "pattern unbalanced close", spec: specOf(f({ type: "string", pattern: "a+)+" })) },
    { label: "pattern unbalanced open", spec: specOf(f({ type: "string", pattern: "(a+" })) },
    { label: "pattern open class", spec: specOf(f({ type: "string", pattern: "[a" })) },
    { label: "pattern not a string", spec: specOf(f({ type: "string", pattern: 5 })) },
    ...[6, 7, 8, 9, 10, 11, 12, 16, 17, 32, 33].map((depth) => ({ label: `array nesting depth ${depth}`, spec: specOf([nestArrays(depth)]) })),
    { label: "stages", spec: specOf(f({ type: "boolean" }), { 1: f({ type: "integer" }) }) },
    { label: "stages not an object", spec: specOf(f({ type: "boolean" }), []) },
    // A stage key has one spelling: the decimal of an integer 0..255, digits
    // only, no sign, no leading zero, no whitespace.
    ...["0", "1", "255", "01", "00", "+1", " 1", "1 ", "1.0", "0x1", "-0", "", "256", "1e1", "١", "a"].map((key) => ({
        label: `stage key ${JSON.stringify(key)}`,
        spec: specOf(f({ type: "boolean" }), { [key]: f({ type: "integer" }) }),
    })),
    { label: "stage keys \"1\" and \"01\" in one spec", spec: specOf(f({ type: "boolean" }), { "1": f({ type: "integer" }), "01": f({ type: "boolean" }) }) },
    { label: "fields not an array", spec: specOf({}) },
    { label: "empty fields", spec: specOf([]) },
    { label: "spec is an array", spec: [] },
    { label: "spec is null", spec: null },
    // An enum encodes as uint8.
    { label: "enum of 256 values", spec: specOf(f({ type: "enum", values: Array.from({ length: 256 }, (_, i) => `v${i}`) })) },
    { label: "enum of 257 values", spec: specOf(f({ type: "enum", values: Array.from({ length: 257 }, (_, i) => `v${i}`) })) },
    // The disposition: "public" or "private", absent meaning public.
    { label: "disposition public", spec: specOf(f({ type: "boolean", disposition: "public" })) },
    { label: "disposition secret", spec: specOf(f({ type: "boolean", disposition: "secret" })) },
    { label: "disposition null", spec: specOf(f({ type: "boolean", disposition: null })) },
    { label: "disposition true", spec: specOf(f({ type: "boolean", disposition: true })) },
    { label: "disposition PRIVATE", spec: specOf([{ name: "v", type: "boolean", required: true, disposition: "PRIVATE" }, BLINDING]) },
    // formatFromField: a non-empty string, read on a string field.
    { label: "formatFromField", spec: specOf(f({ type: "string", formatFromField: "std" })) },
    { label: "formatFromField naming no sibling", spec: specOf(f({ type: "string", formatFromField: "nowhere" })) },
    { label: "formatFromField empty", spec: specOf(f({ type: "string", formatFromField: "" })) },
    { label: "formatFromField a number", spec: specOf(f({ type: "string", formatFromField: 5 })) },
    { label: "formatFromField null", spec: specOf(f({ type: "string", formatFromField: null })) },
    { label: "formatFromField on an integer field", spec: specOf(f({ type: "integer", formatFromField: 5 })) },
    // The private set: never mixed, exactly one blinding field of one shape.
    { label: "private set with its blinding field", spec: specOf([{ name: "v", type: "boolean", required: true, disposition: "private" }, BLINDING]) },
    { label: "private set, the blinding field first", spec: specOf([BLINDING, { name: "v", type: "boolean", required: true, disposition: "private" }]) },
    { label: "private set without a blinding field", spec: specOf(f({ type: "boolean", disposition: "private" })) },
    { label: "private set with two blinding fields", spec: specOf([{ name: "v", type: "boolean", required: true, disposition: "private" }, BLINDING, { ...BLINDING, name: "b2" }]) },
    { label: "a blinding field alone", spec: specOf([BLINDING]) },
    { label: "a blinding field beside a public field", spec: specOf([{ name: "v", type: "boolean", required: true }, BLINDING]) },
    { label: "a mixed set", spec: specOf([{ name: "v", type: "boolean", required: true }, { name: "w", type: "boolean", required: true, disposition: "private" }, BLINDING]) },
    { label: "a mixed set, public written out", spec: specOf([{ name: "v", type: "boolean", required: true, disposition: "public" }, { name: "w", type: "boolean", required: true, disposition: "private" }, BLINDING]) },
    { label: "a public field beside a private object", spec: specOf([{ name: "v", type: "boolean", required: true }, { name: "o", type: "object", required: true, disposition: "private", fields: [] }, BLINDING]) },
    { label: "blinding false", spec: specOf(f({ type: "string", blinding: false })) },
    { label: "blinding as a string", spec: specOf([{ name: "v", type: "boolean", required: true, disposition: "private" }, { ...BLINDING, blinding: "true" }]) },
    { label: "blinding null", spec: specOf(f({ type: "string", blinding: null })) },
    ...[
        ["of type integer", { type: "integer", format: undefined }],
        ["of type enum", { type: "enum", values: ["a"], format: undefined }],
        ["with no format", { format: undefined }],
        ["of format bytes-hex", { format: "bytes-hex" }],
        ["not required", { required: false }],
        ["public", { disposition: "public" }],
        ["with no disposition", { disposition: undefined }],
        ["with a default", { default: B32 }],
        ["with a default of the wrong type", { default: 5 }],
    ].map(([label, change]) => ({
        label: `a blinding field ${label as string}`,
        spec: specOf([
            { name: "v", type: "boolean", required: true, disposition: "private" },
            JSON.parse(JSON.stringify({ ...BLINDING, ...(change as Field) })) as Field,
        ]),
    })),
    {
        label: "a blinding field nested in an object",
        spec: specOf([
            { name: "o", type: "object", required: true, disposition: "private", fields: [{ name: "v", type: "boolean", required: true, disposition: "private" }, BLINDING] },
            BLINDING,
        ]),
    },
    {
        label: "a blinding field as an array item",
        spec: specOf([
            { name: "a", type: "array", required: true, disposition: "private", items: { type: "string", format: "bytes32-hex", disposition: "private", blinding: true } },
            BLINDING,
        ]),
    },
    { label: "a private field nested in a public object", spec: specOf(f({ type: "object", fields: [{ name: "w", type: "boolean", required: true, disposition: "private" }] })) },
    // Each stage's set keeps the same rules.
    { label: "a private stage with its blinding field", spec: specOf(f({ type: "boolean" }), { 1: [{ name: "r", type: "integer", required: true, disposition: "private" }, BLINDING] }) },
    { label: "a private stage without a blinding field", spec: specOf(f({ type: "boolean" }), { 1: [{ name: "r", type: "integer", required: true, disposition: "private" }] }) },
    { label: "a mixed stage", spec: specOf(f({ type: "boolean" }), { 1: [{ name: "r", type: "integer", required: true, disposition: "private" }, { name: "n", type: "string", required: true }, BLINDING] }) },
    { label: "a public stage with a blinding field", spec: specOf(f({ type: "boolean" }), { 2: [{ name: "n", type: "string", required: true }, BLINDING] }) },
    { label: "an empty stage", spec: specOf(f({ type: "boolean" }), { 1: [] }) },
];

/** Encoded bytes for the values whose bytes a verdict alone does not show. */
const ENCODE_CASES: { label: string; fields: Field[]; stages?: Record<number, Field[]>; stage?: number; content: Record<string, unknown> }[] = [
    // A blinding value encodes as bytes32 in a private set; `prover/lib`'s
    // tests read these two cases' bytes as a TypeScript content reference.
    {
        label: "a private set with its blinding value",
        fields: [{ name: "grade", type: "enum", values: ["a", "b", "c"], required: true, disposition: "private" }, BLINDING],
        content: { grade: "b", b: B32 },
    },
    {
        label: "a private stage with its blinding value",
        fields: [{ name: "note", type: "string", required: true }],
        stages: { 1: [{ name: "reading", type: "integer", required: true, disposition: "private" }, BLINDING] },
        stage: 1,
        content: { reading: 42, b: `0x${"cd".repeat(32)}` },
    },
    // A spec that declares `stages["0"]` encodes stage-0 content over that set.
    {
        label: "a stage-0 set",
        fields: [{ name: "note", type: "string", required: true }],
        stages: { 0: [{ name: "reading", type: "integer", required: true }] },
        stage: 0,
        content: { reading: 7 },
    },
    { label: "a public geohash at the cap", fields: [str({ format: "geohash" })], content: { v: "dr5reg" } },
    { label: "bytes-hex empty", fields: [str({ format: "bytes-hex" })], content: { v: "0x" } },
    { label: "bytes-hex one byte", fields: [str({ format: "bytes-hex" })], content: { v: "0x00" } },
    { label: "bytes-hex 01", fields: [str({ format: "bytes-hex" })], content: { v: "0x01" } },
    { label: "bytes-hex long", fields: [str({ format: "bytes-hex" })], content: { v: `0x${"ab".repeat(40)}` } },
    { label: "bytes-hex upper", fields: [str({ format: "bytes-hex" })], content: { v: "0xABCD" } },
    { label: "bigint leading zeros", fields: [{ name: "v", type: "bigint", required: true }], content: { v: "007" } },
    { label: "integer negative", fields: [{ name: "v", type: "integer", required: true }], content: { v: -273 } },
    { label: "integer safe max", fields: [{ name: "v", type: "integer", required: true }], content: { v: 9007199254740991 } },
    { label: "string outside ASCII", fields: [str()], content: { v: "é🚚" } },
];

// ── The fixture ─────────────────────────────────────────────────────────────

function verdict(fields: unknown, content: unknown): boolean | null {
    const parsed = parseClauseSpec(specOf(fields));
    if (!parsed.ok) return null;
    return validateContent(content, parsed.spec).ok;
}

function build() {
    return {
        values: VALUE_CASES.flatMap(({ group, field, values }) =>
            values.map((value) => ({ group, field, value, ok: verdict([field], { v: value }) })),
        ),
        contents: CONTENT_CASES.map(({ label, fields, content }) => ({ label, fields, content, ok: verdict(fields, content) })),
        specs: SPEC_CASES.map(({ label, spec }) => ({ label, spec, ok: parseClauseSpec(spec).ok })),
        encodings: ENCODE_CASES.map(({ label, fields, stages, stage, content }) => {
            const parsed = parseClauseSpec(specOf(fields, stages));
            if (!parsed.ok) throw new Error(`encode case ${label}: the spec does not parse`);
            const options = stage === undefined ? {} : { stage };
            if (!validateContent(content, parsed.spec, options).ok) throw new Error(`encode case ${label}: the content does not validate`);
            return { label, fields, stages, stage, content, encoded: encodeContentFromSpec(parsed.spec, content, options) };
        }),
    };
}

describe("Clause-engine vectors — the hand-written leg of the clause-engine lock", () => {
    if (process.env.HARVEST_CLAUSE_ENGINE_VECTORS === "1") {
        it("regenerates test/fixtures/clause-engine-vectors.json", () => {
            mkdirSync(path.dirname(FIXTURE_PATH), { recursive: true });
            writeFileSync(FIXTURE_PATH, `${JSON.stringify(build(), null, 1)}\n`);
        });
        return;
    }

    it("Layer A reproduces the frozen verdicts byte-for-byte", () => {
        expect(existsSync(FIXTURE_PATH), "fixture missing — harvest with HARVEST_CLAUSE_ENGINE_VECTORS=1").toBe(true);
        expect(`${JSON.stringify(build(), null, 1)}\n`).toBe(readFileSync(FIXTURE_PATH, "utf8"));
    });

    it("the vectors hold both verdicts in every group that can have both", () => {
        const built = build();
        expect(built.values.some((c) => c.ok === true)).toBe(true);
        expect(built.values.some((c) => c.ok === false)).toBe(true);
        // `null`: the field's own spec does not parse — a pattern outside the
        // portable core, which both engines refuse before any value is read.
        expect(built.values.some((c) => c.ok === null)).toBe(true);
        expect(
            built.values.filter((c) => c.ok === null).every((c) => "pattern" in c.field),
            "only a pattern makes a value case's spec unparseable",
        ).toBe(true);
        expect(built.specs.some((c) => c.ok)).toBe(true);
        expect(built.specs.some((c) => !c.ok)).toBe(true);
    });

    it("a stage key parses only as the decimal of an integer 0..255, and a refusal names the key", () => {
        const accepted = new Set(["0", "1", "255"]);
        for (const key of ["0", "1", "255", "01", "00", "+1", " 1", "1 ", "1.0", "0x1", "-0", "", "256", "1e1", "١", "a"]) {
            const parsed = parseClauseSpec(specOf(f({ type: "boolean" }), { [key]: f({ type: "integer" }) }));
            expect(parsed.ok, `stage key ${JSON.stringify(key)}`).toBe(accepted.has(key));
            if (!parsed.ok) expect(parsed.errors.map((e) => e.path)).toContain(`$.stages.${key}`);
        }
    });
});

/**
 * The rules the SDK applies that the guest's engine does not. The list is
 * empty: the guest's engine applies every rule of the spec format and of
 * content validation, the grain cap and the private set's rules among them,
 * and the frozen vectors hold cases of each, both verdicts.
 */
const SDK_ONLY_RULES: readonly string[] = [];

describe("The rules both engines apply", () => {
    it("lists no rule that is the SDK's alone", () => {
        expect(SDK_ONLY_RULES).toHaveLength(0);
    });

    it("the frozen vectors hold the grain cap, the disposition, formatFromField and the blinding field, each with both verdicts", () => {
        const built = build();
        const holds = (needle: RegExp, ok: boolean) =>
            [...built.values.map((c) => ({ text: JSON.stringify(c.field), ok: c.ok })),
             ...built.contents.map((c) => ({ text: JSON.stringify(c.fields), ok: c.ok })),
             ...built.specs.map((c) => ({ text: JSON.stringify(c.spec), ok: c.ok }))]
                .some((c) => needle.test(c.text) && c.ok === ok);
        for (const needle of [/"geohash"/, /"disposition":"private"/, /"formatFromField"/, /"blinding":true/]) {
            expect(holds(needle, true), `${needle} accepted`).toBe(true);
            expect(holds(needle, false), `${needle} refused`).toBe(true);
        }
    });
});
